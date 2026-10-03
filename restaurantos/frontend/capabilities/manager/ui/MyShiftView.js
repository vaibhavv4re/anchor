/**
 * RestaurantOS - Phase M8: Manager My Shift & Handover View
 * Manager shift status, live handover context, current-shift snapshot, and the
 * shift-register capture (opening float -> physical cash count -> handover notes).
 *
 * Honest by design:
 *  - Identity + clock-in come from the live session and the attendance record.
 *  - Cash-drawer variance is only shown when a register has actually been counted.
 *  - shift_registers is device-local (no Supabase table yet) and is labelled as such.
 * ZERO independent calculation — consumes M1–M7 projections + shiftRegisterService.
 */

import { managerProjectionService } from '../../../../../businessos/platform/manager/managerProjectionService.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { shiftRegisterService } from '../../../../../businessos/platform/manager/shiftRegisterService.js';

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

    this.updateContent();

    return this.container;
  }

  refresh() {
    this.updateContent();
  }

  destroy() {
    (this.unsubscribeEvents || []).forEach(u => { if (typeof u === 'function') u(); });
    this.unsubscribeEvents = [];
  }

  formatCurrency(val) {
    return '₹' + Number(val || 0).toLocaleString('en-IN');
  }

  // Escape user/manager-authored text before interpolating into innerHTML.
  esc(val) {
    return String(val === null || val === undefined ? '' : val)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  money(val) {
    return (val === null || val === undefined) ? '—' : this.formatCurrency(val);
  }

  formatElapsed(min) {
    if (min === null || min === undefined) return '—';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  formatTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  updateContent() {
    if (!this.container) return;

    const data = managerProjectionService.getMyShiftHandoverProjection(this.tenantId);
    const info = data.managerInfo || {};
    const reg = data.register;
    const ctx = data.handoverContext || {};
    const snap = data.currentShiftSnapshot || {};
    const ho = data.handoverState || {};

    const activeStatus = info.status === 'ACTIVE_SHIFT';

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h2 style="font-size:1.5rem; margin:0;">🕐 My Shift & Handover (Phase M8)</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Live shift status • Register capture • Handover snapshot</p>
        </div>
        <span class="badge ${activeStatus ? 'badge-success' : 'badge-warning'}" style="font-size:0.85rem; padding:6px 14px;">
          ${activeStatus ? `🟢 Active Shift (${this.formatElapsed(info.shiftElapsedMin)})` : '⚪ Not clocked in'}
        </span>
      </div>

      <!-- 1. My Shift Info Card -->
      <div class="card" style="padding:20px; background:var(--bg-surface-1); border-left:5px solid var(--accent-primary); margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">CURRENT SHIFT MANAGER</div>
            <h3 style="margin:4px 0 2px 0; font-size:1.3rem;">${this.esc(info.name || 'Manager')} (${this.esc(info.role || 'manager')})</h3>
            <div style="font-size:0.85rem; color:var(--text-secondary);">
              Clocked In: <strong>${this.formatTime(info.clockInTime)}</strong> • Elapsed: <strong>${this.formatElapsed(info.shiftElapsedMin)}</strong>
            </div>
          </div>
          <span class="badge ${activeStatus ? 'badge-success' : 'badge-info'}" style="font-size:0.9rem; padding:8px 16px;">
            ${activeStatus ? 'ON SHIFT' : 'NO ACTIVE CLOCK-IN'}
          </span>
        </div>
      </div>

      <!-- 2. Shift Register + Handover Capture -->
      <div class="card" style="padding:20px; background:var(--bg-surface-1); margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
          <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:var(--text-muted);">
            💵 Shift Register & Handover
          </div>
          <span class="badge badge-info" style="font-size:0.7rem; padding:4px 10px;" title="No Supabase table yet — persisted on this device only.">
            📱 Local • not realtime
          </span>
        </div>
        ${this.renderRegisterBlock(reg, ctx)}
      </div>

      <!-- 3. Current Shift Snapshot -->
      <div class="card" style="padding:20px; background:var(--bg-surface-1); margin-bottom:16px;">
        <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:12px;">
          📊 CURRENT SHIFT SNAPSHOT (Consumes M1–M7)
        </div>
        <div class="grid grid-cols-5 gap-md" style="font-size:0.85rem;">
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">GROSS SALES</span>
            <strong style="font-size:1.3rem; color:var(--text-primary);">${this.money(snap.salesToday)}</strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">SETTLED REVENUE</span>
            <strong style="font-size:1.3rem; color:#10b981;">${this.money(snap.settledRevenue)}</strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">ACTIVE TABLES</span>
            <strong style="font-size:1.3rem; color:var(--accent-primary);">${snap.activeTablesCount ?? 0} Active</strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">OPEN EXCEPTIONS</span>
            <strong style="font-size:1.3rem; color:#ef4444;">${snap.openExceptionsCount ?? 0} Exceptions</strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">STAFF CLOCKED IN</span>
            <strong style="font-size:1.3rem; color:#3b82f6;">${snap.clockedInStaffCount ?? 0} Staff</strong>
          </div>
        </div>
      </div>

      <!-- 4. Handover Readiness -->
      <div class="card" style="padding:20px; background:var(--bg-surface-1);">
        <div style="font-size:0.85rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:12px;">
          🔒 What The Incoming Manager Inherits (Live)
        </div>
        <div class="grid grid-cols-3 gap-md" style="font-size:0.85rem;">
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">UNRESOLVED EXCEPTIONS</span>
            <strong style="color:${(ho.openExceptions || []).length > 0 ? '#ef4444' : '#10b981'}; font-size:1.1rem;">
              ${(ho.openExceptions || []).length} Exceptions
            </strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">UNPAID BILLS PENDING CASHIER</span>
            <strong style="color:${(ho.unpaidBillsCount || 0) > 0 ? '#f59e0b' : '#10b981'}; font-size:1.1rem;">
              ${ho.unpaidBillsCount || 0} Unpaid
            </strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">CASH DRAWER VARIANCE</span>
            ${this.renderVarianceInline(ho.cashDrawerVariance)}
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  renderVarianceInline(variance) {
    if (variance === null || variance === undefined) {
      return `<strong style="color:var(--text-muted); font-size:1.1rem;">Not counted yet</strong>`;
    }
    const balanced = variance === 0;
    const tone = balanced ? '#10b981' : '#ef4444';
    return `<strong style="color:${tone}; font-size:1.1rem;">${this.formatCurrency(variance)} (${balanced ? 'Balanced' : (variance > 0 ? 'Over' : 'Short')})</strong>`;
  }

  renderRegisterBlock(reg, ctx) {
    // No register opened yet -> capture the opening float first.
    if (!reg) {
      return `
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div style="font-size:0.85rem; color:var(--text-secondary); background:var(--bg-surface-2); padding:12px 14px; border-radius:6px; border:1px dashed var(--border-subtle);">
            ⚠️ No shift register has been opened on this device yet. Cash-drawer variance stays
            unavailable until the opening float is recorded.
          </div>
          <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
            <div style="display:flex; flex-direction:column; gap:4px;">
              <label style="font-size:0.78rem; font-weight:600; color:var(--text-secondary);">Opening Cash Float (₹)</label>
              <input type="number" id="opening-float-input" min="0" step="1" placeholder="e.g. 5000"
                style="padding:10px 12px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-primary); font-size:0.9rem; width:180px;" />
            </div>
            <button class="btn-primary" id="btn-open-register" style="padding:10px 18px; font-size:0.88rem;">Open Register</button>
          </div>
        </div>
      `;
    }

    // Register is OPEN -> show captured state + cash count + handover + close.
    return `
      <div style="display:flex; flex-direction:column; gap:14px;">
        <div class="grid grid-cols-3 gap-md" style="font-size:0.825rem;">
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">OPENING FLOAT</span>
            <strong style="font-size:1.15rem; color:var(--text-primary);">${this.money(reg.openingCashFloat)}</strong>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">OPENED</span>
            <strong style="font-size:0.95rem; color:var(--text-primary);">${this.formatTime(reg.openedAt)}</strong>
            <div style="font-size:0.72rem; color:var(--text-muted);">by ${this.esc(reg.openedBy || 'Manager')}</div>
          </div>
          <div style="background:var(--bg-surface-2); padding:12px; border-radius:6px;">
            <span style="color:var(--text-muted); font-size:0.725rem; display:block;">LAST CASH COUNT</span>
            <strong style="font-size:1.15rem; color:${reg.countedCash === null || reg.countedCash === undefined ? 'var(--text-muted)' : '#3b82f6'};">${this.money(reg.countedCash)}</strong>
            ${reg.countedCash === null || reg.countedCash === undefined ? '<div style="font-size:0.72rem; color:#f59e0b;">not counted yet</div>' : ''}
          </div>
        </div>

        <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
          <div style="display:flex; flex-direction:column; gap:4px;">
            <label style="font-size:0.78rem; font-weight:600; color:var(--text-secondary);">Physical Cash In Drawer (₹)</label>
            <input type="number" id="counted-cash-input" min="0" step="1" placeholder="Count the drawer"
              value="${(reg.countedCash === null || reg.countedCash === undefined) ? '' : reg.countedCash}"
              style="padding:10px 12px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-primary); font-size:0.9rem; width:180px;" />
          </div>
          <button class="btn-secondary" id="btn-record-cash-count" style="padding:10px 16px; font-size:0.85rem;">Record Cash Count</button>
        </div>

        <div>
          <label style="display:block; font-size:0.78rem; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">
            Handover Notes For Incoming Manager
          </label>
          <textarea id="handover-notes-input" placeholder="e.g. Table 04 waiting dessert, kitchen prep stocked for evening rush..."
            style="width:100%; height:70px; padding:10px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-primary); font-family:inherit; font-size:0.85rem;">${this.esc(reg.handoverNotes || '')}</textarea>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn-secondary" id="btn-save-handover-notes" style="padding:10px 16px; font-size:0.85rem;">💾 Save Handover Notes</button>
          <button class="btn-primary" id="btn-end-shift-handover" style="padding:10px 20px; font-size:0.9rem;">🔒 End Shift & Close Register</button>
        </div>
      </div>
    `;
  }

  bindEvents() {
    if (!this.container) return;

    const openBtn = this.container.querySelector('#btn-open-register');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const input = this.container.querySelector('#opening-float-input');
        const openingFloat = input ? parseFloat(input.value) : 0;
        if (isNaN(openingFloat) || openingFloat < 0) {
          alert('Enter a valid opening cash float.');
          return;
        }
        shiftRegisterService.openRegister({ tenantId: this.tenantId, openingFloat });
        platformEventBus.publish('shift:register:updated', { source: 'myShift.open' });
        this.updateContent();
      });
    }

    const countBtn = this.container.querySelector('#btn-record-cash-count');
    if (countBtn) {
      countBtn.addEventListener('click', () => {
        const input = this.container.querySelector('#counted-cash-input');
        const countedCash = input ? parseFloat(input.value) : NaN;
        if (isNaN(countedCash) || countedCash < 0) {
          alert('Enter the physical cash counted in the drawer.');
          return;
        }
        shiftRegisterService.recordCashCount({ tenantId: this.tenantId, countedCash });
        platformEventBus.publish('shift:register:updated', { source: 'myShift.count' });
        this.updateContent();
      });
    }

    const saveNotesBtn = this.container.querySelector('#btn-save-handover-notes');
    if (saveNotesBtn) {
      saveNotesBtn.addEventListener('click', () => {
        const notesInput = this.container.querySelector('#handover-notes-input');
        const notes = notesInput ? notesInput.value : '';
        shiftRegisterService.recordHandover({ tenantId: this.tenantId, notes });
        platformEventBus.publish('shift:handover_completed', { notes });
        this.updateContent();
      });
    }

    const endBtn = this.container.querySelector('#btn-end-shift-handover');
    if (endBtn) {
      endBtn.addEventListener('click', () => {
        const countInput = this.container.querySelector('#counted-cash-input');
        const notesInput = this.container.querySelector('#handover-notes-input');
        const countedCash = countInput && countInput.value !== '' ? parseFloat(countInput.value) : null;
        const notes = notesInput ? notesInput.value : '';
        shiftRegisterService.closeRegister({ tenantId: this.tenantId, countedCash, notes });
        platformEventBus.publish('shift:handover_completed', { notes });
        platformEventBus.publish('shift:register:updated', { source: 'myShift.close' });
        this.updateContent();
      });
    }
  }
}
