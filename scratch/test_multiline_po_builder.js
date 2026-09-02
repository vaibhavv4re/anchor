import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';

async function testMultiLinePOBuilder() {
  console.log('----------------------------------------------------');
  console.log('📄 MULTI-LINE PURCHASE ORDER BUILDER AUDIT');
  console.log('----------------------------------------------------\n');

  const client = new SupabaseClient();
  const cloudAdapter = new SupabaseDataAdapter(client);
  const dataGateway = new DataGateway({ cloudAdapter, isOnline: true });

  const tenantId = 'tenant_h0qc7wf';
  const poNumber = `PO-TEST-${Date.now().toString().substring(7)}`;

  // Multi-line PO Basket Payload
  const multilinePO = {
    id: `po-${Date.now()}`,
    tenantId,
    tenant_id: tenantId,
    poNumber,
    po_number: poNumber,
    supplierCode: 'SUP-101',
    supplier_code: 'SUP-101',
    supplierName: 'Fresh Farm Produce Pvt Ltd',
    destinationLocationCode: 'LOC-886',
    destination_location_code: 'LOC-886',
    orderDate: new Date().toISOString().split('T')[0],
    expectedDeliveryDate: '2026-09-05',
    notes: 'Urgent weekend store replenishment',
    paymentTerms: 'Net 15',
    grandTotal: 103690.00,
    grand_total: 103690.00,
    totalItems: 4,
    lines: [
      { itemCode: 'RM0701', itemName: 'Potatoes', supplierSku: 'SUP-101-RM0701', quantity: 50, uom: 'KG', catalogueUnitPrice: 32.00, poUnitPrice: 32.00, priceOverride: false, lineTotal: 1600.00 },
      { itemCode: 'RM0702', itemName: 'Carrots', supplierSku: 'SUP-101-RM0702', quantity: 20, uom: 'KG', catalogueUnitPrice: 57.00, poUnitPrice: 57.00, priceOverride: false, lineTotal: 1140.00 },
      { itemCode: 'RM0704', itemName: 'French Beans', supplierSku: 'SUP-101-RM0704', quantity: 10, uom: 'KG', catalogueUnitPrice: 95.00, poUnitPrice: 95.00, priceOverride: false, lineTotal: 950.00 },
      { itemCode: 'RM0309', itemName: 'Fresh Onion', supplierSku: 'ON-50', quantity: 50, uom: 'BAG', catalogueUnitPrice: 2000.00, poUnitPrice: 2000.00, priceOverride: false, lineTotal: 100000.00 }
    ],
    status: 'APPROVED'
  };

  console.log(`1. Testing Multi-Line PO Creation via DataGateway...`);
  console.log(`   PO Number: ${poNumber}`);
  console.log(`   Supplier: ${multilinePO.supplierName} (${multilinePO.supplierCode})`);
  console.log(`   Total Lines: ${multilinePO.lines.length}`);
  console.log(`   Grand Total: ₹${multilinePO.grandTotal}`);

  const createdRecord = await dataGateway.create('purchase_orders', multilinePO);
  console.log(`✓ DataGateway create finished.`);

  // 2. Fetch directly from Supabase Cloud
  console.log('\n2. Verifying Multi-Line PO directly from live Supabase Cloud table "purchase_orders"...');
  const res = await client.fetchTableData('purchase_orders');
  const cloudList = res && res.data ? res.data : [];
  console.log(`   Total POs in Supabase Cloud: ${cloudList.length}`);

  const savedPo = cloudList.find(p => (p.po_number || p.poNumber) === poNumber || (p.data && p.data.poNumber === poNumber));
  
  if (savedPo) {
    console.log(`\nFound created PO in Supabase Cloud!`);
    const dataObj = savedPo.data || savedPo;
    const lines = dataObj.lines || [];
    console.log(`   Fetched PO Lines Count: ${lines.length}`);
    console.log(`   Fetched Grand Total: ₹${savedPo.total_amount || savedPo.grand_total}`);
    
    if (lines.length === 4) {
      console.log('\n----------------------------------------------------');
      console.log('✅ MULTI-LINE PO BUILDER CLOUD SYNC PASSED (100%)');
      console.log('----------------------------------------------------');
    } else {
      console.error(`❌ LINE COUNT MISMATCH: Expected 4 lines, got ${lines.length}`);
      process.exit(1);
    }
  } else {
    console.error(`❌ PO NOT FOUND IN SUPABASE: ${poNumber}`);
    process.exit(1);
  }
}

testMultiLinePOBuilder();
