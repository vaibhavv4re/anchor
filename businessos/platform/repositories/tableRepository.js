import { attachStandardMetadata } from '../metadata/entityMetadata.js';

/**
 * TableRepository domain persistence abstraction.
 *
 * Dining Table asset management and master data.
 * Supports constructor dependency injection while remaining
 * fully backward-compatible with legacy global platform instances.
 */
export class TableRepository {
  constructor(deps = {}) {
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.auditLogger = deps.auditLogger || null;
    this.entityMetadata = deps.entityMetadata || { attachStandardMetadata };
  }

  getAll(tenantId) {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? store.getCollection('tables_master', tenantId) || [] : [];
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

    if (store) {
      store.appendItem('tables_master', newTable);
    }

    if (journal && typeof journal.createSyncJob === 'function') {
      journal.createSyncJob('UPLOAD_EVENT', tenantId, 'tables_master', { commandType: 'CREATE_TABLE_ASSET', eventType: 'TableAssetCreated', ...newTable }, session);
    } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
      offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'tables_master', { commandType: 'CREATE_TABLE_ASSET', eventType: 'TableAssetCreated', ...newTable }, session);
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Created Dining Table Asset "${newTable.tableCode}"`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return newTable;
  }
}
