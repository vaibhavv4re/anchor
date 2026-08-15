import { attachStandardMetadata } from '../metadata/entityMetadata.js';

/**
 * StockCountRepository domain persistence abstraction.
 *
 * Physical Stock Count & Reconciliation Engine (System vs Physical Variance Calculation).
 * Supports constructor dependency injection (DataGateway, OfflineStore, AuditLogger, StockAdjustmentRepository)
 * while remaining fully backward-compatible with legacy global platform instances.
 */
export class StockCountRepository {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || null;
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    this.auditLogger = deps.auditLogger || null;
    this.entityMetadata = deps.entityMetadata || { attachStandardMetadata };
    this.stockAdjustmentRepository = deps.stockAdjustmentRepository || (typeof stockAdjustmentRepository !== 'undefined' ? stockAdjustmentRepository : null);
  }

  getAll(tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      return this.dataGateway.getCachedCollection('stock_counts', tenantId) || [];
    }
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    return store ? store.getCollection('stock_counts', tenantId) || [] : [];
  }

  getByCountNo(countNo, tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedById === 'function') {
      return this.dataGateway.getCachedById('stock_counts', countNo, tenantId);
    }
    return this.getAll(tenantId).find(c => c.countNo === countNo || c.id === countNo) || null;
  }

  getById(id, tenantId = null) {
    if (this.dataGateway && typeof this.dataGateway.getCachedById === 'function') {
      return this.dataGateway.getCachedById('stock_counts', id, tenantId);
    }
    return this.getAll(tenantId).find(c => c.id === id || c.countNo === id) || null;
  }

  reconcileCount(data, session) {
    const tenantId = session ? session.tenantId : (data.tenantId || '');
    const postingId = data.postingId || ('post-cnt-' + Math.random().toString(36).substring(2, 9));
    const store = this.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : null);
    const adjRepo = this.stockAdjustmentRepository || (typeof stockAdjustmentRepository !== 'undefined' ? stockAdjustmentRepository : null);

    const existing = this.getAll(tenantId);
    const alreadyPosted = existing.find(c => c.postingId === postingId || (data.countNo && c.countNo === data.countNo && c.status === 'RECONCILED'));
    if (alreadyPosted) return { success: true, countRecord: alreadyPosted, idempotentRetry: true };

    const locCode = data.locationCode;
    const count = existing.length + 1;
    const cntNo = data.countNo || `CNT-2026-${String(count).padStart(4, '0')}`;

    const adjLines = [];
    data.lines.forEach(l => {
      const sysQty = parseFloat(l.systemQuantity) || 0;
      const physQty = parseFloat(l.physicalQuantity) || 0;
      const variance = physQty - sysQty;
      if (Math.abs(variance) > 0.001) {
        adjLines.push({
          itemCode: l.itemCode,
          itemName: l.itemName,
          adjustmentType: variance < 0 ? 'DECREASE' : 'INCREASE',
          quantity: Math.abs(variance),
          baseUom: l.baseUom || 'KG'
        });
      }
    });

    // Post Audit Adjustment for Non-Zero Variances
    let adjResult = null;
    if (adjLines.length > 0 && adjRepo) {
      adjResult = adjRepo.postAdjustment({
        adjustmentNo: `ADJ-CNT-${cntNo}`,
        postingId: `post-adj-${postingId}`,
        locationCode: locCode,
        reasonCode: 'STOCK_AUDIT_CORRECTION',
        notes: `Stock count reconciliation variance for audit session ${cntNo}`,
        lines: adjLines
      }, session);
    }

    let countRecord = {
      id: 'cnt-' + Math.random().toString(36).substring(2, 7),
      countNo: cntNo,
      postingId,
      tenantId,
      locationCode: locCode,
      countDate: data.countDate || new Date().toISOString().split('T')[0],
      notes: data.notes || '',
      lines: data.lines || [],
      status: 'RECONCILED',
      reconciledBy: session ? session.employeeName : 'Inventory Manager',
      reconciledAt: new Date().toISOString()
    };

    if (this.entityMetadata && typeof this.entityMetadata.attachStandardMetadata === 'function') {
      countRecord = this.entityMetadata.attachStandardMetadata(countRecord, tenantId, session);
    } else if (typeof attachStandardMetadata === 'function') {
      countRecord = attachStandardMetadata(countRecord, tenantId, session);
    }

    if (this.dataGateway && typeof this.dataGateway.create === 'function') {
      this.dataGateway.create('stock_counts', countRecord, session);
    } else if (store) {
      store.appendItem('stock_counts', countRecord);
    }

    const actor = session ? session.employeeName : 'Admin';
    const actionMsg = `Reconciled Physical Stock Count "${cntNo}" at ${locCode}`;
    if (this.auditLogger && typeof this.auditLogger.log === 'function') {
      this.auditLogger.log(actor, actionMsg, tenantId);
    } else if (typeof logAudit === 'function') {
      logAudit(actor, actionMsg, tenantId);
    }

    return { success: true, countRecord, adjResult, idempotentRetry: false };
  }
}
