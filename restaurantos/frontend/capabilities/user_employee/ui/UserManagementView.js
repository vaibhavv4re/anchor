/**
 * Capability 1.2 - User & Employee Management UI
 * Touch-friendly administrative interface for creating Identities, managing Employee profiles,
 * assigning roles/permissions with structured role selectors, resetting PINs, and toggling account status.
 */

import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';
import { identityModel } from '../../../../../businessos/platform/identity/identityModel.js';

export class UserManagementView {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
    this.container = null;
  }

  _getCollection(name) {
    let rawList = [];
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      rawList = this.dataGateway.getCachedCollection(name) || [];
    }
    if ((!Array.isArray(rawList) || rawList.length === 0) && typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      rawList = window.__APP__.platform.dataGateway.getCachedCollection(name) || [];
    }
    if (!Array.isArray(rawList) || rawList.length === 0) {
      rawList = offlineStore.getCollection(name) || [];
    }

    const map = new Map();
    (rawList || []).forEach(item => {
      if (item) {
        const key = item.id || item.employeeCode || item.pin || JSON.stringify(item);
        if (!map.has(key)) {
          map.set(key, item);
        }
      }
    });
    return Array.from(map.values());
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'card animate-fade-in';
    this.container.style.padding = 'var(--space-xl)';
    this.updateContent();
    return this.container;
  }

  getStandardRoles() {
    const rolesFromStore = this._getCollection('roles');
    if (Array.isArray(rolesFromStore) && rolesFromStore.length > 0) {
      return rolesFromStore;
    }
    return [
      { id: 'role-manager', name: 'Operations Manager', workspace: 'manager' },
      { id: 'role-waiter', name: 'Floor Server / Waiter', workspace: 'waiter' },
      { id: 'role-chef', name: 'Kitchen Head Chef', workspace: 'kitchen' },
      { id: 'role-cashier', name: 'Cashier & Billing', workspace: 'cashier' },
      { id: 'role-inventory-manager', name: 'Inventory Manager', workspace: 'inventory' },
      { id: 'role-admin', name: 'General Manager / Admin', workspace: 'admin' },
      { id: 'role-bar', name: 'Bartender', workspace: 'bar' },
      { id: 'role-superadmin', name: 'System Superadmin', workspace: 'superadmin' }
    ];
  }

  updateContent() {
    const employees = this._getCollection('employees');
    const roles = this.getStandardRoles();

    const rows = employees.map(emp => {
      const role = roles.find(r => r.id === (emp.roleId || emp.role_id));
      const avatarUrl = emp.avatarUrl || emp.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(emp.name || 'Staff')}`;
      const empName = emp.name || emp.employeeName || 'Staff Member';
      const roleName = role ? role.name : (emp.roleId ? emp.roleId.replace('role-', '').toUpperCase() : 'Staff');
      const pinDisplay = (emp.data && emp.data.pinDisplay) ? emp.data.pinDisplay : (emp.pinDisplay || (emp.adminPin ? emp.adminPin : '******'));

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:var(--space-md);">
              <img src="${avatarUrl}" class="employee-avatar-img" alt="${empName}" style="width:36px; height:36px; border-radius:50%;">
              <div>
                <div style="font-weight:600;">${empName}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">ID: <code>${emp.id || emp.employeeCode || emp.employee_code}</code></div>
              </div>
            </div>
          </td>
          <td><span class="badge ${role && role.id === 'role-manager' ? 'badge-warning' : 'badge-info'}">${roleName}</span></td>
          <td><span class="badge badge-success">${emp.status || 'ACTIVE'}</span></td>
          <td><strong style="color:var(--status-success); font-family:monospace; font-size:0.95rem;">${pinDisplay}</strong></td>
          <td>
            <div style="display:flex; gap:var(--space-sm);">
              <button class="btn-secondary btn-reset-pin" data-emp-id="${emp.id}" data-id-id="${emp.identityId || emp.identity_id}" style="padding:4px 8px; font-size:0.75rem;">Reset PIN</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:var(--space-md); margin-bottom:var(--space-lg);">
        <div>
          <h2 style="font-size:1.5rem; margin:0;">User & Staff Management</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Manage employee profiles, identities, roles, and PIN access</p>
        </div>
        <button class="btn-primary" id="btn-add-user">+ Onboard Staff Member</button>
      </div>

      <div class="table-responsive">
        <table class="data-table" style="width:100%;">
          <thead>
            <tr>
              <th>Employee / Staff Name</th>
              <th>Assigned Role</th>
              <th>Status</th>
              <th>PIN Access</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows : '<tr><td colspan="5" style="text-align:center; padding:24px;">No staff records found.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div id="onboard-modal-mount"></div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const btnAddUser = this.container.querySelector('#btn-add-user');
    if (btnAddUser) {
      btnAddUser.addEventListener('click', () => {
        this.openOnboardModal();
      });
    }

    this.container.querySelectorAll('.btn-reset-pin').forEach(btn => {
      btn.addEventListener('click', () => {
        const empId = btn.dataset.empId;
        const newPin = prompt('Enter New 6-Digit PIN for Employee:', '123456');
        if (newPin && newPin.length === 6) {
          identityModel.resetPin(btn.dataset.idId || empId, newPin);
          alert(`✅ PIN reset successfully to ${newPin}`);
          this.updateContent();
        }
      });
    });
  }

  openOnboardModal() {
    const mount = this.container.querySelector('#onboard-modal-mount');
    if (!mount) return;

    const roles = this.getStandardRoles();

    const modalEl = document.createElement('div');
    modalEl.className = 'modal-backdrop animate-fade-in';
    modalEl.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999; padding:16px;';

    modalEl.innerHTML = `
      <div class="card" style="width:100%; max-width:480px; background:var(--bg-surface-1); padding:24px; border-radius:12px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
          <h3 style="margin:0; font-size:1.25rem;">👤 Onboard New Staff Member</h3>
          <button id="btn-close-onboard-modal" style="background:none; border:none; color:var(--text-muted); font-size:1.5rem; cursor:pointer;">&times;</button>
        </div>

        <form id="form-onboard-staff" style="display:flex; flex-direction:column; gap:16px;">
          <div>
            <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">Full Name *</label>
            <input type="text" id="input-staff-name" placeholder="e.g. Priya Mehta" required style="width:100%; padding:10px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-primary); font-size:0.95rem;">
          </div>

          <div>
            <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">Assign 6-Digit PIN Access *</label>
            <input type="text" id="input-staff-pin" maxlength="6" placeholder="e.g. 444444" value="444444" required style="width:100%; padding:10px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-primary); font-size:0.95rem; font-family:monospace;">
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Staff member will enter this PIN on the login screen</div>
          </div>

          <div>
            <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">Assigned Operational Role *</label>
            <select id="select-staff-role" required style="width:100%; padding:10px; border-radius:6px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-primary); font-size:0.95rem;">
              ${roles.map(r => `
                <option value="${r.id}" ${r.id === 'role-manager' ? 'selected' : ''}>
                  ${r.name} (${r.id})
                </option>
              `).join('')}
            </select>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Determines workspace routing authority upon PIN login</div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:12px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button type="button" id="btn-cancel-onboard" class="btn-secondary" style="padding:10px 16px;">Cancel</button>
            <button type="submit" class="btn-primary" style="padding:10px 20px;">Onboard Staff Member →</button>
          </div>
        </form>
      </div>
    `;

    mount.appendChild(modalEl);

    const closeModal = () => modalEl.remove();

    modalEl.querySelector('#btn-close-onboard-modal').addEventListener('click', closeModal);
    modalEl.querySelector('#btn-cancel-onboard').addEventListener('click', closeModal);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) closeModal();
    });

    const form = modalEl.querySelector('#form-onboard-staff');
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = modalEl.querySelector('#input-staff-name').value.trim();
      const pin = modalEl.querySelector('#input-staff-pin').value.trim();
      const roleId = modalEl.querySelector('#select-staff-role').value;

      if (!name) return;
      if (!pin || pin.length !== 6 || !/^\d+$/.test(pin)) {
        alert('PIN must be a 6-digit numeric code (e.g., 444444).');
        return;
      }

      const roleObj = roles.find(r => r.id === roleId);
      const workspaceDefault = roleObj ? roleObj.workspace : (roleId === 'role-manager' ? 'manager' : 'waiter');

      const newEmp = {
        id: 'emp-' + pin,
        identityId: 'id-' + pin,
        name,
        roleId,
        pin,
        pinDisplay: pin,
        workspaceDefault,
        status: 'ACTIVE',
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
        data: { pinDisplay: pin, pin }
      };

      // 1. Save to Supabase DataGateway if online (DataGateway handles both local cache and cloud Supabase sync)
      const gw = this.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
      if (gw && typeof gw.create === 'function') {
        gw.create('employees', newEmp);
        gw.create('identities', {
          id: newEmp.identityId,
          employeeId: newEmp.id,
          name: newEmp.name,
          pin,
          pinHash: pin,
          status: 'ACTIVE',
          createdAt: new Date().toISOString()
        });
      } else {
        const emps = offlineStore.getCollection('employees') || [];
        if (!emps.some(e => e.id === newEmp.id)) {
          emps.push(newEmp);
          offlineStore.setCollection('employees', emps);
        }
        const identities = offlineStore.getCollection('identities') || [];
        if (!identities.some(i => i.id === newEmp.identityId)) {
          identities.push({
            id: newEmp.identityId,
            employeeId: newEmp.id,
            name: newEmp.name,
            pin,
            pinHash: pin,
            status: 'ACTIVE',
            createdAt: new Date().toISOString()
          });
          offlineStore.setCollection('identities', identities);
        }
      }

      alert(`✅ Staff member "${name}" successfully onboarded as ${roleObj ? roleObj.name : roleId}!\nPIN Access: ${pin}`);
      closeModal();
      this.updateContent();
    });
  }
}
