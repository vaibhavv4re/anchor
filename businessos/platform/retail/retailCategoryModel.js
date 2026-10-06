/**
 * BusinessOS Platform - Retail (Wine Store) Category Taxonomy (Retail Phase 1)
 *
 * A configurable, two-level merchandising taxonomy for the Retail catalogue:
 * broad top-level categories (Wine / Whisky / Beer / Cider / Non-Alcoholic &
 * Mixers) each of which may carry sub-categories (e.g. Wine -> Red, White,
 * Rosé...). A retail_products row is tagged with a `categoryCode`; this model
 * owns the category rows themselves.
 *
 * It is deliberately SEPARATE from the fiscal `tax_category` on a product (which
 * drives VAT) and from the shared Inventory Core: a category is only a browsing
 * + stock-rollup lens. Physical stock still lives solely in `stock_balances` at
 * LOC-RETAIL and arrives only through Inventory-Manager warehouse transfers.
 *
 * Persistence mirrors retailProductModel: the local synchronous read path is
 * `offlineStore`; the durable cloud write goes through DataGateway.create/update/
 * delete against the `retail_categories` table. Because DataGateway already
 * mirrors into offlineStore, we must NOT also appendItem here (double-write).
 */

import { offlineStore } from '../offline_store/offlineStore.js';

/** Default wine-shop taxonomy (parentCode null = top-level). */
export const DEFAULT_RETAIL_CATEGORIES = [
  { code: 'WINE', name: 'Wine', parentCode: null, sortOrder: 10 },
  { code: 'WHISKY', name: 'Whisky', parentCode: null, sortOrder: 20 },
  { code: 'BEER', name: 'Beer', parentCode: null, sortOrder: 30 },
  { code: 'CIDER', name: 'Cider', parentCode: null, sortOrder: 40 },
  { code: 'NONALC', name: 'Non-Alcoholic & Mixers', parentCode: null, sortOrder: 50 },

  { code: 'WINE-RED', name: 'Red Wine', parentCode: 'WINE', sortOrder: 11 },
  { code: 'WINE-WHITE', name: 'White Wine', parentCode: 'WINE', sortOrder: 12 },
  { code: 'WINE-ROSE', name: 'Rosé', parentCode: 'WINE', sortOrder: 13 },
  { code: 'WINE-SPARKLING', name: 'Sparkling & Champagne', parentCode: 'WINE', sortOrder: 14 },
  { code: 'WINE-FORTIFIED', name: 'Fortified & Dessert', parentCode: 'WINE', sortOrder: 15 },

  { code: 'WHISKY-ISMA', name: 'Indian Single Malt', parentCode: 'WHISKY', sortOrder: 21 },
  { code: 'WHISKY-SCOTCH', name: 'Scotch', parentCode: 'WHISKY', sortOrder: 22 },
  { code: 'WHISKY-BOURBON', name: 'Bourbon', parentCode: 'WHISKY', sortOrder: 23 },
  { code: 'WHISKY-OTHER', name: 'Other Whisky', parentCode: 'WHISKY', sortOrder: 24 },

  { code: 'BEER-LAGER', name: 'Lager', parentCode: 'BEER', sortOrder: 31 },
  { code: 'BEER-IPA', name: 'IPA & Ale', parentCode: 'BEER', sortOrder: 32 },
  { code: 'BEER-STRONG', name: 'Strong Beer', parentCode: 'BEER', sortOrder: 33 },
  { code: 'BEER-CRAFT', name: 'Craft', parentCode: 'BEER', sortOrder: 34 },

  { code: 'CIDER-DRY', name: 'Dry', parentCode: 'CIDER', sortOrder: 41 },
  { code: 'CIDER-CLASSIC', name: 'Classic', parentCode: 'CIDER', sortOrder: 42 },
  { code: 'CIDER-PREMIUM', name: 'Premium', parentCode: 'CIDER', sortOrder: 43 },

  { code: 'NONALC-SOFT', name: 'Soft Drinks', parentCode: 'NONALC', sortOrder: 51 },
  { code: 'NONALC-JUICE', name: 'Juices', parentCode: 'NONALC', sortOrder: 52 },
  { code: 'NONALC-MIXERS', name: 'Mixers & Soda', parentCode: 'NONALC', sortOrder: 53 },
  { code: 'NONALC-WATER', name: 'Packaged Water', parentCode: 'NONALC', sortOrder: 54 }
];

class RetailCategoryModel {
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

  _matchesTenant(rec, tenantId) {
    return !tenantId || rec.tenantId === tenantId || rec.tenant_id === tenantId;
  }

