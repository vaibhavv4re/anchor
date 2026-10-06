/**
 * RestaurantOS Capability - Retail Cash Register & End-of-Day (Retail Phase 3)
 *
 * Operator surface over cashRegisterModel for the RETAIL-01 till: open a shift
 * with a float, record Cash In / Cash Out drawer movements, watch the live
 * expected-cash reconciliation (built from the SALE / REFUND the POS and Returns
 * screens already book), and close with a physical count that freezes the
 * variance. Restaurant register / EOD is a separate, untouched concern.
 */

import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { cashRegisterModel } from '../../../../../businessos/platform/retail/cashRegisterModel.js';
import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';

const REGISTER = 'RETAIL-01';
const TYPE_COLORS = { SALE: '#10b981', REFUND: '#ef4444', CASH_IN: '#3b82f6', CASH_OUT: '#f59e0b' };

export class RetailRegisterView {
  constructor(deps = {}) {
    this.deps = deps;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
    this.registerModel = deps.cashRegisterModel || cashRegisterModel;
    this.container = null;
    this.session = null;
    this.tenantId = 'tenant_h0qc7wf';
    this.openingBalance = '';
    this.cashAmount = '';
    this.cashNote = '';
    this.physicalClosing = '';
    this.notice = null;
    this.unsubscribeEvents = [];
    this._subscribed = false;
  }

  render(container, session = null) {
    this.container = container;
    this.session = session || {};
    this.tenantId = this.session.tenantId || this.session.tenant_id || 'tenant_h0qc7wf';
    if (!this._subscribed && this.platformEventBus && typeof this.platformEventBus.subscribe === 'function') {
      this._subscribed = true;
      ['retail:register:opened', 'retail:register:cash', 'retail:register:closed', 'retail:sale:checkout', 'retail:sale:refunded']
        .forEach(ev => { const u = this.platformEventBus.subscribe(ev, () => { if (this.container) this.update(); }); if (typeof u === 'function') this.unsubscribeEvents.push(u); });
    }
    this.update();
    return container;
  }

