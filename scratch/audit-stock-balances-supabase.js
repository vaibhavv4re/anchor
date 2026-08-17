import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

async function auditStockBalancesSupabase() {
  console.log('🔍 INSPECTING SUPABASE `stock_balances` & `goods_receipt_notes` TABLES\n');
  const client = new SupabaseClient();

  const sbRes = await client.fetchTableData('stock_balances');
  console.log('stock_balances Fetch Status:', sbRes.success ? `SUCCESS (${sbRes.data.length} records)` : `FAILED (${sbRes.status})`);
  if (sbRes.success && sbRes.data.length > 0) {
    console.log('stock_balances Columns:', Object.keys(sbRes.data[0]));
    console.log('Sample stock_balances Record:', JSON.stringify(sbRes.data[0], null, 2));
  }

  const grnRes = await client.fetchTableData('goods_receipt_notes');
  console.log('\ngoods_receipt_notes Fetch Status:', grnRes.success ? `SUCCESS (${grnRes.data.length} records)` : `FAILED (${grnRes.status})`);
  if (grnRes.success && grnRes.data.length > 0) {
    console.log('goods_receipt_notes Columns:', Object.keys(grnRes.data[0]));
    console.log('Sample goods_receipt_notes Record:', JSON.stringify(grnRes.data[0], null, 2));
  }
}

auditStockBalancesSupabase().catch(console.error);
