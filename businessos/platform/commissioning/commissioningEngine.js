/**
 * BusinessOS Platform - Restaurant Commissioning Engine (PD-016)
 * Manages operational readiness, cross-workspace item dependencies, Command Center alerts, and go-live validation.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { tenantModel } from '../tenant/tenantModel.js';
import { platformEventBus } from '../events/platformEvents.js';

class CommissioningEngine {
  /**
   * Evaluates operational readiness per workspace (READY, ATTENTION_REQUIRED, NOT_CONFIGURED)
   */
  evaluateReadiness() {
    const tenant = tenantModel.getPrimaryTenant();
    const areas = offlineStore.getCollection('dining_areas') || [];
    const tables = offlineStore.getCollection('tables_master') || [];
    const employees = offlineStore.getCollection('employees') || [];
    const menuItems = offlineStore.getCollection('menu_items') || [];
    const prodSpecs = offlineStore.getCollection('prod_specs') || [];
    const inventory = offlineStore.getCollection('inventory') || [];

    // 1. Infrastructure Readiness
    const infraChecklist = [
      { id: 'profile', name: 'Restaurant Profile', isComplete: !!tenant && !!tenant.name },
      { id: 'areas', name: 'Dining Areas', isComplete: areas.length >= 1 },
      { id: 'tables', name: 'Dining Tables', isComplete: tables.length >= 1 },
      { id: 'roles', name: 'Role Permissions Review', isComplete: true },
      { id: 'users', name: 'Staff Users & Dynamic PINs', isComplete: employees.length >= 2 },
      { id: 'printers', name: 'ESC/POS Thermal Printers', isComplete: true },
      { id: 'gateways', name: 'Payment Gateway & UPI VPA', isComplete: true }
    ];
    const infraCompletedCount = infraChecklist.filter(c => c.isComplete).length;
    const isInfraReady = infraCompletedCount === infraChecklist.length;

    // 2. Kitchen Workspace Readiness
    const foodItems = menuItems.filter(i => {
      const spec = prodSpecs.find(p => p.itemId === i.id);
      return !spec || spec.destination === 'KITCHEN';
    });
    const kitchenMissing = [];
    if (!foodItems.length) kitchenMissing.push('Food Menu Catalog');
    if (!prodSpecs.length) kitchenMissing.push('Production Specifications (PD-010)');
    const kitchenStatus = foodItems.length >= 1 ? 'READY' : 'ATTENTION_REQUIRED';

    // 3. Bar Workspace Readiness
    const drinkItems = menuItems.filter(i => {
      const spec = prodSpecs.find(p => p.itemId === i.id);
      return spec && spec.destination === 'BAR';
    });
    const barMissing = [];
    if (!drinkItems.length) barMissing.push('Beverage & Drinks Menu');
    const barStatus = drinkItems.length >= 1 ? 'READY' : 'ATTENTION_REQUIRED';

    // 4. Inventory Workspace Readiness
    const inventoryMissing = [];
    if (!inventory.length) inventoryMissing.push('Master Inventory Items');
    const inventoryStatus = inventory.length >= 1 ? 'READY' : 'ATTENTION_REQUIRED';

    // 5. Command Center Alerts ("Things Requiring Attention")
    const commandCenterAlerts = [];
    if (!isInfraReady) {
      commandCenterAlerts.push({
        id: 'alt-infra',
        severity: 'HIGH',
        title: 'Infrastructure Incomplete',
        desc: `${infraChecklist.length - infraCompletedCount} configuration cards remaining.`,
        actionLabel: 'Complete Infrastructure →',
        targetView: 'config'
      });
    }
    if (kitchenStatus === 'ATTENTION_REQUIRED') {
      commandCenterAlerts.push({
        id: 'alt-kitchen',
        severity: 'MEDIUM',
        title: 'Kitchen Setup Attention Required',
        desc: `Food Menu Catalog is empty. Ask Chef to configure menu.`,
        actionLabel: 'Open Kitchen Workspace →',
        targetView: 'kitchen'
      });
    }
    if (inventoryStatus === 'ATTENTION_REQUIRED') {
      commandCenterAlerts.push({
        id: 'alt-inv',
        severity: 'LOW',
        title: 'Inventory Opening Stock Missing',
        desc: `No items in Master Inventory. Stock deduction (PD-001) pending.`,
        actionLabel: 'Import Inventory →',
        targetView: 'inventory'
      });
    }

    return {
      isInfraReady,
      infraChecklist,
      infraCompletedCount,
      infraTotal: infraChecklist.length,
      workspaces: {
        infrastructure: { status: isInfraReady ? 'READY' : 'ATTENTION_REQUIRED', completedCount: infraCompletedCount, total: infraChecklist.length },
        kitchen: { status: kitchenStatus, missingChecklist: kitchenMissing, foodItemsCount: foodItems.length },
        bar: { status: barStatus, missingChecklist: barMissing, drinkItemsCount: drinkItems.length },
        inventory: { status: inventoryStatus, missingChecklist: inventoryMissing, itemCount: inventory.length },
        cashier: { status: 'READY', missingChecklist: [] },
        manager: { status: 'READY', missingChecklist: [] }
      },
      commandCenterAlerts
    };
  }

  /**
   * Resolves cross-workspace item dependencies for a recipe (Recipe -> Inventory 1-Click Resolution)
   */
  evaluateRecipeDependencies(recipeItems = []) {
    const inventory = offlineStore.getCollection('inventory') || [];
    const dependencyResults = recipeItems.map(item => {
      const invMatch = inventory.find(inv => inv.name.toLowerCase().includes(item.name.toLowerCase()));
      return {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit || 'g',
        isAvailable: !!invMatch,
        inventoryItem: invMatch || null
      };
    });

    const missingItems = dependencyResults.filter(d => !d.isAvailable);
    return {
      dependencyResults,
      missingItems,
      hasMissingDependencies: missingItems.length > 0
    };
  }

  /**
   * 1-Click Action to create missing inventory items directly from Chef Recipe
   */
  createMissingInventoryItems(missingItems = []) {
    const created = [];
    missingItems.forEach(m => {
      const newItem = {
        id: 'inv_' + Math.random().toString(36).substring(2, 9),
        name: m.name,
        category: 'Chef Recipe Incredients',
        stock: 50,
        unit: m.unit || 'kg',
        minStock: 10,
        createdAt: new Date().toISOString()
      };
      offlineStore.appendItem('inventory', newItem);
      created.push(newItem);
    });

    platformEventBus.publish('commissioning:inventory_auto_created', { count: created.length });
    return created;
  }

  /**
   * Validates go-live readiness audit for "Restaurant Ready for Service"
   */
  validateGoLive() {
    const readiness = this.evaluateReadiness();
    const blockingItems = [];
    const warningItems = [];

    if (!readiness.isInfraReady) blockingItems.push('Infrastructure Configuration (Tables & Users required)');
    if (readiness.workspaces.kitchen.status === 'NOT_CONFIGURED') blockingItems.push('Kitchen Food Menu');

    if (readiness.workspaces.inventory.status !== 'READY') warningItems.push('Opening Inventory Stock');
    if (readiness.workspaces.bar.status !== 'READY') warningItems.push('Bar Drinks Menu');

    const isReadyToGoLive = blockingItems.length === 0;

    return {
      isReadyToGoLive,
      blockingItems,
      warningItems,
      timestamp: new Date().toISOString()
    };
  }
}

export const commissioningEngine = new CommissioningEngine();
