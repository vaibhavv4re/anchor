/**
 * RestaurantOS Financial Data Layer - Accounts & Financial Data Workspace
 * Captures operational truth (POS, Inventory, HR, Admin) and presents clean, traceable financial records for Tally / Accounting System consumption.
 * Core Workflow: Capture → Organize → Validate → Reconcile → Report → Export.
 */

import { accountingProjectionService } from '../../../../../businessos/platform/accounting/accountingProjectionService.js';
import { financialPeriodService } from '../../../../../businessos/platform/accounting/financialPeriodService.js';
import { supplierInvoiceModel } from '../../../../../businessos/platform/accounting/supplierInvoiceModel.js';
import { apMatchingEngine } from '../../../../../businessos/platform/accounting/apMatchingEngine.js';
import { supplierPaymentModel } from '../../../../../businessos/platform/accounting/supplierPaymentModel.js';
import { taxConfigurationModel } from '../../../../../businessos/platform/accounting/taxConfigurationModel.js';
import { menuMasterModel } from '../../../../../businessos/platform/ordering/menuMasterModel.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { TaxInvoicePrintModal } from '../../billing/ui/TaxInvoicePrintModal.js';
import { ExportEngine } from '../../../../../businessos/platform/accounting/exportEngine.js';

export class AccountsCaWorkspaceView {
  constructor(deps = {}) {
    this.container = null;
    this.mountEl = null;
    this.activeTab = 'overview'; // 'overview' | 'sales' | 'purchases' | 'expenses' | 'tax' | 'reports' | 'export' | 'tax_setup'
    this.salesSubTab = 'register'; // 'register' | 'collections' | 'traceability'
    this.purchasesSubTab = 'invoices'; // 'invoices' | 'matching' | 'exceptions' | 'queue' | 'disbursements'
    this.dateFilter = 'month'; // 'today' | 'yesterday' | 'week' | 'month' | 'all'
    this.searchQuery = '';
    this.selectedTraceabilitySessionId = null;
    this.selectedSalesInvoiceNumber = null; // Sales Invoice Drawer
    this.selectedSupplierInvoiceId = null; // AP Drawer ID
    this.showAddInvoiceModal = false;
    this.showAddExpenseModal = false;
    this.showPaymentAuthInvoiceId = null;
    this.authEngine = deps.authEngine || null;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
  }

  render(mountEl, sessionUser = null, subView = 'overview') {
    this.mountEl = mountEl;
    if (subView && subView !== 'ca' && subView !== 'accounts') {
      this.activeTab = subView;
    }

    this.container = document.createElement('div');
    this.container.className = 'ca-workspace animate-fade-in';
    this.container.style.cssText = 'display:flex; flex-direction:column; width:100%; height:100%; background:var(--bg-base); color:var(--text-primary); overflow:hidden; font-family:var(--font-family, sans-serif);';

    this.subscribePlatformEvents();
    this.updateContent(sessionUser);

    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      window.__APP__.platform.dataGateway.getCollection('offline_journal').then(() => {
        if (this.container && document.body.contains(this.container)) {
          this.updateContent();
        }
      }).catch(() => {});
    }

