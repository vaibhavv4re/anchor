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
 * Bootstraps and initializes the modular application shell.
 * @param {Object} options Configuration overrides.
 * @returns {ApplicationShell} Initialized ApplicationShell instance.
 */
export function startModularApp(options = {}) {
  const { shell } = createApplication(options);
  shell.init();
  return shell;
}
