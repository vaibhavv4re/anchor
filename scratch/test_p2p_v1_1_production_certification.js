import { journalValidationEngine, CHART_OF_ACCOUNTS } from '../businessos/platform/accounting/journalValidationEngine.js';
import { gstTaxEngine } from '../businessos/platform/accounting/gstTaxEngine.js';
import { financialPeriodService } from '../businessos/platform/accounting/financialPeriodService.js';
import { supplierInvoiceModel } from '../businessos/platform/accounting/supplierInvoiceModel.js';
import { apMatchingEngine } from '../businessos/platform/accounting/apMatchingEngine.js';
import { supplierPaymentModel } from '../businessos/platform/accounting/supplierPaymentModel.js';
import { purchasingModel } from '../businessos/platform/inventory/purchasingModel.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

async function runP2pV11ProductionCertificationSuite() {
  console.log('====================================================');
  console.log('🏆 CA / AP P2P ENGINE v1.1 PRODUCTION CERTIFICATION');
  console.log('====================================================\n');

  const tenantId = 'tenant_h0qc7wf';

  // ---------------------------------------------------------
  // GATE 1 & GATE 2: BALANCED DOUBLE-ENTRY VALIDATOR
  // ---------------------------------------------------------
  console.log('GATE 1 & 2: Testing Double-Entry Journal Validation Engine...');
  const validPayload = {
    debits: [
      { accountCode: '2110', accountName: 'GRNI Accrual', amount: 1000.00 },
      { accountCode: '1410', accountName: 'Input CGST', amount: 25.00 },
      { accountCode: '1420', accountName: 'Input SGST', amount: 25.00 }
    ],
    credits: [
      { accountCode: '2100', accountName: 'Accounts Payable - Vendor', amount: 1050.00 }
    ]
  };

  const validation = journalValidationEngine.validateJournalEntry(validPayload);
  console.log(`   ✓ Valid entry check passed (Debits ₹${validation.totalDebits} == Credits ₹${validation.totalCredits})`);

  let unbalancedRejected = false;
  try {
    journalValidationEngine.validateJournalEntry({
      debits: [{ accountCode: '2110', amount: 1000.00 }],
      credits: [{ accountCode: '2100', amount: 900.00 }] // Unbalanced!
    });
  } catch (err) {
    if (err.message.includes('UNBALANCED_JOURNAL_ENTRY_ERROR')) {
      unbalancedRejected = true;
      console.log(`   ✓ Unbalanced journal entry correctly rejected: "${err.message}"`);
    }
  }
  if (!unbalancedRejected) throw new Error('Gate 2 Failed: Unbalanced entry was not rejected.');

  // ---------------------------------------------------------
  // GATE 3: GST / ITC STATE BOUNDARY ENGINE
  // ---------------------------------------------------------
  console.log('\nGATE 3: Testing GST / ITC State Boundary Engine...');
  const intraState = gstTaxEngine.calculateGstBreakdown({
    supplierStateCode: '27',
    tenantStateCode: '27',
    taxableAmount: 10000,
    taxRate: 5
  });
  console.log(`   ✓ Intra-State (27 -> 27): CGST ₹${intraState.cgstAmount} | SGST ₹${intraState.sgstAmount} (IGST = ₹${intraState.igstAmount})`);
  if (intraState.isInterState || intraState.cgstAmount !== 250 || intraState.sgstAmount !== 250) {
    throw new Error('Gate 3 Failed: Intra-state tax calculation mismatch.');
  }

  const interState = gstTaxEngine.calculateGstBreakdown({
    supplierStateCode: '29', // Karnataka
    tenantStateCode: '27', // Maharashtra
    taxableAmount: 10000,
    taxRate: 5
  });
  console.log(`   ✓ Inter-State (29 -> 27): IGST ₹${interState.igstAmount} (CGST/SGST = ₹0)`);
  if (!interState.isInterState || interState.igstAmount !== 500) {
    throw new Error('Gate 3 Failed: Inter-state IGST calculation mismatch.');
  }

  // ---------------------------------------------------------
  // GATE 6: SUPPLIER INVOICE UNIQUENESS GUARD
  // ---------------------------------------------------------
  console.log('\nGATE 6: Testing Supplier Invoice Uniqueness Guard...');
  const invUniqueNo = `FF/26-27/UNIQUE-${Math.floor(1000 + Math.random() * 9000)}`;
  supplierInvoiceModel.createSupplierInvoice({
    supplierInvoiceNumber: invUniqueNo,
    supplierCode: 'SUP-UNIQUE',
    lines: [{ itemCode: 'RM01', quantity: 10, unitPrice: 50 }],
    tenantId
  });

  let duplicateBlocked = false;
  try {
    supplierInvoiceModel.createSupplierInvoice({
      supplierInvoiceNumber: invUniqueNo, // Same supplier & invoice #
      supplierCode: 'SUP-UNIQUE',
      lines: [{ itemCode: 'RM01', quantity: 10, unitPrice: 50 }],
      tenantId
    });
  } catch (err) {
    if (err.message.includes('DUPLICATE_SUPPLIER_INVOICE_ERROR')) {
      duplicateBlocked = true;
      console.log(`   ✓ Duplicate invoice creation correctly blocked: "${err.message}"`);
    }
  }
  if (!duplicateBlocked) throw new Error('Gate 6 Failed: Duplicate supplier invoice was not blocked.');

  // ---------------------------------------------------------
  // GATE 4: FINANCIAL PERIOD LOCK INTERCEPTION
  // ---------------------------------------------------------
  console.log('\nGATE 4: Testing Financial Period Lock Interception...');
  const lockedDate = '2026-08-15';
  const periodId = financialPeriodService.getPeriodIdForDate(new Date(lockedDate));
  financialPeriodService.lockPeriod(periodId); // Lock August 2026

  let lockedIntakeBlocked = false;
  try {
    supplierInvoiceModel.createSupplierInvoice({
      supplierInvoiceNumber: `FF/26-27/LOCKED-${Math.floor(1000 + Math.random() * 9000)}`,
      supplierCode: 'SUP-999',
      invoiceDate: lockedDate,
      lines: [{ itemCode: 'RM01', quantity: 10, unitPrice: 50 }],
      tenantId
    });
  } catch (err) {
    if (err.message.includes('PERIOD_LOCKED_ERROR')) {
      lockedIntakeBlocked = true;
      console.log(`   ✓ Invoice intake for locked period correctly rejected: "${err.message}"`);
    }
  }
  if (!lockedIntakeBlocked) throw new Error('Gate 4 Failed: Locked period intake was not rejected.');

  // ---------------------------------------------------------
  // GATE 8: DUAL-CONTROL AUDIT TRAIL CERTIFICATION
  // ---------------------------------------------------------
  console.log('\nGATE 8: Testing Dual-Control Payment Authorization Audit Trail...');
  const poCert = purchasingModel.createPurchaseOrder({
    supplierCode: 'SUP-CERT',
    supplierName: 'Certified Supplier Ltd',
    lines: [{ itemCode: 'RM0101', itemName: 'Rice', orderedQty: 50, uom: 'KG', poUnitPrice: 60 }],
    status: 'APPROVED',
    tenantId
  });

  purchasingModel.createGoodsReceiptNote({
    poId: poCert.id,
    deliveryChallanNo: 'DC-CERT-01',
    lines: [{ itemCode: 'RM0101', receivedQty: 50, acceptedQty: 50, rejectedQty: 0, actualInvoicePrice: 60 }],
    tenantId
  });

  const invCert = supplierInvoiceModel.createSupplierInvoice({
    supplierInvoiceNumber: `CERT/26-27/00${Math.floor(100 + Math.random() * 900)}`,
    supplierCode: 'SUP-CERT',
    supplierName: 'Certified Supplier Ltd',
    poNumber: poCert.poNumber,
    lines: [{ itemCode: 'RM0101', itemName: 'Rice', quantity: 50, uom: 'KG', unitPrice: 60 }],
    createdBy: 'Invoice Intaker Clerk',
    tenantId
  });

  apMatchingEngine.perform3WayMatch(invCert.id, {}, tenantId);

  const approvedInvCert = supplierInvoiceModel.approveSupplierInvoice(invCert.id, 'Senior CA Auditor', tenantId);

  const disbursedPayCert = supplierPaymentModel.recordDisbursement({
    supplierInvoiceId: invCert.id,
    amount: approvedInvCert.grandTotal,
    paymentMethod: 'BANK_TRANSFER',
    referenceUtr: 'UTR-CERT-9900',
    paidBy: 'Finance Manager',
    tenantId
  });

  console.log(`   ✓ Dual-Control Audit Chain Verified:`);
  console.log(`     - Created By:  ${disbursedPayCert.createdBy} (Intake)`);
  console.log(`     - Approved By: ${disbursedPayCert.approvedBy} (CA Approval)`);
  console.log(`     - Paid By:     ${disbursedPayCert.paidBy} (Disbursement)`);

  if (disbursedPayCert.createdBy !== 'Invoice Intaker Clerk' || disbursedPayCert.approvedBy !== 'Senior CA Auditor' || disbursedPayCert.paidBy !== 'Finance Manager') {
    throw new Error('Gate 8 Failed: Dual-control audit chain mismatch.');
  }

  console.log('\n====================================================');
  console.log('✅ CA / AP P2P ENGINE v1.1 PRODUCTION CERTIFICATION PASSED (100%)');
  console.log('====================================================');
}

runP2pV11ProductionCertificationSuite().catch(err => {
  console.error('❌ P2P v1.1 CERTIFICATION FAILED:', err);
  process.exit(1);
});
