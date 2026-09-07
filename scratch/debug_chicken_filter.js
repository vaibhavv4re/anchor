import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';

async function debugChickenFilter() {
  const client = new SupabaseClient();
  const adapter = new SupabaseDataAdapter(client);

  const tenantId = 'tenant_h0qc7wf';

  console.log('1. Fetching Master Inventory items from Supabase...');
  const items = await adapter.getCollection('inventory', tenantId);
  console.log(`Fetched ${items.length} master inventory items.`);

  const chickenMaster = items.find(i => (i.itemCode || i.item_code || '').toUpperCase().includes('RM0102') || (i.itemName || i.item_name || '').toLowerCase().includes('chicken'));
  console.log('\nSample Chicken Master Item:');
  console.log(JSON.stringify(chickenMaster, null, 2));

  console.log('\n2. Fetching Supplier Catalogue items from Supabase...');
  const catItems = await adapter.getCollection('supplier_catalog', tenantId);
  console.log(`Fetched ${catItems.length} supplier catalogue items.`);

  const chickenCat = catItems.find(c => (c.itemCode || c.item_code || '').toUpperCase().includes('RM0102') || (c.supplierItemName || c.supplier_item_name || '').toLowerCase().includes('chicken'));
  console.log('\nSample Chicken Catalogue Item:');
  console.log(JSON.stringify(chickenCat, null, 2));

  if (chickenMaster && chickenCat) {
    const masterCode = (chickenMaster.itemCode || chickenMaster.item_code || '').toUpperCase();
    const catItemCode = (chickenCat.itemCode || chickenCat.item_code || '').toUpperCase();
    console.log(`\nComparison: Master Code "${masterCode}" vs Catalogue Item Code "${catItemCode}": Match = ${masterCode === catItemCode}`);
    console.log(`Master Item Category Code: "${chickenMaster.categoryCode || chickenMaster.category_code || chickenMaster.category}"`);
  }
}

debugChickenFilter();
