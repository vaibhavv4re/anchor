/**
 * AdminWorkspaceView.js
 * Comprehensive Super Admin & Executive Management Workspace Composition
 * Assembles developed Admin components:
 * - 📌 Admin Home Dashboard & Workspace Health (AdminDashboardView)
 * - 👥 Staff & Role Management (UserManagementView)
 * - 📱 Terminal & Device Configuration (DeviceConfigView)
 * - ⚙️ System & Workspace Lock Config (ModularConfigView)
 * - ⏱️ Staff Timesheet & Attendance Logs (AttendanceView)
 * 
 * Displays the Data Source Diagnostic Bar (SUPABASE ● vs LOCAL_CACHE ⚠️)
 */

import { AdminDashboardView } from './AdminDashboardView.js';
import { UserManagementView } from '../../user_employee/ui/UserManagementView.js';
import { DeviceConfigView } from '../../device_management/ui/DeviceConfigView.js';
import { ModularConfigView } from '../../configuration/ui/ModularConfigView.js';
import { AttendanceView } from '../../attendance/ui/AttendanceView.js';

export class AdminWorkspaceView {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
    this.authEngine = deps.authEngine || null;
    this.platformEventBus = deps.platformEventBus || null;
    this.repositories = deps.repositories || null;

    this.activeSubView = 'dashboard'; // 'dashboard' | 'users' | 'devices' | 'config' | 'attendance'
  }

  render(mount, session) {
    if (!mount) return;

    const isSupabase = this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function' && this.dataGateway.getCachedCollection('employees').length > 0;

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

        <!-- Cockpit Subtab Bar -->
        <div class="admin-top-cockpit" style="background:var(--bg-surface-1); padding:16px 20px; border-bottom:1px solid var(--border-subtle);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">🛡️ EXECUTIVE & SYSTEM ADMINISTRATION</div>
              <h2 style="font-size:1.6rem; margin-top:2px; margin-bottom:0;">Super Admin Workspace</h2>
              <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">
                Complete platform control tower: Operational readiness, Staff roles, Terminal devices & System configuration.
              </div>
            </div>
            <div style="display:flex; gap:8px;">
              <span class="badge badge-info" style="font-weight:700; font-size:0.8rem; padding:6px 12px;">Full Privilege (role-admin)</span>
            </div>
          </div>

          <!-- Tab Selector Bar -->
          <div style="display:flex; gap:8px; margin-top:16px; border-top:1px solid var(--border-subtle); padding-top:12px; flex-wrap:wrap;">
            <button class="btn-admin-tab ${this.activeSubView === 'dashboard' ? 'active' : ''}" data-tab="dashboard" style="padding:8px 16px; font-size:0.85rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeSubView === 'dashboard' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeSubView === 'dashboard' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              📊 Admin Home Dashboard
            </button>
            <button class="btn-admin-tab ${this.activeSubView === 'users' ? 'active' : ''}" data-tab="users" style="padding:8px 16px; font-size:0.85rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeSubView === 'users' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeSubView === 'users' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              👥 Staff & Roles
            </button>
            <button class="btn-admin-tab ${this.activeSubView === 'devices' ? 'active' : ''}" data-tab="devices" style="padding:8px 16px; font-size:0.85rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeSubView === 'devices' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeSubView === 'devices' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              📱 Terminal Devices
            </button>
            <button class="btn-admin-tab ${this.activeSubView === 'config' ? 'active' : ''}" data-tab="config" style="padding:8px 16px; font-size:0.85rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeSubView === 'config' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeSubView === 'config' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              ⚙️ System Config
            </button>
            <button class="btn-admin-tab ${this.activeSubView === 'attendance' ? 'active' : ''}" data-tab="attendance" style="padding:8px 16px; font-size:0.85rem; font-weight:700; border-radius:6px; cursor:pointer; background:${this.activeSubView === 'attendance' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:${this.activeSubView === 'attendance' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
              ⏱️ Attendance & Timesheets
            </button>
          </div>
        </div>

        <!-- Main Body Workspace Body Mount -->
        <main id="admin-workspace-body" style="padding:20px; flex:1;"></main>
      </div>
    `;

    const bodyMount = mount.querySelector('#admin-workspace-body');
    this.mountSubTab(bodyMount, session);

    // Bind subtab buttons
    mount.querySelectorAll('.btn-admin-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeSubView = btn.dataset.tab;
        this.render(mount, session);
      });
    });
  }

  mountSubTab(container, session) {
    if (!container) return;
    container.innerHTML = '';

    const opts = {
      dataGateway: this.dataGateway,
      authEngine: this.authEngine,
      platformEventBus: this.platformEventBus,
      repositories: this.repositories
    };

    if (this.activeSubView === 'dashboard') {
      const view = new AdminDashboardView({
        onNavigateWorkspace: (ws) => {
          alert(`Deep-linking directly to ${ws.toUpperCase()} Workspace to complete setup...`);
        }
      });
      const el = view.render();
      if (el) container.appendChild(el);
    } else if (this.activeSubView === 'users') {
      const view = new UserManagementView(opts);
      container.appendChild(view.render());
    } else if (this.activeSubView === 'devices') {
      const view = new DeviceConfigView(opts);
      container.appendChild(view.render());
    } else if (this.activeSubView === 'config') {
      const view = new ModularConfigView(opts);
      container.appendChild(view.render());
    } else if (this.activeSubView === 'attendance') {
      const view = new AttendanceView(opts);
      container.appendChild(view.render());
    }
  }
}
