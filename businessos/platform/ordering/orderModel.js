/**
 * BusinessOS Platform - Order & Ticket Data Model (PD-010 / K-08)
 * Manages Orders, Order Items, Draft Building, KOT & BOT ticket objects.
 * Integrates with DataGateway for cloud persistence to Supabase 'orders' table.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { productionRoutingEngine } from './productionRoutingEngine.js';

class OrderModel {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('orders')) {
      offlineStore.setCollection('orders', []);
    }
    if (!offlineStore.getCollection('tickets')) {
      offlineStore.setCollection('tickets', []);
    }
  }

  /**
   * Lazily resolve DataGateway from global app graph.
   * @returns {DataGateway|null}
   */
  _getDataGateway() {
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) {
      return window.__APP__.platform.dataGateway || null;
    }
    return null;
  }

  /**
   * Create a new Confirmed Order entity.
   * Persists to DataGateway ('orders' table in Supabase) with full item payloads.
   * Publishes 'order:confirmed' for automatic production routing.
   * @param {Object} data { sessionId, tableNumber, waiterId, items, subtotal, tenantId, orderNumber, notes }
   * @returns {Object} Confirmed order record
   */
  createOrder({ sessionId, tableNumber, waiterId, items, subtotal, tenantId = null, orderNumber = null, notes = '' }) {
    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
    const targetTenantId = tenantId || session.tenantId || 'tenant_h0qc7wf';
    const correlationId = 'CID-' + Math.floor(10000 + Math.random() * 90000);
    const orderId = 'ord_' + Math.random().toString(36).substring(2, 9);
    const now = new Date();
    const formattedOrderNo = orderNumber || `ORD-${now.getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
    const tableNum = parseInt(tableNumber) || 1;
    const tableCode = `T-${String(tableNum).padStart(2, '0')}`;

    const orderRecord = {
      id: orderId,
      orderId,
      tenantId: targetTenantId,
      tenant_id: targetTenantId,
      orderNumber: formattedOrderNo,
      order_number: formattedOrderNo,
      sessionId,
      session_id: sessionId,
      tableNumber: tableNum,
      tableCode,
      table_code: tableCode,
      waiterId: waiterId || session.employeeId || 'emp-waiter',
      items: (items || []).map((it, idx) => ({
        lineItemId: `line_${orderId}_${idx + 1}`,
        itemId: it.itemId || it.id || it.itemCode,
        itemCode: it.itemCode || it.itemId || it.id,
        name: it.name || it.itemName || 'Menu Item',
        itemName: it.name || it.itemName || 'Menu Item',
        price: parseFloat(it.price || it.sellingPrice) || 0,
        quantity: parseFloat(it.quantity) || 1,
        recipeId: it.recipeId || null,
        routing: it.routing || 'KITCHEN_LINE',
        category: it.category || 'FOOD',
        selectedModifiers: it.selectedModifiers || [],
        notes: it.notes || '',
        itemStatus: 'QUEUED' // QUEUED -> PREPARING -> READY -> SERVED
      })),
      subtotal: parseFloat(subtotal) || 0,
      totalAmount: parseFloat(subtotal) || 0,
      total_amount: parseFloat(subtotal) || 0,
      orderStatus: 'CONFIRMED', // DRAFT -> CONFIRMED -> IN_PRODUCTION -> PARTIALLY_READY -> READY -> SERVED -> CLOSED
      status: 'CONFIRMED',
      tickets: [], // Will be populated by productionRoutingEngine with KOT/BOT objects
      notes: notes || '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      correlationId
    };

    // 1. Write to local offline cache
    offlineStore.appendItem('orders', orderRecord);

    // 2. Persist to Supabase through DataGateway
    const dg = this._getDataGateway();
    if (dg) {
      dg.create('orders', orderRecord).catch(e => console.warn('[orderModel] Cloud order sync error:', e.message));
    }

    // 3. Dispatch confirmation event for Production Routing
    platformEventBus.publish('order:confirmed', {
      orderId: orderRecord.orderId,
      orderNumber: orderRecord.orderNumber,
      sessionId: orderRecord.sessionId,
      tableNumber: orderRecord.tableNumber,
      tableCode: orderRecord.tableCode,
      waiterId: orderRecord.waiterId,
      tenantId: orderRecord.tenantId,
      subtotal: orderRecord.subtotal,
      correlationId: orderRecord.correlationId,
      timestamp: orderRecord.createdAt,
      order: orderRecord
    });

    this._broadcastChange('CLOUD_MUTATION', { table: 'orders', operation: 'INSERT', record: orderRecord });

    return orderRecord;
  }

  /**
   * Retrieve order by ID (cross-checks DataGateway cache and local store)
   * @param {string} orderId
   * @param {string|null} tenantId
   * @returns {Object|null}
   */
  getOrder(orderId, tenantId = null) {
    const orders = this.getOrders(tenantId);
    return orders.find(o => o.orderId === orderId || o.id === orderId || o.orderNumber === orderId || o.order_number === orderId) || null;
  }

  /**
   * Retrieve all orders for tenant
   * @param {string|null} tenantId
   * @returns {Array<Object>}
   */
  getOrders(tenantId = null) {
    const targetTenantId = tenantId || (typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}').tenantId : null);
    const dg = this._getDataGateway();
    const dgList = dg ? dg.getCachedCollection('orders', targetTenantId) : [];
    const offList = offlineStore.getCollection('orders', targetTenantId) || [];

    const orderMap = new Map();
    [...offList, ...dgList].forEach(o => {
      if (o && (o.id || o.orderId)) {
        orderMap.set(o.id || o.orderId, o);
      }
    });
    return Array.from(orderMap.values());
  }

  /**
   * Retrieve orders for session
   * @param {string} sessionId
   * @param {string|null} tenantId
   * @returns {Array<Object>}
   */
  getOrdersForSession(sessionId, tenantId = null) {
    const orders = this.getOrders(tenantId);
    return orders.filter(o => o.sessionId === sessionId || o.session_id === sessionId);
  }

  /**
   * Retrieve all KOT/BOT tickets across orders and local tickets store.
   * Canonical single source of truth for KDS.
   * @param {string|null} tenantId
   * @returns {Array<Object>}
   */
  getAllTickets(tenantId = null) {
    const orders = this.getOrders(tenantId);
    const localTickets = offlineStore.getCollection('tickets', tenantId) || [];
    const ticketMap = new Map();

    // 1. Extract embedded tickets from orders
    orders.forEach(o => {
      const embedded = Array.isArray(o.tickets) ? o.tickets : (o.data?.tickets || []);
      embedded.forEach(t => {
        if (t && (t.ticketId || t.id)) {
          ticketMap.set(t.ticketId || t.id, {
            ...t,
            orderNumber: t.orderNumber || o.orderNumber || o.order_number || o.id,
            tableNumber: t.tableNumber || o.tableNumber,
            tableCode: t.tableCode || o.tableCode || o.table_code,
            sessionId: t.sessionId || o.sessionId || o.session_id,
            tenantId: t.tenantId || o.tenantId || o.tenant_id
          });
        }
      });
    });

    // 2. Merge local standalone tickets
    localTickets.forEach(t => {
      if (t && (t.ticketId || t.id)) {
        const id = t.ticketId || t.id;
        if (!ticketMap.has(id)) {
          let tableNumber = t.tableNumber;
          let tableCode = t.tableCode;
          let orderNumber = t.orderNumber;
          if (!tableNumber || !tableCode || !orderNumber) {
            const parentOrder = orders.find(o => o.id === t.orderId || o.orderId === t.orderId || (Array.isArray(o.tickets) && o.tickets.some(tk => (tk.ticketId || tk.id) === id)));
            if (parentOrder) {
              if (!tableNumber) tableNumber = parentOrder.tableNumber;
              if (!tableCode) tableCode = parentOrder.tableCode || parentOrder.table_code;
              if (!orderNumber) orderNumber = parentOrder.orderNumber || parentOrder.order_number;
            }
          }
          ticketMap.set(id, {
            ...t,
            tableNumber,
            tableCode,
            orderNumber
          });
        }
      }
    });

    return Array.from(ticketMap.values()).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  }

  /**
   * Retrieve tickets for session
   * @param {string} sessionId
   * @param {string|null} tenantId
   * @returns {Array<Object>}
   */
  getTicketsForSession(sessionId, tenantId = null) {
    const tickets = this.getAllTickets(tenantId);
    return tickets.filter(t => t.sessionId === sessionId || t.session_id === sessionId);
  }

  /**
   * Update order status and persist to Supabase
   * @param {string} orderId
   * @param {string} status
   * @param {string|null} tenantId
   * @returns {Object|null}
   */
  updateOrderStatus(orderId, status, tenantId = null) {
    const order = this.getOrder(orderId, tenantId);
    if (!order) return null;

    order.orderStatus = status;
    order.status = status;
    order.updatedAt = new Date().toISOString();

    const dg = this._getDataGateway();
    if (dg) {
      dg.update('orders', order.id, order).catch(e => console.warn('[orderModel] Cloud order update error:', e.message));
    }

    this._broadcastChange('CLOUD_MUTATION', { table: 'orders', operation: 'UPDATE', record: order });

    return order;
  }

  /**
   * Update status of an entire KOT/BOT ticket
   */
  updateTicketStatus(ticketId, status, tenantId = null) {
    return productionRoutingEngine.updateTicketStatus(ticketId, status, tenantId);
  }

  /**
   * Update status of an individual item inside a KOT/BOT ticket
   */
  updateTicketItemStatus(ticketId, itemId, status, tenantId = null) {
    return productionRoutingEngine.updateTicketItemStatus(ticketId, itemId, status, tenantId);
  }

  /**
   * Alias for updateTicketItemStatus for backwards-compatibility
   */
  updateItemStatusInTicket(ticketId, itemId, status, tenantId = null) {
    return productionRoutingEngine.updateTicketItemStatus(ticketId, itemId, status, tenantId);
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

export const orderModel = new OrderModel();

