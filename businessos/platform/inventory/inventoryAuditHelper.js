/**
 * BusinessOS Platform - Inventory Master Forensic Audit & Cleanup Helper
 *
 * Detects and resolves:
 *  1. Exact duplicate item_code rows (multiple UUIDs for the same SKU).
 *  2. Legacy / non-canonical SKUs (e.g., old BAR0001-BAR0050 or superseded demo seeds).
 *  3. Same-name overlaps across old vs new SKU codes.
 */

import { offlineStore } from '../offline_store/offlineStore.js';

export const CANONICAL_INVENTORY_CODES = new Set([
  'RM0402', 'RM0403', 'RM0404', 'RM0701', 'RM0702', 'RM0703', 'RM0704', 'RM0705', 'RM0706', 'RM0707',
  'RM0711', 'RM0712', 'RM0713', 'RM0714', 'RM0801', 'RM0802', 'RM0803', 'RM0804', 'RM0805', 'RM0806',
  'RM0807', 'RM0808', 'RM0809', 'RM0810', 'RM0811', 'RM0812', 'RM0813', 'RM0814', 'RM0815', 'RM0816',
  'RM0817', 'RM0818', 'RM0819', 'RM0820', 'RM0821', 'RM0851', 'RM0852', 'RM0853', 'RM0854', 'RM0855',
  'RM0901', 'RM0902', 'RM0903', 'RM0904', 'RM0905', 'RM0906', 'RM0907', 'RM0908', 'RM0909', 'RM0911',
  'RM0912', 'RM0913', 'RM0914', 'RM0915', 'RM0916', 'RM0917', 'RM0918', 'RM0919', 'RM0920', 'RM0921',
  'RM0922', 'RM0923', 'RM0931', 'RM0932', 'RM0933', 'RM1001', 'RM1002', 'RM1003', 'RM1004', 'RM1005',
  'RM1006', 'RM0409', 'RM1101', 'RM1102', 'RM1103', 'RM1104', 'RM1105', 'RM1106', 'RM1107', 'RM1111',
  'RM1201', 'RM1202', 'RM1203', 'RM1204', 'RM1205', 'RM1206', 'RM1207', 'RM1208', 'RM1209', 'RM1210',
  'RM1211', 'RM1212', 'RM1213', 'RM0501', 'RM1301', 'RM1302', 'RM1303', 'RM1304', 'RM1305', 'RM1401',
  'RM1402', 'RM1403', 'RM1404', 'RM1405', 'RM1406', 'RM1407', 'RM1408', 'RM1501', 'RM1502', 'RM1601',
  'RM1602', 'RM1603', 'PKG0101', 'PKG0102', 'PKG0103', 'PKG0104', 'PKG0105', 'PKG0106',
  'RM2001', 'RM2002', 'RM2003', 'RM2004', 'RM2005', 'RM2006', 'RM2007',
  'RM2011', 'RM2012', 'RM2013', 'RM2014', 'RM2015', 'RM2016',
  'RM2021', 'RM2022', 'RM2023', 'RM2024', 'RM2025', 'RM2026', 'RM2027', 'RM2028', 'RM2029', 'RM2030',
  'RM2031', 'RM2032', 'RM2033', 'RM2034', 'RM2035',
  'RM2041', 'RM2042', 'RM2043', 'RM2044', 'RM2045',
  'RM2051', 'RM2052', 'RM2053',
  'RM2061', 'RM2062', 'RM2063', 'RM2064', 'RM2065', 'RM2066', 'RM2067', 'RM2068', 'RM2069', 'RM2070',
  'BAR0101', 'BAR0102', 'BAR0103', 'BAR0104', 'BAR0105', 'BAR0106', 'BAR0107', 'BAR0108', 'BAR0109', 'BAR0110',
  'BAR0111', 'BAR0112', 'BAR0113', 'BAR0114', 'BAR0115', 'BAR0116', 'BAR0117', 'BAR0118', 'BAR0119', 'BAR0120',
  'BAR0121', 'BAR0122', 'BAR0123', 'BAR0124', 'BAR0125', 'BAR0126', 'BAR0127', 'BAR0128', 'BAR0129', 'BAR0130',
  'BAR0131', 'BAR0132', 'BAR0133', 'BAR0134', 'BAR0135', 'BAR0136', 'BAR0137', 'BAR0138', 'BAR0139', 'BAR0140',
  'BAR0141', 'BAR0142', 'BAR0143', 'BAR0144', 'BAR0145', 'BAR0146', 'BAR0147', 'BAR0148', 'BAR0149', 'BAR0150',
  'BAR0151', 'BAR0152', 'BAR0153', 'BAR0154', 'BAR0155', 'BAR0156', 'BAR0157', 'BAR0158', 'BAR0159', 'BAR0160',
  'BAR0161', 'BAR0162', 'BAR0163', 'BAR0164', 'BAR0165', 'BAR0166', 'BAR0167', 'BAR0168', 'BAR0169', 'BAR0170',
  'BAR0171', 'BAR0172', 'BAR0173', 'BAR0174', 'BAR0175', 'BAR0176', 'BAR0177', 'BAR0178', 'BAR0179', 'BAR0180',
  'BAR0181', 'BAR0182', 'BAR0183', 'BAR0184', 'BAR0185', 'BAR0186', 'BAR0187', 'BAR0188', 'BAR0189', 'BAR0190',
  'BAR0191', 'BAR0192', 'BAR0193',
  // Cocktail / Mocktail Mixers, Syrups, Juices & Produce Additions
  'RM0822', 'RM1108', 'RM1112', 'RM1214', 'RM1409', 'RM1410', 'RM1411', 'RM1412', 'RM1413', 'RM1414',
  'RM2036', 'RM2037', 'RM2038', 'RM2039', 'RM2040', 'RM2071',
  'BAR0194', 'BAR0195', 'BAR0196', 'BAR0197', 'BAR0198', 'BAR0199', 'BAR0200', 'BAR0201', 'BAR0202', 'BAR0203',
  'BAR0204', 'BAR0205', 'BAR0206'
]);

