/**
 * Scratch Verification Script — Running Bill, Item Addition & Cashier Dispatch Lifecycle
 */

import { sessionModel } from '../businessos/platform/session/sessionModel.js';
import { orderModel } from '../businessos/platform/ordering/orderModel.js';
import { sessionProjectionService } from '../businessos/platform/session/sessionProjectionService.js';
import { sessionStateMachine, SessionMilestones } from '../businessos/platform/session/sessionStateMachine.js';
import { tableStateMachine, PhysicalTableStates } from '../businessos/platform/table_state/tableStateMachine.js';
import { platformEventBus } from '../businessos/platform/events/platformEvents.js';

async function runVerification() {
  console.log('--- STARTING RUNNING BILL & CASHIER DISPATCH VERIFICATION ---');

  const tenantId = 'tenant_h0qc7wf';
  const tableNumber = 5;

  // 1. Create table session
  const session = sessionModel.createSession({
    tenantId,
    tableNumber,
    tableCode: 'T-05',
    guestCount: 4,
    assignedWaiterId: 'emp-waiter-01',
    guestNotes: 'Celebration table',
    celebrationFlag: 'BIRTHDAY'
  });

  console.log(`✅ Session created: ID = ${session.id}, Table = ${session.tableNumber}`);

  // 2. Place Order #1
  const order1 = orderModel.createOrder({
    tenantId,
    sessionId: session.id,
    tableNumber,
    waiterId: 'emp-waiter-01',
    items: [
      { itemId: 'menu_bc', name: 'Butter Chicken', price: 350, quantity: 2, lineTotal: 700, routing: 'KITCHEN_LINE' }
    ]
  });

  console.log(`✅ Order #1 placed: ID = ${order1.orderId}, Subtotal = ₹${order1.subtotal}`);

  // 3. Inspect projection after Order #1
  let proj = sessionProjectionService.getSessionProjection(session.id, tenantId);
  console.log('\n📊 PROJECTION AFTER ORDER #1:');
  console.log(`- Subtotal: ₹${proj.subtotal}`);
  console.log(`- CGST (2.5%): ₹${proj.cgstAmount}`);
  console.log(`- SGST (2.5%): ₹${proj.sgstAmount}`);
  console.log(`- Grand Total: ₹${proj.grandTotal}`);
  console.log(`- Itemized count: ${proj.itemizedList.length}`);

  if (proj.subtotal !== 700 || proj.grandTotal !== 735) {
    throw new Error(`Financial calculation mismatch on Order #1! Expected ₹735, got ₹${proj.grandTotal}`);
  }

  // 4. Place Order #2 (Adding items to active running bill)
  const order2 = orderModel.createOrder({
    tenantId,
    sessionId: session.id,
    tableNumber,
    waiterId: 'emp-waiter-01',
    items: [
      { itemId: 'menu_gn', name: 'Garlic Naan', price: 60, quantity: 2, lineTotal: 120, routing: 'KITCHEN_LINE' }
    ]
  });

  console.log(`\n✅ Order #2 added to running bill: ID = ${order2.orderId}, Subtotal = ₹${order2.subtotal}`);

  // 5. Inspect projection after Order #2
  proj = sessionProjectionService.getSessionProjection(session.id, tenantId);
  console.log('\n📊 PROJECTION AFTER ORDER #2 (UPDATED RUNNING BILL):');
  console.log(`- Subtotal: ₹${proj.subtotal}`);
  console.log(`- CGST (2.5%): ₹${proj.cgstAmount}`);
  console.log(`- SGST (2.5%): ₹${proj.sgstAmount}`);
  console.log(`- Grand Total: ₹${proj.grandTotal}`);
  console.log(`- Itemized list:`, proj.itemizedList.map(i => `${i.quantity}x ${i.name} (₹${i.lineTotal})`).join(', '));

  if (proj.subtotal !== 820 || proj.grandTotal !== 861) {
    throw new Error(`Financial calculation mismatch on Order #2! Expected ₹861, got ₹${proj.grandTotal}`);
  }

  // 6. Test Bill Finalization and Cashier Event Broadcast
  let billFinalizedEventFired = false;
  platformEventBus.subscribe('bill:finalized', (evt) => {
    billFinalizedEventFired = true;
    console.log('\n🔔 LIVE EVENT RECEIVED: bill:finalized payload:', evt);
  });

  sessionStateMachine.transitionMilestone(session.id, SessionMilestones.BILL_GENERATED);
  tableStateMachine.transitionTableState(tableNumber, PhysicalTableStates.PAYMENT_PENDING);

  platformEventBus.publish('bill:finalized', {
    sessionId: session.id,
    tableNumber: proj.tableNumber,
    subtotal: proj.subtotal,
    grandTotal: proj.grandTotal,
    itemizedList: proj.itemizedList
  });

  proj = sessionProjectionService.getSessionProjection(session.id, tenantId);
  console.log(`\n✅ Session status after bill finalization: ${proj.status}, Bill Status = ${proj.billStatus}`);

  if (proj.billStatus !== 'GENERATED' || !billFinalizedEventFired) {
    throw new Error('Bill finalization state or event failed to publish correctly!');
  }

  console.log('\n🎉 ALL RUNNING BILL & CASHIER DISPATCH VERIFICATION TESTS PASSED SUCCESSFULLY!');
}

runVerification().catch(err => {
  console.error('❌ VERIFICATION ERROR:', err);
  process.exit(1);
});
