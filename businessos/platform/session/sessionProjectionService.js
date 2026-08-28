/**
 * BusinessOS Platform - Session Projection Service (Recommendation 3.5 & PD-006)
 * Generates frozen SessionProjection objects for Waiter, Manager, Kitchen, and Cashier screens.
 * Emits session:projection:updated for CQRS real-time UI broadcast.
 */

import { sessionModel } from './sessionModel.js';
import { orderModel } from '../ordering/orderModel.js';
import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

class SessionProjectionService {
  constructor() {
    this._initSubscribers();
  }

  _initSubscribers() {
    platformEventBus.subscribe('session:created', (envelope) => {
      const payload = envelope.payload || envelope;
      const projection = this.getSessionProjection(payload.sessionId);
      if (projection) platformEventBus.publish('session:projection:updated', projection);
    });

    platformEventBus.subscribe('session:milestone:changed', (envelope) => {
      const payload = envelope.payload || envelope;
      const projection = this.getSessionProjection(payload.sessionId);
      if (projection) platformEventBus.publish('session:projection:updated', projection);
    });

    platformEventBus.subscribe('order:confirmed', (envelope) => {
      const payload = envelope.payload || envelope;
      if (payload.sessionId) {
        const projection = this.getSessionProjection(payload.sessionId);
        if (projection) platformEventBus.publish('session:projection:updated', projection);
      }
    });

    platformEventBus.subscribe('ticket:status_changed', (envelope) => {
      const payload = envelope.payload || envelope;
      const ticket = payload.ticket;
      if (ticket && ticket.sessionId) {
        const projection = this.getSessionProjection(ticket.sessionId);
        if (projection) platformEventBus.publish('session:projection:updated', projection);
      }
    });

    platformEventBus.subscribe('ticket:item_status_changed', (envelope) => {
      const payload = envelope.payload || envelope;
      const ticket = payload.ticket;
      if (ticket && ticket.sessionId) {
        const projection = this.getSessionProjection(ticket.sessionId);
        if (projection) platformEventBus.publish('session:projection:updated', projection);
      }
    });
  }

