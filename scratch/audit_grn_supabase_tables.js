import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

async function auditGrnSupabaseTables() {
  console.log('----------------------------------------------------');
  console.log('🔍 AUDITING SUPABASE GRN TABLES');
  console.log('----------------------------------------------------\n');

  const client = new SupabaseClient();

  const tablesToTest = [
    'goods_receipt_notes',
    'goods_received_notes',
    'goods_receipts',
    'grns',
    'purchase_orders',
    'stock_balances'
  ];

  for (const table of tablesToTest) {
    try {
      const res = await client.fetchTableData(table);
      if (res && res.success) {
        console.log(`✅ Table "${table}": FOUND (${res.data ? res.data.length : 0} rows)`);
        if (res.data && res.data.length > 0) {
          console.log(`   Sample row keys:`, Object.keys(res.data[0]));
          console.log(`   Sample identifiers:`, res.data.slice(0, 3).map(r => r.id || r.grn_number || r.grnNumber || r.po_number));
        }
      } else {
        console.log(`❌ Table "${table}": NOT FOUND or error:`, res ? res.error : 'Unknown');
      }
    } catch (e) {
      console.log(`💥 Exception fetching "${table}":`, e.message);
    }
  }
}

auditGrnSupabaseTables();
