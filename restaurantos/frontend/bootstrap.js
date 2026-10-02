import { createPlatformContainer } from '../../businessos/platform/platformContainer.js';
import { createApplicationContainer } from '../../businessos/platform/container/applicationContainer.js';
import { ApplicationShell } from './app.js';

/**
 * RestaurantOS Modular Application Bootstrap Entry Point.
 *
 * Assembles the full runtime composition graph:
 * PlatformContainer -> DataGateway -> 14 Repositories -> ApplicationContainer -> ApplicationShell
 */

/**
 * Instantiates the complete modular application runtime graph.
 * @param {Object} options Configuration overrides for platform and application containers.
 * @returns {{ platform: Object, application: Object, shell: ApplicationShell }}
 */
export function createApplication(options = {}) {
  const platform = options.platformContainer || createPlatformContainer(options.platform || options);
  const application = options.applicationContainer || createApplicationContainer({
    platformContainer: platform,
    ...options.application
  });

  const shell = new ApplicationShell({
    container: application,
    appDependencies: application.appDependencies
  });

  return {
    platform,
    application,
    shell
  };
}

/**
 * Bootstraps and initializes the modular application shell with diagnostic loggers.
 * @param {Object} options Configuration overrides.
 * @returns {ApplicationShell} Initialized ApplicationShell instance.
 */
export function startModularApp(options = {}) {
  const appGraph = createApplication(options);

  if (typeof window !== 'undefined') {
    window.__APP__ = appGraph;
    console.log('🚀 [Anchor Modular Runtime] Initialized successfully.');
    console.log('💡 Access global app graph in devtools via: window.__APP__');

    // Trigger background cloud collection hydration for all tenant domain collections
    const HYDRATE_SET = [
      'tenants', 'identities', 'employees', 'roles',
      'tables_master', 'dining_areas', 'menu_catalog',
      'inventory', 'suppliers', 'storage_locations',
      'stock_balances', 'purchase_orders', 'goods_receipt_notes',
      'inventory_requests', 'inventory_categories', 'inventory_uoms',
      'stock_issues', 'stock_transfers', 'stock_adjustments', 'stock_counts',
      'supplier_catalog', 'devices', 'system_config',
      // Kitchen domain collections
      'kitchen_menu_items', 'recipes', 'recipe_ingredients', 'orders',
      'production_batches', 'stock_transactions', 'stock_requisitions',
      // Billing & Session domain collections (Cashier & Waiter Realtime Synchronization)
      'table_sessions', 'bill_revisions', 'invoices', 'payments', 'session_audit_logs', 'offline_journal'
    ];

    const dg = appGraph.platform.dataGateway;
    if (dg && typeof dg.hydrateCollections === 'function') {
      const hydrate = (tenantId) => dg.hydrateCollections(HYDRATE_SET, tenantId || 'tenant_h0qc7wf')
        .then(res => console.log('☁️ [DataGateway] Pre-hydrated domain collections from cloud:', Object.keys(res)))
        .catch(err => console.warn('⚠️ [DataGateway] Hydration fallback notice:', err.message || err));

      // Boot warm-up (read-only config succeeds under RLS even pre-login).
      hydrate('tenant_h0qc7wf');

      // Stage 1B NON-BREAKING GATE: once RLS is enabled, tenant business reads
      // require the session JWT. Re-hydrate with the authenticated tenant on
      // login so every workspace populates correctly.
      if (appGraph.platform.eventBus && typeof appGraph.platform.eventBus.subscribe === 'function') {
        appGraph.platform.eventBus.subscribe('auth:session_started', (session) => {
          hydrate(session && session.tenantId);
        });
      }
    }
  }

  appGraph.shell.init();
  return appGraph.shell;
}
