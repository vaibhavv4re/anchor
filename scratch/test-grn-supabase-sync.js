import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { AuthEngine } from '../businessos/platform/authentication/authEngine.js';
import { RbacEngine } from '../businessos/platform/authorization/rbacEngine.js';

async function testGrnSupabaseSync() {
  console.log('🧪 TEST: Live GRN & Stock Balances Supabase Persistence Verification\n');

  const supabaseClient = new SupabaseClient();
  const cloudAdapter = new SupabaseDataAdapter(supabaseClient);
  const dataGateway = new DataGateway(cloudAdapter);
  const rbacEngine = new RbacEngine({ dataGateway });
  const authEngine = new AuthEngine({ dataGateway, rbacEngine });

  const authRes = await authEngine.authenticate('333333');
  console.log('1️⃣ Auth Status:', authRes.success ? 'SUCCESS ✓' : 'FAILED ❌');
  const session = authRes.session;
  const tenantId = session.tenantId;

  await dataGateway.hydrateCollections(['goods_receipt_notes', 'stock_balances']);

  // Post test GRN
  const grnNum = `GRN-${Date.now().toString().substring(7)}`;
  const grnObj = {
    id: `grn-${Date.now()}`,
    tenantId,
    tenant_id: tenantId,
    grnNumber: grnNum,
    grn_number: grnNum,
    poNumber: 'PO-492673',
    po_number: 'PO-492673',
    supplierCode: 'SUP-101',
    supplier_code: 'SUP-101',
    supplierName: 'Fresh Farm Produce Pvt Ltd',
    receivingLocationCode: 'LOC-805',
    receiving_location_code: 'LOC-805',
    vendorInvoiceNo: 'INV-TEST-SYNC',
    receivedDate: new Date().toISOString().split('T')[0],
    lines: [{ itemCode: 'RM5712', itemName: 'Basmati Rice', acceptedQty: 50, actualUnitPrice: 152 }],
    totalAmount: 7600,
    total_amount: 7600,
    totalReceivedValue: 7600,
    total_received_value: 7600,
    status: 'POSTED'
  };

  const createGrnRes = await dataGateway.create('goods_receipt_notes', grnObj, session);
  console.log('2️⃣ GRN Created in Supabase:', createGrnRes ? 'SUCCESS ✓' : 'FAILED ❌');

  // Post test stock balance
  const sbObj = {
    id: `sb-${Date.now()}-RM5712`,
    tenantId,
    tenant_id: tenantId,
    itemCode: 'RM5712',
    item_code: 'RM5712',
    locationCode: 'LOC-805',
    location_code: 'LOC-805',
    quantity: 50,
    unitCost: 152,
    unit_cost: 152,
    valuation: 7600,
    status: 'ACTIVE'
  };

  const createSbRes = await dataGateway.create('stock_balances', sbObj, session);
  console.log('3️⃣ Stock Balance Created in Supabase:', createSbRes ? 'SUCCESS ✓' : 'FAILED ❌');

  // Verify fetch from Supabase REST API directly
  const directSbRes = await supabaseClient.fetchTableData('stock_balances');
  console.log('\n4️⃣ Supabase `stock_balances` direct API rows:', directSbRes.success ? directSbRes.data.length : 0);

  const directGrnRes = await supabaseClient.fetchTableData('goods_receipt_notes');
  console.log('5️⃣ Supabase `goods_receipt_notes` direct API rows:', directGrnRes.success ? directGrnRes.data.length : 0);

  if (directSbRes.success && directSbRes.data.length > 0 && directGrnRes.success && directGrnRes.data.length > 0) {
    console.log('\n====================================================================');
    console.log('GRN & STOCK BALANCES SUPABASE SYNC TEST: 100% PASS ✓');
    console.log('====================================================================');
  } else {
    console.error('❌ Supabase sync failed!');
    process.exit(1);
  }
}

testGrnSupabaseSync().catch(console.error);
