/**
 * BusinessOS Platform - Append-Only Inventory Movement Ledger (F3.0.2)
 * Immutable operational & financial stock movement ledger.
 * Enforces strict Idempotency via operationId (prevents double consumption on retries).
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { inventoryItemModel } from './inventoryItemModel.js';

class InventoryMovementModel {
  constructor() {
    this._initSeedMovements();
  }

  _initSeedMovements() {
    if (!offlineStore.getCollection('inventory_movements')) {
      const initialMovements = [
        {
          movementId: 'MOV-2026-000101',
          inventoryItemId: 'invitem_chicken',
          movementType: 'OPENING_BALANCE',
          quantity: 50.0,
          unit: 'KG',
          normalizedQuantity: 50.0,
          unitCost: 400.00,
          totalCost: 20000.00,
          sourceType: 'OPENING',
          sourceId: 'OPENING-2026-01',
          operationId: 'inv-op-opening-chk',
          performedBy: 'Sachin (Owner)',
          notes: 'Initial Opening Stock Audit',
          tenantId: 'tenant_h0qc7wf',
          createdAt: '2026-08-01T08:00:00.000Z'
        },
        {
          movementId: 'MOV-2026-000102',
          inventoryItemId: 'invitem_chicken',
          movementType: 'PURCHASE_RECEIPT',
          quantity: 30.0,
          unit: 'KG',
          normalizedQuantity: 30.0,
          unitCost: 450.00,
          totalCost: 13500.00,
          sourceType: 'GRN',
          sourceId: 'GRN-2026-0042',
          operationId: 'inv-op-grn-42-chk',
          performedBy: 'Jitu (Manager)',
          notes: 'Fresh Chicken Delivery GRN-0042',
          tenantId: 'tenant_h0qc7wf',
          createdAt: '2026-08-10T10:30:00.000Z'
        },
        {
          movementId: 'MOV-2026-000103',
          inventoryItemId: 'invitem_paneer',
          movementType: 'OPENING_BALANCE',
          quantity: 25.0,
          unit: 'KG',
          normalizedQuantity: 25.0,
          unitCost: 350.00,
          totalCost: 8750.00,
          sourceType: 'OPENING',
          sourceId: 'OPENING-2026-01',
          operationId: 'inv-op-opening-pnr',
          performedBy: 'Sachin (Owner)',
          notes: 'Initial Opening Stock Audit',
          tenantId: 'tenant_h0qc7wf',
          createdAt: '2026-08-01T08:00:00.000Z'
        }
      ];
      offlineStore.setCollection('inventory_movements', initialMovements);
    }
  }

  _getDataGateway() {
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) {
      return window.__APP__.platform.dataGateway || null;
    }
    return null;
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
   * Post an immutable Inventory Movement record with strict Idempotency.
   * Signed normalizedQuantity:
   *   (+) OPENING_BALANCE, PURCHASE_RECEIPT, TRANSFER_IN
   *   (-) THEORETICAL_CONSUMPTION, ACTUAL_CONSUMPTION, WASTAGE, TRANSFER_OUT, RETURN_TO_SUPPLIER
   */
  recordMovement({
    inventoryItemId,
    movementType,
    quantity,
    unit = null,
    unitCost = null,
    sourceType = 'SYSTEM',
    sourceId = '',
    operationId = null,
    performedBy = 'System',
    notes = '',
    tenantId = null
  }) {
    const targetTenantId = this._getTenantId(tenantId);
    const store = offlineStore.getCollection('inventory_movements') || [];

    const item = inventoryItemModel.getItemById(inventoryItemId, targetTenantId);
    const baseUnit = item ? item.baseUnit : 'KG';
    const effectiveUnit = unit || baseUnit;

    const opId = operationId || `op-${sourceType.toLowerCase()}-${sourceId || Math.random().toString(36).substring(2, 9)}`;

    // 1. Idempotency Check: if operationId already processed, return existing movement
    const existing = store.find(m => m.operationId === opId && m.inventoryItemId === inventoryItemId);
    if (existing) {
      return existing;
    }

    const dg = this._getDataGateway();
    if (dg && typeof dg.isOperationProcessed === 'function' && dg.isOperationProcessed(opId)) {
      const match = store.find(m => m.operationId === opId && m.inventoryItemId === inventoryItemId);
      if (match) return match;
    }
    if (dg && typeof dg.markOperationProcessed === 'function') {
      dg.markOperationProcessed(opId);
    }

    // 2. Calculate signed normalized quantity
    const rawQty = Math.abs(parseFloat(quantity) || 0);
    const normQty = inventoryItemModel.normalizeQuantity(rawQty, effectiveUnit, baseUnit);

    const isReduction = [
      'THEORETICAL_CONSUMPTION',
      'ACTUAL_CONSUMPTION',
      'WASTAGE',
      'TRANSFER_OUT',
      'RETURN_TO_SUPPLIER'
    ].includes(movementType.toUpperCase());

    const signedNormQty = isReduction ? -normQty : normQty;

    const effectiveUnitCost = unitCost !== null ? parseFloat(unitCost) : (item ? item.currentUnitCost : 0);
    const totalCost = Math.round(normQty * effectiveUnitCost * 100) / 100;

    const count = store.length;
    const now = new Date();
    const movementId = `MOV-${now.getFullYear()}-${String(100001 + count).padStart(6, '0')}`;

    const record = {
      movementId,
      id: movementId,
      inventoryItemId,
      movementType: movementType.toUpperCase(),
      quantity: rawQty,
      unit: effectiveUnit,
      baseUnit,
      normalizedQuantity: signedNormQty,
      unitCost: effectiveUnitCost,
      totalCost,
      sourceType: sourceType.toUpperCase(),
      sourceId,
      operationId: opId,
      performedBy,
      notes,
      tenantId: targetTenantId,
      tenant_id: targetTenantId,
      createdAt: now.toISOString()
    };

    store.unshift(record);
    offlineStore.setCollection('inventory_movements', store);

    // Sync to Supabase Cloud via DataGateway
    if (dg && typeof dg.create === 'function') {
      dg.create('inventory_movements', record).catch(() => {});
      const journalEntry = {
        job_id: `job_${movementId}`,
        job_type: 'INVENTORY_MOVEMENT',
        tenant_id: targetTenantId,
        entity_name: 'inventory_movements',
        payload: record,
        device_id: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 30) : 'POS-TERMINAL',
        version: 1,
        actor: performedBy,
        correlation_id: `CID-${Math.floor(10000 + Math.random() * 90000)}`,
        sync_state: 'SYNCED',
        created_at: now.toISOString()
      };
      dg.create('offline_journal', journalEntry).catch(() => {});
    }

    platformEventBus.publish('inventory:movement:recorded', record);
    platformEventBus.publish('data:changed', { collection: 'inventory_movements' });

    return record;
  }

  getAllMovements(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const store = offlineStore.getCollection('inventory_movements') || [];
    return store.filter(m => !targetTenantId || m.tenantId === targetTenantId || m.tenant_id === targetTenantId);
  }

  getMovementsForItem(inventoryItemId, tenantId = null) {
    const all = this.getAllMovements(tenantId);
    return all.filter(m => m.inventoryItemId === inventoryItemId);
  }
}

export const inventoryMovementModel = new InventoryMovementModel();
