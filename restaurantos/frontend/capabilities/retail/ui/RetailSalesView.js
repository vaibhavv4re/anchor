/**
 * RestaurantOS Capability - Retail Sales history (Retail Phase 1 surface)
 *
 * Read-only ledger of every retail sale the POS has produced (retail_sales).
 * Pick a row to see its lines + financial summary. No writes here - the sale was
 * created by the RetailSale boundary; this is the "what did we sell" screen.
 */

import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { retailSaleModel } from '../../../../../businessos/platform/retail/retailSaleModel.js';

const STATUS_COLORS = { CONFIRMED: '#10b981', PARTIALLY_REFUNDED: '#f59e0b', REFUNDED: '#ef4444', VOID: '#6b7280' };

export class RetailSalesView {
  constructor(deps = {}) {
    this.deps = deps;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
    this.saleModel = deps.retailSaleModel || retailSaleModel;
    this.container = null;
    this.session = null;
    this.tenantId = 'tenant_h0qc7wf';
    this.selected = null;
    this.unsubscribeEvents = [];
    this._subscribed = false;
  }

  render(container, session = null) {
    this.container = container;
    this.session = session || {};
    this.tenantId = this.session.tenantId || this.session.tenant_id || 'tenant_h0qc7wf';
    if (!this._subscribed && this.platformEventBus && typeof this.platformEventBus.subscribe === 'function') {
      this._subscribed = true;
      ['retail:sale:checkout', 'retail:sale:refunded'].forEach(ev => { const u = this.platformEventBus.subscribe(ev, () => { if (this.container) this.update(); }); if (typeof u === 'function') this.unsubscribeEvents.push(u); });
    }
    this.update();
    return container;
  }

