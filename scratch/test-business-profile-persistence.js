import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';

async function testDirectTenantUpdate() {
  const client = new SupabaseClient();
  const adapter = new SupabaseDataAdapter(client);
  const tenantId = 'tenant_h0qc7wf';

  console.log('🔍 Testing direct Supabase PATCH update on tenants table...\n');

  const patchData = {
    name: 'Anchor Bistro & Cafe',
    legalName: 'Anchor Hospitality Pvt Ltd',
    address: {
      line1: '123 Marine Drive Promenade',
      line2: 'Suite 402, Sea View Tower',
      city: 'Mumbai',
      state: 'Maharashtra',
      pinCode: '400020',
      country: 'India'
    },
    compliance: {
      gstin: '27AAAAA0000A1Z5',
      fssai: '11521001000888',
      pan: 'AAAAA0000A'
    },
    receipts: {
      header: 'Welcome to Anchor Bistro & Bar',
      footer: 'Thank you for dining with us!',
      showTaxBreakup: true,
      showFssaiOnBill: true
    }
  };

  const res = await client.updateRecord('tenants', tenantId, patchData);
  console.log('PATCH Response Result:', res);

  console.log('\n📥 Re-fetching tenants table from Supabase REST API...');
  const fetchRes = await adapter.getCollection('tenants');
  const updatedTenant = fetchRes.find(t => (t.id === tenantId || t.tenant_id === tenantId));

  console.log('Reloaded Row from Supabase:', JSON.stringify(updatedTenant, null, 2));
}

testDirectTenantUpdate().catch(console.error);
