/**
 * BusinessOS Platform - Kitchen Domain Model (K-03 Recipes & BOM)
 * Manages recipes and recipe_ingredients collections in offlineStore.
 * Enforces strict reference to Master Inventory itemCode (PD-024).
 * Calculates dynamic costing from inventory valuation, yield %, and wastage %.
 * Implements immutable approval locking, historical cost snapshots, and revision cloning.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { kitchenMenuModel } from './kitchenMenuModel.js';

class RecipeModel {
  /**
   * Retrieve recipes for tenant with optional filters
   * @param {string|null} tenantId 
   * @param {Object} filters { status, menuItemId, searchQuery }
   * @returns {Array<Object>}
   */
  getAll(tenantId = null, filters = {}) {
    const rawList = offlineStore.getCollection('recipes', tenantId) || [];
    return rawList.filter(recipe => {
      if (tenantId && recipe.tenantId && recipe.tenantId !== tenantId) return false;
      if (filters.status && recipe.status !== filters.status) return false;
      if (filters.menuItemId && recipe.menuItemId !== filters.menuItemId) return false;
      if (filters.searchQuery && filters.searchQuery.trim() !== '') {
        const q = filters.searchQuery.toLowerCase().trim();
        const nameMatch = (recipe.recipeName || '').toLowerCase().includes(q);
        const codeMatch = (recipe.recipeCode || '').toLowerCase().includes(q);
        if (!nameMatch && !codeMatch) return false;
      }
      return true;
    });
  }

  /**
   * Get single recipe by ID
   * @param {string} id 
   * @returns {Object|null}
   */
  getById(id) {
    const list = offlineStore.getCollection('recipes') || [];
    return list.find(r => r.id === id) || null;
  }

  /**
   * Get active approved recipe for a menu item
   * @param {string} menuItemId 
   * @returns {Object|null}
   */
  getActiveRecipeForMenuItem(menuItemId) {
    const list = offlineStore.getCollection('recipes') || [];
    const approved = list.filter(r => r.menuItemId === menuItemId && r.status === 'APPROVED');
    if (approved.length === 0) return null;
    approved.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return approved[0];
  }

  /**
   * Get all revisions for a menu item
   * @param {string} menuItemId 
   * @returns {Array<Object>}
   */
  getRevisionsForMenuItem(menuItemId) {
    const list = offlineStore.getCollection('recipes') || [];
    return list.filter(r => r.menuItemId === menuItemId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Create new Draft Recipe Header
   * @param {Object} data { recipeName, menuItemId, yieldQuantity, yieldUom, portionCount, prepTimeMinutes, cookTimeMinutes, instructions, tenantId }
   * @returns {Object}
   */
  createRecipe(data) {
    const list = offlineStore.getCollection('recipes') || [];
    const now = new Date().toISOString();
    const recipeId = data.id || `rcp-${Math.random().toString(36).substring(2, 9)}`;
    const recipeCode = data.recipeCode || `RCP-${Math.floor(1000 + Math.random() * 9000)}`;

    const newRecipe = {
      id: recipeId,
      recipeCode,
      recipeName: data.recipeName || 'Untitled Recipe',
      menuItemId: data.menuItemId || null,
      menuItemCode: data.menuItemCode || null,
      version: data.version || 'v1.0',
      status: 'DRAFT', // DRAFT | SUBMITTED | APPROVED | ARCHIVED
      yieldQuantity: parseFloat(data.yieldQuantity) || 1,
      yieldUom: data.yieldUom || 'PORTION',
      portionCount: parseInt(data.portionCount) || 1,
      prepTimeMinutes: parseInt(data.prepTimeMinutes) || 15,
      cookTimeMinutes: parseInt(data.cookTimeMinutes) || 15,
      instructions: data.instructions || '',
      ingredients: data.ingredients || [], // Array of ingredient line objects
      totalCost: 0,
      costPerPortion: 0,
      costSnapshotAtApproval: null,
      tenantId: data.tenantId || null,
      createdAt: now,
      updatedAt: now
    };

    list.push(newRecipe);
    offlineStore.setCollection('recipes', list);
    return newRecipe;
  }

  /**
   * Update DRAFT Recipe Header & Ingredients
   * Cannot edit directly if already APPROVED 🔒 (Must use createRevision)
   * @param {string} id 
   * @param {Object} updates 
   * @returns {Object}
   */
  updateRecipe(id, updates) {
    const list = offlineStore.getCollection('recipes') || [];
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) throw new Error(`Recipe ${id} not found.`);

    const current = list[idx];
    if (current.status === 'APPROVED' && updates.status !== 'ARCHIVED') {
      throw new Error('Approved recipes are locked 🔒 and cannot be edited in place. Create a new revision instead.');
    }

    const updated = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // Recalculate costs if ingredients or portions changed
    const costAnalysis = this.calculateCost(updated, updated.tenantId);
    updated.totalCost = costAnalysis.totalCost;
    updated.costPerPortion = costAnalysis.costPerPortion;
    updated.ingredients = costAnalysis.lines;

    list[idx] = updated;
    offlineStore.setCollection('recipes', list);
    return updated;
  }

  /**
   * Calculate live recipe cost pulling valuation from Master Inventory
   * Applies Yield Loss (from inventory.standardYieldPercent) & Recipe Wastage cleanly.
   * @param {Object} recipe 
   * @param {string|null} tenantId 
   * @returns {{ totalCost: number, costPerPortion: number, lines: Array<Object> }}
   */
  calculateCost(recipe, tenantId = null) {
    const rawMasterInv = offlineStore.getCollection('inventory', tenantId) || [];
    const ingredients = recipe.ingredients || [];
    let totalCost = 0;

    const evaluatedLines = ingredients.map(line => {
      // Find Master Inventory item by canonical itemCode
      const masterItem = rawMasterInv.find(i => i.itemCode === line.inventoryItemCode || i.item_code === line.inventoryItemCode);

      const unitCost = masterItem
        ? (parseFloat(masterItem.lastPurchasePrice || masterItem.unitValuation || masterItem.unit_valuation) || 0)
        : (parseFloat(line.unitCost) || 0);

      const itemType = masterItem ? (masterItem.itemType || masterItem.item_type || 'Raw Material') : (line.itemType || 'Raw Material');
      const itemName = masterItem ? (masterItem.itemName || masterItem.item_name) : (line.inventoryItemName || 'Unknown Ingredient');
      const baseUom = masterItem ? (masterItem.baseUom || masterItem.base_uom || 'KG') : (line.uom || 'KG');

      // 1. Yield Loss Calculation (inventory.standardYieldPercent)
      const stdYieldPct = masterItem ? (parseFloat(masterItem.standardYieldPercent || masterItem.standard_yield_percent) || 100) : 100;
      const yieldFactor = stdYieldPct > 0 ? (stdYieldPct / 100) : 1.0;
      const netQty = parseFloat(line.quantity) || 0;
      const grossQtyFromYield = yieldFactor > 0 ? (netQty / yieldFactor) : netQty;

      // 2. Recipe-level Wastage Allowance
      const recipeWastagePct = parseFloat(line.recipeWastagePercent) || 0;
      const wastageFactor = 1 + (recipeWastagePct / 100);

      // Total Effective Quantity & Line Cost
      const effectiveGrossQty = grossQtyFromYield * wastageFactor;
      const lineCost = effectiveGrossQty * unitCost;

      totalCost += lineCost;

      return {
        ...line,
        inventoryItemName: itemName,
        itemType,
        uom: baseUom,
        unitCost,
        standardYieldPercent: stdYieldPct,
        grossQuantity: parseFloat(effectiveGrossQty.toFixed(4)),
        lineCost: parseFloat(lineCost.toFixed(2))
      };
    });

    const portionCount = parseInt(recipe.portionCount) || 1;
    const costPerPortion = portionCount > 0 ? (totalCost / portionCount) : totalCost;

    return {
      totalCost: parseFloat(totalCost.toFixed(2)),
      costPerPortion: parseFloat(costPerPortion.toFixed(2)),
      lines: evaluatedLines
    };
  }

  /**
   * Approve a Recipe (Locking revision & creating cost snapshot)
   * Link approved recipe back to menuItem.recipeId
   * @param {string} recipeId 
   * @returns {Object}
   */
  approveRecipe(recipeId) {
    const list = offlineStore.getCollection('recipes') || [];
    const recipe = list.find(r => r.id === recipeId);
    if (!recipe) throw new Error(`Recipe ${recipeId} not found.`);

    // Recalculate final costs & snapshot
    const costAnalysis = this.calculateCost(recipe, recipe.tenantId);
    const now = new Date().toISOString();

    const snapshot = {
      approvedAt: now,
      totalCost: costAnalysis.totalCost,
      costPerPortion: costAnalysis.costPerPortion,
      linesSnapshot: costAnalysis.lines.map(l => ({
        inventoryItemCode: l.inventoryItemCode,
        inventoryItemName: l.inventoryItemName,
        netQuantity: l.quantity,
        grossQuantity: l.grossQuantity,
        uom: l.uom,
        unitCost: l.unitCost,
        lineCost: l.lineCost
      }))
    };

    recipe.status = 'APPROVED';
    recipe.totalCost = costAnalysis.totalCost;
    recipe.costPerPortion = costAnalysis.costPerPortion;
    recipe.ingredients = costAnalysis.lines;
    recipe.costSnapshotAtApproval = snapshot;
    recipe.updatedAt = now;

    // Archive any previous APPROVED recipes for this menuItemId
    if (recipe.menuItemId) {
      list.forEach(r => {
        if (r.menuItemId === recipe.menuItemId && r.id !== recipe.id && r.status === 'APPROVED') {
          r.status = 'ARCHIVED';
          r.updatedAt = now;
        }
      });

      // Update menu item recipe pointer (PD-024)
      const menuList = offlineStore.getCollection('kitchen_menu_items') || [];
      const menuItem = menuList.find(m => m.id === recipe.menuItemId || m.itemCode === recipe.menuItemCode);
      if (menuItem) {
        menuItem.recipeId = recipe.id;
        menuItem.updatedAt = now;
        offlineStore.setCollection('kitchen_menu_items', menuList);
      }
    }

    offlineStore.setCollection('recipes', list);
    return recipe;
  }

  /**
   * Spawn a new DRAFT revision from an existing APPROVED recipe (e.g. v1.0 -> v1.1)
   * @param {string} recipeId 
   * @returns {Object}
   */
  createRevision(recipeId) {
    const source = this.getById(recipeId);
    if (!source) throw new Error(`Source recipe ${recipeId} not found.`);

    const currentVerStr = source.version || 'v1.0';
    const match = currentVerStr.match(/v?(\d+)\.(\d+)/);
    let newVersion = 'v1.1';
    if (match) {
      const major = parseInt(match[1]);
      const minor = parseInt(match[2]) + 1;
      newVersion = `v${major}.${minor}`;
    }

    const revisionData = {
      recipeName: `${source.recipeName}`,
      recipeCode: source.recipeCode,
      menuItemId: source.menuItemId,
      menuItemCode: source.menuItemCode,
      version: newVersion,
      yieldQuantity: source.yieldQuantity,
      yieldUom: source.yieldUom,
      portionCount: source.portionCount,
      prepTimeMinutes: source.prepTimeMinutes,
      cookTimeMinutes: source.cookTimeMinutes,
      instructions: source.instructions,
      ingredients: source.ingredients.map(i => ({ ...i, id: `line-${Math.random().toString(36).substring(2, 7)}` })),
      tenantId: source.tenantId
    };

    return this.createRecipe(revisionData);
  }
}

export const recipeModel = new RecipeModel();
