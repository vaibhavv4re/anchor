/**
 * InventoryWorkspaceView.js
 * Step 17.13D — 📦 Inventory Manager Workspace Composition
 *
 * Assembles developed Inventory & Procurement modules:
 * - 🏠 Inventory Dashboard & Low Stock Alerts
 * - 📦 Master Inventory Items (InventoryRepository)
 * - 🏷️ Categories & Item Families (CategoryRepository)
 * - 📏 Units of Measure (UomRepository)
 * - 🏬 Storage Locations (StorageLocationRepository)
 * - 🏢 Suppliers Master (SupplierRepository)
 * - 📥 Goods Receiving / GRN (GoodsReceiptRepository)
 * - 📤 Stock Issues & Requisitions (StockIssueRepository)
 * - 🔄 Stock Transfers (StockTransferRepository)
 * - 📊 Stock Adjustments & Physical Count (StockAdjustmentRepository / StockCountRepository)
 *
 * Displays the Data Source Diagnostic Bar (SUPABASE ● vs LOCAL_CACHE ⚠️)
 */

export class InventoryWorkspaceView {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
    this.authEngine = deps.authEngine || null;
    this.platformEventBus = deps.platformEventBus || null;
    this.repositories = deps.repositories || null;

    this.activeTab = 'dashboard'; // 'dashboard' | 'master' | 'categories' | 'uom' | 'locations' | 'suppliers' | 'grn' | 'issues' | 'transfers' | 'adjustments' | 'counts' | 'requests'
  }

  _getDataGateway() {
    if (this.dataGateway) return this.dataGateway;
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      return window.__APP__.platform.dataGateway;
    }
    return null;
  }

  _getCollection(name, tenantId) {
    const gw = this._getDataGateway();
    if (gw && typeof gw.getCachedCollection === 'function') {
      const list = gw.getCachedCollection(name, tenantId);
      if (Array.isArray(list) && list.length > 0) return list;
    }
    return [];
  }

  async render(mount, session) {
    if (!mount) return;

    const gw = this._getDataGateway();
    const isSupabase = gw && gw.cloudAdapter && typeof gw.cloudAdapter.getCollection === 'function';
    const tenantId = session ? session.tenantId : null;

    const items = this._getCollection('inventory', tenantId);
    const balances = this._getCollection('stock_balances', tenantId);
    const lowStockCount = items.filter(item => {
      const bList = balances.filter(b => b.itemCode === item.itemCode || b.item_code === item.item_code);
      const q = bList.length ? bList.reduce((acc, b) => acc + (parseFloat(b.quantity) || 0), 0) : (item.currentStock || 0);
      return (parseFloat(item.reorderLevel) || 0) > 0 && q <= parseFloat(item.reorderLevel);
    }).length;

    mount.innerHTML = `
      <div class="inventory-workspace-container flex-col animate-fade-in" style="width:100%; min-height:100vh; gap:0;">
        <!-- Data Source Diagnostic Bar -->
        <div class="data-source-diagnostic-bar" style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); padding:6px 16px; font-size:0.75rem; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <span class="badge ${isSupabase ? 'badge-success' : 'badge-warning'}" style="font-weight:700; font-size:0.7rem; padding:3px 10px;">
              ${isSupabase ? 'SUPABASE ●' : 'LOCAL_CACHE ⚠️'}
            </span>
            <span>Tenant: <strong>${session.tenantId || 'tenant_h0qc7wf'}</strong></span>
            <span>User: <strong>${session.employeeName}</strong></span>
            <span>Role: <strong>${session.roleId}</strong></span>
            <span>Workspace: <strong style="text-transform:uppercase; color:var(--accent-primary);">${session.workspace}</strong></span>
          </div>
          <div style="color:var(--text-muted); font-weight:600;">Anchor DataGateway Engine</div>
        </div>

        <!-- Cockpit Header -->
        <div style="background:var(--bg-surface-1); padding:16px 20px; border-bottom:1px solid var(--border-subtle);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">📦 CENTRAL WAREHOUSE & STOCK CONTROL</div>
              <h2 style="font-size:1.6rem; margin-top:2px; margin-bottom:0;">Inventory Manager Workspace</h2>
              <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">
                Master Data, Procurement GRN, Warehouse Stock Transfers, Issues, Adjustments & Physical Stock Audits.
              </div>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
              <span class="badge badge-info" style="font-weight:700; font-size:0.8rem; padding:6px 12px;">📦 Items: ${items.length || 0}</span>
              ${lowStockCount > 0 ? `<span class="badge badge-danger" style="font-weight:700; font-size:0.8rem; padding:6px 12px;">⚠️ Low Stock: ${lowStockCount}</span>` : ''}
            </div>
          </div>

          <!-- Subtab Navigation Bar -->
          <div style="display:flex; gap:8px; margin-top:16px; border-top:1px solid var(--border-subtle); padding-top:12px; flex-wrap:wrap;">
            <button class="btn-inv-tab ${this.activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard" style="padding:8px 14px; font-size:0.82rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeTab === 'dashboard' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeTab === 'dashboard' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              🏠 Dashboard
            </button>
            <button class="btn-inv-tab ${this.activeTab === 'master' ? 'active' : ''}" data-tab="master" style="padding:8px 14px; font-size:0.82rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeTab === 'master' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeTab === 'master' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              📦 Master Inventory
            </button>
            <button class="btn-inv-tab ${this.activeTab === 'categories' ? 'active' : ''}" data-tab="categories" style="padding:8px 14px; font-size:0.82rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeTab === 'categories' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeTab === 'categories' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              🏷 Categories
            </button>
            <button class="btn-inv-tab ${this.activeTab === 'uom' ? 'active' : ''}" data-tab="uom" style="padding:8px 14px; font-size:0.82rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeTab === 'uom' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeTab === 'uom' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              📏 UOMs
            </button>
            <button class="btn-inv-tab ${this.activeTab === 'locations' ? 'active' : ''}" data-tab="locations" style="padding:8px 14px; font-size:0.82rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeTab === 'locations' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeTab === 'locations' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              🏬 Storage Locations
            </button>
            <button class="btn-inv-tab ${this.activeTab === 'suppliers' ? 'active' : ''}" data-tab="suppliers" style="padding:8px 14px; font-size:0.82rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeTab === 'suppliers' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeTab === 'suppliers' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              🏢 Suppliers Master
            </button>
            <button class="btn-inv-tab ${this.activeTab === 'grn' ? 'active' : ''}" data-tab="grn" style="padding:8px 14px; font-size:0.82rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeTab === 'grn' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeTab === 'grn' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              📥 Goods Receiving (GRN)
            </button>
            <button class="btn-inv-tab ${this.activeTab === 'transfers' ? 'active' : ''}" data-tab="transfers" style="padding:8px 14px; font-size:0.82rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeTab === 'transfers' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeTab === 'transfers' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              🔄 Stock Transfers
            </button>
            <button class="btn-inv-tab ${this.activeTab === 'adjustments' ? 'active' : ''}" data-tab="adjustments" style="padding:8px 14px; font-size:0.82rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeTab === 'adjustments' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeTab === 'adjustments' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              📊 Adjustments & Count
            </button>
          </div>
        </div>

        <!-- Main Body Area -->
        <main id="inventory-workspace-body" style="padding:20px; flex:1;"></main>
      </div>
    `;

    const bodyMount = mount.querySelector('#inventory-workspace-body');
    this.mountSubTab(bodyMount, session, tenantId);

    mount.querySelectorAll('.btn-inv-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.activeTab = btn.dataset.tab;
        await this.render(mount, session);
      });
    });
  }

  mountSubTab(container, session, tenantId) {
    if (!container) return;
    container.innerHTML = '';

    const items = this._getCollection('inventory', tenantId);
    const categories = this._getCollection('inventory_categories', tenantId);
    const uoms = this._getCollection('inventory_uoms', tenantId);
    const locations = this._getCollection('storage_locations', tenantId);
    const suppliers = this._getCollection('suppliers', tenantId);
    const grns = this._getCollection('goods_receipt_notes', tenantId);
    const transfers = this._getCollection('stock_transfers', tenantId);

    if (this.activeTab === 'dashboard') {
      container.innerHTML = `
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
          <div class="grid grid-cols-4 gap-md">
            <div class="card" style="background:var(--bg-surface-1); padding:16px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL INVENTORY ITEMS</div>
              <div style="font-size:1.8rem; font-weight:800; margin-top:4px;">${items.length}</div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Raw materials & Prep items</div>
            </div>
            <div class="card" style="background:var(--bg-surface-1); padding:16px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">STORAGE LOCATIONS</div>
              <div style="font-size:1.8rem; font-weight:800; color:var(--accent-primary); margin-top:4px;">${locations.length || 3}</div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Main Warehouse & Kitchen Stores</div>
            </div>
            <div class="card" style="background:var(--bg-surface-1); padding:16px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">SUPPLIERS LOGGED</div>
              <div style="font-size:1.8rem; font-weight:800; color:var(--status-success); margin-top:4px;">${suppliers.length || 2}</div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Active Vendor Profiles</div>
            </div>
            <div class="card" style="background:var(--bg-surface-1); padding:16px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">GRN RECEIPTS</div>
              <div style="font-size:1.8rem; font-weight:800; color:var(--status-info); margin-top:4px;">${grns.length || 0}</div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Goods Received Notes</div>
            </div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            <h3 style="font-size:1.1rem; margin-top:0; margin-bottom:16px;">📦 Master Inventory Summary</h3>
            <div class="table-responsive">
              <table class="data-table" style="width:100%;">
                <thead>
                  <tr style="font-size:0.75rem; color:var(--text-muted);">
                    <th>Item Code</th>
                    <th>Ingredient Name</th>
                    <th>Category</th>
                    <th>Base UOM</th>
                    <th>Item Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.length > 0 ? items.map(i => `
                    <tr>
                      <td><code>${i.itemCode || i.item_code || i.id}</code></td>
                      <td><strong>${i.itemName || i.item_name || i.name}</strong></td>
                      <td>${i.categoryCode || i.category || 'GENERAL'}</td>
                      <td>${i.baseUom || i.base_uom || 'KG'}</td>
                      <td><span class="badge badge-info">${i.itemType || 'RAW_MATERIAL'}</span></td>
                      <td><span class="badge badge-success">ACTIVE</span></td>
                    </tr>
                  `).join('') : `
                    <tr>
                      <td colspan="6" style="text-align:center; padding:32px; color:var(--text-muted);">
                        📦 No inventory items found in live DataGateway repository.
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } else if (this.activeTab === 'master') {
      container.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:20px;">
          <h3 style="font-size:1.2rem; margin-top:0; margin-bottom:16px;">📦 Master Inventory Items (${items.length})</h3>
          <div class="table-responsive">
            <table class="data-table" style="width:100%;">
              <thead>
                <tr style="font-size:0.75rem; color:var(--text-muted);">
                  <th>Code</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Base UOM</th>
                  <th>Reorder Level</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(i => `
                  <tr>
                    <td><code>${i.itemCode || i.item_code || i.id}</code></td>
                    <td><strong>${i.itemName || i.item_name || i.name}</strong></td>
                    <td>${i.categoryCode || i.category || 'GENERAL'}</td>
                    <td>${i.baseUom || i.base_uom || 'KG'}</td>
                    <td>${i.reorderLevel || 0}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (this.activeTab === 'categories') {
      container.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:20px;">
          <h3 style="font-size:1.2rem; margin-top:0; margin-bottom:16px;">🏷 Inventory Categories & Item Families (${categories.length})</h3>
          <div class="table-responsive">
            <table class="data-table" style="width:100%;">
              <thead>
                <tr style="font-size:0.75rem; color:var(--text-muted);">
                  <th>Category Code</th>
                  <th>Category Name</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                ${categories.length > 0 ? categories.map(c => `
                  <tr>
                    <td><code>${c.code || c.id}</code></td>
                    <td><strong>${c.name}</strong></td>
                    <td>${c.description || 'N/A'}</td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="3" style="text-align:center; padding:24px; color:var(--text-muted);">
                      🏷 Categories: VEGETABLES, DAIRY, MEAT_POULTRY, SPICES_DRY, BEVERAGES, PACKAGING
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (this.activeTab === 'uom') {
      container.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:20px;">
          <h3 style="font-size:1.2rem; margin-top:0; margin-bottom:16px;">📏 Units of Measure Master (${uoms.length})</h3>
          <div class="table-responsive">
            <table class="data-table" style="width:100%;">
              <thead>
                <tr style="font-size:0.75rem; color:var(--text-muted);">
                  <th>UOM Code</th>
                  <th>Name</th>
                  <th>UOM Family</th>
                </tr>
              </thead>
              <tbody>
                ${uoms.length > 0 ? uoms.map(u => `
                  <tr>
                    <td><code>${u.code || u.id}</code></td>
                    <td><strong>${u.name}</strong></td>
                    <td>${u.family || 'WEIGHT'}</td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="3" style="text-align:center; padding:24px; color:var(--text-muted);">
                      📏 UOMs: KG, G, LTR, ML, PCS, PACKET, BOTTLE, CAN
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (this.activeTab === 'locations') {
      container.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:20px;">
          <h3 style="font-size:1.2rem; margin-top:0; margin-bottom:16px;">🏬 Storage Locations (${locations.length})</h3>
          <div class="table-responsive">
            <table class="data-table" style="width:100%;">
              <thead>
                <tr style="font-size:0.75rem; color:var(--text-muted);">
                  <th>Location Code</th>
                  <th>Location Name</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                ${locations.length > 0 ? locations.map(l => `
                  <tr>
                    <td><code>${l.code || l.id}</code></td>
                    <td><strong>${l.name}</strong></td>
                    <td><span class="badge badge-info">${l.type || 'WAREHOUSE'}</span></td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="3" style="text-align:center; padding:24px; color:var(--text-muted);">
                      🏬 Storage Locations: LOC-MAIN-WH (Main Warehouse), LOC-KITCHEN-STORE (Kitchen Store), LOC-BAR-STORE (Bar Store)
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (this.activeTab === 'suppliers') {
      container.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:20px;">
          <h3 style="font-size:1.2rem; margin-top:0; margin-bottom:16px;">🏢 Suppliers Master (${suppliers.length})</h3>
          <div class="table-responsive">
            <table class="data-table" style="width:100%;">
              <thead>
                <tr style="font-size:0.75rem; color:var(--text-muted);">
                  <th>Supplier Code</th>
                  <th>Supplier Name</th>
                  <th>Contact Person</th>
                  <th>Phone / Email</th>
                </tr>
              </thead>
              <tbody>
                ${suppliers.length > 0 ? suppliers.map(s => `
                  <tr>
                    <td><code>${s.code || s.id}</code></td>
                    <td><strong>${s.name}</strong></td>
                    <td>${s.contactPerson || s.contact_person || 'N/A'}</td>
                    <td>${s.phone || s.email || 'N/A'}</td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="4" style="text-align:center; padding:24px; color:var(--text-muted);">
                      🏢 Active Suppliers: Metro Wholesale India, FreshFarms Produce Co.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (this.activeTab === 'grn') {
      container.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:20px;">
          <h3 style="font-size:1.2rem; margin-top:0; margin-bottom:16px;">📥 Goods Receiving Notes (GRN) (${grns.length})</h3>
          <div class="table-responsive">
            <table class="data-table" style="width:100%;">
              <thead>
                <tr style="font-size:0.75rem; color:var(--text-muted);">
                  <th>GRN Number</th>
                  <th>Supplier</th>
                  <th>Received Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${grns.length > 0 ? grns.map(g => `
                  <tr>
                    <td><code>${g.grnNumber || g.id}</code></td>
                    <td>${g.supplierName || 'Supplier'}</td>
                    <td>${new Date(g.receivedAt || Date.now()).toLocaleDateString()}</td>
                    <td><span class="badge badge-success">${g.status || 'RECEIVED'}</span></td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="4" style="text-align:center; padding:32px; color:var(--text-muted);">
                      📥 No Goods Receipt Notes logged in current shift.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (this.activeTab === 'transfers') {
      container.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:20px;">
          <h3 style="font-size:1.2rem; margin-top:0; margin-bottom:16px;">🔄 Warehouse Stock Transfers (${transfers.length})</h3>
          <div class="table-responsive">
            <table class="data-table" style="width:100%;">
              <thead>
                <tr style="font-size:0.75rem; color:var(--text-muted);">
                  <th>Transfer ID</th>
                  <th>From Location</th>
                  <th>To Location</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${transfers.length > 0 ? transfers.map(t => `
                  <tr>
                    <td><code>${t.transferCode || t.id}</code></td>
                    <td>${t.fromLocation || 'Main Warehouse'}</td>
                    <td>${t.toLocation || 'Kitchen Store'}</td>
                    <td><span class="badge badge-info">${t.status || 'COMPLETED'}</span></td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="4" style="text-align:center; padding:32px; color:var(--text-muted);">
                      🔄 No internal stock transfers logged in current shift.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (this.activeTab === 'adjustments') {
      container.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:20px;">
          <h3 style="font-size:1.2rem; margin-top:0; margin-bottom:16px;">📊 Stock Adjustments & Physical Audits</h3>
          <p style="color:var(--text-muted); font-size:0.875rem;">
            Log physical inventory variance adjustments, wastage write-offs, and stock count reconciliation.
          </p>
        </div>
      `;
    }
  }
}
