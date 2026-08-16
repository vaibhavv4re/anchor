import { offlineStore as globalOfflineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';

/**
 * KitchenInventoryView.js
 * Tab 5 of Kitchen Workspace — 📦 Kitchen Inventory View
 *
 * Provides operational inventory visibility for cooking staff, low-stock reorder triggers,
 * location breakdown ("Where is it?"), and stock request lifecycle tracking.
 *
 * READ-ONLY PROJECTION of Inventory Manager's stock balances & transactions.
 * STRICT BOUNDARY: No item creation, no price editing, no PO/GRN, no manual adjustments.
 */

export class KitchenInventoryView {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : globalOfflineStore);

    this.activeTab = 'OVERVIEW'; // 'OVERVIEW' | 'AVAILABLE' | 'LOW_STOCK' | 'REQUESTS'
    this.searchQuery = '';
    this.typeFilter = 'ALL'; // 'ALL' | 'RAW' | 'SEMI_FINISHED' | 'LOW_STOCK'
    this.locationModalItem = null;
    this.requestModalItem = null;
    this.requestDetailModalItem = null;
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
    const store = this.offlineStore || globalOfflineStore;
    return store && typeof store.getCollection === 'function' ? store.getCollection(name, tenantId) || [] : [];
  }

  // --- MAIN RENDER FUNCTION ---
  render(container, session) {
    const tenantId = session ? session.tenantId : null;

    const renderHTML = () => {
      container.innerHTML = `
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
          <!-- Header Cockpit -->
          <div class="card" style="background:var(--bg-surface-1); padding:20px; border:1px solid var(--border-subtle);">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
              <div>
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">👨‍🍳 CHEF WORKSPACE — TAB 5</div>
                <h2 style="font-size:1.6rem; margin-top:2px; margin-bottom:0;">📦 Kitchen Operational Inventory</h2>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">
                  Read-only operational stock view for cooking staff, low-stock reorders & Main Warehouse transfer tracking.
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:10px;">
                <span class="badge badge-info" style="font-size:0.85rem; padding:6px 12px; font-weight:700;">🔒 Store Read-Only View</span>
              </div>
            </div>

            <!-- Subtab Navigation -->
            <div style="display:flex; gap:8px; margin-top:16px; border-top:1px solid var(--border-subtle); padding-top:14px; flex-wrap:wrap;">
              <button class="btn-subtab ${this.activeTab === 'OVERVIEW' ? 'active-subtab' : ''}" data-tab="OVERVIEW" style="padding:8px 16px; font-size:0.85rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeTab === 'OVERVIEW' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeTab === 'OVERVIEW' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
                📊 Inventory Overview
              </button>
              <button class="btn-subtab ${this.activeTab === 'AVAILABLE' ? 'active-subtab' : ''}" data-tab="AVAILABLE" style="padding:8px 16px; font-size:0.85rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeTab === 'AVAILABLE' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeTab === 'AVAILABLE' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
                🧾 Available Stock
              </button>
              <button class="btn-subtab ${this.activeTab === 'LOW_STOCK' ? 'active-subtab' : ''}" data-tab="LOW_STOCK" style="padding:8px 16px; font-size:0.85rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeTab === 'LOW_STOCK' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeTab === 'LOW_STOCK' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
                ⚠️ Low Stock ${this.getLowStockCount(tenantId) > 0 ? `<span class="badge badge-danger" style="margin-left:4px; font-size:0.7rem;">${this.getLowStockCount(tenantId)}</span>` : ''}
              </button>
              <button class="btn-subtab ${this.activeTab === 'REQUESTS' ? 'active-subtab' : ''}" data-tab="REQUESTS" style="padding:8px 16px; font-size:0.85rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeTab === 'REQUESTS' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeTab === 'REQUESTS' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
                📩 Stock Requests ${this.getPendingRequestCount(tenantId) > 0 ? `<span class="badge badge-warning" style="margin-left:4px; font-size:0.7rem;">${this.getPendingRequestCount(tenantId)}</span>` : ''}
              </button>
            </div>
          </div>

          <!-- Main Body Container -->
          <main id="kitchen-inventory-body">
            ${this.renderActiveTabContent(session, tenantId)}
          </main>
        </div>

        <!-- Location Modal Drawer ("Where is it?") -->
        ${this.locationModalItem ? this.renderLocationModalHTML(tenantId) : ''}

        <!-- Stock Request Modal -->
        ${this.requestModalItem ? this.renderRequestModalHTML(tenantId) : ''}

        <!-- Request Details / Audit Modal -->
        ${this.requestDetailModalItem ? this.renderRequestAuditModalHTML(tenantId) : ''}
      `;

      this.bindEvents(container, session, tenantId);
    };

    renderHTML();
  }

  // --- DATA COMPUTATION ---
  getEnrichedInventory(tenantId) {
    const items = this._getCollection('inventory', tenantId);
    const balances = this._getCollection('stock_balances', tenantId);

    return items.map(item => {
      const code = String(item.itemCode || item.item_code || item.id || '');
      const name = item.itemName || item.item_name || 'Ingredient';
      const category = item.categoryCode || item.category || 'GENERAL';
      const baseUom = item.baseUom || item.base_uom || 'KG';
      const itemType = (item.itemType || item.item_type || '').toUpperCase();

      const itemBals = balances.filter(b => String(b.itemCode || b.item_code || b.itemId || b.id) === code && (!tenantId || b.tenantId === tenantId));
      const currentStock = itemBals.length
        ? itemBals.reduce((sum, b) => sum + (parseFloat(b.quantity) || 0), 0)
        : (item.currentStock !== undefined ? item.currentStock : (item.openingStock !== undefined ? item.openingStock : 0));

      const reorderLevel = parseFloat(item.reorderLevel || item.reorder_level) || 0;
      const isLowStock = reorderLevel > 0 && currentStock <= reorderLevel;

      return {
        id: item.id || code,
        code,
        name,
        category,
        baseUom,
        itemType,
        isSemiFinished: itemType.includes('SEMI') || itemType.includes('PREP'),
        currentStock,
        reorderLevel,
        isLowStock,
        locationsCount: itemBals.length || 1,
        lastUpdated: item.updatedAt || item.createdAt || new Date().toISOString()
      };
    });
  }

  getLowStockCount(tenantId) {
    const enriched = this.getEnrichedInventory(tenantId);
    return enriched.filter(i => i.isLowStock).length;
  }

  getPendingRequestCount(tenantId) {
    const requests = this._getCollection('inventory_requests', tenantId);
    return requests.filter(r => r.status === 'PENDING' || r.status === 'PENDING_WAREHOUSE_FULFILLMENT').length;
  }

  renderActiveTabContent(session, tenantId) {
    const enriched = this.getEnrichedInventory(tenantId);

    if (this.activeTab === 'OVERVIEW') {
      return this.renderOverviewTab(enriched, tenantId);
    } else if (this.activeTab === 'AVAILABLE') {
      return this.renderAvailableTab(enriched, tenantId);
    } else if (this.activeTab === 'LOW_STOCK') {
      return this.renderLowStockTab(enriched, tenantId);
    } else if (this.activeTab === 'REQUESTS') {
      return this.renderRequestsTab(session, tenantId);
    }
    return '';
  }

  renderOverviewTab(enriched, tenantId) {
    const totalItems = enriched.length;
    const lowStockCount = enriched.filter(i => i.isLowStock).length;
    const rawMaterialsCount = enriched.filter(i => !i.isSemiFinished).length;
    const semiFinishedCount = enriched.filter(i => i.isSemiFinished).length;

    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <!-- Metrics Row -->
        <div class="grid grid-cols-4 gap-md">
          <div class="card" style="background:var(--bg-surface-1); padding:16px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL INGREDIENTS LOGGED</div>
            <div style="font-size:1.8rem; font-weight:800; margin-top:4px;">${totalItems}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Raw materials & Prep items</div>
          </div>
          <div class="card" style="background:var(--bg-surface-1); padding:16px; border-left:4px solid var(--status-danger);">
            <div style="font-size:0.75rem; color:var(--status-danger); font-weight:700;">LOW STOCK ALERTS</div>
            <div style="font-size:1.8rem; font-weight:800; color:var(--status-danger); margin-top:4px;">${lowStockCount}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Below reorder threshold</div>
          </div>
          <div class="card" style="background:var(--bg-surface-1); padding:16px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">RAW MATERIALS</div>
            <div style="font-size:1.8rem; font-weight:800; margin-top:4px;">${rawMaterialsCount}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Supplier ingredients</div>
          </div>
          <div class="card" style="background:var(--bg-surface-1); padding:16px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">SEMI-FINISHED PREPS</div>
            <div style="font-size:1.8rem; font-weight:800; color:var(--accent-primary); margin-top:4px;">${semiFinishedCount}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Batch preparations</div>
          </div>
        </div>

        <!-- Inventory List Card -->
        <div class="card" style="background:var(--bg-surface-1); padding:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <h3 style="font-size:1.1rem; margin:0;">📋 Kitchen Ingredients & Stock Status</h3>
            <div style="display:flex; gap:10px; align-items:center;">
              <input type="text" id="inp-search-inv" value="${this.searchQuery}" placeholder="🔍 Search ingredient or code..." style="padding:8px 12px; border-radius:6px; font-size:0.85rem; border:1px solid var(--border-subtle); width:220px;">
            </div>
          </div>

          <div class="table-responsive">
            <table class="data-table" style="width:100%;">
              <thead>
                <tr style="font-size:0.75rem; color:var(--text-muted);">
                  <th>Code</th>
                  <th>Ingredient Name</th>
                  <th>Type</th>
                  <th>Current Stock</th>
                  <th>Reorder Level</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${enriched.length > 0 ? enriched.map(i => `
                  <tr>
                    <td><code style="font-size:0.75rem; color:var(--text-muted);">${i.code}</code></td>
                    <td><strong>${i.name}</strong></td>
                    <td><span class="badge ${i.isSemiFinished ? 'badge-warning' : 'badge-info'}" style="font-size:0.75rem;">${i.isSemiFinished ? '🥘 Semi-Finished' : '🥩 Raw Material'}</span></td>
                    <td style="font-weight:700;">${i.currentStock} ${i.baseUom}</td>
                    <td style="color:var(--text-muted);">${i.reorderLevel > 0 ? `${i.reorderLevel} ${i.baseUom}` : 'N/A'}</td>
                    <td>
                      <span class="badge ${i.isLowStock ? 'badge-danger' : 'badge-success'}" style="font-size:0.75rem;">
                        ${i.isLowStock ? '⚠️ Low Stock' : '🟢 Available'}
                      </span>
                    </td>
                    <td>
                      <button class="btn-secondary btn-where-is-it" data-code="${i.code}" style="padding:4px 10px; font-size:0.75rem; font-weight:600;">
                        📍 Where is it?
                      </button>
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="7" style="text-align:center; padding:32px; color:var(--text-muted);">
                      📦 No stock items found in kitchen inventory cache.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  renderAvailableTab(enriched, tenantId) {
    const available = enriched.filter(i => !i.isLowStock);
    return `
      <div class="card" style="background:var(--bg-surface-1); padding:20px;">
        <h3 style="font-size:1.1rem; margin:0 0 16px;">🧾 Available Kitchen Stock (${available.length} items)</h3>
        <div class="table-responsive">
          <table class="data-table" style="width:100%;">
            <thead>
              <tr style="font-size:0.75rem; color:var(--text-muted);">
                <th>Code</th>
                <th>Ingredient Name</th>
                <th>Type</th>
                <th>Available Qty</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${available.map(i => `
                <tr>
                  <td><code>${i.code}</code></td>
                  <td><strong>${i.name}</strong></td>
                  <td><span class="badge ${i.isSemiFinished ? 'badge-warning' : 'badge-info'}">${i.isSemiFinished ? '🥘 Semi-Finished' : '🥩 Raw'}</span></td>
                  <td style="font-weight:700; color:var(--status-success);">${i.currentStock} ${i.baseUom}</td>
                  <td>
                    <button class="btn-secondary btn-where-is-it" data-code="${i.code}" style="padding:4px 10px; font-size:0.75rem;">📍 Where is it?</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderLowStockTab(enriched, tenantId) {
    const lowStock = enriched.filter(i => i.isLowStock);
    return `
      <div class="card" style="background:var(--bg-surface-1); padding:20px; border-top:4px solid var(--status-danger);">
        <h3 style="font-size:1.1rem; margin:0 0 16px; color:var(--status-danger);">⚠️ Low Stock Alerts & Reorder Triggers (${lowStock.length} items)</h3>
        <div class="table-responsive">
          <table class="data-table" style="width:100%;">
            <thead>
              <tr style="font-size:0.75rem; color:var(--text-muted);">
                <th>Code</th>
                <th>Ingredient Name</th>
                <th>Current Stock</th>
                <th>Reorder Threshold</th>
                <th>Deficit Shortage</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${lowStock.map(i => `
                <tr>
                  <td><code>${i.code}</code></td>
                  <td><strong>${i.name}</strong></td>
                  <td style="font-weight:700; color:var(--status-danger);">${i.currentStock} ${i.baseUom}</td>
                  <td>${i.reorderLevel} ${i.baseUom}</td>
                  <td style="font-weight:700; color:var(--status-danger);">${(i.reorderLevel - i.currentStock).toFixed(1)} ${i.baseUom}</td>
                  <td>
                    <button class="btn-primary btn-open-request-modal" data-code="${i.code}" style="padding:6px 12px; font-size:0.75rem; background:var(--status-warning);">📩 Request Reorder</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderRequestsTab(session, tenantId) {
    const requests = this._getCollection('inventory_requests', tenantId);

    return `
      <div class="card" style="background:var(--bg-surface-1); padding:20px;">
        <h3 style="font-size:1.1rem; margin:0 0 16px;">📩 Kitchen Stock Requests & Requisitions</h3>
        <div class="table-responsive">
          <table class="data-table" style="width:100%;">
            <thead>
              <tr style="font-size:0.75rem; color:var(--text-muted);">
                <th>Req Code</th>
                <th>Department</th>
                <th>Status</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              ${requests.length > 0 ? requests.map(r => `
                <tr>
                  <td><code>${r.requestNumber || r.id}</code></td>
                  <td>${r.department || 'Kitchen'}</td>
                  <td><span class="badge badge-warning">${r.status}</span></td>
                  <td>${new Date(r.createdAt || Date.now()).toLocaleString()}</td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="4" style="text-align:center; padding:32px; color:var(--text-muted);">
                    📩 No stock requisitions currently logged.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderLocationModalHTML(tenantId) {
    const item = this.locationModalItem;
    if (!item) return '';

    const balances = this._getCollection('stock_balances', tenantId);
    const locations = this._getCollection('storage_locations', tenantId);

    const itemBals = balances.filter(b => String(b.itemCode || b.item_code || b.itemId || b.id) === item.code && (!tenantId || b.tenantId === tenantId));

    return `
      <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999; padding:20px;">
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); width:100%; max-width:540px; padding:24px; border-radius:12px; border:1px solid var(--border-subtle); box-shadow:var(--shadow-lg);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:12px; margin-bottom:16px;">
            <div>
              <span class="badge ${item.isSemiFinished ? 'badge-warning' : 'badge-info'}" style="font-size:0.75rem;">${item.isSemiFinished ? '🥘 Semi-Finished' : '🥩 Raw Material'}</span>
              <h3 style="font-size:1.3rem; margin:4px 0 0; font-weight:700;">${item.name}</h3>
              <div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">Item Code: ${item.code}</div>
            </div>
            <button id="btn-close-location-modal" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">✕</button>
          </div>

          <div style="display:flex; flex-direction:column; gap:12px;">
            <div style="font-size:0.85rem; font-weight:700; color:var(--text-muted);">STOCK BALANCES BY LOCATION</div>
            ${itemBals.length > 0 ? itemBals.map(b => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--bg-surface-2); border-radius:6px;">
                <div>
                  <div style="font-weight:700; font-size:0.9rem;">${b.locationName || b.locationCode || 'Main Kitchen Storage'}</div>
                  <div style="font-size:0.75rem; color:var(--text-muted);">Batch: ${b.batchNumber || 'N/A'}</div>
                </div>
                <div style="font-size:1.1rem; font-weight:800; color:var(--accent-primary);">${b.quantity} ${item.baseUom}</div>
              </div>
            `).join('') : `
              <div style="padding:14px; background:var(--bg-surface-2); border-radius:6px; font-size:0.85rem; color:var(--text-muted); text-align:center;">
                Main Kitchen Storage — On-Hand: <strong>${item.currentStock} ${item.baseUom}</strong>
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }

  renderRequestModalHTML(tenantId) {
    return '';
  }

  renderRequestAuditModalHTML(tenantId) {
    return '';
  }

  bindEvents(container, session, tenantId) {
    const subtabs = container.querySelectorAll('.btn-subtab');
    subtabs.forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.render(container, session);
      });
    });

    const whereBtns = container.querySelectorAll('.btn-where-is-it');
    whereBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const enriched = this.getEnrichedInventory(tenantId);
        this.locationModalItem = enriched.find(i => i.code === btn.dataset.code) || null;
        this.render(container, session);
      });
    });

    const closeLocBtn = container.querySelector('#btn-close-location-modal');
    if (closeLocBtn) {
      closeLocBtn.addEventListener('click', () => {
        this.locationModalItem = null;
        this.render(container, session);
      });
    }
  }
}
