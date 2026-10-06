/**
 * BusinessOS Platform - Retail (Wine Store) Product Catalogue (Retail Phase 1)
 *
 * A thin Retail-specific product layer that sits ON TOP of the shared Inventory
 * Core. Every retail product references an inventory `itemCode` (the common SKU
 * master) - there is deliberately NO second inventory master. The catalogue only
 * adds the retail-facing attributes a wine shop needs (brand / vintage / region /
 * MRP / selling price / tax category / barcode).
 *
 * Persistence mirrors the platform engines: the local synchronous read path is
 * `offlineStore`; the durable cloud write is `DataGateway.create/update` against
 * the `retail_products` table (see supabaseClient.formatRecordForTable branch).
 *
 * Hard boundary: this is the Retail catalogue. It never touches menu items,
 * TableSession, KOT/BOT or the restaurant cashier.
 */

import { offlineStore } from '../offline_store/offlineStore.js';

const BUSINESS_UNIT = 'RETAIL';

class RetailProductModel {
  constructor() {
    // No demo/mock seeding. The Retail catalogue is LIVE data only: it is hydrated
    // from the cloud `retail_products` table (see bootstrap HYDRATE_SET) and each
    // row references a real shared `inventory` SKU via `item_code`. Retail stock at
    // LOC-RETAIL arrives only through inventory-manager warehouse transfers.
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

  _matchesTenant(rec, tenantId) {
    return !tenantId || rec.tenantId === tenantId || rec.tenant_id === tenantId;
  }

  _normalize(input = {}, tenantId) {
    const now = new Date().toISOString();
    const sellingPrice = parseFloat(input.sellingPrice != null ? input.sellingPrice : input.selling_price) || 0;
    const mrp = parseFloat(input.mrp) || sellingPrice;
    const data = input.data || {};
    // Merchandising category tag. Persisted inside the `data` JSONB on the cloud
    // row (retail_products has no dedicated column), so resolve from top-level OR
    // the embedded data object so the tag round-trips through hydration.
    const categoryCode = input.categoryCode || input.category_code
      || data.categoryCode || data.category_code || '';
    return {
      id: input.id || 'rp-' + Math.random().toString(36).substring(2, 9),
      tenantId,
      tenant_id: tenantId,
      productCode: input.productCode || input.product_code || ('RP-' + Math.random().toString(36).substring(2, 7).toUpperCase()),
      itemCode: input.itemCode || input.item_code || '',
      categoryCode,
      name: input.name || input.productName || '',
      brand: input.brand || '',
      vintage: input.vintage || '',
      region: input.region || '',
      country: input.country || '',
      varietal: input.varietal || '',
      bottleSize: input.bottleSize || input.bottle_size || '750ml',
      mrp,
      sellingPrice,
      taxCategory: input.taxCategory || input.tax_category || 'ALCOHOL_WINE',
      barcode: input.barcode || '',
      status: input.status || 'ACTIVE',
      businessUnit: input.businessUnit || input.business_unit || BUSINESS_UNIT,
      createdAt: input.createdAt || input.created_at || now,
      updatedAt: now
    };
  }

  /** All products for a tenant (live cloud `retail_products`, normalized camelCase). */
  getAll(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const dg = this._getDataGateway();
    let list = [];
    if (dg && typeof dg.getCachedCollection === 'function') {
      list = dg.getCachedCollection('retail_products', targetTenantId) || [];
    }
    if (!list.length) {
      list = offlineStore.getCollection('retail_products') || [];
    }
    // Cloud rows arrive snake_case; normalize so the POS reads itemCode/productCode/
    // sellingPrice/barcode consistently regardless of source (cloud or local mirror).
    return list
      .map(p => this._normalize(p, targetTenantId))
      .filter(p => this._matchesTenant(p, targetTenantId));
  }

  getById(id, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    return this.getAll(targetTenantId).find(p => p.id === id) || null;
  }

  getByProductCode(productCode, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    return this.getAll(targetTenantId).find(p => p.productCode === productCode) || null;
  }

  /** Barcode-first lookup for the POS scan box, falling back to product code. */
  findByBarcode(barcode, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const code = String(barcode || '').trim().toUpperCase();
    if (!code) return null;
    return this.getAll(targetTenantId).find(p =>
      String(p.barcode || '').toUpperCase() === code ||
      String(p.productCode || '').toUpperCase() === code
    ) || null;
  }

  /** Text search across name / brand / varietal / region for the POS picker. */
  search(query, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const q = String(query || '').trim().toLowerCase();
    const all = this.getAll(targetTenantId).filter(p => p.status === 'ACTIVE');
    if (!q) return all;
    return all.filter(p =>
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.brand || '').toLowerCase().includes(q) ||
      String(p.varietal || '').toLowerCase().includes(q) ||
      String(p.region || '').toLowerCase().includes(q)
    );
  }

  /** Create a catalogue entry (local mirror + cloud). Returns the record. */
  async create(product = {}, tenantId = null) {
    const targetTenantId = this._getTenantId(product.tenantId || tenantId);
    const record = this._normalize({ ...product, tenantId: targetTenantId }, targetTenantId);
    const dg = this._getDataGateway();
    // DataGateway.create already mirrors into offlineStore (via its OfflineDataAdapter)
    // AND writes the cloud row, so we must NOT also appendItem here or the row lands
    // twice. Only touch offlineStore directly when there is no gateway (headless tests).
    if (dg && typeof dg.create === 'function') {
      try { await dg.create('retail_products', record); } catch (e) {
        console.warn('[retailProductModel] Cloud retail_products sync error:', e.message);
      }
    } else {
      offlineStore.appendItem('retail_products', record);
    }
    return record;
  }

  /** Patch an existing catalogue entry by id (local mirror + cloud). */
  async update(id, patch = {}, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const existing = this.getAll(targetTenantId).find(p => p.id === id);
    if (!existing) return null;
    const updated = this._normalize({ ...existing, ...patch, id, tenantId: targetTenantId }, targetTenantId);
    const dg = this._getDataGateway();
    // Same mirror-through rule as create(): DataGateway.update writes the local cache
    // and the cloud, so only edit offlineStore directly in the no-gateway path.
    if (dg && typeof dg.update === 'function') {
      try { await dg.update('retail_products', id, updated); } catch (e) {
        console.warn('[retailProductModel] Cloud retail_products update sync error:', e.message);
      }
    } else {
      const list = offlineStore.getCollection('retail_products') || [];
      const idx = list.findIndex(p => p.id === id && this._matchesTenant(p, targetTenantId));
      if (idx >= 0) { list[idx] = updated; offlineStore.setCollection('retail_products', list); }
    }
    return updated;
  }

  /** Remove a catalogue entry by id (local mirror + cloud). */
  async remove(id, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const dg = this._getDataGateway();
    if (dg && typeof dg.delete === 'function') {
      try { await dg.delete('retail_products', id); } catch (e) {
        console.warn('[retailProductModel] Cloud retail_products delete sync error:', e.message);
      }
    } else {
      const list = offlineStore.getCollection('retail_products') || [];
      offlineStore.setCollection('retail_products', list.filter(p => !(p.id === id && this._matchesTenant(p, targetTenantId))));
    }
    return true;
  }
}

export const retailProductModel = new RetailProductModel();
