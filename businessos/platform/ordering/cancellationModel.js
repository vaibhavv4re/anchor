/**
 * BusinessOS Platform - Station-Controlled Cancellation Model (PD-010 / Cancellation Workflow)
 *
 * Governance layer over the existing order -> KOT/BOT -> item lifecycle -> READY consumption
 * engine (Model B). Cancellation NEVER touches the certified consumption math:
 *   - QUEUED     -> auto-approved (waiter self-service), zero consumption.
 *   - PREPARING  -> station must approve; no consumption exists yet.
 *   - READY      -> station approves; the SALE_CONSUMPTION already posted at READY STAYS.
 *                   A MANDATORY disposition-policy gate then produces HOLD / DISCARD records.
 *   - SERVED     -> cannot be cancelled.
 * Line-item granularity only: no generic order.status = CANCELLED shortcut.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { orderModel } from './orderModel.js';
import { productionRoutingEngine } from './productionRoutingEngine.js';
import { dispositionPolicyModel } from './dispositionPolicyModel.js';
import { preparedHoldModel } from './preparedHoldModel.js';

export const CANCELLATION_REASON_CODES = [
  'WRONG_ITEM', 'WRONG_QUANTITY', 'CUSTOMER_CHANGED_MIND', 'DUPLICATE_ORDER',
  'TABLE_CHANGE', 'WAITER_ENTRY_ERROR', 'QUALITY_ISSUE', 'KITCHEN_DELAY',
  'BAR_DELAY', 'OTHER'
];

const CLOSED_STATES = ['CANCELLED', 'VOIDED'];

class CancellationModel {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('cancellation_requests')) {
      offlineStore.setCollection('cancellation_requests', []);
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

  _actorFromSession() {
    if (typeof sessionStorage !== 'undefined') {
      try {
        return JSON.parse(sessionStorage.getItem('ros_session') || '{}');
      } catch (_) {}
    }
    return {};
  }

  /**
   * Station-scoped capability check (session role + permissions[] pattern).
   * Capabilities: KITCHEN_CANCEL_ITEM, KITCHEN_CANCEL_PREPARED_ITEM, KITCHEN_MARK_WASTE,
   * KITCHEN_HOLD_CANCELLED_ITEM (+ BAR_* equivalents); manager/admin pass all,
   * CANCEL_REVERSE (or manager/admin) gates reversals.
   */
  _canActor(actor = {}, capability = null) {
    const a = actor || {};
    // Server-auth sessions (authEngine) carry roleId/roleName/workspace, NOT
    // role/userRole/employeeRole. Read both shapes so real logins resolve a role
    // (a bare `role` lookup silently denied every station decision).
    const role = String(a.role || a.userRole || a.employeeRole || a.roleId || a.roleName || a.workspace || '').toLowerCase();
    const perms = Array.isArray(a.permissions) ? a.permissions.map(p => String(p).toUpperCase()) : [];
    const isManager = /manager|admin|owner/.test(role);
    if (isManager) return true;
    if (capability === 'CANCEL_REVERSE') return perms.includes('CANCEL_REVERSE');
    if (capability && perms.includes(String(capability).toUpperCase())) return true;
    const isKitchen = /chef|cook|kitchen/.test(role);
    const isBar = /bar/.test(role);
    if (capability && capability.startsWith('KITCHEN_') && isKitchen) return true;
    if (capability && capability.startsWith('BAR_') && isBar) return true;
    return false;
  }

  _stationCapability(request, action = 'cancel') {
    const prefix = String(request.station || 'KITCHEN').toUpperCase() === 'BAR' ? 'BAR' : 'KITCHEN';
    if (action === 'waste') return `${prefix}_MARK_WASTE`;
    if (action === 'hold') return `${prefix}_HOLD_CANCELLED_ITEM`;
    if (action === 'cancel') {
      return request.stageAtRequest === 'READY'
        ? `${prefix}_CANCEL_PREPARED_ITEM`
        : `${prefix}_CANCEL_ITEM`;
    }
    return `${prefix}_CANCEL_ITEM`;
  }

  /** Resolve the live line context (order item + ticket mirror + station + status). */
  _resolveLine(orderId, orderLineId, tenantId) {
    const order = orderModel.getOrder(orderId, tenantId);
    if (!order) return null;
    const line = (order.items || []).find(i => i.lineItemId === orderLineId || i.itemId === orderLineId);
    if (!line) return null;

    const tickets = Array.isArray(order.tickets) ? order.tickets : (order.data?.tickets || []);
    // Production truth lives in the offline tickets collection: that is what KDS/BDS
    // render and the copy updateTicketItemStatus mutates FIRST. The embedded order.tickets
    // mirror can lag, so scan the live collection before falling back to the embedded copy.
    const offTickets = offlineStore.getCollection('tickets') || [];
    const scanTickets = [...offTickets, ...tickets];
    let ticket = null;
    let ticketItem = null;
    for (const t of scanTickets) {
      const ti = (t.items || []).find(x => x.lineItemId === orderLineId || x.itemId === orderLineId);
      if (ti) { ticket = t; ticketItem = ti; break; }
    }

    const isBar = ticket
      ? (ticket.ticketType === 'BOT' || ticket.destination === 'BAR')
      : (line.routing === 'BAR_LINE' || line.routing === 'BAR' || line.productionArea === 'BAR');

    // Production truth lives on the ticket item once dispatched.
    const status = (ticketItem && (ticketItem.itemStatus || ticketItem.status))
      || line.itemStatus || line.status || 'QUEUED';

    let category = line.category || (ticketItem && ticketItem.category) || null;
    if (!category) {
      const menuItems = offlineStore.getCollection('kitchen_menu_items') || [];
      const mi = menuItems.find(m => m.id === (line.itemId || line.itemCode) || m.itemCode === (line.itemCode || line.itemId));
      if (mi) category = mi.category;
    }

    return {
      order,
      line,
      ticket,
      ticketItem,
      status,
      category,
      station: isBar ? 'BAR' : 'KITCHEN',
      ticketType: ticket ? (ticket.ticketType || (ticket.destination === 'BAR' ? 'BOT' : 'KOT')) : (isBar ? 'BOT' : 'KOT'),
      sessionId: order.sessionId || order.session_id || (ticket && ticket.sessionId) || null,
      tenantId: order.tenantId || order.tenant_id || tenantId
    };
  }

  getRequests(tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const dg = this._getDataGateway();
    const dgList = dg && typeof dg.getCachedCollection === 'function'
      ? (dg.getCachedCollection('cancellation_requests', targetTenantId) || [])
      : [];
    const offList = offlineStore.getCollection('cancellation_requests') || [];
    const byId = new Map();
    [...offList, ...dgList].forEach(r => { if (r && r.id) byId.set(r.id, r); });
    return Array.from(byId.values()).filter(r =>
      !targetTenantId || r.tenantId === targetTenantId || r.tenant_id === targetTenantId);
  }

  getRequest(requestId, tenantId = null) {
    return this.getRequests(tenantId).find(r => r.id === requestId) || null;
  }

  getRequestsForSession(sessionId, tenantId = null) {
    return this.getRequests(tenantId).filter(r => r.sessionId === sessionId);
  }

  getPendingRequests(station = null, tenantId = null) {
    return this.getRequests(tenantId).filter(r =>
      r.status === 'REQUESTED' && (!station || String(r.station).toUpperCase() === String(station).toUpperCase()));
  }

  getManagerDispositionQueue(tenantId = null) {
    return this.getRequests(tenantId).filter(r => r.status === 'PENDING_MANAGER_DISPOSITION');
  }

  _persistRequest(request, isNew = false) {
    const list = offlineStore.getCollection('cancellation_requests') || [];
    const idx = list.findIndex(r => r.id === request.id);
    if (idx >= 0) list[idx] = request;
    else list.push(request);
    offlineStore.setCollection('cancellation_requests', list);

    const dg = this._getDataGateway();
    if (dg) {
      const op = isNew ? dg.create('cancellation_requests', request) : dg.update('cancellation_requests', request.id, { ...request, data: request });
      Promise.resolve(op).catch(e =>
        console.warn('[cancellationModel] Cloud request sync error:', e.message));
    }
  }

  /**
   * Waiter (or legacy caller) requests a line-item cancellation.
   * QUEUED-stage lines auto-approve instantly (entry-error window);
   * PREPARING/READY lines create a REQUESTED record for the owning station.
   */
  requestCancellation({ sessionId = null, orderId, orderLineId, ticketId = null, quantity = 1, reasonCode = 'OTHER', reasonText = '', actor = null, tenantId = null, autoApprove = false }) {
    const targetTenantId = this._getTenantId(tenantId);
    const finalActor = actor || this._actorFromSession();
    const ctx = this._resolveLine(orderId, orderLineId, targetTenantId);
    if (!ctx) return { success: false, error: 'ORDER_LINE_NOT_FOUND' };

    if (CLOSED_STATES.includes(String(ctx.status).toUpperCase())) {
      return { success: false, error: `LINE_ALREADY_${String(ctx.status).toUpperCase()}` };
    }
    if (String(ctx.status).toUpperCase() === 'SERVED') {
      return { success: false, error: 'SERVED_ITEMS_CANNOT_BE_CANCELLED' };
    }
    if (!CANCELLATION_REASON_CODES.includes(reasonCode)) {
      return { success: false, error: 'INVALID_REASON_CODE' };
    }
    const qty = parseFloat(quantity) || 0;
    const activeQty = parseFloat(ctx.line.quantity) || 0;
    if (qty <= 0 || qty > activeQty) {
      return { success: false, error: 'QUANTITY_EXCEEDS_ACTIVE_LINE' };
    }

    // Idempotency: don't stack more than the active quantity across open requests.
    const openQty = this.getRequests(targetTenantId).reduce((sum, r) => {
      if ((r.orderLineId === ctx.line.lineItemId || r.orderLineId === orderLineId) &&
          ['REQUESTED', 'PENDING_MANAGER_DISPOSITION'].includes(r.status)) {
        return sum + (parseFloat(r.quantity) || 0);
      }
      return sum;
    }, 0);
    if (openQty + qty > activeQty) {
      return { success: false, error: 'CANCEL_QTY_EXCEEDS_ACTIVE_LINE', openQty, activeQty };
    }

    const now = new Date().toISOString();
    const request = {
      id: `cxl_${Math.random().toString(36).substring(2, 9)}`,
      tenantId: targetTenantId,
      tenant_id: targetTenantId,
      sessionId: sessionId || ctx.sessionId,
      orderId: ctx.order.orderId || ctx.order.id,
      orderLineId: ctx.line.lineItemId || orderLineId,
      ticketId: ticketId || (ctx.ticket && (ctx.ticket.ticketId || ctx.ticket.id)) || null,
      ticketType: ctx.ticketType,
      station: ctx.station,
      itemCode: ctx.line.itemCode || ctx.line.itemId,
      itemName: ctx.line.itemName || ctx.line.name,
      categoryCode: ctx.category,
      quantity: qty,
      requestedBy: finalActor.employeeId || finalActor.id || finalActor.waiterId || 'staff',
      requestedByName: finalActor.name || finalActor.userName || 'Staff',
      requestedAt: now,
      reasonCode,
      reasonText: reasonText || '',
      stageAtRequest: String(ctx.status).toUpperCase(),
      readyAtObserved: (ctx.ticketItem && ctx.ticketItem.readyAt) || ctx.line.readyAt || null,
      status: 'REQUESTED',
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      holdId: null,
      createdAt: now,
      updatedAt: now
    };

    this._persistRequest(request, true);

    // Entry-error window: nothing has physically started, no consumption exists.
    if (request.stageAtRequest === 'QUEUED' || autoApprove) {
      const applyRes = this._applyCancellation(request, { id: 'System', name: 'Auto-Approved' }, null, { force: true });
      if (!applyRes.success) return applyRes;
      request.status = request.status === 'PENDING_MANAGER_DISPOSITION' ? 'PENDING_MANAGER_DISPOSITION' : 'AUTO_APPROVED';
      request.decidedBy = request.stageAtRequest === 'QUEUED' ? 'System (QUEUED window)' : 'Manager override';
      request.decidedAt = new Date().toISOString();
      request.updatedAt = request.decidedAt;
      this._persistRequest(request);
      platformEventBus.publish('cancellation:decided', { request, auto: true, hold: applyRes.hold || null });
      this._syncSessionProjection(request);
      return { success: true, request, autoApproved: true, hold: applyRes.hold || null, pendingManager: !!applyRes.pendingManager, policy: applyRes.policy || null };
    }

    platformEventBus.publish('cancellation:requested', {
      requestId: request.id, sessionId: request.sessionId, orderId: request.orderId,
      orderLineId: request.orderLineId, ticketId: request.ticketId, station: request.station,
      itemName: request.itemName, quantity: request.quantity, reasonCode,
      requestedBy: request.requestedBy, requestedByName: request.requestedByName,
      stageAtRequest: request.stageAtRequest, tenantId: targetTenantId, timestamp: now
    });
    this._syncSessionProjection(request);
    return { success: true, request, autoApproved: false };
  }

  /**
   * Station (or manager) decides an open request.
   * @param {'APPROVE'|'REJECT'} decision
   * @param {Object} opts { disposition: 'HOLD'|'DISCARD' | undefined } - disposition modal result.
   */
  decideCancellation(requestId, decision, actor = null, opts = {}, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const finalActor = actor || this._actorFromSession();
    const request = this.getRequest(requestId, targetTenantId);
    if (!request) return { success: false, error: 'REQUEST_NOT_FOUND' };

    if (['APPROVED', 'AUTO_APPROVED'].includes(request.status)) {
      return { success: true, request, idempotent: true }; // double-approve applies once
    }
    if (!['REQUESTED', 'PENDING_MANAGER_DISPOSITION'].includes(request.status)) {
      return { success: false, error: `REQUEST_NOT_DECIDABLE (${request.status})` };
    }

    const isManagerQueue = request.status === 'PENDING_MANAGER_DISPOSITION';
    const capability = isManagerQueue ? null : this._stationCapability(request, 'cancel');
    if (!isManagerQueue && !this._canActor(finalActor, capability)) {
      return { success: false, error: `STATION_AUTHORITY_REQUIRED (${capability})` };
    }

    const now = new Date().toISOString();

    if (String(decision).toUpperCase() === 'REJECT') {
      if (isManagerQueue) return { success: false, error: 'MANAGER_QUEUE_ACCEPTS_DISPOSITION_ONLY' };
      request.status = 'REJECTED';
      request.decidedBy = finalActor.employeeId || finalActor.id || finalActor.name || 'Station';
      request.decidedAt = now;
      request.decisionNote = opts.note || '';
      request.updatedAt = now;
      this._persistRequest(request);
      platformEventBus.publish('cancellation:decided', { request, decision: 'REJECT', hold: null });
      this._syncSessionProjection(request);
      return { success: true, request };
    }

    if (String(decision).toUpperCase() !== 'APPROVE') {
      return { success: false, error: 'INVALID_DECISION' };
    }

    let disposition = opts.disposition ? String(opts.disposition).toUpperCase() : null;
    if (disposition && !['HOLD', 'DISCARD'].includes(disposition)) {
      return { success: false, error: 'INVALID_DISPOSITION' };
    }

    // Explicit disposition choices need the matching station capability (waste / hold).
    if (disposition && !isManagerQueue && !this._canActor(finalActor, this._stationCapability(request, disposition === 'DISCARD' ? 'waste' : 'hold'))) {
      return { success: false, error: 'DISPOSITION_AUTHORITY_REQUIRED' };
    }
    if (isManagerQueue && !this._canActor(finalActor, null) && !this._canActor(finalActor, 'CANCEL_REVERSE')) {
      // Manager queue requires manager identity; _canActor(actor, null) is only true for managers.
      return { success: false, error: 'MANAGER_AUTHORITY_REQUIRED' };
    }

    const applyRes = this._applyCancellation(request, finalActor, disposition, { managerQueue: isManagerQueue });
    if (!applyRes.success) return applyRes;

    request.decidedBy = finalActor.employeeId || finalActor.id || finalActor.name || 'Station';
    request.decidedAt = now;
    request.decisionNote = opts.note || '';
    request.updatedAt = now;
    if (applyRes.hold) request.holdId = applyRes.hold.id;
    // Mandatory-gate MANAGER_DECISION outcome: line is cancelled but the HOLD/DISCARD
    // choice awaits a manager, so park the request in the PENDING_MANAGER_DISPOSITION
    // sub-state (the manager's later pass must not re-cancel the already-cancelled line).
    request.status = applyRes.pendingManager ? 'PENDING_MANAGER_DISPOSITION' : 'APPROVED';

    this._persistRequest(request);
    platformEventBus.publish('cancellation:decided', {
      request, decision: 'APPROVE', hold: applyRes.hold || null,
      pendingManager: !!applyRes.pendingManager, policy: applyRes.policy || null
    });
    this._syncSessionProjection(request);
    return { success: true, request, hold: applyRes.hold || null, pendingManager: !!applyRes.pendingManager, policy: applyRes.policy || null };
  }

  /**
   * Apply the line cancellation on the order + ticket mirrors, then run the
   * MANDATORY disposition-policy gate for READY-stage (prepared) lines.
   */
  _applyCancellation(request, actor, disposition = null, flags = {}) {
    const targetTenantId = this._getTenantId(request.tenantId);
    const ctx = this._resolveLine(request.orderId, request.orderLineId, targetTenantId);
    if (!ctx) return { success: false, error: 'ORDER_LINE_NOT_FOUND' };

    const liveStatus = String(ctx.status).toUpperCase();
    if (liveStatus === 'SERVED') return { success: false, error: 'SERVED_ITEMS_CANNOT_BE_CANCELLED' };
    // The manager-disposition leg runs AFTER the station approve already cancelled the
    // line, so a CLOSED live status is expected there (that leg skips the line mutation).
    if (CLOSED_STATES.includes(liveStatus) && !flags.force && !flags.managerQueue) {
      return { success: false, error: `LINE_ALREADY_${liveStatus}` };
    }

    const wasPrepared = liveStatus === 'READY' || request.stageAtRequest === 'READY' || flags.pendingPrepared === true;
    const now = new Date().toISOString();

    // For the manager-disposition leg the line was already cancelled; only close the hold.
    if (!flags.managerQueue) {
      const cancelledQty = Math.min(parseFloat(request.quantity) || 0, parseFloat(ctx.line.quantity) || 0);
      if (cancelledQty <= 0) return { success: false, error: 'NO_ACTIVE_QUANTITY_LEFT' };
      this._cancelLineQuantity(ctx, request, cancelledQty, now);
    }

    let hold = null;
    let policy = null;
    let pendingManager = false;

    if (wasPrepared) {
      // MANDATORY disposition-policy gate - no code path creates a hold without it.
      policy = dispositionPolicyModel.resolvePolicy(request.station, request.itemCode, request.categoryCode, targetTenantId);

      if (policy.allowHold && policy.decideBy === 'MANAGER' && !disposition && !flags.managerQueue) {
        pendingManager = true;
      } else {
        let effective = String(disposition || policy.defaultDisposition || 'HOLD').toUpperCase();
        if (!policy.allowHold) effective = 'DISCARD'; // DISCARD_ONLY policy: no hold offer, ever.
        const consumedCost = this._computeConsumedCost(targetTenantId, request.orderId, request.orderLineId);
        hold = preparedHoldModel.createHold({
          request: { ...request, decidedAt: now, preparedAt: request.readyAtObserved },
          consumedCost,
          policy,
          disposition: effective,
          actor: actor || {}
        });
      }
    }

    // Persist order + ticket mutations and recompute aggregate statuses.
    this._persistOrderContext(ctx);
    return { success: true, hold, policy, pendingManager };
  }

  /** Partial split (quantity conserved) or whole-line cancel on order + ticket mirrors. */
  _cancelLineQuantity(ctx, request, cancelledQty, now) {
    const lineQty = parseFloat(ctx.line.quantity) || 0;
    const isPartial = cancelledQty < lineQty;

    const childLineId = `${ctx.line.lineItemId}__cxl_${Math.random().toString(36).substring(2, 7)}`;
    const child = {
      ...ctx.line,
      lineItemId: childLineId,
      quantity: cancelledQty,
      itemStatus: 'CANCELLED',
      status: 'CANCELLED',
      cancelledByRequestId: request.id,
      cancelledAt: now,
      cancelReason: request.reasonCode
    };
    delete child.readyAt;
    delete child.servedAt;

    if (isPartial) {
      ctx.line.quantity = parseFloat((lineQty - cancelledQty).toFixed(4));
      if (ctx.line.lineTotal !== undefined) {
        ctx.line.lineTotal = parseFloat((ctx.line.price || 0) * ctx.line.quantity);
      }
      // Only a PARTIAL split spawns a cancelled child (quantity conserved across parent+child).
      ctx.order.items.push(child);
    } else {
      // Full-line cancel: mark the parent itself CANCELLED, no duplicate child.
      ctx.line.itemStatus = 'CANCELLED';
      ctx.line.status = 'CANCELLED';
      ctx.line.cancelledByRequestId = request.id;
      ctx.line.cancelledAt = now;
      ctx.line.cancelReason = request.reasonCode;
    }

    const cancelInTicket = (ticket) => {
      const items = ticket.items || [];
      const tLine = items.find(x => x.lineItemId === (ctx.line.lineItemId || request.orderLineId) || x.itemId === request.orderLineId);
      if (!tLine) return;
      const tQty = parseFloat(tLine.quantity) || 0;
      if (isPartial || tLine.quantity !== cancelledQty) {
        if (cancelledQty < tQty) tLine.quantity = parseFloat((tQty - cancelledQty).toFixed(4));
      }
      if (!isPartial) {
        tLine.itemStatus = 'CANCELLED';
        tLine.status = 'CANCELLED';
        tLine.cancelledByRequestId = request.id;
        tLine.cancelledAt = now;
      }
      if (isPartial) {
        const tChild = { ...tLine, lineItemId: childLineId, id: childLineId, quantity: cancelledQty, itemStatus: 'CANCELLED', status: 'CANCELLED' };
        delete tChild.readyAt;
        delete tChild.servedAt;
        items.push(tChild);
      }
      ticket.status = productionRoutingEngine._computeTicketStatus(ticket);
      ticket.updatedAt = now;
    };

    (ctx.order.tickets || []).forEach(cancelInTicket);
    if (ctx.order.data && Array.isArray(ctx.order.data.tickets)) {
      ctx.order.data.tickets.forEach(cancelInTicket);
    }

    // Mirror into the standalone tickets collection (KDS canonical source).
    const tickets = offlineStore.getCollection('tickets') || [];
    tickets.forEach(cancelInTicket);
    offlineStore.setCollection('tickets', tickets);
  }

  _persistOrderContext(ctx) {
    const now = new Date().toISOString();
    ctx.order.status = productionRoutingEngine._computeOrderStatus(ctx.order);
    ctx.order.orderStatus = ctx.order.status;
    ctx.order.updatedAt = now;
    ctx.order.data = {
      ...(ctx.order.data || {}),
      items: ctx.order.items,
      tickets: ctx.order.tickets,
      status: ctx.order.status,
      orderStatus: ctx.order.status
    };

    const orders = offlineStore.getCollection('orders') || [];
    const idx = orders.findIndex(o => o.id === ctx.order.id || o.orderId === ctx.order.orderId);
    if (idx >= 0) orders[idx] = ctx.order;
    else orders.push(ctx.order);
    offlineStore.setCollection('orders', orders);

    const dg = this._getDataGateway();
    if (dg) {
      dg.update('orders', ctx.order.id || ctx.order.orderId, ctx.order)
        .catch(e => console.warn('[cancellationModel] Cloud order sync error:', e.message));
    }
    this._broadcastChange('CLOUD_MUTATION', { table: 'orders', operation: 'UPDATE', record: ctx.order });
  }

  /**
   * "Prepared Item Cost" = sum of |totalCost| over the line's SALE_CONSUMPTION ledger rows
   * (operation-id shape comes from inventoryConsumptionService: cons_<tenant>_<order>_<line>).
   */
  _computeConsumedCost(tenantId, orderId, orderLineId) {
    const dg = this._getDataGateway();
    const dgList = dg && typeof dg.getCachedCollection === 'function'
      ? (dg.getCachedCollection('stock_transactions', tenantId) || [])
      : [];
    const offList = offlineStore.getCollection('stock_transactions') || [];
    const expectedOpId = `cons_${tenantId}_${orderId}_${orderLineId}`;

    const seen = new Set();
    let total = 0;
    [...offList, ...dgList].forEach(t => {
      if (!t || seen.has(t.id)) return;
      const type = String(t.transactionType || t.transaction_type || '').toUpperCase();
      const refLine = String(t.referenceLineId || t.reference_line_id || '');
      const isConsumption = type === 'SALE_CONSUMPTION' &&
        ((t.operationId || t.operation_id) === expectedOpId ||
         (refLine === String(orderLineId) && String(t.referenceId || t.reference_id) === String(orderId)));
      if (isConsumption) {
        seen.add(t.id);
        total += Math.abs(parseFloat(t.totalCost || t.total_cost) || 0);
      }
    });
    return parseFloat(total.toFixed(2));
  }

  /**
   * Manager-only reversal: restores the line to its pre-cancellation stage.
   * The original request record stays immutable; a new REVERSED record references it.
   * Blocked once the prepared hold has been REUSED (physical item already served on another bill).
   */
  reverseCancellation(requestId, actor = null, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const finalActor = actor || this._actorFromSession();
    if (!this._canActor(finalActor, 'CANCEL_REVERSE')) {
      return { success: false, error: 'MANAGER_AUTHORITY_REQUIRED' };
    }
    const request = this.getRequest(requestId, targetTenantId);
    if (!request) return { success: false, error: 'REQUEST_NOT_FOUND' };
    if (!['APPROVED', 'AUTO_APPROVED'].includes(request.status)) {
      return { success: false, error: `REQUEST_NOT_REVERSIBLE (${request.status})` };
    }

    const linkedHolds = preparedHoldModel.getHolds(targetTenantId).filter(h =>
      h.sourceRequestId === request.id || (h.sourceOrderLineId === request.orderLineId && h.sourceOrderId === request.orderId));
    if (linkedHolds.some(h => h.status === 'REUSED')) {
      return { success: false, error: 'HOLD_ALREADY_REUSED_LINE_LOCKED' };
    }

    const ctx = this._resolveLine(request.orderId, request.orderLineId, targetTenantId);
    if (!ctx) return { success: false, error: 'ORDER_LINE_NOT_FOUND' };
    const now = new Date().toISOString();
    const restoreStatus = request.stageAtRequest || 'QUEUED';

    // Only the spawned split child carries the `__cxl_` line-id suffix. A full-line cancel
    // marks the PARENT CANCELLED (and stamps cancelledByRequestId on it too), so matching on
    // that field here would wrongly strip the parent instead of restoring it.
    const childOfRequest = (x) => x && String(x.lineItemId || '').startsWith(`${request.orderLineId}__cxl_`);

    // Remove the cancelled child line(s) and restore parent quantity.
    let removedQty = 0;
    const stripList = (items) => {
      for (let i = items.length - 1; i >= 0; i--) {
        if (childOfRequest(items[i])) {
          removedQty += parseFloat(items[i].quantity) || 0;
          items.splice(i, 1);
        }
      }
    };
    stripList(ctx.order.items || []);
    (ctx.order.tickets || []).forEach(t => { stripList(t.items || []); t.status = productionRoutingEngine._computeTicketStatus(t); });
    if (ctx.order.data && Array.isArray(ctx.order.data.tickets)) {
      ctx.order.data.tickets.forEach(t => { stripList(t.items || []); t.status = productionRoutingEngine._computeTicketStatus(t); });
    }
    const tickets = offlineStore.getCollection('tickets') || [];
    tickets.forEach(t => {
      const before = (t.items || []).length;
      stripList(t.items || []);
      if ((t.items || []).length !== before) { t.status = productionRoutingEngine._computeTicketStatus(t); t.updatedAt = now; }
    });
    offlineStore.setCollection('tickets', tickets);

    // A partial cancel left the parent quantity reduced; restore it. A full cancel
    // marked the parent itself CANCELLED with no child: restore its status.
    const stillCancelledParent = String(ctx.line.itemStatus || ctx.line.status).toUpperCase() === 'CANCELLED';
    if (removedQty > 0 && !stillCancelledParent) {
      ctx.line.quantity = parseFloat((parseFloat(ctx.line.quantity) || 0) + removedQty);
    } else if (childOfRequest(ctx.line)) {
      // Parent reference points at a removed child; nothing to restore in place.
    }
    ctx.line.itemStatus = restoreStatus;
    ctx.line.status = restoreStatus;
    delete ctx.line.cancelledAt;
    delete ctx.line.cancelReason;
    delete ctx.line.cancelledByRequestId;

    this._persistOrderContext(ctx);

    // New immutable audit record; the original request is left untouched.
    const reversal = {
      ...request,
      id: `cxl_${Math.random().toString(36).substring(2, 9)}`,
      status: 'REVERSED',
      reversesRequestId: request.id,
      decidedBy: finalActor.employeeId || finalActor.id || finalActor.name || 'Manager',
      decidedAt: now,
      decisionNote: `Reversed ${request.reasonCode} cancellation; line restored to ${restoreStatus}`,
      createdAt: now,
      updatedAt: now
    };
    this._persistRequest(reversal, true);

    platformEventBus.publish('cancellation:reversed', { originalRequestId: request.id, reversal, tenantId: targetTenantId, timestamp: now });
    this._syncSessionProjection(request);
    return { success: true, reversal, restoredStatus: restoreStatus };
  }

  _syncSessionProjection(request) {
    if (request && request.sessionId) {
      platformEventBus.publish('cancellation:projection_refresh', { sessionId: request.sessionId });
    }
  }

  _broadcastChange(type, data) {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('anchor_restaurantos_realtime');
        bc.postMessage({ type, record: data, timestamp: Date.now() });
        bc.close();
      } catch (_) {}
    }
  }
}

export const cancellationModel = new CancellationModel();
