/**
 * RestaurantOS - Observability Control Center (System Observatory)
 *
 * Owner / superadmin-only, full-screen diagnostics surface. Reads the redacted
 * telemetry stream that every client device writes to `telemetry_events` and
 * presents it as an ISSUES-FIRST console: every distinct problem is grouped,
 * de-duplicated, humanized, ranked by severity, and made actionable (Inspect /
 * Isolate / Acknowledge) instead of a flat firehose of rows.
 *
 * Reads are DIRECT Supabase REST (auth headers) - never through hydrateCollections
 * - and it opens its OWN scoped realtime channel (`rt:telemetry`) only while open,
 * so POS devices never subscribe to the high-frequency stream. All rendering is
 * read-only; nothing here writes business data. Acknowledgements are local-only
 * (localStorage) and never mutate telemetry.
 *
 * Teardown: destroy() removes the realtime channel and clears timers so the
 * subscriptions do not leak across app re-renders (matches the shell contract).
 */
import { runtimeConfig } from '../../../../../businessos/platform/cloud/runtimeConfig.js';
import { getSupabaseClient } from '../../../../../businessos/platform/realtime/supabaseClientFactory.js';
import { healthMonitor } from '../../../../../businessos/platform/health/healthMonitor.js';
import { getDeviceId } from '../../../../../businessos/platform/metadata/entityMetadata.js';

const DEFAULT_TENANT = 'tenant_h0qc7wf';
const STREAM_CAP = 500;
const FETCH_LIMIT = 500;
const POLL_INTERVAL_MS = 15000;
const HEALTH_REFRESH_MS = 20000;
const STALE_SESSION_MS = 6 * 60 * 60 * 1000; // open > 6h => dangling
const ACK_STORE_KEY = 'oc_acked_issues';

/** HTML-escape untrusted telemetry content before interpolation. */
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Rule table mapping a raw error/telemetry signature to a plain-language
 * diagnosis + a concrete recommended action. First match wins; keep the most
 * specific patterns at the top.
 */
const DIAGNOSIS_RULES = [
  {
    test: /pgrst205|could not find the table|not found in the api|schema cache|did you mean/i,
    title: 'Table missing from the API',
    action: 'The target table is not exposed in the Supabase PostgREST API. Create it (or reload the schema cache) and add its RLS policy, then re-sync.'
  },
  {
    test: /permission denied|42501|row-level security|\b401\b|jwt|not authorized/i,
    title: 'Auth / RLS rejection',
    action: 'The write was rejected by RLS or sent without a valid JWT. Confirm the operator is logged in (AUTH_MODE=server) and the table has an authenticated policy for this tenant.'
  },
  {
    test: /offline_journal/i,
    title: 'Audit journal write failed',
    action: 'The local session-audit journal could not reach the cloud. Verify the offline_journal table exists and its RLS/grants allow the current role.'
  },
  {
    test: /health:snapshot|degraded/i,
    title: 'System health degraded',
    action: 'A subsystem reported DEGRADED (usually queued writes not flushing). Check connectivity and run Sync; inspect the pending-write count in System Health.'
  },
  {
    test: /sync|pending|queue|backlog/i,
    title: 'Sync backlog',
    action: 'Writes are queued and not yet flushed. Verify connectivity and the sync engine; stale queue entries usually clear once the cloud write succeeds.'
  },
  {
    test: /timeout|network|failed to fetch|econn|unreachable/i,
    title: 'Connectivity failure',
    action: 'A cloud call could not reach Supabase. Check the device network and the Supabase project status; the outbox will retry automatically.'
  },
  {
    test: /constraint|duplicate|violates|null value|foreign key/i,
    title: 'Data integrity violation',
    action: 'A write broke a database constraint (duplicate key, missing FK, null). Review the payload in Inspect and correct the source data.'
  }
];

export class ObservabilityControlCenterView {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
    this.onBack = deps.onBack || null;

    this.records = [];
    this.seenIds = new Set();
    this.paused = false;

    // UI state
    this.mode = 'issues';                 // 'issues' | 'stream'
    this.filters = { level: 'ALL', category: 'ALL', device: 'ALL', q: '', hideNoise: true };
    this.issueFilter = { sev: 'OPEN', q: '' };
    this.isolateFp = null;                // when set, stream shows only this fingerprint
    this.expanded = new Set();            // expanded stream group keys
    this._detailFp = null;                // fingerprint open in the drawer
    this.acked = this._loadAcked();

