import { attachStandardMetadata } from '../metadata/entityMetadata.js';

/**
 * StockIssueRepository domain persistence abstraction.
 *
 * Operational consumption stock issue engine (ISSUE_OUT).
 * Supports constructor dependency injection (DataGateway, OfflineStore, OfflineJournal, AuditLogger, InventoryRepository)
 * while remaining fully backward-compatible with legacy global platform instances.
 */
export class StockIssueRepository {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || null;
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.auditLogger = deps.auditLogger || null;
    this.entityMetadata = deps.entityMetadata || { attachStandardMetadata };
    this.inventoryRepository = deps.inventoryRepository || (typeof inventoryRepository !== 'undefined' ? inventoryRepository : null);
  }

  getAll(tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      return this.dataGateway.getCachedCollection('stock_issues', tenantId) || [];
    }
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? store.getCollection('stock_issues', tenantId) || [] : [];
  }

  getByIssueNo(issueNo, tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedById === 'function') {
      return this.dataGateway.getCachedById('stock_issues', issueNo, tenantId);
    }
    return this.getAll(tenantId).find(i => i.issueNo === issueNo || i.id === issueNo) || null;
  }

  getById(id, tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedById === 'function') {
      return this.dataGateway.getCachedById('stock_issues', id, tenantId);
    }
    return this.getAll(tenantId).find(i => i.id === id || i.issueNo === id) || null;
  }

  postIssue(data, session) {
    const tenantId = session ? session.tenantId : (data.tenantId || '');
    const postingId = data.postingId || ('post-iss-' + Math.random().toString(36).substring(2, 9));
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const journal = this.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    const invRepo = this.inventoryRepository || (typeof inventoryRepository !== 'undefined' ? inventoryRepository : null);

    const existing = this.getAll(tenantId);
    const alreadyPosted = existing.find(i => i.postingId === postingId || (data.issueNo && i.issueNo === data.issueNo));
    if (alreadyPosted) return { success: true, issue: alreadyPosted, idempotentRetry: true };

    const fromLoc = data.fromLocationCode;
    let balanceList = [];
    let ledgerList = [];

    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      balanceList = this.dataGateway.getCachedCollection('stock_balances', tenantId) || [];
      ledgerList = this.dataGateway.getCachedCollection('stock_ledger', tenantId) || [];
    } else if (store) {
      balanceList = store.getCollection('stock_balances', tenantId) || [];
      ledgerList = store.getCollection('stock_ledger', tenantId) || [];
    }

    // Negative Stock Enforcement
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
    const issNo = data.issueNo || `ISS-2026-${String(count).padStart(4, '0')}`;

    let issRecord = {
      id: 'iss-' + Math.random().toString(36).substring(2, 7),
      issueNo: issNo,
      postingId,
      tenantId,
      fromLocationCode: fromLoc,
      issuedToDepartment: data.issuedToDepartment || 'Kitchen',
      issuedToPerson: data.issuedToPerson || '',
      issueDate: data.issueDate || new Date().toISOString().split('T')[0],
      notes: data.notes || '',
      lines: data.lines || [],
      status: 'COMPLETED',
      postedBy: session ? session.employeeName : 'Inventory Manager',
      postedAt: new Date().toISOString()
    };

    issRecord.lines.forEach((line, idx) => {
      const qty = parseFloat(line.quantity) || 0;
      const uom = line.baseUom || 'KG';
      const masterItem = (invRepo ? invRepo.getByCode(line.itemCode, tenantId) : null) || {};
      const unitCost = parseFloat(masterItem.unitValuation) || parseFloat(masterItem.lastPurchasePrice) || 0;
      const val = qty * unitCost;

      const ledgerEntry = {
        ledgerId: `LEDGER-${new Date().toISOString().slice(0, 10)}-ISSOUT-${idx + 1}`,
        tenantId,
        transactionType: 'ISSUE_OUT',
        postingId: `${postingId}-${idx}`,
        documentNo: issNo,
        itemCode: line.itemCode,
        locationCode: fromLoc,
        baseQuantity: -qty,
        baseUom: uom,
        unitCost,
        totalValuation: -val,
        postedBy: issRecord.postedBy,
        timestamp: new Date().toISOString()
      };

      if (this.dataGateway && typeof this.dataGateway.create === 'function') {
        this.dataGateway.create('stock_ledger', ledgerEntry, session);
      } else {
        ledgerList.push(ledgerEntry);
      }

      let srcIdx = balanceList.findIndex(b => b.itemCode === line.itemCode && b.locationCode === fromLoc && (!tenantId || b.tenantId === tenantId));
      if (srcIdx !== -1) {
        const updatedBal = {
          ...balanceList[srcIdx],
          quantity: (parseFloat(balanceList[srcIdx].quantity) || 0) - qty,
          valuation: Math.max(0, (parseFloat(balanceList[srcIdx].valuation) || 0) - val),
          lastUpdatedAt: new Date().toISOString()
        };
        if (this.dataGateway && typeof this.dataGateway.update === 'function') {
          this.dataGateway.update('stock_balances', balanceList[srcIdx].id || balanceList[srcIdx].itemCode, updatedBal, session);
        } else {
          balanceList[srcIdx] = updatedBal;
        }
      }
    });

    if (!this.dataGateway && store) {
      store.setCollection('stock_ledger', ledgerList);
      store.setCollection('stock_balances', balanceList);
    }

    if (this.entityMetadata && typeof this.entityMetadata.attachStandardMetadata === 'function') {
      issRecord = this.entityMetadata.attachStandardMetadata(issRecord, tenantId, session);
    } else if (typeof attachStandardMetadata === 'function') {
      issRecord = attachStandardMetadata(issRecord, tenantId, session);
    }

    if (this.dataGateway && typeof this.dataGateway.create === 'function') {
      this.dataGateway.create('stock_issues', issRecord, session);
    } else if (store) {
      store.appendItem('stock_issues', issRecord);
    }

    if (!this.dataGateway) {
      if (journal && typeof journal.createSyncJob === 'function') {
        journal.createSyncJob('UPLOAD_EVENT', tenantId, 'stock_issues', { commandType: 'POST_STOCK_ISSUE', eventType: 'StockIssuePosted', ...issRecord }, session);
      } else if (typeof offlineJournal !== 'undefined' && offlineJournal.createSyncJob) {
        offlineJournal.createSyncJob('UPLOAD_EVENT', tenantId, 'stock_issues', { commandType: 'POST_STOCK_ISSUE', eventType: 'StockIssuePosted', ...issRecord }, session);
      }
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Posted Stock Issue "${issNo}" to ${issRecord.issuedToDepartment} at ${fromLoc}`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return { success: true, issue: issRecord, idempotentRetry: false };
  }
}
