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

      const isBar = (lineItem.routing === 'BAR_LINE' || lineItem.routing === 'BAR') ||
        (menuItem && (menuItem.routing === 'BAR_LINE' || menuItem.routing === 'BAR' || menuItem.category === 'BEVERAGES' || menuItem.category === 'BAR')) ||
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

      // 4. Automatic Inventory Recipe BOM Deduction
      this._deductOrderRecipeBOM(order, targetTenantId);
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

              console.log(`[productionRoutingEngine] 📦 Auto-deducted ${totalDeductQty} ${ing.uom || 'KG'} of ${matchedBal.itemCode || ingCode} (${ingName}) from ${matchedBal.locationCode}. Previous: ${cur}, New: ${newQty}`);

              // Append stock transaction ledger entry
              const txn = {
                id: `txn-sale-${Math.random().toString(36).substring(2, 9)}`,
                referenceNo: order.orderNumber || order.orderId || order.id,
                transactionType: 'SALE_CONSUMPTION',
                itemCode: matchedBal.itemCode || ingCode,
                itemName: ingName,
                locationCode: matchedBal.locationCode || 'LOC-886',
                quantity: -totalDeductQty,
                uom: ing.uom || ing.baseUom || 'KG',
                notes: `Order ${order.orderNumber || order.id} BOM deduction for ${orderQty}x ${item.name || item.itemName}`,
                timestamp: now,
                tenantId: targetTenantId
              };
              stockTxns.unshift(txn);
              if (dg) {
                dg.create('stock_transactions', txn).catch(() => {});
              }
            } else {
              console.warn(`[productionRoutingEngine] ⚠️ No stock balance record found to deduct ${totalDeductQty} ${ing.uom || 'KG'} for ingredient "${ingName}" (${ingCode})`);
            }
          }
        });
      }
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
   * Recalculate ticket status based on items status:
   * - All items SERVED => SERVED
   * - All items READY/SERVED => READY
   * - Any item PREPARING/READY => PREPARING
   * - Otherwise => QUEUED
   * @param {Object} ticket
   * @returns {string} Calculated status
   */
  _computeTicketStatus(ticket) {
    const items = ticket.items || [];
    if (!items.length) return ticket.status || 'QUEUED';

    const allServed = items.every(i => (i.itemStatus || i.status) === 'SERVED');
    if (allServed) return 'SERVED';

    const allReady = items.every(i => (i.itemStatus || i.status) === 'READY' || (i.itemStatus || i.status) === 'SERVED');
    if (allReady) return 'READY';

    const anyInProgress = items.some(i => (i.itemStatus || i.status) === 'PREPARING' || (i.itemStatus || i.status) === 'READY');
    if (anyInProgress) return 'PREPARING';

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
      const item = items.find((it, idx) => it.lineItemId === lineItemIdOrIndex || it.itemId === lineItemIdOrIndex || idx === lineItemIdOrIndex);
      if (item) {
        item.itemStatus = newStatus;
        item.status = newStatus;
        if (newStatus === 'READY') item.readyAt = now;
        if (newStatus === 'SERVED') item.servedAt = now;
        updatedItem = item;
      }
      ticket.status = this._computeTicketStatus(ticket);
      ticket.updatedAt = now;
      updatedTicket = ticket;
      offlineStore.setCollection('tickets', tickets);
    }

    // 2. Update embedded ticket in parent order
    const orders = orderModel.getOrders(targetTenantId);
    for (const order of orders) {
      const orderTickets = Array.isArray(order.tickets) ? order.tickets : (order.data?.tickets || []);
      const matchIdx = orderTickets.findIndex(t => t.ticketId === ticketId || t.id === ticketId);
      if (matchIdx >= 0) {
        const ticket = orderTickets[matchIdx];
        const items = ticket.items || [];
        const item = items.find((it, idx) => it.lineItemId === lineItemIdOrIndex || it.itemId === lineItemIdOrIndex || idx === lineItemIdOrIndex);
        if (item) {
          item.itemStatus = newStatus;
          item.status = newStatus;
          if (newStatus === 'READY') item.readyAt = now;
          if (newStatus === 'SERVED') item.servedAt = now;
          if (!updatedItem) updatedItem = item;
        }
        ticket.status = this._computeTicketStatus(ticket);
        ticket.updatedAt = now;
        order.tickets = orderTickets;
        order.data = { ...(order.data || {}), tickets: orderTickets };
        order.updatedAt = now;
        if (!updatedTicket) updatedTicket = ticket;

        const dg = this._getDataGateway();
        if (dg) {
          dg.update('orders', order.id, order).catch(e => console.warn('[productionRoutingEngine] Item status cloud sync error:', e.message));
        }
        break;
      }
    }

    if (updatedTicket) {
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

    if (tIdx >= 0) {
      tickets[tIdx].status = newStatus;
      tickets[tIdx].updatedAt = now;
      (tickets[tIdx].items || []).forEach(it => {
        it.itemStatus = newStatus;
        it.status = newStatus;
        if (newStatus === 'READY') it.readyAt = now;
        if (newStatus === 'SERVED') it.servedAt = now;
      });
      updatedTicket = tickets[tIdx];
      offlineStore.setCollection('tickets', tickets);
    }

    // 2. Update embedded ticket in parent order
    const orders = orderModel.getOrders(targetTenantId);
    for (const order of orders) {
      const orderTickets = Array.isArray(order.tickets) ? order.tickets : (order.data?.tickets || []);
      const matchIdx = orderTickets.findIndex(t => t.ticketId === ticketId || t.id === ticketId);
      if (matchIdx >= 0) {
        orderTickets[matchIdx].status = newStatus;
        orderTickets[matchIdx].updatedAt = now;
        (orderTickets[matchIdx].items || []).forEach(it => {
          it.itemStatus = newStatus;
          it.status = newStatus;
          if (newStatus === 'READY') it.readyAt = now;
          if (newStatus === 'SERVED') it.servedAt = now;
        });
        order.tickets = orderTickets;
        order.data = { ...(order.data || {}), tickets: orderTickets };
        order.updatedAt = now;
        updatedTicket = orderTickets[matchIdx];

        const dg = this._getDataGateway();
        if (dg) {
          dg.update('orders', order.id, order).catch(e => console.warn('[productionRoutingEngine] Ticket status cloud sync error:', e.message));
        }
        break;
      }
    }

    if (updatedTicket) {
      this._broadcastChange('TICKET_ITEM_UPDATE', updatedTicket);

      platformEventBus.publish('ticket:status_changed', {
        ticketId,
        status: newStatus,
        ticket: updatedTicket
      });
    }

    return updatedTicket;
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

