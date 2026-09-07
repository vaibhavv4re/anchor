import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

async function auditAllTables() {
  const client = new SupabaseClient();
  const collectionsToTest = [
    'tenants',
    'inventory',
    'inventory_items',
    'suppliers',
    'supplier_catalog',
    'supplier_catalogue',
    'inventory_categories',
    'product_families',
    'storage_locations',
    'purchase_orders',
    'goods_receipt_notes',
    'stock_balances',
    'inventory_requests'
  ];

  console.log('--- SUPABASE CLOUD POSTGRESQL TABLES AUDIT ---');
  for (const name of collectionsToTest) {
    const res = await client.fetchTableData(name);
    console.log(`Table "${name.padEnd(22, ' ')}": Status ${res.status || 'OK'}, Records: ${res.data ? res.data.length : 0}`);
  }
}

auditAllTables();
