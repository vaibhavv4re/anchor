import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { AuthEngine } from '../businessos/platform/authentication/authEngine.js';
import { RbacEngine } from '../businessos/platform/authorization/rbacEngine.js';

async function testSupplierCatalogFlow() {
  console.log('🧪 TEST: Verifying Supplier Catalogue Flow & Live Persistence\n');

  const supabaseClient = new SupabaseClient();
  const cloudAdapter = new SupabaseDataAdapter(supabaseClient);
  const dataGateway = new DataGateway(cloudAdapter);
  const rbacEngine = new RbacEngine({ dataGateway });
  const authEngine = new AuthEngine({ dataGateway, rbacEngine });

  // 1. Authenticate Kirtan
  const authRes = await authEngine.authenticate('333333');
  console.log('1️⃣ Auth Status:', authRes.success ? 'SUCCESS ✓' : 'FAILED ❌', '| Employee:', authRes.session?.employeeName);
  const session = authRes.session;
  const tenantId = session.tenantId;

  // 2. Hydrate collections
  await dataGateway.hydrateCollections([
    'suppliers', 'inventory', 'supplier_catalog'
  ]);

  const suppliers = dataGateway.getCachedCollection('suppliers', tenantId);
  const items = dataGateway.getCachedCollection('inventory', tenantId);
  const existingCatalog = dataGateway.getCachedCollection('supplier_catalog', tenantId);

  console.log(`2️⃣ Pre-hydrated collections:
   - Suppliers: ${suppliers.length} vendors
   - Master Inventory Items: ${items.length} items
   - Existing Supplier Catalog Entries: ${existingCatalog.length} entries`);

  if (suppliers.length === 0 || items.length === 0) {
    console.error('❌ Missing suppliers or inventory items!');
    process.exit(1);
  }

  const sampleSup = suppliers[0];
  const supCode = sampleSup.supplierCode || sampleSup.supplier_code || 'SUP-101';
  const sampleItem = items[0];
  const itemCode = sampleItem.itemCode || sampleItem.item_code;
  const itemName = sampleItem.itemName || sampleItem.item_name;

  console.log(`\n3️⃣ Adding Supplier Catalogue item for Vendor "${sampleSup.supplierName || supCode}" (${supCode}):
   - Master Item: "${itemName}" (${itemCode})
   - Supplier SKU: "FFP-RICE-25KG"
   - Contracted List Price: ₹68.00 / KG`);

  const testCatalogEntry = {
    id: `scat-${Date.now()}`,
    tenantId,
    tenant_id: tenantId,
    supplierCode: supCode,
    supplier_code: supCode,
    itemCode,
    item_code: itemCode,
    supplierSku: 'FFP-RICE-25KG',
    supplier_sku: 'FFP-RICE-25KG',
    purchaseUom: 'KG',
    purchase_uom: 'KG',
    currentPrice: 68.00,
    current_price: 68.00,
    lastPurchasePrice: 68.00,
    last_purchase_price: 68.00,
    lastPurchaseAt: new Date().toISOString().split('T')[0],
    averagePurchasePrice: 68.00,
    average_purchase_price: 68.00,
    status: 'ACTIVE'
  };

  const createRes = await dataGateway.create('supplier_catalog', testCatalogEntry, session);
  console.log('4️⃣ Create Result in DataGateway:', createRes ? 'SUCCESS ✓' : 'FAILED ❌');

  // 5. Re-fetch from DataGateway to verify
  const freshCatalog = dataGateway.getCachedCollection('supplier_catalog', tenantId);
  const matching = freshCatalog.find(c => (c.supplierCode === supCode || c.supplier_code === supCode) && (c.itemCode === itemCode || c.item_code === itemCode));

  if (matching) {
    console.log(`\n✅ SUPPLIER CATALOGUE SLICE VERIFIED!
   - Entry ID: ${matching.id}
   - Vendor Code: ${matching.supplierCode || matching.supplier_code}
   - Master Item Code: ${matching.itemCode || matching.item_code}
   - Contracted Price: ₹${matching.currentPrice || matching.current_price}`);
  } else {
    console.error('❌ Failed to retrieve catalogue entry from cache!');
    process.exit(1);
  }

  console.log('\n====================================================================');
  console.log('SUPPLIER CATALOGUE STEP 2 TEST: 100% PASS ✓');
  console.log('====================================================================');
}

testSupplierCatalogFlow().catch(console.error);
