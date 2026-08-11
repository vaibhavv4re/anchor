/**
 * Milestone 1 - Playbook Test Suite (Restaurant Can Be Configured)
 * Tests Super Admin Onboarding, Setup Assistant, Workspace Health Scores, Contextual Links, and Explore Mode.
 */

import { tenantModel } from '../../../../businessos/platform/tenant/tenantModel.js';
import { setupValidationEngine } from '../../../../businessos/platform/tenant/setupValidationEngine.js';
import { demoDataSeeder } from '../../../../businessos/platform/tenant/demoDataSeeder.js';

export async function runMilestone1TestSuite() {
  const results = [];

  const assert = (condition, scenarioName) => {
    if (condition) {
      results.push({ scenarioName, status: 'PASS' });
      console.log(`✅ [MILESTONE 1 PASS] ${scenarioName}`);
    } else {
      results.push({ scenarioName, status: 'FAIL' });
      console.error(`❌ [MILESTONE 1 FAIL] ${scenarioName}`);
    }
  };

  console.log('🧪 Executing Milestone 1 Operational Playbook Tests (Restaurant Setup & Readiness)...\n');

  // Step 1: Super Admin Onboarding (Scenario 1)
  const newTenant = await tenantModel.createTenant({
    name: 'Anchor Bistro & Cafe',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    adminName: 'Priya Mehta',
    adminPin: '999999'
  });
  assert(newTenant && newTenant.tenantId && newTenant.correlationId, 'Scenario 1: Super Admin creates Tenant and Admin credentials with CID');

  // Step 2: Setup Assistant & Resume Progress (Scenario 2)
  const updatedTenant = tenantModel.updateTenant({ lastCompletedStep: 4, setupProgressPercent: 65 });
  assert(updatedTenant && updatedTenant.lastCompletedStep === 4, 'Scenario 2: Setup Assistant stores last completed step for Resume → functionality');

  // Step 3: Classified Readiness Engine & Workspace Health Scores (Scenario 3)
  const readiness = setupValidationEngine.getReadinessStatus();
  assert(readiness.classifiedCounters.infrastructure.completed === 5, 'Scenario 3a: Classified Infrastructure Readiness calculates 5/5 Complete');
  assert(readiness.workspaceHealth.kitchen.score === 92 && readiness.workspaceHealth.kitchen.actionLabel === 'Configure Recipes →', 'Scenario 3b: Kitchen Workspace Health calculated at 92% with contextual link "Configure Recipes →"');
  assert(readiness.workspaceHealth.bar.actionLabel === 'Create Drinks →', 'Scenario 3c: Bar Workspace Health has contextual action link "Create Drinks →"');

  // Step 4: Explore Mode ("Explore RestaurantOS") (Scenario 4)
  const exploreRes = demoDataSeeder.loadExploreModeData();
  const sampleTenant = tenantModel.getPrimaryTenant();
  assert(exploreRes.success && sampleTenant.name.includes('Sample Restaurant'), 'Scenario 4: Explore Mode loads sample restaurant ("Anchor Bistro Demo") for evaluation');

  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  console.log(`\n🎉 Milestone 1 Playbook Test Suite Finished: ${passed}/${total} Scenarios Passed.`);

  return { total, passed, results };
}
