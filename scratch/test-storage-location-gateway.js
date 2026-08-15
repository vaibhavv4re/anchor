import { StorageLocationRepository } from '../businessos/platform/repositories/storageLocationRepository.js';
import { InventoryRepository } from '../businessos/platform/repositories/inventoryRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('==============================================');
console.log('STORAGE LOCATION REPOSITORY DATA GATEWAY TEST');
console.log('==============================================\n');

try {
  const mockOfflineStore = {
    collections: { storage_locations: [], inventory: [] },
    getCollection(name) { return this.collections[name] || []; },
    setCollection(name, data) { this.collections[name] = data; },
    appendItem(name, item) { (this.collections[name] = this.collections[name] || []).push(item); return item; }
  };

  const realtime = new SupabaseRealtime();
  const gateway = new DataGateway({
    offlineStore: mockOfflineStore,
    realtime
  });

  const locRepo = new StorageLocationRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore
  });

  const invRepo = new InventoryRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore
  });

  const session = { employeeName: 'Warehouse Supervisor', tenantId: 'ros-tenant-master' };

  console.log('Test 1: SYNCHRONOUS getAll() & DEFAULT LOCATION TREE PRE-SEEDING');
  const locations = locRepo.getAll('ros-tenant-master');
  const test1Passed = Array.isArray(locations) && locations.length >= 6 && !(locations instanceof Promise);
  console.log(`  ${test1Passed ? '✓' : '✗'} Returned ${locations.length} pre-seeded storage locations synchronously`);

  console.log('\nTest 2: SYNCHRONOUS getByCode() & HIERARCHICAL PATH CALCULATION');
  const dryStore = locRepo.getByCode('LOC-DRY', 'ros-tenant-master');
  const newShelf = locRepo.create({
    locationCode: 'LOC-SHELF-01',
    locationName: 'Spice Shelf A1',
    shortName: 'SHELF-A1',
    parentLocationCode: 'LOC-DRY'
  }, session);

  const test2Passed = dryStore && dryStore.path === 'MWH / DRY' &&
                      newShelf && newShelf.path === 'MWH / DRY / SHELF-A1' &&
                      !(newShelf instanceof Promise);
  console.log(`  ${test2Passed ? '✓' : '✗'} Created child location with derived path ("${newShelf?.path}")`);

  console.log('\nTest 3: REALTIME CLOUD UPDATE INVALIDATION');
  const realtimeUpdate = {
    id: newShelf.id,
    locationCode: 'LOC-SHELF-01',
    locationName: 'Spice & Seasonings Shelf A1',
    shortName: 'SHELF-A1',
    parentLocationCode: 'LOC-DRY',
    path: 'MWH / DRY / SHELF-A1',
    tenantId: 'ros-tenant-master'
  };

  realtime.handleIncomingPayload('storage_locations', 'UPDATE', realtimeUpdate);
  const reReadShelf = locRepo.getByCode('LOC-SHELF-01', 'ros-tenant-master');
  const test3Passed = reReadShelf && reReadShelf.locationName === 'Spice & Seasonings Shelf A1' && !(reReadShelf instanceof Promise);
  console.log(`  ${test3Passed ? '✓' : '✗'} Realtime event invalidated local cache & re-read returned updated location ("${reReadShelf?.locationName}")`);

  console.log('\nTest 4: ARCHIVE SAFETY RULES (CHILD LOCATION PROTECTION)');
  const archiveChildCheck = locRepo.archive('LOC-DRY', session);
  const test4Passed = !archiveChildCheck.success && archiveChildCheck.error.includes('active child location(s)');
  console.log(`  ${test4Passed ? '✓' : '✗'} Archive blocked due to active child location ("${archiveChildCheck.error.split('\n')[0]}")`);

  console.log('\nTest 5: ARCHIVE SAFETY RULES (ACTIVE INVENTORY REFERENCE PROTECTION)');
  const item = invRepo.create({
    itemCode: 'RM-9001',
    itemName: 'Black Pepper Seeds 1kg',
    locationCode: 'LOC-SHELF-01'
  }, session);

  const archiveStockCheck = locRepo.archive('LOC-SHELF-01', session);
  const test5Passed = item && !archiveStockCheck.success && archiveStockCheck.error.includes('inventory item(s) are assigned');
  console.log(`  ${test5Passed ? '✓' : '✗'} Archive blocked due to assigned active inventory ("${archiveStockCheck.error.split('\n')[0]}")`);

  console.log('\n==============================================');
  if (test1Passed && test2Passed && test3Passed && test4Passed && test5Passed) {
    console.log('RESULT: PASS (StorageLocationRepository DataGateway Migration Verified)');
  } else {
    console.log('RESULT: FAIL (StorageLocationRepository DataGateway issue)');
  }
  console.log('==============================================');

} catch (err) {
  console.error('FATAL ERROR DURING STORAGE LOCATION GATEWAY TEST:', err);
  process.exit(1);
}
