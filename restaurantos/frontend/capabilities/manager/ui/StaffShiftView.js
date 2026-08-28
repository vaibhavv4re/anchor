/**
 * RestaurantOS - Phase M6: Manager Staff & Shift View
 * Live operational performance tracking per employee during a shift.
 * Tracks clock-in status, assigned floor tables, active guest covers, sales handled, 
 * ready-dish pickup lag, and server-associated exceptions.
 */

import { managerProjectionService } from '../../../../../businessos/platform/manager/managerProjectionService.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

export class StaffShiftView {
  constructor(deps = {}) {
    this.tenantId = deps.tenantId || null;
    this.container = null;
    this.unsubscribeEvents = [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'staff-shift-view flex-col gap-lg animate-fade-in';
    this.container.style.width = '100%';

    this.subscribePlatformEvents();
    this.updateContent();

    return this.container;
  }

  subscribePlatformEvents() {
    const refresh = () => {
      if (this.container && document.body.contains(this.container)) {
        this.updateContent();
      }
    };
    this.unsubscribeEvents = [
      platformEventBus.subscribe('session:created', refresh),
      platformEventBus.subscribe('order:confirmed', refresh),
      platformEventBus.subscribe('ticket:status_changed', refresh),
      platformEventBus.subscribe('payment:recorded', refresh)
    ];
  }

  updateContent() {
    if (!this.container) return;

    const data = managerProjectionService.getStaffShiftProjection(this.tenantId);
    const formatCurrency = (val) => '₹' + Number(val || 0).toLocaleString('en-IN');

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h2 style="font-size:1.5rem; margin:0;">👥 Staff & Shift Operations (Phase M6)</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Operational performance, active floor assignments, sales handled & pickup speed per staff member.</p>
        </div>
        <span class="badge badge-success" style="font-size:0.85rem; padding:6px 14px;">
          🟢 ${data.clockedInCount} / ${data.totalStaffCount} Staff Clocked In
        </span>
      </div>

      <!-- Top Summary Stat Strip -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px; margin-bottom:20px;">
        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid var(--accent-primary);">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL ONBOARDED STAFF</div>
          <div style="font-size:1.6rem; font-weight:700; color:var(--text-primary); margin-top:4px;">${data.totalStaffCount}</div>
        </div>

        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #10b981;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">CLOCKED IN THIS SHIFT</div>
          <div style="font-size:1.6rem; font-weight:700; color:#10b981; margin-top:4px;">${data.clockedInCount}</div>
        </div>

        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #3b82f6;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">ACTIVE SERVERS ON FLOOR</div>
          <div style="font-size:1.6rem; font-weight:700; color:#3b82f6; margin-top:4px;">${data.activeWaitersCount}</div>
        </div>

        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #f59e0b;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL SHIFT SALES HANDLED</div>
          <div style="font-size:1.6rem; font-weight:700; color:#f59e0b; margin-top:4px;">${formatCurrency(data.totalSalesHandled)}</div>
        </div>
      </div>

      <!-- Staff Performance Cards Grid -->
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${data.staffRows.length === 0 ? `
          <div class="card" style="padding:32px; text-align:center; background:var(--bg-surface-1);">
            <p style="color:var(--text-muted); font-style:italic; margin:0;">No staff members onboarded yet.</p>
          </div>
        ` : data.staffRows.map(staff => `
          <div class="card animate-fade-in" style="padding:20px; background:var(--bg-surface-1); border-radius:8px; border-left:5px solid ${staff.clockInStatus === 'CLOCKED_IN' ? '#10b981' : '#6b7280'};">
            
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
              <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:44px; height:44px; border-radius:50%; background:var(--accent-primary)22; color:var(--accent-primary); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1.2rem;">
                  ${staff.name ? staff.name.substring(0, 2).toUpperCase() : 'ST'}
                </div>
                <div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <h3 style="margin:0; font-size:1.15rem;">${staff.name}</h3>
                    <span class="badge" style="background:var(--bg-surface-2); border:1px solid var(--border-subtle); color:var(--text-secondary); font-size:0.7rem;">
                      ${staff.roleName}
                    </span>
                  </div>
                  <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">
                    ⏰ ${staff.shiftTiming}
                  </div>
                </div>
              </div>

              <div style="display:flex; align-items:center; gap:8px;">
                ${staff.exceptionsCount > 0 ? `
                  <span class="badge" style="background:#ef444422; color:#ef4444; border:1px solid #ef4444; font-size:0.75rem;">
                    ⚠️ ${staff.exceptionsCount} Active Exception
                  </span>
                ` : ''}
                <span class="badge ${staff.clockInStatus === 'CLOCKED_IN' ? 'badge-success' : 'badge-info'}" style="font-size:0.85rem;">
                  ${staff.clockInStatus === 'CLOCKED_IN' ? '🟢 CLOCKED IN' : '⚪ OFFLINE'}
                </span>
              </div>
            </div>

            <!-- Live Shift Operational Performance Grid -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:12px; background:var(--bg-surface-2); padding:14px; border-radius:6px; font-size:0.85rem;">
              <div>
                <span style="color:var(--text-muted); display:block; font-size:0.725rem; font-weight:600;">ASSIGNED TABLES</span>
                <strong style="color:var(--text-primary);">${staff.assignedTables.length > 0 ? staff.assignedTables.join(', ') : 'None'}</strong>
              </div>
              <div>
                <span style="color:var(--text-muted); display:block; font-size:0.725rem; font-weight:600;">SEATED GUESTS</span>
                <strong style="color:var(--text-primary);">${staff.seatedGuests} Guests</strong>
              </div>
              <div>
                <span style="color:var(--text-muted); display:block; font-size:0.725rem; font-weight:600;">ACTIVE ORDERS</span>
                <strong style="color:var(--accent-primary);">${staff.activeOrdersCount} Active</strong>
              </div>
              <div>
                <span style="color:var(--text-muted); display:block; font-size:0.725rem; font-weight:600;">SERVED DISHES</span>
                <strong style="color:var(--text-primary);">${staff.servedCoversCount} Dishes</strong>
              </div>
              <div>
                <span style="color:var(--text-muted); display:block; font-size:0.725rem; font-weight:600;">SALES HANDLED</span>
                <strong style="color:#10b981; font-size:1.05rem;">${formatCurrency(staff.salesHandled)}</strong>
              </div>
              <div>
                <span style="color:var(--text-muted); display:block; font-size:0.725rem; font-weight:600;">READY PICKUP AVG</span>
                <strong style="color:#3b82f6;">${staff.avgPickupLag} min</strong>
              </div>
            </div>

          </div>
        `).join('')}
      </div>
    `;
  }
}
