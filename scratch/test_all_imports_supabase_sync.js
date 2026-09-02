/**
 * Test Suite: Full Inventory Suite Supabase Cloud Persistence Audit
 * Verifies that CSV imports across all 4 controllers (Categories, Master Inventory, Suppliers, Supplier Catalogue)
 * post directly to Supabase REST Cloud Adapter endpoints.
 */

import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { inventoryImportController } from '../businessos/platform/inventory/inventoryImportController.js';
import { categoryImportController } from '../businessos/platform/inventory/categoryImportController.js';
import { supplierImportController } from '../businessos/platform/inventory/supplierImportController.js';
import { supplierCatalogueController } from '../businessos/platform/inventory/supplierCatalogueController.js';

async function runFullSupabaseSyncTest() {
  console.log('----------------------------------------------------');
  console.log('☁ ALL IMPORT CONTROLLERS SUPABASE SYNC TEST');
  console.log('----------------------------------------------------\n');

  const tenantId = 'tenant-full-cloud-sync';
  const postedRecords = [];

  // Mock Supabase REST client
  const mockSupabaseClient = {
    async createRecord(tableName, record) {
      postedRecords.push({ tableName, record });
      return { success: true, data: record };
    },
    async updateRecord(tableName, id, patch) {
      postedRecords.push({ tableName, record: patch });
      return { success: true, data: patch };
    },
    async fetchTableData(tableName) {
      return { success: true, data: [] };
    }
  };

  const cloudAdapter = new SupabaseDataAdapter(mockSupabaseClient);
  const dataGateway = new DataGateway({ cloudAdapter, isOnline: true });

  if (typeof window === 'undefined') {
    global.window = { __APP__: { platform: { dataGateway } } };
  } else {
    window.__APP__ = { platform: { dataGateway } };
  }

  console.log('1. Testing Taxonomy Import (Categories & Product Families)...');
  const catRows = [
    { category_code: 'CAT-TEST1', category_name: 'Test Category 1', product_family_code: 'FAM-MEAT' },
    { category_code: 'CAT-TEST2', category_name: 'Test Category 2', product_family_code: 'FAM-SEAFOOD' }
  ];
  await categoryImportController.commitImport(catRows, tenantId);
  const catPosts = postedRecords.filter(r => r.tableName === 'inventory_categories' || r.tableName === 'product_families');
  console.log(`  Supabase REST Calls for Taxonomy: ${catPosts.length}`);
  if (catPosts.length < 2) throw new Error('Taxonomy import failed to post to Supabase REST client.');
  console.log('✓ Taxonomy Supabase Cloud Sync verified!');

  console.log('\n2. Testing Master Inventory Import...');
  const invRows = [
    { item_code: 'RM0901', item_name: 'Cloud Test Mutton', item_type: 'Raw Material', category: 'CAT-TEST1', base_uom: 'KG', purchase_uom: 'KG', conversion_factor: 1, reorder_level: 15, active: 'true' },
    { item_code: 'RM0902', item_name: 'Cloud Test Prawns', item_type: 'Raw Material', category: 'CAT-TEST2', base_uom: 'KG', purchase_uom: 'KG', conversion_factor: 1, reorder_level: 10, active: 'true' }
  ];
  await inventoryImportController.commitImport(invRows, tenantId);
  const invPosts = postedRecords.filter(r => r.tableName === 'inventory');
  console.log(`  Supabase REST Calls for Master Inventory: ${invPosts.length}`);
  if (invPosts.length < 2) throw new Error('Master Inventory import failed to post to Supabase REST client.');
  console.log('✓ Master Inventory Supabase Cloud Sync verified!');

  console.log('\n3. Testing Suppliers Directory Import...');
  const supRows = [
    { supplier_code: 'SUP-901', supplier_name: 'Cloud Apex Meats', contact_person: 'Rohan', phone: '9820098200', email: 'rohan@apex.com', gstin: '27AAAAA0000A1Z5', active: 'true' }
  ];
  await supplierImportController.commitImport(supRows, tenantId);
  const supPosts = postedRecords.filter(r => r.tableName === 'suppliers');
  console.log(`  Supabase REST Calls for Suppliers Directory: ${supPosts.length}`);
  if (supPosts.length < 1) throw new Error('Suppliers Directory import failed to post to Supabase REST client.');
  console.log('✓ Suppliers Directory Supabase Cloud Sync verified!');

  console.log('\n4. Testing Supplier Catalogue Import...');
  const catItemRows = [
    { supplier_code: 'SUP-901', item_code: 'RM0901', supplier_sku: 'MEAT-01', supplier_item_name: 'Apex Mutton Cut', purchase_uom: 'KG', pack_quantity: 1, pack_uom: 'KG', unit_price: 650, gst_rate: 5, moq: 5, lead_time_days: 1, preferred: 'true', active: 'true' }
  ];
  await supplierCatalogueController.commitImport(catItemRows, tenantId);
  const cataloguePosts = postedRecords.filter(r => r.tableName === 'supplier_catalog' || r.tableName === 'supplier_catalogue');
  console.log(`  Supabase REST Calls for Supplier Catalogue: ${cataloguePosts.length}`);
  if (cataloguePosts.length < 1) throw new Error('Supplier Catalogue import failed to post to Supabase REST client.');
  console.log('✓ Supplier Catalogue Supabase Cloud Sync verified!');

  console.log('\n----------------------------------------------------');
  console.log('✅ ALL IMPORT CONTROLLERS SUPABASE SYNC PASSED (100%)');
  console.log('----------------------------------------------------');
}

runFullSupabaseSyncTest();
