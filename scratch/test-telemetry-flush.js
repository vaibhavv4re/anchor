/**
 * Observability - Outbox store / flush (headless).
 * Proves the direct-to-cloud telemetry path is bounded, batched, offline-safe,
 * never throws into the caller, and projects the payload down to the physical
 * telemetry_events columns (so PostgREST can never 400 on an unknown column).
 */
import { TelemetryStore } from '../businessos/platform/observability/telemetryStore.js';

let failures = 0;
const check = (label, cond) => { console.log(`  ${cond ? 'PASS' : 'FAIL'} ${label}`); if (!cond) failures++; };

function memStorage() {
  let arr = [];
  return { load: () => arr.slice(), save: (a) => { arr = a.slice(); }, size: () => arr.length };
}
const rec = (i) => ({ id: `tel_${i}`, tenant_id: 'tenant_x', tenantId: 'tenant_x', device_id: 'DEV-1', event_type: 'order:confirmed', level: 'INFO', category: 'billing', message: 'o', data: { grandTotal: i }, created_at: new Date().toISOString(), tier: 'lean' });

async function main() {
  // 1. Enqueue + flush success removes the batch, transport sees projected rows.
  const seen = [];
  const st1 = new TelemetryStore({ storage: memStorage(), transport: (rows) => { seen.push(...rows); return Promise.resolve(); }, isOnline: true });
  for (let i = 0; i < 5; i++) st1.enqueue(rec(i));
  check('pending reflects queue', st1.pendingCount() === 5);
  const r1 = await st1.flush();
  check('flush reports 5 sent', r1.flushed === 5 && r1.pending === 0);
  check('queue drained after success', st1.pendingCount() === 0);
  check('transport received all rows', seen.length === 5);
  check('projected rows drop non-columns (no tier/camelCase tenantId)', seen.every((row) => row.tier === undefined && row.tenantId === undefined && row.tenant_id === 'tenant_x'));

  // 2. Batching: only batchMax sent per flush, remainder stays queued.
  const st2 = new TelemetryStore({ storage: memStorage(), transport: () => Promise.resolve(), isOnline: true, batchMax: 3 });
  for (let i = 0; i < 7; i++) st2.enqueue(rec(i));
  const r2 = await st2.flush();
  check('batch max honored (3 sent)', r2.flushed === 3 && r2.pending === 4);

  // 3. Offline: flush is skipped, nothing sent, queue intact.
  let transportHit = false;
  const st3 = new TelemetryStore({ storage: memStorage(), transport: () => { transportHit = true; return Promise.resolve(); }, isOnline: false });
  st3.enqueue(rec(0));
  const r3 = await st3.flush();
  check('offline flush skipped', r3.skipped === 'offline' && transportHit === false && st3.pendingCount() === 1);

  // 4. Failed transport: batch stays queued, error captured, does NOT throw.
  const st4 = new TelemetryStore({ storage: memStorage(), transport: () => Promise.reject(new Error('network down')), isOnline: true });
  st4.enqueue(rec(0)); st4.enqueue(rec(1));
  let threw = false;
  let r4;
  try { r4 = await st4.flush(); } catch { threw = true; }
  check('failed flush never throws to caller', threw === false);
  check('failed flush keeps queue', st4.pendingCount() === 2 && r4.flushed === 0 && !!r4.error);

  // 5. Ring buffer: overflow drops the OLDEST, keeps newest, counts drops.
  const st5 = new TelemetryStore({ storage: memStorage(), transport: () => Promise.resolve(), isOnline: true, maxQueue: 4 });
  for (let i = 0; i < 10; i++) st5.enqueue(rec(i));
  check('queue capped at max', st5.pendingCount() === 4);
  check('overflow counted drops', st5.droppedCount === 6);
  const q5 = st5.storage.load();
  check('newest records retained (dropped oldest first)', q5[0].id === 'tel_6' && q5[3].id === 'tel_9');

  console.log(failures === 0 ? '\nTELEMETRY FLUSH: PASS' : `\nTELEMETRY FLUSH: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
