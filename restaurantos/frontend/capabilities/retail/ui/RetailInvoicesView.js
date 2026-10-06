/**
 * RestaurantOS Capability - Retail Invoices (Retail Phase 1 surface)
 *
 * Read-only list of the fiscal documents the RetailSale boundary issued into the
 * shared Invoice Engine under the RETAIL series: tax invoices (…R) and the
 * CREDIT_NOTEs raised by refunds. Each row expands to its lines + tax breakdown.
 * This screen never mutates - it reflects invoices already produced by checkout /
 * refund, so restaurant invoices (no RETAIL business_unit) are excluded.
 */

import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';

const isCredit = (i) => (i.documentType || i.document_type) === 'CREDIT_NOTE';

export class RetailInvoicesView {
  constructor(deps = {}) {
    this.deps = deps;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
    this.container = null;
    this.session = null;
    this.tenantId = 'tenant_h0qc7wf';
    this.selected = null;   // invoiceNumber
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

  _invoices() {
    return (offlineStore.getCollection('invoices') || [])
      .filter(i => (i.tenantId || i.tenant_id || this.tenantId) === this.tenantId && (i.businessUnit || i.business_unit) === 'RETAIL')
      .sort((a, b) => String(b.issuedAt || b.issued_at || b.createdAt || '').localeCompare(String(a.issuedAt || a.issued_at || a.createdAt || '')));
  }

  update() {
    if (!this.container) return;
    const list = this._invoices();
    const sel = this.selected ? list.find(i => (i.invoiceNumber || i.invoice_number) === this.selected) : null;
    const net = list.reduce((s, i) => s + (parseFloat(i.grandTotal != null ? i.grandTotal : i.grand_total) || 0), 0);

    this.container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px; height:100%; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:10px;">
          <div>
            <h3 style="margin:0; font-size:1.2rem; font-weight:800;">🧾 Invoices</h3>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:3px;">${list.filter(i => !isCredit(i)).length} invoice(s) · ${list.filter(isCredit).length} credit note(s) · net ${this._inr(net)}</div>
          </div>
          ${sel ? `<button id="iv-back" style="padding:8px 14px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); color:var(--text-primary); cursor:pointer; font-weight:700;">← All invoices</button>` : ''}
        </div>

        ${sel ? this._detail(sel) : `
        <div class="card" style="border:1px solid var(--border-subtle); border-radius:12px; overflow:hidden;">
          <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
            <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:left;">
              <th style="padding:9px 14px;">Document</th><th style="padding:9px 14px;">Type</th><th style="padding:9px 14px;">Sale</th><th style="padding:9px 14px; text-align:right;">Taxable</th><th style="padding:9px 14px; text-align:right;">Tax</th><th style="padding:9px 14px; text-align:right;">Total</th><th style="padding:9px 14px;">Issued</th>
            </tr></thead>
            <tbody>
              ${list.slice(0, 120).map(i => {
                const credit = isCredit(i);
                const gt = parseFloat(i.grandTotal != null ? i.grandTotal : i.grand_total) || 0;
                return `<tr class="iv-row" data-inv="${this._esc(i.invoiceNumber || i.invoice_number)}" style="border-top:1px solid var(--border-subtle); cursor:pointer;">
                  <td style="padding:8px 14px; font-family:monospace; font-size:0.78rem;">${this._esc(i.invoiceNumber || i.invoice_number)}</td>
                  <td style="padding:8px 14px; color:${credit ? '#ef4444' : '#10b981'}; font-weight:800; font-size:0.76rem;">${credit ? 'CREDIT NOTE' : 'TAX INVOICE'}</td>
                  <td style="padding:8px 14px; font-family:monospace; font-size:0.76rem; color:var(--text-muted);">${this._esc(i.retailSaleNumber || i.saleNumber || '—')}</td>
                  <td style="padding:8px 14px; text-align:right;">${this._inr(i.taxableAmount)}</td>
                  <td style="padding:8px 14px; text-align:right; color:var(--text-muted);">${this._inr(i.totalTax)}</td>
                  <td style="padding:8px 14px; text-align:right; font-weight:700; color:${credit ? '#ef4444' : 'var(--text-primary)'};">${this._inr(gt)}</td>
                  <td style="padding:8px 14px; color:var(--text-muted);">${this._dt(i.issuedAt || i.issued_at || i.createdAt)}</td>
                </tr>`;
              }).join('') || `<tr><td colspan="7" style="padding:24px; text-align:center; color:var(--text-muted);">No retail invoices yet.</td></tr>`}
            </tbody>
          </table>
        </div>`}
      </div>`;
    this._bind();
  }

  _detail(inv) {
    const lines = (inv.items || []).map(l => `<tr style="border-top:1px solid var(--border-subtle);">
      <td style="padding:8px 14px;">${this._esc(l.name)}</td><td style="padding:8px 14px; text-align:right;">${this._esc(l.quantity)}</td><td style="padding:8px 14px; text-align:right;">${this._inr(l.price)}</td><td style="padding:8px 14px; text-align:right; font-weight:700;">${this._inr(l.lineTotal)}</td></tr>`).join('');
    const tax = (inv.taxLines || []).map(t => `<div>${this._esc(t.label || t.name || t.taxCategory || 'Tax')}: <strong>${this._inr(t.amount)}</strong></div>`).join('');
    return `<div class="card" style="border:1px solid var(--border-subtle); border-radius:12px; overflow:hidden;">
      <div style="padding:14px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <div>
          <div style="font-weight:800;">${this._esc(inv.invoiceNumber || inv.invoice_number)}</div>
          <div style="font-size:0.8rem; color:var(--text-muted);">${isCredit(inv) ? 'Credit note against ' + this._esc(inv.creditAgainst || '') : 'Sale ' + this._esc(inv.retailSaleNumber || inv.saleNumber || '')} · ${this._dt(inv.issuedAt || inv.issued_at || inv.createdAt)}</div>
        </div>
        <div style="text-align:right; font-size:0.8rem; color:var(--text-muted);">Cashier ${this._esc(inv.cashierName || '')}</div>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
        <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:left;"><th style="padding:8px 14px;">Item</th><th style="padding:8px 14px; text-align:right;">Qty</th><th style="padding:8px 14px; text-align:right;">Price</th><th style="padding:8px 14px; text-align:right;">Line</th></tr></thead>
        <tbody>${lines || `<tr><td colspan="4" style="padding:18px; text-align:center; color:var(--text-muted);">No line detail.</td></tr>`}</tbody>
      </table>
      <div style="padding:12px 14px; border-top:1px solid var(--border-subtle); display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px; font-size:0.86rem;">
        <div style="display:flex; flex-direction:column; gap:3px;">${tax}</div>
        <div style="display:flex; flex-direction:column; gap:3px; align-items:flex-end;">
          <div>Taxable: <strong>${this._inr(inv.taxableAmount)}</strong></div>
          <div style="font-size:1rem;">Grand total: <strong style="color:${isCredit(inv) ? '#ef4444' : '#10b981'};">${this._inr(inv.grandTotal != null ? inv.grandTotal : inv.grand_total)}</strong></div>
        </div>
      </div>
    </div>`;
  }

  _bind() {
    const c = this.container; if (!c) return;
    c.querySelectorAll('.iv-row').forEach(row => row.addEventListener('click', () => { this.selected = row.dataset.inv; this.update(); }));
    const back = c.querySelector('#iv-back'); if (back) back.addEventListener('click', () => { this.selected = null; this.update(); });
  }

  destroy() { (this.unsubscribeEvents || []).forEach(u => { if (typeof u === 'function') u(); }); this.unsubscribeEvents = []; }
}
