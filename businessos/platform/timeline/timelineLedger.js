/**
 * BusinessOS Platform - Operational Timeline Ledger
 * Standardized TimelineEntry Contract across Manager, Audit, Debugging, and BI reports.
 * Filters internal projection noise and formats clean, human-readable operational event summaries.
 */

import { platformEventBus } from '../events/platformEvents.js';
import { offlineStore } from '../offline_store/offlineStore.js';

class TimelineLedger {
  constructor() {
    this._initialized = false;
  }

  init() {
    if (this._initialized) return;

    // Filter out internal platform reactive noise & system polling events
    const ignoredEvents = [
      'table:projection:updated',
      'session:projection:updated',
      'session:milestone:changed',
      'auth:session_locked',
      'platform:config:updated',
      'notification:emitted'
    ];

    platformEventBus.subscribe('*', (envelope) => {
      const type = envelope ? envelope.type : '';
      const payload = envelope ? (envelope.payload || envelope) : {};
      
      if (!type || ignoredEvents.includes(type) || payload.source === 'realtime_sync') {
        return; // Ignore internal reactive noise
      }
      this.recordTimelineEvent(envelope);
    });

    this._initialized = true;
  }

  /**
   * Records a standardized TimelineEntry object.
   */
  recordTimelineEvent({ type, payload, timestamp }) {
    const employees = offlineStore.getCollection('employees') || [];
    const actorId = payload.actorId || payload.employeeId || 'SYSTEM';
    const actorEmp = employees.find(e => e.id === actorId);

    const summary = this.formatSummary(type, payload);
    if (!summary) return; // Skip unhandled noise

    const entry = {
      id: 'tml_' + Math.random().toString(36).substring(2, 9),
      timestamp: timestamp || new Date().toISOString(),
      correlationId: payload.correlationId || 'CID-' + Math.floor(10000 + Math.random() * 90000),
      eventType: type,
      actor: {
        id: actorId,
        name: payload.actorName || payload.receivedByName || payload.cashierName || payload.employeeName || (actorEmp ? actorEmp.name : 'System Engine'),
        role: payload.actorRole || payload.roleId || (actorEmp ? actorEmp.roleId : 'SYSTEM')
      },
      target: payload.tableNumber ? `Table ${payload.tableNumber}` : (payload.workspace || 'System'),
      summary,
      severity: payload.severity || 'INFO',
      metadata: payload
    };

    offlineStore.appendItem('timeline_ledger', entry);
  }

  formatSummary(type, payload) {
    switch (type) {
      case 'platform:employee:authenticated':
        return `Staff Clocked In (${payload.workspace || 'Workspace'})`;
      case 'platform:employee:logged_out':
        return `Staff Clocked Out`;
      case 'session:created':
        return `Table ${payload.tableNumber || 1} Guest Session Opened (${payload.guestCount || 2} Guests)`;
      case 'order:confirmed':
        return `Order Confirmed for Table ${payload.tableNumber || 1} (₹${parseFloat(payload.grandTotal || 0).toFixed(2)})`;
      case 'bill:finalized':
      case 'bill:revision:created':
        return `Bill Finalized for Table ${payload.tableNumber || 1} (Rev ${payload.revisionNumber || 1})`;
      case 'bill:recalled':
        return `Bill Recalled for Table ${payload.tableNumber || 1}`;
      case 'invoice:issued':
        return `Tax Invoice ${payload.invoiceNumber} Issued for Table ${payload.tableNumber || 1}`;
      case 'payment:recorded':
      case 'bill:settled':
        return `Payment Settled via ${payload.paymentMethod || 'UPI'} for Table ${payload.tableNumber || 1}`;
      case 'table:state:changed':
        if (!payload.newState) return null;
        const prevState = payload.previousState && payload.previousState !== 'undefined' ? `${payload.previousState} → ` : '';
        return `Table ${payload.tableNumber || 1} State: ${prevState}${payload.newState}`;
      default:
        return null; // Suppress unhandled internal events
    }
  }

  getTimelineEntries(limit = 50) {
    const entries = offlineStore.getCollection('timeline_ledger') || [];
    return entries.slice(-limit).reverse();
  }
}

export const timelineLedger = new TimelineLedger();
timelineLedger.init();
