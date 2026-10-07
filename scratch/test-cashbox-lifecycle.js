/**
 * Cash Box Lifecycle certification (Open / Close Cash Box feature).
 *
 * Headless Node ESM over the SHARED cashRegisterModel + cashBoxService, driving
 * the Cashier register (CASHIER-01 / RESTAURANT). It asserts the controls the
 * client asked for, on top of the till maths already covered by
 * test-retail-register.js:
 *   - opening carryover: yesterday's locked closing becomes today's expected open;
 *   - opening count-verify: a mismatch requires a reason (when enforced);
 *   - unsettled-bill close gate (via cashBoxService) refuses to close;
 *   - closing variance requires a logged reason + writes the append-only audit;
 *   - restaurant cash posts into the drawer, UPI does not move it;
 *   - idempotency on a replayed correlationId (no duplicate till row).
 */
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { cashRegisterModel } from '../businessos/platform/retail/cashRegisterModel.js';
import { cashBoxService } from '../businessos/platform/cashbox/cashBoxService.js';

const TENANT = 'tenant_h0qc7wf';
const UNIT = 'RESTAURANT';
const REGISTER = 'CASHIER-01';

const checks = [];
const check = (name, pass, extra) => checks.push([name, !!pass, extra]);
const nowISO = () => new Date().toISOString();
const ctx = (extra = {}) => ({ businessUnit: UNIT, registerId: REGISTER, tenantId: TENANT, ...extra });

const reset = () => ['cash_registers', 'register_transactions', 'invoices', 'payments', 'retail_sales', 'session_audit_logs']
  .forEach(c => offlineStore.setCollection(c, []));

const openShift = (openingBalance, operatorName) =>
  cashRegisterModel.openRegister(ctx({ openingBalance, operatorName }), { tenantId: TENANT });

const saleTxn = (type, method, amount) => offlineStore.appendItem('register_transactions', {
  id: 'rt-' + Math.random().toString(36).substring(2, 9),
  tenantId: TENANT, tenant_id: TENANT, registerId: REGISTER, register_id: REGISTER,
  businessUnit: UNIT, business_unit: UNIT,
  transactionType: type, transaction_type: type, paymentMethod: method, payment_method: method,
  amount, occurredAt: nowISO(), occurred_at: nowISO(), createdAt: nowISO()
});

