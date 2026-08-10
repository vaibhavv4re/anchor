/**
 * BusinessOS Platform - Authentication & Session Engine
 * Handles PIN validation, active session management, workspace-specific idle timeouts,
 * lock screen, and manager override functionality.
 */

import { identityModel } from '../identity/identityModel.js';
import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus, PlatformEventTypes } from '../events/platformEvents.js';

class AuthEngine {
  constructor() {
    this.activeSession = null;
    this.idleTimer = null;
  }

  /**
   * Authenticate an employee using a 6-digit PIN.
   * @param {string} pin 
   * @param {string} deviceId 
   * @returns {Promise<{success: boolean, session?: Object, error?: string}>}
   */
  async authenticate(pin, deviceId = 'LOCAL_DEVICE') {
    const identity = await identityModel.findByPin(pin);
    if (!identity) {
      return { success: false, error: 'Invalid PIN' };
    }

    // Find linked Employee profile
    const employees = offlineStore.getCollection('employees') || [];
    const employee = employees.find(e => e.identityId === identity.id);

    if (!employee) {
      return { success: false, error: 'No employee profile linked to this identity' };
    }

    // Find linked Role
    const roles = offlineStore.getCollection('roles') || [];
    const role = roles.find(r => r.id === employee.roleId);

    const workspace = role ? role.workspace : employee.workspaceDefault || 'waiter';

    const session = {
      sessionId: 'sess_' + Math.random().toString(36).substring(2, 9),
      identityId: identity.id,
      employeeId: employee.id,
      employeeName: employee.name,
      avatarUrl: employee.avatarUrl,
      roleId: role ? role.id : 'role-waiter',
      roleName: role ? role.name : 'Staff',
      workspace,
      permissions: role ? role.permissions : [],
      deviceId,
      authenticatedAt: new Date().toISOString(),
      isLocked: false
    };

    this.activeSession = session;
    offlineStore.appendItem('sessions', session);

    // Reset and start workspace-specific idle lock timer
    this._restartIdleTimer();

    // Publish platform event (Attendance Engine subscribes to this to auto clock-in!)
    platformEventBus.publish(PlatformEventTypes.EMPLOYEE_AUTHENTICATED, {
      sessionId: session.sessionId,
      identityId: identity.id,
      employeeId: employee.id,
      employeeName: employee.name,
      roleId: session.roleId,
      workspace: session.workspace,
      deviceId,
      timestamp: session.authenticatedAt
    });

    return { success: true, session };
  }

  /**
   * Logout active session.
   */
  logout() {
    if (!this.activeSession) return;

    const session = { ...this.activeSession };
    const logoutTime = new Date().toISOString();
    const durationMs = new Date(logoutTime) - new Date(session.authenticatedAt);

    this.clearIdleTimer();
    this.activeSession = null;

    // Publish platform event (Attendance Engine subscribes to this to auto clock-out!)
    platformEventBus.publish(PlatformEventTypes.EMPLOYEE_LOGGED_OUT, {
      sessionId: session.sessionId,
      identityId: session.identityId,
      employeeId: session.employeeId,
      employeeName: session.employeeName,
      workspace: session.workspace,
      shiftDurationMs: durationMs,
      timestamp: logoutTime,
      deviceId: session.deviceId
    });
  }

  /**
   * Lock active session due to inactivity or manual user tap.
   */
  lockSession() {
    if (!this.activeSession || this.activeSession.isLocked) return;

    this.activeSession.isLocked = true;
    this.clearIdleTimer();

    platformEventBus.publish(PlatformEventTypes.SESSION_LOCKED, {
      sessionId: this.activeSession.sessionId,
      identityId: this.activeSession.identityId,
      employeeId: this.activeSession.employeeId,
      workspace: this.activeSession.workspace,
      lockedAt: new Date().toISOString(),
      deviceId: this.activeSession.deviceId
    });
  }

  /**
   * Resume locked session using PIN.
   */
  async unlockSession(pin) {
    if (!this.activeSession) return { success: false, error: 'No session' };

    const identity = await identityModel.findByPin(pin);
    if (!identity) {
      return { success: false, error: 'Invalid PIN' };
    }

    // Standard unlock (Same employee)
    if (identity.id === this.activeSession.identityId) {
      this.activeSession.isLocked = false;
      this._restartIdleTimer();

      platformEventBus.publish(PlatformEventTypes.SESSION_UNLOCKED, {
        sessionId: this.activeSession.sessionId,
        identityId: identity.id,
        isOverride: false,
        unlockedAt: new Date().toISOString()
      });

      return { success: true, session: this.activeSession, isOverride: false };
    }

    // Manager Override Check ("Take Control")
    const employees = offlineStore.getCollection('employees') || [];
    const employee = employees.find(e => e.identityId === identity.id);
    const roles = offlineStore.getCollection('roles') || [];
    const role = employee ? roles.find(r => r.id === employee.roleId) : null;

    if (role && (role.permissions.includes('*') || role.permissions.includes('override.lock'))) {
      // Create new session for Manager
      this.logout();
      const authResult = await this.authenticate(pin, this.activeSession ? this.activeSession.deviceId : 'LOCAL_DEVICE');
      if (authResult.success) {
        platformEventBus.publish(PlatformEventTypes.SESSION_UNLOCKED, {
          sessionId: authResult.session.sessionId,
          identityId: identity.id,
          isOverride: true,
          unlockedAt: new Date().toISOString()
        });
        return { success: true, session: authResult.session, isOverride: true };
      }
    }

    return { success: false, error: 'Unauthorized override PIN' };
  }

  /**
   * Restart workspace-specific idle lock timer based on configuration.
   */
  _restartIdleTimer() {
    this.clearIdleTimer();
    if (!this.activeSession) return;

    const config = offlineStore.getCollection('configuration') || {};
    const timeouts = (config.system && config.system.idleTimeoutMinutes) || {};
    const timeoutMin = timeouts[this.activeSession.workspace] !== undefined ? timeouts[this.activeSession.workspace] : 3;

    if (timeoutMin <= 0) return; // 0 means never lock (e.g. Kitchen display)

    const timeoutMs = timeoutMin * 60 * 1000;
    this.idleTimer = setTimeout(() => {
      this.lockSession();
    }, timeoutMs);
  }

  clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Returns current active session or null.
   */
  getCurrentSession() {
    return this.activeSession;
  }
}

export const authEngine = new AuthEngine();
