/**
 * RestaurantOS Capability - Retail Inventory Support (Retail Phase 2)
 *
 * Small shared READ-ONLY helpers for the Retail inventory surfaces (Stock,
 * Request Stock). Retail is a pure CONSUMER of the SAME platform Inventory Core:
 * physical stock for a retail SKU is a `stock_balances` row keyed by
 * (itemCode, locationCode === 'LOC-RETAIL'). There is deliberately no second
 * inventory master - the retail catalogue (retailProductModel) only adds
 * wine-facing attributes and points at a shared `itemCode`.
 *
 * Hard boundary: these helpers are read-only projections scoped to LOC-RETAIL.
 * Retail never moves stock itself - location-to-location movement is an
 * Inventory Manager action (StockTransferRepository) that fulfils a requisition.
 */

import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';
import { retailProductModel } from '../../../../../businessos/platform/retail/retailProductModel.js';
import { retailCategoryModel } from '../../../../../businessos/platform/retail/retailCategoryModel.js';

export const RETAIL_LOCATION = 'LOC-RETAIL';

/** Resolve the platform DataGateway (live cloud cache) if present. */
export function resolveGateway(depsDataGateway) {
  if (depsDataGateway && typeof depsDataGateway.getCachedCollection === 'function') return depsDataGateway;
  if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) {
    return window.__APP__.platform.dataGateway || null;
  }
  return null;
}

/** Read a collection from the cloud cache, falling back to the local mirror. */
export function readCollection(name, tenantId, gateway) {
  if (gateway && typeof gateway.getCachedCollection === 'function') {
    const cached = gateway.getCachedCollection(name, tenantId);
    if (cached && cached.length) return cached;
  }
  return offlineStore.getCollection(name, tenantId) || [];
}

const codeOf = (b) => b.locationCode || b.location_code || '';
const itemOf = (b) => b.itemCode || b.item_code || '';
const qtyOf = (b) => parseFloat(b.quantity != null ? b.quantity : (b.data && b.data.quantity)) || 0;
const costOf = (b) => parseFloat(b.unitCost != null ? b.unitCost : (b.data && b.data.unitCost)) || 0;

/**
 * Physical balances at LOC-RETAIL for the tenant, one entry per SKU. When the
 * same SKU has more than one balance row they are summed (defensive; the seed
 * keeps a single row per SKU).
 */
export function readRetailBalances(tenantId, gateway) {
  const rows = readCollection('stock_balances', tenantId, gateway)
    .filter(b => codeOf(b) === RETAIL_LOCATION && itemOf(b));
  const byItem = new Map();
  rows.forEach(b => {
    const item = itemOf(b);
    const prev = byItem.get(item);
    const qty = qtyOf(b);
    const cost = costOf(b) || (prev ? prev.unitCost : 0);
    if (prev) {
      prev.quantity += qty;
      prev.valuation = Math.round((prev.valuation + qty * cost) * 100) / 100;
      prev.unitCost = prev.unitCost || cost;
    } else {
      byItem.set(item, {
        itemCode: item,
        quantity: qty,
        unitCost: cost,
        valuation: Math.round(qty * cost * 100) / 100,
        uom: b.uom || b.baseUom || (b.data && b.data.uom) || 'PCS'
      });
    }
  });
  return byItem;
}

/** Map of itemCode -> retail catalogue product (name/brand/size/price). */
export function catalogByItem(tenantId) {
  const map = new Map();
  (retailProductModel.getAll(tenantId) || []).forEach(p => { if (p.itemCode) map.set(p.itemCode, p); });
  return map;
}

/** Display name for an item: catalogue name, else the balance/master hint. */
export function displayName(itemCode, catalog) {
  const p = catalog.get(itemCode);
  return (p && p.name) || itemCode;
}

/**
 * Distinct location codes that actually carry stock (defensive helper).
 */
