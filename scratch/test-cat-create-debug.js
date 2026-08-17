import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

async function debugCreateCat() {
  const client = new SupabaseClient();
  const testCat = {
    id: 'cat-test-1',
    tenant_id: 'tenant_h0qc7wf',
    category_code: 'CAT-TEST',
    category_name: 'Test Category',
    product_family_name: 'Meat & Poultry',
    default_uom: 'KG',
    status: 'ACTIVE'
  };

  console.log('Sending test record to Supabase table inventory_categories...');
  const res = await client.createRecord('inventory_categories', testCat);
  console.log('Create Record Result:', JSON.stringify(res, null, 2));

  console.log('Fetching inventory_categories from Supabase...');
  const getRes = await client.fetchTableData('inventory_categories');
  console.log('Get Collection Result:', JSON.stringify(getRes, null, 2));
}

debugCreateCat();
