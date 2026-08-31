/**
 * Capability Group 5 - Cashier Transaction-Control Workspace
 * Dedicated transaction-control station for bill inbox inspection, bill revisions, recall to waiter, FY GST invoice issuance, and payment settlement.
 * Preserves existing billing visual language from RunningBillModal & ActiveSessionView.
 * Provides tabbed Inbox filtering, state-aware action bars, Invoice & Bills, Payments Ledger, Day Summary, and CA Session Audit Trail Modal.
 */

import { sessionModel } from '../../../../../businessos/platform/session/sessionModel.js';
import { sessionProjectionService } from '../../../../../businessos/platform/session/sessionProjectionService.js';
import { sessionStateMachine, SessionMilestones } from '../../../../../businessos/platform/session/sessionStateMachine.js';
import { tableStateMachine, PhysicalTableStates } from '../../../../../businessos/platform/table_state/tableStateMachine.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { billRevisionModel } from '../../../../../businessos/platform/billing/billRevisionModel.js';
import { invoiceModel } from '../../../../../businessos/platform/billing/invoiceModel.js';
import { paymentModel } from '../../../../../businessos/platform/billing/paymentModel.js';
import { sessionAuditModel } from '../../../../../businessos/platform/session/sessionAuditModel.js';
import { tenantModel } from '../../../../../businessos/platform/tenant/tenantModel.js';
import { TaxInvoicePrintModal } from './TaxInvoicePrintModal.js';
import { accountingProjectionService } from '../../../../../businessos/platform/accounting/accountingProjectionService.js';

export class CashierWorkspaceView {
  constructor(deps = {}) {
    this.container = null;
    this.mountEl = null;
    this.selectedSessionId = null;
    this.selectedRevisionIndex = null;
    this.activeMainTab = 'inbox'; // 'inbox' | 'invoices' | 'payments' | 'reports' | 'shift'
    this.inboxSubTab = 'needs_review'; // 'needs_review' | 'recalled' | 'awaiting_payment' | 'settled' | 'all'
    this.dateFilter = 'today'; // 'today' | 'yesterday' | 'week' | 'month' | 'all'
    this.searchQuery = '';
    this.authEngine = deps.authEngine || null;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
    this.unsubscribeEvents = [];
  }

  filterRecordsByDateRange(records, dateRange = 'today', dateField = 'issuedAt') {
    if (!Array.isArray(records)) return [];
    if (dateRange === 'all') return records;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + (24 * 60 * 60 * 1000) - 1;

    const yesterdayStart = todayStart - (24 * 60 * 60 * 1000);
    const yesterdayEnd = todayStart - 1;

    const weekStart = todayStart - (7 * 24 * 60 * 60 * 1000);
    const monthStart = todayStart - (30 * 24 * 60 * 60 * 1000);

    return records.filter(r => {
      const rawDate = r[dateField] || r.issuedAt || r.receivedAt || r.createdAt || r.created_at;
      if (!rawDate) return true;
      const t = new Date(rawDate).getTime();
      if (isNaN(t)) return true;

      if (dateRange === 'today') {
        return t >= todayStart && t <= todayEnd;
      } else if (dateRange === 'yesterday') {
        return t >= yesterdayStart && t <= yesterdayEnd;
      } else if (dateRange === 'week') {
        return t >= weekStart;
      } else if (dateRange === 'month') {
        return t >= monthStart;
      }
      return true;
    });
  }

