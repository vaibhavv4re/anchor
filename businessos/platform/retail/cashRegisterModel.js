/**
 * BusinessOS Platform - Shared Cash Register + End-of-Day Engine
 *
 * Owns a cash-drawer (till) lifecycle for ANY business unit. It was originally
 * the RETAIL-01 register; it is now parameterized by `businessUnit + registerId`
 * so the Cashier workspace (CASHIER-01 / RESTAURANT) and the Retail workspace
 * (RETAIL-01 / RETAIL) share ONE engine, ONE pair of tables, and ONE audit model.
 *
 * It does NOT invent its own money model - every SALE / REFUND already lands in
 * `register_transactions` (retail via the sale boundary; restaurant cash via the
 * payment boundary), so the register is a READ + a few operator-driven CASH_IN /
 * CASH_OUT movements over those same rows.
 *
 * Tables (supabase_schema.sql + supabaseClient formatters):
 *   cash_registers          one row per shift (OPEN / CLOSED + close summary)
 *   register_transactions   SALE / REFUND / CASH_IN / CASH_OUT on a register
 *
 * Controls layered on top of the base math:
 *   - Opening carryover: the last locked closing becomes the next expected opening.
 *   - Opening count-verify: the operator counts actual cash; a mismatch (when the
 *     caller enforces it) requires an explanation.
 *   - Unsettled-bill close gate: refuses to close while bills are still open.
 *   - Closing variance: physical count vs expected; a mismatch (when enforced)
 *     requires a logged reason.
 * Enforcement flags are opt-in (defaults preserve the original retail behavior)
 * so existing callsites and the register unit tests stay green.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { sessionAuditModel } from '../session/sessionAuditModel.js';

const DEFAULT_BUSINESS_UNIT = 'RETAIL';
const DEFAULT_REGISTER = 'RETAIL-01';

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

  /** Tolerant field reader: camel, then snake, then the hydrated data JSONB. */
  _field(rec, camel, snake) {
    if (rec == null) return undefined;
    if (rec[camel] !== undefined && rec[camel] !== null) return rec[camel];
    if (snake && rec[snake] !== undefined && rec[snake] !== null) return rec[snake];
    const d = rec.data;
    if (d && typeof d === 'object' && d[camel] !== undefined && d[camel] !== null) return d[camel];
    return undefined;
  }

  _ctx(opts = {}, session = null) {
    const businessUnit = (opts.businessUnit || opts.business_unit
      || (session && session.businessUnit) || DEFAULT_BUSINESS_UNIT).toUpperCase();
    const registerId = opts.registerId || opts.register_id || DEFAULT_REGISTER;
    return { businessUnit, registerId };
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

  _audit(register, eventType, description, actorName, tenantId, metadata = {}) {
    try {
      sessionAuditModel.logEvent({
        sessionId: `cash_register:${register.id}`,
        eventType,
        actorId: actorName,
        actorName,
        actorRole: (register.businessUnit || register.business_unit) === 'RESTAURANT' ? 'CASHIER' : 'MANAGER',
        description,
        metadata: { registerId: register.registerId || register.register_id, ...metadata },
        tenantId
      });
    } catch (_) {
      // Audit is best-effort; the register row is the source of truth.
    }
  }

  // ---- Reads ---------------------------------------------------------------

  getRegisters(tenantId = null, registerId = DEFAULT_REGISTER, businessUnit = null) {
    const t = this._getTenantId(tenantId);
    return (offlineStore.getCollection('cash_registers') || [])
      .filter(r => this._matchesTenant(r, t)
        && this._field(r, 'registerId', 'register_id') === registerId
        && (!businessUnit || this._field(r, 'businessUnit', 'business_unit') === businessUnit))
      .sort((a, b) => String(this._field(b, 'openedAt', 'opened_at') || '').localeCompare(String(this._field(a, 'openedAt', 'opened_at') || '')));
  }

  getCurrentRegister(tenantId = null, registerId = DEFAULT_REGISTER, businessUnit = null) {
    return this.getRegisters(tenantId, registerId, businessUnit).find(r => (this._field(r, 'status') || 'OPEN').toUpperCase() === 'OPEN') || null;
  }

  _txns(tenantId, registerId, businessUnit = null) {
    const t = this._getTenantId(tenantId);
    return (offlineStore.getCollection('register_transactions') || [])
      .filter(r => this._matchesTenant(r, t)
        && this._field(r, 'registerId', 'register_id') === registerId
        && (!businessUnit || this._field(r, 'businessUnit', 'business_unit') === businessUnit));
  }

  /**
   * The cash the drawer is EXPECTED to start with, carried forward from the most
   * recent CLOSED shift on this register (the locked closing of yesterday becomes
   * the opening we verify against today). Null when no prior shift is closed.
   */
  getCarryoverOpening(businessUnit = DEFAULT_BUSINESS_UNIT, registerId = DEFAULT_REGISTER, tenantId = null) {
    const t = this._getTenantId(tenantId);
    const closed = this.getRegisters(t, registerId, businessUnit)
      .filter(r => (this._field(r, 'status') || '').toUpperCase() === 'CLOSED')
      .sort((a, b) => String(this._field(b, 'closedAt', 'closed_at') || '').localeCompare(String(this._field(a, 'closedAt', 'closed_at') || '')));
    if (!closed.length) return { expectedOpening: null, previousRegisterId: null };
    const last = closed[0];
    const closing = parseFloat(this._field(last, 'physicalClosing', 'physical_closing'));
    const fallback = parseFloat(this._field(last, 'expectedClosing', 'expected_closing')) || 0;
    return {
      expectedOpening: Number.isFinite(closing) ? closing : fallback,
      previousRegisterId: this._field(last, 'id') || null
    };
  }

  // ---- Shift lifecycle -----------------------------------------------------

  /**
   * Open a till with a float. Idempotent: an already-OPEN shift on the same
   * register is returned rather than stacking a second open register.
   * opts: { businessUnit, registerId, tenantId, operatorName, openingBalance,
   *         expectedOpening, openingCounted, openingVarianceReason,
   *         enforceOpeningReason }
   */
  openRegister(opts = {}, session = null) {
    const tenantId = this._getTenantId(opts.tenantId || (session && session.tenantId));
    const { businessUnit, registerId } = this._ctx(opts, session);
    const existing = this.getCurrentRegister(tenantId, registerId, businessUnit);
    if (existing) return { ...existing, idempotentReplay: true };

    const carry = this.getCarryoverOpening(businessUnit, registerId, tenantId);
    // expectedOpening = what the drawer SHOULD hold at open (carried from last
    // close, unless the caller overrides it). openingBalance = the actual float
    // physically placed (what the drawer math starts from).
    const expectedOpening = opts.expectedOpening != null
      ? (parseFloat(opts.expectedOpening) || 0)
      : (carry.expectedOpening != null ? carry.expectedOpening : (parseFloat(opts.openingBalance) || 0));
    const openingCounted = opts.openingCounted != null ? (parseFloat(opts.openingCounted) || 0) : null;
    const openingBalance = openingCounted != null ? openingCounted : (parseFloat(opts.openingBalance) || expectedOpening || 0);
    const openingVariance = openingCounted != null ? Math.round((openingCounted - expectedOpening) * 100) / 100 : 0;

    if (opts.enforceOpeningReason && openingVariance !== 0 && !opts.openingVarianceReason) {
      const e = new Error('OPENING_VARIANCE_REASON_REQUIRED');
      e.code = 'OPENING_VARIANCE_REASON_REQUIRED';
      e.variance = openingVariance;
      throw e;
    }

    const operatorName = opts.operatorName || (session && (session.employeeName || session.name)) || (businessUnit === 'RESTAURANT' ? 'Cashier' : 'Retail Manager');
    const now = new Date().toISOString();
    const rec = {
      id: 'cr-' + Math.random().toString(36).substring(2, 9),
      tenantId, tenant_id: tenantId,
      registerId, register_id: registerId,
      businessUnit, business_unit: businessUnit,
      status: 'OPEN', operatorName, operator_name: operatorName,
      openingBalance: Math.round(openingBalance * 100) / 100, opening_balance: Math.round(openingBalance * 100) / 100,
      expectedOpening: Math.round(expectedOpening * 100) / 100,
      openingCounted, openingVariance, openingVarianceReason: opts.openingVarianceReason || '',
      previousRegisterId: carry.previousRegisterId,
      cashIn: 0, cash_in: 0, cashOut: 0, cash_out: 0, refunds: 0,
      expectedClosing: 0, physicalClosing: 0, closingBalance: 0, variance: 0,
      openedAt: now, opened_at: now, closedAt: null, closed_at: null,
      createdAt: now
    };
    offlineStore.appendItem('cash_registers', rec);
    this._cloudCreate('cash_registers', rec);

    this._audit(rec, 'SHIFT_OPEN', `${registerId} opened with float ₹${rec.openingBalance} (expected ₹${rec.expectedOpening})`, operatorName, tenantId, { openingBalance: rec.openingBalance, expectedOpening: rec.expectedOpening });
    if (openingVariance !== 0) {
      this._audit(rec, 'OPENING_VARIANCE', `Opening count off by ₹${openingVariance}: ${opts.openingVarianceReason || '(no reason)'}`, operatorName, tenantId, { openingVariance, reason: opts.openingVarianceReason || '' });
    }

    platformEventBus.publish('register:opened', { businessUnit, registerId, openingBalance: rec.openingBalance, expectedOpening: rec.expectedOpening, operatorName, timestamp: now });
    if (businessUnit === 'RETAIL') {
      platformEventBus.publish('retail:register:opened', { registerId, openingBalance: rec.openingBalance, operatorName, timestamp: now });
    }
    return rec;
  }

  /** Book a drawer movement. `direction` = 'IN' (float top-up) or 'OUT' (pay-out). */
  _recordCash(direction, opts = {}, session = null) {
    const tenantId = this._getTenantId(opts.tenantId || (session && session.tenantId));
    const { businessUnit, registerId } = this._ctx(opts, session);
    const open = this.getCurrentRegister(tenantId, registerId, businessUnit);
    if (!open) { const e = new Error('NO_OPEN_REGISTER'); e.code = 'NO_OPEN_REGISTER'; throw e; }

    const amount = Math.abs(parseFloat(opts.amount) || 0);
    if (amount <= 0) { const e = new Error('INVALID_AMOUNT'); e.code = 'INVALID_AMOUNT'; throw e; }

    const operatorName = opts.operatorName || (session && (session.employeeName || session.name)) || open.operatorName || 'Operator';
    const note = opts.note || opts.reason || '';
    const occurredAt = new Date().toISOString();
    const correlationId = 'RCID-' + (direction === 'IN' ? 'CI' : 'CO') + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

    const txn = {
      id: 'rt-' + Math.random().toString(36).substring(2, 9),
      tenantId, tenant_id: tenantId, registerId, register_id: registerId,
      businessUnit, business_unit: businessUnit,
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
    const patch = { ...open };
    if (direction === 'IN') { patch.cashIn = Math.round(((parseFloat(this._field(open, 'cashIn', 'cash_in')) || 0) + amount) * 100) / 100; patch.cash_in = patch.cashIn; }
    else { patch.cashOut = Math.round(((parseFloat(this._field(open, 'cashOut', 'cash_out')) || 0) + amount) * 100) / 100; patch.cash_out = patch.cashOut; }
    patch.updatedAt = occurredAt;
    this._patchRegister(patch);

    this._audit(open, direction === 'IN' ? 'CASH_IN' : 'CASH_OUT', `Cash ${direction} ₹${amount}${note ? ` — ${note}` : ''}`, operatorName, tenantId, { amount, note });
    platformEventBus.publish('register:cash', { businessUnit, registerId, direction, amount, note, timestamp: occurredAt });
    if (businessUnit === 'RETAIL') {
      platformEventBus.publish('retail:register:cash', { direction, amount, note, registerId, timestamp: occurredAt });
    }
    return { txn, register: patch };
  }

  recordCashIn(opts = {}, session = null) { return this._recordCash('IN', opts, session); }
  recordCashOut(opts = {}, session = null) { return this._recordCash('OUT', opts, session); }

  /**
   * Book a SALE register line for a settled payment. Used by the restaurant
   * payment boundary so cash tenders move the CASHIER-01 drawer exactly the way
   * retail sales move RETAIL-01. No-op when the register is not OPEN (a payment
   * outside a shift is simply not reconciled into a drawer). Idempotent on
   * (correlationId + SALE), so a replayed settlement never double-books the till.
   */
  registerSale(opts = {}, session = null) {
    const tenantId = this._getTenantId(opts.tenantId || (session && session.tenantId));
    const { businessUnit, registerId } = this._ctx(opts, session);
    const open = this.getCurrentRegister(tenantId, registerId, businessUnit);
    if (!open) return null;

    const amount = Math.abs(parseFloat(opts.amount) || 0);
    if (amount <= 0) return null;

    const correlationId = opts.correlationId || opts.correlation_id
      || ('RCID-SALE-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase());
    const dup = this._txns(tenantId, registerId, businessUnit)
      .find(t => String(this._field(t, 'correlationId', 'correlation_id') || '') === String(correlationId)
        && String(this._field(t, 'transactionType', 'transaction_type') || '').toUpperCase() === 'SALE');
    if (dup) return dup;

    const paymentMethod = String(opts.paymentMethod || opts.payment_method || 'CASH').toUpperCase();
    const operatorName = opts.performedBy || opts.operatorName || (session && (session.employeeName || session.name)) || open.operatorName || 'Operator';
    const referenceId = opts.referenceId || opts.invoiceNumber || opts.invoice_number || '';
    const occurredAt = new Date().toISOString();
    const txn = {
      id: 'rt-' + Math.random().toString(36).substring(2, 9),
      tenantId, tenant_id: tenantId, registerId, register_id: registerId,
      businessUnit, business_unit: businessUnit,
      transactionType: 'SALE', transaction_type: 'SALE',
      paymentMethod, payment_method: paymentMethod, amount,
      referenceType: opts.referenceType || 'INVOICE', reference_type: opts.referenceType || 'INVOICE',
      referenceId, reference_id: referenceId,
      correlationId, correlation_id: correlationId,
      performedBy: operatorName, performed_by: operatorName,
      occurredAt, occurred_at: occurredAt, createdAt: occurredAt
    };
    offlineStore.appendItem('register_transactions', txn);
    this._cloudCreate('register_transactions', txn);
    platformEventBus.publish('register:cash', { businessUnit, registerId, direction: 'SALE', amount, paymentMethod, timestamp: occurredAt });
    return txn;
  }

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
  computeShiftSummary(register, tenantId = null, registerId = DEFAULT_REGISTER, until = null) {
    const t = this._getTenantId(tenantId);
    const businessUnit = this._field(register, 'businessUnit', 'business_unit') || null;
    const from = String(this._field(register, 'openedAt', 'opened_at') || '');
    const to = String(until || this._field(register, 'closedAt', 'closed_at') || new Date().toISOString());
    const within = (r) => {
      const at = String(this._field(r, 'occurredAt', 'occurred_at') || this._field(r, 'createdAt') || '');
      return at >= from && at <= to;
    };
    const txns = this._txns(t, registerId, businessUnit).filter(within);

    let cashSales = 0, digitalSales = 0, totalSales = 0;
    let cashRefunds = 0, digitalRefunds = 0, totalRefunds = 0;
    let cashIn = 0, cashOut = 0;
    const salesCount = { SALE: 0, REFUND: 0, CASH_IN: 0, CASH_OUT: 0 };

    txns.forEach(r => {
      const type = String(this._field(r, 'transactionType', 'transaction_type') || '').toUpperCase();
      const amt = parseFloat(this._field(r, 'amount')) || 0;
      const isCash = String(this._field(r, 'paymentMethod', 'payment_method') || '').toUpperCase() === 'CASH';
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
    const openingBalance = parseFloat(this._field(register, 'openingBalance', 'opening_balance')) || 0;
    const expectedCash = r2(openingBalance + cashSales - cashRefunds + cashIn - cashOut);

    return {
      registerId, businessUnit, status: this._field(register, 'status') || 'OPEN',
      openingBalance: r2(openingBalance),
      expectedOpening: r2(parseFloat(this._field(register, 'expectedOpening')) || openingBalance),
      salesCount: salesCount.SALE, refundCount: salesCount.REFUND,
      totalSales: r2(totalSales), cashSales: r2(cashSales), digitalSales: r2(digitalSales),
      totalRefunds: r2(totalRefunds), cashRefunds: r2(cashRefunds), digitalRefunds: r2(digitalRefunds),
      cashIn: r2(cashIn), cashOut: r2(cashOut),
      netCollections: r2(totalSales - totalRefunds),
      expectedCash
    };
  }

  /** Live summary of the currently-open shift (null if no shift is open). */
  getOpenShiftSummary(tenantId = null, registerId = DEFAULT_REGISTER, businessUnit = null) {
    const open = this.getCurrentRegister(tenantId, registerId, businessUnit);
    if (!open) return null;
    return { register: open, summary: this.computeShiftSummary(open, tenantId, registerId) };
  }

  /**
   * Close the shift with a physical cash count, freezing expected + variance.
   * opts: { businessUnit, registerId, tenantId, operatorName, physicalClosing,
   *         unsettledCount, varianceReason, enforceVarianceReason }
   * Throws PENDING_BILLS while bills remain open; throws VARIANCE_REASON_REQUIRED
   * on a drawer mismatch when the caller enforces an explanation.
   */
  closeRegister(opts = {}, session = null) {
    const tenantId = this._getTenantId(opts.tenantId || (session && session.tenantId));
    const { businessUnit, registerId } = this._ctx(opts, session);
    const open = this.getCurrentRegister(tenantId, registerId, businessUnit);
    if (!open) { const e = new Error('NO_OPEN_REGISTER'); e.code = 'NO_OPEN_REGISTER'; throw e; }

    // Gate: refuse to close while bills are still unsettled for this window.
    const unsettled = parseInt(opts.unsettledCount, 10) || 0;
    if (unsettled > 0) {
      const e = new Error('PENDING_BILLS');
      e.code = 'PENDING_BILLS';
      e.unsettled = unsettled;
      throw e;
    }

    const operatorName = opts.operatorName || (session && (session.employeeName || session.name)) || open.operatorName || 'Operator';
    const closedAt = new Date().toISOString();
    const summary = this.computeShiftSummary(open, tenantId, registerId, closedAt);
    const physicalClosing = Math.round((parseFloat(opts.physicalClosing) || 0) * 100) / 100;
    const variance = Math.round((physicalClosing - summary.expectedCash) * 100) / 100;

    // Gate: a drawer mismatch must be explained (when the caller enforces it).
    if (opts.enforceVarianceReason && variance !== 0 && !(opts.varianceReason && String(opts.varianceReason).trim())) {
      const e = new Error('VARIANCE_REASON_REQUIRED');
      e.code = 'VARIANCE_REASON_REQUIRED';
      e.variance = variance;
      e.expectedCash = summary.expectedCash;
      throw e;
    }

    const updated = {
      ...open, status: 'CLOSED', operatorName,
      cashIn: summary.cashIn, cash_in: summary.cashIn,
      cashOut: summary.cashOut, cash_out: summary.cashOut,
      refunds: summary.totalRefunds,
      expectedClosing: summary.expectedCash, physicalClosing, closingBalance: physicalClosing,
      variance, varianceReason: opts.varianceReason || '', varianceBy: operatorName, varianceAt: closedAt,
      summary, closedAt, closed_at: closedAt, updatedAt: closedAt
    };
    this._patchRegister(updated);

    this._audit(open, 'SHIFT_CLOSE', `${registerId} closed. Expected ₹${summary.expectedCash} · counted ₹${physicalClosing}`, operatorName, tenantId, { expectedCash: summary.expectedCash, physicalClosing, variance });
    if (variance !== 0) {
      this._audit(open, 'CLOSING_VARIANCE', `Closing variance ₹${variance}: ${opts.varianceReason || '(no reason)'}`, operatorName, tenantId, { variance, reason: opts.varianceReason || '' });
    }

    platformEventBus.publish('register:closed', {
      businessUnit, registerId, expectedCash: summary.expectedCash, physicalClosing, variance,
      balanced: variance === 0, operatorName, timestamp: closedAt
    });
    if (businessUnit === 'RETAIL') {
      platformEventBus.publish('retail:register:closed', {
        registerId, expectedCash: summary.expectedCash, physicalClosing, variance,
        balanced: variance === 0, operatorName, timestamp: closedAt
      });
    }
    return { register: updated, summary, physicalClosing, variance, balanced: variance === 0 };
  }
}

export const cashRegisterModel = new CashRegisterModel();
