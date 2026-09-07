import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { orderModel } from '../businessos/platform/ordering/orderModel.js';
import { productionRoutingEngine } from '../businessos/platform/ordering/productionRoutingEngine.js';
import { billRevisionModel } from '../businessos/platform/billing/billRevisionModel.js';
import { paymentModel } from '../businessos/platform/billing/paymentModel.js';
import { sessionModel } from '../businessos/platform/session/sessionModel.js';
import { sessionProjectionService } from '../businessos/platform/session/sessionProjectionService.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { sessionStateMachine, SessionMilestones } from '../businessos/platform/session/sessionStateMachine.js';
import { tableStateMachine, PhysicalTableStates } from '../businessos/platform/table_state/tableStateMachine.js';

const TENANT_ID = 'tenant_h0qc7wf';
const TEST_TIMESTAMP = Date.now();
const SYNTHETIC_SESSION_ID = `sess_test_rec_${TEST_TIMESTAMP}`;
const SYNTHETIC_ORDER_NO = `ORD-2026-T${String(TEST_TIMESTAMP).slice(-4)}`;
const SYNTHETIC_BILL_NO = `BILL-2026-T${String(TEST_TIMESTAMP).slice(-4)}`;
const SYNTHETIC_INV_NO = `INV/26-27/T${String(TEST_TIMESTAMP).slice(-4)}`;

const client = new SupabaseClient();
const adapter = new SupabaseDataAdapter(client);
const gateway = new DataGateway({ cloudAdapter: adapter });

