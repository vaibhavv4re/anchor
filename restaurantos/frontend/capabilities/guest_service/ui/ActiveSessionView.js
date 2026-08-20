/**
 * Capability Group 3 & 4 Integrated Active Session Service View
 * Integrates Menu Browser, Order Builder Drawer, Order Review Modal, and Automatic KOT/BOT Routing.
 * Dynamic active session browser when no sessionId is specified. ZERO fake mock fallbacks.
 */

import { sessionModel } from '../../../../../businessos/platform/session/sessionModel.js';
import { sessionProjectionService } from '../../../../../businessos/platform/session/sessionProjectionService.js';
import { sessionStateMachine, SessionMilestones } from '../../../../../businessos/platform/session/sessionStateMachine.js';
import { tableStateMachine, PhysicalTableStates } from '../../../../../businessos/platform/table_state/tableStateMachine.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

import { MenuBrowserView } from '../../order_management/ui/MenuBrowserView.js';
import { OrderBuilderDrawer } from '../../order_management/ui/OrderBuilderDrawer.js';
import { OrderReviewModal } from '../../order_management/ui/OrderReviewModal.js';
import { ActiveOrdersWidget } from '../../order_management/ui/ActiveOrdersWidget.js';

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
    const unsubProj = platformEventBus.subscribe('session:projection:updated', (envelope) => {
      const payload = envelope.payload || envelope;
      if (this.sessionId && payload && (payload.sessionId === this.sessionId || payload.id === this.sessionId)) {
        this.updateHeaderContent();
        this.updateKitchenAlertBanner();
      }
    });

    const unsubTicket = platformEventBus.subscribe('ticket:status_changed', (envelope) => {
      const payload = envelope.payload || envelope;
      const ticket = payload.ticket;
      if (this.sessionId && ticket && (ticket.sessionId === this.sessionId || ticket.session_id === this.sessionId)) {
        this.updateKitchenAlertBanner();
      }
    });

    const unsubItem = platformEventBus.subscribe('ticket:item_status_changed', (envelope) => {
      const payload = envelope.payload || envelope;
      const ticket = payload.ticket;
      if (this.sessionId && ticket && (ticket.sessionId === this.sessionId || ticket.session_id === this.sessionId)) {
        this.updateKitchenAlertBanner();
      }
    });

    this.unsubscribeEvents.push(unsubProj, unsubTicket, unsubItem);
  }

  updateKitchenAlertBanner() {
    if (!this.sessionId || !this.container) return;
    const alertMount = this.container.querySelector('#kitchen-alert-mount');
    if (!alertMount) return;

    const projection = sessionProjectionService.getSessionProjection(this.sessionId);
    if (!projection) return;

    if (projection.readyItems && projection.readyItems.length > 0) {
      alertMount.innerHTML = `
        <div class="card animate-fade-in" style="background:#10b98115; border:1px solid #10b981; padding:10px 16px; margin-bottom:var(--space-md); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="font-weight:700; color:#10b981; font-size:0.95rem; display:flex; align-items:center; gap:6px;">
            <span style="font-size:1.1rem; animation:pulse 1.5s infinite;">🔔</span> 
            <strong>Kitchen Alert: ${projection.readyItems.length} Item(s) READY for service!</strong>
          </div>
          <div style="font-size:0.85rem; color:var(--text-secondary);">
            ${projection.readyItems.map(i => `${i.quantity}x ${i.name}`).join(', ')}
          </div>
        </div>
      `;
    } else {
      alertMount.innerHTML = '';
    }
  }

  updateHeaderContent() {
    if (!this.sessionId) return;
    const projection = sessionProjectionService.getSessionProjection(this.sessionId);
    if (!projection) return;
    const headerTitle = this.container.querySelector('#session-header-title');
    if (headerTitle) headerTitle.textContent = `Table ${projection.tableNumber} Service`;
  }

  updateContent() {
    // If no sessionId is provided or session is missing, render active sessions picker
    if (!this.sessionId) {
      this.renderActiveSessionsPicker();
      return;
    }

    const projection = sessionProjectionService.getSessionProjection(this.sessionId);
    if (!projection) {
      this.renderActiveSessionsPicker('Selected session is closed or does not exist.');
      return;
    }

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:var(--space-md); border-bottom:1px solid var(--border-subtle); padding-bottom:var(--space-md); margin-bottom:var(--space-md);">
        <div>
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">ACTIVE SERVICE SESSION (${projection.sessionId})</div>
          <h2 id="session-header-title" style="font-size:1.75rem; margin:2px 0;">Table ${projection.tableNumber} Service (${projection.tableCode})</h2>
          <div style="font-size:0.875rem; color:var(--text-secondary); margin-top:4px;">
            Assigned Waiter: <strong>${projection.waiter.name}</strong> • ${projection.elapsedTime} elapsed • Status: <span class="badge badge-info">${projection.status}</span>
          </div>
        </div>
        <button class="btn-secondary" id="btn-back-to-floor">← Back to Floor Viewer</button>
      </div>

      <!-- Guest Operational Context Summary -->
      <div class="grid grid-cols-3 gap-md" style="margin-bottom:var(--space-md);">
        <div class="card" style="background:var(--bg-surface-2); padding:var(--space-sm) var(--space-md);">
          <div style="font-size:0.75rem; color:var(--text-muted);">Guest Count</div>
          <div style="font-size:1.1rem; font-weight:700; margin-top:2px;">👥 ${projection.guestCount} Guests</div>
        </div>
        <div class="card" style="background:var(--bg-surface-2); padding:var(--space-sm) var(--space-md);">
          <div style="font-size:0.75rem; color:var(--text-muted);">Dietary & Celebrations</div>
          <div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:4px;">
            ${projection.celebrationFlag ? `<span class="badge badge-warning">🎂 ${projection.celebrationFlag}</span>` : ''}
            ${projection.dietaryTags.map(t => `<span class="badge badge-danger">⚠️ ${t}</span>`).join('')}
            ${(!projection.celebrationFlag && !projection.dietaryTags.length) ? `<span style="font-size:0.85rem; color:var(--text-secondary);">Standard Service</span>` : ''}
          </div>
        </div>
        <div class="card" style="background:var(--bg-surface-2); padding:var(--space-sm) var(--space-md);">
          <div style="font-size:0.75rem; color:var(--text-muted);">Seating Notes</div>
          <div style="font-size:0.85rem; margin-top:2px; font-style:italic; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            "${projection.guestNotes || 'No special notes'}"
          </div>
        </div>
      </div>

      <!-- Live Order & Production Status Strip Mount -->
      <div id="kitchen-alert-mount">
        ${projection.readyItems.length > 0 ? `
          <div class="card animate-fade-in" style="background:#10b98115; border:1px solid #10b981; padding:10px 16px; margin-bottom:var(--space-md); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div style="font-weight:700; color:#10b981; font-size:0.95rem; display:flex; align-items:center; gap:6px;">
              <span style="font-size:1.1rem; animation:pulse 1.5s infinite;">🔔</span> 
              <strong>Kitchen Alert: ${projection.readyItems.length} Item(s) READY for service!</strong>
            </div>
            <div style="font-size:0.85rem; color:var(--text-secondary);">
              ${projection.readyItems.map(i => `${i.quantity}x ${i.name}`).join(', ')}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Capability Group 4: Menu Browser & Order Builder Layout -->
      <div class="session-order-workspace" style="display:grid; grid-template-columns:minmax(0, 1fr) 340px; gap:16px; align-items:start; margin-bottom:var(--space-md); width:100%;">
        <!-- Menu Browser Mount -->
        <div id="menu-browser-mount" style="min-width:0; width:100%;"></div>

        <!-- Order Builder Drawer Mount -->
        <div id="order-drawer-mount" style="min-width:0; width:100%; position:sticky; top:12px;"></div>
      </div>

      <style>
        @media (max-width: 1024px) {
          .session-order-workspace {
            grid-template-columns: 1fr !important;
          }
          #order-drawer-mount {
            position: static !important;
          }
        }
      </style>

      <!-- Bottom Session Control Toolbar -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:var(--space-md); border-top:1px solid var(--border-subtle); padding-top:var(--space-md); margin-top:var(--space-md);">
        <div>
          <span class="badge badge-info">SESSION ID: ${projection.sessionId}</span>
          ${projection.subtotal > 0 ? `<span style="font-weight:700; margin-left:12px; font-size:1rem;">Subtotal: ₹${projection.subtotal.toFixed(2)}</span>` : ''}
        </div>
        <div style="display:flex; gap:var(--space-md);">
          ${(projection.status === SessionMilestones.ORDERS_STARTED || projection.status === SessionMilestones.GUESTS_SEATED) ? `
            <button class="btn-primary" id="btn-advance-bill">🧾 Generate Bill</button>
          ` : ''}
          ${projection.status === SessionMilestones.BILL_GENERATED ? `
            <button class="btn-primary" id="btn-close-session" style="background-color:var(--status-success); color:#000;">✨ Mark Payment Received & Close Session</button>
          ` : ''}
          <button class="btn-secondary" id="btn-close-session-direct" style="color:var(--status-danger);">Close Session</button>
        </div>
      </div>

      <div id="review-modal-mount"></div>
    `;

    this.mountOrderComponents(projection);
    this.bindEvents(projection);
  }

  renderActiveSessionsPicker(alertMessage = null) {
    const allSessions = sessionModel.getAllSessions();
    const activeSessions = allSessions.filter(s => s.status !== 'CLOSED');

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-lg);">
        <div>
          <h2 style="font-size:1.75rem; margin:0;">🛎️ Active Guest Service Sessions</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Select an active table session to take orders or manage service.</p>
        </div>
        <button class="btn-primary" id="btn-picker-go-floor">🗺️ Open Floor & Layout</button>
      </div>

      ${alertMessage ? `<div class="card" style="background:var(--bg-surface-2); border-left:4px solid var(--accent-primary); padding:12px; margin-bottom:var(--space-md);">${alertMessage}</div>` : ''}

      ${activeSessions.length > 0 ? `
        <div class="grid grid-cols-3 gap-md">
          ${activeSessions.map(s => {
            const proj = sessionProjectionService.getSessionProjection(s.id);
            return `
              <div class="card session-pick-card animate-fade-in" data-session-id="${s.id}" style="cursor:pointer; padding:var(--space-md); border-top:4px solid var(--accent-primary); transition:transform var(--transition-fast);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <div style="font-size:1.2rem; font-weight:700;">Table ${s.tableNumber}</div>
                  <span class="badge badge-info">${s.status}</span>
                </div>
                <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:4px;">
                  👥 ${s.guestCount} Guests • Waiter: <strong>${proj ? proj.waiter.name : (s.assignedWaiterId || 'Staff')}</strong>
                </div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px;">
                  ${s.guestNotes ? `"${s.guestNotes}"` : 'Standard service'}
                </div>
                <button class="btn-secondary w-full" style="padding:6px 0; font-size:0.8rem; font-weight:600;">
                  Open Table ${s.tableNumber} Service →
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div style="text-align:center; padding:var(--space-xl); background:var(--bg-surface-2); border-radius:8px; color:var(--text-muted);">
          <div style="font-size:2.5rem; margin-bottom:8px;">🍽️</div>
          <div style="font-size:1.1rem; font-weight:700; color:var(--text-primary);">No Active Table Sessions</div>
          <p style="font-size:0.875rem; margin-top:4px;">All tables are currently free. Go to the Floor View to seat guests and open a new session.</p>
          <button class="btn-primary" id="btn-empty-go-floor" style="margin-top:12px;">🗺️ Go to Floor & Seat Guests</button>
        </div>
      `}
    `;

    const btnGoFloor = this.container.querySelector('#btn-picker-go-floor');
    if (btnGoFloor) btnGoFloor.addEventListener('click', () => { if (this.onClose) this.onClose(); });

    const btnEmptyGoFloor = this.container.querySelector('#btn-empty-go-floor');
    if (btnEmptyGoFloor) btnEmptyGoFloor.addEventListener('click', () => { if (this.onClose) this.onClose(); });

    this.container.querySelectorAll('.session-pick-card').forEach(card => {
      card.addEventListener('click', () => {
        const sid = card.dataset.sessionId;
        this.sessionId = sid;
        this.updateContent();
      });
    });
  }

  mountOrderComponents(projection) {
    // 1. Mount Menu Browser
    const menuMount = this.container.querySelector('#menu-browser-mount');
    if (!menuMount) return;
    this.menuBrowserInstance = new MenuBrowserView({
      draftItems: this.draftItems,
      onSelectItem: (item) => {
        const existing = this.draftItems.find(i => i.itemId === item.id || i.name === item.name);
        if (existing) {
          existing.quantity += 1;
        } else {
          this.draftItems.push({
            itemId: item.id,
            name: item.name || item.itemName,
            price: item.price || item.sellingPrice,
            quantity: 1,
            selectedModifiers: item.modifiers ? [item.modifiers[0]] : []
          });
        }
        if (this.menuBrowserInstance) {
          this.menuBrowserInstance.setDraftItems(this.draftItems);
        }
        this.updateDrawerContent();
      }
    });
    menuMount.appendChild(this.menuBrowserInstance.render());

    // 2. Mount Order Builder Drawer
    this.updateDrawerContent();
  }

  updateDrawerContent() {
    const drawerMount = this.container.querySelector('#order-drawer-mount');
    if (!drawerMount) return;
    drawerMount.innerHTML = '';

    const drawer = new OrderBuilderDrawer({
      draftItems: this.draftItems,
      onUpdateItems: (updatedItems) => {
        this.draftItems = updatedItems;
        if (this.menuBrowserInstance) {
          this.menuBrowserInstance.setDraftItems(this.draftItems);
        }
      },
      onReviewOrder: (draftItems) => {
        this.openReviewModal(draftItems);
      }
    });
    drawerMount.appendChild(drawer.render());
  }

  openReviewModal(draftItems) {
    const projection = sessionProjectionService.getSessionProjection(this.sessionId);
    const reviewMount = this.container.querySelector('#review-modal-mount');
    if (!reviewMount) return;
    reviewMount.innerHTML = '';

    const reviewModal = new OrderReviewModal({
      sessionId: this.sessionId,
      tableNumber: projection.tableNumber,
      draftItems,
      onClose: () => { reviewMount.innerHTML = ''; },
      onOrderConfirmed: (confirmedOrder) => {
        reviewMount.innerHTML = '';
        this.draftItems = [];
        this.updateDrawerContent();
        alert(`Order #${confirmedOrder.orderId || confirmedOrder.orderNumber} Confirmed! KOT (Kitchen) and BOT (Bar) tickets automatically dispatched.`);
        this.updateContent();
      }
    });

    reviewMount.appendChild(reviewModal.render());
  }

  bindEvents(projection) {
    const backBtn = this.container.querySelector('#btn-back-to-floor');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (this.onClose) this.onClose();
      });
    }

    const advanceBillBtn = this.container.querySelector('#btn-advance-bill');
    if (advanceBillBtn) {
      advanceBillBtn.addEventListener('click', () => {
        sessionStateMachine.transitionMilestone(this.sessionId, SessionMilestones.BILL_GENERATED);
        tableStateMachine.transitionTableState(projection.tableNumber, PhysicalTableStates.PAYMENT_PENDING);
        this.updateContent();
      });
    }

    const closeBtn = this.container.querySelector('#btn-close-session');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        sessionStateMachine.transitionMilestone(this.sessionId, SessionMilestones.CLOSED);
        tableStateMachine.transitionTableState(projection.tableNumber, PhysicalTableStates.CLEANING);
        alert(`Session closed for Table ${projection.tableNumber}! Table moved to CLEANING.`);
        if (this.onClose) this.onClose();
      });
    }

    const closeDirectBtn = this.container.querySelector('#btn-close-session-direct');
    if (closeDirectBtn) {
      closeDirectBtn.addEventListener('click', () => {
        sessionStateMachine.transitionMilestone(this.sessionId, SessionMilestones.CLOSED);
        tableStateMachine.transitionTableState(projection.tableNumber, PhysicalTableStates.AVAILABLE);
        if (this.onClose) this.onClose();
      });
    }
  }
}
