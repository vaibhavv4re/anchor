import { attachStandardMetadata } from '../metadata/entityMetadata.js';

/**
 * SupplierRepository domain persistence abstraction.
 *
 * Supports constructor dependency injection while remaining
 * fully backward-compatible with legacy global platform instances.
 */
export class SupplierRepository {
  constructor(deps = {}) {
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.auditLogger = deps.auditLogger || null;
    this.entityMetadata = deps.entityMetadata || { attachStandardMetadata };
  }

  getAll(tenantId = null) {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    let sups = store ? store.getCollection('suppliers', tenantId) : [];
    if (!sups || sups.length === 0) {
      sups = [
        { id: 'sup-001', supplierCode: 'SUP-001', supplierName: 'Prime Foods', contactPerson: 'Rajesh Sharma', phone: '+91 98200 11223', email: 'orders@primefoods.in', status: 'ACTIVE' },
        { id: 'sup-002', supplierCode: 'SUP-002', supplierName: 'Oceanic Fresh Seafood', contactPerson: 'Captain Fernandes', phone: '+91 98211 44556', email: 'sales@oceanicfresh.in', status: 'ACTIVE' },
        { id: 'sup-003', supplierCode: 'SUP-003', supplierName: 'Apex Dairy Products', contactPerson: 'Suresh Patel', phone: '+91 98333 77889', email: 'supply@apexdairy.com', status: 'ACTIVE' },
        { id: 'sup-004', supplierCode: 'SUP-004', supplierName: 'Green Harvest Farm Produce', contactPerson: 'Anil Deshmukh', phone: '+91 98444 99000', email: 'farm@greenharvest.in', status: 'ACTIVE' }
      ];
      if (store) {
        store.setCollection('suppliers', sups);
      }
    }
    return sups;
  }

  getByCode(supplierCode, tenantId = null) {
    return this.getAll(tenantId).find(s => s.supplierCode === supplierCode || s.id === supplierCode || s.supplierName === supplierCode) || null;
  }

  getById(id, tenantId = null) {
    return this.getAll(tenantId).find(s => s.id === id || s.supplierCode === id || s.supplierName === id) || null;
  }

  create(supplierData, session) {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    const tenantId = session ? session.tenantId : (supplierData.tenantId || '');

    let newSupplier = {
      id: 'sup-' + Math.random().toString(36).substring(2, 7),
      status: 'ACTIVE',
      ...supplierData
    };

    if (this.entityMetadata && typeof this.entityMetadata.attachStandardMetadata === 'function') {
      newSupplier = this.entityMetadata.attachStandardMetadata(newSupplier, tenantId, session);
    } else if (typeof attachStandardMetadata === 'function') {
      newSupplier = attachStandardMetadata(newSupplier, tenantId, session);
    }

    if (store) {
      store.appendItem('suppliers', newSupplier);
    }

    if (journal && typeof journal.createSyncJob === 'function') {
      journal.createSyncJob('UPLOAD_EVENT', tenantId, 'suppliers', { commandType: 'CREATE_SUPPLIER', eventType: 'SupplierCreated', ...newSupplier }, session);
    } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
      offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'suppliers', { commandType: 'CREATE_SUPPLIER', eventType: 'SupplierCreated', ...newSupplier }, session);
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Created Supplier "${newSupplier.supplierName}"`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return newSupplier;
  }

  update(id, patch, session) {
    const tenantId = session ? session.tenantId : '';
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);

    const list = store ? (store.getCollection('suppliers') || []) : [];
    const idx = list.findIndex(s => (s.id === id || s.supplierCode === id) && (!tenantId || s.tenantId === tenantId));
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
        store.setCollection('suppliers', list);
      }

      if (journal && typeof journal.createSyncJob === 'function') {
        journal.createSyncJob('UPDATE_SUPPLIER', tenantId, 'suppliers', { id: updated.id, patch }, session);
      } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
        offlineJournal.createSyncJob('UPDATE_SUPPLIER', tenantId, 'suppliers', { id: updated.id, patch }, session);
      }

      const actor = session ? session.employeeName : 'Admin';
      const actionMsg = `Updated Supplier "${updated.supplierName}" (${updated.supplierCode})`;
      if (this.auditLogger && typeof this.auditLogger.log === 'function') {
        this.auditLogger.log(actor, actionMsg, tenantId);
      } else if (typeof logAudit === 'function') {
        logAudit(actor, actionMsg, tenantId);
      }

      return updated;
    }
    return null;
  }

  archive(id, session) {
    const tenantId = session ? session.tenantId : '';
    const sup = this.getById(id, tenantId);
    if (!sup) return { success: false, error: 'Supplier not found.' };

    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const matchingItems = store
      ? (store.getCollection('inventory', tenantId) || []).filter(i => (i.preferredSupplierCode === sup.supplierCode || i.defaultSupplierCode === sup.supplierCode) && i.status !== 'ARCHIVED')
      : [];

    if (matchingItems.length > 0) {
      return {
        success: false,
        error: `❌ Cannot archive supplier "${sup.supplierName}". This supplier is currently set as the Preferred Supplier for ${matchingItems.length} active inventory item(s) (${matchingItems.map(i => i.itemCode).join(', ')}).\nReassign supplier for these items before archiving.`
      };
    }

    this.update(sup.id, { status: 'ARCHIVED' }, session);

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Archived Supplier "${sup.supplierName}" (${sup.supplierCode})`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return { success: true };
  }
}
