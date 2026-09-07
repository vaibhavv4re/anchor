import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

async function checkEmpty() {
  const client = new SupabaseClient();
  const res = await client.fetchTableData('supplier_catalog');
  console.log(`Live Supabase "supplier_catalog" total records: ${res.data ? res.data.length : 0}`);
}
checkEmpty();
