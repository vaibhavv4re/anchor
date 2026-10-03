/**
 * RestaurantOS - Manager Operational Workspace Shell (Manager Cockpit revamp)
 *
 * Zone-based navigation (Floor / Kitchen & Bar / Money / People / Shift) around what
 * a real restaurant manager watches on a shift. This shell is the SINGLE owner of the
 * live subscription: it subscribes once to the platform event bus (which the Supabase
 * realtime layer + refreshForWorkspace feed via 'data:changed') and calls refresh() on
 * whichever view is currently mounted. Switching screens destroys the previous view so
 * listeners never leak (the old flat workspace mounted a fresh, never-unsubscribed view
 * on every nav click).
 *
 * Observer & Controller model - aggregates live operational state, ZERO parallel state.
 */

import { ManagerFloorView } from './ManagerFloorView.js';
import { ServiceOpsView } from './ServiceOpsView.js';
import { ManagerProductionView } from './ManagerProductionView.js';
import { ManagerStockView } from './ManagerStockView.js';
import { SalesCashierView } from './SalesCashierView.js';
import { ManagerVoidsCompsView } from './ManagerVoidsCompsView.js';
import { ReportsDaySummaryView } from './ReportsDaySummaryView.js';
import { StaffShiftView } from './StaffShiftView.js';
import { ExceptionsView } from './ExceptionsView.js';
import { MyShiftView } from './MyShiftView.js';
import { managerProjectionService } from '../../../../../businessos/platform/manager/managerProjectionService.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

// Cloud-first collections the manager cockpit reads. All six are in the realtime
// publication, so a fresh tab hydrates from Supabase on entry and then live-updates.
const MANAGER_COLLECTIONS = ['table_sessions', 'orders', 'bill_revisions', 'invoices', 'payments', 'stock_balances'];

const ZONES = [
  { id: 'floor', icon: '🪑', label: 'Floor', screens: [
    { id: 'floor', icon: '🪑', label: 'Floor & Tables' }
  ] },
  { id: 'kitchen', icon: '🍳', label: 'Kitchen & Bar', screens: [
    { id: 'service_ops', icon: '🍽️', label: 'Service Pipeline' },
    { id: 'production', icon: '🔪', label: 'Prep & Production' },
    { id: 'stock', icon: '📦', label: 'Stock & 86s' }
  ] },
  { id: 'money', icon: '💰', label: 'Money', screens: [
    { id: 'sales_cashier', icon: '💳', label: 'Sales & Cashier' },
    { id: 'voids_comps', icon: '✂️', label: 'Discounts, Voids & Comps' },
    { id: 'reports', icon: '📈', label: 'Reports & Day Summary' }
  ] },
  { id: 'people', icon: '👥', label: 'People', screens: [
    { id: 'staff_shift', icon: '🧑‍🍳', label: 'Staff on Shift' },
    { id: 'exceptions', icon: '⚠️', label: 'Approvals & Exceptions', badge: true }
  ] },
  { id: 'shift', icon: '🕐', label: 'Shift', screens: [
    { id: 'my_shift', icon: '🕐', label: 'My Shift & Handover' }
  ] }
];

export class ManagerWorkspaceView {
  constructor(deps = {}) {
    this.repositories = deps.repositories || null;
    this.dataGateway = deps.dataGateway || null;
    this.authEngine = deps.authEngine || null;
    this.platformEventBus = deps.platformEventBus || platformEventBus;

    this.activeSubView = 'floor';
    this.openZones = new Set(ZONES.map(z => z.id));
    this.container = null;
    this.activeView = null;
    this.unsubscribeEvents = [];
    this._subscribed = false;
    this._refreshQueued = false;
  }

  _tenantId() {
    return this.session ? (this.session.tenantId || null) : null;
  }

