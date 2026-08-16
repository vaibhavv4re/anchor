/**
 * Capability Group 3 & 4 Integrated Active Session Service View
 * Integrates Menu Browser, Order Builder Drawer, Order Review Modal, and Automatic KOT/BOT Routing.
 */

import { sessionProjectionService } from '../../../../../businessos/platform/session/sessionProjectionService.js';
import { sessionStateMachine, SessionMilestones } from '../../../../../businessos/platform/session/sessionStateMachine.js';
import { tableStateMachine, PhysicalTableStates } from '../../../../../businessos/platform/table_state/tableStateMachine.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

import { MenuBrowserView } from '../../order_management/ui/MenuBrowserView.js';
import { OrderBuilderDrawer } from '../../order_management/ui/OrderBuilderDrawer.js';
import { OrderReviewModal } from '../../order_management/ui/OrderReviewModal.js';
import { ActiveOrdersWidget } from '../../order_management/ui/ActiveOrdersWidget.js';

export class ActiveSessionView {
  constructor({ sessionId, onClose }) {
    this.sessionId = sessionId;
    this.onClose = onClose;
    this.container = null;
    this.draftItems = [];
    this.unsubscribeProjection = null;
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'card animate-fade-in';
    this.container.style.padding = 'var(--space-xl)';

    this.subscribeProjection();
    this.updateContent();

    return this.container;
  }

  subscribeProjection() {
    this.unsubscribeProjection = platformEventBus.subscribe('session:projection:updated', (envelope) => {
      if (envelope.payload && envelope.payload.sessionId === this.sessionId) {
        this.updateHeaderContent();
      }
    });
  }

  updateHeaderContent() {
    const projection = sessionProjectionService.getSessionProjection(this.sessionId);
    if (!projection) return;
    const headerTitle = this.container.querySelector('#session-header-title');
    if (headerTitle) headerTitle.textContent = `Table ${projection.tableNumber} Service`;
  }

  updateContent() {
    const projection = sessionProjectionService.getSessionProjection(this.sessionId);
    if (!projection) {
      this.container.innerHTML = `<div style="color:var(--text-muted); text-align:center;">Session closed or not found.</div>`;
      return;
    }

    const milestones = [
      SessionMilestones.GUESTS_SEATED,
      SessionMilestones.ORDERS_STARTED,
      SessionMilestones.BILL_GENERATED,
      SessionMilestones.CLOSED
    ];
    const currentIndex = milestones.indexOf(projection.status);

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:var(--space-md); border-bottom:1px solid var(--border-subtle); padding-bottom:var(--space-md); margin-bottom:var(--space-md);">
        <div>
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">ACTIVE SERVICE SESSION (${projection.sessionId})</div>
          <h2 id="session-header-title" style="font-size:1.75rem;">Table ${projection.tableNumber} Service</h2>
          <div style="font-size:0.875rem; color:var(--text-secondary); margin-top:4px;">
            Assigned Waiter: <strong>${projection.waiter.name}</strong> • ${projection.elapsedTime} elapsed
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
            ${(!projection.celebrationFlag && !projection.dietaryTags.length) ? `<span style="font-size:0.85rem;">Standard Service</span>` : ''}
          </div>
        </div>
        <div class="card" style="background:var(--bg-surface-2); padding:var(--space-sm) var(--space-md);">
          <div style="font-size:0.75rem; color:var(--text-muted);">Seating Notes</div>
          <div style="font-size:0.85rem; margin-top:2px; font-style:italic; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            "${projection.guestNotes || 'No special notes'}"
          </div>
        </div>
      </div>

      <!-- Capability Group 4: Menu Browser & Order Builder Layout -->
      <div class="grid-2col-responsive" style="margin-bottom:var(--space-md);">
        <!-- Menu Browser Mount -->
        <div id="menu-browser-mount"></div>

        <!-- Order Builder Drawer Mount -->
        <div id="order-drawer-mount" style="min-height:400px; max-height:600px;"></div>
      </div>

      <!-- Dispatched Tickets Widget Mount -->
      <div id="active-orders-mount"></div>

      <!-- Bottom Session Control Toolbar -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:var(--space-md); border-top:1px solid var(--border-subtle); padding-top:var(--space-md); margin-top:var(--space-md);">
        <div>
          <span class="badge badge-info">CORRELATION ID: ${projection.correlationId}</span>
        </div>
        <div style="display:flex; gap:var(--space-md);">
          ${projection.status === SessionMilestones.ORDERS_STARTED ? `
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

  mountOrderComponents(projection) {
    // 1. Mount Menu Browser
    const menuMount = this.container.querySelector('#menu-browser-mount');
    const menuBrowser = new MenuBrowserView({
      onSelectItem: (item) => {
        const existing = this.draftItems.find(i => i.itemId === item.id);
        if (existing) {
          existing.quantity += 1;
        } else {
          this.draftItems.push({
            itemId: item.id,
            name: item.name,
            price: item.price,
            quantity: 1,
            selectedModifiers: item.modifiers ? [item.modifiers[0]] : []
          });
        }
        this.updateDrawerContent();
      }
    });
    menuMount.appendChild(menuBrowser.render());

    // 2. Mount Order Builder Drawer
    this.updateDrawerContent();

    // 3. Mount Active Orders & Tickets Widget
    const ordersMount = this.container.querySelector('#active-orders-mount');
    const ordersWidget = new ActiveOrdersWidget({ sessionId: this.sessionId });
    ordersMount.appendChild(ordersWidget.render());
  }

  updateDrawerContent() {
    const drawerMount = this.container.querySelector('#order-drawer-mount');
    if (!drawerMount) return;
    drawerMount.innerHTML = '';

    const drawer = new OrderBuilderDrawer({
      draftItems: this.draftItems,
      onUpdateItems: (updatedItems) => {
        this.draftItems = updatedItems;
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
        alert(`Order #${confirmedOrder.orderId} Confirmed! KOT (Kitchen) and BOT (Bar) tickets automatically dispatched via PD-010.`);
        this.updateContent();
      }
    });

    reviewMount.appendChild(reviewModal.render());
  }

  bindEvents(projection) {
    this.container.querySelector('#btn-back-to-floor').addEventListener('click', () => {
      if (this.onClose) this.onClose();
    });

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
