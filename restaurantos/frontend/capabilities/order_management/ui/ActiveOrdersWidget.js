/**
 * Capability Group 4 - Active Orders & Tickets Summary Widget
 *
 * Real-time KOT/BOT production tracker for Waiters and Floor Management.
 * Features:
 * - Prominent Table Identifiers on every KOT card (e.g. 🍽️ Table 04).
 * - Live item status pills (🔴 QUEUED, 🟡 PREPARING, 🟢 READY, ⚪ SERVED).
 * - One-tap 'Mark Served' button when dishes are delivered to the table.
 * - Reactive auto-updates on platformEventBus and BroadcastChannel.
 */

import { orderModel } from '../../../../../businessos/platform/ordering/orderModel.js';
import { productionRoutingEngine } from '../../../../../businessos/platform/ordering/productionRoutingEngine.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

export class ActiveOrdersWidget {
  constructor(options = {}) {
    this.sessionId = options.sessionId || null;
    this.title = options.title || (this.sessionId ? '📋 Active Table Production & KOTs' : '📋 Live Kitchen & Bar Production');
    this.container = null;
    this.unsubscribers = [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'card active-orders-widget animate-fade-in';
    this.container.style.cssText = 'padding:16px; margin-bottom:var(--space-md); background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:8px; width:100%;';

    this.subscribeEvents();
    this.updateContent();

    return this.container;
  }

  subscribeEvents() {
    const unsubOrder = platformEventBus.subscribe('order:confirmed', () => {
      this.updateContent();
    });
    const unsubTicket = platformEventBus.subscribe('ticket:status_changed', () => {
      this.updateContent();
    });
    const unsubItem = platformEventBus.subscribe('ticket:item_status_changed', () => {
      this.updateContent();
    });
    const unsubKot = platformEventBus.subscribe('kot:dispatched', () => {
      this.updateContent();
    });
    const unsubBot = platformEventBus.subscribe('bot:dispatched', () => {
      this.updateContent();
    });
    this.unsubscribers = [unsubOrder, unsubTicket, unsubItem, unsubKot, unsubBot];
  }

  getItemStatusBadge(status) {
    switch (status) {
      case 'READY':
        return '<span class="badge" style="background:rgba(16,185,129,0.2); color:#10b981; border:1px solid #10b981; font-size:0.7rem; font-weight:800;">🟢 READY</span>';
      case 'PREPARING':
        return '<span class="badge" style="background:rgba(245,158,11,0.2); color:#f59e0b; border:1px solid #f59e0b; font-size:0.7rem; font-weight:800;">🟡 PREPARING</span>';
      case 'SERVED':
        return '<span class="badge" style="background:rgba(107,114,128,0.2); color:#9ca3af; border:1px solid #6b7280; font-size:0.7rem;">⚪ SERVED</span>';
      default:
        return '<span class="badge badge-info" style="font-size:0.7rem; font-weight:700;">🔴 QUEUED</span>';
    }
  }

  getTicketStatusBadge(status) {
    switch (status) {
      case 'READY':
        return '<span class="badge" style="background:#10b981; color:#fff; font-size:0.75rem; font-weight:800;">🟢 ALL READY</span>';
      case 'PREPARING':
        return '<span class="badge" style="background:#f59e0b; color:#000; font-size:0.75rem; font-weight:800;">🟡 IN PREPARATION</span>';
      case 'SERVED':
        return '<span class="badge" style="background:#6b7280; color:#fff; font-size:0.75rem;">⚪ SERVED</span>';
      default:
        return '<span class="badge badge-info" style="font-size:0.75rem; font-weight:700;">🔴 QUEUED</span>';
    }
  }

  updateContent() {
    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
    const tenantId = session.tenantId || 'tenant_h0qc7wf';

    // Retrieve tickets either for specific session or all active tickets across the restaurant
    const tickets = this.sessionId
      ? orderModel.getTicketsForSession(this.sessionId, tenantId)
      : orderModel.getAllTickets(tenantId);

    if (!tickets.length) {
      this.container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:0.875rem; font-weight:700; text-transform:uppercase; color:var(--text-secondary);">
            ${this.title}
          </div>
          <div style="font-size:0.75rem; color:var(--text-muted);">
            ⚡ Live KDS Sync
          </div>
        </div>
        <div style="color:var(--text-muted); font-size:0.85rem; padding:10px 0;">No active kitchen or bar tickets at the moment.</div>
      `;
      return;
    }

    // Extract all items across tickets
    const allItems = [];
    tickets.forEach(t => {
      (t.items || []).forEach(i => {
        allItems.push({ ...i, ticketId: t.ticketId || t.id, ticketType: t.ticketType, ticketStatus: t.status });
      });
    });

    const readyItems = allItems.filter(i => (i.itemStatus || i.ticketStatus) === 'READY');

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
        <div style="font-size:0.9rem; font-weight:800; text-transform:uppercase; color:var(--text-main); display:flex; align-items:center; gap:8px;">
          <span>📋</span> ${this.title} (${tickets.length} Ticket${tickets.length !== 1 ? 's' : ''}, ${allItems.length} Item${allItems.length !== 1 ? 's' : ''})
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted); display:flex; align-items:center; gap:6px;">
          <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981; animation:pulse 2s infinite;"></span>
          Live KDS Sync Active
        </div>
      </div>

      <!-- Live Kitchen Ready Alert Banner -->
      ${readyItems.length > 0 ? `
        <div class="card animate-fade-in" style="background:#10b98115; border:1px solid #10b981; padding:10px 14px; border-radius:6px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="font-weight:700; color:#10b981; font-size:0.9rem; display:flex; align-items:center; gap:6px;">
            <span>🔔</span> <strong>${readyItems.length} Item(s) READY for Table Service!</strong>
          </div>
          <div style="font-size:0.8rem; color:var(--text-secondary);">
            ${readyItems.map(i => `${i.quantity || 1}x ${i.name || i.itemName}`).join(', ')}
          </div>
        </div>
      ` : ''}

      <!-- Dispatched KOT / BOT Tickets Grid -->
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:12px;">
        ${tickets.map(t => {
          const isKot = t.ticketType === 'KOT';
          const ticketBorder = t.status === 'READY' ? '#10b981' : (t.status === 'PREPARING' ? '#f59e0b' : (isKot ? '#3b82f6' : '#8b5cf6'));
          const items = Array.isArray(t.items) ? t.items : [];
          const tableNum = t.tableNumber || (t.tableCode ? t.tableCode.replace(/[^0-9]/g, '') : '');
          const tableText = t.tableCode ? `Table ${tableNum || t.tableCode}` : (tableNum ? `Table ${tableNum}` : 'Table');

          return `
            <div style="background:var(--bg-surface-2); border:1px solid ${ticketBorder}; border-top:4px solid ${ticketBorder}; border-radius:8px; padding:12px; display:flex; flex-direction:column; gap:8px;">
              
              <!-- Ticket Header with PROMINENT TABLE IDENTIFIER -->
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                <div>
                  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <!-- High-Visibility Table Badge -->
                    <span class="badge badge-primary" style="font-size:0.85rem; font-weight:800; background:rgba(59, 130, 246, 0.2); color:#60a5fa; border:1px solid #3b82f6; padding:3px 8px; border-radius:6px; letter-spacing:0.5px;">
                      🍽️ ${tableText}
                    </span>
                    <span style="font-weight:800; font-size:0.95rem; font-family:monospace; color:var(--text-main);">
                      ${isKot ? '🍳' : '🍹'} ${t.ticketId || t.id}
                    </span>
                  </div>
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-top:3px;">
                    ${t.destination || (isKot ? 'KITCHEN' : 'BAR')} ${t.orderNumber ? `• Order: <strong>${t.orderNumber}</strong>` : ''}
                  </div>
                </div>
                ${this.getTicketStatusBadge(t.status)}
              </div>

              <!-- Item-Level Status Breakdown -->
              <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px; border-top:1px solid var(--border-subtle); padding-top:8px;">
                ${items.map((it, idx) => {
                  const itemStatus = it.itemStatus || t.status || 'QUEUED';
                  const isReady = itemStatus === 'READY';

                  return `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1); padding:6px 10px; border-radius:6px; gap:8px;">
                      <div style="flex:1;">
                        <span style="font-weight:700; font-size:0.85rem; color:var(--text-main);">
                          <strong>${it.quantity || 1}x</strong> ${it.name || it.itemName}
                        </span>
                        ${it.stationName ? `<span style="font-size:0.65rem; color:var(--text-muted); margin-left:4px;">(${it.stationName})</span>` : ''}
                      </div>

                      <div style="display:flex; align-items:center; gap:6px;">
                        ${this.getItemStatusBadge(itemStatus)}
                        ${isReady ? `
                          <button class="btn-primary btn-mark-item-served" data-ticket-id="${t.ticketId || t.id}" data-item-id="${it.lineItemId || it.itemId || idx}" style="padding:3px 8px; font-size:0.75rem; font-weight:700; background:#10b981; color:#fff; border-radius:4px; cursor:pointer;">
                            🍽️ Serve
                          </button>
                        ` : ''}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.container.querySelectorAll('.btn-mark-item-served').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ticketId = btn.dataset.ticketId;
        const itemId = btn.dataset.itemId;
        btn.disabled = true;
        btn.innerHTML = '✓ Served';

        const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
        const tenantId = session.tenantId || 'tenant_h0qc7wf';

        productionRoutingEngine.updateTicketItemStatus(ticketId, itemId, 'SERVED', tenantId);
        this.updateContent();
      });
    });
  }
}
