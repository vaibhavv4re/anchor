/**
 * Verification Suite: Unified Storage Location Alignment & Configurability
 * Verifies:
 *  1. Default locations include Main (LOC-MWH), Kitchen (LOC-KITCHEN), Bar (LOC-BAR), Retail (LOC-RETAIL) with zero duplicates.
 *  2. Consistent LOC-<SHORTCODE> naming convention for newly created locations.
 *  3. Configurable dynamic resolution from storage_locations collection.
 *  4. Backward-compatible fallback for legacy LOC-314 / LOC-886 stock balances.
 */

import assert from 'node:assert/strict';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { StorageLocationRepository } from '../businessos/platform/repositories/storageLocationRepository.js';
import {
  CANONICAL_LOCATIONS,
  formatLocationCode,
  resolveDepartmentLocation,
  isDepartmentLocation,
  consolidateLegacyLocations
} from '../businessos/platform/inventory/storageLocationConfig.js';
import { inventoryConsumptionService } from '../businessos/platform/inventory/inventoryConsumptionService.js';

const TENANT_ID = 'tenant_loc_test';

async function run() {
  console.log('🧪 Running Storage Location Alignment & Configurability Tests...');

  // 1. Default seeding & zero duplicates
  offlineStore.setCollection('storage_locations', [], TENANT_ID);
  const repo = new StorageLocationRepository({ offlineStore });
  const locs = repo.getAll(TENANT_ID);

  const codes = locs.map(l => l.locationCode);
  assert.equal(new Set(codes).size, codes.length, 'Location codes must have zero duplicates');
  assert.ok(codes.includes('LOC-MWH'), 'Must include Main Warehouse (LOC-MWH)');
  assert.ok(codes.includes('LOC-KITCHEN'), 'Must include Kitchen Store (LOC-KITCHEN)');
  assert.ok(codes.includes('LOC-BAR'), 'Must include Bar Store (LOC-BAR)');
  assert.ok(codes.includes('LOC-RETAIL'), 'Must include Retail Store (LOC-RETAIL)');
  console.log(`  ✅ PASS: Seeded ${locs.length} canonical locations (${CANONICAL_LOCATIONS.MAIN}, ${CANONICAL_LOCATIONS.KITCHEN}, ${CANONICAL_LOCATIONS.BAR}, ${CANONICAL_LOCATIONS.RETAIL}) with 0 duplicates`);

  // 2. Consistent LOC-<SHORTCODE> formatting
  assert.equal(formatLocationCode('bakery'), 'LOC-BAKERY');
  assert.equal(formatLocationCode('LOC-ROOFTOP_BAR'), 'LOC-ROOFTOP-BAR');
  const created = repo.create({ locationName: 'Pastry Prep', shortName: 'PASTRY' }, { tenantId: TENANT_ID, employeeName: 'Admin' });
  assert.equal(created.locationCode, 'LOC-PASTRY', 'New location must follow LOC-<SHORTCODE> pattern');
  console.log('  ✅ PASS: Consistent LOC-<SHORTCODE> naming enforced on new locations');

  // 3. Default resolution in InventoryConsumptionService
  offlineStore.setCollection('stock_balances', [], TENANT_ID);
  assert.equal(inventoryConsumptionService.resolveLocationForItem('BAR0004', TENANT_ID), 'LOC-BAR');
  assert.equal(inventoryConsumptionService.resolveLocationForItem('RM0001', TENANT_ID), 'LOC-KITCHEN');
  console.log('  ✅ PASS: Consumption service defaults Bar -> LOC-BAR and Kitchen -> LOC-KITCHEN');

  // 4. Configurable location override
  offlineStore.setCollection('storage_locations', [
    { id: 'loc-custom-bar', locationCode: 'LOC-MAIN-BAR', locationName: 'Main Bar Counter', responsibleWorkspace: 'bar', alcoholStorage: true, status: 'ACTIVE', tenantId: TENANT_ID }
  ], TENANT_ID);
  assert.equal(resolveDepartmentLocation('BAR', TENANT_ID), 'LOC-MAIN-BAR', 'Must pick up user-configured Bar location');
  assert.equal(inventoryConsumptionService.resolveLocationForItem('BAR0004', TENANT_ID), 'LOC-MAIN-BAR');
  console.log('  ✅ PASS: Configurable Bar location override (LOC-MAIN-BAR) respected');

  // 5. Legacy alias compatibility (LOC-314 / LOC-886)
  assert.equal(isDepartmentLocation('LOC-314', 'BAR', TENANT_ID), true, 'Legacy LOC-314 recognized as BAR');
  assert.equal(isDepartmentLocation('LOC-886', 'KITCHEN', TENANT_ID), true, 'Legacy LOC-886 recognized as KITCHEN');
  console.log('  ✅ PASS: Legacy location aliases remain safely readable');

  // 6. Consolidate 9-location scenario (legacy + duplicate LOC-RETAIL)
  offlineStore.setCollection('storage_locations', [
    { id: 'old-1', locationCode: 'LOC-886', locationName: 'Kitchen Store', tenantId: TENANT_ID },
    { id: 'old-2', locationCode: 'LOC-805', locationName: 'Main Warehouse', tenantId: TENANT_ID },
    { id: 'old-3', locationCode: 'LOC-314', locationName: 'Bar Store', tenantId: TENANT_ID },
    { id: 'dup-4', locationCode: 'LOC-RETAIL', locationName: 'Retail Wine Store', tenantId: TENANT_ID },
    { id: 'new-5', locationCode: 'LOC-MWH', locationName: 'Main Warehouse / Dry Store', tenantId: TENANT_ID },
    { id: 'new-6', locationCode: 'LOC-CHILL', locationName: 'Chilled Store', tenantId: TENANT_ID },
    { id: 'new-7', locationCode: 'LOC-KITCHEN', locationName: 'Kitchen Store', tenantId: TENANT_ID },
    { id: 'new-8', locationCode: 'LOC-BAR', locationName: 'Bar Cold Room', tenantId: TENANT_ID },
    { id: 'new-9', locationCode: 'LOC-RETAIL', locationName: 'Retail Store', tenantId: TENANT_ID }
  ], TENANT_ID);

  offlineStore.setCollection('inventory', [
    { id: 'i-1', itemCode: 'RM0001', defaultLocationCode: 'LOC-805', tenantId: TENANT_ID },
    { id: 'i-2', itemCode: 'BAR0004', defaultLocationCode: 'LOC-314', tenantId: TENANT_ID }
  ], TENANT_ID);

  offlineStore.setCollection('stock_balances', [
    { id: 'b-1', itemCode: 'BAR0004', locationCode: 'LOC-314', quantity: 2.5, valuation: 5000, tenantId: TENANT_ID },
    { id: 'b-2', itemCode: 'BAR0004', locationCode: 'LOC-BAR', quantity: 1.5, valuation: 3000, tenantId: TENANT_ID }
  ], TENANT_ID);

  const consRes = await consolidateLegacyLocations(TENANT_ID, null);
  assert.equal(consRes.migratedItems, 2, 'Should remap 2 inventory items');
  assert.equal(consRes.migratedBalances, 1, 'Should merge 1 legacy balance');
  assert.equal(consRes.removedLocations, 4, 'Should remove 3 legacy + 1 duplicate LOC-RETAIL');

  const finalLocs = offlineStore.getCollection('storage_locations', TENANT_ID);
  assert.equal(finalLocs.length, 5, 'Should leave exactly 5 canonical locations');
  assert.ok(finalLocs.some(l => l.locationCode === 'LOC-RETAIL' && l.locationName === 'Retail Store'), 'Should retain canonical Retail Store');

  const finalBals = offlineStore.getCollection('stock_balances', TENANT_ID);
  assert.equal(finalBals.length, 1, 'Should merge duplicate balances into 1 row');
  assert.equal(finalBals[0].locationCode, 'LOC-BAR');
  assert.equal(finalBals[0].quantity, 4.0, 'Merged quantity 2.5 + 1.5 = 4.0');
  console.log('  ✅ PASS: Legacy & duplicate location consolidation (9 -> 5 locations, balances merged)');

  console.log('\n🎉 ALL STORAGE LOCATION ALIGNMENT TESTS PASSED!');
}

run().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});