export function locationCodesWithStock(tenantId, gateway) {
  const codes = new Set();
  readCollection('stock_balances', tenantId, gateway).forEach(b => { const c = codeOf(b); if (c) codes.add(c); });
  codes.add(RETAIL_LOCATION);
  return Array.from(codes);
}

/** All retail item codes = catalogue items ∪ anything already stocked at LOC-RETAIL. */
export function retailItemCodes(tenantId, gateway) {
  const set = new Set();
  (retailProductModel.getAll(tenantId) || []).forEach(p => { if (p.itemCode) set.add(p.itemCode); });
  readRetailBalances(tenantId, gateway).forEach((_, item) => set.add(item));
  return Array.from(set);
}

/**
 * LIVE sellable items for the POS.
 *
 * The POS must be tied to actual inventory: an item is sellable because it has
 * stock at LOC-RETAIL (put there by an inventory-manager warehouse transfer),
 * NOT because someone curated a `retail_products` row. So the sellable set is
 * driven by live `stock_balances` at LOC-RETAIL, then ENRICHED (not gated) by:
 *   - the retail catalogue (retail_products) for wine attributes + price, else
 *   - the shared `inventory` master for name / UOM / selling price.
 * Catalogue SKUs with zero stock are still returned (so the POS can show them
 * disabled), but any stocked-but-uncatalogued SKU now appears and is sellable.
 */
export function listSellableRetailItems(tenantId, gateway) {
  const balances = readRetailBalances(tenantId, gateway);
  const catalog = catalogByItem(tenantId);
  const masterByItem = new Map();
  readCollection('inventory', tenantId, gateway).forEach(i => {
    const code = i.itemCode || i.item_code;
    if (code) masterByItem.set(code, i);
  });

  const num = (...vals) => {
    for (const v of vals) { const n = parseFloat(v); if (n > 0) return n; }
    return 0;
  };
  const resolvePrice = (cat, master, bal) => {
    if (cat) { const p = num(cat.sellingPrice, cat.mrp); if (p > 0) return p; }
    if (master) { const p = num(master.selling_price, master.sellingPrice, master.mrp, master.retail_price, master.retailPrice); if (p > 0) return p; }
    return (bal && bal.unitCost) || 0; // last resort: cost, so a stocked item is never free
  };

  const build = (code, qty) => {
    const cat = catalog.get(code);
    const master = masterByItem.get(code);
    const bal = balances.get(code);
    return {
      itemCode: code,
      productCode: (cat && cat.productCode) || code,
      name: (cat && cat.name) || (master && (master.itemName || master.item_name || master.name)) || code,
      brand: (cat && cat.brand) || '',
      vintage: (cat && cat.vintage) || '',
      sellingPrice: resolvePrice(cat, master, bal),
      taxCategory: (cat && cat.taxCategory) || 'ALCOHOL_WINE',
      barcode: (cat && cat.barcode) || '',
      uom: (bal && bal.uom) || (master && (master.baseUom || master.base_uom)) || 'PCS',
      onHand: qty
    };
  };

  const out = [];
  const seen = new Set();
  // 1. Every SKU with a live LOC-RETAIL balance (the sellable core).
  balances.forEach((b, code) => { out.push(build(code, b.quantity)); seen.add(code); });
  // 2. Catalogue SKUs with no stock row yet (shown disabled until transferred in).
  catalog.forEach((_, code) => { if (!seen.has(code)) { out.push(build(code, 0)); seen.add(code); } });
  return out.sort((a, b) => (b.onHand - a.onHand) || String(a.name).localeCompare(String(b.name)));
}

