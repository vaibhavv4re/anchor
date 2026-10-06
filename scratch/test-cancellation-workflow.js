/**
 * Station-Controlled Cancellation + Disposition Workflow - Phase A certification.
 *
 * Node ESM harness (pattern of test-invoice-auto-split.js). Runs the real ordering
 * engine + the new cancellation/hold/policy models against the in-memory offlineStore.
 *
 * The certified inventoryConsumptionService is NOT exercised for real (no recipes/stock
 * here). Instead consumeForOrderLine / reverseConsumptionForOrderLine are stubbed to write
 * the SAME SALE_CONSUMPTION ledger shape the service posts
 * (operationId = cons_<tenant>_<order>_<line>, referenceId, referenceLineId, totalCost).
 * That lets the golden scenarios certify the *cancellation layer's* invariants:
 *   - cancel before READY  => zero consumption, zero reversal, no hold
 *   - cancel after READY   => SALE_CONSUMPTION stays (never reversed), hold carries it
 *   - reuse a HELD item    => NO second consumption (fulfilledByHoldId skip), waste 0
 *   - discard              => waste recognised on the record, NO new stock row
 */
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { orderModel } from '../businessos/platform/ordering/orderModel.js';
import { sessionModel } from '../businessos/platform/session/sessionModel.js';
import { productionRoutingEngine } from '../businessos/platform/ordering/productionRoutingEngine.js';
import { cancellationModel } from '../businessos/platform/ordering/cancellationModel.js';
import { preparedHoldModel } from '../businessos/platform/ordering/preparedHoldModel.js';
import { dispositionPolicyModel } from '../businessos/platform/ordering/dispositionPolicyModel.js';
import { inventoryConsumptionService } from '../businessos/platform/inventory/inventoryConsumptionService.js';

const TENANT = 'tenant_h0qc7wf';
const checks = [];
const check = (name, pass, extra) => checks.push([name, !!pass, extra]);

// ---- Consumption stubs -----------------------------------------------------
let consumeCalls = 0;
let reverseCalls = 0;
const UNIT_COST = 100;

inventoryConsumptionService.consumeForOrderLine = async ({ tenantId, orderId, orderLineId, item }) => {
  consumeCalls++;
  const qty = parseFloat((item && (item.quantity || item.qty)) || 1) || 1;
  offlineStore.appendItem('stock_transactions', {
    id: `stxn_${consumeCalls}_${Math.random().toString(36).substring(2, 7)}`,
    tenantId,
    transactionType: 'SALE_CONSUMPTION',
    operationId: `cons_${tenantId}_${orderId}_${orderLineId}`,
    referenceId: orderId,
    referenceLineId: orderLineId,
    itemCode: item && (item.itemCode || item.itemId),
    totalCost: -(qty * UNIT_COST), // posted as a negative cost movement
    createdAt: new Date().toISOString()
  });
  return { success: true, simulated: true };
};
inventoryConsumptionService.reverseConsumptionForOrderLine = async () => {
  reverseCalls++;
  return { success: true, simulated: true };
};

// ---- Helpers ---------------------------------------------------------------
const reset = () => {
  ['orders', 'tickets', 'cancellation_requests', 'prepared_item_holds', 'stock_transactions', 'disposition_policies']
    .forEach(c => offlineStore.setCollection(c, []));
  consumeCalls = 0;
  reverseCalls = 0;
};

const txnsForLine = (orderLineId) =>
  (offlineStore.getCollection('stock_transactions') || [])
    .filter(t => String(t.referenceLineId) === String(orderLineId) && String(t.transactionType) === 'SALE_CONSUMPTION');

const CHICKEN = { itemId: 'menu-chicken-tikka', itemCode: 'menu-chicken-tikka', name: 'Chicken Tikka', price: 400, category: 'STARTERS', routing: 'KITCHEN_LINE' };
const COCKTAIL = { itemId: 'menu-mojito', itemCode: 'menu-mojito', name: 'Virgin Mojito', price: 250, category: 'COCKTAILS', routing: 'BAR_LINE', productionArea: 'BAR' };

