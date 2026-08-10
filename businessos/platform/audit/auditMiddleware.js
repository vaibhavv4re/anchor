/**
 * BusinessOS Platform - Automated Audit Middleware with Correlation ID Tracking
 * Listens to all platform events and automatically generates audit records with correlation tracing.
 */

import { platformEventBus, PlatformEventTypes } from '../events/platformEvents.js';
import { offlineStore } from '../offline_store/offlineStore.js';

class AuditMiddleware {
  constructor() {
    this._initialized = false;
    this.activeCorrelationId = null;
  }

  init() {
    if (this._initialized) return;

    platformEventBus.subscribe('*', (envelope) => {
      this.recordAudit(envelope);
    });

    this._initialized = true;
  }

  /**
   * Set an active correlation ID for multi-step transaction tracing
   * (e.g. Generate Bill -> Print -> QR -> Payment -> Table Closed)
   */
  setCorrelationId(correlationId) {
    this.activeCorrelationId = correlationId;
  }

  clearCorrelationId() {
    this.activeCorrelationId = null;
  }

  recordAudit({ type, payload, timestamp }) {
    const correlationId = payload.correlationId || this.activeCorrelationId || 'corr_' + Math.random().toString(36).substring(2, 9);

    const auditRecord = {
      id: 'aud_' + Math.random().toString(36).substring(2, 9),
      correlationId,
      eventType: type,
      actorId: payload.employeeId || payload.identityId || 'SYSTEM',
      deviceId: payload.deviceId || 'LOCAL_DEVICE',
      details: payload,
      timestamp: timestamp || new Date().toISOString()
    };

    offlineStore.appendItem('audit', auditRecord);
  }

  getAuditLogs(filter = {}) {
    const logs = offlineStore.getCollection('audit') || [];
    return logs.filter(log => {
      if (filter.correlationId && log.correlationId !== filter.correlationId) return false;
      if (filter.eventType && log.eventType !== filter.eventType) return false;
      if (filter.actorId && log.actorId !== filter.actorId) return false;
      return true;
    });
  }
}

export const auditMiddleware = new AuditMiddleware();
auditMiddleware.init();
