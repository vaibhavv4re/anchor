/**
 * RestaurantOS - Manager Discounts, Voids & Comps Panel (MONEY zone)
 * Live oversight of money leaving the business through voids and discounts, sourced
 * from orders (voided lines) + bill_revisions (discounts) via
 * managerProjectionService.getVoidsCompsProjection. Refresh driven by the shell.
 * Phase C: station-controlled cancellation register (pending dispositions, REVERSED
 * audit rows, manager reversals) via getCancellationProjection.
 */

import { managerProjectionService } from '../../../../../businessos/platform/manager/managerProjectionService.js';
import { cancellationModel } from '../../../../../businessos/platform/ordering/cancellationModel.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

export class ManagerVoidsCompsView {
  constructor(deps = {}) {
    this.tenantId = deps.tenantId || null;
    this.container = null;
    this.unsubscribeEvents = [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'manager-voids-view flex-col gap-lg animate-fade-in';
    this.container.style.width = '100%';
    this.updateContent();

    // Live refresh when stations or waiters move cancellation / hold records.
    ['cancellation:requested', 'cancellation:decided', 'cancellation:reversed', 'cancellation:synced', 'hold:created', 'hold:reused', 'hold:discarded'].forEach(ev => {
      this.unsubscribeEvents.push(platformEventBus.subscribe(ev, () => this.updateContent()));
    });

    return this.container;
  }

  refresh() {
    this.updateContent();
  }

  destroy() {
    (this.unsubscribeEvents || []).forEach(u => { if (typeof u === 'function') u(); });
    this.unsubscribeEvents = [];
  }

  _fmt(val) { return '₹' + Number(val || 0).toLocaleString('en-IN'); }

  _time(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return '—'; }
  }

