/**
 * BusinessOS Platform - Dedicated GST Tax Invoice Engine (PD-010 & PD-012)
 * Manages financial year sequence (INV/26-27/1042), invoice issuance, and immutable tax invoice records.
 * Independent of paymentModel to maintain clean financial separation.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { billRevisionModel } from './billRevisionModel.js';
import { tenantModel } from '../tenant/tenantModel.js';

class InvoiceModel {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('invoices')) {
      offlineStore.setCollection('invoices', []);
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
   * Derive current Indian Financial Year string (e.g. "2026-27")
   */
  getCurrentFinancialYear(dateObj = new Date()) {
    const month = dateObj.getMonth(); // 0-indexed (0=Jan, 3=Apr)
    const year = dateObj.getFullYear();

    let startYear, endYear;
    if (month >= 3) {
      startYear = year;
      endYear = year + 1;
    } else {
      startYear = year - 1;
      endYear = year;
    }
    return `${startYear}-${String(endYear).slice(-2)}`;
  }

  /**
   * Generates the next sequential tax invoice number (e.g., INV/26-27/1042).
   * @param {string} series Prefix series (default 'POS')
   * @param {string|null} tenantId 
   * @returns {Object} { financialYear, invoiceSeries, invoiceSequence, invoiceNumber }
   */
  generateNextInvoiceSequence(series = 'POS', tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const invoices = this.getAllInvoices(targetTenantId);
    const revisions = offlineStore.getCollection('bill_revisions') || [];
    
    const fy = this.getCurrentFinancialYear();
    const fyShort = fy.replace('20', '').replace('-20', '-'); // e.g. "26-27"

    let maxSeq = 1000;
    [...invoices, ...revisions].forEach(r => {
      const inv = r.invoiceNumber || r.invoice_number;
      if (inv) {
        const match = inv.match(/(\d{4})$/);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        }
      }
    });

    const nextSeq = maxSeq + 1;
    const invNo = `INV/${fyShort}/${nextSeq}`;

    return {
      financialYear: fy,
      invoiceSeries: series,
      invoiceSequence: nextSeq,
      invoiceNumber: invNo
    };
  }

  /**
   * Retrieve all issued tax invoices for a tenant
   */
  getAllInvoices(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const all = offlineStore.getCollection('invoices') || [];
    return all.filter(i => !targetTenantId || i.tenantId === targetTenantId || i.tenant_id === targetTenantId);
  }

  /**
   * Retrieve tax invoice by invoiceNumber or sessionId
   */
  getInvoiceForSession(sessionId, tenantId = null) {
    const invoices = this.getAllInvoices(tenantId);
    return invoices.find(i => i.sessionId === sessionId || i.session_id === sessionId) || null;
  }

  /**
   * Finalize bill revision & Issue official Tax Invoice.
   * Consumes sequential invoice number (e.g., INV/26-27/1042).
   * @param {Object} params { sessionId, revisionId, cashierId, cashierName, tenantId, correlationId }
   * @returns {Object} Tax Invoice Record
   */
  issueInvoice({ sessionId, revisionId = null, cashierId = 'emp-cashier', cashierName = 'Cashier', tenantId = null, correlationId = null }) {
    const targetTenantId = this._getTenantId(tenantId);
    const existingInvoice = this.getInvoiceForSession(sessionId, targetTenantId);
    if (existingInvoice) {
      return existingInvoice; // Invoice already issued
    }

    const latestRevision = revisionId 
      ? (offlineStore.getCollection('bill_revisions') || []).find(r => r.id === revisionId || r.revisionId === revisionId)
      : billRevisionModel.getLatestRevisionForSession(sessionId, targetTenantId);

    if (!latestRevision) {
      throw new Error(`Cannot issue invoice: No bill revision found for session ${sessionId}`);
    }

    const primaryTenant = tenantModel.getPrimaryTenant() || {};
    const seqObj = this.generateNextInvoiceSequence('POS', targetTenantId);
    const cid = correlationId || latestRevision.correlationId || ('CID-' + Math.floor(10000 + Math.random() * 90000));
    const now = new Date().toISOString();

    const invoiceRecord = {
      id: 'inv_' + Math.random().toString(36).substring(2, 9),
      tenantId: targetTenantId,
      tenant_id: targetTenantId,
      
      // FY & Sequential Identifiers
      financialYear: seqObj.financialYear,
      invoiceSeries: seqObj.invoiceSeries,
      invoiceSequence: seqObj.invoiceSequence,
      invoiceNumber: seqObj.invoiceNumber,
      invoice_number: seqObj.invoiceNumber,

      // Associated Operational Objects
      sessionId,
      session_id: sessionId,
      billNumber: latestRevision.billNumber,
      revisionId: latestRevision.id,
      revisionNumber: latestRevision.revisionNumber,
      tableNumber: latestRevision.tableNumber,
      tableCode: latestRevision.tableCode,

      // Commercial Financial Breakdown
      grossSales: latestRevision.grossSales || latestRevision.subtotal || 0,
      discountsTotal: latestRevision.discountsTotal || latestRevision.discounts || 0,
      discountRecords: latestRevision.discountRecords || [],
      taxableAmount: latestRevision.taxableAmount || 0,
      
      taxLines: latestRevision.taxLines || [],
      charges: latestRevision.charges || [],
      cgstPercent: latestRevision.cgstPercent,
      cgstAmount: latestRevision.cgstAmount,
      sgstPercent: latestRevision.sgstPercent,
      sgstAmount: latestRevision.sgstAmount,
      serviceChargePercent: latestRevision.serviceChargePercent,
      serviceChargeAmount: latestRevision.serviceChargeAmount,
      grandTotal: latestRevision.grandTotal,

      items: latestRevision.items || [],

      // Particulars & GST Identifiers
      restaurantName: primaryTenant.name || 'Anchor Bistro & Cafe',
      gstin: primaryTenant.gstin || '29AAAAA0000A1Z5',
      fssaiLicense: primaryTenant.fssaiLicense || '11521001000123',
      cashierId: cashierId || 'emp-cashier',
      cashierName: cashierName || 'Cashier Desk',
      waiterId: latestRevision.waiterId,
      waiterName: latestRevision.waiterName,

      issuedAt: now,
      createdAt: now,
      status: 'ISSUED',
      correlationId: cid
    };

    // 1. Update bill revision status to ISSUED with invoiceNumber
    billRevisionModel.markRevisionIssued(sessionId, seqObj.invoiceNumber, targetTenantId);

    // 2. Save Tax Invoice to local offline store
    offlineStore.appendItem('invoices', invoiceRecord);

    // 3. Sync to Supabase cloud table & offline_journal / DataGateway
    const dg = this._getDataGateway();
    if (dg && typeof dg.create === 'function') {
      dg.create('invoices', invoiceRecord).catch(e => console.warn('[invoiceModel] Cloud invoices sync error:', e.message));

      const journalEntry = {
        job_id: 'job_' + invoiceRecord.id,
        job_type: 'TAX_INVOICE_ISSUED',
        tenant_id: targetTenantId,
        entity_name: 'invoices',
        payload: invoiceRecord,
        device_id: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 30) : 'POS-TERMINAL-01',
        actor: cashierName,
        correlation_id: cid,
        sync_state: 'SYNCED',
        created_at: now
      };
      dg.create('offline_journal', journalEntry).catch(e => console.warn('[invoiceModel] Cloud journal sync error:', e.message));
    }

    // 4. Publish platform event
    platformEventBus.publish('invoice:issued', {
      invoiceNumber: invoiceRecord.invoiceNumber,
      sessionId,
      tableNumber: invoiceRecord.tableNumber,
      grandTotal: invoiceRecord.grandTotal,
      cashierName,
      correlationId: cid,
      timestamp: now
    });

    return invoiceRecord;
  }
}

export const invoiceModel = new InvoiceModel();