// Wire global mock app environment for DataGateway access in models
globalThis.window = globalThis;
globalThis.__APP__ = {
  platform: {
    dataGateway: gateway
  }
};

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function query(table, filter = '') {
  const url = `${client.baseUrl}/${table}${filter ? '?' + filter : ''}`;
  const res = await fetch(url, { headers: client.getHeaders() });
  return await res.json();
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🚀 CERTIFICATION SUITE: LIFECYCLE RECONCILIATION & PERSISTENCE');
  console.log('════════════════════════════════════════════════════════════════\n');

  let initialStockQty = 0;
  let initialStockVal = 0;
  let syntheticOrderId = null;
  let syntheticOrderRowId = null;
  let createdTicket = null;
  let createdRevision = null;
  let createdPayment1 = null;
  let createdPayment2 = null;

  try {
    // 0. Baseline RM0310 check
    const balances = await query('stock_balances', 'item_code=eq.RM0310&location_code=eq.LOC-886');
    assert(balances.length > 0, 'RM0310 stock_balances row exists in LOC-886');
    initialStockQty = parseFloat(balances[0].quantity);
    initialStockVal = parseFloat(balances[0].valuation);
    console.log(`[Baseline] RM0310 @ LOC-886: Qty=${initialStockQty} KG, Valuation=₹${initialStockVal}\n`);

    // Hydrate domain collections for resolvedBomEngine
    console.log('[Setup] Hydrating recipes & menu collections from Supabase...');
    const menuRes = await adapter.getCollection('kitchen_menu_items', TENANT_ID);
    offlineStore.setCollection('kitchen_menu_items', menuRes.data || [], TENANT_ID);

    const recRes = await adapter.getCollection('recipes', TENANT_ID);
    const ingRes = await adapter.getCollection('recipe_ingredients', TENANT_ID);
    const rawIngredients = ingRes.data || [];
    const enrichedRecipes = (recRes.data || []).map(r => {
      const matchedIngs = rawIngredients.filter(i => (i.recipe_id === r.id || i.recipeId === r.id));
      return {
        ...r,
        ingredients: matchedIngs.map(i => ({
          inventoryItemCode: i.inventory_item_code || i.inventoryItemCode || i.item_code,
          inventoryItemName: i.inventory_item_name || i.inventoryItemName || i.item_name,
          quantity: parseFloat(i.quantity) || 0,
          uom: i.uom || 'KG'
        }))
      };
    });
    offlineStore.setCollection('recipes', enrichedRecipes, TENANT_ID);
    console.log(`  ✓ Hydrated ${menuRes.data?.length || 0} menu items and ${enrichedRecipes.length} recipes.\n`);

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Canonical Table Identity
    // ─────────────────────────────────────────────────────────────
    console.log('▶ [TEST 1] Canonical Table Identity (Table 9 -> AC-T-03)');
    const testSession = {
      id: SYNTHETIC_SESSION_ID,
      sessionId: SYNTHETIC_SESSION_ID,
      tableNumber: 9,
      table_number: 9,
      tableCode: 'AC-T-03',
      table_code: 'AC-T-03',
      status: 'GUESTS_SEATED',
      billStatus: 'UNBILLED',
      bill_status: 'UNBILLED',
      tenantId: TENANT_ID,
      tenant_id: TENANT_ID,
      createdAt: new Date().toISOString()
    };
    offlineStore.appendItem('table_sessions', testSession);
    await gateway.create('table_sessions', testSession);

    // Verify Session Projection
    const projection = sessionProjectionService.getSessionProjection(SYNTHETIC_SESSION_ID, TENANT_ID);
    assert(projection.tableCode === 'AC-T-03', `SessionProjection tableCode is canonical AC-T-03 (got: ${projection.tableCode})`);
    assert(projection.table_code === 'AC-T-03', `SessionProjection table_code is canonical AC-T-03 (got: ${projection.table_code})`);

    // Create Order with sessionId
    const orderItems = [
      {
        itemId: 'menu-item-sou-005',
        itemCode: 'MENU-SOU-005',
        name: 'Tomato Soup',
        itemName: 'Tomato Soup',
        price: 210,
        quantity: 1,
        recipeId: 'rcp-ajgdpxm',
        routing: 'KITCHEN_LINE',
        category: 'SOUPS'
      }
    ];

    const orderRecord = orderModel.createOrder({
      sessionId: SYNTHETIC_SESSION_ID,
      tableNumber: 9, // Pass 9, must resolve to AC-T-03
      tableCode: null,
      waiterId: 'emp-test',
      items: orderItems,
      subtotal: 210,
      tenantId: TENANT_ID,
      orderNumber: SYNTHETIC_ORDER_NO
    });

    syntheticOrderId = orderRecord.orderId;
    syntheticOrderRowId = orderRecord.id;

    assert(orderRecord.tableCode === 'AC-T-03', `orderModel.createOrder resolved canonical tableCode AC-T-03 (got: ${orderRecord.tableCode})`);
    assert(orderRecord.table_id === 'AC-T-03', `orderModel.createOrder resolved canonical table_id AC-T-03 (got: ${orderRecord.table_id})`);
    assert(orderRecord.status === 'CONFIRMED', 'Order is initially CONFIRMED');

    await sleep(600);

    // Verify Order in Supabase
    const cloudOrders = await query('orders', `order_number=eq.${SYNTHETIC_ORDER_NO}`);
    assert(cloudOrders.length === 1, 'Order persisted to Supabase orders table');
    assert(cloudOrders[0].table_id === 'AC-T-03', `Supabase orders table_id is AC-T-03 (got: ${cloudOrders[0].table_id})`);
    assert(cloudOrders[0].status === 'CONFIRMED', `Supabase orders status is CONFIRMED (got: ${cloudOrders[0].status})`);
    console.log('✅ Test 1 Passed: Table Identity AC-T-03 flows authoritatively.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: KOT Dispatch & Invariant Pre-READY Check
    // ─────────────────────────────────────────────────────────────
    console.log('▶ [TEST 2] KOT Dispatch & Pre-READY Stock Invariant');
    const tickets = offlineStore.getCollection('tickets', TENANT_ID) || [];
    createdTicket = tickets.find(t => t.orderId === syntheticOrderId || t.orderNumber === SYNTHETIC_ORDER_NO);
    assert(!!createdTicket, 'KOT ticket was automatically dispatched');
    assert(createdTicket.status === 'QUEUED', 'KOT ticket initial status is QUEUED');
    assert(createdTicket.tableCode === 'AC-T-03', 'KOT ticket inherited canonical tableCode AC-T-03');

    // Verify stock is strictly UNCHANGED
    const preBalances = await query('stock_balances', 'item_code=eq.RM0310&location_code=eq.LOC-886');
    assert(parseFloat(preBalances[0].quantity) === initialStockQty, 'Stock balance is completely unchanged at QUEUED state');
    console.log('✅ Test 2 Passed: Pre-READY stock invariant holds.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: READY Transition & Persistence
    // ─────────────────────────────────────────────────────────────
    console.log('▶ [TEST 3] READY Transition: Order Persistence & Model B Consumption');
    productionRoutingEngine.updateTicketStatus(createdTicket.ticketId, 'READY', TENANT_ID);

    await sleep(1000);

    // Verify Order in Supabase
    const readyCloudOrders = await query('orders', `order_number=eq.${SYNTHETIC_ORDER_NO}`);
    assert(readyCloudOrders.length === 1, 'Queried updated order in Supabase');
    assert(readyCloudOrders[0].status === 'READY', `Supabase orders.status became READY (got: ${readyCloudOrders[0].status})`);
    assert(readyCloudOrders[0].items[0].itemStatus === 'READY', `Supabase orders.items[0].itemStatus became READY (got: ${readyCloudOrders[0].items[0].itemStatus})`);

    // Verify Ledger Deduction in Supabase
    const readyBalances = await query('stock_balances', 'item_code=eq.RM0310&location_code=eq.LOC-886');
    const expectedQty = parseFloat((initialStockQty - 0.2).toFixed(4));
    assert(parseFloat(readyBalances[0].quantity) === expectedQty, `Stock deducted by 0.2000 KG: ${initialStockQty} -> ${readyBalances[0].quantity}`);
    assert(readyBalances[0].data && readyBalances[0].data.data === undefined, 'Stock balances data object has NO recursive data.data nesting');

    const ops = await query('stock_operations', `reference_id=eq.${syntheticOrderId}`);
    assert(ops.length === 1, 'Exactly one SALE_CONSUMPTION operation recorded in stock_operations');
    console.log('✅ Test 3 Passed: READY state persisted to Supabase orders and Model B ledger moved.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 4: SERVED Transition & Persistence
    // ─────────────────────────────────────────────────────────────
    console.log('▶ [TEST 4] SERVED Transition: Order Persistence with Zero Duplicate Stock Movement');
    productionRoutingEngine.updateTicketStatus(createdTicket.ticketId, 'SERVED', TENANT_ID);

    await sleep(1000);

    const servedCloudOrders = await query('orders', `order_number=eq.${SYNTHETIC_ORDER_NO}`);
    assert(servedCloudOrders[0].status === 'SERVED', `Supabase orders.status became SERVED (got: ${servedCloudOrders[0].status})`);
    assert(servedCloudOrders[0].items[0].itemStatus === 'SERVED', `Supabase orders.items[0].itemStatus became SERVED (got: ${servedCloudOrders[0].items[0].itemStatus})`);

    // Verify ZERO redundant deduction
    const servedBalances = await query('stock_balances', 'item_code=eq.RM0310&location_code=eq.LOC-886');
    assert(parseFloat(servedBalances[0].quantity) === expectedQty, 'Stock balance remained strictly unchanged upon SERVED transition');
    console.log('✅ Test 4 Passed: SERVED state persisted to Supabase orders with zero duplicate movement.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Bill Generation & Revision Persistence
    // ─────────────────────────────────────────────────────────────
    console.log('▶ [TEST 5] Bill Generation: Canonical Table Identity & UNPAID Baseline');
    createdRevision = billRevisionModel.createRevision({
      sessionId: SYNTHETIC_SESSION_ID,
      tableNumber: 9,
      tableCode: 'AC-T-03',
      items: orderItems,
      subtotal: 210,
      waiterId: 'emp-test',
      waiterName: 'Tester',
      tenantId: TENANT_ID
    });

    await sleep(600);

    const cloudBills = await query('bill_revisions', `session_id=eq.${SYNTHETIC_SESSION_ID}`);
    assert(cloudBills.length === 1, 'Bill revision persisted to Supabase bill_revisions table');
    assert(cloudBills[0].payment_status === 'UNPAID', `Supabase bill_revisions.payment_status is UNPAID (got: ${cloudBills[0].payment_status})`);
    assert(cloudBills[0].grand_total >= 210, `Supabase bill_revisions.grand_total is ${cloudBills[0].grand_total}`);
    const payableTotal = parseFloat(cloudBills[0].grand_total);
    console.log(`✅ Test 5 Passed: Bill generated with payable total ₹${payableTotal}.\n`);

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Partial Payment Refinement Check
    // ─────────────────────────────────────────────────────────────
    console.log('▶ [TEST 6] Partial Payment: Verification Guard Prevents Premature PAID');
    createdPayment1 = paymentModel.recordPayment({
      sessionId: SYNTHETIC_SESSION_ID,
      billNumber: createdRevision.billNumber,
      revisionNumber: createdRevision.revisionNumber,
      amount: 100, // Partial payment
      paymentMethod: 'CASH',
      receivedBy: 'emp-cashier',
      receivedByName: 'Cashier',
      tenantId: TENANT_ID
    });

    await sleep(600);

    const partialBill = await query('bill_revisions', `id=eq.${createdRevision.id}`);
    assert(partialBill[0].payment_status === 'PARTIALLY_PAID', `Partial payment correctly yielded PARTIALLY_PAID (got: ${partialBill[0].payment_status})`);

    const partialSession = await query('table_sessions', `id=eq.${SYNTHETIC_SESSION_ID}`);
    assert(partialSession[0].bill_status !== 'PAID', `Session bill_status is NOT prematurely set to PAID (got: ${partialSession[0].bill_status})`);
    console.log('✅ Test 6 Passed: Refinement guard verified - partial payment did NOT close bill.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Full Payment Settlement & Lockstep State Synchronization
    // ─────────────────────────────────────────────────────────────
    console.log('▶ [TEST 7] Full Payment Settlement: Lockstep Convergence to PAID');
    const remainingAmount = payableTotal - 100;
    createdPayment2 = paymentModel.recordPayment({
      sessionId: SYNTHETIC_SESSION_ID,
      billNumber: createdRevision.billNumber,
      revisionNumber: createdRevision.revisionNumber,
      amount: remainingAmount,
      paymentMethod: 'UPI',
      receivedBy: 'emp-cashier',
      receivedByName: 'Cashier',
      tenantId: TENANT_ID
    });

    await sleep(800);

    // Verify in Supabase
    const finalBill = await query('bill_revisions', `id=eq.${createdRevision.id}`);
    assert(finalBill[0].payment_status === 'PAID', `Supabase bill_revisions.payment_status is PAID (got: ${finalBill[0].payment_status})`);

    const finalSession = await query('table_sessions', `id=eq.${SYNTHETIC_SESSION_ID}`);
    assert(finalSession[0].bill_status === 'PAID', `Supabase table_sessions.bill_status is PAID (got: ${finalSession[0].bill_status})`);
    assert(finalSession[0].status === 'PAYMENT_RECEIVED', `Supabase table_sessions.status is PAYMENT_RECEIVED (got: ${finalSession[0].status})`);
    console.log('✅ Test 7 Passed: Settlement converged across bill_revisions and table_sessions.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Balance Data Integrity & No data.data Nesting
    // ─────────────────────────────────────────────────────────────
    console.log('▶ [TEST 8] Stock Balances data.data Cleanliness Check');
    const allBalances = await query('stock_balances');
    let anyNested = false;
    allBalances.forEach(b => {
      if (b.data && b.data.data !== undefined) anyNested = true;
    });
    assert(!anyNested, 'Strictly zero recursive data.data nesting across all stock_balances records in Supabase');
    console.log('✅ Test 8 Passed: stock_balances data structure is 100% clean.\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 9: Table Closure Lifecycle (PAID -> CLOSED -> CLEANING -> AVAILABLE)
    // ─────────────────────────────────────────────────────────────
    console.log('▶ [TEST 9] Table Closure Lifecycle: (PAID -> CLOSED -> CLEANING -> AVAILABLE)');
    const closeRes = sessionStateMachine.transitionMilestone(SYNTHETIC_SESSION_ID, SessionMilestones.CLOSED);
    assert(closeRes.success, 'Session milestone transitioned to CLOSED');

    await sleep(800);

    // Verify session status in Supabase
    const closedSession = await query('table_sessions', `id=eq.${SYNTHETIC_SESSION_ID}`);
    assert(closedSession[0].status === 'CLOSED', `Supabase table_sessions.status became CLOSED (got: ${closedSession[0].status})`);

    // Verify linked order status in Supabase
    const closedOrder = await query('orders', `order_number=eq.${SYNTHETIC_ORDER_NO}`);
    assert(closedOrder[0].status === 'CLOSED', `Supabase orders.status became CLOSED (got: ${closedOrder[0].status})`);

    // Verify table state machine transitioned to CLEANING
    const tblState = tableStateMachine.getTableRuntimeState(9);
    assert(tblState && tblState.currentState === PhysicalTableStates.CLEANING, `Table 9 state machine in CLEANING upon session close (got: ${tblState?.currentState})`);

    // Reset table state to AVAILABLE
    tableStateMachine.transitionTableState(9, PhysicalTableStates.AVAILABLE);
    const availState = tableStateMachine.getTableRuntimeState(9);
    assert(availState.currentState === PhysicalTableStates.AVAILABLE, 'Table 9 state machine returned to AVAILABLE');

    // Confirm no active session remains for table 9
    const activeForT9 = sessionModel.getActiveSessionForTable(9, TENANT_ID);
    assert(!activeForT9 || activeForT9.id !== SYNTHETIC_SESSION_ID, 'Table 9 has zero remaining active sessions');
    console.log('✅ Test 9 Passed: Full Closure lifecycle (CLOSED -> CLEANING -> AVAILABLE) verified in Supabase & runtime.\n');

    console.log('════════════════════════════════════════════════════════════════');
    console.log('🎉 ALL 9 LIFECYCLE CERTIFICATION GATES PASSED 100%');
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ Test execution failed with error:', err);
    throw err;
  } finally {
    console.log('🧹 [Cleanup] Purging synthetic test artifacts from live Supabase...');
    try {
      if (createdPayment1?.id) await client.deleteRecords('payments', `id=eq.${createdPayment1.id}`);
      if (createdPayment2?.id) await client.deleteRecords('payments', `id=eq.${createdPayment2.id}`);
      if (createdRevision?.id) await client.deleteRecords('bill_revisions', `id=eq.${createdRevision.id}`);
      if (syntheticOrderId) {
        await client.deleteRecords('stock_transactions', `reference_id=eq.${syntheticOrderId}`);
        await client.deleteRecords('stock_operations', `reference_id=eq.${syntheticOrderId}`);
        await client.deleteRecords('orders', `id=eq.${syntheticOrderRowId}`);
      }
      await client.deleteRecords('table_sessions', `id=eq.${SYNTHETIC_SESSION_ID}`);

      // Restore baseline stock balance
      if (initialStockQty > 0) {
        await client.updateRecord('stock_balances', 'sb-1788705000707-aa0r', {
          quantity: initialStockQty,
          valuation: initialStockVal,
          data: {
            id: 'sb-1788705000707-aa0r',
            itemCode: 'RM0310',
            quantity: initialStockQty,
            unitCost: 30,
            valuation: initialStockVal,
            locationCode: 'LOC-886',
            tenantId: TENANT_ID
          }
        });
        console.log(`  ✓ Restored RM0310 @ LOC-886 to baseline ${initialStockQty} KG / ₹${initialStockVal}`);
      }
      console.log('  ✓ Synthetic test artifacts purged completely.');
    } catch (cleanErr) {
      console.warn('  ⚠️ Cleanup error:', cleanErr.message);
    }
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
