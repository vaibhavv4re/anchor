/**
 * RestaurantOS - Manager Discounts, Voids & Comps Panel (MONEY zone)
 * Live oversight of money leaving the business through voids and discounts, sourced
 * from orders (voided lines) + bill_revisions (discounts) via
 * managerProjectionService.getVoidsCompsProjection. Refresh driven by the shell.
 */

import { managerProjectionService } from '../../../../../businessos/platform/manager/managerProjectionService.js';

export class ManagerVoidsCompsView {
  constructor(deps = {}) {
    this.tenantId = deps.tenantId || null;
    this.container = null;
    this.unsubscribeEvents = [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'manager-voids-view flex-col gap-lg animate-fade-in';
    this.container.style.width = '100%';
    this.updateContent();
    return this.container;
  }

  refresh() {
    this.updateContent();
  }

  destroy() {
    (this.unsubscribeEvents || []).forEach(u => { if (typeof u === 'function') u(); });
    this.unsubscribeEvents = [];
  }

  _fmt(val) { return '₹' + Number(val || 0).toLocaleString('en-IN'); }

  _time(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return '—'; }
  }

  updateContent() {
    if (!this.container) return;

    const data = managerProjectionService.getVoidsCompsProjection(this.tenantId);
    const { voidRows, discountRows, voidCount, voidValue, discountCount, discountValue } = data;

    const voidTable = voidRows.length === 0 ? `
      <div class="card" style="padding:20px; text-align:center; color:var(--text-muted); background:var(--bg-surface-1);">No voided items this shift.</div>
    ` : `
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Value</th><th>Reason</th><th>Table</th><th>Time</th></tr></thead>
          <tbody>
            ${voidRows.map(v => `
              <tr>
                <td style="font-weight:600;">${v.item}</td>
                <td>${v.qty}</td>
                <td>${this._fmt(v.value)}</td>
                <td>${v.reason}</td>
                <td>${v.tableLabel}</td>
                <td>${this._time(v.voidedAt)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    const discTable = discountRows.length === 0 ? `
      <div class="card" style="padding:20px; text-align:center; color:var(--text-muted); background:var(--bg-surface-1);">No discounts applied this shift.</div>
    ` : `
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Table</th><th>Amount</th><th>Reason</th><th>Waiter</th><th>Time</th></tr></thead>
          <tbody>
            ${discountRows.map(d => `
              <tr>
                <td style="font-weight:600;">${d.tableCode}</td>
                <td>${this._fmt(d.amount)}</td>
                <td>${d.reason}</td>
                <td>${d.waiterName}</td>
                <td>${this._time(d.timestamp)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h2 style="font-size:1.5rem; margin:0;">✂️ Discounts, Voids & Comps</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Live revenue-leakage oversight • every void reason and discount is accountable</p>
        </div>
        <span class="badge badge-success" style="font-size:0.8rem; padding:6px 12px;">Live from orders & bill revisions</span>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:18px;">
        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #ef4444;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">VOIDED VALUE (${voidCount} items)</div>
          <div style="font-size:1.6rem; font-weight:700; color:#ef4444; margin-top:4px;">${this._fmt(voidValue)}</div>
        </div>
        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #f59e0b;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">DISCOUNTS GIVEN (${discountCount} bills)</div>
          <div style="font-size:1.6rem; font-weight:700; color:#f59e0b; margin-top:4px;">${this._fmt(discountValue)}</div>
        </div>
      </div>

      <div style="margin-bottom:8px; font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#ef4444;">Voided Items</div>
      ${voidTable}

      <div style="margin:18px 0 8px 0; font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#f59e0b;">Discounts by Bill</div>
      ${discTable}
    `;
  }
}
