/**
 * BusinessOS Platform - Inventory Projection & BOM Consumption Engine (F3.0.3 & F3.0.4)
 * Read-only CQRS Projection Engine for Inventory Balance, Weighted Average Costing, and BOM Consumption.
 * Strictly calculates stock balance & WAC from inventoryMovementModel.js ledger.
 * Idempotently processes POS sales orders into Theoretical BOM Consumption movements.
 */

import { inventoryItemModel } from './inventoryItemModel.js';
import { inventoryMovementModel } from './inventoryMovementModel.js';
import { recipeModel } from '../kitchen/recipeModel.js';
import { platformEventBus } from '../events/platformEvents.js';

class InventoryProjectionService {
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
   * Derive Current Actual Stock Balance from Ledger Movements
   * Current Stock = SUM(signed normalizedQuantity of actual movements)
   */
  getCurrentStock(inventoryItemId, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const movements = inventoryMovementModel.getMovementsForItem(inventoryItemId, targetTenantId);

    // Exclude THEORETICAL_CONSUMPTION from actual physical stock count
    const actualMovements = movements.filter(m => m.movementType !== 'THEORETICAL_CONSUMPTION');
    const currentStock = actualMovements.reduce((sum, m) => sum + (parseFloat(m.normalizedQuantity) || 0), 0);
    return Math.round(currentStock * 1000) / 1000;
  }

  /**
   * Derive Authoritative Weighted Average Cost (WAC) from Receipt Ledger Movements
   * WAC = SUM(Receipt Qty * Unit Cost) / SUM(Receipt Qty)
   */
  getWeightedAverageCost(inventoryItemId, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const movements = inventoryMovementModel.getMovementsForItem(inventoryItemId, targetTenantId);
    const item = inventoryItemModel.getItemById(inventoryItemId, targetTenantId);

    const receipts = movements.filter(m => [
      'OPENING_BALANCE',
      'PURCHASE_RECEIPT',
      'STOCK_ADJUSTMENT'
    ].includes(m.movementType) && m.normalizedQuantity > 0);

    if (receipts.length === 0) {
      return item ? item.currentUnitCost : 0;
    }

    const totalCost = receipts.reduce((sum, r) => sum + (parseFloat(r.totalCost) || 0), 0);
    const totalQty = receipts.reduce((sum, r) => sum + (parseFloat(r.normalizedQuantity) || 0), 0);

    if (totalQty <= 0) return item ? item.currentUnitCost : 0;
    return Math.round((totalCost / totalQty) * 100) / 100;
  }

  /**
   * Derive Total Stock Valuation for an item
   */
  getItemStockValuation(inventoryItemId, tenantId = null) {
    const currentStock = this.getCurrentStock(inventoryItemId, tenantId);
    const wac = this.getWeightedAverageCost(inventoryItemId, tenantId);
    return Math.round(currentStock * wac * 100) / 100;
  }

  /**
   * Calculate Full Inventory Valuation Summary for All Items
   */
  getInventoryValuationSummary(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const items = inventoryItemModel.getAllItems(targetTenantId);

    let totalValuation = 0;
    const summaryItems = items.map(item => {
      const currentStock = this.getCurrentStock(item.id, targetTenantId);
      const wac = this.getWeightedAverageCost(item.id, targetTenantId);
      const valuation = Math.round(currentStock * wac * 100) / 100;
      totalValuation += valuation;

      return {
        id: item.id,
        name: item.name,
        category: item.category,
        baseUnit: item.baseUnit,
        currentStock,
        weightedAverageCost: wac,
        stockValuation: valuation,
        isReorderRequired: currentStock <= item.reorderLevel
      };
    });

    return {
      dateFilter: 'live',
      totalItemsCount: summaryItems.length,
      totalValuation: Math.round(totalValuation * 100) / 100,
      reorderAlertsCount: summaryItems.filter(i => i.isReorderRequired).length,
      items: summaryItems
    };
  }

