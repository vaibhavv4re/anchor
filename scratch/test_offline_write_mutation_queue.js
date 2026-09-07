/**
 * Offline Mutation Pipeline & Sync Queue Certification Test
 * Validates that offline domain writes (e.g. Master Inventory edits) explicitly
 * append QUEUED entries into offline_journal, update pendingSyncCount, and flush to cloud on reconnect.
 */

import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { connectivityManager, NetworkStates, SyncStates } from '../businessos/platform/connectivity/connectivityManager.js';
import { ConnectivityComponent } from '../businessos/platform/connectivity/connectivityComponent.js';

console.log('====================================================');
console.log('📦 OFFLINE MUTATION PIPELINE & SYNC QUEUE CERTIFICATION');
console.log('====================================================\n');

// Clear local store offline_journal
offlineStore.setCollection('offline_journal', []);
offlineStore.setCollection('inventory', [{ id: 'invitem_rice', itemCode: 'RAW-RCE-01', name: 'Aged Basmati Rice', reorderLevel: 10 }]);

class MockCloudAdapter {
  constructor() {
    this.updatedRecords = [];
  }
  async update(collection, id, patch) {
    this.updatedRecords.push({ collection, id, patch });
    return { id, ...patch };
  }
  async getCollection() {
    return { success: true, data: [] };
  }
}

const cloudAdapter = new MockCloudAdapter();
const gw = new DataGateway({ cloudAdapter, isOnline: false });
connectivityManager.notifyOffline();

// STEP 1: Perform Offline Inventory Item Edit (Reorder Level 10 -> 9)
console.log('--- STEP 1: EDIT RICE REORDER LEVEL (10 -> 9) WHILE OFFLINE ---');
await gw.update('inventory', 'invitem_rice', { reorderLevel: 9 });

const cachedItem = gw.getCachedById('inventory', 'invitem_rice');
console.log(`Local Cache Item Reorder Level: ${cachedItem.reorderLevel} KG`);
if (cachedItem.reorderLevel !== 9) {
  throw new Error('Step 1 Failed: Local cache not updated immediately on offline write!');
}
console.log('✓ Step 1 Passed: Local cache updated immediately.\n');

// STEP 2: Verify Offline Journal Queue Entry & Pending Count
console.log('--- STEP 2: VERIFY OFFLINE JOURNAL QUEUED ENTRY & PENDING COUNT ---');
const journal = offlineStore.getCollection('offline_journal') || [];
console.log(`Journal Entries: ${journal.length} | Pending Count: ${connectivityManager.getDiagnostics().pendingSyncCount}`);

if (journal.length !== 1 || journal[0].syncState !== 'QUEUED') {
  throw new Error('Step 2 Failed: Offline mutation was NOT appended to offline_journal queue!');
}
if (connectivityManager.getDiagnostics().pendingSyncCount !== 1) {
  throw new Error('Step 2 Failed: pendingSyncCount was NOT updated to 1!');
}
console.log('✓ Step 2 Passed: Offline mutation correctly queued in offline_journal with pendingSyncCount = 1.\n');

// STEP 3: Verify UI Header Badge Rendering
console.log('--- STEP 3: VERIFY CONNECTIVITY UI BADGE RENDERING ---');
const comp = new ConnectivityComponent({ connectivityManager });
const badgeHTML = comp.renderBadgeHTML(connectivityManager.getDiagnostics());
console.log(`Rendered Badge: "${badgeHTML.trim()}"`);

if (!badgeHTML.includes('🔴 Offline · 1 pending change')) {
  throw new Error('Step 3 Failed: UI Badge did not show "🔴 Offline · 1 pending change"!');
}
console.log('✓ Step 3 Passed: UI Badge correctly rendered "🔴 Offline · 1 pending change".\n');

// STEP 4: Simulate Reconnect & Flush Queue to Cloud
console.log('--- STEP 4: RECONNECT ONLINE & FLUSH QUEUE TO SUPABASE ---');
await gw.setOnlineState(true);

console.log(`Cloud Adapter Updated Calls: ${cloudAdapter.updatedRecords.length}`);
if (cloudAdapter.updatedRecords.length !== 1 || cloudAdapter.updatedRecords[0].patch.reorderLevel !== 9) {
  throw new Error('Step 4 Failed: Offline mutation was NOT flushed to cloud adapter on reconnect!');
}

const finalJournal = offlineStore.getCollection('offline_journal') || [];
console.log(`Journal Job State after reconnect: ${finalJournal[0].syncState} | Pending Count: ${connectivityManager.getDiagnostics().pendingSyncCount}`);

if (finalJournal[0].syncState !== 'SYNCED' || connectivityManager.getDiagnostics().pendingSyncCount !== 0) {
  throw new Error('Step 4 Failed: Journal job state was not updated to SYNCED or pending count was not reset to 0!');
}
console.log('✓ Step 4 Passed: Reconnect flushed queued mutation to cloud and reset pending count to 0.\n');

console.log('====================================================');
console.log('✅ ALL OFFLINE MUTATION PIPELINE TESTS PASSED (100%)');
console.log('====================================================');
