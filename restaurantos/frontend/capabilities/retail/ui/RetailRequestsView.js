/**
 * RestaurantOS Capability - Retail Request Stock (Retail Phase 2)
 *
 * Retail is a PURE CONSUMER of the Inventory Core, exactly like Kitchen/Bar.
 * This view lets retail staff RAISE a replenishment requisition via the
 * certified retailReplenishmentModel (inventory_requests, PENDING_FULFILLMENT,
 * strictly ZERO stock movement) and shows the live history of their requests
 * plus the manager-side warehouse transfers (LOC-805 -> LOC-RETAIL) that
 * fulfilled them. Retail never moves stock itself - there is deliberately no
 * transfer-posting form here.
 */

import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { retailReplenishmentModel } from '../../../../../businessos/platform/retail/retailReplenishmentModel.js';
import {
  RETAIL_LOCATION, resolveGateway, readRetailBalances, readCollection, catalogByItem, retailItemCodes, displayName
} from './retailInventorySupport.js';

const STATUS_COLORS = {
  PENDING_FULFILLMENT: '#f59e0b',
  APPROVED: '#3b82f6',
  COMPLETED: '#10b981',
  REJECTED: '#ef4444',
  CANCELLED: '#6b7280'
};

export class RetailRequestsView {
  constructor(deps = {}) {
    this.deps = deps;
    this.dataGateway = deps.dataGateway || null;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
    this.replenishmentModel = deps.retailReplenishmentModel || retailReplenishmentModel;
    this.container = null;
    this.session = null;
    this.tenantId = 'tenant_h0qc7wf';
    this.notice = null;
    this.itemCode = '';
    this.qty = '';
    this.notes = '';
    this.submitting = false;
    this.unsubscribeEvents = [];
    this._subscribed = false;
  }

  render(container, session = null) {
    this.container = container;
    this.session = session || {};
    this.tenantId = this.session.tenantId || this.session.tenant_id || 'tenant_h0qc7wf';
    if (!this._subscribed && this.platformEventBus && typeof this.platformEventBus.subscribe === 'function') {
      this._subscribed = true;
      const unsubA = this.platformEventBus.subscribe('retail:replenishment_requested', () => { if (this.container) this.update(); });
      const unsubB = this.platformEventBus.subscribe('retail:replenishment_fulfilled', () => { if (this.container) this.update(); });
      [unsubA, unsubB].forEach(u => { if (typeof u === 'function') this.unsubscribeEvents.push(u); });
    }
    this.update();
    return container;
  }

  _gateway() { return resolveGateway(this.dataGateway); }
  _esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  _dt(v) { return v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }

  async _submit() {
    this.notice = null;
    const itemCode = String(this.itemCode || '').trim();
    const qty = parseFloat(this.qty) || 0;
    if (!itemCode) { this.notice = '⚠️ Select an item to request.'; return this.update(); }
    if (qty <= 0) { this.notice = '⚠️ Requested quantity must be greater than 0.'; return this.update(); }
    this.submitting = true;
    try {
      const res = await this.replenishmentModel.createRetailReplenishmentRequest({
        itemCode,
        requestedQty: qty,
        requestedBy: this.session.employeeName || this.session.userName || 'Retail Staff',
        notes: this.notes || '',
        session: this.session
      }, this.tenantId);
      this.notice = `✅ ${res.requestNumber} raised for ${qty} ${res.uom || ''} of ${res.itemName} — Status: PENDING_FULFILLMENT (no stock moved until the Inventory Manager fulfils it).`;
      this.qty = '';
      this.notes = '';
    } catch (err) {
      this.notice = '⚠️ ' + (err.message || 'Failed to raise request.');
    }
    this.submitting = false;
    this.update();
  }

