/**
 * BusinessOS Platform - Tables Master Configuration (PD-007 & PD-008)
 * Connected directly to DataGateway / Supabase Cloud DB (`tables_master` collection).
 * Strict Uniqueness Engine: Guarantees unique tableNumber, tableCode, and table ID across all tables.
 */

import { offlineStore } from '../offline_store/offlineStore.js';

class TableMasterModel {
  _getGatewayCollection() {
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      const list = window.__APP__.platform.dataGateway.getCachedCollection('tables_master');
      if (Array.isArray(list) && list.length > 0) return list;
    }
    return offlineStore.getCollection('tables_master') || [];
  }

  /**
   * Retrieves all master tables from Supabase/offline store, enforcing 100% unique id, tableNumber, and tableCode.
   * @returns {Array<Object>}
   */
  getAllMasterTables() {
    const rawList = this._getGatewayCollection();
    if (!Array.isArray(rawList) || rawList.length === 0) return [];

    const result = [];
    const seenIds = new Set();
    const seenNumbers = new Set();
    const seenCodes = new Set();

    rawList.forEach((t, idx) => {
      // 1. Unique ID
      let id = t.id || t._id || `tbl-${idx + 1}`;
      if (seenIds.has(id)) {
        id = `tbl-${idx + 1}_${Math.random().toString(36).substring(2, 6)}`;
      }

      // 2. Unique Numeric tableNumber
      let rawNum = t.tableNumber || t.table_number;
      if (!rawNum && t.id) {
        const parsed = parseInt(String(t.id).replace(/\D/g, ''), 10);
        if (!isNaN(parsed) && parsed > 0) rawNum = parsed;
      }
      let tableNum = parseInt(rawNum, 10);
      if (isNaN(tableNum) || tableNum <= 0) {
        tableNum = idx + 1;
      }

      while (seenNumbers.has(tableNum)) {
        tableNum += 1;
      }
      seenNumbers.add(tableNum);

      // 3. Unique Table Code (e.g. AC-T-01, AC-T-02, T-01)
      let baseCode = (t.tableCode || t.table_code || `T-${String(tableNum).padStart(2, '0')}`).trim();
      let uniqueCode = baseCode;

      if (seenCodes.has(uniqueCode.toLowerCase())) {
        uniqueCode = `${baseCode}-${tableNum}`;
      }
      let counter = 1;
      while (seenCodes.has(uniqueCode.toLowerCase())) {
        uniqueCode = `${baseCode}_${tableNum}_${counter}`;
        counter++;
      }
      seenCodes.add(uniqueCode.toLowerCase());
      seenIds.add(id);

      result.push({
        id,
        tableNumber: tableNum,
        tableCode: uniqueCode,
        areaId: t.areaId || t.area_id || 'area-3lqse',
        seats: parseInt(t.seats || t.capacity || 4, 10),
        maxSeats: parseInt(t.maxSeats || t.max_seats || 6, 10),
        shape: t.shape || 'SQUARE',
        status: t.status || 'ACTIVE',
        tenantId: t.tenantId || t.tenant_id
      });
    });

    return result;
  }

  getTablesByArea(areaId) {
    const tables = this.getAllMasterTables();
    if (!areaId) return tables;
    return tables.filter(t => t.areaId === areaId);
  }

  /**
   * Precise table lookup matching exact id first, exact tableCode second, exact tableNumber third.
   * @param {Object|string|number} target 
   * @returns {Object|null}
   */
  getTableMaster(target) {
    const tables = this.getAllMasterTables();
    if (target === undefined || target === null) return null;

    const str = String(target).trim().toLowerCase();
    const digitsOnly = str.replace(/\D/g, '');
    const num = digitsOnly.length > 0 ? parseInt(digitsOnly, 10) : (typeof target === 'number' ? target : null);

    // 1. Exact match by ID
    let found = tables.find(t => String(t.id).toLowerCase() === str);
    if (found) return found;

    // 2. Exact match by Table Code
    found = tables.find(t => String(t.tableCode).toLowerCase() === str);
    if (found) return found;

    // 3. Exact match by numeric tableNumber
    if (num !== null) {
      found = tables.find(t => t.tableNumber === num);
      if (found) return found;
    }

    return null;
  }
}

export const tableMasterModel = new TableMasterModel();
