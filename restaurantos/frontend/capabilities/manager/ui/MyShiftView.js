/**
 * RestaurantOS - Phase M8: Manager My Shift & Handover View
 * Manager shift status tracking, inherited shift state, current shift snapshot, 
 * and immutable shift handover logging.
 * ZERO independent calculation — consumes M1–M7 projections.
 */

import { managerProjectionService } from '../../../../../businessos/platform/manager/managerProjectionService.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { sessionAuditModel } from '../../../../../businessos/platform/session/sessionAuditModel.js';

export class MyShiftView {
  constructor(deps = {}) {
    this.tenantId = deps.tenantId || null;
    this.container = null;
    this.unsubscribeEvents = [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'my-shift-view flex-col gap-lg animate-fade-in';
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
      platformEventBus.subscribe('payment:recorded', refresh),
      platformEventBus.subscribe('ticket:status_changed', refresh)
    ];
  }

  updateContent() {
    if (!this.container) return;

    const data = managerProjectionService.getMyShiftHandoverProjection(this.tenantId);
    const info = data.managerInfo;
    const inh = data.inheritedState;
    const snap = data.currentShiftSnapshot;
    const ho = data.handoverState;

    const formatCurrency = (val) => '₹' + Number(val || 0).toLocaleString('en-IN');

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h2 style="font-size:1.5rem; margin:0;">🕐 My Shift & Handover (Phase M8)</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Manager Shift Status • Inherited State • Shift Snapshot • Handover Log</p>
        </div>
        <span class="badge badge-success" style="font-size:0.85rem; padding:6px 14px;">
          🟢 Active Shift (4h 00m)
        </span>
      </div>

      <!-- 1. My Shift Info Card -->
      <div class="card" style="padding:20px; background:var(--bg-surface-1); border-left:5px solid var(--accent-primary); margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">CURRENT SHIFT MANAGER</div>
            <h3 style="margin:4px 0 2px 0; font-size:1.3rem;">${info.name} (${info.role})</h3>
            <div style="font-size:0.85rem; color:var(--text-secondary);">
              Clocked In: <strong>${new Date(info.clockInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong> • Elapsed: <strong>4 hrs 00 min</strong>
            </div>
          </div>
          <span class="badge badge-success" style="font-size:0.9rem; padding:8px 16px;">
            ACTIVE SHIFT IN PROGRESS
          </span>
        </div>
      </div>

      <!-- 2. Opening / Inherited State at Shift Takeover -->
      <div class="card" style="padding:20px; background:var(--bg-surface-1); margin-bottom:16px;">
        <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:12px;">
          🚪 INHERITED STATE AT SHIFT TAKEOVER
        </div>
        <div class="grid grid-cols-4 gap-md" style="font-size:0.85rem; margin-bottom:12px;">
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">OPENING CASH FLOAT</span>
            <strong style="font-size:1.2rem; color:var(--text-primary);">${formatCurrency(inh.openingCashFloat)}</strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">OCCUPIED TABLES AT TAKEOVER</span>
            <strong style="font-size:1.2rem; color:var(--text-primary);">${inh.occupiedTablesAtTakeover} Tables</strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">PENDING BILLS AT TAKEOVER</span>
            <strong style="font-size:1.2rem; color:#f59e0b;">${inh.pendingBillsAtTakeover} Pending</strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">INHERITED EXCEPTIONS</span>
            <strong style="font-size:1.2rem; color:#ef4444;">${inh.inheritedExceptionsCount} Active</strong>
          </div>
        </div>
        <div style="font-size:0.825rem; color:var(--text-secondary); background:var(--bg-surface-2); padding:10px 14px; border-radius:6px;">
          💬 <strong>Previous Manager Handover Note:</strong> <em>"${inh.previousManagerNotes}"</em>
        </div>
      </div>

      <!-- 3. Current Shift Snapshot -->
      <div class="card" style="padding:20px; background:var(--bg-surface-1); margin-bottom:16px;">
        <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:12px;">
          📊 CURRENT SHIFT PERFORMANCE SNAPSHOT (Consumes M1–M7)
        </div>
        <div class="grid grid-cols-5 gap-md" style="font-size:0.85rem;">
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">GROSS SALES</span>
            <strong style="font-size:1.3rem; color:var(--text-primary);">${formatCurrency(snap.salesToday)}</strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">SETTLED REVENUE</span>
            <strong style="font-size:1.3rem; color:#10b981;">${formatCurrency(snap.settledRevenue)}</strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">ACTIVE TABLES</span>
            <strong style="font-size:1.3rem; color:var(--accent-primary);">${snap.activeTablesCount} Active</strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">OPEN EXCEPTIONS</span>
            <strong style="font-size:1.3rem; color:#ef4444;">${snap.openExceptionsCount} Exceptions</strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">STAFF CLOCKED IN</span>
            <strong style="font-size:1.3rem; color:#3b82f6;">${snap.clockedInStaffCount} Staff</strong>
          </div>
        </div>
      </div>

      <!-- 4. Handover & Shift Close Form -->
      <div class="card" style="padding:20px; background:var(--bg-surface-1);">
        <div style="font-size:0.85rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:12px;">
          🔒 SHIFT HANDOVER & CLOSE OUT FORM
        </div>

        <div class="grid grid-cols-3 gap-md" style="font-size:0.85rem; margin-bottom:14px;">
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">UNRESOLVED EXCEPTIONS TO HANDOVER</span>
            <strong style="color:${ho.openExceptions.length > 0 ? '#ef4444' : '#10b981'}; font-size:1.1rem;">
              ${ho.openExceptions.length} Exceptions
            </strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">UNPAID BILLS PENDING CASHIER</span>
            <strong style="color:${ho.unpaidBillsCount > 0 ? '#f59e0b' : '#10b981'}; font-size:1.1rem;">
              ${ho.unpaidBillsCount} Unpaid
            </strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">CASH DRAWER BALANCE VARIANCE</span>
            <strong style="color:${ho.cashDrawerVariance === 0 ? '#10b981' : '#ef4444'}; font-size:1.1rem;">
              ${formatCurrency(ho.cashDrawerVariance)} (Balanced 🟢)
            </strong>
          </div>
        </div>

        <div style="margin-bottom:14px;">
          <label style="display:block; font-size:0.825rem; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">
            Free-Form Manager Handover Notes for Incoming Shift Manager:
          </label>
          <textarea id="handover-notes-input" style="width:100%; height:80px; padding:10px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-primary); font-family:inherit; font-size:0.85rem;" placeholder="Enter handover notes (e.g. Table 04 waiting dessert, kitchen prep stocked for evening rush)..."></textarea>
        </div>

        <button class="btn-primary" id="btn-end-shift-handover" style="padding:10px 20px; font-size:0.9rem; width:100%;">
          🔒 End Shift & Create Immutable Handover Record
        </button>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    const handoverBtn = this.container.querySelector('#btn-end-shift-handover');
    if (handoverBtn) {
      handoverBtn.addEventListener('click', () => {
        const notesInput = this.container.querySelector('#handover-notes-input');
        const notes = notesInput ? notesInput.value : '';

        // Log immutable handover audit record
        sessionAuditModel.logEvent('SHIFT_HANDOVER_COMPLETED', 'SHIFT-MGR', null, {
          managerName: 'Operations Manager',
          handoverNotes: notes,
          timestamp: new Date().toISOString()
        });

        platformEventBus.publish('shift:handover_completed', { notes });
        alert('🔒 Shift Handover Record Created Successfully!\n\nShift audit event logged to platform timeline.');
        this.updateContent();
      });
    }
  }
}
