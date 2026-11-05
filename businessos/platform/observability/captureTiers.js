/**
 * BusinessOS Platform - Telemetry Capture Tiers (Stage: Observability Control Center).
 *
 * Pure, side-effect-free classification + gating logic for the observability
 * collector. Kept separate from the store/collector so it can be unit-tested
 * headlessly (no window/localStorage) and reused by both the client collector
 * and the tests. NON-BREAKING: nothing here touches the write path.
 *
 * Tiers (persisted in system_config section `observability`):
 *   off   - capture nothing.
 *   lean  - default for deployed clients: errors/warnings + key lifecycle
 *           events + sync/perf signals; suppresses high-frequency realtime noise.
 *   full  - every event on the bus (still redacted); temporary per-device debug.
 */

export const CaptureTiers = Object.freeze({
  OFF: 'off',
  LEAN: 'lean',
  FULL: 'full'
});

export const TelemetryLevel = Object.freeze({
  INFO: 'INFO',
  WARN: 'WARNING',
  ERROR: 'ERROR'
});

export const TelemetryCategory = Object.freeze({
  LIFECYCLE: 'lifecycle',
  BILLING: 'billing',
  STOCK: 'stock',
  SYNC: 'sync',
  ERROR: 'error',
  WARNING: 'warning',
  PERF: 'perf',
  OTHER: 'other'
});

// Lifecycle / business-signal events captured even in LEAN tier. Substring
// matched against the event type so variants (bill:revision:created, etc.)
// are included.
const LEAN_LIFECYCLE_TYPES = [
  'auth:session_started',
  'platform:employee:authenticated',
  'platform:employee:logged_out',
  'session:created',
  'session:closed',
  'order:confirmed',
  'kot:dispatched',
  'ticket:status_changed',
  'bill:finalized',
  'bill:recalled',
  'invoice:issued',
  'payment:recorded',
  'stock:',
  'transfer',
  'adjustment',
  'grn',
  'goods_receipt',
  'purchase_order',
  'cancellation',
  'shift_register',
  'production_batch'
];

// Sync/perf signals always carry diagnostic value even in LEAN.
const LEAN_SIGNAL_TYPES = [
  'sync:',
  'data:changed',
  'connectivity:',
  'health:'
];

// High-frequency background noise suppressed in LEAN tier.
const LEAN_IGNORED_TYPES = [
  'table:projection:updated',
  'session:projection:updated',
  'session:milestone:changed',
  'notification:emitted'
];

// Keys whose values must NEVER leave the device. Matched case-insensitively
// against any nested object key before serialization.
const REDACT_KEYS = [
  'pin', 'pinhash', 'pin_hash', 'password', 'passcode', 'accessToken', 'access_token',
  'refreshtoken', 'refresh_token', 'jwt', 'token', 'authorization', 'apikey', 'api_key',
  'cvv', 'cv c', 'cardnumber', 'card_number', 'pan', 'secret', 'service_role', 'secretkey',
  'otp', 'otp_hash', 'sessiontoken', 'session_token'
];

const REDACT_SET = new Set(REDACT_KEYS.map((k) => k.toLowerCase()));

/** True if the payload/record should be treated as background realtime sync noise. */
export function isRealtimeSyncNoise(payload) {
  return !!(payload && payload.source === 'realtime_sync');
}

/**
 * Classify an event type + payload into { category, level }. Never throws.
 */
export function classifyEventType(eventType, payload = {}) {
  const type = String(eventType || '').toLowerCase();
  const sev = String((payload && payload.severity) || '').toUpperCase();

  if (sev === 'ERROR' || type.includes('error') || type.includes('failed') || type.includes('failure')) {
    return { category: TelemetryCategory.ERROR, level: TelemetryLevel.ERROR };
  }
  if (sev === 'WARN' || sev === 'WARNING' || type.includes('warn') || type.includes('breach') || type.includes('alert')) {
    return { category: TelemetryCategory.WARNING, level: TelemetryLevel.WARN };
  }
  if (type.startsWith('sync:') || type.startsWith('connectivity:') || type === 'data:changed') {
    return { category: TelemetryCategory.SYNC, level: TelemetryLevel.INFO };
  }
  if (type.startsWith('stock:') || type.includes('transfer') || type.includes('adjustment') ||
      type.includes('grn') || type.includes('goods_receipt') || type.includes('purchase_order')) {
    return { category: TelemetryCategory.STOCK, level: TelemetryLevel.INFO };
  }
  if (type.includes('bill') || type.includes('invoice') || type.includes('payment') ||
      type.includes('order') || type.includes('kot') || type.includes('ticket')) {
    return { category: TelemetryCategory.BILLING, level: TelemetryLevel.INFO };
  }
  if (type.startsWith('auth:') || type.includes('employee:') || type.includes('session') ||
      type.includes('shift_register') || type.includes('production_batch') || type.includes('cancellation')) {
    return { category: TelemetryCategory.LIFECYCLE, level: TelemetryLevel.INFO };
  }
  if (type.includes('perf') || type.includes('latency') || type.includes('duration')) {
    return { category: TelemetryCategory.PERF, level: TelemetryLevel.INFO };
  }
  return { category: TelemetryCategory.OTHER, level: TelemetryLevel.INFO };
}

