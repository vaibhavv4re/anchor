/**
 * Milestone 1 - Admin Home Dashboard & Workspace Health Scores (PD-013 & PD-014)
 * Canonical Home Page displaying Setup Resume bar, Classified Readiness Counters, Workspace Health Scores, Contextual Links, and Explore Mode.
 */

import { setupValidationEngine } from '../../../../businessos/platform/tenant/setupValidationEngine.js';
import { tenantModel } from '../../../../businessos/platform/tenant/tenantModel.js';
import { demoDataSeeder } from '../../../../businessos/platform/tenant/demoDataSeeder.js';

export class AdminDashboardView {
  constructor({ onNavigateWorkspace }) {
    this.onNavigateWorkspace = onNavigateWorkspace;
    this.container = null;
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'admin-dashboard-container flex-col gap-lg animate-fade-in';
    this.container.style.width = '100%';
    this.updateContent();
    return this.container;
  }

  updateContent() {
    const readiness = setupValidationEngine.getReadinessStatus();
    const tenant = tenantModel.getPrimaryTenant();
    const counters = readiness.classifiedCounters;
    const health = readiness.workspaceHealth;

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h2 style="font-size:1.75rem;">Admin Home Dashboard</h2>
          <p style="color:var(--text-muted); font-size:0.875rem;">Operational Readiness & Workspace Domain Health (PD-013 & PD-014)</p>
        </div>
        <button class="btn-primary" id="btn-explore-mode" style="background:var(--accent-secondary); color:#000; font-weight:700;">
          ✨ Explore RestaurantOS (Sample Mode)
        </button>
      </div>

      <!-- Setup Resume Bar -->
      <div class="card" style="background:linear-gradient(135deg, var(--bg-surface-1) 0%, var(--bg-surface-2) 100%); border-left:4px solid var(--accent-primary); padding:var(--space-md) var(--space-xl);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">PROGRESSIVE ONBOARDING STATUS</div>
            <div style="font-size:1.25rem; font-weight:700; margin-top:2px;">Restaurant Operations Active (${readiness.overallProgressPercent}% Complete)</div>
          </div>
          <button class="btn-secondary" id="btn-resume-setup-dash" style="border-color:var(--accent-primary); color:var(--accent-primary); font-weight:600;">
            Resume Setup (Next: Printers) →
          </button>
        </div>
      </div>

      <!-- Classified Readiness Counters Grid (3 Cards) -->
      <div class="grid grid-cols-3 gap-md">
        <div class="card" style="background:var(--bg-surface-2);">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">INFRASTRUCTURE READINESS</div>
          <div style="font-size:1.75rem; font-weight:700; color:var(--status-success); margin-top:4px;">
            ${counters.infrastructure.completed} / ${counters.infrastructure.total} Complete
          </div>
          <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">Profile ✓ Tables ✓ Users ✓ Printers ✓</div>
        </div>

        <div class="card" style="background:var(--bg-surface-2);">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">OPERATIONS READINESS</div>
          <div style="font-size:1.75rem; font-weight:700; color:var(--status-warning); margin-top:4px;">
            ${counters.operations.completed} / ${counters.operations.total} Complete
          </div>
          <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">Food Menu ⚠ Bar Menu ⚠ Recipes ⚠</div>
        </div>

        <div class="card" style="background:var(--bg-surface-2);">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">SERVICE READINESS</div>
          <div style="font-size:1.75rem; font-weight:700; color:var(--status-info); margin-top:4px;">
            ${counters.service.completed} / ${counters.service.total} Complete
          </div>
          <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">Waiters ✓ Chef ⚠ Cashier ⚠</div>
        </div>
      </div>

      <!-- Workspace Health Scores & Contextual Action Links (4 Cards) -->
      <div>
        <h3 style="font-size:1.25rem; margin-bottom:var(--space-md);">Domain Workspace Health Scores</h3>
        <div class="grid grid-cols-2 gap-md">
          
          <div class="card" style="border-top:4px solid var(--status-success);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="font-weight:700; font-size:1.1rem;">🍳 Kitchen Workspace</div>
              <span class="badge badge-success">${health.kitchen.score}% Health</span>
            </div>
            <div style="font-size:0.85rem; color:var(--text-secondary); margin:8px 0;">Food Menu ✓ • Food Recipes ✓ • Stations ✓ • Printers ⚠</div>
            <button class="btn-secondary btn-nav-ws" data-ws="kitchen" style="width:100%; color:var(--accent-primary); font-weight:600;">
              ${health.kitchen.actionLabel}
            </button>
          </div>

          <div class="card" style="border-top:4px solid var(--status-warning);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="font-weight:700; font-size:1.1rem;">🍹 Bar Workspace</div>
              <span class="badge badge-warning">${health.bar.score}% Health</span>
            </div>
            <div style="font-size:0.85rem; color:var(--text-secondary); margin:8px 0;">Beverage Menu ⚠ • Mocktails ⚠ • Bar Printers ⚠</div>
            <button class="btn-secondary btn-nav-ws" data-ws="bar" style="width:100%; color:var(--accent-primary); font-weight:600;">
              ${health.bar.actionLabel}
            </button>
          </div>

          <div class="card" style="border-top:4px solid var(--status-warning);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="font-weight:700; font-size:1.1rem;">📦 Inventory & Stock</div>
              <span class="badge badge-warning">${health.inventory.score}% Health</span>
            </div>
            <div style="font-size:0.85rem; color:var(--text-secondary); margin:8px 0;">Master Items ✓ • Suppliers ⚠ • Stock Count ⚠</div>
            <button class="btn-secondary btn-nav-ws" data-ws="inventory" style="width:100%; color:var(--accent-primary); font-weight:600;">
              ${health.inventory.actionLabel}
            </button>
          </div>

          <div class="card" style="border-top:4px solid var(--status-success);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="font-weight:700; font-size:1.1rem;">📊 Manager Operations</div>
              <span class="badge badge-success">${health.manager.score}% Health</span>
            </div>
            <div style="font-size:0.85rem; color:var(--text-secondary); margin:8px 0;">Live Floor ✓ • Timesheets ✓ • Workload Alerts ✓</div>
            <button class="btn-secondary btn-nav-ws" data-ws="manager" style="width:100%; color:var(--accent-primary); font-weight:600;">
              ${health.manager.actionLabel}
            </button>
          </div>

        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.container.querySelectorAll('.btn-nav-ws').forEach(btn => {
      btn.addEventListener('click', () => {
        const ws = btn.dataset.ws;
        alert(`Deep-linking directly to ${ws.toUpperCase()} Workspace to complete domain setup...`);
        if (this.onNavigateWorkspace) this.onNavigateWorkspace(ws);
      });
    });

    const exploreBtn = this.container.querySelector('#btn-explore-mode');
    if (exploreBtn) {
      exploreBtn.addEventListener('click', () => {
        demoDataSeeder.loadExploreModeData();
        alert('✨ Explore Mode Loaded! Evaluated sample restaurant "Anchor Bistro Demo" with pre-configured menu & floor.');
        location.reload();
      });
    }
  }
}
