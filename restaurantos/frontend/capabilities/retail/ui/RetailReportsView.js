/**
 * RestaurantOS Capability - Retail Reports (Retail Phase 5)
 *
 * Read-only reporting over the retailProjectionService. One day selector drives
 * every panel: Sales, Stock, Margin, Returns, Register Reconciliation and the
 * Group Day Summary (RESTAURANT vs RETAIL side-by-side, then TOTAL GROUP). The
 * boundary the plan insists on is enforced in the service - rows are bucketed by
 * business_unit, so retail figures never bleed into the restaurant columns.
 */

import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { retailProjectionService } from '../../../../../businessos/platform/retail/retailProjectionService.js';

export class RetailReportsView {
  constructor(deps = {}) {
    this.deps = deps;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
    this.container = null;
    this.session = null;
    this.tenantId = 'tenant_h0qc7wf';
    this.day = new Date().toISOString().slice(0, 10);
    this.unsubscribeEvents = [];
    this._subscribed = false;
  }

  render(container, session = null) {
    this.container = container;
    this.session = session || {};
    this.tenantId = this.session.tenantId || this.session.tenant_id || 'tenant_h0qc7wf';
    if (!this._subscribed && this.platformEventBus && typeof this.platformEventBus.subscribe === 'function') {
      this._subscribed = true;
      ['retail:sale:checkout', 'retail:sale:refunded', 'retail:register:closed'].forEach(ev => {
        const u = this.platformEventBus.subscribe(ev, () => { if (this.container) this.update(); });
        if (typeof u === 'function') this.unsubscribeEvents.push(u);
      });
    }
    this.update();
    return container;
  }

