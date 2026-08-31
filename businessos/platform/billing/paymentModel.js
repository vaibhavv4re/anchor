/**
 * BusinessOS Platform - Immutable Payment Ledger Engine (PD-010 & PD-012)
 * Manages immutable payment transaction records (CASH, UPI, CARD) linked to issued GST Tax Invoices.
 * Syncs directly to Supabase DataGateway 'payments' table and 'offline_journal'.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { billRevisionModel } from './billRevisionModel.js';
import { invoiceModel } from './invoiceModel.js';

class PaymentModel {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('payments')) {
      offlineStore.setCollection('payments', []);
    }
  }

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
   * Helper delegation to invoiceModel for sequence generator
   */
  generateNextInvoiceNumber(tenantId = null) {
    const seq = invoiceModel.generateNextInvoiceSequence('POS', tenantId);
    return seq.invoiceNumber;
  }

  /**
   * Retrieve all payment records for tenant
   */
  getAllPayments(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const all = offlineStore.getCollection('payments') || [];
    return all.filter(p => !targetTenantId || p.tenantId === targetTenantId || p.tenant_id === targetTenantId);
  }

  /**
   * Retrieve settled payment records for tenant
   */
  getSettledPayments(tenantId = null) {
    const all = this.getAllPayments(tenantId);
    return all.filter(p => p.status === 'SETTLED' || !p.status);
  }

  /**
   * Retrieve payment record for session
   */
  getPaymentForSession(sessionId, tenantId = null) {
    const payments = this.getAllPayments(tenantId);
    return payments.find(p => p.sessionId === sessionId || p.session_id === sessionId) || null;
  }

  /**
   * Alias for recordPayment
   */
  createPayment(params) {
    return this.recordPayment(params);
  }

  /**
   * Record an immutable payment transaction record (PAY-2026-XXXX).
   * @param {Object} params { sessionId, billNumber, revisionNumber, invoiceNumber, amount, paymentMethod, referenceNo, receivedBy, receivedByName, tenantId, correlationId }
   * @returns {Object} Payment Record
   */
  recordPayment({ sessionId, billNumber = null, revisionNumber = null, invoiceNumber = null, amount, paymentMethod = 'CASH', referenceNo = '', receivedBy = 'emp-cashier', receivedByName = 'Cashier', tenantId = null, correlationId = null, operationId = null }) {
    const targetTenantId = this._getTenantId(tenantId);

    const cid = correlationId || 'CID-' + Math.floor(10000 + Math.random() * 90000);
    const opId = operationId || cid;
    const dg = this._getDataGateway();
    if (dg && typeof dg.isOperationProcessed === 'function' && dg.isOperationProcessed(opId)) {
      const existingPayment = this.getPaymentForSession(sessionId, targetTenantId);
      if (existingPayment) return existingPayment;
    }
    if (dg && typeof dg.markOperationProcessed === 'function') {
      dg.markOperationProcessed(opId);
    }
    
    // Ensure Tax Invoice is issued via invoiceModel if not provided
    let issuedInvoiceNo = invoiceNumber;
    if (!issuedInvoiceNo) {
      const invRecord = invoiceModel.issueInvoice({
        sessionId,
        cashierId: receivedBy,
        cashierName: receivedByName,
        tenantId: targetTenantId,
        correlationId: cid
      });
      issuedInvoiceNo = invRecord.invoiceNumber;
    }

    const latestRevision = billRevisionModel.getLatestRevisionForSession(sessionId, targetTenantId);
    const paymentsCount = this.getAllPayments(targetTenantId).length;
    const now = new Date();
    const year = now.getFullYear();
    const paymentId = `PAY-${year}-${String(1001 + paymentsCount).padStart(4, '0')}`;

    const paymentRecord = {
      id: paymentId,
      paymentId,
      tenantId: targetTenantId,
      tenant_id: targetTenantId,
      sessionId,
      session_id: sessionId,
      tableNumber: latestRevision ? latestRevision.tableNumber : 1,
      tableCode: latestRevision ? latestRevision.tableCode : 'T-01',
      billNumber: billNumber || (latestRevision ? latestRevision.billNumber : `BILL-${year}-${Math.floor(1000 + Math.random() * 9000)}`),
      billRevision: revisionNumber || (latestRevision ? latestRevision.revisionNumber : 1),
      invoiceNumber: issuedInvoiceNo,
      invoice_number: issuedInvoiceNo,
      amount: parseFloat(amount || (latestRevision ? latestRevision.grandTotal : 0)) || 0,
      paymentMethod: (paymentMethod || 'CASH').toUpperCase(),
      payment_method: (paymentMethod || 'CASH').toUpperCase(),
      referenceNo: referenceNo || '',
      reference_no: referenceNo || '',
      status: 'SETTLED',
      receivedBy: receivedBy || 'emp-cashier',
      receivedByName: receivedByName || 'Cashier',
      receivedAt: now.toISOString(),
      createdAt: now.toISOString(),
      correlationId: cid
    };

    // 1. Write to local offline store
    offlineStore.appendItem('payments', paymentRecord);

    // 2. Mark latest bill revision as PAID
    billRevisionModel.markRevisionPaid(sessionId, targetTenantId);

    // 3. Sync to Supabase offline_journal and payments table
    if (dg) {
      if (typeof dg.create === 'function') {
        dg.create('payments', paymentRecord).catch(e => console.warn('[paymentModel] Cloud payment sync error:', e.message));

        const journalEntry = {
          job_id: 'job_' + paymentId,
          job_type: 'PAYMENT_RECORDED',
          tenant_id: targetTenantId,
          entity_name: 'payments',
          payload: paymentRecord,
          device_id: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 30) : 'POS-TERMINAL-01',
          actor: receivedByName,
          correlation_id: cid,
          sync_state: 'SYNCED',
          created_at: now.toISOString()
        };
        dg.create('offline_journal', journalEntry).catch(e => console.warn('[paymentModel] Cloud journal sync error:', e.message));
      }
    }

    // 4. Publish platform event
    platformEventBus.publish('payment:recorded', {
      paymentId,
      sessionId,
      invoiceNumber: issuedInvoiceNo,
      amount: paymentRecord.amount,
      paymentMethod: paymentRecord.paymentMethod,
      receivedByName,
      tableNumber: paymentRecord.tableNumber,
      correlationId: cid,
      timestamp: now.toISOString()
    });

    return paymentRecord;
  }
}

export const paymentModel = new PaymentModel();
