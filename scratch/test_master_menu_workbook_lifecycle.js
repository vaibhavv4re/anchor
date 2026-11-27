/**
 * Verification Suite: Unified Master Menu & Recipe Workbook Lifecycle
 * Tests:
 *  1. Exporting live state into the 5-tab workbook structure
 *  2. Pre-Import Analysis & Referential Integrity Validation (valid + error cases)
 *  3. Food Cost & Margin Simulation
 *  4. Atomic Commit (Create, Update, Soft-Archive, Recipe Revision)
 *  5. Dynamic Bar Consumption Mapping (new bar SKU without editing BAR_SKU_MAP)
 *  6. Non-blocking exception recording for recipe-missing items
 */

import assert from 'node:assert/strict';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { masterMenuWorkbookService } from '../businessos/platform/kitchen/masterMenuWorkbookService.js';
import { resolveBarConsumption } from '../businessos/platform/bar/barConsumptionMapping.js';
import { inventoryConsumptionService } from '../businessos/platform/inventory/inventoryConsumptionService.js';

const TENANT_ID = 'tenant_test_workbook';

function setupSeedData() {
  // 1. Seed Master Inventory
  offlineStore.setCollection('inventory', [
    { id: 'inv-1', itemCode: 'RM0001', itemName: 'Chicken Boneless', itemType: 'Raw Material', baseUom: 'KG', lastPurchasePrice: 320, standardYieldPercent: 100, tenantId: TENANT_ID },
    { id: 'inv-2', itemCode: 'RM0002', itemName: 'Coconut Milk', itemType: 'Raw Material', baseUom: 'LTR', lastPurchasePrice: 180, standardYieldPercent: 100, tenantId: TENANT_ID },
    { id: 'inv-3', itemCode: 'BAR0099', itemName: 'Monkey Shoulder Whisky', itemType: 'Finished Good', baseUom: 'LTR', lastPurchasePrice: 4200, standardYieldPercent: 100, tenantId: TENANT_ID }
  ], TENANT_ID);

  // 2. Seed Existing Menu Items (1 to update, 1 to archive)
  offlineStore.setCollection('kitchen_menu_items', [
    {
      id: 'menu-so-1',
      itemCode: 'MENU-SOU-001',
      itemName: 'Kokum Soup',
      category: 'SOUPS',
      sellingPrice: 200,
      routing: 'KITCHEN_LINE',
      lifecycleStatus: 'ACTIVE',
      tenantId: TENANT_ID
    },
    {
      id: 'menu-old-1',
      itemCode: 'MENU-OLD-999',
      itemName: 'Discontinued Dish',
      category: 'STARTERS',
      sellingPrice: 150,
      routing: 'KITCHEN_LINE',
      lifecycleStatus: 'ACTIVE',
      tenantId: TENANT_ID
    }
  ], TENANT_ID);

  // 3. Seed Existing Recipe for MENU-SOU-001
  offlineStore.setCollection('recipes', [
    {
      id: 'rcp-sou-1',
      recipeCode: 'RCP-MENU-SOU-001',
      recipeName: 'Kokum Soup Base',
      menuItemId: 'menu-so-1',
      menuItemCode: 'MENU-SOU-001',
      version: 'v1.0',
      status: 'APPROVED',
      portionCount: 1,
      ingredients: [
        { inventoryItemCode: 'RM0002', inventoryItemName: 'Coconut Milk', recipeQty: 150, recipeUom: 'ML', quantity: 0.15, baseUom: 'LTR', unitCost: 180 }
      ],
      tenantId: TENANT_ID
    }
  ], TENANT_ID);

  offlineStore.setCollection('menu_categories', [], TENANT_ID);
  offlineStore.setCollection('inventory_consumption_exceptions', [], TENANT_ID);
}

