/**
 * Capability Group 1 - Identity & Authentication UI
 * PinPadView component handling 6-digit PIN entry, visual feedback, photo confirmation, and error alerts.
 */

import { authEngine } from '../../../../../businessos/platform/authentication/authEngine.js';
import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';

export class PinPadView {
  constructor({ onSuccess, deviceId = 'DEV-FLOOR-01' }) {
    this.onSuccess = onSuccess;
    this.deviceId = deviceId;
    this.currentPin = '';
    this.container = null;
    this.matchedEmployee = null;
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'pin-pad-container animate-fade-in';
    this.updateContent();
    return this.container;
  }

  updateContent() {
    if (!this.container) return;

    const dots = Array.from({ length: 6 }).map((_, i) => 
      `<div class="pin-dot ${i < this.currentPin.length ? 'filled' : ''}"></div>`
    ).join('');

    const photoHtml = this.matchedEmployee ? `
      <div class="employee-confirm-avatar animate-fade-in">
        <img src="${this.matchedEmployee.avatarUrl}" class="employee-avatar-img" alt="${this.matchedEmployee.name}">
        <div>
          <div style="font-weight:600;">${this.matchedEmployee.name}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${this.matchedEmployee.roleName || 'Staff'}</div>
        </div>
      </div>
    ` : `
      <div style="text-align:center;">
        <h2 style="font-size:1.25rem; font-weight:600;">Welcome to Anchor Bistro</h2>
        <p style="font-size:0.875rem; color:var(--text-muted); margin-top:4px;">Enter your 6-digit PIN to clock in</p>
      </div>
    `;

    this.container.innerHTML = `
      ${photoHtml}

      <div class="pin-display-dots">
        ${dots}
      </div>

      <div class="pin-grid">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => `
          <button class="keypad-btn" data-val="${num}">${num}</button>
        `).join('')}
        <button class="keypad-btn" data-action="clear" style="font-size:0.875rem; color:var(--status-danger);">CLEAR</button>
        <button class="keypad-btn" data-val="0">0</button>
        <button class="keypad-btn" data-action="backspace" style="font-size:1rem;">⌫</button>
      </div>

      <div id="pin-error" style="color:var(--status-danger); font-size:0.875rem; height:20px;"></div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const buttons = this.container.querySelectorAll('.keypad-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = btn.dataset.val;
        const action = btn.dataset.action;

        if (val) {
          this.handleDigit(val);
        } else if (action === 'clear') {
          this.currentPin = '';
          this.matchedEmployee = null;
          this.updateContent();
        } else if (action === 'backspace') {
          this.currentPin = this.currentPin.slice(0, -1);
          this.checkMatchedEmployee();
          this.updateContent();
        }
      });
    });
  }

  async handleDigit(digit) {
    if (this.currentPin.length >= 6) return;
    this.currentPin += digit;
    this.checkMatchedEmployee();
    this.updateContent();

    if (this.currentPin.length === 6) {
      await this.submitPin();
    }
  }

  checkMatchedEmployee() {
    // Optional preview check if user enters digits
    if (this.currentPin.length === 6) {
      const identities = offlineStore.getCollection('identities') || [];
      const employees = offlineStore.getCollection('employees') || [];
      const roles = offlineStore.getCollection('roles') || [];

      // Demo preview lookup
      const foundEmp = employees.find(e => e.name);
      if (foundEmp) {
        const role = roles.find(r => r.id === foundEmp.roleId);
        this.matchedEmployee = { ...foundEmp, roleName: role ? role.name : '' };
      }
    }
  }

  async submitPin() {
    const errEl = this.container.querySelector('#pin-error');
    if (errEl) errEl.textContent = 'Authenticating...';

    const result = await authEngine.authenticate(this.currentPin, this.deviceId);

    if (result.success) {
      if (this.onSuccess) this.onSuccess(result.session);
    } else {
      if (errEl) errEl.textContent = result.error || 'Authentication failed';
      this.currentPin = '';
      this.matchedEmployee = null;
      setTimeout(() => this.updateContent(), 1200);
    }
  }
}
