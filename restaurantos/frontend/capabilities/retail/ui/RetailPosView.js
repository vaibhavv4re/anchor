/**
 * RestaurantOS Capability - Retail POS / New Sale (Retail Phase 1)
 *
 * The first functional Retail surface. A wine-shop Point-Of-Sale: barcode/search
 * product picker, cart, live tax-inclusive totals and a checkout that runs the
 * ONE-correlation_id retailSaleModel boundary (Sale + Invoice + Settlement +
 * Register txn + LOC-RETAIL consumption).
 *
 * Hard boundary: this never opens a TableSession, never raises a KOT/BOT and never
 * hands off to the restaurant Cashier. It is a direct over-the-counter sale.
 */

import { retailSaleModel } from '../../../../../businessos/platform/retail/retailSaleModel.js';
import { taxConfigurationModel } from '../../../../../businessos/platform/accounting/taxConfigurationModel.js';
import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { resolveGateway, listSellableRetailItems } from './retailInventorySupport.js';

const RETAIL_LOCATION = 'LOC-RETAIL';

export class RetailPosView {
  constructor(deps = {}) {
    this.deps = deps;
    this.dataGateway = deps.dataGateway || null;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
    this.container = null;
    this.session = null;
    this.tenantId = 'tenant_h0qc7wf';

    this.cart = [];                 // [{ productCode, itemCode, name, qty, price, lineTotal }]
    this.searchQuery = '';
    this.customerName = '';
    this.discount = 0;
    this.correlationId = this._newCorrelationId();
    this.checkoutOpen = false;
    this.paymentMethod = 'CASH';
    this.referenceNo = '';
    this.lastSale = null;           // receipt shown after a successful checkout
    this.busy = false;
    this.notice = null;             // transient error/insufficient-stock message
    this.unsubscribeEvents = [];
    this._subscribed = false;
  }

  _newCorrelationId() {
    return 'RCID-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  _esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  _money(n) { return '₹' + (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  _dg() {
    return this.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
  }

  // LIVE sellable items (driven by LOC-RETAIL stock, enriched by catalogue/master).
  // Cached on the instance each render so click/scan resolve against the same set.
  _sellableItems() {
    this._sellable = listSellableRetailItems(this.tenantId, resolveGateway(this.dataGateway));
    return this._sellable;
  }

