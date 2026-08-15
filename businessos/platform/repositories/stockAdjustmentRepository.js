import { attachStandardMetadata } from '../metadata/entityMetadata.js';

/**
 * StockAdjustmentRepository domain persistence abstraction.
 *
 * Controlled Wastage, Spoilage & Reconciliation Adjustment Engine (ADJUSTMENT_IN & ADJUSTMENT_OUT).
 * Supports constructor dependency injection while remaining
 * fully backward-compatible with legacy global platform instances.
 */
export class StockAdjustmentRepository {
  constructor(deps = {}) {
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.auditLogger = deps.auditLogger || null;
    this.entityMetadata = deps.entityMetadata || { attachStandardMetadata };
    this.inventoryRepository = deps.inventoryRepository || (typeof inventoryRepository !== 'undefined' ? inventoryRepository : null);
  }

  getAll(tenantId = null) {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? store.getCollection('stock_adjustments', tenantId) || [] : [];
  }

  getByAdjustmentNo(adjustmentNo, tenantId = null) {
    return this.getAll(tenantId).find(a => a.adjustmentNo === adjustmentNo) || null;
  }

  getById(id, tenantId = null) {
    return this.getAll(tenantId).find(a => a.id === id || a.adjustmentNo === id) || null;
  }

  postAdjustment(data, session) {
    const tenantId = session ? session.tenantId : (data.tenantId || '');
    const postingId = data.postingId || ('post-adj-' + Math.random().toString(36).substring(2, 9));
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    const invRepo = this.inventoryRepository || (typeof inventoryRepository !== 'undefined' ? inventoryRepository : null);

    const existing = this.getAll(tenantId);
    const alreadyPosted = existing.find(a => a.postingId === postingId || (data.adjustmentNo && a.adjustmentNo === data.adjustmentNo));
    if (alreadyPosted) return { success: true, adjustment: alreadyPosted, idempotentRetry: true };

    const locCode = data.locationCode;
    const reason = data.reasonCode || 'SPOILAGE';
    const balanceList = store ? (store.getCollection('stock_balances', tenantId) || []) : [];
    const ledgerList = store ? (store.getCollection('stock_ledger', tenantId) || []) : [];

    const count = existing.length + 1;
    const adjNo = data.adjustmentNo || `ADJ-2026-${String(count).padStart(4, '0')}`;

    let adjRecord = {
      id: 'adj-' + Math.random().toString(36).substring(2, 7),
      adjustmentNo: adjNo,
      postingId,
      tenantId,
      locationCode: locCode,
      reasonCode: reason,
      adjustmentDate: data.adjustmentDate || new Date().toISOString().split('T')[0],
      notes: data.notes || '',
      lines: data.lines || [],
      status: 'COMPLETED',
      postedBy: session ? session.employeeName : 'Inventory Manager',
      postedAt: new Date().toISOString()
    };

    adjRecord.lines.forEach((line, idx) => {
      const qty = parseFloat(line.quantity) || 0;
      const isDecrease = line.adjustmentType === 'DECREASE';
      const netQty = isDecrease ? -qty : qty;
      const uom = line.baseUom || 'KG';
      const masterItem = (invRepo ? invRepo.getByCode(line.itemCode, tenantId) : null) || {};
      const unitCost = parseFloat(masterItem.unitValuation) || parseFloat(masterItem.lastPurchasePrice) || 0;
      const val = netQty * unitCost;

      ledgerList.push({
        ledgerId: `LEDGER-${new Date().toISOString().slice(0, 10)}-ADJ-${idx + 1}`,
        tenantId,
        transactionType: isDecrease ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN',
        postingId: `${postingId}-${idx}`,
        documentNo: adjNo,
        itemCode: line.itemCode,
        locationCode: locCode,
        baseQuantity: netQty,
        baseUom: uom,
        unitCost,
        totalValuation: val,
        reasonCode: reason,
        postedBy: adjRecord.postedBy,
        timestamp: new Date().toISOString()
      });

      let balIdx = balanceList.findIndex(b => b.itemCode === line.itemCode && b.locationCode === locCode && (!tenantId || b.tenantId === tenantId));
      if (balIdx !== -1) {
        balanceList[balIdx].quantity = (parseFloat(balanceList[balIdx].quantity) || 0) + netQty;
        balanceList[balIdx].valuation = Math.max(0, (parseFloat(balanceList[balIdx].valuation) || 0) + val);
        balanceList[balIdx].lastUpdatedAt = new Date().toISOString();
      } else if (!isDecrease) {
        balanceList.push({
          id: 'bal-' + Math.random().toString(36).substring(2, 7),
          tenantId,
          itemCode: line.itemCode,
          locationCode: locCode,
          quantity: qty,
          baseUom: uom,
          valuation: val,
          lastUpdatedAt: new Date().toISOString()
        });
      }
    });

    if (store) {
      store.setCollection('stock_ledger', ledgerList);
      store.setCollection('stock_balances', balanceList);
    }

    if (this.entityMetadata && typeof this.entityMetadata.attachStandardMetadata === 'function') {
      adjRecord = this.entityMetadata.attachStandardMetadata(adjRecord, tenantId, session);
    } else if (typeof attachStandardMetadata === 'function') {
      adjRecord = attachStandardMetadata(adjRecord, tenantId, session);
    }

    if (store) {
      store.appendItem('stock_adjustments', adjRecord);
    }

    if (journal && typeof journal.createSyncJob === 'function') {
      journal.createSyncJob('UPLOAD_EVENT', tenantId, 'stock_adjustments', { commandType: 'POST_STOCK_ADJUSTMENT', eventType: 'StockAdjustmentPosted', ...adjRecord }, session);
    } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
      offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'stock_adjustments', { commandType: 'POST_STOCK_ADJUSTMENT', eventType: 'StockAdjustmentPosted', ...adjRecord }, session);
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Posted Stock Adjustment "${adjNo}" (${reason}) at ${locCode}`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return { success: true, adjustment: adjRecord, idempotentRetry: false };
  }
}
