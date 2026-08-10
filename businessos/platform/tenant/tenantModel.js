/**
 * BusinessOS Platform - Tenant Entity & Setup Progress State (PD-012, PD-013, PD-014)
 * Manages tenant restaurant profile, currency, timezone, service charges, and setup progress.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

class TenantModel {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('tenants')) {
      const defaultTenant = {
        tenantId: 'tenant-anchor-bistro',
        name: 'Anchor Bistro & Cafe',
        currency: 'INR',
        currencySymbol: '₹',
        timezone: 'Asia/Kolkata',
        serviceChargePercent: 5,
        isSetupComplete: false,
        isOperationsStarted: true,
        setupProgressPercent: 65,
        lastCompletedStep: 3,
        createdAt: new Date().toISOString(),
        correlationId: 'CID-INIT-001'
      };
      offlineStore.setCollection('tenants', [defaultTenant]);
    }
  }

  getPrimaryTenant() {
    const tenants = offlineStore.getCollection('tenants') || [];
    return tenants[0] || null;
  }

  createTenant({ name, currency = 'INR', currencySymbol = '₹', timezone = 'Asia/Kolkata', adminName, adminPin }) {
    const tenantId = 'tenant_' + Math.random().toString(36).substring(2, 9);
    const correlationId = 'CID-' + Math.floor(10000 + Math.random() * 90000);

    const newTenant = {
      tenantId,
      name,
      currency,
      currencySymbol,
      timezone,
      serviceChargePercent: 5,
      isSetupComplete: false,
      isOperationsStarted: false,
      setupProgressPercent: 20,
      lastCompletedStep: 1,
      createdAt: new Date().toISOString(),
      correlationId
    };

    offlineStore.appendItem('tenants', newTenant);

    platformEventBus.publish('tenant:created', {
      tenantId,
      name,
      adminName,
      correlationId,
      timestamp: newTenant.createdAt
    });

    return newTenant;
  }

  updateTenant(updates) {
    const tenants = offlineStore.getCollection('tenants') || [];
    if (!tenants.length) return null;

    tenants[0] = { ...tenants[0], ...updates, updatedAt: new Date().toISOString() };
    offlineStore.setCollection('tenants', tenants);

    platformEventBus.publish('tenant:updated', tenants[0]);
    return tenants[0];
  }
}

export const tenantModel = new TenantModel();