const CHEF = { role: 'chef', employeeId: 'emp-chef', name: 'Chef Anil' };
const BARTENDER = { role: 'bartender', employeeId: 'emp-bar', name: 'Barly' };
const MANAGER = { role: 'manager', employeeId: 'emp-mgr', name: 'Manager Priya' };
const WAITER = { role: 'waiter', employeeId: 'emp-w1', name: 'Ravi' };

/** Create a CONFIRMED order (createOrder auto-routes via order:confirmed) + ticket handles. */
const buildOrder = (items, tableNumber) => {
  const session = sessionModel.createSession({ tableNumber, guestCount: 2, assignedWaiterId: 'emp-w1', tenantId: TENANT });
  const order = orderModel.createOrder({
    sessionId: session.id, tableNumber, tableCode: `T-0${tableNumber}`, waiterId: 'emp-w1', tenantId: TENANT, items, subtotal: 0
  });
  // createOrder dispatches order:confirmed, which productionRoutingEngine auto-routes into
  // KOT/BOT. Do NOT route again here (that would create a duplicate ticket).
  const tickets = (offlineStore.getCollection('tickets') || [])
    .filter(t => t.orderId === (order.orderId || order.id));
  return { session, order, tickets };
};

/** Advance a single ticket line to a stage via the real engine. */
const advanceLine = (ticket, lineItemId, stage) =>
  productionRoutingEngine.updateTicketItemStatus(ticket.ticketId, lineItemId, stage, TENANT);

const lineOf = (orderId, needle) => (orderModel.getOrder(orderId, TENANT).items || [])
  .find(i => i.lineItemId === needle || i.itemId === needle);

const activeQty = (orderId) => (orderModel.getOrder(orderId, TENANT).items || [])
  .filter(i => !['CANCELLED', 'VOIDED'].includes(String(i.itemStatus || i.status).toUpperCase()))
  .reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);

const cancelledQty = (orderId) => (orderModel.getOrder(orderId, TENANT).items || [])
  .filter(i => ['CANCELLED', 'VOIDED'].includes(String(i.itemStatus || i.status).toUpperCase()))
  .reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);

const heldCount = () => preparedHoldModel.getHolds(TENANT).filter(h => h.status === 'HELD').length;

