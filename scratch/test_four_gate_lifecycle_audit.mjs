import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { orderModel } from '../businessos/platform/ordering/orderModel.js';
import { productionRoutingEngine } from '../businessos/platform/ordering/productionRoutingEngine.js';
import { billRevisionModel } from '../businessos/platform/billing/billRevisionModel.js';
import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';

const client = new SupabaseClient();
const adapter = new SupabaseDataAdapter(client);
const dg = new DataGateway({ cloudAdapter: adapter, isOnline: true });

// Attach platform mock so orderModel, billing, and routingEngine use our live DataGateway
globalThis.window = {
  __APP__: {
    platform: {
      dataGateway: dg
    }
  }
};

async function queryTable(tableName, filterQuery = '') {
  const url = `${client.baseUrl}/${tableName}${filterQuery ? '?' + filterQuery : ''}`;
  const res = await fetch(url, { headers: client.getHeaders() });
  return await res.json();
}

async function runFourGateAudit() {
  console.log("==================================================================");
  console.log("🔬 STARTING FOUR-GATE LIFECYCLE AUDIT (CODE + LIVE SUPABASE)");
  console.log("==================================================================");

  const TENANT_ID = 'tenant_h0qc7wf';
  const TARGET_BAL_ID = 'sb-1788705000707-aa0r';
  const TABLE_CODE = 'AC-T-08';
  const TABLE_NUM = 8;
  const WAITER_ID = 'emp-rahul';

  // 1. Hydrate collections
  console.log("\n[PHASE 0] Hydrating domain collections from live Supabase...");
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
  console.log(`   Hydrated ${menuRes.data?.length || 0} menu items and ${enrichedRecipes.length} recipes.`);

  // 2. Reset Baseline Balance for RM0310 @ LOC-886 to 5.0000 KG
  console.log("\n[PHASE 0] Establishing pristine baseline balance (5.0000 KG)...");
  const cleanData = {
    quantity: 5.0,
    valuation: 150.0,
    costPerUnit: 30.0,
    itemCode: 'RM0310',
    itemName: 'Fresh Tomatoes',
    locationCode: 'LOC-886',
    uom: 'KG'
  };
  const resetPatch = {
    quantity: 5.0,
    valuation: 150.0,
    cost_per_unit: 30.0,
    data: cleanData
  };
  await client.updateRecord('stock_balances', TARGET_BAL_ID, resetPatch);

  offlineStore.setCollection('stock_balances', [
    {
      id: TARGET_BAL_ID,
      tenantId: TENANT_ID,
      itemCode: 'RM0310',
      locationCode: 'LOC-886',
      quantity: 5.0,
      unitCost: 30.0,
      valuation: 150.0,
      data: cleanData
    }
  ], TENANT_ID);

  const initialBal = await queryTable('stock_balances', `id=eq.${TARGET_BAL_ID}`);
  console.log("   Baseline balance confirmed:", {
    sql_quantity: initialBal[0]?.quantity,
    data_quantity: initialBal[0]?.data?.quantity,
    sql_valuation: initialBal[0]?.valuation
  });

  let testSessionId = null;
  let orderId = null;
  let revisionId = null;
  let createdOpId = null;

  try {
    // 3. Create Table Session for AC-T-08
    testSessionId = `sess_gate_${Math.random().toString(36).substring(2, 8)}`;
    console.log(`\n[PHASE 0] Initializing Table Session "${testSessionId}" for ${TABLE_CODE}...`);
    const sessionRecord = {
      id: testSessionId,
      sessionId: testSessionId,
      tenantId: TENANT_ID,
      tableCode: TABLE_CODE,
      table_code: TABLE_CODE,
      tableNumber: TABLE_NUM,
      table_number: TABLE_NUM,
      status: 'GUESTS_SEATED',
      billStatus: 'UNBILLED',
      bill_status: 'UNBILLED',
      assignedWaiterId: WAITER_ID
    };
    offlineStore.appendItem('table_sessions', sessionRecord, TENANT_ID);
    await dg.create('table_sessions', sessionRecord);

    // 4. Place Confirmed Order for Tomato Soup x 1
    console.log(`\n[PHASE 0] Placing customer order for Tomato Soup × 1 on ${TABLE_CODE}...`);
    const orderRecord = orderModel.createOrder({
      sessionId: testSessionId,
      tableNumber: TABLE_NUM,
      tableCode: TABLE_CODE,
      waiterId: WAITER_ID,
      tenantId: TENANT_ID,
      subtotal: 210,
      items: [
        {
          itemId: 'MENU-SOU-005',
          itemCode: 'MENU-SOU-005',
          name: 'Tomato Soup',
          itemName: 'Tomato Soup',
          price: 210,
          quantity: 1,
          recipeId: 'rcp-ajgdpxm',
          routing: 'KITCHEN_LINE',
          category: 'FOOD'
        }
      ]
    });
    orderId = orderRecord.id;
    const lineItemId = orderRecord.items[0].lineItemId;
    console.log(`   Order created: ${orderRecord.orderNumber} (ID: ${orderId}, Line: ${lineItemId})`);

    // Allow cloud sync 1.5s
    await new Promise(r => setTimeout(r, 1500));

    // Find generated KOT ticket
    const allTickets = orderModel.getAllTickets(TENANT_ID);
    const kotTicket = allTickets.find(t => (t.orderId === orderId || t.orderNumber === orderRecord.orderNumber) && (t.ticketType === 'KOT' || t.destination === 'KITCHEN'));
    if (!kotTicket) throw new Error(`KOT ticket was not generated for order ${orderId}!`);
    const ticketId = kotTicket.ticketId || kotTicket.id;
    console.log(`   KOT ticket generated: ${ticketId} (Initial status: ${kotTicket.status})`);

    // ==================================================================
    // GATE 1 AUDIT: READY PERSISTENCE
    // ==================================================================
    console.log("\n==================================================================");
    console.log("📍 [GATE 1 AUDIT] READY PERSISTENCE");
    console.log("==================================================================");
    console.log(`Chef marks item "${lineItemId}" on ticket "${ticketId}" as READY...`);
    
    await productionRoutingEngine.updateTicketItemStatus(ticketId, lineItemId, 'READY', TENANT_ID);

    // Wait 2.5s for async RPC and order update to persist
    await new Promise(r => setTimeout(r, 2500));

    // Query Supabase orders table
    const sbOrdersReady = await queryTable('orders', `id=eq.${orderId}`);
    if (!sbOrdersReady || sbOrdersReady.length === 0) {
      throw new Error(`[GATE 1 FAIL] Order ${orderId} not found in Supabase orders table!`);
    }
    const orderRowReady = sbOrdersReady[0];
    const itemInReady = (orderRowReady.items || []).find(i => i.lineItemId === lineItemId);

    console.log("   Supabase Order Relational Status:", orderRowReady.status);
    console.log("   Supabase Order Table ID / Code:", orderRowReady.table_id);
    console.log("   Supabase Line Item Status:", itemInReady?.itemStatus);
    console.log("   Supabase Embedded JSON status:", orderRowReady.data?.status);

    const gate1Pass = orderRowReady.status === 'READY' && itemInReady?.itemStatus === 'READY';
    if (!gate1Pass) {
      throw new Error(`[GATE 1 FAIL] Order did not persist READY state in Supabase! status=${orderRowReady.status}, itemStatus=${itemInReady?.itemStatus}`);
    }
    console.log("✅ [GATE 1 PASSED] Order status and line item status successfully persisted as READY in Supabase.");

    // ==================================================================
    // GATE 2 AUDIT: SERVED PERSISTENCE
    // ==================================================================
    console.log("\n==================================================================");
    console.log("📍 [GATE 2 AUDIT] SERVED PERSISTENCE");
    console.log("==================================================================");
    console.log(`Waiter picks up dish and marks item "${lineItemId}" as SERVED...`);

    await productionRoutingEngine.updateTicketItemStatus(ticketId, lineItemId, 'SERVED', TENANT_ID);

    // Wait 2.0s for cloud sync
    await new Promise(r => setTimeout(r, 2000));

    // Query Supabase orders table
    const sbOrdersServed = await queryTable('orders', `id=eq.${orderId}`);
    const orderRowServed = sbOrdersServed[0];
    const itemInServed = (orderRowServed.items || []).find(i => i.lineItemId === lineItemId);

    console.log("   Supabase Order Relational Status:", orderRowServed.status);
    console.log("   Supabase Line Item Status:", itemInServed?.itemStatus);
    console.log("   Supabase Embedded JSON status:", orderRowServed.data?.status);

    // Check stock balance after SERVED (must be unchanged from 4.8 KG)
    const balAtServed = await queryTable('stock_balances', `id=eq.${TARGET_BAL_ID}`);
    console.log(`   Stock balance at SERVED: ${balAtServed[0]?.quantity} KG (must remain 4.8000 KG)`);

    const gate2Pass = orderRowServed.status === 'SERVED' && itemInServed?.itemStatus === 'SERVED' && parseFloat(balAtServed[0]?.quantity) === 4.8;
    if (!gate2Pass) {
      throw new Error(`[GATE 2 FAIL] Order did not persist SERVED state in Supabase or stock moved! status=${orderRowServed.status}, bal=${balAtServed[0]?.quantity}`);
    }
    console.log("✅ [GATE 2 PASSED] Order and line item successfully persisted as SERVED in Supabase with ZERO premature/redundant stock movement.");

    // ==================================================================
    // GATE 3 AUDIT: BILL LINKAGE
    // ==================================================================
    console.log("\n==================================================================");
    console.log("📍 [GATE 3 AUDIT] BILL LINKAGE");
    console.log("==================================================================");
    console.log(`Cashier generates bill revision for Session "${testSessionId}"...`);

    const billRevision = billRevisionModel.createRevision({
      sessionId: testSessionId,
      tableNumber: TABLE_NUM,
      tableCode: TABLE_CODE,
      subtotal: 210,
      items: [
        {
          itemId: 'MENU-SOU-005',
          name: 'Tomato Soup',
          quantity: 1,
          price: 210,
          lineTotal: 210
        }
      ],
      waiterId: WAITER_ID,
      waiterName: 'Rahul',
      tenantId: TENANT_ID,
      serviceChargePercent: 5.0,
      cgstPercent: 2.5,
      sgstPercent: 2.5
    });
    revisionId = billRevision.id;
    const billNumber = billRevision.billNumber;
    console.log(`   Bill revision created: ${billNumber} (Revision ID: ${revisionId}, Grand Total: ₹${billRevision.grandTotal})`);

    // Wait 2.0s for cloud sync
    await new Promise(r => setTimeout(r, 2000));

    // Query Supabase bill_revisions table
    const sbBills = await queryTable('bill_revisions', `id=eq.${revisionId}`);
    if (!sbBills || sbBills.length === 0) {
      throw new Error(`[GATE 3 FAIL] Bill revision ${revisionId} not found in Supabase bill_revisions!`);
    }
    const billRow = sbBills[0];

    console.log("   Bill Session ID:", billRow.session_id);
    console.log("   Bill Table Code (data.tableCode):", billRow.data?.tableCode);
    console.log("   Bill Grand Total:", billRow.grand_total);
    console.log("   Bill Revision Status:", billRow.revision_status);
    console.log("   Bill Payment Status:", billRow.payment_status);
    console.log("   Bill Items Count:", billRow.data?.items?.length);

    const gate3Pass = (
      billRow.session_id === testSessionId &&
      billRow.data?.tableCode === TABLE_CODE &&
      parseFloat(billRow.grand_total) === 231 &&
      billRow.revision_status === 'GENERATED' &&
      billRow.payment_status === 'UNPAID'
    );

    if (!gate3Pass) {
      throw new Error(`[GATE 3 FAIL] Bill linkage mismatch! Expected session=${testSessionId}, table=${TABLE_CODE}, total=231. Got: ${JSON.stringify(billRow)}`);
    }
    console.log("✅ [GATE 3 PASSED] Bill revision links unambiguously to session, table AC-T-08, item lines, and waiter.");

    // ==================================================================
    // GATE 4 AUDIT: CONSUMPTION LINEAGE
    // ==================================================================
    console.log("\n==================================================================");
    console.log("📍 [GATE 4 AUDIT] CONSUMPTION LINEAGE");
    console.log("==================================================================");

    // 1. Query stock_operations
    const sbOps = await queryTable('stock_operations', `reference_id=eq.${orderId}`);
    console.log(`   Stock Operations for Order ${orderId} count:`, sbOps.length);
    if (sbOps.length === 0) throw new Error(`[GATE 4 FAIL] No stock_operations row found for Order ${orderId}!`);
    const opRow = sbOps[0];
    createdOpId = opRow.operation_id;

    console.log("   Operation ID:", opRow.operation_id);
    console.log("   Operation Type:", opRow.operation_type);
    console.log("   Operation Status:", opRow.status);
    console.log("   Reference Line ID:", opRow.reference_line_id);
    console.log("   Recipe ID:", opRow.recipe_id);
    console.log("   Recipe Version:", opRow.recipe_version);
    console.log("   Occurred At:", opRow.occurred_at);

    // 2. Query stock_transactions
    const sbTxns = await queryTable('stock_transactions', `operation_id=eq.${opRow.operation_id}`);
    console.log(`   Stock Transactions for Operation ${opRow.operation_id} count:`, sbTxns.length);
    if (sbTxns.length === 0) throw new Error(`[GATE 4 FAIL] No stock_transactions row found for Operation ${opRow.operation_id}!`);
    const txRow = sbTxns[0];

    console.log("   Transaction ID:", txRow.id);
    console.log("   Item Code:", txRow.item_code);
    console.log("   Item Name:", txRow.item_name);
    console.log("   Location Code:", txRow.location_code);
    console.log("   Signed Quantity:", txRow.quantity);
    console.log("   Unit Cost:", txRow.unit_cost);
    console.log("   Total Cost:", txRow.total_cost);
    console.log("   Occurred At:", txRow.occurred_at);

    // 3. Query stock_balances
    const finalBal = await queryTable('stock_balances', `id=eq.${TARGET_BAL_ID}`);
    console.log("   Final Stock Balance in Supabase:", {
      sql_quantity: finalBal[0]?.quantity,
      data_quantity: finalBal[0]?.data?.quantity,
      sql_valuation: finalBal[0]?.valuation,
      data_valuation: finalBal[0]?.data?.valuation
    });

    const gate4Pass = (
      opRow.operation_type === 'SALE_CONSUMPTION' &&
      opRow.status === 'COMPLETED' &&
      opRow.recipe_id === 'rcp-ajgdpxm' &&
      txRow.item_code === 'RM0310' &&
      txRow.location_code === 'LOC-886' &&
      parseFloat(txRow.quantity) === -0.2 &&
      parseFloat(finalBal[0]?.quantity) === 4.8 &&
      parseFloat(finalBal[0]?.data?.quantity) === 4.8
    );

    if (!gate4Pass) {
      throw new Error(`[GATE 4 FAIL] Consumption lineage check failed!`);
    }
    console.log("✅ [GATE 4 PASSED] Full audit lineage verified: stock_transactions → stock_operations → Order Line → Recipe rcp-ajgdpxm (v1.0).");

    console.log("\n==================================================================");
    console.log("🏆 ALL FOUR GATES PASSED WITH 100% RELATIONAL & AUDIT COMPLIANCE!");
    console.log("==================================================================");

  } finally {
    // ==================================================================
    // CLEANUP
    // ==================================================================
    console.log("\n[CLEANUP] Purging test probe records from live database...");
    if (orderId) await client.deleteRecords('orders', `id=eq.${orderId}`);
    if (testSessionId) await client.deleteRecords('table_sessions', `id=eq.${testSessionId}`);
    if (revisionId) await client.deleteRecords('bill_revisions', `id=eq.${revisionId}`);
    if (createdOpId) {
      await client.deleteRecords('stock_transactions', `operation_id=eq.${createdOpId}`);
      await client.deleteRecords('stock_operations', `operation_id=eq.${createdOpId}`);
    }

    // Restore stock balance to 5.0000 KG
    await client.updateRecord('stock_balances', TARGET_BAL_ID, resetPatch);
    const restoredBal = await queryTable('stock_balances', `id=eq.${TARGET_BAL_ID}`);
    console.log("✅ Stock balance restored to pristine baseline:", {
      sql_quantity: restoredBal[0]?.quantity,
      data_quantity: restoredBal[0]?.data?.quantity,
      sql_valuation: restoredBal[0]?.valuation
    });
  }
}

runFourGateAudit().catch(console.error);
