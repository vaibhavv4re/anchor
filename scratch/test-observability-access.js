/**
 * Observability - Control Center access control (headless).
 * The observatory is owner/superadmin-only, gated by EXPLICIT role id (not the
 * '*' permission), so role-admin (which also holds '*') is correctly excluded.
 * Unknown roles fail closed.
 */
import { canAccessObservatory } from '../businessos/platform/authorization/roleCatalog.js';

let failures = 0;
const check = (label, cond) => { console.log(`  ${cond ? 'PASS' : 'FAIL'} ${label}`); if (!cond) failures++; };

function main() {
  // Allowed.
  check('superadmin allowed', canAccessObservatory('role-superadmin') === true);
  check('owner allowed', canAccessObservatory('role-owner') === true);

  // Denied: every operational role, and crucially role-admin (holds '*' but is excluded).
  check('admin denied despite holding *', canAccessObservatory('role-admin') === false);
  check('manager denied', canAccessObservatory('role-manager') === false);
  check('ca denied', canAccessObservatory('role-ca') === false);
  check('chef denied', canAccessObservatory('role-chef') === false);
  check('waiter denied', canAccessObservatory('role-waiter') === false);
  check('cashier denied', canAccessObservatory('role-cashier') === false);

  // Legacy alias collapses to canonical (deny/allow still correct).
  check('legacy alias role-super-admin allowed', canAccessObservatory('role-super-admin') === true);

  // Fail-closed on unknown / empty.
  check('unknown role denied', canAccessObservatory('role-does-not-exist') === false);
  check('empty role denied', canAccessObservatory('') === false);
  check('undefined role denied', canAccessObservatory(undefined) === false);

  console.log(failures === 0 ? '\nOBSERVATORY ACCESS: PASS' : `\nOBSERVATORY ACCESS: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
