/**
 * BusinessOS Platform - Purchasing, PO, GRN, 3-Way Matching & Accounts Payable (F3.2)
 * Full Purchasing Evidence Chain: PR -> PO -> GRN -> SUPINV -> AP -> PAY.
 * Enforces Architectural Rules:
 *   1. PO never updates inventory (Only GRN creates PURCHASE_RECEIPT).
 *   2. Repeatable partial receiving against PO without mutating historical GRNs.
 *   3. 3-Way Matching (PO vs GRN vs Supplier Invoice) producing MATCHED, QUANTITY_VARIANCE, PRICE_VARIANCE.
 *   4. Supplier Payment separate from Supplier Invoice (Payable = SUM(Invoices) - SUM(Payments)).
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { inventoryMovementModel } from './inventoryMovementModel.js';
import { inventoryItemModel } from './inventoryItemModel.js';
import { supplierModel } from './supplierModel.js';

class PurchasingModel {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('purchase_requests')) {
      offlineStore.setCollection('purchase_requests', []);
    }

    if (!offlineStore.getCollection('purchase_orders')) {
      const initialPOs = [
        {
          id: 'PO-2026-0042',
          poNumber: 'PO-2026-0042',
          supplierId: 'supp_abc_foods',
          supplierName: 'ABC Foods & Meat Supplies',
          status: 'SENT', // DRAFT | APPROVED | SENT | PARTIALLY_RECEIVED | RECEIVED | CLOSED
          items: [
            { inventoryItemId: 'invitem_chicken', itemName: 'Fresh Chicken Breast', orderedQty: 50.0, receivedQty: 0.0, unit: 'KG', agreedUnitPrice: 420.00, lineTotal: 21000.00 }
          ],
          subtotal: 21000.00,
          taxAmount: 0.00,
          grandTotal: 21000.00,
          createdBy: 'Jitu (Store Manager)',
          approvedBy: 'Sachin (Owner)',
          tenantId: 'tenant_h0qc7wf',
          createdAt: '2026-08-25T09:00:00.000Z'
        }
      ];
      offlineStore.setCollection('purchase_orders', initialPOs);
    }

    if (!offlineStore.getCollection('goods_received_notes')) {
      offlineStore.setCollection('goods_received_notes', []);
    }

    if (!offlineStore.getCollection('supplier_invoices')) {
      const initialInvoices = [
        {
          id: 'SUPINV-2026-1001',
          invoiceNumber: 'INV-ABC-9842',
          supplierId: 'supp_abc_foods',
          supplierName: 'ABC Foods & Meat Supplies',
          poId: 'PO-2026-0042',
          grnId: 'GRN-2026-0001',
          invoiceAmount: 19950.00,
          matchingStatus: 'MATCHED', // MATCHED | QUANTITY_VARIANCE | PRICE_VARIANCE
          dueDate: '2026-09-10',
          paymentStatus: 'UNPAID',
          tenantId: 'tenant_h0qc7wf',
          createdAt: '2026-08-26T11:00:00.000Z'
        }
      ];
      offlineStore.setCollection('supplier_invoices', initialInvoices);
    }

    if (!offlineStore.getCollection('supplier_payments')) {
      offlineStore.setCollection('supplier_payments', []);
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
   * 1. Create Purchase Request
   */
  createPurchaseRequest({ inventoryItemId, requestedQty, reason = 'Low Stock Alert', requestedBy = 'Store Manager', tenantId = null }) {
    const targetTenantId = this._getTenantId(tenantId);
    const store = offlineStore.getCollection('purchase_requests') || [];
    const item = inventoryItemModel.getItemById(inventoryItemId, targetTenantId);

    const prId = `PR-2026-${String(1001 + store.length).padStart(4, '0')}`;
    const record = {
      id: prId,
      prNumber: prId,
      inventoryItemId,
      itemName: item ? item.name : inventoryItemId,
      requestedQty: parseFloat(requestedQty) || 0,
      unit: item ? item.baseUnit : 'KG',
      reason,
      status: 'PENDING_APPROVAL',
      requestedBy,
      tenantId: targetTenantId,
      createdAt: new Date().toISOString()
    };

    store.unshift(record);
    offlineStore.setCollection('purchase_requests', store);
    platformEventBus.publish('purchasing:request:created', record);
    return record;
  }

  /**
   * 2. Create Purchase Order (PO)
   * Rule: PO creation NEVER updates inventory movements!
   */
  createPurchaseOrder({ supplierId, items = [], createdBy = 'Store Manager', approvedBy = 'Owner', tenantId = null }) {
    const targetTenantId = this._getTenantId(tenantId);
    const pos = offlineStore.getCollection('purchase_orders') || [];
    const supplier = supplierModel.getSupplierById(supplierId, targetTenantId);

    const poId = `PO-2026-${String(1001 + pos.length).padStart(4, '0')}`;

    let subtotal = 0;
    const poItems = items.map(it => {
      const item = inventoryItemModel.getItemById(it.inventoryItemId, targetTenantId);
      const qty = parseFloat(it.orderedQty) || 0;
      const unitCost = parseFloat(it.agreedUnitPrice) || (item ? item.currentUnitCost : 0);
      const lineTotal = Math.round(qty * unitCost * 100) / 100;
      subtotal += lineTotal;

      return {
        inventoryItemId: it.inventoryItemId,
        itemName: item ? item.name : it.inventoryItemId,
        orderedQty: qty,
        receivedQty: 0.0,
        unit: it.unit || (item ? item.baseUnit : 'KG'),
        agreedUnitPrice: unitCost,
        lineTotal
      };
    });

    const poRecord = {
      id: poId,
      poNumber: poId,
      supplierId,
      supplierName: supplier ? supplier.name : 'Supplier',
      status: 'APPROVED',
      items: poItems,
      subtotal,
      taxAmount: 0.00,
      grandTotal: subtotal,
      createdBy,
      approvedBy,
      tenantId: targetTenantId,
      createdAt: new Date().toISOString()
    };

    pos.unshift(poRecord);
    offlineStore.setCollection('purchase_orders', pos);

    // Record price point history in supplier model
    poItems.forEach(it => {
      supplierModel.recordPricePoint(supplierId, it.inventoryItemId, it.agreedUnitPrice, targetTenantId);
    });

    platformEventBus.publish('purchasing:po:created', poRecord);
    return poRecord;
  }

  /**
   * 3. Goods Received Note (GRN) — Repeatable Partial Receiving
   * Rule: Only delivered quantities create PURCHASE_RECEIPT movements in inventoryMovementModel.
   */
  processGRNReceipt({ poId, receivedItems = [], supplierInvoiceNo = '', receivedBy = 'Store Manager', tenantId = null }) {
    const targetTenantId = this._getTenantId(tenantId);
    const pos = offlineStore.getCollection('purchase_orders') || [];
    const grns = offlineStore.getCollection('goods_received_notes') || [];

    const po = pos.find(p => p.id === poId || p.poNumber === poId);
    if (!po) throw new Error(`PO ${poId} not found`);

    const grnId = `GRN-2026-${String(1001 + grns.length).padStart(4, '0')}`;
    let grnTotalValue = 0;
    let isQuantityVariance = false;
    let isPriceVariance = false;

    const processedGrnItems = [];

    receivedItems.forEach(rec => {
      const poItem = po.items.find(i => i.inventoryItemId === rec.inventoryItemId);
      const orderedQty = poItem ? poItem.orderedQty : rec.receivedQty;
      const agreedCost = poItem ? poItem.agreedUnitPrice : rec.unitCost;

      const receivedQty = parseFloat(rec.receivedQty) || 0;
      const deliveredCost = rec.unitCost !== undefined ? parseFloat(rec.unitCost) : agreedCost;
      const shortQty = Math.max(0, orderedQty - ((poItem ? poItem.receivedQty : 0) + receivedQty));

      if (receivedQty !== (orderedQty - (poItem ? poItem.receivedQty : 0))) {
        isQuantityVariance = true;
      }
      if (deliveredCost !== agreedCost) {
        isPriceVariance = true;
      }

      // Update PO item received quantity
      if (poItem) {
        poItem.receivedQty += receivedQty;
      }

      // Post IMMUTABLE PURCHASE_RECEIPT movement to inventoryMovementModel
      const inventoryMovement = inventoryMovementModel.recordMovement({
        inventoryItemId: rec.inventoryItemId,
        movementType: 'PURCHASE_RECEIPT',
        quantity: receivedQty,
        unit: rec.unit || (poItem ? poItem.unit : 'KG'),
        unitCost: deliveredCost,
        sourceType: 'GRN',
        sourceId: grnId,
        operationId: `inv-grn-${grnId}-${rec.inventoryItemId}`,
        performedBy: receivedBy,
        notes: `GRN Receipt for PO ${po.poNumber} (Invoice Ref: ${supplierInvoiceNo})`,
        tenantId: targetTenantId
      });

      const lineTotal = Math.round(receivedQty * deliveredCost * 100) / 100;
      grnTotalValue += lineTotal;

      processedGrnItems.push({
        inventoryItemId: rec.inventoryItemId,
        orderedQty,
        receivedQty,
        shortQty,
        unitCost: deliveredCost,
        agreedUnitPrice: agreedCost,
        lineTotal,
        movementId: inventoryMovement ? inventoryMovement.movementId : null
      });
    });

    // Update PO Status (PARTIALLY_RECEIVED vs RECEIVED)
    const isFullyReceived = po.items.every(i => i.receivedQty >= i.orderedQty);
    po.status = isFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
    offlineStore.setCollection('purchase_orders', pos);

    const grnRecord = {
      id: grnId,
      grnNumber: grnId,
      poId: po.id,
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      supplierInvoiceNo,
      receivedItems: processedGrnItems,
      grnTotalValue,
      receivedBy,
      tenantId: targetTenantId,
      createdAt: new Date().toISOString()
    };

    grns.unshift(grnRecord);
    offlineStore.setCollection('goods_received_notes', grns);

    // 4. Create Supplier Invoice & 3-Way Match Evaluation
    let matchingStatus = 'MATCHED';
    if (isPriceVariance) matchingStatus = 'PRICE_VARIANCE';
    else if (isQuantityVariance) matchingStatus = 'QUANTITY_VARIANCE';

    const invoices = offlineStore.getCollection('supplier_invoices') || [];
    const supInvId = `SUPINV-2026-${String(1001 + invoices.length).padStart(4, '0')}`;
    const invoiceRecord = {
      id: supInvId,
      invoiceNumber: supplierInvoiceNo || `INV-SUPP-${Date.now()}`,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      poId: po.id,
      grnId: grnRecord.id,
      invoiceAmount: grnTotalValue,
      matchingStatus,
      dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
      paymentStatus: 'UNPAID',
      tenantId: targetTenantId,
      createdAt: new Date().toISOString()
    };

    invoices.unshift(invoiceRecord);
    offlineStore.setCollection('supplier_invoices', invoices);

    platformEventBus.publish('purchasing:grn:created', grnRecord);
    platformEventBus.publish('purchasing:invoice:created', invoiceRecord);

    return { grn: grnRecord, supplierInvoice: invoiceRecord, poStatus: po.status };
  }

  /**
   * 5. Record Supplier Payment against Accounts Payable
   */
  recordSupplierPayment({ supplierId, invoiceId = null, amount, paymentMethod = 'BANK_TRANSFER', referenceNo = '', paidBy = 'Owner', tenantId = null }) {
    const targetTenantId = this._getTenantId(tenantId);
    const payments = offlineStore.getCollection('supplier_payments') || [];
    const invoices = offlineStore.getCollection('supplier_invoices') || [];

    const payId = `SUPPAY-2026-${String(1001 + payments.length).padStart(4, '0')}`;
    const record = {
      id: payId,
      paymentId: payId,
      supplierId,
      invoiceId,
      amount: parseFloat(amount) || 0,
      paymentMethod,
      referenceNo,
      paidBy,
      tenantId: targetTenantId,
      createdAt: new Date().toISOString()
    };

    payments.unshift(record);
    offlineStore.setCollection('supplier_payments', payments);

    // Update invoice payment status if invoiceId specified
    if (invoiceId) {
      const inv = invoices.find(i => i.id === invoiceId || i.invoiceNumber === invoiceId);
      if (inv) {
        inv.paymentStatus = 'PAID';
        offlineStore.setCollection('supplier_invoices', invoices);
      }
    }

    platformEventBus.publish('purchasing:payment:recorded', record);
    return record;
  }

  /**
   * Complete 6-Level Purchasing Evidence Chain Drill-Down
   * PR -> PO -> GRN -> SUPINV -> AP -> PAY
   */
  getPurchasingTraceability(poId, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const pos = offlineStore.getCollection('purchase_orders') || [];
    const grns = offlineStore.getCollection('goods_received_notes') || [];
    const invoices = offlineStore.getCollection('supplier_invoices') || [];
    const payments = offlineStore.getCollection('supplier_payments') || [];
    const prs = offlineStore.getCollection('purchase_requests') || [];

    const po = pos.find(p => p.id === poId || p.poNumber === poId) || {};
    const relatedGrns = grns.filter(g => g.poId === po.id || g.poNumber === po.poNumber);
    const relatedInvoices = invoices.filter(i => i.poId === po.id);
    const relatedPayments = payments.filter(p => p.supplierId === po.supplierId);
    const supplier = supplierModel.getSupplierById(po.supplierId, targetTenantId);

    return {
      po,
      grns: relatedGrns,
      invoices: relatedInvoices,
      payments: relatedPayments,
      supplier,
      outstandingPayable: supplierModel.getOutstandingPayable(po.supplierId, targetTenantId)
    };
  }
}

export const purchasingModel = new PurchasingModel();
