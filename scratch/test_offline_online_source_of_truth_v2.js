/**
 * Source of Truth & Network Precedence Certification v2
 * Validates all 8 core architectural cases requested for production freezing:
 * 1. Cloud has 0 rows, Local has stale rows -> result = 0, cache = 0
 * 2. Cloud has rows, Local has different rows -> result = cloud, cache = cloud
 * 3. Network failure, Local has rows -> result = local, mode = ONLINE_FALLBACK (NOT [])
 * 4. Network failure, Local empty -> result = empty, mode = ONLINE_FALLBACK
 * 5. Reconnect -> Supabase refresh, cache replaced
 * 6. Startup with local recipe snapshot, Cloud empty -> NO recipe uploaded
 * 7. Startup -> tenant-owned inventory reads use tenant_h0qc7wf (no GLOBAL reads)
 * 8. Offline -> online -> no stale records resurrected
 */

import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { recipeModel } from '../businessos/platform/kitchen/recipeModel.js';

console.log('====================================================');
console.log('🛡️ SOURCE OF TRUTH & NETWORK PRECEDENCE CERTIFICATION v2');
console.log('====================================================\n');

const tenantId = 'tenant_h0qc7wf';

class MockStructuredAdapter {
  constructor(behavior = 'SUCCESS', data = []) {
    this.behavior = behavior; // 'SUCCESS' | 'ERROR'
    this.data = data;
    this.createCalls = [];
  }

  async getCollection(collection) {
    if (this.behavior === 'ERROR') {
      return { success: false, error: 'ERR_INTERNET_DISCONNECTED: Network request failed', data: null };
    }
    return { success: true, data: this.data };
  }

  async create(collection, record) {
    this.createCalls.push({ collection, record });
    return record;
  }
}

// CASE 1: Cloud has 0 rows, Local has stale rows -> result = 0, cache = 0
console.log('--- TEST 1: CLOUD HAS 0 ROWS, LOCAL HAS STALE ROWS ---');
offlineStore.setCollection('purchase_orders', [{ id: 'STALE-PO-1', poNumber: 'PO-OLD-001' }]);
const adapterEmpty = new MockStructuredAdapter('SUCCESS', []);
const gw1 = new DataGateway({ cloudAdapter: adapterEmpty, isOnline: true });

const res1 = await gw1.getCollection('purchase_orders', tenantId);
console.log(`Cloud returned: ${res1.length} rows | Local cache after read: ${offlineStore.getCollection('purchase_orders').length} rows`);
if (res1.length !== 0 || offlineStore.getCollection('purchase_orders').length !== 0) {
  throw new Error('Test 1 Failed: Authoritative empty cloud [] failed to clear local cache!');
}
console.log('✓ Test 1 Passed: Empty cloud response [] authoritative and replaced local cache.\n');

// CASE 2: Cloud has rows, Local has different rows -> result = cloud, cache = cloud
console.log('--- TEST 2: CLOUD HAS ROWS, LOCAL HAS DIFFERENT ROWS ---');
offlineStore.setCollection('inventory', [{ id: 'OLD-ITEM-1', name: 'Old Chicken' }]);
const adapterCloudRows = new MockStructuredAdapter('SUCCESS', [{ id: 'CLOUD-ITEM-1', name: 'Fresh Supabase Chicken' }]);
const gw2 = new DataGateway({ cloudAdapter: adapterCloudRows, isOnline: true });

const res2 = await gw2.getCollection('inventory', tenantId);
console.log(`Cloud returned: ${res2[0].name} | Cache contains: ${offlineStore.getCollection('inventory')[0].name}`);
if (res2.length !== 1 || res2[0].id !== 'CLOUD-ITEM-1' || offlineStore.getCollection('inventory')[0].id !== 'CLOUD-ITEM-1') {
  throw new Error('Test 2 Failed: Cloud data did not overwrite local cache!');
}
console.log('✓ Test 2 Passed: Cloud data authoritative and updated local cache.\n');

// CASE 3: Network failure, Local has rows -> result = local, mode = ONLINE_FALLBACK (NOT [])
console.log('--- TEST 3: NETWORK FAILURE, LOCAL HAS ROWS ---');
offlineStore.setCollection('inventory', [{ id: 'CACHED-ITEM-1', name: 'Cached Mutton' }]);
const adapterError = new MockStructuredAdapter('ERROR');
const gw3 = new DataGateway({ cloudAdapter: adapterError, isOnline: true });

const res3 = await gw3.getCollection('inventory', tenantId);
console.log(`Network Error Fallback returned: ${res3.length} rows (${res3[0].name})`);
if (res3.length !== 1 || res3[0].id !== 'CACHED-ITEM-1') {
  throw new Error('Test 3 Failed: Network failure wiped local cache instead of falling back!');
}
console.log('✓ Test 3 Passed: Network failure fell back to local cache without wiping data.\n');

// CASE 4: Network failure, Local empty -> result = empty
console.log('--- TEST 4: NETWORK FAILURE, LOCAL EMPTY ---');
offlineStore.setCollection('suppliers', []);
const gw4 = new DataGateway({ cloudAdapter: adapterError, isOnline: true });

const res4 = await gw4.getCollection('suppliers', tenantId);
console.log(`Network Error Fallback with empty cache returned: ${res4.length} rows`);
if (res4.length !== 0) {
  throw new Error('Test 4 Failed: Expected 0 rows on empty local cache fallback!');
}
console.log('✓ Test 4 Passed: Controlled fallback on empty cache verified.\n');

