import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

async function checkSupabaseRPC() {
  const client = new SupabaseClient();

  console.log('Checking Supabase RPC endpoint for table creation capabilities...');
  
  // Test POST to /rpc/exec_sql or /rpc
  try {
    const resp = await fetch(`${client.baseUrl}/rpc/`, {
      method: 'GET',
      headers: client.getHeaders()
    });
    console.log('RPC GET Status:', resp.status);
    const text = await resp.text();
    console.log('RPC Response:', text.substring(0, 300));
  } catch (e) {
    console.error('RPC check error:', e.message);
  }
}

checkSupabaseRPC().catch(console.error);
