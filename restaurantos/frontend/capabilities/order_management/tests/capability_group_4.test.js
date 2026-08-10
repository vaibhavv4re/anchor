/**
 * Capability Group 4 - Operational Acceptance Test Suite (Order Management & Production Routing)
 * Tests menu search, order building, confirmation workflow, and Automatic Production Routing (PD-010).
 */

import { menuMasterModel } from '../../../../businessos/platform/ordering/menuMasterModel.js';
import { orderModel } from '../../../../businessos/platform/ordering/orderModel.js';
import { productionRoutingEngine } from '../../../../businessos/platform/ordering/productionRoutingEngine.js';
import { timelineLedger } from '../../../../businessos/platform/timeline/timelineLedger.js';

export async function runCapabilityGroup4TestSuite() {
  const results = [];

  const assert = (condition, scenarioName) => {
    if (condition) {
      results.push({ scenarioName, status: 'PASS' });
      console.log(`✅ [GROUP 4 PASS] ${scenarioName}`);
    } else {
      results.push({ scenarioName, status: 'FAIL' });
      console.error(`❌ [GROUP 4 FAIL] ${scenarioName}`);
    }
  };

  console.log('🧪 Executing Group 4 Operational Acceptance Tests (Order & Production Routing)...\n');

  // Step 1: Fast Menu Search (< 5s search requirement)
  const startTime = performance.now();
  const searchResults = menuMasterModel.searchItems('Butter');
  const searchDuration = performance.now() - startTime;

  assert(searchResults.length > 0 && searchResults[0].name === 'Butter Chicken', 'Scenario 4.1a: Search query "Butter" returns Butter Chicken');
  assert(searchDuration < 50, `Scenario 4.1b: Menu search query filtered in ${searchDuration.toFixed(2)}ms (< 50ms requirement)`);

  // Step 2: Build Order Items with Modifiers
  const item1 = menuMasterModel.getItem('item-butter-chicken');
  const item2 = menuMasterModel.getItem('item-fresh-lime');

  const draftItems = [
    { itemId: item1.id, name: item1.name, price: item1.price, quantity: 1, selectedModifiers: ['Spicy: Medium', 'Extra Gravy'] },
    { itemId: item2.id, name: item2.name, price: item2.price, quantity: 2, selectedModifiers: ['Sweet'] }
  ];
  const calculatedSubtotal = (item1.price * 1) + (item2.price * 2);
  assert(calculatedSubtotal === 660, 'Scenario 4.2: Draft Order subtotal calculated correctly (₹420 + 2x ₹120 = ₹660)');

  // Step 3: Order Confirmation Workflow (Build -> Review -> Confirm)
  const confirmedOrder = orderModel.createOrder({
    sessionId: 'sess_test_grp4',
    tableNumber: 4,
    waiterId: 'emp-rahul',
    items: draftItems,
    subtotal: calculatedSubtotal
  });
  assert(confirmedOrder && confirmedOrder.orderStatus === 'CONFIRMED' && confirmedOrder.correlationId, 'Scenario 4.3: Order confirmed and assigned CID');

  // Step 4: Automatic Production Routing (PD-010 Verification)
  const tickets = productionRoutingEngine.routeOrderToProduction(confirmedOrder.orderId);
  const kotTicket = tickets.find(t => t.ticketType === 'KOT');
  const botTicket = tickets.find(t => t.ticketType === 'BOT');

  assert(tickets.length === 2, 'Scenario 4.4a: Order automatically split into 2 production tickets (KOT + BOT)');
  assert(kotTicket && kotTicket.destination === 'KITCHEN' && kotTicket.items.some(i => i.name === 'Butter Chicken'), 'Scenario 4.4b: Food item (Butter Chicken) automatically routed to Kitchen KOT');
  assert(botTicket && botTicket.destination === 'BAR' && botTicket.items.some(i => i.name === 'Fresh Lime Soda'), 'Scenario 4.4c: Drink item (Fresh Lime Soda) automatically routed to Bar BOT');

  // Step 5: Timeline Ledger Log Verification
  const entries = timelineLedger.getTimelineEntries(20);
  assert(entries.some(e => e.type === 'order:confirmed' || e.summary.includes('order:confirmed')), 'Scenario 4.5: Platform Timeline Ledger logs order confirmation and ticket routing');

  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  console.log(`\n🎉 Capability Group 4 Test Suite Finished: ${passed}/${total} Scenarios Passed.`);

  return { total, passed, results };
}
