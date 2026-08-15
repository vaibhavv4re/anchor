import { InventoryRepository } from '../businessos/platform/repositories/inventoryRepository.js';
import { SupplierRepository } from '../businessos/platform/repositories/supplierRepository.js';
import { CategoryRepository } from '../businessos/platform/repositories/categoryRepository.js';
import { UomRepository } from '../businessos/platform/repositories/uomRepository.js';
import { StorageLocationRepository } from '../businessos/platform/repositories/storageLocationRepository.js';
import { PurchaseOrderRepository } from '../businessos/platform/repositories/purchaseOrderRepository.js';
import { GoodsReceiptRepository } from '../businessos/platform/repositories/goodsReceiptRepository.js';
import { StockTransferRepository } from '../businessos/platform/repositories/stockTransferRepository.js';
import { StockIssueRepository } from '../businessos/platform/repositories/stockIssueRepository.js';
import { StockAdjustmentRepository } from '../businessos/platform/repositories/stockAdjustmentRepository.js';
import { StockCountRepository } from '../businessos/platform/repositories/stockCountRepository.js';
import { TableRepository } from '../businessos/platform/repositories/tableRepository.js';
import { StaffRepository } from '../businessos/platform/repositories/staffRepository.js';
import { TenantRepository } from '../businessos/platform/repositories/tenantRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';
import { UOM_REGISTRY } from '../businessos/platform/uom/uomRegistry.js';

console.log('====================================================================');
console.log('MASTER 14-REPOSITORY REALTIME DATAGATEWAY ARCHITECTURE SUITE');
console.log('====================================================================\n');

