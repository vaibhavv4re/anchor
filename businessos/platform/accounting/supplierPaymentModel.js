/**
 * BusinessOS Platform - Supplier Payment & Vendor Disbursement Engine (P2P v1.0)
 * Manages transaction-based AP disbursements (PAY-AP-2026-XXXX).
 * Derives supplier invoice paid & outstanding balances dynamically.
 * Syncs AP_PAYMENT_DISBURSED journal events to offline_journal via DataGateway.
 */

import { supplierInvoiceModel } from './supplierInvoiceModel.js';
import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { journalValidationEngine } from './journalValidationEngine.js';
import { financialPeriodService } from './financialPeriodService.js';

class SupplierPaymentModel {
  _getDataGateway() {
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) {
      return window.__APP__.platform.dataGateway || null;
    }
    return null;
  }

  _getTenantId(providedTenantId = null) {
    if (providedTenantId) return providedTenantId;
    if (typeof sessionStorage !== 'undefined') {
      try {
        const session = JSON.parse(sessionStorage.getItem('ros_session') || '{}');
        return session.tenantId || 'tenant_h0qc7wf';
      } catch (_) {}
    }
    return 'tenant_h0qc7wf';
  }

  /**
   * Retrieve all supplier payment transactions
   */
  getAllSupplierPayments(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const dg = this._getDataGateway();
    let payments = [];
    if (dg && typeof dg.getCachedCollection === 'function') {
      payments = dg.getCachedCollection('supplier_payments', targetTenantId);
    }
    if (!Array.isArray(payments) || payments.length === 0) {
      payments = offlineStore.getCollection('supplier_payments', targetTenantId) || offlineStore.getCollection('supplier_payments') || [];
    }
    return payments.filter(p => !targetTenantId || p.tenantId === targetTenantId || p.tenant_id === targetTenantId);
  }

  /**
   * Retrieve all disbursements for a specific supplier invoice
   */
  getPaymentsForInvoice(supplierInvoiceId, tenantId = null) {
    const all = this.getAllSupplierPayments(tenantId);
    return all.filter(p => p.supplierInvoiceId === supplierInvoiceId || p.supplier_invoice_id === supplierInvoiceId);
  }

  /**
   * Record Vendor Disbursement Payment Transaction
   * @param {Object} params { supplierInvoiceId, amount, paymentMethod, referenceUtr, paidBy, notes, tenantId }
   */
  recordDisbursement(params) {
    const targetTenantId = this._getTenantId(params.tenantId);
    const supplierInvoiceId = params.supplierInvoiceId;
    const inv = supplierInvoiceModel.getSupplierInvoiceById(supplierInvoiceId, targetTenantId);
    if (!inv) {
      throw new Error(`Supplier invoice ${supplierInvoiceId} not found.`);
    }

    const disbursementDate = new Date().toISOString().split('T')[0];

    // Gate 4: Financial Period Lock Interception
    if (financialPeriodService.isDateLocked(disbursementDate)) {
      throw new Error(`PERIOD_LOCKED_ERROR: Cannot disburse payment on ${disbursementDate} because the financial period is LOCKED.`);
    }

    if (inv.status !== 'APPROVED' && inv.status !== 'PAYMENT_DUE' && inv.status !== 'PARTIALLY_PAID') {
      throw new Error(`Cannot disburse payment for invoice ${inv.supplierInvoiceNumber} with status "${inv.status}". Invoice must be APPROVED or PAYMENT_DUE.`);
    }

    const amount = parseFloat(params.amount) || 0;
    if (amount <= 0) {
      throw new Error('Disbursement amount must be greater than zero.');
    }

    const currentPayments = this.getPaymentsForInvoice(supplierInvoiceId, targetTenantId);
    const currentPaidTotal = currentPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const newPaidTotal = currentPaidTotal + amount;
    const newOutstanding = Math.max(0, inv.grandTotal - newPaidTotal);

    if (newPaidTotal > inv.grandTotal + 0.01) {
      throw new Error(`Overpayment blocked: Disbursement ₹${amount.toFixed(2)} exceeds remaining outstanding balance ₹${inv.outstandingAmount.toFixed(2)}.`);
    }

    const paymentNumber = `PAY-AP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const paymentRecord = {
      id: `spay-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      paymentNumber,
      tenantId: targetTenantId,
      tenant_id: targetTenantId,
      supplierInvoiceId: inv.id,
      supplier_invoice_id: inv.id,
      supplierInvoiceNumber: inv.supplierInvoiceNumber,
      supplierCode: inv.supplierCode,
      supplierName: inv.supplierName,
      poNumber: inv.poNumber,
      amount,
      paymentMethod: (params.paymentMethod || 'BANK_TRANSFER').toUpperCase(), // 'BANK_TRANSFER' | 'CHEQUE' | 'UPI' | 'CASH'
      referenceUtr: params.referenceUtr || params.referenceNo || 'N/A',
      paymentDate: new Date().toISOString(),
      // Gate 8: Audit Chain
      createdBy: inv.createdBy || 'CA Auditor',
      approvedBy: inv.approvedBy || 'CA Auditor',
      paidBy: params.paidBy || 'Finance Manager',
      status: 'DISBURSED',
      notes: params.notes || '',
      createdAt: new Date().toISOString()
    };

    // Store payment via DataGateway
    const dg = this._getDataGateway();
    if (dg && typeof dg.create === 'function') {
      dg.create('supplier_payments', paymentRecord);
    } else {
      const existing = offlineStore.getCollection('supplier_payments') || [];
      existing.push(paymentRecord);
      offlineStore.setCollection('supplier_payments', existing);
    }

    // Determine new invoice status
    let updatedInvoiceStatus = 'PARTIALLY_PAID';
    if (newOutstanding <= 0.01) {
      updatedInvoiceStatus = 'PAID';
    }

    supplierInvoiceModel.updateSupplierInvoice(inv.id, {
      paidAmount: newPaidTotal,
      outstandingAmount: newOutstanding,
      status: updatedInvoiceStatus
    }, targetTenantId);

    // Create AP_PAYMENT_DISBURSED Accounting Journal Entry
    const journalPayload = {
      paymentNumber,
      supplierInvoiceId: inv.id,
      supplierInvoiceNumber: inv.supplierInvoiceNumber,
      supplierName: inv.supplierName,
      amount,
      paymentMethod: paymentRecord.paymentMethod,
      referenceUtr: paymentRecord.referenceUtr,
      debits: [
        { accountCode: '2100', accountName: `Accounts Payable - ${inv.supplierName}`, amount }
      ],
      credits: [
        { accountCode: '1010', accountName: `Bank / Cash Account (${paymentRecord.paymentMethod})`, amount }
      ],
      disbursedBy: paymentRecord.paidBy,
      disbursedAt: paymentRecord.paymentDate
    };

    // Gate 2: Enforce Double-Entry Balancing
    journalValidationEngine.validateJournalEntry(journalPayload);

    const journalRow = {
      jobId: `job_ap_pay_${paymentRecord.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      jobType: 'AP_PAYMENT_DISBURSED',
      tenantId: targetTenantId,
      entityName: 'supplier_payments',
      payload: journalPayload,
      deviceId: 'CA-TERMINAL',
      version: 1,
      actor: paymentRecord.paidBy,
      correlationId: `CID-AP-PAY-${Math.floor(10000 + Math.random() * 90000)}`,
      syncState: 'QUEUED',
      createdAt: new Date().toISOString()
    };

    offlineStore.appendItem('offline_journal', journalRow);
    if (dg && typeof dg.create === 'function') {
      dg.create('offline_journal', journalRow).catch(() => {});
    }

    platformEventBus.publish('supplier_payment:disbursed', paymentRecord);
    return paymentRecord;
  }
}

export const supplierPaymentModel = new SupplierPaymentModel();
