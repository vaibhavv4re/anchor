import { PurchaseOrderRepository } from '../businessos/platform/repositories/purchaseOrderRepository.js';
import { GoodsReceiptRepository } from '../businessos/platform/repositories/goodsReceiptRepository.js';
import { InventoryRepository } from '../businessos/platform/repositories/inventoryRepository.js';
import { SupplierRepository } from '../businessos/platform/repositories/supplierRepository.js';
import { StorageLocationRepository } from '../businessos/platform/repositories/storageLocationRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('======================================================');
console.log('GROUP B (PROCUREMENT & GRN LEDGER) INTEGRATION TEST');
console.log('======================================================\n');

try {
  const mockOfflineStore = {
    collections: {
      purchase_orders: [],
      goods_receipt_notes: [],
      inventory: [
        { id: 'inv-301', itemCode: 'RM-MUTTON', itemName: 'Fresh Mutton Chops', lastPurchasePrice: 600, unitValuation: 600, tenantId: 'ros-tenant-master' }
      ],
      suppliers: [
        { id: 'sup-002', supplierCode: 'SUP-002', supplierName: 'Oceanic Fresh Seafood', status: 'ACTIVE' }
      ],
      storage_locations: [
        { id: 'loc-3', locationCode: 'LOC-CHILL', locationName: 'Walk-in Chiller', status: 'ACTIVE' }
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

  const invRepo = new InventoryRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });
  const supRepo = new SupplierRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });
  const locRepo = new StorageLocationRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });
  const poRepo = new PurchaseOrderRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });
  const grnRepo = new GoodsReceiptRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore,
    offlineJournal: mockOfflineJournal,
    inventoryRepository: invRepo,
    purchaseOrderRepository: poRepo
  });

  const session = { employeeName: 'Head of Procurement', tenantId: 'ros-tenant-master' };

  console.log('1. CREATE & APPROVE PURCHASE ORDER');
  const po = poRepo.create({
    poNumber: 'PO-2026-1001',
    supplierCode: 'SUP-002',
    supplierName: 'Oceanic Fresh Seafood',
    destinationLocationCode: 'LOC-CHILL',
    items: [
      { itemCode: 'RM-MUTTON', itemName: 'Fresh Mutton Chops', orderedQuantity: 50, unitPrice: 650 }
    ],
    subtotal: 32500,
    taxAmount: 1625,
    grandTotal: 34125
  }, session);

  poRepo.update(po.id, { status: 'APPROVED', approvedBy: 'General Manager' }, session);
  const approvedPo = poRepo.getByPoNumber('PO-2026-1001', 'ros-tenant-master');

  const b1Passed = approvedPo && approvedPo.status === 'APPROVED' && !(approvedPo instanceof Promise);
  console.log(`  ${b1Passed ? '✓' : '✗'} Purchase Order created & approved ("${approvedPo?.poNumber}", Status: ${approvedPo?.status})`);

  console.log('\n2. POST PARTIAL GOODS RECEIPT (30 / 50 KG)');
  const grn1Result = grnRepo.postGRN({
    postingId: 'procurement-post-001',
    poNumber: 'PO-2026-1001',
    supplierCode: 'SUP-002',
    supplierName: 'Oceanic Fresh Seafood',
    receivingLocationCode: 'LOC-CHILL',
    lines: [
      { itemCode: 'RM-MUTTON', acceptedQty: 30, actualPurchaseUnitPrice: 650, baseUom: 'KG' }
    ]
  }, session);

  const poAfterGrn1 = poRepo.getByPoNumber('PO-2026-1001', 'ros-tenant-master');
  const b2Passed = grn1Result.success && poAfterGrn1.status === 'PARTIALLY_RECEIVED';
  console.log(`  ${b2Passed ? '✓' : '✗'} Partial GRN posted -> PO status updated to "${poAfterGrn1?.status}"`);

  console.log('\n3. VERIFY LEDGER ENTRY & INVENTORY VALUATION UPDATE');
  const ledger = gateway.getCachedCollection('stock_ledger', 'ros-tenant-master');
  const balances = gateway.getCachedCollection('stock_balances', 'ros-tenant-master');
  const muttonItem = invRepo.getByCode('RM-MUTTON', 'ros-tenant-master');

  const b3Passed = ledger.length === 1 && ledger[0].baseQuantity === 30 &&
                   balances.length === 1 && balances[0].quantity === 30 &&
                   muttonItem.lastPurchasePrice === 650 && muttonItem.currentStock === undefined;

  console.log(`  ${b3Passed ? '✓' : '✗'} Ledger entry generated (30 KG), store balance updated & master item valuation updated to ₹650 (currentStock unmutated)`);

  console.log('\n4. POST FINAL GRN (20 / 50 KG) -> FULL RECEIPT COMPLETION');
  const grn2Result = grnRepo.postGRN({
    postingId: 'procurement-post-002',
    poNumber: 'PO-2026-1001',
    supplierCode: 'SUP-002',
    supplierName: 'Oceanic Fresh Seafood',
    receivingLocationCode: 'LOC-CHILL',
    lines: [
      { itemCode: 'RM-MUTTON', acceptedQty: 20, actualPurchaseUnitPrice: 650, baseUom: 'KG' }
    ]
  }, session);

  const poFinal = poRepo.getByPoNumber('PO-2026-1001', 'ros-tenant-master');
  const finalBalances = gateway.getCachedCollection('stock_balances', 'ros-tenant-master');

  const b4Passed = grn2Result.success && poFinal.status === 'FULLY_RECEIVED' && finalBalances[0].quantity === 50;
  console.log(`  ${b4Passed ? '✓' : '✗'} Final GRN posted -> PO status completed to "${poFinal?.status}", total stock balance: 50 KG`);

  console.log('\n5. IDEMPOTENCY REPLAY SAFETY');
  const retryResult = grnRepo.postGRN({
    postingId: 'procurement-post-001',
    poNumber: 'PO-2026-1001',
    lines: [{ itemCode: 'RM-MUTTON', acceptedQty: 30 }]
  }, session);

  const currentLedger = gateway.getCachedCollection('stock_ledger', 'ros-tenant-master');
  const b5Passed = retryResult.success && retryResult.idempotentRetry === true && currentLedger.length === 2;
  console.log(`  ${b5Passed ? '✓' : '✗'} Duplicate submission cleanly blocked via postingId idempotency (Ledger size: ${currentLedger.length})`);

  console.log('\n======================================================');
  if (b1Passed && b2Passed && b3Passed && b4Passed && b5Passed) {
    console.log('GROUP B ACCEPTANCE RESULT: PASS (Procurement & GRN Ledger Engine Validated)');
  } else {
    console.log('GROUP B ACCEPTANCE RESULT: FAIL (Procurement integration error)');
  }
  console.log('======================================================');

} catch (err) {
  console.error('FATAL ERROR DURING GROUP B INTEGRATION TEST:', err);
  process.exit(1);
}
