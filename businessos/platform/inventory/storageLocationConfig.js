/**
 * BusinessOS Platform - Authoritative Storage Location Configuration & Resolver
 *
 * Single source of truth for Storage Location codes across Main Storage, Kitchen, Bar, and Retail.
 * Eliminates hardcoded random codes (LOC-314, LOC-886, LOC-805) in favor of consistent,
 * human-readable LOC-<SHORTCODE> naming and dynamic lookup from `storage_locations`.
 */

import { offlineStore } from '../offline_store/offlineStore.js';

export const CANONICAL_LOCATIONS = Object.freeze({
  MAIN: 'LOC-MWH',
  KITCHEN: 'LOC-KITCHEN',
  BAR: 'LOC-BAR',
  RETAIL: 'LOC-RETAIL'
});

/**
 * Legacy codes retained strictly as read-aliases so existing stock_balances
 * from older seeds remain readable without breaking live tenants.
 */
export const LEGACY_LOCATION_ALIASES = Object.freeze({
  'LOC-805': 'LOC-MWH',
  'LOC-886': 'LOC-KITCHEN',
  'LOC-901': 'LOC-KITCHEN',
  'LOC-KIT': 'LOC-KITCHEN',
  'LOC-314': 'LOC-BAR'
});

/**
 * Normalize any location code (converting legacy codes like LOC-314 -> LOC-BAR).
 * @param {string} code
 * @returns {string}
 */
export function normalizeLocationCode(code) {
  const upper = String(code || '').toUpperCase().trim();
  if (!upper) return '';
  return LEGACY_LOCATION_ALIASES[upper] || upper;
}

/**
 * Format a new location code consistently using the LOC-<SHORTCODE> pattern.
 * @param {string} rawCodeOrShortName
 * @returns {string}
 */
