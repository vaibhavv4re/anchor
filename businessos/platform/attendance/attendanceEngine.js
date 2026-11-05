/**
 * BusinessOS Platform - Event-Driven Attendance Engine
 * Subscribes to EMPLOYEE_AUTHENTICATED and EMPLOYEE_LOGGED_OUT events.
 * Authentication has zero direct dependency or awareness of restaurant attendance logic.
 *
 * Phase 4: attendance is now cloud-backed (the `attendance` table) through the
 * DataGateway, so a shift clocked in on one device shows on the manager's screen
 * on any other device. The DataGateway mirrors each write into the local
 * offlineStore cache and queues an offline job if the cloud is unreachable, so
 * reads stay synchronous and nothing is lost on a flaky link.
 */

import { platformEventBus, PlatformEventTypes } from '../events/platformEvents.js';
import { offlineStore } from '../offline_store/offlineStore.js';

class AttendanceEngine {
  constructor(deps = {}) {
    this._initialized = false;
    this.dataGateway = deps.dataGateway || null;
  }

  _gateway() {
    if (this.dataGateway) return this.dataGateway;
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) {
      this.dataGateway = window.__APP__.platform.dataGateway || null;
    }
    return this.dataGateway;
  }

  init() {
    if (this._initialized) return;

    // Listen for authentication events to automatically clock in
    platformEventBus.subscribe(PlatformEventTypes.EMPLOYEE_AUTHENTICATED, (envelope) => {
      this.handleAutoClockIn(envelope.payload);
    });

    // Listen for logout events to automatically clock out
    platformEventBus.subscribe(PlatformEventTypes.EMPLOYEE_LOGGED_OUT, (envelope) => {
      this.handleAutoClockOut(envelope.payload);
    });

    this._initialized = true;
  }

  async handleAutoClockIn(payload) {
    const { employeeId, employeeName, workspace, deviceId, tenantId, timestamp } = payload;
    if (!employeeId) return;

    const gw = this._gateway();
    const record = {
      id: 'att_' + Math.random().toString(36).substring(2, 9),
      tenant_id: tenantId || 'tenant_h0qc7wf',
      tenantId: tenantId || 'tenant_h0qc7wf',
      employee_id: employeeId,
      employeeId,
      employee_name: employeeName,
      employeeName,
      workspace,
      device_id: deviceId,
      clock_in_time: timestamp,
      clockOutTime: timestamp,
      clock_out_time: null,
      duration_ms: null,
      status: 'ACTIVE_SHIFT'
    };

    if (gw && typeof gw.create === 'function') {
      await gw.create('attendance', record);
    } else {
      offlineStore.appendItem('attendance', record);
    }
  }

  async handleAutoClockOut(payload) {
    const { employeeId, tenantId, timestamp, shiftDurationMs } = payload;
    if (!employeeId) return;

    const gw = this._gateway();
    const records = (gw && typeof gw.getCachedCollection === 'function')
      ? (gw.getCachedCollection('attendance', tenantId) || [])
      : (offlineStore.getCollection('attendance') || []);

    // Latest active shift for this employee is the one to close.
    const openShift = records
      .filter(r => (r.employeeId || r.employee_id) === employeeId && r.status === 'ACTIVE_SHIFT')
      .sort((a, b) => new Date(b.clockInTime || b.clock_in_time || 0) - new Date(a.clockInTime || a.clock_in_time || 0))[0];

    const patch = {
      clock_out_time: timestamp,
      clockOutTime: timestamp,
      duration_ms: shiftDurationMs,
      durationMs: shiftDurationMs,
      status: 'COMPLETED'
    };

    if (openShift) {
      if (gw && typeof gw.update === 'function') {
        await gw.update('attendance', openShift.id, patch);
      } else {
        const updated = (offlineStore.getCollection('attendance') || []).map(r => r.id === openShift.id ? { ...r, ...patch } : r);
        offlineStore.setCollection('attendance', updated);
      }
    }
  }

  getTimesheet(employeeId = null) {
    const gw = this._gateway();
    const records = (gw && typeof gw.getCachedCollection === 'function')
      ? (gw.getCachedCollection('attendance') || [])
      : (offlineStore.getCollection('attendance') || []);
    if (!employeeId) return records;
    return records.filter(r => (r.employeeId || r.employee_id) === employeeId);
  }
}

export const attendanceEngine = new AttendanceEngine();
attendanceEngine.init();
