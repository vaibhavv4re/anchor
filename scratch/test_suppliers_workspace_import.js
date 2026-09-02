/**
 * Test Suite: Suppliers Master Import Contract & Domain Engine
 * Note: Uses isolated test fixture tenant ('tenant-test-suppliers-fixture').
 * Does NOT overwrite or alter production/live Supabase records.
 * 
 * Verifies SupplierImportController domain engine:
 * 1. Pure Supplier Master Schema validation (supplier_code, supplier_name mandatory)
 * 2. In-file duplicate code detection (HARD ERROR BLOCK)
 * 3. Side-by-side field diff comparison for UPDATED records
 * 4. Value preservation for blank CSV cells on UPDATE records
 * 5. Atomic Commitment to database store
 * 6. Live Suppliers CSV export & canonical template generator
 */

import { supplierImportController } from '../businessos/platform/inventory/supplierImportController.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

async function runSuppliersImportTest() {
  console.log('----------------------------------------------------');
  console.log('🏢 SUPPLIERS MASTER CONTRACT TEST SUITE');
  console.log('----------------------------------------------------\n');

  const tenantId = 'tenant-test-suppliers-fixture';

  // Seed baseline database store with 2 Suppliers
  offlineStore.setCollection('suppliers', [
    {
      id: 'sup-001',
      tenantId,
      supplierCode: 'SUP-001',
      supplierName: 'Zai Local Produce',
      contactPerson: 'Zainab Khan',
      phone: '+91 98201 12345',
      email: 'zai@localproduce.com',
      address: '12 Market St, Mumbai',
      gstin: '27AAAFF1234A1Z5',
      active: true
    },
    {
      id: 'sup-002',
      tenantId,
      supplierCode: 'SUP-002',
      supplierName: 'Coastal Fresh Seafood',
      contactPerson: 'Ramesh Naik',
      phone: '+91 98202 23456',
      email: 'orders@coastalseafood.in',
      address: 'Dock 4, Sassoon Docks, Mumbai',
      gstin: '27BBBFF2345B1Z6',
      active: true
    }
  ]);

  console.log('1. Verifying Live Suppliers CSV Export & Template Generator...');
  const templateCsv = supplierImportController.generateTemplateCsv();
  console.log(`  Template CSV Headers: ${templateCsv.split('\n')[0]}`);
  if (!templateCsv.includes('supplier_code,supplier_name,contact_person,phone,email,address,gstin,active')) {
    throw new Error('Template CSV header mismatch.');
  }

  const liveExport = supplierImportController.exportLiveSuppliersCsv(tenantId);
  const liveRows = liveExport.split('\n').filter(Boolean);
  console.log(`  Live Export Rows (Fixture Tenant): ${liveRows.length - 1}`);
  if (liveRows.length < 3) throw new Error('Live export did not return seeded supplier records.');
  console.log('✓ Export & Template verified!');

  console.log('\n2. Testing Mandatory Field Validation (missing supplier_name)...');
  const invalidCsv = `supplier_code,supplier_name,contact_person,phone,email,address,gstin,active
SUP-999,,"Missing Name Contact",+91 9898989898,test@test.com,,27XXXFF9999X1Z1,true
`;
  const invalidRows = supplierImportController.parseCsv(invalidCsv);
  const invalidVal = supplierImportController.validateRows(invalidRows, tenantId);
  console.log(`  Validation status: isValid = ${invalidVal.isValid}, Errors = ${invalidVal.errors.length}`);
  if (invalidVal.isValid || !invalidVal.errors.some(e => e.field === 'supplier_name')) {
    throw new Error('Missing supplier_name was not flagged as an ERROR.');
  }
  console.log(`  Error Message: "${invalidVal.errors[0].message}"`);
  console.log('✓ Mandatory Field Validation verified!');

  console.log('\n3. Testing In-File Duplicate Code Detection (Hard Block)...');
  const duplicateCsv = `supplier_code,supplier_name,contact_person,phone,email,address,gstin,active
SUP-010,"Apex Foods","Rahul Sharma",+91 98201 11111,,,27AAAFF0000A1Z0,true
SUP-010,"Duplicate Apex Foods","Sanjay Verma",+91 98201 22222,,,27AAAFF0000A1Z0,true
`;
  const dupRows = supplierImportController.parseCsv(duplicateCsv);
  const dupVal = supplierImportController.validateRows(dupRows, tenantId);
  if (dupVal.isValid || dupVal.errors.length === 0) {
    throw new Error('In-file duplicate supplier_code was not flagged as an ERROR.');
  }
  console.log(`  Error Message: "${dupVal.errors[0].message}"`);
  console.log('✓ In-File Duplicate Error Blocking verified!');

  console.log('\n4. Testing Incremental Import (1 NEW Supplier + 1 UPDATED Supplier with blank cell value preservation)...');
  const importCsv = `supplier_code,supplier_name,contact_person,phone,email,address,gstin,active
SUP-001,"Zai Local Produce","Zainab Khan",+91 98201 99999,,,27AAAFF1234A1Z5,true
SUP-003,"Beverage World Supplies","Vikram Mehta",+91 98203 34567,vikram@beverageworld.com,"88 Industrial Estate, Pune",27CCCFF3456C1Z7,true
`;
  const importRows = supplierImportController.parseCsv(importCsv);
  const importVal = supplierImportController.validateRows(importRows, tenantId);
  console.log(`  Validation status: isValid = ${importVal.isValid}, Errors = ${importVal.errors.length}`);
  if (!importVal.isValid) {
    throw new Error(`Import validation failed: ${importVal.errors.map(e => e.message).join(', ')}`);
  }

  const diff = supplierImportController.generateDiffPreview(importRows, tenantId);
  console.log(`  Diff Preview: NEW = ${diff.NEW.length}, UPDATED = ${diff.UPDATED.length}, UNCHANGED = ${diff.UNCHANGED.length}, ERRORS = ${diff.ERRORS.length}`);
  if (diff.NEW.length !== 1 || diff.UPDATED.length !== 1) {
    throw new Error('Expected 1 NEW supplier and 1 UPDATED supplier in diff preview.');
  }

  console.log(`  Field Change Comparison for SUP-001:`);
  diff.UPDATED[0].fieldChanges.forEach(fc => {
    console.log(`    - ${fc.field}: ${fc.existing} ➔ ${fc.import}`);
  });

  const commitRes = await supplierImportController.commitImport(importRows, tenantId);
  console.log(`✓ Atomic Commit Succeeded! (Import ID: ${commitRes.importId}, Total Committed: ${commitRes.totalCommitted})`);

  const finalSuppliers = offlineStore.getCollection('suppliers').filter(s => s.tenantId === tenantId);
  console.log(`  Final Fixture Database Supplier Count: ${finalSuppliers.length}`);
  if (finalSuppliers.length !== 3) {
    throw new Error('Supplier import commit did not correctly update database store.');
  }

  // Verify Value Preservation for Blank CSV Cells on SUP-001 (email & address were blank in CSV)
  const updatedSup1 = finalSuppliers.find(s => s.supplierCode === 'SUP-001');
  console.log(`  Checking Preserved Values for SUP-001: Email="${updatedSup1.email}", Address="${updatedSup1.address}"`);
  if (updatedSup1.email !== 'zai@localproduce.com' || updatedSup1.address !== '12 Market St, Mumbai') {
    throw new Error('Blank CSV cells overwrote existing DB values instead of preserving them!');
  }
  console.log('✓ Blank Cell Value Preservation verified!');

  console.log('\n----------------------------------------------------');
  console.log('✅ SUPPLIERS MASTER CONTRACT TEST PASSED (100%)');
  console.log('----------------------------------------------------');
}

runSuppliersImportTest();
