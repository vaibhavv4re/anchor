/**
 * BusinessOS Platform - Reusable Modifier Group Registry (F8.3-B)
 * Groups reusable mixers, garnishes, and serving styles for Bar & Kitchen items.
 * Integrates with modifierBomModel.js to resolve modifier consumption.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { modifierBomModel } from './modifierBomModel.js';

class ModifierGroupModel {
  constructor() {
    this._initSeedGroups();
  }

  _getCanonicalGroups() {
    return [
      {
        id: 'modgrp_mixers',
        groupCode: 'GRP-MIX-01',
        name: 'Mixers & Soft Drinks',
        description: 'Selectable soda, tonic, lime splash, or neat water for spirit pours',
        minSelection: 0,
        maxSelection: 2,
        required: false,
        modifierIds: ['mod_soda_100ml', 'mod_tonic_150ml', 'mod_lime_water_20ml', 'mod_water_neat'],
        active: true,
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'modgrp_serve_style',
        groupCode: 'GRP-STY-01',
        name: 'Serving Style & Ice',
        description: 'On the Rocks, Neat, or Chilled',
        minSelection: 0,
        maxSelection: 1,
        required: false,
        modifierIds: ['mod_water_neat', 'mod_ice_rocks'],
        active: true,
        tenantId: 'tenant_h0qc7wf'
      }
    ];
  }

  _initSeedGroups() {
    const store = offlineStore.getCollection('modifier_groups');
    if (!store || !Array.isArray(store) || store.length === 0) {
      offlineStore.setCollection('modifier_groups', this._getCanonicalGroups());
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

  getAllGroups(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    let store = offlineStore.getCollection('modifier_groups') || [];
    if (!Array.isArray(store) || store.length === 0) {
      store = this._getCanonicalGroups();
      offlineStore.setCollection('modifier_groups', store);
    }
    return store.filter(g => !targetTenantId || g.tenantId === targetTenantId || g.tenant_id === targetTenantId);
  }

  getGroupById(groupId, tenantId = null) {
    const groups = this.getAllGroups(tenantId);
    return groups.find(g => g.id === groupId || g.groupCode === groupId) || null;
  }

  createGroup(data, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const store = this.getAllGroups(targetTenantId);

    const newGroup = {
      id: data.id || `modgrp_${(data.name || 'group').toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
      groupCode: data.groupCode || `GRP-${Math.floor(1000 + Math.random() * 9000)}`,
      name: data.name,
      description: data.description || '',
      minSelection: parseInt(data.minSelection) || 0,
      maxSelection: parseInt(data.maxSelection) || 1,
      required: Boolean(data.required),
      modifierIds: Array.isArray(data.modifierIds) ? data.modifierIds : [],
      active: true,
      tenantId: targetTenantId,
      createdAt: new Date().toISOString()
    };

    store.push(newGroup);
    offlineStore.setCollection('modifier_groups', store);
    return newGroup;
  }

  /**
   * Get full expanded modifiers for a group
   * @param {string} groupId 
   * @param {string|null} tenantId 
   * @returns {Array<Object>}
   */
  getGroupModifiers(groupId, tenantId = null) {
    const group = this.getGroupById(groupId, tenantId);
    if (!group || !Array.isArray(group.modifierIds)) return [];

    return group.modifierIds.map(modId => modifierBomModel.getModifierById(modId, tenantId)).filter(Boolean);
  }
}

export const modifierGroupModel = new ModifierGroupModel();
