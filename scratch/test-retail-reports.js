/**
 * Retail Reports projection certification (Retail Phase 5).
 *
 * Pure Node ESM harness over retailProjectionService. It seeds durable rows
 * directly (sales, invoices, payments, register, balances) and asserts each
 * report folds them correctly AND that the retail/restaurant boundary holds -
 * a retail figure never lands in the restaurant bucket and vice-versa.
 */
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { retailProjectionService as S } from '../businessos/platform/retail/retailProjectionService.js';

const TENANT = 'tenant_h0qc7wf';
const LOC = 'LOC-RETAIL';
const NOW = new Date().toISOString();
const DAY = NOW.slice(0, 10);

const checks = [];
const check = (name, pass, extra) => checks.push([name, !!pass, extra]);
const push = (c, o) => offlineStore.appendItem(c, o);

(async () => {
  ['retail_sales', 'invoices', 'payments', 'register_transactions', 'stock_balances', 'inventory', 'cash_registers'].forEach(c => offlineStore.setCollection(c, []));

  // ---- Stock + shared master ----------------------------------------------
  push('inventory', { tenantId: TENANT, itemCode: 'I1', reorder_level: 6 });
  push('inventory', { tenantId: TENANT, itemCode: 'I2', reorder_level: 6 });
  push('stock_balances', { tenantId: TENANT, itemCode: 'I1', locationCode: LOC, quantity: 10, unitCost: 300, valuation: 3000 });
  push('stock_balances', { tenantId: TENANT, itemCode: 'I2', locationCode: LOC, quantity: 0, unitCost: 200, valuation: 0 }); // OUT

  // ---- Sales (today) -------------------------------------------------------
  push('retail_sales', { tenantId: TENANT, saleNumber: 'RS-26-27-00001', status: 'CONFIRMED', grandTotal: 1180, occurredAt: NOW, totals: { grossSales: 1000, discountsTotal: 0, totalTax: 180 }, lines: [{ itemCode: 'I1', quantity: 2, price: 500, lineTotal: 1000 }] });
  push('retail_sales', { tenantId: TENANT, saleNumber: 'RS-26-27-00002', status: 'REFUNDED', grandTotal: 590, occurredAt: NOW, totals: { grossSales: 500, discountsTotal: 0, totalTax: 90 }, lines: [{ itemCode: 'I2', quantity: 1, price: 500, lineTotal: 500 }] });

  // ---- Invoices: 2 RETAIL + 1 RETAIL credit note + 1 RESTAURANT ------------
  push('invoices', { tenantId: TENANT, business_unit: 'RETAIL', invoiceNumber: 'INV/26-27/1001R', grandTotal: 1180, documentType: 'INVOICE', issuedAt: NOW });
  push('invoices', { tenantId: TENANT, business_unit: 'RETAIL', invoiceNumber: 'INV/26-27/1002R', grandTotal: 590, documentType: 'INVOICE', issuedAt: NOW });
  push('invoices', { tenantId: TENANT, business_unit: 'RETAIL', invoiceNumber: 'INV/26-27/1003R', grandTotal: -590, documentType: 'CREDIT_NOTE', issuedAt: NOW }); // excluded
  push('invoices', { tenantId: TENANT, invoiceNumber: 'INV/26-27/2000', grandTotal: 2000, issuedAt: NOW }); // no business_unit => RESTAURANT

  // ---- Payments: RETAIL (cash+upi) + RESTAURANT ----------------------------
  push('payments', { tenantId: TENANT, business_unit: 'RETAIL', paymentMethod: 'CASH', amount: 1180, occurredAt: NOW });
  push('payments', { tenantId: TENANT, business_unit: 'RETAIL', paymentMethod: 'UPI', amount: 590, occurredAt: NOW });
  push('payments', { tenantId: TENANT, paymentMethod: 'CASH', amount: 2000, occurredAt: NOW }); // restaurant

  // ---- Refund register line (today) ---------------------------------------
  push('register_transactions', { tenantId: TENANT, registerId: 'RETAIL-01', business_unit: 'RETAIL', transactionType: 'REFUND', paymentMethod: 'CASH', amount: 590, occurredAt: NOW });

  // ===== Assertions =========================================================
  const sales = S.salesSummary(TENANT, { day: DAY });
  check('sales orders 2', sales.orders === 2, sales.orders);
  check('sales gross 1500 · tax 270', sales.gross === 1500 && sales.tax === 270, `${sales.gross}/${sales.tax}`);
  check('sales net 1770 · avg 885', sales.netSales === 1770 && sales.avgBill === 885, `${sales.netSales}/${sales.avgBill}`);
  check('tender CASH 1180 · UPI 590 · CARD 0', sales.byTender.CASH === 1180 && sales.byTender.UPI === 590 && sales.byTender.CARD === 0, JSON.stringify(sales.byTender));

  const margin = S.marginSummary(TENANT, { day: DAY });
  check('margin revenue 1500', margin.revenue === 1500, margin.revenue);
  check('margin cogs 800 (2*300 + 1*200)', margin.cogs === 800, margin.cogs);
  check('margin 700 · pct ~46.67', margin.margin === 700 && Math.abs(margin.marginPct - 46.67) < 0.01, `${margin.margin}/${margin.marginPct}`);

  const stock = S.stockSummary(TENANT);
  check('stock skus 2 · units 10 · value 3000', stock.skus === 2 && stock.units === 10 && stock.value === 3000, `${stock.skus}/${stock.units}/${stock.value}`);
  check('stock out 1 (I2) · low 0', stock.out === 1 && stock.low === 0, `${stock.out}/${stock.low}`);

  const returns = S.returnsSummary(TENANT, { day: DAY });
  check('returns count 1 · value 590', returns.count === 1 && returns.value === 590, `${returns.count}/${returns.value}`);
  check('returns fully-refunded sales 1', returns.fullyRefundedSales === 1, returns.fullyRefundedSales);

  // ---- Group boundary: retail vs restaurant, credit note excluded ----------
  const group = S.groupDaySummary(TENANT, { day: DAY });
  check('group retail sales 1770 (credit note excluded)', group.retail.sales === 1770 && group.retail.documents === 2, `${group.retail.sales}/${group.retail.documents}`);
  check('group retail collections 1770', group.retail.collections === 1770, group.retail.collections);
  check('group restaurant sales 2000 (untouched by retail)', group.restaurant.sales === 2000 && group.restaurant.documents === 1, `${group.restaurant.sales}/${group.restaurant.documents}`);
  check('group restaurant collections 2000', group.restaurant.collections === 2000, group.restaurant.collections);
  check('group TOTAL sales 3770 = retail + restaurant', group.total.sales === 3770, group.total.sales);
  check('group TOTAL collections 3770', group.total.collections === 3770, group.total.collections);

  // ---- Report --------------------------------------------------------------
  let pass = 0;
  console.log('\n=== Retail Reports projections (Phase 5) ===');
  checks.forEach(([name, ok, extra]) => { if (ok) pass++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? `  [${extra}]` : ''}`); });
  console.log(`\n${pass}/${checks.length} checks passed.`);
  process.exit(pass === checks.length ? 0 : 1);
})().catch(e => { console.error('Harness crashed:', e); process.exit(1); });
