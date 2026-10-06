/**
 * RestaurantOS Capability - Retail (Wine Store) Workspace
 *
 * First-class Retail business unit. Retail shares the platform Inventory Core,
 * Invoice Engine, Payment Engine and Tax Configuration, but keeps a hard boundary
 * from the restaurant: NO TableSession, NO KOT/BOT, NO restaurant Cashier handoff.
 *
 * This is the Phase 0 shell: it renders the Retail navigation and a Coming-Soon
 * panel for each section. Each later plan phase replaces a placeholder with the
 * real view (Phase 1 = Retail POS, Phase 2 = Inventory, Phase 3 = Cash Register,
 * Phase 4 = Returns, Phase 5 = Reports).
 *
 * Reached when an authenticated session has workspace === 'retail' or
 * roleId === 'role-retail-manager' (see restaurantos/frontend/app.js routing).
 */

import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { RetailPosView } from './RetailPosView.js';
import { RetailInventoryView } from './RetailInventoryView.js';
import { RetailRequestsView } from './RetailRequestsView.js';
import { RetailCatalogueView } from './RetailCatalogueView.js';
import { RetailSalesView } from './RetailSalesView.js';
import { RetailInvoicesView } from './RetailInvoicesView.js';
import { RetailCustomersView } from './RetailCustomersView.js';
import { RetailReturnsView } from './RetailReturnsView.js';
import { RetailRegisterView } from './RetailRegisterView.js';
import { RetailReportsView } from './RetailReportsView.js';

// Left-navigation sections. `render` is resolved to a real view in later phases;
// until then every section shows a scoped Coming-Soon panel.
// NOTE: Retail is a pure Inventory Core CONSUMER (like Kitchen/Bar). It raises
// requisitions only - it has NO self-service transfers / counts / adjustments.
// Those are Inventory Manager actions in the main inventory workspace.
const RETAIL_SECTIONS = [
  { id: 'pos',          label: '🧾 POS / New Sale',        group: 'SALES',      phase: 'Phase 1' },
  { id: 'sales',        label: '🧺 Sales',                 group: 'SALES',      phase: 'Phase 1' },
  { id: 'customers',    label: '👤 Customers',             group: 'SALES',      phase: 'Phase 1' },
  { id: 'invoices',     label: '🧾 Invoices',              group: 'SALES',      phase: 'Phase 1' },
  { id: 'returns',      label: '↩️ Returns & Refunds',      group: 'SALES',      phase: 'Phase 4' },
  { id: 'retail_stock', label: '📦 Retail Stock',          group: 'INVENTORY',  phase: 'Phase 2' },
  { id: 'requests',     label: '📩 Request Stock',         group: 'INVENTORY',  phase: 'Phase 2' },
  { id: 'products',     label: '🏷️ Catalogue Management', group: 'PRODUCTS',   phase: 'Phase 1' },
  { id: 'register',     label: '💵 Cash Register',         group: 'REGISTER',   phase: 'Phase 3' },
  { id: 'reports',      label: '📊 Reports',               group: 'INSIGHTS',   phase: 'Phase 5' }
];

export class RetailWorkspaceView {
  constructor(deps = {}) {
    this.deps = deps;
    this.container = null;
    this.mountEl = null;
    this.activeTab = 'pos';
    this.session = null;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
    this.unsubscribeEvents = [];
    // Single POS instance reused across tab switches so an in-progress cart is
    // preserved when the operator navigates away and back.
    this.posView = null;
    // One instance per inventory section (keyed by nav id) so form state and the
    // event subscription survive tab switches, mirroring the POS instance.
    this.sectionViews = {};
  }

  render(mountEl, sessionUser = null) {
    this.mountEl = mountEl;
    this.session = sessionUser;

    this.container = document.createElement('div');
    this.container.className = 'retail-workspace animate-fade-in';
    this.container.style.cssText = 'display:flex; flex-direction:column; width:100%; height:100%; background:var(--bg-base); color:var(--text-primary); overflow:hidden;';

    this.updateContent();

    if (mountEl) {
      mountEl.innerHTML = '';
      mountEl.appendChild(this.container);
    }
    return this.container;
  }

