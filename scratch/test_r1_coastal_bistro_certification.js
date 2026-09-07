/**
 * Anchor Milestone R1 Certification Pipeline
 * Independent Gated Pipeline:
 * - Gate 1: Purely Observational Source Audit (NO MUTATIONS)
 * - Gate 2: Staging Bring-Up & Pre-Import Preview (NO MUTATIONS)
 * - Gate 3: Real Recipe BOM Configuration (Pending Operator Input)
 * - Gate 4: Data-Driven Golden Regression Suite (11 Transactions)
 */

import { coastalBistroSourceAudit } from '../businessos/platform/inventory/coastalBistroSourceAudit.js';
import { gate2PreImportPreview } from '../businessos/platform/inventory/gate2PreImportPreview.js';

function runGate1() {
  console.log('----------------------------------------------------');
  console.log('🔍 GATE 1 — COASTAL BISTRO SOURCE AUDIT (OBSERVATIONAL)');
  console.log('----------------------------------------------------\n');

  const report = coastalBistroSourceAudit.runGate1SourceAudit();

  console.log(`Source Files Audited:`);
  console.log(`  1. ${report.sourceFiles.inventoryCsv.path} (${report.sourceFiles.inventoryCsv.recordCount} items)`);
  console.log(`  2. ${report.sourceFiles.menuText.path} (${report.sourceFiles.menuText.lineCount} lines)\n`);

  console.log(`Inventory Master Audit Summary:`);
  console.log(`  Total Source Records:    ${report.inventoryAudit.totalRecords}`);
  console.log(`  Raw Materials:          ${report.inventoryAudit.rawMaterials} (sourceStatus: VERIFIED)`);
  console.log(`  Semi-Finished Preps:    ${report.inventoryAudit.semiFinished} (sourceStatus: DERIVED)`);
  console.log(`  Packaging & Consumables:${report.inventoryAudit.packaging} (sourceStatus: VERIFIED)\n`);

  console.log(`Food & Beverage Menu Audit Summary:`);
  console.log(`  Total Food Dishes:      ${report.menuAudit.totalFoodItems}`);
  console.log(`  Explicit Recipe Notes:  ${report.menuAudit.explicitRecipeCount} (sourceStatus: VERIFIED)`);
  console.log(`  Grammage Unspecified:   ${report.menuAudit.needsReviewRecipeCount} (sourceStatus: NEEDS_REVIEW)`);
  console.log(`  Bar Items Identified:   ${report.menuAudit.barItems.length}\n`);

  console.log(`Missing Operational Dependencies Identified:`);
  report.missingOperationalDependencies.forEach(m => {
    console.log(`  ⚠️ [${m.sourceStatus}] ${m.itemCode}: ${m.itemName} -> ${m.reason}`);
  });

  console.log('\nMultidimensional Status Counts:');
  console.log('  sourceStatus:      ', JSON.stringify(report.statusCounts.sourceStatus));
  console.log('  importStatus:      ', JSON.stringify(report.statusCounts.importStatus));
  console.log('  operationalStatus: ', JSON.stringify(report.statusCounts.operationalStatus));

  if (!report.isGatePassed) {
    console.error('\n❌ GATE 1 FAILED: Source files could not be audited.');
    process.exit(1);
  }

  console.log('\n----------------------------------------------------');
  console.log('✅ GATE 1 SOURCE AUDIT COMPLETED SUCCESSFULLY (FAIL-CLOSED PASS)');
  console.log('----------------------------------------------------\n');

  return report;
}

function runGate2() {
  console.log('----------------------------------------------------');
  console.log('📦 GATE 2 — STAGING BRING-UP & PRE-IMPORT PREVIEW');
  console.log('----------------------------------------------------\n');

  const preview = gate2PreImportPreview.runGate2Preview();

  console.log(`Staging Package Compiled:`);
  console.log(`  Inventory Master: ${preview.counts.inventoryRecords} items (Authoritative 56 items from CSV)`);
  console.log(`  Suppliers:        ${preview.counts.suppliers} records`);
  console.log(`  Food Menu Items:  ${preview.counts.foodMenuItems} dishes`);
  console.log(`  Bar Menu Items:   ${preview.counts.barMenuItems} drinks`);
  console.log(`  Food Variants:    ${preview.counts.foodVariants} variants`);
  console.log(`  Bar Variants:     ${preview.counts.barVariants} variants`);
  console.log(`  Recipes (Gate 2): ${preview.counts.foodRecipes} (Zero manufactured BOMs)`);
  console.log(`  Opening Stock:    ${preview.counts.openingStock} (Unentered baseline)\n`);

  console.log(`Diff Category Breakdown:`);
  Object.keys(preview.diffPreview).forEach(k => {
    const d = preview.diffPreview[k];
    console.log(`  ${k}: Total=${d.total}, NEW=${d.NEW}, UPDATED=${d.UPDATED}, UNCHANGED=${d.UNCHANGED}`);
  });

  console.log(`\n⚠️ Certification Exceptions Queue (${preview.exceptionsQueue.length} items):`);
  preview.exceptionsQueue.forEach(e => {
    console.log(`  [${e.status}] ${e.itemCode} (${e.itemName}): ${e.reason}`);
  });

  console.log(`\n📋 Operator Recipe Review Queue (${preview.operatorReviewQueue.length} items):`);
  preview.operatorReviewQueue.slice(0, 4).forEach(r => {
    console.log(`  Line ${r.lineNum}: "${r.dishName}" (${r.section}) -> Grammages missing in text`);
  });

  console.log(`\n🏥 Honest Data Health Readiness Check:`);
  console.log(`  Tenant Status:        ${preview.healthReport.status}`);
  console.log(`  Ready For Simulation: ${preview.healthReport.readyForSimulation}`);

  if (!preview.isGate2ReadyForCommit) {
    console.error('\n❌ GATE 2 PRE-IMPORT PREVIEW FAILED: Validation errors detected.');
    process.exit(1);
  }

  console.log('\n----------------------------------------------------');
  console.log('✅ GATE 2 PRE-IMPORT PREVIEW COMPLETED (READY FOR USER REVIEW)');
  console.log('   Gate 3 (BOMs) & Gate 4 (Simulation) remain BLOCKED until user review.');
  console.log('----------------------------------------------------');

  return preview;
}

const args = process.argv.slice(2);
const gateArg = args.find(a => a.startsWith('--gate='))?.split('=')[1] || 'all';

if (gateArg === '1') {
  runGate1();
} else if (gateArg === '2') {
  runGate1();
  runGate2();
} else {
  runGate1();
  runGate2();
}
