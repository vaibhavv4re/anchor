import { UomRepository } from '../businessos/platform/repositories/uomRepository.js';
import { UomConversionEngine } from '../businessos/platform/uom/uomConversionEngine.js';
import { UOM_REGISTRY } from '../businessos/platform/uom/uomRegistry.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('========================================');
console.log('UOM REPOSITORY DATA GATEWAY TEST');
console.log('========================================\n');

try {
  const mockOfflineStore = {
    collections: { inventory_uoms: [] },
    getCollection(name) { return this.collections[name] || []; },
    setCollection(name, data) { this.collections[name] = data; },
    appendItem(name, item) { (this.collections[name] = this.collections[name] || []).push(item); return item; }
  };

  const realtime = new SupabaseRealtime();
  const gateway = new DataGateway({
    offlineStore: mockOfflineStore,
    realtime
  });

  const uomRepo = new UomRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore,
    uomRegistry: UOM_REGISTRY
  });

  const uomEngine = new UomConversionEngine(UOM_REGISTRY);

  console.log('Test 1: SYNCHRONOUS getAll() & CANONICAL UOM PRE-SEEDING');
  const uoms = uomRepo.getAll('ros-tenant-master');
  const test1Passed = Array.isArray(uoms) && uoms.length >= 10 && !(uoms instanceof Promise);
  console.log(`  ${test1Passed ? '✓' : '✗'} Returned ${uoms.length} canonical pre-seeded UOMs synchronously`);

  console.log('\nTest 2: SYNCHRONOUS getByCode() & getById()');
  const kgUom = uomRepo.getByCode('KG', 'ros-tenant-master');
  const kgById = uomRepo.getById('uom-kg', 'ros-tenant-master');
  const test2Passed = kgUom && kgUom.uomName === 'Kilogram' &&
                      kgById && kgById.uomCode === 'KG' &&
                      !(kgUom instanceof Promise);
  console.log(`  ${test2Passed ? '✓' : '✗'} Returns UOM synchronously ("${kgUom?.uomName}")`);

  console.log('\nTest 3: SYNCHRONOUS create() CUSTOM UOM');
  const session = { employeeName: 'Store Manager', tenantId: 'ros-tenant-master' };
  const customUom = uomRepo.create({
    uomCode: 'JUMBO_BAG',
    uomName: 'Jumbo Storage Bag 50kg',
    uomFamily: 'WEIGHT',
    conversionFactor: 50
  }, session);

  const test3Passed = customUom && customUom.uomCode === 'JUMBO_BAG' &&
                      !(customUom instanceof Promise) &&
                      uomRepo.getByCode('JUMBO_BAG', 'ros-tenant-master') !== null;
  console.log(`  ${test3Passed ? '✓' : '✗'} Created custom UOM synchronously ("${customUom?.uomName}")`);

  console.log('\nTest 4: REALTIME CLOUD UPDATE INVALIDATION');
  const realtimeUpdate = {
    id: customUom.id,
    uomCode: 'JUMBO_BAG',
    uomName: 'Jumbo Bulk Storage Bag 50kg',
    uomFamily: 'WEIGHT',
    conversionFactor: 50,
    tenantId: 'ros-tenant-master'
  };

  realtime.handleIncomingPayload('inventory_uoms', 'UPDATE', realtimeUpdate);
  const updatedUom = uomRepo.getByCode('JUMBO_BAG', 'ros-tenant-master');
  const test4Passed = updatedUom && updatedUom.uomName === 'Jumbo Bulk Storage Bag 50kg' && !(updatedUom instanceof Promise);
  console.log(`  ${test4Passed ? '✓' : '✗'} Realtime event invalidated local cache & re-read returned updated UOM ("${updatedUom?.uomName}")`);

  console.log('\nTest 5: CONVERSION ENGINE INTEGRATION');
  const conversionResult = uomEngine.convertQuantity(2.5, 'KG', 'G');
  const test5Passed = conversionResult.success && conversionResult.convertedQty === 2500;
  console.log(`  ${test5Passed ? '✓' : '✗'} UomConversionEngine intact (2.5 KG -> ${conversionResult.convertedQty} G)`);

  console.log('\n========================================');
  if (test1Passed && test2Passed && test3Passed && test4Passed && test5Passed) {
    console.log('RESULT: PASS (UomRepository DataGateway Migration Verified)');
  } else {
    console.log('RESULT: FAIL (UomRepository DataGateway issue)');
  }
  console.log('========================================');

} catch (err) {
  console.error('FATAL ERROR DURING UOM GATEWAY TEST:', err);
  process.exit(1);
}
