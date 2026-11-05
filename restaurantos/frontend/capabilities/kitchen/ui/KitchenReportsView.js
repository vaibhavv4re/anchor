/**
 * BusinessOS / RestaurantOS - Kitchen Domain UI (K-07 Reports & Analytics)
 *
 * Completes the previously-static "Tab 5 - Kitchen Reports" placeholder. Reads
 * live cloud collections through the DataGateway and computes:
 *   - Food cost vs revenue (theoretical, from recipe BOM costing vs menu price)
 *   - Actual consumption vs theoretical variance (recipe BOM vs stock_transactions)
 *   - Waste & void value
 *   - Prep yield performance (production batches planned vs produced)
 * Everything is read-only reporting; no writes leave this view.
 */

import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';

const DAY_MS = 86400000;

export class KitchenReportsView {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.rangeDays = 30;
  }

  _getCollection(name, tenantId) {
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      const list = this.dataGateway.getCachedCollection(name, tenantId);
      if (Array.isArray(list) && list.length > 0) return list;
    }
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      const list = window.__APP__.platform.dataGateway.getCachedCollection(name, tenantId);
      if (Array.isArray(list) && list.length > 0) return list;
    }
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return (store && store.getCollection(name, tenantId)) || [];
  }

  _num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

  _inRange(dateStr, since) {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    return !isNaN(t) ? t >= since : false;
  }

  /** menuItemId(:variantId) -> cost per portion, from approved recipes. */
  _recipeCostMap(recipes) {
    const map = new Map();
    recipes.forEach(r => {
      const cost = this._num(r.costPerPortion !== undefined ? r.costPerPortion : r.cost_per_portion);
      if (!r.menuItemId) return;
      const key = `${r.menuItemId}:${r.variantId || ''}`;
      const baseKey = `${r.menuItemId}:`;
      // Prefer variant-specific, else the most recent base recipe.
      if (r.variantId) map.set(key, cost);
      else if (!map.has(baseKey)) map.set(baseKey, cost);
    });
    return map;
  }

  _compute(session) {
    const tenantId = session ? session.tenantId : null;
    const since = Date.now() - (this.rangeDays * DAY_MS);

    const recipes = this._getCollection('recipes', tenantId);
    const menuItems = this._getCollection('kitchen_menu_items', tenantId);
    const orders = this._getCollection('orders', tenantId);
    const stockTx = this._getCollection('stock_transactions', tenantId);
    const batches = this._getCollection('production_batches', tenantId);

    const costMap = this._recipeCostMap(recipes);
    const priceMap = new Map();
    menuItems.forEach(m => {
      const price = this._num(m.sellingPrice !== undefined ? m.sellingPrice : m.selling_price);
      if (m.id) priceMap.set(m.id, price);
    });

    let revenue = 0, theoreticalCost = 0, soldPortions = 0, voidValue = 0, voidCount = 0;
    const topItems = new Map(); // name -> { qty, revenue, cost }

    orders.forEach(o => {
      const when = o.createdAt || o.created_at || o.orderDate || (o.data && o.data.createdAt);
      if (!this._inRange(when, since)) return;
      const items = (o.items && o.items.length ? o.items : (o.data && o.data.items)) || [];
      items.forEach(it => {
        const qty = this._num(it.qty !== undefined ? it.qty : it.quantity);
        const status = String(it.itemStatus || it.status || '').toUpperCase();
        const itemId = it.itemId || it.menuItemId || it.id;
        const cost = costMap.get(`${itemId}:${it.variantId || ''}`) ?? costMap.get(`${itemId}:`) ?? 0;
        const price = this._num(it.unitPrice || it.price || priceMap.get(itemId) || 0);
        if (status === 'VOID' || status === 'VOIDED' || status === 'CANCELLED') {
          voidValue += qty * price; voidCount += qty;
          return;
        }
        revenue += qty * price;
        theoreticalCost += qty * cost;
        soldPortions += qty;
        const name = it.itemName || it.name || itemId || 'Item';
        const agg = topItems.get(name) || { qty: 0, revenue: 0, cost: 0 };
        agg.qty += qty; agg.revenue += qty * price; agg.cost += qty * cost;
        topItems.set(name, agg);
      });
    });

    // Actual consumption / waste from the stock ledger.
    let actualConsumption = 0, wasteValue = 0;
    const consumedByItem = new Map();
    stockTx.forEach(t => {
      const when = t.occurredAt || t.occurred_at || t.createdAt || t.created_at;
      if (!this._inRange(when, since)) return;
      const type = String(t.transactionType || t.transaction_type || '').toUpperCase();
      const qty = this._num(t.quantity);
      const cost = this._num(t.unitCost !== undefined ? t.unitCost : t.unit_cost);
      const value = qty * cost;
      if (type === 'CONSUMPTION' || type === 'ISSUE' || type === 'USAGE') {
        actualConsumption += value;
        const code = t.itemCode || t.item_code || 'item';
        consumedByItem.set(code, (consumedByItem.get(code) || 0) + value);
      } else if (type === 'WASTE' || type === 'SPOILAGE' || type === 'DAMAGE') {
        wasteValue += value;
      }
    });

    // Prep yield from production batches (planned vs actual portions).
    let planned = 0, produced = 0;
    batches.forEach(b => {
      const when = b.startedAt || b.started_at || b.createdAt || b.created_at || (b.data && b.data.startedAt);
      if (this.rangeDays && !this._inRange(when, since) && when) return;
      planned += this._num(b.plannedQty !== undefined ? b.plannedQty : (b.planned_quantity || (b.data && b.data.plannedQty)));
      produced += this._num(b.actualQty !== undefined ? b.actualQty : (b.yield_quantity || (b.data && b.data.actualQty)));
    });

    const variance = actualConsumption - theoreticalCost;
    const foodCostPct = revenue > 0 ? (theoreticalCost / revenue) * 100 : 0;
    const actualCostPct = revenue > 0 ? (actualConsumption / revenue) * 100 : 0;
    const yieldPct = planned > 0 ? (produced / planned) * 100 : 0;

    return {
      revenue, theoreticalCost, actualConsumption, variance, foodCostPct, actualCostPct,
      soldPortions, voidValue, voidCount, wasteValue, yieldPct, planned, produced,
      topItems: Array.from(topItems.entries()).map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      consumedTop: Array.from(consumedByItem.entries()).map(([code, value]) => ({ code, value }))
        .sort((a, b) => b.value - a.value).slice(0, 10),
      hasData: orders.length > 0 || stockTx.length > 0 || recipes.length > 0
    };
  }

  render(mount, session) {
    const c = this._compute(session);
    const money = (n) => '₹' + (Math.round(n * 100) / 100).toLocaleString('en-IN');

    const kpi = (label, value, sub, color) => `
      <div class="card" style="background:var(--bg-surface-1); padding:20px; border:1px solid var(--border-subtle); border-radius:10px; flex:1; min-width:180px;">
        <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">${label}</div>
        <div style="font-size:1.7rem; font-weight:800; margin-top:6px; color:${color || 'var(--text-primary)'};">${value}</div>
        <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">${sub}</div>
      </div>`;

    mount.innerHTML = `
      <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">👨‍🍳 CHEF WORKSPACE — TAB 5</div>
            <h2 style="font-size:1.6rem; margin-top:2px;">📊 Kitchen Reports &amp; Analytics</h2>
            <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Food cost, consumption variance, waste/voids and prep yield (read-only)</p>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.8rem; color:var(--text-muted);">Period</label>
            <select id="kr-range" style="padding:8px 10px; border-radius:8px; background:var(--bg-surface-2); color:var(--text-primary); border:1px solid var(--border-subtle);">
              <option value="7" ${this.rangeDays === 7 ? 'selected' : ''}>Last 7 days</option>
              <option value="30" ${this.rangeDays === 30 ? 'selected' : ''}>Last 30 days</option>
              <option value="90" ${this.rangeDays === 90 ? 'selected' : ''}>Last 90 days</option>
            </select>
          </div>
        </div>

        ${!c.hasData ? `<div class="card" style="padding:32px; text-align:center; color:var(--text-muted);">No kitchen data yet — recipes, orders and stock movements will populate these reports.</div>` : `
        <div style="display:flex; gap:16px; flex-wrap:wrap;">
          ${kpi('Revenue (sold)', money(c.revenue), `${c.soldPortions} portions`, 'var(--accent-primary)')}
          ${kpi('Theoretical Food Cost', money(c.theoreticalCost), `${c.foodCostPct.toFixed(1)}% of revenue`)}
          ${kpi('Actual Consumption', money(c.actualConsumption), `${c.actualCostPct.toFixed(1)}% of revenue`)}
          ${kpi('Cost Variance', money(c.variance), c.variance > 0 ? 'Over-consumed vs recipe' : 'Under recipe (favourable)', c.variance > 0 ? 'var(--status-danger)' : 'var(--status-success)')}
        </div>
        <div style="display:flex; gap:16px; flex-wrap:wrap;">
          ${kpi('Waste Value', money(c.wasteValue), 'from stock ledger', 'var(--status-danger)')}
          ${kpi('Voided Items', `${c.voidCount}`, money(c.voidValue) + ' lost')}
          ${kpi('Prep Yield', `${c.yieldPct.toFixed(0)}%`, `${Math.round(c.produced)} / ${Math.round(c.planned)} portions`, c.yieldPct < 90 ? 'var(--status-warning)' : 'var(--status-success)')}
          ${kpi('Food Cost %', `${c.foodCostPct.toFixed(1)}%`, 'target ≤ 35%')}
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div class="card" style="background:var(--bg-surface-1); padding:18px; border:1px solid var(--border-subtle);">
            <h3 style="font-size:1rem; margin-bottom:10px;">🍽️ Top Selling Dishes (by revenue)</h3>
            ${c.topItems.length ? `<table class="data-table" style="width:100%;"><thead><tr><th>Dish</th><th>Qty</th><th>Revenue</th><th>Food Cost</th></tr></thead><tbody>
              ${c.topItems.map(t => `<tr><td>${t.name}</td><td>${t.qty}</td><td>${money(t.revenue)}</td><td>${money(t.cost)}</td></tr>`).join('')}
            </tbody></table>` : `<p style="color:var(--text-muted); font-size:0.85rem;">No sold items in this period.</p>`}
          </div>
          <div class="card" style="background:var(--bg-surface-1); padding:18px; border:1px solid var(--border-subtle);">
            <h3 style="font-size:1rem; margin-bottom:10px;">📦 Top Consumed Ingredients (actual cost)</h3>
            ${c.consumedTop.length ? `<table class="data-table" style="width:100%;"><thead><tr><th>Item Code</th><th>Consumed Value</th></tr></thead><tbody>
              ${c.consumedTop.map(t => `<tr><td>${t.code}</td><td>${money(t.value)}</td></tr>`).join('')}
            </tbody></table>` : `<p style="color:var(--text-muted); font-size:0.85rem;">No stock consumption recorded in this period.</p>`}
          </div>
        </div>
        `}
      </div>
    `;

    const rangeSel = mount.querySelector('#kr-range');
    if (rangeSel) {
      rangeSel.addEventListener('change', () => {
        this.rangeDays = parseInt(rangeSel.value) || 30;
        this.render(mount, session);
      });
    }
  }
}
