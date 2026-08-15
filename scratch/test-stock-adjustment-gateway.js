import { StockAdjustmentRepository } from '../businessos/platform/repositories/stockAdjustmentRepository.js';
import { InventoryRepository } from '../businessos/platform/repositories/inventoryRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('==================================================');
console.log('STOCK ADJUSTMENT REPOSITORY DATA GATEWAY TEST');
console.log('==================================================\n');

try {
  const mockOfflineStore = {
    collections: {
      stock_adjustments: [],
      inventory: [
        { id: 'inv-20', itemCode: 'RM-TOMATO', itemName: 'Fresh Tomatoes 1kg', unitValuation: 40, tenantId: 'ros-tenant-master' }
      ],
      stock_ledger: [],
      stock_balances: [
        { id: 'bal-tomato', itemCode: 'RM-TOMATO', locationCode: 'LOC-KITCHEN', quantity: 50, valuation: 2000, tenantId: 'ros-tenant-master' }
      ]
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
  const adjRepo = new StockAdjustmentRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore,
    offlineJournal: mockOfflineJournal,
    inventoryRepository: invRepo
  });

  const session = { employeeName: 'Store Auditor', tenantId: 'ros-tenant-master' };

  console.log('Test 1: INVALID REASON CODE REJECTION');
  const invalidReasonCheck = adjRepo.postAdjustment({
    locationCode: 'LOC-KITCHEN',
    reasonCode: 'UNAUTHORIZED_REASON',
    lines: [{ itemCode: 'RM-TOMATO', quantity: 5, adjustmentType: 'DECREASE' }]
  }, session);

  const test1Passed = !invalidReasonCheck.success && invalidReasonCheck.error.includes('Invalid adjustment reason code');
  console.log(`  ${test1Passed ? '✓' : '✗'} Rejected invalid reason code ("${invalidReasonCheck.error.split('\n')[0]}")`);

  console.log('\nTest 2: DECREASE ADJUSTMENT (SPOILAGE)');
  const decreasePost = adjRepo.postAdjustment({
    postingId: 'adj-post-001',
    locationCode: 'LOC-KITCHEN',
    reasonCode: 'SPOILAGE',
    lines: [{ itemCode: 'RM-TOMATO', quantity: 5, adjustmentType: 'DECREASE', baseUom: 'KG' }]
  }, session);

  const ledger1 = gateway.getCachedCollection('stock_ledger', 'ros-tenant-master');
  const balances1 = gateway.getCachedCollection('stock_balances', 'ros-tenant-master');
  const tomBal1 = balances1.find(b => b.itemCode === 'RM-TOMATO' && b.locationCode === 'LOC-KITCHEN');
  const tomMaster1 = invRepo.getByCode('RM-TOMATO', 'ros-tenant-master');

  const test2Passed = decreasePost.success &&
                      ledger1.length === 1 && ledger1[0].transactionType === 'ADJUSTMENT_OUT' && ledger1[0].baseQuantity === -5 &&
                      tomBal1.quantity === 45 && tomMaster1.currentStock === undefined &&
                      !(decreasePost instanceof Promise);

  console.log(`  ${test2Passed ? '✓' : '✗'} DECREASE adjustment posted (-5 KG ADJUSTMENT_OUT), balance reduced to ${tomBal1?.quantity} KG (currentStock clean & unmutated)`);

  console.log('\nTest 3: INCREASE ADJUSTMENT (STOCK_AUDIT_CORRECTION)');
  const increasePost = adjRepo.postAdjustment({
    postingId: 'adj-post-002',
    locationCode: 'LOC-KITCHEN',
    reasonCode: 'STOCK_AUDIT_CORRECTION',
    lines: [{ itemCode: 'RM-TOMATO', quantity: 10, adjustmentType: 'INCREASE', baseUom: 'KG' }]
  }, session);

  const ledger2 = gateway.getCachedCollection('stock_ledger', 'ros-tenant-master');
  const balances2 = gateway.getCachedCollection('stock_balances', 'ros-tenant-master');
  const tomBal2 = balances2.find(b => b.itemCode === 'RM-TOMATO' && b.locationCode === 'LOC-KITCHEN');

  const test3Passed = increasePost.success &&
                      ledger2.length === 2 && ledger2[1].transactionType === 'ADJUSTMENT_IN' && ledger2[1].baseQuantity === 10 &&
                      tomBal2.quantity === 55;

  console.log(`  ${test3Passed ? '✓' : '✗'} INCREASE adjustment posted (+10 KG ADJUSTMENT_IN), balance increased to ${tomBal2?.quantity} KG`);

  console.log('\nTest 4: IDEMPOTENCY CHECK (POSTING SAME postingId TWICE)');
  const retryResult = adjRepo.postAdjustment({
    postingId: 'adj-post-001',
    locationCode: 'LOC-KITCHEN',
    reasonCode: 'SPOILAGE',
    lines: [{ itemCode: 'RM-TOMATO', quantity: 5, adjustmentType: 'DECREASE' }]
  }, session);

  const ledger3 = gateway.getCachedCollection('stock_ledger', 'ros-tenant-master');
  const test4Passed = retryResult.success && retryResult.idempotentRetry === true && ledger3.length === 2;
  console.log(`  ${test4Passed ? '✓' : '✗'} Idempotency retry detected & duplicate adjustment blocked`);

  console.log('\nTest 5: OFFLINE MODE JOURNALING');
  gateway.setOnlineState(false);
  const offlinePost = adjRepo.postAdjustment({
    postingId: 'adj-post-003',
    locationCode: 'LOC-KITCHEN',
    reasonCode: 'BREAKAGE',
    lines: [{ itemCode: 'RM-TOMATO', quantity: 2, adjustmentType: 'DECREASE' }]
  }, session);

  const test5Passed = offlinePost.success && mockSyncJobs.length >= 1;
  console.log(`  ${test5Passed ? '✓' : '✗'} Offline adjustment posted & queued sync job in OfflineJournal`);

  console.log('\nTest 6: REALTIME CLOUD UPDATE INVALIDATION');
  gateway.setOnlineState(true);
  const realtimeUpdate = {
    id: decreasePost.adjustment.id,
    adjustmentNo: decreasePost.adjustment.adjustmentNo,
    notes: 'Audit approved by Inventory Controller',
    tenantId: 'ros-tenant-master'
  };

  realtime.handleIncomingPayload('stock_adjustments', 'UPDATE', realtimeUpdate);
  const reReadAdj = adjRepo.getByAdjustmentNo(decreasePost.adjustment.adjustmentNo, 'ros-tenant-master');
  const test6Passed = reReadAdj && reReadAdj.notes === 'Audit approved by Inventory Controller' && !(reReadAdj instanceof Promise);
  console.log(`  ${test6Passed ? '✓' : '✗'} Realtime event invalidated local cache & re-read returned updated adjustment ("${reReadAdj?.notes}")`);

  console.log('\n==================================================');
  if (test1Passed && test2Passed && test3Passed && test4Passed && test5Passed && test6Passed) {
    console.log('RESULT: PASS (StockAdjustmentRepository DataGateway Engine Verified)');
  } else {
    console.log('RESULT: FAIL (StockAdjustmentRepository DataGateway issue)');
  }
  console.log('==================================================');

} catch (err) {
  console.error('FATAL ERROR DURING STOCK ADJUSTMENT GATEWAY TEST:', err);
  process.exit(1);
}
