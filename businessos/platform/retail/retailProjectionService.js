/**
 * BusinessOS Platform - Retail Projection Service (Retail Phase 5)
 *
 * Read-only reporting projections over the artifacts the retail engines already
 * write (retail_sales, invoices, payments, register_transactions, stock_balances,
 * cash_registers). Mirrors the managerProjectionService idea: it never mutates,
 * it only folds durable rows into figures the Reports screen can show.
 *
 * Group view keeps the three cost buckets distinct and - crucially - never lets
 * RETAIL revenue bleed into the RESTAURANT panels (and vice-versa): every row is
 * routed by business_unit, and rows with no business_unit are treated as
 * RESTAURANT (the restaurant engines predate the RETAIL tag).
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { cashRegisterModel } from './cashRegisterModel.js';

const RETAIL = 'RETAIL';
const RETAIL_LOCATION = 'LOC-RETAIL';
const RETAIL_REGISTER = 'RETAIL-01';

const num = (v) => parseFloat(v) || 0;
const r2 = (v) => Math.round(num(v) * 100) / 100;
const fld = (o, camel, snake) => (o && o[camel] != null ? o[camel] : (o && o[snake] != null ? o[snake] : undefined));
const buOf = (o) => (fld(o, 'businessUnit', 'business_unit') || 'RESTAURANT');

function tenantRows(collection, tenantId) {
  const all = offlineStore.getCollection(collection) || [];
  if (!tenantId) return all;
  return all.filter(r => !r.tenantId || r.tenantId === tenantId || r.tenant_id === tenantId);
}

function resolveTenant(tenantId) {
  if (tenantId) return tenantId;
  if (typeof sessionStorage !== 'undefined') {
    try { const s = JSON.parse(sessionStorage.getItem('ros_session') || '{}'); return s.tenantId || 'tenant_h0qc7wf'; } catch (_) {}
  }
  return 'tenant_h0qc7wf';
}

/** [fromMs, toMs] for a YYYY-MM-DD day (defaults to today) or an explicit range. */
function dayRange(dayOrOpts) {
  if (dayOrOpts && typeof dayOrOpts === 'object' && (dayOrOpts.from || dayOrOpts.to)) {
    return [dayOrOpts.from ? Date.parse(dayOrOpts.from) : 0, dayOrOpts.to ? Date.parse(dayOrOpts.to) : Infinity];
  }
  const d = (typeof dayOrOpts === 'string' && dayOrOpts) ? dayOrOpts : new Date().toISOString().slice(0, 10);
  const from = new Date(d + 'T00:00:00').getTime();
  const to = new Date(d + 'T23:59:59.999').getTime();
  return [from, to];
}

function atOf(o) {
  return Date.parse(fld(o, 'occurredAt', 'occurred_at') || fld(o, 'issuedAt', 'issued_at') || fld(o, 'createdAt', 'created_at') || 0) || 0;
}
const inRange = (o, from, to) => { const at = atOf(o); return at >= from && at <= to; };

// ---- Sales -----------------------------------------------------------------

export function salesSummary(tenantId = null, opts = {}) {
  const t = resolveTenant(tenantId);
  const [from, to] = dayRange(opts.day || opts);
  const sales = tenantRows('retail_sales', t).filter(s => inRange(s, from, to));
  let gross = 0, discounts = 0, tax = 0, net = 0;
  sales.forEach(s => {
    const tt = s.totals || {};
    gross += num(fld(tt, 'grossSales', 'gross_sales') != null ? fld(tt, 'grossSales', 'gross_sales') : fld(s, 'grandTotal', 'grand_total'));
    discounts += num(fld(tt, 'discountsTotal', 'discounts_total'));
    tax += num(fld(tt, 'totalTax', 'total_tax'));
    net += num(fld(s, 'grandTotal', 'grand_total'));
  });
  return {
    orders: sales.length,
    gross: r2(gross), discounts: r2(discounts), tax: r2(tax), netSales: r2(net),
    avgBill: sales.length ? r2(net / sales.length) : 0,
    byTender: tenderSplit(tenantRows('payments', t).filter(p => buOf(p) === RETAIL && inRange(p, from, to)))
  };
}

function tenderSplit(payments) {
  const out = { CASH: 0, UPI: 0, CARD: 0 };
  payments.forEach(p => {
    const m = String(fld(p, 'paymentMethod', 'payment_method') || 'CASH').toUpperCase();
    const amt = num(fld(p, 'amount', 'amount'));
    if (out[m] != null) out[m] += amt; else out.CASH += amt;
  });
  return { CASH: r2(out.CASH), UPI: r2(out.UPI), CARD: r2(out.CARD) };
}

// ---- Stock (consumer health at LOC-RETAIL) --------------------------------

export function stockSummary(tenantId = null) {
  const t = resolveTenant(tenantId);
  const reorderByItem = new Map();
  tenantRows('inventory', t).forEach(i => {
    const code = fld(i, 'itemCode', 'item_code');
    if (code) reorderByItem.set(code, num(fld(i, 'reorder_level', 'reorderLevel')));
  });
  const balByItem = new Map();
  tenantRows('stock_balances', t)
    .filter(b => fld(b, 'locationCode', 'location_code') === RETAIL_LOCATION)
    .forEach(b => {
      const code = fld(b, 'itemCode', 'item_code');
      if (!code) return;
      const prev = balByItem.get(code) || { qty: 0, value: 0 };
      prev.qty += num(fld(b, 'quantity', 'quantity') != null ? fld(b, 'quantity', 'quantity') : num(fld(b, 'currentStock', 'current_stock')));
      prev.value += num(fld(b, 'valuation', 'valuation'));
      balByItem.set(code, prev);
    });
  let skus = 0, units = 0, value = 0, out = 0, low = 0;
  balByItem.forEach((v, code) => {
    skus++; units += v.qty; value += v.value;
    const reorder = reorderByItem.get(code) || 0;
    if (v.qty <= 0) out++; else if (reorder > 0 && v.qty <= reorder) low++;
  });
  return { skus, units: r2(units), value: r2(value), out, low };
}

