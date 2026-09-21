import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

const TENANT_ID = 'tenant_h0qc7wf';
const supabase = new SupabaseClient();
const BASE_URL = supabase.baseUrl;
const HEADERS = supabase.getHeaders();

async function reset() {
  const resp = await fetch(`${BASE_URL}/stock_balances?tenant_id=eq.${TENANT_ID}&location_code=eq.LOC-314&item_code=eq.BAR0005`, {
    method: 'PATCH',
    headers: { ...HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({
      quantity: 4.0,
      valuation: 9600,
      data: {
        id: 'sb-314-bar0005',
        itemCode: 'BAR0005',
        quantity: 4.0,
        tenantId: 'tenant_h0qc7wf',
        unitCost: 2400,
        valuation: 9600,
        locationCode: 'LOC-314'
      }
    })
  });
  console.log("Status:", resp.status);
  console.log("Result:", await resp.json());
}
reset();
