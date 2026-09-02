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

  _getCanonicalSeedItems() {
    return [
      // KITCHEN RAW MATERIALS
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
      },
      {
        id: 'invitem_rice',
        sku: 'RAW-RCE-01',
        name: 'Aged Basmati Rice',
        category: 'RAW_MATERIAL',
        baseUnit: 'KG',
        purchaseUnit: 'BAG_25KG',
        conversionFactor: 25.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 110.00,
        reorderLevel: 40.0,
        reorderQuantity: 100.0,
        active: true,
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'invitem_mutton',
        sku: 'RAW-MTN-01',
        name: 'Mutton Curry Cut',
        category: 'RAW_MATERIAL',
        baseUnit: 'KG',
        purchaseUnit: 'KG',
        conversionFactor: 1.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 750.00,
        reorderLevel: 10.0,
        reorderQuantity: 20.0,
        active: true,
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'invitem_tomato',
        sku: 'RAW-VEG-01',
        name: 'Fresh Red Tomatoes',
        category: 'RAW_MATERIAL',
        baseUnit: 'KG',
        purchaseUnit: 'CRATE_20KG',
        conversionFactor: 20.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 40.00,
        reorderLevel: 15.0,
        reorderQuantity: 40.0,
        active: true,
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'invitem_onion',
        sku: 'RAW-VEG-02',
        name: 'Fresh Red Onions',
        category: 'RAW_MATERIAL',
        baseUnit: 'KG',
        purchaseUnit: 'BAG_50KG',
        conversionFactor: 50.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 35.00,
        reorderLevel: 25.0,
        reorderQuantity: 50.0,
        active: true,
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'invitem_ginger_garlic',
        sku: 'RAW-SPC-01',
        name: 'Garlic & Ginger Paste',
        category: 'RAW_MATERIAL',
        baseUnit: 'KG',
        purchaseUnit: 'KG',
        conversionFactor: 1.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 180.00,
        reorderLevel: 5.0,
        reorderQuantity: 15.0,
        active: true,
        tenantId: 'tenant_h0qc7wf'
      },

      // BAR SPIRITS & BEVERAGES
      {
        id: 'invitem_tequila_donjulio',
        sku: 'BAR-TEQ-01',
        name: 'Don Julio Blanco Tequila 750ml',
        category: 'BAR_SPIRIT',
        baseUnit: 'ML',
        purchaseUnit: 'BOTTLE_750ML',
        conversionFactor: 750.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 3.80,
        reorderLevel: 1500.0,
        reorderQuantity: 4500.0,
        active: true,
        department: 'BAR',
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'invitem_whisky_glenfiddich',
        sku: 'BAR-WKY-01',
        name: 'Glenfiddich 12 Yr Single Malt 750ml',
        category: 'BAR_SPIRIT',
        baseUnit: 'ML',
        purchaseUnit: 'BOTTLE_750ML',
        conversionFactor: 750.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 4.50,
        reorderLevel: 1500.0,
        reorderQuantity: 3750.0,
        active: true,
        department: 'BAR',
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'invitem_whisky_jwblack',
        sku: 'BAR-WKY-02',
        name: 'Johnnie Walker Black Label 750ml',
        category: 'BAR_SPIRIT',
        baseUnit: 'ML',
        purchaseUnit: 'BOTTLE_750ML',
        conversionFactor: 750.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 2.80,
        reorderLevel: 2250.0,
        reorderQuantity: 6000.0,
        active: true,
        department: 'BAR',
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'invitem_gin_bombay',
        sku: 'BAR-GIN-01',
        name: 'Bombay Sapphire Gin 750ml',
        category: 'BAR_SPIRIT',
        baseUnit: 'ML',
        purchaseUnit: 'BOTTLE_750ML',
        conversionFactor: 750.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 2.20,
        reorderLevel: 1500.0,
        reorderQuantity: 3000.0,
        active: true,
        department: 'BAR',
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'invitem_vodka_absolut',
        sku: 'BAR-VDK-01',
        name: 'Absolut Vodka 750ml',
        category: 'BAR_SPIRIT',
        baseUnit: 'ML',
        purchaseUnit: 'BOTTLE_750ML',
        conversionFactor: 750.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 1.90,
        reorderLevel: 1500.0,
        reorderQuantity: 4500.0,
        active: true,
        department: 'BAR',
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'invitem_rum_bacardi',
        sku: 'BAR-RUM-01',
        name: 'Bacardi Superior White Rum 750ml',
        category: 'BAR_SPIRIT',
        baseUnit: 'ML',
        purchaseUnit: 'BOTTLE_750ML',
        conversionFactor: 750.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 1.40,
        reorderLevel: 1500.0,
        reorderQuantity: 3750.0,
        active: true,
        department: 'BAR',
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'invitem_beer_kf',
        sku: 'BAR-BER-01',
        name: 'Kingfisher Premium Beer 650ml',
        category: 'BEVERAGE',
        baseUnit: 'BOTTLE',
        purchaseUnit: 'CASE_24',
        conversionFactor: 24.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 160.00,
        reorderLevel: 24.0,
        reorderQuantity: 72.0,
        active: true,
        department: 'BAR',
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'invitem_beer_corona',
        sku: 'BAR-BER-02',
        name: 'Corona Extra Beer 330ml',
        category: 'BEVERAGE',
        baseUnit: 'BOTTLE',
        purchaseUnit: 'CASE_24',
        conversionFactor: 24.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 220.00,
        reorderLevel: 24.0,
        reorderQuantity: 48.0,
        active: true,
        department: 'BAR',
        tenantId: 'tenant_h0qc7wf'
      },

      // BAR MIXERS & PREP INFUSIONS
      {
        id: 'invitem_lime_juice',
        sku: 'MIX-LME-01',
        name: 'Fresh Lime Juice 1L',
        category: 'BAR_MIXER',
        baseUnit: 'ML',
        purchaseUnit: 'PACK_1L',
        conversionFactor: 1000.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 0.25,
        reorderLevel: 5000.0,
        reorderQuantity: 15000.0,
        active: true,
        department: 'BAR',
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'invitem_sugar_syrup',
        sku: 'MIX-SYP-01',
        name: 'Sugar Syrup 1L',
        category: 'BAR_MIXER',
        baseUnit: 'ML',
        purchaseUnit: 'PACK_1L',
        conversionFactor: 1000.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 0.10,
        reorderLevel: 8000.0,
        reorderQuantity: 25000.0,
        active: true,
        department: 'BAR',
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'invitem_tonic_water',
        sku: 'MIX-TNC-01',
        name: 'Schweppes Tonic Water Cans 250ml',
        category: 'BAR_MIXER',
        baseUnit: 'CAN',
        purchaseUnit: 'CASE_24',
        conversionFactor: 24.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 40.00,
        reorderLevel: 24.0,
        reorderQuantity: 72.0,
        active: true,
        department: 'BAR',
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'invitem_club_soda',
        sku: 'MIX-SDA-01',
        name: 'Kinley Club Soda Cans 250ml',
        category: 'BAR_MIXER',
        baseUnit: 'CAN',
        purchaseUnit: 'CASE_24',
        conversionFactor: 24.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 20.00,
        reorderLevel: 48.0,
        reorderQuantity: 120.0,
        active: true,
        department: 'BAR',
        tenantId: 'tenant_h0qc7wf'
      },

      // PACKAGING & OPERATING SUPPLIES
      {
        id: 'invitem_meal_box',
        sku: 'PKG-BOX-01',
        name: '3-Compartment Meal Box 1000ml',
        category: 'PACKAGING',
        baseUnit: 'PC',
        purchaseUnit: 'CARTON_500',
        conversionFactor: 500.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 8.50,
        reorderLevel: 100.0,
        reorderQuantity: 500.0,
        active: true,
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'invitem_carry_bags',
        sku: 'PKG-BAG-01',
        name: 'Eco Paper Carry Bags Large',
        category: 'PACKAGING',
        baseUnit: 'PC',
        purchaseUnit: 'PACK_100',
        conversionFactor: 100.0,
        costingMethod: 'WEIGHTED_AVERAGE',
        currentUnitCost: 3.20,
        reorderLevel: 200.0,
        reorderQuantity: 1000.0,
        active: true,
        tenantId: 'tenant_h0qc7wf'
      }
    ];
  }

  _initSeedItems() {
    const canonical = this._getCanonicalSeedItems();
    const store = offlineStore.getCollection('inventory_items');

    if (!store || !Array.isArray(store) || store.length < canonical.length) {
      offlineStore.setCollection('inventory_items', canonical);
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
    let store = [];

    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      const cached = window.__APP__.platform.dataGateway.getCachedCollection('inventory', targetTenantId);
      if (Array.isArray(cached) && cached.length > 0) store = cached;
    }

    if (store.length === 0) {
      store = offlineStore.getCollection('inventory', targetTenantId) || [];
    }

    if (!Array.isArray(store) || store.length === 0) {
      store = offlineStore.getCollection('inventory_items', targetTenantId) || [];
    }

    if (!Array.isArray(store) || store.length === 0) {
      store = this._getCanonicalSeedItems();
      offlineStore.setCollection('inventory_items', store);
      offlineStore.setCollection('inventory', store);
    }

    // Normalize items for consistent property access (itemName/name, itemCode/sku/id, currentUnitCost/unitValuation)
    const normalized = store.map(i => ({
      id: i.id || i.uuid || i.itemCode || i.item_code,
      sku: i.sku || i.itemCode || i.item_code || i.id,
      itemCode: i.itemCode || i.item_code || i.sku || i.id,
      name: i.name || i.itemName || i.item_name || 'Untitled Item',
      itemName: i.itemName || i.item_name || i.name || 'Untitled Item',
      category: i.category || i.categoryName || i.category_name || 'RAW_MATERIAL',
      baseUnit: i.baseUnit || i.baseUom || i.base_uom || 'KG',
      purchaseUnit: i.purchaseUnit || i.purchase_unit || i.baseUnit || 'KG',
      currentUnitCost: parseFloat(i.currentUnitCost || i.unitValuation || i.unit_valuation || i.lastPurchasePrice || 0),
      weightedAverageCost: parseFloat(i.currentUnitCost || i.unitValuation || i.unit_valuation || i.lastPurchasePrice || 0),
      reorderLevel: parseFloat(i.reorderLevel || i.reorder_level || 10),
      reorderQuantity: parseFloat(i.reorderQuantity || i.reorder_quantity || 20),
      active: i.active !== undefined ? i.active : true,
      tenantId: i.tenantId || i.tenant_id || targetTenantId
    }));

    return normalized.filter(i => !targetTenantId || i.tenantId === targetTenantId || i.tenant_id === targetTenantId);
  }

  getItemById(itemId, tenantId = null) {
    const items = this.getAllItems(tenantId);
    return items.find(i => i.id === itemId || i.sku === itemId || i.name === itemId) || null;
  }

  createItem(itemData, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const store = this.getAllItems(targetTenantId);

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

  _getDataGateway() {
    if (this.dataGateway) return this.dataGateway;
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      return window.__APP__.platform.dataGateway;
    }
    return null;
  }

  /**
   * Controlled Update for Inventory Master Item.
   * Enforces immutable itemCode policy, logs field-level audit changeHistory,
   * and syncs directly to Supabase Cloud storage via DataGateway.
   */
  async updateItem(itemCode, updates = {}, userContext = 'Inventory Manager', tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    let store = offlineStore.getCollection('inventory') || [];
    if (!Array.isArray(store) || store.length === 0) {
      store = offlineStore.getCollection('inventory_items') || [];
    }

    const idx = store.findIndex(i => (i.itemCode || i.item_code || i.sku || i.id || '').toUpperCase() === (itemCode || '').toUpperCase());
    if (idx === -1) {
      throw new Error(`Master inventory item "${itemCode}" not found.`);
    }

    const existing = store[idx];
    const changeHistory = Array.isArray(existing.changeHistory) ? [...existing.changeHistory] : [];
    const fieldChanges = [];

    const fieldLabels = {
      itemName: 'Item Name',
      item_name: 'Item Name',
      itemType: 'Item Type',
      item_type: 'Item Type',
      categoryCode: 'Category Code',
      category_code: 'Category Code',
      baseUom: 'Base UOM',
      base_uom: 'Base UOM',
      purchaseUom: 'Purchase UOM',
      purchase_uom: 'Purchase UOM',
      conversionFactor: 'Conversion Factor',
      reorderLevel: 'Reorder Level',
      reorder_level: 'Reorder Level',
      active: 'Status (Active/Inactive)'
    };

    Object.keys(updates).forEach(key => {
      if (key === 'itemCode' || key === 'item_code' || key === 'id') return; // IMMUTABLE
      const oldVal = existing[key];
      const newVal = updates[key];
      if (newVal !== undefined && oldVal !== newVal) {
        fieldChanges.push({
          timestamp: new Date().toISOString(),
          field: fieldLabels[key] || key,
          previousValue: oldVal !== undefined ? String(oldVal) : 'N/A',
          newValue: String(newVal),
          changedBy: userContext
        });
      }
    });

    const updatedRecord = {
      ...existing,
      ...updates,
      itemCode: existing.itemCode || existing.item_code || itemCode, // IMMUTABLE LATCH
      item_code: existing.item_code || existing.itemCode || itemCode, // IMMUTABLE LATCH
      changeHistory: [...fieldChanges, ...changeHistory],
      updatedAt: new Date().toISOString()
    };

    store[idx] = updatedRecord;
    offlineStore.setCollection('inventory', store);
    offlineStore.setCollection('inventory_items', store);

    const gw = this._getDataGateway();
    if (gw && typeof gw.update === 'function') {
      await gw.update('inventory', existing.id || itemCode, updatedRecord);
    }

    return updatedRecord;
  }
}

export const inventoryItemModel = new InventoryItemModel();
