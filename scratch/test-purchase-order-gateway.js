import { PurchaseOrderRepository } from '../businessos/platform/repositories/purchaseOrderRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('==============================================');
console.log('PURCHASE ORDER REPOSITORY DATA GATEWAY TEST');
console.log('==============================================\n');

try {
  const mockOfflineStore = {
    collections: { purchase_orders: [] },
    getCollection(name) { return this.collections[name] || []; },
    setCollection(name, data) { this.collections[name] = data; },
    appendItem(name, item) { (this.collections[name] = this.collections[name] || []).push(item); return item; }
  };

  const realtime = new SupabaseRealtime();
  const gateway = new DataGateway({
    offlineStore: mockOfflineStore,
    realtime
  });

  const poRepo = new PurchaseOrderRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore
  });

  const session = { employeeName: 'Procurement Officer', tenantId: 'ros-tenant-master' };

  console.log('Test 1: SYNCHRONOUS create()');
  const createdPo = poRepo.create({
    supplierCode: 'SUP-001',
    supplierName: 'Prime Foods',
    destinationLocationCode: 'LOC-MWH',
    items: [{ itemCode: 'RM-1001', itemName: 'Fresh Chicken', orderQty: 50, unitPrice: 200 }],
    grandTotal: 10000
  }, session);

  const test1Passed = createdPo &&
                      createdPo.poNumber === 'PO-2026-0001' &&
                      !(createdPo instanceof Promise) &&
                      poRepo.getByPoNumber('PO-2026-0001', 'ros-tenant-master') !== null;
  console.log(`  ${test1Passed ? '✓' : '✗'} Created purchase order synchronously ("${createdPo?.poNumber}", ₹${createdPo?.grandTotal})`);

  console.log('\nTest 2: SYNCHRONOUS update() (DRAFT -> APPROVED)');
  const updatedPo = poRepo.update(createdPo.id, { status: 'APPROVED', approvedBy: 'General Manager' }, session);
  const test2Passed = updatedPo && updatedPo.status === 'APPROVED' && !(updatedPo instanceof Promise);
  console.log(`  ${test2Passed ? '✓' : '✗'} Updated PO status synchronously ("${updatedPo?.status}")`);

  console.log('\nTest 3: REALTIME CLOUD UPDATE INVALIDATION');
  const realtimeUpdate = {
    id: createdPo.id,
    poNumber: 'PO-2026-0001',
    status: 'PARTIALLY_RECEIVED',
    tenantId: 'ros-tenant-master'
  };

  realtime.handleIncomingPayload('purchase_orders', 'UPDATE', realtimeUpdate);
  const reReadPo = poRepo.getByPoNumber('PO-2026-0001', 'ros-tenant-master');
  const test3Passed = reReadPo && reReadPo.status === 'PARTIALLY_RECEIVED' && !(reReadPo instanceof Promise);
  console.log(`  ${test3Passed ? '✓' : '✗'} Realtime event invalidated local cache & re-read returned updated status ("${reReadPo?.status}")`);

  console.log('\n==============================================');
  if (test1Passed && test2Passed && test3Passed) {
    console.log('RESULT: PASS (PurchaseOrderRepository DataGateway Migration Verified)');
  } else {
    console.log('RESULT: FAIL (PurchaseOrderRepository DataGateway issue)');
  }
  console.log('==============================================');

} catch (err) {
  console.error('FATAL ERROR DURING PO GATEWAY TEST:', err);
  process.exit(1);
}
