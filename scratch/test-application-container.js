import { ApplicationContainer, createApplicationContainer } from '../businessos/platform/container/applicationContainer.js';
import { PlatformContainer } from '../businessos/platform/platformContainer.js';

console.log('====================================================');
console.log('APPLICATION CONTAINER COMPOSITION ROOT TEST');
console.log('====================================================\n');

try {
  const mockOfflineStore = {
    collections: { inventory: [], employees: [], tables_master: [], tenants: [] },
    getCollection(name) { return this.collections[name] || []; },
    setCollection(name, data) { this.collections[name] = data; },
    appendItem(name, item) { (this.collections[name] = this.collections[name] || []).push(item); return item; }
  };

  const appContainer = createApplicationContainer({
    offlineStore: mockOfflineStore,
    isOnline: true
  });

  console.log('Test 1: PLATFORM CONTAINER & DATAGATEWAY INTEGRATION');
  const t1Passed = appContainer.platform instanceof PlatformContainer &&
                   appContainer.dataGateway !== null &&
                   appContainer.dataGateway === appContainer.platform.dataGateway;
  console.log(`  ${t1Passed ? '✓' : '✗'} ApplicationContainer holds valid PlatformContainer & DataGateway reference`);

  console.log('\nTest 2: ALL 14 REPOSITORIES EXPOSED VIA CONTAINER');
  const repoKeys = Object.keys(appContainer.repositories);
  const t2Passed = repoKeys.length === 14 &&
                   appContainer.getRepository('inventory') !== null &&
                   appContainer.getRepository('table') !== null &&
                   appContainer.getRepository('tenant') !== null;
  console.log(`  ${t2Passed ? '✓' : '✗'} All 14 Repositories exposed via ApplicationContainer (${repoKeys.join(', ')})`);

  console.log('\nTest 3: APPLICATION SERVICES BUNDLE EXPOSED');
  const deps = appContainer.appDependencies;
  const t3Passed = deps.authEngine !== undefined &&
                   deps.rbacEngine !== undefined &&
                   deps.notificationEngine !== undefined &&
                   deps.platformEventBus !== undefined;
  console.log(`  ${t3Passed ? '✓' : '✗'} Application services bundle wired successfully (authEngine, rbacEngine, notificationEngine, platformEventBus)`);

  console.log('\nTest 4: STRICT ONE-WAY ARCHITECTURE VALIDATION');
  const platform = appContainer.platform;
  const t4Passed = platform.authEngine === undefined &&
                   platform.applicationContainer === undefined &&
                   platform.ui === undefined;
  console.log(`  ${t4Passed ? '✓' : '✗'} PlatformContainer contains zero application or UI layer leaks (Strict one-way dependency flow holding)`);

  console.log('\n====================================================');
  if (t1Passed && t2Passed && t3Passed && t4Passed) {
    console.log('RESULT: PASS (ApplicationContainer Composition Root Verified)');
  } else {
    console.log('RESULT: FAIL (ApplicationContainer issue)');
  }
  console.log('====================================================');

} catch (err) {
  console.error('FATAL ERROR DURING APPLICATION CONTAINER TEST:', err);
  process.exit(1);
}
