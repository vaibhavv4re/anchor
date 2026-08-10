/**
 * Capability 1.3 - Attendance & Timesheet UI
 * Real-time timesheet monitor displaying automatically generated ClockIn and ClockOut entries.
 */

import { attendanceEngine } from '../../../../businessos/platform/attendance/attendanceEngine.js';

export class AttendanceView {
  constructor() {
    this.container = null;
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'card animate-fade-in';
    this.container.style.padding = 'var(--space-xl)';
    this.updateContent();
    return this.container;
  }

  updateContent() {
    const timesheet = attendanceEngine.getTimesheet();

    const rows = timesheet.length ? timesheet.map(r => {
      const clockIn = new Date(r.clockInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const clockOut = r.clockOutTime ? new Date(r.clockOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active Shift';
      const duration = r.durationMs ? `${(r.durationMs / (1000 * 60)).toFixed(1)} mins` : '--';

      return `
        <tr>
          <td><span style="font-weight:600;">${r.employeeName}</span> (${r.employeeId})</td>
          <td><span class="badge badge-info">${r.workspace}</span></td>
          <td>${clockIn}</td>
          <td>${clockOut}</td>
          <td>${duration}</td>
          <td><span class="badge ${r.status === 'ACTIVE_SHIFT' ? 'badge-success' : 'badge-warning'}">${r.status}</span></td>
        </tr>
      `;
    }).join('') : `
      <tr>
        <td colspan="6" style="text-align:center; color:var(--text-muted); padding:var(--space-xl);">
          No shifts recorded today. Log in with a PIN to generate automatic attendance entries!
        </td>
      </tr>
    `;

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:var(--space-md); margin-bottom:var(--space-lg);">
        <div>
          <h2 style="font-size:1.5rem;">Automated Staff Timesheet</h2>
          <p style="color:var(--text-muted); font-size:0.875rem;">Attendance is automatically logged on PIN login (Clock In) and logout (Clock Out)</p>
        </div>
        <span class="badge badge-success">AUTO ATTENDANCE ACTIVE</span>
      </div>

      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Workspace</th>
              <th>Clock In Time</th>
              <th>Clock Out Time</th>
              <th>Shift Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }
}
