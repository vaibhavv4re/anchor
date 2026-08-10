/**
 * BusinessOS Platform - Order & Ticket Data Model
 * Manages Orders, Order Items, Draft Building, KOT & BOT ticket objects.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

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
   * Create a new Confirmed Order entity.
   */
  createOrder({ sessionId, tableNumber, waiterId, items, subtotal }) {
    const correlationId = 'CID-' + Math.floor(10000 + Math.random() * 90000);
    const orderId = 'ord_' + Math.random().toString(36).substring(2, 9);

    const orderRecord = {
      orderId,
      sessionId,
      tableNumber: parseInt(tableNumber),
      waiterId,
      items: items.map((it, idx) => ({
        lineItemId: `line_${orderId}_${idx + 1}`,
        itemId: it.itemId,
        name: it.name,
        price: it.price,
        quantity: it.quantity,
        selectedModifiers: it.selectedModifiers || [],
        notes: it.notes || '',
        itemStatus: 'QUEUED' // QUEUED -> PREPARING -> READY -> SERVED
      })),
      subtotal,
      orderStatus: 'CONFIRMED', // DRAFT -> CONFIRMED -> IN_PRODUCTION -> PARTIALLY_READY -> READY -> SERVED -> CLOSED
      createdAt: new Date().toISOString(),
      correlationId
    };

    offlineStore.appendItem('orders', orderRecord);

    platformEventBus.publish('order:confirmed', {
      orderId: orderRecord.orderId,
      sessionId: orderRecord.sessionId,
      tableNumber: orderRecord.tableNumber,
      waiterId: orderRecord.waiterId,
      subtotal: orderRecord.subtotal,
      correlationId: orderRecord.correlationId,
      timestamp: orderRecord.createdAt
    });

    return orderRecord;
  }

  getOrder(orderId) {
    const orders = offlineStore.getCollection('orders') || [];
    return orders.find(o => o.orderId === orderId) || null;
  }

  getOrdersForSession(sessionId) {
    const orders = offlineStore.getCollection('orders') || [];
    return orders.filter(o => o.sessionId === sessionId);
  }

  getAllTickets() {
    return offlineStore.getCollection('tickets') || [];
  }

  getTicketsForSession(sessionId) {
    const tickets = this.getAllTickets();
    return tickets.filter(t => t.sessionId === sessionId);
  }
}

export const orderModel = new OrderModel();