async function runTests() {
  console.log('🧪 Running Master Menu & Recipe Workbook Lifecycle Tests...');
  setupSeedData();

  // TEST 1: Export Live Data
  const exported = masterMenuWorkbookService.generateWorkbookData(TENANT_ID);
  assert.ok(exported.categories.length >= 2, 'Should export categories');
  assert.equal(exported.foodMenu.length, 2, 'Should export 2 food items');
  assert.equal(exported.recipesBom.length, 1, 'Should export 1 recipe BOM line');
  assert.equal(exported.inventoryRef.length, 3, 'Should export 3 master inventory items');
  console.log('  ✅ PASS: Live 5-tab workbook data generation');

  // TEST 2: Validation Error Detection (Bad Ingredient SKU & Incompatible UOM)
  const invalidSheets = {
    categories: [{ 'Category Code': 'CAT-SOU', 'Category Name': 'SOUPS', 'Production Station': 'KITCHEN' }],
    foodMenu: [{ 'Item Code': 'MENU-SOU-001', 'Item Name': 'Kokum Soup', 'Category Code': 'CAT-SOU', 'Selling Price': 240 }],
    barMenu: [],
    recipesBom: [
      { 'Menu Item Code': 'MENU-SOU-001', 'Ingredient Item Code': 'RM9999_BAD', 'Recipe Quantity': 100, 'Recipe UOM': 'G' },
      { 'Menu Item Code': 'MENU-SOU-001', 'Ingredient Item Code': 'RM0001', 'Recipe Quantity': 100, 'Recipe UOM': 'LTR' } // Incompatible: LTR vs KG
    ]
  };
  const badAnalysis = await masterMenuWorkbookService.analyzeWorkbook(invalidSheets, TENANT_ID);
  assert.equal(badAnalysis.valid, false, 'Invalid workbook should fail validation');
  assert.equal(badAnalysis.validation.errors.length, 2, 'Should catch 2 blocking errors (missing SKU + incompatible UOM)');
  console.log('  ✅ PASS: Pre-Import referential integrity & UOM error detection');

  // TEST 3: Valid Pre-Import Analysis (Create, Update, Soft-Archive, Dynamic Bar SKU, Unrecipied Dish)
  const validSheets = {
    categories: [
      { 'Category Code': 'CAT-SOU', 'Category Name': 'SOUPS', 'Production Station': 'KITCHEN', 'Display Order': 10 },
      { 'Category Code': 'CAT-CHK', 'Category Name': 'CHICKEN', 'Production Station': 'KITCHEN', 'Display Order': 20 },
      { 'Category Code': 'CAT-WKY', 'Category Name': 'BLENDED SCOTCH WHISKY', 'Production Station': 'BAR', 'Display Order': 30 }
    ],
    foodMenu: [
      { 'Item Code': 'MENU-SOU-001', 'Item Name': 'Kokum Soup', 'Category Code': 'CAT-SOU', 'Selling Price': 250 }, // Updated price
      { 'Item Code': 'MENU-CHK-002', 'Item Name': 'Pepper Chicken', 'Category Code': 'CAT-CHK', 'Selling Price': 380 }, // New with recipe
      { 'Item Code': 'MENU-NEW-003', 'Item Name': 'Chef Special Salad', 'Category Code': 'CAT-CHK', 'Selling Price': 220 } // New WITHOUT recipe
    ],
    barMenu: [
      {
        'Item Code': 'RC-BAR-201',
        'Item Name': 'Monkey Shoulder',
        'Category Code': 'CAT-WKY',
        'Consumption Mode': 'DIRECT_POUR',
        'Linked Inventory SKU': 'BAR0099', // Dynamic SKU not in BAR_SKU_MAP!
        'Default Serving Size': 60,
        'Default Serving UOM': 'ML',
        'Variants & Peg Pricing': '30 ml:400, 60 ml:750',
        'Base Selling Price': 400
      }
    ],
    recipesBom: [
      { 'Menu Item Code': 'MENU-SOU-001', 'Recipe Code': 'RCP-SOU-1', 'Ingredient Item Code': 'RM0002', 'Recipe Quantity': 200, 'Recipe UOM': 'ML', 'Prep Wastage %': 0 },
      { 'Menu Item Code': 'MENU-CHK-002', 'Recipe Code': 'RCP-CHK-2', 'Ingredient Item Code': 'RM0001', 'Recipe Quantity': 250, 'Recipe UOM': 'G', 'Prep Wastage %': 10 }
    ]
  };

  const analysis = await masterMenuWorkbookService.analyzeWorkbook(validSheets, TENANT_ID);
  assert.equal(analysis.valid, true, `Valid workbook should pass. Errors: ${analysis.validation.errors.join('; ')}`);
  assert.equal(analysis.diff.toCreateCount, 3, 'Should detect 3 new items (2 food + 1 bar)');
  assert.equal(analysis.diff.toUpdateCount, 1, 'Should detect 1 updated item (MENU-SOU-001)');
  assert.equal(analysis.diff.toArchiveCount, 1, 'Should detect 1 omitted item to archive (MENU-OLD-999)');
  assert.equal(analysis.kpis.foodMissing, 1, 'Should detect 1 food dish missing recipe (MENU-NEW-003)');
  console.log('  ✅ PASS: Pre-Import Diff, Coverage & Costing Analysis');

  // TEST 4: Atomic Commit
  const commitRes = await masterMenuWorkbookService.commitImport(analysis, TENANT_ID);
  assert.equal(commitRes.success, true, 'Commit should succeed');

  const storedMenu = offlineStore.getCollection('kitchen_menu_items', TENANT_ID);
  const archivedDish = storedMenu.find(i => i.itemCode === 'MENU-OLD-999');
  assert.equal(archivedDish.lifecycleStatus, 'ARCHIVED', 'Omitted dish must be soft-archived, never hard-deleted');

  const updatedSoup = storedMenu.find(i => i.itemCode === 'MENU-SOU-001');
  assert.equal(updatedSoup.sellingPrice, 250, 'Updated price must persist');

  const storedRecipes = offlineStore.getCollection('recipes', TENANT_ID);
  const soupRecipe = storedRecipes.find(r => r.menuItemCode === 'MENU-SOU-001');
  assert.equal(soupRecipe.version, 'v1.1', 'Modified recipe must bump revision to v1.1');

  const barDrink = storedMenu.find(i => i.itemCode === 'RC-BAR-201');
  assert.equal(barDrink.linkedInventorySku, 'BAR0099', 'Dynamic Bar SKU must persist');
  console.log('  ✅ PASS: Atomic Commit (Insert, Update, Soft-Archive, Recipe Revision)');

  // TEST 5: Dynamic Bar Consumption (without BAR_SKU_MAP)
  const invMaster = offlineStore.getCollection('inventory', TENANT_ID);
  const barRes = resolveBarConsumption(barDrink, { name: '60 ml', variantName: '60 ml' }, { orderQty: 2, inventoryMaster: invMaster });
  assert.equal(barRes.success, true, 'Dynamic Bar SKU must resolve without code edit');
  assert.equal(barRes.inventoryItemCode, 'BAR0099');
  assert.equal(barRes.totalDeduction, 0.12, '2 x 60ml = 0.12 LTR');
  console.log('  ✅ PASS: Dynamic Bar Consumption Resolution (0.12 LTR from BAR0099)');

  // TEST 6: Non-Blocking Sale for Recipe-Missing Dish + Exception Logging
  const missingRecipeDish = storedMenu.find(i => i.itemCode === 'MENU-NEW-003');
  const consRes = await inventoryConsumptionService.consumeForOrderLine({
    tenantId: TENANT_ID,
    orderId: 'ord-test-1',
    orderLineId: 'line-test-1',
    item: {
      itemId: missingRecipeDish.id,
      itemCode: missingRecipeDish.itemCode,
      name: missingRecipeDish.itemName,
      quantity: 1
    }
  });
  assert.equal(consRes.skipped, true, 'Consumption should be skipped without throwing');
  assert.equal(consRes.reason, 'NO_BOM_CONFIGURED');

  const exceptions = offlineStore.getCollection('inventory_consumption_exceptions', TENANT_ID);
  assert.equal(exceptions.length, 1, 'Should record 1 exception for unrecipied dish');
  assert.equal(exceptions[0].itemCode, 'MENU-NEW-003');
  console.log('  ✅ PASS: Non-blocking sale & consumption exception logging');

  console.log('\n🎉 ALL MASTER MENU & RECIPE WORKBOOK TESTS PASSED!');
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});

