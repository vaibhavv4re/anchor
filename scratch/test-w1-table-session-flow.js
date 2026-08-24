import { createApplication } from '../restaurantos/frontend/bootstrap.js';
import { PhysicalTableStates } from '../businessos/platform/table_state/tableStateMachine.js';
import { SessionMilestones } from '../businessos/platform/session/sessionStateMachine.js';

console.log('====================================================================');
console.log('W1 VERIFICATION SUITE: LIVE TABLE + GUEST SESSION RECONCILIATION');
console.log('====================================================================\n');

async function runW1TestSuite() {
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
          { id: 'emp-6rh56', identity_id: 'id-7hfgy', tenant_id: targetTenantId, employee_code: 'EMP-00003', name: 'Suresh', role_id: 'role-waiter', workspace_default: 'waiter', status: 'ACTIVE', data: { pinDisplay: '222222' } },
          { id: 'emp-eo32w', identity_id: 'id-x4qi6', tenant_id: targetTenantId, employee_code: 'EMP-00002', name: 'Aabhas', role_id: 'role-chef', workspace_default: 'kitchen', status: 'ACTIVE', data: { pinDisplay: '111111' } }
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

    const dataGateway = appGraph.application.dataGateway;
    const authEngine = appGraph.application.authEngine;

    // Dynamically import platform singletons
    const { sessionModel } = await import('../businessos/platform/session/sessionModel.js');
    const { tableStateMachine } = await import('../businessos/platform/table_state/tableStateMachine.js');
    const { tableProjectionService } = await import('../businessos/platform/table_state/tableProjectionService.js');
    const { sessionProjectionService } = await import('../businessos/platform/session/sessionProjectionService.js');
    const { sessionStateMachine } = await import('../businessos/platform/session/sessionStateMachine.js');
    const { orderModel } = await import('../businessos/platform/ordering/orderModel.js');
    const { productionRoutingEngine } = await import('../businessos/platform/ordering/productionRoutingEngine.js');

    // 1. GATE 1: Zero seeded runtime state
    console.log('1. GATE 1: Zero Seeded Runtime State & Clean Floor Baseline');
    const initialT4State = tableStateMachine.getTableRuntimeState(4);
    assert(initialT4State.currentState === PhysicalTableStates.AVAILABLE, 'Table 04 starts as AVAILABLE (no fake occupied state)');
    
    const initialProj = tableProjectionService.getTableProjection(4);
    assert(initialProj.physicalState === PhysicalTableStates.AVAILABLE, 'Table 04 projection reports AVAILABLE');
    assert(initialProj.primaryAction.type === 'SEAT_GUESTS', 'Table 04 primary action is SEAT_GUESTS');
    assert(initialProj.currentSessionId === null, 'Table 04 has null session ID');

    // 2. GATE 5: No fake session fallback
    console.log('\n2. GATE 5: No Fake Session Fallback (sess_1001 is purged)');
    const fakeSession = sessionModel.getSession('sess_1001');
    assert(fakeSession === null, 'sess_1001 is completely eliminated from sessionModel');
    const fakeProj = sessionProjectionService.getSessionProjection('sess_1001');
    assert(fakeProj === null, 'sessionProjectionService returns null for non-existent session');

    // 3. GATE 2: Real Waiter Authentication & Session Creation
    console.log('\n3. GATE 2: Real Waiter Authentication & Session Creation');
    const authRes = await authEngine.authenticate('222222');
    assert(authRes.success === true && authRes.session.employeeName === 'Suresh', 'Waiter Suresh authenticates successfully with PIN 222222');

    const createdSession = sessionModel.createSession({
      tableNumber: 4,
      guestCount: 3,
      assignedWaiterId: authRes.session.employeeId,
      guestNotes: 'Window table, anniversary celebration',
      dietaryTags: ['Gluten Free'],
      celebrationFlag: 'Anniversary',
      tenantId: targetTenantId
    });
    assert(createdSession.id && createdSession.id.startsWith('sess_'), `Session created with real ID: ${createdSession.id}`);
    assert(createdSession.tableNumber === 4, 'Session mapped to Table 04');
    assert(createdSession.assignedWaiterId === authRes.session.employeeId, 'Session assigned to Suresh');

    // Transition table to OCCUPIED
    tableStateMachine.transitionTableState(4, PhysicalTableStates.OCCUPIED, {
      sessionId: createdSession.id,
      waiterId: authRes.session.employeeId
    });

    // 4. GATE 4: Dynamic Table Lifecycle & Projection
    console.log('\n4. GATE 4: Dynamic Table Lifecycle & Projection');
    const occupiedState = tableStateMachine.getTableRuntimeState(4);
    assert(occupiedState.currentState === PhysicalTableStates.OCCUPIED, 'Table 04 runtime state is dynamically OCCUPIED');
    assert(occupiedState.currentSessionId === createdSession.id, 'Table 04 runtime references the active session ID');

    const occupiedProj = tableProjectionService.getTableProjection(4);
    assert(occupiedProj.physicalState === PhysicalTableStates.OCCUPIED, 'Table 04 projection shows OCCUPIED');
    assert(occupiedProj.primaryAction.type === 'OPEN_SESSION', 'Table 04 primary action is OPEN_SESSION');
    assert(occupiedProj.assignedWaiterName === 'Suresh', 'Table 04 projection resolves assigned waiter name Suresh');

    // 5. GATE 3: Real Order Placement & Session Projection Derivation
    console.log('\n5. GATE 3: Real Order Placement & Session Projection Derivation');
    const orderItems = [
      { id: 'dish-1', name: 'Murg Ghee Roast', price: 360, quantity: 1, routing: 'KITCHEN_LINE' },
      { id: 'dish-2', name: 'Kokum Solkadhi', price: 120, quantity: 2, routing: 'BAR_LINE' }
    ];

    const createdOrder = orderModel.createOrder({
      sessionId: createdSession.id,
      tableNumber: 4,
      tableCode: 'T-04',
      waiterId: authRes.session.employeeId,
      tenantId: targetTenantId,
      items: orderItems,
      subtotal: 600
    });

    assert(createdOrder && createdOrder.orderId, `Order #${createdOrder.orderNumber || createdOrder.orderId} created successfully`);

    // Verify KOT/BOT split by productionRoutingEngine
    const dispatchedTickets = productionRoutingEngine.routeOrderToProduction(createdOrder);
    assert(dispatchedTickets.length === 2, `Production router generated 2 tickets: ${dispatchedTickets.map(t => t.ticketType).join(', ')}`);

    const kotTicket = dispatchedTickets.find(t => t.ticketType === 'KOT');
    const botTicket = dispatchedTickets.find(t => t.ticketType === 'BOT');
    assert(kotTicket && kotTicket.destination === 'KITCHEN', 'Food routed to KOT (KITCHEN)');
    assert(botTicket && botTicket.destination === 'BAR', 'Drinks routed to BOT (BAR)');

    // Verify session projection aggregates real items
    const sessionProj = sessionProjectionService.getSessionProjection(createdSession.id);
    assert(sessionProj.orderCount === 1, 'Session projection orderCount is 1');
    assert(sessionProj.foodItems.length === 1 && sessionProj.foodItems[0].name === 'Murg Ghee Roast', 'Session projection derives foodItems from KOT');
    assert(sessionProj.drinkItems.length === 1 && sessionProj.drinkItems[0].name === 'Kokum Solkadhi', 'Session projection derives drinkItems from BOT');
    assert(sessionProj.subtotal === 600, 'Session projection calculates accurate subtotal (₹600)');
    assert(sessionProj.readyItems.length === 0, 'No ready items before Chef updates');

    // 6. GATE 6: KDS Feedback into Waiter Workspace
    console.log('\n6. GATE 6: KDS Feedback into Waiter Workspace');
    productionRoutingEngine.updateTicketStatus(kotTicket.id, 'READY');
    const updatedSessionProj = sessionProjectionService.getSessionProjection(createdSession.id);
    assert(updatedSessionProj.readyItems.length === 1, 'Chef marks KOT READY → Session projection immediately reflects 1 readyItem');
    assert(updatedSessionProj.readyItems[0].name === 'Murg Ghee Roast', 'Ready item name is Murg Ghee Roast');

    // 7. Full Table Lifecycle: Billing → Cleaning → Available
    console.log('\n7. Table Lifecycle: Billing → Cleaning → Available');
    sessionStateMachine.transitionMilestone(createdSession.id, SessionMilestones.BILL_GENERATED);
    tableStateMachine.transitionTableState(4, PhysicalTableStates.PAYMENT_PENDING);

    const billProj = tableProjectionService.getTableProjection(4);
    assert(billProj.physicalState === PhysicalTableStates.PAYMENT_PENDING, 'Table 04 is PAYMENT_PENDING');
    assert(billProj.primaryAction.type === 'OPEN_BILL', 'Table 04 primary action is OPEN_BILL');

    sessionStateMachine.transitionMilestone(createdSession.id, SessionMilestones.CLOSED);
    tableStateMachine.transitionTableState(4, PhysicalTableStates.CLEANING);

    const cleanProj = tableProjectionService.getTableProjection(4);
    assert(cleanProj.physicalState === PhysicalTableStates.CLEANING, 'Table 04 is CLEANING');
    assert(cleanProj.primaryAction.type === 'MARK_CLEAN', 'Table 04 primary action is MARK_CLEAN');

    tableStateMachine.transitionTableState(4, PhysicalTableStates.AVAILABLE);
    const finalProj = tableProjectionService.getTableProjection(4);
    assert(finalProj.physicalState === PhysicalTableStates.AVAILABLE, 'Table 04 returned to AVAILABLE');
    assert(finalProj.primaryAction.type === 'SEAT_GUESTS', 'Table 04 ready to SEAT_GUESTS for next party');

    console.log('\n====================================================================');
    console.log(`W1 VERIFICATION RESULTS: ${passedCount}/${totalCount} TESTS PASSED (${((passedCount/totalCount)*100).toFixed(0)}%)`);
    console.log('====================================================================');
  } catch (err) {
    console.error('Test execution exception:', err);
  }
}

runW1TestSuite();
