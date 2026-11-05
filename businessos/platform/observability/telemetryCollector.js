/**
 * BusinessOS Platform - Telemetry Collector (Observability Control Center).
 *
 * The single capture seam: taps `eventBus.subscribe('*')` (the same wildcard the
 * timeline ledger / audit middleware use) plus global browser error handlers, and
 * turns each signal into a redacted telemetry record handed to the outbox store.
 *
 * Non-breaking guarantees:
 *  - init() is wrapped by callers in try/catch, and every internal path swallows
 *    its own errors: observability can never crash or block a user flow.
 *  - Respects the capture tier from system_config('observability'); `off` captures
 *    nothing and installs no listeners.
 *  - Node/test safe: window/localStorage/health access is all guarded, and the
 *    store, event bus, tier and health provider are injectable via init(deps).
 */
import { telemetryStore } from './telemetryStore.js';
import { CaptureTiers, shouldCapture, toTelemetryRecord, TelemetryLevel, TelemetryCategory } from './captureTiers.js';

const HEALTH_SNAPSHOT_INTERVAL_MS = 30000;
const DEFAULT_TENANT = 'tenant_h0qc7wf';

function _safeDeviceId(deps) {
  if (deps && deps.deviceId) return deps.deviceId;
  try {
    // entityMetadata.getDeviceId reads window/localStorage; guard for Node.
    // Imported lazily so the module still parses where it is unavailable.
    const holder = (typeof window !== 'undefined') ? window : null;
    if (holder && holder.__APP__ && holder.__APP__.platform && holder.__APP__.platform.getDeviceId) {
      return holder.__APP__.platform.getDeviceId();
    }
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem('ros_device_id');
      if (cached) return cached;
    }
  } catch { /* ignore */ }
  return 'device_unknown';
}

function _readSession() {
  if (typeof sessionStorage === 'undefined') return {};
  try { return JSON.parse(sessionStorage.getItem('ros_session') || '{}'); } catch { return {}; }
}

export class TelemetryCollector {
  constructor() {
    this._initialized = false;
    this.store = telemetryStore;
    this.tier = CaptureTiers.OFF;
    this.deviceId = null;
    this.healthProvider = null;
    this._unsubEventBus = null;
    this._healthTimer = null;
    this._errorHandlersInstalled = false;
  }

  /** Resolve the effective tier: explicit dep > tenant tier > device override > lean. */
  _resolveTier(deps) {
    if (deps && deps.tier) return deps.tier;
    let section = {};
    try {
      if (deps && typeof deps.getObservabilitySection === 'function') {
        section = deps.getObservabilitySection() || {};
      } else if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.systemConfigStore) {
        section = window.__APP__.platform.systemConfigStore.getSection('observability') || {};
      }
    } catch { section = {}; }

