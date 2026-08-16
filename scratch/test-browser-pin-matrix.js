import { createApplication } from '../restaurantos/frontend/bootstrap.js';
import { hashPin } from '../businessos/platform/identity/identityModel.js';

console.log('====================================================================');
console.log('STEP 17.11 BROWSER EMPLOYEE PIN MATRIX ACCEPTANCE SUITE');
console.log('====================================================================\n');

async function runPinMatrixSuite() {
  try {
    const pin888888Hash = await hashPin('888888');
    const pin999999Hash = await hashPin('999999');
    const chefPinHash = await hashPin('555555');
    const invMgrPinHash = await hashPin('777777');
    const waiterPinHash = await hashPin('111111');

    const mockOfflineStore = {
      collections: {
        identities: [
          { id: 'id-superadmin', pinHash: pin888888Hash, status: 'ACTIVE' },
          { id: 'id-gm', pinHash: pin999999Hash, status: 'ACTIVE' },
          { id: 'id-chef', pinHash: chefPinHash, status: 'ACTIVE' },
          { id: 'id-inv-mgr', pinHash: invMgrPinHash, status: 'ACTIVE' },
          { id: 'id-waiter', pinHash: waiterPinHash, status: 'ACTIVE' }
        ],
        employees: [
          { id: 'emp-superadmin', identityId: 'id-superadmin', name: 'Super Admin', roleId: 'role-superadmin', avatarUrl: 'superadmin.jpg' },
          { id: 'emp-gm', identityId: 'id-gm', name: 'GM Victoria', roleId: 'role-admin', avatarUrl: 'gm.jpg' },
          { id: 'emp-chef', identityId: 'id-chef', name: 'Chef Auguste', roleId: 'role-chef', avatarUrl: 'chef.jpg' },
          { id: 'emp-inv-mgr', identityId: 'id-inv-mgr', name: 'Priya Mehta (Inv Mgr)', roleId: 'role-manager', avatarUrl: 'priya.jpg' },
          { id: 'emp-waiter', identityId: 'id-waiter', name: 'Rahul Sharma', roleId: 'role-waiter', avatarUrl: 'rahul.jpg' }
        ],
        roles: [
          { id: 'role-superadmin', name: 'Super Admin', workspace: 'admin', permissions: ['*'] },
          { id: 'role-admin', name: 'Admin', workspace: 'admin', permissions: ['user.create', 'config.edit'] },
          { id: 'role-chef', name: 'Head Chef', workspace: 'kitchen', permissions: ['kitchen.view'] },
          { id: 'role-manager', name: 'Manager', workspace: 'manager', permissions: ['override.lock', 'kitchen.view'] },
          { id: 'role-waiter', name: 'Waiter', workspace: 'waiter', permissions: ['floor.view', 'order.create'] }
        ],
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

    const authEngine = appGraph.application.authEngine;
    const shell = appGraph.shell;

    const testCases = [
      { pin: '888888', expectedName: 'Super Admin', expectedRole: 'Super Admin', expectedWorkspace: 'admin' },
      { pin: '999999', expectedName: 'GM Victoria', expectedRole: 'Admin', expectedWorkspace: 'admin' },
      { pin: '555555', expectedName: 'Chef Auguste', expectedRole: 'Head Chef', expectedWorkspace: 'kitchen' },
      { pin: '777777', expectedName: 'Priya Mehta (Inv Mgr)', expectedRole: 'Manager', expectedWorkspace: 'manager' },
      { pin: '111111', expectedName: 'Rahul Sharma', expectedRole: 'Waiter', expectedWorkspace: 'waiter' }
    ];

    let passedCount = 0;

    console.log('1. EMPLOYEE AUTHENTICATION & WORKSPACE MATRIX TEST');
    for (const tc of testCases) {
      authEngine.logout();
      const res = await authEngine.authenticate(tc.pin, 'DEV-TERMINAL-01');
      const pass = res.success &&
                   res.session.employeeName === tc.expectedName &&
                   res.session.roleName === tc.expectedRole &&
                   res.session.workspace === tc.expectedWorkspace;

      if (pass) passedCount++;
      console.log(`  ${pass ? '✓' : '✗'} PIN "${tc.pin}" -> ${res.session?.employeeName} (${res.session?.roleName}) => Workspace: "${res.session?.workspace}"`);
    }

    console.log('\n2. REJECT INVALID PIN TEST (PIN: 000000)');
    authEngine.logout();
    const invalidRes = await authEngine.authenticate('000000', 'DEV-TERMINAL-01');
    const invalidPassed = !invalidRes.success && invalidRes.error === 'Invalid PIN' && authEngine.getCurrentSession() === null;
    console.log(`  ${invalidPassed ? '✓' : '✗'} Invalid PIN "000000" rejected cleanly ("${invalidRes.error}")`);

    console.log('\n====================================================================');
    if (passedCount === testCases.length && invalidPassed) {
      console.log('PIN MATRIX RESULT: PASS 🎯 (All 6 PIN Scenarios Passed via DataGateway & Modular Shell)');
    } else {
      console.log('PIN MATRIX RESULT: FAIL');
    }
    console.log('====================================================================');

  } catch (err) {
    console.error('FATAL ERROR DURING PIN MATRIX SUITE:', err);
    process.exit(1);
  }
}

runPinMatrixSuite();
