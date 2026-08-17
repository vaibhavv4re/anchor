import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

async function auditAllSupabaseTables() {
  console.log('🔍 FULL DOMAIN TABLE AUDIT IN SUPABASE POSTGRESQL\n');
  const client = new SupabaseClient();

  const allDomainCollections = [
    'tenants',
    'employees',
    'inventory',
    'suppliers',
    'storage_locations',
    'inventory_categories',
    'inventory_uoms',
    'stock_balances',
    'stock_issues',
    'stock_transfers',
    'stock_adjustments',
    'stock_counts',
    'supplier_catalog',
    'purchase_orders',
    'goods_receipt_notes',
    'inventory_requests'
  ];

  const existingTables = [];
  const missingTables = [];

  for (const table of allDomainCollections) {
    const res = await client.fetchTableData(table);
    if (res.success) {
      existingTables.push({ table, count: res.data.length });
      console.log(`✅ Table \`${table}\`: EXISTS (${res.data.length} records)`);
    } else {
      missingTables.push({ table, status: res.status });
      console.log(`❌ Table \`${table}\`: MISSING (HTTP ${res.status})`);
    }
  }

  console.log('\n====================================================================');
  console.log(`SUMMARY: ${existingTables.length} Existing Tables | ${missingTables.length} Missing Tables`);
  console.log('====================================================================\n');
}

auditAllSupabaseTables().catch(console.error);
