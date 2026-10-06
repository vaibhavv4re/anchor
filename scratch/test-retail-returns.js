/**
 * Retail Returns & Refunds certification (Retail Phase 4).
 *
 * Pure Node ESM harness (pattern of test-retail-pos.js). Creates REAL sales via
 * retailSaleModel.checkout(), then drives retailSaleModel.refund() and asserts
 * the plan's refund contract:
 *   - restock=true  -> a compensating SALE_REVERSAL returns units to LOC-RETAIL;
 *   - restock=false -> money/credit still issued, stock NOT touched;
 *   - ALWAYS        -> a register REFUND on RETAIL-01 + a RETAIL credit note
 *                      (negative) + a refund settlement (negative amount);
 *   - per-line clamp -> cannot over-refund; status flips PARTIALLY_REFUNDED /
 *                      REFUNDED; and the whole thing is idempotent on replay.
 */
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { retailSaleModel } from '../businessos/platform/retail/retailSaleModel.js';

const TENANT = 'tenant_h0qc7wf';
const LOC = 'LOC-RETAIL';
const REGISTER = 'RETAIL-01';

const checks = [];
const check = (name, pass, extra) => checks.push([name, !!pass, extra]);

const seedFixture = (itemCode, productCode, name, price) => {
  const inv = offlineStore.getCollection('inventory') || [];
  if (!inv.some(i => (i.itemCode || i.item_code) === itemCode)) {
    inv.push({ id: itemCode, tenantId: TENANT, tenant_id: TENANT, itemCode, item_code: itemCode, itemName: name, item_name: name, baseUom: 'PCS', base_uom: 'PCS', reorder_level: 6 });
    offlineStore.setCollection('inventory', inv);
  }
  const rp = offlineStore.getCollection('retail_products') || [];
  rp.push({ id: `rp-${productCode}`, tenantId: TENANT, tenant_id: TENANT, productCode, product_code: productCode, itemCode, item_code: itemCode, name, sellingPrice: price, selling_price: price, mrp: price, taxCategory: 'ALCOHOL_WINE', tax_category: 'ALCOHOL_WINE', status: 'ACTIVE', businessUnit: 'RETAIL', business_unit: 'RETAIL' });
  offlineStore.setCollection('retail_products', rp);
};
const seedStock = (itemCode, qty) => {
  const list = offlineStore.getCollection('stock_balances') || [];
  const rec = { id: `sb-${itemCode}-${LOC}`, tenantId: TENANT, tenant_id: TENANT, itemCode, item_code: itemCode, locationCode: LOC, location_code: LOC, quantity: qty, currentStock: qty, unitCost: 600, valuation: qty * 600, uom: 'PCS', data: { quantity: qty, unitCost: 600 } };
  const idx = list.findIndex(b => (b.itemCode || b.item_code) === itemCode && (b.locationCode || b.location_code) === LOC);
  if (idx >= 0) list[idx] = rec; else list.push(rec);
  offlineStore.setCollection('stock_balances', list);
};
const balQty = (itemCode) => {
  const b = (offlineStore.getCollection('stock_balances') || []).find(x => (x.itemCode || x.item_code) === itemCode && (x.locationCode || x.location_code) === LOC);
  return b ? (parseFloat(b.quantity != null ? b.quantity : (b.data && b.data.quantity)) || 0) : 0;
};
const rows = (c, pred) => (offlineStore.getCollection(c) || []).filter(pred);
const corrOf = r => r.correlationId || r.correlation_id;

