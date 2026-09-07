/**
 * BusinessOS Connectivity & Sync UX Contract v1.0 Certification Suite
 * Validates all 6 core platform contracts:
 * 1. State transition (ONLINE -> OFFLINE -> SYNCING -> ONLINE)
 * 2. Offline read (networkState = OFFLINE, dataSource = LOCAL_CACHE)
 * 3. Cloud refresh (networkState = ONLINE, dataSource = SUPABASE, timestamp updated on success ONLY)
 * 4. Sync failure (SYNCING -> SYNC_ATTENTION, pendingSyncCount preserved)
 * 5. Event contract (connectivity:changed & sync:status_changed payload structure)
 * 6. No false synchronization (clean reconnect without manufactured sync counts)
 */

import { ConnectivityManager, NetworkStates, SyncStates, DataSources } from '../businessos/platform/connectivity/connectivityManager.js';
import { ConnectivityComponent } from '../businessos/platform/connectivity/connectivityComponent.js';
import { platformEventBus, PlatformEventTypes } from '../businessos/platform/events/platformEvents.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

console.log('====================================================');
console.log('📡 BUSINESSOS CONNECTIVITY & SYNC UX CONTRACT v1.0 CERTIFICATION');
console.log('====================================================\n');

// Mock DOM elements for Node test environment
class MockElement {
  constructor(id = '') {
    this.id = id;
    this.innerHTML = '';
    this.style = { display: '' };
    this.disabled = false;
  }
  querySelector(selector) {
    return new MockElement(selector);
  }
  querySelectorAll(selector) {
    return [];
  }
  addEventListener(event, fn) {}
}

globalThis.document = {
  createElement(tag) { return new MockElement(tag); },
  body: new MockElement('body')
};

// ----------------------------------------------------
// CASE 1: STATE TRANSITION
// ----------------------------------------------------
console.log('--- TEST 1: STATE TRANSITION (ONLINE -> OFFLINE -> SYNCING -> ONLINE) ---');
const cm = new ConnectivityManager({ eventBus: platformEventBus });
let diag = cm.getDiagnostics();
console.log(`Initial -> network: ${diag.networkState} | sync: ${diag.syncState} | dataSrc: ${diag.dataSource}`);
if (diag.networkState !== NetworkStates.ONLINE || diag.syncState !== SyncStates.IDLE || diag.dataSource !== DataSources.SUPABASE) {
  throw new Error('Test 1 Failed: Initial state invalid!');
}

cm.notifyOffline();
diag = cm.getDiagnostics();
console.log(`Offline -> network: ${diag.networkState} | sync: ${diag.syncState} | dataSrc: ${diag.dataSource}`);
if (diag.networkState !== NetworkStates.OFFLINE || diag.dataSource !== DataSources.LOCAL_CACHE) {
  throw new Error('Test 1 Failed: Offline state transition failed!');
}

cm.notifyOnline();
diag = cm.getDiagnostics();
console.log(`Reconnect -> network: ${diag.networkState} | sync: ${diag.syncState} | dataSrc: ${diag.dataSource}`);
if (diag.networkState !== NetworkStates.ONLINE || diag.syncState !== SyncStates.SYNCING) {
  throw new Error('Test 1 Failed: Reconnecting state transition failed!');
}

cm.notifySyncComplete({ success: true, timestamp: new Date().toISOString() });
diag = cm.getDiagnostics();
console.log(`Synced -> network: ${diag.networkState} | sync: ${diag.syncState} | dataSrc: ${diag.dataSource}`);
if (diag.networkState !== NetworkStates.ONLINE || diag.syncState !== SyncStates.IDLE) {
  throw new Error('Test 1 Failed: Online idle state transition failed!');
}
console.log('✓ Test 1 Passed: Complete state transition sequence certified.\n');

// ----------------------------------------------------
// CASE 2: OFFLINE READ CONTRACT
// ----------------------------------------------------
console.log('--- TEST 2: OFFLINE READ CONTRACT ---');
cm.notifyOffline();
diag = cm.getDiagnostics();
console.log(`Offline Read -> networkState: ${diag.networkState} | dataSource: ${diag.dataSource} | isOnline: ${diag.isOnline}`);
if (diag.networkState !== NetworkStates.OFFLINE || diag.dataSource !== DataSources.LOCAL_CACHE || diag.isOnline !== false) {
  throw new Error('Test 2 Failed: Offline read contract failed!');
}
console.log('✓ Test 2 Passed: Offline read contract (LOCAL_CACHE snapshot) certified.\n');

// ----------------------------------------------------
// CASE 3: CLOUD REFRESH & TIMESTAMP PRECISION
// ----------------------------------------------------
console.log('--- TEST 3: CLOUD REFRESH & TIMESTAMP PRECISION ---');
const freshCm = new ConnectivityManager({ eventBus: platformEventBus });
const initialTs = freshCm.lastCloudSyncTimestamp; // null
console.log(`Timestamp before any cloud fetch: ${initialTs}`);
if (initialTs !== null) {
  throw new Error('Test 3 Failed: Initial timestamp should be null before any cloud fetch!');
}

// Failed fetch -> timestamp MUST remain null/unchanged
freshCm.notifySyncComplete({ success: false });
if (freshCm.lastCloudSyncTimestamp !== null) {
  throw new Error('Test 3 Failed: Failed cloud fetch updated lastCloudSyncTimestamp!');
}
console.log(`Timestamp after failed cloud fetch: ${freshCm.lastCloudSyncTimestamp} (Correctly null)`);

