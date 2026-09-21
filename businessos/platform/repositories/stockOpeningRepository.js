import { attachStandardMetadata } from '../metadata/entityMetadata.js';
import { platformEventBus } from '../events/platformEvents.js';

/**
 * StockOpeningRepository domain persistence abstraction.
 *
 * Dedicated Controlled Opening Stock Posting Engine (OPENING_STOCK).
 * Responsible for physical opening count establishment at Bar Store (LOC-314).
 * Enforces immutable stock_transactions movement line, stock_balances projection,
 * idempotency, Gate 0 existing-balance safety, and zero writes to legacy inventory.opening_stock.
 */
export class StockOpeningRepository {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || null;
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.offlineJournal = deps.offlineJournal || (typeof offlineJournal !== 'undefined' ? offlineJournal : null);
    this.auditLogger = deps.auditLogger || null;
    this.entityMetadata = deps.entityMetadata || { attachStandardMetadata };
    this.inventoryRepository = deps.inventoryRepository || (typeof inventoryRepository !== 'undefined' ? inventoryRepository : null);
    this.eventBus = deps.eventBus || deps.platformEventBus || null;
  }

  getAll(tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      const txns = this.dataGateway.getCachedCollection('stock_transactions', tenantId) || [];
      return txns.filter(t => (t.transactionType === 'OPENING_STOCK' || t.transaction_type === 'OPENING_STOCK'));
    }
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const txns = store ? store.getCollection('stock_transactions', tenantId) || [] : [];
    return txns.filter(t => (t.transactionType === 'OPENING_STOCK' || t.transaction_type === 'OPENING_STOCK'));
  }

  getById(id, tenantId = null) {
    return this.getAll(tenantId).find(t => t.id === id || t.referenceId === id || t.reference_id === id) || null;
  }

  postOpeningStock(data, session) {
    const tenantId = session ? session.tenantId : (data.tenantId || 'tenant_h0qc7wf');
    const postingId = data.postingId || ('post-open-' + Math.random().toString(36).substring(2, 9));
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const invRepo = this.inventoryRepository || (typeof inventoryRepository !== 'undefined' ? inventoryRepository : null);

    // 1. Validation: Tenant
    if (!tenantId) {
      return { success: false, error: '❌ Missing required tenantId.' };
    }

    // 2. Validation: Location Code (Locked to LOC-314 for Bar Store)
    const locCode = (data.locationCode || 'LOC-314').toUpperCase();
    if (locCode !== 'LOC-314') {
      return { success: false, error: `❌ Opening stock in this workspace is restricted to Bar Store (LOC-314). Provided: "${locCode}".` };
    }

    // 3. Validation: SKU Catalog
    const itemCode = String(data.itemCode || '').toUpperCase().trim();
    if (!itemCode) {
      return { success: false, error: '❌ Item code is required.' };
    }

    // Fetch master item
    let masterItem = null;
    if (invRepo && typeof invRepo.getByCode === 'function') {
      masterItem = invRepo.getByCode(itemCode, tenantId);
    }
    if (!masterItem && this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      const allInv = this.dataGateway.getCachedCollection('inventory', tenantId) || [];
      masterItem = allInv.find(i => (i.itemCode || i.item_code || i.id || '').toUpperCase() === itemCode);
    }
    if (!masterItem && store) {
      const allInv = store.getCollection('inventory', tenantId) || [];
      masterItem = allInv.find(i => (i.itemCode || i.item_code || i.id || '').toUpperCase() === itemCode);
    }

    // Verify it is a certified Bar SKU (CAT-BEV-ALC, CAT-BEV-SOFT, or BAR code)
    const cat = String(masterItem?.categoryCode || masterItem?.category || '').toUpperCase();
    const isBarSku = itemCode.startsWith('BAR') || cat.includes('BEV') || cat.includes('BAR');
    if (!isBarSku) {
      return { success: false, error: `❌ "${itemCode}" is not a recognized Bar SKU in the catalog.` };
    }

    // 4. Validation: Quantity > 0
    const qty = parseFloat(data.quantity);
    if (isNaN(qty) || qty <= 0) {
      return { success: false, error: `❌ Quantity must be a positive number greater than 0. Received: ${data.quantity}.` };
    }

    const baseUom = (data.baseUom || masterItem?.baseUom || masterItem?.base_uom || 'LTR').toUpperCase();

    // 5. Resolve Authoritative Master Cost
    const unitCost = parseFloat(masterItem?.unitValuation) || 
                     parseFloat(masterItem?.costPrice) || 
                     parseFloat(masterItem?.lastPurchasePrice) || 
                     parseFloat(data.unitCost) || 
                     0;
    const totalCost = Math.round(qty * unitCost * 100) / 100;

    // 6. Check Idempotency Before Mutation
    let txns = [];
    let balanceList = [];
    let ledgerList = [];

    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      txns = this.dataGateway.getCachedCollection('stock_transactions', tenantId) || [];
      balanceList = this.dataGateway.getCachedCollection('stock_balances', tenantId) || [];
      ledgerList = this.dataGateway.getCachedCollection('stock_ledger', tenantId) || [];
    } else if (store) {
      txns = store.getCollection('stock_transactions', tenantId) || [];
      balanceList = store.getCollection('stock_balances', tenantId) || [];
      ledgerList = store.getCollection('stock_ledger', tenantId) || [];
    }

    const alreadyPosted = txns.find(t => 
      t.postingId === postingId || 
      t.id === `txn-${postingId}` ||
      (data.documentNo && (t.referenceId === data.documentNo || t.reference_id === data.documentNo))
    );
    if (alreadyPosted) {
      const existingBal = balanceList.find(b => 
        (b.itemCode === itemCode || b.item_code === itemCode) && 
        (b.locationCode === locCode || b.location_code === locCode) &&
        (!tenantId || b.tenantId === tenantId || b.tenant_id === tenantId)
      );
      return { 
        success: true, 
        transaction: alreadyPosted, 
        balance: existingBal, 
        idempotentRetry: true 
      };
    }

    // 7. Gate 0: Existing Balance Safety
    const balIdx = balanceList.findIndex(b => 
      (b.itemCode === itemCode || b.item_code === itemCode) && 
      (b.locationCode === locCode || b.location_code === locCode) &&
      (!tenantId || b.tenantId === tenantId || b.tenant_id === tenantId)
    );

    const docNo = data.documentNo || `OP-BAR-${new Date().getFullYear()}-${String(txns.filter(t => (t.transactionType === 'OPENING_STOCK' || t.transaction_type === 'OPENING_STOCK')).length + 1).padStart(4, '0')}`;
    const opId = `OP-${docNo}`;
    const txnId = `txn-${postingId}`;
    const performer = session ? (session.employeeName || session.userName) : (data.performedBy || 'Bar Manager');
    const occurredAt = data.occurredAt || new Date().toISOString();

    // 8. Create Exactly One OPENING_STOCK Transaction Line
    const openTxn = {
      id: txnId,
      tenantId,
      operationId: opId,
      transactionType: 'OPENING_STOCK',
      status: 'POSTED',
      referenceType: 'OPENING_STOCK',
      referenceId: docNo,
      referenceLineId: 'line-1',
      itemCode,
      itemName: masterItem?.itemName || masterItem?.item_name || data.itemName || itemCode,
      locationCode: locCode,
      quantity: qty,
      uom: baseUom,
      unitCost,
      totalCost,
      performedBy: performer,
      notes: data.notes || `Controlled Opening Stock Count for Bar Store (${locCode})`,
      occurredAt
    };

    // 9. Backward-compatible Local Ledger
    const openLedger = {
      ledgerId: `LEDGER-${new Date().toISOString().slice(0, 10)}-OPEN-${Math.random().toString(36).substring(2, 6)}`,
      tenantId,
      transactionType: 'OPENING_STOCK',
      postingId,
      documentNo: docNo,
      itemCode,
      locationCode: locCode,
      baseQuantity: qty,
      baseUom,
      unitCost,
      totalValuation: totalCost,
      postedBy: performer,
      timestamp: occurredAt
    };

    const syncPromises = [];

    // Project stock_balances at LOC-314
    let finalBal = null;
    if (balIdx !== -1) {
      // Existing balance: Safe increment preserving existing stock (Gate 0)
      const currentQty = parseFloat(balanceList[balIdx].quantity) || 0;
      const currentVal = parseFloat(balanceList[balIdx].valuation) || 0;
      const newQty = currentQty + qty;
      const newVal = Math.round((currentVal + totalCost) * 100) / 100;

      finalBal = {
        ...balanceList[balIdx],
        quantity: newQty,
        valuation: newVal,
        lastUpdatedAt: occurredAt,
        data: {
          ...(balanceList[balIdx].data || balanceList[balIdx]),
          quantity: newQty,
          valuation: newVal,
          lastUpdatedAt: occurredAt
        }
      };

      if (this.dataGateway && typeof this.dataGateway.update === 'function') {
        syncPromises.push(this.dataGateway.update('stock_balances', balanceList[balIdx].id || balanceList[balIdx].itemCode, finalBal, session));
      } else {
        balanceList[balIdx] = finalBal;
      }
    } else {
      // No existing balance: Create initial balance projection
      const balId = `sb-314-${itemCode.toLowerCase()}`;
      finalBal = {
        id: balId,
        tenantId,
        itemCode,
        locationCode: locCode,
        quantity: qty,
        unitCost,
        valuation: totalCost,
        lastUpdatedAt: occurredAt,
        data: {
          id: balId,
          tenantId,
          itemCode,
          locationCode: locCode,
          quantity: qty,
          unitCost,
          valuation: totalCost,
          lastUpdatedAt: occurredAt
        }
      };

      if (this.dataGateway && typeof this.dataGateway.create === 'function') {
        syncPromises.push(this.dataGateway.create('stock_balances', finalBal, session));
      } else {
        balanceList.push(finalBal);
      }
    }

    // Persist immutable transaction
    if (this.dataGateway && typeof this.dataGateway.create === 'function') {
      syncPromises.push(this.dataGateway.create('stock_transactions', openTxn, session));
      this.dataGateway.create('stock_ledger', openLedger, session);
    } else {
      ledgerList.push(openLedger);
    }

    if (store) {
      store.appendItem('stock_transactions', openTxn);
      if (balIdx !== -1) {
        store.setCollection('stock_balances', balanceList);
      } else {
        store.appendItem('stock_balances', finalBal);
      }
    }

    // 10. Real-time Events
    const bus = this.eventBus || (typeof window !== 'undefined' && window.__APP__?.platform?.eventBus) || platformEventBus;
    if (bus && typeof bus.publish === 'function') {
      bus.publish('stock:balance:updated', { tenantId, locationCode: locCode, itemCode, quantity: qty, documentNo: docNo });
      bus.publish('inventory:updated', { tenantId, itemCode });
    }

    // 11. Audit Logging
    const actionMsg = `Recorded Bar Opening Stock "${docNo}" for ${itemCode} (${qty} ${baseUom} @ ₹${unitCost}) at ${locCode}`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(performer, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(performer, actionMsg, tenantId);
    }

    const syncPromise = Promise.all(syncPromises);

    return {
      success: true,
      transaction: openTxn,
      balance: finalBal,
      idempotentRetry: false,
      syncPromise
    };
  }
}
