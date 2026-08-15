import { SupplierRepository } from '../businessos/platform/repositories/supplierRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('========================================');
console.log('SUPPLIER REPOSITORY DATA GATEWAY TEST');
console.log('========================================\n');

try {
  const mockOfflineStore = {
    collections: { suppliers: [] },
    getCollection(name) { return this.collections[name] || []; },
    setCollection(name, data) { this.collections[name] = data; },
    appendItem(name, item) { (this.collections[name] = this.collections[name] || []).push(item); return item; }
  };

  const realtime = new SupabaseRealtime();
  const gateway = new DataGateway({
    offlineStore: mockOfflineStore,
    realtime
  });

  const supRepo = new SupplierRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore
  });

  console.log('Test 1: SYNCHRONOUS getAll() & PRE-SEED');
  const suppliers = supRepo.getAll('ros-tenant-master');
  const test1Passed = Array.isArray(suppliers) && suppliers.length >= 4 && !(suppliers instanceof Promise);
  console.log(`  ${test1Passed ? '✓' : '✗'} Synchronously returned ${suppliers.length} pre-seeded suppliers`);

  console.log('\nTest 2: SYNCHRONOUS getByCode()');
  const sup1 = supRepo.getByCode('SUP-001', 'ros-tenant-master');
  const test2Passed = sup1 && sup1.supplierName === 'Prime Foods' && !(sup1 instanceof Promise);
  console.log(`  ${test2Passed ? '✓' : '✗'} Returns supplier synchronously ("${sup1?.supplierName}")`);

  console.log('\nTest 3: SYNCHRONOUS create()');
  const session = { employeeName: 'Procurement Officer', tenantId: 'ros-tenant-master' };
  const newSup = supRepo.create({
    supplierCode: 'SUP-005',
    supplierName: 'Himalayan Organic Spices',
    contactPerson: 'Karan Thapa',
    phone: '+91 98999 11222'
  }, session);

  const test3Passed = newSup && newSup.supplierCode === 'SUP-005' &&
                      !(newSup instanceof Promise) &&
                      supRepo.getByCode('SUP-005', 'ros-tenant-master') !== null;
  console.log(`  ${test3Passed ? '✓' : '✗'} Created supplier synchronously ("${newSup?.supplierName}")`);

  console.log('\nTest 4: REALTIME CLOUD UPDATE INVALIDATION');
  const realtimeUpdate = {
    id: newSup.id,
    supplierCode: 'SUP-005',
    supplierName: 'Himalayan Organic Spices Direct',
    contactPerson: 'Karan Thapa (Director)',
    tenantId: 'ros-tenant-master'
  };

  realtime.handleIncomingPayload('suppliers', 'UPDATE', realtimeUpdate);
  const updatedSup = supRepo.getByCode('SUP-005', 'ros-tenant-master');
  const test4Passed = updatedSup && updatedSup.supplierName === 'Himalayan Organic Spices Direct' && !(updatedSup instanceof Promise);
  console.log(`  ${test4Passed ? '✓' : '✗'} Realtime event invalidated local cache & re-read returned updated supplier ("${updatedSup?.supplierName}")`);

  console.log('\n========================================');
  if (test1Passed && test2Passed && test3Passed && test4Passed) {
    console.log('RESULT: PASS (SupplierRepository DataGateway Migration Verified)');
  } else {
    console.log('RESULT: FAIL (SupplierRepository DataGateway Migration issue)');
  }
  console.log('========================================');

} catch (err) {
  console.error('FATAL ERROR DURING SUPPLIER GATEWAY TEST:', err);
  process.exit(1);
}
