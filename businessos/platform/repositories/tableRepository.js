import { attachStandardMetadata } from '../metadata/entityMetadata.js';

/**
 * TableRepository domain persistence abstraction.
 *
 * Dining Table asset management and master data.
 * Supports constructor dependency injection (DataGateway, OfflineStore, OfflineJournal, AuditLogger)
 * while remaining fully backward-compatible with legacy global platform instances.
 */
export class TableRepository {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || null;
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.auditLogger = deps.auditLogger || null;
    this.entityMetadata = deps.entityMetadata || { attachStandardMetadata };
  }

  getAll(tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      return this.dataGateway.getCachedCollection('tables_master', tenantId) || [];
    }
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? store.getCollection('tables_master', tenantId) || [] : [];
  }

  getByTableCode(tableCode, tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedById === 'function') {
      return this.dataGateway.getCachedById('tables_master', tableCode, tenantId);
    }
    return this.getAll(tenantId).find(t => t.tableCode === tableCode || t.id === tableCode) || null;
  }

  getById(id, tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedById === 'function') {
      return this.dataGateway.getCachedById('tables_master', id, tenantId);
    }
    return this.getAll(tenantId).find(t => t.id === id || t.tableCode === id) || null;
  }

  create(tableData, session) {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    const tenantId = session ? session.tenantId : (tableData.tenantId || '');

    let newTable = {
      id: 'tbl-' + Math.random().toString(36).substring(2, 7),
      status: 'ACTIVE',
      ...tableData
    };

    if (this.entityMetadata && typeof this.entityMetadata.attachStandardMetadata === 'function') {
      newTable = this.entityMetadata.attachStandardMetadata(newTable, tenantId, session);
    } else if (typeof attachStandardMetadata === 'function') {
      newTable = attachStandardMetadata(newTable, tenantId, session);
    }

    if (this.dataGateway && typeof this.dataGateway.create === 'function') {
      this.dataGateway.create('tables_master', newTable, session);
    } else {
      if (store) {
        store.appendItem('tables_master', newTable);
      }

      if (journal && typeof journal.createSyncJob === 'function') {
        journal.createSyncJob('UPLOAD_EVENT', tenantId, 'tables_master', { commandType: 'CREATE_TABLE_ASSET', eventType: 'TableAssetCreated', ...newTable }, session);
      } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
        offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'tables_master', { commandType: 'CREATE_TABLE_ASSET', eventType: 'TableAssetCreated', ...newTable }, session);
      }
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Created Dining Table Asset "${newTable.tableCode || newTable.tableName || newTable.id}"`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return newTable;
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
        this.dataGateway.update('tables_master', id, patch, session);
      } else {
        const list = store ? (store.getCollection('tables_master') || []) : [];
        const idx = list.findIndex(t => (t.id === id || t.tableCode === id) && (!tenantId || t.tenantId === tenantId));
        if (idx !== -1) {
          list[idx] = updated;
          if (store) store.setCollection('tables_master', list);
        }

        if (journal && typeof journal.createSyncJob === 'function') {
          journal.createSyncJob('UPDATE_TABLE', tenantId, 'tables_master', { id: updated.id, patch }, session);
        } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
          offlineJournal.createSyncJob('UPDATE_TABLE', tenantId, 'tables_master', { id: updated.id, patch }, session);
        }
      }

      const actor = session ? session.employeeName : 'Admin';
      const actionMsg = `Updated Dining Table Asset "${updated.tableCode || updated.id}"`;
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
