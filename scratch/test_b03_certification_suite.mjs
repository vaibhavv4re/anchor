/**
 * Certification Suite for Phase B-03:
 * Bar Production Routing, BDS Lifecycle Integration & Deterministic Stock Deduction
 *
 * Validates All 8 Approved Gates (with 4A & 4B Split):
 *   Gate 1:  BOT Routing (Separate orders A, B, C routed to BAR BOT, QUEUED)
 *   Gate 2:  QUEUED State Invariant (Zero inventory movement)
 *   Gate 3:  PREPARING State Invariant (Zero inventory movement)
 *   Gate 4A: Singleton 60ml READY -> -0.060 LTR at LOC-314 (4.000 -> 3.940 LTR) via rpc_record_sale_consumption
 *   Gate 4B: Corona 330ml READY -> INSUFFICIENT_STOCK legitimate shortage, zero mutation
 *   Gate 5:  Missing Cocktail (Seaside Balcony) READY -> Hard safeguard SKIPPED (RECIPE_MISSING_DEDUCTION_DISABLED), zero mutation, zero stock_operations
 *   Gate 6:  Kitchen & Warehouse Isolation (LOC-886 & LOC-805 untouched)
 *   Gate 7:  Singleton READY Replay Idempotency (Zero duplicate deduction)
 *   Gate 8:  Singleton READY -> PREPARING Reversal (Undo) -> Exact restoration (3.940 -> 4.000 LTR) with SALE_REVERSAL lineage
 */

import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { orderModel } from '../businessos/platform/ordering/orderModel.js';
import { productionRoutingEngine } from '../businessos/platform/ordering/productionRoutingEngine.js';
import { inventoryConsumptionService, isBarInventorySku } from '../businessos/platform/inventory/inventoryConsumptionService.js';
import { resolveBarConsumption, BAR_SKU_MAP, BAR_COCKTAIL_CODES } from '../businessos/platform/bar/barConsumptionMapping.js';
import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

const TENANT_ID = 'tenant_h0qc7wf';
const supabase = new SupabaseClient();

const BASE_URL = supabase.baseUrl;
const HEADERS = supabase.getHeaders();

async function apiGet(endpoint) {
  const resp = await fetch(`${BASE_URL}/${endpoint}`, { headers: HEADERS });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`GET ${endpoint} failed: ${resp.status} ${txt}`);
  }
  return await resp.json();
}

async function getLoc314Balance(itemCode) {
  const bals = await apiGet(`stock_balances?tenant_id=eq.${TENANT_ID}&location_code=eq.LOC-314&item_code=eq.${itemCode}&select=*`);
  if (bals && bals.length > 0) {
    return parseFloat(bals[0].quantity !== undefined ? bals[0].quantity : bals[0].data?.quantity || 0);
  }
  return 0.0;
}

async function getLoc886CountAndQty() {
  const bals = await apiGet(`stock_balances?tenant_id=eq.${TENANT_ID}&location_code=eq.LOC-886&select=id,quantity`);
  return {
    count: bals.length,
    qty: bals.reduce((acc, b) => acc + parseFloat(b.quantity || 0), 0)
  };
}

async function getLoc805Balance(itemCode) {
  const bals = await apiGet(`stock_balances?tenant_id=eq.${TENANT_ID}&location_code=eq.LOC-805&item_code=eq.${itemCode}&select=*`);
  if (bals && bals.length > 0) {
    return parseFloat(bals[0].quantity !== undefined ? bals[0].quantity : bals[0].data?.quantity || 0);
  }
  return 0.0;
}

