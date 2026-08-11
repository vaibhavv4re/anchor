/**
 * Capability 1.2 - User & Employee Management UI
 * Touch-friendly administrative interface for creating Identities, managing Employee profiles,
 * assigning roles/permissions, resetting PINs, and toggling account status.
 */

import { offlineStore } from '../../../../businessos/platform/offline_store/offlineStore.js';
import { identityModel } from '../../../../businessos/platform/identity/identityModel.js';

export class UserManagementView {
  constructor() {
    this.container = null;
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'card animate-fade-in';
    this.container.style.padding = 'var(--space-xl)';
    this.updateContent();
    return this.container;
  }

  updateContent() {
    const employees = offlineStore.getCollection('employees') || [];
    const roles = offlineStore.getCollection('roles') || [];

    const rows = employees.map(emp => {
      const role = roles.find(r => r.id === emp.roleId);
      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:var(--space-md);">
              <img src="${emp.avatarUrl}" class="employee-avatar-img" alt="${emp.name}">
              <div>
                <div style="font-weight:600;">${emp.name}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${emp.id}</div>
              </div>
            </div>
          </td>
          <td><span class="badge badge-info">${role ? role.name : 'Unassigned'}</span></td>
          <td><span class="badge badge-success">ACTIVE</span></td>
          <td>
            <div style="display:flex; gap:var(--space-sm);">
              <button class="btn-secondary btn-reset-pin" data-emp-id="${emp.id}" data-id-id="${emp.identityId}" style="padding:4px 8px; font-size:0.75rem;">Reset PIN</button>
              <button class="btn-secondary btn-edit-role" data-emp-id="${emp.id}" style="padding:4px 8px; font-size:0.75rem;">Change Role</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:var(--space-md); margin-bottom:var(--space-lg);">
        <div>
          <h2 style="font-size:1.5rem;">User & Staff Management</h2>
          <p style="color:var(--text-muted); font-size:0.875rem;">Manage employee profiles, identities, roles, and PIN access</p>
        </div>
        <button class="btn-primary" id="btn-add-user">+ Onboard Staff Member</button>
      </div>

      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Employee Name</th>
              <th>Assigned Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <!-- Onboard Modal Placeholder -->
      <div id="modal-container"></div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const addBtn = this.container.querySelector('#btn-add-user');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.showOnboardModal());
    }

    const resetBtns = this.container.querySelectorAll('.btn-reset-pin');
    resetBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const identityId = btn.dataset.idId;
        const newPin = prompt('Enter new 6-digit PIN for staff member:', '123456');
        if (newPin && newPin.length === 6) {
          await identityModel.resetPin(identityId, newPin);
          alert('PIN reset successfully!');
        } else if (newPin) {
          alert('PIN must be exactly 6 digits');
        }
      });
    });
  }

  showOnboardModal() {
    const modalContainer = this.container.querySelector('#modal-container');
    const roles = offlineStore.getCollection('roles') || [];

    modalContainer.innerHTML = `
      <div class="lock-screen-overlay">
        <div class="card" style="max-width:500px; width:100%; padding:var(--space-xl);">
          <h3 style="margin-bottom:var(--space-md);">Onboard New Staff Member</h3>
          
          <div style="display:flex; flex-direction:column; gap:var(--space-md);">
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Full Name</label>
              <input type="text" id="inp-name" style="width:100%;" placeholder="e.g. Ananya Roy">
            </div>

            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">6-Digit PIN</label>
              <input type="password" id="inp-pin" maxlength="6" style="width:100%;" placeholder="6-digit number">
            </div>

            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Assign Role</label>
              <select id="sel-role" style="width:100%;">
                ${roles.map(r => `<option value="${r.id}">${r.name} (${r.workspace})</option>`).join('')}
              </select>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:var(--space-md); margin-top:var(--space-md);">
              <button class="btn-secondary" id="btn-cancel-modal">Cancel</button>
              <button class="btn-primary" id="btn-save-staff">Save & Create Identity</button>
            </div>
          </div>
        </div>
      </div>
    `;

    modalContainer.querySelector('#btn-cancel-modal').addEventListener('click', () => {
      modalContainer.innerHTML = '';
    });

    modalContainer.querySelector('#btn-save-staff').addEventListener('click', async () => {
      const name = modalContainer.querySelector('#inp-name').value;
      const pin = modalContainer.querySelector('#inp-pin').value;
      const roleId = modalContainer.querySelector('#sel-role').value;

      if (!name || pin.length !== 6) {
        alert('Please fill out name and valid 6-digit PIN');
        return;
      }

      // Create identity first
      const identity = await identityModel.createIdentity(pin);

      // Create linked Employee profile
      const newEmp = {
        id: 'emp_' + Math.random().toString(36).substring(2, 9),
        identityId: identity.id,
        name,
        roleId,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
        workspaceDefault: 'waiter'
      };

      offlineStore.appendItem('employees', newEmp);
      modalContainer.innerHTML = '';
      this.updateContent();
    });
  }
}
