/**
 * Retail Cash Register + End-of-Day certification (Retail Phase 3).
 *
 * Pure Node ESM harness over cashRegisterModel. It asserts the till maths that
 * the plan depends on:
 *   - open is idempotent (never stacks two OPEN shifts on RETAIL-01);
 *   - expected CASH counts only cash tender + drawer movements, digital sales
 *     are tracked separately (they belong to the bank, not the drawer);
 *   - a balanced close freezes variance=0, an unbalanced close reports variance;
 *   - cash operations + close require an OPEN register.
 */
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { cashRegisterModel } from '../businessos/platform/retail/cashRegisterModel.js';

const TENANT = 'tenant_h0qc7wf';
const REGISTER = 'RETAIL-01';

const checks = [];
const check = (name, pass, extra) => checks.push([name, !!pass, extra]);

const reset = () => ['cash_registers', 'register_transactions', 'retail_sales', 'invoices', 'payments', 'stock_transactions'].forEach(c => offlineStore.setCollection(c, []));

// Directly book a SALE / REFUND the POS/Returns screens would emit (register_rows
// are what the register reconciles against, independent of how they were made).
const bookRegisterTxn = (type, method, amount) => {
  offlineStore.appendItem('register_transactions', {
    id: 'rt-' + Math.random().toString(36).substring(2, 9),
    tenantId: TENANT, tenant_id: TENANT, registerId: REGISTER, register_id: REGISTER,
    businessUnit: 'RETAIL', business_unit: 'RETAIL',
    transactionType: type, transaction_type: type, paymentMethod: method, payment_method: method,
    amount, occurredAt: new Date().toISOString(), occurred_at: new Date().toISOString(), createdAt: new Date().toISOString()
  });
};

