/**
 * RestaurantOS Capability - Retail Returns & Refunds (Retail Phase 4)
 *
 * Reverse the RetailSale boundary cleanly. Pick a confirmed (or partially
 * refunded) sale, choose how many of each line to return, and refund. The heavy
 * lifting is retailSaleModel.refund(): it always books a register REFUND + a
 * RETAIL-series credit note + a refund settlement, and returns stock to
 * LOC-RETAIL ONLY when "restock" (unopened bottles) is ticked. This view is the
 * thin operator surface over that one keyed, idempotent call.
 */

import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { retailSaleModel } from '../../../../../businessos/platform/retail/retailSaleModel.js';

export class RetailReturnsView {
  constructor(deps = {}) {
    this.deps = deps;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
    this.saleModel = deps.retailSaleModel || retailSaleModel;
    this.container = null;
    this.session = null;
    this.tenantId = 'tenant_h0qc7wf';
    this.selectedSale = null;   // saleNumber of the open refund ticket
    this.qtyById = {};          // { itemCode: remaining-to-refund string }
    this.restock = true;
    this.reason = '';
    this.paymentMethod = 'CASH';
    this.notice = null;
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
      const u = this.platformEventBus.subscribe('retail:sale:refunded', () => { if (this.container) this.update(); });
      if (typeof u === 'function') this.unsubscribeEvents.push(u);
    }
    this.update();
    return container;
  }

  _esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  _inr(n) { return '₹' + (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  _dt(v) { return v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }

  _remaining(line) {
    return Math.round((Math.max(0, (parseFloat(line.quantity) || 0) - (parseFloat(line.refundedQuantity) || 0))) * 1000) / 1000;
  }

  _selectSale(saleNumber) {
    this.selectedSale = saleNumber || null;
    this.qtyById = {};
    this.notice = null;
    if (saleNumber) {
      const sale = this.saleModel.findSale(saleNumber, this.tenantId);
      if (sale) (sale.lines || []).forEach(l => { this.qtyById[l.itemCode] = String(this._remaining(l)); });
    }
    this.update();
  }

  _fullRefund() {
    const sale = this.saleModel.findSale(this.selectedSale, this.tenantId);
    if (!sale) return;
    (sale.lines || []).forEach(l => { this.qtyById[l.itemCode] = String(this._remaining(l)); });
    this.notice = null;
    this.update();
  }

  _clearLines() {
    (this.selectedSale && this.saleModel.findSale(this.selectedSale, this.tenantId) || { lines: [] }).lines
      .forEach(l => { this.qtyById[l.itemCode] = '0'; });
    this.update();
  }

  async _submit() {
    if (!this.selectedSale) { this.notice = '⚠️ Select a sale to refund.'; return this.update(); }
    const sale = this.saleModel.findSale(this.selectedSale, this.tenantId);
    if (!sale) { this.notice = '⚠️ Sale not found.'; return this.update(); }

    const lines = (sale.lines || []).map(l => ({
      itemCode: l.itemCode, productCode: l.productCode,
      quantity: parseFloat(this.qtyById[l.itemCode]) || 0
    })).filter(l => l.quantity > 0);

    if (!lines.length) { this.notice = '⚠️ Enter a quantity greater than 0 to refund.'; return this.update(); }

    this.submitting = true;
    this.notice = null;
    try {
      const res = await this.saleModel.refund(this.selectedSale, {
        lines, reason: this.reason, restock: this.restock, paymentMethod: this.paymentMethod,
        operatorName: this.session.employeeName || this.session.name, tenantId: this.tenantId
      }, this.session);
      this.notice = `✅ Refunded ${this._inr(res.refundAmount)} · credit note ${res.creditNoteNumber} · ${res.restock ? 'stock returned to LOC-RETAIL' : 'no restock'} · sale now ${res.status}.`;
      this.selectedSale = null; this.qtyById = {}; this.reason = '';
    } catch (err) {
      const map = {
        RETAIL_SALE_ALREADY_REFUNDED: 'that sale is already fully refunded.',
        RETAIL_NOTHING_TO_REFUND: 'the selected quantities exceed what is left to refund.',
        RETAIL_SALE_NOT_FOUND: 'the sale could not be found.'
      };
      this.notice = '⚠️ ' + (map[err.code] || err.message || 'Refund failed.');
    }
    this.submitting = false;
    this.update();
  }

  update() {
    if (!this.container) return;
    const sales = this.saleModel.getAllSales(this.tenantId)
      .slice()
      .sort((a, b) => String(b.occurredAt || b.occurred_at || '').localeCompare(String(a.occurredAt || a.occurred_at || '')));
    const refundable = sales.filter(s => ['CONFIRMED', 'PARTIALLY_REFUNDED'].includes((s.status || 'CONFIRMED').toUpperCase()));
    const selected = this.selectedSale ? this.saleModel.findSale(this.selectedSale, this.tenantId) : null;

    const saleOptions = refundable.map(s => {
      const rem = (s.lines || []).reduce((a, l) => a + this._remaining(l), 0);
      return `<option value="${this._esc(s.saleNumber)}"${this.selectedSale === s.saleNumber ? ' selected' : ''}>${this._esc(s.saleNumber)} · ${this._esc(s.customerName || 'Walk-in')} · ${this._inr(s.grandTotal)} · ${rem} unit(s) refundable</option>`;
    }).join('');

    this.container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px; height:100%; overflow-y:auto;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">↩️ Returns &amp; Refunds</h3>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:3px;">Refunds book a credit note + register REFUND on RETAIL-01. Stock returns to ${'LOC-RETAIL'} only when "restock" is ticked.</div>
        </div>

        <div class="card" style="padding:14px 16px; border:1px solid var(--border-subtle); border-radius:12px; background:var(--bg-surface); display:flex; flex-direction:column; gap:12px;">
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <select id="rt-sale" style="flex:2; min-width:240px; padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);">
              <option value="">Select a sale to refund…</option>
              ${saleOptions || '<option disabled>No refundable sales</option>'}
            </select>
          </div>

          ${selected ? this._renderTicket(selected) : `<div style="padding:14px 16px; border-radius:10px; border:1px dashed var(--border-subtle); background:var(--bg-surface); font-size:0.85rem; color:var(--text-muted);">🧾 Pick a sale above to open its refund ticket.</div>`}
        </div>

        ${this.notice ? `<div style="padding:10px 14px; border-radius:8px; background:rgba(59,130,246,0.12); color:var(--accent-primary); font-size:0.85rem;">${this._esc(this.notice)}</div>` : ''}

        <div class="card" style="border:1px solid var(--border-subtle); border-radius:12px; overflow:hidden;">
          <div style="padding:12px 14px; font-weight:800; font-size:0.9rem; border-bottom:1px solid var(--border-subtle);">Recent sales</div>
          <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
            <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:left;">
              <th style="padding:9px 14px;">Sale</th><th style="padding:9px 14px;">Invoice</th><th style="padding:9px 14px;">Customer</th>
              <th style="padding:9px 14px; text-align:right;">Total</th><th style="padding:9px 14px;">When</th><th style="padding:9px 14px;">Status</th>
            </tr></thead>
            <tbody>
              ${sales.slice(0, 25).map(s => {
                const color = s.status === 'REFUNDED' ? '#ef4444' : s.status === 'PARTIALLY_REFUNDED' ? '#f59e0b' : '#10b981';
                return `<tr style="border-top:1px solid var(--border-subtle); cursor:pointer;" class="rt-row" data-sale="${this._esc(s.saleNumber)}">
                  <td style="padding:8px 14px; font-family:monospace; font-size:0.78rem;">${this._esc(s.saleNumber)}</td>
                  <td style="padding:8px 14px; font-family:monospace; font-size:0.76rem; color:var(--text-muted);">${this._esc(s.invoiceNumber || '—')}</td>
                  <td style="padding:8px 14px;">${this._esc(s.customerName || 'Walk-in')}</td>
                  <td style="padding:8px 14px; text-align:right; font-weight:700;">${this._inr(s.grandTotal)}</td>
                  <td style="padding:8px 14px; color:var(--text-muted);">${this._dt(s.occurredAt || s.occurred_at)}</td>
                  <td style="padding:8px 14px; color:${color}; font-weight:800; font-size:0.76rem;">${this._esc(s.status)}</td>
                </tr>`;
              }).join('') || `<tr><td colspan="6" style="padding:24px; text-align:center; color:var(--text-muted);">No retail sales yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    this._bind();
  }

  _renderTicket(sale) {
    const lines = (sale.lines || []).map(l => {
      const rem = this._remaining(l);
      const val = this.qtyById[l.itemCode] != null ? this.qtyById[l.itemCode] : String(rem);
      return `<tr style="border-top:1px solid var(--border-subtle);">
        <td style="padding:8px 14px;">${this._esc(l.name)} <span style="color:var(--text-muted); font-size:0.75rem;">(${this._esc(l.itemCode)})</span></td>
        <td style="padding:8px 14px; color:var(--text-muted);">${this._esc(l.quantity)} sold · ${this._esc(rem)} refundable</td>
        <td style="padding:8px 14px; text-align:right; color:var(--text-muted);">${this._inr(l.price)}</td>
        <td style="padding:8px 14px; width:110px;"><input class="rt-qty" data-item="${this._esc(l.itemCode)}" type="number" min="0" max="${rem}" step="1" value="${this._esc(val)}" style="width:100%; padding:7px 9px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);"/></td>
      </tr>`;
    }).join('');

    const refundableTotal = (sale.lines || []).reduce((a, l) => a + (parseFloat(this.qtyById[l.itemCode]) || 0) * (parseFloat(l.price) || 0), 0);

    return `
      <div style="border-top:1px solid var(--border-subtle); padding-top:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="font-weight:800;">Refund ticket · ${this._esc(sale.saleNumber)}</div>
          <div style="display:flex; gap:8px;">
            <button id="rt-all" style="padding:7px 12px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); color:var(--text-primary); cursor:pointer; font-weight:700;">All remaining</button>
            <button id="rt-none" style="padding:7px 12px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); color:var(--text-primary); cursor:pointer; font-weight:700;">Clear</button>
          </div>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
          <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:left;">
            <th style="padding:8px 14px;">Item</th><th style="padding:8px 14px;">Sold / refundable</th><th style="padding:8px 14px; text-align:right;">Unit price</th><th style="padding:8px 14px;">Qty to return</th>
          </tr></thead>
          <tbody>${lines}</tbody>
        </table>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:14px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:0.84rem; color:var(--text-secondary);"><input type="checkbox" id="rt-restock"${this.restock ? ' checked' : ''}/> Restock (unopened → back to ${'LOC-RETAIL'})</label>
          <select id="rt-method" style="padding:8px 10px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);">
            ${['CASH', 'UPI', 'CARD'].map(m => `<option value="${m}"${this.paymentMethod === m ? ' selected' : ''}>${m}</option>`).join('')}
          </select>
          <input id="rt-reason" type="text" placeholder="Reason (optional)" value="${this._esc(this.reason)}" style="flex:1; min-width:160px; padding:8px 10px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);"/>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px;">
          <div style="font-size:0.9rem; color:var(--text-secondary);">Refund (taxable subtotal): <strong style="color:var(--text-primary);">${this._inr(refundableTotal)}</strong> <span style="color:var(--text-muted); font-size:0.78rem;">(final incl. tax computed on submit)</span></div>
          <button id="rt-submit" ${this.submitting ? 'disabled' : ''} style="padding:9px 20px; border-radius:8px; border:none; background:var(--accent-primary); color:#fff; font-weight:800; cursor:pointer; ${this.submitting ? 'opacity:0.6;' : ''}">${this.submitting ? 'Refunding…' : 'Process Refund'}</button>
        </div>
      </div>`;
  }

  _bind() {
    const c = this.container; if (!c) return;
    const on = (sel, ev, fn) => { const el = c.querySelector(sel); if (el) el.addEventListener(ev, fn); };
    const val = (sel) => { const el = c.querySelector(sel); return el ? el.value : ''; };
    on('#rt-sale', 'change', e => this._selectSale(e.target.value));
    c.querySelectorAll('.rt-row').forEach(row => row.addEventListener('click', () => this._selectSale(row.dataset.sale)));
    c.querySelectorAll('.rt-qty').forEach(inp => inp.addEventListener('input', e => { this.qtyById[e.target.dataset.item] = e.target.value; }));
    on('#rt-all', 'click', () => this._fullRefund());
    on('#rt-none', 'click', () => this._clearLines());
    on('#rt-restock', 'change', e => { this.restock = e.target.checked; });
    on('#rt-method', 'change', e => { this.paymentMethod = e.target.value; });
    on('#rt-reason', 'input', e => { this.reason = e.target.value; });
    on('#rt-submit', 'click', () => this._submit());
  }

  destroy() {
    (this.unsubscribeEvents || []).forEach(u => { if (typeof u === 'function') u(); });
    this.unsubscribeEvents = [];
  }
}
