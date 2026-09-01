/**
 * BusinessOS Platform - Restaurant Data Health & Readiness Audit Service (F9.6)
 * Gatekeeper checking tenant setup completeness, recipe coverage %, BOM-to-Inventory links,
 * and operational readiness status (READY FOR LIVE SERVICE SIMULATION).
 */

import { offlineStore } from '../offline_store/offlineStore.js';

export const READINESS_STATUS = {
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  CONFIGURED_NOT_READY: 'CONFIGURED — NOT READY FOR LIVE SIMULATION',
  READY_FOR_SIMULATION: 'READY FOR LIVE SERVICE SIMULATION'
};

export class DataReadinessAuditService {
  /**
   * Evaluates restaurant data health scorecard and status for tenant.
   * @param {string} tenantId 
   * @returns {Object} Scorecard { metrics, warnings, status, readyForSimulation }
   */
  evaluateReadiness(tenantId = 'tenant-demo') {
    const inventoryItems = offlineStore.getCollection('inventory_items') || [];
    const foodMenuItems = offlineStore.getCollection('food_menu_items') || [];
    const barMenuItems = offlineStore.getCollection('bar_menu_items') || [];
    const variants = offlineStore.getCollection('menu_variants') || [];
    const recipes = offlineStore.getCollection('recipes') || [];
    const suppliers = offlineStore.getCollection('suppliers') || [];
    const stockLedger = offlineStore.getCollection('stock_ledger') || [];

    const warnings = [];

    // 1. Inventory Metric
    const totalInventory = inventoryItems.length;
    const invStatus = totalInventory > 0 ? '🟢' : '🔴';
    if (totalInventory === 0) warnings.push('No inventory items found in Inventory Master.');

    // 2. Menu Metrics
    const totalFood = foodMenuItems.length;
    const totalBar = barMenuItems.length;
    const totalVariants = variants.length;

    // 3. Recipe Coverage Metric
    const variantsWithRecipe = variants.filter(v => {
      if (!v.recipeCode) return false;
      return recipes.some(r => r.recipeCode === v.recipeCode);
    });

    const unmappedVariants = variants.filter(v => !v.recipeCode || !recipes.some(r => r.recipeCode === v.recipeCode));
    unmappedVariants.forEach(v => {
      warnings.push(`Menu variant "${v.variantCode}" (${v.variantName}) has no linked recipe.`);
    });

    const recipeCoveragePct = totalVariants > 0 ? Math.round((variantsWithRecipe.length / totalVariants) * 100) : 0;

    // 4. BOM -> Inventory Link Metric
    const inventoryCodes = new Set(inventoryItems.map(i => i.itemCode));
    let validBomCount = 0;
    let totalIngredientsCount = 0;

    recipes.forEach(r => {
      const ingredients = r.ingredients || [];
      ingredients.forEach(ing => {
        totalIngredientsCount++;
        if (inventoryCodes.has(ing.ingredientCode)) {
          validBomCount++;
        } else {
          warnings.push(`Recipe "${r.recipeCode}" references missing inventory item "${ing.ingredientCode}".`);
        }
      });
    });

    const bomToInventoryPct = totalIngredientsCount > 0 ? Math.round((validBomCount / totalIngredientsCount) * 100) : 100;

    // 5. Supplier Mapping Metric
    const mappedSuppliers = inventoryItems.filter(i => i.preferredSupplierCode && suppliers.some(s => s.supplierCode === i.preferredSupplierCode));
    const supplierMappingPct = totalInventory > 0 ? Math.round((mappedSuppliers.length / totalInventory) * 100) : 0;

    // 6. Opening Stock Metric
    const stockableItems = inventoryItems.filter(i => i.isStockable !== false);
    const stockItemCodes = new Set(stockLedger.map(s => s.itemCode));
    const itemsWithStock = stockableItems.filter(i => stockItemCodes.has(i.itemCode));
    const openingStockPct = stockableItems.length > 0 ? Math.round((itemsWithStock.length / stockableItems.length) * 100) : 0;

    const unstocked = stockableItems.filter(i => !stockItemCodes.has(i.itemCode));
    if (unstocked.length > 0) {
      warnings.push(`${unstocked.length} stockable inventory items have no opening stock recorded.`);
    }

    // 7. Overall Readiness Status
    let status = READINESS_STATUS.NOT_CONFIGURED;
    let readyForSimulation = false;

    if (totalInventory > 0 && (totalFood > 0 || totalBar > 0)) {
      if (recipeCoveragePct >= 90 && bomToInventoryPct === 100 && totalVariants > 0) {
        status = READINESS_STATUS.READY_FOR_SIMULATION;
        readyForSimulation = true;
      } else {
        status = READINESS_STATUS.CONFIGURED_NOT_READY;
      }
    }

    return {
      tenantId,
      timestamp: new Date().toISOString(),
      status,
      readyForSimulation,
      metrics: {
        inventoryMaster: { count: totalInventory, status: invStatus },
        foodMenu: { count: totalFood, status: totalFood > 0 ? '🟢' : '🔴' },
        barMenu: { count: totalBar, status: totalBar > 0 ? '🟢' : '⚪' },
        variants: { count: totalVariants, status: totalVariants > 0 ? '🟢' : '🔴' },
        recipes: { count: recipes.length, coveragePercent: recipeCoveragePct, status: recipeCoveragePct >= 90 ? '🟢' : '🟡' },
        bomToInventoryLink: { percent: bomToInventoryPct, status: bomToInventoryPct === 100 ? '🟢' : '🔴' },
        suppliers: { count: suppliers.length, mappingPercent: supplierMappingPct, status: '🟢' },
        openingStock: { percent: openingStockPct, status: openingStockPct >= 80 ? '🟢' : '🟡' }
      },
      warnings
    };
  }
}

export const dataReadinessAuditService = new DataReadinessAuditService();
