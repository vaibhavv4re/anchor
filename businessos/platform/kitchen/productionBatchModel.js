/**
 * BusinessOS Platform - Kitchen Production Batch & Recipe Revision Model (F6.1)
 * Manages Kitchen Production Batches (BATCH-2026-XXXX).
 * Calculates Production Yield % & Actual Cost per Usable Portion:
 *   Yield % = (Actual Portions Produced / Planned Portions) * 100
 *   Planned Cost per Portion = Planned BOM Cost / Planned Portions
 *   Actual Cost per Usable Portion = Actual Ingredients Cost / Actual Portions Produced
 *   Unit Cost Leakage = Actual Cost per Portion - Planned Cost per Portion
 * Posts ACTUAL_CONSUMPTION movements to inventoryMovementModel.js.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { recipeModel } from './recipeModel.js';
import { inventoryItemModel } from '../inventory/inventoryItemModel.js';
import { inventoryMovementModel } from '../inventory/inventoryMovementModel.js';
import { inventoryProjectionService } from '../inventory/inventoryProjectionService.js';

class ProductionBatchModel {
  constructor() {
    this._initSeedBatches();
  }

  _initSeedBatches() {
    if (!offlineStore.getCollection('production_batches')) {
      const initialBatches = [
        {
          id: 'BATCH-2026-0042',
          batchNumber: 'BATCH-2026-0042',
          recipeId: 'rec_butter_chicken',
          recipeName: 'Signature Butter Chicken',
          station: 'Curry Station',
          status: 'COMPLETED', // PLANNED | COMPLETED
          plannedPortions: 100,
          actualPortionsProduced: 92,
          yieldPercent: 92.0,
          plannedCostPerPortion: 80.00,
          actualCostPerPortion: 95.65,
          unitCostLeakage: 15.65,
          totalYieldLeakageValue: 1439.80,
          plannedBy: 'Jitu (Store Manager)',
          completedBy: 'Chef Suresh',
          completedAt: '2026-08-30T16:00:00.000Z',
          tenantId: 'tenant_h0qc7wf',
          createdAt: '2026-08-30T14:00:00.000Z'
        }
      ];
      offlineStore.setCollection('production_batches', initialBatches);
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
   * 1. Create Planned Production Batch
   */
  createProductionBatch({ recipeId, plannedPortions = 50, station = 'Curry Station', plannedBy = 'Store Manager', tenantId = null }) {
    const targetTenantId = this._getTenantId(tenantId);
    const batches = offlineStore.getCollection('production_batches') || [];
    const recipe = recipeModel.getById(recipeId) || recipeModel.getAllRecipes(targetTenantId)[0];

    const batchId = `BATCH-2026-${String(1001 + batches.length).padStart(4, '0')}`;
    let totalPlannedBomCost = 0;
    const plannedIngredients = [];

    if (recipe && Array.isArray(recipe.ingredients)) {
      recipe.ingredients.forEach(ing => {
        const invItemId = ing.inventoryItemId || ing.ingredientId || `invitem_${(ing.name || 'item').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const itemMaster = inventoryItemModel.getItemById(invItemId, targetTenantId);
        const baseUnit = itemMaster ? itemMaster.baseUnit : (ing.unit || 'KG');
        const perPortionQty = parseFloat(ing.quantity || ing.qty) || 0.2;
        const totalPlannedQty = Math.round(perPortionQty * plannedPortions * 1000) / 1000;
        const wac = inventoryProjectionService.getWeightedAverageCost(invItemId, targetTenantId);
        const lineCost = Math.round(totalPlannedQty * wac * 100) / 100;
        totalPlannedBomCost += lineCost;

        plannedIngredients.push({
          inventoryItemId: invItemId,
          name: ing.name || (itemMaster ? itemMaster.name : invItemId),
          plannedQty: totalPlannedQty,
          unit: baseUnit,
          weightedAverageCost: wac,
          lineCost
        });
      });
    }

    const plannedCostPerPortion = plannedPortions > 0 ? Math.round((totalPlannedBomCost / plannedPortions) * 100) / 100 : 0;

    const record = {
      id: batchId,
      batchNumber: batchId,
      recipeId: recipe ? recipe.id : recipeId,
      recipeName: recipe ? (recipe.recipeName || recipe.name) : 'Batch Recipe',
      station,
      status: 'PLANNED',
      plannedPortions: parseInt(plannedPortions) || 50,
      actualPortionsProduced: 0,
      yieldPercent: 0,
      plannedCostPerPortion,
      actualCostPerPortion: 0,
      unitCostLeakage: 0,
      totalYieldLeakageValue: 0,
      plannedIngredients,
      plannedBy,
      completedBy: null,
      tenantId: targetTenantId,
      createdAt: new Date().toISOString()
    };

    batches.unshift(record);
    offlineStore.setCollection('production_batches', batches);
    platformEventBus.publish('kitchen:batch:created', record);
    return record;
  }

  /**
   * 2. Complete Production Batch & Calculate Yield % and Leakage
   * Posts ACTUAL_CONSUMPTION movements to inventoryMovementModel.js.
   */
  completeProductionBatch({ batchId, actualPortionsProduced, actualIngredientsUsed = [], chefName = 'Chef Suresh', notes = '', tenantId = null }) {
    const targetTenantId = this._getTenantId(tenantId);
    const batches = offlineStore.getCollection('production_batches') || [];

    const batch = batches.find(b => b.id === batchId || b.batchNumber === batchId);
    if (!batch) throw new Error(`Production batch ${batchId} not found`);

    const actualProduced = parseInt(actualPortionsProduced) || batch.plannedPortions;
    const yieldPercent = Math.round((actualProduced / Math.max(1, batch.plannedPortions)) * 1000) / 10;

    let totalActualIngredientCost = 0;
    const processedActualIngredients = [];

    // Process actual ingredient consumption
    batch.plannedIngredients.forEach(ping => {
      const userActualInput = actualIngredientsUsed.find(a => a.inventoryItemId === ping.inventoryItemId);
      const actualQty = userActualInput ? parseFloat(userActualInput.actualQty) : (ping.plannedQty * (100 / Math.max(1, yieldPercent)));
      const wac = inventoryProjectionService.getWeightedAverageCost(ping.inventoryItemId, targetTenantId);
      const lineCost = Math.round(actualQty * wac * 100) / 100;
      totalActualIngredientCost += lineCost;

      // Post ACTUAL_CONSUMPTION movement to inventoryMovementModel
      const movement = inventoryMovementModel.recordMovement({
        inventoryItemId: ping.inventoryItemId,
        movementType: 'ACTUAL_CONSUMPTION',
        quantity: actualQty,
        unit: ping.unit,
        unitCost: wac,
        sourceType: 'KITCHEN_BATCH',
        sourceId: batch.id,
        operationId: `inv-batch-${batch.id}-${ping.inventoryItemId}`,
        performedBy: chefName,
        notes: `Kitchen batch production for ${batch.recipeName} (${actualProduced} portions produced)`,
        tenantId: targetTenantId
      });

      processedActualIngredients.push({
        inventoryItemId: ping.inventoryItemId,
        name: ping.name,
        plannedQty: ping.plannedQty,
        actualQty,
        unit: ping.unit,
        unitCost: wac,
        lineCost,
        movementId: movement ? movement.movementId : null
      });
    });

    const actualCostPerPortion = actualProduced > 0 ? Math.round((totalActualIngredientCost / actualProduced) * 100) / 100 : 0;
    const unitCostLeakage = Math.round((actualCostPerPortion - batch.plannedCostPerPortion) * 100) / 100;
    const totalYieldLeakageValue = Math.round(unitCostLeakage * actualProduced * 100) / 100;

    batch.status = 'COMPLETED';
    batch.actualPortionsProduced = actualProduced;
    batch.yieldPercent = yieldPercent;
    batch.actualCostPerPortion = actualCostPerPortion;
    batch.unitCostLeakage = unitCostLeakage;
    batch.totalYieldLeakageValue = totalYieldLeakageValue;
    batch.actualIngredients = processedActualIngredients;
    batch.completedBy = chefName;
    batch.completedAt = new Date().toISOString();

    offlineStore.setCollection('production_batches', batches);
    platformEventBus.publish('kitchen:batch:completed', batch);
    return batch;
  }

  getAllBatches(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const store = offlineStore.getCollection('production_batches') || [];
    return store.filter(b => !targetTenantId || b.tenantId === targetTenantId || b.tenant_id === targetTenantId);
  }
}

export const productionBatchModel = new ProductionBatchModel();
