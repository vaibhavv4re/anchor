/**
 * BusinessOS Platform - Event-Driven Attendance Engine
 * Subscribes to EMPLOYEE_AUTHENTICATED and EMPLOYEE_LOGGED_OUT events.
 * Authentication has zero direct dependency or awareness of restaurant attendance logic.
 */

import { platformEventBus, PlatformEventTypes } from '../events/platformEvents.js';
import { offlineStore } from '../offline_store/offlineStore.js';

class AttendanceEngine {
  constructor() {
    this._initialized = false;
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

  handleAutoClockIn(payload) {
    const { employeeId, employeeName, workspace, deviceId, timestamp } = payload;

    const record = {
      id: 'att_' + Math.random().toString(36).substring(2, 9),
      employeeId,
      employeeName,
      workspace,
      deviceId,
      clockInTime: timestamp,
      clockOutTime: null,
      durationMs: null,
      status: 'ACTIVE_SHIFT'
    };

    offlineStore.appendItem('attendance', record);
  }

  handleAutoClockOut(payload) {
    const { employeeId, timestamp, shiftDurationMs } = payload;
    const records = offlineStore.getCollection('attendance') || [];

    // Find latest active shift for employee
    const updated = records.map(r => {
      if (r.employeeId === employeeId && r.status === 'ACTIVE_SHIFT') {
        return {
          ...r,
          clockOutTime: timestamp,
          durationMs: shiftDurationMs,
          status: 'COMPLETED'
        };
      }
      return r;
    });

    offlineStore.setCollection('attendance', updated);
  }

  getTimesheet(employeeId = null) {
    const records = offlineStore.getCollection('attendance') || [];
    if (!employeeId) return records;
    return records.filter(r => r.employeeId === employeeId);
  }
}

export const attendanceEngine = new AttendanceEngine();
attendanceEngine.init();
