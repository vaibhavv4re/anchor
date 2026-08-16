/**
 * Capability Group 4 - Active Orders & Tickets Summary Widget
 * Displays dispatched KOT (Kitchen) and BOT (Bar) tickets for the active session.
 */

import { orderModel } from '../../../../../businessos/platform/ordering/orderModel.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

export class ActiveOrdersWidget {
  constructor({ sessionId }) {
    this.sessionId = sessionId;
    this.container = null;
    this.unsubscribeEvent = null;
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'card animate-fade-in';
    this.container.style.cssText = 'padding:var(--space-md); margin-top:var(--space-lg);';

    this.subscribeEvents();
    this.updateContent();

    return this.container;
  }

  subscribeEvents() {
    this.unsubscribeEvent = platformEventBus.subscribe('order:confirmed', () => {
      this.updateContent();
    });
  }

  updateContent() {
    const orders = orderModel.getOrdersForSession(this.sessionId);
    const tickets = orderModel.getTicketsForSession(this.sessionId);

    if (!orders.length) {
      this.container.innerHTML = `
        <div style="font-size:0.875rem; font-weight:600; text-transform:uppercase; color:var(--text-secondary); margin-bottom:4px;">
          📋 Active Session Orders & Tickets
        </div>
        <div style="color:var(--text-muted); font-size:0.875rem;">No orders placed for this session yet.</div>
      `;
      return;
    }

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-md);">
        <div style="font-size:0.875rem; font-weight:600; text-transform:uppercase; color:var(--text-secondary);">
          📋 Active Orders & Dispatched Tickets (${orders.length} Orders)
        </div>
      </div>

      <!-- Dispatched KOT / BOT Tickets -->
      <div style="display:flex; gap:var(--space-sm); flex-wrap:wrap; margin-bottom:var(--space-md);">
        ${tickets.map(t => `
          <div style="background:var(--bg-surface-2); border:1px solid ${t.ticketType === 'KOT' ? '#3b82f6' : '#8b5cf6'}; border-radius:var(--radius-sm); padding:8px 12px;">
            <div style="display:flex; justify-content:space-between; gap:12px; font-weight:700; font-size:0.85rem;">
              <span>${t.ticketType === 'KOT' ? '🍳' : '🍹'} ${t.ticketType} (${t.destination})</span>
              <span class="badge badge-info" style="font-size:0.65rem;">${t.status}</span>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
              ${t.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
}