  /**
   * Process POS Sales Order into Idempotent Theoretical BOM Consumption Movements
   * Contract: operationId = `inv-theoretical-consumption-${order.id}`
   */
  processOrderTheoreticalBomConsumption(order, tenantId = null) {
    if (!order || !order.id || !Array.isArray(order.items)) return [];
    const targetTenantId = this._getTenantId(tenantId);
    const opId = `inv-theoretical-consumption-${order.id}`;

    const postedMovements = [];

    order.items.forEach(orderItem => {
      const code = orderItem.itemCode || orderItem.code || orderItem.itemId;
      const orderQty = parseInt(orderItem.quantity) || 1;

      const recipes = recipeModel.getAllRecipes(targetTenantId);
      const recipe = recipes.find(r => r.recipeCode === code || r.menuItemCode === code);

      if (recipe && Array.isArray(recipe.ingredients)) {
        recipe.ingredients.forEach(ing => {
          const invItemId = ing.inventoryItemId || ing.ingredientId || `invitem_${(ing.name || 'item').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
          const perPortionQty = parseFloat(ing.quantity || ing.qty) || 0.1;
          const totalTheoreticalQty = perPortionQty * orderQty;

          const movement = inventoryMovementModel.recordMovement({
            inventoryItemId: invItemId,
            movementType: 'THEORETICAL_CONSUMPTION',
            quantity: totalTheoreticalQty,
            unit: ing.unit || 'KG',
            sourceType: 'ORDER',
            sourceId: order.id,
            operationId: `${opId}-${invItemId}`,
            performedBy: 'BOM Engine',
            notes: `Theoretical BOM consumption for Order ${order.orderNumber || order.id} (${orderQty}x ${orderItem.name || code})`,
            tenantId: targetTenantId
          });

          if (movement) postedMovements.push(movement);
        });
      }
    });

    return postedMovements;
  }

  /**
   * Process POS Order Cancellation / Void into Theoretical Reversal Movements
   * Contract: operationId = `inv-theoretical-reversal-${order.id}`
   */
  processOrderCancellationTheoreticalReversal(order, tenantId = null) {
    if (!order || !order.id || !Array.isArray(order.items)) return [];
    const targetTenantId = this._getTenantId(tenantId);
    const opId = `inv-theoretical-reversal-${order.id}`;

    const postedMovements = [];

    order.items.forEach(orderItem => {
      const code = orderItem.itemCode || orderItem.code || orderItem.itemId;
      const orderQty = parseInt(orderItem.quantity) || 1;

      const recipes = recipeModel.getAllRecipes(targetTenantId);
      const recipe = recipes.find(r => r.recipeCode === code || r.menuItemCode === code);

      if (recipe && Array.isArray(recipe.ingredients)) {
        recipe.ingredients.forEach(ing => {
          const invItemId = ing.inventoryItemId || ing.ingredientId || `invitem_${(ing.name || 'item').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
          const perPortionQty = parseFloat(ing.quantity || ing.qty) || 0.1;
          const totalReversalQty = perPortionQty * orderQty;

          const movement = inventoryMovementModel.recordMovement({
            inventoryItemId: invItemId,
            movementType: 'THEORETICAL_CONSUMPTION_REVERSAL',
            quantity: totalReversalQty,
            unit: ing.unit || 'KG',
            sourceType: 'ORDER_CANCEL',
            sourceId: order.id,
            operationId: `${opId}-${invItemId}`,
            performedBy: 'BOM Engine',
            notes: `Theoretical BOM reversal for Cancelled Order ${order.orderNumber || order.id}`,
            tenantId: targetTenantId
          });

          if (movement) postedMovements.push(movement);
        });
      }
    });

    return postedMovements;
  }

  /**
   * F3.0.5 Contract: Record Actual Stock Receipt (GRN / Direct Supplier Delivery)
   * Increases actual physical stock balance and updates Weighted Average Cost (WAC).
   */
  recordDirectStockReceipt({ supplierName = 'Supplier', inventoryItemId, quantity, purchaseUnit = null, unitCost, referenceNo = '', performedBy = 'Store Manager', tenantId = null }) {
    const targetTenantId = this._getTenantId(tenantId);

    const movement = inventoryMovementModel.recordMovement({
      inventoryItemId,
      movementType: 'PURCHASE_RECEIPT',
      quantity: parseFloat(quantity) || 0,
      unit: purchaseUnit,
      unitCost: parseFloat(unitCost) || 0,
      sourceType: 'GRN',
      sourceId: referenceNo || `GRN-${Date.now()}`,
      operationId: `inv-grn-${inventoryItemId}-${Date.now()}`,
      performedBy,
      notes: `Received ${quantity} ${purchaseUnit || 'units'} from ${supplierName} (Ref: ${referenceNo})`,
      tenantId: targetTenantId
    });

    // Update cached currentUnitCost on Item Master to latest WAC
    const newWac = this.getWeightedAverageCost(inventoryItemId, targetTenantId);
    const item = inventoryItemModel.getItemById(inventoryItemId, targetTenantId);
    if (item) {
      item.currentUnitCost = newWac;
    }

    return movement;
  }

  /**
   * F3.0.5 Contract: Record Actual Stock Wastage / Spoilage
   * Manager-authorized physical stock reduction with mandatory reason & audit trail.
   */
  recordActualStockWastage({ inventoryItemId, quantity, unit = null, reason = 'Spoilage', notes = '', performedBy = 'Kitchen Manager', tenantId = null }) {
    const targetTenantId = this._getTenantId(tenantId);

    const movement = inventoryMovementModel.recordMovement({
      inventoryItemId,
      movementType: 'WASTAGE',
      quantity: parseFloat(quantity) || 0,
      unit,
      sourceType: 'WASTAGE_LOG',
      sourceId: `WASTE-${Date.now()}`,
      operationId: `inv-wastage-${inventoryItemId}-${Date.now()}`,
      performedBy,
      notes: `Wastage logged: ${reason}. Notes: ${notes}`,
      tenantId: targetTenantId
    });

    platformEventBus.publish('inventory:wastage:recorded', { movement, reason });
    return movement;
  }
}

export const inventoryProjectionService = new InventoryProjectionService();
