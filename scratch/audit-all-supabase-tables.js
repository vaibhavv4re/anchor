import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

async function auditAllSupabaseTables() {
  const client = new SupabaseClient();

  const candidateTables = [
    'tenants',
    'identities',
    'employees',
    'roles',
    'sessions',
    'dining_areas',
    'tables_master',
    'menu_catalog',
    'menu_items',
    'menu_categories',
    'inventory',
    'suppliers',
    'storage_locations',
    'devices',
    'system_config',
    'orders',
    'tickets',
    'attendance_logs',
    'audit_logs'
  ];

  console.log('====================================================================');
  console.log('SUPABASE CLOUD POSTGRESQL TABLE AUDIT');
  console.log('====================================================================\n');

  console.log('Checking 19 candidate table endpoints at https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1...\n');

  for (const table of candidateTables) {
    const res = await client.fetchTableData(table);
    if (res.success && Array.isArray(res.data)) {
      console.log(`✅ Table EXISTS in Supabase: "${table}" (${res.data.length} rows)`);
      if (res.data.length > 0) {
        console.log(`   Columns:`, Object.keys(res.data[0]).join(', '));
      }
    } else {
      console.log(`❌ Table MISSING in Supabase (404/Error): "${table}" (Status: ${res.status || 'Error'})`);
    }
  }
}

auditAllSupabaseTables().catch(console.error);
