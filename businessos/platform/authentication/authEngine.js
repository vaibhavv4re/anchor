import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { runtimeConfig } from '../cloud/runtimeConfig.js';

/**
 * Authentication Engine (PD-017 / PD-034 Platform Architecture).
 * Manages employee login via PIN or identity token, session resolution,
 * and workspace delegation without global store locks.
 */
export class AuthEngine {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || null;
    this.identityModel = deps.identityModel || null;
    this.rbacEngine = deps.rbacEngine || null;
    this.offlineStore = deps.offlineStore || offlineStore;
    this.platformEventBus = deps.platformEventBus || platformEventBus;

    this.activeSession = this._loadPersistedSession();
    // Re-adopt the cloud JWT (if any) before anything issues a request, so an
    // authenticated session survives a page refresh. Without this the token
    // lives only in memory and every post-refresh call silently reverts to the
    // anon key, which RLS-blinds the billing tables (bills appear to vanish).
    this._restoreAccessToken();
    this.lockTimeoutTimer = null;
    this.lockTimeoutMs = deps.lockTimeoutMs || 300000;
    if (this.activeSession) {
      this._mirrorRosSession(this.activeSession);
      this._resetLockTimeout();
    }
  }

  _loadPersistedSession() {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem('anchor_active_session');
        if (raw) {
          const sess = JSON.parse(raw);
          if (sess && sess.status === 'ACTIVE') {
            return sess;
          }
        }
      } catch (e) {
        console.warn('[AuthEngine] Failed to restore session from localStorage:', e);
      }
    }
    return null;
  }

  async authenticate(pin, deviceId = 'LOCAL-POS-01') {
    // Stage 1A rollout gate: when server auth is enabled, verify the PIN via
    // the pin-login Edge Function and adopt its JWT. If the function is not
    // reachable yet (undeployed / transient outage) we fall back to the legacy
    // local path so operators are never locked out mid-rollout. Genuine
    // credential rejections (401/403) and rate limits (429) still fail closed.
    if (runtimeConfig.isServerAuthEnabled()) {
      const serverRes = await this._authenticateViaServer(pin, deviceId);
      if (!serverRes || !serverRes.infraUnavailable) return serverRes;
      console.warn('[AuthEngine] pin-login unavailable; using local auth fallback (no cloud JWT).');
    }

    const sPin = String(pin || '').trim();
    let emp = null;
    let identity = null;
    let tenantId = 'tenant_h0qc7wf';
    let roleId = 'role-waiter';
    let employeeName = 'Employee';

    // 1. Check Tenant Admin PIN (999999) from tenants table
    let tenantList = [];
    if (this.dataGateway && typeof this.dataGateway.getCollection === 'function') {
      tenantList = (await this.dataGateway.getCollection('tenants')) || [];
    } else {
      tenantList = (this.offlineStore ? this.offlineStore.getCollection('tenants') : []) || [];
    }
    if (!Array.isArray(tenantList)) tenantList = [];

    const matchedTenant = tenantList.find(t => (
      String(t.adminPin) === sPin ||
      String(t.admin_pin) === sPin ||
      String(t.patchObj?.adminPin) === sPin ||
      String(t.patchObj?.admin_pin) === sPin
    ));

    if (sPin === '888888') {
      // 1. System Superadmin PIN (Top Priority)
      employeeName = 'System Superadmin';
      roleId = 'role-superadmin';
      tenantId = 'system';
    } else if (matchedTenant || sPin === '999999') {
      // 2. Tenant Admin PIN
      tenantId = matchedTenant ? (matchedTenant.tenantId || matchedTenant.tenant_id || tenantId) : tenantId;
      employeeName = matchedTenant ? (matchedTenant.adminName || matchedTenant.admin_name || 'General Manager') : 'General Manager';
      roleId = 'role-admin';
    } else {
      // 3. Employee PIN / Identity lookup
      let allEmps = [];
      if (this.dataGateway && typeof this.dataGateway.getCollection === 'function') {
        allEmps = (await this.dataGateway.getCollection('employees')) || [];
      } else {
        allEmps = (this.offlineStore ? this.offlineStore.getCollection('employees') : []) || [];
      }
      if (!Array.isArray(allEmps)) allEmps = [];

      // Map PIN to known staff credentials if pin not on object
      const pinMap = {
        '000000': 'Nagesh (Owner)',
        '111111': 'Aabhas',
        '222222': 'Suresh',
        '333333': 'Kirtan',
        '444444': 'Sibu (Bartender)',
        '555555': 'Sibu',
        '666666': 'Jitu',
        '777777': 'CA Auditor',
        '888888': 'System Superadmin'
      };

      const expectedName = pinMap[sPin];
      if (expectedName) {
        emp = allEmps.find(e => e.name && e.name.toLowerCase().includes(expectedName.toLowerCase()));
        if (!emp) {
          emp = { 
            id: `emp-${sPin}`, 
            name: (sPin === '000000' || sPin === '888888') ? 'Nagesh' : expectedName, 
            roleId: (sPin === '000000' || sPin === '888888') ? 'role-owner' : (sPin === '444444' ? 'role-bartender' : (sPin === '777777' ? 'role-ca' : (sPin === '333333' ? 'role-inventory-manager' : (sPin === '111111' ? 'role-chef' : 'role-waiter')))),
            workspaceDefault: (sPin === '000000' || sPin === '888888') ? 'owner' : (sPin === '444444' ? 'bar' : (sPin === '777777' ? 'ca' : (sPin === '333333' ? 'inventory' : (sPin === '111111' ? 'kitchen' : 'waiter'))))
          };
        }
      }

      if (!emp) {
        emp = allEmps.find(e => (
          String(e.adminPin) === sPin ||
          String(e.admin_pin) === sPin ||
          String(e.pin) === sPin ||
          String(e.pinDisplay) === sPin ||
          String(e.data?.admin_pin) === sPin ||
          String(e.data?.pinDisplay) === sPin ||
          String(e.data?.pin) === sPin
        ));
      }

      if (emp) {
        employeeName = emp.name || emp.adminName || employeeName;
        roleId = emp.roleId || emp.role_id || roleId;
        tenantId = emp.tenantId || emp.tenant_id || tenantId;
      } else {
        return { success: false, error: 'Invalid PIN or credentials' };
      }
    }

    let role = null;
    if (this.rbacEngine && typeof this.rbacEngine.getRoleById === 'function') {
      role = this.rbacEngine.getRoleById(roleId);
    }

    // Role-based workspace resolution: role_id authority takes primary precedence
    let workspace = roleId === 'role-superadmin' ? 'superadmin' : 'admin';
    if (role && role.workspace) {
      workspace = role.workspace;
    } else if (roleId === 'role-superadmin') {
      workspace = 'superadmin';
    } else if (emp && (emp.workspaceDefault || emp.workspace_default)) {
      workspace = emp.workspaceDefault || emp.workspace_default;
    }

    const resolvedRoleName = role ? (role.name || role.roleName) : (
      roleId === 'role-owner' ? 'Restaurant Owner' :
      roleId === 'role-manager' ? 'Operations Manager' :
      roleId === 'role-admin' ? 'General Manager' :
      roleId === 'role-superadmin' ? 'System Superadmin' :
      roleId === 'role-chef' ? 'Head Chef' :
      roleId === 'role-inventory-manager' ? 'Inventory Manager' :
      roleId === 'role-cashier' ? 'Cashier' :
      roleId === 'role-waiter' ? 'Floor Server' :
      (roleId ? roleId.replace('role-', '').replace(/-/g, ' ').toUpperCase() : 'Staff')
    );

    const session = {
      sessionId: 'sess-' + Math.random().toString(36).substring(2, 9),
      pin: sPin,
      identityId: identity ? identity.id : null,
      employeeId: emp ? emp.id : null,
      employeeName,
      tenantId,
      roleId,
      roleName: resolvedRoleName,
      workspace,
      deviceId,
      authenticatedAt: new Date().toISOString(),
      status: 'ACTIVE'
    };

    this.activeSession = session;
    this._persistSession(session);
    this._resetLockTimeout();

    if (this.platformEventBus && typeof this.platformEventBus.publish === 'function') {
      this.platformEventBus.publish('auth:session_started', session);
    }

    return {
      success: true,
      session,
      workspace
    };
  }

  async _authenticateViaServer(pin, deviceId) {
    const sPin = String(pin || '').trim();
    try {
      const resp = await fetch(`${runtimeConfig.getFunctionsUrl()}/pin-login`, {
        method: 'POST',
        headers: { 'apikey': runtimeConfig.getAnonKey(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: sPin, deviceId })
      });
      if (!resp.ok) {
        // Infrastructure unavailability (function undeployed / server error) is
        // recoverable via the local fallback; auth rejections are NOT.
        if (resp.status === 404 || resp.status === 405 || resp.status >= 500) {
          return { success: false, infraUnavailable: true, error: 'Auth service unavailable' };
        }
        return { success: false, error: resp.status === 429 ? 'Too many attempts, please wait' : 'Invalid PIN or credentials' };
      }
      const data = await resp.json();
      const claims = data.claims || {};
      runtimeConfig.setAccessToken(data.token);
      // Persist the JWT alongside the session so authenticated cloud reads/writes
      // survive a refresh (the in-memory token alone is lost on reload).
      this._persistAccessToken(data.token, data.expiresAt || null);

      const roleId = claims.role_id || 'role-waiter';
      const tenantId = claims.tenant_id || 'tenant_h0qc7wf';
      const workspace = claims.workspace || 'waiter';

      let employeeName = 'Employee';
      try {
        const emps = (this.dataGateway && await this.dataGateway.getCollection('employees', tenantId)) || [];
        const match = emps.find(e => (e.id || e.employeeCode) === claims.sub || e.identityId === claims.sub);
        if (match) employeeName = match.name || match.employeeName || employeeName;
      } catch (_) { /* name lookup is best-effort only */ }
      if (roleId === 'role-superadmin') employeeName = 'System Superadmin';
      else if (roleId === 'role-admin' && employeeName === 'Employee') employeeName = 'General Manager';

      let role = null;
      if (this.rbacEngine && typeof this.rbacEngine.getRoleById === 'function') role = this.rbacEngine.getRoleById(roleId);
      const resolvedRoleName = role ? (role.name || role.roleName) : this._defaultRoleName(roleId);

      const session = {
        sessionId: 'sess-' + Math.random().toString(36).substring(2, 9),
        employeeId: claims.sub || null,
        employeeName,
        tenantId,
        roleId,
        roleName: resolvedRoleName,
        workspace,
        deviceId,
        authenticatedAt: new Date().toISOString(),
        tokenExpiresAt: data.expiresAt || null,
        status: 'ACTIVE'
      };

      this.activeSession = session;
      this._persistSession(session);
      this._resetLockTimeout();
      if (this.platformEventBus && typeof this.platformEventBus.publish === 'function') {
        this.platformEventBus.publish('auth:session_started', session);
      }
      return { success: true, session, workspace };
    } catch (e) {
      // Network / runtime failure reaching the Edge Function: allow the local
      // fallback so a transient outage never locks the whole venue out. Bad
      // credentials still fail closed (they surface as a non-200, handled above).
      console.warn('[AuthEngine] Server auth unreachable, falling back to local:', e.message);
      return { success: false, infraUnavailable: true, error: 'Sign-in service unreachable' };
    }
  }

  _defaultRoleName(roleId) {
    const map = {
      'role-owner': 'Restaurant Owner',
      'role-manager': 'Operations Manager',
      'role-admin': 'General Manager',
      'role-superadmin': 'System Superadmin',
      'role-chef': 'Head Chef',
      'role-inventory-manager': 'Inventory Manager',
      'role-cashier': 'Cashier',
      'role-waiter': 'Floor Server'
    };
    return map[roleId] || (roleId ? roleId.replace('role-', '').replace(/-/g, ' ').toUpperCase() : 'Staff');
  }

  getActiveSession() {
    return this.activeSession;
  }

  getCurrentSession() {
    return this.getActiveSession();
  }

  logout() {
    this.lockSession();
    return true;
  }

  lockSession() {
    if (this.activeSession) {
      this.activeSession.status = 'LOCKED';
      if (this.platformEventBus) {
        this.platformEventBus.publish('auth:session_locked', { sessionId: this.activeSession.sessionId });
      }
    }
    this.activeSession = null;
    runtimeConfig.setAccessToken(null);
    this._persistAccessToken(null, null);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem('anchor_active_session');
      } catch (e) {}
    }
    this._mirrorRosSession(null);
    if (this.lockTimeoutTimer) {
      clearTimeout(this.lockTimeoutTimer);
      this.lockTimeoutTimer = null;
    }
  }

  _persistSession(session) {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        if (session && session.status === 'ACTIVE') {
          window.localStorage.setItem('anchor_active_session', JSON.stringify(session));
        } else {
          window.localStorage.removeItem('anchor_active_session');
        }
      } catch (e) {
        console.warn('[AuthEngine] Failed to write session to localStorage:', e);
      }
    }
    // The station UIs (KDS/BDS) and cancellationModel._actorFromSession resolve the
    // acting employee from sessionStorage `ros_session`, a key this engine historically
    // never wrote - so a real login looked like an empty actor there and every station
    // decision was denied (STATION AUTHORITY REQUIRED). Mirror the active session so all
    // ros_session readers see the same role/workspace the in-memory session carries.
    this._mirrorRosSession(session);
    if (this.dataGateway && typeof this.dataGateway.create === 'function') {
      this.dataGateway.create('sessions', session);
    } else if (this.offlineStore && typeof this.offlineStore.appendItem === 'function') {
      this.offlineStore.appendItem('sessions', session);
    }
  }

  _mirrorRosSession(session) {
    if (typeof sessionStorage === 'undefined') return;
    try {
      if (session && session.status === 'ACTIVE') {
        sessionStorage.setItem('ros_session', JSON.stringify(session));
      } else {
        sessionStorage.removeItem('ros_session');
      }
    } catch (e) {
      console.warn('[AuthEngine] Failed to mirror session to ros_session:', e);
    }
  }

  _persistAccessToken(token, expiresAt) {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      if (token) {
        window.localStorage.setItem('anchor_access_token', JSON.stringify({ token, expiresAt: expiresAt || null }));
      } else {
        window.localStorage.removeItem('anchor_access_token');
      }
    } catch (e) {
      console.warn('[AuthEngine] Failed to persist access token:', e);
    }
  }

  _restoreAccessToken() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = window.localStorage.getItem('anchor_access_token');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const token = parsed && parsed.token;
      if (!token) return;
      // Expired tokens are dropped so the next call cleanly falls back to local
      // cache instead of issuing a request that will 401.
      if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) {
        window.localStorage.removeItem('anchor_access_token');
        return;
      }
      runtimeConfig.setAccessToken(token);
    } catch (e) {
      console.warn('[AuthEngine] Failed to restore access token:', e);
    }
  }

  _resetLockTimeout() {
    if (this.lockTimeoutTimer) {
      clearTimeout(this.lockTimeoutTimer);
    }
    this.lockTimeoutTimer = setTimeout(() => {
      this.lockSession();
    }, this.lockTimeoutMs);
  }
}

export const authEngine = new AuthEngine();
