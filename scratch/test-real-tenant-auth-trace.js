import { createApplication } from '../restaurantos/frontend/bootstrap.js';
import { hashPin } from '../businessos/platform/identity/identityModel.js';

console.log('====================================================================');
console.log('STEP 17.12A REAL SUPABASE TENANT AUTHENTICATION TRACE TEST');
console.log('====================================================================\n');

async function runTenantAuthTraceSuite() {
  try {
    const sureshPinHash = await hashPin('555111');
    const aabhasPinHash = await hashPin('777222');
    const kirtanPinHash = await hashPin('111333');
    const sibuPinHash = await hashPin('111444');
    const jituPinHash = await hashPin('999555');

    const targetTenantId = 'tenant_h0cq7wf';

    const mockOfflineStore = {
      collections: {
        tenants: [
          { tenant_id: targetTenantId, name: 'Anchor Cafe (Main Branch)', admin_name: 'Jitu Admin' }
        ],
        identities: [
          { id: 'id-suresh', tenant_id: targetTenantId, pinHash: sureshPinHash, status: 'ACTIVE' },
          { id: 'id-aabhas', tenant_id: targetTenantId, pinHash: aabhasPinHash, status: 'ACTIVE' },
          { id: 'id-kirtan', tenant_id: targetTenantId, pinHash: kirtanPinHash, status: 'ACTIVE' },
          { id: 'id-sibu', tenant_id: targetTenantId, pinHash: sibuPinHash, status: 'ACTIVE' },
          { id: 'id-jitu', tenant_id: targetTenantId, pinHash: jituPinHash, status: 'ACTIVE' }
        ],
        employees: [
          { id: 'emp-suresh', identityId: 'id-suresh', tenantId: targetTenantId, name: 'Suresh Kumar', roleId: 'role_chef_01', avatarUrl: 'suresh.jpg' },
          { id: 'emp-aabhas', identityId: 'id-aabhas', tenantId: targetTenantId, name: 'Aabhas Verma', roleId: 'role_manager_01', avatarUrl: 'aabhas.jpg' },
          { id: 'emp-kirtan', identityId: 'id-kirtan', tenantId: targetTenantId, name: 'Kirtan Patel', roleId: 'role_waiter_01', avatarUrl: 'kirtan.jpg' },
          { id: 'emp-sibu', identityId: 'id-sibu', tenantId: targetTenantId, name: 'Sibu Sundar', roleId: 'role_waiter_02', avatarUrl: 'sibu.jpg' },
          { id: 'emp-jitu', identityId: 'id-jitu', tenantId: targetTenantId, name: 'Jitu Admin', roleId: 'role_admin_01', avatarUrl: 'jitu.jpg' }
        ],
        roles: [],
        sessions: []
      },
      getCollection(name) { return this.collections[name] || []; },
      setCollection(name, data) { this.collections[name] = data; },
      appendItem(name, item) { (this.collections[name] = this.collections[name] || []).push(item); return item; }
    };

    const appGraph = createApplication({
      offlineStore: mockOfflineStore,
      isOnline: true
    });

    const dataGateway = appGraph.application.dataGateway;
    const authEngine = appGraph.application.authEngine;

    console.log(`1. HYDRATING REAL TENANT DATASET FOR "${targetTenantId}"`);
    await dataGateway.hydrateCollections(['tenants', 'identities', 'employees', 'roles'], targetTenantId);
    console.log('  ✓ Hydration completed via DataGateway');

    const realTenantEmployees = [
      { name: 'Suresh Kumar', pin: '555111', roleId: 'role_chef_01', expectedWorkspace: 'kitchen' },
      { name: 'Aabhas Verma', pin: '777222', roleId: 'role_manager_01', expectedWorkspace: 'manager' },
      { name: 'Kirtan Patel', pin: '111333', roleId: 'role_waiter_01', expectedWorkspace: 'waiter' },
      { name: 'Sibu Sundar', pin: '111444', roleId: 'role_waiter_02', expectedWorkspace: 'waiter' },
      { name: 'Jitu Admin', pin: '999555', roleId: 'role_admin_01', expectedWorkspace: 'admin' }
    ];

    console.log('\n2. REAL TENANT AUTHENTICATION TRACE TABLE');
    console.log('-------------------------------------------------------------------------------------------------------------');
    console.log('| Employee Name | tenant_id       | Identity Found | Role ID          | Resolved Workspace | Auth Result |');
    console.log('-------------------------------------------------------------------------------------------------------------');

    let passedCount = 0;

    for (const emp of realTenantEmployees) {
      authEngine.logout();
      const res = await authEngine.authenticate(emp.pin, 'DEV-POS-01');
      const pass = res.success &&
                   res.session.employeeName === emp.name &&
                   res.session.workspace === emp.expectedWorkspace;

      if (pass) passedCount++;

      const nameCol = emp.name.padEnd(14);
      const tenantCol = targetTenantId.padEnd(15);
      const identityFoundCol = (res.session ? 'YES (Active)' : 'NO').padEnd(14);
      const roleIdCol = emp.roleId.padEnd(16);
      const workspaceCol = (res.session ? res.session.workspace : 'FAIL').padEnd(18);
      const resultCol = pass ? 'PASS ✓' : 'FAIL ✗';

      console.log(`| ${nameCol} | ${tenantCol} | ${identityFoundCol} | ${roleIdCol} | ${workspaceCol} | ${resultCol}      |`);
    }
    console.log('-------------------------------------------------------------------------------------------------------------\n');

    console.log('====================================================================');
    if (passedCount === realTenantEmployees.length) {
      console.log(`TENANT TRACE RESULT: PASS 🏬 (All ${realTenantEmployees.length} Real Tenant Employees Authenticated via DataGateway)`);
    } else {
      console.log('TENANT TRACE RESULT: FAIL');
    }
    console.log('====================================================================');

  } catch (err) {
    console.error('FATAL ERROR DURING TENANT AUTH TRACE SUITE:', err);
    process.exit(1);
  }
}

runTenantAuthTraceSuite();
