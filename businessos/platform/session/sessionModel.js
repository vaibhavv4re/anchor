/**
 * BusinessOS Platform - Session Entity & Persistence (PD-008)
 * Manages operational context: active table sessions, guest counts, notes, dietary tags, and celebration flags.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

class SessionModel {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('table_sessions')) {
      const defaultSessions = [
        {
          id: 'sess_1001',
          tableNumber: 3,
          tableId: 'tbl_3',
          guestCount: 4,
          assignedWaiterId: 'emp-rahul',
          status: 'GUESTS_SEATED',
          guestNotes: 'Near window preferred',
          dietaryTags: ['Nut Allergy'],
          celebrationFlag: 'Birthday',
          createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
          lastActivityAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
          correlationId: 'CID-55102'
        },
        {
          id: 'sess_1002',
          tableNumber: 4,
          tableId: 'tbl_4',
          guestCount: 2,
          assignedWaiterId: 'emp-rahul',
          status: 'BILL_GENERATED',
          guestNotes: 'Separate check requested',
          dietaryTags: [],
          celebrationFlag: null,
          createdAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
          lastActivityAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          correlationId: 'CID-55103'
        }
      ];
      offlineStore.setCollection('table_sessions', defaultSessions);
    }
  }

  /**
   * Create a new table session (Recommendation 3.1).
   */
  createSession({ tableNumber, guestCount = 2, assignedWaiterId, guestNotes = '', dietaryTags = [], celebrationFlag = null }) {
    const correlationId = 'CID-' + Math.floor(10000 + Math.random() * 90000);
    const newSession = {
      id: 'sess_' + Math.random().toString(36).substring(2, 9),
      tableNumber: parseInt(tableNumber),
      tableId: `tbl_${tableNumber}`,
      guestCount: parseInt(guestCount),
      assignedWaiterId,
      status: 'GUESTS_SEATED',
      guestNotes,
      dietaryTags,
      celebrationFlag,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      correlationId
    };

    offlineStore.appendItem('table_sessions', newSession);

    // Publish platform event
    platformEventBus.publish('session:created', {
      sessionId: newSession.id,
      tableNumber: newSession.tableNumber,
      guestCount: newSession.guestCount,
      assignedWaiterId: newSession.assignedWaiterId,
      correlationId: newSession.correlationId,
      timestamp: newSession.createdAt
    });

    return newSession;
  }

  getSession(sessionId) {
    const sessions = offlineStore.getCollection('table_sessions') || [];
    return sessions.find(s => s.id === sessionId) || null;
  }

  getActiveSessionForTable(tableNumber) {
    const sessions = offlineStore.getCollection('table_sessions') || [];
    return sessions.find(s => s.tableNumber === parseInt(tableNumber) && s.status !== 'CLOSED') || null;
  }

  getAllSessions() {
    return offlineStore.getCollection('table_sessions') || [];
  }

  updateSession(sessionId, updates) {
    const sessions = offlineStore.getCollection('table_sessions') || [];
    const index = sessions.findIndex(s => s.id === sessionId);
    if (index >= 0) {
      sessions[index] = {
        ...sessions[index],
        ...updates,
        lastActivityAt: new Date().toISOString()
      };
      offlineStore.setCollection('table_sessions', sessions);
      return sessions[index];
    }
    return null;
  }
}

export const sessionModel = new SessionModel();
