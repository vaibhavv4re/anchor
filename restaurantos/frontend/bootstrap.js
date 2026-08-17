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
    if (appGraph.platform.dataGateway && typeof appGraph.platform.dataGateway.hydrateCollections === 'function') {
      appGraph.platform.dataGateway.hydrateCollections([
        'tenants', 'identities', 'employees', 'roles',
        'tables_master', 'dining_areas', 'menu_catalog',
        'inventory', 'suppliers', 'storage_locations',
        'stock_balances', 'purchase_orders', 'goods_receipt_notes',
        'inventory_requests', 'inventory_categories', 'inventory_uoms',
        'stock_issues', 'stock_transfers', 'stock_adjustments', 'stock_counts',
        'supplier_catalog', 'devices', 'system_config'
      ])
        .then(res => {
          console.log('☁️ [DataGateway] Pre-hydrated 12 domain collections from cloud:', Object.keys(res));
        })
        .catch(err => {
          console.warn('⚠️ [DataGateway] Hydration fallback notice:', err.message || err);
        });
    }
  }

  appGraph.shell.init();
  return appGraph.shell;
}