export function formatLocationCode(rawCodeOrShortName) {
  const clean = String(rawCodeOrShortName || '')
    .toUpperCase()
    .trim()
    .replace(/^LOC[-_]?/, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return clean ? `LOC-${clean}` : `LOC-${Math.floor(100 + Math.random() * 900)}`;
}

/**
 * Dynamically resolve the active storage location code for a department
 * from the tenant's configured `storage_locations` collection.
 * Falls back to CANONICAL_LOCATIONS if not explicitly configured.
 *
 * @param {'MAIN'|'KITCHEN'|'BAR'|'RETAIL'} department
 * @param {string|null} tenantId
 * @returns {string}
 */
export function resolveDepartmentLocation(department, tenantId = null) {
  const dept = String(department || 'MAIN').toUpperCase().trim();
  const fallback = CANONICAL_LOCATIONS[dept] || CANONICAL_LOCATIONS.MAIN;

  try {
    const locations = offlineStore.getCollection('storage_locations', tenantId) || [];
    const active = locations.filter(l => (l.status || 'ACTIVE') === 'ACTIVE');
    if (active.length === 0) return fallback;

    let match = null;
    if (dept === 'MAIN' || dept === 'WAREHOUSE') {
      match = active.find(l => l.locationCode === 'LOC-MWH')
        || active.find(l => (l.locationType || '').toLowerCase() === 'warehouse' || l.responsibleWorkspace === 'inventory');
    } else if (dept === 'KITCHEN') {
      match = active.find(l => l.locationCode === 'LOC-KITCHEN')
        || active.find(l => l.responsibleWorkspace === 'kitchen' || (l.locationType || '').toLowerCase().includes('kitchen'));
    } else if (dept === 'BAR') {
      match = active.find(l => l.locationCode === 'LOC-BAR')
        || active.find(l => l.responsibleWorkspace === 'bar' || l.alcoholStorage === true || (l.locationType || '').toLowerCase().includes('bar'));
    } else if (dept === 'RETAIL') {
      match = active.find(l => l.locationCode === 'LOC-RETAIL')
        || active.find(l => l.responsibleWorkspace === 'retail' || (l.locationType || '').toLowerCase().includes('retail'));
    }

    if (match && (match.locationCode || match.code)) {
      return match.locationCode || match.code;
    }
  } catch (_) {}

  return fallback;
}

/**
 * Check whether a stock balance locationCode belongs to a given department
 * (matching both canonical/configured codes and legacy aliases).
 *
 * @param {string} locCode
 * @param {'MAIN'|'KITCHEN'|'BAR'|'RETAIL'} department
 * @param {string|null} tenantId
 * @returns {boolean}
 */
export function isDepartmentLocation(locCode, department, tenantId = null) {
  const norm = normalizeLocationCode(locCode);
  const configured = normalizeLocationCode(resolveDepartmentLocation(department, tenantId));
  const canonical = CANONICAL_LOCATIONS[String(department || '').toUpperCase()] || '';
  return Boolean(norm && (norm === configured || norm === canonical));
}

/**
 * Migrate all inventory item default locations and stock balances from legacy codes
 * (LOC-805, LOC-886, LOC-314, LOC-KIT, LOC-901) to canonical codes (LOC-MWH, LOC-KITCHEN, LOC-BAR),
 * and remove legacy + duplicate storage_locations rows from both offlineStore and Supabase via DataGateway.
 *
 * @param {string|null} tenantId
 * @param {Object|null} dataGateway
 * @returns {Promise<{ migratedItems: number, migratedBalances: number, removedLocations: number }>}
 */
export async function consolidateLegacyLocations(tenantId = null, dataGateway = null) {
  const dg = dataGateway || (typeof window !== 'undefined' && window.__APP__?.platform?.dataGateway) || null;
  const getCol = (name) => {
    if (dg && typeof dg.getCachedCollection === 'function') {
      const list = dg.getCachedCollection(name, tenantId);
      if (Array.isArray(list) && list.length > 0) return list;
    }
    return offlineStore.getCollection(name, tenantId) || [];
  };

  let migratedItems = 0;
  let migratedBalances = 0;
  let removedLocations = 0;

  // 1. Remap inventory.defaultLocationCode
  const invItems = getCol('inventory');
  for (const item of invItems) {
    const curLoc = String(item.defaultLocationCode || item.default_location_code || '').toUpperCase().trim();
    if (LEGACY_LOCATION_ALIASES[curLoc]) {
      const targetLoc = LEGACY_LOCATION_ALIASES[curLoc];
      item.defaultLocationCode = targetLoc;
      item.default_location_code = targetLoc;
      if (item.data) item.data.defaultLocationCode = targetLoc;
      migratedItems++;
      if (dg && typeof dg.update === 'function') {
        const key = item.uuid || (String(item.id || '').startsWith('uuid-') ? item.id : null) || item.itemCode || item.item_code || item.id;
        await dg.update('inventory', key, {
          tenantId: item.tenantId || item.tenant_id || tenantId,
          tenant_id: item.tenant_id || item.tenantId || tenantId,
          defaultLocationCode: targetLoc,
          default_location_code: targetLoc,
          data: item.data || item
        }).catch(() => {});
      }
    }
  }
  if (migratedItems > 0) {
    offlineStore.setCollection('inventory', invItems, tenantId);
  }

  // 2. Remap & merge stock_balances
  const balances = getCol('stock_balances');
  const toDeleteBalIds = [];
  const normCode = (c) => String(c || '').toUpperCase().trim();

  for (const bal of balances) {
    const curLoc = normCode(bal.locationCode || bal.location_code);
    if (!LEGACY_LOCATION_ALIASES[curLoc]) continue;

    const targetLoc = LEGACY_LOCATION_ALIASES[curLoc];
    const itemCode = normCode(bal.itemCode || bal.item_code);
    const existingTarget = balances.find(b =>
      b.id !== bal.id &&
      !toDeleteBalIds.includes(b.id) &&
      normCode(b.itemCode || b.item_code) === itemCode &&
      normCode(b.locationCode || b.location_code) === targetLoc
    );

    if (existingTarget) {
      const mergedQty = parseFloat((parseFloat(existingTarget.quantity || existingTarget.currentStock || 0) + parseFloat(bal.quantity || bal.currentStock || 0)).toFixed(4));
      const mergedVal = parseFloat((parseFloat(existingTarget.valuation || 0) + parseFloat(bal.valuation || 0)).toFixed(2));
      existingTarget.quantity = mergedQty;
      existingTarget.currentStock = mergedQty;
      existingTarget.valuation = mergedVal;
      if (existingTarget.data) {
        existingTarget.data.quantity = mergedQty;
        existingTarget.data.valuation = mergedVal;
      }
      if (dg && typeof dg.update === 'function') {
        await dg.update('stock_balances', existingTarget.id, existingTarget).catch(() => {});
      }
      toDeleteBalIds.push(bal.id);
      if (dg && typeof dg.delete === 'function') {
        await dg.delete('stock_balances', bal.id).catch(() => {});
      }
    } else {
      bal.locationCode = targetLoc;
      bal.location_code = targetLoc;
      if (bal.data) bal.data.locationCode = targetLoc;
      if (dg && typeof dg.update === 'function') {
        await dg.update('stock_balances', bal.id, {
          locationCode: targetLoc,
          location_code: targetLoc,
          data: bal.data || bal
        }).catch(() => {});
      }
    }
    migratedBalances++;
  }

  if (migratedBalances > 0) {
    const remainingBals = balances.filter(b => !toDeleteBalIds.includes(b.id));
    offlineStore.setCollection('stock_balances', remainingBals, tenantId);
  }

  // 3. Remove legacy & duplicate storage_locations (keep canonical codes, prefer 'Retail Store' over 'Retail Wine Store')
  const locations = getCol('storage_locations');
  const seenCodes = new Map();
  const keepLocs = [];
  const deleteLocs = [];

  // Sort so canonical names ('Retail Store', 'Main Warehouse / Dry Store') win over legacy names ('Retail Wine Store')
  const sortedLocs = [...locations].sort((a, b) => {
    const aName = String(a.locationName || a.location_name || '').toLowerCase();
    const bName = String(b.locationName || b.location_name || '').toLowerCase();
    if (aName.includes('wine') && !bName.includes('wine')) return 1;
    if (!aName.includes('wine') && bName.includes('wine')) return -1;
    return 0;
  });

  for (const loc of sortedLocs) {
    const code = normCode(loc.locationCode || loc.location_code || loc.code);
    if (LEGACY_LOCATION_ALIASES[code] || seenCodes.has(code)) {
      deleteLocs.push(loc);
    } else {
      seenCodes.set(code, loc);
      keepLocs.push(loc);
    }
  }

  for (const dLoc of deleteLocs) {
    removedLocations++;
    if (dg && typeof dg.delete === 'function') {
      await dg.delete('storage_locations', dLoc.id).catch(() => {});
    }
  }
  if (removedLocations > 0) {
    offlineStore.setCollection('storage_locations', keepLocs, tenantId);
  }

  return { migratedItems, migratedBalances, removedLocations };
}

