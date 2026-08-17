import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';

async function traceTenantDataPipeline() {
  const client = new SupabaseClient();
  const adapter = new SupabaseDataAdapter(client);
  const tenantId = 'tenant_h0qc7wf';

  console.log(`====================================================================`);
  console.log(`SYSTEMATIC DATA PIPELINE TRACE FOR TENANT: ${tenantId}`);
  console.log(`====================================================================\n`);

  const domains = [
    { name: '1. Restaurant Information', collection: 'tenants', key: 'tenant_id / id' },
    { name: '2. Dining Areas', collection: 'dining_areas', key: 'tenant_id / tenantId' },
    { name: '3. Tables', collection: 'tables_master', key: 'tenant_id / tenantId' },
    { name: '4. Staff & Employees', collection: 'employees', key: 'tenant_id / tenantId' },
    { name: '5. Identities / PINs', collection: 'identities', key: 'tenant_id / tenantId' },
    { name: '6. Menu Catalog', collection: 'menu_catalog', key: 'tenant_id / tenantId' },
    { name: '7. Master Inventory', collection: 'inventory', key: 'tenant_id / tenantId' },
    { name: '8. Terminal Devices', collection: 'devices', key: 'tenant_id / tenantId' },
    { name: '9. System / Tax Config', collection: 'system_config', key: 'tenant_id / tenantId' }
  ];

  for (const domain of domains) {
    const rawList = await adapter.getCollection(domain.collection);
    const tenantScopedList = rawList.filter(item => {
      const itemTenant = item.tenant_id || item.tenantId || item.id;
      return itemTenant === tenantId || domain.collection === 'tenants';
    });

    console.log(`--------------------------------------------------------------------`);
    console.log(`📦 Domain: ${domain.name}`);
    console.log(`   Physical Collection: "${domain.collection}"`);
    console.log(`   Total Rows in Supabase: ${rawList.length}`);
    console.log(`   Tenant Scoped (${tenantId}): ${tenantScopedList.length}`);
    console.log(`--------------------------------------------------------------------`);

    if (tenantScopedList.length > 0) {
      tenantScopedList.slice(0, 5).forEach((row, i) => {
        console.log(`   [Row ${i + 1}] PK: ${row.id || row.tenant_id || row.uuid} | Data:`, JSON.stringify(row).substring(0, 120));
      });
      if (tenantScopedList.length > 5) {
        console.log(`   ... (+${tenantScopedList.length - 5} more rows)`);
      }
    } else {
      console.log(`   ⚠️ ZERO ROWS FOUND IN SUPABASE FOR THIS TENANT`);
    }
    console.log('');
  }
}

traceTenantDataPipeline().catch(console.error);
