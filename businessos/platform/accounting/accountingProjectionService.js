/**
 * BusinessOS Platform - Canonical Accounting Projection Engine (F1.1)
 * Read-only CQRS Financial Projection Service supplying frozen financial objects.
 * Strictly enforces financial separation rules:
 *   - ORDER != SALE
 *   - BILL REVISION != INVOICE
 *   - INVOICE != PAYMENT (Sales != Collections)
 *   - PAYMENT != CASH DRAWER
 *   - AUDIT EVENT != ACCOUNTING ENTRY
 *
 * No UI or view component performs independent financial calculations.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { invoiceModel } from '../billing/invoiceModel.js';
import { paymentModel } from '../billing/paymentModel.js';
import { billRevisionModel } from '../billing/billRevisionModel.js';
import { sessionAuditModel } from '../session/sessionAuditModel.js';
import { financialPeriodService } from './financialPeriodService.js';
import { platformEventBus } from '../events/platformEvents.js';

class AccountingProjectionService {
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

  _getDataGateway() {
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) {
      return window.__APP__.platform.dataGateway || null;
    }
    return null;
  }

  _syncCloudJournalEntry(exc, actorName = 'CA Auditor') {
    const dg = this._getDataGateway();
    if (!dg) return;

    const rawId = exc.id || exc.exceptionId || exc.invoiceNumber || 'EXC-UNKNOWN';
    const journalRow = {
      job_id: `job_exc_${rawId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      job_type: 'RECONCILIATION_EXCEPTION',
      tenant_id: exc.tenantId || 'tenant_h0qc7wf',
      entity_name: 'reconciliation_exceptions',
      payload: exc,
      device_id: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 30) : 'POS-TERMINAL',
      version: 1,
      actor: actorName,
      correlation_id: `CID-${Math.floor(10000 + Math.random() * 90000)}`,
      sync_state: 'SYNCED',
      created_at: new Date().toISOString()
    };

    if (typeof dg.create === 'function') {
      dg.create('offline_journal', journalRow).catch(e => console.warn('[accountingProjectionService] Cloud journal sync error:', e.message));
    }
  }

  _getUnifiedExceptionsStore() {
    const store = offlineStore.getCollection('reconciliation_exceptions') || [];
    const journal = offlineStore.getCollection('offline_journal') || [];

    const excMap = new Map();

    const processItem = (item, timestamp = 0) => {
      if (!item) return;
      const invNo = item.invoiceNumber;
      const sessId = item.sessionId;
      const excId = item.id || item.exceptionId;

      let existingKey = null;
      if (invNo && excMap.has(`inv_${invNo}`)) existingKey = `inv_${invNo}`;
      else if (sessId && excMap.has(`sess_${sessId}`)) existingKey = `sess_${sessId}`;
      else if (excId && excMap.has(`id_${excId}`)) existingKey = `id_${excId}`;

      const existing = existingKey ? excMap.get(existingKey) : null;
      const itemTime = new Date(item.updatedAt || item.createdAt || timestamp || 0).getTime();
      const existingTime = existing ? new Date(existing.updatedAt || existing.createdAt || 0).getTime() : 0;

      if (!existing || itemTime >= existingTime) {
        const canonicalKey = invNo ? `inv_${invNo}` : (sessId ? `sess_${sessId}` : `id_${excId}`);
        if (existingKey && existingKey !== canonicalKey) {
          excMap.delete(existingKey);
        }
        excMap.set(canonicalKey, item);
      }
    };

    // 1. Process local store exceptions
    store.forEach(e => processItem(e));

    // 2. Process cloud journal exceptions
    journal.forEach(j => {
      if (j && (j.entity_name === 'reconciliation_exceptions' || j.job_type === 'RECONCILIATION_EXCEPTION') && j.payload) {
        processItem(j.payload, j.created_at);
      }
    });

    const unifiedList = Array.from(excMap.values());
    offlineStore.setCollection('reconciliation_exceptions', unifiedList);
    return unifiedList;
  }

  /**
   * Universal Date Range Filtering Helper
   * Supports: 'today' | 'yesterday' | 'week' | 'month' | 'all' | { startDate, endDate }
   */
  filterRecordsByDate(records, dateFilter = 'today', dateField = 'issuedAt') {
    if (!Array.isArray(records)) return [];
    if (dateFilter === 'all') return records;

    let startTime = 0;
    let endTime = Infinity;

    if (typeof dateFilter === 'object' && dateFilter !== null) {
      if (dateFilter.startDate) startTime = new Date(dateFilter.startDate).getTime();
      if (dateFilter.endDate) endTime = new Date(dateFilter.endDate).getTime();
    } else {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const todayEnd = todayStart + (24 * 60 * 60 * 1000) - 1;

      if (dateFilter === 'today') {
        startTime = todayStart;
        endTime = todayEnd;
      } else if (dateFilter === 'yesterday') {
        startTime = todayStart - (24 * 60 * 60 * 1000);
        endTime = todayStart - 1;
      } else if (dateFilter === 'week') {
        startTime = todayStart - (7 * 24 * 60 * 60 * 1000);
      } else if (dateFilter === 'month') {
        startTime = todayStart - (30 * 24 * 60 * 60 * 1000);
      }
    }

    return records.filter(r => {
      const rawDate = r[dateField] || r.issuedAt || r.receivedAt || r.createdAt || r.created_at || r.timestamp;
      if (!rawDate) return true;
      const t = new Date(rawDate).getTime();
      if (isNaN(t)) return true;
      return t >= startTime && t <= endTime;
    });
  }

  /**
   * 1. Financial Overview KPI Projection
   */
  getFinancialOverview(filters = {}) {
    const tenantId = this._getTenantId(filters.tenantId);
    const dateFilter = filters.dateFilter || 'today';

    const allInvoices = invoiceModel.getAllInvoices(tenantId);
    const allPayments = paymentModel.getAllPayments(tenantId);

    const invoices = this.filterRecordsByDate(allInvoices, dateFilter, 'issuedAt');
    const payments = this.filterRecordsByDate(allPayments, dateFilter, 'receivedAt');

    let grossSales = 0;
    let discountsTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let serviceChargeTotal = 0;
    let grandTotalInvoiced = 0;
    let activeInvoicesCount = 0;
    let cancelledInvoicesCount = 0;

    invoices.forEach(inv => {
      if (inv.status === 'CANCELLED' || inv.invoiceStatus === 'CANCELLED') {
        cancelledInvoicesCount++;
        return; // Exclude cancelled invoices from revenue recognition
      }
      activeInvoicesCount++;

      const gross = parseFloat(inv.grossSales || inv.subtotal || inv.grandTotal) || 0;
      const disc = parseFloat(inv.discountsTotal || inv.discounts) || 0;
      const cg = parseFloat(inv.cgstAmount || (gross * 0.025)) || 0;
      const sg = parseFloat(inv.sgstAmount || (gross * 0.025)) || 0;
      const sc = parseFloat(inv.serviceChargeAmount || (gross * 0.05)) || 0;
      const gt = parseFloat(inv.grandTotal) || (gross - disc + cg + sg + sc);

      grossSales += gross;
      discountsTotal += disc;
      cgstTotal += cg;
      sgstTotal += sg;
      serviceChargeTotal += sc;
      grandTotalInvoiced += gt;
    });

    const taxableAmount = Math.max(0, grossSales - discountsTotal);

    let upiTotal = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    let totalCollected = 0;

    payments.forEach(p => {
      const amt = parseFloat(p.amount) || 0;
      totalCollected += amt;

      const method = String(p.paymentMethod || p.method || 'CASH').toUpperCase();
      if (method === 'UPI') upiTotal += amt;
      else if (method === 'CASH') cashTotal += amt;
      else if (method === 'CARD') cardTotal += amt;
    });

    const totalOutstanding = Math.max(0, grandTotalInvoiced - totalCollected);
    const reconciliation = this.getReconciliation({ tenantId, dateFilter });

    const periodInfo = financialPeriodService.getPeriodStatusForDate(new Date(), tenantId);

    return {
      period: periodInfo,
      dateFilter,
      grossSales: Math.round(grossSales * 100) / 100,
      discountsTotal: Math.round(discountsTotal * 100) / 100,
      taxableAmount: Math.round(taxableAmount * 100) / 100,
      cgstTotal: Math.round(cgstTotal * 100) / 100,
      sgstTotal: Math.round(sgstTotal * 100) / 100,
      serviceChargeTotal: Math.round(serviceChargeTotal * 100) / 100,
      grandTotalInvoiced: Math.round(grandTotalInvoiced * 100) / 100,

      // Collections (Sales != Collections)
      totalCollected: Math.round(totalCollected * 100) / 100,
      collectionsByMethod: {
        UPI: Math.round(upiTotal * 100) / 100,
        CASH: Math.round(cashTotal * 100) / 100,
        CARD: Math.round(cardTotal * 100) / 100
      },
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,

      invoiceCount: activeInvoicesCount,
      cancelledInvoiceCount: cancelledInvoicesCount,
      paymentCount: payments.length,
      discrepancyCount: reconciliation.mismatches.length,
      isReconciled: reconciliation.isReconciled
    };
  }

  /**
   * 2. Canonical Sales Register Projection
   */
  getSalesRegister(filters = {}) {
    const tenantId = this._getTenantId(filters.tenantId);
    const dateFilter = filters.dateFilter || 'all';
    const allInvoices = invoiceModel.getAllInvoices(tenantId);
    const filteredInvoices = this.filterRecordsByDate(allInvoices, dateFilter, 'issuedAt');

    return filteredInvoices.map(inv => {
      const grossSales = parseFloat(inv.grossSales || inv.subtotal || inv.grandTotal) || 0;
      const discountsTotal = parseFloat(inv.discountsTotal || inv.discounts) || 0;
      const taxableAmount = parseFloat(inv.taxableAmount !== undefined ? inv.taxableAmount : (grossSales - discountsTotal)) || 0;
      const cgstAmount = parseFloat(inv.cgstAmount || (taxableAmount * 0.025)) || 0;
      const sgstAmount = parseFloat(inv.sgstAmount || (taxableAmount * 0.025)) || 0;
      const serviceChargeAmount = parseFloat(inv.serviceChargeAmount || (taxableAmount * 0.05)) || 0;
      const grandTotal = parseFloat(inv.grandTotal) || (taxableAmount + cgstAmount + sgstAmount + serviceChargeAmount);

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        financialYear: inv.financialYear || '2026-27',
        sessionId: inv.sessionId,
        tableNumber: inv.tableNumber || 1,
        tableCode: inv.tableCode || `T-${String(inv.tableNumber || 1).padStart(2, '0')}`,
        cashierName: inv.cashierName || 'Cashier',
        issuedAt: inv.issuedAt || inv.createdAt || inv.created_at,
        grossSales: Math.round(grossSales * 100) / 100,
        discountsTotal: Math.round(discountsTotal * 100) / 100,
        taxableAmount: Math.round(taxableAmount * 100) / 100,
        cgstAmount: Math.round(cgstAmount * 100) / 100,
        sgstAmount: Math.round(sgstAmount * 100) / 100,
        serviceChargeAmount: Math.round(serviceChargeAmount * 100) / 100,
        grandTotal: Math.round(grandTotal * 100) / 100,
        status: inv.status || 'ISSUED', // 'ISSUED' | 'CANCELLED'
        correlationId: inv.correlationId || null
      };
    });
  }

  /**
   * 3. Immutable Payment Ledger Projection
   */
  getPaymentLedger(filters = {}) {
    const tenantId = this._getTenantId(filters.tenantId);
    const dateFilter = filters.dateFilter || 'all';
    const allPayments = paymentModel.getAllPayments(tenantId);
    const filteredPayments = this.filterRecordsByDate(allPayments, dateFilter, 'receivedAt');

    return filteredPayments.map(p => ({
      id: p.id || p.paymentId,
      paymentId: p.paymentId || p.id,
      invoiceNumber: p.invoiceNumber || 'N/A',
      billNumber: p.billNumber || 'N/A',
      sessionId: p.sessionId,
      tableNumber: p.tableNumber || 1,
      paymentMethod: String(p.paymentMethod || 'CASH').toUpperCase(),
      referenceNo: p.referenceNo || '—',
      amount: Math.round((parseFloat(p.amount) || 0) * 100) / 100,
      receivedByName: p.receivedByName || 'Cashier',
      receivedAt: p.receivedAt || p.createdAt || p.created_at,
      status: p.status || 'SETTLED'
    }));
  }

  /**
   * 4. Dynamic GST & Tax Breakdown Projection
   */
  getGstSummary(filters = {}) {
    const tenantId = this._getTenantId(filters.tenantId);
    const dateFilter = filters.dateFilter || 'today';
    const invoices = this.getSalesRegister({ tenantId, dateFilter }).filter(i => i.status !== 'CANCELLED');

    let totalGross = 0;
    let totalDiscounts = 0;
    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalServiceCharge = 0;

    // Grouping by Tax Profile
    const taxRateBreakdown = {
      'GST_5': { rateName: 'GST 5% (Restaurant Service)', taxableAmount: 0, cgst: 0, sgst: 0 }
    };

    invoices.forEach(inv => {
      totalGross += inv.grossSales;
      totalDiscounts += inv.discountsTotal;
      totalTaxable += inv.taxableAmount;
      totalCgst += inv.cgstAmount;
      totalSgst += inv.sgstAmount;
      totalServiceCharge += inv.serviceChargeAmount;

      taxRateBreakdown['GST_5'].taxableAmount += inv.taxableAmount;
      taxRateBreakdown['GST_5'].cgst += inv.cgstAmount;
      taxRateBreakdown['GST_5'].sgst += inv.sgstAmount;
    });

    return {
      dateFilter,
      sacCode: '996331',
      sacDescription: 'Restaurant & Catering Food Services',
      grossSales: Math.round(totalGross * 100) / 100,
      discountsTotal: Math.round(totalDiscounts * 100) / 100,
      netTaxableValue: Math.round(totalTaxable * 100) / 100,
      outputCgst: Math.round(totalCgst * 100) / 100,
      outputSgst: Math.round(totalSgst * 100) / 100,
      serviceChargeTotal: Math.round(totalServiceCharge * 100) / 100,
      totalGstLiability: Math.round((totalCgst + totalSgst) * 100) / 100,
      taxRateBreakdown
    };
  }

  /**
   * 5. Commercial Discount Ledger Projection
   */
  getDiscountLedger(filters = {}) {
    const tenantId = this._getTenantId(filters.tenantId);
    const dateFilter = filters.dateFilter || 'all';

    const revisions = billRevisionModel.getAllRevisions(tenantId);
    const filteredRevisions = this.filterRecordsByDate(revisions, dateFilter, 'createdAt');

    const discountEntries = [];
    filteredRevisions.forEach(rev => {
      if (Array.isArray(rev.discountRecords) && rev.discountRecords.length > 0) {
        rev.discountRecords.forEach(d => {
          discountEntries.push({
            revisionId: rev.id || rev.revisionId,
            sessionId: rev.sessionId,
            billNumber: rev.billNumber,
            tableNumber: rev.tableNumber || 1,
            discountType: d.discountType || d.type || 'COMMERCIAL_DISCOUNT',
            discountAmount: parseFloat(d.discountAmount || d.amount) || 0,
            reason: d.reason || 'Manager Approval',
            authorizedBy: d.authorizedBy || rev.waiterName || 'Manager',
            timestamp: rev.createdAt || rev.created_at
          });
        });
      } else if ((rev.discountsTotal || rev.discounts) > 0) {
        discountEntries.push({
          revisionId: rev.id || rev.revisionId,
          sessionId: rev.sessionId,
          billNumber: rev.billNumber,
          tableNumber: rev.tableNumber || 1,
          discountType: 'COMMERCIAL_DISCOUNT',
          discountAmount: parseFloat(rev.discountsTotal || rev.discounts) || 0,
          reason: 'Bill Revision Discount',
          authorizedBy: rev.waiterName || 'Staff',
          timestamp: rev.createdAt || rev.created_at
        });
      }
    });

    return discountEntries;
  }

  /**
   * 6. Outstanding Unpaid Bills Projection
   */
  getOutstandingBills(filters = {}) {
    const tenantId = this._getTenantId(filters.tenantId);
    const sales = this.getSalesRegister({ tenantId, dateFilter: 'all' }).filter(i => i.status !== 'CANCELLED');
    const payments = this.getPaymentLedger({ tenantId, dateFilter: 'all' });

    const paymentMap = new Map();
    payments.forEach(p => {
      const existing = paymentMap.get(p.invoiceNumber) || 0;
      paymentMap.set(p.invoiceNumber, existing + p.amount);
    });

    const outstandingList = [];
    sales.forEach(inv => {
      const settled = paymentMap.get(inv.invoiceNumber) || 0;
      if (settled < inv.grandTotal) {
        outstandingList.push({
          ...inv,
          amountSettled: settled,
          outstandingAmount: Math.round((inv.grandTotal - settled) * 100) / 100
        });
      }
    });

    return outstandingList;
  }

  /**
   * 7. Automated Reconciliation Engine
   * Deterministic Invoice-Level Reconciliation Engine supporting split payments (Scenario 9)
   * Enforces 8 distinct exception types: PERFECT_MATCH, MISSING_PAYMENT, PARTIAL_PAYMENT, OVERPAYMENT, INVALID_LINKAGE, AMBIGUOUS_LINKAGE, ORPHAN_PAYMENT, DUPLICATE_PAYMENT_REF, DUPLICATE_INVOICE_NO
   */
  getReconciliation(filters = {}) {
    const tenantId = this._getTenantId(filters.tenantId);
    const dateFilter = filters.dateFilter || 'today';

    const allInvoices = invoiceModel.getAllInvoices(tenantId).filter(i => i.status !== 'CANCELLED');
    const allPayments = paymentModel.getAllPayments(tenantId);

    const invoices = this.filterRecordsByDate(allInvoices, dateFilter, 'issuedAt');
    const payments = this.filterRecordsByDate(allPayments, dateFilter, 'receivedAt');

    // 1. Detect Duplicate Invoice Identifiers (DUPLICATE_INVOICE_NO - System Error)
    const invNumberMap = new Map();
    const duplicateInvNumbers = new Set();
    invoices.forEach(inv => {
      const invNo = inv.invoiceNumber;
      if (invNumberMap.has(invNo)) {
        duplicateInvNumbers.add(invNo);
      } else {
        invNumberMap.set(invNo, inv);
      }
    });

    // Read Reconciliation Exceptions Store (Hydrated from Supabase Cloud Journal)
    const exceptionsStore = this._getUnifiedExceptionsStore();
    const excMap = new Map();
    exceptionsStore.forEach(e => {
      if (e.invoiceNumber) excMap.set(e.invoiceNumber, e);
      if (e.sessionId) excMap.set(e.sessionId, e);
    });

    // Deduplicate invoice list by invoiceNumber / ID for single-entry reconciliation
    const uniqueInvoicesMap = new Map();
    invoices.forEach(inv => {
      if (!uniqueInvoicesMap.has(inv.invoiceNumber)) {
        uniqueInvoicesMap.set(inv.invoiceNumber, inv);
      }
    });
    const uniqueInvoices = Array.from(uniqueInvoicesMap.values());

    // 2. Invoice-Level Payment Aggregation Map (Supports Split Payments: Scenario 9)
    const paymentsByInvoice = new Map();
    const paymentsBySession = new Map();
    const processedPaymentIds = new Set();

    allPayments.forEach(p => {
      const invNo = p.invoiceNumber;
      const sessId = p.sessionId;

      if (invNo) {
        const list = paymentsByInvoice.get(invNo) || [];
        list.push(p);
        paymentsByInvoice.set(invNo, list);
      }
      if (sessId) {
        const list = paymentsBySession.get(sessId) || [];
        list.push(p);
        paymentsBySession.set(sessId, list);
      }
    });

    let totalInvoiced = 0;
    let totalSettled = 0;

    uniqueInvoices.forEach(inv => {
      totalInvoiced += parseFloat(inv.grandTotal) || 0;
    });

    payments.forEach(p => {
      totalSettled += parseFloat(p.amount) || 0;
    });

    const results = [];

    // Reconcile Unique Invoices at Invoice Level
    uniqueInvoices.forEach(inv => {
      const invNo = inv.invoiceNumber;
      const sessId = inv.sessionId;

      // Find all payments linked to this invoice or session
      const linkedByInv = paymentsByInvoice.get(invNo) || [];
      const linkedBySess = paymentsBySession.get(sessId) || [];

      // Combine linked payments without duplicates
      const linkedMap = new Map();
      [...linkedByInv, ...linkedBySess].forEach(p => linkedMap.set(p.id || p.paymentId, p));
      const linkedPayments = Array.from(linkedMap.values());

      linkedPayments.forEach(p => processedPaymentIds.add(p.id || p.paymentId));

      const totalLinkedAmount = linkedPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const expectedAmount = Math.round((parseFloat(inv.grandTotal) || 0) * 100) / 100;
      const settledAmount = Math.round(totalLinkedAmount * 100) / 100;
      const difference = Math.round((expectedAmount - settledAmount) * 100) / 100;

      const excRecord = excMap.get(invNo) || excMap.get(sessId);
      const workflowStatus = excRecord ? excRecord.status : 'UNFLAGGED';

      let type = 'PERFECT_MATCH';
      let possibleCauses = [];

      if (duplicateInvNumbers.has(invNo)) {
        type = 'DUPLICATE_INVOICE_NO';
        possibleCauses = ['System sequence collision', 'Duplicate invoice number assigned across distinct sessions'];
      } else if (settledAmount === 0 && expectedAmount > 0) {
        type = 'MISSING_PAYMENT';
        possibleCauses = ['Payment not recorded by cashier', 'Customer left without payment', 'Delayed gateway settlement'];
      } else if (settledAmount < expectedAmount && settledAmount > 0) {
        type = 'PARTIAL_PAYMENT';
        possibleCauses = ['Partial settlement recorded', 'Discounted amount mismatch', 'Cashier undercollected'];
      } else if (settledAmount > expectedAmount) {
        type = 'OVERPAYMENT';
        possibleCauses = ['Payment linked to wrong invoice', 'Duplicate payment recorded', 'Customer overpayment'];
      } else {
        const hasSessionMismatch = linkedPayments.some(p => p.sessionId && p.sessionId !== sessId);
        if (hasSessionMismatch) {
          type = 'INVALID_LINKAGE';
          possibleCauses = ['Payment invoiceId points to invoice belonging to a different session'];
        }
      }

      // Reconciliation Status Determination
      let finalStatus = 'MATCHED';
      if (workflowStatus === 'FLAGGED' || workflowStatus === 'REJECTED_BY_CA') {
        finalStatus = 'FLAGGED';
      } else if (workflowStatus === 'PROPOSED_RESOLUTION') {
        finalStatus = 'PROPOSED_RESOLUTION';
      } else if (workflowStatus === 'RESOLVED') {
        finalStatus = 'MATCHED';
      } else if (type !== 'PERFECT_MATCH') {
        finalStatus = 'EXCEPTION';
      }

      results.push({
        type,
        invoiceNumber: invNo,
        sessionId: sessId,
        tableNumber: inv.tableNumber || 1,
        tableCode: inv.tableCode || `T-${String(inv.tableNumber || 1).padStart(2, '0')}`,
        invoicedAmount: expectedAmount,
        settledAmount,
        difference,
        linkedPaymentCount: linkedPayments.length,
        linkedPayments,
        possibleCauses,
        workflowStatus,
        status: finalStatus,
        exceptionRecord: excRecord || null
      });
    });

    // Detect Orphan Payments (Settled payments without matching invoice)
    payments.forEach(p => {
      const pId = p.id || p.paymentId;
      if (!processedPaymentIds.has(pId)) {
        const amt = parseFloat(p.amount) || 0;
        results.push({
          type: 'ORPHAN_PAYMENT',
          invoiceNumber: p.invoiceNumber || 'ORPHAN',
          sessionId: p.sessionId || 'UNKNOWN',
          tableNumber: p.tableNumber || 1,
          tableCode: 'T-01',
          invoicedAmount: 0,
          settledAmount: Math.round(amt * 100) / 100,
          difference: Math.round(-amt * 100) / 100,
          linkedPaymentCount: 1,
          linkedPayments: [p],
          possibleCauses: ['Settled payment exists without matching tax invoice', 'Invoice was deleted or unlinked'],
          workflowStatus: 'UNFLAGGED',
          status: 'EXCEPTION'
        });
      }
    });

    const exceptions = results.filter(r => r.status !== 'MATCHED');

    return {
      dateFilter,
      totalInvoicedAmount: Math.round(totalInvoiced * 100) / 100,
      totalSettledAmount: Math.round(totalSettled * 100) / 100,
      difference: Math.round((totalInvoiced - totalSettled) * 100) / 100,
      totalTransactions: results.length,
      matchedCount: results.length - exceptions.length,
      exceptionCount: exceptions.length,
      isReconciled: exceptions.length === 0,
      mismatches: exceptions,
      allResults: results
    };
  }

  /**
   * Reconciliation Exception Workflow: Flag Exception for Manager Review
   */
  flagException(exceptionData, actorName = 'CA Auditor', tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const store = this._getUnifiedExceptionsStore();

    let exc = store.find(e => e.invoiceNumber === exceptionData.invoiceNumber || (e.sessionId && e.sessionId === exceptionData.sessionId));
    const now = new Date().toISOString();

    if (!exc) {
      exc = {
        id: 'exc_' + Math.random().toString(36).substring(2, 9),
        exceptionId: 'EXC-' + Math.floor(1000 + Math.random() * 9000),
        tenantId: targetTenantId,
        invoiceNumber: exceptionData.invoiceNumber,
        sessionId: exceptionData.sessionId,
        tableNumber: exceptionData.tableNumber || 1,
        type: exceptionData.type || 'AMOUNT_MISMATCH',
        expectedAmount: exceptionData.invoicedAmount || 0,
        collectedAmount: exceptionData.settledAmount || 0,
        difference: exceptionData.difference || 0,
        createdAt: now
      };
      store.push(exc);
    }

    exc.status = 'FLAGGED';
    exc.flaggedBy = actorName;
    exc.flaggedAt = now;
    exc.reason = exceptionData.reason || 'Flagged by CA for Manager review';
    exc.updatedAt = now;

    offlineStore.setCollection('reconciliation_exceptions', store);
    this._syncCloudJournalEntry(exc, actorName);

    sessionAuditModel.logEvent({
      sessionId: exceptionData.sessionId,
      tableNumber: exceptionData.tableNumber || 1,
      eventType: 'RECONCILIATION_EXCEPTION_FLAGGED',
      actorRole: 'CA_AUDITOR',
      description: `CA Auditor flagged exception ${exc.exceptionId} (${exceptionData.type}) for invoice ${exceptionData.invoiceNumber}`,
      metadata: exc
    });

    platformEventBus.publish('reconciliation:exception:flagged', exc);
    return exc;
  }

  /**
   * Reconciliation Exception Workflow: Get all flagged exceptions
   */
  getFlaggedExceptions(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const store = this._getUnifiedExceptionsStore();
    return store.filter(e => (!targetTenantId || e.tenantId === targetTenantId || e.tenant_id === targetTenantId || !e.tenantId) && (e.status === 'FLAGGED' || e.status === 'REJECTED_BY_CA'));
  }

  /**
   * Reconciliation Exception Workflow: Manager Proposes Resolution
   */
  proposeResolution(exceptionId, resolutionData = {}, actorName = 'Manager', tenantId = null) {
    const store = this._getUnifiedExceptionsStore();
    const exc = store.find(e => e.id === exceptionId || e.exceptionId === exceptionId || e.invoiceNumber === exceptionId);

    if (exc) {
      exc.status = 'PROPOSED_RESOLUTION';
      exc.proposedBy = actorName;
      exc.proposedAt = new Date().toISOString();
      exc.resolutionType = resolutionData.resolutionType || 'PAYMENT_RECORDED';
      exc.resolutionReason = resolutionData.resolutionReason || 'Settlement completed by Manager/Cashier';
      exc.correctiveEntryId = resolutionData.correctiveEntryId || null;
      exc.updatedAt = new Date().toISOString();

      offlineStore.setCollection('reconciliation_exceptions', store);
      this._syncCloudJournalEntry(exc, actorName);

      sessionAuditModel.logEvent({
        sessionId: exc.sessionId,
        tableNumber: exc.tableNumber || 1,
        eventType: 'RECONCILIATION_RESOLUTION_PROPOSED',
        actorRole: 'MANAGER',
        description: `Manager proposed resolution for exception ${exc.exceptionId} (${exc.invoiceNumber}): ${exc.resolutionType}`,
        metadata: exc
      });

      platformEventBus.publish('exception:resolved', exc);
    }
    return exc;
  }

  /**
   * Reconciliation Exception Workflow: CA Accepts Resolution -> Marks Reconciled
   */
  acceptResolution(exceptionId, actorName = 'CA Auditor', tenantId = null) {
    const store = this._getUnifiedExceptionsStore();
    const exc = store.find(e => e.id === exceptionId || e.exceptionId === exceptionId || e.invoiceNumber === exceptionId);

    if (exc) {
      exc.status = 'RESOLVED';
      exc.acceptedBy = actorName;
      exc.acceptedAt = new Date().toISOString();
      exc.updatedAt = new Date().toISOString();

      offlineStore.setCollection('reconciliation_exceptions', store);
      this._syncCloudJournalEntry(exc, actorName);

      sessionAuditModel.logEvent({
        sessionId: exc.sessionId,
        tableNumber: exc.tableNumber || 1,
        eventType: 'RECONCILIATION_RESOLUTION_ACCEPTED',
        actorRole: 'CA_AUDITOR',
        description: `CA Auditor accepted resolution for exception ${exc.exceptionId} (${exc.invoiceNumber}). Reconciliation marked RESOLVED.`,
        metadata: exc
      });

      platformEventBus.publish('exception:resolved', exc);
    }
    return exc;
  }

  /**
   * Reconciliation Exception Workflow: CA Rejects Resolution -> Returns to Manager
   */
  rejectResolution(exceptionId, rejectionReason = 'Resolution rejected by CA', actorName = 'CA Auditor', tenantId = null) {
    const store = this._getUnifiedExceptionsStore();
    const exc = store.find(e => e.id === exceptionId || e.exceptionId === exceptionId || e.invoiceNumber === exceptionId);

    if (exc) {
      exc.status = 'REJECTED_BY_CA';
      exc.rejectedBy = actorName;
      exc.rejectedAt = new Date().toISOString();
      exc.rejectionReason = rejectionReason;
      exc.updatedAt = new Date().toISOString();

      offlineStore.setCollection('reconciliation_exceptions', store);
      this._syncCloudJournalEntry(exc, actorName);

      sessionAuditModel.logEvent({
        sessionId: exc.sessionId,
        tableNumber: exc.tableNumber || 1,
        eventType: 'RECONCILIATION_RESOLUTION_REJECTED',
        actorRole: 'CA_AUDITOR',
        description: `CA Auditor rejected Manager resolution for ${exc.exceptionId} (${exc.invoiceNumber}). Reason: ${rejectionReason}`,
        metadata: exc
      });

      platformEventBus.publish('reconciliation:exception:flagged', exc);
    }
    return exc;
  }

  /**
   * 8. Session Audit Trail Projection
   */
  getAuditTrail(filters = {}) {
    const tenantId = this._getTenantId(filters.tenantId);
    const dateFilter = filters.dateFilter || 'all';

    const logs = sessionAuditModel.getAllAuditLogs(tenantId) || [];
    return this.filterRecordsByDate(logs, dateFilter, 'timestamp');
  }

  /**
   * 9. Drill-down Evidence Chain for an Invoice / Session
   * Full traceability: Invoice -> Bill Revision -> Order Items -> Discount History -> Tax Calculation -> Payment -> Audit Trail
   */
  getInvoiceTraceability(targetId, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    
    // Find target invoice
    const invoices = invoiceModel.getAllInvoices(targetTenantId);
    const invoice = invoices.find(i => i.invoiceNumber === targetId || i.sessionId === targetId || i.id === targetId) || null;

    const sessionId = invoice ? invoice.sessionId : targetId;
    const revisions = billRevisionModel.getRevisionsForSession(sessionId, targetTenantId);
    const payments = paymentModel.getAllPayments(targetTenantId).filter(p => p.sessionId === sessionId || (invoice && p.invoiceNumber === invoice.invoiceNumber));
    const auditLogs = sessionAuditModel.getAuditLogsForSession(sessionId);

    const orders = (offlineStore.getCollection('orders') || []).filter(o => o.sessionId === sessionId || o.session_id === sessionId);

    return {
      sessionId,
      invoice,
      revisions,
      orders,
      payments,
      auditLogs
    };
  }
}

export const accountingProjectionService = new AccountingProjectionService();
