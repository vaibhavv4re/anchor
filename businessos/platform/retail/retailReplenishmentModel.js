/**
 * BusinessOS Platform - Retail (Wine Store) Replenishment Domain Model
 *
 * MIRRORS THE CANONICAL CONSUMER-REPLENISHMENT CONTRACT established by
 * barReplenishmentModel (Bar LOC-314) and the kitchen requisition flow:
 *   1. Retail is a PURE CONSUMER of the shared Inventory Core. It owns NO
 *      stock-transfer, adjustment, or count authority. Physical retail stock is
 *      the same stock_balances row keyed by (itemCode, LOC-RETAIL) the main
 *      inventory model already manages. Retail SKUs reference real `inventory`
 *      master itemCodes - there is no second inventory master.
 *   2. Two-Step Replenishment Pipeline:
 *        - Requisition: retail staff raise a request -> saved in inventory_requests
 *          (PENDING_FULFILLMENT) with immutable-at-creation snapshots
 *          (on_hand_at_request, reorder_level_at_request).
 *          Strictly ZERO stock movement occurs on request creation.
 *        - Fulfillment: the inventory/warehouse manager fulfills the request via
 *          the certified StockTransferRepository (LOC-805 -> LOC-RETAIL),
 *          executing paired TRANSFER_OUT + TRANSFER_IN and updating the request
 *          to COMPLETED. (Same manager-side action that serves Bar/Kitchen.)
 *   3. Request-Level Idempotency: fulfilling an already-COMPLETED request
 *      returns the cached result without duplicate transfers or stock mutations.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { StockTransferRepository } from '../repositories/stockTransferRepository.js';

export const RETAIL_STORE_LOCATION = 'LOC-RETAIL';
export const MAIN_WAREHOUSE_LOCATION = 'LOC-805';
export const RETAIL_DEPARTMENT = 'Retail';

export const RetailReplenishmentStatus = Object.freeze({
  PENDING_FULFILLMENT: 'PENDING_FULFILLMENT',
  APPROVED: 'APPROVED',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED'
});

export class RetailReplenishmentModel {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || null;
    this.offlineStore = deps.offlineStore || offlineStore;
    this.eventBus = deps.eventBus || platformEventBus;
    this.stockTransferRepository = deps.stockTransferRepository || new StockTransferRepository({
      dataGateway: this.dataGateway,
      offlineStore: this.offlineStore,
      eventBus: this.eventBus
    });
  }

  _getDataGateway() {
    if (this.dataGateway) return this.dataGateway;
    if (typeof window !== 'undefined' && window.__APP__?.platform?.dataGateway) {
      return window.__APP__.platform.dataGateway;
    }
    return null;
  }

  _getCollection(collectionName, tenantId) {
    const dg = this._getDataGateway();
    if (dg && typeof dg.getCachedCollection === 'function') {
      const cached = dg.getCachedCollection(collectionName, tenantId);
      if (cached && cached.length) return cached;
    }
    return this.offlineStore.getCollection(collectionName, tenantId) || [];
  }

  /**
   * Requisition Step: Retail staff raise a replenishment request (read-only
   * consumer action). Captures immutable-at-creation snapshots.
   * Strictly zero stock mutation.
   */
  async createRetailReplenishmentRequest({ itemCode, requestedQty, requestedBy, notes, session }, tenantId = 'tenant_h0qc7wf') {
    const targetTenantId = tenantId || session?.tenantId || 'tenant_h0qc7wf';
    const codeUpper = String(itemCode || '').toUpperCase().trim();
    const reqQty = parseFloat(requestedQty);

    if (!codeUpper) {
      throw new Error('MISSING_ITEM_CODE: itemCode is required to raise replenishment request.');
    }
    if (isNaN(reqQty) || !isFinite(reqQty) || reqQty <= 0) {
      throw new Error(`INVALID_REQUESTED_QTY: Requested quantity must be greater than 0, received: ${requestedQty}`);
    }

    // 1. Resolve master item & Base UOM from the SHARED inventory master
    const items = this._getCollection('inventory', targetTenantId);
    const masterItem = items.find(i => (i.itemCode || i.item_code || i.id) === codeUpper);
    if (!masterItem) {
      throw new Error(`ITEM_NOT_FOUND: "${codeUpper}" is not in the main inventory master. Retail only consumes live inventory SKUs.`);
    }
    const itemName = masterItem.itemName || masterItem.item_name || masterItem.name || codeUpper;
    const baseUom = masterItem.baseUom || masterItem.base_uom || 'PCS';
    const reorderSnapshot = parseFloat(masterItem.reorder_level !== undefined ? masterItem.reorder_level : (masterItem.data?.reorderLevel || 0));

    // 2. Resolve current on-hand balance at LOC-RETAIL (Snapshot)
    const balances = this._getCollection('stock_balances', targetTenantId);
    const locBal = balances.find(b =>
      (b.itemCode || b.item_code || b.id) === codeUpper &&
      (b.locationCode || b.location_code) === RETAIL_STORE_LOCATION &&
      (!targetTenantId || b.tenantId === targetTenantId || b.tenant_id === targetTenantId)
    );
    const onHandSnapshot = locBal ? parseFloat(locBal.quantity !== undefined ? locBal.quantity : (locBal.data?.quantity || 0)) : 0.0;

    // 3. Generate Request Entity with immutable-at-creation operational snapshots
    const existingReqs = this._getCollection('inventory_requests', targetTenantId);
    const now = new Date().toISOString();
    const reqNumber = `REQ-RETAIL-${new Date().getFullYear()}-${String(existingReqs.length + 1).padStart(4, '0')}`;
    const reqId = `req-retail-${Math.random().toString(36).substring(2, 9)}`;
    const actor = requestedBy || session?.employeeName || 'Retail Staff';

    const newRequest = {
      id: reqId,
      requestNumber: reqNumber,
      request_number: reqNumber,
      tenantId: targetTenantId,
      tenant_id: targetTenantId,
      department: RETAIL_DEPARTMENT,
      fromLocationCode: MAIN_WAREHOUSE_LOCATION,
      from_location: MAIN_WAREHOUSE_LOCATION,
      from_location_code: MAIN_WAREHOUSE_LOCATION,
      toLocationCode: RETAIL_STORE_LOCATION,
      to_location: RETAIL_STORE_LOCATION,
      to_location_code: RETAIL_STORE_LOCATION,
      itemCode: codeUpper,
      item_code: codeUpper,
      itemName,
      item_name: itemName,
      requestedQuantity: reqQty,
      requested_quantity: reqQty,
      uom: baseUom,
      baseUom,
      onHandAtRequest: onHandSnapshot,
      on_hand_at_request: onHandSnapshot,
      reorderLevelAtRequest: reorderSnapshot,
      reorder_level_at_request: reorderSnapshot,
      requestedBy: actor,
      requested_by: actor,
      requestedAt: now,
      requested_at: now,
      status: RetailReplenishmentStatus.PENDING_FULFILLMENT,
      fulfillmentTransferId: null,
      fulfillment_transfer_id: null,
      fulfilledQuantity: null,
      fulfilled_quantity: null,
      fulfilledBy: null,
      fulfilled_by: null,
      fulfilledAt: null,
      fulfilled_at: null,
      notes: notes || `Replenishment request for ${itemName} (${reqQty} ${baseUom}) at ${RETAIL_STORE_LOCATION}`,
      createdAt: now,
      updatedAt: now,
      data: {
        itemCode: codeUpper,
        itemName,
        requestedQuantity: reqQty,
        uom: baseUom,
        onHandAtRequest: onHandSnapshot,
        reorderLevelAtRequest: reorderSnapshot,
        fromLocation: MAIN_WAREHOUSE_LOCATION,
        toLocation: RETAIL_STORE_LOCATION,
        department: RETAIL_DEPARTMENT,
        requestedBy: actor,
        requestedAt: now,
        notes: notes || ''
      }
    };

    existingReqs.unshift(newRequest);
    this.offlineStore.setCollection('inventory_requests', existingReqs, targetTenantId);

    const dg = this._getDataGateway();
    if (dg) {
      await dg.create('inventory_requests', newRequest, session);
    }

    this.eventBus.publish('retail:replenishment_requested', {
      tenantId: targetTenantId,
      requestId: reqId,
      requestNumber: reqNumber,
      itemCode: codeUpper,
      requestedQty: reqQty,
      onHandAtRequest: onHandSnapshot
    });
    this.eventBus.publish('inventory_request:created', newRequest);

    return newRequest;
  }

  /**
   * Retrieves all replenishment requests targeting LOC-RETAIL.
   */
  getRetailReplenishmentRequests(tenantId = 'tenant_h0qc7wf', filters = {}) {
    const targetTenantId = tenantId || 'tenant_h0qc7wf';
    const all = this._getCollection('inventory_requests', targetTenantId);

    return all.filter(r => {
      const isRetailDept = (r.department === RETAIL_DEPARTMENT);
      const isRetailLoc = (r.toLocationCode === RETAIL_STORE_LOCATION || r.to_location === RETAIL_STORE_LOCATION || r.to_location_code === RETAIL_STORE_LOCATION);
      if (!isRetailDept && !isRetailLoc) return false;

      if (filters.status && r.status !== filters.status) return false;
      if (filters.itemCode && (r.itemCode || r.item_code) !== filters.itemCode) return false;
      return true;
    }).sort((a, b) => new Date(b.requestedAt || b.createdAt || 0) - new Date(a.requestedAt || a.createdAt || 0));
  }

  /**
   * Fulfillment Step (MANAGER-SIDE ONLY - inventory/warehouse staff, same action
   * that serves Bar/Kitchen). Guaranteed Request-Level Idempotency.
   * Delegates stock movement strictly to certified StockTransferRepository
   * (LOC-805 -> LOC-RETAIL). Retail UI never calls this.
   */
  async fulfillRetailReplenishmentRequest(requestId, { fulfilledBy, notes, session } = {}, tenantId = 'tenant_h0qc7wf') {
    const targetTenantId = tenantId || session?.tenantId || 'tenant_h0qc7wf';
    const allReqs = this._getCollection('inventory_requests', targetTenantId);
    const reqIndex = allReqs.findIndex(r => r.id === requestId || r.requestNumber === requestId || r.request_number === requestId);

    if (reqIndex < 0) {
      throw new Error(`REQUEST_NOT_FOUND: Replenishment request "${requestId}" does not exist.`);
    }

    const request = allReqs[reqIndex];

    // Request-Level Idempotency Guard
    if (request.status === RetailReplenishmentStatus.COMPLETED) {
      console.log(`[RetailReplenishmentModel] Request "${requestId}" is already COMPLETED. Returning idempotent cached result.`);
      return {
        success: true,
        idempotentRetry: true,
        transferNo: request.fulfillmentTransferId || request.fulfillment_transfer_id,
        request
      };
    }

    if (request.status !== RetailReplenishmentStatus.PENDING_FULFILLMENT && request.status !== 'PENDING' && request.status !== RetailReplenishmentStatus.APPROVED) {
      throw new Error(`INVALID_REQUEST_STATUS: Cannot fulfill request "${requestId}" in status "${request.status}". Must be PENDING_FULFILLMENT or APPROVED.`);
    }

    const itemCode = request.itemCode || request.item_code;
    const itemName = request.itemName || request.item_name || itemCode;
    const qty = parseFloat(request.requestedQuantity || request.requested_quantity);
    const uom = request.uom || request.baseUom || 'PCS';
    const actor = fulfilledBy || session?.employeeName || 'Warehouse Staff';

    // Execute Paired Transfer strictly via certified StockTransferRepository
    const transferPayload = {
      fromLocationCode: MAIN_WAREHOUSE_LOCATION,
      toLocationCode: RETAIL_STORE_LOCATION,
      notes: notes || `Fulfillment of ${request.requestNumber || request.request_number} for Retail Store`,
      lines: [
        {
          itemCode,
          itemName,
          quantity: qty,
          baseUom: uom
        }
      ]
    };

    const transferRes = this.stockTransferRepository.postTransfer(transferPayload, session);

    if (!transferRes.success) {
      throw new Error(`TRANSFER_FAILED: ${transferRes.error || 'Failed to post warehouse stock transfer.'}`);
    }

    if (transferRes.syncPromise) {
      await transferRes.syncPromise;
    }

    const transferRecord = transferRes.transfer;
    const fulfilledAt = new Date().toISOString();

    // Update request state to COMPLETED with fulfillment lineage
    request.status = RetailReplenishmentStatus.COMPLETED;
    request.fulfillmentTransferId = transferRecord.transferNo;
    request.fulfillment_transfer_id = transferRecord.transferNo;
    request.fulfilledQuantity = qty;
    request.fulfilled_quantity = qty;
    request.fulfilledBy = actor;
    request.fulfilled_by = actor;
    request.fulfilledAt = fulfilledAt;
    request.fulfilled_at = fulfilledAt;
    request.updatedAt = fulfilledAt;
    request.updated_at = fulfilledAt;

    if (request.data) {
      request.data.status = RetailReplenishmentStatus.COMPLETED;
      request.data.fulfillmentTransferId = transferRecord.transferNo;
      request.data.fulfilledQuantity = qty;
      request.data.fulfilledBy = actor;
      request.data.fulfilledAt = fulfilledAt;
    }

    allReqs[reqIndex] = request;
    this.offlineStore.setCollection('inventory_requests', allReqs, targetTenantId);

    const dg = this._getDataGateway();
    if (dg) {
      await dg.update('inventory_requests', request.id, request, session);
    }

    this.eventBus.publish('retail:replenishment_fulfilled', {
      tenantId: targetTenantId,
      requestId: request.id,
      requestNumber: request.requestNumber || request.request_number,
      transferNo: transferRecord.transferNo,
      itemCode,
      fulfilledQty: qty,
      fulfilledBy: actor
    });

    return {
      success: true,
      transferNo: transferRecord.transferNo,
      request
    };
  }
}

export const retailReplenishmentModel = new RetailReplenishmentModel();
