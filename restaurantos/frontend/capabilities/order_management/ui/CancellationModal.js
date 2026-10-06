/**
 * Capability Group 4 - Line-Item Cancellation Request Modal (Waiter Tablet)
 * Station-controlled cancellation workflow entry point: the waiter never cancels a
 * dispatched line directly - this modal files a REQUESTED record with a controlled
 * reason code against the owning station (KITCHEN/BAR). QUEUED-stage lines auto-approve
 * server-side (entry-error window); PREPARING/READY lines await station decision.
 */

import { cancellationModel, CANCELLATION_REASON_CODES } from '../../../../../businessos/platform/ordering/cancellationModel.js';

const REASON_LABELS = {
  WRONG_ITEM: 'Wrong item ordered',
  WRONG_QUANTITY: 'Wrong quantity',
  CUSTOMER_CHANGED_MIND: 'Customer changed mind',
  DUPLICATE_ORDER: 'Duplicate order',
  TABLE_CHANGE: 'Table change',
  WAITER_ENTRY_ERROR: 'Waiter entry error',
  QUALITY_ISSUE: 'Quality issue',
  KITCHEN_DELAY: 'Kitchen delay',
  BAR_DELAY: 'Bar delay',
  OTHER: 'Other (add note)'
};

export class CancellationModal {
  constructor({ sessionId, orderId, orderLineId, ticketId = null, itemName = 'Item', maxQuantity = 1, station = 'KITCHEN', onResult = null }) {
    this.sessionId = sessionId;
    this.orderId = orderId;
    this.orderLineId = orderLineId;
    this.ticketId = ticketId;
    this.itemName = itemName;
    this.maxQuantity = Math.max(1, parseInt(maxQuantity) || 1);
    this.station = String(station || 'KITCHEN').toUpperCase();
    this.onResult = onResult;
    this.quantity = this.maxQuantity;
    this.modalEl = null;
  }

  /** Convenience: build + mount on document.body (tablet touch targets). */
  static open(options) {
    const modal = new CancellationModal(options);
    document.body.appendChild(modal.render());
    return modal;
  }

  render() {
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'lock-screen-overlay animate-fade-in';
    this.updateContent();
    return this.modalEl;
  }

  updateContent() {
    const reasonOptions = CANCELLATION_REASON_CODES.map(code =>
      `<option value="${code}">${REASON_LABELS[code] || code}</option>`).join('');

    this.modalEl.innerHTML = `
      <div class="card animate-fade-in" style="max-width:480px; width:100%; padding:var(--space-xl);">
        <div style="margin-bottom:var(--space-md);">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">CANCEL ITEM — ${this.station} STATION</div>
          <h2 style="font-size:1.4rem;">Cancel: ${this.itemName}</h2>
        </div>

        <!-- Quantity stepper (remaining line qty max; partial cancels supported) -->
        <div style="display:flex; align-items:center; gap:var(--space-md); margin-bottom:var(--space-lg);">
          <span style="font-weight:700; font-size:0.9rem; min-width:90px;">Quantity</span>
          <button id="btn-cxl-minus" style="width:48px; height:48px; font-size:1.4rem; font-weight:800; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); color:var(--text-primary); cursor:pointer;">−</button>
          <span id="cxl-qty-value" style="font-size:1.5rem; font-weight:800; min-width:56px; text-align:center;">${this.quantity}</span>
          <button id="btn-cxl-plus" style="width:48px; height:48px; font-size:1.4rem; font-weight:800; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); color:var(--text-primary); cursor:pointer;">+</button>
          <span style="font-size:0.75rem; color:var(--text-muted);">max ${this.maxQuantity}</span>
        </div>

        <!-- Controlled reason codes (never free text) -->
        <div style="margin-bottom:var(--space-md);">
          <label style="font-weight:700; font-size:0.9rem; display:block; margin-bottom:6px;" for="cxl-reason">Reason code</label>
          <select id="cxl-reason" style="width:100%; padding:12px; font-size:1rem; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); color:var(--text-primary);">
            ${reasonOptions}
          </select>
        </div>

        <!-- Optional note: revealed for OTHER -->
        <div id="cxl-note-wrap" style="display:none; margin-bottom:var(--space-lg);">
          <label style="font-weight:700; font-size:0.9rem; display:block; margin-bottom:6px;" for="cxl-note">Note (optional)</label>
          <textarea id="cxl-note" rows="2" placeholder="Additional detail for the station…" style="width:100%; padding:10px; font-size:0.9rem; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); color:var(--text-primary); resize:vertical;"></textarea>
        </div>

        <div style="background:rgba(245, 158, 11, 0.08); border-left:4px solid #f59e0b; padding:10px 14px; border-radius:6px; margin-bottom:var(--space-lg); font-size:0.8rem; color:var(--text-secondary);">
          ⏳ Items already being prepared or served require <strong>${this.station === 'BAR' ? 'bar' : 'kitchen'}</strong> approval. Queued items are cancelled immediately.
        </div>

        <div style="display:flex; gap:var(--space-md);">
          <button class="btn-secondary" id="btn-cxl-dismiss" style="flex:1; padding:12px;">← Keep Item</button>
          <button class="btn-primary" id="btn-cxl-submit" style="flex:2; padding:12px; font-weight:800; background:#ef4444; color:#fff; border:none; border-radius:8px; cursor:pointer;">🚫 Request Cancellation</button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const setQty = (v) => {
      this.quantity = Math.min(this.maxQuantity, Math.max(1, v));
      const el = this.modalEl.querySelector('#cxl-qty-value');
      if (el) el.textContent = this.quantity;
    };

    this.modalEl.querySelector('#btn-cxl-minus').addEventListener('click', () => setQty(this.quantity - 1));
    this.modalEl.querySelector('#btn-cxl-plus').addEventListener('click', () => setQty(this.quantity + 1));

    const reasonSel = this.modalEl.querySelector('#cxl-reason');
    reasonSel.value = 'CUSTOMER_CHANGED_MIND';
    reasonSel.addEventListener('change', () => {
      const noteWrap = this.modalEl.querySelector('#cxl-note-wrap');
      noteWrap.style.display = reasonSel.value === 'OTHER' ? 'block' : 'none';
    });

    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });

    this.modalEl.querySelector('#btn-cxl-dismiss').addEventListener('click', () => this.close());

    this.modalEl.querySelector('#btn-cxl-submit').addEventListener('click', () => {
      const result = cancellationModel.requestCancellation({
        sessionId: this.sessionId,
        orderId: this.orderId,
        orderLineId: this.orderLineId,
        ticketId: this.ticketId,
        quantity: this.quantity,
        reasonCode: reasonSel.value,
        reasonText: this.modalEl.querySelector('#cxl-note')?.value || '',
        autoApprove: false
      });
      if (this.onResult) this.onResult(result, { quantity: this.quantity, reasonCode: reasonSel.value });
      if (result.success) this.close();
    });
  }

  close() {
    if (this.modalEl) this.modalEl.remove();
  }
}