    if (mountEl) {
      mountEl.innerHTML = '';
      mountEl.appendChild(this.container);
    }
    return this.container;
  }

  subscribePlatformEvents() {
    if (this.unsubscribeEvents && this.unsubscribeEvents.length > 0) return;
    const refresh = () => {
      if (this.container && document.body.contains(this.container)) {
        this.updateContent();
      }
    };
    this.unsubscribeEvents = [
      this.platformEventBus.subscribe('payment:created', refresh),
      this.platformEventBus.subscribe('exception:resolved', refresh),
      this.platformEventBus.subscribe('reconciliation:exception:flagged', refresh),
      this.platformEventBus.subscribe('supplier_invoice:created', refresh),
      this.platformEventBus.subscribe('supplier_invoice:approved', refresh),
      this.platformEventBus.subscribe('supplier_payment:disbursed', refresh),
      this.platformEventBus.subscribe('tax_config:updated', refresh),
      this.platformEventBus.subscribe('data:changed', refresh)
    ];
  }

  updateContent(sessionUser = null) {
    if (!this.container) return;

    this.container.innerHTML = `
      <!-- TOP FINANCIAL DATA LAYER HEADER -->
      <div style="background:var(--bg-surface-1); border-bottom:1px solid var(--border-subtle); padding:16px 24px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="font-size:1.8rem; background:rgba(245,158,11,0.15); padding:8px 12px; border-radius:10px; border:1px solid rgba(245,158,11,0.3);">🏛️</div>
          <div>
            <div style="display:flex; align-items:center; gap:10px;">
              <h2 style="margin:0; font-size:1.35rem; font-weight:800; letter-spacing:-0.01em;">Accounts & Financial Data</h2>
              <span style="background:var(--bg-surface-2); padding:3px 10px; border-radius:6px; font-size:0.75rem; font-weight:800; border:1px solid var(--border-subtle); color:var(--accent-primary);">FY 2026–27</span>
            </div>
            <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Authoritative financial records of RestaurantOS operations, formatted for Tally Prime and accounting sync.</p>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <!-- Financial Period Status Pill -->
          ${this.renderPeriodStatusBadge()}

          <!-- Date Filter Controls -->
          ${this.renderDateFilterBar()}
        </div>
      </div>

      <!-- MAIN NAVIGATION BAR (6 CORE AREAS + TAX SETUP) -->
      <div style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); padding:0 24px; display:flex; justify-content:space-between; align-items:center; overflow-x:auto; scrollbar-width:none;">
        <div style="display:flex; gap:4px;">
          ${this.renderTabButton('overview', '📊 Overview')}
          ${this.renderTabButton('sales', '🧾 Sales')}
          ${this.renderTabButton('purchases', '📦 Purchases')}
          ${this.renderTabButton('expenses', '💡 Expenses')}
          ${this.renderTabButton('tax', '🧮 Tax / GST')}
          ${this.renderTabButton('reports', '📈 Reports')}
          ${this.renderTabButton('export', '📤 Export')}
        </div>
        <div>
          ${this.renderTabButton('tax_setup', '⚙ Tax Setup')}
        </div>
      </div>

      <!-- WORKSPACE VIEWPORT BODY -->
      <div style="flex:1; overflow-y:auto; padding:24px; display:flex; flex-direction:column; gap:24px;">
        ${this.renderActiveTabBody()}
      </div>

      <!-- DRILL-DOWN EVIDENCE CHAIN MODAL -->
      ${this.selectedTraceabilitySessionId ? this.renderTraceabilityModal() : ''}

      <!-- SALES INVOICE FINANCIAL DRAWER -->
      ${this.selectedSalesInvoiceNumber ? this.renderSalesInvoiceDrawer(this.selectedSalesInvoiceNumber) : ''}

      <!-- ADD SUPPLIER INVOICE INTAKE MODAL -->
      ${this.showAddInvoiceModal ? this.renderAddSupplierInvoiceModal() : ''}

      <!-- ADD EXPENSE MODAL -->
      ${this.showAddExpenseModal ? this.renderAddExpenseModal() : ''}

      <!-- SUPPLIER INVOICE DETAIL DRAWER (AP) -->
      ${this.selectedSupplierInvoiceId ? this.renderSupplierInvoiceDrawer(this.selectedSupplierInvoiceId) : ''}

      <!-- PAYMENT AUTHORIZATION MODAL -->
      ${this.showPaymentAuthInvoiceId ? this.renderPaymentAuthModal(this.showPaymentAuthInvoiceId) : ''}
    `;

    this.bindEvents();
  }

  renderPeriodStatusBadge() {
    const period = financialPeriodService.getPeriodStatusForDate(new Date());
    const isLocked = period.status === 'LOCKED';

    return `
      <div style="display:flex; align-items:center; gap:8px; background:var(--bg-surface-2); padding:6px 12px; border-radius:8px; border:1px solid var(--border-subtle); font-size:0.8rem;">
        <span style="color:var(--text-muted); font-weight:600;">PERIOD:</span>
        <span style="font-weight:800; color:var(--text-primary);">${period.name || 'Sep 2026'}</span>
        <span class="badge ${isLocked ? 'badge-danger' : 'badge-success'}" style="font-size:0.7rem; padding:2px 8px; font-weight:800;">
          ${isLocked ? '🔒 LOCKED' : '🟢 OPEN'}
        </span>
        ${!isLocked ? `
          <button id="btn-lock-period" class="btn-secondary" style="padding:2px 8px; font-size:0.75rem; font-weight:700; color:var(--status-warning); border-color:var(--status-warning);">
            🔒 Lock Period
          </button>
        ` : ''}
      </div>
    `;
  }

  renderDateFilterBar() {
    const filters = [
      { id: 'today', label: '📅 Today' },
      { id: 'yesterday', label: '⏪ Yesterday' },
      { id: 'week', label: '🗓️ 7 Days' },
      { id: 'month', label: '📊 30 Days' },
      { id: 'all', label: '🌐 All Time' }
    ];

    return `
      <div style="display:flex; align-items:center; gap:4px; background:var(--bg-surface-2); padding:4px; border-radius:8px; border:1px solid var(--border-subtle);">
        ${filters.map(f => `
          <button class="btn-ca-date-filter ${this.dateFilter === f.id ? 'active' : ''}" data-date-filter="${f.id}" style="padding:6px 12px; font-size:0.78rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.dateFilter === f.id ? 'var(--accent-primary)' : 'transparent'}; color:${this.dateFilter === f.id ? '#000' : 'var(--text-secondary)'}; border:none; transition:all 0.15s ease;">
            ${f.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  renderTabButton(id, label) {
    const isActive = this.activeTab === id;
    return `
      <button class="btn-ca-tab ${isActive ? 'active' : ''}" data-tab="${id}" style="padding:12px 18px; font-size:0.85rem; font-weight:800; border:none; background:transparent; border-bottom:3px solid ${isActive ? 'var(--accent-primary)' : 'transparent'}; color:${isActive ? 'var(--accent-primary)' : 'var(--text-secondary)'}; cursor:pointer; transition:all 0.15s ease; white-space:nowrap;">
        ${label}
      </button>
    `;
  }

  renderActiveTabBody() {
    switch (this.activeTab) {
      case 'overview': return this.renderOverviewTab();
      case 'sales': return this.renderSalesTab();
      case 'purchases': return this.renderPurchasesTab();
      case 'expenses': return this.renderExpensesTab();
      case 'tax': return this.renderTaxTab();
      case 'reports': return this.renderReportsTab();
      case 'export': return this.renderExportTab();
      case 'tax_setup': return this.renderTaxSetupTab();
      default: return this.renderOverviewTab();
    }
  }

  // =========================================================================
  // 1. FINANCIAL OVERVIEW
  // =========================================================================
  renderOverviewTab() {
    const overview = accountingProjectionService.getFinancialOverview({ dateFilter: this.dateFilter });
    const apOverview = accountingProjectionService.getApOverview({ tenantId: null });
    const unreconciledSales = accountingProjectionService.getUnreconciledSales({ dateFilter: this.dateFilter });

    const totalOutputGst = (overview.cgstTotal || 0) + (overview.sgstTotal || 0) + (overview.igstTotal || 0);

    return `
      <div style="display:flex; flex-direction:column; gap:24px;">
        <!-- FINANCIAL DATA SUMMARY (DRIVEN BY SELECTED DATE RANGE) -->
        <div>
          <div style="font-size:0.8rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px; letter-spacing:0.05em; display:flex; justify-content:space-between; align-items:center;">
            <span>FINANCIAL DATA SUMMARY</span>
            <span style="color:var(--accent-primary); font-size:0.75rem;">Selected Range: ${this.dateFilter.toUpperCase()}</span>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
            <!-- CARD 1: TOTAL SALES -->
            <div class="card" style="padding:20px; background:var(--bg-surface-2); border-left:4px solid var(--accent-primary);">
              <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">TOTAL SALES</div>
              <div style="font-size:1.8rem; font-weight:800; color:var(--accent-primary); margin-top:4px;">₹${overview.grossSales.toFixed(2)}</div>
              <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;">${overview.invoiceCount} Sales Tax Invoices</div>
            </div>

            <!-- CARD 2: COLLECTIONS -->
            <div class="card" style="padding:20px; background:var(--bg-surface-2); border-left:4px solid #3b82f6;">
              <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">COLLECTIONS</div>
              <div style="font-size:1.8rem; font-weight:800; color:#3b82f6; margin-top:4px;">₹${overview.totalCollected.toFixed(2)}</div>
              <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;">${overview.paymentCount} Receipts</div>
            </div>

            <!-- CARD 3: PURCHASES -->
            <div class="card" style="padding:20px; background:var(--bg-surface-2); border-left:4px solid #f59e0b;">
              <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">PURCHASES</div>
              <div style="font-size:1.8rem; font-weight:800; color:#f59e0b; margin-top:4px;">₹${apOverview.totalApInvoiced.toFixed(2)}</div>
              <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;">${apOverview.totalInvoicesCount} Supplier Invoices</div>
            </div>

            <!-- CARD 4: EXPENSES -->
            <div class="card" style="padding:20px; background:var(--bg-surface-2); border-left:4px solid #8b5cf6;">
              <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">EXPENSES</div>
              <div style="font-size:1.8rem; font-weight:800; color:#8b5cf6; margin-top:4px;">₹${(overview.totalExpenses || 0).toFixed(2)}</div>
              <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;">${overview.expenseCount || 0} Expenses Logged</div>
            </div>

            <!-- CARD 5: GST OUTPUT -->
            <div class="card" style="padding:20px; background:var(--bg-surface-2); border-left:4px solid #10b981;">
              <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">GST OUTPUT</div>
              <div style="font-size:1.8rem; font-weight:800; color:#10b981; margin-top:4px;">₹${totalOutputGst.toFixed(2)}</div>
              <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;">Output tax</div>
            </div>
          </div>
        </div>

        <!-- DATA COMPLETENESS & ATTENTION QUEUE -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
          <!-- FINANCIAL DATA COMPLETENESS PANEL -->
          <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
            <h4 style="margin:0 0 16px; font-size:1.05rem; font-weight:800; display:flex; align-items:center; gap:8px;">
              <span>✓</span> FINANCIAL DATA COMPLETENESS
            </h4>
            <div style="display:flex; flex-direction:column; gap:10px; font-size:0.85rem;">
              <div style="padding:10px 14px; background:var(--bg-surface-2); border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <strong style="display:block;">Sales Invoices</strong>
                  <span style="font-size:0.75rem; color:var(--text-muted);">${overview.invoiceCount} records</span>
                </div>
                <span style="color:#10b981; font-weight:800;">✓ Complete</span>
              </div>

              <div style="padding:10px 14px; background:var(--bg-surface-2); border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <strong style="display:block;">Payment Receipts</strong>
                  <span style="font-size:0.75rem; color:var(--text-muted);">${overview.paymentCount} records</span>
                </div>
                <span style="${unreconciledSales.length > 0 ? 'color:var(--status-danger); font-weight:800;' : 'color:#10b981; font-weight:800;'}">
                  ${unreconciledSales.length > 0 ? `⚠️ ${unreconciledSales.length} Unreconciled` : '✓ Complete'}
                </span>
              </div>

              <div style="padding:10px 14px; background:var(--bg-surface-2); border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <strong style="display:block;">Purchase Orders</strong>
                  <span style="font-size:0.75rem; color:var(--text-muted);">${apOverview.poCount || 0} records</span>
                </div>
                <span style="color:#10b981; font-weight:800;">✓ Complete</span>
              </div>

              <div style="padding:10px 14px; background:var(--bg-surface-2); border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <strong style="display:block;">Goods Receipts (GRN)</strong>
                  <span style="font-size:0.75rem; color:var(--text-muted);">${apOverview.grnCount || 0} records</span>
                </div>
                <span style="color:#10b981; font-weight:800;">✓ Complete</span>
              </div>

              <div style="padding:10px 14px; background:var(--bg-surface-2); border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <strong style="display:block;">Supplier Invoices</strong>
                  <span style="font-size:0.75rem; color:var(--text-muted);">${apOverview.totalInvoicesCount} records</span>
                </div>
                <span style="${(apOverview.pendingInvoicesCount > 0 || apOverview.exceptionInvoicesCount > 0) ? 'color:var(--status-warning); font-weight:800;' : 'color:#10b981; font-weight:800;'}">
                  ${(apOverview.pendingInvoicesCount > 0 || apOverview.exceptionInvoicesCount > 0) ? `⚠️ ${apOverview.pendingInvoicesCount + apOverview.exceptionInvoicesCount} Require Attention` : '✓ Complete'}
                </span>
              </div>

              <div style="padding:10px 14px; background:var(--bg-surface-2); border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <strong style="display:block;">GST Tax Breakdown</strong>
                  <span style="font-size:0.75rem; color:var(--text-muted);">${overview.invoiceCount} records</span>
                </div>
                <span style="color:#10b981; font-weight:800;">✓ Complete</span>
              </div>
            </div>
          </div>

          <!-- DATA REQUIRING ATTENTION PANEL -->
          <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
            <h4 style="margin:0 0 16px; font-size:1.05rem; font-weight:800; display:flex; align-items:center; gap:8px;">
              <span>🚨</span> DATA REQUIRING ATTENTION
            </h4>
            
            <div style="display:flex; flex-direction:column; gap:12px; font-size:0.85rem;">
              ${unreconciledSales.length > 0 ? `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:rgba(239,68,68,0.1); border-radius:8px; border-left:4px solid var(--status-danger);">
                  <div>
                    <strong style="color:var(--status-danger); font-size:0.92rem;">🔴 ${unreconciledSales.length} Unreconciled Customer Collections</strong>
                    <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:2px;">Unlinked payments, missing invoices, or amount mismatches</div>
                  </div>
                  <button class="btn-primary btn-jump-attention" data-nav-tab="sales" data-nav-subtab="unreconciled" style="font-size:0.75rem; padding:6px 12px; font-weight:800; background:var(--status-danger);">Review</button>
                </div>
              ` : ''}

              ${apOverview.exceptionInvoicesCount > 0 ? `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:rgba(239,68,68,0.1); border-radius:8px; border-left:4px solid var(--status-danger);">
                  <div>
                    <strong style="color:var(--status-danger); font-size:0.92rem;">🔴 ${apOverview.exceptionInvoicesCount} AP Match Exceptions</strong>
                    <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:2px;">Supplier invoice PO / GRN / price discrepancy</div>
                  </div>
                  <button class="btn-primary btn-jump-attention" data-nav-tab="purchases" data-nav-subtab="exceptions" style="font-size:0.75rem; padding:6px 12px; font-weight:800; background:var(--status-danger);">Resolve</button>
                </div>
              ` : ''}

              ${apOverview.pendingInvoicesCount > 0 ? `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:rgba(245,158,11,0.1); border-radius:8px; border-left:4px solid var(--status-warning);">
                  <div>
                    <strong style="color:var(--status-warning); font-size:0.92rem;">🟠 ${apOverview.pendingInvoicesCount} Supplier Invoices Pending Match</strong>
                    <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:2px;">Supplier invoices awaiting 3-way verification</div>
                  </div>
                  <button class="btn-primary btn-jump-attention" data-nav-tab="purchases" data-nav-subtab="matching" style="font-size:0.75rem; padding:6px 12px; font-weight:800; background:var(--status-warning); color:#000;">Review</button>
                </div>
              ` : ''}

              ${unreconciledSales.length === 0 && apOverview.exceptionInvoicesCount === 0 && apOverview.pendingInvoicesCount === 0 ? `
                <div style="padding:24px; text-align:center; background:var(--bg-surface-2); border-radius:8px; border:1px solid var(--border-subtle);">
                  <div style="font-size:1.8rem; margin-bottom:6px;">🟢</div>
                  <strong style="color:#10b981; font-size:0.95rem;">Financial Data Ready</strong>
                  <p style="margin:4px 0 0; color:var(--text-muted); font-size:0.8rem;">No outstanding data-quality or reconciliation issues detected.</p>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 2. SALES MODULE
  // =========================================================================
  renderSalesTab() {
    const salesInvoices = accountingProjectionService.getSalesRegister({ dateFilter: this.dateFilter });
    const paymentLedger = accountingProjectionService.getPaymentLedger({ dateFilter: this.dateFilter });
    const unreconciledSales = accountingProjectionService.getUnreconciledSales({ dateFilter: this.dateFilter });

    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background:var(--bg-surface-1); padding:16px; border-radius:10px; border:1px solid var(--border-subtle);">
          <div style="display:flex; gap:6px; overflow-x:auto;">
            ${[
              { id: 'register', label: `📋 Sales Register (${salesInvoices.length})` },
              { id: 'collections', label: `💳 Collections Ledger (${paymentLedger.length})` },
              { id: 'unreconciled', label: `⚠️ Unreconciled Sales (${unreconciledSales.length})` }
            ].map(sub => `
              <button class="btn-sales-subtab ${this.salesSubTab === sub.id ? 'active' : ''}" data-subtab="${sub.id}" style="padding:8px 14px; font-size:0.82rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.salesSubTab === sub.id ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.salesSubTab === sub.id ? '#000' : 'var(--text-secondary)'}; border:1px solid var(--border-subtle); transition:all 0.15s ease;">
                ${sub.label}
              </button>
            `).join('')}
          </div>

          <div style="font-size:0.82rem; font-weight:700; color:var(--text-muted);">
            Customer Sales Financial Records
          </div>
        </div>

        ${this.salesSubTab === 'collections' ? this.renderPaymentLedgerTable(paymentLedger) : (this.salesSubTab === 'unreconciled' ? this.renderUnreconciledSalesTable(unreconciledSales) : this.renderSalesRegisterTable(salesInvoices))}
      </div>
    `;
  }

  renderSalesRegisterTable(salesInvoices) {
    if (!salesInvoices || salesInvoices.length === 0) {
      return `
        <div class="card" style="padding:40px; text-align:center; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
          <div style="font-size:2.5rem; margin-bottom:12px;">🧾</div>
          <h4 style="margin:0 0 8px; font-size:1.1rem; font-weight:800;">No Sales Invoices Recorded</h4>
          <p style="margin:0; color:var(--text-muted); font-size:0.85rem;">Customer billing invoices generated in POS will appear here.</p>
        </div>
      `;
    }

    return `
      <div class="card" style="padding:0; background:var(--bg-surface-1); border:1px solid var(--border-subtle); overflow:hidden;">
        <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.85rem;">
          <thead>
            <tr style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">
              <th style="padding:12px 16px;">Invoice No</th>
              <th style="padding:12px 16px;">Date</th>
              <th style="padding:12px 16px;">Gross Sales</th>
              <th style="padding:12px 16px;">Discount</th>
              <th style="padding:12px 16px;">Taxable Base</th>
              <th style="padding:12px 16px;">CGST</th>
              <th style="padding:12px 16px;">SGST</th>
              <th style="padding:12px 16px;">Grand Total</th>
              <th style="padding:12px 16px;">Payment</th>
              <th style="padding:12px 16px; text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${salesInvoices.map(inv => {
              const grossSales = parseFloat(inv.grossSales || inv.subtotal || inv.grandTotal || 0) || 0;
              const discountsTotal = parseFloat(inv.discountsTotal || inv.discounts || inv.discountTotal || 0) || 0;
              const taxableAmount = parseFloat(inv.taxableAmount !== undefined ? inv.taxableAmount : (grossSales - discountsTotal)) || 0;
              const cgstAmount = parseFloat(inv.cgstAmount || inv.cgstTotal || 0) || 0;
              const sgstAmount = parseFloat(inv.sgstAmount || inv.sgstTotal || 0) || 0;
              const grandTotal = parseFloat(inv.grandTotal || (taxableAmount + cgstAmount + sgstAmount)) || 0;
              const dateStr = (inv.issuedAt || inv.issuanceTimestamp || inv.createdAt) ? new Date(inv.issuedAt || inv.issuanceTimestamp || inv.createdAt).toLocaleDateString() : 'N/A';

              return `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:12px 16px; font-weight:800; color:var(--accent-primary);">${inv.invoiceNumber}</td>
                  <td style="padding:12px 16px;">${dateStr}</td>
                  <td style="padding:12px 16px;">₹${grossSales.toFixed(2)}</td>
                  <td style="padding:12px 16px; color:var(--status-warning);">-₹${discountsTotal.toFixed(2)}</td>
                  <td style="padding:12px 16px; font-weight:700;">₹${taxableAmount.toFixed(2)}</td>
                  <td style="padding:12px 16px;">₹${cgstAmount.toFixed(2)}</td>
                  <td style="padding:12px 16px;">₹${sgstAmount.toFixed(2)}</td>
                  <td style="padding:12px 16px; font-weight:800; color:var(--text-primary);">₹${grandTotal.toFixed(2)}</td>
                  <td style="padding:12px 16px;"><span style="background:var(--bg-surface-2); padding:2px 8px; border-radius:4px; font-weight:700;">${inv.paymentMethod || 'UPI'}</span></td>
                  <td style="padding:12px 16px; text-align:right;">
                    <button class="btn-secondary btn-view-sales-drawer" data-inv-no="${inv.invoiceNumber}" style="padding:4px 10px; font-size:0.75rem; font-weight:700;">
                      👁️ Drawer
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderPaymentLedgerTable(payments) {
    if (!payments || payments.length === 0) {
      return `
        <div class="card" style="padding:40px; text-align:center; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
          <div style="font-size:2.5rem; margin-bottom:12px;">💳</div>
          <h4 style="margin:0 0 8px; font-size:1.1rem; font-weight:800;">No Collections Recorded</h4>
          <p style="margin:0; color:var(--text-muted); font-size:0.85rem;">Customer cashier payments will appear here.</p>
        </div>
      `;
    }

    return `
      <div class="card" style="padding:0; background:var(--bg-surface-1); border:1px solid var(--border-subtle); overflow:hidden;">
        <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.85rem;">
          <thead>
            <tr style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">
              <th style="padding:12px 16px;">Receipt ID</th>
              <th style="padding:12px 16px;">Receipt Date</th>
              <th style="padding:12px 16px;">Invoice No</th>
              <th style="padding:12px 16px;">Amount</th>
              <th style="padding:12px 16px;">Method</th>
              <th style="padding:12px 16px;">Reference No</th>
              <th style="padding:12px 16px;">Status</th>
              <th style="padding:12px 16px; text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${payments.map(p => {
              const amt = parseFloat(p.amount) || 0;
              const dateStr = (p.receivedAt || p.settledTimestamp || p.createdAt) ? new Date(p.receivedAt || p.settledTimestamp || p.createdAt).toLocaleString() : 'N/A';
              const statusLabel = p.status || (amt === 0 ? 'ZERO_VALUED' : 'SETTLED');
              const statusColor = statusLabel === 'SETTLED' ? '#10b981' : (statusLabel === 'UNALLOCATED' ? 'var(--status-warning)' : 'var(--status-danger)');

              return `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:12px 16px; font-weight:800; color:#3b82f6;">${p.paymentId || p.id}</td>
                  <td style="padding:12px 16px;">${dateStr}</td>
                  <td style="padding:12px 16px; font-weight:700;">${p.invoiceNumber || 'N/A'}</td>
                  <td style="padding:12px 16px; font-weight:800; color:${amt > 0 ? '#10b981' : 'var(--status-danger)'};">₹${amt.toFixed(2)}</td>
                  <td style="padding:12px 16px;"><span style="background:var(--bg-surface-2); padding:2px 8px; border-radius:4px; font-weight:700;">${p.paymentMethod || 'CASH'}</span></td>
                  <td style="padding:12px 16px;">${p.referenceNo || 'N/A'}</td>
                  <td style="padding:12px 16px;"><span style="background:var(--bg-surface-2); color:${statusColor}; padding:2px 8px; border-radius:4px; font-weight:800; font-size:0.75rem;">${statusLabel}</span></td>
                  <td style="padding:12px 16px; text-align:right;">
                    <button class="btn-secondary btn-inspect-traceability" data-session-id="${p.sessionId}" style="padding:4px 10px; font-size:0.75rem; font-weight:700;">
                      🔍 Evidence
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderUnreconciledSalesTable(unreconciled) {
    if (!unreconciled || unreconciled.length === 0) {
      return `
        <div class="card" style="padding:40px; text-align:center; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
          <div style="font-size:2.5rem; margin-bottom:12px;">🟢</div>
          <h4 style="margin:0 0 8px; font-size:1.1rem; font-weight:800; color:#10b981;">All Sales & Collections Fully Reconciled</h4>
          <p style="margin:0; color:var(--text-muted); font-size:0.85rem;">No payment mismatches, unlinked receipts, or unpaid invoice exceptions detected.</p>
        </div>
      `;
    }

    return `
      <div class="card" style="padding:0; background:var(--bg-surface-1); border:1px solid var(--border-subtle); overflow:hidden;">
        <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.85rem;">
          <thead>
            <tr style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">
              <th style="padding:12px 16px;">Exception Type</th>
              <th style="padding:12px 16px;">Reference</th>
              <th style="padding:12px 16px;">Invoiced</th>
              <th style="padding:12px 16px;">Collected</th>
              <th style="padding:12px 16px;">Discrepancy</th>
              <th style="padding:12px 16px;">Audit Description</th>
              <th style="padding:12px 16px; text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${unreconciled.map(u => `
              <tr style="border-bottom:1px solid var(--border-subtle);">
                <td style="padding:12px 16px; font-weight:800; color:${u.severity === 'CRITICAL' ? 'var(--status-danger)' : 'var(--status-warning)'};">
                  ${u.severity === 'CRITICAL' ? '🔴' : '🟠'} ${u.title}
                </td>
                <td style="padding:12px 16px; font-weight:700;">${u.invoiceNumber || u.receiptId || u.sessionId}</td>
                <td style="padding:12px 16px;">₹${(u.invoicedAmount || 0).toFixed(2)}</td>
                <td style="padding:12px 16px;">₹${(u.collectedAmount || 0).toFixed(2)}</td>
                <td style="padding:12px 16px; font-weight:800; color:var(--status-danger);">₹${Math.abs(u.difference || 0).toFixed(2)}</td>
                <td style="padding:12px 16px; font-size:0.8rem; color:var(--text-secondary);">${u.description}</td>
                <td style="padding:12px 16px; text-align:right;">
                  <button class="btn-secondary btn-inspect-traceability" data-session-id="${u.sessionId || u.invoiceNumber}" style="padding:4px 10px; font-size:0.75rem; font-weight:700;">
                    🔍 Evidence
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderSalesInvoiceDrawer(invoiceNumber) {
    const salesInvoices = accountingProjectionService.getSalesRegister({ dateFilter: 'all' });
    const inv = salesInvoices.find(i => i.invoiceNumber === invoiceNumber);
    if (!inv) return '';

    const grossSales = parseFloat(inv.grossSales || inv.subtotal || inv.grandTotal || 0) || 0;
    const discountsTotal = parseFloat(inv.discountsTotal || inv.discounts || inv.discountTotal || 0) || 0;
    const taxableAmount = parseFloat(inv.taxableAmount !== undefined ? inv.taxableAmount : (grossSales - discountsTotal)) || 0;
    const cgstAmount = parseFloat(inv.cgstAmount || inv.cgstTotal || 0) || 0;
    const sgstAmount = parseFloat(inv.sgstAmount || inv.sgstTotal || 0) || 0;
    const grandTotal = parseFloat(inv.grandTotal || (taxableAmount + cgstAmount + sgstAmount)) || 0;
    const issuedDateStr = (inv.issuedAt || inv.issuanceTimestamp || inv.createdAt) ? new Date(inv.issuedAt || inv.issuanceTimestamp || inv.createdAt).toLocaleString() : 'N/A';

    return `
      <div style="position:fixed; top:0; right:0; width:500px; height:100vh; background:var(--bg-surface-1); border-left:1px solid var(--border-subtle); box-shadow:-10px 0 30px rgba(0,0,0,0.5); z-index:9999; display:flex; flex-direction:column; animation:slideLeft 0.2s ease;">
        <div style="padding:20px; border-bottom:1px solid var(--border-subtle); background:var(--bg-surface-2); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">CUSTOMER SALES TAX INVOICE</div>
            <h3 style="margin:2px 0 0; font-size:1.2rem; font-weight:800; color:var(--accent-primary);">${inv.invoiceNumber}</h3>
          </div>
          <button id="btn-close-sales-drawer" class="btn-icon" style="background:transparent; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">✕</button>
        </div>

        <div style="flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:20px;">
          <div class="card" style="padding:16px; background:var(--bg-surface-2); border:1px solid var(--border-subtle);">
            <div style="font-size:0.8rem; color:var(--text-secondary); display:flex; flex-direction:column; gap:6px;">
              <div><strong>Bill Reference:</strong> <span style="background:var(--bg-surface-1); padding:2px 8px; border-radius:4px; font-weight:800;">${inv.billNumber || 'BILL-1001'}</span></div>
              <div><strong>Session ID:</strong> ${inv.sessionId}</div>
              <div><strong>Issued Timestamp:</strong> ${issuedDateStr}</div>
            </div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-2); border:1px solid var(--border-subtle);">
            <h4 style="margin:0 0 12px; font-size:0.95rem; font-weight:800;">💰 Tax & Revenue Computation</h4>
            <div style="display:flex; flex-direction:column; gap:8px; font-size:0.85rem;">
              <div style="display:flex; justify-content:space-between;"><span>Gross Invoiced Sales:</span> <strong>₹${grossSales.toFixed(2)}</strong></div>
              <div style="display:flex; justify-content:space-between; color:var(--status-warning);"><span>Discounts Allowed:</span> <strong>-₹${discountsTotal.toFixed(2)}</strong></div>
              <div style="display:flex; justify-content:space-between; font-weight:700; padding-top:4px; border-top:1px dashed var(--border-subtle);"><span>Net Taxable Revenue:</span> <strong>₹${taxableAmount.toFixed(2)}</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Output CGST (2.5%):</span> <strong>₹${cgstAmount.toFixed(2)}</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Output SGST (2.5%):</span> <strong>₹${sgstAmount.toFixed(2)}</strong></div>
              <div style="display:flex; justify-content:space-between; margin-top:6px; padding-top:6px; border-top:1px solid var(--border-subtle); font-size:1.05rem; font-weight:800; color:var(--accent-primary);">
                <span>Grand Total:</span> <span>₹${grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div class="card" style="padding:16px; background:rgba(59,130,246,0.1); border:1px solid #3b82f6;">
            <h4 style="margin:0 0 8px; font-size:0.95rem; font-weight:800; color:#3b82f6;">🔗 Audit Traceability Proof</h4>
            <p style="margin:0 0 12px; font-size:0.8rem; color:var(--text-secondary);">Verified 3-tier evidence chain linking Order $\rightarrow$ Bill $\rightarrow$ Tax Invoice $\rightarrow$ Payment Receipt.</p>
            <button class="btn-primary btn-inspect-traceability" data-session-id="${inv.sessionId}" style="width:100%; padding:8px; font-size:0.82rem; font-weight:800;">
              🔍 Inspect Full Evidence Chain
            </button>
          </div>
        </div>

        <div style="padding:20px; border-top:1px solid var(--border-subtle); background:var(--bg-surface-2); display:flex; justify-content:flex-end; gap:12px;">
          <button class="btn-primary btn-print-tax-invoice" data-inv-no="${inv.invoiceNumber}" style="width:100%; padding:12px; font-size:0.9rem; font-weight:800;">
            🖨️ Print Formal GST Tax Invoice
          </button>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // DRILL-DOWN FINANCIAL EVIDENCE CHAIN MODAL
  // =========================================================================
  renderTraceabilityModal() {
    const trace = accountingProjectionService.getInvoiceTraceability(this.selectedTraceabilitySessionId);
    const inv = trace.invoice || {};
    const orders = trace.orders || [];
    const revisions = trace.revisions || [];
    const payments = trace.payments || [];
    const logs = trace.auditLogs || [];

    const grossSales = parseFloat(inv.grossSales || inv.subtotal || inv.grandTotal || 0) || 0;
    const discountsTotal = parseFloat(inv.discountsTotal || inv.discounts || inv.discountTotal || 0) || 0;
    const taxableAmount = parseFloat(inv.taxableAmount !== undefined ? inv.taxableAmount : (grossSales - discountsTotal)) || 0;
    const cgstAmount = parseFloat(inv.cgstAmount || inv.cgstTotal || 0) || 0;
    const sgstAmount = parseFloat(inv.sgstAmount || inv.sgstTotal || 0) || 0;
    const grandTotal = parseFloat(inv.grandTotal || (taxableAmount + cgstAmount + sgstAmount)) || 0;

    return `
      <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px;">
        <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:12px; width:720px; max-width:95vw; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 50px rgba(0,0,0,0.6); animation:fadeIn 0.2s ease;">
          <!-- MODAL HEADER -->
          <div style="padding:20px; border-bottom:1px solid var(--border-subtle); background:var(--bg-surface-2); display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h3 style="margin:0; font-size:1.15rem; font-weight:800; color:var(--accent-primary); display:flex; align-items:center; gap:8px;">
                <span>🔗</span> Audit Traceability Proof
              </h3>
              <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.8rem;">3-Tier Financial Evidence Chain for Session: <strong>${this.selectedTraceabilitySessionId}</strong></p>
            </div>
            <button id="btn-close-traceability-modal" class="btn-icon" style="background:transparent; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">✕</button>
          </div>

          <!-- MODAL BODY -->
          <div style="flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:20px; font-size:0.85rem;">
            
            <!-- TIER 1: ORDER ITEMS EVIDENCE -->
            <div class="card" style="padding:16px; background:var(--bg-surface-2); border:1px solid var(--border-subtle);">
              <h4 style="margin:0 0 10px; font-size:0.95rem; font-weight:800; color:#3b82f6; display:flex; align-items:center; gap:6px;">
                <span>🛒</span> Tier 1: Order Items Evidence (${orders.length} Kitchen Orders)
              </h4>
              ${orders.length > 0 ? `
                <div style="display:flex; flex-direction:column; gap:6px;">
                  ${orders.map((o, idx) => `
                    <div style="padding:8px; background:var(--bg-surface-1); border-radius:6px; font-size:0.8rem; display:flex; justify-content:space-between;">
                      <span>Order #${idx + 1} (${(o.items || []).length} items)</span>
                      <strong>₹${parseFloat(o.totalAmount || o.total || 0).toFixed(2)}</strong>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div style="color:var(--text-muted); font-size:0.8rem;">Kitchen order items verified directly from waiter POS session terminal.</div>
              `}
            </div>

            <!-- TIER 2: BILL REVISION & DISCOUNTS -->
            <div class="card" style="padding:16px; background:var(--bg-surface-2); border:1px solid var(--border-subtle);">
              <h4 style="margin:0 0 10px; font-size:0.95rem; font-weight:800; color:#f59e0b; display:flex; align-items:center; gap:6px;">
                <span>📋</span> Tier 2: Bill Revision & Commercial Discount History
              </h4>
              ${revisions.length > 0 ? `
                <div style="display:flex; flex-direction:column; gap:6px;">
                  ${revisions.map(r => `
                    <div style="padding:8px; background:var(--bg-surface-1); border-radius:6px; font-size:0.8rem; display:flex; justify-content:space-between;">
                      <span>Bill #${r.billNumber || 'BILL-1001'} (Authorized by: ${r.waiterName || 'Staff'})</span>
                      <strong style="color:var(--status-warning);">-₹${parseFloat(r.discountsTotal || 0).toFixed(2)}</strong>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div style="color:var(--text-muted); font-size:0.8rem;">No commercial discounts applied. Full value passed to revenue recognition.</div>
              `}
            </div>

            <!-- TIER 3: TAX INVOICE EVIDENCE -->
            <div class="card" style="padding:16px; background:var(--bg-surface-2); border:1px solid var(--border-subtle);">
              <h4 style="margin:0 0 10px; font-size:0.95rem; font-weight:800; color:var(--accent-primary); display:flex; align-items:center; gap:6px;">
                <span>🧾</span> Tier 3: Issued Tax Invoice Evidence
              </h4>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.8rem;">
                <div>Invoice Number: <strong>${inv.invoiceNumber || 'INV-PENDING'}</strong></div>
                <div>Financial Year: <strong>${inv.financialYear || '2026-27'}</strong></div>
                <div>Taxable Base: <strong>₹${taxableAmount.toFixed(2)}</strong></div>
                <div>Output GST: <strong>₹${(cgstAmount + sgstAmount).toFixed(2)}</strong></div>
                <div>Grand Total: <strong style="color:var(--accent-primary);">₹${grandTotal.toFixed(2)}</strong></div>
                <div>Status: <span style="color:#10b981; font-weight:800;">✓ ISSUED</span></div>
              </div>
            </div>

            <!-- TIER 4: PAYMENT RECEIPTS EVIDENCE -->
            <div class="card" style="padding:16px; background:var(--bg-surface-2); border:1px solid var(--border-subtle);">
              <h4 style="margin:0 0 10px; font-size:0.95rem; font-weight:800; color:#10b981; display:flex; align-items:center; gap:6px;">
                <span>💳</span> Tier 4: Customer Settlement Receipts (${payments.length} Payments)
              </h4>
              ${payments.length > 0 ? `
                <div style="display:flex; flex-direction:column; gap:6px;">
                  ${payments.map(p => `
                    <div style="padding:8px; background:var(--bg-surface-1); border-radius:6px; font-size:0.8rem; display:flex; justify-content:space-between; align-items:center;">
                      <div>
                        <strong>${p.paymentId || p.id}</strong> (${p.paymentMethod || 'CASH'})
                        <span style="color:var(--text-muted); font-size:0.75rem; margin-left:8px;">Ref: ${p.referenceNo || 'N/A'}</span>
                      </div>
                      <strong style="color:#10b981;">₹${parseFloat(p.amount || 0).toFixed(2)}</strong>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div style="color:var(--text-muted); font-size:0.8rem;">Payment settlement pending cashier reconciliation.</div>
              `}
            </div>

            <!-- TIER 5: SESSION AUDIT LOG TRAIL -->
            <div class="card" style="padding:16px; background:var(--bg-surface-2); border:1px solid var(--border-subtle);">
              <h4 style="margin:0 0 10px; font-size:0.95rem; font-weight:800; color:#8b5cf6; display:flex; align-items:center; gap:6px;">
                <span>📜</span> Tier 5: Session Audit Event Trail (${logs.length} Events)
              </h4>
              ${logs.length > 0 ? `
                <div style="display:flex; flex-direction:column; gap:4px; max-height:140px; overflow-y:auto;">
                  ${logs.map(l => `
                    <div style="font-size:0.75rem; border-bottom:1px solid var(--border-subtle); padding:4px 0; display:flex; justify-content:space-between;">
                      <span>[${new Date(l.timestamp || l.createdAt).toLocaleTimeString()}] <strong>${l.eventType || 'EVENT'}</strong>: ${l.description || 'System Audit Event'}</span>
                      <span style="color:var(--text-muted);">${l.actorRole || 'SYSTEM'}</span>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div style="color:var(--text-muted); font-size:0.8rem;">Audit events recorded in immutable local event log.</div>
              `}
            </div>

          </div>

          <!-- MODAL FOOTER -->
          <div style="padding:16px 20px; border-top:1px solid var(--border-subtle); background:var(--bg-surface-2); display:flex; justify-content:flex-end;">
            <button id="btn-close-traceability-modal-footer" class="btn-primary" style="padding:8px 18px; font-size:0.85rem; font-weight:800;">
              Close Evidence Chain
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 3. PURCHASES MODULE
  // =========================================================================
  renderPurchasesTab() {
    const apOverview = accountingProjectionService.getApOverview({ tenantId: null });
    const invoices = supplierInvoiceModel.getAllSupplierInvoices();
    const payments = supplierPaymentModel.getAllSupplierPayments();

    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background:var(--bg-surface-1); padding:16px; border-radius:10px; border:1px solid var(--border-subtle);">
          <div style="display:flex; gap:6px; overflow-x:auto;">
            ${[
              { id: 'invoices', label: '📥 Supplier Invoices' },
              { id: 'matching', label: '🔍 3-Way Matching' },
              { id: 'exceptions', label: `⚠️ Exceptions (${apOverview.exceptionInvoicesCount})` },
              { id: 'queue', label: `⏳ Payment Queue (${apOverview.approvedPayablesCount})` },
              { id: 'disbursements', label: '💳 Supplier Payments' }
            ].map(sub => `
              <button class="btn-purchases-subtab ${this.purchasesSubTab === sub.id ? 'active' : ''}" data-subtab="${sub.id}" style="padding:8px 14px; font-size:0.82rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.purchasesSubTab === sub.id ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.purchasesSubTab === sub.id ? '#000' : 'var(--text-secondary)'}; border:1px solid var(--border-subtle); transition:all 0.15s ease;">
                ${sub.label}
              </button>
            `).join('')}
          </div>

          <button id="btn-open-add-supplier-invoice" class="btn-primary" style="padding:8px 16px; font-size:0.85rem; font-weight:800; border-radius:8px; display:flex; align-items:center; gap:6px;">
            <span>➕</span> Intake Supplier Invoice
          </button>
        </div>

        ${this.renderPurchasesSubTabBody(invoices, payments)}
      </div>
    `;
  }

  renderPurchasesSubTabBody(invoices, payments) {
    if (this.purchasesSubTab === 'disbursements') {
      return this.renderSupplierPaymentsTable(payments);
    }
    if (this.purchasesSubTab === 'queue') {
      const queue = invoices.filter(i => i.status === 'APPROVED' || i.status === 'PAYMENT_DUE' || i.status === 'PARTIALLY_PAID');
      return this.renderPaymentQueueTable(queue);
    }
    if (this.purchasesSubTab === 'exceptions') {
      const exceptions = invoices.filter(i => i.matchStatus === 'EXCEPTION' || (i.matchVariances && i.matchVariances.length > 0));
      return this.renderSupplierInvoicesTable(exceptions);
    }
    if (this.purchasesSubTab === 'matching') {
      return this.renderSupplierInvoicesTable(invoices);
    }
    return this.renderSupplierInvoicesTable(invoices);
  }

  renderSupplierInvoicesTable(invoices) {
    if (!invoices || invoices.length === 0) {
      return `
        <div class="card" style="padding:40px; text-align:center; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
          <div style="font-size:2.5rem; margin-bottom:12px;">📥</div>
          <h4 style="margin:0 0 8px; font-size:1.1rem; font-weight:800;">No Supplier Invoices Recorded</h4>
          <p style="margin:0; color:var(--text-muted); font-size:0.85rem;">Click "Intake Supplier Invoice" to enter vendor tax invoice details.</p>
        </div>
      `;
    }

    return `
      <div class="card" style="padding:0; background:var(--bg-surface-1); border:1px solid var(--border-subtle); overflow:hidden;">
        <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.85rem;">
          <thead>
            <tr style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">
              <th style="padding:12px 16px;">Invoice No</th>
              <th style="padding:12px 16px;">Supplier</th>
              <th style="padding:12px 16px;">PO Reference</th>
              <th style="padding:12px 16px;">Invoice Date</th>
              <th style="padding:12px 16px;">Grand Total</th>
              <th style="padding:12px 16px;">3-Way Match</th>
              <th style="padding:12px 16px;">AP Lifecycle</th>
              <th style="padding:12px 16px; text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${invoices.map(inv => {
              const totalVal = parseFloat(inv.grandTotal !== undefined ? inv.grandTotal : (inv.totalAmount || inv.subtotal || 0)) || 0;
              return `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:12px 16px; font-weight:800; color:var(--accent-primary);">${inv.supplierInvoiceNumber || 'INV-DRAFT'}</td>
                  <td style="padding:12px 16px; font-weight:700;">${inv.supplierName || 'Unknown Vendor'}</td>
                  <td style="padding:12px 16px; font-weight:700;">${inv.poNumber ? `<span style="background:var(--bg-surface-2); padding:2px 8px; border-radius:4px;">${inv.poNumber}</span>` : '<span style="color:var(--text-muted);">None</span>'}</td>
                  <td style="padding:12px 16px;">${inv.invoiceDate || 'N/A'}</td>
                  <td style="padding:12px 16px; font-weight:800; color:var(--text-primary);">₹${totalVal.toFixed(2)}</td>
                  <td style="padding:12px 16px;">${this.getMatchStatusBadge(inv.matchStatus)}</td>
                  <td style="padding:12px 16px;">${this.getApStatusBadge(inv.status)}</td>
                  <td style="padding:12px 16px; text-align:right; display:flex; gap:6px; justify-content:flex-end;">
                    <button class="btn-secondary btn-view-supplier-invoice" data-inv-id="${inv.id}" style="padding:4px 10px; font-size:0.75rem; font-weight:700;">👁️ Drawer</button>
                    <button class="btn-secondary btn-trigger-match" data-inv-id="${inv.id}" style="padding:4px 8px; font-size:0.75rem; font-weight:700; color:var(--accent-primary);">🔍 Match</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderPaymentQueueTable(queueInvoices) {
    if (!queueInvoices || queueInvoices.length === 0) {
      return `
        <div class="card" style="padding:40px; text-align:center; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
          <div style="font-size:2.5rem; margin-bottom:12px;">⏳</div>
          <h4 style="margin:0 0 8px; font-size:1.1rem; font-weight:800;">Payment Queue Clear</h4>
          <p style="margin:0; color:var(--text-muted); font-size:0.85rem;">No approved AP liabilities awaiting disbursement.</p>
        </div>
      `;
    }

    return `
      <div class="card" style="padding:0; background:var(--bg-surface-1); border:1px solid var(--border-subtle); overflow:hidden;">
        <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.85rem;">
          <thead>
            <tr style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">
              <th style="padding:12px 16px;">Invoice No</th>
              <th style="padding:12px 16px;">Supplier</th>
              <th style="padding:12px 16px;">Due Date</th>
              <th style="padding:12px 16px;">Grand Total</th>
              <th style="padding:12px 16px;">Outstanding</th>
              <th style="padding:12px 16px;">Status</th>
              <th style="padding:12px 16px; text-align:right;">Disbursement</th>
            </tr>
          </thead>
          <tbody>
            ${queueInvoices.map(inv => {
              const totalVal = parseFloat(inv.grandTotal !== undefined ? inv.grandTotal : (inv.totalAmount || inv.subtotal || 0)) || 0;
              const outVal = parseFloat(inv.outstandingAmount !== undefined ? inv.outstandingAmount : totalVal) || 0;
              return `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:12px 16px; font-weight:800; color:var(--accent-primary);">${inv.supplierInvoiceNumber || 'INV-DRAFT'}</td>
                  <td style="padding:12px 16px; font-weight:700;">${inv.supplierName || 'Vendor'}</td>
                  <td style="padding:12px 16px; font-weight:700; color:var(--status-warning);">${inv.dueDate || 'Immediate'}</td>
                  <td style="padding:12px 16px; font-weight:800;">₹${totalVal.toFixed(2)}</td>
                  <td style="padding:12px 16px; font-weight:800; color:var(--status-danger);">₹${outVal.toFixed(2)}</td>
                  <td style="padding:12px 16px;">${this.getApStatusBadge(inv.status)}</td>
                  <td style="padding:12px 16px; text-align:right;">
                    <button class="btn-primary btn-open-pay-auth" data-inv-id="${inv.id}" style="padding:6px 14px; font-size:0.78rem; font-weight:800;">💳 Authorize Payment</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderSupplierPaymentsTable(payments) {
    if (!payments || payments.length === 0) {
      return `
        <div class="card" style="padding:40px; text-align:center; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
          <div style="font-size:2.5rem; margin-bottom:12px;">💳</div>
          <h4 style="margin:0 0 8px; font-size:1.1rem; font-weight:800;">No Supplier Payments Recorded</h4>
          <p style="margin:0; color:var(--text-muted); font-size:0.85rem;">Vendor payment disbursement history will appear here.</p>
        </div>
      `;
    }

    return `
      <div class="card" style="padding:0; background:var(--bg-surface-1); border:1px solid var(--border-subtle); overflow:hidden;">
        <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.85rem;">
          <thead>
            <tr style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">
              <th style="padding:12px 16px;">Disbursement No</th>
              <th style="padding:12px 16px;">Invoice No</th>
              <th style="padding:12px 16px;">Supplier</th>
              <th style="padding:12px 16px;">Disbursed Amount</th>
              <th style="padding:12px 16px;">Method</th>
              <th style="padding:12px 16px;">Bank Ref / UTR</th>
              <th style="padding:12px 16px;">Date</th>
            </tr>
          </thead>
          <tbody>
            ${payments.map(p => {
              const amtVal = parseFloat(p.amount || p.disbursedAmount || 0) || 0;
              const payDateStr = p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : 'N/A';
              return `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:12px 16px; font-weight:800; color:#3b82f6;">${p.paymentNumber || p.id}</td>
                  <td style="padding:12px 16px; font-weight:700;">${p.supplierInvoiceNumber || 'N/A'}</td>
                  <td style="padding:12px 16px; font-weight:700;">${p.supplierName || 'Vendor'}</td>
                  <td style="padding:12px 16px; font-weight:800; color:#10b981;">₹${amtVal.toFixed(2)}</td>
                  <td style="padding:12px 16px; font-weight:700;"><span style="background:var(--bg-surface-2); padding:2px 8px; border-radius:4px;">${p.paymentMethod || 'BANK_TRANSFER'}</span></td>
                  <td style="padding:12px 16px;">${p.referenceUtr || '—'}</td>
                  <td style="padding:12px 16px;">${payDateStr}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // =========================================================================
  // 4. EXPENSES MODULE
  // =========================================================================
  renderExpensesTab() {
    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1); padding:16px; border-radius:10px; border:1px solid var(--border-subtle);">
          <div>
            <h4 style="margin:0; font-size:1.05rem; font-weight:800;">💡 Operational Expense Register</h4>
            <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Record utilities, rent, maintenance, marketing, and petty cash expenses.</p>
          </div>
          <button id="btn-open-add-expense-modal" class="btn-primary" style="padding:8px 16px; font-size:0.85rem; font-weight:800; border-radius:8px;">
            ➕ Add Expense
          </button>
        </div>

        <div class="card" style="padding:40px; text-align:center; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
          <div style="font-size:2.5rem; margin-bottom:12px;">💡</div>
          <h4 style="margin:0 0 8px; font-size:1.1rem; font-weight:800;">No Operational Expenses Logged</h4>
          <p style="margin:0; color:var(--text-muted); font-size:0.85rem;">Click "Add Expense" to log rent, electricity, or maintenance bills.</p>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 5. TAX / GST REPORTING MODULE
  // =========================================================================
  renderTaxTab() {
    const gst = accountingProjectionService.getGstSummary({ dateFilter: this.dateFilter });
    const apOverview = accountingProjectionService.getApOverview({ tenantId: null });
    const inputGst = apOverview.totalDisbursed * 0.05; // Eligible ITC
    const netGstPosition = gst.totalTaxLiability - inputGst;

    return `
      <div style="display:flex; flex-direction:column; gap:24px;">
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px;">
          <div class="card" style="padding:20px; background:var(--bg-surface-2); border-left:4px solid #8b5cf6;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">OUTPUT GST (SALES)</div>
            <div style="font-size:1.8rem; font-weight:800; color:#8b5cf6; margin-top:4px;">₹${gst.totalTaxLiability.toFixed(2)}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">CGST: ₹${gst.totalCgst.toFixed(2)} | SGST: ₹${gst.totalSgst.toFixed(2)}</div>
          </div>

          <div class="card" style="padding:20px; background:var(--bg-surface-2); border-left:4px solid #10b981;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">INPUT GST (ITC RECOVERABLE)</div>
            <div style="font-size:1.8rem; font-weight:800; color:#10b981; margin-top:4px;">₹${inputGst.toFixed(2)}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">From Disbursed Supplier Invoices</div>
          </div>

          <div class="card" style="padding:20px; background:var(--bg-surface-2); border-left:4px solid var(--accent-primary);">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">NET GST TAX POSITION</div>
            <div style="font-size:1.8rem; font-weight:800; color:var(--accent-primary); margin-top:4px;">₹${netGstPosition.toFixed(2)}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">Output GST - Input Tax Credit</div>
          </div>
        </div>

        <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h4 style="margin:0 0 4px; font-size:1.05rem; font-weight:800;">📄 GST Return Data Export</h4>
            <p style="margin:0; color:var(--text-muted); font-size:0.85rem;">Download GSTR-1 Sales Data, GSTR-2 Purchase/ITC Data, Tax Register, and GST Summary for filing/accounting.</p>
          </div>
          <button class="btn-primary btn-do-export-gst" style="padding:10px 18px; font-size:0.85rem; font-weight:800;">
            📥 Download GST Return Data
          </button>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // ⚙ CENTRALIZED TAX SETUP / CONFIGURATION AUTHORITY
  // =========================================================================
  renderTaxSetupTab() {
    const taxConfig = taxConfigurationModel.getTaxConfiguration();
    const reg = taxConfig.gstRegistration;
    const rules = taxConfig.taxRules;
    const categories = taxConfig.taxCategories;
    const sc = taxConfig.serviceCharge || { enabled: false, rate: 0, isGstApplicableOnServiceCharge: false };
    const bar = taxConfig.barBilling || { separateExciseLicence: false, licenceName: '', licenceNumber: '', gstin: '', address: '', splitByDefault: false };
    const mappings = taxConfig.itemTaxMappings || { categoryDefaults: {}, itemOverrides: {}, __default: 'RESTAURANT_FOOD' };

    // Tax-category <option> builder (shared by category defaults + item overrides).
    const catOptions = (selected) => `
      <option value="">— inherit —</option>
      ${categories.map(c => `<option value="${c.code}" ${c.code === selected ? 'selected' : ''}>${c.name} (${c.code})</option>`).join('')}
    `;
    const ruleOptions = (selected) => rules.map(r => `<option value="${r.code}" ${r.code === selected ? 'selected' : ''}>${r.code} · ${r.rate}%</option>`).join('');

    // Menu categories (both FOOD + BAR) for the category-default mapping.
    const menuCats = (menuMasterModel.getAllCategories() || []);
    const menuItems = (menuMasterModel.getAllMenuItems() || []).filter(i => i.isAvailable);

    const audit = taxConfigurationModel.getTaxAuditLog(null, 25);

    return `
      <div style="display:flex; flex-direction:column; gap:24px;">
        <div style="background:var(--bg-surface-1); padding:20px; border-radius:10px; border:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
          <div>
            <h3 style="margin:0 0 4px; font-size:1.2rem; font-weight:800; color:var(--accent-primary);">⚙️ Centralized Tax Configuration Authority</h3>
            <p style="margin:0; color:var(--text-muted); font-size:0.85rem;">Edit rates and map menu categories/items to tax rules. Changes apply immediately to NEW bills; already-issued bills keep their snapshot.</p>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <button type="button" id="btn-reset-tax-config" class="btn-secondary" style="padding:10px 16px; min-height:44px; font-weight:700;">↺ Discard</button>
            <button type="button" id="btn-save-tax-config" class="btn-primary" style="padding:10px 20px; min-height:44px; font-weight:800;">💾 Save Configuration</button>
          </div>
        </div>
        <div id="tax-save-banner" style="display:none; padding:12px 16px; border-radius:8px; font-weight:700; font-size:0.85rem;"></div>

        <!-- 1. GST REGISTRATION DETAILS -->
        <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
          <h4 style="margin:0 0 16px; font-size:1.05rem; font-weight:800;">🏢 GST Statutory Registration</h4>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; font-size:0.82rem;">
            <div><label style="font-weight:700; color:var(--text-muted); text-transform:uppercase; font-size:0.7rem;">GSTIN / UIN</label>
              <input id="reg-gstin" class="input" style="width:100%; margin-top:4px; padding:10px;" value="${reg.gstin || ''}" /></div>
            <div><label style="font-weight:700; color:var(--text-muted); text-transform:uppercase; font-size:0.7rem;">Registered Legal Name</label>
              <input id="reg-legal-name" class="input" style="width:100%; margin-top:4px; padding:10px;" value="${reg.legalName || ''}" /></div>
            <div><label style="font-weight:700; color:var(--text-muted); text-transform:uppercase; font-size:0.7rem;">Trade Name</label>
              <input id="reg-trade-name" class="input" style="width:100%; margin-top:4px; padding:10px;" value="${reg.tradeName || ''}" /></div>
            <div><label style="font-weight:700; color:var(--text-muted); text-transform:uppercase; font-size:0.7rem;">State Name</label>
              <input id="reg-state-name" class="input" style="width:100%; margin-top:4px; padding:10px;" value="${reg.stateName || ''}" /></div>
            <div><label style="font-weight:700; color:var(--text-muted); text-transform:uppercase; font-size:0.7rem;">State Code</label>
              <input id="reg-state-code" class="input" style="width:100%; margin-top:4px; padding:10px;" value="${reg.stateCode || ''}" /></div>
            <div><label style="font-weight:700; color:var(--text-muted); text-transform:uppercase; font-size:0.7rem;">Registration Type</label>
              <select id="reg-type" class="input" style="width:100%; margin-top:4px; padding:10px;">
                ${['Regular', 'Composition', 'Unregistered'].map(t => `<option ${t === reg.registrationType ? 'selected' : ''}>${t}</option>`).join('')}
              </select></div>
            <div><label style="font-weight:700; color:var(--text-muted); text-transform:uppercase; font-size:0.7rem;">Effective From</label>
              <input id="reg-effective-from" type="date" class="input" style="width:100%; margin-top:4px; padding:10px;" value="${reg.effectiveFrom || ''}" /></div>
            <div style="display:flex; align-items:center;"><label style="display:flex; align-items:center; gap:8px; font-weight:700; cursor:pointer; min-height:44px;">
              <input id="reg-registered" type="checkbox" ${reg.isGstRegistered !== false ? 'checked' : ''} /> GST Registered</label></div>
          </div>
        </div>

        <!-- 2. SERVICE CHARGE -->
        <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
          <h4 style="margin:0 0 16px; font-size:1.05rem; font-weight:800;">🧾 Service Charge</h4>
          <div style="display:flex; gap:24px; align-items:center; flex-wrap:wrap; font-size:0.85rem;">
            <label style="display:flex; align-items:center; gap:8px; font-weight:700; cursor:pointer; min-height:44px;">
              <input id="sc-enabled" type="checkbox" ${sc.enabled !== false ? 'checked' : ''} /> Enabled</label>
            <label style="display:flex; align-items:center; gap:8px; font-weight:700;">Rate %
              <input id="sc-rate" type="number" step="0.5" min="0" class="input" style="width:100px; padding:10px;" value="${sc.rate || 0}" /></label>
            <label style="display:flex; align-items:center; gap:8px; font-weight:700; cursor:pointer; min-height:44px;">
              <input id="sc-gst" type="checkbox" ${sc.isGstApplicableOnServiceCharge ? 'checked' : ''} /> Apply GST on service charge</label>
            <span style="color:var(--text-muted); font-size:0.78rem;">Service charge is skipped on alcohol lines automatically.</span>
          </div>
        </div>

        <!-- 2B. BAR / EXCISE BILLING -->
        <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
          <h4 style="margin:0 0 4px; font-size:1.05rem; font-weight:800;">🍷 Bar / Excise Billing</h4>
          <p style="margin:0 0 16px; color:var(--text-muted); font-size:0.8rem;">By default the bar bills under the same entity/GSTIN as the restaurant. Enable a separate excise licence to print the BAR invoice under its own legal identity, and split the guest bill into two fiscal documents (Food = GST, Bar = Excise VAT).</p>
          <div style="display:flex; flex-direction:column; gap:14px; font-size:0.82rem;">
            <div style="display:flex; gap:24px; align-items:center; flex-wrap:wrap;">
              <label style="display:flex; align-items:center; gap:8px; font-weight:700; cursor:pointer; min-height:44px;">
                <input id="bar-sep-licence" type="checkbox" ${bar.separateExciseLicence ? 'checked' : ''} /> Separate excise licence (different entity)</label>
              <label style="display:flex; align-items:center; gap:8px; font-weight:700; cursor:pointer; min-height:44px;">
                <input id="bar-split-default" type="checkbox" ${bar.splitByDefault ? 'checked' : ''} /> Default new bills to Food/Bar split</label>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px;">
              <div><label style="font-weight:700; color:var(--text-muted); text-transform:uppercase; font-size:0.7rem;">Bar Legal / Trade Name</label>
                <input id="bar-licence-name" class="input" style="width:100%; margin-top:4px; padding:10px;" value="${bar.licenceName || ''}" placeholder="e.g. Anchor Excise Bar" ${bar.separateExciseLicence ? '' : 'disabled'} /></div>
              <div><label style="font-weight:700; color:var(--text-muted); text-transform:uppercase; font-size:0.7rem;">Excise Licence No.</label>
                <input id="bar-licence-number" class="input" style="width:100%; margin-top:4px; padding:10px;" value="${bar.licenceNumber || ''}" placeholder="e.g. EXC/MH/2026/0012" ${bar.separateExciseLicence ? '' : 'disabled'} /></div>
              <div><label style="font-weight:700; color:var(--text-muted); text-transform:uppercase; font-size:0.7rem;">Bar GSTIN (if any)</label>
                <input id="bar-gstin" class="input" style="width:100%; margin-top:4px; padding:10px;" value="${bar.gstin || ''}" placeholder="Optional" ${bar.separateExciseLicence ? '' : 'disabled'} /></div>
              <div><label style="font-weight:700; color:var(--text-muted); text-transform:uppercase; font-size:0.7rem;">Bar Address</label>
                <input id="bar-address" class="input" style="width:100%; margin-top:4px; padding:10px;" value="${bar.address || ''}" placeholder="Licence address as printed on the bar bill" ${bar.separateExciseLicence ? '' : 'disabled'} /></div>
            </div>
          </div>
        </div>

        <!-- 3. TAX RULES (EDITABLE) -->
        <div class="card" style="padding:0; background:var(--bg-surface-1); border:1px solid var(--border-subtle); overflow:hidden;">
          <div style="padding:16px 20px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
            <h4 style="margin:0; font-size:1rem; font-weight:800;">🧮 Tax Rules & Rates</h4>
            <button type="button" id="btn-add-tax-rule" class="btn-secondary" style="padding:8px 14px; min-height:40px; font-weight:700; font-size:0.8rem;">＋ Add Rule</button>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.82rem;" id="tax-rules-table">
              <thead>
                <tr style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); color:var(--text-muted); font-size:0.72rem; text-transform:uppercase;">
                  <th style="padding:10px 12px;">Code</th><th style="padding:10px 12px;">Name</th><th style="padding:10px 12px;">Type</th>
                  <th style="padding:10px 12px;">Rate %</th><th style="padding:10px 12px;">Effective From</th><th style="padding:10px 12px;">Status</th><th style="padding:10px 12px;"></th>
                </tr>
              </thead>
              <tbody>
                ${rules.map(r => this._renderTaxRuleRow(r, ruleOptions)).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 4. TAX CATEGORIES (EDITABLE DEFAULT RULE) -->
        <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
          <h4 style="margin:0 0 16px; font-size:1.05rem; font-weight:800;">🏷️ Tax Categories → Default Rule</h4>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:12px; font-size:0.85rem;">
            ${categories.map(c => `
              <div style="padding:12px 16px; background:var(--bg-surface-2); border-radius:8px; border:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div><div style="font-size:0.72rem; color:var(--accent-primary); font-weight:800;">${c.code}</div>
                  <div style="font-weight:700; margin-top:2px;">${c.name}</div></div>
                <select class="input cat-default-rule" data-cat-code="${c.code}" style="min-width:150px; padding:8px;">
                  ${rules.map(r => `<option value="${r.code}" ${r.code === c.defaultTaxRuleCode ? 'selected' : ''}>${r.code} · ${r.rate}%</option>`).join('')}
                </select>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- 5. MENU CATEGORY → TAX MAPPING -->
        <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
          <h4 style="margin:0 0 6px; font-size:1.05rem; font-weight:800;">🍽️ Menu Categories → Tax Category</h4>
          <p style="margin:0 0 16px; color:var(--text-muted); font-size:0.8rem;">Set the default tax treatment per menu category. Leave as “inherit” to fall back to the restaurant default (${mappings.__default}).</p>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:10px; font-size:0.83rem;">
            ${menuCats.map(mc => `
              <div style="padding:10px 14px; background:var(--bg-surface-2); border-radius:8px; border:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <span style="font-weight:700;">${mc.shortName || mc.name} <span style="color:var(--text-muted); font-weight:600;">(${mc.count})</span></span>
                <select class="input map-cat" data-menu-cat="${mc.rawCategory}" style="min-width:150px; padding:8px;">${catOptions(mappings.categoryDefaults[mc.rawCategory])}</select>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- 6. ITEM-LEVEL OVERRIDES + LIQUOR MARKING -->
        <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:6px;">
            <h4 style="margin:0; font-size:1.05rem; font-weight:800;">🔎 Item Overrides & Liquor Marking</h4>
            <input id="item-map-search" class="input" placeholder="Search dish / drink…" style="min-width:220px; padding:10px;" />
          </div>
          <p style="margin:0 0 14px; color:var(--text-muted); font-size:0.8rem;">Override a single item's tax category, or tick <strong>Liquor</strong> to charge State Liquor VAT. Overrides beat category defaults.</p>
          <div style="max-height:420px; overflow-y:auto; border:1px solid var(--border-subtle); border-radius:8px;">
            <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
              <thead>
                <tr style="position:sticky; top:0; background:var(--bg-surface-2); color:var(--text-muted); font-size:0.72rem; text-transform:uppercase;">
                  <th style="padding:10px 12px; text-align:left;">Item</th><th style="padding:10px 12px; text-align:left;">Category</th>
                  <th style="padding:10px 12px; text-align:left;">Tax Category</th><th style="padding:10px 12px; text-align:center;">Liquor</th>
                </tr>
              </thead>
              <tbody id="item-map-body">
                ${menuItems.map(it => {
                  const ov = (mappings.itemOverrides && mappings.itemOverrides[it.itemCode]) || {};
                  return `
                    <tr class="item-map-row" data-name="${(it.name || '').toLowerCase()}" style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:8px 12px; font-weight:700;">${it.name}<div style="font-size:0.68rem; color:var(--text-muted); font-weight:600;">${it.itemCode}</div></td>
                      <td style="padding:8px 12px; color:var(--text-secondary); font-size:0.75rem;">${it.category}</td>
                      <td style="padding:8px 12px;"><select class="input map-item" data-item-code="${it.itemCode}" style="min-width:150px; padding:8px;">${catOptions(ov.taxCategoryCode)}</select></td>
                      <td style="padding:8px 12px; text-align:center;"><input type="checkbox" class="map-liquor" data-item-code="${it.itemCode}" ${ov.isLiquor ? 'checked' : ''} style="width:20px; height:20px;" /></td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 7. TAX CHANGE LOG -->
        <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
          <h4 style="margin:0 0 12px; font-size:1.05rem; font-weight:800; cursor:pointer;" id="tax-log-toggle">📜 Tax Change Log ${audit.length ? `(${audit.length})` : ''} ▾</h4>
          <div id="tax-log-body" style="display:flex; flex-direction:column; gap:8px; max-height:280px; overflow-y:auto;">
            ${audit.length ? audit.map(a => `
              <div style="padding:10px 12px; background:var(--bg-surface-2); border-radius:8px; border:1px solid var(--border-subtle); font-size:0.8rem;">
                <div style="display:flex; justify-content:space-between; gap:10px;">
                  <strong>${a.actor || 'System'}</strong>
                  <span style="color:var(--text-muted);">${new Date(a.timestamp).toLocaleString()}</span>
                </div>
                <div style="margin-top:4px; color:var(--text-secondary);">${a.changeSummary}</div>
              </div>
            `).join('') : '<div style="color:var(--text-muted); font-size:0.82rem;">No changes recorded yet.</div>'}
          </div>
        </div>
      </div>
    `;
  }

  /** One editable tax-rule row (used by renderTaxSetupTab + Add Rule). */
  _renderTaxRuleRow(r, ruleOptions) {
    return `
      <tr class="tax-rule-row" data-code="${r.code}" style="border-bottom:1px solid var(--border-subtle);">
        <td style="padding:8px 12px;"><input class="input rule-code" value="${r.code}" style="width:120px; padding:8px; font-weight:800; color:var(--accent-primary);" /></td>
        <td style="padding:8px 12px;"><input class="input rule-name" value="${r.name}" style="width:100%; min-width:140px; padding:8px;" /></td>
        <td style="padding:8px 12px;"><select class="input rule-type" style="padding:8px;">${['GST', 'LIQUOR_VAT', 'NONE'].map(t => `<option ${t === r.taxType ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td style="padding:8px 12px;"><input class="input rule-rate" type="number" step="0.5" min="0" value="${r.rate}" style="width:80px; padding:8px; font-weight:800;" /></td>
        <td style="padding:8px 12px;"><input class="input rule-effective" type="date" value="${r.effectiveFrom || ''}" style="padding:8px;" /></td>
        <td style="padding:8px 12px;"><select class="input rule-status" style="padding:8px;">${['ACTIVE', 'INACTIVE'].map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td style="padding:8px 12px; text-align:right;"><button type="button" class="btn-remove-rule" style="color:var(--status-danger); background:transparent; border:none; cursor:pointer; font-weight:700; min-height:36px;">✕</button></td>
      </tr>`;
  }

  /**
   * Wire the editable Tax Setup screen: item search filter, add/remove rule
   * rows, save (build config from DOM -> saveTaxConfiguration -> re-render),
   * discard, and the change-log toggle.
   */
  _bindTaxSetupEvents() {
    const c = this.container;
    if (!c) return;

    // Live filter of the item-mapping table.
    const search = c.querySelector('#item-map-search');
    if (search) {
      search.addEventListener('input', () => {
        const q = search.value.toLowerCase();
        c.querySelectorAll('.item-map-row').forEach(row => {
          row.style.display = (!row.dataset.name || row.dataset.name.includes(q)) ? '' : 'none';
        });
      });
    }

    // Collapsible change log.
    const logToggle = c.querySelector('#tax-log-toggle');
    const logBody = c.querySelector('#tax-log-body');
    if (logToggle && logBody) {
      logToggle.addEventListener('click', () => {
        const hidden = logBody.style.display === 'none';
        logBody.style.display = hidden ? 'flex' : 'none';
      });
    }

    // Add / remove tax-rule rows (delegated removal).
    const rulesTable = c.querySelector('#tax-rules-table');
    const rulesBody = rulesTable ? rulesTable.querySelector('tbody') : null;
    if (rulesTable) {
      rulesTable.addEventListener('click', (e) => {
        const rm = e.target.closest('.btn-remove-rule');
        if (rm) rm.closest('tr').remove();
      });
    }
    const btnAddRule = c.querySelector('#btn-add-tax-rule');
    if (btnAddRule && rulesBody) {
      btnAddRule.addEventListener('click', () => {
        const blank = { code: 'RULE-' + String(Date.now()).slice(-4), name: 'New Rule', taxType: 'GST', rate: 0, effectiveFrom: '', status: 'ACTIVE' };
        rulesBody.insertAdjacentHTML('beforeend', this._renderTaxRuleRow(blank));
      });
    }

    // Discard -> reload from the store.
    const btnReset = c.querySelector('#btn-reset-tax-config');
    if (btnReset) btnReset.addEventListener('click', () => this.updateContent());

    // Live-toggle the bar identity fields against the "separate licence" checkbox.
    const barSep = c.querySelector('#bar-sep-licence');
    if (barSep) {
      barSep.addEventListener('change', () => {
        ['#bar-licence-name', '#bar-licence-number', '#bar-gstin', '#bar-address'].forEach(sel => {
          const el = c.querySelector(sel);
          if (el) el.disabled = !barSep.checked;
        });
      });
    }

    // Save -> assemble config from the DOM and persist through the model.
    const btnSave = c.querySelector('#btn-save-tax-config');
    if (btnSave) {
      btnSave.addEventListener('click', () => {
        try {
          const cfg = taxConfigurationModel.getTaxConfiguration();

          cfg.gstRegistration = {
            ...cfg.gstRegistration,
            gstin: c.querySelector('#reg-gstin') ? c.querySelector('#reg-gstin').value.trim() : cfg.gstRegistration.gstin,
            legalName: c.querySelector('#reg-legal-name') ? c.querySelector('#reg-legal-name').value.trim() : cfg.gstRegistration.legalName,
            tradeName: c.querySelector('#reg-trade-name') ? c.querySelector('#reg-trade-name').value.trim() : cfg.gstRegistration.tradeName,
            stateName: c.querySelector('#reg-state-name') ? c.querySelector('#reg-state-name').value.trim() : cfg.gstRegistration.stateName,
            stateCode: c.querySelector('#reg-state-code') ? c.querySelector('#reg-state-code').value.trim() : cfg.gstRegistration.stateCode,
            registrationType: c.querySelector('#reg-type') ? c.querySelector('#reg-type').value : cfg.gstRegistration.registrationType,
            effectiveFrom: c.querySelector('#reg-effective-from') ? c.querySelector('#reg-effective-from').value : cfg.gstRegistration.effectiveFrom,
            isGstRegistered: c.querySelector('#reg-registered') ? c.querySelector('#reg-registered').checked : cfg.gstRegistration.isGstRegistered
          };

          cfg.serviceCharge = {
            ...cfg.serviceCharge,
            enabled: c.querySelector('#sc-enabled') ? c.querySelector('#sc-enabled').checked : cfg.serviceCharge.enabled,
            rate: c.querySelector('#sc-rate') ? (parseFloat(c.querySelector('#sc-rate').value) || 0) : cfg.serviceCharge.rate,
            isGstApplicableOnServiceCharge: c.querySelector('#sc-gst') ? c.querySelector('#sc-gst').checked : cfg.serviceCharge.isGstApplicableOnServiceCharge
          };

          cfg.barBilling = {
            ...(cfg.barBilling || {}),
            separateExciseLicence: c.querySelector('#bar-sep-licence') ? c.querySelector('#bar-sep-licence').checked : false,
            splitByDefault: c.querySelector('#bar-split-default') ? c.querySelector('#bar-split-default').checked : false,
            licenceName: c.querySelector('#bar-licence-name') ? c.querySelector('#bar-licence-name').value.trim() : '',
            licenceNumber: c.querySelector('#bar-licence-number') ? c.querySelector('#bar-licence-number').value.trim() : '',
            gstin: c.querySelector('#bar-gstin') ? c.querySelector('#bar-gstin').value.trim() : '',
            address: c.querySelector('#bar-address') ? c.querySelector('#bar-address').value.trim() : ''
          };

          const origRules = {};
          (cfg.taxRules || []).forEach(r => { origRules[r.code] = r; });
          const newRules = [];
          c.querySelectorAll('#tax-rules-table tbody tr').forEach(tr => {
            const codeEl = tr.querySelector('.rule-code');
            if (!codeEl) return;
            const code = codeEl.value.trim();
            if (!code) return;
            const type = tr.querySelector('.rule-type').value;
            const rate = parseFloat(tr.querySelector('.rule-rate').value) || 0;
            const name = tr.querySelector('.rule-name').value || code;
            const effectiveFrom = tr.querySelector('.rule-effective').value || (origRules[code] && origRules[code].effectiveFrom) || null;
            const status = tr.querySelector('.rule-status').value;
            const rule = { ...origRules[code], code, name, taxType: type, rate, status, effectiveFrom, effectiveTo: (origRules[code] && origRules[code].effectiveTo) || null };
            if (type === 'GST') { rule.cgstRate = rate / 2; rule.sgstRate = rate / 2; rule.igstRate = rate; }
            newRules.push(rule);
          });
          if (newRules.length) cfg.taxRules = newRules;

          cfg.taxCategories = (cfg.taxCategories || []).map(cat => {
            const sel = c.querySelector(`.cat-default-rule[data-cat-code="${cat.code}"]`);
            return sel ? { ...cat, defaultTaxRuleCode: sel.value } : cat;
          });

          const categoryDefaults = {};
          c.querySelectorAll('.map-cat').forEach(sel => { if (sel.value) categoryDefaults[sel.dataset.menuCat] = sel.value; });
          const itemOverrides = {};
          c.querySelectorAll('.map-item').forEach(sel => {
            const code = sel.dataset.itemCode;
            const liq = c.querySelector(`.map-liquor[data-item-code="${code}"]`);
            const val = sel.value;
            const isLiq = liq ? liq.checked : false;
            if (val || isLiq) itemOverrides[code] = { ...(val ? { taxCategoryCode: val } : {}), isLiquor: isLiq };
          });
          cfg.itemTaxMappings = {
            categoryDefaults,
            itemOverrides,
            __default: (cfg.itemTaxMappings && cfg.itemTaxMappings.__default) || 'RESTAURANT_FOOD'
          };

          taxConfigurationModel.saveTaxConfiguration(cfg);

          const banner = c.querySelector('#tax-save-banner');
          if (banner) {
            banner.style.display = 'block';
            banner.style.background = 'rgba(16,185,129,0.15)';
            banner.style.color = '#10b981';
            banner.style.border = '1px solid rgba(16,185,129,0.3)';
            banner.textContent = '✅ Tax configuration saved. New bills will use these rates immediately.';
          }
          // Re-render after a short beat so the banner is visible briefly.
          setTimeout(() => this.updateContent(), 700);
        } catch (err) {
          const banner = c.querySelector('#tax-save-banner');
          if (banner) {
            banner.style.display = 'block';
            banner.style.background = 'rgba(239,68,68,0.15)';
            banner.style.color = '#ef4444';
            banner.style.border = '1px solid rgba(239,68,68,0.3)';
            banner.textContent = '⚠️ Failed to save: ' + (err && err.message ? err.message : String(err));
          }
        }
      });
    }
  }

  // =========================================================================
  // 6. REPORTS MODULE
  // =========================================================================
  renderReportsTab() {
    const reports = [
      { id: 'daily_sales', title: '01. Daily Sales Register', desc: 'Itemized sales invoices with tax breakdown' },
      { id: 'sales_gst', title: '02. Sales & GST Summary', desc: 'Monthly taxable revenue and output GST totals' },
      { id: 'purchase_reg', title: '03. Purchase Register', desc: 'Supplier invoices intaken and GRN match status' },
      { id: 'supplier_payables', title: '04. Supplier Payables (AP)', desc: 'Outstanding vendor liabilities and due dates' },
      { id: 'expense_reg', title: '05. Expense Register', desc: 'Operational expense ledger by category' },
      { id: 'payment_reg', title: '06. Supplier Payment Register', desc: 'Disbursement outflow history with UTR references' },
      { id: 'inventory_val', title: '07. Inventory Valuation', desc: 'Weighted Average Cost (WAC) stock valuation' },
      { id: 'financial_summary', title: '08. Financial Data Summary', desc: 'Complete executive financial position' }
    ];

    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div style="background:var(--bg-surface-1); padding:16px; border-radius:10px; border:1px solid var(--border-subtle);">
          <h4 style="margin:0 0 4px; font-size:1.05rem; font-weight:800;">📈 Authoritative Financial Reports</h4>
          <p style="margin:0; color:var(--text-muted); font-size:0.82rem;">Generated directly from canonical domain records.</p>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
          ${reports.map(r => `
            <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); display:flex; flex-direction:column; justify-space-between; gap:12px;">
              <div>
                <h4 style="margin:0 0 6px; font-size:0.98rem; font-weight:800; color:var(--accent-primary);">${r.title}</h4>
                <p style="margin:0; font-size:0.82rem; color:var(--text-secondary);">${r.desc}</p>
              </div>
              <button class="btn-secondary btn-run-report" data-report-id="${r.id}" style="width:100%; padding:8px; font-size:0.8rem; font-weight:700;">
                📊 View Report Data
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 7. EXPORT CENTER MODULE
  // =========================================================================
  renderExportTab() {
    return `
      <div class="card" style="padding:24px; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
        <h3 style="margin:0 0 16px; font-size:1.2rem; font-weight:800;">📤 Financial Data Export Center</h3>
        <p style="color:var(--text-muted); font-size:0.88rem; margin-bottom:20px;">Download canonical financial data packs in Tally Prime XML, Excel, CSV, or PDF format.</p>

        <div style="display:flex; flex-direction:column; gap:16px; max-width:480px;">
          <div>
            <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Select Export Data Domain</label>
            <select id="select-export-domain" class="input" style="width:100%; font-weight:700;">
              <option value="all">Complete Financial Data Pack (All Objects)</option>
              <option value="sales">Customer Sales & Collections Only</option>
              <option value="purchases">Purchases & Supplier AP Only</option>
              <option value="gst">GST Tax Register Only</option>
            </select>
          </div>

          <div>
            <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Select Export Period</label>
            <select id="select-export-period" class="input" style="width:100%; font-weight:700;">
              <option value="month">Current Month (Sep 2026)</option>
              <option value="week">Past 7 Days</option>
              <option value="today">Today Only</option>
              <option value="all">All Available Records</option>
            </select>
          </div>

          <div>
            <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Export Format</label>
            <div style="display:flex; flex-direction:column; gap:10px;">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="radio" name="exportFormat" value="tally" checked />
                <strong>🏛️ Tally Prime XML Package</strong> (Sales & Receipt Vouchers)
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="radio" name="exportFormat" value="excel" />
                <strong>📊 Excel / JSON Package</strong> (Structured Workbook)
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="radio" name="exportFormat" value="csv" />
                <strong>📄 CSV Package</strong> (Comma Separated Values)
              </label>
            </div>
          </div>

          <button id="btn-do-generate-export" class="btn-primary" style="padding:12px; font-size:0.95rem; font-weight:800; margin-top:8px;">
            📥 Generate & Download Financial Data Pack
          </button>
        </div>
      </div>
    `;
  }

  // --- HELPER BADGES ---
  getMatchStatusBadge(matchStatus) {
    switch (matchStatus) {
      case 'MATCHED': return '<span class="badge badge-success" style="font-size:0.7rem; font-weight:800;">✓ MATCHED</span>';
      case 'WAITING_FOR_RECEIPT': return '<span class="badge badge-warning" style="font-size:0.7rem; font-weight:800;">⏳ WAITING FOR RECEIPT</span>';
      case 'EXCEPTION': return '<span class="badge badge-danger" style="font-size:0.7rem; font-weight:800;">⚠️ EXCEPTION</span>';
      default: return '<span class="badge" style="font-size:0.7rem; font-weight:800; background:var(--bg-surface-2);">PENDING</span>';
    }
  }

  getApStatusBadge(status) {
    switch (status) {
      case 'APPROVED': return '<span class="badge badge-success" style="font-size:0.7rem; font-weight:800;">APPROVED</span>';
      case 'PAYMENT_DUE': return '<span class="badge badge-warning" style="font-size:0.7rem; font-weight:800;">PAYMENT DUE</span>';
      case 'PARTIALLY_PAID': return '<span class="badge badge-warning" style="font-size:0.7rem; font-weight:800; background:#8b5cf6; color:#fff;">PARTIALLY PAID</span>';
      case 'PAID': return '<span class="badge badge-success" style="font-size:0.7rem; font-weight:800; background:#10b981; color:#fff;">PAID</span>';
      case 'REJECTED': return '<span class="badge badge-danger" style="font-size:0.7rem; font-weight:800;">REJECTED</span>';
      default: return '<span class="badge badge-secondary" style="font-size:0.7rem; font-weight:800;">SUBMITTED</span>';
    }
  }

  // --- MODAL RENDERERS ---
  renderAddSupplierInvoiceModal() {
    return `
      <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index:9999; backdrop-filter:blur(4px);">
        <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:12px; width:90%; max-width:650px; max-height:90vh; overflow-y:auto; padding:24px; box-shadow:0 20px 40px rgba(0,0,0,0.5);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
            <h3 style="margin:0; font-size:1.2rem; font-weight:800;">📥 Intake Supplier Tax Invoice</h3>
            <button id="btn-close-add-invoice-modal" class="btn-icon" style="background:transparent; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">✕</button>
          </div>

          <form id="form-add-supplier-invoice" style="display:flex; flex-direction:column; gap:16px;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Supplier Invoice No *</label>
                <input id="inp-ap-inv-no" type="text" class="input" placeholder="e.g. FF/26-27/00451" required style="width:100%; font-weight:700;" />
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Supplier Code *</label>
                <input id="inp-ap-supplier-code" type="text" class="input" value="SUP-101" required style="width:100%; font-weight:700;" />
              </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">PO Reference No</label>
                <input id="inp-ap-po-no" type="text" class="input" placeholder="e.g. PO-2026-1002" style="width:100%; font-weight:700;" />
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Invoice Date *</label>
                <input id="inp-ap-inv-date" type="date" class="input" value="${new Date().toISOString().split('T')[0]}" required style="width:100%; font-weight:700;" />
              </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Due Date</label>
                <input id="inp-ap-due-date" type="date" class="input" value="${new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]}" style="width:100%; font-weight:700;" />
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Freight Charges (₹)</label>
                <input id="inp-ap-freight" type="number" step="0.01" class="input" value="0.00" style="width:100%; font-weight:700;" />
              </div>
            </div>

            <div style="border-top:1px dashed var(--border-subtle); padding-top:16px;">
              <h5 style="margin:0 0 12px; font-size:0.85rem; font-weight:800; color:var(--accent-primary);">Line Item Details</h5>
              <div style="display:grid; grid-template-columns:1.5fr 1fr 1fr 1fr; gap:12px;">
                <div>
                  <label style="display:block; font-size:0.7rem; color:var(--text-muted);">Item Name</label>
                  <input id="inp-ap-item-name" type="text" class="input" value="Potatoes" style="width:100%;" />
                </div>
                <div>
                  <label style="display:block; font-size:0.7rem; color:var(--text-muted);">Item Code</label>
                  <input id="inp-ap-item-code" type="text" class="input" value="RM0701" style="width:100%;" />
                </div>
                <div>
                  <label style="display:block; font-size:0.7rem; color:var(--text-muted);">Quantity</label>
                  <input id="inp-ap-qty" type="number" step="0.01" class="input" value="100" style="width:100%;" />
                </div>
                <div>
                  <label style="display:block; font-size:0.7rem; color:var(--text-muted);">Unit Price (₹)</label>
                  <input id="inp-ap-unit-price" type="number" step="0.01" class="input" value="30.00" style="width:100%;" />
                </div>
              </div>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:12px;">
              <button type="button" id="btn-close-add-invoice-modal" class="btn-secondary">Cancel</button>
              <button type="submit" class="btn-primary">Submit Supplier Invoice</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  renderAddExpenseModal() {
    return `
      <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index:9999; backdrop-filter:blur(4px);">
        <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:12px; width:90%; max-width:520px; padding:24px; box-shadow:0 20px 40px rgba(0,0,0,0.5);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
            <h3 style="margin:0; font-size:1.15rem; font-weight:800;">💡 Log Operational Expense</h3>
            <button id="btn-close-add-expense-modal" class="btn-icon" style="background:transparent; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">✕</button>
          </div>

          <form id="form-add-expense" style="display:flex; flex-direction:column; gap:14px;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Expense Date *</label>
                <input id="inp-exp-date" type="date" class="input" value="${new Date().toISOString().split('T')[0]}" required style="width:100%; font-weight:700;" />
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Category *</label>
                <select id="inp-exp-category" class="input" style="width:100%; font-weight:700;">
                  <option value="UTILITIES">Utilities (Electricity/Water/Gas)</option>
                  <option value="RENT">Property Rent</option>
                  <option value="MAINTENANCE">Repairs & Maintenance</option>
                  <option value="MARKETING">Marketing & Promotions</option>
                  <option value="SUPPLIES">Office / Cleaning Supplies</option>
                </select>
              </div>
            </div>

            <div>
              <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Vendor / Payee Name *</label>
              <input id="inp-exp-vendor" type="text" class="input" placeholder="e.g. MSEDCL Electricity Board" required style="width:100%; font-weight:700;" />
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Taxable Amount (₹) *</label>
                <input id="inp-exp-taxable" type="number" step="0.01" class="input" placeholder="0.00" required style="width:100%; font-weight:700;" />
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">GST Tax (₹)</label>
                <input id="inp-exp-gst" type="number" step="0.01" class="input" placeholder="0.00" style="width:100%; font-weight:700;" />
              </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Payment Method</label>
                <select id="inp-exp-method" class="input" style="width:100%; font-weight:700;">
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="UPI">UPI</option>
                  <option value="PETTY_CASH">Petty Cash</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Bill / Ref No</label>
                <input id="inp-exp-ref" type="text" class="input" placeholder="e.g. BILL-9941" style="width:100%;" />
              </div>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:10px;">
              <button type="button" id="btn-close-add-expense-modal" class="btn-secondary">Cancel</button>
              <button type="submit" class="btn-primary">Save Expense Record</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  renderSupplierInvoiceDrawer(supplierInvoiceId) {
    const inv = supplierInvoiceModel.getSupplierInvoiceById(supplierInvoiceId);
    if (!inv) return '';

    const matchBadge = this.getMatchStatusBadge(inv.matchStatus);
    const variances = inv.matchVariances || [];

    return `
      <div style="position:fixed; top:0; right:0; width:520px; height:100vh; background:var(--bg-surface-1); border-left:1px solid var(--border-subtle); box-shadow:-10px 0 30px rgba(0,0,0,0.5); z-index:9999; display:flex; flex-direction:column; animation:slideLeft 0.2s ease;">
        <div style="padding:20px; border-bottom:1px solid var(--border-subtle); background:var(--bg-surface-2); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">SUPPLIER INVOICE AP DRAWER</div>
            <h3 style="margin:2px 0 0; font-size:1.2rem; font-weight:800; color:var(--accent-primary);">${inv.supplierInvoiceNumber}</h3>
          </div>
          <button id="btn-close-supplier-drawer" class="btn-icon" style="background:transparent; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">✕</button>
        </div>

        <div style="flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:20px;">
          <div class="card" style="padding:16px; background:var(--bg-surface-2); border:1px solid var(--border-subtle);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <strong style="font-size:1.05rem;">${inv.supplierName}</strong>
              ${matchBadge}
            </div>
            <div style="font-size:0.8rem; color:var(--text-secondary); display:flex; flex-direction:column; gap:4px;">
              <div><strong>Supplier Code:</strong> ${inv.supplierCode}</div>
              <div><strong>PO Reference:</strong> ${inv.poNumber ? `<span style="background:var(--bg-surface-1); padding:2px 8px; border-radius:4px; font-weight:800;">${inv.poNumber}</span>` : 'None'}</div>
              <div><strong>Invoice Date:</strong> ${inv.invoiceDate} | <strong>Due:</strong> ${inv.dueDate}</div>
            </div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-2); border:1px solid var(--border-subtle);">
            <h4 style="margin:0 0 12px; font-size:0.95rem; font-weight:800;">🔍 3-Way Match Matrix</h4>
            <div style="display:flex; flex-direction:column; gap:8px; font-size:0.82rem;">
              <div style="display:flex; justify-content:space-between; padding-bottom:6px; border-bottom:1px solid var(--border-subtle);">
                <span>Supplier Verification:</span> <strong style="color:var(--status-success);">✓ MATCHED</strong>
              </div>
              <div style="display:flex; justify-content:space-between; padding-bottom:6px; border-bottom:1px solid var(--border-subtle);">
                <span>PO Exist Verification:</span> <strong style="${inv.poNumber ? 'color:var(--status-success);' : 'color:var(--status-danger);'}">${inv.poNumber ? '✓ RESOLVED' : '❌ PO MISSING'}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; padding-bottom:6px; border-bottom:1px solid var(--border-subtle);">
                <span>Goods Receipt Verification:</span> <strong style="${inv.matchStatus === 'WAITING_FOR_RECEIPT' ? 'color:var(--status-warning);' : 'color:var(--status-success);'}">${inv.matchStatus === 'WAITING_FOR_RECEIPT' ? '⏳ WAITING FOR GRN' : '✓ GRN LINKED'}</strong>
              </div>
            </div>
          </div>

          ${variances.length > 0 ? `
            <div class="card" style="padding:16px; background:rgba(239,68,68,0.1); border:1px solid var(--status-danger);">
              <h4 style="margin:0 0 8px; font-size:0.95rem; font-weight:800; color:var(--status-danger);">⚠️ Match Variances (${variances.length})</h4>
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${variances.map(v => `
                  <div style="font-size:0.8rem; color:var(--text-primary); padding:6px 10px; background:var(--bg-surface-1); border-radius:6px;">
                    <strong>${v.type}:</strong> ${v.description || JSON.stringify(v)}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div class="card" style="padding:16px; background:var(--bg-surface-2); border:1px solid var(--border-subtle);">
            <h4 style="margin:0 0 12px; font-size:0.95rem; font-weight:800;">💰 Invoice Valuation & Tax</h4>
            <div style="display:flex; flex-direction:column; gap:6px; font-size:0.82rem;">
              <div style="display:flex; justify-content:space-between;"><span>Subtotal:</span> <strong>₹${(parseFloat(inv.subtotal || 0)).toFixed(2)}</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Discount:</span> <strong>-₹${(parseFloat(inv.discountAmount || 0)).toFixed(2)}</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Freight:</span> <strong>₹${(parseFloat(inv.freightAmount || 0)).toFixed(2)}</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Taxable Amount:</span> <strong>₹${(parseFloat(inv.taxableAmount !== undefined ? inv.taxableAmount : (inv.subtotal || 0))).toFixed(2)}</strong></div>
              <div style="display:flex; justify-content:space-between;"><span>Input GST:</span> <strong>₹${(parseFloat(inv.taxAmount || inv.gstAmount || 0)).toFixed(2)}</strong></div>
              <div style="display:flex; justify-content:space-between; margin-top:6px; padding-top:6px; border-top:1px solid var(--border-subtle); font-size:1rem; font-weight:800; color:var(--accent-primary);">
                <span>Grand Total Payable:</span> <span>₹${(parseFloat(inv.grandTotal !== undefined ? inv.grandTotal : (inv.totalAmount || inv.subtotal || 0))).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div style="padding:20px; border-top:1px solid var(--border-subtle); background:var(--bg-surface-2); display:flex; justify-content:flex-end; gap:12px;">
          ${inv.status === 'SUBMITTED' || inv.status === 'MATCHING' || inv.status === 'RESOLVED' ? `
            <button id="btn-approve-ap-invoice" data-inv-id="${inv.id}" class="btn-primary" style="width:100%; padding:12px; font-size:0.9rem; font-weight:800;">
              ✅ Approve Invoice for Payment
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  renderPaymentAuthModal(supplierInvoiceId) {
    const inv = supplierInvoiceModel.getSupplierInvoiceById(supplierInvoiceId);
    if (!inv) return '';

    const outstanding = inv.outstandingAmount !== undefined ? inv.outstandingAmount : inv.grandTotal;

    return `
      <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index:9999; backdrop-filter:blur(4px);">
        <div style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:12px; width:90%; max-width:500px; padding:24px; box-shadow:0 20px 40px rgba(0,0,0,0.5);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
            <h3 style="margin:0; font-size:1.15rem; font-weight:800;">💳 Authorize Vendor Disbursement</h3>
            <button id="btn-close-pay-auth-modal" class="btn-icon" style="background:transparent; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">✕</button>
          </div>

          <form id="form-disburse-vendor-payment" style="display:flex; flex-direction:column; gap:14px;">
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:8px; border:1px solid var(--border-subtle); font-size:0.85rem;">
              <div><strong>Invoice:</strong> ${inv.supplierInvoiceNumber}</div>
              <div><strong>Supplier:</strong> ${inv.supplierName}</div>
              <div style="color:var(--status-danger); font-weight:800; margin-top:4px;">Outstanding Balance: ₹${outstanding.toFixed(2)}</div>
            </div>

            <div>
              <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Disbursement Amount (₹) *</label>
              <input id="inp-pay-amount" type="number" step="0.01" max="${outstanding}" class="input" value="${outstanding.toFixed(2)}" required style="width:100%; font-size:1.1rem; font-weight:800; color:#10b981;" />
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Payment Method *</label>
                <select id="inp-pay-method" class="input" style="width:100%; font-weight:700;">
                  <option value="BANK_TRANSFER">BANK TRANSFER (NEFT/RTGS)</option>
                  <option value="CHEQUE">CHEQUE</option>
                  <option value="UPI">UPI</option>
                  <option value="CASH">CASH</option>
                </select>
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">Bank Ref / UTR *</label>
                <input id="inp-pay-utr" type="text" class="input" placeholder="e.g. UTR-984120491" required style="width:100%; font-weight:700;" />
              </div>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:10px;">
              <button type="button" id="btn-close-pay-auth-modal" class="btn-secondary">Cancel</button>
              <button type="submit" class="btn-primary" style="background:#10b981;">Disburse Outflow</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // DOM EVENT BINDINGS
  // =========================================================================
  bindEvents() {
    if (!this.container) return;

    if (this.activeTab === 'tax_setup') this._bindTaxSetupEvents();

    // Main Navigation Tabs
    this.container.querySelectorAll('.btn-ca-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.updateContent();
      });
    });

    // Overview Jump Attention Buttons
    this.container.querySelectorAll('.btn-jump-attention').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.navTab) this.activeTab = btn.dataset.navTab;
        if (btn.dataset.navSubtab) this.purchasesSubTab = btn.dataset.navSubtab;
        this.updateContent();
      });
    });

    // Date Filter buttons
    this.container.querySelectorAll('.btn-ca-date-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        this.dateFilter = btn.dataset.dateFilter;
        this.updateContent();
      });
    });

    // Lock Period Button
    const btnLock = this.container.querySelector('#btn-lock-period');
    if (btnLock) {
      btnLock.addEventListener('click', () => {
        const periodId = financialPeriodService.getPeriodIdForDate(new Date());
        financialPeriodService.lockPeriod(periodId);
        alert(`🔒 Financial Period ${periodId} successfully LOCKED!`);
        this.updateContent();
      });
    }

    // Sales Sub-tabs
    this.container.querySelectorAll('.btn-sales-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.salesSubTab = btn.dataset.subtab;
        this.updateContent();
      });
    });

    // Purchases Sub-tabs
    this.container.querySelectorAll('.btn-purchases-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.purchasesSubTab = btn.dataset.subtab;
        this.updateContent();
      });
    });

    // View Sales Drawer
    this.container.querySelectorAll('.btn-view-sales-drawer').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedSalesInvoiceNumber = btn.dataset.invNo;
        this.updateContent();
      });
    });

    // Close Sales Drawer
    const btnCloseSalesDrawer = this.container.querySelector('#btn-close-sales-drawer');
    if (btnCloseSalesDrawer) {
      btnCloseSalesDrawer.addEventListener('click', () => {
        this.selectedSalesInvoiceNumber = null;
        this.updateContent();
      });
    }

    // Print Tax Invoice Button inside Sales Drawer
    this.container.querySelectorAll('.btn-print-tax-invoice').forEach(btn => {
      btn.addEventListener('click', () => {
        const invNo = btn.dataset.invNo;
        const modal = new TaxInvoicePrintModal();
        modal.render(invNo);
      });
    });

    // Open Add AP Invoice Modal
    const btnOpenAddInv = this.container.querySelector('#btn-open-add-supplier-invoice');
    if (btnOpenAddInv) {
      btnOpenAddInv.addEventListener('click', () => {
        this.showAddInvoiceModal = true;
        this.updateContent();
      });
    }

    // Close Add AP Invoice Modal
    const btnCloseAddInv = this.container.querySelector('#btn-close-add-invoice-modal');
    if (btnCloseAddInv) {
      btnCloseAddInv.addEventListener('click', () => {
        this.showAddInvoiceModal = false;
        this.updateContent();
      });
    }

    // Open Add Expense Modal
    const btnOpenAddExp = this.container.querySelector('#btn-open-add-expense-modal');
    if (btnOpenAddExp) {
      btnOpenAddExp.addEventListener('click', () => {
        this.showAddExpenseModal = true;
        this.updateContent();
      });
    }

    // Close Add Expense Modal
    const btnCloseAddExp = this.container.querySelector('#btn-close-add-expense-modal');
    if (btnCloseAddExp) {
      btnCloseAddExp.addEventListener('click', () => {
        this.showAddExpenseModal = false;
        this.updateContent();
      });
    }

    // Submit Add AP Invoice Form
    const formAddInv = this.container.querySelector('#form-add-supplier-invoice');
    if (formAddInv) {
      formAddInv.addEventListener('submit', (e) => {
        e.preventDefault();
        const supplierInvoiceNumber = this.container.querySelector('#inp-ap-inv-no').value.trim();
        const supplierCode = this.container.querySelector('#inp-ap-supplier-code').value.trim();
        const poNumber = this.container.querySelector('#inp-ap-po-no').value.trim() || null;
        const invoiceDate = this.container.querySelector('#inp-ap-inv-date').value;
        const dueDate = this.container.querySelector('#inp-ap-due-date').value;
        const itemName = this.container.querySelector('#inp-ap-item-name').value || 'Raw Material';
        const itemCode = this.container.querySelector('#inp-ap-item-code').value || 'RM01';
        const quantity = parseFloat(this.container.querySelector('#inp-ap-qty').value) || 1;
        const unitPrice = parseFloat(this.container.querySelector('#inp-ap-unit-price').value) || 0;
        const freightAmount = parseFloat(this.container.querySelector('#inp-ap-freight').value) || 0;

        try {
          const inv = supplierInvoiceModel.createSupplierInvoice({
            supplierInvoiceNumber,
            supplierCode,
            supplierName: supplierCode === 'SUP-101' ? 'Fresh Farm Produce Pvt Ltd' : supplierCode,
            poNumber,
            invoiceDate,
            dueDate,
            freightAmount,
            lines: [{ itemCode, itemName, quantity, unitPrice, lineTotal: quantity * unitPrice }],
            createdBy: 'CA Auditor'
          });

          apMatchingEngine.perform3WayMatch(inv.id);
          this.showAddInvoiceModal = false;
          alert(`✅ Supplier Invoice ${supplierInvoiceNumber} intaken & 3-Way Match evaluated!`);
          this.updateContent();
        } catch (err) {
          alert(`❌ Error submitting invoice: ${err.message}`);
        }
      });
    }

    // Submit Add Expense Form
    const formAddExp = this.container.querySelector('#form-add-expense');
    if (formAddExp) {
      formAddExp.addEventListener('submit', (e) => {
        e.preventDefault();
        const vendor = this.container.querySelector('#inp-exp-vendor').value.trim();
        const taxable = parseFloat(this.container.querySelector('#inp-exp-taxable').value) || 0;
        alert(`💡 Operational Expense of ₹${taxable.toFixed(2)} to ${vendor} saved!`);
        this.showAddExpenseModal = false;
        this.updateContent();
      });
    }

    // View Supplier Invoice Drawer
    this.container.querySelectorAll('.btn-view-supplier-invoice').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedSupplierInvoiceId = btn.dataset.invId;
        this.updateContent();
      });
    });

    // Close Supplier Invoice Drawer
    const btnCloseDrawer = this.container.querySelector('#btn-close-supplier-drawer');
    if (btnCloseDrawer) {
      btnCloseDrawer.addEventListener('click', () => {
        this.selectedSupplierInvoiceId = null;
        this.updateContent();
      });
    }

    // Run 3-Way Match Trigger
    this.container.querySelectorAll('.btn-trigger-match').forEach(btn => {
      btn.addEventListener('click', () => {
        const invId = btn.dataset.invId;
        try {
          const result = apMatchingEngine.perform3WayMatch(invId);
          alert(`🔍 3-Way Match Evaluated: ${result.matchStatus}\n${result.variances.length} variance(s) found.`);
          this.updateContent();
        } catch (err) {
          alert(`❌ Match Evaluation Error: ${err.message}`);
        }
      });
    });

    // Approve AP Invoice
    const btnApproveInv = this.container.querySelector('#btn-approve-ap-invoice');
    if (btnApproveInv) {
      btnApproveInv.addEventListener('click', () => {
        const invId = btnApproveInv.dataset.invId;
        try {
          supplierInvoiceModel.approveSupplierInvoice(invId, 'CA Auditor');
          alert(`✅ Supplier Invoice approved for AP liability! Journal entry AP_INVOICE_APPROVED generated.`);
          this.selectedSupplierInvoiceId = null;
          this.updateContent();
        } catch (err) {
          alert(`❌ Approval Blocked: ${err.message}`);
        }
      });
    }

    // Open Payment Auth Modal
    this.container.querySelectorAll('.btn-open-pay-auth').forEach(btn => {
      btn.addEventListener('click', () => {
        this.showPaymentAuthInvoiceId = btn.dataset.invId;
        this.updateContent();
      });
    });

    // Close Payment Auth Modal
    const btnClosePayAuth = this.container.querySelector('#btn-close-pay-auth-modal');
    if (btnClosePayAuth) {
      btnClosePayAuth.addEventListener('click', () => {
        this.showPaymentAuthInvoiceId = null;
        this.updateContent();
      });
    }

    // Submit Payment Disbursement
    const formPayAuth = this.container.querySelector('#form-disburse-vendor-payment');
    if (formPayAuth) {
      formPayAuth.addEventListener('submit', (e) => {
        e.preventDefault();
        const supplierInvoiceId = this.showPaymentAuthInvoiceId;
        const amount = parseFloat(this.container.querySelector('#inp-pay-amount').value) || 0;
        const paymentMethod = this.container.querySelector('#inp-pay-method').value;
        const referenceUtr = this.container.querySelector('#inp-pay-utr').value.trim() || 'N/A';

        try {
          const pay = supplierPaymentModel.recordDisbursement({
            supplierInvoiceId,
            amount,
            paymentMethod,
            referenceUtr,
            paidBy: 'Finance Manager'
          });

          this.showPaymentAuthInvoiceId = null;
          alert(`💳 Vendor Payment Disbursement ${pay.paymentNumber} recorded! Journal entry AP_PAYMENT_DISBURSED generated.`);
          this.updateContent();
        } catch (err) {
          alert(`❌ Payment Disbursement Error: ${err.message}`);
        }
      });
    }

    // Inspect traceability buttons
    this.container.querySelectorAll('.btn-inspect-traceability').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedSalesInvoiceNumber = null;
        this.selectedTraceabilitySessionId = btn.dataset.sessionId;
        this.updateContent();
      });
    });

    // Close traceability modal
    ['#btn-close-traceability-modal', '#btn-close-traceability-modal-footer'].forEach(selector => {
      const btn = this.container.querySelector(selector);
      if (btn) {
        btn.addEventListener('click', () => {
          this.selectedTraceabilitySessionId = null;
          this.updateContent();
        });
      }
    });

    // Export buttons
    const btnExportGst = this.container.querySelector('.btn-do-export-gst');
    if (btnExportGst) {
      btnExportGst.addEventListener('click', () => {
        ExportEngine.exportCSV('sales', this.dateFilter);
        alert(`📄 GST Tax Register exported as CSV!`);
      });
    }

    const btnExport = this.container.querySelector('#btn-do-generate-export');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        const domain = this.container.querySelector('#select-export-domain').value;
        const period = this.container.querySelector('#select-export-period').value;
        const format = this.container.querySelector('input[name="exportFormat"]:checked').value;
        this.triggerPackageDownload(domain, period, format);
      });
    }

    // Run report buttons
    this.container.querySelectorAll('.btn-run-report').forEach(btn => {
      btn.addEventListener('click', () => {
        const reportId = btn.dataset.reportId;
        alert(`📊 Generating report "${reportId}" for period ${this.dateFilter}...`);
      });
    });
  }

  triggerPackageDownload(domain, period, format) {
    if (format === 'tally') {
      ExportEngine.exportTallyXML(period);
      alert(`🏛️ Tally Prime XML Financial Data Pack (${domain.toUpperCase()}) generated and downloaded!`);
    } else if (format === 'excel' || format === 'json') {
      ExportEngine.exportJSON(domain, period);
      alert(`📊 Financial Data Package (Excel/JSON) generated and downloaded!`);
    } else if (format === 'pdf') {
      ExportEngine.exportPDF(domain, period);
    } else {
      ExportEngine.exportCSV(domain, period);
      alert(`📄 Financial CSV Data Pack generated and downloaded!`);
    }
  }
}