  async render(mountPoint, session) {
    this.container = mountPoint;
    this.session = session;

    this.container.innerHTML = `
      <div class="app-layout-body">
        <aside class="app-sidebar flex-col gap-sm" id="manager-sidebar" style="width:260px; min-width:260px; background:var(--bg-surface-1); border-right:1px solid var(--border-subtle); padding:var(--space-md); overflow-y:auto;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:6px; padding-left:8px;">
            👔 MANAGER COCKPIT
          </div>
          ${this.renderSidebarNav()}
        </aside>

        <main class="app-main" id="manager-workspace-mount" style="flex:1; padding:var(--space-md); overflow-y:auto;"></main>
      </div>

      <style>
        .mgr-zone-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          text-align: left;
          padding: 8px 10px;
          margin-top: 8px;
          border-radius: var(--radius-sm);
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          color: var(--text-muted);
          background: transparent;
          border: none;
          cursor: pointer;
        }
        .mgr-zone-header:hover { color: var(--accent-primary); }
        .mgr-zone-screens { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
        .mgr-zone-screens.collapsed { display: none; }
        .nav-item {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          text-align: left;
          padding: 9px 12px 9px 20px;
          border-radius: var(--radius-sm);
          font-size: var(--font-size-sm);
          color: var(--text-secondary);
          background: transparent;
          border: none;
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .nav-item:hover, .nav-item.active {
          background-color: var(--bg-surface-2);
          color: var(--accent-primary);
          font-weight: 600;
        }
      </style>
    `;

    this.bindSidebarEvents();

    // Centralized live subscription (owned solely by this shell).
    this.subscribeRealtimeEvents();

    // Cloud-first: hydrate from Supabase on entry so a fresh tab/board sees the
    // live floor, orders and money state without waiting for the next boot poll.
    this.refreshCloud();

    this.updateSidebarExceptionBadge();
    this.mountActiveSubView();

    return this.container;
  }

  renderSidebarNav() {
    return ZONES.map(zone => {
      const isOpen = this.openZones.has(zone.id);
      const screensHtml = zone.screens.map(screen => {
        const isActive = this.activeSubView === screen.id;
        const badge = screen.badge
          ? `<span id="sidebar-exp-badge" class="badge" style="background:#10b98122; color:#10b981; border:1px solid #10b981; font-size:0.7rem; padding:2px 6px;">0</span>`
          : '';
        return `
          <button class="nav-item ${isActive ? 'active' : ''}" data-view="${screen.id}">
            <span>${screen.icon} ${screen.label}</span>
            ${badge}
          </button>`;
      }).join('');

      return `
        <button class="mgr-zone-header" data-zone="${zone.id}">
          <span>${zone.icon} ${zone.label}</span>
          <span class="mgr-zone-caret">${isOpen ? '▾' : '▸'}</span>
        </button>
        <div class="mgr-zone-screens ${isOpen ? '' : 'collapsed'}" data-zone-screens="${zone.id}">
          ${screensHtml}
        </div>`;
    }).join('');
  }

