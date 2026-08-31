/**
 * BusinessOS Platform - Physical Stock Count & Approval Lifecycle Model (F3.3)
 * Manages Physical Stock Count sessions: COUNTED -> VARIANCE REVIEW -> APPROVED -> STOCK_ADJUSTMENT.
 * Rule: Submitting a count calculates variance without muting ledger. Only explicit Approval posts STOCK_ADJUSTMENT.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { inventoryMovementModel } from './inventoryMovementModel.js';
import { inventoryProjectionService } from './inventoryProjectionService.js';
import { inventoryItemModel } from './inventoryItemModel.js';

class InventoryStockCountModel {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('stock_count_sessions')) {
      const initialSessions = [
        {
          id: 'STKCNT-2026-0001',
          countNumber: 'STKCNT-2026-0001',
          location: 'Main Store & Cold Storage',
          status: 'APPROVED', // COUNTED | VARIANCE_REVIEW | APPROVED
          countDate: '2026-08-30T18:00:00.000Z',
          countedBy: 'Jitu (Store Manager)',
          approvedBy: 'Sachin (Owner)',
          items: [
            { inventoryItemId: 'invitem_chicken', itemName: 'Fresh Chicken Breast', systemExpectedQty: 32.40, physicalCountQty: 31.80, varianceQty: -0.60, unit: 'KG', unitCost: 420.00, varianceValue: -252.00 },
            { inventoryItemId: 'invitem_paneer', itemName: 'Fresh Dairy Paneer', systemExpectedQty: 18.20, physicalCountQty: 18.50, varianceQty: 0.30, unit: 'KG', unitCost: 360.00, varianceValue: 108.00 },
            { inventoryItemId: 'invitem_cream', itemName: 'Fresh Cooking Cream', systemExpectedQty: 7.40, physicalCountQty: 6.90, varianceQty: -0.50, unit: 'L', unitCost: 210.00, varianceValue: -105.00 }
          ],
          totalVarianceValue: -249.00,
          tenantId: 'tenant_h0qc7wf',
          createdAt: '2026-08-30T18:00:00.000Z'
        }
      ];
      offlineStore.setCollection('stock_count_sessions', initialSessions);
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
   * 1. Record Physical Stock Count Session (Status: COUNTED / VARIANCE_REVIEW)
   * Does NOT alter inventory movement ledger yet!
   */
  createStockCountSession({ location = 'Main Store', countedItems = [], countedBy = 'Store Manager', tenantId = null }) {
    const targetTenantId = this._getTenantId(tenantId);
    const sessions = offlineStore.getCollection('stock_count_sessions') || [];

    const countId = `STKCNT-2026-${String(1001 + sessions.length).padStart(4, '0')}`;
    let totalVarianceValue = 0;

    const processedItems = countedItems.map(ci => {
      const item = inventoryItemModel.getItemById(ci.inventoryItemId, targetTenantId);
      const systemExpectedQty = inventoryProjectionService.getCurrentStock(ci.inventoryItemId, targetTenantId);
      const wac = inventoryProjectionService.getWeightedAverageCost(ci.inventoryItemId, targetTenantId);

      const physicalCountQty = parseFloat(ci.physicalCountQty) || 0;
      const varianceQty = Math.round((physicalCountQty - systemExpectedQty) * 1000) / 1000;
      const varianceValue = Math.round(varianceQty * wac * 100) / 100;
      totalVarianceValue += varianceValue;

      return {
        inventoryItemId: ci.inventoryItemId,
        itemName: item ? item.name : ci.inventoryItemId,
        systemExpectedQty,
        physicalCountQty,
        varianceQty,
        unit: item ? item.baseUnit : 'KG',
        unitCost: wac,
        varianceValue
      };
    });

    const record = {
      id: countId,
      countNumber: countId,
      location,
      status: 'VARIANCE_REVIEW',
      countDate: new Date().toISOString(),
      countedBy,
      approvedBy: null,
      items: processedItems,
      totalVarianceValue: Math.round(totalVarianceValue * 100) / 100,
      tenantId: targetTenantId,
      createdAt: new Date().toISOString()
    };

    sessions.unshift(record);
    offlineStore.setCollection('stock_count_sessions', sessions);
    platformEventBus.publish('inventory:stockcount:created', record);
    return record;
  }

  /**
   * 2. Approve Stock Count Session (Status: APPROVED)
   * Posts immutable STOCK_ADJUSTMENT movements (+/-) to inventoryMovementModel for each non-zero variance item.
   */
  approveStockCountSession(countId, approvedBy = 'Manager / Owner', tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const sessions = offlineStore.getCollection('stock_count_sessions') || [];

    const session = sessions.find(s => s.id === countId || s.countNumber === countId);
    if (!session) throw new Error(`Stock count session ${countId} not found`);

    if (session.status === 'APPROVED') return session;

    const postedAdjustments = [];

    session.items.forEach(item => {
      if (item.varianceQty !== 0) {
        const movement = inventoryMovementModel.recordMovement({
          inventoryItemId: item.inventoryItemId,
          movementType: 'STOCK_ADJUSTMENT',
          quantity: Math.abs(item.varianceQty),
          unit: item.unit,
          unitCost: item.unitCost,
          sourceType: 'STOCK_COUNT',
          sourceId: session.id,
          operationId: `inv-stockcount-adj-${session.id}-${item.inventoryItemId}`,
          performedBy: approvedBy,
          notes: `Stock count adjustment for ${session.countNumber} (Variance: ${item.varianceQty > 0 ? '+' : ''}${item.varianceQty} ${item.unit})`,
          tenantId: targetTenantId
        });
        if (movement) postedAdjustments.push(movement);
      }
    });

    session.status = 'APPROVED';
    session.approvedBy = approvedBy;
    offlineStore.setCollection('stock_count_sessions', sessions);

    platformEventBus.publish('inventory:stockcount:approved', { session, postedAdjustments });
    return session;
  }

  getAllSessions(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const store = offlineStore.getCollection('stock_count_sessions') || [];
    return store.filter(s => !targetTenantId || s.tenantId === targetTenantId || s.tenant_id === targetTenantId);
  }
}

export const inventoryStockCountModel = new InventoryStockCountModel();
