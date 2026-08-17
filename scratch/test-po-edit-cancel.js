import { DataGateway } from '../businessos/platform/data/dataGateway.js';
import { SupabaseDataAdapter } from '../businessos/platform/data/adapters/supabaseDataAdapter.js';
import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';
import { AuthEngine } from '../businessos/platform/authentication/authEngine.js';
import { RbacEngine } from '../businessos/platform/authorization/rbacEngine.js';

async function testPoEditCancel() {
  console.log('🧪 TEST: Draft PO Edit & Cancel Actions Verification\n');

  const supabaseClient = new SupabaseClient();
  const cloudAdapter = new SupabaseDataAdapter(supabaseClient);
  const dataGateway = new DataGateway(cloudAdapter);
  const rbacEngine = new RbacEngine({ dataGateway });
  const authEngine = new AuthEngine({ dataGateway, rbacEngine });

  const authRes = await authEngine.authenticate('333333');
  const session = authRes.session;
  const tenantId = session.tenantId;

  await dataGateway.hydrateCollections(['purchase_orders']);

  // 1. Create a Draft PO
  const poNum = `PO-TEST-${Date.now().toString().substring(7)}`;
  const poId = `po-test-${Date.now()}`;
  const draftPo = {
    id: poId,
    tenantId,
    tenant_id: tenantId,
    poNumber: poNum,
    po_number: poNum,
    supplierCode: 'SUP-101',
    supplier_code: 'SUP-101',
    supplierName: 'Fresh Produce',
    destinationLocationCode: 'LOC-805',
    orderDate: '2026-08-18',
    lines: [{ itemCode: 'RM5712', itemName: 'Rice', quantity: 20, cataloguePrice: 110, unitPrice: 110, lineTotal: 2200 }],
    grandTotal: 2200,
    status: 'DRAFT'
  };

  await dataGateway.create('purchase_orders', draftPo, session);
  console.log('1️⃣ Draft PO Created:', poNum);

  // 2. Edit Draft PO
  const editPayload = {
    ...draftPo,
    lines: [
      { itemCode: 'RM5712', itemName: 'Rice', quantity: 30, cataloguePrice: 110, unitPrice: 110, lineTotal: 3300 }
    ],
    grandTotal: 3300,
    status: 'DRAFT'
  };

  await dataGateway.update('purchase_orders', poId, editPayload, session);
  const fetchedAfterEdit = await dataGateway.getCollection('purchase_orders');
  const updatedPo = fetchedAfterEdit.find(p => p.id === poId);
  console.log('2️⃣ Edited Draft PO Grand Total:', updatedPo ? updatedPo.grandTotal || updatedPo.grand_total : 'FAILED');

  // 3. Cancel Draft PO
  await dataGateway.update('purchase_orders', poId, { status: 'CANCELLED' }, session);
  const fetchedAfterCancel = await dataGateway.getCollection('purchase_orders');
  const cancelledPo = fetchedAfterCancel.find(p => p.id === poId);
  console.log('3️⃣ Cancelled Draft PO Status:', cancelledPo ? cancelledPo.status : 'FAILED');

  if (updatedPo && (updatedPo.grandTotal === 3300 || updatedPo.grand_total === 3300) && cancelledPo && cancelledPo.status === 'CANCELLED') {
    console.log('\n====================================================================');
    console.log('DRAFT PO EDIT & CANCEL TEST: 100% PASS ✓');
    console.log('====================================================================');
  } else {
    console.error('❌ Test failed');
    process.exit(1);
  }
}

testPoEditCancel().catch(console.error);
