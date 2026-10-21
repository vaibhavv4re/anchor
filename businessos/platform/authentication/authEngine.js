import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus, PlatformEventTypes } from '../events/platformEvents.js';
import { runtimeConfig } from '../cloud/runtimeConfig.js';
import { getDeviceId } from '../metadata/entityMetadata.js';

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
    // Explicit constructor override wins (headless tests pin 300000); otherwise
    // the per-workspace idle policy edited in ModularConfigView governs
    // (configuration.system.idleTimeoutMinutes; 0 = never lock).
    this.lockTimeoutMsOverride = deps.lockTimeoutMs || null;
    this._activityHandler = null;
    this._lastActivityAt = 0;
    this._lastLockedSession = null;
    if (this.activeSession) {
      this._mirrorRosSession(this.activeSession);
      this._startActivityKeepAlive();
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

  async authenticate(pin, deviceId = getDeviceId()) {
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

    const serverMode = runtimeConfig.isServerAuthEnabled();

    if (serverMode && (sPin === '888888' || sPin === '999999')) {
      // Privileged-PIN lockdown: superadmin/tenant-admin identities exist only
      // server-side (pin-login verifies hashes, not this map). If the Edge
      // Function was unreachable and we fell through to the local path, a
      // hardcoded PIN must NEVER mint an admin session.
      return { success: false, error: 'Sign-in service unavailable — privileged access requires the auth server' };
    }

    if (!serverMode && sPin === '888888') {
      // 1. System Superadmin PIN (Top Priority)
      employeeName = 'System Superadmin';
      roleId = 'role-superadmin';
      tenantId = 'system';
    } else if (!serverMode && (matchedTenant || sPin === '999999')) {
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

      // Server mode is data-driven only: the synthesized pinMap identities above
      // are dev/local conveniences and privileged ones are rejected outright,
      // so an unreachable auth server can never hand out owner/CA/admin roles.
      const expectedName = serverMode ? null : pinMap[sPin];
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

    this._publishAuthenticated(session);

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
      this._publishAuthenticated(session);
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
    const s = this.activeSession ? { ...this.activeSession } : null;
    this.lockSession({ reason: 'LOGOUT' });
    if (s && this.platformEventBus && typeof this.platformEventBus.publish === 'function') {
      // Typed logout event completes the EMPLOYEE_AUTHENTICATED pairing; the
      // attendance module (on hold) wakes up automatically when re-enabled.
      this.platformEventBus.publish(PlatformEventTypes.EMPLOYEE_LOGGED_OUT, {
        employeeId: s.employeeId,
        employeeName: s.employeeName,
        tenantId: s.tenantId,
        timestamp: new Date().toISOString(),
        shiftDurationMs: s.authenticatedAt ? (Date.now() - new Date(s.authenticatedAt).getTime()) : 0
      });
    }
    this._lastLockedSession = null;
    return true;
  }

  /**
   * Unlock an idle-locked session (LockScreenView). Same employee resumes;
   * a different employee may take over only with a privileged role (Manager
   * Override). Anyone else is rejected and the terminal stays locked.
   * @param {string} pin
   * @returns {{success: boolean, session?: Object, isOverride?: boolean, error?: string}}
   */
  async unlockSession(pin) {
    const locked = this._lastLockedSession;
    const result = await this.authenticate(pin, locked ? locked.deviceId : undefined);
    if (!result || !result.success) {
      return { success: false, error: (result && result.error) || 'Invalid Unlock PIN' };
    }
    const s = result.session;
    const privileged = ['role-manager', 'role-admin', 'role-owner', 'role-superadmin'].includes(s.roleId);
    const isSameEmployee = !locked || (!!s.employeeId && !!locked.employeeId && s.employeeId === locked.employeeId);

    if (!isSameEmployee && !privileged) {
      this.lockSession({ reason: 'FAILED_OVERRIDE' });
      return {
        success: false,
        error: `Session belongs to ${locked.employeeName || 'another employee'}. Enter their PIN or use a Manager Override.`
      };
    }
    if (!isSameEmployee && privileged && this.platformEventBus && typeof this.platformEventBus.publish === 'function') {
      this.platformEventBus.publish('session:override', {
        takenOverBy: s.employeeName,
        takenOverRoleId: s.roleId,
        lockedSessionId: locked.sessionId,
        timestamp: new Date().toISOString()
      });
    }
    return { success: true, session: s, isOverride: !isSameEmployee };
  }

  lockSession(opts = {}) {
    const reason = opts.reason || 'IDLE_TIMEOUT';
    if (this.activeSession) {
      const snapshot = { ...this.activeSession, status: 'LOCKED' };
      this.activeSession.status = 'LOCKED';
      if (this.platformEventBus && typeof this.platformEventBus.publish === 'function') {
        this.platformEventBus.publish('auth:session_locked', { sessionId: snapshot.sessionId, reason });
        // Typed event: the ApplicationShell idle-lock overlay subscribes to
        // SESSION_LOCKED ('platform:session:locked'). This used to be dead -
        // only the raw string was published - so the overlay never appeared.
        // The payload carries the locked-session snapshot because activeSession
        // is nulled below and the shell can no longer read it.
        this.platformEventBus.publish(PlatformEventTypes.SESSION_LOCKED, {
          sessionId: snapshot.sessionId,
          reason,
          employeeName: snapshot.employeeName,
          session: snapshot
        });
      }
      this._lastLockedSession = snapshot;
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
    this._stopActivityKeepAlive();
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
    if (session && session.status === 'ACTIVE') {
      this._startActivityKeepAlive();
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

  /**
   * Publish the authenticated-session event pair: the raw string (bootstrap.js
   * re-hydration subscribes to 'auth:session_started') plus the typed platform
   * event. Additive - no existing subscriber changes were needed.
   */
  _publishAuthenticated(session) {
    if (!this.platformEventBus || typeof this.platformEventBus.publish !== 'function') return;
    this.platformEventBus.publish('auth:session_started', session);
    this.platformEventBus.publish(PlatformEventTypes.EMPLOYEE_AUTHENTICATED, {
      employeeId: session.employeeId,
      employeeName: session.employeeName,
      workspace: session.workspace,
      deviceId: session.deviceId,
      tenantId: session.tenantId,
      timestamp: session.authenticatedAt
    });
  }

  /**
   * Per-workspace idle minutes maintained in ModularConfigView
   * (configuration.system.idleTimeoutMinutes). 0 = never auto-lock.
   */
  _idleMinutesForWorkspace(workspace) {
    const DEFAULT_MIN = 5;
    if (!workspace) return DEFAULT_MIN;
    try {
      const config = this.offlineStore.getCollection('configuration') || {};
      const policy = (config.system && config.system.idleTimeoutMinutes) || null;
      if (policy && policy[workspace] !== undefined) {
        const m = parseInt(policy[workspace], 10);
        return (isNaN(m) || m < 0) ? DEFAULT_MIN : m;
      }
    } catch (_) { /* fall through to default */ }
    return DEFAULT_MIN;
  }

  _resolveLockTimeoutMs() {
    if (this.lockTimeoutMsOverride) return this.lockTimeoutMsOverride;
    const workspace = this.activeSession ? this.activeSession.workspace : null;
    const mins = this._idleMinutesForWorkspace(workspace);
    return mins <= 0 ? 0 : mins * 60000;
  }

  _resetLockTimeout() {
    if (this.lockTimeoutTimer) {
      clearTimeout(this.lockTimeoutTimer);
      this.lockTimeoutTimer = null;
    }
    const ms = this._resolveLockTimeoutMs();
    if (!ms) return; // policy 0: kitchen-style stations never idle-lock
    this.lockTimeoutTimer = setTimeout(() => {
      this.lockSession({ reason: 'IDLE_TIMEOUT' });
    }, ms);
  }

  /**
   * Activity keep-alive: staff working a shift must not be locked out. Touch /
   * key events arm the idle timer afresh (throttled to 15s so every tap is not
   * a timer reset). Registered from session persistence; removed on lock.
   */
  _startActivityKeepAlive() {
    if (typeof window === 'undefined' || this._activityHandler) return;
    this._activityHandler = () => {
      const now = Date.now();
      if (now - this._lastActivityAt < 15000) return;
      this._lastActivityAt = now;
      if (this.activeSession) this._resetLockTimeout();
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, this._activityHandler, { passive: true }));
  }

  _stopActivityKeepAlive() {
    if (typeof window === 'undefined' || !this._activityHandler) return;
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
      window.removeEventListener(ev, this._activityHandler));
    this._activityHandler = null;
  }
}

export const authEngine = new AuthEngine();