function matchesAny(type, needles) {
  return needles.some((n) => type.includes(n.toLowerCase()));
}

/**
 * Decide whether a given event should be captured for the supplied tier.
 * ERROR/WARNING are always kept (any tier except OFF).
 */
export function shouldCapture(tier, eventType, payload = {}) {
  if (tier === CaptureTiers.OFF) return false;
  const { category, level } = classifyEventType(eventType, payload);

  // Errors and warnings survive every non-off tier and are never treated as noise.
  if (level === TelemetryLevel.ERROR || level === TelemetryLevel.WARN) return true;

  if (tier === CaptureTiers.FULL) {
    // Deep debug: capture everything, even realtime_sync background traffic.
    return true;
  }

  // LEAN tier.
  if (isRealtimeSyncNoise(payload)) return false;
  const type = String(eventType || '').toLowerCase();
  if (matchesAny(type, LEAN_IGNORED_TYPES)) return false;
  if (matchesAny(type, LEAN_SIGNAL_TYPES)) return true;
  if (category === TelemetryCategory.STOCK || category === TelemetryCategory.BILLING ||
      category === TelemetryCategory.LIFECYCLE || category === TelemetryCategory.SYNC) {
    return true;
  }
  return matchesAny(type, LEAN_LIFECYCLE_TYPES);
}

/**
 * Deep-clone `value` for telemetry, stripping any secret keys and bounding
 * depth/size so a huge or circular payload can never bloat or crash a record.
 */
export function redact(value, maxDepth = 4) {
  const seen = new WeakSet();
  const walk = (node, depth) => {
    if (node === null || node === undefined) return node;
    const t = typeof node;
    if (t === 'number' || t === 'boolean') return node;
    if (t === 'string') return node.length > 2000 ? node.slice(0, 2000) + '...[truncated]' : node;
    if (t === 'function') return '[function]';
    if (node instanceof Error) return { name: node.name, message: node.message };
    if (seen.has(node)) return '[circular]';
    if (depth > maxDepth) return '[max-depth]';
    seen.add(node);

    if (Array.isArray(node)) {
      const out = [];
      for (let i = 0; i < node.length && i < 100; i++) out.push(walk(node[i], depth + 1));
      if (node.length > 100) out.push(`...[${node.length - 100} more]`);
      return out;
    }
    if (t === 'object') {
      const out = {};
      for (const key of Object.keys(node)) {
        if (REDACT_SET.has(String(key).toLowerCase())) { out[key] = '[redacted]'; continue; }
        out[key] = walk(node[key], depth + 1);
      }
      return out;
    }
    return String(node);
  };
  return walk(value, 0);
}

/**
 * Normalize a platform event envelope into a flat telemetry record. This is the
 * single shaping point shared by live capture and the persistence layer, so the
 * stored columns and the client view agree.
 */
export function toTelemetryRecord({ eventType, payload, timestamp, tier, tenantId, deviceId, workspace, actor }) {
  const p = payload || {};
  const { category, level } = classifyEventType(eventType, p);
  return {
    id: 'tel_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    tenant_id: tenantId || p.tenantId || p.tenant_id || null,
    device_id: deviceId || p.deviceId || p.device_id || null,
    workspace: workspace || p.workspace || null,
    actor: actor || p.actorName || p.employeeName || p.actorId || p.employeeId || 'SYSTEM',
    category,
    level,
    event_type: eventType,
    correlation_id: p.correlationId || p.correlation_id || null,
    message: p.message || p.description || p.summary || String(eventType || ''),
    data: redact(p),
    created_at: timestamp || new Date().toISOString(),
    tier
  };
}

export default { CaptureTiers, TelemetryLevel, TelemetryCategory, shouldCapture, classifyEventType, redact, toTelemetryRecord };
