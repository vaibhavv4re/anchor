import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

async function auditSupplierCatalogSchema() {
  console.log('🔍 AUDIT STEP 1: Inspecting Existing Supplier & Catalog Architecture\n');
  const client = new SupabaseClient();

  // 1. Fetch live 'suppliers' table
  const supRes = await client.fetchTableData('suppliers');
  console.log('1️⃣ Live Supabase `suppliers` table result:', supRes.success ? `SUCCESS (${supRes.data.length} records)` : `FAILED (Status ${supRes.status})`);
  if (supRes.success && supRes.data.length > 0) {
    console.log('   Sample Supplier Row columns:', Object.keys(supRes.data[0]));
    console.log('   Sample Supplier Data:', JSON.stringify(supRes.data[0], null, 2));
  }

  // 2. Fetch live 'inventory' table columns to see if supplier fields exist on inventory items
  const invRes = await client.fetchTableData('inventory');
  console.log('\n2️⃣ Live Supabase `inventory` table result:', invRes.success ? `SUCCESS (${invRes.data.length} records)` : `FAILED (Status ${invRes.status})`);
  if (invRes.success && invRes.data.length > 0) {
    console.log('   Sample Inventory Row columns:', Object.keys(invRes.data[0]));
    const sample = invRes.data[0];
    console.log('   Inventory Supplier-related fields:');
    console.log('     - default_supplier_code:', sample.default_supplier_code || sample.defaultSupplierCode || 'N/A');
    console.log('     - unit_valuation:', sample.unit_valuation || sample.unitValuation || 'N/A');
    console.log('     - last_purchase_price:', sample.last_purchase_price || sample.lastPurchasePrice || 'N/A');
    if (sample.data) {
      console.log('     - data.preferredSupplier:', sample.data.preferredSupplier || 'N/A');
      console.log('     - data.lastPurchasePrice:', sample.data.lastPurchasePrice || 'N/A');
    }
  }

  // 3. Test potential existing catalog tables in Supabase
  const candidateTables = [
    'supplier_items',
    'supplier_catalog',
    'supplier_catalogue',
    'supplier_prices',
    'vendor_catalog',
    'item_suppliers'
  ];

  console.log('\n3️⃣ Probing potential Supplier-Item Catalogue tables in Supabase:');
  for (const table of candidateTables) {
    const res = await client.fetchTableData(table);
    if (res.success) {
      console.log(`   ✅ Table \`${table}\` EXISTS in Supabase! Row count: ${res.data.length}`);
      if (res.data.length > 0) {
        console.log(`      Columns:`, Object.keys(res.data[0]));
        console.log(`      Sample Row:`, JSON.stringify(res.data[0], null, 2));
      }
    } else {
      console.log(`   ❌ Table \`${table}\` does NOT exist in Supabase (Status: ${res.status})`);
    }
  }

  console.log('\n====================================================================');
}

auditSupplierCatalogSchema().catch(console.error);
