/**
 * RestaurantOS Capability - Inventory & Store Operations Workspace (F3.1)
 * Dedicated workspace for Store Managers, Kitchen Supervisors, and Inventory Operations.
 * Operational Sub-Views: Stock Overview, Item Inspector, Receive Stock (GRN), Wastage & Adjustments, Low Stock Alerts, Inventory Audit.
 * Operates strictly on inventoryProjectionService.js, inventoryItemModel.js, and inventoryMovementModel.js.
 */

import { inventoryProjectionService } from '../../../../../businessos/platform/inventory/inventoryProjectionService.js';
import { inventoryItemModel } from '../../../../../businessos/platform/inventory/inventoryItemModel.js';
import { inventoryMovementModel } from '../../../../../businessos/platform/inventory/inventoryMovementModel.js';
import { purchasingModel } from '../../../../../businessos/platform/inventory/purchasingModel.js';
import { supplierModel } from '../../../../../businessos/platform/inventory/supplierModel.js';
import { inventoryStockCountModel } from '../../../../../businessos/platform/inventory/inventoryStockCountModel.js';
import { inventoryReconciliationService } from '../../../../../businessos/platform/inventory/inventoryReconciliationService.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

export class InventoryWorkspaceView {
  constructor(deps = {}) {
    this.container = null;
    this.mountEl = null;
    this.activeTab = 'overview'; // 'overview' | 'receive' | 'wastage' | 'alerts' | 'audit'
    this.selectedItemId = null;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
  }

  render(mountEl, sessionUser = null, subView = 'overview') {
    this.mountEl = mountEl;
    if (subView && subView !== 'inventory') {
      this.activeTab = subView;
    }

    this.container = document.createElement('div');
    this.container.className = 'inventory-workspace animate-fade-in';
    this.container.style.cssText = 'display:flex; flex-direction:column; width:100%; height:100%; background:var(--bg-base); color:var(--text-primary); overflow:hidden; font-family:var(--font-family, sans-serif);';

    this.subscribePlatformEvents();
    this.updateContent(sessionUser);

    if (mountEl) {
      mountEl.innerHTML = '';
      mountEl.appendChild(this.container);
    }
    return this.container;
  }

  subscribePlatformEvents() {
    const refresh = () => {
      if (this.container && document.body.contains(this.container)) {
        this.updateContent();
      }
    };
    this.unsubscribeEvents = [
      platformEventBus.subscribe('inventory:movement:recorded', refresh),
      platformEventBus.subscribe('inventory:wastage:recorded', refresh),
      platformEventBus.subscribe('data:changed', refresh)
    ];
  }