(async () => {
  seedFixture('WINE-SHIRAZ-750', 'RP-SHR-001', 'Shiraz 750ml', 1400);
  const product = retailSaleModel && (offlineStore.getCollection('retail_products') || [])[0];
  const ITEM = product.itemCode;

  // ---- Scenario 1: full refund WITH restock -------------------------------
  ['retail_sales', 'stock_transactions', 'invoices', 'payments', 'register_transactions'].forEach(c => offlineStore.setCollection(c, []));
  seedStock(ITEM, 20);
  const sale1 = await retailSaleModel.checkout({ lines: [{ productCode: product.productCode, quantity: 5 }] }, { correlationId: 'RCID-R1-SALE' }, { tenantId: TENANT });
  check('S1 sale created (5 sold)', rows('retail_sales', s => s.saleNumber === sale1.saleNumber).length === 1);
  const afterSale = balQty(ITEM);
  check('S1 balance dropped to 15 after sale', afterSale === 15, afterSale);

  const RC1 = 'RCID-R1-REFUND';
  const refund1 = await retailSaleModel.refund(sale1.saleNumber, { correlationId: RC1, restock: true }, { tenantId: TENANT });
  check('S1 sale now REFUNDED', refund1.status === 'REFUNDED', refund1.status);
  check('S1 refundAmount > 0', refund1.refundAmount > 0, refund1.refundAmount);
  check('S1 restock returned 5 units', balQty(ITEM) === 20, balQty(ITEM));

  const rev1 = rows('stock_transactions', t => corrOf(t) === RC1 && (t.transactionType || t.transaction_type) === 'SALE_REVERSAL');
  check('S1 exactly one SALE_REVERSAL line', rev1.length === 1, rev1.length);
  check('S1 reversal qty +5 at LOC-RETAIL', rev1[0] && rev1[0].locationCode === LOC && parseFloat(rev1[0].quantity) === 5, rev1[0] && rev1[0].quantity);

  const reg1 = rows('register_transactions', r => corrOf(r) === RC1 && (r.transactionType || r.transaction_type) === 'REFUND');
  check('S1 register REFUND on RETAIL-01', reg1.length === 1 && (reg1[0].registerId || reg1[0].register_id) === REGISTER, reg1.length);

  const cn1 = rows('invoices', i => corrOf(i) === RC1 && (i.documentType || i.document_type) === 'CREDIT_NOTE');
  check('S1 credit note issued in RETAIL series (...R)', cn1.length === 1 && /R$/.test(cn1[0].invoiceNumber), cn1[0] && cn1[0].invoiceNumber);
  check('S1 credit note amount is negative', cn1.length === 1 && parseFloat(cn1[0].grandTotal) < 0, cn1[0] && cn1[0].grandTotal);
  check('S1 credit note references the original invoice', cn1[0] && cn1[0].creditAgainst === sale1.invoiceNumber, cn1[0] && cn1[0].creditAgainst);

  const pay1 = rows('payments', p => corrOf(p) === RC1 && (p.source) === 'RETAIL_REFUND');
  check('S1 refund settlement recorded (negative)', pay1.length === 1 && parseFloat(pay1[0].amount) < 0, pay1[0] && pay1[0].amount);

  // ---- Scenario 2: partial refund, NO restock -----------------------------
  const sale2 = await retailSaleModel.checkout({ lines: [{ productCode: product.productCode, quantity: 4 }] }, { correlationId: 'RCID-R2-SALE' }, { tenantId: TENANT });
  const before2 = balQty(ITEM);
  const RC2 = 'RCID-R2-REFUND';
  const refund2 = await retailSaleModel.refund(sale2.saleNumber, { correlationId: RC2, lines: [{ itemCode: ITEM, quantity: 1 }], restock: false }, { tenantId: TENANT });
  check('S2 partial -> PARTIALLY_REFUNDED', refund2.status === 'PARTIALLY_REFUNDED', refund2.status);
  check('S2 no restock -> balance unchanged', balQty(ITEM) === before2, `before=${before2} after=${balQty(ITEM)}`);
  const rev2 = rows('stock_transactions', t => corrOf(t) === RC2 && (t.transactionType || t.transaction_type) === 'SALE_REVERSAL').length;
  check('S2 zero SALE_REVERSAL when restock=false', rev2 === 0, rev2);
  const reg2 = rows('register_transactions', r => corrOf(r) === RC2 && (r.transactionType || r.transaction_type) === 'REFUND').length;
  const cn2 = rows('invoices', i => corrOf(i) === RC2 && (i.documentType || i.document_type) === 'CREDIT_NOTE').length;
  check('S2 register REFUND + credit note still issued', reg2 === 1 && cn2 === 1, `${reg2}/${cn2}`);

  // ---- Scenario 3: cannot over-refund -------------------------------------
  // sale2 had 4, refunded 1 -> 3 remaining. Ask for 10 -> clamped to 3.
  const RC3 = 'RCID-R3-REFUND';
  const refund3 = await retailSaleModel.refund(sale2.saleNumber, { correlationId: RC3, lines: [{ itemCode: ITEM, quantity: 10 }], restock: false }, { tenantId: TENANT });
  check('S3 over-request clamped to remaining (now REFUNDED)', refund3.status === 'REFUNDED', refund3.status);
  const refundedQty = (refund3.lines.find(l => l.itemCode === ITEM) || {}).refundedQuantity;
  check('S3 line refundedQuantity == sold qty (4)', parseFloat(refundedQty) === 4, refundedQty);

  // nothing left -> RETAIL_NOTHING_TO_REFUND
  let nothing = false;
  try { await retailSaleModel.refund(sale2.saleNumber, { lines: [{ itemCode: ITEM, quantity: 1 }], restock: false }, { tenantId: TENANT }); }
  catch (e) { nothing = e.code === 'RETAIL_NOTHING_TO_REFUND' || e.code === 'RETAIL_SALE_ALREADY_REFUNDED'; }
  check('S3 further refund rejected (nothing left / already refunded)', nothing);

  // ---- Scenario 4: idempotent replay --------------------------------------
  const sale4 = await retailSaleModel.checkout({ lines: [{ productCode: product.productCode, quantity: 2 }] }, { correlationId: 'RCID-R4-SALE' }, { tenantId: TENANT });
  seedStock(ITEM, 10); // normalize balance for a clean restock replay check
  const RC4 = 'RCID-R4-REFUND';
  const b4 = balQty(ITEM);
  await retailSaleModel.refund(sale4.saleNumber, { correlationId: RC4, restock: true }, { tenantId: TENANT });
  const afterFirst = balQty(ITEM);
  const replay4 = await retailSaleModel.refund(sale4.saleNumber, { correlationId: RC4, restock: true }, { tenantId: TENANT });
  check('S4 replay flagged idempotentReplay', replay4.idempotentReplay === true);
  check('S4 replay did NOT restock twice', balQty(ITEM) === afterFirst, `after=${afterFirst} replay=${balQty(ITEM)}`);
  const rev4 = rows('stock_transactions', t => corrOf(t) === RC4 && (t.transactionType || t.transaction_type) === 'SALE_REVERSAL').length;
  const reg4 = rows('register_transactions', r => corrOf(r) === RC4 && (r.transactionType || r.transaction_type) === 'REFUND').length;
  check('S4 exactly one reversal + one refund register line', rev4 === 1 && reg4 === 1, `${rev4}/${reg4}`);

  // ---- Report -------------------------------------------------------------
  let pass = 0;
  console.log('\n=== Retail Returns & Refunds (Phase 4) ===');
  checks.forEach(([name, ok, extra]) => { if (ok) pass++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? `  [${extra}]` : ''}`); });
  console.log(`\n${pass}/${checks.length} checks passed.`);
  process.exit(pass === checks.length ? 0 : 1);
})().catch(e => { console.error('Harness crashed:', e); process.exit(1); });
