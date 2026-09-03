import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { DataGateway } from '../businessos/platform/data/dataGateway.js';

async function testPostGrnToSupabase() {
  console.log('----------------------------------------------------');
  console.log('🧪 TESTING LIVE GRN POST TO SUPABASE CLOUD');
  console.log('----------------------------------------------------\n');

  const client = new SupabaseClient();
  const cloudAdapter = new SupabaseDataAdapter(client);
  const dataGateway = new DataGateway({ cloudAdapter, isOnline: true });

  const tenantId = 'tenant_h0qc7wf';
  const grnId = `GRN-TEST-${Date.now()}`;

  const sampleGrn = {
    id: grnId,
    grnNumber: grnId,
    grn_number: grnId,
    poId: 'po-test-101',
    poNumber: 'PO-2026-1001',
    po_number: 'PO-2026-1001',
    supplierCode: 'SUP-101',
    supplier_code: 'SUP-101',
    supplierName: 'Fresh Farm Produce Pvt Ltd',
    supplier_name: 'Fresh Farm Produce Pvt Ltd',
    destinationLocationCode: 'LOC-886',
    destination_location_code: 'LOC-886',
    deliveryChallanNo: 'DC-9988',
    delivery_challan_no: 'DC-9988',
    supplierInvoiceNo: 'INV-7766',
    supplier_invoice_no: 'INV-7766',
    hasInvoice: true,
    invoiceStatus: 'RECEIVED',
    invoice_status: 'RECEIVED',
    status: 'POSTED',
    grnStatus: 'POSTED',
    receiptDate: new Date().toISOString().split('T')[0],
    supplierInvoiceTotal: 4500.00,
    totalReceivedValue: 4500.00,
    lines: [
      { itemCode: 'RM0701', itemName: 'Potatoes', receivedQty: 100, acceptedQty: 100, rejectedQty: 0, actualInvoicePrice: 35.00, lineTotal: 3500.00 },
      { itemCode: 'RM0702', itemName: 'Carrots', receivedQty: 20, acceptedQty: 20, rejectedQty: 0, actualInvoicePrice: 50.00, lineTotal: 1000.00 }
    ],
    receivedBy: 'Store Manager',
    tenantId,
    tenant_id: tenantId,
    createdAt: new Date().toISOString()
  };

  console.log(`1. Posting test GRN "${grnId}" via client.createRecord...`);
  const rawRes = await client.createRecord('goods_receipt_notes', sampleGrn);
  console.log('   rawRes output:', JSON.stringify(rawRes, null, 2));

  console.log('\n2. Fetching table "goods_receipt_notes" from Supabase Cloud...');
  const res = await client.fetchTableData('goods_receipt_notes');
  const cloudRows = res && res.data ? res.data : [];
  console.log(`   Total GRNs in Supabase Cloud: ${cloudRows.length}`);

  const found = cloudRows.find(r => r.id === grnId || r.grn_number === grnId || (r.data && r.data.grnNumber === grnId));
  if (found) {
    console.log('✅ TEST GRN PERSISTED TO SUPABASE CLOUD!');
    console.log('   Row Data:', JSON.stringify(found, null, 2));
  } else {
    console.log('❌ TEST GRN NOT FOUND IN SUPABASE CLOUD!');
  }
}

testPostGrnToSupabase().catch(err => {
  console.error('💥 Test Exception:', err);
});
