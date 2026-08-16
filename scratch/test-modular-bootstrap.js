import { createApplication, startModularApp } from '../restaurantos/frontend/bootstrap.js';
import { PlatformContainer } from '../businessos/platform/platformContainer.js';
import { ApplicationContainer } from '../businessos/platform/container/applicationContainer.js';

console.log('====================================================');
console.log('MODULAR APPLICATION BOOTSTRAP INTEGRATION TEST');
console.log('====================================================\n');

try {
  const mockOfflineStore = {
    collections: { inventory: [], employees: [], tables_master: [], tenants: [] },
    getCollection(name) { return this.collections[name] || []; },
    setCollection(name, data) { this.collections[name] = data; },
    appendItem(name, item) { (this.collections[name] = this.collections[name] || []).push(item); return item; }
  };

  console.log('Test 1: CREATEAPPLICATION INSTANTIATION');
  const appGraph = createApplication({
    offlineStore: mockOfflineStore,
    isOnline: true
  });

  const b1Passed = appGraph.platform instanceof PlatformContainer &&
                   appGraph.application instanceof ApplicationContainer &&
                   appGraph.shell !== null;
  console.log(`  ${b1Passed ? '✓' : '✗'} Complete modular runtime graph constructed`);

  console.log('\nTest 2: DATAGATEWAY & 14 REPOSITORIES REACHABLE');
  const repoKeys = Object.keys(appGraph.application.repositories);
  const b2Passed = appGraph.platform.dataGateway !== null &&
                   repoKeys.length === 14 &&
                   appGraph.application.repositories.inventory !== undefined &&
                   appGraph.application.repositories.table !== undefined;
  console.log(`  ${b2Passed ? '✓' : '✗'} DataGateway & all 14 repositories accessible via bootstrap (${repoKeys.length} repos)`);

  console.log('\nTest 3: INJECTED SERVICES VERIFICATION');
  const shell = appGraph.shell;
  const b3Passed = shell.authEngine === appGraph.application.authEngine &&
                   shell.platformEventBus === appGraph.application.platformEventBus &&
                   shell.rbacEngine === appGraph.application.rbacEngine &&
                   shell.repositories === appGraph.application.repositories;
  console.log(`  ${b3Passed ? '✓' : '✗'} ApplicationShell received injected services from ApplicationContainer`);

  console.log('\nTest 4: STARTMODULARAPP LIFESTYLE INITIALIZATION');
  const startedShell = startModularApp({
    offlineStore: mockOfflineStore,
    isOnline: true
  });
  const b4Passed = startedShell !== null && startedShell.activeWorkspace === 'waiter';
  console.log(`  ${b4Passed ? '✓' : '✗'} startModularApp successfully initialized ApplicationShell`);

  console.log('\n====================================================');
  if (b1Passed && b2Passed && b3Passed && b4Passed) {
    console.log('MODULAR BOOTSTRAP RESULT: PASS 🚀');
  } else {
    console.log('MODULAR BOOTSTRAP RESULT: FAIL');
  }
  console.log('====================================================');

} catch (err) {
  console.error('FATAL ERROR DURING MODULAR BOOTSTRAP TEST:', err);
  process.exit(1);
}
