import { attachStandardMetadata } from '../metadata/entityMetadata.js';

/**
 * StaffRepository domain persistence abstraction.
 *
 * Staff employee accounts and master data.
 * Supports constructor dependency injection while remaining
 * fully backward-compatible with legacy global platform instances.
 */
export class StaffRepository {
  constructor(deps = {}) {
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.auditLogger = deps.auditLogger || null;
    this.entityMetadata = deps.entityMetadata || { attachStandardMetadata };
  }

  getAll(tenantId) {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? store.getCollection('employees', tenantId) || [] : [];
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

    if (store) {
      store.appendItem('employees', newEmp);
    }

    if (journal && typeof journal.createSyncJob === 'function') {
      journal.createSyncJob('UPLOAD_EVENT', tenantId, 'employees', { commandType: 'CREATE_STAFF_ACCOUNT', eventType: 'StaffAccountCreated', ...newEmp }, session);
    } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
      offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'employees', { commandType: 'CREATE_STAFF_ACCOUNT', eventType: 'StaffAccountCreated', ...newEmp }, session);
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Created Staff Account "${newEmp.name}" (${newEmp.employeeCode})`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return newEmp;
  }
}
