/**
 * Capability Group 4 - Order Review & Confirmation Modal
 * Implements Build -> Review -> Confirm workflow.
 * Triggers Automatic Production Routing (PD-010) on confirmation.
 */

import { orderModel } from '../../../../businessos/platform/ordering/orderModel.js';
import { authEngine } from '../../../../businessos/platform/authentication/authEngine.js';
import { sessionStateMachine, SessionMilestones } from '../../../../businessos/platform/session/sessionStateMachine.js';

export class OrderReviewModal {
  constructor({ sessionId, tableNumber, draftItems, onClose, onOrderConfirmed }) {
    this.sessionId = sessionId;
    this.tableNumber = tableNumber;
    this.draftItems = draftItems;
    this.onClose = onClose;
    this.onOrderConfirmed = onOrderConfirmed;
    this.modalEl = null;
  }

  render() {
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'lock-screen-overlay animate-fade-in';
    this.updateContent();
    return this.modalEl;
  }

  updateContent() {
    const subtotal = this.draftItems.reduce((acc, it) => acc + (it.price * it.quantity), 0);
    const session = authEngine.getCurrentSession();
    const waiterName = session ? session.employeeName : 'Logged In Waiter';

    this.modalEl.innerHTML = `
      <div class="card animate-fade-in" style="max-width:520px; width:100%; padding:var(--space-xl);">
        <div style="margin-bottom:var(--space-md);">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">ORDER CONFIRMATION WORKFLOW</div>
          <h2 style="font-size:1.75rem;">Review Order — Table ${this.tableNumber}</h2>
          <p style="font-size:0.875rem; color:var(--text-muted); margin-top:4px;">Waiter: <strong>${waiterName}</strong> • Session ${this.sessionId}</p>
        </div>

        <!-- Item Breakdown -->
        <div style="background:var(--bg-surface-2); padding:var(--space-md); border-radius:var(--radius-md); max-height:240px; overflow-y:auto; margin-bottom:var(--space-lg);">
          ${this.draftItems.map(it => `
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed var(--border-subtle);">
              <div>
                <span style="font-weight:600;">${it.quantity}x ${it.name}</span>
                ${it.selectedModifiers && it.selectedModifiers.length ? `<div style="font-size:0.75rem; color:var(--text-muted);">${it.selectedModifiers.join(', ')}</div>` : ''}
              </div>
              <div style="font-weight:700;">₹${it.price * it.quantity}</div>
            </div>
          `).join('')}
        </div>

        <!-- Automatic Routing Notice (PD-010) -->
        <div class="badge badge-info" style="display:block; padding:10px; margin-bottom:var(--space-lg); font-size:0.8rem; text-align:center;">
          ⚡ <strong>PD-010 Automatic Production Routing:</strong> Food items will automatically dispatch to <strong>KOT (Kitchen)</strong> and Drink items to <strong>BOT (Bar)</strong>.
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-lg);">
          <span style="font-size:1.1rem; font-weight:600;">Order Total</span>
          <span style="font-size:1.5rem; font-weight:700; color:var(--accent-primary);">₹${subtotal}</span>
        </div>

        <div style="display:flex; gap:var(--space-md);">
          <button class="btn-secondary" id="btn-cancel-review" style="flex:1;">← Edit Draft</button>
          <button class="btn-primary" id="btn-confirm-order-action" style="flex:2; padding:12px;">✨ Confirm Order & Dispatch Tickets</button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.modalEl.querySelector('#btn-cancel-review').addEventListener('click', () => {
      if (this.onClose) this.onClose();
    });

    this.modalEl.querySelector('#btn-confirm-order-action').addEventListener('click', () => {
      const currentAuth = authEngine.getCurrentSession();
      const waiterId = currentAuth ? currentAuth.employeeId : 'emp-rahul';
      const subtotal = this.draftItems.reduce((acc, it) => acc + (it.price * it.quantity), 0);

      // 1. Create Confirmed Order
      const confirmedOrder = orderModel.createOrder({
        sessionId: this.sessionId,
        tableNumber: this.tableNumber,
        waiterId,
        items: this.draftItems,
        subtotal
      });

      // 2. Advance Session Milestone to ORDER_CONFIRMED
      sessionStateMachine.transitionMilestone(this.sessionId, SessionMilestones.ORDERS_STARTED);

      if (this.onOrderConfirmed) this.onOrderConfirmed(confirmedOrder);
    });
  }
}
