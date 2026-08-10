/**
 * BusinessOS Platform - Automatic Production Routing Engine (PD-010)
 * Intercepts order:confirmed events, inspects Production Specifications (ProdSpec),
 * and automatically dispatches KOT (Kitchen) and BOT (Bar) tickets without waiter intervention.
 */

import { prodSpecModel, ProductionDestinations } from './prodSpecModel.js';
import { orderModel } from './orderModel.js';
import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

class ProductionRoutingEngine {
  constructor() {
    this._initSubscriber();
  }

  _initSubscriber() {
    // Intercept confirmed orders for automatic ticket splitting & routing
    platformEventBus.subscribe('order:confirmed', (envelope) => {
      this.routeOrderToProduction(envelope.payload.orderId);
    });
  }

  /**
   * Route order items to Kitchen (KOT) or Bar (BOT) based on Production Specs.
   */
  routeOrderToProduction(orderId) {
    const order = orderModel.getOrder(orderId);
    if (!order) return;

    const kitchenItems = [];
    const barItems = [];

    for (const lineItem of order.items) {
      const spec = prodSpecModel.getProdSpecForItem(lineItem.itemId);
      if (spec.destination === ProductionDestinations.BAR) {
        barItems.push({ ...lineItem, stationName: spec.stationName });
      } else {
        kitchenItems.push({ ...lineItem, stationName: spec.stationName });
      }
    }

    const createdTickets = [];

    // 1. Dispatch KOT (Kitchen Order Ticket) if kitchen items exist
    if (kitchenItems.length > 0) {
      const kotTicket = {
        ticketId: 'kot_' + Math.random().toString(36).substring(2, 9),
        ticketType: 'KOT',
        orderId: order.orderId,
        sessionId: order.sessionId,
        tableNumber: order.tableNumber,
        waiterId: order.waiterId,
        destination: ProductionDestinations.KITCHEN,
        items: kitchenItems,
        status: 'QUEUED', // QUEUED -> ACCEPTED -> PREPARING -> READY -> COLLECTED
        createdAt: new Date().toISOString(),
        correlationId: order.correlationId
      };
      offlineStore.appendItem('tickets', kotTicket);
      createdTickets.push(kotTicket);
      platformEventBus.publish('kot:dispatched', kotTicket);
    }

    // 2. Dispatch BOT (Bar Order Ticket) if bar items exist
    if (barItems.length > 0) {
      const botTicket = {
        ticketId: 'bot_' + Math.random().toString(36).substring(2, 9),
        ticketType: 'BOT',
        orderId: order.orderId,
        sessionId: order.sessionId,
        tableNumber: order.tableNumber,
        waiterId: order.waiterId,
        destination: ProductionDestinations.BAR,
        items: barItems,
        status: 'QUEUED', // QUEUED -> ACCEPTED -> PREPARING -> READY -> COLLECTED
        createdAt: new Date().toISOString(),
        correlationId: order.correlationId
      };
      offlineStore.appendItem('tickets', botTicket);
      createdTickets.push(botTicket);
      platformEventBus.publish('bot:dispatched', botTicket);
    }

    return createdTickets;
  }
}

export const productionRoutingEngine = new ProductionRoutingEngine();
