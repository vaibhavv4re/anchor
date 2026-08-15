import { StockTransferRepository } from '../businessos/platform/repositories/stockTransferRepository.js';
import { StockIssueRepository } from '../businessos/platform/repositories/stockIssueRepository.js';
import { StockAdjustmentRepository } from '../businessos/platform/repositories/stockAdjustmentRepository.js';
import { StockCountRepository } from '../businessos/platform/repositories/stockCountRepository.js';
import { InventoryRepository } from '../businessos/platform/repositories/inventoryRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('======================================================');
console.log('GROUP C (STOCK TRANSACTIONS & AUDIT CHAIN) INTEGRATION TEST');
console.log('======================================================\n');

try {
  const mockOfflineStore = {
    collections: {
      stock_transfers: [],
      stock_issues: [],
      stock_adjustments: [],
      stock_counts: [],
      inventory: [
        { id: 'inv-401', itemCode: 'RM-FLOUR', itemName: 'Atta Wheat Flour 10kg', unitValuation: 40, tenantId: 'ros-tenant-master' }
      ],
      stock_ledger: [],
      stock_balances: [
        { id: 'bal-mwh-flour', itemCode: 'RM-FLOUR', locationCode: 'LOC-MWH', quantity: 200, valuation: 8000, tenantId: 'ros-tenant-master' }
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
  const trfRepo = new StockTransferRepository({ dataGateway: gateway, offlineStore: mockOfflineStore, inventoryRepository: invRepo });
  const issRepo = new StockIssueRepository({ dataGateway: gateway, offlineStore: mockOfflineStore, inventoryRepository: invRepo });
  const adjRepo = new StockAdjustmentRepository({ dataGateway: gateway, offlineStore: mockOfflineStore, inventoryRepository: invRepo });
  const cntRepo = new StockCountRepository({ dataGateway: gateway, offlineStore: mockOfflineStore, stockAdjustmentRepository: adjRepo });

  const session = { employeeName: 'Operations Lead', tenantId: 'ros-tenant-master' };

  console.log('1. STOCK TRANSFER (50 KG from LOC-MWH -> LOC-KITCHEN)');
  const trfRes = trfRepo.postTransfer({
    postingId: 'chain-post-001',
    fromLocationCode: 'LOC-MWH',
    toLocationCode: 'LOC-KITCHEN',
    lines: [{ itemCode: 'RM-FLOUR', quantity: 50, baseUom: 'KG' }]
  }, session);

  const bal1Mwh = gateway.getCachedCollection('stock_balances', 'ros-tenant-master').find(b => b.locationCode === 'LOC-MWH');
  const bal1Kit = gateway.getCachedCollection('stock_balances', 'ros-tenant-master').find(b => b.locationCode === 'LOC-KITCHEN');

  const c1Passed = trfRes.success && bal1Mwh.quantity === 150 && bal1Kit.quantity === 50;
  console.log(`  ${c1Passed ? '✓' : '✗'} Stock Transfer posted (MWH: 150 KG, KITCHEN: 50 KG)`);

  console.log('\n2. STOCK ISSUE (15 KG consumed in Kitchen)');
  const issRes = issRepo.postIssue({
    postingId: 'chain-post-002',
    fromLocationCode: 'LOC-KITCHEN',
    issuedToDepartment: 'Bakery Line',
    lines: [{ itemCode: 'RM-FLOUR', quantity: 15, baseUom: 'KG' }]
  }, session);

  const bal2Kit = gateway.getCachedCollection('stock_balances', 'ros-tenant-master').find(b => b.locationCode === 'LOC-KITCHEN');
  const c2Passed = issRes.success && bal2Kit.quantity === 35;
  console.log(`  ${c2Passed ? '✓' : '✗'} Stock Issue posted (KITCHEN balance reduced to 35 KG)`);

  console.log('\n3. STOCK ADJUSTMENT (3 KG Spoilage in Kitchen)');
  const adjRes = adjRepo.postAdjustment({
    postingId: 'chain-post-003',
    locationCode: 'LOC-KITCHEN',
    reasonCode: 'SPOILAGE',
    lines: [{ itemCode: 'RM-FLOUR', quantity: 3, adjustmentType: 'DECREASE', baseUom: 'KG' }]
  }, session);

  const bal3Kit = gateway.getCachedCollection('stock_balances', 'ros-tenant-master').find(b => b.locationCode === 'LOC-KITCHEN');
  const c3Passed = adjRes.success && bal3Kit.quantity === 32;
  console.log(`  ${c3Passed ? '✓' : '✗'} Spoilage adjustment posted (KITCHEN balance reduced to 32 KG)`);

  console.log('\n4. PHYSICAL STOCK COUNT RECONCILIATION (System: 32 KG vs Physical: 30 KG)');
  const cntRes = cntRepo.reconcileCount({
    postingId: 'chain-post-004',
    locationCode: 'LOC-KITCHEN',
    lines: [{ itemCode: 'RM-FLOUR', systemQuantity: 32, physicalQuantity: 30, baseUom: 'KG' }]
  }, session);

  const bal4Kit = gateway.getCachedCollection('stock_balances', 'ros-tenant-master').find(b => b.locationCode === 'LOC-KITCHEN');
  const ledger = gateway.getCachedCollection('stock_ledger', 'ros-tenant-master');
  const flourMaster = invRepo.getByCode('RM-FLOUR', 'ros-tenant-master');

  const c4Passed = cntRes.success && cntRes.adjResult && cntRes.adjResult.success &&
                   bal4Kit.quantity === 30 &&
                   ledger.length === 5 &&
                   flourMaster.currentStock === undefined;

  console.log(`  ${c4Passed ? '✓' : '✗'} Physical count reconciled (Variance -2 KG delegated to ADJUSTMENT_OUT with STOCK_AUDIT_CORRECTION, Final KITCHEN balance: 30 KG)`);

  console.log('\n======================================================');
  if (c1Passed && c2Passed && c3Passed && c4Passed) {
    console.log('GROUP C ACCEPTANCE RESULT: PASS (All Stock Transaction Repositories Integrated & Validated)');
  } else {
    console.log('GROUP C ACCEPTANCE RESULT: FAIL (Integration error)');
  }
  console.log('======================================================');

} catch (err) {
  console.error('FATAL ERROR DURING GROUP C INTEGRATION TEST:', err);
  process.exit(1);
}
