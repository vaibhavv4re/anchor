/**
 * Forensic Certification Suite: Authoritative Sale Consumption & Reversal Engine
 * Tests Model B trigger lifecycle, PostgreSQL atomic boundary, idempotency, shortage guard, and reversals.
 */

import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { orderModel } from '../businessos/platform/ordering/orderModel.js';
import { inventoryConsumptionService } from '../businessos/platform/inventory/inventoryConsumptionService.js';

const TENANT_ID = 'tenant_h0qc7wf';

async function runCertification() {
  console.log('======================================================================');
  console.log('🔬 STARTING AUTHORITATIVE INVENTORY CONSUMPTION CERTIFICATION SUITE');
  console.log('======================================================================\n');

  // 1. Initialize Cloud Stack & DataGateway
  const supabase = new SupabaseClient();
  const adapter = new SupabaseDataAdapter(supabase);
  const dataGateway = new DataGateway({ cloudAdapter: adapter, isOnline: true });

  // Inject into service and global app context
  inventoryConsumptionService.dataGateway = dataGateway;
  if (typeof globalThis !== 'undefined') {
    globalThis.__APP__ = { platform: { dataGateway } };
  }

  // Hydrate offlineStore with live Supabase collections
  console.log('1. Hydrating collections from Supabase...');
  const collectionsToHydrate = [
    'kitchen_menu_items',
    'recipes',
    'recipe_ingredients',
    'stock_balances',
    'orders',
    'stock_operations',
    'stock_transactions'
  ];

  for (const col of collectionsToHydrate) {
    const res = await adapter.getCollection(col, TENANT_ID);
    const rows = res.success ? (res.data || []) : [];
    offlineStore.setCollection(col, rows);
    console.log(`   - Hydrated ${col}: ${rows.length} records`);
  }

  // Helper to fetch live balance from Supabase
  async function getLiveBalance(itemCode, locationCode) {
    const res = await supabase.fetchTableData('stock_balances');
    const rows = res.data || [];
    return rows.find(r => (r.item_code === itemCode || r.itemCode === itemCode) && (r.location_code === locationCode || r.locationCode === locationCode));
  }

  // 2. Verify Initial Baseline
  console.log('\n2. Verifying Initial Baseline (RM0310 @ LOC-886)...');
  let bal = await getLiveBalance('RM0310', 'LOC-886');
  console.log(`   Live balance: SQL qty=${bal?.quantity}, data qty=${bal?.data?.quantity}, val=${bal?.valuation}`);
  if (parseFloat(bal.quantity) !== 5.0 || parseFloat(bal.data?.quantity) !== 5.0) {
    console.log('   Resetting baseline balance to 5.0000 KG...');
    await supabase.updateRecord('stock_balances', bal.id, {
      quantity: 5.0,
      valuation: 150.0,
      data: { ...(bal.data || {}), quantity: 5.0, valuation: 150.0 }
    });
    bal = await getLiveBalance('RM0310', 'LOC-886');
    console.log(`   Reset complete: SQL qty=${bal?.quantity}, data qty=${bal?.data?.quantity}`);
  }

  // ==========================================================================
  // TEST SCENARIO 1: MODEL B TRIGGERING & EXACT 0.4 KG DEDUCTION
  // ==========================================================================
  console.log('\n======================================================================');
  console.log('TEST 1: Model B Triggering & Exact Consumption (Tomato Soup × 2)');
  console.log('======================================================================');

  // Step 1A: Place order with Tomato Soup × 2
  console.log('Step 1A: Waiter places & confirms order for Tomato Soup × 2...');
  const order = orderModel.createOrder({
    tableNumber: 5,
    waiterId: 'emp-waiter-01',
    items: [
      {
        itemId: 'menu-item-sou-005',
        itemCode: 'MENU-SOU-005',
        name: 'Tomato Soup',
        quantity: 2,
        price: 210,
        recipeId: 'rcp-ajgdpxm'
      }
    ],
    subtotal: 420,
    tenantId: TENANT_ID
  });

  const orderId = order.id;
  const lineItem = order.items[0];
  const orderLineId = lineItem.lineItemId;
  console.log(`   Order created: ${order.orderNumber} (ID: ${orderId})`);
  console.log(`   Order status: ${order.status}`);
  console.log(`   Line item: ${lineItem.name} × ${lineItem.quantity} (LineID: ${orderLineId}, status: ${lineItem.itemStatus})`);

  // Assert Step 1A: Verify stock balance is STILL 5.0 KG (Zero deduction at confirmation)
  bal = await getLiveBalance('RM0310', 'LOC-886');
  console.log(`   Stock balance after order:confirmed: ${bal.quantity} KG (data: ${bal.data?.quantity} KG)`);
  if (parseFloat(bal.quantity) !== 5.0 || parseFloat(bal.data?.quantity) !== 5.0) {
    throw new Error(`FAIL: Stock was prematurely deducted on order:confirmed! Expected 5.0, got ${bal.quantity}`);
  }
  console.log('   ✅ PASS: Model B verified — Zero stock movement at order:confirmed.');

  // Step 1B: Chef marks item READY in KDS
  console.log('\nStep 1B: Chef marks line item READY in KDS...');
  // Find ticket
  const allTickets = orderModel.getAllTickets(TENANT_ID);
  const kotTicket = allTickets.find(t => t.orderId === orderId || (t.items || []).some(i => i.lineItemId === orderLineId));
  if (!kotTicket) throw new Error(`Could not find KOT ticket for order ${orderId}`);
  console.log(`   Found KOT ticket: ${kotTicket.ticketId}, current status: ${kotTicket.status}`);

  // Transition line item to READY
  const updateRes = orderModel.updateTicketItemStatus(kotTicket.ticketId, orderLineId, 'READY', TENANT_ID);
  console.log(`   Transition executed: itemStatus=${updateRes.item?.itemStatus}, ticketStatus=${updateRes.ticket?.status}`);

  // Wait 1.5s for async persistence
  await new Promise(r => setTimeout(r, 1500));

  // Assert Step 1B: Verify stock balance is now exactly 4.6 KG
  bal = await getLiveBalance('RM0310', 'LOC-886');
  console.log(`   Stock balance after READY: SQL qty=${bal.quantity} KG, data qty=${bal.data?.quantity} KG, valuation=${bal.valuation}`);
  if (Math.abs(parseFloat(bal.quantity) - 4.6) > 0.0001 || Math.abs(parseFloat(bal.data?.quantity) - 4.6) > 0.0001) {
    throw new Error(`FAIL: Stock deduction incorrect! Expected 4.6000 KG, got ${bal.quantity} (data: ${bal.data?.quantity})`);
  }
  console.log('   ✅ PASS: Exact 0.4000 KG deduction confirmed (5.0000 -> 4.6000 KG).');

  async function getOperations() {
    const cloud = await supabase.fetchTableData('stock_operations');
    if (cloud.success && Array.isArray(cloud.data) && cloud.data.length > 0) return cloud.data;
    return offlineStore.getCollection('stock_operations') || [];
  }

  async function getTransactions() {
    const cloud = await supabase.fetchTableData('stock_transactions');
    if (cloud.success && Array.isArray(cloud.data) && cloud.data.length > 0) return cloud.data;
    return offlineStore.getCollection('stock_transactions') || [];
  }

  // Verify stock_operations header
  const expectedOpId = `cons_${TENANT_ID}_${orderId}_${orderLineId}`;
  const opsList = await getOperations();
  const opRow = opsList.find(o => o.operation_id === expectedOpId || o.operationId === expectedOpId);
  console.log(`   stock_operations row: found=${!!opRow}, status=${opRow?.status}, opType=${opRow?.operation_type || opRow?.operationType}`);
  if (!opRow) throw new Error(`FAIL: stock_operations row not found for ${expectedOpId}`);
  console.log('   ✅ PASS: stock_operations audit header verified.');

  // Verify stock_transactions movement line
  const txnsList = await getTransactions();
  const txnRow = txnsList.find(t => (t.operation_id === expectedOpId || t.operationId === expectedOpId) && (t.item_code === 'RM0310' || t.itemCode === 'RM0310'));
  console.log(`   stock_transactions row: found=${!!txnRow}, qty=${txnRow?.quantity}, type=${txnRow?.transaction_type || txnRow?.transactionType}, loc=${txnRow?.location_code || txnRow?.locationCode}`);
  if (!txnRow || Math.abs(parseFloat(txnRow.quantity) - (-0.4)) > 0.0001) {
    throw new Error(`FAIL: stock_transactions row missing or incorrect quantity! Expected -0.4, got ${txnRow?.quantity}`);
  }
  console.log('   ✅ PASS: Durable append-only ledger line verified (-0.4000 KG).');

  // ==========================================================================
  // TEST SCENARIO 2: DETERMINISTIC IDEMPOTENCY PROTECTION
  // ==========================================================================
  console.log('\n======================================================================');
  console.log('TEST 2: Deterministic Idempotency Protection (Replay)');
  console.log('======================================================================');

  console.log('Simulating duplicate call (network replay / double-click) for same operation...');
  const replayResult = await inventoryConsumptionService.consumeForOrderLine({
    tenantId: TENANT_ID,
    orderId,
    orderLineId,
    item: lineItem,
    performedBy: 'Chef Replay'
  });

  console.log('   Replay response:', replayResult);
  if (!replayResult.idempotentReplay) {
    throw new Error(`FAIL: Expected idempotentReplay: true, got ${JSON.stringify(replayResult)}`);
  }

  // Verify stock balance remains strictly 4.6 KG
  bal = await getLiveBalance('RM0310', 'LOC-886');
  console.log(`   Stock balance after replay: SQL qty=${bal.quantity} KG, data qty=${bal.data?.quantity} KG`);
  if (Math.abs(parseFloat(bal.quantity) - 4.6) > 0.0001) {
    throw new Error(`FAIL: Idempotency breached! Stock deducted again to ${bal.quantity}`);
  }

  // Verify no duplicate transactions
  const allTxnsAfterReplay = await getTransactions();
  const matchingTxns = allTxnsAfterReplay.filter(t => (t.operation_id === expectedOpId || t.operationId === expectedOpId));
  console.log(`   Matching transactions for ${expectedOpId}: ${matchingTxns.length}`);
  if (matchingTxns.length !== 1) {
    throw new Error(`FAIL: Duplicate transaction inserted! Count=${matchingTxns.length}`);
  }
  console.log('   ✅ PASS: Idempotency guaranteed. Replay produced zero duplicate movement.');

  // ==========================================================================
  // TEST SCENARIO 3: ALL-OR-NOTHING SHORTAGE GUARD
  // ==========================================================================
  console.log('\n======================================================================');
  console.log('TEST 3: All-or-Nothing Shortage Guard (50 Portions = 10 KG required vs 4.6 KG avail)');
  console.log('======================================================================');

  const shortageOrder = orderModel.createOrder({
    tableNumber: 9,
    waiterId: 'emp-waiter-01',
    items: [
      {
        itemId: 'menu-item-sou-005',
        itemCode: 'MENU-SOU-005',
        name: 'Tomato Soup',
        quantity: 50, // 50 * 0.2 = 10 KG required!
        price: 210,
        recipeId: 'rcp-ajgdpxm'
      }
    ],
    subtotal: 10500,
    tenantId: TENANT_ID
  });

  const shortageLineItem = shortageOrder.items[0];
  console.log(`   Created high-volume order ${shortageOrder.orderNumber} for 50 portions (needs 10.0 KG).`);

  let shortageCaught = false;
  try {
    await inventoryConsumptionService.consumeForOrderLine({
      tenantId: TENANT_ID,
      orderId: shortageOrder.id,
      orderLineId: shortageLineItem.lineItemId,
      item: shortageLineItem,
      performedBy: 'Chef'
    });
  } catch (err) {
    shortageCaught = true;
    console.log(`   Caught expected shortage error: "${err.message}"`);
    if (!err.message.includes('INSUFFICIENT_STOCK')) {
      throw new Error(`Expected INSUFFICIENT_STOCK error, got: ${err.message}`);
    }
  }

  if (!shortageCaught) {
    throw new Error(`FAIL: Expected shortage error was NOT thrown!`);
  }

  // Verify balance is completely unchanged at 4.6 KG
  bal = await getLiveBalance('RM0310', 'LOC-886');
  console.log(`   Stock balance after rejected shortage: ${bal.quantity} KG`);
  if (Math.abs(parseFloat(bal.quantity) - 4.6) > 0.0001) {
    throw new Error(`FAIL: Balance was partially deducted on shortage! Balance=${bal.quantity}`);
  }
  console.log('   ✅ PASS: All-or-nothing shortage guard prevented partial deduction.');

  // ==========================================================================
  // TEST SCENARIO 4: REVERSAL & VOID COMPENSATION
  // ==========================================================================
  console.log('\n======================================================================');
  console.log('TEST 4: Reversal & Void Compensation (+0.4 KG Restoration)');
  console.log('======================================================================');

  console.log('Voiding original Tomato Soup × 2 item (Order ID: ' + orderId + ')...');
  await orderModel.voidOrderItem(orderId, orderLineId, 'CUSTOMER_CHANGED_MIND', TENANT_ID);

  await new Promise(r => setTimeout(r, 1500));

  // Assert Step 4A: Balance restored to 5.0 KG
  bal = await getLiveBalance('RM0310', 'LOC-886');
  console.log(`   Stock balance after VOID: SQL qty=${bal.quantity} KG, data qty=${bal.data?.quantity} KG, valuation=${bal.valuation}`);
  if (Math.abs(parseFloat(bal.quantity) - 5.0) > 0.0001 || Math.abs(parseFloat(bal.data?.quantity) - 5.0) > 0.0001) {
    throw new Error(`FAIL: Reversal balance restoration failed! Expected 5.0000 KG, got ${bal.quantity}`);
  }
  console.log('   ✅ PASS: Exact 0.4000 KG restored to stock balance (4.6000 -> 5.0000 KG).');

  // Verify reversal operation header
  const expectedRevOpId = `rev_${TENANT_ID}_${orderId}_${orderLineId}`;
  const opsListAfterRev = await getOperations();
  const revOpRow = opsListAfterRev.find(o => o.operation_id === expectedRevOpId || o.operationId === expectedRevOpId);
  console.log(`   stock_operations reversal row: found=${!!revOpRow}, opType=${revOpRow?.operation_type || revOpRow?.operationType}`);
  if (!revOpRow) throw new Error(`FAIL: Reversal operation header not found!`);
  console.log('   ✅ PASS: Reversal operation header confirmed.');

  // Verify compensating transaction row
  const txnsListAfterRev = await getTransactions();
  const revTxnRow = txnsListAfterRev.find(t => (t.operation_id === expectedRevOpId || t.operationId === expectedRevOpId));
  console.log(`   Compensating transaction row: found=${!!revTxnRow}, qty=${revTxnRow?.quantity}, type=${revTxnRow?.transaction_type || revTxnRow?.transactionType}`);
  if (!revTxnRow || Math.abs(parseFloat(revTxnRow.quantity) - 0.4) > 0.0001) {
    throw new Error(`FAIL: Compensating transaction incorrect! Expected +0.4, got ${revTxnRow?.quantity}`);
  }
  console.log('   ✅ PASS: Compensating transaction verified with positive quantity (+0.4000 KG).');

  // Step 4B: Double-Reversal Guard
  console.log('\nTesting Double-Reversal Guard (Replaying reversal)...');
  const replayRevResult = await inventoryConsumptionService.reverseConsumptionForOrderLine({
    tenantId: TENANT_ID,
    orderId,
    orderLineId,
    reason: 'DUPLICATE_REVERSAL_TEST'
  });

  console.log('   Replay reversal response:', replayRevResult);
  if (!replayRevResult.idempotentReplay) {
    throw new Error(`FAIL: Expected idempotentReplay: true on double-reversal!`);
  }

  bal = await getLiveBalance('RM0310', 'LOC-886');
  console.log(`   Stock balance after replay reversal: ${bal.quantity} KG`);
  if (Math.abs(parseFloat(bal.quantity) - 5.0) > 0.0001) {
    throw new Error(`FAIL: Stock balance increased on double-reversal! Qty=${bal.quantity}`);
  }
  console.log('   ✅ PASS: Double-reversal prevented. Balance stayed strictly at 5.0000 KG.');

  console.log('\n======================================================================');
  console.log('🎉 ALL 4 FORENSIC CERTIFICATION TESTS PASSED WITH 100% COMPLIANCE!');
  console.log('======================================================================');
}

runCertification().catch(err => {
  console.error('\n❌ CERTIFICATION FAILED:', err);
  process.exit(1);
});
