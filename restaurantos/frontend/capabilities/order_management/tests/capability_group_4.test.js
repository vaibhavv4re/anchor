/**
 * Capability Group 4 - Operational Acceptance Test Suite (Order Management & Production Routing)
 * Tests menu search, order building, confirmation workflow, and Automatic Production Routing (PD-010).
 */

import { menuMasterModel } from '../../../../../businessos/platform/ordering/menuMasterModel.js';
import { orderModel } from '../../../../../businessos/platform/ordering/orderModel.js';
import { productionRoutingEngine } from '../../../../../businessos/platform/ordering/productionRoutingEngine.js';
import { timelineLedger } from '../../../../../businessos/platform/timeline/timelineLedger.js';

export async function runCapabilityGroup4TestSuite() {
  const results = [];

  const assert = (condition, scenarioName) => {
    if (condition) {
      results.push({ scenarioName, status: 'PASS' });
    } else {
      results.push({ scenarioName, status: 'FAIL' });
    }
  };

  // Scenario 1: Search Menu Items & Pre-seeded Categories
  const menuItems = menuMasterModel.getAllItems();
  assert(menuItems.length > 0, 'Scenario 1: Pre-seeded Menu Master Items Available');

  // Scenario 2: Create Order Draft with Kitchen & Bar Items
  const newOrder = orderModel.createOrder({
    tableId: 'tbl_101',
    tableNumber: 'T-101',
    sessionId: 'sess_1001',
    serverName: 'Alex'
  });

  orderModel.addItemToOrder(newOrder.id, {
    menuItemId: 'menu_001',
    name: 'Truffle Mushroom Burger',
    price: 18.50,
    quantity: 2,
    routingTarget: 'KITCHEN',
    modifiers: ['No Onions']
  });

  orderModel.addItemToOrder(newOrder.id, {
    menuItemId: 'menu_005',
    name: 'Signature Mojito',
    price: 12.00,
    quantity: 2,
    routingTarget: 'BAR',
    modifiers: ['Extra Mint']
  });

  const updatedOrder = orderModel.getOrderById(newOrder.id);
  assert(updatedOrder && updatedOrder.items.length === 2, 'Scenario 2: Order Draft Created with Multi-Station Items');

  // Scenario 3: Order Confirmation State Transition
  const confirmedOrder = orderModel.confirmOrder(newOrder.id);
  assert(confirmedOrder && confirmedOrder.status === 'CONFIRMED', 'Scenario 3: Order Confirmed Successfully');

  // Scenario 4: Automatic Production Routing (Split into KOT and BOT tickets)
  const tickets = productionRoutingEngine.routeOrderToStations(confirmedOrder);
  const kotTicket = tickets.find(t => t.station === 'KITCHEN');
  const botTicket = tickets.find(t => t.station === 'BAR');

  const routingSuccess = kotTicket && botTicket &&
    kotTicket.ticketType === 'KOT' && kotTicket.items.length === 1 &&
    botTicket.ticketType === 'BOT' && botTicket.items.length === 1;

  assert(routingSuccess, 'Scenario 4: Automatic Production Routing Splits KOT & BOT Tickets');

  // Scenario 5: Production Ticket Status Lifecycle (SENT -> IN_PREPARATION -> READY)
  const prepResult = productionRoutingEngine.updateTicketStatus(kotTicket.id, 'IN_PREPARATION');
  const readyResult = productionRoutingEngine.updateTicketStatus(kotTicket.id, 'READY');

  assert(prepResult && readyResult && readyResult.status === 'READY', 'Scenario 5: Production Ticket Status Lifecycle Completed');

  // Scenario 6: Timeline Audit Recording for Order & KOT Routing
  const events = timelineLedger.getEvents({ aggregateId: confirmedOrder.id });
  assert(events.length >= 2, 'Scenario 6: Timeline Audit Trail Recorded Order Confirmation & KOT Dispatch');

  const passed = results.filter(r => r.status === 'PASS').length;
  return { total: results.length, passed, results };
}