    // plumbing
    this._channel = null;
    this._rtClient = null;
    this._pollTimer = null;
    this._healthTimer = null;
    this._rootEl = null;
    this._onClick = null;
    this._onInput = null;
    this._onChange = null;
  }

  // ---- Session / scope helpers ------------------------------------------

  _tenantId(session) { return (session && session.tenantId) || DEFAULT_TENANT; }

  // The platform superadmin (tenant 'system' / role-superadmin) observes every
  // deployed client, so its reads are cross-tenant (enabled by the
  // observatory_superadmin_read_all RLS policy). All other operators stay scoped
  // to their own tenant.
  _isPlatformOperator(session) {
    if (!session) return false;
    const roleId = session.roleId || session.role_id || '';
    return (session.tenantId || session.tenant_id) === 'system' || roleId === 'role-superadmin';
  }

  _headers() { return runtimeConfig.getAuthHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=representation' }); }

  // ---- Data fetch --------------------------------------------------------

  async _fetchRecent(session) {
    const tenantId = this._tenantId(session);
    const params = new URLSearchParams({
      select: '*',
      order: 'created_at.desc',
      limit: String(FETCH_LIMIT)
    });
    // Scope non-superadmin operators to their own tenant; the platform
    // superadmin reads across every tenant (RLS permits SELECT only).
    if (!this._isPlatformOperator(session)) params.set('tenant_id', `eq.${tenantId}`);
    try {
      const resp = await fetch(`${runtimeConfig.getRestUrl()}/telemetry_events?${params.toString()}`, { headers: this._headers() });
      if (!resp.ok) { this._setStatus(`Load failed (HTTP ${resp.status})`); return []; }
      return await resp.json();
    } catch (e) {
      this._setStatus('Cloud read error - will keep retrying');
      return [];
    }
  }

  _absorbIncoming(rows) {
    if (!Array.isArray(rows)) return;
    rows.forEach((r) => {
      if (!r || !r.id || this.seenIds.has(r.id)) return;
      this.seenIds.add(r.id);
      this.records.push(r);
    });
    if (this.records.length > STREAM_CAP) {
      this.records = this.records.slice(0, STREAM_CAP);
      this.seenIds = new Set(this.records.map((r) => r.id));
    }
  }

  // ---- Realtime (own scoped channel) -------------------------------------

  async _subscribeRealtime(session) {
    const tenantId = this._tenantId(session);
    const client = await getSupabaseClient();
    if (!client) { this._startPoll(session); return; }
    this._rtClient = client;
    const changeFilter = { event: 'INSERT', schema: 'public', table: 'telemetry_events' };
    if (!this._isPlatformOperator(session)) changeFilter.filter = `tenant_id=eq.${tenantId}`;
    try {
      this._channel = client.channel('rt:telemetry')
        .on('postgres_changes',
          changeFilter,
          (payload) => {
            if (this.paused) return;
            this._absorbIncoming([payload.new]);
            this._paintAll(session);
          })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') this._setStatus('Live');
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            this._setStatus('Realtime down - polling fallback');
            this._startPoll(session);
          }
        });
    } catch { this._startPoll(session); }
  }

  _startPoll(session) {
    if (this._pollTimer) return;
    this._pollTimer = setInterval(async () => {
      if (this.paused) return;
      const rows = await this._fetchRecent(session);
      this._absorbIncoming(rows);
      this._paintAll(session);
    }, POLL_INTERVAL_MS);
  }

  // ---- Normalization / fingerprinting ------------------------------------

  /** Pull a readable core out of a message that may embed a JSON error blob. */
  _coreMessage(record) {
    const raw = String(record.message || record.event_type || '');
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const j = JSON.parse(m[0]);
        const parts = [j.message, j.hint && `hint: ${j.hint}`, j.code].filter(Boolean);
        if (parts.length) return parts.join(' - ');
      } catch (_) { /* not valid JSON; fall through */ }
    }
    return raw;
  }

  /** Stable fingerprint that collapses variable ids/numbers/timestamps. */
  _fingerprint(record) {
    const core = this._coreMessage(record).toLowerCase()
      .replace(/[0-9a-f]{8,}(-[0-9a-f]+)*/gi, '#')
      .replace(/\d+/g, '#')
      .replace(/\s+/g, ' ')
      .trim().slice(0, 100);
    return `${record.level}|${record.event_type}|${core}`;
  }

  /** Human label from an event type like platform:sync:status_changed. */
  _humanize(eventType) {
    const s = String(eventType || '').replace(/^platform:/i, '').replace(/[:_]+/g, ' ').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Event';
  }

  /** Match the diagnosis rule for a record (message + event type). */
  _diagnose(record) {
    const hay = `${record.event_type || ''} ${this._coreMessage(record)}`;
    for (const rule of DIAGNOSIS_RULES) {
      if (rule.test.test(hay)) return rule;
    }
    return { title: this._humanize(record.event_type), action: 'Inspect the occurrences below for the exact payload and device, then trace the source workspace.' };
  }

  /** Routine INFO that should not clutter the stream by default. */
  _isNoise(record) {
    if (record.level !== 'INFO') return false;
    const t = String(record.event_type || '').toLowerCase();
    return /health:snapshot|sync:status_changed|connectivity:changed|data:changed|heartbeat|:ping|projection/.test(t);
  }

  _sortedRecords() {
    return this.records.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  // ---- Issue model (ERROR / WARNING grouped by fingerprint) --------------

  _buildIssues() {
    const map = new Map();
    this.records.forEach((r) => {
      if (r.level !== 'ERROR' && r.level !== 'WARNING') return;
      const fp = this._fingerprint(r);
      const t = new Date(r.created_at).getTime() || 0;
      const prev = map.get(fp);
      if (prev) {
        prev.count += 1;
        if (t > prev.lastTs) { prev.lastTs = t; prev.lastSeen = r.created_at; prev.sample = r; }
        if (t < prev.firstTs) prev.firstTs = t;
        if (r.device_id && !prev.devices.includes(r.device_id)) prev.devices.push(r.device_id);
      } else {
        map.set(fp, {
          fp, level: r.level, eventType: r.event_type, category: r.category,
          message: this._coreMessage(r), count: 1,
          firstTs: t, lastTs: t, firstSeen: r.created_at, lastSeen: r.created_at,
          devices: r.device_id ? [r.device_id] : [], sample: r
        });
      }
    });
    const sevRank = (lvl) => (lvl === 'ERROR' ? 0 : 1);
    return Array.from(map.values())
      .map((i) => ({ ...i, diag: this._diagnose(i.sample), acked: this.acked.has(i.fp) }))
      .sort((a, b) => (a.acked ? 1 : 0) - (b.acked ? 1 : 0)
        || sevRank(a.level) - sevRank(b.level)
        || b.count - a.count
        || b.lastTs - a.lastTs);
  }

  _openIssueCount() {
    return this._buildIssues().filter((i) => !i.acked).length;
  }

  // ---- Stream grouping (collapse consecutive identical fingerprints) -----

  _buildStreamGroups() {
    const recs = this._sortedRecords();
    const groups = [];
    for (const r of recs) {
      const fp = this._fingerprint(r);
      const last = groups[groups.length - 1];
      if (last && last.fp === fp) {
        last.count += 1;
        last.firstTs = new Date(r.created_at).getTime() || last.firstTs;
        last.records.push(r);
      } else {
        groups.push({
          fp, level: r.level, eventType: r.event_type, category: r.category,
          device: r.device_id, message: this._coreMessage(r), count: 1,
          lastTs: new Date(r.created_at).getTime() || 0, firstTs: new Date(r.created_at).getTime() || 0,
          sample: r, records: [r]
        });
      }
    }
    return groups;
  }

  _filteredStreamGroups() {
    const f = this.filters;
    const q = f.q ? f.q.toLowerCase() : '';
    return this._buildStreamGroups().filter((g) => {
      if (this.isolateFp) return g.fp === this.isolateFp;
      if (f.hideNoise && g.level === 'INFO' && this._isNoise(g.sample)) return false;
      if (f.level !== 'ALL' && g.level !== f.level) return false;
      if (f.category !== 'ALL' && g.category !== f.category) return false;
      if (f.device !== 'ALL' && g.device !== f.device) return false;
      if (q && !`${g.eventType} ${g.message} ${g.device}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  // ---- Bottlenecks (derived latency between paired lifecycle events) -----

  _bottlenecks() {
    const byCorr = new Map();
    this.records.forEach((r) => {
      if (!r.correlation_id) return;
      const t = new Date(r.created_at).getTime();
      if (isNaN(t)) return;
      const g = byCorr.get(r.correlation_id) || { min: t, max: t, types: [] };
      g.min = Math.min(g.min, t); g.max = Math.max(g.max, t);
      if (g.types.length < 6) g.types.push(r.event_type);
      byCorr.set(r.correlation_id, g);
    });
    const rows = [];
    byCorr.forEach((g, cid) => {
      const spanMs = g.max - g.min;
      if (spanMs > 60000 && g.types.length >= 2) rows.push({ cid, spanMs, stages: g.types });
    });
    return rows.sort((a, b) => b.spanMs - a.spanMs).slice(0, 8);
  }

  // ---- Loose ends / anomalies --------------------------------------------

  _looseEnds(session) {
    const items = [];
    let pending = 0; let lastSyncError = null;
    try {
      const sync = (this.dataGateway && typeof this.dataGateway.getSyncStatus === 'function') ? this.dataGateway.getSyncStatus() : {};
      pending = sync.pending || 0; lastSyncError = sync.lastError || null;
    } catch { /* ignore */ }
    if (pending > 0) items.push({ sev: 'WARNING', label: 'Unsynced writes pending on this device', value: String(pending) });
    if (lastSyncError) items.push({ sev: 'ERROR', label: 'Last sync error', value: this._coreMessage({ message: String(lastSyncError), event_type: '' }).slice(0, 120) });

    const rt = (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.realtime) ? window.__APP__.platform.realtime : null;
    if (rt && rt.isConnected === false) items.push({ sev: 'WARNING', label: 'Realtime channel not connected', value: 'poll fallback' });

    const errDevices = new Set(this.records.filter((r) => r.level === 'ERROR').map((r) => r.device_id).filter(Boolean));
    if (errDevices.size > 0) items.push({ sev: 'INFO', label: 'Devices reporting errors', value: Array.from(errDevices).slice(0, 5).join(', ') });

    try {
      const sessions = (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') ? (this.dataGateway.getCachedCollection('table_sessions', this._tenantId(session)) || []) : [];
      const now = Date.now();
      const stale = sessions.filter((s) => {
        const status = String(s.status || (s.data && s.data.status) || '').toUpperCase();
        const opened = s.openedAt || s.opened_at || s.startedAt || (s.data && s.data.openedAt);
        if (status !== 'OPEN' || !opened) return false;
        return now - new Date(opened).getTime() > STALE_SESSION_MS;
      });
      if (stale.length > 0) items.push({ sev: 'WARNING', label: 'Sessions open past threshold', value: `${stale.length} table(s)` });
    } catch { /* ignore */ }

    if (items.length === 0) items.push({ sev: 'INFO', label: 'No loose ends detected', value: 'system nominal' });
    return items;
  }

  _deviceList() {
    const set = [];
    this.records.forEach((r) => { if (r.device_id && !set.includes(r.device_id)) set.push(r.device_id); });
    return set;
  }

  // ---- Acknowledgement store (local only) --------------------------------

  _loadAcked() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(ACK_STORE_KEY);
        if (raw) return new Set(JSON.parse(raw));
      }
    } catch (_) { /* ignore */ }
    return new Set();
  }

  _persistAcked() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(ACK_STORE_KEY, JSON.stringify(Array.from(this.acked)));
      }
    } catch (_) { /* ignore */ }
  }

  _toggleAck(fp) {
    if (this.acked.has(fp)) this.acked.delete(fp); else this.acked.add(fp);
    this._persistAcked();
  }

  // ---- Formatting helpers ------------------------------------------------

  _safeDeviceId() { try { return getDeviceId(); } catch { return 'device_unknown'; } }
  _fmtTime(ts) { try { return new Date(ts).toLocaleTimeString(); } catch { return ''; } }
  _fmtDur(ms) { const s = Math.round(ms / 1000); if (s < 60) return s + 's'; const m = Math.floor(s / 60); return m + 'm ' + (s % 60) + 's'; }
  _relTime(ts) {
    if (!ts) return '';
    const d = Date.now() - new Date(ts).getTime();
    if (isNaN(d)) return '';
    const s = Math.round(d / 1000);
    if (s < 45) return 'just now';
    const m = Math.round(s / 60); if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }

  _setStatus(msg) {
    this._statusText = msg;
    const el = this.mount && this.mount.querySelector('#oc-status');
    if (el) el.textContent = msg;
  }

  _health() { try { return healthMonitor.getSystemHealth(); } catch { return null; } }

  _recordsForFp(fp) { return this._sortedRecords().filter((r) => this._fingerprint(r) === fp); }

  // ---- Render ------------------------------------------------------------

  render(mount, session) {
    this.mount = mount;
    this.session = session;
    this._statusText = this._statusText || 'connecting…';

    mount.innerHTML = `
      <style>${this._css()}</style>
      <div id="oc-root" class="oc-root">
        <div id="oc-header"></div>
        <div class="oc-grid">
          <div class="oc-main">
            <div id="oc-toolbar" class="oc-toolbar"></div>
            <div id="oc-panel" class="oc-panel"></div>
          </div>
          <aside id="oc-side" class="oc-side"></aside>
        </div>
        <div id="oc-drawer" class="oc-drawer"></div>
      </div>`;

    this._rootEl = mount.querySelector('#oc-root');
    this._bindDelegated();
    this._paintAll(session);

    this._fetchRecent(session).then((rows) => { this._absorbIncoming(rows); this._paintAll(session); });
    this._subscribeRealtime(session);
    this._healthTimer = setInterval(() => this._paintSide(this.session), HEALTH_REFRESH_MS);
  }

  _paintAll(session) {
    this._paintHeader(session);
    this._paintToolbar(session);
    this._paintPanel(session);
    this._paintSide(session);
    this._paintDrawer();
  }

  // ---- Header + tabs -----------------------------------------------------

  _paintHeader(session) {
    const el = this.mount && this.mount.querySelector('#oc-header');
    if (!el) return;
    const health = this._health();
    const openCount = this._openIssueCount();
    el.innerHTML = `
      <div class="oc-hdr card">
        <div class="oc-hdr-left">
          <div class="oc-eyebrow">System Observatory</div>
          <h2 class="oc-title">🛰️ Observability Control Center</h2>
          <div class="oc-sub">This device: <strong>${esc(this._safeDeviceId())}</strong> · <span id="oc-status" class="oc-status">${esc(this._statusText)}</span></div>
        </div>
        <div class="oc-hdr-right">
          <span class="badge ${health && health.status === 'HEALTHY' ? 'badge-success' : 'badge-warning'}">${esc(health ? health.status : 'UNKNOWN')}</span>
          <button class="btn-secondary oc-btn" data-action="refresh">↻ Refresh</button>
          <button class="btn-secondary oc-btn" data-action="pause">${this.paused ? '▶ Resume' : '⏸ Pause'}</button>
          <button class="btn-secondary oc-btn" data-action="back">← Back to workspace</button>
        </div>
      </div>
      <div class="oc-tabs">
        <button class="oc-tab ${this.mode === 'issues' ? 'active' : ''}" data-action="mode" data-mode="issues">🧩 Issues ${openCount ? `<span class="oc-pill">${openCount}</span>` : ''}</button>
        <button class="oc-tab ${this.mode === 'stream' ? 'active' : ''}" data-action="mode" data-mode="stream">📡 Live Stream</button>
      </div>`;
  }

  // ---- Toolbar (mode-specific filters) -----------------------------------

  _paintToolbar(session) {
    const el = this.mount && this.mount.querySelector('#oc-toolbar');
    if (!el) return;
    if (this.mode === 'issues') {
      const seg = (v, label) => `<button class="oc-seg-btn ${this.issueFilter.sev === v ? 'active' : ''}" data-action="sev" data-sev="${v}">${label}</button>`;
      el.innerHTML = `
        <div class="oc-tools">
          <div class="oc-seg">${seg('OPEN', 'Open')}${seg('ERROR', 'Errors')}${seg('WARN', 'Warnings')}${seg('ALL', 'All')}</div>
          <input id="oc-i-q" class="oc-search" placeholder="search issues…" value="${esc(this.issueFilter.q)}" />
          <span class="oc-hint">Each card is one distinct problem, grouped across devices &amp; time.</span>
        </div>`;
      return;
    }
    const devices = this._deviceList();
    const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label || v)}</option>`;
    el.innerHTML = `
      <div class="oc-tools">
        <select id="oc-f-level" class="oc-sel">${['ALL', 'INFO', 'WARNING', 'ERROR'].map((v) => opt(v, this.filters.level)).join('')}</select>
        <select id="oc-f-category" class="oc-sel">${['ALL', 'lifecycle', 'billing', 'stock', 'sync', 'error', 'warning', 'perf', 'other'].map((v) => opt(v, this.filters.category)).join('')}</select>
        <select id="oc-f-device" class="oc-sel">${['ALL', ...devices].map((v) => opt(v, this.filters.device)).join('')}</select>
        <input id="oc-f-q" class="oc-search" placeholder="search stream…" value="${esc(this.filters.q)}" />
        <label class="oc-check"><input type="checkbox" id="oc-hide-noise" ${this.filters.hideNoise ? 'checked' : ''} /> Hide routine INFO</label>
        ${this.isolateFp ? `<button class="oc-isolate-pill" data-action="clear-isolate">🎯 Isolated: ${esc(this._humanize((this._recordsForFp(this.isolateFp)[0] || {}).event_type || ''))} ✕</button>` : ''}
      </div>`;
  }

  // ---- Panel: Issues board or Stream -------------------------------------

  _paintPanel(session) {
    const el = this.mount && this.mount.querySelector('#oc-panel');
    if (!el) return;
    el.innerHTML = this.mode === 'issues' ? this._issuesHtml(session) : this._streamHtml(session);
  }

  _issuesHtml(session) {
    let list = this._buildIssues();
    const sf = this.issueFilter.sev;
    if (sf === 'OPEN') list = list.filter((i) => !i.acked);
    else if (sf === 'ERROR') list = list.filter((i) => i.level === 'ERROR');
    else if (sf === 'WARN') list = list.filter((i) => i.level === 'WARNING');
    const q = (this.issueFilter.q || '').toLowerCase();
    if (q) list = list.filter((i) => `${i.eventType} ${i.message} ${i.diag.title}`.toLowerCase().includes(q));

    if (list.length === 0) {
      const msg = sf === 'OPEN' ? 'No open issues. 🎉 Everything reported is healthy or acknowledged.' : 'No matching issues.';
      return `<div class="oc-empty">${esc(msg)}</div>`;
    }

    return `<div class="oc-issue-list">${list.map((i) => `
      <div class="oc-issue sev-${esc(i.level)} ${i.acked ? 'acked' : ''}">
        <div class="oc-issue-head">
          <span class="oc-sev oc-sev-${esc(i.level)}">${esc(i.level)}</span>
          <span class="oc-issue-title">${esc(i.diag.title)}</span>
          <span class="oc-count">×${i.count}</span>
          <span class="oc-time" title="${esc(i.lastSeen)}">${esc(this._relTime(i.lastSeen))}</span>
          ${i.acked ? '<span class="oc-acktag">Acknowledged</span>' : ''}
        </div>
        <div class="oc-issue-sub">
          <code>${esc(i.eventType)}</code>
          <span class="oc-dot">·</span><span>${esc(i.category || 'other')}</span>
          <span class="oc-dot">·</span><span>${esc(i.devices.slice(0, 4).join(', ') || '·')}${i.devices.length > 4 ? ` +${i.devices.length - 4}` : ''}</span>
        </div>
        <div class="oc-issue-msg">${esc((i.message || '').slice(0, 200))}</div>
        <div class="oc-issue-act">→ ${esc(i.diag.action)}</div>
        <div class="oc-issue-btns">
          <button class="oc-mini" data-action="inspect" data-fp="${esc(i.fp)}">🔍 Inspect</button>
          <button class="oc-mini" data-action="isolate" data-fp="${esc(i.fp)}">🎯 Isolate in stream</button>
          <button class="oc-mini" data-action="ack" data-fp="${esc(i.fp)}">${i.acked ? '↩ Reopen' : '✓ Acknowledge'}</button>
        </div>
      </div>`).join('')}</div>`;
  }

  _streamHtml(session) {
    const groups = this._filteredStreamGroups();
    if (groups.length === 0) {
      return `<div class="oc-empty">No events match. ${this.filters.hideNoise ? 'Routine INFO is hidden — try turning it off, ' : ''}or waiting for device activity.</div>`;
    }
    return `<div class="oc-stream">${groups.map((g) => {
      const isOpen = this.expanded.has(g.fp);
      const span = g.count > 1 ? `${this._fmtTime(g.sample.created_at)} → ${this._relTime(new Date(g.firstTs).toISOString())}` : this._fmtTime(g.sample.created_at);
      return `
        <div class="oc-sgroup sev-${esc(g.level)}">
          <div class="oc-srow" data-action="toggle" data-key="${esc(g.fp)}">
            <span class="oc-sev oc-sev-${esc(g.level)}">${esc(g.level)}</span>
            <span class="oc-stime">${esc(span)}</span>
            <span class="oc-sdev">${esc(g.device || '·')}</span>
            <span class="oc-sevtype"><code>${esc(g.eventType)}</code></span>
            <span class="oc-smsg">${esc((g.message || '').slice(0, 120))}</span>
            ${g.count > 1 ? `<span class="oc-count">×${g.count}</span>` : ''}
            <span class="oc-caret">${isOpen ? '▾' : '▸'}</span>
          </div>
          ${isOpen ? `<div class="oc-sdetail">${this._streamDetailHtml(g)}</div>` : ''}
        </div>`;
    }).join('')}</div>`;
  }

  _streamDetailHtml(g) {
    const occ = g.records.slice(0, 20).map((r) => `<div class="oc-occ"><span>${esc(this._fmtTime(r.created_at))}</span><span>${esc(r.device_id || '·')}</span><span>${esc(r.actor || 'SYSTEM')}</span></div>`).join('');
    return `
      <div class="oc-occ-list">${occ}</div>
      <pre class="oc-json">${esc(JSON.stringify(g.sample.data || g.sample, null, 2))}</pre>`;
  }

  // ---- Sidebar: health + loose ends + bottlenecks ------------------------

  _paintSide(session) {
    const el = this.mount && this.mount.querySelector('#oc-side');
    if (!el) return;
    const health = this._health();
    const loose = this._looseEnds(session);
    const bots = this._bottlenecks();
    el.innerHTML = `
      <div class="card oc-card">
        <h3 class="oc-card-h">💚 System Health</h3>
        ${this._healthHtml(health)}
      </div>
      <div class="card oc-card">
        <h3 class="oc-card-h">🧵 Loose Ends</h3>
        ${loose.map((i) => `<div class="oc-loose ${esc(i.sev)}"><span>${i.sev === 'ERROR' ? '🔴' : i.sev === 'WARNING' ? '🟠' : '🟢'} ${esc(i.label)}</span><span class="oc-loose-v">${esc(i.value)}</span></div>`).join('')}
      </div>
      ${bots.length ? `<div class="card oc-card">
        <h3 class="oc-card-h">⏱️ Slow Flows</h3>
        ${bots.map((b) => `<div class="oc-bot"><strong>${esc(this._fmtDur(b.spanMs))}</strong> <span class="oc-bot-cid">${esc(b.cid)}</span><div class="oc-bot-stages">${esc(b.stages.join(' → '))}</div></div>`).join('')}
      </div>` : ''}`;
  }

  _healthHtml(health) {
    if (!health) return '<p class="oc-muted">Health unavailable.</p>';
    const comps = health.components || {};
    const dot = (st) => {
      const s = String(st || '').toUpperCase();
      const cls = (s === 'HEALTHY' || s === 'ONLINE' || s === 'CONNECTED') ? 'g' : (s === 'OFFLINE' || s === 'DEGRADED' || s === 'ERROR') ? 'r' : 'y';
      return `<span class="oc-dotc ${cls}"></span>`;
    };
    const row = (label, status, extra) => `<div class="oc-hrow">${dot(status)}<span>${esc(label)}</span><span class="oc-hval">${esc(status)}${extra ? ' · ' + esc(extra) : ''}</span></div>`;
    return `
      <div class="oc-hoverall">Overall: <strong>${esc(health.status)}</strong></div>
      ${row('Database / storage', comps.database && comps.database.status)}
      ${row('Sync engine', comps.syncEngine && comps.syncEngine.status, comps.syncEngine && comps.syncEngine.pendingCommandsCount ? comps.syncEngine.pendingCommandsCount + ' pending' : '')}
      ${row('Realtime hub', comps.webSocketHub && comps.webSocketHub.status)}
      ${row('Printers', comps.printers && comps.printers.status, comps.printers && comps.printers.activePrintersCount ? comps.printers.activePrintersCount + ' configured' : '')}
      ${row('Offline mode', comps.offlineMode && comps.offlineMode.isOffline ? 'OFFLINE' : 'ONLINE')}
    `;
  }

  // ---- Drawer (Inspect) --------------------------------------------------

  _openDrawer(fp) { this._detailFp = fp; this._paintDrawer(); }

  _paintDrawer() {
    const el = this.mount && this.mount.querySelector('#oc-drawer');
    if (!el) return;
    if (!this._detailFp) { el.className = 'oc-drawer'; el.innerHTML = ''; return; }
    el.className = 'oc-drawer open';
    el.innerHTML = this._drawerHtml(this._detailFp);
  }

  _drawerHtml(fp) {
    const recs = this._recordsForFp(fp);
    if (recs.length === 0) return '';
    const sample = recs[0];
    const diag = this._diagnose(sample);
    const devices = Array.from(new Set(recs.map((r) => r.device_id).filter(Boolean)));
    const occ = recs.slice(0, 40).map((r) => `
      <div class="oc-docc">
        <span class="oc-docc-t">${esc(this._fmtTime(r.created_at))}</span>
        <span class="oc-docc-d">${esc(r.device_id || '·')}</span>
        <span class="oc-docc-a">${esc(r.actor || 'SYSTEM')}</span>
        <span class="oc-docc-m">${esc(this._coreMessage(r).slice(0, 140))}</span>
      </div>`).join('');
    return `
      <div class="oc-drawer-head">
        <span class="oc-sev oc-sev-${esc(sample.level)}">${esc(sample.level)}</span>
        <h3>${esc(diag.title)}</h3>
        <button class="oc-mini oc-drawer-x" data-action="close-drawer">✕</button>
      </div>
      <div class="oc-drawer-body">
        <div class="oc-dblock"><div class="oc-dlabel">Event</div><code>${esc(sample.event_type)}</code> · ${esc(sample.category || 'other')} · ×${recs.length}</div>
        <div class="oc-dblock"><div class="oc-dlabel">Recommended action</div><div class="oc-daction">${esc(diag.action)}</div></div>
        <div class="oc-dblock"><div class="oc-dlabel">Devices affected (${devices.length})</div><div>${esc(devices.join(', ') || '·')}</div></div>
        <div class="oc-dblock"><div class="oc-dlabel">First seen</div><div>${esc(this._fmtTime(recs[recs.length - 1].created_at))} · ${esc(this._relTime(recs[recs.length - 1].created_at))}</div></div>
        <div class="oc-dblock"><div class="oc-dlabel">Occurrences</div><div class="oc-docc-list">${occ}</div></div>
        <div class="oc-dblock"><div class="oc-dlabel">Latest payload (redacted)</div><pre class="oc-json">${esc(JSON.stringify(sample.data || sample, null, 2))}</pre></div>
        <button class="oc-mini" data-action="copy" data-fp="${esc(fp)}">📋 Copy issue JSON</button>
      </div>`;
  }

  _copyFp(fp) {
    try {
      const payload = JSON.stringify(this._recordsForFp(fp), null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(payload).then(() => this._setStatus('Copied issue JSON'), () => this._setStatus('Copy blocked by browser'));
      } else { this._setStatus('Clipboard unavailable'); }
    } catch { this._setStatus('Copy failed'); }
  }

  // ---- Delegated events --------------------------------------------------

  _bindDelegated() {
    if (!this._rootEl) return;
    this._onClick = (e) => this._handleClick(e);
    this._onChange = (e) => this._handleChange(e);
    this._onInput = (e) => this._handleInput(e);
    this._rootEl.addEventListener('click', this._onClick);
    this._rootEl.addEventListener('change', this._onChange);
    this._rootEl.addEventListener('input', this._onInput);
  }

  _handleClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn || !this._rootEl.contains(btn)) return;
    const action = btn.dataset.action;
    const fp = btn.dataset.fp;
    const session = this.session;
    switch (action) {
      case 'back': if (this.onBack) this.onBack(); break;
      case 'refresh': this._setStatus('refreshing…'); this._fetchRecent(session).then((rows) => { this._absorbIncoming(rows); this._paintAll(session); }); break;
      case 'pause': this.paused = !this.paused; this._paintHeader(session); break;
      case 'mode': this.mode = btn.dataset.mode; this.isolateFp = null; this._paintAll(session); break;
      case 'sev': this.issueFilter.sev = btn.dataset.sev; this._paintToolbar(session); this._paintPanel(session); break;
      case 'ack': this._toggleAck(fp); this._paintPanel(session); this._paintHeader(session); break;
      case 'isolate': this.mode = 'stream'; this.isolateFp = fp; this._paintAll(session); break;
      case 'clear-isolate': this.isolateFp = null; this._paintAll(session); break;
      case 'toggle': { const k = btn.dataset.key; if (this.expanded.has(k)) this.expanded.delete(k); else this.expanded.add(k); this._paintPanel(session); break; }
      case 'inspect': this._openDrawer(fp); break;
      case 'close-drawer': this._detailFp = null; this._paintDrawer(); break;
      case 'copy': this._copyFp(fp); break;
      default: break;
    }
  }

  _handleChange(e) {
    const id = e.target.id;
    const session = this.session;
    if (id === 'oc-f-level') this.filters.level = e.target.value;
    else if (id === 'oc-f-category') this.filters.category = e.target.value;
    else if (id === 'oc-f-device') this.filters.device = e.target.value;
    else if (id === 'oc-hide-noise') this.filters.hideNoise = e.target.checked;
    else return;
    this._paintPanel(session);
  }

  _handleInput(e) {
    const id = e.target.id;
    if (id === 'oc-f-q') this.filters.q = e.target.value;
    else if (id === 'oc-i-q') this.issueFilter.q = e.target.value;
    else return;
    this._paintPanel(this.session);
  }

  // ---- Styles ------------------------------------------------------------

  _css() {
    return `
    .oc-root{display:flex;flex-direction:column;gap:16px;padding-bottom:40px;}
    .oc-root .card{background:var(--bg-surface-1);border:1px solid var(--border-subtle);}
    .oc-hdr{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding:16px 20px;}
    .oc-eyebrow{font-size:0.72rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:.04em;}
    .oc-title{font-size:1.4rem;margin:2px 0 0;}
    .oc-sub{font-size:0.78rem;color:var(--text-muted);margin-top:4px;}
    .oc-status{color:var(--text-muted);}
    .oc-hdr-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
    .oc-btn{padding:8px 12px;}
    .oc-tabs{display:flex;gap:8px;}
    .oc-tab{padding:8px 16px;border-radius:10px 10px 0 0;border:1px solid var(--border-subtle);border-bottom:none;background:var(--bg-surface-2);color:var(--text-muted);cursor:pointer;font-weight:600;}
    .oc-tab.active{background:var(--bg-surface-1);color:var(--text-primary);}
    .oc-pill{display:inline-block;min-width:18px;padding:0 6px;border-radius:999px;background:var(--status-danger);color:#fff;font-size:0.72rem;margin-left:4px;}
    .oc-grid{display:grid;grid-template-columns:1.7fr 1fr;gap:16px;align-items:start;}
    @media (max-width:1100px){.oc-grid{grid-template-columns:1fr;}}
    .oc-main{display:flex;flex-direction:column;gap:10px;min-width:0;}
    .oc-toolbar{padding:10px 12px;background:var(--bg-surface-1);border:1px solid var(--border-subtle);border-radius:12px;}
    .oc-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
    .oc-search,.oc-sel{padding:6px 8px;border-radius:8px;background:var(--bg-surface-2);color:var(--text-primary);border:1px solid var(--border-subtle);}
    .oc-search{flex:1;min-width:140px;}
    .oc-check{font-size:0.78rem;color:var(--text-muted);display:flex;align-items:center;gap:6px;}
    .oc-hint{font-size:0.72rem;color:var(--text-muted);}
    .oc-seg{display:inline-flex;border:1px solid var(--border-subtle);border-radius:8px;overflow:hidden;}
    .oc-seg-btn{padding:6px 12px;background:var(--bg-surface-2);color:var(--text-muted);border:none;cursor:pointer;font-size:0.8rem;font-weight:600;}
    .oc-seg-btn.active{background:var(--brand-primary,#3b82f6);color:#fff;}
    .oc-isolate-pill{padding:6px 10px;border-radius:999px;background:var(--status-warning);color:#111;border:none;cursor:pointer;font-size:0.78rem;font-weight:600;}
    .oc-panel{display:flex;flex-direction:column;gap:10px;}
    .oc-empty{padding:28px;text-align:center;color:var(--text-muted);background:var(--bg-surface-1);border:1px dashed var(--border-subtle);border-radius:12px;}
    .oc-issue-list{display:flex;flex-direction:column;gap:10px;}
    .oc-issue{background:var(--bg-surface-1);border:1px solid var(--border-subtle);border-left:4px solid var(--text-muted);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;}
    .oc-issue.sev-ERROR{border-left-color:var(--status-danger);}
    .oc-issue.sev-WARNING{border-left-color:var(--status-warning);}
    .oc-issue.acked{opacity:0.55;}
    .oc-issue-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
    .oc-issue-title{font-weight:700;font-size:0.98rem;color:var(--text-primary);}
    .oc-count{background:var(--bg-surface-2);border-radius:999px;padding:1px 8px;font-size:0.72rem;color:var(--text-muted);}
    .oc-time{margin-left:auto;font-size:0.72rem;color:var(--text-muted);}
    .oc-acktag{font-size:0.68rem;color:var(--text-muted);border:1px solid var(--border-subtle);border-radius:6px;padding:1px 6px;}
    .oc-sev{font-size:0.66rem;font-weight:800;letter-spacing:.03em;border-radius:6px;padding:2px 7px;border:1px solid var(--border-subtle);}
    .oc-sev-ERROR{background:rgba(239,68,68,.15);color:#fca5a5;border-color:rgba(239,68,68,.4);}
    .oc-sev-WARNING{background:rgba(245,158,11,.15);color:#fcd34d;border-color:rgba(245,158,11,.4);}
    .oc-sev-INFO{background:rgba(59,130,246,.12);color:#93c5fd;border-color:rgba(59,130,246,.35);}
    .oc-issue-sub{font-size:0.74rem;color:var(--text-muted);display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
    .oc-issue-sub code{background:var(--bg-surface-2);padding:1px 6px;border-radius:6px;}
    .oc-dot{opacity:.5;}
    .oc-issue-msg{font-size:0.82rem;color:var(--text-primary);}
    .oc-issue-act{font-size:0.78rem;color:var(--text-muted);}
    .oc-issue-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;}
    .oc-mini{padding:5px 10px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-surface-2);color:var(--text-primary);cursor:pointer;font-size:0.76rem;}
    .oc-mini:hover{border-color:var(--brand-primary,#3b82f6);}
    .oc-stream{display:flex;flex-direction:column;gap:4px;}
    .oc-sgroup{border-radius:8px;overflow:hidden;border:1px solid var(--border-subtle);}
    .oc-sgroup.sev-ERROR{border-left:3px solid var(--status-danger);}
    .oc-sgroup.sev-WARNING{border-left:3px solid var(--status-warning);}
    .oc-sgroup.sev-INFO{border-left:3px solid var(--brand-primary,#3b82f6);}
    .oc-srow{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;background:var(--bg-surface-1);font-size:0.8rem;}
    .oc-srow:hover{background:var(--bg-surface-2);}
    .oc-stime,.oc-sdev{font-size:0.72rem;color:var(--text-muted);flex:0 0 auto;}
    .oc-sdev{min-width:70px;}
    .oc-sevtype{flex:0 0 auto;}
    .oc-srow code{font-size:0.76rem;}
    .oc-smsg{flex:1;min-width:0;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .oc-caret{margin-left:auto;color:var(--text-muted);}
    .oc-sdetail{padding:8px 12px;background:var(--bg-surface-2);border-top:1px solid var(--border-subtle);}
    .oc-occ-list{display:flex;flex-direction:column;gap:2px;margin-bottom:6px;}
    .oc-occ{display:grid;grid-template-columns:90px 90px 1fr;gap:8px;font-size:0.72rem;color:var(--text-muted);}
    .oc-json{margin:0;font-family:monospace;font-size:0.72rem;white-space:pre-wrap;overflow-x:auto;background:var(--bg-surface-1);padding:8px;border-radius:8px;max-height:260px;overflow-y:auto;color:var(--text-primary);}
    .oc-side{display:flex;flex-direction:column;gap:16px;}
    .oc-card{padding:16px 18px;}
    .oc-card-h{font-size:1.02rem;margin:0 0 10px;}
    .oc-muted{color:var(--text-muted);font-size:0.85rem;}
    .oc-hoverall{font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;}
    .oc-hrow{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border-subtle);font-size:0.84rem;}
    .oc-hval{margin-left:auto;color:var(--text-muted);font-size:0.78rem;}
    .oc-dotc{width:9px;height:9px;border-radius:50%;display:inline-block;flex:0 0 auto;}
    .oc-dotc.g{background:var(--status-success);} .oc-dotc.r{background:var(--status-danger);} .oc-dotc.y{background:var(--status-warning);}
    .oc-loose{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--border-subtle);font-size:0.82rem;}
    .oc-loose-v{color:var(--text-muted);max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .oc-bot{padding:6px 0;border-bottom:1px solid var(--border-subtle);font-size:0.8rem;}
    .oc-bot-cid{color:var(--text-muted);font-size:0.72rem;}
    .oc-bot-stages{color:var(--text-muted);font-size:0.72rem;}
    .oc-drawer{position:fixed;top:0;right:0;height:100vh;width:440px;max-width:92vw;background:var(--bg-surface-1);border-left:1px solid var(--border-subtle);box-shadow:-8px 0 24px rgba(0,0,0,.35);transform:translateX(100%);transition:transform .2s ease;z-index:9999;display:flex;flex-direction:column;}
    .oc-drawer.open{transform:translateX(0);}
    .oc-drawer-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border-subtle);}
    .oc-drawer-head h3{margin:0;font-size:1rem;flex:1;}
    .oc-drawer-x{margin-left:auto;}
    .oc-drawer-body{padding:14px 16px;overflow-y:auto;display:flex;flex-direction:column;gap:14px;}
    .oc-dblock{font-size:0.82rem;}
    .oc-dlabel{font-size:0.68rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);margin-bottom:3px;font-weight:700;}
    .oc-daction{color:var(--text-primary);}
    .oc-docc-list{display:flex;flex-direction:column;gap:4px;max-height:220px;overflow-y:auto;}
    .oc-docc{display:grid;grid-template-columns:78px 74px 70px 1fr;gap:6px;font-size:0.72rem;color:var(--text-muted);align-items:baseline;}
    .oc-docc-m{color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;}
    @media (max-width:600px){.oc-drawer{width:100vw;}}`;
  }

  // ---- Teardown ----------------------------------------------------------

  destroy() {
    try {
      if (this._rtClient && this._channel && typeof this._rtClient.removeChannel === 'function') {
        this._rtClient.removeChannel(this._channel);
      } else if (this._channel && typeof this._channel.unsubscribe === 'function') {
        this._channel.unsubscribe();
      }
    } catch { /* ignore */ }
    if (this._rootEl) {
      if (this._onClick) this._rootEl.removeEventListener('click', this._onClick);
      if (this._onChange) this._rootEl.removeEventListener('change', this._onChange);
      if (this._onInput) this._rootEl.removeEventListener('input', this._onInput);
    }
    this._channel = null;
    this._rtClient = null;
    if (this._pollTimer && typeof clearInterval === 'function') clearInterval(this._pollTimer);
    if (this._healthTimer && typeof clearInterval === 'function') clearInterval(this._healthTimer);
    this._pollTimer = null;
    this._healthTimer = null;
  }
}

export default ObservabilityControlCenterView;
