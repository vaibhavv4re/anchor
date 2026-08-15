import { InventoryRepository } from '../businessos/platform/repositories/inventoryRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('========================================');
console.log('REALTIME → LOCAL CACHE INVALIDATION TEST');
console.log('========================================\n');

try {
  // 1. Seed initial inventory item in local cache
  const mockOfflineStore = {
    collections: {
      inventory: [
        { id: 'inv-1', itemCode: 'ITEM-001', itemName: 'Fresh Chicken', unitValuation: 200, tenantId: 'ros-tenant-master' }
      ]
    },
    getCollection(name) { return this.collections[name] || []; },
    setCollection(name, data) { this.collections[name] = data; }
  };

  const realtime = new SupabaseRealtime();
  const gateway = new DataGateway({
    offlineStore: mockOfflineStore,
    realtime
  });

  const invRepo = new InventoryRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore
  });

  // Verify Initial Read
  const initialItem = invRepo.getByCode('ITEM-001', 'ros-tenant-master');
  console.log('Step 1: INITIAL SYNCHRONOUS READ');
  console.log(`  ✓ Initial item valuation: ₹${initialItem.unitValuation}`);

  // 2. Simulate External Supabase Realtime UPDATE on another device
  console.log('\nStep 2: SIMULATE EXTERNAL CLOUD REALTIME UPDATE');
  const externalCloudUpdate = {
    id: 'inv-1',
    itemCode: 'ITEM-001',
    itemName: 'Fresh Chicken (Organic)',
    unitValuation: 250,
    tenantId: 'ros-tenant-master'
  };

  // Ingest external change into SupabaseRealtime transport
  realtime.handleIncomingPayload('inventory', 'UPDATE', externalCloudUpdate);
  console.log(`  ✓ Ingested Realtime event for ITEM-001 (Updated valuation to ₹250)`);

  // 3. Perform Synchronous Read via InventoryRepository
  console.log('\nStep 3: SYNCHRONOUS RE-READ VIA InventoryRepository');
  const updatedItem = invRepo.getByCode('ITEM-001', 'ros-tenant-master');

  const testPassed = updatedItem &&
                     updatedItem.unitValuation === 250 &&
                     updatedItem.itemName === 'Fresh Chicken (Organic)' &&
                     !(updatedItem instanceof Promise);

  console.log(`  ${testPassed ? '✓' : '✗'} Updated item valuation: ₹${updatedItem?.unitValuation}`);
  console.log(`  ${testPassed ? '✓' : '✗'} Updated item name: "${updatedItem?.itemName}"`);

  console.log('\n========================================');
  if (testPassed) {
    console.log('RESULT: PASS (Realtime → EventBus → DataGateway Cache → InventoryRepository Loop Verified)');
  } else {
    console.log('RESULT: FAIL (Cache invalidation or propagation issue)');
  }
  console.log('========================================');

} catch (err) {
  console.error('FATAL ERROR DURING REALTIME CACHE INVALIDATION TEST:', err);
  process.exit(1);
}
