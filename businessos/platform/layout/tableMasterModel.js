/**
 * BusinessOS Platform - Tables Master Configuration (PD-007 & PD-008)
 * Static table asset definitions (Table Number, Dining Area, Shape, Seats, Max Capacity, Mergeable specs).
 * Configuration NEVER owns dynamic runtime operational state.
 */

import { offlineStore } from '../offline_store/offlineStore.js';

class TableMasterModel {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('tables_master')) {
      const defaultTables = [
        // Main Hall Tables
        { tableNumber: 1, areaId: 'area-main', shape: 'SQUARE', seats: 2, maxSeats: 4, isMergeable: true, mergedGroupId: null, isWheelchairAccessible: true, gridX: 1, gridY: 1 },
        { tableNumber: 2, areaId: 'area-main', shape: 'RECT', seats: 4, maxSeats: 6, isMergeable: true, mergedGroupId: null, isWheelchairAccessible: true, gridX: 2, gridY: 1 },
        { tableNumber: 3, areaId: 'area-main', shape: 'RECT', seats: 4, maxSeats: 6, isMergeable: true, mergedGroupId: null, isWheelchairAccessible: true, gridX: 3, gridY: 1 },
        { tableNumber: 4, areaId: 'area-main', shape: 'ROUND', seats: 6, maxSeats: 8, isMergeable: false, mergedGroupId: null, isWheelchairAccessible: false, gridX: 1, gridY: 2 },
        { tableNumber: 5, areaId: 'area-main', shape: 'ROUND', seats: 6, maxSeats: 8, isMergeable: false, mergedGroupId: null, isWheelchairAccessible: false, gridX: 2, gridY: 2 },
        { tableNumber: 6, areaId: 'area-main', shape: 'RECT', seats: 8, maxSeats: 10, isMergeable: true, mergedGroupId: null, isWheelchairAccessible: true, gridX: 3, gridY: 2 },

        // Patio Tables
        { tableNumber: 101, areaId: 'area-patio', shape: 'ROUND', seats: 2, maxSeats: 4, isMergeable: true, mergedGroupId: null, isWheelchairAccessible: true, gridX: 1, gridY: 1 },
        { tableNumber: 102, areaId: 'area-patio', shape: 'ROUND', seats: 4, maxSeats: 6, isMergeable: true, mergedGroupId: null, isWheelchairAccessible: true, gridX: 2, gridY: 1 },
        { tableNumber: 103, areaId: 'area-patio', shape: 'RECT', seats: 6, maxSeats: 8, isMergeable: false, mergedGroupId: null, isWheelchairAccessible: true, gridX: 3, gridY: 1 },

        // VIP Lounge Tables
        { tableNumber: 201, areaId: 'area-vip', shape: 'RECT', seats: 8, maxSeats: 12, isMergeable: false, mergedGroupId: null, isWheelchairAccessible: true, gridX: 1, gridY: 1 },
        { tableNumber: 202, areaId: 'area-vip', shape: 'RECT', seats: 10, maxSeats: 14, isMergeable: false, mergedGroupId: null, isWheelchairAccessible: true, gridX: 2, gridY: 1 },

        // Bar Tables
        { tableNumber: 301, areaId: 'area-bar', shape: 'SQUARE', seats: 1, maxSeats: 2, isMergeable: false, mergedGroupId: null, isWheelchairAccessible: true, gridX: 1, gridY: 1 },
        { tableNumber: 302, areaId: 'area-bar', shape: 'SQUARE', seats: 1, maxSeats: 2, isMergeable: false, mergedGroupId: null, isWheelchairAccessible: true, gridX: 2, gridY: 1 },
        { tableNumber: 303, areaId: 'area-bar', shape: 'SQUARE', seats: 1, maxSeats: 2, isMergeable: false, mergedGroupId: null, isWheelchairAccessible: true, gridX: 3, gridY: 1 }
      ];
      offlineStore.setCollection('tables_master', defaultTables);
    }
  }

  getAllMasterTables() {
    return offlineStore.getCollection('tables_master') || [];
  }

  getTablesByArea(areaId) {
    const tables = this.getAllMasterTables();
    return tables.filter(t => t.areaId === areaId);
  }

  getTableMaster(tableNumber) {
    const tables = this.getAllMasterTables();
    return tables.find(t => t.tableNumber === parseInt(tableNumber)) || null;
  }
}

export const tableMasterModel = new TableMasterModel();
