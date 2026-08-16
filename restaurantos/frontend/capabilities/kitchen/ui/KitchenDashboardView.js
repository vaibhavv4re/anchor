/**
 * Capability 1.3 - Kitchen & Chef Workspace: Tab 1 - 🏠 Dashboard
 * Read-Only Operational Cockpit for Head Chef / Kitchen Manager.
 * Aggregates live orders, KDS queue state, batch production metrics,
 * and low-stock ingredient alerts based on stock_balances + Master Inventory policies.
 */

import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';

export class KitchenDashboardView {
  constructor({ onNavigate, onLaunchKDS }) {
    this.container = null;
    this.onNavigate = onNavigate || (() => {});
    this.onLaunchKDS = onLaunchKDS || (() => {});
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'kitchen-dashboard-container animate-fade-in';
    this.updateContent();
    return this.container;
  }

  updateContent() {
    const session = JSON.parse(sessionStorage.getItem('ros_session') || '{}');
    const tenantId = session.tenantId || null;

    // 1. Fetch Real Inventory Data: Master Inventory + stock_balances
    const items = offlineStore.getCollection('inventory', tenantId) || [];
    const balances = offlineStore.getCollection('stock_balances', tenantId) || [];

    // Calculate Low Stock items (currentQty <= reorderLevel)
    const lowStockAlerts = items.filter(item => {
      const itemBalances = balances.filter(b => b.itemCode === item.itemCode && (!tenantId || b.tenantId === tenantId));
      const currentQty = itemBalances.length
        ? itemBalances.reduce((sum, b) => sum + (parseFloat(b.quantity) || 0), 0)
        : (item.currentStock !== undefined ? item.currentStock : (item.openingStock !== undefined ? item.openingStock : 0));
      const reorder = parseFloat(item.reorderLevel) || 0;
      return reorder > 0 && currentQty <= reorder;
    }).map(item => {
      const itemBalances = balances.filter(b => b.itemCode === item.itemCode && (!tenantId || b.tenantId === tenantId));
      const currentQty = itemBalances.length
        ? itemBalances.reduce((sum, b) => sum + (parseFloat(b.quantity) || 0), 0)
        : (item.currentStock !== undefined ? item.currentStock : (item.openingStock !== undefined ? item.openingStock : 0));
      return {
        itemCode: item.itemCode,
        itemName: item.itemName,
        currentQty,
        reorderLevel: parseFloat(item.reorderLevel) || 0,
        baseUom: item.baseUom || 'KG'
      };
    });

    // 2. Fetch Real Order & KDS Domain Data
    const sessions = offlineStore.getCollection('sessions', tenantId) || [];
    const kots = offlineStore.getCollection('kots', tenantId) || [];
    const activeKots = kots.filter(k => k.status !== 'SERVED' && k.status !== 'CANCELLED');
    const preparingItemsCount = activeKots.reduce((sum, k) => sum + ((k.items || []).filter(i => i.status === 'PREPARING').length), 0);

    // 3. Fetch Real Production Data
    const productionBatches = offlineStore.getCollection('production_batches', tenantId) || [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayBatchesCount = productionBatches.filter(b => b.createdAt && b.createdAt.startsWith(todayStr)).length;

    // Greeting determination
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : (hour < 17 ? 'Good afternoon' : 'Good evening');
    const chefName = session.employeeName || 'Chef';

    this.container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:var(--space-lg);">
        <!-- Top Cockpit Header Banner -->
        <div class="card" style="background:linear-gradient(135deg, var(--bg-surface-1) 0%, var(--bg-surface-2) 100%); border:1px solid var(--border-subtle); padding:var(--space-lg);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:var(--space-md);">
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">👨‍🍳 KITCHEN OPERATIONAL COCKPIT</div>
              <h2 style="font-size:1.6rem; margin-top:2px;">${greeting}, ${chefName}</h2>
              <div style="display:flex; align-items:center; gap:var(--space-md); margin-top:6px; font-size:0.875rem;">
                <span style="color:var(--status-success); font-weight:600;">🟢 Kitchen Status: Operational</span>
                <span style="color:var(--text-muted);">•</span>
                <span style="color:var(--text-muted);">Sync: 🟢 Online (Offline First)</span>
              </div>
            </div>
            <button class="btn-primary btn-launch-kds-head" style="padding:10px 20px; font-size:1rem; font-weight:700; display:flex; align-items:center; gap:8px;">
              📺 OPEN KDS
            </button>
          </div>
        </div>

        <!-- 4 KPI Summary Cards -->
        <div class="grid grid-cols-4 gap-md">
          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-md); text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">ACTIVE ORDERS</div>
            <div style="font-size:2rem; font-weight:800; color:var(--text-main); margin:4px 0;">${activeKots.length > 0 ? activeKots.length : '—'}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${activeKots.length > 0 ? `${activeKots.length} live KOT tickets` : 'No active tickets'}</div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-md); text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">PREPARING ITEMS</div>
            <div style="font-size:2rem; font-weight:800; color:var(--accent-primary); margin:4px 0;">${preparingItemsCount > 0 ? preparingItemsCount : '—'}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${preparingItemsCount > 0 ? 'Items on stove / line' : 'Kitchen line clear'}</div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-md); text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">LOW STOCK ALERTS</div>
            <div style="font-size:2rem; font-weight:800; color:${lowStockAlerts.length > 0 ? 'var(--status-danger)' : 'var(--status-success)'}; margin:4px 0;">
              ${lowStockAlerts.length > 0 ? lowStockAlerts.length : '0'}
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${lowStockAlerts.length > 0 ? 'Below reorder threshold' : 'All stock levels healthy'}</div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-md); text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">PRODUCTION TODAY</div>
            <div style="font-size:2rem; font-weight:800; color:var(--text-main); margin:4px 0;">${todayBatchesCount > 0 ? todayBatchesCount : '—'}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${todayBatchesCount > 0 ? 'Completed batches' : 'No batches logged today'}</div>
          </div>
        </div>

        <!-- 2-Column Main Section -->
        <div class="grid grid-cols-2 gap-lg">
          <!-- Left: Kitchen Activity / Active KOTs -->
          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-lg); display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-md);">
                <h3 style="font-size:1.1rem; margin:0; display:flex; align-items:center; gap:8px;">
                  📺 KITCHEN ACTIVITY
                </h3>
                <span class="badge badge-info" style="font-size:0.75rem;">LIVE QUEUE</span>
              </div>

              ${activeKots.length > 0 ? `
                <div style="display:flex; flex-direction:column; gap:var(--space-sm);">
                  ${activeKots.slice(0, 5).map(kot => `
                    <div style="padding:10px; background:var(--bg-surface-2); border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                      <div>
                        <div style="font-weight:600; font-size:0.9rem;">Ticket #${kot.kotNumber || kot.id} — Table ${kot.tableNumber || 'Takeaway'}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${(kot.items || []).length} items • ${kot.timeElapsed || 'Just now'}</div>
                      </div>
                      <span class="badge badge-warning">${kot.status || 'PENDING'}</span>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div style="padding:32px var(--space-md); text-align:center; color:var(--text-muted); background:var(--bg-surface-2); border-radius:var(--radius-md);">
                  <div style="font-size:1.75rem; margin-bottom:6px;">📺 No Active Tickets</div>
                  <div style="font-size:0.875rem;">Orders placed from Waiter Floor or Online POS will stream live onto the KDS screen.</div>
                </div>
              `}
            </div>

            <button class="btn-secondary btn-launch-kds-body" style="margin-top:var(--space-md); width:100%; font-weight:600;">
              📺 Launch Fullscreen KDS Monitor →
            </button>
          </div>

          <!-- Right: Low Stock Ingredient Alerts -->
          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-lg); display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-md);">
                <h3 style="font-size:1.1rem; margin:0; display:flex; align-items:center; gap:8px;">
                  ⚠️ LOW STOCK ALERTS
                </h3>
                <span class="badge ${lowStockAlerts.length > 0 ? 'badge-danger' : 'badge-success'}" style="font-size:0.75rem;">
                  ${lowStockAlerts.length} ITEMS
                </span>
              </div>

              ${lowStockAlerts.length > 0 ? `
                <div style="display:flex; flex-direction:column; gap:var(--space-sm); max-height:220px; overflow-y:auto;">
                  ${lowStockAlerts.map(alert => `
                    <div style="padding:10px; background:rgba(239, 68, 68, 0.08); border-left:3px solid var(--status-danger); border-radius:4px; display:flex; justify-content:space-between; align-items:center;">
                      <div>
                        <div style="font-weight:600; font-size:0.9rem;">${alert.itemName}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${alert.itemCode}</div>
                      </div>
                      <div style="text-align:right;">
                        <div style="font-weight:700; color:var(--status-danger); font-size:0.875rem;">
                          ${alert.currentQty} ${alert.baseUom}
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">Reorder: ${alert.reorderLevel} ${alert.baseUom}</div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div style="padding:32px var(--space-md); text-align:center; color:var(--text-muted); background:var(--bg-surface-2); border-radius:var(--radius-md);">
                  <div style="font-size:1.75rem; color:var(--status-success); margin-bottom:6px;">✓</div>
                  <div style="font-weight:600; color:var(--text-main); font-size:0.95rem;">All Ingredients Healthy</div>
                  <div style="font-size:0.85rem; margin-top:2px;">No kitchen ingredients are currently below reorder threshold.</div>
                </div>
              `}
            </div>

            <button class="btn-secondary btn-req-stock" style="margin-top:var(--space-md); width:100%; font-weight:600;">
              📦 Request Stock from Main Store →
            </button>
          </div>
        </div>

        <!-- Quick Actions Panel -->
        <div class="card" style="background:var(--bg-surface-1); padding:var(--space-lg);">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:var(--space-md);">QUICK OPERATIONAL ACTIONS</div>
          <div style="display:flex; flex-wrap:wrap; gap:var(--space-md);">
            <button class="btn-secondary btn-action-prod" style="padding:10px 16px; font-weight:600; display:flex; align-items:center; gap:8px;">
              🥘 Start Production Batch
            </button>
            <button class="btn-secondary btn-action-stock" style="padding:10px 16px; font-weight:600; display:flex; align-items:center; gap:8px;">
              📦 Request Kitchen Stock
            </button>
            <button class="btn-primary btn-action-kds" style="padding:10px 16px; font-weight:700; display:flex; align-items:center; gap:8px;">
              📺 Open KDS Workspace
            </button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Launch KDS buttons
    const kdsBtns = this.container.querySelectorAll('.btn-launch-kds-head, .btn-launch-kds-body, .btn-action-kds');
    kdsBtns.forEach(btn => {
      btn.addEventListener('click', () => this.onLaunchKDS());
    });

    // Production action button
    const prodBtn = this.container.querySelector('.btn-action-prod');
    if (prodBtn) {
      prodBtn.addEventListener('click', () => this.onNavigate('production'));
    }

    // Request Stock buttons
    const stockBtns = this.container.querySelectorAll('.btn-req-stock, .btn-action-stock');
    stockBtns.forEach(btn => {
      btn.addEventListener('click', () => this.onNavigate('inventory'));
    });
  }
}

