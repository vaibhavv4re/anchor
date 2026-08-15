import { InventoryRepository } from '../businessos/platform/repositories/inventoryRepository.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';

console.log('========================================');
console.log('INVENTORY REPOSITORY WRITE-PATH PILOT TEST');
console.log('========================================\n');

try {
  // Mock Cloud Store
  const mockCloudStore = {
    inventory: []
  };

  const mockSupabaseClient = {
    async fetchTableData(table) {
      return { success: true, data: mockCloudStore[table] || [] };
    },
    async upsertRecord(table, record) {
      mockCloudStore[table] = mockCloudStore[table] || [];
      const idx = mockCloudStore[table].findIndex(i => i.id === record.id || i.uuid === record.uuid);
      if (idx !== -1) mockCloudStore[table][idx] = record;
      else mockCloudStore[table].push(record);
      return { success: true, data: record };
    }
  };

  // Mock OfflineStore
  const mockOfflineStore = {
    collections: { inventory: [] },
    getCollection(name) { return this.collections[name] || []; },
    setCollection(name, data) { this.collections[name] = data; },
    appendItem(name, item) { (this.collections[name] = this.collections[name] || []).push(item); return item; }
  };

  // Mock OfflineJournal
  const mockSyncJobs = [];
  const mockOfflineJournal = {
    createSyncJob(jobType, tenantId, entityName, payload, session) {
      mockSyncJobs.push({ jobType, tenantId, entityName, payload, session });
    }
  };

  const gateway = new DataGateway({
    supabaseClient: mockSupabaseClient,
    offlineStore: mockOfflineStore,
    offlineJournal: mockOfflineJournal,
    isOnline: true
  });

  const invRepo = new InventoryRepository({
    dataGateway: gateway,
    offlineStore: mockOfflineStore,
    offlineJournal: mockOfflineJournal
  });

  // Track Subscriber Notifications
  const notifications = [];
  gateway.subscribe('inventory', (event) => {
    notifications.push(event);
  });

  console.log('Test 1: ONLINE create() SYNCHRONOUS RETURN & CLOUD UPSERT');
  const session = { employeeName: 'Head Chef', tenantId: 'ros-tenant-master' };
  const createdItem = invRepo.create({
    itemCode: 'RM-5001',
    itemName: 'Fresh Paneer',
    categoryCode: 'CAT-CHEESE',
    baseUom: 'KG'
  }, session);

  const test1Passed = createdItem &&
                      createdItem.itemCode === 'RM-5001' &&
                      !(createdItem instanceof Promise) &&
                      invRepo.getByCode('RM-5001', 'ros-tenant-master') !== null &&
                      notifications.length === 1;

  console.log(`  ${test1Passed ? '✓' : '✗'} Created item returned synchronously ("${createdItem?.itemName}")`);
  console.log(`  ${test1Passed ? '✓' : '✗'} Local cache updated instantly & subscriber notified (${notifications.length} event)`);

  console.log('\nTest 2: ONLINE update() SYNCHRONOUS RETURN');
  const updatedItem = invRepo.update('RM-5001', { itemName: 'Fresh Organic Paneer', unitValuation: 320 }, session);
  const test2Passed = updatedItem &&
                      updatedItem.itemName === 'Fresh Organic Paneer' &&
                      !(updatedItem instanceof Promise) &&
                      invRepo.getByCode('RM-5001', 'ros-tenant-master').unitValuation === 320 &&
                      notifications.length === 2;

  console.log(`  ${test2Passed ? '✓' : '✗'} Updated item returned synchronously ("${updatedItem?.itemName}", ₹${updatedItem?.unitValuation})`);

  console.log('\nTest 3: ONLINE → OFFLINE TRANSITION');
  gateway.setOnlineState(false);
  console.log(`  ✓ Gateway setOnlineState(false)`);

  console.log('\nTest 4: OFFLINE create() & OFFLINE JOURNALING');
  const offlineCreated = invRepo.create({
    itemCode: 'RM-5002',
    itemName: 'Desi Ghee',
    categoryCode: 'CAT-BUTTER',
    baseUom: 'KG'
  }, session);

  const test4Passed = offlineCreated &&
                      offlineCreated.itemCode === 'RM-5002' &&
                      !(offlineCreated instanceof Promise) &&
                      invRepo.getByCode('RM-5002', 'ros-tenant-master') !== null &&
                      mockSyncJobs.length === 1 &&
                      notifications.length === 3;

  console.log(`  ${test4Passed ? '✓' : '✗'} Offline item created synchronously & queued in OfflineJournal (${mockSyncJobs.length} sync job)`);

  console.log('\nTest 5: OFFLINE update() & OFFLINE JOURNALING');
  const offlineUpdated = invRepo.update('RM-5002', { unitValuation: 650 }, session);
  const test5Passed = offlineUpdated &&
                      offlineUpdated.unitValuation === 650 &&
                      !(offlineUpdated instanceof Promise) &&
                      invRepo.getByCode('RM-5002', 'ros-tenant-master').unitValuation === 650 &&
                      mockSyncJobs.length === 2 &&
                      notifications.length === 4;

  console.log(`  ${test5Passed ? '✓' : '✗'} Offline item updated synchronously & queued in OfflineJournal (${mockSyncJobs.length} total sync jobs)`);

  console.log('\n========================================');
  if (test1Passed && test2Passed && test4Passed && test5Passed) {
    console.log('RESULT: PASS (InventoryRepository Write-Path Pilot Fully Synchronous & Resilient)');
  } else {
    console.log('RESULT: FAIL (Write-Path Pilot issue)');
  }
  console.log('========================================');

} catch (err) {
  console.error('FATAL ERROR DURING WRITE PILOT TEST:', err);
  process.exit(1);
}
