/**
 * Capability 1.6 - Modular Restaurant Configuration UI
 * Provides tabbed settings for Business Profile, Hardware, Payments, Printing, and System parameters.
 */

import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';
import { platformEventBus, PlatformEventTypes } from '../../../../../businessos/platform/events/platformEvents.js';
import { getConfig, saveSection } from '../../../../../businessos/platform/config/systemConfigStore.js';
import { DataControlCenterView } from './DataControlCenterView.js';

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
    // Read through the cloud-backed config store (system_config source of truth
    // with a synchronous local mirror), so what one device edits is what every
    // device sees - instead of the old per-device offlineStore-only persistence.
    const config = getConfig();

    this.container.innerHTML = `
      <div style="margin-bottom:var(--space-lg);">
        <h2 style="font-size:1.5rem;">Restaurant System Configuration</h2>
        <p style="color:var(--text-muted); font-size:0.875rem;">Manage business details, hardware, tax tiers, printing automation, and idle lock policies</p>
      </div>

      <!-- Modular Config Tabs -->
      <div style="display:flex; gap:var(--space-sm); border-bottom:1px solid var(--border-subtle); margin-bottom:var(--space-lg); overflow-x:auto; padding-bottom:4px; -webkit-overflow-scrolling:touch;">
        <button class="config-tab ${this.activeTab === 'business' ? 'active' : ''}" data-tab="business">🏢 Business Profile</button>
        <button class="config-tab ${this.activeTab === 'data_control' ? 'active' : ''}" data-tab="data_control">⚙️ Data & Setup Control</button>
        <button class="config-tab ${this.activeTab === 'hardware' ? 'active' : ''}" data-tab="hardware">🖨️ Hardware & Printers</button>
        <button class="config-tab ${this.activeTab === 'payments' ? 'active' : ''}" data-tab="payments">💳 Payments & Taxes</button>
        <button class="config-tab ${this.activeTab === 'printing' ? 'active' : ''}" data-tab="printing">📄 Ticket Printing</button>
        <button class="config-tab ${this.activeTab === 'system' ? 'active' : ''}" data-tab="system">⚙️ System & Idle Timeouts</button>
        <button class="config-tab ${this.activeTab === 'observability' ? 'active' : ''}" data-tab="observability">🛰️ Observability</button>
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

    if (this.activeTab === 'data_control') {
      const dataControl = new DataControlCenterView();
      return dataControl.render().outerHTML;
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

    if (this.activeTab === 'hardware') {
      const h = config.hardware || {};
      const printers = h.printers || [];
      return `
        <div style="display:flex; flex-direction:column; gap:var(--space-md); max-width:720px;">
          <h3>🖨️ Printers & Hardware</h3>
          <p style="color:var(--text-muted); font-size:0.875rem;">Register receipt / KOT / bar printers. Terminal devices route to these in Device Management.</p>
          <div id="printer-rows" style="display:flex; flex-direction:column; gap:var(--space-sm);">
            ${printers.map((p, i) => this._printerRowHtml(p, i)).join('') || `<div style="color:var(--text-muted);">No printers configured yet.</div>`}
          </div>
          <div><button class="btn-secondary" id="btn-add-printer">+ Add Printer</button></div>
          <button class="btn-primary" id="btn-save-hardware" style="align-self:flex-start; margin-top:var(--space-md);">Save Hardware</button>
        </div>
      `;
    }

    if (this.activeTab === 'printing') {
      const pr = config.printing || {};
      const printers = (config.hardware && config.hardware.printers) || [];
      const opts = printers.map(p => `<option value="${p.id}" ${pr.kotPrinterId === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
      const bosOpts = printers.map(p => `<option value="${p.id}" ${pr.bosPrinterId === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
      return `
        <div style="display:flex; flex-direction:column; gap:var(--space-md); max-width:720px;">
          <h3>📄 Ticket Printing & Routing</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-md);">
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">KOT (Kitchen) Printer</label>
              <select id="cfg-print-kot" style="width:100%;"><option value="">— none —</option>${opts}</select>
            </div>
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">BOS / Bill Printer</label>
              <select id="cfg-print-bos" style="width:100%;"><option value="">— none —</option>${bosOpts}</select>
            </div>
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Receipt Header Text</label>
              <input type="text" id="cfg-print-header" value="${pr.receiptHeader || ''}" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Receipt Footer Text</label>
              <input type="text" id="cfg-print-footer" value="${pr.receiptFooter || ''}" style="width:100%;">
            </div>
          </div>
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="cfg-print-auto" ${pr.autoPrintKot ? 'checked' : ''}> Auto-print KOT on order send</label>
          <button class="btn-primary" id="btn-save-printing" style="align-self:flex-start;">Save Printing Settings</button>
        </div>
      `;
    }

    if (this.activeTab === 'payments') {
      const pay = config.payments || {};
      const methods = pay.methods && pay.methods.length ? pay.methods : ['CASH', 'CARD', 'UPI', 'WALLET'];
      const toggle = (m) => `<label style="display:inline-flex; align-items:center; gap:6px; margin-right:16px;"><input type="checkbox" class="cfg-pay-method" value="${m}" ${methods.includes(m) ? 'checked' : ''}> ${m}</label>`;
      return `
        <div style="display:flex; flex-direction:column; gap:var(--space-md); max-width:720px;">
          <h3>💳 Payments, Taxes & Charges</h3>
          <div>
            <label style="display:block; font-size:0.875rem; margin-bottom:6px;">Accepted Payment Methods</label>
            ${['CASH', 'CARD', 'UPI', 'WALLET', 'CREDIT'].map(toggle).join('')}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-md);">
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Service Charge (%)</label>
              <input type="number" step="0.1" id="cfg-pay-service" value="${pay.serviceChargePercent !== undefined ? pay.serviceChargePercent : 0}" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Default GST Rate (%)</label>
              <input type="number" step="0.1" id="cfg-pay-gst" value="${pay.gstPercent !== undefined ? pay.gstPercent : 5}" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Rounding Step (₹)</label>
              <input type="number" step="1" id="cfg-pay-round" value="${pay.roundingStep !== undefined ? pay.roundingStep : 1}" style="width:100%;">
            </div>
          </div>
          <p style="color:var(--text-muted); font-size:0.8rem;">Per-category GST (Food/Bar split) is governed by the Tax Configurations engine; these are the tenant defaults.</p>
          <button class="btn-primary" id="btn-save-payments" style="align-self:flex-start;">Save Payments & Taxes</button>
        </div>
      `;
    }

    if (this.activeTab === 'observability') {
      const obs = config.observability || {};
      const tier = obs.tier || 'lean';
      const overrides = obs.deviceOverrides || {};
      const rows = Object.keys(overrides).length
        ? Object.entries(overrides).map(([dev, t]) => this._obsOverrideRowHtml(dev, t)).join('')
        : `<div style="color:var(--text-muted); font-size:0.85rem;">No per-device overrides.</div>`;
      return `
        <div style="display:flex; flex-direction:column; gap:var(--space-md); max-width:720px;">
          <h3>🛰️ Observability Control Center</h3>
          <p style="color:var(--text-muted); font-size:0.875rem;">Controls how much telemetry each client device streams to the cloud Observatory. Credentials (PINs, tokens) are always redacted before capture, on every tier.</p>
          <div style="max-width:320px;">
            <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Tenant capture tier</label>
            <select id="cfg-obs-tier" style="width:100%;">
              <option value="off" ${tier === 'off' ? 'selected' : ''}>Off - no telemetry</option>
              <option value="lean" ${tier === 'lean' ? 'selected' : ''}>Lean - errors, warnings & key lifecycle (recommended)</option>
              <option value="full" ${tier === 'full' ? 'selected' : ''}>Full - every event (high volume)</option>
            </select>
          </div>
          <div>
            <label style="display:block; font-size:0.875rem; margin-bottom:6px;">Per-device overrides</label>
            <p style="color:var(--text-muted); font-size:0.8rem; margin-top:0;">Force one terminal to a tier (e.g. <em>full</em> to debug a specific device) without changing the tenant default.</p>
            <div id="obs-override-rows" style="display:flex; flex-direction:column; gap:var(--space-sm);">${rows}</div>
            <div><button class="btn-secondary" id="btn-obs-add-override" style="margin-top:8px;">+ Add device override</button></div>
          </div>
          <button class="btn-primary" id="btn-save-observability" style="align-self:flex-start;">Save Observability Settings</button>
        </div>
      `;
    }

    return `<div style="color:var(--text-muted);">Tab settings under ${this.activeTab}</div>`;
  }

  _obsOverrideRowHtml(dev = '', tier = 'full') {
    const esc = (v) => String(v == null ? '' : v).replace(/"/g, '&quot;');
    return `
      <div class="obs-override-row" style="display:grid; grid-template-columns:1fr 160px auto; gap:8px; align-items:center;">
        <input class="inp-obs-dev" placeholder="Device ID (e.g. DEV-1)" value="${esc(dev)}" style="width:100%;">
        <select class="inp-obs-tier">
          ${['off', 'lean', 'full'].map((t) => `<option value="${t}" ${tier === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <button type="button" class="btn-secondary btn-del-obs-override" style="padding:6px 10px;">✕</button>
      </div>
    `;
  }

  _printerRowHtml(p = {}, i = 0) {
    const esc = (v) => String(v == null ? '' : v).replace(/"/g, '&quot;');
    return `
      <div class="printer-row" style="display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:8px; align-items:center;">
        <input class="inp-p-name" placeholder="Name (e.g. Kitchen KOT)" value="${esc(p.name)}" style="width:100%;">
        <input class="inp-p-ip" placeholder="IP / Host" value="${esc(p.ip)}" style="width:100%;">
        <select class="inp-p-type">
          ${['RECEIPT', 'KOT', 'BAR', 'KITCHEN'].map(t => `<option value="${t}" ${p.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <button type="button" class="btn-secondary btn-del-printer" style="padding:6px 10px;">✕</button>
      </div>
    `;
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
      saveBiz.addEventListener('click', async () => {
        await saveSection('business', {
          name: this.container.querySelector('#cfg-biz-name').value,
          currency: this.container.querySelector('#cfg-biz-currency').value,
          currencySymbol: this.container.querySelector('#cfg-biz-symbol').value
        });
        alert('Business profile saved (synced to cloud).');
      });
    }

    const saveSys = this.container.querySelector('#btn-save-system');
    if (saveSys) {
      saveSys.addEventListener('click', async () => {
        await saveSection('system', {
          idleTimeoutMinutes: {
            waiter: parseInt(this.container.querySelector('#cfg-idle-waiter').value) || 0,
            kitchen: parseInt(this.container.querySelector('#cfg-idle-kitchen').value) || 0,
            manager: parseInt(this.container.querySelector('#cfg-idle-manager').value) || 0,
            cashier: parseInt(this.container.querySelector('#cfg-idle-cashier').value) || 0
          }
        });
        alert('System idle lock timeouts saved (synced to cloud).');
      });
    }

    // ---- Hardware (printers) ------------------------------------------------
    const addPrinter = this.container.querySelector('#btn-add-printer');
    if (addPrinter) {
      addPrinter.addEventListener('click', () => {
        const rows = this.container.querySelector('#printer-rows');
        if (rows.querySelector('.printer-row')) {
          rows.insertAdjacentHTML('beforeend', this._printerRowHtml({}, 0));
        } else {
          rows.innerHTML = this._printerRowHtml({}, 0);
        }
        this._bindPrinterRowDeletes();
      });
      this._bindPrinterRowDeletes();
    }

    const saveHardware = this.container.querySelector('#btn-save-hardware');
    if (saveHardware) {
      saveHardware.addEventListener('click', async () => {
        const printers = Array.from(this.container.querySelectorAll('.printer-row')).map((row, idx) => ({
          id: row.querySelector('.inp-p-name').dataset.pid || `prt_${idx + 1}`,
          name: row.querySelector('.inp-p-name').value.trim(),
          ip: row.querySelector('.inp-p-ip').value.trim(),
          type: row.querySelector('.inp-p-type').value
        })).filter(p => p.name);
        await saveSection('hardware', { printers });
        alert('Hardware / printers saved (synced to cloud).');
      });
    }

    // ---- Printing -----------------------------------------------------------
    const savePrinting = this.container.querySelector('#btn-save-printing');
    if (savePrinting) {
      savePrinting.addEventListener('click', async () => {
        await saveSection('printing', {
          kotPrinterId: this.container.querySelector('#cfg-print-kot').value,
          bosPrinterId: this.container.querySelector('#cfg-print-bos').value,
          receiptHeader: this.container.querySelector('#cfg-print-header').value,
          receiptFooter: this.container.querySelector('#cfg-print-footer').value,
          autoPrintKot: this.container.querySelector('#cfg-print-auto').checked
        });
        alert('Printing settings saved (synced to cloud).');
      });
    }

    // ---- Payments & Taxes ---------------------------------------------------
    const savePayments = this.container.querySelector('#btn-save-payments');
    if (savePayments) {
      savePayments.addEventListener('click', async () => {
        const methods = Array.from(this.container.querySelectorAll('.cfg-pay-method')).filter(c => c.checked).map(c => c.value);
        await saveSection('payments', {
          methods,
          serviceChargePercent: parseFloat(this.container.querySelector('#cfg-pay-service').value) || 0,
          gstPercent: parseFloat(this.container.querySelector('#cfg-pay-gst').value) || 0,
          roundingStep: parseFloat(this.container.querySelector('#cfg-pay-round').value) || 0
        });
        alert('Payments & tax defaults saved (synced to cloud).');
      });
    }

    // ---- Observability ------------------------------------------------------
    const addOverride = this.container.querySelector('#btn-obs-add-override');
    if (addOverride) {
      addOverride.addEventListener('click', () => {
        const rows = this.container.querySelector('#obs-override-rows');
        const placeholder = rows.querySelector('div[style*="color:var(--text-muted)"]');
        if (placeholder) rows.innerHTML = '';
        rows.insertAdjacentHTML('beforeend', this._obsOverrideRowHtml('', 'full'));
        this._bindObsOverrideDeletes();
      });
      this._bindObsOverrideDeletes();
    }

    const saveObs = this.container.querySelector('#btn-save-observability');
    if (saveObs) {
      saveObs.addEventListener('click', async () => {
        const tier = this.container.querySelector('#cfg-obs-tier').value;
        const deviceOverrides = {};
        this.container.querySelectorAll('.obs-override-row').forEach((row) => {
          const dev = row.querySelector('.inp-obs-dev').value.trim();
          const t = row.querySelector('.inp-obs-tier').value;
          if (dev) deviceOverrides[dev] = t;
        });
        await saveSection('observability', { tier, deviceOverrides });
        alert('Observability settings saved (synced to cloud).');
      });
    }
  }

  _bindObsOverrideDeletes() {
    this.container.querySelectorAll('.btn-del-obs-override').forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => btn.closest('.obs-override-row').remove());
    });
  }

  _bindPrinterRowDeletes() {
    this.container.querySelectorAll('.btn-del-printer').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => btn.closest('.printer-row').remove());
    });
  }
}
