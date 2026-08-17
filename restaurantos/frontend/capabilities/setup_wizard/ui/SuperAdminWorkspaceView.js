import { hashPin } from '../../../../../businessos/platform/identity/identityModel.js';

/**
 * SuperAdminWorkspaceView.js
 * Original Super Admin Console UI (PIN 888888)
 *
 * Restores the canonical 2-Column Super Admin Console:
 * - Left: Active Restaurant Tenants list with "⚡ Switch to Admin", "✏️ Reset Admin PIN" & "Delete" buttons
 * - Right: "✨ Onboard New Restaurant Tenant" inline onboarding form
 * - Top Right: "🗑️ Reset All Data & Start Fresh Slate"
 * 
 * Connected directly to DataGateway / Supabase Cloud DB repositories.
 */

export class SuperAdminWorkspaceView {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
    this.authEngine = deps.authEngine || null;
    this.platformEventBus = deps.platformEventBus || null;
  }

  _getDataGateway() {
    if (this.dataGateway) return this.dataGateway;
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      return window.__APP__.platform.dataGateway;
    }
    return null;
  }

  _getCollection(name, tenantId) {
    const gw = this._getDataGateway();
    if (gw && typeof gw.getCachedCollection === 'function') {
      const list = gw.getCachedCollection(name, tenantId);
      if (Array.isArray(list) && list.length > 0) return list;
    }
    return [];
  }

  render(mount, session) {
    if (!mount) return;

    const gw = this._getDataGateway();
    const isSupabase = gw && gw.cloudAdapter && typeof gw.cloudAdapter.getCollection === 'function';
    const tenants = this._getCollection('tenants');

    mount.innerHTML = `
      <div class="superadmin-workspace-container flex-col animate-fade-in" style="width:100%; min-height:100vh; padding:20px; gap:20px;">
        <!-- Data Source Diagnostic Bar -->
        <div class="data-source-diagnostic-bar" style="background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:8px; padding:10px 16px; font-size:0.8rem; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <span class="badge ${isSupabase ? 'badge-success' : 'badge-warning'}" style="font-weight:700; font-size:0.75rem; padding:4px 10px;">
              ${isSupabase ? 'SUPABASE ●' : 'LOCAL_CACHE ⚠️'}
            </span>
            <span>Platform System</span>
            <span>User: <strong>${session.employeeName}</strong></span>
            <span>Role: <strong>${session.roleId}</strong></span>
            <span>Workspace: <strong style="text-transform:uppercase; color:var(--accent-secondary);">${session.workspace}</strong></span>
          </div>
          <div style="color:var(--text-muted); font-weight:600;">Anchor Platform DataGateway</div>
        </div>

        <!-- Header Controls -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          <div>
            <h2 style="font-size:1.75rem; margin:0;">Super Admin Console</h2>
            <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px; margin-bottom:0;">Multi-Tenant Onboarding & System Control (PIN 888888)</p>
          </div>
          <button class="btn-secondary" id="btn-reset-db" style="color:var(--status-danger); border-color:var(--status-danger); font-weight:700; padding:10px 18px;">
            🗑️ Reset All Data & Start Fresh Slate
          </button>
        </div>

        <!-- 2-Column Responsive Layout -->
        <div class="grid grid-cols-2 gap-lg" style="align-items:start;">
          <!-- Left Column: Active Restaurant Tenants -->
          <div>
            <h3 style="font-size:1.2rem; margin-top:0; margin-bottom:12px;">Active Restaurant Tenants (${tenants.length || 1})</h3>
            <div class="flex-col gap-sm">
              ${tenants.length > 0 ? tenants.map(t => `
                <div class="card" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1); padding:16px; border:1px solid var(--border-subtle); border-radius:8px;">
                  <div>
                    <h4 style="font-size:1.1rem; margin:0;">${t.name}</h4>
                    <p style="font-size:0.8rem; color:var(--text-muted); margin-top:2px; margin-bottom:0;">ID: <code>${t.tenantId || t.tenant_id || t.id}</code> • ${t.currency || (t.regional ? t.regional.currency : 'INR')}</p>
                    <div style="font-size:0.82rem; margin-top:6px; background:var(--bg-surface-2); padding:4px 8px; border-radius:4px; display:inline-block;">
                      👤 Admin: <strong>${t.adminName || 'General Manager'}</strong> | 🔑 PIN: <strong style="color:var(--status-success); font-size:0.95rem;">${t.adminPin || '999999'}</strong>
                    </div>
                  </div>
                  <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <button class="btn-primary btn-switch-admin" data-pin="${t.adminPin || '999999'}" style="padding:6px 12px; font-size:0.85rem; font-weight:700;">
                      ⚡ Switch to Admin
                    </button>
                    <button class="btn-secondary btn-reset-pin" data-id="${t.tenantId || t.tenant_id || t.id}" data-name="${t.name}" data-pin="${t.adminPin || '999999'}" style="padding:6px 10px; font-size:0.8rem;">
                      ✏️ Reset PIN
                    </button>
                    <button class="btn-secondary btn-delete-tenant" data-id="${t.tenantId || t.tenant_id || t.id}" style="color:var(--status-danger); padding:6px 10px; font-size:0.8rem;">Delete</button>
                  </div>
                </div>
              `).join('') : `
                <div class="card" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1); padding:16px; border:1px solid var(--border-subtle); border-radius:8px;">
                  <div>
                    <h4 style="font-size:1.1rem; margin:0;">Anchor Bistro & Cafe</h4>
                    <p style="font-size:0.8rem; color:var(--text-muted); margin-top:2px; margin-bottom:0;">ID: <code>tenant_h0qc7wf</code> • INR (₹)</p>
                    <div style="font-size:0.82rem; margin-top:6px; background:var(--bg-surface-2); padding:4px 8px; border-radius:4px; display:inline-block;">
                      👤 Admin: <strong>General Manager</strong> | 🔑 PIN: <strong style="color:var(--status-success); font-size:0.95rem;">999999</strong>
                    </div>
                  </div>
                  <div style="display:flex; gap:8px; align-items:center;">
                    <button class="btn-primary btn-switch-admin" data-pin="999999" style="padding:6px 12px; font-size:0.85rem; font-weight:700;">
                      ⚡ Switch to Admin
                    </button>
                    <button class="btn-secondary btn-reset-pin" data-id="tenant_h0qc7wf" data-name="Anchor Bistro & Cafe" data-pin="999999" style="padding:6px 10px; font-size:0.8rem;">
                      ✏️ Reset PIN
                    </button>
                  </div>
                </div>
              `}
            </div>
          </div>

          <!-- Right Column: Inline Tenant Creation Form -->
          <div class="card" style="background:var(--bg-surface-1); padding:20px; border:1px solid var(--border-subtle); border-radius:8px;">
            <h3 style="font-size:1.2rem; margin-top:0; margin-bottom:12px;">✨ Onboard New Restaurant Tenant</h3>
            <div style="display:flex; flex-direction:column; gap:12px;">
              <div>
                <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Restaurant Name</label>
                <input type="text" id="inp-sa-name" placeholder="e.g. Coastal Bistro" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle);">
              </div>

              <div class="grid grid-cols-2 gap-sm">
                <div>
                  <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Currency</label>
                  <select id="inp-sa-curr" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle);">
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Timezone</label>
                  <select id="inp-sa-tz" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle);">
                    <option value="Asia/Kolkata">Asia/Kolkata</option>
                    <option value="America/New_York">America/New_York</option>
                  </select>
                </div>
              </div>

              <div style="border-top:1px solid var(--border-subtle); padding-top:12px; margin-top:4px;">
                <div style="font-size:0.85rem; font-weight:600; margin-bottom:8px;">Admin Credentials Setup</div>
                <div>
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Admin Name</label>
                  <input type="text" id="inp-sa-admin-name" placeholder="e.g. Priya Mehta" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle);">
                </div>
                <div style="margin-top:8px;">
                  <label style="display:block; font-size:0.75rem; margin-bottom:2px;">Admin PIN (Set Custom 6-Digits)</label>
                  <input type="text" id="inp-sa-admin-pin" placeholder="e.g. 999999" maxlength="6" style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid var(--border-subtle);">
                </div>
              </div>

              <button class="btn-primary" id="btn-sa-submit" style="margin-top:12px; padding:12px; font-weight:700;">
                🚀 Create Restaurant & Generate Credentials
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(mount, session);
  }

  bindEvents(mount, session) {
    const gw = this._getDataGateway();

    // Switch to Admin
    const switchBtns = mount.querySelectorAll('.btn-switch-admin');
    switchBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const pin = btn.dataset.pin || '999999';
        const ae = this.authEngine || (window.__APP__ && window.__APP__.application ? window.__APP__.application.appDependencies.authEngine : null);
        if (ae) {
          const res = await ae.authenticate(pin, 'DEV-FLOOR-01');
          if (res.success) {
            window.location.reload();
          } else {
            alert('Could not switch to Admin: ' + (res.error || 'Authentication error'));
          }
        }
      });
    });

    // Reset Admin PIN
    const resetPinBtns = mount.querySelectorAll('.btn-reset-pin');
    resetPinBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const tId = btn.dataset.id;
        const tName = btn.dataset.name;
        const currentPin = btn.dataset.pin;
        const newPin = prompt(`Reset Admin PIN for restaurant "${tName}" (Current PIN: ${currentPin}):`, '999999');

        if (!newPin || newPin.trim().length !== 6 || isNaN(newPin.trim())) {
          if (newPin !== null) alert('Please enter a valid 6-digit numerical PIN.');
          return;
        }

        const cleanPin = newPin.trim();

        if (gw && typeof gw.update === 'function') {
          await gw.update('tenants', tId, { adminPin: cleanPin });
          
          // Also update General Manager in employees collection
          const employees = gw.getCachedCollection('employees') || [];
          const managerEmp = employees.find(e => (e.tenantId === tId || e.tenant_id === tId) && (e.roleId === 'role-admin' || e.role_id === 'role-admin'));
          if (managerEmp) {
            const updatedData = { ...(managerEmp.data || {}), pinDisplay: cleanPin };
            await gw.update('employees', managerEmp.id, { data: updatedData, pinDisplay: cleanPin });
          }
        }

        alert(`✅ Admin PIN for "${tName}" updated to: ${cleanPin}`);
        this.render(mount, session);
      });
    });

    // Onboard New Restaurant Form Submit
    const submitBtn = mount.querySelector('#btn-sa-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const name = mount.querySelector('#inp-sa-name').value.trim();
        const curr = mount.querySelector('#inp-sa-curr').value;
        const tz = mount.querySelector('#inp-sa-tz').value;
        const adminName = mount.querySelector('#inp-sa-admin-name').value.trim() || 'General Manager';
        const adminPin = mount.querySelector('#inp-sa-admin-pin').value.trim() || '999999';

        if (!name) {
          alert('Please enter a restaurant name.');
          return;
        }

        const tenantId = 'tenant_' + Math.random().toString(36).substring(2, 9);
        const newTenant = {
          id: tenantId,
          tenantId,
          tenant_id: tenantId,
          name,
          currency: curr,
          timezone: tz,
          adminName,
          adminPin,
          createdAt: new Date().toISOString()
        };

        const newEmployee = {
          id: 'emp_' + Math.random().toString(36).substring(2, 9),
          identityId: 'id_' + Math.random().toString(36).substring(2, 9),
          tenantId,
          employeeCode: 'EMP-00001',
          name: adminName,
          roleId: 'role-admin',
          workspaceDefault: 'admin',
          status: 'ACTIVE',
          data: { pinDisplay: adminPin }
        };

        if (gw) {
          if (typeof gw.create === 'function') {
            await gw.create('tenants', newTenant);
            await gw.create('employees', newEmployee);
          }
          // Also set in local cached memory store
          const currentTenants = gw.getCachedCollection('tenants') || [];
          gw.setCollection('tenants', [...currentTenants, newTenant]);

          const currentEmployees = gw.getCachedCollection('employees') || [];
          gw.setCollection('employees', [...currentEmployees, newEmployee]);
        }

        alert(`✅ Restaurant "${name}" onboarded successfully!\nGeneral Manager: ${adminName}\nAdmin PIN: ${adminPin}`);
        
        // Clear input form
        mount.querySelector('#inp-sa-name').value = '';
        mount.querySelector('#inp-sa-admin-name').value = '';
        mount.querySelector('#inp-sa-admin-pin').value = '';

        this.render(mount, session);
      });
    }
  }
}
