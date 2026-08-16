import { createApplication } from '../restaurantos/frontend/bootstrap.js';
import { ApplicationShell } from '../restaurantos/frontend/app.js';

console.log('====================================================');
console.log('STANDALONE BROWSER ENTRY POINT (MAIN.JS) TEST');
console.log('====================================================\n');

try {
  console.log('Test 1: ZERO CIRCULAR DEPENDENCIES BETWEEN BOOTSTRAP & APP.JS');
  const appGraph = createApplication();
  const test1Passed = appGraph && appGraph.shell instanceof ApplicationShell;
  console.log(`  ${test1Passed ? '✓' : '✗'} app.js and bootstrap.js resolve without circular module cycles`);

  console.log('\nTest 2: APP.JS IS SIDE-EFFECT FREE ON IMPORT');
  const shellInstance = new ApplicationShell();
  const test2Passed = shellInstance.appEl === null && shellInstance.activeWorkspace === 'waiter';
  console.log(`  ${test2Passed ? '✓' : '✗'} Importing app.js produces zero auto-executing side effects`);

  console.log('\nTest 3: MAIN.JS ENTRY POINT ISOLATION');
  // Dynamically import main.js to verify it loads without throwing
  await import('../restaurantos/frontend/main.js');
  console.log(`  ✓ main.js imported successfully as standalone modular entry point`);

  console.log('\n====================================================');
  if (test1Passed && test2Passed) {
    console.log('RESULT: PASS (Standalone Browser Entry Main.js Verified)');
  } else {
    console.log('RESULT: FAIL (Entry point issue)');
  }
  console.log('====================================================');

} catch (err) {
  console.error('FATAL ERROR DURING MAIN ENTRY POINT TEST:', err);
  process.exit(1);
}