try {
  const mockOfflineStore = {
    collections: {
      inventory: [],
      suppliers: [],
      inventory_categories: [],
      inventory_uoms: [],
      storage_locations: [],
      purchase_orders: [],
      goods_receipt_notes: [],
      stock_transfers: [],
      stock_issues: [],
      stock_adjustments: [],
      stock_counts: [],
      tables_master: [],
      employees: [],
      tenants: [
        { id: 'ros-tenant-master', tenantId: 'ros-tenant-master', identity: { businessName: 'Anchor Master' }, status: 'ACTIVE' }
      ],
      stock_ledger: [],
      stock_balances: []
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

  // Instantiate all 14 Repositories wired to the exact same DataGateway
  const catRepo = new CategoryRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });
  const supRepo = new SupplierRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });
  const uomRepo = new UomRepository({ dataGateway: gateway, offlineStore: mockOfflineStore, uomRegistry: UOM_REGISTRY });
  const locRepo = new StorageLocationRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });
  const invRepo = new InventoryRepository({ dataGateway: gateway, offlineStore: mockOfflineStore, categoryRepository: catRepo });
  const poRepo = new PurchaseOrderRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });
  const grnRepo = new GoodsReceiptRepository({ dataGateway: gateway, offlineStore: mockOfflineStore, inventoryRepository: invRepo, purchaseOrderRepository: poRepo });
  const trfRepo = new StockTransferRepository({ dataGateway: gateway, offlineStore: mockOfflineStore, inventoryRepository: invRepo });
  const issRepo = new StockIssueRepository({ dataGateway: gateway, offlineStore: mockOfflineStore, inventoryRepository: invRepo });
  const adjRepo = new StockAdjustmentRepository({ dataGateway: gateway, offlineStore: mockOfflineStore, inventoryRepository: invRepo });
  const cntRepo = new StockCountRepository({ dataGateway: gateway, offlineStore: mockOfflineStore, stockAdjustmentRepository: adjRepo });
  const tblRepo = new TableRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });
  const staffRepo = new StaffRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });
  const tenantRepo = new TenantRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });

  const session = { employeeName: 'System Administrator', tenantId: 'ros-tenant-master' };

  console.log('1. VERIFY ALL 14 REPOSITORIES INSTANTIATED & WIRED TO DATAGATEWAY');
  const repoList = [
    { name: 'CategoryRepository', repo: catRepo },
    { name: 'SupplierRepository', repo: supRepo },
    { name: 'UomRepository', repo: uomRepo },
    { name: 'StorageLocationRepository', repo: locRepo },
    { name: 'InventoryRepository', repo: invRepo },
    { name: 'PurchaseOrderRepository', repo: poRepo },
    { name: 'GoodsReceiptRepository', repo: grnRepo },
    { name: 'StockTransferRepository', repo: trfRepo },
    { name: 'StockIssueRepository', repo: issRepo },
    { name: 'StockAdjustmentRepository', repo: adjRepo },
    { name: 'StockCountRepository', repo: cntRepo },
    { name: 'TableRepository', repo: tblRepo },
    { name: 'StaffRepository', repo: staffRepo },
    { name: 'TenantRepository', repo: tenantRepo }
  ];

  const m1Passed = repoList.every(r => r.repo && r.repo.dataGateway === gateway);
  console.log(`  ${m1Passed ? '✓' : '✗'} All 14 Domain Repositories successfully share single DataGateway instance`);

  console.log('\n2. END-TO-END MASTER INTEGRATION FLOW');
  // A. Master Data Pre-seeding
  catRepo.getAll('ros-tenant-master');
  supRepo.getAll('ros-tenant-master');
  uomRepo.getAll('ros-tenant-master');
  locRepo.getAll('ros-tenant-master');

  // B. Inventory Creation
  const item = invRepo.create({
    itemCode: 'RM-BUTTER',
    itemName: 'Unsalted Amul Butter 500g',
    categoryCode: 'CAT-DAIRY',
    preferredSupplierCode: 'SUP-001',
    defaultLocationCode: 'LOC-CHILL',
    baseUom: 'KG',
    unitValuation: 400
  }, session);

  // C. PO Creation & Approval
  const po = poRepo.create({
    poNumber: 'PO-MASTER-001',
    supplierCode: 'SUP-001',
    items: [{ itemCode: 'RM-BUTTER', orderedQuantity: 20, unitPrice: 400 }]
  }, session);
  poRepo.update(po.id, { status: 'APPROVED' }, session);

  // D. Goods Receipt
  grnRepo.postGRN({
    postingId: 'post-master-grn',
    poNumber: 'PO-MASTER-001',
    receivingLocationCode: 'LOC-CHILL',
    lines: [{ itemCode: 'RM-BUTTER', acceptedQty: 20, actualPurchaseUnitPrice: 400 }]
  }, session);

  // E. Stock Transfer
  trfRepo.postTransfer({
    postingId: 'post-master-trf',
    fromLocationCode: 'LOC-CHILL',
    toLocationCode: 'LOC-KITCHEN',
    lines: [{ itemCode: 'RM-BUTTER', quantity: 5 }]
  }, session);

  // F. Stock Issue
  issRepo.postIssue({
    postingId: 'post-master-iss',
    fromLocationCode: 'LOC-KITCHEN',
    issuedToDepartment: 'Pastry Line',
    lines: [{ itemCode: 'RM-BUTTER', quantity: 2 }]
  }, session);

  // G. Stock Audit Count (3 KG physical in Kitchen vs 3 KG system -> zero variance)
  const cntRes = cntRepo.reconcileCount({
    postingId: 'post-master-cnt',
    locationCode: 'LOC-KITCHEN',
    lines: [{ itemCode: 'RM-BUTTER', systemQuantity: 3, physicalQuantity: 3 }]
  }, session);

  // H. Restaurant Assets
  tblRepo.create({ tableCode: 'TBL-VIP-1', tableName: 'VIP Booth 1' }, session);
  staffRepo.create({ employeeCode: 'EMP-99', name: 'Pastry Chef' }, session);
  tenantRepo.updateSection('ros-tenant-master', 'identity', { businessName: 'Anchor Master Suite' }, session);

  const m2Passed = cntRes.success &&
                   gateway.getCachedCollection('stock_balances', 'ros-tenant-master').length >= 2 &&
                   gateway.getCachedCollection('stock_ledger', 'ros-tenant-master').length >= 3 &&
                   invRepo.getByCode('RM-BUTTER', 'ros-tenant-master').currentStock === undefined;

  console.log(`  ${m2Passed ? '✓' : '✗'} Complete multi-repository transaction lifecycle executed synchronously without side effects`);

  console.log('\n====================================================================');
  if (m1Passed && m2Passed) {
    console.log('MASTER 14-REPOSITORY DATAGATEWAY INTEGRATION RESULT: PASS 🏆');
  } else {
    console.log('MASTER 14-REPOSITORY DATAGATEWAY INTEGRATION RESULT: FAIL');
  }
  console.log('====================================================================');

} catch (err) {
  console.error('FATAL ERROR DURING MASTER DATAGATEWAY INTEGRATION TEST:', err);
  process.exit(1);
}
