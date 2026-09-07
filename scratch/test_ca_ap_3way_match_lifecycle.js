import { purchasingModel } from '../businessos/platform/inventory/purchasingModel.js';
import { supplierInvoiceModel } from '../businessos/platform/accounting/supplierInvoiceModel.js';
import { apMatchingEngine } from '../businessos/platform/accounting/apMatchingEngine.js';
import { supplierPaymentModel } from '../businessos/platform/accounting/supplierPaymentModel.js';
import { accountingProjectionService } from '../businessos/platform/accounting/accountingProjectionService.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

async function runCaAp3WayMatchLifecycleAudit() {
  console.log('----------------------------------------------------');
  console.log('🏛️ CA / AP P2P ENGINE v1.0 AUDIT (HAPPY & NEGATIVE PATHS)');
  console.log('----------------------------------------------------\n');

  const tenantId = 'tenant_h0qc7wf';

  // =========================================================
  // TEST 1: HAPPY PATH (PO -> GRN -> Invoice Intake -> Match -> Approve -> Disburse)
  // =========================================================
  console.log('1. [HAPPY PATH] Creating PO-2026-AP01 and posting GRN...');
  const po1 = purchasingModel.createPurchaseOrder({
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

  purchasingModel.createGoodsReceiptNote({
    poId: po1.id,
    deliveryChallanNo: 'DC-AP-101',
    hasInvoice: false,
    supplierInvoiceNo: 'NOT_RECEIVED',
    receiptDate: '2026-09-03',
    lines: [
      { itemCode: 'RM0701', receivedQty: 100, acceptedQty: 100, rejectedQty: 0, actualInvoicePrice: 30 },
      { itemCode: 'RM0702', receivedQty: 50, acceptedQty: 50, rejectedQty: 0, actualInvoicePrice: 40 }
    ],
    receivedBy: 'Store Manager',
    tenantId
  });

  console.log(`   ✓ PO Created: ${po1.poNumber} | GRN Posted.`);

  console.log('\n   Intaking Supplier Tax Invoice FF/26-27/00101...');
  const inv1 = supplierInvoiceModel.createSupplierInvoice({
    supplierInvoiceNumber: 'FF/26-27/00101',
    supplierCode: 'SUP-101',
    supplierName: 'Fresh Farm Produce Pvt Ltd',
    poNumber: po1.poNumber,
    lines: [
      { itemCode: 'RM0701', itemName: 'Potatoes', quantity: 100, uom: 'KG', unitPrice: 30 },
      { itemCode: 'RM0702', itemName: 'Carrots', quantity: 50, uom: 'KG', unitPrice: 40 }
    ],
    tenantId
  });

  console.log(`   ✓ Invoice Intaken: ID ${inv1.id} | Supplier No: ${inv1.supplierInvoiceNumber}`);

  console.log('   Executing 3-Way Match Engine...');
  const match1 = apMatchingEngine.perform3WayMatch(inv1.id, { priceTolerancePercent: 0, qtyTolerancePercent: 0 }, tenantId);
  console.log(`   Match Status: ${match1.matchStatus} (Expected: MATCHED)`);
  if (match1.matchStatus !== 'MATCHED') throw new Error('Test 1 failed: Expected MATCHED status.');

  console.log('   Approving Invoice for AP Liability...');
  const appInv1 = supplierInvoiceModel.approveSupplierInvoice(inv1.id, 'CA Auditor', tenantId);
  console.log(`   Invoice Status: ${appInv1.status} (Expected: APPROVED)`);

  console.log('   Disbursing Vendor Payment...');
  const pay1 = supplierPaymentModel.recordDisbursement({
    supplierInvoiceId: inv1.id,
    amount: appInv1.grandTotal,
    paymentMethod: 'BANK_TRANSFER',
    referenceUtr: 'UTR-984120491',
    paidBy: 'Finance Manager',
    tenantId
  });
  console.log(`   Disbursement Done: ${pay1.paymentNumber} | Invoice Final Status: ${supplierInvoiceModel.getSupplierInvoiceById(inv1.id).status} (Expected: PAID)`);

  // =========================================================
  // TEST 2: INVOICE BEFORE GRN (WAITING_FOR_RECEIPT)
  // =========================================================
  console.log('\n2. [NEG-PATH] Testing Invoice Before GRN (WAITING_FOR_RECEIPT)...');
  const po2 = purchasingModel.createPurchaseOrder({
    supplierCode: 'SUP-101',
    supplierName: 'Fresh Farm Produce Pvt Ltd',
    destinationLocationCode: 'LOC-886',
    orderDate: '2026-09-03',
    lines: [{ itemCode: 'RM0701', itemName: 'Potatoes', orderedQty: 50, uom: 'KG', poUnitPrice: 30 }],
    status: 'APPROVED',
    tenantId
  });

  const inv2 = supplierInvoiceModel.createSupplierInvoice({
    supplierInvoiceNumber: 'FF/26-27/00202',
    supplierCode: 'SUP-101',
    poNumber: po2.poNumber,
    lines: [{ itemCode: 'RM0701', itemName: 'Potatoes', quantity: 50, uom: 'KG', unitPrice: 30 }],
    tenantId
  });

  const match2 = apMatchingEngine.perform3WayMatch(inv2.id, {}, tenantId);
  console.log(`   Match Status: ${match2.matchStatus} (Expected: WAITING_FOR_RECEIPT)`);
  if (match2.matchStatus !== 'WAITING_FOR_RECEIPT') throw new Error('Test 2 failed: Expected WAITING_FOR_RECEIPT.');

  // Now post GRN and re-run match
  purchasingModel.createGoodsReceiptNote({
    poId: po2.id,
    deliveryChallanNo: 'DC-AP-202',
    receiptDate: '2026-09-03',
    lines: [{ itemCode: 'RM0701', receivedQty: 50, acceptedQty: 50, rejectedQty: 0, actualInvoicePrice: 30 }],
    tenantId
  });

  const match2b = apMatchingEngine.perform3WayMatch(inv2.id, {}, tenantId);
  console.log(`   Match Status after GRN post: ${match2b.matchStatus} (Expected: MATCHED)`);
  if (match2b.matchStatus !== 'MATCHED') throw new Error('Test 2 resolution failed.');

  // =========================================================
  // TEST 3: PRICE VARIANCE EXCEPTION
  // =========================================================
  console.log('\n3. [NEG-PATH] Testing Price Variance Exception (PO ₹30 vs Invoice ₹35)...');
  const po3 = purchasingModel.createPurchaseOrder({
    supplierCode: 'SUP-101',
    supplierName: 'Fresh Farm Produce Pvt Ltd',
    lines: [{ itemCode: 'RM0701', itemName: 'Potatoes', orderedQty: 20, uom: 'KG', poUnitPrice: 30 }],
    status: 'APPROVED',
    tenantId
  });

  purchasingModel.createGoodsReceiptNote({
    poId: po3.id,
    deliveryChallanNo: 'DC-AP-303',
    lines: [{ itemCode: 'RM0701', receivedQty: 20, acceptedQty: 20, rejectedQty: 0, actualInvoicePrice: 30 }],
    tenantId
  });

  const inv3 = supplierInvoiceModel.createSupplierInvoice({
    supplierInvoiceNumber: 'FF/26-27/00303',
    supplierCode: 'SUP-101',
    poNumber: po3.poNumber,
    lines: [{ itemCode: 'RM0701', itemName: 'Potatoes', quantity: 20, uom: 'KG', unitPrice: 35 }], // Variance!
    tenantId
  });

  const match3 = apMatchingEngine.perform3WayMatch(inv3.id, {}, tenantId);
  console.log(`   Match Status: ${match3.matchStatus} | Variances:`, match3.variances.map(v => v.type));
  if (match3.matchStatus !== 'EXCEPTION' || !match3.variances.some(v => v.type === 'price_variance')) {
    throw new Error('Test 3 failed: Expected EXCEPTION with price_variance.');
  }

  // =========================================================
  // TEST 4: INVOICE QTY > ACCEPTED GRN QTY (QUANTITY VARIANCE)
  // =========================================================
  console.log('\n4. [NEG-PATH] Testing Quantity Variance (GRN 40 vs Invoice 50)...');
  const po4 = purchasingModel.createPurchaseOrder({
    supplierCode: 'SUP-101',
    lines: [{ itemCode: 'RM0701', itemName: 'Potatoes', orderedQty: 50, uom: 'KG', poUnitPrice: 30 }],
    status: 'APPROVED',
    tenantId
  });

  purchasingModel.createGoodsReceiptNote({
    poId: po4.id,
    deliveryChallanNo: 'DC-AP-404',
    lines: [{ itemCode: 'RM0701', receivedQty: 40, acceptedQty: 40, rejectedQty: 0, actualInvoicePrice: 30 }], // Only 40 accepted
    tenantId
  });

  const inv4 = supplierInvoiceModel.createSupplierInvoice({
    supplierInvoiceNumber: 'FF/26-27/00404',
    supplierCode: 'SUP-101',
    poNumber: po4.poNumber,
    lines: [{ itemCode: 'RM0701', itemName: 'Potatoes', quantity: 50, uom: 'KG', unitPrice: 30 }], // Invoiced for 50!
    tenantId
  });

  const match4 = apMatchingEngine.perform3WayMatch(inv4.id, {}, tenantId);
  console.log(`   Match Status: ${match4.matchStatus} | Variances:`, match4.variances.map(v => v.type));
  if (match4.matchStatus !== 'EXCEPTION' || !match4.variances.some(v => v.type === 'quantity_variance')) {
    throw new Error('Test 4 failed: Expected EXCEPTION with quantity_variance.');
  }

  // =========================================================
  // TEST 5: MULTIPLE GRNs FOR SINGLE PO
  // =========================================================
  console.log('\n5. [COMPLEX] Testing Multiple GRNs Matched to Single PO Invoice...');
  const po5 = purchasingModel.createPurchaseOrder({
    supplierCode: 'SUP-101',
    lines: [{ itemCode: 'RM0701', itemName: 'Potatoes', orderedQty: 100, uom: 'KG', poUnitPrice: 30 }],
    status: 'APPROVED',
    tenantId
  });

  purchasingModel.createGoodsReceiptNote({
    poId: po5.id,
    deliveryChallanNo: 'DC-AP-505-A',
    lines: [{ itemCode: 'RM0701', receivedQty: 40, acceptedQty: 40, rejectedQty: 0, actualInvoicePrice: 30 }],
    tenantId
  });

  purchasingModel.createGoodsReceiptNote({
    poId: po5.id,
    deliveryChallanNo: 'DC-AP-505-B',
    lines: [{ itemCode: 'RM0701', receivedQty: 60, acceptedQty: 60, rejectedQty: 0, actualInvoicePrice: 30 }],
    tenantId
  });

  const inv5 = supplierInvoiceModel.createSupplierInvoice({
    supplierInvoiceNumber: 'FF/26-27/00505',
    supplierCode: 'SUP-101',
    poNumber: po5.poNumber,
    lines: [{ itemCode: 'RM0701', itemName: 'Potatoes', quantity: 100, uom: 'KG', unitPrice: 30 }], // Total 100
    tenantId
  });

  const match5 = apMatchingEngine.perform3WayMatch(inv5.id, {}, tenantId);
  console.log(`   Match Status across 2 GRNs: ${match5.matchStatus} (Expected: MATCHED)`);
  if (match5.matchStatus !== 'MATCHED') throw new Error('Test 5 failed: Multiple GRNs match failed.');

  // =========================================================
  // TEST 6: PARTIAL VENDOR DISBURSEMENT
  // =========================================================
  console.log('\n6. [COMPLEX] Testing Partial Vendor Disbursement...');
  supplierInvoiceModel.approveSupplierInvoice(inv5.id, 'CA Auditor', tenantId);

  const partPay1 = supplierPaymentModel.recordDisbursement({
    supplierInvoiceId: inv5.id,
    amount: 1000.00,
    paymentMethod: 'BANK_TRANSFER',
    tenantId
  });
  const inv5State1 = supplierInvoiceModel.getSupplierInvoiceById(inv5.id);
  console.log(`   Disbursement 1 (₹1000): Invoice Status = ${inv5State1.status} (Expected: PARTIALLY_PAID) | Outstanding = ₹${inv5State1.outstandingAmount}`);
  if (inv5State1.status !== 'PARTIALLY_PAID') throw new Error('Test 6 failed: Partial status expected.');

  const partPay2 = supplierPaymentModel.recordDisbursement({
    supplierInvoiceId: inv5.id,
    amount: inv5State1.outstandingAmount,
    paymentMethod: 'CHEQUE',
    referenceUtr: 'CHQ-984120',
    tenantId
  });
  const inv5State2 = supplierInvoiceModel.getSupplierInvoiceById(inv5.id);
  console.log(`   Disbursement 2 (Final): Invoice Status = ${inv5State2.status} (Expected: PAID) | Outstanding = ₹${inv5State2.outstandingAmount}`);
  if (inv5State2.status !== 'PAID') throw new Error('Test 6 failed: Final PAID status expected.');

  // =========================================================
  // TEST 7: ACCOUNTING JOURNAL LOG VERIFICATION
  // =========================================================
  console.log('\n7. Verifying AP Journal Entries in offline_journal...');
  const journal = offlineStore.getCollection('offline_journal') || [];
  const apApproveJobs = journal.filter(j => j.jobType === 'AP_INVOICE_APPROVED');
  const apPayJobs = journal.filter(j => j.jobType === 'AP_PAYMENT_DISBURSED');

  console.log(`   ✓ Total AP_INVOICE_APPROVED journal events: ${apApproveJobs.length}`);
  console.log(`   ✓ Total AP_PAYMENT_DISBURSED journal events: ${apPayJobs.length}`);

  if (apApproveJobs.length === 0 || apPayJobs.length === 0) {
    throw new Error('Test 7 failed: Missing AP journal entries in offline_journal.');
  }

  console.log('\n----------------------------------------------------');
  console.log('✅ CA / AP P2P ENGINE v1.0 ALL AUDITS PASSED (100%)');
  console.log('----------------------------------------------------');
}

runCaAp3WayMatchLifecycleAudit().catch(err => {
  console.error('❌ AP LIFECYCLE AUDIT FAILED:', err);
  process.exit(1);
});
