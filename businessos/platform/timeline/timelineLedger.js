/**
 * BusinessOS Platform - Operational Timeline Ledger
 * Standardized TimelineEntry Contract across Manager, Audit, Debugging, and BI reports.
 */

import { platformEventBus } from '../events/platformEvents.js';
import { offlineStore } from '../offline_store/offlineStore.js';

class TimelineLedger {
  constructor() {
    this._initialized = false;
  }

  init() {
    if (this._initialized) return;

    platformEventBus.subscribe('*', (envelope) => {
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

    const entry = {
      id: 'tml_' + Math.random().toString(36).substring(2, 9),
      timestamp: timestamp || new Date().toISOString(),
      correlationId: payload.correlationId || 'CID-' + Math.floor(10000 + Math.random() * 90000),
      eventType: type,
      actor: {
        id: actorId,
        name: payload.employeeName || (actorEmp ? actorEmp.name : 'System'),
        role: payload.roleId || (actorEmp ? actorEmp.roleId : 'SYSTEM')
      },
      target: payload.tableNumber ? `Table ${payload.tableNumber}` : (payload.workspace || 'System'),
      summary: this.formatSummary(type, payload),
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
      case 'table:state:changed':
        return `Table ${payload.tableNumber} state changed (${payload.previousState} → ${payload.newState})`;
      case 'session:created':
        return `Table ${payload.tableNumber} Session Opened (${payload.guestCount || 2} Guests)`;
      case 'platform:config:updated':
        return `System Config Updated (${payload.section})`;
      default:
        return `System Event: ${type}`;
    }
  }

  getTimelineEntries(limit = 50) {
    const entries = offlineStore.getCollection('timeline_ledger') || [];
    return entries.slice(-limit).reverse();
  }
}

export const timelineLedger = new TimelineLedger();
timelineLedger.init();
