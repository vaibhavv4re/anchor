import { CategoryRepository } from '../businessos/platform/repositories/categoryRepository.js';
import { InventoryRepository } from '../businessos/platform/repositories/inventoryRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('========================================');
console.log('CATEGORY REPOSITORY DATA GATEWAY TEST');
console.log('========================================\n');

try {
  const mockOfflineStore = {
    collections: { inventory_categories: [], inventory: [] },
    getCollection(name) { return this.collections[name] || []; },
    setCollection(name, data) { this.collections[name] = data; },
    appendItem(name, item) { (this.collections[name] = this.collections[name] || []).push(item); return item; }
  };

  const realtime = new SupabaseRealtime();
  const gateway = new DataGateway({
    offlineStore: mockOfflineStore,
    realtime
  });

  const catRepo = new CategoryRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore
  });

  const invRepo = new InventoryRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore,
    categoryRepository: catRepo
  });

  const session = { employeeName: 'Menu Manager', tenantId: 'ros-tenant-master' };

  console.log('Test 1: SYNCHRONOUS getAll() & CANONICAL PRE-SEEDING');
  const categories = catRepo.getAll('ros-tenant-master');
  const test1Passed = Array.isArray(categories) && categories.length >= 15 && !(categories instanceof Promise);
  console.log(`  ${test1Passed ? '✓' : '✗'} Returned ${categories.length} pre-seeded canonical categories synchronously`);

  console.log('\nTest 2: SYNCHRONOUS getByCode() & getById()');
  const catByCode = catRepo.getByCode('CAT-CHICKEN', 'ros-tenant-master');
  const catById = catRepo.getById('cat-1-ros-tenant-master', 'ros-tenant-master');
  const test2Passed = catByCode && catByCode.categoryName === 'Chicken' &&
                      catById && catById.categoryCode === 'CAT-CHICKEN' &&
                      !(catByCode instanceof Promise);
  console.log(`  ${test2Passed ? '✓' : '✗'} Returns category synchronously ("${catByCode?.categoryName}")`);

  console.log('\nTest 3: SYNCHRONOUS create() & update()');
  const newCat = catRepo.create({
    categoryCode: 'CAT-BAKERY',
    categoryName: 'Artisanal Bakery & Breads',
    productFamilyCode: 'FAM-GRAINS',
    defaultUom: 'PCS'
  }, session);

  const updatedCat = catRepo.update('CAT-BAKERY', { categoryName: 'Artisanal Bakery & Fresh Breads' }, session);

  const test3Passed = newCat && newCat.categoryCode === 'CAT-BAKERY' &&
                      updatedCat && updatedCat.categoryName === 'Artisanal Bakery & Fresh Breads' &&
                      !(newCat instanceof Promise) && !(updatedCat instanceof Promise);
  console.log(`  ${test3Passed ? '✓' : '✗'} Created & updated category synchronously ("${updatedCat?.categoryName}")`);

  console.log('\nTest 4: REALTIME CLOUD UPDATE INVALIDATION');
  const realtimeUpdate = {
    id: updatedCat.id,
    categoryCode: 'CAT-BAKERY',
    categoryName: 'Artisanal European Bakery & Fresh Breads',
    productFamilyCode: 'FAM-GRAINS',
    tenantId: 'ros-tenant-master'
  };

  realtime.handleIncomingPayload('inventory_categories', 'UPDATE', realtimeUpdate);
  const reReadCat = catRepo.getByCode('CAT-BAKERY', 'ros-tenant-master');
  const test4Passed = reReadCat && reReadCat.categoryName === 'Artisanal European Bakery & Fresh Breads' && !(reReadCat instanceof Promise);
  console.log(`  ${test4Passed ? '✓' : '✗'} Realtime event invalidated local cache & re-read returned updated category ("${reReadCat?.categoryName}")`);

  console.log('\nTest 5: CROSS-REPOSITORY INTEGRATION (InventoryRepository -> CategoryRepository)');
  const item = invRepo.create({
    itemCode: 'RM-7001',
    itemName: 'Sourdough Loaf',
    categoryCode: 'CAT-BAKERY'
  }, session);

  const test5Passed = item &&
                      item.categoryName === 'Artisanal European Bakery & Fresh Breads' &&
                      item.productFamilyCode === 'FAM-GRAINS' &&
                      !(item instanceof Promise);
  console.log(`  ${test5Passed ? '✓' : '✗'} Inventory item created with auto-derived category & product family ("${item?.categoryName}", ${item?.productFamilyCode})`);

  console.log('\n========================================');
  if (test1Passed && test2Passed && test3Passed && test4Passed && test5Passed) {
    console.log('RESULT: PASS (CategoryRepository DataGateway & Integration Verified)');
  } else {
    console.log('RESULT: FAIL (CategoryRepository DataGateway issue)');
  }
  console.log('========================================');

} catch (err) {
  console.error('FATAL ERROR DURING CATEGORY GATEWAY TEST:', err);
  process.exit(1);
}
