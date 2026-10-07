/**
 * Capability Common UI - Shared Cash Register / Cash Box Panel
 *
 * One reusable till surface over the shared `cashRegisterModel` engine, keyed by
 * `businessUnit + registerId`. It powers BOTH the Retail workspace register
 * (RETAIL-01 / RETAIL) and the Cashier workspace shift tab (CASHIER-01 /
 * RESTAURANT) so the open → verify → live-drawer → gate → close-with-variance
 * lifecycle behaves identically in both places.
 *
 * Controls surfaced (all backed by the engine, no logic duplicated here):
 *   - Opening carryover: expected opening auto-filled from the last locked close.
 *   - Opening count-verify: operator counts actual cash; a mismatch needs a reason.
 *   - Live expected drawer (cash-tender-only reconciliation).
 *   - Unsettled-bill close gate (via `cashBoxService` or an injected provider).
 *   - End-of-day close with a physical count + mandatory variance explanation.
 *
 * It is presentational + wiring only: money math and durability live in the
 * platform models, so this component is safe to mount inside any host view and
 * tear down on re-render.
 */

import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { cashRegisterModel } from '../../../../../businessos/platform/retail/cashRegisterModel.js';
import { cashBoxService } from '../../../../../businessos/platform/cashbox/cashBoxService.js';
import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';

const TYPE_COLORS = { SALE: '#10b981', REFUND: '#ef4444', CASH_IN: '#3b82f6', CASH_OUT: '#f59e0b' };

const DEFAULT_LABELS = {
  title: '💵 Cash Register',
  subtitle: 'Open the till, manage cash movements, and reconcile at end-of-day. Every sale and refund already posts here automatically.',
  operatorFallback: 'Operator',
  openButton: 'Open Register',
  closeButton: 'End of Day · Close Drawer'
};

export class CashRegisterPanel {
  constructor(deps = {}) {
    this.platformEventBus = deps.platformEventBus || platformEventBus;
    this.registerModel = deps.cashRegisterModel || cashRegisterModel;
    this.cashBoxService = deps.cashBoxService || cashBoxService;

    this.businessUnit = String(deps.businessUnit || 'RETAIL').toUpperCase();
    this.registerId = deps.registerId || 'RETAIL-01';
    this.tenantId = deps.tenantId || 'tenant_h0qc7wf';
    this.session = deps.session || {};
    this.labels = { ...DEFAULT_LABELS, ...(deps.labels || {}) };

    // Optional injected unsettled-bill provider (returns an array). When absent
    // the panel falls back to cashBoxService for this unit/window.
    this.unsettledProvider = typeof deps.unsettledProvider === 'function' ? deps.unsettledProvider : null;

    // Form state (preserved across self re-renders so typing is not lost).
    this.expectedOpening = null;
    this.openingBalance = '';
    this.openingCounted = '';
    this.openingVarianceReason = '';
    this.cashAmount = '';
    this.cashNote = '';
    this.physicalClosing = '';
    this.varianceReason = '';
    this.notice = null;

    this.container = null;
    this.unsubscribeEvents = [];
    this._subscribed = false;
  }

  // ---- helpers -------------------------------------------------------------

