import { createApplication } from '../restaurantos/frontend/bootstrap.js';
import { PhysicalTableStates } from '../businessos/platform/table_state/tableStateMachine.js';
import { SessionMilestones } from '../businessos/platform/session/sessionStateMachine.js';

console.log('====================================================================');
console.log('W2 VERIFICATION SUITE: DEDICATED WAITER WORKSPACE SHELL & WORKFLOW');
console.log('====================================================================\n');

async function runW2TestSuite() {
  let passedCount = 0;
  let totalCount = 0;

  function assert(condition, testName) {
    totalCount++;
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
    }
  }

  try {
    const targetTenantId = 'tenant_h0qc7wf';

    const mockOfflineStore = {
      collections: {
        tenants: [
          { tenant_id: targetTenantId, name: 'Anchor Bistro & Cafe', admin_name: 'Jitu' }
        ],
        identities: [],
        employees: [
          { id: 'emp-6rh56', identity_id: 'id-7hfgy', tenant_id: targetTenantId, employee_code: 'EMP-00003', name: 'Suresh', role_id: 'role-waiter', workspace_default: 'waiter', status: 'ACTIVE', data: { pinDisplay: '222222' } }
        ],
        dining_areas: [
          { id: 'area-ac', tenant_id: targetTenantId, area_code: 'AC', area_name: 'AC Hall', area_type: 'AC_HALL', status: 'OPEN' }
        ],
        tables_master: [
          { id: 'tbl_1', table_number: 1, table_code: 'T-01', area_id: 'area-ac', seats: 2, max_seats: 4, is_mergeable: true, tenant_id: targetTenantId },
          { id: 'tbl_2', table_number: 2, table_code: 'T-02', area_id: 'area-ac', seats: 4, max_seats: 6, is_mergeable: true, tenant_id: targetTenantId },
          { id: 'tbl_3', table_number: 3, table_code: 'T-03', area_id: 'area-ac', seats: 4, max_seats: 6, is_mergeable: true, tenant_id: targetTenantId },
          { id: 'tbl_4', table_number: 4, table_code: 'T-04', area_id: 'area-ac', seats: 4, max_seats: 6, is_mergeable: true, tenant_id: targetTenantId }
        ],
        kitchen_menu_items: [
          { id: 'dish-1', item_code: 'D-01', item_name: 'Murg Ghee Roast', selling_price: 360, category: 'MAINS - COASTAL CURRIES', routing: 'KITCHEN_LINE' },
          { id: 'dish-2', item_code: 'D-02', item_name: 'Kokum Solkadhi', selling_price: 120, category: 'BEVERAGES & BAR', routing: 'BAR_LINE' }
        ],
        table_sessions: [],
        table_runtime_states: [],
        orders: [],
        tickets: [],
        roles: [],
        sessions: []
      },
      getCollection(name) { return this.collections[name] || []; },
      setCollection(name, data) { this.collections[name] = data; },
      appendItem(name, item) { (this.collections[name] = this.collections[name] || []).push(item); return item; }
    };

    const appGraph = createApplication({
      offlineStore: mockOfflineStore,
      isOnline: true
    });

    const authEngine = appGraph.application.authEngine;

    // Dynamically import platform singletons & WaiterWorkspaceView
    const { sessionModel } = await import('../businessos/platform/session/sessionModel.js');
    const { tableStateMachine } = await import('../businessos/platform/table_state/tableStateMachine.js');
    const { tableProjectionService } = await import('../businessos/platform/table_state/tableProjectionService.js');
    const { sessionProjectionService } = await import('../businessos/platform/session/sessionProjectionService.js');
    const { sessionStateMachine } = await import('../businessos/platform/session/sessionStateMachine.js');
    const { orderModel } = await import('../businessos/platform/ordering/orderModel.js');
    const { productionRoutingEngine } = await import('../businessos/platform/ordering/productionRoutingEngine.js');
    const { WaiterWorkspaceView } = await import('../restaurantos/frontend/capabilities/guest_service/ui/WaiterWorkspaceView.js');

    // 1. Authenticate Waiter Suresh
    console.log('1. Waiter Authentication & Workspace Resolution');
    const authRes = await authEngine.authenticate('222222');
    assert(authRes.success === true, 'PIN 222222 authenticates successfully');
    assert(authRes.session.employeeName === 'Suresh', 'Resolved employee name is Suresh');
    assert(authRes.session.roleId === 'role-waiter', 'Resolved role is role-waiter');
    assert(authRes.session.workspace === 'waiter', 'Resolved workspace is waiter');

    // 2. Instantiate WaiterWorkspaceView
    console.log('\n2. Waiter Workspace Shell & Initial State');
    const waiterWorkspace = new WaiterWorkspaceView({
      authEngine,
      dataGateway: appGraph.application.dataGateway
    });
    assert(waiterWorkspace.activeSubView === 'floor', 'Default landing view is strictly Floor & Tables (floor)');
    
    const initialMySessions = waiterWorkspace.getMyActiveSessions(authRes.session.employeeId, targetTenantId);
    assert(initialMySessions.length === 0, 'Initially 0 active tables assigned to Suresh');

    const initialReadyTickets = waiterWorkspace.getReadyTickets(targetTenantId);
    assert(initialReadyTickets.length === 0, 'Initially 0 ready tickets in kitchen queue');

    // 3. Seat Guests on Table 04
    console.log('\n3. Seat Guests on Table 04 via Waiter Workspace');
    const createdSession = sessionModel.createSession({
      tableNumber: 4,
      guestCount: 2,
      assignedWaiterId: authRes.session.employeeId,
      guestNotes: 'Near window, anniversary celebration',
      dietaryTags: ['Vegan'],
      celebrationFlag: 'Anniversary',
      tenantId: targetTenantId
    });

    tableStateMachine.transitionTableState(4, PhysicalTableStates.OCCUPIED, {
      sessionId: createdSession.id,
      waiterId: authRes.session.employeeId
    });

    const updatedMySessions = waiterWorkspace.getMyActiveSessions(authRes.session.employeeId, targetTenantId);
    assert(updatedMySessions.length === 1, 'My Active Tables counter dynamically incremented to 1');
    assert(updatedMySessions[0].tableNumber === 4, 'Assigned table is Table 04');

    // 4. Place Live Order
    console.log('\n4. Live Order Placement & KOT/BOT Dispatch');
    const orderItems = [
      { id: 'dish-1', name: 'Murg Ghee Roast', price: 360, quantity: 1, routing: 'KITCHEN_LINE' },
      { id: 'dish-2', name: 'Kokum Solkadhi', price: 120, quantity: 1, routing: 'BAR_LINE' }
    ];

    const createdOrder = orderModel.createOrder({
      sessionId: createdSession.id,
      tableNumber: 4,
      tableCode: 'T-04',
      waiterId: authRes.session.employeeId,
      tenantId: targetTenantId,
      items: orderItems,
      subtotal: 480
    });

    const tickets = productionRoutingEngine.routeOrderToProduction(createdOrder);
    assert(tickets.length === 2, 'Generated 1 KOT (Kitchen) and 1 BOT (Bar) ticket');

    const kotTicket = tickets.find(t => t.ticketType === 'KOT');
    assert(kotTicket.status === 'QUEUED', 'KOT initial status is QUEUED');

    // 5. Chef moves KOT to READY
    console.log('\n5. Chef KDS Action & Live Ready Ticker');
    productionRoutingEngine.updateTicketStatus(kotTicket.id, 'READY');
    const readyTicketsAfterChef = waiterWorkspace.getReadyTickets(targetTenantId);
    assert(readyTicketsAfterChef.length === 1, 'Waiter Workspace detects 1 dish READY for pickup');
    assert(readyTicketsAfterChef[0].ticketId === kotTicket.ticketId, 'Ready ticket matches dispatched KOT ID');

    // 6. Complete Table Settlement Lifecycle
    console.log('\n6. Settlement Lifecycle (Generate Bill -> Close -> Clean -> Available)');
    sessionStateMachine.transitionMilestone(createdSession.id, SessionMilestones.BILL_GENERATED);
    tableStateMachine.transitionTableState(4, PhysicalTableStates.PAYMENT_PENDING);

    const billProj = tableProjectionService.getTableProjection(4);
    assert(billProj.physicalState === PhysicalTableStates.PAYMENT_PENDING, 'Table 04 state is PAYMENT_PENDING');

    sessionStateMachine.transitionMilestone(createdSession.id, SessionMilestones.CLOSED);
    tableStateMachine.transitionTableState(4, PhysicalTableStates.CLEANING);

    const cleanProj = tableProjectionService.getTableProjection(4);
    assert(cleanProj.physicalState === PhysicalTableStates.CLEANING, 'Table 04 state is CLEANING');

    tableStateMachine.transitionTableState(4, PhysicalTableStates.AVAILABLE);
    const finalProj = tableProjectionService.getTableProjection(4);
    assert(finalProj.physicalState === PhysicalTableStates.AVAILABLE, 'Table 04 returned to clean AVAILABLE state');

    const finalSessions = waiterWorkspace.getMyActiveSessions(authRes.session.employeeId, targetTenantId);
    assert(finalSessions.length === 0, 'My Active Tables counter returned to 0 after session closure');

    console.log('\n====================================================================');
    console.log(`W2 VERIFICATION RESULTS: ${passedCount}/${totalCount} TESTS PASSED (${((passedCount/totalCount)*100).toFixed(0)}%)`);
    console.log('====================================================================');
  } catch (err) {
    console.error('Test execution exception:', err);
  }
}

runW2TestSuite();
