/**
 * BusinessOS Platform - Cloud-backed System Configuration Store
 *
 * Replaces the previous per-device `offlineStore('configuration')` persistence
 * with the shared `system_config` collection (one row per section, see
 * supabase/production_hardening.sql). The offline 'configuration' object is kept
 * as a synchronous local mirror so renders/lookups (e.g. idle timeouts) never
 * block, but every save also upserts to the cloud so the whole tenant - across
 * devices - sees the same business/hardware/printing/tax/system settings.
 */
import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus, PlatformEventTypes } from '../events/platformEvents.js';

const DEFAULT_TENANT = 'tenant_h0qc7wf';

function _gateway() {
  if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) return window.__APP__.platform.dataGateway;
  return null;
}

function _tenantId() {
  if (typeof sessionStorage !== 'undefined') {
    try { return (JSON.parse(sessionStorage.getItem('ros_session') || '{}').tenantId) || DEFAULT_TENANT; } catch { /* ignore */ }
  }
  return DEFAULT_TENANT;
}

/** Pull the section values out of a (possibly adapter-normalized) row. */
function _rowValues(row) {
  if (!row) return null;
  if (row.values) return row.values;
  if (row.data && row.data.values) return row.data.values;
  return null;
}

/**
 * Combined configuration object: { business, system, hardware, printing,
 * payments, ... }. Cloud `system_config` rows win; the local mirror fills any
 * section not yet synced (and keeps the UI instant before hydration completes).
 */
export function getConfig() {
  const combined = { ...(offlineStore.getCollection('configuration') || {}) };
  const gw = _gateway();
  const rows = (gw && gw.getCachedCollection('system_config')) || offlineStore.getCollection('system_config') || [];
  if (Array.isArray(rows)) {
    rows.forEach((r) => {
      const section = r.section || (r.data && r.data.section);
      const values = _rowValues(r);
      if (section && values) combined[section] = { ...(combined[section] || {}), ...values };
    });
  }
  return combined;
}

/** Read one section synchronously from the merged view. */
export function getSection(section) {
  return getConfig()[section] || {};
}

/**
 * Persist one section: update the local mirror, upsert the cloud row, and emit
 * CONFIG_UPDATED so live views (idle timers, tax, printing) react immediately.
 */
export async function saveSection(section, values) {
  const config = offlineStore.getCollection('configuration') || {};
  config[section] = { ...(config[section] || {}), ...values };
  offlineStore.setCollection('configuration', config);

  const gw = _gateway();
  if (gw) {
    const tenantId = _tenantId();
    const id = `cfg_${tenantId}_${section}`;
    const record = { id, tenant_id: tenantId, tenantId, section, values, data: { values } };
    const existing = (gw.getCachedCollection('system_config') || []).find(
      (r) => (r.id === id) || (r.section === section)
    );
    try {
      if (existing && existing.id) await gw.update('system_config', existing.id, record);
      else await gw.create('system_config', record);
    } catch (e) {
      // DataGateway queues an offline job on failure; keep the local mirror.
      console.warn(`[systemConfig] cloud save "${section}" queued offline:`, e && e.message);
    }
  }

  platformEventBus.publish(PlatformEventTypes.CONFIG_UPDATED, { section, config: config[section] });
  return config[section];
}

export const systemConfigStore = { getConfig, getSection, saveSection };
