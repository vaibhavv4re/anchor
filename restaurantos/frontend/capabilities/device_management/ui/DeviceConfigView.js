/**
 * Capability 1.5 - Device Management UI
 * Controls tablet hardware registration, assigned workspace defaults, floor area mapping, and printer routing.
 */

import { deviceEngine } from '../../../../../businessos/platform/devices/deviceEngine.js';
import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';

export class DeviceConfigView {
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
    const devices = deviceEngine.getAllDevices();
    const config = offlineStore.getCollection('configuration') || {};
    const printers = (config.hardware && config.hardware.printers) || [];

    const rows = devices.map(d => `
      <tr>
        <td>
          <div style="font-weight:600;">${d.name}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${d.id}</div>
        </td>
        <td><span class="badge badge-info">${d.assignedWorkspace}</span></td>
        <td>${d.assignedArea || 'Global'}</td>
        <td>${printers.find(p => p.id === d.assignedPrinterId)?.name || 'Default'}</td>
        <td><span class="badge badge-success">ONLINE</span></td>
      </tr>
    `).join('');

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:var(--space-md); margin-bottom:var(--space-lg);">
        <div>
          <h2 style="font-size:1.5rem;">Device & Hardware Management</h2>
          <p style="color:var(--text-muted); font-size:0.875rem;">Register tablets, assign default workspaces, floor areas, and printer routing</p>
        </div>
        <button class="btn-primary" id="btn-register-device">+ Register New Terminal Device</button>
      </div>

      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Device Name / ID</th>
              <th>Assigned Workspace</th>
              <th>Assigned Area</th>
              <th>Default Printer</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <div id="device-modal-container"></div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const regBtn = this.container.querySelector('#btn-register-device');
    if (regBtn) {
      regBtn.addEventListener('click', () => this.showRegisterModal());
    }
  }

  showRegisterModal() {
    const modalContainer = this.container.querySelector('#device-modal-container');
    const config = offlineStore.getCollection('configuration') || {};
    const printers = (config.hardware && config.hardware.printers) || [];

    modalContainer.innerHTML = `
      <div class="lock-screen-overlay">
        <div class="card" style="max-width:500px; width:100%; padding:var(--space-xl);">
          <h3 style="margin-bottom:var(--space-md);">Register New Device</h3>
          
          <div style="display:flex; flex-direction:column; gap:var(--space-md);">
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Device ID / Tag</label>
              <input type="text" id="inp-dev-id" style="width:100%;" placeholder="e.g. DEV-KITCHEN-01">
            </div>

            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Device Friendly Name</label>
              <input type="text" id="inp-dev-name" style="width:100%;" placeholder="e.g. Main Kitchen KDS Screen">
            </div>

            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Assigned Workspace Default</label>
              <select id="sel-dev-workspace" style="width:100%;">
                <option value="waiter">Waiter / Floor Map</option>
                <option value="kitchen">Kitchen (KDS)</option>
                <option value="bar">Bar (BDS)</option>
                <option value="cashier">Cashier Counter</option>
                <option value="manager">Manager Office</option>
              </select>
            </div>

            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Assigned Printer</label>
              <select id="sel-dev-printer" style="width:100%;">
                ${printers.map(p => `<option value="${p.id}">${p.name} (${p.ip})</option>`).join('')}
              </select>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:var(--space-md); margin-top:var(--space-md);">
              <button class="btn-secondary" id="btn-cancel-device-modal">Cancel</button>
              <button class="btn-primary" id="btn-save-device">Register Terminal Device</button>
            </div>
          </div>
        </div>
      </div>
    `;

    modalContainer.querySelector('#btn-cancel-device-modal').addEventListener('click', () => {
      modalContainer.innerHTML = '';
    });

    modalContainer.querySelector('#btn-save-device').addEventListener('click', () => {
      const deviceId = modalContainer.querySelector('#inp-dev-id').value;
      const name = modalContainer.querySelector('#inp-dev-name').value;
      const assignedWorkspace = modalContainer.querySelector('#sel-dev-workspace').value;
      const assignedPrinterId = modalContainer.querySelector('#sel-dev-printer').value;

      if (!deviceId || !name) {
        alert('Please fill in Device ID and Name');
        return;
      }

      deviceEngine.registerDevice({
        deviceId,
        name,
        assignedWorkspace,
        assignedArea: 'Main Floor',
        assignedPrinterId
      });

      modalContainer.innerHTML = '';
      this.updateContent();
    });
  }
}
