/**
 * Milestone 1 - Playbook Test Suite (Restaurant Can Be Configured)
 * Tests Super Admin Onboarding, Setup Assistant, Workspace Health Scores, Contextual Links, and Explore Mode.
 */

import { tenantModel } from '../../../../../businessos/platform/tenant/tenantModel.js';
import { setupValidationEngine } from '../../../../../businessos/platform/tenant/setupValidationEngine.js';
import { demoDataSeeder } from '../../../../../businessos/platform/tenant/demoDataSeeder.js';

export async function runMilestone1TestSuite() {
  const results = [];

  const assert = (condition, scenarioName) => {
    if (condition) {
      results.push({ scenarioName, status: 'PASS' });
    } else {
      results.push({ scenarioName, status: 'FAIL' });
    }
  };

  // Scenario 1: Super Admin Onboarding Initial Setup
  const tenant = tenantModel.getTenantProfile();
  assert(tenant && tenant.tenantId, 'Scenario 1: Super Admin Tenant Profile Exists');

  // Scenario 2: Setup Assistant Readiness Checklist Validation
  const readiness = setupValidationEngine.getReadinessScore();
  assert(readiness && readiness.score >= 0 && readiness.score <= 100, 'Scenario 2: Setup Assistant Readiness Checklist Calculated');

  // Scenario 3: Workspace Health Score Breakdown
  assert(readiness.breakdown && readiness.breakdown.identity !== undefined && readiness.breakdown.menu !== undefined, 'Scenario 3: Workspace Health Score Breakdown Available');

  // Scenario 4: Explore Mode / Demo Data Seeder Activation
  const seedResult = demoDataSeeder.seedDemoDataset();
  assert(seedResult && seedResult.success, 'Scenario 4: Explore Mode Demo Data Seeder Activated Successfully');

  // Scenario 5: Post-Seed Readiness Score Refresh
  const postSeedReadiness = setupValidationEngine.getReadinessScore();
  assert(postSeedReadiness.score > readiness.score, 'Scenario 5: Readiness Score Improved After Demo Data Seeding');

  const passed = results.filter(r => r.status === 'PASS').length;
  return { total: results.length, passed, results };
}