  updateContent() {
    if (!this.container) return;
    const session = this.session || {};
    const name = this._esc(session.employeeName || session.name || 'Retail Manager');

    this.container.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 24px; border-bottom:1px solid var(--border-subtle); background:var(--bg-surface);">
        <div>
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">🍷 RETAIL • WINE STORE WORKSPACE</div>
          <h2 style="margin:4px 0 0; font-size:1.35rem; font-weight:800;">Retail POS Console</h2>
        </div>
        <div style="text-align:right; font-size:0.82rem; color:var(--text-secondary);">
          <div style="font-weight:700;">${name}</div>
          <div style="color:var(--text-muted);">Register: <strong>RETAIL-01</strong></div>
        </div>
      </div>
      <div style="display:flex; flex:1; min-height:0;">
        <aside style="width:240px; flex:0 0 240px; border-right:1px solid var(--border-subtle); padding:16px 12px; overflow-y:auto; background:var(--bg-surface-2);">
          ${this.renderNav()}
        </aside>
        <main id="retail-content" style="flex:1; overflow-y:auto; padding:24px;"></main>
      </div>
    `;

    this.bindNav();
    this.renderSection();
  }

  renderNav() {
    const groups = {};
    RETAIL_SECTIONS.forEach(s => {
      (groups[s.group] = groups[s.group] || []).push(s);
    });
    return Object.keys(groups).map(g => `
      <div style="margin-bottom:16px;">
        <div style="font-size:0.7rem; color:var(--text-muted); font-weight:800; text-transform:uppercase; padding:0 8px 6px;">${g}</div>
        ${groups[g].map(s => {
          const active = this.activeTab === s.id;
          const style = 'display:block; width:100%; text-align:left; margin:2px 0; padding:9px 12px; border-radius:8px; cursor:pointer; '
            + 'border:1px solid ' + (active ? 'var(--accent-primary)' : 'transparent') + '; '
            + 'background:' + (active ? 'rgba(59,130,246,0.12)' : 'transparent') + '; '
            + 'color:var(--text-primary); font-weight:' + (active ? '700' : '500') + '; font-size:0.86rem;';
          return `<button class="retail-nav-item" data-tab="${s.id}" style="${style}">${this._esc(s.label)}</button>`;
        }).join('')}
      </div>
    `).join('');
  }

  _esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Lazily build (and cache) the Phase 2 inventory view for a nav section id.
  // Returns null for sections not yet implemented, so they fall through to the
  // Coming-Soon placeholder. Instances are reused across tab switches so their
  // form state and single stock:balance:updated subscription are preserved.
  _getInventoryView(id) {
    if (this.sectionViews[id]) return this.sectionViews[id];
    const base = {
      dataGateway: this.deps.dataGateway,
      platformEventBus: this.platformEventBus,
      repositories: this.deps.repositories
    };
    let view = null;
    if (id === 'retail_stock') view = new RetailInventoryView(base);
    else if (id === 'requests') view = new RetailRequestsView(base);
    else if (id === 'products') view = new RetailCatalogueView(base);
    else if (id === 'sales') view = new RetailSalesView(base);
    else if (id === 'invoices') view = new RetailInvoicesView(base);
    else if (id === 'customers') view = new RetailCustomersView(base);
    else if (id === 'returns') view = new RetailReturnsView(base);
    else if (id === 'register') view = new RetailRegisterView(base);
    else if (id === 'reports') view = new RetailReportsView(base);
    if (view) this.sectionViews[id] = view;
    return view;
  }

  bindNav() {
    const items = this.container.querySelectorAll('.retail-nav-item');
    items.forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.updateContent();
      });
    });
  }

  renderSection() {
    const content = this.container.querySelector('#retail-content');
    if (!content) return;
    const section = RETAIL_SECTIONS.find(s => s.id === this.activeTab) || RETAIL_SECTIONS[0];

    // Phase 1: POS is the first working surface - mount the real Retail POS view.
    if (section.id === 'pos') {
      if (!this.posView) {
        this.posView = new RetailPosView({
          dataGateway: this.deps.dataGateway,
          platformEventBus: this.platformEventBus,
          repositories: this.deps.repositories
        });
      }
      content.innerHTML = '';
      this.posView.render(content, this.session);
      return;
    }

    // Phase 2: Retail inventory surfaces (stock, transfers, counts, adjustments).
    const view = this._getInventoryView(section.id);
    if (view) {
      content.innerHTML = '';
      view.render(content, this.session);
      return;
    }

    content.innerHTML = `
      <div class="card" style="padding:32px; max-width:720px; border:1px solid var(--border-subtle); border-radius:12px;">
        <div style="font-size:0.78rem; color:var(--accent-primary); font-weight:800; text-transform:uppercase; letter-spacing:0.04em;">${section.phase} • Coming Next</div>
        <h3 style="margin:8px 0 6px; font-size:1.5rem; font-weight:800;">${section.label.replace(/^[^\s]+\s/, '')}</h3>
        <p style="color:var(--text-secondary); font-size:0.95rem; line-height:1.5; margin:0;">
          This Retail ${section.label.replace(/^[^\s]+\s/, '')} surface is scaffolded and will be built in <strong>${section.phase}</strong> of the Retail Wine Store plan.
          The Retail Manager (this login) already routes correctly into the Retail workspace; the domain screens land in their phase.
        </p>
        <div style="margin-top:20px; padding:14px 16px; background:var(--bg-surface-2); border-radius:8px; font-size:0.82rem; color:var(--text-muted);">
          Boundary reminder: Retail reuses the shared Inventory / Invoice / Payment / Tax engines but never touches TableSession, KOT/BOT or the restaurant Cashier.
        </div>
      </div>
    `;
  }

  destroy() {
    if (this.posView && typeof this.posView.destroy === 'function') {
      try { this.posView.destroy(); } catch (_) {}
    }
    Object.values(this.sectionViews || {}).forEach(v => { if (v && typeof v.destroy === 'function') { try { v.destroy(); } catch (_) {} } });
    this.sectionViews = {};
    if (Array.isArray(this.unsubscribeEvents)) {
      this.unsubscribeEvents.forEach(unsub => { if (typeof unsub === 'function') unsub(); });
      this.unsubscribeEvents = [];
    }
  }
}