  _esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  _inr(n) { return '₹' + (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  _dt(v) { return v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }

  _open() {
    this.notice = null;
    try {
      const res = this.registerModel.openRegister({ openingBalance: parseFloat(this.openingBalance) || 0, operatorName: this.session.employeeName || this.session.name, tenantId: this.tenantId }, this.session);
      this.notice = res.idempotentReplay ? 'ℹ️ A shift is already open on RETAIL-01.' : `✅ Shift opened with float ${this._inr(res.openingBalance)}.`;
      this.openingBalance = '';
    } catch (e) { this.notice = '⚠️ ' + (e.message || 'Failed to open register.'); }
    this.update();
  }

  _cash(direction) {
    this.notice = null;
    try {
      const fn = direction === 'IN' ? 'recordCashIn' : 'recordCashOut';
      this.registerModel[fn]({ amount: parseFloat(this.cashAmount) || 0, note: this.cashNote, operatorName: this.session.employeeName || this.session.name, tenantId: this.tenantId }, this.session);
      this.notice = `✅ ${direction === 'IN' ? 'Cash In' : 'Cash Out'} ${this._inr(this.cashAmount)} recorded.`;
      this.cashAmount = ''; this.cashNote = '';
    } catch (e) { this.notice = '⚠️ ' + (e.code === 'NO_OPEN_REGISTER' ? 'Open the register first.' : (e.code === 'INVALID_AMOUNT' ? 'Enter an amount greater than 0.' : (e.message || 'Failed.'))); }
    this.update();
  }

  _close() {
    this.notice = null;
    try {
      const res = this.registerModel.closeRegister({ physicalClosing: parseFloat(this.physicalClosing) || 0, operatorName: this.session.employeeName || this.session.name, tenantId: this.tenantId }, this.session);
      this.notice = `✅ Shift closed. Expected ${this._inr(res.summary.expectedCash)} · counted ${this._inr(res.physicalClosing)} · variance ${this._inr(res.variance)} (${res.balanced ? 'BALANCED' : 'OUT'}).`;
      this.physicalClosing = '';
    } catch (e) { this.notice = '⚠️ ' + (e.code === 'NO_OPEN_REGISTER' ? 'No open shift to close.' : (e.message || 'Failed to close.')); }
    this.update();
  }

  update() {
    if (!this.container) return;
    const openShift = this.registerModel.getOpenShiftSummary(this.tenantId, REGISTER);
    const txns = (offlineStore.getCollection('register_transactions') || [])
      .filter(r => (r.tenantId || r.tenant_id || this.tenantId) === this.tenantId && (r.registerId || r.register_id) === REGISTER)
      .sort((a, b) => String(b.occurredAt || b.occurred_at || b.createdAt || '').localeCompare(String(a.occurredAt || a.occurred_at || a.createdAt || '')))
      .slice(0, 30);
    const closed = this.registerModel.getRegisters(this.tenantId, REGISTER).filter(r => (r.status || 'OPEN').toUpperCase() === 'CLOSED').slice(0, 10);

    this.container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px; height:100%; overflow-y:auto;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">💵 Cash Register · ${REGISTER}</h3>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:3px;">Every POS sale and refund already lands here automatically. This is the till: open it, manage cash, and reconcile at end-of-day.</div>
        </div>

        ${this.notice ? `<div style="padding:10px 14px; border-radius:8px; background:rgba(59,130,246,0.12); color:var(--accent-primary); font-size:0.85rem;">${this._esc(this.notice)}</div>` : ''}

        ${openShift ? this._renderOpenShift(openShift) : this._renderClosed()}

        <div class="card" style="border:1px solid var(--border-subtle); border-radius:12px; overflow:hidden;">
          <div style="padding:12px 14px; font-weight:800; font-size:0.9rem; border-bottom:1px solid var(--border-subtle);">Register activity <span style="font-weight:500; color:var(--text-muted); font-size:0.75rem;">(SALE / REFUND auto-posted · CASH IN/OUT operator movements)</span></div>
          <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
            <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:left;">
              <th style="padding:9px 14px;">Type</th><th style="padding:9px 14px;">Tender</th><th style="padding:9px 14px; text-align:right;">Amount</th><th style="padding:9px 14px;">Ref</th><th style="padding:9px 14px;">When</th><th style="padding:9px 14px;">By</th>
            </tr></thead>
            <tbody>
              ${txns.map(r => {
                const type = (r.transactionType || r.transaction_type || '').toUpperCase();
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

  _renderOpenShift({ register, summary }) {
    const cashLike = summary.expectedCash;
    return `
      <div class="card" style="padding:16px; border:1px solid var(--accent-primary); border-radius:12px; background:var(--bg-surface); display:flex; flex-direction:column; gap:14px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="width:10px; height:10px; border-radius:50%; background:#10b981; display:inline-block;"></span>
          <div style="font-weight:800;">Shift OPEN · ${this._esc(register.operatorName || 'Retail Manager')} · since ${this._dt(register.openedAt || register.opened_at)}</div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          ${this._stat('Opening float', this._inr(summary.openingBalance))}
          ${this._stat('Cash sales', this._inr(summary.cashSales), '#10b981')}
          ${this._stat('Digital sales', this._inr(summary.digitalSales))}
          ${this._stat('Refunds', this._inr(summary.totalRefunds), '#ef4444')}
          ${this._stat('Cash In', this._inr(summary.cashIn), '#3b82f6')}
          ${this._stat('Cash Out', this._inr(summary.cashOut), '#f59e0b')}
          ${this._stat('Expected in drawer', this._inr(cashLike), 'var(--accent-primary)')}
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; border-top:1px solid var(--border-subtle); padding-top:12px;">
          <input id="rg-amount" type="number" min="0" step="1" placeholder="Amount" value="${this._esc(this.cashAmount)}" style="flex:1; min-width:120px; padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);"/>
          <input id="rg-note" type="text" placeholder="Reason / note" value="${this._esc(this.cashNote)}" style="flex:2; min-width:160px; padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);"/>
          <button id="rg-cashin" style="padding:9px 16px; border-radius:8px; border:none; background:#3b82f6; color:#fff; font-weight:800; cursor:pointer;">Cash In</button>
          <button id="rg-cashout" style="padding:9px 16px; border-radius:8px; border:none; background:#f59e0b; color:#fff; font-weight:800; cursor:pointer;">Cash Out</button>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; border-top:1px solid var(--border-subtle); padding-top:12px;">
          <input id="rg-physical" type="number" min="0" step="0.01" placeholder="Physical cash counted" value="${this._esc(this.physicalClosing)}" style="flex:1; min-width:160px; padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);"/>
          <button id="rg-close" style="padding:9px 20px; border-radius:8px; border:none; background:var(--accent-primary); color:#fff; font-weight:800; cursor:pointer;">End of Day · Close</button>
        </div>
      </div>`;
  }

  _renderClosed() {
    return `
      <div class="card" style="padding:16px; border:1px solid var(--border-subtle); border-radius:12px; background:var(--bg-surface);">
        <div style="font-weight:800; margin-bottom:10px;">Register is CLOSED</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <input id="rg-opening" type="number" min="0" step="1" placeholder="Opening float (e.g. 2000)" value="${this._esc(this.openingBalance)}" style="flex:1; min-width:180px; padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);"/>
          <button id="rg-open" style="padding:9px 20px; border-radius:8px; border:none; background:#10b981; color:#fff; font-weight:800; cursor:pointer;">Open Register</button>
        </div>
      </div>`;
  }

  _bind() {
    const c = this.container; if (!c) return;
    const on = (sel, ev, fn) => { const el = c.querySelector(sel); if (el) el.addEventListener(ev, fn); };
    on('#rg-opening', 'input', e => { this.openingBalance = e.target.value; });
    on('#rg-open', 'click', () => this._open());
    on('#rg-amount', 'input', e => { this.cashAmount = e.target.value; });
    on('#rg-note', 'input', e => { this.cashNote = e.target.value; });
    on('#rg-cashin', 'click', () => this._cash('IN'));
    on('#rg-cashout', 'click', () => this._cash('OUT'));
    on('#rg-physical', 'input', e => { this.physicalClosing = e.target.value; });
    on('#rg-close', 'click', () => this._close());
  }

  destroy() {
    (this.unsubscribeEvents || []).forEach(u => { if (typeof u === 'function') u(); });
    this.unsubscribeEvents = [];
  }
}
