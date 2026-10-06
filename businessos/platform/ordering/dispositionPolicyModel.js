/**
 * BusinessOS Platform - Disposition Policy Model (Station Cancellation Workflow)
 * Governs what happens to a PREPARED (READY-stage) cancelled item: HOLD FOR REUSE or DISCARD.
 * Policy resolution is MANDATORY on every prepared cancellation approval - the engine never
 * assumes HOLD as a blanket default (a prepared cocktail must not behave like a curry).
 *
 * Mirrors taxConfigurationModel.getBarBillingConfig style: code-level defaults merged with
 * tenant-saved overrides from the 'disposition_policies' collection (offline + Supabase).
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

// Code-level seeded defaults. Editable via admin CRUD (Phase C), never hardcoded in UI.
const CODE_DEFAULT_POLICIES = [
  { id: 'dp_kitchen_default', station: 'KITCHEN', categoryCode: null, itemCode: null, allowHold: true, holdMinutes: 45, defaultDisposition: 'HOLD', decideBy: 'STATION', isDefault: true },
  { id: 'dp_bar_default', station: 'BAR', categoryCode: null, itemCode: null, allowHold: true, holdMinutes: 15, defaultDisposition: 'HOLD', decideBy: 'STATION', isDefault: true },
  { id: 'dp_bar_cocktails', station: 'BAR', categoryCode: 'COCKTAIL', itemCode: null, allowHold: false, holdMinutes: 0, defaultDisposition: 'DISCARD', decideBy: 'STATION', isDefault: true }
];

class DispositionPolicyModel {
  constructor() {
    this._cache = new Map();
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('disposition_policies')) {
      offlineStore.setCollection('disposition_policies', []);
    }
  }

  _getDataGateway() {
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) {
      return window.__APP__.platform.dataGateway || null;
    }
    return null;
  }

  _getTenantId(providedTenantId = null) {
    if (providedTenantId) return providedTenantId;
    if (typeof sessionStorage !== 'undefined') {
      try {
        const session = JSON.parse(sessionStorage.getItem('ros_session') || '{}');
        return session.tenantId || 'tenant_h0qc7wf';
      } catch (_) {}
    }
    return 'tenant_h0qc7wf';
  }

  _invalidateCache(tenantId = null) {
    if (tenantId) this._cache.delete(tenantId);
    else this._cache.clear();
  }

  /** Tenant-saved policy rows (offline cache merged with DataGateway cache). */
  getSavedPolicies(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const dg = this._getDataGateway();
    const dgList = dg && typeof dg.getCachedCollection === 'function'
      ? (dg.getCachedCollection('disposition_policies', targetTenantId) || [])
      : [];
    const offList = offlineStore.getCollection('disposition_policies', targetTenantId) || [];

    const byId = new Map();
    [...offList, ...dgList].forEach(p => {
      if (p && p.id && !p.isDefault) byId.set(p.id, p);
    });
    return Array.from(byId.values()).filter(p =>
      !p.status || p.status === 'ACTIVE');
  }

  /**
   * Resolve the disposition policy for a prepared cancellation.
   * Specificity: itemCode override > categoryCode override > station default > code default.
   * @returns {{ outcome: 'HOLD_OFFERED'|'DISCARD_ONLY', allowHold:boolean, holdMinutes:number,
   *            defaultDisposition:'HOLD'|'DISCARD', decideBy:'STATION'|'MANAGER', policyId:string, source:string }}
   */
  resolvePolicy(station = 'KITCHEN', itemCode = null, categoryCode = null, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const norm = (s) => String(s || '').toUpperCase().trim();
    const st = norm(station) === 'BAR' ? 'BAR' : 'KITCHEN';
    const code = norm(itemCode);
    const cat = norm(categoryCode);

    const saved = this.getSavedPolicies(targetTenantId);
    const pool = [...saved, ...CODE_DEFAULT_POLICIES.filter(d => d.station === st)];

    // Most specific match wins: item-level (score 4) > category (2) > station default (0).
    let best = null;
    let bestScore = -1;
    for (const p of pool) {
      if (norm(p.station) !== st && p.station !== 'DEFAULT') continue;
      const pItem = norm(p.itemCode);
      const pCat = norm(p.categoryCode);
      if (pItem && code && pItem === code) {
        if (4 > bestScore) { best = p; bestScore = 4; }
      } else if (!pItem && pCat && cat && (cat === pCat || cat.includes(pCat) || pCat.includes(cat))) {
        if (2 > bestScore) { best = p; bestScore = 2; }
      } else if (!pItem && !pCat) {
        if (0 > bestScore) { best = p; bestScore = 0; }
      }
    }

    const resolved = best || CODE_DEFAULT_POLICIES.find(d => d.station === st) || CODE_DEFAULT_POLICIES[0];
    const allowHold = resolved.allowHold !== false;
    return {
      outcome: allowHold ? 'HOLD_OFFERED' : 'DISCARD_ONLY',
      allowHold,
      holdMinutes: allowHold ? (parseInt(resolved.holdMinutes) || 0) : 0,
      defaultDisposition: allowHold ? (resolved.defaultDisposition === 'DISCARD' ? 'DISCARD' : 'HOLD') : 'DISCARD',
      decideBy: allowHold && resolved.decideBy === 'MANAGER' ? 'MANAGER' : 'STATION',
      policyId: resolved.id,
      source: resolved.isDefault ? 'CODE_DEFAULT' : 'TENANT_POLICY'
    };
  }

  /** Create/update a tenant policy override (Phase C admin CRUD entry point). */
  savePolicy(policy, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const now = new Date().toISOString();
    const record = {
      ...policy,
      id: policy.id || `dp_${Math.random().toString(36).substring(2, 9)}`,
      tenantId: targetTenantId,
      tenant_id: targetTenantId,
      isDefault: false,
      status: policy.status || 'ACTIVE',
      updatedAt: now,
      createdAt: policy.createdAt || now
    };

    const list = offlineStore.getCollection('disposition_policies', targetTenantId) || [];
    const idx = list.findIndex(p => p.id === record.id);
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    offlineStore.setCollection('disposition_policies', list);

    const dg = this._getDataGateway();
    if (dg) {
      dg.create('disposition_policies', record).catch(e =>
        console.warn('[dispositionPolicyModel] Cloud policy sync error:', e.message));
    }

    this._invalidateCache(targetTenantId);
    platformEventBus.publish('disposition_policy:saved', record);
    return record;
  }

  /** Soft-delete a tenant policy override (reverts that scope to code defaults). */
  deletePolicy(policyId, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const list = offlineStore.getCollection('disposition_policies', targetTenantId) || [];
    const idx = list.findIndex(p => p.id === policyId);
    if (idx < 0) return false;
    list[idx] = { ...list[idx], status: 'INACTIVE', updatedAt: new Date().toISOString() };
    offlineStore.setCollection('disposition_policies', list);

    const dg = this._getDataGateway();
    if (dg) {
      dg.update('disposition_policies', policyId, { status: 'INACTIVE' }).catch(() => {});
    }
    this._invalidateCache(targetTenantId);
    platformEventBus.publish('disposition_policy:deleted', { policyId, tenantId: targetTenantId });
    return true;
  }
}

export const dispositionPolicyModel = new DispositionPolicyModel();
