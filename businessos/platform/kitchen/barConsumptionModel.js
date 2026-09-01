/**
 * BusinessOS Platform - Bar Item Consumption Definition & Resolver Engine (F8.3-A)
 * 
 * Manages Bar Consumption Definitions cleanly isolated from conventional multi-ingredient recipes.
 * Supports 4 Consumption Models:
 *   1. POUR: Single spirit/beverage pour (e.g. Glenfiddich 60 ML)
 *   2. UNIT: Sealed bottle / can (e.g. Kingfisher 650 ML / Coke Can)
 *   3. RECIPE: Multi-ingredient cocktail/mocktail pour BOM (links to recipeModel.js)
 *   4. COMPOSITE: Base definition + attached reusable mixer modifiers
 * 
 * CORE INVARIANT:
 * Inventory never knows whether consumption came from a POUR, UNIT, RECIPE or MODIFIER.
 * It strictly receives the explicit Resolved Consumption Lines.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { recipeModel } from './recipeModel.js';
import { modifierBomModel } from './modifierBomModel.js';
import { inventoryItemModel } from '../inventory/inventoryItemModel.js';

class BarConsumptionModel {
  constructor() {
    this._initSeedDefinitions();
  }

  _getCanonicalDefinitions() {
    return [
      // GLENFIDDICH 12 YR VARIANTS (POUR)
      {
        id: 'cdef_glenfiddich_30ml',
        menuItemId: 'item_glenfiddich_12',
        variantId: 'var_glenfiddich_30ml',
        variantName: '30 ml',
        consumptionType: 'POUR',
        inventoryItemId: 'invitem_whisky_glenfiddich',
        inventoryItemCode: 'BAR-WKY-01',
        quantity: 30,
        uom: 'ML',
        status: 'CONFIGURED',
        tenantId: 'tenant_h0qc7wf'
      },
      {
        id: 'cdef_glenfiddich_60ml',
        menuItemId: 'item_glenfiddich_12',
        variantId: 'var_glenfiddich_60ml',
        variantName: '60 ml',
        consumptionType: 'POUR',
        inventoryItemId: 'invitem_whisky_glenfiddich',
        inventoryItemCode: 'BAR-WKY-01',
        quantity: 60,
        uom: 'ML',
        status: 'CONFIGURED',
        tenantId: 'tenant_h0qc7wf'
      },
      // DON JULIO TEQUILA (POUR)
      {
        id: 'cdef_donjulio_45ml',
        menuItemId: 'item_don_julio',
        variantId: 'var_don_julio_45ml',
        variantName: '45 ml',
        consumptionType: 'POUR',
        inventoryItemId: 'invitem_tequila_donjulio',
        inventoryItemCode: 'BAR-TEQ-01',
        quantity: 45,
        uom: 'ML',
        status: 'CONFIGURED',
        tenantId: 'tenant_h0qc7wf'
      },
      // KINGFISHER PREMIUM BEER (UNIT)
      {
        id: 'cdef_beer_kf_650ml',
        menuItemId: 'item_kf_beer',
        variantId: 'var_kf_beer_650ml',
        variantName: '650 ml Bottle',
        consumptionType: 'UNIT',
        inventoryItemId: 'invitem_beer_kf',
        inventoryItemCode: 'BAR-BER-01',
        quantity: 1,
        uom: 'BOTTLE',
        status: 'CONFIGURED',
        tenantId: 'tenant_h0qc7wf'
      }
    ];
  }

  _initSeedDefinitions() {
    const store = offlineStore.getCollection('bar_consumption_definitions');
    if (!store || !Array.isArray(store) || store.length === 0) {
      offlineStore.setCollection('bar_consumption_definitions', this._getCanonicalDefinitions());
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

  getAllDefinitions(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    let store = offlineStore.getCollection('bar_consumption_definitions') || [];
    if (!Array.isArray(store) || store.length === 0) {
      store = this._getCanonicalDefinitions();
      offlineStore.setCollection('bar_consumption_definitions', store);
    }
    return store.filter(d => !targetTenantId || d.tenantId === targetTenantId || d.tenant_id === targetTenantId);
  }

  getDefinitionForVariant(menuItemId, variantId, tenantId = null) {
    const defs = this.getAllDefinitions(tenantId);
    return defs.find(d => 
      (d.menuItemId === menuItemId || d.menu_item_id === menuItemId) &&
      (d.variantId === variantId || d.variant_id === variantId)
    ) || null;
  }

  /**
   * Create or Update a POUR Consumption Definition
   */
  setPourDefinition(data, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const defs = this.getAllDefinitions(targetTenantId);

    const existingIdx = defs.findIndex(d => 
      (d.menuItemId === data.menuItemId || d.menu_item_id === data.menuItemId) &&
      (d.variantId === data.variantId || d.variant_id === data.variantId)
    );

    const masterItem = inventoryItemModel.getItemById(data.inventoryItemId, targetTenantId);

    const defRecord = {
      id: existingIdx !== -1 ? defs[existingIdx].id : `cdef_${Math.random().toString(36).substring(2, 9)}`,
      menuItemId: data.menuItemId,
      variantId: data.variantId,
      variantName: data.variantName || 'Regular',
      consumptionType: 'POUR',
      inventoryItemId: data.inventoryItemId,
      inventoryItemCode: masterItem ? (masterItem.itemCode || masterItem.sku) : (data.inventoryItemCode || null),
      inventoryItemName: masterItem ? masterItem.name : (data.inventoryItemName || 'Spirit Pour'),
      quantity: parseFloat(data.quantity || data.pourSizeQuantity) || 30,
      uom: data.uom || data.pourSizeUom || 'ML',
      status: 'CONFIGURED',
      tenantId: targetTenantId,
      updatedAt: new Date().toISOString()
    };

    if (existingIdx !== -1) {
      defs[existingIdx] = defRecord;
    } else {
      defs.push(defRecord);
    }

    offlineStore.setCollection('bar_consumption_definitions', defs);
    return defRecord;
  }

  /**
   * Create or Update a UNIT Consumption Definition
   */
  setUnitDefinition(data, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const defs = this.getAllDefinitions(targetTenantId);

    const existingIdx = defs.findIndex(d => 
      (d.menuItemId === data.menuItemId || d.menu_item_id === data.menuItemId) &&
      (d.variantId === data.variantId || d.variant_id === data.variantId)
    );

    const masterItem = inventoryItemModel.getItemById(data.inventoryItemId, targetTenantId);

    const defRecord = {
      id: existingIdx !== -1 ? defs[existingIdx].id : `cdef_${Math.random().toString(36).substring(2, 9)}`,
      menuItemId: data.menuItemId,
      variantId: data.variantId,
      variantName: data.variantName || 'Unit',
      consumptionType: 'UNIT',
      inventoryItemId: data.inventoryItemId,
      inventoryItemCode: masterItem ? (masterItem.itemCode || masterItem.sku) : (data.inventoryItemCode || null),
      inventoryItemName: masterItem ? masterItem.name : (data.inventoryItemName || 'Unit Item'),
      quantity: parseFloat(data.quantity || data.unitQuantity) || 1,
      uom: data.uom || data.unitUom || 'BOTTLE',
      status: 'CONFIGURED',
      tenantId: targetTenantId,
      updatedAt: new Date().toISOString()
    };

    if (existingIdx !== -1) {
      defs[existingIdx] = defRecord;
    } else {
      defs.push(defRecord);
    }

    offlineStore.setCollection('bar_consumption_definitions', defs);
    return defRecord;
  }

  /**
   * THE CORE RESOLVER: Computes the explicit Resolved Consumption Object before anything touches inventory.
   * Combine Base Consumption Definition (POUR / UNIT / RECIPE) + Selected Reusable Modifiers.
   * 
   * @param {Object} params
   * @param {string} params.menuItemId
   * @param {string} params.variantId
   * @param {Array<string>} [params.selectedModifierIds]
   * @param {string} [params.locationId] Defaults to 'BAR'
   * @param {string} [params.sourceType] Defaults to 'BOT'
   * @param {string} [params.sourceId]
   * @param {string} [params.tenantId]
   * @returns {Object} Explicit Resolved Consumption Object
   */
  resolveConsumption(params = {}) {
    const { menuItemId, variantId, selectedModifierIds = [], locationId = 'BAR', sourceType = 'BOT', sourceId = 'BOT-DEFAULT', tenantId = null } = params;
    const targetTenantId = this._getTenantId(tenantId);

    const resolvedLines = [];
    const nonInventoryLines = [];
    let derivedConsumptionType = 'POUR';

    // 1. Check for dedicated Bar Consumption Definition (POUR or UNIT)
    const def = this.getDefinitionForVariant(menuItemId, variantId, targetTenantId);

    if (def && (def.consumptionType === 'POUR' || def.consumptionType === 'UNIT')) {
      derivedConsumptionType = def.consumptionType;
      const masterItem = inventoryItemModel.getItemById(def.inventoryItemId, targetTenantId);
      
      resolvedLines.push({
        inventoryItemId: def.inventoryItemId,
        inventoryItemCode: def.inventoryItemCode || (masterItem ? masterItem.itemCode : null),
        inventoryItemName: def.inventoryItemName || (masterItem ? masterItem.name : 'Base Item'),
        quantity: parseFloat(def.quantity) || 0,
        uom: def.uom || 'ML',
        lineType: 'BASE'
      });
    } else {
      // 2. Fallback to RECIPE BOM in recipeModel.js
      const recipes = recipeModel.getAllRecipes(targetTenantId) || [];
      const recipe = recipes.find(r => 
        (r.menuItemId === menuItemId || r.menu_item_id === menuItemId) &&
        (r.variantId === variantId || r.variant_id === variantId || !variantId) &&
        (r.status === 'PUBLISHED' || r.status === 'APPROVED' || r.status === 'DRAFT')
      );

      if (recipe && Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
        derivedConsumptionType = 'RECIPE';
        recipe.ingredients.forEach(ing => {
          const masterItem = inventoryItemModel.getItemById(ing.inventoryItemId || ing.inventoryItemCode, targetTenantId);
          resolvedLines.push({
            inventoryItemId: ing.inventoryItemId || ing.inventory_item_id || (masterItem ? masterItem.id : null),
            inventoryItemCode: ing.inventoryItemCode || ing.inventory_item_code || (masterItem ? masterItem.itemCode : null),
            inventoryItemName: ing.inventoryItemName || ing.inventory_item_name || (masterItem ? masterItem.name : 'Recipe Ingredient'),
            quantity: parseFloat(ing.quantity) || 0,
            uom: ing.uom || 'ML',
            lineType: 'BASE_RECIPE'
          });
        });
      }
    }

    // 3. Resolve Modifiers (INVENTORY vs NON_INVENTORY)
    if (Array.isArray(selectedModifierIds) && selectedModifierIds.length > 0) {
      if (derivedConsumptionType === 'POUR') derivedConsumptionType = 'COMPOSITE';
      const resolvedMods = modifierBomModel.resolveModifiers(selectedModifierIds, targetTenantId);

      resolvedMods.forEach(mod => {
        if (mod.modifierConsumptionType === 'INVENTORY' && mod.inventoryItemId) {
          const masterItem = inventoryItemModel.getItemById(mod.inventoryItemId, targetTenantId);
          resolvedLines.push({
            inventoryItemId: mod.inventoryItemId,
            inventoryItemCode: mod.inventoryItemCode || (masterItem ? masterItem.itemCode : null),
            inventoryItemName: masterItem ? masterItem.name : mod.name,
            quantity: parseFloat(mod.quantity) || 0,
            uom: mod.uom || 'ML',
            lineType: 'MODIFIER',
            modifierId: mod.modifierId
          });
        } else {
          // Explicit NON_INVENTORY line (e.g. Water / Neat)
          nonInventoryLines.push({
            modifierId: mod.modifierId,
            modifierCode: mod.modifierCode,
            name: mod.name,
            lineType: 'NON_INVENTORY'
          });
        }
      });
    }

    return {
      menuItemId,
      variantId,
      consumptionType: derivedConsumptionType,
      locationId: locationId || 'BAR',
      sourceType: sourceType || 'BOT',
      sourceId: sourceId || 'BOT-DEFAULT',
      resolvedAt: new Date().toISOString(),
      resolvedLines,
      nonInventoryLines
    };
  }
}

export const barConsumptionModel = new BarConsumptionModel();
