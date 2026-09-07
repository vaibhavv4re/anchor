/**
 * Source of Truth & Read-Path Precedence Certification
 * Validates the strict architectural rule:
 * ONLINE -> Supabase wins (replaces local cache, returns Supabase data even if [])
 * OFFLINE -> Local cache snapshot used with explicit LOCAL_CACHE log
 * NO GHOST-HYDRATION -> Deleted cloud records are never revived from stale local cache
 */

import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { purchasingModel } from '../businessos/platform/inventory/purchasingModel.js';
import { inventoryItemModel } from '../businessos/platform/inventory/inventoryItemModel.js';

console.log('====================================================');
console.log('🛡️ SOURCE OF TRUTH & READ PATH CERTIFICATION');
console.log('====================================================\n');

const tenantId = 'tenant_h0qc7wf';

// Mock Supabase Adapter
class MockSupabaseAdapter {
  constructor(mockDataMap = {}) {
    this.mockDataMap = mockDataMap;
  }
  async getCollection(collection) {
    return this.mockDataMap[collection] !== undefined ? this.mockDataMap[collection] : [];
  }
  async getById(collection, id) {
    const list = this.mockDataMap[collection] || [];
    return list.find(item => item.id === id || item.poNumber === id) || null;
  }
}

// TEST 1: ONLINE EMPTY CLOUD TABLE REPLACES LOCAL STALE CACHE
console.log('--- TEST 1: ONLINE EMPTY CLOUD TABLE REPLACES LOCAL STALE CACHE ---');
offlineStore.setCollection('purchase_orders', [
  { id: 'STALE-PO-01', poNumber: 'PO-OLD-0001', grandTotal: 9999 }
]);

const emptyCloudAdapter = new MockSupabaseAdapter({ purchase_orders: [] });
const gwOnline = new DataGateway({ cloudAdapter: emptyCloudAdapter, isOnline: true });

const poResult = await gwOnline.getCollection('purchase_orders', tenantId);
console.log(`Cloud returned: ${poResult.length} rows | Local cache after read: ${offlineStore.getCollection('purchase_orders').length} rows`);

if (poResult.length !== 0 || offlineStore.getCollection('purchase_orders').length !== 0) {
  throw new Error('ONLINE mode failed to replace local cache with empty cloud result []!');
}
console.log('✓ Test 1 Passed: Empty cloud table [] successfully replaced local cache and returned 0 rows.\n');

// TEST 2: ONLINE POPULATED CLOUD TABLE OVERWRITES LOCAL CACHE
console.log('--- TEST 2: ONLINE POPULATED CLOUD TABLE OVERWRITES LOCAL CACHE ---');
const freshCloudAdapter = new MockSupabaseAdapter({
  purchase_orders: [{ id: 'FRESH-PO-01', poNumber: 'PO-2026-9999', grandTotal: 1500 }]
});
const gwOnlineFresh = new DataGateway({ cloudAdapter: freshCloudAdapter, isOnline: true });

const freshResult = await gwOnlineFresh.getCollection('purchase_orders', tenantId);
console.log(`Cloud returned: ${freshResult.length} rows (${freshResult[0].poNumber})`);
if (freshResult.length !== 1 || freshResult[0].poNumber !== 'PO-2026-9999') {
  throw new Error('ONLINE mode failed to return fresh cloud data!');
}
console.log('✓ Test 2 Passed: ONLINE mode Supabase data returned and cached successfully.\n');

// TEST 3: OFFLINE MODE USES LOCAL SNAPSHOT
console.log('--- TEST 3: OFFLINE MODE FALLBACK TO LOCAL SNAPSHOT ---');
const gwOffline = new DataGateway({ cloudAdapter: freshCloudAdapter, isOnline: false });
const offlineResult = await gwOffline.getCollection('purchase_orders', tenantId);
console.log(`Offline returned: ${offlineResult.length} rows (${offlineResult[0].poNumber})`);
if (offlineResult.length !== 1 || offlineResult[0].id !== 'FRESH-PO-01') {
  throw new Error('OFFLINE mode failed to return local snapshot!');
}
console.log('✓ Test 3 Passed: OFFLINE mode correctly uses local snapshot.\n');

// TEST 4: PURCHASING MODEL CONSTRUCTOR NO LONGER SEEDS FAKE POs
console.log('--- TEST 4: PURCHASING MODEL CONSTRUCTOR SEED GUARD ---');
offlineStore.setCollection('purchase_orders', []);
purchasingModel._initSeedData();
const seededPOs = offlineStore.getCollection('purchase_orders');
console.log(`POs after constructor init: ${seededPOs.length} rows`);
if (seededPOs.length !== 0) {
  throw new Error('PurchasingModel constructor still injected fake legacy PO seed data!');
}
console.log('✓ Test 4 Passed: PurchasingModel constructor no longer injects fake PO seed data.\n');

console.log('====================================================');
console.log('✅ SOURCE OF TRUTH READ-PATH CERTIFICATION PASSED (100%)');
console.log('====================================================');
