import { StockCountRepository } from '../businessos/platform/repositories/stockCountRepository.js';
import { StockAdjustmentRepository } from '../businessos/platform/repositories/stockAdjustmentRepository.js';
import { InventoryRepository } from '../businessos/platform/repositories/inventoryRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('==================================================');
console.log('STOCK COUNT REPOSITORY DATA GATEWAY TEST');
console.log('==================================================\n');

try {
  const mockOfflineStore = {
    collections: {
      stock_counts: [],
      stock_adjustments: [],
      inventory: [
        { id: 'inv-30', itemCode: 'RM-CHEESE', itemName: 'Mozzarella Cheese 1kg', unitValuation: 450, tenantId: 'ros-tenant-master' }
      ],
      stock_ledger: [],
      stock_balances: [
        { id: 'bal-cheese', itemCode: 'RM-CHEESE', locationCode: 'LOC-CHILL', quantity: 10, valuation: 4500, tenantId: 'ros-tenant-master' }
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
  const cntRepo = new StockCountRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore,
    stockAdjustmentRepository: adjRepo
  });

  const session = { employeeName: 'Stock Auditor', tenantId: 'ros-tenant-master' };

  console.log('Test 1: ZERO VARIANCE COUNT (NO ADJUSTMENT DELEGATED)');
  const zeroVarResult = cntRepo.reconcileCount({
    postingId: 'cnt-post-001',
    locationCode: 'LOC-CHILL',
    lines: [{ itemCode: 'RM-CHEESE', systemQuantity: 10, physicalQuantity: 10 }]
  }, session);

  const test1Passed = zeroVarResult.success && zeroVarResult.adjResult === null && !(zeroVarResult instanceof Promise);
  console.log(`  ${test1Passed ? '✓' : '✗'} Reconciled count with zero variance (No adjustment posted)`);

  console.log('\nTest 2: POSITIVE VARIANCE (DELEGATES INCREASE TO STOCK ADJUSTMENT)');
  const posVarResult = cntRepo.reconcileCount({
    postingId: 'cnt-post-002',
    locationCode: 'LOC-CHILL',
    lines: [{ itemCode: 'RM-CHEESE', systemQuantity: 10, physicalQuantity: 14 }] // Physical 14 vs Sys 10 (+4)
  }, session);

  const balances2 = gateway.getCachedCollection('stock_balances', 'ros-tenant-master');
  const cheeseBal2 = balances2.find(b => b.itemCode === 'RM-CHEESE' && b.locationCode === 'LOC-CHILL');

  const test2Passed = posVarResult.success && posVarResult.adjResult && posVarResult.adjResult.success &&
                      posVarResult.adjResult.adjustment.reasonCode === 'STOCK_AUDIT_CORRECTION' &&
                      cheeseBal2.quantity === 14;

  console.log(`  ${test2Passed ? '✓' : '✗'} Positive variance (+4) delegated to ADJUSTMENT_IN with STOCK_AUDIT_CORRECTION, balance adjusted to ${cheeseBal2?.quantity} KG`);

  console.log('\nTest 3: NEGATIVE VARIANCE (DELEGATES DECREASE TO STOCK ADJUSTMENT)');
  const negVarResult = cntRepo.reconcileCount({
    postingId: 'cnt-post-003',
    locationCode: 'LOC-CHILL',
    lines: [{ itemCode: 'RM-CHEESE', systemQuantity: 14, physicalQuantity: 11 }] // Physical 11 vs Sys 14 (-3)
  }, session);

  const balances3 = gateway.getCachedCollection('stock_balances', 'ros-tenant-master');
  const cheeseBal3 = balances3.find(b => b.itemCode === 'RM-CHEESE' && b.locationCode === 'LOC-CHILL');

  const test3Passed = negVarResult.success && negVarResult.adjResult && negVarResult.adjResult.success &&
                      negVarResult.adjResult.adjustment.reasonCode === 'STOCK_AUDIT_CORRECTION' &&
                      cheeseBal3.quantity === 11;

  console.log(`  ${test3Passed ? '✓' : '✗'} Negative variance (-3) delegated to ADJUSTMENT_OUT with STOCK_AUDIT_CORRECTION, balance adjusted to ${cheeseBal3?.quantity} KG`);

  console.log('\nTest 4: REALTIME CLOUD UPDATE INVALIDATION');
  const realtimeUpdate = {
    id: posVarResult.countRecord.id,
    countNo: posVarResult.countRecord.countNo,
    notes: 'Audit verified by Finance Manager',
    tenantId: 'ros-tenant-master'
  };

  realtime.handleIncomingPayload('stock_counts', 'UPDATE', realtimeUpdate);
  const reReadCnt = cntRepo.getByCountNo(posVarResult.countRecord.countNo, 'ros-tenant-master');
  const test4Passed = reReadCnt && reReadCnt.notes === 'Audit verified by Finance Manager' && !(reReadCnt instanceof Promise);
  console.log(`  ${test4Passed ? '✓' : '✗'} Realtime event invalidated local cache & re-read returned updated count ("${reReadCnt?.notes}")`);

  console.log('\n==================================================');
  if (test1Passed && test2Passed && test3Passed && test4Passed) {
    console.log('RESULT: PASS (StockCountRepository DataGateway Engine Verified)');
  } else {
    console.log('RESULT: FAIL (StockCountRepository DataGateway issue)');
  }
  console.log('==================================================');

} catch (err) {
  console.error('FATAL ERROR DURING STOCK COUNT GATEWAY TEST:', err);
  process.exit(1);
}
