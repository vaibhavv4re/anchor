/**
 * InventoryWorkspaceView.js
 * Step 17.13D — 📦 Inventory Manager Workspace Composition Root
 *
 * 15 Canonical Navigation Views + In-App Form Screen Workspaces (NO MODALS):
 * - All creation/import flows open as full-screen views with a prominent "← Back" button.
 * - Sourced 100% live from Supabase PostgreSQL tables via DataGateway.
 */

import { inventoryImportController } from '../../../../../businessos/platform/inventory/inventoryImportController.js';
import { categoryImportController } from '../../../../../businessos/platform/inventory/categoryImportController.js';
import { supplierImportController } from '../../../../../businessos/platform/inventory/supplierImportController.js';
import { supplierCatalogueController } from '../../../../../businessos/platform/inventory/supplierCatalogueController.js';
import { inventoryItemModel } from '../../../../../businessos/platform/inventory/inventoryItemModel.js';
import { purchasingModel } from '../../../../../businessos/platform/inventory/purchasingModel.js';
import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';
import { CategoryRepository } from '../../../../../businessos/platform/repositories/categoryRepository.js';

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
      const localList = offlineStore.getCollection(name, tenantId) || offlineStore.getCollection(name) || [];

      if (gw && typeof gw.getCachedCollection === 'function') {
        const targetName = name === 'supplier_catalogue' ? 'supplier_catalog' : name;
        let cloudList = gw.getCachedCollection(targetName, tenantId);

        if ((!Array.isArray(cloudList) || cloudList.length === 0) && (name === 'goods_receipt_notes' || name === 'goods_received_notes')) {
          cloudList = gw.getCachedCollection('goods_receipt_notes', tenantId) || gw.getCachedCollection('goods_received_notes', tenantId);
        }

        if (Array.isArray(cloudList) && cloudList.length > 0) {
          const mergedMap = new Map();
          cloudList.forEach(item => {
            const key = item.id || item.grnNumber || item.grn_number || item.poNumber || item.po_number || item.itemCode || item.code;
            if (key) mergedMap.set(key, item);
          });
          localList.forEach(item => {
            const key = item.id || item.grnNumber || item.grn_number || item.poNumber || item.po_number || item.itemCode || item.code;
            if (key && !mergedMap.has(key)) mergedMap.set(key, item);
          });

          const merged = Array.from(mergedMap.values());
          offlineStore.setCollection(name, merged);
          if (name === 'goods_receipt_notes') offlineStore.setCollection('goods_received_notes', merged);
          if (name === 'supplier_catalogue') offlineStore.setCollection('supplier_catalog', merged);
          return merged;
        } else if (Array.isArray(localList) && localList.length > 0) {
          return localList;
        }
      }
    } catch (e) {
      console.warn(`[InventoryWorkspaceView] Error fetching collection "${name}":`, e);
    }
    
    let store = offlineStore.getCollection(name, tenantId) || offlineStore.getCollection(name) || [];
    if ((!Array.isArray(store) || store.length === 0) && (name === 'goods_receipt_notes' || name === 'goods_received_notes')) {
      store = offlineStore.getCollection('goods_received_notes', tenantId) || offlineStore.getCollection('goods_received_notes') || offlineStore.getCollection('goods_receipt_notes', tenantId) || offlineStore.getCollection('goods_receipt_notes') || [];
    }
    return store;
  }

  _getUnifiedCategories(tenantId) {
    let catList = this._getCollection('inventory_categories', tenantId) || [];
    if (!Array.isArray(catList) || catList.length === 0) {
      const repo = new CategoryRepository({ offlineStore });
      catList = repo.getDefaultCategories(tenantId);
    }

    const items = this._getCollection('inventory', tenantId) || [];
    const existingCodeMap = new Map();

    catList.forEach(c => {
      const code = (c.categoryCode || c.category_code || c.code || c.id || '').toUpperCase().trim();
      if (code) existingCodeMap.set(code, c);
    });

    items.forEach(item => {
      const cCode = (item.categoryCode || item.category_code || item.category || '').trim().toUpperCase();
      if (cCode && !existingCodeMap.has(cCode)) {
        const humanName = cCode.replace(/^CAT-/, '').replace(/[-_]/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        const newCat = {
          id: `cat-discovered-${cCode.toLowerCase()}`,
          tenantId,
          categoryCode: cCode,
          category_code: cCode,
          categoryName: humanName,
          category_name: humanName,
          productFamilyCode: this._inferProductFamilyCode(cCode),
          status: 'ACTIVE'
        };
        existingCodeMap.set(cCode, newCat);
        catList.push(newCat);
      }
    });

    return catList;
  }

  _inferProductFamilyCode(category) {
    if (!category) return 'FAM-PRODUCE';
    let storedPf = (typeof category === 'string' ? category : (category.productFamilyCode || category.product_family_code || category.productFamily || category.product_family || category.familyCode || category.family_code || category.family || '')).toUpperCase().trim();

    // Alias Normalization
    if (storedPf) {
      if (storedPf === 'PF-MEAT' || storedPf === 'FAM-MEAT') return 'FAM-MEAT';
      if (storedPf === 'PF-SEA' || storedPf === 'PF-SEAFOOD' || storedPf === 'FAM-SEAFOOD' || storedPf === 'FAM-SEA') return 'FAM-SEAFOOD';
      if (storedPf === 'PF-PROD' || storedPf === 'PF-PRODUCE' || storedPf === 'FAM-PRODUCE' || storedPf === 'FAM-PROD') return 'FAM-PRODUCE';
      if (storedPf === 'PF-DAIRY' || storedPf === 'FAM-DAIRY') return 'FAM-DAIRY';
      if (storedPf === 'PF-SPICE' || storedPf === 'PF-SPICES' || storedPf === 'FAM-SPICE' || storedPf === 'FAM-SPICES') return 'FAM-SPICES';
      if (storedPf === 'PF-GRAIN' || storedPf === 'PF-GRAINS' || storedPf === 'FAM-GRAIN' || storedPf === 'FAM-GRAINS') return 'FAM-GRAINS';
      if (storedPf === 'PF-CONDIMENTS' || storedPf === 'FAM-CONDIMENTS' || storedPf === 'FAM-OIL' || storedPf === 'FAM-OILS') return 'FAM-CONDIMENTS';
      if (storedPf === 'PF-BEV' || storedPf === 'PF-BEVERAGES' || storedPf === 'FAM-BEV' || storedPf === 'FAM-BEVERAGES') return 'FAM-BEVERAGES';
      if (storedPf === 'PF-BAR' || storedPf === 'PF-LIQUOR' || storedPf === 'FAM-BAR' || storedPf === 'FAM-LIQUOR') return 'FAM-LIQUOR';
      if (storedPf === 'PF-PACK' || storedPf === 'PF-SUPPLIES' || storedPf === 'FAM-PACK' || storedPf === 'FAM-SUPPLIES') return 'FAM-SUPPLIES';
      return storedPf;
    }

    const code = (category.categoryCode || category.category_code || category.code || category.id || '').toUpperCase().trim();
    const name = (category.categoryName || category.category_name || category.name || '').toUpperCase().trim();

    if (code.includes('MEAT') || code.includes('CHICKEN') || code.includes('MUTTON') || name.includes('MEAT') || name.includes('POULTRY')) return 'FAM-MEAT';
    if (code.includes('SEA') || code.includes('FISH') || code.includes('PRAWN') || name.includes('SEAFOOD') || name.includes('FISH')) return 'FAM-SEAFOOD';
    if (code.includes('VEG') || code.includes('PROD') || code.includes('FRUIT') || name.includes('PRODUCE') || name.includes('VEGETABLE') || name.includes('FRUIT')) return 'FAM-PRODUCE';
    if (code.includes('RICE') || code.includes('GRAIN') || code.includes('STAPLE') || code.includes('DAL') || name.includes('RICE') || name.includes('GRAIN') || name.includes('STAPLE') || name.includes('FLOUR')) return 'FAM-GRAINS';
    if (code.includes('OIL') || code.includes('CONDIMENT') || name.includes('OIL') || name.includes('CONDIMENT') || name.includes('SAUCE')) return 'FAM-CONDIMENTS';
    if (code.includes('DAIRY') || code.includes('MILK') || name.includes('DAIRY') || name.includes('MILK') || name.includes('FAT') || name.includes('BUTTER')) return 'FAM-DAIRY';
    if (code.includes('SPICE') || code.includes('HERB') || name.includes('SPICE') || name.includes('SEASONING')) return 'FAM-SPICES';
    if (code.includes('BEV') || name.includes('BEVERAGE') || name.includes('SOFT DRINK')) return 'FAM-BEVERAGES';
    if (code.includes('BAR') || code.includes('LIQUOR') || name.includes('BAR') || name.includes('SPIRIT') || name.includes('WINE') || name.includes('BEER')) return 'FAM-LIQUOR';
    if (code.includes('PACK') || name.includes('PACKAGING') || name.includes('SUPPLY')) return 'FAM-SUPPLIES';

    return 'FAM-PRODUCE';
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

      if (gw && typeof gw.getCollection === 'function') {
        await gw.getCollection('supplier_catalog', tenantId);
        await gw.getCollection('inventory', tenantId);
        await gw.getCollection('suppliers', tenantId);
        await gw.getCollection('inventory_categories', tenantId);
        await gw.getCollection('goods_receipt_notes', tenantId);
        await gw.getCollection('goods_received_notes', tenantId);
        await gw.getCollection('purchase_orders', tenantId);
      }

      const items = this._getCollection('inventory', tenantId);
      const suppliers = this._getCollection('suppliers', tenantId);
      const locations = this._getCollection('storage_locations', tenantId);
      const requests = this._getCollection('inventory_requests', tenantId);
      const balances = this._getCollection('stock_balances', tenantId);
      const categories = this._getUnifiedCategories(tenantId);
      const uoms = this._getCollection('inventory_uoms', tenantId);
      const history = this._getCollection('import_history', tenantId);
      const grns = this._getCollection('goods_receipt_notes', tenantId);
      const pos = this._getCollection('purchase_orders', tenantId);
      const stockIssues = this._getCollection('stock_issues', tenantId);
      const stockTransfers = this._getCollection('stock_transfers', tenantId);
      const stockAdjustments = this._getCollection('stock_adjustments', tenantId);
      const stockCounts = this._getCollection('stock_counts', tenantId);

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

              <div style="font-size:0.65rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin:12px 0 2px 4px;">STOCK OPERATIONS</div>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-opening-stock' ? 'active' : ''}" data-tab="inv-opening-stock" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">⚡ Opening Stock</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-live-stock' || activeTab === 'inv-live-balances' ? 'active' : ''}" data-tab="inv-live-stock" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">📦 Live Store Balances</button>
              <button class="btn-secondary" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; opacity:0.4; cursor:not-allowed;" title="Disabled by user directive" disabled>📤 Stock Issues (Disabled)</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-transfers' || activeTab === 'inv-transfers-create' ? 'active' : ''}" data-tab="inv-transfers" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">🔄 Stock Transfers (${stockTransfers.length})</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-adjustments' || activeTab === 'inv-adjustments-create' ? 'active' : ''}" data-tab="inv-adjustments" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">📊 Stock Adjustments (${stockAdjustments.length})</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-counts' || activeTab === 'inv-counts-create' ? 'active' : ''}" data-tab="inv-counts" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">📋 Stock Count (${stockCounts.length})</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-alerts' ? 'active' : ''}" data-tab="inv-alerts" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">⚠️ Low Stock Alerts ${lowStockItems.length > 0 ? `<span class="badge badge-danger" style="font-size:0.7rem; padding:1px 5px; margin-left:3px;">${lowStockItems.length}</span>` : ''}</button>

              <div style="font-size:0.65rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin:12px 0 2px 4px;">PROCUREMENT</div>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-supplier-catalogue' || activeTab === 'inv-catalogue' ? 'active' : ''}" data-tab="inv-supplier-catalogue" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">📦 Supplier Catalogue</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-po' || activeTab === 'inv-po-create' ? 'active' : ''}" data-tab="inv-po" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">📄 Purchase Orders (${pos.length})</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-grn' || activeTab === 'inv-grn-create' ? 'active' : ''}" data-tab="inv-grn" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">🚚 Goods Receiving Studio (${grns.length})</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-suppliers' || activeTab === 'suppliers' || activeTab === 'inv-suppliers-create' || activeTab === 'inv-suppliers-import' ? 'active' : ''}" data-tab="inv-suppliers" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">🏢 Suppliers Directory (${suppliers.length})</button>
              <button class="btn-secondary nav-inv-btn ${activeTab === 'inv-requests' ? 'active' : ''}" data-tab="inv-requests" style="text-align:left; font-size:0.85rem; padding:8px 10px; border-radius:4px; cursor:pointer;">📋 Purchase Requisitions ${requests.filter(r => r.status === 'PENDING').length > 0 ? `<span class="badge badge-warning" style="font-size:0.7rem; padding:1px 5px; margin-left:3px;">${requests.filter(r => r.status === 'PENDING').length}</span>` : ''}</button>
            </aside>

            <!-- Main Body Mount Area -->
            <main id="inventory-workspace-body" style="flex:1; padding:24px; background:var(--bg-surface-0); overflow-y:auto;"></main>
          </div>
        </div>
      `;

      const mainMount = targetMount.querySelector('#inventory-workspace-body');
      await this.mountInventoryTabContent(mainMount, activeTab, tenantId, items, categories, uoms, locations, suppliers, requests, history, balances, grns, pos, stockIssues, stockTransfers, stockAdjustments, stockCounts, session);
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

  async mountInventoryTabContent(mount, tabKey, tenantId, items, categories, uoms, locations, suppliers, requests, history, balances, grns, pos, stockIssues, stockTransfers, stockAdjustments, stockCounts, session) {
    if (!mount) return;

    // --- FORM VIEW SCREENS (FULL IN-APP VIEWS WITHOUT OVERLAY MODALS) ---

    if (tabKey === 'inv-transfers-create') {
      this.renderStockTransferFormScreen(mount, tenantId, items, locations, balances, session);
      return;
    }

    if (tabKey === 'inv-opening-stock') {
      this.renderOpeningStockFormScreen(mount, tenantId, items, locations, session);
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

    if (tabKey === 'inv-grn-create') {
      this.renderPostGrnFormScreen(mount, tenantId, items, suppliers, locations, session);
      return;
    }

    if (tabKey === 'inv-po-create') {
      this.renderCreatePoFormScreen(mount, tenantId, items, suppliers, locations, session);
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
                      <th style="padding:10px;">Purchase UOM</th>
                      <th style="padding:10px;">Reorder Level</th>
                      <th style="padding:10px;">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${items.slice(0, 10).map(i => {
                      const code = i.itemCode || i.item_code || i.sku || i.code || i.id || '';
                      const name = i.itemName || i.item_name || i.name || '';
                      const cat = i.categoryCode || i.category_code || i.category || 'GENERAL';
                      const base = i.baseUom || i.base_uom || i.baseUnit || 'KG';
                      const purch = i.purchaseUom || i.purchase_uom || i.purchaseUnit || base;
                      const reorder = Number(i.reorderLevel !== undefined ? i.reorderLevel : (i.reorder_level !== undefined ? i.reorder_level : 0));
                      return `
                        <tr style="border-bottom:1px solid var(--border-subtle);">
                          <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${code}</td>
                          <td style="padding:10px; font-weight:600;">${name}</td>
                          <td style="padding:10px;">${cat}</td>
                          <td style="padding:10px;"><span class="badge badge-info">${base}</span></td>
                          <td style="padding:10px;"><span class="badge badge-secondary">${purch}</span></td>
                          <td style="padding:10px; font-weight:700; color:var(--status-warning);">${reorder.toLocaleString()} ${base}</td>
                          <td style="padding:10px;"><span class="badge badge-success">ACTIVE</span></td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (tabKey === 'inv-categories') {
      const activeCatSubTab = this.categorySubTab || 'categories';
      const pfList = categoryImportController._getCollection('product_families', tenantId);
      const productFamilies = pfList.length > 0 ? pfList : categoryImportController.getDefaultProductFamilies();

      const mappedItemsCount = items.filter(i => i.categoryCode || i.category_code || i.category).length;
      const unclassifiedCount = items.filter(i => !i.categoryCode && !i.category_code && !i.category).length;

      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <!-- Header Title & Action Toolbar -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="font-size:1.4rem; margin:0; display:flex; align-items:center; gap:8px;">
                <span>🏷️</span> Categories & Product Families
              </h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                Inventory classification and product taxonomy
              </p>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              <button type="button" class="btn-primary" id="btn-add-category-action" style="padding:8px 14px; font-weight:700; background:var(--accent-primary); border-radius:6px; border:none; cursor:pointer; color:#fff;">
                ${activeCatSubTab === 'families' ? '+ Add Product Family' : '+ Add Category'}
              </button>
              <button type="button" class="btn-secondary" id="btn-cat-import" style="padding:8px 14px; font-weight:700; border-radius:6px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                ↑ Import Taxonomy
              </button>
              <button type="button" class="btn-secondary" id="btn-cat-export" style="padding:8px 14px; font-weight:700; border-radius:6px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                ↓ Export Taxonomy
              </button>
              <button type="button" class="btn-secondary" id="btn-cat-template" style="padding:8px 14px; font-weight:700; border-radius:6px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                ⬇ Template
              </button>
            </div>
          </div>

          <!-- Provenance & Metrics KPI Strip -->
          <div style="background:var(--bg-surface-2); padding:10px 16px; border-radius:6px; font-size:0.82rem; font-weight:600; color:var(--text-muted); margin-bottom:16px; display:flex; gap:16px; flex-wrap:wrap; align-items:center;">
            <span><strong style="color:var(--accent-primary);">${categories.length}</strong> Categories</span> •
            <span><strong style="color:var(--status-info);">${productFamilies.length}</strong> Product Families</span> •
            <span><strong style="color:var(--status-success);">${mappedItemsCount}</strong> Inventory Items Mapped</span> •
            <span><strong style="color:${unclassifiedCount > 0 ? 'var(--status-warning)' : 'var(--text-muted)'};">${unclassifiedCount}</strong> Unclassified Items</span>
          </div>

          <!-- Sub-Tab Navigation Bar -->
          <div style="display:flex; gap:8px; border-bottom:1px solid var(--border-subtle); margin-bottom:16px;">
            <button type="button" id="tab-sub-categories" style="padding:8px 16px; font-weight:700; font-size:0.85rem; border:none; background:none; cursor:pointer; border-bottom:2px solid ${activeCatSubTab === 'categories' ? 'var(--accent-primary)' : 'transparent'}; color:${activeCatSubTab === 'categories' ? 'var(--accent-primary)' : 'var(--text-muted)'};">
              Categories (${categories.length})
            </button>
            <button type="button" id="tab-sub-families" style="padding:8px 16px; font-weight:700; font-size:0.85rem; border:none; background:none; cursor:pointer; border-bottom:2px solid ${activeCatSubTab === 'families' ? 'var(--accent-primary)' : 'transparent'}; color:${activeCatSubTab === 'families' ? 'var(--accent-primary)' : 'var(--text-muted)'};">
              Product Families (${productFamilies.length})
            </button>
          </div>

          <!-- Sub-Tab Content View -->
          ${activeCatSubTab === 'categories' ? `
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
                    const catCode = c.categoryCode || c.category_code || c.code || c.id;
                    const catName = c.categoryName || c.category_name || c.name || catCode;
                    const pfCode = this._inferProductFamilyCode(c);
                    const pfObj = productFamilies.find(pf => (pf.code || pf.product_family_code) === pfCode);
                    const famName = pfObj ? (pfObj.name || pfObj.product_family_name || pfCode) : pfCode;
                    const defUom = c.defaultBaseUom || c.default_base_uom || c.defaultUom || 'KG';
                    const mappedCount = items.filter(i => (i.categoryCode === catCode || i.category_code === catCode || i.category === catCode)).length;

                    return `
                      <tr class="row-cat-click" data-cat-code="${catCode}" style="border-bottom:1px solid var(--border-subtle); cursor:pointer;">
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
                        No categories found in database. Click <strong>"+ Add Category"</strong> to create your first category.
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
          ` : `
            <div class="table-responsive">
              <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                    <th style="padding:10px;">Family Code</th>
                    <th style="padding:10px;">Product Family Name</th>
                    <th style="padding:10px;">Description</th>
                    <th style="padding:10px;">Categories Count</th>
                    <th style="padding:10px;">Mapped Items</th>
                    <th style="padding:10px;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${productFamilies.map(pf => {
                    const pfCode = (pf.code || pf.product_family_code || pf.id || '').toUpperCase().trim();
                    const pfName = pf.name || pf.product_family_name || pfCode;
                    const desc = pf.description || 'Reference product family';
                    const famCats = categories.filter(c => this._inferProductFamilyCode(c) === pfCode);

                    const famCatCodes = new Set();
                    famCats.forEach(c => {
                      const code = (c.categoryCode || c.category_code || c.code || c.id || '').toUpperCase().trim();
                      const name = (c.categoryName || c.category_name || c.name || '').toUpperCase().trim();
                      if (code) famCatCodes.add(code);
                      if (name) famCatCodes.add(name);
                    });

                    const famItemCount = items.filter(i => {
                      const itemCat = (i.categoryCode || i.category_code || i.category || '').toUpperCase().trim();
                      return itemCat && famCatCodes.has(itemCat);
                    }).length;

                    return `
                      <tr style="border-bottom:1px solid var(--border-subtle);">
                        <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${pfCode}</td>
                        <td style="padding:10px; font-weight:600;">${pfName}</td>
                        <td style="padding:10px; color:var(--text-muted); font-size:0.8rem;">${desc}</td>
                        <td style="padding:10px; font-weight:700; color:var(--status-info);">${famCats.length} categories</td>
                        <td style="padding:10px; font-weight:700; color:var(--status-success);">${famItemCount} items</td>
                        <td style="padding:10px;"><span class="badge badge-success">ACTIVE</span></td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;

      // Attach Event Handlers
      const btnAddCat = mount.querySelector('#btn-add-category-action');
      if (btnAddCat) {
        btnAddCat.addEventListener('click', () => {
          if (activeCatSubTab === 'families') {
            this.renderAddProductFamilyModal(tenantId, session, mount);
          } else {
            this.renderAddCategoryModal(tenantId, session, mount);
          }
        });
      }

      const btnImportCat = mount.querySelector('#btn-cat-import');
      if (btnImportCat) btnImportCat.addEventListener('click', () => this.openCategoryImportModal(tenantId, session, mount));

      const btnExportCat = mount.querySelector('#btn-cat-export');
      if (btnExportCat) btnExportCat.addEventListener('click', () => this.handleCategoryExport(tenantId));

      const btnTemplateCat = mount.querySelector('#btn-cat-template');
      if (btnTemplateCat) btnTemplateCat.addEventListener('click', () => this.handleCategoryTemplateDownload());

      const subCatBtn = mount.querySelector('#tab-sub-categories');
      if (subCatBtn) {
        subCatBtn.addEventListener('click', async () => {
          this.categorySubTab = 'categories';
          await this.render(mount, session);
        });
      }

      const subFamBtn = mount.querySelector('#tab-sub-families');
      if (subFamBtn) {
        subFamBtn.addEventListener('click', async () => {
          this.categorySubTab = 'families';
          await this.render(mount, session);
        });
      }

      const catRows = mount.querySelectorAll('.row-cat-click');
      catRows.forEach(row => {
        row.addEventListener('click', () => {
          const code = row.dataset.catCode;
          this.openCategoryDetailDrawer(code, tenantId, mount, session);
        });
      });
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
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              <button class="btn-primary nav-inv-btn" data-tab="inv-master-create" style="padding:8px 14px; font-weight:700; background:var(--accent-primary); border-radius:6px; border:none; cursor:pointer; color:#fff;">
                + Add Master Item
              </button>
              <button type="button" class="btn-secondary" id="btn-inv-master-import" style="padding:8px 14px; font-weight:700; border-radius:6px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                ↑ Import
              </button>
              <button type="button" class="btn-secondary" id="btn-inv-master-export" style="padding:8px 14px; font-weight:700; border-radius:6px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                ↓ Export
              </button>
              <button type="button" class="btn-secondary" id="btn-inv-master-template" style="padding:8px 14px; font-weight:700; border-radius:6px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                ⬇ Template
              </button>
            </div>
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
                  <th style="padding:10px;">Purchase UOM</th>
                  <th style="padding:10px;">Conversion</th>
                  <th style="padding:10px;">Reorder Level</th>
                  <th style="padding:10px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(i => {
                  const code = i.itemCode || i.item_code || i.sku || i.code || i.id || '';
                  const name = i.itemName || i.item_name || i.name || '';
                  const type = i.itemType || i.item_type || i.type || 'RAW_MATERIAL';
                  const category = i.categoryCode || i.category_code || i.category || 'GENERAL';
                  const baseUom = i.baseUom || i.base_uom || i.baseUnit || 'KG';
                  const purchaseUom = i.purchaseUom || i.purchase_uom || i.purchaseUnit || baseUom;
                  let conv = Number(i.conversionFactor !== undefined ? i.conversionFactor : (i.conversion_factor !== undefined ? i.conversion_factor : 1));
                  if (baseUom.toUpperCase() === purchaseUom.toUpperCase()) conv = 1;

                  const convText = (baseUom.toUpperCase() === purchaseUom.toUpperCase()) ? '1' : `${conv} ${baseUom}/${purchaseUom}`;
                  const reorderVal = Number(i.reorderLevel !== undefined ? i.reorderLevel : (i.reorder_level !== undefined ? i.reorder_level : 0));
                  const reorderText = `${reorderVal.toLocaleString()} ${baseUom}`;
                  const isAct = i.active !== false;

                  return `
                    <tr class="row-master-item-click" data-item-code="${code}" style="border-bottom:1px solid var(--border-subtle); cursor:pointer;">
                      <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${code}</td>
                      <td style="padding:10px; font-weight:600;">${name}</td>
                      <td style="padding:10px;"><span class="badge badge-info">${type}</span></td>
                      <td style="padding:10px;">${category}</td>
                      <td style="padding:10px;"><span class="badge badge-secondary">${baseUom}</span></td>
                      <td style="padding:10px;"><span class="badge badge-secondary">${purchaseUom}</span></td>
                      <td style="padding:10px; font-weight:600; font-size:0.8rem;">${convText}</td>
                      <td style="padding:10px; font-weight:700; color:var(--status-warning);">${reorderText}</td>
                      <td style="padding:10px;"><span class="badge ${isAct ? 'badge-success' : 'badge-secondary'}">${isAct ? 'ACTIVE' : 'INACTIVE'}</span></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      const btnImport = mount.querySelector('#btn-inv-master-import');
      if (btnImport) btnImport.addEventListener('click', () => this.openMasterInventoryImportModal(tenantId, session, mount));

      const btnExport = mount.querySelector('#btn-inv-master-export');
      if (btnExport) btnExport.addEventListener('click', () => this.handleMasterInventoryExport(tenantId));

      mount.querySelectorAll('.row-master-item-click').forEach(row => {
        row.addEventListener('click', () => {
          const itemCode = row.dataset.itemCode;
          this.openMasterItemDetailDrawer(itemCode, tenantId, mount, session);
        });
      });

      const btnTemplate = mount.querySelector('#btn-inv-master-template');
      if (btnTemplate) btnTemplate.addEventListener('click', () => this.handleMasterInventoryTemplateDownload());
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
      const activeSuppliers = suppliers.length ? suppliers : supplierImportController.getDefaultSuppliers();
      const inactiveCount = activeSuppliers.filter(s => s.active === false).length;
      const taxVerifiedCount = activeSuppliers.filter(s => (s.gstin || s.gst_number) && (s.gstin || s.gst_number).length === 15).length;
      const taxVerifiedPct = activeSuppliers.length ? Math.round((taxVerifiedCount / activeSuppliers.length) * 100) : 100;

      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="font-size:1.4rem; margin:0; color:var(--text-main);">🏢 Suppliers Master (${activeSuppliers.length} Suppliers)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">Supplier directory • Procurement partners</p>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              <button type="button" class="btn-primary" id="btn-add-supplier-action" style="padding:8px 16px; font-weight:700; background:var(--accent-primary); border-radius:6px; border:none; cursor:pointer; color:#fff;">
                + Add Supplier
              </button>
              <button type="button" class="btn-secondary" id="btn-sup-import" style="padding:8px 14px; font-weight:700; border-radius:6px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                ↑ Import
              </button>
              <button type="button" class="btn-secondary" id="btn-sup-export" style="padding:8px 14px; font-weight:700; border-radius:6px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                ↓ Export
              </button>
              <button type="button" class="btn-secondary" id="btn-sup-template" style="padding:8px 14px; font-weight:700; border-radius:6px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                ⬇ Template
              </button>
            </div>
          </div>

          <!-- Provenance Strip -->
          <div style="background:var(--bg-surface-2); padding:10px 16px; border-radius:6px; border:1px solid var(--border-subtle); margin-bottom:16px; font-size:0.8rem; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <strong style="color:var(--text-main);">${activeSuppliers.length} Active Suppliers</strong> • 
              <span>${inactiveCount} Inactive</span> • 
              <span style="color:var(--status-success); font-weight:700;">${taxVerifiedPct}% GSTIN Captured/Validated</span>
            </div>
            <div style="font-size:0.75rem; color:var(--accent-primary);">
              💡 Click any supplier row to view contact drawer & catalogue mapping
            </div>
          </div>

          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">Supplier Code</th>
                  <th style="padding:10px;">Supplier Name</th>
                  <th style="padding:10px;">Primary Contact</th>
                  <th style="padding:10px;">Phone</th>
                  <th style="padding:10px;">GSTIN</th>
                  <th style="padding:10px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${activeSuppliers.map(s => {
                  const code = s.supplierCode || s.supplier_code || s.code || s.id;
                  const name = s.supplierName || s.supplier_name || s.name || '';
                  const contact = s.contactPerson || s.contact_person || s.contact || 'N/A';
                  const phone = s.phone || s.contact_number || 'N/A';
                  const gstin = s.gstin || s.gst_number || 'N/A';
                  const active = s.active !== false;

                  return `
                    <tr class="row-sup-click" data-sup-code="${code}" style="border-bottom:1px solid var(--border-subtle); cursor:pointer;">
                      <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${code}</td>
                      <td style="padding:10px; font-weight:600;">${name}</td>
                      <td style="padding:10px;">${contact}</td>
                      <td style="padding:10px;">${phone}</td>
                      <td style="padding:10px; font-family:monospace;">${gstin}</td>
                      <td style="padding:10px;"><span class="badge ${active ? 'badge-success' : 'badge-secondary'}">${active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      const btnAddSup = mount.querySelector('#btn-add-supplier-action');
      if (btnAddSup) btnAddSup.addEventListener('click', () => this.renderAddSupplierModal(tenantId, session, mount));

      const btnImportSup = mount.querySelector('#btn-sup-import');
      if (btnImportSup) btnImportSup.addEventListener('click', () => this.openSupplierImportModal(tenantId, session, mount));

      const btnExportSup = mount.querySelector('#btn-sup-export');
      if (btnExportSup) btnExportSup.addEventListener('click', () => this.handleSupplierExport(tenantId));

      const btnTemplateSup = mount.querySelector('#btn-sup-template');
      if (btnTemplateSup) btnTemplateSup.addEventListener('click', () => this.handleSupplierTemplateDownload());

      const supRows = mount.querySelectorAll('.row-sup-click');
      supRows.forEach(row => {
        row.addEventListener('click', () => {
          const code = row.dataset.supCode;
          this.openSupplierDetailDrawer(code, tenantId, mount, session);
        });
      });
    } else if (tabKey === 'inv-supplier-catalogue' || tabKey === 'inv-catalogue') {
      const catalogueList = this._getCollection('supplier_catalogue', tenantId);
      const activeCatalogue = Array.isArray(catalogueList) ? catalogueList : [];

      const uniqueSuppliersCount = new Set(activeCatalogue.map(c => c.supplierCode || c.supplier_code)).size;
      const uniqueItemsCount = new Set(activeCatalogue.map(c => c.itemCode || c.item_code)).size;
      const avgLeadTime = activeCatalogue.length
        ? (activeCatalogue.reduce((sum, c) => sum + (parseInt(c.leadTimeDays || c.lead_time_days || 2, 10)), 0) / activeCatalogue.length).toFixed(1)
        : 2;

      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="font-size:1.4rem; margin:0; color:var(--text-main);">📦 Supplier Catalogue (${activeCatalogue.length} Mappings)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">Commercial mapping between suppliers and Anchor inventory items</p>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              <button type="button" class="btn-primary" id="btn-add-cat-item-action" style="padding:8px 16px; font-weight:700; background:var(--accent-primary); border-radius:6px; border:none; cursor:pointer; color:#fff;">
                + Add Catalogue Item
              </button>
              <button type="button" class="btn-secondary" id="btn-sup-cat-import" style="padding:8px 14px; font-weight:700; border-radius:6px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                ↑ Import
              </button>
              <button type="button" class="btn-secondary" id="btn-sup-cat-export" style="padding:8px 14px; font-weight:700; border-radius:6px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                ↓ Export
              </button>
              <button type="button" class="btn-secondary" id="btn-sup-cat-template" style="padding:8px 14px; font-weight:700; border-radius:6px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                ⬇ Template
              </button>
            </div>
          </div>

          <!-- Provenance Strip -->
          <div style="background:var(--bg-surface-2); padding:10px 16px; border-radius:6px; border:1px solid var(--border-subtle); margin-bottom:16px; font-size:0.8rem; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <strong style="color:var(--text-main);">${activeCatalogue.length} Active Mappings</strong> • 
              <span>${uniqueSuppliersCount} Suppliers Mapped</span> • 
              <span>${uniqueItemsCount} Items Covered</span> • 
              <span style="color:var(--status-info); font-weight:700;">${avgLeadTime} Days Avg Lead Time</span>
            </div>
            <div style="font-size:0.75rem; color:var(--accent-primary);">
              💡 Click any catalogue row to view price intelligence & history
            </div>
          </div>

          <!-- Filters Bar -->
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; margin-bottom:16px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
            <select id="sel-cat-filter-supplier" style="padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main);">
              <option value="ALL">All Suppliers</option>
              ${suppliers.map(s => `<option value="${s.supplierCode || s.supplier_code}">${s.supplierName || s.supplier_name} (${s.supplierCode || s.supplier_code})</option>`).join('')}
            </select>

            <select id="sel-cat-filter-category" style="padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main);">
              <option value="ALL">All Categories</option>
              ${categories.map(c => `<option value="${c.categoryCode || c.category_code}">${c.categoryName || c.category_name} (${c.categoryCode || c.category_code})</option>`).join('')}
            </select>

            <input type="text" id="inp-cat-search" placeholder="🔍 Search supplier items, SKUs, inventory items..." style="flex:1; min-width:200px; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main);" />
          </div>

          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">Supplier</th>
                  <th style="padding:10px;">Anchor Inventory Item</th>
                  <th style="padding:10px;">Supplier SKU</th>
                  <th style="padding:10px;">Pack & UOM</th>
                  <th style="padding:10px;">Catalogue Unit Price</th>
                  <th style="padding:10px;">GST %</th>
                  <th style="padding:10px;">MOQ</th>
                  <th style="padding:10px;">Preferred</th>
                  <th style="padding:10px;">Status</th>
                </tr>
              </thead>
              <tbody id="sup-cat-tbody">
                ${activeCatalogue.map(c => {
                  const supCode = c.supplierCode || c.supplier_code;
                  const itemCode = c.itemCode || c.item_code;
                  const supObj = suppliers.find(s => (s.supplierCode || s.supplier_code) === supCode) || {};
                  const itemObj = items.find(i => (i.itemCode || i.item_code) === itemCode) || {};
                  const price = parseFloat(c.unitPrice !== undefined ? c.unitPrice : (c.unit_price || 0));
                  const gst = c.gstRate !== undefined && c.gstRate !== null ? `${c.gstRate}%` : (c.gst_rate !== undefined && c.gst_rate !== null ? `${c.gst_rate}%` : '<span style="color:var(--text-muted); font-size:0.75rem;">Unassigned</span>');
                  const packQty = c.packQuantity || c.pack_quantity || 1;
                  const packUom = c.packUom || c.pack_uom || 'KG';
                  const uom = c.purchaseUom || c.purchase_uom || 'BAG';
                  const pref = c.preferred !== false;
                  const active = c.active !== false;

                  return `
                    <tr class="row-cat-item-click" data-sup-code="${supCode}" data-item-code="${itemCode}" style="border-bottom:1px solid var(--border-subtle); cursor:pointer;">
                      <td style="padding:10px; font-weight:700;"><span class="badge badge-info">${supCode}</span> ${supObj.supplierName || supObj.supplier_name || ''}</td>
                      <td style="padding:10px; font-weight:600;"><span style="font-family:monospace; color:var(--accent-primary); font-weight:700;">${itemCode}</span> ${itemObj.itemName || itemObj.item_name || c.supplierItemName || ''}</td>
                      <td style="padding:10px; font-family:monospace; color:var(--text-muted);">${c.supplierSku || c.supplier_sku || itemCode}</td>
                      <td style="padding:10px;"><span class="badge badge-secondary">${uom} (${packQty} ${packUom})</span></td>
                      <td style="padding:10px; font-weight:700; color:var(--status-success);">₹${price.toLocaleString('en-IN')} / ${uom}</td>
                      <td style="padding:10px;">${gst}</td>
                      <td style="padding:10px;">${c.moq || 1} ${uom}</td>
                      <td style="padding:10px;">${pref ? '<span class="badge badge-success">⭐ PREFERRED</span>' : '<span style="color:var(--text-muted); font-size:0.75rem;">Approved</span>'}</td>
                      <td style="padding:10px;"><span class="badge ${active ? 'badge-success' : 'badge-secondary'}">${active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      const btnAddCatItem = mount.querySelector('#btn-add-cat-item-action');
      if (btnAddCatItem) btnAddCatItem.addEventListener('click', () => this.renderAddSupplierCatalogueModal(tenantId, session, mount));

      const btnImportCat = mount.querySelector('#btn-sup-cat-import');
      if (btnImportCat) btnImportCat.addEventListener('click', () => this.openSupplierCatalogueImportModal(tenantId, session, mount));

      const btnExportCat = mount.querySelector('#btn-sup-cat-export');
      if (btnExportCat) btnExportCat.addEventListener('click', () => this.handleSupplierCatalogueExport(tenantId));

      const btnTemplateCat = mount.querySelector('#btn-sup-cat-template');
      if (btnTemplateCat) btnTemplateCat.addEventListener('click', () => this.handleSupplierCatalogueTemplateDownload());

      const selSup = mount.querySelector('#sel-cat-filter-supplier');
      const selCat = mount.querySelector('#sel-cat-filter-category');
      const inpSearch = mount.querySelector('#inp-cat-search');
      const tbody = mount.querySelector('#sup-cat-tbody');

      const filterRows = () => {
        const supVal = selSup ? selSup.value : 'ALL';
        const catVal = selCat ? selCat.value : 'ALL';
        const searchVal = (inpSearch ? inpSearch.value : '').toLowerCase().trim();

        const filtered = activeCatalogue.filter(c => {
          const supCode = c.supplierCode || c.supplier_code;
          const itemCode = c.itemCode || c.item_code;
          const itemObj = items.find(i => (i.itemCode || i.item_code || '').toUpperCase() === (itemCode || '').toUpperCase()) || {};

          if (supVal !== 'ALL' && supCode !== supVal) return false;

          if (catVal !== 'ALL') {
            const itemCatCode = (itemObj.categoryCode || itemObj.category_code || itemObj.category || '').toUpperCase().trim();
            const itemCatName = (itemObj.categoryName || itemObj.category_name || '').toUpperCase().trim();
            const filterCatCode = catVal.toUpperCase().trim();

            const matchCode = itemCatCode === filterCatCode;
            const matchName = itemCatName && itemCatName.includes(filterCatCode.replace('CAT-', ''));

            // Smart category cohesion: e.g. CAT-CHICKEN matches CAT-MEAT / CAT-POULTRY or items containing Chicken
            const matchChickenAlias = (filterCatCode.includes('CHICKEN') && (itemCatCode.includes('MEAT') || itemCatCode.includes('POULTRY') || (itemObj.itemName || c.supplierItemName || '').toUpperCase().includes('CHICKEN')));
            const matchMeatAlias = (filterCatCode.includes('MEAT') && (itemCatCode.includes('CHICKEN') || itemCatCode.includes('POULTRY') || (itemObj.itemName || c.supplierItemName || '').toUpperCase().includes('CHICKEN')));
            const matchFishAlias = (filterCatCode.includes('FISH') && (itemCatCode.includes('SEAFOOD') || (itemObj.itemName || c.supplierItemName || '').toUpperCase().includes('FISH')));
            const matchMuttonAlias = (filterCatCode.includes('MUTTON') && (itemCatCode.includes('MEAT') || (itemObj.itemName || c.supplierItemName || '').toUpperCase().includes('MUTTON')));

            if (!matchCode && !matchName && !matchChickenAlias && !matchMeatAlias && !matchFishAlias && !matchMuttonAlias) return false;
          }

          if (searchVal) {
            const matchSup = supCode.toLowerCase().includes(searchVal);
            const matchItem = itemCode.toLowerCase().includes(searchVal) || (itemObj.itemName || '').toLowerCase().includes(searchVal);
            const matchSku = (c.supplierSku || '').toLowerCase().includes(searchVal) || (c.supplierItemName || '').toLowerCase().includes(searchVal);
            if (!matchSup && !matchItem && !matchSku) return false;
          }
          return true;
        });

        if (tbody) {
          if (filtered.length > 0) {
            tbody.innerHTML = filtered.map(c => {
              const supCode = c.supplierCode || c.supplier_code;
              const itemCode = c.itemCode || c.item_code;
              const supObj = suppliers.find(s => (s.supplierCode || s.supplier_code) === supCode) || {};
              const itemObj = items.find(i => (i.itemCode || i.item_code) === itemCode) || {};
              const price = parseFloat(c.unitPrice !== undefined ? c.unitPrice : (c.unit_price || 0));
              const gst = c.gstRate !== undefined && c.gstRate !== null ? `${c.gstRate}%` : (c.gst_rate !== undefined && c.gst_rate !== null ? `${c.gst_rate}%` : '<span style="color:var(--text-muted); font-size:0.75rem;">Unassigned</span>');
              const packQty = c.packQuantity || c.pack_quantity || 1;
              const packUom = c.packUom || c.pack_uom || 'KG';
              const uom = c.purchaseUom || c.purchase_uom || 'BAG';
              const pref = c.preferred !== false;
              const active = c.active !== false;

              return `
                <tr class="row-cat-item-click" data-sup-code="${supCode}" data-item-code="${itemCode}" style="border-bottom:1px solid var(--border-subtle); cursor:pointer;">
                  <td style="padding:10px; font-weight:700;"><span class="badge badge-info">${supCode}</span> ${supObj.supplierName || supObj.supplier_name || ''}</td>
                  <td style="padding:10px; font-weight:600;"><span style="font-family:monospace; color:var(--accent-primary); font-weight:700;">${itemCode}</span> ${itemObj.itemName || itemObj.item_name || c.supplierItemName || ''}</td>
                  <td style="padding:10px; font-family:monospace; color:var(--text-muted);">${c.supplierSku || c.supplier_sku || itemCode}</td>
                  <td style="padding:10px;"><span class="badge badge-secondary">${uom} (${packQty} ${packUom})</span></td>
                  <td style="padding:10px; font-weight:700; color:var(--status-success);">₹${price.toLocaleString('en-IN')} / ${uom}</td>
                  <td style="padding:10px;">${gst}</td>
                  <td style="padding:10px;">${c.moq || 1} ${uom}</td>
                  <td style="padding:10px;">${pref ? '<span class="badge badge-success">⭐ PREFERRED</span>' : '<span style="color:var(--text-muted); font-size:0.75rem;">Approved</span>'}</td>
                  <td style="padding:10px;"><span class="badge ${active ? 'badge-success' : 'badge-secondary'}">${active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                </tr>
              `;
            }).join('');

            tbody.querySelectorAll('.row-cat-item-click').forEach(row => {
              row.addEventListener('click', () => {
                const sCode = row.dataset.supCode;
                const iCode = row.dataset.itemCode;
                this.openSupplierCatalogueDetailDrawer(sCode, iCode, tenantId, mount, session);
              });
            });
          } else {
            tbody.innerHTML = `
              <tr>
                <td colspan="9" style="padding:24px; text-align:center; color:var(--text-muted);">
                  No supplier catalogue mappings match the selected filters.
                </td>
              </tr>
            `;
          }
        }
      };

      if (selSup) selSup.addEventListener('change', filterRows);
      if (selCat) selCat.addEventListener('change', filterRows);
      if (inpSearch) inpSearch.addEventListener('input', filterRows);

      mount.querySelectorAll('.row-cat-item-click').forEach(row => {
        row.addEventListener('click', () => {
          const sCode = row.dataset.supCode;
          const iCode = row.dataset.itemCode;
          this.openSupplierCatalogueDetailDrawer(sCode, iCode, tenantId, mount, session);
        });
      });
    } else if (tabKey === 'inv-grn') {
      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="font-size:1.4rem; margin:0;">🚚 Goods Receiving Studio (GRN) (${grns.length} Receipts)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">Post physical stock receipts, track delivery challans, and record invoice status for 3-way matching.</p>
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
                  <th style="padding:10px;">PO #</th>
                  <th style="padding:10px;">Vendor</th>
                  <th style="padding:10px;">Location</th>
                  <th style="padding:10px;">Receipt Date</th>
                  <th style="padding:10px;">Delivery Challan #</th>
                  <th style="padding:10px;">Invoice Status</th>
                  <th style="padding:10px; text-align:right;">Receipt Value</th>
                  <th style="padding:10px; text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${grns.length ? grns.map(g => {
                  const grnId = g.id || g.grnNumber || g.grn_number;
                  const poNum = g.poNumber || g.po_number || g.poId || 'Direct GRN';
                  const dcNum = g.deliveryChallanNo || g.delivery_challan_no || 'N/A';
                  const invStatus = g.invoiceStatus || g.invoice_status || (g.supplierInvoiceNo && g.supplierInvoiceNo !== 'NOT_RECEIVED' ? 'RECEIVED' : 'NOT_RECEIVED');
                  const isInvPending = invStatus === 'NOT_RECEIVED';
                  const receiptVal = parseFloat(g.totalReceivedValue || g.total_received_value || g.grnTotalValue || g.supplierInvoiceTotal) || 0;

                  return `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${g.grnNumber || g.grn_number || g.id}</td>
                      <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--text-main);">${poNum}</td>
                      <td style="padding:10px; font-weight:600;">${g.supplierName || g.supplier_name || g.supplierCode}</td>
                      <td style="padding:10px;"><span class="badge badge-info">${g.destinationLocationCode || g.destination_location_code || g.receivingLocationCode || 'Store'}</span></td>
                      <td style="padding:10px;">${g.receiptDate || g.receivedDate || g.received_date || 'N/A'}</td>
                      <td style="padding:10px; font-family:monospace; font-weight:600;">${dcNum}</td>
                      <td style="padding:10px;">
                        <span class="badge ${isInvPending ? 'badge-warning' : 'badge-success'}">
                          ${isInvPending ? '⚠ Invoice Pending' : '✓ Invoice Received'}
                        </span>
                      </td>
                      <td style="padding:10px; text-align:right; font-weight:700; font-family:monospace; color:var(--status-success);">₹${receiptVal.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                      <td style="padding:10px; text-align:right;">
                        <button type="button" class="btn-grn-view-drawer" data-grn-id="${grnId}" style="padding:4px 10px; font-size:0.75rem; font-weight:700; border-radius:4px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                          👁 View GRN
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="9" style="padding:24px; text-align:center; color:var(--text-muted);">
                      No GRN receipts posted yet. Click <strong>"+ Post Goods Receipt Note Screen"</strong> to post initial stock receipt.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Wire GRN drawer click listeners
      mount.querySelectorAll('.btn-grn-view-drawer').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const grnId = e.currentTarget.dataset.grnId;
          this.openGRNDetailDrawer(grnId, tenantId, mount, session);
        });
      });
    } else if (tabKey === 'inv-po') {
      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="font-size:1.4rem; margin:0;">📄 Purchase Orders / Procurement (${pos.length} Orders)</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">Raise, approve & track receiving lifecycle for all Purchase Orders.</p>
            </div>
            <button class="btn-primary nav-inv-btn" data-tab="inv-po-create" style="padding:10px 18px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); border-radius:6px; border:none; cursor:pointer; color:#fff;">
              📋 + Create Purchase Order Screen
            </button>
          </div>

          <div class="table-responsive">
            <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                  <th style="padding:10px;">PO #</th>
                  <th style="padding:10px;">Vendor</th>
                  <th style="padding:10px;">Destination</th>
                  <th style="padding:10px;">Order Date</th>
                  <th style="padding:10px;">Grand Total</th>
                  <th style="padding:10px;">Receiving Progress</th>
                  <th style="padding:10px;">Status</th>
                  <th style="padding:10px; text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${pos.length ? pos.map(p => {
                  const poId = p.id || p.poNumber || p.po_number;
                  const accumulatedPo = purchasingModel.getPurchaseOrderById(poId, tenantId) || p;
                  const status = accumulatedPo.status || p.status || 'APPROVED';
                  const lines = accumulatedPo.lines || p.lines || [];
                  const progressStr = accumulatedPo.receivingProgressStr || `${lines.length} Items`;
                  const grandTotal = parseFloat(p.grandTotal || p.grand_total || p.total_amount) || 0;

                  let statusBadgeClass = 'badge-info';
                  if (status === 'DRAFT') statusBadgeClass = 'badge-secondary';
                  else if (status === 'APPROVED') statusBadgeClass = 'badge-primary';
                  else if (status === 'PARTIALLY_RECEIVED') statusBadgeClass = 'badge-warning';
                  else if (status === 'FULLY_RECEIVED') statusBadgeClass = 'badge-success';

                  return `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:10px; font-weight:700; font-family:monospace; color:var(--accent-primary);">${p.poNumber || p.po_number || p.id}</td>
                      <td style="padding:10px; font-weight:600;">${p.supplierName || p.supplier_name || p.supplierCode}</td>
                      <td style="padding:10px;"><span class="badge badge-info">${p.destinationLocationCode || p.destination_location_code}</span></td>
                      <td style="padding:10px;">${p.orderDate || p.order_date || 'N/A'}</td>
                      <td style="padding:10px; font-weight:700; color:var(--status-success);">₹${grandTotal.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                      <td style="padding:10px; font-weight:600; font-size:0.8rem; color:var(--text-muted);">${progressStr}</td>
                      <td style="padding:10px;"><span class="badge ${statusBadgeClass}">${status}</span></td>
                      <td style="padding:10px; text-align:right;">
                        <div style="display:flex; gap:6px; justify-content:flex-end; align-items:center;">
                          <button type="button" class="btn-po-view-drawer" data-po-id="${poId}" style="padding:4px 10px; font-size:0.75rem; font-weight:700; border-radius:4px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                            👁 View
                          </button>
                          ${status === 'DRAFT' ? `
                            <button type="button" class="nav-inv-btn" data-tab="inv-po-create" style="padding:4px 10px; font-size:0.75rem; font-weight:700; border-radius:4px; cursor:pointer; background:var(--accent-primary); border:none; color:#fff;">
                              ✏ Edit PO
                            </button>
                          ` : ''}
                          ${status === 'APPROVED' ? `
                            <button type="button" class="btn-po-receive-goods" data-po-id="${poId}" style="padding:4px 10px; font-size:0.75rem; font-weight:700; border-radius:4px; cursor:pointer; background:var(--status-success); border:none; color:#fff;">
                              📦 Receive Goods
                            </button>
                          ` : ''}
                          ${status === 'PARTIALLY_RECEIVED' ? `
                            <button type="button" class="btn-po-receive-goods" data-po-id="${poId}" style="padding:4px 10px; font-size:0.75rem; font-weight:700; border-radius:4px; cursor:pointer; background:var(--status-warning); border:none; color:#fff;">
                              📦 Receive Remaining
                            </button>
                          ` : ''}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="8" style="padding:24px; text-align:center; color:var(--text-muted);">
                      No Purchase Orders created yet. Click <strong>"+ Create Purchase Order Screen"</strong> to raise a new PO.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
        <div id="po-detail-drawer-mount"></div>
      `;

      // Wire event listeners for PO drawer and Receive Goods buttons
      mount.querySelectorAll('.btn-po-view-drawer').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const poId = e.currentTarget.dataset.poId;
          this.openPODetailDrawer(poId, tenantId, mount, session);
        });
      });

      mount.querySelectorAll('.btn-po-receive-goods').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const poId = e.currentTarget.dataset.poId;
          this.activeSubView = 'inv-grn-create';
          this.targetPoForGrn = poId;
          this.render(mount, session);
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
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Category *</label>
              <select id="inp-cat-code" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); color:var(--text-main);">
                ${categories.map(c => `<option value="${c.categoryCode || c.category_code}">${c.categoryName || c.category_name} (${c.categoryCode || c.category_code})</option>`).join('')}
              </select>
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
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Reorder Level</label>
              <input type="number" id="inp-reorder-level" value="10" min="0" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
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
        openingStock: 0,
        opening_stock: 0,
        reorderLevel: parseFloat(mount.querySelector('#inp-reorder-level')?.value) || 10,
        reorder_level: parseFloat(mount.querySelector('#inp-reorder-level')?.value) || 10,
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

  renderPostGrnFormScreen(mount, tenantId, items, suppliers, locations, session) {
    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-grn" style="font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer;">
            ← Back to Goods Receiving Studio
          </button>
          <div style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">🚚 Goods Receiving Note (GRN) Screen</div>
        </div>

        <h3 style="margin-top:0; color:var(--status-success); font-size:1.5rem;">📥 Post Goods Receipt Note (GRN)</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:20px;">Post physical stock receipts directly to location <strong>stock_balances</strong> in Supabase.</p>

        <div style="display:flex; flex-direction:column; gap:16px; max-width:640px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Supplier / Vendor *</label>
              <select id="grn-sup-sel" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
                ${suppliers.map(s => `<option value="${s.supplierCode || s.supplier_code}">${s.supplierName || s.supplier_name} (${s.supplierCode || s.supplier_code})</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Destination Store Location *</label>
              <select id="grn-loc-sel" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
                ${locations.map(l => `<option value="${l.locationCode || l.location_code}">${l.locationName || l.location_name} (${l.locationCode || l.location_code})</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Invoice / Challan #</label>
              <input type="text" id="grn-inv-no" placeholder="e.g. INV-2026-88" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Item Code & Ingredient *</label>
              <select id="grn-item-sel" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
                ${items.map(i => `<option value="${i.itemCode || i.item_code}">${i.itemName || i.item_name} (${i.itemCode || i.item_code})</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Received Quantity *</label>
              <input type="number" id="grn-qty" value="50" min="1" step="0.01" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Unit Purchase Price (₹)</label>
              <input type="number" id="grn-price" value="120" min="0" step="0.01" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button class="btn-secondary nav-inv-btn" data-tab="inv-grn" style="padding:10px 20px;">Cancel</button>
            <button class="btn-primary" id="btn-grn-commit" style="padding:12px 24px; font-weight:700; background:linear-gradient(135deg, var(--status-success), #059669); color:#fff; border:none; border-radius:6px; cursor:pointer;">
              📥 Post Goods Receipt Note & Update Balances
            </button>
          </div>
        </div>
      </div>
    `;

    mount.querySelector('#btn-grn-commit').addEventListener('click', async () => {
      const supplierCode = mount.querySelector('#grn-sup-sel').value;
      const receivingLocationCode = mount.querySelector('#grn-loc-sel').value;
      const vendorInvoiceNo = mount.querySelector('#grn-inv-no').value.trim() || `INV-${Date.now()}`;
      const itemCode = mount.querySelector('#grn-item-sel').value;
      const receivedQty = parseFloat(mount.querySelector('#grn-qty').value) || 0;
      const unitCost = parseFloat(mount.querySelector('#grn-price').value) || 0;

      if (receivedQty <= 0) {
        alert('❌ Please enter a valid received quantity.');
        return;
      }

      const itemObj = items.find(i => (i.itemCode === itemCode || i.item_code === itemCode)) || {};
      const grnNumber = `GRN-${Date.now().toString().substring(7)}`;

      const newGrn = {
        id: `grn-${Date.now()}`,
        tenantId,
        tenant_id: tenantId,
        grnNumber,
        grn_number: grnNumber,
        supplierCode,
        supplier_code: supplierCode,
        supplierName: suppliers.find(s => s.supplierCode === supplierCode || s.supplier_code === supplierCode)?.supplierName || supplierCode,
        receivingLocationCode,
        receiving_location_code: receivingLocationCode,
        vendorInvoiceNo,
        vendor_invoice_no: vendorInvoiceNo,
        receivedDate: new Date().toISOString().split('T')[0],
        received_date: new Date().toISOString().split('T')[0],
        lines: [{ itemCode, itemName: itemObj.itemName || itemCode, quantity: receivedQty, unitCost }],
        status: 'POSTED'
      };

      const gw = this._getDataGateway();
      if (gw) {
        await gw.create('goods_receipt_notes', newGrn);

        const balances = this._getCollection('stock_balances', tenantId);
        const existingBalance = balances.find(b => (b.itemCode === itemCode || b.item_code === itemCode) && (b.locationCode === receivingLocationCode || b.location_code === receivingLocationCode));

        if (existingBalance) {
          const newQty = (parseFloat(existingBalance.quantity) || 0) + receivedQty;
          const newValuation = newQty * unitCost;
          await gw.update('stock_balances', existingBalance.id, {
            ...existingBalance,
            quantity: newQty,
            unitCost,
            valuation: newValuation,
            lastUpdatedAt: new Date().toISOString()
          });
        } else {
          await gw.create('stock_balances', {
            id: `sb-${Date.now()}`,
            tenantId,
            tenant_id: tenantId,
            itemCode,
            item_code: itemCode,
            locationCode: receivingLocationCode,
            location_code: receivingLocationCode,
            quantity: receivedQty,
            unitCost,
            unit_cost: unitCost,
            valuation: receivedQty * unitCost,
            lastUpdatedAt: new Date().toISOString()
          });
        }
      }

      alert(`🎉 Goods Receipt Note ${grnNumber} Posted Successfully!\n🔒 Stock balances updated cleanly at ${receivingLocationCode}.`);
      this.activeSubView = 'inv-grn';
      const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
      this.render(targetMount, session);
    });
  }

  // --- 8. FULL-SCREEN FORM: CREATE PO ---

  renderCreatePoFormScreen(mount, tenantId, items, suppliers, locations, session) {
    const catalogueList = supplierCatalogueController._getCollection('supplier_catalogue', tenantId);
    const categories = this._getUnifiedCategories(tenantId);

    const defaultDeliveryDate = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

    let poBasket = []; // Array of [{ itemCode, itemName, supplierSku, quantity, uom, catalogueUnitPrice, poUnitPrice, priceOverride, lineTotal }]

    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px; max-width:1280px; margin:0 auto;">
        <!-- Top Navigation & Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <button class="btn-secondary nav-inv-btn" data-tab="inv-po" style="font-weight:700; padding:8px 14px; border-radius:6px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
              ← Back to Purchase Orders
            </button>
            <div style="font-size:0.85rem; font-weight:700; color:var(--text-muted);">📄 Purchase Order Builder</div>
          </div>
          <span style="font-size:0.8rem; padding:4px 10px; border-radius:12px; background:rgba(99, 102, 241, 0.15); color:var(--accent-primary); font-weight:700;">Multi-Line Procurement Engine</span>
        </div>

        <div style="margin-bottom:20px;">
          <h3 style="margin:0; color:var(--accent-primary); font-size:1.5rem;">📋 Create Purchase Order</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-top:4px;">
            Build a multi-line purchase order from a supplier's catalog with transaction-level price negotiation.
          </p>
        </div>

        <!-- Supplier & Destination Header Card -->
        <div style="background:var(--bg-surface-2); padding:16px 20px; border-radius:8px; border:1px solid var(--border-subtle); margin-bottom:24px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <label style="font-size:0.85rem; font-weight:700; color:var(--text-main);">Supplier / Vendor *</label>
                <span id="po-cat-badge" style="font-size:0.75rem; color:var(--accent-primary); font-weight:700; background:rgba(99,102,241,0.1); padding:2px 8px; border-radius:10px;">
                  37 items available
                </span>
              </div>
              <select id="po-sup-sel" style="width:100%; padding:10px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main); font-weight:600; font-size:0.9rem;">
                ${suppliers.map(s => `<option value="${s.supplierCode || s.supplier_code}">${s.supplierName || s.supplier_name} (${s.supplierCode || s.supplier_code})</option>`).join('')}
              </select>
            </div>

            <div>
              <label style="display:block; font-size:0.85rem; font-weight:700; color:var(--text-main); margin-bottom:6px;">Destination Location *</label>
              <select id="po-loc-sel" style="width:100%; padding:10px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main); font-size:0.9rem;">
                ${locations.map(l => `<option value="${l.locationCode || l.location_code}">${l.locationName || l.location_name} (${l.locationCode || l.location_code})</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Main Workspace Grid: Left Column (Table + Details) & Right Column (Summary Sidebar) -->
        <div style="display:grid; grid-template-columns:1fr 340px; gap:24px; align-items:start;">
          <!-- Left Column -->
          <div style="display:flex; flex-direction:column; gap:20px;">
            <!-- Order Items Card -->
            <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:8px; padding:16px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <h4 style="margin:0; font-size:1.1rem; color:var(--text-main);">ORDER ITEMS</h4>
                  <span id="po-items-count-badge" class="badge badge-info" style="font-size:0.75rem;">0 items</span>
                </div>
                <button type="button" class="btn-primary" id="btn-open-item-picker" style="padding:6px 14px; font-size:0.85rem; font-weight:700; background:var(--accent-primary); border-radius:6px; border:none; cursor:pointer; color:#fff;">
                  + Add Items from Catalogue
                </button>
              </div>

              <!-- Table Mount -->
              <div id="po-items-table-container"></div>
            </div>

            <!-- PO Details Section -->
            <div style="background:var(--bg-surface-2); padding:16px; border-radius:8px; border:1px solid var(--border-subtle);">
              <h4 style="margin-top:0; margin-bottom:12px; font-size:1rem; color:var(--text-main);">PO DETAILS</h4>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                <div>
                  <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:4px;">Expected Delivery Date</label>
                  <input type="date" id="po-delivery-date" value="${defaultDeliveryDate}" style="width:100%; padding:8px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main); font-weight:600;" />
                </div>
                <div>
                  <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:4px;">Payment Terms</label>
                  <select id="po-payment-terms" style="width:100%; padding:8px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main);">
                    <option value="Supplier Default">Supplier Default</option>
                    <option value="Net 15">Net 15 Days</option>
                    <option value="Net 30">Net 30 Days</option>
                    <option value="COD">Cash on Delivery (COD)</option>
                  </select>
                </div>
              </div>
              <div style="margin-top:12px;">
                <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:4px;">Reference / Notes</label>
                <input type="text" id="po-notes" placeholder="Optional internal reference, delivery instructions or notes..." style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main);" />
              </div>
            </div>
          </div>

          <!-- Right Column: Order Summary Sidebar -->
          <div style="position:sticky; top:20px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:8px; padding:20px; display:flex; flex-direction:column; gap:16px;">
            <h4 style="margin:0; font-size:1.1rem; color:var(--text-main); border-bottom:1px solid var(--border-subtle); padding-bottom:10px;">ORDER SUMMARY</h4>

            <div style="font-size:0.85rem;">
              <div style="font-weight:700; color:var(--text-main);" id="sidebar-sup-name">--</div>
              <div style="color:var(--accent-primary); font-family:monospace; font-weight:700; font-size:0.8rem;" id="sidebar-sup-code">--</div>
            </div>

            <div style="display:flex; flex-direction:column; gap:8px; font-size:0.85rem; border-top:1px solid var(--border-subtle); border-bottom:1px solid var(--border-subtle); padding:12px 0;">
              <div style="display:flex; justify-content:space-between;">
                <span style="color:var(--text-muted);">Items:</span>
                <strong id="sidebar-items-count" style="color:var(--text-main);">0</strong>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span style="color:var(--text-muted);">Total Quantity:</span>
                <strong id="sidebar-total-qty" style="color:var(--text-main);">0</strong>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span style="color:var(--text-muted);">Subtotal (Catalogue Value):</span>
                <span id="sidebar-cat-value" style="font-family:monospace;">₹0.00</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="color:var(--text-muted);">PO Price Overrides:</span>
                <span id="sidebar-override-val" style="font-family:monospace; font-weight:700;">₹0.00</span>
              </div>
            </div>

            <div>
              <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); margin-bottom:2px;">PO TOTAL</div>
              <div id="sidebar-grand-total" style="font-size:1.6rem; font-weight:800; color:var(--status-success);">₹0.00</div>
            </div>

            <div style="display:flex; flex-direction:column; gap:10px; margin-top:8px;">
              <button type="button" class="btn-primary" id="btn-po-create-submit" style="width:100%; padding:12px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:0.95rem; box-shadow:0 4px 12px rgba(99,102,241,0.25);">
                🚀 Create Purchase Order
              </button>
              <button type="button" class="btn-secondary" id="btn-po-draft-submit" style="width:100%; padding:10px; font-weight:600; background:var(--bg-surface-1); border:1px solid var(--border-subtle); color:var(--text-main); border-radius:6px; cursor:pointer;">
                💾 Save as Draft
              </button>
              <button type="button" class="btn-secondary nav-inv-btn" data-tab="inv-po" style="width:100%; padding:8px; font-size:0.8rem; background:transparent; border:none; color:var(--text-muted); cursor:pointer;">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Item Picker Modal Mount -->
      <div id="po-item-picker-modal-mount"></div>
    `;

    const selSup = mount.querySelector('#po-sup-sel');
    const selLoc = mount.querySelector('#po-loc-sel');
    const catBadge = mount.querySelector('#po-cat-badge');

    const sidebarSupName = mount.querySelector('#sidebar-sup-name');
    const sidebarSupCode = mount.querySelector('#sidebar-sup-code');
    const sidebarItemsCount = mount.querySelector('#sidebar-items-count');
    const sidebarTotalQty = mount.querySelector('#sidebar-total-qty');
    const sidebarCatValue = mount.querySelector('#sidebar-cat-value');
    const sidebarOverrideVal = mount.querySelector('#sidebar-override-val');
    const sidebarGrandTotal = mount.querySelector('#sidebar-grand-total');

    const tableContainer = mount.querySelector('#po-items-table-container');
    const countBadge = mount.querySelector('#po-items-count-badge');

    // Helper: get current supplier's available catalogue
    const getAvailableCatalogue = () => {
      const supCode = selSup.value;
      return catalogueList.filter(c => (c.supplierCode || c.supplier_code || '').toUpperCase() === supCode.toUpperCase());
    };

    // Helper: get selected supplier object
    const getSelectedSupplierObj = () => {
      const supCode = selSup.value;
      return suppliers.find(s => (s.supplierCode || s.supplier_code || '').toUpperCase() === supCode.toUpperCase()) || { supplierName: supCode, supplierCode: supCode };
    };

    // Render Order Items Table
    const renderOrderItemsTable = () => {
      countBadge.textContent = `${poBasket.length} ${poBasket.length === 1 ? 'item' : 'items'}`;
      const supObj = getSelectedSupplierObj();

      if (poBasket.length === 0) {
        tableContainer.innerHTML = `
          <div style="text-align:center; padding:36px 16px; background:var(--bg-surface-2); border-radius:8px; border:1px dashed var(--border-subtle);">
            <div style="font-size:2rem; margin-bottom:8px;">📦</div>
            <div style="font-weight:700; color:var(--text-main); font-size:1rem; margin-bottom:4px;">No items added to PO yet</div>
            <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;">Add items from ${supObj.supplierName || supObj.supplier_code}'s catalogue</div>
            <button type="button" class="btn-primary" id="btn-add-items-empty" style="padding:10px 18px; font-weight:700; background:var(--accent-primary); border:none; border-radius:6px; color:#fff; cursor:pointer;">
              + Add items from ${supObj.supplierName || supObj.supplier_code}'s catalogue
            </button>
          </div>
        `;
        const btnEmpty = tableContainer.querySelector('#btn-add-items-empty');
        if (btnEmpty) btnEmpty.addEventListener('click', () => openItemPickerModal());
        return;
      }

      tableContainer.innerHTML = `
        <div class="table-responsive">
          <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                <th style="padding:10px;">Item Details</th>
                <th style="padding:10px; width:100px;">Qty</th>
                <th style="padding:10px; width:70px;">UOM</th>
                <th style="padding:10px; width:110px;">Catalogue Price</th>
                <th style="padding:10px; width:140px;">PO Price (₹)</th>
                <th style="padding:10px; width:120px; text-align:right;">Amount</th>
                <th style="padding:10px; width:40px; text-align:center;"></th>
              </tr>
            </thead>
            <tbody>
              ${poBasket.map((row, idx) => {
                const cataloguePrice = row.catalogueUnitPrice || 0;
                const poPrice = row.poUnitPrice !== undefined ? row.poUnitPrice : cataloguePrice;
                const diff = poPrice - cataloguePrice;
                const priceOverride = Math.abs(diff) > 0.01;
                const lineTotal = (row.quantity || 0) * poPrice;

                return `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:10px;">
                      <div style="font-weight:700; color:var(--text-main);">${row.itemName}</div>
                      <div style="font-size:0.75rem; font-family:monospace; color:var(--accent-primary);">
                        ${row.itemCode} ${row.supplierSku ? `• SKU: ${row.supplierSku}` : ''}
                      </div>
                    </td>
                    <td style="padding:10px;">
                      <input type="number" class="inp-basket-qty" data-idx="${idx}" value="${row.quantity}" min="0.01" step="any" style="width:80px; padding:6px 8px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); font-weight:700; text-align:center; color:var(--text-main);" />
                    </td>
                    <td style="padding:10px;">
                      <span class="badge badge-secondary" style="font-weight:700;">${row.uom || 'KG'}</span>
                    </td>
                    <td style="padding:10px; color:var(--text-muted); font-family:monospace;">
                      ₹${cataloguePrice.toLocaleString('en-IN', {minimumFractionDigits:2})}
                    </td>
                    <td style="padding:10px;">
                      <input type="number" class="inp-basket-price" data-idx="${idx}" value="${poPrice}" min="0" step="0.01" style="width:95px; padding:6px 8px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); font-weight:700; color:var(--status-success);" />
                      ${priceOverride ? `
                        <div style="font-size:0.7rem; color:var(--status-warning); font-weight:700; margin-top:2px;">
                          ⚠ ${diff > 0 ? `+₹${diff.toFixed(2)}` : `-₹${Math.abs(diff).toFixed(2)}`} override
                        </div>
                      ` : ''}
                    </td>
                    <td style="padding:10px; text-align:right; font-weight:700; font-family:monospace; color:var(--text-main);">
                      ₹${lineTotal.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </td>
                    <td style="padding:10px; text-align:center;">
                      <button type="button" class="btn-basket-remove" data-idx="${idx}" style="background:none; border:none; color:var(--status-danger); cursor:pointer; font-size:1.1rem; padding:4px;" title="Remove Item">
                        🗑
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top:12px; display:flex; justify-content:flex-end;">
          <button type="button" class="btn-secondary" id="btn-add-more-items" style="padding:6px 12px; font-size:0.8rem; font-weight:700; border-radius:4px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
            + Add another item
          </button>
        </div>
      `;

      // Wire row input change listeners
      tableContainer.querySelectorAll('.inp-basket-qty').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const idx = parseInt(e.target.dataset.idx, 10);
          const val = parseFloat(e.target.value) || 0;
          if (poBasket[idx]) {
            poBasket[idx].quantity = val;
            poBasket[idx].lineTotal = val * poBasket[idx].poUnitPrice;
            updateSummarySidebar();
            // Partial re-render line total calculation text without blowing focus
            const rowElem = e.target.closest('tr');
            if (rowElem) {
              const amountTd = rowElem.children[5];
              if (amountTd) amountTd.textContent = `₹${(val * poBasket[idx].poUnitPrice).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            }
          }
        });
      });

      tableContainer.querySelectorAll('.inp-basket-price').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const idx = parseInt(e.target.dataset.idx, 10);
          const val = parseFloat(e.target.value) || 0;
          if (poBasket[idx]) {
            poBasket[idx].poUnitPrice = val;
            poBasket[idx].priceOverride = Math.abs(val - poBasket[idx].catalogueUnitPrice) > 0.01;
            poBasket[idx].lineTotal = poBasket[idx].quantity * val;
            renderOrderItemsTable(); // Re-render to show/hide override badge
            updateSummarySidebar();
          }
        });
      });

      tableContainer.querySelectorAll('.btn-basket-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.target.dataset.idx, 10);
          poBasket.splice(idx, 1);
          renderOrderItemsTable();
          updateSummarySidebar();
        });
      });

      const btnMore = tableContainer.querySelector('#btn-add-more-items');
      if (btnMore) btnMore.addEventListener('click', () => openItemPickerModal());
    };

    // Update Order Summary Sidebar
    const updateSummarySidebar = () => {
      const supObj = getSelectedSupplierObj();
      sidebarSupName.textContent = supObj.supplierName || supObj.supplier_name || selSup.value;
      sidebarSupCode.textContent = supObj.supplierCode || supObj.supplier_code || selSup.value;

      sidebarItemsCount.textContent = poBasket.length;
      const totalQty = poBasket.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
      sidebarTotalQty.textContent = totalQty.toLocaleString('en-IN');

      const catValue = poBasket.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.catalogueUnitPrice) || 0)), 0);
      const poTotal = poBasket.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.poUnitPrice) || 0)), 0);
      const overrideVariance = poTotal - catValue;

      sidebarCatValue.textContent = `₹${catValue.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
      
      if (Math.abs(overrideVariance) > 0.01) {
        sidebarOverrideVal.textContent = `${overrideVariance > 0 ? `+₹${overrideVariance.toFixed(2)}` : `-₹${Math.abs(overrideVariance).toFixed(2)}`}`;
        sidebarOverrideVal.style.color = overrideVariance > 0 ? 'var(--status-warning)' : 'var(--status-success)';
      } else {
        sidebarOverrideVal.textContent = '₹0.00';
        sidebarOverrideVal.style.color = 'var(--text-muted)';
      }

      sidebarGrandTotal.textContent = `₹${poTotal.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    };

    // Update Header Badge when Supplier Selection Changes
    const onSupplierChange = () => {
      const supCat = getAvailableCatalogue();
      const supObj = getSelectedSupplierObj();

      catBadge.textContent = `${supCat.length} ${supCat.length === 1 ? 'item' : 'items'} available`;
      poBasket = []; // Reset basket when switching supplier
      renderOrderItemsTable();
      updateSummarySidebar();
    };

    selSup.addEventListener('change', onSupplierChange);
    onSupplierChange(); // Initial calculation

    // Open Supplier-Aware Item Picker Modal
    const openItemPickerModal = () => {
      const supCat = getAvailableCatalogue();
      const supObj = getSelectedSupplierObj();
      const modalMount = mount.querySelector('#po-item-picker-modal-mount');

      let selectedItemCodes = new Set(poBasket.map(b => b.itemCode));

      modalMount.innerHTML = `
        <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:9999;">
          <div class="card animate-fade-in" style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:12px; width:90%; max-width:680px; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 12px 32px rgba(0,0,0,0.4);">
            <!-- Modal Header -->
            <div style="padding:16px 20px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
              <div>
                <h4 style="margin:0; font-size:1.1rem; color:var(--text-main);">ADD ITEMS FROM CATALOGUE</h4>
                <div style="font-size:0.8rem; color:var(--accent-primary); font-weight:700; margin-top:2px;">
                  ${supObj.supplierName} (${supObj.supplierCode}) • ${supCat.length} items available
                </div>
              </div>
              <button type="button" id="btn-close-picker-modal" style="background:none; border:none; font-size:1.4rem; color:var(--text-muted); cursor:pointer;">✕</button>
            </div>

            <!-- Filter Controls -->
            <div style="padding:12px 20px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:flex; gap:12px; flex-wrap:wrap;">
              <input type="text" id="inp-picker-search" placeholder="🔍 Search inventory item or code..." style="flex:1; min-width:200px; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main);" />
              <select id="sel-picker-category" style="padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main);">
                <option value="ALL">All Categories</option>
                ${categories.map(c => `<option value="${c.categoryCode || c.category_code}">${c.categoryName || c.category_name}</option>`).join('')}
              </select>
            </div>

            <!-- Items List -->
            <div id="picker-items-list" style="padding:12px 20px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:8px;"></div>

            <!-- Modal Footer -->
            <div style="padding:16px 20px; border-top:1px solid var(--border-subtle); background:var(--bg-surface-2); display:flex; justify-content:space-between; align-items:center;">
              <button type="button" id="btn-picker-select-all" style="background:none; border:none; color:var(--accent-primary); font-size:0.85rem; font-weight:700; cursor:pointer;">
                Select All
              </button>
              <div style="display:flex; gap:12px; align-items:center;">
                <button type="button" class="btn-secondary" id="btn-cancel-picker" style="padding:8px 16px; font-size:0.85rem; border-radius:6px; cursor:pointer;">
                  Cancel
                </button>
                <button type="button" class="btn-primary" id="btn-confirm-picker" style="padding:8px 20px; font-weight:700; background:var(--accent-primary); border:none; border-radius:6px; color:#fff; cursor:pointer; font-size:0.85rem;">
                  Add Selected Items
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      const inpSearch = modalMount.querySelector('#inp-picker-search');
      const selCat = modalMount.querySelector('#sel-picker-category');
      const listContainer = modalMount.querySelector('#picker-items-list');
      const btnConfirm = modalMount.querySelector('#btn-confirm-picker');
      const btnClose = modalMount.querySelector('#btn-close-picker-modal');
      const btnCancel = modalMount.querySelector('#btn-cancel-picker');
      const btnSelectAll = modalMount.querySelector('#btn-picker-select-all');

      const renderPickerList = () => {
        const query = (inpSearch.value || '').toLowerCase().trim();
        const catFilter = selCat.value;

        const filteredCat = supCat.filter(c => {
          const itemCode = c.itemCode || c.item_code;
          const itemObj = items.find(i => (i.itemCode || i.item_code || '').toUpperCase() === (itemCode || '').toUpperCase()) || {};

          if (catFilter !== 'ALL') {
            const itemCatCode = (itemObj.categoryCode || itemObj.category_code || '').toUpperCase();
            if (itemCatCode !== catFilter.toUpperCase()) return false;
          }

          if (query) {
            const matchCode = itemCode.toLowerCase().includes(query);
            const matchName = (itemObj.itemName || c.supplierItemName || '').toLowerCase().includes(query);
            const matchSku = (c.supplierSku || '').toLowerCase().includes(query);
            if (!matchCode && !matchName && !matchSku) return false;
          }
          return true;
        });

        if (filteredCat.length === 0) {
          listContainer.innerHTML = `<div style="text-align:center; padding:32px; color:var(--text-muted); font-size:0.85rem;">No items match the search filter.</div>`;
          return;
        }

        listContainer.innerHTML = filteredCat.map(c => {
          const itemCode = c.itemCode || c.item_code;
          const itemObj = items.find(i => (i.itemCode || i.item_code || '').toUpperCase() === (itemCode || '').toUpperCase()) || {};
          const isChecked = selectedItemCodes.has(itemCode);
          const price = parseFloat(c.unitPrice !== undefined ? c.unitPrice : (c.unit_price || 0));
          const uom = c.purchaseUom || c.purchase_uom || itemObj.purchaseUom || 'KG';

          return `
            <label style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:6px; cursor:pointer; transition:all 0.15s ease;">
              <div style="display:flex; align-items:center; gap:12px;">
                <input type="checkbox" class="chk-picker-item" value="${itemCode}" ${isChecked ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer; accent-color:var(--accent-primary);" />
                <div>
                  <div style="font-weight:700; color:var(--text-main); font-size:0.9rem;">${itemObj.itemName || itemObj.item_name || c.supplierItemName || itemCode}</div>
                  <div style="font-size:0.75rem; font-family:monospace; color:var(--accent-primary);">
                    ${itemCode} ${c.supplierSku ? `• SKU: ${c.supplierSku}` : ''}
                  </div>
                </div>
              </div>
              <div style="font-weight:700; color:var(--status-success); font-size:0.9rem;">
                ₹${price.toLocaleString('en-IN')} / ${uom}
              </div>
            </label>
          `;
        }).join('');

        // Wire checkboxes
        listContainer.querySelectorAll('.chk-picker-item').forEach(chk => {
          chk.addEventListener('change', (e) => {
            if (e.target.checked) {
              selectedItemCodes.add(e.target.value);
            } else {
              selectedItemCodes.delete(e.target.value);
            }
            btnConfirm.textContent = `Add ${selectedItemCodes.size} ${selectedItemCodes.size === 1 ? 'Item' : 'Items'}`;
          });
        });
      };

      btnConfirm.textContent = `Add ${selectedItemCodes.size} ${selectedItemCodes.size === 1 ? 'Item' : 'Items'}`;

      inpSearch.addEventListener('input', renderPickerList);
      selCat.addEventListener('change', renderPickerList);
      renderPickerList();

      btnSelectAll.addEventListener('click', () => {
        supCat.forEach(c => selectedItemCodes.add(c.itemCode || c.item_code));
        renderPickerList();
        btnConfirm.textContent = `Add ${selectedItemCodes.size} Items`;
      });

      const closeModal = () => { modalMount.innerHTML = ''; };
      btnClose.addEventListener('click', closeModal);
      btnCancel.addEventListener('click', closeModal);

      btnConfirm.addEventListener('click', () => {
        // Merge selected items into poBasket
        selectedItemCodes.forEach(code => {
          if (!poBasket.some(b => b.itemCode === code)) {
            const catRecord = supCat.find(c => (c.itemCode || c.item_code) === code) || {};
            const itemObj = items.find(i => (i.itemCode || i.item_code || '').toUpperCase() === code.toUpperCase()) || {};
            const price = parseFloat(catRecord.unitPrice !== undefined ? catRecord.unitPrice : (catRecord.unit_price || 0));
            const uom = catRecord.purchaseUom || catRecord.purchase_uom || itemObj.purchaseUom || 'KG';

            poBasket.push({
              itemCode: code,
              itemName: itemObj.itemName || itemObj.item_name || catRecord.supplierItemName || code,
              supplierSku: catRecord.supplierSku || catRecord.supplier_sku || '',
              quantity: 10, // Default PO order quantity
              uom,
              catalogueUnitPrice: price,
              poUnitPrice: price,
              priceOverride: false,
              lineTotal: 10 * price
            });
          }
        });

        // Remove any deselected items from basket
        poBasket = poBasket.filter(b => selectedItemCodes.has(b.itemCode));

        closeModal();
        renderOrderItemsTable();
        updateSummarySidebar();
      });
    };

    // Wire Add Items button
    const btnOpenPicker = mount.querySelector('#btn-open-item-picker');
    if (btnOpenPicker) btnOpenPicker.addEventListener('click', () => openItemPickerModal());

    // Save PO Submission Handler (Draft or Active PO)
    const submitPO = async (status = 'APPROVED') => {
      if (poBasket.length === 0) {
        alert('❌ Please add at least 1 item to the Purchase Order.');
        return;
      }

      const supplierCode = selSup.value;
      const destinationLocationCode = selLoc.value;
      const deliveryDate = mount.querySelector('#po-delivery-date').value;
      const notes = mount.querySelector('#po-notes').value || '';
      const paymentTerms = mount.querySelector('#po-payment-terms').value;
      const supObj = getSelectedSupplierObj();

      const totalAmount = poBasket.reduce((sum, b) => sum + (b.quantity * b.poUnitPrice), 0);
      const poNumber = `PO-${Date.now().toString().substring(7)}`;

      const newPo = {
        id: `po-${Date.now()}`,
        tenantId,
        tenant_id: tenantId,
        poNumber,
        po_number: poNumber,
        supplierCode,
        supplier_code: supplierCode,
        supplierName: supObj.supplierName || supObj.supplier_name || supplierCode,
        destinationLocationCode,
        destination_location_code: destinationLocationCode,
        orderDate: new Date().toISOString().split('T')[0],
        order_date: new Date().toISOString().split('T')[0],
        expectedDeliveryDate: deliveryDate,
        notes,
        paymentTerms,
        grandTotal: totalAmount,
        grand_total: totalAmount,
        totalItems: poBasket.length,
        lines: poBasket.map(b => ({
          itemCode: b.itemCode,
          itemName: b.itemName,
          supplierSku: b.supplierSku,
          quantity: b.quantity,
          uom: b.uom,
          catalogueUnitPrice: b.catalogueUnitPrice,
          poUnitPrice: b.poUnitPrice,
          priceOverride: b.priceOverride,
          lineTotal: b.lineTotal
        })),
        status
      };

      const gw = this._getDataGateway();
      if (gw) await gw.create('purchase_orders', newPo);

      alert(`🎉 Purchase Order ${poNumber} (${status}) Created Successfully!\n${poBasket.length} Lines | Total: ₹${totalAmount.toLocaleString('en-IN', {minimumFractionDigits: 2})}`);
      this.activeSubView = 'inv-po';
      const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
      this.render(targetMount, session);
    };

    mount.querySelector('#btn-po-create-submit').addEventListener('click', () => submitPO('APPROVED'));
    mount.querySelector('#btn-po-draft-submit').addEventListener('click', () => submitPO('DRAFT'));
  }

  // --- 8B. PO DETAIL DRAWER ---

  openPODetailDrawer(poId, tenantId, mount, session) {
    const po = purchasingModel.getPurchaseOrderById(poId, tenantId);
    if (!po) {
      alert(`❌ Purchase Order ${poId} not found.`);
      return;
    }

    const existingOverlay = document.querySelector('#po-detail-drawer-overlay');
    if (existingOverlay) existingOverlay.remove();

    const lines = po.lines || [];

    let statusBadgeClass = 'badge-info';
    if (po.status === 'DRAFT') statusBadgeClass = 'badge-secondary';
    else if (po.status === 'APPROVED') statusBadgeClass = 'badge-primary';
    else if (po.status === 'PARTIALLY_RECEIVED') statusBadgeClass = 'badge-warning';
    else if (po.status === 'FULLY_RECEIVED') statusBadgeClass = 'badge-success';

    const overlay = document.createElement('div');
    overlay.id = 'po-detail-drawer-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(4px);
      display: flex; justify-content: flex-end; z-index: 99999;
      animation: fadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
      <div style="background:var(--bg-surface-1); border-left:1px solid var(--border-subtle); width:100%; max-width:680px; height:100vh; display:flex; flex-direction:column; box-shadow:-8px 0 32px rgba(0,0,0,0.5);">
        <!-- Header -->
        <div style="padding:20px 24px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-2);">
          <div>
            <div style="display:flex; align-items:center; gap:10px;">
              <h3 style="margin:0; font-size:1.4rem; color:var(--text-main); font-family:monospace;">${po.poNumber || po.po_number || po.id}</h3>
              <span class="badge ${statusBadgeClass}" style="font-size:0.8rem; font-weight:700;">${po.status}</span>
            </div>
            <div style="font-size:0.85rem; color:var(--accent-primary); font-weight:700; margin-top:4px;">
              ${po.supplierName || po.supplier_name} (${po.supplierCode || po.supplier_code})
            </div>
          </div>
          <button type="button" id="btn-close-po-drawer" style="background:none; border:none; font-size:1.6rem; color:var(--text-muted); cursor:pointer; padding:4px 8px;">✕</button>
        </div>

        <!-- PO Metadata Grid -->
        <div style="padding:16px 24px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; font-size:0.85rem;">
          <div>
            <span style="color:var(--text-muted); display:block; font-size:0.75rem;">Destination Store</span>
            <strong style="color:var(--text-main);">${po.destinationLocationCode || po.destination_location_code}</strong>
          </div>
          <div>
            <span style="color:var(--text-muted); display:block; font-size:0.75rem;">Expected Delivery</span>
            <strong style="color:var(--text-main);">${po.expectedDeliveryDate || 'N/A'}</strong>
          </div>
          <div>
            <span style="color:var(--text-muted); display:block; font-size:0.75rem;">Payment Terms</span>
            <strong style="color:var(--text-main);">${po.paymentTerms || 'Supplier Default'}</strong>
          </div>
        </div>

        <!-- Lines Breakdown Table -->
        <div style="padding:20px 24px; flex:1; overflow-y:auto;">
          <h4 style="margin-top:0; margin-bottom:12px; font-size:1rem; color:var(--text-main);">ORDERED LINES & RECEIVING PROGRESS</h4>
          <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                <th style="padding:8px;">Item</th>
                <th style="padding:8px; text-align:center;">Ordered</th>
                <th style="padding:8px; text-align:center;">Received</th>
                <th style="padding:8px; text-align:center;">Remaining</th>
                <th style="padding:8px; text-align:right;">PO Price</th>
                <th style="padding:8px; text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${lines.map(line => {
                const lineTotal = (line.orderedQty || line.quantity || 0) * (line.poUnitPrice || line.catalogueUnitPrice || 0);
                const isDone = (line.remainingQty || 0) <= 0;
                return `
                  <tr style="border-bottom:1px solid var(--border-subtle); ${isDone ? 'opacity:0.6;' : ''}">
                    <td style="padding:10px;">
                      <div style="font-weight:700; color:var(--text-main);">${line.itemName || line.itemCode}</div>
                      <div style="font-size:0.75rem; font-family:monospace; color:var(--accent-primary);">${line.itemCode}</div>
                    </td>
                    <td style="padding:10px; text-align:center; font-weight:700;">${line.orderedQty || line.quantity} ${line.uom || 'KG'}</td>
                    <td style="padding:10px; text-align:center; color:var(--status-success); font-weight:700;">${line.previouslyReceivedQty || 0}</td>
                    <td style="padding:10px; text-align:center; color:${isDone ? 'var(--text-muted)' : 'var(--status-warning)'}; font-weight:700;">${line.remainingQty !== undefined ? line.remainingQty : (line.orderedQty || line.quantity)}</td>
                    <td style="padding:10px; text-align:right; font-family:monospace;">₹${(line.poUnitPrice || line.catalogueUnitPrice || 0).toFixed(2)}</td>
                    <td style="padding:10px; text-align:right; font-weight:700; font-family:monospace;">₹${lineTotal.toFixed(2)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Footer Actions -->
        <div style="padding:16px 24px; border-top:1px solid var(--border-subtle); background:var(--bg-surface-2); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <span style="font-size:0.8rem; color:var(--text-muted);">Grand Total:</span>
            <span style="font-size:1.4rem; font-weight:800; color:var(--status-success); margin-left:6px;">₹${(po.grandTotal || po.grand_total || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <!-- Share PO Dropdown Menu -->
            <div style="position:relative; display:inline-block;">
              <button type="button" id="btn-share-po-dropdown" class="btn-primary" style="padding:8px 14px; font-weight:700; background:var(--accent-primary); border:none; border-radius:6px; color:#fff; cursor:pointer; display:flex; align-items:center; gap:6px;">
                <span>📲 Share PO</span> <span style="font-size:0.7rem;">▼</span>
              </button>
              <div id="po-share-menu" style="display:none; position:absolute; bottom:100%; right:0; margin-bottom:6px; width:220px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.5); z-index:100000; overflow:hidden;">
                <button type="button" id="btn-share-whatsapp" style="width:100%; text-align:left; padding:10px 14px; background:none; border:none; border-bottom:1px solid var(--border-subtle); color:var(--text-main); font-weight:600; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; gap:8px;">
                  <span>💬</span> Share via WhatsApp
                </button>
                <button type="button" id="btn-copy-po-msg" style="width:100%; text-align:left; padding:10px 14px; background:none; border:none; border-bottom:1px solid var(--border-subtle); color:var(--text-main); font-weight:600; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; gap:8px;">
                  <span>📋</span> Copy Message
                </button>
                <button type="button" id="btn-print-po" style="width:100%; text-align:left; padding:10px 14px; background:none; border:none; border-bottom:1px solid var(--border-subtle); color:var(--text-main); font-weight:600; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; gap:8px;">
                  <span>🖨️</span> Print PO Document
                </button>
                <button type="button" id="btn-download-po-summary" style="width:100%; text-align:left; padding:10px 14px; background:none; border:none; color:var(--text-main); font-weight:600; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; gap:8px;">
                  <span>📥</span> Download PO Summary
                </button>
              </div>
            </div>

            <button type="button" id="btn-close-po-drawer-btn" class="btn-secondary" style="padding:8px 16px; border-radius:6px; cursor:pointer;">Close</button>
            ${po.status === 'APPROVED' ? `
              <button type="button" id="btn-drawer-receive-goods" class="btn-primary" style="padding:8px 18px; font-weight:700; background:var(--status-success); border:none; border-radius:6px; color:#fff; cursor:pointer;">
                📦 Receive Goods
              </button>
            ` : ''}
            ${po.status === 'PARTIALLY_RECEIVED' ? `
              <button type="button" id="btn-drawer-receive-goods" class="btn-primary" style="padding:8px 18px; font-weight:700; background:var(--status-warning); border:none; border-radius:6px; color:#fff; cursor:pointer;">
                📦 Receive Remaining
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeDrawer = () => { overlay.remove(); };
    overlay.querySelector('#btn-close-po-drawer').addEventListener('click', closeDrawer);
    overlay.querySelector('#btn-close-po-drawer-btn').addEventListener('click', closeDrawer);

    // Share Dropdown Logic
    const btnShareDropdown = overlay.querySelector('#btn-share-po-dropdown');
    const shareMenu = overlay.querySelector('#po-share-menu');
    btnShareDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      shareMenu.style.display = shareMenu.style.display === 'none' ? 'block' : 'none';
    });

    overlay.addEventListener('click', () => {
      if (shareMenu) shareMenu.style.display = 'none';
    });

    const waMsg = purchasingModel.generateWhatsAppPoMessage(po);

    overlay.querySelector('#btn-share-whatsapp').addEventListener('click', () => {
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(waMsg)}`;
      window.open(waUrl, '_blank');
    });

    overlay.querySelector('#btn-copy-po-msg').addEventListener('click', () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(waMsg);
        alert(`📋 WhatsApp message for ${po.poNumber || po.id} copied to clipboard!`);
      } else {
        alert(waMsg);
      }
    });

    overlay.querySelector('#btn-print-po').addEventListener('click', () => {
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.write(`
          <html>
            <head><title>Purchase Order ${po.poNumber || po.id}</title></head>
            <body style="font-family:monospace; padding:30px; white-space:pre-wrap;">${waMsg}</body>
          </html>
        `);
        printWin.document.close();
        printWin.print();
      }
    });

    overlay.querySelector('#btn-download-po-summary').addEventListener('click', () => {
      this._triggerDownload(waMsg, `PO_${po.poNumber || po.id}.txt`);
    });

    const btnReceive = overlay.querySelector('#btn-drawer-receive-goods');
    if (btnReceive) {
      btnReceive.addEventListener('click', () => {
        closeDrawer();
        this.activeSubView = 'inv-grn-create';
        this.targetPoForGrn = po.id;
        this.render(mount, session);
      });
    }
  }

  // --- 8B2. GRN DETAIL DRAWER ---

  openGRNDetailDrawer(grnId, tenantId, mount, session) {
    const grns = offlineStore.getCollection('goods_received_notes') || offlineStore.getCollection('goods_receipt_notes') || [];
    const grn = grns.find(g => g.id === grnId || g.grnNumber === grnId || g.grn_number === grnId);

    if (!grn) {
      alert(`❌ Goods Received Note ${grnId} not found.`);
      return;
    }

    const existingOverlay = document.querySelector('#grn-detail-drawer-overlay');
    if (existingOverlay) existingOverlay.remove();

    const lines = grn.lines || grn.receivedItems || [];
    const poNum = grn.poNumber || grn.po_number || grn.poId || 'Direct GRN';
    const dcNum = grn.deliveryChallanNo || grn.delivery_challan_no || 'N/A';
    const invStatus = grn.invoiceStatus || grn.invoice_status || (grn.supplierInvoiceNo && grn.supplierInvoiceNo !== 'NOT_RECEIVED' ? 'RECEIVED' : 'NOT_RECEIVED');
    const isInvPending = invStatus === 'NOT_RECEIVED';

    const overlay = document.createElement('div');
    overlay.id = 'grn-detail-drawer-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(4px);
      display: flex; justify-content: flex-end; z-index: 99999;
      animation: fadeIn 0.2s ease-out;
    `;

    let totalAcceptedQty = 0;
    let totalRejectedQty = 0;
    lines.forEach(l => {
      totalAcceptedQty += parseFloat(l.acceptedQty !== undefined ? l.acceptedQty : l.receivedQty || 0);
      totalRejectedQty += parseFloat(l.rejectedQty !== undefined ? l.rejectedQty : 0);
    });

    overlay.innerHTML = `
      <div style="background:var(--bg-surface-1); border-left:1px solid var(--border-subtle); width:100%; max-width:680px; height:100vh; display:flex; flex-direction:column; box-shadow:-8px 0 32px rgba(0,0,0,0.5);">
        <!-- Header -->
        <div style="padding:20px 24px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-2);">
          <div>
            <div style="display:flex; align-items:center; gap:10px;">
              <h3 style="margin:0; font-size:1.4rem; color:var(--text-main); font-family:monospace;">${grn.grnNumber || grn.id}</h3>
              <span class="badge badge-success" style="font-size:0.8rem; font-weight:700;">POSTED ✓</span>
            </div>
            <div style="font-size:0.85rem; color:var(--accent-primary); font-weight:700; margin-top:4px;">
              ${grn.supplierName || grn.supplier_name || 'Vendor'} • PO: ${poNum}
            </div>
          </div>
          <button type="button" id="btn-close-grn-drawer" style="background:none; border:none; font-size:1.6rem; color:var(--text-muted); cursor:pointer; padding:4px 8px;">✕</button>
        </div>

        <!-- Document Status Cards -->
        <div style="padding:16px 24px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:grid; grid-template-columns:1fr 1fr; gap:16px; font-size:0.85rem;">
          <div style="background:var(--bg-surface-1); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
            <span style="color:var(--text-muted); display:block; font-size:0.75rem; font-weight:700;">Delivery Document</span>
            <strong style="color:var(--text-main); font-family:monospace; font-size:0.95rem;">DC #: ${dcNum}</strong>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Received on ${grn.receiptDate || grn.receivedDate || 'N/A'}</div>
          </div>
          <div style="background:var(--bg-surface-1); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
            <span style="color:var(--text-muted); display:block; font-size:0.75rem; font-weight:700;">Supplier Invoice</span>
            <div style="margin-top:2px;">
              <span class="badge ${isInvPending ? 'badge-warning' : 'badge-success'}" style="font-size:0.8rem; font-weight:700;">
                ${isInvPending ? '⚠ Invoice Pending (NOT_RECEIVED)' : `✓ Invoice #${grn.supplierInvoiceNo || grn.supplier_invoice_no}`}
              </span>
            </div>
            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">
              ${isInvPending ? 'Physical receipt complete. Awaiting vendor invoice upload from Accounting.' : 'Verified & Matched'}
            </div>
          </div>
        </div>

        <!-- Lines Breakdown Table -->
        <div style="padding:20px 24px; flex:1; overflow-y:auto;">
          <h4 style="margin-top:0; margin-bottom:12px; font-size:1rem; color:var(--text-main);">PHYSICAL RECEIPT BREAKDOWN</h4>
          <table class="data-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                <th style="padding:8px;">Item</th>
                <th style="padding:8px; text-align:center;">Ordered</th>
                <th style="padding:8px; text-align:center;">Received</th>
                <th style="padding:8px; text-align:center;">Accepted</th>
                <th style="padding:8px; text-align:center;">Rejected</th>
                <th style="padding:8px; text-align:right;">Actual Price</th>
                <th style="padding:8px; text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${lines.map(line => {
                const recQty = parseFloat(line.receivedQty !== undefined ? line.receivedQty : (line.quantity || 0));
                const accQty = parseFloat(line.acceptedQty !== undefined ? line.acceptedQty : recQty);
                const rejQty = parseFloat(line.rejectedQty !== undefined ? line.rejectedQty : 0);
                const actPrice = parseFloat(line.actualInvoicePrice !== undefined ? line.actualInvoicePrice : (line.unitCost || 0));
                const lineTotal = line.lineTotal || (accQty * actPrice);

                return `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:10px;">
                      <div style="font-weight:700; color:var(--text-main);">${line.itemName || line.itemCode}</div>
                      <div style="font-size:0.75rem; font-family:monospace; color:var(--accent-primary);">${line.itemCode}</div>
                    </td>
                    <td style="padding:10px; text-align:center; font-weight:600;">${line.orderedQty !== undefined ? line.orderedQty : recQty} ${line.uom || 'KG'}</td>
                    <td style="padding:10px; text-align:center; font-weight:700;">${recQty}</td>
                    <td style="padding:10px; text-align:center; color:var(--status-success); font-weight:700;">${accQty}</td>
                    <td style="padding:10px; text-align:center; color:${rejQty > 0 ? 'var(--status-danger)' : 'var(--text-muted)'}; font-weight:700;">${rejQty}</td>
                    <td style="padding:10px; text-align:right; font-family:monospace;">₹${actPrice.toFixed(2)}</td>
                    <td style="padding:10px; text-align:right; font-weight:700; font-family:monospace;">₹${lineTotal.toFixed(2)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <!-- Stock Balance Audit Callout -->
          <div style="margin-top:20px; padding:12px 16px; background:rgba(16,185,129,0.1); border:1px solid var(--status-success); border-radius:6px; font-size:0.82rem; color:var(--status-success); font-weight:600; display:flex; align-items:center; gap:8px;">
            <span>✓</span> Accepted quantity (${totalAcceptedQty} units across ${lines.length} lines) posted to Stock Balances at store location: <strong>${grn.destinationLocationCode || grn.receivingLocationCode || 'Store'}</strong>.
          </div>
        </div>

        <!-- Footer Actions -->
        <div style="padding:16px 24px; border-top:1px solid var(--border-subtle); background:var(--bg-surface-2); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <span style="font-size:0.8rem; color:var(--text-muted);">Total Received Value:</span>
            <span style="font-size:1.4rem; font-weight:800; color:var(--status-success); margin-left:6px;">₹${(parseFloat(grn.totalReceivedValue || grn.supplierInvoiceTotal) || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
          </div>
          <div style="display:flex; gap:10px;">
            <button type="button" id="btn-close-grn-drawer-btn" class="btn-secondary" style="padding:8px 16px; border-radius:6px; cursor:pointer;">Close</button>
            ${grn.poId ? `
              <button type="button" id="btn-view-linked-po" class="btn-secondary" style="padding:8px 16px; font-weight:700; border-radius:6px; cursor:pointer; background:var(--bg-surface-1); border:1px solid var(--border-subtle); color:var(--accent-primary);">
                👁 View Linked PO (${poNum})
              </button>
            ` : ''}
            ${isInvPending ? `
              <button type="button" id="btn-attach-grn-invoice" class="btn-primary" style="padding:8px 18px; font-weight:700; background:var(--accent-primary); border:none; border-radius:6px; color:#fff; cursor:pointer;">
                📄 Attach Supplier Invoice
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeDrawer = () => { overlay.remove(); };
    overlay.querySelector('#btn-close-grn-drawer').addEventListener('click', closeDrawer);
    overlay.querySelector('#btn-close-grn-drawer-btn').addEventListener('click', closeDrawer);

    const btnViewPo = overlay.querySelector('#btn-view-linked-po');
    if (btnViewPo && grn.poId) {
      btnViewPo.addEventListener('click', () => {
        closeDrawer();
        this.openPODetailDrawer(grn.poId, tenantId, mount, session);
      });
    }

    const btnAttachInv = overlay.querySelector('#btn-attach-grn-invoice');
    if (btnAttachInv) {
      btnAttachInv.addEventListener('click', () => {
        const invNo = prompt(`Enter Supplier Tax Invoice Number for GRN ${grn.grnNumber || grn.id}:`);
        if (invNo && invNo.trim()) {
          purchasingModel.updateGrnInvoiceStatus(grn.id, { invoiceNo: invNo.trim(), invoiceStatus: 'RECEIVED' }, tenantId);
          alert(`🎉 Invoice ${invNo.trim()} attached to GRN ${grn.grnNumber || grn.id}!`);
          closeDrawer();
          this.render(mount, session);
        }
      });
    }
  }

  // --- 8C. REDESIGNED GOODS RECEIVING STUDIO (GRN) ---

  renderPostGrnFormScreen(mount, tenantId, items, suppliers, locations, session) {
    const pos = purchasingModel.getCollection ? purchasingModel._getCollection('purchase_orders', tenantId) : (this._getCollection('purchase_orders', tenantId) || []);
    const activePos = pos.filter(p => p.status === 'APPROVED' || p.status === 'PARTIALLY_RECEIVED');

    let isDirectGRN = false;
    let selectedPoId = this.targetPoForGrn || (activePos.length ? (activePos[0].id || activePos[0].poNumber) : null);
    this.targetPoForGrn = null; // Clear single-use target

    const defaultInvoiceNo = `INV-2026-${Date.now().toString().substring(8)}`;
    const defaultChallanNo = `DC-2026-${Date.now().toString().substring(8)}`;
    const defaultReceiptDate = new Date().toISOString().split('T')[0];

    const renderGrnWorkspace = () => {
      let po = null;
      if (!isDirectGRN && selectedPoId) {
        po = purchasingModel.getPurchaseOrderById(selectedPoId, tenantId);
      }

      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px; max-width:1280px; margin:0 auto;">
          <!-- Top Navigation Header -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <button class="btn-secondary nav-inv-btn" data-tab="inv-grn" style="font-weight:700; padding:8px 14px; border-radius:6px; cursor:pointer; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                ← Back to Goods Receiving
              </button>
              <div style="font-size:0.85rem; font-weight:700; color:var(--text-muted);">🚚 Goods Receipt Note (GRN) Studio</div>
            </div>
            
            <!-- Flow Toggle Buttons -->
            <div style="display:flex; background:var(--bg-surface-2); padding:4px; border-radius:8px; border:1px solid var(--border-subtle);">
              <button type="button" id="btn-mode-po-grn" style="padding:6px 14px; font-size:0.8rem; font-weight:700; border-radius:6px; border:none; cursor:pointer; ${!isDirectGRN ? 'background:var(--accent-primary); color:#fff;' : 'background:transparent; color:var(--text-muted);'}">
                📦 Receive Against PO (Recommended)
              </button>
              <button type="button" id="btn-mode-direct-grn" style="padding:6px 14px; font-size:0.8rem; font-weight:700; border-radius:6px; border:none; cursor:pointer; ${isDirectGRN ? 'background:var(--status-warning); color:#fff;' : 'background:transparent; color:var(--text-muted);'}">
                ⚡ Direct GRN (Exception)
              </button>
            </div>
          </div>

          <div style="margin-bottom:20px;">
            <h3 style="margin:0; color:var(--status-success); font-size:1.5rem;">📥 Post Goods Receipt Note (GRN)</h3>
            <p style="color:var(--text-muted); font-size:0.85rem; margin-top:4px;">
              ${!isDirectGRN ? 'Physical receipt of goods against an approved Purchase Order. Accepted quantities update live store balances and Weighted Average Cost (WAC).' : 'Emergency stock receipt without a Purchase Order. Requires explicit audit justification.'}
            </p>
          </div>

          ${!isDirectGRN ? `
            <!-- PO Selector Card -->
            <div style="background:var(--bg-surface-2); padding:16px 20px; border-radius:8px; border:1px solid var(--border-subtle); margin-bottom:20px;">
              <label style="display:block; font-size:0.85rem; font-weight:700; color:var(--text-main); margin-bottom:6px;">Select Approved Purchase Order *</label>
              <select id="grn-po-selector" style="width:100%; padding:10px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main); font-weight:700; font-size:0.9rem;">
                ${activePos.length ? activePos.map(p => {
                  const poId = p.id || p.poNumber;
                  const isSel = poId === selectedPoId;
                  return `<option value="${poId}" ${isSel ? 'selected' : ''}>${p.poNumber || p.po_number} • ${p.supplierName || p.supplier_name} (${p.destinationLocationCode || p.destination_location_code}) • Status: ${p.status}</option>`;
                }).join('') : `<option value="">No Active Purchase Orders Available for Receiving</option>`}
              </select>
            </div>
          ` : ''}

          <!-- Header Metadata Card -->
          <div style="background:var(--bg-surface-2); padding:16px 20px; border-radius:8px; border:1px solid var(--border-subtle); margin-bottom:24px;">
            <div style="display:grid; grid-template-columns:1.2fr 1.2fr 1fr 1fr 1fr; gap:14px; align-items:start;">
              <div>
                <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">Delivery Challan / DC # *</label>
                <input type="text" id="grn-challan-no" value="${defaultChallanNo}" placeholder="e.g. DC-7788" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main); font-weight:700; font-family:monospace;" />
              </div>

              <div>
                <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">Supplier Invoice Status</label>
                <div style="display:flex; gap:12px; margin-top:8px; font-size:0.82rem; font-weight:600;">
                  <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
                    <input type="radio" name="grn-inv-opt" id="opt-inv-yes" value="RECEIVED" checked />
                    <span>Received</span>
                  </label>
                  <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
                    <input type="radio" name="grn-inv-opt" id="opt-inv-no" value="NOT_RECEIVED" />
                    <span style="color:var(--status-warning);">Not Received</span>
                  </label>
                </div>
              </div>

              <div id="box-inv-no">
                <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">Invoice # *</label>
                <input type="text" id="grn-invoice-no" value="${defaultInvoiceNo}" placeholder="e.g. INV-2026-88" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main); font-weight:700; font-family:monospace;" />
              </div>

              <div>
                <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">Receipt Date *</label>
                <input type="date" id="grn-receipt-date" value="${defaultReceiptDate}" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main); font-weight:600;" />
              </div>

              <div>
                <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">Received By</label>
                <input type="text" id="grn-received-by" value="${(session && session.employeeName) || 'Store Manager'}" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main);" />
              </div>
            </div>

            ${isDirectGRN ? `
              <div style="margin-top:16px; border-top:1px solid var(--border-subtle); padding-top:12px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
                <div>
                  <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">Supplier *</label>
                  <select id="grn-direct-sup" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main);">
                    ${suppliers.map(s => `<option value="${s.supplierCode || s.supplier_code}">${s.supplierName || s.supplier_name}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">Destination Location *</label>
                  <select id="grn-direct-loc" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main);">
                    ${locations.map(l => `<option value="${l.locationCode || l.location_code}">${l.locationName || l.location_name}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--status-warning); margin-bottom:4px;">Reason for Direct GRN *</label>
                  <input type="text" id="grn-direct-reason" placeholder="Emergency delivery without PO..." style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-main);" />
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Validation Warning Banner Mount -->
          <div id="grn-validation-banner"></div>

          <!-- Main Grid: Items Table (Left) & Receiving Summary (Right) -->
          <div style="display:grid; grid-template-columns:1fr 320px; gap:24px; align-items:start;">
            <!-- Left Column: Items Grid -->
            <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:8px; padding:16px;">
              <h4 style="margin-top:0; margin-bottom:12px; font-size:1.1rem; color:var(--text-main);">ITEMS TO RECEIVE</h4>

              ${!isDirectGRN && po ? `
                <div class="table-responsive">
                  <table class="data-table" id="table-grn-po-items" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                    <thead>
                      <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; background:var(--bg-surface-2);">
                        <th style="padding:8px;">Item</th>
                        <th style="padding:8px; width:65px; text-align:center;">Ordered</th>
                        <th style="padding:8px; width:65px; text-align:center;">Prev Rec.</th>
                        <th style="padding:8px; width:75px; text-align:center;">Remaining</th>
                        <th style="padding:8px; width:80px; text-align:center;">Rec. Now</th>
                        <th style="padding:8px; width:75px; text-align:center;">Accepted</th>
                        <th style="padding:8px; width:70px; text-align:center;">Rejected</th>
                        <th style="padding:8px; width:90px; text-align:right;">PO Price</th>
                        <th style="padding:8px; width:130px;">Actual Invoice Price (₹)*</th>
                        <th style="padding:8px; width:110px; text-align:right;">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${(po.lines || []).map((line, idx) => {
                        const remaining = line.remainingQty !== undefined ? line.remainingQty : line.orderedQty;
                        const poPrice = line.poUnitPrice || line.catalogueUnitPrice || 0;
                        const isDone = remaining <= 0;

                        return `
                          <tr style="border-bottom:1px solid var(--border-subtle); ${isDone ? 'opacity:0.5;' : ''}" data-item-code="${line.itemCode}">
                            <td style="padding:8px;">
                              <div style="font-weight:700; color:var(--text-main);">${line.itemName || line.itemCode}</div>
                              <div style="font-size:0.75rem; font-family:monospace; color:var(--accent-primary);">${line.itemCode}</div>
                            </td>
                            <td style="padding:8px; text-align:center; font-weight:700;">${line.orderedQty}</td>
                            <td style="padding:8px; text-align:center; color:var(--status-success);">${line.previouslyReceivedQty || 0}</td>
                            <td style="padding:8px; text-align:center; font-weight:700; color:${isDone ? 'var(--text-muted)' : 'var(--status-warning)'};">${remaining}</td>
                            <td style="padding:8px;">
                              <input type="number" class="inp-grn-rec-now" data-idx="${idx}" data-remaining="${remaining}" value="${remaining}" min="0" max="${remaining}" ${isDone ? 'disabled' : ''} style="width:70px; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); text-align:center; font-weight:700; background:var(--bg-surface-2); color:var(--text-main);" />
                            </td>
                            <td style="padding:8px;">
                              <input type="number" class="inp-grn-accepted" data-idx="${idx}" value="${remaining}" min="0" ${isDone ? 'disabled' : ''} style="width:65px; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); text-align:center; font-weight:700; background:var(--bg-surface-2); color:var(--status-success);" />
                            </td>
                            <td style="padding:8px;">
                              <input type="number" class="inp-grn-rejected" data-idx="${idx}" value="0" min="0" ${isDone ? 'disabled' : ''} style="width:60px; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); text-align:center; font-weight:700; background:var(--bg-surface-2); color:var(--status-danger);" />
                            </td>
                            <td style="padding:8px; text-align:right; font-family:monospace; color:var(--text-muted);">
                              ₹${poPrice.toFixed(2)}
                            </td>
                            <td style="padding:8px;">
                              <input type="number" class="inp-grn-actual-price" data-idx="${idx}" data-poprice="${poPrice}" value="${poPrice}" min="0.01" step="0.01" ${isDone ? 'disabled' : ''} style="width:90px; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); font-weight:700; background:var(--bg-surface-2); color:var(--status-success);" />
                              <div class="variance-badge-container" style="font-size:0.68rem; font-weight:700; color:var(--text-muted); margin-top:2px;">
                                ✓ No variance
                              </div>
                            </td>
                            <td style="padding:8px; text-align:right; font-weight:700; font-family:monospace;" class="td-line-total">
                              ₹${(remaining * poPrice).toFixed(2)}
                            </td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              ` : `
                <div style="text-align:center; padding:36px; background:var(--bg-surface-2); border-radius:8px;">
                  <div style="font-size:1.8rem; margin-bottom:8px;">📦</div>
                  <div style="font-weight:700; color:var(--text-main);">No Purchase Order Selected</div>
                  <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">Please select an active Purchase Order above or switch to Direct GRN.</div>
                </div>
              `}
            </div>

            <!-- Right Column: Receiving Summary Sidebar -->
            <div style="position:sticky; top:20px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:8px; padding:20px; display:flex; flex-direction:column; gap:16px;">
              <h4 style="margin:0; font-size:1.1rem; color:var(--text-main); border-bottom:1px solid var(--border-subtle); padding-bottom:10px;">RECEIVING SUMMARY</h4>

              <div style="display:flex; flex-direction:column; gap:8px; font-size:0.85rem;">
                <div style="display:flex; justify-content:space-between;">
                  <span style="color:var(--text-muted);">PO Lines:</span>
                  <strong id="sum-po-lines" style="color:var(--text-main);">${po ? (po.lines || []).length : 0}</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span style="color:var(--text-muted);">Fully Received:</span>
                  <strong id="sum-fully-rec" style="color:var(--status-success);">0</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span style="color:var(--text-muted);">Partial Lines:</span>
                  <strong id="sum-partial-rec" style="color:var(--status-warning);">0</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span style="color:var(--text-muted);">Total Rejected Qty:</span>
                  <strong id="sum-rejected-qty" style="color:var(--status-danger);">0</strong>
                </div>
              </div>

              <div style="border-top:1px solid var(--border-subtle); padding-top:12px;">
                <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); margin-bottom:2px;">ACCEPTED RECEIVED VALUE</div>
                <div id="sum-accepted-value" style="font-size:1.6rem; font-weight:800; color:var(--status-success);">₹0.00</div>
              </div>

              <button type="button" class="btn-primary" id="btn-post-grn-submit" style="width:100%; padding:12px; font-weight:700; background:linear-gradient(135deg, var(--status-success), #059669); color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:0.95rem; box-shadow:0 4px 12px rgba(5,150,105,0.25);">
                🚀 Post GRN to Stock Ledger
              </button>
            </div>
          </div>
        </div>
      `;

      // Mode switch listeners
      const btnModePo = mount.querySelector('#btn-mode-po-grn');
      const btnModeDir = mount.querySelector('#btn-mode-direct-grn');
      if (btnModePo) btnModePo.addEventListener('click', () => { isDirectGRN = false; renderGrnWorkspace(); });
      if (btnModeDir) btnModeDir.addEventListener('click', () => { isDirectGRN = true; renderGrnWorkspace(); });

      // PO Selector listener
      const poSel = mount.querySelector('#grn-po-selector');
      if (poSel) {
        poSel.addEventListener('change', (e) => {
          selectedPoId = e.target.value;
          renderGrnWorkspace();
        });
      }

      // Inline Row Inputs listeners & dynamic calculations
      const table = mount.querySelector('#table-grn-po-items');
      if (table && po && po.lines) {
        const updateRow = (row) => {
          const inpRec = row.querySelector('.inp-grn-rec-now');
          const inpAcc = row.querySelector('.inp-grn-accepted');
          const inpRej = row.querySelector('.inp-grn-rejected');
          const inpPrice = row.querySelector('.inp-grn-actual-price');
          const tdTotal = row.querySelector('.td-line-total');
          const varBadge = row.querySelector('.variance-badge-container');

          if (!inpRec) return;

          const remaining = parseFloat(inpRec.dataset.remaining) || 0;
          let recNow = parseFloat(inpRec.value) || 0;
          let accepted = parseFloat(inpAcc.value) || 0;
          let rejected = parseFloat(inpRej.value) || 0;
          const actualPrice = parseFloat(inpPrice.value) || 0;
          const poPrice = parseFloat(inpPrice.dataset.poprice) || 0;

          // Over-receipt validation check
          const banner = mount.querySelector('#grn-validation-banner');
          if (recNow > remaining) {
            banner.innerHTML = `
              <div style="padding:10px 16px; background:rgba(239,68,68,0.15); border:1px solid var(--status-danger); border-radius:6px; color:var(--status-danger); font-weight:700; font-size:0.85rem; margin-bottom:16px;">
                🛑 Over-Receipt Blocked: Receiving Quantity (${recNow}) cannot exceed Remaining PO Quantity (${remaining}).
              </div>
            `;
          } else {
            banner.innerHTML = '';
          }

          // Balance check: accepted + rejected = recNow
          if (Math.abs((accepted + rejected) - recNow) > 0.001) {
            inpAcc.value = Math.max(0, recNow - rejected);
            accepted = parseFloat(inpAcc.value) || 0;
          }

          // Variance badge update
          const diff = actualPrice - poPrice;
          if (Math.abs(diff) > 0.01) {
            varBadge.innerHTML = `<span style="color:var(--status-warning);">⚠ ${diff > 0 ? `+₹${diff.toFixed(2)}` : `-₹${Math.abs(diff).toFixed(2)}`} variance</span>`;
          } else {
            varBadge.innerHTML = `<span style="color:var(--text-muted);">✓ No variance</span>`;
          }

          const lineTotal = accepted * actualPrice;
          tdTotal.textContent = `₹${lineTotal.toFixed(2)}`;

          updateGrnSidebar();
        };

        const updateGrnSidebar = () => {
          let fullyRecCount = 0;
          let partialCount = 0;
          let totalRejected = 0;
          let totalAcceptedValue = 0;

          table.querySelectorAll('tbody tr').forEach(tr => {
            const inpRec = tr.querySelector('.inp-grn-rec-now');
            const inpAcc = tr.querySelector('.inp-grn-accepted');
            const inpRej = tr.querySelector('.inp-grn-rejected');
            const inpPrice = tr.querySelector('.inp-grn-actual-price');

            if (inpRec) {
              const remaining = parseFloat(inpRec.dataset.remaining) || 0;
              const recNow = parseFloat(inpRec.value) || 0;
              const accepted = parseFloat(inpAcc.value) || 0;
              const rejected = parseFloat(inpRej.value) || 0;
              const price = parseFloat(inpPrice.value) || 0;

              totalRejected += rejected;
              totalAcceptedValue += accepted * price;

              if (recNow >= remaining && remaining > 0) fullyRecCount++;
              else if (recNow > 0) partialCount++;
            }
          });

          mount.querySelector('#sum-fully-rec').textContent = fullyRecCount;
          mount.querySelector('#sum-partial-rec').textContent = partialCount;
          mount.querySelector('#sum-rejected-qty').textContent = totalRejected;
          mount.querySelector('#sum-accepted-value').textContent = `₹${totalAcceptedValue.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
        };

        table.querySelectorAll('input').forEach(inp => {
          inp.addEventListener('input', (e) => {
            const row = e.target.closest('tr');
            if (row) updateRow(row);
          });
        });

        updateGrnSidebar();
      }

      // Invoice option radio toggle listeners
      const radInvYes = mount.querySelector('#opt-inv-yes');
      const radInvNo = mount.querySelector('#opt-inv-no');
      const boxInvNo = mount.querySelector('#box-inv-no');
      const inpInvNo = mount.querySelector('#grn-invoice-no');

      if (radInvYes && radInvNo && boxInvNo) {
        const syncInvBox = () => {
          if (radInvNo.checked) {
            boxInvNo.style.opacity = '0.5';
            inpInvNo.disabled = true;
            inpInvNo.value = 'NOT_RECEIVED';
          } else {
            boxInvNo.style.opacity = '1';
            inpInvNo.disabled = false;
            if (inpInvNo.value === 'NOT_RECEIVED') inpInvNo.value = defaultInvoiceNo;
          }
        };
        radInvYes.addEventListener('change', syncInvBox);
        radInvNo.addEventListener('change', syncInvBox);
      }

      // Submit Post GRN Handler
      const btnSubmit = mount.querySelector('#btn-post-grn-submit');
      if (btnSubmit) {
        btnSubmit.addEventListener('click', async () => {
          try {
            const challanNo = (mount.querySelector('#grn-challan-no') ? mount.querySelector('#grn-challan-no').value : '').trim();
            const hasInvoice = radInvYes ? radInvYes.checked : true;
            let invoiceNo = inpInvNo ? inpInvNo.value.trim() : '';
            if (!hasInvoice) invoiceNo = 'NOT_RECEIVED';

            const receiptDate = mount.querySelector('#grn-receipt-date').value;
            const receivedBy = mount.querySelector('#grn-received-by').value;

            if (!challanNo) {
              alert('❌ Delivery Challan Number (DC #) is required.');
              return;
            }

            if (hasInvoice && (!invoiceNo || invoiceNo === 'NOT_RECEIVED')) {
              alert('❌ Supplier Invoice Number is required when Invoice Received is selected.');
              return;
            }

            const grnLinesPayload = [];
            if (!isDirectGRN && po && table) {
              table.querySelectorAll('tbody tr').forEach(tr => {
                const itemCode = tr.dataset.itemCode;
                const inpRec = tr.querySelector('.inp-grn-rec-now');
                const inpAcc = tr.querySelector('.inp-grn-accepted');
                const inpRej = tr.querySelector('.inp-grn-rejected');
                const inpPrice = tr.querySelector('.inp-grn-actual-price');

                if (inpRec) {
                  const receivedQty = parseFloat(inpRec.value) || 0;
                  const acceptedQty = parseFloat(inpAcc.value) || 0;
                  const rejectedQty = parseFloat(inpRej.value) || 0;
                  const actualInvoicePrice = parseFloat(inpPrice.value) || 0;

                  if (receivedQty > 0 || acceptedQty > 0) {
                    grnLinesPayload.push({
                      itemCode,
                      receivedQty,
                      acceptedQty,
                      rejectedQty,
                      actualInvoicePrice
                    });
                  }
                }
              });

              if (grnLinesPayload.length === 0) {
                alert('❌ Please enter receiving quantities for at least 1 item.');
                return;
              }
            }

            const result = purchasingModel.createGoodsReceiptNote({
              poId: po ? po.id : null,
              deliveryChallanNo: challanNo,
              supplierInvoiceNo: invoiceNo,
              hasInvoice,
              invoiceStatus: hasInvoice ? 'RECEIVED' : 'NOT_RECEIVED',
              receiptDate,
              supplierInvoiceTotal: 0,
              lines: grnLinesPayload,
              isDirectGRN,
              directReason: isDirectGRN ? mount.querySelector('#grn-direct-reason').value : '',
              supplierCode: isDirectGRN ? mount.querySelector('#grn-direct-sup').value : (po ? po.supplierCode : ''),
              destinationLocationCode: isDirectGRN ? mount.querySelector('#grn-direct-loc').value : (po ? po.destinationLocationCode : ''),
              receivedBy,
              tenantId
            });

            alert(`🎉 Goods Receipt Note ${result.grn.grnNumber} Posted Successfully!\nDelivery Challan: ${challanNo}\nInvoice Status: ${hasInvoice ? 'RECEIVED' : 'NOT_RECEIVED ⚠'}\nPO Status Updated to: ${result.poStatus}`);
            this.activeSubView = 'inv-grn';
            const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
            this.render(targetMount, session);
          } catch (err) {
            console.error('[InventoryWorkspaceView] GRN Posting Error:', err);
            alert(`🛑 GRN Posting Failed: ${err.message}`);
          }
        });
      }
    };

    renderGrnWorkspace();
  }

  // --- 9. FULL-SCREEN FORM: OPENING STOCK TRANSACTION ---

  renderOpeningStockFormScreen(mount, tenantId, items, locations, session) {
    mount.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <button class="btn-secondary nav-inv-btn" data-tab="inv-live-stock" style="font-weight:700; padding:8px 16px; border-radius:6px; cursor:pointer;">
            ← Back to Live Balances
          </button>
          <div style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">⚡ Opening Stock Transaction Screen</div>
        </div>

        <h3 style="margin-top:0; color:var(--accent-primary); font-size:1.5rem;">⚡ Post Initial Opening Stock</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:20px;">
          Post baseline opening inventory to a storage location. Generates an immutable <strong>OPENING_BALANCE</strong> ledger entry.
        </p>

        <div style="display:flex; flex-direction:column; gap:16px; max-width:600px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Storage Location *</label>
              <select id="openstk-loc-sel" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2);">
                ${locations.map(l => `<option value="${l.locationCode || l.location_code}">${l.locationName || l.location_name} (${l.locationCode || l.location_code})</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Inventory Item *</label>
              <select id="openstk-item-sel" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2);">
                ${items.map(i => `<option value="${i.itemCode || i.item_code}">${i.itemName || i.item_name} (${i.itemCode || i.item_code})</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Opening Quantity *</label>
              <input type="number" id="openstk-qty" value="50" min="0.01" step="0.01" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Baseline Unit Cost (₹) *</label>
              <input type="number" id="openstk-cost" value="100" min="0" step="0.01" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
            </div>
          </div>

          <div>
            <label style="display:block; font-size:0.85rem; margin-bottom:6px; font-weight:600;">Audit Notes</label>
            <input type="text" id="openstk-notes" value="Initial Opening Stock Baseline Audit" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button class="btn-secondary nav-inv-btn" data-tab="inv-live-stock" style="padding:10px 20px;">Cancel</button>
            <button class="btn-primary" id="btn-openstk-save" style="padding:12px 24px; font-weight:700; background:linear-gradient(135deg, var(--accent-primary), #6366f1); color:#fff; border:none; border-radius:6px; cursor:pointer;">
              ⚡ Post Opening Stock to Ledger
            </button>
          </div>
        </div>
      </div>
    `;

    mount.querySelector('#btn-openstk-save').addEventListener('click', async () => {
      const locCode = mount.querySelector('#openstk-loc-sel').value;
      const itemCode = mount.querySelector('#openstk-item-sel').value;
      const qty = parseFloat(mount.querySelector('#openstk-qty').value) || 0;
      const unitCost = parseFloat(mount.querySelector('#openstk-cost').value) || 0;
      const notes = mount.querySelector('#openstk-notes').value.trim();

      if (qty <= 0) {
        alert('❌ Please enter a valid opening stock quantity.');
        return;
      }

      const itemObj = items.find(i => (i.itemCode || i.item_code) === itemCode) || {};
      const gw = this._getDataGateway();

      if (gw) {
        const balances = this._getCollection('stock_balances', tenantId);
        const existingBalance = balances.find(b => (b.itemCode === itemCode || b.item_code === itemCode) && (b.locationCode === locCode || b.location_code === locCode));

        if (existingBalance) {
          const newQty = (parseFloat(existingBalance.quantity) || 0) + qty;
          const newValuation = newQty * unitCost;
          await gw.update('stock_balances', existingBalance.id, {
            ...existingBalance,
            quantity: newQty,
            unitCost,
            valuation: newValuation,
            lastUpdatedAt: new Date().toISOString()
          });
        } else {
          await gw.create('stock_balances', {
            id: `sb-${Date.now()}`,
            tenantId,
            tenant_id: tenantId,
            itemCode,
            item_code: itemCode,
            locationCode: locCode,
            location_code: locCode,
            quantity: qty,
            unitCost,
            unit_cost: unitCost,
            valuation: qty * unitCost,
            lastUpdatedAt: new Date().toISOString()
          });
        }

        // Post OPENING_BALANCE movement ledger
        await gw.create('inventory_movements', {
          id: `mov-${Date.now()}`,
          movementId: `MOV-${Date.now().toString().substring(7)}`,
          tenantId,
          tenant_id: tenantId,
          inventoryItemId: itemCode,
          itemCode,
          item_code: itemCode,
          locationCode: locCode,
          location_code: locCode,
          movementType: 'OPENING_BALANCE',
          movement_type: 'OPENING_BALANCE',
          quantity: qty,
          unitCost,
          unit_cost: unitCost,
          totalCost: qty * unitCost,
          sourceType: 'OPENING',
          sourceId: 'OPENING-STOCK-AUDIT',
          performedBy: (session && session.userName) || 'Inventory Manager',
          notes: notes || 'Initial Opening Stock Baseline',
          createdAt: new Date().toISOString()
        });
      }

      alert(`🎉 Opening Stock posted for "${itemObj.itemName || itemCode}" (${qty} @ ₹${unitCost}) at ${locCode}!`);
      this.activeSubView = 'inv-live-stock';
      const targetMount = this.rootMount || document.querySelector('#workspace-root-mount') || mount;
      this.render(targetMount, session);
    });
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

  handleMasterInventoryExport(tenantId = 'tenant-demo') {
    const csv = inventoryImportController.exportLiveInventoryCsv(tenantId);
    this._triggerDownload(csv, `inventory_master_${tenantId}.csv`);
  }

  handleMasterInventoryTemplateDownload() {
    const csv = inventoryImportController.generateTemplateCsv();
    this._triggerDownload(csv, 'inventory_master_template.csv');
  }

  openMasterInventoryImportModal(tenantId = 'tenant-demo', session = null, parentMount = null) {
    const existingOverlay = document.querySelector('#master-inv-import-modal-overlay');
    if (existingOverlay) existingOverlay.remove();

    const existingItems = inventoryImportController._getCollection('inventory_items', tenantId);
    const existingCount = existingItems.length;

    const overlay = document.createElement('div');
    overlay.id = 'master-inv-import-modal-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(8px);
      display: flex; justify-content: center; align-items: center; z-index: 9999;
      animation: fadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
      <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:12px; width:90%; max-width:680px; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
        <!-- Modal Header -->
        <div style="padding:20px 24px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin:0; font-size:1.2rem; display:flex; align-items:center; gap:8px;">
              <span>📦</span> IMPORT INVENTORY MASTER
            </h3>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
              Canonical Pure Inventory Master Schema Import (Incremental & Atomic)
            </div>
          </div>
          <button type="button" id="btn-close-import-modal" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer; padding:4px 8px;">×</button>
        </div>

        <!-- Pipeline Steps Header -->
        <div style="padding:12px 24px; background:var(--bg-surface-1); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700;">
          <span id="step-lbl-1" style="color:var(--accent-primary);">STEP 1: Upload</span> →
          <span id="step-lbl-2" style="color:var(--text-muted);">STEP 2: Validate</span> →
          <span id="step-lbl-3" style="color:var(--text-muted);">STEP 3: Diff</span> →
          <span id="step-lbl-4" style="color:var(--text-muted);">STEP 4: Commit</span> →
          <span id="step-lbl-5" style="color:var(--text-muted);">STEP 5: Result</span>
        </div>

        <!-- Modal Body Content -->
        <div id="import-modal-body" style="padding:24px; overflow-y:auto; flex:1;">
          <!-- STEP 1: UPLOAD ZONE -->
          <div id="import-step-upload">
            <div id="drop-zone-inv-master" style="border:2px dashed var(--border-subtle); background:var(--bg-surface-2); padding:36px; text-align:center; border-radius:8px; margin-bottom:16px;">
              <div style="font-size:2.5rem; margin-bottom:8px;">📄</div>
              <div style="font-weight:700; font-size:1.05rem;">Drop inventory_master.csv here</div>
              <div style="color:var(--text-muted); font-size:0.82rem; margin:8px 0 16px 0;">or choose file from your system</div>
              <label class="btn-primary" style="padding:8px 22px; font-weight:700; cursor:pointer; display:inline-block; border-radius:6px; background:var(--accent-primary); color:#fff;">
                Choose File
                <input type="file" id="inp-inv-csv-file" accept=".csv" style="display:none;" />
              </label>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem; color:var(--text-muted);">
              <div>Existing inventory: <strong>${existingCount} items</strong></div>
              <div style="color:var(--status-info); font-weight:600;">ℹ Incremental import. Existing records will NOT be deleted.</div>
            </div>
          </div>

          <!-- DYNAMIC STEP 2/3/4 CONTAINER -->
          <div id="import-step-preview" style="display:none;"></div>
        </div>

        <!-- Modal Footer Controls -->
        <div id="import-modal-footer" style="padding:16px 24px; background:var(--bg-surface-2); border-top:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <button type="button" id="btn-cancel-modal-action" class="btn-secondary" style="padding:8px 16px; cursor:pointer; border-radius:6px;">Cancel</button>
          <div id="modal-commit-btn-slot"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const btnClose = overlay.querySelector('#btn-close-import-modal');
    const btnCancel = overlay.querySelector('#btn-cancel-modal-action');
    const closeFn = () => overlay.remove();
    if (btnClose) btnClose.addEventListener('click', closeFn);
    if (btnCancel) btnCancel.addEventListener('click', closeFn);

    const fileInput = overlay.querySelector('#inp-inv-csv-file');
    const dropZone = overlay.querySelector('#drop-zone-inv-master');

    const handleFile = async (file) => {
      if (!file) return;
      const text = await file.text();
      const rows = inventoryImportController.parseCsv(text);
      this._renderImportPreviewSteps(overlay, rows, tenantId, session, parentMount);
    };

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
      });
    }

    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent-primary)'; });
      dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--border-subtle)'; });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border-subtle)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
      });
    }
  }

  _renderImportPreviewSteps(overlay, rows = [], tenantId = 'tenant-demo', session = null, parentMount = null) {
    const uploadStep = overlay.querySelector('#import-step-upload');
    const previewStep = overlay.querySelector('#import-step-preview');
    const commitSlot = overlay.querySelector('#modal-commit-btn-slot');

    if (uploadStep) uploadStep.style.display = 'none';
    if (previewStep) previewStep.style.display = 'block';

    overlay.querySelector('#step-lbl-2').style.color = 'var(--accent-primary)';
    overlay.querySelector('#step-lbl-3').style.color = 'var(--accent-primary)';

    const validation = inventoryImportController.validateRows(rows, tenantId);
    const diff = inventoryImportController.generateDiffPreview(rows, tenantId);

    const hasErrors = diff.ERRORS.length > 0;

    previewStep.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">IMPORT PREVIEW BREAKDOWN</div>
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px;">
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center; border:1px solid var(--border-subtle);">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">NEW</div>
            <div style="font-size:1.4rem; font-weight:700; color:var(--status-success); margin-top:2px;">${diff.NEW.length}</div>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center; border:1px solid var(--border-subtle);">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">UPDATED</div>
            <div style="font-size:1.4rem; font-weight:700; color:var(--status-info); margin-top:2px;">${diff.UPDATED.length}</div>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center; border:1px solid var(--border-subtle);">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">UNCHANGED</div>
            <div style="font-size:1.4rem; font-weight:700; color:var(--text-muted); margin-top:2px;">${diff.UNCHANGED.length}</div>
          </div>
          <div style="background:${hasErrors ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-surface-2)'}; padding:12px; border-radius:6px; text-align:center; border:${hasErrors ? '1px solid var(--status-danger)' : '1px solid var(--border-subtle)'};">
            <div style="font-size:0.7rem; color:${hasErrors ? 'var(--status-danger)' : 'var(--text-muted)'}; font-weight:700;">ERRORS</div>
            <div style="font-size:1.4rem; font-weight:700; color:${hasErrors ? 'var(--status-danger)' : 'var(--text-muted)'}; margin-top:2px;">${diff.ERRORS.length} ${hasErrors ? '🔴' : ''}</div>
          </div>
        </div>
      </div>

      ${hasErrors ? `
        <div style="background:rgba(239, 68, 68, 0.1); border:1px solid var(--status-danger); padding:14px; border-radius:6px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-weight:700; color:var(--status-danger); font-size:0.88rem;">
              ⚠ IMPORT BLOCKED — ${diff.ERRORS.length} error(s) must be resolved before committing
            </div>
            <button type="button" id="btn-export-errors-csv" class="btn-secondary" style="font-size:0.75rem; padding:4px 10px; cursor:pointer; color:var(--status-danger); border-color:var(--status-danger);">
              ⬇ Export Error Report
            </button>
          </div>
          <ul style="margin:0; padding-left:20px; font-size:0.8rem; color:var(--status-danger); max-height:120px; overflow-y:auto;">
            ${diff.ERRORS.map(e => `<li>Row ${e.row} [${e.itemCode || 'CODE'}]: ${e.message}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${diff.UPDATED.length > 0 ? `
        <div style="margin-bottom:16px;">
          <div style="font-weight:700; font-size:0.85rem; color:var(--accent-primary); margin-bottom:8px;">UPDATED ITEM COMPARISON (${diff.UPDATED.length})</div>
          <div style="max-height:180px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">
            ${diff.UPDATED.map(u => `
              <div style="background:var(--bg-surface-2); border-left:3px solid var(--accent-primary); padding:10px; border-radius:4px;">
                <div style="font-weight:700; font-size:0.85rem;">${u.itemCode} — ${u.itemName}</div>
                <table style="width:100%; font-size:0.78rem; margin-top:6px; border-collapse:collapse;">
                  <thead>
                    <tr style="color:var(--text-muted); text-align:left; border-bottom:1px solid var(--border-subtle);">
                      <th style="padding:4px;">Field</th><th style="padding:4px;">EXISTING</th><th style="padding:4px;">IMPORT</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${u.fieldChanges.map(fc => `
                      <tr>
                        <td style="padding:4px; font-weight:600;">${fc.field}</td>
                        <td style="padding:4px; color:var(--text-muted);">${fc.existing}</td>
                        <td style="padding:4px; color:var(--accent-primary); font-weight:700;">${fc.import} ← CHANGED</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${diff.NEW.length > 0 ? `
        <div style="margin-bottom:16px;">
          <div style="font-weight:700; font-size:0.85rem; color:var(--status-success); margin-bottom:6px;">NEW ITEMS TO CREATE (${diff.NEW.length})</div>
          <div style="max-height:100px; overflow-y:auto; font-size:0.8rem; color:var(--text-muted);">
            ${diff.NEW.map(n => `<span style="display:inline-block; background:var(--bg-surface-2); padding:3px 8px; border-radius:4px; margin:2px 4px 2px 0; font-family:monospace; color:var(--text-main);">${n.itemCode} ${n.itemName}</span>`).join('')}
          </div>
        </div>
      ` : ''}
    `;

    if (hasErrors) {
      commitSlot.innerHTML = `
        <button type="button" class="btn-secondary" disabled style="padding:8px 18px; font-weight:700; opacity:0.5; cursor:not-allowed; border-radius:6px;">
          🔒 Commit Import (Blocked)
        </button>
      `;
      const btnExportErr = overlay.querySelector('#btn-export-errors-csv');
      if (btnExportErr) {
        btnExportErr.addEventListener('click', () => {
          const errCsv = inventoryImportController.generateErrorReportCsv(diff.ERRORS);
          this._triggerDownload(errCsv, 'inventory_import_errors.csv');
        });
      }
    } else {
      overlay.querySelector('#step-lbl-4').style.color = 'var(--accent-primary)';
      const changeCount = diff.NEW.length + diff.UPDATED.length;
      commitSlot.innerHTML = `
        <button type="button" id="btn-commit-import-action" class="btn-primary" style="padding:8px 20px; font-weight:700; background:var(--status-success); border-color:var(--status-success); color:#fff; border-radius:6px; cursor:pointer;">
          ✓ Commit ${changeCount} Changes
        </button>
      `;

      const btnCommitAction = overlay.querySelector('#btn-commit-import-action');
      if (btnCommitAction) {
        btnCommitAction.addEventListener('click', async () => {
          btnCommitAction.disabled = true;
          btnCommitAction.textContent = '⏳ Committing...';
          const res = await inventoryImportController.commitImport(rows, tenantId);
          this._renderImportResultStep(overlay, res, parentMount, session);
        });
      }
    }
  }

  _renderImportResultStep(overlay, res = {}, parentMount = null, session = null) {
    const previewStep = overlay.querySelector('#import-step-preview');
    const footer = overlay.querySelector('#import-modal-footer');

    overlay.querySelector('#step-lbl-5').style.color = 'var(--status-success)';

    if (footer) footer.style.display = 'none';

    if (previewStep) {
      previewStep.innerHTML = `
        <div style="text-align:center; padding:16px 0;">
          <div style="font-size:3rem; margin-bottom:10px;">✅</div>
          <h3 style="margin:0; color:var(--status-success); font-size:1.3rem;">✓ IMPORT COMPLETED</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-top:4px;">Master inventory items committed atomically to live Supabase storage.</p>

          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin:20px 0;">
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">CREATED</div>
              <div style="font-size:1.3rem; font-weight:700; color:var(--status-success); margin-top:2px;">${res.createdCount}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">UPDATED</div>
              <div style="font-size:1.3rem; font-weight:700; color:var(--status-info); margin-top:2px;">${res.updatedCount}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">UNCHANGED</div>
              <div style="font-size:1.3rem; font-weight:700; color:var(--text-muted); margin-top:2px;">${res.unchangedCount}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">REJECTED</div>
              <div style="font-size:1.3rem; font-weight:700; color:var(--text-muted); margin-top:2px;">${res.rejectedCount}</div>
            </div>
          </div>

          <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:24px;">
            Import Audit ID: <strong style="font-family:monospace; color:var(--accent-primary);">${res.importId}</strong>
          </div>

          <div style="display:flex; justify-content:center; gap:12px;">
            <button type="button" id="btn-close-modal-finish" class="btn-primary" style="padding:10px 24px; font-weight:700; background:var(--accent-primary); border-radius:6px; border:none; color:#fff; cursor:pointer;">
              Close & Refresh Catalog
            </button>
          </div>
        </div>
      `;

      const btnFinish = previewStep.querySelector('#btn-close-modal-finish');
      if (btnFinish) {
        btnFinish.addEventListener('click', async () => {
          overlay.remove();
          if (parentMount) {
            this.activeSubView = 'inv-master';
            await this.render(parentMount, session);
          }
        });
      }
    }
  }

  handleCategoryExport(tenantId = 'tenant-demo') {
    const csv = categoryImportController.exportLiveCategoriesCsv(tenantId);
    this._triggerDownload(csv, `inventory_categories_${tenantId}.csv`);
  }

  handleCategoryTemplateDownload() {
    const csv = categoryImportController.generateTemplateCsv();
    this._triggerDownload(csv, 'inventory_categories_template.csv');
  }

  renderAddProductFamilyModal(tenantId = 'tenant-demo', session = null, parentMount = null) {
    const existingOverlay = document.querySelector('#add-pf-modal-overlay');
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'add-pf-modal-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(8px);
      display: flex; justify-content: center; align-items: center; z-index: 9999;
      animation: fadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
      <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:12px; width:90%; max-width:520px; overflow:hidden; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
        <div style="padding:18px 24px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0; font-size:1.1rem; color:var(--accent-primary);">📦 CREATE PRODUCT FAMILY</h3>
          <button type="button" id="btn-close-add-pf" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">×</button>
        </div>
        <div style="padding:24px; display:flex; flex-direction:column; gap:14px; font-size:0.85rem;">
          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px;">Product Family Code *</label>
            <input type="text" id="inp-new-pf-code" placeholder="e.g. PF-MEAT" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main); font-family:monospace;" />
          </div>
          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px;">Product Family Name *</label>
            <input type="text" id="inp-new-pf-name" placeholder="e.g. Meat & Poultry" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
          </div>
          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px;">Description</label>
            <textarea id="inp-new-pf-desc" placeholder="e.g. Fresh chicken, mutton, beef, pork, and poultry cuts" style="width:100%; height:70px; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main); resize:none;"></textarea>
          </div>
        </div>
        <div style="padding:16px 24px; background:var(--bg-surface-2); border-top:1px solid var(--border-subtle); display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" id="btn-cancel-add-pf" class="btn-secondary" style="padding:8px 16px; cursor:pointer;">Cancel</button>
          <button type="button" id="btn-save-new-pf" class="btn-primary" style="padding:8px 20px; font-weight:700; background:var(--accent-primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">Create Family</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeFn = () => overlay.remove();
    overlay.querySelector('#btn-close-add-pf').addEventListener('click', closeFn);
    overlay.querySelector('#btn-cancel-add-pf').addEventListener('click', closeFn);

    overlay.querySelector('#btn-save-new-pf').addEventListener('click', async () => {
      const code = overlay.querySelector('#inp-new-pf-code').value.trim().toUpperCase();
      const name = overlay.querySelector('#inp-new-pf-name').value.trim();
      const desc = overlay.querySelector('#inp-new-pf-desc').value.trim();

      if (!code || !name) {
        alert('Please fill in mandatory Family Code and Family Name.');
        return;
      }

      await categoryImportController.commitImport([{
        record_type: 'PRODUCT_FAMILY',
        code,
        name,
        description: desc,
        active: 'true'
      }], tenantId);

      overlay.remove();
      if (parentMount) await this.render(parentMount, session);
    });
  }

  renderAddCategoryModal(tenantId = 'tenant-demo', session = null, parentMount = null) {
    const existingOverlay = document.querySelector('#add-category-modal-overlay');
    if (existingOverlay) existingOverlay.remove();

    const pfList = categoryImportController._getCollection('product_families', tenantId);
    const productFamilies = pfList.length > 0 ? pfList : categoryImportController.getDefaultProductFamilies();

    const overlay = document.createElement('div');
    overlay.id = 'add-category-modal-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(8px);
      display: flex; justify-content: center; align-items: center; z-index: 9999;
      animation: fadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
      <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:12px; width:90%; max-width:520px; overflow:hidden; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
        <div style="padding:18px 24px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0; font-size:1.1rem; color:var(--accent-primary);">🏷️ CREATE INVENTORY CATEGORY</h3>
          <button type="button" id="btn-close-add-cat" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">×</button>
        </div>
        <div style="padding:24px; display:flex; flex-direction:column; gap:14px; font-size:0.85rem;">
          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px;">Category Code *</label>
            <input type="text" id="inp-new-cat-code" placeholder="e.g. CAT-VEG" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main); font-family:monospace;" />
          </div>
          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px;">Category Name *</label>
            <input type="text" id="inp-new-cat-name" placeholder="e.g. Fresh Vegetables" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
          </div>
          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px;">Product Family *</label>
            <select id="sel-new-cat-pf" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
              ${productFamilies.map(pf => `<option value="${pf.code || pf.product_family_code}">${pf.name || pf.product_family_name} (${pf.code || pf.product_family_code})</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px;">Default Base UOM</label>
            <select id="sel-new-cat-uom" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
              <option value="KG">KG (Kilogram)</option>
              <option value="LTR">LTR (Litre)</option>
              <option value="ML">ML (Millilitre)</option>
              <option value="PCS">PCS (Piece)</option>
              <option value="G">G (Gram)</option>
            </select>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Default base UOM is a suggestion; individual item base UOMs take precedence.</div>
          </div>
        </div>
        <div style="padding:16px 24px; background:var(--bg-surface-2); border-top:1px solid var(--border-subtle); display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" id="btn-cancel-add-cat" class="btn-secondary" style="padding:8px 16px; cursor:pointer;">Cancel</button>
          <button type="button" id="btn-save-new-cat" class="btn-primary" style="padding:8px 20px; font-weight:700; background:var(--accent-primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">Create Category</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeFn = () => overlay.remove();
    overlay.querySelector('#btn-close-add-cat').addEventListener('click', closeFn);
    overlay.querySelector('#btn-cancel-add-cat').addEventListener('click', closeFn);

    overlay.querySelector('#btn-save-new-cat').addEventListener('click', async () => {
      const code = overlay.querySelector('#inp-new-cat-code').value.trim().toUpperCase();
      const name = overlay.querySelector('#inp-new-cat-name').value.trim();
      const pfCode = overlay.querySelector('#sel-new-cat-pf').value;
      const defaultUom = overlay.querySelector('#sel-new-cat-uom').value;

      if (!code || !name) {
        alert('Please fill in mandatory Category Code and Category Name.');
        return;
      }

      await categoryImportController.commitImport([{
        category_code: code,
        category_name: name,
        product_family_code: pfCode,
        default_base_uom: defaultUom,
        active: 'true'
      }], tenantId);

      overlay.remove();
      if (parentMount) await this.render(parentMount, session);
    });
  }

  openCategoryDetailDrawer(catCode, tenantId = 'tenant-demo', parentMount = null, session = null) {
    const existingDrawer = document.querySelector('#cat-detail-drawer-overlay');
    if (existingDrawer) existingDrawer.remove();

    const cats = categoryImportController._getCollection('inventory_categories', tenantId);
    const cat = cats.find(c => (c.categoryCode || c.category_code || c.code) === catCode) || {
      categoryCode: catCode,
      categoryName: catCode,
      productFamilyCode: 'PF-PROD',
      defaultBaseUom: 'KG'
    };

    const items = this._getCollection('inventory', tenantId);
    const mappedItems = items.filter(i => (i.categoryCode === catCode || i.category_code === catCode || i.category === catCode));

    const overlay = document.createElement('div');
    overlay.id = 'cat-detail-drawer-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(4px);
      display: flex; justify-content: flex-end; z-index: 9999;
      animation: fadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
      <div style="background:var(--bg-surface-1); border-left:1px solid var(--border-subtle); width:420px; height:100vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:-10px 0 25px rgba(0,0,0,0.3);">
        <div style="padding:20px 24px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">CATEGORY DETAILS</div>
            <h3 style="margin:2px 0 0 0; color:var(--accent-primary); font-size:1.2rem;">${cat.categoryName || cat.category_name}</h3>
          </div>
          <button type="button" id="btn-close-cat-drawer" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">×</button>
        </div>

        <div style="padding:24px; flex:1; overflow-y:auto; font-size:0.85rem; display:flex; flex-direction:column; gap:16px;">
          <div>
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">CATEGORY CODE</div>
            <div style="font-weight:700; font-family:monospace; font-size:1rem; color:var(--text-main); margin-top:2px;">${cat.categoryCode || cat.category_code}</div>
          </div>
          <div>
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">PRODUCT FAMILY</div>
            <div style="font-weight:600; color:var(--status-info); margin-top:2px;">${cat.productFamilyCode || cat.product_family_code || 'PF-PROD'}</div>
          </div>
          <div>
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">DEFAULT BASE UOM</div>
            <div style="font-weight:600; margin-top:2px;"><span class="badge badge-secondary">${cat.defaultBaseUom || cat.default_base_uom || 'KG'}</span></div>
          </div>
          <div>
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">STATUS</div>
            <div style="margin-top:2px;"><span class="badge badge-success">ACTIVE</span></div>
          </div>

          <hr style="border:none; border-top:1px solid var(--border-subtle); margin:8px 0;" />

          <div>
            <div style="font-weight:700; color:var(--accent-primary); margin-bottom:8px;">MAPPED INVENTORY ITEMS (${mappedItems.length})</div>
            ${mappedItems.length ? `
              <div style="display:flex; flex-direction:column; gap:6px; max-height:240px; overflow-y:auto;">
                ${mappedItems.map(mi => `
                  <div style="background:var(--bg-surface-2); padding:8px 12px; border-radius:6px; display:flex; justify-content:space-between; font-size:0.8rem;">
                    <div>
                      <strong style="font-family:monospace; color:var(--accent-primary);">${mi.itemCode || mi.item_code}</strong> ${mi.itemName || mi.item_name}
                    </div>
                    <span class="badge badge-secondary">${mi.baseUom || mi.base_uom || 'KG'}</span>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div style="color:var(--text-muted); font-size:0.8rem; font-style:italic;">No inventory items mapped to this category yet.</div>
            `}
          </div>

          ${mappedItems.length > 0 ? `
            <div style="background:rgba(234, 179, 8, 0.1); border:1px solid var(--status-warning); padding:10px; border-radius:6px; color:var(--status-warning); font-size:0.78rem;">
              ⚠ Cannot delete category while items are mapped. Deactivate category or reassign items first.
            </div>
          ` : ''}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('#btn-close-cat-drawer').addEventListener('click', () => overlay.remove());
  }

  openCategoryImportModal(tenantId = 'tenant-demo', session = null, parentMount = null) {
    const existingOverlay = document.querySelector('#cat-import-modal-overlay');
    if (existingOverlay) existingOverlay.remove();

    const existingCats = categoryImportController._getCollection('inventory_categories', tenantId);
    const existingCount = existingCats.length;

    const overlay = document.createElement('div');
    overlay.id = 'cat-import-modal-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(8px);
      display: flex; justify-content: center; align-items: center; z-index: 9999;
      animation: fadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
      <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:12px; width:90%; max-width:680px; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
        <div style="padding:20px 24px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin:0; font-size:1.2rem; display:flex; align-items:center; gap:8px;">
              <span>🏷️</span> IMPORT INVENTORY CATEGORIES
            </h3>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
              Incremental & Atomic Category Taxonomy Import
            </div>
          </div>
          <button type="button" id="btn-close-cat-import-modal" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer; padding:4px 8px;">×</button>
        </div>

        <div style="padding:12px 24px; background:var(--bg-surface-1); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700;">
          <span id="step-lbl-cat-1" style="color:var(--accent-primary);">STEP 1: Upload</span> →
          <span id="step-lbl-cat-2" style="color:var(--text-muted);">STEP 2: Validate</span> →
          <span id="step-lbl-cat-3" style="color:var(--text-muted);">STEP 3: Diff</span> →
          <span id="step-lbl-cat-4" style="color:var(--text-muted);">STEP 4: Commit</span> →
          <span id="step-lbl-cat-5" style="color:var(--text-muted);">STEP 5: Result</span>
        </div>

        <div id="import-cat-modal-body" style="padding:24px; overflow-y:auto; flex:1;">
          <div id="import-cat-step-upload">
            <div id="drop-zone-cat" style="border:2px dashed var(--border-subtle); background:var(--bg-surface-2); padding:36px; text-align:center; border-radius:8px; margin-bottom:16px;">
              <div style="font-size:2.5rem; margin-bottom:8px;">📄</div>
              <div style="font-weight:700; font-size:1.05rem;">Drop inventory_categories.csv here</div>
              <div style="color:var(--text-muted); font-size:0.82rem; margin:8px 0 16px 0;">or choose file from your system</div>
              <label class="btn-primary" style="padding:8px 22px; font-weight:700; cursor:pointer; display:inline-block; border-radius:6px; background:var(--accent-primary); color:#fff;">
                Choose File
                <input type="file" id="inp-cat-csv-file" accept=".csv" style="display:none;" />
              </label>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem; color:var(--text-muted);">
              <div>Existing categories: <strong>${existingCount} categories</strong></div>
              <div style="color:var(--status-info); font-weight:600;">ℹ Incremental import. Existing categories will NOT be deleted.</div>
            </div>
          </div>

          <div id="import-cat-step-preview" style="display:none;"></div>
        </div>

        <div id="import-cat-modal-footer" style="padding:16px 24px; background:var(--bg-surface-2); border-top:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <button type="button" id="btn-cancel-cat-import-action" class="btn-secondary" style="padding:8px 16px; cursor:pointer; border-radius:6px;">Cancel</button>
          <div id="modal-cat-commit-btn-slot"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeFn = () => overlay.remove();
    overlay.querySelector('#btn-close-cat-import-modal').addEventListener('click', closeFn);
    overlay.querySelector('#btn-cancel-cat-import-action').addEventListener('click', closeFn);

    const fileInput = overlay.querySelector('#inp-cat-csv-file');
    const dropZone = overlay.querySelector('#drop-zone-cat');

    const handleFile = async (file) => {
      if (!file) return;
      const text = await file.text();
      const rows = categoryImportController.parseCsv(text);
      this._renderCategoryImportPreviewSteps(overlay, rows, tenantId, session, parentMount);
    };

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
      });
    }

    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent-primary)'; });
      dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--border-subtle)'; });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border-subtle)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
      });
    }
  }

  _renderCategoryImportPreviewSteps(overlay, rows = [], tenantId = 'tenant-demo', session = null, parentMount = null) {
    const uploadStep = overlay.querySelector('#import-cat-step-upload');
    const previewStep = overlay.querySelector('#import-cat-step-preview');
    const commitSlot = overlay.querySelector('#modal-cat-commit-btn-slot');

    if (uploadStep) uploadStep.style.display = 'none';
    if (previewStep) previewStep.style.display = 'block';

    overlay.querySelector('#step-lbl-cat-2').style.color = 'var(--accent-primary)';
    overlay.querySelector('#step-lbl-cat-3').style.color = 'var(--accent-primary)';

    const validation = categoryImportController.validateRows(rows, tenantId);
    const diff = categoryImportController.generateDiffPreview(rows, tenantId);
    const hasErrors = diff.ERRORS.length > 0;

    previewStep.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">IMPORT PREVIEW BREAKDOWN</div>
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px;">
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center; border:1px solid var(--border-subtle);">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">NEW</div>
            <div style="font-size:1.4rem; font-weight:700; color:var(--status-success); margin-top:2px;">${diff.NEW.length}</div>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center; border:1px solid var(--border-subtle);">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">UPDATED</div>
            <div style="font-size:1.4rem; font-weight:700; color:var(--status-info); margin-top:2px;">${diff.UPDATED.length}</div>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center; border:1px solid var(--border-subtle);">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">UNCHANGED</div>
            <div style="font-size:1.4rem; font-weight:700; color:var(--text-muted); margin-top:2px;">${diff.UNCHANGED.length}</div>
          </div>
          <div style="background:${hasErrors ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-surface-2)'}; padding:12px; border-radius:6px; text-align:center; border:${hasErrors ? '1px solid var(--status-danger)' : '1px solid var(--border-subtle)'};">
            <div style="font-size:0.7rem; color:${hasErrors ? 'var(--status-danger)' : 'var(--text-muted)'}; font-weight:700;">ERRORS</div>
            <div style="font-size:1.4rem; font-weight:700; color:${hasErrors ? 'var(--status-danger)' : 'var(--text-muted)'}; margin-top:2px;">${diff.ERRORS.length} ${hasErrors ? '🔴' : ''}</div>
          </div>
        </div>
      </div>

      ${hasErrors ? `
        <div style="background:rgba(239, 68, 68, 0.1); border:1px solid var(--status-danger); padding:14px; border-radius:6px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-weight:700; color:var(--status-danger); font-size:0.88rem;">
              ⚠ IMPORT BLOCKED — ${diff.ERRORS.length} error(s) must be resolved before committing
            </div>
            <button type="button" id="btn-export-cat-errors-csv" class="btn-secondary" style="font-size:0.75rem; padding:4px 10px; cursor:pointer; color:var(--status-danger); border-color:var(--status-danger);">
              ⬇ Export Error Report
            </button>
          </div>
          <ul style="margin:0; padding-left:20px; font-size:0.8rem; color:var(--status-danger); max-height:120px; overflow-y:auto;">
            ${diff.ERRORS.map(e => `<li>Row ${e.row} [${e.categoryCode || 'CODE'}]: ${e.message}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${diff.NEW.length > 0 ? `
        <div style="margin-bottom:16px;">
          <div style="font-weight:700; font-size:0.85rem; color:var(--status-success); margin-bottom:6px;">NEW TAXONOMY RECORDS TO CREATE (${diff.NEW.length})</div>
          <div style="max-height:140px; overflow-y:auto; font-size:0.8rem; color:var(--text-muted); display:flex; flex-direction:column; gap:4px;">
            ${diff.NEW.map(n => {
              const isPf = n.recordType === 'PRODUCT_FAMILY' || (n.code && (n.code.startsWith('FAM-') || n.code.startsWith('PF-')));
              const code = n.code || n.categoryCode || n.category_code || '';
              const name = n.name || n.categoryName || n.category_name || '';
              const parent = n.productFamilyCode || n.product_family_code || '';
              const badge = isPf ? '📦 PRODUCT FAMILY' : '🏷️ CATEGORY';
              const label = isPf ? `${badge}: ${code} — ${name}` : `${badge}: ${code} — ${name} (${parent || 'GENERAL'})`;
              return `<div style="background:var(--bg-surface-2); padding:6px 10px; border-radius:4px; font-family:monospace; color:var(--text-main); font-size:0.8rem;">${label}</div>`;
            }).join('')}
          </div>
        </div>
      ` : ''}

      ${diff.UPDATED.length > 0 ? `
        <div style="margin-bottom:16px;">
          <div style="font-weight:700; font-size:0.85rem; color:var(--accent-primary); margin-bottom:8px;">UPDATED TAXONOMY COMPARISON (${diff.UPDATED.length})</div>
          <div style="max-height:180px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">
            ${diff.UPDATED.map(u => {
              const isPf = u.recordType === 'PRODUCT_FAMILY' || (u.code && (u.code.startsWith('FAM-') || u.code.startsWith('PF-')));
              const code = u.code || u.categoryCode || u.category_code || '';
              const name = u.name || u.categoryName || u.category_name || '';
              const badge = isPf ? '📦 PRODUCT FAMILY' : '🏷️ CATEGORY';
              return `
                <div style="background:var(--bg-surface-2); border-left:3px solid var(--accent-primary); padding:10px; border-radius:4px;">
                  <div style="font-weight:700; font-size:0.85rem; font-family:monospace; color:var(--accent-primary);">${badge}: ${code} — ${name}</div>
                  <table style="width:100%; font-size:0.78rem; margin-top:6px; border-collapse:collapse;">
                    <thead>
                      <tr style="color:var(--text-muted); text-align:left; border-bottom:1px solid var(--border-subtle);">
                        <th style="padding:4px;">Field</th><th style="padding:4px;">EXISTING</th><th style="padding:4px;">IMPORT</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${u.fieldChanges.map(fc => `
                        <tr>
                          <td style="padding:4px; font-weight:600;">${fc.field}</td>
                          <td style="padding:4px; color:var(--text-muted);">${fc.existing}</td>
                          <td style="padding:4px; color:var(--accent-primary); font-weight:700;">${fc.import} ← CHANGED</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    `;

    if (hasErrors) {
      commitSlot.innerHTML = `
        <button type="button" class="btn-secondary" disabled style="padding:8px 18px; font-weight:700; opacity:0.5; cursor:not-allowed; border-radius:6px;">
          🔒 Commit Import (Blocked)
        </button>
      `;
      const btnExportErr = overlay.querySelector('#btn-export-cat-errors-csv');
      if (btnExportErr) {
        btnExportErr.addEventListener('click', () => {
          const errCsv = categoryImportController.generateErrorReportCsv(diff.ERRORS);
          this._triggerDownload(errCsv, 'inventory_categories_import_errors.csv');
        });
      }
    } else {
      overlay.querySelector('#step-lbl-cat-4').style.color = 'var(--accent-primary)';
      const changeCount = diff.NEW.length + diff.UPDATED.length;
      commitSlot.innerHTML = `
        <button type="button" id="btn-commit-cat-import-action" class="btn-primary" style="padding:8px 20px; font-weight:700; background:var(--status-success); border-color:var(--status-success); color:#fff; border-radius:6px; cursor:pointer;">
          ✓ Commit ${changeCount} Changes
        </button>
      `;

      overlay.querySelector('#btn-commit-cat-import-action').addEventListener('click', async () => {
        const btnCommit = overlay.querySelector('#btn-commit-cat-import-action');
        btnCommit.disabled = true;
        btnCommit.textContent = '⏳ Committing...';
        const res = await categoryImportController.commitImport(rows, tenantId);
        this._renderCategoryImportResultStep(overlay, res, parentMount, session);
      });
    }
  }

  _renderCategoryImportResultStep(overlay, res = {}, parentMount = null, session = null) {
    const previewStep = overlay.querySelector('#import-cat-step-preview');
    const footer = overlay.querySelector('#import-cat-modal-footer');

    overlay.querySelector('#step-lbl-cat-5').style.color = 'var(--status-success)';

    if (footer) footer.style.display = 'none';

    if (previewStep) {
      previewStep.innerHTML = `
        <div style="text-align:center; padding:16px 0;">
          <div style="font-size:3rem; margin-bottom:10px;">✅</div>
          <h3 style="margin:0; color:var(--status-success); font-size:1.3rem;">✓ CATEGORIES IMPORT COMPLETED</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-top:4px;">Inventory categories committed atomically to live Supabase storage.</p>

          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin:20px 0;">
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">CREATED</div>
              <div style="font-size:1.3rem; font-weight:700; color:var(--status-success); margin-top:2px;">${res.createdCount}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">UPDATED</div>
              <div style="font-size:1.3rem; font-weight:700; color:var(--status-info); margin-top:2px;">${res.updatedCount}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">UNCHANGED</div>
              <div style="font-size:1.3rem; font-weight:700; color:var(--text-muted); margin-top:2px;">${res.unchangedCount}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">REJECTED</div>
              <div style="font-size:1.3rem; font-weight:700; color:var(--text-muted); margin-top:2px;">${res.rejectedCount}</div>
            </div>
          </div>

          <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:24px;">
            Import Audit ID: <strong style="font-family:monospace; color:var(--accent-primary);">${res.importId}</strong>
          </div>

          <div style="display:flex; justify-content:center; gap:12px;">
            <button type="button" id="btn-close-cat-modal-finish" class="btn-primary" style="padding:10px 24px; font-weight:700; background:var(--accent-primary); border-radius:6px; border:none; color:#fff; cursor:pointer;">
              Close & Refresh Categories
            </button>
          </div>
        </div>
      `;

      previewStep.querySelector('#btn-close-cat-modal-finish').addEventListener('click', async () => {
        overlay.remove();
        if (parentMount) {
          this.activeSubView = 'inv-categories';
          await this.render(parentMount, session);
        }
      });
    }
  }

  // --- SUPPLIERS MASTER WORKFLOWS & MODALS ---

  renderAddSupplierModal(tenantId = 'tenant-demo', session = null, parentMount = null) {
    const existingModal = document.querySelector('#add-supplier-modal-overlay');
    if (existingModal) existingModal.remove();

    const overlay = document.createElement('div');
    overlay.id = 'add-supplier-modal-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px);
      display: flex; justify-content: center; align-items: center; z-index: 9999;
      animation: fadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
      <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:12px; width:520px; max-width:92vw; overflow:hidden; box-shadow:0 20px 40px rgba(0,0,0,0.4);">
        <div style="padding:20px 24px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin:0; color:var(--accent-primary); font-size:1.2rem;">🏢 Add New Supplier</h3>
            <p style="color:var(--text-muted); font-size:0.8rem; margin:2px 0 0 0;">Create vendor identity in Supplier Master</p>
          </div>
          <button type="button" id="btn-close-add-sup" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">×</button>
        </div>
        <div style="padding:24px; display:flex; flex-direction:column; gap:14px; font-size:0.85rem;">
          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px;">Supplier Code *</label>
            <input type="text" id="inp-new-sup-code" placeholder="e.g. SUP-006" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main); font-family:monospace;" />
          </div>
          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px;">Vendor / Supplier Name *</label>
            <input type="text" id="inp-new-sup-name" placeholder="e.g. Metro Food Supplies" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Primary Contact</label>
              <input type="text" id="inp-new-sup-contact" placeholder="e.g. Rahul Sharma" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
            </div>
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Phone Number</label>
              <input type="text" id="inp-new-sup-phone" placeholder="e.g. +91 98201 99999" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
            </div>
          </div>
          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px;">Email Address</label>
            <input type="email" id="inp-new-sup-email" placeholder="e.g. orders@metrofoods.com" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
          </div>
          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px;">GSTIN (Tax Identification)</label>
            <input type="text" id="inp-new-sup-gstin" placeholder="e.g. 27AAAFF1234A1Z5" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main); font-family:monospace;" />
          </div>
          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px;">Physical Address</label>
            <textarea id="inp-new-sup-address" rows="2" placeholder="e.g. Plot 42, APMC Market, Vashi, Navi Mumbai" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main); resize:none;"></textarea>
          </div>
        </div>
        <div style="padding:16px 24px; background:var(--bg-surface-2); border-top:1px solid var(--border-subtle); display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" id="btn-cancel-add-sup" class="btn-secondary" style="padding:8px 16px; cursor:pointer;">Cancel</button>
          <button type="button" id="btn-save-new-sup" class="btn-primary" style="padding:8px 20px; font-weight:700; background:var(--accent-primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">Create Supplier</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeFn = () => overlay.remove();
    overlay.querySelector('#btn-close-add-sup').addEventListener('click', closeFn);
    overlay.querySelector('#btn-cancel-add-sup').addEventListener('click', closeFn);

    overlay.querySelector('#btn-save-new-sup').addEventListener('click', async () => {
      const code = overlay.querySelector('#inp-new-sup-code').value.trim().toUpperCase();
      const name = overlay.querySelector('#inp-new-sup-name').value.trim();
      const contact = overlay.querySelector('#inp-new-sup-contact').value.trim();
      const phone = overlay.querySelector('#inp-new-sup-phone').value.trim();
      const email = overlay.querySelector('#inp-new-sup-email').value.trim();
      const gstin = overlay.querySelector('#inp-new-sup-gstin').value.trim().toUpperCase();
      const address = overlay.querySelector('#inp-new-sup-address').value.trim();

      if (!code || !name) {
        alert('Please fill in mandatory Supplier Code and Supplier Name.');
        return;
      }

      await supplierImportController.commitImport([{
        supplier_code: code,
        supplier_name: name,
        contact_person: contact,
        phone,
        email,
        address,
        gstin,
        active: 'true'
      }], tenantId);

      overlay.remove();
      if (parentMount) await this.render(parentMount, session);
    });
  }

  openSupplierDetailDrawer(supplierCode, tenantId = 'tenant-demo', parentMount = null, session = null) {
    const existingDrawer = document.querySelector('#sup-detail-drawer-overlay');
    if (existingDrawer) existingDrawer.remove();

    const suppliers = supplierImportController._getCollection('suppliers', tenantId);
    const sup = suppliers.find(s => (s.supplierCode || s.supplier_code || s.code || '').toUpperCase() === (supplierCode || '').toUpperCase()) || {
      supplierCode,
      supplierName: supplierCode,
      contactPerson: 'N/A',
      phone: 'N/A',
      gstin: 'N/A'
    };

    const targetSupCode = (sup.supplierCode || sup.supplier_code || supplierCode || '').toUpperCase();
    const catalogueList = supplierCatalogueController._getCollection('supplier_catalogue', tenantId);
    const supCatalogueItems = catalogueList.filter(c => (c.supplierCode || c.supplier_code || '').toUpperCase() === targetSupCode);

    const overlay = document.createElement('div');
    overlay.id = 'sup-detail-drawer-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(4px);
      display: flex; justify-content: flex-end; z-index: 9999;
      animation: fadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
      <div style="background:var(--bg-surface-1); border-left:1px solid var(--border-subtle); width:440px; height:100vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:-10px 0 25px rgba(0,0,0,0.3);">
        <div style="padding:20px 24px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">SUPPLIER DETAILS</div>
            <h3 style="margin:2px 0 0 0; color:var(--accent-primary); font-size:1.2rem;">${sup.supplierName || sup.supplier_name}</h3>
          </div>
          <button type="button" id="btn-close-sup-drawer" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">×</button>
        </div>

        <div style="padding:24px; flex:1; overflow-y:auto; font-size:0.85rem; display:flex; flex-direction:column; gap:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">SUPPLIER CODE</div>
              <div style="font-weight:700; font-family:monospace; font-size:1rem; color:var(--accent-primary); margin-top:2px;">${sup.supplierCode || sup.supplier_code}</div>
            </div>
            <span class="badge ${sup.active !== false ? 'badge-success' : 'badge-secondary'}">${sup.active !== false ? 'ACTIVE' : 'INACTIVE'}</span>
          </div>

          <div>
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">PRIMARY CONTACT</div>
            <div style="font-weight:600; color:var(--text-main); margin-top:2px;">${sup.contactPerson || sup.contact_person || 'N/A'}</div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">PHONE NUMBER</div>
              <div style="font-weight:600; color:var(--text-main); margin-top:2px;">${sup.phone || sup.contact_number || 'N/A'}</div>
            </div>
            <div>
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">GSTIN</div>
              <div style="font-weight:700; font-family:monospace; color:var(--status-info); margin-top:2px;">${sup.gstin || sup.gst_number || 'N/A'}</div>
            </div>
          </div>

          <div>
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">EMAIL ADDRESS</div>
            <div style="color:var(--text-main); margin-top:2px;">${sup.email || 'N/A'}</div>
          </div>

          <div>
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">ADDRESS</div>
            <div style="color:var(--text-main); margin-top:2px; font-size:0.82rem;">${sup.address || 'N/A'}</div>
          </div>

          <!-- SUPPLIER CATALOGUE BRIDGE SECTION -->
          <div style="background:var(--bg-surface-2); border:1px solid var(--border-subtle); padding:16px; border-radius:8px; margin-top:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <div style="font-weight:700; color:var(--accent-primary); font-size:0.85rem;">
                📦 SUPPLIER CATALOGUE (${supCatalogueItems.length} Mapped Items)
              </div>
            </div>

            ${supCatalogueItems.length > 0 ? `
              <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px; max-height:180px; overflow-y:auto;">
                ${supCatalogueItems.map(c => {
                  const itemCode = c.itemCode || c.item_code;
                  const items = this._getCollection('inventory', tenantId);
                  const itemObj = items.find(i => (i.itemCode || i.item_code) === itemCode) || {};
                  const price = parseFloat(c.unitPrice !== undefined ? c.unitPrice : (c.unit_price || 0));
                  const uom = c.purchaseUom || c.purchase_uom || 'BAG';
                  const packQty = c.packQuantity || c.pack_quantity || 1;
                  const packUom = c.packUom || c.pack_uom || 'KG';
                  const pref = c.preferred !== false;
                  return `
                    <div style="background:var(--bg-surface-1); padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
                      <div>
                        <div style="font-weight:700; color:var(--text-main); font-size:0.82rem;">
                          <span style="font-family:monospace; color:var(--accent-primary); font-weight:700;">${itemCode}</span> ${itemObj.itemName || itemObj.item_name || c.supplierItemName || ''}
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                          ${uom} (${packQty} ${packUom}) ${pref ? '• <span style="color:var(--status-success); font-weight:700;">⭐ Preferred</span>' : ''}
                        </div>
                      </div>
                      <div style="font-weight:700; color:var(--status-success); font-size:0.82rem;">
                        ₹${price.toLocaleString('en-IN')} / ${uom}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : `
              <p style="font-size:0.78rem; color:var(--text-muted); margin:0 0 12px 0;">No catalogue mappings created yet for this supplier.</p>
            `}

            <button type="button" id="btn-view-sup-cat" class="btn-secondary" style="width:100%; padding:8px 12px; font-size:0.8rem; font-weight:700; background:var(--bg-surface-1); border:1px solid var(--accent-primary); color:var(--accent-primary); border-radius:6px; cursor:pointer;">
              View Supplier Catalogue Screen →
            </button>
          </div>
        </div>

        <div style="padding:16px 24px; background:var(--bg-surface-2); border-top:1px solid var(--border-subtle); display:flex; gap:10px;">
          <button type="button" id="btn-close-sup-drawer-bottom" class="btn-secondary" style="flex:1; padding:8px; cursor:pointer;">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeFn = () => overlay.remove();
    overlay.querySelector('#btn-close-sup-drawer').addEventListener('click', closeFn);
    overlay.querySelector('#btn-close-sup-drawer-bottom').addEventListener('click', closeFn);

    const btnViewCat = overlay.querySelector('#btn-view-sup-cat');
    if (btnViewCat) {
      btnViewCat.addEventListener('click', async () => {
        overlay.remove();
        if (parentMount) {
          this.activeSubView = 'inv-supplier-catalogue';
          await this.render(parentMount, session);
          const selSup = parentMount.querySelector('#sel-cat-filter-supplier');
          if (selSup) {
            selSup.value = targetSupCode;
            selSup.dispatchEvent(new Event('change'));
          }
        }
      });
    }
  }

  handleSupplierExport(tenantId = 'tenant-demo') {
    const csv = supplierImportController.exportLiveSuppliersCsv(tenantId);
    this._triggerDownload(csv, 'suppliers_master.csv');
  }

  handleSupplierTemplateDownload() {
    const csv = supplierImportController.generateTemplateCsv();
    this._triggerDownload(csv, 'suppliers_master_template.csv');
  }

  openSupplierImportModal(tenantId = 'tenant-demo', session = null, parentMount = null) {
    const existingModal = document.querySelector('#import-sup-modal-overlay');
    if (existingModal) existingModal.remove();

    const overlay = document.createElement('div');
    overlay.id = 'import-sup-modal-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px);
      display: flex; justify-content: center; align-items: center; z-index: 9999;
      animation: fadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
      <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:12px; width:720px; max-width:94vw; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 40px rgba(0,0,0,0.4);">
        <div style="padding:20px 24px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin:0; color:var(--accent-primary); font-size:1.2rem;">🏢 IMPORT SUPPLIERS MASTER</h3>
            <p style="color:var(--text-muted); font-size:0.8rem; margin:2px 0 0 0;">Incremental & Atomic Supplier Directory Import</p>
          </div>
          <button type="button" id="btn-close-sup-import-modal" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">×</button>
        </div>

        <!-- 5 STEP PIPELINE BAR -->
        <div style="background:var(--bg-surface-2); padding:10px 24px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; color:var(--text-muted);">
          <span id="step-lbl-sup-1" style="color:var(--accent-primary);">STEP 1: Upload</span> ➔ 
          <span id="step-lbl-sup-2">STEP 2: Validate</span> ➔ 
          <span id="step-lbl-sup-3">STEP 3: Diff</span> ➔ 
          <span id="step-lbl-sup-4">STEP 4: Commit</span> ➔ 
          <span id="step-lbl-sup-5">STEP 5: Result</span>
        </div>

        <div id="import-sup-modal-body" style="padding:24px; flex:1; overflow-y:auto; font-size:0.85rem;">
          <!-- STEP 1: UPLOAD DROPZONE -->
          <div id="import-sup-step-upload">
            <div id="sup-csv-dropzone" style="border:2px dashed var(--border-subtle); border-radius:8px; padding:36px 20px; text-align:center; background:var(--bg-surface-2); cursor:pointer;">
              <div style="font-size:2.4rem; margin-bottom:8px;">📄</div>
              <div style="font-weight:700; font-size:1rem; color:var(--text-main);">Drop your suppliers.csv file here</div>
              <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">or click to browse your local computer</div>
              <input type="file" id="file-sup-csv-input" accept=".csv" style="display:none;" />
            </div>

            <div style="margin-top:20px; padding:12px 16px; background:rgba(99, 102, 241, 0.1); border-left:3px solid var(--accent-primary); border-radius:4px; font-size:0.78rem; color:var(--text-muted);">
              <strong style="color:var(--accent-primary);">Incremental Update Contract:</strong>
              Existing suppliers matching <code>supplier_code</code> will be updated while preserving un-edited fields. Blank cells in CSV never overwrite existing DB values. Duplicate codes inside a file are hard errors.
            </div>
          </div>

          <!-- PREVIEW / DIFF STEP CONTAINER -->
          <div id="import-sup-step-preview" style="display:none;"></div>
        </div>

        <div id="import-sup-modal-footer" style="padding:16px 24px; background:var(--bg-surface-2); border-top:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <button type="button" id="btn-cancel-sup-modal" class="btn-secondary" style="padding:8px 16px; cursor:pointer;">Cancel</button>
          <div id="sup-modal-commit-slot"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeFn = () => overlay.remove();
    overlay.querySelector('#btn-close-sup-import-modal').addEventListener('click', closeFn);
    overlay.querySelector('#btn-cancel-sup-modal').addEventListener('click', closeFn);

    const dropzone = overlay.querySelector('#sup-csv-dropzone');
    const fileInput = overlay.querySelector('#file-sup-csv-input');

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--accent-primary)';
      dropzone.style.background = 'rgba(99, 102, 241, 0.05)';
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = 'var(--border-subtle)';
      dropzone.style.background = 'var(--bg-surface-2)';
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--border-subtle)';
      dropzone.style.background = 'var(--bg-surface-2)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this._processSupplierCsvFile(overlay, e.dataTransfer.files[0], tenantId, parentMount, session);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this._processSupplierCsvFile(overlay, e.target.files[0], tenantId, parentMount, session);
      }
    });
  }

  _processSupplierCsvFile(overlay, file, tenantId = 'tenant-demo', parentMount = null, session = null) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvText = e.target.result;
      const rows = supplierImportController.parseCsv(csvText);
      if (rows.length === 0) {
        alert('CSV file appears empty or unreadable.');
        return;
      }
      this._renderSupplierImportPreviewSteps(overlay, rows, tenantId, parentMount, session);
    };
    reader.readAsText(file);
  }

  _renderSupplierImportPreviewSteps(overlay, rows = [], tenantId = 'tenant-demo', parentMount = null, session = null) {
    const uploadStep = overlay.querySelector('#import-sup-step-upload');
    const previewStep = overlay.querySelector('#import-sup-step-preview');
    const commitSlot = overlay.querySelector('#sup-modal-commit-slot');

    if (uploadStep) uploadStep.style.display = 'none';
    if (previewStep) previewStep.style.display = 'block';

    overlay.querySelector('#step-lbl-sup-2').style.color = 'var(--accent-primary)';
    overlay.querySelector('#step-lbl-sup-3').style.color = 'var(--accent-primary)';

    const validation = supplierImportController.validateRows(rows, tenantId);
    const diff = supplierImportController.generateDiffPreview(rows, tenantId);
    const hasErrors = diff.ERRORS.length > 0;

    previewStep.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">IMPORT PREVIEW BREAKDOWN</div>
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px;">
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center; border:1px solid var(--border-subtle);">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">NEW</div>
            <div style="font-size:1.4rem; font-weight:700; color:var(--status-success); margin-top:2px;">${diff.NEW.length}</div>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center; border:1px solid var(--border-subtle);">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">UPDATED</div>
            <div style="font-size:1.4rem; font-weight:700; color:var(--status-info); margin-top:2px;">${diff.UPDATED.length}</div>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center; border:1px solid var(--border-subtle);">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">UNCHANGED</div>
            <div style="font-size:1.4rem; font-weight:700; color:var(--text-muted); margin-top:2px;">${diff.UNCHANGED.length}</div>
          </div>
          <div style="background:${hasErrors ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-surface-2)'}; padding:12px; border-radius:6px; text-align:center; border:${hasErrors ? '1px solid var(--status-danger)' : '1px solid var(--border-subtle)'};">
            <div style="font-size:0.7rem; color:${hasErrors ? 'var(--status-danger)' : 'var(--text-muted)'}; font-weight:700;">ERRORS</div>
            <div style="font-size:1.4rem; font-weight:700; color:${hasErrors ? 'var(--status-danger)' : 'var(--text-muted)'}; margin-top:2px;">${diff.ERRORS.length} ${hasErrors ? '🔴' : ''}</div>
          </div>
        </div>
      </div>

      ${hasErrors ? `
        <div style="background:rgba(239, 68, 68, 0.1); border:1px solid var(--status-danger); padding:14px; border-radius:6px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-weight:700; color:var(--status-danger); font-size:0.88rem;">
              ⚠ IMPORT BLOCKED — ${diff.ERRORS.length} error(s) must be resolved before committing
            </div>
            <button type="button" id="btn-export-sup-errors-csv" class="btn-secondary" style="font-size:0.75rem; padding:4px 10px; cursor:pointer; color:var(--status-danger); border-color:var(--status-danger);">
              ⬇ Export Error Report
            </button>
          </div>
          <ul style="margin:0; padding-left:20px; font-size:0.8rem; color:var(--status-danger); max-height:120px; overflow-y:auto;">
            ${diff.ERRORS.map(e => `<li>Row ${e.row} [${e.supplierCode || 'CODE'}]: ${e.message}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${diff.NEW.length > 0 ? `
        <div style="margin-bottom:16px;">
          <div style="font-weight:700; font-size:0.85rem; color:var(--status-success); margin-bottom:6px;">NEW SUPPLIERS TO CREATE (${diff.NEW.length})</div>
          <div style="max-height:140px; overflow-y:auto; font-size:0.8rem; color:var(--text-muted); display:flex; flex-direction:column; gap:4px;">
            ${diff.NEW.map(n => `
              <div style="background:var(--bg-surface-2); padding:6px 10px; border-radius:4px; font-family:monospace; color:var(--text-main); font-size:0.8rem;">
                🏢 SUPPLIER: ${n.supplierCode} — ${n.supplierName} (${n.contactPerson || 'No Contact'}, GSTIN: ${n.gstin || 'N/A'})
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${diff.UPDATED.length > 0 ? `
        <div style="margin-bottom:16px;">
          <div style="font-weight:700; font-size:0.85rem; color:var(--accent-primary); margin-bottom:8px;">UPDATED SUPPLIER COMPARISON (${diff.UPDATED.length})</div>
          <div style="max-height:180px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">
            ${diff.UPDATED.map(u => `
              <div style="background:var(--bg-surface-2); border-left:3px solid var(--accent-primary); padding:10px; border-radius:4px;">
                <div style="font-weight:700; font-size:0.85rem; font-family:monospace; color:var(--accent-primary);">🏢 SUPPLIER: ${u.supplierCode} — ${u.supplierName}</div>
                <table style="width:100%; font-size:0.78rem; margin-top:6px; border-collapse:collapse;">
                  <thead>
                    <tr style="color:var(--text-muted); text-align:left; border-bottom:1px solid var(--border-subtle);">
                      <th style="padding:4px;">Field</th><th style="padding:4px;">EXISTING</th><th style="padding:4px;">IMPORT</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${u.fieldChanges.map(fc => `
                      <tr>
                        <td style="padding:4px; font-weight:600;">${fc.field}</td>
                        <td style="padding:4px; color:var(--text-muted);">${fc.existing}</td>
                        <td style="padding:4px; color:var(--accent-primary); font-weight:700;">${fc.import} ← CHANGED</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    if (hasErrors) {
      commitSlot.innerHTML = `
        <button type="button" class="btn-secondary" disabled style="padding:8px 18px; font-weight:700; opacity:0.5; cursor:not-allowed; border-radius:6px;">
          🔒 Commit Import (Blocked)
        </button>
      `;
      const btnExportErr = overlay.querySelector('#btn-export-sup-errors-csv');
      if (btnExportErr) {
        btnExportErr.addEventListener('click', () => {
          const errCsv = supplierImportController.generateErrorReportCsv(diff.ERRORS);
          this._triggerDownload(errCsv, 'suppliers_import_errors.csv');
        });
      }
    } else {
      overlay.querySelector('#step-lbl-sup-4').style.color = 'var(--accent-primary)';
      const changeCount = diff.NEW.length + diff.UPDATED.length;
      commitSlot.innerHTML = `
        <button type="button" id="btn-commit-sup-import-action" class="btn-primary" style="padding:8px 20px; font-weight:700; background:var(--status-success); border-color:var(--status-success); color:#fff; border-radius:6px; cursor:pointer;">
          ✓ Commit ${changeCount} Changes
        </button>
      `;

      overlay.querySelector('#btn-commit-sup-import-action').addEventListener('click', async () => {
        const btnCommit = overlay.querySelector('#btn-commit-sup-import-action');
        btnCommit.disabled = true;
        btnCommit.textContent = '⏳ Committing...';
        const res = await supplierImportController.commitImport(rows, tenantId);
        this._renderSupplierImportResultStep(overlay, res, parentMount, session);
      });
    }
  }

  _renderSupplierImportResultStep(overlay, res = {}, parentMount = null, session = null) {
    const previewStep = overlay.querySelector('#import-sup-step-preview');
    const footer = overlay.querySelector('#import-sup-modal-footer');

    overlay.querySelector('#step-lbl-sup-5').style.color = 'var(--status-success)';

    if (footer) footer.style.display = 'none';

    if (previewStep) {
      previewStep.innerHTML = `
        <div style="text-align:center; padding:16px 0;">
          <div style="font-size:3rem; margin-bottom:10px;">✅</div>
          <h3 style="margin:0; color:var(--status-success); font-size:1.3rem;">✓ SUPPLIERS IMPORT COMPLETED</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-top:4px;">Suppliers Master committed atomically to live Supabase storage.</p>

          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin:20px 0;">
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">CREATED</div>
              <div style="font-size:1.3rem; font-weight:700; color:var(--status-success); margin-top:2px;">${res.createdCount}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">UPDATED</div>
              <div style="font-size:1.3rem; font-weight:700; color:var(--status-info); margin-top:2px;">${res.updatedCount}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">UNCHANGED</div>
              <div style="font-size:1.3rem; font-weight:700; color:var(--text-muted); margin-top:2px;">${res.unchangedCount}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">REJECTED</div>
              <div style="font-size:1.3rem; font-weight:700; color:var(--text-muted); margin-top:2px;">${res.rejectedCount}</div>
            </div>
          </div>

          <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:24px;">
            Import Audit ID: <strong style="font-family:monospace; color:var(--accent-primary);">${res.importId}</strong>
          </div>

          <div style="display:flex; justify-content:center; gap:12px;">
            <button type="button" id="btn-close-sup-modal-finish" class="btn-primary" style="padding:10px 24px; font-weight:700; background:var(--accent-primary); border-radius:6px; border:none; color:#fff; cursor:pointer;">
              Close & Refresh Suppliers
            </button>
          </div>
        </div>
      `;

      previewStep.querySelector('#btn-close-sup-modal-finish').addEventListener('click', async () => {
        overlay.remove();
        if (parentMount) {
          this.activeSubView = 'inv-suppliers';
          await this.render(parentMount, session);
        }
      });
    }
  }

  // --- SUPPLIER CATALOGUE WORKFLOWS & MODALS ---

  renderAddSupplierCatalogueModal(tenantId = 'tenant-demo', session = null, parentMount = null) {
    const existingModal = document.querySelector('#add-sup-cat-modal-overlay');
    if (existingModal) existingModal.remove();

    const suppliers = supplierImportController._getCollection('suppliers', tenantId);
    const items = this._getCollection('inventory', tenantId);

    const overlay = document.createElement('div');
    overlay.id = 'add-sup-cat-modal-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px);
      display: flex; justify-content: center; align-items: center; z-index: 9999;
      animation: fadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
      <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:12px; width:560px; max-width:92vw; overflow:hidden; box-shadow:0 20px 40px rgba(0,0,0,0.4);">
        <div style="padding:20px 24px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin:0; color:var(--accent-primary); font-size:1.2rem;">📦 Add Supplier Catalogue Item</h3>
            <p style="color:var(--text-muted); font-size:0.8rem; margin:2px 0 0 0;">Map Supplier to Anchor Inventory Master Item with Commercial Terms</p>
          </div>
          <button type="button" id="btn-close-add-sup-cat" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">×</button>
        </div>
        <div style="padding:24px; display:flex; flex-direction:column; gap:14px; font-size:0.85rem;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Supplier *</label>
              <select id="sel-new-cat-sup" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                ${suppliers.map(s => `<option value="${s.supplierCode || s.supplier_code}">${s.supplierName || s.supplier_name} (${s.supplierCode || s.supplier_code})</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Anchor Inventory Item *</label>
              <select id="sel-new-cat-item" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                ${items.map(i => `<option value="${i.itemCode || i.item_code}">${i.itemName || i.item_name} (${i.itemCode || i.item_code})</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Supplier SKU</label>
              <input type="text" id="inp-new-cat-sku" placeholder="e.g. ON-50" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main); font-family:monospace;" />
            </div>
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Supplier Item Description</label>
              <input type="text" id="inp-new-cat-desc" placeholder="e.g. Fresh Farm Onion" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Purchase UOM *</label>
              <input type="text" id="inp-new-cat-uom" placeholder="e.g. BAG, BOX" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
            </div>
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Pack Qty *</label>
              <input type="number" id="inp-new-cat-pack-qty" placeholder="e.g. 50" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
            </div>
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Pack UOM *</label>
              <input type="text" id="inp-new-cat-pack-uom" placeholder="e.g. KG, ML" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Unit Price (₹) *</label>
              <input type="number" id="inp-new-cat-price" placeholder="e.g. 2000" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
            </div>
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">GST Rate (%)</label>
              <input type="number" id="inp-new-cat-gst" placeholder="e.g. 5 (or blank)" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
            </div>
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">MOQ (Units)</label>
              <input type="number" id="inp-new-cat-moq" placeholder="1" value="1" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" id="chk-new-cat-preferred" checked style="width:16px; height:16px; cursor:pointer;" />
            <label for="chk-new-cat-preferred" style="font-weight:600; cursor:pointer;">Set as Preferred Supplier for this Inventory Item (Max 1 per Item)</label>
          </div>
        </div>
        <div style="padding:16px 24px; background:var(--bg-surface-2); border-top:1px solid var(--border-subtle); display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" id="btn-cancel-add-sup-cat" class="btn-secondary" style="padding:8px 16px; cursor:pointer;">Cancel</button>
          <button type="button" id="btn-save-new-sup-cat" class="btn-primary" style="padding:8px 20px; font-weight:700; background:var(--accent-primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">Create Catalogue Mapping</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeFn = () => overlay.remove();
    overlay.querySelector('#btn-close-add-sup-cat').addEventListener('click', closeFn);
    overlay.querySelector('#btn-cancel-add-sup-cat').addEventListener('click', closeFn);

    overlay.querySelector('#btn-save-new-sup-cat').addEventListener('click', async () => {
      const supCode = overlay.querySelector('#sel-new-cat-sup').value;
      const itemCode = overlay.querySelector('#sel-new-cat-item').value;
      const sku = overlay.querySelector('#inp-new-cat-sku').value.trim();
      const desc = overlay.querySelector('#inp-new-cat-desc').value.trim();
      const uom = overlay.querySelector('#inp-new-cat-uom').value.trim().toUpperCase();
      const packQty = overlay.querySelector('#inp-new-cat-pack-qty').value.trim();
      const packUom = overlay.querySelector('#inp-new-cat-pack-uom').value.trim().toUpperCase();
      const price = overlay.querySelector('#inp-new-cat-price').value.trim();
      const gst = overlay.querySelector('#inp-new-cat-gst').value.trim();
      const moq = overlay.querySelector('#inp-new-cat-moq').value.trim();
      const isPref = overlay.querySelector('#chk-new-cat-preferred').checked;

      if (!supCode || !itemCode || !uom || !packQty || !packUom || !price) {
        alert('Please fill in mandatory fields: Supplier, Item, Purchase UOM, Pack Quantity, Pack UOM, and Unit Price.');
        return;
      }

      await supplierCatalogueController.commitImport([{
        supplier_code: supCode,
        item_code: itemCode,
        supplier_sku: sku,
        supplier_item_name: desc,
        purchase_uom: uom,
        pack_quantity: packQty,
        pack_uom: packUom,
        unit_price: price,
        gst_rate: gst,
        moq: moq || '1',
        lead_time_days: '2',
        preferred: isPref ? 'true' : 'false',
        active: 'true'
      }], tenantId);

      overlay.remove();
      if (parentMount) await this.render(parentMount, session);
    });
  }

  openSupplierCatalogueDetailDrawer(supplierCode, itemCode, tenantId = 'tenant-demo', parentMount = null, session = null) {
    const existingDrawer = document.querySelector('#sup-cat-detail-drawer-overlay');
    if (existingDrawer) existingDrawer.remove();

    const catalogueList = supplierCatalogueController._getCollection('supplier_catalogue', tenantId);
    const itemCat = catalogueList.find(c => (c.supplierCode || c.supplier_code) === supplierCode && (c.itemCode || c.item_code) === itemCode) || {
      supplierCode,
      itemCode,
      supplierSku: itemCode,
      purchaseUom: 'BAG',
      packQuantity: 50,
      packUom: 'KG',
      unitPrice: 2000,
      gstRate: 5
    };

    const suppliers = supplierImportController._getCollection('suppliers', tenantId);
    const items = this._getCollection('inventory', tenantId);

    const supObj = suppliers.find(s => (s.supplierCode || s.supplier_code) === supplierCode) || {};
    const itemObj = items.find(i => (i.itemCode || i.item_code) === itemCode) || {};

    const price = parseFloat(itemCat.unitPrice !== undefined ? itemCat.unitPrice : (itemCat.unit_price || 0));
    const gst = itemCat.gstRate !== undefined && itemCat.gstRate !== null ? `${itemCat.gstRate}%` : (itemCat.gst_rate !== undefined && itemCat.gst_rate !== null ? `${itemCat.gst_rate}%` : 'Unassigned');
    const packQty = itemCat.packQuantity || itemCat.pack_quantity || 1;
    const packUom = itemCat.packUom || itemCat.pack_uom || 'KG';
    const uom = itemCat.purchaseUom || itemCat.purchase_uom || 'BAG';

    // Price History calculation
    const priceHist = Array.isArray(itemCat.priceHistory) ? itemCat.priceHistory : [];
    const lastPurchasePrice = priceHist.length ? priceHist[priceHist.length - 1].newPrice : price;

    const overlay = document.createElement('div');
    overlay.id = 'sup-cat-detail-drawer-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(4px);
      display: flex; justify-content: flex-end; z-index: 9999;
      animation: fadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
      <div style="background:var(--bg-surface-1); border-left:1px solid var(--border-subtle); width:460px; height:100vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:-10px 0 25px rgba(0,0,0,0.3);">
        <div style="padding:20px 24px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">CATALOGUE ITEM DETAILS</div>
            <h3 style="margin:2px 0 0 0; color:var(--accent-primary); font-size:1.2rem;">${itemObj.itemName || itemObj.item_name || itemCat.supplierItemName || itemCode}</h3>
          </div>
          <button type="button" id="btn-close-sup-cat-drawer" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">×</button>
        </div>

        <div style="padding:24px; flex:1; overflow-y:auto; font-size:0.85rem; display:flex; flex-direction:column; gap:16px;">
          <!-- SUPPLIER & ITEM BADGES -->
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; justify-content:space-between;">
              <span style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">SUPPLIER</span>
              <span style="font-weight:700; font-family:monospace; color:var(--accent-primary);">${supplierCode}</span>
            </div>
            <div style="font-weight:700; font-size:0.9rem; color:var(--text-main);">${supObj.supplierName || supObj.supplier_name || supplierCode}</div>
            
            <div style="border-top:1px solid var(--border-subtle); margin-top:6px; padding-top:6px; display:flex; justify-content:space-between;">
              <span style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">ANCHOR MASTER ITEM</span>
              <span style="font-weight:700; font-family:monospace; color:var(--accent-primary);">${itemCode}</span>
            </div>
            <div style="font-weight:700; font-size:0.9rem; color:var(--text-main);">${itemObj.itemName || itemObj.item_name || itemCode}</div>
          </div>

          <!-- PACKAGING MATH -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">PURCHASE UOM</div>
              <div style="font-weight:700; color:var(--text-main); margin-top:2px;"><span class="badge badge-info">${uom}</span></div>
            </div>
            <div>
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">STRUCTURED PACK</div>
              <div style="font-weight:700; color:var(--text-main); margin-top:2px;">${packQty} ${packUom} / ${uom}</div>
            </div>
          </div>

          <!-- COMMERCIAL TERMS -->
          <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; border-left:4px solid var(--status-success); display:flex; flex-direction:column; gap:8px;">
            <div style="font-weight:700; color:var(--status-success); font-size:0.8rem;">COMMERCIAL TERMS</div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted);">Catalogue Unit Price:</span>
              <strong style="color:var(--status-success); font-size:1rem;">₹${price.toLocaleString('en-IN')} / ${uom}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted);">GST Rate:</span>
              <strong>${gst}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted);">Minimum Order Qty (MOQ):</span>
              <strong>${itemCat.moq || 1} ${uom}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted);">Delivery Lead Time:</span>
              <strong>${itemCat.leadTimeDays || itemCat.lead_time_days || 2} Days</strong>
            </div>
          </div>

          <!-- PRICE INTELLIGENCE & HISTORY SUMMARY -->
          <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; border:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:8px;">
            <div style="font-weight:700; color:var(--accent-primary); font-size:0.8rem; display:flex; justify-content:space-between;">
              <span>PRICE INTELLIGENCE</span>
              <span style="font-size:0.7rem; font-weight:600; color:var(--text-muted);">${priceHist.length} Revisions Recorded</span>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:0.8rem;">
              <div style="background:var(--bg-surface-1); padding:8px; border-radius:4px;">
                <div style="font-size:0.68rem; color:var(--text-muted);">Current Catalogue</div>
                <div style="font-weight:700; color:var(--status-success);">₹${price.toLocaleString('en-IN')}</div>
              </div>
              <div style="background:var(--bg-surface-1); padding:8px; border-radius:4px;">
                <div style="font-size:0.68rem; color:var(--text-muted);">Last Purchase Price</div>
                <div style="font-weight:700; color:var(--status-info);">₹${lastPurchasePrice.toLocaleString('en-IN')}</div>
              </div>
            </div>
          </div>
        </div>

        <div style="padding:16px 24px; background:var(--bg-surface-2); border-top:1px solid var(--border-subtle); display:flex; gap:10px;">
          <button type="button" id="btn-close-sup-cat-drawer-bottom" class="btn-secondary" style="flex:1; padding:8px; cursor:pointer;">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeFn = () => overlay.remove();
    overlay.querySelector('#btn-close-sup-cat-drawer').addEventListener('click', closeFn);
    overlay.querySelector('#btn-close-sup-cat-drawer-bottom').addEventListener('click', closeFn);
  }

  handleSupplierCatalogueExport(tenantId = 'tenant-demo') {
    const csv = supplierCatalogueController.exportLiveCatalogueCsv(tenantId);
    this._triggerDownload(csv, 'supplier_catalogue.csv');
  }

  handleSupplierCatalogueTemplateDownload() {
    const csv = supplierCatalogueController.generateTemplateCsv();
    this._triggerDownload(csv, 'supplier_catalogue_template.csv');
  }

  openSupplierCatalogueImportModal(tenantId = 'tenant-demo', session = null, parentMount = null) {
    const existingModal = document.querySelector('#import-sup-cat-modal-overlay');
    if (existingModal) existingModal.remove();

    const overlay = document.createElement('div');
    overlay.id = 'import-sup-cat-modal-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px);
      display: flex; justify-content: center; align-items: center; z-index: 9999;
      animation: fadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
      <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:12px; width:720px; max-width:94vw; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 40px rgba(0,0,0,0.4);">
        <div style="padding:20px 24px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin:0; color:var(--accent-primary); font-size:1.2rem;">📦 IMPORT SUPPLIER CATALOGUE</h3>
            <p style="color:var(--text-muted); font-size:0.8rem; margin:2px 0 0 0;">Incremental Commercial Mapping Import</p>
          </div>
          <button type="button" id="btn-close-sup-cat-import-modal" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">×</button>
        </div>

        <!-- 5 STEP PIPELINE BAR -->
        <div style="background:var(--bg-surface-2); padding:10px 24px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; color:var(--text-muted);">
          <span id="step-lbl-sup-cat-1" style="color:var(--accent-primary);">STEP 1: Upload</span> ➔ 
          <span id="step-lbl-sup-cat-2">STEP 2: Validate</span> ➔ 
          <span id="step-lbl-sup-cat-3">STEP 3: Diff</span> ➔ 
          <span id="step-lbl-sup-cat-4">STEP 4: Commit</span> ➔ 
          <span id="step-lbl-sup-cat-5">STEP 5: Result</span>
        </div>

        <div id="import-sup-cat-modal-body" style="padding:24px; flex:1; overflow-y:auto; font-size:0.85rem;">
          <!-- STEP 1: UPLOAD DROPZONE -->
          <div id="import-sup-cat-step-upload">
            <div id="sup-cat-csv-dropzone" style="border:2px dashed var(--border-subtle); border-radius:8px; padding:36px 20px; text-align:center; background:var(--bg-surface-2); cursor:pointer;">
              <div style="font-size:2.4rem; margin-bottom:8px;">📄</div>
              <div style="font-weight:700; font-size:1rem; color:var(--text-main);">Drop your supplier_catalogue.csv file here</div>
              <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">or click to browse your local computer</div>
              <input type="file" id="file-sup-cat-csv-input" accept=".csv" style="display:none;" />
            </div>

            <div style="margin-top:20px; padding:12px 16px; background:rgba(99, 102, 241, 0.1); border-left:3px solid var(--accent-primary); border-radius:4px; font-size:0.78rem; color:var(--text-muted);">
              <strong style="color:var(--accent-primary);">Incremental Catalogue Contract:</strong>
              Composite key is <code>supplier_code + item_code</code>. Existing commercial mappings will be updated while preserving un-edited fields. Unknown suppliers or inventory items are hard errors (cannot auto-create master items). Duplicate composite keys inside a file block import. Max 1 preferred supplier per item is automatically enforced.
            </div>
          </div>

          <!-- PREVIEW / DIFF STEP CONTAINER -->
          <div id="import-sup-cat-step-preview" style="display:none;"></div>
        </div>

        <div id="import-sup-cat-modal-footer" style="padding:16px 24px; background:var(--bg-surface-2); border-top:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <button type="button" id="btn-cancel-sup-cat-modal" class="btn-secondary" style="padding:8px 16px; cursor:pointer;">Cancel</button>
          <div id="sup-cat-modal-commit-slot"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeFn = () => overlay.remove();
    overlay.querySelector('#btn-close-sup-cat-import-modal').addEventListener('click', closeFn);
    overlay.querySelector('#btn-cancel-sup-cat-modal').addEventListener('click', closeFn);

    const dropzone = overlay.querySelector('#sup-cat-csv-dropzone');
    const fileInput = overlay.querySelector('#file-sup-cat-csv-input');

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--accent-primary)';
      dropzone.style.background = 'rgba(99, 102, 241, 0.05)';
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = 'var(--border-subtle)';
      dropzone.style.background = 'var(--bg-surface-2)';
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--border-subtle)';
      dropzone.style.background = 'var(--bg-surface-2)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this._processSupplierCatalogueCsvFile(overlay, e.dataTransfer.files[0], tenantId, parentMount, session);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this._processSupplierCatalogueCsvFile(overlay, e.target.files[0], tenantId, parentMount, session);
      }
    });
  }

  _processSupplierCatalogueCsvFile(overlay, file, tenantId = 'tenant-demo', parentMount = null, session = null) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvText = e.target.result;
      const rows = supplierCatalogueController.parseCsv(csvText);
      if (rows.length === 0) {
        alert('CSV file appears empty or unreadable.');
        return;
      }
      this._renderSupplierCatalogueImportPreviewSteps(overlay, rows, tenantId, parentMount, session);
    };
    reader.readAsText(file);
  }

  _renderSupplierCatalogueImportPreviewSteps(overlay, rows = [], tenantId = 'tenant-demo', parentMount = null, session = null) {
    const uploadStep = overlay.querySelector('#import-sup-cat-step-upload');
    const previewStep = overlay.querySelector('#import-sup-cat-step-preview');
    const commitSlot = overlay.querySelector('#sup-cat-modal-commit-slot');

    if (uploadStep) uploadStep.style.display = 'none';
    if (previewStep) previewStep.style.display = 'block';

    overlay.querySelector('#step-lbl-sup-cat-2').style.color = 'var(--accent-primary)';
    overlay.querySelector('#step-lbl-sup-cat-3').style.color = 'var(--accent-primary)';

    const validation = supplierCatalogueController.validateRows(rows, tenantId);
    const diff = supplierCatalogueController.generateDiffPreview(rows, tenantId);
    const hasErrors = diff.ERRORS.length > 0;

    previewStep.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">IMPORT PREVIEW BREAKDOWN</div>
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px;">
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center; border:1px solid var(--border-subtle);">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">NEW</div>
            <div style="font-size:1.4rem; font-weight:700; color:var(--status-success); margin-top:2px;">${diff.NEW.length}</div>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center; border:1px solid var(--border-subtle);">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">UPDATED</div>
            <div style="font-size:1.4rem; font-weight:700; color:var(--status-info); margin-top:2px;">${diff.UPDATED.length}</div>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center; border:1px solid var(--border-subtle);">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">UNCHANGED</div>
            <div style="font-size:1.4rem; font-weight:700; color:var(--text-muted); margin-top:2px;">${diff.UNCHANGED.length}</div>
          </div>
          <div style="background:${hasErrors ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-surface-2)'}; padding:12px; border-radius:6px; text-align:center; border:${hasErrors ? '1px solid var(--status-danger)' : '1px solid var(--border-subtle)'};">
            <div style="font-size:0.7rem; color:${hasErrors ? 'var(--status-danger)' : 'var(--text-muted)'}; font-weight:700;">ERRORS</div>
            <div style="font-size:1.4rem; font-weight:700; color:${hasErrors ? 'var(--status-danger)' : 'var(--text-muted)'}; margin-top:2px;">${diff.ERRORS.length} ${hasErrors ? '🔴' : ''}</div>
          </div>
        </div>
      </div>

      ${hasErrors ? `
        <div style="background:rgba(239, 68, 68, 0.1); border:1px solid var(--status-danger); padding:14px; border-radius:6px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-weight:700; color:var(--status-danger); font-size:0.88rem;">
              ⚠ IMPORT BLOCKED — ${diff.ERRORS.length} error(s) must be resolved before committing
            </div>
            <button type="button" id="btn-export-sup-cat-errors-csv" class="btn-secondary" style="font-size:0.75rem; padding:4px 10px; cursor:pointer; color:var(--status-danger); border-color:var(--status-danger);">
              ⬇ Export Error Report
            </button>
          </div>
          <ul style="margin:0; padding-left:20px; font-size:0.8rem; color:var(--status-danger); max-height:120px; overflow-y:auto;">
            ${diff.ERRORS.map(e => `<li>Row ${e.row} [${e.supplierCode} + ${e.itemCode}]: ${e.message}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${diff.NEW.length > 0 ? `
        <div style="margin-bottom:16px;">
          <div style="font-weight:700; font-size:0.85rem; color:var(--status-success); margin-bottom:6px;">NEW CATALOGUE MAPPINGS TO CREATE (${diff.NEW.length})</div>
          <div style="max-height:140px; overflow-y:auto; font-size:0.8rem; color:var(--text-muted); display:flex; flex-direction:column; gap:4px;">
            ${diff.NEW.map(n => `
              <div style="background:var(--bg-surface-2); padding:6px 10px; border-radius:4px; font-family:monospace; color:var(--text-main); font-size:0.8rem;">
                📦 CATALOGUE: ${n.supplierCode} ➔ ${n.itemCode} (${n.purchaseUom}, ${n.packQuantity} ${n.packUom}, ₹${n.unitPrice})
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${diff.UPDATED.length > 0 ? `
        <div style="margin-bottom:16px;">
          <div style="font-weight:700; font-size:0.85rem; color:var(--accent-primary); margin-bottom:8px;">UPDATED CATALOGUE COMPARISON (${diff.UPDATED.length})</div>
          <div style="max-height:180px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">
            ${diff.UPDATED.map(u => `
              <div style="background:var(--bg-surface-2); border-left:3px solid var(--accent-primary); padding:10px; border-radius:4px;">
                <div style="font-weight:700; font-size:0.85rem; font-family:monospace; color:var(--accent-primary);">📦 CATALOGUE: ${u.supplierCode} ➔ ${u.itemCode}</div>
                <table style="width:100%; font-size:0.78rem; margin-top:6px; border-collapse:collapse;">
                  <thead>
                    <tr style="color:var(--text-muted); text-align:left; border-bottom:1px solid var(--border-subtle);">
                      <th style="padding:4px;">Field</th><th style="padding:4px;">EXISTING</th><th style="padding:4px;">IMPORT</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${u.fieldChanges.map(fc => `
                      <tr>
                        <td style="padding:4px; font-weight:600;">${fc.field}</td>
                        <td style="padding:4px; color:var(--text-muted);">${fc.existing}</td>
                        <td style="padding:4px; color:var(--accent-primary); font-weight:700;">${fc.import} ← CHANGED</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    if (hasErrors) {
      commitSlot.innerHTML = `
        <button type="button" class="btn-secondary" disabled style="padding:8px 18px; font-weight:700; opacity:0.5; cursor:not-allowed; border-radius:6px;">
          🔒 Commit Import (Blocked)
        </button>
      `;
      const btnExportErr = overlay.querySelector('#btn-export-sup-cat-errors-csv');
      if (btnExportErr) {
        btnExportErr.addEventListener('click', () => {
          const errCsv = supplierCatalogueController.generateErrorReportCsv(diff.ERRORS);
          this._triggerDownload(errCsv, 'supplier_catalogue_import_errors.csv');
        });
      }
    } else {
      overlay.querySelector('#step-lbl-sup-cat-4').style.color = 'var(--accent-primary)';
      const changeCount = diff.NEW.length + diff.UPDATED.length;
      commitSlot.innerHTML = `
        <button type="button" id="btn-commit-sup-cat-import-action" class="btn-primary" style="padding:8px 20px; font-weight:700; background:var(--status-success); border-color:var(--status-success); color:#fff; border-radius:6px; cursor:pointer;">
          ✓ Commit ${changeCount} Changes
        </button>
      `;

      overlay.querySelector('#btn-commit-sup-cat-import-action').addEventListener('click', async () => {
        const btnCommit = overlay.querySelector('#btn-commit-sup-cat-import-action');
        btnCommit.disabled = true;
        btnCommit.textContent = '⏳ Committing...';
        const res = await supplierCatalogueController.commitImport(rows, tenantId);
        this._renderSupplierCatalogueImportResultStep(overlay, res, parentMount, session);
      });
    }
  }

  _renderSupplierCatalogueImportResultStep(overlay, res = {}, parentMount = null, session = null) {
    const previewStep = overlay.querySelector('#import-sup-cat-step-preview');
    const footer = overlay.querySelector('#import-sup-cat-modal-footer');

    overlay.querySelector('#step-lbl-sup-cat-5').style.color = 'var(--status-success)';

    if (footer) footer.style.display = 'none';

    if (previewStep) {
      previewStep.innerHTML = `
        <div style="text-align:center; padding:16px 0;">
          <div style="font-size:3rem; margin-bottom:10px;">✅</div>
          <h3 style="margin:0; color:var(--status-success); font-size:1.3rem;">✓ SUPPLIER CATALOGUE IMPORT COMPLETED</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-top:4px;">Commercial catalogue mappings committed atomically to live Supabase storage.</p>

          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin:20px 0;">
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">CREATED</div>
              <div style="font-size:1.3rem; font-weight:700; color:var(--status-success); margin-top:2px;">${res.createdCount}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">UPDATED</div>
              <div style="font-size:1.3rem; font-weight:700; color:var(--status-info); margin-top:2px;">${res.updatedCount}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">UNCHANGED</div>
              <div style="font-size:1.3rem; font-weight:700; color:var(--text-muted); margin-top:2px;">${res.unchangedCount}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">REJECTED</div>
              <div style="font-size:1.3rem; font-weight:700; color:var(--text-muted); margin-top:2px;">${res.rejectedCount}</div>
            </div>
          </div>

          <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:24px;">
            Import Audit ID: <strong style="font-family:monospace; color:var(--accent-primary);">${res.importId}</strong>
          </div>

          <div style="display:flex; justify-content:center; gap:12px;">
            <button type="button" id="btn-close-sup-cat-modal-finish" class="btn-primary" style="padding:10px 24px; font-weight:700; background:var(--accent-primary); border-radius:6px; border:none; color:#fff; cursor:pointer;">
              Close & Refresh Catalogue
            </button>
          </div>
        </div>
      `;

      previewStep.querySelector('#btn-close-sup-cat-modal-finish').addEventListener('click', async () => {
        overlay.remove();
        if (parentMount) {
          this.activeSubView = 'inv-supplier-catalogue';
          await this.render(parentMount, session);
        }
      });
    }
  }

  // --- MASTER INVENTORY CONTROLLED CRUD & AUDIT DRAWER ---

  openMasterItemDetailDrawer(itemCode, tenantId = 'tenant-demo', parentMount = null, session = null) {
    const existingDrawer = document.querySelector('#master-item-detail-drawer-overlay');
    if (existingDrawer) existingDrawer.remove();

    const items = this._getCollection('inventory', tenantId);
    const item = items.find(i => (i.itemCode || i.item_code || i.sku || i.id || '').toUpperCase() === (itemCode || '').toUpperCase()) || {
      itemCode,
      itemName: itemCode,
      itemType: 'RAW_MATERIAL',
      categoryCode: 'GENERAL',
      baseUom: 'KG',
      purchaseUom: 'KG',
      conversionFactor: 1,
      reorderLevel: 10,
      active: true
    };

    const code = item.itemCode || item.item_code || itemCode;
    const name = item.itemName || item.item_name || item.name || code;
    const type = item.itemType || item.item_type || 'RAW_MATERIAL';
    const category = item.categoryCode || item.category_code || item.category || 'GENERAL';
    const baseUom = item.baseUom || item.base_uom || 'KG';
    const purchaseUom = item.purchaseUom || item.purchase_uom || baseUom;
    const conv = item.conversionFactor || item.conversion_factor || 1;
    const reorderLevel = item.reorderLevel !== undefined ? item.reorderLevel : (item.reorder_level || 10);
    const active = item.active !== false;

    // Derived Product Family
    const productFamily = category.startsWith('CAT-') ? `FAM-${category.substring(4)}` : 'FAM-GENERAL';
    const changeHistory = Array.isArray(item.changeHistory) ? item.changeHistory : [];

    const overlay = document.createElement('div');
    overlay.id = 'master-item-detail-drawer-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(4px);
      display: flex; justify-content: flex-end; z-index: 9999;
      animation: fadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
      <div style="background:var(--bg-surface-1); border-left:1px solid var(--border-subtle); width:480px; height:100vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:-10px 0 25px rgba(0,0,0,0.3);">
        <div style="padding:20px 24px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">MASTER INVENTORY ITEM</div>
            <h3 style="margin:2px 0 0 0; color:var(--accent-primary); font-size:1.2rem;">${name}</h3>
          </div>
          <button type="button" id="btn-close-master-drawer" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">×</button>
        </div>

        <div style="padding:24px; flex:1; overflow-y:auto; font-size:0.85rem; display:flex; flex-direction:column; gap:16px;">
          
          <!-- STATUS & IMMUTABLE CODE HEADER -->
          <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-2); padding:12px; border-radius:6px; border:1px solid var(--border-subtle);">
            <div>
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">ITEM CODE (IMMUTABLE 🔒)</div>
              <div style="font-weight:700; font-family:monospace; font-size:1.1rem; color:var(--accent-primary); margin-top:2px;">${code}</div>
            </div>
            <span class="badge ${active ? 'badge-success' : 'badge-secondary'}" style="font-size:0.8rem; padding:4px 10px;">${active ? 'ACTIVE' : 'INACTIVE'}</span>
          </div>

          <!-- IDENTITY SECTION -->
          <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; border:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:8px;">
            <div style="font-weight:700; color:var(--accent-primary); font-size:0.8rem;">IDENTITY & TAXONOMY</div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted);">Item Name:</span>
              <strong style="color:var(--text-main);">${name}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted);">Item Type:</span>
              <span class="badge badge-info">${type}</span>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted);">Category Code:</span>
              <strong>${category}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted);">Derived Product Family:</span>
              <strong style="color:var(--text-muted);">${productFamily}</strong>
            </div>
          </div>

          <!-- UNITS & PACKAGING -->
          <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; border:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:8px;">
            <div style="font-weight:700; color:var(--accent-primary); font-size:0.8rem;">UNITS & CONVERSION</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div>
                <span style="font-size:0.7rem; color:var(--text-muted); font-weight:700; display:block;">BASE UOM</span>
                <span class="badge badge-secondary" style="margin-top:2px;">${baseUom}</span>
              </div>
              <div>
                <span style="font-size:0.7rem; color:var(--text-muted); font-weight:700; display:block;">PURCHASE UOM</span>
                <span class="badge badge-secondary" style="margin-top:2px;">${purchaseUom}</span>
              </div>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:4px;">
              <span style="color:var(--text-muted);">Conversion Factor:</span>
              <strong>${conv} ${baseUom} / ${purchaseUom}</strong>
            </div>
          </div>

          <!-- PROCUREMENT & REORDER -->
          <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; border-left:4px solid var(--status-warning); display:flex; flex-direction:column; gap:8px;">
            <div style="font-weight:700; color:var(--status-warning); font-size:0.8rem;">PROCUREMENT & THRESHOLDS</div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted);">Reorder Level:</span>
              <strong style="color:var(--status-warning); font-size:0.95rem;">${reorderLevel} ${baseUom}</strong>
            </div>
          </div>

          <!-- AUDIT TRAIL & CHANGE HISTORY -->
          <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; border:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:8px;">
            <div style="font-weight:700; color:var(--accent-primary); font-size:0.8rem; display:flex; justify-content:space-between;">
              <span>AUDIT TRAIL & CHANGE HISTORY</span>
              <span style="font-size:0.7rem; font-weight:600; color:var(--text-muted);">${changeHistory.length} Revisions Logged</span>
            </div>

            ${changeHistory.length > 0 ? `
              <div style="max-height:160px; overflow-y:auto; font-size:0.78rem; display:flex; flex-direction:column; gap:6px;">
                ${changeHistory.map(ch => `
                  <div style="background:var(--bg-surface-1); padding:8px; border-radius:4px; border-left:2px solid var(--accent-primary);">
                    <div style="display:flex; justify-content:space-between; color:var(--text-muted); font-size:0.7rem;">
                      <span>${new Date(ch.timestamp).toLocaleDateString()} ${new Date(ch.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span style="font-weight:600;">${ch.changedBy || 'Manager'}</span>
                    </div>
                    <div style="color:var(--text-main); font-weight:600; margin-top:2px;">
                      ${ch.field}: <span style="color:var(--text-muted);">${ch.previousValue}</span> ➔ <span style="color:var(--status-success); font-weight:700;">${ch.newValue}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div style="font-size:0.78rem; color:var(--text-muted);">
                Item created via master setup import. No manual attribute edits recorded.
              </div>
            `}
          </div>
        </div>

        <div style="padding:16px 24px; background:var(--bg-surface-2); border-top:1px solid var(--border-subtle); display:flex; gap:10px;">
          <button type="button" id="btn-edit-master-item-drawer" class="btn-primary" style="flex:1; padding:8px 16px; font-weight:700; background:var(--accent-primary); border:none; border-radius:6px; cursor:pointer; color:#fff;">
            ✏ Edit Item Attributes
          </button>
          <button type="button" id="btn-deactivate-master-item-drawer" class="btn-secondary" style="padding:8px 16px; font-weight:700; cursor:pointer; color:${active ? 'var(--status-danger)' : 'var(--status-success)'}; border-color:${active ? 'var(--status-danger)' : 'var(--status-success)'};">
            ${active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeFn = () => overlay.remove();
    overlay.querySelector('#btn-close-master-drawer').addEventListener('click', closeFn);

    overlay.querySelector('#btn-edit-master-item-drawer').addEventListener('click', () => {
      overlay.remove();
      this.renderEditMasterItemModal(code, tenantId, session, parentMount);
    });

    overlay.querySelector('#btn-deactivate-master-item-drawer').addEventListener('click', async () => {
      const newActiveState = !active;
      const confirmMsg = newActiveState 
        ? `Activate master item "${name}" (${code})?`
        : `Deactivate master item "${name}" (${code})?\n\nInactive items remain in historical transaction ledgers for reporting but cannot be selected in new POs, recipes, or stock transactions.`;

      if (confirm(confirmMsg)) {
        await inventoryItemModel.updateItem(code, { active: newActiveState }, (session && session.userName) || 'Inventory Manager', tenantId);
        overlay.remove();
        if (parentMount) await this.render(parentMount, session);
      }
    });
  }

  renderEditMasterItemModal(itemCode, tenantId = 'tenant-demo', session = null, parentMount = null) {
    const existingModal = document.querySelector('#edit-master-item-modal-overlay');
    if (existingModal) existingModal.remove();

    const items = this._getCollection('inventory', tenantId);
    const item = items.find(i => (i.itemCode || i.item_code || i.sku || i.id || '').toUpperCase() === (itemCode || '').toUpperCase()) || {};

    const code = item.itemCode || item.item_code || itemCode;
    const name = item.itemName || item.item_name || item.name || '';
    const type = item.itemType || item.item_type || 'RAW_MATERIAL';
    const category = item.categoryCode || item.category_code || item.category || 'GENERAL';
    const baseUom = item.baseUom || item.base_uom || 'KG';
    const purchaseUom = item.purchaseUom || item.purchase_uom || baseUom;
    const conv = item.conversionFactor || item.conversion_factor || 1;
    const reorderLevel = item.reorderLevel !== undefined ? item.reorderLevel : (item.reorder_level || 10);

    const categories = this._getUnifiedCategories(tenantId);

    const overlay = document.createElement('div');
    overlay.id = 'edit-master-item-modal-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px);
      display: flex; justify-content: center; align-items: center; z-index: 9999;
      animation: fadeIn 0.2s ease-out;
    `;

    overlay.innerHTML = `
      <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:12px; width:540px; max-width:92vw; overflow:hidden; box-shadow:0 20px 40px rgba(0,0,0,0.4);">
        <div style="padding:20px 24px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin:0; color:var(--accent-primary); font-size:1.2rem;">✏ Edit Master Inventory Item</h3>
            <p style="color:var(--text-muted); font-size:0.8rem; margin:2px 0 0 0;">Controlled update with field-level change history audit logging</p>
          </div>
          <button type="button" id="btn-close-edit-master-item" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">×</button>
        </div>
        <div style="padding:24px; display:flex; flex-direction:column; gap:14px; font-size:0.85rem;">
          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px; color:var(--text-muted);">Item Code (IMMUTABLE 🔒)</label>
            <input type="text" value="${code}" disabled style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--accent-primary); font-family:monospace; font-weight:700; cursor:not-allowed;" />
          </div>

          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px;">Item Name *</label>
            <input type="text" id="inp-edit-item-name" value="${name}" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Item Type *</label>
              <select id="sel-edit-item-type" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                <option value="Raw Material" ${type === 'Raw Material' || type === 'RAW_MATERIAL' ? 'selected' : ''}>Raw Material</option>
                <option value="Semi Finished" ${type === 'Semi Finished' || type === 'SEMI_FINISHED' ? 'selected' : ''}>Semi Finished</option>
                <option value="Packaging" ${type === 'Packaging' || type === 'PACKAGING' ? 'selected' : ''}>Packaging</option>
                <option value="Consumable" ${type === 'Consumable' || type === 'CONSUMABLE' ? 'selected' : ''}>Consumable</option>
              </select>
            </div>
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Category *</label>
              <select id="inp-edit-item-cat" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);">
                ${categories.map(c => {
                  const cCode = c.categoryCode || c.category_code;
                  const cName = c.categoryName || c.category_name;
                  const isSel = cCode.toUpperCase() === category.toUpperCase();
                  return `<option value="${cCode}" ${isSel ? 'selected' : ''}>${cName} (${cCode})</option>`;
                }).join('')}
              </select>
            </div>
          </div>

          <div id="item-type-change-warning" style="display:none; padding:10px; background:rgba(234, 179, 8, 0.1); border-left:3px solid var(--status-warning); border-radius:4px; font-size:0.78rem; color:var(--status-warning);">
            ⚠ Changing Item Type (e.g. Raw Material ➔ Semi Finished) alters Recipe BOM calculations and production batch rules.
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Base UOM *</label>
              <input type="text" id="inp-edit-base-uom" value="${baseUom}" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
            </div>
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Purchase UOM *</label>
              <input type="text" id="inp-edit-purchase-uom" value="${purchaseUom}" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
            </div>
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Conversion *</label>
              <input type="number" id="inp-edit-conv" value="${conv}" min="0.01" step="0.01" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
            </div>
          </div>

          <div>
            <label style="font-weight:700; display:block; margin-bottom:4px;">Reorder Level Threshold</label>
            <input type="number" id="inp-edit-reorder" value="${reorderLevel}" min="0" style="width:100%; padding:8px 12px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-main);" />
          </div>
        </div>
        <div style="padding:16px 24px; background:var(--bg-surface-2); border-top:1px solid var(--border-subtle); display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" id="btn-cancel-edit-master-item" class="btn-secondary" style="padding:8px 16px; cursor:pointer;">Cancel</button>
          <button type="button" id="btn-save-edit-master-item" class="btn-primary" style="padding:8px 20px; font-weight:700; background:var(--accent-primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">Save Changes & Audit Log</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeFn = () => overlay.remove();
    overlay.querySelector('#btn-close-edit-master-item').addEventListener('click', closeFn);
    overlay.querySelector('#btn-cancel-edit-master-item').addEventListener('click', closeFn);

    const selType = overlay.querySelector('#sel-edit-item-type');
    const warningBox = overlay.querySelector('#item-type-change-warning');

    selType.addEventListener('change', () => {
      if (selType.value !== type) {
        warningBox.style.display = 'block';
      } else {
        warningBox.style.display = 'none';
      }
    });

    overlay.querySelector('#btn-save-edit-master-item').addEventListener('click', async () => {
      const newName = overlay.querySelector('#inp-edit-item-name').value.trim();
      const newType = selType.value;
      const newCat = overlay.querySelector('#inp-edit-item-cat').value.trim().toUpperCase();
      const newBaseUom = overlay.querySelector('#inp-edit-base-uom').value.trim().toUpperCase();
      const newPurchaseUom = overlay.querySelector('#inp-edit-purchase-uom').value.trim().toUpperCase();
      const newConv = parseFloat(overlay.querySelector('#inp-edit-conv').value) || 1;
      const newReorder = parseFloat(overlay.querySelector('#inp-edit-reorder').value) || 0;

      if (!newName || !newCat || !newBaseUom) {
        alert('Please fill in mandatory fields: Item Name, Category Code, and Base UOM.');
        return;
      }

      const updates = {
        itemName: newName,
        item_name: newName,
        itemType: newType,
        item_type: newType,
        categoryCode: newCat,
        category_code: newCat,
        baseUom: newBaseUom,
        base_uom: newBaseUom,
        purchaseUom: newPurchaseUom,
        purchase_uom: newPurchaseUom,
        conversionFactor: newConv,
        conversion_factor: newConv,
        reorderLevel: newReorder,
        reorder_level: newReorder
      };

      await inventoryItemModel.updateItem(code, updates, (session && session.userName) || 'Inventory Manager', tenantId);

      overlay.remove();
      if (parentMount) await this.render(parentMount, session);
    });
  }
}



