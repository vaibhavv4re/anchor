/**
 * SuperAdminWorkspaceView.js
 * Platform Super Admin Console & Multi-Tenant Restaurant Onboarding (PIN 888888)
 *
 * Dedicated workspace for System Superadmin to:
 * - View & manage all restaurant tenants across the platform
 * - Launch SuperAdminOnboardingModal to onboard new restaurant profiles & assign Admin PINs
 * - Switch context or reset database state
 */

import { SuperAdminOnboardingModal } from './SuperAdminOnboardingModal.js';

export class SuperAdminWorkspaceView {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
    this.authEngine = deps.authEngine || null;
    this.platformEventBus = deps.platformEventBus || null;
    this.showModal = false;
  }

  _getCollection(name, tenantId) {
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      const list = this.dataGateway.getCachedCollection(name, tenantId);
      if (Array.isArray(list) && list.length > 0) return list;
    }
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      const list = window.__APP__.platform.dataGateway.getCachedCollection(name, tenantId);
      if (Array.isArray(list) && list.length > 0) return list;
    }
    return [];
  }

  render(mount, session) {
    if (!mount) return;

    const isSupabase = this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function' && this.dataGateway.getCachedCollection('employees').length > 0;
    const tenants = this._getCollection('tenants');

    mount.innerHTML = `
      <div class="superadmin-workspace-container flex-col animate-fade-in" style="width:100%; min-height:100vh; gap:0;">
        <!-- Data Source Diagnostic Bar -->
        <div class="data-source-diagnostic-bar" style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); padding:6px 16px; font-size:0.75rem; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <span class="badge ${isSupabase ? 'badge-success' : 'badge-warning'}" style="font-weight:700; font-size:0.7rem; padding:3px 10px;">
              ${isSupabase ? 'SUPABASE ●' : 'LOCAL_CACHE ⚠️'}
            </span>
            <span>Platform System</span>
            <span>User: <strong>${session.employeeName}</strong></span>
            <span>Role: <strong>${session.roleId}</strong></span>
            <span>Workspace: <strong style="text-transform:uppercase; color:var(--accent-secondary);">${session.workspace}</strong></span>
          </div>
          <div style="color:var(--text-muted); font-weight:600;">Anchor Platform Gateway</div>
        </div>

        <!-- Super Admin Header Cockpit -->
        <div class="superadmin-top-cockpit" style="background:var(--bg-surface-1); padding:20px; border-bottom:1px solid var(--border-subtle);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <div>
              <div style="font-size:0.75rem; color:var(--accent-secondary); font-weight:700; text-transform:uppercase;">👑 SYSTEM CONTROL TOWER</div>
              <h2 style="font-size:1.75rem; margin-top:2px; margin-bottom:0;">👑 Platform Super Admin Console</h2>
              <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">
                Multi-tenant restaurant provisioner: Onboard new restaurants, configure tenant currencies, and allocate General Manager credentials.
              </div>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
              <button class="btn-primary" id="btn-open-onboard-modal" style="padding:10px 18px; font-weight:700; background:var(--accent-secondary); color:#000;">
                ➕ Onboard New Restaurant
              </button>
            </div>
          </div>
        </div>

        <!-- Main Body: Tenant List & Platform Metrics -->
        <main style="padding:24px; flex:1;">
          <div class="grid grid-cols-3 gap-md" style="margin-bottom:24px;">
            <div class="card" style="background:var(--bg-surface-1); padding:16px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">PROVISIONED TENANTS</div>
              <div style="font-size:1.8rem; font-weight:800; color:var(--accent-primary); margin-top:4px;">${tenants.length || 1}</div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Active restaurant databases</div>
            </div>

            <div class="card" style="background:var(--bg-surface-1); padding:16px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">PLATFORM SECURITY PIN</div>
              <div style="font-size:1.8rem; font-weight:800; color:var(--status-success); margin-top:4px;">888888</div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Super Admin Credentials</div>
            </div>

            <div class="card" style="background:var(--bg-surface-1); padding:16px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">DEFAULT TENANT ADMIN PIN</div>
              <div style="font-size:1.8rem; font-weight:800; color:var(--status-warning); margin-top:4px;">999999</div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">General Manager Credentials</div>
            </div>
          </div>

          <div class="card" style="background:var(--bg-surface-1); padding:24px;">
            <h3 style="font-size:1.2rem; margin-top:0; margin-bottom:16px;">🏛️ Active Restaurant Tenants (${tenants.length || 1})</h3>
            
            <div class="flex-col gap-md">
              ${tenants.length > 0 ? tenants.map(t => `
                <div class="card" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-2); padding:16px; border-radius:8px;">
                  <div>
                    <h4 style="font-size:1.1rem; margin:0;">${t.name}</h4>
                    <p style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">ID: <code>${t.tenantId || t.tenant_id || t.id}</code> • Currency: <strong>${t.currency || (t.regional ? t.regional.currency : 'INR (₹)')}</strong></p>
                    <div style="font-size:0.82rem; margin-top:6px; background:var(--bg-surface-1); padding:4px 10px; border-radius:4px; display:inline-block; border:1px solid var(--border-subtle);">
                      👤 General Manager: <strong>${t.adminName || 'General Manager'}</strong> | 🔑 Tenant Admin PIN: <strong style="color:var(--status-success); font-weight:700;">${t.adminPin || '999999'}</strong>
                    </div>
                  </div>
                  <div style="display:flex; gap:10px; align-items:center;">
                    <span class="badge badge-success" style="font-weight:700; font-size:0.8rem; padding:6px 12px;">ACTIVE</span>
                  </div>
                </div>
              `).join('') : `
                <div class="card" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-2); padding:16px; border-radius:8px;">
                  <div>
                    <h4 style="font-size:1.1rem; margin:0;">Anchor Bistro & Cafe</h4>
                    <p style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">ID: <code>tenant_h0qc7wf</code> • Currency: <strong>INR (₹)</strong></p>
                    <div style="font-size:0.82rem; margin-top:6px; background:var(--bg-surface-1); padding:4px 10px; border-radius:4px; display:inline-block; border:1px solid var(--border-subtle);">
                      👤 General Manager: <strong>General Manager</strong> | 🔑 Tenant Admin PIN: <strong style="color:var(--status-success); font-weight:700;">999999</strong>
                    </div>
                  </div>
                  <div style="display:flex; gap:10px; align-items:center;">
                    <span class="badge badge-success" style="font-weight:700; font-size:0.8rem; padding:6px 12px;">ACTIVE</span>
                  </div>
                </div>
              `}
            </div>
          </div>
        </main>
      </div>

      <!-- Super Admin Onboarding Modal Container -->
      <div id="modal-container"></div>
    `;

    const btnOpenModal = mount.querySelector('#btn-open-onboard-modal');
    if (btnOpenModal) {
      btnOpenModal.addEventListener('click', () => {
        const modalContainer = mount.querySelector('#modal-container');
        const modal = new SuperAdminOnboardingModal({
          onClose: () => { modalContainer.innerHTML = ''; },
          onCreated: () => {
            modalContainer.innerHTML = '';
            this.render(mount, session);
          }
        });
        modalContainer.appendChild(modal.render());
      });
    }
  }
}
