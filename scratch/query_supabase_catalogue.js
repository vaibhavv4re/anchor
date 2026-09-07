import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

async function checkSupabaseCatalogueTables() {
  const client = new SupabaseClient();

  console.log('1. Querying table "supplier_catalogue"...');
  const res1 = await client.fetchTableData('supplier_catalogue');
  console.log(`  Table "supplier_catalogue" response status: ${res1.status || 'OK'}`);
  console.log(`  Records count in "supplier_catalogue": ${res1.data ? res1.data.length : 0}`);

  console.log('\n2. Querying table "supplier_catalog"...');
  const res2 = await client.fetchTableData('supplier_catalog');
  console.log(`  Table "supplier_catalog" response status: ${res2.status || 'OK'}`);
  console.log(`  Records count in "supplier_catalog": ${res2.data ? res2.data.length : 0}`);

  if (res1.data && res1.data.length > 0) {
    console.log('\nSample record from "supplier_catalogue":');
    console.log(JSON.stringify(res1.data[0], null, 2));
  }
  if (res2.data && res2.data.length > 0) {
    console.log('\nSample record from "supplier_catalog":');
    console.log(JSON.stringify(res2.data[0], null, 2));
  }
}

checkSupabaseCatalogueTables();
