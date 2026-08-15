import { InventoryRepository } from '../businessos/platform/repositories/inventoryRepository.js';
import { SupplierRepository } from '../businessos/platform/repositories/supplierRepository.js';
import { CategoryRepository } from '../businessos/platform/repositories/categoryRepository.js';
import { UomRepository } from '../businessos/platform/repositories/uomRepository.js';
import { StorageLocationRepository } from '../businessos/platform/repositories/storageLocationRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';
import { UomConversionEngine } from '../businessos/platform/uom/uomConversionEngine.js';
import { UOM_REGISTRY } from '../businessos/platform/uom/uomRegistry.js';

console.log('====================================================');
console.log('GROUP A (MASTER DATA & INVENTORY) INTEGRATION TEST');
console.log('====================================================\n');

try {
  const mockOfflineStore = {
    collections: {
      inventory: [],
      suppliers: [],
      inventory_categories: [],
      inventory_uoms: [],
      storage_locations: []
    },
    getCollection(name) { return this.collections[name] || []; },
    setCollection(name, data) { this.collections[name] = data; },
    appendItem(name, item) { (this.collections[name] = this.collections[name] || []).push(item); return item; }
  };

  const mockSyncJobs = [];
  const mockOfflineJournal = {
    createSyncJob(jobType, tenantId, entityName, payload, session) {
      mockSyncJobs.push({ jobType, tenantId, entityName, payload, session });
    }
  };

  const realtime = new SupabaseRealtime();
  const gateway = new DataGateway({
    offlineStore: mockOfflineStore,
    offlineJournal: mockOfflineJournal,
    realtime,
    isOnline: true
  });

  const catRepo = new CategoryRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });
  const supRepo = new SupplierRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });
  const uomRepo = new UomRepository({ dataGateway: gateway, offlineStore: mockOfflineStore, uomRegistry: UOM_REGISTRY });
  const locRepo = new StorageLocationRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });
  const invRepo = new InventoryRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore,
    categoryRepository: catRepo,
    offlineJournal: mockOfflineJournal
  });
  const uomEngine = new UomConversionEngine(UOM_REGISTRY);

  const session = { employeeName: 'Master Data Admin', tenantId: 'ros-tenant-master' };

  console.log('1. PRE-SEED CANONICAL MASTER DATA');
  const categories = catRepo.getAll('ros-tenant-master');
  const suppliers = supRepo.getAll('ros-tenant-master');
  const uoms = uomRepo.getAll('ros-tenant-master');
  const locations = locRepo.getAll('ros-tenant-master');

  const g1Passed = categories.length >= 15 && suppliers.length >= 4 && uoms.length >= 10 && locations.length >= 6;
  console.log(`  ${g1Passed ? '✓' : '✗'} Canonical pre-seeding verified (${categories.length} Categories, ${suppliers.length} Suppliers, ${uoms.length} UOMs, ${locations.length} Locations)`);

  console.log('\n2. CREATE DOMAIN BOUND INVENTORY ITEM WITH MASTER DATA');
  const cat = catRepo.getByCode('CAT-CHICKEN', 'ros-tenant-master');
  const sup = supRepo.getByCode('SUP-001', 'ros-tenant-master');
  const loc = locRepo.getByCode('LOC-CHILL', 'ros-tenant-master');

  const item = invRepo.create({
    itemCode: 'RM-CHICKEN-WHOLE',
    itemName: 'Whole Fresh Chicken (Skinless)',
    categoryCode: cat.categoryCode,
    preferredSupplierCode: sup.supplierCode,
    defaultLocationCode: loc.locationCode,
    baseUom: 'KG',
    unitValuation: 210
  }, session);

  const g2Passed = item &&
                   item.categoryName === 'Chicken' &&
                   item.productFamilyCode === 'FAM-MEAT' &&
                   item.preferredSupplierCode === 'SUP-001' &&
                   item.defaultLocationCode === 'LOC-CHILL' &&
                   !(item instanceof Promise);
  console.log(`  ${g2Passed ? '✓' : '✗'} Inventory item created with master data associations ("${item?.itemName}", Family: ${item?.productFamilyCode})`);

  console.log('\n3. UOM CONVERSION FOR INVENTORY ISSUE');
  const convertRes = uomEngine.convertQuantity(15, 'KG', 'G');
  const g3Passed = convertRes.success && convertRes.convertedQty === 15000;
  console.log(`  ${g3Passed ? '✓' : '✗'} Stock quantity conversion: 15 KG -> ${convertRes.convertedQty} G`);

  console.log('\n4. ARCHIVE SAFETY VALIDATION ACROSS MASTER DATA');
  const archiveLocResult = locRepo.archive('LOC-CHILL', session);
  const archiveSupResult = supRepo.archive('SUP-001', session);

  const locErrMsg = archiveLocResult.error ? archiveLocResult.error.split('\n')[0] : '';
  const supErrMsg = archiveSupResult.error ? archiveSupResult.error.split('\n')[0] : '';

  const g4Passed = !archiveLocResult.success && !archiveSupResult.success;
  console.log(`  ${g4Passed ? '✓' : '✗'} Archive safety rules blocked deleting active master data (Loc: "${locErrMsg}", Sup: "${supErrMsg}")`);

  console.log('\n5. REALTIME CROSS-COLLECTION CLOUD UPDATE');
  realtime.handleIncomingPayload('inventory_categories', 'UPDATE', {
    id: cat.id,
    categoryCode: 'CAT-CHICKEN',
    categoryName: 'Premium Fresh Chicken',
    productFamilyCode: 'FAM-MEAT',
    tenantId: 'ros-tenant-master'
  });

  const reReadCat = catRepo.getByCode('CAT-CHICKEN', 'ros-tenant-master');
  const g5Passed = reReadCat && reReadCat.categoryName === 'Premium Fresh Chicken';
  console.log(`  ${g5Passed ? '✓' : '✗'} Realtime cloud event updated category cache ("${reReadCat?.categoryName}")`);

  console.log('\n====================================================');
  if (g1Passed && g2Passed && g3Passed && g4Passed && g5Passed) {
    console.log('GROUP A ACCEPTANCE RESULT: PASS (All Master Data Repositories Integrated & Validated)');
  } else {
    console.log('GROUP A ACCEPTANCE RESULT: FAIL (Integration error)');
  }
  console.log('====================================================');

} catch (err) {
  console.error('FATAL ERROR DURING GROUP A INTEGRATION TEST:', err);
  process.exit(1);
}
