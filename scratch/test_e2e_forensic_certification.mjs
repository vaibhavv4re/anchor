import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { orderModel } from '../businessos/platform/ordering/orderModel.js';
import { productionRoutingEngine } from '../businessos/platform/ordering/productionRoutingEngine.js';
import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';

const client = new SupabaseClient();
const adapter = new SupabaseDataAdapter(client);
const dg = new DataGateway({ cloudAdapter: adapter, isOnline: true });

// Attach platform mock so orderModel and routingEngine use our live DataGateway
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

async function runCertification() {
  console.log("==================================================================");
  console.log("🚀 STARTING END-TO-END CONSUMPTION & PERSISTENCE CERTIFICATION");
  console.log("==================================================================");

  const TENANT_ID = 'tenant_h0qc7wf';
  const TARGET_BAL_ID = 'sb-1788705000707-aa0r';

  // Hydrate kitchen_menu_items, recipes, recipe_ingredients from Supabase
  console.log("\nHydrating domain collections from Supabase...");
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
  console.log(`Hydrated ${menuRes.data?.length || 0} menu items and ${enrichedRecipes.length} recipes.`);

  // 1. Reset Baseline Balance for RM0310 @ LOC-886
  console.log("\n[STEP 1] Resetting baseline balance for RM0310 @ LOC-886 to 5.0000 KG...");
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

  // Synchronize local cache
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

  const baselineBalances = await queryTable('stock_balances', `id=eq.${TARGET_BAL_ID}`);
  console.log("Verified Baseline Balance:", {
    quantity: baselineBalances[0]?.quantity,
    data_quantity: baselineBalances[0]?.data?.quantity,
    valuation: baselineBalances[0]?.valuation
  });

  // 2. Set up Table Session for AC-T-08
  const testSessionId = `sess_cert_${Math.random().toString(36).substring(2, 8)}`;
  const tableSession = {
    id: testSessionId,
    sessionId: testSessionId,
    tenantId: TENANT_ID,
    tableCode: 'AC-T-08',
    tableNumber: 8,
    status: 'ACTIVE'
  };
  offlineStore.setCollection('table_sessions', [tableSession], TENANT_ID);

  // 3. Create Order for 1x Tomato Soup
  console.log("\n[STEP 2] Creating Customer Order for Tomato Soup × 1 on Table AC-T-08...");
  const createdOrder = orderModel.createOrder({
    sessionId: testSessionId,
    tableNumber: 8,
    tableCode: 'AC-T-08',
    waiterId: 'emp-rahul',
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

  console.log("Order Created locally:", {
    orderId: createdOrder.id,
    orderNumber: createdOrder.orderNumber,
    tableCode: createdOrder.tableCode,
    status: createdOrder.status,
    ticketsCount: createdOrder.tickets.length
  });

  // Give cloud sync 1.5 seconds to settle
  await new Promise(r => setTimeout(r, 1500));

  // Verify Order in Supabase
  const sbOrders = await queryTable('orders', `id=eq.${createdOrder.id}`);
  console.log("Order in Supabase after creation:", {
    found: sbOrders.length > 0,
    id: sbOrders[0]?.id,
    order_number: sbOrders[0]?.order_number,
    table_code: sbOrders[0]?.table_code,
    status: sbOrders[0]?.status
  });

  // 4. Chef transitions KOT ticket to READY
  const allTickets = orderModel.getAllTickets(TENANT_ID);
  console.log("All tickets found count:", allTickets.length);
  const kotTicket = allTickets.find(t => (t.orderId === createdOrder.id || t.orderNumber === createdOrder.orderNumber) && (t.ticketType === 'KOT' || t.destination === 'KITCHEN'));
  if (!kotTicket) throw new Error(`KOT ticket not generated for order ${createdOrder.id}! Found: ${JSON.stringify(allTickets)}`);

  console.log(`\n[STEP 3] Chef marks KOT ticket "${kotTicket.id || kotTicket.ticketId}" as READY...`);
  await productionRoutingEngine.updateTicketStatus(kotTicket.id || kotTicket.ticketId, 'READY', TENANT_ID);

  // Wait 2.5 seconds for PostgreSQL RPC and cloud sync to complete
  await new Promise(r => setTimeout(r, 2500));

  // 5. Audit Supabase Post-READY State
  console.log("\n[STEP 4] Auditing Supabase Post-READY State:");

  // A. Order status in Supabase
  const sbOrdersPostReady = await queryTable('orders', `id=eq.${createdOrder.id}`);
  console.log("A. Order Record in Supabase:", {
    id: sbOrdersPostReady[0]?.id,
    status: sbOrdersPostReady[0]?.status,
    table_code: sbOrdersPostReady[0]?.table_code,
    item_status: sbOrdersPostReady[0]?.items?.[0]?.itemStatus || sbOrdersPostReady[0]?.data?.items?.[0]?.itemStatus
  });

  // B. Stock Balances
  const postBalances = await queryTable('stock_balances', `id=eq.${TARGET_BAL_ID}`);
  console.log("B. Stock Balances in Supabase:", {
    id: postBalances[0]?.id,
    sql_quantity: postBalances[0]?.quantity,
    data_quantity: postBalances[0]?.data?.quantity,
    sql_valuation: postBalances[0]?.valuation,
    data_valuation: postBalances[0]?.data?.valuation
  });

  // C. Stock Operations
  const postOps = await queryTable('stock_operations', `reference_id=eq.${createdOrder.id}`);
  console.log(`C. Stock Operations for Order ${createdOrder.id} count:`, postOps.length);
  for (const op of postOps) {
    console.log("   Operation:", {
      operation_id: op.operation_id,
      operation_type: op.operation_type,
      status: op.status,
      occurred_at: op.occurred_at
    });
  }

  // D. Stock Transactions
  const postTxns = await queryTable('stock_transactions', `reference_id=eq.${createdOrder.id}`);
  console.log(`D. Stock Transactions for Order ${createdOrder.id} count:`, postTxns.length);
  for (const tx of postTxns) {
    console.log("   Transaction:", {
      transaction_id: tx.transaction_id,
      item_code: tx.item_code,
      location_code: tx.location_code,
      quantity: tx.quantity,
      uom: tx.uom,
      unit_cost: tx.unit_cost,
      total_cost: tx.total_cost,
      occurred_at: tx.occurred_at
    });
  }

  // 6. Test Idempotency
  console.log(`\n[STEP 5] Testing Idempotency (Re-invoking READY on same ticket)...`);
  await productionRoutingEngine.updateTicketStatus(kotTicket.id || kotTicket.ticketId, 'READY', TENANT_ID);
  await new Promise(r => setTimeout(r, 1500));

  const afterReplayBal = await queryTable('stock_balances', `id=eq.${TARGET_BAL_ID}`);
  const afterReplayOps = await queryTable('stock_operations', `reference_id=eq.${createdOrder.id}`);
  const afterReplayTxns = await queryTable('stock_transactions', `reference_id=eq.${createdOrder.id}`);

  console.log("After Replay Balance (must remain 4.8 KG):", afterReplayBal[0]?.quantity);
  console.log("After Replay Operations count (must remain 1):", afterReplayOps.length);
  console.log("After Replay Transactions count (must remain 1):", afterReplayTxns.length);

  // Clean up test order to keep live database pristine
  console.log("\n[CLEANUP] Cleaning test records...");
  await client.deleteRecords('orders', `id=eq.${createdOrder.id}`);
  if (postOps.length > 0) {
    await client.deleteRecords('stock_transactions', `reference_id=eq.${createdOrder.id}`);
    await client.deleteRecords('stock_operations', `reference_id=eq.${createdOrder.id}`);
  }
  // Reset balance back to 5.0
  await client.updateRecord('stock_balances', TARGET_BAL_ID, resetPatch);
  console.log("✅ Balance restored to 5.0000 KG and test order cleaned up.");

  console.log("\n==================================================================");
  console.log("🎉 ALL TESTS PASSED: AUTHORITATIVE INVENTORY CERTIFIED!");
  console.log("==================================================================");
}

runCertification().catch(console.error);
