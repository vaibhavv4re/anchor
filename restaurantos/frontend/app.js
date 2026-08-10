/**
 * RestaurantOS - Main Application Shell & Workspace Router
 * Orchestrates platform initialization, workspace navigation, session idle locking, and event subscriptions.
 */

import { authEngine } from '../../businessos/platform/authentication/authEngine.js';
import { platformEventBus, PlatformEventTypes } from '../../businessos/platform/events/platformEvents.js';
import { notificationEngine } from '../../businessos/platform/notifications/notificationEngine.js';
import { rbacEngine } from '../../businessos/platform/authorization/rbacEngine.js';
import { runCapabilityGroup1TestSuite } from '../../businessos/platform/tests/capability_group_1.test.js';
import { runCapabilityGroup2TestSuite } from './capabilities/restaurant_layout/tests/capability_group_2.test.js';
import { runCapabilityGroup3TestSuite } from './capabilities/guest_service/tests/capability_group_3.test.js';
import { runCapabilityGroup4TestSuite } from './capabilities/order_management/tests/capability_group_4.test.js';
import { runMilestone1TestSuite } from './capabilities/setup_wizard/tests/milestone_1_setup.test.js';

window.runTestSuite = runCapabilityGroup1TestSuite;
window.runGroup2Tests = runCapabilityGroup2TestSuite;
window.runGroup3Tests = runCapabilityGroup3TestSuite;
window.runGroup4Tests = runCapabilityGroup4TestSuite;
window.runMilestone1Tests = runMilestone1TestSuite;

import { PinPadView } from './capabilities/identity/ui/PinPadView.js';
import { LockScreenView } from './capabilities/identity/ui/LockScreenView.js';
import { UserManagementView } from './capabilities/user_employee/ui/UserManagementView.js';
import { DeviceConfigView } from './capabilities/device_management/ui/DeviceConfigView.js';
import { ModularConfigView } from './capabilities/configuration/ui/ModularConfigView.js';
import { AttendanceView } from './capabilities/attendance/ui/AttendanceView.js';
import { FloorViewerView } from './capabilities/restaurant_layout/ui/FloorViewerView.js';

class ApplicationShell {
  constructor() {
    this.appEl = null;
    this.activeWorkspace = 'waiter';
    this.activeSubView = 'floor';
    this.lockScreenComponent = null;
  }

  init() {
    this.appEl = document.getElementById('app');
    this.subscribePlatformEvents();
    this.render();
  }

  subscribePlatformEvents() {
    // Listen for session lock events
    platformEventBus.subscribe(PlatformEventTypes.SESSION_LOCKED, (envelope) => {
      this.handleSessionLocked(envelope.payload);
    });

    // Listen for notifications
    platformEventBus.subscribe(PlatformEventTypes.NOTIFICATION_EMITTED, (envelope) => {
      this.showToast(envelope.payload);
    });
  }

  render() {
    const session = authEngine.getCurrentSession();

    if (!session) {
      this.renderPinPad();
      return;
    }

    this.activeWorkspace = session.workspace;
    this.renderWorkspace(session);
  }

  renderPinPad() {
    this.appEl.innerHTML = `
      <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:var(--space-md); overflow-y:auto; -webkit-overflow-scrolling:touch;">
        <div id="pin-pad-mount" style="width:100%; max-width:420px;"></div>
      </div>
    `;

    const pinPad = new PinPadView({
      onSuccess: () => this.render(),
      deviceId: 'DEV-FLOOR-01'
    });

    const mount = this.appEl.querySelector('#pin-pad-mount');
    mount.appendChild(pinPad.render());
  }

