import { orderModel } from '../businessos/platform/ordering/orderModel.js';
import { sessionModel } from '../businessos/platform/session/sessionModel.js';
import { productionRoutingEngine } from '../businessos/platform/ordering/productionRoutingEngine.js';
import { sessionProjectionService } from '../businessos/platform/session/sessionProjectionService.js';

console.log('====================================================================');
console.log('TEST SUITE: KOT/BOT ITEM-LEVEL LIFECYCLE & WAITER REAL-TIME SYNC');
console.log('====================================================================\n');

async function runTest() {
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

  // 1. Create a table session
  console.log('1. Create Table Session');
  const session = sessionModel.createSession({
    tableNumber: 4,
    guestCount: 3,
    assignedWaiterId: 'emp-suresh',
    tenantId
  });
  assert(session && session.id, `Created Session ${session.id} for Table 04`);

  // 2. Create Confirmed Order with 3 distinct items
  console.log('\n2. Create Confirmed Order with 3 Items');
  const items = [
    { itemId: 'menu-item-nke2qr6', name: 'Green Chicken Soup', price: 320, quantity: 1, routing: 'KITCHEN_LINE' },
    { itemId: 'menu-item-ja7jlbd', name: 'Pepper Mutton Soup', price: 360, quantity: 2, routing: 'KITCHEN_LINE' },
    { itemId: 'menu-item-i1g8fjy', name: 'Coastal Karnataka Lentil Soup', price: 280, quantity: 1, routing: 'KITCHEN_LINE' }
  ];

  const order = orderModel.createOrder({
    sessionId: session.id,
    tableNumber: 4,
    tableCode: 'T-04',
    waiterId: 'emp-suresh',
    tenantId,
    items,
    subtotal: 1320
  });

  assert(order.orderStatus === 'CONFIRMED', 'Order created in CONFIRMED state');

  // 3. Route to Production Tickets
  console.log('\n3. Route to Production (KOT Generation)');
  const tickets = productionRoutingEngine.routeOrderToProduction(order.id, tenantId);
  assert(tickets.length >= 1, `Generated ${tickets.length} KOT Ticket(s)`);

  const kot = tickets[0];
  assert(kot.status === 'QUEUED', 'KOT initial status is QUEUED');
  assert(kot.items.length === 3, 'KOT contains 3 items');
  assert(kot.items.every(i => i.itemStatus === 'QUEUED'), 'All 3 items are initially QUEUED');

  // 4. Chef marks Item 1 as PREPARING
  console.log('\n4. Chef marks Item 1 (Green Chicken Soup) as PREPARING');
  const res1 = productionRoutingEngine.updateTicketItemStatus(kot.ticketId, kot.items[0].lineItemId, 'PREPARING', tenantId);
  assert(res1.item.itemStatus === 'PREPARING', 'Item 1 itemStatus is PREPARING');
  assert(res1.ticket.status === 'PREPARING', 'Ticket overall status became PREPARING');

  let proj = sessionProjectionService.getSessionProjection(session.id, tenantId);
  assert(proj.preparingItems.length === 1, 'Waiter projection shows 1 item PREPARING');
  assert(proj.readyItems.length === 0, 'Waiter projection shows 0 items READY');
  assert(proj.queuedItems.length === 2, 'Waiter projection shows 2 items QUEUED');

  // 5. Chef marks Item 1 as READY (Items 2 and 3 remain QUEUED)
  console.log('\n5. Chef marks Item 1 as READY (Partial KOT Readiness)');
  const res2 = productionRoutingEngine.updateTicketItemStatus(kot.ticketId, kot.items[0].lineItemId, 'READY', tenantId);
  assert(res2.item.itemStatus === 'READY', 'Item 1 itemStatus is READY');
  assert(res2.ticket.status === 'PREPARING', 'Ticket overall status is STILL PREPARING (not all items ready)');

  proj = sessionProjectionService.getSessionProjection(session.id, tenantId);
  assert(proj.readyItems.length === 1 && proj.readyItems[0].name === 'Green Chicken Soup', 'Waiter sees 1 READY item: Green Chicken Soup');

  // 6. Chef marks Items 2 and 3 as READY (All items now READY)
  console.log('\n6. Chef marks Items 2 and 3 as READY (Full KOT Readiness)');
  productionRoutingEngine.updateTicketItemStatus(kot.ticketId, kot.items[1].lineItemId, 'READY', tenantId);
  const res3 = productionRoutingEngine.updateTicketItemStatus(kot.ticketId, kot.items[2].lineItemId, 'READY', tenantId);
  
  assert(res3.ticket.status === 'READY', 'KOT ticket overall status automatically transitioned to READY');

  proj = sessionProjectionService.getSessionProjection(session.id, tenantId);
  assert(proj.readyItems.length === 3, 'Waiter projection shows ALL 3 items READY for table service');

  // 7. Waiter serves Item 1 to Table
  console.log('\n7. Waiter marks Item 1 as SERVED');
  const res4 = productionRoutingEngine.updateTicketItemStatus(kot.ticketId, kot.items[0].lineItemId, 'SERVED', tenantId);
  assert(res4.item.itemStatus === 'SERVED', 'Item 1 is SERVED');
  assert(res4.ticket.status === 'READY', 'Ticket status remains READY (items 2 & 3 still ready to serve)');

  // 8. Waiter serves Items 2 and 3 to Table
  console.log('\n8. Waiter marks Items 2 and 3 as SERVED');
  productionRoutingEngine.updateTicketItemStatus(kot.ticketId, kot.items[1].lineItemId, 'SERVED', tenantId);
  const res5 = productionRoutingEngine.updateTicketItemStatus(kot.ticketId, kot.items[2].lineItemId, 'SERVED', tenantId);
  assert(res5.ticket.status === 'SERVED', 'KOT ticket automatically transitioned to SERVED when all items delivered');

  console.log('\n====================================================================');
  console.log(`RESULTS: ${passed}/${total} TESTS PASSED`);
  console.log('====================================================================');
}

runTest();
