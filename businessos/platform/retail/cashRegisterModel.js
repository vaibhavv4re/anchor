/**
 * BusinessOS Platform - Retail Cash Register + End-of-Day (Retail Phase 3)
 *
 * Owns the RETAIL-01 till lifecycle: open a shift with an opening float, record
 * cash in/out drawers, and close with a physical count that computes the
 * expected-cash vs physical variance. It does NOT invent its own money model -
 * every SALE and REFUND already lands in `register_transactions` via the
 * retailSaleModel boundary, so the register is a READ + a few operator-driven
 * CASH_IN / CASH_OUT movements over those same rows.
 *
 * Tables (already in supabase_schema.sql + supabaseClient formatters):
 *   cash_registers          one row per shift (OPEN / CLOSED + close summary)
 *   register_transactions   SALE / REFUND / CASH_IN / CASH_OUT on RETAIL-01
 *
 * Hard boundary: this is the RETAIL register only (business_unit RETAIL,
 * register_id RETAIL-01). The restaurant register / EOD is untouched.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

const BUSINESS_UNIT = 'RETAIL';
const RETAIL_REGISTER = 'RETAIL-01';

class CashRegisterModel {
  _getDataGateway() {
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) {
      return window.__APP__.platform.dataGateway || null;
    }
    return null;
  }

  _getTenantId(providedTenantId = null) {
    if (providedTenantId) return providedTenantId;
    if (typeof sessionStorage !== 'undefined') {
      try {
        const session = JSON.parse(sessionStorage.getItem('ros_session') || '{}');
        return session.tenantId || 'tenant_h0qc7wf';
      } catch (_) {}
    }
    return 'tenant_h0qc7wf';
  }

  _matchesTenant(rec, tenantId) {
    return !tenantId || rec.tenantId === tenantId || rec.tenant_id === tenantId;
  }

  _cloudCreate(collection, record) {
    const dg = this._getDataGateway();
    if (dg && typeof dg.create === 'function') {
      Promise.resolve(dg.create(collection, record)).catch(e =>
        console.warn(`[cashRegisterModel] Cloud ${collection} sync error:`, e.message));
    }
  }

  _cloudUpdate(collection, id, patch) {
    const dg = this._getDataGateway();
    if (dg && id && typeof dg.update === 'function') {
      Promise.resolve(dg.update(collection, id, patch)).catch(e =>
        console.warn(`[cashRegisterModel] Cloud ${collection} update error:`, e.message));
    }
  }

  // ---- Reads ---------------------------------------------------------------

  getRegisters(tenantId = null, registerId = RETAIL_REGISTER) {
    const t = this._getTenantId(tenantId);
    return (offlineStore.getCollection('cash_registers') || [])
      .filter(r => this._matchesTenant(r, t) && (r.registerId || r.register_id) === registerId)
      .sort((a, b) => String(b.openedAt || b.opened_at || '').localeCompare(String(a.openedAt || a.opened_at || '')));
  }

  getCurrentRegister(tenantId = null, registerId = RETAIL_REGISTER) {
    return this.getRegisters(tenantId, registerId).find(r => (r.status || 'OPEN').toUpperCase() === 'OPEN') || null;
  }

  _txns(tenantId, registerId) {
    const t = this._getTenantId(tenantId);
    return (offlineStore.getCollection('register_transactions') || [])
      .filter(r => this._matchesTenant(r, t) && (r.registerId || r.register_id) === registerId);
  }

  // ---- Shift lifecycle -----------------------------------------------------

  /** Open the RETAIL till with an opening float. Idempotent: an already-OPEN
   *  shift is returned rather than stacking a second open register. */
  openRegister(opts = {}, session = null) {
    const tenantId = this._getTenantId(opts.tenantId || (session && session.tenantId));
    const registerId = opts.registerId || RETAIL_REGISTER;
    const existing = this.getCurrentRegister(tenantId, registerId);
    if (existing) return { ...existing, idempotentReplay: true };

    const operatorName = opts.operatorName || (session && (session.employeeName || session.name)) || 'Retail Manager';
    const now = new Date().toISOString();
    const rec = {
      id: 'cr-' + Math.random().toString(36).substring(2, 9),
      tenantId, tenant_id: tenantId,
      registerId, register_id: registerId,
      businessUnit: BUSINESS_UNIT, business_unit: BUSINESS_UNIT,
      status: 'OPEN', operatorName, operator_name: operatorName,
      openingBalance: parseFloat(opts.openingBalance) || 0, opening_balance: parseFloat(opts.openingBalance) || 0,
      cashIn: 0, cashIn_total: 0, cash_out: 0, refunds: 0,
      expectedClosing: 0, physicalClosing: 0,
      openedAt: now, opened_at: now, closedAt: null, closed_at: null,
      createdAt: now
    };
    offlineStore.appendItem('cash_registers', rec);
    this._cloudCreate('cash_registers', rec);
    platformEventBus.publish('retail:register:opened', { registerId, openingBalance: rec.openingBalance, operatorName, timestamp: now });
    return rec;
  }

  /** Book a drawer movement. `direction` = 'IN' (float top-up) or 'OUT' (pay-out). */
  _recordCash(direction, opts = {}, session = null) {
    const tenantId = this._getTenantId(opts.tenantId || (session && session.tenantId));
    const registerId = opts.registerId || RETAIL_REGISTER;
    const open = this.getCurrentRegister(tenantId, registerId);
    if (!open) { const e = new Error('NO_OPEN_REGISTER'); e.code = 'NO_OPEN_REGISTER'; throw e; }

    const amount = Math.abs(parseFloat(opts.amount) || 0);
    if (amount <= 0) { const e = new Error('INVALID_AMOUNT'); e.code = 'INVALID_AMOUNT'; throw e; }

    const operatorName = opts.operatorName || (session && (session.employeeName || session.name)) || open.operatorName || 'Retail Manager';
    const note = opts.note || opts.reason || '';
    const occurredAt = new Date().toISOString();
    const correlationId = 'RCID-' + (direction === 'IN' ? 'CI' : 'CO') + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

    const txn = {
      id: 'rt-' + Math.random().toString(36).substring(2, 9),
      tenantId, tenant_id: tenantId, registerId, register_id: registerId,
      businessUnit: BUSINESS_UNIT, business_unit: BUSINESS_UNIT,
      transactionType: direction === 'IN' ? 'CASH_IN' : 'CASH_OUT',
      transaction_type: direction === 'IN' ? 'CASH_IN' : 'CASH_OUT',
      paymentMethod: 'CASH', payment_method: 'CASH', amount,
      referenceType: 'REGISTER', reference_type: 'REGISTER', referenceId: open.id,
      correlationId, correlation_id: correlationId,
      performedBy: operatorName, performed_by: operatorName, note,
      occurredAt, occurred_at: occurredAt, createdAt: occurredAt
    };
    offlineStore.appendItem('register_transactions', txn);
    this._cloudCreate('register_transactions', txn);

    // Keep the durable running fields on the shift row in step (display only;
    // the authoritative figures are always recomputed from the transaction log).
    const field = direction === 'IN' ? 'cashIn' : 'cashOut';
    const patch = { ...open };
    patch[field] = Math.round(((parseFloat(open[field]) || 0) + amount) * 100) / 100;
    patch.updatedAt = occurredAt;
    this._patchRegister(patch);

    platformEventBus.publish('retail:register:cash', { direction, amount, note, registerId, timestamp: occurredAt });
    return { txn, register: patch };
  }

  recordCashIn(opts = {}, session = null) { return this._recordCash('IN', opts, session); }
  recordCashOut(opts = {}, session = null) { return this._recordCash('OUT', opts, session); }

  _patchRegister(updated) {
    const all = offlineStore.getCollection('cash_registers') || [];
    const idx = all.findIndex(r => r.id === updated.id);
    if (idx >= 0) all[idx] = updated; else all.push(updated);
    offlineStore.setCollection('cash_registers', all);
    this._cloudUpdate('cash_registers', updated.id, updated);
  }

  /**
   * Reconcile a shift against its transaction log within [openedAt, until].
   * Expected CASH counts only cash-method movements (digital takings live in
   * the bank, not the drawer). Returns totals by tender for the EOD screen.
   */
  computeShiftSummary(register, tenantId = null, registerId = RETAIL_REGISTER, until = null) {
    const t = this._getTenantId(tenantId);
    const from = String(register.openedAt || register.opened_at || '');
    const to = String(until || register.closedAt || register.closed_at || new Date().toISOString());
    const within = (r) => {
      const at = String(r.occurredAt || r.occurred_at || r.createdAt || '');
      return at >= from && at <= to;
    };
    const txns = this._txns(t, registerId).filter(within);

    let cashSales = 0, digitalSales = 0, totalSales = 0;
    let cashRefunds = 0, digitalRefunds = 0, totalRefunds = 0;
    let cashIn = 0, cashOut = 0;
    const salesCount = { SALE: 0, REFUND: 0, CASH_IN: 0, CASH_OUT: 0 };

    txns.forEach(r => {
      const type = (r.transactionType || r.transaction_type || '').toUpperCase();
      const amt = parseFloat(r.amount) || 0;
      const isCash = String(r.paymentMethod || r.payment_method || '').toUpperCase() === 'CASH';
      if (type === 'SALE') {
        totalSales += amt; salesCount.SALE++;
        if (isCash) cashSales += amt; else digitalSales += amt;
      } else if (type === 'REFUND') {
        totalRefunds += amt; salesCount.REFUND++;
        if (isCash) cashRefunds += amt; else digitalRefunds += amt;
      } else if (type === 'CASH_IN') { cashIn += amt; salesCount.CASH_IN++; }
      else if (type === 'CASH_OUT') { cashOut += amt; salesCount.CASH_OUT++; }
    });

    const r2 = (n) => Math.round(n * 100) / 100;
    const openingBalance = parseFloat(register.openingBalance != null ? register.openingBalance : register.opening_balance) || 0;
    const expectedCash = r2(openingBalance + cashSales - cashRefunds + cashIn - cashOut);

    return {
      registerId, status: register.status || 'OPEN',
      openingBalance: r2(openingBalance),
      salesCount: salesCount.SALE, refundCount: salesCount.REFUND,
      totalSales: r2(totalSales), cashSales: r2(cashSales), digitalSales: r2(digitalSales),
      totalRefunds: r2(totalRefunds), cashRefunds: r2(cashRefunds), digitalRefunds: r2(digitalRefunds),
      cashIn: r2(cashIn), cashOut: r2(cashOut),
      netCollections: r2(totalSales - totalRefunds),
      expectedCash
    };
  }

  /** Live summary of the currently-open shift (null if no shift is open). */
  getOpenShiftSummary(tenantId = null, registerId = RETAIL_REGISTER) {
    const open = this.getCurrentRegister(tenantId, registerId);
    if (!open) return null;
    return { register: open, summary: this.computeShiftSummary(open, tenantId, registerId) };
  }

  /** Close the shift with a physical cash count, freezing expected + variance. */
  closeRegister(opts = {}, session = null) {
    const tenantId = this._getTenantId(opts.tenantId || (session && session.tenantId));
    const registerId = opts.registerId || RETAIL_REGISTER;
    const open = this.getCurrentRegister(tenantId, registerId);
    if (!open) { const e = new Error('NO_OPEN_REGISTER'); e.code = 'NO_OPEN_REGISTER'; throw e; }

    const operatorName = opts.operatorName || (session && (session.employeeName || session.name)) || open.operatorName || 'Retail Manager';
    const closedAt = new Date().toISOString();
    const summary = this.computeShiftSummary(open, tenantId, registerId, closedAt);
    const physicalClosing = parseFloat(opts.physicalClosing) || 0;
    const variance = Math.round((physicalClosing - summary.expectedCash) * 100) / 100;

    const updated = {
      ...open, status: 'CLOSED', operatorName,
      cashIn: summary.cashIn, cashOut: summary.cashOut, refunds: summary.totalRefunds,
      expectedClosing: summary.expectedCash, physicalClosing, variance,
      summary, closedAt, closed_at: closedAt, updatedAt: closedAt
    };
    this._patchRegister(updated);

    platformEventBus.publish('retail:register:closed', {
      registerId, expectedCash: summary.expectedCash, physicalClosing, variance,
      balanced: variance === 0, operatorName, timestamp: closedAt
    });
    return { register: updated, summary, physicalClosing, variance, balanced: variance === 0 };
  }
}

export const cashRegisterModel = new CashRegisterModel();
