import { attachStandardMetadata } from '../metadata/entityMetadata.js';

/**
 * PurchaseOrderRepository domain persistence abstraction.
 *
 * Supports constructor dependency injection while remaining
 * fully backward-compatible with legacy global platform instances.
 */
export class PurchaseOrderRepository {
  constructor(deps = {}) {
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.auditLogger = deps.auditLogger || null;
    this.entityMetadata = deps.entityMetadata || { attachStandardMetadata };
  }

  getAll(tenantId = null) {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? store.getCollection('purchase_orders', tenantId) || [] : [];
  }

  getByPoNumber(poNumber, tenantId = null) {
    return this.getAll(tenantId).find(p => p.poNumber === poNumber) || null;
  }

  getById(id, tenantId = null) {
    return this.getAll(tenantId).find(p => p.id === id || p.poNumber === id) || null;
  }

  create(poData, session) {
    const tenantId = session ? session.tenantId : (poData.tenantId || '');
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);

    const existing = this.getAll(tenantId);
    const count = existing.length + 1;
    const poNum = poData.poNumber || (`PO-2026-${String(count).padStart(4, '0')}`);

    let newPo = {
      id: 'po-' + Math.random().toString(36).substring(2, 7),
      poNumber: poNum,
      tenantId,
      supplierCode: poData.supplierCode,
      supplierName: poData.supplierName,
      orderDate: poData.orderDate || new Date().toISOString().split('T')[0],
      expectedDeliveryDate: poData.expectedDeliveryDate || new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
      destinationLocationCode: poData.destinationLocationCode || 'LOC-MWH',
      paymentTerms: poData.paymentTerms || 'Net 30',
      notes: poData.notes || '',
      items: poData.items || [],
      subtotal: poData.subtotal || 0,
      taxAmount: poData.taxAmount || 0,
      grandTotal: poData.grandTotal || 0,
      status: poData.status || 'DRAFT',
      createdBy: session ? session.employeeName : 'Inventory Manager',
      createdAt: new Date().toISOString(),
      submittedBy: null,
      submittedAt: null,
      approvedBy: null,
      approvedAt: null
    };

    if (this.entityMetadata && typeof this.entityMetadata.attachStandardMetadata === 'function') {
      newPo = this.entityMetadata.attachStandardMetadata(newPo, tenantId, session);
    } else if (typeof attachStandardMetadata === 'function') {
      newPo = attachStandardMetadata(newPo, tenantId, session);
    }

    if (store) {
      store.appendItem('purchase_orders', newPo);
    }

    if (journal && typeof journal.createSyncJob === 'function') {
      journal.createSyncJob('UPLOAD_EVENT', tenantId, 'purchase_orders', { commandType: 'CREATE_PURCHASE_ORDER', eventType: 'PurchaseOrderCreated', ...newPo }, session);
    } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
      offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'purchase_orders', { commandType: 'CREATE_PURCHASE_ORDER', eventType: 'PurchaseOrderCreated', ...newPo }, session);
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Created Purchase Order "${newPo.poNumber}" (${newPo.supplierName})`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return newPo;
  }

  update(id, patch, session) {
    const tenantId = session ? session.tenantId : '';
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);

    const list = store ? (store.getCollection('purchase_orders') || []) : [];
    const idx = list.findIndex(p => (p.id === id || p.poNumber === id) && (!tenantId || p.tenantId === tenantId));
    if (idx !== -1) {
      const updated = {
        ...list[idx],
        ...patch,
        modifiedBy: session ? session.employeeName : 'Admin',
        modifiedAt: new Date().toISOString(),
        version: (list[idx].version || 1) + 1
      };
      list[idx] = updated;
      if (store) {
        store.setCollection('purchase_orders', list);
      }

      if (journal && typeof journal.createSyncJob === 'function') {
        journal.createSyncJob('UPDATE_PURCHASE_ORDER', tenantId, 'purchase_orders', { id: updated.id, patch }, session);
      } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
        offlineJournal.createSyncJob('UPDATE_PURCHASE_ORDER', tenantId, 'purchase_orders', { id: updated.id, patch }, session);
      }

      const actor = session ? session.employeeName : 'Admin';
      const actionMsg = `Updated Purchase Order "${updated.poNumber}" (${updated.status})`;
      if (this.auditLogger && typeof this.auditLogger.log === 'function') {
        this.auditLogger.log(actor, actionMsg, tenantId);
      } else if (typeof logAudit === 'function') {
        logAudit(actor, actionMsg, tenantId);
      }

      return updated;
    }
    return null;
  }
}
