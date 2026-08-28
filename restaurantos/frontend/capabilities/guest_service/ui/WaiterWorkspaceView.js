/**
 * Capability Group 3 & 4 — Waiter Operational Workspace Composition Root
 * Dedicated, touch-first workspace for Waiters & Floor Service Staff (PD-008 & PD-010).
 * Features:
 * - Default landing view: 🪑 Live Floor & Tables (zero admin/kitchen clutter).
 * - Real-time Kitchen Ready Alert ticker listening to KDS ticket status changes.
 * - Table-First Navigation: Floor & Tables, Service & Pickup, My Active Tables, POS Menu, Timesheet.
 * - Every service item resolves directly to its Table Session (ActiveSessionView).
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

  getReadyTablesCount(tenantId) {
    const readyItems = this.getReadyItems(tenantId);
    const tableSet = new Set(readyItems.map(i => i.tableNumber || i.tableCode));
    return tableSet.size;
  }

  getMyActiveSessions(waiterId, tenantId) {
    const allSessions = sessionModel.getAllSessions(tenantId) || [];
    return allSessions.filter(s => s.status !== 'CLOSED');
  }

  updateWorkspaceShell(waiterName, waiterId, tenantId, session) {
    const readyItems = this.getReadyItems(tenantId);
    const readyTablesCount = this.getReadyTablesCount(tenantId);
    const mySessions = this.getMyActiveSessions(waiterId, tenantId);

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
            ${this.renderHeaderBadgesHTML(readyItems, mySessions, readyTablesCount)}
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
                <span>🪑</span> Floor & Tables
              </button>

              <button class="nav-item waiter-nav-btn ${this.activeSubView === 'service' ? 'active' : ''}" data-view="service" style="display:flex; align-items:center; justify-content:space-between; width:100%; text-align:left; padding:10px 14px; border-radius:6px; font-weight:600; font-size:0.9rem; cursor:pointer;">
                <span style="display:flex; align-items:center; gap:10px;"><span>🛎️</span> Service & Pickup</span>
                ${readyTablesCount > 0 ? `
                  <span class="badge" style="background:#10b981; color:#fff; font-size:0.7rem; padding:2px 6px; font-weight:800; animation:pulse 1.5s infinite;">${readyTablesCount} TABLES</span>
                ` : `
                  <span class="badge badge-secondary" style="font-size:0.7rem; padding:2px 6px;">0</span>
                `}
              </button>

              <button class="nav-item waiter-nav-btn ${this.activeSubView === 'my_tables' ? 'active' : ''}" data-view="my_tables" style="display:flex; align-items:center; justify-content:space-between; width:100%; text-align:left; padding:10px 14px; border-radius:6px; font-weight:600; font-size:0.9rem; cursor:pointer;">
                <span style="display:flex; align-items:center; gap:10px;"><span>🛎️</span> My Active Tables</span>
                <span class="badge badge-info" style="font-size:0.7rem; padding:2px 6px;">${mySessions.length}</span>
              </button>

              <button class="nav-item waiter-nav-btn ${this.activeSubView === 'menu' ? 'active' : ''}" data-view="menu" style="display:flex; align-items:center; gap:10px; width:100%; text-align:left; padding:10px 14px; border-radius:6px; font-weight:600; font-size:0.9rem; cursor:pointer;">
                <span>🍽️</span> POS Menu & Prices
              </button>

              <button class="nav-item waiter-nav-btn ${this.activeSubView === 'attendance' ? 'active' : ''}" data-view="attendance" style="display:flex; align-items:center; gap:10px; width:100%; text-align:left; padding:10px 14px; border-radius:6px; font-weight:600; font-size:0.9rem; cursor:pointer;">
                <span>🕐</span> My Shift & Timesheet
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

  renderHeaderBadgesHTML(readyItems, mySessions, readyTablesCount) {
    return `
      ${readyTablesCount > 0 ? `
        <div class="card animate-fade-in" style="background:#10b98122; border:1px solid #10b981; padding:6px 12px; border-radius:6px; display:flex; align-items:center; gap:8px; cursor:pointer;" id="btn-ready-alert">
          <span style="font-size:1.1rem; animation:pulse 1.5s infinite;">🔔</span>
          <span style="color:#10b981; font-weight:700; font-size:0.85rem;">
            ${readyTablesCount} Table${readyTablesCount !== 1 ? 's' : ''} READY for Service Pickup! (${readyItems.length} Dishes)
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
    const readyTablesCount = this.getReadyTablesCount(tenantId);
    const mySessions = this.getMyActiveSessions(waiterId, tenantId);
    badgesEl.innerHTML = this.renderHeaderBadgesHTML(readyItems, mySessions, readyTablesCount);

    const alertBtn = badgesEl.querySelector('#btn-ready-alert');
    if (alertBtn) {
      alertBtn.addEventListener('click', () => {
        this.activeSubView = 'service';
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
        this.activeSubView = 'service';
        this.updateWorkspaceShell(waiterName, waiterId, tenantId, session);
      });
    }
  }

  mountActiveSubView(waiterName, waiterId, tenantId, session) {
    const mount = this.rootMount.querySelector('#waiter-content-mount');
    if (!mount) return;
    mount.innerHTML = '';

    if (this.selectedTableSessionId) {
      const activeSessionView = new ActiveSessionView({
        sessionId: this.selectedTableSessionId,
        onClose: () => {
          this.selectedTableSessionId = null;
          this.mountActiveSubView(waiterName, waiterId, tenantId, session);
        }
      });
      mount.appendChild(activeSessionView.render());
      return;
    }

    if (this.activeSubView === 'floor') {
      const floorView = new FloorViewerView();
      mount.appendChild(floorView.render());
    } else if (this.activeSubView === 'service') {
      this.renderServiceQueueView(mount, waiterName, waiterId, tenantId, session);
    } else if (this.activeSubView === 'my_tables') {
      this.renderMyTablesView(mount, waiterName, waiterId, tenantId, session);
    } else if (this.activeSubView === 'menu') {
      this.renderPosMenuView(mount, waiterName, waiterId, tenantId, session);
    } else if (this.activeSubView === 'attendance') {
      const attView = new AttendanceView();
      mount.appendChild(attView.render());
    }
  }

  renderServiceQueueView(mount, waiterName, waiterId, tenantId, session) {
    mount.innerHTML = `
      <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h2 style="font-size:1.75rem; margin:0;">🛎️ Service & Table Pickup Queue</h2>
            <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
              Table-centric service queue detailing ready dishes, in-prep status, and service delay alerts.
            </p>
          </div>
          <button class="btn-primary" id="btn-service-go-floor" style="padding:10px 18px; font-weight:700;">
            🪑 Open Floor Map
          </button>
        </div>

        <div id="service-queue-widget-mount"></div>
      </div>
    `;

    const widgetMount = mount.querySelector('#service-queue-widget-mount');
    if (widgetMount) {
      const widget = new ActiveOrdersWidget({
        title: 'Table Service Queue'
      });
      widgetMount.appendChild(widget.render());
    }

    const goFloorBtn = mount.querySelector('#btn-service-go-floor');
    if (goFloorBtn) {
      goFloorBtn.addEventListener('click', () => {
        this.activeSubView = 'floor';
        this.updateWorkspaceShell(waiterName, waiterId, tenantId, session);
      });
    }
  }

  renderMyTablesView(mount, waiterName, waiterId, tenantId, session) {
    const mySessions = this.getMyActiveSessions(waiterId, tenantId);

    mount.innerHTML = `
      <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h2 style="font-size:1.75rem; margin:0;">🛎️ My Active Dining Tables</h2>
            <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
              Active table sessions assigned to <strong>${waiterName}</strong>. Click any table card to inspect order & live kitchen status.
            </p>
          </div>
          <button class="btn-primary" id="btn-mytables-go-floor" style="padding:10px 18px; font-weight:700;">
            🪑 Open Floor Map
          </button>
        </div>

        ${mySessions.length === 0 ? `
          <div class="card" style="padding:60px 20px; text-align:center; background:var(--bg-surface-1); border-radius:8px;">
            <div style="font-size:3rem; margin-bottom:10px;">🍽️</div>
            <h3 style="margin:0 0 6px;">No Active Tables Assigned</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; max-width:460px; margin:0 auto 16px;">
              You currently have no open table sessions assigned to your shift. Select an available table from the Floor Map to seat guests.
            </p>
            <button class="btn-primary" id="btn-mytables-open-floor" style="padding:10px 18px; font-weight:700;">
              🪑 Go to Floor Map
            </button>
          </div>
        ` : `
          <div class="grid grid-cols-3 gap-md">
            ${mySessions.map(s => {
              const proj = sessionProjectionService.getSessionProjection(s.id, tenantId);
              const readyCount = proj ? proj.readyItems.length : 0;
              const prepCount = proj ? proj.preparingItems.length : 0;
              const statusBadgeClass = s.status === 'PAYMENT_PENDING' ? 'badge-warning' : (readyCount > 0 ? 'badge-success' : 'badge-info');

              return `
                <div class="card btn-open-waiter-session" data-session-id="${s.id}" style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); padding:16px; border-radius:8px; cursor:pointer; transition:transform 0.15s ease;" title="Click to open Table ${s.tableNumber} console">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div style="font-size:1.15rem; font-weight:800; color:var(--text-main);">
                      🍽️ Table ${s.tableNumber}
                    </div>
                    <span class="badge ${statusBadgeClass}" style="font-size:0.7rem; font-weight:800;">
                      ${readyCount > 0 ? `🟢 ${readyCount} READY` : s.status}
                    </span>
                  </div>

                  <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:12px;">
                    <div>👥 Guests: <strong>${s.guestCount || 2}</strong></div>
                    <div>📦 Confirmed Items: <strong>${proj ? proj.itemizedList.length : 0}</strong></div>
                    ${readyCount > 0 ? `
                      <div style="color:#10b981; font-weight:700; margin-top:4px;">
                        🔔 ${readyCount} Item(s) READY for service!
                      </div>
                    ` : (prepCount > 0 ? `
                      <div style="color:#f59e0b; font-weight:600; margin-top:4px;">
                        🔥 ${prepCount} Item(s) preparing in kitchen
                      </div>
                    ` : '')}
                  </div>

                  <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-subtle); padding-top:10px;">
                    <div style="font-size:0.95rem; font-weight:800; color:var(--accent-primary);">
                      ₹${proj ? (proj.grandTotal || proj.subtotal || 0).toFixed(2) : '0.00'}
                    </div>
                    <button class="btn-secondary" style="padding:4px 10px; font-size:0.75rem; font-weight:700;">
                      Open Session →
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    const goFloorBtn = mount.querySelector('#btn-mytables-go-floor');
    if (goFloorBtn) {
      goFloorBtn.addEventListener('click', () => {
        this.activeSubView = 'floor';
        this.updateWorkspaceShell(waiterName, waiterId, tenantId, session);
      });
    }

    const openFloorBtn = mount.querySelector('#btn-mytables-open-floor');
    if (openFloorBtn) {
      openFloorBtn.addEventListener('click', () => {
        this.activeSubView = 'floor';
        this.updateWorkspaceShell(waiterName, waiterId, tenantId, session);
      });
    }

    mount.querySelectorAll('.btn-open-waiter-session').forEach(card => {
      card.addEventListener('click', () => {
        this.selectedTableSessionId = card.dataset.sessionId;
        this.mountActiveSubView(waiterName, waiterId, tenantId, session);
      });
    });
  }

  renderPosMenuView(mount, waiterName, waiterId, tenantId, session) {
    mount.innerHTML = `
      <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h2 style="font-size:1.75rem; margin:0;">🍽️ POS Menu & Price Catalog</h2>
            <p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">
              Inspect active menu items, live prices, recipes, and 86 availability status.
            </p>
          </div>
          <button class="btn-primary" id="btn-menu-go-floor" style="padding:10px 18px; font-weight:700;">
            🪑 Open Floor Map
          </button>
        </div>

        <div id="waiter-pos-menu-mount"></div>
      </div>
    `;

    const menuMount = mount.querySelector('#waiter-pos-menu-mount');
    if (menuMount) {
      const browser = new MenuBrowserView({
        isWaiterView: true,
        onSelectItem: (item) => {
          alert(`ℹ️ Item "${item.itemName || item.name}" (Price: ₹${item.price}) - Select an active table from the Floor Map to place guest orders.`);
        }
      });
      menuMount.appendChild(browser.render());
    }

    const goFloorBtn = mount.querySelector('#btn-menu-go-floor');
    if (goFloorBtn) {
      goFloorBtn.addEventListener('click', () => {
        this.activeSubView = 'floor';
        this.updateWorkspaceShell(waiterName, waiterId, tenantId, session);
      });
    }
  }
}
