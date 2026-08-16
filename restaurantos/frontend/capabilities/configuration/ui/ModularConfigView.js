/**
 * Capability 1.6 - Modular Restaurant Configuration UI
 * Provides tabbed settings for Business Profile, Hardware, Payments, Printing, and System parameters.
 */

import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';
import { platformEventBus, PlatformEventTypes } from '../../../../../businessos/platform/events/platformEvents.js';

export class ModularConfigView {
  constructor() {
    this.activeTab = 'business';
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
    const config = offlineStore.getCollection('configuration') || {};

    this.container.innerHTML = `
      <div style="margin-bottom:var(--space-lg);">
        <h2 style="font-size:1.5rem;">Restaurant System Configuration</h2>
        <p style="color:var(--text-muted); font-size:0.875rem;">Manage business details, hardware, tax tiers, printing automation, and idle lock policies</p>
      </div>

      <!-- Modular Config Tabs -->
      <div style="display:flex; gap:var(--space-sm); border-bottom:1px solid var(--border-subtle); margin-bottom:var(--space-lg); overflow-x:auto; padding-bottom:4px; -webkit-overflow-scrolling:touch;">
        <button class="config-tab ${this.activeTab === 'business' ? 'active' : ''}" data-tab="business">🏢 Business Profile</button>
        <button class="config-tab ${this.activeTab === 'hardware' ? 'active' : ''}" data-tab="hardware">🖨️ Hardware & Printers</button>
        <button class="config-tab ${this.activeTab === 'payments' ? 'active' : ''}" data-tab="payments">💳 Payments & Taxes</button>
        <button class="config-tab ${this.activeTab === 'printing' ? 'active' : ''}" data-tab="printing">📄 Ticket Printing</button>
        <button class="config-tab ${this.activeTab === 'system' ? 'active' : ''}" data-tab="system">⚙️ System & Idle Timeouts</button>
      </div>

      <!-- Tab Content Area -->
      <div id="tab-content">
        ${this.renderTabContent(config)}
      </div>

      <style>
        .config-tab {
          padding: var(--space-sm) var(--space-md);
          font-weight: 500;
          color: var(--text-muted);
          border-bottom: 2px solid transparent;
        }
        .config-tab.active {
          color: var(--accent-primary);
          border-bottom-color: var(--accent-primary);
        }
      </style>
    `;

    this.bindEvents();
  }

  renderTabContent(config) {
    if (this.activeTab === 'business') {
      const b = config.business || {};
      return `
        <div style="display:flex; flex-direction:column; gap:var(--space-md); max-width:600px;">
          <div>
            <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Restaurant Name</label>
            <input type="text" id="cfg-biz-name" value="${b.name || ''}" style="width:100%;">
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-md);">
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Currency</label>
              <input type="text" id="cfg-biz-currency" value="${b.currency || 'INR'}" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Currency Symbol</label>
              <input type="text" id="cfg-biz-symbol" value="${b.currencySymbol || '₹'}" style="width:100%;">
            </div>
          </div>
          <button class="btn-primary" id="btn-save-biz" style="align-self:flex-start;">Save Business Profile</button>
        </div>
      `;
    }

    if (this.activeTab === 'system') {
      const s = (config.system && config.system.idleTimeoutMinutes) || {};
      return `
        <div style="display:flex; flex-direction:column; gap:var(--space-md); max-width:600px;">
          <h3>Workspace Idle Lock Timeouts (Minutes)</h3>
          <p style="color:var(--text-muted); font-size:0.875rem;">Set to 0 to keep workspace permanently unlocked (e.g. Kitchen display)</p>
          
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-md);">
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Waiter Workspace</label>
              <input type="number" id="cfg-idle-waiter" value="${s.waiter !== undefined ? s.waiter : 3}" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Kitchen Workspace (KDS)</label>
              <input type="number" id="cfg-idle-kitchen" value="${s.kitchen !== undefined ? s.kitchen : 0}" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Manager Workspace</label>
              <input type="number" id="cfg-idle-manager" value="${s.manager !== undefined ? s.manager : 10}" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Cashier Workspace</label>
              <input type="number" id="cfg-idle-cashier" value="${s.cashier !== undefined ? s.cashier : 5}" style="width:100%;">
            </div>
          </div>

          <button class="btn-primary" id="btn-save-system" style="align-self:flex-start; margin-top:var(--space-md);">Save System Settings</button>
        </div>
      `;
    }

    return `<div style="color:var(--text-muted);">Tab settings under ${this.activeTab}</div>`;
  }

  bindEvents() {
    const tabs = this.container.querySelectorAll('.config-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeTab = tab.dataset.tab;
        this.updateContent();
      });
    });

    const saveBiz = this.container.querySelector('#btn-save-biz');
    if (saveBiz) {
      saveBiz.addEventListener('click', () => {
        const config = offlineStore.getCollection('configuration') || {};
        config.business = {
          ...config.business,
          name: this.container.querySelector('#cfg-biz-name').value,
          currency: this.container.querySelector('#cfg-biz-currency').value,
          currencySymbol: this.container.querySelector('#cfg-biz-symbol').value
        };
        offlineStore.setCollection('configuration', config);
        platformEventBus.publish(PlatformEventTypes.CONFIG_UPDATED, { section: 'business', config: config.business });
        alert('Business profile updated!');
      });
    }

    const saveSys = this.container.querySelector('#btn-save-system');
    if (saveSys) {
      saveSys.addEventListener('click', () => {
        const config = offlineStore.getCollection('configuration') || {};
        config.system = config.system || {};
        config.system.idleTimeoutMinutes = {
          waiter: parseInt(this.container.querySelector('#cfg-idle-waiter').value) || 0,
          kitchen: parseInt(this.container.querySelector('#cfg-idle-kitchen').value) || 0,
          manager: parseInt(this.container.querySelector('#cfg-idle-manager').value) || 0,
          cashier: parseInt(this.container.querySelector('#cfg-idle-cashier').value) || 0
        };
        offlineStore.setCollection('configuration', config);
        platformEventBus.publish(PlatformEventTypes.CONFIG_UPDATED, { section: 'system', config: config.system });
        alert('System idle lock timeouts updated!');
      });
    }
  }
}
