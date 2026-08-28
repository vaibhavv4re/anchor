/**
 * Capability Group 4 - Active Orders & Tickets Summary Widget for Waiters
 * Real-time KOT/BOT production tracker for Waiters and Floor Management.
 * Features:
 * - Workflow Tabs: "🛎️ Ready for Pickup", "🔥 In Kitchen Prep", "🔴 Queued KOTs", "📋 All Live KOTs".
 * - Prominent Table Identifiers on every KOT card (e.g. 🍽️ Table 04).
 * - Live item status pills (🔴 QUEUED, 🟡 PREPARING, 🟢 READY, ⚪ SERVED).
 * - One-tap 'Mark Served' button when dishes are delivered to table.
 * - Reactive auto-updates on platformEventBus and BroadcastChannel.
 */

import { orderModel } from '../../../../../businessos/platform/ordering/orderModel.js';
import { productionRoutingEngine } from '../../../../../businessos/platform/ordering/productionRoutingEngine.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

export class ActiveOrdersWidget {
  constructor(options = {}) {
    this.sessionId = options.sessionId || null;
    this.title = options.title || (this.sessionId ? '📋 Active Table Production & KOTs' : '📋 Live Kitchen & Bar Production');
    this.selectedStatusTab = 'READY'; // 'READY' | 'PREPARING' | 'QUEUED' | 'ALL'
    this.container = null;
    this.unsubscribers = [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'card active-orders-widget animate-fade-in';
    this.container.style.cssText = 'padding:18px; margin-bottom:var(--space-md); background:#131b2e; border:1px solid #1e293b; border-radius:10px; width:100%; color:#ffffff; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';

    this.subscribeEvents();
    this.updateContent();

    return this.container;
  }

  subscribeEvents() {
    if (this.unsubscribers.length > 0) return;

    const unsubOrder = platformEventBus.subscribe('order:confirmed', () => this.updateContent());
    const unsubTicket = platformEventBus.subscribe('ticket:status_changed', () => this.updateContent());
    const unsubItem = platformEventBus.subscribe('ticket:item_status_changed', () => this.updateContent());
    const unsubKot = platformEventBus.subscribe('kot:dispatched', () => this.updateContent());
    const unsubBot = platformEventBus.subscribe('bot:dispatched', () => this.updateContent());
    
    this.unsubscribers = [unsubOrder, unsubTicket, unsubItem, unsubKot, unsubBot];
  }

  getItemStatusBadge(status) {
    switch (status) {
      case 'READY':
        return '<span class="badge" style="background:#10b98122; color:#10b981; border:1px solid #10b981; font-size:0.7rem; font-weight:800; padding:2px 6px; border-radius:4px;">🟢 READY</span>';
      case 'PREPARING':
        return '<span class="badge" style="background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b; font-size:0.7rem; font-weight:800; padding:2px 6px; border-radius:4px;">🟡 PREPARING</span>';
      case 'SERVED':
        return '<span class="badge" style="background:#6b728022; color:#9ca3af; border:1px solid #6b7280; font-size:0.7rem; padding:2px 6px; border-radius:4px;">⚪ SERVED</span>';
      default:
        return '<span class="badge" style="background:#ef444422; color:#ef4444; border:1px solid #ef4444; font-size:0.7rem; font-weight:800; padding:2px 6px; border-radius:4px;">🔴 QUEUED</span>';
    }
  }

  getTicketStatusBadge(status) {
    switch (status) {
      case 'READY':
        return '<span class="badge" style="background:#10b981; color:#000000; font-size:0.75rem; font-weight:800; padding:4px 8px; border-radius:4px;">🟢 READY FOR PICKUP</span>';
      case 'PREPARING':
        return '<span class="badge" style="background:#f59e0b; color:#000000; font-size:0.75rem; font-weight:800; padding:4px 8px; border-radius:4px;">🟡 IN PREPARATION</span>';
      case 'SERVED':
        return '<span class="badge" style="background:#6b7280; color:#ffffff; font-size:0.75rem; padding:4px 8px; border-radius:4px;">⚪ SERVED</span>';
      default:
        return '<span class="badge" style="background:#ef4444; color:#ffffff; font-size:0.75rem; font-weight:800; padding:4px 8px; border-radius:4px;">🔴 QUEUED</span>';
    }
  }

  updateContent() {
    if (!this.container) return;

    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
    const tenantId = session.tenantId || 'tenant_h0qc7wf';

    // Retrieve active tickets
    const rawTickets = this.sessionId
      ? orderModel.getTicketsForSession(this.sessionId, tenantId)
      : orderModel.getAllTickets(tenantId);

    const activeTickets = (rawTickets || []).filter(t => t.status !== 'SERVED' && t.status !== 'CANCELLED');

    // Extract items across active tickets
    const allItems = [];
    activeTickets.forEach(t => {
      (t.items || []).forEach(i => {
        allItems.push({ ...i, ticketId: t.ticketId || t.id, ticketType: t.ticketType, ticketStatus: t.status });
      });
    });

    const readyTickets = activeTickets.filter(t => t.status === 'READY' || (t.items || []).some(i => (i.itemStatus || t.status) === 'READY'));
    const preparingTickets = activeTickets.filter(t => t.status === 'PREPARING');
    const queuedTickets = activeTickets.filter(t => t.status === 'QUEUED');

    // Filter tickets by workflow tab
    let filteredTickets = activeTickets;
    if (this.selectedStatusTab === 'READY') {
      filteredTickets = readyTickets;
    } else if (this.selectedStatusTab === 'PREPARING') {
      filteredTickets = preparingTickets;
    } else if (this.selectedStatusTab === 'QUEUED') {
      filteredTickets = queuedTickets;
    }

    this.container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:14px;">
        
        <!-- TOP WORKFLOW TABS FOR WAITERS -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-bottom:1px solid #1e293b; padding-bottom:12px;">
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn-waiter-kds-tab ${this.selectedStatusTab === 'READY' ? 'active' : ''}" data-tab="READY" style="padding:8px 14px; font-size:0.85rem; font-weight:800; border-radius:8px; cursor:pointer; background:${this.selectedStatusTab === 'READY' ? '#10b981' : '#1e293b'}; color:${this.selectedStatusTab === 'READY' ? '#000000' : '#94a3b8'}; border:none; display:flex; align-items:center; gap:6px;">
              🛎️ Ready for Pickup (${readyTickets.length})
            </button>
            <button class="btn-waiter-kds-tab ${this.selectedStatusTab === 'PREPARING' ? 'active' : ''}" data-tab="PREPARING" style="padding:8px 14px; font-size:0.85rem; font-weight:800; border-radius:8px; cursor:pointer; background:${this.selectedStatusTab === 'PREPARING' ? '#f59e0b' : '#1e293b'}; color:${this.selectedStatusTab === 'PREPARING' ? '#000000' : '#94a3b8'}; border:none; display:flex; align-items:center; gap:6px;">
              🔥 In Kitchen Prep (${preparingTickets.length})
            </button>
            <button class="btn-waiter-kds-tab ${this.selectedStatusTab === 'QUEUED' ? 'active' : ''}" data-tab="QUEUED" style="padding:8px 14px; font-size:0.85rem; font-weight:800; border-radius:8px; cursor:pointer; background:${this.selectedStatusTab === 'QUEUED' ? '#ef4444' : '#1e293b'}; color:${this.selectedStatusTab === 'QUEUED' ? '#ffffff' : '#94a3b8'}; border:none; display:flex; align-items:center; gap:6px;">
              🔴 Queued KOTs (${queuedTickets.length})
            </button>
            <button class="btn-waiter-kds-tab ${this.selectedStatusTab === 'ALL' ? 'active' : ''}" data-tab="ALL" style="padding:8px 14px; font-size:0.85rem; font-weight:800; border-radius:8px; cursor:pointer; background:${this.selectedStatusTab === 'ALL' ? '#3b82f6' : '#1e293b'}; color:${this.selectedStatusTab === 'ALL' ? '#ffffff' : '#94a3b8'}; border:none; display:flex; align-items:center; gap:6px;">
              📋 All Live Tickets (${activeTickets.length})
            </button>
          </div>

          <div style="font-size:0.75rem; color:#94a3b8; display:flex; align-items:center; gap:6px;">
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981; animation:pulse 2s infinite;"></span>
            Live Kitchen Sync Active
          </div>
        </div>

        <!-- TICKETS GRID DISPLAY -->
        ${filteredTickets.length === 0 ? `
          <div style="padding:40px 20px; text-align:center; color:#94a3b8;">
            <div style="font-size:2.5rem; margin-bottom:8px;">🛎️</div>
            <div style="font-weight:700; font-size:1rem; color:#ffffff;">No KOT Tickets in this View</div>
            <div style="font-size:0.85rem; margin-top:4px;">
              ${this.selectedStatusTab === 'READY' ? 'No dishes are currently waiting for waiter table pickup.' : 'All kitchen order queues are currently clear.'}
            </div>
          </div>
        ` : `
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:14px;">
            ${filteredTickets.map(t => {
              const isKot = t.ticketType === 'KOT';
              const ticketBorder = t.status === 'READY' ? '#10b981' : (t.status === 'PREPARING' ? '#f59e0b' : '#ef4444');
              const items = Array.isArray(t.items) ? t.items : [];
              const tableNum = t.tableNumber || (t.tableCode ? t.tableCode.replace(/[^0-9]/g, '') : '1');
              const tableText = t.tableCode ? `Table ${tableNum} (${t.tableCode})` : `Table ${tableNum}`;

              return `
                <div style="background:#0b0f19; border:1px solid #1e293b; border-top:4px solid ${ticketBorder}; border-radius:8px; padding:12px; display:flex; flex-direction:column; justify-content:space-between; gap:10px; box-shadow:0 4px 12px rgba(0,0,0,0.2);">
                  <div>
                    <!-- Ticket Header with Table Identifier -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; border-bottom:1px solid #1e293b; padding-bottom:8px;">
                      <div>
                        <div style="font-size:1.15rem; font-weight:800; color:#ffffff;">
                          🍽️ ${tableText}
                        </div>
                        <div style="font-size:0.7rem; color:#94a3b8; font-family:monospace; margin-top:2px;">
                          ${isKot ? '🍳 KOT' : '🍹 BOT'}: #${t.ticketId || t.id} • Order #${t.orderNumber || t.orderId}
                        </div>
                      </div>
                      ${this.getTicketStatusBadge(t.status)}
                    </div>

                    <!-- Item Status Breakdown -->
                    <div style="display:flex; flex-direction:column; gap:6px;">
                      ${items.map((it, idx) => {
                        const itemStatus = it.itemStatus || t.status || 'QUEUED';
                        const isReady = itemStatus === 'READY';

                        return `
                          <div style="display:flex; flex-direction:column; gap:4px; background:#1e293b; padding:8px 10px; border-radius:6px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                              <div style="font-size:0.88rem; font-weight:700; color:#ffffff;">
                                <span style="color:#3b82f6; font-weight:800;">${it.quantity || 1}x</span> ${it.name || it.itemName}
                              </div>
                              <div style="display:flex; align-items:center; gap:6px;">
                                ${this.getItemStatusBadge(itemStatus)}
                                ${isReady ? `
                                  <button class="btn-primary btn-mark-item-served" data-ticket-id="${t.ticketId || t.id}" data-item-id="${it.lineItemId || it.itemId || idx}" style="padding:3px 8px; font-size:0.75rem; font-weight:800; background:#10b981; color:#000000; border:none; border-radius:4px; cursor:pointer;">
                                    🍽️ Serve Item
                                  </button>
                                ` : ''}
                              </div>
                            </div>

                            ${it.notes ? `
                              <div style="font-size:0.75rem; color:#f59e0b; background:#f59e0b15; padding:2px 6px; border-radius:4px; font-weight:600;">
                                ⚠️ ${it.notes}
                              </div>
                            ` : ''}
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>

                  <!-- Footer Ticket Action Button -->
                  ${t.status === 'READY' ? `
                    <div style="border-top:1px solid #1e293b; padding-top:8px;">
                      <button class="btn-primary btn-mark-all-served" data-ticket-id="${t.ticketId || t.id}" style="width:100%; padding:8px; font-weight:800; font-size:0.85rem; background:#10b981; color:#000000; border:none; border-radius:6px; cursor:pointer;">
                        🍽️ Mark Entire KOT Served to Table
                      </button>
                    </div>
                  ` : ''}

                </div>
              `;
            }).join('')}
          </div>
        `}

      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    // Tab buttons
    this.container.querySelectorAll('.btn-waiter-kds-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedStatusTab = btn.dataset.tab;
        this.updateContent();
      });
    });

    // Mark single item served
    this.container.querySelectorAll('.btn-mark-item-served').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ticketId = btn.dataset.ticketId;
        const itemId = btn.dataset.itemId;

        const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
        const tenantId = session.tenantId || 'tenant_h0qc7wf';

        productionRoutingEngine.updateTicketItemStatus(ticketId, itemId, 'SERVED', tenantId);
        platformEventBus.publish('ticket:status_changed', { ticketId, itemId, status: 'SERVED' });
        this.updateContent();
      });
    });

    // Mark entire ticket served
    this.container.querySelectorAll('.btn-mark-all-served').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ticketId = btn.dataset.ticketId;

        const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
        const tenantId = session.tenantId || 'tenant_h0qc7wf';

        orderModel.updateTicketStatus(ticketId, 'SERVED', tenantId);
        platformEventBus.publish('ticket:status_changed', { ticketId, status: 'SERVED' });
        this.updateContent();
      });
    });
  }
}
