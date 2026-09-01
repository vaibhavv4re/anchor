/**
 * BusinessOS Platform - Reusable Modifier BOM Model (F8.3-A)
 * Manages central reusable mixer & garnish modifiers for Bar & Kitchen orders.
 * Strictly distinguishes between INVENTORY (stock deduction) vs NON_INVENTORY (zero stock deduction).
 */

import { offlineStore } from '../offline_store/offlineStore.js';

class ModifierBomModel {
  constructor() {
    this._initSeedModifiers();
  }

  _getCanonicalModifiers() {
    return [
      {
        id: 'mod_soda_100ml',
        modifierCode: 'MOD-SDA-100',
        name: 'Soda Mixer (100ml)',
        category: 'MIXER',
        modifierConsumptionType: 'INVENTORY',
        inventoryItemId: 'invitem_club_soda',
        inventoryItemCode: 'MIX-SDA-01',
        quantity: 100,
        uom: 'ML',
        additionalPrice: 30,
        active: true,
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'mod_tonic_150ml',
        modifierCode: 'MOD-TNC-150',
        name: 'Tonic Water (150ml)',
        category: 'MIXER',
        modifierConsumptionType: 'INVENTORY',
        inventoryItemId: 'invitem_tonic_water',
        inventoryItemCode: 'MIX-TNC-01',
        quantity: 150,
        uom: 'ML',
        additionalPrice: 60,
        active: true,
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'mod_lime_water_20ml',
        modifierCode: 'MOD-LME-20',
        name: 'Fresh Lime Splash (20ml)',
        category: 'MIXER',
        modifierConsumptionType: 'INVENTORY',
        inventoryItemId: 'invitem_lime_juice',
        inventoryItemCode: 'MIX-LME-01',
        quantity: 20,
        uom: 'ML',
        additionalPrice: 20,
        active: true,
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'mod_water_neat',
        modifierCode: 'MOD-WTR-00',
        name: 'Water / Neat (No Mixer)',
        category: 'MIXER',
        modifierConsumptionType: 'NON_INVENTORY',
        inventoryItemId: null,
        inventoryItemCode: null,
        quantity: 0,
        uom: null,
        additionalPrice: 0,
        active: true,
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'mod_ice_rocks',
        modifierCode: 'MOD-ICE-00',
        name: 'On the Rocks (Ice Only)',
        category: 'SERVE_STYLE',
        modifierConsumptionType: 'NON_INVENTORY',
        inventoryItemId: null,
        inventoryItemCode: null,
        quantity: 0,
        uom: null,
        additionalPrice: 0,
        active: true,
        tenantId: 'tenant_h0qc7wf'
      }
    ];
  }

  _initSeedModifiers() {
    const store = offlineStore.getCollection('modifier_boms');
    if (!store || !Array.isArray(store) || store.length === 0) {
      offlineStore.setCollection('modifier_boms', this._getCanonicalModifiers());
    }
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

  getAllModifiers(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    let store = offlineStore.getCollection('modifier_boms') || [];
    if (!Array.isArray(store) || store.length === 0) {
      store = this._getCanonicalModifiers();
      offlineStore.setCollection('modifier_boms', store);
    }
    return store.filter(m => !targetTenantId || m.tenantId === targetTenantId || m.tenant_id === targetTenantId);
  }

  getModifierById(modifierId, tenantId = null) {
    const modifiers = this.getAllModifiers(tenantId);
    return modifiers.find(m => m.id === modifierId || m.modifierCode === modifierId) || null;
  }

  createModifier(data, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const store = this.getAllModifiers(targetTenantId);

    const newMod = {
      id: data.id || `mod_${(data.name || 'modifier').toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
      modifierCode: data.modifierCode || `MOD-${Math.floor(1000 + Math.random() * 9000)}`,
      name: data.name,
      category: data.category || 'MIXER',
      modifierConsumptionType: data.modifierConsumptionType === 'NON_INVENTORY' ? 'NON_INVENTORY' : 'INVENTORY',
      inventoryItemId: data.modifierConsumptionType === 'NON_INVENTORY' ? null : (data.inventoryItemId || null),
      inventoryItemCode: data.modifierConsumptionType === 'NON_INVENTORY' ? null : (data.inventoryItemCode || null),
      quantity: data.modifierConsumptionType === 'NON_INVENTORY' ? 0 : (parseFloat(data.quantity) || 0),
      uom: data.modifierConsumptionType === 'NON_INVENTORY' ? null : (data.uom || 'ML'),
      additionalPrice: parseFloat(data.additionalPrice) || 0,
      active: true,
      tenantId: targetTenantId,
      createdAt: new Date().toISOString()
    };

    store.push(newMod);
    offlineStore.setCollection('modifier_boms', store);
    return newMod;
  }

  /**
   * Resolve an array of modifier IDs into explicit consumption lines
   * @param {Array<string>} modifierIds 
   * @param {string|null} tenantId 
   * @returns {Array<{ modifierId: string, name: string, type: 'INVENTORY'|'NON_INVENTORY', inventoryItemId: string|null, quantity: number, uom: string|null }>}
   */
  resolveModifiers(modifierIds = [], tenantId = null) {
    if (!Array.isArray(modifierIds) || modifierIds.length === 0) return [];
    
    const resolvedLines = [];
    modifierIds.forEach(id => {
      const mod = this.getModifierById(id, tenantId);
      if (mod) {
        resolvedLines.push({
          modifierId: mod.id,
          modifierCode: mod.modifierCode,
          name: mod.name,
          modifierConsumptionType: mod.modifierConsumptionType,
          inventoryItemId: mod.inventoryItemId,
          inventoryItemCode: mod.inventoryItemCode,
          quantity: mod.quantity || 0,
          uom: mod.uom || null,
          additionalPrice: mod.additionalPrice || 0
        });
      }
    });

    return resolvedLines;
  }
}

export const modifierBomModel = new ModifierBomModel();
