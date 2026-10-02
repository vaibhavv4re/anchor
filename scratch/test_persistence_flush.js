/**
 * Phase 3 guard - durable writes with visible state.
 *   - a failed cloud create() queues exactly one QUEUED job (no silent drop)
 *   - getSyncStatus() reports it: { pending, oldestJobAgeMs, lastError }
 *   - the connectivity badge's pendingSyncCount counts QUEUED/PENDING/ERROR, not
 *     just PENDING (the old undercount that made stuck writes look "Online")
 *   - _scheduleFastFlush coalesces a burst into ONE near-immediate flush
 *
 * Usage: node scratch/test_persistence_flush.js
 */
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { connectivityManager } from '../businessos/platform/connectivity/connectivityManager.js';

const TENANT = 'tenant_h0qc7wf';
global.window = global.window || { addEventListener: () => {} };

// Match the running app: the reachability probe has put the platform ONLINE.
// DataGateway's CONNECTIVITY_CHANGED handler re-derives isOnline from
// connectivityManager.networkState on every setPendingSyncCount, so an ONLINE
// manager is required for the fast-flush path to be exercised.
connectivityManager.notifyOnline();

offlineStore.setCollection('offline_journal', []);

let flushCalls = 0;
const failingCloud = {
  create: async () => { throw new Error('42501 row-level-security policy violation'); },
  update: async () => { throw new Error('42501 row-level-security policy violation'); },
  delete: async () => { throw new Error('42501 row-level-security policy violation'); }
};
const noopLocal = { create: () => {}, update: () => {}, delete: () => {}, getCollection: () => [] };

const dg = new DataGateway({ cloudAdapter: failingCloud, localAdapter: noopLocal, isOnline: true });
// Spy: keep the fast flush hermetic - count it, don't run the real cloud retry.
dg.flushOfflineQueue = () => { flushCalls++; return Promise.resolve({ flushed: 0, failed: 0 }); };

const checks = [];

// ---- A. A burst of failed writes queues jobs but triggers ONE debounced flush.
await Promise.all([
  dg.create('orders', { id: 'o1', tenantId: TENANT }),
  dg.create('orders', { id: 'o2', tenantId: TENANT }),
  dg.create('orders', { id: 'o3', tenantId: TENANT })
]);
checks.push(['3 failed creates queued 3 jobs', offlineStore.getCollection('offline_journal').length === 3]);
checks.push(['flush not fired before debounce window', flushCalls === 0]);

await new Promise(r => setTimeout(r, 650));
checks.push(['fast flush fired once for the burst (debounced)', flushCalls === 1]);

// ---- A2. Envelope-unwrap fix: an ONLINE connectivity notify must NOT force
// isOnline false (the bug that starved every flush path).
checks.push(['isOnline stays true through setPendingSyncCount', dg.isOnline === true]);

// ---- B. getSyncStatus reflects the backlog.
const status = dg.getSyncStatus();
checks.push(['getSyncStatus.pending === 3', status.pending === 3]);
checks.push(['oldestJobAgeMs is a non-negative number', typeof status.oldestJobAgeMs === 'number' && status.oldestJobAgeMs >= 0]);
checks.push(['lastError is null-or-string', status.lastError === null || typeof status.lastError === 'string']);

// ---- C. Jobs are QUEUED (not dropped / not clobbered) and still protected.
const states = offlineStore.getCollection('offline_journal').map(j => j.syncState);
checks.push(['all jobs still QUEUED after fast-flush window', states.every(s => s === 'QUEUED')]);

// ---- D. Badge undercount fixed: QUEUED counts toward pendingSyncCount.
const diag = connectivityManager.getDiagnostics();
checks.push(['connectivity badge counts QUEUED jobs (pendingSyncCount === 3)', diag.pendingSyncCount === 3]);

// ---- E. Fully drained -> status back to zero (syncState SYNCED).
const drained = offlineStore.getCollection('offline_journal').map(j => ({ ...j, syncState: 'SYNCED' }));
offlineStore.setCollection('offline_journal', drained);
checks.push(['drained queue reports zero pending', dg.getSyncStatus().pending === 0]);

console.log('=== Phase 3: fast flush + sync-status visibility guard ===');
let ok = true;
for (const [name, pass] of checks) { console.log((pass ? 'PASS' : 'FAIL') + ' - ' + name); if (!pass) ok = false; }
console.log(ok ? '\nRESULT: ALL PASS' : '\nRESULT: FAILURES PRESENT');
if (dg._flushTimer) clearInterval(dg._flushTimer);
process.exit(ok ? 0 : 1);
