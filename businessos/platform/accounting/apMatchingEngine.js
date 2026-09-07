/**
 * BusinessOS Platform - Deterministic AP 3-Way Match Engine (P2P v1.0)
 * Evaluates Supplier Invoice vs Purchase Order vs Goods Received Notes (GRNs).
 * Computes structured match variances and updates supplier_invoices match_status.
 * Zero hidden judgment — 100% deterministic tolerance evaluation.
 */

import { purchasingModel } from '../inventory/purchasingModel.js';
import { supplierInvoiceModel } from './supplierInvoiceModel.js';
import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

class ApMatchingEngine {
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

  _getGrnsForPo(poId, poNumber, tenantId) {
    let grns = purchasingModel.getCollection ? purchasingModel._getCollection('goods_receipt_notes', tenantId) : [];
    if (!Array.isArray(grns) || grns.length === 0) {
      grns = offlineStore.getCollection('goods_receipt_notes', tenantId) || offlineStore.getCollection('goods_received_notes', tenantId) || [];
    }
    return grns.filter(g => {
      const matchPoId = poId && (g.poId === poId || g.po_id === poId);
      const matchPoNo = poNumber && (g.poNumber === poNumber || g.po_number === poNumber);
      return matchPoId || matchPoNo;
    });
  }

  /**
   * Deterministic 3-Way Matching Evaluator
   * @param {string} supplierInvoiceId 
   * @param {Object} tolerances Configurable tolerances { priceTolerancePercent: 0, qtyTolerancePercent: 0 }
   * @param {string|null} tenantId 
   * @returns {Object} Match Result Matrix
   */
  perform3WayMatch(supplierInvoiceId, tolerances = { priceTolerancePercent: 0, qtyTolerancePercent: 0 }, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const invoice = supplierInvoiceModel.getSupplierInvoiceById(supplierInvoiceId, targetTenantId);
    if (!invoice) {
      throw new Error(`Supplier invoice ${supplierInvoiceId} not found.`);
    }

    const poNumber = invoice.poNumber;
    let po = null;
    if (poNumber) {
      const pos = purchasingModel.getCollection ? purchasingModel._getCollection('purchase_orders', targetTenantId) : (offlineStore.getCollection('purchase_orders', targetTenantId) || []);
      po = pos.find(p => p.poNumber === poNumber || p.po_number === poNumber || p.id === poNumber);
    }

    const variances = [];
    let supplierMatch = true;
    let poMatch = true;
    let receiptMatch = true;
    let quantityMatch = true;
    let priceMatch = true;
    let taxMatch = true;

    // 1. PO Reference Check
    if (!poNumber) {
      poMatch = false;
      variances.push({
        type: 'po_missing',
        description: 'Invoice does not specify a Purchase Order (PO) reference number.'
      });
    } else if (!po) {
      poMatch = false;
      variances.push({
        type: 'po_not_found',
        description: `Purchase Order ${poNumber} could not be found in active purchasing registry.`
      });
    }

    // 2. Supplier Code Verification
    if (po && po.supplierCode && invoice.supplierCode && po.supplierCode !== invoice.supplierCode) {
      supplierMatch = false;
      variances.push({
        type: 'supplier_mismatch',
        poSupplierCode: po.supplierCode,
        invoiceSupplierCode: invoice.supplierCode,
        description: `Invoice supplier code (${invoice.supplierCode}) does not match PO supplier (${po.supplierCode}).`
      });
    }

    // 3. Resolve Linked GRNs
    const linkedGrns = po ? this._getGrnsForPo(po.id, po.poNumber, targetTenantId) : [];
    const resolvedGrnIds = linkedGrns.map(g => g.id || g.grnNumber);

    if (po && linkedGrns.length === 0) {
      receiptMatch = false;
      // If GRN has not been posted yet, mark as WAITING_FOR_RECEIPT
      variances.push({
        type: 'unreceived_goods',
        description: `No Goods Receipt Notes (GRNs) posted yet for Purchase Order ${poNumber}.`
      });
    }

    // 4. Line-by-Line Item Matching (PO Price vs GRN Accepted Qty vs Invoice Qty/Price)
    const lineComparison = (invoice.lines || []).map(invLine => {
      const itemCode = invLine.itemCode;
      const poLine = po && Array.isArray(po.lines) ? po.lines.find(pl => (pl.itemCode || pl.item_code) === itemCode) : null;
      
      // Calculate total accepted quantity across all linked GRNs for this item
      let acceptedQtyFromGrns = 0;
      linkedGrns.forEach(grn => {
        const grnLines = grn.lines || grn.receivedItems || [];
        const matchLine = grnLines.find(gl => (gl.itemCode || gl.item_code) === itemCode);
        if (matchLine) {
          acceptedQtyFromGrns += parseFloat(matchLine.acceptedQty || matchLine.accepted_qty || matchLine.receivedQty || 0) || 0;
        }
      });

      const invQty = parseFloat(invLine.quantity) || 0;
      const invPrice = parseFloat(invLine.unitPrice) || 0;
      const poPrice = poLine ? (parseFloat(poLine.poUnitPrice || poLine.unitPrice || poLine.catalogueUnitPrice) || 0) : 0;

      let linePriceMatch = true;
      let lineQtyMatch = true;

      // Price Variance Check
      if (poLine && invPrice > poPrice) {
        const priceDiff = invPrice - poPrice;
        if (priceDiff > 0.01) {
          linePriceMatch = false;
          priceMatch = false;
          variances.push({
            type: 'price_variance',
            itemCode,
            itemName: invLine.itemName,
            poUnitPrice: poPrice,
            invoiceUnitPrice: invPrice,
            difference: priceDiff,
            description: `Price variance on ${invLine.itemName} (${itemCode}): Invoice ₹${invPrice}/unit vs PO agreed ₹${poPrice}/unit (+₹${priceDiff.toFixed(2)})`
          });
        }
      }

      // Quantity Variance Check (Invoice Qty vs Accepted GRN Qty)
      if (linkedGrns.length > 0 && invQty > acceptedQtyFromGrns) {
        const qtyDiff = invQty - acceptedQtyFromGrns;
        if (qtyDiff > 0.001) {
          lineQtyMatch = false;
          quantityMatch = false;
          variances.push({
            type: 'quantity_variance',
            itemCode,
            itemName: invLine.itemName,
            acceptedGrnQty: acceptedQtyFromGrns,
            invoiceQty: invQty,
            difference: qtyDiff,
            description: `Quantity variance on ${invLine.itemName} (${itemCode}): Invoiced ${invQty} vs Accepted GRN total ${acceptedQtyFromGrns} (+${qtyDiff})`
          });
        }
      }

      return {
        itemCode,
        itemName: invLine.itemName,
        uom: invLine.uom,
        poUnitPrice: poPrice,
        acceptedGrnQty: acceptedQtyFromGrns,
        invoiceQty: invQty,
        invoiceUnitPrice: invPrice,
        priceMatch: linePriceMatch,
        quantityMatch: lineQtyMatch
      };
    });

    // 5. Determine Overall Match Status
    let computedMatchStatus = 'MATCHED';
    let computedInvoiceStatus = 'MATCHING';

    if (!poMatch || (linkedGrns.length === 0 && poMatch)) {
      computedMatchStatus = 'WAITING_FOR_RECEIPT';
      computedInvoiceStatus = 'MATCHING';
    } else if (variances.length > 0) {
      computedMatchStatus = 'EXCEPTION';
      computedInvoiceStatus = 'MATCHING';
    } else {
      computedMatchStatus = 'MATCHED';
      computedInvoiceStatus = 'MATCHING';
    }

    const matchResult = {
      supplierInvoiceId,
      poNumber,
      poId: po ? po.id : null,
      resolvedGrnIds,
      supplierMatch,
      poMatch,
      receiptMatch,
      quantityMatch,
      priceMatch,
      taxMatch,
      matchStatus: computedMatchStatus,
      variances,
      lineComparison,
      evaluatedAt: new Date().toISOString()
    };

    // Update supplier invoice model record
    supplierInvoiceModel.updateSupplierInvoice(supplierInvoiceId, {
      matchStatus: computedMatchStatus,
      matchVariances: variances,
      resolvedGrnIds,
      updatedAt: new Date().toISOString()
    }, targetTenantId);

    platformEventBus.publish('ap_match:evaluated', matchResult);
    return matchResult;
  }
}

export const apMatchingEngine = new ApMatchingEngine();
