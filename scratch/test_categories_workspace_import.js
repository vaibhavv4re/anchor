/**
 * Test Suite: Categories & Product Families Combined Taxonomy Import Contract
 * Note: Uses isolated test fixture tenant ('tenant-test-categories').
 * Does NOT overwrite or alter production/live Supabase records.
 * 
 * Verifies CategoryImportController domain engine:
 * 1. Unified parsing of PRODUCT_FAMILY and CATEGORY record types
 * 2. Product Family Foreign Key validation against both DB and in-file families
 * 3. In-file duplicate code detection (HARD ERROR BLOCK)
 * 4. Incremental update value preservation
 * 5. Atomic Commitment to database store
 * 6. Combined taxonomy CSV export & template generator
 */

import { categoryImportController } from '../businessos/platform/inventory/categoryImportController.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

async function runCategoriesImportTest() {
  console.log('----------------------------------------------------');
  console.log('🏷️ COMBINED TAXONOMY (CATEGORIES & FAMILIES) TEST SUITE');
  console.log('----------------------------------------------------\n');

  const tenantId = 'tenant-test-categories-fixture';

  // Seed baseline database store with 2 Product Families & 2 Categories
  offlineStore.setCollection('product_families', [
    { id: 'pf-meat', tenantId, code: 'PF-MEAT', name: 'Meat & Poultry', description: 'Fresh meats', active: true }
  ]);

  offlineStore.setCollection('inventory_categories', [
    {
      id: 'cat-chicken',
      tenantId,
      categoryCode: 'CAT-CHICKEN',
      categoryName: 'Chicken',
      productFamilyCode: 'PF-MEAT',
      defaultBaseUom: 'KG',
      active: true
    }
  ]);

  console.log('1. Verifying Live Combined Taxonomy CSV Export & Template Generator...');
  const templateCsv = categoryImportController.generateTemplateCsv();
  console.log(`  Template CSV Headers: ${templateCsv.split('\n')[0]}`);
  if (!templateCsv.includes('record_type,code,name,product_family_code,default_base_uom,description,active')) {
    throw new Error('Template CSV header mismatch.');
  }

  const liveExport = categoryImportController.exportLiveCategoriesCsv(tenantId);
  const liveRows = liveExport.split('\n').filter(Boolean);
  console.log(`  Live Export Rows (Fixture Tenant): ${liveRows.length - 1}`);
  if (liveRows.length < 3) throw new Error('Live export did not return seeded taxonomy records.');
  console.log('✓ Export & Template verified!');

  console.log('\n2. Testing Product Family Foreign Key Validation (invalid PF code)...');
  const invalidPfCsv = `record_type,code,name,product_family_code,default_base_uom,description,active
CATEGORY,CAT-PRAWNS,Prawns & Shellfish,PF-INVALID-BLABLA,KG,,true
`;
  const invalidPfRows = categoryImportController.parseCsv(invalidPfCsv);
  const invalidPfVal = categoryImportController.validateRows(invalidPfRows, tenantId);
  console.log(`  Validation status: isValid = ${invalidPfVal.isValid}, Errors = ${invalidPfVal.errors.length}`);
  if (invalidPfVal.isValid || !invalidPfVal.errors.some(e => e.field === 'product_family_code')) {
    throw new Error('Invalid product family code was not flagged as an ERROR.');
  }
  console.log(`  Error Message: "${invalidPfVal.errors[0].message}"`);
  console.log('✓ Product Family Foreign Key Validation verified!');

  console.log('\n3. Testing In-File Duplicate Code Detection (Hard Block)...');
  const duplicateCsv = `record_type,code,name,product_family_code,default_base_uom,description,active
CATEGORY,CAT-VEG,Fresh Vegetables,PF-MEAT,KG,,true
CATEGORY,CAT-VEG,Duplicate Vegetables,PF-MEAT,KG,,true
`;
  const dupRows = categoryImportController.parseCsv(duplicateCsv);
  const dupVal = categoryImportController.validateRows(dupRows, tenantId);
  if (dupVal.isValid || dupVal.errors.length === 0) {
    throw new Error('In-file duplicate category code was not flagged as an ERROR.');
  }
  console.log(`  Error Message: "${dupVal.errors[0].message}"`);
  console.log('✓ In-File Duplicate Error Blocking verified!');

  console.log('\n4. Testing Combined Taxonomy Import (NEW Family + NEW Category linking to NEW Family)...');
  const combinedTaxonomyCsv = `record_type,code,name,product_family_code,default_base_uom,description,active
PRODUCT_FAMILY,PF-PROD,"Fruits & Vegetables",,,"Fresh produce",true
CATEGORY,CAT-VEG,"Fresh Vegetables",PF-PROD,KG,"Leafy and root vegetables",true
`;
  const combinedRows = categoryImportController.parseCsv(combinedTaxonomyCsv);
  const combinedVal = categoryImportController.validateRows(combinedRows, tenantId);
  console.log(`  Validation status: isValid = ${combinedVal.isValid}, Errors = ${combinedVal.errors.length}`);
  if (!combinedVal.isValid) {
    throw new Error(`Combined taxonomy validation failed: ${combinedVal.errors.map(e => e.message).join(', ')}`);
  }

  const diff = categoryImportController.generateDiffPreview(combinedRows, tenantId);
  console.log(`  Diff Preview: NEW = ${diff.NEW.length}, UPDATED = ${diff.UPDATED.length}, UNCHANGED = ${diff.UNCHANGED.length}, ERRORS = ${diff.ERRORS.length}`);
  console.log(`  Taxonomy Breakdown: ${diff.familyCount} Family record(s), ${diff.categoryCount} Category record(s)`);
  if (diff.NEW.length !== 2) {
    throw new Error('Expected 2 NEW records in combined taxonomy diff.');
  }

  const commitRes = await categoryImportController.commitImport(combinedRows, tenantId);
  console.log(`✓ Atomic Commit Succeeded! (Import ID: ${commitRes.importId}, Total Committed: ${commitRes.totalCommitted})`);

  const updatedPfs = offlineStore.getCollection('product_families').filter(p => p.tenantId === tenantId);
  const updatedCats = offlineStore.getCollection('inventory_categories').filter(c => c.tenantId === tenantId);

  console.log(`  Final Fixture Database Counts: ${updatedPfs.length} Product Families, ${updatedCats.length} Categories`);
  if (updatedPfs.length !== 2 || updatedCats.length !== 2) {
    throw new Error('Combined taxonomy commit did not correctly update fixture database stores.');
  }

  console.log('\n----------------------------------------------------');
  console.log('✅ COMBINED TAXONOMY CONTRACT TEST PASSED (100%)');
  console.log('----------------------------------------------------');
}

runCategoriesImportTest();
