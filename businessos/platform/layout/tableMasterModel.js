/**
 * BusinessOS Platform - Tables Master Configuration (PD-007 & PD-008)
 * Connected directly to DataGateway / Supabase Cloud DB (`tables_master` collection).
 * ZERO hardcoded fake seed tables.
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

  getAllMasterTables() {
    const rawList = this._getGatewayCollection();
    if (!Array.isArray(rawList) || rawList.length === 0) return [];

    return rawList.map((t, idx) => {
      const tableNum = t.tableNumber || t.table_number || (t.id ? parseInt(t.id.replace(/\D/g, '')) || (idx + 1) : (idx + 1));
      return {
        id: t.id || `tbl-${idx + 1}`,
        tableNumber: tableNum,
        tableCode: t.tableCode || t.table_code || `T${tableNum}`,
        areaId: t.areaId || t.area_id || 'area-3lqse',
        seats: t.seats || 4,
        maxSeats: t.maxSeats || t.max_seats || 6,
        shape: t.shape || 'SQUARE',
        status: t.status || 'ACTIVE',
        tenantId: t.tenantId || t.tenant_id
      };
    });
  }

  getTablesByArea(areaId) {
    const tables = this.getAllMasterTables();
    if (!areaId) return tables;
    return tables.filter(t => t.areaId === areaId);
  }

  getTableMaster(tableNumber) {
    const tables = this.getAllMasterTables();
    if (tableNumber === undefined || tableNumber === null) return null;
    const str = String(tableNumber).trim().toLowerCase();
    const digitsOnly = str.replace(/\D/g, '');
    const num = digitsOnly.length > 0 ? parseInt(digitsOnly, 10) : (typeof tableNumber === 'number' ? tableNumber : null);

    return tables.find(t => 
      (num !== null && t.tableNumber === num) || 
      String(t.tableNumber).toLowerCase() === str || 
      (t.id && String(t.id).toLowerCase() === str) ||
      (t.tableCode && String(t.tableCode).toLowerCase() === str) ||
      (t.table_code && String(t.table_code).toLowerCase() === str)
    ) || null;
  }
}

export const tableMasterModel = new TableMasterModel();
