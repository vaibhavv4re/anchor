/**
 * RestaurantOS - Phase M3: Manager Exceptions & Approvals View
 * Prioritized exception queue with full evidence payloads (Who -> What -> Where -> When -> Why -> Manager Action).
 * Persists resolutions directly into billRevisionModel and sessionAuditModel audit trail.
 */

import { managerProjectionService } from '../../../../../businessos/platform/manager/managerProjectionService.js';
import { billRevisionModel } from '../../../../../businessos/platform/billing/billRevisionModel.js';
import { sessionAuditModel } from '../../../../../businessos/platform/session/sessionAuditModel.js';
import { orderModel } from '../../../../../businessos/platform/ordering/orderModel.js';
import { sessionModel } from '../../../../../businessos/platform/session/sessionModel.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { ManagerTableInspectorModal } from './ManagerTableInspectorModal.js';

export class ExceptionsView {
  constructor(deps = {}) {
    this.tenantId = deps.tenantId || null;
    this.activeFilter = 'ALL'; // 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO' | 'RESOLVED'
    this.container = null;
    this.resolvedLog = [];
    this.unsubscribeEvents = [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'exceptions-view flex-col gap-lg animate-fade-in';
    this.container.style.width = '100%';

    this.subscribePlatformEvents();
    this.updateContent();

    return this.container;
  }

  subscribePlatformEvents() {
    const refresh = () => {
      if (this.container && document.body.contains(this.container)) {
        this.updateContent();
      }
    };
    this.unsubscribeEvents = [
      platformEventBus.subscribe('ticket:status_changed', refresh),
      platformEventBus.subscribe('bill:revision:created', refresh),
      platformEventBus.subscribe('discount:approved', refresh),
      platformEventBus.subscribe('discount:rejected', refresh),
      platformEventBus.subscribe('exception:resolved', refresh)
    ];
  }

  updateContent() {
    if (!this.container) return;

    const projection = managerProjectionService.getOperationalProjection(this.tenantId);
    const queue = projection.needsAttentionQueue || [];

    const criticalItems = queue.filter(e => e.severity === 'HIGH');
    const highItems = queue.filter(e => e.type === 'RECALLED_BILL' || e.type === 'DISCOUNT_APPROVAL');
    const mediumItems = queue.filter(e => e.type === 'PICKUP_LAG' || (e.severity === 'MEDIUM' && e.type !== 'DISCOUNT_APPROVAL'));
    const infoItems = queue.filter(e => e.severity === 'LOW');

    // Filter displayed queue
    let displayedQueue = queue;
    if (this.activeFilter === 'CRITICAL') displayedQueue = criticalItems;
    else if (this.activeFilter === 'HIGH') displayedQueue = highItems;
    else if (this.activeFilter === 'MEDIUM') displayedQueue = mediumItems;
    else if (this.activeFilter === 'INFO') displayedQueue = infoItems;

    const formatCurrency = (val) => '₹' + Number(val || 0).toLocaleString('en-IN');

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h2 style="font-size:1.5rem; margin:0;">⚠️ Exceptions & Approvals Queue (Phase M3)</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Prioritized operational exceptions with full evidence payloads & resolution audit trail.</p>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <button class="btn-secondary" id="btn-seed-test-exceptions" style="padding:6px 14px; font-size:0.82rem; color:var(--accent-primary); border-color:var(--accent-primary);">
            ⚡ Seed Test Exceptions (1-Click)
          </button>
          <div class="badge badge-warning" style="font-size:0.85rem; padding:6px 14px;">
            ${queue.length} Active Exceptions Requiring Action
          </div>
        </div>
      </div>

      <!-- Severity Filter Toolbar -->
      <div style="display:flex; gap:8px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px; margin-bottom:16px; flex-wrap:wrap;">
        <button class="btn-secondary filter-tab-btn ${this.activeFilter === 'ALL' ? 'active' : ''}" data-filter="ALL" style="padding:8px 14px; font-size:0.82rem;">
          All Exceptions (${queue.length})
        </button>
        <button class="btn-secondary filter-tab-btn ${this.activeFilter === 'CRITICAL' ? 'active' : ''}" data-filter="CRITICAL" style="padding:8px 14px; font-size:0.82rem; color:#ef4444;">
          🔴 Critical (${criticalItems.length})
        </button>
        <button class="btn-secondary filter-tab-btn ${this.activeFilter === 'HIGH' ? 'active' : ''}" data-filter="HIGH" style="padding:8px 14px; font-size:0.82rem; color:#f59e0b;">
          🟠 High (${highItems.length})
        </button>
        <button class="btn-secondary filter-tab-btn ${this.activeFilter === 'MEDIUM' ? 'active' : ''}" data-filter="MEDIUM" style="padding:8px 14px; font-size:0.82rem; color:#3b82f6;">
          🟡 Medium (${mediumItems.length})
        </button>
        <button class="btn-secondary filter-tab-btn ${this.activeFilter === 'RESOLVED' ? 'active' : ''}" data-filter="RESOLVED" style="padding:8px 14px; font-size:0.82rem; color:#10b981;">
          📜 Shift Audit Log (${this.resolvedLog.length})
        </button>
      </div>

      <!-- Main Queue Mount -->
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${this.activeFilter === 'RESOLVED' ? this.renderResolvedLog() : (
          displayedQueue.length === 0 ? `
            <div class="card" style="padding:32px; text-align:center; background:var(--bg-surface-1); border-left:4px solid #10b981;">
              <div style="font-size:2rem;">🟢</div>
              <h3 style="margin:8px 0 4px 0; color:#10b981;">Zero Active Exceptions in this Category</h3>
              <p style="color:var(--text-muted); font-size:0.85rem; margin:0;">All kitchen orders, bill revisions, and guest services are running within operational SLA parameters.</p>
            </div>
          ` : displayedQueue.map(exp => this.renderEvidenceCard(exp)).join('')
        )}
      </div>

      <div id="exceptions-modal-mount"></div>
    `;

    this.bindEvents();
  }

  renderEvidenceCard(exp) {
    const borderColors = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#3b82f6' };
    const bColor = borderColors[exp.severity] || '#f59e0b';
    const formatCurrency = (val) => '₹' + Number(val || 0).toLocaleString('en-IN');

    // Fetch detailed evidence metrics
    const session = exp.sessionId ? sessionModel.getSession(exp.sessionId, this.tenantId) : (exp.tableNumber ? sessionModel.getActiveSessionForTable(exp.tableNumber, this.tenantId) : null);
    const sId = session ? (session.id || session.sessionId) : exp.sessionId;
    const orders = sId ? orderModel.getOrdersForSession(sId, this.tenantId) : [];
    const latestOrder = orders.length > 0 ? orders[orders.length - 1] : null;
    const revisions = sId ? billRevisionModel.getRevisionsForSession(sId, this.tenantId) : [];
    const latestRev = revisions.length > 0 ? revisions[revisions.length - 1] : null;

    const tableLabel = exp.tableLabel || (session ? (session.tableCode || `Table ${session.tableNumber}`) : `Table ${exp.tableNumber || '01'}`);
    const waiterName = session ? (session.assignedWaiterName || session.waiterName || 'Suresh') : 'Server';
    const guestCount = session ? (session.guestCount || 2) : 2;

    return `
      <div class="card exception-evidence-card animate-fade-in" style="padding:20px; background:var(--bg-surface-1); border-left:6px solid ${bColor}; border-radius:8px; display:flex; flex-direction:column; gap:14px;">
        
        <!-- Top Title & Badge Strip -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="badge" style="background:${bColor}22; color:${bColor}; border:1px solid ${bColor}; font-size:0.75rem; font-weight:700;">
                ${exp.severity} SEVERITY
              </span>
              <span style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">TYPE: ${exp.type}</span>
            </div>
            <h3 style="font-size:1.2rem; margin:6px 0 2px 0; color:var(--text-primary);">${exp.title}</h3>
            <div style="font-size:0.85rem; color:var(--text-secondary);">${exp.subtitle}</div>
          </div>
          <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">
            ⏱️ Reported: ${new Date(exp.timestamp || Date.now()).toLocaleTimeString()}
          </span>
        </div>

        <!-- Evidence Grid Payload (Who -> What -> Where -> When -> Why) -->
        <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px; font-size:0.825rem;">
          <div>
            <span style="color:var(--text-muted); display:block; font-size:0.725rem; font-weight:600;">WHERE (LOCATION)</span>
            <strong style="color:var(--text-primary);">${tableLabel}</strong>
          </div>
          <div>
            <span style="color:var(--text-muted); display:block; font-size:0.725rem; font-weight:600;">WHO (SESSION & SERVER)</span>
            <strong style="color:var(--text-primary);">${guestCount} Guests · ${waiterName}</strong>
          </div>
          <div>
            <span style="color:var(--text-muted); display:block; font-size:0.725rem; font-weight:600;">WHAT (IDENTIFIERS)</span>
            <strong style="color:var(--text-primary); font-family:monospace;">${latestOrder ? String(latestOrder.orderNumber || latestOrder.id).substring(0, 10) : (latestRev ? `Rev #${latestRev.revisionNumber}` : 'N/A')}</strong>
          </div>
          <div>
            <span style="color:var(--text-muted); display:block; font-size:0.725rem; font-weight:600;">WHEN (ELAPSED TIME)</span>
            <strong style="color:#ef4444;">${exp.elapsedMin ? `${exp.elapsedMin} min elapsed` : (exp.lagMin ? `${exp.lagMin} min lag` : 'Active')}</strong>
          </div>
        </div>

        ${exp.type === 'DISCOUNT_APPROVAL' && latestRev ? `
          <!-- Discount Request Evidence Payload -->
          <div style="background:var(--bg-surface-2); border:1px solid #3b82f6; padding:12px 14px; border-radius:6px; font-size:0.85rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div>
              <div style="font-weight:700; color:#3b82f6;">DISCOUNT APPROVAL EVIDENCE PAYLOAD</div>
              <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:2px;">
                Gross Sales: <strong>${formatCurrency(latestRev.grossSales)}</strong> • Requested Discount: <strong style="color:#ef4444;">${formatCurrency(latestRev.discountsTotal)}</strong> (${((latestRev.discountsTotal / (latestRev.grossSales || 1)) * 100).toFixed(1)}%)
              </div>
              <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">Stated Reason: <em>"${latestRev.discountRecords?.[0]?.reason || 'Manager Courtesy'}"</em></div>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="btn-secondary btn-reject-discount" data-rev-id="${latestRev.id}" style="padding:6px 14px; font-size:0.8rem; border-color:#ef4444; color:#ef4444;">
                ❌ Reject Discount
              </button>
              <button class="btn-primary btn-approve-discount" data-rev-id="${latestRev.id}" style="padding:6px 16px; font-size:0.8rem; background:#10b981; color:#000; font-weight:700;">
                ✅ Approve ${formatCurrency(latestRev.discountsTotal)}
              </button>
            </div>
          </div>
        ` : ''}

        <!-- Evidence Items List Breakdown -->
        ${latestOrder && Array.isArray(latestOrder.items) && latestOrder.items.length > 0 ? `
          <div style="font-size:0.8rem; color:var(--text-secondary);">
            <div style="font-weight:600; color:var(--text-muted); margin-bottom:4px;">ITEMS INVOLVED (${latestOrder.items.length}):</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${latestOrder.items.map(it => `
                <span class="badge" style="background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-primary); font-size:0.75rem;">
                  ${it.quantity}x ${it.name || it.itemName} (${it.itemStatus || 'QUEUED'})
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Manager Action Controls Bar -->
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-subtle); padding-top:12px; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; gap:8px;">
            <button class="btn-secondary btn-inspect-session" data-table="${exp.tableNumber || (session ? session.tableNumber : 1)}" data-session-id="${sId || ''}" style="padding:6px 14px; font-size:0.8rem;">
              🔍 Inspect Session
            </button>
            <button class="btn-secondary btn-view-audit" data-session-id="${sId || ''}" style="padding:6px 14px; font-size:0.8rem;">
              📜 View Audit Trail
            </button>
          </div>

          ${exp.type !== 'DISCOUNT_APPROVAL' ? `
            <button class="btn-primary btn-expedite-action" data-exp-id="${exp.id}" data-type="${exp.type}" style="padding:6px 16px; font-size:0.8rem;">
              🚀 Mark Expedited & Resolved
            </button>
          ` : ''}
        </div>

      </div>
    `;
  }

  renderResolvedLog() {
    if (this.resolvedLog.length === 0) {
      return `
        <div class="card" style="padding:32px; text-align:center; background:var(--bg-surface-1); border-left:4px solid #10b981;">
          <div style="font-size:2rem;">📜</div>
          <h3 style="margin:8px 0 4px 0;">No Resolved Exceptions in Shift Log Yet</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin:0;">When you approve discounts or expedite delayed KOTs, resolutions are logged here for full shift auditability.</p>
        </div>
      `;
    }

    const formatCurrency = (val) => '₹' + Number(val || 0).toLocaleString('en-IN');

    return `
      <div class="card" style="padding:20px; background:var(--bg-surface-1);">
        <h3 style="margin-top:0; font-size:1.1rem; border-bottom:1px solid var(--border-subtle); padding-bottom:10px;">
          📜 RESOLVED SHIFT AUDIT TRAIL LOG (${this.resolvedLog.length} Records)
        </h3>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${this.resolvedLog.map(log => `
            <div style="background:var(--bg-surface-2); padding:12px 14px; border-radius:6px; border-left:4px solid #10b981; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; font-size:0.85rem;">
              <div>
                <strong style="color:#10b981;">✅ ${log.action}</strong>
                <span style="color:var(--text-secondary); margin-left:8px;">${log.title}</span>
                <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">Resolved by: <strong>${log.actor}</strong> • ${log.details}</div>
              </div>
              <span style="font-size:0.75rem; color:var(--text-muted);">${new Date(log.timestamp).toLocaleTimeString()}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  bindEvents() {
    if (!this.container) return;

    // Filter tab switching
    this.container.querySelectorAll('.filter-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.activeFilter = e.currentTarget.dataset.filter;
        this.updateContent();
      });
    });

    // Inspect Session Modal
    this.container.querySelectorAll('.btn-inspect-session').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tableNumber = e.currentTarget.dataset.table;
        const sessionId = e.currentTarget.dataset.sessionId;
        const modal = new ManagerTableInspectorModal({
          tableNumber,
          sessionId,
          tenantId: this.tenantId,
          onClose: () => this.updateContent()
        });
        const mount = this.container.querySelector('#exceptions-modal-mount');
        if (mount) mount.appendChild(modal.render());
      });
    });

    // View Audit Trail Alert
    this.container.querySelectorAll('.btn-view-audit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sId = e.currentTarget.dataset.sessionId;
        const logs = sessionAuditModel.getAuditLogsForSession(sId, this.tenantId);
        alert(`📜 Session Audit Log (${logs.length} events logged):\n\n` + logs.map(l => `• [${new Date(l.timestamp).toLocaleTimeString()}] ${l.eventType}: ${l.actorName || 'System'}`).join('\n'));
      });
    });

    // Approve Discount Button
    this.container.querySelectorAll('.btn-approve-discount').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const revId = e.currentTarget.dataset.revId;
        const res = billRevisionModel.approveDiscount(revId, 'Operations Manager', this.tenantId);
        if (res.success) {
          sessionAuditModel.logEvent(res.revision.sessionId, 'DISCOUNT_APPROVED', {
            revisionId: revId,
            discountsTotal: res.revision.discountsTotal,
            actorName: 'Operations Manager'
          }, this.tenantId);

          this.resolvedLog.unshift({
            action: 'DISCOUNT APPROVED',
            title: `Bill Rev #${res.revision.revisionNumber} (Table ${res.revision.tableCode})`,
            actor: 'Operations Manager',
            details: `Approved ₹${res.revision.discountsTotal} discount courtesy`,
            timestamp: new Date().toISOString()
          });

          platformEventBus.publish('exception:resolved', { revisionId: revId });
          alert('✅ Discount request approved & recorded in Session Audit Trail!');
          this.updateContent();
        }
      });
    });

    // Reject Discount Button
    this.container.querySelectorAll('.btn-reject-discount').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const revId = e.currentTarget.dataset.revId;
        const res = billRevisionModel.rejectDiscount(revId, 'Operations Manager', this.tenantId);
        if (res.success) {
          sessionAuditModel.logEvent(res.revision.sessionId, 'DISCOUNT_REJECTED', {
            revisionId: revId,
            actorName: 'Operations Manager'
          }, this.tenantId);

          this.resolvedLog.unshift({
            action: 'DISCOUNT REJECTED',
            title: `Bill Rev #${res.revision.revisionNumber} (Table ${res.revision.tableCode})`,
            actor: 'Operations Manager',
            details: 'Discount request rejected by manager authority',
            timestamp: new Date().toISOString()
          });

          platformEventBus.publish('exception:resolved', { revisionId: revId });
          alert('❌ Discount request rejected & logged in Session Audit Trail!');
          this.updateContent();
        }
      });
    });

    // Expedite Action Button
    this.container.querySelectorAll('.btn-expedite-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const expId = e.currentTarget.dataset.expId;
        const type = e.currentTarget.dataset.type;

        this.resolvedLog.unshift({
          action: 'SERVICE EXPEDITED',
          title: `Operational Exception ${expId}`,
          actor: 'Operations Manager',
          details: `Intervened & marked expedited (${type})`,
          timestamp: new Date().toISOString()
        });

        platformEventBus.publish('exception:resolved', { expId });
        alert('🚀 Marked exception expedited & resolved in Shift Audit Log!');
        this.updateContent();
      });
    });

    // 1-Click Seed Test Exceptions Button
    const seedBtn = this.container.querySelector('#btn-seed-test-exceptions');
    if (seedBtn) {
      seedBtn.addEventListener('click', () => this.seedTestExceptions());
    }
  }

  seedTestExceptions() {
    const nowMs = Date.now();
    const twentyFiveMinAgo = new Date(nowMs - 25 * 60 * 1000).toISOString();
    const eightMinAgo = new Date(nowMs - 8 * 60 * 1000).toISOString();
    const store = (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) ? window.__APP__.platform.offlineStore : null;

    // 1. Create a session for Table 4
    const sId = 'sess_test_exp_04';
    const sessions = (store ? store.getCollection('table_sessions') : []) || [];
    if (!sessions.some(s => s.id === sId)) {
      sessions.push({
        id: sId,
        sessionId: sId,
        tableNumber: 4,
        tableCode: 'T-04',
        guestCount: 3,
        assignedWaiterName: 'Suresh',
        status: 'OCCUPIED',
        billStatus: 'UNBILLED',
        createdAt: twentyFiveMinAgo
      });
      if (store) store.setCollection('table_sessions', sessions);
    }

    // 2. Delayed KOT Order (25 min ago)
    const orders = (store ? store.getCollection('orders') : []) || [];
    if (!orders.some(o => o.id === 'ord_test_exp_01')) {
      orders.push({
        id: 'ord_test_exp_01',
        orderId: 'ord_test_exp_01',
        orderNumber: 'ORD-2026-4597',
        sessionId: sId,
        tableNumber: 4,
        tableCode: 'T-04',
        waiterId: 'emp-waiter',
        status: 'PREPARING',
        orderStatus: 'PREPARING',
        subtotal: 1850,
        items: [
          { name: 'Green Chicken Soup', quantity: 2, price: 450, itemStatus: 'PREPARING' },
          { name: 'Smoked Damao Paneer', quantity: 1, price: 950, itemStatus: 'PREPARING' }
        ],
        createdAt: twentyFiveMinAgo
      });
      if (store) store.setCollection('orders', orders);
    }

    // 3. Discount Approval Request (Table 7)
    const sId7 = 'sess_test_exp_07';
    if (!sessions.some(s => s.id === sId7)) {
      sessions.push({
        id: sId7,
        sessionId: sId7,
        tableNumber: 7,
        tableCode: 'T-07',
        guestCount: 4,
        assignedWaiterName: 'Suresh',
        status: 'OCCUPIED',
        billStatus: 'BILL_GENERATED',
        createdAt: twentyFiveMinAgo
      });
      if (store) store.setCollection('table_sessions', sessions);
    }

    const revisions = (store ? store.getCollection('bill_revisions') : []) || [];
    if (!revisions.some(r => r.id === 'rev_test_exp_07')) {
      revisions.push({
        id: 'rev_test_exp_07',
        revisionId: 'rev_test_exp_07',
        sessionId: sId7,
        tableNumber: 7,
        tableCode: 'T-07',
        billNumber: 'BILL-2026-8812',
        revisionNumber: 1,
        grossSales: 4850,
        discountsTotal: 750,
        discountRecords: [{ discountAmount: 750, reason: 'Birthday Courtesy' }],
        grandTotal: 4305,
        revisionStatus: 'PENDING_APPROVAL',
        approvalStatus: 'PENDING',
        waiterName: 'Suresh',
        createdAt: eightMinAgo
      });
      if (store) store.setCollection('bill_revisions', revisions);
    }

    platformEventBus.publish('ticket:status_changed', {});
    alert('⚡ 1-Click Test Exceptions Seeded!\n\n1. 🔴 KOT Delayed 25 min (Table 04)\n2. 🔵 Discount Approval Requested (₹750 on Table 07)');
    this.updateContent();
  }
}
