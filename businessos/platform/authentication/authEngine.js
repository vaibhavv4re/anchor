import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

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
    this.lockTimeoutTimer = null;
    this.lockTimeoutMs = deps.lockTimeoutMs || 300000;
    if (this.activeSession) {
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

    if (matchedTenant || sPin === '999999') {
      tenantId = matchedTenant ? (matchedTenant.tenantId || matchedTenant.tenant_id || tenantId) : tenantId;
      employeeName = matchedTenant ? (matchedTenant.adminName || matchedTenant.admin_name || 'General Manager') : 'General Manager';
      roleId = 'role-admin';
    } else if (sPin === '888888') {
      // 2. System Superadmin PIN
      employeeName = 'System Superadmin';
      roleId = 'role-superadmin';
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
    let workspace = 'admin';
    if (role && role.workspace) {
      workspace = role.workspace;
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
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem('anchor_active_session');
      } catch (e) {}
    }
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
    if (this.dataGateway && typeof this.dataGateway.create === 'function') {
      this.dataGateway.create('sessions', session);
    } else if (this.offlineStore && typeof this.offlineStore.appendItem === 'function') {
      this.offlineStore.appendItem('sessions', session);
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
