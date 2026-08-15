import { DataGateway } from '../businessos/platform/data/dataGateway.js';

console.log('========================================');
console.log('DATA GATEWAY ROUTING & FALLBACK SMOKE TEST');
console.log('========================================\n');

try {
  // Mock In-Memory Cloud Store for testing SupabaseDataAdapter behavior
  const mockCloudDatabase = {
    inventory: [
      { id: 'inv-1', itemCode: 'ITEM-001', itemName: 'Fresh Chicken', tenantId: 'ros-tenant-master' }
    ]
  };

  const mockSupabaseClient = {
    async fetchTableData(table) {
      return { success: true, data: mockCloudDatabase[table] || [] };
    },
    async upsertRecord(table, record) {
      mockCloudDatabase[table] = mockCloudDatabase[table] || [];
      const idx = mockCloudDatabase[table].findIndex(i => i.id === record.id);
      if (idx !== -1) mockCloudDatabase[table][idx] = record;
      else mockCloudDatabase[table].push(record);
      return { success: true, data: record };
    },
    async deleteRecords(table, filter) {
      return { success: true };
    }
  };

  // Mock OfflineStore
  const mockOfflineStore = {
    collections: {
      inventory: [
        { id: 'inv-1', itemCode: 'ITEM-001', itemName: 'Fresh Chicken (Offline Cache)', tenantId: 'ros-tenant-master' }
      ]
    },
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

  // Track Subscriber Notifications
  const notifications = [];
  gateway.subscribe('inventory', (event) => {
    notifications.push(event);
  });

  console.log('Test 1: ONLINE READ');
  const onlineItems = await gateway.getCollection('inventory');
  const test1Passed = onlineItems.length === 1 && onlineItems[0].itemName === 'Fresh Chicken';
  console.log(`  ${test1Passed ? '✓' : '✗'} Online read returned cloud record ("${onlineItems[0]?.itemName}")`);

  console.log('\nTest 2: ONLINE CREATE & CACHE UPDATE');
  const newItem = { id: 'inv-2', itemCode: 'ITEM-002', itemName: 'Mutton Chops', tenantId: 'ros-tenant-master' };
  await gateway.create('inventory', newItem, { tenantId: 'ros-tenant-master' });
  const test2Passed = mockCloudDatabase.inventory.length === 2 && mockOfflineStore.collections.inventory.length === 2 && notifications.length === 1;
  console.log(`  ${test2Passed ? '✓' : '✗'} Upserted to Supabase & updated local cache (${mockCloudDatabase.inventory.length} cloud / ${mockOfflineStore.collections.inventory.length} local)`);

  console.log('\nTest 3: ONLINE → OFFLINE TRANSITION');
  gateway.setOnlineState(false);
  console.log(`  ✓ Gateway setOnlineState(false)`);

  console.log('\nTest 4: OFFLINE CREATE & JOURNALING');
  const offlineItem = { id: 'inv-3', itemCode: 'ITEM-003', itemName: 'Basmati Rice', tenantId: 'ros-tenant-master' };
  await gateway.create('inventory', offlineItem, { tenantId: 'ros-tenant-master' });
  const test4Passed = mockOfflineStore.collections.inventory.length === 3 && mockSyncJobs.length === 1 && notifications.length === 2;
  console.log(`  ${test4Passed ? '✓' : '✗'} Appended to OfflineStore, queued in OfflineJournal & subscriber notified`);

  console.log('\nTest 5: OFFLINE READ');
  const offlineItems = await gateway.getCollection('inventory');
  const test5Passed = offlineItems.length === 3 && offlineItems.some(i => i.itemCode === 'ITEM-003');
  console.log(`  ${test5Passed ? '✓' : '✗'} Read returned local offline items (${offlineItems.length} records)`);

  console.log('\nTest 6: OFFLINE → ONLINE TRANSITION');
  gateway.setOnlineState(true);
  const onlineItemsAfter = await gateway.getCollection('inventory');
  const test6Passed = onlineItemsAfter.length === 2;
  console.log(`  ${test6Passed ? '✓' : '✗'} Restored online state & read cloud items (${onlineItemsAfter.length} records)`);

  console.log('\n========================================');
  if (test1Passed && test2Passed && test4Passed && test5Passed && test6Passed) {
    console.log('RESULT: PASS (DataGateway Routing, Cache Maintenance & Sync Journaling Functioning)');
  } else {
    console.log('RESULT: FAIL (Routing or Fallback logic issue)');
  }
  console.log('========================================');

} catch (err) {
  console.error('FATAL ERROR DURING GATEWAY SMOKE TEST:', err);
  process.exit(1);
}
