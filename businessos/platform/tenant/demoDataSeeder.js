/**
 * BusinessOS Platform - Explore Mode Sample Data Seeder (PD-013)
 * Seeds sample restaurant data ("Anchor Bistro Demo") for instant evaluation.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

class DemoDataSeeder {
  loadExploreModeData() {
    // 1. Tenant Sample Profile
    offlineStore.setCollection('tenants', [{
      tenantId: 'tenant-demo',
      name: 'Anchor Bistro (Sample Restaurant)',
      currency: 'INR',
      currencySymbol: '₹',
      timezone: 'Asia/Kolkata',
      serviceChargePercent: 5,
      isSetupComplete: true,
      isOperationsStarted: true,
      setupProgressPercent: 100,
      createdAt: new Date().toISOString()
    }]);

    // 2. Publish Explore Mode Event
    platformEventBus.publish('sample_mode:loaded', {
      restaurantName: 'Anchor Bistro (Sample Restaurant)',
      timestamp: new Date().toISOString()
    });

    return { success: true, message: 'Explore Mode loaded successfully' };
  }
}

export const demoDataSeeder = new DemoDataSeeder();
