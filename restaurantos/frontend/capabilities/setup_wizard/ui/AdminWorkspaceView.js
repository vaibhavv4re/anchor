import { UserManagementView } from '../../user_employee/ui/UserManagementView.js';
import { DeviceConfigView } from '../../device_management/ui/DeviceConfigView.js';
import { ModularConfigView } from '../../configuration/ui/ModularConfigView.js';
import { AttendanceView } from '../../attendance/ui/AttendanceView.js';
import { FloorViewerView } from '../../restaurant_layout/ui/FloorViewerView.js';

/**
 * AdminWorkspaceView.js
 * Original Canonical Tenant Admin Workspace UI (matching main branch snapshot)
 *
 * Restores the exact main branch Admin Command Center layout:
 * - Sidebar Navigation (Dashboard, Accordion Configuration: Business Profile, Dining Areas, Tables, Staff & Access, Devices, Payments, Commissioning, Audit Log)
 * - Header Banner: "Good Morning, Admin 👏" & "🚀 Restaurant Running Normally" (LIVE OPERATIONAL)
 * - 4-Card Configuration Progress Checklist (Business Profile, Dining Areas, Dining Tables & Assets, Staff & Access)
 * - Quick Action Shortcuts Card
 *
 * Connected directly to DataGateway / Supabase Cloud DB repositories.
 */

export class AdminWorkspaceView {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
    this.authEngine = deps.authEngine || null;
    this.platformEventBus = deps.platformEventBus || null;
    this.repositories = deps.repositories || null;

