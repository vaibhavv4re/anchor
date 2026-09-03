import { purchasingModel } from '../businessos/platform/inventory/purchasingModel.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

async function testPoShareGrnDrawerLifecycle() {
  console.log('----------------------------------------------------');
  console.log('📄 PO SHARE & GRN INVOICE STATUS DECOUPLING LIFECYCLE AUDIT');
  console.log('----------------------------------------------------\n');

  const tenantId = 'tenant_h0qc7wf';

  // 1. Create Purchase Order
  console.log('1. Creating APPROVED Purchase Order PO-2026-1088...');
  const po = purchasingModel.createPurchaseOrder({
    supplierCode: 'SUP-101',
    supplierName: 'Fresh Farm Produce Pvt Ltd',
    destinationLocationCode: 'LOC-886',
    orderDate: '2026-09-03',
    lines: [
      { itemCode: 'RM0701', itemName: 'Potatoes', orderedQty: 100, uom: 'KG', poUnitPrice: 30 },
      { itemCode: 'RM0702', itemName: 'Carrots', orderedQty: 50, uom: 'KG', poUnitPrice: 40 }
    ],
    status: 'APPROVED',
    tenantId
  });

  console.log(`   ✓ PO Created: ${po.poNumber} | Grand Total: ₹${po.grandTotal}`);

  // 2. Test WhatsApp Message Generator
  console.log('\n2. Testing PO WhatsApp Message Generator...');
  const waMsg = purchasingModel.generateWhatsAppPoMessage(po);
  console.log('   --- GENERATED WHATSAPP PAYLOAD ---');
  console.log(waMsg);
  console.log('   -----------------------------------');
  if (!waMsg.includes(po.poNumber) || !waMsg.includes('Fresh Farm Produce') || !waMsg.includes('mention PO-')) {
    throw new Error('WhatsApp message generation failed mandatory content checks.');
  }
  console.log('   ✓ WhatsApp payload verified successfully.');

  // 3. Post GRN with Invoice Not Received (Physical Receipt)
  console.log('\n3. Posting GRN 1 with Invoice Status = NOT_RECEIVED (Challan DC-7788)...');
  const result1 = purchasingModel.createGoodsReceiptNote({
    poId: po.id,
    deliveryChallanNo: 'DC-7788',
    hasInvoice: false,
    supplierInvoiceNo: 'NOT_RECEIVED',
    invoiceStatus: 'NOT_RECEIVED',
    receiptDate: '2026-09-03',
    lines: [
      { itemCode: 'RM0701', receivedQty: 100, acceptedQty: 95, rejectedQty: 5, actualInvoicePrice: 30 },
      { itemCode: 'RM0702', receivedQty: 50, acceptedQty: 50, rejectedQty: 0, actualInvoicePrice: 40 }
    ],
    receivedBy: 'Store Manager',
    tenantId
  });

  const grn1 = result1.grn;
  console.log(`   ✓ GRN Posted: ${grn1.grnNumber}`);
  console.log(`   GRN Status: ${grn1.grnStatus} (Physical receipt complete)`);
  console.log(`   Invoice Status: ${grn1.invoiceStatus} (Decoupled from physical receipt)`);
  console.log(`   Delivery Challan #: ${grn1.deliveryChallanNo}`);

  if (grn1.grnStatus !== 'POSTED' || grn1.invoiceStatus !== 'NOT_RECEIVED') {
    throw new Error(`Expected GRN status POSTED and invoiceStatus NOT_RECEIVED, got ${grn1.grnStatus} / ${grn1.invoiceStatus}`);
  }

  // 4. Verify Stock Balances updated for Accepted Qty
  console.log('\n4. Verifying stock balance updates for accepted quantities...');
  const balances = offlineStore.getCollection('stock_balances') || [];
  const potatoBal = balances.find(b => b.itemCode === 'RM0701');
  const carrotBal = balances.find(b => b.itemCode === 'RM0702');

  console.log(`   - Potato Balance Qty: ${potatoBal ? potatoBal.quantity : 0} (Expected >= 95)`);
  console.log(`   - Carrot Balance Qty: ${carrotBal ? carrotBal.quantity : 0} (Expected >= 50)`);

  if (!potatoBal || potatoBal.quantity < 95) {
    throw new Error('Stock balance did not update for accepted potatoes.');
  }

  // 5. Attach Invoice later via Accounting/GRN Drawer handoff
  console.log('\n5. Attaching Vendor Tax Invoice INV-9988 later...');
  const updatedGrn = purchasingModel.updateGrnInvoiceStatus(grn1.id, {
    invoiceNo: 'INV-9988',
    invoiceStatus: 'RECEIVED',
    invoiceAmount: 4850
  }, tenantId);

  console.log(`   ✓ Invoice Attached: ${updatedGrn.supplierInvoiceNo}`);
  console.log(`   Updated Invoice Status: ${updatedGrn.invoiceStatus}`);

  if (updatedGrn.invoiceStatus !== 'RECEIVED' || updatedGrn.supplierInvoiceNo !== 'INV-9988') {
    throw new Error('Invoice attachment update failed.');
  }

  console.log('\n----------------------------------------------------');
  console.log('✅ PO SHARE & GRN INVOICE STATUS LIFECYCLE PASSED (100%)');
  console.log('----------------------------------------------------');
}

testPoShareGrnDrawerLifecycle().catch(err => {
  console.error('❌ LIFECYCLE TEST FAILED:', err);
  process.exit(1);
});