  /**
   * Generates a frozen schema SessionProjection object with real order and ticket data.
   * @param {string} sessionId 
   * @param {string|null} tenantId 
   * @returns {Object|null} SessionProjection
   */
  getSessionProjection(sessionId, tenantId = null) {
    const session = sessionModel.getSession(sessionId, tenantId);
    if (!session) return null;

    const targetTenantId = session.tenantId || tenantId;
    const employees = offlineStore.getCollection('employees', targetTenantId) || offlineStore.getCollection('employees') || [];
    const waiter = session.assignedWaiterId 
      ? employees.find(e => e.id === session.assignedWaiterId || e.employeeId === session.assignedWaiterId || e.name === session.assignedWaiterId || e.employee_code === session.assignedWaiterId) 
      : null;

    const orders = orderModel.getOrdersForSession(session.id || session.sessionId, targetTenantId);
    const tickets = orderModel.getTicketsForSession(session.id || session.sessionId, targetTenantId);

    const foodItems = [];
    const drinkItems = [];
    const readyItems = [];
    const preparingItems = [];
    const queuedItems = [];
    const servedItems = [];

    // Extract items from dispatched tickets
    tickets.forEach(t => {
      (t.items || []).forEach(item => {
        const itemStatus = item.itemStatus || item.status || t.status || 'QUEUED';
        const createdAt = t.createdAt || session.createdAt || new Date().toISOString();
        const elapsedMins = Math.max(0, Math.floor((new Date() - new Date(createdAt)) / 60000));

        const entry = {
          lineItemId: item.lineItemId || item.itemId || `${t.id}_${item.name}`,
          itemId: item.itemId,
          name: item.name || item.itemName || 'Dish',
          quantity: item.quantity || item.qty || 1,
          status: itemStatus,
          itemStatus: itemStatus,
          ticketId: t.ticketId || t.id,
          ticketType: t.ticketType,
          stationName: item.stationName || t.destination || 'KITCHEN',
          createdAt,
          elapsedMinutes: elapsedMins,
          notes: item.notes || '',
          isReady: itemStatus === 'READY',
          isPreparing: itemStatus === 'PREPARING',
          isQueued: itemStatus === 'QUEUED',
          isServed: itemStatus === 'SERVED'
        };

        if (t.ticketType === 'BOT' || t.destination === 'BAR' || item.routing === 'BAR_LINE') {
          drinkItems.push(entry);
        } else {
          foodItems.push(entry);
        }

        if (itemStatus === 'READY') {
          readyItems.push(entry);
        } else if (itemStatus === 'PREPARING') {
          preparingItems.push(entry);
        } else if (itemStatus === 'QUEUED') {
          queuedItems.push(entry);
        } else if (itemStatus === 'SERVED') {
          servedItems.push(entry);
        }
      });
    });

    // Fallback: extract from raw orders if tickets have not been split
    if (!foodItems.length && !drinkItems.length) {
      orders.forEach(o => {
        (o.items || []).forEach(item => {
          const itemStatus = item.itemStatus || o.orderStatus || 'CONFIRMED';
          const entry = {
            lineItemId: item.lineItemId || item.itemId,
            itemId: item.itemId,
            name: item.name || item.itemName || 'Dish',
            quantity: item.quantity || 1,
            status: itemStatus,
            itemStatus: itemStatus,
            stationName: item.routing === 'BAR_LINE' ? 'BAR' : 'KITCHEN',
            notes: item.notes || '',
            isReady: itemStatus === 'READY',
            isPreparing: itemStatus === 'PREPARING',
            isQueued: itemStatus === 'QUEUED' || itemStatus === 'CONFIRMED',
            isServed: itemStatus === 'SERVED'
          };
          if (item.routing === 'BAR_LINE' || item.category === 'BEVERAGES & BAR') {
            drinkItems.push(entry);
          } else {
            foodItems.push(entry);
          }
          if (itemStatus === 'READY') {
            readyItems.push(entry);
          } else if (itemStatus === 'SERVED') {
            servedItems.push(entry);
          }
        });
      });
    }

    // Build consolidated itemized list from all orders in session
    const itemizedList = [];
    orders.forEach(o => {
      (o.items || []).forEach(item => {
        const itemPrice = parseFloat(item.price || item.unitPrice || item.sellingPrice || 0);
        const itemQty = parseInt(item.quantity || item.qty || 1, 10);
        const lineTotal = parseFloat(item.lineTotal || item.total || (itemPrice * itemQty));
        itemizedList.push({
          lineItemId: item.lineItemId || item.itemId || `${o.id}_${item.name}`,
          itemId: item.itemId,
          name: item.name || item.itemName || 'Dish',
          price: itemPrice,
          quantity: itemQty,
          lineTotal,
          orderId: o.orderId || o.id,
          status: item.itemStatus || o.orderStatus || 'CONFIRMED'
        });
      });
    });

    const subtotal = orders.reduce((sum, o) => sum + (parseFloat(o.subtotal || o.totalAmount || o.total_amount) || 0), 0);
    const cgstAmount = Math.round(subtotal * 0.025 * 100) / 100;
    const sgstAmount = Math.round(subtotal * 0.025 * 100) / 100;
    const taxAmount = cgstAmount + sgstAmount;
    const grandTotal = subtotal + taxAmount;

    const guestNotes = session.guestNotes || session.notes || '';
    const dietaryTags = session.dietaryTags || [];
    const celebrationFlag = session.celebrationFlag || null;

    const createdAt = session.createdAt ? new Date(session.createdAt) : new Date();
    const elapsedMinutes = Math.max(0, Math.floor((new Date() - createdAt) / 60000));
    const elapsedTime = `${elapsedMinutes} min`;

    const isPartiallyReady = readyItems.length > 0 && (preparingItems.length > 0 || queuedItems.length > 0);
    const isFullyReady = readyItems.length > 0 && preparingItems.length === 0 && queuedItems.length === 0;

    let guestScript = 'Order is in queue.';
    if (isFullyReady) {
      guestScript = 'All ordered dishes are ready for table service!';
    } else if (isPartiallyReady) {
      guestScript = `${readyItems.length} dish${readyItems.length !== 1 ? 'es are' : ' is'} ready for pickup, and remaining dishes are being prepared.`;
    } else if (preparingItems.length > 0) {
      guestScript = `${preparingItems.length} dish${preparingItems.length !== 1 ? 'es are' : ' is'} currently being prepared in the kitchen.`;
    } else if (queuedItems.length > 0) {
      guestScript = `Order confirmed and queued in kitchen.`;
    }

    return {
      sessionId: session.id || session.sessionId,
      tableId: session.tableId || `tbl_${session.tableNumber}`,
      tableNumber: session.tableNumber,
      tableCode: session.tableCode || `T-${String(session.tableNumber || 1).padStart(2, '0')}`,
      guestCount: session.guestCount || 2,
      waiter: {
        id: session.assignedWaiterId,
        name: waiter ? waiter.name : (session.assignedWaiterId || 'Staff')
      },
      status: session.status || 'GUESTS_SEATED',
      orderCount: orders.length,
      orders,
      tickets,
      foodItems,
      drinkItems,
      readyItems,
      preparingItems,
      queuedItems,
      servedItems,
      isPartiallyReady,
      isFullyReady,
      guestScript,
      itemizedList,
      subtotal,
      cgstAmount,
      sgstAmount,
      taxAmount,
      grandTotal,
      billStatus: session.status === 'BILL_GENERATED' ? 'GENERATED' : (session.status === 'PAYMENT_RECEIVED' || session.status === 'CLOSED' ? 'PAID' : 'NONE'),
      paymentStatus: session.status === 'PAYMENT_RECEIVED' || session.status === 'CLOSED' ? 'COMPLETED' : 'PENDING',
      elapsedTime,
      lastActivity: session.lastActivityAt || session.createdAt,
      guestNotes: session.guestNotes || '',
      dietaryTags: session.dietaryTags || [],
      celebrationFlag: session.celebrationFlag || null,
      tenantId: targetTenantId,
      correlationId: session.correlationId
    };
  }

  getActiveProjectionForTable(tableNumber, tenantId = null) {
    const activeSession = sessionModel.getActiveSessionForTable(tableNumber, tenantId);
    if (!activeSession) return null;
    return this.getSessionProjection(activeSession.id, tenantId);
  }
}

export const sessionProjectionService = new SessionProjectionService();
