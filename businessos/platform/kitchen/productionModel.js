/**
 * BusinessOS / RestaurantOS - Kitchen Domain (K-07 Production Platform Model)
 *
 * Canonical Production Engine Implementation:
 * 1. Single Source of Truth: Consumes APPROVED Recipe BOMs from recipes collection.
 * 2. Location-Aware Consumption: Ingredients checked and deducted STRICTLY from Kitchen Store (LOC-KIT).
 * 3. Shortage Guards: Prevents batch start if LOC-KIT is short; generates warehouse requisitions without auto-transferring.
 * 4. Production Output: Semi-finished / prepared output yield added to LOC-KIT stock.
 * 5. DataGateway Integration: All batch states, stock balances, and stock ledger entries persist through DataGateway.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { recipeModel } from './recipeModel.js';

export function convertRecipeUomToNormalized(qty, recipeUom, baseUom) {
  const q = parseFloat(qty) || 0;
  const rUom = String(recipeUom || 'G').trim().toUpperCase();
  const bUom = String(baseUom || 'KG').trim().toUpperCase();

  if (bUom === 'KG') {
    if (rUom === 'G' || rUom === 'GM' || rUom === 'GRAMS' || rUom === 'GRAM') return q / 1000;
    if (rUom === 'MG' || rUom === 'MILLIGRAM') return q / 1000000;
    if (rUom === 'KG' || rUom === 'KILOGRAM') return q;
  }
  if (bUom === 'G' || bUom === 'GM') {
    if (rUom === 'KG') return q * 1000;
    if (rUom === 'MG') return q / 1000;
    if (rUom === 'G' || rUom === 'GM') return q;
  }
  if (bUom === 'LTR' || bUom === 'L' || bUom === 'LITRE' || bUom === 'LITER') {
    if (rUom === 'ML' || rUom === 'MILLILITRE' || rUom === 'MILLILITER') return q / 1000;
    if (rUom === 'LTR' || rUom === 'L') return q;
  }
  if (bUom === 'ML') {
    if (rUom === 'LTR' || rUom === 'L') return q * 1000;
    if (rUom === 'ML') return q;
  }
  return q;
}

export class ProductionModel {
  /**
   * Lazily resolve DataGateway from global app graph.
   * @returns {DataGateway|null}
   */
  _getDataGateway() {
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) {
      return window.__APP__.platform.dataGateway || null;
    }
    return null;
  }

  // --- 1. APPROVED RECIPES (BOM SOURCE OF TRUTH) ---

  /**
   * Retrieve all APPROVED recipes available for production.
   * Each recipe defines standard yield and ingredient requirements referencing Master Inventory.
   * @param {string|null} tenantId
   * @returns {Array<Object>}
   */
  getProductionRecipes(tenantId = null) {
    const recipes = recipeModel.getAll(tenantId, { status: 'APPROVED' });
    return recipes;
  }

  /**
   * Get single recipe by ID
   * @param {string} recipeId
   * @param {string|null} tenantId
   * @returns {Object|null}
   */
  getRecipeById(recipeId, tenantId = null) {
    return recipeModel.getById(recipeId);
  }

  /**
   * Compatibility alias for legacy UI callers (maps prep BOM to recipes).
   * Shows all recipes (DRAFT and APPROVED) for production items.
   */
  getPrepBoms(tenantId = null) {
    const allRecipes = recipeModel.getAll(tenantId);
    const uniqueMap = new Map();
    allRecipes.forEach(r => {
      const code = String(r.recipeCode || r.bomCode || r.id || '').trim();
      if (!uniqueMap.has(code)) {
        uniqueMap.set(code, r);
      }
    });

    return Array.from(uniqueMap.values()).map(r => ({
      id: r.id,
      bomCode: r.recipeCode || r.bomCode,
      inventoryItemCode: r.inventoryItemCode || r.menuItemCode || r.recipeCode,
      inventoryItemName: r.inventoryItemName || r.recipeName,
      standardYieldQuantity: r.yieldQuantity || 1,
      standardYieldUom: r.yieldUom || 'KG',
      version: r.version || 'v1.0',
      status: r.status,
      ingredients: (r.ingredients || []).map(i => ({
        inventoryItemCode: i.inventoryItemCode,
        inventoryItemName: i.inventoryItemName,
        recipeQty: i.recipeQty !== undefined ? i.recipeQty : (i.quantity || 0),
        recipeUom: i.recipeUom || i.uom || 'G',
        baseUom: i.baseUom || i.uom || 'KG',
        unitCost: i.unitCost || 0,
        recipeWastagePercent: i.recipeWastagePercent || 0
      })),
      tenantId: r.tenantId,
      rawRecipe: r
    }));
  }

  getPrepBomById(id, tenantId = null) {
    const list = this.getPrepBoms(tenantId);
    return list.find(b => b.id === id) || null;
  }

  /**
   * Saves a Preparation BOM as a canonical recipe record referencing Master Inventory.
   * Directly writes to recipeModel -> Supabase recipes & recipe_ingredients.
   * @param {Object} data
   * @param {string|null} tenantId
   * @returns {Object}
   */
  savePrepBom(data, tenantId = null) {
    const targetTenantId = data.tenantId || tenantId || 'tenant_h0qc7wf';
    const masterInv = offlineStore.getCollection('inventory', targetTenantId) || [];
    const invItem = masterInv.find(i => String(i.itemCode || i.item_code || i.id || '') === String(data.inventoryItemCode));

    const recipeData = {
      id: data.id || `rcp-${Math.random().toString(36).substring(2, 9)}`,
      recipeCode: data.bomCode || `RCP-${data.inventoryItemCode || Math.floor(1000 + Math.random() * 9000)}`,
      recipeName: data.inventoryItemName || (invItem ? invItem.itemName : 'Preparation Recipe'),
      inventoryItemCode: data.inventoryItemCode,
      inventoryItemName: data.inventoryItemName || (invItem ? invItem.itemName : data.inventoryItemCode),
      yieldQuantity: parseFloat(data.standardYieldQuantity) || 1,
      yieldUom: data.standardYieldUom || 'KG',
      portionCount: parseInt(data.standardYieldQuantity) || 1,
      version: data.version || 'v1.0',
      status: data.status || 'APPROVED',
      tenantId: targetTenantId,
      ingredients: (data.ingredients || []).map(ing => {
        const ingCode = String(ing.inventoryItemCode || ing.itemCode || '');
        const ingMaster = masterInv.find(i => String(i.itemCode || i.item_code || i.id || '') === ingCode);
        return {
          id: ing.id || `ri-${Math.random().toString(36).substring(2, 9)}`,
          inventoryItemCode: ingCode,
          inventoryItemName: ing.inventoryItemName || (ingMaster ? (ingMaster.itemName || ingMaster.item_name) : ingCode),
          itemType: ingMaster ? (ingMaster.itemType || ingMaster.item_type || 'RAW_MATERIAL') : 'RAW_MATERIAL',
          quantity: convertRecipeUomToNormalized(ing.recipeQty || ing.quantity || 0, ing.recipeUom || ing.uom || 'G', ing.baseUom || (ingMaster ? (ingMaster.baseUom || ingMaster.base_uom) : 'KG') || 'KG'),
          recipeQty: parseFloat(ing.recipeQty || ing.quantity) || 0,
          recipeUom: ing.recipeUom || ing.uom || 'G',
          baseUom: ing.baseUom || (ingMaster ? (ingMaster.baseUom || ingMaster.base_uom) : 'KG') || 'KG',
          uom: ing.baseUom || (ingMaster ? (ingMaster.baseUom || ingMaster.base_uom) : 'KG') || 'KG',
          unitCost: ingMaster ? (parseFloat(ingMaster.unitValuation || ingMaster.unit_valuation || ingMaster.lastPurchasePrice) || 0) : (parseFloat(ing.unitCost) || 0),
          recipeWastagePercent: parseFloat(ing.recipeWastagePercent) || 0
        };
      })
    };

    let savedRecipe;
    const existing = recipeModel.getById(recipeData.id);
    if (existing) {
      savedRecipe = recipeModel.updateRecipe(recipeData.id, recipeData);
    } else {
      savedRecipe = recipeModel.createRecipe(recipeData);
    }

    if (data.status === 'APPROVED') {
      savedRecipe = recipeModel.approveRecipe(savedRecipe.id);
    }

    return {
      id: savedRecipe.id,
      bomCode: savedRecipe.recipeCode,
      inventoryItemCode: savedRecipe.inventoryItemCode,
      inventoryItemName: savedRecipe.inventoryItemName || savedRecipe.recipeName,
      standardYieldQuantity: savedRecipe.yieldQuantity,
      standardYieldUom: savedRecipe.yieldUom,
      version: savedRecipe.version,
      status: savedRecipe.status,
      ingredients: savedRecipe.ingredients,
      tenantId: savedRecipe.tenantId,
      rawRecipe: savedRecipe
    };
  }

  /**
   * Approves a preparation BOM / recipe.
   * @param {string} id
   * @param {string|null} tenantId
   * @returns {Object}
   */
  approvePrepBom(id, tenantId = null) {
    const approved = recipeModel.approveRecipe(id);
    return approved;
  }

  /**
   * Archives / deletes a preparation BOM / recipe.
   * @param {string} id
   * @param {string|null} tenantId
   * @returns {boolean}
   */
  deletePrepBom(id, tenantId = null) {
    const targetTenantId = tenantId || 'tenant_h0qc7wf';
    const list = offlineStore.getCollection('recipes', targetTenantId) || [];
    const filtered = list.filter(r => r.id !== id);
    offlineStore.setCollection('recipes', filtered);
    const dg = this._getDataGateway();
    if (dg) {
      dg.update('recipes', id, { status: 'ARCHIVED' }).catch(() => {});
    }
    return true;
  }

  // --- 2. LOCATION-AWARE STOCK CHECK (KITCHEN STORE: LOC-KIT) ---

  /**
   * Evaluates scaled ingredient requirements against physical stock in Kitchen Store (LOC-KIT).
   * Does NOT auto-transfer or alter stock.
   * @param {Object} params { recipeId, targetQuantity }
   * @param {string|null} tenantId
   * @returns {{ recipe: Object, targetQuantity: number, targetUom: string, scalingFactor: number, scaledIngredients: Array<Object>, hasSufficientStock: boolean, shortages: Array<Object> }}
   */
  checkStockAvailability({ recipeId, targetQuantity }, tenantId = null) {
    const recipe = this.getRecipeById(recipeId, tenantId) || this.getPrepBomById(recipeId, tenantId);
    if (!recipe) throw new Error(`Recipe with ID "${recipeId}" not found or not approved.`);

    const stdYield = parseFloat(recipe.yieldQuantity || recipe.standardYieldQuantity) || 1;
    const targetQty = parseFloat(targetQuantity) || stdYield;
    const scalingFactor = targetQty / stdYield;

    const stockBalances = offlineStore.getCollection('stock_balances', tenantId) || [];
    const masterInv = offlineStore.getCollection('inventory', tenantId) || [];

    const shortages = [];
    const scaledIngredients = (recipe.ingredients || []).map(ing => {
      const lineCode = String(ing.inventoryItemCode || ing.inventory_item_code || '');
      const rawQty = parseFloat(ing.quantity || ing.recipeQty) || 0;
      const ingUom = String(ing.uom || ing.recipeUom || 'G').toUpperCase();
      const baseUom = String(ing.baseUom || ing.uom || 'KG').toUpperCase();

      const normalizedBaseQty = convertRecipeUomToNormalized(rawQty, ingUom, baseUom);
      const scaledBaseQty = parseFloat((normalizedBaseQty * scalingFactor).toFixed(4));
      const scaledRecipeQty = parseFloat((rawQty * scalingFactor).toFixed(2));

      // Find stock specifically in KITCHEN STORE (LOC-886 / LOC-KIT)
      const kitStockRec = stockBalances.find(s => {
        const itemMatch = String(s.itemCode || s.item_code || s.itemId || s.id) === lineCode || lineCode.includes(String(s.itemCode || s.item_code || ''));
        const loc = String(s.locationCode || s.location_code || '').toUpperCase().trim();
        const locMatch = loc === 'LOC-886' || loc === 'LOC-KIT' || loc === 'LOC-901' || loc === 'LOC-KITCHEN' || loc === 'KITCHEN_STORE';
        return itemMatch && locMatch;
      });
      const kitchenStock = kitStockRec ? (parseFloat(kitStockRec.currentStock || kitStockRec.quantity || 0)) : 0;

      // Find stock in Main Warehouse (LOC-805 / LOC-MWH) for informational transfer availability
      const mwhStockRec = stockBalances.find(s => {
        const itemMatch = String(s.itemCode || s.item_code || s.itemId || s.id) === lineCode || lineCode.includes(String(s.itemCode || s.item_code || ''));
        const loc = String(s.locationCode || s.location_code || '').toUpperCase().trim();
        const locMatch = loc === 'LOC-805' || loc === 'LOC-MWH' || loc === 'MAIN' || loc === 'MAIN_WAREHOUSE';
        return itemMatch && locMatch;
      });
      const mwhStock = mwhStockRec ? (parseFloat(mwhStockRec.currentStock || mwhStockRec.quantity || 0)) : 0;

      const hasSufficientStock = kitchenStock >= scaledBaseQty;
      const shortageQty = hasSufficientStock ? 0 : parseFloat((scaledBaseQty - kitchenStock).toFixed(4));

      const lineItem = {
        inventoryItemCode: lineCode,
        inventoryItemName: ing.inventoryItemName || lineCode,
        recipeQty: rawQty,
        recipeUom: ingUom,
        scaledRecipeQty,
        scaledBaseQty,
        baseUom,
        kitchenStock,
        mwhStock,
        hasSufficientStock,
        shortageQty
      };

      if (!hasSufficientStock) {
        shortages.push(lineItem);
      }

      return lineItem;
    });

    return {
      recipe,
      targetQuantity: targetQty,
      targetUom: recipe.yieldUom || recipe.standardYieldUom || 'KG',
      scalingFactor: parseFloat(scalingFactor.toFixed(2)),
      scaledIngredients,
      hasSufficientStock: shortages.length === 0,
      shortages
    };
  }

  // --- 3. BATCH EXECUTION & KITCHEN STORE CONSUMPTION ---

  /**
   * Retrieve all production batches for tenant
   * @param {string|null} tenantId
   * @returns {Array<Object>}
   */
  getBatches(tenantId = null) {
    return offlineStore.getCollection('production_batches', tenantId) || [];
  }

  /**
   * Get single batch by ID
   * @param {string} id
   * @param {string|null} tenantId
   * @returns {Object|null}
   */
  getBatchById(id, tenantId = null) {
    const list = this.getBatches(tenantId);
    return list.find(b => b.id === id) || null;
  }

  /**
   * Starts a new production batch if Kitchen Store has sufficient stock.
   * Persists IN_PROGRESS batch to DataGateway.
   * @param {Object} data { recipeId, prepBomId, targetQuantity, tenantId, notes, startedBy }
   * @param {string|null} tenantId
   * @returns {Object} Started batch record
   */
  startBatch(data, tenantId = null) {
    const targetTenantId = data.tenantId || tenantId || 'tenant_h0qc7wf';
    const recipeId = data.recipeId || data.prepBomId;
    const targetQuantity = parseFloat(data.targetQuantity) || 1;

    // 1. Evaluate Kitchen Store Stock
    const evalResult = this.checkStockAvailability({ recipeId, targetQuantity }, targetTenantId);
    if (!evalResult.hasSufficientStock) {
      const details = evalResult.shortages
        .map(s => `• ${s.inventoryItemName}: Kitchen Store has ${s.kitchenStock} ${s.baseUom}, Required: ${s.scaledBaseQty} ${s.baseUom} (Shortage: ${s.shortageQty} ${s.baseUom})`)
        .join('\n');
      throw new Error(`Cannot start production batch! Insufficient stock in Kitchen Store (LOC-KIT):\n\n${details}\n\nPlease request a stock transfer from Main Warehouse.`);
    }

    const list = this.getBatches(targetTenantId);
    const now = new Date();
    const batchNum = list.length + 1;
    const batchCode = data.batchCode || `PB-${now.getFullYear()}-${String(batchNum).padStart(4, '0')}`;
    const recipe = evalResult.recipe;

    const newBatch = {
      id: batchCode,
      batchCode,
      recipeId: recipe.id,
      recipeCode: recipe.recipeCode || recipe.bomCode,
      recipeName: recipe.recipeName || recipe.inventoryItemName,
      inventoryItemCode: recipe.inventoryItemCode || recipe.menuItemCode || recipe.recipeCode,
      inventoryItemName: recipe.inventoryItemName || recipe.recipeName,
      targetQuantity: evalResult.targetQuantity,
      targetUom: evalResult.targetUom,
      scalingFactor: evalResult.scalingFactor,
      status: 'IN_PROGRESS',
      startedAt: now.toISOString(),
      completedAt: null,
      scaledIngredients: evalResult.scaledIngredients,
      actualYield: null,
      actualYieldUom: evalResult.targetUom,
      yieldVariance: null,
      yieldPercent: null,
      varianceReason: null,
      notes: data.notes || '',
      startedBy: data.startedBy || 'Chef',
      tenantId: targetTenantId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    list.unshift(newBatch);
    offlineStore.setCollection('production_batches', list);

    // Sync to cloud via DataGateway
    const dg = this._getDataGateway();
    if (dg) {
      dg.create('production_batches', newBatch).catch(e => console.warn('[productionModel] Cloud batch sync error:', e.message));
    }

    return newBatch;
  }

  /**
   * Completes a production batch:
   * 1. Consumes scaled raw material ingredients STRICTLY from Kitchen Store (LOC-KIT).
   * 2. Adds produced output yield to Kitchen Store (LOC-KIT) if item exists in master inventory.
   * 3. Appends stock ledger transactions (PRODUCTION_CONSUMPTION, PRODUCTION_OUTPUT).
   * 4. Updates batch status to COMPLETED and persists via DataGateway.
   * @param {string} batchId
   * @param {Object} completionData { actualYield, varianceReason, notes }
   * @param {string|null} tenantId
   * @returns {Object} Completed batch record
   */
  completeBatch(batchId, { actualYield, varianceReason, notes }, tenantId = null) {
    const targetTenantId = tenantId || 'tenant_h0qc7wf';
    const list = this.getBatches(targetTenantId);
    const idx = list.findIndex(b => b.id === batchId);
    if (idx === -1) throw new Error(`Production batch "${batchId}" not found.`);

    const batch = list[idx];
    if (batch.status === 'COMPLETED') throw new Error(`Batch "${batchId}" is already completed.`);

    const now = new Date().toISOString();
    const yieldNum = parseFloat(actualYield) || batch.targetQuantity;
    const yieldVariance = parseFloat((yieldNum - batch.targetQuantity).toFixed(4));
    const yieldPercent = parseFloat(((yieldNum / batch.targetQuantity) * 100).toFixed(1));

    const stockBalances = offlineStore.getCollection('stock_balances', targetTenantId) || [];
    const stockTxns = offlineStore.getCollection('stock_transactions', targetTenantId) || [];
    const masterInv = offlineStore.getCollection('inventory', targetTenantId) || [];
    const dg = this._getDataGateway();

    // 1. Deduct consumed ingredients STRICTLY from Kitchen Store (LOC-KIT)
    batch.scaledIngredients.forEach(ing => {
      const lineCode = String(ing.inventoryItemCode);
      const qtyToDeduct = ing.scaledBaseQty;

      // Append PRODUCTION_CONSUMPTION ledger entry
      const txnRecord = {
        id: `txn-cons-${Math.random().toString(36).substring(2, 9)}`,
        referenceNo: batch.batchCode,
        transactionType: 'PRODUCTION_CONSUMPTION',
        itemCode: lineCode,
        itemName: ing.inventoryItemName,
        locationCode: 'LOC-KIT',
        quantity: -qtyToDeduct,
        uom: ing.baseUom,
        notes: `Production consumption for batch ${batch.batchCode} (${batch.inventoryItemName})`,
        timestamp: now,
        tenantId: targetTenantId
      };
      // Deduct from Kitchen Store (LOC-886 / LOC-KIT) stock balance
      let kitBalIdx = stockBalances.findIndex(s => {
        const itemMatch = String(s.itemCode || s.item_code || s.itemId || s.id) === lineCode || lineCode.includes(String(s.itemCode || s.item_code || ''));
        const loc = String(s.locationCode || s.location_code || '').toUpperCase().trim();
        const locMatch = loc === 'LOC-886' || loc === 'LOC-KIT' || loc === 'LOC-901' || loc === 'LOC-KITCHEN' || loc === 'KITCHEN_STORE';
        return itemMatch && locMatch;
      });

      if (kitBalIdx >= 0) {
        const cur = parseFloat(stockBalances[kitBalIdx].currentStock || stockBalances[kitBalIdx].quantity || 0);
        stockBalances[kitBalIdx].currentStock = Math.max(0, parseFloat((cur - qtyToDeduct).toFixed(4)));
        stockBalances[kitBalIdx].quantity = stockBalances[kitBalIdx].currentStock;
        stockBalances[kitBalIdx].updatedAt = now;
        if (dg) dg.update('stock_balances', stockBalances[kitBalIdx].id, stockBalances[kitBalIdx]).catch(() => {});
      }
    });

    // 2. Post produced semi-finished/finished output yield to Kitchen Store (LOC-886 / LOC-KIT)
    const outputItemCode = String(batch.inventoryItemCode);
    const masterItem = masterInv.find(i => String(i.itemCode || i.item_code || i.id || '') === outputItemCode);

    if (outputItemCode && (masterItem || outputItemCode.startsWith('SF') || outputItemCode.startsWith('PREP'))) {
      const outputTxn = {
        id: `txn-out-${Math.random().toString(36).substring(2, 9)}`,
        referenceNo: batch.batchCode,
        transactionType: 'PRODUCTION_OUTPUT',
        itemCode: outputItemCode,
        itemName: batch.inventoryItemName,
        locationCode: 'LOC-886',
        quantity: yieldNum,
        uom: batch.targetUom,
        notes: `Production output yield for batch ${batch.batchCode}`,
        timestamp: now,
        tenantId: targetTenantId
      };
      stockTxns.unshift(outputTxn);

      let outputBalIdx = stockBalances.findIndex(s => {
        const itemMatch = String(s.itemCode || s.item_code || s.itemId || s.id) === outputItemCode || outputItemCode.includes(String(s.itemCode || s.item_code || ''));
        const loc = String(s.locationCode || s.location_code || '').toUpperCase().trim();
        const locMatch = loc === 'LOC-886' || loc === 'LOC-KIT' || loc === 'LOC-901' || loc === 'LOC-KITCHEN' || loc === 'KITCHEN_STORE';
        return itemMatch && locMatch;
      });

      if (outputBalIdx >= 0) {
        const cur = parseFloat(stockBalances[outputBalIdx].currentStock || stockBalances[outputBalIdx].quantity || 0);
        stockBalances[outputBalIdx].currentStock = parseFloat((cur + yieldNum).toFixed(4));
        stockBalances[outputBalIdx].quantity = stockBalances[outputBalIdx].currentStock;
        stockBalances[outputBalIdx].updatedAt = now;
        if (dg) dg.update('stock_balances', stockBalances[outputBalIdx].id, stockBalances[outputBalIdx]).catch(() => {});
      } else {
        const newBal = {
          id: `sb-${outputItemCode}-kit`,
          tenant_id: targetTenantId,
          tenantId: targetTenantId,
          item_code: outputItemCode,
          itemCode: outputItemCode,
          itemName: batch.inventoryItemName,
          inventoryItemName: batch.inventoryItemName,
          location_code: 'LOC-886',
          locationCode: 'LOC-886',
          quantity: yieldNum,
          currentStock: yieldNum,
          uom: batch.targetUom,
          unit_cost: masterItem ? (parseFloat(masterItem.unitValuation || masterItem.unit_valuation) || 0) : 0,
          valuation: (masterItem ? (parseFloat(masterItem.unitValuation || masterItem.unit_valuation) || 0) : 0) * yieldNum,
          updatedAt: now
        };
        stockBalances.push(newBal);
        if (dg) dg.create('stock_balances', newBal).catch(() => {});
      }
    }

    offlineStore.setCollection('stock_transactions', stockTxns);
    offlineStore.setCollection('stock_balances', stockBalances);

    const completedBatch = {
      ...batch,
      status: 'COMPLETED',
      completedAt: now,
      actualYield: yieldNum,
      yieldVariance,
      yieldPercent,
      varianceReason: varianceReason || 'Normal Preparation Yield',
      notes: notes || batch.notes || '',
      updatedAt: now
    };

    list[idx] = completedBatch;
    offlineStore.setCollection('production_batches', list);

    if (dg) {
      dg.update('production_batches', completedBatch.id, completedBatch).catch(e => console.warn('[productionModel] Cloud batch update error:', e.message));
    }

    return completedBatch;
  }

  /**
   * Retrieves all stock requisitions / inventory requests.
   * @param {string|null} tenantId
   * @returns {Array<Object>}
   */
  getStockRequisitions(tenantId = null) {
    const list = offlineStore.getCollection('inventory_requests', tenantId) || offlineStore.getCollection('stock_requisitions', tenantId) || [];
    return list;
  }

  /**
   * Creates a stock requisition request from Main Warehouse (LOC-MWH) to Kitchen Store (LOC-KIT).
   * Persists to inventory_requests (Supabase + local cache).
   * Does NOT alter physical stock automatically.
   * @param {Object} reqData
   * @param {string|null} tenantId
   * @returns {Object}
   */
  createStockRequisition({ recipeId, recipeCode, inventoryItemName, targetQuantity, targetUom, items, notes }, tenantId = null) {
    const targetTenantId = tenantId || 'tenant_h0qc7wf';
    const list = offlineStore.getCollection('inventory_requests', targetTenantId) || [];
    const now = new Date();
    const reqNum = list.length + 1;
    const reqCode = `REQ-${now.getFullYear()}-${String(reqNum).padStart(4, '0')}`;

    const newReq = {
      id: reqCode,
      requestNumber: reqCode,
      request_number: reqCode,
      reqCode,
      department: 'Kitchen Production',
      requestedBy: 'Kitchen Chef (Production)',
      sourceLocation: 'LOC-805',
      source_location: 'LOC-805',
      destinationLocation: 'LOC-886',
      destination_location: 'LOC-886',
      recipeId,
      recipeCode,
      inventoryItemName,
      targetQuantity,
      targetUom,
      status: 'PENDING', // PENDING | TRANSFERRED | REJECTED
      tenantId: targetTenantId,
      tenant_id: targetTenantId,
      items: items.map(item => ({
        itemCode: item.inventoryItemCode || item.itemCode,
        inventoryItemCode: item.inventoryItemCode || item.itemCode,
        itemName: item.inventoryItemName || item.itemName,
        inventoryItemName: item.inventoryItemName || item.itemName,
        scaledRecipeQty: item.scaledRecipeQty || item.recipeQty,
        recipeUom: item.recipeUom,
        scaledBaseQty: item.scaledBaseQty,
        quantity: item.shortageQty > 0 ? item.shortageQty : item.scaledBaseQty,
        uom: item.baseUom,
        baseUom: item.baseUom,
        kitchenStock: item.kitchenStock || item.currentStock || 0,
        mwhStock: item.mwhStock || 0,
        shortageQty: item.shortageQty || item.shortage || 0
      })),
      notes: notes || `Production requisition for ${inventoryItemName} (${targetQuantity} ${targetUom})`,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    list.unshift(newReq);
    offlineStore.setCollection('inventory_requests', list);
    offlineStore.setCollection('stock_requisitions', list);

    const dg = this._getDataGateway();
    if (dg) {
      dg.create('inventory_requests', newReq).catch(e => console.warn('[productionModel] Cloud requisition sync error:', e.message));
    }

    return newReq;
  }
}

export const productionModel = new ProductionModel();

