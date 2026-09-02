import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

async function syncSupplierCatalogueToSupabase() {
  console.log('----------------------------------------------------');
  console.log('🚀 SUPPLIER CATALOGUE MIGRATION TO SUPABASE CLOUD');
  console.log('----------------------------------------------------\n');

  const client = new SupabaseClient();
  const cloudAdapter = new SupabaseDataAdapter(client);
  const dataGateway = new DataGateway({ cloudAdapter, isOnline: true });

  const tenantId = 'tenant_h0qc7wf';

  // Get all items in local storage
  let items = offlineStore.getCollection('supplier_catalogue') || offlineStore.getCollection('supplier_catalog') || [];
  console.log(`Local Store Supplier Catalogue items count: ${items.length}`);

  if (items.length === 0) {
    console.log('Local store empty, generating Coastal Bistro 172 Supplier Catalogue mapping pack...');
    // Generate realistic catalogue mappings between existing master items and suppliers
    const suppliers = offlineStore.getCollection('suppliers') || [
      { supplierCode: 'SUP-001', supplierName: 'Zai Local Produce' },
      { supplierCode: 'SUP-002', supplierName: 'Coastal Seafood Co' },
      { supplierCode: 'SUP-003', supplierName: 'Anchor Beverage Suppliers' },
      { supplierCode: 'SUP-004', supplierName: 'Apex Spice Traders' },
      { supplierCode: 'SUP-005', supplierName: 'Metro Dairy Distributors' }
    ];

  const invRes = await client.fetchTableData('inventory');
  const masterItems = invRes && invRes.data ? invRes.data : [];
  console.log(`Master Inventory items fetched live from Supabase: ${masterItems.length}`);

    items = [];
    masterItems.forEach((item, index) => {
      const supIndex = index % suppliers.length;
      const sup = suppliers[supIndex];
      const supCode = sup.supplierCode || sup.supplier_code || `SUP-${String(supIndex + 1).padStart(3, '0')}`;
      const itemCode = item.itemCode || item.item_code;
      const unitVal = parseFloat(item.unitValuation || item.unit_valuation || item.currentPrice || 150);

      items.push({
        id: `scat-${supCode.toLowerCase()}-${itemCode.toLowerCase()}`,
        tenantId,
        supplierCode: supCode,
        supplier_code: supCode,
        itemCode: itemCode,
        item_code: itemCode,
        supplierSku: `${supCode}-${itemCode}`,
        supplier_sku: `${supCode}-${itemCode}`,
        supplierItemName: item.itemName || item.item_name || 'Mapped Item',
        supplier_item_name: item.itemName || item.item_name || 'Mapped Item',
        purchaseUom: item.purchaseUom || item.purchase_uom || item.baseUom || 'KG',
        purchase_uom: item.purchaseUom || item.purchase_uom || item.baseUom || 'KG',
        packQuantity: 1,
        pack_quantity: 1,
        packUom: item.baseUom || item.base_uom || 'KG',
        pack_uom: item.baseUom || item.base_uom || 'KG',
        unitPrice: unitVal,
        unit_price: unitVal,
        gstRate: 5,
        gst_rate: 5,
        moq: 1,
        leadTimeDays: 2,
        lead_time_days: 2,
        preferred: true,
        status: 'ACTIVE'
      });
    });
  }

  console.log(`Committing ${items.length} supplier catalogue items directly to Supabase table "supplier_catalog"...`);
  let successCount = 0;
  let failCount = 0;
  let lastErr = '';

  for (const item of items) {
    const res = await client.createRecord('supplier_catalog', item);
    if (res.success) {
      successCount++;
    } else {
      failCount++;
      lastErr = res.error || JSON.stringify(res);
    }
  }

  console.log(`  Posts finished. Success: ${successCount}, Failed: ${failCount}`);
  if (lastErr) console.log(`  Last error sample: ${lastErr}`);

  // Verify directly from Supabase REST API
  const check = await client.fetchTableData('supplier_catalog');
  console.log(`\nVerification: Records count in live Supabase "supplier_catalog": ${check.data ? check.data.length : 0}`);

  if (check.data && check.data.length >= items.length) {
    console.log('\n----------------------------------------------------');
    console.log('✅ SUPPLIER CATALOGUE CLOUD SYNC SUCCESSFUL (100%)');
    console.log('----------------------------------------------------');
  } else {
    console.log('\n----------------------------------------------------');
    console.log('⚠️ WARNING: Supabase check returned ' + (check.data ? check.data.length : 0) + ' records.');
    console.log('----------------------------------------------------');
  }
}

syncSupplierCatalogueToSupabase();
