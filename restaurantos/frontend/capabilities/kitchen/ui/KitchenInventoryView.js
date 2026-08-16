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

class KitchenInventoryView {
  constructor() {
    this.activeTab = 'OVERVIEW'; // 'OVERVIEW' | 'AVAILABLE' | 'LOW_STOCK' | 'REQUESTS'
    this.searchQuery = '';
    this.typeFilter = 'ALL'; // 'ALL' | 'RAW' | 'SEMI_FINISHED' | 'LOW_STOCK'
    this.locationModalItem = null;
    this.requestModalItem = null;
    this.requestDetailModalItem = null;
  }

  // --- MAIN RENDER FUNCTION ---
  render(container, session) {
    const tenantId = session ? session.tenantId : null;

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
  }

  // --- DATA COMPUTATION ---
  getEnrichedInventory(tenantId) {
    const items = offlineStore.getCollection('inventory', tenantId) || [];
    const balances = offlineStore.getCollection('stock_balances', tenantId) || [];

    return items.map(item => {
      const code = String(item.itemCode || item.item_code || item.id || '');
      const name = item.itemName || item.item_name || 'Ingredient';
      const category = item.categoryCode || item.category || 'GENERAL';
      const baseUom = item.baseUom || item.base_uom || 'KG';
      const itemType = (item.itemType || item.item_type || '').toUpperCase();

      const isSemiFinished = itemType.includes('SEMI') || itemType.includes('PREP') || category.includes('PREP') || code.startsWith('SF-') || code.startsWith('PREP-');
      const isRawMaterial = !isSemiFinished;

      // Find stock balances in Kitchen Store
      const matchingBals = balances.filter(b => String(b.itemCode || b.item_code || b.itemId || b.id) === code && (!tenantId || b.tenantId === tenantId));
      let availableQty = 0;

      if (matchingBals.length > 0) {
        availableQty = matchingBals.reduce((sum, b) => sum + parseFloat(b.currentStock || b.quantity || 0), 0);
      } else {
        availableQty = parseFloat(item.currentStock !== undefined ? item.currentStock : (item.openingStock !== undefined ? item.openingStock : 0));
      }

      availableQty = parseFloat(availableQty.toFixed(4));
      const reorderLevel = parseFloat(item.reorderLevel || item.reorder_level || 0);

      const purPrice = parseFloat(item.lastPurchasePrice || item.purchasePrice || 0);
      const factor = parseFloat(item.conversionFactor || 1);
      const unitValuation = parseFloat(item.unitValuation !== undefined ? item.unitValuation : (factor > 0 ? purPrice / factor : purPrice) || 0);
      const valuation = availableQty * unitValuation;

      let status = 'IN_STOCK';
      if (availableQty <= 0) {
        status = 'OUT_OF_STOCK';
      } else if (availableQty <= reorderLevel) {
        status = 'LOW_STOCK';
      }

      return {
        ...item,
        code,
        name,
        category,
        baseUom,
        isSemiFinished,
        isRawMaterial,
        availableQty,
        reorderLevel,
        unitValuation,
        valuation,
        status
      };
    });
  }

  getLowStockCount(tenantId) {
    const enriched = this.getEnrichedInventory(tenantId);
    return enriched.filter(i => i.reorderLevel > 0 && i.availableQty <= i.reorderLevel).length;
  }

  getPendingRequestCount(tenantId) {
    const requisitions = productionModel.getStockRequisitions(tenantId);
    return requisitions.filter(r => r.status === 'PENDING_WAREHOUSE_FULFILLMENT').length;
  }

  // --- RENDER ACTIVE TAB BODY ---
  renderActiveTabContent(session, tenantId) {
    if (this.activeTab === 'OVERVIEW') return this.renderOverviewHTML(tenantId);
    if (this.activeTab === 'AVAILABLE') return this.renderAvailableStockHTML(tenantId);
    if (this.activeTab === 'LOW_STOCK') return this.renderLowStockHTML(tenantId);
    if (this.activeTab === 'REQUESTS') return this.renderStockRequestsHTML(tenantId);
    return this.renderOverviewHTML(tenantId);
  }

