/**
 * RestaurantOS - Phase M7: Manager Reports & Day Summary View
 * End-of-Shift / Historical Reporting Layer.
 * Explains every number directly from persistent accounting ledgers (Invoices, Payments, Audit Logs).
 * ZERO calculation from transient table/session state.
 */

import { managerProjectionService } from '../../../../../businessos/platform/manager/managerProjectionService.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

export class ReportsDaySummaryView {
  constructor(deps = {}) {
    this.tenantId = deps.tenantId || null;
    this.container = null;
    this.activeReportTab = 'sales_summary';
    this.unsubscribeEvents = [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'reports-day-summary-view flex-col gap-lg animate-fade-in';
    this.container.style.width = '100%';

    this.updateContent();

    return this.container;
  }

  refresh() {
    this.updateContent();
  }

  destroy() {
    (this.unsubscribeEvents || []).forEach(u => { if (typeof u === 'function') u(); });
    this.unsubscribeEvents = [];
  }

  updateContent() {
    if (!this.container) return;

    const data = managerProjectionService.getReportsDaySummaryProjection(this.tenantId);
    const ss = data.salesSummary;
    const pr = data.paymentReconciliation;
    const os = data.operationsSummary;
    const audit = data.auditLedger;

    const formatCurrency = (val) => '₹' + Number(val || 0).toLocaleString('en-IN');

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h2 style="font-size:1.5rem; margin:0;">📈 Reports & Day Summary (Phase M7)</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Financial Reporting Layer • Derived 100% from Accounting & Audit Ledgers • Explain Every Number</p>
        </div>
        <button class="btn-secondary" id="btn-export-day-summary" style="font-size:0.85rem; padding:6px 14px; color:var(--accent-primary); border-color:var(--accent-primary);">
          📥 Export Day Summary Report
        </button>
      </div>

      <!-- Report Tab Navigation Bar -->
      <div style="display:flex; gap:8px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px; margin-bottom:20px; flex-wrap:wrap;">
        <button class="btn-secondary report-tab-btn ${this.activeReportTab === 'sales_summary' ? 'active' : ''}" data-tab="sales_summary" style="padding:8px 14px; font-size:0.85rem;">
          📊 1. Sales Summary Report
        </button>
        <button class="btn-secondary report-tab-btn ${this.activeReportTab === 'payment_recon' ? 'active' : ''}" data-tab="payment_recon" style="padding:8px 14px; font-size:0.85rem;">
          💳 2. Payment Recon & Cash Drawer
        </button>
        <button class="btn-secondary report-tab-btn ${this.activeReportTab === 'ops_summary' ? 'active' : ''}" data-tab="ops_summary" style="padding:8px 14px; font-size:0.85rem;">
          ⚡ 3. Operations Summary
        </button>
        <button class="btn-secondary report-tab-btn ${this.activeReportTab === 'audit_events' ? 'active' : ''}" data-tab="audit_events" style="padding:8px 14px; font-size:0.85rem;">
          📜 4. Audit & Financial Events Ledger (${audit.length})
        </button>
        <button class="btn-secondary report-tab-btn ${this.activeReportTab === 'cancellation_waste' ? 'active' : ''}" data-tab="cancellation_waste" style="padding:8px 14px; font-size:0.85rem;">
          🧊 5. Cancellation & Waste
        </button>
      </div>

      <!-- Active Report Content View -->
      <div id="report-content-body">
        ${this.renderActiveReportTab(ss, pr, os, audit, formatCurrency)}
      </div>
    `;

    this.bindEvents();
  }

  renderActiveReportTab(ss, pr, os, audit, formatCurrency) {
    // Tax labels are config-driven (from taxConfigurationModel via the projection), not hardcoded.
    const rates = managerProjectionService.getTaxRates(this.tenantId);
    const dash = (v) => (v === null || v === undefined) ? '—' : v;
    const money = (v) => (v === null || v === undefined) ? '—' : formatCurrency(v);

    if (this.activeReportTab === 'sales_summary') {
      return `
        <div class="card" style="padding:20px; background:var(--bg-surface-1);">
          <h3 style="margin-top:0; font-size:1.15rem; border-bottom:1px solid var(--border-subtle); padding-bottom:10px;">
            📊 Shift Financial Sales Summary Report
          </h3>
          <div class="grid grid-cols-3 gap-md" style="margin-top:16px;">
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">GROSS SALES</span>
              <strong style="font-size:1.5rem; display:block; color:var(--text-primary); margin-top:4px;">${formatCurrency(ss.grossSales)}</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">DISCOUNTS</span>
              <strong style="font-size:1.5rem; display:block; color:#ef4444; margin-top:4px;">-${formatCurrency(ss.discounts)}</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">NET TAXABLE SALES</span>
              <strong style="font-size:1.5rem; display:block; color:var(--accent-primary); margin-top:4px;">${formatCurrency(ss.taxableSales)}</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">CGST (${rates.cgstRate}%)</span>
              <strong style="font-size:1.3rem; display:block; color:var(--text-primary); margin-top:4px;">${formatCurrency(ss.cgst)}</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">SGST (${rates.sgstRate}%)</span>
              <strong style="font-size:1.3rem; display:block; color:var(--text-primary); margin-top:4px;">${formatCurrency(ss.sgst)}</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">SERVICE CHARGE (${rates.serviceChargeRate}%)</span>
              <strong style="font-size:1.3rem; display:block; color:var(--text-primary); margin-top:4px;">${formatCurrency(ss.serviceCharge)}</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; border-left:4px solid #3b82f6;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">INVOICED TOTAL</span>
              <strong style="font-size:1.5rem; display:block; color:#3b82f6; margin-top:4px;">${formatCurrency(ss.invoiced)}</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; border-left:4px solid #10b981;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">SETTLED REVENUE</span>
              <strong style="font-size:1.6rem; display:block; color:#10b981; margin-top:4px;">${formatCurrency(ss.settled)}</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; border-left:4px solid #f59e0b;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">OUTSTANDING PENDING</span>
              <strong style="font-size:1.5rem; display:block; color:#f59e0b; margin-top:4px;">${formatCurrency(ss.outstanding)}</strong>
            </div>
          </div>
        </div>
      `;
    } else if (this.activeReportTab === 'payment_recon') {
      const cd = pr.cashDrawer;
      // Honest drawer states: no register opened / counted-but-variance / not-counted-yet.
      let varianceBlock;
      if (!cd.registerOpen) {
        varianceBlock = `
          <div style="display:flex; justify-content:space-between; background:var(--bg-surface-2); color:var(--text-muted); padding:12px 14px; border-radius:6px; font-weight:700; border:1px dashed var(--border-subtle);">
            <span>CASH DRAWER</span>
            <span>No shift register opened</span>
          </div>`;
      } else if (cd.cashVariance === null || cd.cashVariance === undefined) {
        varianceBlock = `
          <div style="display:flex; justify-content:space-between; background:var(--bg-surface-2); color:#f59e0b; padding:12px 14px; border-radius:6px; font-weight:700; border:1px solid #f59e0b;">
            <span>CASH DRAWER VARIANCE</span>
            <span>Not counted yet</span>
          </div>`;
      } else {
        const balanced = cd.cashVariance === 0;
        const tone = balanced ? '#10b981' : '#ef4444';
        varianceBlock = `
          <div style="display:flex; justify-content:space-between; background:${tone}22; color:${tone}; padding:12px 14px; border-radius:6px; font-weight:700; border:1px solid ${tone};">
            <span>CASH DRAWER VARIANCE</span>
            <span>${formatCurrency(cd.cashVariance)} (${balanced ? 'Balanced \uD83D\uDFE2' : (cd.cashVariance > 0 ? 'Over \uD83D\uDD3A' : 'Short \uD83D\uDD34')})</span>
          </div>`;
      }
      return `
        <div class="grid grid-cols-2 gap-md">
          <!-- Payment Mix Table -->
          <div class="card" style="padding:20px; background:var(--bg-surface-1);">
            <h3 style="margin-top:0; font-size:1.1rem; border-bottom:1px solid var(--border-subtle); padding-bottom:10px;">
              💳 Payment Method Settlement Breakdown
            </h3>
            <table class="table" style="width:100%; border-collapse:collapse; font-size:0.85rem; margin-top:10px;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); color:var(--text-muted); font-size:0.75rem;">
                  <th style="padding:8px 0; text-align:left;">METHOD</th>
                  <th style="padding:8px 0; text-align:center;">TXN COUNT</th>
                  <th style="padding:8px 0; text-align:right;">SETTLED AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:10px 0; font-weight:600; color:#f59e0b;">🟠 CASH</td>
                  <td style="padding:10px 0; text-align:center;">${pr.paymentCounts.CASH || 0}</td>
                  <td style="padding:10px 0; text-align:right; font-weight:700;">${formatCurrency(pr.paymentMix.CASH || 0)}</td>
                </tr>
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:10px 0; font-weight:600; color:#10b981;">🟢 UPI</td>
                  <td style="padding:10px 0; text-align:center;">${pr.paymentCounts.UPI || 0}</td>
                  <td style="padding:10px 0; text-align:right; font-weight:700;">${formatCurrency(pr.paymentMix.UPI || 0)}</td>
                </tr>
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:10px 0; font-weight:600; color:#3b82f6;">🔵 CARD</td>
                  <td style="padding:10px 0; text-align:center;">${pr.paymentCounts.CARD || 0}</td>
                  <td style="padding:10px 0; text-align:right; font-weight:700;">${formatCurrency(pr.paymentMix.CARD || 0)}</td>
                </tr>
                <tr style="font-weight:700; font-size:0.95rem;">
                  <td style="padding:12px 0;">TOTAL LEDGER</td>
                  <td style="padding:12px 0; text-align:center;">${pr.totalTxns}</td>
                  <td style="padding:12px 0; text-align:right; color:#10b981;">${formatCurrency(pr.totalSettled)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Cash Drawer Balancing Module -->
          <div class="card" style="padding:20px; background:var(--bg-surface-1);">
            <h3 style="margin-top:0; font-size:1.1rem; border-bottom:1px solid var(--border-subtle); padding-bottom:10px;">
              💵 Cashier Cash Drawer Reconciliation
            </h3>
            <div style="display:flex; flex-direction:column; gap:10px; margin-top:12px; font-size:0.85rem;">
              <div style="display:flex; justify-content:space-between; background:var(--bg-surface-2); padding:10px 14px; border-radius:6px;">
                <span>Expected Opening Cash Float</span>
                <strong>${money(cd.expectedOpeningCash)}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; background:var(--bg-surface-2); padding:10px 14px; border-radius:6px;">
                <span>Cash Collected Today</span>
                <strong style="color:#f59e0b;">+${money(cd.cashCollectedToday)}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; background:var(--bg-surface-2); padding:10px 14px; border-radius:6px; font-weight:700;">
                <span>Expected Cash in Drawer</span>
                <span>${money(cd.expectedCashInDrawer)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; background:var(--bg-surface-2); padding:10px 14px; border-radius:6px; border:1px solid var(--border-subtle);">
                <span>Recorded Cash Counted (Shift End)</span>
                <strong>${money(cd.recordedCashCounted)}</strong>
              </div>
              ${varianceBlock}
            </div>
          </div>
        </div>
      `;
    } else if (this.activeReportTab === 'ops_summary') {
      return `
        <div class="card" style="padding:20px; background:var(--bg-surface-1);">
          <h3 style="margin-top:0; font-size:1.1rem; border-bottom:1px solid var(--border-subtle); padding-bottom:10px;">
            ⚡ Operations Performance & SLA Summary
          </h3>
          <div class="grid grid-cols-4 gap-md" style="margin-top:16px;">
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">GUEST COVERS</span>
              <strong style="font-size:1.4rem; display:block; color:var(--text-primary); margin-top:2px;">${os.totalCovers} Guests</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">CONFIRMED ORDERS</span>
              <strong style="font-size:1.4rem; display:block; color:var(--text-primary); margin-top:2px;">${os.totalOrders} Orders</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">TABLES SERVED</span>
              <strong style="font-size:1.4rem; display:block; color:var(--text-primary); margin-top:2px;">${os.totalTablesServed} Tables</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">AVG CHECK PER TABLE</span>
              <strong style="font-size:1.4rem; display:block; color:#10b981; margin-top:2px;">${formatCurrency(os.avgBillCheck)}</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">AVG SPEND PER GUEST</span>
              <strong style="font-size:1.4rem; display:block; color:#3b82f6; margin-top:2px;">${formatCurrency(os.avgSpendPerGuest)}</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">AVG DWELL DURATION</span>
              <strong style="font-size:1.4rem; display:block; color:var(--text-primary); margin-top:2px;">${dash(os.avgTableDuration)}</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">AVG KITCHEN PREP</span>
              <strong style="font-size:1.4rem; display:block; color:#f59e0b; margin-top:2px;">${dash(os.avgKitchenPrep)}</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">ORDER-TO-TABLE SLA</span>
              <strong style="font-size:1.4rem; display:block; color:#10b981; margin-top:2px;">${dash(os.avgOrderToTable)}</strong>
            </div>
          </div>
        </div>
      `;
    } else if (this.activeReportTab === 'cancellation_waste') {
      return this.renderCancellationWasteTab(formatCurrency);
    } else {
      return `
        <div class="card" style="padding:20px; background:var(--bg-surface-1);">
          <h3 style="margin-top:0; font-size:1.1rem; border-bottom:1px solid var(--border-subtle); padding-bottom:10px;">
            📜 Chronological Financial & Operational Audit Event Ledger
          </h3>
          ${audit.length === 0 ? `
            <div style="color:var(--text-muted); padding:20px 0; font-style:italic; text-align:center;">No audit events recorded for this shift.</div>
          ` : `
            <div style="display:flex; flex-direction:column; gap:10px; max-height:360px; overflow-y:auto; padding-right:6px; margin-top:12px;">
              ${audit.map(item => `
                <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; border-left:4px solid var(--accent-primary); font-size:0.825rem;">
                  <div style="display:flex; justify-content:space-between; font-weight:700;">
                    <span style="color:var(--accent-primary);">${item.time} • ${item.event}</span>
                    <span style="color:var(--text-secondary);">${item.tableLabel}</span>
                  </div>
                  <div style="color:var(--text-primary); margin-top:4px;">${item.details}</div>
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Actor: ${item.actor}</div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `;
    }
  }

  /**
   * Phase C: prepared-cost vs waste panels kept STRICTLY separate -
   * "Prepared Item Cost" (consumedCost across all holds), "Reused Value" (offset,
   * zero waste), "Waste Recognized" (DISCARDED holds only). Never merged.
   */
  renderCancellationWasteTab(formatCurrency) {
    const data = managerProjectionService.getCancellationProjection(this.tenantId);
    const p = data.panels;
    const aggTable = (title, map, tone) => {
      const entries = Object.entries(map || {});
      if (entries.length === 0) return '';
      return `
        <div class="card" style="padding:16px; background:var(--bg-surface-1);">
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; color:${tone}; margin-bottom:8px;">${title}</div>
          ${entries.sort((a, b) => b[1] - a[1]).map(([k, v]) => `
            <div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid var(--border-subtle); font-size:0.82rem;">
              <span>${String(k).replace(/_/g, ' ')}</span><strong>${formatCurrency(v)}</strong>
            </div>`).join('')}
        </div>`;
    };
    const heldHolds = (data.holds || []).filter(h => h.status === 'HELD');

    return `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="grid grid-cols-3 gap-md">
          <div style="background:var(--bg-surface-2); padding:16px; border-radius:6px; border-left:4px solid #3b82f6;">
            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">PREPARED ITEM COST (all cancelled-prepared holds)</span>
            <strong style="font-size:1.6rem; display:block; color:#3b82f6; margin-top:4px;">${formatCurrency(p.preparedItemCost)}</strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:16px; border-radius:6px; border-left:4px solid #10b981;">
            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">REUSED VALUE (offset • zero waste)</span>
            <strong style="font-size:1.6rem; display:block; color:#10b981; margin-top:4px;">${formatCurrency(p.reusedValue)}</strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:16px; border-radius:6px; border-left:4px solid #ef4444;">
            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">WASTE RECOGNIZED (DISCARDED only)</span>
            <strong style="font-size:1.6rem; display:block; color:#ef4444; margin-top:4px;">${formatCurrency(p.wasteRecognized)}</strong>
          </div>
        </div>
        <div style="font-size:0.78rem; color:var(--text-muted);">
          ⚖️ Cost semantics: a HELD item carries Prepared Item Cost but is NOT waste yet (${heldHolds.length} open holds worth ${formatCurrency(p.heldOpenCost)}); waste is recognised only when a hold is DISCARDED; reused items offset their cost with zero waste.
        </div>

        <div class="grid grid-cols-3 gap-md">
          ${aggTable('Waste Recognized by Station', data.wasteByStation, '#ef4444')}
          ${aggTable('Waste Recognized by Reason', data.wasteByReason, '#f59e0b')}
          ${aggTable('Cancelled Value by Station', data.byStation, '#8b5cf6')}
        </div>
        <div class="grid grid-cols-2 gap-md">
          ${aggTable('Cancelled Value by Reason', data.byReason, '#3b82f6')}
          ${aggTable('Cancelled Value by Waiter', data.byWaiter, '#ec4899')}
        </div>

        <div class="card" style="padding:16px; background:var(--bg-surface-1);">
          <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; color:var(--text-muted); margin-bottom:8px;">Cancellation Counts</div>
          <div style="font-size:0.85rem; display:flex; gap:18px; flex-wrap:wrap;">
            <span>Open: <strong>${data.counts.requested}</strong></span>
            <span>Approved: <strong>${data.counts.approved + data.counts.autoApproved}</strong></span>
            <span>Rejected: <strong>${data.counts.rejected}</strong></span>
            <span>Pending manager: <strong>${data.counts.pendingManager}</strong></span>
            <span>Reversed: <strong>${data.counts.reversed}</strong></span>
            <span>Rate: <strong>${data.cancellationRate === null ? '—' : data.cancellationRate + '%'}</strong> (cancelled ${data.cancelledQty} vs served ${data.servedQty})</span>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    if (!this.container) return;

    this.container.querySelectorAll('.report-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.activeReportTab = e.currentTarget.dataset.tab;
        this.updateContent();
      });
    });

    const exportBtn = this.container.querySelector('#btn-export-day-summary');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportDaySummaryCsv());
    }
  }

  // Real CSV export (Blob download) built from the same accounting-ledger projection
  // that is rendered on screen - no alert() placeholder.
  exportDaySummaryCsv() {
    const data = managerProjectionService.getReportsDaySummaryProjection(this.tenantId);
    const ss = data.salesSummary;
    const pr = data.paymentReconciliation;
    const os = data.operationsSummary;
    const cd = pr.cashDrawer || {};

    const esc = (v) => {
      const s = (v === null || v === undefined) ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [];
    rows.push(['Anchor RestaurantOS - Day Summary Report']);
    rows.push(['Generated At', new Date().toISOString()]);
    rows.push([]);
    rows.push(['SALES SUMMARY']);
    rows.push(['Gross Sales', ss.grossSales]);
    rows.push(['Discounts', ss.discounts]);
    rows.push(['Net Taxable Sales', ss.taxableSales]);
    rows.push(['CGST', ss.cgst]);
    rows.push(['SGST', ss.sgst]);
    rows.push(['Service Charge', ss.serviceCharge]);
    rows.push(['Invoiced Total', ss.invoiced]);
    rows.push(['Settled Revenue', ss.settled]);
    rows.push(['Outstanding Pending', ss.outstanding]);
    rows.push([]);
    rows.push(['PAYMENT RECONCILIATION']);
    rows.push(['Cash', (pr.paymentMix.CASH || 0)]);
    rows.push(['UPI', (pr.paymentMix.UPI || 0)]);
    rows.push(['Card', (pr.paymentMix.CARD || 0)]);
    rows.push(['Total Settled', pr.totalSettled]);
    rows.push([]);
    rows.push(['CASH DRAWER']);
    rows.push(['Register Open', cd.registerOpen ? 'Yes' : 'No']);
    rows.push(['Expected Opening Cash Float', cd.expectedOpeningCash]);
    rows.push(['Cash Collected Today', cd.cashCollectedToday]);
    rows.push(['Expected Cash In Drawer', cd.expectedCashInDrawer]);
    rows.push(['Recorded Cash Counted', cd.recordedCashCounted]);
    rows.push(['Cash Variance', cd.cashVariance]);
    rows.push([]);
    rows.push(['OPERATIONS SUMMARY']);
    rows.push(['Guest Covers', os.totalCovers]);
    rows.push(['Confirmed Orders', os.totalOrders]);
    rows.push(['Tables Served', os.totalTablesServed]);
    rows.push(['Avg Check Per Table', os.avgBillCheck]);
    rows.push(['Avg Spend Per Guest', os.avgSpendPerGuest]);
    rows.push(['Avg Dwell Duration', os.avgTableDuration]);
    rows.push(['Avg Kitchen Prep', os.avgKitchenPrep]);
    rows.push(['Order-To-Table SLA', os.avgOrderToTable]);
    rows.push([]);
    rows.push(['CANCELLATION & WASTE']);
    const cxl = managerProjectionService.getCancellationProjection(this.tenantId);
    rows.push(['Prepared Item Cost (all holds)', cxl.panels.preparedItemCost]);
    rows.push(['Reused Value (zero waste offset)', cxl.panels.reusedValue]);
    rows.push(['Waste Recognized (DISCARDED only)', cxl.panels.wasteRecognized]);
    rows.push(['Held Open Cost', cxl.panels.heldOpenCost]);
    rows.push(['Cancellation Rate %', cxl.cancellationRate]);
    rows.push([]);
    rows.push(['AUDIT LEDGER']);
    rows.push(['Time', 'Event', 'Table', 'Actor', 'Details']);
    (data.auditLedger || []).forEach(a => rows.push([a.time, a.event, a.tableLabel, a.actor, a.details]));

    const csv = rows.map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const link = document.createElement('a');
    link.href = url;
    link.download = `day-summary-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
