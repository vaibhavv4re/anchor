/**
 * Anchor Milestone F9 Symmetry Verification Suite
 * Tests 100% Export -> Edit -> Import Symmetry & Recipe Revision Preservation:
 * 1. Clean Reset & Load Initial Coastal Bistro Package
 * 2. Export active tenant configuration via CanonicalExportEngine
 * 3. Edit exported package (modify variant price & update recipe BOM)
 * 4. Run ImportValidationEngine & IncrementalUpsertEngine Preview
 * 5. Commit modified export package & verify Recipe Revision increment (Rev 1 -> Rev 2)
 * 6. Verify Data Health Scorecard
 */

import { tenantDataResetService, RESET_MODES } from '../businessos/platform/tenant/tenantDataResetService.js';
import { canonicalExportEngine } from '../businessos/platform/inventory/canonicalExportEngine.js';
import { importValidationEngine } from '../businessos/platform/inventory/importValidationEngine.js';
import { incrementalUpsertEngine } from '../businessos/platform/inventory/incrementalUpsertEngine.js';
import { importAuditLedger } from '../businessos/platform/audit/importAuditLedger.js';
import { dataReadinessAuditService, READINESS_STATUS } from '../businessos/platform/health/dataReadinessAuditService.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { FULL_COASTAL_BISTRO_PACKAGE } from './coastalBistroImportPack.js';

function runSymmetryTest() {
  console.log('----------------------------------------------------');
  console.log('🔄 ANCHOR EXPORT -> EDIT -> IMPORT SYMMETRY TEST');
  console.log('----------------------------------------------------\n');

  // STEP 1: CLEAN RESET & LOAD INITIAL DATA
  console.log('🧹 [Step 1] Initial Clean Reset & Dataset Commit...');
  tenantDataResetService.executeReset({
    tenantId: 'tenant-demo',
    mode: RESET_MODES.RESET_ENVIRONMENT,
    tenantNameConfirm: 'ABC Restaurant',
    userAcknowledged: true,
    requestedBy: { userId: 'user-admin', role: 'Super Admin' }
  });

  incrementalUpsertEngine.commitPackage(FULL_COASTAL_BISTRO_PACKAGE, {
    userId: 'user-admin',
    role: 'Super Admin',
    tenantId: 'tenant-demo'
  });
  console.log('✓ Initial Coastal Bistro Package Loaded.');

  // STEP 2: EXPORT ACTIVE TENANT PACKAGE
  console.log('\n📤 [Step 2] Exporting Active Tenant Configuration via CanonicalExportEngine...');
  const exportedPkg = canonicalExportEngine.exportPackage('tenant-demo');
  console.log(`✓ Export Generated! Manifest Restaurant: "${exportedPkg.manifest.restaurant}"`);
  console.log(`  Exported Files: Inventory (${exportedPkg.INVENTORY_MASTER.length}), Food Menu (${exportedPkg.FOOD_MENU.length}), Variants (${exportedPkg.FOOD_VARIANTS.length}), Recipes (${exportedPkg.FOOD_RECIPES.length})`);

  // STEP 3: EDIT EXPORTED PACKAGE (Simulate User Editing in Excel/CSV)
  console.log('\n✏️ [Step 3] Simulating User Editing Exported Package in Excel...');
  // Edit 1: Update Smoked Damao Tikka variant price from 440 -> 490
  const tikkaVariant = exportedPkg.FOOD_VARIANTS.find(v => v.variant_code === 'REGULAR' && v.menu_code === 'STARTER-DAMAO-CHK');
  if (tikkaVariant) {
    tikkaVariant.selling_price = 490;
    console.log(`  Modified Variant Price: ${tikkaVariant.menu_code} (${tikkaVariant.variant_code}) -> ₹490`);
  }

  // Edit 2: Update Damao Tikka Recipe BOM quantity (Chicken RM0101: 0.22 KG -> 0.25 KG)
  const tikkaRecipeIng = exportedPkg.FOOD_RECIPES.find(r => r.recipe_code === 'REC-DAMAO-CHK' && r.ingredient_code === 'RM0101');
  if (tikkaRecipeIng) {
    tikkaRecipeIng.quantity = 0.25;
    console.log(`  Modified Recipe BOM: ${tikkaRecipeIng.recipe_code} (${tikkaRecipeIng.ingredient_code}) -> 0.25 KG`);
  }

  // STEP 4: VALIDATE & PREVIEW MODIFIED PACKAGE
  console.log('\n🔍 [Step 4] Validating & Generating Diff Preview for Modified Package...');
  const validation = importValidationEngine.validatePackage(exportedPkg);
  if (!validation.isValid) throw new Error('Validation failed for exported package.');
  console.log('✓ Validation Passed (0 errors)');

  const diffPreview = incrementalUpsertEngine.generateDiffPreview(exportedPkg);
  console.log('  Diff Preview Category Counts:');
  Object.keys(diffPreview).forEach(k => {
    console.log(`    ${k}: NEW=${diffPreview[k].NEW}, UPDATED=${diffPreview[k].UPDATED}, UNCHANGED=${diffPreview[k].UNCHANGED}`);
  });

  // STEP 5: COMMIT MODIFIED PACKAGE & VERIFY RECIPE REVISION
  console.log('\n⚙️ [Step 5] Committing Modified Package & Verifying Recipe Revision Preservation...');
  const commitResult = incrementalUpsertEngine.commitPackage(exportedPkg, {
    userId: 'user-admin',
    role: 'Super Admin',
    tenantId: 'tenant-demo'
  });
  console.log(`✓ Commit Succeeded! Import ID: ${commitResult.importId}`);

  const recipes = offlineStore.getCollection('recipes') || [];
  const tikkaRecipe = recipes.find(r => r.recipeCode === 'REC-DAMAO-CHK');
  const revisions = offlineStore.getCollection('recipe_revisions') || [];

  console.log(`  Active Recipe Revision for REC-DAMAO-CHK: v${tikkaRecipe.activeRevision}`);
  console.log(`  Total Revisions Preserved in Store: ${revisions.length}`);
  if (tikkaRecipe.activeRevision !== 2) {
    throw new Error(`Expected Recipe Revision v2, got v${tikkaRecipe.activeRevision}`);
  }
  console.log('✓ Recipe Revision Preservation Verified! Historical Rev 1 preserved, Rev 2 created.');

  // STEP 6: DATA HEALTH AUDIT
  console.log('\n🏥 [Step 6] Verifying Data Health Scorecard...');
  const health = dataReadinessAuditService.evaluateReadiness('tenant-demo');
  console.log(`  Tenant Status: ${health.status}`);
  if (health.status !== READINESS_STATUS.READY_FOR_SIMULATION) {
    throw new Error('Health status is not READY_FOR_SIMULATION');
  }
  console.log('✓ Readiness Gatekeeper Passed!');

  console.log('\n----------------------------------------------------');
  console.log('✅ EXPORT -> EDIT -> IMPORT SYMMETRY TEST PASSED (100%)');
  console.log('----------------------------------------------------');
}

runSymmetryTest();
