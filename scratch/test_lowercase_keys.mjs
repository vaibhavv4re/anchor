import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

const client = new SupabaseClient();

async function testLowercaseKeys() {
  const testOpId = `cons_cert_${Date.now()}`;
  const rpcPayload = {
    p_tenant_id: 'tenant_h0qc7wf',
    p_operation_id: testOpId,
    p_reference_id: 'ord_4rf1ih9',
    p_reference_line_id: 'line_ord_4rf1ih9_1',
    p_recipe_id: 'rcp-ajgdpxm',
    p_recipe_version: 'v1.0',
    p_occurred_at: new Date().toISOString(),
    p_performed_by: 'Chef Forensic Test',
    p_correlation_id: `corr_${Date.now()}`,
    p_items: [
      {
        itemcode: 'RM0310',
        itemname: 'Fresh Tomatoes',
        locationcode: 'LOC-886',
        quantity: 0.20,
        uom: 'KG'
      }
    ]
  };

  console.log("Calling RPC with lowercase keys in p_items...");
  const res = await client.rpc('rpc_record_sale_consumption', rpcPayload);
  console.log("RPC Result:", JSON.stringify(res, null, 2));

  // Also query stock_balances, operations, transactions
  const url = `${client.baseUrl}/stock_balances?id=eq.sb-1788705000707-aa0r`;
  const balRes = await fetch(url, { headers: client.getHeaders() });
  const bal = await balRes.json();
  console.log("Stock balance now:", {
    quantity: bal[0]?.quantity,
    data_qty: bal[0]?.data?.quantity,
    data_val: bal[0]?.data?.valuation
  });

  const opsRes = await fetch(`${client.baseUrl}/stock_operations?operation_id=eq.${testOpId}`, { headers: client.getHeaders() });
  const ops = await opsRes.json();
  console.log("Operations count:", ops.length);

  const txRes = await fetch(`${client.baseUrl}/stock_transactions?operation_id=eq.${testOpId}`, { headers: client.getHeaders() });
  const tx = await txRes.json();
  console.log("Transactions count:", tx.length, tx[0]);
}

testLowercaseKeys().catch(console.error);