export const OBSOLETE_DRY_CODES = new Set([
  'RM1601', 'RM1602', 'RM1603', // Pasta
  'RM1303', 'RM1304', 'RM1305', 'RM0932', // Jalapeno, Olives, Oregano
  'RM1406', 'RM1407' // Dark Chocolate Syrup, Cocoa Powder
]);

/**
 * Audit an inventory master array for duplicate codes, duplicate names, and legacy/non-pack SKUs.
 * @param {Array<Object>} items
 * @returns {Object}
 */
export function auditInventoryMaster(items = []) {
  const activeItems = items.filter(i => i.active !== false && String(i.status || '').toUpperCase() !== 'ARCHIVED');
  const seenCodes = new Map();
  const seenNames = new Map();

  const duplicateCodeRows = [];
  const legacyNonPackRows = [];
  const duplicateNameRows = [];
  const obsoleteDryRows = [];

  // Sort newest updatedAt first so the newest row is retained during deduplication
  const sorted = [...activeItems].sort((a, b) => {
    const ta = new Date(a.updatedAt || a.modifiedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.updatedAt || b.modifiedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });

  sorted.forEach(item => {
    const code = String(item.itemCode || item.item_code || item.sku || item.id || '').toUpperCase().trim();
    const name = String(item.itemName || item.item_name || item.name || '').toLowerCase().trim();

    if (code) {
      if (seenCodes.has(code)) {
        duplicateCodeRows.push(item);
      } else {
        seenCodes.set(code, item);
        if (!CANONICAL_INVENTORY_CODES.has(code)) {
          legacyNonPackRows.push(item);
        } else if (OBSOLETE_DRY_CODES.has(code)) {
          obsoleteDryRows.push(item);
        }
      }
    }

    if (name) {
      if (seenNames.has(name)) {
        const firstCode = String(seenNames.get(name).itemCode || seenNames.get(name).item_code || '').toUpperCase().trim();
        if (firstCode !== code) {
          duplicateNameRows.push({ existing: seenNames.get(name), duplicate: item });
        }
      } else {
        seenNames.set(name, item);
      }
    }
  });

  return {
    totalActiveRows: activeItems.length,
    uniqueCodesCount: seenCodes.size,
    duplicateCodeCount: duplicateCodeRows.length,
    legacyNonPackCount: legacyNonPackRows.length,
    duplicateNameCount: duplicateNameRows.length,
    obsoleteDryCount: obsoleteDryRows.length,
    duplicateCodeRows,
    legacyNonPackRows,
    duplicateNameRows,
    obsoleteDryRows,
    needsCleanup: duplicateCodeRows.length > 0 || legacyNonPackRows.length > 0
  };
}

/**
 * Deduplicate exact duplicate itemCode rows and soft-archive legacy non-canonical SKUs.
 * @param {Object} params { tenantId, dataGateway, archiveLegacy = true }
 * @returns {Promise<{ deduplicatedCount: number, archivedLegacyCount: number, activeRemainingCount: number }>}
 */
export async function cleanupInventoryMaster({ tenantId = null, dataGateway = null, archiveLegacy = true } = {}) {
  const dg = dataGateway || (typeof window !== 'undefined' && window.__APP__?.platform?.dataGateway) || null;
  const items = (dg && typeof dg.getCachedCollection === 'function')
    ? (dg.getCachedCollection('inventory', tenantId) || [])
    : (offlineStore.getCollection('inventory', tenantId) || []);

  const report = auditInventoryMaster(items);
  const dupIds = new Set(report.duplicateCodeRows.map(d => d.id || d.uuid));
  const legacyIds = new Set(archiveLegacy ? report.legacyNonPackRows.map(l => l.id || l.uuid) : []);

  let deduplicatedCount = 0;
  let archivedLegacyCount = 0;
  const cleanedList = [];

  for (const item of items) {
    const rowId = item.uuid || item.id;
    const updateKey = item.uuid || (String(item.id || '').startsWith('uuid-') ? item.id : null) || item.itemCode || item.item_code || item.id;
    if (dupIds.has(item.id || item.uuid)) {
      deduplicatedCount++;
      if (dg && typeof dg.delete === 'function' && updateKey) {
        await dg.delete('inventory', updateKey).catch(() => {});
      }
      continue;
    }

    if (legacyIds.has(item.id || item.uuid)) {
      archivedLegacyCount++;
      const updated = {
        ...item,
        active: false,
        status: 'ARCHIVED',
        modifiedAt: new Date().toISOString()
      };
      if (updated.data) {
        updated.data.active = false;
        updated.data.status = 'ARCHIVED';
      }
      cleanedList.push(updated);
      if (dg && typeof dg.update === 'function' && updateKey) {
        await dg.update('inventory', updateKey, {
          tenantId: item.tenantId || item.tenant_id || tenantId,
          tenant_id: item.tenant_id || item.tenantId || tenantId,
          active: false,
          status: 'ARCHIVED',
          data: updated.data || updated
        }).catch(() => {});
      }
      continue;
    }

    cleanedList.push(item);
  }

  offlineStore.setCollection('inventory', cleanedList, tenantId);
  const activeRemainingCount = cleanedList.filter(i => i.active !== false && String(i.status || '').toUpperCase() !== 'ARCHIVED').length;

  return { deduplicatedCount, archivedLegacyCount, activeRemainingCount };
}

