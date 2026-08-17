import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

async function inspectInventoryTable() {
  const client = new SupabaseClient();
  const res = await client.fetchTableData('inventory');

  if (res.success && Array.isArray(res.data)) {
    console.log(`====================================================================`);
    console.log(`INVENTORY TABLE IN SUPABASE (${res.data.length} ROWS)`);
    console.log(`====================================================================\n`);

    const itemTypes = new Set();
    const categories = new Set();

    res.data.forEach((row, i) => {
      itemTypes.add(row.item_type || row.itemType);
      categories.add(row.category_code || row.categoryCode);
      if (i < 10) {
        console.log(`Item #${i+1}: ${row.item_code} | Name: "${row.item_name}" | Type: ${row.item_type} | Category: ${row.category_code} | Base UOM: ${row.base_uom}`);
      }
    });

    console.log('\nSummary of Item Types in Supabase inventory table:', Array.from(itemTypes));
    console.log('Summary of Categories in Supabase inventory table:', Array.from(categories));
  }
}

inspectInventoryTable().catch(console.error);
