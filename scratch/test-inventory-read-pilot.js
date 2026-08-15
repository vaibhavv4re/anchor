import { InventoryRepository } from '../businessos/platform/repositories/inventoryRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';

console.log('========================================');
console.log('INVENTORY REPOSITORY READ-PATH PILOT TEST');
console.log('========================================\n');

try {
  const mockOfflineStore = {
    collections: {
      inventory: [
        { uuid: 'inv-1', itemCode: 'ITEM-001', itemName: 'Fresh Chicken', tenantId: 'ros-tenant-master' },
        { uuid: 'inv-2', itemCode: 'ITEM-002', itemName: 'Basmati Rice', tenantId: 'ros-tenant-master' }
      ]
    },
    getCollection(name) { return this.collections[name] || []; }
  };

  const gateway = new DataGateway({
    offlineStore: mockOfflineStore
  });

  const invRepo = new InventoryRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore
  });

  console.log('Test 1: SYNCHRONOUS getAll() RETURN TYPE');
  const items = invRepo.getAll('ros-tenant-master');
  const test1Passed = Array.isArray(items) && items.length === 2 && !(items instanceof Promise);
  console.log(`  ${test1Passed ? '✓' : '✗'} Returns Array synchronously without Promise (${items.length} items)`);

  console.log('\nTest 2: SYNCHRONOUS getByCode() RETURN VALUE');
  const chicken = invRepo.getByCode('ITEM-001', 'ros-tenant-master');
  const test2Passed = chicken && chicken.itemName === 'Fresh Chicken' && !(chicken instanceof Promise);
  console.log(`  ${test2Passed ? '✓' : '✗'} Returns item synchronously ("${chicken?.itemName}")`);

  console.log('\nTest 3: SYNCHRONOUS getById() RETURN VALUE');
  const rice = invRepo.getById('inv-2', 'ros-tenant-master');
  const test3Passed = rice && rice.itemName === 'Basmati Rice' && !(rice instanceof Promise);
  console.log(`  ${test3Passed ? '✓' : '✗'} Returns item synchronously ("${rice?.itemName}")`);

  console.log('\nTest 4: UI MAP ITERATION COMPATIBILITY');
  const renderedTitles = items.map(i => i.itemName).join(', ');
  const test4Passed = renderedTitles === 'Fresh Chicken, Basmati Rice';
  console.log(`  ${test4Passed ? '✓' : '✗'} Direct .map() execution succeeded ("${renderedTitles}")`);

  console.log('\nTest 5: FALLBACK TO OFFLINE STORE WHEN GATEWAY IS NULL');
  const fallbackRepo = new InventoryRepository({ offlineStore: mockOfflineStore });
  const fallbackItems = fallbackRepo.getAll('ros-tenant-master');
  const test5Passed = Array.isArray(fallbackItems) && fallbackItems.length === 2;
  console.log(`  ${test5Passed ? '✓' : '✗'} Fallback repository succeeded (${fallbackItems.length} items)`);

  console.log('\n========================================');
  if (test1Passed && test2Passed && test3Passed && test4Passed && test5Passed) {
    console.log('RESULT: PASS (InventoryRepository Read-Path Pilot 100% Synchronous & Compatible)');
  } else {
    console.log('RESULT: FAIL (Read-Path Pilot issue)');
  }
  console.log('========================================');

} catch (err) {
  console.error('FATAL ERROR DURING READ PILOT TEST:', err);
  process.exit(1);
}