    const tenantTier = String(section.tier || CaptureTiers.LEAN).toLowerCase();
    const overrides = section.deviceOverrides || {};
    const dev = this.deviceId;
    if (dev && overrides[dev]) return String(overrides[dev]).toLowerCase();
    return Object.values(CaptureTiers).includes(tenantTier) ? tenantTier : CaptureTiers.LEAN;
  }

  init(eventBus, deps = {}) {
    if (this._initialized) return this;
    this.store = deps.store || telemetryStore;
    this.deviceId = _safeDeviceId(deps);
    this.tier = this._resolveTier(deps);
    this.healthProvider = deps.healthProvider || null;

    if (this.tier === CaptureTiers.OFF) {
      // Nothing to do; leave listeners unwired.
      this._initialized = true;
      return this;
    }

    if (eventBus && typeof eventBus.subscribe === 'function') {
      this._unsubEventBus = eventBus.subscribe('*', (env) => this._onEvent(env));
    }

    this._installGlobalErrorHandlers();
    this._installConnectivityHandlers();
    this.store.start();

    if (this.healthProvider && typeof setInterval === 'function') {
      this._healthTimer = setInterval(() => this.captureHealthSnapshot(), HEALTH_SNAPSHOT_INTERVAL_MS);
    }

    this._initialized = true;
    return this;
  }

  _onEvent(env) {
    try {
      const eventType = env && env.type ? env.type : (typeof env === 'string' ? env : null);
      if (!eventType) return;
      const payload = (env && env.payload) || env || {};
      if (!shouldCapture(this.tier, eventType, payload)) return;
      const session = _readSession();
      const rec = toTelemetryRecord({
        eventType,
        payload,
        timestamp: (env && env.timestamp) || new Date().toISOString(),
        tier: this.tier,
        tenantId: session.tenantId || DEFAULT_TENANT,
        deviceId: this.deviceId,
        workspace: session.workspace || payload.workspace || null,
        actor: session.employeeName || payload.employeeName || 'SYSTEM'
      });
      this.store.enqueue(rec);
      this.store.scheduleFlush();
    } catch { /* capture must never throw into the bus */ }
  }

  /**
   * Direct error entry point used by errorReporter.reportNonFatal(). Bypasses
   * shouldCapture (errors are always kept when tier != off) and never throws.
   */
  recordError(error, context = {}) {
    try {
      if (this.tier === CaptureTiers.OFF) return;
      const err = (error instanceof Error) ? error : new Error(String((error && error.message) || error));
      const session = _readSession();
      const rec = toTelemetryRecord({
        eventType: 'observability:error',
        payload: {
          severity: TelemetryLevel.ERROR,
          message: err.message,
          scope: context.scope || null,
          fingerprint: context.fingerprint || (context.scope || 'general'),
          stack: err.stack ? String(err.stack).split('\n').slice(0, 6).join('\n') : null,
          context
        },
        timestamp: new Date().toISOString(),
        tier: this.tier,
        tenantId: session.tenantId || DEFAULT_TENANT,
        deviceId: this.deviceId,
        workspace: session.workspace || null,
        actor: session.employeeName || 'SYSTEM'
      });
      rec.category = TelemetryCategory.ERROR;
      rec.level = TelemetryLevel.ERROR;
      this.store.enqueue(rec);
      this.store.scheduleFlush();
    } catch { /* never throw */ }
  }

  /** Periodic health snapshot (lean/full) so the Observatory has live status. */
  captureHealthSnapshot() {
    try {
      if (this.tier === CaptureTiers.OFF || !this.healthProvider) return;
      const health = this.healthProvider();
      if (!health) return;
      const session = _readSession();
      const level = (health.status && health.status !== 'HEALTHY') ? TelemetryLevel.WARN : TelemetryLevel.INFO;
      const rec = toTelemetryRecord({
        eventType: 'health:snapshot',
        payload: { severity: level, message: `Health ${health.status}`, components: health.components, status: health.status },
        timestamp: health.timestamp || new Date().toISOString(),
        tier: this.tier,
        tenantId: session.tenantId || DEFAULT_TENANT,
        deviceId: this.deviceId,
        workspace: session.workspace || null,
        actor: 'SYSTEM'
      });
      rec.category = TelemetryCategory.PERF;
      this.store.enqueue(rec);
      this.store.scheduleFlush();
    } catch { /* never throw */ }
  }

  _installGlobalErrorHandlers() {
    if (this._errorHandlersInstalled || typeof window === 'undefined') return;
    try {
      window.addEventListener('error', (e) => {
        this.recordError(e.error || new Error(e.message || 'window.onerror'), { scope: 'window.onerror' });
      });
      window.addEventListener('unhandledrejection', (e) => {
        const reason = e && e.reason;
        this.recordError(reason instanceof Error ? reason : new Error(String((reason && reason.message) || reason || 'unhandled rejection')), { scope: 'unhandledrejection' });
      });
      this._errorHandlersInstalled = true;
    } catch { /* ignore */ }
  }

  _installConnectivityHandlers() {
    if (typeof window === 'undefined') return;
    try {
      window.addEventListener('online', () => this.store.setOnline(true));
      window.addEventListener('offline', () => this.store.setOnline(false));
    } catch { /* ignore */ }
  }

  setTier(tier) {
    this.tier = String(tier || CaptureTiers.LEAN).toLowerCase();
  }

  reset() {
    if (this._unsubEventBus) { try { this._unsubEventBus(); } catch { /* ignore */ } }
    if (this._healthTimer && typeof clearInterval === 'function') clearInterval(this._healthTimer);
    this._unsubEventBus = null;
    this._healthTimer = null;
    this._initialized = false;
  }
}

export const telemetryCollector = new TelemetryCollector();
export default telemetryCollector;