  updateContent() {
    if (!this.container) return;

    const data = managerProjectionService.getVoidsCompsProjection(this.tenantId);
    const { voidRows, discountRows, voidCount, voidValue, discountCount, discountValue } = data;

    const voidTable = voidRows.length === 0 ? `
      <div class="card" style="padding:20px; text-align:center; color:var(--text-muted); background:var(--bg-surface-1);">No voided items this shift.</div>
    ` : `
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Value</th><th>Reason</th><th>Table</th><th>Time</th></tr></thead>
          <tbody>
            ${voidRows.map(v => `
              <tr>
                <td style="font-weight:600;">${v.item}</td>
                <td>${v.qty}</td>
                <td>${this._fmt(v.value)}</td>
                <td>${v.reason}</td>
                <td>${v.tableLabel}</td>
                <td>${this._time(v.voidedAt)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    const discTable = discountRows.length === 0 ? `
      <div class="card" style="padding:20px; text-align:center; color:var(--text-muted); background:var(--bg-surface-1);">No discounts applied this shift.</div>
    ` : `
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Table</th><th>Amount</th><th>Reason</th><th>Waiter</th><th>Time</th></tr></thead>
          <tbody>
            ${discountRows.map(d => `
              <tr>
                <td style="font-weight:600;">${d.tableCode}</td>
                <td>${this._fmt(d.amount)}</td>
                <td>${d.reason}</td>
                <td>${d.waiterName}</td>
                <td>${this._time(d.timestamp)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h2 style="font-size:1.5rem; margin:0;">✂️ Discounts, Voids & Comps</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Live revenue-leakage oversight • every void reason and discount is accountable</p>
        </div>
        <span class="badge badge-success" style="font-size:0.8rem; padding:6px 12px;">Live from orders & bill revisions</span>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:18px;">
        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #ef4444;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">VOIDED VALUE (${voidCount} items)</div>
          <div style="font-size:1.6rem; font-weight:700; color:#ef4444; margin-top:4px;">${this._fmt(voidValue)}</div>
        </div>
        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #f59e0b;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">DISCOUNTS GIVEN (${discountCount} bills)</div>
          <div style="font-size:1.6rem; font-weight:700; color:#f59e0b; margin-top:4px;">${this._fmt(discountValue)}</div>
        </div>
      </div>

      <div style="margin-bottom:8px; font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#ef4444;">Voided Items</div>
      ${voidTable}

      <div style="margin:18px 0 8px 0; font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#f59e0b;">Discounts by Bill</div>
      ${discTable}

      ${this._renderCancellationSection()}
    `;

    this.bindEvents();
  }

  /**
   * Phase C cancellation register: pending manager dispositions (actionable), the full
   * request ledger with manager reversals, and the immutable REVERSED audit rows.
   */
  _renderCancellationSection() {
    const data = managerProjectionService.getCancellationProjection(this.tenantId);
    const { registerRows, pendingManagerQueue, reversedRows, counts, cancellationRate, cancelledQty, servedQty } = data;
    const actor = this._session();

    const dispositionCards = pendingManagerQueue.length === 0 ? '' : `
      <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#8b5cf6; margin:0 0 8px 0;">🔐 Awaiting Manager Disposition (${pendingManagerQueue.length})</div>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:12px; margin-bottom:16px;">
        ${pendingManagerQueue.map(r => `
          <div class="card" style="padding:14px; background:var(--bg-surface-1); border-left:4px solid #8b5cf6;">
            <div style="font-weight:800; color:var(--text-primary);">${r.quantity}x ${r.itemName} <span style="font-size:0.7rem; color:#8b5cf6;">(${r.station} • ${r.stageAtRequest})</span></div>
            <div style="font-size:0.78rem; color:var(--text-muted); margin:4px 0 10px 0;">Reason: ${String(r.reasonCode || '').replace(/_/g, ' ')} • by ${r.requestedByName}</div>
            <div style="display:flex; gap:8px;">
              <button class="btn-mgr-disposition" data-request-id="${r.id}" data-disposition="HOLD" style="flex:1; padding:8px; font-size:0.8rem; font-weight:800; background:#3b82f6; color:#fff; border:none; border-radius:6px; cursor:pointer;">🧊 Hold For Reuse</button>
              <button class="btn-mgr-disposition" data-request-id="${r.id}" data-disposition="DISCARD" style="flex:1; padding:8px; font-size:0.8rem; font-weight:800; background:#f97316; color:#fff; border:none; border-radius:6px; cursor:pointer;">🗑 Discard</button>
            </div>
          </div>`).join('')}
      </div>`;

    const statusTone = (s) => ({
      REQUESTED: '#f59e0b', APPROVED: '#10b981', AUTO_APPROVED: '#3b82f6',
      REJECTED: '#ef4444', PENDING_MANAGER_DISPOSITION: '#8b5cf6', REVERSED: '#64748b'
    }[s] || '#94a3b8');

    const registerTable = registerRows.length === 0 ? `
      <div class="card" style="padding:20px; text-align:center; color:var(--text-muted); background:var(--bg-surface-1);">No cancellation requests this shift.</div>
    ` : `
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Value</th><th>Station</th><th>Stage</th><th>Reason</th><th>By</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${registerRows.map(r => `
              <tr>
                <td style="font-weight:600;">${r.item}</td>
                <td>${r.qty}</td>
                <td>${this._fmt(r.value)}</td>
                <td>${r.station}</td>
                <td>${r.stage}</td>
                <td>${String(r.reason || '').replace(/_/g, ' ')}</td>
                <td>${r.requestedByName}</td>
                <td><span style="font-size:0.68rem; font-weight:800; padding:2px 6px; border-radius:3px; background:${statusTone(r.status)}22; color:${statusTone(r.status)};">${r.status}</span></td>
                <td>${['APPROVED', 'AUTO_APPROVED'].includes(r.status)
                  ? `<button class="btn-mgr-reversal" data-request-id="${r.id}" title="Manager reversal - restores the line; audit keeps the original request immutable" style="padding:4px 10px; font-size:0.72rem; font-weight:800; background:transparent; color:#ef4444; border:1px solid #ef4444; border-radius:4px; cursor:pointer;">↩ Reverse</button>`
                  : '<span style="color:var(--text-muted);">—</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    const reversedTable = reversedRows.length === 0 ? '' : `
      <div style="margin:16px 0 8px 0; font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748b;">Reversed Cancellations (Audit) — ${reversedRows.length}</div>
      <div class="table-responsive">
        <table class="data-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Reversed By</th><th>At</th><th>Note</th></tr></thead>
          <tbody>
            ${reversedRows.map(r => `
              <tr>
                <td style="font-weight:600;">${r.itemName}</td>
                <td>${r.quantity}</td>
                <td>${r.decidedBy || '—'}</td>
                <td>${this._time(r.decidedAt)}</td>
                <td>${r.decisionNote || 'Manager reversal (original request kept immutable)'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    return `
      <div style="margin-top:26px; border-top:1px solid var(--border-subtle); padding-top:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
          <div style="font-size:0.85rem; font-weight:800; text-transform:uppercase; color:#8b5cf6;">🚫 Cancellation Register</div>
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">
            ${counts.requested} open • ${counts.approved + counts.autoApproved} approved • ${counts.rejected} rejected • ${counts.reversed} reversed •
            rate ${cancellationRate === null ? '—' : cancellationRate + '%'} (cancelled ${cancelledQty} vs served ${servedQty})
          </div>
        </div>
        ${actor && (/manager|admin|owner/.test(String(actor.role || actor.userRole || actor.employeeRole || actor.roleId || actor.roleName || actor.workspace || '').toLowerCase()) || (actor.permissions || []).map(String).includes('CANCEL_REVERSE')) ? dispositionCards : ''}
        ${registerTable}
        ${reversedTable}
      </div>`;
  }

  _session() {
    try { return JSON.parse(sessionStorage.getItem('ros_session') || '{}'); } catch (_) { return {}; }
  }

  bindEvents() {
    if (!this.container) return;

    // Manager disposition queue: HOLD vs DISCARD on PENDING_MANAGER_DISPOSITION requests.
    this.container.querySelectorAll('.btn-mgr-disposition').forEach(btn => {
      btn.addEventListener('click', () => {
        const res = cancellationModel.decideCancellation(
          btn.dataset.requestId, 'APPROVE', this._session(),
          { disposition: btn.dataset.disposition }, this.tenantId
        );
        if (!res.success) window.alert(`Disposition blocked: ${String(res.error).replace(/_/g, ' ')}`);
        this.updateContent();
      });
    });

    // Manager reversal (authority-gated in cancellationModel via CANCEL_REVERSE).
    this.container.querySelectorAll('.btn-mgr-reversal').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!window.confirm('Reverse this cancellation? The line returns to its prior stage; the audit record stays immutable.')) return;
        const res = cancellationModel.reverseCancellation(btn.dataset.requestId, this._session(), this.tenantId);
        if (!res.success) window.alert(`Reversal blocked: ${String(res.error).replace(/_/g, ' ')}`);
        this.updateContent();
      });
    });
  }
}