(async () => {
  // ---- A: opening carryover + count-verify --------------------------------
  reset();
  let a = openShift(4250, 'Cashier A');
  saleTxn('SALE', 'CASH', 1000); // expected cash = 4250 + 1000 = 5250
  cashRegisterModel.closeRegister(ctx({ physicalClosing: 5250, operatorName: 'Cashier A' }), { tenantId: TENANT });
  const carry = cashRegisterModel.getCarryoverOpening(UNIT, REGISTER, TENANT);
  check('A1 yesterday closing (5250) carried as today expected opening', carry.expectedOpening === 5250, carry.expectedOpening);

  let mismatchBlocked = false; let mv;
  try { cashRegisterModel.openRegister(ctx({ expectedOpening: 5250, openingCounted: 5200, enforceOpeningReason: true, operatorName: 'Cashier B' }), { tenantId: TENANT }); }
  catch (e) { mismatchBlocked = e.code === 'OPENING_VARIANCE_REASON_REQUIRED'; mv = e.variance; }
  check('A2 open count 5200 vs expected 5250 blocked without reason', mismatchBlocked && mv === -50, `${mismatchBlocked}/${mv}`);

  let b = cashRegisterModel.openRegister(ctx({ expectedOpening: 5250, openingCounted: 5200, openingVarianceReason: 'Bank could not break ₹50; short float', operatorName: 'Cashier B', enforceOpeningReason: true }), { tenantId: TENANT });
  check('A3 open succeeds once a reason is given', b.status === 'OPEN' && b.openingBalance === 5200 && b.openingVariance === -50, `${b.openingBalance}/${b.openingVariance}`);
  const openAudit = (offlineStore.getCollection('session_audit_logs') || []).some(x => String(x.sessionId) === `cash_register:${b.id}` && x.eventType === 'OPENING_VARIANCE');
  check('A4 opening variance written to append-only audit', openAudit);

  // ---- B: unsettled-bill close gate ---------------------------------------
  reset();
  let open = openShift(1000, 'Cashier');
  // An ISSUED restaurant invoice with no matching payment = one outstanding bill.
  offlineStore.appendItem('invoices', { id: 'inv-1', tenantId: TENANT, tenant_id: TENANT, sessionId: 'sess-open', session_id: 'sess-open', invoiceNumber: 'INV-1', invoice_number: 'INV-1', status: 'ISSUED', businessUnit: UNIT, business_unit: UNIT, grandTotal: 500, grand_total: 500, issuedAt: nowISO(), createdAt: nowISO() });
  const unsettled = cashBoxService.getUnsettledBills(UNIT, TENANT, { from: open.openedAt, to: nowISO() });
  check('B1 cashBoxService finds 1 unsettled bill', unsettled.length === 1 && unsettled[0].sessionId === 'sess-open', JSON.stringify(unsettled));

  let gateBlocked = false;
  try { cashRegisterModel.closeRegister(ctx({ physicalClosing: 1000, unsettledCount: unsettled.length, enforceVarianceReason: true }), { tenantId: TENANT }); }
  catch (e) { gateBlocked = e.code === 'PENDING_BILLS' && e.unsettled === 1; }
  check('B2 close blocked while a bill is unsettled (PENDING_BILLS)', gateBlocked);

  // Settle the bill; the gate now passes.
  offlineStore.appendItem('payments', { id: 'pay-1', tenantId: TENANT, tenant_id: TENANT, sessionId: 'sess-open', session_id: 'sess-open', status: 'SETTLED', paymentMethod: 'CASH', amount: 500, receivedAt: nowISO() });
  const afterSettle = cashBoxService.getUnsettledCount(UNIT, TENANT, { from: open.openedAt, to: nowISO() });
  let gatePasses = true;
  try { cashRegisterModel.closeRegister(ctx({ physicalClosing: 1000, unsettledCount: afterSettle, enforceVarianceReason: true }), { tenantId: TENANT }); }
  catch (_) { gatePasses = false; }
  check('B3 after settling, unsettled=0 and close succeeds', afterSettle === 0 && gatePasses, `${afterSettle}/${gatePasses}`);

  // ---- C: closing variance requires a reason + audit ----------------------
  reset();
  openShift(1000, 'Cashier'); // expected cash = 1000 (no sales)
  let varBlocked = false; let v;
  try { cashRegisterModel.closeRegister(ctx({ physicalClosing: 980, enforceVarianceReason: true, operatorName: 'Cashier' }), { tenantId: TENANT }); }
  catch (e) { varBlocked = e.code === 'VARIANCE_REASON_REQUIRED'; v = e.variance; }
  check('C1 drawer short ₹20 blocked without a reason', varBlocked && v === -20, `${varBlocked}/${v}`);

  const openRec = cashRegisterModel.getCurrentRegister(TENANT, REGISTER, UNIT);
  const closed = cashRegisterModel.closeRegister(ctx({ physicalClosing: 980, varianceReason: 'Paid a ₹20 courier out of the drawer (missed Cash Out)', enforceVarianceReason: true, operatorName: 'Cashier' }), { tenantId: TENANT });
  check('C2 with reason, close succeeds and freezes variance -20', closed.variance === -20 && String(closed.register.varianceReason).length > 0, `${closed.variance}/${closed.register.varianceReason}`);
  const closeAudit = (offlineStore.getCollection('session_audit_logs') || []).some(x => String(x.sessionId) === `cash_register:${openRec.id}` && x.eventType === 'CLOSING_VARIANCE');
  check('C3 closing variance logged to append-only audit', closeAudit);

  // ---- D: restaurant cash posts to drawer; UPI does not; idempotency -------
  reset();
  let noReg = false;
  try { noReg = cashRegisterModel.registerSale(ctx({ amount: 100, paymentMethod: 'CASH', correlationId: 'CID-N' })) === null; } catch (_) { noReg = false; }
  check('D1 registerSale with no OPEN register is a no-op (null)', noReg);
  openShift(0, 'Cashier');
  cashRegisterModel.registerSale(ctx({ amount: 1000, paymentMethod: 'CASH', correlationId: 'CID-C1', referenceId: 'INV-C1' }));
  cashRegisterModel.registerSale(ctx({ amount: 500, paymentMethod: 'UPI', correlationId: 'CID-U1', referenceId: 'INV-U1' }));
  const s = cashRegisterModel.getOpenShiftSummary(TENANT, REGISTER, UNIT).summary;
  check('D2 CASH sale raises expected drawer (1000)', s.cashSales === 1000 && s.expectedCash === 1000, `${s.cashSales}/${s.expectedCash}`);
  check('D3 UPI sale tracked as digital but does NOT move the drawer', s.digitalSales === 500 && s.expectedCash === 1000, `${s.digitalSales}/${s.expectedCash}`);

  const before = (offlineStore.getCollection('register_transactions') || []).filter(t => String(t.correlationId || t.correlation_id) === 'CID-C1').length;
  cashRegisterModel.registerSale(ctx({ amount: 1000, paymentMethod: 'CASH', correlationId: 'CID-C1', referenceId: 'INV-C1' })); // replay
  const after = (offlineStore.getCollection('register_transactions') || []).filter(t => String(t.correlationId || t.correlation_id) === 'CID-C1').length;
  check('D4 replayed correlationId adds no duplicate till row', before === 1 && after === 1, `${before}/${after}`);

  // ---- Report -------------------------------------------------------------
  let pass = 0;
  console.log('\n=== Cash Box Lifecycle (Open / Close Cash Box) ===');
  checks.forEach(([name, ok, extra]) => { if (ok) pass++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? `  [${extra}]` : ''}`); });
  console.log(`\n${pass}/${checks.length} checks passed.`);
  process.exit(pass === checks.length ? 0 : 1);
})().catch(e => { console.error('Harness crashed:', e); process.exit(1); });