  updateContent(sessionUser = null) {
    if (!this.container) return;

    const summary = inventoryProjectionService.getInventoryValuationSummary();
    const user = sessionUser || { name: 'Jitu', role: 'Store Manager' };

    this.container.innerHTML = `
      <!-- TOP NAVIGATION BAR -->
      <header style="padding:14px 24px; background:var(--bg-surface-1); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="width:38px; height:38px; border-radius:10px; background:linear-gradient(135deg, #10b981, #059669); display:flex; align-items:center; justify-content:center; font-size:1.2rem; font-weight:800; color:#fff; box-shadow:0 4px 12px rgba(16,185,129,0.3);">📦</div>
          <div>
            <h1 style="margin:0; font-size:1.2rem; font-weight:800; letter-spacing:-0.02em; display:flex; align-items:center; gap:8px;">
              Anchor BusinessOS <span class="badge badge-success" style="font-size:0.7rem; padding:2px 8px;">INVENTORY &amp; STORE WORKSPACE</span>
            </h1>
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">Stock Movement Ledger, Valuation &amp; Reorder Management</div>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:12px;">
          <div style="display:flex; align-items:center; gap:8px; padding:6px 12px; background:var(--bg-surface-2); border-radius:8px; border:1px solid var(--border-subtle);">
            <span style="font-size:0.85rem; font-weight:700;">🏬 Store: ${user.name}</span>
          </div>
        </div>
      </header>

      <!-- TAB STRIP -->
      <nav style="display:flex; gap:4px; padding:8px 24px 0; background:var(--bg-surface-1); border-bottom:1px solid var(--border-subtle); flex-shrink:0; overflow-x:auto;">
        <button class="tab-btn ${this.activeTab === 'overview' ? 'active' : ''}" data-tab="overview" style="padding:10px 16px; font-size:0.85rem; font-weight:800; border:none; border-bottom:3px solid ${this.activeTab === 'overview' ? 'var(--accent-primary)' : 'transparent'}; background:transparent; color:${this.activeTab === 'overview' ? 'var(--accent-primary)' : 'var(--text-muted)'}; cursor:pointer;">📦 Stock Overview</button>
        <button class="tab-btn ${this.activeTab === 'purchasing' ? 'active' : ''}" data-tab="purchasing" style="padding:10px 16px; font-size:0.85rem; font-weight:800; border:none; border-bottom:3px solid ${this.activeTab === 'purchasing' ? 'var(--accent-primary)' : 'transparent'}; background:transparent; color:${this.activeTab === 'purchasing' ? 'var(--accent-primary)' : 'var(--text-muted)'}; cursor:pointer;">🛒 Purchasing &amp; POs</button>
        <button class="tab-btn ${this.activeTab === 'receive' ? 'active' : ''}" data-tab="receive" style="padding:10px 16px; font-size:0.85rem; font-weight:800; border:none; border-bottom:3px solid ${this.activeTab === 'receive' ? 'var(--accent-primary)' : 'transparent'}; background:transparent; color:${this.activeTab === 'receive' ? 'var(--accent-primary)' : 'var(--text-muted)'}; cursor:pointer;">📥 Goods Receiving (GRN)</button>
        <button class="tab-btn ${this.activeTab === 'suppliers' ? 'active' : ''}" data-tab="suppliers" style="padding:10px 16px; font-size:0.85rem; font-weight:800; border:none; border-bottom:3px solid ${this.activeTab === 'suppliers' ? 'var(--accent-primary)' : 'transparent'}; background:transparent; color:${this.activeTab === 'suppliers' ? 'var(--accent-primary)' : 'var(--text-muted)'}; cursor:pointer;">🏢 Suppliers &amp; Payables</button>
        <button class="tab-btn ${this.activeTab === 'stockcount' ? 'active' : ''}" data-tab="stockcount" style="padding:10px 16px; font-size:0.85rem; font-weight:800; border:none; border-bottom:3px solid ${this.activeTab === 'stockcount' ? 'var(--accent-primary)' : 'transparent'}; background:transparent; color:${this.activeTab === 'stockcount' ? 'var(--accent-primary)' : 'var(--text-muted)'}; cursor:pointer;">📋 Stock Count Audit</button>
        <button class="tab-btn ${this.activeTab === 'reconciliation' ? 'active' : ''}" data-tab="reconciliation" style="padding:10px 16px; font-size:0.85rem; font-weight:800; border:none; border-bottom:3px solid ${this.activeTab === 'reconciliation' ? 'var(--accent-primary)' : 'transparent'}; background:transparent; color:${this.activeTab === 'reconciliation' ? 'var(--accent-primary)' : 'var(--text-muted)'}; cursor:pointer;">⚖️ Reconciliation</button>
        <button class="tab-btn ${this.activeTab === 'wastage' ? 'active' : ''}" data-tab="wastage" style="padding:10px 16px; font-size:0.85rem; font-weight:800; border:none; border-bottom:3px solid ${this.activeTab === 'wastage' ? 'var(--accent-primary)' : 'transparent'}; background:transparent; color:${this.activeTab === 'wastage' ? 'var(--accent-primary)' : 'var(--text-muted)'}; cursor:pointer;">🗑️ Wastage Intelligence</button>
        <button class="tab-btn ${this.activeTab === 'alerts' ? 'active' : ''}" data-tab="alerts" style="padding:10px 16px; font-size:0.85rem; font-weight:800; border:none; border-bottom:3px solid ${this.activeTab === 'alerts' ? 'var(--accent-primary)' : 'transparent'}; background:transparent; color:${this.activeTab === 'alerts' ? 'var(--accent-primary)' : 'var(--text-muted)'}; cursor:pointer;">⚠️ Low Stock (${summary.reorderAlertsCount})</button>
        <button class="tab-btn ${this.activeTab === 'audit' ? 'active' : ''}" data-tab="audit" style="padding:10px 16px; font-size:0.85rem; font-weight:800; border:none; border-bottom:3px solid ${this.activeTab === 'audit' ? 'var(--accent-primary)' : 'transparent'}; background:transparent; color:${this.activeTab === 'audit' ? 'var(--accent-primary)' : 'var(--text-muted)'}; cursor:pointer;">📜 Inventory Audit</button>
      </nav>

      <!-- BODY CONTENT -->
      <main style="flex:1; padding:24px; overflow-y:auto; background:var(--bg-base);">
        ${this.renderActiveTabBody(summary)}
      </main>

      <!-- ITEM INSPECTOR MODAL -->
      ${this.selectedItemId ? this.renderItemInspectorModal() : ''}
    `;

    this.bindEvents();
  }

  renderActiveTabBody(summary) {
    if (this.activeTab === 'purchasing') return this.renderPurchasingTab();
    if (this.activeTab === 'receive') return this.renderReceiveStockTab();
    if (this.activeTab === 'suppliers') return this.renderSuppliersTab();
    if (this.activeTab === 'stockcount') return this.renderStockCountTab();
    if (this.activeTab === 'reconciliation') return this.renderReconciliationTab();
    if (this.activeTab === 'wastage') return this.renderWastageTab();
    if (this.activeTab === 'alerts') return this.renderLowStockTab(summary);
    if (this.activeTab === 'audit') return this.renderAuditTab();
    return this.renderStockOverviewTab(summary);
  }

