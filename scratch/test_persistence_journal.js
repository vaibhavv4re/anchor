/**
 * Phase 1 regression guard — the offline_journal device queue must NEVER be
 * clobbered by cloud delta polling.
 *
 * Reproduces the exact failure mode from finding F1: SupabaseRealtime used to
 * fetch the cloud `offline_journal` table every 2s and `setCollection` it over
 * the local device queue, silently deleting QUEUED/PENDING/ERROR jobs (orders,
 * table_sessions, KOTs, bill_revisions, invoices, payments).
 *
 * Here we:
 *   1. Seed a local QUEUED job into offlineStore.offline_journal.
 *   2. Make the (mocked) cloud return a DECOY journal that does NOT contain it.
 *   3. Boot a real SupabaseRealtime and let one 2s delta-poll tick fire.
 *   4. Assert the local QUEUED job survives, unchanged, and the decoy did not
 *      overwrite it. Also assert the removed clobber method is truly gone.
 *
 * Usage: node scratch/test_persistence_journal.js
 */
import { SupabaseRealtime } from '../businessos/platform/realtime/supabaseRealtime.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

const TENANT = 'tenant_h0qc7wf';

// ---- 1. Seed a durable local QUEUED job (a createOrder that failed RLS and is awaiting retry).
const LOCAL_JOB = {
  job_id: 'job_local_queued_1',
  sync_state: 'QUEUED',
  syncState: 'QUEUED',
  operation: 'create',
  collection: 'orders',
  tenant_id: TENANT,
  created_at: new Date().toISOString()
};
offlineStore.setCollection('offline_journal', [LOCAL_JOB]);

// ---- 2. Cloud decoy: a journal WITHOUT our local job. Pre-fix this wiped the queue.
const CLOUD_DECOY = [
  { job_id: 'job_cloud_only', sync_state: 'SYNCED', collection: 'orders', tenant_id: TENANT, created_at: new Date().toISOString() }
];

// ---- Browser globals the poll tick touches, minimal enough to run under node.
const fetchedUrls = [];
global.window = { addEventListener: () => {} };
// Node exposes a read-only `navigator` getter; force onLine=true so the poll
// tick actually runs (otherwise it early-returns and the guard passes vacuously).
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
// Node 24 exposes a global WebSocket; stub it so the guard stays hermetic and
// never opens a real socket (the clobber we removed lived in the poll path, not WS).
class NoopWebSocket {
  constructor() { this.readyState = 0; }
  send() {}
  close() {}
}
NoopWebSocket.OPEN = 1;
Object.defineProperty(globalThis, 'WebSocket', { value: NoopWebSocket, configurable: true, writable: true });
global.fetch = async (url) => {
  fetchedUrls.push(String(url));
  const isJournal = /\/offline_journal(\?|$)/.test(String(url));
  return {
    ok: true,
    status: 200,
    json: async () => (isJournal ? CLOUD_DECOY : [])
  };
};

const checks = [];
let rt = null;
try {
  // ---- 3. Boot realtime (starts the 2s interval) and wait past one tick.
  rt = new SupabaseRealtime({ eventBus: { publish: () => {} } });

  await new Promise((res) => setTimeout(res, 2600));

  // ---- 4. Assertions.
  const localJournal = offlineStore.getCollection('offline_journal') || [];

  checks.push(['_syncCloudOfflineJournal clobber method removed',
    typeof rt._syncCloudOfflineJournal === 'undefined']);

  checks.push(['local QUEUED job survived a poll tick',
    localJournal.some(j => j.job_id === LOCAL_JOB.job_id)]);

  const surviving = localJournal.find(j => j.job_id === LOCAL_JOB.job_id);
  checks.push(['surviving job syncState unchanged (QUEUED)',
    surviving && (surviving.syncState === 'QUEUED' || surviving.sync_state === 'QUEUED')]);

  checks.push(['cloud decoy did NOT replace the device queue',
    !localJournal.some(j => j.job_id === 'job_cloud_only')]);

  checks.push(['delta poll never re-fetches offline_journal',
    !fetchedUrls.some(u => /\/offline_journal(\?|$)/.test(u))]);
} catch (e) {
  checks.push(['boot + poll tick threw: ' + e.message, false]);
} finally {
  if (rt && rt.pollTimer) clearInterval(rt.pollTimer);
  if (rt && rt.heartbeatTimer) clearInterval(rt.heartbeatTimer);
  if (rt && rt.broadcastChannel) { try { rt.broadcastChannel.close(); } catch (_) {} }
}

console.log('=== Phase 1: offline_journal clobber regression guard ===');
let ok = true;
for (const [name, pass] of checks) { console.log((pass ? 'PASS' : 'FAIL') + ' - ' + name); if (!pass) ok = false; }
console.log(ok ? '\nRESULT: ALL PASS' : '\nRESULT: FAILURES PRESENT');
process.exit(ok ? 0 : 1);
