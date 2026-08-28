/**
 * BusinessOS Platform - Append-Only Session Audit Logger Engine (PD-010 & PD-012)
 * Manages chronological CA-audit event logs for guest sessions (orders, KOTs, discounts, revisions, invoices, payments, table closure).
 * Syncs directly to Supabase DataGateway 'offline_journal'.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

class SessionAuditModel {
  constructor() {
    this._initSeedData();
    this._subscribePlatformEvents();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('session_audit_logs')) {
      offlineStore.setCollection('session_audit_logs', []);
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

  _subscribePlatformEvents() {
    // Automatically capture audit events published across the platform event bus
    platformEventBus.subscribe('session:created', (env) => {
      const p = env.payload || env;
      this.logEvent({
        sessionId: p.sessionId || p.id,
        tableNumber: p.tableNumber,
        eventType: 'GUESTS_SEATED',
        actorRole: 'WAITER',
        description: `Guests seated at Table ${p.tableNumber || 1} (${p.guestCount || 2} Guests)`,
        metadata: { guestCount: p.guestCount || 2 }
      });
    });

    platformEventBus.subscribe('order:confirmed', (env) => {
      const p = env.payload || env;
      this.logEvent({
        sessionId: p.sessionId,
        tableNumber: p.tableNumber,
        eventType: 'ORDER_CONFIRMED',
        actorRole: 'WAITER',
        description: `Order #${p.orderNumber || p.orderId || p.id} confirmed for Table ${p.tableNumber || 1}`,
        metadata: { orderId: p.orderId || p.id, grandTotal: p.grandTotal }
      });
    });

    platformEventBus.subscribe('kot:dispatched', (env) => {
      const p = env.payload || env;
      this.logEvent({
        sessionId: p.sessionId,
        tableNumber: p.tableNumber,
        eventType: 'KOT_DISPATCHED',
        actorRole: 'SYSTEM',
        description: `KOT #${p.kotId || p.ticketId || p.id} dispatched to Kitchen`,
        metadata: { kotId: p.kotId || p.ticketId || p.id }
      });
    });

    platformEventBus.subscribe('ticket:status_changed', (env) => {
      const p = env.payload || env;
      if (!p.ticket || !p.ticket.sessionId) return;
      this.logEvent({
        sessionId: p.ticket.sessionId,
        tableNumber: p.ticket.tableNumber,
        eventType: `KOT_${p.status || 'UPDATED'}`,
        actorRole: 'KITCHEN',
        description: `KOT #${p.ticketId || p.ticket.id} status updated to ${p.status}`,
        metadata: { status: p.status }
      });
    });

    platformEventBus.subscribe('bill:revision:created', (env) => {
      const p = env.payload || env;
      this.logEvent({
        sessionId: p.sessionId,
        tableNumber: p.tableNumber,
        eventType: 'BILL_REVISION_CREATED',
        actorRole: 'WAITER',
        description: `Bill Revision ${p.revisionNumber} (${p.billNumber}) created for Table ${p.tableNumber} (Total: ₹${parseFloat(p.grandTotal).toFixed(2)})`,
        metadata: { billNumber: p.billNumber, revisionNumber: p.revisionNumber, grandTotal: p.grandTotal },
        correlationId: p.correlationId
      });
    });

    platformEventBus.subscribe('invoice:issued', (env) => {
      const p = env.payload || env;
      this.logEvent({
        sessionId: p.sessionId,
        tableNumber: p.tableNumber,
        eventType: 'INVOICE_ISSUED',
        actorName: p.cashierName || 'Cashier',
        actorRole: 'CASHIER',
        description: `Tax Invoice ${p.invoiceNumber} issued for Table ${p.tableNumber} (Total: ₹${parseFloat(p.grandTotal).toFixed(2)})`,
        metadata: { invoiceNumber: p.invoiceNumber, grandTotal: p.grandTotal },
        correlationId: p.correlationId
      });
    });

    platformEventBus.subscribe('payment:recorded', (env) => {
      const p = env.payload || env;
      this.logEvent({
        sessionId: p.sessionId,
        tableNumber: p.tableNumber,
        eventType: 'PAYMENT_RECORDED',
        actorName: p.receivedByName || 'Cashier',
        actorRole: 'CASHIER',
        description: `Payment ${p.paymentId} of ₹${parseFloat(p.amount).toFixed(2)} via ${p.paymentMethod} settled for Invoice ${p.invoiceNumber}`,
        metadata: { paymentId: p.paymentId, invoiceNumber: p.invoiceNumber, amount: p.amount, paymentMethod: p.paymentMethod },
        correlationId: p.correlationId
      });
    });
  }

  /**
   * Log an append-only audit event.
   * @param {Object} params { sessionId, tableNumber, eventType, actorId, actorName, actorRole, description, metadata, tenantId, correlationId }
   * @returns {Object} Session Audit Record
   */
  logEvent({ sessionId, tableNumber = null, eventType = 'OPERATIONAL_EVENT', actorId = 'SYSTEM', actorName = 'System', actorRole = 'SYSTEM', description = '', metadata = {}, tenantId = null, correlationId = null }) {
    const targetTenantId = this._getTenantId(tenantId);
    const eventId = 'aud_' + Math.random().toString(36).substring(2, 9);
    const cid = correlationId || 'CID-' + Math.floor(10000 + Math.random() * 90000);
    const now = new Date().toISOString();

    const auditRecord = {
      id: eventId,
      eventId,
      tenantId: targetTenantId,
      tenant_id: targetTenantId,
      sessionId,
      session_id: sessionId,
      tableNumber: tableNumber || 1,
      eventType,
      actorId,
      actorName,
      actorRole,
      description,
      metadata: metadata || {},
      timestamp: now,
      created_at: now,
      correlationId: cid
    };

    // 1. Append to local offline store
    offlineStore.appendItem('session_audit_logs', auditRecord);

    // 2. Sync to Supabase offline_journal / DataGateway
    const dg = this._getDataGateway();
    if (dg && typeof dg.create === 'function') {
      const journalEntry = {
        job_id: 'job_' + eventId,
        job_type: 'AUDIT_EVENT_LOGGED',
        tenant_id: targetTenantId,
        entity_name: 'session_audit_logs',
        payload: auditRecord,
        device_id: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 30) : 'POS-TERMINAL-01',
        actor: actorName,
        correlation_id: cid,
        sync_state: 'SYNCED',
        created_at: now
      };
      dg.create('offline_journal', journalEntry).catch(e => console.warn('[sessionAuditModel] Cloud journal sync error:', e.message));
    }

    return auditRecord;
  }

  /**
   * Retrieve chronological audit log entries for a session
   */
  getAuditLogsForSession(sessionId, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const all = offlineStore.getCollection('session_audit_logs') || [];
    return all
      .filter(a => (a.sessionId === sessionId || a.session_id === sessionId) && (!targetTenantId || a.tenantId === targetTenantId || a.tenant_id === targetTenantId))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }
}

export const sessionAuditModel = new SessionAuditModel();
