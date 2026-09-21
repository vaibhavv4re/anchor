import { BarWorkspaceView } from '../restaurantos/frontend/capabilities/bar/ui/BarWorkspaceView.js';
import { recipeModel } from '../businessos/platform/kitchen/recipeModel.js';
import { inventoryItemModel } from '../businessos/platform/inventory/inventoryItemModel.js';
import { barConsumptionModel } from '../businessos/platform/kitchen/barConsumptionModel.js';

console.log('🧪 Running Recipe Studio BOM Configuration Test...');

const items = inventoryItemModel.getAllItems();
console.log('📦 Master Inventory has ' + items.length + ' items');

const barView = new BarWorkspaceView();
barView.editingRecipeId = null;
barView.recipeEditingTarget = {
  menuItemId: 'item_cocktail_seaside',
  menuItemCode: 'RC-BAR-147',
  variantId: 'var_seaside_reg',
  variantName: 'Regular',
  itemName: 'Seaside Balcony - Savoury'
};

const html = barView.renderDedicatedRecipeEditorView();
if (!barView.currentRecipeEditorState) {
  throw new Error('currentRecipeEditorState was not initialized!');
}
console.log('✅ currentRecipeEditorState initialized cleanly:', barView.currentRecipeEditorState.recipeName);

const spirit = items.find(i => (i.category || '').includes('SPIRIT') || (i.itemCode || '').startsWith('BAR'));
const mixer = items.find(i => (i.category || '').includes('MIX') || (i.name || '').toLowerCase().includes('syrup') || (i.name || '').toLowerCase().includes('lime'));

console.log('🍸 Selecting spirit:', spirit.name, '(' + spirit.itemCode + ') @ ₹' + spirit.currentUnitCost);
console.log('🍋 Selecting mixer:', mixer.name, '(' + mixer.itemCode + ') @ ₹' + mixer.currentUnitCost);

barView.currentRecipeEditorState.ingredients.push({
  inventoryItemCode: spirit.itemCode,
  inventoryItemName: spirit.name,
  quantity: 45,
  uom: spirit.baseUnit || 'ML',
  unitCost: spirit.currentUnitCost || 1,
  lineCost: 45 * (spirit.currentUnitCost || 1)
});

barView.currentRecipeEditorState.ingredients.push({
  inventoryItemCode: mixer.itemCode,
  inventoryItemName: mixer.name,
  quantity: 30,
  uom: mixer.baseUnit || 'ML',
  unitCost: mixer.currentUnitCost || 0.5,
  lineCost: 30 * (mixer.currentUnitCost || 0.5)
});

const updatedHtml = barView.renderDedicatedRecipeEditorView();
if (!updatedHtml.includes(spirit.name) || !updatedHtml.includes(mixer.name)) {
  throw new Error('Rendered HTML did not include added ingredients!');
}
console.log('✅ Rendered editor HTML contains both ingredients in BOM table!');

recipeModel.validateIngredientsAgainstInventoryMaster(barView.currentRecipeEditorState.ingredients);
console.log('✅ Ingredients validated cleanly against inventory master!');

const newRecipe = recipeModel.createRecipe({
  recipeName: barView.currentRecipeEditorState.recipeName,
  menuItemId: barView.currentRecipeEditorState.menuItemId,
  variantId: barView.currentRecipeEditorState.variantId,
  variantName: barView.currentRecipeEditorState.variantName,
  glassware: barView.currentRecipeEditorState.glassware,
  instructions: barView.currentRecipeEditorState.instructions,
  productionArea: 'BAR',
  ingredients: barView.currentRecipeEditorState.ingredients
});
console.log('✅ Recipe created as DRAFT:', newRecipe.id, '(' + newRecipe.recipeCode + ')');

const publishedRecipe = recipeModel.publishRecipe(newRecipe.id, 'Sibu (Bartender)');
console.log('✅ Recipe published! Status:', publishedRecipe.status, 'Portion Cost: ₹' + publishedRecipe.costPerPortion);

const resolved = barConsumptionModel.resolveConsumption({
  menuItemId: barView.currentRecipeEditorState.menuItemId,
  variantId: barView.currentRecipeEditorState.variantId,
  locationId: 'LOC-314',
  sourceType: 'BOT',
  sourceId: 'BOT-TEST'
});

console.log('🍹 Resolved Consumption Lines:', resolved.resolvedLines.map(l => ({ name: l.inventoryItemName, code: l.inventoryItemCode, qty: l.quantity, uom: l.uom })));

if (resolved.resolvedLines.length !== 2) {
  throw new Error('Expected 2 resolved lines, got ' + resolved.resolvedLines.length);
}
if (resolved.consumptionType !== 'RECIPE') {
  throw new Error('Expected consumptionType RECIPE, got ' + resolved.consumptionType);
}

console.log('🎉 ALL RECIPE STUDIO BOM TESTS PASSED CLEANLY!');
