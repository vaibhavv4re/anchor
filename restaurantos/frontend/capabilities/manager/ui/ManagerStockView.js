/**
 * RestaurantOS - Manager Stock & 86 Panel (KITCHEN & BAR zone)
 * Live view of what's sold out (86'd) and what's below reorder level, sourced from
 * the inventory ledger via managerProjectionService.getStockAlertsProjection.
 * Refresh is driven by the workspace shell's centralized subscription.
 */

import { managerProjectionService } from '../../../../../businessos/platform/manager/managerProjectionService.js';

export class ManagerStockView {
  constructor(deps = {}) {
    this.tenantId = deps.tenantId || null;
    this.container = null;
    this.unsubscribeEvents = [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'manager-stock-view flex-col gap-lg animate-fade-in';
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

  _row(item, tone) {
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:var(--bg-surface-2); border-radius:6px; border-left:4px solid ${tone}; gap:12px; flex-wrap:wrap;">
        <div>
          <div style="font-weight:700; color:var(--text-primary);">${item.name || item.id}</div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${item.category || 'Uncategorized'}</div>
        </div>
        <div style="text-align:right; font-size:0.85rem;">
          <div style="font-weight:700; color:${tone};">On hand: ${item.onHand} ${item.baseUnit || ''}</div>
          <div style="color:var(--text-muted); font-size:0.75rem;">Reorder level: ${item.reorderLevel} ${item.baseUnit || ''}</div>
        </div>
      </div>`;
  }

  updateContent() {
    if (!this.container) return;

    const data = managerProjectionService.getStockAlertsProjection(this.tenantId);
    const { outOfStock, lowStock, outOfStockCount, lowStockCount, totalItems } = data;

    const sectionEmpty = (msg, tone) => `
      <div class="card" style="padding:22px; text-align:center; background:var(--bg-surface-1); border-left:4px solid ${tone};">
        <div style="font-weight:700; color:${tone};">${msg}</div>
      </div>`;

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h2 style="font-size:1.5rem; margin:0;">📦 Stock & 86'd Items</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Live on-hand from the inventory ledger • ${totalItems} tracked items</p>
        </div>
        <span class="badge" style="background:#8b5cf622; color:#8b5cf6; border:1px solid #8b5cf6; font-size:0.8rem; padding:6px 12px;">Ledger-derived</span>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:18px;">
        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #ef4444;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">86'D / OUT OF STOCK</div>
          <div style="font-size:1.8rem; font-weight:700; color:#ef4444; margin-top:4px;">${outOfStockCount}</div>
        </div>
        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #f59e0b;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">BELOW REORDER LEVEL</div>
          <div style="font-size:1.8rem; font-weight:700; color:#f59e0b; margin-top:4px;">${lowStockCount}</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div>
          <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#ef4444; margin-bottom:8px;">86'd / Out of Stock</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${outOfStock.length === 0 ? sectionEmpty('Nothing sold out right now', '#10b981') : outOfStock.map(i => this._row(i, '#ef4444')).join('')}
          </div>
        </div>
        <div>
          <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#f59e0b; margin-bottom:8px;">Below Reorder Level</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${lowStock.length === 0 ? sectionEmpty('All stock above reorder level', '#10b981') : lowStock.map(i => this._row(i, '#f59e0b')).join('')}
          </div>
        </div>
      </div>
    `;
  }
}
