import assert from 'assert';
import { PlatformContainer } from '../businessos/platform/platformContainer.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { platformEventBus } from '../businessos/platform/events/platformEvents.js';
import { inventoryConsumptionService } from '../businessos/platform/inventory/inventoryConsumptionService.js';
import { KitchenInventoryView } from '../restaurantos/frontend/capabilities/kitchen/ui/KitchenInventoryView.js';
import { KitchenDashboardView } from '../restaurantos/frontend/capabilities/kitchen/ui/KitchenDashboardView.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('🧪 =========================================================================');
console.log('🧪 REAL-TIME INVENTORY PROJECTION & IMMEDIATE UI REFRESH CERTIFICATION SUITE');
console.log('🧪 =========================================================================\n');

async function runCertification() {
  const tenantId = 'tenant_h0qc7wf';
  const itemCode = 'RM0310';
  const locationCode = 'LOC-886';

  // --------------------------------------------------------------------------
  // TEST 1: PlatformContainer wires eventBus & offlineStore
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: PlatformContainer Wiring Contract ---');
  const platform = new PlatformContainer();
  assert.ok(platform.eventBus, 'FAIL: platform.eventBus must be defined');
  assert.strictEqual(typeof platform.eventBus.subscribe, 'function', 'FAIL: platform.eventBus must have subscribe()');
  assert.strictEqual(typeof platform.eventBus.publish, 'function', 'FAIL: platform.eventBus must have publish()');
  assert.ok(platform.services.offlineStore, 'FAIL: platform.services.offlineStore must not be null');
  assert.ok(platform.dataGateway, 'FAIL: platform.dataGateway must be initialized');
  console.log('✅ TEST 1 PASSED: PlatformContainer successfully wires eventBus and offlineStore.\n');

  // --------------------------------------------------------------------------
  // Seed initial baseline stock state in DataGateway & offlineStore (1.8 KG)
  // --------------------------------------------------------------------------
  const initialBalances = [
    {
      id: 'sb-test-RM0310-loc886',
      tenantId,
      tenant_id: tenantId,
      itemCode,
      item_code: itemCode,
      locationCode,
      location_code: locationCode,
      quantity: 1.8,
      unitCost: 30,
      valuation: 54,
      data: {
        itemCode,
        locationCode,
        quantity: 1.8,
        tenantId
      }
    }
  ];
  const initialInventory = [
    {
      id: itemCode,
      itemCode,
      itemName: 'Tomatoes',
      categoryCode: 'FAM-PRODUCE',
      baseUom: 'KG',
      reorderLevel: 2.0,
      currentStock: 1.8,
      tenantId
    }
  ];

  platform.dataGateway.localAdapter.setCollection('stock_balances', JSON.parse(JSON.stringify(initialBalances)));
  platform.dataGateway.localAdapter.setCollection('inventory', JSON.parse(JSON.stringify(initialInventory)));
  offlineStore.setCollection('stock_balances', JSON.parse(JSON.stringify(initialBalances)));
  offlineStore.setCollection('inventory', JSON.parse(JSON.stringify(initialInventory)));

  // Setup DOM container for KitchenInventoryView
  const mockContainer = {
    innerHTML: '',
    querySelectorAll: () => [],
    querySelector: () => null
  };
  const session = { tenantId, employee: { name: 'Chef' } };

  const inventoryView = new KitchenInventoryView({
    dataGateway: platform.dataGateway,
    offlineStore,
    platformEventBus: platform.eventBus
  });

  // Initial render verification
  let enriched = inventoryView.getEnrichedInventory(tenantId);
  const initialItem = enriched.find(i => i.code === itemCode);
  assert.strictEqual(initialItem.currentStock, 1.8, 'Baseline currentStock must be 1.8 KG');
  console.log(`Initial stock verified: ${initialItem.name} = ${initialItem.currentStock} KG`);

  // --------------------------------------------------------------------------
  // TEST 2: Authoritative Local RPC Projection Latency (< 50ms / < 100ms)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Local RPC Projection & Time-To-Visible-Update ---');
  
  let renderCallCount = 0;
  let renderTimestamp = 0;
  let eventReceivedTimestamp = 0;
  let capturedNewBalance = null;

  // Track subscriber notification
  platform.eventBus.subscribe('stock:balance:updated', (envelope) => {
    eventReceivedTimestamp = performance.now();
    capturedNewBalance = envelope.payload?.newBalance || envelope.payload?.record?.quantity;
  });

  // Hook render
  const origRenderActiveTab = inventoryView.renderActiveTabContent.bind(inventoryView);
  inventoryView.renderActiveTabContent = (sess, tId) => {
    renderCallCount++;
    renderTimestamp = performance.now();
    return origRenderActiveTab(sess, tId);
  };

  // Mount view (registers event listener)
  inventoryView.render(mockContainer, session);

  // Simulate RPC completion returning authoritative newBalance = 1.4 KG
  const t0 = performance.now();
  
  // Inject mock DataGateway into inventoryConsumptionService
  inventoryConsumptionService.dataGateway = platform.dataGateway;

  const mockRpcTransactions = [
    {
      transactionId: 'txn-synth-001',
      itemCode,
      locationCode,
      deducted: 0.4,
      newBalance: 1.4
    }
  ];

  // Execute local cache sync from RPC output
  inventoryConsumptionService._syncLocalCacheAfterRpc(
    tenantId,
    [{ itemCode, locationCode, quantity: 0.4 }],
    'op-cert-test-01',
    mockRpcTransactions
  );

  const t1 = performance.now();

  // Verify DataGateway local cache updated immediately
  const updatedDgBals = platform.dataGateway.getCachedCollection('stock_balances', tenantId);
  const updatedMatch = updatedDgBals.find(b => (b.itemCode || b.item_code) === itemCode);
  assert.ok(updatedMatch, 'DataGateway must contain updated balance');
  assert.strictEqual(updatedMatch.quantity, 1.4, 'DataGateway cached balance must immediately be 1.4 KG');

  const localStoreBals = offlineStore.getCollection('stock_balances', tenantId);
  const localMatch = localStoreBals.find(b => (b.itemCode || b.item_code) === itemCode);
  assert.strictEqual(localMatch.quantity, 1.4, 'offlineStore balance must immediately be 1.4 KG');

  // Verify UI projection immediately computes 1.4 without reload
  const updatedEnriched = inventoryView.getEnrichedInventory(tenantId);
  const uiItem = updatedEnriched.find(i => i.code === itemCode);
  assert.strictEqual(uiItem.currentStock, 1.4, 'UI projection must reflect 1.4 KG immediately');

  const tLocalUpdate = t1 - t0;
  const tEventPropagation = eventReceivedTimestamp - t0;

  console.log(`⏱️  t0 (RPC Complete) -> t1 (DataGateway cache update): ${tLocalUpdate.toFixed(2)} ms`);
  console.log(`⏱️  t0 (RPC Complete) -> t2 (Event Bus notification): ${tEventPropagation.toFixed(2)} ms`);
  console.log(`Authoritative balance: 1.8 -> ${uiItem.currentStock} KG`);

  assert.ok(tLocalUpdate < 50, `Local projection update must be < 50ms (was ${tLocalUpdate.toFixed(2)} ms)`);
  assert.strictEqual(capturedNewBalance, 1.4, 'Event payload must communicate authoritative balance');
  console.log('✅ TEST 2 PASSED: Local projection updated immediately in < 50ms with zero reload.\n');

  // --------------------------------------------------------------------------
  // TEST 3: KitchenDashboardView Reactivity
  // --------------------------------------------------------------------------
  console.log('--- TEST 3: KitchenDashboardView Reactivity ---');
  const dashboardView = new KitchenDashboardView({
    dataGateway: platform.dataGateway,
    offlineStore,
    platformEventBus: platform.eventBus
  });
  let dashboardUpdated = false;
  dashboardView.updateContent = () => {
    dashboardUpdated = true;
  };
  dashboardView.render();

  // Trigger DataGateway update
  platform.dataGateway.applyAuthoritativeStockBalance(tenantId, itemCode, locationCode, 1.3);
  assert.strictEqual(dashboardUpdated, true, 'KitchenDashboardView must updateContent on stock:balance:updated');
  console.log('✅ TEST 3 PASSED: KitchenDashboardView reacted immediately to stock:balance:updated.\n');

  // --------------------------------------------------------------------------
  // TEST 4: Cross-Terminal / Supabase Realtime Remote Ingestion
  // --------------------------------------------------------------------------
  console.log('--- TEST 4: Cross-Terminal Supabase Realtime Ingestion ---');
  const realtime = new SupabaseRealtime({ eventBus: platform.eventBus });
  
  // Simulate remote WebSocket incoming Postgres change on another terminal
  const remoteRecord = {
    id: 'sb-remote-001',
    tenant_id: tenantId,
    item_code: itemCode,
    location_code: locationCode,
    quantity: 1.2,
    unit_cost: 30,
    valuation: 36,
    updated_at: new Date().toISOString()
  };

  realtime.handleIncomingPayload('stock_balances', 'UPDATE', remoteRecord);

  // Check DataGateway & offlineStore ingested the remote balance
  const postRemoteDgBals = platform.dataGateway.getCachedCollection('stock_balances', tenantId);
  const postRemoteItem = postRemoteDgBals.find(b => (b.itemCode || b.item_code) === itemCode);
  assert.strictEqual(postRemoteItem.quantity, 1.2, 'Remote realtime update must update DataGateway to 1.2 KG');

  const remoteEnriched = inventoryView.getEnrichedInventory(tenantId);
  assert.strictEqual(remoteEnriched.find(i => i.code === itemCode).currentStock, 1.2, 'UI must project 1.2 KG from remote realtime');
  console.log(`Remote update projected: ${itemCode} = ${remoteEnriched.find(i => i.code === itemCode).currentStock} KG`);
  console.log('✅ TEST 4 PASSED: Remote Realtime event projected immediately to UI.\n');

  // --------------------------------------------------------------------------
  // TEST 5: Delta Polling Safety-Net Recovery
  // --------------------------------------------------------------------------
  console.log('--- TEST 5: Delta Polling Safety-Net Recovery ---');
  // Simulate delta polling catching a batch update from PostgreSQL
  const cloudBatch = [
    {
      id: 'sb-poll-001',
      tenant_id: tenantId,
      item_code: itemCode,
      location_code: locationCode,
      quantity: 1.0,
      unit_cost: 30,
      valuation: 30,
      updated_at: new Date().toISOString()
    }
  ];

  realtime._syncCloudStockBalances(cloudBatch, tenantId);

  const postPollBals = platform.dataGateway.getCachedCollection('stock_balances', tenantId);
  assert.strictEqual(postPollBals.find(b => (b.itemCode || b.item_code) === itemCode).quantity, 1.0, 'Poll recovery must update DataGateway to 1.0 KG');
  const pollEnriched = inventoryView.getEnrichedInventory(tenantId);
  assert.strictEqual(pollEnriched.find(i => i.code === itemCode).currentStock, 1.0, 'UI must project 1.0 KG from recovery poll');
  console.log(`Poll recovery projected: ${itemCode} = ${pollEnriched.find(i => i.code === itemCode).currentStock} KG`);
  console.log('✅ TEST 5 PASSED: Delta polling safety-net reconciles state.\n');

  // --------------------------------------------------------------------------
  // TEST 6: Duplicate Event Idempotence (No Duplicate Deductions)
  // --------------------------------------------------------------------------
  console.log('--- TEST 6: Duplicate Event Idempotence ---');
  // Replaying identical cloud balance does not mutate stock
  realtime._syncCloudStockBalances(cloudBatch, tenantId);
  const postReplayBals = platform.dataGateway.getCachedCollection('stock_balances', tenantId);
  assert.strictEqual(postReplayBals.find(b => (b.itemCode || b.item_code) === itemCode).quantity, 1.0, 'Stock must stay 1.0 KG upon duplicate event');
  console.log('✅ TEST 6 PASSED: Duplicate events do not cause duplicate balance modifications.\n');

  // --------------------------------------------------------------------------
  // TEST 7: Zero UI Stock Delta Calculations
  // --------------------------------------------------------------------------
  console.log('--- TEST 7: Zero UI Stock Delta Calculation Audit ---');
  // Inspect getEnrichedInventory implementation to verify it only reads projection
  const fnSource = inventoryView.getEnrichedInventory.toString();
  assert.ok(!fnSource.includes('- item.quantity'), 'UI must not perform subtraction/deductions');
  assert.ok(!fnSource.includes('deduct'), 'UI must not perform deductions');
  assert.ok(fnSource.includes('balances'), 'UI must read balances projection');
  console.log('✅ TEST 7 PASSED: UI strictly performs read-only projection aggregation (zero client-side stock arithmetic).\n');

  console.log('=========================================================================');
  console.log('🎉 ALL 7 REAL-TIME PROJECTION & REFRESH CERTIFICATION GATES PASSED 100%!');
  console.log('=========================================================================');
  process.exit(0);
}

runCertification().catch(err => {
  console.error('\n❌ CERTIFICATION FAILED:', err);
  process.exit(1);
});
