/**
 * BusinessOS Platform - Session Projection Service (Recommendation 3.5 & PD-006)
 * Generates frozen SessionProjection objects for Waiter, Manager, Kitchen, and Cashier screens.
 * Emits session:projection:updated for CQRS real-time UI broadcast.
 */

import { sessionModel } from './sessionModel.js';
import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

class SessionProjectionService {
  constructor() {
    this._initSubscribers();
  }

  _initSubscribers() {
    platformEventBus.subscribe('session:created', (envelope) => {
      const projection = this.getSessionProjection(envelope.payload.sessionId);
      platformEventBus.publish('session:projection:updated', projection);
    });

    platformEventBus.subscribe('session:milestone:changed', (envelope) => {
      const projection = this.getSessionProjection(envelope.payload.sessionId);
      platformEventBus.publish('session:projection:updated', projection);
    });
  }

  /**
   * Generates a frozen schema SessionProjection object.
   * @param {string} sessionId 
   * @returns {Object} SessionProjection
   */
  getSessionProjection(sessionId) {
    const session = sessionModel.getSession(sessionId);
    if (!session) return null;

    const employees = offlineStore.getCollection('employees') || [];
    const waiter = session.assignedWaiterId ? employees.find(e => e.id === session.assignedWaiterId) : null;

    const elapsedMs = session.createdAt ? (new Date() - new Date(session.createdAt)) : 0;
    const elapsedMin = Math.floor(elapsedMs / (1000 * 60));

    return {
      sessionId: session.id,
      tableId: session.tableId,
      tableNumber: session.tableNumber,
      guestCount: session.guestCount,
      waiter: {
        id: session.assignedWaiterId,
        name: waiter ? waiter.name : 'Unassigned'
      },
      status: session.status,
      orderCount: 0,
      foodItems: [],
      drinkItems: [],
      readyItems: [],
      billStatus: session.status === 'BILL_GENERATED' ? 'GENERATED' : (session.status === 'PAYMENT_RECEIVED' ? 'PAID' : 'NONE'),
      paymentStatus: session.status === 'PAYMENT_RECEIVED' ? 'COMPLETED' : 'PENDING',
      elapsedTime: `${elapsedMin} min`,
      lastActivity: session.lastActivityAt,
      guestNotes: session.guestNotes || '',
      dietaryTags: session.dietaryTags || [],
      celebrationFlag: session.celebrationFlag || null,
      correlationId: session.correlationId
    };
  }

  getActiveProjectionForTable(tableNumber) {
    const activeSession = sessionModel.getActiveSessionForTable(tableNumber);
    if (!activeSession) return null;
    return this.getSessionProjection(activeSession.id);
  }
}

export const sessionProjectionService = new SessionProjectionService();
