import { attachStandardMetadata } from '../metadata/entityMetadata.js';

/**
 * StockTransferRepository domain persistence abstraction.
 *
 * Atomic & Idempotent Paired Ledger Posting Engine (TRANSFER_OUT & TRANSFER_IN).
 * Supports constructor dependency injection while remaining
 * fully backward-compatible with legacy global platform instances.
 */
export class StockTransferRepository {
  constructor(deps = {}) {
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.auditLogger = deps.auditLogger || null;
    this.entityMetadata = deps.entityMetadata || { attachStandardMetadata };
    this.inventoryRepository = deps.inventoryRepository || (typeof inventoryRepository !== 'undefined' ? inventoryRepository : null);
  }

  getAll(tenantId = null) {
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? store.getCollection('stock_transfers', tenantId) || [] : [];
  }

  getByTransferNo(transferNo, tenantId = null) {
    return this.getAll(tenantId).find(t => t.transferNo === transferNo) || null;
  }

  getById(id, tenantId = null) {
    return this.getAll(tenantId).find(t => t.id === id || t.transferNo === id) || null;
  }

  postTransfer(data, session) {
    const tenantId = session ? session.tenantId : (data.tenantId || '');
    const postingId = data.postingId || ('post-trf-' + Math.random().toString(36).substring(2, 9));
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    const invRepo = this.inventoryRepository || (typeof inventoryRepository !== 'undefined' ? inventoryRepository : null);

    const existing = this.getAll(tenantId);
    const alreadyPosted = existing.find(t => t.postingId === postingId || (data.transferNo && t.transferNo === data.transferNo));
    if (alreadyPosted) return { success: true, transfer: alreadyPosted, idempotentRetry: true };

    const fromLoc = data.fromLocationCode;
    const toLoc = data.toLocationCode;
    if (fromLoc === toLoc) return { success: false, error: 'Source and destination locations cannot be identical.' };

    const balanceList = store ? (store.getCollection('stock_balances', tenantId) || []) : [];
    const ledgerList = store ? (store.getCollection('stock_ledger', tenantId) || []) : [];

    // 1. Negative Stock Enforcement
    for (const line of data.lines) {
      const reqQty = parseFloat(line.quantity) || 0;
      const srcBal = balanceList.find(b => b.itemCode === line.itemCode && b.locationCode === fromLoc && (!tenantId || b.tenantId === tenantId));
      const availQty = srcBal ? (parseFloat(srcBal.quantity) || 0) : 0;
      const masterItem = invRepo ? invRepo.getByCode(line.itemCode, tenantId) : null;
      const allowNeg = masterItem ? !!masterItem.allowNegativeStock : false;

      if (!allowNeg && availQty < reqQty) {
        return { success: false, error: `❌ Insufficient Stock for "${line.itemName || line.itemCode}" at ${fromLoc}. Available: ${availQty.toFixed(2)} ${line.baseUom || 'KG'}, Requested: ${reqQty.toFixed(2)} ${line.baseUom || 'KG'}.` };
      }
    }

    const count = existing.length + 1;
    const trfNo = data.transferNo || `TRF-2026-${String(count).padStart(4, '0')}`;
    const groupId = `GRP-${trfNo}`;

    let trfRecord = {
      id: 'trf-' + Math.random().toString(36).substring(2, 7),
      transferNo: trfNo,
      transactionGroupId: groupId,
      postingId,
      tenantId,
      fromLocationCode: fromLoc,
      toLocationCode: toLoc,
      transferDate: data.transferDate || new Date().toISOString().split('T')[0],
      notes: data.notes || '',
      lines: data.lines || [],
      status: 'COMPLETED',
      postedBy: session ? session.employeeName : 'Inventory Manager',
      postedAt: new Date().toISOString()
    };

    // 2. Atomic Paired Ledger Posting: TRANSFER_OUT (-Qty) & TRANSFER_IN (+Qty)
    trfRecord.lines.forEach((line, idx) => {
      const qty = parseFloat(line.quantity) || 0;
      const uom = line.baseUom || 'KG';
      const masterItem = (invRepo ? invRepo.getByCode(line.itemCode, tenantId) : null) || {};
      const unitCost = parseFloat(masterItem.unitValuation) || parseFloat(masterItem.lastPurchasePrice) || 0;
      const val = qty * unitCost;

      // OUT Entry
      ledgerList.push({
        ledgerId: `LEDGER-${new Date().toISOString().slice(0, 10)}-TRFOUT-${idx + 1}`,
        tenantId,
        transactionType: 'TRANSFER_OUT',
        transactionGroupId: groupId,
        postingId: `${postingId}-out-${idx}`,
        documentNo: trfNo,
        itemCode: line.itemCode,
        locationCode: fromLoc,
        baseQuantity: -qty,
        baseUom: uom,
        unitCost,
        totalValuation: -val,
        postedBy: trfRecord.postedBy,
        timestamp: new Date().toISOString()
      });

      // IN Entry
      ledgerList.push({
        ledgerId: `LEDGER-${new Date().toISOString().slice(0, 10)}-TRFIN-${idx + 1}`,
        tenantId,
        transactionType: 'TRANSFER_IN',
        transactionGroupId: groupId,
        postingId: `${postingId}-in-${idx}`,
        documentNo: trfNo,
        itemCode: line.itemCode,
        locationCode: toLoc,
        baseQuantity: qty,
        baseUom: uom,
        unitCost,
        totalValuation: val,
        postedBy: trfRecord.postedBy,
        timestamp: new Date().toISOString()
      });

      // Update Source Balance
      let srcIdx = balanceList.findIndex(b => b.itemCode === line.itemCode && b.locationCode === fromLoc && (!tenantId || b.tenantId === tenantId));
      if (srcIdx !== -1) {
        balanceList[srcIdx].quantity = (parseFloat(balanceList[srcIdx].quantity) || 0) - qty;
        balanceList[srcIdx].valuation = Math.max(0, (parseFloat(balanceList[srcIdx].valuation) || 0) - val);
        balanceList[srcIdx].lastUpdatedAt = new Date().toISOString();
      }

      // Update Destination Balance
      let dstIdx = balanceList.findIndex(b => b.itemCode === line.itemCode && b.locationCode === toLoc && (!tenantId || b.tenantId === tenantId));
      if (dstIdx !== -1) {
        balanceList[dstIdx].quantity = (parseFloat(balanceList[dstIdx].quantity) || 0) + qty;
        balanceList[dstIdx].valuation = (parseFloat(balanceList[dstIdx].valuation) || 0) + val;
        balanceList[dstIdx].lastUpdatedAt = new Date().toISOString();
      } else {
        balanceList.push({
          id: 'bal-' + Math.random().toString(36).substring(2, 7),
          tenantId,
          itemCode: line.itemCode,
          locationCode: toLoc,
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
      trfRecord = this.entityMetadata.attachStandardMetadata(trfRecord, tenantId, session);
    } else if (typeof attachStandardMetadata === 'function') {
      trfRecord = attachStandardMetadata(trfRecord, tenantId, session);
    }

    if (store) {
      store.appendItem('stock_transfers', trfRecord);
    }

    if (journal && typeof journal.createSyncJob === 'function') {
      journal.createSyncJob('UPLOAD_EVENT', tenantId, 'stock_transfers', { commandType: 'POST_STOCK_TRANSFER', eventType: 'StockTransferPosted', ...trfRecord }, session);
    } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
      offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'stock_transfers', { commandType: 'POST_STOCK_TRANSFER', eventType: 'StockTransferPosted', ...trfRecord }, session);
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Posted Stock Transfer "${trfNo}" from ${fromLoc} to ${toLoc}`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return { success: true, transfer: trfRecord, idempotentRetry: false };
  }
}
