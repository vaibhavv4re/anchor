/**
 * BusinessOS Platform - Session Entity & Persistence (PD-008)
 * Manages operational context: active table sessions, guest counts, notes, dietary tags, and celebration flags.
 * ZERO static mock seed data.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { tableMasterModel } from '../layout/tableMasterModel.js';

class SessionModel {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('table_sessions')) {
      offlineStore.setCollection('table_sessions', []);
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

  /**
   * Create a new table session (Recommendation 3.1 & PD-008).
   * @param {Object} params { tableNumber, guestCount, assignedWaiterId, guestNotes, dietaryTags, celebrationFlag, tenantId }
   * @returns {Object} Created session
   */
  createSession({ tableNumber, guestCount = 2, assignedWaiterId, guestNotes = '', dietaryTags = [], celebrationFlag = null, tenantId = null }) {
    const targetTenantId = this._getTenantId(tenantId);
    const correlationId = 'CID-' + Math.floor(10000 + Math.random() * 90000);
    const strVal = String(tableNumber || '').trim();
    const digitsOnly = strVal.replace(/\D/g, '');
    const master = tableMasterModel.getTableMaster(tableNumber);
    const tableNum = digitsOnly.length > 0 ? parseInt(digitsOnly, 10) : (master ? master.tableNumber : (typeof tableNumber === 'number' ? tableNumber : 1));
    const tableCode = master ? master.tableCode : (strVal.includes('-') ? strVal : `T-${String(tableNum).padStart(2, '0')}`);
    const sessionId = 'sess_' + Math.random().toString(36).substring(2, 9);
    const now = new Date().toISOString();

    const newSession = {
      id: sessionId,
      sessionId,
      tableNumber: tableNum,
      tableId: master ? master.id : `tbl_${tableNum}`,
      tableCode,
      guestCount: parseInt(guestCount) || 2,
      assignedWaiterId: assignedWaiterId || 'emp-waiter',
      status: 'GUESTS_SEATED',
      guestNotes: guestNotes || '',
      dietaryTags: Array.isArray(dietaryTags) ? dietaryTags : [],
      celebrationFlag: celebrationFlag || null,
      createdAt: now,
      lastActivityAt: now,
      tenantId: targetTenantId,
      correlationId
    };

    offlineStore.appendItem('table_sessions', newSession);

    // Sync to Supabase cloud table & offline_journal for multi-device cross-replication
    const dg = this._getDataGateway();
    if (dg && typeof dg.create === 'function') {
      dg.create('table_sessions', newSession).catch(e => console.warn('[sessionModel] Cloud table_sessions sync error:', e.message));

      const journalEntry = {
        job_id: 'job_' + sessionId,
        job_type: 'SESSION_OPENED',
        tenant_id: targetTenantId,
        entity_name: 'table_sessions',
        payload: newSession,
        device_id: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 30) : 'POS-TERMINAL-01',
        actor: assignedWaiterId || 'Staff',
        correlation_id: correlationId,
        sync_state: 'SYNCED',
        created_at: now
      };
      dg.create('offline_journal', journalEntry).catch(e => console.warn('[sessionModel] Cloud session journal sync error:', e.message));
    }

    // Publish platform event
    platformEventBus.publish('session:created', {
      sessionId: newSession.id,
      tableNumber: newSession.tableNumber,
      guestCount: newSession.guestCount,
      assignedWaiterId: newSession.assignedWaiterId,
      tenantId: newSession.tenantId,
      correlationId: newSession.correlationId,
      timestamp: newSession.createdAt
    });

    return newSession;
  }

  /**
   * Retrieve session by ID
   * @param {string} sessionId 
   * @param {string|null} tenantId 
   * @returns {Object|null}
   */
  getSession(sessionId, tenantId = null) {
    const sessions = this.getAllSessions(tenantId);
    return sessions.find(s => s.id === sessionId || s.sessionId === sessionId) || null;
  }

  /**
   * Retrieve active (non-closed) session for a specific table
   * @param {number|string} tableNumber 
   * @param {string|null} tenantId 
   * @returns {Object|null}
   */
  getActiveSessionForTable(target, tenantId = null) {
    const sessions = this.getAllSessions(tenantId);
    if (target === undefined || target === null) return null;

    const master = tableMasterModel.getTableMaster(target);
    const targetId = master ? master.id : null;
    const targetNum = master ? master.tableNumber : (typeof target === 'number' ? target : parseInt(String(target).replace(/\D/g, ''), 10));
    const targetCode = master ? master.tableCode : String(target).trim().toLowerCase();

    return sessions.find(s => 
      s.status !== 'CLOSED' && (
        (targetId && (s.tableId === targetId || s.table_id === targetId)) ||
        (targetNum && (s.tableNumber === targetNum || s.table_number === targetNum)) ||
        (targetCode && String(s.tableCode || s.table_code || '').toLowerCase() === targetCode.toLowerCase())
      )
    ) || null;
  }

  /**
   * Retrieve all active (non-closed) guest sessions
   * @param {string|null} tenantId 
   * @returns {Array<Object>}
   */
  getActiveSessions(tenantId = null) {
    const sessions = this.getAllSessions(tenantId);
    return sessions.filter(s => s.status !== 'CLOSED');
  }

  /**
   * Retrieve all sessions (reconciled across local store, offline_journal, and Supabase orders)
   * @param {string|null} tenantId 
   * @returns {Array<Object>}
   */
  getAllSessions(tenantId = null) {
    const localList = offlineStore.getCollection('table_sessions') || [];
    const sessionMap = new Map();

    // 1. Seed from local store
    localList.forEach(s => {
      if (s && (s.id || s.sessionId)) {
        sessionMap.set(s.id || s.sessionId, s);
      }
    });

    // 2. Reconcile active sessions from Supabase orders cache
    const dg = this._getDataGateway();
    const dgOrders = dg ? (dg.getCachedCollection('orders', tenantId) || []) : [];
    const localOrders = offlineStore.getCollection('orders', tenantId) || [];
    const allOrders = [...localOrders, ...dgOrders];

    allOrders.forEach(o => {
      const sId = o.sessionId || o.session_id || o.data?.sessionId;
      const tNum = o.tableNumber || o.data?.tableNumber || (o.tableCode ? parseInt(o.tableCode.replace(/\D/g, '')) : null);
      if (sId && tNum && !sessionMap.has(sId) && o.status !== 'CLOSED') {
        sessionMap.set(sId, {
          id: sId,
          sessionId: sId,
          tableNumber: tNum,
          tableId: `tbl_${tNum}`,
          tableCode: o.tableCode || o.data?.tableCode || `T-${String(tNum).padStart(2, '0')}`,
          guestCount: o.guestCount || o.data?.guestCount || 2,
          assignedWaiterId: o.waiterId || o.waiter_id || o.data?.waiterId || 'Staff',
          status: o.status === 'BILL_GENERATED' ? 'BILL_GENERATED' : 'ORDERS_STARTED',
          guestNotes: o.notes || o.data?.guestNotes || '',
          dietaryTags: o.dietaryTags || o.data?.dietaryTags || [],
          celebrationFlag: o.celebrationFlag || o.data?.celebrationFlag || null,
          createdAt: o.createdAt || o.created_at || new Date().toISOString(),
          lastActivityAt: o.updatedAt || o.created_at || new Date().toISOString(),
          tenantId: o.tenantId || o.tenant_id || tenantId || 'tenant_h0qc7wf',
          correlationId: o.correlationId || o.data?.correlationId || `CID-${sId}`
        });
      }
    });

    const allSessions = Array.from(sessionMap.values());
    if (!tenantId) return allSessions;
    return allSessions.filter(s => !s.tenantId || s.tenantId === tenantId);
  }

  /**
   * Update session properties / milestone
   * @param {string} sessionId 
   * @param {Object} updates 
   * @param {string|null} tenantId 
   * @returns {Object|null}
   */
  updateSession(sessionId, updates, tenantId = null) {
    const allSessions = offlineStore.getCollection('table_sessions') || [];
    let index = allSessions.findIndex(s => s.id === sessionId || s.sessionId === sessionId);

    let sessionToUpdate = null;
    if (index >= 0) {
      sessionToUpdate = {
        ...allSessions[index],
        ...updates,
        version: (allSessions[index].version || 1) + 1,
        lastActivityAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      allSessions[index] = sessionToUpdate;
    } else {
      const existing = this.getSession(sessionId, tenantId);
      if (existing) {
        sessionToUpdate = {
          ...existing,
          ...updates,
          version: (existing.version || 1) + 1,
          lastActivityAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        allSessions.push(sessionToUpdate);
      }
    }

    if (sessionToUpdate) {
      offlineStore.setCollection('table_sessions', allSessions);

      // Sync updated table_session to Supabase Cloud
      const dg = this._getDataGateway();
      if (dg && typeof dg.update === 'function') {
        dg.update('table_sessions', sessionId, sessionToUpdate).catch(e => console.warn('[sessionModel] Cloud table_sessions update error:', e.message));
      }

      // Also update linked orders in localStore if status is updated
      if (updates.status) {
        const localOrders = offlineStore.getCollection('orders', tenantId) || [];
        let ordersChanged = false;
        localOrders.forEach((o, idx) => {
          if (o.sessionId === sessionId || o.session_id === sessionId || o.id === sessionId) {
            localOrders[idx] = { ...o, status: updates.status, orderStatus: updates.status };
            ordersChanged = true;
          }
        });
        if (ordersChanged) {
          offlineStore.setCollection('orders', localOrders);
        }
      }

      return sessionToUpdate;
    }
    return null;
  }
}

export const sessionModel = new SessionModel();
