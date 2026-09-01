/**
 * BusinessOS Platform - Tenant Data Reset Engine (F9.0)
 * Implements 3-tier controlled data reset semantics:
 * 1. System Configuration (NEVER wiped): Tenants, Roles, Permissions, Tax Specs, UOMs, System Settings.
 * 2. Master Data (Wiped ONLY in RESET_ENVIRONMENT mode): Inventory Items, Suppliers, Menus, Variants, Recipes, Locations, Tables.
 * 3. Transactional Data (Wiped in BOTH RESET_ENVIRONMENT and RESET_TRANSACTIONS_ONLY modes): Orders, Sessions, KOT/BOT, Bills, Payments, Stock Movements, GRNs, POs, Batches, Expenses, Audit.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

export const RESET_MODES = {
  RESET_ENVIRONMENT: 'RESET_ENVIRONMENT',
  RESET_TRANSACTIONS_ONLY: 'RESET_TRANSACTIONS_ONLY'
};

const TRANSACTIONAL_COLLECTIONS = [
  'orders',
  'table_sessions',
  'kot_bot_tickets',
  'bills',
  'invoices',
  'payments',
  'stock_ledger',
  'inventory_movements',
  'grns',
  'purchase_orders',
  'production_batches',
  'wastage_records',
  'stock_counts',
  'expenses',
  'audit',
  'session_audit_logs',
  'timeline_ledger',
  'bill_revisions',
  'notifications'
];

const MASTER_DATA_COLLECTIONS = [
  'inventory_items',
  'suppliers',
  'menu_items',
  'menu_categories',
  'menu_variants',
  'recipes',
  'recipe_revisions',
  'storage_locations',
  'tables_master',
  'dining_areas'
];

const SYSTEM_CONFIG_COLLECTIONS = [
  'tenants',
  'identities',
  'employees',
  'roles',
  'permissions',
  'tax_profiles',
  'uom_definitions',
  'system_settings',
  'import_definitions'
];

export class TenantDataResetService {
  /**
   * Resets tenant data based on specified mode with strict safety guards.
   * @param {Object} params 
   * @param {string} params.tenantId
   * @param {string} params.mode - RESET_ENVIRONMENT | RESET_TRANSACTIONS_ONLY
   * @param {string} params.tenantNameConfirm - Must match exact tenant name
   * @param {boolean} params.userAcknowledged - Must be true
   * @param {Object} params.requestedBy - { userId, role }
   * @returns {Object} Execution summary with deleted record counts per collection
   */
  executeReset({ tenantId = 'tenant-demo', mode, tenantNameConfirm, userAcknowledged, requestedBy = {} }) {
    if (!mode || !Object.values(RESET_MODES).includes(mode)) {
      throw new Error(`[TenantDataResetService] Invalid reset mode: ${mode}. Must be RESET_ENVIRONMENT or RESET_TRANSACTIONS_ONLY.`);
    }

    if (!userAcknowledged) {
      throw new Error('[TenantDataResetService] User acknowledgment checkbox required before executing reset.');
    }

    // Verify tenant exists
    const tenants = offlineStore.getCollection('tenants') || [];
    const targetTenant = tenants.find(t => t.tenantId === tenantId || t.id === tenantId);
    const expectedName = targetTenant ? (targetTenant.name || targetTenant.tenantName) : 'ABC Restaurant';

    if (tenantNameConfirm !== expectedName) {
      throw new Error(`[TenantDataResetService] Tenant name confirmation mismatch. Expected "${expectedName}", got "${tenantNameConfirm}".`);
    }

    const report = {
      resetId: `RST-${Date.now()}`,
      tenantId,
      mode,
      timestamp: new Date().toISOString(),
      performedBy: {
        userId: requestedBy.userId || 'user-admin',
        role: requestedBy.role || 'Super Admin'
      },
      clearedCollections: {},
      totalRecordsDeleted: 0
    };

    // Determine target collections based on mode
    const collectionsToClear = [...TRANSACTIONAL_COLLECTIONS];
    if (mode === RESET_MODES.RESET_ENVIRONMENT) {
      collectionsToClear.push(...MASTER_DATA_COLLECTIONS);
    }

    // Truncate collections safely
    collectionsToClear.forEach(col => {
      const existing = offlineStore.getCollection(col);
      const count = Array.isArray(existing) ? existing.length : 0;
      if (count > 0) {
        offlineStore.setCollection(col, []);
        report.clearedCollections[col] = count;
        report.totalRecordsDeleted += count;
      } else {
        report.clearedCollections[col] = 0;
      }
    });

    // Ensure system config collections remain intact
    SYSTEM_CONFIG_COLLECTIONS.forEach(col => {
      const existing = offlineStore.getCollection(col);
      report.clearedCollections[`${col} (PRESERVED)`] = Array.isArray(existing) ? existing.length : 0;
    });

    // Record reset audit log (Security: NO PINs logged!)
    offlineStore.appendItem('tenant_reset_audit', {
      resetId: report.resetId,
      tenantId: report.tenantId,
      mode: report.mode,
      performedBy: report.performedBy,
      totalRecordsDeleted: report.totalRecordsDeleted,
      clearedCollections: report.clearedCollections,
      timestamp: report.timestamp
    });

    // Publish platform event
    platformEventBus.publish('tenant:data_reset', {
      resetId: report.resetId,
      tenantId,
      mode,
      totalRecordsDeleted: report.totalRecordsDeleted,
      timestamp: report.timestamp
    });

    return report;
  }
}

export const tenantDataResetService = new TenantDataResetService();
