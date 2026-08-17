import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

async function probeCatSchema() {
  const client = new SupabaseClient();

  const candidates = [
    { id: 'probe-1', tenant_id: 'tenant_h0qc7wf', code: 'CAT-PROBE-1', name: 'Probe 1' },
    { id: 'probe-2', tenant_id: 'tenant_h0qc7wf', category_code: 'CAT-PROBE-2', category_name: 'Probe 2' },
    { id: 'probe-3', tenant_id: 'tenant_h0qc7wf', category_code: 'CAT-PROBE-3', name: 'Probe 3' }
  ];

  for (const c of candidates) {
    console.log('\nTesting record:', JSON.stringify(c));
    const res = await client.createRecord('inventory_categories', c);
    console.log('Result:', JSON.stringify(res, null, 2));
    if (res.success) break;
  }
}

probeCatSchema();
