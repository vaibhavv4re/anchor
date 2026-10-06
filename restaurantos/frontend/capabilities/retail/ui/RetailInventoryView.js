/**
 * RestaurantOS Capability - Retail Stock (Retail Phase 2)
 *
 * READ-ONLY live physical position of the wine store at LOC-RETAIL. Retail is a
 * pure CONSUMER of the shared Inventory Core (exactly like Kitchen/Bar): stock
 * only arrives here when the Inventory Manager fulfils a requisition with a
 * warehouse transfer (LOC-805 -> LOC-RETAIL). This view therefore exposes NO
 * receive / transfer / adjustment / count actions - it projects live
 * `stock_balances` rows and flags stock health against the master
 * `inventory.reorder_level`. Replenishment is raised in the Request Stock tab.
 */

import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import {
  RETAIL_LOCATION, resolveGateway, readRetailBalances, readCollection, catalogByItem, retailItemCodes, displayName
} from './retailInventorySupport.js';

export class RetailInventoryView {
  constructor(deps = {}) {
    this.deps = deps;
    this.dataGateway = deps.dataGateway || null;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
    this.container = null;
    this.session = null;
    this.tenantId = 'tenant_h0qc7wf';
    this.unsubscribeEvents = [];
    this._subscribed = false;
  }

  render(container, session = null) {
    this.container = container;
    this.session = session || {};
    this.tenantId = this.session.tenantId || this.session.tenant_id || 'tenant_h0qc7wf';
    if (!this._subscribed && this.platformEventBus && typeof this.platformEventBus.subscribe === 'function') {
      this._subscribed = true;
      const unsub = this.platformEventBus.subscribe('stock:balance:updated', () => { if (this.container) this.update(); });
      if (typeof unsub === 'function') this.unsubscribeEvents.push(unsub);
    }
    this.update();
    return container;
  }

  _gateway() { return resolveGateway(this.dataGateway); }
  _esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  _money(n) { return '₹' + (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  /** Canonical 4-state consumer health (mirrors the Bar stock-health contract). */
  _health(quantity, reorderLevel) {
    if (quantity <= 0) return { label: 'out', color: '#ef4444' };
    if (!reorderLevel || reorderLevel <= 0) return { label: '', color: 'var(--text-primary)' };
    if (quantity <= reorderLevel) return { label: 'low', color: '#f59e0b' };
    return { label: '', color: 'var(--text-primary)' };
  }

  update() {
    if (!this.container) return;
    const gateway = this._gateway();
    const balances = readRetailBalances(this.tenantId, gateway);
    const catalog = catalogByItem(this.tenantId);
    // Reorder thresholds come from the SHARED inventory master (live data).
    const reorderByItem = new Map();
    readCollection('inventory', this.tenantId, gateway).forEach(i => {
      const code = i.itemCode || i.item_code;
      if (!code) return;
      reorderByItem.set(code, parseFloat(i.reorder_level != null ? i.reorder_level : (i.reorderLevel != null ? i.reorderLevel : (i.data && i.data.reorderLevel))) || 0);
    });
    // Show every stocked SKU plus any catalogue SKU (so zero-stock wines are visible).
    const codes = new Set([...balances.keys(), ...retailItemCodes(this.tenantId, gateway)]);
    const rows = Array.from(codes).map(code => {
      const b = balances.get(code) || { quantity: 0, unitCost: 0, valuation: 0, uom: 'PCS' };
      return { code, name: displayName(code, catalog), reorderLevel: reorderByItem.get(code) || 0, ...b };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const totalUnits = rows.reduce((s, r) => s + r.quantity, 0);
    const totalValue = rows.reduce((s, r) => s + r.valuation, 0);
    const needRequest = rows.filter(r => this._health(r.quantity, r.reorderLevel).label).length;

    this.container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px; height:100%; overflow-y:auto;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div>
            <h3 style="margin:0; font-size:1.2rem; font-weight:800;">📦 Retail Stock · ${RETAIL_LOCATION}</h3>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:3px;">${rows.length} SKUs · ${totalUnits} on hand · ${this._money(totalValue)} at cost · live from Inventory Core</div>
          </div>
        </div>

        <div style="padding:12px 16px; border-radius:10px; border:1px solid var(--border-subtle); background:var(--bg-surface); font-size:0.84rem; color:var(--text-secondary);">
          ℹ️ <strong>Read-only consumer view.</strong> Retail cannot move stock itself. Stock arrives at ${RETAIL_LOCATION} only when the Inventory
          Manager fulfils a requisition (LOC-805 → ${RETAIL_LOCATION}). ${needRequest > 0 ? `<strong>${needRequest} SKU(s)</strong> need replenishment — ` : ''}raise them in <strong>📩 Request Stock</strong>.
        </div>

        <div class="card" style="border:1px solid var(--border-subtle); border-radius:12px; overflow:hidden;">
          <table style="width:100%; border-collapse:collapse; font-size:0.86rem;">
            <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:left;">
              <th style="padding:10px 14px;">Item</th>
              <th style="padding:10px 14px;">SKU</th>
              <th style="padding:10px 14px; text-align:right;">On hand</th>
              <th style="padding:10px 14px; text-align:right;">Reorder at</th>
              <th style="padding:10px 14px; text-align:right;">Unit cost</th>
              <th style="padding:10px 14px; text-align:right;">Value</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => {
                const h = this._health(r.quantity, r.reorderLevel);
                return `<tr style="border-top:1px solid var(--border-subtle);">
                  <td style="padding:9px 14px; color:var(--text-primary);">${this._esc(r.name)}${h.label ? ` <span style="color:${h.color}; font-size:0.72rem;">· ${h.label}</span>` : ''}</td>
                  <td style="padding:9px 14px; color:var(--text-muted); font-size:0.78rem;">${this._esc(r.code)}</td>
                  <td style="padding:9px 14px; text-align:right; font-weight:800; color:${h.color};">${r.quantity} <span style="color:var(--text-muted); font-weight:500; font-size:0.75rem;">${this._esc(r.uom)}</span></td>
                  <td style="padding:9px 14px; text-align:right; color:var(--text-muted);">${r.reorderLevel || '—'}</td>
                  <td style="padding:9px 14px; text-align:right; color:var(--text-secondary);">${this._money(r.unitCost)}</td>
                  <td style="padding:9px 14px; text-align:right; color:var(--text-secondary);">${this._money(r.valuation)}</td>
                </tr>`;
              }).join('') || `<tr><td colspan="6" style="padding:24px; text-align:center; color:var(--text-muted);">No retail stock yet. Raise a requisition from the Request Stock tab.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  destroy() {
    (this.unsubscribeEvents || []).forEach(u => { if (typeof u === 'function') u(); });
    this.unsubscribeEvents = [];
  }
}
