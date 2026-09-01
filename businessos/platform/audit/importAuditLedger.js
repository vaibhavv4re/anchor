/**
 * BusinessOS Platform - Import Audit Ledger (F9.5)
 * Persists audit logs for every import batch execution.
 * Security Guard: Strictly excludes staff PINs from audit logs.
 */

import { offlineStore } from '../offline_store/offlineStore.js';

export class ImportAuditLedger {
  /**
   * Records an import execution in the persistent audit ledger.
   * @param {Object} entry 
   * @returns {Object} Saved audit record
   */
  recordImport({ importId, tenantId = 'tenant-demo', userContext = {}, manifestMeta = {}, countsSummary = {} }) {
    // Security check: Remove PIN if present in context
    const cleanUser = {
      userId: userContext.userId || 'user-admin',
      role: userContext.role || 'Super Admin'
    };

    const record = {
      importId: importId || `IMP-${Date.now()}`,
      tenantId,
      performedBy: cleanUser,
      manifestMeta: {
        schemaVersion: manifestMeta.schemaVersion || '1.0',
        packageVersion: manifestMeta.packageVersion || '2026.09.01',
        restaurant: manifestMeta.restaurant || 'Coastal Bistro'
      },
      countsSummary,
      timestamp: new Date().toISOString()
    };

    offlineStore.appendItem('import_audit_ledger', record);
    return record;
  }

  /**
   * Retrieves import audit history for tenant.
   * @param {string} tenantId 
   * @returns {Array} List of import audit records
   */
  getAuditHistory(tenantId = 'tenant-demo') {
    const history = offlineStore.getCollection('import_audit_ledger') || [];
    return history.filter(h => h.tenantId === tenantId);
  }
}

export const importAuditLedger = new ImportAuditLedger();
