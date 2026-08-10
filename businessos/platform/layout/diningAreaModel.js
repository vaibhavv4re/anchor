/**
 * BusinessOS Platform - Dining Area Master Configuration (PD-007)
 * Defines static dining zones (Main Hall, Outdoor Patio, VIP Lounge, Bar Counter).
 */

import { offlineStore } from '../offline_store/offlineStore.js';

class DiningAreaModel {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('dining_areas')) {
      const defaultAreas = [
        { id: 'area-main', name: 'Main Dining Hall', color: '#10b981', displayOrder: 1, isActive: true },
        { id: 'area-patio', name: 'Outdoor Patio', color: '#3b82f6', displayOrder: 2, isActive: true },
        { id: 'area-vip', name: 'VIP Lounge', color: '#8b5cf6', displayOrder: 3, isActive: true },
        { id: 'area-bar', name: 'Bar Counter', color: '#f59e0b', displayOrder: 4, isActive: true }
      ];
      offlineStore.setCollection('dining_areas', defaultAreas);
    }
  }

  getAllAreas() {
    const areas = offlineStore.getCollection('dining_areas') || [];
    return areas.filter(a => a.isActive).sort((a, b) => a.displayOrder - b.displayOrder);
  }

  getArea(areaId) {
    const areas = this.getAllAreas();
    return areas.find(a => a.id === areaId) || null;
  }
}

export const diningAreaModel = new DiningAreaModel();
