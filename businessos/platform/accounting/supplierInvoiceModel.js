import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { journalValidationEngine } from './journalValidationEngine.js';
import { gstTaxEngine } from './gstTaxEngine.js';
import { financialPeriodService } from './financialPeriodService.js';

class SupplierInvoiceModel {
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
   * Retrieve all supplier invoices for a tenant
   */
  getAllSupplierInvoices(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const dg = this._getDataGateway();
    let invoices = [];
    if (dg && typeof dg.getCachedCollection === 'function') {
      invoices = dg.getCachedCollection('supplier_invoices', targetTenantId);
    }
    if (!Array.isArray(invoices) || invoices.length === 0) {
      invoices = offlineStore.getCollection('supplier_invoices', targetTenantId) || offlineStore.getCollection('supplier_invoices') || [];
    }
    return invoices.filter(inv => !targetTenantId || inv.tenantId === targetTenantId || inv.tenant_id === targetTenantId);
  }

  /**
   * Get supplier invoice by ID
   */
  getSupplierInvoiceById(supplierInvoiceId, tenantId = null) {
    const invoices = this.getAllSupplierInvoices(tenantId);
    return invoices.find(inv => inv.id === supplierInvoiceId || inv.supplierInvoiceId === supplierInvoiceId) || null;
  }