async function runCertification() {
  console.log('='.repeat(85));
  console.log('PHASE B-03 CERTIFICATION SUITE: BAR PRODUCTION ROUTING & INVENTORY DEDUCTION');
  console.log('='.repeat(85));

  // --- BASELINE AUDIT ---
  console.log('\n[PHASE 0: BASELINE INVENTORY AUDIT]');
  const baselineBar0005 = await getLoc314Balance('BAR0005');
  const baselineBar0001 = await getLoc314Balance('BAR0001');
  const baselineBar0041 = await getLoc314Balance('BAR0041');
  const baselineLoc886 = await getLoc886CountAndQty();
  const baselineBar0001Loc805 = await getLoc805Balance('BAR0001');

  console.log(`  BAR0005 (Singleton 12) @ LOC-314: ${baselineBar0005.toFixed(4)} LTR`);
  console.log(`  BAR0001 (Red Wine)     @ LOC-314: ${baselineBar0001.toFixed(4)} LTR`);
  console.log(`  BAR0041 (Corona)       @ LOC-314: ${baselineBar0041.toFixed(4)} LTR (Authoritative Shortage Expected)`);
  console.log(`  Kitchen Store (LOC-886):         ${baselineLoc886.count} items, ${baselineLoc886.qty.toFixed(4)} total qty`);
  console.log(`  Warehouse (LOC-805) BAR0001:     ${baselineBar0001Loc805.toFixed(4)} LTR`);

  if (Math.abs(baselineBar0005 - 4.0) > 1e-4) {
    throw new Error(`Invariant Violation: BAR0005 opening balance must be 4.000 LTR at LOC-314, found ${baselineBar0005}`);
  }
  if (baselineBar0041 !== 0.0) {
    throw new Error(`Expected BAR0041 to have 0 balance at LOC-314, found ${baselineBar0041}`);
  }

  // Populate local offlineStore for engine routing
  const menuItems = [
    {
      id: 'RC-BAR-105',
      itemCode: 'RC-BAR-105',
      itemName: 'Singleton Luscious 12 Yr Old',
      category: 'SINGLE MALT SCOTCH WHISKY',
      productionArea: 'BAR',
      routing: 'BAR',
      variants: [{ variantId: 'var_singleton_60', name: '60 ml', servingSize: 60, servingUnit: 'ML' }]
    },
    {
      id: 'RC-BAR-141',
      itemCode: 'RC-BAR-141',
      itemName: 'Corona',
      category: 'MILD BEER',
      productionArea: 'BAR',
      routing: 'BAR',
      variants: [{ variantId: 'var_corona_reg', name: 'Regular' }]
    },
    {
      id: 'RC-BAR-147',
      itemCode: 'RC-BAR-147',
      itemName: 'Seaside Balcony - Savoury',
      category: 'COCKTAILS',
      productionArea: 'BAR',
      routing: 'BAR',
      variants: [{ variantId: 'var_seaside_reg', name: 'Regular' }]
    }
  ];
  offlineStore.setCollection('kitchen_menu_items', menuItems, TENANT_ID);

  const initialBalances = [
    { id: 'sb_bar0005_loc314', itemCode: 'BAR0005', locationCode: 'LOC-314', quantity: 4.0, unitCost: 2400 },
    { id: 'sb_bar0001_loc314', itemCode: 'BAR0001', locationCode: 'LOC-314', quantity: 2.0, unitCost: 180 }
  ];
  offlineStore.setCollection('stock_balances', initialBalances, TENANT_ID);

  // =========================================================================
  // GATE 1: BOT ROUTING (Separate controlled orders A, B, C)
  // =========================================================================
  console.log('\n' + '-'.repeat(85));
  console.log('GATE 1: BOT ROUTING (POUR, UNIT, and RECIPE Orders dispatched to BAR BOT)');
  console.log('-'.repeat(85));

  const runId = Math.random().toString(36).substring(2, 7);

  // Order A: Singleton 60ml (POUR)
  const orderAId = `ord_b03_a_${runId}`;
  const orderA = {
    id: orderAId,
    orderId: orderAId,
    orderNumber: `ORD-A-${runId.toUpperCase()}`,
    tenantId: TENANT_ID,
    tableNumber: 'Bar Table 1',
    status: 'ACTIVE',
    items: [
      {
        lineItemId: `line_a_1_${runId}`,
        itemId: 'RC-BAR-105',
        itemCode: 'RC-BAR-105',
        name: 'Singleton Luscious 12 Yr Old',
        variant: { variantId: 'var_singleton_60', name: '60 ml', servingSize: 60, servingUnit: 'ML' },
        quantity: 1,
        productionArea: 'BAR',
        routing: 'BAR',
        category: 'SINGLE MALT SCOTCH WHISKY'
      }
    ]
  };

  // Order B: Corona 330ml (UNIT)
  const orderBId = `ord_b03_b_${runId}`;
  const orderB = {
    id: orderBId,
    orderId: orderBId,
    orderNumber: `ORD-B-${runId.toUpperCase()}`,
    tenantId: TENANT_ID,
    tableNumber: 'Bar Table 2',
    status: 'ACTIVE',
    items: [
      {
        lineItemId: `line_b_1_${runId}`,
        itemId: 'RC-BAR-141',
        itemCode: 'RC-BAR-141',
        name: 'Corona',
        variant: { variantId: 'var_corona_reg', name: 'Regular' },
        quantity: 1,
        productionArea: 'BAR',
        routing: 'BAR',
        category: 'MILD BEER'
      }
    ]
  };

  // Order C: Seaside Balcony (RECIPE - Unrecipied cocktail)
  const orderCId = `ord_b03_c_${runId}`;
  const orderC = {
    id: orderCId,
    orderId: orderCId,
    orderNumber: `ORD-C-${runId.toUpperCase()}`,
    tenantId: TENANT_ID,
    tableNumber: 'Bar Table 3',
    status: 'ACTIVE',
    items: [
      {
        lineItemId: `line_c_1_${runId}`,
        itemId: 'RC-BAR-147',
        itemCode: 'RC-BAR-147',
        name: 'Seaside Balcony - Savoury',
        variant: { variantId: 'var_seaside_reg', name: 'Regular' },
        quantity: 1,
        productionArea: 'BAR',
        routing: 'BAR',
        category: 'COCKTAILS'
      }
    ]
  };

  offlineStore.setCollection('orders', [orderA, orderB, orderC], TENANT_ID);

  const ticketsA = productionRoutingEngine.routeOrderToProduction(orderAId, TENANT_ID);
  const ticketsB = productionRoutingEngine.routeOrderToProduction(orderBId, TENANT_ID);
  const ticketsC = productionRoutingEngine.routeOrderToProduction(orderCId, TENANT_ID);

  if (ticketsA.length !== 1 || ticketsA[0].ticketType !== 'BOT' || ticketsA[0].status !== 'QUEUED') {
    throw new Error(`Gate 1 Failed for Order A: Expected 1 QUEUED BOT ticket, got ${JSON.stringify(ticketsA)}`);
  }
  if (ticketsB.length !== 1 || ticketsB[0].ticketType !== 'BOT' || ticketsB[0].status !== 'QUEUED') {
    throw new Error(`Gate 1 Failed for Order B: Expected 1 QUEUED BOT ticket, got ${JSON.stringify(ticketsB)}`);
  }
  if (ticketsC.length !== 1 || ticketsC[0].ticketType !== 'BOT' || ticketsC[0].status !== 'QUEUED') {
    throw new Error(`Gate 1 Failed for Order C: Expected 1 QUEUED BOT ticket, got ${JSON.stringify(ticketsC)}`);
  }

  const botTicketA = ticketsA[0];
  const botTicketB = ticketsB[0];
  const botTicketC = ticketsC[0];

  console.log(`  Order A -> BOT: ${botTicketA.id} (${botTicketA.status}, Destination: ${botTicketA.destination})`);
  console.log(`  Order B -> BOT: ${botTicketB.id} (${botTicketB.status}, Destination: ${botTicketB.destination})`);
  console.log(`  Order C -> BOT: ${botTicketC.id} (${botTicketC.status}, Destination: ${botTicketC.destination})`);
  console.log('  [PASS] Gate 1 Certified: BOT tickets correctly routed in QUEUED status.');

  // =========================================================================
  // GATE 2: QUEUED STATE ZERO INVENTORY MOVEMENT
  // =========================================================================
  console.log('\n' + '-'.repeat(85));
  console.log('GATE 2: QUEUED STATE ZERO INVENTORY MOVEMENT');
  console.log('-'.repeat(85));

  const queuedBalBar0005 = await getLoc314Balance('BAR0005');
  if (Math.abs(queuedBalBar0005 - baselineBar0005) > 1e-4) {
    throw new Error(`Gate 2 Failed: Stock mutated at QUEUED state! ${baselineBar0005} -> ${queuedBalBar0005}`);
  }
  console.log(`  BAR0005 @ LOC-314: ${queuedBalBar0005.toFixed(4)} LTR (Unchanged from baseline ${baselineBar0005.toFixed(4)} LTR)`);
  console.log('  [PASS] Gate 2 Certified: Zero inventory movement at QUEUED status.');

  // =========================================================================
  // GATE 3: PREPARING STATE ZERO INVENTORY MOVEMENT
  // =========================================================================
  console.log('\n' + '-'.repeat(85));
  console.log('GATE 3: PREPARING STATE ZERO INVENTORY MOVEMENT');
  console.log('-'.repeat(85));

  orderModel.updateTicketStatus(botTicketA.id, 'PREPARING', TENANT_ID);
  const prepTicketA = offlineStore.getCollection('tickets', TENANT_ID).find(t => t.id === botTicketA.id);
  if (prepTicketA.status !== 'PREPARING') {
    throw new Error(`Failed to update Order A ticket status to PREPARING`);
  }

  const prepBalBar0005 = await getLoc314Balance('BAR0005');
  if (Math.abs(prepBalBar0005 - baselineBar0005) > 1e-4) {
    throw new Error(`Gate 3 Failed: Stock mutated at PREPARING state! ${baselineBar0005} -> ${prepBalBar0005}`);
  }
  console.log(`  Ticket ${botTicketA.id} Status: ${prepTicketA.status}`);
  console.log(`  BAR0005 @ LOC-314: ${prepBalBar0005.toFixed(4)} LTR (Unchanged from baseline ${baselineBar0005.toFixed(4)} LTR)`);
  console.log('  [PASS] Gate 3 Certified: Zero inventory movement at PREPARING status.');

  // =========================================================================
  // GATE 4A: SINGLETON READY (POUR DEDUCTION AT LOC-314)
  // =========================================================================
  console.log('\n' + '-'.repeat(85));
  console.log('GATE 4A: SINGLETON READY (POUR DEDUCTION AT LOC-314)');
  console.log('-'.repeat(85));

  const opIdLineA = `cons_${TENANT_ID}_${orderAId}_${orderA.items[0].lineItemId}`;
  const corrIdLineA = `corr_${orderAId}_${orderA.items[0].lineItemId}`;

  // Execute consumption via service (Model-B trigger)
  const resLineA = await inventoryConsumptionService.consumeForOrderLine({
    tenantId: TENANT_ID,
    orderId: orderAId,
    orderLineId: orderA.items[0].lineItemId,
    item: orderA.items[0],
    occurredAt: new Date().toISOString(),
    performedBy: 'Bartender',
    correlationId: corrIdLineA
  });

  console.log('  Consumption Service Result (Order A):', JSON.stringify(resLineA));
  if (!resLineA.success) {
    throw new Error(`Gate 4A Failed: Consumption failed for Singleton 60ml: ${JSON.stringify(resLineA)}`);
  }

  const postBalBar0005 = await getLoc314Balance('BAR0005');
  const expectedBar0005 = baselineBar0005 - 0.060;
  console.log(`  BAR0005 @ LOC-314: ${baselineBar0005.toFixed(4)} LTR -> ${postBalBar0005.toFixed(4)} LTR (Expected: ${expectedBar0005.toFixed(4)} LTR)`);

  if (Math.abs(postBalBar0005 - expectedBar0005) > 1e-4) {
    throw new Error(`Gate 4A Failed: Stock balance mismatch! Expected ${expectedBar0005}, found ${postBalBar0005}`);
  }

  // Verify stock_transactions recorded in DB
  const txnsA = await apiGet(`stock_transactions?operation_id=eq.${opIdLineA}&select=*`);
  if (txnsA.length !== 1) {
    throw new Error(`Gate 4A Failed: Expected exactly 1 stock_transaction for Order A, found ${txnsA.length}`);
  }
  const txnA = txnsA[0];
  console.log(`  Transaction ID:   ${txnA.id}`);
  console.log(`  Transaction Type: ${txnA.transaction_type}`);
  console.log(`  Location Code:    ${txnA.location_code}`);
  console.log(`  Item Code:        ${txnA.item_code}`);
  console.log(`  Quantity:         ${txnA.quantity} LTR`);
  console.log(`  Performed By:     ${txnA.performed_by}`);

  if (txnA.transaction_type !== 'SALE_CONSUMPTION') throw new Error('Expected transaction_type SALE_CONSUMPTION');
  if (txnA.location_code !== 'LOC-314') throw new Error('Expected location_code strictly LOC-314');
  if (txnA.item_code !== 'BAR0005') throw new Error('Expected item_code BAR0005');
  if (Math.abs(parseFloat(txnA.quantity) - (-0.060)) > 1e-4) throw new Error('Expected quantity -0.060 LTR');
  if (txnA.performed_by !== 'Bartender') throw new Error('Expected performed_by Bartender');

  console.log('  [PASS] Gate 4A Certified: Singleton 60ml accurately deducted 0.060 LTR from BAR0005 at LOC-314.');

  // =========================================================================
  // GATE 4B: CORONA READY (LEGITIMATE SHORTAGE VALIDATION)
  // =========================================================================
  console.log('\n' + '-'.repeat(85));
  console.log('GATE 4B: CORONA READY (LEGITIMATE SHORTAGE VALIDATION)');
  console.log('-'.repeat(85));

  const opIdLineB = `cons_${TENANT_ID}_${orderBId}_${orderB.items[0].lineItemId}`;
  let shortageEncountered = false;
  let shortageMsg = '';

  try {
    await inventoryConsumptionService.consumeForOrderLine({
      tenantId: TENANT_ID,
      orderId: orderBId,
      orderLineId: orderB.items[0].lineItemId,
      item: orderB.items[0],
      occurredAt: new Date().toISOString(),
      performedBy: 'Bartender'
    });
  } catch (err) {
    shortageEncountered = true;
    shortageMsg = err.message;
    console.log(`  [Expected Shortage Caught]: ${err.message}`);
  }

  if (!shortageEncountered || !shortageMsg.includes('INSUFFICIENT_STOCK')) {
    throw new Error(`Gate 4B Failed: Corona with 0 stock must encounter INSUFFICIENT_STOCK shortage guard! Result: ${shortageMsg}`);
  }

  // Verify ZERO stock operations or transactions were created for Order B
  const txnsB = await apiGet(`stock_transactions?operation_id=eq.${opIdLineB}&select=*`);
  const opsB = await apiGet(`stock_operations?operation_id=eq.${opIdLineB}&select=*`);
  if (txnsB.length !== 0 || opsB.length !== 0) {
    throw new Error(`Gate 4B Failed: Transactions or operations were created despite shortage! txns: ${txnsB.length}, ops: ${opsB.length}`);
  }

  console.log(`  Stock transactions created: ${txnsB.length} (Strictly zero)`);
  console.log(`  Stock operations created:   ${opsB.length} (Strictly zero)`);
  console.log('  [PASS] Gate 4B Certified: Authoritative shortage guard successfully rejected consumption without stock mutation.');

  // =========================================================================
  // GATE 5: MISSING COCKTAIL READY (SAFEGUARD: ZERO MUTATION)
  // =========================================================================
  console.log('\n' + '-'.repeat(85));
  console.log('GATE 5: MISSING COCKTAIL READY (SAFEGUARD: ZERO MUTATION)');
  console.log('-'.repeat(85));

  const opIdLineC = `cons_${TENANT_ID}_${orderCId}_${orderC.items[0].lineItemId}`;

  const resLineC = await inventoryConsumptionService.consumeForOrderLine({
    tenantId: TENANT_ID,
    orderId: orderCId,
    orderLineId: orderC.items[0].lineItemId,
    item: orderC.items[0],
    occurredAt: new Date().toISOString(),
    performedBy: 'Bartender'
  });

  console.log('  Consumption Service Result (Order C):', JSON.stringify(resLineC));

  if (resLineC.status !== 'SKIPPED' || resLineC.reason !== 'RECIPE_MISSING_DEDUCTION_DISABLED' || resLineC.success !== false) {
    throw new Error(`Gate 5 Failed: Expected status SKIPPED with RECIPE_MISSING_DEDUCTION_DISABLED, got ${JSON.stringify(resLineC)}`);
  }

  // Verify ZERO stock operations or transactions were created for Order C
  const txnsC = await apiGet(`stock_transactions?operation_id=eq.${opIdLineC}&select=*`);
  const opsC = await apiGet(`stock_operations?operation_id=eq.${opIdLineC}&select=*`);

  if (txnsC.length !== 0 || opsC.length !== 0) {
    throw new Error(`Gate 5 Failed: Unrecipied drink must NOT create operations or transactions! ops: ${opsC.length}, txns: ${txnsC.length}`);
  }

  console.log(`  Stock transactions created: ${txnsC.length} (Strictly zero)`);
  console.log(`  Stock operations created:   ${opsC.length} (Strictly zero)`);
  console.log('  [PASS] Gate 5 Certified: Unrecipied cocktail safely SKIPPED without any inventory mutation or stock_operations headers.');

  // =========================================================================
  // GATE 6: KITCHEN & WAREHOUSE ISOLATION
  // =========================================================================
  console.log('\n' + '-'.repeat(85));
  console.log('GATE 6: KITCHEN & WAREHOUSE ISOLATION (LOC-886 & LOC-805)');
  console.log('-'.repeat(85));

  const postLoc886 = await getLoc886CountAndQty();
  const postBar0001Loc805 = await getLoc805Balance('BAR0001');

  console.log(`  Kitchen Store (LOC-886) Items:     ${postLoc886.count} (Baseline: ${baselineLoc886.count})`);
  console.log(`  Kitchen Store (LOC-886) Total Qty: ${postLoc886.qty.toFixed(4)} (Baseline: ${baselineLoc886.qty.toFixed(4)})`);
  console.log(`  Warehouse (LOC-805) BAR0001:       ${postBar0001Loc805.toFixed(4)} LTR (Baseline: ${baselineBar0001Loc805.toFixed(4)} LTR)`);

  if (postLoc886.count !== baselineLoc886.count || Math.abs(postLoc886.qty - baselineLoc886.qty) > 1e-4) {
    throw new Error('Gate 6 Failed: Kitchen Store LOC-886 was modified during Bar consumption!');
  }
  if (Math.abs(postBar0001Loc805 - baselineBar0001Loc805) > 1e-4) {
    throw new Error('Gate 6 Failed: Warehouse LOC-805 was modified during Bar consumption!');
  }

  console.log('  [PASS] Gate 6 Certified: Kitchen Store (LOC-886) and Warehouse (LOC-805) 100% untouched.');

  // =========================================================================
  // GATE 7: READY REPLAY IDEMPOTENCY
  // =========================================================================
  console.log('\n' + '-'.repeat(85));
  console.log('GATE 7: READY REPLAY IDEMPOTENCY (NO DUPLICATE DEDUCTIONS)');
  console.log('-'.repeat(85));

  const resReplay = await inventoryConsumptionService.consumeForOrderLine({
    tenantId: TENANT_ID,
    orderId: orderAId,
    orderLineId: orderA.items[0].lineItemId,
    item: orderA.items[0],
    occurredAt: new Date().toISOString(),
    performedBy: 'Bartender',
    correlationId: corrIdLineA
  });

  console.log('  Replay Call Result:', JSON.stringify(resReplay));
  if (!resReplay.success || !resReplay.idempotentReplay) {
    throw new Error(`Gate 7 Failed: Expected idempotentReplay = true, got ${JSON.stringify(resReplay)}`);
  }

  const postReplayBalBar0005 = await getLoc314Balance('BAR0005');
  if (Math.abs(postReplayBalBar0005 - expectedBar0005) > 1e-4) {
    throw new Error(`Gate 7 Failed: Balance mutated on replay! ${expectedBar0005} -> ${postReplayBalBar0005}`);
  }

  const allTxnsA = await apiGet(`stock_transactions?operation_id=eq.${opIdLineA}&select=*`);
  if (allTxnsA.length !== 1) {
    throw new Error(`Gate 7 Failed: Duplicate stock transactions created on replay! Found ${allTxnsA.length}`);
  }

  console.log(`  BAR0005 @ LOC-314 after Replay: ${postReplayBalBar0005.toFixed(4)} LTR (Unchanged)`);
  console.log(`  Total transactions count:      ${allTxnsA.length} (Strictly 1, zero duplicates)`);
  console.log('  [PASS] Gate 7 Certified: Replay idempotency confirmed with zero duplicate deductions.');

  // =========================================================================
  // GATE 8: READY -> PREPARING REVERSAL (EXACT RESTORATION TO 4.000 LTR)
  // =========================================================================
  console.log('\n' + '-'.repeat(85));
  console.log('GATE 8: READY -> PREPARING REVERSAL (EXACT RESTORATION TO 4.000 LTR)');
  console.log('-'.repeat(85));

  const revOpIdLineA = `rev_${TENANT_ID}_${orderAId}_${orderA.items[0].lineItemId}`;

  const resReversal = await inventoryConsumptionService.reverseConsumptionForOrderLine({
    tenantId: TENANT_ID,
    orderId: orderAId,
    orderLineId: orderA.items[0].lineItemId,
    reason: 'BDS_UNDO_READY',
    occurredAt: new Date().toISOString(),
    performedBy: 'Bartender'
  });

  console.log('  Reversal Service Result:', JSON.stringify(resReversal));
  if (!resReversal.success) {
    throw new Error(`Gate 8 Failed: Reversal failed: ${JSON.stringify(resReversal)}`);
  }

  const restoredBalBar0005 = await getLoc314Balance('BAR0005');
  console.log(`  BAR0005 @ LOC-314: ${postBalBar0005.toFixed(4)} LTR -> ${restoredBalBar0005.toFixed(4)} LTR (Baseline: ${baselineBar0005.toFixed(4)} LTR)`);

  if (Math.abs(restoredBalBar0005 - baselineBar0005) > 1e-4) {
    throw new Error(`Gate 8 Failed: Stock balance not restored! Expected ${baselineBar0005}, got ${restoredBalBar0005}`);
  }

  // Verify compensating transaction in DB
  const revTxns = await apiGet(`stock_transactions?operation_id=eq.${revOpIdLineA}&select=*`);
  if (revTxns.length !== 1) {
    throw new Error(`Gate 8 Failed: Expected exactly 1 reversal transaction, found ${revTxns.length}`);
  }
  const revTxn = revTxns[0];
  console.log(`  Reversal Txn ID:         ${revTxn.id}`);
  console.log(`  Transaction Type:        ${revTxn.transaction_type}`);
  console.log(`  Location Code:           ${revTxn.location_code}`);
  console.log(`  Compensating Quantity:   +${revTxn.quantity} LTR`);
  console.log(`  Reversal Of Op ID:       ${revTxn.reversal_of_operation_id}`);
  console.log(`  Reversal Reason:         ${revTxn.reversal_reason}`);

  if (revTxn.transaction_type !== 'SALE_REVERSAL') throw new Error('Expected transaction_type SALE_REVERSAL');
  if (revTxn.location_code !== 'LOC-314') throw new Error('Expected location_code LOC-314');
  if (Math.abs(parseFloat(revTxn.quantity) - 0.060) > 1e-4) throw new Error('Expected compensating quantity +0.060 LTR');
  if (revTxn.reversal_of_operation_id !== opIdLineA) throw new Error(`Expected reversal_of_operation_id to match ${opIdLineA}`);

  console.log('  [PASS] Gate 8 Certified: Exact stock restoration to 4.000 LTR with complete SALE_REVERSAL audit lineage.');

  console.log('\n' + '='.repeat(85));
  console.log('ALL 8 CERTIFICATION GATES PASSED! PHASE B-03 FULLY VERIFIED ON LIVE ENGINE & DB.');
  console.log('='.repeat(85));
}

runCertification().catch(err => {
  console.error('\n❌ CERTIFICATION FAILURE:', err);
  process.exit(1);
});
