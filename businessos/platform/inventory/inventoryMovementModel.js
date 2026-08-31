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

  _getCanonicalSeedMovements() {
    return [
      // KITCHEN RAW MATERIALS MOVEMENTS
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
      },
      {
        movementId: 'MOV-2026-000104',
        inventoryItemId: 'invitem_butter',
        movementType: 'OPENING_BALANCE',
        quantity: 15.0,
        unit: 'KG',
        normalizedQuantity: 15.0,
        unitCost: 520.00,
        totalCost: 7800.00,
        sourceType: 'OPENING',
        sourceId: 'OPENING-2026-01',
        operationId: 'inv-op-opening-btr',
        performedBy: 'Sachin (Owner)',
        notes: 'Initial Opening Stock Audit',
        tenantId: 'tenant_h0qc7wf',
        createdAt: '2026-08-01T08:00:00.000Z'
      },
      {
        movementId: 'MOV-2026-000105',
        inventoryItemId: 'invitem_oil',
        movementType: 'OPENING_BALANCE',
        quantity: 60.0,
        unit: 'L',
        normalizedQuantity: 60.0,
        unitCost: 140.00,
        totalCost: 8400.00,
        sourceType: 'OPENING',
        sourceId: 'OPENING-2026-01',
        operationId: 'inv-op-opening-oil',
        performedBy: 'Sachin (Owner)',
        notes: 'Initial Opening Stock Audit',
        tenantId: 'tenant_h0qc7wf',
        createdAt: '2026-08-01T08:00:00.000Z'
      },
      {
        movementId: 'MOV-2026-000106',
        inventoryItemId: 'invitem_cream',
        movementType: 'OPENING_BALANCE',
        quantity: 12.0,
        unit: 'L',
        normalizedQuantity: 12.0,
        unitCost: 210.00,
        totalCost: 2520.00,
        sourceType: 'OPENING',
        sourceId: 'OPENING-2026-01',
        operationId: 'inv-op-opening-crm',
        performedBy: 'Sachin (Owner)',
        notes: 'Initial Opening Stock Audit',
        tenantId: 'tenant_h0qc7wf',
        createdAt: '2026-08-01T08:00:00.000Z'
      },
      {
        movementId: 'MOV-2026-000107',
        inventoryItemId: 'invitem_rice',
        movementType: 'OPENING_BALANCE',
        quantity: 100.0,
        unit: 'KG',
        normalizedQuantity: 100.0,
        unitCost: 110.00,
        totalCost: 11000.00,
        sourceType: 'OPENING',
        sourceId: 'OPENING-2026-01',
        operationId: 'inv-op-opening-rce',
        performedBy: 'Sachin (Owner)',
        notes: 'Aged Basmati Rice Audit',
        tenantId: 'tenant_h0qc7wf',
        createdAt: '2026-08-01T08:00:00.000Z'
      },

      // BAR SPIRITS & BEVERAGES MOVEMENTS
      {
        movementId: 'MOV-2026-000201',
        inventoryItemId: 'invitem_tequila_donjulio',
        movementType: 'OPENING_BALANCE',
        quantity: 4500.0,
        unit: 'ML',
        normalizedQuantity: 4500.0,
        unitCost: 3.80,
        totalCost: 17100.00,
        sourceType: 'OPENING',
        sourceId: 'OPENING-BAR-2026-01',
        operationId: 'inv-op-opening-teq',
        performedBy: 'Sibu (Bartender)',
        notes: '6x 750ml Bottles Don Julio Tequila',
        tenantId: 'tenant_h0qc7wf',
        createdAt: '2026-08-01T08:00:00.000Z'
      },
      {
        movementId: 'MOV-2026-000202',
        inventoryItemId: 'invitem_whisky_glenfiddich',
        movementType: 'OPENING_BALANCE',
        quantity: 3750.0,
        unit: 'ML',
        normalizedQuantity: 3750.0,
        unitCost: 4.50,
        totalCost: 16875.00,
        sourceType: 'OPENING',
        sourceId: 'OPENING-BAR-2026-01',
        operationId: 'inv-op-opening-glen',
        performedBy: 'Sibu (Bartender)',
        notes: '5x 750ml Bottles Glenfiddich Single Malt',
        tenantId: 'tenant_h0qc7wf',
        createdAt: '2026-08-01T08:00:00.000Z'
      },
      {
        movementId: 'MOV-2026-000203',
        inventoryItemId: 'invitem_whisky_jwblack',
        movementType: 'OPENING_BALANCE',
        quantity: 6000.0,
        unit: 'ML',
        normalizedQuantity: 6000.0,
        unitCost: 2.80,
        totalCost: 16800.00,
        sourceType: 'OPENING',
        sourceId: 'OPENING-BAR-2026-01',
        operationId: 'inv-op-opening-jwb',
        performedBy: 'Sibu (Bartender)',
        notes: '8x 750ml Bottles JW Black Label',
        tenantId: 'tenant_h0qc7wf',
        createdAt: '2026-08-01T08:00:00.000Z'
      },
      {
        movementId: 'MOV-2026-000204',
        inventoryItemId: 'invitem_gin_bombay',
        movementType: 'OPENING_BALANCE',
        quantity: 3000.0,
        unit: 'ML',
        normalizedQuantity: 3000.0,
        unitCost: 2.20,
        totalCost: 6600.00,
        sourceType: 'OPENING',
        sourceId: 'OPENING-BAR-2026-01',
        operationId: 'inv-op-opening-bmb',
        performedBy: 'Sibu (Bartender)',
        notes: '4x 750ml Bottles Bombay Sapphire Gin',
        tenantId: 'tenant_h0qc7wf',
        createdAt: '2026-08-01T08:00:00.000Z'
      },
      {
        movementId: 'MOV-2026-000205',
        inventoryItemId: 'invitem_vodka_absolut',
        movementType: 'OPENING_BALANCE',
        quantity: 4500.0,
        unit: 'ML',
        normalizedQuantity: 4500.0,
        unitCost: 1.90,
        totalCost: 8550.00,
        sourceType: 'OPENING',
        sourceId: 'OPENING-BAR-2026-01',
        operationId: 'inv-op-opening-abs',
        performedBy: 'Sibu (Bartender)',
        notes: '6x 750ml Bottles Absolut Vodka',
        tenantId: 'tenant_h0qc7wf',
        createdAt: '2026-08-01T08:00:00.000Z'
      },
      {
        movementId: 'MOV-2026-000206',
        inventoryItemId: 'invitem_beer_kf',
        movementType: 'OPENING_BALANCE',
        quantity: 48.0,
        unit: 'BOTTLE',
        normalizedQuantity: 48.0,
        unitCost: 160.00,
        totalCost: 7680.00,
        sourceType: 'OPENING',
        sourceId: 'OPENING-BAR-2026-01',
        operationId: 'inv-op-opening-kf',
        performedBy: 'Sibu (Bartender)',
        notes: '2 Cases Kingfisher Premium',
        tenantId: 'tenant_h0qc7wf',
        createdAt: '2026-08-01T08:00:00.000Z'
      },
      {
        movementId: 'MOV-2026-000207',
        inventoryItemId: 'invitem_lime_juice',
        movementType: 'OPENING_BALANCE',
        quantity: 15000.0,
        unit: 'ML',
        normalizedQuantity: 15000.0,
        unitCost: 0.25,
        totalCost: 3750.00,
        sourceType: 'OPENING',
        sourceId: 'OPENING-BAR-2026-01',
        operationId: 'inv-op-opening-lme',
        performedBy: 'Sibu (Bartender)',
        notes: 'Fresh Lime Juice Batch 15L',
        tenantId: 'tenant_h0qc7wf',
        createdAt: '2026-08-01T08:00:00.000Z'
      },
      {
        movementId: 'MOV-2026-000208',
        inventoryItemId: 'invitem_sugar_syrup',
        movementType: 'OPENING_BALANCE',
        quantity: 25000.0,
        unit: 'ML',
        normalizedQuantity: 25000.0,
        unitCost: 0.10,
        totalCost: 2500.00,
        sourceType: 'OPENING',
        sourceId: 'OPENING-BAR-2026-01',
        operationId: 'inv-op-opening-syp',
        performedBy: 'Sibu (Bartender)',
        notes: 'Sugar Syrup Batch 25L',
        tenantId: 'tenant_h0qc7wf',
        createdAt: '2026-08-01T08:00:00.000Z'
      }
    ];
  }

  _initSeedMovements() {
    const canonical = this._getCanonicalSeedMovements();
    const store = offlineStore.getCollection('inventory_movements');

    if (!store || !Array.isArray(store) || store.length < canonical.length) {
      offlineStore.setCollection('inventory_movements', canonical);
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

  getMovementsForItem(inventoryItemId, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    let store = offlineStore.getCollection('inventory_movements') || [];
    if (!Array.isArray(store) || store.length === 0) {
      store = this._getCanonicalSeedMovements();
      offlineStore.setCollection('inventory_movements', store);
    }
    return store.filter(m => 
      (m.inventoryItemId === inventoryItemId || m.inventory_item_id === inventoryItemId) &&
      (!targetTenantId || m.tenantId === targetTenantId || m.tenant_id === targetTenantId)
    );
  }

  getAllMovements(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    let store = offlineStore.getCollection('inventory_movements') || [];
    if (!Array.isArray(store) || store.length === 0) {
      store = this._getCanonicalSeedMovements();
      offlineStore.setCollection('inventory_movements', store);
    }
    return store.filter(m => !targetTenantId || m.tenantId === targetTenantId || m.tenant_id === targetTenantId);
  }

  recordMovement(movementData, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const item = inventoryItemModel.getItemById(movementData.inventoryItemId, targetTenantId);
    const baseUnit = item ? item.baseUnit : (movementData.unit || 'KG');

    const normalizedQuantity = inventoryItemModel.normalizeQuantity(
      movementData.quantity,
      movementData.unit || baseUnit,
      baseUnit
    );

    const isSubtraction = [
      'ACTUAL_CONSUMPTION',
      'THEORETICAL_CONSUMPTION',
      'WASTAGE',
      'STOCK_TRANSFER_OUT',
      'EXPIRED_DISPOSAL'
    ].includes(movementData.movementType);

    const signedNormalizedQty = isSubtraction ? -Math.abs(normalizedQuantity) : Math.abs(normalizedQuantity);
    const unitCost = parseFloat(movementData.unitCost) || 0;
    const totalCost = Math.round(Math.abs(signedNormalizedQty) * unitCost * 100) / 100;

    const opId = movementData.operationId || `inv-op-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const movementRecord = {
      movementId: `MOV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
      inventoryItemId: movementData.inventoryItemId,
      movementType: movementData.movementType,
      quantity: parseFloat(movementData.quantity) || 0,
      unit: movementData.unit || baseUnit,
      normalizedQuantity: signedNormalizedQty,
      unitCost,
      totalCost,
      sourceType: movementData.sourceType || 'MANUAL',
      sourceId: movementData.sourceId || 'MANUAL-ENTRY',
      operationId: opId,
      performedBy: movementData.performedBy || 'System User',
      notes: movementData.notes || '',
      tenantId: targetTenantId,
      createdAt: new Date().toISOString()
    };

    let store = offlineStore.getCollection('inventory_movements') || [];
    const existing = store.find(m => m.operationId === opId);
    if (existing) return existing;

    store.push(movementRecord);
    offlineStore.setCollection('inventory_movements', store);

    platformEventBus.publish('inventory:movement:recorded', { movement: movementRecord });
    return movementRecord;
  }
}

export const inventoryMovementModel = new InventoryMovementModel();
