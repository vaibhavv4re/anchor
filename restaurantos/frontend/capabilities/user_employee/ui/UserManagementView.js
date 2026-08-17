/**
 * Capability 1.2 - User & Employee Management UI
 * Touch-friendly administrative interface for creating Identities, managing Employee profiles,
 * assigning roles/permissions, resetting PINs, and toggling account status.
 */

import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';
import { identityModel } from '../../../../../businessos/platform/identity/identityModel.js';

export class UserManagementView {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
    this.container = null;
  }

  _getCollection(name) {
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      const list = this.dataGateway.getCachedCollection(name);
      if (Array.isArray(list) && list.length > 0) return list;
    }
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      const list = window.__APP__.platform.dataGateway.getCachedCollection(name);
      if (Array.isArray(list) && list.length > 0) return list;
    }
    return offlineStore.getCollection(name) || [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'card animate-fade-in';
    this.container.style.padding = 'var(--space-xl)';
    this.updateContent();
    return this.container;
  }

  updateContent() {
    const employees = this._getCollection('employees');
    const roles = this._getCollection('roles');

    const rows = employees.map(emp => {
      const role = roles.find(r => r.id === (emp.roleId || emp.role_id));
      const avatarUrl = emp.avatarUrl || emp.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.name || 'Staff'}`;
      const empName = emp.name || emp.employeeName || 'Staff Member';
      const roleName = role ? role.name : (emp.roleId || emp.role_id || 'Staff');
      const pinDisplay = (emp.data && emp.data.pinDisplay) ? emp.data.pinDisplay : (emp.pinDisplay || '******');

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
          <td><span class="badge badge-info">${roleName}</span></td>
          <td><span class="badge badge-success">${emp.status || 'ACTIVE'}</span></td>
          <td><strong style="color:var(--status-success); font-family:monospace; font-size:0.95rem;">${pinDisplay}</strong></td>
          <td>
            <div style="display:flex; gap:var(--space-sm);">
              <button class="btn-secondary btn-reset-pin" data-emp-id="${emp.id}" data-id-id="${emp.identityId || emp.identity_id}" style="padding:4px 8px; font-size:0.75rem;">Reset PIN</button>
              <button class="btn-secondary btn-edit-role" data-emp-id="${emp.id}" style="padding:4px 8px; font-size:0.75rem;">Change Role</button>
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
              <th>Role</th>
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
    `;

    this.bindEvents();
  }

  bindEvents() {
    const btnAddUser = this.container.querySelector('#btn-add-user');
    if (btnAddUser) {
      btnAddUser.addEventListener('click', () => {
        const name = prompt('Enter New Staff Member Full Name:');
        if (!name) return;
        const pin = prompt('Assign 6-Digit PIN Access (e.g. 111111):', '111111');
        if (!pin || pin.length !== 6) {
          alert('PIN must be a 6-digit numerical string.');
          return;
        }

        const roleId = prompt('Select Role ID (role-chef, role-waiter, role-inventory, role-cashier, role-bartender, role-admin):', 'role-waiter');
        if (!roleId) return;

        const newEmp = {
          id: 'emp-' + Math.random().toString(36).substring(2, 7),
          identityId: 'id-' + Math.random().toString(36).substring(2, 7),
          name,
          roleId,
          status: 'ACTIVE',
          data: { pinDisplay: pin }
        };

        const gw = this.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
        if (gw) {
          gw.create('employees', newEmp);
        } else {
          offlineStore.appendItem('employees', newEmp);
        }

        alert(`✅ Staff member "${name}" onboarded successfully with PIN: ${pin}`);
        this.updateContent();
      });
    }

    this.container.querySelectorAll('.btn-reset-pin').forEach(btn => {
      btn.addEventListener('click', () => {
        const empId = btn.dataset.empId;
        const newPin = prompt('Enter New 6-Digit PIN for Employee:', '123456');
        if (newPin && newPin.length === 6) {
          identityModel.resetPin(btn.dataset.idId, newPin);
          alert(`✅ PIN reset successfully to ${newPin}`);
          this.updateContent();
        }
      });
    });
  }
}
