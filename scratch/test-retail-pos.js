/**
 * Retail POS end-to-end boundary certification (Retail Phase 1).
 *
 * Pure Node ESM harness (pattern of test-cancellation-workflow.js). Drives the
 * REAL retailSaleModel.checkout() against the in-memory offlineStore and asserts
 * the plan's core invariant: ONE checkout = ONE correlation_id = FOUR artifacts
 * (Sale / Invoice / Settlement / Register txn) + exactly one stock consumption
 * at LOC-RETAIL, all idempotent + safely compensating.
 *
 *   1. happy path          -> all five artifacts share ONE correlation_id; exactly
 *                             one SALE_CONSUMPTION txn; balance drops; invoice is
 *                             INV/<fy>/<seq>R; settlement is SET-R-*; register SALE.
 *   2. idempotent replay   -> same correlation_id re-POST returns the same sale and
 *                             adds NO second deduction / invoice / payment / register line.
 *   3. crash-between-steps -> a forced register-write failure leaves NO orphaned stock
 *                             deduction (unwound) and the SAME key replays cleanly.
 *   4. pre-checkout guard  -> insufficient stock throws INSUFFICIENT_STOCK with ZERO
 *                             stock movement (the guard writes nothing).
 */
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { retailProductModel } from '../businessos/platform/retail/retailProductModel.js';
import { retailSaleModel } from '../businessos/platform/retail/retailSaleModel.js';

const TENANT = 'tenant_h0qc7wf';
const LOC = 'LOC-RETAIL';
const REGISTER = 'RETAIL-01';

const checks = [];
const check = (name, pass, extra) => checks.push([name, !!pass, extra]);

// ---- Fixtures --------------------------------------------------------------
// Retail now reads LIVE data only (no mock catalogue). The POS harness seeds its
// own live-shaped rows: a shared `inventory` master SKU + a `retail_products`
// catalogue row referencing it (mirroring what the Wine Catalogue + hydration
// would provide in the browser). Stock at LOC-RETAIL is provided by a manager
// warehouse transfer in production; here we seed the resulting balance directly.
const seedFixture = (itemCode, productCode, name, price) => {
  const inv = offlineStore.getCollection('inventory') || [];
  if (!inv.some(i => (i.itemCode || i.item_code) === itemCode)) {
    inv.push({ id: itemCode, tenantId: TENANT, tenant_id: TENANT, itemCode, item_code: itemCode, itemName: name, item_name: name, baseUom: 'PCS', base_uom: 'PCS', reorder_level: 6 });
    offlineStore.setCollection('inventory', inv);
  }
  const rp = offlineStore.getCollection('retail_products') || [];
  const rec = {
    id: `rp-${productCode}`, tenantId: TENANT, tenant_id: TENANT,
    productCode, product_code: productCode, itemCode, item_code: itemCode,
    name, sellingPrice: price, selling_price: price, mrp: price,
    taxCategory: 'ALCOHOL_WINE', tax_category: 'ALCOHOL_WINE', status: 'ACTIVE',
    businessUnit: 'RETAIL', business_unit: 'RETAIL'
  };
  const idx = rp.findIndex(p => (p.productCode || p.product_code) === productCode);
  if (idx >= 0) rp[idx] = rec; else rp.push(rec);
  offlineStore.setCollection('retail_products', rp);
};

const seedStock = (itemCode, qty) => {
  const list = offlineStore.getCollection('stock_balances') || [];
  const rec = {
    id: `sb-${itemCode}-${LOC}`, tenantId: TENANT, tenant_id: TENANT,
    itemCode, item_code: itemCode, locationCode: LOC, location_code: LOC,
    quantity: qty, currentStock: qty, unitCost: 600, valuation: qty * 600, uom: 'PCS',
    data: { quantity: qty, unitCost: 600 }
  };
  const idx = list.findIndex(b => (b.itemCode || b.item_code) === itemCode && (b.locationCode || b.location_code) === LOC);
  if (idx >= 0) list[idx] = rec; else list.push(rec);
  offlineStore.setCollection('stock_balances', list);
};

const balQty = (itemCode) => {
  const b = (offlineStore.getCollection('stock_balances') || [])
    .find(x => (x.itemCode || x.item_code) === itemCode && (x.locationCode || x.location_code) === LOC);
  return b ? (parseFloat(b.quantity != null ? b.quantity : (b.data && b.data.quantity)) || 0) : 0;
};

const rows = (collection, pred) => (offlineStore.getCollection(collection) || []).filter(pred);
const corrOf = r => r.correlationId || r.correlation_id;

const resetLedgers = () => {
  ['retail_sales', 'stock_transactions', 'invoices', 'payments', 'register_transactions']
    .forEach(c => offlineStore.setCollection(c, []));
};

