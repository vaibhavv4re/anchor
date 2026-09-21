import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { InventoryConsumptionService } from '../businessos/platform/inventory/inventoryConsumptionService.js';
import { resolvedBomEngine } from '../businessos/platform/ordering/resolvedBomEngine.js';

console.log('========================================================================');
console.log('TESTING FIX ON FORENSIC SPECIMEN');
console.log('========================================================================');

const tenantId = 'tenant_h0qc7wf';

const menuItem = {
  id: 'menu-item-79sl4wx',
  itemCode: 'RC-BAR-154',
  item_code: 'RC-BAR-154',
  itemName: 'Tropical Grove',
  name: 'Tropical Grove',
  category: 'MOCKTAILS',
  recipeId: 'rcp-kcwoqo3',
  recipe_id: 'rcp-kcwoqo3',
  routing: 'BAR',
  productionArea: 'BAR',
  variants: [
    {
      id: 'var_tropical_grove_reg',
      name: 'Regular',
      sellingPrice: 260
    }
  ]
};

const recipe = {
  id: 'rcp-kcwoqo3',
  recipeCode: 'RCP-1427',
  recipe_code: 'RCP-1427',
  recipeName: 'Tropical Grove',
  status: 'PUBLISHED', // In Supabase, it is PUBLISHED!
  menuItemId: 'menu-item-79sl4wx',
  menu_item_id: 'menu-item-79sl4wx',
  menuItemCode: 'RC-BAR-154',
  ingredients: [
    {
      inventoryItemCode: 'BAR0050',
      inventoryItemName: 'Soda',
      quantity: 0.2,
      uom: 'KG'
    },
    {
      inventoryItemCode: 'BAR0027',
      inventoryItemName: 'Greater Than Londan Dry Gin',
      quantity: 0.6,
      uom: 'KG'
    }
  ]
};

offlineStore.setCollection('kitchen_menu_items', [menuItem], tenantId);
offlineStore.setCollection('recipes', [recipe], tenantId);

const orderItem = {
  name: 'Tropical Grove (Regular)',
  notes: '',
  price: 260,
  itemId: 'menu-item-79sl4wx',
  status: 'SERVED',
  routing: 'BAR',
  category: 'MOCKTAILS',
  itemCode: 'RC-BAR-154',
  itemName: 'Tropical Grove (Regular)',
  quantity: 2,
  recipeId: 'rcp-kcwoqo3',
  itemStatus: 'SERVED',
  lineItemId: 'line_ord_han4ett_1',
  selectedModifiers: []
};

// Check recipe matching logic:
const recipes = offlineStore.getCollection('recipes', tenantId) || [];
const targetRecipeId = orderItem.recipeId || menuItem.recipeId;
const targetItemId = orderItem.itemId || orderItem.itemCode || orderItem.id;
const itemCodeUpper = String(orderItem.itemCode || orderItem.itemId || '').toUpperCase().trim();

const matchedRecipe = recipes.find(r => 
  (r.status === 'APPROVED' || r.status === 'PUBLISHED') && (
    (targetRecipeId && (r.id === targetRecipeId || r.recipeId === targetRecipeId || r.recipeCode === targetRecipeId)) ||
    r.menuItemId === targetItemId ||
    r.menu_item_id === targetItemId ||
    r.menuItemCode === itemCodeUpper ||
    r.menu_item_code === itemCodeUpper
  )
);

console.log('Matched recipe with updated logic:', matchedRecipe ? `${matchedRecipe.id} (${matchedRecipe.status})` : 'NONE');

// Now test BOM extraction:
const rawIngredients = matchedRecipe.ingredients || matchedRecipe.data?.ingredients || [];
console.log('Raw ingredients count:', rawIngredients.length);
for (const ing of rawIngredients) {
  console.log(` - ${ing.inventoryItemCode}: ${ing.quantity} ${ing.uom}`);
}
