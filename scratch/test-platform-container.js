import { createPlatformContainer } from '../businessos/platform/platformContainer.js';

console.log('========================================');
console.log('PLATFORM CONTAINER COMPOSITION SMOKE TEST');
console.log('========================================\n');

try {
  // Mock simple offlineStore for test container environment
  const mockStore = {
    collections: {},
    getCollection(name) { return this.collections[name] || []; },
    setCollection(name, data) { this.collections[name] = data; },
    appendItem(name, item) { (this.collections[name] = this.collections[name] || []).push(item); },
    updateItem(name, key, val, item) {
      const col = this.getCollection(name);
      const idx = col.findIndex(i => i[key] === val);
      if (idx !== -1) col[idx] = item;
    }
  };

  const platform = createPlatformContainer({
    offlineStore: mockStore,
    autoInitRepositories: true
  });

  console.log('Services Check:');
  const services = [
    'offlineStore',
    'offlineJournal',
    'auditLogger',
    'entityMetadata',
    'productFamilies',
    'uomRegistry',
    'uomEngine'
  ];

  let servicesPassed = true;
  services.forEach(svc => {
    const ok = !!platform.services[svc];
    console.log(`  ${ok ? '✓' : '✗'} ${svc}`);
    if (!ok) servicesPassed = false;
  });

  console.log('\nCloud Adapter Check:');
  let cloudPassed = true;
  if (!platform.cloud?.supabase) {
    console.log('  ✗ cloud.supabase missing');
    cloudPassed = false;
  } else {
    console.log('  ✓ cloud.supabase');
    const methods = ['fetchTableData', 'upsertRecord', 'deleteRecords'];
    methods.forEach(m => {
      const ok = typeof platform.cloud.supabase[m] === 'function';
      console.log(`  ${ok ? '✓' : '✗'} cloud.supabase.${m}`);
      if (!ok) cloudPassed = false;
    });
  }

  console.log('\nRepositories Check:');
  const repos = [
    'category',
    'supplier',
    'storageLocation',
    'uom',
    'inventory',
    'purchaseOrder',
    'goodsReceipt',
    'stockTransfer',
    'stockIssue',
    'stockAdjustment',
    'stockCount',
    'table',
    'staff',
    'tenant'
  ];

  let reposPassed = true;
  repos.forEach(repo => {
    const ok = !!platform.repositories[repo];
    console.log(`  ${ok ? '✓' : '✗'} ${repo}`);
    if (!ok) reposPassed = false;
  });

  console.log('\nDependency Wiring Check:');
  const wiring = [
    { name: 'inventory → category', check: platform.repositories.inventory.categoryRepository === platform.repositories.category },
    { name: 'goodsReceipt → inventory', check: platform.repositories.goodsReceipt.inventoryRepository === platform.repositories.inventory },
    { name: 'goodsReceipt → purchaseOrder', check: platform.repositories.goodsReceipt.purchaseOrderRepository === platform.repositories.purchaseOrder },
    { name: 'stockTransfer → inventory', check: platform.repositories.stockTransfer.inventoryRepository === platform.repositories.inventory },
    { name: 'stockIssue → inventory', check: platform.repositories.stockIssue.inventoryRepository === platform.repositories.inventory },
    { name: 'stockAdjustment → inventory', check: platform.repositories.stockAdjustment.inventoryRepository === platform.repositories.inventory },
    { name: 'stockCount → stockAdjustment', check: platform.repositories.stockCount.stockAdjustmentRepository === platform.repositories.stockAdjustment }
  ];

  let wiringPassed = true;
  wiring.forEach(w => {
    console.log(`  ${w.check ? '✓' : '✗'} ${w.name}`);
    if (!w.check) wiringPassed = false;
  });

  console.log('\n========================================');
  if (servicesPassed && cloudPassed && reposPassed && wiringPassed) {
    console.log('RESULT: PASS (Services, Cloud Adapter & 14 Repositories Wired Correctly)');
  } else {
    console.log('RESULT: FAIL (Some dependencies missing or mismatched)');
  }
  console.log('========================================');

} catch (err) {
  console.error('FATAL ERROR DURING SMOKE TEST:', err);
  process.exit(1);
}
