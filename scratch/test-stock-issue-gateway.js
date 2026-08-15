import { StockIssueRepository } from '../businessos/platform/repositories/stockIssueRepository.js';
import { InventoryRepository } from '../businessos/platform/repositories/inventoryRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('==================================================');
console.log('STOCK ISSUE REPOSITORY DATA GATEWAY TEST');
console.log('==================================================\n');

try {
  const mockOfflineStore = {
    collections: {
      stock_issues: [],
      inventory: [
        { id: 'inv-10', itemCode: 'RM-OIL', itemName: 'Cooking Oil 5L', unitValuation: 600, allowNegativeStock: false, tenantId: 'ros-tenant-master' },
        { id: 'inv-11', itemCode: 'RM-SALT', itemName: 'Table Salt 1kg', unitValuation: 20, allowNegativeStock: true, tenantId: 'ros-tenant-master' }
      ],
      stock_ledger: [],
      stock_balances: [
        { id: 'bal-oil', itemCode: 'RM-OIL', locationCode: 'LOC-KITCHEN', quantity: 20, valuation: 12000, tenantId: 'ros-tenant-master' },
        { id: 'bal-salt', itemCode: 'RM-SALT', locationCode: 'LOC-KITCHEN', quantity: 2, valuation: 40, tenantId: 'ros-tenant-master' }
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
  const issRepo = new StockIssueRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore,
    offlineJournal: mockOfflineJournal,
    inventoryRepository: invRepo
  });

  const session = { employeeName: 'Sous Chef', tenantId: 'ros-tenant-master' };

  console.log('Test 1: INSUFFICIENT STOCK REJECTION');
  const insufficientCheck = issRepo.postIssue({
    fromLocationCode: 'LOC-KITCHEN',
    lines: [{ itemCode: 'RM-OIL', quantity: 50 }]
  }, session);

  const test1Passed = !insufficientCheck.success && insufficientCheck.error.includes('Insufficient Stock');
  console.log(`  ${test1Passed ? '✓' : '✗'} Blocked stock issue exceeding available stock ("${insufficientCheck.error.split('\n')[0]}")`);

  console.log('\nTest 2: ALLOW NEGATIVE STOCK OVERRIDE BEHAVIOR');
  const negCheck = issRepo.postIssue({
    fromLocationCode: 'LOC-KITCHEN',
    lines: [{ itemCode: 'RM-SALT', quantity: 10 }] // Available: 2, Requested: 10, allowNegativeStock: true
  }, session);

  const test2Passed = negCheck.success && negCheck.issue && !(negCheck instanceof Promise);
  console.log(`  ${test2Passed ? '✓' : '✗'} Allowed stock issue for item with allowNegativeStock = true ("${negCheck.issue?.issueNo}")`);

  console.log('\nTest 3: SUCCESSFUL ISSUE POSTING & BALANCES REDUCTION');
  const postResult = issRepo.postIssue({
    postingId: 'iss-post-001',
    fromLocationCode: 'LOC-KITCHEN',
    issuedToDepartment: 'Hot Line Kitchen',
    lines: [{ itemCode: 'RM-OIL', quantity: 5, baseUom: 'LTR' }]
  }, session);

  const ledger = gateway.getCachedCollection('stock_ledger', 'ros-tenant-master');
  const balances = gateway.getCachedCollection('stock_balances', 'ros-tenant-master');
  const oilBal = balances.find(b => b.itemCode === 'RM-OIL' && b.locationCode === 'LOC-KITCHEN');
  const oilMaster = invRepo.getByCode('RM-OIL', 'ros-tenant-master');

  const test3Passed = postResult.success &&
                      ledger.find(l => l.itemCode === 'RM-OIL' && l.transactionType === 'ISSUE_OUT' && l.baseQuantity === -5) !== undefined &&
                      oilBal.quantity === 15 &&
                      oilMaster.currentStock === undefined &&
                      !(postResult instanceof Promise);

  console.log(`  ${test3Passed ? '✓' : '✗'} Issue posted synchronously (-5 LTR ISSUE_OUT), store balance reduced to ${oilBal?.quantity} LTR (currentStock clean & unmutated)`);

  console.log('\nTest 4: IDEMPOTENCY CHECK (POSTING SAME postingId TWICE)');
  const retryResult = issRepo.postIssue({
    postingId: 'iss-post-001',
    fromLocationCode: 'LOC-KITCHEN',
    lines: [{ itemCode: 'RM-OIL', quantity: 5 }]
  }, session);

  const test4Passed = retryResult.success && retryResult.idempotentRetry === true;
  console.log(`  ${test4Passed ? '✓' : '✗'} Idempotency retry detected & duplicate stock issue blocked`);

  console.log('\nTest 5: OFFLINE MODE JOURNALING');
  gateway.setOnlineState(false);
  const offlineResult = issRepo.postIssue({
    postingId: 'iss-post-002',
    fromLocationCode: 'LOC-KITCHEN',
    lines: [{ itemCode: 'RM-OIL', quantity: 2 }]
  }, session);

  const test5Passed = offlineResult.success && mockSyncJobs.length >= 1;
  console.log(`  ${test5Passed ? '✓' : '✗'} Offline issue posted & queued sync job in OfflineJournal`);

  console.log('\nTest 6: REALTIME CLOUD UPDATE INVALIDATION');
  gateway.setOnlineState(true);
  const realtimeUpdate = {
    id: postResult.issue.id,
    issueNo: postResult.issue.issueNo,
    notes: 'Approved by Executive Chef',
    tenantId: 'ros-tenant-master'
  };

  realtime.handleIncomingPayload('stock_issues', 'UPDATE', realtimeUpdate);
  const reReadIss = issRepo.getByIssueNo(postResult.issue.issueNo, 'ros-tenant-master');
  const test6Passed = reReadIss && reReadIss.notes === 'Approved by Executive Chef' && !(reReadIss instanceof Promise);
  console.log(`  ${test6Passed ? '✓' : '✗'} Realtime event invalidated local cache & re-read returned updated issue ("${reReadIss?.notes}")`);

  console.log('\n==================================================');
  if (test1Passed && test2Passed && test3Passed && test4Passed && test5Passed && test6Passed) {
    console.log('RESULT: PASS (StockIssueRepository DataGateway & Issue Engine Verified)');
  } else {
    console.log('RESULT: FAIL (StockIssueRepository DataGateway issue)');
  }
  console.log('==================================================');

} catch (err) {
  console.error('FATAL ERROR DURING STOCK ISSUE GATEWAY TEST:', err);
  process.exit(1);
}
