/**
 * Scratch test script for K-03 Pilot — M0206 Smoked Damao Paneer
 */
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { kitchenMenuModel } from '../businessos/platform/kitchen/kitchenMenuModel.js';
import { recipeModel } from '../businessos/platform/kitchen/recipeModel.js';

console.log('🧪 Starting K-03 Pilot Verification Test...');

// 1. Seed Menu Item M0206 if not present
const menuItem = kitchenMenuModel.saveItem({
  itemCode: 'M0206',
  itemName: 'Smoked Damao Paneer',
  category: 'STARTERS - FROM THE SEA & EARTH',
  sellingPrice: 380,
  portionSize: '1 Portion',
  dietaryType: 'VEG'
});
console.log('✅ Menu Item Seeded:', menuItem.itemCode, menuItem.itemName, `₹${menuItem.sellingPrice}`);

// 2. Ensure Master Inventory items exist
const invList = offlineStore.getCollection('inventory') || [];
const seedInv = [
  { itemCode: 'RM0301', itemName: 'Fresh Paneer (Malai)', itemType: 'Raw Material', lastPurchasePrice: 380, baseUom: 'KG', standardYieldPercent: 100 },
  { itemCode: 'SF0001', itemName: 'Signature Damao Masala Paste', itemType: 'Semi Finished', lastPurchasePrice: 350, baseUom: 'KG', standardYieldPercent: 95 },
  { itemCode: 'RM0410', itemName: 'Pressed Mustard Oil & Coconut Oil', itemType: 'Raw Material', lastPurchasePrice: 190, baseUom: 'LTR', standardYieldPercent: 100 },
  { itemCode: 'SF0002', itemName: 'Goan Recheado Red Spice Paste', itemType: 'Semi Finished', lastPurchasePrice: 380, baseUom: 'KG', standardYieldPercent: 95 }
];

seedInv.forEach(item => {
  if (!invList.find(i => i.itemCode === item.itemCode)) {
    invList.push(item);
  }
});
offlineStore.setCollection('inventory', invList);
console.log('✅ Master Inventory Seeded with 4 Raw & Semi-Finished Items');

// 3. Create DRAFT Recipe for M0206
const recipe = recipeModel.createRecipe({
  recipeCode: 'RCP-M0206',
  recipeName: 'Smoked Damao Paneer v1.0',
  menuItemId: menuItem.id,
  menuItemCode: menuItem.itemCode,
  yieldQuantity: 1,
  yieldUom: 'PORTION',
  portionCount: 1,
  prepTimeMinutes: 15,
  cookTimeMinutes: 10,
  instructions: '1. Marinate Paneer with Damao Masala and Recheado Paste.\n2. Sear on hot tawa with Coconut Oil.\n3. Smoke with ghee cloves under cloche.',
  ingredients: [
    { inventoryItemCode: 'RM0301', quantity: 0.200, recipeWastagePercent: 0 },
    { inventoryItemCode: 'SF0001', quantity: 0.030, recipeWastagePercent: 0 },
    { inventoryItemCode: 'RM0410', quantity: 0.010, recipeWastagePercent: 0 },
    { inventoryItemCode: 'SF0002', quantity: 0.025, recipeWastagePercent: 0 }
  ]
});
console.log('✅ Recipe Created:', recipe.recipeCode, recipe.version, recipe.status);

// 4. Calculate Live Costing
const costCalc = recipeModel.calculateCost(recipe);
console.log('💰 Calculated Total Cost:', `₹${costCalc.totalCost}`);
console.log('💰 Cost Per Portion:', `₹${costCalc.costPerPortion}`);
const foodCostPct = ((costCalc.costPerPortion / menuItem.sellingPrice) * 100).toFixed(1);
const grossMarginPct = (100 - parseFloat(foodCostPct)).toFixed(1);
console.log(`📊 Food Cost %: ${foodCostPct}% | Gross Margin %: ${grossMarginPct}%`);

// 5. Update Recipe with calculated values
recipeModel.updateRecipe(recipe.id, { ingredients: costCalc.lines });

// 6. Approve Recipe 🔒
const approvedRecipe = recipeModel.approveRecipe(recipe.id);
console.log('🔒 Recipe Approved & Locked:', approvedRecipe.status, 'Cost Snapshot Locked:', Boolean(approvedRecipe.costSnapshotAtApproval));

// 7. Verify Menu Linkage
const updatedMenu = kitchenMenuModel.getById(menuItem.id);
console.log('🔗 Menu Item Recipe Pointer Updated:', updatedMenu.recipeId === approvedRecipe.id ? 'SUCCESS' : 'FAILED');

// 8. Verify Lock Protection
try {
  recipeModel.updateRecipe(approvedRecipe.id, { recipeName: 'Hacked Name' });
  console.error('❌ Lock Protection Test Failed!');
} catch (e) {
  console.log('🛡️ Lock Protection Test Passed:', e.message);
}

// 9. Create Revision v1.1
const rev = recipeModel.createRevision(approvedRecipe.id);
console.log('✨ Revision Created:', rev.recipeCode, rev.version, rev.status);

console.log('🎉 K-03 Pilot Verification Test Completed Successfully!');
