/**
 * BusinessOS Platform - Authorization (RBAC) Engine
 * Evaluates role permissions, workspace routing privileges, and device restrictions.
 * Supports constructor dependency injection (DataGateway, OfflineStore) with dynamic role resolution.
 *
 * Resolution order for getRoleById:
 *   1. persisted cloud `roles` collection (tenant rows, source of truth once seeded);
 *   2. the canonical ROLE_CATALOG (businessos/platform/authorization/roleCatalog.js);
 *   3. a least-privileged 'waiter' default.
 * The former keyword-inference chain is removed: role-id drift (role-bar vs
 * role-bartender, role-inventory-manager vs role-inventory) is now collapsed to
 * canonical ids by normalizeRoleId instead of guessed from substrings.
 */
import { getCatalogRole, normalizeRoleId, catalogHasPermission, catalogWorkspaceFor } from './roleCatalog.js';

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
    return (store && store.getCollection('roles')) || [];
  }

  getRoleById(roleId) {
    const canonical = normalizeRoleId(roleId);
    // 1. Persisted roles (cloud) win once seeded.
    const persisted = this.getRoles().find(
      (r) => r && normalizeRoleId(r.id || r.role_id) === canonical
    );
    if (persisted) {
      return {
        id: canonical,
        name: persisted.name || persisted.role_name || canonical,
        workspace: persisted.workspace || catalogWorkspaceFor(canonical),
        permissions: persisted.permissions || []
      };
    }
    // 2. Canonical catalog.
    const catalogRole = getCatalogRole(canonical);
    if (catalogRole) {
      return { ...catalogRole, id: canonical };
    }
    // 3. Least-privileged default (never grants more than a floor view).
    return { id: canonical, name: canonical, workspace: 'waiter', permissions: ['floor.view'] };
  }

  hasPermission(roleId, permission) {
    return catalogHasPermission(roleId, permission);
  }

  canAccessWorkspace(roleId, workspaceName) {
    const role = this.getRoleById(roleId);
    if (!role) return false;
    if (role.workspace === 'superadmin') return true; // cross-tenant operator
    if (role.permissions && role.permissions.includes('*')) return true; // admin/owner (tenant-scoped by RLS)
    return role.workspace === workspaceName;
  }
}

export const rbacEngine = new RbacEngine();
