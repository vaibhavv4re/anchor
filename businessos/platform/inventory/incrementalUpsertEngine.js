/**
 * BusinessOS Platform - Incremental Upsert Engine (F9.5)
 * Compares incoming package rows against existing local repository state.
 * Performs diff categorization (NEW, UPDATED, UNCHANGED, ERROR).
 * Enforces Recipe Revision Preservation: Recipe updates create new revisions (Rev 1 -> Rev 2)
 * rather than overwriting historical recipe revisions linked to past orders.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

export class IncrementalUpsertEngine {
  /**
   * Helper to resolve field value regardless of snake_case or camelCase.
   */
  _getVal(row, fieldSnake, fieldCamel) {
    if (!row) return undefined;
    if (row[fieldSnake] !== undefined) return row[fieldSnake];
    if (row[fieldCamel] !== undefined) return row[fieldCamel];
    return undefined;
  }

  /**
   * Generates pre-import diff preview comparing incoming package against store state.
   * @param {Object} parsedPackage - Keyed by fileType
   * @returns {Object} Preview breakdown per collection { NEW, UPDATED, UNCHANGED, ERROR }
   */
  generateDiffPreview(parsedPackage = {}) {
    const diffSummary = {};

    Object.keys(parsedPackage).forEach(fileType => {
      const rows = parsedPackage[fileType];
      if (!Array.isArray(rows)) return;

      const collectionName = this._mapFileTypeToCollection(fileType);
      const existingRecords = offlineStore.getCollection(collectionName) || [];
      const keyFieldSnake = this._getKeyFieldSnakeForFileType(fileType);
      const keyFieldCamel = this._getKeyFieldCamelForFileType(fileType);

      const existingMap = new Map();
      existingRecords.forEach(rec => {
        const key = rec[keyFieldCamel] || rec[keyFieldSnake] || rec.id || rec.itemCode || rec.menuCode || rec.recipeCode;
        if (key) existingMap.set(String(key).trim(), rec);
      });

      let newCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;

      rows.forEach(row => {
        const key = String(this._getVal(row, keyFieldSnake, keyFieldCamel) || '').trim();
        if (!key || !existingMap.has(key)) {
          newCount++;
        } else {
          const existing = existingMap.get(key);
          if (this._isRowEqual(row, existing)) {
            unchangedCount++;
          } else {
            updatedCount++;
          }
        }
      });

      diffSummary[fileType] = {
        collection: collectionName,
        total: rows.length,
        NEW: newCount,
        UPDATED: updatedCount,
        UNCHANGED: unchangedCount,
        ERROR: 0
      };
    });

    return diffSummary;
  }

  /**
   * Commits import package to local store with recipe revision preservation.
   * @param {Object} parsedPackage 
   * @param {Object} userContext - { userId, role, tenantId }
   * @returns {Object} Commit summary
   */
  commitPackage(parsedPackage = {}, userContext = {}) {
    const commitReport = {
      importId: `IMP-${Date.now()}`,
      timestamp: new Date().toISOString(),
      performedBy: {
        userId: userContext.userId || 'user-admin',
        role: userContext.role || 'Super Admin',
        tenantId: userContext.tenantId || 'tenant-demo'
      },
      counts: {}
    };

    // 1. Process Inventory Master
    if (Array.isArray(parsedPackage.INVENTORY_MASTER)) {
      const items = offlineStore.getCollection('inventory_items') || [];
      const itemMap = new Map(items.map(i => [i.itemCode, i]));

      parsedPackage.INVENTORY_MASTER.forEach(row => {
        const itemCode = this._getVal(row, 'item_code', 'itemCode');
        const itemName = this._getVal(row, 'item_name', 'itemName');
        const existing = itemMap.get(itemCode);

        const record = {
          id: existing ? existing.id : `inv-${itemCode.toLowerCase()}`,
          tenantId: userContext.tenantId || 'tenant-demo',
          itemCode,
          itemName,
          itemType: this._getVal(row, 'item_type', 'itemType') || 'Raw Material',
          categoryCode: this._getVal(row, 'category_code', 'categoryCode') || 'CAT-GEN',
          baseUom: this._getVal(row, 'base_uom', 'baseUom') || 'KG',
          purchaseUom: this._getVal(row, 'purchase_uom', 'purchaseUom') || 'KG',
          conversionFactor: Number(this._getVal(row, 'conversion_factor', 'conversionFactor') || 1),
          defaultLocationCode: this._getVal(row, 'default_location_code', 'defaultLocationCode') || 'LOC-MWH',
          defaultSupplierCode: this._getVal(row, 'default_supplier_code', 'defaultSupplierCode') || '',
          lastPurchasePrice: Number(this._getVal(row, 'last_purchase_price', 'lastPurchasePrice') || 0),
          isStockable: true,
          isRecipeIngredient: true,
          autoDeductionEnabled: true,
          updatedAt: new Date().toISOString()
        };
        itemMap.set(itemCode, record);
      });

      offlineStore.setCollection('inventory_items', Array.from(itemMap.values()));
      commitReport.counts.INVENTORY_MASTER = parsedPackage.INVENTORY_MASTER.length;
    }

    // 2. Process Suppliers
    if (Array.isArray(parsedPackage.SUPPLIERS)) {
      const suppliers = offlineStore.getCollection('suppliers') || [];
      const suppMap = new Map(suppliers.map(s => [s.supplierCode, s]));

      parsedPackage.SUPPLIERS.forEach(row => {
        const supplierCode = this._getVal(row, 'supplier_code', 'supplierCode');
        const existing = suppMap.get(supplierCode);
        suppMap.set(supplierCode, {
          id: existing ? existing.id : `sup-${supplierCode.toLowerCase()}`,
          tenantId: userContext.tenantId || 'tenant-demo',
          supplierCode,
          supplierName: this._getVal(row, 'supplier_name', 'supplierName'),
          primaryContact: this._getVal(row, 'primary_contact', 'primaryContact') || '',
          phone: this._getVal(row, 'phone', 'phone') || '',
          email: this._getVal(row, 'email', 'email') || '',
          address: this._getVal(row, 'address', 'address') || '',
          gstin: this._getVal(row, 'gstin', 'gstin') || '',
          updatedAt: new Date().toISOString()
        });
      });

      offlineStore.setCollection('suppliers', Array.from(suppMap.values()));
      commitReport.counts.SUPPLIERS = parsedPackage.SUPPLIERS.length;
    }

    // 3. Process Food & Bar Menus
    ['FOOD_MENU', 'BAR_MENU'].forEach(menuType => {
      const rows = parsedPackage[menuType];
      if (!Array.isArray(rows)) return;

      const menuCollection = menuType === 'FOOD_MENU' ? 'food_menu_items' : 'bar_menu_items';
      const existingMenu = offlineStore.getCollection(menuCollection) || [];
      const menuMap = new Map(existingMenu.map(m => [m.menuCode, m]));

      rows.forEach(row => {
        const menuCode = this._getVal(row, 'menu_code', 'menuCode');
        const existing = menuMap.get(menuCode);
        menuMap.set(menuCode, {
          id: existing ? existing.id : `menu-${menuCode.toLowerCase()}`,
          tenantId: userContext.tenantId || 'tenant-demo',
          menuCode,
          categoryName: this._getVal(row, 'category_name', 'categoryName') || 'General',
          itemName: this._getVal(row, 'item_name', 'itemName'),
          description: this._getVal(row, 'description', 'description') || '',
          isVegetarian: this._getVal(row, 'is_vegetarian', 'isVegetarian') !== false,
          isAlcoholic: this._getVal(row, 'is_alcoholic', 'isAlcoholic') === true,
          productionRouting: this._getVal(row, 'production_routing', 'productionRouting') || (menuType === 'FOOD_MENU' ? 'KITCHEN' : 'BAR'),
          updatedAt: new Date().toISOString()
        });
      });

      offlineStore.setCollection(menuCollection, Array.from(menuMap.values()));
      commitReport.counts[menuType] = rows.length;
    });

    // 4. Process Variants
    ['FOOD_VARIANTS', 'BAR_VARIANTS'].forEach(variantType => {
      const rows = parsedPackage[variantType];
      if (!Array.isArray(rows)) return;

      const variants = offlineStore.getCollection('menu_variants') || [];
      const varMap = new Map(variants.map(v => [`${v.menuCode}_${v.variantCode}`, v]));

      rows.forEach(row => {
        const menuCode = this._getVal(row, 'menu_code', 'menuCode');
        const variantCode = this._getVal(row, 'variant_code', 'variantCode');
        const key = `${menuCode}_${variantCode}`;
        const existing = varMap.get(key);

        varMap.set(key, {
          id: existing ? existing.id : `var-${menuCode.toLowerCase()}-${variantCode.toLowerCase()}`,
          tenantId: userContext.tenantId || 'tenant-demo',
          menuCode,
          variantCode,
          variantName: this._getVal(row, 'variant_name', 'variantName'),
          sellingPrice: Number(this._getVal(row, 'selling_price', 'sellingPrice') || 0),
          recipeCode: this._getVal(row, 'recipe_code', 'recipeCode') || '',
          updatedAt: new Date().toISOString()
        });
      });

      offlineStore.setCollection('menu_variants', Array.from(varMap.values()));
      commitReport.counts[variantType] = rows.length;
    });

    // 5. Process Recipes with RECIPE REVISION PRESERVATION!
    ['FOOD_RECIPES', 'BAR_RECIPES'].forEach(recipeType => {
      const rows = parsedPackage[recipeType];
      if (!Array.isArray(rows)) return;

      const recipes = offlineStore.getCollection('recipes') || [];
      const recipeRevisions = offlineStore.getCollection('recipe_revisions') || [];
      const recipeMap = new Map(recipes.map(r => [r.recipeCode, r]));

      // Group rows by recipeCode
      const grouped = new Map();
      rows.forEach(row => {
        const recipeCode = this._getVal(row, 'recipe_code', 'recipeCode');
        if (!recipeCode) return;
        if (!grouped.has(recipeCode)) grouped.set(recipeCode, []);
        grouped.get(recipeCode).push({
          ingredientCode: this._getVal(row, 'ingredient_code', 'ingredientCode'),
          quantity: Number(this._getVal(row, 'quantity', 'quantity')),
          unit: this._getVal(row, 'unit', 'unit')
        });
      });

      grouped.forEach((ingredients, recipeCode) => {
        const existingRecipe = recipeMap.get(recipeCode);

        let newRevisionNumber = 1;
        if (existingRecipe) {
          newRevisionNumber = (existingRecipe.activeRevision || 1) + 1;
        }

        const revisionRecord = {
          id: `rev-${recipeCode.toLowerCase()}-v${newRevisionNumber}`,
          recipeCode,
          revisionNumber: newRevisionNumber,
          ingredients,
          createdAt: new Date().toISOString(),
          createdBy: userContext.userId || 'user-admin'
        };

        recipeRevisions.push(revisionRecord);

        recipeMap.set(recipeCode, {
          id: existingRecipe ? existingRecipe.id : `rec-${recipeCode.toLowerCase()}`,
          tenantId: userContext.tenantId || 'tenant-demo',
          recipeCode,
          recipeName: rows.find(r => this._getVal(r, 'recipe_code', 'recipeCode') === recipeCode)?.recipe_name || recipeCode,
          activeRevision: newRevisionNumber,
          ingredients,
          updatedAt: new Date().toISOString()
        });
      });

      offlineStore.setCollection('recipes', Array.from(recipeMap.values()));
      offlineStore.setCollection('recipe_revisions', recipeRevisions);
      commitReport.counts[recipeType] = rows.length;
    });

    // 6. Process Opening Stock
    if (Array.isArray(parsedPackage.OPENING_STOCK)) {
      const stockLedger = offlineStore.getCollection('stock_ledger') || [];
      parsedPackage.OPENING_STOCK.forEach(row => {
        const itemCode = this._getVal(row, 'item_code', 'itemCode');
        const qty = Number(this._getVal(row, 'quantity', 'quantity') || 0);
        const cost = Number(this._getVal(row, 'unit_cost', 'unitCost') || 0);

        stockLedger.push({
          id: `stk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          tenantId: userContext.tenantId || 'tenant-demo',
          itemCode,
          locationCode: this._getVal(row, 'location_code', 'locationCode') || 'LOC-MWH',
          movementType: 'OPENING_BALANCE',
          quantity: qty,
          unit: this._getVal(row, 'unit', 'unit') || 'KG',
          unitCost: cost,
          valuationTotal: qty * cost,
          notes: this._getVal(row, 'notes', 'notes') || 'Opening stock baseline via F9 import',
          createdAt: new Date().toISOString(),
          createdBy: userContext.userId || 'user-admin'
        });
      });

      offlineStore.setCollection('stock_ledger', stockLedger);
      commitReport.counts.OPENING_STOCK = parsedPackage.OPENING_STOCK.length;
    }

    platformEventBus.publish('import:committed', commitReport);
    return commitReport;
  }

  _mapFileTypeToCollection(fileType) {
    const map = {
      INVENTORY_MASTER: 'inventory_items',
      SUPPLIERS: 'suppliers',
      FOOD_MENU: 'food_menu_items',
      BAR_MENU: 'bar_menu_items',
      FOOD_VARIANTS: 'menu_variants',
      BAR_VARIANTS: 'menu_variants',
      FOOD_RECIPES: 'recipes',
      BAR_RECIPES: 'recipes',
      OPENING_STOCK: 'stock_ledger'
    };
    return map[fileType] || fileType.toLowerCase();
  }

  _getKeyFieldSnakeForFileType(fileType) {
    if (fileType === 'INVENTORY_MASTER' || fileType === 'OPENING_STOCK') return 'item_code';
    if (fileType === 'SUPPLIERS') return 'supplier_code';
    if (fileType === 'FOOD_MENU' || fileType === 'BAR_MENU') return 'menu_code';
    if (fileType === 'FOOD_VARIANTS' || fileType === 'BAR_VARIANTS') return 'variant_code';
    if (fileType === 'FOOD_RECIPES' || fileType === 'BAR_RECIPES') return 'recipe_code';
    return 'id';
  }

  _getKeyFieldCamelForFileType(fileType) {
    if (fileType === 'INVENTORY_MASTER' || fileType === 'OPENING_STOCK') return 'itemCode';
    if (fileType === 'SUPPLIERS') return 'supplierCode';
    if (fileType === 'FOOD_MENU' || fileType === 'BAR_MENU') return 'menuCode';
    if (fileType === 'FOOD_VARIANTS' || fileType === 'BAR_VARIANTS') return 'variantCode';
    if (fileType === 'FOOD_RECIPES' || fileType === 'BAR_RECIPES') return 'recipeCode';
    return 'id';
  }

  _isRowEqual(rowA, rowB) {
    if (!rowA || !rowB) return false;
    return Object.keys(rowA).every(k => String(rowA[k] || '').trim() === String(rowB[k] || '').trim());
  }
}

export const incrementalUpsertEngine = new IncrementalUpsertEngine();
