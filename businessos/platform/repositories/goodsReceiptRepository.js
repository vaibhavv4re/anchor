import { attachStandardMetadata } from '../metadata/entityMetadata.js';

/**
 * GoodsReceiptRepository domain persistence abstraction.
 *
 * Idempotent stock creation engine for Goods Receipts and Opening Stock.
 * Supports constructor dependency injection (DataGateway, OfflineStore, OfflineJournal, AuditLogger, InventoryRepository, PurchaseOrderRepository)
 * while remaining fully backward-compatible with legacy global platform instances.
 */
export class GoodsReceiptRepository {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || null;
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.auditLogger = deps.auditLogger || null;
    this.entityMetadata = deps.entityMetadata || { attachStandardMetadata };
    this.inventoryRepository = deps.inventoryRepository || (typeof inventoryRepository !== 'undefined' ? inventoryRepository : null);
    this.purchaseOrderRepository = deps.purchaseOrderRepository || (typeof purchaseOrderRepository !== 'undefined' ? purchaseOrderRepository : null);
  }

  getAll(tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      return this.dataGateway.getCachedCollection('goods_receipt_notes', tenantId) || [];
    }
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? store.getCollection('goods_receipt_notes', tenantId) || [] : [];
  }

  getByGrnNumber(grnNumber, tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedById === 'function') {
      return this.dataGateway.getCachedById('goods_receipt_notes', grnNumber, tenantId);
    }
    return this.getAll(tenantId).find(g => g.grnNumber === grnNumber || g.id === grnNumber) || null;
  }

  getById(id, tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedById === 'function') {
      return this.dataGateway.getCachedById('goods_receipt_notes', id, tenantId);
    }
    return this.getAll(tenantId).find(g => g.id === id || g.grnNumber === id) || null;
  }

  // 🔒 Idempotent Stock Creation Engine
  postGRN(grnData, session) {
    const tenantId = session ? session.tenantId : (grnData.tenantId || '');
    const postingId = grnData.postingId || ('post-' + Math.random().toString(36).substring(2, 9));
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    const invRepo = this.inventoryRepository || (typeof inventoryRepository !== 'undefined' ? inventoryRepository : null);
    const poRepo = this.purchaseOrderRepository || (typeof purchaseOrderRepository !== 'undefined' ? purchaseOrderRepository : null);

    // 1. Idempotency Check: Verify if postingId or grnNumber already posted
    const existingGrns = this.getAll(tenantId);
    const alreadyPosted = existingGrns.find(g => g.postingId === postingId || (grnData.grnNumber && g.grnNumber === grnData.grnNumber && g.status === 'POSTED'));
    if (alreadyPosted) {
      return { success: true, grn: alreadyPosted, idempotentRetry: true };
    }

    const isOpeningStock = grnData.documentType === 'OPENING_STOCK';
    const count = existingGrns.length + 1;
    const grnNum = grnData.grnNumber || (isOpeningStock ? `GRN-OPEN-2026-${String(count).padStart(4, '0')}` : `GRN-2026-${String(count).padStart(4, '0')}`);

    let grnRecord = {
      id: 'grn-' + Math.random().toString(36).substring(2, 7),
      grnNumber: grnNum,
      tenantId,
      postingId,
      documentType: isOpeningStock ? 'OPENING_STOCK' : 'PURCHASE_RECEIPT',
      poNumber: grnData.poNumber || (isOpeningStock ? 'DIRECT_RECEIPT' : ''),
      supplierCode: isOpeningStock ? null : (grnData.supplierCode || null),
      supplierName: isOpeningStock ? 'System Opening Stock Initialization' : (grnData.supplierName || 'Vendor'),
      receivingLocationCode: grnData.receivingLocationCode || 'LOC-MWH',
      receivedDate: grnData.receivedDate || new Date().toISOString().split('T')[0],
      vendorInvoiceNo: grnData.vendorInvoiceNo || (isOpeningStock ? 'OPENING_STOCK_INITIALIZATION' : ''),
      deliveryChallanNo: grnData.deliveryChallanNo || '',
      notes: grnData.notes || '',
      lines: grnData.lines || [],
      status: 'POSTED',
      postedBy: session ? session.employeeName : 'Inventory Manager',
      postedAt: new Date().toISOString(),
      inspectionStatus: grnData.inspectionStatus || 'PASSED'
    };

    // 2. Process Line Items: Generate Append-Only Stock Ledger Entries & Update Store Balances
    let ledgerList = [];
    let balanceList = [];

    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      ledgerList = this.dataGateway.getCachedCollection('stock_ledger', tenantId) || [];
      balanceList = this.dataGateway.getCachedCollection('stock_balances', tenantId) || [];
    } else if (store) {
      ledgerList = store.getCollection('stock_ledger', tenantId) || [];
      balanceList = store.getCollection('stock_balances', tenantId) || [];
    }

    grnRecord.lines.forEach((line, idx) => {
      const acceptedQty = parseFloat(line.acceptedQty) || 0;
      const factor = parseFloat(line.conversionFactor) || 1;
      const acceptedBaseQty = acceptedQty * factor;
      const unitCost = parseFloat(line.actualPurchaseUnitPrice) || 0;
      const baseUnitCost = factor > 0 ? (unitCost / factor) : unitCost;
      const lineValuation = acceptedBaseQty * baseUnitCost;

      // Append Ledger Entry
      const ledgerEntry = {
        ledgerId: `LEDGER-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).substring(2, 6)}`,
        tenantId,
        transactionType: isOpeningStock ? 'OPENING_STOCK_INBOUND' : 'GOODS_RECEIPT_INBOUND',
        documentNo: grnNum,
        documentType: grnRecord.documentType,
        itemCode: line.itemCode,
        locationCode: grnRecord.receivingLocationCode,
        baseQuantity: acceptedBaseQty,
        baseUom: line.baseUom || 'KG',
        unitCost: baseUnitCost,
        totalValuation: lineValuation,
        batchNumber: line.batchNumber || `BATCH-${grnNum}-${idx + 1}`,
        expiryDate: line.expiryDate || null,
        postedBy: grnRecord.postedBy,
        timestamp: new Date().toISOString()
      };

      if (this.dataGateway && typeof this.dataGateway.create === 'function') {
        this.dataGateway.create('stock_ledger', ledgerEntry, session);
      } else {
        ledgerList.push(ledgerEntry);
      }

      // Update Store Balance (stock_balances)
      let balIdx = balanceList.findIndex(b => b.itemCode === line.itemCode && b.locationCode === grnRecord.receivingLocationCode && (!tenantId || b.tenantId === tenantId));
      if (balIdx !== -1) {
        const updatedBal = {
          ...balanceList[balIdx],
          quantity: (parseFloat(balanceList[balIdx].quantity) || 0) + acceptedBaseQty,
          valuation: (parseFloat(balanceList[balIdx].valuation) || 0) + lineValuation,
          lastUpdatedAt: new Date().toISOString()
        };
        if (this.dataGateway && typeof this.dataGateway.update === 'function') {
          this.dataGateway.update('stock_balances', balanceList[balIdx].id || balanceList[balIdx].itemCode, updatedBal, session);
        } else {
          balanceList[balIdx] = updatedBal;
        }
      } else {
        const newBal = {
          id: 'bal-' + Math.random().toString(36).substring(2, 7),
          tenantId,
          itemCode: line.itemCode,
          locationCode: grnRecord.receivingLocationCode,
          quantity: acceptedBaseQty,
          baseUom: line.baseUom || 'KG',
          valuation: lineValuation,
          lastUpdatedAt: new Date().toISOString()
        };
        if (this.dataGateway && typeof this.dataGateway.create === 'function') {
          this.dataGateway.create('stock_balances', newBal, session);
        } else {
          balanceList.push(newBal);
        }
      }

      // Update lastPurchasePrice on Master Inventory Item (Definition stays clean; currentStock is NOT mutated)
      if (invRepo) {
        const masterItem = invRepo.getByCode(line.itemCode, tenantId);
        if (masterItem && unitCost > 0) {
          invRepo.update(masterItem.id || masterItem.itemCode, {
            lastPurchasePrice: unitCost,
            unitValuation: baseUnitCost
          }, session);
        }
      }
    });

    // Save Collections (if not using DataGateway)
    if (!this.dataGateway && store) {
      store.setCollection('stock_ledger', ledgerList);
      store.setCollection('stock_balances', balanceList);
    }

    if (this.entityMetadata && typeof this.entityMetadata.attachStandardMetadata === 'function') {
      grnRecord = this.entityMetadata.attachStandardMetadata(grnRecord, tenantId, session);
    } else if (typeof attachStandardMetadata === 'function') {
      grnRecord = attachStandardMetadata(grnRecord, tenantId, session);
    }

    if (this.dataGateway && typeof this.dataGateway.create === 'function') {
      this.dataGateway.create('goods_receipt_notes', grnRecord, session);
    } else if (store) {
      store.appendItem('goods_receipt_notes', grnRecord);
    }

    // 3. Update PO Completion Status (if linked to a PO)
    if (poRepo && grnRecord.poNumber && grnRecord.poNumber !== 'DIRECT_RECEIPT') {
      const po = poRepo.getByPoNumber(grnRecord.poNumber, tenantId);
      if (po) {
        const allGrnsForPo = [...existingGrns, grnRecord].filter(g => g.poNumber === po.poNumber && g.status === 'POSTED');
        let totalOrdered = 0;
        let totalReceived = 0;

        po.items.forEach(poItem => {
          totalOrdered += (parseFloat(poItem.orderedQuantity || poItem.orderQty) || 0);
          let itemRec = 0;
          allGrnsForPo.forEach(g => {
            g.lines.filter(l => l.itemCode === poItem.itemCode).forEach(l => {
              itemRec += (parseFloat(l.receivedQty || l.acceptedQty) || 0);
            });
          });
          totalReceived += itemRec;
        });

        const newPoStatus = totalReceived >= totalOrdered ? 'FULLY_RECEIVED' : 'PARTIALLY_RECEIVED';
        poRepo.update(po.id || po.poNumber, { status: newPoStatus }, session);
      }
    }

    if (!this.dataGateway) {
      if (journal && typeof journal.createSyncJob === 'function') {
        journal.createSyncJob('UPLOAD_EVENT', tenantId, 'goods_receipt_notes', { commandType: 'POST_GOODS_RECEIPT', eventType: 'GoodsReceiptPosted', ...grnRecord }, session);
      } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
        offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'goods_receipt_notes', { commandType: 'POST_GOODS_RECEIPT', eventType: 'GoodsReceiptPosted', ...grnRecord }, session);
      }
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Posted GRN "${grnNum}" (${grnRecord.documentType}) at ${grnRecord.receivingLocationCode}`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return { success: true, grn: grnRecord, idempotentRetry: false };
  }
}
