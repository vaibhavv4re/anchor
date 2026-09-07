import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { supplierCatalogueController } from '../businessos/platform/inventory/supplierCatalogueController.js';
import { InventoryWorkspaceView } from '../restaurantos/frontend/capabilities/inventory/ui/InventoryWorkspaceView.js';

async function runPoCataloguePickerTest() {
  console.log('====================================================');
  console.log('📄 PURCHASE ORDER CATALOGUE PICKER CERTIFICATION');
  console.log('====================================================\n');

  const client = new SupabaseClient();
  const cloudAdapter = new SupabaseDataAdapter(client);
  const dataGateway = new DataGateway({ cloudAdapter, isOnline: true });
  const tenantId = 'tenant_h0qc7wf';

  // 1. Hydrate collections
  console.log('1. Hydrating suppliers, inventory, supplier_catalog from Supabase...');
  const suppliers = await dataGateway.getCollection('suppliers', tenantId);
  const items = await dataGateway.getCollection('inventory', tenantId);
  const catalogue = await dataGateway.getCollection('supplier_catalog', tenantId);

  console.log(`   Suppliers: ${suppliers.length} | Items: ${items.length} | Catalogue: ${catalogue.length}`);
  if (suppliers.length === 0 || catalogue.length === 0) {
    throw new Error('Hydration failed: suppliers or catalogue is empty!');
  }

  // 2. Instantiate InventoryWorkspaceView and test _getCollection
  const view = new InventoryWorkspaceView({ dataGateway });
  const catalogueList = view._getCollection('supplier_catalogue', tenantId);

  console.log(`\n2. InventoryWorkspaceView._getCollection('supplier_catalogue'): ${catalogueList.length} items.`);
  if (catalogueList.length < 50) {
    throw new Error(`Catalogue collection count (${catalogueList.length}) is lower than expected!`);
  }

  // 3. Test supplier catalogue mapping for every supplier code
  console.log('\n3. Verifying catalogue item counts per supplier...');
  let totalMapped = 0;
  suppliers.forEach(s => {
    const supCode = (s.supplierCode || s.supplier_code || s.id || '').toUpperCase().trim();
    const supCat = catalogueList.filter(c => {
      const cSupCode = (c.supplierCode || c.supplier_code || c.supplier_id || c.data?.supplierCode || c.data?.supplier_code || '').toUpperCase().trim();
      return cSupCode === supCode;
    });
    console.log(`   Supplier "${s.supplierName || supCode}" (${supCode}): ${supCat.length} items available`);
    if (supCat.length === 0) {
      throw new Error(`Supplier ${supCode} has 0 mapped items!`);
    }
    totalMapped += supCat.length;
  });

  // 4. Verify item picker price, name, SKU, and UOM extraction logic
  console.log('\n4. Testing Item Picker item formatting & price resolution...');
  const testSupCode = (suppliers[0].supplierCode || suppliers[0].supplier_code || '').toUpperCase().trim();
  const testCat = catalogueList.filter(c => (c.supplierCode || c.supplier_code || '').toUpperCase().trim() === testSupCode);

  testCat.slice(0, 5).forEach((c, idx) => {
    const itemCode = c.itemCode || c.item_code || c.data?.itemCode || c.data?.item_code || '';
    const itemObj = items.find(i => (i.itemCode || i.item_code || '').toUpperCase() === itemCode.toUpperCase()) || {};

    const rawPrice = c.unitPrice !== undefined ? c.unitPrice : (c.unit_price !== undefined ? c.unit_price : (c.current_price !== undefined ? c.current_price : (c.currentPrice !== undefined ? c.currentPrice : (c.cataloguePrice || c.data?.unitPrice || 0))));
    const price = parseFloat(rawPrice) || 0;
    const uom = c.purchaseUom || c.purchase_uom || c.packUom || c.pack_uom || itemObj.purchaseUom || itemObj.baseUom || 'KG';
    const itemName = itemObj.itemName || itemObj.item_name || c.supplierItemName || c.supplier_item_name || c.data?.supplierItemName || itemCode;
    const sku = c.supplierSku || c.supplier_sku || c.data?.supplierSku || '';

    console.log(`   Item #${idx + 1}: Code=${itemCode} | Name="${itemName}" | Price=₹${price} | UOM=${uom} | SKU="${sku}"`);
    if (price <= 0) throw new Error(`Item ${itemCode} resolved price to ₹0!`);
    if (!itemName) throw new Error(`Item ${itemCode} resolved empty name!`);
  });

  console.log('\n----------------------------------------------------');
  console.log('✅ PURCHASE ORDER CATALOGUE PICKER CERTIFICATION PASSED (100%)');
  console.log('----------------------------------------------------');
}

runPoCataloguePickerTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
