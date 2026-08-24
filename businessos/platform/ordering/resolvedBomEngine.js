/**
 * BusinessOS Platform - Resolved BOM Engine (PD-010 / K-08 / PD-033)
 * Decouples Inventory Engine from Menu/POS concepts.
 * Resolves exact raw materials, prep items, and packaging containers for any ordered line item
 * based on Variant BOMs (Independent or Derived), Ingredient Overrides, Modifier BOMs, and BOM Versioning.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { recipeModel } from '../kitchen/recipeModel.js';

class ResolvedBomEngine {
  /**
   * Resolves the complete inventory consumption snapshot for an ordered line item.
   * @param {Object} lineItem { itemId, itemCode, variantId, selectedModifiers, quantity }
   * @param {string|null} tenantId 
   * @returns {Object} { orderLineId, menuItemId, variantId, quantity, bomVersionId, consumption: Array<Object> }
   */
  resolveOrderLineBOM(lineItem, tenantId = null) {
    const targetTenantId = tenantId || (typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}').tenantId : null) || 'tenant_h0qc7wf';
    
    const itemId = lineItem.itemId || lineItem.itemCode || lineItem.id;
    const variantId = lineItem.variantId || lineItem.variantCode || null;
    const orderQty = parseFloat(lineItem.quantity || lineItem.qty || 1);
    const selectedModifiers = Array.isArray(lineItem.selectedModifiers) ? lineItem.selectedModifiers : [];

    const menuItems = offlineStore.getCollection('kitchen_menu_items', targetTenantId) || [];
    const menuItem = menuItems.find(m => m.id === itemId || m.itemCode === itemId || m.item_code === itemId) || null;

    const recipes = offlineStore.getCollection('recipes', targetTenantId) || [];
    const boms = offlineStore.getCollection('bom_headers', targetTenantId) || [];
    const bomLinesStore = offlineStore.getCollection('bom_lines', targetTenantId) || [];
    const modifiersStore = offlineStore.getCollection('modifier_definitions', targetTenantId) || [];

    const consumption = [];
    let activeBomVersionId = 'v1.0';

    // 1. RESOLVE VARIANT / BASE BOM
    let variantObj = null;
    if (menuItem && Array.isArray(menuItem.variants)) {
      variantObj = menuItem.variants.find(v => v.variantId === variantId || v.variantCode === variantId || v.variantName === variantId);
    }

    // Find direct BOM Header
    let bomHeader = boms.find(b => b.status === 'ACTIVE' && (
      (variantId && (b.variantId === variantId || b.variantCode === variantId)) ||
      (b.menuItemId === itemId || b.menuItemCode === itemId)
    ));

    // Fallback: Check recipeModel recipes collection
    let recipe = null;
    if (!bomHeader) {
      recipe = recipes.find(r => 
        r.status === 'APPROVED' && (
          r.menuItemId === itemId || r.menuItemCode === itemId || r.id === menuItem?.recipeId
        )
      ) || recipes[0];
      if (recipe) activeBomVersionId = recipe.version || recipe.recipeVersion || 'v1.0';
    } else {
      activeBomVersionId = bomHeader.version || 'v1.0';
    }

    // Step A: Process Variant / Base Ingredients
    if (bomHeader) {
      const isDerived = bomHeader.bomMode === 'DERIVED';
      const isIndependent = bomHeader.bomMode === 'INDEPENDENT' || !isDerived;
      const scalingFactor = isDerived ? (parseFloat(bomHeader.scalingFactor) || 1.0) : 1.0;
      const lines = bomLinesStore.filter(l => l.bomId === bomHeader.id);

      lines.forEach(l => {
        const itemType = l.itemType || 'RAW_MATERIAL';
        const overrideFactor = parseFloat(l.overrideFactor || l.ingredient_override_factor) || 1.0;
        const qtyPerPortion = (parseFloat(l.quantity) || 0) * (isDerived ? (scalingFactor * overrideFactor) : 1.0);
        const totalQty = parseFloat((qtyPerPortion * orderQty).toFixed(4));

        if (totalQty > 0) {
          consumption.push({
            inventoryItemCode: l.inventoryItemCode || l.itemCode,
            inventoryItemName: l.inventoryItemName || l.itemName || l.inventoryItemCode,
            itemType,
            quantity: totalQty,
            uom: (l.uom || 'KG').toUpperCase(),
            source: itemType === 'PACKAGING' ? 'PACKAGING_BOM' : 'VARIANT_BOM',
            bomVersionId: activeBomVersionId
          });
        }
      });
    } else if (recipe) {
      const rawIngredients = recipe.ingredients || recipe.data?.ingredients || recipe.costSnapshotAtApproval?.linesSnapshot || [];
      const isDerived = variantObj && variantObj.bomMode === 'DERIVED';
      const scalingFactor = isDerived ? (parseFloat(variantObj.scalingFactor) || 1.0) : 1.0;

      rawIngredients.forEach(ing => {
        const ingCode = String(ing.inventoryItemCode || ing.inventory_item_code || ing.itemCode || '');
        const ingName = ing.inventoryItemName || ing.inventory_item_name || ing.itemName || ingCode;
        const itemType = ing.itemType || ing.item_type || 'RAW_MATERIAL';
        
        let qtyPerPortion = parseFloat(ing.quantity || ing.grossQuantity || 0);
        if (!qtyPerPortion && ing.recipeQty) {
          const rQty = parseFloat(ing.recipeQty);
          const rUom = String(ing.recipeUom || ing.uom || 'G').toUpperCase();
          qtyPerPortion = (rUom === 'G' || rUom === 'ML') ? (rQty / 1000) : rQty;
        }

        const totalQty = parseFloat((qtyPerPortion * scalingFactor * orderQty).toFixed(4));

        if (totalQty > 0 && ingCode) {
          consumption.push({
            inventoryItemCode: ingCode,
            inventoryItemName: ingName,
            itemType,
            quantity: totalQty,
            uom: (ing.uom || 'KG').toUpperCase(),
            source: itemType === 'PACKAGING' ? 'PACKAGING_BOM' : 'VARIANT_BOM',
            bomVersionId: activeBomVersionId
          });
        }
      });
    }

    // Step B: Process Packaging BOM Items attached to Variant
    if (variantObj && Array.isArray(variantObj.packagingBom)) {
      variantObj.packagingBom.forEach(pkg => {
        const pkgQty = (parseFloat(pkg.quantity) || 1) * orderQty;
        consumption.push({
          inventoryItemCode: pkg.inventoryItemCode || pkg.itemCode,
          inventoryItemName: pkg.inventoryItemName || pkg.name || pkg.inventoryItemCode,
          itemType: 'PACKAGING',
          quantity: parseFloat(pkgQty.toFixed(4)),
          uom: (pkg.uom || 'PCS').toUpperCase(),
          source: 'PACKAGING_BOM',
          bomVersionId: activeBomVersionId
        });
      });
    }

    // Step C: Process Active Modifiers & Modifier BOMs
    selectedModifiers.forEach(mod => {
      const modId = typeof mod === 'string' ? mod : (mod.modifierId || mod.id || mod.name);
      const modDef = modifiersStore.find(m => m.modifierId === modId || m.name === modId || m.modifierName === modId);
      const modQty = (typeof mod === 'object' && mod.quantity) ? parseFloat(mod.quantity) : 1;

      // Applicability check: if modifier specifies applicableItems, verify item match
      if (modDef && Array.isArray(modDef.applicableItems) && modDef.applicableItems.length > 0) {
        if (!modDef.applicableItems.includes(itemId)) return; // Skip if not applicable
      }

      const modBomLines = modDef ? (modDef.modifierBom || modDef.bomLines || []) : [];
      modBomLines.forEach(mLine => {
        const qtyPerMod = parseFloat(mLine.quantity) || 0;
        const totalModQty = parseFloat((qtyPerMod * modQty * orderQty).toFixed(4));
        if (totalModQty > 0) {
          consumption.push({
            inventoryItemCode: mLine.inventoryItemCode || mLine.itemCode,
            inventoryItemName: mLine.inventoryItemName || mLine.itemName || mLine.inventoryItemCode,
            itemType: mLine.itemType || 'RAW_MATERIAL',
            quantity: totalModQty,
            uom: (mLine.uom || 'KG').toUpperCase(),
            source: 'MODIFIER_BOM',
            bomVersionId: modDef.version || activeBomVersionId
          });
        }
      });
    });

    return {
      orderLineId: lineItem.lineItemId || lineItem.itemId,
      menuItemId: itemId,
      variantId: variantId || 'default',
      variantName: variantObj ? variantObj.variantName : 'Standard',
      quantity: orderQty,
      bomVersionId: activeBomVersionId,
      consumption
    };
  }
}

export const resolvedBomEngine = new ResolvedBomEngine();
