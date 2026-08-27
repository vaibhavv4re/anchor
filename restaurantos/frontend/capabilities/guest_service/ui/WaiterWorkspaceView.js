/**
 * Capability Group 3 & 4 — Waiter Operational Workspace Composition Root
 *
 * Dedicated, touch-first workspace for Waiters & Floor Service Staff (PD-008 & PD-010).
 * Features:
 * - Default landing view: 🗺️ Live Floor & Tables (zero admin/kitchen clutter).
 * - Real-time Kitchen Ready Alert ticker listening to KDS ticket status changes.
 * - Seamless sub-view switching: Floor & Tables, My Active Tables, Quick Menu & Prices, Timesheet.
 * - Sourced 100% live from DataGateway / Supabase orders & tables.
 */

import { tableProjectionService } from '../../../../../businessos/platform/table_state/tableProjectionService.js';
import { sessionModel } from '../../../../../businessos/platform/session/sessionModel.js';
import { sessionProjectionService } from '../../../../../businessos/platform/session/sessionProjectionService.js';
import { orderModel } from '../../../../../businessos/platform/ordering/orderModel.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { FloorViewerView } from '../../restaurant_layout/ui/FloorViewerView.js';
import { ActiveSessionView } from './ActiveSessionView.js';
import { MenuBrowserView } from '../../order_management/ui/MenuBrowserView.js';
import { AttendanceView } from '../../attendance/ui/AttendanceView.js';
import { ActiveOrdersWidget } from '../../order_management/ui/ActiveOrdersWidget.js';
import { toastNotificationManager } from './ToastNotificationManager.js';

export class WaiterWorkspaceView {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
    this.authEngine = deps.authEngine || null;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
    this.toastManager = toastNotificationManager;

