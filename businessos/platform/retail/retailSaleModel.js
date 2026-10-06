/**
 * BusinessOS Platform - Retail (Wine Store) Sale Engine (Retail Phase 1)
 *
 * THE RETAILSALE TRANSACTION BOUNDARY. One checkout = ONE idempotent unit keyed
 * by a single `correlation_id` that emits, together, FOUR distinct commercial
 * objects plus an inventory effect:
 *
 *   (a) Retail Sale           `RS-<FY>-<#####>`  -> retail_sales (status CONFIRMED)
 *   (b) Inventory consumption SALE_CONSUMPTION @ LOC-RETAIL -> stock_transactions
 *   (c) Retail Invoice        `INV/<fy>/<#####>R` -> invoices   (shared Invoice Engine)
 *   (d) Retail Settlement     `SET-R-<#####>`      -> payments   (shared Payment Engine,
 *                                                    tagged business_unit 'RETAIL')
 *   (e) Register Transaction  SALE on `RETAIL-01`  -> register_transactions
 *
 * All five share the ONE correlation_id. Re-posting the same correlation_id
 * replays to the same objects and NEVER double-deducts / double-invoices /
 * double-pays / double-books the register. A crash in any emit step compensates
 * the stock movement and unwinds the artifacts already written, so no orphaned
 * deduction survives and the boundary stays safely replayable.
 *
 * Atomics note: the platform has no combined retail RPC, so this is the plan's
 * ordered + reversible + keyed JS path (the fallback the plan sanctions). The
 * shared Invoice/Payment/Tax engines are REUSED, not duplicated. Hard boundary:
 * no TableSession, no KOT/BOT, no billRevisionModel, no restaurant Cashier.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { invoiceModel } from '../billing/invoiceModel.js';
import { taxConfigurationModel } from '../accounting/taxConfigurationModel.js';
import { retailProductModel } from './retailProductModel.js';

const BUSINESS_UNIT = 'RETAIL';
const RETAIL_LOCATION = 'LOC-RETAIL';
const RETAIL_REGISTER = 'RETAIL-01';
const CONSUME_UOM = 'PCS';

class RetailSaleModel {
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

  _matchesTenant(rec, tenantId) {
    return !tenantId || rec.tenantId === tenantId || rec.tenant_id === tenantId;
  }

  /** Best-effort durable cloud write (local mirror is the synchronous source of truth). */
  _cloudCreate(collection, record) {
    const dg = this._getDataGateway();
    if (dg && typeof dg.create === 'function') {
      try {
        Promise.resolve(dg.create(collection, record)).catch(e =>
          console.warn(`[retailSaleModel] Cloud ${collection} sync error:`, e.message));
      } catch (e) {
        console.warn(`[retailSaleModel] Cloud ${collection} create threw:`, e.message);
      }
    }
  }

  _removeLocal(collection, predicate) {
    const list = offlineStore.getCollection(collection) || [];
    offlineStore.setCollection(collection, list.filter(item => !predicate(item)));
  }

  /**
   * Persist a LOC-RETAIL stock_balances projection change to the cloud and emit
   * the realtime projection event. The local offlineStore mirror is already
   * updated by the caller; this makes the decrement durable in Supabase (dg.update
   * writes the local adapter + cloud, or queues an offline job) and drives UI.
   */
  _persistBalance(bal, itemCode, newQty, unitCost, tenantId, source) {
    const valuation = Math.round(newQty * (unitCost || 0) * 100) / 100;
    const patch = {
      id: (bal && bal.id) || `sb-${itemCode}-${RETAIL_LOCATION}`,
      tenantId, tenant_id: tenantId,
      itemCode, item_code: itemCode,
      locationCode: RETAIL_LOCATION, location_code: RETAIL_LOCATION,
      quantity: newQty, currentStock: newQty, unitCost: unitCost || 0, valuation,
      data: { itemCode, locationCode: RETAIL_LOCATION, quantity: newQty, valuation, unitCost: unitCost || 0 },
      updatedAt: new Date().toISOString()
    };
    const dg = this._getDataGateway();
    if (dg && bal && bal.id && typeof dg.update === 'function') {
      try { Promise.resolve(dg.update('stock_balances', bal.id, patch)).catch(e => console.warn('[retailSaleModel] Cloud stock_balances update error:', e.message)); } catch (_) {}
    } else if (dg && typeof dg.create === 'function') {
      try { Promise.resolve(dg.create('stock_balances', patch)).catch(e => console.warn('[retailSaleModel] Cloud stock_balances create error:', e.message)); } catch (_) {}
    }
    if (platformEventBus && typeof platformEventBus.publish === 'function') {
      platformEventBus.publish('stock:balance:updated', { tenantId, itemCode, locationCode: RETAIL_LOCATION, newBalance: newQty, source });
    }
  }

  // ---- Read helpers --------------------------------------------------------

  getAllSales(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const list = offlineStore.getCollection('retail_sales') || [];
    return list.filter(s => this._matchesTenant(s, targetTenantId));
  }

  getSaleByCorrelation(correlationId, tenantId = null) {
    if (!correlationId) return null;
    const targetTenantId = this._getTenantId(tenantId);
    return (offlineStore.getCollection('retail_sales') || [])
      .find(s => this._matchesTenant(s, targetTenantId) &&
        (s.correlationId || s.correlation_id) === correlationId) || null;
  }

  getSaleByNumber(saleNumber, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    return (offlineStore.getCollection('retail_sales') || [])
      .find(s => this._matchesTenant(s, targetTenantId) &&
        (s.saleNumber || s.sale_number) === saleNumber) || null;
  }

  // ---- Numbering -----------------------------------------------------------

  _fyShort() {
    const fy = invoiceModel.getCurrentFinancialYear(); // "2026-27"
    return fy.replace('20', '').replace('-20', '-');    // "26-27"
  }

  _genSaleNumber(tenantId) {
    const short = this._fyShort();
    const sales = this.getAllSales(tenantId);
    let max = 0;
    sales.forEach(s => {
      const m = String(s.saleNumber || s.sale_number || '').match(/RS-.+-(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    let seq = max + 1;
    let num = `RS-${short}-${String(seq).padStart(5, '0')}`;
    while (sales.some(s => (s.saleNumber || s.sale_number) === num)) {
      seq++;
      num = `RS-${short}-${String(seq).padStart(5, '0')}`;
    }
    return num;
  }

  _genSettlementId(tenantId) {
    const payments = (offlineStore.getCollection('payments') || [])
      .filter(p => this._matchesTenant(p, tenantId) && (p.businessUnit || p.business_unit) === BUSINESS_UNIT);
    let max = 0;
    payments.forEach(p => {
      const m = String(p.id || p.paymentId || '').match(/SET-R-(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    let seq = max + 1;
    let id = `SET-R-${String(seq).padStart(5, '0')}`;
    while (payments.some(p => (p.id || p.paymentId) === id)) {
      seq++;
      id = `SET-R-${String(seq).padStart(5, '0')}`;
    }
    return id;
  }

  _genCorrelationId() {
    return 'RCID-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // ---- Cart normalization + tax -------------------------------------------

  _normalizeLines(rawLines = [], tenantId) {
    const out = [];
    for (const raw of rawLines) {
      let product = null;
      if (raw.productId || raw.productCode || raw.itemCode || raw.barcode) {
        product = (raw.productId && retailProductModel.getById(raw.productId, tenantId))
          || (raw.productCode && retailProductModel.getByProductCode(raw.productCode, tenantId))
          || (raw.barcode && retailProductModel.findByBarcode(raw.barcode, tenantId))
          || null;
      }
      const quantity = Math.abs(parseFloat(raw.quantity != null ? raw.quantity : raw.qty) || 0);
      if (!quantity) continue;
      const unitPrice = parseFloat(raw.price != null ? raw.price : (raw.unitPrice)) ||
        (product ? parseFloat(product.sellingPrice) || 0 : 0);
      const itemCode = raw.itemCode || (product && product.itemCode) || raw.productCode || '';
      out.push({
        productCode: raw.productCode || (product && product.productCode) || '',
        itemCode,
        name: raw.name || (product && product.name) || itemCode || 'Retail Item',
        quantity,
        price: unitPrice,
        lineTotal: Math.round(unitPrice * quantity * 100) / 100,
        taxCategory: raw.taxCategory || (product && product.taxCategory) || 'ALCOHOL_WINE',
        isLiquor: true
      });
    }
    return out;
  }

  _computeTotals(lines, discount = 0, tenantId) {
    const items = lines.map(l => ({
      itemCode: l.itemCode, name: l.name, quantity: l.quantity, price: l.price,
      lineTotal: l.lineTotal, isLiquor: true, category: 'WINE'
    }));
    const disc = parseFloat(discount) || 0;
    const discountRecords = disc > 0 ? [{ discountAmount: disc }] : [];
    return taxConfigurationModel.computeBillTax({
      items, discountRecords, isIntraState: true, tenantId
    });
  }

  // ---- Stock guard + consumption (b) --------------------------------------

  _getBalance(lines, tenantId) {
    const balances = offlineStore.getCollection('stock_balances') || [];
    return balances.map(b => ({
      itemCode: b.itemCode || b.item_code,
      locationCode: b.locationCode || b.location_code,
      quantity: parseFloat(b.quantity != null ? b.quantity : (b.data && b.data.quantity)) || 0,
      unitCost: parseFloat(b.unitCost || b.unit_cost || (b.data && b.data.unitCost)) || 0,
      raw: b
    })).filter(b => b.locationCode === RETAIL_LOCATION && (!tenantId || !b.raw.tenantId || b.raw.tenantId === tenantId || b.raw.tenant_id === tenantId));
  }

  /** Pre-checkout guard: throw INSUFFICIENT_STOCK before any write if short at LOC-RETAIL. */
  _assertStockAvailable(lines, tenantId) {
    const need = new Map();
    lines.forEach(l => need.set(l.itemCode, (need.get(l.itemCode) || 0) + l.quantity));
    const balByItem = new Map();
    this._getBalance(lines, tenantId).forEach(b => {
      balByItem.set(b.itemCode, (balByItem.get(b.itemCode) || 0) + b.quantity);
    });
    for (const [itemCode, qty] of need.entries()) {
      const avail = balByItem.get(itemCode) || 0;
      if (avail < qty) {
        const err = new Error(`INSUFFICIENT_STOCK: ${itemCode} at ${RETAIL_LOCATION} requires ${qty} ${CONSUME_UOM}, but only ${avail} available`);
        err.code = 'INSUFFICIENT_STOCK';
        throw err;
      }
    }
  }

  _consumeStock({ lines, tenantId, saleNumber, correlationId, occurredAt, performedBy }) {
    const balances = offlineStore.getCollection('stock_balances') || [];
    const movement = [];
    for (const line of lines) {
      const idx = balances.findIndex(b =>
        (b.itemCode || b.item_code) === line.itemCode &&
        (b.locationCode || b.location_code) === RETAIL_LOCATION);
      const bal = idx >= 0 ? balances[idx] : null;
      const curQty = bal ? (parseFloat(bal.quantity != null ? bal.quantity : (bal.data && bal.data.quantity)) || 0) : 0;
      const unitCost = bal ? (parseFloat(bal.unitCost || bal.unit_cost || (bal.data && bal.data.unitCost)) || 0) : 0;
      const newQty = Math.round((curQty - line.quantity) * 1000) / 1000;

      const txn = {
        id: `txn-retail-${line.itemCode}-${Math.random().toString(36).substring(2, 8)}`,
        tenantId,
        tenant_id: tenantId,
        operationId: `cons_retail_${correlationId}`,
        transactionType: 'SALE_CONSUMPTION',
        transaction_type: 'SALE_CONSUMPTION',
        status: 'POSTED',
        referenceType: 'RETAIL_SALE',
        reference_type: 'RETAIL_SALE',
        referenceId: saleNumber,
        reference_id: saleNumber,
        itemCode: line.itemCode,
        item_code: line.itemCode,
        itemName: line.name,
        locationCode: RETAIL_LOCATION,
        location_code: RETAIL_LOCATION,
        quantity: -Math.abs(line.quantity),
        uom: (bal && (bal.uom || bal.base_uom)) || CONSUME_UOM,
        unitCost,
        totalCost: Math.round(line.quantity * unitCost * 100) / 100,
        performedBy,
        correlationId,
        correlation_id: correlationId,
        occurredAt,
        createdAt: new Date().toISOString()
      };
      offlineStore.appendItem('stock_transactions', txn);
      this._cloudCreate('stock_transactions', txn);

      if (bal) {
        balances[idx] = {
          ...bal,
          quantity: newQty,
          currentStock: newQty,
          valuation: Math.round(newQty * unitCost * 100) / 100,
          data: { ...(bal.data || bal), quantity: newQty, valuation: Math.round(newQty * unitCost * 100) / 100 },
          updatedAt: new Date().toISOString()
        };
        offlineStore.setCollection('stock_balances', balances);
        this._persistBalance(bal, line.itemCode, newQty, unitCost, tenantId, 'RETAIL_SALE_CONSUMPTION');
      }

      movement.push({ itemCode: line.itemCode, quantity: line.quantity, prevQty: curQty, newQty, unitCost, balanceId: bal && bal.id });
    }
    return movement;
  }

  /** Restore balances to their pre-attempt state WITHOUT posting ledger rows.
   *  Used only for mid-flow compensation, so the boundary unwinds as if the
   *  attempt never happened (a real refund instead posts SALE_REVERSAL). */
  _restoreBalances(movement, tenantId) {
    if (!movement || !movement.length) return;
    const balances = offlineStore.getCollection('stock_balances') || [];
    movement.forEach(m => {
      const idx = balances.findIndex(b =>
        (b.itemCode || b.item_code) === m.itemCode &&
        (b.locationCode || b.location_code) === RETAIL_LOCATION);
      if (idx >= 0) {
        balances[idx] = {
          ...balances[idx],
          quantity: m.prevQty,
          currentStock: m.prevQty,
          valuation: Math.round(m.prevQty * m.unitCost * 100) / 100,
          data: { ...(balances[idx].data || balances[idx]), quantity: m.prevQty },
          updatedAt: new Date().toISOString()
        };
        offlineStore.setCollection('stock_balances', balances);
        this._persistBalance(balances[idx], m.itemCode, m.prevQty, m.unitCost, tenantId, 'RETAIL_SALE_COMPENSATION');
      }
    });
  }

  _compensate(written, movement, ctx) {
    // Unwind any artifacts already emitted in this attempt, then drop the
    // SALE_CONSUMPTION lines and restore balances, so no orphaned deduction /
    // invoice / payment / register line survives. The replay starts clean.
    if (written.register) this._removeLocal('register_transactions', r => (r.correlationId || r.correlation_id) === ctx.correlationId);
    if (written.payment) this._removeLocal('payments', p => (p.correlationId || p.correlation_id) === ctx.correlationId && (p.businessUnit || p.business_unit) === BUSINESS_UNIT);
    if (written.invoice) this._removeLocal('invoices', i => (i.correlationId || i.correlation_id) === ctx.correlationId && (i.businessUnit || i.business_unit) === BUSINESS_UNIT);
    if (written.sale) this._removeLocal('retail_sales', s => (s.correlationId || s.correlation_id) === ctx.correlationId);
    this._removeLocal('stock_transactions', t =>
      (t.correlationId || t.correlation_id) === ctx.correlationId &&
      (t.transactionType || t.transaction_type) === 'SALE_CONSUMPTION');
    this._restoreBalances(movement, ctx.tenantId);
  }

  // ---- Artifact writers ----------------------------------------------------

  _writeSale({ tenantId, saleNumber, registerId, invoiceNumber, settlementId, correlationId, grandTotal, customerName, operatorName, occurredAt, lines, totals }) {
    const rec = {
      id: 'rs-' + Math.random().toString(36).substring(2, 9),
      tenantId,
      tenant_id: tenantId,
      saleNumber,
      sale_number: saleNumber,
      businessUnit: BUSINESS_UNIT,
      business_unit: BUSINESS_UNIT,
      registerId,
      register_id: registerId,
      status: 'CONFIRMED',
      invoiceNumber,
      invoice_number: invoiceNumber,
      settlementId,
      settlement_id: settlementId,
      correlationId,
      correlation_id: correlationId,
      grandTotal,
      grand_total: grandTotal,
      customerName: customerName || 'Walk-in',
      customer_name: customerName || 'Walk-in',
      operatorName,
      operator_name: operatorName,
      occurredAt,
      occurred_at: occurredAt,
      lines,
      totals
    };
    offlineStore.appendItem('retail_sales', rec);
    this._cloudCreate('retail_sales', rec);
    return rec;
  }

  _writeInvoice({ tenantId, saleNumber, settlementId, correlationId, invoiceSeq, lines, totals, operatorName, occurredAt }) {
    const rec = {
      id: 'inv_' + Math.random().toString(36).substring(2, 9),
      tenantId,
      tenant_id: tenantId,
      businessUnit: BUSINESS_UNIT,
      business_unit: BUSINESS_UNIT,
      financialYear: invoiceSeq.financialYear,
      invoiceSeries: invoiceSeq.invoiceSeries,
      invoiceSequence: invoiceSeq.invoiceSequence,
      invoiceNumber: invoiceSeq.invoiceNumber,
      invoice_number: invoiceSeq.invoiceNumber,
      retailSaleNumber: saleNumber,
      saleNumber,
      settlementId,
      grossSales: totals.grossSales,
      discountsTotal: totals.discountsTotal,
      taxableAmount: totals.taxableAmount,
      vatAmount: totals.vatAmount,
      cgstAmount: totals.cgstAmount,
      sgstAmount: totals.sgstAmount,
      igstAmount: totals.igstAmount,
      totalTax: totals.totalTax,
      taxLines: totals.taxLines,
      charges: totals.charges,
      fiscalSections: totals.fiscalSections,
      grandTotal: totals.grandTotal,
      items: lines,
      cashierName: operatorName,
      issuedAt: occurredAt,
      createdAt: occurredAt,
      status: 'ISSUED',
      correlationId
    };
    offlineStore.appendItem('invoices', rec);
    this._cloudCreate('invoices', rec);
    return rec;
  }

  _writeSettlement({ tenantId, saleNumber, settlementId, invoiceNumber, correlationId, grandTotal, paymentMethod, referenceNo, operatorName, occurredAt }) {
    const rec = {
      id: settlementId,
      paymentId: settlementId,
      tenantId,
      tenant_id: tenantId,
      businessUnit: BUSINESS_UNIT,
      business_unit: BUSINESS_UNIT,
      source: 'RETAIL_SALE',
      retailSaleNumber: saleNumber,
      saleNumber,
      invoiceNumber,
      invoice_number: invoiceNumber,
      amount: grandTotal,
      paymentMethod,
      payment_method: paymentMethod,
      referenceNo: referenceNo || '',
      reference_no: referenceNo || '',
      status: 'SETTLED',
      receivedByName: operatorName,
      receivedAt: occurredAt,
      createdAt: occurredAt,
      correlationId
    };
    offlineStore.appendItem('payments', rec);
    this._cloudCreate('payments', rec);
    return rec;
  }

  _writeRegisterTxn({ tenantId, registerId, saleNumber, correlationId, grandTotal, paymentMethod, operatorName, occurredAt }) {
    const rec = {
      id: 'rt-' + Math.random().toString(36).substring(2, 9),
      tenantId,
      tenant_id: tenantId,
      registerId,
      register_id: registerId,
      businessUnit: BUSINESS_UNIT,
      business_unit: BUSINESS_UNIT,
      transactionType: 'SALE',
      transaction_type: 'SALE',
      paymentMethod,
      payment_method: paymentMethod,
      amount: grandTotal,
      referenceType: 'RETAIL_SALE',
      reference_type: 'RETAIL_SALE',
      referenceId: saleNumber,
      reference_id: saleNumber,
      correlationId,
      correlation_id: correlationId,
      performedBy: operatorName,
      performed_by: operatorName,
      occurredAt,
      occurred_at: occurredAt,
      createdAt: occurredAt
    };
    offlineStore.appendItem('register_transactions', rec);
    this._cloudCreate('register_transactions', rec);
    return rec;
  }

  // ---- The boundary --------------------------------------------------------

  /**
   * Checkout a retail sale draft as ONE idempotent, keyed, compensating unit.
   * @param {Object} draft { lines:[{productCode|itemCode|barcode|productId, quantity, price?}], discount?, customerName?, registerId? }
   * @param {Object} options { paymentMethod, referenceNo, registerId, correlationId, tenantId, operatorName }
   * @param {Object} session authenticated session (optional; supplies tenantId/operatorName)
   * @returns {Promise<Object>} the retail sale record (with invoice/settlement/txn ids)
   */
  async checkout(draft = {}, options = {}, session = null) {
    const tenantId = this._getTenantId(options.tenantId || draft.tenantId || (session && session.tenantId));
    const registerId = options.registerId || draft.registerId || RETAIL_REGISTER;
    const paymentMethod = (options.paymentMethod || draft.paymentMethod || 'CASH').toUpperCase();
    const referenceNo = options.referenceNo || draft.referenceNo || '';
    const correlationId = options.correlationId || draft.correlationId || this._genCorrelationId();
    const operatorName = options.operatorName || (session && (session.employeeName || session.name)) || draft.operatorName || 'Retail Manager';
    const occurredAt = new Date().toISOString();

    // 1. Idempotency guard: same correlation_id replays to the same sale, no re-emit.
    const existing = this.getSaleByCorrelation(correlationId, tenantId);
    if (existing) {
      return { ...existing, idempotentReplay: true };
    }

    // 2. Normalize cart.
    const lines = this._normalizeLines(draft.lines || [], tenantId);
    if (!lines.length) {
      const err = new Error('RETAIL_EMPTY_CART');
      err.code = 'RETAIL_EMPTY_CART';
      throw err;
    }

    // 3. Pre-checkout stock guard (no writes yet).
    this._assertStockAvailable(lines, tenantId);

    // 4. Compute totals via the shared tax engine.
    const totals = this._computeTotals(lines, draft.discount, tenantId);

    // 5. Reserve fiscal document numbers.
    const saleNumber = this._genSaleNumber(tenantId);
    const settlementId = this._genSettlementId(tenantId);
    const invoiceSeq = invoiceModel.generateNextInvoiceSequence('RETAIL', tenantId);

    // 6. (b) Consume stock at LOC-RETAIL (tracked for compensation).
    const movement = this._consumeStock({ lines, tenantId, saleNumber, correlationId, occurredAt, performedBy: operatorName });

    const ctx = { tenantId, saleNumber, correlationId, occurredAt, performedBy: operatorName };
    const written = { sale: null, invoice: null, payment: null, register: null };

    try {
      // (a) Retail Sale
      written.sale = this._writeSale({
        tenantId, saleNumber, registerId, invoiceNumber: invoiceSeq.invoiceNumber, settlementId,
        correlationId, grandTotal: totals.grandTotal, customerName: draft.customerName, operatorName, occurredAt, lines, totals
      });
      if (options.__forceFailureAt === 'invoice') throw new Error('SIMULATED_INVOICE_FAILURE');

      // (c) Retail Invoice (shared Invoice Engine, RETAIL series -> INV/<fy>/<seq>R)
      written.invoice = this._writeInvoice({
        tenantId, saleNumber, settlementId, correlationId, invoiceSeq, lines, totals, operatorName, occurredAt
      });
      if (options.__forceFailureAt === 'payment') throw new Error('SIMULATED_PAYMENT_FAILURE');

      // (d) Retail Settlement (shared Payment Engine table, tagged business_unit RETAIL)
      written.payment = this._writeSettlement({
        tenantId, saleNumber, settlementId, invoiceNumber: invoiceSeq.invoiceNumber, correlationId,
        grandTotal: totals.grandTotal, paymentMethod, referenceNo, operatorName, occurredAt
      });
      if (options.__forceFailureAt === 'register') throw new Error('SIMULATED_REGISTER_FAILURE');

      // (e) Register Transaction (SALE on RETAIL-01)
      written.register = this._writeRegisterTxn({
        tenantId, registerId, saleNumber, correlationId, grandTotal: totals.grandTotal, paymentMethod, operatorName, occurredAt
      });
    } catch (err) {
      // Crash-between-steps safety: unwind emitted artifacts + reverse stock so no
      // orphaned deduction/invoice/payment/register line survives. Replay is clean.
      this._compensate(written, movement, ctx);
      throw err;
    }

    platformEventBus.publish('retail:sale:checkout', {
      saleNumber, invoiceNumber: invoiceSeq.invoiceNumber, settlementId, registerId,
      correlationId, grandTotal: totals.grandTotal, paymentMethod, operatorName, timestamp: occurredAt
    });

    return { ...written.sale, invoiceNumber: invoiceSeq.invoiceNumber, settlementId, registerTransactionId: written.register.id, idempotentReplay: false };
  }

  // ---- Refunds (Retail Phase 4) -------------------------------------------
  //
  // A refund is the MIRROR of the sale boundary, keyed by its OWN refund
  // correlation_id (so it never collides with the sale's) and idempotent on
  // replay. It always books a register REFUND on RETAIL-01, a refund settlement
  // (payments, business_unit RETAIL, negative amount) and a RETAIL-series credit
  // note referencing the original invoice. Stock returns ONLY when `restock`
  // (unopened bottles) via a compensating SALE_REVERSAL at LOC-RETAIL. The sale
  // record tracks per-line refundedQuantity so a partial refund cannot over-
  // refund, and flips to PARTIALLY_REFUNDED / REFUNDED accordingly.

  _cloudUpdate(collection, id, patch) {
    const dg = this._getDataGateway();
    if (dg && id && typeof dg.update === 'function') {
      try { Promise.resolve(dg.update(collection, id, patch)).catch(e => console.warn(`[retailSaleModel] Cloud ${collection} update error:`, e.message)); } catch (_) {}
    }
  }

  _genRefundCorrelationId() {
    return 'RCID-R-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  /** Resolve a sale by saleNumber, correlationId or record id. */
  findSale(ref, tenantId = null) {
    const t = this._getTenantId(tenantId);
    if (!ref) return null;
    return this.getSaleByNumber(ref, t)
      || this.getSaleByCorrelation(ref, t)
      || (this.getAllSales(t).find(s => s.id === ref) || null);
  }

  /**
   * Build the concrete lines to refund for a sale, clamped to what has NOT
   * already been refunded. Empty `requested` = refund every remaining unit
   * (full remaining balance); otherwise a per-line partial refund.
   */
  _refundLinesFor(sale, requested) {
    const sold = (sale.lines || []).map(l => ({
      itemCode: l.itemCode, productCode: l.productCode, name: l.name,
      price: parseFloat(l.price) || 0,
      quantity: parseFloat(l.quantity) || 0,
      alreadyRefunded: parseFloat(l.refundedQuantity) || 0
    }));
    const remaining = (l) => Math.round(Math.max(0, l.quantity - l.alreadyRefunded) * 1000) / 1000;
    const mk = (l, qty) => ({ ...l, quantity: qty, lineTotal: Math.round(l.price * qty * 100) / 100 });

    if (!requested || !requested.length) {
      return sold.filter(l => remaining(l) > 0).map(l => mk(l, remaining(l)));
    }
    const out = [];
    for (const r of requested) {
      const code = r.itemCode || r.productCode;
      const want = Math.abs(parseFloat(r.quantity != null ? r.quantity : r.qty) || 0);
      if (!code || !want) continue;
      const line = sold.find(l => l.itemCode === code || l.productCode === code);
      if (!line) continue;
      const qty = Math.min(want, remaining(line));
      if (qty > 0) out.push(mk(line, qty));
    }
    return out;
  }

  /** Compensating SALE_REVERSAL: put refunded units back at LOC-RETAIL. */
  _reverseStock({ lines, tenantId, saleNumber, correlationId, occurredAt, performedBy }) {
    const balances = offlineStore.getCollection('stock_balances') || [];
    for (const line of lines) {
      const idx = balances.findIndex(b =>
        (b.itemCode || b.item_code) === line.itemCode &&
        (b.locationCode || b.location_code) === RETAIL_LOCATION);
      const bal = idx >= 0 ? balances[idx] : null;
      const curQty = bal ? (parseFloat(bal.quantity != null ? bal.quantity : (bal.data && bal.data.quantity)) || 0) : 0;
      const unitCost = bal ? (parseFloat(bal.unitCost || bal.unit_cost || (bal.data && bal.data.unitCost)) || 0) : 0;
      const newQty = Math.round((curQty + line.quantity) * 1000) / 1000;

      const txn = {
        id: `txn-retail-rev-${line.itemCode}-${Math.random().toString(36).substring(2, 8)}`,
        tenantId, tenant_id: tenantId,
        operationId: `rev_retail_${correlationId}_${line.itemCode}`,
        transactionType: 'SALE_REVERSAL', transaction_type: 'SALE_REVERSAL',
        status: 'POSTED',
        referenceType: 'RETAIL_REFUND', reference_type: 'RETAIL_REFUND',
        referenceId: saleNumber, reference_id: saleNumber,
        itemCode: line.itemCode, item_code: line.itemCode, itemName: line.name,
        locationCode: RETAIL_LOCATION, location_code: RETAIL_LOCATION,
        quantity: Math.abs(line.quantity),
        uom: (bal && (bal.uom || bal.base_uom)) || CONSUME_UOM,
        unitCost, totalCost: Math.round(line.quantity * unitCost * 100) / 100,
        performedBy, correlationId, correlation_id: correlationId,
        occurredAt, createdAt: new Date().toISOString()
      };
      offlineStore.appendItem('stock_transactions', txn);
      this._cloudCreate('stock_transactions', txn);

      if (bal) {
        balances[idx] = {
          ...bal, quantity: newQty, currentStock: newQty,
          valuation: Math.round(newQty * unitCost * 100) / 100,
          data: { ...(bal.data || bal), quantity: newQty, valuation: Math.round(newQty * unitCost * 100) / 100 },
          updatedAt: new Date().toISOString()
        };
        offlineStore.setCollection('stock_balances', balances);
        this._persistBalance(bal, line.itemCode, newQty, unitCost, tenantId, 'RETAIL_REFUND_RESTOCK');
      }
    }
  }

  /** Fold refunded quantities onto the sale + flip its status. */
  _applyRefundToSale(sale, refundLines, refundCorr, reason, operatorName, occurredAt) {
    const refundedByItem = new Map();
    refundLines.forEach(l => refundedByItem.set(l.itemCode, (refundedByItem.get(l.itemCode) || 0) + l.quantity));
    const lines = (sale.lines || []).map(l => ({
      ...l, refundedQuantity: Math.round(((parseFloat(l.refundedQuantity) || 0) + (refundedByItem.get(l.itemCode) || 0)) * 1000) / 1000
    }));
    const fullyRefunded = lines.every(l => (parseFloat(l.refundedQuantity) || 0) >= (parseFloat(l.quantity) || 0));
    const refunds = (sale.refunds || []).concat([{
      refundCorrelationId: refundCorr, reason: reason || '', operatorName,
      occurredAt, lines: refundLines.map(l => ({ itemCode: l.itemCode, quantity: l.quantity, lineTotal: l.lineTotal }))
    }]);
    const updated = {
      ...sale, lines, refunds, status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      refundCorrelationId: refundCorr, updatedAt: occurredAt
    };
    const all = offlineStore.getCollection('retail_sales') || [];
    const idx = all.findIndex(s => s.id === sale.id);
    if (idx >= 0) all[idx] = updated; else all.push(updated);
    offlineStore.setCollection('retail_sales', all);
    this._cloudUpdate('retail_sales', sale.id, updated);
    return updated;
  }

  /**
   * Refund a confirmed/partially-refunded retail sale.
   * @param {string} ref saleNumber | correlationId | record id
   * @param {Object} opts { lines?, reason?, restock=true, paymentMethod='CASH', correlationId?, tenantId?, operatorName? }
   * @param {Object} session
   */
  async refund(ref, opts = {}, session = null) {
    const tenantId = this._getTenantId(opts.tenantId || (session && session.tenantId));
    const sale = this.findSale(ref, tenantId);
    if (!sale) { const e = new Error('RETAIL_SALE_NOT_FOUND'); e.code = 'RETAIL_SALE_NOT_FOUND'; throw e; }

    const refundCorr = opts.correlationId || this._genRefundCorrelationId();
    // Idempotency FIRST (mirrors checkout): a REFUND register line already booked
    // under this key -> replay, even though the sale is now REFUNDED/PARTIAL.
    const existing = (offlineStore.getCollection('register_transactions') || [])
      .find(r => this._matchesTenant(r, tenantId) && (r.correlationId || r.correlation_id) === refundCorr &&
        (r.transactionType || r.transaction_type) === 'REFUND');
    if (existing) return { ...sale, refundCorrelationId: refundCorr, idempotentReplay: true };

    if (sale.status === 'REFUNDED') { const e = new Error('RETAIL_SALE_ALREADY_REFUNDED'); e.code = 'RETAIL_SALE_ALREADY_REFUNDED'; throw e; }

    const operatorName = opts.operatorName || (session && (session.employeeName || session.name)) || 'Retail Manager';
    const occurredAt = new Date().toISOString();
    const restock = opts.restock !== false;
    const paymentMethod = (opts.paymentMethod || 'CASH').toUpperCase();
    const reason = opts.reason || '';
    const registerId = sale.registerId || sale.register_id || RETAIL_REGISTER;
    const saleNumber = sale.saleNumber || sale.sale_number;

    const refundLines = this._refundLinesFor(sale, opts.lines);
    if (!refundLines.length) { const e = new Error('RETAIL_NOTHING_TO_REFUND'); e.code = 'RETAIL_NOTHING_TO_REFUND'; throw e; }
    const totals = this._computeTotals(refundLines.map(l => ({ ...l })), 0, tenantId);
    const refundAmount = totals.grandTotal;

    // 1. Stock returns ONLY on restock (unopened bottles).
    if (restock) this._reverseStock({ lines: refundLines, tenantId, saleNumber, correlationId: refundCorr, occurredAt, performedBy: operatorName });

    // 2. Register REFUND on RETAIL-01 (always - refunds must reconcile on the till).
    const regTxn = {
      id: 'rt-' + Math.random().toString(36).substring(2, 9),
      tenantId, tenant_id: tenantId, registerId, register_id: registerId,
      businessUnit: BUSINESS_UNIT, business_unit: BUSINESS_UNIT,
      transactionType: 'REFUND', transaction_type: 'REFUND',
      paymentMethod, payment_method: paymentMethod, amount: refundAmount,
      referenceType: 'RETAIL_REFUND', reference_type: 'RETAIL_REFUND',
      referenceId: saleNumber, reference_id: saleNumber,
      correlationId: refundCorr, correlation_id: refundCorr,
      performedBy: operatorName, performed_by: operatorName,
      occurredAt, occurred_at: occurredAt, createdAt: occurredAt
    };
    offlineStore.appendItem('register_transactions', regTxn);
    this._cloudCreate('register_transactions', regTxn);

    // 3. Refund settlement (shared Payment table, RETAIL, negative = money out).
    const settlementId = this._genSettlementId(tenantId);
    const payRec = {
      id: settlementId, paymentId: settlementId, tenantId, tenant_id: tenantId,
      businessUnit: BUSINESS_UNIT, business_unit: BUSINESS_UNIT,
      source: 'RETAIL_REFUND', retailSaleNumber: saleNumber, saleNumber,
      invoiceNumber: sale.invoiceNumber || sale.invoice_number, invoice_number: sale.invoiceNumber || sale.invoice_number,
      amount: -refundAmount, paymentMethod, payment_method: paymentMethod,
      status: 'REFUNDED', receivedByName: operatorName, reason,
      receivedAt: occurredAt, createdAt: occurredAt, correlationId: refundCorr
    };
    offlineStore.appendItem('payments', payRec);
    this._cloudCreate('payments', payRec);

    // 4. Invoice credit note in the RETAIL series, referencing the original invoice.
    const creditSeq = invoiceModel.generateNextInvoiceSequence('RETAIL', tenantId);
    const creditNote = {
      id: 'inv_' + Math.random().toString(36).substring(2, 9), tenantId, tenant_id: tenantId,
      businessUnit: BUSINESS_UNIT, business_unit: BUSINESS_UNIT,
      documentType: 'CREDIT_NOTE', document_type: 'CREDIT_NOTE',
      financialYear: creditSeq.financialYear, invoiceSeries: creditSeq.invoiceSeries,
      invoiceSequence: creditSeq.invoiceSequence, invoiceNumber: creditSeq.invoiceNumber, invoice_number: creditSeq.invoiceNumber,
      creditAgainst: sale.invoiceNumber || sale.invoice_number, retailSaleNumber: saleNumber, saleNumber,
      grossSales: totals.grossSales, discountsTotal: totals.discountsTotal, taxableAmount: totals.taxableAmount,
      vatAmount: totals.vatAmount, cgstAmount: totals.cgstAmount, sgstAmount: totals.sgstAmount, igstAmount: totals.igstAmount,
      totalTax: totals.totalTax, taxLines: totals.taxLines, items: refundLines,
      grandTotal: -totals.grandTotal, grand_total: -totals.grandTotal,
      cashierName: operatorName, reason, issuedAt: occurredAt, createdAt: occurredAt, status: 'ISSUED', correlationId: refundCorr
    };
    offlineStore.appendItem('invoices', creditNote);
    this._cloudCreate('invoices', creditNote);

    // 5. Fold the refund onto the sale + flip status.
    const updated = this._applyRefundToSale(sale, refundLines, refundCorr, reason, operatorName, occurredAt);

    platformEventBus.publish('retail:sale:refunded', {
      saleNumber, refundCorrelationId: refundCorr, creditNoteNumber: creditSeq.invoiceNumber,
      refundAmount, restock, registerId, operatorName, timestamp: occurredAt
    });

    return {
      ...updated, refundAmount, restock,
      creditNoteNumber: creditSeq.invoiceNumber, settlementId,
      registerTransactionId: regTxn.id, refundCorrelationId: refundCorr, idempotentReplay: false
    };
  }
}

export const retailSaleModel = new RetailSaleModel();
