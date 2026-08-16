import { PlatformContainer, createPlatformContainer } from '../platformContainer.js';
import { authEngine } from '../authentication/authEngine.js';
import { rbacEngine } from '../authorization/rbacEngine.js';
import { platformEventBus } from '../events/platformEvents.js';
import { notificationEngine } from '../notifications/notificationEngine.js';

/**
 * ApplicationContainer composition root for RestaurantOS / BusinessOS.
 *
 * Bridges low-level platform infrastructure (PlatformContainer, DataGateway, 14 Repositories)
 * with application services (AuthEngine, RbacEngine, NotificationEngine, EventBus)
 * to supply explicit, non-global dependency graphs to ApplicationShell and UI Capability views.
 *
 * Enforces one-way architectural dependency flow:
 * Infrastructure (PlatformContainer) ---> Application (ApplicationContainer) ---> UI (ApplicationShell)
 */
export class ApplicationContainer {
  constructor(config = {}) {
    // 1. Ingest or initialize PlatformContainer infrastructure
    this.platform = config.platformContainer || createPlatformContainer(config.platformConfig || config);

    // 2. Wire Application Services
    this.platformEventBus = config.platformEventBus || platformEventBus;
    this.rbacEngine = config.rbacEngine || rbacEngine;
    this.notificationEngine = config.notificationEngine || notificationEngine;
    this.authEngine = config.authEngine || authEngine;

    // 3. Expose DataGateway & Repositories
    this.dataGateway = this.platform.dataGateway;
    this.repositories = this.platform.repositories;

    // 4. Grouped Application Dependencies Bundle
    this.appDependencies = {
      platform: this.platform,
      dataGateway: this.dataGateway,
      repositories: this.repositories,
      authEngine: this.authEngine,
      rbacEngine: this.rbacEngine,
      notificationEngine: this.notificationEngine,
      platformEventBus: this.platformEventBus,
      services: this.platform.services
    };
  }

  /**
   * Helper to retrieve a repository by name.
   * @param {string} repoName 
   */
  getRepository(repoName) {
    return this.repositories ? this.repositories[repoName] : null;
  }
}

/**
 * Factory helper to construct a configured ApplicationContainer composition root.
 */
export function createApplicationContainer(config = {}) {
  return new ApplicationContainer(config);
}
