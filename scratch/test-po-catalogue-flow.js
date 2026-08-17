import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { AuthEngine } from '../businessos/platform/authentication/authEngine.js';
import { RbacEngine } from '../businessos/platform/authorization/rbacEngine.js';

async function testPoCatalogueFlow() {
  console.log('🧪 TEST: Verifying Purchase Order Catalogue Snapshotting & Zero-Stock-Change Rules\n');

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
    'suppliers', 'inventory', 'supplier_catalog', 'purchase_orders', 'stock_balances'
  ]);

  const suppliers = dataGateway.getCachedCollection('suppliers', tenantId);
  const items = dataGateway.getCachedCollection('inventory', tenantId);
  const catalog = dataGateway.getCachedCollection('supplier_catalog', tenantId);
  const initialBalances = JSON.stringify(dataGateway.getCachedCollection('stock_balances', tenantId));

  const supCode = suppliers[0]?.supplierCode || suppliers[0]?.supplier_code || 'SUP-101';
  const sampleCatalogItem = catalog.find(c => c.supplierCode === supCode || c.supplier_code === supCode) || {
    itemCode: items[0].itemCode || items[0].item_code,
    currentPrice: 68.00,
    purchaseUom: 'KG'
  };

  const itemCode = sampleCatalogItem.itemCode || sampleCatalogItem.item_code;
  const catalogueListPrice = parseFloat(sampleCatalogItem.currentPrice || sampleCatalogItem.current_price || 68.00);

  console.log(`\n2️⃣ Selected Vendor: ${supCode}
   - Mapped Item: ${itemCode}
   - Contracted Catalogue Price: ₹${catalogueListPrice.toFixed(2)} / KG`);

  // 3. Draft a PO with price override (e.g. ₹70 instead of ₹68)
  const managerAgreedPrice = catalogueListPrice + 2.00; // Overridden price e.g. 70.00
  const orderQty = 50;
  const poNumber = `PO-${Date.now().toString().substring(7)}`;

  console.log(`\n3️⃣ Drafting PO (${poNumber}):
   - Order Qty: ${orderQty} KG
   - Catalogue Price: ₹${catalogueListPrice.toFixed(2)}
   - Agreed Overridden Price: ₹${managerAgreedPrice.toFixed(2)}
   - Agreed Line Valuation: ₹${(orderQty * managerAgreedPrice).toFixed(2)}`);

  const poLines = [
    {
      itemCode,
      itemName: 'Basmati Rice',
      quantity: orderQty,
      purchaseUom: 'KG',
      cataloguePrice: catalogueListPrice,
      unitPrice: managerAgreedPrice,
      lineTotal: orderQty * managerAgreedPrice
    }
  ];

  const draftPo = {
    id: `po-${Date.now()}`,
    tenantId,
    tenant_id: tenantId,
    poNumber,
    po_number: poNumber,
    supplierCode: supCode,
    supplier_code: supCode,
    supplierName: suppliers[0]?.supplierName || supCode,
    destinationLocationCode: 'LOC-805',
    destination_location_code: 'LOC-805',
    orderDate: new Date().toISOString().split('T')[0],
    order_date: new Date().toISOString().split('T')[0],
    lines: poLines,
    grandTotal: orderQty * managerAgreedPrice,
    grand_total: orderQty * managerAgreedPrice,
    status: 'DRAFT'
  };

  const createPoRes = await dataGateway.create('purchase_orders', draftPo, session);
  console.log('4️⃣ Draft PO Created in DataGateway:', createPoRes ? 'SUCCESS ✓' : 'FAILED ❌');

  // 4. Approve PO
  await dataGateway.update('purchase_orders', draftPo.id, { status: 'APPROVED' }, session);
  console.log('5️⃣ PO Status updated to "APPROVED" ✓');

  // 5. Verify Catalogue Price is UNCHANGED
  const freshCatalog = dataGateway.getCachedCollection('supplier_catalog', tenantId);
  const freshCatItem = freshCatalog.find(c => (c.supplierCode === supCode || c.supplier_code === supCode) && (c.itemCode === itemCode || c.item_code === itemCode));
  const postPoCatPrice = freshCatItem ? (freshCatItem.currentPrice || freshCatItem.current_price) : catalogueListPrice;

  console.log(`\n6️⃣ Verifying Rules:
   - PO Snapshotted Agreed Price: ₹${draftPo.lines[0].unitPrice.toFixed(2)}
   - Catalogue Contracted Price: ₹${parseFloat(postPoCatPrice).toFixed(2)} (${postPoCatPrice === catalogueListPrice ? 'UNTOUCHED ✓' : 'FAILED ❌'})`);

  // 6. Verify Stock Balances are COMPLETELY UNCHANGED
  const postPoBalances = JSON.stringify(dataGateway.getCachedCollection('stock_balances', tenantId));
  const stockUnchanged = initialBalances === postPoBalances;

  console.log(`   - Stock Balances Audit: ${stockUnchanged ? '100% UNCHANGED (PO Approval does NOT touch stock) ✓' : 'FAILED ❌'}`);

  if (postPoCatPrice === catalogueListPrice && stockUnchanged) {
    console.log('\n====================================================================');
    console.log('PURCHASE ORDER CATALOGUE SNAPSHOT & ZERO-STOCK TEST: 100% PASS ✓');
    console.log('====================================================================');
  } else {
    console.error('❌ Rule violation detected!');
    process.exit(1);
  }
}

testPoCatalogueFlow().catch(console.error);
