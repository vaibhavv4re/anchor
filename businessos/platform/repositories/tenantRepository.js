/**
 * TenantRepository domain persistence abstraction.
 *
 * Restaurant tenant profiles and section configurations.
 * Supports constructor dependency injection while remaining
 * fully backward-compatible with legacy global platform instances.
 */
export class TenantRepository {
  constructor(deps = {}) {
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.auditLogger = deps.auditLogger || null;
  }

  getById(tenantId) {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? (store.getCollection('tenants') || []).find(t => t.tenantId === tenantId) || null : null;
  }

  getAll() {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? store.getCollection('tenants') || [] : [];
  }

  updateSection(tenantId, sectionKey, patchObj, session) {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);

    const tenant = this.getById(tenantId);
    if (!tenant) return null;

    tenant[sectionKey] = { ...tenant[sectionKey], ...patchObj };
    tenant.lastUpdatedAt = new Date().toISOString();
    tenant.version = (tenant.version || 1) + 1;
    tenant.modifiedBy = session ? session.employeeName : 'Admin';
    tenant.modifiedAt = new Date().toISOString();

    if (store) {
      store.updateItem('tenants', 'tenantId', tenant.tenantId, tenant);
    }

    if (journal && typeof journal.createSyncJob === 'function') {
      journal.createSyncJob('UPDATE_TENANT_SECTION', tenantId, 'tenants', { sectionKey, patchObj, version: tenant.version }, session);
    } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
      offlineJournal.createSyncJob('UPDATE_TENANT_SECTION', tenantId, 'tenants', { sectionKey, patchObj, version: tenant.version }, session);
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Updated Business Profile Section: ${sectionKey}`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return tenant;
  }
}
