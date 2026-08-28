/**
 * RestaurantOS - Manager Operational Workspace Shell (PD-017 / Manager Cockpit)
 * Primary Navigation Cockpit for Restaurant Operations Manager.
 * Observer & Controller model — aggregates live operational state without parallel store duplicate state.
 */

import { OperationsOverviewView } from './OperationsOverviewView.js';
import { ManagerFloorView } from './ManagerFloorView.js';
import { ExceptionsView } from './ExceptionsView.js';
import { ServiceOpsView } from './ServiceOpsView.js';
import { SalesCashierView } from './SalesCashierView.js';
import { StaffShiftView } from './StaffShiftView.js';
import { ReportsDaySummaryView } from './ReportsDaySummaryView.js';
import { MyShiftView } from './MyShiftView.js';
import { managerProjectionService } from '../../../../../businessos/platform/manager/managerProjectionService.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

export class ManagerWorkspaceView {
  constructor(deps = {}) {
    this.repositories = deps.repositories || null;
    this.dataGateway = deps.dataGateway || null;
    this.authEngine = deps.authEngine || null;
    this.platformEventBus = deps.platformEventBus || platformEventBus;

    this.activeSubView = 'operations_overview';
    this.container = null;
  }

  async render(mountPoint, session) {
    this.container = mountPoint;
    this.session = session;

    this.container.innerHTML = `
      <div class="app-layout-body">
        <aside class="app-sidebar flex-col gap-sm" style="width:260px; min-width:260px; background:var(--bg-surface-1); border-right:1px solid var(--border-subtle); padding:var(--space-md);">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:6px; padding-left:8px;">
            👔 MANAGER COCKPIT
          </div>
          
          <button class="nav-item ${this.activeSubView === 'operations_overview' ? 'active' : ''}" data-view="operations_overview">
            📊 Operations Overview
          </button>
          
          <button class="nav-item ${this.activeSubView === 'floor' ? 'active' : ''}" data-view="floor">
            🪑 Floor & Tables
          </button>
          
          <button class="nav-item ${this.activeSubView === 'service_ops' ? 'active' : ''}" data-view="service_ops">
            🍽️ Service Operations
          </button>
          
          <button class="nav-item ${this.activeSubView === 'sales_cashier' ? 'active' : ''}" data-view="sales_cashier">
            💰 Sales & Cashier
          </button>
          
          <button class="nav-item ${this.activeSubView === 'staff_shift' ? 'active' : ''}" data-view="staff_shift">
            👥 Staff & Shift
          </button>
          
          <button class="nav-item ${this.activeSubView === 'exceptions' ? 'active' : ''}" data-view="exceptions" style="display:flex; justify-content:space-between; align-items:center;">
            <span>⚠️ Exceptions & Approvals</span>
            <span id="sidebar-exp-badge" class="badge" style="background:#ef444422; color:#ef4444; border:1px solid #ef4444; font-size:0.7rem; padding:2px 6px;">0</span>
          </button>
          
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-top:16px; margin-bottom:6px; padding-left:8px;">
            📈 ANALYTICS & SHIFT
          </div>
          
          <button class="nav-item ${this.activeSubView === 'reports' ? 'active' : ''}" data-view="reports">
            📈 Reports & Day Summary
          </button>
          
          <button class="nav-item ${this.activeSubView === 'my_shift' ? 'active' : ''}" data-view="my_shift">
            🕐 My Shift
          </button>
        </aside>

        <main class="app-main" id="manager-workspace-mount" style="flex:1; padding:var(--space-md); overflow-y:auto;"></main>
      </div>

      <style>
        .nav-item {
          width: 100%;
          text-align: left;
          padding: 10px 12px;
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
    this.updateSidebarExceptionBadge();
    this.mountActiveSubView();
  }

  bindSidebarEvents() {
    if (!this.container) return;
    const navItems = this.container.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        if (view) {
          this.activeSubView = view;
          navItems.forEach(ni => ni.classList.remove('active'));
          e.currentTarget.classList.add('active');
          this.mountActiveSubView();
        }
      });
    });

    // Subscribe to platform events to keep sidebar badge count updated
    const refreshBadge = () => this.updateSidebarExceptionBadge();
    this.platformEventBus.subscribe('session:milestone:changed', refreshBadge);
    this.platformEventBus.subscribe('ticket:status_changed', refreshBadge);
    this.platformEventBus.subscribe('bill:reopened', refreshBadge);
  }

  updateSidebarExceptionBadge() {
    const badgeEl = this.container.querySelector('#sidebar-exp-badge');
    if (!badgeEl) return;

    const data = managerProjectionService.getOperationalProjection(this.session ? this.session.tenantId : null);
    const count = data.needsAttentionQueue ? data.needsAttentionQueue.length : 0;

    badgeEl.textContent = count;
    if (count > 0) {
      badgeEl.style.display = 'inline-block';
      badgeEl.style.background = '#ef444422';
      badgeEl.style.borderColor = '#ef4444';
      badgeEl.style.color = '#ef4444';
    } else {
      badgeEl.style.background = '#10b98122';
      badgeEl.style.borderColor = '#10b981';
      badgeEl.style.color = '#10b981';
    }
  }

  mountActiveSubView() {
    const mount = this.container.querySelector('#manager-workspace-mount');
    if (!mount) return;

    mount.innerHTML = '';

    if (this.activeSubView === 'operations_overview') {
      const overview = new OperationsOverviewView({ tenantId: this.session ? this.session.tenantId : null });
      mount.appendChild(overview.render());
    } else if (this.activeSubView === 'floor') {
      const floorView = new ManagerFloorView({ tenantId: this.session ? this.session.tenantId : null });
      mount.appendChild(floorView.render());
    } else if (this.activeSubView === 'exceptions') {
      const exceptionsView = new ExceptionsView({ tenantId: this.session ? this.session.tenantId : null });
      mount.appendChild(exceptionsView.render());
    } else if (this.activeSubView === 'service_ops') {
      const serviceOpsView = new ServiceOpsView({ tenantId: this.session ? this.session.tenantId : null });
      mount.appendChild(serviceOpsView.render());
    } else if (this.activeSubView === 'sales_cashier') {
      const salesCashierView = new SalesCashierView({ tenantId: this.session ? this.session.tenantId : null });
      mount.appendChild(salesCashierView.render());
    } else if (this.activeSubView === 'staff_shift') {
      const staffShiftView = new StaffShiftView({ tenantId: this.session ? this.session.tenantId : null });
      mount.appendChild(staffShiftView.render());
    } else if (this.activeSubView === 'reports') {
      const reportsView = new ReportsDaySummaryView({ tenantId: this.session ? this.session.tenantId : null });
      mount.appendChild(reportsView.render());
    } else if (this.activeSubView === 'my_shift') {
      const myShiftView = new MyShiftView({ tenantId: this.session ? this.session.tenantId : null });
      mount.appendChild(myShiftView.render());
    } else {
      // Phase M2-M8 Placeholder Views
      const viewNames = {
        service_ops: '🍽️ Service Operations (Phase M4)',
        sales_cashier: '💰 Sales & Cashier (Phase M5)',
        staff_shift: '👥 Staff & Shift (Phase M6)',
        exceptions: '⚠️ Exceptions & Approvals (Phase M3)',
        reports: '📈 Reports & Day Summary (Phase M7)',
        my_shift: '🕐 My Shift (Phase M8)'
      };

      mount.innerHTML = `
        <div class="card" style="padding:var(--space-xl); text-align:center; background:var(--bg-surface-1);">
          <h3 style="margin-top:0;">${viewNames[this.activeSubView] || 'Manager Subview'}</h3>
          <p style="color:var(--text-muted); font-size:0.875rem;">
            This subview is part of the phased Manager Operational Cockpit rollout.<br>
            All operational metrics are active and projecting live on the <strong>📊 Operations Overview</strong> landing cockpit.
          </p>
          <button class="btn-primary" id="btn-back-to-overview" style="margin-top:12px;">← Back to Operations Overview</button>
        </div>
      `;

      const backBtn = mount.querySelector('#btn-back-to-overview');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          this.activeSubView = 'operations_overview';
          const navItems = this.container.querySelectorAll('.nav-item');
          navItems.forEach(ni => {
            if (ni.dataset.view === 'operations_overview') ni.classList.add('active');
            else ni.classList.remove('active');
          });
          this.mountActiveSubView();
        });
      }
    }
  }
}
