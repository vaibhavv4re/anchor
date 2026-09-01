/**
 * BusinessOS Platform - Gate 2 Pre-Import Preview & Diagnostics (Milestone R1 - Gate 2)
 * Purely observational pre-import preview runner.
 * Evaluates package validation, staging diffs, Exceptions Queue, Operator Review Queue,
 * and Data Health Scorecard WITHOUT committing database state or creating fake BOMs.
 */

import { coastalBistroStagingPackage } from './coastalBistroStagingPackage.js';
import { canonicalImportSpec } from './canonicalImportSpec.js';
import { importValidationEngine } from './importValidationEngine.js';
import { incrementalUpsertEngine } from './incrementalUpsertEngine.js';
import { dataReadinessAuditService, READINESS_STATUS } from '../health/dataReadinessAuditService.js';
import { coastalBistroSourceAudit } from './coastalBistroSourceAudit.js';

export class Gate2PreImportPreview {
  /**
   * Executes Gate 2 Pre-Import Preview and returns complete diagnostic report.
   * @returns {Object} Gate 2 Diagnostic Preview Report
   */
  runGate2Preview() {
    const stagingPkg = coastalBistroStagingPackage.compileStagingPackage();
    const sourceAudit = coastalBistroSourceAudit.runGate1SourceAudit();

    // 1. Manifest Validation
    const manifestResult = canonicalImportSpec.validateManifest(stagingPkg.manifest);

    // 2. Package Validation
    const validationResult = importValidationEngine.validatePackage(stagingPkg);

    // 3. Diff Preview
    const diffPreview = incrementalUpsertEngine.generateDiffPreview(stagingPkg);

    // 4. Certification Exceptions Queue (Missing operational dependencies)
    const exceptionsQueue = sourceAudit.missingOperationalDependencies.map(dep => ({
      itemCode: dep.itemCode,
      itemName: dep.itemName,
      reason: dep.reason,
      status: dep.sourceStatus
    }));

    // 5. Operator Recipe Review Queue (Dishes with qualitative notes missing exact grammages)
    const operatorReviewQueue = sourceAudit.menuAudit.foodItems
      .filter(dish => dish.sourceStatus === 'NEEDS_REVIEW')
      .map(dish => ({
        lineNum: dish.lineNum,
        dishName: dish.name,
        section: dish.section,
        recipeNotes: dish.recipeNotes,
        status: dish.sourceStatus
      }));

    // 6. Honest Data Health Readiness Check
    const healthReport = dataReadinessAuditService.evaluateReadiness('tenant-demo');

    return {
      gate: 'GATE_2_STAGING_PREVIEW',
      timestamp: new Date().toISOString(),
      manifestValidation: manifestResult,
      packageValidation: validationResult,
      diffPreview,
      counts: {
        inventoryRecords: stagingPkg.INVENTORY_MASTER.length,
        suppliers: stagingPkg.SUPPLIERS.length,
        foodMenuItems: stagingPkg.FOOD_MENU.length,
        barMenuItems: stagingPkg.BAR_MENU.length,
        foodVariants: stagingPkg.FOOD_VARIANTS.length,
        barVariants: stagingPkg.BAR_VARIANTS.length,
        foodRecipes: stagingPkg.FOOD_RECIPES.length,
        barRecipes: stagingPkg.BAR_RECIPES.length,
        openingStock: stagingPkg.OPENING_STOCK.length
      },
      exceptionsQueue,
      operatorReviewQueue,
      healthReport: {
        status: healthReport.status,
        readyForSimulation: healthReport.readyForSimulation,
        metrics: healthReport.metrics,
        warnings: healthReport.warnings
      },
      isGate2ReadyForCommit: manifestResult.isValid && validationResult.isValid
    };
  }
}

export const gate2PreImportPreview = new Gate2PreImportPreview();
