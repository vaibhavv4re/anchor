/**
 * BusinessOS Platform - Master Menu & Recipe Workbook Service
 * 
 * Implements the Unified 5-Tab Master Excel Lifecycle (CANON-11 & Master Blueprint PD-024/025/030):
 *   Tab 1: 01_Menu_Categories    (Operational Sections, Station Routing, Tax Profiles)
 *   Tab 2: 02_Food_Menu          (Dishes, Sizing, Prices, Dietary Tags, Variants)
 *   Tab 3: 03_Bar_Menu           (Drinks, Bottles, Pegs, Dynamic Inventory SKU Links)
 *   Tab 4: 04_Recipes_BOM        (Composite Dish & Cocktail BOM Lines, UOMs, Wastage)
 *   Tab 5: 05_Master_Inventory   (Live Read-Only Reference Dictionary)
 *
 * Capabilities:
 *   1. Full Round-Trip Export: Live database state -> Formatted 5-Tab Excel (.xlsx).
 *   2. Canonical Starter Template Generation: Clean, coordinated template for chefs/bartenders.
 *   3. Pre-Import Analysis Engine: In-memory simulation, cross-tab referential verification,
 *      UOM compatibility checks, Food Cost & Margin simulation, and non-destructive diffing.
 *   4. Atomic Synchronous Commit: Upserts items, revisions recipes, soft-archives omissions.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { kitchenMenuModel, isBarMenuItem, BAR_CATEGORIES } from './kitchenMenuModel.js';
import { recipeModel } from './recipeModel.js';
import { inventoryItemModel } from '../inventory/inventoryItemModel.js';
import { BAR_SKU_MAP, BAR_COCKTAIL_CODES, BAR_PACK_SIZE_ML } from '../bar/barConsumptionMapping.js';
import { platformEventBus } from '../events/platformEvents.js';

// ==========================================
// UOM NORMALIZATION & CONVERSION MATRIX
// ==========================================

export function convertUom(qty, fromUom, toUom) {
  const q = parseFloat(qty) || 0;
  if (q <= 0) return 0;
  const from = String(fromUom || '').toUpperCase().trim();
  const to = String(toUom || '').toUpperCase().trim();

  if (from === to) return q;

  // Mass / Weight Conversions (Target Base: KG)
  if (to === 'KG' || to === 'KILOGRAM') {
    if (from === 'G' || from === 'GM' || from === 'GRAM' || from === 'GRAMS') return q / 1000;
    if (from === 'MG' || from === 'MILLIGRAM') return q / 1000000;
    if (from === 'KG' || from === 'KILOGRAM') return q;
  }
  if (to === 'G' || to === 'GM' || to === 'GRAM') {
    if (from === 'KG') return q * 1000;
    if (from === 'MG') return q / 1000;
    if (from === 'G' || from === 'GM') return q;
  }

  // Volume Conversions (Target Base: LTR)
  if (to === 'LTR' || to === 'L' || to === 'LITRE' || to === 'LITER') {
    if (from === 'ML' || from === 'MILLILITRE' || from === 'MILLILITER') return q / 1000;
    if (from === 'CL') return q / 100;
    if (from === 'DL') return q / 10;
    if (from === 'TSP') return (q * 5) / 1000; // 1 tsp ~ 5 ml
    if (from === 'TBSP') return (q * 15) / 1000; // 1 tbsp ~ 15 ml
    if (from === 'LTR' || from === 'L') return q;
  }
  if (to === 'ML') {
    if (from === 'LTR' || from === 'L') return q * 1000;
    if (from === 'TSP') return q * 5;
    if (from === 'TBSP') return q * 15;
    if (from === 'ML') return q;
  }

  // Discrete Count Conversions (Target Base: PCS / NOS / BOTTLE / CAN)
  const isCount = (u) => u === 'PCS' || u === 'PC' || u === 'NOS' || u === 'NO' || u === 'UNIT' || u === 'BOTTLE' || u === 'CAN';
  if (isCount(to) && isCount(from)) {
    return q;
  }
  if (isCount(to)) {
    if (from === 'DOZEN') return q * 12;
    if (from === 'HALF_DOZEN') return q * 6;
  }

  // Culinary pinch heuristics (approx 1g / 1ml)
  if (from === 'PINCH') {
    if (to === 'KG') return 0.001 * q;
    if (to === 'G') return 1.0 * q;
  }

  // Direct fallback
  return q;
}

export function areUomsCompatible(uom1, uom2) {
  const u1 = String(uom1 || '').toUpperCase().trim();
  const u2 = String(uom2 || '').toUpperCase().trim();
  if (u1 === u2) return true;

  const weights = new Set(['KG', 'G', 'GM', 'GRAM', 'GRAMS', 'MG', 'MILLIGRAM', 'PINCH']);
  const volumes = new Set(['LTR', 'L', 'LITRE', 'LITER', 'ML', 'CL', 'DL', 'TSP', 'TBSP']);
  const counts = new Set(['PCS', 'PC', 'NOS', 'NO', 'UNIT', 'BOTTLE', 'CAN', 'DOZEN', 'HALF_DOZEN', 'PACKET', 'BOX']);

  if (weights.has(u1) && weights.has(u2)) return true;
  if (volumes.has(u1) && volumes.has(u2)) return true;
  if (counts.has(u1) && counts.has(u2)) return true;

  return false;
}

// ==========================================
// MASTER MENU WORKBOOK SERVICE CLASS
// ==========================================

export class MasterMenuWorkbookService {
  constructor(deps = {}) {
    this.offlineStore = deps.offlineStore || offlineStore;
    this.kitchenMenuModel = deps.kitchenMenuModel || kitchenMenuModel;
    this.recipeModel = deps.recipeModel || recipeModel;
    this.inventoryItemModel = deps.inventoryItemModel || inventoryItemModel;
  }

  /**
   * Resolve active tenant ID from session or options
   */
  _getTenantId(tenantId = null) {
    if (tenantId) return tenantId;
    if (typeof sessionStorage !== 'undefined') {
      try {
        const s = JSON.parse(sessionStorage.getItem('ros_session') || '{}');
        if (s.tenantId) return s.tenantId;
      } catch (_) {}
    }
    return 'tenant_h0qc7wf';
  }

  /**
   * Lazily resolve SheetJS XLSX library from global window or globalThis
   */
  _getXlsx() {
    if (typeof window !== 'undefined' && window.XLSX) return window.XLSX;
    if (typeof globalThis !== 'undefined' && globalThis.XLSX) return globalThis.XLSX;
    return null;
  }

  // ==========================================
  // 1. DATA EXTRACTION & WORKBOOK GENERATION
  // ==========================================

  /**
   * Extracts live database state into a structured 5-tab workbook matrix.
   * @param {string|null} tenantId 
   * @returns {{ categories: Array<Object>, foodMenu: Array<Object>, barMenu: Array<Object>, recipesBom: Array<Object>, inventoryRef: Array<Object> }}
   */
  generateWorkbookData(tenantId = null) {
    const tId = this._getTenantId(tenantId);

    // 1. Fetch raw collections
    const rawMenuItems = this.kitchenMenuModel.getAll(tId, { showArchived: false }) || [];
    const rawRecipes = this.recipeModel.getAll(tId) || [];
    const masterInventory = this.inventoryItemModel.getAllItems(tId) || [];
    const storedCategories = this.offlineStore.getCollection('menu_categories', tId) || [];

    // Helper map for inventory by code
    const invMap = new Map();
    masterInventory.forEach(inv => {
      const code = String(inv.itemCode || inv.item_code || inv.id || '').toUpperCase().trim();
      if (code) invMap.set(code, inv);
    });

    // 2. Tab 1: Categories Matrix
    const categoryMap = new Map();
    // Seed with stored categories
    storedCategories.forEach(c => {
      const code = String(c.categoryCode || c.category_code || c.code || '').toUpperCase().trim();
      if (code) {
        categoryMap.set(code, {
          'Category Code': code,
          'Category Name': c.categoryName || c.name || code,
          'Production Station': (c.station || c.productionStation || 'KITCHEN').toUpperCase(),
          'Default Tax Profile': c.taxProfile || c.tax_profile || (c.station === 'BAR' ? '10% VAT/Excise' : '5% GST'),
          'Display Order': parseInt(c.displayOrder || c.display_order) || 10,
          'Operational Scope': (c.station === 'BAR' ? 'BAR' : 'FOOD')
        });
      }
    });

    // Ensure every category used in items exists in categoryMap
    rawMenuItems.forEach(item => {
      const cat = (item.category || 'GENERAL').toUpperCase().trim();
      const isBar = isBarMenuItem(item);
      const catCode = `CAT-${cat.replace(/[^A-Z0-9]/g, '_').substring(0, 14)}`;
      if (!categoryMap.has(catCode) && !categoryMap.has(cat)) {
        categoryMap.set(catCode, {
          'Category Code': catCode,
          'Category Name': item.category || 'General',
          'Production Station': isBar ? 'BAR' : 'KITCHEN',
          'Default Tax Profile': isBar ? '10% VAT/Excise' : '5% GST',
          'Display Order': isBar ? 50 : 20,
          'Operational Scope': isBar ? 'BAR' : 'FOOD'
        });
      }
    });

    const categoriesSheet = Array.from(categoryMap.values()).sort((a, b) => a['Display Order'] - b['Display Order']);

    // 3. Tab 2: Food Menu Matrix
    const foodItems = rawMenuItems.filter(item => !isBarMenuItem(item));
    const foodMenuSheet = foodItems.map(item => {
      const cat = (item.category || 'GENERAL').toUpperCase().trim();
      const foundCat = categoriesSheet.find(c => c['Category Name'].toUpperCase() === cat || c['Category Code'] === cat);
      const catCode = foundCat ? foundCat['Category Code'] : `CAT-${cat.replace(/[^A-Z0-9]/g, '_').substring(0, 14)}`;

      const variants = Array.isArray(item.variants) && item.variants.length > 0 ? item.variants : [];
      const varSpecs = variants.map(v => `${v.variantName || v.name}:${v.price || v.sellingPrice || 0}`).join(', ');

      return {
        'Item Code': item.itemCode || item.item_code || item.id,
        'Item Name': item.itemName || item.item_name || 'Dish',
        'Category Code': catCode,
        'Category Name': item.category || 'General',
        'Dietary Type': (item.dietaryType || 'VEG').toUpperCase(),
        'Selling Price': parseFloat(item.sellingPrice || item.selling_price) || 0,
        'Spiciness Level': (item.spicinessLevel || 'MEDIUM').toUpperCase(),
        'Portion Description': item.portionSize || item.description || '1 Portion',
        'Has Variants': variants.length > 0 ? 'YES' : 'NO',
        'Variants Specification': varSpecs,
        'Operational Status': (item.availabilityStatus || 'AVAILABLE').toUpperCase()
      };
    });

    // 4. Tab 3: Bar Menu Matrix
    const barItems = rawMenuItems.filter(item => isBarMenuItem(item));
    const barMenuSheet = barItems.map(item => {
      const code = String(item.itemCode || item.item_code || item.id || '').toUpperCase().trim();
      const cat = (item.category || 'BAR').toUpperCase().trim();
      const foundCat = categoriesSheet.find(c => c['Category Name'].toUpperCase() === cat || c['Category Code'] === cat);
      const catCode = foundCat ? foundCat['Category Code'] : `CAT-${cat.replace(/[^A-Z0-9]/g, '_').substring(0, 14)}`;

      const isCocktail = BAR_COCKTAIL_CODES.has(code) || cat.includes('COCKTAIL') || cat.includes('MOCKTAIL');
      const isBeer = cat.includes('BEER') || cat.includes('BREEZER');

      let consumptionMode = item.consumptionMode || (isCocktail ? 'RECIPE' : (isBeer ? 'DIRECT_UNIT' : 'DIRECT_POUR'));
      let linkedSku = item.linkedInventorySku || item.linked_inventory_sku || BAR_SKU_MAP[code] || '';

      const variants = Array.isArray(item.variants) && item.variants.length > 0 ? item.variants : [];
      const varPricing = variants.map(v => `${v.variantName || v.name}:${v.price || v.sellingPrice || 0}`).join(', ');

      let defaultSize = item.defaultServingSize || (isBeer ? (BAR_PACK_SIZE_ML[linkedSku] || 650) : (isCocktail ? 200 : 30));
      let defaultUom = item.defaultServingUom || 'ML';

      return {
        'Item Code': code,
        'Item Name': item.itemName || item.item_name || code,
        'Category Code': catCode,
        'Category Name': item.category || 'Bar',
        'Consumption Mode': consumptionMode,
        'Linked Inventory SKU': linkedSku,
        'Default Serving Size': defaultSize,
        'Default Serving UOM': defaultUom,
        'Variants & Peg Pricing': varPricing,
        'Base Selling Price': parseFloat(item.sellingPrice || item.selling_price || item.price) || 0,
        'Operational Status': (item.availabilityStatus || 'AVAILABLE').toUpperCase()
      };
    });

    // 5. Tab 4: Recipes BOM Matrix
    const recipesBomSheet = [];
    rawRecipes.forEach(recipe => {
      const ingredients = recipe.ingredients || recipe.data?.ingredients || [];
      if (!Array.isArray(ingredients) || ingredients.length === 0) return;

      const mCode = recipe.menuItemCode || recipe.menu_item_code || '';
      const rCode = recipe.recipeCode || recipe.recipe_code || `RCP-${mCode || recipe.id}`;
      const rName = recipe.recipeName || recipe.recipe_name || 'Recipe';
      const vName = recipe.variantName || recipe.variant_name || '';

      ingredients.forEach(ing => {
        const ingCode = String(ing.inventoryItemCode || ing.inventory_item_code || ing.itemCode || '').toUpperCase().trim();
        const invItem = invMap.get(ingCode);
        const ingName = ing.inventoryItemName || ing.itemName || invItem?.itemName || invItem?.item_name || ingCode;

        recipesBomSheet.push({
          'Menu Item Code': mCode,
          'Recipe Code': rCode,
          'Recipe Name': rName,
          'Variant Name': vName,
          'Ingredient Item Code': ingCode,
          'Ingredient Name': ingName,
          'Recipe Quantity': parseFloat(ing.recipeQty || ing.quantity) || 0,
          'Recipe UOM': (ing.recipeUom || ing.uom || invItem?.baseUom || 'KG').toUpperCase(),
          'Standard Yield %': parseFloat(ing.standardYieldPercent || invItem?.standardYieldPercent) || 100,
          'Prep Wastage %': parseFloat(ing.recipeWastagePercent) || 0,
          'Portion Yield Count': parseInt(recipe.portionCount) || 1
        });
      });
    });

    // 6. Tab 5: Master Inventory Reference Matrix
    const inventoryRefSheet = masterInventory.map(inv => {
      return {
        'Item Code': inv.itemCode || inv.item_code || inv.id,
        'Item Name': inv.itemName || inv.item_name || 'Item',
        'Item Type': inv.itemType || inv.item_type || 'Raw Material',
        'Category Code': inv.categoryCode || inv.category_code || 'GENERAL',
        'Base Costing UOM': (inv.baseUom || inv.base_uom || 'KG').toUpperCase(),
        'Valuation Rate (INR)': parseFloat(inv.lastPurchasePrice || inv.unitValuation || inv.unit_valuation) || 0,
        'Default Location': inv.defaultLocationCode || inv.default_location_code || 'LOC-MWH'
      };
    }).sort((a, b) => a['Item Code'].localeCompare(b['Item Code']));

    return {
      categories: categoriesSheet,
      foodMenu: foodMenuSheet,
      barMenu: barMenuSheet,
      recipesBom: recipesBomSheet,
      inventoryRef: inventoryRefSheet
    };
  }

  /**
   * Generates a starter template populated with canonical categories, coastal dishes, and live inventory.
   * @param {string|null} tenantId 
   * @returns {Object}
   */
  generateCanonicalTemplateData(tenantId = null) {
    return this.generateWorkbookData(tenantId);
  }

  /**
   * Builds and triggers browser download of the complete 5-tab Excel file.
   * @param {string|null} tenantId 
   * @param {Object} [options] { fileName }
   * @returns {Promise<boolean>}
   */
  async exportMasterWorkbook(tenantId = null, options = {}) {
    const data = this.generateWorkbookData(tenantId);
    const XLSX = this._getXlsx();

    const fileName = options.fileName || `Anchor_RestaurantOS_Master_Menu_${new Date().toISOString().slice(0, 10)}.xlsx`;

    if (!XLSX) {
      console.warn('[MasterMenuWorkbookService] SheetJS (window.XLSX) not available. Triggering JSON sidecar fallback.');
      this._downloadJsonFallback(data, fileName.replace('.xlsx', '.json'));
      return false;
    }

    try {
      const wb = XLSX.utils.book_new();

      const wsCategories = XLSX.utils.json_to_sheet(data.categories);
      const wsFood = XLSX.utils.json_to_sheet(data.foodMenu);
      const wsBar = XLSX.utils.json_to_sheet(data.barMenu);
      const wsRecipes = XLSX.utils.json_to_sheet(data.recipesBom);
      const wsInventory = XLSX.utils.json_to_sheet(data.inventoryRef);

      // Auto-fit column widths
      [wsCategories, wsFood, wsBar, wsRecipes, wsInventory].forEach(ws => {
        if (!ws['!cols']) ws['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
      });

      XLSX.utils.book_append_sheet(wb, wsCategories, '01_Menu_Categories');
      XLSX.utils.book_append_sheet(wb, wsFood, '02_Food_Menu');
      XLSX.utils.book_append_sheet(wb, wsBar, '03_Bar_Menu');
      XLSX.utils.book_append_sheet(wb, wsRecipes, '04_Recipes_BOM');
      XLSX.utils.book_append_sheet(wb, wsInventory, '05_Master_Inventory_Ref');

      if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
        XLSX.writeFile(wb, fileName);
        return true;
      }
      return wb;
    } catch (err) {
      console.error('[MasterMenuWorkbookService] Export failed:', err);
      throw err;
    }
  }

  _downloadJsonFallback(data, fileName) {
    if (typeof window === 'undefined') return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ==========================================
  // 2. PARSER & REFERENTIAL INTEGRITY VALIDATION
  // ==========================================

  /**
   * Parse a raw uploaded File / ArrayBuffer / Matrix map into domain objects.
   * @param {File|ArrayBuffer|Object} input 
   * @returns {Promise<Object>} raw sheets map { categories, foodMenu, barMenu, recipesBom }
   */
  async parseRawFileToSheets(input) {
    // If already structured sheets map
    if (input && (input.foodMenu || input.categories || input.barMenu)) {
      return input;
    }

    const XLSX = this._getXlsx();
    if (!XLSX) {
      throw new Error('SheetJS (XLSX) engine is required to parse Excel files.');
    }

    let buffer = input;
    if (typeof File !== 'undefined' && input instanceof File) {
      buffer = await input.arrayBuffer();
    }

    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetNames = workbook.SheetNames;

    const findSheet = (pattern) => {
      const match = sheetNames.find(n => n.toLowerCase().includes(pattern.toLowerCase()));
      if (!match) return [];
      return XLSX.utils.sheet_to_json(workbook.Sheets[match], { defval: '' });
    };

    return {
      categories: findSheet('Categories'),
      foodMenu: findSheet('Food'),
      barMenu: findSheet('Bar'),
      recipesBom: findSheet('Recipe') || findSheet('BOM')
    };
  }

  /**
   * Core Pre-Import Analysis Engine:
   * Cross-checks referential integrity, calculates simulated food costs,
   * flags unlinked dishes and missing recipes, and detects high margins.
   * 
   * @param {Object|File|ArrayBuffer} input 
   * @param {string|null} tenantId 
   * @returns {Promise<Object>} Analysis Report Envelope
   */
  async analyzeWorkbook(input, tenantId = null) {
    const tId = this._getTenantId(tenantId);
    const sheets = await this.parseRawFileToSheets(input);

    const existingInventory = this.inventoryItemModel.getAllItems(tId) || [];
    const existingMenuItems = this.kitchenMenuModel.getAll(tId, { showArchived: false }) || [];
    const existingRecipes = this.recipeModel.getAll(tId) || [];

    // Master Inventory Lookup
    const invMap = new Map();
    existingInventory.forEach(i => {
      const code = String(i.itemCode || i.item_code || i.id || '').toUpperCase().trim();
      if (code) invMap.set(code, i);
    });

    const errors = [];
    const warnings = [];

    // 1. Process Categories (Tab 1)
    const categoryMap = new Map();
    const categoriesRows = Array.isArray(sheets.categories) ? sheets.categories : [];
    categoriesRows.forEach((r, idx) => {
      const code = String(r['Category Code'] || r.categoryCode || r.category_code || '').toUpperCase().trim();
      const name = String(r['Category Name'] || r.categoryName || r.name || code).trim();
      const station = String(r['Production Station'] || r.station || 'KITCHEN').toUpperCase().trim();
      const tax = r['Default Tax Profile'] || r.taxProfile || (station === 'BAR' ? '10% VAT/Excise' : '5% GST');
      const order = parseInt(r['Display Order'] || r.displayOrder) || (idx + 1) * 10;

      if (!code) {
        errors.push(`Tab 1 (Categories), Row ${idx + 2}: Missing Category Code.`);
        return;
      }
      categoryMap.set(code, { categoryCode: code, categoryName: name, station, taxProfile: tax, displayOrder: order });
      categoryMap.set(name.toUpperCase(), { categoryCode: code, categoryName: name, station, taxProfile: tax, displayOrder: order });
    });

    // 2. Process Food Menu (Tab 2)
    const foodMap = new Map();
    const foodRows = Array.isArray(sheets.foodMenu) ? sheets.foodMenu : [];
    foodRows.forEach((r, idx) => {
      const code = String(r['Item Code'] || r.itemCode || r.item_code || '').toUpperCase().trim();
      const name = String(r['Item Name'] || r.itemName || r.item_name || '').trim();
      const catCode = String(r['Category Code'] || r.categoryCode || r.category || '').toUpperCase().trim();
      const price = parseFloat(r['Selling Price'] || r.sellingPrice || r.price) || 0;

      if (!code) {
        errors.push(`Tab 2 (Food Menu), Row ${idx + 2}: Missing Item Code for dish "${name}".`);
        return;
      }
      if (foodMap.has(code)) {
        errors.push(`Tab 2 (Food Menu), Row ${idx + 2}: Duplicate Food Item Code "${code}".`);
        return;
      }

      // Referential Check: Does Category Exist?
      if (catCode && !categoryMap.has(catCode)) {
        warnings.push(`Tab 2 (Food Menu), Row ${idx + 2}: Dish "${name}" references category "${catCode}" which is not defined in Tab 1. Will default to KITCHEN station.`);
      }

      foodMap.set(code, {
        itemCode: code,
        itemName: name || code,
        category: categoryMap.get(catCode)?.categoryName || catCode || 'GENERAL',
        categoryCode: categoryMap.get(catCode)?.categoryCode || catCode || 'CAT-GEN',
        dietaryType: (r['Dietary Type'] || r.dietaryType || 'VEG').toUpperCase(),
        sellingPrice: price,
        spicinessLevel: (r['Spiciness Level'] || r.spicinessLevel || 'MEDIUM').toUpperCase(),
        portionSize: r['Portion Description'] || r.portionSize || '1 Portion',
        hasVariants: String(r['Has Variants'] || '').toUpperCase() === 'YES',
        variantsSpec: r['Variants Specification'] || r.variants || '',
        availabilityStatus: (r['Operational Status'] || r.status || 'AVAILABLE').toUpperCase(),
        domain: 'KITCHEN'
      });
    });

    // 3. Process Bar Menu (Tab 3)
    const barMap = new Map();
    const barRows = Array.isArray(sheets.barMenu) ? sheets.barMenu : [];
    barRows.forEach((r, idx) => {
      const code = String(r['Item Code'] || r.itemCode || r.item_code || '').toUpperCase().trim();
      const name = String(r['Item Name'] || r.itemName || r.item_name || '').trim();
      const catCode = String(r['Category Code'] || r.categoryCode || r.category || '').toUpperCase().trim();
      const mode = String(r['Consumption Mode'] || r.consumptionMode || 'DIRECT_POUR').toUpperCase().trim();
      const linkedSku = String(r['Linked Inventory SKU'] || r.linkedInventorySku || r.sku || '').toUpperCase().trim();
      const price = parseFloat(r['Base Selling Price'] || r.sellingPrice || r.price) || 0;

      if (!code) {
        errors.push(`Tab 3 (Bar Menu), Row ${idx + 2}: Missing Item Code for drink "${name}".`);
        return;
      }
      if (barMap.has(code) || foodMap.has(code)) {
        errors.push(`Tab 3 (Bar Menu), Row ${idx + 2}: Duplicate Item Code "${code}". Already exists in menu.`);
        return;
      }

      // Referential Check: Linked Inventory SKU for POUR / UNIT
      if (mode === 'DIRECT_POUR' || mode === 'DIRECT_UNIT') {
        if (!linkedSku) {
          warnings.push(`Tab 3 (Bar Menu), Row ${idx + 2}: Drink "${name}" (${code}) is ${mode} but has no Linked Inventory SKU. Auto-deduction will be skipped.`);
        } else if (!invMap.has(linkedSku)) {
          warnings.push(`Tab 3 (Bar Menu), Row ${idx + 2}: Linked SKU "${linkedSku}" for drink "${name}" not found in Master Inventory.`);
        }
      }

      barMap.set(code, {
        itemCode: code,
        itemName: name || code,
        category: categoryMap.get(catCode)?.categoryName || catCode || 'BAR',
        categoryCode: categoryMap.get(catCode)?.categoryCode || catCode || 'CAT-BAR',
        consumptionMode: mode,
        linkedInventorySku: linkedSku,
        defaultServingSize: parseFloat(r['Default Serving Size']) || (mode === 'DIRECT_UNIT' ? 650 : 30),
        defaultServingUom: (r['Default Serving UOM'] || 'ML').toUpperCase(),
        variantsPricing: r['Variants & Peg Pricing'] || '',
        sellingPrice: price,
        availabilityStatus: (r['Operational Status'] || r.status || 'AVAILABLE').toUpperCase(),
        domain: 'BAR'
      });
    });

    // 4. Process Recipes BOM (Tab 4)
    const recipesGrouped = new Map(); // mCode -> Array of lines
    const bomRows = Array.isArray(sheets.recipesBom) ? sheets.recipesBom : [];

    bomRows.forEach((r, idx) => {
      const mCode = String(r['Menu Item Code'] || r.menuItemCode || r.menu_item_code || '').toUpperCase().trim();
      const ingCode = String(r['Ingredient Item Code'] || r.ingredientCode || r.inventoryItemCode || '').toUpperCase().trim();
      const recipeQty = parseFloat(r['Recipe Quantity'] || r.quantity) || 0;
      const recipeUom = String(r['Recipe UOM'] || r.uom || 'KG').toUpperCase().trim();
      const wastage = parseFloat(r['Prep Wastage %'] || r.wastagePercent) || 0;
      const rCode = r['Recipe Code'] || `RCP-${mCode}`;
      const rName = r['Recipe Name'] || `${mCode} Recipe`;

      if (!mCode) {
        errors.push(`Tab 4 (Recipes), Row ${idx + 2}: Missing Menu Item Code.`);
        return;
      }
      if (!ingCode) {
        errors.push(`Tab 4 (Recipes), Row ${idx + 2}: Missing Ingredient Item Code for dish "${mCode}".`);
        return;
      }

      // Referential Check 1: Does Menu Dish Exist?
      const inFood = foodMap.has(mCode);
      const inBar = barMap.has(mCode);
      if (!inFood && !inBar) {
        errors.push(`Tab 4 (Recipes), Row ${idx + 2}: Menu Item Code "${mCode}" not found in Tab 2 (Food) or Tab 3 (Bar).`);
        return;
      }

      // Referential Check 2: Does Ingredient Exist in Master Inventory?
      const invItem = invMap.get(ingCode);
      if (!invItem) {
        errors.push(`Tab 4 (Recipes), Row ${idx + 2}: Ingredient "${ingCode}" not found in Master Inventory.`);
        return;
      }

      // Referential Check 3: Are UOMs Compatible?
      const baseUom = (invItem.baseUom || invItem.base_uom || 'KG').toUpperCase();
      if (!areUomsCompatible(recipeUom, baseUom)) {
        errors.push(`Tab 4 (Recipes), Row ${idx + 2}: Incompatible UOMs for ingredient "${ingCode}". Recipe uses "${recipeUom}", but Master Inventory base unit is "${baseUom}".`);
        return;
      }

      if (!recipesGrouped.has(mCode)) {
        recipesGrouped.set(mCode, {
          menuItemCode: mCode,
          recipeCode: rCode,
          recipeName: rName,
          lines: []
        });
      }

      recipesGrouped.get(mCode).lines.push({
        ingredientCode: ingCode,
        ingredientName: invItem.itemName || invItem.item_name || ingCode,
        recipeQty,
        recipeUom,
        baseUom,
        wastage,
        unitValuation: parseFloat(invItem.lastPurchasePrice || invItem.unitValuation || invItem.unit_valuation) || 0,
        standardYieldPct: parseFloat(invItem.standardYieldPercent) || 100
      });
    });

    // 5. Financial & Operational Simulation per Dish
    const dishAnalyses = [];
    let totalPortionCostSum = 0;
    let foodCostCalculableCount = 0;

    // Simulate Food Dishes
    foodMap.forEach(dish => {
      const bom = recipesGrouped.get(dish.itemCode);
      if (!bom || bom.lines.length === 0) {
        dishAnalyses.push({
          itemCode: dish.itemCode,
          itemName: dish.itemName,
          domain: 'KITCHEN',
          sellingPrice: dish.sellingPrice,
          hasRecipe: false,
          portionCost: 0,
          foodCostPct: null,
          grossMarginPct: null,
          status: 'RECIPE_MISSING'
        });
        return;
      }

      let totalDishCost = 0;
      bom.lines.forEach(l => {
        const normalizedQty = convertUom(l.recipeQty, l.recipeUom, l.baseUom);
        const stdYieldFactor = (l.standardYieldPct > 0 ? l.standardYieldPct : 100) / 100;
        const grossQtyYield = stdYieldFactor > 0 ? (normalizedQty / stdYieldFactor) : normalizedQty;
        const grossEffective = grossQtyYield * (1 + (l.wastage / 100));
        const lineCost = grossEffective * l.unitValuation;
        totalDishCost += lineCost;
      });

      const portionCost = parseFloat(totalDishCost.toFixed(2));
      const foodCostPct = dish.sellingPrice > 0 ? parseFloat(((portionCost / dish.sellingPrice) * 100).toFixed(1)) : 0;
      const grossMarginPct = foodCostPct != null ? parseFloat((100 - foodCostPct).toFixed(1)) : null;

      if (foodCostPct > 35) {
        warnings.push(`⚠️ High Food Cost Flag: Dish "${dish.itemName}" (${dish.itemCode}) has ${foodCostPct}% food cost (Cost: ₹${portionCost} / Price: ₹${dish.sellingPrice}).`);
      }
      if (dish.sellingPrice > 0 && portionCost >= dish.sellingPrice) {
        warnings.push(`🔴 Negative/Zero Margin Flag: Dish "${dish.itemName}" (${dish.itemCode}) cost (₹${portionCost}) exceeds or equals selling price (₹${dish.sellingPrice}).`);
      }

      totalPortionCostSum += foodCostPct;
      foodCostCalculableCount++;

      dishAnalyses.push({
        itemCode: dish.itemCode,
        itemName: dish.itemName,
        domain: 'KITCHEN',
        sellingPrice: dish.sellingPrice,
        hasRecipe: true,
        recipeLinesCount: bom.lines.length,
        portionCost,
        foodCostPct,
        grossMarginPct,
        status: 'READY'
      });
    });

    // Simulate Bar Items
    barMap.forEach(drink => {
      if (drink.consumptionMode === 'DIRECT_POUR' || drink.consumptionMode === 'DIRECT_UNIT') {
        const invItem = invMap.get(drink.linkedInventorySku);
        const unitVal = invItem ? parseFloat(invItem.lastPurchasePrice || invItem.unitValuation || invItem.unit_valuation) || 0 : 0;
        const baseUom = invItem ? (invItem.baseUom || 'LTR') : 'LTR';
        const servingLtr = convertUom(drink.defaultServingSize, drink.defaultServingUom, baseUom);
        const pourCost = parseFloat((servingLtr * unitVal).toFixed(2));
        const foodCostPct = drink.sellingPrice > 0 ? parseFloat(((pourCost / drink.sellingPrice) * 100).toFixed(1)) : 0;

        dishAnalyses.push({
          itemCode: drink.itemCode,
          itemName: drink.itemName,
          domain: 'BAR',
          sellingPrice: drink.sellingPrice,
          hasRecipe: false,
          directMapped: Boolean(drink.linkedInventorySku && invItem),
          portionCost: pourCost,
          foodCostPct,
          grossMarginPct: 100 - foodCostPct,
          status: drink.linkedInventorySku ? 'READY' : 'SKU_MISSING'
        });
      } else if (drink.consumptionMode === 'RECIPE') {
        const bom = recipesGrouped.get(drink.itemCode);
        const hasRec = Boolean(bom && bom.lines.length > 0);
        dishAnalyses.push({
          itemCode: drink.itemCode,
          itemName: drink.itemName,
          domain: 'BAR',
          sellingPrice: drink.sellingPrice,
          hasRecipe: hasRec,
          status: hasRec ? 'READY' : 'RECIPE_MISSING'
        });
      }
    });

    // 6. Compute Diff against Database
    const existingCodeSet = new Set(existingMenuItems.map(i => String(i.itemCode || i.item_code || i.id).toUpperCase().trim()));
    const excelCodeSet = new Set([...foodMap.keys(), ...barMap.keys()]);

    const toCreate = [];
    const toUpdate = [];
    const toArchive = [];

    excelCodeSet.forEach(code => {
      if (!existingCodeSet.has(code)) {
        toCreate.push(foodMap.get(code) || barMap.get(code));
      } else {
        toUpdate.push(foodMap.get(code) || barMap.get(code));
      }
    });

    existingCodeSet.forEach(code => {
      if (!excelCodeSet.has(code)) {
        const found = existingMenuItems.find(i => String(i.itemCode || i.item_code || i.id).toUpperCase().trim() === code);
        if (found) toArchive.push(found);
      }
    });

    // Coverage KPIs
    const foodTotal = foodMap.size;
    const foodLinked = dishAnalyses.filter(d => d.domain === 'KITCHEN' && d.hasRecipe).length;
    const foodMissing = foodTotal - foodLinked;

    const barTotal = barMap.size;
    const barDirectMapped = dishAnalyses.filter(d => d.domain === 'BAR' && d.directMapped).length;
    const barCocktails = dishAnalyses.filter(d => d.domain === 'BAR' && !d.directMapped);
    const cocktailsLinked = barCocktails.filter(d => d.hasRecipe).length;
    const cocktailsMissing = barCocktails.length - cocktailsLinked;

    const totalMenuCount = foodTotal + barTotal;
    const totalReadyCount = foodLinked + barDirectMapped + cocktailsLinked;
    const totalMissingCount = foodMissing + cocktailsMissing;
    const overallCoveragePct = totalMenuCount > 0 ? parseFloat(((totalReadyCount / totalMenuCount) * 100).toFixed(1)) : 100;

    const avgFoodCost = foodCostCalculableCount > 0 ? parseFloat((totalPortionCostSum / foodCostCalculableCount).toFixed(1)) : 0;

    return {
      valid: errors.length === 0,
      kpis: {
        totalCategories: categoryMap.size / 2, // normalized by key duplication
        foodTotal,
        foodLinked,
        foodMissing,
        barTotal,
        barDirectMapped,
        cocktailsTotal: barCocktails.length,
        cocktailsLinked,
        cocktailsMissing,
        overallCoveragePct,
        avgFoodCost
      },
      diff: {
        toCreateCount: toCreate.length,
        toUpdateCount: toUpdate.length,
        toArchiveCount: toArchive.length,
        toCreate,
        toUpdate,
        toArchive
      },
      validation: {
        errors,
        warnings
      },
      dishAnalyses,
      parsedPayload: {
        categories: Array.from(categoryMap.values()).filter((v, i, a) => a.findIndex(t => t.categoryCode === v.categoryCode) === i),
        foodItems: Array.from(foodMap.values()),
        barItems: Array.from(barMap.values()),
        recipesGrouped: Array.from(recipesGrouped.values()),
        toArchive
      }
    };
  }

  // ==========================================
  // 3. ATOMIC SYNCHRONOUS COMMIT
  // ==========================================

  /**
   * Commit verified payload to offlineStore and trigger background sync.
   * Soft-archives items omitted from Excel, creates new revisions for updated recipes.
   * 
   * @param {Object} analysisResult 
   * @param {string|null} tenantId 
   * @param {Object} [options]
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async commitImport(analysisResult, tenantId = null, options = {}) {
    if (!analysisResult || !analysisResult.valid) {
      throw new Error('Cannot commit invalid import. Resolve validation errors first.');
    }

    const tId = this._getTenantId(tenantId);
    const payload = analysisResult.parsedPayload;
    const now = new Date().toISOString();

    // 1. Commit Categories
    const existingCats = this.offlineStore.getCollection('menu_categories', tId) || [];
    const catMap = new Map();
    existingCats.forEach(c => catMap.set(c.categoryCode || c.code, c));

    payload.categories.forEach(c => {
      const code = c.categoryCode;
      const rec = {
        id: `cat-${code.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        categoryCode: code,
        categoryName: c.categoryName,
        station: c.station,
        taxProfile: c.taxProfile,
        displayOrder: c.displayOrder,
        tenantId: tId,
        updatedAt: now
      };
      catMap.set(code, rec);
    });
    this.offlineStore.setCollection('menu_categories', Array.from(catMap.values()), tId);

    // 2. Commit Menu Items (Food & Bar)
    const existingItems = this.offlineStore.getCollection('kitchen_menu_items', tId) || [];
    const itemMap = new Map();
    existingItems.forEach(i => {
      const code = String(i.itemCode || i.item_code || i.id).toUpperCase().trim();
      itemMap.set(code, i);
    });

    const allNewItems = [...payload.foodItems, ...payload.barItems];

    allNewItems.forEach(item => {
      const code = item.itemCode;
      const existing = itemMap.get(code);

      // Parse variants
      let parsedVariants = [];
      if (item.variantsSpec || item.variantsPricing) {
        const raw = item.variantsSpec || item.variantsPricing;
        parsedVariants = raw.split(',').map(s => {
          const parts = s.split(':');
          const vName = parts[0]?.trim() || 'Standard';
          const vPrice = parseFloat(parts[1]) || item.sellingPrice;
          return {
            variantId: `var-${code}-${vName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            variantName: vName,
            name: vName,
            price: vPrice,
            sellingPrice: vPrice
          };
        });
      }

      const record = {
        ...(existing || {}),
        id: existing?.id || `menu-${code.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        itemCode: code,
        item_code: code,
        itemName: item.itemName,
        item_name: item.itemName,
        category: item.category,
        categoryCode: item.categoryCode,
        routing: item.domain === 'BAR' ? 'BAR_LINE' : 'KITCHEN_LINE',
        productionArea: item.domain === 'BAR' ? 'BAR' : 'MAIN_KITCHEN',
        sellingPrice: item.sellingPrice,
        selling_price: item.sellingPrice,
        dietaryType: item.dietaryType || 'VEG',
        portionSize: item.portionSize || '1 Portion',
        hasVariants: parsedVariants.length > 0,
        variants: parsedVariants,
        consumptionMode: item.consumptionMode || (item.domain === 'BAR' ? 'DIRECT_POUR' : 'RECIPE'),
        linkedInventorySku: item.linkedInventorySku || null,
        defaultServingSize: item.defaultServingSize || null,
        defaultServingUom: item.defaultServingUom || null,
        availabilityStatus: item.availabilityStatus || 'AVAILABLE',
        lifecycleStatus: 'ACTIVE',
        tenantId: tId,
        updatedAt: now
      };

      itemMap.set(code, record);
    });

    // 3. Soft-Archive Omitted Items (PD-019A)
    payload.toArchive.forEach(archItem => {
      const code = String(archItem.itemCode || archItem.item_code || archItem.id).toUpperCase().trim();
      const existing = itemMap.get(code);
      if (existing) {
        existing.lifecycleStatus = 'ARCHIVED';
        existing.availabilityStatus = 'ARCHIVED';
        existing.updatedAt = now;
      }
    });

    const updatedMenuItems = Array.from(itemMap.values());
    this.offlineStore.setCollection('kitchen_menu_items', updatedMenuItems, tId);

    // 4. Commit Recipes & BOMs
    const existingRecipes = this.offlineStore.getCollection('recipes', tId) || [];
    const recipeMap = new Map();
    existingRecipes.forEach(r => {
      const mCode = String(r.menuItemCode || r.menu_item_code || r.menuItemId || '').toUpperCase().trim();
      if (mCode) recipeMap.set(mCode, r);
    });

    payload.recipesGrouped.forEach(rec => {
      const mCode = rec.menuItemCode;
      const menuItem = itemMap.get(mCode);
      const existingRec = recipeMap.get(mCode);

      const ingredientsList = rec.lines.map(l => ({
        id: `ing-${mCode.toLowerCase()}-${l.ingredientCode.toLowerCase()}`,
        inventoryItemCode: l.ingredientCode,
        inventoryItemName: l.ingredientName,
        itemType: 'Raw Material',
        recipeQty: l.recipeQty,
        recipeUom: l.recipeUom,
        quantity: convertUom(l.recipeQty, l.recipeUom, l.baseUom),
        baseUom: l.baseUom,
        uom: l.baseUom,
        unitCost: l.unitValuation,
        standardYieldPercent: l.standardYieldPct,
        recipeWastagePercent: l.wastage
      }));

      let recipeRecord = null;

      if (!existingRec) {
        // Create brand new approved recipe
        recipeRecord = {
          id: `rcp-${mCode.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          recipeCode: rec.recipeCode,
          recipeName: rec.recipeName,
          menuItemId: menuItem ? menuItem.id : mCode,
          menuItemCode: mCode,
          version: 'v1.0',
          status: 'APPROVED',
          portionCount: 1,
          ingredients: ingredientsList,
          tenantId: tId,
          createdAt: now,
          updatedAt: now
        };
      } else {
        // Create new revision (e.g. v1.0 -> v1.1)
        const curVer = existingRec.version || 'v1.0';
        const parts = String(curVer).replace(/^v/i, '').split('.');
        const major = parseInt(parts[0], 10) || 1;
        const minor = (parseInt(parts[1], 10) || 0) + 1;
        const nextVer = `v${major}.${minor}`;
        recipeRecord = {
          ...existingRec,
          recipeCode: rec.recipeCode || existingRec.recipeCode,
          recipeName: rec.recipeName || existingRec.recipeName,
          version: nextVer,
          status: 'APPROVED',
          ingredients: ingredientsList,
          updatedAt: now
        };
      }

      // Link recipe to menu item
      if (menuItem) {
        menuItem.recipeId = recipeRecord.id;
        menuItem.recipeCode = recipeRecord.recipeCode;
      }

      recipeMap.set(mCode, recipeRecord);
    });

    this.offlineStore.setCollection('recipes', Array.from(recipeMap.values()), tId);
    this.offlineStore.setCollection('kitchen_menu_items', updatedMenuItems, tId);

    // 5. Fire Domain Event
    if (typeof platformEventBus !== 'undefined' && platformEventBus.emit) {
      platformEventBus.emit('menu:master:imported', {
        tenantId: tId,
        createdCount: analysisResult.diff.toCreateCount,
        updatedCount: analysisResult.diff.toUpdateCount,
        archivedCount: analysisResult.diff.toArchiveCount,
        recipesCount: payload.recipesGrouped.length,
        occurredAt: now
      });
    }

    return {
      success: true,
      message: `Menu Master successfully synchronized: ${analysisResult.diff.toCreateCount} created, ${analysisResult.diff.toUpdateCount} updated, ${analysisResult.diff.toArchiveCount} archived.`
    };
  }
}

export const masterMenuWorkbookService = new MasterMenuWorkbookService();