// ---- Margin (net revenue at ex-tax vs COGS at cost) ------------------------

export function marginSummary(tenantId = null, opts = {}) {
  const t = resolveTenant(tenantId);
  const [from, to] = dayRange(opts.day || opts);
  const costByItem = new Map();
  tenantRows('stock_balances', t)
    .filter(b => fld(b, 'locationCode', 'location_code') === RETAIL_LOCATION)
    .forEach(b => {
      const code = fld(b, 'itemCode', 'item_code');
      const c = num(fld(b, 'unitCost', 'unit_cost'));
      if (code && c && !costByItem.has(code)) costByItem.set(code, c);
    });
  let revenue = 0, cogs = 0;
  tenantRows('retail_sales', t).filter(s => inRange(s, from, to)).forEach(s => {
    (s.lines || []).forEach(l => {
      revenue += num(l.lineTotal);
      cogs += num(l.quantity) * (costByItem.get(l.itemCode) || 0);
    });
  });
  const margin = revenue - cogs;
  return {
    revenue: r2(revenue), cogs: r2(cogs), margin: r2(margin),
    marginPct: revenue > 0 ? r2((margin / revenue) * 100) : 0
  };
}

// ---- Returns ---------------------------------------------------------------

export function returnsSummary(tenantId = null, opts = {}) {
  const t = resolveTenant(tenantId);
  const [from, to] = dayRange(opts.day || opts);
  const refunds = tenantRows('register_transactions', t)
    .filter(r => fld(r, 'transactionType', 'transaction_type') === 'REFUND' && inRange(r, from, to));
  const value = refunds.reduce((s, r) => s + num(r.amount), 0);
  const fullyRefunded = tenantRows('retail_sales', t).filter(s => fld(s, 'status', 'status') === 'REFUNDED').length;
  return { count: refunds.length, value: r2(value), fullyRefundedSales: fullyRefunded };
}

// ---- Register reconciliation ----------------------------------------------

export function registerReconciliation(tenantId = null) {
  const t = resolveTenant(tenantId);
  const shifts = cashRegisterModel.getRegisters(t, RETAIL_REGISTER);
  const closed = shifts.filter(s => (s.status || 'OPEN').toUpperCase() === 'CLOSED').map(s => ({
    id: s.id, openedAt: fld(s, 'openedAt', 'opened_at'), closedAt: fld(s, 'closedAt', 'closed_at'),
    operatorName: fld(s, 'operatorName', 'operator_name'),
    expectedCash: r2(fld(s, 'expectedClosing', 'expected_closing')),
    physicalClosing: r2(fld(s, 'physicalClosing', 'physical_closing')),
    variance: r2(fld(s, 'variance', 'variance')),
    balanced: Math.abs(num(fld(s, 'variance', 'variance'))) < 0.005
  }));
  const open = shifts.find(s => (s.status || 'OPEN').toUpperCase() === 'OPEN') || null;
  return {
    openShift: open ? cashRegisterModel.getOpenShiftSummary(t, RETAIL_REGISTER) : null,
    closedShifts: closed,
    totalVariance: r2(closed.reduce((s, c) => s + c.variance, 0))
  };
}

// ---- Group day summary (RESTAURANT vs RETAIL, never blended) --------------

export function groupDaySummary(tenantId = null, opts = {}) {
  const t = resolveTenant(tenantId);
  const [from, to] = dayRange(opts.day || opts);

  const bucket = (rows, payRows) => {
    const sales = r2(rows.reduce((s, i) => s + num(fld(i, 'grandTotal', 'grand_total')), 0));
    const collections = r2(payRows.reduce((s, p) => s + num(fld(p, 'amount', 'amount')), 0));
    return { sales, collections, documents: rows.length };
  };

  // Retail revenue = the RETAIL invoices (excludes CREDIT_NOTES, which are the
  // negative refund documents booked against refunds).
  const allInv = tenantRows('invoices', t).filter(i => inRange(i, from, to) && fld(i, 'documentType', 'document_type') !== 'CREDIT_NOTE');
  const allPay = tenantRows('payments', t).filter(p => inRange(p, from, to));

  const retailInv = allInv.filter(i => buOf(i) === RETAIL);
  const restInv = allInv.filter(i => buOf(i) !== RETAIL);

  return {
    retail: bucket(retailInv, allPay.filter(p => buOf(p) === RETAIL)),
    restaurant: bucket(restInv, allPay.filter(p => buOf(p) !== RETAIL)),
    total: {
      sales: r2(bucket(retailInv, []).sales + bucket(restInv, []).sales),
      collections: r2(allPay.reduce((s, p) => s + num(fld(p, 'amount', 'amount')), 0)),
      documents: allInv.length
    }
  };
}

export const retailProjectionService = {
  salesSummary, stockSummary, marginSummary, returnsSummary, registerReconciliation, groupDaySummary
};
