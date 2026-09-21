/**
 * Replay the MISSING sale consumption for served Tropical Grove orders using the REAL
 * production code path (inventoryConsumptionService + DataGateway + offlineStore) in Node,
 * with collections hydrated from live Supabase exactly like the browser boot flow.
 *
 * Diagnostic value: prints the exact branch taken (SKIPPED reason / deducted txns).
 * Side effect (intended): records the legitimately-owed SALE_CONSUMPTION entries for
 * orders that were served in the browser but never consumed (Browser Bug-B stale tab).
 */
import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { inventoryConsumptionService } from '../businessos/platform/inventory/inventoryConsumptionService.js';

const TENANT = 'tenant_h0qc7wf';

// Orders that were SERVED but have zero consumption ledger entries (from live audit):
// orderId -> lineItemId
const MISSED_LINES = [
  { orderId: 'ord_tydt1w5', lineItemId: 'line_ord_tydt1w5_1' },   // 1x Tropical Grove (served, old bundle escaped READY)
  { orderId: 'ord_x9z5uia', lineItemId: 'line_ord_x9z5uia_2' },   // 2x Tropical Grove (same)
  { orderId: 'ord_67x21k6', lineItemId: 'line_ord_67x21k6_1' },   // 2x Tropical Grove (same)
  { orderId: 'ord_my934w5', lineItemId: 'line_ord_my934w5_1' },   // 1x Tropical Grove (same)
];

async function main() {
  const client = new SupabaseClient();
  const adapter = new SupabaseDataAdapter(client);
  const dg = new DataGateway({ cloudAdapter: adapter, isOnline: true });

  console.log('Hydrating collections from live Supabase (same as browser boot)...');
  await dg.hydrateCollections(['kitchen_menu_items', 'recipes', 'orders', 'stock_balances', 'stock_operations'], TENANT);

  const recipes = offlineStore.getCollection('recipes', TENANT) || [];
  console.log(`recipes in store: ${recipes.length}`);
  const grove = recipes.find(r => (r.recipeCode === 'RCP-1427' || r.id === 'rcp-kcwoqo3'));
  console.log('RCP-1427 found:', grove ? { id: grove.id, status: grove.status, menuItemId: grove.menuItemId || grove.menu_item_id, ings: (grove.ingredients || grove.data?.ingredients || []).map(i => `${i.inventoryItemCode}:${i.quantity}${i.uom}`) } : null);

  const orders = offlineStore.getCollection('orders', TENANT) || [];

  for (const { orderId, lineItemId } of MISSED_LINES) {
    console.log('\n' + '='.repeat(70));
    console.log(`REPLAY: order=${orderId} line=${lineItemId}`);
    const order = orders.find(o => o.id === orderId || o.orderId === orderId);
    if (!order) { console.log('  !! order not found in hydrated collection — skipping'); continue; }
    const items = order.items || order.data?.items || [];
    const item = items.find(i => i.lineItemId === lineItemId);
    if (!item) { console.log('  !! line item not found — skipping'); continue; }
    console.log(`  item: ${item.name || item.itemName} | qty ${item.quantity} | recipeId ${item.recipeId} | status ${item.itemStatus || item.status}`);

    const res = await inventoryConsumptionService.consumeForOrderLine({
      tenantId: TENANT,
      orderId,
      orderLineId: lineItemId,
      item,
      occurredAt: new Date().toISOString(),
      performedBy: 'Bartender'
    });
    console.log('  RESULT:', JSON.stringify({
      success: res.success, status: res.status, reason: res.reason,
      warningCode: res.warningCode, skipped: res.skipped,
      ops: res.operationId,
      txns: (res.transactions || []).map(t => `${t.itemCode || t.inventoryItemCode}:${t.quantity}${t.uom || t.baseUom || ''}@${t.locationCode}`)
    }, null, 1));
  }
}

main().catch(err => { console.error('REPLAY FAILED:', err); process.exit(1); });
