/**
 * BusinessOS Platform - Authorization (RBAC) Engine
 * Evaluates role permissions, workspace routing privileges, and device restrictions.
 */

import { offlineStore } from '../offline_store/offlineStore.js';

class RbacEngine {
  /**
   * Check if a given role has a specific permission.
   * @param {string} roleId 
   * @param {string} permission 
   * @returns {boolean}
   */
  hasPermission(roleId, permission) {
    const roles = offlineStore.getCollection('roles') || [];
    const role = roles.find(r => r.id === roleId);

    if (!role) return false;
    if (role.permissions.includes('*')) return true;

    return role.permissions.includes(permission);
  }

  /**
   * Check if a role is authorized to access a given workspace.
   * @param {string} roleId 
   * @param {string} workspace 
   * @returns {boolean}
   */
  canAccessWorkspace(roleId, workspace) {
    const roles = offlineStore.getCollection('roles') || [];
    const role = roles.find(r => r.id === roleId);

    if (!role) return false;
    if (role.permissions.includes('*')) return true;

    return role.workspace === workspace || role.permissions.includes(`workspace.${workspace}`);
  }

  /**
   * Check if a device restricts a role from logging in.
   * @param {string} deviceId 
   * @param {string} roleId 
   * @returns {boolean}
   */
  isRoleAllowedOnDevice(deviceId, roleId) {
    const devices = offlineStore.getCollection('devices') || [];
    const device = devices.find(d => d.id === deviceId);

    if (!device || !device.allowedRoles || device.allowedRoles.length === 0) return true;
    return device.allowedRoles.includes('*') || device.allowedRoles.includes(roleId);
  }
}

export const rbacEngine = new RbacEngine();