  /**
   * Create & Intake Supplier Invoice
   * @param {Object} params { supplierInvoiceNumber, supplierCode, supplierName, poNumber, invoiceDate, dueDate, lines, discountAmount, freightAmount, taxAmount, supplierStateCode, tenantStateCode, source, notes, tenantId, createdBy }
   */
  createSupplierInvoice(params) {
    const targetTenantId = this._getTenantId(params.tenantId);
    const supplierInvoiceNumber = (params.supplierInvoiceNumber || params.invoiceNumber || '').trim();
    const supplierCode = (params.supplierCode || 'SUP-001').trim();

    if (!supplierInvoiceNumber) {
      throw new Error('Supplier Invoice Number is required.');
    }

    const invoiceDate = params.invoiceDate || new Date().toISOString().split('T')[0];

    // Gate 4: Financial Period Lock Interception
    if (financialPeriodService.isDateLocked(invoiceDate)) {
      throw new Error(`PERIOD_LOCKED_ERROR: Cannot intake supplier invoice for date ${invoiceDate} because the financial period is LOCKED.`);
    }

    // Gate 6: Supplier Invoice Uniqueness Guard (supplierCode + supplierInvoiceNumber)
    const existingInvoices = this.getAllSupplierInvoices(targetTenantId);
    const duplicate = existingInvoices.find(inv => 
      (inv.supplierCode === supplierCode || inv.supplier_code === supplierCode) &&
      (inv.supplierInvoiceNumber === supplierInvoiceNumber || inv.supplier_invoice_number === supplierInvoiceNumber)
    );

    if (duplicate) {
      throw new Error(`DUPLICATE_SUPPLIER_INVOICE_ERROR: Supplier invoice ${supplierInvoiceNumber} for supplier ${supplierCode} already exists.`);
    }

    const supplierInvoiceId = `sinv-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    const lines = (params.lines || []).map(line => {
      const qty = parseFloat(line.quantity) || 0;
      const unitPrice = parseFloat(line.unitPrice) || 0;
      const lineTotal = parseFloat(line.lineTotal !== undefined ? line.lineTotal : (qty * unitPrice)) || 0;
      return {
        itemCode: line.itemCode || line.item_code,
        itemName: line.itemName || line.item_name || 'Inventory Item',
        uom: line.uom || 'UNIT',
        quantity: qty,
        unitPrice,
        taxRate: parseFloat(line.taxRate) || 5,
        lineTotal
      };
    });

    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const discountAmount = parseFloat(params.discountAmount) || 0;
    const freightAmount = parseFloat(params.freightAmount) || 0;
    const taxableAmount = Math.max(0, subtotal - discountAmount);

    // Gate 3: GST / ITC State Boundary Breakdown
    const gstBreakdown = gstTaxEngine.calculateGstBreakdown({
      supplierStateCode: params.supplierStateCode || '27',
      tenantStateCode: params.tenantStateCode || '27',
      taxableAmount,
      taxRate: params.taxRate || 5
    });

    const taxAmount = parseFloat(params.taxAmount) || gstBreakdown.totalTax;
    const grandTotal = parseFloat(params.grandTotal || params.totalPayable) || (taxableAmount + taxAmount + freightAmount);

    const record = {
      id: supplierInvoiceId,
      supplierInvoiceId,
      tenantId: targetTenantId,
      tenant_id: targetTenantId,
      supplierInvoiceNumber,
      supplier_invoice_number: supplierInvoiceNumber,
      supplierCode,
      supplierName: params.supplierName || 'Supplier',
      supplierStateCode: params.supplierStateCode || '27',
      poNumber: params.poNumber || null,
      invoiceDate,
      dueDate: params.dueDate || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0], // Net 15
      source: params.source || 'MANUAL', // 'MANUAL' | 'UPLOAD' | 'EMAIL' | 'SUPPLIER_PORTAL' | 'IMPORT'
      documentReference: params.documentReference || null,
      lines,
      subtotal,
      discountAmount,
      freightAmount,
      taxableAmount,
      cgstAmount: gstBreakdown.cgstAmount,
      sgstAmount: gstBreakdown.sgstAmount,
      igstAmount: gstBreakdown.igstAmount,
      taxAmount,
      grandTotal,
      paidAmount: 0,
      outstandingAmount: grandTotal,
      status: 'SUBMITTED', // 'DRAFT' | 'SUBMITTED' | 'MATCHING' | 'RESOLVED' | 'APPROVED' | 'PAYMENT_DUE' | 'PARTIALLY_PAID' | 'PAID' | 'REJECTED'
      matchStatus: 'PENDING', // 'PENDING' | 'WAITING_FOR_RECEIPT' | 'MATCHED' | 'EXCEPTION'
      matchVariances: [],
      notes: params.notes || '',
      createdBy: params.createdBy || 'CA Auditor',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store via DataGateway
    const dg = this._getDataGateway();
    if (dg && typeof dg.create === 'function') {
      dg.create('supplier_invoices', record);
    } else {
      const existing = offlineStore.getCollection('supplier_invoices') || [];
      existing.push(record);
      offlineStore.setCollection('supplier_invoices', existing);
    }

    platformEventBus.publish('supplier_invoice:created', record);
    return record;
  }

  /**
   * Update Supplier Invoice status & match results
   */
  updateSupplierInvoice(supplierInvoiceId, patch, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const existing = this.getSupplierInvoiceById(supplierInvoiceId, targetTenantId);
    if (!existing) {
      throw new Error(`Supplier invoice ${supplierInvoiceId} not found.`);
    }

    const updated = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString()
    };

    const dg = this._getDataGateway();
    if (dg && typeof dg.update === 'function') {
      dg.update('supplier_invoices', existing.id, updated);
    } else {
      const invoices = offlineStore.getCollection('supplier_invoices') || [];
      const idx = invoices.findIndex(i => i.id === existing.id);
      if (idx !== -1) {
        invoices[idx] = updated;
        offlineStore.setCollection('supplier_invoices', invoices);
      }
    }

    platformEventBus.publish('supplier_invoice:updated', updated);
    return updated;
  }

  /**
   * Approve Supplier Invoice for AP Liability Recognition (CA Action)
   * Publishes AP_INVOICE_APPROVED journal entry
   */
  approveSupplierInvoice(supplierInvoiceId, approverName = 'CA Auditor', tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const inv = this.getSupplierInvoiceById(supplierInvoiceId, targetTenantId);
    if (!inv) throw new Error(`Supplier invoice ${supplierInvoiceId} not found.`);

    if (financialPeriodService.isDateLocked(inv.invoiceDate)) {
      throw new Error(`PERIOD_LOCKED_ERROR: Cannot approve invoice ${inv.supplierInvoiceNumber} for locked date ${inv.invoiceDate}.`);
    }

    if (inv.matchStatus === 'EXCEPTION' && inv.status !== 'RESOLVED') {
      throw new Error(`Cannot approve invoice ${inv.supplierInvoiceNumber} with unresolved 3-way match exceptions.`);
    }

    const updated = this.updateSupplierInvoice(supplierInvoiceId, {
      status: 'APPROVED',
      approvedBy: approverName,
      approvedAt: new Date().toISOString()
    }, targetTenantId);

    // Gate 3: Calculate tax lines
    const taxLines = inv.igstAmount > 0 ? [
      { accountCode: '1430', accountName: 'Input IGST (Recoverable)', amount: inv.igstAmount }
    ] : [
      { accountCode: '1410', accountName: 'Input CGST (Recoverable)', amount: inv.cgstAmount || (inv.taxAmount / 2) },
      { accountCode: '1420', accountName: 'Input SGST (Recoverable)', amount: inv.sgstAmount || (inv.taxAmount / 2) }
    ];

    // Build Double-Entry Journal Lines
    const debits = [
      { accountCode: '2110', accountName: 'Goods Received Not Invoiced (GRNI) Accrual', amount: inv.taxableAmount },
      ...taxLines,
      ...(inv.freightAmount > 0 ? [{ accountCode: '5200', accountName: 'Freight & Inward Delivery Charges', amount: inv.freightAmount }] : [])
    ];

    const credits = [
      { accountCode: '2100', accountName: `Accounts Payable - ${inv.supplierName}`, amount: inv.grandTotal }
    ];

    const journalPayload = {
      supplierInvoiceId: inv.id,
      supplierInvoiceNumber: inv.supplierInvoiceNumber,
      poNumber: inv.poNumber,
      supplierCode: inv.supplierCode,
      supplierName: inv.supplierName,
      debits,
      credits,
      approvedBy: approverName,
      approvedAt: new Date().toISOString()
    };

    // Gate 2: Enforce Double-Entry Balancing
    journalValidationEngine.validateJournalEntry(journalPayload);

    const journalRow = {
      jobId: `job_ap_inv_${inv.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      jobType: 'AP_INVOICE_APPROVED',
      tenantId: targetTenantId,
      entityName: 'supplier_invoices',
      payload: journalPayload,
      deviceId: 'CA-TERMINAL',
      version: 1,
      actor: approverName,
      correlationId: `CID-AP-${Math.floor(10000 + Math.random() * 90000)}`,
      syncState: 'QUEUED',
      createdAt: new Date().toISOString()
    };

    offlineStore.appendItem('offline_journal', journalRow);
    const dg = this._getDataGateway();
    if (dg && typeof dg.create === 'function') {
      dg.create('offline_journal', journalRow).catch(() => {});
    }

    platformEventBus.publish('supplier_invoice:approved', updated);
    return updated;
  }
}

export const supplierInvoiceModel = new SupplierInvoiceModel();

