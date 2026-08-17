/**
 * BusinessOS Platform - Authorization (RBAC) Engine
 * Evaluates role permissions, workspace routing privileges, and device restrictions.
 * Supports constructor dependency injection (DataGateway, OfflineStore) with dynamic role resolution.
 */
export class RbacEngine {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || null;
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
  }

  getRoles() {
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      const gatewayRoles = this.dataGateway.getCachedCollection('roles') || [];
      if (gatewayRoles.length > 0) return gatewayRoles;
    }
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? store.getCollection('roles') || [] : [];
  }

  getRoleById(roleId) {
    const roles = this.getRoles();
    let role = roles.find(r => r.id === roleId || r.name?.toLowerCase() === roleId?.toLowerCase());
    if (!role) {
      // Dynamic fallback for custom tenant role IDs (e.g. role-chef, role-bartender, role-cashier, role-inventory)
      const lower = (roleId || '').toLowerCase();
      let workspace = 'waiter';
      let permissions = ['floor.view'];

      if (lower.includes('super')) {
        workspace = 'superadmin';
        permissions = ['*'];
      } else if (lower.includes('admin') || lower.includes('owner')) {
        workspace = 'admin';
        permissions = ['*'];
      } else if (lower.includes('chef') || lower.includes('kitchen') || lower.includes('cook')) {
        workspace = 'kitchen';
        permissions = ['kitchen.view', 'kot.update', 'recipe.view'];
      } else if (lower.includes('inventory')) {
        workspace = 'inventory';
        permissions = ['inventory.view', 'stock.manage'];
      } else if (lower.includes('manager') || lower.includes('mgr')) {
        workspace = 'manager';
        permissions = ['override.lock', 'floor.view', 'kitchen.view', 'attendance.view', 'action.approve'];
      } else if (lower.includes('bar') || lower.includes('bartender')) {
        workspace = 'bar';
        permissions = ['bar.view', 'order.create'];
      } else if (lower.includes('cashier') || lower.includes('billing')) {
        workspace = 'cashier';
        permissions = ['cashier.view', 'payment.process'];
      }

      role = { id: roleId, name: roleId, workspace, permissions };
    }
    return role;
  }

  /**
   * Check if a given role has a specific permission.
   * @param {string} roleId 
   * @param {string} permission 
   * @returns {boolean}
   */
  hasPermission(roleId, permission) {
    const role = this.getRoleById(roleId);
    if (!role) return false;
    if (role.permissions && role.permissions.includes('*')) return true;
    return role.permissions ? role.permissions.includes(permission) : false;
  }

  /**
   * Check if a role is authorized to access a given workspace.
   * @param {string} roleId 
   * @param {string} workspace 
   * @returns {boolean}
   */
  canAccessWorkspace(roleId, workspace) {
    const role = this.getRoleById(roleId);
    if (!role) return false;
    if (role.permissions && role.permissions.includes('*')) return true;
    return role.workspace === workspace || (role.permissions && role.permissions.includes(`workspace.${workspace}`));
  }

  /**
   * Check if a device restricts a role from logging in.
   * @param {string} deviceId 
   * @param {string} roleId 
   * @returns {boolean}
   */
  isRoleAllowedOnDevice(deviceId, roleId) {
    let devices = [];
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      devices = this.dataGateway.getCachedCollection('devices') || [];
    } else {
      const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
      devices = store ? store.getCollection('devices') || [] : [];
    }

    const device = devices.find(d => d.id === deviceId);
    if (!device || !device.allowedRoles || device.allowedRoles.length === 0) return true;
    return device.allowedRoles.includes('*') || device.allowedRoles.includes(roleId);
  }
}

export const rbacEngine = new RbacEngine();