  renderWorkspace(session) {
    this.appEl.innerHTML = `
      <div class="flex-col h-full" style="min-height:100vh;">
        <!-- Top Navigation Header -->
        <header class="app-header">
          <div class="flex items-center gap-md" style="flex-wrap:wrap;">
            <div style="font-weight:700; font-size:1.25rem; color:var(--accent-primary);">Anchor BusinessOS</div>
            <span class="badge badge-info" style="text-transform:uppercase;">${session.workspace} WORKSPACE</span>
          </div>

          <div class="flex items-center gap-md" style="flex-wrap:wrap;">
            <button class="btn-secondary" id="btn-run-m1-tests" style="padding:8px 12px; border-color:var(--status-success); color:var(--status-success);">🚩 Milestone 1</button>
            <button class="btn-secondary" id="btn-run-tests" style="padding:8px 12px; border-color:var(--accent-primary); color:var(--accent-primary);">🧪 Group 1</button>
            <button class="btn-secondary" id="btn-run-group2-tests" style="padding:8px 12px; border-color:var(--accent-secondary); color:var(--accent-secondary);">🧪 Group 2</button>
            <button class="btn-secondary" id="btn-run-group3-tests" style="padding:8px 12px; border-color:var(--status-warning); color:var(--status-warning);">🧪 Group 3</button>
            <button class="btn-secondary" id="btn-run-group4-tests" style="padding:8px 12px; border-color:var(--status-info); color:var(--status-info);">🧪 Group 4</button>

            <div class="employee-confirm-avatar" style="padding:4px 12px;">
              <img src="${session.avatarUrl}" class="employee-avatar-img" alt="${session.employeeName}" style="width:32px; height:32px;">
              <div style="font-size:0.875rem;">
                <span style="font-weight:600;">${session.employeeName}</span>
                <span style="color:var(--text-muted); margin-left:4px;">(${session.roleName})</span>
              </div>
            </div>

            <button class="btn-secondary" id="btn-lock-session" title="Lock Session" style="padding:8px 12px;">🔒 Lock</button>
            <button class="btn-secondary" id="btn-logout" title="Clock Out & Logout" style="padding:8px 12px; color:var(--status-danger);">🚪 Logout</button>
          </div>
        </header>

        <!-- Main Body Area -->
        <div class="app-layout-body">
          <!-- Sidebar Nav for Subviews -->
          <aside class="app-sidebar flex-col gap-sm">
            ${this.renderSidebarNav(session)}
          </aside>

          <!-- Main Content Workspace Mount -->
          <main class="app-main" id="workspace-mount">
          </main>
        </div>
      </div>
    `;

    this.bindHeaderEvents();
    this.mountSubView(session);
  }

  renderSidebarNav(session) {
    const isManagerOrAdmin = rbacEngine.hasPermission(session.roleId, 'user.create') || rbacEngine.hasPermission(session.roleId, '*');

    return `
      <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase; margin-bottom:4px; padding-left:8px;">Workspace Modules</div>
      <button class="nav-item ${this.activeSubView === 'floor' ? 'active' : ''}" data-view="floor">🗺️ Floor & Layout</button>
      <button class="nav-item ${this.activeSubView === 'dashboard' ? 'active' : ''}" data-view="dashboard">📌 Main Overview</button>
      <button class="nav-item ${this.activeSubView === 'attendance' ? 'active' : ''}" data-view="attendance">⏱️ Timesheet</button>

      ${isManagerOrAdmin ? `
        <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase; margin-top:12px; margin-bottom:4px; padding-left:8px;">Administration</div>
        <button class="nav-item ${this.activeSubView === 'users' ? 'active' : ''}" data-view="users">👥 Staff & Roles</button>
        <button class="nav-item ${this.activeSubView === 'devices' ? 'active' : ''}" data-view="devices">📱 Devices</button>
        <button class="nav-item ${this.activeSubView === 'config' ? 'active' : ''}" data-view="config">⚙️ System Config</button>
      ` : ''}

      <style>
        .nav-item {
          width: 100%;
          text-align: left;
          padding: var(--space-sm) var(--space-md);
          border-radius: var(--radius-sm);
          font-size: var(--font-size-sm);
          color: var(--text-secondary);
          transition: all var(--transition-fast);
        }
        .nav-item:hover, .nav-item.active {
          background-color: var(--bg-surface-2);
          color: var(--accent-primary);
          font-weight: 600;
        }
      </style>
    `;
  }

