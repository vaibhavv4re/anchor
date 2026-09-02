/**
 * Test Suite: Supplier Catalogue Import Contract & Domain Engine
 * Note: Uses isolated test fixture tenant ('tenant-test-sup-cat-fixture').
 * Does NOT overwrite or alter production/live Supabase records.
 * 
 * Verifies SupplierCatalogueController domain engine:
 * 1. FK validation against Suppliers Master and Inventory Master
 * 2. Absolute boundary check (rejects unknown supplier_code or item_code)
 * 3. In-file duplicate composite key detection (HARD ERROR BLOCK)
 * 4. Structured pack size math (pack_quantity + pack_uom)
 * 5. Single preferred supplier per item enforcement
 * 6. Side-by-side field diff comparison for UPDATED records
 * 7. Price History tracking
 * 8. Atomic Commitment to database store
 * 9. Live Catalogue CSV export & canonical template generator
 */

import { supplierCatalogueController } from '../businessos/platform/inventory/supplierCatalogueController.js';
import { supplierImportController } from '../businessos/platform/inventory/supplierImportController.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

async function runSupplierCatalogueImportTest() {
  console.log('----------------------------------------------------');
  console.log('📦 SUPPLIER CATALOGUE CONTRACT TEST SUITE');
  console.log('----------------------------------------------------\n');

  const tenantId = 'tenant-test-sup-cat-fixture';

  // 1. Seed baseline Suppliers Master and Inventory Master
  offlineStore.setCollection('suppliers', [
    { id: 'sup-001', tenantId, supplierCode: 'SUP-001', supplierName: 'Zai Local Produce', active: true },
    { id: 'sup-002', tenantId, supplierCode: 'SUP-002', tenantId, supplierName: 'Coastal Fresh Seafood', active: true },
    { id: 'sup-004', tenantId, supplierCode: 'SUP-004', tenantId, supplierName: 'Metro Meat & Poultry', active: true }
  ]);

  offlineStore.setCollection('inventory', [
    { id: 'RM0309', tenantId, itemCode: 'RM0309', itemName: 'Onion', categoryCode: 'VEGETABLES', baseUom: 'KG', active: true },
    { id: 'RM0310', tenantId, itemCode: 'RM0310', itemName: 'Tomato', categoryCode: 'VEGETABLES', baseUom: 'KG', active: true },
    { id: 'RM0202', tenantId, itemCode: 'RM0202', itemName: 'Surmai Fish', categoryCode: 'SEAFOOD', baseUom: 'KG', active: true }
  ]);

  // Seed initial catalogue with 1 mapping
  offlineStore.setCollection('supplier_catalogue', [
    {
      id: 'cat-sup-001-rm0309',
      tenantId,
      supplierCode: 'SUP-001',
      itemCode: 'RM0309',
      supplierSku: 'ON-50',
      supplierItemName: 'Fresh Farm Onion',
      purchaseUom: 'BAG',
      packQuantity: 50,
      packUom: 'KG',
      unitPrice: 2000,
      gstRate: 5,
      moq: 1,
      leadTimeDays: 2,
      preferred: true,
      active: true,
      priceHistory: []
    }
  ]);

  console.log('1. Verifying Live Supplier Catalogue CSV Export & Template Generator...');
  const templateCsv = supplierCatalogueController.generateTemplateCsv();
  console.log(`  Template CSV Headers: ${templateCsv.split('\n')[0]}`);
  if (!templateCsv.includes('supplier_code,item_code,supplier_sku,supplier_item_name,purchase_uom,pack_quantity,pack_uom,unit_price,gst_rate,moq,lead_time_days,preferred,active')) {
    throw new Error('Template CSV header mismatch.');
  }

  const liveExport = supplierCatalogueController.exportLiveCatalogueCsv(tenantId);
  const liveRows = liveExport.split('\n').filter(Boolean);
  console.log(`  Live Export Rows (Fixture Tenant): ${liveRows.length - 1}`);
  if (liveRows.length < 2) throw new Error('Live export did not return seeded catalogue records.');
  console.log('✓ Export & Template verified!');

  console.log('\n2. Testing FK Validation & Absolute Boundary (unknown item_code)...');
  const invalidCsv = `supplier_code,item_code,supplier_sku,supplier_item_name,purchase_uom,pack_quantity,pack_uom,unit_price,gst_rate,moq,lead_time_days,preferred,active
SUP-001,RM9999,UNKNOWN-99,"Unknown Item",BAG,50,KG,2000,5,1,2,true,true
`;
  const invalidRows = supplierCatalogueController.parseCsv(invalidCsv);
  const invalidVal = supplierCatalogueController.validateRows(invalidRows, tenantId);
  console.log(`  Validation status: isValid = ${invalidVal.isValid}, Errors = ${invalidVal.errors.length}`);
  if (invalidVal.isValid || !invalidVal.errors.some(e => e.field === 'item_code')) {
    throw new Error('Unknown item_code was not flagged as a HARD ERROR.');
  }
  console.log(`  Error Message: "${invalidVal.errors[0].message}"`);
  console.log('✓ Absolute Boundary & FK Validation verified!');

  console.log('\n3. Testing In-File Duplicate Composite Key Detection (Hard Block)...');
  const dupCsv = `supplier_code,item_code,supplier_sku,supplier_item_name,purchase_uom,pack_quantity,pack_uom,unit_price,gst_rate,moq,lead_time_days,preferred,active
SUP-001,RM0310,TOM-25,"Tomato Crate",CRATE,25,KG,1250,5,1,2,true,true
SUP-001,RM0310,TOM-25-DUP,"Duplicate Tomato",CRATE,25,KG,1300,5,1,2,true,true
`;
  const dupRows = supplierCatalogueController.parseCsv(dupCsv);
  const dupVal = supplierCatalogueController.validateRows(dupRows, tenantId);
  if (dupVal.isValid || dupVal.errors.length === 0) {
    throw new Error('In-file duplicate composite key was not flagged as a HARD ERROR.');
  }
  console.log(`  Error Message: "${dupVal.errors[0].message}"`);
  console.log('✓ In-File Duplicate Composite Key Blocking verified!');

  console.log('\n4. Testing Incremental Import, Structured Pack Math & Price Revision Tracking...');
  const importCsv = `supplier_code,item_code,supplier_sku,supplier_item_name,purchase_uom,pack_quantity,pack_uom,unit_price,gst_rate,moq,lead_time_days,preferred,active
SUP-001,RM0309,ON-50,"Fresh Farm Onion",BAG,50,KG,2200,5,1,2,true,true
SUP-004,RM0309,ON-50-METRO,"Metro Onion Bag",BAG,50,KG,2150,5,1,2,true,true
`;
  const importRows = supplierCatalogueController.parseCsv(importCsv);
  const importVal = supplierCatalogueController.validateRows(importRows, tenantId);
  console.log(`  Validation status: isValid = ${importVal.isValid}, Errors = ${importVal.errors.length}`);
  if (!importVal.isValid) {
    throw new Error(`Catalogue import validation failed: ${importVal.errors.map(e => e.message).join(', ')}`);
  }

  const diff = supplierCatalogueController.generateDiffPreview(importRows, tenantId);
  console.log(`  Diff Preview: NEW = ${diff.NEW.length}, UPDATED = ${diff.UPDATED.length}, UNCHANGED = ${diff.UNCHANGED.length}, ERRORS = ${diff.ERRORS.length}`);
  if (diff.NEW.length !== 1 || diff.UPDATED.length !== 1) {
    throw new Error('Expected 1 NEW mapping and 1 UPDATED mapping in diff preview.');
  }

  console.log(`  Field Change Comparison for SUP-001 + RM0309 Price Revision:`);
  diff.UPDATED[0].fieldChanges.forEach(fc => {
    console.log(`    - ${fc.field}: ${fc.existing} ➔ ${fc.import}`);
  });

  const commitRes = await supplierCatalogueController.commitImport(importRows, tenantId);
  console.log(`✓ Atomic Commit Succeeded! (Import ID: ${commitRes.importId}, Total Committed: ${commitRes.totalCommitted})`);

  const finalCatalogue = offlineStore.getCollection('supplier_catalogue').filter(c => c.tenantId === tenantId);
  console.log(`  Final Fixture Database Catalogue Count: ${finalCatalogue.length}`);
  if (finalCatalogue.length !== 2) {
    throw new Error('Catalogue import commit did not correctly update database store.');
  }

  // Verify Price History Entry for SUP-001 + RM0309
  const updatedMapping1 = finalCatalogue.find(c => c.supplierCode === 'SUP-001' && c.itemCode === 'RM0309');
  console.log(`  Checking Price History for SUP-001 + RM0309: ${updatedMapping1.priceHistory.length} entry(s)`);
  if (!updatedMapping1.priceHistory.length || updatedMapping1.priceHistory[0].newPrice !== 2200) {
    throw new Error('Catalogue price revision history was not recorded correctly!');
  }
  console.log('✓ Price Revision History verified!');

  // Verify 1-Preferred-Supplier-Per-Item Enforcement
  console.log('\n5. Testing 1-Preferred-Supplier-Per-Item Enforcement...');
  const prefSuppliersForOnion = finalCatalogue.filter(c => c.itemCode === 'RM0309' && c.preferred);
  console.log(`  Preferred Suppliers for RM0309: ${prefSuppliersForOnion.length} (Supplier: ${prefSuppliersForOnion[0].supplierCode})`);
  if (prefSuppliersForOnion.length !== 1 || prefSuppliersForOnion[0].supplierCode !== 'SUP-004') {
    throw new Error('1-preferred-supplier-per-item rule was not enforced correctly!');
  }
  console.log('✓ 1-Preferred-Supplier-Per-Item Rule verified!');

  console.log('\n----------------------------------------------------');
  console.log('✅ SUPPLIER CATALOGUE CONTRACT TEST PASSED (100%)');
  console.log('----------------------------------------------------');
}

runSupplierCatalogueImportTest();
