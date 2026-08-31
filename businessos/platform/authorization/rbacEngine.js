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
    
    if (!role || (roleId === 'role-superadmin' && role.workspace !== 'superadmin')) {
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
      } else if (lower.includes('ca') || lower.includes('account') || lower.includes('compliance') || lower.includes('audit')) {
        workspace = 'ca';
        permissions = ['ca.view', 'accounting.view', 'reports.view', 'export.generate'];
      } else if (lower.includes('cashier') || lower.includes('billing')) {
        workspace = 'cashier';
        permissions = ['cashier.view', 'payment.process'];
      }

      role = { id: roleId, name: roleId, workspace, permissions };
    }
    return role;
  }

  hasPermission(roleId, permission) {
    const role = this.getRoleById(roleId);
    if (!role) return false;
    if (role.permissions && role.permissions.includes('*')) return true;
    return role.permissions ? role.permissions.includes(permission) : false;
  }

  canAccessWorkspace(roleId, workspaceName) {
    const role = this.getRoleById(roleId);
    if (!role) return false;
    if (role.workspace === 'superadmin' || role.workspace === 'admin') return true;
    return role.workspace === workspaceName;
  }
}

export const rbacEngine = new RbacEngine();