/**
 * Category-level stock rollup for the Catalogue Management "Categories" view.
 *
 * Groups catalogue products (retail_products) by their `categoryCode` and, for
 * each category, aggregates the LIVE physical position at LOC-RETAIL: SKU count,
 * on-hand units, stock value (at cost) and LOW/OUT alert counts. Health mirrors
 * the consumer contract: a SKU is OUT when on-hand <= 0 and LOW when on-hand is
 * above zero but at/below the shared inventory master's reorder_level.
 *
 * Parent categories include their own direct products PLUS all descendants, so a
 * top-level row is a true rollup of its sub-categories. Products with no (or an
 * unknown) categoryCode collect under a synthetic "Uncategorised" bucket so
 * nothing is hidden. Returns a flat list (each row carries parentCode + sortOrder
 * so the UI can render the tree); alert counts are display-only here.
 */
export function computeCategoryRollups(tenantId, gateway) {
  const products = retailProductModel.getAll(tenantId);
  const balances = readRetailBalances(tenantId, gateway);
  const categories = retailCategoryModel.getAll(tenantId);

  // Reorder thresholds come from the SHARED inventory master (live data).
  const reorderByItem = new Map();
  readCollection('inventory', tenantId, gateway).forEach(i => {
    const code = i.itemCode || i.item_code;
    if (!code) return;
    reorderByItem.set(code, parseFloat(i.reorder_level != null ? i.reorder_level : (i.reorderLevel != null ? i.reorderLevel : (i.data && i.data.reorderLevel))) || 0);
  });

  const upc = (c) => String(c || '').toUpperCase();
  const catByCode = new Map(categories.map(c => [upc(c.code), c]));

  const newBucket = (code, name, parentCode, sortOrder) => ({
    code, name, parentCode: parentCode || '', sortOrder: sortOrder || 0,
    skuCount: 0, onHandUnits: 0, stockValue: 0, outCount: 0, lowCount: 0
  });

  const buckets = new Map();
  categories.forEach(c => buckets.set(upc(c.code), newBucket(c.code, c.name, c.parentCode, c.sortOrder)));
  buckets.set('__UNCAT__', newBucket('__UNCAT__', 'Uncategorised', '', 9999));

  // Direct metrics: fold each product into its own category bucket.
  products.forEach(p => {
    const b = buckets.get(upc(p.categoryCode)) || buckets.get('__UNCAT__');
    const bal = balances.get(p.itemCode);
    const qty = bal ? bal.quantity : 0;
    const value = bal ? bal.valuation : 0;
    const reorder = reorderByItem.get(p.itemCode) || 0;
    b.skuCount += 1;
    b.onHandUnits += qty;
    b.stockValue += value;
    if (qty <= 0) b.outCount += 1;
    else if (reorder > 0 && qty <= reorder) b.lowCount += 1;
  });

  // childrenOf parent -> [child codes]
  const childrenOf = new Map();
  categories.forEach(c => {
    const pk = upc(c.parentCode);
    if (pk && catByCode.has(pk) && pk !== upc(c.code)) {
      if (!childrenOf.has(pk)) childrenOf.set(pk, []);
      childrenOf.get(pk).push(upc(c.code));
    }
  });
  const descendants = (code, acc) => {
    (childrenOf.get(code) || []).forEach(ch => { if (!acc.has(ch)) { acc.add(ch); descendants(ch, acc); } });
    return acc;
  };

  const finalize = (b) => ({
    ...b,
    onHandUnits: Math.round(b.onHandUnits * 1000) / 1000,
    stockValue: Math.round(b.stockValue * 100) / 100,
    needsReplenishment: (b.outCount + b.lowCount) > 0
  });

  const result = [];
  buckets.forEach((b, key) => {
    if (key === '__UNCAT__') { if (b.skuCount > 0) result.push(finalize(b)); return; }
    const agg = { ...b };
    descendants(key, new Set()).forEach(dk => {
      const db = buckets.get(dk);
      if (db) { agg.skuCount += db.skuCount; agg.onHandUnits += db.onHandUnits; agg.stockValue += db.stockValue; agg.outCount += db.outCount; agg.lowCount += db.lowCount; }
    });
    result.push(finalize(agg));
  });

  return result.sort((a, b) => (a.sortOrder - b.sortOrder) || String(a.name).localeCompare(String(b.name)));
}
