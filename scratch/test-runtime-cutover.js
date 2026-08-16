import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createApplication } from '../restaurantos/frontend/bootstrap.js';

console.log('====================================================');
console.log('STEP 17.8 RUNTIME CUTOVER ACCEPTANCE SUITE');
console.log('====================================================\n');

try {
  const rootDir = process.cwd();
  const htmlPath = path.join(rootDir, 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  console.log('1. INDEX.HTML ENTRY TAG VALIDATION');
  const hasModularEntry = htmlContent.includes('<script type="module" src="./restaurantos/frontend/main.js"></script>');
  const hasBundleReference = htmlContent.includes('bundle.js');
  
  const c1Passed = hasModularEntry && !hasBundleReference;
  console.log(`  ${c1Passed ? '✓' : '✗'} index.html points exclusively to ./restaurantos/frontend/main.js (bundle.js removed)`);

  console.log('\n2. MODULAR RUNTIME GRAPH COMPOSITION');
  const appGraph = createApplication();
  const repoKeys = Object.keys(appGraph.application.repositories);
  const c2Passed = appGraph.platform &&
                   appGraph.application &&
                   appGraph.shell &&
                   repoKeys.length === 14 &&
                   appGraph.shell.authEngine === appGraph.application.authEngine &&
                   appGraph.shell.repositories === appGraph.application.repositories;
  console.log(`  ${c2Passed ? '✓' : '✗'} Modular composition graph resolved all 14 repositories & injected services`);

  console.log('\n3. BUNDLE.JS ROLLBACK ARTIFACT INTEGRITY');
  const gitDiffOutput = execSync('git diff -- bundle.js', { encoding: 'utf8' }).trim();
  const c3Passed = gitDiffOutput.length === 0;
  console.log(`  ${c3Passed ? '✓' : '✗'} bundle.js remains 100% clean and untouched on disk as rollback artifact`);

  console.log('\n====================================================');
  if (c1Passed && c2Passed && c3Passed) {
    console.log('CUTOVER RESULT: PASS 🚀 (Native ES-Module Runtime Cutover Verified)');
  } else {
    console.log('CUTOVER RESULT: FAIL');
  }
  console.log('====================================================');

} catch (err) {
  console.error('FATAL ERROR DURING CUTOVER SUITE:', err);
  process.exit(1);
}