  _slugCode(name) {
    return String(name || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || ('CAT-' + Math.random().toString(36).substring(2, 6).toUpperCase());
  }

  _normalize(input = {}, tenantId) {
    const now = new Date().toISOString();
    const parent = input.parentCode != null ? input.parentCode : input.parent_code;
    return {
      id: input.id || 'rc-' + Math.random().toString(36).substring(2, 9),
      tenantId,
      tenant_id: tenantId,
      code: input.code || input.categoryCode || input.category_code || this._slugCode(input.name),
      name: input.name || '',
      parentCode: parent || '',
      sortOrder: parseInt(input.sortOrder != null ? input.sortOrder : input.sort_order) || 0,
      status: input.status || 'ACTIVE',
      createdAt: input.createdAt || input.created_at || now,
      updatedAt: now
    };
  }

  /** All categories for a tenant (live cloud `retail_categories`, normalized). */
  getAll(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const dg = this._getDataGateway();
    let list = [];
    if (dg && typeof dg.getCachedCollection === 'function') {
      list = dg.getCachedCollection('retail_categories', targetTenantId) || [];
    }
    if (!list.length) {
      list = offlineStore.getCollection('retail_categories') || [];
    }
    return list
      .map(c => this._normalize(c, targetTenantId))
      .filter(c => this._matchesTenant(c, targetTenantId))
      .sort((a, b) => (a.sortOrder - b.sortOrder) || String(a.name).localeCompare(String(b.name)));
  }

  getByCode(code, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const key = String(code || '').trim().toUpperCase();
    if (!key) return null;
    return this.getAll(targetTenantId).find(c => String(c.code).toUpperCase() === key) || null;
  }

  /** Top-level categories, each with an ordered `children[]` array. */
  getTree(tenantId = null) {
    const all = this.getAll(tenantId);
    const byCode = new Map(all.map(c => [String(c.code).toUpperCase(), { ...c, children: [] }]));
    const roots = [];
    byCode.forEach(node => {
      const parentKey = String(node.parentCode || '').toUpperCase();
      if (parentKey && byCode.has(parentKey)) byCode.get(parentKey).children.push(node);
      else roots.push(node);
    });
    const sortRec = (arr) => {
      arr.sort((a, b) => (a.sortOrder - b.sortOrder) || String(a.name).localeCompare(String(b.name)));
      arr.forEach(n => sortRec(n.children));
    };
    sortRec(roots);
    return roots;
  }

  /** Flat "select" list: top-levels then their indented sub-categories. */
  listWithOptions(tenantId = null) {
    const out = [];
    this.getTree(tenantId).forEach(root => {
      out.push({ code: root.code, name: root.name, level: 0 });
      (root.children || []).forEach(ch => out.push({ code: ch.code, name: ch.name, level: 1 }));
    });
    return out;
  }

  async create(category = {}, tenantId = null) {
    const targetTenantId = this._getTenantId(category.tenantId || tenantId);
    const record = this._normalize({ ...category, tenantId: targetTenantId }, targetTenantId);
    const dg = this._getDataGateway();
    if (dg && typeof dg.create === 'function') {
      try { await dg.create('retail_categories', record); } catch (e) {
        console.warn('[retailCategoryModel] Cloud retail_categories sync error:', e.message);
      }
    } else {
      offlineStore.appendItem('retail_categories', record);
    }
    return record;
  }

  async update(id, patch = {}, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const existing = this.getAll(targetTenantId).find(c => c.id === id);
    if (!existing) return null;
    const updated = this._normalize({ ...existing, ...patch, id, tenantId: targetTenantId }, targetTenantId);
    const dg = this._getDataGateway();
    if (dg && typeof dg.update === 'function') {
      try { await dg.update('retail_categories', id, updated); } catch (e) {
        console.warn('[retailCategoryModel] Cloud retail_categories update sync error:', e.message);
      }
    } else {
      const list = offlineStore.getCollection('retail_categories') || [];
      const idx = list.findIndex(c => c.id === id && this._matchesTenant(c, targetTenantId));
      if (idx >= 0) { list[idx] = updated; offlineStore.setCollection('retail_categories', list); }
    }
    return updated;
  }

  async remove(id, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const dg = this._getDataGateway();
    if (dg && typeof dg.delete === 'function') {
      try { await dg.delete('retail_categories', id); } catch (e) {
        console.warn('[retailCategoryModel] Cloud retail_categories delete sync error:', e.message);
      }
    } else {
      const list = offlineStore.getCollection('retail_categories') || [];
      offlineStore.setCollection('retail_categories', list.filter(c => !(c.id === id && this._matchesTenant(c, targetTenantId))));
    }
    return true;
  }

  /**
   * Idempotently seed any missing default categories for the tenant. Writes only
   * codes that are not already present, so manager edits are never clobbered.
   * Returns the list of categories it created.
   */
  async seedDefaults(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const have = new Set(this.getAll(targetTenantId).map(c => String(c.code).toUpperCase()));
    const created = [];
    for (const def of DEFAULT_RETAIL_CATEGORIES) {
      if (have.has(String(def.code).toUpperCase())) continue;
      const rec = await this.create({ ...def, tenantId: targetTenantId }, targetTenantId);
      created.push(rec);
    }
    return created;
  }
}

export const retailCategoryModel = new RetailCategoryModel();