  _esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  _inr(n) { return '₹' + (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  _card(title, rows, accent) {
    return `<div class="card" style="border:1px solid var(--border-subtle); border-left:4px solid ${accent || 'var(--accent-primary)'}; border-radius:12px; background:var(--bg-surface); padding:14px 16px; flex:1; min-width:240px;">
      <div style="font-weight:800; font-size:0.92rem; margin-bottom:10px;">${title}</div>
      <div style="display:flex; flex-direction:column; gap:6px;">${rows.map(([k, v, c]) => `<div style="display:flex; justify-content:space-between; font-size:0.86rem;"><span style="color:var(--text-muted);">${k}</span><strong style="color:${c || 'var(--text-primary)'};">${v}</strong></div>`).join('')}</div>
    </div>`;
  }

  update() {
    if (!this.container) return;
    const s = retailProjectionService;
    const sales = s.salesSummary(this.tenantId, { day: this.day });
    const stock = s.stockSummary(this.tenantId);
    const margin = s.marginSummary(this.tenantId, { day: this.day });
    const returns = s.returnsSummary(this.tenantId, { day: this.day });
    const reg = s.registerReconciliation(this.tenantId);
    const group = s.groupDaySummary(this.tenantId, { day: this.day });

    const open = reg.openShift && reg.openShift.summary;

    this.container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px; height:100%; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:12px;">
          <div>
            <h3 style="margin:0; font-size:1.2rem; font-weight:800;">📊 Retail Reports</h3>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:3px;">Live figures folded from sales, invoices, payments, register and stock - nothing is mocked.</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.8rem; color:var(--text-muted);">Day</label>
            <input id="rp-day" type="date" value="${this._esc(this.day)}" style="padding:8px 10px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);"/>
          </div>
        </div>

        <div style="display:flex; gap:14px; flex-wrap:wrap;">
          ${this._card('🧾 Sales', [
            ['Orders', sales.orders],
            ['Gross', this._inr(sales.gross)],
            ['Discounts', this._inr(sales.discounts)],
            ['Tax', this._inr(sales.tax)],
            ['Net sales', this._inr(sales.netSales), '#10b981'],
            ['Avg bill', this._inr(sales.avgBill)]
          ], '#10b981')}
          ${this._card('💳 By tender', [
            ['Cash', this._inr(sales.byTender.CASH)],
            ['UPI', this._inr(sales.byTender.UPI)],
            ['Card', this._inr(sales.byTender.CARD)]
          ], '#3b82f6')}
          ${this._card('📦 Stock · LOC-RETAIL', [
            ['SKUs', stock.skus],
            ['On-hand units', stock.units],
            ['Stock value', this._inr(stock.value)],
            ['Out of stock', stock.out, stock.out ? '#ef4444' : 'var(--text-primary)'],
            ['Low stock', stock.low, stock.low ? '#f59e0b' : 'var(--text-primary)']
          ], '#f59e0b')}
          ${this._card('📈 Margin', [
            ['Revenue (ex-tax)', this._inr(margin.revenue)],
            ['COGS (at cost)', this._inr(margin.cogs)],
            ['Gross margin', this._inr(margin.margin), '#10b981'],
            ['Margin %', margin.marginPct + '%']
          ], '#8b5cf6')}
          ${this._card('↩️ Returns', [
            ['Refunds today', returns.count],
            ['Refund value', this._inr(returns.value), '#ef4444'],
            ['Fully refunded sales', returns.fullyRefundedSales]
          ], '#ef4444')}
        </div>

        <div class="card" style="border:1px solid var(--border-subtle); border-radius:12px; background:var(--bg-surface); padding:16px;">
          <div style="font-weight:800; font-size:0.92rem; margin-bottom:10px;">💵 Register Reconciliation</div>
          ${open ? `<div style="display:flex; gap:16px; flex-wrap:wrap; font-size:0.86rem; margin-bottom:12px;">
              <div><span style="color:var(--text-muted);">Open shift · expected cash</span> <strong>${this._inr(open.expectedCash)}</strong></div>
              <div><span style="color:var(--text-muted);">Cash sales</span> <strong>${this._inr(open.cashSales)}</strong></div>
              <div><span style="color:var(--text-muted);">Refunds</span> <strong>${this._inr(open.totalRefunds)}</strong></div>
              <div><span style="color:var(--text-muted);">Cash In / Out</span> <strong>${this._inr(open.cashIn)} / ${this._inr(open.cashOut)}</strong></div>
            </div>` : `<div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:12px;">No open shift on RETAIL-01.</div>`}
          <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
            <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:left;">
              <th style="padding:8px 12px;">Closed shift</th><th style="padding:8px 12px; text-align:right;">Expected</th><th style="padding:8px 12px; text-align:right;">Physical</th><th style="padding:8px 12px; text-align:right;">Variance</th><th style="padding:8px 12px;">Result</th>
            </tr></thead>
            <tbody>
              ${reg.closedShifts.map(c => `<tr style="border-top:1px solid var(--border-subtle);">
                <td style="padding:8px 12px; color:var(--text-muted);">${this._esc((c.closedAt || '').slice(0, 16).replace('T', ' '))}</td>
                <td style="padding:8px 12px; text-align:right;">${this._inr(c.expectedCash)}</td>
                <td style="padding:8px 12px; text-align:right;">${this._inr(c.physicalClosing)}</td>
                <td style="padding:8px 12px; text-align:right; font-weight:700; color:${c.balanced ? '#10b981' : '#ef4444'};">${this._inr(c.variance)}</td>
                <td style="padding:8px 12px; color:${c.balanced ? '#10b981' : '#ef4444'}; font-weight:800; font-size:0.78rem;">${c.balanced ? 'BALANCED' : 'OUT'}</td>
              </tr>`).join('') || `<tr><td colspan="5" style="padding:18px; text-align:center; color:var(--text-muted);">No closed shifts yet.</td></tr>`}
            </tbody>
          </table>
        </div>

        <div class="card" style="border:1px solid var(--border-subtle); border-radius:12px; background:var(--bg-surface); padding:16px;">
          <div style="font-weight:800; font-size:0.92rem; margin-bottom:10px;">🏬 Group Day Summary · ${this._esc(this.day)}</div>
          <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
            <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:right;">
              <th style="padding:9px 12px; text-align:left;">Business unit</th><th style="padding:9px 12px; text-align:right;">Invoices</th><th style="padding:9px 12px; text-align:right;">Sales</th><th style="padding:9px 12px; text-align:right;">Collections</th>
            </tr></thead>
            <tbody>
              <tr style="border-top:1px solid var(--border-subtle);"><td style="padding:9px 12px; text-align:left; font-weight:700;">🍷 RETAIL</td><td style="padding:9px 12px; text-align:right;">${group.retail.documents}</td><td style="padding:9px 12px; text-align:right;">${this._inr(group.retail.sales)}</td><td style="padding:9px 12px; text-align:right;">${this._inr(group.retail.collections)}</td></tr>
              <tr style="border-top:1px solid var(--border-subtle);"><td style="padding:9px 12px; text-align:left; font-weight:700;">🍽️ RESTAURANT</td><td style="padding:9px 12px; text-align:right;">${group.restaurant.documents}</td><td style="padding:9px 12px; text-align:right;">${this._inr(group.restaurant.sales)}</td><td style="padding:9px 12px; text-align:right;">${this._inr(group.restaurant.collections)}</td></tr>
              <tr style="border-top:2px solid var(--border-subtle); background:var(--bg-surface-2);"><td style="padding:9px 12px; text-align:left; font-weight:800;">TOTAL GROUP</td><td style="padding:9px 12px; text-align:right; font-weight:800;">${group.total.documents}</td><td style="padding:9px 12px; text-align:right; font-weight:800;">${this._inr(group.total.sales)}</td><td style="padding:9px 12px; text-align:right; font-weight:800;">${this._inr(group.total.collections)}</td></tr>
            </tbody>
          </table>
          <div style="margin-top:8px; font-size:0.76rem; color:var(--text-muted);">Buckets are split by business_unit; retail and restaurant figures are kept strictly separate.</div>
        </div>
      </div>`;

    this._bind();
  }

  _bind() {
    const c = this.container; if (!c) return;
    const day = c.querySelector('#rp-day');
    if (day) day.addEventListener('change', e => { this.day = e.target.value || this.day; this.update(); });
  }

  destroy() {
    (this.unsubscribeEvents || []).forEach(u => { if (typeof u === 'function') u(); });
    this.unsubscribeEvents = [];
  }
}
