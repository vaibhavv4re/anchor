import { createApplication } from '../restaurantos/frontend/bootstrap.js';
import { menuMasterModel } from '../businessos/platform/ordering/menuMasterModel.js';
import { orderModel } from '../businessos/platform/ordering/orderModel.js';
import { sessionModel } from '../businessos/platform/session/sessionModel.js';
import { productionRoutingEngine } from '../businessos/platform/ordering/productionRoutingEngine.js';

console.log('====================================================================');
console.log('TEST SUITE: MENU ITEM SELECTION & ORDER DRAFT BUILDING');
console.log('====================================================================\n');

async function testMenuAddFlow() {
  let passed = 0;
  let total = 0;

  function assert(cond, name) {
    total++;
    if (cond) {
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name}`);
    }
  }

  const tenantId = 'tenant_h0qc7wf';

  // 1. Check Menu Items
  console.log('1. Menu Master Retrieval');
  const items = menuMasterModel.getAllMenuItems();
  assert(items.length >= 68, `Loaded ${items.length} menu items from catalog`);

  const firstItem = items[0];
  assert(!!firstItem.name, `First item has name: ${firstItem.name}`);
  assert(!!firstItem.price, `First item has price: ₹${firstItem.price}`);

  // 2. Test getItem by ID, code, name
  console.log('\n2. Flexible getItem Lookup');
  const byId = menuMasterModel.getItem(firstItem.id);
  assert(byId !== null && byId.name === firstItem.name, `Found item by ID: ${firstItem.id}`);

  if (firstItem.itemCode) {
    const byCode = menuMasterModel.getItem(firstItem.itemCode);
    assert(byCode !== null && byCode.name === firstItem.name, `Found item by itemCode: ${firstItem.itemCode}`);
  }

  const byName = menuMasterModel.getItem(firstItem.name);
  assert(byName !== null && byName.name === firstItem.name, `Found item by Name: ${firstItem.name}`);

  // 3. Simulate Guest Seating & Draft Building
  console.log('\n3. Simulate Guest Seating & Draft Order Building');
  const session = sessionModel.createSession({
    tableNumber: 4,
    guestCount: 3,
    assignedWaiterId: 'emp-suresh',
    tenantId
  });

  const draftItems = [];

  function addItemToDraft(item) {
    const existing = draftItems.find(i => i.itemId === item.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      draftItems.push({
        itemId: item.id,
        name: item.name || item.itemName,
        price: item.price || item.sellingPrice,
        quantity: 1,
        selectedModifiers: item.modifiers ? [item.modifiers[0]] : []
      });
    }
  }

  // Add 2 distinct items
  addItemToDraft(items[0]);
  addItemToDraft(items[1]);
  addItemToDraft(items[0]); // Increment quantity of first item

  assert(draftItems.length === 2, 'Draft contains 2 distinct line items');
  assert(draftItems[0].quantity === 2, `${draftItems[0].name} quantity is 2`);
  assert(draftItems[1].quantity === 1, `${draftItems[1].name} quantity is 1`);

  const subtotal = draftItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  assert(subtotal > 0, `Calculated draft subtotal: ₹${subtotal}`);

  // 4. Confirm and Dispatch Order
  console.log('\n4. Confirm and Dispatch Order');
  const createdOrder = orderModel.createOrder({
    sessionId: session.id,
    tableNumber: 4,
    tableCode: 'T-04',
    waiterId: 'emp-suresh',
    tenantId,
    items: draftItems,
    subtotal
  });

  assert(createdOrder.orderStatus === 'CONFIRMED', 'Order status is CONFIRMED');
  assert(createdOrder.items.length === 2, 'Order has 2 items');

  const tickets = productionRoutingEngine.routeOrderToProduction(createdOrder);
  assert(tickets.length >= 1, `Generated ${tickets.length} production ticket(s)`);

  console.log('\n====================================================================');
  console.log(`RESULTS: ${passed}/${total} TESTS PASSED`);
  console.log('====================================================================');
}

testMenuAddFlow();
