import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

const client = new SupabaseClient();

async function queryTable(tableName, filterQuery = '') {
  const url = `${client.baseUrl}/${tableName}${filterQuery ? '?' + filterQuery : ''}`;
  const res = await fetch(url, { headers: client.getHeaders() });
  return await res.json();
}

async function runTest() {
  console.log("=== 1. Resetting baseline balance for RM0310 @ LOC-886 to 5.0 KG ===");
  const targetId = 'sb-1788705000707-aa0r';
  
  const existingRecords = await queryTable('stock_balances', `id=eq.${targetId}`);
  const existing = existingRecords[0];
  console.log("Existing record before reset:", {
    id: existing?.id,
    quantity: existing?.quantity,
    data_quantity: existing?.data?.quantity,
    inner_data_quantity: existing?.data?.data?.quantity
  });

  const cleanData = {
    quantity: 5.0,
    valuation: 150.0,
    costPerUnit: 30.0,
    itemCode: 'RM0310',
    itemName: 'Fresh Tomatoes',
    locationCode: 'LOC-886',
    uom: 'KG'
  };

  const resetPatch = {
    quantity: 5.0,
    valuation: 150.0,
    cost_per_unit: 30.0,
    data: cleanData
  };

  const patchResult = await client.updateRecord('stock_balances', targetId, resetPatch);
  console.log("Balance reset result success:", patchResult.success, "Data:", patchResult.data?.quantity);

  // Check Supabase after reset
  const afterReset = await queryTable('stock_balances', `id=eq.${targetId}`);
  console.log("After reset record in Supabase:", {
    quantity: afterReset[0]?.quantity,
    data_quantity: afterReset[0]?.data?.quantity,
    data_data: afterReset[0]?.data?.data
  });

  console.log("\n=== 2. Testing order filter key for order ord_4rf1ih9 ===");
  const orderFilter = client.getFilterKey('orders', 'ord_4rf1ih9');
  console.log("Computed order filter key:", orderFilter);

  const orderRecords = await queryTable('orders', orderFilter);
  console.log("Fetched order record count:", orderRecords.length);
  if (orderRecords.length > 0) {
    console.log("Fetched order status:", orderRecords[0].status, "table_code:", orderRecords[0].table_code, "order_number:", orderRecords[0].order_number);
  }

  console.log("\n=== 3. Testing rpc_record_sale_consumption directly with 0.20 KG deduction ===");
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
        itemCode: 'RM0310',
        itemName: 'Fresh Tomatoes',
        locationCode: 'LOC-886',
        quantity: 0.20,
        uom: 'KG'
      }
    ]
  };

  const rpcResult = await client.rpc('rpc_record_sale_consumption', rpcPayload);
  console.log("RPC execution result:", JSON.stringify(rpcResult, null, 2));

  console.log("\n=== 4. Verifying post-RPC balances and ledger tables ===");
  const updatedBalances = await queryTable('stock_balances', `id=eq.${targetId}`);
  const b = updatedBalances[0];
  console.log(`Balance after RPC -> SQL Qty: ${b.quantity} | data.quantity: ${b.data?.quantity} | data.valuation: ${b.data?.valuation}`);

  const operations = await queryTable('stock_operations', `operation_id=eq.${testOpId}`);
  console.log(`Operations count for ${testOpId}:`, operations.length);
  if (operations.length > 0) {
    console.log("Operation row:", {
      operation_id: operations[0].operation_id,
      operation_type: operations[0].operation_type,
      reference_id: operations[0].reference_id,
      reference_line_id: operations[0].reference_line_id,
      occurred_at: operations[0].occurred_at
    });
  }

  const transactions = await queryTable('stock_transactions', `operation_id=eq.${testOpId}`);
  console.log(`Transactions count for ${testOpId}:`, transactions.length);
  if (transactions.length > 0) {
    console.log("Transaction row:", {
      transaction_id: transactions[0].transaction_id,
      item_code: transactions[0].item_code,
      location_code: transactions[0].location_code,
      quantity: transactions[0].quantity,
      occurred_at: transactions[0].occurred_at
    });
  }

  console.log("\n=== 5. Testing Idempotency Guard (Replaying identical RPC payload) ===");
  const replayResult = await client.rpc('rpc_record_sale_consumption', rpcPayload);
  console.log("Replay RPC result:", JSON.stringify(replayResult, null, 2));

  const afterReplayBalances = await queryTable('stock_balances', `id=eq.${targetId}`);
  console.log(`Balance after Replay (should stay unchanged at 4.8 KG): ${afterReplayBalances[0].quantity} KG`);
}

runTest().catch(console.error);
