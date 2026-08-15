import { StockTransferRepository } from '../businessos/platform/repositories/stockTransferRepository.js';
import { InventoryRepository } from '../businessos/platform/repositories/inventoryRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('==================================================');
console.log('STOCK TRANSFER REPOSITORY DATA GATEWAY TEST');
console.log('==================================================\n');

try {
  const mockOfflineStore = {
    collections: {
      stock_transfers: [],
      inventory: [
        { id: 'inv-1', itemCode: 'RM-RICE', itemName: 'Basmati Rice 25kg', unitValuation: 50, allowNegativeStock: false, tenantId: 'ros-tenant-master' }
      ],
      stock_ledger: [],
      stock_balances: [
        { id: 'bal-mwh-rice', itemCode: 'RM-RICE', locationCode: 'LOC-MWH', quantity: 100, valuation: 5000, tenantId: 'ros-tenant-master' }
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
  const trfRepo = new StockTransferRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore,
    offlineJournal: mockOfflineJournal,
    inventoryRepository: invRepo
  });

  const session = { employeeName: 'Transfer Supervisor', tenantId: 'ros-tenant-master' };

  console.log('Test 1: SOURCE = DESTINATION VALIDATION ERROR');
  const sameLocCheck = trfRepo.postTransfer({
    fromLocationCode: 'LOC-MWH',
    toLocationCode: 'LOC-MWH',
    lines: [{ itemCode: 'RM-RICE', quantity: 10 }]
  }, session);
  const test1Passed = !sameLocCheck.success && sameLocCheck.error.includes('identical');
  console.log(`  ${test1Passed ? '✓' : '✗'} Blocked transfer with identical locations ("${sameLocCheck.error}")`);

  console.log('\nTest 2: NEGATIVE STOCK ENFORCEMENT');
  const insufficientCheck = trfRepo.postTransfer({
    fromLocationCode: 'LOC-MWH',
    toLocationCode: 'LOC-KITCHEN',
    lines: [{ itemCode: 'RM-RICE', quantity: 150 }]
  }, session);
  const test2Passed = !insufficientCheck.success && insufficientCheck.error.includes('Insufficient Stock');
  console.log(`  ${test2Passed ? '✓' : '✗'} Blocked transfer exceeding available stock ("${insufficientCheck.error.split('\n')[0]}")`);

  console.log('\nTest 3: ATOMIC PAIRED LEDGER POSTING & BALANCE UPDATES');
  const postResult = trfRepo.postTransfer({
    postingId: 'trf-post-001',
    fromLocationCode: 'LOC-MWH',
    toLocationCode: 'LOC-KITCHEN',
    lines: [{ itemCode: 'RM-RICE', quantity: 30, baseUom: 'KG' }]
  }, session);

  const ledger = gateway.getCachedCollection('stock_ledger', 'ros-tenant-master');
  const balances = gateway.getCachedCollection('stock_balances', 'ros-tenant-master');
  const srcBal = balances.find(b => b.locationCode === 'LOC-MWH');
  const dstBal = balances.find(b => b.locationCode === 'LOC-KITCHEN');

  const test3Passed = postResult.success && postResult.transfer &&
                      ledger.length === 2 &&
                      ledger[0].transactionType === 'TRANSFER_OUT' && ledger[0].baseQuantity === -30 &&
                      ledger[1].transactionType === 'TRANSFER_IN' && ledger[1].baseQuantity === 30 &&
                      srcBal.quantity === 70 && dstBal.quantity === 30 &&
                      !(postResult instanceof Promise);

  console.log(`  ${test3Passed ? '✓' : '✗'} Paired TRANSFER_OUT (-30) & TRANSFER_IN (+30) posted (Source Bal: ${srcBal?.quantity} KG, Dst Bal: ${dstBal?.quantity} KG)`);

  console.log('\nTest 4: IDEMPOTENCY CHECK (POSTING SAME postingId TWICE)');
  const retryResult = trfRepo.postTransfer({
    postingId: 'trf-post-001',
    fromLocationCode: 'LOC-MWH',
    toLocationCode: 'LOC-KITCHEN',
    lines: [{ itemCode: 'RM-RICE', quantity: 30 }]
  }, session);

  const test4Passed = retryResult.success && retryResult.idempotentRetry === true && ledger.length === 2;
  console.log(`  ${test4Passed ? '✓' : '✗'} Idempotency retry detected & duplicate paired ledger creation blocked`);

  console.log('\nTest 5: REALTIME CLOUD UPDATE INVALIDATION');
  const realtimeUpdate = {
    id: postResult.transfer.id,
    transferNo: 'TRF-2026-0001',
    notes: 'Verified by Head Chef',
    tenantId: 'ros-tenant-master'
  };

  realtime.handleIncomingPayload('stock_transfers', 'UPDATE', realtimeUpdate);
  const reReadTrf = trfRepo.getByTransferNo('TRF-2026-0001', 'ros-tenant-master');
  const test5Passed = reReadTrf && reReadTrf.notes === 'Verified by Head Chef' && !(reReadTrf instanceof Promise);
  console.log(`  ${test5Passed ? '✓' : '✗'} Realtime event invalidated local cache & re-read returned updated transfer ("${reReadTrf?.notes}")`);

  console.log('\n==================================================');
  if (test1Passed && test2Passed && test3Passed && test4Passed && test5Passed) {
    console.log('RESULT: PASS (StockTransferRepository DataGateway & Paired Ledger Engine Verified)');
  } else {
    console.log('RESULT: FAIL (StockTransferRepository DataGateway issue)');
  }
  console.log('==================================================');

} catch (err) {
  console.error('FATAL ERROR DURING STOCK TRANSFER GATEWAY TEST:', err);
  process.exit(1);
}
