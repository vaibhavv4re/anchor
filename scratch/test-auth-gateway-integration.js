import { createApplication } from '../restaurantos/frontend/bootstrap.js';
import { hashPin } from '../businessos/platform/identity/identityModel.js';

console.log('====================================================');
console.log('STEP 17.10 REALTIME AUTHENTICATION GATEWAY TEST');
console.log('====================================================\n');

async function runAuthSuite() {
  try {
    const chefPinHash = await hashPin('555555');
    const gmPinHash = await hashPin('999999');

    const mockOfflineStore = {
      collections: {
        identities: [
          { id: 'id-chef-01', pinHash: chefPinHash, status: 'ACTIVE' },
          { id: 'id-gm-01', pinHash: gmPinHash, status: 'ACTIVE' }
        ],
        employees: [
          { id: 'emp-chef-01', identityId: 'id-chef-01', name: 'Chef Auguste', roleId: 'role-head-chef', avatarUrl: 'chef.jpg' },
          { id: 'emp-gm-01', identityId: 'id-gm-01', name: 'GM Victoria', roleId: 'role-admin-gm', avatarUrl: 'gm.jpg' }
        ],
        roles: [
          { id: 'role-head-chef', name: 'Head Chef', workspace: 'kitchen', permissions: ['kitchen.*'] },
          { id: 'role-admin-gm', name: 'General Manager', workspace: 'admin', permissions: ['*'] }
        ],
        sessions: []
      },
      getCollection(name) { return this.collections[name] || []; },
      setCollection(name, data) { this.collections[name] = data; },
      appendItem(name, item) { (this.collections[name] = this.collections[name] || []).push(item); return item; }
    };

    // 1. Instantiate Application Composition Graph
    const appGraph = createApplication({
      offlineStore: mockOfflineStore,
      isOnline: true
    });

    const authEngine = appGraph.application.authEngine;

    console.log('Test 1: AUTHENTICATE HEAD CHEF VIA DATAGATEWAY (PIN: 555555)');
    const chefResult = await authEngine.authenticate('555555', 'DEV-KITCHEN-01');
    const a1Passed = chefResult.success &&
                     chefResult.session &&
                     chefResult.session.employeeName === 'Chef Auguste' &&
                     chefResult.session.workspace === 'kitchen' &&
                     chefResult.session.roleName === 'Head Chef';
    console.log(`  ${a1Passed ? '✓' : '✗'} Head Chef authenticated via DataGateway (Name: "${chefResult.session?.employeeName}", Workspace: "${chefResult.session?.workspace}")`);

    console.log('\nTest 2: AUTHENTICATE GENERAL MANAGER VIA DATAGATEWAY (PIN: 999999)');
    const gmResult = await authEngine.authenticate('999999', 'DEV-ADMIN-01');
    const a2Passed = gmResult.success &&
                     gmResult.session &&
                     gmResult.session.employeeName === 'GM Victoria' &&
                     gmResult.session.workspace === 'admin';
    console.log(`  ${a2Passed ? '✓' : '✗'} GM authenticated via DataGateway (Name: "${gmResult.session?.employeeName}", Workspace: "${gmResult.session?.workspace}")`);

    console.log('\nTest 3: REJECT UNREGISTERED / INVALID PIN (PIN: 000000)');
    const invalidResult = await authEngine.authenticate('000000');
    const a3Passed = !invalidResult.success && invalidResult.error === 'Invalid PIN';
    console.log(`  ${a3Passed ? '✓' : '✗'} Unregistered PIN correctly rejected ("${invalidResult.error}")`);

    console.log('\nTest 4: APPLYSHELL WORKSPACE ROUTING INTEGRATION');
    const shell = appGraph.shell;
    const currentSession = shell.authEngine.getCurrentSession();
    const a4Passed = currentSession && currentSession.employeeName === 'GM Victoria';
    console.log(`  ${a4Passed ? '✓' : '✗'} ApplicationShell sees active session from AuthEngine ("${currentSession?.employeeName}")`);

    console.log('\n====================================================');
    if (a1Passed && a2Passed && a3Passed && a4Passed) {
      console.log('REALTIME AUTH RESULT: PASS 🔐 (AuthEngine & IdentityModel Decoupled to DataGateway)');
    } else {
      console.log('REALTIME AUTH RESULT: FAIL');
    }
    console.log('====================================================');

  } catch (err) {
    console.error('FATAL ERROR DURING AUTHENTICATION GATEWAY TEST:', err);
    process.exit(1);
  }
}

runAuthSuite();
