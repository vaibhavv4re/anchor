/**
 * Phase 6 - Role-catalog consistency (plan Test Plan: "role-id parity across
 * rbac/UI/router" + "role-catalog consistency").
 *
 * The catalog is the single source of truth for role ids/permissions. This
 * guards the root-cause fixes: no duplicate ids, every legacy/synonym id
 * collapses to a canonical one via normalizeRoleId, CA is read-only by
 * construction, and privileged roles hold '*'. A drift that reintroduces
 * role-bar / role-inventory-manager as primaries, or widens CA, fails here.
 */
import {
  ROLE_CATALOG,
  ROLE_ALIASES,
  normalizeRoleId,
  getCatalogRole,
  listCatalogRoles,
  catalogHasPermission,
  catalogWorkspaceFor
} from '../businessos/platform/authorization/roleCatalog.js';

let failures = 0;
const check = (label, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'} ${label}`);
  if (!cond) failures++;
};

function main() {
  // 1. Structure integrity.
  const ids = ROLE_CATALOG.map((r) => r.id);
  check('every catalog id is prefixed role-', ids.every((id) => id.startsWith('role-')));
  check('no duplicate catalog ids', new Set(ids).size === ids.length);
  check('every catalog role has a non-empty workspace', ROLE_CATALOG.every((r) => typeof r.workspace === 'string' && r.workspace.length > 0));
  check('every catalog role has a permissions array', ROLE_CATALOG.every((r) => Array.isArray(r.permissions)));
  check('listCatalogRoles returns a defensive copy', listCatalogRoles() !== ROLE_CATALOG && listCatalogRoles().length === ROLE_CATALOG.length);

  // 2. Legacy / synonym ids collapse to canonical primaries (role-id drift fix).
  const aliasPairs = [
    ['role-bar', 'role-bartender'],
    ['role-inventory-manager', 'role-inventory'],
    ['role-accountant', 'role-ca'],
    ['role-general-manager', 'role-admin'],
    ['role-super-admin', 'role-superadmin']
  ];
  aliasPairs.forEach(([legacy, canonical]) => {
    check(`normalizeRoleId collapses ${legacy} -> ${canonical}`, normalizeRoleId(legacy) === canonical);
    check(`legacy ${legacy} is NOT a catalog primary`, !ids.includes(legacy));
    check(`canonical ${canonical} resolves in the catalog`, !!getCatalogRole(canonical));
  });
  check('normalizeRoleId is idempotent on canonical ids', ids.every((id) => normalizeRoleId(id) === id));

  // 3. CA is deliberately read-only: view/report/export only, no write authority.
  const ca = getCatalogRole('role-ca');
  const writeish = (p) => /write|create|update|delete|edit|manage|approve|reset|\.issue|\.transfer|\.lock/.test(p);
  check('CA permissions are non-empty', ca && ca.permissions.length > 0);
  check('CA holds NO write/mutating permission', ca.permissions.every((p) => !writeish(p)));
  check('CA can view accounting', catalogHasPermission('role-ca', 'accounting.view') === true);
  check('CA can export', catalogHasPermission('role-ca', 'export.generate') === true);
  check('CA cannot write accounting', catalogHasPermission('role-ca', 'accounting.write') === false);
  check('CA cannot create users', catalogHasPermission('role-ca', 'user.create') === false);
  // Alias role-accountant resolves to the same read-only CA.
  check('role-accountant alias is read-only too', catalogHasPermission('role-accountant', 'accounting.write') === false);

  // 4. Privileged roles hold the wildcard (tenant-scoped by RLS, not by perms).
  ['role-superadmin', 'role-admin', 'role-owner'].forEach((id) => {
    check(`${id} holds '*' (can write any surface)`, catalogHasPermission(id, 'accounting.write') === true && catalogHasPermission(id, 'anything.at.all') === true);
  });

  // 5. Least-privilege fail-closed: unknown role grants nothing.
  check('unknown role has no permissions', catalogHasPermission('role-does-not-exist', 'accounting.view') === false);
  check('unknown role workspace falls back to waiter', catalogWorkspaceFor('role-does-not-exist') === 'waiter');

  // 6. Router/UI parity: catalogWorkspaceFor matches each role's declared workspace.
  check('catalogWorkspaceFor mirrors role.workspace for every entry', ROLE_CATALOG.every((r) => catalogWorkspaceFor(r.id) === r.workspace));

  console.log(failures === 0 ? '\nROLE CATALOG CONSISTENCY: PASS' : `\nROLE CATALOG CONSISTENCY: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
