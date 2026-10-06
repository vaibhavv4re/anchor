/**
 * BusinessOS Platform - Automatic Production Routing Engine (PD-010 / K-08)
 * Intercepts order:confirmed events, inspects item routing and production destinations,
 * automatically dispatches KOT (Kitchen) and BOT (Bar) tickets, and persists them inside
 * the canonical Supabase 'orders' document via DataGateway.
 */

import { prodSpecModel, ProductionDestinations } from './prodSpecModel.js';
import { orderModel } from './orderModel.js';
import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { resolvedBomEngine } from './resolvedBomEngine.js';
import { inventoryConsumptionService } from '../inventory/inventoryConsumptionService.js';
import { preparedHoldModel } from './preparedHoldModel.js';

class ProductionRoutingEngine {
  constructor() {
    this._initSubscriber();
  }

  _getDataGateway() {
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) {
      return window.__APP__.platform.dataGateway || null;
    }
    return null;
  }

  _initSubscriber() {
    // Intercept confirmed orders for automatic ticket splitting & routing
    platformEventBus.subscribe('order:confirmed', (envelope) => {
      const payload = envelope.payload || envelope;
      this.routeOrderToProduction(payload.orderId || payload.order?.id, payload.tenantId || payload.order?.tenantId);
    });
  }

  /**
   * Route order items to Kitchen (KOT) or Bar (BOT) based on Production Specs and Menu Routing.
   * Persists the generated tickets inside the order record in Supabase.
   * @param {string} orderId
   * @param {string|null} tenantId
   * @returns {Array<Object>} Created tickets
   */
  routeOrderToProduction(orderId, tenantId = null) {
    const targetTenantId = tenantId || (typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}').tenantId : null);
    const order = orderModel.getOrder(orderId, targetTenantId);
    if (!order) return [];

    const kitchenItems = [];
    const barItems = [];

    const menuItems = offlineStore.getCollection('kitchen_menu_items', targetTenantId) || [];

    for (const lineItem of (order.items || [])) {
      const itemId = lineItem.itemId || lineItem.itemCode;
      const menuItem = menuItems.find(m => m.id === itemId || m.itemCode === itemId || m.item_code === itemId);
      const spec = prodSpecModel.getProdSpecForItem(itemId);

      const isBar = (lineItem.productionArea === 'BAR' || lineItem.routing === 'BAR_LINE' || lineItem.routing === 'BAR') ||
        (menuItem && (menuItem.productionArea === 'BAR' || menuItem.routing === 'BAR_LINE' || menuItem.routing === 'BAR' || menuItem.category === 'BEVERAGES' || menuItem.category === 'BAR')) ||
        (spec && spec.destination === ProductionDestinations.BAR);

      const stationName = (menuItem ? menuItem.category : null) || spec.stationName || (isBar ? 'Bar Station' : 'Main Kitchen');

      if (isBar) {
        barItems.push({
          ...lineItem,
          lineItemId: lineItem.lineItemId || `line_${orderId}_bar_${barItems.length + 1}`,
          stationName,
          itemStatus: lineItem.itemStatus || 'QUEUED',
          recipeId: lineItem.recipeId || menuItem?.recipeId || null
        });
      } else {
        kitchenItems.push({
          ...lineItem,
          lineItemId: lineItem.lineItemId || `line_${orderId}_kitch_${kitchenItems.length + 1}`,
          stationName,
          itemStatus: lineItem.itemStatus || 'QUEUED',
          recipeId: lineItem.recipeId || menuItem?.recipeId || null
        });
      }
    }

    const createdTickets = [];
    const now = new Date();
    const orderNum = order.orderNumber || order.order_number || order.orderId || order.id;

    // 1. Dispatch KOT (Kitchen Order Ticket) if kitchen items exist
    if (kitchenItems.length > 0) {
      const kotId = `KOT-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const kotTicket = {
        id: kotId,
        ticketId: kotId,
        ticketType: 'KOT',
        orderId: order.orderId || order.id,
        orderNumber: orderNum,
        sessionId: order.sessionId || order.session_id,
        tableNumber: order.tableNumber || 1,
        tableCode: order.tableCode || order.table_code || `T-${order.tableNumber || 1}`,
        waiterId: order.waiterId || 'Staff',
        destination: ProductionDestinations.KITCHEN,
        items: kitchenItems,
        status: 'QUEUED', // QUEUED -> PREPARING -> READY -> SERVED
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        tenantId: order.tenantId || targetTenantId || 'tenant_h0qc7wf',
        correlationId: order.correlationId || null
      };

      createdTickets.push(kotTicket);
      offlineStore.appendItem('tickets', kotTicket);
      platformEventBus.publish('kot:dispatched', kotTicket);
    }

    // 2. Dispatch BOT (Bar Order Ticket) if bar items exist
    if (barItems.length > 0) {
      const botId = `BOT-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const botTicket = {
        id: botId,
        ticketId: botId,
        ticketType: 'BOT',
        orderId: order.orderId || order.id,
        orderNumber: orderNum,
        sessionId: order.sessionId || order.session_id,
        tableNumber: order.tableNumber || 1,
        tableCode: order.tableCode || order.table_code || `T-${order.tableNumber || 1}`,
        waiterId: order.waiterId || 'Staff',
        destination: ProductionDestinations.BAR,
        items: barItems,
        status: 'QUEUED', // QUEUED -> PREPARING -> READY -> SERVED
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        tenantId: order.tenantId || targetTenantId || 'tenant_h0qc7wf',
        correlationId: order.correlationId || null
      };

      createdTickets.push(botTicket);
      offlineStore.appendItem('tickets', botTicket);
      platformEventBus.publish('bot:dispatched', botTicket);
    }

    // 3. Persist complete tickets array inside the order payload in Supabase
    if (createdTickets.length > 0) {
      const existingTickets = Array.isArray(order.tickets) ? order.tickets : (order.data?.tickets || []);
      order.tickets = [...existingTickets, ...createdTickets];
      order.data = { ...(order.data || {}), tickets: order.tickets };
      order.updatedAt = now.toISOString();

      // Update offline store orders collection
      const orders = offlineStore.getCollection('orders', targetTenantId) || [];
      const ordIdx = orders.findIndex(o => o.id === order.id || o.orderId === order.orderId);
      if (ordIdx >= 0) {
        orders[ordIdx] = order;
        offlineStore.setCollection('orders', orders);
      }

      // Sync updated order with tickets to Supabase
      const dg = this._getDataGateway();
      if (dg) {
        dg.update('orders', order.id, order).catch(e => console.warn('[productionRoutingEngine] Cloud order tickets sync error:', e.message));
      }

      // 4. Model B Architecture: Stock deduction does NOT occur on order:confirmed.
      // Items remain QUEUED. Consumption is triggered when Chef marks KOT items READY in KDS.
    }

    return createdTickets;
  }

  /**
   * Automatically deducts consumed Recipe BOM ingredients from Kitchen/Store stock balances
   * and records SALE_CONSUMPTION ledger entries in real time.
   */
  _deductOrderRecipeBOM(order, tenantId = null) {
    const targetTenantId = tenantId || (typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}').tenantId : null) || 'tenant_h0qc7wf';
    const stockBalances = offlineStore.getCollection('stock_balances', targetTenantId) || [];
    const stockTxns = offlineStore.getCollection('stock_transactions', targetTenantId) || [];
    const now = new Date().toISOString();
    const dg = this._getDataGateway();

    let balancesChanged = false;

    (order.items || []).forEach(item => {
      // 1. Resolve exact line item BOM via Resolved BOM Engine
      const resolved = resolvedBomEngine.resolveOrderLineBOM(item, targetTenantId);
      
      // 2. Attach immutable resolvedConsumption snapshot on the order line
      item.resolvedConsumption = resolved.consumption;
      item.bomVersionId = resolved.bomVersionId;
      item.variantName = resolved.variantName;

      // 3. Deduct each resolved raw material, prep ingredient, and packaging item
      (resolved.consumption || []).forEach(cLine => {
        const ingCode = String(cLine.inventoryItemCode || '');
        const ingName = cLine.inventoryItemName || ingCode;
        const totalDeductQty = parseFloat(cLine.quantity) || 0;

        if (totalDeductQty > 0 && (ingCode || ingName)) {
          const norm = (s) => String(s || '').toUpperCase().trim().replace(/^(PREP-|RCP-|INV-|ITEM-|MENU-)/, '').replace(/[-_]/g, '');
          const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

          const isMatch = (bal) => {
            const bCode = norm(bal.itemCode || bal.item_code || bal.id);
            const tCode = norm(ingCode);
            if (bCode && tCode) {
              if (bCode === tCode || bCode.includes(tCode) || tCode.includes(bCode)) return true;
            }
            const bName = normName(bal.itemName || bal.inventoryItemName);
            const tName = normName(ingName);
            if (bName && tName && (bName.length > 3 || tName.length > 3)) {
              if (bName === tName || bName.includes(tName) || tName.includes(bName)) return true;
            }
            return false;
          };

            // 1. Find stock balance in Kitchen Store (LOC-886 / LOC-KIT)
            let balIdx = stockBalances.findIndex(s => {
              const loc = String(s.locationCode || s.location_code || '').toUpperCase().trim();
              const isKit = loc === 'LOC-886' || loc === 'LOC-KIT' || loc === 'LOC-901' || loc === 'LOC-KITCHEN' || loc === 'KITCHEN_STORE';
              return isMatch(s) && isKit;
            });

            // 2. If not found in kitchen store, find in any location (e.g. Main Store LOC-805)
            if (balIdx === -1) {
              balIdx = stockBalances.findIndex(s => isMatch(s));
            }

            if (balIdx >= 0) {
              const matchedBal = stockBalances[balIdx];
              const cur = parseFloat(matchedBal.quantity !== undefined ? matchedBal.quantity : (matchedBal.currentStock !== undefined ? matchedBal.currentStock : 0));
              const newQty = Math.max(0, parseFloat((cur - totalDeductQty).toFixed(4)));
              matchedBal.quantity = newQty;
              matchedBal.currentStock = newQty;
              matchedBal.updatedAt = now;

              const unitCost = parseFloat(matchedBal.unit_cost || matchedBal.unitCost || 0);
              if (unitCost > 0) {
                matchedBal.valuation = parseFloat((newQty * unitCost).toFixed(2));
              }
              balancesChanged = true;

              if (dg) {
                dg.update('stock_balances', matchedBal.id || matchedBal.itemCode, matchedBal).catch(e => console.warn('[productionRoutingEngine] Cloud stock_balances update error:', e.message));
              }

              console.log(`[productionRoutingEngine] 📦 Auto-deducted ${totalDeductQty} ${cLine.uom || 'KG'} of ${matchedBal.itemCode || ingCode} (${ingName}) from ${matchedBal.locationCode}. Previous: ${cur}, New: ${newQty}`);

              // Append stock transaction ledger entry
              const txn = {
                id: `txn-sale-${Math.random().toString(36).substring(2, 9)}`,
                referenceNo: order.orderNumber || order.orderId || order.id,
                transactionType: 'SALE_CONSUMPTION',
                itemCode: matchedBal.itemCode || ingCode,
                itemName: ingName,
                locationCode: matchedBal.locationCode || 'LOC-886',
                quantity: -totalDeductQty,
                uom: cLine.uom || 'KG',
                notes: `Order ${order.orderNumber || order.id} BOM deduction for ${item.name || item.itemName}`,
                timestamp: now,
                tenantId: targetTenantId
              };
              stockTxns.unshift(txn);
              if (dg) {
                dg.create('stock_transactions', txn).catch(() => {});
              }
            } else {
              console.warn(`[productionRoutingEngine] ⚠️ No stock balance record found to deduct ${totalDeductQty} ${cLine.uom || 'KG'} for ingredient "${ingName}" (${ingCode})`);
            }
          }
        });
      });

    if (balancesChanged) {
      offlineStore.setCollection('stock_balances', stockBalances);
      offlineStore.setCollection('stock_transactions', stockTxns);

      // Broadcast real-time stock balance updates
      platformEventBus.publish('stock:balance:updated', { tenantId: targetTenantId });
      platformEventBus.publish('inventory:updated', { tenantId: targetTenantId });
      this._broadcastChange('STOCK_BALANCE_UPDATED', { tenantId: targetTenantId });
      console.log(`[productionRoutingEngine] 📦 Auto-deducted inventory BOM for Order ${order.orderNumber || order.id}`);
    }
  }

  /**
   * Cancelled/voided lines are removed from production truth: they never block
   * status aggregation and never accept further station transitions.
   */
  _isRemovedItem(item) {
    const s = String((item && (item.itemStatus || item.status)) || '').toUpperCase();
    return s === 'CANCELLED' || s === 'VOIDED';
  }

  /**
   * Recalculate ticket status based on items status:
   * - All items SERVED => SERVED
   * - All items READY/SERVED => READY
   * - Any item PREPARING/READY => PREPARING
   * - Otherwise => QUEUED
   * CANCELLED/VOIDED items are excluded (treated as removed, not blockers).
   * @param {Object} ticket
   * @returns {string} Calculated status
   */
  _computeTicketStatus(ticket) {
    const items = (ticket.items || []).filter(i => !this._isRemovedItem(i));
    if (!items.length) {
      const hadItems = (ticket.items || []).length > 0;
      return hadItems ? 'CANCELLED' : (ticket.status || 'QUEUED');
    }

    const allServed = items.every(i => (i.itemStatus || i.status) === 'SERVED');
    if (allServed) return 'SERVED';

    const allReady = items.every(i => (i.itemStatus || i.status) === 'READY' || (i.itemStatus || i.status) === 'SERVED');
    if (allReady) return 'READY';

    // Entire ticket moves to PREPARING only when ALL items are being prepared (or ready/served)
    const allPreparingOrBetter = items.every(i => (i.itemStatus || i.status) === 'PREPARING' || (i.itemStatus || i.status) === 'READY' || (i.itemStatus || i.status) === 'SERVED');
    if (allPreparingOrBetter) return 'PREPARING';

    return 'QUEUED';
  }

  /**
   * Update individual item status inside a ticket.
   * Automatically recalculates the overall ticket status and syncs to Supabase.
   * @param {string} ticketId
   * @param {string|number} lineItemIdOrIndex
   * @param {string} newStatus ('QUEUED'|'PREPARING'|'READY'|'SERVED')
   * @param {string|null} tenantId
   * @returns {Object|null} { ticket, item }
   */
  updateTicketItemStatus(ticketId, lineItemIdOrIndex, newStatus, tenantId = null) {
    const targetTenantId = tenantId || (typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}').tenantId : null);
    const now = new Date().toISOString();

    // 1. Update in offlineStore tickets collection
    const tickets = offlineStore.getCollection('tickets', targetTenantId) || [];
    const tIdx = tickets.findIndex(t => t.ticketId === ticketId || t.id === ticketId);
    let updatedTicket = null;
    let updatedItem = null;

    if (tIdx >= 0) {
      const ticket = tickets[tIdx];
      const items = ticket.items || [];
      const item = items.find((it, idx) => it.lineItemId === lineItemIdOrIndex || it.itemId === lineItemIdOrIndex || idx === lineItemIdOrIndex || String(idx) === String(lineItemIdOrIndex));
      if (item) {
        // Station transitions are rejected on cancelled/voided lines (cancellation workflow).
        if (this._isRemovedItem(item)) {
          console.warn('[productionRoutingEngine] Transition rejected on removed line:', item.lineItemId, item.itemStatus || item.status);
          return { ticket: null, item: null, rejected: 'LINE_REMOVED' };
        }
        const prevStatus = item.itemStatus || item.status;
        item.itemStatus = newStatus;
        item.status = newStatus;
        if (newStatus === 'READY') item.readyAt = now;
        if (newStatus === 'SERVED') item.servedAt = now;
        updatedItem = { ...item, prevStatus };
      }
      ticket.status = this._computeTicketStatus(ticket);
      ticket.updatedAt = now;
      updatedTicket = ticket;
      offlineStore.setCollection('tickets', tickets);
    }

    // 2. Update embedded ticket in parent order
    const orders = orderModel.getOrders(targetTenantId);
    const targetOrderId = updatedTicket?.orderId || ticketId;
    const targetOrderNum = updatedTicket?.orderNumber;

    let targetOrder = orders.find(o => 
      (targetOrderId && (o.id === targetOrderId || o.orderId === targetOrderId)) ||
      (targetOrderNum && (o.orderNumber === targetOrderNum || o.order_number === targetOrderNum))
    );

    if (!targetOrder) {
      targetOrder = orders.find(o => {
        const oTickets = Array.isArray(o.tickets) ? o.tickets : (o.data?.tickets || []);
        return oTickets.some(t => t.ticketId === ticketId || t.id === ticketId);
      });
    }

    if (targetOrder) {
      const orderTickets = Array.isArray(targetOrder.tickets) ? [...targetOrder.tickets] : [...(targetOrder.data?.tickets || [])];
      const matchIdx = orderTickets.findIndex(t => t.ticketId === ticketId || t.id === ticketId);

      if (matchIdx >= 0) {
        const ticket = orderTickets[matchIdx];
        const items = ticket.items || [];
        const item = items.find((it, idx) => it.lineItemId === lineItemIdOrIndex || it.itemId === lineItemIdOrIndex || idx === lineItemIdOrIndex || String(idx) === String(lineItemIdOrIndex));
        if (item && !this._isRemovedItem(item)) {
          const prevStatus = item.itemStatus || item.status;
          item.itemStatus = newStatus;
          item.status = newStatus;
          if (newStatus === 'READY') item.readyAt = now;
          if (newStatus === 'SERVED') item.servedAt = now;
          if (!updatedItem) updatedItem = { ...item, prevStatus };
        }
        ticket.status = this._computeTicketStatus(ticket);
        ticket.updatedAt = now;
        if (!updatedTicket) updatedTicket = ticket;
      } else if (updatedTicket) {
        orderTickets.push(updatedTicket);
      }

      // Synchronize matching item in order.items
      const orderItem = (targetOrder.items || []).find(i => 
        (updatedItem && updatedItem.lineItemId && i.lineItemId === updatedItem.lineItemId) ||
        (updatedItem && (updatedItem.itemId || updatedItem.itemCode) && (i.itemId === (updatedItem.itemId || updatedItem.itemCode) || i.itemCode === (updatedItem.itemId || updatedItem.itemCode))) ||
        (i.lineItemId === lineItemIdOrIndex || i.itemId === lineItemIdOrIndex)
      );
      if (orderItem && !this._isRemovedItem(orderItem)) {
        orderItem.itemStatus = newStatus;
        orderItem.status = newStatus;
      }

      const sId = targetOrder.sessionId || targetOrder.session_id || targetOrder.data?.sessionId || targetOrder.data?.session_id || updatedTicket?.sessionId;
      if (sId) {
        targetOrder.sessionId = sId;
        targetOrder.session_id = sId;
      }
      targetOrder.tickets = orderTickets;
      targetOrder.status = this._computeOrderStatus(targetOrder);
      targetOrder.orderStatus = targetOrder.status;
      targetOrder.data = {
        ...(targetOrder.data || {}),
        sessionId: sId,
        session_id: sId,
        tableNumber: targetOrder.tableNumber || targetOrder.table_number || targetOrder.data?.tableNumber,
        table_number: targetOrder.tableNumber || targetOrder.table_number || targetOrder.data?.table_number,
        tableCode: targetOrder.tableCode || targetOrder.table_code || targetOrder.data?.tableCode,
        table_code: targetOrder.tableCode || targetOrder.table_code || targetOrder.data?.table_code,
        tableId: targetOrder.tableId || targetOrder.table_id || targetOrder.data?.tableId,
        table_id: targetOrder.tableId || targetOrder.table_id || targetOrder.data?.table_id,
        waiterId: targetOrder.waiterId || targetOrder.waiter_id || targetOrder.data?.waiterId,
        orderNumber: targetOrder.orderNumber || targetOrder.order_number || targetOrder.data?.orderNumber,
        order_number: targetOrder.orderNumber || targetOrder.order_number || targetOrder.data?.order_number,
        tickets: orderTickets,
        items: targetOrder.items,
        status: targetOrder.status,
        orderStatus: targetOrder.status
      };
      targetOrder.updatedAt = now;

      offlineStore.setCollection('orders', orders);

      const dg = this._getDataGateway();
      if (dg) {
        dg.update('orders', targetOrder.id || targetOrder.orderId, targetOrder).catch(e => console.warn('[productionRoutingEngine] Item status cloud sync error:', e.message));
      }
    }

    if (updatedTicket) {
      if (updatedItem) {
        const isBarTicket = updatedTicket.ticketType === 'BOT' || updatedTicket.destination === 'BAR';
        const actor = isBarTicket ? 'Bartender' : 'Chef';

        const prevItemStatus = updatedItem.prevStatus;

        // Deduct on READY (normal flow) and also on a direct SERVED transition (waiter serve-all without
        // bartender READY). Operation-id idempotency in the consumption service prevents double deduction.
        if ((newStatus === 'READY' || newStatus === 'SERVED') && prevItemStatus !== 'READY' && prevItemStatus !== 'SERVED') {
          if (updatedItem.fulfilledByHoldId) {
            // Reuse path (Model B): the line is fulfilled by a HELD prepared item, so the
            // BOM was already consumed at the original READY - skip a second consumption
            // and close out the hold instead.
            preparedHoldModel.confirmReuseOnReady(updatedItem.fulfilledByHoldId, {
              orderId: updatedTicket.orderId || updatedTicket.id,
              orderLineId: updatedItem.lineItemId || updatedItem.itemId || lineItemIdOrIndex,
              ticketId,
              actor: { id: actor }
            }, targetTenantId);
          } else {
            inventoryConsumptionService.consumeForOrderLine({
              tenantId: targetTenantId,
              orderId: updatedTicket.orderId || updatedTicket.id,
              orderLineId: updatedItem.lineItemId || updatedItem.itemId || lineItemIdOrIndex,
              item: updatedItem,
              occurredAt: now,
              performedBy: actor
            }).catch(err => {
              console.error('[productionRoutingEngine] Error during sale consumption for item READY:', err);
            });
          }
        } else if (newStatus === 'PREPARING' && prevItemStatus === 'READY') {
          inventoryConsumptionService.reverseConsumptionForOrderLine({
            tenantId: targetTenantId,
            orderId: updatedTicket.orderId || updatedTicket.id,
            orderLineId: updatedItem.lineItemId || updatedItem.itemId || lineItemIdOrIndex,
            reason: isBarTicket ? 'BDS_UNDO_READY' : 'KDS_UNDO_READY',
            occurredAt: now,
            performedBy: actor
          }).catch(err => {
            console.error('[productionRoutingEngine] Error during sale reversal on Undo:', err);
          });
        }
      }

      this._broadcastChange('TICKET_ITEM_UPDATE', updatedTicket);

      platformEventBus.publish('ticket:item_status_changed', {
        ticketId,
        lineItemId: lineItemIdOrIndex,
        itemStatus: newStatus,
        item: updatedItem,
        ticket: updatedTicket
      });

      platformEventBus.publish('ticket:status_changed', {
        ticketId,
        status: updatedTicket.status,
        ticket: updatedTicket
      });
    }

    return { ticket: updatedTicket, item: updatedItem };
  }

  /**
   * Update KOT/BOT ticket status across all stores and Supabase.
   * Also cascades the status to all items inside the ticket.
   * @param {string} ticketId
   * @param {string} newStatus ('QUEUED'|'PREPARING'|'READY'|'SERVED')
   * @param {string|null} tenantId
   * @returns {Object|null}
   */
  updateTicketStatus(ticketId, newStatus, tenantId = null) {
    const targetTenantId = tenantId || (typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}').tenantId : null);
    const now = new Date().toISOString();

    // 1. Update in offlineStore tickets collection
    const tickets = offlineStore.getCollection('tickets', targetTenantId) || [];
    const tIdx = tickets.findIndex(t => t.ticketId === ticketId || t.id === ticketId);
    let updatedTicket = null;

    let itemsToDeduct = [];
    let itemsToReverse = [];
    let itemsToReuseHold = [];
    if (tIdx >= 0) {
      tickets[tIdx].status = newStatus;
      tickets[tIdx].updatedAt = now;
      (tickets[tIdx].items || []).forEach(it => {
        if (this._isRemovedItem(it)) return; // cancelled lines drop out of the cascade
        const prevItemStatus = it.itemStatus || it.status;
        it.itemStatus = newStatus;
        it.status = newStatus;
        if (newStatus === 'READY') it.readyAt = now;
        if (newStatus === 'SERVED') it.servedAt = now;
        // Deduct on first entry into READY or SERVED (direct SERVED must not escape consumption)
        if ((newStatus === 'READY' || newStatus === 'SERVED') && prevItemStatus !== 'READY' && prevItemStatus !== 'SERVED') {
          if (it.fulfilledByHoldId) itemsToReuseHold.push(it);
          else itemsToDeduct.push(it);
        }
        if (newStatus === 'PREPARING' && prevItemStatus === 'READY') {
          itemsToReverse.push(it);
        }
      });
      updatedTicket = tickets[tIdx];
      offlineStore.setCollection('tickets', tickets);
    }

    // 2. Update embedded ticket in parent order
    const orders = orderModel.getOrders(targetTenantId);
    const targetOrderId = updatedTicket?.orderId || ticketId;
    const targetOrderNum = updatedTicket?.orderNumber;

    let targetOrder = orders.find(o => 
      (targetOrderId && (o.id === targetOrderId || o.orderId === targetOrderId)) ||
      (targetOrderNum && (o.orderNumber === targetOrderNum || o.order_number === targetOrderNum))
    );

    if (!targetOrder) {
      targetOrder = orders.find(o => {
        const oTickets = Array.isArray(o.tickets) ? o.tickets : (o.data?.tickets || []);
        return oTickets.some(t => t.ticketId === ticketId || t.id === ticketId);
      });
    }

    if (targetOrder) {
      const orderTickets = Array.isArray(targetOrder.tickets) ? [...targetOrder.tickets] : [...(targetOrder.data?.tickets || [])];
      const matchIdx = orderTickets.findIndex(t => t.ticketId === ticketId || t.id === ticketId);

      if (matchIdx >= 0) {
        orderTickets[matchIdx].status = newStatus;
        orderTickets[matchIdx].updatedAt = now;
        (orderTickets[matchIdx].items || []).forEach(it => {
          if (this._isRemovedItem(it)) return; // cancelled lines drop out of the cascade
          const prevItemStatus = it.itemStatus || it.status;
          it.itemStatus = newStatus;
          it.status = newStatus;
          if (newStatus === 'READY') it.readyAt = now;
          if (newStatus === 'SERVED') it.servedAt = now;
          if ((newStatus === 'READY' || newStatus === 'SERVED') && prevItemStatus !== 'READY' && prevItemStatus !== 'SERVED' && !itemsToDeduct.some(x => (x.lineItemId || x.itemId) === (it.lineItemId || it.itemId)) && !itemsToReuseHold.some(x => (x.lineItemId || x.itemId) === (it.lineItemId || it.itemId))) {
            if (it.fulfilledByHoldId) itemsToReuseHold.push(it);
            else itemsToDeduct.push(it);
          }
          if (newStatus === 'PREPARING' && prevItemStatus === 'READY' && !itemsToReverse.some(x => (x.lineItemId || x.itemId) === (it.lineItemId || it.itemId))) {
            itemsToReverse.push(it);
          }
        });
        if (!updatedTicket) updatedTicket = orderTickets[matchIdx];
      } else if (updatedTicket) {
        orderTickets.push(updatedTicket);
      }

      // Synchronize matching items in targetOrder.items
      (updatedTicket?.items || []).forEach(it => {
        const orderItem = (targetOrder.items || []).find(i => 
          (it.lineItemId && i.lineItemId === it.lineItemId) ||
          ((it.itemId || it.itemCode) && (i.itemId === (it.itemId || it.itemCode) || i.itemCode === (it.itemId || it.itemCode)))
        );
        if (orderItem && !this._isRemovedItem(orderItem)) {
          orderItem.itemStatus = newStatus;
          orderItem.status = newStatus;
        }
      });

      const sId2 = targetOrder.sessionId || targetOrder.session_id || targetOrder.data?.sessionId || targetOrder.data?.session_id || updatedTicket?.sessionId;
      if (sId2) {
        targetOrder.sessionId = sId2;
        targetOrder.session_id = sId2;
      }
      targetOrder.tickets = orderTickets;
      targetOrder.status = this._computeOrderStatus(targetOrder);
      targetOrder.orderStatus = targetOrder.status;
      targetOrder.data = {
        ...(targetOrder.data || {}),
        sessionId: sId2,
        session_id: sId2,
        tableNumber: targetOrder.tableNumber || targetOrder.table_number || targetOrder.data?.tableNumber,
        table_number: targetOrder.tableNumber || targetOrder.table_number || targetOrder.data?.table_number,
        tableCode: targetOrder.tableCode || targetOrder.table_code || targetOrder.data?.tableCode,
        table_code: targetOrder.tableCode || targetOrder.table_code || targetOrder.data?.table_code,
        tableId: targetOrder.tableId || targetOrder.table_id || targetOrder.data?.tableId,
        table_id: targetOrder.tableId || targetOrder.table_id || targetOrder.data?.table_id,
        waiterId: targetOrder.waiterId || targetOrder.waiter_id || targetOrder.data?.waiterId,
        orderNumber: targetOrder.orderNumber || targetOrder.order_number || targetOrder.data?.orderNumber,
        order_number: targetOrder.orderNumber || targetOrder.order_number || targetOrder.data?.order_number,
        tickets: orderTickets,
        items: targetOrder.items,
        status: targetOrder.status,
        orderStatus: targetOrder.status
      };
      targetOrder.updatedAt = now;

      offlineStore.setCollection('orders', orders);

      const dg = this._getDataGateway();
      if (dg) {
        dg.update('orders', targetOrder.id || targetOrder.orderId, targetOrder).catch(e => console.warn('[productionRoutingEngine] Ticket status cloud sync error:', e.message));
      }
    }

    if (updatedTicket) {
      const isBarTicket = updatedTicket.ticketType === 'BOT' || updatedTicket.destination === 'BAR';
      const actor = isBarTicket ? 'Bartender' : 'Chef';

      if (itemsToDeduct.length > 0) {
        itemsToDeduct.forEach(it => {
          inventoryConsumptionService.consumeForOrderLine({
            tenantId: targetTenantId,
            orderId: updatedTicket.orderId || updatedTicket.id,
            orderLineId: it.lineItemId || it.itemId,
            item: it,
            occurredAt: now,
            performedBy: actor
          }).catch(err => {
            console.error('[productionRoutingEngine] Error during ticket sale consumption:', err);
          });
        });
      }

      // Hold-fulfilled lines skip a second BOM consumption; just close out the hold.
      itemsToReuseHold.forEach(it => {
        preparedHoldModel.confirmReuseOnReady(it.fulfilledByHoldId, {
          orderId: updatedTicket.orderId || updatedTicket.id,
          orderLineId: it.lineItemId || it.itemId,
          ticketId,
          actor: { id: actor }
        }, targetTenantId);
      });

      if (itemsToReverse.length > 0) {
        itemsToReverse.forEach(it => {
          inventoryConsumptionService.reverseConsumptionForOrderLine({
            tenantId: targetTenantId,
            orderId: updatedTicket.orderId || updatedTicket.id,
            orderLineId: it.lineItemId || it.itemId,
            reason: isBarTicket ? 'BDS_UNDO_READY' : 'KDS_UNDO_READY',
            occurredAt: now,
            performedBy: actor
          }).catch(err => {
            console.error('[productionRoutingEngine] Error during ticket sale reversal:', err);
          });
        });
      }

      this._broadcastChange('TICKET_ITEM_UPDATE', updatedTicket);

      platformEventBus.publish('ticket:status_changed', {
        ticketId,
        status: newStatus,
        ticket: updatedTicket
      });
    }

    return updatedTicket;
  }

  _computeTicketStatus(ticket) {
    const allItems = ticket?.items || [];
    const items = allItems.filter(it => !this._isRemovedItem(it));
    if (!items.length) {
      return allItems.length ? 'CANCELLED' : (ticket?.status || 'QUEUED');
    }
    const statuses = items.map(it => it.itemStatus || it.status || 'QUEUED');
    if (statuses.every(s => s === 'SERVED')) return 'SERVED';
    if (statuses.every(s => s === 'READY' || s === 'SERVED')) return 'READY';
    if (statuses.some(s => s === 'READY' || s === 'SERVED')) return 'PARTIALLY_READY';
    if (statuses.some(s => s === 'PREPARING')) return 'PREPARING';
    return 'QUEUED';
  }

  _computeOrderStatus(order) {
    const rawItems = (order?.items && order.items.length > 0)
      ? order.items
      : (order?.tickets || []).flatMap(t => t.items || []);
    const allItems = rawItems.filter(it => !this._isRemovedItem(it));

    if (!allItems.length) {
      if (rawItems.length) return 'CANCELLED';
      return order?.status || order?.orderStatus || 'CONFIRMED';
    }
    const statuses = allItems.map(it => it.itemStatus || it.status || 'QUEUED');
    if (statuses.every(s => s === 'SERVED')) return 'SERVED';
    if (statuses.every(s => s === 'READY' || s === 'SERVED')) return 'READY';
    if (statuses.some(s => s === 'READY' || s === 'SERVED')) return 'PARTIALLY_READY';
    if (statuses.some(s => s === 'PREPARING')) return 'IN_PRODUCTION';
    return 'CONFIRMED';
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

export const productionRoutingEngine = new ProductionRoutingEngine();