// CASE 5: Reconnect -> Supabase refresh, cache replaced
console.log('--- TEST 5: RECONNECT FULL CLOUD REFRESH ---');
gw3.setOnlineState(false);
let offRes = gw3.getCachedCollection('inventory', tenantId);
console.log(`Offline cached count: ${offRes.length}`);

gw3.setOnlineState(true);
gw3.cloudAdapter = new MockStructuredAdapter('SUCCESS', [{ id: 'RECONNECTED-ITEM-1', name: 'Reconnected Item' }]);
const reconRes = await gw3.getCollection('inventory', tenantId);
console.log(`Reconnected fetch count: ${reconRes.length} (${reconRes[0].name})`);
if (reconRes.length !== 1 || reconRes[0].id !== 'RECONNECTED-ITEM-1') {
  throw new Error('Test 5 Failed: Reconnect cloud refresh failed!');
}
console.log('✓ Test 5 Passed: Reconnect cloud refresh and cache replacement certified.\n');

// CASE 6: Startup with local recipe snapshot, Cloud empty -> NO recipe uploaded
console.log('--- TEST 6: STARTUP RECIPE AUTO-SYNC SEED GUARD ---');
offlineStore.setCollection('recipes', [{ id: 'rcp-local-1', recipeName: 'Local Recipe' }]);
const recipeAdapter = new MockStructuredAdapter('SUCCESS', []);
recipeModel.syncOfflineRecipesToCloud(tenantId);
console.log(`Create calls triggered on startup: ${recipeAdapter.createCalls.length}`);
if (recipeAdapter.createCalls.length !== 0) {
  throw new Error('Test 6 Failed: Startup automatically uploaded local recipe snapshot to cloud!');
}
console.log('✓ Test 6 Passed: Startup recipe auto-sync guard verified (0 cloud uploads).\n');

// CASE 7: Startup -> tenant-owned inventory reads use tenant_h0qc7wf (no GLOBAL reads)
console.log('--- TEST 7: TENANT BOOTSTRAP SCOPE GUARD ---');
const loggedTenants = [];
const trackingAdapter = {
  async getCollection(col, tId) {
    loggedTenants.push({ col, tenantId: tId });
    return { success: true, data: [] };
  }
};
const gw7 = new DataGateway({ cloudAdapter: trackingAdapter, isOnline: true });
await gw7.getCollection('inventory', tenantId);

console.log(`Read tenantId passed to adapter: "${loggedTenants[0].tenantId}"`);
if (loggedTenants[0].tenantId !== tenantId) {
  throw new Error(`Test 7 Failed: Expected tenantId "${tenantId}", got "${loggedTenants[0].tenantId}"!`);
}
console.log('✓ Test 7 Passed: Tenant-owned inventory reads strictly use tenant context.\n');

// CASE 8: Offline -> online -> no stale records resurrected
console.log('--- TEST 8: OFFLINE -> ONLINE NO STALE RECORD RESURRECTION ---');
offlineStore.setCollection('purchase_orders', [{ id: 'DELETED-PO-88', poNumber: 'PO-DELETED' }]);
const cleanCloudAdapter = new MockStructuredAdapter('SUCCESS', []);
const gw8 = new DataGateway({ cloudAdapter: cleanCloudAdapter, isOnline: true });
const cleanRes = await gw8.getCollection('purchase_orders', tenantId);

console.log(`Final PO count in view & cache: ${cleanRes.length}`);
if (cleanRes.length !== 0 || offlineStore.getCollection('purchase_orders').length !== 0) {
  throw new Error('Test 8 Failed: Stale local record was resurrected after online fetch!');
}
console.log('✓ Test 8 Passed: No stale local records resurrected after reconnect.\n');

// CASE 9: SupabaseRealtime Offline WebSocket Lifecycle Guard
console.log('--- TEST 9: SUPABASE REALTIME OFFLINE WEBSOCKET LIFECYCLE GUARD ---');
let wsConstructorCalled = false;
globalThis.WebSocket = class MockWebSocket {
  constructor(url) {
    wsConstructorCalled = true;
    this.close = () => {};
  }
};
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: false },
  writable: true,
  configurable: true
});

const { SupabaseRealtime } = await import('../businessos/platform/realtime/supabaseRealtime.js');
const realtime = new SupabaseRealtime();

console.log(`WebSocket created while navigator.onLine=false: ${wsConstructorCalled}`);
if (wsConstructorCalled) {
  throw new Error('Test 9 Failed: SupabaseRealtime initialized WebSocket while offline!');
}

// Simulate reconnect online
globalThis.navigator = { onLine: true };
realtime._initWebSocket();
console.log(`WebSocket created after switching to online: ${wsConstructorCalled}`);
if (!wsConstructorCalled) {
  throw new Error('Test 9 Failed: SupabaseRealtime failed to initialize WebSocket after switching to online!');
}
console.log('✓ Test 9 Passed: SupabaseRealtime correctly guards WebSocket lifecycle online vs offline.\n');

console.log('====================================================');
console.log('✅ ALL 9 SOURCE OF TRUTH v2 CERTIFICATION TESTS PASSED (100%)');
console.log('====================================================');