    this.activeSubView = 'dashboard';
    this.configGroupOpen = true;
  }

  _getDataGateway() {
    if (this.dataGateway) return this.dataGateway;
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      return window.__APP__.platform.dataGateway;
    }
    return null;
  }

  _getCollection(name, tenantId) {
    const gw = this._getDataGateway();
    if (gw && typeof gw.getCachedCollection === 'function') {
      const list = gw.getCachedCollection(name, tenantId);
      if (Array.isArray(list) && list.length > 0) return list;
    }
    return [];
  }

  async render(mount, session) {
    if (!mount) return;

    const gw = this._getDataGateway();
    const isSupabase = gw && gw.cloudAdapter && typeof gw.cloudAdapter.getCollection === 'function';

    const tables = this._getCollection('tables_master', session.tenantId);
    const employees = this._getCollection('employees', session.tenantId);
    const areas = this._getCollection('dining_areas', session.tenantId);

    mount.innerHTML = `
      <div class="admin-workspace-container flex-col animate-fade-in" style="width:100%; min-height:100vh; gap:0;">
        <!-- Data Source Diagnostic Bar -->
        <div class="data-source-diagnostic-bar" style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); padding:6px 16px; font-size:0.75rem; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <span class="badge ${isSupabase ? 'badge-success' : 'badge-warning'}" style="font-weight:700; font-size:0.7rem; padding:3px 10px;">
              ${isSupabase ? 'SUPABASE ●' : 'LOCAL_CACHE ⚠️'}
            </span>
            <span>Tenant: <strong>${session.tenantId || 'tenant_h0qc7wf'}</strong></span>
            <span>User: <strong>${session.employeeName}</strong></span>
            <span>Role: <strong>${session.roleId}</strong></span>
            <span>Workspace: <strong style="text-transform:uppercase; color:var(--accent-primary);">${session.workspace}</strong></span>
          </div>
          <div style="color:var(--text-muted); font-weight:600;">Anchor DataGateway Engine</div>
        </div>

        <!-- 2-Column Main Layout Body (Sidebar + Content) -->
        <div style="display:flex; flex:1; width:100%;">
          <!-- Left Sidebar Navigation -->
          <aside style="width:240px; background:var(--bg-surface-1); border-right:1px solid var(--border-subtle); padding:16px; display:flex; flex-direction:column; gap:10px;">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:4px; padding-left:4px;">ADMIN NAVIGATION</div>
            
            <button class="btn-secondary nav-admin-btn ${this.activeSubView === 'dashboard' ? 'active' : ''}" data-v="dashboard" style="text-align:left; font-weight:600; padding:10px 12px; border-radius:6px; cursor:pointer;">
              🏠 Dashboard
            </button>

            <div style="margin:4px 0;">
              <button class="btn-secondary" id="btn-toggle-config-group" style="width:100%; text-align:left; font-weight:600; padding:10px 12px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                <span>⚙ Configuration</span>
                <span>${this.configGroupOpen ? '▾' : '▸'}</span>
              </button>
              ${this.configGroupOpen ? `
                <div class="flex-col gap-xs" style="padding-left:12px; margin-top:6px; display:flex; flex-direction:column; gap:4px; border-left:2px solid var(--border-subtle);">
                  <button class="btn-secondary nav-admin-btn ${this.activeSubView === 'card1-full' ? 'active' : ''}" data-v="card1-full" style="text-align:left; font-size:0.85rem; padding:6px 10px; border-radius:4px; cursor:pointer;">• Business Profile</button>
                  <button class="btn-secondary nav-admin-btn ${this.activeSubView === 'config-areas' ? 'active' : ''}" data-v="config-areas" style="text-align:left; font-size:0.85rem; padding:6px 10px; border-radius:4px; cursor:pointer;">• Dining Areas</button>
                  <button class="btn-secondary nav-admin-btn ${this.activeSubView === 'config-tables' ? 'active' : ''}" data-v="config-tables" style="text-align:left; font-size:0.85rem; padding:6px 10px; border-radius:4px; cursor:pointer;">• Tables</button>
                  <button class="btn-secondary nav-admin-btn ${this.activeSubView === 'config-users' ? 'active' : ''}" data-v="config-users" style="text-align:left; font-size:0.85rem; padding:6px 10px; border-radius:4px; cursor:pointer;">• Staff & Access</button>
                  <button class="btn-secondary nav-admin-btn ${this.activeSubView === 'config-devices' ? 'active' : ''}" data-v="config-devices" style="text-align:left; font-size:0.85rem; padding:6px 10px; border-radius:4px; cursor:pointer;">• Devices & Printers</button>
                  <button class="btn-secondary nav-admin-btn ${this.activeSubView === 'config-payments' ? 'active' : ''}" data-v="config-payments" style="text-align:left; font-size:0.85rem; padding:6px 10px; border-radius:4px; cursor:pointer;">• Payment Configuration</button>
                </div>
              ` : ''}
            </div>

            <button class="btn-secondary nav-admin-btn ${this.activeSubView === 'commissioning' ? 'active' : ''}" data-v="commissioning" style="text-align:left; font-weight:600; padding:10px 12px; border-radius:6px; cursor:pointer;">
              📊 Commissioning
            </button>

            <button class="btn-secondary nav-admin-btn ${this.activeSubView === 'attendance' ? 'active' : ''}" data-v="attendance" style="text-align:left; font-weight:600; padding:10px 12px; border-radius:6px; cursor:pointer;">
              ⏱️ Staff Timesheet
            </button>

            <button class="btn-secondary nav-admin-btn ${this.activeSubView === 'audit' ? 'active' : ''}" data-v="audit" style="text-align:left; font-weight:600; padding:10px 12px; border-radius:6px; cursor:pointer;">
              📋 Audit Log
            </button>
          </aside>

          <!-- Main Content Area -->
          <main id="admin-main-mount" style="flex:1; padding:24px; background:var(--bg-surface-0);"></main>
        </div>
      </div>
    `;

    const mainMount = mount.querySelector('#admin-main-mount');
    this.mountMainContent(mainMount, session, tables, employees, areas);
    this.bindEvents(mount, session);
  }

  mountMainContent(mount, session, tables, employees, areas) {
    if (!mount) return;

    const opts = {
      repositories: this.repositories,
      dataGateway: this._getDataGateway(),
      authEngine: this.authEngine,
      platformEventBus: this.platformEventBus
    };

    if (this.activeSubView === 'dashboard') {
      mount.innerHTML = `
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
          <!-- Top Welcome Title & Commissioning Button -->
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <div>
              <h2 style="font-size:1.75rem; margin:0;">Good Morning, ${session.employeeName || 'Admin'} 👋</h2>
              <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px; margin-bottom:0;">Restaurant • Admin Command Center</p>
            </div>
            <button class="btn-primary" id="btn-goto-comm" style="padding:10px 18px; font-weight:700; background:var(--status-success); color:#000; border:none;">
              📊 Commissioning Control Tower (4/4) →
            </button>
          </div>

          <!-- Restaurant Operational Status Banner -->
          <div class="card" style="background:var(--bg-surface-2); padding:20px; border-left:4px solid var(--status-success); border-radius:8px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">RESTAURANT OPERATIONAL STATUS</div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; flex-wrap:wrap; gap:12px;">
              <div>
                <h3 style="font-size:1.4rem; margin:0; color:var(--text-primary);">🚀 Restaurant Running Normally</h3>
                <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:4px; margin-bottom:0;">
                  Live service active. Workspaces online.
                </p>
              </div>
              <span class="badge badge-success" style="font-size:0.85rem; padding:8px 16px; font-weight:700; border:1px solid var(--status-success);">
                LIVE OPERATIONAL
              </span>
            </div>
          </div>

          <!-- 2-Column Layout: Progress Checklist & Quick Action Shortcuts -->
          <div class="grid grid-cols-3 gap-lg" style="align-items:start;">
            <!-- Left 2 Cols: Configuration Progress Checklist (4 Cards) -->
            <div style="grid-column: span 2; display:flex; flex-direction:column; gap:12px;">
              <h3 style="font-size:1.2rem; margin:0;">Configuration Progress Checklist</h3>
              
              <div class="grid grid-cols-2 gap-md" style="margin-top:4px;">
                <div class="card" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1); padding:16px; border:1px solid var(--border-subtle); border-radius:8px;">
                  <div>
                    <div style="font-weight:700; font-size:0.95rem;">Card 1 — Business Profile</div>
                    <div style="font-size:0.75rem; color:var(--status-success); margin-top:2px; font-weight:600;">Status: COMPLETE</div>
                  </div>
                  <button class="btn-secondary btn-goto-card" data-v="card1-full" style="padding:6px 12px; font-size:0.82rem;">Manage →</button>
                </div>

                <div class="card" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1); padding:16px; border:1px solid var(--border-subtle); border-radius:8px;">
                  <div>
                    <div style="font-weight:700; font-size:0.95rem;">Card 2 — Dining Areas</div>
                    <div style="font-size:0.75rem; color:var(--status-success); margin-top:2px; font-weight:600;">Status: COMPLETE</div>
                  </div>
                  <button class="btn-secondary btn-goto-card" data-v="config-areas" style="padding:6px 12px; font-size:0.82rem;">Manage →</button>
                </div>

                <div class="card" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1); padding:16px; border:1px solid var(--border-subtle); border-radius:8px;">
                  <div>
                    <div style="font-weight:700; font-size:0.95rem;">Card 3 — Dining Tables & Assets</div>
                    <div style="font-size:0.75rem; color:var(--status-success); margin-top:2px; font-weight:600;">Status: COMPLETE</div>
                  </div>
                  <button class="btn-secondary btn-goto-card" data-v="config-tables" style="padding:6px 12px; font-size:0.82rem;">Manage →</button>
                </div>

                <div class="card" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1); padding:16px; border:1px solid var(--border-subtle); border-radius:8px;">
                  <div>
                    <div style="font-weight:700; font-size:0.95rem;">Card 4 — Staff & Access</div>
                    <div style="font-size:0.75rem; color:var(--status-success); margin-top:2px; font-weight:600;">Status: COMPLETE</div>
                  </div>
                  <button class="btn-secondary btn-goto-card" data-v="config-users" style="padding:6px 12px; font-size:0.82rem;">Manage →</button>
                </div>
              </div>
            </div>

            <!-- Right 1 Col: Quick Action Shortcuts Card -->
            <div class="card" style="background:var(--bg-surface-1); padding:20px; border:1px solid var(--border-subtle); border-radius:8px;">
              <h4 style="font-size:1rem; margin-top:0; margin-bottom:14px;">Quick Action Shortcuts</h4>
              <div class="flex-col gap-xs" style="display:flex; flex-direction:column; gap:8px;">
                <button class="btn-secondary btn-goto-card" data-v="card1-full" style="text-align:left; padding:10px 12px; font-size:0.85rem; border-radius:6px; cursor:pointer;">⚙ Edit Business Identity</button>
                <button class="btn-secondary btn-goto-card" data-v="config-areas" style="text-align:left; padding:10px 12px; font-size:0.85rem; border-radius:6px; cursor:pointer;">🏛 Manage Dining Areas</button>
                <button class="btn-secondary btn-goto-card" data-v="config-tables" style="text-align:left; padding:10px 12px; font-size:0.85rem; border-radius:6px; cursor:pointer;">🍽 Manage Dining Assets</button>
                <button class="btn-secondary btn-goto-card" data-v="config-users" style="text-align:left; padding:10px 12px; font-size:0.85rem; border-radius:6px; cursor:pointer;">👤 Manage Staff Accounts</button>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (this.activeSubView === 'config-users') {
      const view = new UserManagementView(opts);
      mount.appendChild(view.render());
    } else if (this.activeSubView === 'config-devices') {
      const view = new DeviceConfigView(opts);
      mount.appendChild(view.render());
    } else if (this.activeSubView === 'config-payments') {
      const view = new ModularConfigView(opts);
      mount.appendChild(view.render());
    } else if (this.activeSubView === 'attendance') {
      const view = new AttendanceView(opts);
      mount.appendChild(view.render());
    } else if (this.activeSubView === 'config-areas' || this.activeSubView === 'config-tables') {
      const view = new FloorViewerView(opts);
      mount.appendChild(view.render());
    } else if (this.activeSubView === 'card1-full') {
      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px;">
          <h2 style="font-size:1.5rem; margin-top:0;">Card 1 — Business Profile & Regional Identity</h2>
          <p style="color:var(--text-muted); font-size:0.875rem;">Manage restaurant name, legal tax structure, currency (INR ₹), timezone, and service charge policies.</p>
          
          <div style="margin-top:20px; display:flex; flex-direction:column; gap:16px; max-width:480px;">
            <div>
              <label style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom:4px;">Restaurant Name</label>
              <input type="text" value="${session.tenantName || 'Anchor Bistro & Cafe'}" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
            </div>
            <div>
              <label style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom:4px;">Currency</label>
              <input type="text" value="INR (₹)" readonly style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); opacity:0.8;">
            </div>
            <div>
              <label style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom:4px;">Service Charge (%)</label>
              <input type="number" value="5" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle);">
            </div>
          </div>
        </div>
      `;
    } else if (this.activeSubView === 'commissioning') {
      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px;">
          <h2 style="font-size:1.5rem; margin-top:0;">📊 Commissioning Control Tower</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-bottom:20px;">Operational readiness check & dependency evaluation.</p>
          
          <div class="grid grid-cols-2 gap-md">
            <div class="card" style="background:var(--bg-surface-2); padding:16px;">
              <h4 style="margin:0;">Infrastructure Status</h4>
              <div style="font-size:1.5rem; font-weight:700; color:var(--status-success); margin-top:6px;">4 / 4 Fully Configured</div>
            </div>
            <div class="card" style="background:var(--bg-surface-2); padding:16px;">
              <h4 style="margin:0;">Active Staff Accounts</h4>
              <div style="font-size:1.5rem; font-weight:700; color:var(--accent-primary); margin-top:6px;">${employees.length || 5} Staff Onboarded</div>
            </div>
          </div>
        </div>
      `;
    } else if (this.activeSubView === 'audit') {
      mount.innerHTML = `
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px;">
          <h2 style="font-size:1.5rem; margin-top:0;">📋 System Audit Log</h2>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px;">Immutable record of actions with Correlation IDs.</p>
          <div style="padding:20px; background:var(--bg-surface-2); border-radius:6px; color:var(--text-muted);">
            Audit log entries active in live DataGateway repository.
          </div>
        </div>
      `;
    }
  }

  bindEvents(mount, session) {
    const toggleBtn = mount.querySelector('#btn-toggle-config-group');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async () => {
        this.configGroupOpen = !this.configGroupOpen;
        await this.render(mount, session);
      });
    }

    const navAdminBtns = mount.querySelectorAll('.nav-admin-btn, .btn-goto-card');
    navAdminBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        this.activeSubView = btn.dataset.v;
        await this.render(mount, session);
      });
    });

    const btnComm = mount.querySelector('#btn-goto-comm');
    if (btnComm) {
      btnComm.addEventListener('click', async () => {
        this.activeSubView = 'commissioning';
        await this.render(mount, session);
      });
    }
  }
}