  bindSidebarEvents() {
    if (!this.container) return;

    // Zone collapse/expand toggles.
    this.container.querySelectorAll('.mgr-zone-header').forEach(header => {
      header.addEventListener('click', (e) => {
        const zoneId = e.currentTarget.dataset.zone;
        if (this.openZones.has(zoneId)) this.openZones.delete(zoneId);
        else this.openZones.add(zoneId);
        const screensWrap = this.container.querySelector(`[data-zone-screens="${zoneId}"]`);
        const caret = e.currentTarget.querySelector('.mgr-zone-caret');
        const open = this.openZones.has(zoneId);
        if (screensWrap) screensWrap.classList.toggle('collapsed', !open);
        if (caret) caret.textContent = open ? '▾' : '▸';
      });
    });

    // Screen navigation.
    this.container.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        if (!view || view === this.activeSubView) return;
        this.container.querySelectorAll('.nav-item').forEach(ni => ni.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.activeSubView = view;
        // Ensure the containing zone is expanded.
        const zone = ZONES.find(z => z.screens.some(s => s.id === view));
        if (zone && !this.openZones.has(zone.id)) {
          this.openZones.add(zone.id);
          const wrap = this.container.querySelector(`[data-zone-screens="${zone.id}"]`);
          if (wrap) wrap.classList.remove('collapsed');
        }
        this.mountActiveSubView();
      });
    });
  }

  subscribeRealtimeEvents() {
    if (this._subscribed) return;

    const onLiveChange = () => {
      this.updateSidebarExceptionBadge();
      if (this._refreshQueued) return;
      this._refreshQueued = true;
      // Coalesce bursts of events into a single repaint per frame.
      const run = () => {
        this._refreshQueued = false;
        if (this.activeView && typeof this.activeView.refresh === 'function') {
          this.activeView.refresh();
        }
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
      else setTimeout(run, 0);
    };

    const EVENTS = [
      'data:changed',
      'session:created', 'session:milestone:changed', 'session:projection:updated',
      'table:state:changed', 'table:projection:updated',
      'order:confirmed', 'order:item:voided',
      'ticket:status_changed', 'ticket:item_status_changed', 'kot:dispatched', 'bot:dispatched',
      'bill:finalized', 'bill:settled', 'bill:reopened', 'bill:recalled', 'bill:revision:created',
      'payment:recorded', 'invoice:issued',
      'discount:approved', 'discount:rejected',
      'exception:resolved', 'exception:acknowledged', 'reconciliation:exception:flagged',
      'stock:balance:updated', 'shift:register:updated', 'shift:handover_completed'
    ];

    this.unsubscribeEvents = EVENTS.map(evt => this.platformEventBus.subscribe(evt, onLiveChange));
    this._subscribed = true;
  }

  refreshCloud() {
    if (this.dataGateway && typeof this.dataGateway.refreshForWorkspace === 'function') {
      this.dataGateway.refreshForWorkspace('manager', MANAGER_COLLECTIONS, this._tenantId());
    }
  }

  updateSidebarExceptionBadge() {
    const badgeEl = this.container && this.container.querySelector('#sidebar-exp-badge');
    if (!badgeEl) return;

    const data = managerProjectionService.getOperationalProjection(this._tenantId());
    const count = data.needsAttentionQueue ? data.needsAttentionQueue.length : 0;

    badgeEl.textContent = count;
    if (count > 0) {
      badgeEl.style.background = '#ef444422';
      badgeEl.style.borderColor = '#ef4444';
      badgeEl.style.color = '#ef4444';
    } else {
      badgeEl.style.background = '#10b98122';
      badgeEl.style.borderColor = '#10b981';
      badgeEl.style.color = '#10b981';
    }
  }

  _makeView(screenId) {
    const tenantId = this._tenantId();
    const deps = { tenantId, dataGateway: this.dataGateway, authEngine: this.authEngine, platformEventBus: this.platformEventBus, session: this.session };
    switch (screenId) {
      case 'floor': return new ManagerFloorView(deps);
      case 'service_ops': return new ServiceOpsView(deps);
      case 'production': return new ManagerProductionView(deps);
      case 'stock': return new ManagerStockView(deps);
      case 'sales_cashier': return new SalesCashierView(deps);
      case 'voids_comps': return new ManagerVoidsCompsView(deps);
      case 'reports': return new ReportsDaySummaryView(deps);
      case 'staff_shift': return new StaffShiftView(deps);
      case 'exceptions': return new ExceptionsView(deps);
      case 'my_shift': return new MyShiftView(deps);
      default: return new ManagerFloorView(deps);
    }
  }

  mountActiveSubView() {
    const mount = this.container && this.container.querySelector('#manager-workspace-mount');
    if (!mount) return;

    // Tear the previous view down before swapping so nothing leaks.
    if (this.activeView && typeof this.activeView.destroy === 'function') {
      try { this.activeView.destroy(); } catch (_) {}
    }

    mount.innerHTML = '';

    const view = this._makeView(this.activeSubView);
    const node = view.render();
    if (node) mount.appendChild(node);
    this.activeView = view;

    // Zone entry may need fresh cloud rows (e.g. switching to Money pulls invoices).
    this.refreshCloud();
  }

  /** Called by the app when the workspace is torn down / navigated away. */
  destroy() {
    if (this.activeView && typeof this.activeView.destroy === 'function') {
      try { this.activeView.destroy(); } catch (_) {}
    }
    this.activeView = null;
    this.unsubscribeEvents.forEach(u => { if (typeof u === 'function') u(); });
    this.unsubscribeEvents = [];
    this._subscribed = false;
  }
}
