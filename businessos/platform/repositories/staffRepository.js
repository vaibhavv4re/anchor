import { attachStandardMetadata } from '../metadata/entityMetadata.js';

/**
 * StaffRepository domain persistence abstraction.
 *
 * Staff employee accounts and master data.
 * Supports constructor dependency injection (DataGateway, OfflineStore, OfflineJournal, AuditLogger)
 * while remaining fully backward-compatible with legacy global platform instances.
 */
export class StaffRepository {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || null;
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.auditLogger = deps.auditLogger || null;
    this.entityMetadata = deps.entityMetadata || { attachStandardMetadata };
  }

  getAll(tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      return this.dataGateway.getCachedCollection('employees', tenantId) || [];
    }
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? store.getCollection('employees', tenantId) || [] : [];
  }

  getByEmployeeCode(employeeCode, tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedById === 'function') {
      return this.dataGateway.getCachedById('employees', employeeCode, tenantId);
    }
    return this.getAll(tenantId).find(e => e.employeeCode === employeeCode || e.id === employeeCode) || null;
  }

  getById(id, tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedById === 'function') {
      return this.dataGateway.getCachedById('employees', id, tenantId);
    }
    return this.getAll(tenantId).find(e => e.id === id || e.employeeCode === id) || null;
  }

  create(employeeData, session) {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    const tenantId = session ? session.tenantId : (employeeData.tenantId || '');

    let newEmp = {
      id: 'emp-' + Math.random().toString(36).substring(2, 7),
      status: 'ACTIVE',
      ...employeeData
    };

    if (this.entityMetadata && typeof this.entityMetadata.attachStandardMetadata === 'function') {
      newEmp = this.entityMetadata.attachStandardMetadata(newEmp, tenantId, session);
    } else if (typeof attachStandardMetadata === 'function') {
      newEmp = attachStandardMetadata(newEmp, tenantId, session);
    }

    if (this.dataGateway && typeof this.dataGateway.create === 'function') {
      this.dataGateway.create('employees', newEmp, session);
    } else {
      if (store) {
        store.appendItem('employees', newEmp);
      }

      if (journal && typeof journal.createSyncJob === 'function') {
        journal.createSyncJob('UPLOAD_EVENT', tenantId, 'employees', { commandType: 'CREATE_STAFF_ACCOUNT', eventType: 'StaffAccountCreated', ...newEmp }, session);
      } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
        offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'employees', { commandType: 'CREATE_STAFF_ACCOUNT', eventType: 'StaffAccountCreated', ...newEmp }, session);
      }
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Created Staff Account "${newEmp.name}" (${newEmp.employeeCode || newEmp.id})`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return newEmp;
  }

  update(id, patch, session) {
    const tenantId = session ? session.tenantId : '';
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);

    const existing = this.getById(id, tenantId);
    if (existing) {
      const updated = {
        ...existing,
        ...patch,
        modifiedBy: session ? session.employeeName : 'Admin',
        modifiedAt: new Date().toISOString()
      };

      if (this.dataGateway && typeof this.dataGateway.update === 'function') {
        this.dataGateway.update('employees', id, patch, session);
      } else {
        const list = store ? (store.getCollection('employees') || []) : [];
        const idx = list.findIndex(e => (e.id === id || e.employeeCode === id) && (!tenantId || e.tenantId === tenantId));
        if (idx !== -1) {
          list[idx] = updated;
          if (store) store.setCollection('employees', list);
        }

        if (journal && typeof journal.createSyncJob === 'function') {
          journal.createSyncJob('UPDATE_STAFF', tenantId, 'employees', { id: updated.id, patch }, session);
        } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
          offlineJournal.createSyncJob('UPDATE_STAFF', tenantId, 'employees', { id: updated.id, patch }, session);
        }
      }

      const actor = session ? session.employeeName : 'Admin';
      const actionMsg = `Updated Staff Account "${updated.name || updated.employeeCode}"`;
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