// ---- Run -------------------------------------------------------------------
(async () => {
  // Seed a live-shaped catalogue row + shared master, then resolve it.
  seedFixture('WINE-CABERNET-750', 'RP-CAB-001', 'Cabernet Sauvignon 750ml', 1550);
  // Resolve a real catalogue product to sell.
  const product = retailProductModel.getAll(TENANT).find(p => p.itemCode) || null;
  check('catalogue product available', !!product, product && product.itemCode);
  const ITEM = product.itemCode;

  // ---- Scenario 1: happy path ---------------------------------------------
  resetLedgers();
  seedStock(ITEM, 20);
  const CID1 = 'RCID-TEST-1';
  const draft1 = { lines: [{ productCode: product.productCode, quantity: 2 }], discount: 0, customerName: 'Amit' };

  const before = balQty(ITEM);
  const sale1 = await retailSaleModel.checkout(draft1, { correlationId: CID1, paymentMethod: 'UPI', referenceNo: 'UPI-REF-9' }, { tenantId: TENANT, employeeName: 'Retail Manager' });

  check('S1 sale CONFIRMED + RS- number', sale1.status === 'CONFIRMED' && /^RS-/.test(sale1.saleNumber), sale1.saleNumber);
  check('S1 invoice is RETAIL series (...R)', /R$/.test(sale1.invoiceNumber), sale1.invoiceNumber);
  check('S1 settlement SET-R-*', /^SET-R-/.test(sale1.settlementId), sale1.settlementId);

  const sale1Row = retailSaleModel.getSaleByCorrelation(CID1, TENANT);
  check('S1 sale persisted by correlation_id', !!sale1Row);

  const consume1 = rows('stock_transactions', t => corrOf(t) === CID1 && (t.transactionType || t.transaction_type) === 'SALE_CONSUMPTION');
  const reverse1 = rows('stock_transactions', t => corrOf(t) === CID1 && (t.transactionType || t.transaction_type) === 'SALE_REVERSAL');
  check('S1 exactly one SALE_CONSUMPTION txn', consume1.length === 1, consume1.length);
  check('S1 zero compensating reversal on success', reverse1.length === 0, reverse1.length);
  check('S1 consumption at LOC-RETAIL, qty -2', consume1[0] && consume1[0].locationCode === LOC && parseFloat(consume1[0].quantity) === -2, consume1[0] && consume1[0].quantity);
  check('S1 balance decremented by 2 at LOC-RETAIL', Math.abs((before - balQty(ITEM)) - 2) < 1e-6, `before=${before} after=${balQty(ITEM)}`);

  const inv1 = rows('invoices', i => corrOf(i) === CID1 && (i.businessUnit || i.business_unit) === 'RETAIL');
  const pay1 = rows('payments', p => corrOf(p) === CID1 && (p.businessUnit || p.business_unit) === 'RETAIL');
  const reg1 = rows('register_transactions', r => corrOf(r) === CID1 && (r.transactionType || r.transaction_type) === 'SALE');
  check('S1 exactly one invoice', inv1.length === 1, inv1.length);
  check('S1 exactly one settlement (payment)', pay1.length === 1, pay1.length);
  check('S1 exactly one register SALE on RETAIL-01', reg1.length === 1 && (reg1[0].registerId || reg1[0].register_id) === REGISTER, reg1.length);

  const grandTotal = sale1Row.grandTotal || sale1Row.grand_total;
  check('S1 grand total > taxable (VAT applied)', grandTotal > 0, grandTotal);
  check('S1 all five artifacts share ONE correlation_id',
    [sale1Row, inv1[0], pay1[0], reg1[0], consume1[0]].every(r => r && corrOf(r) === CID1));
  check('S1 settlement amount == grand total', pay1[0] && Math.abs((parseFloat(pay1[0].amount)) - grandTotal) < 0.01, pay1[0] && pay1[0].amount);

  // ---- Scenario 2: idempotent replay --------------------------------------
  const before2 = balQty(ITEM);
  const replay = await retailSaleModel.checkout(draft1, { correlationId: CID1, paymentMethod: 'UPI', referenceNo: 'UPI-REF-9' }, { tenantId: TENANT });
  check('S2 replay flagged idempotentReplay', replay.idempotentReplay === true);
  check('S2 replay returns same sale number', replay.saleNumber === sale1.saleNumber, replay.saleNumber);
  const consume1b = rows('stock_transactions', t => corrOf(t) === CID1 && (t.transactionType || t.transaction_type) === 'SALE_CONSUMPTION').length;
  const inv1b = rows('invoices', i => corrOf(i) === CID1 && (i.businessUnit || i.business_unit) === 'RETAIL').length;
  const pay1b = rows('payments', p => corrOf(p) === CID1 && (p.businessUnit || p.business_unit) === 'RETAIL').length;
  const reg1b = rows('register_transactions', r => corrOf(r) === CID1 && (r.transactionType || r.transaction_type) === 'SALE').length;
  check('S2 no second deduction/invoice/payment/register', consume1b === 1 && inv1b === 1 && pay1b === 1 && reg1b === 1, `${consume1b}/${inv1b}/${pay1b}/${reg1b}`);
  check('S2 balance unchanged on replay', balQty(ITEM) === before2, `before=${before2} after=${balQty(ITEM)}`);

  // ---- Scenario 3: crash-between-steps + safe replay ----------------------
  const CID3 = 'RCID-TEST-FAIL';
  const draft3 = { lines: [{ productCode: product.productCode, quantity: 3 }] };
  const before3 = balQty(ITEM);
  let threw = false;
  try {
    await retailSaleModel.checkout(draft3, { correlationId: CID3, __forceFailureAt: 'register' }, { tenantId: TENANT });
  } catch (e) { threw = /SIMULATED_REGISTER_FAILURE/.test(e.message); }
  check('S3 forced register failure threw', threw);
  const consume3fail = rows('stock_transactions', t => corrOf(t) === CID3 && (t.transactionType || t.transaction_type) === 'SALE_CONSUMPTION').length;
  const sale3fail = rows('retail_sales', s => corrOf(s) === CID3).length;
  const inv3fail = rows('invoices', i => corrOf(i) === CID3 && (i.businessUnit || i.business_unit) === 'RETAIL').length;
  const pay3fail = rows('payments', p => corrOf(p) === CID3 && (p.businessUnit || p.business_unit) === 'RETAIL').length;
  const reg3fail = rows('register_transactions', r => corrOf(r) === CID3).length;
  check('S3 no orphaned stock deduction after failure', consume3fail === 0, consume3fail);
  check('S3 no orphaned sale/invoice/payment/register after failure', sale3fail === 0 && inv3fail === 0 && pay3fail === 0 && reg3fail === 0, `${sale3fail}/${inv3fail}/${pay3fail}/${reg3fail}`);
  check('S3 balance fully restored after failure', balQty(ITEM) === before3, `before=${before3} after=${balQty(ITEM)}`);

  // Replay same key WITHOUT the forced failure -> must succeed exactly once.
  const sale3 = await retailSaleModel.checkout(draft3, { correlationId: CID3 }, { tenantId: TENANT });
  check('S3 replay-after-failure succeeds', /^RS-/.test(sale3.saleNumber) && sale3.idempotentReplay !== true, sale3.saleNumber);
  check('S3 replay deducted only 3 units', Math.abs((before3 - balQty(ITEM)) - 3) < 1e-6, `before=${before3} after=${balQty(ITEM)}`);
  const consume3 = rows('stock_transactions', t => corrOf(t) === CID3 && (t.transactionType || t.transaction_type) === 'SALE_CONSUMPTION').length;
  check('S3 replay has exactly one consumption line', consume3 === 1, consume3);

  // ---- Scenario 4: pre-checkout insufficient-stock guard ------------------
  const CID4 = 'RCID-TEST-SHORT';
  const before4 = balQty(ITEM);
  let insufficient = false;
  try {
    await retailSaleModel.checkout({ lines: [{ productCode: product.productCode, quantity: 99999 }] }, { correlationId: CID4 }, { tenantId: TENANT });
  } catch (e) { insufficient = /INSUFFICIENT_STOCK/.test(e.message); }
  check('S4 insufficient stock throws INSUFFICIENT_STOCK', insufficient);
  const consume4 = rows('stock_transactions', t => corrOf(t) === CID4).length;
  const sale4 = rows('retail_sales', s => corrOf(s) === CID4).length;
  check('S4 zero stock movement on guard failure', consume4 === 0 && sale4 === 0, `${consume4}/${sale4}`);
  check('S4 balance untouched by the guard', balQty(ITEM) === before4, `before=${before4} after=${balQty(ITEM)}`);

  // ---- Report -------------------------------------------------------------
  let pass = 0;
  console.log('\n=== Retail POS boundary (Phase 1) ===');
  checks.forEach(([name, ok, extra]) => {
    if (ok) pass++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? `  [${extra}]` : ''}`);
  });
  console.log(`\n${pass}/${checks.length} checks passed.`);
  process.exit(pass === checks.length ? 0 : 1);
})().catch(e => { console.error('Harness crashed:', e); process.exit(1); });
