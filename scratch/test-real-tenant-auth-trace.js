import { createApplication } from '../restaurantos/frontend/bootstrap.js';

console.log('====================================================================');
console.log('STEP 17.12A REAL SUPABASE TENANT AUTHENTICATION TRACE TEST');
console.log('====================================================================\n');

async function runTenantAuthTraceSuite() {
  try {
    const targetTenantId = 'tenant_h0qc7wf';

    const mockOfflineStore = {
      collections: {
        tenants: [
          { tenant_id: targetTenantId, name: 'Anchor Cafe (Main Branch)', admin_name: 'Jitu' }
        ],
        identities: [],
        employees: [
          { id: 'emp-eo32w', identity_id: 'id-x4qi6', tenant_id: targetTenantId, employee_code: 'EMP-00002', name: 'Aabhas', role_id: 'role-chef', workspace_default: 'kitchen', status: 'ACTIVE', data: { pinDisplay: '111111' } },
          { id: 'emp-6rh56', identity_id: 'id-7hfgy', tenant_id: targetTenantId, employee_code: 'EMP-00003', name: 'Suresh', role_id: 'role-waiter', workspace_default: 'waiter', status: 'ACTIVE', data: { pinDisplay: '222222' } },
          { id: 'emp-ocqsq', identity_id: 'id-12aud', tenant_id: targetTenantId, employee_code: 'EMP-00004', name: 'Kirtan', role_id: 'role-inventory', workspace_default: 'inventory', status: 'ACTIVE', data: { pinDisplay: '333333' } },
          { id: 'emp-udb5t', identity_id: 'id-5f5kk', tenant_id: targetTenantId, employee_code: 'EMP-00005', name: 'Sibu', role_id: 'role-bartender', workspace_default: 'bar', status: 'ACTIVE', data: { pinDisplay: '555555' } },
          { id: 'emp-wia42', identity_id: 'id-asoyu', tenant_id: targetTenantId, employee_code: 'EMP-00006', name: 'Jitu', role_id: 'role-cashier', workspace_default: 'cashier', status: 'ACTIVE', data: { pinDisplay: '666666' } }
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
    await dataGateway.hydrateCollections(['tenants', 'identities', 'employees'], targetTenantId);
    console.log('  ✓ Hydration completed via DataGateway');

    const realTenantEmployees = [
      { name: 'Aabhas', pin: '111111', roleId: 'role-chef', expectedWorkspace: 'kitchen' },
      { name: 'Suresh', pin: '222222', roleId: 'role-waiter', expectedWorkspace: 'waiter' },
      { name: 'Kirtan', pin: '333333', roleId: 'role-inventory', expectedWorkspace: 'inventory' },
      { name: 'Sibu', pin: '555555', roleId: 'role-bartender', expectedWorkspace: 'bar' },
      { name: 'Jitu', pin: '666666', roleId: 'role-cashier', expectedWorkspace: 'cashier' }
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
