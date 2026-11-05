/**
 * BusinessOS Platform - Telemetry Outbox Store (Observability Control Center).
 *
 * Owns the buffered queue of telemetry records destined for the cloud and the
 * best-effort batch flush to Supabase. Deliberately independent of DataGateway /
 * offline_journal: observability must NEVER poison the durable write-retry queue
 * (a telemetry failure cannot be allowed to drop or un-protect a real business
 * write). Nothing here throws into the caller; a flush failure just leaves the
 * batch queued for the next attempt.
 *
 * Browser: persists the outbox in localStorage (`telemetry_outbox`) so events
 * captured while offline survive a reload and drain on reconnect.
 * Node/tests: falls back to an in-memory queue; transport + storage are injectable.
 */
import { runtimeConfig } from '../cloud/runtimeConfig.js';

const OUTBOX_KEY = 'telemetry_outbox';
const DEFAULT_MAX_QUEUE = 500;
const DEFAULT_BATCH_MAX = 50;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;

// Columns physically present on the telemetry_events table (see
// supabase/observability_telemetry.sql). Everything else (e.g. `tier`) is
// projected out before POST so PostgREST cannot 400 on an unknown column.
const SEND_COLUMNS = ['id', 'tenant_id', 'device_id', 'workspace', 'actor', 'category',
  'level', 'event_type', 'correlation_id', 'message', 'data', 'created_at'];

function projectForSend(rec) {
  const out = {};
  for (const col of SEND_COLUMNS) {
    if (rec[col] !== undefined) out[col] = rec[col];
  }
  return out;
}

// localStorage-backed outbox with an in-memory fallback (Node / privacy mode).
function makeStorage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      return {
        load: () => { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch { return []; } },
        save: (arr) => { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(arr)); } catch { /* quota/private mode: keep in-memory copy only */ } }
      };
    }
  } catch { /* ignore, fall through */ }
  let mem = [];
  return {
    load: () => mem.slice(),
    save: (arr) => { mem = arr.slice(); }
  };
}

export class TelemetryStore {
  constructor(config = {}) {
    this.maxQueue = config.maxQueue || DEFAULT_MAX_QUEUE;
    this.batchMax = config.batchMax || DEFAULT_BATCH_MAX;
    this.flushIntervalMs = config.flushIntervalMs || DEFAULT_FLUSH_INTERVAL_MS;
    this.transport = config.transport || null; // async (rows) => void; throws on failure
    this.storage = config.storage || makeStorage();
    this.isOnline = config.isOnline !== undefined ? config.isOnline : true;
    this._timer = null;
    this.lastError = null;
    this.droppedCount = 0;
  }

  _defaultTransport(rows) {
    const url = `${runtimeConfig.getRestUrl()}/telemetry_events`;
    const headers = runtimeConfig.getAuthHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    });
    return fetch(url, { method: 'POST', headers, body: JSON.stringify(rows) })
      .then((resp) => {
        if (!resp.ok) {
          const err = new Error(`telemetry POST ${resp.status}`);
          // 5xx / 408 / 429 are transient -> retry. Other 4xx (401/403 RLS or
          // tenant mismatch, 400 bad column, 404 missing table) are non-retryable:
          // re-queuing them forever would wedge the outbox behind a batch that can
          // never land, so flush() drops those.
          err.retryable = resp.status >= 500 || resp.status === 408 || resp.status === 429;
          throw err;
        }
      });
  }

  /** Append one record; enforce the ring-buffer cap by dropping the oldest. */
  enqueue(record) {
    if (!record || !record.id) return this.pendingCount();
    let queue;
    try { queue = this.storage.load(); } catch { queue = []; }
    if (!Array.isArray(queue)) queue = [];
    queue.push(record);
    if (queue.length > this.maxQueue) {
      const overflow = queue.length - this.maxQueue;
      queue = queue.slice(overflow);
      this.droppedCount += overflow;
    }
    try { this.storage.save(queue); } catch { /* ignore */ }
    return queue.length;
  }

  pendingCount() {
    try { const q = this.storage.load(); return Array.isArray(q) ? q.length : 0; } catch { return 0; }
  }

  /**
   * Best-effort flush of up to batchMax queued records. Success removes them
   * from the outbox; failure keeps them queued for retry. Returns a summary and
   * NEVER throws.
   */
  async flush() {
    if (!this.isOnline) return { flushed: 0, pending: this.pendingCount(), skipped: 'offline' };
    // The browser cloud transport requires an authenticated JWT: telemetry_events
    // grants INSERT to `authenticated` only (RLS tenant-scoped), so an anonymous
    // POST is rejected as 401. Until a session exists, keep the batch queued and
    // let the periodic timer drain it once a token is present. Injected transports
    // (Node tests) bypass this gate.
    if (!this.transport && runtimeConfig.getAccessToken && !runtimeConfig.getAccessToken()) {
      return { flushed: 0, pending: this.pendingCount(), skipped: 'unauthenticated' };
    }
    let queue;
    try { queue = this.storage.load(); } catch { queue = []; }
    if (!Array.isArray(queue) || queue.length === 0) return { flushed: 0, pending: 0 };

    const batch = queue.slice(0, this.batchMax);
    const rest = queue.slice(this.batchMax);
    const rows = batch.map(projectForSend);
    const transport = this.transport || ((r) => this._defaultTransport(r));

    try {
      await transport(rows);
      this.storage.save(rest);
      this.lastError = null;
      return { flushed: batch.length, pending: rest.length };
    } catch (err) {
      this.lastError = (err && err.message) || String(err);
      // Non-retryable (permanent) rejection: drop the batch instead of re-queuing
      // it forever, otherwise it wedges the outbox behind rows that can never land
      // (e.g. a tenant/JWT mismatch). Transient failures keep the batch at the head.
      if (err && err.retryable === false) {
        this.storage.save(rest);
        this.droppedCount += batch.length;
        return { flushed: 0, pending: rest.length, dropped: batch.length, error: this.lastError };
      }
      // Keep the failed batch at the head so ordering is preserved on retry.
      this.storage.save(batch.concat(rest));
      return { flushed: 0, pending: this.pendingCount(), error: this.lastError };
    }
  }

  setOnline(online) {
    this.isOnline = !!online;
    if (this.isOnline) this.scheduleFlush();
  }

  /** Periodic flush loop (browser only; idempotent). */
  start() {
    if (this._timer || typeof setInterval !== 'function') return;
    this._timer = setInterval(() => { this.flush(); }, this.flushIntervalMs);
  }

  stop() {
    if (this._timer && typeof clearInterval === 'function') clearInterval(this._timer);
    this._timer = null;
  }

  scheduleFlush() {
    // Fire a short delayed flush (debounce-ish) so bursts coalesce into one POST.
    if (typeof setTimeout !== 'function') return;
    setTimeout(() => { this.flush(); }, 250);
  }

  clear() {
    try { this.storage.save([]); } catch { /* ignore */ }
    this.droppedCount = 0;
  }
}

export const telemetryStore = new TelemetryStore();
export default telemetryStore;
