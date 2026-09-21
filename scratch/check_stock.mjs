import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

const TENANT_ID = 'tenant_h0qc7wf';
const supabase = new SupabaseClient();
const BASE_URL = supabase.baseUrl;
const HEADERS = supabase.getHeaders();

async function check() {
  const resp = await fetch(`${BASE_URL}/stock_balances?tenant_id=eq.${TENANT_ID}&location_code=in.(LOC-314,LOC-805)&select=location_code,item_code,quantity`, { headers: HEADERS });
  const text = await resp.text();
  console.log("Status:", resp.status);
  console.log("Body:", text);
}
check();