  update() {
    if (!this.container) return;
    const gateway = this._gateway();

    // Requisition picker options: live retail SKUs from the shared inventory
    // master (catalogue ∪ stocked at LOC-RETAIL), enriched with on-hand + UOM.
    const balances = readRetailBalances(this.tenantId, gateway);
    const catalog = catalogByItem(this.tenantId);
    const masterByItem = new Map();
    readCollection('inventory', this.tenantId, gateway).forEach(i => {
      const code = i.itemCode || i.item_code;
      if (code) masterByItem.set(code, i);
    });
    const options = retailItemCodes(this.tenantId, gateway)
      .filter(code => masterByItem.has(code)) // requests must reference live master SKUs
      .map(code => {
        const onHand = (balances.get(code) || {}).quantity || 0;
        return { code, name: displayName(code, catalog), onHand };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const notInMaster = retailItemCodes(this.tenantId, gateway).filter(code => !masterByItem.has(code)).length;

    const requests = this.replenishmentModel.getRetailReplenishmentRequests(this.tenantId);
    const pending = requests.filter(r => r.status === 'PENDING_FULFILLMENT' || r.status === 'APPROVED').length;

    // Read-only transfer history touching the retail store (manager-side moves).
    const transfers = readCollection('stock_transfers', this.tenantId, gateway)
      .filter(t => {
        const from = t.fromLocationCode || t.from_location_code || '';
        const to = t.toLocationCode || t.to_location_code || '';
        return from === RETAIL_LOCATION || to === RETAIL_LOCATION;
      })
      .slice(0, 20);

    this.container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px; height:100%; overflow-y:auto;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">📩 Request Stock · ${RETAIL_LOCATION}</h3>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:3px;">${requests.length} requisition(s) · ${pending} awaiting fulfilment by the Inventory Manager</div>
        </div>

        <div style="padding:12px 16px; border-radius:10px; border:1px solid var(--border-subtle); background:var(--bg-surface); font-size:0.84rem; color:var(--text-secondary);">
          ℹ️ <strong>REQUEST ≠ STOCK MOVEMENT:</strong> raising a requisition registers an operational snapshot in
          <code>inventory_requests</code> with <code>PENDING_FULFILLMENT</code>. Balances and ledger stay untouched until the
          Inventory Manager transfers stock from the main warehouse (LOC-805 → ${RETAIL_LOCATION}) — same flow as Kitchen and Bar.
        </div>

        ${options.length === 0 ? `
          <div style="padding:14px 16px; border-radius:10px; border:1px dashed var(--border-subtle); background:var(--bg-surface); font-size:0.85rem; color:var(--text-muted);">
            ⚠️ No live inventory SKUs are mapped to the retail catalogue yet. Link retail products to main
            <code>inventory</code> itemCodes (Wine Catalogue) before raising requests${notInMaster ? ` — ${notInMaster} catalogue SKU(s) have no master mapping` : ''}.
          </div>
        ` : `
        <div class="card" style="padding:14px 16px; border:1px solid var(--border-subtle); border-radius:12px; background:var(--bg-surface);">
          <div style="font-weight:800; font-size:0.9rem; margin-bottom:10px;">New requisition</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <select id="rq-item" style="flex:2; min-width:200px; padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);">
              <option value="">Select item…</option>
              ${options.map(o => `<option value="${this._esc(o.code)}"${o.code === this.itemCode ? ' selected' : ''}>${this._esc(o.name)} · ${o.code} (on hand: ${o.onHand})</option>`).join('')}
            </select>
            <input id="rq-qty" type="number" min="1" step="1" placeholder="Qty" value="${this._esc(this.qty)}" style="flex:1; min-width:90px; padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);"/>
            <input id="rq-notes" type="text" placeholder="Notes (optional)" value="${this._esc(this.notes)}" style="flex:2; min-width:160px; padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);"/>
            <button id="rq-submit" ${this.submitting ? 'disabled' : ''} style="padding:9px 18px; border-radius:8px; border:none; background:var(--accent-primary); color:#fff; font-weight:800; cursor:pointer; ${this.submitting ? 'opacity:0.6;' : ''}">${this.submitting ? 'Submitting…' : 'Raise Request'}</button>
          </div>
        </div>`}

        ${this.notice ? `<div style="padding:10px 14px; border-radius:8px; background:rgba(59,130,246,0.12); color:var(--accent-primary); font-size:0.85rem;">${this._esc(this.notice)}</div>` : ''}

        <div class="card" style="border:1px solid var(--border-subtle); border-radius:12px; overflow:hidden;">
          <div style="padding:12px 14px; font-weight:800; font-size:0.9rem; border-bottom:1px solid var(--border-subtle);">Requisition history</div>
          <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
            <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:left;">
              <th style="padding:9px 14px;">Request</th>
              <th style="padding:9px 14px;">Item</th>
              <th style="padding:9px 14px; text-align:right;">Qty</th>
              <th style="padding:9px 14px;">On hand at request</th>
              <th style="padding:9px 14px;">Raised</th>
              <th style="padding:9px 14px;">Status</th>
              <th style="padding:9px 14px;">Transfer</th>
            </tr></thead>
            <tbody>
              ${requests.map(r => {
                const color = STATUS_COLORS[r.status] || 'var(--text-muted)';
                return `<tr style="border-top:1px solid var(--border-subtle);">
                  <td style="padding:8px 14px; font-family:monospace; font-size:0.78rem;">${this._esc(r.requestNumber || r.request_number || r.id)}</td>
                  <td style="padding:8px 14px; color:var(--text-primary);">${this._esc(r.itemName || r.item_name || r.itemCode || '')}</td>
                  <td style="padding:8px 14px; text-align:right; font-weight:700;">${this._esc(r.requestedQuantity != null ? r.requestedQuantity : r.requested_quantity)} <span style="color:var(--text-muted); font-weight:500; font-size:0.75rem;">${this._esc(r.uom || '')}</span></td>
                  <td style="padding:8px 14px; color:var(--text-muted);">${this._esc(r.onHandAtRequest != null ? r.onHandAtRequest : r.on_hand_at_request)}</td>
                  <td style="padding:8px 14px; color:var(--text-muted);">${this._dt(r.requestedAt || r.requested_at || r.createdAt)}</td>
                  <td style="padding:8px 14px; color:${color}; font-weight:800; font-size:0.78rem;">${this._esc(r.status)}</td>
                  <td style="padding:8px 14px; font-family:monospace; font-size:0.76rem; color:var(--text-muted);">${this._esc(r.fulfillmentTransferId || r.fulfillment_transfer_id || '—')}</td>
                </tr>`;
              }).join('') || `<tr><td colspan="7" style="padding:24px; text-align:center; color:var(--text-muted);">No requisitions raised yet.</td></tr>`}
            </tbody>
          </table>
        </div>

        <div class="card" style="border:1px solid var(--border-subtle); border-radius:12px; overflow:hidden;">
          <div style="padding:12px 14px; font-weight:800; font-size:0.9rem; border-bottom:1px solid var(--border-subtle);">Stock transfers involving ${RETAIL_LOCATION} <span style="font-weight:500; color:var(--text-muted); font-size:0.75rem;">(posted by Inventory Manager · read-only)</span></div>
          <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
            <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:left;">
              <th style="padding:9px 14px;">Transfer</th>
              <th style="padding:9px 14px;">Route</th>
              <th style="padding:9px 14px;">Posted</th>
              <th style="padding:9px 14px;">Notes</th>
            </tr></thead>
            <tbody>
              ${transfers.map(t => `
                <tr style="border-top:1px solid var(--border-subtle);">
                  <td style="padding:8px 14px; font-family:monospace; font-size:0.78rem;">${this._esc(t.transferNo || t.transfer_no || t.id)}</td>
                  <td style="padding:8px 14px; color:var(--text-secondary);">${this._esc(t.fromLocationCode || t.from_location_code || '')} → ${this._esc(t.toLocationCode || t.to_location_code || '')}</td>
                  <td style="padding:8px 14px; color:var(--text-muted);">${this._dt(t.createdAt || t.created_at || t.postedAt)}</td>
                  <td style="padding:8px 14px; color:var(--text-muted); max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this._esc(t.notes || '')}</td>
                </tr>`).join('') || `<tr><td colspan="4" style="padding:24px; text-align:center; color:var(--text-muted);">No transfers to/from ${RETAIL_LOCATION} yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    this._bind();
  }

  _bind() {
    const c = this.container; if (!c) return;
    const on = (sel, ev, fn) => { const el = c.querySelector(sel); if (el) el.addEventListener(ev, fn); };
    on('#rq-item', 'change', e => { this.itemCode = e.target.value; });
    on('#rq-qty', 'input', e => { this.qty = e.target.value; });
    on('#rq-notes', 'input', e => { this.notes = e.target.value; });
    on('#rq-submit', 'click', () => this._submit());
  }

  destroy() {
    (this.unsubscribeEvents || []).forEach(u => { if (typeof u === 'function') u(); });
    this.unsubscribeEvents = [];
  }
}
