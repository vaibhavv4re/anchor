import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { InventoryConsumptionService } from '../businessos/platform/inventory/inventoryConsumptionService.js';
import { resolvedBomEngine } from '../businessos/platform/ordering/resolvedBomEngine.js';

console.log('========================================================================');
console.log('REPRODUCING FORENSIC ORDER ORD-2026-8595 TRACE');
console.log('========================================================================');

const tenantId = 'tenant_h0qc7wf';

// Setup exact data from live Supabase
offlineStore.setCollection('kitchen_menu_items', [
  {
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
  }
], tenantId);

offlineStore.setCollection('recipes', [
  {
    id: 'rcp-kcwoqo3',
    recipeCode: 'RCP-1427',
    recipe_code: 'RCP-1427',
    recipeName: 'Tropical Grove',
    status: 'PUBLISHED', // <--- NOTE: PUBLISHED in live Supabase!
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
  }
], tenantId);

offlineStore.setCollection('stock_balances', [
  {
    itemCode: 'BAR0027',
    locationCode: 'LOC-314',
    quantity: 10.0,
    unitCost: 1800
  },
  {
    itemCode: 'BAR0050',
    locationCode: 'LOC-314',
    quantity: 10.0,
    unitCost: 35
  }
], tenantId);

// Exact item from ORD-2026-8595
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

const service = new InventoryConsumptionService();

console.log('\n--- CALLING consumeForOrderLine ---');
const result = await service.consumeForOrderLine({
  tenantId,
  orderId: 'ord_han4ett',
  orderLineId: 'line_ord_han4ett_1',
  item: orderItem,
  occurredAt: '2026-09-14T15:53:14.884Z',
  performedBy: 'Bartender'
});

console.log('\nResult from service:', JSON.stringify(result, null, 2));

console.log('\n--- TESTING BOM ENGINE DIRECTLY ---');
const bomResult = resolvedBomEngine.resolveOrderLineBOM(orderItem, tenantId);
console.log('resolvedBomEngine result:', JSON.stringify(bomResult, null, 2));