// ===========================================================================
console.log('=== G1  Reuse golden: prepared cancel -> HOLD -> reuse (no 2nd consumption) ===');
reset();
{
  const { order, tickets } = buildOrder([{ ...CHICKEN, quantity: 2 }], 11);
  const kot = tickets[0];
  const lineItemId = kot.items[0].lineItemId;

  advanceLine(kot, lineItemId, 'PREPARING');
  advanceLine(kot, lineItemId, 'READY'); // SALE_CONSUMPTION posted for the full line
  const consumedAfterReady = consumeCalls;
  check('G1 READY posted exactly one SALE_CONSUMPTION', consumedAfterReady === 1 && txnsForLine(lineItemId).length === 1);
  const expectedCost = Math.abs(txnsForLine(lineItemId).reduce((s, t) => s + (t.totalCost || 0), 0));

  // Waiter requests cancelling 1 of 2 (customer changed mind).
  const req = cancellationModel.requestCancellation({
    sessionId: order.sessionId, orderId: order.id, orderLineId: lineItemId, ticketId: kot.ticketId,
    quantity: 1, reasonCode: 'CUSTOMER_CHANGED_MIND', actor: WAITER, tenantId: TENANT
  });
  check('G1 request is REQUESTED at READY (station must decide)', req.success && req.request.status === 'REQUESTED' && req.request.stageAtRequest === 'READY');
  check('G1 request did NOT consume or reverse yet', consumeCalls === consumedAfterReady && reverseCalls === 0);

  // Chef approves with HOLD disposition (HOLD_OFFERED policy for KITCHEN).
  const dec = cancellationModel.decideCancellation(req.request.id, 'APPROVE', CHEF, { disposition: 'HOLD' }, TENANT);
  check('G1 chef approve succeeded and created a hold', dec.success && !!dec.hold);
  check('G1 policy gate returned HOLD_OFFERED', dec.policy && dec.policy.outcome === 'HOLD_OFFERED');
  check('G1 hold is HELD with consumedCost = posted SALE_CONSUMPTION and waste 0',
    dec.hold.status === 'HELD' && Math.abs(dec.hold.consumedCost - expectedCost) < 0.01 && dec.hold.wasteAmount === 0);
  check('G1 cancel did NOT reverse the posted consumption', reverseCalls === 0);
  check('G1 partial split conserved quantity (active 1 + cancelled 1 = 2)',
    activeQty(order.id) === 1 && cancelledQty(order.id) === 1);

  // Order B reuses the held item: new line stamped fulfilledByHoldId, then READY.
  const b = buildOrder([{ ...CHICKEN, quantity: 1 }], 12);
  const bLine = b.tickets[0].items[0].lineItemId;
  // Stamp the hold onto both the offline ticket item and the order line (what UI does).
  const tk = offlineStore.getCollection('tickets').find(t => t.ticketId === b.tickets[0].ticketId);
  tk.items.find(i => i.lineItemId === bLine).fulfilledByHoldId = dec.hold.id;
  lineOf(b.order.orderId || b.order.id, bLine).fulfilledByHoldId = dec.hold.id;

  const consumeBeforeReuse = consumeCalls;
  advanceLine(b.tickets[0], bLine, 'READY');
  check('G1 reuse of a HELD item posted NO new SALE_CONSUMPTION', consumeCalls === consumeBeforeReuse && txnsForLine(bLine).length === 0);
  check('G1 reused hold became REUSED with zero waste and lineage', (() => {
    const h = preparedHoldModel.getHold(dec.hold.id, TENANT);
    return h && h.status === 'REUSED' && h.wasteAmount === 0 && h.lineage === 'CANCEL -> HOLD -> REUSED';
  })());
}

// ===========================================================================
console.log('=== G2  Waste golden: HELD -> DISCARD recognises waste, zero stock movement ===');
reset();
{
  const { order, tickets } = buildOrder([{ ...CHICKEN, quantity: 1 }], 21);
  const lineItemId = tickets[0].items[0].lineItemId;
  advanceLine(tickets[0], lineItemId, 'READY');
  const txnCountAfterReady = (offlineStore.getCollection('stock_transactions') || []).length;
  const expectedCost = Math.abs(txnsForLine(lineItemId).reduce((s, t) => s + (t.totalCost || 0), 0));

  const req = cancellationModel.requestCancellation({
    orderId: order.id, orderLineId: lineItemId, ticketId: tickets[0].ticketId,
    quantity: 1, reasonCode: 'QUALITY_ISSUE', actor: WAITER, tenantId: TENANT
  });
  const dec = cancellationModel.decideCancellation(req.request.id, 'APPROVE', CHEF, { disposition: 'HOLD' }, TENANT);
  check('G2 hold created HELD (waste still 0)', dec.success && dec.hold.status === 'HELD' && dec.hold.wasteAmount === 0);

  const discard = preparedHoldModel.discardHold(dec.hold.id, { actor: CHEF, reason: 'CANCELLED_ORDER' }, TENANT);
  check('G2 discard succeeded', discard.success && discard.hold.status === 'DISCARDED');
  check('G2 wasteAmount = consumedCost and wasteRecognizedAt set',
    Math.abs(discard.hold.wasteAmount - expectedCost) < 0.01 && !!discard.hold.wasteRecognizedAt);
  check('G2 discard wrote NO new stock_transactions row',
    (offlineStore.getCollection('stock_transactions') || []).length === txnCountAfterReady);
  check('G2 discard consumed no BOM (consume call count unchanged)', consumeCalls === 1 && reverseCalls === 0);
}

