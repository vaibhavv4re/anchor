/**
 * Capability Group 3 & 4 Integrated Active Session Service View
 * Integrates Menu Browser, Order Builder Drawer, Order Review Modal, and Automatic KOT/BOT Routing.
 * Embedded Kitchen & Service Status projection, PARTIALLY_READY banner, and event-derived Service Timeline.
 */

import { sessionModel } from '../../../../../businessos/platform/session/sessionModel.js';
import { sessionProjectionService } from '../../../../../businessos/platform/session/sessionProjectionService.js';
import { sessionAuditModel } from '../../../../../businessos/platform/session/sessionAuditModel.js';
import { productionRoutingEngine } from '../../../../../businessos/platform/ordering/productionRoutingEngine.js';
import { sessionStateMachine, SessionMilestones } from '../../../../../businessos/platform/session/sessionStateMachine.js';
import { tableStateMachine, PhysicalTableStates } from '../../../../../businessos/platform/table_state/tableStateMachine.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { billRevisionModel } from '../../../../../businessos/platform/billing/billRevisionModel.js';

import { MenuBrowserView } from '../../order_management/ui/MenuBrowserView.js';
import { OrderBuilderDrawer } from '../../order_management/ui/OrderBuilderDrawer.js';
import { OrderReviewModal } from '../../order_management/ui/OrderReviewModal.js';
import { ActiveOrdersWidget } from '../../order_management/ui/ActiveOrdersWidget.js';
import { RunningBillModal } from './RunningBillModal.js';