    this.activeSubView = 'floor'; // Default landing view: Floor & Tables
    this.selectedTableSessionId = null;
    this.rootMount = null;
    this.unsubscribeEvents = [];
  }

  async render(mount, session) {
    if (!mount) return;
    this.rootMount = mount;

    const waiterName = session ? (session.employeeName || session.name || 'Waiter') : 'Staff';
    const waiterId = session ? (session.employeeId || session.id || 'emp-waiter') : 'emp-waiter';
    const tenantId = session ? (session.tenantId || session.tenant_id) : 'tenant_h0qc7wf';

    this.subscribeRealtimeEvents(tenantId);
    this.updateWorkspaceShell(waiterName, waiterId, tenantId, session);

    return this.rootMount;
  }

  subscribeRealtimeEvents(tenantId) {
    if (this.unsubscribeEvents.length > 0) return;

    const refreshAll = () => {
      this.updateHeaderBadges(tenantId);
      if (this.activeSubView === 'my_tables' && this.rootMount) {
        const mount = this.rootMount.querySelector('#waiter-content-mount');
        if (mount) {
          const session = this.authEngine ? this.authEngine.getCurrentSession() : null;
          const waiterName = session ? (session.employeeName || session.name || 'Waiter') : 'Staff';
          const waiterId = session ? (session.employeeId || session.id || 'emp-waiter') : 'emp-waiter';
          this.renderMyTablesView(mount, waiterName, waiterId, tenantId, session);
        }
      }
    };

    const unsubTicket = platformEventBus.subscribe('ticket:status_changed', refreshAll);
    const unsubItem = platformEventBus.subscribe('ticket:item_status_changed', refreshAll);
    const unsubKot = platformEventBus.subscribe('kot:dispatched', refreshAll);
    const unsubBot = platformEventBus.subscribe('bot:dispatched', refreshAll);
    const unsubOrder = platformEventBus.subscribe('order:confirmed', refreshAll);
    const unsubSession = platformEventBus.subscribe('session:created', refreshAll);
    const unsubMilestone = platformEventBus.subscribe('session:milestone:changed', refreshAll);
    const unsubTable = platformEventBus.subscribe('table:state:changed', refreshAll);
    const unsubFinalized = platformEventBus.subscribe('bill:finalized', refreshAll);
    const unsubSettled = platformEventBus.subscribe('bill:settled', refreshAll);
    const unsubReopened = platformEventBus.subscribe('bill:reopened', refreshAll);

    this.unsubscribeEvents.push(unsubTicket, unsubItem, unsubKot, unsubBot, unsubOrder, unsubSession, unsubMilestone, unsubTable, unsubFinalized, unsubSettled, unsubReopened);
  }

  getReadyTickets(tenantId) {
    const tickets = orderModel.getAllTickets(tenantId) || [];
    return tickets.filter(t => t.status === 'READY');
  }

  getReadyItems(tenantId) {
    const tickets = orderModel.getAllTickets(tenantId) || [];
    const readyList = [];
    tickets.forEach(t => {
      (t.items || []).forEach(i => {
        const itemStatus = i.itemStatus || t.status;
        if (itemStatus === 'READY') {
          readyList.push({
            ...i,
            tableNumber: t.tableNumber,
            tableCode: t.tableCode,
            ticketId: t.ticketId || t.id,
            sessionId: t.sessionId
          });
        }
      });
    });
    return readyList;
  }

  getMyActiveSessions(waiterId, tenantId) {
    const allSessions = sessionModel.getAllSessions(tenantId) || [];
    return allSessions.filter(s => s.status !== 'CLOSED');
  }

  updateWorkspaceShell(waiterName, waiterId, tenantId, session) {
    const readyItems = this.getReadyItems(tenantId);
    const mySessions = this.getMyActiveSessions(waiterId, tenantId);
    const allTickets = orderModel.getAllTickets(tenantId) || [];

    this.rootMount.innerHTML = `
      <div class="waiter-workspace animate-fade-in" style="display:flex; flex-direction:column; min-height:calc(100vh - 60px); width:100%;">
        
        <!-- TOP WAITER ACTION & STATUS BAR -->
        <header style="background:var(--bg-surface-1); border-bottom:1px solid var(--border-subtle); padding:12px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:14px;">
            <div style="font-size:1.4rem;">🍽️</div>
            <div>
              <div style="font-weight:800; font-size:1.1rem; line-height:1.2;">
                Anchor Waiter POS <span style="font-weight:400; color:var(--text-muted); font-size:0.85rem;">• Floor Service Console</span>
              </div>
              <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:2px;">
                Server: <strong>${waiterName}</strong> • Shift: <span class="badge badge-success" style="font-size:0.65rem;">ACTIVE</span>
              </div>
            </div>
          </div>

          <!-- Live Operational KPIs & Alerts -->
          <div id="waiter-header-badges" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            ${this.renderHeaderBadgesHTML(readyItems, mySessions)}
          </div>
        </header>

        <!-- MAIN OPERATIONAL WORKSPACE BODY -->
        <div style="display:flex; flex:1; overflow:hidden;">
          
          <!-- STREAMLINED WAITER SIDEBAR (Zero Admin Clutter) -->
          <aside style="width:220px; background:var(--bg-surface-1); border-right:1px solid var(--border-subtle); padding:16px 12px; display:flex; flex-direction:column; justify-content:space-between;">
            <div style="display:flex; flex-direction:column; gap:6px;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:6px; padding-left:8px;">
                Service Navigation
              </div>
              
              <button class="nav-item waiter-nav-btn ${this.activeSubView === 'floor' ? 'active' : ''}" data-view="floor" style="display:flex; align-items:center; gap:10px; width:100%; text-align:left; padding:10px 14px; border-radius:6px; font-weight:600; font-size:0.9rem; cursor:pointer;">
                <span>🗺️</span> Floor & Tables
              </button>

              <button class="nav-item waiter-nav-btn ${this.activeSubView === 'orders' ? 'active' : ''}" data-view="orders" style="display:flex; align-items:center; justify-content:space-between; width:100%; text-align:left; padding:10px 14px; border-radius:6px; font-weight:600; font-size:0.9rem; cursor:pointer;">
                <span style="display:flex; align-items:center; gap:10px;"><span>📋</span> Live Orders & KOTs</span>
                ${readyItems.length > 0 ? `
                  <span class="badge" style="background:#10b981; color:#fff; font-size:0.7rem; padding:2px 6px; font-weight:800; animation:pulse 1.5s infinite;">${readyItems.length} READY</span>
                ` : `
                  <span class="badge badge-secondary" style="font-size:0.7rem; padding:2px 6px;">${allTickets.length}</span>
                `}
              </button>

              <button class="nav-item waiter-nav-btn ${this.activeSubView === 'my_tables' ? 'active' : ''}" data-view="my_tables" style="display:flex; align-items:center; justify-content:space-between; width:100%; text-align:left; padding:10px 14px; border-radius:6px; font-weight:600; font-size:0.9rem; cursor:pointer;">
                <span style="display:flex; align-items:center; gap:10px;"><span>🛎️</span> My Tables</span>
                <span class="badge badge-info" style="font-size:0.7rem; padding:2px 6px;">${mySessions.length}</span>
              </button>

              <button class="nav-item waiter-nav-btn ${this.activeSubView === 'menu' ? 'active' : ''}" data-view="menu" style="display:flex; align-items:center; gap:10px; width:100%; text-align:left; padding:10px 14px; border-radius:6px; font-weight:600; font-size:0.9rem; cursor:pointer;">
                <span>🍽️</span> POS Menu & Prices
              </button>

              <button class="nav-item waiter-nav-btn ${this.activeSubView === 'attendance' ? 'active' : ''}" data-view="attendance" style="display:flex; align-items:center; gap:10px; width:100%; text-align:left; padding:10px 14px; border-radius:6px; font-weight:600; font-size:0.9rem; cursor:pointer;">
                <span>⏱️</span> My Shift & Timesheet
              </button>
            </div>

            <!-- Lock / Fast Logout -->
            <div style="border-top:1px solid var(--border-subtle); padding-top:12px;">
              <button id="btn-waiter-lock" class="btn-secondary w-full" style="padding:8px 12px; font-size:0.8rem; font-weight:600; display:flex; align-items:center; justify-content:center; gap:6px;">
                🔒 Lock Terminal
              </button>
            </div>
          </aside>

          <!-- ACTIVE CONTENT MOUNT -->
          <main id="waiter-content-mount" style="flex:1; padding:20px; overflow-y:auto; background:var(--bg-app);">
            <!-- Sub-view rendered dynamically here -->
          </main>
        </div>
      </div>
    `;

    this.bindShellEvents(waiterName, waiterId, tenantId, session);
    this.mountActiveSubView(waiterName, waiterId, tenantId, session);
  }

  renderHeaderBadgesHTML(readyItems, mySessions) {
    return `
      ${readyItems.length > 0 ? `
        <div class="card animate-fade-in" style="background:#10b98122; border:1px solid #10b981; padding:6px 12px; border-radius:6px; display:flex; align-items:center; gap:8px; cursor:pointer;" id="btn-ready-alert">
          <span style="font-size:1.1rem; animation:pulse 1.5s infinite;">🔔</span>
          <span style="color:#10b981; font-weight:700; font-size:0.85rem;">
            ${readyItems.length} Item${readyItems.length !== 1 ? 's' : ''} READY for Pickup!
          </span>
        </div>
      ` : `
        <div style="font-size:0.8rem; color:var(--text-muted); display:flex; align-items:center; gap:6px;">
          <span>🍳</span> Kitchen Queue Normal
        </div>
      `}

      <div style="background:var(--bg-surface-2); padding:6px 12px; border-radius:6px; font-size:0.85rem; font-weight:600;">
        Active Tables: <strong style="color:var(--accent-primary);">${mySessions.length}</strong>
      </div>
    `;
  }

  updateHeaderBadges(tenantId) {
    const badgesEl = this.rootMount.querySelector('#waiter-header-badges');
    if (!badgesEl) return;
    const session = this.authEngine ? this.authEngine.getCurrentSession() : null;
    const waiterId = session ? (session.employeeId || session.id) : null;
    const readyItems = this.getReadyItems(tenantId);
    const mySessions = this.getMyActiveSessions(waiterId, tenantId);
    badgesEl.innerHTML = this.renderHeaderBadgesHTML(readyItems, mySessions);

    const alertBtn = badgesEl.querySelector('#btn-ready-alert');
    if (alertBtn) {
      alertBtn.addEventListener('click', () => {
        this.activeSubView = 'orders';
        this.updateWorkspaceShell(session?.employeeName || 'Waiter', waiterId, tenantId, session);
      });
    }
  }

  bindShellEvents(waiterName, waiterId, tenantId, session) {
    this.rootMount.querySelectorAll('.waiter-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeSubView = btn.dataset.view;
        this.selectedTableSessionId = null;
        this.rootMount.querySelectorAll('.waiter-nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.mountActiveSubView(waiterName, waiterId, tenantId, session);
      });
    });

    const lockBtn = this.rootMount.querySelector('#btn-waiter-lock');
    if (lockBtn && this.authEngine) {
      lockBtn.addEventListener('click', () => {
        this.authEngine.logout();
        window.location.reload();
      });
    }

    const alertBtn = this.rootMount.querySelector('#btn-ready-alert');
    if (alertBtn) {
      alertBtn.addEventListener('click', () => {
        this.activeSubView = 'orders';
        this.updateWorkspaceShell(waiterName, waiterId, tenantId, session);
      });
    }
  }

  mountActiveSubView(waiterName, waiterId, tenantId, session) {
    const mount = this.rootMount.querySelector('#waiter-content-mount');
    if (!mount) return;
    mount.innerHTML = '';

    if (this.activeSubView === 'floor') {
      // 1. Floor & Tables Viewer (Clean floor grid)
      const floorView = new FloorViewerView();
      mount.appendChild(floorView.render());
    } else if (this.activeSubView === 'orders') {
      // 2. Dedicated Live Orders & KOTs Screen
      this.renderLiveOrdersView(mount, waiterName, waiterId, tenantId, session);
    } else if (this.activeSubView === 'my_tables') {
      // 3. My Active Tables Screen
      this.renderMyTablesView(mount, waiterName, waiterId, tenantId, session);
    } else if (this.activeSubView === 'menu') {
      // 4. POS Menu & Price Catalog
      this.renderPosMenuView(mount, waiterName, waiterId, tenantId, session);
    } else if (this.activeSubView === 'attendance') {
      // 5. Timesheet & Attendance
      const attView = new AttendanceView();
      mount.appendChild(attView.render());
    }
  }

  renderLiveOrdersView(mount, waiterName, waiterId, tenantId, session) {
    mount.innerHTML = `
      <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h2 style="font-size:1.75rem; margin:0;">📋 Live Orders & Kitchen KOT Production</h2>
            <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
              Real-time ticket fulfillment tracking across all dining tables and kitchen stations.
            </p>
          </div>
          <button class="btn-primary" id="btn-orders-go-floor" style="padding:10px 18px; font-weight:700;">
            🗺️ Open Floor Map
          </button>
        </div>

        <div id="live-orders-widget-mount"></div>
      </div>
    `;

    const widgetMount = mount.querySelector('#live-orders-widget-mount');
    if (widgetMount) {
      const widget = new ActiveOrdersWidget({
        title: 'Active KOT & BOT Tickets'
      });
      widgetMount.appendChild(widget.render());
    }

    const goFloorBtn = mount.querySelector('#btn-orders-go-floor');
    if (goFloorBtn) {
      goFloorBtn.addEventListener('click', () => {
        this.activeSubView = 'floor';
        this.updateWorkspaceShell(waiterName, waiterId, tenantId, session);
      });
    }
  }

  renderPosMenuView(mount, waiterName, waiterId, tenantId, session) {
    const mySessions = this.getMyActiveSessions(waiterId, tenantId);

    if (mySessions.length > 0) {
      // If active sessions exist, let the waiter take orders for the active table
      const activeSession = mySessions[0];
      this.openTableServiceConsole(mount, activeSession.id, waiterName, waiterId, tenantId, session);
    } else {
      // Standalone Menu Browser with prompt to seat a table
      mount.innerHTML = `
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:16px;">
          <div class="card" style="background:var(--bg-surface-1); border-left:4px solid var(--accent-primary); padding:16px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <h2 style="font-size:1.4rem; margin:0;">🍽️ Restaurant Menu & Price Catalog</h2>
              <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
                70 authentic Coastal dishes • To take customer orders, seat guests on a table first.
              </p>
            </div>
            <button class="btn-primary" id="btn-menu-go-floor" style="padding:10px 18px; font-weight:700;">
              🗺️ Open Floor Map & Seat Table
            </button>
          </div>
          <div id="standalone-menu-mount"></div>
        </div>
      `;

      const menuMount = mount.querySelector('#standalone-menu-mount');
      const menuView = new MenuBrowserView({
        onSelectItem: (item) => {
          alert(`Selected: ${item.name} (₹${item.price}). Please seat a table in Floor & Tables to build and dispatch customer orders.`);
        }
      });
      menuMount.appendChild(menuView.render());

      const goFloorBtn = mount.querySelector('#btn-menu-go-floor');
      if (goFloorBtn) {
        goFloorBtn.addEventListener('click', () => {
          this.activeSubView = 'floor';
          this.updateWorkspaceShell(waiterName, waiterId, tenantId, session);
        });
      }
    }
  }

  renderMyTablesView(mount, waiterName, waiterId, tenantId, session) {
    const mySessions = this.getMyActiveSessions(waiterId, tenantId);
    const readyTickets = this.getReadyTickets(tenantId);

    mount.innerHTML = `
      <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h2 style="font-size:1.75rem; margin:0;">🛎️ My Active Tables & Service Sessions</h2>
            <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
              Live orders, ticket fulfillment status, and running subtotals for tables assigned to ${waiterName}.
            </p>
          </div>
          <button class="btn-primary" id="btn-mytables-go-floor" style="padding:10px 18px; font-weight:700;">
            🗺️ Open Floor Map & Seat Guests
          </button>
        </div>

        ${readyTickets.length > 0 ? `
          <div class="card animate-fade-in" style="background:#10b98115; border:1px solid #10b981; padding:14px 18px; border-radius:8px;">
            <div style="font-weight:700; color:#10b981; font-size:1rem; margin-bottom:4px;">
              🔔 Ready for Service (${readyTickets.length} Ticket${readyTickets.length !== 1 ? 's' : ''})
            </div>
            <div style="font-size:0.85rem; color:var(--text-secondary);">
              ${readyTickets.map(t => `<strong>Table ${t.tableNumber || t.tableCode}:</strong> ${(t.items || []).map(i => `${i.quantity || 1}x ${i.name || i.itemName}`).join(', ')}`).join(' • ')}
            </div>
          </div>
        ` : ''}

        ${mySessions.length > 0 ? `
          <div class="grid grid-cols-3 gap-md">
            ${mySessions.map(s => {
              const proj = sessionProjectionService.getSessionProjection(s.id, tenantId);
              const orders = orderModel.getOrdersForSession(s.id, tenantId);
              const tickets = orderModel.getTicketsForSession(s.id, tenantId);
              const readyForThisTable = tickets.filter(t => t.status === 'READY');

              // Compute human-readable stage status & badge class
              const isPaymentSettled = s.status === 'PAYMENT_RECEIVED' || s.status === 'PAYMENT_SETTLED' || s.billStatus === 'PAID' || s.billStatus === 'SETTLED' || (proj && (proj.status === 'PAYMENT_RECEIVED' || proj.billStatus === 'PAID'));
              const isPaymentPending = !isPaymentSettled && (s.status === 'BILL_GENERATED' || s.status === 'PAYMENT_PENDING' || (proj && (proj.status === 'BILL_GENERATED' || proj.billStatus === 'GENERATED')));

              let badgeClass = 'badge-info';
              let statusLabel = '🔵 ORDERS STARTED';

              if (isPaymentSettled) {
                badgeClass = 'badge-success';
                statusLabel = '🟢 PAYMENT SETTLED';
              } else if (isPaymentPending) {
                badgeClass = 'badge-warning';
                statusLabel = '🟡 PAYMENT PENDING';
              } else if (s.status === 'ORDERS_CONFIRMED' || s.status === 'KITCHEN_UPDATES') {
                badgeClass = 'badge-info';
                statusLabel = '🟣 ORDERS IN KITCHEN';
              } else if (s.status === 'GUESTS_SEATED') {
                badgeClass = 'badge-info';
                statusLabel = '🔵 GUESTS SEATED';
              }

              return `
                <div class="card my-table-card animate-fade-in" data-session-id="${s.id}" style="padding:20px; background:var(--bg-surface-1); border-radius:8px; border-top:4px solid ${readyForThisTable.length > 0 ? '#10b981' : (isPaymentSettled ? '#10b981' : (isPaymentPending ? '#f59e0b' : 'var(--accent-primary)'))}; display:flex; flex-direction:column; justify-content:space-between; gap:14px;">
                  <div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <div style="font-size:1.3rem; font-weight:800;">Table ${s.tableNumber} <span style="font-size:0.85rem; font-weight:400; color:var(--text-muted);">(${s.tableCode || `T-${s.tableNumber}`})</span></div>
                      <span class="badge ${badgeClass}" style="font-size:0.75rem; font-weight:700;">
                        ${statusLabel}
                      </span>
                    </div>

                    <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:8px;">
                      👥 ${s.guestCount} Guests • ⏱️ ${proj ? proj.elapsedTime : 'Active'}
                    </div>

                    ${s.celebrationFlag ? `<div style="margin-top:6px;"><span class="badge badge-warning" style="font-size:0.7rem;">🎂 ${s.celebrationFlag}</span></div>` : ''}
                    ${s.guestNotes ? `<div style="font-size:0.8rem; color:var(--text-muted); font-style:italic; margin-top:6px;">"${s.guestNotes}"</div>` : ''}

                    <div style="border-top:1px solid var(--border-subtle); margin-top:12px; padding-top:10px; font-size:0.85rem;">
                      <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">Ordered Items:</span>
                        <strong>${proj && proj.itemizedList ? proj.itemizedList.length : orders.length} Items (${tickets.length} Tickets)</strong>
                      </div>
                      <div style="display:flex; justify-content:space-between; margin-top:4px;">
                        <span style="color:var(--text-muted);">Running Total:</span>
                        <strong style="color:var(--accent-primary); font-size:1.05rem;">₹${proj ? (proj.grandTotal || proj.subtotal).toFixed(2) : '0.00'}</strong>
                      </div>
                    </div>

                    ${readyForThisTable.length > 0 ? `
                      <div style="background:#10b98122; color:#10b981; border:1px solid #10b981; border-radius:4px; padding:6px 10px; font-size:0.75rem; font-weight:700; margin-top:10px;">
                        🔔 Food is READY for this table!
                      </div>
                    ` : ''}
                  </div>

                  <div style="display:flex; gap:8px;">
                    ${isPaymentSettled ? `
                      <button class="btn-primary btn-close-settled-table" data-session-id="${s.id}" data-table="${s.tableNumber}" style="padding:10px; font-weight:700; flex:1; background:#10b981; color:#000;">
                        ✨ Close Table Session & Mark Cleaning →
                      </button>
                    ` : `
                      <button class="btn-primary btn-open-table-service" data-session-id="${s.id}" style="padding:10px; font-weight:700; flex:1; background:${isPaymentPending ? '#f59e0b' : 'var(--accent-primary)'}; color:#000;">
                        ${isPaymentPending ? '🟡 Table 1 Service & Payment Pending →' : `🧾 Table ${s.tableNumber} Service & Bill →`}
                      </button>
                    `}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="card" style="background:var(--bg-surface-1); padding:60px 20px; text-align:center; border-radius:8px;">
            <div style="font-size:3rem; margin-bottom:10px;">🛎️</div>
            <h3 style="font-size:1.3rem; margin:0 0 6px;">No Active Tables Assigned</h3>
            <p style="color:var(--text-muted); font-size:0.85rem; max-width:400px; margin:0 auto;">
              You currently have no active dining sessions. Tap the button below to view the floor map and seat incoming guests.
            </p>
            <button class="btn-primary" id="btn-empty-tables-go-floor" style="margin-top:16px; padding:10px 20px; font-weight:700;">
              🗺️ Open Live Floor Map
            </button>
          </div>
        `}
      </div>
    `;

    const btnGoFloor = mount.querySelector('#btn-mytables-go-floor');
    if (btnGoFloor) {
      btnGoFloor.addEventListener('click', () => {
        this.activeSubView = 'floor';
        this.updateWorkspaceShell(waiterName, waiterId, tenantId, session);
      });
    }

    const btnEmptyGoFloor = mount.querySelector('#btn-empty-tables-go-floor');
    if (btnEmptyGoFloor) {
      btnEmptyGoFloor.addEventListener('click', () => {
        this.activeSubView = 'floor';
        this.updateWorkspaceShell(waiterName, waiterId, tenantId, session);
      });
    }

    mount.querySelectorAll('.btn-open-table-service').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.sessionId;
        this.openTableServiceConsole(mount, sid, waiterName, waiterId, tenantId, session);
      });
    });

    mount.querySelectorAll('.btn-close-settled-table').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.sessionId;
        const tnum = btn.dataset.table;
        sessionStateMachine.transitionMilestone(sid, SessionMilestones.CLOSED);
        tableStateMachine.transitionTableState(tnum, PhysicalTableStates.CLEANING);
        alert(`✨ Session closed for Table ${tnum}! Table moved to NEEDS CLEANING.`);
        this.mountActiveSubView(waiterName, waiterId, tenantId, session);
      });
    });
  }

  openTableServiceConsole(mount, sessionId, waiterName, waiterId, tenantId, session) {
    mount.innerHTML = '';
    const activeView = new ActiveSessionView({
      sessionId,
      onClose: () => {
        this.mountActiveSubView(waiterName, waiterId, tenantId, session);
      }
    });
    mount.appendChild(activeView.render());
  }
}
