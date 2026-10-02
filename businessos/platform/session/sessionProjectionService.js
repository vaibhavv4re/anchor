/**
 * BusinessOS Platform - Session Projection Service (Recommendation 3.5 & PD-006)
 * Generates frozen SessionProjection objects for Waiter, Manager, Kitchen, and Cashier screens.
 * Emits session:projection:updated for CQRS real-time UI broadcast.
 */

import { sessionModel } from './sessionModel.js';
import { orderModel } from '../ordering/orderModel.js';
import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { tableMasterModel } from '../layout/tableMasterModel.js';
import { tenantModel } from '../tenant/tenantModel.js';
import { taxConfigurationModel } from '../accounting/taxConfigurationModel.js';
import { menuMasterModel } from '../ordering/menuMasterModel.js';

/**
 * Resolve an order line's menu category for tax classification, falling back to
 * the menu master by item code when the line carries no category. Mirrors
 * billRevisionModel._enrichItemsForTax so the waiter running-bill preview splits
 * Food vs Bar identically to the final cashier invoice.
 */
function resolveMenuCategory(itemCode, category) {
  if (category) return category;
  if (itemCode && menuMasterModel && typeof menuMasterModel.getItem === 'function') {
    const mi = menuMasterModel.getItem(itemCode);
    if (mi && mi.category) return mi.category;
  }
  return null;
}

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
          itemCode: item.itemCode || item.itemId,
          category: resolveMenuCategory(item.itemCode || item.itemId, item.category),
          name: item.name || item.itemName || 'Dish',
          price: itemPrice,
          quantity: itemQty,
          lineTotal,
          orderId: o.orderId || o.id,
          status: item.itemStatus || o.orderStatus || 'CONFIRMED'
        });
      });
    });

    // Fallback: if orders list is empty but tickets exist for session, recover itemized list from tickets
    if (itemizedList.length === 0 && tickets.length > 0) {
      tickets.forEach(t => {
        (t.items || []).forEach(item => {
          const itemPrice = parseFloat(item.price || item.unitPrice || item.sellingPrice || 0);
          const itemQty = parseInt(item.quantity || item.qty || 1, 10);
          const lineTotal = parseFloat(item.lineTotal || item.total || (itemPrice * itemQty));
          itemizedList.push({
            lineItemId: item.lineItemId || item.itemId || `${t.id}_${item.name}`,
            itemId: item.itemId,
            itemCode: item.itemCode || item.itemId,
            category: resolveMenuCategory(item.itemCode || item.itemId, item.category),
            name: item.name || item.itemName || 'Dish',
            price: itemPrice,
            quantity: itemQty,
            lineTotal,
            orderId: t.orderId || t.id,
            status: item.itemStatus || t.status || 'CONFIRMED'
          });
        });
      });
    }

    // Per-line tax via the Centralized Tax engine so the running-bill preview
    // matches the final invoice exactly (food GST vs explicitly-marked liquor VAT).
    const billTax = taxConfigurationModel.computeBillTax({
      items: itemizedList,
      discountRecords: [],
      isIntraState: true,
      tenantId: targetTenantId
    });

    const calculatedSubtotal = itemizedList.reduce((sum, it) => sum + (parseFloat(it.lineTotal) || 0), 0);
    const ordersSubtotal = orders.reduce((sum, o) => sum + (parseFloat(o.subtotal || o.totalAmount || o.total_amount) || 0), 0);
    const subtotal = billTax.taxableAmount > 0 ? billTax.taxableAmount : (calculatedSubtotal > 0 ? calculatedSubtotal : ordersSubtotal);

    const cgstPercent = billTax.cgstPercent;
    const sgstPercent = billTax.sgstPercent;
    const serviceChargePercent = billTax.serviceChargePercent;
    const cgstAmount = billTax.cgstAmount;
    const sgstAmount = billTax.sgstAmount;
    const serviceChargeAmount = billTax.serviceChargeAmount;
    const taxAmount = billTax.totalTax;
    const grandTotal = billTax.grandTotal;

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

    const master = tableMasterModel.getTableMaster(session.tableCode || session.table_code || session.tableNumber);
    const canonicalTableCode = session.tableCode || session.table_code || (master ? master.tableCode : `T-${String(session.tableNumber || 1).padStart(2, '0')}`);
    const canonicalTableNum = session.tableNumber || (master ? master.tableNumber : null);

    return {
      sessionId: session.id || session.sessionId,
      tableId: session.tableId || (master ? master.id : `tbl_${canonicalTableNum || 1}`),
      tableNumber: canonicalTableNum,
      tableCode: canonicalTableCode,
      table_code: canonicalTableCode,
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
      serviceChargeAmount,
      taxAmount,
      grandTotal,
      taxLines: billTax.taxLines || [],
      charges: billTax.charges || [],
      fiscalSections: billTax.fiscalSections || [],
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
