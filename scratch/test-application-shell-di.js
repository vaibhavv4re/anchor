import { createApplicationContainer } from '../businessos/platform/container/applicationContainer.js';
import { ApplicationShell } from '../restaurantos/frontend/app.js';

console.log('====================================================');
console.log('APPLICATION SHELL DI BOOTSTRAP TEST (LIVE APP.JS)');
console.log('====================================================\n');

try {
  const mockOfflineStore = {
    collections: { employees: [], tables_master: [], tenants: [] },
    getCollection(name) { return this.collections[name] || []; },
    setCollection(name, data) { this.collections[name] = data; },
    appendItem(name, item) { (this.collections[name] = this.collections[name] || []).push(item); return item; }
  };

  const appContainer = createApplicationContainer({
    offlineStore: mockOfflineStore,
    isOnline: true
  });

  console.log('Test 1: MODULAR CALLER (INJECTED VIA APPDEPENDENCIES)');
  const modularShell = new ApplicationShell(appContainer.appDependencies);

  const t1Passed = modularShell.authEngine === appContainer.authEngine &&
                   modularShell.platformEventBus === appContainer.platformEventBus &&
                   modularShell.repositories === appContainer.repositories &&
                   modularShell.repositories.inventory !== undefined;
  console.log(`  ${t1Passed ? '✓' : '✗'} Modular ApplicationShell constructed via appDependencies injection bundle`);

  console.log('\nTest 2: LEGACY CALLER (FALLBACK TO IMPORTED SINGLETONS)');
  const legacyShell = new ApplicationShell();

  const t2Passed = legacyShell.authEngine !== undefined &&
                   legacyShell.platformEventBus !== undefined &&
                   legacyShell.rbacEngine !== undefined;
  console.log(`  ${t2Passed ? '✓' : '✗'} Legacy ApplicationShell constructed via singleton fallbacks`);

  console.log('\n====================================================');
  if (t1Passed && t2Passed) {
    console.log('RESULT: PASS (ApplicationShell DISeam & Backward Compatibility Verified)');
  } else {
    console.log('RESULT: FAIL (ApplicationShell DI issue)');
  }
  console.log('====================================================');

} catch (err) {
  console.error('FATAL ERROR DURING SHELL DI TEST:', err);
  process.exit(1);
}
