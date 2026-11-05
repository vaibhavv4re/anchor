/**
 * Phase 6 - CA read-only enforcement (plan Test Plan: "CA write-denied").
 *
 * The Accounts & CA workspace is shared by auditors (role-ca, read-only) and
 * tenant admins (write). Enforcement is by permission, not UI hiding. This
 * checks the view's decision primitives directly:
 *   - _isReadOnly() is true for CA (and unknown roles) and false for admin/owner;
 *   - _guardWrite() refuses mutating handlers for CA but allows admins;
 *   - the underlying rbacEngine.hasPermission('role-ca', 'accounting.write') is
 *     the single authority that both the view and the nav use.
 */
import { rbacEngine } from '../businessos/platform/authorization/rbacEngine.js';
import { AccountsCaWorkspaceView } from '../restaurantos/frontend/capabilities/accounting/ui/AccountsCaWorkspaceView.js';

let failures = 0;
const check = (label, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'} ${label}`);
  if (!cond) failures++;
};

function viewAs(roleId) {
  const v = new AccountsCaWorkspaceView({});
  v._roleId = roleId; // as _resolveSessionRole would set it from the session
  return v;
}

function main() {
  // 1. The permission primitive the whole system keys on.
  check('rbacEngine denies accounting.write to CA', rbacEngine.hasPermission('role-ca', 'accounting.write') === false);
  check('rbacEngine allows accounting.view to CA', rbacEngine.hasPermission('role-ca', 'accounting.view') === true);
  check('rbacEngine allows export.generate to CA', rbacEngine.hasPermission('role-ca', 'export.generate') === true);
  check('rbacEngine allows accounting.write to admin', rbacEngine.hasPermission('role-admin', 'accounting.write') === true);
  check('rbacEngine allows accounting.write to owner', rbacEngine.hasPermission('role-owner', 'accounting.write') === true);
  // Legacy alias collapses to the same read-only CA.
  check('rbacEngine denies accounting.write to role-accountant alias', rbacEngine.hasPermission('role-accountant', 'accounting.write') === false);

  // 2. View read-only decision per role.
  check('CA view is read-only', viewAs('role-ca')._isReadOnly() === true);
  check('admin view is NOT read-only', viewAs('role-admin')._isReadOnly() === false);
  check('owner view is NOT read-only', viewAs('role-owner')._isReadOnly() === false);
  check('unknown role view fails closed (read-only)', viewAs('role-mystery')._isReadOnly() === true);

  // 3. Write-guard behaviour (no alert in Node, so it must simply not throw).
  check('CA guard blocks writes', viewAs('role-ca')._guardWrite() === false);
  check('admin guard permits writes', viewAs('role-admin')._guardWrite() === true);

  console.log(failures === 0 ? '\nCA READ-ONLY ENFORCEMENT: PASS' : `\nCA READ-ONLY ENFORCEMENT: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