  _filteredProducts() {
    const all = this._sellableItems();
    const q = String(this.searchQuery || '').trim().toLowerCase();
    if (!q) return all;
    return all.filter(p =>
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.brand || '').toLowerCase().includes(q) ||
      String(p.itemCode || '').toLowerCase().includes(q) ||
      String(p.productCode || '').toLowerCase().includes(q) ||
      String(p.barcode || '').toLowerCase().includes(q)
    );
  }

  _findByCode(code) {
    const list = this._sellable || this._sellableItems();
    const key = String(code || '').trim().toLowerCase();
    return list.find(p =>
      String(p.productCode || '').toLowerCase() === key ||
      String(p.itemCode || '').toLowerCase() === key
    ) || null;
  }

  render(container, session = null) {
    this.container = container;
    this.session = session || {};
    this.tenantId = this.session.tenantId || this.session.tenant_id || 'tenant_h0qc7wf';

    // Live refresh when a stock movement lands (realtime / local consumption).
    // Subscribe once per instance so switching tabs and re-mounting (which reuses
    // this instance to preserve the cart) never stacks duplicate subscriptions.
    if (!this._subscribed && this.platformEventBus && typeof this.platformEventBus.subscribe === 'function') {
      this._subscribed = true;
      const unsub = this.platformEventBus.subscribe('stock:balance:updated', () => { if (this.container) this.update(); });
      if (typeof unsub === 'function') this.unsubscribeEvents.push(unsub);
    }
    this.update();
    return container;
  }

  // ---- Derived state -------------------------------------------------------

  _stockFor(itemCode) {
    const dg = this._dg();
    let balances = [];
    if (dg && typeof dg.getCachedCollection === 'function') balances = dg.getCachedCollection('stock_balances', this.tenantId) || [];
    if (!balances.length) balances = offlineStore.getCollection('stock_balances') || [];
    return balances
      .filter(b => (b.locationCode || b.location_code) === RETAIL_LOCATION && (b.itemCode || b.item_code) === itemCode)
      .reduce((s, b) => s + (parseFloat(b.quantity != null ? b.quantity : (b.data && b.data.quantity)) || 0), 0);
  }

  _subtotal() { return Math.round(this.cart.reduce((s, l) => s + l.price * l.qty, 0) * 100) / 100; }

  _totals() {
    if (!this.cart.length) return { grossSales: 0, discountsTotal: 0, taxableAmount: 0, vatAmount: 0, totalTax: 0, grandTotal: 0, taxLines: [] };
    const items = this.cart.map(l => ({ itemCode: l.itemCode, name: l.name, quantity: l.qty, price: l.price, lineTotal: l.price * l.qty, isLiquor: true, category: 'WINE' }));
    const disc = parseFloat(this.discount) || 0;
    const discountRecords = disc > 0 ? [{ discountAmount: disc }] : [];
    return taxConfigurationModel.computeBillTax({ items, discountRecords, isIntraState: true, tenantId: this.tenantId });
  }

  // ---- Cart actions --------------------------------------------------------

  _addToCart(product, qty = 1) {
    if (!product) return;
    const avail = this._stockFor(product.itemCode);
    const line = this.cart.find(l => l.productCode === product.productCode);
    const wantQty = (line ? line.qty : 0) + qty;
    if (avail < wantQty) {
      this.notice = `Only ${avail} of ${product.name} in stock at ${RETAIL_LOCATION}.`;
      return;
    }
    if (line) line.qty = wantQty;
    else this.cart.push({ productCode: product.productCode, itemCode: product.itemCode, name: product.name, qty, price: parseFloat(product.sellingPrice) || 0 });
    this.notice = null;
    this.update();
  }

  _setQty(productCode, qty) {
    const line = this.cart.find(l => l.productCode === productCode);
    if (!line) return;
    const n = parseInt(qty, 10);
    if (isNaN(n) || n <= 0) this.cart = this.cart.filter(l => l.productCode !== productCode);
    else {
      const avail = this._stockFor(line.itemCode);
      line.qty = Math.min(n, avail);
    }
    this.update();
  }

  _removeLine(productCode) { this.cart = this.cart.filter(l => l.productCode !== productCode); this.update(); }

  _clearCart(regenerateKey = true) {
    this.cart = []; this.discount = 0; this.customerName = ''; this.searchQuery = '';
    this.notice = null;
    if (regenerateKey) this.correlationId = this._newCorrelationId();
    this.update();
  }

  _onScan(value) {
    const code = String(value || '').trim();
    if (!code) return;
    const product = this._findByCode(code) || this._sellableItems().find(p =>
      String(p.name || '').toLowerCase().includes(code.toLowerCase()) ||
      String(p.barcode || '').toLowerCase() === code.toLowerCase()
    ) || null;
    if (product) { this._addToCart(product, 1); this.searchQuery = ''; }
    else this.notice = `No product matches "${code}".`;
    this.update();
  }

  // ---- Checkout ------------------------------------------------------------

  async _confirmCheckout() {
    if (this.busy || !this.cart.length) return;
    this.busy = true;
    this.notice = null;
    const draft = {
      lines: this.cart.map(l => ({ productCode: l.productCode, itemCode: l.itemCode, name: l.name, quantity: l.qty, price: l.price })),
      discount: parseFloat(this.discount) || 0,
      customerName: this.customerName || 'Walk-in'
    };
    const options = { correlationId: this.correlationId, paymentMethod: this.paymentMethod, referenceNo: this.referenceNo || '' };
    try {
      const sale = await retailSaleModel.checkout(draft, options, this.session);
      this.busy = false;
      this.checkoutOpen = false;
      // Boundary emitted cleanly. Reset the cart + a fresh idempotency key, but keep
      // the receipt visible (lastSale) until the operator dismisses it.
      this.cart = []; this.discount = 0; this.customerName = ''; this.searchQuery = '';
      this.notice = null;
      this.correlationId = this._newCorrelationId();
      this.lastSale = sale;
      this.update();
    } catch (err) {
      this.busy = false;
      this.checkoutOpen = false;
      this.notice = err && /INSUFFICIENT_STOCK/.test(err.message)
        ? `Insufficient stock at ${RETAIL_LOCATION}. Adjust the cart and retry.`
        : (`Checkout failed: ${err && err.message ? err.message : 'unknown error'}. No stock or documents were committed - retry is safe.`);
      this.update();
    }
  }

  // ---- Render --------------------------------------------------------------

  update() {
    if (!this.container) return;
    const products = this._filteredProducts();
    const totals = this._totals();

    this.container.innerHTML = `
      <div style="display:flex; gap:20px; height:100%; min-height:0;">
        <section style="flex:1; min-width:0; display:flex; flex-direction:column; gap:14px;">
          ${this._renderReceiptIfAny(totals)}
          <div class="card" style="padding:14px; border:1px solid var(--border-subtle); border-radius:12px; background:var(--bg-surface);">
            <div style="display:flex; gap:10px;">
              <input id="retail-scan" placeholder="Scan barcode or search wine…" value="${this._esc(this.searchQuery)}"
                style="flex:1; padding:11px 14px; border-radius:9px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary); font-size:0.95rem;"/>
              <button id="retail-scan-add" style="padding:0 18px; border-radius:9px; border:none; background:var(--accent-primary); color:#fff; font-weight:700; cursor:pointer;">Add</button>
            </div>
          </div>
          <div id="retail-product-grid" style="flex:1; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:12px; align-content:start; padding-right:4px;">
            ${products.map(p => this._renderProductCard(p, totals)).join('') || '<div style="color:var(--text-muted); padding:20px;">No matching products.</div>'}
          </div>
        </section>

        <aside style="width:380px; flex:0 0 380px; display:flex; flex-direction:column; gap:12px; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:12px; padding:16px;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <h3 style="margin:0; font-size:1.05rem; font-weight:800;">🧾 Current Sale</h3>
            <span style="font-size:0.72rem; color:var(--text-muted);">Key ${this._esc(this.correlationId)}</span>
          </div>
          <input id="retail-customer" placeholder="Customer name (optional)" value="${this._esc(this.customerName)}"
            style="padding:8px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary); font-size:0.85rem;"/>
          <div id="retail-cart" style="flex:1; overflow-y:auto; min-height:120px;">${this._renderCart()}</div>
          ${this._renderTotals(totals)}
          ${this.notice ? `<div style="padding:9px 12px; border-radius:8px; background:rgba(239,68,68,0.12); color:#ef4444; font-size:0.82rem;">${this._esc(this.notice)}</div>` : ''}
          <div style="display:flex; gap:8px;">
            <button id="retail-cancel" style="flex:1; padding:10px; border-radius:9px; border:1px solid var(--border-subtle); background:transparent; color:var(--text-secondary); font-weight:700; cursor:pointer;">Clear</button>
            <button id="retail-checkout" ${this.cart.length ? '' : 'disabled'} style="flex:2; padding:11px; border-radius:9px; border:none; background:${this.cart.length ? 'var(--accent-primary)' : 'var(--border-subtle)'}; color:${this.cart.length ? '#fff' : 'var(--text-muted)'}; font-weight:800; cursor:${this.cart.length ? 'pointer' : 'not-allowed'};">Checkout ${this.cart.length ? this._money(totals.grandTotal) : ''}</button>
          </div>
        </aside>
      </div>
      ${this.checkoutOpen ? this._renderCheckoutModal(totals) : ''}
    `;

    this.bind();
  }

  _renderReceiptIfAny() {
    if (!this.lastSale) return '';
    const s = this.lastSale;
    return `
      <div class="card" style="padding:14px 16px; border:1px solid var(--accent-primary); border-radius:12px; background:rgba(59,130,246,0.08); display:flex; align-items:center; justify-content:space-between;">
        <div>
          <div style="font-weight:800; color:var(--accent-primary);">✅ Sale ${this._esc(s.saleNumber)} confirmed</div>
          <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:2px;">Invoice ${this._esc(s.invoiceNumber)} • Settlement ${this._esc(s.settlementId)} • ${this._money(s.grandTotal || s.grand_total)}</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button id="retail-print" style="padding:8px 12px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-surface); color:var(--text-primary); font-weight:700; cursor:pointer;">🖨️ Print</button>
          <button id="retail-receipt-close" style="padding:8px 12px; border-radius:8px; border:none; background:transparent; color:var(--text-muted); cursor:pointer;">✕</button>
        </div>
      </div>`;
  }

  _renderProductCard(p) {
    const avail = this._stockFor(p.itemCode);
    const out = avail <= 0;
    return `
      <button class="retail-product" data-code="${this._esc(p.productCode)}" ${out ? 'disabled' : ''}
        style="text-align:left; padding:12px; border-radius:11px; border:1px solid var(--border-subtle); background:var(--bg-surface); cursor:${out ? 'not-allowed' : 'pointer'}; opacity:${out ? 0.5 : 1};">
        <div style="font-weight:800; font-size:0.9rem; color:var(--text-primary); line-height:1.2;">${this._esc(p.name)}</div>
        <div style="font-size:0.74rem; color:var(--text-muted); margin-top:3px;">${this._esc(p.brand || '')}${p.vintage ? ' • ' + this._esc(p.vintage) : ''}</div>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:10px;">
          <span style="font-weight:800; color:var(--accent-primary);">${this._money(p.sellingPrice)}</span>
          <span style="font-size:0.72rem; color:${out ? '#ef4444' : 'var(--text-muted)'};">${out ? 'Out of stock' : avail + ' in stock'}</span>
        </div>
      </button>`;
  }

  _renderCart() {
    if (!this.cart.length) return '<div style="color:var(--text-muted); text-align:center; padding:24px 0; font-size:0.88rem;">Cart is empty. Scan or tap a product.</div>';
    return `
      <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
        <thead><tr style="color:var(--text-muted); text-align:left;">
          <th style="padding:4px 0;">Item</th><th style="padding:4px 4px;">Qty</th><th style="padding:4px 4px; text-align:right;">Price</th><th style="padding:4px 0; text-align:right;">Total</th><th></th>
        </tr></thead>
        <tbody>
          ${this.cart.map(l => `
            <tr style="border-top:1px solid var(--border-subtle);">
              <td style="padding:6px 0; color:var(--text-primary); max-width:130px;">${this._esc(l.name)}</td>
              <td style="padding:6px 3px;"><input class="retail-qty" data-code="${this._esc(l.productCode)}" type="number" min="1" value="${l.qty}" style="width:52px; padding:4px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary);"/></td>
              <td style="padding:6px 4px; text-align:right; color:var(--text-secondary);">${this._money(l.price)}</td>
              <td style="padding:6px 0; text-align:right; font-weight:700; color:var(--text-primary);">${this._money(l.price * l.qty)}</td>
              <td style="padding:6px 0 6px 6px; text-align:right;"><button class="retail-remove" data-code="${this._esc(l.productCode)}" style="border:none; background:transparent; color:var(--text-muted); cursor:pointer;">✕</button></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  _renderTotals(totals) {
    return `
      <div style="border-top:1px solid var(--border-subtle); padding-top:10px; font-size:0.86rem; display:flex; flex-direction:column; gap:5px;">
        <div style="display:flex; justify-content:space-between; color:var(--text-secondary);"><span>Subtotal</span><span>${this._money(totals.grossSales)}</span></div>
        <div style="display:flex; align-items:center; justify-content:space-between; color:var(--text-secondary);">
          <span>Discount</span>
          <input id="retail-discount" type="number" min="0" value="${this.discount || ''}" placeholder="0" style="width:90px; padding:4px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary); text-align:right;"/>
        </div>
        <div style="display:flex; justify-content:space-between; color:var(--text-secondary);"><span>VAT / Tax</span><span>${this._money((totals.vatAmount || 0) + (totals.cgstAmount || 0) + (totals.sgstAmount || 0) + (totals.igstAmount || 0))}</span></div>
        <div style="display:flex; justify-content:space-between; font-weight:800; color:var(--text-primary); font-size:1.05rem; padding-top:6px; border-top:1px dashed var(--border-subtle);"><span>Grand Total</span><span>${this._money(totals.grandTotal)}</span></div>
      </div>`;
  }

  _renderCheckoutModal(totals) {
    const method = (m, label) => `
      <button class="retail-pay" data-method="${m}" style="flex:1; padding:12px; border-radius:9px; cursor:pointer; font-weight:800; border:1px solid ${this.paymentMethod === m ? 'var(--accent-primary)' : 'var(--border-subtle)'}; background:${this.paymentMethod === m ? 'rgba(59,130,246,0.14)' : 'transparent'}; color:var(--text-primary);">${label}</button>`;
    return `
      <div style="position:fixed; inset:0; background:rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; z-index:1000;">
        <div style="width:420px; max-width:92vw; background:var(--bg-surface); border-radius:14px; padding:22px; box-shadow:0 20px 60px rgba(0,0,0,0.4);">
          <h3 style="margin:0 0 4px; font-size:1.15rem; font-weight:800;">Take Payment</h3>
          <div style="color:var(--text-muted); font-size:0.82rem; margin-bottom:14px;">Amount due <strong style="color:var(--text-primary); font-size:1.05rem;">${this._money(totals.grandTotal)}</strong></div>
          <div style="display:flex; gap:8px; margin-bottom:14px;">${method('CASH', '💵 Cash')}${method('UPI', '📱 UPI')}${method('CARD', '💳 Card')}</div>
          ${this.paymentMethod !== 'CASH' ? `<input id="retail-ref" placeholder="Reference / txn id" value="${this._esc(this.referenceNo)}" style="width:100%; padding:10px 12px; border-radius:9px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary); margin-bottom:14px;"/>` : ''}
          <div style="display:flex; gap:8px;">
            <button id="retail-checkout-cancel" style="flex:1; padding:11px; border-radius:9px; border:1px solid var(--border-subtle); background:transparent; color:var(--text-secondary); font-weight:700; cursor:pointer;">Back</button>
            <button id="retail-checkout-confirm" ${this.busy ? 'disabled' : ''} style="flex:2; padding:12px; border-radius:9px; border:none; background:var(--accent-primary); color:#fff; font-weight:800; cursor:pointer;">${this.busy ? 'Processing…' : 'Confirm Sale'}</button>
          </div>
        </div>
      </div>`;
  }

  bind() {
    const c = this.container;
    if (!c) return;
    const on = (sel, ev, fn) => { const el = c.querySelector(sel); if (el) el.addEventListener(ev, fn); };
    const onAll = (sel, ev, fn) => c.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));

    const scan = c.querySelector('#retail-scan');
    if (scan) {
      scan.addEventListener('input', () => { this.searchQuery = scan.value; });
      scan.addEventListener('keydown', e => { if (e.key === 'Enter') this._onScan(scan.value); });
    }
    on('#retail-scan-add', 'click', () => this._onScan(scan ? scan.value : ''));
    onAll('.retail-product', 'click', e => this._addToCart(this._findByCode(e.currentTarget.dataset.code), 1));

    const cust = c.querySelector('#retail-customer');
    if (cust) cust.addEventListener('input', () => { this.customerName = cust.value; });
    const disc = c.querySelector('#retail-discount');
    if (disc) disc.addEventListener('change', () => { this.discount = parseFloat(disc.value) || 0; this.update(); });

    onAll('.retail-qty', 'change', e => this._setQty(e.target.dataset.code, e.target.value));
    onAll('.retail-remove', 'click', e => this._removeLine(e.currentTarget.dataset.code));

    on('#retail-cancel', 'click', () => this._clearCart(true));
    on('#retail-checkout', 'click', () => { if (this.cart.length) { this.checkoutOpen = true; this.update(); } });
    on('#retail-checkout-cancel', 'click', () => { this.checkoutOpen = false; this.update(); });
    on('#retail-checkout-confirm', 'click', () => this._confirmCheckout());
    onAll('.retail-pay', 'click', e => { this.paymentMethod = e.currentTarget.dataset.method; this.update(); });

    const ref = c.querySelector('#retail-ref');
    if (ref) ref.addEventListener('input', () => { this.referenceNo = ref.value; });

    on('#retail-receipt-close', 'click', () => { this.lastSale = null; this.update(); });
    on('#retail-print', 'click', () => this._printReceipt());
  }

  _printReceipt() {
    const s = this.lastSale; if (!s) return;
    const lines = (s.lines || []).map(l => `<tr><td>${this._esc(l.name)} × ${l.qty}</td><td style="text-align:right;">${this._money(l.price * l.qty)}</td></tr>`).join('');
    const w = window.open('', '_blank', 'width=380,height=600'); if (!w) return;
    w.document.write(`<html><head><title>${this._esc(s.saleNumber)}</title></head><body style="font-family:monospace; max-width:320px; margin:16px auto;">
      <h3 style="text-align:center;">RETAIL WINE STORE</h3>
      <div style="text-align:center; font-size:12px;">${this._esc(s.saleNumber)}<br/>${this._esc(s.invoiceNumber)}<br/>${this._esc(s.settlementId)}</div>
      <hr/>
      <table style="width:100%; font-size:13px;"><tbody>${lines}</tbody></table>
      <hr/>
      <div style="display:flex; justify-content:space-between; font-weight:bold;"><span>TOTAL</span><span>${this._money(s.grandTotal || s.grand_total)}</span></div>
      <div style="font-size:12px; margin-top:6px;">Customer: ${this._esc(s.customerName || 'Walk-in')}</div>
      <script>window.print();</script>
    </body></html>`);
    w.document.close();
  }

  destroy() {
    (this.unsubscribeEvents || []).forEach(u => { if (typeof u === 'function') u(); });
    this.unsubscribeEvents = [];
  }
}
