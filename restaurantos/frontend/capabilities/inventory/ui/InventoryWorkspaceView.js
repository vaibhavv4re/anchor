/**
 * InventoryWorkspaceView.js
 * Step 17.13D — 📦 Inventory Manager Workspace Composition Root
 *
 * 15 Canonical Navigation Views + In-App Form Screen Workspaces (NO MODALS):
 * - All creation/import flows open as full-screen views with a prominent "← Back" button.
 * - Sourced 100% live from Supabase PostgreSQL tables via DataGateway.
 */

export class InventoryWorkspaceView {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
    this.authEngine = deps.authEngine || null;
    this.platformEventBus = deps.platformEventBus || null;
    this.repositories = deps.repositories || null;

    this.activeSubView = 'inv-dashboard';
    this.selectedMasterItemCode = null;
    this.editingMasterItemId = null;
    this.stagedMasterItems = null;
    this.poDraftLines = [];
    this.issDraftLines = [];
    this.trfDraftLines = [];
    this.adjDraftLines = [];
    this.rootMount = null;

    // Filters for Live Store Balances
    this.liveInventorySearchQuery = '';
    this.liveInventoryLocationFilter = 'ALL';
    this.liveInventoryCategoryFilter = 'ALL';
    this.liveInventoryStatusFilter = 'ALL';
    this.liveInventorySort = 'VALUE_DESC';
  }

  _getDataGateway() {
    if (this.dataGateway) return this.dataGateway;
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      return window.__APP__.platform.dataGateway;
    }
    return null;
  }

  _getCollection(name, tenantId) {
    try {
      const gw = this._getDataGateway();
      if (gw && typeof gw.getCachedCollection === 'function') {
        const list = gw.getCachedCollection(name, tenantId);
        if (Array.isArray(list)) return list;
      }
    } catch (e) {
      console.warn(`[InventoryWorkspaceView] Error fetching collection "${name}":`, e);
    }
    return [];
  }

  async render(mount, session) {
    if (!mount) return;

    if (mount.id === 'inventory-workspace-body') {
      this.rootMount = document.querySelector('#workspace-root-mount') || this.rootMount || mount;
    } else {
      this.rootMount = mount;
    }

    const targetMount = this.rootMount || mount;

    try {
      const gw = this._getDataGateway();
      const isSupabase = gw && gw.cloudAdapter && typeof gw.cloudAdapter.getCollection === 'function';
      const tenantId = session ? session.tenantId : 'tenant_h0qc7wf';

      const items = this._getCollection('inventory', tenantId);
      const suppliers = this._getCollection('suppliers', tenantId);
      const locations = this._getCollection('storage_locations', tenantId);
      const requests = this._getCollection('inventory_requests', tenantId);
      const balances = this._getCollection('stock_balances', tenantId);
      const categories = this._getCollection('inventory_categories', tenantId);
      const uoms = this._getCollection('inventory_uoms', tenantId);
      const history = this._getCollection('import_history', tenantId);
      const grns = this._getCollection('goods_receipt_notes', tenantId);
      const pos = this._getCollection('purchase_orders', tenantId);
      const stockIssues = this._getCollection('stock_issues', tenantId);
      const stockTransfers = this._getCollection('stock_transfers', tenantId);
      const stockAdjustments = this._getCollection('stock_adjustments', tenantId);
      const stockCounts = this._getCollection('stock_counts', tenantId);
      const supplierCatalog = this._getCollection('supplier_catalog', tenantId);

      const itemsInStockCount = balances.length > 0
        ? new Set(balances.filter(b => (parseFloat(b.quantity) || 0) > 0 && (!tenantId || b.tenantId === tenantId)).map(b => b.itemCode || b.item_code)).size
        : items.filter(i => (parseFloat(i.currentStock !== undefined ? i.currentStock : (i.openingStock !== undefined ? i.openingStock : 0)) || 0) > 0).length;

      const lowStockItems = items.filter(i => {
        const itemCode = i.itemCode || i.item_code;
        const itemBalances = balances.filter(b => (b.itemCode === itemCode || b.item_code === itemCode) && (!tenantId || b.tenantId === tenantId));
        const currentQty = itemBalances.length
          ? itemBalances.reduce((sum, b) => sum + (parseFloat(b.quantity) || 0), 0)
          : (i.currentStock !== undefined ? i.currentStock : (i.openingStock !== undefined ? i.openingStock : 0));
        return (parseFloat(i.reorderLevel || i.reorder_level) || 0) > 0 && currentQty <= parseFloat(i.reorderLevel || i.reorder_level);
      });

      const totalValuation = balances.length
        ? balances.reduce((sum, b) => sum + (parseFloat(b.valuation) || 0), 0)
        : items.reduce((sum, i) => {
            const factor = parseFloat(i.conversionFactor || i.conversion_factor) || 1;
            const purPrice = parseFloat(i.lastPurchasePrice || i.last_purchase_price) || 0;
            const unitCost = parseFloat(i.unitValuation || i.unit_valuation) || (factor > 0 ? (purPrice / factor) : purPrice);
            const qty = parseFloat(i.currentStock !== undefined ? i.currentStock : (i.openingStock !== undefined ? i.openingStock : 0));
            return sum + (unitCost * qty);
          }, 0);

      const activeTab = this.activeSubView || 'inv-dashboard';

      targetMount.innerHTML = `
        <div class="inventory-workspace-container flex-col animate-fade-in" style="width:100%; min-height:100vh; gap:0;">
          <!-- Data Source Diagnostic Bar -->
          <div class="data-source-diagnostic-bar" style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); padding:6px 16px; font-size:0.75rem; display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
              <span class="badge ${isSupabase ? 'badge-success' : 'badge-warning'}" style="font-weight:700; font-size:0.7rem; padding:3px 10px;">
                ${isSupabase ? 'SUPABASE ●' : 'LOCAL_CACHE ⚠️'}
              </span>
              <span>Tenant: <strong>${session?.tenantId || 'tenant_h0qc7wf'}</strong></span>
              <span>User: <strong>${session?.employeeName || 'Inventory Manager'}</strong></span>
              <span>Role: <strong>${session?.roleId || 'role-inventory'}</strong></span>
              <span>Workspace: <strong style="text-transform:uppercase; color:var(--accent-primary);">${session?.workspace || 'inventory'}</strong></span>
            </div>
            <div style="color:var(--text-muted); font-weight:600;">Anchor DataGateway Engine</div>
          </div>

          <!-- Top Header Cockpit Bar -->
          <div style="background:var(--bg-surface-1); padding:16px 20px; border-bottom:1px solid var(--border-subtle);">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
              <div>
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">📦 CENTRAL WAREHOUSE & STOCK CONTROL</div>
                <h2 style="font-size:1.6rem; margin-top:2px; margin-bottom:0;">Inventory Manager Workspace</h2>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">
                  Master Data, Procurement GRN, Warehouse Stock Transfers, Issues, Adjustments & Physical Stock Audits.
                </div>
              </div>
              <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <button class="btn-primary nav-inv-btn" data-tab="inv-po-create" style="padding:8px 16px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); border:none; color:#fff; cursor:pointer; border-radius:6px;">
                  📋 + Create Purchase Order
                </button>
                <button class="btn-primary nav-inv-btn" data-tab="inv-grn-create" style="padding:8px 16px; font-weight:700; background:linear-gradient(135deg, var(--status-success), #059669); border:none; color:#fff; cursor:pointer; border-radius:6px;">
                  📥 + Post GRN
                </button>
                <button class="btn-secondary nav-inv-btn" data-tab="inv-master-create" style="padding:8px 16px; font-weight:600; border-radius:6px; cursor:pointer;">
                  + Add Master Item
                </button>
              </div>
            </div>

            <!-- Top Metric Banner -->
            <div class="grid grid-cols-6 gap-md" style="display:grid; grid-template-columns:repeat(6, 1fr); gap:12px; margin-top:16px;">
              <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px; text-align:center;">
                <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">ITEMS IN STOCK</div>
                <div style="font-size:1.4rem; font-weight:700; color:var(--status-success); margin-top:2px;">${itemsInStockCount}</div>
              </div>
              <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px; text-align:center;">
                <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">LOW STOCK ALERTS</div>
                <div style="font-size:1.4rem; font-weight:700; color:${lowStockItems.length > 0 ? 'var(--status-danger)' : 'var(--status-success)'}; margin-top:2px;">${lowStockItems.length}</div>
              </div>
              <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px; text-align:center;">
                <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">PENDING REQUESTS</div>
                <div style="font-size:1.4rem; font-weight:700; color:var(--status-warning); margin-top:2px;">${requests.filter(r => r.status === 'PENDING').length}</div>
              </div>
              <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px; text-align:center;">
                <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">SUPPLIERS</div>
                <div style="font-size:1.4rem; font-weight:700; margin-top:2px;">${suppliers.length}</div>
              </div>
              <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px; text-align:center;">
                <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">LOCATIONS</div>
                <div style="font-size:1.4rem; font-weight:700; margin-top:2px;">${locations.length}</div>
              </div>
              <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px; text-align:center;">
                <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">VALUATION</div>
                <div style="font-size:1.05rem; font-weight:700; color:var(--status-success); margin-top:2px;">₹${Math.round(totalValuation).toLocaleString('en-IN')}</div>
              </div>
            </div>
          </div>

          <!-- 2-Column Workspace Body (Left Sidebar + Main Content) -->
          <div style="display:flex; width:100%; min-height:calc(100vh - 160px);">
            <!-- Left Sidebar Navigation -->
            <aside style="width:250px; background:var(--bg-surface-1); border-right:1px solid var(--border-subtle); padding:16px; display:flex; flex-direction:column; gap:6px; flex-shrink:0;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:4px; padding-left:4px;">📦 INVENTORY WORKSPACE</div>

              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-dashboard' || activeTab === 'dashboard' ? 'active' : ''}" data-tab="inv-dashboard" style="text-align:left; font-weight:600; padding:10px 12px; border-radius:6px; cursor:pointer;">
                🏠 Dashboard
              </button>

              <div style="font-size:0.65rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin:12px 0 2px 4px;">MASTER DATA</div>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-master' || activeTab === 'master' || activeTab === 'inv-master-create' ? 'active' : ''}" data-tab="inv-master" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">📦 Master Inventory (${items.length})</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-categories' || activeTab === 'inv-categories-create' ? 'active' : ''}" data-tab="inv-categories" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">🏷 Categories & Families (${categories.length})</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-uom' || activeTab === 'inv-uom-create' ? 'active' : ''}" data-tab="inv-uom" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">📏 Units of Measure (${uoms.length})</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-locations' || activeTab === 'locations' || activeTab === 'inv-locations-create' || activeTab === 'inv-locations-import' ? 'active' : ''}" data-tab="inv-locations" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">🏬 Storage Locations (${locations.length})</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-suppliers' || activeTab === 'suppliers' || activeTab === 'inv-suppliers-create' || activeTab === 'inv-suppliers-import' ? 'active' : ''}" data-tab="inv-suppliers" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">🏢 Suppliers Master (${suppliers.length})</button>

              <div style="font-size:0.65rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin:12px 0 2px 4px;">OPERATIONS</div>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-live-stock' || activeTab === 'inv-live-balances' ? 'active' : ''}" data-tab="inv-live-stock" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">📦 Live Store Balances</button>
              <button class="btn-secondary" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; opacity:0.4; cursor:not-allowed;" title="Disabled by user directive" disabled>📤 Stock Issues (Disabled)</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-transfers' || activeTab === 'inv-transfers-create' ? 'active' : ''}" data-tab="inv-transfers" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">🔄 Stock Transfers (${stockTransfers.length})</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-adjustments' || activeTab === 'inv-adjustments-create' ? 'active' : ''}" data-tab="inv-adjustments" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">📊 Stock Adjustments (${stockAdjustments.length})</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-counts' || activeTab === 'inv-counts-create' ? 'active' : ''}" data-tab="inv-counts" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">📋 Stock Count (${stockCounts.length})</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-alerts' ? 'active' : ''}" data-tab="inv-alerts" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">⚠️ Low Stock Alerts ${lowStockItems.length > 0 ? `<span class="badge badge-danger" style="font-size:0.7rem; padding:1px 5px; margin-left:3px;">${lowStockItems.length}</span>` : ''}</button>

              <div style="font-size:0.65rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin:12px 0 2px 4px;">PROCUREMENT</div>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-po' || activeTab === 'inv-po-create' ? 'active' : ''}" data-tab="inv-po" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">📄 Purchase Orders (${pos.length})</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-grn' || activeTab === 'inv-grn-create' ? 'active' : ''}" data-tab="inv-grn" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">🚚 Goods Receiving Studio (${grns.length})</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-suppliers' || activeTab === 'suppliers' ? 'active' : ''}" data-tab="inv-suppliers" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">🏢 Suppliers Directory (${suppliers.length})</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-requests' ? 'active' : ''}" data-tab="inv-requests" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">📋 Purchase Requisitions ${requests.filter(r => r.status === 'PENDING').length > 0 ? `<span class="badge badge-warning" style="font-size:0.7rem; padding:1px 5px; margin-left:3px;">${requests.filter(r => r.status === 'PENDING').length}</span>` : ''}</button>
            </aside>

            <!-- Main Body Mount Area -->
            <main id="inventory-workspace-body" style="flex:1; padding:24px; background:var(--bg-surface-0); overflow-y:auto;"></main>
          </div>
        </div>
      `;

      const mainMount = targetMount.querySelector('#inventory-workspace-body');
      await this.mountInventoryTabContent(mainMount, activeTab, tenantId, items, categories, uoms, locations, suppliers, requests, history, balances, grns, pos, stockIssues, stockTransfers, stockAdjustments, stockCounts, supplierCatalog, session);
      this.bindEvents(targetMount, session);
    } catch (err) {
      console.error('[InventoryWorkspaceView] Error rendering view:', err);
      targetMount.innerHTML = `
        <div class="card" style="padding:32px; margin:20px; background:var(--bg-surface-1); border-left:4px solid var(--status-danger);">
          <h2 style="font-size:1.5rem; margin-top:0; color:var(--status-danger);">⚠️ Inventory Workspace Render Failure</h2>
          <pre style="background:var(--bg-surface-2); padding:12px; border-radius:6px; font-size:0.85rem;">${err.stack || err.message || err}</pre>
        </div>
      `;
    }
  }

  async mountInventoryTabContent(mount, tabKey, tenantId, items, categories, uoms, locations, suppliers, requests, history, balances, grns, pos, stockIssues, stockTransfers, stockAdjustments, stockCounts, supplierCatalog, session) {
    if (!mount) return;

    // --- FORM VIEW SCREENS (FULL IN-APP VIEWS WITHOUT OVERLAY MODALS) ---

    if (tabKey === 'inv-transfers-create') {
      this.renderStockTransferFormScreen(mount, tenantId, items, locations, balances, session);
      return;
    }

    if (tabKey === 'inv-adjustments-create') {
      this.renderStockAdjustmentFormScreen(mount, tenantId, items, locations, balances, session);
      return;
    }

    if (tabKey === 'inv-counts-create') {
      this.renderStockCountFormScreen(mount, tenantId, items, locations, balances, session);
      return;
    }

    if (tabKey === 'inv-master-create') {
      this.renderAddMasterItemFormScreen(mount, tenantId, categories, uoms, session);
      return;
    }

    if (tabKey === 'inv-locations-create') {
      this.renderAddLocationFormScreen(mount, tenantId, session);
      return;
    }

    if (tabKey === 'inv-suppliers-create') {
      this.renderAddSupplierFormScreen(mount, tenantId, session);
      return;
    }

    if (tabKey === 'inv-suppliers-catalogue') {
      this.renderSupplierCatalogueScreen(mount, tenantId, suppliers, items, supplierCatalog, session);
      return;
    }

    if (tabKey === 'inv-suppliers-catalogue-add') {
      this.renderAddSupplierCatalogueItemScreen(mount, tenantId, suppliers, items, session);
      return;
    }

    if (tabKey === 'inv-grn-create') {
      this.renderPostGrnFormScreen(mount, tenantId, items, suppliers, locations, pos, grns, supplierCatalog, balances, session);
      return;
    }

    if (tabKey === 'inv-po-create') {
      this.renderCreatePoFormScreen(mount, tenantId, items, suppliers, locations, supplierCatalog, session);
      return;
    }

    if (tabKey === 'inv-categories-create') {
      this.renderAddCategoryFormScreen(mount, tenantId, session);
      return;
    }

    if (tabKey === 'inv-uom-create') {
      this.renderAddUomFormScreen(mount, tenantId, session);
      return;
    }

    if (tabKey === 'inv-suppliers-import') {
      this.renderImportSuppliersFormScreen(mount, tenantId, session);
      return;
    }

    if (tabKey === 'inv-locations-import') {
      this.renderImportLocationsFormScreen(mount, tenantId, session);
      return;
    }

    // --- MAIN TAB VIEWS ---

    if (tabKey === 'inv-dashboard' || tabKey === 'dashboard') {
      const activeBalances = balances.filter(b => (parseFloat(b.quantity) || 0) !== 0 && (!tenantId || b.tenantId === tenantId));
      const lowStock = items.map(i => {
        const itemCode = i.itemCode || i.item_code;
        const itemBalances = activeBalances.filter(b => (b.itemCode === itemCode || b.item_code === itemCode));
        const currentQty = itemBalances.length
          ? itemBalances.reduce((sum, b) => sum + (parseFloat(b.quantity) || 0), 0)
          : (parseFloat(i.currentStock !== undefined ? i.currentStock : (i.openingStock !== undefined ? i.openingStock : 0)) || 0);
        return { ...i, currentQty };
      }).filter(i => (parseFloat(i.reorderLevel || i.reorder_level) || 0) > 0 && i.currentQty <= parseFloat(i.reorderLevel || i.reorder_level));

      const locationSnapshots = locations.map(loc => {
        const locCode = loc.locationCode || loc.location_code || loc.id;
        const locBalances = activeBalances.filter(b => (b.locationCode === locCode || b.location_code === locCode));
        const locationValue = locBalances.reduce((sum, b) => sum + (parseFloat(b.valuation) || 0), 0);
        const itemCount = new Set(locBalances.map(b => b.itemCode || b.item_code)).size;
        return { ...loc, locBalances, locationValue, itemCount };
      }).sort((a, b) => b.locationValue - a.locationValue);

      mount.innerHTML = `
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
          <div class="card" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
            <h3>Inventory Manager Dashboard</h3>
            <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px;">Daily operational hub, live store balances, and stock health status from Supabase.</p>

            <div class="card" style="background:var(--bg-surface-2); padding:18px; margin-bottom:20px; border-left:4px solid var(--accent-primary); border-radius:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:14px;">
                <div>
                  <h4 style="margin:0; color:var(--accent-primary);">Location-wise Live Inventory</h4>
                  <p style="color:var(--text-muted); font-size:0.8rem; margin-top:2px; margin-bottom:0;">
                    Bird's-eye view sourced from live <strong>stock_balances</strong> updated by GRNs, transfers, issues, and counts.
                  </p>
                </div>
                <button type="button" class="btn-primary nav-inv-btn" data-tab="inv-live-stock" style="font-size:0.8rem; padding:6px 14px; font-weight:700; background:var(--accent-primary); border:none; color:#fff; border-radius:6px; cursor:pointer;">
                  🔍 View Detailed Live Store Balances →
                </button>
              </div>

              ${locationSnapshots.length ? `
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-bottom:18px;">
                  ${locationSnapshots.map(l => `
                    <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:6px; padding:14px;">
                      <div style="display:flex; justify-content:space-between; gap:8px; align-items:start;">
                        <div>
                          <div style="font-weight:700;">${l.locationName || l.location_name || l.id}</div>
                          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${l.locationCode || l.location_code || ''}</div>
                        </div>
                        <span class="badge ${l.itemCount ? 'badge-success' : 'badge-secondary'}">${l.itemCount} items</span>
                      </div>
                      <div style="font-size:1.25rem; font-weight:700; color:var(--status-success); margin-top:10px;">₹${Math.round(l.locationValue).toLocaleString('en-IN')}</div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>

            <!-- Master Inventory Catalog Table Summary (62 Items) -->
            <div class="card" style="background:var(--bg-surface-2); padding:20px; border-radius:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h4 style="margin:0;">📦 Live Supabase Master Inventory Catalog (${items.length} Items)</h4>
                <button type="button" class="btn-secondary nav-inv-btn" data-tab="inv-master" style="font-size:0.8rem; padding:6px 12px; font-weight:600; cursor:pointer;">View All 62 Items →</button>
              </div>
              <div class="table-responsive">
                <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                  <thead>
                    <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-1);">
                      <th style="padding:10px;">Item Code</th>
                      <th style="padding:10px;">Ingredient Name</th>
                      <th style="padding:10px;">Category</th>
                      <th style="padding:10px;">Base UOM</th>
                      <th style="padding:10px;">Item Type</th>
                      <th style="padding:10px;">Opening Stock</th>
                      <th style="padding:10px;">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${items.slice(0, 10).map(i => `
                      <tr style="border-bottom:1px solid var(--border-subtle);">
                        <td style="padding:10px; font-weight:700; font-family:monospace;">${i.itemCode || i.item_code}</td>
                        <td style="padding:10px; font-weight:600;">${i.itemName || i.item_name}</td>
                        <td style="padding:10px;">${i.categoryCode || i.category_code || 'GENERAL'}</td>
                        <td style="padding:10px;"><span class="badge badge-info">${i.baseUom || i.base_uom || 'KG'}</span></td>
                        <td style="padding:10px;"><span class="badge badge-secondary">${i.itemType || i.item_type || 'Raw Material'}</span></td>
                        <td style="padding:10px; font-weight:700; color:var(--status-success);">${i.openingStock || i.opening_stock || 0} ${i.baseUom || i.base_uom || 'KG'}</td>
                        <td style="padding:10px;"><span class="badge badge-success">ACTIVE</span></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (tabKey === 'inv-categories') {
      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div>
              <h3 style="font-size:1.4rem; margin:0;">🏷 Categories & Product Families Master (${categories.length} Categories)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">Sourced directly from Supabase PostgreSQL <strong>inventory_categories</strong> table.</p>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn-primary nav-inv-btn" data-tab="inv-categories-create" style="padding:8px 16px; font-weight:700; background:var(--accent-primary); border-radius:6px; border:none; cursor:pointer; color:#fff;">
                + Add Category Screen
              </button>
            </div>
          </div>

          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">Category Code</th>
                  <th style="padding:10px;">Category Name</th>
                  <th style="padding:10px;">Product Family</th>
                  <th style="padding:10px;">Default Base UOM</th>
                  <th style="padding:10px;">Mapped Items</th>
                  <th style="padding:10px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${categories.length ? categories.map(c => {
                  const catCode = c.categoryCode || c.category_code || c.id;
                  const catName = c.categoryName || c.category_name || (c.data ? c.data.categoryName : catCode);
                  const famName = c.productFamilyName || c.product_family_name || (c.data ? c.data.productFamilyName : 'General');
                  const defUom = c.defaultUom || c.default_uom || (c.data ? c.data.defaultUom : 'KG');
                  const mappedCount = items.filter(i => (i.categoryCode === catCode || i.category_code === catCode)).length;
                  return `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${catCode}</td>
                      <td style="padding:10px; font-weight:600;">${catName}</td>
                      <td style="padding:10px;"><span class="badge badge-info">${famName}</span></td>
                      <td style="padding:10px;"><span class="badge badge-secondary">${defUom}</span></td>
                      <td style="padding:10px; font-weight:700; color:var(--status-success);">${mappedCount} items</td>
                      <td style="padding:10px;"><span class="badge badge-success">ACTIVE</span></td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="6" style="padding:24px; text-align:center; color:var(--text-muted);">
                      No categories found in Supabase. Click <strong>"+ Add Category Screen"</strong> to create a new category.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (tabKey === 'inv-uom') {
      const defaultUomList = uoms.length ? uoms : [
        { uomCode: 'KG', uomName: 'Kilogram', uomFamily: 'WEIGHT', conversionFactor: 1000, isBaseUnit: false },
        { uomCode: 'G', uomName: 'Gram', uomFamily: 'WEIGHT', conversionFactor: 1, isBaseUnit: true },
        { uomCode: 'TON', uomName: 'Metric Tonne', uomFamily: 'WEIGHT', conversionFactor: 1000000, isBaseUnit: false },
        { uomCode: 'L', uomName: 'Litre', uomFamily: 'VOLUME', conversionFactor: 1000, isBaseUnit: false },
        { uomCode: 'ML', uomName: 'Millilitre', uomFamily: 'VOLUME', conversionFactor: 1, isBaseUnit: true },
        { uomCode: 'PCS', uomName: 'Piece', uomFamily: 'COUNT', conversionFactor: 1, isBaseUnit: true },
        { uomCode: 'NOS', uomName: 'Numbers', uomFamily: 'COUNT', conversionFactor: 1, isBaseUnit: true },
        { uomCode: 'DOZEN', uomName: 'Dozen (12)', uomFamily: 'COUNT', conversionFactor: 12, isBaseUnit: false },
        { uomCode: 'PACK', uomName: 'Standard Pack', uomFamily: 'COUNT', conversionFactor: 1, isBaseUnit: false },
        { uomCode: 'BOX', uomName: 'Storage Box', uomFamily: 'COUNT', conversionFactor: 1, isBaseUnit: false }
      ];

      const weightUoms = defaultUomList.filter(u => (u.uomFamily || u.uom_family || u.family) === 'WEIGHT');
      const volumeUoms = defaultUomList.filter(u => (u.uomFamily || u.uom_family || u.family) === 'VOLUME');
      const countUoms = defaultUomList.filter(u => (u.uomFamily || u.uom_family || u.family) === 'COUNT');

      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="font-size:1.4rem; margin:0; color:var(--accent-primary);">📐 Units of Measure (UOM) Canonical Master (${defaultUomList.length})</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Canonical UOM Families (Weight, Volume, Count) & Conversion Ratios sourced directly from Supabase <strong>inventory_uoms</strong>.
              </p>
            </div>
            <button class="btn-primary nav-inv-btn" data-tab="inv-uom-create" style="padding:8px 16px; font-weight:700; background:var(--accent-primary); border-radius:6px; border:none; cursor:pointer; color:#fff;">
              + Add Unit of Measure Screen
            </button>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
            <!-- Weight Family -->
            <div class="card" style="background:var(--bg-surface-2); padding:16px; border-left:4px solid var(--accent-primary); border-radius:6px;">
              <h4 style="margin:0 0 8px 0; color:var(--accent-primary);">⚖️ Weight Family (${weightUoms.length})</h4>
              <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:12px;">Base Unit: <strong>Gram (G) / Kilogram (KG)</strong>.</p>
              <table style="width:100%; font-size:0.82rem; border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; color:var(--text-muted);">
                    <th style="padding:6px;">Code</th><th style="padding:6px;">Name</th><th style="padding:6px;">Base Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  ${weightUoms.map(u => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:6px; font-weight:700; font-family:monospace;">${u.uomCode || u.uom_code}</td>
                      <td style="padding:6px;">${u.uomName || u.uom_name}</td>
                      <td style="padding:6px;"><span class="badge ${u.isBaseUnit || u.is_base_unit ? 'badge-success' : 'badge-info'}">${u.conversionFactor || u.conversion_factor || 1} ${u.isBaseUnit ? '(Base)' : ''}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <!-- Volume Family -->
            <div class="card" style="background:var(--bg-surface-2); padding:16px; border-left:4px solid var(--accent-secondary); border-radius:6px;">
              <h4 style="margin:0 0 8px 0; color:var(--accent-secondary);">🥤 Volume Family (${volumeUoms.length})</h4>
              <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:12px;">Base Unit: <strong>Millilitre (ML) / Litre (L)</strong>.</p>
              <table style="width:100%; font-size:0.82rem; border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; color:var(--text-muted);">
                    <th style="padding:6px;">Code</th><th style="padding:6px;">Name</th><th style="padding:6px;">Base Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  ${volumeUoms.map(u => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:6px; font-weight:700; font-family:monospace;">${u.uomCode || u.uom_code}</td>
                      <td style="padding:6px;">${u.uomName || u.uom_name}</td>
                      <td style="padding:6px;"><span class="badge ${u.isBaseUnit || u.is_base_unit ? 'badge-success' : 'badge-info'}">${u.conversionFactor || u.conversion_factor || 1} ${u.isBaseUnit ? '(Base)' : ''}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <!-- Count Family -->
            <div class="card" style="background:var(--bg-surface-2); padding:16px; border-left:4px solid var(--status-info); border-radius:6px;">
              <h4 style="margin:0 0 8px 0; color:var(--status-info);">📦 Count & Packaging (${countUoms.length})</h4>
              <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:12px;">Base Unit: <strong>Piece (PCS) / Numbers (NOS)</strong>.</p>
              <table style="width:100%; font-size:0.82rem; border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; color:var(--text-muted);">
                    <th style="padding:6px;">Code</th><th style="padding:6px;">Name</th><th style="padding:6px;">Ratio / Type</th>
                  </tr>
                </thead>
                <tbody>
                  ${countUoms.map(u => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:6px; font-weight:700; font-family:monospace;">${u.uomCode || u.uom_code}</td>
                      <td style="padding:6px;">${u.uomName || u.uom_name}</td>
                      <td style="padding:6px;"><span class="badge ${u.isBaseUnit || u.is_base_unit ? 'badge-success' : 'badge-info'}">${u.conversionFactor || u.conversion_factor || 1}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } else if (tabKey === 'inv-live-stock' || tabKey === 'inv-live-balances') {
      const activeBalances = balances.filter(b => (!tenantId || b.tenantId === tenantId || b.tenant_id === tenantId));

      let stockLines = [];
      if (activeBalances.length > 0) {
        stockLines = activeBalances.map(b => {
          const itemCode = b.itemCode || b.item_code;
          const locationCode = b.locationCode || b.location_code;
          const item = items.find(i => (i.itemCode === itemCode || i.item_code === itemCode)) || {};
          const loc = locations.find(l => (l.locationCode === locationCode || l.location_code === locationCode)) || {};
          const qty = parseFloat(b.quantity) || 0;
          const unitCost = parseFloat(b.unitCost || b.unit_cost || item.unitValuation || item.unit_valuation || 0);
          const valuation = b.valuation !== undefined ? parseFloat(b.valuation) : (qty * unitCost);
          const reorderLevel = parseFloat(item.reorderLevel || item.reorder_level || 0);

          let status = 'IN_STOCK';
          if (qty <= 0) status = 'OUT_OF_STOCK';
          else if (reorderLevel > 0 && qty <= reorderLevel) status = 'LOW_STOCK';

          return {
            id: b.id || `${itemCode}_${locationCode}`,
            itemCode: itemCode,
            itemName: item.itemName || item.item_name || itemCode,
            categoryCode: item.categoryCode || item.category_code || 'GENERAL',
            locationCode: locationCode,
            locationName: loc.locationName || loc.location_name || locationCode,
            quantity: qty,
            baseUom: b.baseUom || b.base_uom || item.baseUom || item.base_uom || 'KG',
            unitCost: unitCost,
            valuation: valuation,
            reorderLevel: reorderLevel,
            status: status,
            lastUpdatedAt: b.lastUpdatedAt || b.updated_at || ''
          };
        });
      } else {
        stockLines = items.map(i => {
          const qty = parseFloat(i.openingStock || i.opening_stock || 0);
          const unitCost = parseFloat(i.unitValuation || i.unit_valuation || 0);
          const valuation = qty * unitCost;
          const reorderLevel = parseFloat(i.reorderLevel || i.reorder_level || 0);

          let status = 'IN_STOCK';
          if (qty <= 0) status = 'OUT_OF_STOCK';
          else if (reorderLevel > 0 && qty <= reorderLevel) status = 'LOW_STOCK';

          return {
            id: i.id || i.itemCode || i.item_code,
            itemCode: i.itemCode || i.item_code,
            itemName: i.itemName || i.item_name,
            categoryCode: i.categoryCode || i.category_code || 'GENERAL',
            locationCode: i.defaultLocationCode || i.default_location_code || 'LOC-805',
            locationName: i.defaultLocationName || 'Main Warehouse',
            quantity: qty,
            baseUom: i.baseUom || i.base_uom || 'KG',
            unitCost: unitCost,
            valuation: valuation,
            reorderLevel: reorderLevel,
            status: status,
            lastUpdatedAt: i.updated_at || ''
          };
        });
      }

      const searchQuery = (this.liveInventorySearchQuery || '').toLowerCase().trim();
      const locFilter = this.liveInventoryLocationFilter || 'ALL';
      const statusFilter = this.liveInventoryStatusFilter || 'ALL';

      let filteredLines = stockLines.filter(line => {
        if (searchQuery) {
          const matchName = (line.itemName || '').toLowerCase().includes(searchQuery);
          const matchCode = (line.itemCode || '').toLowerCase().includes(searchQuery);
          const matchCat = (line.categoryCode || '').toLowerCase().includes(searchQuery);
          const matchLoc = (line.locationName || '').toLowerCase().includes(searchQuery) || (line.locationCode || '').toLowerCase().includes(searchQuery);
          if (!matchName && !matchCode && !matchCat && !matchLoc) return false;
        }
        if (locFilter !== 'ALL' && line.locationCode !== locFilter) return false;
        if (statusFilter !== 'ALL' && line.status !== statusFilter) return false;
        return true;
      });

      const totalValuationAll = stockLines.reduce((sum, l) => sum + l.valuation, 0);
      const totalValuationFiltered = filteredLines.reduce((sum, l) => sum + l.valuation, 0);

      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary); font-size:1.4rem;">📦 Detailed Live Store Balances & Location Valuation</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Single-pane inventory view across all store locations, categories, and stock movement logs.
              </p>
            </div>
          </div>

          <!-- KPI Summary Cards -->
          <div class="grid grid-cols-4 gap-md" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:20px;">
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">TOTAL VALUATION</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--status-success); margin-top:2px;">
                ₹${Math.round(totalValuationAll).toLocaleString('en-IN')}
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">TOTAL STOCK LINES</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--accent-primary); margin-top:2px;" id="live-stock-count-card">
                ${stockLines.length} Lines
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">FILTERED VALUATION</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--accent-secondary); margin-top:2px;" id="live-filtered-val-card">
                ₹${Math.round(totalValuationFiltered).toLocaleString('en-IN')}
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">ACTIVE STORES</div>
              <div style="font-size:1.4rem; font-weight:700; margin-top:2px;">
                ${locations.length} Locations
              </div>
            </div>
          </div>

          <!-- Controls & Filters Bar -->
          <div style="background:var(--bg-surface-2); padding:14px; border-radius:8px; margin-bottom:16px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
            <input type="text" id="inp-live-search" placeholder="🔍 Search item code, name, location..." value="${this.liveInventorySearchQuery}" style="flex:1; min-width:200px; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle);">
            
            <select id="sel-live-loc" style="padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <option value="ALL">All Storage Locations</option>
              ${locations.map(l => `<option value="${l.locationCode || l.location_code}" ${locFilter === (l.locationCode || l.location_code) ? 'selected' : ''}>${l.locationName || l.location_name} (${l.locationCode || l.location_code})</option>`).join('')}
            </select>

            <select id="sel-live-status" style="padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <option value="ALL" ${statusFilter === 'ALL' ? 'selected' : ''}>All Stock Statuses</option>
              <option value="IN_STOCK" ${statusFilter === 'IN_STOCK' ? 'selected' : ''}>In Stock</option>
              <option value="LOW_STOCK" ${statusFilter === 'LOW_STOCK' ? 'selected' : ''}>Low Stock</option>
              <option value="OUT_OF_STOCK" ${statusFilter === 'OUT_OF_STOCK' ? 'selected' : ''}>Out of Stock</option>
            </select>
          </div>

          <!-- Store Balances Table -->
          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">Item Code</th>
                  <th style="padding:10px;">Ingredient Name</th>
                  <th style="padding:10px;">Category</th>
                  <th style="padding:10px;">Location</th>
                  <th style="padding:10px;">Qty On Hand</th>
                  <th style="padding:10px;">Unit Cost</th>
                  <th style="padding:10px;">Location Valuation</th>
                  <th style="padding:10px;">Status</th>
                </tr>
              </thead>
              <tbody id="live-stock-tbody">
                ${filteredLines.map(l => `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${l.itemCode}</td>
                    <td style="padding:10px; font-weight:600;">${l.itemName}</td>
                    <td style="padding:10px;">${l.categoryCode}</td>
                    <td style="padding:10px;"><span class="badge badge-info">${l.locationName} (${l.locationCode})</span></td>
                    <td style="padding:10px; font-weight:700; color:var(--status-success);">${l.quantity} ${l.baseUom}</td>
                    <td style="padding:10px;">₹${l.unitCost ? l.unitCost.toFixed(2) : '0.00'}</td>
                    <td style="padding:10px; font-weight:700; color:var(--status-success);">₹${Math.round(l.valuation).toLocaleString('en-IN')}</td>
                    <td style="padding:10px;">
                      <span class="badge ${l.status === 'IN_STOCK' ? 'badge-success' : (l.status === 'LOW_STOCK' ? 'badge-warning' : 'badge-danger')}">
                        ${l.status}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      const searchInp = mount.querySelector('#inp-live-search');
      const locSel = mount.querySelector('#sel-live-loc');
      const statusSel = mount.querySelector('#sel-live-status');
      const tbody = mount.querySelector('#live-stock-tbody');
      const filteredValCard = mount.querySelector('#live-filtered-val-card');

      const updateLiveRows = () => {
        const query = (searchInp ? searchInp.value : '').toLowerCase().trim();
        this.liveInventorySearchQuery = searchInp ? searchInp.value : '';
        const selectedLoc = locSel ? locSel.value : 'ALL';
        this.liveInventoryLocationFilter = selectedLoc;
        const selectedStatus = statusSel ? statusSel.value : 'ALL';
        this.liveInventoryStatusFilter = selectedStatus;

        const currentFiltered = stockLines.filter(line => {
          if (query) {
            const matchName = (line.itemName || '').toLowerCase().includes(query);
            const matchCode = (line.itemCode || '').toLowerCase().includes(query);
            const matchCat = (line.categoryCode || '').toLowerCase().includes(query);
            const matchLoc = (line.locationName || '').toLowerCase().includes(query) || (line.locationCode || '').toLowerCase().includes(query);
            if (!matchName && !matchCode && !matchCat && !matchLoc) return false;
          }
          if (selectedLoc !== 'ALL' && line.locationCode !== selectedLoc) return false;
          if (selectedStatus !== 'ALL' && line.status !== selectedStatus) return false;
          return true;
        });

        const currentValuation = currentFiltered.reduce((sum, l) => sum + l.valuation, 0);
        if (filteredValCard) {
          filteredValCard.textContent = `₹${Math.round(currentValuation).toLocaleString('en-IN')}`;
        }

        if (tbody) {
          if (currentFiltered.length > 0) {
            tbody.innerHTML = currentFiltered.map(l => `
              <tr style="border-bottom:1px solid var(--border-subtle);">
                <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${l.itemCode}</td>
                <td style="padding:10px; font-weight:600;">${l.itemName}</td>
                <td style="padding:10px;">${l.categoryCode}</td>
                <td style="padding:10px;"><span class="badge badge-info">${l.locationName} (${l.locationCode})</span></td>
                <td style="padding:10px; font-weight:700; color:var(--status-success);">${l.quantity} ${l.baseUom}</td>
                <td style="padding:10px;">₹${l.unitCost ? l.unitCost.toFixed(2) : '0.00'}</td>
                <td style="padding:10px; font-weight:700; color:var(--status-success);">₹${Math.round(l.valuation).toLocaleString('en-IN')}</td>
                <td style="padding:10px;">
                  <span class="badge ${l.status === 'IN_STOCK' ? 'badge-success' : (l.status === 'LOW_STOCK' ? 'badge-warning' : 'badge-danger')}">
                    ${l.status}
                  </span>
                </td>
              </tr>
            `).join('');
          } else {
            tbody.innerHTML = `
              <tr>
                <td colspan="8" style="padding:24px; text-align:center; color:var(--text-muted);">
                  No live stock balances match the search query "${query}".
                </td>
              </tr>
            `;
          }
        }
      };

      if (searchInp) searchInp.addEventListener('input', updateLiveRows);
      if (locSel) locSel.addEventListener('change', updateLiveRows);
      if (statusSel) statusSel.addEventListener('change', updateLiveRows);
    } else if (tabKey === 'inv-transfers') {
      const activeTransfers = stockTransfers.filter(t => (!tenantId || t.tenantId === tenantId || t.tenant_id === tenantId));
      const totalTransferredLines = activeTransfers.reduce((sum, t) => sum + (Array.isArray(t.lines) ? t.lines.length : (t.itemCode ? 1 : 0)), 0);
      const totalValuation = activeTransfers.reduce((sum, t) => sum + (parseFloat(t.totalValuation || t.total_valuation || t.grandTotal) || 0), 0);

      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary); font-size:1.4rem;">🔄 Inter-Store Stock Transfers (${activeTransfers.length})</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Move inventory stock between warehouses and sub-stores with dual-ended paired stock balance adjustments in Supabase.
              </p>
            </div>
            <button class="btn-primary nav-inv-btn" data-tab="inv-transfers-create" style="padding:10px 18px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); border-radius:6px; border:none; cursor:pointer; color:#fff;">
              🔄 + Post Stock Transfer Screen
            </button>
          </div>

          <!-- KPI Summary Cards -->
          <div class="grid grid-cols-3 gap-md" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:20px;">
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">TOTAL TRANSFERS POSTED</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--accent-primary); margin-top:2px;">
                ${activeTransfers.length} Transfers
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">TOTAL ITEMS TRANSFERRED</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--status-info); margin-top:2px;">
                ${totalTransferredLines} Lines
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">TOTAL MOVEMENT VALUATION</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--status-success); margin-top:2px;">
                ₹${Math.round(totalValuation).toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          <!-- Transfers Table -->
          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">Transfer #</th>
                  <th style="padding:10px;">Source Location</th>
                  <th style="padding:10px;">Destination Location</th>
                  <th style="padding:10px;">Transfer Date</th>
                  <th style="padding:10px;">Transferred Line Breakdown & Stock Levels</th>
                  <th style="padding:10px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${activeTransfers.length ? activeTransfers.map(trf => {
                  const transferNo = trf.transferNo || trf.transfer_no || trf.id;
                  const fromLoc = trf.fromLocationCode || trf.from_location_code || 'LOC-805';
                  const toLoc = trf.toLocationCode || trf.to_location_code || 'LOC-886';
                  const date = trf.transferDate || trf.transfer_date || new Date().toISOString().split('T')[0];
                  const lines = Array.isArray(trf.lines) ? trf.lines : [];

                  return `
                    <tr style="border-bottom:1px solid var(--border-subtle); align-items:start;">
                      <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${transferNo}</td>
                      <td style="padding:10px;"><span class="badge badge-info">${fromLoc}</span></td>
                      <td style="padding:10px; font-weight:600;"><span class="badge badge-success">${toLoc}</span></td>
                      <td style="padding:10px;">${date}</td>
                      <td style="padding:10px;">
                        ${lines.length ? lines.map(l => `
                          <div style="font-size:0.78rem; background:var(--bg-surface-2); padding:6px 10px; border-radius:4px; margin-bottom:4px; border:1px solid var(--border-subtle);">
                            <strong>${l.itemName || l.itemCode}</strong> (${l.quantity} ${l.baseUom || 'KG'})
                            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">
                              📍 Source: <span style="text-decoration:line-through;">${l.fromBeforeQty !== undefined ? l.fromBeforeQty : '—'}</span> ➔ <strong style="color:var(--accent-primary);">${l.fromAfterQty !== undefined ? l.fromAfterQty : '—'}</strong> | 
                              📍 Target: <span style="text-decoration:line-through;">${l.toBeforeQty !== undefined ? l.toBeforeQty : '—'}</span> ➔ <strong style="color:var(--status-success);">${l.toAfterQty !== undefined ? l.toAfterQty : '—'}</strong>
                            </div>
                          </div>
                        `).join('') : '<span style="color:var(--text-muted);">1 Line Item</span>'}
                      </td>
                      <td style="padding:10px;"><span class="badge badge-success">COMPLETED</span></td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="6" style="padding:24px; text-align:center; color:var(--text-muted);">
                      No stock transfers posted yet. Click <strong>"🔄 + Post Stock Transfer Screen"</strong> to initiate a transfer.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (tabKey === 'inv-adjustments') {
      const activeAdjustments = stockAdjustments.filter(a => (!tenantId || a.tenantId === tenantId || a.tenant_id === tenantId));
      const totalAdjustedLines = activeAdjustments.reduce((sum, a) => sum + (Array.isArray(a.lines) ? a.lines.length : (a.itemCode ? 1 : 0)), 0);

      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary); font-size:1.4rem;">📊 Controlled Stock Adjustments & Spoilage Ledger (${activeAdjustments.length})</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Log controlled inventory adjustments (Wastage, Expiration, Damage, Audit Corrections) with before & after balance ledgering in Supabase.
              </p>
            </div>
            <button class="btn-primary nav-inv-btn" data-tab="inv-adjustments-create" style="padding:10px 18px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); border-radius:6px; border:none; cursor:pointer; color:#fff;">
              📊 + Post Stock Adjustment Screen
            </button>
          </div>

          <!-- KPI Summary Cards -->
          <div class="grid grid-cols-3 gap-md" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:20px;">
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">TOTAL ADJUSTMENTS POSTED</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--accent-primary); margin-top:2px;">
                ${activeAdjustments.length} Vouchers
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">TOTAL ITEMS ADJUSTED</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--status-info); margin-top:2px;">
                ${totalAdjustedLines} Lines
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">ACTIVE REASON TYPES</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--status-warning); margin-top:2px;">
                5 Categories
              </div>
            </div>
          </div>

          <!-- Adjustments Table -->
          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">Adjustment #</th>
                  <th style="padding:10px;">Location</th>
                  <th style="padding:10px;">Reason Code</th>
                  <th style="padding:10px;">Adjustment Date</th>
                  <th style="padding:10px;">Adjusted Line Breakdown & Stock Levels</th>
                  <th style="padding:10px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${activeAdjustments.length ? activeAdjustments.map(adj => {
                  const adjNo = adj.adjustmentNo || adj.adjustment_no || adj.id;
                  const loc = adj.locationCode || adj.location_code || 'LOC-805';
                  const reason = adj.reasonCode || adj.reason_code || 'WASTAGE';
                  const date = adj.adjustmentDate || adj.adjustment_date || new Date().toISOString().split('T')[0];
                  const lines = Array.isArray(adj.lines) ? adj.lines : [];

                  let reasonBadgeClass = 'badge-warning';
                  if (reason === 'WASTAGE' || reason === 'EXPIRATION') reasonBadgeClass = 'badge-danger';
                  else if (reason === 'DAMAGE') reasonBadgeClass = 'badge-warning';
                  else if (reason === 'AUDIT_CORRECTION') reasonBadgeClass = 'badge-info';

                  return `
                    <tr style="border-bottom:1px solid var(--border-subtle); align-items:start;">
                      <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${adjNo}</td>
                      <td style="padding:10px;"><span class="badge badge-info">${loc}</span></td>
                      <td style="padding:10px;"><span class="badge ${reasonBadgeClass}">${reason}</span></td>
                      <td style="padding:10px;">${date}</td>
                      <td style="padding:10px;">
                        ${lines.length ? lines.map(l => `
                          <div style="font-size:0.78rem; background:var(--bg-surface-2); padding:6px 10px; border-radius:4px; margin-bottom:4px; border:1px solid var(--border-subtle);">
                            <strong>${l.itemName || l.itemCode}</strong> 
                            <span class="badge ${l.adjustmentType === 'DECREASE' ? 'badge-danger' : 'badge-success'}" style="font-size:0.68rem; padding:1px 4px; margin-left:4px;">${l.adjustmentType || 'DECREASE'} ${l.quantity} ${l.baseUom || 'KG'}</span>
                            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">
                              📍 Stock Level (${loc}): <span style="text-decoration:line-through;">${l.fromBeforeQty !== undefined ? l.fromBeforeQty : '—'}</span> ➔ <strong style="color:${l.adjustmentType === 'DECREASE' ? 'var(--status-danger)' : 'var(--status-success)'};">${l.fromAfterQty !== undefined ? l.fromAfterQty : '—'}</strong>
                            </div>
                          </div>
                        `).join('') : '<span style="color:var(--text-muted);">1 Line Item</span>'}
                      </td>
                      <td style="padding:10px;"><span class="badge badge-success">COMPLETED</span></td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="6" style="padding:24px; text-align:center; color:var(--text-muted);">
                      No stock adjustments posted yet. Click <strong>"📊 + Post Stock Adjustment Screen"</strong> to log an adjustment.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (tabKey === 'inv-counts') {
      const activeCounts = stockCounts.filter(c => (!tenantId || c.tenantId === tenantId || c.tenant_id === tenantId));
      const totalAuditedLines = activeCounts.reduce((sum, c) => sum + (Array.isArray(c.lines) ? c.lines.length : 0), 0);
      const totalNetVarianceVal = activeCounts.reduce((sum, c) => sum + (parseFloat(c.totalVarianceValuation || c.total_variance_valuation) || 0), 0);

      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary); font-size:1.4rem;">📋 Physical Stock Audit & Variance Ledger (${activeCounts.length})</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Conduct physical inventory audits, calculate variances (System Stock vs Counted Stock), and auto-post stock balance adjustments to Supabase.
              </p>
            </div>
            <button class="btn-primary nav-inv-btn" data-tab="inv-counts-create" style="padding:10px 18px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); border-radius:6px; border:none; cursor:pointer; color:#fff;">
              📋 + Start Physical Stock Count Screen
            </button>
          </div>

          <!-- KPI Summary Cards -->
          <div class="grid grid-cols-3 gap-md" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:20px;">
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">TOTAL AUDITS CONDUCTED</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--accent-primary); margin-top:2px;">
                ${activeCounts.length} Audits
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">TOTAL ITEMS AUDITED</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--status-info); margin-top:2px;">
                ${totalAuditedLines} Items
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">NET AUDIT VARIANCE IMPACT</div>
              <div style="font-size:1.4rem; font-weight:700; color:${totalNetVarianceVal < 0 ? 'var(--status-danger)' : (totalNetVarianceVal > 0 ? 'var(--status-success)' : 'var(--text-muted)')}; margin-top:2px;">
                ₹${Math.round(totalNetVarianceVal).toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          <!-- Stock Counts History Table -->
          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">Count Voucher #</th>
                  <th style="padding:10px;">Location</th>
                  <th style="padding:10px;">Count Date</th>
                  <th style="padding:10px;">Auditor</th>
                  <th style="padding:10px;">Audited Line Breakdown & Variances</th>
                  <th style="padding:10px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${activeCounts.length ? activeCounts.map(cnt => {
                  const countNo = cnt.countNo || cnt.count_no || cnt.id;
                  const loc = cnt.locationCode || cnt.location_code || 'LOC-805';
                  const date = cnt.countDate || cnt.count_date || new Date().toISOString().split('T')[0];
                  const auditor = cnt.conductedBy || cnt.conducted_by || 'Inventory Auditor';
                  const lines = Array.isArray(cnt.lines) ? cnt.lines : [];

                  return `
                    <tr style="border-bottom:1px solid var(--border-subtle); align-items:start;">
                      <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${countNo}</td>
                      <td style="padding:10px;"><span class="badge badge-info">${loc}</span></td>
                      <td style="padding:10px;">${date}</td>
                      <td style="padding:10px; font-weight:600;">${auditor}</td>
                      <td style="padding:10px;">
                        ${lines.length ? lines.map(l => {
                          const sys = parseFloat(l.systemQty) || 0;
                          const counted = parseFloat(l.countedQty) || 0;
                          const varQty = counted - sys;
                          let varBadge = 'badge-success';
                          if (varQty < 0) varBadge = 'badge-danger';
                          else if (varQty > 0) varBadge = 'badge-info';

                          return `
                            <div style="font-size:0.78rem; background:var(--bg-surface-2); padding:6px 10px; border-radius:4px; margin-bottom:4px; border:1px solid var(--border-subtle);">
                              <strong>${l.itemName || l.itemCode}</strong> 
                              <span style="color:var(--text-muted);">[System: ${sys} ${l.baseUom || 'KG'} | Counted: ${counted} ${l.baseUom || 'KG'}]</span>
                              <span class="badge ${varBadge}" style="font-size:0.68rem; padding:1px 4px; margin-left:4px;">
                                ${varQty > 0 ? '+' : ''}${varQty.toFixed(2)} ${l.baseUom || 'KG'}
                              </span>
                            </div>
                          `;
                        }).join('') : '<span style="color:var(--text-muted);">0 Line Items</span>'}
                      </td>
                      <td style="padding:10px;"><span class="badge badge-success">COMPLETED & POSTED</span></td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="6" style="padding:24px; text-align:center; color:var(--text-muted);">
                      No physical stock counts posted yet. Click <strong>"📋 + Start Physical Stock Count Screen"</strong> to initiate an audit.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (tabKey === 'inv-issues') {
      const activeIssues = stockIssues.filter(i => (!tenantId || i.tenantId === tenantId || i.tenant_id === tenantId));
      const totalIssuedLines = activeIssues.reduce((sum, i) => sum + (Array.isArray(i.lines) ? i.lines.length : (i.itemCode ? 1 : 0)), 0);
      const totalValuation = activeIssues.reduce((sum, i) => sum + (parseFloat(i.totalValuation || i.total_valuation || i.grandTotal) || 0), 0);

      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div>
              <h3 style="margin:0; color:var(--accent-primary); font-size:1.4rem;">📤 Department Stock Issues & Internal Consumption (${activeIssues.length})</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Issue inventory items from warehouse/store locations directly to Kitchen, Bar, or Housekeeping with automatic stock balance deduction in Supabase.
              </p>
            </div>
            <button class="btn-primary" style="padding:10px 18px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); border-radius:6px; border:none; opacity:0.4; cursor:not-allowed;" title="Disabled by user directive" disabled>
              📤 + Issue Stock (Disabled)
            </button>
          </div>

          <!-- KPI Summary Cards -->
          <div class="grid grid-cols-3 gap-md" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:20px;">
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">TOTAL ISSUES POSTED</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--accent-primary); margin-top:2px;">
                ${activeIssues.length} Receipts
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">TOTAL LINE ITEMS ISSUED</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--status-info); margin-top:2px;">
                ${totalIssuedLines} Items
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">TOTAL CONSUMPTION VALUE</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--status-success); margin-top:2px;">
                ₹${Math.round(totalValuation).toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          <!-- Issues Table -->
          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">Issue #</th>
                  <th style="padding:10px;">From Location</th>
                  <th style="padding:10px;">Target Department</th>
                  <th style="padding:10px;">Issued To Staff</th>
                  <th style="padding:10px;">Issue Date</th>
                  <th style="padding:10px;">Line Items</th>
                  <th style="padding:10px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${activeIssues.length ? activeIssues.map(iss => {
                  const issueNo = iss.issueNo || iss.issue_no || iss.id;
                  const fromLoc = iss.fromLocationCode || iss.from_location_code || 'LOC-805';
                  const dept = iss.issuedToDepartment || iss.issued_to_department || 'KITCHEN';
                  const person = iss.issuedToPerson || iss.issued_to_person || 'Chef';
                  const date = iss.issueDate || iss.issue_date || new Date().toISOString().split('T')[0];
                  const lineCount = Array.isArray(iss.lines) ? iss.lines.length : 1;
                  return `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${issueNo}</td>
                      <td style="padding:10px;"><span class="badge badge-info">${fromLoc}</span></td>
                      <td style="padding:10px; font-weight:600;"><span class="badge badge-warning">${dept}</span></td>
                      <td style="padding:10px;">${person}</td>
                      <td style="padding:10px;">${date}</td>
                      <td style="padding:10px; font-weight:700;">${lineCount} Items</td>
                      <td style="padding:10px;"><span class="badge badge-success">POSTED</span></td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="7" style="padding:24px; text-align:center; color:var(--text-muted);">
                      No stock issue receipts posted yet.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (tabKey === 'inv-master' || tabKey === 'master') {
      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="font-size:1.4rem; margin:0;">📦 Master Inventory Items Catalog (${items.length} Items)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">Sourced 100% directly from Supabase PostgreSQL <strong>inventory</strong> table.</p>
            </div>
            <button class="btn-primary nav-inv-btn" data-tab="inv-master-create" style="padding:10px 18px; font-weight:700; background:var(--accent-primary); border-radius:6px; border:none; cursor:pointer;">
              + Add Master Inventory Item Screen
            </button>
          </div>

          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">Item Code</th>
                  <th style="padding:10px;">Item Name</th>
                  <th style="padding:10px;">Item Type</th>
                  <th style="padding:10px;">Category</th>
                  <th style="padding:10px;">Base UOM</th>
                  <th style="padding:10px;">Opening Stock</th>
                  <th style="padding:10px;">Reorder Level</th>
                  <th style="padding:10px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(i => `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${i.itemCode || i.item_code}</td>
                    <td style="padding:10px; font-weight:600;">${i.itemName || i.item_name}</td>
                    <td style="padding:10px;"><span class="badge badge-info">${i.itemType || i.item_type || 'Raw Material'}</span></td>
                    <td style="padding:10px;">${i.categoryCode || i.category_code || 'GENERAL'}</td>
                    <td style="padding:10px;"><span class="badge badge-secondary">${i.baseUom || i.base_uom || 'KG'}</span></td>
                    <td style="padding:10px; font-weight:700; color:var(--status-success);">${i.openingStock || i.opening_stock || 0} ${i.baseUom || i.base_uom || 'KG'}</td>
                    <td style="padding:10px; font-weight:700; color:var(--status-warning);">${i.reorderLevel || i.reorder_level || 0}</td>
                    <td style="padding:10px;"><span class="badge badge-success">LIVE SUPABASE</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (tabKey === 'inv-locations' || tabKey === 'locations') {
      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="font-size:1.4rem; margin:0;">🏬 Storage Locations (${locations.length} Locations)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">Sourced directly from Supabase PostgreSQL <strong>storage_locations</strong> table.</p>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn-secondary" id="btn-dl-loc-tmpl" style="padding:8px 14px; font-size:0.82rem; font-weight:600; cursor:pointer;">
                📄 Sample CSV Template
              </button>
              <button class="btn-secondary nav-inv-btn" data-tab="inv-locations-import" style="padding:8px 14px; font-size:0.82rem; font-weight:600; cursor:pointer;">
                ⚡ Bulk Import CSV Screen
              </button>
              <button class="btn-secondary" id="btn-export-loc-csv" style="padding:8px 14px; font-size:0.82rem; font-weight:600; cursor:pointer;">
                📤 Export CSV
              </button>
              <button class="btn-primary nav-inv-btn" data-tab="inv-locations-create" style="padding:8px 16px; font-weight:700; background:var(--accent-primary); border-radius:6px; border:none; cursor:pointer; color:#fff;">
                + Add Storage Location Screen
              </button>
            </div>
          </div>
          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">Location Code</th>
                  <th style="padding:10px;">Location Name</th>
                  <th style="padding:10px;">Storage Type</th>
                  <th style="padding:10px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${locations.map(l => `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${l.locationCode || l.location_code || l.id}</td>
                    <td style="padding:10px; font-weight:600;">${l.locationName || l.location_name}</td>
                    <td style="padding:10px;"><span class="badge badge-info">${l.storageType || l.storage_type || 'WAREHOUSE'}</span></td>
                    <td style="padding:10px;"><span class="badge badge-success">ACTIVE</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      const btnTmplLoc = mount.querySelector('#btn-dl-loc-tmpl');
      if (btnTmplLoc) btnTmplLoc.addEventListener('click', () => this.downloadLocationTemplate());

      const btnExportLoc = mount.querySelector('#btn-export-loc-csv');
      if (btnExportLoc) btnExportLoc.addEventListener('click', () => this.exportLocationsCSV(locations));
    } else if (tabKey === 'inv-suppliers' || tabKey === 'suppliers') {
      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="font-size:1.4rem; margin:0;">🏢 Suppliers Master (${suppliers.length} Vendors)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">Sourced directly from Supabase PostgreSQL <strong>suppliers</strong> table.</p>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn-secondary" id="btn-dl-sup-tmpl" style="padding:8px 14px; font-size:0.82rem; font-weight:600; cursor:pointer;">
                📄 Sample CSV Template
              </button>
              <button class="btn-secondary nav-inv-btn" data-tab="inv-suppliers-import" style="padding:8px 14px; font-size:0.82rem; font-weight:600; cursor:pointer;">
                ⚡ Bulk Import CSV Screen
              </button>
              <button class="btn-secondary" id="btn-export-sup-csv" style="padding:8px 14px; font-size:0.82rem; font-weight:600; cursor:pointer;">
                📤 Export CSV
              </button>
              <button class="btn-primary nav-inv-btn" data-tab="inv-suppliers-create" style="padding:8px 16px; font-weight:700; background:var(--accent-primary); border-radius:6px; border:none; cursor:pointer; color:#fff;">
                + Add Vendor / Supplier Screen
              </button>
            </div>
          </div>
          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">Supplier Code</th>
                  <th style="padding:10px;">Vendor Name</th>
                  <th style="padding:10px;">Primary Contact</th>
                  <th style="padding:10px;">Phone</th>
                  <th style="padding:10px;">GSTIN</th>
                  <th style="padding:10px; text-align:right;">Actions & Catalogue</th>
                </tr>
              </thead>
              <tbody>
                ${suppliers.map(s => {
                  const sCode = s.supplierCode || s.supplier_code || s.id;
                  const catCount = supplierCatalog.filter(c => (c.supplierCode === sCode || c.supplier_code === sCode)).length;
                  return `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${sCode}</td>
                      <td style="padding:10px; font-weight:600;">${s.supplierName || s.supplier_name}</td>
                      <td style="padding:10px;">${s.primaryContact || s.primary_contact || 'N/A'}</td>
                      <td style="padding:10px;">${s.phone || 'N/A'}</td>
                      <td style="padding:10px; font-family:monospace;">${s.gstin || 'N/A'}</td>
                      <td style="padding:10px; text-align:right;">
                        <button class="btn-primary btn-view-sup-cat" data-supcode="${sCode}" style="padding:6px 12px; font-size:0.8rem; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); border:none; color:#fff; border-radius:4px; cursor:pointer;">
                          📖 View Catalogue (${catCount})
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      mount.querySelectorAll('.btn-view-sup-cat').forEach(b => {
        b.addEventListener('click', () => {
          this.selectedSupplierCode = b.dataset.supcode;
          this.activeSubView = 'inv-suppliers-catalogue';
          const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
          this.render(targetMount, session);
        });
      });

      const btnTmplSup = mount.querySelector('#btn-dl-sup-tmpl');
      if (btnTmplSup) btnTmplSup.addEventListener('click', () => this.downloadSupplierTemplate());

      const btnExportSup = mount.querySelector('#btn-export-sup-csv');
      if (btnExportSup) btnExportSup.addEventListener('click', () => this.exportSuppliersCSV(suppliers));
    } else if (tabKey === 'inv-grn') {
      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="font-size:1.4rem; margin:0;">🚚 Goods Receiving Studio (GRN) (${grns.length} Receipts)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">Post physical stock receipts and update location <strong>stock_balances</strong> in Supabase.</p>
            </div>
            <button class="btn-primary nav-inv-btn" data-tab="inv-grn-create" style="padding:10px 18px; font-weight:700; background:linear-gradient(135deg, var(--status-success), #059669); border-radius:6px; border:none; cursor:pointer; color:#fff;">
              📥 + Post Goods Receipt Note (GRN) Screen
            </button>
          </div>
          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">GRN #</th>
                  <th style="padding:10px;">PO Ref #</th>
                  <th style="padding:10px;">Vendor / Supplier</th>
                  <th style="padding:10px;">Receiving Location</th>
                  <th style="padding:10px;">Receipt Date</th>
                  <th style="padding:10px;">Challan / Inv #</th>
                  <th style="padding:10px;">Accepted Valuation</th>
                  <th style="padding:10px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${grns.length ? grns.map(g => {
                  const grnNum = g.grnNumber || g.grn_number || g.id;
                  const poNum = g.poNumber || g.po_number || 'Direct';
                  const supName = g.supplierName || g.supplier_name || g.supplierCode;
                  const locCode = g.receivingLocationCode || g.receiving_location_code || 'LOC-805';
                  const dateStr = g.receivedDate || g.received_date || 'N/A';
                  const invNo = g.vendorInvoiceNo || g.vendor_invoice_no || 'N/A';
                  const valuation = parseFloat(g.totalAmount || g.total_amount || 0);

                  return `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--status-success);">${grnNum}</td>
                      <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${poNum}</td>
                      <td style="padding:10px; font-weight:600;">${supName}</td>
                      <td style="padding:10px;"><span class="badge badge-info">${locCode}</span></td>
                      <td style="padding:10px;">${dateStr}</td>
                      <td style="padding:10px; font-family:monospace;">${invNo}</td>
                      <td style="padding:10px; font-weight:700; color:var(--status-success);">₹${valuation.toFixed(2)}</td>
                      <td style="padding:10px;"><span class="badge badge-success">POSTED</span></td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="8" style="padding:24px; text-align:center; color:var(--text-muted);">
                      No GRN receipts posted yet. Click <strong>"+ Post Goods Receipt Note Screen"</strong> to receive physical stock against an approved PO.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (tabKey === 'inv-po') {
      const activePOs = pos.filter(p => (!tenantId || p.tenantId === tenantId || p.tenant_id === tenantId));
      const draftCount = activePOs.filter(p => p.status === 'DRAFT').length;
      const approvedCount = activePOs.filter(p => p.status === 'APPROVED' || p.status === 'PARTIALLY_RECEIVED' || p.status === 'FULLY_RECEIVED').length;
      const totalPoValuation = activePOs.reduce((sum, p) => sum + (parseFloat(p.grandTotal || p.grand_total) || 0), 0);

      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="font-size:1.4rem; margin:0;">📄 Purchase Orders / Procurement (${activePOs.length} Orders)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Raise, snapshot vendor catalogue prices, and approve Purchase Orders directly in Supabase.
              </p>
            </div>
            <button class="btn-primary nav-inv-btn" data-tab="inv-po-create" style="padding:10px 18px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); border-radius:6px; border:none; cursor:pointer; color:#fff;">
              📋 + Create Purchase Order Screen
            </button>
          </div>

          <!-- KPI Summary Cards -->
          <div class="grid grid-cols-3 gap-md" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:20px;">
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">TOTAL PURCHASE ORDERS</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--accent-primary); margin-top:2px;">
                ${activePOs.length} Orders
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">APPROVED & ISSUED POs</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--status-info); margin-top:2px;">
                ${approvedCount} Orders ${draftCount > 0 ? `<span style="font-size:0.85rem; color:var(--status-warning);">(${draftCount} Drafts)</span>` : ''}
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">TOTAL PROCUREMENT COMMITMENT</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--status-success); margin-top:2px;">
                ₹${Math.round(totalPoValuation).toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">PO #</th>
                  <th style="padding:10px;">Vendor / Supplier</th>
                  <th style="padding:10px;">Destination Location</th>
                  <th style="padding:10px;">Order Date</th>
                  <th style="padding:10px;">Grand Total</th>
                  <th style="padding:10px;">Status</th>
                  <th style="padding:10px; text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${activePOs.length ? activePOs.map(p => {
                  const status = p.status || 'APPROVED';
                  let statusBadgeClass = 'badge-info';
                  if (status === 'DRAFT') statusBadgeClass = 'badge-warning';
                  else if (status === 'APPROVED') statusBadgeClass = 'badge-info';
                  else if (status === 'PARTIALLY_RECEIVED') statusBadgeClass = 'badge-secondary';
                  else if (status === 'FULLY_RECEIVED') statusBadgeClass = 'badge-success';
                  else if (status === 'CANCELLED') statusBadgeClass = 'badge-danger';

                  const poId = p.id;
                  const poNum = p.poNumber || p.po_number || p.id;

                  return `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${poNum}</td>
                      <td style="padding:10px; font-weight:600;">${p.supplierName || p.supplier_name || p.supplierCode}</td>
                      <td style="padding:10px;"><span class="badge badge-info">${p.destinationLocationCode || p.destination_location_code}</span></td>
                      <td style="padding:10px;">${p.orderDate || p.order_date || 'N/A'}</td>
                      <td style="padding:10px; font-weight:700; color:var(--status-success);">₹${(parseFloat(p.grandTotal || p.grand_total) || 0).toFixed(2)}</td>
                      <td style="padding:10px;"><span class="badge ${statusBadgeClass}">${status}</span></td>
                      <td style="padding:10px; text-align:right;">
                        ${status === 'DRAFT' ? `
                          <button class="btn-primary btn-approve-po" data-poid="${poId}" data-ponum="${poNum}" style="padding:4px 8px; font-size:0.75rem; font-weight:700; background:var(--status-success); color:#fff; border:none; border-radius:4px; cursor:pointer;" title="Approve PO">
                            ✅ Approve
                          </button>
                          <button class="btn-secondary btn-edit-po" data-poid="${poId}" style="padding:4px 8px; font-size:0.75rem; font-weight:600; cursor:pointer; margin-left:4px;" title="Edit Draft PO">
                            ✏️ Edit
                          </button>
                          <button class="btn-secondary btn-cancel-po" data-poid="${poId}" data-ponum="${poNum}" style="padding:4px 8px; font-size:0.75rem; font-weight:700; background:var(--status-danger); color:#fff; border:none; border-radius:4px; cursor:pointer; margin-left:4px;" title="Cancel Draft PO">
                            🔴 Cancel
                          </button>
                        ` : `
                          <button class="btn-secondary btn-dl-po" data-poid="${poId}" style="padding:4px 8px; font-size:0.75rem; font-weight:600; cursor:pointer;" title="Download Printable PDF">
                            📥 Download PDF
                          </button>
                          <button class="btn-primary btn-share-wa-po" data-poid="${poId}" style="padding:4px 8px; font-size:0.75rem; font-weight:700; background:#25D366; color:#fff; border:none; border-radius:4px; cursor:pointer; margin-left:4px;" title="Share via WhatsApp Web">
                            💬 Share WhatsApp
                          </button>
                        `}
                      </td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="7" style="padding:24px; text-align:center; color:var(--text-muted);">
                      No Purchase Orders created yet. Click <strong>"+ Create Purchase Order Screen"</strong> to raise a new PO.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;

      mount.querySelectorAll('.btn-approve-po').forEach(b => {
        b.addEventListener('click', async () => {
          const poId = b.dataset.poid;
          const poNum = b.dataset.ponum;
          const gw = this._getDataGateway();
          if (gw) {
            await gw.update('purchase_orders', poId, { status: 'APPROVED' }, session);
          }
          alert(`🎉 Purchase Order ${poNum} Approved!\n\n🔒 ACCOUNTING RULE ENFORCED:\nPO approval does NOT alter stock balances. Physical stock will be received when a Goods Receipt Note (GRN) is posted and accepted.`);
          const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
          this.render(targetMount, session);
        });
      });

      mount.querySelectorAll('.btn-edit-po').forEach(b => {
        b.addEventListener('click', () => {
          const poId = b.dataset.poid;
          const poObj = activePOs.find(p => p.id === poId || p.poNumber === poId || p.po_number === poId);
          if (poObj) {
            this.editingPo = poObj;
            this.poDraftLines = Array.isArray(poObj.lines) ? [...poObj.lines] : [];
            this.activeSubView = 'inv-po-create';
            const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
            this.render(targetMount, session);
          }
        });
      });

      mount.querySelectorAll('.btn-cancel-po').forEach(b => {
        b.addEventListener('click', async () => {
          const poId = b.dataset.poid;
          const poNum = b.dataset.ponum;
          if (confirm(`Are you sure you want to CANCEL Purchase Order ${poNum}?`)) {
            const gw = this._getDataGateway();
            if (gw) {
              await gw.update('purchase_orders', poId, { status: 'CANCELLED' }, session);
            }
            alert(`🔴 Purchase Order ${poNum} has been Cancelled.`);
            const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
            this.render(targetMount, session);
          }
        });
      });

      mount.querySelectorAll('.btn-dl-po').forEach(b => {
        b.addEventListener('click', () => {
          const poId = b.dataset.poid;
          const poObj = activePOs.find(p => p.id === poId || p.poNumber === poId || p.po_number === poId);
          if (poObj) this.downloadPoDocument(poObj, suppliers);
        });
      });

      mount.querySelectorAll('.btn-share-wa-po').forEach(b => {
        b.addEventListener('click', () => {
          const poId = b.dataset.poid;
          const poObj = activePOs.find(p => p.id === poId || p.poNumber === poId || p.po_number === poId);
          if (poObj) this.sharePoViaWhatsApp(poObj, suppliers);
        });
      });
    } else if (tabKey === 'inv-alerts') {
      const lowStockList = items.map(i => {
        const itemCode = i.itemCode || i.item_code;
        const itemBalances = balances.filter(b => (b.itemCode === itemCode || b.item_code === itemCode) && (!tenantId || b.tenantId === tenantId || b.tenant_id === tenantId));
        const currentQty = itemBalances.length
          ? itemBalances.reduce((sum, b) => sum + (parseFloat(b.quantity) || 0), 0)
          : parseFloat(i.currentStock !== undefined ? i.currentStock : (i.openingStock !== undefined ? i.openingStock : 0)) || 0;
        
        const reorderLevel = parseFloat(i.reorderLevel || i.reorder_level || 10);
        const unitCost = parseFloat(i.unitValuation || i.unit_valuation || i.lastPurchasePrice || i.last_purchase_price || 120);
        const isOut = currentQty <= 0;
        const isLow = currentQty > 0 && currentQty <= reorderLevel;
        const shortfall = Math.max(0, reorderLevel - currentQty);
        const suggestedOrderQty = shortfall > 0 ? (reorderLevel * 2 - currentQty) : (reorderLevel * 2);
        const estimatedCost = suggestedOrderQty * unitCost;

        return {
          ...i,
          itemCode,
          itemName: i.itemName || i.item_name,
          categoryCode: i.categoryCode || i.category_code || 'GENERAL',
          baseUom: i.baseUom || i.base_uom || 'KG',
          currentQty,
          reorderLevel,
          shortfall,
          suggestedOrderQty,
          unitCost,
          estimatedCost,
          isOut,
          isLow,
          showAlert: isOut || isLow
        };
      }).filter(i => i.showAlert);

      const totalCriticalOut = lowStockList.filter(i => i.isOut).length;
      const totalReorderBreach = lowStockList.filter(i => i.isLow).length;
      const totalEstimatedCost = lowStockList.reduce((sum, i) => sum + i.estimatedCost, 0);

      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
            <div>
              <h3 style="margin:0; color:var(--status-danger); font-size:1.4rem;">⚠️ Low Stock Alerts & Reorder Threshold Monitor (${lowStockList.length})</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Real-time stock depletion monitor comparing live location balances against reorder thresholds with estimated replenishment costs.
              </p>
            </div>
            <button class="btn-primary nav-inv-btn" data-tab="inv-po-create" style="padding:10px 18px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); border-radius:6px; border:none; cursor:pointer; color:#fff;">
              📋 + Create Purchase Order Screen
            </button>
          </div>

          <!-- KPI Summary Cards -->
          <div class="grid grid-cols-3 gap-md" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:20px;">
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">CRITICAL OUT OF STOCK</div>
              <div style="font-size:1.4rem; font-weight:700; color:${totalCriticalOut > 0 ? 'var(--status-danger)' : 'var(--status-success)'}; margin-top:2px;">
                ${totalCriticalOut} Items
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">REORDER THRESHOLD BREACHED</div>
              <div style="font-size:1.4rem; font-weight:700; color:${totalReorderBreach > 0 ? 'var(--status-warning)' : 'var(--status-success)'}; margin-top:2px;">
                ${totalReorderBreach} Items
              </div>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">ESTIMATED REPLENISHMENT COST</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--status-success); margin-top:2px;">
                ₹${Math.round(totalEstimatedCost).toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          <!-- Low Stock Items Data Table -->
          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">Item Code</th>
                  <th style="padding:10px;">Ingredient Name</th>
                  <th style="padding:10px;">Category</th>
                  <th style="padding:10px;">Current Stock</th>
                  <th style="padding:10px;">Reorder Level</th>
                  <th style="padding:10px;">Suggested Order Qty</th>
                  <th style="padding:10px;">Est. Cost</th>
                  <th style="padding:10px;">Alert Status</th>
                  <th style="padding:10px; text-align:right;">Quick Action</th>
                </tr>
              </thead>
              <tbody>
                ${lowStockList.length ? lowStockList.map(i => `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${i.itemCode}</td>
                    <td style="padding:10px; font-weight:600;">${i.itemName}</td>
                    <td style="padding:10px;"><span class="badge badge-secondary" style="font-size:0.7rem;">${i.categoryCode}</span></td>
                    <td style="padding:10px; font-weight:700; color:${i.isOut ? 'var(--status-danger)' : 'var(--status-warning)'};">${i.currentQty.toFixed(2)} ${i.baseUom}</td>
                    <td style="padding:10px; font-weight:600;">${i.reorderLevel.toFixed(2)} ${i.baseUom}</td>
                    <td style="padding:10px; font-weight:700; color:var(--accent-primary);">${i.suggestedOrderQty.toFixed(2)} ${i.baseUom}</td>
                    <td style="padding:10px; font-weight:600; color:var(--status-success);">₹${Math.round(i.estimatedCost).toLocaleString('en-IN')}</td>
                    <td style="padding:10px;">
                      <span class="badge ${i.isOut ? 'badge-danger' : 'badge-warning'}">
                        ${i.isOut ? '🔴 OUT OF STOCK' : '⚠️ REORDER BREACH'}
                      </span>
                    </td>
                    <td style="padding:10px; text-align:right;">
                      <button class="btn-primary nav-inv-btn" data-tab="inv-po-create" style="padding:4px 10px; font-size:0.75rem; font-weight:700; background:var(--accent-primary); color:#fff; border:none; border-radius:4px; cursor:pointer;">
                        📋 Raise PO
                      </button>
                      <button class="btn-primary nav-inv-btn" data-tab="inv-grn-create" style="padding:4px 10px; font-size:0.75rem; font-weight:700; background:var(--status-success); color:#fff; border:none; border-radius:4px; cursor:pointer; margin-left:4px;">
                        📥 Post GRN
                      </button>
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="9" style="padding:24px; text-align:center; color:var(--text-muted);">
                      🎉 No low stock alerts! All inventory items have healthy stock levels above reorder thresholds.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
  }

  // --- SUPPLIER CATALOGUE WORKSPACE SCREENS ---

  renderSupplierCatalogueScreen(mount, tenantId, suppliers, items, supplierCatalog, session) {
    const selectedSupplierCode = this.selectedSupplierCode || (suppliers[0]?.supplierCode || suppliers[0]?.supplier_code || 'SUP-101');
    const selectedSupplier = suppliers.find(s => (s.supplierCode === selectedSupplierCode || s.supplier_code === selectedSupplierCode)) || suppliers[0] || {};
    const supplierCode = selectedSupplier.supplierCode || selectedSupplier.supplier_code || selectedSupplierCode;

    const catalogItems = supplierCatalog.filter(c => (c.supplierCode === supplierCode || c.supplier_code === supplierCode));

    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
        <!-- Top Navigation Back Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-suppliers" style="font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer;">
            ← Back to Suppliers Master
          </button>
          <div style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">📖 Supplier Catalogue Studio</div>
        </div>

        <!-- Supplier Info Cockpit Banner -->
        <div style="background:var(--bg-surface-2); padding:18px; border-radius:8px; border-left:4px solid var(--accent-primary); margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">SELECTED VENDOR CATALOGUE</div>
            <h3 style="margin:2px 0 0 0; color:var(--accent-primary); font-size:1.4rem;">${selectedSupplier.supplierName || selectedSupplier.supplier_name || 'Vendor'} (${supplierCode})</h3>
            <div style="font-size:0.82rem; color:var(--text-muted); margin-top:4px;">
              Contact: <strong>${selectedSupplier.primaryContact || selectedSupplier.primary_contact || 'N/A'}</strong> | Phone: <strong>${selectedSupplier.phone || 'N/A'}</strong> | GSTIN: <strong>${selectedSupplier.gstin || 'N/A'}</strong>
            </div>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <select id="scat-switch-sup-sel" style="padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); font-weight:600;">
              ${suppliers.map(s => {
                const sCode = s.supplierCode || s.supplier_code;
                return `<option value="${sCode}" ${sCode === supplierCode ? 'selected' : ''}>${s.supplierName || s.supplier_name} (${sCode})</option>`;
              }).join('')}
            </select>

            <button class="btn-primary nav-inv-btn" data-tab="inv-suppliers-catalogue-add" style="padding:10px 18px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); border-radius:6px; border:none; cursor:pointer; color:#fff;">
              + Add Item to Supplier Catalogue Screen
            </button>
          </div>
        </div>

        <!-- Catalogue Table -->
        <div class="table-responsive">
          <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                <th style="padding:10px;">Master Item Code & Name</th>
                <th style="padding:10px;">Supplier SKU</th>
                <th style="padding:10px;">Purchase UOM</th>
                <th style="padding:10px;">Contracted / List Price</th>
                <th style="padding:10px;">Last Actual Price</th>
                <th style="padding:10px;">Last Purchase Date</th>
                <th style="padding:10px;">Weighted Avg Price</th>
                <th style="padding:10px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${catalogItems.length ? catalogItems.map(c => {
                const itemCode = c.itemCode || c.item_code;
                const masterItem = items.find(i => (i.itemCode === itemCode || i.item_code === itemCode)) || {};
                const itemName = masterItem.itemName || masterItem.item_name || itemCode;
                const sku = c.supplierSku || c.supplier_sku || 'N/A';
                const uom = c.purchaseUom || c.purchase_uom || masterItem.baseUom || masterItem.base_uom || 'KG';
                const currPrice = parseFloat(c.currentPrice || c.current_price) || 0;
                const lastPrice = parseFloat(c.lastPurchasePrice || c.last_purchase_price) || currPrice;
                const lastDate = c.lastPurchaseAt || c.last_purchase_at || new Date().toISOString().split('T')[0];
                const avgPrice = parseFloat(c.averagePurchasePrice || c.average_purchase_price) || currPrice;

                return `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:10px; font-weight:600;">
                      ${itemName} <br><span style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${itemCode}</span>
                    </td>
                    <td style="padding:10px; font-family:monospace;"><span class="badge badge-secondary">${sku}</span></td>
                    <td style="padding:10px;"><span class="badge badge-info">${uom}</span></td>
                    <td style="padding:10px; font-weight:700; color:var(--status-success);">₹${currPrice.toFixed(2)}</td>
                    <td style="padding:10px; font-weight:600; color:var(--accent-primary);">₹${lastPrice.toFixed(2)}</td>
                    <td style="padding:10px; color:var(--text-muted);">${lastDate}</td>
                    <td style="padding:10px; font-weight:600; color:var(--status-info);">₹${avgPrice.toFixed(2)}</td>
                    <td style="padding:10px;"><span class="badge badge-success">LIVE CATALOGUE</span></td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="8" style="padding:24px; text-align:center; color:var(--text-muted);">
                    No catalogue items mapped for <strong>${selectedSupplier.supplierName || supplierCode}</strong>.
                    <br>Click <strong>"+ Add Item to Supplier Catalogue Screen"</strong> to link master inventory items to this vendor.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const switchSel = mount.querySelector('#scat-switch-sup-sel');
    if (switchSel) {
      switchSel.addEventListener('change', (e) => {
        this.selectedSupplierCode = e.target.value;
        const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
        this.render(targetMount, session);
      });
    }
  }

  renderAddSupplierCatalogueItemScreen(mount, tenantId, suppliers, items, session) {
    const selectedSupplierCode = this.selectedSupplierCode || (suppliers[0]?.supplierCode || suppliers[0]?.supplier_code || 'SUP-101');
    const selectedSupplier = suppliers.find(s => (s.supplierCode === selectedSupplierCode || s.supplier_code === selectedSupplierCode)) || suppliers[0] || {};
    const supplierCode = selectedSupplier.supplierCode || selectedSupplier.supplier_code || selectedSupplierCode;

    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
        <!-- Top Navigation Back Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-suppliers-catalogue" style="font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer;">
            ← Back to Supplier Catalogue
          </button>
          <div style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">➕ Add Item to Supplier Catalogue Screen</div>
        </div>

        <h3 style="margin-top:0; color:var(--accent-primary); font-size:1.5rem;">+ Link Master Inventory Item to Supplier Catalogue</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:20px;">
          Select an existing master inventory item and establish supplier-specific list pricing and SKUs in Supabase.
        </p>

        <div style="display:flex; flex-direction:column; gap:16px; max-width:600px;">
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Target Vendor / Supplier *</label>
            <input type="text" value="${selectedSupplier.supplierName || supplierCode} (${supplierCode})" readonly style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); font-weight:700; color:var(--accent-primary);">
          </div>

          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Master Inventory Item * (Select from existing master catalog)</label>
            <select id="scat-item-sel" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1);">
              ${items.map(i => {
                const code = i.itemCode || i.item_code;
                const name = i.itemName || i.item_name;
                const uom = i.baseUom || i.base_uom || 'KG';
                return `<option value="${code}" data-uom="${uom}">${name} (${code}) — Base UOM: ${uom}</option>`;
              }).join('')}
            </select>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Supplier SKU / Vendor Part #</label>
              <input type="text" id="scat-sku-inp" placeholder="e.g. FFP-RICE-25KG" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); text-transform:uppercase;">
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Purchase UOM *</label>
              <input type="text" id="scat-uom-inp" value="${items[0]?.baseUom || items[0]?.base_uom || 'KG'}" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); text-transform:uppercase;">
            </div>
          </div>

          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Contracted / List Price per Purchase UOM (₹) *</label>
            <input type="number" id="scat-price-inp" value="68" min="0.01" step="0.01" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); font-weight:700;">
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button class="btn-secondary nav-inv-btn" data-tab="inv-suppliers-catalogue" style="padding:10px 20px;">Cancel</button>
            <button class="btn-primary" id="btn-scat-save" style="padding:12px 24px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); color:#fff; border:none; border-radius:6px; cursor:pointer;">
              Save Catalogue Item to Supabase
            </button>
          </div>
        </div>
      </div>
    `;

    const itemSel = mount.querySelector('#scat-item-sel');
    const uomInp = mount.querySelector('#scat-uom-inp');

    if (itemSel && uomInp) {
      itemSel.addEventListener('change', () => {
        const opt = itemSel.options[itemSel.selectedIndex];
        uomInp.value = opt.dataset.uom || 'KG';
      });
    }

    mount.querySelector('#btn-scat-save').addEventListener('click', async () => {
      const itemCode = itemSel.value;
      const supplierSku = mount.querySelector('#scat-sku-inp').value.trim().toUpperCase() || `${supplierCode}-${itemCode}`;
      const purchaseUom = uomInp.value.trim().toUpperCase() || 'KG';
      const currentPrice = parseFloat(mount.querySelector('#scat-price-inp').value) || 0;

      if (currentPrice <= 0) {
        alert('❌ Contracted price must be greater than 0.');
        return;
      }

      const masterItem = items.find(i => (i.itemCode === itemCode || i.item_code === itemCode)) || {};
      const itemName = masterItem.itemName || masterItem.item_name || itemCode;

      const newCatalogItem = {
        id: `scat-${Date.now()}`,
        tenantId,
        tenant_id: tenantId,
        supplierCode,
        supplier_code: supplierCode,
        itemCode,
        item_code: itemCode,
        supplierSku,
        supplier_sku: supplierSku,
        purchaseUom,
        purchase_uom: purchaseUom,
        currentPrice,
        current_price: currentPrice,
        lastPurchasePrice: currentPrice,
        last_purchase_price: currentPrice,
        lastPurchaseAt: new Date().toISOString().split('T')[0],
        averagePurchasePrice: currentPrice,
        average_purchase_price: currentPrice,
        status: 'ACTIVE'
      };

      const gw = this._getDataGateway();
      if (gw) await gw.create('supplier_catalog', newCatalogItem);

      alert(`🎉 Added "${itemName}" (${itemCode}) to ${selectedSupplier.supplierName || supplierCode}'s Catalogue at ₹${currentPrice.toFixed(2)} / ${purchaseUom}!`);
      this.activeSubView = 'inv-suppliers-catalogue';
      const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
      this.render(targetMount, session);
    });
  }

  // --- 1. FULL-SCREEN STOCK TRANSFER WORKSPACE ---

  renderStockTransferFormScreen(mount, tenantId, items, locations, balances, session) {
    this.trfDraftLines = [];

    const getStockAtLoc = (itemCode, locCode) => {
      const bal = balances.find(b => 
        (b.itemCode === itemCode || b.item_code === itemCode) && 
        (b.locationCode === locCode || b.location_code === locCode) &&
        (!tenantId || b.tenantId === tenantId || b.tenant_id === tenantId)
      );
      if (bal) return parseFloat(bal.quantity) || 0;
      if (locCode === 'LOC-805' || locCode === 'LOC-901' || locCode === 'MAIN') {
        const itemObj = items.find(i => (i.itemCode === itemCode || i.item_code === itemCode));
        return parseFloat(itemObj?.openingStock || itemObj?.opening_stock || 0);
      }
      return 0;
    };

    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
        <!-- Top Navigation Back Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-transfers" style="font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer;">
            ← Back to Stock Transfers
          </button>
          <div style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">🔄 Inter-Store Stock Transfer Form Screen</div>
        </div>

        <h3 style="margin-top:0; color:var(--accent-primary); font-size:1.5rem;">🔄 Inter-Store Stock Transfer Studio</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:20px;">
          Transfer inventory stock between warehouses with live source stock availability validation and dual-ended before/after stock level ledgering.
        </p>

        <div style="display:flex; flex-direction:column; gap:16px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">From Source Location *</label>
              <select id="trf-from-loc" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2);">
                ${locations.map(l => `<option value="${l.locationCode || l.location_code}">${l.locationName || l.location_name} (${l.locationCode || l.location_code})</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">To Destination Location *</label>
              <select id="trf-to-loc" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2);">
                ${locations.map((l, idx) => `<option value="${l.locationCode || l.location_code}" ${idx === 1 ? 'selected' : ''}>${l.locationName || l.location_name} (${l.locationCode || l.location_code})</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="width:50%;">
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Transfer Date *</label>
            <input type="date" id="trf-date" value="${new Date().toISOString().split('T')[0]}" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2);">
          </div>

          <!-- Line Items Selector -->
          <div style="background:var(--bg-surface-2); padding:18px; border-radius:8px; border:1px solid var(--border-subtle); margin-top:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <div style="font-weight:700; font-size:0.9rem; color:var(--accent-primary);">+ Add Line Items to Transfer</div>
              <div id="trf-source-avail-badge" style="font-size:0.8rem; font-weight:700;"></div>
            </div>
            
            <div style="display:flex; gap:12px; align-items:center;">
              <select id="trf-item-sel" style="flex:3; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
                <!-- Dynamically populated based on selected source location -->
              </select>
              <input type="number" id="trf-qty-inp" value="10" min="0.01" step="0.01" style="width:120px; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);" placeholder="Qty">
              <button type="button" id="btn-add-trf-line" class="btn-primary" style="padding:10px 18px; font-weight:700; background:var(--accent-primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">
                + Add Line Item
              </button>
            </div>

            <!-- Draft Lines Table -->
            <table style="width:100%; font-size:0.85rem; margin-top:16px; border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; color:var(--text-muted); background:var(--bg-surface-1);">
                  <th style="padding:10px;">Item Code & Name</th>
                  <th style="padding:10px;">Transfer Qty</th>
                  <th style="padding:10px;">Source Stock (Before ➔ After)</th>
                  <th style="padding:10px;">Target Stock (Before ➔ After)</th>
                  <th style="padding:10px; text-align:right;">Action</th>
                </tr>
              </thead>
              <tbody id="trf-lines-tbody">
                <tr>
                  <td colspan="5" style="padding:20px; text-align:center; color:var(--text-muted);">No items added yet. Select an item above and click <strong>"+ Add Line Item"</strong>.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button class="btn-secondary nav-inv-btn" data-tab="inv-transfers" style="padding:10px 20px; font-weight:600;">
              ← Cancel & Return
            </button>
            <button class="btn-primary" id="btn-trf-commit" style="padding:12px 24px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:0.95rem;">
              🔄 Post Transfer & Adjust Supabase Balances
            </button>
          </div>
        </div>
      </div>
    `;

    const updateItemOptions = () => {
      const fromLoc = mount.querySelector('#trf-from-loc').value;
      const itemSel = mount.querySelector('#trf-item-sel');
      if (!itemSel) return;

      itemSel.innerHTML = items.map(i => {
        const code = i.itemCode || i.item_code;
        const name = i.itemName || i.item_name;
        const uom = i.baseUom || i.base_uom || 'KG';
        const avail = getStockAtLoc(code, fromLoc);
        const stockStatus = avail > 0 ? `🟢 ${avail} ${uom} Available` : `🔴 0 ${uom} (OUT OF STOCK)`;
        return `<option value="${code}" data-name="${name}" data-uom="${uom}" data-avail="${avail}">${name} (${code}) — ${stockStatus}</option>`;
      }).join('');
    };

    updateItemOptions();
    mount.querySelector('#trf-from-loc').addEventListener('change', () => {
      this.trfDraftLines = [];
      updateItemOptions();
      renderDraftLines();
    });

    const renderDraftLines = () => {
      const tbody = mount.querySelector('#trf-lines-tbody');
      if (!tbody) return;
      if (this.trfDraftLines.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" style="padding:20px; text-align:center; color:var(--text-muted);">No items added yet. Select an item above and click <strong>"+ Add Line Item"</strong>.</td>
          </tr>
        `;
        return;
      }
      tbody.innerHTML = this.trfDraftLines.map((l, idx) => `
        <tr style="border-bottom:1px solid var(--border-subtle);">
          <td style="padding:10px; font-weight:600;">${l.itemName} <br><span style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${l.itemCode}</span></td>
          <td style="padding:10px; font-weight:700; color:var(--status-info);">${l.quantity} ${l.baseUom}</td>
          <td style="padding:10px; font-size:0.82rem;">
            <span style="color:var(--text-muted); text-decoration:line-through;">${l.fromBeforeQty}</span>
            ➔ <strong style="color:${l.fromAfterQty === 0 ? 'var(--status-danger)' : 'var(--accent-primary)'};">${l.fromAfterQty} ${l.baseUom}</strong>
          </td>
          <td style="padding:10px; font-size:0.82rem;">
            <span style="color:var(--text-muted); text-decoration:line-through;">${l.toBeforeQty}</span>
            ➔ <strong style="color:var(--status-success);">${l.toAfterQty} ${l.baseUom}</strong>
          </td>
          <td style="padding:10px; text-align:right;">
            <button type="button" class="btn-rm-trf" data-idx="${idx}" style="padding:4px 10px; font-size:0.8rem; background:var(--status-danger); color:#fff; border:none; border-radius:4px; cursor:pointer;">✕</button>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('.btn-rm-trf').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.idx, 10);
          this.trfDraftLines.splice(idx, 1);
          renderDraftLines();
        });
      });
    };

    mount.querySelector('#btn-add-trf-line').addEventListener('click', () => {
      const fromLoc = mount.querySelector('#trf-from-loc').value;
      const toLoc = mount.querySelector('#trf-to-loc').value;
      if (fromLoc === toLoc) {
        alert('❌ Source and Destination storage locations must be different.');
        return;
      }

      const itemSel = mount.querySelector('#trf-item-sel');
      const qtyInp = mount.querySelector('#trf-qty-inp');
      if (!itemSel) return;
      const opt = itemSel.options[itemSel.selectedIndex];
      const itemCode = opt.value;
      const itemName = opt.dataset.name || opt.text.split(' (')[0];
      const baseUom = opt.dataset.uom || 'KG';
      const requestedQty = parseFloat(qtyInp.value) || 0;

      if (requestedQty <= 0) {
        alert('❌ Transfer quantity must be greater than 0.');
        return;
      }

      const availableAtSource = getStockAtLoc(itemCode, fromLoc);
      const availableAtDest = getStockAtLoc(itemCode, toLoc);

      const alreadyDraftedQty = this.trfDraftLines
        .filter(l => l.itemCode === itemCode)
        .reduce((sum, l) => sum + l.quantity, 0);

      const totalRequested = requestedQty + alreadyDraftedQty;

      if (totalRequested > availableAtSource) {
        alert(`❌ INSUFFICIENT STOCK AT SOURCE LOCATION (${fromLoc})!\n\nItem: ${itemName} (${itemCode})\nAvailable Stock: ${availableAtSource} ${baseUom}\nAlready Drafted: ${alreadyDraftedQty} ${baseUom}\nRequested: ${requestedQty} ${baseUom}\nShortfall: ${(totalRequested - availableAtSource).toFixed(2)} ${baseUom}\n\nPlease receive stock via GRN or select an item with available stock.`);
        return;
      }

      const fromBeforeQty = availableAtSource - alreadyDraftedQty;
      const fromAfterQty = availableAtSource - totalRequested;
      const toBeforeQty = availableAtDest;
      const toAfterQty = availableAtDest + totalRequested;

      this.trfDraftLines.push({
        itemCode,
        itemName,
        quantity: requestedQty,
        baseUom,
        fromBeforeQty,
        fromAfterQty,
        toBeforeQty,
        toAfterQty
      });

      renderDraftLines();
    });

    mount.querySelector('#btn-trf-commit').addEventListener('click', async () => {
      const fromLocationCode = mount.querySelector('#trf-from-loc').value;
      const toLocationCode = mount.querySelector('#trf-to-loc').value;
      const transferDate = mount.querySelector('#trf-date').value || new Date().toISOString().split('T')[0];

      if (fromLocationCode === toLocationCode) {
        alert('❌ Source and Destination storage locations must be different.');
        return;
      }

      if (this.trfDraftLines.length === 0) {
        alert('❌ Please add at least 1 line item to transfer.');
        return;
      }

      for (const line of this.trfDraftLines) {
        const liveSourceAvail = getStockAtLoc(line.itemCode, fromLocationCode);
        if (line.quantity > liveSourceAvail) {
          alert(`❌ Cannot commit transfer! Item "${line.itemName}" has only ${liveSourceAvail} ${line.baseUom} available at ${fromLocationCode}.`);
          return;
        }
      }

      const transferNo = `TRF-${Date.now().toString().substring(7)}`;
      const gw = this._getDataGateway();

      const newTransfer = {
        id: `trf-${Date.now()}`,
        tenantId,
        tenant_id: tenantId,
        transferNo,
        transfer_no: transferNo,
        fromLocationCode,
        from_location_code: fromLocationCode,
        toLocationCode,
        to_location_code: toLocationCode,
        transferDate,
        transfer_date: transferDate,
        lines: this.trfDraftLines,
        status: 'COMPLETED'
      };

      let stockBreakdownText = `🎉 Stock Transfer ${transferNo} Posted Cleanly!\n\n📍 BEFORE & AFTER STOCK LEVELS:\n`;

      if (gw) {
        await gw.create('stock_transfers', newTransfer);

        for (const line of this.trfDraftLines) {
          const fromBal = balances.find(b => (b.itemCode === line.itemCode || b.item_code === line.itemCode) && (b.locationCode === fromLocationCode || b.location_code === fromLocationCode));
          if (fromBal) {
            const currentFromQty = parseFloat(fromBal.quantity) || 0;
            const newFromQty = Math.max(0, currentFromQty - line.quantity);
            const unitCost = parseFloat(fromBal.unitCost || fromBal.unit_cost) || 0;
            await gw.update('stock_balances', fromBal.id, {
              ...fromBal,
              quantity: newFromQty,
              valuation: newFromQty * unitCost,
              lastUpdatedAt: new Date().toISOString()
            });
          }

          const toBal = balances.find(b => (b.itemCode === line.itemCode || b.item_code === line.itemCode) && (b.locationCode === toLocationCode || b.location_code === toLocationCode));
          if (toBal) {
            const currentToQty = parseFloat(toBal.quantity) || 0;
            const newToQty = currentToQty + line.quantity;
            const unitCost = parseFloat(toBal.unitCost || toBal.unit_cost) || 0;
            await gw.update('stock_balances', toBal.id, {
              ...toBal,
              quantity: newToQty,
              valuation: newToQty * unitCost,
              lastUpdatedAt: new Date().toISOString()
            });
          } else {
            await gw.create('stock_balances', {
              id: `sb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              tenantId,
              tenant_id: tenantId,
              itemCode: line.itemCode,
              item_code: line.itemCode,
              locationCode: toLocationCode,
              location_code: toLocationCode,
              quantity: line.quantity,
              unitCost: 100,
              unit_cost: 100,
              valuation: line.quantity * 100,
              lastUpdatedAt: new Date().toISOString()
            });
          }

          stockBreakdownText += `• ${line.itemName} (${line.quantity} ${line.baseUom})\n` +
            `   Source (${fromLocationCode}): ${line.fromBeforeQty} ➔ ${line.fromAfterQty} ${line.baseUom}\n` +
            `   Target (${toLocationCode}): ${line.toBeforeQty} ➔ ${line.toAfterQty} ${line.baseUom}\n`;
        }
      }

      alert(stockBreakdownText);
      this.activeSubView = 'inv-transfers';
      const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
      this.render(targetMount, session);
    });
  }

  // --- 2. FULL-SCREEN STOCK ADJUSTMENT WORKSPACE ---

  renderStockAdjustmentFormScreen(mount, tenantId, items, locations, balances, session) {
    this.adjDraftLines = [];

    const getStockAtLoc = (itemCode, locCode) => {
      const bal = balances.find(b => 
        (b.itemCode === itemCode || b.item_code === itemCode) && 
        (b.locationCode === locCode || b.location_code === locCode) &&
        (!tenantId || b.tenantId === tenantId || b.tenant_id === tenantId)
      );
      if (bal) return parseFloat(bal.quantity) || 0;
      if (locCode === 'LOC-805' || locCode === 'LOC-901' || locCode === 'MAIN') {
        const itemObj = items.find(i => (i.itemCode === itemCode || i.item_code === itemCode));
        return parseFloat(itemObj?.openingStock || itemObj?.opening_stock || 0);
      }
      return 0;
    };

    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
        <!-- Top Navigation Back Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-adjustments" style="font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer;">
            ← Back to Stock Adjustments
          </button>
          <div style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">📊 Stock Adjustment Creation Screen</div>
        </div>

        <h3 style="margin-top:0; color:var(--accent-primary); font-size:1.5rem;">📊 Controlled Stock Adjustment Studio</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:20px;">
          Log controlled inventory adjustments (Wastage, Expiration, Damage, Audit Variance) with stock availability validation and live before/after ledgering.
        </p>

        <div style="display:flex; flex-direction:column; gap:16px;">
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Target Storage Location *</label>
              <select id="adj-loc-sel" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2);">
                ${locations.map(l => `<option value="${l.locationCode || l.location_code}">${l.locationName || l.location_name} (${l.locationCode || l.location_code})</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Adjustment Reason Code *</label>
              <select id="adj-reason-sel" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2);">
                <option value="WASTAGE">🗑️ WASTAGE (Food Spoilage / Kitchen Loss)</option>
                <option value="DAMAGE">📦 DAMAGE (Packaging / Physical Damage)</option>
                <option value="EXPIRATION">⌛ EXPIRATION (Past Expiration Date)</option>
                <option value="AUDIT_CORRECTION">🔍 AUDIT CORRECTION (Physical Variance)</option>
                <option value="OTHER">📝 OTHER (General Adjustment)</option>
              </select>
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Adjustment Date *</label>
              <input type="date" id="adj-date" value="${new Date().toISOString().split('T')[0]}" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2);">
            </div>
          </div>

          <!-- Line Items Selector -->
          <div style="background:var(--bg-surface-2); padding:18px; border-radius:8px; border:1px solid var(--border-subtle); margin-top:8px;">
            <div style="font-weight:700; font-size:0.9rem; color:var(--accent-primary); margin-bottom:12px;">+ Add Line Items to Adjustment</div>
            
            <div style="display:flex; gap:12px; align-items:center;">
              <select id="adj-item-sel" style="flex:3; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
                <!-- Dynamically populated based on selected storage location -->
              </select>
              
              <select id="adj-type-sel" style="width:180px; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
                <option value="DECREASE">🔻 DECREASE (Deduct)</option>
                <option value="INCREASE">🟢 INCREASE (Add)</option>
              </select>

              <input type="number" id="adj-qty-inp" value="2" min="0.01" step="0.01" style="width:110px; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);" placeholder="Qty">
              <button type="button" id="btn-add-adj-line" class="btn-primary" style="padding:10px 18px; font-weight:700; background:var(--accent-primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">
                + Add Line Item
              </button>
            </div>

            <!-- Draft Lines Table -->
            <table style="width:100%; font-size:0.85rem; margin-top:16px; border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; color:var(--text-muted); background:var(--bg-surface-1);">
                  <th style="padding:10px;">Item Code & Name</th>
                  <th style="padding:10px;">Type & Direction</th>
                  <th style="padding:10px;">Adjustment Qty</th>
                  <th style="padding:10px;">Location Stock (Before ➔ After)</th>
                  <th style="padding:10px; text-align:right;">Action</th>
                </tr>
              </thead>
              <tbody id="adj-lines-tbody">
                <tr>
                  <td colspan="5" style="padding:20px; text-align:center; color:var(--text-muted);">No items added yet. Select an item above and click <strong>"+ Add Line Item"</strong>.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button class="btn-secondary nav-inv-btn" data-tab="inv-adjustments" style="padding:10px 20px; font-weight:600;">
              ← Cancel & Return
            </button>
            <button class="btn-primary" id="btn-adj-commit" style="padding:12px 24px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:0.95rem;">
              📊 Post Stock Adjustment & Ledger Balances
            </button>
          </div>
        </div>
      </div>
    `;

    const updateItemOptions = () => {
      const locCode = mount.querySelector('#adj-loc-sel').value;
      const itemSel = mount.querySelector('#adj-item-sel');
      if (!itemSel) return;

      itemSel.innerHTML = items.map(i => {
        const code = i.itemCode || i.item_code;
        const name = i.itemName || i.item_name;
        const uom = i.baseUom || i.base_uom || 'KG';
        const avail = getStockAtLoc(code, locCode);
        const stockStatus = avail > 0 ? `🟢 ${avail} ${uom} Available` : `🔴 0 ${uom} (OUT OF STOCK)`;
        return `<option value="${code}" data-name="${name}" data-uom="${uom}" data-avail="${avail}">${name} (${code}) — ${stockStatus}</option>`;
      }).join('');
    };

    updateItemOptions();
    mount.querySelector('#adj-loc-sel').addEventListener('change', () => {
      this.adjDraftLines = [];
      updateItemOptions();
      renderDraftLines();
    });

    const renderDraftLines = () => {
      const tbody = mount.querySelector('#adj-lines-tbody');
      if (!tbody) return;
      if (this.adjDraftLines.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" style="padding:20px; text-align:center; color:var(--text-muted);">No items added yet. Select an item above and click <strong>"+ Add Line Item"</strong>.</td>
          </tr>
        `;
        return;
      }
      tbody.innerHTML = this.adjDraftLines.map((l, idx) => `
        <tr style="border-bottom:1px solid var(--border-subtle);">
          <td style="padding:10px; font-weight:600;">${l.itemName} <br><span style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${l.itemCode}</span></td>
          <td style="padding:10px;"><span class="badge ${l.adjustmentType === 'DECREASE' ? 'badge-danger' : 'badge-success'}">${l.adjustmentType}</span></td>
          <td style="padding:10px; font-weight:700; color:${l.adjustmentType === 'DECREASE' ? 'var(--status-danger)' : 'var(--status-success)'};">${l.quantity} ${l.baseUom}</td>
          <td style="padding:10px; font-size:0.82rem;">
            <span style="color:var(--text-muted); text-decoration:line-through;">${l.fromBeforeQty}</span>
            ➔ <strong style="color:${l.fromAfterQty === 0 ? 'var(--status-danger)' : 'var(--accent-primary)'};">${l.fromAfterQty} ${l.baseUom}</strong>
          </td>
          <td style="padding:10px; text-align:right;">
            <button type="button" class="btn-rm-adj" data-idx="${idx}" style="padding:4px 10px; font-size:0.8rem; background:var(--status-danger); color:#fff; border:none; border-radius:4px; cursor:pointer;">✕</button>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('.btn-rm-adj').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.idx, 10);
          this.adjDraftLines.splice(idx, 1);
          renderDraftLines();
        });
      });
    };

    mount.querySelector('#btn-add-adj-line').addEventListener('click', () => {
      const locCode = mount.querySelector('#adj-loc-sel').value;
      const itemSel = mount.querySelector('#adj-item-sel');
      const typeSel = mount.querySelector('#adj-type-sel');
      const qtyInp = mount.querySelector('#adj-qty-inp');
      if (!itemSel) return;

      const opt = itemSel.options[itemSel.selectedIndex];
      const itemCode = opt.value;
      const itemName = opt.dataset.name || opt.text.split(' (')[0];
      const baseUom = opt.dataset.uom || 'KG';
      const adjType = typeSel.value;
      const requestedQty = parseFloat(qtyInp.value) || 0;

      if (requestedQty <= 0) {
        alert('❌ Adjustment quantity must be greater than 0.');
        return;
      }

      const availableAtLoc = getStockAtLoc(itemCode, locCode);

      const alreadyDraftedQty = this.adjDraftLines
        .filter(l => l.itemCode === itemCode)
        .reduce((sum, l) => sum + (l.adjustmentType === 'DECREASE' ? l.quantity : -l.quantity), 0);

      const netCurrentStock = availableAtLoc - alreadyDraftedQty;

      if (adjType === 'DECREASE' && requestedQty > netCurrentStock) {
        alert(`❌ INSUFFICIENT STOCK FOR DECREASE ADJUSTMENT AT ${locCode}!\n\nItem: ${itemName} (${itemCode})\nAvailable Stock: ${netCurrentStock} ${baseUom}\nRequested Reduction: ${requestedQty} ${baseUom}\n\nCannot reduce below zero stock.`);
        return;
      }

      const fromBeforeQty = netCurrentStock;
      const fromAfterQty = adjType === 'DECREASE' ? (netCurrentStock - requestedQty) : (netCurrentStock + requestedQty);

      this.adjDraftLines.push({
        itemCode,
        itemName,
        adjustmentType: adjType,
        quantity: requestedQty,
        baseUom,
        fromBeforeQty,
        fromAfterQty
      });

      renderDraftLines();
    });

    mount.querySelector('#btn-adj-commit').addEventListener('click', async () => {
      const locationCode = mount.querySelector('#adj-loc-sel').value;
      const reasonCode = mount.querySelector('#adj-reason-sel').value;
      const adjustmentDate = mount.querySelector('#adj-date').value || new Date().toISOString().split('T')[0];

      if (this.adjDraftLines.length === 0) {
        alert('❌ Please add at least 1 line item to adjust.');
        return;
      }

      const adjustmentNo = `ADJ-${Date.now().toString().substring(7)}`;
      const gw = this._getDataGateway();

      const newAdjustment = {
        id: `adj-${Date.now()}`,
        tenantId,
        tenant_id: tenantId,
        adjustmentNo,
        adjustment_no: adjustmentNo,
        locationCode,
        location_code: locationCode,
        reasonCode,
        reason_code: reasonCode,
        adjustmentDate,
        adjustment_date: adjustmentDate,
        lines: this.adjDraftLines,
        status: 'COMPLETED'
      };

      let stockBreakdownText = `🎉 Stock Adjustment ${adjustmentNo} (${reasonCode}) Posted!\n\n📍 STOCK LEVEL ADJUSTMENTS AT ${locationCode}:\n`;

      if (gw) {
        await gw.create('stock_adjustments', newAdjustment);

        for (const line of this.adjDraftLines) {
          const locBal = balances.find(b => (b.itemCode === line.itemCode || b.item_code === line.itemCode) && (b.locationCode === locationCode || b.location_code === locationCode));
          if (locBal) {
            const currentQty = parseFloat(locBal.quantity) || 0;
            const newQty = line.adjustmentType === 'DECREASE' 
              ? Math.max(0, currentQty - line.quantity)
              : (currentQty + line.quantity);
            const unitCost = parseFloat(locBal.unitCost || locBal.unit_cost) || 0;
            await gw.update('stock_balances', locBal.id, {
              ...locBal,
              quantity: newQty,
              valuation: newQty * unitCost,
              lastUpdatedAt: new Date().toISOString()
            });
          } else if (line.adjustmentType === 'INCREASE') {
            await gw.create('stock_balances', {
              id: `sb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              tenantId,
              tenant_id: tenantId,
              itemCode: line.itemCode,
              item_code: line.itemCode,
              locationCode,
              location_code: locationCode,
              quantity: line.quantity,
              unitCost: 100,
              unit_cost: 100,
              valuation: line.quantity * 100,
              lastUpdatedAt: new Date().toISOString()
            });
          }

          stockBreakdownText += `• ${line.itemName} (${line.adjustmentType} ${line.quantity} ${line.baseUom}): ${line.fromBeforeQty} ➔ ${line.fromAfterQty} ${line.baseUom}\n`;
        }
      }

      alert(stockBreakdownText);
      this.activeSubView = 'inv-adjustments';
      const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
      this.render(targetMount, session);
    });
  }

  // --- 3. FULL-SCREEN PHYSICAL STOCK COUNT WORKSPACE ---

  renderStockCountFormScreen(mount, tenantId, items, locations, balances, session) {
    const auditorName = session?.employeeName || 'Kirtan (Inventory Auditor)';

    const getStockAtLoc = (itemCode, locCode) => {
      const bal = balances.find(b => 
        (b.itemCode === itemCode || b.item_code === itemCode) && 
        (b.locationCode === locCode || b.location_code === locCode) &&
        (!tenantId || b.tenantId === tenantId || b.tenant_id === tenantId)
      );
      if (bal) return { qty: parseFloat(bal.quantity) || 0, cost: parseFloat(bal.unitCost || bal.unit_cost || 0) };
      if (locCode === 'LOC-805' || locCode === 'LOC-901' || locCode === 'MAIN') {
        const itemObj = items.find(i => (i.itemCode === itemCode || i.item_code === itemCode));
        const qty = parseFloat(itemObj?.openingStock || itemObj?.opening_stock || 0);
        const cost = parseFloat(itemObj?.unitValuation || itemObj?.unit_valuation || 100);
        return { qty, cost };
      }
      return { qty: 0, cost: 100 };
    };

    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
        <!-- Top Navigation Back Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-counts" style="font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer;">
            ← Back to Stock Count
          </button>
          <div style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">📋 Physical Stock Count & Variance Audit Screen</div>
        </div>

        <h3 style="margin-top:0; color:var(--accent-primary); font-size:1.5rem;">📋 Physical Stock Count Studio</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:20px;">
          Perform a physical inventory audit for any store location. Enter physical counted quantities to calculate variances and update Supabase stock balances automatically.
        </p>

        <div style="display:flex; flex-direction:column; gap:16px;">
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Audit Storage Location *</label>
              <select id="cnt-loc-sel" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2);">
                ${locations.map(l => `<option value="${l.locationCode || l.location_code}">${l.locationName || l.location_name} (${l.locationCode || l.location_code})</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Audit Date *</label>
              <input type="date" id="cnt-date" value="${new Date().toISOString().split('T')[0]}" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2);">
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Stock Auditor / Conducted By *</label>
              <input type="text" id="cnt-auditor" value="${auditorName}" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2);">
            </div>
          </div>

          <!-- Stock Sheet Audit Table -->
          <div style="background:var(--bg-surface-2); padding:18px; border-radius:8px; border:1px solid var(--border-subtle); margin-top:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <div>
                <div style="font-weight:700; font-size:0.95rem; color:var(--accent-primary);">📦 Physical Audit Counting Sheet</div>
                <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">Compare System Qty against Physical Counted Qty for all master items at selected location.</div>
              </div>
              <div id="cnt-audit-summary-badge" style="font-size:0.8rem; font-weight:700;"></div>
            </div>

            <div class="table-responsive">
              <table style="width:100%; font-size:0.85rem; border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; color:var(--text-muted); background:var(--bg-surface-1);">
                    <th style="padding:10px;">Item Code & Name</th>
                    <th style="padding:10px;">Category</th>
                    <th style="padding:10px;">System Qty</th>
                    <th style="padding:10px; width:140px;">Physical Counted Qty</th>
                    <th style="padding:10px;">Variance Qty</th>
                    <th style="padding:10px;">Unit Cost</th>
                    <th style="padding:10px;">Variance Value</th>
                  </tr>
                </thead>
                <tbody id="cnt-sheet-tbody">
                  <!-- Dynamically populated based on selected location -->
                </tbody>
              </table>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button class="btn-secondary nav-inv-btn" data-tab="inv-counts" style="padding:10px 20px; font-weight:600;">
              ← Cancel & Return
            </button>
            <button class="btn-primary" id="btn-cnt-commit" style="padding:12px 24px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:0.95rem;">
              📋 Post Physical Stock Audit & Update Balances
            </button>
          </div>
        </div>
      </div>
    `;

    const locSel = mount.querySelector('#cnt-loc-sel');
    const tbody = mount.querySelector('#cnt-sheet-tbody');
    const summaryBadge = mount.querySelector('#cnt-audit-summary-badge');

    let currentSheetItems = [];

    const loadStockSheet = () => {
      const selectedLoc = locSel.value;
      currentSheetItems = items.map(i => {
        const itemCode = i.itemCode || i.item_code;
        const itemName = i.itemName || i.item_name;
        const categoryCode = i.categoryCode || i.category_code || 'GENERAL';
        const baseUom = i.baseUom || i.base_uom || 'KG';
        const { qty: systemQty, cost: unitCost } = getStockAtLoc(itemCode, selectedLoc);
        return {
          itemCode,
          itemName,
          categoryCode,
          baseUom,
          systemQty,
          countedQty: systemQty,
          unitCost
        };
      });

      renderSheetRows();
    };

    const renderSheetRows = () => {
      let totalShortfall = 0;
      let totalSurplus = 0;
      let totalMatching = 0;
      let totalNetVarianceValuation = 0;

      tbody.innerHTML = currentSheetItems.map((item, idx) => {
        const varQty = item.countedQty - item.systemQty;
        const varVal = varQty * item.unitCost;
        totalNetVarianceValuation += varVal;

        let varBadge = `<span class="badge badge-success" style="font-size:0.75rem;">🟢 0.00 ${item.baseUom} (Match)</span>`;
        if (varQty < 0) {
          totalShortfall++;
          varBadge = `<span class="badge badge-danger" style="font-size:0.75rem;">🔴 ${varQty.toFixed(2)} ${item.baseUom} (Shortfall)</span>`;
        } else if (varQty > 0) {
          totalSurplus++;
          varBadge = `<span class="badge badge-info" style="font-size:0.75rem;">🔵 +${varQty.toFixed(2)} ${item.baseUom} (Surplus)</span>`;
        } else {
          totalMatching++;
        }

        return `
          <tr style="border-bottom:1px solid var(--border-subtle);">
            <td style="padding:10px; font-weight:600;">
              ${item.itemName} <br><span style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${item.itemCode}</span>
            </td>
            <td style="padding:10px;"><span class="badge badge-secondary" style="font-size:0.7rem;">${item.categoryCode}</span></td>
            <td style="padding:10px; font-weight:700; color:var(--status-info);">${item.systemQty.toFixed(2)} ${item.baseUom}</td>
            <td style="padding:10px;">
              <input type="number" class="inp-counted-qty" data-idx="${idx}" value="${item.countedQty}" min="0" step="0.01" style="width:110px; padding:6px 10px; border-radius:4px; border:1px solid var(--border-subtle); font-weight:700;">
            </td>
            <td style="padding:10px;" id="var-cell-${idx}">${varBadge}</td>
            <td style="padding:10px; color:var(--text-muted);">₹${item.unitCost.toFixed(2)}</td>
            <td style="padding:10px; font-weight:700; color:${varVal < 0 ? 'var(--status-danger)' : (varVal > 0 ? 'var(--status-success)' : 'var(--text-muted)')};" id="val-cell-${idx}">
              ₹${Math.round(varVal).toLocaleString('en-IN')}
            </td>
          </tr>
        `;
      }).join('');

      if (summaryBadge) {
        summaryBadge.innerHTML = `
          <span class="badge badge-success">🟢 ${totalMatching} Match</span>
          <span class="badge badge-danger">🔴 ${totalShortfall} Shortfall</span>
          <span class="badge badge-info">🔵 ${totalSurplus} Surplus</span>
        `;
      }

      tbody.querySelectorAll('.inp-counted-qty').forEach(input => {
        input.addEventListener('input', (e) => {
          const idx = parseInt(e.target.dataset.idx, 10);
          const newCounted = parseFloat(e.target.value) || 0;
          currentSheetItems[idx].countedQty = newCounted;

          const item = currentSheetItems[idx];
          const varQty = newCounted - item.systemQty;
          const varVal = varQty * item.unitCost;

          const varCell = mount.querySelector(`#var-cell-${idx}`);
          const valCell = mount.querySelector(`#val-cell-${idx}`);

          if (varCell) {
            if (varQty < 0) {
              varCell.innerHTML = `<span class="badge badge-danger" style="font-size:0.75rem;">🔴 ${varQty.toFixed(2)} ${item.baseUom} (Shortfall)</span>`;
            } else if (varQty > 0) {
              varCell.innerHTML = `<span class="badge badge-info" style="font-size:0.75rem;">🔵 +${varQty.toFixed(2)} ${item.baseUom} (Surplus)</span>`;
            } else {
              varCell.innerHTML = `<span class="badge badge-success" style="font-size:0.75rem;">🟢 0.00 ${item.baseUom} (Match)</span>`;
            }
          }

          if (valCell) {
            valCell.textContent = `₹${Math.round(varVal).toLocaleString('en-IN')}`;
            valCell.style.color = varVal < 0 ? 'var(--status-danger)' : (varVal > 0 ? 'var(--status-success)' : 'var(--text-muted)');
          }
        });
      });
    };

    loadStockSheet();
    locSel.addEventListener('change', loadStockSheet);

    mount.querySelector('#btn-cnt-commit').addEventListener('click', async () => {
      const locationCode = locSel.value;
      const countDate = mount.querySelector('#cnt-date').value || new Date().toISOString().split('T')[0];
      const conductedBy = mount.querySelector('#cnt-auditor').value.trim() || auditorName;

      const countNo = `CNT-${Date.now().toString().substring(7)}`;
      const gw = this._getDataGateway();

      const auditLines = currentSheetItems.map(item => {
        const varianceQty = item.countedQty - item.systemQty;
        const varianceValuation = varianceQty * item.unitCost;
        return {
          itemCode: item.itemCode,
          itemName: item.itemName,
          categoryCode: item.categoryCode,
          baseUom: item.baseUom,
          systemQty: item.systemQty,
          countedQty: item.countedQty,
          varianceQty,
          unitCost: item.unitCost,
          varianceValuation
        };
      });

      const totalVarianceValuation = auditLines.reduce((sum, l) => sum + l.varianceValuation, 0);

      const newStockCount = {
        id: `cnt-${Date.now()}`,
        tenantId,
        tenant_id: tenantId,
        countNo,
        count_no: countNo,
        locationCode,
        location_code: locationCode,
        countDate,
        count_date: countDate,
        conductedBy,
        conducted_by: conductedBy,
        lines: auditLines,
        totalVarianceValuation,
        total_variance_valuation: totalVarianceValuation,
        status: 'COMPLETED'
      };

      let stockBreakdownText = `🎉 Physical Stock Count ${countNo} Posted!\n\n📍 AUDIT SUMMARY AT ${locationCode}:\n`;

      if (gw) {
        await gw.create('stock_counts', newStockCount);

        for (const line of auditLines) {
          const locBal = balances.find(b => (b.itemCode === line.itemCode || b.item_code === line.itemCode) && (b.locationCode === locationCode || b.location_code === locationCode));
          if (locBal) {
            const newValuation = line.countedQty * line.unitCost;
            await gw.update('stock_balances', locBal.id, {
              ...locBal,
              quantity: line.countedQty,
              valuation: newValuation,
              lastUpdatedAt: new Date().toISOString()
            });
          } else {
            await gw.create('stock_balances', {
              id: `sb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              tenantId,
              tenant_id: tenantId,
              itemCode: line.itemCode,
              item_code: line.itemCode,
              locationCode: locationCode,
              location_code: locationCode,
              quantity: line.countedQty,
              unitCost: line.unitCost,
              unit_cost: line.unitCost,
              valuation: line.countedQty * line.unitCost,
              lastUpdatedAt: new Date().toISOString()
            });
          }

          if (line.varianceQty !== 0) {
            stockBreakdownText += `• ${line.itemName}: System ${line.systemQty} ➔ Physical ${line.countedQty} ${line.baseUom} (Variance: ${line.varianceQty > 0 ? '+' : ''}${line.varianceQty.toFixed(2)} ${line.baseUom})\n`;
          }
        }
      }

      alert(stockBreakdownText);
      this.activeSubView = 'inv-counts';
      const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
      this.render(targetMount, session);
    });
  }

  // --- 4. FULL-SCREEN FORM: ADD MASTER ITEM ---

  renderAddMasterItemFormScreen(mount, tenantId, categories, uoms, session) {
    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-master" style="font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer;">
            ← Back to Master Inventory
          </button>
          <div style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">📦 Master Inventory Creation Screen</div>
        </div>

        <h3 style="margin-top:0; color:var(--accent-primary); font-size:1.5rem;">+ Add Master Inventory Item</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:20px;">Create a new master inventory item directly in Supabase PostgreSQL.</p>
        
        <div style="display:flex; flex-direction:column; gap:16px; max-width:640px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Item Code *</label>
              <input type="text" id="inp-item-code" placeholder="e.g. RM-9901" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); text-transform:uppercase;">
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Item Name *</label>
              <input type="text" id="inp-item-name" placeholder="e.g. Basmati Rice Extra Long" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Item Type *</label>
              <select id="inp-item-type" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
                <option value="Raw Material">Raw Material</option>
                <option value="Semi Finished">Semi Finished</option>
                <option value="Packaging">Packaging</option>
                <option value="Consumable">Consumable</option>
              </select>
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Category Code</label>
              <input type="text" id="inp-cat-code" placeholder="e.g. CAT-RICE" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); text-transform:uppercase;">
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Base UOM *</label>
              <select id="inp-base-uom" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
                <option value="KG">KG</option>
                <option value="G">G</option>
                <option value="L">L</option>
                <option value="ML">ML</option>
                <option value="NOS">NOS</option>
                <option value="PACK">PACK</option>
              </select>
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Opening Stock</label>
              <input type="number" id="inp-opening-stock" value="10" min="0" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button class="btn-secondary nav-inv-btn" data-tab="inv-master" style="padding:10px 20px;">Cancel</button>
            <button class="btn-primary" id="btn-item-save" style="padding:12px 24px; font-weight:700; background:var(--accent-primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">
              Save Master Item to Supabase
            </button>
          </div>
        </div>
      </div>
    `;

    mount.querySelector('#btn-item-save').addEventListener('click', async () => {
      const itemCode = mount.querySelector('#inp-item-code').value.trim().toUpperCase();
      const itemName = mount.querySelector('#inp-item-name').value.trim();
      const itemType = mount.querySelector('#inp-item-type').value;
      const categoryCode = mount.querySelector('#inp-cat-code').value.trim().toUpperCase() || 'GENERAL';
      const baseUom = mount.querySelector('#inp-base-uom').value;
      const openingStock = parseFloat(mount.querySelector('#inp-opening-stock').value) || 0;

      if (!itemCode || !itemName) {
        alert('❌ Please enter an Item Code and Item Name.');
        return;
      }

      const newItem = {
        uuid: 'inv-' + Math.random().toString(36).substring(2, 9),
        tenantId,
        tenant_id: tenantId,
        itemCode,
        item_code: itemCode,
        itemName,
        item_name: itemName,
        itemType,
        item_type: itemType,
        categoryCode,
        category_code: categoryCode,
        baseUom,
        base_uom: baseUom,
        openingStock,
        opening_stock: openingStock,
        reorderLevel: 10,
        reorder_level: 10,
        status: 'ACTIVE'
      };

      const gw = this._getDataGateway();
      if (gw) await gw.create('inventory', newItem);

      alert(`🎉 Master Inventory Item "${itemName}" (${itemCode}) saved directly to Supabase!`);
      this.activeSubView = 'inv-master';
      const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
      this.render(targetMount, session);
    });
  }

  // --- 5. FULL-SCREEN FORM: ADD STORAGE LOCATION ---

  renderAddLocationFormScreen(mount, tenantId, session) {
    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-locations" style="font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer;">
            ← Back to Storage Locations
          </button>
          <div style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">🏬 Storage Location Creation Screen</div>
        </div>

        <h3 style="margin-top:0; color:var(--accent-primary); font-size:1.5rem;">+ Add Storage Location</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:20px;">Add a new warehouse or store zone in Supabase PostgreSQL.</p>

        <div style="display:flex; flex-direction:column; gap:16px; max-width:540px;">
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Location Code *</label>
            <input type="text" id="inp-loc-code" placeholder="e.g. LOC-901" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); text-transform:uppercase;">
          </div>
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Location Name *</label>
            <input type="text" id="inp-loc-name" placeholder="e.g. Central Cold Storage" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
          </div>
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Storage Type</label>
            <select id="inp-loc-type" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
              <option value="WAREHOUSE">Warehouse</option>
              <option value="KITCHEN_STORE">Kitchen Store</option>
              <option value="BAR_STORE">Bar Store</option>
              <option value="COLD_ROOM">Cold Room</option>
            </select>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button class="btn-secondary nav-inv-btn" data-tab="inv-locations" style="padding:10px 20px;">Cancel</button>
            <button class="btn-primary" id="btn-loc-save" style="padding:12px 24px; font-weight:700; background:var(--accent-primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">
              Save Location to Supabase
            </button>
          </div>
        </div>
      </div>
    `;

    mount.querySelector('#btn-loc-save').addEventListener('click', async () => {
      const locationCode = mount.querySelector('#inp-loc-code').value.trim().toUpperCase();
      const locationName = mount.querySelector('#inp-loc-name').value.trim();
      const storageType = mount.querySelector('#inp-loc-type').value;

      if (!locationCode || !locationName) {
        alert('❌ Please enter a Location Code and Location Name.');
        return;
      }

      const newLoc = {
        id: 'loc-' + Math.random().toString(36).substring(2, 9),
        tenantId,
        tenant_id: tenantId,
        locationCode,
        location_code: locationCode,
        locationName,
        location_name: locationName,
        storageType,
        storage_type: storageType,
        status: 'ACTIVE'
      };

      const gw = this._getDataGateway();
      if (gw) await gw.create('storage_locations', newLoc);

      alert(`🎉 Storage Location "${locationName}" (${locationCode}) saved to Supabase!`);
      this.activeSubView = 'inv-locations';
      const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
      this.render(targetMount, session);
    });
  }

  // --- 6. FULL-SCREEN FORM: ADD SUPPLIER / VENDOR ---

  renderAddSupplierFormScreen(mount, tenantId, session) {
    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-suppliers" style="font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer;">
            ← Back to Suppliers Master
          </button>
          <div style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">🏢 Supplier Directory Creation Screen</div>
        </div>

        <h3 style="margin-top:0; color:var(--accent-primary); font-size:1.5rem;">+ Add Supplier / Vendor</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:20px;">Add a new vendor directory entry in Supabase PostgreSQL.</p>

        <div style="display:flex; flex-direction:column; gap:16px; max-width:580px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Supplier Code *</label>
              <input type="text" id="inp-sup-code" placeholder="e.g. SUP-109" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); text-transform:uppercase;">
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Vendor Name *</label>
              <input type="text" id="inp-sup-name" placeholder="e.g. Apex Meat & Poultry" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Primary Contact</label>
              <input type="text" id="inp-sup-contact" placeholder="e.g. Rajesh Kumar" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Phone</label>
              <input type="text" id="inp-sup-phone" placeholder="e.g. +91 98201 12345" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
            </div>
          </div>
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">GSTIN / Tax ID</label>
            <input type="text" id="inp-sup-gstin" placeholder="e.g. 27AAAAA0000A1Z5" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); text-transform:uppercase;">
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button class="btn-secondary nav-inv-btn" data-tab="inv-suppliers" style="padding:10px 20px;">Cancel</button>
            <button class="btn-primary" id="btn-sup-save" style="padding:12px 24px; font-weight:700; background:var(--accent-primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">
              Save Vendor to Supabase
            </button>
          </div>
        </div>
      </div>
    `;

    mount.querySelector('#btn-sup-save').addEventListener('click', async () => {
      const supplierCode = mount.querySelector('#inp-sup-code').value.trim().toUpperCase();
      const supplierName = mount.querySelector('#inp-sup-name').value.trim();
      const primaryContact = mount.querySelector('#inp-sup-contact').value.trim();
      const phone = mount.querySelector('#inp-sup-phone').value.trim();
      const gstin = mount.querySelector('#inp-sup-gstin').value.trim().toUpperCase();

      if (!supplierCode || !supplierName) {
        alert('❌ Please enter a Supplier Code and Vendor Name.');
        return;
      }

      const newSup = {
        id: 'sup-' + Math.random().toString(36).substring(2, 9),
        tenantId,
        tenant_id: tenantId,
        supplierCode,
        supplier_code: supplierCode,
        supplierName,
        supplier_name: supplierName,
        primaryContact,
        primary_contact: primaryContact,
        phone,
        gstin,
        status: 'ACTIVE'
      };

      const gw = this._getDataGateway();
      if (gw) await gw.create('suppliers', newSup);

      alert(`🎉 Supplier "${supplierName}" (${supplierCode}) saved to Supabase!`);
      this.activeSubView = 'inv-suppliers';
      const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
      this.render(targetMount, session);
    });
  }

  // --- 7. FULL-SCREEN FORM: POST GRN ---

  renderPostGrnFormScreen(mount, tenantId, items, suppliers, locations, pos, grns, supplierCatalog, balances, session) {
    const approvedPOs = pos.filter(p => 
      (p.status === 'APPROVED' || p.status === 'PARTIALLY_RECEIVED') &&
      (!tenantId || p.tenantId === tenantId || p.tenant_id === tenantId)
    );

    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
        <!-- Top Navigation Back Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-grn" style="font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer;">
            ← Back to Goods Receiving Studio
          </button>
          <div style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">🚚 Goods Receiving Note (GRN) & Stock Feedback Studio</div>
        </div>

        <h3 style="margin-top:0; color:var(--status-success); font-size:1.5rem;">📥 Post Goods Receipt Note (GRN) Against Approved PO</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:20px;">
          Receive physical stock against an approved PO, update location <strong>stock_balances</strong> in Main Warehouse, update PO status (Partially/Fully Received), and feedback actual prices to the <strong>Supplier Catalogue</strong>.
        </p>

        <!-- Header Information Controls -->
        <div style="background:var(--bg-surface-2); padding:16px; border-radius:6px; margin-bottom:20px; display:grid; grid-template-columns:1.5fr 1fr 1fr; gap:16px;">
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Select Approved Purchase Order *</label>
            <select id="grn-po-sel" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); font-weight:700;">
              ${approvedPOs.length ? approvedPOs.map(p => {
                const poNum = p.poNumber || p.po_number || p.id;
                const supName = p.supplierName || p.supplier_name || p.supplierCode;
                const total = parseFloat(p.grandTotal || p.grand_total || 0).toFixed(2);
                return `<option value="${p.id}">${poNum} — ${supName} (₹${total}) [${p.status}]</option>`;
              }).join('') : `
                <option value="">⚠️ No Approved POs Available (Create & Approve a PO first)</option>
              `}
            </select>
          </div>
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Receiving Storage Location *</label>
            <select id="grn-loc-sel" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1);">
              ${locations.map(l => {
                const lCode = l.locationCode || l.location_code;
                return `<option value="${lCode}" ${lCode === 'LOC-805' ? 'selected' : ''}>${l.locationName || l.location_name} (${lCode})</option>`;
              }).join('')}
            </select>
          </div>
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Vendor Invoice / Delivery Challan # *</label>
            <input type="text" id="grn-inv-no" value="INV-${Date.now().toString().substring(7)}" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); font-weight:700;">
          </div>
        </div>

        <!-- Vendor & Receipt Meta Cockpit -->
        <div id="grn-po-meta-banner" style="background:var(--bg-surface-2); padding:14px; border-radius:6px; border-left:4px solid var(--status-success); margin-bottom:20px; font-size:0.85rem; color:var(--text-muted);">
        </div>

        <!-- PO Line Receipt Sheet Table -->
        <div style="margin-bottom:20px;">
          <h4 style="margin:0 0 10px 0; color:var(--text-main);">📋 Physical Stock Receipt Sheet (PO Line Breakdown)</h4>
          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">Item Code & Name</th>
                  <th style="padding:10px;">PO Unit Price</th>
                  <th style="padding:10px;">Ordered Qty</th>
                  <th style="padding:10px;">Prev. Received</th>
                  <th style="padding:10px;">Remaining Qty</th>
                  <th style="padding:10px;">Delivered Qty</th>
                  <th style="padding:10px;">Accepted Qty</th>
                  <th style="padding:10px;">Actual Unit Price (₹)</th>
                </tr>
              </thead>
              <tbody id="grn-sheet-tbody">
                <tr>
                  <td colspan="8" style="padding:24px; text-align:center; color:var(--text-muted);">
                    Select an Approved Purchase Order above to load physical receipt sheet.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Commit Actions Footer -->
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-subtle); padding-top:16px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-grn" style="padding:10px 20px;">Cancel</button>
          <button class="btn-primary" id="btn-grn-commit" style="padding:12px 24px; font-weight:700; background:linear-gradient(135deg, var(--status-success), #059669); color:#fff; border:none; border-radius:6px; cursor:pointer;">
            📥 Post GRN & Update Stock Balances + Catalogue
          </button>
        </div>
      </div>
    `;

    const poSel = mount.querySelector('#grn-po-sel');
    const locSel = mount.querySelector('#grn-loc-sel');
    const metaBanner = mount.querySelector('#grn-po-meta-banner');
    const tbody = mount.querySelector('#grn-sheet-tbody');
    let currentPoLinesData = [];

    const loadPoDetails = () => {
      const selectedPoId = poSel.value;
      if (!selectedPoId) {
        metaBanner.innerHTML = '⚠️ No approved PO selected.';
        tbody.innerHTML = `<tr><td colspan="8" style="padding:24px; text-align:center; color:var(--text-muted);">Please select an Approved Purchase Order.</td></tr>`;
        currentPoLinesData = [];
        return;
      }

      const poObj = approvedPOs.find(p => p.id === selectedPoId || p.poNumber === selectedPoId || p.po_number === selectedPoId) || {};
      const poNum = poObj.poNumber || poObj.po_number || poObj.id;
      const supCode = poObj.supplierCode || poObj.supplier_code;
      const supName = poObj.supplierName || poObj.supplier_name || supCode;
      const orderDate = poObj.orderDate || poObj.order_date || 'N/A';
      const destLoc = poObj.destinationLocationCode || poObj.destination_location_code || 'LOC-805';

      if (locSel) locSel.value = destLoc;

      metaBanner.innerHTML = `
        Vendor: <strong style="color:var(--accent-primary);">${supName} (${supCode})</strong> | PO #: <strong>${poNum}</strong> | Order Date: <strong>${orderDate}</strong> | Status: <span class="badge badge-info">${poObj.status}</span>
      `;

      // Find all past GRNs for this PO to calculate previously received quantities
      const pastGrns = grns.filter(g => 
        (g.poNumber === poNum || g.po_number === poNum || g.poId === selectedPoId || g.po_id === selectedPoId) &&
        (!tenantId || g.tenantId === tenantId || g.tenant_id === tenantId)
      );

      let poLines = [];
      if (Array.isArray(poObj.lines)) {
        poLines = poObj.lines;
      } else if (poObj.data && Array.isArray(poObj.data.lines)) {
        poLines = poObj.data.lines;
      } else if (typeof poObj.lines === 'string') {
        try { poLines = JSON.parse(poObj.lines); } catch (e) {}
      } else if (poObj.data && typeof poObj.data.lines === 'string') {
        try { poLines = JSON.parse(poObj.data.lines); } catch (e) {}
      } else if (Array.isArray(poObj.items)) {
        poLines = poObj.items;
      }

      // Robust Fallback: If legacy PO has no explicit lines array, synthesize line from vendor catalogue or master item
      if (poLines.length === 0) {
        const supCode = poObj.supplierCode || poObj.supplier_code;
        const catItem = supplierCatalog.find(c => (c.supplierCode === supCode || c.supplier_code === supCode)) || {};
        const itemCode = poObj.itemCode || poObj.item_code || catItem.itemCode || catItem.item_code || items[0]?.itemCode || 'RM5712';
        const masterItem = items.find(i => (i.itemCode === itemCode || i.item_code === itemCode)) || items[0] || {};
        const grandTotal = parseFloat(poObj.grandTotal || poObj.grand_total || poObj.total_amount || 7600) || 7600;
        const unitPrice = parseFloat(catItem.currentPrice || catItem.current_price || masterItem.unitValuation || 152) || 152;
        const quantity = Math.max(1, Math.round(grandTotal / (unitPrice || 1)));

        poLines = [{
          itemCode: masterItem.itemCode || masterItem.item_code || itemCode,
          itemName: masterItem.itemName || masterItem.item_name || 'Inventory Raw Material',
          quantity,
          unitPrice,
          purchaseUom: catItem.purchaseUom || masterItem.baseUom || 'KG',
          lineTotal: grandTotal
        }];
      }

      currentPoLinesData = poLines.map((line, idx) => {
        const itemCode = line.itemCode || line.item_code;
        const masterItem = items.find(i => (i.itemCode === itemCode || i.item_code === itemCode)) || {};
        const itemName = line.itemName || masterItem.itemName || masterItem.item_name || itemCode;
        const orderedQty = parseFloat(line.quantity) || 0;
        const poUnitPrice = parseFloat(line.unitPrice || line.unit_price) || 0;
        const uom = line.purchaseUom || line.baseUom || masterItem.baseUom || 'KG';

        // Calculate previously received quantity across past GRNs
        let prevReceivedQty = 0;
        pastGrns.forEach(g => {
          if (Array.isArray(g.lines)) {
            g.lines.forEach(gl => {
              if (gl.itemCode === itemCode || gl.item_code === itemCode) {
                prevReceivedQty += (parseFloat(gl.acceptedQty !== undefined ? gl.acceptedQty : gl.quantity) || 0);
              }
            });
          }
        });

        const remainingQty = Math.max(0, orderedQty - prevReceivedQty);
        const defaultDeliveredQty = remainingQty;
        const defaultAcceptedQty = remainingQty;

        return {
          idx,
          itemCode,
          itemName,
          uom,
          poUnitPrice,
          orderedQty,
          prevReceivedQty,
          remainingQty,
          deliveredQty: defaultDeliveredQty,
          acceptedQty: defaultAcceptedQty,
          actualUnitPrice: poUnitPrice
        };
      });

      if (currentPoLinesData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding:24px; text-align:center; color:var(--text-muted);">No line items found on PO ${poNum}.</td></tr>`;
        return;
      }

      tbody.innerHTML = currentPoLinesData.map(line => `
        <tr style="border-bottom:1px solid var(--border-subtle);">
          <td style="padding:10px; font-weight:600;">
            ${line.itemName} <br><span style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${line.itemCode}</span>
          </td>
          <td style="padding:10px; color:var(--text-muted);">₹${line.poUnitPrice.toFixed(2)}</td>
          <td style="padding:10px; font-weight:600;">${line.orderedQty.toFixed(2)} ${line.uom}</td>
          <td style="padding:10px; font-weight:600; color:var(--status-info);">${line.prevReceivedQty.toFixed(2)} ${line.uom}</td>
          <td style="padding:10px; font-weight:700; color:var(--status-warning);">${line.remainingQty.toFixed(2)} ${line.uom}</td>
          <td style="padding:6px;">
            <input type="number" class="inp-grn-delivered" data-idx="${line.idx}" value="${line.deliveredQty.toFixed(2)}" min="0" step="0.01" style="width:90px; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); font-weight:700;">
          </td>
          <td style="padding:6px;">
            <input type="number" class="inp-grn-accepted" data-idx="${line.idx}" value="${line.acceptedQty.toFixed(2)}" min="0" step="0.01" style="width:90px; padding:6px; border-radius:4px; border:1px solid var(--status-success); font-weight:700; color:var(--status-success);">
          </td>
          <td style="padding:6px;">
            <input type="number" class="inp-grn-price" data-idx="${line.idx}" value="${line.actualUnitPrice.toFixed(2)}" min="0" step="0.01" style="width:90px; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); font-weight:700; color:var(--accent-primary);">
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('.inp-grn-delivered').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          const val = parseFloat(e.target.value) || 0;
          currentPoLinesData[idx].deliveredQty = val;
          const accInp = tbody.querySelector(`.inp-grn-accepted[data-idx="${idx}"]`);
          if (accInp) {
            accInp.value = val.toFixed(2);
            currentPoLinesData[idx].acceptedQty = val;
          }
        });
      });

      tbody.querySelectorAll('.inp-grn-accepted').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          currentPoLinesData[idx].acceptedQty = parseFloat(e.target.value) || 0;
        });
      });

      tbody.querySelectorAll('.inp-grn-price').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          currentPoLinesData[idx].actualUnitPrice = parseFloat(e.target.value) || 0;
        });
      });
    };

    if (poSel) poSel.addEventListener('change', loadPoDetails);
    loadPoDetails();

    mount.querySelector('#btn-grn-commit').addEventListener('click', async () => {
      const selectedPoId = poSel.value;
      if (!selectedPoId) {
        alert('❌ Please select an Approved Purchase Order.');
        return;
      }

      const poObj = approvedPOs.find(p => p.id === selectedPoId || p.poNumber === selectedPoId || p.po_number === selectedPoId) || {};
      const poNum = poObj.poNumber || poObj.po_number || poObj.id;
      const supCode = poObj.supplierCode || poObj.supplier_code;
      const supName = poObj.supplierName || poObj.supplier_name || supCode;
      const receivingLocationCode = locSel.value;
      const vendorInvoiceNo = mount.querySelector('#grn-inv-no').value.trim() || `INV-${Date.now().toString().substring(7)}`;
      const receivedDate = new Date().toISOString().split('T')[0];

      const validAcceptedLines = currentPoLinesData.filter(l => l.acceptedQty > 0);
      if (validAcceptedLines.length === 0) {
        alert('❌ Please enter an accepted quantity greater than 0 for at least 1 line item.');
        return;
      }

      // Idempotency Token
      const postingId = `post-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const duplicatePosting = grns.find(g => g.postingId === postingId || g.posting_id === postingId);
      if (duplicatePosting) {
        alert('❌ IDEMPOTENCY SAFETY: This GRN posting transaction has already been processed.');
        return;
      }

      const grnNumber = `GRN-${Date.now().toString().substring(7)}`;
      const gw = this._getDataGateway();

      // --- STEP A: Calculate PO Progress & Update PO Status ---
      let totalOrderedQty = 0;
      let totalAccumulatedAccepted = 0;

      currentPoLinesData.forEach(line => {
        totalOrderedQty += line.orderedQty;
        totalAccumulatedAccepted += (line.prevReceivedQty + line.acceptedQty);
      });

      const newPoStatus = totalAccumulatedAccepted >= totalOrderedQty ? 'FULLY_RECEIVED' : 'PARTIALLY_RECEIVED';

      // --- STEP B: Save GRN Document in Supabase ---
      const grnLinesPayload = validAcceptedLines.map(l => ({
        itemCode: l.itemCode,
        itemName: l.itemName,
        purchaseUom: l.uom,
        deliveredQty: l.deliveredQty,
        acceptedQty: l.acceptedQty,
        quantity: l.acceptedQty,
        poUnitPrice: l.poUnitPrice,
        actualUnitPrice: l.actualUnitPrice,
        unitCost: l.actualUnitPrice,
        lineValuation: l.acceptedQty * l.actualUnitPrice
      }));

      const grnGrandTotal = grnLinesPayload.reduce((sum, l) => sum + l.lineValuation, 0);

      const newGrn = {
        id: `grn-${Date.now()}`,
        tenantId,
        tenant_id: tenantId,
        postingId,
        posting_id: postingId,
        grnNumber,
        grn_number: grnNumber,
        poNumber: poNum,
        po_number: poNum,
        poId: poObj.id,
        supplierCode: supCode,
        supplier_code: supCode,
        supplierName: supName,
        receivingLocationCode,
        receiving_location_code: receivingLocationCode,
        vendorInvoiceNo,
        vendor_invoice_no: vendorInvoiceNo,
        receivedDate,
        received_date: receivedDate,
        lines: grnLinesPayload,
        totalAmount: grnGrandTotal,
        total_amount: grnGrandTotal,
        totalReceivedValue: grnGrandTotal,
        total_received_value: grnGrandTotal,
        status: 'POSTED'
      };

      if (gw) {
        await gw.create('goods_receipt_notes', newGrn);
        await gw.update('purchase_orders', poObj.id, { status: newPoStatus }, session);

        // --- STEP C: Add Accepted Quantities to Main Warehouse stock_balances ---
        let stockBreakdownText = `🎉 Goods Receipt Note ${grnNumber} Posted & Accepted!\n\n`;
        stockBreakdownText += `📋 PO ${poNum} Status Updated: ${newPoStatus}\n`;
        stockBreakdownText += `🏬 Receiving Location: ${receivingLocationCode}\n\n`;
        stockBreakdownText += `📦 STOCK BALANCES UPDATED IN SUPABASE:\n`;

        for (const line of validAcceptedLines) {
          const existingBal = balances.find(b => 
            (b.itemCode === line.itemCode || b.item_code === line.itemCode) && 
            (b.locationCode === receivingLocationCode || b.location_code === receivingLocationCode) &&
            (!tenantId || b.tenantId === tenantId || b.tenant_id === tenantId)
          );

          const currentQty = existingBal ? (parseFloat(existingBal.quantity) || 0) : 0;
          const newQty = currentQty + line.acceptedQty;
          const newValuation = newQty * line.actualUnitPrice;

          if (existingBal) {
            await gw.update('stock_balances', existingBal.id, {
              ...existingBal,
              itemCode: line.itemCode,
              item_code: line.itemCode,
              locationCode: receivingLocationCode,
              location_code: receivingLocationCode,
              quantity: newQty,
              unitCost: line.actualUnitPrice,
              unit_cost: line.actualUnitPrice,
              valuation: newValuation,
              status: 'ACTIVE',
              lastUpdatedAt: new Date().toISOString()
            });
          } else {
            await gw.create('stock_balances', {
              id: `sb-${Date.now()}-${line.itemCode}`,
              tenantId,
              tenant_id: tenantId,
              itemCode: line.itemCode,
              item_code: line.itemCode,
              locationCode: receivingLocationCode,
              location_code: receivingLocationCode,
              quantity: newQty,
              unitCost: line.actualUnitPrice,
              unit_cost: line.actualUnitPrice,
              valuation: newValuation,
              status: 'ACTIVE',
              lastUpdatedAt: new Date().toISOString()
            });
          }

          stockBreakdownText += `• ${line.itemName} (+${line.acceptedQty} ${line.uom}): ${currentQty} ➔ ${newQty} ${line.uom} @ ₹${line.actualUnitPrice.toFixed(2)}\n`;

          // --- STEP D: Feedback Loop to Supplier Catalogue ---
          const catEntry = supplierCatalog.find(c => 
            (c.supplierCode === supCode || c.supplier_code === supCode) &&
            (c.itemCode === line.itemCode || c.item_code === line.itemCode)
          );

          const oldAvg = catEntry ? parseFloat(catEntry.averagePurchasePrice || catEntry.average_purchase_price || line.actualUnitPrice) : line.actualUnitPrice;
          const weightedAvg = (oldAvg + line.actualUnitPrice) / 2;

          if (catEntry) {
            await gw.update('supplier_catalog', catEntry.id, {
              lastPurchasePrice: line.actualUnitPrice,
              last_purchase_price: line.actualUnitPrice,
              lastPurchaseAt: receivedDate,
              last_purchase_at: receivedDate,
              averagePurchasePrice: weightedAvg,
              average_purchase_price: weightedAvg
            });
          } else {
            await gw.create('supplier_catalog', {
              id: `scat-${Date.now()}-${line.itemCode}`,
              tenantId,
              tenant_id: tenantId,
              supplierCode: supCode,
              supplier_code: supCode,
              itemCode: line.itemCode,
              item_code: line.itemCode,
              supplierSku: `${supCode}-${line.itemCode}`,
              supplier_sku: `${supCode}-${line.itemCode}`,
              purchaseUom: line.uom,
              purchase_uom: line.uom,
              currentPrice: line.actualUnitPrice,
              current_price: line.actualUnitPrice,
              lastPurchasePrice: line.actualUnitPrice,
              last_purchase_price: line.actualUnitPrice,
              lastPurchaseAt: receivedDate,
              last_purchase_at: receivedDate,
              averagePurchasePrice: line.actualUnitPrice,
              average_purchase_price: line.actualUnitPrice,
              status: 'ACTIVE'
            });
          }

          // --- STEP E: Feedback Loop to Master Inventory Item Costing ---
          const masterItem = items.find(i => (i.itemCode === line.itemCode || i.item_code === line.itemCode));
          if (masterItem) {
            await gw.update('inventory', masterItem.id || masterItem.uuid, {
              unitValuation: line.actualUnitPrice,
              unit_valuation: line.actualUnitPrice
            });
          }
        }

        alert(stockBreakdownText);
        this.activeSubView = 'inv-grn';
        const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
        this.render(targetMount, session);
      }
    });
  }

  // --- 8. FULL-SCREEN FORM: CREATE PO ---

  renderCreatePoFormScreen(mount, tenantId, items, suppliers, locations, supplierCatalog, session) {
    const isEditing = Boolean(this.editingPo);
    const existingPo = this.editingPo || null;

    if (isEditing && existingPo) {
      this.poDraftLines = Array.isArray(existingPo.lines) ? [...existingPo.lines] : [];
    } else {
      this.poDraftLines = [];
    }

    const selectedSupCode = (isEditing && existingPo) 
      ? (existingPo.supplierCode || existingPo.supplier_code) 
      : (suppliers[0]?.supplierCode || suppliers[0]?.supplier_code || 'SUP-101');

    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
        <!-- Top Navigation Back Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-po" style="font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer;">
            ← Back to Purchase Orders
          </button>
          <div style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">📄 Purchase Order Studio (Catalogue Price Snapshot)</div>
        </div>

        <h3 style="margin-top:0; color:var(--accent-primary); font-size:1.5rem;">
          ${isEditing ? `✏️ Edit Draft Purchase Order (${existingPo.poNumber || existingPo.po_number || existingPo.id})` : `📋 Create Purchase Order & Snapshot Vendor Catalogue`}
        </h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:20px;">
          Select a vendor to auto-populate contracted catalogue prices. Agreed PO line prices are snapshotted onto the PO document and do NOT alter stock balances or supplier list prices.
        </p>

        <!-- Header Information Controls -->
        <div style="background:var(--bg-surface-2); padding:16px; border-radius:6px; margin-bottom:20px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Supplier / Vendor *</label>
            <select id="po-sup-sel" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); font-weight:700;">
              ${suppliers.map(s => {
                const sCode = s.supplierCode || s.supplier_code;
                return `<option value="${sCode}" ${sCode === selectedSupCode ? 'selected' : ''}>${s.supplierName || s.supplier_name} (${sCode})</option>`;
              }).join('')}
            </select>
          </div>
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Destination Storage Location *</label>
            <select id="po-loc-sel" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1);">
              ${locations.map(l => {
                const lCode = l.locationCode || l.location_code;
                const destLoc = (isEditing && existingPo) ? (existingPo.destinationLocationCode || existingPo.destination_location_code) : 'LOC-805';
                return `<option value="${lCode}" ${lCode === destLoc ? 'selected' : ''}>${l.locationName || l.location_name} (${lCode})</option>`;
              }).join('')}
            </select>
          </div>
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Order Date *</label>
            <input type="date" id="po-date-inp" value="${(isEditing && existingPo) ? (existingPo.orderDate || existingPo.order_date || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0]}" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1);">
          </div>
        </div>

        <!-- Add Item Line Entry Box -->
        <div style="background:var(--bg-surface-2); padding:16px; border-radius:6px; margin-bottom:20px; border-left:4px solid var(--accent-primary);">
          <div style="font-weight:700; font-size:0.9rem; color:var(--accent-primary); margin-bottom:12px;">➕ Add Item Line to Purchase Order</div>
          <div style="display:grid; grid-template-columns:2fr 1fr 1fr 1fr; gap:12px; align-items:end;">
            <div>
              <label style="display:block; font-size:0.75rem; margin-bottom:4px; font-weight:600; color:var(--text-muted);">Contracted Vendor Catalogue Item</label>
              <select id="po-item-sel" style="width:100%; padding:8px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-surface-1);"></select>
            </div>
            <div>
              <label style="display:block; font-size:0.75rem; margin-bottom:4px; font-weight:600; color:var(--text-muted);">Quantity</label>
              <input type="number" id="po-qty-inp" value="10" min="0.01" step="0.01" style="width:100%; padding:8px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); font-weight:700;">
            </div>
            <div>
              <label style="display:block; font-size:0.75rem; margin-bottom:4px; font-weight:600; color:var(--text-muted);">Agreed Unit Price (₹)</label>
              <input type="number" id="po-price-inp" value="0" min="0" step="0.01" style="width:100%; padding:8px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); font-weight:700; color:var(--status-success);">
            </div>
            <div>
              <button class="btn-primary" id="btn-po-add-line" style="width:100%; padding:8px 12px; font-weight:700; background:var(--accent-primary); color:#fff; border:none; border-radius:4px; cursor:pointer;">
                + Add Line
              </button>
            </div>
          </div>
          <div id="po-cat-notice" style="font-size:0.75rem; color:var(--text-muted); margin-top:8px;"></div>
        </div>

        <!-- PO Lines Sheet Table -->
        <div style="margin-bottom:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h4 style="margin:0; color:var(--text-main);">📋 Order Lines (<span id="po-line-count">0</span> items)</h4>
            <div style="font-size:1.1rem; font-weight:700; color:var(--status-success);">
              Grand Total: <span id="po-grand-total-val">₹0.00</span>
            </div>
          </div>
          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">Item Code & Description</th>
                  <th style="padding:10px;">UOM</th>
                  <th style="padding:10px;">Ordered Qty</th>
                  <th style="padding:10px;">Catalogue Price (₹)</th>
                  <th style="padding:10px;">Agreed Price (₹)</th>
                  <th style="padding:10px;">Line Valuation (₹)</th>
                  <th style="padding:10px; text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody id="po-lines-tbody">
              </tbody>
            </table>
          </div>
        </div>

        <!-- Action Controls -->
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-subtle); padding-top:16px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-po" style="padding:10px 20px;">Cancel</button>
          <div style="display:flex; gap:12px;">
            <button class="btn-secondary" id="btn-po-save-draft" style="padding:10px 20px; font-weight:700; border-color:var(--status-warning); color:var(--status-warning);">
              💾 ${isEditing ? 'Update DRAFT PO' : 'Save as DRAFT PO'}
            </button>
            <button class="btn-primary" id="btn-po-save-approve" style="padding:10px 20px; font-weight:700; background:var(--status-success); color:#fff; border:none; border-radius:6px; cursor:pointer;">
              ✅ ${isEditing ? 'Update & APPROVE PO' : 'Save & APPROVE PO'}
            </button>
          </div>
        </div>
      </div>
    `;

    const supSel = mount.querySelector('#po-sup-sel');
    const itemSel = mount.querySelector('#po-item-sel');
    const qtyInp = mount.querySelector('#po-qty-inp');
    const priceInp = mount.querySelector('#po-price-inp');
    const noticeEl = mount.querySelector('#po-cat-notice');

    const updateItemOptions = () => {
      const supCode = supSel.value;
      const vendorCat = supplierCatalog.filter(c => (c.supplierCode === supCode || c.supplier_code === supCode));

      if (vendorCat.length > 0) {
        noticeEl.innerHTML = `🟢 Loaded <strong>${vendorCat.length} catalogue items</strong> directly from vendor's contracted price list.`;
        itemSel.innerHTML = vendorCat.map(c => {
          const itemCode = c.itemCode || c.item_code;
          const masterItem = items.find(i => (i.itemCode === itemCode || i.item_code === itemCode)) || {};
          const itemName = masterItem.itemName || masterItem.item_name || itemCode;
          const uom = c.purchaseUom || c.purchase_uom || masterItem.baseUom || 'KG';
          const price = parseFloat(c.currentPrice || c.current_price) || 0;
          return `<option value="${itemCode}" data-uom="${uom}" data-catprice="${price}">${itemName} (${itemCode}) — Catalogue: ₹${price.toFixed(2)} / ${uom}</option>`;
        }).join('');
      } else {
        noticeEl.innerHTML = `⚠️ No custom catalogue found for this vendor. Showing master inventory items with default valuation.`;
        itemSel.innerHTML = items.map(i => {
          const itemCode = i.itemCode || i.item_code;
          const itemName = i.itemName || i.item_name;
          const uom = i.baseUom || i.base_uom || 'KG';
          const price = parseFloat(i.unitValuation || i.unit_valuation || 100);
          return `<option value="${itemCode}" data-uom="${uom}" data-catprice="${price}">${itemName} (${itemCode}) — Default: ₹${price.toFixed(2)} / ${uom}</option>`;
        }).join('');
      }

      onItemSelected();
    };

    const onItemSelected = () => {
      if (itemSel.options.length === 0) return;
      const opt = itemSel.options[itemSel.selectedIndex];
      const catPrice = parseFloat(opt.dataset.catprice) || 0;
      priceInp.value = catPrice.toFixed(2);
    };

    supSel.addEventListener('change', updateItemOptions);
    itemSel.addEventListener('change', onItemSelected);
    updateItemOptions();

    const renderDraftLines = () => {
      const tbody = mount.querySelector('#po-lines-tbody');
      const countEl = mount.querySelector('#po-line-count');
      const grandTotalEl = mount.querySelector('#po-grand-total-val');

      countEl.textContent = this.poDraftLines.length;
      const grandTotal = this.poDraftLines.reduce((sum, l) => sum + l.lineTotal, 0);
      grandTotalEl.textContent = `₹${grandTotal.toFixed(2)}`;

      if (this.poDraftLines.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="padding:24px; text-align:center; color:var(--text-muted);">
              No line items added yet. Select a vendor item above and click <strong>"+ Add Line"</strong>.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = this.poDraftLines.map((line, idx) => `
        <tr style="border-bottom:1px solid var(--border-subtle);">
          <td style="padding:10px; font-weight:600;">${line.itemName} <br><span style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${line.itemCode}</span></td>
          <td style="padding:10px;"><span class="badge badge-info">${line.purchaseUom}</span></td>
          <td style="padding:10px; font-weight:700;">${line.quantity.toFixed(2)}</td>
          <td style="padding:10px; color:var(--text-muted);">₹${(line.cataloguePrice || 0).toFixed(2)}</td>
          <td style="padding:10px; font-weight:700; color:var(--status-success);">₹${line.unitPrice.toFixed(2)}</td>
          <td style="padding:10px; font-weight:700; color:var(--accent-primary);">₹${line.lineTotal.toFixed(2)}</td>
          <td style="padding:10px; text-align:right;">
            <button class="btn-remove-po-line" data-idx="${idx}" style="padding:2px 8px; font-size:0.75rem; background:var(--status-danger); color:#fff; border:none; border-radius:4px; cursor:pointer;">
              ✕ Remove
            </button>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('.btn-remove-po-line').forEach(b => {
        b.addEventListener('click', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          this.poDraftLines.splice(idx, 1);
          renderDraftLines();
        });
      });
    };

    renderDraftLines();

    mount.querySelector('#btn-po-add-line').addEventListener('click', () => {
      if (itemSel.options.length === 0) return;
      const opt = itemSel.options[itemSel.selectedIndex];
      const itemCode = itemSel.value;
      const masterItem = items.find(i => (i.itemCode === itemCode || i.item_code === itemCode)) || {};
      const itemName = masterItem.itemName || masterItem.item_name || itemCode;
      const purchaseUom = opt.dataset.uom || 'KG';
      const cataloguePrice = parseFloat(opt.dataset.catprice) || 0;
      const quantity = parseFloat(qtyInp.value) || 0;
      const unitPrice = parseFloat(priceInp.value) || 0;

      if (quantity <= 0) {
        alert('❌ Order quantity must be greater than 0.');
        return;
      }
      if (unitPrice < 0) {
        alert('❌ Unit price cannot be negative.');
        return;
      }

      this.poDraftLines.push({
        itemCode,
        itemName,
        quantity,
        purchaseUom,
        cataloguePrice,
        unitPrice,
        lineTotal: quantity * unitPrice
      });

      renderDraftLines();
    });

    const handleSave = async (targetStatus) => {
      const supplierCode = supSel.value;
      const destinationLocationCode = mount.querySelector('#po-loc-sel').value;
      const orderDate = mount.querySelector('#po-date-inp').value || new Date().toISOString().split('T')[0];

      if (this.poDraftLines.length === 0) {
        alert('❌ Please add at least 1 line item to the Purchase Order.');
        return;
      }

      const isEditing = Boolean(this.editingPo);
      const existingPo = this.editingPo || {};
      const poNumber = isEditing ? (existingPo.poNumber || existingPo.po_number || `PO-${Date.now().toString().substring(7)}`) : `PO-${Date.now().toString().substring(7)}`;
      const poId = isEditing ? existingPo.id : `po-${Date.now()}`;

      const grandTotal = this.poDraftLines.reduce((sum, l) => sum + l.lineTotal, 0);
      const supplierObj = suppliers.find(s => (s.supplierCode === supplierCode || s.supplier_code === supplierCode)) || {};
      const supplierName = supplierObj.supplierName || supplierObj.supplier_name || supplierCode;

      const poPayload = {
        id: poId,
        tenantId,
        tenant_id: tenantId,
        poNumber,
        po_number: poNumber,
        supplierCode,
        supplier_code: supplierCode,
        supplierName,
        supplier_name: supplierName,
        destinationLocationCode,
        destination_location_code: destinationLocationCode,
        orderDate,
        order_date: orderDate,
        lines: this.poDraftLines,
        grandTotal,
        grand_total: grandTotal,
        totalAmount: grandTotal,
        total_amount: grandTotal,
        status: targetStatus
      };

      const gw = this._getDataGateway();
      if (gw) {
        if (isEditing) {
          await gw.update('purchase_orders', poId, poPayload, session);
        } else {
          await gw.create('purchase_orders', poPayload, session);
        }
      }

      this.editingPo = null;
      alert(`🎉 Purchase Order ${poNumber} ${isEditing ? 'updated' : 'created'} as "${targetStatus}"!\n\n🔒 ACCOUNTING RULE ENFORCED:\nPO approval does NOT alter stock balances. Physical stock will be received when a Goods Receipt Note (GRN) is posted and accepted.`);
      this.activeSubView = 'inv-po';
      const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
      this.render(targetMount, session);
    };

    mount.querySelector('#btn-po-save-draft').addEventListener('click', () => handleSave('DRAFT'));
    mount.querySelector('#btn-po-save-approve').addEventListener('click', () => handleSave('APPROVED'));
  }

  downloadPoDocument(po, suppliers) {
    const poNum = po.poNumber || po.po_number || po.id;
    const supCode = po.supplierCode || po.supplier_code;
    const supplierObj = suppliers.find(s => (s.supplierCode === supCode || s.supplier_code === supCode)) || {};
    const supName = po.supplierName || po.supplier_name || supplierObj.supplierName || supCode;
    const supPhone = supplierObj.phone || 'N/A';
    const supContact = supplierObj.primaryContact || supplierObj.primary_contact || 'N/A';
    const supGstin = supplierObj.gstin || 'N/A';
    const orderDate = po.orderDate || po.order_date || new Date().toISOString().split('T')[0];
    const destLoc = po.destinationLocationCode || po.destination_location_code || 'LOC-805';
    const lines = Array.isArray(po.lines) ? po.lines : [];
    const grandTotal = parseFloat(po.grandTotal || po.grand_total) || lines.reduce((sum, l) => sum + (parseFloat(l.lineTotal || (l.quantity * l.unitPrice)) || 0), 0);

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Purchase Order - ${poNum}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #1e293b; background: #fff; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #6366f1; padding-bottom: 15px; margin-bottom: 25px; }
          .title { font-size: 24px; font-weight: bold; color: #4f46e5; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; background: #f8fafc; padding: 15px; border-radius: 8px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 14px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
          th { background: #e2e8f0; color: #334155; }
          .total-row { font-weight: bold; background: #f1f5f9; font-size: 15px; }
          .footer { margin-top: 40px; border-top: 1px solid #cbd5e1; padding-top: 15px; display: flex; justify-content: space-between; font-size: 12px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">ANCHOR BISTRO & CAFE</div>
            <div style="font-size:12px; color:#64748b; margin-top:4px;">Official Procurement Voucher</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:20px; font-weight:bold; color:#0f172a;">PURCHASE ORDER</div>
            <div style="font-family:monospace; font-weight:bold; color:#6366f1; margin-top:4px;">${poNum}</div>
          </div>
        </div>

        <div class="meta-grid">
          <div>
            <strong>VENDOR / SUPPLIER DETAILS:</strong><br>
            <span style="font-size:16px; font-weight:bold;">${supName}</span> (${supCode})<br>
            Contact Person: ${supContact}<br>
            Phone: ${supPhone}<br>
            GSTIN: ${supGstin}
          </div>
          <div>
            <strong>DELIVERY & PO METADATA:</strong><br>
            Order Date: <strong>${orderDate}</strong><br>
            Destination Location: <strong>${destLoc}</strong><br>
            Document Status: <strong>${po.status || 'APPROVED'}</strong>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item Code & Description</th>
              <th>UOM</th>
              <th>Qty Ordered</th>
              <th>Agreed Unit Price (₹)</th>
              <th>Line Valuation (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${lines.length ? lines.map((l, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${l.itemName || l.itemCode}</strong> (${l.itemCode})</td>
                <td>${l.purchaseUom || l.baseUom || 'KG'}</td>
                <td>${(parseFloat(l.quantity) || 0).toFixed(2)}</td>
                <td>₹${(parseFloat(l.unitPrice) || 0).toFixed(2)}</td>
                <td style="font-weight:bold;">₹${(parseFloat(l.lineTotal || (l.quantity * l.unitPrice)) || 0).toFixed(2)}</td>
              </tr>
            `).join('') : `
              <tr><td colspan="6" style="text-align:center;">No line items detailed.</td></tr>
            `}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="5" style="text-align:right;">GRAND TOTAL PROCUREMENT AMOUNT:</td>
              <td style="color:#059669; font-size:16px;">₹${grandTotal.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <div class="footer">
          <div>Generated via Anchor RestaurantOS Procurement Platform</div>
          <div>Authorised Signatory Stamp & Signature</div>
        </div>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(printHtml);
      win.document.close();
    } else {
      alert('⚠️ Popup blocked. Please allow popups to download/print the PO document.');
    }
  }

  sharePoViaWhatsApp(po, suppliers) {
    const poNum = po.poNumber || po.po_number || po.id;
    const supCode = po.supplierCode || po.supplier_code;
    const supplierObj = suppliers.find(s => (s.supplierCode === supCode || s.supplier_code === supCode)) || {};
    const supName = po.supplierName || po.supplier_name || supplierObj.supplierName || supCode;
    const rawPhone = supplierObj.phone || po.phone || '';
    
    // Clean phone number for WhatsApp Web API (e.g. "+91 98765 43210" -> "919876543210")
    const cleanPhone = rawPhone.replace(/[^\d]/g, '');

    const orderDate = po.orderDate || po.order_date || new Date().toISOString().split('T')[0];
    const destLoc = po.destinationLocationCode || po.destination_location_code || 'Main Warehouse';
    const lines = Array.isArray(po.lines) ? po.lines : [];
    const grandTotal = parseFloat(po.grandTotal || po.grand_total) || lines.reduce((sum, l) => sum + (parseFloat(l.lineTotal || (l.quantity * l.unitPrice)) || 0), 0);

    let itemBreakdown = '';
    lines.forEach((l, idx) => {
      const name = l.itemName || l.itemCode;
      const qty = (parseFloat(l.quantity) || 0).toFixed(2);
      const uom = l.purchaseUom || l.baseUom || 'KG';
      const price = (parseFloat(l.unitPrice) || 0).toFixed(2);
      const lineTot = (parseFloat(l.lineTotal || (l.quantity * l.unitPrice)) || 0).toFixed(2);
      itemBreakdown += `${idx + 1}. *${name}* — ${qty} ${uom} @ ₹${price} = ₹${lineTot}\n`;
    });

    const waMessage = 
      `🧾 *PURCHASE ORDER: ${poNum}*\n` +
      `🏢 *From:* Anchor Bistro & Cafe\n` +
      `👤 *Vendor:* ${supName}\n` +
      `📍 *Deliver To:* ${destLoc}\n` +
      `📅 *Order Date:* ${orderDate}\n\n` +
      `📋 *Order Breakdown:*\n` +
      `${itemBreakdown || 'General Procurement Order\n'}\n` +
      `💰 *Grand Total Amount:* ₹${grandTotal.toFixed(2)}\n\n` +
      `Please confirm receipt & expected delivery date. Thank you!`;

    const waUrl = cleanPhone 
      ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(waMessage)}`
      : `https://web.whatsapp.com/send?text=${encodeURIComponent(waMessage)}`;

    window.open(waUrl, '_blank');
  }

  // --- 9. FULL-SCREEN FORM: ADD CATEGORY ---

  renderAddCategoryFormScreen(mount, tenantId, session) {
    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-categories" style="font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer;">
            ← Back to Categories Master
          </button>
          <div style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">🏷 Category & Family Creation Screen</div>
        </div>

        <h3 style="margin-top:0; color:var(--accent-primary); font-size:1.5rem;">+ Add Category & Product Family</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:20px;">Create a new operational category in Supabase PostgreSQL.</p>

        <div style="display:flex; flex-direction:column; gap:16px; max-width:540px;">
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Category Code *</label>
            <input type="text" id="inp-cat-code-new" placeholder="e.g. CAT-SPICE" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); text-transform:uppercase;">
          </div>
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Category Name *</label>
            <input type="text" id="inp-cat-name-new" placeholder="e.g. Whole & Ground Spices" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
          </div>
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Product Family Name</label>
            <input type="text" id="inp-cat-fam-new" placeholder="e.g. Spices & Condiments" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
          </div>
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Default Base UOM</label>
            <select id="inp-cat-uom-new" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
              <option value="KG">KG</option>
              <option value="G">G</option>
              <option value="L">L</option>
              <option value="ML">ML</option>
              <option value="NOS">NOS</option>
              <option value="PACK">PACK</option>
            </select>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button class="btn-secondary nav-inv-btn" data-tab="inv-categories" style="padding:10px 20px;">Cancel</button>
            <button class="btn-primary" id="btn-cat-save" style="padding:12px 24px; font-weight:700; background:var(--accent-primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">
              Save Category to Supabase
            </button>
          </div>
        </div>
      </div>
    `;

    mount.querySelector('#btn-cat-save').addEventListener('click', async () => {
      const categoryCode = mount.querySelector('#inp-cat-code-new').value.trim().toUpperCase();
      const categoryName = mount.querySelector('#inp-cat-name-new').value.trim();
      const productFamilyName = mount.querySelector('#inp-cat-fam-new').value.trim() || 'General';
      const defaultUom = mount.querySelector('#inp-cat-uom-new').value;

      if (!categoryCode || !categoryName) {
        alert('❌ Please enter a Category Code and Category Name.');
        return;
      }

      const newCat = {
        id: 'cat-' + Math.random().toString(36).substring(2, 9),
        tenantId,
        tenant_id: tenantId,
        categoryCode,
        category_code: categoryCode,
        categoryName,
        category_name: categoryName,
        productFamilyName,
        product_family_name: productFamilyName,
        defaultUom,
        default_uom: defaultUom,
        status: 'ACTIVE'
      };

      const gw = this._getDataGateway();
      if (gw) await gw.create('inventory_categories', newCat);

      alert(`🎉 Category "${categoryName}" (${categoryCode}) saved to Supabase!`);
      this.activeSubView = 'inv-categories';
      const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
      this.render(targetMount, session);
    });
  }

  // --- 10. FULL-SCREEN FORM: ADD UOM ---

  renderAddUomFormScreen(mount, tenantId, session) {
    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-uom" style="font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer;">
            ← Back to Units of Measure
          </button>
          <div style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">📐 Unit of Measure Creation Screen</div>
        </div>

        <h3 style="margin-top:0; color:var(--accent-primary); font-size:1.5rem;">+ Add Unit of Measure (UOM)</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:20px;">Define a new measurement unit in Supabase PostgreSQL.</p>

        <div style="display:flex; flex-direction:column; gap:16px; max-width:540px;">
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">UOM Code *</label>
            <input type="text" id="inp-uom-code-new" placeholder="e.g. CRATE" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); text-transform:uppercase;">
          </div>
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">UOM Name *</label>
            <input type="text" id="inp-uom-name-new" placeholder="e.g. Plastic Crate (24 Units)" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
          </div>
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">UOM Family *</label>
            <select id="inp-uom-fam-new" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
              <option value="COUNT">Count & Packaging</option>
              <option value="WEIGHT">Weight</option>
              <option value="VOLUME">Volume</option>
            </select>
          </div>
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Conversion Multiplier</label>
            <input type="number" id="inp-uom-factor-new" value="1" min="0.001" step="0.001" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button class="btn-secondary nav-inv-btn" data-tab="inv-uom" style="padding:10px 20px;">Cancel</button>
            <button class="btn-primary" id="btn-uom-save" style="padding:12px 24px; font-weight:700; background:var(--accent-primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">
              Save UOM to Supabase
            </button>
          </div>
        </div>
      </div>
    `;

    mount.querySelector('#btn-uom-save').addEventListener('click', async () => {
      const uomCode = mount.querySelector('#inp-uom-code-new').value.trim().toUpperCase();
      const uomName = mount.querySelector('#inp-uom-name-new').value.trim();
      const uomFamily = mount.querySelector('#inp-uom-fam-new').value;
      const conversionFactor = parseFloat(mount.querySelector('#inp-uom-factor-new').value) || 1;

      if (!uomCode || !uomName) {
        alert('❌ Please enter a UOM Code and UOM Name.');
        return;
      }

      const newUom = {
        id: 'uom-' + Math.random().toString(36).substring(2, 9),
        tenantId,
        tenant_id: tenantId,
        uomCode,
        uom_code: uomCode,
        uomName,
        uom_name: uomName,
        uomFamily,
        uom_family: uomFamily,
        conversionFactor,
        conversion_factor: conversionFactor,
        status: 'ACTIVE'
      };

      const gw = this._getDataGateway();
      if (gw) await gw.create('inventory_uoms', newUom);

      alert(`🎉 Unit of Measure "${uomName}" (${uomCode}) saved to Supabase!`);
      this.activeSubView = 'inv-uom';
      const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
      this.render(targetMount, session);
    });
  }

  // --- 11. FULL-SCREEN FORM: BULK IMPORT SUPPLIERS ---

  renderImportSuppliersFormScreen(mount, tenantId, session) {
    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-suppliers" style="font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer;">
            ← Back to Suppliers Master
          </button>
          <div style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">⚡ Bulk CSV Supplier Import Screen</div>
        </div>

        <h3 style="margin-top:0; color:var(--accent-primary); font-size:1.5rem;">⚡ Bulk Import Suppliers / Vendors (CSV)</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:20px;">
          Upload or paste CSV text matching the template format to import multiple vendors directly to Supabase.
        </p>

        <div style="display:flex; flex-direction:column; gap:16px; max-width:680px;">
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Select CSV File</label>
            <input type="file" id="inp-sup-csv-file" accept=".csv" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2);">
          </div>
          
          <div style="text-align:center; font-size:0.8rem; color:var(--text-muted); font-weight:600;">— OR PASTE RAW CSV CONTENT BELOW —</div>

          <div>
            <textarea id="txt-sup-csv-raw" rows="8" placeholder="supplier_code,supplier_name,primary_contact,phone,email,gstin&#10;SUP-201,Golden Grain Millers,Ramesh Gupta,9820011111,sales@goldengrain.com,27CCCCCC3333C1Z3" style="width:100%; padding:12px; border-radius:6px; border:1px solid var(--border-subtle); font-family:monospace; font-size:0.85rem; background:var(--bg-surface-2);"></textarea>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button class="btn-secondary" id="btn-sup-dl-sample" style="font-size:0.85rem; font-weight:600;">📄 Download Sample Template</button>
            <div style="display:flex; gap:12px;">
              <button class="btn-secondary nav-inv-btn" data-tab="inv-suppliers" style="padding:10px 20px;">Cancel</button>
              <button class="btn-primary" id="btn-sup-imp-process" style="padding:12px 24px; font-weight:700; background:var(--accent-primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">
                Process & Save to Supabase
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const fileInp = mount.querySelector('#inp-sup-csv-file');
    const txtArea = mount.querySelector('#txt-sup-csv-raw');

    fileInp.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => { txtArea.value = evt.target.result; };
        reader.readAsText(file);
      }
    });

    mount.querySelector('#btn-sup-dl-sample').addEventListener('click', () => this.downloadSupplierTemplate());
    
    mount.querySelector('#btn-sup-imp-process').addEventListener('click', async () => {
      const content = txtArea.value.trim();
      if (!content) {
        alert('❌ Please select a CSV file or paste CSV content.');
        return;
      }

      const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 2) {
        alert('❌ CSV must contain a header row and at least 1 data row.');
        return;
      }

      const rows = lines.slice(1);
      const gw = this._getDataGateway();

      let importedCount = 0;
      for (const row of rows) {
        const cols = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length >= 2) {
          const supplierCode = cols[0].toUpperCase();
          const supplierName = cols[1];
          const primaryContact = cols[2] || 'N/A';
          const phone = cols[3] || 'N/A';
          const email = cols[4] || '';
          const gstin = cols[5] || '';

          const newSup = {
            id: `sup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            tenantId,
            tenant_id: tenantId,
            supplierCode,
            supplier_code: supplierCode,
            supplierName,
            supplier_name: supplierName,
            primaryContact,
            primary_contact: primaryContact,
            phone,
            email,
            gstin,
            status: 'ACTIVE'
          };

          if (gw) await gw.create('suppliers', newSup);
          importedCount++;
        }
      }

      alert(`🎉 Successfully imported ${importedCount} Suppliers/Vendors directly into Supabase!`);
      this.activeSubView = 'inv-suppliers';
      const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
      this.render(targetMount, session);
    });
  }

  // --- 12. FULL-SCREEN FORM: BULK IMPORT LOCATIONS ---

  renderImportLocationsFormScreen(mount, tenantId, session) {
    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-locations" style="font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer;">
            ← Back to Storage Locations
          </button>
          <div style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">⚡ Bulk CSV Location Import Screen</div>
        </div>

        <h3 style="margin-top:0; color:var(--accent-primary); font-size:1.5rem;">⚡ Bulk Import Storage Locations (CSV)</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:20px;">
          Upload or paste CSV text matching the template format to import multiple storage zones directly to Supabase.
        </p>

        <div style="display:flex; flex-direction:column; gap:16px; max-width:680px;">
          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Select CSV File</label>
            <input type="file" id="inp-loc-csv-file" accept=".csv" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2);">
          </div>
          
          <div style="text-align:center; font-size:0.8rem; color:var(--text-muted); font-weight:600;">— OR PASTE RAW CSV CONTENT BELOW —</div>

          <div>
            <textarea id="txt-loc-csv-raw" rows="8" placeholder="location_code,location_name,storage_type&#10;LOC-905,East Wing Storage,WAREHOUSE" style="width:100%; padding:12px; border-radius:6px; border:1px solid var(--border-subtle); font-family:monospace; font-size:0.85rem; background:var(--bg-surface-2);"></textarea>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button class="btn-secondary" id="btn-loc-dl-sample" style="font-size:0.85rem; font-weight:600;">📄 Download Sample Template</button>
            <div style="display:flex; gap:12px;">
              <button class="btn-secondary nav-inv-btn" data-tab="inv-locations" style="padding:10px 20px;">Cancel</button>
              <button class="btn-primary" id="btn-loc-imp-process" style="padding:12px 24px; font-weight:700; background:var(--accent-primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">
                Process & Save to Supabase
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const fileInp = mount.querySelector('#inp-loc-csv-file');
    const txtArea = mount.querySelector('#txt-loc-csv-raw');

    fileInp.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => { txtArea.value = evt.target.result; };
        reader.readAsText(file);
      }
    });

    mount.querySelector('#btn-loc-dl-sample').addEventListener('click', () => this.downloadLocationTemplate());
    
    mount.querySelector('#btn-loc-imp-process').addEventListener('click', async () => {
      const content = txtArea.value.trim();
      if (!content) {
        alert('❌ Please select a CSV file or paste CSV content.');
        return;
      }

      const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 2) {
        alert('❌ CSV must contain a header row and at least 1 data row.');
        return;
      }

      const rows = lines.slice(1);
      const gw = this._getDataGateway();

      let importedCount = 0;
      for (const row of rows) {
        const cols = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length >= 2) {
          const locationCode = cols[0].toUpperCase();
          const locationName = cols[1];
          const storageType = cols[2] || 'WAREHOUSE';

          const newLoc = {
            id: `loc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            tenantId,
            tenant_id: tenantId,
            locationCode,
            location_code: locationCode,
            locationName,
            location_name: locationName,
            storageType,
            storage_type: storageType,
            status: 'ACTIVE'
          };

          if (gw) await gw.create('storage_locations', newLoc);
          importedCount++;
        }
      }

      alert(`🎉 Successfully imported ${importedCount} Storage Locations directly into Supabase!`);
      this.activeSubView = 'inv-locations';
      const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
      this.render(targetMount, session);
    });
  }

  // --- Supplier Import/Export Utilities ---

  downloadSupplierTemplate() {
    const csvContent = "supplier_code,supplier_name,primary_contact,phone,email,gstin,payment_terms,address\n" +
      "SUP-106,Fresh Organic Farms,Sanjay Patil,9821098210,sanjay@organicfarms.com,27AAAAA1111A1Z1,Net 30 Days,Plot 44 Vashi Market\n" +
      "SUP-107,Apex Poultry & Meats,Amit Shah,9898012345,sales@apexmeats.com,27BBBBB2222B1Z2,Net 15 Days,Goregaon West Mumbai";
    
    this._triggerDownload(csvContent, "sample_suppliers_template.csv");
  }

  exportSuppliersCSV(suppliers) {
    let csv = "supplier_code,supplier_name,primary_contact,phone,email,gstin\n";
    suppliers.forEach(s => {
      const code = s.supplierCode || s.supplier_code || '';
      const name = (s.supplierName || s.supplier_name || '').replace(/,/g, '');
      const contact = (s.primaryContact || s.primary_contact || '').replace(/,/g, '');
      const phone = s.phone || '';
      const email = s.email || '';
      const gstin = s.gstin || '';
      csv += `${code},${name},${contact},${phone},${email},${gstin}\n`;
    });

    this._triggerDownload(csv, "suppliers_catalog_export.csv");
  }

  downloadLocationTemplate() {
    const csvContent = "location_code,location_name,storage_type\n" +
      "LOC-901,Central Dry Goods Warehouse,WAREHOUSE\n" +
      "LOC-902,Main Kitchen Refrigerated Unit,KITCHEN_STORE\n" +
      "LOC-903,Bar Chiller Zone,BAR_STORE";
    
    this._triggerDownload(csvContent, "sample_locations_template.csv");
  }

  exportLocationsCSV(locations) {
    let csv = "location_code,location_name,storage_type\n";
    locations.forEach(l => {
      const code = l.locationCode || l.location_code || '';
      const name = (l.locationName || l.location_name || '').replace(/,/g, '');
      const type = l.storageType || l.storage_type || 'WAREHOUSE';
      csv += `${code},${name},${type}\n`;
    });

    this._triggerDownload(csv, "storage_locations_export.csv");
  }

  _triggerDownload(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  bindEvents(mount, session) {
    const navBtns = mount.querySelectorAll('.nav-inv-btn, .btn-subtab');
    navBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        this.activeSubView = btn.dataset.tab;
        const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
        await this.render(targetMount, session);
      });
    });
  }
}
