/**
 * BusinessOS Platform - Canonical Role Catalog (single source of truth)
 *
 * Eliminates the historical role-id drift where the onboarding UI offered
 * `role-bar` / `role-inventory-manager` while the live DB and the workspace
 * router used `role-bartender` / `role-inventory`. Every consumer (rbacEngine,
 * UserManagementView, the ApplicationShell router, authEngine session
 * resolution) MUST resolve roles through this module so the strings are
 * identical across UI, storage and routing.
 *
 * Design notes:
 *  - `alias` maps legacy/synonym ids to a canonical id; `normalizeRoleId`
 *    collapses them so existing rows keep working.
 *  - Superadmin lives in the cross-tenant `system` tenant and holds `*`.
 *  - Tenant Admin (`role-admin`) holds `*` but is confined to its own tenant
 *    by RLS (tenant_id = jwt_tenant_id()), so "global" perms are per-tenant.
 *  - CA (`role-ca`) is deliberately READ-ONLY: view/report/export only, no
 *    write capability of any kind. Enforced via permissions, not UI hiding.
 */

export const ROLE_CATALOG = [
  {
    id: 'role-superadmin',
    name: 'System Superadmin',
    workspace: 'superadmin',
    tenantScoped: false,
    permissions: ['*']
  },
  {
    id: 'role-admin',
    name: 'General Manager',
    workspace: 'admin',
    tenantScoped: true,
    permissions: ['*']
  },
  {
    id: 'role-owner',
    name: 'Restaurant Owner',
    workspace: 'owner',
    tenantScoped: true,
    permissions: ['*']
  },
  {
    id: 'role-manager',
    name: 'Operations Manager',
    workspace: 'manager',
    tenantScoped: true,
    permissions: [
      'override.lock', 'floor.view', 'kitchen.view', 'attendance.view',
      'action.approve', 'void.approve', 'reports.view', 'staff.view'
    ]
  },
  {
    id: 'role-ca',
    name: 'Chartered Accountant / CA Auditor',
    workspace: 'ca',
    tenantScoped: true,
    // Read-only auditor: NO write/export-mutating permissions by design.
    permissions: ['ca.view', 'accounting.view', 'reports.view', 'export.generate']
  },
  {
    id: 'role-chef',
    name: 'Head Chef',
    workspace: 'kitchen',
    tenantScoped: true,
    permissions: ['kitchen.view', 'kot.update', 'recipe.view', 'inventory.view', 'stock.issue']
  },
  {
    id: 'role-bartender',
    name: 'Bartender',
    workspace: 'bar',
    tenantScoped: true,
    permissions: ['bar.view', 'order.create', 'inventory.view', 'stock.issue']
  },
  {
    id: 'role-inventory',
    name: 'Inventory Manager',
    workspace: 'inventory',
    tenantScoped: true,
    permissions: ['inventory.view', 'stock.manage', 'po.create', 'grn.create', 'transfer.manage']
  },
  {
    id: 'role-cashier',
    name: 'Cashier',
    workspace: 'cashier',
    tenantScoped: true,
    permissions: ['cashier.view', 'payment.process', 'invoice.create', 'bill.view']
  },
  {
    id: 'role-waiter',
    name: 'Floor Server',
    workspace: 'waiter',
    tenantScoped: true,
    permissions: ['floor.view', 'order.create', 'session.view', 'bill.view']
  },
  {
    id: 'role-retail-manager',
    name: 'Retail Manager',
    workspace: 'retail',
    tenantScoped: true,
    permissions: ['retail.view', 'retail.sale', 'inventory.view', 'stock.transfer']
  }
];

// Legacy / synonym ids collapse onto a canonical entry so pre-existing rows
// (e.g. `role-bar`, `role-inventory-manager`) continue to resolve.
export const ROLE_ALIASES = {
  'role-bar': 'role-bartender',
  'role-inventory-manager': 'role-inventory',
  'role-accountant': 'role-ca',
  'role-general-manager': 'role-admin',
  'role-super-admin': 'role-superadmin'
};

const _byId = new Map(ROLE_CATALOG.map((r) => [r.id, r]));

/** Collapse a possibly-legacy role id to its canonical form (idempotent). */
export function normalizeRoleId(roleId) {
  if (!roleId) return roleId;
  const lower = String(roleId).toLowerCase();
  return ROLE_ALIASES[lower] || lower;
}

/** Look up a catalog role, resolving aliases. Returns undefined if unknown. */
export function getCatalogRole(roleId) {
  return _byId.get(normalizeRoleId(roleId));
}

/** All catalog roles (shallow copy; safe to iterate). */
export function listCatalogRoles() {
  return ROLE_CATALOG.slice();
}

/**
 * True if `roleId` may perform `permission`. Superadmin/admin/owner hold '*'.
 * An unknown role is treated as the least-privileged (no permissions), so a
 * typo can never accidentally grant access.
 */
export function catalogHasPermission(roleId, permission) {
  const role = getCatalogRole(roleId);
  if (!role) return false;
  if (role.permissions.includes('*')) return true;
  return role.permissions.includes(permission);
}

/** The workspace a role routes to; unknown roles default to 'waiter'. */
export function catalogWorkspaceFor(roleId) {
  return (getCatalogRole(roleId) || { workspace: 'waiter' }).workspace;
}

/**
 * Observatory (Observability Control Center) access allowlist. Restricted to
 * superadmin + owner by EXPLICIT role id, NOT the '*' permission, because
 * role-admin also holds '*' but must not see cross-device diagnostics. Unknown
 * roles fail closed.
 */
const OBSERVATORY_ALLOWED_ROLES = ['role-superadmin', 'role-owner'];
export function canAccessObservatory(roleId) {
  return OBSERVATORY_ALLOWED_ROLES.includes(normalizeRoleId(roleId));
}

export default ROLE_CATALOG;