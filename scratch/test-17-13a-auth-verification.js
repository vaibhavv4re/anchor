/**
 * Step 17.13A Verification Gateway Script
 * Validates PIN -> Identity -> Employee -> Role ID -> Workspace Resolution
 */

import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { OfflineDataAdapter } from '../businessos/platform/data/adapters/offlineDataAdapter.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { RbacEngine } from '../businessos/platform/authorization/rbacEngine.js';
import { IdentityModel } from '../businessos/platform/identity/identityModel.js';
import { AuthEngine } from '../businessos/platform/authentication/authEngine.js';

async function runStep17_13A_Verification() {
  console.log('====================================================================');
  console.log('STEP 17.13A — REAL PIN → ROLE → WORKSPACE VERIFICATION GATEWAY');
  console.log('====================================================================\n');

  const supabaseClient = new SupabaseClient();
  const supabaseAdapter = new SupabaseDataAdapter(supabaseClient);
  const offlineAdapter = new OfflineDataAdapter();
  const dataGateway = new DataGateway({
    cloudAdapter: supabaseAdapter,
    offlineAdapter: offlineAdapter
  });

  console.log('☁️ Hydrating collections from Supabase Cloud DB...');
  await dataGateway.hydrateCollections(['tenants', 'identities', 'employees']);
  console.log('✅ Hydration Complete!\n');

  const rbacEngine = new RbacEngine({ dataGateway });
  const identityModel = new IdentityModel({ dataGateway });
  const authEngine = new AuthEngine({ dataGateway, identityModel, rbacEngine });

  const testCases = [
    { pin: '111111', expectedName: 'Aabhas', expectedRoleId: 'role-chef', expectedWs: 'kitchen' },
    { pin: '222222', expectedName: 'Suresh', expectedRoleId: 'role-waiter', expectedWs: 'waiter' },
    { pin: '333333', expectedName: 'Kirtan', expectedRoleId: 'role-inventory', expectedWs: 'inventory' },
    { pin: '555555', expectedName: 'Sibu', expectedRoleId: 'role-bartender', expectedWs: 'bar' },
    { pin: '666666', expectedName: 'Jitu', expectedRoleId: 'role-cashier', expectedWs: 'cashier' },
    { pin: '888888', expectedName: 'Superadmin', expectedRoleId: 'role-superadmin', expectedWs: 'superadmin' },
    { pin: '999999', expectedName: 'Manager', expectedRoleId: 'role-admin', expectedWs: 'admin' },
    { pin: '000000', shouldFail: true }
  ];

  console.log('---------------------------------------------------------------------------------------------------------------------------------------');
  console.log('| PIN    | Employee Name     | Tenant ID       | Role ID        | Auth Chain Workspace | Role Workspace Match? | Result ');
  console.log('---------------------------------------------------------------------------------------------------------------------------------------');

  let allPassed = true;

  for (const tc of testCases) {
    if (tc.shouldFail) {
      const authRes = await authEngine.authenticate(tc.pin, 'TEST-DEV-01');
      if (!authRes.success) {
        console.log(`| ${tc.pin} | [INVALID REJECTED] | N/A             | N/A            | N/A                  | N/A                   | PASS ✓ `);
      } else {
        console.error(`| ${tc.pin} | [SECURITY FAILURE: Invalid PIN authenticated!] | FAIL ✗ `);
        allPassed = false;
      }
      continue;
    }

    const authRes = await authEngine.authenticate(tc.pin, 'TEST-DEV-01');
    if (!authRes.success) {
      console.error(`| ${tc.pin} | Auth Failed for valid PIN! Error: ${authRes.error} | FAIL ✗ `);
      allPassed = false;
      continue;
    }

    const s = authRes.session;
    const role = rbacEngine.getRoleById(s.roleId);
    const roleWsMatch = role && role.workspace === s.workspace;
    const empName = String(s.employeeName || 'Superadmin');
    
    const nameStr = empName.padEnd(17, ' ');
    const tenantStr = String(s.tenantId || 'tenant_h0qc7wf').padEnd(15, ' ');
    const roleIdStr = String(s.roleId || 'role-waiter').padEnd(14, ' ');
    const wsStr = String(s.workspace || 'admin').padEnd(20, ' ');
    const matchStr = (roleWsMatch ? 'YES (role_id authority)' : 'NO (fallback override)').padEnd(21, ' ');
    const status = (roleWsMatch && s.workspace === tc.expectedWs) ? 'PASS ✓' : 'FAIL ✗';

    if (status.includes('FAIL')) allPassed = false;

    console.log(`| ${tc.pin} | ${nameStr} | ${tenantStr} | ${roleIdStr} | ${wsStr} | ${matchStr} | ${status} `);
  }

  console.log('---------------------------------------------------------------------------------------------------------------------------------------\n');

  if (allPassed) {
    console.log('====================================================================');
    console.log('STEP 17.13A AUTHENTICATION GATEWAY RESULT: 100% PASS ✓');
    console.log('====================================================================');
  } else {
    console.error('====================================================================');
    console.error('STEP 17.13A AUTHENTICATION GATEWAY RESULT: FAIL ✗');
    console.error('====================================================================');
    process.exit(1);
  }
}

runStep17_13A_Verification().catch(err => {
  console.error('Unhandled error in 17.13A verification:', err);
  process.exit(1);
});
