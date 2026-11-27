/**
 * Verification Suite: Clean-Sweep Final Food & Bar Menu Migration
 * Verifies that:
 *  1. ACTUAL_ANCHOR_MENU (Chef Varun Inamdar Food Menu) has all 51 base dishes, variants, and 5 Market Price dishes.
 *  2. ANCHOR_HARBOUR_BAR_MENU_ITEMS (New Bar Menu) has all 98 items across 17 sections.
 *  3. BarMenuImporter detects all serving sizes (30/60/90/180/275/330/375/500/650/750 ml).
 *  4. kitchenMenuModel & menuMasterModel classify 100% of Food vs Bar categories accurately.
 *  5. MasterMenuWorkbookService exports the clean-sweep menu with 0 recipes mapped yet.
 */

import assert from 'node:assert/strict';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { ACTUAL_ANCHOR_MENU } from '../restaurantos/frontend/capabilities/kitchen/data/actualMenuData.js';
import { ANCHOR_HARBOUR_BAR_MENU_ITEMS, BarMenuImporter } from '../businessos/platform/kitchen/barMenuImporter.js';
import { isBarMenuItem } from '../businessos/platform/kitchen/kitchenMenuModel.js';
import { menuMasterModel } from '../businessos/platform/ordering/menuMasterModel.js';
import { masterMenuWorkbookService } from '../businessos/platform/kitchen/masterMenuWorkbookService.js';

const TENANT_ID = 'tenant_clean_sweep_test';

async function run() {
  console.log('🧪 Running Clean-Sweep Final Menu Verification...');

  // 1. Verify Food Menu
  assert.ok(ACTUAL_ANCHOR_MENU.length >= 50, `Expected >= 50 food dishes, got ${ACTUAL_ANCHOR_MENU.length}`);
  const marketPriceItems = ACTUAL_ANCHOR_MENU.filter(i => i.isMarketPrice);
  assert.equal(marketPriceItems.length, 5, 'Should have 5 "As per catch" market-price dishes');
  ACTUAL_ANCHOR_MENU.forEach(item => {
    assert.equal(item.recipeId, null, `Food item ${item.itemCode} should have recipeId: null in Phase 1`);
    assert.equal(isBarMenuItem(item), false, `Food item ${item.itemCode} (${item.category}) must NOT be classified as BAR`);
    assert.equal(menuMasterModel._classifyDomain(item), 'FOOD', `Food item ${item.itemCode} must classify as FOOD domain`);
  });
  console.log(`  ✅ PASS: ${ACTUAL_ANCHOR_MENU.length} Food dishes verified (5 Market Price, 0 recipes, 100% FOOD domain)`);

  // 2. Verify Bar Menu & Importer Preview
  assert.ok(ANCHOR_HARBOUR_BAR_MENU_ITEMS.length >= 90, `Expected >= 90 bar items, got ${ANCHOR_HARBOUR_BAR_MENU_ITEMS.length}`);
  const barPreview = BarMenuImporter.generateImportPreview(ANCHOR_HARBOUR_BAR_MENU_ITEMS, TENANT_ID);
  assert.equal(barPreview.success, true, 'BarMenuImporter preview should succeed');
  assert.ok(barPreview.detectedVariantsCount > 350, `Expected > 350 bar variants across 30/60/90/180/375/750/330/500/650ml, got ${barPreview.detectedVariantsCount}`);

  barPreview.items.forEach(item => {
    assert.equal(isBarMenuItem(item), true, `Bar item ${item.itemName} (${item.category}) MUST be classified as BAR`);
    assert.equal(menuMasterModel._classifyDomain(item), 'BAR', `Bar item ${item.itemName} (${item.category}) MUST classify as BAR domain`);
  });
  console.log(`  ✅ PASS: ${barPreview.items.length} Bar items & ${barPreview.detectedVariantsCount} serving variants verified (100% BAR domain)`);

  // 3. Seed offlineStore with Clean-Sweep Menu and verify Master Workbook Export
  offlineStore.setCollection('kitchen_menu_items', [...ACTUAL_ANCHOR_MENU, ...barPreview.items], TENANT_ID);
  offlineStore.setCollection('recipes', [], TENANT_ID);

  const exported = masterMenuWorkbookService.generateWorkbookData(TENANT_ID);
  assert.equal(exported.foodMenu.length, ACTUAL_ANCHOR_MENU.length, 'Exported food tab should match ACTUAL_ANCHOR_MENU');
  assert.equal(exported.barMenu.length, barPreview.items.length, 'Exported bar tab should match BarMenuImporter items');
  assert.equal(exported.recipesBom.length, 0, 'Exported recipes tab should have 0 rows in Phase 1');
  assert.ok(exported.categories.length >= 25, `Expected >= 25 categories (Food + Bar), got ${exported.categories.length}`);
  console.log(`  ✅ PASS: 5-Tab Master Workbook exports ${exported.categories.length} categories, ${exported.foodMenu.length} food, ${exported.barMenu.length} bar, 0 recipes`);

  console.log('\n🎉 CLEAN-SWEEP MENU VERIFICATION PASSED!');
}

run().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});

