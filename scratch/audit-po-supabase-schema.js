import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

async function auditPoSupabaseSchema() {
  console.log('🔍 INSPECTING ALL LIVE SUPABASE `purchase_orders` RECORDS\n');
  const client = new SupabaseClient();

  const res = await client.fetchTableData('purchase_orders');
  console.log('API Fetch Status:', res.success ? `SUCCESS (${res.data.length} records)` : `FAILED (${res.status})`);
  
  if (res.success) {
    res.data.forEach((row, idx) => {
      console.log(`\n--- Record #${idx + 1} (${row.id}) ---`);
      console.log(`PO #: ${row.po_number || row.data?.poNumber}`);
      console.log(`Supplier Code: ${row.supplier_code || row.data?.supplierCode}`);
      console.log(`Supplier Name: ${row.supplier_name || row.data?.supplierName}`);
      console.log(`Status: ${row.status}`);
      console.log(`Total Amount: ₹${row.total_amount || row.data?.grandTotal}`);
      console.log(`Lines Count: ${row.data?.lines ? row.data.lines.length : 0}`);
    });
  }
}

auditPoSupabaseSchema().catch(console.error);
