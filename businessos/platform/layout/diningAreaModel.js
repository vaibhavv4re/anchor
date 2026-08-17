/**
 * BusinessOS Platform - Dining Area Master Configuration (PD-007)
 * Connected directly to DataGateway / Supabase Cloud DB (`dining_areas` collection).
 * ZERO hardcoded fake seed areas.
 */

import { offlineStore } from '../offline_store/offlineStore.js';

class DiningAreaModel {
  _getGatewayCollection() {
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      const list = window.__APP__.platform.dataGateway.getCachedCollection('dining_areas');
      if (Array.isArray(list) && list.length > 0) return list;
    }
    return offlineStore.getCollection('dining_areas') || [];
  }

  getAllAreas() {
    const rawList = this._getGatewayCollection();
    if (!Array.isArray(rawList) || rawList.length === 0) return [];

    return rawList.map((a, idx) => ({
      id: a.id || a.area_id || `area-${idx}`,
      name: a.areaName || a.name || a.area_name || `Area ${idx + 1}`,
      code: a.areaCode || a.code || 'DA',
      type: a.areaType || 'Indoor',
      color: a.color || (idx % 2 === 0 ? '#10b981' : '#3b82f6'),
      displayOrder: a.displayOrder || idx + 1,
      isActive: a.status ? (a.status === 'OPEN' || a.status === 'ACTIVE') : true,
      tenantId: a.tenantId || a.tenant_id
    }));
  }

  getArea(areaId) {
    const areas = this.getAllAreas();
    return areas.find(a => a.id === areaId) || areas[0] || null;
  }
}

export const diningAreaModel = new DiningAreaModel();
