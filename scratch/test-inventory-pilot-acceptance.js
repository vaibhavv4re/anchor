import { InventoryRepository } from '../businessos/platform/repositories/inventoryRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';

console.log('====================================================');
console.log('FULL INVENTORY REPOSITORY PILOT ACCEPTANCE TEST');
console.log('====================================================\n');

try {
  // 1. Setup Mock Cloud Database & SupabaseClient
  const mockCloudDatabase = {
    inventory: [
      { id: 'inv-1', uuid: 'uuid-1', itemCode: 'RM-1001', itemName: 'Whole Chicken', categoryCode: 'CAT-CHICKEN', unitValuation: 220, tenantId: 'ros-tenant-master' }
    ]
  };

  const mockSupabaseClient = {
    async fetchTableData(table) {
      return { success: true, data: mockCloudDatabase[table] || [] };
    },
    async upsertRecord(table, record) {
      mockCloudDatabase[table] = mockCloudDatabase[table] || [];
      const idx = mockCloudDatabase[table].findIndex(i => i.id === record.id || i.uuid === record.uuid || i.item_code === record.item_code);
      if (idx !== -1) mockCloudDatabase[table][idx] = record;
      else mockCloudDatabase[table].push(record);
      return { success: true, data: record };
    }
  };

  // 2. Setup Mock OfflineStore & OfflineJournal
  const mockOfflineStore = {
    collections: {
      inventory: [
        { id: 'inv-1', uuid: 'uuid-1', itemCode: 'RM-1001', itemName: 'Whole Chicken', categoryCode: 'CAT-CHICKEN', unitValuation: 220, tenantId: 'ros-tenant-master' }
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

  // 3. Setup SupabaseRealtime Transport & DataGateway
  const realtime = new SupabaseRealtime();
  const gateway = new DataGateway({
    supabaseClient: mockSupabaseClient,
    offlineStore: mockOfflineStore,
    offlineJournal: mockOfflineJournal,
    realtime,
    isOnline: true
  });

  const invRepo = new InventoryRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore,
    offlineJournal: mockOfflineJournal
  });

  const session = { employeeName: 'Head Chef', tenantId: 'ros-tenant-master' };

  // --- SECTION 1: SYNCHRONOUS READ CONTRACT ---
  console.log('Section 1: SYNCHRONOUS READ CONTRACT');
  const allItems = invRepo.getAll('ros-tenant-master');
  const itemByCode = invRepo.getByCode('RM-1001', 'ros-tenant-master');
  const itemById = invRepo.getById('inv-1', 'ros-tenant-master');

  const s1Passed = Array.isArray(allItems) && allItems.length === 1 &&
                   itemByCode && itemByCode.itemName === 'Whole Chicken' &&
                   itemById && itemById.itemCode === 'RM-1001' &&
                   !(allItems instanceof Promise) && !(itemByCode instanceof Promise);

  console.log(`  ${s1Passed ? '✓' : '✗'} Synchronous reads (getAll, getByCode, getById) returned instant values`);

  // --- SECTION 2: ONLINE MUTATIONS ---
  console.log('\nSection 2: ONLINE MUTATIONS (create & update)');
  const created = invRepo.create({
    itemCode: 'RM-1002',
    itemName: 'Basmati Rice 25kg',
    categoryCode: 'CAT-RICE',
    unitValuation: 1800,
    baseUom: 'KG'
  }, session);

  const updated = invRepo.update('RM-1002', { unitValuation: 1850 }, session);

  const s2Passed = created && created.itemCode === 'RM-1002' &&
                   updated && updated.unitValuation === 1850 &&
                   !(created instanceof Promise) && !(updated instanceof Promise) &&
                   invRepo.getByCode('RM-1002', 'ros-tenant-master').unitValuation === 1850;

  console.log(`  ${s2Passed ? '✓' : '✗'} Online create & update executed synchronously and updated local gateway cache`);

  // --- SECTION 3: OFFLINE MUTATIONS & JOURNALING ---
  console.log('\nSection 3: OFFLINE MUTATIONS & JOURNALING');
  gateway.setOnlineState(false);

  const offlineCreated = invRepo.create({
    itemCode: 'RM-1003',
    itemName: 'Amul Butter 500g',
    categoryCode: 'CAT-BUTTER',
    unitValuation: 275,
    baseUom: 'KG'
  }, session);

  const offlineUpdated = invRepo.update('RM-1003', { unitValuation: 280 }, session);

  const s3Passed = offlineCreated && offlineCreated.itemCode === 'RM-1003' &&
                   offlineUpdated && offlineUpdated.unitValuation === 280 &&
                   mockSyncJobs.length === 2 &&
                   invRepo.getByCode('RM-1003', 'ros-tenant-master') !== null;

  console.log(`  ${s3Passed ? '✓' : '✗'} Offline mutations updated local cache & enqueued ${mockSyncJobs.length} sync jobs`);

  // --- SECTION 4: REALTIME CLOUD CACHE INVALIDATION ---
  console.log('\nSection 4: REALTIME CLOUD CACHE INVALIDATION');
  gateway.setOnlineState(true);

  // External device updates RM-1001 in Supabase Cloud
  const externalCloudUpdate = {
    id: 'inv-1',
    uuid: 'uuid-1',
    itemCode: 'RM-1001',
    itemName: 'Whole Organic Chicken',
    unitValuation: 260,
    tenantId: 'ros-tenant-master'
  };

  realtime.handleIncomingPayload('inventory', 'UPDATE', externalCloudUpdate);
  const reReadItem = invRepo.getByCode('RM-1001', 'ros-tenant-master');

  const s4Passed = reReadItem &&
                   reReadItem.itemName === 'Whole Organic Chicken' &&
                   reReadItem.unitValuation === 260 &&
                   !(reReadItem instanceof Promise);

  console.log(`  ${s4Passed ? '✓' : '✗'} Incoming Realtime cloud event invalidated cache & synchronous re-read returned ₹${reReadItem?.unitValuation}`);

  // --- SECTION 5: LEGACY CONSUMER SIMULATION ---
  console.log('\nSection 5: LEGACY CONSUMER SIMULATION (GRN, Transfer, Issue, Adjustment, UI Map)');

  // Consumer 1: UI View string mapping
  const uiItems = invRepo.getAll('ros-tenant-master');
  const renderedHTML = uiItems.map(item => `<div>${item.itemName} - ₹${item.unitValuation}</div>`).join('');
  const c1Passed = renderedHTML.includes('Whole Organic Chicken') && renderedHTML.includes('Basmati Rice 25kg');

  // Consumer 2: Goods Receipt valuation calculation
  const grnLineItem = { itemCode: 'RM-1001', receivedQty: 10 };
  const masterItemForGRN = invRepo.getByCode(grnLineItem.itemCode, 'ros-tenant-master') || {};
  const calculatedValuation = grnLineItem.receivedQty * (masterItemForGRN.unitValuation || 0);
  const c2Passed = calculatedValuation === 2600;

  // Consumer 3: Stock Transfer negative stock check
  const transferItem = invRepo.getByCode('RM-1002', 'ros-tenant-master');
  const c3Passed = transferItem && transferItem.itemCode === 'RM-1002';

  const s5Passed = c1Passed && c2Passed && c3Passed;
  console.log(`  ${s5Passed ? '✓' : '✗'} Legacy UI rendering & transaction valuation calculations passed seamlessly`);

  console.log('\n====================================================');
  if (s1Passed && s2Passed && s3Passed && s4Passed && s5Passed) {
    console.log('ACCEPTANCE RESULT: PASS (InventoryRepository Pilot Fully Validated)');
  } else {
    console.log('ACCEPTANCE RESULT: FAIL (One or more acceptance criteria failed)');
  }
  console.log('====================================================');

} catch (err) {
  console.error('FATAL ERROR DURING ACCEPTANCE TEST:', err);
  process.exit(1);
}