  // --- SUBVIEW 1: STOCK OVERVIEW ---
  renderStockOverviewTab(summary) {
    return `
      <div style="display:flex; flex-direction:column; gap:20px; max-width:1100px; margin:0 auto;">
        
        <!-- KPI SUMMARY CARDS -->
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:16px;">
          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #10b981; border-radius:8px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL INVENTORY ITEMS</div>
            <div style="font-size:1.6rem; font-weight:800; color:#10b981; margin-top:2px;">${summary.totalItemsCount} Active Items</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #3b82f6; border-radius:8px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL STOCK ASSET VALUATION</div>
            <div style="font-size:1.6rem; font-weight:800; color:#3b82f6; margin-top:2px;">₹${summary.totalValuation.toFixed(2)}</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #f59e0b; border-radius:8px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">LOW STOCK REORDER ALERTS</div>
            <div style="font-size:1.6rem; font-weight:800; color:#f59e0b; margin-top:2px;">${summary.reorderAlertsCount} Items</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #8b5cf6; border-radius:8px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">VALUATION COSTING METHOD</div>
            <div style="font-size:1.4rem; font-weight:800; color:#8b5cf6; margin-top:2px;">Weighted Average</div>
          </div>
        </div>

        <!-- STOCK TABLE -->
        <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-subtle);">
          <div style="padding:14px 20px; background:var(--bg-surface-2); font-weight:800; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
            <span>Ingredient &amp; Materials Inventory Balance</span>
            <span style="font-size:0.82rem; color:var(--text-muted);">Click any row to open complete movement inspector</span>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                <th style="padding:12px 16px;">Ingredient / SKU</th>
                <th style="padding:12px 16px;">Category</th>
                <th style="padding:12px 16px; text-align:right;">Current Stock</th>
                <th style="padding:12px 16px; text-align:right;">Weighted Avg Cost</th>
                <th style="padding:12px 16px; text-align:right;">Stock Valuation</th>
                <th style="padding:12px 16px; text-align:center;">Status</th>
                <th style="padding:12px 16px; text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${summary.items.map(i => `
                <tr class="stock-row" data-item-id="${i.id}" style="border-bottom:1px solid var(--border-subtle); cursor:pointer;">
                  <td style="padding:12px 16px; font-weight:800; color:var(--accent-primary);">${i.name}</td>
                  <td style="padding:12px 16px;"><span class="badge badge-info">${i.category}</span></td>
                  <td style="padding:12px 16px; text-align:right; font-weight:800; font-size:0.95rem;">${i.currentStock} ${i.baseUnit}</td>
                  <td style="padding:12px 16px; text-align:right;">₹${i.weightedAverageCost.toFixed(2)} / ${i.baseUnit}</td>
                  <td style="padding:12px 16px; text-align:right; font-weight:800; color:#10b981;">₹${i.stockValuation.toFixed(2)}</td>
                  <td style="padding:12px 16px; text-align:center;">
                    <span class="badge ${i.isReorderRequired ? 'badge-danger' : 'badge-success'}" style="font-weight:700;">
                      ${i.isReorderRequired ? '🟠 Low Stock' : '🟢 Healthy'}
                    </span>
                  </td>
                  <td style="padding:12px 16px; text-align:center;">
                    <button class="btn-secondary btn-inspect-item" data-item-id="${i.id}" style="padding:4px 8px; font-size:0.75rem; font-weight:700;">🔍 History</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --- SUBVIEW: PURCHASING & PO MANAGEMENT ---
  renderPurchasingTab() {
    const pos = offlineStore.getCollection('purchase_orders') || [];

    return `
      <div style="display:flex; flex-direction:column; gap:20px; max-width:1100px; margin:0 auto;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin:0; font-size:1.2rem; font-weight:800;">🛒 Purchase Orders &amp; Commitment Control</h3>
            <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Manage agreed purchase orders (POs). PO commitments do NOT alter physical stock balances until GRN is received.</p>
          </div>
          <button id="btn-open-create-po-modal" class="btn-primary" style="padding:10px 16px; font-size:0.85rem; font-weight:800; background:var(--accent-primary); color:#000; border:none; border-radius:8px; cursor:pointer;">
            ➕ Create New Purchase Order
          </button>
        </div>

        <!-- PO TABLE -->
        <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-subtle);">
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                <th style="padding:12px 16px;">PO Number</th>
                <th style="padding:12px 16px;">Supplier</th>
                <th style="padding:12px 16px;">Items Ordered</th>
                <th style="padding:12px 16px; text-align:right;">Grand Total</th>
                <th style="padding:12px 16px; text-align:center;">Status</th>
                <th style="padding:12px 16px;">Created By</th>
                <th style="padding:12px 16px; text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${pos.length > 0 ? pos.map(p => `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:12px 16px; font-weight:800; color:var(--accent-primary);">${p.poNumber}</td>
                  <td style="padding:12px 16px; font-weight:700;">${p.supplierName}</td>
                  <td style="padding:12px 16px;">${p.items ? p.items.map(i => `${i.itemName} (${i.receivedQty}/${i.orderedQty} ${i.unit})`).join(', ') : 'Items'}</td>
                  <td style="padding:12px 16px; text-align:right; font-weight:800;">₹${p.grandTotal.toFixed(2)}</td>
                  <td style="padding:12px 16px; text-align:center;">
                    <span class="badge ${p.status === 'RECEIVED' ? 'badge-success' : (p.status === 'PARTIALLY_RECEIVED' ? 'badge-warning' : 'badge-info')}">
                      ${p.status}
                    </span>
                  </td>
                  <td style="padding:12px 16px; font-size:0.8rem;">${p.createdBy}</td>
                  <td style="padding:12px 16px; text-align:center;">
                    <button class="btn-secondary btn-inspect-purchasing-trace" data-po-id="${p.id}" style="padding:4px 8px; font-size:0.75rem; font-weight:700;">🔍 Trace Chain</button>
                  </td>
                </tr>
              `).join('') : `
                <tr><td colspan="7" style="padding:24px; text-align:center; color:var(--text-muted);">No Purchase Orders recorded.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --- SUBVIEW: SUPPLIERS & PAYABLES ---
  renderSuppliersTab() {
    const suppliers = supplierModel.getAllSuppliers();
    const items = inventoryItemModel.getAllItems();

    return `
      <div style="display:flex; flex-direction:column; gap:20px; max-width:1100px; margin:0 auto;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">🏢 Supplier Master &amp; Accounts Payable Ledger</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Manage supplier profiles, payment terms, outstanding accounts payable, and ingredient price trends.</p>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <!-- SUPPLIER LIST CARD -->
          <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:10px;">
            <h4 style="margin:0 0 12px; font-size:0.95rem; font-weight:800;">Supplier Master Profiles</h4>
            <div style="display:flex; flex-direction:column; gap:12px;">
              ${suppliers.map(s => {
                const payable = supplierModel.getOutstandingPayable(s.id);
                return `
                  <div style="padding:12px; background:var(--bg-surface-2); border-left:4px solid ${payable > 0 ? '#f59e0b' : '#10b981'}; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                      <div style="font-weight:800; font-size:0.9rem;">${s.name} (${s.supplierCode})</div>
                      <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">GSTIN: ${s.gstin} | Terms: ${s.paymentTerms}</div>
                    </div>
                    <div style="text-align:right;">
                      <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">OUTSTANDING PAYABLE</div>
                      <div style="font-size:1.1rem; font-weight:800; color:${payable > 0 ? '#f59e0b' : '#10b981'};">₹${payable.toFixed(2)}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- INGREDIENT PRICE TREND TRACKER -->
          <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:10px;">
            <h4 style="margin:0 0 12px; font-size:0.95rem; font-weight:800;">30-Day Purchase Price Trend Tracker</h4>
            <div style="display:flex; flex-direction:column; gap:10px;">
              ${items.map(i => {
                const trend = supplierModel.getPriceTrendForItem(i.id);
                return `
                  <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; padding:8px 10px; background:var(--bg-surface-2); border-radius:6px;">
                    <div>
                      <span style="font-weight:800;">${i.name}</span>
                      <span style="font-size:0.78rem; color:var(--text-muted); margin-left:6px;">(Base: ${i.baseUnit})</span>
                    </div>
                    <div style="text-align:right;">
                      <span style="font-weight:800;">₹${i.currentUnitCost.toFixed(2)}</span>
                      ${trend.hasTrend ? `
                        <span class="badge ${trend.isPriceIncrease ? 'badge-danger' : 'badge-success'}" style="margin-left:6px; font-size:0.7rem;">
                          ${trend.isPriceIncrease ? '↑' : '↓'} ${Math.abs(trend.changePercent)}%
                        </span>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --- SUBVIEW: STOCK COUNT AUDIT ---
  renderStockCountTab() {
    const items = inventoryItemModel.getAllItems();
    const sessions = inventoryStockCountModel.getAllSessions();
    const pendingSession = sessions.find(s => s.status === 'VARIANCE_REVIEW');

    return `
      <div style="display:flex; flex-direction:column; gap:20px; max-width:1100px; margin:0 auto;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">📋 Physical Stock Count &amp; Audit Approval</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Record physical stock counts. Submitting a count calculates variance without mutating the ledger until explicit Manager Approval.</p>
        </div>

        ${pendingSession ? `
          <div class="card" style="padding:20px; background:var(--bg-surface-1); border-left:4px solid #f59e0b; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="badge badge-warning">VARIANCE REVIEW PENDING</span>
                <span style="font-weight:800; font-size:0.95rem;">${pendingSession.countNumber} (${pendingSession.location})</span>
              </div>
              <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">Recorded By: ${pendingSession.countedBy} | Total Variance Value: <strong style="color:#ef4444;">₹${pendingSession.totalVarianceValue.toFixed(2)}</strong></div>
            </div>
            <button id="btn-approve-stock-count" data-count-id="${pendingSession.id}" class="btn-primary" style="padding:10px 16px; font-weight:800; background:#10b981; color:#fff; border:none; border-radius:8px; cursor:pointer;">
              ✅ Approve Count &amp; Post STOCK_ADJUSTMENT
            </button>
          </div>
        ` : ''}

        <!-- PHYSICAL COUNT INPUT FORM -->
        <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-subtle);">
          <div style="padding:14px 20px; background:var(--bg-surface-2); font-weight:800; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
            <span>Physical Stock Audit Worksheet</span>
            <span style="font-size:0.82rem; color:var(--text-muted);">Enter physical counted quantities</span>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                <th style="padding:12px 16px;">Ingredient</th>
                <th style="padding:12px 16px; text-align:right;">System Expected Stock</th>
                <th style="padding:12px 16px; text-align:right;">Physical Count Input</th>
                <th style="padding:12px 16px; text-align:right;">WAC (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(i => {
                const sysStock = inventoryProjectionService.getCurrentStock(i.id);
                return `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:12px 16px; font-weight:800; color:var(--accent-primary);">${i.name}</td>
                    <td style="padding:12px 16px; text-align:right; font-weight:800;">${sysStock} ${i.baseUnit}</td>
                    <td style="padding:12px 16px; text-align:right;">
                      <input class="input-field count-qty-input" data-item-id="${i.id}" type="number" step="0.1" value="${sysStock}" style="width:100px; text-align:right; padding:6px 8px; font-weight:700;" />
                      <span style="font-size:0.8rem; color:var(--text-muted); font-weight:700; margin-left:4px;">${i.baseUnit}</span>
                    </td>
                    <td style="padding:12px 16px; text-align:right;">₹${i.currentUnitCost.toFixed(2)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div style="padding:16px; text-align:right; background:var(--bg-surface-1); border-top:1px solid var(--border-subtle);">
            <button id="btn-submit-stock-count-review" class="btn-primary" style="padding:10px 20px; font-weight:800; font-size:0.9rem; background:var(--accent-primary); color:#000; border:none; border-radius:8px; cursor:pointer;">
              📋 Submit Physical Count for Variance Review
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // --- SUBVIEW: INVENTORY RECONCILIATION ---
  renderReconciliationTab() {
    const recon = inventoryReconciliationService.getInventoryReconciliationReport();

    return `
      <div style="display:flex; flex-direction:column; gap:20px; max-width:1100px; margin:0 auto;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">⚖️ Inventory Reconciliation Statement</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">
            Formula: Opening + Purchases - Theoretical Usage - Wastage = Expected Closing vs Physical Count → <strong>Unexplained Variance</strong>
          </p>
        </div>

        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px;">
          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #10b981; border-radius:8px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">ITEMS EVALUATED</div>
            <div style="font-size:1.6rem; font-weight:800; color:#10b981; margin-top:2px;">${recon.totalItemsEvaluated} Ingredients</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #ef4444; border-radius:8px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL UNEXPLAINED VARIANCE VALUE</div>
            <div style="font-size:1.6rem; font-weight:800; color:#ef4444; margin-top:2px;">₹${recon.totalUnexplainedVarianceValue.toFixed(2)}</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #3b82f6; border-radius:8px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">LATEST COUNT SOURCE</div>
            <div style="font-size:1.4rem; font-weight:800; color:#3b82f6; margin-top:2px;">${recon.latestCountNumber}</div>
          </div>
        </div>

        <!-- RECONCILIATION TABLE -->
        <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-subtle);">
          <table style="width:100%; border-collapse:collapse; font-size:0.83rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                <th style="padding:10px 14px;">Ingredient</th>
                <th style="padding:10px 14px; text-align:right;">Opening</th>
                <th style="padding:10px 14px; text-align:right;">+ Purchases</th>
                <th style="padding:10px 14px; text-align:right;">- Theoretical Usage</th>
                <th style="padding:10px 14px; text-align:right;">- Wastage</th>
                <th style="padding:10px 14px; text-align:right;">Expected Closing</th>
                <th style="padding:10px 14px; text-align:right;">Physical Count</th>
                <th style="padding:10px 14px; text-align:right;">Unexplained Variance</th>
              </tr>
            </thead>
            <tbody>
              ${recon.items.map(i => `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:10px 14px; font-weight:800; color:var(--accent-primary);">${i.name}</td>
                  <td style="padding:10px 14px; text-align:right;">${i.openingStock} ${i.baseUnit}</td>
                  <td style="padding:10px 14px; text-align:right; color:#10b981; font-weight:700;">+${i.purchases}</td>
                  <td style="padding:10px 14px; text-align:right; color:var(--text-muted);">${i.theoreticalUsage}</td>
                  <td style="padding:10px 14px; text-align:right; color:#ef4444;">-${i.wastage}</td>
                  <td style="padding:10px 14px; text-align:right; font-weight:800;">${i.expectedClosingStock} ${i.baseUnit}</td>
                  <td style="padding:10px 14px; text-align:right; font-weight:800; color:#3b82f6;">${i.physicalCount} ${i.baseUnit}</td>
                  <td style="padding:10px 14px; text-align:right; font-weight:800; color:${i.unexplainedVarianceQty === 0 ? '#10b981' : '#ef4444'}; font-size:0.9rem;">
                    ${i.unexplainedVarianceQty > 0 ? '+' : ''}${i.unexplainedVarianceQty} ${i.baseUnit} (₹${i.unexplainedVarianceValue.toFixed(2)})
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --- SUBVIEW 2: RECEIVE STOCK (GRN) ---
  renderReceiveStockTab() {
    const items = inventoryItemModel.getAllItems();

    return `
      <div style="display:flex; flex-direction:column; gap:20px; max-width:700px; margin:0 auto;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">📥 Receive Goods &amp; Stock Delivery (GRN)</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Record direct supplier deliveries. Increases actual stock and recalculates Weighted Average Cost.</p>
        </div>

        <div class="card" style="padding:24px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:10px; display:flex; flex-direction:column; gap:16px;">
          <div>
            <label style="font-weight:700; font-size:0.82rem; color:var(--text-secondary); display:block; margin-bottom:6px;">SUPPLIER / VENDOR NAME</label>
            <input id="input-supplier-name" class="input-field" type="text" placeholder="e.g. Metro Cash & Carry / Prestige Realty" value="Prestige Dairy & Supplies" style="width:100%; padding:10px 12px;" />
          </div>

          <div>
            <label style="font-weight:700; font-size:0.82rem; color:var(--text-secondary); display:block; margin-bottom:6px;">SELECT INGREDIENT ITEM</label>
            <select id="select-receive-item" class="input-field" style="width:100%; padding:10px 12px;">
              ${items.map(i => `<option value="${i.id}">${i.name} (Current Base: ${i.baseUnit})</option>`).join('')}
            </select>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style="font-weight:700; font-size:0.82rem; color:var(--text-secondary); display:block; margin-bottom:6px;">DELIVERED QUANTITY</label>
              <input id="input-receive-qty" class="input-field" type="number" step="0.1" placeholder="e.g. 25" value="25" style="width:100%; padding:10px 12px;" />
            </div>

            <div>
              <label style="font-weight:700; font-size:0.82rem; color:var(--text-secondary); display:block; margin-bottom:6px;">PURCHASE UNIT COST (₹)</label>
              <input id="input-receive-cost" class="input-field" type="number" step="0.01" placeholder="e.g. 420" value="420" style="width:100%; padding:10px 12px;" />
            </div>
          </div>

          <div>
            <label style="font-weight:700; font-size:0.82rem; color:var(--text-secondary); display:block; margin-bottom:6px;">GRN / INVOICE REFERENCE NO</label>
            <input id="input-receive-ref" class="input-field" type="text" placeholder="e.g. GRN-2026-0042" value="GRN-2026-0089" style="width:100%; padding:10px 12px;" />
          </div>

          <button id="btn-submit-receive-stock" class="btn-primary" style="padding:12px; font-weight:800; font-size:0.95rem; background:var(--accent-primary); color:#000; border:none; border-radius:8px; cursor:pointer; margin-top:8px;">
            📥 Record Stock Receipt &amp; Update WAC
          </button>
        </div>
      </div>
    `;
  }

  // --- SUBVIEW 3: WASTAGE INTELLIGENCE & LOGGING ---
  renderWastageTab() {
    const items = inventoryItemModel.getAllItems();
    const wastageAnalytics = inventoryReconciliationService.getWastageAnalytics();

    return `
      <div style="display:flex; flex-direction:column; gap:20px; max-width:1100px; margin:0 auto;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">🗑️ Wastage Intelligence &amp; Spoilage Analytics</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Track operational wastage, kitchen prep spillage, expired inventory, and cost distribution by reason classification.</p>
        </div>

        <!-- WASTAGE SUMMARY CARDS -->
        <div style="display:grid; grid-template-columns:1fr 2fr; gap:16px;">
          <div class="card" style="padding:20px; background:var(--bg-surface-1); border-left:4px solid #ef4444; border-radius:10px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL WASTAGE COST (MONTH)</div>
            <div style="font-size:1.8rem; font-weight:800; color:#ef4444; margin-top:4px;">₹${wastageAnalytics.totalWastageCost.toFixed(2)}</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">Logged across ${wastageAnalytics.totalEntriesCount} audit entries</div>
          </div>

          <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:10px;">
            <h4 style="margin:0 0 10px; font-size:0.88rem; font-weight:800;">Wastage Breakdown by Reason</h4>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${wastageAnalytics.reasons.map(r => `
                <div>
                  <div style="display:flex; justify-content:space-between; font-size:0.8rem; font-weight:700; margin-bottom:2px;">
                    <span>${r.reason} (${r.count} logs)</span>
                    <span style="color:#ef4444;">₹${r.cost.toFixed(2)} (${r.percent}%)</span>
                  </div>
                  <div style="height:6px; background:var(--bg-surface-2); border-radius:3px; overflow:hidden;">
                    <div style="width:${r.percent}%; height:100%; background:#ef4444;"></div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- LOG WASTAGE FORM -->
        <div class="card" style="padding:24px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:10px; display:flex; flex-direction:column; gap:16px;">
          <h4 style="margin:0; font-size:0.95rem; font-weight:800;">Manager-Authorized Stock Wastage Form</h4>
          
          <div>
            <label style="font-weight:700; font-size:0.82rem; color:var(--text-secondary); display:block; margin-bottom:6px;">SELECT INGREDIENT</label>
            <select id="select-wastage-item" class="input-field" style="width:100%; padding:10px 12px;">
              ${items.map(i => `<option value="${i.id}">${i.name} (Current Base: ${i.baseUnit})</option>`).join('')}
            </select>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style="font-weight:700; font-size:0.82rem; color:var(--text-secondary); display:block; margin-bottom:6px;">WASTAGE QUANTITY</label>
              <input id="input-wastage-qty" class="input-field" type="number" step="0.1" placeholder="e.g. 2.4" value="2.4" style="width:100%; padding:10px 12px;" />
            </div>

            <div>
              <label style="font-weight:700; font-size:0.82rem; color:var(--text-secondary); display:block; margin-bottom:6px;">REASON CLASSIFICATION</label>
              <select id="select-wastage-reason" class="input-field" style="width:100%; padding:10px 12px;">
                <option value="Preparation Waste">Preparation Waste / Prep Damage</option>
                <option value="Spoilage">Spoilage / Storage Leakage</option>
                <option value="Expiry">Expiry / Batch Date Reached</option>
                <option value="Overproduction">Overproduction / Unsold Batch</option>
                <option value="Damage">Physical Damage / Spill</option>
              </select>
            </div>
          </div>

          <div>
            <label style="font-weight:700; font-size:0.82rem; color:var(--text-secondary); display:block; margin-bottom:6px;">AUDIT NOTES &amp; EXPLANATION</label>
            <input id="input-wastage-notes" class="input-field" type="text" placeholder="e.g. Expired batch during weekend shift" value="Kitchen prep spoilage" style="width:100%; padding:10px 12px;" />
          </div>

          <button id="btn-submit-record-wastage" class="btn-primary" style="padding:12px; font-weight:800; font-size:0.95rem; background:#ef4444; color:#fff; border:none; border-radius:8px; cursor:pointer; margin-top:8px;">
            🗑️ Log Stock Wastage (-2.4 KG)
          </button>
        </div>
      </div>
    `;
  }

  // --- SUBVIEW 4: LOW STOCK & REORDER ALERTS ---
  renderLowStockTab(summary) {
    const alerts = summary.items.filter(i => i.isReorderRequired);

    return `
      <div style="display:flex; flex-direction:column; gap:20px; max-width:900px; margin:0 auto;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">⚠️ Low Stock Reorder Recommendations</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Stock balance items currently at or below minimum reorder thresholds.</p>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          ${alerts.length > 0 ? alerts.map(a => `
            <div class="card" style="padding:20px; background:var(--bg-surface-1); border-left:4px solid #f59e0b; border-radius:10px; display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <h4 style="margin:0; font-size:1rem; font-weight:800; color:var(--accent-primary);">${a.name}</h4>
                  <span class="badge badge-warning" style="font-weight:700;">LOW STOCK</span>
                </div>
                <div style="font-size:0.82rem; color:var(--text-muted); margin-top:4px;">Category: ${a.category}</div>

                <div style="margin-top:14px; display:flex; flex-direction:column; gap:6px; font-size:0.85rem;">
                  <div style="display:flex; justify-content:space-between;"><span>Current Stock:</span><span style="font-weight:800; color:#ef4444;">${a.currentStock} ${a.baseUnit}</span></div>
                  <div style="display:flex; justify-content:space-between;"><span>Weighted Avg Cost:</span><span style="font-weight:700;">₹${a.weightedAverageCost.toFixed(2)}</span></div>
                  <div style="display:flex; justify-content:space-between;"><span>Projected Days Remaining:</span><span style="font-weight:800; color:#f59e0b;">~1.2 Days</span></div>
                </div>
              </div>

              <button class="btn-primary btn-trigger-reorder" data-item-name="${a.name}" style="padding:8px 12px; font-size:0.8rem; font-weight:800; background:var(--accent-primary); color:#000; border:none; border-radius:6px; cursor:pointer; margin-top:16px;">
                🛒 Generate Purchase Request
              </button>
            </div>
          `).join('') : `
            <div class="card" style="padding:24px; text-align:center; color:var(--status-success); font-weight:800; grid-column:span 2;">
              🟢 100% HEALTHY — ALL INGREDIENTS ABOVE MINIMUM REORDER LEVEL!
            </div>
          `}
        </div>
      </div>
    `;
  }

  // --- SUBVIEW 5: INVENTORY AUDIT ---
  renderAuditTab() {
    const movements = inventoryMovementModel.getAllMovements();

    return `
      <div style="display:flex; flex-direction:column; gap:20px; max-width:1100px; margin:0 auto;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">📜 Append-Only Inventory Movement Ledger</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Chronological audit trail of all signed stock movements, receipts, wastage, and BOM usages.</p>
        </div>

        <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-subtle);">
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                <th style="padding:12px 16px;">Timestamp</th>
                <th style="padding:12px 16px;">Movement ID</th>
                <th style="padding:12px 16px;">Item</th>
                <th style="padding:12px 16px;">Movement Type</th>
                <th style="padding:12px 16px; text-align:right;">Signed Qty</th>
                <th style="padding:12px 16px; text-align:right;">Unit Cost</th>
                <th style="padding:12px 16px;">Performed By</th>
                <th style="padding:12px 16px;">Operation ID</th>
              </tr>
            </thead>
            <tbody>
              ${movements.map(m => `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:12px 16px; color:var(--text-muted); font-size:0.8rem;">${new Date(m.createdAt).toLocaleString()}</td>
                  <td style="padding:12px 16px; font-weight:800; color:var(--accent-primary);">${m.movementId}</td>
                  <td style="padding:12px 16px; font-weight:700;">${m.inventoryItemId}</td>
                  <td style="padding:12px 16px;"><span class="badge ${m.normalizedQuantity > 0 ? 'badge-success' : 'badge-danger'}">${m.movementType}</span></td>
                  <td style="padding:12px 16px; text-align:right; font-weight:800; color:${m.normalizedQuantity > 0 ? '#10b981' : '#ef4444'};">
                    ${m.normalizedQuantity > 0 ? '+' : ''}${m.normalizedQuantity} ${m.baseUnit}
                  </td>
                  <td style="padding:12px 16px; text-align:right;">₹${(parseFloat(m.unitCost) || 0).toFixed(2)}</td>
                  <td style="padding:12px 16px; font-size:0.8rem;">${m.performedBy}</td>
                  <td style="padding:12px 16px; font-family:monospace; color:var(--text-muted); font-size:0.75rem;">${m.operationId}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --- ITEM INSPECTOR MODAL ---
  renderItemInspectorModal() {
    const item = inventoryItemModel.getItemById(this.selectedItemId);
    const movements = inventoryMovementModel.getMovementsForItem(this.selectedItemId);
    const currentStock = inventoryProjectionService.getCurrentStock(this.selectedItemId);
    const wac = inventoryProjectionService.getWeightedAverageCost(this.selectedItemId);

    if (!item) return '';

    return `
      <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999; backdrop-filter:blur(4px);">
        <div class="card animate-fade-in" style="width:90%; max-width:800px; max-height:85vh; overflow-y:auto; padding:24px; background:var(--bg-surface-1); border-radius:12px;">
          
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:12px; margin-bottom:16px;">
            <h3 style="margin:0; font-size:1.2rem; font-weight:800; display:flex; align-items:center; gap:8px;">
              <span>🔍</span> Item Inspector — ${item.name} (${item.sku})
            </h3>
            <button id="btn-close-item-inspector" class="btn-secondary" style="padding:4px 10px; font-weight:700;">✕ Close</button>
          </div>

          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:20px;">
            <div style="padding:12px; background:var(--bg-surface-2); border-radius:8px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">CURRENT STOCK</div>
              <div style="font-size:1.4rem; font-weight:800; color:#10b981; margin-top:2px;">${currentStock} ${item.baseUnit}</div>
            </div>

            <div style="padding:12px; background:var(--bg-surface-2); border-radius:8px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">WEIGHTED AVG COST</div>
              <div style="font-size:1.4rem; font-weight:800; color:var(--accent-primary); margin-top:2px;">₹${wac.toFixed(2)} / ${item.baseUnit}</div>
            </div>

            <div style="padding:12px; background:var(--bg-surface-2); border-radius:8px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">STOCK VALUATION</div>
              <div style="font-size:1.4rem; font-weight:800; color:#3b82f6; margin-top:2px;">₹${(currentStock * wac).toFixed(2)}</div>
            </div>
          </div>

          <h4 style="margin:0 0 12px; font-size:0.95rem; font-weight:800;">Recent Movement History (${movements.length} Movements)</h4>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${movements.map(m => `
              <div style="padding:10px 12px; background:var(--bg-surface-2); border-left:4px solid ${m.normalizedQuantity > 0 ? '#10b981' : '#ef4444'}; border-radius:6px; font-size:0.82rem; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <span class="badge ${m.normalizedQuantity > 0 ? 'badge-success' : 'badge-danger'}">${m.movementType}</span>
                  <span style="font-weight:700; margin-left:8px;">${m.notes}</span>
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${new Date(m.createdAt).toLocaleString()} | ${m.performedBy}</div>
                </div>
                <div style="text-align:right; font-weight:800; color:${m.normalizedQuantity > 0 ? '#10b981' : '#ef4444'}; font-size:0.95rem;">
                  ${m.normalizedQuantity > 0 ? '+' : ''}${m.normalizedQuantity} ${item.baseUnit}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Tab strip buttons
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.updateContent();
      });
    });

    // Inspect item click handlers
    this.container.querySelectorAll('.stock-row, .btn-inspect-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedItemId = el.dataset.itemId;
        this.updateContent();
      });
    });

    // Close Item Inspector
    const btnClose = this.container.querySelector('#btn-close-item-inspector');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        this.selectedItemId = null;
        this.updateContent();
      });
    }

    // Submit Receive Stock
    const btnReceive = this.container.querySelector('#btn-submit-receive-stock');
    if (btnReceive) {
      btnReceive.addEventListener('click', () => {
        const supplier = this.container.querySelector('#input-supplier-name').value;
        const itemId = this.container.querySelector('#select-receive-item').value;
        const qty = this.container.querySelector('#input-receive-qty').value;
        const cost = this.container.querySelector('#input-receive-cost').value;
        const ref = this.container.querySelector('#input-receive-ref').value;

        inventoryProjectionService.recordDirectStockReceipt({
          supplierName: supplier,
          inventoryItemId: itemId,
          quantity: qty,
          unitCost: cost,
          referenceNo: ref
        });

        alert(`✅ Stock Receipt recorded successfully! Updated stock balance and recalculated WAC.`);
        this.activeTab = 'overview';
        this.updateContent();
      });
    }

    // Create Purchase Order button
    const btnCreatePo = this.container.querySelector('#btn-open-create-po-modal');
    if (btnCreatePo) {
      btnCreatePo.addEventListener('click', () => {
        const suppliers = supplierModel.getAllSuppliers();
        const items = inventoryItemModel.getAllItems();
        if (suppliers.length === 0 || items.length === 0) return;

        const suppId = suppliers[0].id;
        const itemId = items[0].id;

        purchasingModel.createPurchaseOrder({
          supplierId: suppId,
          items: [{ inventoryItemId: itemId, orderedQty: 50, agreedUnitPrice: 420 }],
          createdBy: 'Store Manager'
        });

        alert(`✅ Purchase Order PO-2026-0043 created successfully for 50 KG Fresh Chicken Breast @ ₹420/KG!`);
        this.activeTab = 'purchasing';
        this.updateContent();
      });
    }

    // Inspect purchasing trace
    this.container.querySelectorAll('.btn-inspect-purchasing-trace').forEach(btn => {
      btn.addEventListener('click', () => {
        const poId = btn.dataset.poId;
        const trace = purchasingModel.getPurchasingTraceability(poId);
        alert(`🔍 Purchasing Audit Chain for ${poId}:\n- Supplier: ${trace.supplier ? trace.supplier.name : 'Supplier'}\n- PO Grand Total: ₹${trace.po.grandTotal}\n- Total GRNs Issued: ${trace.grns.length}\n- Outstanding Supplier Payable: ₹${trace.outstandingPayable}`);
      });
    });

    // Submit Stock Count Review
    const btnSubmitCount = this.container.querySelector('#btn-submit-stock-count-review');
    if (btnSubmitCount) {
      btnSubmitCount.addEventListener('click', () => {
        const inputs = this.container.querySelectorAll('.count-qty-input');
        const countedItems = [];
        inputs.forEach(inp => {
          countedItems.push({
            inventoryItemId: inp.dataset.itemId,
            physicalCountQty: parseFloat(inp.value) || 0
          });
        });

        const session = inventoryStockCountModel.createStockCountSession({
          location: 'Main Store',
          countedItems,
          countedBy: 'Store Manager'
        });

        alert(`📋 Physical Stock Count ${session.countNumber} submitted! Status: VARIANCE_REVIEW. Total Variance Value: ₹${session.totalVarianceValue}. Ledger remains unchanged until Manager Approval.`);
        this.activeTab = 'stockcount';
        this.updateContent();
      });
    }

    // Approve Stock Count Session
    const btnApproveCount = this.container.querySelector('#btn-approve-stock-count');
    if (btnApproveCount) {
      btnApproveCount.addEventListener('click', () => {
        const countId = btnApproveCount.dataset.countId;
        const approved = inventoryStockCountModel.approveStockCountSession(countId, 'Store Manager / Owner');

        alert(`✅ Physical Stock Count ${approved.countNumber} APPROVED! Immutable STOCK_ADJUSTMENT movements posted to ledger.`);
        this.activeTab = 'reconciliation';
        this.updateContent();
      });
    }

    // Submit Wastage
    const btnWastage = this.container.querySelector('#btn-submit-record-wastage');
    if (btnWastage) {
      btnWastage.addEventListener('click', () => {
        const itemId = this.container.querySelector('#select-wastage-item').value;
        const qty = this.container.querySelector('#input-wastage-qty').value;
        const reason = this.container.querySelector('#select-wastage-reason').value;
        const notes = this.container.querySelector('#input-wastage-notes').value;

        inventoryProjectionService.recordActualStockWastage({
          inventoryItemId: itemId,
          quantity: qty,
          reason,
          notes
        });

        alert(`🗑️ Stock Wastage of ${qty} logged under reason: ${reason}.`);
        this.activeTab = 'overview';
        this.updateContent();
      });
    }
  }
}