  renderDateFilterBar() {
    const filters = [
      { id: 'today', label: '📅 Today' },
      { id: 'yesterday', label: '⏪ Yesterday' },
      { id: 'week', label: '🗓️ Last 7 Days' },
      { id: 'month', label: '📊 Last 30 Days' },
      { id: 'all', label: '🌐 All Time' }
    ];

    return `
      <div style="display:flex; align-items:center; gap:6px; background:var(--bg-surface-2); padding:4px; border-radius:8px; border:1px solid var(--border-subtle);">
        ${filters.map(f => `
          <button class="btn-date-filter ${this.dateFilter === f.id ? 'active' : ''}" data-date-filter="${f.id}" style="padding:6px 12px; font-size:0.78rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.dateFilter === f.id ? 'var(--accent-primary)' : 'transparent'}; color:${this.dateFilter === f.id ? '#000' : 'var(--text-secondary)'}; border:none; transition:all 0.15s ease;">
            ${f.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  render(mountEl, sessionUser = null, subView = 'inbox') {
    this.mountEl = mountEl;
    if (subView && subView !== 'cashier' && subView !== 'auto') {
      this.activeMainTab = subView;
    }
    this.container = document.createElement('div');
    this.container.className = 'cashier-workspace animate-fade-in';
    this.container.style.cssText = 'display:flex; flex-direction:column; width:100%; height:100%; min-height:calc(100vh - 70px); background:var(--bg-app); color:var(--text-primary);';

    this.subscribeEvents();
    this.updateContent(sessionUser);

    // Hydrate state asynchronously from Supabase Cloud on render
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      window.__APP__.platform.dataGateway.hydrateCollections(['table_sessions', 'bill_revisions', 'invoices', 'payments', 'orders'])
        .then(() => this.updateContent(sessionUser))
        .catch(err => console.warn('[CashierWorkspaceView] Hydration error:', err));
    }

    return this.container;
  }

  subscribeEvents() {
    if (this.unsubscribeEvents.length > 0) return;

    const refresh = () => {
      if (this.container && this.mountEl) {
        const sessionUser = this.authEngine ? this.authEngine.getCurrentSession() : null;
        this.updateContent(sessionUser);
      }
    };

    const unsub1 = this.platformEventBus.subscribe('bill:finalized', refresh);
    const unsub2 = this.platformEventBus.subscribe('bill:recalled', refresh);
    const unsub3 = this.platformEventBus.subscribe('bill:reopened', refresh);
    const unsub4 = this.platformEventBus.subscribe('invoice:issued', refresh);
    const unsub5 = this.platformEventBus.subscribe('payment:recorded', refresh);
    const unsub6 = this.platformEventBus.subscribe('session:milestone:changed', refresh);
    const unsub7 = this.platformEventBus.subscribe('bill:revision:created', refresh);
    const unsub8 = this.platformEventBus.subscribe('session:projection:updated', refresh);
    const unsub9 = this.platformEventBus.subscribe('data:changed', refresh);
    const unsub10 = this.platformEventBus.subscribe('order:confirmed', refresh);

    this.unsubscribeEvents.push(unsub1, unsub2, unsub3, unsub4, unsub5, unsub6, unsub7, unsub8, unsub9, unsub10);
  }

  getAllBillSessions() {
    const allSessions = sessionModel.getAllSessions() || [];
    const tenant = tenantModel.getPrimaryTenant() || {};
    const tenantId = tenant.tenantId || 'tenant_h0qc7wf';

    return allSessions.filter(s => {
      if (s.status === 'CLOSED') return false;
      const revisions = billRevisionModel.getRevisionsForSession(s.id, tenantId);
      const invoice = invoiceModel.getInvoiceForSession(s.id, tenantId);
      const payment = paymentModel.getPaymentForSession(s.id, tenantId);
      return revisions.length > 0 || invoice !== null || payment !== null || s.status === SessionMilestones.BILL_GENERATED || s.status === SessionMilestones.WAITER_REVISION_REQUIRED;
    });
  }

  getFilteredSessions() {
    const sessions = this.getAllBillSessions();
    const tenant = tenantModel.getPrimaryTenant() || {};
    const tenantId = tenant.tenantId || 'tenant_h0qc7wf';

    return sessions.filter(s => {
      const revisions = billRevisionModel.getRevisionsForSession(s.id, tenantId);
      const latestRev = revisions.length > 0 ? revisions[revisions.length - 1] : null;
      const invoice = invoiceModel.getInvoiceForSession(s.id, tenantId);
      const payment = paymentModel.getPaymentForSession(s.id, tenantId);

      const isPaid = payment !== null || (latestRev && latestRev.paymentStatus === 'PAID') || s.status === SessionMilestones.PAYMENT_RECEIVED || s.billStatus === 'PAID';
      const isRecalled = s.status === SessionMilestones.WAITER_REVISION_REQUIRED || (latestRev && latestRev.revisionStatus === 'RECALLED');
      const isIssued = (invoice !== null || (latestRev && latestRev.invoiceStatus === 'ISSUED')) && !isPaid;

      if (this.inboxSubTab === 'needs_review') {
        return !isPaid && !isRecalled && !isIssued;
      } else if (this.inboxSubTab === 'recalled') {
        return isRecalled;
      } else if (this.inboxSubTab === 'awaiting_payment') {
        return isIssued && !isPaid;
      } else if (this.inboxSubTab === 'settled') {
        return isPaid;
      }
      return true; // 'all'
    });
  }

  getKPICounts() {
    const sessions = this.getAllBillSessions();
    const tenant = tenantModel.getPrimaryTenant() || {};
    const tenantId = tenant.tenantId || 'tenant_h0qc7wf';

    let needsReview = 0;
    let recalled = 0;
    let awaitingPayment = 0;
    let settled = 0;

    sessions.forEach(s => {
      const revisions = billRevisionModel.getRevisionsForSession(s.id, tenantId);
      const latestRev = revisions.length > 0 ? revisions[revisions.length - 1] : null;
      const invoice = invoiceModel.getInvoiceForSession(s.id, tenantId);
      const payment = paymentModel.getPaymentForSession(s.id, tenantId);

      const isPaid = payment !== null || (latestRev && latestRev.paymentStatus === 'PAID') || s.status === SessionMilestones.PAYMENT_RECEIVED || s.billStatus === 'PAID';
      const isRecalled = s.status === SessionMilestones.WAITER_REVISION_REQUIRED || (latestRev && latestRev.revisionStatus === 'RECALLED');
      const isIssued = (invoice !== null || (latestRev && latestRev.invoiceStatus === 'ISSUED')) && !isPaid;

      if (isPaid) settled++;
      else if (isRecalled) recalled++;
      else if (isIssued) awaitingPayment++;
      else needsReview++;
    });

    return { needsReview, recalled, awaitingPayment, settled };
  }

  updateContent(sessionUser = null) {
    if (!this.container) return;

    const kpi = this.getKPICounts();
    const primaryTenant = tenantModel.getPrimaryTenant() || {};
    const cashierName = sessionUser ? (sessionUser.employeeName || sessionUser.name || 'Cashier') : 'Cashier Desk';

    this.container.innerHTML = `
      <!-- TOP CASHIER HEADER COCKPIT -->
      <div style="background:var(--bg-surface-1); padding:16px 24px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">
            ${primaryTenant.name || 'ANCHOR BISTRO'} • TRANSACTION-CONTROL DESK
          </div>
          <h2 style="font-size:1.6rem; margin:2px 0 0; color:var(--text-primary); font-weight:800; display:flex; align-items:center; gap:8px;">
            <span>💰</span> Cashier & Billing Workspace
          </h2>
        </div>
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="font-size:0.85rem; color:var(--text-secondary);">
            Cashier: <strong>${cashierName}</strong> • <span class="badge badge-success">Shift Active</span>
          </div>
        </div>
      </div>

      <!-- OPERATIONAL KPI METRICS STRIP -->
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; padding:12px 24px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle);">
        <div class="card kpi-card" data-subtab="needs_review" style="cursor:pointer; padding:10px 14px; background:var(--bg-surface-1); border-left:4px solid #ef4444; border-radius:6px;">
          <div style="font-size:0.7rem; font-weight:700; text-transform:uppercase; color:var(--text-muted);">🟠 NEEDS REVIEW</div>
          <div style="font-size:1.5rem; font-weight:800; color:#ef4444; margin-top:2px;">${kpi.needsReview}</div>
          <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">Bills awaiting action</div>
        </div>
        <div class="card kpi-card" data-subtab="recalled" style="cursor:pointer; padding:10px 14px; background:var(--bg-surface-1); border-left:4px solid #f59e0b; border-radius:6px;">
          <div style="font-size:0.7rem; font-weight:700; text-transform:uppercase; color:var(--text-muted);">🟡 RECALLED</div>
          <div style="font-size:1.5rem; font-weight:800; color:#f59e0b; margin-top:2px;">${kpi.recalled}</div>
          <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">Waiting for waiter resubmit</div>
        </div>
        <div class="card kpi-card" data-subtab="awaiting_payment" style="cursor:pointer; padding:10px 14px; background:var(--bg-surface-1); border-left:4px solid #3b82f6; border-radius:6px;">
          <div style="font-size:0.7rem; font-weight:700; text-transform:uppercase; color:var(--text-muted);">🔵 AWAITING PAYMENT</div>
          <div style="font-size:1.5rem; font-weight:800; color:#3b82f6; margin-top:2px;">${kpi.awaitingPayment}</div>
          <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">Invoice issued, payment pending</div>
        </div>
        <div class="card kpi-card" data-subtab="settled" style="cursor:pointer; padding:10px 14px; background:var(--bg-surface-1); border-left:4px solid #10b981; border-radius:6px;">
          <div style="font-size:0.7rem; font-weight:700; text-transform:uppercase; color:var(--text-muted);">🟢 SETTLED</div>
          <div style="font-size:1.5rem; font-weight:800; color:#10b981; margin-top:2px;">${kpi.settled}</div>
          <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">Completed transactions</div>
        </div>
      </div>

      <!-- CA FLAGGED DISCREPANCY NOTICE BANNER FOR CASHIER -->
      ${this.renderCaFlaggedNotice()}

      <!-- MAIN CONTENT BODY BASED ON ACTIVE TAB -->
      <div style="flex:1; display:flex; min-height:0; overflow:hidden;">
        ${this.renderMainTabContent()}
      </div>

      <div id="cashier-modal-mount"></div>
    `;

    this.bindEvents();
  }

  renderCaFlaggedNotice() {
    const flagged = accountingProjectionService.getFlaggedExceptions().filter(e => e.status === 'FLAGGED');
    if (flagged.length === 0) return '';

    return `
      <div style="background:rgba(239,68,68,0.15); border-bottom:1px solid #ef4444; padding:8px 24px; display:flex; justify-content:space-between; align-items:center; font-size:0.82rem;">
        <div style="display:flex; align-items:center; gap:8px; color:#ef4444; font-weight:700;">
          <span>🚩</span>
          <span>${flagged.length} Financial Discrepancy Flagged by CA (e.g. Invoice ${flagged[0].invoiceNumber} — Missing Payment ₹${Math.abs(flagged[0].difference).toFixed(2)})</span>
        </div>
        <button class="btn-primary btn-cashier-settle-flagged" data-exc-id="${flagged[0].id}" data-inv-number="${flagged[0].invoiceNumber}" data-sess-id="${flagged[0].sessionId}" data-diff="${flagged[0].difference}" style="padding:4px 10px; font-size:0.75rem; font-weight:800; background:#10b981; border:none; border-radius:4px; color:#fff; cursor:pointer;">
          💳 Record Settlement Now
        </button>
      </div>
    `;
  }

  renderMainTabContent() {
    if (this.activeMainTab === 'invoices') return this.renderInvoiceRegister();
    if (this.activeMainTab === 'payments') return this.renderPaymentsLedger();
    if (this.activeMainTab === 'reports') return this.renderCashierReports();
    if (this.activeMainTab === 'shift') return this.renderMyShiftView();

    // Default: 'inbox' (2-column layout)
    const filteredSessions = this.getFilteredSessions();
    if (!this.selectedSessionId && filteredSessions.length > 0) {
      this.selectedSessionId = filteredSessions[0].id;
    }

    return `
      <div style="display:grid; grid-template-columns:380px 1fr; width:100%; height:100%; overflow:hidden;">
        
        <!-- LEFT COLUMN: BILL INBOX WITH TABS -->
        <div style="background:var(--bg-surface-2); border-right:1px solid var(--border-subtle); display:flex; flex-direction:column; overflow-y:auto; padding:16px;">
          
          <!-- INBOX SUBTAB NAVIGATION -->
          <div style="display:flex; gap:4px; margin-bottom:12px; border-bottom:1px solid var(--border-subtle); padding-bottom:8px; flex-wrap:wrap;">
            <button class="btn-inbox-tab ${this.inboxSubTab === 'needs_review' ? 'active' : ''}" data-subtab="needs_review" style="padding:6px 8px; font-size:0.75rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.inboxSubTab === 'needs_review' ? '#ef4444' : 'transparent'}; color:${this.inboxSubTab === 'needs_review' ? '#fff' : 'var(--text-secondary)'}; border:none;">
              🟠 Review (${this.getKPICounts().needsReview})
            </button>
            <button class="btn-inbox-tab ${this.inboxSubTab === 'recalled' ? 'active' : ''}" data-subtab="recalled" style="padding:6px 8px; font-size:0.75rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.inboxSubTab === 'recalled' ? '#f59e0b' : 'transparent'}; color:${this.inboxSubTab === 'recalled' ? '#fff' : 'var(--text-secondary)'}; border:none;">
              🟡 Recalled (${this.getKPICounts().recalled})
            </button>
            <button class="btn-inbox-tab ${this.inboxSubTab === 'awaiting_payment' ? 'active' : ''}" data-subtab="awaiting_payment" style="padding:6px 8px; font-size:0.75rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.inboxSubTab === 'awaiting_payment' ? '#3b82f6' : 'transparent'}; color:${this.inboxSubTab === 'awaiting_payment' ? '#fff' : 'var(--text-secondary)'}; border:none;">
              🔵 Unpaid (${this.getKPICounts().awaitingPayment})
            </button>
            <button class="btn-inbox-tab ${this.inboxSubTab === 'settled' ? 'active' : ''}" data-subtab="settled" style="padding:6px 8px; font-size:0.75rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.inboxSubTab === 'settled' ? '#10b981' : 'transparent'}; color:${this.inboxSubTab === 'settled' ? '#000' : 'var(--text-secondary)'}; border:none;">
              🟢 Settled (${this.getKPICounts().settled})
            </button>
            <button class="btn-inbox-tab ${this.inboxSubTab === 'all' ? 'active' : ''}" data-subtab="all" style="padding:6px 8px; font-size:0.75rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.inboxSubTab === 'all' ? 'var(--accent-primary)' : 'transparent'}; color:${this.inboxSubTab === 'all' ? '#fff' : 'var(--text-secondary)'}; border:none;">
              📋 All
            </button>
          </div>

          ${filteredSessions.length > 0 ? `
            <div style="display:flex; flex-direction:column; gap:10px;">
              ${filteredSessions.map(s => {
                const revisions = billRevisionModel.getRevisionsForSession(s.id);
                const latestRev = revisions.length > 0 ? revisions[revisions.length - 1] : null;
                const invoice = invoiceModel.getInvoiceForSession(s.id);
                const payment = paymentModel.getPaymentForSession(s.id);
                const proj = sessionProjectionService.getSessionProjection(s.id);
                
                const isSelected = s.id === this.selectedSessionId;
                const isPaid = payment !== null || (latestRev && latestRev.paymentStatus === 'PAID') || s.status === SessionMilestones.PAYMENT_RECEIVED || s.billStatus === 'PAID';
                const isRecalled = s.status === SessionMilestones.WAITER_REVISION_REQUIRED || (latestRev && latestRev.revisionStatus === 'RECALLED');
                const isIssued = (invoice !== null || (latestRev && latestRev.invoiceStatus === 'ISSUED')) && !isPaid;
                
                let badgeHtml = `<span class="badge badge-danger">🔴 NEEDS REVIEW</span>`;
                if (isPaid) badgeHtml = `<span class="badge badge-success">🟢 SETTLED</span>`;
                else if (isRecalled) badgeHtml = `<span class="badge badge-warning">🟡 RECALLED</span>`;
                else if (isIssued) badgeHtml = `<span class="badge badge-info">🔵 INVOICED</span>`;

                const totalDisplay = payment ? payment.amount : (invoice ? invoice.grandTotal : (latestRev ? latestRev.grandTotal : (proj ? proj.grandTotal : 0)));
                const revCount = revisions.length > 0 ? revisions.length : 1;
                const invNo = invoice ? invoice.invoiceNumber : (latestRev ? latestRev.invoiceNumber : null);

                return `
                  <div class="card bill-inbox-card ${isSelected ? 'active-bill' : ''}" data-session-id="${s.id}" style="cursor:pointer; padding:12px 14px; border-radius:8px; border:2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}; background:${isSelected ? 'var(--bg-surface-1)' : 'var(--bg-surface-2)'}; transition:all var(--transition-fast);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                      <div style="font-size:1.1rem; font-weight:800; color:var(--text-primary);">Table ${s.tableNumber}</div>
                      ${badgeHtml}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; color:var(--text-secondary);">
                      <div>
                        <span>Rev ${revCount}</span> • Waiter: <strong>${proj ? proj.waiter.name : 'Staff'}</strong>
                      </div>
                      <div style="font-weight:800; font-size:1.05rem; color:var(--accent-primary);">
                        ₹${totalDisplay.toFixed(2)}
                      </div>
                    </div>
                    ${invNo ? `
                      <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
                        Invoice: <strong>${invNo}</strong>
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div style="text-align:center; padding:30px 16px; color:var(--text-muted);">
              <div style="font-size:2rem; margin-bottom:8px;">🧾</div>
              <div style="font-size:0.95rem; font-weight:700; color:var(--text-primary);">No Bills in this Tab</div>
              <p style="font-size:0.8rem; margin-top:4px;">No transactions currently match the selected inbox filter.</p>
            </div>
          `}
        </div>

        <!-- RIGHT COLUMN: BILL INSPECTOR & REVISION PANEL -->
        <div style="display:flex; flex-direction:column; overflow-y:auto; padding:20px; background:var(--bg-surface-1);">
          ${this.selectedSessionId ? this.renderBillInspector(this.selectedSessionId) : `
            <div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-muted);">
              <div style="text-align:center;">
                <div style="font-size:3rem; margin-bottom:12px;">👈</div>
                <div style="font-size:1.1rem; font-weight:700; color:var(--text-primary);">Select a Bill from the Inbox</div>
                <p style="font-size:0.85rem; margin-top:4px;">Choose a table session on the left to review revisions, print tax invoice, or record payment.</p>
              </div>
            </div>
          `}
        </div>

      </div>
    `;
  }

  renderBillInspector(sessionId) {
    const proj = sessionProjectionService.getSessionProjection(sessionId);
    const revisions = billRevisionModel.getRevisionsForSession(sessionId);
    const latestRev = revisions.length > 0 ? revisions[revisions.length - 1] : null;
    const invoice = invoiceModel.getInvoiceForSession(sessionId);
    const payment = paymentModel.getPaymentForSession(sessionId);

    if (!proj && !latestRev && !invoice) {
      return `<div class="card" style="padding:20px;">Session details not found.</div>`;
    }

    const activeRev = (this.selectedRevisionIndex !== null && revisions[this.selectedRevisionIndex]) 
      ? revisions[this.selectedRevisionIndex] 
      : latestRev;

    const isPaid = payment !== null || (activeRev && activeRev.paymentStatus === 'PAID') || (proj && (proj.status === SessionMilestones.PAYMENT_RECEIVED || proj.billStatus === 'PAID'));
    const isRecalled = (proj && proj.status === SessionMilestones.WAITER_REVISION_REQUIRED) || (activeRev && activeRev.revisionStatus === 'RECALLED');
    const isIssued = (invoice !== null || (activeRev && activeRev.invoiceStatus === 'ISSUED'));
    const invoiceNo = invoice ? invoice.invoiceNumber : (activeRev ? activeRev.invoiceNumber : null);

    const items = activeRev ? activeRev.items : (proj ? proj.itemizedList : []);
    const grossSales = activeRev ? (activeRev.grossSales || activeRev.subtotal) : (proj ? proj.subtotal : 0);
    const discountsTotal = activeRev ? (activeRev.discountsTotal || activeRev.discounts || 0) : 0;
    const discountRecords = activeRev ? (activeRev.discountRecords || []) : [];
    const taxableAmount = activeRev ? activeRev.taxableAmount : (grossSales - discountsTotal);

    const taxLines = activeRev ? (activeRev.taxLines || []) : [];
    const charges = activeRev ? (activeRev.charges || []) : [];
    const cgst = activeRev ? activeRev.cgstAmount : (proj ? proj.cgstAmount : 0);
    const sgst = activeRev ? activeRev.sgstAmount : (proj ? proj.sgstAmount : 0);
    const serviceCharge = activeRev ? activeRev.serviceChargeAmount : (proj ? (proj.serviceChargeAmount || 0) : 0);
    const grandTotal = activeRev ? activeRev.grandTotal : (proj ? proj.grandTotal : 0);

    return `
      <div style="display:flex; flex-direction:column; gap:16px; max-width:800px; margin:0 auto; width:100%;">
        
        <!-- INSPECTOR HEADER STRIP -->
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-2); padding:16px 20px; border-radius:8px; border:1px solid var(--border-subtle);">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">
              SESSION: ${sessionId} • WAITER: ${proj ? proj.waiter.name : (activeRev ? activeRev.waiterName : 'Staff')}
            </div>
            <h3 style="font-size:1.5rem; margin:2px 0 0; color:var(--text-primary); font-weight:800;">
              Table ${proj ? proj.tableNumber : activeRev.tableNumber} <span style="font-size:0.9rem; color:var(--text-muted); font-weight:400;">(${proj ? proj.tableCode : activeRev.tableCode})</span>
            </h3>
          </div>
          <div style="text-align:right;">
            ${invoiceNo ? `<div class="badge badge-info" style="font-size:0.9rem; font-weight:800; margin-bottom:4px;">📜 FY INVOICE: ${invoiceNo}</div><br/>` : ''}
            ${isPaid ? `<span class="badge badge-success" style="font-size:0.85rem; font-weight:800;">🟢 SETTLED</span>` : (isRecalled ? `<span class="badge badge-danger" style="font-size:0.85rem; font-weight:800;">🟡 RECALLED TO WAITER</span>` : (isIssued ? `<span class="badge badge-info" style="font-size:0.85rem; font-weight:800;">🔵 UNPAID (INVOICE ISSUED)</span>` : `<span class="badge badge-warning" style="font-size:0.85rem; font-weight:800;">🔴 PENDING CASHIER REVIEW</span>`))}
          </div>
        </div>

        <!-- REVISION SELECTOR & AUDIT TRIGGER TOOLBAR -->
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-app); padding:10px 16px; border-radius:6px; border:1px solid var(--border-subtle); flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:0.85rem; font-weight:700; color:var(--text-secondary);">Financial Snapshot:</span>
            ${revisions.length > 0 ? `
              <select id="select-revision-version" class="input-field" style="padding:4px 10px; font-size:0.85rem; font-weight:700; width:auto; border-color:var(--accent-primary);">
                ${revisions.map((r, idx) => `
                  <option value="${idx}" ${activeRev && activeRev.id === r.id ? 'selected' : ''}>
                    Revision ${r.revisionNumber} (${r.revisionStatus}) - ₹${r.grandTotal.toFixed(2)} [${new Date(r.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}]
                  </option>
                `).join('')}
              </select>
            ` : `<span class="badge badge-info">Revision 1 (Draft)</span>`}
          </div>
          <button id="btn-view-session-audit" class="btn-secondary" style="padding:6px 12px; font-weight:700; font-size:0.8rem; color:var(--accent-primary); border-color:var(--accent-primary);">
            📋 View Session Audit Trail
          </button>
        </div>

        ${isRecalled ? `
          <div class="card" style="background:#f59e0b15; border:1px solid #f59e0b; padding:12px 16px; border-radius:6px; font-size:0.85rem; color:#f59e0b; font-weight:700;">
            🟡 Bill snapshot recalled to Waiter console for order adjustments.
          </div>
        ` : ''}

        ${isIssued && !isPaid ? `
          <div class="card" style="background:#3b82f615; border:1px solid #3b82f6; padding:12px 16px; border-radius:6px; font-size:0.85rem; color:#3b82f6; font-weight:700;">
            🔒 Official Tax Invoice <strong>${invoiceNo}</strong> has been ISSUED. Recall to Waiter is strictly locked per GST regulations.
          </div>
        ` : ''}

        ${payment ? `
          <div class="card" style="background:#10b98115; border:1px solid #10b981; padding:12px 16px; border-radius:6px; font-size:0.85rem; color:#10b981; font-weight:700;">
            🟢 Payment <strong>${payment.paymentId}</strong> of <strong>₹${payment.amount.toFixed(2)}</strong> settled via <strong>${payment.paymentMethod}</strong> (Invoice ${payment.invoiceNumber}) by ${payment.receivedByName} on ${new Date(payment.receivedAt).toLocaleTimeString()}.
          </div>
        ` : ''}

        <!-- ITEMIZED ORDER BREAKDOWN TABLE -->
        <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-subtle);">
          <div style="background:var(--bg-surface-2); padding:10px 16px; font-size:0.8rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); border-bottom:1px solid var(--border-subtle);">
            Itemized Order Breakdown (${items.length} Items)
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                <th style="padding:10px 16px;">Item Description</th>
                <th style="padding:10px 16px; text-align:center;">Qty</th>
                <th style="padding:10px 16px; text-align:right;">Unit Price</th>
                <th style="padding:10px 16px; text-align:right;">Line Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(it => `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:10px 16px; font-weight:600;">${it.name || it.itemName}</td>
                  <td style="padding:10px 16px; text-align:center;">${it.quantity}</td>
                  <td style="padding:10px 16px; text-align:right;">₹${(it.price || 0).toFixed(2)}</td>
                  <td style="padding:10px 16px; text-align:right; font-weight:700;">₹${(it.lineTotal || (it.price * it.quantity)).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- CBIC COMPLIANT COMMERCIAL TAX & DISCOUNT BREAKDOWN STRIP -->
        <div class="card" style="background:var(--bg-surface-2); padding:16px; border:1px solid var(--border-subtle); font-size:0.9rem;">
          <div style="display:flex; flex-direction:column; gap:6px; max-width:360px; margin-left:auto;">
            <div style="display:flex; justify-content:space-between; color:var(--text-secondary);">
              <span>Gross Sales Subtotal:</span> <strong>₹${grossSales.toFixed(2)}</strong>
            </div>
            
            ${discountsTotal > 0 ? `
              <div style="display:flex; justify-content:space-between; color:var(--status-warning);">
                <span>Discounts Total:</span> <strong>-₹${discountsTotal.toFixed(2)}</strong>
              </div>
              ${discountRecords.map(d => `
                <div style="font-size:0.75rem; color:var(--text-muted); text-align:right; padding-left:12px;">
                  • ${d.reason || d.discountType} (-₹${parseFloat(d.discountAmount).toFixed(2)})
                </div>
              `).join('')}
            ` : ''}

            <div style="display:flex; justify-content:space-between; font-weight:700; color:var(--text-primary); border-top:1px solid var(--border-subtle); padding-top:4px; margin-top:2px;">
              <span>Taxable Value:</span> <strong>₹${taxableAmount.toFixed(2)}</strong>
            </div>

            ${taxLines.length > 0 ? taxLines.map(t => `
              <div style="display:flex; justify-content:space-between; color:var(--text-secondary);">
                <span>${t.type} (${t.rate}%):</span> <strong>₹${t.amount.toFixed(2)}</strong>
              </div>
            `).join('') : `
              <div style="display:flex; justify-content:space-between; color:var(--text-secondary);">
                <span>CGST (2.5%):</span> <strong>₹${cgst.toFixed(2)}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; color:var(--text-secondary);">
                <span>SGST (2.5%):</span> <strong>₹${sgst.toFixed(2)}</strong>
              </div>
            `}

            ${charges.length > 0 ? charges.map(c => `
              <div style="display:flex; justify-content:space-between; color:var(--text-secondary);">
                <span>${c.type.replace('_', ' ')} (${c.rate}%):</span> <strong>₹${c.amount.toFixed(2)}</strong>
              </div>
            `).join('') : `
              <div style="display:flex; justify-content:space-between; color:var(--text-secondary);">
                <span>Service Charge (5%):</span> <strong>₹${serviceCharge.toFixed(2)}</strong>
              </div>
            `}

            <div style="display:flex; justify-content:space-between; color:var(--accent-primary); font-size:1.25rem; font-weight:800; border-top:2px solid var(--border-subtle); padding-top:8px; margin-top:4px;">
              <span>GRAND TOTAL:</span> <span>₹${grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <!-- STATE-AWARE ACTION BAR WITH STRICT RECALL GATE -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; border-top:1px solid var(--border-subtle); padding-top:16px;">
          ${isPaid ? `
            <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
              <button id="btn-cashier-print" class="btn-secondary" style="padding:10px 18px; font-weight:700;">
                🖨️ Print Tax Invoice Again
              </button>
              <button disabled class="btn-secondary" style="padding:10px 20px; font-weight:800; opacity:0.9; background:#10b98122; color:#10b981; border:1px solid #10b981;">
                ✅ PAYMENT SETTLED
              </button>
            </div>
          ` : (isIssued ? `
            <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
              <button id="btn-cashier-print" class="btn-secondary" style="padding:10px 18px; font-weight:700;">
                🖨️ Print Tax Invoice (${invoiceNo})
              </button>
              <button id="btn-cashier-mark-paid" class="btn-primary" style="padding:10px 20px; font-weight:800; background:var(--status-success); color:#000;">
                💳 Record Payment →
              </button>
            </div>
          ` : (isRecalled ? `
            <div style="display:flex; justify-content:center; width:100%;">
              <button disabled class="btn-secondary" style="padding:10px 20px; font-weight:800; opacity:0.8; background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b;">
                ⏳ Waiting for Waiter to Resubmit Revision
              </button>
            </div>
          ` : `
            <button id="btn-cashier-recall" class="btn-secondary" style="padding:10px 16px; font-weight:700; color:var(--status-warning); border-color:var(--status-warning);">
              ↩ Recall to Waiter
            </button>
            <div style="display:flex; gap:10px;">
              <button id="btn-cashier-print" class="btn-secondary" style="padding:10px 16px; font-weight:700;">
                🖨️ Print Draft
              </button>
              <button id="btn-cashier-issue-inv" class="btn-primary" style="padding:10px 16px; font-weight:800; background:var(--accent-primary); color:#fff;">
                📜 Finalize & Issue Tax Invoice
              </button>
            </div>
          `))}
        </div>

      </div>
    `;
  }

  // --- ACCOUNTING MODULE VIEWS ---

  renderInvoiceRegister() {
    const tenant = tenantModel.getPrimaryTenant() || {};
    const tenantId = tenant.tenantId || 'tenant_h0qc7wf';
    let invoices = invoiceModel.getAllInvoices(tenantId);

    invoices = this.filterRecordsByDateRange(invoices, this.dateFilter, 'issuedAt');

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      invoices = invoices.filter(i => 
        i.invoiceNumber.toLowerCase().includes(q) || 
        String(i.tableNumber).includes(q) || 
        (i.cashierName && i.cashierName.toLowerCase().includes(q))
      );
    }

    return `
      <div style="display:flex; flex-direction:column; width:100%; padding:20px; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
          <div>
            <h3 style="font-size:1.4rem; margin:0; font-weight:800;">🧾 Issued Tax Invoice Register</h3>
            <p style="color:var(--text-muted); font-size:0.85rem; margin:2px 0 0;">Sequential FY GST financial audit log of all tax invoices issued.</p>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            ${this.renderDateFilterBar()}
            <input type="text" id="input-search-invoices" class="input-field" placeholder="🔍 Search Invoice # / Table..." value="${this.searchQuery}" style="width:240px; padding:8px 12px; font-size:0.85rem;" />
          </div>
        </div>

        <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-subtle);">
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                <th style="padding:12px 16px;">Invoice Number</th>
                <th style="padding:12px 16px;">FY</th>
                <th style="padding:12px 16px;">Table</th>
                <th style="padding:12px 16px;">Session ID</th>
                <th style="padding:12px 16px; text-align:right;">Taxable Value</th>
                <th style="padding:12px 16px; text-align:right;">Grand Total</th>
                <th style="padding:12px 16px;">Cashier</th>
                <th style="padding:12px 16px; text-align:right;">Issued Time</th>
                <th style="padding:12px 16px; text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${invoices.length > 0 ? invoices.map(i => `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:12px 16px; font-weight:800; color:var(--accent-primary);">${i.invoiceNumber}</td>
                  <td style="padding:12px 16px; color:var(--text-muted);">${i.financialYear || '2026-27'}</td>
                  <td style="padding:12px 16px; font-weight:700;">Table ${i.tableNumber}</td>
                  <td style="padding:12px 16px; color:var(--text-muted); font-family:monospace;">${i.sessionId}</td>
                  <td style="padding:12px 16px; text-align:right;">₹${(i.taxableAmount || 0).toFixed(2)}</td>
                  <td style="padding:12px 16px; text-align:right; font-weight:800; color:var(--text-primary);">₹${i.grandTotal.toFixed(2)}</td>
                  <td style="padding:12px 16px; font-weight:600;">${i.cashierName}</td>
                  <td style="padding:12px 16px; text-align:right; color:var(--text-muted);">${new Date(i.issuedAt || i.created_at || i.createdAt || Date.now()).toLocaleDateString([], { month:'short', day:'numeric' })} ${new Date(i.issuedAt || i.created_at || i.createdAt || Date.now()).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</td>
                  <td style="padding:12px 16px; text-align:center;">
                    <button class="btn-secondary btn-reprint-invoice" data-session-id="${i.sessionId}" style="padding:4px 8px; font-size:0.75rem; font-weight:700;">🖨 Reprint</button>
                  </td>
                </tr>
              `).join('') : `
                <tr><td colspan="9" style="padding:24px; text-align:center; color:var(--text-muted);">No issued tax invoices found for selected period (${this.dateFilter.toUpperCase()}).</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderPaymentsLedger() {
    const tenant = tenantModel.getPrimaryTenant() || {};
    const tenantId = tenant.tenantId || 'tenant_h0qc7wf';
    let payments = paymentModel.getAllPayments(tenantId);
    payments = this.filterRecordsByDateRange(payments, this.dateFilter, 'receivedAt');

    return `
      <div style="display:flex; flex-direction:column; width:100%; padding:20px; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
          <div>
            <h3 style="font-size:1.4rem; margin:0; font-weight:800;">💳 Immutable Payments Ledger</h3>
            <p style="color:var(--text-muted); font-size:0.85rem; margin:2px 0 0;">Read-only financial ledger of all settled payment transactions (CASH, UPI, CARD).</p>
          </div>
          ${this.renderDateFilterBar()}
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
                  <td style="padding:12px 16px; font-family:monospace; color:var(--text-muted);">${p.paymentId || p.id}</td>
                  <td style="padding:12px 16px; font-weight:800; color:var(--accent-primary);">${p.invoiceNumber}</td>
                  <td style="padding:12px 16px; font-weight:700;">Table ${p.tableNumber || 1}</td>
                  <td style="padding:12px 16px; text-align:center;"><span class="badge badge-success">${p.paymentMethod}</span></td>
                  <td style="padding:12px 16px; font-size:0.8rem; color:var(--text-muted);">${p.referenceNo || '—'}</td>
                  <td style="padding:12px 16px; text-align:right; font-weight:800; color:var(--status-success);">₹${p.amount.toFixed(2)}</td>
                  <td style="padding:12px 16px; font-weight:600;">${p.receivedByName || 'Cashier'}</td>
                  <td style="padding:12px 16px; text-align:right; color:var(--text-muted);">${new Date(p.receivedAt || p.created_at || p.createdAt || Date.now()).toLocaleDateString([], { month:'short', day:'numeric' })} ${new Date(p.receivedAt || p.created_at || p.createdAt || Date.now()).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</td>
                </tr>
              `).join('') : `
                <tr><td colspan="8" style="padding:24px; text-align:center; color:var(--text-muted);">No settled payment records found for selected period (${this.dateFilter.toUpperCase()}).</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderCashierReports() {
    const tenant = tenantModel.getPrimaryTenant() || {};
    const tenantId = tenant.tenantId || 'tenant_h0qc7wf';
    let payments = paymentModel.getAllPayments(tenantId);
    let invoices = invoiceModel.getAllInvoices(tenantId);

    payments = this.filterRecordsByDateRange(payments, this.dateFilter, 'receivedAt');
    invoices = this.filterRecordsByDateRange(invoices, this.dateFilter, 'issuedAt');

    let grossSales = 0;
    let totalDiscounts = 0;
    let upiTotal = 0;
    let cashTotal = 0;
    let cardTotal = 0;

    invoices.forEach(inv => {
      grossSales += (inv.grossSales || inv.grandTotal);
      totalDiscounts += (inv.discountsTotal || 0);
    });

    payments.forEach(p => {
      if (p.paymentMethod === 'UPI') upiTotal += p.amount;
      else if (p.paymentMethod === 'CASH') cashTotal += p.amount;
      else if (p.paymentMethod === 'CARD') cardTotal += p.amount;
    });

    const netSales = grossSales - totalDiscounts;
    const estTax = Math.round(netSales * 0.05 * 100) / 100;
    const estServiceCharge = Math.round(netSales * 0.05 * 100) / 100;

    return `
      <div style="display:flex; flex-direction:column; width:100%; padding:20px; overflow-y:auto; gap:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h3 style="font-size:1.4rem; margin:0; font-weight:800;">📊 Financial Report & Tax Breakdown</h3>
            <p style="color:var(--text-muted); font-size:0.85rem; margin:2px 0 0;">Gross sales, discounts, taxable value, GST liability, and payment method totals.</p>
          </div>
          ${this.renderDateFilterBar()}
        </div>

        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:16px;">
          <div class="card" style="padding:16px; background:var(--bg-surface-2); border-left:4px solid var(--accent-primary);">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">GROSS SALES (${this.dateFilter.toUpperCase()})</div>
            <div style="font-size:1.8rem; font-weight:800; color:var(--accent-primary); margin-top:4px;">₹${grossSales.toFixed(2)}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">${invoices.length} Issued Invoices</div>
          </div>
          <div class="card" style="padding:16px; background:var(--bg-surface-2); border-left:4px solid #3b82f6;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">📱 UPI / QR TOTAL</div>
            <div style="font-size:1.8rem; font-weight:800; color:#3b82f6; margin-top:4px;">₹${upiTotal.toFixed(2)}</div>
          </div>
          <div class="card" style="padding:16px; background:var(--bg-surface-2); border-left:4px solid #10b981;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">💵 CASH TOTAL</div>
            <div style="font-size:1.8rem; font-weight:800; color:#10b981; margin-top:4px;">₹${cashTotal.toFixed(2)}</div>
          </div>
          <div class="card" style="padding:16px; background:var(--bg-surface-2); border-left:4px solid #8b5cf6;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">💳 CARD TOTAL</div>
            <div style="font-size:1.8rem; font-weight:800; color:#8b5cf6; margin-top:4px;">₹${cardTotal.toFixed(2)}</div>
          </div>
        </div>

        <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); max-width:600px;">
          <h4 style="margin:0 0 12px; font-weight:800; font-size:1.1rem;">🏛️ CA GST Reconciliation Summary</h4>
          <div style="display:flex; flex-direction:column; gap:8px; font-size:0.9rem;">
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-subtle); padding-bottom:6px;">
              <span>Gross Commercial Sales:</span> <strong>₹${grossSales.toFixed(2)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-subtle); padding-bottom:6px; color:var(--status-warning);">
              <span>Total Discounts Allowed:</span> <strong>-₹${totalDiscounts.toFixed(2)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-subtle); padding-bottom:6px; font-weight:700;">
              <span>Net Taxable Sales:</span> <strong>₹${netSales.toFixed(2)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-subtle); padding-bottom:6px;">
              <span>CGST Collected (2.5%):</span> <strong>₹${(estTax / 2).toFixed(2)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-subtle); padding-bottom:6px;">
              <span>SGST Collected (2.5%):</span> <strong>₹${(estTax / 2).toFixed(2)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-subtle); padding-bottom:6px;">
              <span>Service Charge Collected (5%):</span> <strong>₹${estServiceCharge.toFixed(2)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-weight:800; color:var(--accent-primary); font-size:1rem; padding-top:4px;">
              <span>Total Net Billing Liability:</span> <span>₹${(netSales + estTax + estServiceCharge).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderMyShiftView() {
    const sessionUser = this.authEngine ? this.authEngine.getCurrentSession() : null;
    const cashierName = sessionUser ? (sessionUser.employeeName || sessionUser.name || 'Cashier') : 'Cashier Desk';
    const tenant = tenantModel.getPrimaryTenant() || {};
    const tenantId = tenant.tenantId || 'tenant_h0qc7wf';
    const payments = paymentModel.getAllPayments(tenantId);

    const cashTotal = payments.filter(p => p.paymentMethod === 'CASH').reduce((sum, p) => sum + p.amount, 0);

    return `
      <div style="display:flex; flex-direction:column; width:100%; padding:20px; overflow-y:auto; gap:20px;">
        <div>
          <h3 style="font-size:1.4rem; margin:0; font-weight:800;">🕐 Cashier Shift & Drawer Handover</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin:2px 0 0;">Active shift status, cash drawer float, and shift closing handover checklist.</p>
        </div>

        <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); max-width:640px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">ACTIVE SHIFT SESSION</div>
              <div style="font-size:1.2rem; font-weight:800; color:var(--text-primary);">${cashierName}</div>
            </div>
            <span class="badge badge-success" style="font-size:0.85rem; font-weight:800;">🟢 Shift Active</span>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
              <div style="font-size:0.75rem; color:var(--text-muted);">Opening Cash Float:</div>
              <div style="font-size:1.2rem; font-weight:800; color:var(--text-primary); margin-top:2px;">₹2,000.00</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
              <div style="font-size:0.75rem; color:var(--text-muted);">Cash Collected Today:</div>
              <div style="font-size:1.2rem; font-weight:800; color:#10b981; margin-top:2px;">₹${cashTotal.toFixed(2)}</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px; grid-column:span 2;">
              <div style="font-size:0.75rem; color:var(--text-muted);">Expected Cash Drawer Total:</div>
              <div style="font-size:1.6rem; font-weight:800; color:var(--accent-primary); margin-top:2px;">₹${(2000 + cashTotal).toFixed(2)}</div>
            </div>
          </div>

          <button id="btn-close-shift-drawer" class="btn-secondary" style="padding:10px 16px; font-weight:700; color:var(--status-warning); border-color:var(--status-warning);">
            🔒 End Shift & Reconcile Cash Drawer
          </button>
        </div>
      </div>
    `;
  }

  bindEvents() {
    if (!this.container) return;

    // Date range filter buttons handler
    this.container.querySelectorAll('.btn-date-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        this.dateFilter = btn.dataset.dateFilter;
        const sessionUser = this.authEngine ? this.authEngine.getCurrentSession() : null;
        this.updateContent(sessionUser);
      });
    });

    // KPI cards click handler -> sets subtab
    this.container.querySelectorAll('.kpi-card').forEach(card => {
      card.addEventListener('click', () => {
        this.activeMainTab = 'inbox';
        this.inboxSubTab = card.dataset.subtab;
        const sessionUser = this.authEngine ? this.authEngine.getCurrentSession() : null;
        this.updateContent(sessionUser);
      });
    });

    // Inbox subtab buttons -> sets subtab
    this.container.querySelectorAll('.btn-inbox-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeMainTab = 'inbox';
        this.inboxSubTab = btn.dataset.subtab;
        const sessionUser = this.authEngine ? this.authEngine.getCurrentSession() : null;
        this.updateContent(sessionUser);
      });
    });

    // Reprint buttons in Invoice Register
    this.container.querySelectorAll('.btn-reprint-invoice').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.sessionId;
        const modal = new TaxInvoicePrintModal({
          sessionId: sid,
          onClose: () => {}
        });
        const mount = this.container.querySelector('#cashier-modal-mount');
        if (mount) mount.appendChild(modal.render());
      });
    });

    // Search query listener for Invoice Register
    const searchInput = this.container.querySelector('#input-search-invoices');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        const sessionUser = this.authEngine ? this.authEngine.getCurrentSession() : null;
        this.updateContent(sessionUser);
      });
    }

    // Shift close drawer handler
    const closeShiftBtn = this.container.querySelector('#btn-close-shift-drawer');
    if (closeShiftBtn) {
      closeShiftBtn.addEventListener('click', () => {
        alert('🔒 Cash Drawer Reconciled! Shift ending report generated for manager audit.');
      });
    }

    this.bindInboxEvents();
  }

  bindInboxEvents() {
    if (!this.container) return;

    // Bill inbox card click selection
    this.container.querySelectorAll('.bill-inbox-card').forEach(card => {
      card.addEventListener('click', () => {
        this.selectedSessionId = card.dataset.sessionId;
        this.selectedRevisionIndex = null;
        const sessionUser = this.authEngine ? this.authEngine.getCurrentSession() : null;
        this.updateContent(sessionUser);
      });
    });

    // Revision version selector change
    const revSelect = this.container.querySelector('#select-revision-version');
    if (revSelect) {
      revSelect.addEventListener('change', (e) => {
        this.selectedRevisionIndex = parseInt(e.target.value, 10);
        const sessionUser = this.authEngine ? this.authEngine.getCurrentSession() : null;
        this.updateContent(sessionUser);
      });
    }

    // View Session Audit Trail Modal Trigger
    const auditBtn = this.container.querySelector('#btn-view-session-audit');
    if (auditBtn) {
      auditBtn.addEventListener('click', () => {
        if (!this.selectedSessionId) return;
        this.openAuditTrailModal(this.selectedSessionId);
      });
    }

    // 1. Recall to Waiter Action (Guarded)
    const recallBtn = this.container.querySelector('#btn-cashier-recall');
    if (recallBtn) {
      recallBtn.addEventListener('click', () => {
        if (!this.selectedSessionId) return;
        const reason = prompt('Enter reason for recalling bill to Waiter:', 'Item order modification required');
        if (reason === null) return;

        const res = sessionStateMachine.recallBill(this.selectedSessionId, reason, 'CASHIER');
        if (res && res.success) {
          alert(`↩ Bill for Session ${this.selectedSessionId} recalled to Waiter console! Session state updated to WAITER_REVISION_REQUIRED.`);
          const sessionUser = this.authEngine ? this.authEngine.getCurrentSession() : null;
          this.updateContent(sessionUser);
        } else {
          alert(`Cannot recall bill: ${res ? res.error : 'Unknown error'}`);
        }
      });
    }

    // CA Flagged Discrepancy: Cashier Settle Banner Button
    const btnSettleFlagged = this.container.querySelector('.btn-cashier-settle-flagged');
    if (btnSettleFlagged) {
      btnSettleFlagged.addEventListener('click', () => {
        const excId = btnSettleFlagged.dataset.excId;
        const invNumber = btnSettleFlagged.dataset.invNumber;
        const sessId = btnSettleFlagged.dataset.sessId;
        const diff = parseFloat(btnSettleFlagged.dataset.diff) || 0;

        const pAmt = Math.abs(diff) || 100;
        const method = prompt(`Record Missing Settlement for Flagged Invoice ${invNumber}:\nEnter Payment Method (CASH / UPI / CARD):`, 'UPI');
        if (!method) return;

        const refNo = prompt(`Enter Transaction Reference Number (e.g. UPI/984271039 or Cash Receipt Ref):`, `REF-${Math.floor(100000 + Math.random() * 900000)}`);
        if (!refNo) return;

        paymentModel.recordPayment({
          sessionId: sessId,
          invoiceNumber: invNumber,
          amount: pAmt,
          paymentMethod: method.toUpperCase(),
          referenceNo: refNo,
          status: 'SETTLED',
          notes: 'Settled by Cashier via CA Discrepancy Resolution Banner'
        });

        accountingProjectionService.proposeResolution(excId, {
          resolutionType: 'PAYMENT_RECORDED',
          resolutionReason: `Settled by Cashier: ₹${pAmt} via ${method.toUpperCase()} (${refNo})`
        }, 'Cashier');

        alert(`✅ Settlement of ₹${pAmt} recorded for ${invNumber}!\n\nDiscrepancy resolution sent to CA for review.`);
        this.updateContent();
      });
    }

    // 2. Print Draft / Invoice Action
    const printBtn = this.container.querySelector('#btn-cashier-print');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        if (!this.selectedSessionId) return;
        const modal = new TaxInvoicePrintModal({
          sessionId: this.selectedSessionId,
          revisionIndex: this.selectedRevisionIndex,
          onClose: () => {}
        });
        const mount = this.container.querySelector('#cashier-modal-mount');
        if (mount) mount.appendChild(modal.render());
      });
    }

    // 3. Finalize & Issue Tax Invoice Action (via invoiceModel.js)
    const issueInvBtn = this.container.querySelector('#btn-cashier-issue-inv');
    if (issueInvBtn) {
      issueInvBtn.addEventListener('click', () => {
        if (!this.selectedSessionId) return;
        const sessionUser = this.authEngine ? this.authEngine.getCurrentSession() : null;
        const cashierId = sessionUser ? (sessionUser.employeeId || sessionUser.id || 'emp-cashier') : 'emp-cashier';
        const cashierName = sessionUser ? (sessionUser.employeeName || sessionUser.name || 'Cashier') : 'Cashier Desk';

        const invRecord = invoiceModel.issueInvoice({
          sessionId: this.selectedSessionId,
          cashierId,
          cashierName
        });

        alert(`📜 Official GST Tax Invoice ${invRecord.invoiceNumber} (FY ${invRecord.financialYear}) Finalized & Issued! Recall to Waiter is now locked.`);
        this.updateContent(sessionUser);
      });
    }

    // 4. Record Payment Action
    const markPaidBtn = this.container.querySelector('#btn-cashier-mark-paid');
    if (markPaidBtn) {
      markPaidBtn.addEventListener('click', () => {
        if (!this.selectedSessionId) return;
        this.openPaymentModal(this.selectedSessionId);
      });
    }
  }

  openAuditTrailModal(sessionId) {
    const logs = sessionAuditModel.getAuditLogsForSession(sessionId);
    const proj = sessionProjectionService.getSessionProjection(sessionId);

    const modalEl = document.createElement('div');
    modalEl.className = 'lock-screen-overlay animate-fade-in';
    modalEl.style.zIndex = '99999';
    modalEl.style.display = 'flex';
    modalEl.style.alignItems = 'center';
    modalEl.style.justifyContent = 'center';

    modalEl.innerHTML = `
      <div class="card animate-fade-in" style="max-width:680px; width:92%; max-height:85vh; display:flex; flex-direction:column; padding:24px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); box-shadow:var(--shadow-xl); border-radius:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">CA AUDIT TRAIL LOG</div>
            <h3 style="font-size:1.3rem; margin:2px 0 0; font-weight:800;">Table ${proj ? proj.tableNumber : ''} • Session ${sessionId}</h3>
          </div>
          <button id="btn-close-audit-modal" class="btn-secondary" style="padding:4px 10px; cursor:pointer;">✕</button>
        </div>

        <div style="flex:1; overflow-y:auto; padding-right:8px;">
          ${logs.length > 0 ? `
            <div style="display:flex; flex-direction:column; gap:12px;">
              ${logs.map(log => `
                <div style="background:var(--bg-surface-2); padding:10px 14px; border-radius:6px; border-left:4px solid var(--accent-primary);">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span class="badge badge-info" style="font-size:0.7rem; font-weight:800;">${log.eventType}</span>
                    <span style="font-size:0.75rem; color:var(--text-muted);">${new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div style="font-size:0.85rem; font-weight:700; color:var(--text-primary);">${log.description}</div>
                  <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">
                    Actor: <strong>${log.actorName}</strong> (${log.actorRole}) • Event ID: <code style="font-size:0.7rem;">${log.eventId}</code>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="text-align:center; padding:30px; color:var(--text-muted);">
              No audit log entries recorded for this session yet.
            </div>
          `}
        </div>
      </div>
    `;

    const closeBtn = modalEl.querySelector('#btn-close-audit-modal');
    if (closeBtn) closeBtn.addEventListener('click', () => modalEl.remove());

    const mount = this.container.querySelector('#cashier-modal-mount');
    if (mount) mount.appendChild(modalEl);
  }

  openPaymentModal(sessionId) {
    const proj = sessionProjectionService.getSessionProjection(sessionId);
    const revisions = billRevisionModel.getRevisionsForSession(sessionId);
    const latestRev = revisions.length > 0 ? revisions[revisions.length - 1] : null;
    const invoice = invoiceModel.getInvoiceForSession(sessionId);

    const amount = invoice ? invoice.grandTotal : (latestRev ? latestRev.grandTotal : (proj ? proj.grandTotal : 0));
    
    // Ensure invoice is issued or retrieve existing invoice number
    let invoiceNo = invoice ? invoice.invoiceNumber : (latestRev ? latestRev.invoiceNumber : null);
    if (!invoiceNo) {
      const sessionUser = this.authEngine ? this.authEngine.getCurrentSession() : null;
      const cashierId = sessionUser ? (sessionUser.employeeId || sessionUser.id || 'emp-cashier') : 'emp-cashier';
      const cashierName = sessionUser ? (sessionUser.employeeName || sessionUser.name || 'Cashier') : 'Cashier Desk';
      const issued = invoiceModel.issueInvoice({ sessionId, cashierId, cashierName });
      invoiceNo = issued.invoiceNumber;
    }

    const tableNo = proj ? proj.tableNumber : (latestRev ? latestRev.tableNumber : 1);

    const modalEl = document.createElement('div');
    modalEl.className = 'lock-screen-overlay animate-fade-in';
    modalEl.style.zIndex = '99999';
    modalEl.style.display = 'flex';
    modalEl.style.alignItems = 'center';
    modalEl.style.justifyContent = 'center';

    modalEl.innerHTML = `
      <div class="card animate-fade-in" style="max-width:480px; width:92%; padding:24px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); box-shadow:var(--shadow-xl); border-radius:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">RECORD PAYMENT SETTLEMENT</div>
            <h3 style="font-size:1.3rem; margin:2px 0 0; font-weight:800;">Table ${tableNo} • Invoice ${invoiceNo}</h3>
          </div>
          <button id="btn-close-pay-modal" class="btn-secondary" style="padding:4px 10px; cursor:pointer;">✕</button>
        </div>

        <div style="margin-bottom:16px; background:var(--bg-surface-2); padding:12px; border-radius:6px; text-align:center;">
          <div style="font-size:0.85rem; color:var(--text-muted);">Amount Due:</div>
          <div style="font-size:2rem; font-weight:800; color:var(--accent-primary);">₹${amount.toFixed(2)}</div>
        </div>

        <div style="margin-bottom:16px;">
          <label style="font-size:0.85rem; font-weight:700; display:block; margin-bottom:8px;">Select Payment Method:</label>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
            <button class="btn-pay-method active" data-method="UPI" style="padding:12px 8px; font-weight:700; border-radius:8px; border:2px solid var(--accent-primary); background:var(--bg-surface-2); cursor:pointer;">
              📱 UPI / QR
            </button>
            <button class="btn-pay-method" data-method="CASH" style="padding:12px 8px; font-weight:700; border-radius:8px; border:2px solid var(--border-subtle); background:var(--bg-surface-2); cursor:pointer;">
              💵 Cash
            </button>
            <button class="btn-pay-method" data-method="CARD" style="padding:12px 8px; font-weight:700; border-radius:8px; border:2px solid var(--border-subtle); background:var(--bg-surface-2); cursor:pointer;">
              💳 Card
            </button>
          </div>
        </div>

        <div style="margin-bottom:20px;">
          <label style="font-size:0.85rem; font-weight:700; display:block; margin-bottom:4px;">Reference No. / Notes (Optional):</label>
          <input type="text" id="input-pay-ref" class="input-field w-full" placeholder="e.g. UPI Ref # 984729103" style="padding:10px; font-size:0.9rem;" />
        </div>

        <button id="btn-confirm-payment-final" class="btn-primary w-full" style="padding:12px; font-weight:800; font-size:1.05rem; background:var(--status-success); color:#000; cursor:pointer;">
          ✅ Confirm Payment Settlement (₹${amount.toFixed(2)})
        </button>
      </div>
    `;

    let selectedMethod = 'UPI';
    const methodBtns = modalEl.querySelectorAll('.btn-pay-method');
    methodBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        methodBtns.forEach(b => {
          b.style.borderColor = 'var(--border-subtle)';
          b.classList.remove('active');
        });
        btn.style.borderColor = 'var(--accent-primary)';
        btn.classList.add('active');
        selectedMethod = btn.dataset.method;
      });
    });

    const closeBtn = modalEl.querySelector('#btn-close-pay-modal');
    if (closeBtn) closeBtn.addEventListener('click', () => modalEl.remove());

    const confirmBtn = modalEl.querySelector('#btn-confirm-payment-final');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        const refNo = modalEl.querySelector('#input-pay-ref').value;
        const sessionUser = this.authEngine ? this.authEngine.getCurrentSession() : null;
        const cashierId = sessionUser ? (sessionUser.employeeId || sessionUser.id || 'emp-cashier') : 'emp-cashier';
        const cashierName = sessionUser ? (sessionUser.employeeName || sessionUser.name || 'Cashier') : 'Cashier Desk';

        // 1. Record immutable payment record via paymentModel (linked to invoiceNo)
        const paymentRecord = paymentModel.recordPayment({
          sessionId,
          invoiceNumber: invoiceNo,
          amount,
          paymentMethod: selectedMethod,
          referenceNo: refNo,
          receivedBy: cashierId,
          receivedByName: cashierName
        });

        // 2. Transition session milestone to PAYMENT_RECEIVED & table to PAID_CLEARING
        sessionStateMachine.transitionMilestone(sessionId, SessionMilestones.PAYMENT_RECEIVED);
        sessionModel.updateSession(sessionId, { billStatus: 'PAID', paymentStatus: 'SETTLED' });
        tableStateMachine.transitionTableState(tableNo, PhysicalTableStates.PAID_CLEARING);

        platformEventBus.publish('table:state:changed', {
          tableNumber: tableNo,
          newState: PhysicalTableStates.PAID_CLEARING,
          sessionId
        });

        alert(`✅ Payment ${paymentRecord.paymentId} of ₹${amount.toFixed(2)} via ${selectedMethod} SETTLED for Table ${tableNo}! Invoice: ${paymentRecord.invoiceNumber}. Table status set to PAID / CLEARING.`);
        modalEl.remove();
        this.updateContent(sessionUser);
      });
    }

    const mount = this.container.querySelector('#cashier-modal-mount');
    if (mount) mount.appendChild(modalEl);
  }
}