  _esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  _inr(n) { return '₹' + (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  _dt(v) { return v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }

  _operatorName() {
    const s = this.session || {};
    return s.employeeName || s.name || s.receivedByName || this.labels.operatorFallback;
  }

  /** Shift window for the unsettled-bill gate (from open time to now). */
  _openWindow(openRegister) {
    const from = openRegister ? (openRegister.openedAt || openRegister.opened_at || null) : null;
    return { from, to: new Date().toISOString() };
  }

  _getUnsettled(openRegister) {
    try {
      if (this.unsettledProvider) return this.unsettledProvider({ businessUnit: this.businessUnit, registerId: this.registerId, tenantId: this.tenantId, openRegister }) || [];
      return this.cashBoxService.getUnsettledBills(this.businessUnit, this.tenantId, this._openWindow(openRegister));
    } catch (_) {
      return [];
    }
  }

  // ---- lifecycle -----------------------------------------------------------

  render(container, session = null) {
    this.container = container;
    if (session) this.session = session;
    this.tenantId = this.session.tenantId || this.session.tenant_id || this.tenantId;

    if (!this._subscribed && this.platformEventBus && typeof this.platformEventBus.subscribe === 'function') {
      this._subscribed = true;
      const mine = (p) => !p || ((!p.businessUnit || p.businessUnit === this.businessUnit) && (!p.registerId || p.registerId === this.registerId));
      ['register:opened', 'register:cash', 'register:closed'].forEach(ev => {
        const u = this.platformEventBus.subscribe(ev, (payload) => { if (this.container && mine(payload)) this.update(); });
        if (typeof u === 'function') this.unsubscribeEvents.push(u);
      });
      // Retail sales/refunds post into the same ledger via the sale boundary.
      if (this.businessUnit === 'RETAIL') {
        ['retail:sale:checkout', 'retail:sale:refunded'].forEach(ev => {
          const u = this.platformEventBus.subscribe(ev, () => { if (this.container) this.update(); });
          if (typeof u === 'function') this.unsubscribeEvents.push(u);
        });
      }
    }

    this.update();
    return container;
  }

  destroy() {
    (this.unsubscribeEvents || []).forEach(u => { if (typeof u === 'function') u(); });
    this.unsubscribeEvents = [];
    this._subscribed = false;
    this.container = null;
  }

  // ---- actions -------------------------------------------------------------

  _open() {
    this.notice = null;
    try {
      const counted = this.openingCounted !== '' ? parseFloat(this.openingCounted) : null;
      const res = this.registerModel.openRegister({
        businessUnit: this.businessUnit,
        registerId: this.registerId,
        tenantId: this.tenantId,
        operatorName: this._operatorName(),
        expectedOpening: this.expectedOpening != null ? this.expectedOpening : undefined,
        openingBalance: parseFloat(this.openingBalance) || this.expectedOpening || 0,
        openingCounted: counted,
        openingVarianceReason: this.openingVarianceReason,
        enforceOpeningReason: true
      }, this.session);
      this.notice = res.idempotentReplay
        ? `ℹ️ A shift is already open on ${this.registerId}.`
        : `✅ Shift opened with float ${this._inr(res.openingBalance)}.`;
      this.openingBalance = ''; this.openingCounted = ''; this.openingVarianceReason = '';
    } catch (e) {
      this.notice = e.code === 'OPENING_VARIANCE_REASON_REQUIRED'
        ? `⚠️ Counted cash is ${this._inr(Math.abs(e.variance))} off the expected opening. Enter a reason before opening.`
        : '⚠️ ' + (e.message || 'Failed to open register.');
    }
    this.update();
  }

  _cash(direction) {
    this.notice = null;
    try {
      const fn = direction === 'IN' ? 'recordCashIn' : 'recordCashOut';
      this.registerModel[fn]({
        businessUnit: this.businessUnit,
        registerId: this.registerId,
        tenantId: this.tenantId,
        amount: parseFloat(this.cashAmount) || 0,
        note: this.cashNote,
        operatorName: this._operatorName()
      }, this.session);
      this.notice = `✅ ${direction === 'IN' ? 'Cash In' : 'Cash Out'} ${this._inr(this.cashAmount)} recorded.`;
      this.cashAmount = ''; this.cashNote = '';
    } catch (e) {
      this.notice = '⚠️ ' + (e.code === 'NO_OPEN_REGISTER' ? 'Open the register first.'
        : e.code === 'INVALID_AMOUNT' ? 'Enter an amount greater than 0.'
          : (e.message || 'Failed.'));
    }
    this.update();
  }

  _close() {
    this.notice = null;
    const open = this.registerModel.getCurrentRegister(this.tenantId, this.registerId, this.businessUnit);
    const unsettled = this._getUnsettled(open);
    try {
      const res = this.registerModel.closeRegister({
        businessUnit: this.businessUnit,
        registerId: this.registerId,
        tenantId: this.tenantId,
        operatorName: this._operatorName(),
        physicalClosing: parseFloat(this.physicalClosing) || 0,
        unsettledCount: unsettled.length,
        varianceReason: this.varianceReason,
        enforceVarianceReason: true
      }, this.session);
      this.notice = `✅ Shift closed. Expected ${this._inr(res.summary.expectedCash)} · counted ${this._inr(res.physicalClosing)} · variance ${this._inr(res.variance)} (${res.balanced ? 'BALANCED' : 'OUT'}).`;
      this.physicalClosing = ''; this.varianceReason = '';
    } catch (e) {
      if (e.code === 'PENDING_BILLS') this.notice = `🚩 Cannot close: ${e.unsettled} unsettled bill(s) still open for this shift. Settle them first.`;
      else if (e.code === 'VARIANCE_REASON_REQUIRED') this.notice = `⚠️ Drawer is ${this._inr(Math.abs(e.variance))} ${e.variance < 0 ? 'short' : 'over'}. Enter a variance explanation before closing.`;
      else if (e.code === 'NO_OPEN_REGISTER') this.notice = '⚠️ No open shift to close.';
      else this.notice = '⚠️ ' + (e.message || 'Failed to close.');
    }
    this.update();
  }

  // ---- render --------------------------------------------------------------

  update() {
    if (!this.container) return;
    const open = this.registerModel.getCurrentRegister(this.tenantId, this.registerId, this.businessUnit);
    // Auto-carry the expected opening into the open form (what should be in the drawer).
    if (!open) {
      const carry = this.registerModel.getCarryoverOpening(this.businessUnit, this.registerId, this.tenantId);
      this.expectedOpening = carry.expectedOpening;
    }

    const openShift = open ? { register: open, summary: this.registerModel.computeShiftSummary(open, this.tenantId, this.registerId) } : null;
    const unsettled = open ? this._getUnsettled(open) : [];

    const txns = (offlineStore.getCollection('register_transactions') || [])
      .filter(r => (r.tenantId || r.tenant_id || this.tenantId) === this.tenantId
        && (r.registerId || r.register_id) === this.registerId
        && (!r.businessUnit || !this.businessUnit || (r.businessUnit || r.business_unit) === this.businessUnit))
      .sort((a, b) => String(b.occurredAt || b.occurred_at || b.createdAt || '').localeCompare(String(a.occurredAt || a.occurred_at || a.createdAt || '')))
      .slice(0, 30);
    const closed = this.registerModel.getRegisters(this.tenantId, this.registerId, this.businessUnit)
      .filter(r => String(r.status || 'OPEN').toUpperCase() === 'CLOSED').slice(0, 10);

    this.container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px; height:100%; overflow-y:auto;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">${this._esc(this.labels.title)} · ${this._esc(this.registerId)}</h3>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:3px;">${this._esc(this.labels.subtitle)}</div>
        </div>

        ${this.notice ? `<div style="padding:10px 14px; border-radius:8px; background:rgba(59,130,246,0.12); color:var(--accent-primary); font-size:0.85rem;">${this._esc(this.notice)}</div>` : ''}

        ${openShift ? this._renderOpenShift(openShift, unsettled) : this._renderClosed()}

        <div class="card" style="border:1px solid var(--border-subtle); border-radius:12px; overflow:hidden;">
          <div style="padding:12px 14px; font-weight:800; font-size:0.9rem; border-bottom:1px solid var(--border-subtle);">Register activity <span style="font-weight:500; color:var(--text-muted); font-size:0.75rem;">(SALE / REFUND auto-posted · CASH IN/OUT operator movements)</span></div>
          <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
            <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:left;">
              <th style="padding:9px 14px;">Type</th><th style="padding:9px 14px;">Tender</th><th style="padding:9px 14px; text-align:right;">Amount</th><th style="padding:9px 14px;">Ref</th><th style="padding:9px 14px;">When</th><th style="padding:9px 14px;">By</th>
            </tr></thead>
            <tbody>
              ${txns.map(r => {
                const type = String(r.transactionType || r.transaction_type || '').toUpperCase();
                const color = TYPE_COLORS[type] || 'var(--text-muted)';
                return `<tr style="border-top:1px solid var(--border-subtle);">
                  <td style="padding:8px 14px; color:${color}; font-weight:800; font-size:0.78rem;">${this._esc(type)}</td>
                  <td style="padding:8px 14px; color:var(--text-secondary);">${this._esc(r.paymentMethod || r.payment_method || '')}</td>
                  <td style="padding:8px 14px; text-align:right; font-weight:700;">${this._inr(r.amount)}</td>
                  <td style="padding:8px 14px; font-family:monospace; font-size:0.76rem; color:var(--text-muted);">${this._esc(r.referenceId || r.reference_id || '—')}</td>
                  <td style="padding:8px 14px; color:var(--text-muted);">${this._dt(r.occurredAt || r.occurred_at || r.createdAt)}</td>
                  <td style="padding:8px 14px; color:var(--text-muted);">${this._esc(r.performedBy || r.performed_by || '')}</td>
                </tr>`;
              }).join('') || `<tr><td colspan="6" style="padding:24px; text-align:center; color:var(--text-muted);">No register activity yet.</td></tr>`}
            </tbody>
          </table>
        </div>

        <div class="card" style="border:1px solid var(--border-subtle); border-radius:12px; overflow:hidden;">
          <div style="padding:12px 14px; font-weight:800; font-size:0.9rem; border-bottom:1px solid var(--border-subtle);">Closed shifts</div>
          <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
            <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:left;">
              <th style="padding:9px 14px;">Opened</th><th style="padding:9px 14px;">Closed</th><th style="padding:9px 14px; text-align:right;">Expected</th><th style="padding:9px 14px; text-align:right;">Physical</th><th style="padding:9px 14px; text-align:right;">Variance</th><th style="padding:9px 14px;">Result</th>
            </tr></thead>
            <tbody>
              ${closed.map(s => {
                const variance = parseFloat(s.variance) || 0;
                const balanced = Math.abs(variance) < 0.005;
                return `<tr style="border-top:1px solid var(--border-subtle);">
                  <td style="padding:8px 14px; color:var(--text-muted);">${this._dt(s.openedAt || s.opened_at)}</td>
                  <td style="padding:8px 14px; color:var(--text-muted);">${this._dt(s.closedAt || s.closed_at)}</td>
                  <td style="padding:8px 14px; text-align:right;">${this._inr(s.expectedClosing)}</td>
                  <td style="padding:8px 14px; text-align:right;">${this._inr(s.physicalClosing)}</td>
                  <td style="padding:8px 14px; text-align:right; font-weight:700; color:${balanced ? '#10b981' : '#ef4444'};">${this._inr(variance)}</td>
                  <td style="padding:8px 14px; color:${balanced ? '#10b981' : '#ef4444'}; font-weight:800; font-size:0.78rem;">${balanced ? 'BALANCED' : 'OUT'}</td>
                </tr>`;
              }).join('') || `<tr><td colspan="6" style="padding:24px; text-align:center; color:var(--text-muted);">No closed shifts yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    this._bind();
  }

  _stat(label, value, color) {
    return `<div style="padding:10px 12px; border-radius:10px; background:var(--bg-surface-2); min-width:120px;">
      <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; font-weight:800;">${label}</div>
      <div style="font-size:1.02rem; font-weight:800; color:${color || 'var(--text-primary)'}; margin-top:2px;">${value}</div>
    </div>`;
  }

  _renderClosed() {
    const expected = this.expectedOpening != null ? this.expectedOpening : 0;
    const hasCarry = this.expectedOpening != null;
    return `
      <div class="card" style="padding:16px; border:1px solid var(--border-subtle); border-radius:12px; background:var(--bg-surface); display:flex; flex-direction:column; gap:12px;">
        <div style="font-weight:800;">Register is CLOSED — open a new shift</div>
        <div style="font-size:0.8rem; color:var(--text-muted);">
          ${hasCarry
            ? `Carried from the last locked close, the drawer is <strong style="color:var(--text-primary);">expected to hold ${this._inr(expected)}</strong>. Verify the cash in hand and enter the count.`
            : `No prior shift to carry over. Set the opening float you are placing in the drawer.`}
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <input id="cp-opening" type="number" min="0" step="1" placeholder="Opening float (default ${this._inr(expected)})" value="${this._esc(this.openingBalance)}" style="flex:1; min-width:170px; padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);"/>
          <input id="cp-counted" type="number" min="0" step="0.01" placeholder="Actual cash counted" value="${this._esc(this.openingCounted)}" style="flex:1; min-width:170px; padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);"/>
        </div>
        <div id="cp-open-reason-wrap" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <input id="cp-openreason" type="text" placeholder="Reason for opening mismatch (required if count ≠ expected)" value="${this._esc(this.openingVarianceReason)}" style="flex:2; min-width:240px; padding:9px 11px; border-radius:8px; border:1px solid var(--status-warning); background:var(--bg-base); color:var(--text-primary);"/>
        </div>
        <div style="display:flex; justify-content:flex-end;">
          <button id="cp-open" style="padding:9px 20px; border-radius:8px; border:none; background:#10b981; color:#fff; font-weight:800; cursor:pointer;">${this._esc(this.labels.openButton)}</button>
        </div>
      </div>`;
  }

  _renderOpenShift({ register, summary }, unsettled) {
    const gate = unsettled && unsettled.length > 0;
    return `
      ${gate ? this._renderUnsettledBanner(unsettled) : ''}
      <div class="card" style="padding:16px; border:1px solid var(--accent-primary); border-radius:12px; background:var(--bg-surface); display:flex; flex-direction:column; gap:14px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="width:10px; height:10px; border-radius:50%; background:#10b981; display:inline-block;"></span>
          <div style="font-weight:800;">Shift OPEN · ${this._esc(register.operatorName || this._operatorName())} · since ${this._dt(register.openedAt || register.opened_at)}</div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          ${this._stat('Opening float', this._inr(summary.openingBalance))}
          ${this._stat('Cash sales', this._inr(summary.cashSales), '#10b981')}
          ${this._stat('Digital sales', this._inr(summary.digitalSales))}
          ${this._stat('Refunds', this._inr(summary.totalRefunds), '#ef4444')}
          ${this._stat('Cash In', this._inr(summary.cashIn), '#3b82f6')}
          ${this._stat('Cash Out', this._inr(summary.cashOut), '#f59e0b')}
          ${this._stat('Expected in drawer', this._inr(summary.expectedCash), 'var(--accent-primary)')}
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; border-top:1px solid var(--border-subtle); padding-top:12px;">
          <input id="cp-amount" type="number" min="0" step="1" placeholder="Amount" value="${this._esc(this.cashAmount)}" style="flex:1; min-width:120px; padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);"/>
          <input id="cp-note" type="text" placeholder="Reason / note" value="${this._esc(this.cashNote)}" style="flex:2; min-width:160px; padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);"/>
          <button id="cp-cashin" style="padding:9px 16px; border-radius:8px; border:none; background:#3b82f6; color:#fff; font-weight:800; cursor:pointer;">Cash In</button>
          <button id="cp-cashout" style="padding:9px 16px; border-radius:8px; border:none; background:#f59e0b; color:#fff; font-weight:800; cursor:pointer;">Cash Out</button>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; border-top:1px solid var(--border-subtle); padding-top:12px;">
          <input id="cp-physical" type="number" min="0" step="0.01" placeholder="Physical cash counted (expected ${this._inr(summary.expectedCash)})" value="${this._esc(this.physicalClosing)}" style="flex:1; min-width:200px; padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);"/>
          <input id="cp-variance" type="text" placeholder="Variance explanation (required if count ≠ expected)" value="${this._esc(this.varianceReason)}" style="flex:2; min-width:200px; padding:9px 11px; border-radius:8px; border:1px solid var(--status-warning); background:var(--bg-base); color:var(--text-primary);"/>
          <button id="cp-close" style="padding:9px 20px; border-radius:8px; border:none; background:${gate ? 'var(--border-subtle)' : 'var(--accent-primary)'}; color:#fff; font-weight:800; cursor:${gate ? 'not-allowed' : 'pointer'}; opacity:${gate ? '0.6' : '1'};" ${gate ? 'title="Settle all bills before closing"' : ''}>${this._esc(this.labels.closeButton)}</button>
        </div>
      </div>`;
  }

  _renderUnsettledBanner(unsettled) {
    const total = unsettled.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
    return `
      <div style="padding:12px 14px; border-radius:10px; background:rgba(239,68,68,0.12); border:1px solid #ef4444; display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px; color:#ef4444; font-weight:800; font-size:0.9rem;">
          <span>🚩</span><span>${unsettled.length} unsettled bill${unsettled.length > 1 ? 's' : ''} (₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}) — settle all bills before closing the drawer.</span>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${unsettled.slice(0, 12).map(b => `<span style="padding:4px 8px; border-radius:6px; background:var(--bg-surface-2); font-size:0.75rem; color:var(--text-secondary); font-family:monospace;">${this._esc(b.referenceId || b.saleNumber || b.sessionId)} · ${this._inr(b.amount)}</span>`).join('')}
          ${unsettled.length > 12 ? `<span style="font-size:0.75rem; color:var(--text-muted);">+${unsettled.length - 12} more…</span>` : ''}
        </div>
      </div>`;
  }

  _bind() {
    const c = this.container; if (!c) return;
    const on = (sel, ev, fn) => { const el = c.querySelector(sel); if (el) el.addEventListener(ev, fn); };
    on('#cp-opening', 'input', e => { this.openingBalance = e.target.value; });
    on('#cp-counted', 'input', e => { this.openingCounted = e.target.value; });
    on('#cp-openreason', 'input', e => { this.openingVarianceReason = e.target.value; });
    on('#cp-open', 'click', () => this._open());
    on('#cp-amount', 'input', e => { this.cashAmount = e.target.value; });
    on('#cp-note', 'input', e => { this.cashNote = e.target.value; });
    on('#cp-cashin', 'click', () => this._cash('IN'));
    on('#cp-cashout', 'click', () => this._cash('OUT'));
    on('#cp-physical', 'input', e => { this.physicalClosing = e.target.value; });
    on('#cp-variance', 'input', e => { this.varianceReason = e.target.value; });
    on('#cp-close', 'click', () => this._close());
  }
}
