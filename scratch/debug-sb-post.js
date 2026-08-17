import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

async function debugSbPost() {
  const client = new SupabaseClient();
  const testRecord = {
    id: `sb-test-${Date.now()}`,
    tenantId: 'tenant_h0qc7wf',
    tenant_id: 'tenant_h0qc7wf',
    itemCode: 'RM5712',
    item_code: 'RM5712',
    locationCode: 'LOC-805',
    location_code: 'LOC-805',
    quantity: 50,
    unitCost: 152,
    unit_cost: 152,
    valuation: 7600,
    status: 'ACTIVE'
  };

  console.log('Sending test record to stock_balances:', testRecord);
  const res = await client.createRecord('stock_balances', testRecord);
  console.log('Response:', JSON.stringify(res, null, 2));
}

debugSbPost().catch(console.error);