(async () => {
  // ---- S5-first: guard: operations need an OPEN register -------------------
  reset();
  let noOpen1 = false;
  try { cashRegisterModel.recordCashOut({ amount: 50, tenantId: TENANT }, { tenantId: TENANT }); } catch (e) { noOpen1 = e.code === 'NO_OPEN_REGISTER'; }
  check('S5 cash out with no open register -> NO_OPEN_REGISTER', noOpen1);
  let noOpen2 = false;
  try { cashRegisterModel.closeRegister({ physicalClosing: 0, tenantId: TENANT }, { tenantId: TENANT }); } catch (e) { noOpen2 = e.code === 'NO_OPEN_REGISTER'; }
  check('S5 close with no open register -> NO_OPEN_REGISTER', noOpen2);

  // ---- S1: open is idempotent ---------------------------------------------
  reset();
  const open1 = cashRegisterModel.openRegister({ openingBalance: 2000, operatorName: 'Retail Manager', tenantId: TENANT }, { tenantId: TENANT });
  check('S1 register OPEN with float 2000', open1.status === 'OPEN' && open1.openingBalance === 2000, `${open1.status}/${open1.openingBalance}`);
  const open2 = cashRegisterModel.openRegister({ openingBalance: 9999, tenantId: TENANT }, { tenantId: TENANT });
  check('S1 second open replays same shift (no stack)', open2.idempotentReplay === true && open2.id === open1.id && open2.openingBalance === 2000, open2.openingBalance);
  const openCount = (offlineStore.getCollection('cash_registers') || []).length;
  check('S1 exactly one cash_registers row', openCount === 1, openCount);

  // ---- S2: expected-cash math ---------------------------------------------
  bookRegisterTxn('SALE', 'CASH', 1000);
  bookRegisterTxn('SALE', 'UPI', 500);
  bookRegisterTxn('REFUND', 'CASH', 200);
  cashRegisterModel.recordCashIn({ amount: 300, note: 'bank float top-up', tenantId: TENANT }, { tenantId: TENANT });
  cashRegisterModel.recordCashOut({ amount: 100, note: 'courier', tenantId: TENANT }, { tenantId: TENANT });

  const shift = cashRegisterModel.getOpenShiftSummary(TENANT, REGISTER);
  const s = shift.summary;
  check('S2 totalSales 1500 (cash+digital)', s.totalSales === 1500, s.totalSales);
  check('S2 cashSales 1000 · digitalSales 500', s.cashSales === 1000 && s.digitalSales === 500, `${s.cashSales}/${s.digitalSales}`);
  check('S2 cashIn 300 · cashOut 100', s.cashIn === 300 && s.cashOut === 100, `${s.cashIn}/${s.cashOut}`);
  // expected = float 2000 + cashSales 1000 - cashRefunds 200 + cashIn 300 - cashOut 100 = 3000
  check('S2 expected cash in drawer 3000', s.expectedCash === 3000, s.expectedCash);
  check('S2 netCollections (sales - refunds) 1300', s.netCollections === 1300, s.netCollections);

  // ---- S3: balanced close --------------------------------------------------
  const balanced = cashRegisterModel.closeRegister({ physicalClosing: 3000, operatorName: 'Retail Manager', tenantId: TENANT }, { tenantId: TENANT });
  check('S3 balanced close variance 0', balanced.balanced === true && balanced.variance === 0, `variance=${balanced.variance}`);
  check('S3 shift now CLOSED with frozen expected', balanced.register.status === 'CLOSED' && parseFloat(balanced.register.expectedClosing) === 3000, balanced.register.status);

  // ---- S4: unbalanced close (fresh shift) ----------------------------------
  reset();
  cashRegisterModel.openRegister({ openingBalance: 500, tenantId: TENANT }, { tenantId: TENANT });
  bookRegisterTxn('SALE', 'CASH', 700);
  const unbal = cashRegisterModel.closeRegister({ physicalClosing: 1150, tenantId: TENANT }, { tenantId: TENANT });
  // expected = 500 + 700 = 1200; counted 1150 -> variance -50
  check('S4 expected cash 1200', unbal.summary.expectedCash === 1200, unbal.summary.expectedCash);
  check('S4 variance -50 (short) · not balanced', unbal.variance === -50 && unbal.balanced === false, `variance=${unbal.variance}`);

  // ---- D1: generalized engine keeps RETAIL defaults (regression guard) ------
  reset();
  const dOpen = cashRegisterModel.openRegister({ openingBalance: 1000, operatorName: 'Retail Manager', tenantId: TENANT }, { tenantId: TENANT });
  check('D1 no-context open defaults to RETAIL / RETAIL-01', dOpen.businessUnit === 'RETAIL' && dOpen.registerId === 'RETAIL-01', `${dOpen.businessUnit}/${dOpen.registerId}`);
  cashRegisterModel.closeRegister({ physicalClosing: 1000, tenantId: TENANT }, { tenantId: TENANT });
  const dCarry = cashRegisterModel.getCarryoverOpening();
  check('D1 carryover = last physical closing under RETAIL defaults', dCarry.expectedOpening === 1000, dCarry.expectedOpening);
  // Enforcement is opt-in: an unbalanced close with NO reason still succeeds.
  reset();
  cashRegisterModel.openRegister({ openingBalance: 500, tenantId: TENANT }, { tenantId: TENANT });
  let defClose = true;
  try { cashRegisterModel.closeRegister({ physicalClosing: 400, tenantId: TENANT }, { tenantId: TENANT }); } catch (_) { defClose = false; }
  check('D1 default (no enforceVarianceReason) allows unbalanced close', defClose);

  // ---- Report --------------------------------------------------------------
  let pass = 0;
  console.log('\n=== Retail Cash Register + EOD (Phase 3) ===');
  checks.forEach(([name, ok, extra]) => { if (ok) pass++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? `  [${extra}]` : ''}`); });
  console.log(`\n${pass}/${checks.length} checks passed.`);
  process.exit(pass === checks.length ? 0 : 1);
})().catch(e => { console.error('Harness crashed:', e); process.exit(1); });
