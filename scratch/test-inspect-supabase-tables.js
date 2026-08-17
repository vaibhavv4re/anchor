import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';

async function inspectSupabase() {
  const client = new SupabaseClient();
  const adapter = new SupabaseDataAdapter(client);

  console.log('🔍 Inspecting Live Supabase Cloud Database Tables...\n');

  const collections = ['tenants', 'dining_areas', 'tables_master', 'employees', 'identities', 'menu_catalog', 'inventory', 'devices'];

  for (const col of collections) {
    const list = await adapter.getCollection(col);
    console.log(`========================================`);
    console.log(`📋 Collection: "${col}" — Total Rows in Supabase: ${list.length}`);
    console.log(`========================================`);
    list.forEach((row, idx) => {
      console.log(`  [${idx + 1}] ID: ${row.id || row.tenant_id || row.tenantId || row.uuid || row.code} | Tenant: ${row.tenant_id || row.tenantId || 'NONE'} | Data:`, JSON.stringify(row).substring(0, 140));
    });
    console.log('');
  }
}

inspectSupabase().catch(console.error);
