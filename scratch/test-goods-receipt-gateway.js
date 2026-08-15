import { GoodsReceiptRepository } from '../businessos/platform/repositories/goodsReceiptRepository.js';
import { InventoryRepository } from '../businessos/platform/repositories/inventoryRepository.js';
import { PurchaseOrderRepository } from '../businessos/platform/repositories/purchaseOrderRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('==================================================');
console.log('GOODS RECEIPT REPOSITORY DATA GATEWAY TEST');
console.log('==================================================\n');

try {
  const mockOfflineStore = {
    collections: {
      goods_receipt_notes: [],
      purchase_orders: [],
      inventory: [
        { id: 'inv-101', itemCode: 'RM-CHICKEN', itemName: 'Fresh Chicken', lastPurchasePrice: 200, unitValuation: 200, tenantId: 'ros-tenant-master' }
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
  const poRepo = new PurchaseOrderRepository({ dataGateway: gateway, offlineStore: mockOfflineStore });
  const grnRepo = new GoodsReceiptRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore,
    offlineJournal: mockOfflineJournal,
    inventoryRepository: invRepo,
    purchaseOrderRepository: poRepo
  });

  const session = { employeeName: 'Receiving Manager', tenantId: 'ros-tenant-master' };

  // Setup initial Linked PO
  const po = poRepo.create({
    poNumber: 'PO-2026-0099',
    supplierCode: 'SUP-001',
    supplierName: 'Prime Foods',
    items: [{ itemCode: 'RM-CHICKEN', itemName: 'Fresh Chicken', orderedQuantity: 100, unitPrice: 220 }],
    status: 'APPROVED'
  }, session);

  console.log('Test 1: SYNCHRONOUS postGRN() & STOCK LEDGER / BALANCES VERIFICATION');
  const post1 = grnRepo.postGRN({
    postingId: 'post-grn-001',
    poNumber: 'PO-2026-0099',
    supplierCode: 'SUP-001',
    supplierName: 'Prime Foods',
    receivingLocationCode: 'LOC-CHILL',
    lines: [
      { itemCode: 'RM-CHICKEN', acceptedQty: 40, actualPurchaseUnitPrice: 220, baseUom: 'KG' }
    ]
  }, session);

  const ledger = gateway.getCachedCollection('stock_ledger', 'ros-tenant-master');
  const balances = gateway.getCachedCollection('stock_balances', 'ros-tenant-master');

  const test1Passed = post1.success && post1.grn && post1.grn.grnNumber === 'GRN-2026-0001' &&
                      ledger.length === 1 && ledger[0].baseQuantity === 40 &&
                      balances.length === 1 && balances[0].quantity === 40 &&
                      !(post1 instanceof Promise);

  console.log(`  ${test1Passed ? '✓' : '✗'} GRN posted synchronously ("${post1.grn?.grnNumber}", Qty: 40 KG in LOC-CHILL)`);

  console.log('\nTest 2: INVENTORY MASTER ITEM VALUATION UPDATE & NO currentStock MUTATION');
  const masterItem = invRepo.getByCode('RM-CHICKEN', 'ros-tenant-master');
  const test2Passed = masterItem && masterItem.lastPurchasePrice === 220 && masterItem.unitValuation === 220 && masterItem.currentStock === undefined;
  console.log(`  ${test2Passed ? '✓' : '✗'} Master item valuation updated to ₹${masterItem?.unitValuation} (currentStock remains clean & unmutated)`);

  console.log('\nTest 3: LINKED PO PARTIAL RECEIPT STATUS TRANSITION');
  const poPartial = poRepo.getByPoNumber('PO-2026-0099', 'ros-tenant-master');
  const test3Passed = poPartial && poPartial.status === 'PARTIALLY_RECEIVED';
  console.log(`  ${test3Passed ? '✓' : '✗'} PO status updated to "${poPartial?.status}" (40 / 100 received)`);

  console.log('\nTest 4: IDEMPOTENCY CHECK (POSTING SAME postingId TWICE)');
  const postRetry = grnRepo.postGRN({
    postingId: 'post-grn-001',
    poNumber: 'PO-2026-0099',
    lines: [{ itemCode: 'RM-CHICKEN', acceptedQty: 40 }]
  }, session);

  const test4Passed = postRetry.success && postRetry.idempotentRetry === true && ledger.length === 1;
  console.log(`  ${test4Passed ? '✓' : '✗'} Idempotency retry detected & duplicate stock creation blocked (idempotentRetry: true)`);

  console.log('\nTest 5: PO FULL RECEIPT COMPLETION');
  const post2 = grnRepo.postGRN({
    postingId: 'post-grn-002',
    poNumber: 'PO-2026-0099',
    receivingLocationCode: 'LOC-CHILL',
    lines: [
      { itemCode: 'RM-CHICKEN', acceptedQty: 60, actualPurchaseUnitPrice: 220, baseUom: 'KG' }
    ]
  }, session);

  const poFull = poRepo.getByPoNumber('PO-2026-0099', 'ros-tenant-master');
  const test5Passed = post2.success && poFull && poFull.status === 'FULLY_RECEIVED';
  console.log(`  ${test5Passed ? '✓' : '✗'} Final GRN posted (60 KG) -> PO status updated to "${poFull?.status}"`);

  console.log('\nTest 6: OFFLINE MODE JOURNALING');
  gateway.setOnlineState(false);
  const postOffline = grnRepo.postGRN({
    postingId: 'post-grn-003',
    documentType: 'OPENING_STOCK',
    receivingLocationCode: 'LOC-MWH',
    lines: [{ itemCode: 'RM-CHICKEN', acceptedQty: 25, actualPurchaseUnitPrice: 220, baseUom: 'KG' }]
  }, session);

  const test6Passed = postOffline.success && mockSyncJobs.length >= 1;
  console.log(`  ${test6Passed ? '✓' : '✗'} Offline GRN posted & queued sync job in OfflineJournal (${mockSyncJobs.length} sync jobs)`);

  console.log('\nTest 7: REALTIME CLOUD UPDATE INVALIDATION');
  gateway.setOnlineState(true);
  const realtimeUpdate = {
    id: post1.grn.id,
    grnNumber: 'GRN-2026-0001',
    inspectionStatus: 'PASSED_WITH_REMARKS',
    notes: 'Realtime verified',
    tenantId: 'ros-tenant-master'
  };

  realtime.handleIncomingPayload('goods_receipt_notes', 'UPDATE', realtimeUpdate);
  const reReadGrn = grnRepo.getByGrnNumber('GRN-2026-0001', 'ros-tenant-master');
  const test7Passed = reReadGrn && reReadGrn.inspectionStatus === 'PASSED_WITH_REMARKS' && !(reReadGrn instanceof Promise);
  console.log(`  ${test7Passed ? '✓' : '✗'} Realtime event invalidated local cache & re-read returned updated inspection status ("${reReadGrn?.inspectionStatus}")`);

  console.log('\n==================================================');
  if (test1Passed && test2Passed && test3Passed && test4Passed && test5Passed && test6Passed && test7Passed) {
    console.log('RESULT: PASS (GoodsReceiptRepository DataGateway & Transaction Engine Verified)');
  } else {
    console.log('RESULT: FAIL (GoodsReceiptRepository DataGateway issue)');
  }
  console.log('==================================================');

} catch (err) {
  console.error('FATAL ERROR DURING GRN GATEWAY TEST:', err);
  process.exit(1);
}