export class ActiveSessionView {
  constructor({ sessionId = null, onClose = null } = {}) {
    this.sessionId = sessionId;
    this.onClose = onClose;
    this.container = null;
    this.draftItems = [];
    this.unsubscribeEvents = [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'card animate-fade-in';
    this.container.style.padding = 'var(--space-xl)';

    this.subscribeEvents();
    this.updateContent();

    return this.container;
  }

  subscribeEvents() {
    const refreshAlerts = () => {
      this.updateHeaderContent();
      this.updateKitchenAlertBanner();
    };

    const refreshFull = (envelope) => {
      const payload = envelope ? (envelope.payload || envelope) : null;
      if (!payload || !this.sessionId || payload.sessionId === this.sessionId || payload.tableNumber || payload.id === this.sessionId) {
        if (this.container && document.body.contains(this.container)) {
          this.updateContent();
        }
      }
    };

    const unsubProj = platformEventBus.subscribe('session:projection:updated', refreshFull);
    const unsubState = platformEventBus.subscribe('table:state:changed', refreshFull);
    const unsubMilestone = platformEventBus.subscribe('session:milestone:changed', refreshFull);
    const unsubFinalized = platformEventBus.subscribe('bill:finalized', refreshFull);
    const unsubReopened = platformEventBus.subscribe('bill:reopened', refreshFull);
    const unsubTicket = platformEventBus.subscribe('ticket:status_changed', refreshFull);
    const unsubItem = platformEventBus.subscribe('ticket:item_status_changed', refreshFull);

    this.unsubscribeEvents.push(unsubProj, unsubState, unsubMilestone, unsubFinalized, unsubReopened, unsubTicket, unsubItem);
  }

  updateKitchenAlertBanner() {
    if (!this.sessionId || !this.container) return;
    const alertMount = this.container.querySelector('#kitchen-alert-mount');
    if (!alertMount) return;

    const projection = sessionProjectionService.getSessionProjection(this.sessionId);
    if (!projection) return;

    alertMount.innerHTML = this.renderKitchenAndServiceStatusCard(projection);
    this.bindKitchenCardEvents();
  }

  renderKitchenAndServiceStatusCard(projection) {
    const allItems = [...(projection.foodItems || []), ...(projection.drinkItems || [])];
    if (!allItems.length) return '';

    const readyCount = (projection.readyItems || []).length;
    const prepCount = (projection.preparingItems || []).length;
    const queuedCount = (projection.queuedItems || []).length;
    const servedCount = (projection.servedItems || []).length;

    const auditLogs = sessionAuditModel.getAuditLogsForSession(projection.sessionId) || [];

    return `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); padding:16px; border-radius:10px; margin-bottom:var(--space-md);">
        
        <!-- HEADER & COUNTS -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
          <div style="font-size:1.05rem; font-weight:800; display:flex; align-items:center; gap:8px; color:var(--text-primary);">
            <span>🍳</span> KITCHEN & SERVICE STATUS
          </div>
          <div style="font-size:0.8rem; font-weight:700; background:var(--bg-surface-2); padding:4px 12px; border-radius:6px; color:var(--text-secondary);">
            🟢 ${readyCount} Ready &nbsp;•&nbsp; 🔥 ${prepCount} Preparing &nbsp;•&nbsp; 🔴 ${queuedCount} Queued &nbsp;•&nbsp; ⚪ ${servedCount} Served
          </div>
        </div>

        <!-- PARTIALLY READY BANNER -->
        ${projection.isPartiallyReady ? `
          <div class="animate-fade-in" style="background:#10b98115; border:1px solid #10b981; padding:10px 14px; border-radius:6px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
            <div style="font-weight:800; color:#10b981; font-size:0.9rem; display:flex; align-items:center; gap:6px;">
              <span>⚡</span> <strong>PARTIALLY READY — ${readyCount} dish(es) ready for pickup!</strong>
            </div>
            <div style="font-size:0.8rem; color:var(--text-secondary);">
              ${projection.readyItems.map(i => `${i.quantity}x ${i.name}`).join(', ')}
            </div>
          </div>
        ` : ''}

        <!-- GUEST UPDATE SCRIPT -->
        <div style="background:rgba(59, 130, 246, 0.08); border-left:4px solid #3b82f6; padding:10px 14px; border-radius:6px; margin-bottom:14px;">
          <div style="font-size:0.75rem; color:#60a5fa; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">💬 Guest Update Copy</div>
          <div style="font-size:0.9rem; font-weight:700; color:var(--text-primary); margin-top:2px;">
            "${projection.guestScript}"
          </div>
        </div>

        <!-- ITEM LEVEL TRACKER LIST -->
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
          ${allItems.map((item, idx) => {
            const isReady = item.status === 'READY';
            const isPrep = item.status === 'PREPARING';
            const isQueued = item.status === 'QUEUED';
            const isServed = item.status === 'SERVED';

            const borderCol = isReady ? '#10b981' : (isPrep ? '#f59e0b' : (isServed ? '#6b7280' : '#ef4444'));
            const bgCol = isReady ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-surface-2)';
            const statusBadge = isReady ? '<span class="badge" style="background:#10b98122; color:#10b981; border:1px solid #10b981; font-size:0.7rem; font-weight:800;">🟢 READY</span>'
              : (isPrep ? '<span class="badge" style="background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b; font-size:0.7rem; font-weight:800;">🔥 PREPARING</span>'
              : (isServed ? '<span class="badge" style="background:#6b728022; color:#9ca3af; border:1px solid #6b7280; font-size:0.7rem;">⚪ SERVED</span>'
              : '<span class="badge badge-info" style="font-size:0.7rem; font-weight:800;">🔴 QUEUED</span>'));

            const elapsedStr = item.elapsedMinutes ? `Kitchen elapsed: ${item.elapsedMinutes} min` : 'Just ordered';

            return `
              <div style="display:flex; justify-content:space-between; align-items:center; background:${bgCol}; padding:8px 12px; border-radius:6px; border-left:3px solid ${borderCol};">
                <div>
                  <span style="font-weight:800; color:var(--accent-primary);">${item.quantity}x</span> 
                  <span style="font-weight:700; font-size:0.9rem; color:var(--text-primary);">${item.name}</span>
                  ${item.notes ? `<span style="font-size:0.75rem; color:#f59e0b; margin-left:6px;">⚠️ ${item.notes}</span>` : ''}
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                  <span style="font-size:0.75rem; color:var(--text-muted);">${elapsedStr}</span>
                  ${statusBadge}
                  ${isReady ? `
                    <button class="btn-primary btn-waiter-serve-item" data-ticket-id="${item.ticketId}" data-line-id="${item.lineItemId || item.itemId || idx}" style="padding:3px 8px; font-size:0.75rem; font-weight:800; background:#10b981; color:#000000; border:none; border-radius:4px; cursor:pointer;">
                      🍽️ Mark Served
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- EVENT-DERIVED SERVICE TIMELINE (EXPANDABLE) -->
        <details style="border-top:1px dashed var(--border-subtle); padding-top:10px; margin-top:6px;">
          <summary style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); cursor:pointer; user-select:none; outline:none; display:flex; justify-content:space-between; align-items:center;">
            <span>📜 Service Timeline (${auditLogs.length} Event${auditLogs.length !== 1 ? 's' : ''})</span>
            <span style="font-size:0.7rem; color:var(--accent-primary); font-weight:600;">▼ Click to expand</span>
          </summary>
          <div style="display:flex; flex-direction:column; gap:6px; font-size:0.8rem; margin-top:10px;">
            ${auditLogs.length > 0 ? auditLogs.map(a => {
              const time = a.timestamp ? new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
              return `
                <div style="display:flex; gap:10px; align-items:center;">
                  <span style="color:var(--text-muted); font-family:monospace; width:65px;">${time}</span>
                  <span style="color:var(--text-primary);">${a.description}</span>
                </div>
              `;
            }).join('') : `
              <div style="color:var(--text-muted); font-style:italic;">Session initialized. Ready for order placement.</div>
            `}
          </div>
        </details>

      </div>
    `;
  }

  bindKitchenCardEvents() {
    if (!this.container) return;
    this.container.querySelectorAll('.btn-waiter-serve-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ticketId = btn.dataset.ticketId;
        const lineId = btn.dataset.lineId;
        const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
        const tenantId = session.tenantId || 'tenant_h0qc7wf';

        productionRoutingEngine.updateTicketItemStatus(ticketId, lineId, 'SERVED', tenantId);
        platformEventBus.publish('ticket:status_changed', { ticketId, itemId: lineId, status: 'SERVED' });
        this.updateContent();
      });
    });
  }

  updateContent() {
    if (!this.container) return;

    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
    const tenantId = session.tenantId || null;

    if (!this.sessionId) {
      this.renderSessionBrowser(tenantId);
      return;
    }

    const projection = sessionProjectionService.getSessionProjection(this.sessionId, tenantId);

    if (!projection) {
      this.container.innerHTML = `
        <div style="text-align:center; padding:var(--space-xl);">
          <div style="font-size:3rem; margin-bottom:12px;">⚠️</div>
          <h3>Session Not Found or Expired</h3>
          <button class="btn-secondary" id="btn-back-to-floor" style="margin-top:12px;">← Back to Floor</button>
        </div>
      `;
      this.bindEvents(null);
      return;
    }

    this.container.innerHTML = `
      <!-- TOP SESSION HEADER -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-md); flex-wrap:wrap; gap:12px;">
        <div>
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">ACTIVE GUEST SERVICE SESSION</div>
          <h2 style="font-size:1.75rem; margin-top:2px; display:flex; align-items:center; gap:10px;">
            <span>🍽️ Table ${projection.tableNumber}</span>
            <span style="font-size:0.85rem; font-weight:400; color:var(--text-muted);">(${projection.tableCode})</span>
            <span class="badge ${projection.status === SessionMilestones.CLOSED ? 'badge-secondary' : 'badge-success'}" style="font-size:0.75rem;">
              ${projection.status}
            </span>
          </h2>
          <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:4px;">
            Server: <strong>${projection.waiter ? projection.waiter.name : 'Staff'}</strong> • Elapsed: <strong>${projection.elapsedTime}</strong> • Session ID: <code>${projection.sessionId}</code>
          </div>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <button class="btn-primary" id="btn-add-items-shortcut" style="padding:10px 16px; font-weight:700; font-size:0.85rem;">
            ➕ Add Items to Order
          </button>
          <button class="btn-secondary" id="btn-back-to-floor">← Back to Floor</button>
        </div>
      </div>

      <!-- Guest Operational Context & Live Financial Running Bill Strip (Responsive Auto-Fit Row) -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:var(--space-md);">
        <div class="card" style="background:var(--bg-surface-2); padding:var(--space-sm) var(--space-md);">
          <div style="font-size:0.75rem; color:var(--text-muted);">Guest Count</div>
          <div style="font-size:1.1rem; font-weight:700; margin-top:2px;">👥 ${projection.guestCount} Guests</div>
        </div>
        
        <div class="card" style="background:var(--bg-surface-2); padding:var(--space-sm) var(--space-md);">
          <div style="font-size:0.75rem; color:var(--text-muted);">Dietary & Notes</div>
          <div style="font-size:0.85rem; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${projection.celebrationFlag ? `<span class="badge badge-warning" style="margin-right:4px;">🎂 ${projection.celebrationFlag}</span>` : ''}
            <span style="font-style:italic;">"${projection.guestNotes || 'Standard'}"</span>
          </div>
        </div>

        <div class="card" style="background:var(--bg-surface-2); padding:var(--space-sm) var(--space-md);">
          <div style="font-size:0.75rem; color:var(--text-muted);">Confirmed Items</div>
          <div style="font-size:1.1rem; font-weight:700; margin-top:2px; color:var(--text-primary);">
            📦 ${projection.itemizedList ? projection.itemizedList.length : 0} Item(s)
          </div>
        </div>

        <div class="card" id="btn-open-running-bill-card" style="background:var(--accent-primary)15; border:1px solid var(--accent-primary); padding:var(--space-sm) var(--space-md); cursor:pointer; transition:transform 0.15s ease;" title="Click to view detailed itemized bill breakdown">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:0.75rem; color:var(--accent-primary); font-weight:700; text-transform:uppercase;">🧾 Running Total</div>
            <span style="font-size:0.7rem; background:var(--accent-primary); color:#000; padding:1px 6px; border-radius:4px; font-weight:800;">INSPECT BILL →</span>
          </div>
          <div style="font-size:1.25rem; font-weight:800; color:var(--accent-primary); margin-top:2px;">
            ₹${(projection.grandTotal || projection.subtotal || 0).toFixed(2)}
            <span style="font-size:0.75rem; font-weight:400; color:var(--text-secondary);">(incl. GST)</span>
          </div>
        </div>
      </div>
      
      <!-- Stage Guidance Banner when Payment is Settled or Bill is Finalized -->
      ${(projection.status === SessionMilestones.PAYMENT_RECEIVED || projection.billStatus === 'PAID') ? `
        <div class="card animate-fade-in" style="background:#10b98115; border:2px solid #10b981; padding:14px 18px; margin-bottom:var(--space-md); border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div>
              <div style="font-weight:800; color:#10b981; font-size:1.05rem; display:flex; align-items:center; gap:6px;">
                <span>🟢</span> <strong>PAYMENT CONFIRMED & SETTLED BY CASHIER</strong>
              </div>
              <div style="font-size:0.85rem; color:var(--text-primary); margin-top:4px;">
                Payment of <strong>₹${(projection.grandTotal || 0).toFixed(2)}</strong> for Table ${projection.tableNumber} is settled. Waiter can now close the table session.
              </div>
            </div>
          </div>
        </div>
      ` : ((projection.status === SessionMilestones.BILL_GENERATED || projection.billStatus === 'GENERATED') ? `
        <div class="card animate-fade-in" style="background:#f59e0b15; border:2px solid #f59e0b; padding:14px 18px; margin-bottom:var(--space-md); border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div>
              <div style="font-weight:800; color:#f59e0b; font-size:1.05rem; display:flex; align-items:center; gap:6px;">
                <span>💳</span> <strong>BILL FINALISED & SENT TO CASHIER (PAYMENT PENDING)</strong>
              </div>
              <div style="font-size:0.85rem; color:var(--text-primary); margin-top:4px;">
                Table ${projection.tableNumber} is locked awaiting Cashier payment settlement of <strong>₹${(projection.grandTotal || 0).toFixed(2)}</strong>. Items cannot be added unless Cashier re-opens the bill.
              </div>
            </div>
            <div>
              <span class="badge badge-warning" style="padding:6px 12px; font-weight:800; font-size:0.85rem;">⏳ Cashier Settlement Pending</span>
            </div>
          </div>
        </div>
      ` : '')}

      <!-- EMBEDDED KITCHEN & SERVICE STATUS CARD WITH SERVICE TIMELINE -->
      <div id="kitchen-alert-mount">
        ${this.renderKitchenAndServiceStatusCard(projection)}
      </div>

      <!-- Menu Browser & Order Builder Layout -->
      <div class="session-order-workspace" style="display:grid; grid-template-columns:minmax(0, 1fr) 340px; gap:16px; align-items:start; margin-bottom:var(--space-md); width:100%;">
        <div id="menu-browser-mount" style="min-width:0; width:100%;"></div>
        <div id="order-drawer-mount" style="min-width:0; width:100%; position:sticky; top:12px;"></div>
      </div>

      <!-- Bottom Session Control Toolbar -->
      <div class="card" style="background:var(--bg-surface-2); padding:var(--space-md); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; gap:10px;">
          <button class="btn-secondary" id="btn-view-running-bill">🧾 Running Bill Details</button>
        </div>
        <div style="display:flex; gap:10px;">
          ${(projection.status === SessionMilestones.PAYMENT_RECEIVED || projection.billStatus === 'PAID') ? `
            <button class="btn-primary" id="btn-close-session-settled-banner" style="background:#10b981; border-color:#10b981; font-weight:800; font-size:0.95rem; padding:10px 20px;">
              ✨ Close Session (Table ${projection.tableNumber} Paid)
            </button>
          ` : `
            <button class="btn-primary" id="btn-finalise-bill-cashier" style="background:var(--status-danger); border-color:var(--status-danger); font-weight:800; font-size:0.9rem; padding:10px 18px;">
              🧾 Finalise Bill & Send to Cashier
            </button>
          `}
        </div>
      </div>
    `;

    this.mountOrderComponents(projection);
    this.bindEvents(projection);
    this.bindKitchenCardEvents();
  }

  mountOrderComponents(projection) {
    const menuMount = this.container.querySelector('#menu-browser-mount');
    const drawerMount = this.container.querySelector('#order-drawer-mount');

    if (menuMount) {
      const menuBrowser = new MenuBrowserView({
        isWaiterView: true,
        onSelectItem: (item) => {
          this.addDraftItem(item);
        }
      });
      menuMount.appendChild(menuBrowser.render());
    }

    if (drawerMount) {
      const drawer = new OrderBuilderDrawer({
        sessionId: this.sessionId,
        tableNumber: projection.tableNumber,
        tableCode: projection.tableCode,
        draftItems: this.draftItems,
        onUpdateItems: (items) => {
          this.draftItems = items;
        },
        onReviewOrder: (items) => {
          this.openOrderReviewModal(projection, items);
        }
      });
      drawerMount.appendChild(drawer.render());
    }
  }

  openOrderReviewModal(projection, items) {
    const modal = new OrderReviewModal({
      sessionId: this.sessionId,
      tableNumber: projection.tableNumber,
      draftItems: items || this.draftItems,
      onClose: () => {},
      onOrderConfirmed: (confirmedOrder) => {
        this.draftItems = [];
        this.updateContent();
      }
    });
    const modalEl = modal.render();
    document.body.appendChild(modalEl);
  }

  addDraftItem(item) {
    const existing = this.draftItems.find(i => i.itemCode === item.itemCode && i.variantId === item.variantId);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.draftItems.push({
        ...item,
        quantity: 1
      });
    }
    this.updateContent();
  }

  bindEvents(projection) {
    const backBtn = this.container.querySelector('#btn-back-to-floor');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (this.onClose) this.onClose();
      });
    }

    const addShortcutBtn = this.container.querySelector('#btn-add-items-shortcut');
    if (addShortcutBtn) {
      addShortcutBtn.addEventListener('click', () => {
        const menuEl = this.container.querySelector('#menu-browser-mount');
        if (menuEl) menuEl.scrollIntoView({ behavior: 'smooth' });
      });
    }

    const openBillCardBtn = this.container.querySelector('#btn-open-running-bill-card');
    if (openBillCardBtn) {
      openBillCardBtn.addEventListener('click', () => {
        this.openRunningBillModal();
      });
    }

    const viewBillBtn = this.container.querySelector('#btn-view-running-bill');
    if (viewBillBtn) {
      viewBillBtn.addEventListener('click', () => {
        this.openRunningBillModal();
      });
    }

    const finaliseBillBtn = this.container.querySelector('#btn-finalise-bill-cashier');
    if (finaliseBillBtn) {
      finaliseBillBtn.addEventListener('click', () => {
        const rev = billRevisionModel.createRevision({
          sessionId: this.sessionId,
          tableNumber: projection.tableNumber,
          tableCode: projection.tableCode,
          items: projection.itemizedList,
          subtotal: projection.subtotal,
          waiterId: projection.waiter ? projection.waiter.id : 'emp-waiter',
          waiterName: projection.waiter ? projection.waiter.name : 'Staff'
        });

        sessionStateMachine.transitionMilestone(this.sessionId, SessionMilestones.BILL_GENERATED);
        tableStateMachine.transitionTableState(projection.tableNumber, PhysicalTableStates.PAYMENT_PENDING);

        platformEventBus.publish('bill:finalized', {
          sessionId: this.sessionId,
          tableNumber: projection.tableNumber,
          tableCode: projection.tableCode,
          billNumber: rev.billNumber,
          revisionNumber: rev.revisionNumber,
          subtotal: rev.subtotal,
          cgstAmount: rev.cgstAmount,
          sgstAmount: rev.sgstAmount,
          serviceChargeAmount: rev.serviceChargeAmount,
          grandTotal: rev.grandTotal,
          itemizedList: projection.itemizedList,
          waiterName: projection.waiter ? projection.waiter.name : 'Staff',
          timestamp: new Date().toISOString()
        });

        platformEventBus.publish('table:state:changed', {
          tableNumber: projection.tableNumber,
          newState: PhysicalTableStates.PAYMENT_PENDING,
          sessionId: this.sessionId
        });

        alert(`🧾 Bill for Table ${projection.tableNumber} (Revision ${rev.revisionNumber} - Total: ₹${(rev.grandTotal || 0).toFixed(2)}) finalised and sent to Cashier! Table status updated to PAYMENT PENDING.`);
        this.updateContent();
        this.openRunningBillModal();
      });
    }

    const closeSettledBannerBtn = this.container.querySelector('#btn-close-session-settled-banner');
    if (closeSettledBannerBtn) {
      closeSettledBannerBtn.addEventListener('click', () => {
        sessionStateMachine.transitionMilestone(this.sessionId, SessionMilestones.CLOSED);
        tableStateMachine.transitionTableState(projection.tableNumber, PhysicalTableStates.CLEANING);
        platformEventBus.publish('table:state:changed', {
          tableNumber: projection.tableNumber,
          newState: PhysicalTableStates.CLEANING
        });
        alert(`✨ Session closed for Table ${projection.tableNumber}! Table status set to NEEDS CLEANING.`);
        if (this.onClose) {
          this.onClose();
        } else {
          this.sessionId = null;
          this.updateContent();
        }
      });
    }
  }

  openRunningBillModal() {
    if (!this.sessionId) return;
    const modal = new RunningBillModal({
      sessionId: this.sessionId,
      onClose: () => {}
    });
    const modalEl = modal.render();
    document.body.appendChild(modalEl);
  }

  renderSessionBrowser(tenantId) {
    const sessions = sessionModel.getAllSessions(tenantId) || [];
    const activeSessions = sessions.filter(s => s.status !== 'CLOSED');

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-md);">
        <div>
          <h2 style="font-size:1.6rem; margin:0;">🛎️ Active Dining Room Sessions</h2>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">Select a table session to inspect order items and live kitchen status.</p>
        </div>
        <button class="btn-secondary" id="btn-back-to-floor">← Back to Floor Grid</button>
      </div>

      ${activeSessions.length === 0 ? `
        <div style="text-align:center; padding:60px 20px; color:var(--text-muted); background:var(--bg-surface-2); border-radius:8px;">
          <div style="font-size:2.5rem; margin-bottom:8px;">🍽️</div>
          <div style="font-weight:700;">No active dining sessions found.</div>
          <div style="font-size:0.85rem; margin-top:4px;">Open a table from the Floor Grid to start guest service.</div>
        </div>
      ` : `
        <div class="grid grid-cols-3 gap-md">
          ${activeSessions.map(s => {
            const proj = sessionProjectionService.getSessionProjection(s.id, tenantId);
            const readyCount = proj ? proj.readyItems.length : 0;

            return `
              <div class="card btn-select-browser-session" data-session-id="${s.id}" style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); padding:16px; border-radius:8px; cursor:pointer;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <span style="font-weight:800; font-size:1.1rem; color:var(--text-main);">🍽️ Table ${s.tableNumber}</span>
                  ${readyCount > 0 ? `<span class="badge" style="background:#10b981; color:#fff; font-size:0.7rem; font-weight:800;">${readyCount} READY</span>` : `<span class="badge badge-info" style="font-size:0.7rem;">${s.status}</span>`}
                </div>
                <div style="font-size:0.85rem; color:var(--text-secondary);">
                  Server: <strong>${proj && proj.waiter ? proj.waiter.name : 'Staff'}</strong> • Guests: ${s.guestCount || 2}
                </div>
                <div style="font-size:0.8rem; color:var(--accent-primary); font-weight:700; margin-top:10px;">
                  Open Table Console →
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    `;

    const backBtn = this.container.querySelector('#btn-back-to-floor');
    if (backBtn && this.onClose) {
      backBtn.addEventListener('click', () => this.onClose());
    }

    this.container.querySelectorAll('.btn-select-browser-session').forEach(btn => {
      btn.addEventListener('click', () => {
        this.sessionId = btn.dataset.sessionId;
        this.updateContent();
      });
    });
  }
}
