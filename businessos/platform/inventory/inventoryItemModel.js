/**
 * BusinessOS Platform - Inventory Control Item Master (F3.0.1)
 * Defines master raw materials, packaging, and beverage inventory items.
 * Handles unit normalization (e.g. 350g -> 0.35kg, 1 Cartons -> 10L) and cost tracking.
 */

import { offlineStore } from '../offline_store/offlineStore.js';

class InventoryItemModel {
  constructor() {
    this._initSeedItems();
  }

  _initSeedItems() {
    if (!offlineStore.getCollection('inventory_items')) {
      const initialItems = [
        {
          id: 'invitem_chicken',
          sku: 'RAW-CHK-01',
          name: 'Fresh Chicken Breast',
          category: 'RAW_MATERIAL',
          baseUnit: 'KG',
          purchaseUnit: 'KG',
          conversionFactor: 1.0,
          costingMethod: 'WEIGHTED_AVERAGE',
          currentUnitCost: 420.00,
          reorderLevel: 20.0,
          reorderQuantity: 50.0,
          active: true,
          tenantId: 'tenant_h0qc7wf'
        },
        {
          id: 'invitem_paneer',
          sku: 'RAW-PNR-01',
          name: 'Fresh Dairy Paneer',
          category: 'RAW_MATERIAL',
          baseUnit: 'KG',
          purchaseUnit: 'KG',
          conversionFactor: 1.0,
          costingMethod: 'WEIGHTED_AVERAGE',
          currentUnitCost: 360.00,
          reorderLevel: 10.0,
          reorderQuantity: 25.0,
          active: true,
          tenantId: 'tenant_h0qc7wf'
        },
        {
          id: 'invitem_butter',
          sku: 'RAW-BTR-01',
          name: 'Amul Unsalted Butter',
          category: 'RAW_MATERIAL',
          baseUnit: 'KG',
          purchaseUnit: 'CARTON_10KG',
          conversionFactor: 10.0,
          costingMethod: 'WEIGHTED_AVERAGE',
          currentUnitCost: 520.00,
          reorderLevel: 5.0,
          reorderQuantity: 15.0,
          active: true,
          tenantId: 'tenant_h0qc7wf'
        },
        {
          id: 'invitem_oil',
          sku: 'RAW-OIL-01',
          name: 'Refined Cooking Oil',
          category: 'RAW_MATERIAL',
          baseUnit: 'L',
          purchaseUnit: 'CAN_15L',
          conversionFactor: 15.0,
          costingMethod: 'WEIGHTED_AVERAGE',
          currentUnitCost: 140.00,
          reorderLevel: 30.0,
          reorderQuantity: 60.0,
          active: true,
          tenantId: 'tenant_h0qc7wf'
        },
        {
          id: 'invitem_cream',
          sku: 'RAW-CRM-01',
          name: 'Fresh Cooking Cream',
          category: 'RAW_MATERIAL',
          baseUnit: 'L',
          purchaseUnit: 'PACK_1L',
          conversionFactor: 1.0,
          costingMethod: 'WEIGHTED_AVERAGE',
          currentUnitCost: 210.00,
          reorderLevel: 8.0,
          reorderQuantity: 20.0,
          active: true,
          tenantId: 'tenant_h0qc7wf'
        }
      ];
      offlineStore.setCollection('inventory_items', initialItems);
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

  /**
   * Unit Normalization Helper
   * Converts any unit (e.g. 'G', 'ML', 'BAG_25KG', 'CARTON_10L') to normalized baseUnit ('KG', 'L', etc.)
   */
  normalizeQuantity(quantity, unit, baseUnit) {
    const qty = parseFloat(quantity) || 0;
    const srcUnit = (unit || '').toUpperCase();
    const targetBase = (baseUnit || '').toUpperCase();

    if (srcUnit === targetBase) return qty;

    // Weight conversions
    if (srcUnit === 'G' && targetBase === 'KG') return qty / 1000;
    if (srcUnit === 'KG' && targetBase === 'G') return qty * 1000;
    if (srcUnit === 'BAG_25KG') return qty * 25;
    if (srcUnit === 'CARTON_10KG') return qty * 10;

    // Volume conversions
    if (srcUnit === 'ML' && targetBase === 'L') return qty / 1000;
    if (srcUnit === 'L' && targetBase === 'ML') return qty * 1000;
    if (srcUnit === 'CAN_15L') return qty * 15;
    if (srcUnit === 'PACK_1L') return qty * 1;

    return qty;
  }

  getAllItems(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const store = offlineStore.getCollection('inventory_items') || [];
    return store.filter(i => !targetTenantId || i.tenantId === targetTenantId || i.tenant_id === targetTenantId);
  }

  getItemById(itemId, tenantId = null) {
    const items = this.getAllItems(tenantId);
    return items.find(i => i.id === itemId || i.sku === itemId) || null;
  }

  createItem(itemData, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const store = offlineStore.getCollection('inventory_items') || [];

    const itemId = itemData.id || `invitem_${(itemData.name || 'item').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const newItem = {
      id: itemId,
      sku: itemData.sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      name: itemData.name,
      category: itemData.category || 'RAW_MATERIAL',
      baseUnit: itemData.baseUnit || 'KG',
      purchaseUnit: itemData.purchaseUnit || itemData.baseUnit || 'KG',
      conversionFactor: parseFloat(itemData.conversionFactor) || 1.0,
      costingMethod: 'WEIGHTED_AVERAGE',
      currentUnitCost: parseFloat(itemData.currentUnitCost) || 0,
      reorderLevel: parseFloat(itemData.reorderLevel) || 10,
      reorderQuantity: parseFloat(itemData.reorderQuantity) || 20,
      active: true,
      tenantId: targetTenantId,
      createdAt: new Date().toISOString()
    };

    store.push(newItem);
    offlineStore.setCollection('inventory_items', store);
    return newItem;
  }
}

export const inventoryItemModel = new InventoryItemModel();
