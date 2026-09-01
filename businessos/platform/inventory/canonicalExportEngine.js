/**
 * BusinessOS Platform - Canonical Export Engine (F9.2)
 * Exports active tenant configuration and master data into the exact canonical package layout,
 * achieving 100% Export -> Edit -> Import symmetry.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { SCHEMA_VERSION } from './canonicalImportSpec.js';

export class CanonicalExportEngine {
  /**
   * Exports active tenant data as a canonical import/export package.
   * @param {string} tenantId 
   * @returns {Object} Canonical Package structure matching F9 spec
   */
  exportPackage(tenantId = 'tenant-demo') {
    const tenants = offlineStore.getCollection('tenants') || [];
    const tenant = tenants.find(t => t.tenantId === tenantId || t.id === tenantId) || { name: 'Anchor Restaurant' };

    const inventoryItems = offlineStore.getCollection('inventory_items') || [];
    const suppliers = offlineStore.getCollection('suppliers') || [];
    const foodMenuItems = offlineStore.getCollection('food_menu_items') || [];
    const barMenuItems = offlineStore.getCollection('bar_menu_items') || [];
    const menuVariants = offlineStore.getCollection('menu_variants') || [];
    const recipes = offlineStore.getCollection('recipes') || [];
    const stockLedger = offlineStore.getCollection('stock_ledger') || [];

    // Filter by tenantId
    const tInventory = inventoryItems.filter(i => !i.tenantId || i.tenantId === tenantId);
    const tSuppliers = suppliers.filter(s => !s.tenantId || s.tenantId === tenantId);
    const tFoodMenu = foodMenuItems.filter(m => !m.tenantId || m.tenantId === tenantId);
    const tBarMenu = barMenuItems.filter(m => !m.tenantId || m.tenantId === tenantId);
    const tVariants = menuVariants.filter(v => !v.tenantId || v.tenantId === tenantId);
    const tRecipes = recipes.filter(r => !r.tenantId || r.tenantId === tenantId);

    // 1. Export Manifest
    const manifest = {
      schemaVersion: SCHEMA_VERSION,
      packageVersion: new Date().toISOString().split('T')[0],
      restaurant: tenant.name || 'Anchor Restaurant',
      tenantId,
      exportedAt: new Date().toISOString()
    };

    // 2. Export Inventory Master (snake_case)
    const exportInventory = tInventory.map(item => ({
      item_code: item.itemCode || item.item_code,
      item_name: item.itemName || item.item_name,
      item_type: item.itemType || item.item_type || 'Raw Material',
      category_code: item.categoryCode || item.category_code || 'CAT-GEN',
      base_uom: item.baseUom || item.base_uom || 'KG',
      purchase_uom: item.purchaseUom || item.purchase_uom || item.baseUom || item.base_uom || 'KG',
      conversion_factor: item.conversionFactor || item.conversion_factor || 1,
      default_location_code: item.defaultLocationCode || item.default_location_code || 'LOC-MWH',
      default_supplier_code: item.defaultSupplierCode || item.default_supplier_code || '',
      last_purchase_price: item.lastPurchasePrice || item.last_purchase_price || 0
    }));

    // 3. Export Suppliers
    const exportSuppliers = tSuppliers.map(s => ({
      supplier_code: s.supplierCode || s.supplier_code,
      supplier_name: s.supplierName || s.supplier_name,
      primary_contact: s.primaryContact || s.primary_contact || s.contactPerson || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      gstin: s.gstin || ''
    }));

    // 4. Export Food & Bar Menus
    const exportFoodMenu = tFoodMenu.map(m => ({
      menu_code: m.menuCode || m.menu_code,
      category_name: m.categoryName || m.category_name || 'General',
      item_name: m.itemName || m.item_name,
      description: m.description || '',
      is_vegetarian: m.isVegetarian !== false && m.is_vegetarian !== false,
      production_routing: m.productionRouting || m.production_routing || 'KITCHEN'
    }));

    const exportBarMenu = tBarMenu.map(m => ({
      menu_code: m.menuCode || m.menu_code,
      category_name: m.categoryName || m.category_name || 'Beverages',
      item_name: m.itemName || m.item_name,
      description: m.description || '',
      is_alcoholic: m.isAlcoholic === true || m.is_alcoholic === true,
      production_routing: m.productionRouting || m.production_routing || 'BAR'
    }));

    // 5. Export Variants (Food vs Bar)
    const foodCodes = new Set(tFoodMenu.map(m => m.menuCode || m.menu_code));
    const exportFoodVariants = tVariants.filter(v => foodCodes.has(v.menuCode || v.menu_code)).map(v => ({
      menu_code: v.menuCode || v.menu_code,
      variant_code: v.variantCode || v.variant_code,
      variant_name: v.variantName || v.variant_name,
      selling_price: v.sellingPrice || v.selling_price || 0,
      recipe_code: v.recipeCode || v.recipe_code || ''
    }));

    const barCodes = new Set(tBarMenu.map(m => m.menuCode || m.menu_code));
    const exportBarVariants = tVariants.filter(v => barCodes.has(v.menuCode || v.menu_code)).map(v => ({
      menu_code: v.menuCode || v.menu_code,
      variant_code: v.variantCode || v.variant_code,
      variant_name: v.variantName || v.variant_name,
      selling_price: v.sellingPrice || v.selling_price || 0,
      recipe_code: v.recipeCode || v.recipe_code || ''
    }));

    // 6. Export Recipes (Food vs Bar)
    const recipeMap = new Map(tRecipes.map(r => [r.recipeCode || r.recipe_code, r]));
    const exportFoodRecipes = [];
    exportFoodVariants.forEach(v => {
      const rCode = v.recipe_code || v.recipeCode;
      if (!rCode || !recipeMap.has(rCode)) return;
      const rec = recipeMap.get(rCode);
      (rec.ingredients || []).forEach(ing => {
        exportFoodRecipes.push({
          recipe_code: rec.recipeCode || rec.recipe_code,
          recipe_name: rec.recipeName || rec.recipe_name || rec.recipeCode || rec.recipe_code,
          ingredient_code: ing.ingredientCode || ing.ingredient_code,
          quantity: ing.quantity,
          unit: ing.unit
        });
      });
    });

    const exportBarRecipes = [];
    exportBarVariants.forEach(v => {
      const rCode = v.recipe_code || v.recipeCode;
      if (!rCode || !recipeMap.has(rCode)) return;
      const rec = recipeMap.get(rCode);
      (rec.ingredients || []).forEach(ing => {
        exportBarRecipes.push({
          recipe_code: rec.recipeCode || rec.recipe_code,
          recipe_name: rec.recipeName || rec.recipe_name || rec.recipeCode || rec.recipe_code,
          ingredient_code: ing.ingredientCode || ing.ingredient_code,
          quantity: ing.quantity,
          unit: ing.unit
        });
      });
    });

    // 7. Export Opening Stock
    const openingStockMovements = stockLedger.filter(s => (s.movementType === 'OPENING_BALANCE' || s.movement_type === 'OPENING_BALANCE') && (!s.tenantId || s.tenantId === tenantId));
    const exportOpeningStock = openingStockMovements.map(s => ({
      item_code: s.itemCode || s.item_code,
      location_code: s.locationCode || s.location_code || 'LOC-MWH',
      quantity: s.quantity || 0,
      unit: s.unit || 'KG',
      unit_cost: s.unitCost || s.unit_cost || 0,
      notes: s.notes || 'Opening balance baseline'
    }));

    // 8. Export 00_Foundation Files
    const exportFoundationUoms = [
      { uom_code: 'KG', uom_name: 'Kilogram', uom_type: 'WEIGHT', is_system: true },
      { uom_code: 'G', uom_name: 'Gram', uom_type: 'WEIGHT', is_system: true },
      { uom_code: 'LTR', uom_name: 'Liter', uom_type: 'VOLUME', is_system: true },
      { uom_code: 'ML', uom_name: 'Milliliter', uom_type: 'VOLUME', is_system: true },
      { uom_code: 'PCS', uom_name: 'Pieces / Each', uom_type: 'COUNT', is_system: true }
    ];

    const exportFoundationConversions = [
      { from_uom: 'BAG', to_uom: 'KG', factor: 50, notes: '50 KG Bag' },
      { from_uom: 'CRATE', to_uom: 'KG', factor: 25, notes: '25 KG Crate' },
      { from_uom: 'TIN', to_uom: 'KG', factor: 15, notes: '15 KG Tin' },
      { from_uom: 'BOTTLE_750ML', to_uom: 'ML', factor: 750, notes: '750 ML Spirit Bottle' }
    ];

    const exportFoundationLocations = [
      { location_code: 'LOC-MWH', location_name: 'Main Store Warehouse', location_type: 'WAREHOUSE' },
      { location_code: 'LOC-CHILL', location_name: 'Kitchen Walk-In Chiller', location_type: 'COLD_STORAGE' },
      { location_code: 'LOC-BAR', location_name: 'Bar Counter Store', location_type: 'DISPENSE' }
    ];

    const exportFoundationCategories = [
      { category_code: 'CAT-MEAT', category_name: 'Poultry & Meat', department: 'KITCHEN' },
      { category_code: 'CAT-SEAFOOD', category_name: 'Fresh Seafood', department: 'KITCHEN' },
      { category_code: 'CAT-PRODUCE', category_name: 'Vegetables & Herbs', department: 'KITCHEN' },
      { category_code: 'CAT-DAIRY', category_name: 'Dairy & Cheese', department: 'KITCHEN' },
      { category_code: 'CAT-GRAINS', category_name: 'Grains, Flour & Pulses', department: 'KITCHEN' },
      { category_code: 'CAT-SPICES', category_name: 'Spices & Oil', department: 'KITCHEN' },
      { category_code: 'CAT-BAR', category_name: 'Spirits & Beverages', department: 'BAR' },
      { category_code: 'CAT-SEMI', category_name: 'Semi-Finished Preps', department: 'PRODUCTION' }
    ];

    return {
      manifest,
      FOUNDATION_UOMS: exportFoundationUoms,
      FOUNDATION_CONVERSIONS: exportFoundationConversions,
      FOUNDATION_LOCATIONS: exportFoundationLocations,
      FOUNDATION_CATEGORIES: exportFoundationCategories,
      INVENTORY_MASTER: exportInventory,
      SUPPLIERS: exportSuppliers,
      FOOD_MENU: exportFoodMenu,
      FOOD_VARIANTS: exportFoodVariants,
      FOOD_RECIPES: exportFoodRecipes,
      BAR_MENU: exportBarMenu,
      BAR_VARIANTS: exportBarVariants,
      BAR_RECIPES: exportBarRecipes,
      OPENING_STOCK: exportOpeningStock
    };
  }
}

export const canonicalExportEngine = new CanonicalExportEngine();
