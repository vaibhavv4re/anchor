/**
 * RestaurantOS Capability - Accountant & CA Financial Workspace (A1)
 * Dedicated workspace for Accountants and Chartered Accountants (CAs).
 * Provides read-only financial audit views, GST reconciliation, complete evidence chain drill-down, and multi-format package exports.
 * Operates purely on accountingProjectionService.js and financialPeriodService.js.
 */

import { accountingProjectionService } from '../../../../../businessos/platform/accounting/accountingProjectionService.js';
import { financialPeriodService } from '../../../../../businessos/platform/accounting/financialPeriodService.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { TaxInvoicePrintModal } from '../../billing/ui/TaxInvoicePrintModal.js';
import { ExportEngine } from '../../../../../businessos/platform/accounting/exportEngine.js';

export class AccountsCaWorkspaceView {
  constructor(deps = {}) {
    this.container = null;
    this.mountEl = null;
    this.activeTab = 'overview'; // 'overview' | 'sales' | 'payments' | 'gst' | 'reconciliation' | 'audit' | 'export'
    this.dateFilter = 'month'; // 'today' | 'yesterday' | 'week' | 'month' | 'all'
    this.searchQuery = '';
    this.selectedTraceabilitySessionId = null;
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
      this.platformEventBus.subscribe('data:changed', refresh)
    ];
  }

  updateContent(sessionUser = null) {
    if (!this.container) return;

    this.container.innerHTML = `
      <!-- TOP FINANCIAL HEADER BAR -->
      <div style="background:var(--bg-surface-1); border-bottom:1px solid var(--border-subtle); padding:16px 24px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="font-size:1.6rem;">📚</div>
          <div>
            <h2 style="margin:0; font-size:1.3rem; font-weight:800; letter-spacing:-0.01em;">Accounts & Compliance Workspace</h2>
            <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Authoritative financial audit, GST reconciliation, evidence chain, and compliance export portal.</p>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <!-- Financial Period Status Pill -->
          ${this.renderPeriodStatusBadge()}

          <!-- Date Filter Controls -->
          ${this.renderDateFilterBar()}
        </div>
      </div>

      <!-- MAIN TAB NAVIGATION BAR -->
      <div style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); padding:0 24px; display:flex; gap:4px; overflow-x:auto;">
        ${this.renderTabButton('overview', '📊 Financial Overview')}
        ${this.renderTabButton('sales', '🧾 Sales Register')}
        ${this.renderTabButton('payments', '💳 Payment Ledger')}
        ${this.renderTabButton('gst', '🧮 GST & Tax')}
        ${this.renderTabButton('reconciliation', '🔍 Reconciliation')}
        ${this.renderTabButton('audit', '📜 Audit Trail')}
        ${this.renderTabButton('export', '📤 Export Center')}
      </div>

      <!-- WORKSPACE VIEWPORT BODY -->
      <div style="flex:1; overflow-y:auto; padding:24px; display:flex; flex-direction:column; gap:24px;">
        ${this.renderActiveTabBody()}
      </div>

      <!-- DRILL-DOWN EVIDENCE CHAIN MODAL -->
      ${this.selectedTraceabilitySessionId ? this.renderTraceabilityModal() : ''}

      <!-- DIAGNOSTIC CAUSE ANALYSIS MODAL -->
      ${this.selectedDiagnosticInvoiceNumber ? this.renderDiagnosticModal() : ''}
    `;

    this.bindEvents();
  }

  renderPeriodStatusBadge() {
    const period = financialPeriodService.getPeriodStatusForDate(new Date());
    const isLocked = period.status === 'LOCKED';

    return `
      <div style="display:flex; align-items:center; gap:8px; background:var(--bg-surface-2); padding:6px 12px; border-radius:8px; border:1px solid var(--border-subtle); font-size:0.8rem;">
        <span style="color:var(--text-muted); font-weight:600;">PERIOD:</span>
        <span style="font-weight:800; color:var(--text-primary);">${period.name || 'Aug 2026'}</span>
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
      <button class="btn-ca-tab ${isActive ? 'active' : ''}" data-tab="${id}" style="padding:12px 18px; font-size:0.85rem; font-weight:700; border:none; background:transparent; border-bottom:3px solid ${isActive ? 'var(--accent-primary)' : 'transparent'}; color:${isActive ? 'var(--accent-primary)' : 'var(--text-secondary)'}; cursor:pointer; transition:all 0.15s ease; white-space:nowrap;">
        ${label}
      </button>
    `;
  }

  renderActiveTabBody() {
    switch (this.activeTab) {
      case 'overview': return this.renderOverviewTab();
      case 'sales': return this.renderSalesRegisterTab();
      case 'payments': return this.renderPaymentLedgerTab();
      case 'gst': return this.renderGstTaxTab();
      case 'reconciliation': return this.renderReconciliationTab();
      case 'audit': return this.renderAuditTrailTab();
      case 'export': return this.renderExportCenterTab();
      default: return this.renderOverviewTab();
    }
  }

  // --- SUBVIEW 1: FINANCIAL OVERVIEW ---
  renderOverviewTab() {
    const overview = accountingProjectionService.getFinancialOverview({ dateFilter: this.dateFilter });

    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <!-- KPI METRICS GRID -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px;">
          <div class="card" style="padding:20px; background:var(--bg-surface-2); border-left:4px solid var(--accent-primary);">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">GROSS INVOICED SALES</div>
            <div style="font-size:1.8rem; font-weight:800; color:var(--accent-primary); margin-top:4px;">₹${overview.grossSales.toFixed(2)}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">${overview.invoiceCount} Issued Tax Invoices</div>
          </div>

          <div class="card" style="padding:20px; background:var(--bg-surface-2); border-left:4px solid var(--status-warning);">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">DISCOUNTS ALLOWED</div>
            <div style="font-size:1.8rem; font-weight:800; color:var(--status-warning); margin-top:4px;">-₹${overview.discountsTotal.toFixed(2)}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">Commercial Allowances</div>
          </div>

          <div class="card" style="padding:20px; background:var(--bg-surface-2); border-left:4px solid #10b981;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">NET TAXABLE SALES</div>
            <div style="font-size:1.8rem; font-weight:800; color:#10b981; margin-top:4px;">₹${overview.taxableAmount.toFixed(2)}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">Base Taxable Revenue</div>
          </div>

          <div class="card" style="padding:20px; background:var(--bg-surface-2); border-left:4px solid #8b5cf6;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">OUTPUT GST (CGST + SGST)</div>
            <div style="font-size:1.8rem; font-weight:800; color:#8b5cf6; margin-top:4px;">₹${(overview.cgstTotal + overview.sgstTotal).toFixed(2)}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">CGST: ₹${overview.cgstTotal.toFixed(2)} | SGST: ₹${overview.sgstTotal.toFixed(2)}</div>
          </div>

          <div class="card" style="padding:20px; background:var(--bg-surface-2); border-left:4px solid #3b82f6;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">SETTLED COLLECTIONS</div>
            <div style="font-size:1.8rem; font-weight:800; color:#3b82f6; margin-top:4px;">₹${overview.totalCollected.toFixed(2)}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">${overview.paymentCount} Payment Receipts</div>
          </div>

          <div class="card" style="padding:20px; background:var(--bg-surface-2); border-left:4px solid ${overview.totalOutstanding > 0 ? 'var(--status-danger)' : 'var(--status-success)'};">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">UNCOLLECTED OUTSTANDING</div>
            <div style="font-size:1.8rem; font-weight:800; color:${overview.totalOutstanding > 0 ? 'var(--status-danger)' : 'var(--status-success)'}; margin-top:4px;">₹${overview.totalOutstanding.toFixed(2)}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">Awaiting Cashier Settlement</div>
          </div>
        </div>

        <!-- COLLECTIONS BREAKDOWN & RECONCILIATION CARD -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
          <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
            <h4 style="margin:0 0 16px; font-size:1.05rem; font-weight:800;">💳 Collections by Payment Method</h4>
            <div style="display:flex; flex-direction:column; gap:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--bg-surface-2); border-radius:8px;">
                <span style="font-weight:700; color:#3b82f6;">📱 UPI / QR Transfer:</span>
                <span style="font-size:1.1rem; font-weight:800; color:var(--text-primary);">₹${overview.collectionsByMethod.UPI.toFixed(2)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--bg-surface-2); border-radius:8px;">
                <span style="font-weight:700; color:#10b981;">💵 Physical Cash:</span>
                <span style="font-size:1.1rem; font-weight:800; color:var(--text-primary);">₹${overview.collectionsByMethod.CASH.toFixed(2)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--bg-surface-2); border-radius:8px;">
                <span style="font-weight:700; color:#8b5cf6;">💳 Credit/Debit Card:</span>
                <span style="font-size:1.1rem; font-weight:800; color:var(--text-primary);">₹${overview.collectionsByMethod.CARD.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle);">
            <h4 style="margin:0 0 16px; font-size:1.05rem; font-weight:800;">🔍 Financial Reconciliation Status</h4>
            <div style="display:flex; flex-direction:column; gap:12px;">
              <div style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid var(--border-subtle);">
                <span>Total Invoiced Revenue:</span> <strong style="font-size:1rem;">₹${overview.grandTotalInvoiced.toFixed(2)}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid var(--border-subtle);">
                <span>Total Settled Receipts:</span> <strong style="font-size:1rem; color:#10b981;">₹${overview.totalCollected.toFixed(2)}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid var(--border-subtle);">
                <span>Reconciliation Discrepancies:</span> <strong style="font-size:1rem; color:${overview.discrepancyCount > 0 ? 'var(--status-danger)' : 'var(--status-success)'};">${overview.discrepancyCount} Issue(s)</strong>
              </div>
              <div style="margin-top:8px; padding:12px; border-radius:8px; background:${overview.isReconciled ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color:${overview.isReconciled ? 'var(--status-success)' : 'var(--status-danger)'}; font-weight:800; font-size:0.9rem; text-align:center;">
                ${overview.isReconciled ? '🟢 100% RECONCILED — ALL INVOICES & PAYMENTS MATCH' : `🔴 RECONCILIATION EXCEPTION — ${overview.discrepancyCount} MISMATCHED RECORD(S)`}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --- SUBVIEW 2: SALES REGISTER ---
  renderSalesRegisterTab() {
    let sales = accountingProjectionService.getSalesRegister({ dateFilter: this.dateFilter });

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      sales = sales.filter(s => s.invoiceNumber.toLowerCase().includes(q) || String(s.tableNumber).includes(q) || s.sessionId.toLowerCase().includes(q));
    }

    return `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h3 style="margin:0; font-size:1.2rem; font-weight:800;">🧾 Sequential Tax Invoice Register</h3>
            <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Immutable statutory sales register derived from issued tax invoices.</p>
          </div>
          <input type="text" id="input-ca-search-sales" class="input-field" placeholder="🔍 Search Invoice # / Session..." value="${this.searchQuery}" style="width:260px; padding:8px 12px; font-size:0.85rem;" />
        </div>

        <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-subtle);">
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                <th style="padding:12px 16px;">Invoice Number</th>
                <th style="padding:12px 16px;">FY</th>
                <th style="padding:12px 16px;">Issued Date/Time</th>
                <th style="padding:12px 16px;">Table</th>
                <th style="padding:12px 16px; text-align:right;">Gross Sales</th>
                <th style="padding:12px 16px; text-align:right;">Discounts</th>
                <th style="padding:12px 16px; text-align:right;">Taxable Value</th>
                <th style="padding:12px 16px; text-align:right;">CGST (2.5%)</th>
                <th style="padding:12px 16px; text-align:right;">SGST (2.5%)</th>
                <th style="padding:12px 16px; text-align:right;">Grand Total</th>
                <th style="padding:12px 16px; text-align:center;">Evidence Chain</th>
              </tr>
            </thead>
            <tbody>
              ${sales.length > 0 ? sales.map(s => `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:12px 16px; font-weight:800; color:var(--accent-primary);">${s.invoiceNumber}</td>
                  <td style="padding:12px 16px; color:var(--text-muted);">${s.financialYear}</td>
                  <td style="padding:12px 16px; color:var(--text-muted);">${new Date(s.issuedAt).toLocaleDateString([], { month:'short', day:'numeric' })} ${new Date(s.issuedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</td>
                  <td style="padding:12px 16px; font-weight:700;">Table ${s.tableNumber}</td>
                  <td style="padding:12px 16px; text-align:right;">₹${s.grossSales.toFixed(2)}</td>
                  <td style="padding:12px 16px; text-align:right; color:var(--status-warning);">-${s.discountsTotal > 0 ? '₹' + s.discountsTotal.toFixed(2) : '—'}</td>
                  <td style="padding:12px 16px; text-align:right; font-weight:700;">₹${s.taxableAmount.toFixed(2)}</td>
                  <td style="padding:12px 16px; text-align:right; color:var(--text-muted);">₹${s.cgstAmount.toFixed(2)}</td>
                  <td style="padding:12px 16px; text-align:right; color:var(--text-muted);">₹${s.sgstAmount.toFixed(2)}</td>
                  <td style="padding:12px 16px; text-align:right; font-weight:800; color:var(--text-primary);">₹${s.grandTotal.toFixed(2)}</td>
                  <td style="padding:12px 16px; text-align:center;">
                    <button class="btn-secondary btn-inspect-traceability" data-session-id="${s.sessionId}" style="padding:4px 10px; font-size:0.75rem; font-weight:700;">🔍 Inspect Chain</button>
                  </td>
                </tr>
              `).join('') : `
                <tr><td colspan="11" style="padding:24px; text-align:center; color:var(--text-muted);">No sales invoices found for selected period (${this.dateFilter.toUpperCase()}).</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --- SUBVIEW 3: PAYMENT LEDGER ---
  renderPaymentLedgerTab() {
    const payments = accountingProjectionService.getPaymentLedger({ dateFilter: this.dateFilter });

    return `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">💳 Immutable Payments Settlement Ledger</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Authoritative financial receipts ledger for cash, UPI, and card settlements.</p>
        </div>

        <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-subtle);">
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                <th style="padding:12px 16px;">Payment ID</th>
                <th style="padding:12px 16px;">Invoice Number</th>
                <th style="padding:12px 16px;">Table</th>
                <th style="padding:12px 16px; text-align:center;">Method</th>
                <th style="padding:12px 16px;">Reference No.</th>
                <th style="padding:12px 16px; text-align:right;">Amount Settled</th>
                <th style="padding:12px 16px;">Cashier</th>
                <th style="padding:12px 16px; text-align:right;">Settlement Time</th>
              </tr>
            </thead>
            <tbody>
              ${payments.length > 0 ? payments.map(p => `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:12px 16px; font-family:monospace; color:var(--text-muted);">${p.paymentId}</td>
                  <td style="padding:12px 16px; font-weight:800; color:var(--accent-primary);">${p.invoiceNumber}</td>
                  <td style="padding:12px 16px; font-weight:700;">Table ${p.tableNumber}</td>
                  <td style="padding:12px 16px; text-align:center;"><span class="badge badge-success">${p.paymentMethod}</span></td>
                  <td style="padding:12px 16px; font-size:0.8rem; color:var(--text-muted);">${p.referenceNo}</td>
                  <td style="padding:12px 16px; text-align:right; font-weight:800; color:var(--status-success);">₹${p.amount.toFixed(2)}</td>
                  <td style="padding:12px 16px; font-weight:600;">${p.receivedByName}</td>
                  <td style="padding:12px 16px; text-align:right; color:var(--text-muted);">${new Date(p.receivedAt).toLocaleDateString([], { month:'short', day:'numeric' })} ${new Date(p.receivedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</td>
                </tr>
              `).join('') : `
                <tr><td colspan="8" style="padding:24px; text-align:center; color:var(--text-muted);">No payment records found for selected period (${this.dateFilter.toUpperCase()}).</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --- SUBVIEW 4: GST & TAX ---
  renderGstTaxTab() {
    const gst = accountingProjectionService.getGstSummary({ dateFilter: this.dateFilter });

    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">🧮 SAC 996331 GST Reconciliation Report</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Official Indian GST Filing Report for Restaurant & Catering Services.</p>
        </div>

        <div class="card" style="padding:24px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); max-width:640px;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--border-subtle); padding-bottom:12px; margin-bottom:16px;">
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">SERVICE ACCOUNTING CODE</div>
              <div style="font-size:1.2rem; font-weight:800; color:var(--accent-primary);">SAC ${gst.sacCode} — ${gst.sacDescription}</div>
            </div>
            <span class="badge badge-success" style="font-weight:800;">GSTIN COMPLIANT</span>
          </div>

          <div style="display:flex; flex-direction:column; gap:10px; font-size:0.9rem;">
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-subtle); padding-bottom:6px;">
              <span>Gross Commercial Sales Turnover:</span> <strong>₹${gst.grossSales.toFixed(2)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-subtle); padding-bottom:6px; color:var(--status-warning);">
              <span>Less Total Commercial Discounts:</span> <strong>-₹${gst.discountsTotal.toFixed(2)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-subtle); padding-bottom:6px; font-weight:800; font-size:1rem; color:#10b981;">
              <span>Net Taxable Sales Turnover:</span> <span>₹${gst.netTaxableValue.toFixed(2)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-subtle); padding-bottom:6px;">
              <span>Output CGST (2.5% Rate):</span> <strong>₹${gst.outputCgst.toFixed(2)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-subtle); padding-bottom:6px;">
              <span>Output SGST (2.5% Rate):</span> <strong>₹${gst.outputSgst.toFixed(2)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-subtle); padding-bottom:6px;">
              <span>Service Charge Collected (5%):</span> <strong>₹${gst.serviceChargeTotal.toFixed(2)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-weight:900; font-size:1.1rem; color:var(--accent-primary); padding-top:8px;">
              <span>Total Output GST Liability:</span> <span>₹${gst.totalGstLiability.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --- SUBVIEW 5: RECONCILIATION ---
  renderReconciliationTab() {
    const recon = accountingProjectionService.getReconciliation({ dateFilter: this.dateFilter });

    const matchedCount = recon.matchedCount || 0;
    const partialCount = (recon.mismatches || []).filter(m => m.type === 'PARTIAL_PAYMENT').length;
    const exceptionCount = (recon.mismatches || []).filter(m => m.type !== 'PARTIAL_PAYMENT' && m.type !== 'DUPLICATE_INVOICE_NO').length;
    const systemErrorCount = (recon.mismatches || []).filter(m => m.type === 'DUPLICATE_INVOICE_NO').length;

    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">🔍 Automated Invoice-Level Financial Reconciliation Engine</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Reconciles Invoiced Revenue vs Settled Receipts at Invoice level with 8 distinct exception categories.</p>
        </div>

        <!-- RECONCILIATION SUMMARY KPI BAR -->
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:16px;">
          <div class="card" style="padding:16px; background:var(--bg-surface-2); border-left:4px solid var(--status-success);">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">MATCHED TRANSACTIONS</div>
            <div style="font-size:1.8rem; font-weight:800; color:var(--status-success); margin-top:4px;">${matchedCount}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">🟢 100% Reconciled</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-2); border-left:4px solid var(--status-warning);">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">PARTIAL PAYMENTS</div>
            <div style="font-size:1.8rem; font-weight:800; color:var(--status-warning); margin-top:4px;">${partialCount}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">🟠 Undercollected Amounts</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-2); border-left:4px solid var(--status-danger);">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">EXCEPTIONS & OVERPAYMENTS</div>
            <div style="font-size:1.8rem; font-weight:800; color:var(--status-danger); margin-top:4px;">${exceptionCount}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">🔴 Action Required</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-2); border-left:4px solid #a855f7;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">SYSTEM ANOMALIES</div>
            <div style="font-size:1.8rem; font-weight:800; color:#a855f7; margin-top:4px;">${systemErrorCount}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">⚠️ Sequence Collisions</div>
          </div>
        </div>

        <!-- EXCEPTION LOG TABLE -->
        <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-subtle);">
          <div style="padding:14px 20px; background:var(--bg-surface-2); font-weight:800; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
            <span>Reconciliation Log (${recon.allResults ? recon.allResults.length : 0} Financial Invoices Evaluated)</span>
            <span style="font-size:0.85rem; color:var(--text-muted);">Total Invoiced: ₹${recon.totalInvoicedAmount.toFixed(2)} | Total Settled: ₹${recon.totalSettledAmount.toFixed(2)}</span>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                <th style="padding:12px 16px;">Reconciliation Category</th>
                <th style="padding:12px 16px;">Invoice Number</th>
                <th style="padding:12px 16px;">Table</th>
                <th style="padding:12px 16px; text-align:right;">Expected Invoiced</th>
                <th style="padding:12px 16px; text-align:right;">Settled Receipts</th>
                <th style="padding:12px 16px; text-align:right;">Difference</th>
                <th style="padding:12px 16px; text-align:center;">Actions & Investigation</th>
              </tr>
            </thead>
            <tbody>
              ${recon.mismatches.length > 0 ? recon.mismatches.map(m => {
                const isProposed = m.workflowStatus === 'PROPOSED_RESOLUTION';
                const isFlagged = m.workflowStatus === 'FLAGGED' || m.workflowStatus === 'REJECTED_BY_CA';
                const exc = m.exceptionRecord || {};

                return `
                <tr style="border-bottom:1px solid var(--border-subtle); background:${isProposed ? 'rgba(245,158,11,0.08)' : (isFlagged ? 'rgba(239,68,68,0.05)' : 'transparent')};">
                  <td style="padding:12px 16px;">
                    <div style="display:flex; flex-direction:column; gap:4px;">
                      <span class="badge ${isProposed ? 'badge-warning' : 'badge-danger'}" style="font-weight:800; font-size:0.75rem;">
                        ${isProposed ? '🟡 PROPOSED RESOLUTION' : (isFlagged ? '🚩 FLAGGED FOR REVIEW' : m.type)}
                      </span>
                      ${isProposed ? `<div style="font-size:0.7rem; color:var(--text-muted);">Manager: ${exc.resolutionReason || 'Resolution Submitted'}</div>` : ''}
                    </div>
                  </td>
                  <td style="padding:12px 16px; font-weight:800; color:var(--accent-primary);">${m.invoiceNumber}</td>
                  <td style="padding:12px 16px; font-weight:700;">Table ${m.tableNumber}</td>
                  <td style="padding:12px 16px; text-align:right;">₹${m.invoicedAmount.toFixed(2)}</td>
                  <td style="padding:12px 16px; text-align:right;">₹${m.settledAmount.toFixed(2)}</td>
                  <td style="padding:12px 16px; text-align:right; font-weight:800; color:${m.difference > 0 ? 'var(--status-danger)' : 'var(--status-warning)'};">
                    ${m.difference > 0 ? '+' : ''}₹${m.difference.toFixed(2)}
                  </td>
                  <td style="padding:12px 16px; text-align:center;">
                    <div style="display:flex; justify-content:center; gap:6px; flex-wrap:wrap;">
                      <button class="btn-secondary btn-inspect-why" data-inv-number="${m.invoiceNumber}" style="padding:4px 8px; font-size:0.75rem; font-weight:700;">❓ Evidence</button>
                      
                      ${isProposed ? `
                        <button class="btn-primary btn-ca-accept-resolution" data-exc-id="${exc.id}" data-inv-number="${m.invoiceNumber}" style="padding:4px 10px; font-size:0.75rem; font-weight:800; background:#10b981; color:#fff; border:none; border-radius:4px; cursor:pointer;">
                          ✅ Accept & Reconcile
                        </button>
                        <button class="btn-secondary btn-ca-reject-resolution" data-exc-id="${exc.id}" data-inv-number="${m.invoiceNumber}" style="padding:4px 8px; font-size:0.75rem; font-weight:700; color:#ef4444; border-color:#ef4444;">
                          ❌ Reject
                        </button>
                      ` : (isFlagged ? `
                        <span class="badge badge-danger" style="font-size:0.7rem; padding:4px 8px;">⏳ Awaiting Manager Action</span>
                      ` : `
                        <button class="btn-primary btn-flag-manager" data-inv-number="${m.invoiceNumber}" data-inv-amt="${m.invoicedAmount}" data-set-amt="${m.settledAmount}" data-diff="${m.difference}" data-type="${m.type}" data-sess="${m.sessionId}" style="padding:4px 10px; font-size:0.75rem; font-weight:700; background:var(--status-warning); color:#000; border:none; border-radius:4px; cursor:pointer;">🚩 Flag for Manager</button>
                      `)}
                    </div>
                  </td>
                </tr>
              `;
              }).join('') : `
                <tr><td colspan="7" style="padding:24px; text-align:center; color:var(--status-success); font-weight:800;">🟢 100% RECONCILED — ALL INVOICES & PAYMENTS MATCH EXACTLY!</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --- SUBVIEW 6: AUDIT TRAIL ---
  renderAuditTrailTab() {
    const logs = accountingProjectionService.getAuditTrail({ dateFilter: this.dateFilter });

    return `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">📜 Append-Only CA Financial Audit Log</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Chronological evidence chain of all guest seated, order, revision, recall, invoice, and payment events.</p>
        </div>

        <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-subtle);">
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                <th style="padding:12px 16px;">Timestamp</th>
                <th style="padding:12px 16px;">Event Type</th>
                <th style="padding:12px 16px;">Session ID</th>
                <th style="padding:12px 16px;">Table</th>
                <th style="padding:12px 16px;">Actor Role</th>
                <th style="padding:12px 16px;">Description</th>
              </tr>
            </thead>
            <tbody>
              ${logs.length > 0 ? logs.map(l => `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:12px 16px; color:var(--text-muted); font-size:0.8rem;">${new Date(l.timestamp).toLocaleString()}</td>
                  <td style="padding:12px 16px;"><span class="badge badge-info">${l.eventType}</span></td>
                  <td style="padding:12px 16px; font-family:monospace; color:var(--text-muted);">${l.sessionId}</td>
                  <td style="padding:12px 16px; font-weight:700;">Table ${l.tableNumber || 1}</td>
                  <td style="padding:12px 16px; font-weight:600;">${l.actorRole || 'SYSTEM'}</td>
                  <td style="padding:12px 16px; font-size:0.82rem;">${l.description}</td>
                </tr>
              `).join('') : `
                <tr><td colspan="6" style="padding:24px; text-align:center; color:var(--text-muted);">No audit log entries found for selected period (${this.dateFilter.toUpperCase()}).</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --- SUBVIEW 7: EXPORT CENTER ---
  renderExportCenterTab() {
    return `
      <div style="display:flex; flex-direction:column; gap:20px; max-width:720px;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">📤 Financial Export Package Center</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Package complete sales registers, tax summaries, payment ledgers, and audit logs into multi-format files.</p>
        </div>

        <div class="card" style="padding:24px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:20px;">
          <div>
            <label style="font-weight:700; font-size:0.85rem; color:var(--text-secondary); display:block; margin-bottom:8px;">1. SELECT FINANCIAL PERIOD</label>
            <select id="select-export-period" class="input-field" style="width:100%; padding:10px 12px; font-size:0.9rem;">
              <option value="month">Aug 01 – Aug 31, 2026 (Current Financial Period)</option>
              <option value="week">Past 7 Days</option>
              <option value="today">Today Only</option>
              <option value="all">Complete All-Time Historical Ledger</option>
            </select>
          </div>

          <div>
            <label style="font-weight:700; font-size:0.85rem; color:var(--text-secondary); display:block; margin-bottom:8px;">2. SELECT INCLUDED DATASETS</label>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; cursor:pointer;"><input type="checkbox" checked disabled /> ☑ Issued Tax Sales Register</label>
              <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; cursor:pointer;"><input type="checkbox" checked disabled /> ☑ Immutable Payments Ledger</label>
              <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; cursor:pointer;"><input type="checkbox" checked disabled /> ☑ SAC 996331 GST Filing Report</label>
              <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; cursor:pointer;"><input type="checkbox" checked disabled /> ☑ Commercial Discounts Register</label>
              <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; cursor:pointer;"><input type="checkbox" checked disabled /> ☑ Financial Reconciliation Log</label>
              <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; cursor:pointer;"><input type="checkbox" checked disabled /> ☑ CA Audit Event Trail</label>
            </div>
          </div>

          <div>
            <label style="font-weight:700; font-size:0.85rem; color:var(--text-secondary); display:block; margin-bottom:8px;">3. SELECT EXPORT FORMAT</label>
            <div style="display:flex; gap:16px; flex-wrap:wrap;">
              <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; font-weight:700; cursor:pointer;">
                <input type="radio" name="exportFormat" value="csv" checked /> 📄 CSV Package
              </label>
              <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; font-weight:700; cursor:pointer;">
                <input type="radio" name="exportFormat" value="excel" /> 📊 Excel (.xlsx) Workbook
              </label>
              <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; font-weight:700; cursor:pointer;">
                <input type="radio" name="exportFormat" value="tally" /> 🏛️ Tally-Compatible Package
              </label>
            </div>
          </div>

          <button id="btn-do-generate-export" class="btn-primary" style="padding:12px 20px; font-size:0.95rem; font-weight:800; background:var(--accent-primary); color:#000; border:none; border-radius:8px; cursor:pointer; margin-top:8px;">
            📦 Generate & Download Accounting Package
          </button>
        </div>
      </div>
    `;
  }

  // --- TRACEABILITY EVIDENCE CHAIN MODAL ---
  renderTraceabilityModal() {
    const trace = accountingProjectionService.getInvoiceTraceability(this.selectedTraceabilitySessionId);

    return `
      <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999; backdrop-filter:blur(4px);">
        <div class="card animate-fade-in" style="width:90%; max-width:800px; max-height:85vh; overflow-y:auto; padding:24px; background:var(--bg-surface-1); border-radius:12px;">
          
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:12px; margin-bottom:16px;">
            <h3 style="margin:0; font-size:1.2rem; font-weight:800; display:flex; align-items:center; gap:8px;">
              <span>🔍</span> Financial Evidence Chain — Session ${trace.sessionId}
            </h3>
            <button id="btn-close-traceability-modal" class="btn-secondary" style="padding:4px 10px; font-weight:700;">✕ Close</button>
          </div>

          <div style="display:flex; flex-direction:column; gap:16px; font-size:0.85rem;">
            <!-- INVOICE METRICS -->
            <div style="padding:12px; background:var(--bg-surface-2); border-radius:8px; display:flex; justify-content:space-between;">
              <div>
                <div><strong>INVOICE NO:</strong> ${trace.invoice ? trace.invoice.invoiceNumber : 'DRAFT'}</div>
                <div><strong>TABLE:</strong> Table ${trace.invoice ? trace.invoice.tableNumber : 1}</div>
              </div>
              <div style="text-align:right;">
                <div><strong>GRAND TOTAL:</strong> ₹${trace.invoice ? trace.invoice.grandTotal.toFixed(2) : '0.00'}</div>
                <div><strong>PAYMENTS:</strong> ${trace.payments.length} Receipt(s)</div>
              </div>
            </div>

            <!-- BILL REVISION HISTORY -->
            <div>
              <h4 style="margin:0 0 8px; font-weight:800;">1. Bill Revision Lifecycle History (${trace.revisions.length} Revision(s))</h4>
              <div style="display:flex; flex-direction:column; gap:6px;">
                ${trace.revisions.map(r => `
                  <div style="padding:8px 12px; background:var(--bg-surface-2); border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                    <span>Revision #${r.revisionNumber || 1} (${r.billNumber})</span>
                    <span>₹${(r.grandTotal || r.subtotal || 0).toFixed(2)}</span>
                    <span class="badge ${r.revisionStatus === 'RECALLED' ? 'badge-danger' : 'badge-success'}">${r.revisionStatus || 'ACCEPTED'}</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- PAYMENT RECEIPTS -->
            <div>
              <h4 style="margin:0 0 8px; font-weight:800;">2. Settled Payment Receipts (${trace.payments.length} Receipt(s))</h4>
              <div style="display:flex; flex-direction:column; gap:6px;">
                ${trace.payments.map(p => `
                  <div style="padding:8px 12px; background:var(--bg-surface-2); border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                    <span>Payment ${p.paymentId || p.id} (${p.paymentMethod})</span>
                    <span style="font-weight:800; color:var(--status-success);">₹${p.amount.toFixed(2)}</span>
                    <span class="badge badge-success">${p.status || 'SETTLED'}</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- CHRONOLOGICAL AUDIT LOGS -->
            <div>
              <h4 style="margin:0 0 8px; font-weight:800;">3. Chronological CA Event Audit Logs (${trace.auditLogs.length} Events)</h4>
              <div style="display:flex; flex-direction:column; gap:6px; max-height:200px; overflow-y:auto;">
                ${trace.auditLogs.map(a => `
                  <div style="padding:6px 10px; background:var(--bg-surface-2); border-radius:4px; font-size:0.8rem; display:flex; gap:12px;">
                    <span style="color:var(--text-muted);">${new Date(a.timestamp).toLocaleTimeString()}</span>
                    <span style="font-weight:700; color:var(--accent-primary);">${a.eventType}:</span>
                    <span>${a.description}</span>
                  </div>
                `).join('')}
              </div>
            </div>

          </div>
        </div>
      </div>
    `;
  }

  renderDiagnosticModal() {
    const recon = accountingProjectionService.getReconciliation({ dateFilter: this.dateFilter });
    const mismatch = (recon.mismatches || []).find(m => m.invoiceNumber === this.selectedDiagnosticInvoiceNumber);
    if (!mismatch) return '';

    return `
      <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:9999; backdrop-filter:blur(4px);">
        <div class="card animate-fade-in" style="width:90%; max-width:680px; padding:24px; background:var(--bg-surface-1); border-radius:12px; border:1px solid var(--border-subtle);">
          
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:12px; margin-bottom:16px;">
            <h3 style="margin:0; font-size:1.2rem; font-weight:800; color:var(--status-danger); display:flex; align-items:center; gap:8px;">
              <span>❓</span> Reconciliation Diagnostic Analysis — ${mismatch.invoiceNumber}
            </h3>
            <button id="btn-close-diagnostic-modal" class="btn-secondary" style="padding:4px 10px; font-weight:700;">✕ Close</button>
          </div>

          <div style="display:flex; flex-direction:column; gap:16px; font-size:0.85rem;">
            <div style="padding:14px; background:var(--bg-surface-2); border-radius:8px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; text-align:center;">
              <div>
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">EXPECTED INVOICED</div>
                <div style="font-size:1.4rem; font-weight:800; color:var(--accent-primary); margin-top:2px;">₹${mismatch.invoicedAmount.toFixed(2)}</div>
              </div>
              <div>
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">COLLECTED PAYMENTS</div>
                <div style="font-size:1.4rem; font-weight:800; color:#10b981; margin-top:2px;">₹${mismatch.settledAmount.toFixed(2)}</div>
              </div>
              <div>
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">DIFFERENCE DELTA</div>
                <div style="font-size:1.4rem; font-weight:800; color:var(--status-danger); margin-top:2px;">${mismatch.difference > 0 ? '+' : ''}₹${mismatch.difference.toFixed(2)}</div>
              </div>
            </div>

            <div>
              <h4 style="margin:0 0 8px; font-weight:800;">🔍 Diagnostic Root Cause Analysis</h4>
              <div style="padding:12px; background:rgba(239,68,68,0.1); border-left:4px solid var(--status-danger); border-radius:6px;">
                <div style="font-weight:800; color:var(--status-danger); margin-bottom:4px;">EXCEPTION TYPE: ${mismatch.type}</div>
                <ul style="margin:0; padding-left:20px; color:var(--text-primary); line-height:1.5;">
                  ${(mismatch.possibleCauses || []).map(c => `<li>${c}</li>`).join('')}
                </ul>
              </div>
            </div>

            <div>
              <h4 style="margin:0 0 8px; font-weight:800;">💳 Linked Payment Receipts (${mismatch.linkedPaymentCount})</h4>
              <div style="display:flex; flex-direction:column; gap:6px;">
                ${(mismatch.linkedPayments || []).length > 0 ? mismatch.linkedPayments.map(p => `
                  <div style="padding:8px 12px; background:var(--bg-surface-2); border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                    <span>Payment ID: <code>${p.paymentId || p.id}</code> (${p.paymentMethod})</span>
                    <span>Ref: ${p.referenceNo || '—'}</span>
                    <span style="font-weight:800; color:var(--status-success);">₹${(p.amount || 0).toFixed(2)}</span>
                  </div>
                `).join('') : '<div style="color:var(--text-muted);">No payment receipts linked to this invoice.</div>'}
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-subtle); padding-top:16px; margin-top:8px;">
              <button class="btn-secondary btn-inspect-traceability" data-session-id="${mismatch.sessionId}" style="padding:8px 14px; font-weight:700;">🔍 View Full Evidence Chain</button>
              <button class="btn-primary btn-flag-manager" data-inv-number="${mismatch.invoiceNumber}" data-inv-amt="${mismatch.invoicedAmount}" data-set-amt="${mismatch.settledAmount}" data-diff="${mismatch.difference}" data-type="${mismatch.type}" data-sess="${mismatch.sessionId}" style="padding:8px 16px; font-weight:800; background:var(--status-warning); color:#000; border:none; border-radius:6px; cursor:pointer;">🚩 Flag for Manager Review</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    if (!this.container) return;

    // Tab buttons
    this.container.querySelectorAll('.btn-ca-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.updateContent();
      });
    });

    // Date filter buttons
    this.container.querySelectorAll('.btn-ca-date-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        this.dateFilter = btn.dataset.dateFilter;
        this.updateContent();
      });
    });

    // Lock period button
    const btnLock = this.container.querySelector('#btn-lock-period');
    if (btnLock) {
      btnLock.addEventListener('click', () => {
        const periodId = financialPeriodService.getPeriodIdForDate(new Date());
        financialPeriodService.lockPeriod(periodId, 'CA Administrator');
        alert(`Financial Period ${periodId} has been successfully LOCKED. Retrospective mutations are now prohibited.`);
        this.updateContent();
      });
    }

    // Inspect "Why is this wrong?" buttons
    this.container.querySelectorAll('.btn-inspect-why').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedDiagnosticInvoiceNumber = btn.dataset.invNumber;
        this.updateContent();
      });
    });

    // Close diagnostic modal
    const btnCloseDiag = this.container.querySelector('#btn-close-diagnostic-modal');
    if (btnCloseDiag) {
      btnCloseDiag.addEventListener('click', () => {
        this.selectedDiagnosticInvoiceNumber = null;
        this.updateContent();
      });
    }

    // Flag for Manager Review buttons
    this.container.querySelectorAll('.btn-flag-manager').forEach(btn => {
      btn.addEventListener('click', () => {
        const invNumber = btn.dataset.invNumber;
        const type = btn.dataset.type;
        const invAmt = parseFloat(btn.dataset.invAmt) || 0;
        const setAmt = parseFloat(btn.dataset.setAmt) || 0;
        const diff = parseFloat(btn.dataset.diff) || 0;
        const sess = btn.dataset.sess;

        const exc = accountingProjectionService.flagException({
          invoiceNumber: invNumber,
          sessionId: sess,
          type,
          invoicedAmount: invAmt,
          settledAmount: setAmt,
          difference: diff
        }, 'CA Auditor');

        alert(`🚩 Discrepancy ${exc.exceptionId} (${type}) for invoice ${invNumber} has been FLAGGED for Manager Review!\n\nOriginal financial records remain 100% immutable while Manager investigates complete evidence chain.`);
        this.selectedDiagnosticInvoiceNumber = null;
        this.updateContent();
      });
    });

    // CA Accept Proposed Resolution
    this.container.querySelectorAll('.btn-ca-accept-resolution').forEach(btn => {
      btn.addEventListener('click', () => {
        const excId = btn.dataset.excId;
        const invNo = btn.dataset.invNumber;

        accountingProjectionService.acceptResolution(excId, 'CA Auditor');
        alert(`✅ Discrepancy for ${invNo} accepted and marked RESOLVED & RECONCILED!`);
        this.updateContent();
      });
    });

    // CA Reject Proposed Resolution
    this.container.querySelectorAll('.btn-ca-reject-resolution').forEach(btn => {
      btn.addEventListener('click', () => {
        const excId = btn.dataset.excId;
        const invNo = btn.dataset.invNumber;
        const reason = prompt(`Reject Proposed Resolution for ${invNo}:\nEnter Rejection Reason:`, 'Payment reference not found in bank statement');
        if (!reason) return;

        accountingProjectionService.rejectResolution(excId, reason, 'CA Auditor');
        alert(`❌ Resolution for ${invNo} rejected and returned to Manager Queue with CA notes.`);
        this.updateContent();
      });
    });

    // Inspect traceability buttons
    this.container.querySelectorAll('.btn-inspect-traceability').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedDiagnosticInvoiceNumber = null;
        this.selectedTraceabilitySessionId = btn.dataset.sessionId;
        this.updateContent();
      });
    });

    // Close traceability modal
    const btnCloseTrace = this.container.querySelector('#btn-close-traceability-modal');
    if (btnCloseTrace) {
      btnCloseTrace.addEventListener('click', () => {
        this.selectedTraceabilitySessionId = null;
        this.updateContent();
      });
    }

    // Generate Export button
    const btnExport = this.container.querySelector('#btn-do-generate-export');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        const period = this.container.querySelector('#select-export-period').value;
        const format = this.container.querySelector('input[name="exportFormat"]:checked').value;
        this.triggerPackageDownload(period, format);
      });
    }
  }

  triggerPackageDownload(period, format) {
    if (format === 'tally') {
      ExportEngine.exportTallyXML(period);
      alert(`🏛️ Tally Prime XML Sales & Receipt Voucher Package generated and downloaded!`);
    } else if (format === 'excel' || format === 'json') {
      ExportEngine.exportJSON('all', period);
      alert(`📊 Financial Data Package (Excel/JSON) generated and downloaded!`);
    } else if (format === 'pdf') {
      ExportEngine.exportPDF('all', period);
    } else {
      ExportEngine.exportCSV('all', period);
      alert(`📄 Financial CSV Sales & Payment Package generated and downloaded!`);
    }
  }
}
