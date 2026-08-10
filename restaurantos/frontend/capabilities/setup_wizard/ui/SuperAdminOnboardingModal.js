/**
 * Milestone 1 - Super Admin Onboarding Modal
 * Allows Super Admin (PIN 888888) to create a new restaurant tenant and Admin account.
 */

import { tenantModel } from '../../../../businessos/platform/tenant/tenantModel.js';
import { identityModel } from '../../../../businessos/platform/identity/identityModel.js';

export class SuperAdminOnboardingModal {
  constructor({ onClose, onCreated }) {
    this.onClose = onClose;
    this.onCreated = onCreated;
    this.modalEl = null;
  }

  render() {
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'lock-screen-overlay animate-fade-in';
    this.updateContent();
    return this.modalEl;
  }

  updateContent() {
    this.modalEl.innerHTML = `
      <div class="card animate-fade-in" style="max-width:480px; width:100%; padding:var(--space-xl);">
        <div style="margin-bottom:var(--space-md);">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">SUPER ADMIN CONSOLE</div>
          <h2 style="font-size:1.75rem;">Create New Restaurant</h2>
          <p style="font-size:0.875rem; color:var(--text-muted); margin-top:4px;">Onboard a new restaurant tenant profile & administrator credentials.</p>
        </div>

        <div style="display:flex; flex-direction:column; gap:var(--space-md);">
          <div>
            <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Restaurant Name</label>
            <input type="text" id="inp-tenant-name" value="Anchor Bistro & Cafe" style="width:100%;">
          </div>

          <div class="grid grid-cols-2 gap-sm">
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Currency</label>
              <select id="inp-currency" style="width:100%;">
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Timezone</label>
              <select id="inp-timezone" style="width:100%;">
                <option value="Asia/Kolkata">Asia/Kolkata (+05:30)</option>
                <option value="America/New_York">America/New_York</option>
              </select>
            </div>
          </div>

          <div style="border-top:1px solid var(--border-subtle); padding-top:var(--space-md); margin-top:4px;">
            <div style="font-size:0.875rem; font-weight:600; margin-bottom:8px;">Admin Account Setup</div>
            <div class="grid grid-cols-2 gap-sm">
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Admin Name</label>
                <input type="text" id="inp-admin-name" value="Priya Mehta" style="width:100%;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Admin PIN (6-digits)</label>
                <input type="password" id="inp-admin-pin" value="999999" maxlength="6" style="width:100%;">
              </div>
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:var(--space-md); margin-top:var(--space-md);">
            <button class="btn-secondary" id="btn-cancel-onboard" style="flex:1;">Cancel</button>
            <button class="btn-primary" id="btn-submit-onboard" style="flex:2;">✨ Create Restaurant & Admin</button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.modalEl.querySelector('#btn-cancel-onboard').addEventListener('click', () => {
      if (this.onClose) this.onClose();
    });

    this.modalEl.querySelector('#btn-submit-onboard').addEventListener('click', async () => {
      const name = this.modalEl.querySelector('#inp-tenant-name').value;
      const currency = this.modalEl.querySelector('#inp-currency').value;
      const timezone = this.modalEl.querySelector('#inp-timezone').value;
      const adminName = this.modalEl.querySelector('#inp-admin-name').value;
      const adminPin = this.modalEl.querySelector('#inp-admin-pin').value;

      const newTenant = tenantModel.createTenant({ name, currency, timezone, adminName, adminPin });
      alert(`Restaurant "${newTenant.name}" created! Log in with Admin PIN "${adminPin}" to launch the Setup Assistant.`);
      if (this.onCreated) this.onCreated(newTenant);
    });
  }
}