// ===========================================================================
console.log('=== G3  Wrong quantity while PREPARING: split, no consumption, no hold ===');
reset();
{
  const { order, tickets } = buildOrder([{ ...CHICKEN, quantity: 3 }], 31);
  const lineItemId = tickets[0].items[0].lineItemId;
  advanceLine(tickets[0], lineItemId, 'PREPARING'); // never READY -> no consumption

  const req = cancellationModel.requestCancellation({
    orderId: order.id, orderLineId: lineItemId, ticketId: tickets[0].ticketId,
    quantity: 1, reasonCode: 'WRONG_QUANTITY', actor: WAITER, tenantId: TENANT
  });
  check('G3 request is REQUESTED at PREPARING', req.success && req.request.stageAtRequest === 'PREPARING');

  const dec = cancellationModel.decideCancellation(req.request.id, 'APPROVE', CHEF, {}, TENANT);
  check('G3 chef approve succeeded', dec.success);
  check('G3 no hold for a never-prepared line', !dec.hold && heldCount() === 0);
  check('G3 zero consumption and zero reversal', consumeCalls === 0 && reverseCalls === 0);
  check('G3 quantity conserved (active 2 + cancelled 1 = 3)', activeQty(order.id) === 2 && cancelledQty(order.id) === 3 - 2);
}

// ===========================================================================
console.log('=== Policy gate: BAR/COCKTAILS DISCARD-only (no hold offer) ===');
reset();
{
  const { order, tickets } = buildOrder([{ ...COCKTAIL, quantity: 1 }], 41);
  const bot = tickets.find(t => t.ticketType === 'BOT') || tickets[0];
  const lineItemId = bot.items[0].lineItemId;
  advanceLine(bot, lineItemId, 'READY');
  const txnAfterReady = (offlineStore.getCollection('stock_transactions') || []).length;
  const expectedCost = Math.abs(txnsForLine(lineItemId).reduce((s, t) => s + (t.totalCost || 0), 0));

  const policy = dispositionPolicyModel.resolvePolicy('BAR', 'menu-mojito', 'COCKTAILS', TENANT);
  check('cocktail policy resolves DISCARD_ONLY', policy.outcome === 'DISCARD_ONLY' && policy.allowHold === false);

  const req = cancellationModel.requestCancellation({
    orderId: order.id, orderLineId: lineItemId, ticketId: bot.ticketId,
    quantity: 1, reasonCode: 'CUSTOMER_CHANGED_MIND', actor: WAITER, tenantId: TENANT
  });
  check('BAR request station is BAR', req.success && req.request.station === 'BAR');

  const dec = cancellationModel.decideCancellation(req.request.id, 'APPROVE', BARTENDER, {}, TENANT);
  check('DISCARD-only auto-terminates as DISCARDED (never HELD)',
    dec.success && dec.hold && dec.hold.status === 'DISCARDED' && dec.hold.lineage === 'CANCEL -> DISCARD');
  check('DISCARD-only waste = consumedCost immediately', Math.abs(dec.hold.wasteAmount - expectedCost) < 0.01);
  check('no HELD rows exist', heldCount() === 0);
  check('no extra stock rows beyond READY consumption', (offlineStore.getCollection('stock_transactions') || []).length === txnAfterReady);
}

