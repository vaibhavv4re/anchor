/**
 * BusinessOS Platform - Prepared Item Hold Model (Station Cancellation Workflow)
 *
 * A hold is the disposition/traceability record created when a PREPARED (READY-stage)
 * item is cancelled: the raw-stock consumption ALREADY happened at READY (Model B) and
 * is never reversed here. The hold carries:
 *   - consumedCost  : "Prepared Item Cost" (sum of the line's SALE_CONSUMPTION txn costs)
 *   - wasteAmount   : recognised ONLY on the DISCARDED transition (0 while HELD, 0 on REUSE)
 * No stock_transactions row is written for a hold - waste reporting reads this record.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

class PreparedHoldModel {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('prepared_item_holds')) {
      offlineStore.setCollection('prepared_item_holds', []);
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
   * Create the disposition record for an approved prepared cancellation.
   * @param {Object} args
   * @param {Object} args.request   cancellation request being applied
   * @param {number} args.consumedCost  SALE_CONSUMPTION cost carried by the prepared item
   * @param {Object} args.policy    resolved disposition policy snapshot
   * @param {'HOLD'|'DISCARD'} args.disposition  explicit station/manager choice or policy default
   * @param {Object} args.actor     { id, name }
   */
  createHold({ request, consumedCost = 0, policy, disposition = 'HOLD', actor = {} }) {
    const targetTenantId = this._getTenantId(request && request.tenantId);
    const now = new Date().toISOString();
    const discarding = String(disposition).toUpperCase() === 'DISCARD';

    const hold = {
      id: `hold_${Math.random().toString(36).substring(2, 9)}`,
      tenantId: targetTenantId,
      tenant_id: targetTenantId,
      sourceSessionId: request.sessionId,
      sourceOrderId: request.orderId,
      sourceOrderLineId: request.orderLineId,
      sourceTicketId: request.ticketId || null,
      sourceRequestId: request.id,
      itemCode: request.itemCode,
      itemName: request.itemName,
      quantity: request.quantity,
      station: request.station || 'KITCHEN',
      preparedAt: request.preparedAt || null,
      cancelledAt: request.decidedAt || now,
      holdCreatedAt: now,
      status: discarding ? 'DISCARDED' : 'HELD',
      consumedCost: parseFloat(consumedCost) || 0,
      // Waste is recognised ONLY on discard; a HELD item is prepared cost, not waste.
      wasteAmount: discarding ? (parseFloat(consumedCost) || 0) : 0,
      wasteRecognizedAt: discarding ? now : null,
      reusedOrderLineId: null,
      reusedTicketId: null,
      reusedAt: null,
      reusedBy: null,
      discardedAt: discarding ? now : null,
      discardedBy: discarding ? (actor.id || actor.name || 'Station') : null,
      discardReason: discarding ? 'CANCELLED_ORDER' : null,
      holdExpiresAt: discarding || !policy || !policy.holdMinutes
        ? null
        : new Date(Date.now() + policy.holdMinutes * 60000).toISOString(),
      policySnapshot: policy ? {
        policyId: policy.policyId, outcome: policy.outcome,
        holdMinutes: policy.holdMinutes, defaultDisposition: policy.defaultDisposition,
        decideBy: policy.decideBy, source: policy.source
      } : null,
      lineage: discarding ? 'CANCEL -> DISCARD' : 'CANCEL -> HOLD',
      createdAt: now,
      updatedAt: now
    };

    offlineStore.appendItem('prepared_item_holds', hold);
    const dg = this._getDataGateway();
    if (dg) {
      dg.create('prepared_item_holds', hold).catch(e =>
        console.warn('[preparedHoldModel] Cloud hold sync error:', e.message));
    }

    platformEventBus.publish(discarding ? 'hold:discarded' : 'hold:created', hold);
    return hold;
  }

  getHold(holdId, tenantId = null) {
    const holds = this.getHolds(tenantId);
    return holds.find(h => h.id === holdId) || null;
  }

  /** All holds, newest first, optionally filtered { station, status, itemCode }. */
  getHolds(tenantId = null, filters = {}) {
    const targetTenantId = this._getTenantId(tenantId);
    const dg = this._getDataGateway();
    const dgList = dg && typeof dg.getCachedCollection === 'function'
      ? (dg.getCachedCollection('prepared_item_holds', targetTenantId) || [])
      : [];
    const offList = offlineStore.getCollection('prepared_item_holds') || [];

    const byId = new Map();
    [...offList, ...dgList].forEach(h => { if (h && h.id) byId.set(h.id, h); });

    let list = Array.from(byId.values()).filter(h =>
      !targetTenantId || h.tenantId === targetTenantId || h.tenant_id === targetTenantId);
    if (filters.station) {
      list = list.filter(h => String(h.station).toUpperCase() === String(filters.station).toUpperCase());
    }
    if (filters.status) {
      list = list.filter(h => h.status === filters.status);
    }
    if (filters.itemCode) {
      list = list.filter(h => h.itemCode === filters.itemCode);
    }
    return list.sort((a, b) => new Date(b.holdCreatedAt || 0) - new Date(a.holdCreatedAt || 0));
  }

  /** HELD stock for a menu item - powers the KDS/BDS "held item available" hints. */
  getHoldsByItem(itemCode, tenantId = null) {
    return this.getHolds(tenantId, { itemCode, status: 'HELD' })
      .filter(h => !this.isExpired(h));
  }

  isExpired(hold) {
    return !!(hold && hold.holdExpiresAt && new Date(hold.holdExpiresAt).getTime() < Date.now());
  }

  /**
   * Chef/bartender assigns a HELD prepared item to a new order line.
   * The new line must be stamped with `fulfilledByHoldId` so the READY transition
   * skips a second BOM consumption (productionRoutingEngine enforces that guard).
   */
  reuseHold(holdId, { orderId = null, orderLineId = null, ticketId = null, actor = {} } = {}, tenantId = null) {
    const hold = this.getHold(holdId, tenantId);
    if (!hold) return { success: false, error: 'HOLD_NOT_FOUND' };
    if (hold.status !== 'HELD') return { success: false, error: `HOLD_NOT_AVAILABLE (${hold.status})` };
    if (this.isExpired(hold)) return { success: false, error: 'HOLD_EXPIRED_DISCARD_ONLY' };

    const now = new Date().toISOString();
    const patch = {
      status: 'REUSED',
      reusedOrderLineId: orderLineId,
      reusedTicketId: ticketId,
      reusedOrderId: orderId,
      reusedAt: now,
      reusedBy: actor.id || actor.name || 'Station',
      lineage: 'CANCEL -> HOLD -> REUSED',
      wasteAmount: 0,
      updatedAt: now
    };
    this._applyPatch(hold, patch);
    const updated = { ...hold, ...patch };

    platformEventBus.publish('hold:reused', updated);
    return { success: true, hold: updated };
  }

  /**
   * Mark READY for a line already stamped fulfilledByHoldId: guarantee the hold is
   * closed out even when the UI assigned the flag without calling reuseHold yet.
   */
  confirmReuseOnReady(holdId, { orderId = null, orderLineId = null, ticketId = null, actor = {} } = {}, tenantId = null) {
    const hold = this.getHold(holdId, tenantId);
    if (!hold) return { success: false, error: 'HOLD_NOT_FOUND' };
    if (hold.status === 'REUSED') return { success: true, hold };
    return this.reuseHold(holdId, { orderId, orderLineId, ticketId, actor }, tenantId);
  }

  /** Waste transition: recognises consumedCost as waste on this record only (no stock movement). */
  discardHold(holdId, { actor = {}, reason = 'CANCELLED_ORDER' } = {}, tenantId = null) {
    const hold = this.getHold(holdId, tenantId);
    if (!hold) return { success: false, error: 'HOLD_NOT_FOUND' };
    if (hold.status === 'REUSED') return { success: false, error: 'HOLD_ALREADY_REUSED' };
    if (hold.status === 'DISCARDED') return { success: true, hold }; // idempotent

    const now = new Date().toISOString();
    const patch = {
      status: 'DISCARDED',
      discardedAt: now,
      discardedBy: actor.id || actor.name || 'Station',
      discardReason: reason,
      wasteAmount: parseFloat(hold.consumedCost) || 0,
      wasteRecognizedAt: now,
      lineage: hold.lineage && hold.lineage.includes('HOLD') ? 'CANCEL -> HOLD -> DISCARDED' : 'CANCEL -> DISCARD',
      updatedAt: now
    };
    this._applyPatch(hold, patch);
    const updated = { ...hold, ...patch };

    platformEventBus.publish('hold:discarded', updated);
    return { success: true, hold: updated };
  }

  _applyPatch(hold, patch) {
    const list = offlineStore.getCollection('prepared_item_holds') || [];
    const idx = list.findIndex(h => h.id === hold.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...patch };
    offlineStore.setCollection('prepared_item_holds', list);

    const dg = this._getDataGateway();
    if (dg) {
      dg.update('prepared_item_holds', hold.id, { ...patch, data: { ...hold, ...patch } })
        .catch(e => console.warn('[preparedHoldModel] Cloud hold update error:', e.message));
    }
  }
}

export const preparedHoldModel = new PreparedHoldModel();
