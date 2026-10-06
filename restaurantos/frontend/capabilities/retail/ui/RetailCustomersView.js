/**
 * RestaurantOS Capability - Retail Customers (Retail Phase 1 surface)
 *
 * A light, derived customer ledger. Retail sales capture a `customerName` at the
 * POS (Walk-in by default); there is deliberately NO separate customer master in
 * this slice, so this view folds retail_sales into per-customer totals (orders,
 * spend, last visit, top items). Read-only projection of real sales data.
 */

import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { retailSaleModel } from '../../../../../businessos/platform/retail/retailSaleModel.js';

export class RetailCustomersView {
  constructor(deps = {}) {
    this.deps = deps;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
    this.saleModel = deps.retailSaleModel || retailSaleModel;
    this.container = null;
    this.session = null;
    this.tenantId = 'tenant_h0qc7wf';
    this.query = '';
    this.unsubscribeEvents = [];
    this._subscribed = false;
  }

  render(container, session = null) {
    this.container = container;
    this.session = session || {};
    this.tenantId = this.session.tenantId || this.session.tenant_id || 'tenant_h0qc7wf';
    if (!this._subscribed && this.platformEventBus && typeof this.platformEventBus.subscribe === 'function') {
      this._subscribed = true;
      const u = this.platformEventBus.subscribe('retail:sale:checkout', () => { if (this.container) this.update(); });
      if (typeof u === 'function') this.unsubscribeEvents.push(u);
    }
    this.update();
    return container;
  }

  _esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  _inr(n) { return '₹' + (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  _dt(v) { return v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }

  _build() {
    const sales = this.saleModel.getAllSales(this.tenantId);
    const byName = new Map();
    sales.forEach(s => {
      const name = (s.customerName || s.customer_name || 'Walk-in').trim() || 'Walk-in';
      const key = name.toLowerCase();
      const rec = byName.get(key) || { name, orders: 0, spend: 0, last: '', items: new Map() };
      rec.orders += 1;
      rec.spend += parseFloat(s.grandTotal != null ? s.grandTotal : s.grand_total) || 0;
      const at = s.occurredAt || s.occurred_at || '';
      if (at > rec.last) rec.last = at;
      (s.lines || []).forEach(l => rec.items.set(l.name, (rec.items.get(l.name) || 0) + (parseFloat(l.quantity) || 0)));
      byName.set(key, rec);
    });
    return Array.from(byName.values())
      .map(r => ({ name: r.name, orders: r.orders, spend: Math.round(r.spend * 100) / 100, last: r.last, top: Array.from(r.items.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, q]) => `${n} (${q})`).join(', ') }))
      .sort((a, b) => b.spend - a.spend);
  }

  update() {
    if (!this.container) return;
    const all = this._build();
    const q = this.query.trim().toLowerCase();
    const rows = q ? all.filter(r => r.name.toLowerCase().includes(q)) : all;

    this.container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px; height:100%; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:10px;">
          <div>
            <h3 style="margin:0; font-size:1.2rem; font-weight:800;">👤 Customers</h3>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:3px;">${all.length} customer(s) derived from retail sales · Walk-in is the default when no name is captured at the POS.</div>
          </div>
          <input id="cu-q" type="text" placeholder="Search name…" value="${this._esc(this.query)}" style="padding:9px 12px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary); min-width:200px;"/>
        </div>

        <div class="card" style="border:1px solid var(--border-subtle); border-radius:12px; overflow:hidden;">
          <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
            <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:left;">
              <th style="padding:9px 14px;">Customer</th><th style="padding:9px 14px; text-align:right;">Orders</th><th style="padding:9px 14px; text-align:right;">Total spend</th><th style="padding:9px 14px;">Last visit</th><th style="padding:9px 14px;">Top items</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => `<tr style="border-top:1px solid var(--border-subtle);">
                <td style="padding:8px 14px; font-weight:700;">${this._esc(r.name)}</td>
                <td style="padding:8px 14px; text-align:right;">${r.orders}</td>
                <td style="padding:8px 14px; text-align:right; font-weight:700;">${this._inr(r.spend)}</td>
                <td style="padding:8px 14px; color:var(--text-muted);">${this._dt(r.last)}</td>
                <td style="padding:8px 14px; color:var(--text-muted); max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this._esc(r.top || '—')}</td>
              </tr>`).join('') || `<tr><td colspan="5" style="padding:24px; text-align:center; color:var(--text-muted);">No customers yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
    this._bind();
  }

  _bind() {
    const c = this.container; if (!c) return;
    const q = c.querySelector('#cu-q');
    if (q) q.addEventListener('input', e => { this.query = e.target.value; const p = q.selectionStart; this.update(); const n = c.querySelector('#cu-q'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (_) {} } });
  }

  destroy() { (this.unsubscribeEvents || []).forEach(u => { if (typeof u === 'function') u(); }); this.unsubscribeEvents = []; }
}
