/**
 * TenantRepository domain persistence abstraction.
 *
 * Restaurant tenant profiles and section configurations.
 * Supports constructor dependency injection (DataGateway, OfflineStore, OfflineJournal, AuditLogger)
 * while remaining fully backward-compatible with legacy global platform instances.
 */
export class TenantRepository {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || null;
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.auditLogger = deps.auditLogger || null;
  }

  getById(tenantId) {
    if (this.dataGateway && typeof this.dataGateway.getCachedById === 'function') {
      return this.dataGateway.getCachedById('tenants', tenantId);
    }
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? (store.getCollection('tenants') || []).find(t => t.tenantId === tenantId || t.id === tenantId) || null : null;
  }

  getAll() {
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      return this.dataGateway.getCachedCollection('tenants') || [];
    }
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? store.getCollection('tenants') || [] : [];
  }

  updateSection(tenantId, sectionKey, patchObj, session) {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);

    const tenant = this.getById(tenantId);
    if (!tenant) return null;

    const updatedSection = { ...tenant[sectionKey], ...patchObj };
    const patch = {
      [sectionKey]: updatedSection,
      lastUpdatedAt: new Date().toISOString(),
      version: (tenant.version || 1) + 1,
      modifiedBy: session ? session.employeeName : 'Admin',
      modifiedAt: new Date().toISOString()
    };

    const updatedTenant = {
      ...tenant,
      ...patch
    };

    if (this.dataGateway && typeof this.dataGateway.update === 'function') {
      this.dataGateway.update('tenants', tenantId, patch, session);
    } else {
      if (store) {
        store.updateItem('tenants', 'tenantId', tenant.tenantId, updatedTenant);
      }

      if (journal && typeof journal.createSyncJob === 'function') {
        journal.createSyncJob('UPDATE_TENANT_SECTION', tenantId, 'tenants', { sectionKey, patchObj, version: updatedTenant.version }, session);
      } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
        offlineJournal.createSyncJob('UPDATE_TENANT_SECTION', tenantId, 'tenants', { sectionKey, patchObj, version: updatedTenant.version }, session);
      }
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Updated Business Profile Section: ${sectionKey}`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return updatedTenant;
  }
}