// ===========================================================================
console.log('=== Policy gate: MANAGER_DECISION (chef blocked on disposition, manager decides) ===');
reset();
{
  // Tenant override: KITCHEN STARTERS -> prepared cancels decided by MANAGER.
  dispositionPolicyModel.savePolicy({
    station: 'KITCHEN', categoryCode: 'STARTERS', itemCode: null,
    allowHold: true, holdMinutes: 45, defaultDisposition: 'HOLD', decideBy: 'MANAGER'
  }, TENANT);

  const { order, tickets } = buildOrder([{ ...CHICKEN, quantity: 1 }], 51);
  const lineItemId = tickets[0].items[0].lineItemId;
  advanceLine(tickets[0], lineItemId, 'READY');

  const req = cancellationModel.requestCancellation({
    orderId: order.id, orderLineId: lineItemId, ticketId: tickets[0].ticketId,
    quantity: 1, reasonCode: 'CUSTOMER_CHANGED_MIND', actor: WAITER, tenantId: TENANT
  });
  const chefDec = cancellationModel.decideCancellation(req.request.id, 'APPROVE', CHEF, {}, TENANT);
  check('chef approve parks request in PENDING_MANAGER_DISPOSITION',
    chefDec.success && chefDec.pendingManager === true && chefDec.request.status === 'PENDING_MANAGER_DISPOSITION' && !chefDec.hold);

  const chefPick = cancellationModel.decideCancellation(req.request.id, 'APPROVE', CHEF, { disposition: 'HOLD' }, TENANT);
  check('chef is BLOCKED from picking the manager disposition', chefPick.success === false && /MANAGER_AUTHORITY/.test(chefPick.error));

  const mgrDec = cancellationModel.decideCancellation(req.request.id, 'APPROVE', MANAGER, { disposition: 'HOLD' }, TENANT);
  check('manager disposition creates the HELD hold', mgrDec.success && mgrDec.hold && mgrDec.hold.status === 'HELD');
  check('line cancelled exactly once (active 0, cancelled 1 - no double split)', activeQty(order.id) === 0 && cancelledQty(order.id) === 1);
}

// ===========================================================================
console.log('=== QUEUED waiter cancel -> AUTO_APPROVED (entry-error self-service) ===');
reset();
{
  const { order, tickets } = buildOrder([{ ...CHICKEN, quantity: 2 }], 61);
  const lineItemId = tickets[0].items[0].lineItemId; // still QUEUED
  const req = cancellationModel.requestCancellation({
    orderId: order.id, orderLineId: lineItemId, ticketId: tickets[0].ticketId,
    quantity: 1, reasonCode: 'WAITER_ENTRY_ERROR', actor: WAITER, tenantId: TENANT
  });
  check('QUEUED request auto-approved instantly', req.success && req.autoApproved === true && req.request.status === 'AUTO_APPROVED');
  check('auto-approve created no consumption/hold', consumeCalls === 0 && reverseCalls === 0 && heldCount() === 0);
  check('partial split sums to original qty (active 1 + cancelled 1 = 2)', activeQty(order.id) === 1 && cancelledQty(order.id) === 1);
}

// ===========================================================================
console.log('=== Authority + guard rails ===');
reset();
{
  // PREPARING KITCHEN request: bartender authority is rejected, chef accepted.
  const { order, tickets } = buildOrder([{ ...CHICKEN, quantity: 1 }], 71);
  const lineItemId = tickets[0].items[0].lineItemId;
  advanceLine(tickets[0], lineItemId, 'PREPARING');
  const req = cancellationModel.requestCancellation({
    orderId: order.id, orderLineId: lineItemId, ticketId: tickets[0].ticketId,
    quantity: 1, reasonCode: 'CUSTOMER_CHANGED_MIND', actor: WAITER, tenantId: TENANT
  });
  const barTry = cancellationModel.decideCancellation(req.request.id, 'APPROVE', BARTENDER, {}, TENANT);
  check('bartender REJECTED for a KITCHEN request', barTry.success === false && /STATION_AUTHORITY_REQUIRED/.test(barTry.error));

  // REJECT keeps the line.
  const rej = cancellationModel.decideCancellation(req.request.id, 'REJECT', CHEF, {}, TENANT);
  check('REJECT closes request and keeps line active', rej.success && rej.request.status === 'REJECTED' && activeQty(order.id) === 1 && cancelledQty(order.id) === 0);

  // SERVED blocks a new request.
  advanceLine(tickets[0], lineItemId, 'READY');
  advanceLine(tickets[0], lineItemId, 'SERVED');
  const servedReq = cancellationModel.requestCancellation({
    orderId: order.id, orderLineId: lineItemId, ticketId: tickets[0].ticketId,
    quantity: 1, reasonCode: 'CUSTOMER_CHANGED_MIND', actor: WAITER, tenantId: TENANT
  });
  check('SERVED line blocks cancellation', servedReq.success === false && /SERVED_ITEMS_CANNOT_BE_CANCELLED/.test(servedReq.error));

  // Over-quantity blocks.
  const { order: o2, tickets: t2 } = buildOrder([{ ...CHICKEN, quantity: 2 }], 72);
  const l2 = t2[0].items[0].lineItemId;
  const overReq = cancellationModel.requestCancellation({
    orderId: o2.id, orderLineId: l2, ticketId: t2[0].ticketId,
    quantity: 5, reasonCode: 'CUSTOMER_CHANGED_MIND', actor: WAITER, tenantId: TENANT
  });
  check('over-quantity blocks cancellation', overReq.success === false && /QUANTITY_EXCEEDS_ACTIVE_LINE/.test(overReq.error));

  // Invalid reason blocks.
  const badReason = cancellationModel.requestCancellation({
    orderId: o2.id, orderLineId: l2, ticketId: t2[0].ticketId,
    quantity: 1, reasonCode: 'BECAUSE_I_SAID_SO', actor: WAITER, tenantId: TENANT
  });
  check('uncontrolled reason code blocks', badReason.success === false && /INVALID_REASON_CODE/.test(badReason.error));
}

