/**
 * RestaurantOS - Manager Prep & Production Panel (KITCHEN & BAR zone)
 * Batch production/yield overview from productionBatchModel. NOTE: production
 * batches are device-local and NOT part of the realtime set, so this panel is
 * honestly labeled "Local - not realtime". Refresh driven by the shell.
 */

import { managerProjectionService } from '../../../../../businessos/platform/manager/managerProjectionService.js';

export class ManagerProductionView {
  constructor(deps = {}) {
    this.tenantId = deps.tenantId || null;
    this.container = null;
    this.unsubscribeEvents = [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'manager-production-view flex-col gap-lg animate-fade-in';
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

  updateContent() {
    if (!this.container) return;

    const data = managerProjectionService.getProductionProjection(this.tenantId);
    const { batches, activeCount, completedCount, avgYieldPercent, totalLeakageValue } = data;

    const cards = batches.length === 0 ? `
      <div class="card" style="padding:24px; text-align:center; color:var(--text-muted); background:var(--bg-surface-1);">
        No production batches recorded on this device yet. Batches created in the Kitchen prep workflow will appear here.
      </div>
    ` : batches.map(b => {
      const yieldPct = b.yieldPercent !== undefined && b.yieldPercent !== null ? b.yieldPercent : null;
      const tone = yieldPct === null ? '#6b7280' : (yieldPct >= 90 ? '#10b981' : (yieldPct >= 75 ? '#f59e0b' : '#ef4444'));
      const leakage = parseFloat(b.totalYieldLeakageValue) || 0;
      return `
        <div class="card animate-fade-in" style="padding:16px; background:var(--bg-surface-1); border-left:5px solid ${tone}; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
            <div>
              <div style="font-weight:700; font-size:1.05rem; color:var(--text-primary);">${b.recipeName || b.recipeId}</div>
              <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">${b.station || 'Kitchen'} • ${b.batchNumber || b.id}</div>
            </div>
            <span class="badge" style="background:${tone}22; color:${tone}; border:1px solid ${tone}; font-size:0.75rem;">${b.status}</span>
          </div>
          <div style="display:flex; gap:24px; margin-top:12px; font-size:0.85rem; flex-wrap:wrap;">
            <div><span style="color:var(--text-muted);">Planned:</span> <strong>${b.plannedPortions ?? '—'}</strong></div>
            <div><span style="color:var(--text-muted);">Produced:</span> <strong>${b.actualPortionsProduced ?? '—'}</strong></div>
            <div><span style="color:var(--text-muted);">Yield:</span> <strong style="color:${tone};">${yieldPct === null ? '—' : (yieldPct + '%')}</strong></div>
            <div><span style="color:var(--text-muted);">Leakage:</span> <strong>${this._fmt(leakage)}</strong></div>
          </div>
        </div>`;
    }).join('');

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h2 style="font-size:1.5rem; margin:0;">🔪 Prep & Production Levels</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Batch yield and unit-cost leakage across kitchen stations</p>
        </div>
        <span class="badge" style="background:#6b728022; color:#6b7280; border:1px solid #6b7280; font-size:0.8rem; padding:6px 12px;">Local - not realtime</span>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px; margin-bottom:18px;">
        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #3b82f6;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">ACTIVE BATCHES</div>
          <div style="font-size:1.6rem; font-weight:700; color:#3b82f6; margin-top:4px;">${activeCount}</div>
        </div>
        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #10b981;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">COMPLETED BATCHES</div>
          <div style="font-size:1.6rem; font-weight:700; color:#10b981; margin-top:4px;">${completedCount}</div>
        </div>
        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #8b5cf6;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">AVG YIELD</div>
          <div style="font-size:1.6rem; font-weight:700; color:#8b5cf6; margin-top:4px;">${avgYieldPercent === null ? '—' : (avgYieldPercent + '%')}</div>
        </div>
        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #ef4444;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL LEAKAGE VALUE</div>
          <div style="font-size:1.6rem; font-weight:700; color:#ef4444; margin-top:4px;">${this._fmt(totalLeakageValue)}</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:14px;">
        ${cards}
      </div>
    `;
  }
}