  // --- 1. OVERVIEW TAB ---
  renderOverviewHTML(tenantId) {
    const inventory = this.getEnrichedInventory(tenantId);
    const requisitions = productionModel.getStockRequisitions(tenantId);

    const rawMaterials = inventory.filter(i => i.isRawMaterial);
    const semiFinished = inventory.filter(i => i.isSemiFinished);
    const lowStockItems = inventory.filter(i => i.reorderLevel > 0 && i.availableQty <= i.reorderLevel);
    const pendingReqs = requisitions.filter(r => r.status === 'PENDING_WAREHOUSE_FULFILLMENT');

    const totalValuation = inventory.reduce((sum, i) => sum + i.valuation, 0);
    const totalAvailableCount = inventory.filter(i => i.availableQty > 0).length;

    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <!-- Top KPI Cards -->
        <div class="grid-responsive-4" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
          <div class="card" style="background:var(--bg-surface-1); padding:16px; border-left:4px solid var(--accent-primary);">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">🥩 RAW MATERIALS</div>
            <div style="font-size:1.8rem; font-weight:800; margin-top:4px;">${rawMaterials.length}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Ingredients from Store</div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:16px; border-left:4px solid var(--accent-secondary);">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">🥘 SEMI-FINISHED</div>
            <div style="font-size:1.8rem; font-weight:800; margin-top:4px;">${semiFinished.length}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Kitchen Prep Items</div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:16px; border-left:4px solid ${lowStockItems.length > 0 ? 'var(--status-danger)' : 'var(--status-success)'};">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">⚠️ LOW STOCK</div>
            <div style="font-size:1.8rem; font-weight:800; color:${lowStockItems.length > 0 ? 'var(--status-danger)' : 'var(--status-success)'}; margin-top:4px;">${lowStockItems.length}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Needs Replenishment</div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:16px; border-left:4px solid var(--status-warning);">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">📩 PENDING REQUESTS</div>
            <div style="font-size:1.8rem; font-weight:800; color:var(--status-warning); margin-top:4px;">${pendingReqs.length}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Submitted to Warehouse</div>
          </div>
        </div>

        <!-- Quick View Cockpit -->
        <div class="card" style="background:var(--bg-surface-1); padding:20px; border:1px solid var(--border-subtle);">
          <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">📊 KITCHEN STOCK OPERATIONAL SUMMARY</div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:16px; align-items:center;">
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted);">Kitchen Stock Value (Read-Only)</div>
              <div style="font-size:1.4rem; font-weight:800; color:var(--accent-primary);">₹ ${totalValuation.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted);">Items Available in Store</div>
              <div style="font-size:1.4rem; font-weight:800; color:var(--text-main);">${totalAvailableCount} / ${inventory.length} Items</div>
            </div>
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted);">Low Stock Alerts</div>
              <div style="font-size:1.4rem; font-weight:800; color:${lowStockItems.length > 0 ? 'var(--status-danger)' : 'var(--status-success)'};">${lowStockItems.length} Items</div>
            </div>
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted);">Warehouse Requisitions</div>
              <div style="font-size:1.4rem; font-weight:800; color:var(--status-warning);">${pendingReqs.length} Pending</div>
            </div>
          </div>
        </div>

        <!-- Raw Materials vs Semi-Finished Side-by-Side Breakdown -->
        <div class="grid-2col-responsive" style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
          <!-- Raw Materials Card -->
          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:10px; margin-bottom:14px;">
              <h4 style="margin:0; font-size:1.1rem;">🥩 Raw Materials (${rawMaterials.length})</h4>
              <span class="badge badge-info">Store Deliveries</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; max-height:360px; overflow-y:auto; padding-right:4px;">
              ${rawMaterials.map(i => `
                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-2); padding:10px 14px; border-radius:6px;">
                  <div>
                    <div style="font-weight:700; font-size:0.9rem;">${i.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${i.code}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:800; font-size:0.95rem;">${i.availableQty} ${i.baseUom}</div>
                    <span class="badge ${i.status === 'IN_STOCK' ? 'badge-success' : (i.status === 'LOW_STOCK' ? 'badge-warning' : 'badge-danger')}" style="font-size:0.65rem;">
                      ${i.status === 'IN_STOCK' ? 'IN STOCK' : (i.status === 'LOW_STOCK' ? 'LOW STOCK' : 'OUT OF STOCK')}
                    </span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Semi-Finished Card -->
          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:10px; margin-bottom:14px;">
              <h4 style="margin:0; font-size:1.1rem;">🥘 Semi-Finished (${semiFinished.length})</h4>
              <span class="badge badge-warning">Kitchen Prep Yield</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; max-height:360px; overflow-y:auto; padding-right:4px;">
              ${semiFinished.map(i => `
                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-2); padding:10px 14px; border-radius:6px;">
                  <div>
                    <div style="font-weight:700; font-size:0.9rem;">${i.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${i.code}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:800; font-size:0.95rem;">${i.availableQty} ${i.baseUom}</div>
                    <span class="badge ${i.status === 'IN_STOCK' ? 'badge-success' : (i.status === 'LOW_STOCK' ? 'badge-warning' : 'badge-danger')}" style="font-size:0.65rem;">
                      ${i.status === 'IN_STOCK' ? 'IN STOCK' : (i.status === 'LOW_STOCK' ? 'LOW STOCK' : 'OUT OF STOCK')}
                    </span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --- 2. AVAILABLE STOCK TAB ---
  renderAvailableStockHTML(tenantId) {
    const inventory = this.getEnrichedInventory(tenantId);

    const q = (this.searchQuery || '').toLowerCase().trim();
    let filtered = inventory.filter(i => {
      if (q) {
        const matchName = i.name.toLowerCase().includes(q);
        const matchCode = i.code.toLowerCase().includes(q);
        const matchCat = i.category.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchCat) return false;
      }

      if (this.typeFilter === 'RAW' && !i.isRawMaterial) return false;
      if (this.typeFilter === 'SEMI_FINISHED' && !i.isSemiFinished) return false;
      if (this.typeFilter === 'LOW_STOCK' && (i.reorderLevel === 0 || i.availableQty > i.reorderLevel)) return false;

      return true;
    });

    return `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <!-- Search & Pill Filter Bar -->
        <div class="card" style="background:var(--bg-surface-1); padding:16px; border:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="flex:1; min-width:240px;">
            <input type="text" id="inp-search-kitchen-stock" value="${this.searchQuery}" placeholder="🔍 Search ingredients or prep items (e.g., chicken, paneer, masala)..." style="width:100%; padding:10px 14px; font-size:0.9rem;">
          </div>

          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn-filter-pill ${this.typeFilter === 'ALL' ? 'active-pill' : ''}" data-filter="ALL" style="padding:6px 14px; font-size:0.8rem; font-weight:700; border-radius:20px; cursor:pointer; background:${this.typeFilter === 'ALL' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.typeFilter === 'ALL' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              All (${inventory.length})
            </button>
            <button class="btn-filter-pill ${this.typeFilter === 'RAW' ? 'active-pill' : ''}" data-filter="RAW" style="padding:6px 14px; font-size:0.8rem; font-weight:700; border-radius:20px; cursor:pointer; background:${this.typeFilter === 'RAW' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.typeFilter === 'RAW' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              🥩 Raw Material (${inventory.filter(i => i.isRawMaterial).length})
            </button>
            <button class="btn-filter-pill ${this.typeFilter === 'SEMI_FINISHED' ? 'active-pill' : ''}" data-filter="SEMI_FINISHED" style="padding:6px 14px; font-size:0.8rem; font-weight:700; border-radius:20px; cursor:pointer; background:${this.typeFilter === 'SEMI_FINISHED' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.typeFilter === 'SEMI_FINISHED' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              🥘 Semi Finished (${inventory.filter(i => i.isSemiFinished).length})
            </button>
            <button class="btn-filter-pill ${this.typeFilter === 'LOW_STOCK' ? 'active-pill' : ''}" data-filter="LOW_STOCK" style="padding:6px 14px; font-size:0.8rem; font-weight:700; border-radius:20px; cursor:pointer; background:${this.typeFilter === 'LOW_STOCK' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.typeFilter === 'LOW_STOCK' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              ⚠️ Low Stock (${inventory.filter(i => i.reorderLevel > 0 && i.availableQty <= i.reorderLevel).length})
            </button>
          </div>
        </div>

        <!-- Available Stock Table -->
        <div class="card" style="background:var(--bg-surface-1); padding:0; overflow:hidden;">
          <div class="table-responsive">
            <table class="data-table" style="width:100%;">
              <thead>
                <tr style="font-size:0.8rem; color:var(--text-muted); background:var(--bg-surface-2);">
                  <th style="padding:12px 16px;">Item Name & Code</th>
                  <th style="padding:12px 16px;">Type</th>
                  <th style="padding:12px 16px; text-align:right;">Available Stock</th>
                  <th style="padding:12px 16px;">UOM</th>
                  <th style="padding:12px 16px;">Status</th>
                  <th style="padding:12px 16px; text-align:center;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length > 0 ? filtered.map(item => `
                  <tr style="font-size:0.9rem; border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:12px 16px;">
                      <div style="font-weight:700; color:var(--text-main);">${item.name}</div>
                      <div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${item.code}</div>
                    </td>
                    <td style="padding:12px 16px;">
                      <span class="badge ${item.isSemiFinished ? 'badge-warning' : 'badge-info'}" style="font-size:0.75rem;">
                        ${item.isSemiFinished ? '🥘 Semi-Finished' : '🥩 Raw Material'}
                      </span>
                    </td>
                    <td style="padding:12px 16px; text-align:right; font-weight:800; font-size:1.05rem; color:${item.status === 'OUT_OF_STOCK' ? 'var(--status-danger)' : 'var(--text-main)'};">
                      ${item.availableQty}
                    </td>
                    <td style="padding:12px 16px; font-weight:600; color:var(--text-secondary);">${item.baseUom}</td>
                    <td style="padding:12px 16px;">
                      ${item.status === 'IN_STOCK' ? `
                        <span class="badge badge-success" style="font-size:0.75rem; padding:4px 8px;">🟢 IN STOCK</span>
                      ` : (item.status === 'LOW_STOCK' ? `
                        <span class="badge badge-warning" style="font-size:0.75rem; padding:4px 8px;">🟡 LOW STOCK</span>
                      ` : `
                        <span class="badge badge-danger" style="font-size:0.75rem; padding:4px 8px;">🔴 OUT OF STOCK</span>
                      `)}
                    </td>
                    <td style="padding:12px 16px; text-align:center;">
                      <button class="btn-secondary btn-view-locations" data-code="${item.code}" style="padding:6px 12px; font-size:0.78rem; font-weight:700; cursor:pointer;">
                        👁️ View Locations
                      </button>
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="6" style="text-align:center; padding:32px; color:var(--text-muted);">
                      🔍 No stock items match the selected filter.
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

  // --- 3. LOW STOCK TAB ---
  renderLowStockHTML(tenantId) {
    const inventory = this.getEnrichedInventory(tenantId);
    const lowStockItems = inventory.filter(i => i.reorderLevel > 0 && i.availableQty <= i.reorderLevel);

    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div class="card" style="background:var(--bg-surface-1); padding:16px 20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="font-size:1.15rem; margin:0; font-weight:700; color:var(--status-danger);">⚠️ Low Stock Replenishment Action Center</h3>
              <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                Items currently at or below reorder level. Click "Request Stock" to submit a stock transfer request to Main Warehouse.
              </div>
            </div>
            <span class="badge badge-danger" style="font-size:0.85rem; padding:6px 12px; font-weight:700;">${lowStockItems.length} Action Required</span>
          </div>
        </div>

        ${lowStockItems.length > 0 ? `
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">
            ${lowStockItems.map(item => {
              const suggestedReqQty = Math.max(1, parseFloat((item.reorderLevel - item.availableQty).toFixed(2)));
              return `
                <div class="card" style="background:var(--bg-surface-1); padding:18px; border:1px solid var(--border-subtle); border-left:4px solid var(--status-danger); display:flex; flex-direction:column; justify-content:space-between; gap:14px;">
                  <div>
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                      <div>
                        <span class="badge ${item.isSemiFinished ? 'badge-warning' : 'badge-info'}" style="font-size:0.7rem;">${item.isSemiFinished ? '🥘 Semi-Finished' : '🥩 Raw Material'}</span>
                        <h4 style="font-size:1.1rem; margin:6px 0 2px; font-weight:700;">${item.name}</h4>
                        <div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${item.code}</div>
                      </div>
                      <span class="badge badge-danger" style="font-size:0.75rem;">LOW STOCK</span>
                    </div>

                    <div style="margin-top:14px; background:var(--bg-surface-2); padding:12px; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                      <div>
                        <div style="font-size:0.72rem; color:var(--text-muted);">CURRENT KITCHEN STOCK</div>
                        <div style="font-size:1.2rem; font-weight:800; color:var(--status-danger);">${item.availableQty} ${item.baseUom}</div>
                      </div>
                      <div style="text-align:right;">
                        <div style="font-size:0.72rem; color:var(--text-muted);">REORDER LEVEL</div>
                        <div style="font-size:1.2rem; font-weight:700; color:var(--text-main);">${item.reorderLevel} ${item.baseUom}</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <button class="btn-primary btn-trigger-request-stock" data-code="${item.code}" data-qty="${suggestedReqQty}" style="width:100%; padding:10px; font-size:0.85rem; font-weight:700; background:var(--accent-primary); cursor:pointer;">
                      📩 Request Stock from Main Warehouse
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="card" style="background:var(--bg-surface-1); padding:40px; text-align:center; color:var(--text-muted);">
            <div style="font-size:2.5rem; margin-bottom:8px;">🟢</div>
            <h3 style="font-size:1.2rem; color:var(--text-main); margin:0 0 6px;">All Kitchen Stock Levels Healthy</h3>
            <p style="font-size:0.875rem; max-width:480px; margin:0 auto;">
              No raw materials or semi-finished items are below reorder level.
            </p>
          </div>
        `}
      </div>
    `;
  }

  // --- 4. STOCK REQUESTS TAB ---
  renderStockRequestsHTML(tenantId) {
    const requisitions = productionModel.getStockRequisitions(tenantId);
    const pendingCount = requisitions.filter(r => r.status === 'PENDING_WAREHOUSE_FULFILLMENT').length;

    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div class="card" style="background:var(--bg-surface-1); padding:16px 20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="font-size:1.15rem; margin:0; font-weight:700;">📩 Kitchen Stock Request Lifecycle Tracker (${requisitions.length})</h3>
              <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                Track material requisitions submitted to Inventory Manager for Main Warehouse stock transfer or PO fulfillment.
              </div>
            </div>
            ${pendingCount > 0 ? `
              <span class="badge badge-warning" style="font-size:0.85rem; padding:6px 12px; font-weight:700;">⏳ ${pendingCount} Pending Fulfillment</span>
            ` : `
              <span class="badge badge-success" style="font-size:0.85rem; padding:6px 12px; font-weight:700;">✓ All Requests Fulfilled</span>
            `}
          </div>
        </div>

        ${requisitions.length > 0 ? `
          <div style="display:flex; flex-direction:column; gap:14px;">
            ${requisitions.map(req => `
              <div class="card" style="background:var(--bg-surface-1); padding:18px; border:1px solid var(--border-subtle); border-radius:8px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
                  <div>
                    <span class="badge badge-info" style="font-size:0.8rem; font-family:monospace; font-weight:700;">${req.reqCode}</span>
                    <h4 style="font-size:1.1rem; margin:6px 0 2px; font-weight:700;">Requisition for ${req.inventoryItemName}</h4>
                    <div style="font-size:0.78rem; color:var(--text-muted);">
                      Requested By: <strong>${req.requestedBy || 'Kitchen Staff'}</strong> • Target Batch Yield: <strong>${req.targetQuantity} ${req.targetUom}</strong> • Submitted: ${new Date(req.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <div>
                    ${req.status === 'PENDING_WAREHOUSE_FULFILLMENT' ? `
                      <span class="badge badge-warning" style="font-size:0.85rem; padding:6px 12px; font-weight:700;">⏳ PENDING WAREHOUSE FULFILLMENT</span>
                    ` : (req.status === 'TRANSFERRED' ? `
                      <span class="badge badge-success" style="font-size:0.85rem; padding:6px 12px; font-weight:700;">🟢 TRANSFERRED TO KITCHEN</span>
                    ` : `
                      <span class="badge badge-info" style="font-size:0.85rem; padding:6px 12px; font-weight:700;">🛒 PO FULFILLED</span>
                    `)}
                  </div>
                </div>

                <!-- Items Table -->
                <div style="margin-top:14px; border-top:1px solid var(--border-subtle); padding-top:10px;">
                  <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">REQUESTED ITEMS SUMMARY</div>
                  <div class="table-responsive">
                    <table class="data-table" style="width:100%;">
                      <thead>
                        <tr style="font-size:0.75rem; color:var(--text-muted); background:var(--bg-surface-2);">
                          <th style="padding:6px 10px;">Item Name</th>
                          <th style="padding:6px 10px;">Required Batch Qty</th>
                          <th style="padding:6px 10px;">Kitchen On-Hand</th>
                          <th style="padding:6px 10px;">Requested Shortage Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${(req.items || []).map(item => `
                          <tr style="font-size:0.825rem; border-bottom:1px solid var(--border-subtle);">
                            <td style="padding:8px 10px;"><strong>${item.inventoryItemName}</strong> <code style="font-size:0.7rem; color:var(--text-muted);">${item.inventoryItemCode}</code></td>
                            <td style="padding:8px 10px;">${item.scaledBaseQty} ${item.baseUom}</td>
                            <td style="padding:8px 10px; color:var(--text-muted);">${item.currentStock} ${item.baseUom}</td>
                            <td style="padding:8px 10px; font-weight:700; color:var(--status-danger);">${item.shortageQty > 0 ? `${item.shortageQty} ${item.baseUom}` : `${item.scaledBaseQty} ${item.baseUom}`}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- Footer Status Tracking -->
                <div style="margin-top:12px; border-top:1px solid var(--border-subtle); padding-top:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                  <div style="font-size:0.8rem; color:var(--text-muted);">
                    👨‍💼 <strong>Inventory Manager Action:</strong> ${req.status === 'PENDING_WAREHOUSE_FULFILLMENT' ? 'Pending warehouse transfer or supplier PO.' : `Fulfilled on ${req.fulfilledAt ? new Date(req.fulfilledAt).toLocaleString() : 'N/A'} via ${req.fulfillmentType === 'MAIN_WAREHOUSE_TRANSFER' ? 'Main Warehouse Transfer' : 'Supplier Purchase Order'}`}
                  </div>
                  <button class="btn-secondary btn-view-request-audit" data-id="${req.id}" style="padding:4px 10px; font-size:0.75rem; font-weight:700; cursor:pointer;">
                    📜 View Audit Details
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="card" style="background:var(--bg-surface-1); padding:40px; text-align:center; color:var(--text-muted);">
            <div style="font-size:2.5rem; margin-bottom:8px;">📩</div>
            <h3 style="font-size:1.2rem; color:var(--text-main); margin:0 0 6px;">No Stock Requests Submitted Yet</h3>
            <p style="font-size:0.875rem; max-width:480px; margin:0 auto;">
              When stock shortage occurs, click "Request Stock" from the Available or Low Stock tabs to request materials from Main Warehouse.
            </p>
          </div>
        `}
      </div>
    `;
  }

  // --- MODAL 1: WHERE IS IT? LOCATION DRAWER ---
  renderLocationModalHTML(tenantId) {
    const item = this.locationModalItem;
    if (!item) return '';

    const balances = offlineStore.getCollection('stock_balances', tenantId) || [];
    const locations = offlineStore.getCollection('storage_locations', tenantId) || [];

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

          <div style="display:flex; flex-direction:column; gap:16px;">
            <div style="padding:14px; background:var(--bg-surface-2); border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL KITCHEN AVAILABLE</div>
                <div style="font-size:1.5rem; font-weight:800; color:var(--accent-primary);">${item.availableQty} ${item.baseUom}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">REORDER LEVEL</div>
                <div style="font-size:1.2rem; font-weight:700;">${item.reorderLevel} ${item.baseUom}</div>
              </div>
            </div>

            <!-- Locations Breakdown Table -->
            <div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">STORAGE LOCATION BREAKDOWN</div>
              <div class="table-responsive">
                <table class="data-table" style="width:100%;">
                  <thead>
                    <tr style="font-size:0.75rem; color:var(--text-muted); background:var(--bg-surface-2);">
                      <th style="padding:8px 12px;">Location Name</th>
                      <th style="padding:8px 12px;">Code</th>
                      <th style="padding:8px 12px; text-align:right;">On-Hand Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style="font-size:0.85rem; border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:8px 12px; font-weight:700;">Kitchen Store</td>
                      <td style="padding:8px 12px; font-family:monospace;">LOC-KITCHEN</td>
                      <td style="padding:8px 12px; text-align:right; font-weight:800; color:var(--status-success);">${item.availableQty} ${item.baseUom}</td>
                    </tr>
                    ${itemBals.length > 0 ? itemBals.map(b => {
                      const loc = locations.find(l => l.locationCode === b.locationCode) || {};
                      return `
                        <tr style="font-size:0.85rem; border-bottom:1px solid var(--border-subtle);">
                          <td style="padding:8px 12px;">${loc.locationName || b.locationCode}</td>
                          <td style="padding:8px 12px; font-family:monospace;">${b.locationCode}</td>
                          <td style="padding:8px 12px; text-align:right; font-weight:700;">${b.currentStock || b.quantity || 0} ${item.baseUom}</td>
                        </tr>
                      `;
                    }).join('') : `
                      <tr style="font-size:0.85rem; border-bottom:1px solid var(--border-subtle);">
                        <td style="padding:8px 12px;">Main Warehouse</td>
                        <td style="padding:8px 12px; font-family:monospace;">LOC-MWH</td>
                        <td style="padding:8px 12px; text-align:right; color:var(--text-muted);">Stored in Main Warehouse</td>
                      </tr>
                    `}
                  </tbody>
                </table>
              </div>
            </div>

            <div style="font-size:0.78rem; color:var(--text-muted); background:var(--bg-surface-2); padding:10px; border-radius:6px; line-height:1.4;">
              ℹ️ Kitchen staff can view stock across locations, but cannot perform direct transfers. Submit a Stock Request to Inventory Manager for warehouse fulfillment.
            </div>

            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:6px;">
              <button id="btn-modal-trigger-request" class="btn-primary" style="width:100%; padding:10px; font-weight:700; background:var(--accent-primary);">
                📩 Request Transfer from Main Warehouse
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --- MODAL 2: REQUEST STOCK MODAL ---
  renderRequestModalHTML(tenantId) {
    const item = this.requestModalItem;
    if (!item) return '';

    const defaultReqQty = Math.max(1, parseFloat((item.reorderLevel > item.availableQty ? item.reorderLevel - item.availableQty : 5).toFixed(2)));

    return `
      <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999; padding:20px;">
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); width:100%; max-width:500px; padding:24px; border-radius:12px; border:1px solid var(--border-subtle); box-shadow:var(--shadow-lg);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:12px; margin-bottom:16px;">
            <div>
              <span class="badge badge-info" style="font-size:0.75rem;">Material Requisition</span>
              <h3 style="font-size:1.3rem; margin:4px 0 0; font-weight:700;">Request Kitchen Stock</h3>
            </div>
            <button id="btn-close-request-modal" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">✕</button>
          </div>

          <form id="form-submit-stock-request" style="display:flex; flex-direction:column; gap:14px;">
            <div style="padding:12px; background:var(--bg-surface-2); border-radius:6px; font-size:0.85rem;">
              <div>Item: <strong>${item.name} (${item.code})</strong></div>
              <div>Current Kitchen Stock: <strong style="color:var(--status-danger);">${item.availableQty} ${item.baseUom}</strong> • Reorder Level: <strong>${item.reorderLevel} ${item.baseUom}</strong></div>
            </div>

            <div>
              <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">REQUESTED QUANTITY (${item.baseUom}) *</label>
              <input type="number" id="inp-req-quantity" value="${defaultReqQty}" step="0.1" min="0.1" style="width:100%; padding:10px; font-weight:800; font-size:1.1rem;" required>
            </div>

            <div>
              <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">REQUEST FROM SOURCE LOCATION</label>
              <select id="inp-req-source" style="width:100%; padding:10px; font-weight:600;">
                <option value="MAIN_WAREHOUSE" selected>Main Warehouse (LOC-MWH)</option>
                <option value="MAIN_CHILLER">Main Chiller (LOC-CHILL)</option>
                <option value="FREEZER">Freezer (LOC-FREEZE)</option>
              </select>
            </div>

            <div>
              <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">REASON / NOTES</label>
              <input type="text" id="inp-req-reason" value="Kitchen stock replenishment" placeholder="e.g. Daily cooking prep replenishment..." style="width:100%; padding:10px;">
            </div>

            <div style="font-size:0.75rem; color:var(--text-muted); background:var(--bg-surface-2); padding:10px; border-radius:6px; line-height:1.4;">
              📩 Submitting creates a Stock Requisition for <strong>Inventory Manager Workspace</strong>. Stock will be credited upon warehouse transfer or supplier PO.
            </div>

            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:8px;">
              <button type="submit" class="btn-primary" style="width:100%; padding:12px; font-weight:700; background:var(--status-success); cursor:pointer;">
                📩 Submit Requisition to Inventory Manager
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  // --- MODAL 3: REQUEST AUDIT LIFECYCLE MODAL ---
  renderRequestAuditModalHTML(tenantId) {
    const req = this.requestDetailModalItem;
    if (!req) return '';

    return `
      <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999; padding:20px;">
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); width:100%; max-width:540px; padding:24px; border-radius:12px; border:1px solid var(--border-subtle); box-shadow:var(--shadow-lg);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:12px; margin-bottom:16px;">
            <div>
              <span class="badge badge-info" style="font-family:monospace;">${req.reqCode}</span>
              <h3 style="font-size:1.3rem; margin:4px 0 0; font-weight:700;">Requisition Lifecycle Audit</h3>
            </div>
            <button id="btn-close-audit-modal" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">✕</button>
          </div>

          <div style="display:flex; flex-direction:column; gap:14px;">
            <div style="padding:12px; background:var(--bg-surface-2); border-radius:6px; font-size:0.85rem;">
              <div>Target Preparation: <strong>${req.inventoryItemName}</strong></div>
              <div>Submitted By: <strong>${req.requestedBy || 'Kitchen Staff'}</strong></div>
              <div>Submitted Date: <strong>${new Date(req.createdAt).toLocaleString()}</strong></div>
            </div>

            <!-- Lifecycle Steps -->
            <div style="border-top:1px solid var(--border-subtle); padding-top:12px;">
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:10px;">REQUISITION FULFILLMENT LIFECYCLE</div>
              <div style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; align-items:center; gap:10px; background:var(--bg-surface-2); padding:10px; border-radius:6px;">
                  <span style="font-size:1.2rem;">📩</span>
                  <div>
                    <div style="font-weight:700; font-size:0.85rem;">1. Requisition Submitted</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${new Date(req.createdAt).toLocaleString()}</div>
                  </div>
                </div>

                <div style="display:flex; align-items:center; gap:10px; background:var(--bg-surface-2); padding:10px; border-radius:6px; opacity:${req.status !== 'PENDING_WAREHOUSE_FULFILLMENT' ? '1' : '0.5'};">
                  <span style="font-size:1.2rem;">👨‍💼</span>
                  <div>
                    <div style="font-weight:700; font-size:0.85rem;">2. Inventory Manager Review</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${req.status !== 'PENDING_WAREHOUSE_FULFILLMENT' ? 'Approved & Processed' : 'Pending Review'}</div>
                  </div>
                </div>

                <div style="display:flex; align-items:center; gap:10px; background:var(--bg-surface-2); padding:10px; border-radius:6px; opacity:${req.status !== 'PENDING_WAREHOUSE_FULFILLMENT' ? '1' : '0.5'};">
                  <span style="font-size:1.2rem;">🚚</span>
                  <div>
                    <div style="font-weight:700; font-size:0.85rem;">3. Stock Transfer / PO Fulfillment</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${req.fulfilledAt ? `${req.fulfillmentType === 'MAIN_WAREHOUSE_TRANSFER' ? 'Main Warehouse Transfer' : `Supplier PO (${req.poNumber || ''})`} at ${new Date(req.fulfilledAt).toLocaleString()}` : 'Awaiting fulfillment'}</div>
                  </div>
                </div>
              </div>
            </div>

            <div style="display:flex; justify-content:flex-end; margin-top:8px;">
              <button id="btn-close-audit-modal-btn" class="btn-secondary" style="width:100%; padding:10px; font-weight:700;">
                Close Audit
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --- EVENT BINDING ---
  bindEvents(container, session, tenantId) {
    // Subtab Switching
    container.querySelectorAll('.btn-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.render(container, session);
      });
    });

    // Available Stock Search & Pill Filters
    const inpSearch = container.querySelector('#inp-search-kitchen-stock');
    if (inpSearch) {
      inpSearch.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        const main = container.querySelector('#kitchen-inventory-body');
        if (main) main.innerHTML = this.renderActiveTabContent(session, tenantId);
        this.bindEvents(container, session, tenantId);
      });
    }

    container.querySelectorAll('.btn-filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.typeFilter = btn.dataset.filter;
        const main = container.querySelector('#kitchen-inventory-body');
        if (main) main.innerHTML = this.renderActiveTabContent(session, tenantId);
        this.bindEvents(container, session, tenantId);
      });
    });

    // "Where is it?" View Locations Buttons
    container.querySelectorAll('.btn-view-locations').forEach(btn => {
      btn.addEventListener('click', () => {
        const inventory = this.getEnrichedInventory(tenantId);
        this.locationModalItem = inventory.find(i => i.code === btn.dataset.code) || null;
        this.render(container, session);
      });
    });

    // Trigger Request Stock Buttons (from Low Stock or Location Modal)
    container.querySelectorAll('.btn-trigger-request-stock').forEach(btn => {
      btn.addEventListener('click', () => {
        const inventory = this.getEnrichedInventory(tenantId);
        this.requestModalItem = inventory.find(i => i.code === btn.dataset.code) || null;
        this.render(container, session);
      });
    });

    const triggerModalReq = container.querySelector('#btn-modal-trigger-request');
    if (triggerModalReq) {
      triggerModalReq.addEventListener('click', () => {
        this.requestModalItem = this.locationModalItem;
        this.locationModalItem = null;
        this.render(container, session);
      });
    }

    // Modal Close Buttons
    const closeLocBtn = container.querySelector('#btn-close-location-modal');
    if (closeLocBtn) {
      closeLocBtn.addEventListener('click', () => {
        this.locationModalItem = null;
        this.render(container, session);
      });
    }

    const closeReqBtn = container.querySelector('#btn-close-request-modal');
    if (closeReqBtn) {
      closeReqBtn.addEventListener('click', () => {
        this.requestModalItem = null;
        this.render(container, session);
      });
    }

    const closeAuditBtn = container.querySelector('#btn-close-audit-modal');
    const closeAuditBtn2 = container.querySelector('#btn-close-audit-modal-btn');
    if (closeAuditBtn) {
      closeAuditBtn.addEventListener('click', () => {
        this.requestDetailModalItem = null;
        this.render(container, session);
      });
    }
    if (closeAuditBtn2) {
      closeAuditBtn2.addEventListener('click', () => {
        this.requestDetailModalItem = null;
        this.render(container, session);
      });
    }

    // View Request Audit Detail Buttons
    container.querySelectorAll('.btn-view-request-audit').forEach(btn => {
      btn.addEventListener('click', () => {
        const requisitions = productionModel.getStockRequisitions(tenantId);
        this.requestDetailModalItem = requisitions.find(r => r.id === btn.dataset.id) || null;
        this.render(container, session);
      });
    });

    // Submit Stock Request Form
    const reqForm = container.querySelector('#form-submit-stock-request');
    if (reqForm) {
      reqForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const item = this.requestModalItem;
        if (!item) return;

        const reqQty = parseFloat(container.querySelector('#inp-req-quantity').value) || 1;
        const sourceLoc = container.querySelector('#inp-req-source').value;
        const reason = container.querySelector('#inp-req-reason').value;

        const req = productionModel.createStockRequisition({
          prepBomId: `req-${item.code}`,
          prepBomCode: `REQ-${item.code}`,
          inventoryItemName: item.name,
          targetQuantity: reqQty,
          targetUom: item.baseUom,
          items: [{
            inventoryItemCode: item.code,
            inventoryItemName: item.name,
            scaledRecipeQty: reqQty,
            recipeUom: item.baseUom,
            scaledBaseQty: reqQty,
            baseUom: item.baseUom,
            currentStock: item.availableQty,
            shortageQty: reqQty
          }],
          notes: reason
        }, tenantId);

        alert(`📦 Stock Requisition "${req.reqCode}" Submitted!\n\nRequested ${reqQty} ${item.baseUom} of ${item.name}.\nRequisition is pending fulfillment by Inventory Manager.`);

        this.requestModalItem = null;
        this.activeTab = 'REQUESTS';
        this.render(container, session);
      });
    }
  }
}

const kitchenInventoryView = new KitchenInventoryView();

export { KitchenInventoryView, kitchenInventoryView };