// ===========================================================================
console.log('=== Idempotency + manager reversal (immutable audit) ===');
reset();
{
  const { order, tickets } = buildOrder([{ ...CHICKEN, quantity: 1 }], 81);
  const lineItemId = tickets[0].items[0].lineItemId;
  advanceLine(tickets[0], lineItemId, 'PREPARING');
  const req = cancellationModel.requestCancellation({
    orderId: order.id, orderLineId: lineItemId, ticketId: tickets[0].ticketId,
    quantity: 1, reasonCode: 'CUSTOMER_CHANGED_MIND', actor: WAITER, tenantId: TENANT
  });
  const first = cancellationModel.decideCancellation(req.request.id, 'APPROVE', CHEF, {}, TENANT);
  const cancelledOnce = cancelledQty(order.id);
  const second = cancellationModel.decideCancellation(req.request.id, 'APPROVE', CHEF, {}, TENANT);
  check('double-approve applies once (idempotent, no extra cancelled qty)',
    first.success && second.success && second.idempotent === true && cancelledQty(order.id) === cancelledOnce);

  // Manager reversal restores the line and writes an immutable REVERSED audit record.
  const rev = cancellationModel.reverseCancellation(req.request.id, MANAGER, TENANT);
  check('manager reversal restores the line to PREPARING',
    rev.success && rev.restoredStatus === 'PREPARING' && activeQty(order.id) === 1 && cancelledQty(order.id) === 0);
  const orig = cancellationModel.getRequest(req.request.id, TENANT);
  check('original request left immutable (still APPROVED)', orig.status === 'APPROVED');
  check('reversal is a separate REVERSED record referencing the original',
    rev.reversal.status === 'REVERSED' && rev.reversal.reversesRequestId === req.request.id);

  // A non-manager cannot reverse.
  const bad = cancellationModel.reverseCancellation(req.request.id, CHEF, TENANT);
  check('chef/non-manager reversal blocked', bad.success === false && /MANAGER_AUTHORITY_REQUIRED/.test(bad.error));
}

// ===========================================================================
console.log('\n=== RESULTS ===');
let ok = true;
for (const [name, pass, extra] of checks) {
  console.log((pass ? 'PASS' : 'FAIL') + ' - ' + name + (pass ? '' : (extra ? ' :: ' + extra : '')));
  if (!pass) ok = false;
}
console.log(ok ? `\nRESULT: ALL ${checks.length} PASS` : '\nRESULT: FAILURES PRESENT');
process.exit(ok ? 0 : 1);
