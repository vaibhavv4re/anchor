/**
 * Capability 1.3 - Kitchen & Chef Workspace: Tab 2 - 🍽 Menu UI
 * Complete Menu Management View implementing:
 * 1. 📊 Dashboard (Summary KPIs)
 * 2. 📖 Menu Catalog (Search, Category/Dietary Filters, Data Table)
 * 3. 📥 Import Menu (CSV/Excel upload, Validation, Preview + Actual Menu Loader)
 * 4. ➕ Add / Edit Item (Modal Form)
 * 5. ⚡ Availability (1-Tap Service Line Control)
 * 6. 🔗 Recipe Status (K-03 Recipe Linkage Preparation)
 */

import { kitchenMenuModel } from '../../../../../businessos/platform/kitchen/kitchenMenuModel.js';

export class KitchenMenuView {
  constructor(deps = {}) {
    this.container = null;
    this.activeTab = 'catalog'; // default tab inside Menu view
    // Accept full opts object (dataGateway, authEngine, etc.) or legacy { onNavigate }
    this.dataGateway = deps.dataGateway || (typeof window !== 'undefined' && window.__APP__?.platform?.dataGateway) || null;
    this.onNavigate = deps.onNavigate || (() => {});
    this._session = null; // set at render time

    // Filters for Catalog tab
    this.filters = {
      searchQuery: '',
      category: 'ALL',
      dietaryType: 'ALL',
      availabilityStatus: 'ALL',
      showArchived: false
    };

    // Modal state for Add/Edit
    this.editingItem = null;

    // File Import state
    this.importPreviewRows = [];
    this.importErrors = [];
    this.importFileName = '';
  }

  /**
   * Primary render entry point — matches app.js calling convention:
   *   const view = new KitchenMenuView(opts);
   *   view.render(mount, session);       ← mount to DOM element, session from AuthEngine
   *
   * Also supports legacy no-arg form for standalone use:
   *   mount.appendChild(view.render());  ← returns self-contained div
   */
  render(mount, session) {
    if (session) this._session = session;

    if (mount && mount.nodeType === Node.ELEMENT_NODE) {
      // Called by app.js: render directly into the supplied mount element
      this.container = mount;
      this.container.className = 'kitchen-menu-container animate-fade-in';
      this.updateContent();
      return this.container;
    }

    // Legacy: create own container and return it
    this.container = document.createElement('div');
    this.container.className = 'kitchen-menu-container animate-fade-in';
    this.updateContent();
    return this.container;
  }

