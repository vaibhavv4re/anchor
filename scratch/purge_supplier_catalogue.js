import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

async function purgeSupplierCatalogue() {
  console.log('----------------------------------------------------');
  console.log('🗑 PURGING SUPPLIER CATALOGUE FROM SUPABASE CLOUD & LOCAL');
  console.log('----------------------------------------------------\n');

  const client = new SupabaseClient();

  // 1. Fetch current records to delete by ID
  const current = await client.fetchTableData('supplier_catalog');
  const records = (current && current.data) ? current.data : [];
  console.log(`Found ${records.length} records in Supabase table "supplier_catalog".`);

  let deletedCount = 0;
  for (const rec of records) {
    const id = rec.id;
    const res = await client.deleteRecords('supplier_catalog', `id=eq.${id}`);
    if (res.success) deletedCount++;
  }
  console.log(`Successfully deleted ${deletedCount} records from Supabase Cloud table "supplier_catalog".`);

  // 2. Clear local storage stores as well
  offlineStore.setCollection('supplier_catalogue', []);
  offlineStore.setCollection('supplier_catalog', []);
  console.log('Cleared local offlineStore collections ("supplier_catalogue" & "supplier_catalog").');

  // 3. Verify Supabase check
  const check = await client.fetchTableData('supplier_catalog');
  const remaining = check && check.data ? check.data.length : 0;
  console.log(`\nVerification: Records remaining in live Supabase "supplier_catalog": ${remaining}`);

  if (remaining === 0) {
    console.log('\n----------------------------------------------------');
    console.log('✅ SUPPLIER CATALOGUE PURGED 100% — READY FOR FRESH IMPORT');
    console.log('----------------------------------------------------');
  } else {
    console.log(`\n⚠️ WARNING: ${remaining} records still remain in Supabase.`);
  }
}

purgeSupplierCatalogue();