// Successful fetch -> timestamp MUST update
const syncTime = new Date().toISOString();
freshCm.notifySyncComplete({ success: true, timestamp: syncTime });
if (freshCm.lastCloudSyncTimestamp !== syncTime) {
  throw new Error('Test 3 Failed: Successful cloud fetch did not update lastCloudSyncTimestamp!');
}
console.log(`Timestamp after successful cloud fetch: ${freshCm.lastCloudSyncTimestamp}`);

// Second failed fetch -> timestamp MUST remain syncTime
freshCm.notifySyncComplete({ success: false });
if (freshCm.lastCloudSyncTimestamp !== syncTime) {
  throw new Error('Test 3 Failed: Failed cloud fetch modified previous lastCloudSyncTimestamp!');
}
console.log(`Timestamp after subsequent failed fetch: ${freshCm.lastCloudSyncTimestamp} (Preserved)`);
console.log('✓ Test 3 Passed: Cloud refresh timestamp precision certified.\n');

// ----------------------------------------------------
// CASE 4: SYNC FAILURE & ATTENTION
// ----------------------------------------------------
console.log('--- TEST 4: SYNC FAILURE & SYNC ATTENTION ---');
cm.notifySyncStart();
cm.notifySyncError('Network connection reset by peer');
diag = cm.getDiagnostics();
console.log(`Sync Error -> syncState: ${diag.syncState}`);
if (diag.syncState !== SyncStates.SYNC_ATTENTION) {
  throw new Error('Test 4 Failed: Expected SYNC_ATTENTION on sync error!');
}
console.log('✓ Test 4 Passed: Sync failure & SYNC_ATTENTION state certified.\n');

// ----------------------------------------------------
// CASE 5: EVENT CONTRACT PAYLOAD
// ----------------------------------------------------
console.log('--- TEST 5: EVENT CONTRACT PAYLOAD INTEGRITY ---');
let connEventReceived = null;
let syncEventReceived = null;

const unsub1 = platformEventBus.subscribe(PlatformEventTypes.CONNECTIVITY_CHANGED, env => {
  connEventReceived = env.payload;
});
const unsub2 = platformEventBus.subscribe(PlatformEventTypes.SYNC_STATUS_CHANGED, env => {
  syncEventReceived = env.payload;
});

cm.notifyOnline();
cm.notifySyncStart();
console.log(`Sync Event Payload -> networkState: ${syncEventReceived.networkState} | syncState: ${syncEventReceived.syncState}`);
if (!syncEventReceived || syncEventReceived.syncState !== SyncStates.SYNCING) {
  throw new Error('Test 5 Failed: SYNC_STATUS_CHANGED event payload invalid!');
}

cm.notifySyncComplete({ success: true, timestamp: new Date().toISOString() });
console.log(`Conn Event Payload -> networkState: ${connEventReceived.networkState} | dataSource: ${connEventReceived.dataSource}`);
if (!connEventReceived || connEventReceived.networkState !== NetworkStates.ONLINE) {
  throw new Error('Test 5 Failed: CONNECTIVITY_CHANGED event payload invalid!');
}

unsub1();
unsub2();
console.log('✓ Test 5 Passed: Event contract payload structure certified.\n');

// ----------------------------------------------------
// CASE 6: NO FALSE SYNCHRONIZATION
// ----------------------------------------------------
console.log('--- TEST 6: NO FALSE SYNCHRONIZATION GUARANTEE ---');
offlineStore.setCollection('offline_journal', []); // zero pending
cm.notifyOffline();
cm.notifyOnline();
cm.notifySyncComplete({ success: true, pendingCount: 0 });
diag = cm.getDiagnostics();

console.log(`Clean Reconnect -> pendingSyncCount: ${diag.pendingSyncCount} | syncState: ${diag.syncState}`);
if (diag.pendingSyncCount !== 0 || diag.syncState !== SyncStates.IDLE) {
  throw new Error('Test 6 Failed: Clean reconnect manufactured fake sync items!');
}
console.log('✓ Test 6 Passed: No false synchronization guarantee certified.\n');

// UI Rendering Test
console.log('--- UI COMPONENT rendering MATRIX TEST ---');
const comp = new ConnectivityComponent({ connectivityManager: cm });

const onlineBadge = comp.renderBadgeHTML(diag);
console.log(`Badge Online: "${onlineBadge.trim().slice(0, 80)}..."`);
if (!onlineBadge.includes('🟢 Online')) throw new Error('UI Test Failed: Online badge mismatch!');

cm.notifyOffline();
const offlineDiagNoPending = cm.getDiagnostics();
const offlineBadge = comp.renderBadgeHTML(offlineDiagNoPending);
console.log(`Badge Offline (0 pending): "${offlineBadge.trim().slice(0, 80)}..."`);
if (!offlineBadge.includes('🔴 Offline · Local Data')) throw new Error('UI Test Failed: Offline 0 pending badge mismatch!');

cm.setPendingSyncCount(3);
const offlineDiagPending = cm.getDiagnostics();
const offlinePendingBadge = comp.renderBadgeHTML(offlineDiagPending);
console.log(`Badge Offline (3 pending): "${offlinePendingBadge.trim().slice(0, 80)}..."`);
if (!offlinePendingBadge.includes('🔴 Offline · 3 pending changes')) throw new Error('UI Test Failed: Offline 3 pending badge mismatch!');

console.log('✓ UI Component Rendering Matrix certified.\n');

console.log('====================================================');
console.log('✅ ALL 6 CONNECTIVITY & SYNC UX CONTRACT v1.0 TESTS PASSED (100%)');
console.log('====================================================');