  updateContent() {
    // Prefer session passed at render() time; fall back to sessionStorage for legacy callers
    const session = this._session || JSON.parse(sessionStorage.getItem('ros_session') || '{}');
    const tenantId = session.tenantId || null;

    const stats = kitchenMenuModel.getStats(tenantId);
    const linkageStats = kitchenMenuModel.getRecipeLinkageStats(tenantId);

    this.container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:var(--space-lg);">
        <!-- Top Menu Header -->
        <div class="card" style="background:var(--bg-surface-1); padding:var(--space-lg); border:1px solid var(--border-subtle);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:var(--space-md);">
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">👨‍🍳 CHEF WORKSPACE — TAB 2</div>
              <h2 style="font-size:1.6rem; margin-top:2px;">🍽 Menu Management & Catalog</h2>
              <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">
                Manage restaurant dishes, prices, categories, operational availability, and bulk imports.
              </p>
            </div>

            <div style="display:flex; gap:var(--space-sm);">
              <button class="btn-secondary btn-tab-trigger ${this.activeTab === 'import' ? 'active' : ''}" data-tab="import">
                📥 Import Menu
              </button>
              <button class="btn-primary btn-open-add-modal">
                ➕ Add New Dish
              </button>
            </div>
          </div>

          <!-- Secondary Sub-Navigation Tabs Bar -->
          <div style="display:flex; gap:var(--space-xs); margin-top:var(--space-md); border-top:1px solid var(--border-subtle); padding-top:var(--space-md); overflow-x:auto;">
            <button class="btn-secondary btn-tab-trigger ${this.activeTab === 'catalog' ? 'active' : ''}" data-tab="catalog" style="padding:6px 14px; font-size:0.875rem;">
              📖 Menu Catalog (${stats.totalItems})
            </button>
            <button class="btn-secondary btn-tab-trigger ${this.activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard" style="padding:6px 14px; font-size:0.875rem;">
              📊 Dashboard
            </button>
            <button class="btn-secondary btn-tab-trigger ${this.activeTab === 'availability' ? 'active' : ''}" data-tab="availability" style="padding:6px 14px; font-size:0.875rem;">
              ⚡ Availability (${stats.soldOutItems + stats.pausedItems} Alert)
            </button>
            <button class="btn-secondary btn-tab-trigger ${this.activeTab === 'import' ? 'active' : ''}" data-tab="import" style="padding:6px 14px; font-size:0.875rem;">
              📥 Import Menu
            </button>
            <button class="btn-secondary btn-tab-trigger ${this.activeTab === 'recipe-status' ? 'active' : ''}" data-tab="recipe-status" style="padding:6px 14px; font-size:0.875rem;">
              🔗 Recipe Status (${linkageStats.missingCount} Unlinked)
            </button>
          </div>
        </div>

        <!-- Dynamic Body Area based on activeTab -->
        <div id="menu-tab-content">
          ${this.renderTabBody(tenantId, stats, linkageStats)}
        </div>
      </div>

      <!-- Add / Edit Dish Modal Mount Container -->
      <div id="dish-modal-container"></div>
    `;

    this.bindEvents(tenantId);
  }

  renderTabBody(tenantId, stats, linkageStats) {
    switch (this.activeTab) {
      case 'dashboard':
        return this.renderDashboardTab(stats, linkageStats);
      case 'availability':
        return this.renderAvailabilityTab(tenantId);
      case 'import':
        return this.renderImportTab(tenantId);
      case 'recipe-status':
        return this.renderRecipeStatusTab(linkageStats, tenantId);
      case 'edit_dish':
        return this.renderDishEditorTab(tenantId);
      case 'catalog':
      default:
        return this.renderCatalogTab(tenantId, stats);
    }
  }

  // 1. 📊 MENU DASHBOARD TAB
  renderDashboardTab(stats, linkageStats) {
    return `
      <div style="display:flex; flex-direction:column; gap:var(--space-lg);">
        <div class="grid grid-cols-5 gap-md">
          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-md); text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL ITEMS</div>
            <div style="font-size:2rem; font-weight:800; color:var(--text-main); margin:4px 0;">${stats.totalItems}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${stats.categories.length} categories</div>
          </div>
          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-md); text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">ACTIVE IN MENU</div>
            <div style="font-size:2rem; font-weight:800; color:var(--status-success); margin:4px 0;">${stats.activeItems}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Ready for order</div>
          </div>
          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-md); text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">SOLD OUT</div>
            <div style="font-size:2rem; font-weight:800; color:var(--status-danger); margin:4px 0;">${stats.soldOutItems}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Line out of stock</div>
          </div>
          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-md); text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">PAUSED</div>
            <div style="font-size:2rem; font-weight:800; color:var(--status-warning); margin:4px 0;">${stats.pausedItems}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Temporarily held</div>
          </div>
          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-md); text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">WITHOUT RECIPE</div>
            <div style="font-size:2rem; font-weight:800; color:var(--accent-primary); margin:4px 0;">${stats.withoutRecipeItems}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Needs K-03 BOM</div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-lg">
          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-lg);">
            <h3 style="font-size:1.1rem; margin-bottom:var(--space-md);">🏷 Categories Breakdown</h3>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${stats.categories.length ? stats.categories.map(cat => `
                <div style="padding:10px; background:var(--bg-surface-2); border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-weight:600;">${cat}</span>
                  <span class="badge badge-info">${kitchenMenuModel.getAll(null, { category: cat }).length} items</span>
                </div>
              `).join('') : '<div style="color:var(--text-muted);">No categories available. Load or import menu items.</div>'}
            </div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-lg);">
            <h3 style="font-size:1.1rem; margin-bottom:var(--space-md);">🔗 K-03 Recipe Readiness</h3>
            <div style="padding:20px; background:var(--bg-surface-2); border-radius:8px; text-align:center;">
              <div style="font-size:2.5rem; font-weight:800; color:var(--accent-primary);">${linkageStats.linkedCount} / ${linkageStats.total}</div>
              <div style="font-weight:600; margin-top:4px;">Menu Dishes Linked to BOM Recipes</div>
              <p style="font-size:0.85rem; color:var(--text-muted); margin-top:6px;">
                Recipe definitions, ingredients, and yield calculations will be defined in Tab 3 (Recipes & BOM).
              </p>
              <button class="btn-secondary btn-tab-trigger" data-tab="recipe-status" style="margin-top:12px;">
                View Recipe Linkage Status →
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 2. 📖 MENU CATALOG TAB
  renderCatalogTab(tenantId, stats) {
    const items = kitchenMenuModel.getAll(tenantId, this.filters);
    const categories = stats.categories;

    const catalogRows = items.length > 0 ? items.map(item => {
      const dietBadge = item.dietaryType === 'VEG' ? 'badge-success' : (item.dietaryType === 'NON_VEG' ? 'badge-danger' : 'badge-warning');
      const recipeBadge = item.recipeId ? `<span class="badge badge-success">✓ Linked</span>` : `<span class="badge badge-warning">Unlinked</span>`;
      return `
        <tr>
          <td>
            <div style="font-weight:600;">${item.itemName}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${item.itemCode}</div>
          </td>
          <td><span class="badge badge-info">${item.category}</span></td>
          <td><span class="badge ${dietBadge}">${item.dietaryType}</span></td>
          <td style="font-weight:700;">₹${item.sellingPrice}</td>
          <td style="font-size:0.85rem; color:var(--text-muted);">${item.portionSize || '1 Portion'}</td>
          <td>
            <select class="sel-item-status" data-id="${item.id}" style="font-size:0.75rem; padding:2px 6px;">
              <option value="AVAILABLE" ${item.availabilityStatus === 'AVAILABLE' ? 'selected' : ''}>🟢 AVAILABLE</option>
              <option value="PAUSED" ${item.availabilityStatus === 'PAUSED' ? 'selected' : ''}>🟡 PAUSED</option>
              <option value="SOLD_OUT" ${item.availabilityStatus === 'SOLD_OUT' ? 'selected' : ''}>🔴 SOLD OUT</option>
            </select>
          </td>
          <td>
            ${recipeBadge}
          </td>
          <td>
            <div style="display:flex; gap:6px;">
              <button class="btn-secondary btn-edit-dish" data-id="${item.id}" style="padding:4px 8px; font-size:0.75rem;">Edit</button>
              <button class="btn-secondary btn-archive-dish" data-id="${item.id}" style="padding:4px 8px; font-size:0.75rem; color:var(--status-danger);">Archive</button>
            </div>
          </td>
        </tr>
      `;
    }).join('') : `
      <tr>
        <td colspan="8" style="text-align:center; padding:40px; color:var(--text-muted);">
          <div style="font-size:1.5rem; margin-bottom:8px;">🍽 No Menu Items Found</div>
          <div>No dishes match the selected filter criteria or no items have been imported yet.</div>
          <button class="btn-primary btn-tab-trigger" data-tab="import" style="margin-top:12px;">
            📥 Import Menu Dataset Now
          </button>
        </td>
      </tr>
    `;

    return `
      <div style="display:flex; flex-direction:column; gap:var(--space-lg);">
        <!-- Filter Controls Bar -->
        <div class="card" style="background:var(--bg-surface-1); padding:var(--space-md);">
          <div class="grid grid-cols-4 gap-md" style="align-items:center;">
            <div>
              <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:2px;">SEARCH DISHES</label>
              <input type="text" id="inp-catalog-search" value="${this.filters.searchQuery}" placeholder="Search name or code..." style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:2px;">CATEGORY</label>
              <select id="sel-catalog-category" style="width:100%;">
                <option value="ALL">All Categories (${stats.categories.length})</option>
                ${categories.map(c => `<option value="${c}" ${this.filters.category === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:2px;">DIETARY TYPE</label>
              <select id="sel-catalog-dietary" style="width:100%;">
                <option value="ALL" ${this.filters.dietaryType === 'ALL' ? 'selected' : ''}>All Types</option>
                <option value="VEG" ${this.filters.dietaryType === 'VEG' ? 'selected' : ''}>🟢 VEG</option>
                <option value="NON_VEG" ${this.filters.dietaryType === 'NON_VEG' ? 'selected' : ''}>🔴 NON-VEG</option>
                <option value="EGG" ${this.filters.dietaryType === 'EGG' ? 'selected' : ''}>🟡 EGG</option>
                <option value="VEGAN" ${this.filters.dietaryType === 'VEGAN' ? 'selected' : ''}>🌱 VEGAN</option>
              </select>
            </div>
            <div>
              <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:2px;">AVAILABILITY</label>
              <select id="sel-catalog-availability" style="width:100%;">
                <option value="ALL" ${this.filters.availabilityStatus === 'ALL' ? 'selected' : ''}>All Statuses</option>
                <option value="AVAILABLE" ${this.filters.availabilityStatus === 'AVAILABLE' ? 'selected' : ''}>🟢 AVAILABLE</option>
                <option value="PAUSED" ${this.filters.availabilityStatus === 'PAUSED' ? 'selected' : ''}>🟡 PAUSED</option>
                <option value="SOLD_OUT" ${this.filters.availabilityStatus === 'SOLD_OUT' ? 'selected' : ''}>🔴 SOLD OUT</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Catalog Items Data Table -->
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Dish Code & Name</th>
                <th>Category</th>
                <th>Dietary</th>
                <th>Price</th>
                <th>Portion</th>
                <th>Status</th>
                <th>Recipe Link</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${catalogRows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 3. 📥 IMPORT MENU TAB
  renderImportTab(tenantId) {
    return `
      <div style="display:flex; flex-direction:column; gap:var(--space-lg);">
        <div class="grid grid-cols-2 gap-lg">
          <!-- 1-Click Actual Menu Dataset Importer Card -->
          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-lg); border-left:4px solid var(--accent-primary);">
            <div style="font-size:0.75rem; color:var(--accent-primary); font-weight:700; text-transform:uppercase;">RECOMMENDED INITIAL DATASET</div>
            <h3 style="font-size:1.3rem; margin-top:4px;">✨ Load Actual Anchor Coastal Menu</h3>
            <p style="font-size:0.875rem; color:var(--text-muted); margin-top:6px;">
              Instantly import the complete 70 actual coastal dishes extracted from the Anchor restaurant menu document (Soups, Starters, Mains, Breads, Drinks).
            </p>

            <div style="margin-top:16px;">
              <button class="btn-primary btn-load-actual-menu" style="padding:12px 20px; font-weight:700; width:100%;">
                ✨ Import Actual Anchor Coastal Menu (70 Items)
              </button>
            </div>
          </div>

          <!-- Custom CSV / Excel Upload Card -->
          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-lg);">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">CUSTOM BULK UPLOAD</div>
            <h3 style="font-size:1.3rem; margin-top:4px;">📁 Upload Excel / CSV Menu</h3>
            <p style="font-size:0.875rem; color:var(--text-muted); margin-top:6px;">
              Upload custom restaurant menu files in <code>.xlsx</code>, <code>.xls</code>, or <code>.csv</code> format.
            </p>

            <div style="margin-top:16px; display:flex; gap:var(--space-sm);">
              <button class="btn-secondary btn-download-template" style="flex:1; font-weight:600;">
                📄 Download CSV Template
              </button>
              <label class="btn-secondary" style="flex:1; font-weight:600; text-align:center; cursor:pointer;">
                📁 Choose File
                <input type="file" id="inp-upload-menu-file" accept=".csv, .xlsx, .xls" style="display:none;">
              </label>
            </div>
          </div>
        </div>

        <!-- Import Validation & Preview Area -->
        ${this.importFileName ? `
          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-lg);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-md);">
              <h3 style="font-size:1.1rem; margin:0;">
                File Selected: <code>${this.importFileName}</code> (${this.importPreviewRows.length} rows)
              </h3>
              <button class="btn-primary btn-confirm-import" ${this.importPreviewRows.length === 0 ? 'disabled' : ''}>
                ✅ Commit Import (${this.importPreviewRows.length} Items)
              </button>
            </div>

            ${this.importErrors.length > 0 ? `
              <div style="padding:12px; background:rgba(239, 68, 68, 0.1); border:1px solid var(--status-danger); border-radius:6px; margin-bottom:16px;">
                <div style="font-weight:700; color:var(--status-danger);">⚠️ Validation Alerts:</div>
                <ul style="margin:4px 0 0 16px; font-size:0.85rem; color:var(--status-danger);">
                  ${this.importErrors.map(err => `<li>${err}</li>`).join('')}
                </ul>
              </div>
            ` : ''}

            <div class="table-responsive" style="max-height:300px; overflow-y:auto;">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Dietary Type</th>
                    <th>Portion</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.importPreviewRows.slice(0, 50).map((r, idx) => `
                    <tr>
                      <td>${idx + 1}</td>
                      <td style="font-weight:600;">${r['Item Name'] || r['item_name'] || r['itemName'] || '—'}</td>
                      <td><span class="badge badge-info">${r['Category'] || r['category'] || 'GENERAL'}</span></td>
                      <td style="font-weight:700;">₹${r['Price'] || r['selling_price'] || r['sellingPrice'] || 0}</td>
                      <td>${r['Dietary Type'] || r['dietary_type'] || 'VEG'}</td>
                      <td>${r['Portion Size'] || r['portion_size'] || '1 Portion'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // 4. ⚡ AVAILABILITY LINE CONTROL TAB
  renderAvailabilityTab(tenantId) {
    const items = kitchenMenuModel.getAll(tenantId, { showArchived: false });

    return `
      <div style="display:flex; flex-direction:column; gap:var(--space-lg);">
        <div class="card" style="background:var(--bg-surface-1); padding:var(--space-md);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h3 style="font-size:1.1rem; margin:0;">⚡ Live Service Line Availability Control</h3>
              <p style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
                Instant 1-tap toggles for Chef to mark items Available, Paused, or Sold Out during live service.
              </p>
            </div>
            <span class="badge badge-info">FAST LINE TOGGLE MODE</span>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-md">
          ${items.length > 0 ? items.map(item => {
            const status = item.availabilityStatus || 'AVAILABLE';
            const cardBorder = status === 'AVAILABLE' ? 'var(--status-success)' : (status === 'PAUSED' ? 'var(--status-warning)' : 'var(--status-danger)');
            return `
              <div class="card" style="background:var(--bg-surface-1); border-left:4px solid ${cardBorder}; padding:var(--space-md); display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="font-weight:700; font-size:1rem;">${item.itemName}</div>
                    <span class="badge ${item.dietaryType === 'VEG' ? 'badge-success' : 'badge-danger'}">${item.dietaryType}</span>
                  </div>
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${item.category} • ₹${item.sellingPrice}</div>
                </div>

                <div style="margin-top:14px; display:flex; gap:4px;">
                  <button class="btn-secondary btn-quick-avail ${status === 'AVAILABLE' ? 'active' : ''}" data-id="${item.id}" data-status="AVAILABLE" style="flex:1; padding:6px 4px; font-size:0.75rem; ${status === 'AVAILABLE' ? 'background:var(--status-success); color:#fff;' : ''}">
                    🟢 Available
                  </button>
                  <button class="btn-secondary btn-quick-avail ${status === 'PAUSED' ? 'active' : ''}" data-id="${item.id}" data-status="PAUSED" style="flex:1; padding:6px 4px; font-size:0.75rem; ${status === 'PAUSED' ? 'background:var(--status-warning); color:#fff;' : ''}">
                    🟡 Paused
                  </button>
                  <button class="btn-secondary btn-quick-avail ${status === 'SOLD_OUT' ? 'active' : ''}" data-id="${item.id}" data-status="SOLD_OUT" style="flex:1; padding:6px 4px; font-size:0.75rem; ${status === 'SOLD_OUT' ? 'background:var(--status-danger); color:#fff;' : ''}">
                    🔴 Sold Out
                  </button>
                </div>
              </div>
            `;
          }).join('') : `
            <div style="grid-column: span 3; text-align:center; padding:40px; color:var(--text-muted);">
              No items available in menu catalog. Please load or import menu items first.
            </div>
          `}
        </div>
      </div>
    `;
  }

  // 5. 🔗 RECIPE STATUS TAB (K-03 Preparation)
  renderRecipeStatusTab(linkageStats, tenantId) {
    const items = kitchenMenuModel.getAll(tenantId, { showArchived: false });

    return `
      <div style="display:flex; flex-direction:column; gap:var(--space-lg);">
        <div class="card" style="background:var(--bg-surface-1); padding:var(--space-lg);">
          <h3 style="font-size:1.2rem; margin-bottom:4px;">🔗 K-03 Recipe & BOM Linkage Preparation</h3>
          <p style="color:var(--text-muted); font-size:0.875rem;">
            Overview of menu dishes linked vs. unlinked to Master Recipes / Bill of Materials (BOM).
          </p>

          <div class="grid grid-cols-2 gap-md" style="margin-top:16px;">
            <div style="padding:16px; background:var(--bg-surface-2); border-radius:8px; text-align:center;">
              <div style="font-size:2rem; font-weight:800; color:var(--status-success);">${linkageStats.linkedCount}</div>
              <div style="font-size:0.85rem; font-weight:600;">Recipe Linked (${Math.round((linkageStats.linkedCount / (linkageStats.total || 1)) * 100)}%)</div>
            </div>
            <div style="padding:16px; background:var(--bg-surface-2); border-radius:8px; text-align:center;">
              <div style="font-size:2rem; font-weight:800; color:var(--status-warning);">${linkageStats.missingCount}</div>
              <div style="font-size:0.85rem; font-weight:600;">Recipe Missing (${Math.round((linkageStats.missingCount / (linkageStats.total || 1)) * 100)}%)</div>
            </div>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Item Code & Name</th>
                <th>Category</th>
                <th>Recipe Link Status</th>
                <th>Target Recipe Pointer</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>
                    <div style="font-weight:600;">${item.itemName}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${item.itemCode}</div>
                  </td>
                  <td><span class="badge badge-info">${item.category}</span></td>
                  <td>
                    ${item.recipeId ? `<span class="badge badge-success">✓ Linked</span>` : `<span class="badge badge-warning">Recipe Missing</span>`}
                  </td>
                  <td style="font-size:0.85rem; color:var(--text-muted);">
                    <code>${item.recipeId || 'Unassigned — Awaiting K-03 Recipes'}</code>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 6. EVENT BINDINGS
  bindEvents(tenantId) {
    // Sub-tab switching buttons
    this.container.querySelectorAll('.btn-tab-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.updateContent();
      });
    });

    // Open Full-Page Add Dish View
    const addBtn = this.container.querySelector('.btn-open-add-modal');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        this.editingItem = null;
        this.activeTab = 'edit_dish';
        this.updateContent();
      });
    }

    // Catalog Search & Filters
    const searchInp = this.container.querySelector('#inp-catalog-search');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.filters.searchQuery = e.target.value;
        const tabContent = this.container.querySelector('#menu-tab-content');
        if (tabContent && this.activeTab === 'catalog') {
          tabContent.innerHTML = this.renderCatalogTab(tenantId, kitchenMenuModel.getStats(tenantId));
          this.bindEvents(tenantId);
        }
      });
    }

    const catSel = this.container.querySelector('#sel-catalog-category');
    if (catSel) {
      catSel.addEventListener('change', (e) => {
        this.filters.category = e.target.value;
        this.updateContent();
      });
    }

    const dietSel = this.container.querySelector('#sel-catalog-dietary');
    if (dietSel) {
      dietSel.addEventListener('change', (e) => {
        this.filters.dietaryType = e.target.value;
        this.updateContent();
      });
    }

    const availSel = this.container.querySelector('#sel-catalog-availability');
    if (availSel) {
      availSel.addEventListener('change', (e) => {
        this.filters.availabilityStatus = e.target.value;
        this.updateContent();
      });
    }

    // Inline Catalog Status Dropdowns
    this.container.querySelectorAll('.sel-item-status').forEach(sel => {
      sel.addEventListener('change', (e) => {
        kitchenMenuModel.toggleAvailability(e.target.dataset.id, e.target.value);
        this.updateContent();
      });
    });

    // Quick Availability Toggles in Availability Tab
    this.container.querySelectorAll('.btn-quick-avail').forEach(btn => {
      btn.addEventListener('click', () => {
        kitchenMenuModel.toggleAvailability(btn.dataset.id, btn.dataset.status);
        this.updateContent();
      });
    });

    // Edit Dish Buttons -> Open Full-Page Editor View
    this.container.querySelectorAll('.btn-edit-dish').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = kitchenMenuModel.getById(btn.dataset.id);
        if (item) {
          this.editingItem = item;
          this.activeTab = 'edit_dish';
          this.updateContent();
        }
      });
    });

    // Archive Dish Buttons (Controlled Lifecycle)
    this.container.querySelectorAll('.btn-archive-dish').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Archive this dish? It will be moved to ARCHIVED status and hidden from active sales.')) {
          kitchenMenuModel.archiveItem(btn.dataset.id);
          this.updateContent();
        }
      });
    });

    // 1-Click Load Actual Menu Dataset Button
    const loadActualBtn = this.container.querySelector('.btn-load-actual-menu');
    if (loadActualBtn) {
      loadActualBtn.addEventListener('click', () => {
        const res = kitchenMenuModel.importActualMenu(tenantId);
        alert(`✨ Successfully imported ${res.importedCount} actual Anchor coastal menu items!`);
        this.activeTab = 'catalog';
        this.updateContent();
      });
    }

    // Download CSV Template
    const templateBtn = this.container.querySelector('.btn-download-template');
    if (templateBtn) {
      templateBtn.addEventListener('click', () => this.downloadCSVTemplate());
    }

    // Upload File Input Listener
    const fileInp = this.container.querySelector('#inp-upload-menu-file');
    if (fileInp) {
      fileInp.addEventListener('change', (e) => this.handleFileUpload(e.target.files[0], tenantId));
    }

    // Confirm Bulk Import Button
    const confirmImportBtn = this.container.querySelector('.btn-confirm-import');
    if (confirmImportBtn) {
      confirmImportBtn.addEventListener('click', () => {
        const res = kitchenMenuModel.importFromRows(this.importPreviewRows, tenantId);
        if (res.success) {
          alert(`✅ Bulk imported ${res.importedCount} menu items successfully!`);
          this.importPreviewRows = [];
          this.importFileName = '';
          this.importErrors = [];
          this.activeTab = 'catalog';
          this.updateContent();
        } else {
          alert(`Import failed: ${res.errors.join('\n')}`);
        }
      });
    }
  }

  // Handle File Upload (CSV / XLSX using SheetJS)
  handleFileUpload(file, tenantId) {
    if (!file) return;

    this.importFileName = file.name;
    this.importPreviewRows = [];
    this.importErrors = [];

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (window.XLSX) {
          const data = new Uint8Array(e.target.result);
          const workbook = window.XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = window.XLSX.utils.sheet_to_json(worksheet);

          this.importPreviewRows = rows;
          this.updateContent();
        } else {
          alert('XLSX library not loaded. Please try standard CSV file.');
        }
      } catch (err) {
        alert(`Failed to parse file: ${err.message}`);
      }
    };

    reader.readAsArrayBuffer(file);
  }

  downloadCSVTemplate() {
    const csvContent = 'Item Name,Category,Price,Dietary Type,Description,Portion Size\n' +
      'Kokum & Coconut Soup,SOUPS,240,VEG,Tangy coconut broth,250ml\n' +
      'Surmai Tawa Fry,STARTERS - FROM THE SEA,550,NON_VEG,Seared King Mackerel steaks,2 steaks\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'kitchen_menu_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Standard Full-Page Dish & Variant Editor View
  renderDishEditorTab(tenantId) {
    const item = this.editingItem;
    const isEdit = Boolean(item);
    const hasVariants = item ? Boolean(item.hasVariants || (Array.isArray(item.variants) && item.variants.length > 0)) : false;
    
    const initialVariants = (item && Array.isArray(item.variants) && item.variants.length > 0) ? item.variants : [
      { variantId: `var-${Date.now()}-1`, variantName: 'Half', price: (item ? item.sellingPrice : 250), sku: `${item ? item.itemCode : 'MENU-101'}-HALF`, portionSize: '1/2 Portion', bomMode: 'INDEPENDENT', scalingFactor: 1.0, is86: false },
      { variantId: `var-${Date.now()}-2`, variantName: 'Full', price: (item ? Math.round((item.sellingPrice || 300) * 1.6) : 450), sku: `${item ? item.itemCode : 'MENU-101'}-FULL`, portionSize: 'Full Portion', bomMode: 'DERIVED', scalingFactor: 1.65, is86: false }
    ];

    return `
      <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:var(--space-lg);">
        
        <!-- EDITOR TOP HEADER BAR -->
        <div class="card" style="background:var(--bg-surface-1); padding:var(--space-lg); border:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:14px;">
            <button class="btn-secondary" id="btn-editor-back-catalog" style="padding:8px 14px; font-weight:700;">
              ← Back to Catalog
            </button>
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">FULL-PAGE DISH & VARIANT STUDIO</div>
              <h2 style="font-size:1.6rem; margin:2px 0 0; color:var(--text-primary);">
                ${isEdit ? `✏️ Editing Dish: ${item.itemName}` : '➕ Create New Menu Dish'}
              </h2>
            </div>
          </div>

          <div style="display:flex; gap:10px;">
            <button class="btn-secondary" id="btn-editor-cancel" style="padding:10px 16px; font-weight:600;">Cancel</button>
            <button class="btn-primary" id="btn-editor-save-top" style="padding:10px 20px; font-weight:800; background:var(--accent-primary); color:#000;">
              💾 Save Dish & Sync Variants
            </button>
          </div>
        </div>

        <form id="form-full-dish-editor" style="display:flex; flex-direction:column; gap:var(--space-lg);">
          
          <!-- CARD 1: MASTER DISH IDENTITY & PRICING -->
          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-lg); border:1px solid var(--border-subtle);">
            <h3 style="font-size:1.2rem; margin:0 0 16px; border-bottom:1px solid var(--border-subtle); padding-bottom:8px;">
              📋 Master Dish Identity & Attributes
            </h3>

            <div style="display:flex; flex-direction:column; gap:16px;">
              <div class="grid grid-cols-3 gap-md">
                <div>
                  <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Item Code / SKU *</label>
                  <input type="text" id="inp-editor-code" value="${item ? item.itemCode : `MENU-${Math.floor(1000 + Math.random() * 9000)}`}" required style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-app); color:var(--text-primary); font-family:monospace; box-sizing:border-box;">
                </div>
                <div>
                  <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Master Dish Name *</label>
                  <input type="text" id="inp-editor-name" value="${item ? item.itemName : ''}" required placeholder="e.g. Butter Chicken" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-app); color:var(--text-primary); box-sizing:border-box;">
                </div>
                <div>
                  <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Master Base Price (₹) *</label>
                  <input type="number" id="inp-editor-price" value="${item ? item.sellingPrice : 350}" required style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-app); color:var(--text-primary); box-sizing:border-box;">
                </div>
              </div>

              <div class="grid grid-cols-4 gap-md">
                <div>
                  <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Category *</label>
                  <input type="text" id="inp-editor-category" value="${item ? item.category : 'MAINS - COASTAL CURRIES'}" required style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-app); color:var(--text-primary); box-sizing:border-box;">
                </div>
                <div>
                  <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Dietary Type</label>
                  <select id="inp-editor-dietary" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-app); color:var(--text-primary); box-sizing:border-box;">
                    <option value="VEG" ${item && item.dietaryType === 'VEG' ? 'selected' : ''}>🟢 VEG</option>
                    <option value="NON_VEG" ${item && item.dietaryType === 'NON_VEG' ? 'selected' : ''}>🔴 NON-VEG</option>
                    <option value="EGG" ${item && item.dietaryType === 'EGG' ? 'selected' : ''}>🟡 EGG</option>
                    <option value="VEGAN" ${item && item.dietaryType === 'VEGAN' ? 'selected' : ''}>🌱 VEGAN</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Master Portion Specs</label>
                  <input type="text" id="inp-editor-portion" value="${item ? item.portionSize : '1 Portion'}" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-app); color:var(--text-primary); box-sizing:border-box;">
                </div>
                <div>
                  <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Station Routing</label>
                  <select id="inp-editor-routing" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-app); color:var(--text-primary); box-sizing:border-box;">
                    <option value="KITCHEN_LINE" ${!item || item.routing === 'KITCHEN_LINE' ? 'selected' : ''}>🍳 Main Kitchen Line</option>
                    <option value="BAR_LINE" ${item && item.routing === 'BAR_LINE' ? 'selected' : ''}>🍹 Bar Station</option>
                    <option value="TANDOOR_LINE" ${item && item.routing === 'TANDOOR_LINE' ? 'selected' : ''}>🔥 Tandoor Station</option>
                  </select>
                </div>
              </div>

              <div>
                <label style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px;">Dish Description</label>
                <textarea id="inp-editor-desc" style="width:100%; height:70px; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-app); color:var(--text-primary); box-sizing:border-box;">${item ? item.description : ''}</textarea>
              </div>
            </div>
          </div>

          <!-- CARD 2: FIRST-CLASS PORTION & SIZE VARIANTS (BOM LINKED) -->
          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-lg); border:1px solid var(--border-subtle);">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px; margin-bottom:16px;">
              <div>
                <h3 style="font-size:1.2rem; margin:0;">📦 Portion & Size Variants (BOM Attached)</h3>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
                  Define portion variants (e.g., Half, Full, 6", 9", 11", Single, Family). Each variant has its own price, BOM Mode, and 86 status.
                </p>
              </div>
              
              <div style="display:flex; align-items:center; gap:10px;">
                <label style="display:flex; align-items:center; gap:8px; font-weight:700; font-size:0.9rem; cursor:pointer;">
                  <input type="checkbox" id="chk-enable-variants" ${hasVariants || true ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer;">
                  Enable Variants for this Dish
                </label>
                <button type="button" class="btn-primary" id="btn-add-variant-row" style="padding:8px 14px; font-size:0.85rem; font-weight:700;">
                  ➕ Add Variant Line
                </button>
              </div>
            </div>

            <!-- VARIANTS BUILDER TABLE -->
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;" id="table-variants-builder">
                <thead>
                  <tr style="border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                    <th style="padding:8px 6px;">Variant Name</th>
                    <th style="padding:8px 6px; width:120px;">Price (₹)</th>
                    <th style="padding:8px 6px; width:120px;">Variant SKU</th>
                    <th style="padding:8px 6px; width:140px;">Portion Specs</th>
                    <th style="padding:8px 6px; width:140px;">BOM Mode</th>
                    <th style="padding:8px 6px; width:90px;">Scale Factor</th>
                    <th style="padding:8px 6px; width:130px;">86 Status</th>
                    <th style="padding:8px 6px; width:150px;">BOM Recipe Link</th>
                    <th style="padding:8px 6px; width:60px; text-align:center;">Action</th>
                  </tr>
                </thead>
                <tbody id="tbody-variants-list">
                  ${initialVariants.map((v, idx) => `
                    <tr class="variant-row" data-v-id="${v.variantId || `var-${idx}`}" style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:8px 4px;">
                        <input type="text" class="v-inp-name" value="${v.variantName || ''}" placeholder="e.g. Half" required style="width:100%; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-app); font-weight:700; color:var(--text-primary); box-sizing:border-box;">
                      </td>
                      <td style="padding:8px 4px;">
                        <input type="number" class="v-inp-price" value="${v.price || 0}" required style="width:100%; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-app); font-weight:800; color:var(--accent-primary); box-sizing:border-box;">
                      </td>
                      <td style="padding:8px 4px;">
                        <input type="text" class="v-inp-sku" value="${v.sku || ''}" placeholder="SKU" style="width:100%; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-app); font-family:monospace; color:var(--text-muted); box-sizing:border-box;">
                      </td>
                      <td style="padding:8px 4px;">
                        <input type="text" class="v-inp-portion" value="${v.portionSize || ''}" placeholder="e.g. 250g chicken" style="width:100%; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-app); color:var(--text-secondary); box-sizing:border-box;">
                      </td>
                      <td style="padding:8px 4px;">
                        <select class="v-sel-mode" style="width:100%; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-app); color:var(--text-primary); box-sizing:border-box;">
                          <option value="INDEPENDENT" ${v.bomMode === 'INDEPENDENT' ? 'selected' : ''}>INDEPENDENT BOM</option>
                          <option value="DERIVED" ${v.bomMode === 'DERIVED' ? 'selected' : ''}>DERIVED (Scaled)</option>
                        </select>
                      </td>
                      <td style="padding:8px 4px;">
                        <input type="number" step="0.05" class="v-inp-scale" value="${v.scalingFactor || 1.0}" style="width:100%; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-app); color:var(--text-primary); box-sizing:border-box;">
                      </td>
                      <td style="padding:8px 4px;">
                        <select class="v-sel-86" style="width:100%; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-app); color:var(--text-primary); box-sizing:border-box;">
                          <option value="false" ${!v.is86 ? 'selected' : ''}>🟢 AVAILABLE</option>
                          <option value="true" ${v.is86 ? 'selected' : ''}>🔴 86 SOLD OUT</option>
                        </select>
                      </td>
                      <td style="padding:8px 4px;">
                        <button type="button" class="btn-secondary btn-link-variant-bom" data-v-name="${v.variantName}" style="width:100%; padding:6px; font-size:0.75rem; font-weight:700; display:flex; align-items:center; justify-content:center; gap:4px;">
                          <span>🔗</span> View/Link BOM
                        </button>
                      </td>
                      <td style="padding:8px 4px; text-align:center;">
                        <button type="button" class="btn-remove-v-row" style="background:transparent; color:var(--status-danger); border:none; cursor:pointer; font-size:1.1rem; padding:4px;">
                          🗑️
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- CARD 3: BOTTOM ACTION TOOLBAR -->
          <div class="card" style="background:var(--bg-surface-1); padding:var(--space-md) var(--space-lg); border:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div style="font-size:0.85rem; color:var(--text-muted);">
              Changes will update live Menu Master & auto-sync BOM inventory deduction schemas.
            </div>

            <div style="display:flex; gap:12px;">
              <button type="button" class="btn-secondary" id="btn-editor-cancel-bottom" style="padding:10px 18px; font-weight:600;">
                Cancel / Discard
              </button>
              <button type="submit" class="btn-primary" style="padding:10px 24px; font-weight:800; background:var(--accent-primary); color:#000;">
                💾 Save Menu Item & Sync Variants
              </button>
            </div>
          </div>

        </form>

      </div>
    `;
  }

  // Bind Full-Page Dish Editor Form Events
  bindEvents(tenantId) {
    // If we're in full-page Dish Editor view:
    if (this.activeTab === 'edit_dish') {
      const backBtn = this.container.querySelector('#btn-editor-back-catalog');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          this.activeTab = 'catalog';
          this.updateContent();
        });
      }

      const cancelBtn = this.container.querySelector('#btn-editor-cancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          this.activeTab = 'catalog';
          this.updateContent();
        });
      }

      const cancelBottomBtn = this.container.querySelector('#btn-editor-cancel-bottom');
      if (cancelBottomBtn) {
        cancelBottomBtn.addEventListener('click', () => {
          this.activeTab = 'catalog';
          this.updateContent();
        });
      }

      // Add New Variant Row Button
      const addVRowBtn = this.container.querySelector('#btn-add-variant-row');
      if (addVRowBtn) {
        addVRowBtn.addEventListener('click', () => {
          const tbody = this.container.querySelector('#tbody-variants-list');
          if (!tbody) return;
          const vIdx = tbody.children.length + 1;
          const newRow = document.createElement('tr');
          newRow.className = 'variant-row';
          newRow.dataset.vId = `var-${Date.now()}-${vIdx}`;
          newRow.style.borderBottom = '1px solid var(--border-subtle)';
          newRow.innerHTML = `
            <td style="padding:8px 4px;">
              <input type="text" class="v-inp-name" value="Variant ${vIdx}" required style="width:100%; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-app); font-weight:700; color:var(--text-primary); box-sizing:border-box;">
            </td>
            <td style="padding:8px 4px;">
              <input type="number" class="v-inp-price" value="300" required style="width:100%; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-app); font-weight:800; color:var(--accent-primary); box-sizing:border-box;">
            </td>
            <td style="padding:8px 4px;">
              <input type="text" class="v-inp-sku" value="SKU-${vIdx}" style="width:100%; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-app); font-family:monospace; color:var(--text-muted); box-sizing:border-box;">
            </td>
            <td style="padding:8px 4px;">
              <input type="text" class="v-inp-portion" value="Portion ${vIdx}" style="width:100%; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-app); color:var(--text-secondary); box-sizing:border-box;">
            </td>
            <td style="padding:8px 4px;">
              <select class="v-sel-mode" style="width:100%; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-app); color:var(--text-primary); box-sizing:border-box;">
                <option value="INDEPENDENT">INDEPENDENT BOM</option>
                <option value="DERIVED">DERIVED (Scaled)</option>
              </select>
            </td>
            <td style="padding:8px 4px;">
              <input type="number" step="0.05" class="v-inp-scale" value="1.0" style="width:100%; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-app); color:var(--text-primary); box-sizing:border-box;">
            </td>
            <td style="padding:8px 4px;">
              <select class="v-sel-86" style="width:100%; padding:6px; border-radius:4px; border:1px solid var(--border-subtle); background:var(--bg-app); color:var(--text-primary); box-sizing:border-box;">
                <option value="false">🟢 AVAILABLE</option>
                <option value="true">🔴 86 SOLD OUT</option>
              </select>
            </td>
            <td style="padding:8px 4px;">
              <button type="button" class="btn-secondary btn-link-variant-bom" style="width:100%; padding:6px; font-size:0.75rem; font-weight:700; display:flex; align-items:center; justify-content:center; gap:4px;">
                <span>🔗</span> View/Link BOM
              </button>
            </td>
            <td style="padding:8px 4px; text-align:center;">
              <button type="button" class="btn-remove-v-row" style="background:transparent; color:var(--status-danger); border:none; cursor:pointer; font-size:1.1rem; padding:4px;">
                🗑️
              </button>
            </td>
          `;
          tbody.appendChild(newRow);
          this.bindVariantRowEvents(newRow);
        });
      }

      // Bind Remove and Link buttons on existing variant rows
      this.container.querySelectorAll('.variant-row').forEach(row => this.bindVariantRowEvents(row));

      // Handle Full Form Submit
      const form = this.container.querySelector('#form-full-dish-editor');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const enableVariants = this.container.querySelector('#chk-enable-variants')?.checked ?? true;
          
          const variantRows = this.container.querySelectorAll('.variant-row');
          const collectedVariants = [];

          variantRows.forEach(row => {
            const vName = row.querySelector('.v-inp-name')?.value || '';
            const vPrice = parseFloat(row.querySelector('.v-inp-price')?.value) || 0;
            const vSku = row.querySelector('.v-inp-sku')?.value || '';
            const vPortion = row.querySelector('.v-inp-portion')?.value || '';
            const vMode = row.querySelector('.v-sel-mode')?.value || 'INDEPENDENT';
            const vScale = parseFloat(row.querySelector('.v-inp-scale')?.value) || 1.0;
            const v86 = row.querySelector('.v-sel-86')?.value === 'true';

            if (vName.trim() !== '') {
              collectedVariants.push({
                variantId: row.dataset.vId || `var-${Math.random().toString(36).substring(2, 7)}`,
                variantCode: vSku || `VAR-${vName.toUpperCase().replace(/\s+/g, '')}`,
                variantName: vName.trim(),
                price: vPrice,
                sku: vSku,
                portionSize: vPortion,
                bomMode: vMode,
                scalingFactor: vScale,
                is86: v86,
                isAvailable: !v86
              });
            }
          });

          const itemData = {
            id: this.editingItem ? this.editingItem.id : null,
            itemCode: this.container.querySelector('#inp-editor-code').value,
            itemName: this.container.querySelector('#inp-editor-name').value,
            sellingPrice: parseFloat(this.container.querySelector('#inp-editor-price').value) || 0,
            category: this.container.querySelector('#inp-editor-category').value.toUpperCase(),
            dietaryType: this.container.querySelector('#inp-editor-dietary').value,
            portionSize: this.container.querySelector('#inp-editor-portion').value,
            routing: this.container.querySelector('#inp-editor-routing').value,
            description: this.container.querySelector('#inp-editor-desc').value,
            hasVariants: enableVariants && collectedVariants.length > 0,
            variants: enableVariants ? collectedVariants : [],
            tenantId
          };

          kitchenMenuModel.saveItem(itemData);
          alert(`✨ Saved Menu Dish "${itemData.itemName}" with ${collectedVariants.length} Portion Variants!`);
          this.activeTab = 'catalog';
          this.updateContent();
        });
      }

      return;
    }

    // Standard Sub-tab switching buttons for Catalog view
    this.container.querySelectorAll('.btn-tab-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.updateContent();
      });
    });

    // Open Full-Page Add Dish View
    const addBtn = this.container.querySelector('.btn-open-add-modal');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        this.editingItem = null;
        this.activeTab = 'edit_dish';
        this.updateContent();
      });
    }

    // Catalog Search & Filters
    const searchInp = this.container.querySelector('#inp-catalog-search');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.filters.searchQuery = e.target.value;
        const tabContent = this.container.querySelector('#menu-tab-content');
        if (tabContent && this.activeTab === 'catalog') {
          tabContent.innerHTML = this.renderCatalogTab(tenantId, kitchenMenuModel.getStats(tenantId));
          this.bindEvents(tenantId);
        }
      });
    }

    const catSel = this.container.querySelector('#sel-catalog-category');
    if (catSel) {
      catSel.addEventListener('change', (e) => {
        this.filters.category = e.target.value;
        this.updateContent();
      });
    }

    const dietSel = this.container.querySelector('#sel-catalog-dietary');
    if (dietSel) {
      dietSel.addEventListener('change', (e) => {
        this.filters.dietaryType = e.target.value;
        this.updateContent();
      });
    }

    const availSel = this.container.querySelector('#sel-catalog-availability');
    if (availSel) {
      availSel.addEventListener('change', (e) => {
        this.filters.availabilityStatus = e.target.value;
        this.updateContent();
      });
    }

    // Inline Catalog Status Dropdowns
    this.container.querySelectorAll('.sel-item-status').forEach(sel => {
      sel.addEventListener('change', (e) => {
        kitchenMenuModel.toggleAvailability(e.target.dataset.id, e.target.value);
        this.updateContent();
      });
    });

    // Quick Availability Toggles in Availability Tab
    this.container.querySelectorAll('.btn-quick-avail').forEach(btn => {
      btn.addEventListener('click', () => {
        kitchenMenuModel.toggleAvailability(btn.dataset.id, btn.dataset.status);
        this.updateContent();
      });
    });

    // Edit Dish Buttons -> Open Full-Page Editor View
    this.container.querySelectorAll('.btn-edit-dish').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = kitchenMenuModel.getById(btn.dataset.id);
        if (item) {
          this.editingItem = item;
          this.activeTab = 'edit_dish';
          this.updateContent();
        }
      });
    });

    // Archive Dish Buttons (Controlled Lifecycle)
    this.container.querySelectorAll('.btn-archive-dish').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Archive this dish? It will be moved to ARCHIVED status and hidden from active sales.')) {
          kitchenMenuModel.archiveItem(btn.dataset.id);
          this.updateContent();
        }
      });
    });

    // 1-Click Load Actual Menu Dataset Button
    const loadActualBtn = this.container.querySelector('.btn-load-actual-menu');
    if (loadActualBtn) {
      loadActualBtn.addEventListener('click', () => {
        const res = kitchenMenuModel.importActualMenu(tenantId);
        alert(`✨ Successfully imported ${res.importedCount} actual Anchor coastal menu items!`);
        this.activeTab = 'catalog';
        this.updateContent();
      });
    }

    // Download CSV Template
    const templateBtn = this.container.querySelector('.btn-download-template');
    if (templateBtn) {
      templateBtn.addEventListener('click', () => this.downloadCSVTemplate());
    }

    // Upload File Input Listener
    const fileInp = this.container.querySelector('#inp-upload-menu-file');
    if (fileInp) {
      fileInp.addEventListener('change', (e) => this.handleFileUpload(e.target.files[0], tenantId));
    }

    // Confirm Bulk Import Button
    const confirmImportBtn = this.container.querySelector('.btn-confirm-import');
    if (confirmImportBtn) {
      confirmImportBtn.addEventListener('click', () => {
        const res = kitchenMenuModel.importFromRows(this.importPreviewRows, tenantId);
        if (res.success) {
          alert(`✅ Bulk imported ${res.importedCount} menu items successfully!`);
          this.importPreviewRows = [];
          this.importFileName = '';
          this.importErrors = [];
          this.activeTab = 'catalog';
          this.updateContent();
        } else {
          alert(`Import failed: ${res.errors.join('\n')}`);
        }
      });
    }
  }

  bindVariantRowEvents(row) {
    const removeBtn = row.querySelector('.btn-remove-v-row');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        row.remove();
      });
    }

    const linkBtn = row.querySelector('.btn-link-variant-bom');
    if (linkBtn) {
      linkBtn.addEventListener('click', () => {
        const vName = row.querySelector('.v-inp-name')?.value || 'Variant';
        alert(`🔗 Linking BOM Recipe for variant "${vName}". Redirecting to Recipe Studio...`);
      });
    }
  }
}

