import { createPlatformContainer } from '../../businessos/platform/platformContainer.js';
import { createApplicationContainer } from '../../businessos/platform/container/applicationContainer.js';
import { runtimeConfig } from '../../businessos/platform/cloud/runtimeConfig.js';
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
  // F2 fix - restore the authenticated session BEFORE any network call so the
  // very first cloud read/write carries the tenant JWT instead of the anon key
  // (which forced RLS denies). Must be the first platform action.
  const restoredToken = runtimeConfig.hydrateAccessToken();
  if (restoredToken) {
    console.log('🔑 [Bootstrap] Restored authenticated session from storage on reload.');
  }

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
      // NOTE: 'offline_journal' is intentionally EXCLUDED. It is this device's local
      // retry queue (durable, per-device state), NOT shared cloud data. Hydrating it
      // from the cloud offline_journal table replaced pending local jobs with another
      // device's history, silently dropping unsynced writes (e.g. a finalized bill)
      // and un-protecting their rows on refresh - which made bills vanish.
      'table_sessions', 'bill_revisions', 'invoices', 'payments', 'session_audit_logs',
      // Retail (Wine Store) domain - POS catalogue reads MUST come from live cloud
      // rows (retail_products), never seeded mock data. Stock itself is shared with
      // the main inventory core (stock_balances @ LOC-RETAIL).
      'retail_products', 'retail_sales', 'cash_registers', 'register_transactions', 'retail_categories',
      // Fiscal config (single source of truth for the Food/Bar tax split) - read-only
      // under RLS pre-login, so every device resolves the same tax categories.
      'tax_configurations'
    ];

    const dg = appGraph.platform.dataGateway;
    if (dg && typeof dg.hydrateCollections === 'function') {
      // Collections readable with the public anon key even pre-login (read-only
      // under RLS). Business collections (orders/sessions/bills) need the JWT.
      const CONFIG_SET = [
        'tenants', 'identities', 'roles', 'devices', 'system_config',
        'inventory_categories', 'inventory_uoms', 'storage_locations',
        'suppliers', 'tax_configurations'
      ];

      const hydrate = (tenantId) => dg.hydrateCollections(HYDRATE_SET, tenantId || 'tenant_h0qc7wf')
        .then(res => console.log('☁️ [DataGateway] Pre-hydrated domain collections from cloud:', Object.keys(res)))
        .catch(err => console.warn('⚠️ [DataGateway] Hydration fallback notice:', err.message || err));

      const hydrateConfig = (tenantId) => dg.hydrateCollections(CONFIG_SET, tenantId || 'tenant_h0qc7wf')
        .then(res => console.log('☁️ [DataGateway] Hydrated anon-readable config collections:', Object.keys(res)))
        .catch(err => console.warn('⚠️ [DataGateway] Config hydration fallback notice:', err.message || err));

      // Boot warm-up: if a session JWT was restored, do the full authenticated
      // hydrate immediately (fresh browser now sees persisted business data).
      // Otherwise only pull the anon-readable config so the shell has menu/tax
      // structure, and DEFER the business hydrate to auth:session_started.
      if (restoredToken) {
        hydrate('tenant_h0qc7wf');
      } else {
        hydrateConfig('tenant_h0qc7wf');
      }

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
