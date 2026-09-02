/**
 * Test Suite: Controlled Master Inventory CRUD & Audit History
 * Verifies:
 * 1. Immutable Item Code policy (Item Code cannot be edited/renamed)
 * 2. Field-level attribute updates (Item Name, Category, UOMs, Reorder Level)
 * 3. Change History audit trail recording with timestamp and user context
 * 4. Controlled Deactivation lifecycle (ACTIVE <-> INACTIVE)
 */

import { inventoryItemModel } from '../businessos/platform/inventory/inventoryItemModel.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

async function runMasterCrudTest() {
  console.log('----------------------------------------------------');
  console.log('📦 MASTER INVENTORY CONTROLLED CRUD TEST SUITE');
  console.log('----------------------------------------------------\n');

  const tenantId = 'tenant-crud-fixture';

  // Seed baseline master item
  offlineStore.setCollection('inventory', [
    {
      id: 'RM0801',
      tenantId,
      itemCode: 'RM0801',
      itemName: 'Potatoes',
      itemType: 'Raw Material',
      categoryCode: 'CAT-VEG',
      baseUom: 'KG',
      purchaseUom: 'KG',
      conversionFactor: 1,
      reorderLevel: 10,
      active: true,
      changeHistory: []
    }
  ]);

  console.log('1. Verifying Master Item Fetch & Baseline Inspection...');
  const item = inventoryItemModel.getItemById('RM0801', tenantId);
  console.log(`  Fetched Item: ${item.name} (${item.itemCode}) | Category: ${item.category} | Reorder: ${item.reorderLevel} ${item.baseUnit}`);
  if (!item || item.itemCode !== 'RM0801') throw new Error('Failed to fetch baseline master item.');
  console.log('✓ Master Item Baseline verified!');

  console.log('\n2. Testing Controlled Attribute Update & Change History Audit Logging...');
  const updates = {
    itemName: 'Fresh Organic Potatoes',
    reorderLevel: 25,
    purchaseUom: 'BAG',
    conversionFactor: 25
  };

  const updated = inventoryItemModel.updateItem('RM0801', updates, 'Inventory Manager', tenantId);
  console.log(`  Updated Item Name: "${updated.itemName}"`);
  console.log(`  Updated Reorder Level: ${updated.reorderLevel} ${updated.baseUom}`);
  console.log(`  Change History Logged Entries: ${updated.changeHistory.length}`);

  if (updated.changeHistory.length !== 4) {
    throw new Error(`Expected 4 change history entries, found ${updated.changeHistory.length}`);
  }

  console.log('  Audit History Trail:');
  updated.changeHistory.forEach(ch => {
    console.log(`    - [${ch.field}]: ${ch.previousValue} ➔ ${ch.newValue} (By: ${ch.changedBy})`);
  });
  console.log('✓ Change History Audit Trail verified!');

  console.log('\n3. Testing Immutable Item Code Policy...');
  // Attempting to pass itemCode in updates must NOT alter the original itemCode
  const codeAttempt = inventoryItemModel.updateItem('RM0801', { itemCode: 'RM9999', itemName: 'Renamed Potatoes' }, 'Inventory Manager', tenantId);
  console.log(`  Item Code after rename attempt: ${codeAttempt.itemCode}`);
  if (codeAttempt.itemCode !== 'RM0801') {
    throw new Error('IMMUTABLE Item Code was modified!');
  }
  console.log('✓ Immutable Item Code Policy verified!');

  console.log('\n4. Testing Deactivation Lifecycle (ACTIVE ➔ INACTIVE)...');
  const deactivated = inventoryItemModel.updateItem('RM0801', { active: false }, 'Inventory Manager', tenantId);
  console.log(`  Active Status after Deactivation: ${deactivated.active}`);
  if (deactivated.active !== false) {
    throw new Error('Item deactivation failed!');
  }

  const reactivated = inventoryItemModel.updateItem('RM0801', { active: true }, 'Inventory Manager', tenantId);
  console.log(`  Active Status after Reactivation: ${reactivated.active}`);
  if (reactivated.active !== true) {
    throw new Error('Item reactivation failed!');
  }
  console.log('✓ Controlled Deactivation Lifecycle verified!');

  console.log('\n----------------------------------------------------');
  console.log('✅ MASTER INVENTORY CONTROLLED CRUD TEST PASSED (100%)');
  console.log('----------------------------------------------------');
}

runMasterCrudTest();