  bindHeaderEvents() {
    const m1TestBtn = this.appEl.querySelector('#btn-run-m1-tests');
    if (m1TestBtn) {
      m1TestBtn.addEventListener('click', async () => {
        const { total, passed } = await window.runMilestone1Tests();
        alert(`🚩 Milestone 1 Playbook Test Results: ${passed}/${total} Scenarios Passed!`);
      });
    }

    const testBtn = this.appEl.querySelector('#btn-run-tests');
    if (testBtn) {
      testBtn.addEventListener('click', async () => {
        const { total, passed } = await window.runTestSuite();
        alert(`🧪 Group 1 Test Suite Results: ${passed}/${total} Assertions Passed!`);
      });
    }

    const group2TestBtn = this.appEl.querySelector('#btn-run-group2-tests');
    if (group2TestBtn) {
      group2TestBtn.addEventListener('click', async () => {
        const { total, passed } = await window.runGroup2Tests();
        alert(`🧪 Group 2 Operational Test Results: ${passed}/${total} Scenarios Passed!`);
      });
    }

    const group3TestBtn = this.appEl.querySelector('#btn-run-group3-tests');
    if (group3TestBtn) {
      group3TestBtn.addEventListener('click', async () => {
        const { total, passed } = await window.runGroup3Tests();
        alert(`🧪 Group 3 Vertical Slice Test Results: ${passed}/${total} Scenarios Passed!`);
      });
    }

    const group4TestBtn = this.appEl.querySelector('#btn-run-group4-tests');
    if (group4TestBtn) {
      group4TestBtn.addEventListener('click', async () => {
        const { total, passed } = await window.runGroup4Tests();
        alert(`🧪 Group 4 Order & Production Routing Test Results: ${passed}/${total} Scenarios Passed!`);
      });
    }

    this.appEl.querySelector('#btn-lock-session').addEventListener('click', () => {
      authEngine.lockSession();
    });

    this.appEl.querySelector('#btn-logout').addEventListener('click', () => {
      authEngine.logout();
      this.render();
    });

    const navBtns = this.appEl.querySelectorAll('.nav-item');
    navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeSubView = btn.dataset.view;
        const session = authEngine.getCurrentSession();
        this.renderWorkspace(session);
      });
    });
  }

  mountSubView(session) {
    const mount = this.appEl.querySelector('#workspace-mount');
    mount.innerHTML = '';

    if (this.activeSubView === 'floor') {
      const view = new FloorViewerView();
      mount.appendChild(view.render());
    } else if (this.activeSubView === 'dashboard') {
      mount.appendChild(this.renderMainOverview(session));
    } else if (this.activeSubView === 'attendance') {
      const view = new AttendanceView();
      mount.appendChild(view.render());
    } else if (this.activeSubView === 'users') {
      const view = new UserManagementView();
      mount.appendChild(view.render());
    } else if (this.activeSubView === 'devices') {
      const view = new DeviceConfigView();
      mount.appendChild(view.render());
    } else if (this.activeSubView === 'config') {
      const view = new ModularConfigView();
      mount.appendChild(view.render());
    }
  }

  renderMainOverview(session) {
    const el = document.createElement('div');
    el.className = 'flex-col gap-lg animate-fade-in';
    el.innerHTML = `
      <div class="card flex items-center justify-between" style="border-left:4px solid var(--accent-primary);">
        <div>
          <h2 style="font-size:1.5rem;">Welcome back, ${session.employeeName}!</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:4px;">You are clocked into the ${session.workspace.toUpperCase()} workspace on terminal DEV-FLOOR-01.</p>
        </div>
        <span class="badge badge-success">ACTIVE SHIFT</span>
      </div>

      <div class="grid grid-cols-3 gap-md">
        <div class="card">
          <div style="font-size:0.875rem; color:var(--text-muted);">Assigned Workspace</div>
          <div style="font-size:1.5rem; font-weight:700; margin-top:4px; text-transform:capitalize;">${session.workspace}</div>
        </div>
        <div class="card">
          <div style="font-size:0.875rem; color:var(--text-muted);">Current Role</div>
          <div style="font-size:1.5rem; font-weight:700; margin-top:4px;">${session.roleName}</div>
        </div>
        <div class="card">
          <div style="font-size:0.875rem; color:var(--text-muted);">Automatic Attendance</div>
          <div style="font-size:1.5rem; font-weight:700; color:var(--status-success); margin-top:4px;">Clocked In</div>
        </div>
      </div>
    `;
    return el;
  }

  handleSessionLocked(payload) {
    const session = authEngine.getCurrentSession();
    if (!session || this.lockScreenComponent) return;

    const lockView = new LockScreenView({
      session,
      onUnlock: (newSession, isOverride) => {
        this.lockScreenComponent = null;
        this.render();
      }
    });

    this.lockScreenComponent = lockView.render();
    document.body.appendChild(this.lockScreenComponent);
  }

  showToast(payload) {
    const toast = document.createElement('div');
    toast.className = 'badge badge-info animate-fade-in';
    toast.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:10000; padding:12px 20px; box-shadow:var(--shadow-lg); background:var(--bg-surface-2); border:1px solid var(--accent-primary);';
    toast.innerHTML = `<strong>${payload.title || 'Notification'}:</strong> ${payload.message || ''}`;

    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new ApplicationShell();
  app.init();
});