  _esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  _inr(n) { return '₹' + (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  _dt(v) { return v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }

  update() {
    if (!this.container) return;
    const sales = this.saleModel.getAllSales(this.tenantId).slice()
      .sort((a, b) => String(b.occurredAt || b.occurred_at || '').localeCompare(String(a.occurredAt || a.occurred_at || '')));
    const sel = this.selected ? this.saleModel.findSale(this.selected, this.tenantId) : null;
    const total = sales.reduce((s, x) => s + (parseFloat(x.grandTotal != null ? x.grandTotal : x.grand_total) || 0), 0);

    this.container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px; height:100%; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:10px;">
          <div>
            <h3 style="margin:0; font-size:1.2rem; font-weight:800;">🧺 Sales</h3>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:3px;">${sales.length} sale(s) · ${this._inr(total)} gross</div>
          </div>
          ${sel ? `<button id="sl-back" style="padding:8px 14px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); color:var(--text-primary); cursor:pointer; font-weight:700;">← All sales</button>` : ''}
        </div>

        ${sel ? this._detail(sel) : this._list(sales)}
      </div>`;
    this._bind();
  }

  _list(sales) {
    return `<div class="card" style="border:1px solid var(--border-subtle); border-radius:12px; overflow:hidden;">
      <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
        <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:left;">
          <th style="padding:9px 14px;">Sale</th><th style="padding:9px 14px;">Invoice</th><th style="padding:9px 14px;">Customer</th><th style="padding:9px 14px;">Operator</th><th style="padding:9px 14px; text-align:right;">Total</th><th style="padding:9px 14px;">When</th><th style="padding:9px 14px;">Status</th>
        </tr></thead>
        <tbody>
          ${sales.slice(0, 100).map(s => {
            const color = STATUS_COLORS[(s.status || 'CONFIRMED').toUpperCase()] || 'var(--text-muted)';
            return `<tr class="sl-row" data-sale="${this._esc(s.saleNumber)}" style="border-top:1px solid var(--border-subtle); cursor:pointer;">
              <td style="padding:8px 14px; font-family:monospace; font-size:0.78rem;">${this._esc(s.saleNumber)}</td>
              <td style="padding:8px 14px; font-family:monospace; font-size:0.76rem; color:var(--text-muted);">${this._esc(s.invoiceNumber || '—')}</td>
              <td style="padding:8px 14px;">${this._esc(s.customerName || 'Walk-in')}</td>
              <td style="padding:8px 14px; color:var(--text-muted);">${this._esc(s.operatorName || '')}</td>
              <td style="padding:8px 14px; text-align:right; font-weight:700;">${this._inr(s.grandTotal != null ? s.grandTotal : s.grand_total)}</td>
              <td style="padding:8px 14px; color:var(--text-muted);">${this._dt(s.occurredAt || s.occurred_at)}</td>
              <td style="padding:8px 14px; color:${color}; font-weight:800; font-size:0.76rem;">${this._esc(s.status)}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="7" style="padding:24px; text-align:center; color:var(--text-muted);">No sales yet.</td></tr>`}
        </tbody>
      </table>
    </div>`;
  }

  _detail(sale) {
    const tt = sale.totals || {};
    const lines = (sale.lines || []).map(l => `<tr style="border-top:1px solid var(--border-subtle);">
      <td style="padding:8px 14px;">${this._esc(l.name)}</td>
      <td style="padding:8px 14px; text-align:right;">${this._esc(l.quantity)}</td>
      <td style="padding:8px 14px; text-align:right;">${this._inr(l.price)}</td>
      <td style="padding:8px 14px; text-align:right; font-weight:700;">${this._inr(l.lineTotal)}</td>
      <td style="padding:8px 14px; text-align:center; color:var(--text-muted); font-size:0.78rem;">${this._esc(l.refundedQuantity && parseFloat(l.refundedQuantity) > 0 ? l.refundedQuantity + ' returned' : '—')}</td>
    </tr>`).join('');
    return `<div class="card" style="border:1px solid var(--border-subtle); border-radius:12px; overflow:hidden;">
      <div style="padding:12px 14px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between;">
        <div><strong>${this._esc(sale.saleNumber)}</strong> <span style="color:var(--text-muted); font-size:0.8rem;">· ${this._esc(sale.invoiceNumber || '')}</span></div>
        <div style="color:var(--text-muted); font-size:0.8rem;">${this._esc(sale.customerName || 'Walk-in')} · ${this._dt(sale.occurredAt || sale.occurred_at)}</div>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
        <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:left;"><th style="padding:8px 14px;">Item</th><th style="padding:8px 14px; text-align:right;">Qty</th><th style="padding:8px 14px; text-align:right;">Price</th><th style="padding:8px 14px; text-align:right;">Line</th><th style="padding:8px 14px; text-align:center;">Returned</th></tr></thead>
        <tbody>${lines}</tbody>
      </table>
      <div style="padding:12px 14px; border-top:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:4px; font-size:0.86rem; align-items:flex-end;">
        <div>Gross: <strong>${this._inr(tt.grossSales)}</strong></div>
        <div>Discount: <strong>${this._inr(tt.discountsTotal)}</strong></div>
        <div>Tax: <strong>${this._inr(tt.totalTax)}</strong></div>
        <div style="font-size:1rem;">Grand total: <strong style="color:#10b981;">${this._inr(sale.grandTotal != null ? sale.grandTotal : sale.grand_total)}</strong></div>
        <div style="color:${STATUS_COLORS[(sale.status || '').toUpperCase()] || 'var(--text-muted)'}; font-weight:800;">${this._esc(sale.status)}</div>
      </div>
    </div>`;
  }

  _bind() {
    const c = this.container; if (!c) return;
    c.querySelectorAll('.sl-row').forEach(row => row.addEventListener('click', () => { this.selected = row.dataset.sale; this.update(); }));
    const back = c.querySelector('#sl-back'); if (back) back.addEventListener('click', () => { this.selected = null; this.update(); });
  }

  destroy() { (this.unsubscribeEvents || []).forEach(u => { if (typeof u === 'function') u(); }); this.unsubscribeEvents = []; }
}
