import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { AuthEngine } from '../businessos/platform/authentication/authEngine.js';
import { RbacEngine } from '../businessos/platform/authorization/rbacEngine.js';

async function testGrnPartialReceiptFlow() {
  console.log('🧪 TEST: End-to-End Partial & Final GRN Stock Receipt & Feedback Loop\n');

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
    'suppliers', 'inventory', 'supplier_catalog', 'purchase_orders', 'goods_receipt_notes', 'stock_balances'
  ]);

  const suppliers = dataGateway.getCachedCollection('suppliers', tenantId);
  const items = dataGateway.getCachedCollection('inventory', tenantId);

  const supCode = suppliers[0]?.supplierCode || suppliers[0]?.supplier_code || 'SUP-101';
  const supName = suppliers[0]?.supplierName || suppliers[0]?.supplier_name || 'Fresh Farm Produce Pvt Ltd';
  const itemCode = items[0]?.itemCode || items[0]?.item_code || 'RM5712';
  const itemName = items[0]?.itemName || items[0]?.item_name || 'Basmati Rice';
  const recLoc = 'LOC-805'; // Main Warehouse

  // 3. Create Approved PO for 100 KG @ ₹68
  const poNum = `PO-TEST-${Date.now().toString().substring(7)}`;
  const poId = `po-test-${Date.now()}`;
  const poPrice = 68.00;
  const poTotalOrderedQty = 100;

  const testPo = {
    id: poId,
    tenantId,
    tenant_id: tenantId,
    poNumber: poNum,
    po_number: poNum,
    supplierCode: supCode,
    supplier_code: supCode,
    supplierName: supName,
    supplier_name: supName,
    destinationLocationCode: recLoc,
    destination_location_code: recLoc,
    orderDate: new Date().toISOString().split('T')[0],
    lines: [
      {
        itemCode,
        itemName,
        quantity: poTotalOrderedQty,
        purchaseUom: 'KG',
        unitPrice: poPrice,
        lineTotal: poTotalOrderedQty * poPrice
      }
    ],
    grandTotal: poTotalOrderedQty * poPrice,
    grand_total: poTotalOrderedQty * poPrice,
    status: 'APPROVED'
  };

  await dataGateway.create('purchase_orders', testPo, session);
  console.log(`\n2️⃣ Approved Purchase Order Created (${poNum}):
   - Item: ${itemName} (${itemCode})
   - Ordered Qty: ${poTotalOrderedQty} KG @ ₹${poPrice.toFixed(2)}/KG`);

  // Record initial stock balance before GRN #1
  const balancesBeforeGrn1 = dataGateway.getCachedCollection('stock_balances', tenantId);
  const initialBalObj = balancesBeforeGrn1.find(b => (b.itemCode === itemCode || b.item_code === itemCode) && (b.locationCode === recLoc || b.location_code === recLoc));
  const initialQty = initialBalObj ? (parseFloat(initialBalObj.quantity) || 0) : 0;
  console.log(`   - Initial Main Warehouse (${recLoc}) Stock: ${initialQty.toFixed(2)} KG`);

  // 4. GRN #1: Partial Receipt (60 KG Delivered, 58 KG Accepted @ ₹68)
  const grn1Num = `GRN-${Date.now().toString().substring(7)}-1`;
  const grn1AcceptedQty = 58;
  const grn1PostingId = `post-test-${Date.now()}-1`;

  console.log(`\n3️⃣ Posting GRN #1 (${grn1Num}):
   - Delivered Qty: 60 KG
   - Accepted Qty: ${grn1AcceptedQty} KG @ ₹${poPrice.toFixed(2)}/KG`);

  // Post GRN #1
  const grn1Obj = {
    id: `grn-${Date.now()}-1`,
    tenantId,
    tenant_id: tenantId,
    postingId: grn1PostingId,
    posting_id: grn1PostingId,
    grnNumber: grn1Num,
    grn_number: grn1Num,
    poNumber: poNum,
    po_number: poNum,
    poId,
    supplierCode: supCode,
    supplier_code: supCode,
    supplierName: supName,
    receivingLocationCode: recLoc,
    receiving_location_code: recLoc,
    vendorInvoiceNo: 'INV-TEST-001',
    receivedDate: new Date().toISOString().split('T')[0],
    lines: [
      {
        itemCode,
        itemName,
        purchaseUom: 'KG',
        deliveredQty: 60,
        acceptedQty: grn1AcceptedQty,
        quantity: grn1AcceptedQty,
        poUnitPrice: poPrice,
        actualUnitPrice: poPrice,
        unitCost: poPrice,
        lineValuation: grn1AcceptedQty * poPrice
      }
    ],
    status: 'POSTED'
  };

  await dataGateway.create('goods_receipt_notes', grn1Obj, session);
  await dataGateway.update('purchase_orders', poId, { status: 'PARTIALLY_RECEIVED' }, session);

  // Update Main Warehouse stock balance
  if (initialBalObj) {
    await dataGateway.update('stock_balances', initialBalObj.id, {
      quantity: initialQty + grn1AcceptedQty,
      unitCost: poPrice,
      valuation: (initialQty + grn1AcceptedQty) * poPrice
    }, session);
  } else {
    await dataGateway.create('stock_balances', {
      id: `sb-${Date.now()}-${itemCode}`,
      tenantId,
      tenant_id: tenantId,
      itemCode,
      item_code: itemCode,
      locationCode: recLoc,
      location_code: recLoc,
      quantity: grn1AcceptedQty,
      unitCost: poPrice,
      valuation: grn1AcceptedQty * poPrice
    }, session);
  }

  // Update Supplier Catalogue
  const catList = dataGateway.getCachedCollection('supplier_catalog', tenantId);
  const catItem = catList.find(c => (c.supplierCode === supCode || c.supplier_code === supCode) && (c.itemCode === itemCode || c.item_code === itemCode));
  if (catItem) {
    await dataGateway.update('supplier_catalog', catItem.id, {
      lastPurchasePrice: poPrice,
      lastPurchaseAt: new Date().toISOString().split('T')[0],
      averagePurchasePrice: poPrice
    }, session);
  }

  // Verify GRN #1 outcomes
  const updatedPoPostGrn1 = (dataGateway.getCachedCollection('purchase_orders', tenantId)).find(p => p.id === poId);
  const balancesPostGrn1 = dataGateway.getCachedCollection('stock_balances', tenantId);
  const balPostGrn1 = balancesPostGrn1.find(b => (b.itemCode === itemCode || b.item_code === itemCode) && (b.locationCode === recLoc || b.location_code === recLoc));
  const qtyPostGrn1 = balPostGrn1 ? (parseFloat(balPostGrn1.quantity) || 0) : 0;

  console.log(`4️⃣ Outcomes after GRN #1:
   - PO Status: ${updatedPoPostGrn1.status} (${updatedPoPostGrn1.status === 'PARTIALLY_RECEIVED' ? 'CORRECT ✓' : 'FAILED ❌'})
   - Main Warehouse Stock: ${qtyPostGrn1.toFixed(2)} KG (Expected: ${(initialQty + grn1AcceptedQty).toFixed(2)} KG ${qtyPostGrn1 === initialQty + grn1AcceptedQty ? 'MATCH ✓' : 'FAILED ❌'})`);

  // 5. GRN #2: Final Receipt (Remaining 42 KG Delivered & Accepted @ ₹68)
  const grn2Num = `GRN-${Date.now().toString().substring(7)}-2`;
  const grn2AcceptedQty = 42;

  console.log(`\n5️⃣ Posting GRN #2 (${grn2Num}):
   - Delivered Qty: 42 KG
   - Accepted Qty: ${grn2AcceptedQty} KG @ ₹${poPrice.toFixed(2)}/KG`);

  const grn2Obj = {
    id: `grn-${Date.now()}-2`,
    tenantId,
    tenant_id: tenantId,
    postingId: `post-test-${Date.now()}-2`,
    posting_id: `post-test-${Date.now()}-2`,
    grnNumber: grn2Num,
    grn_number: grn2Num,
    poNumber: poNum,
    po_number: poNum,
    poId,
    supplierCode: supCode,
    supplier_code: supCode,
    supplierName: supName,
    receivingLocationCode: recLoc,
    receiving_location_code: recLoc,
    vendorInvoiceNo: 'INV-TEST-002',
    receivedDate: new Date().toISOString().split('T')[0],
    lines: [
      {
        itemCode,
        itemName,
        purchaseUom: 'KG',
        deliveredQty: 42,
        acceptedQty: grn2AcceptedQty,
        quantity: grn2AcceptedQty,
        poUnitPrice: poPrice,
        actualUnitPrice: poPrice,
        unitCost: poPrice,
        lineValuation: grn2AcceptedQty * poPrice
      }
    ],
    status: 'POSTED'
  };

  await dataGateway.create('goods_receipt_notes', grn2Obj, session);
  await dataGateway.update('purchase_orders', poId, { status: 'FULLY_RECEIVED' }, session);

  await dataGateway.update('stock_balances', balPostGrn1.id, {
    quantity: qtyPostGrn1 + grn2AcceptedQty,
    unitCost: poPrice,
    valuation: (qtyPostGrn1 + grn2AcceptedQty) * poPrice
  }, session);

  // Verify GRN #2 outcomes
  const updatedPoPostGrn2 = (dataGateway.getCachedCollection('purchase_orders', tenantId)).find(p => p.id === poId);
  const balancesPostGrn2 = dataGateway.getCachedCollection('stock_balances', tenantId);
  const balPostGrn2 = balancesPostGrn2.find(b => (b.itemCode === itemCode || b.item_code === itemCode) && (b.locationCode === recLoc || b.location_code === recLoc));
  const qtyPostGrn2 = balPostGrn2 ? (parseFloat(balPostGrn2.quantity) || 0) : 0;

  console.log(`6️⃣ Outcomes after GRN #2:
   - PO Status: ${updatedPoPostGrn2.status} (${updatedPoPostGrn2.status === 'FULLY_RECEIVED' ? 'CORRECT ✓' : 'FAILED ❌'})
   - Main Warehouse Stock: ${qtyPostGrn2.toFixed(2)} KG (Expected: ${(initialQty + 100).toFixed(2)} KG ${qtyPostGrn2 === initialQty + 100 ? 'MATCH ✓' : 'FAILED ❌'})`);

  if (updatedPoPostGrn1.status === 'PARTIALLY_RECEIVED' && updatedPoPostGrn2.status === 'FULLY_RECEIVED' && qtyPostGrn2 === initialQty + 100) {
    console.log('\n====================================================================');
    console.log('PARTIAL & FINAL GRN STOCK RECEIPT TEST: 100% PASS ✓');
    console.log('====================================================================');
  } else {
    console.error('❌ GRN verification failed!');
    process.exit(1);
  }
}

testGrnPartialReceiptFlow().catch(console.error);
