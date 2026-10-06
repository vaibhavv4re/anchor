/**
 * RestaurantOS Capability - Retail Catalogue Management (Retail Phase 1)
 *
 * The Retail Manager curates the store here across two tabs:
 *
 *   PRODUCTS   - each catalogue row (retail_products) ENRICHES a shared `inventory`
 *                SKU (item_code) with brand / vintage / region / bottle size / MRP /
 *                selling price / tax category / barcode AND a merchandising CATEGORY.
 *                A catalogue row never creates stock.
 *
 *   CATEGORIES - a configurable two-level wine-shop taxonomy (retail_categories).
 *                Shows a LIVE stock rollup per category (SKU count, on-hand units,
 *                stock value at cost, LOW/OUT alert counts, parents aggregating their
 *                sub-categories) plus category CRUD + a "load defaults" action.
 *
 * Relationship to the POS: the POS is driven by LIVE LOC-RETAIL stock and uses a
 * catalogue row, when present, for a nicer name/brand, the correct selling price and
 * its category. Physical stock still lives only in `stock_balances` at LOC-RETAIL and
 * arrives solely through Inventory-Manager warehouse transfers.
 *
 * Hard boundary: catalogue + category metadata only. No stock movement, no
 * TableSession / KOT / BOT / restaurant cashier. Merchandising category is kept
 * separate from the fiscal tax_category (which drives VAT).
 */

import { retailProductModel } from '../../../../../businessos/platform/retail/retailProductModel.js';
import { retailCategoryModel } from '../../../../../businessos/platform/retail/retailCategoryModel.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import {
  RETAIL_LOCATION, resolveGateway, readRetailBalances, readCollection, computeCategoryRollups
} from './retailInventorySupport.js';

// Tax categories recognised by the shared tax engine (taxConfigurationModel).
const TAX_CATEGORIES = [
  { code: 'ALCOHOL_WINE', name: 'Wines & Sparkling Liquors' },
  { code: 'ALCOHOL_BEER', name: 'Beer & Fermented Beverages' },
  { code: 'ALCOHOL_SPIRITS', name: 'Spirits & Hard Liquor' },
  { code: 'RESTAURANT_BEVERAGE', name: 'Packaged Beverages & Waters' },
  { code: 'EXEMPT', name: 'Exempt / Non-Taxable Goods' }
];

const EMPTY_FORM = {
  id: null, itemCode: '', productCode: '', name: '', brand: '', vintage: '',
  region: '', country: '', varietal: '', bottleSize: '750ml', mrp: '',
  sellingPrice: '', taxCategory: 'ALCOHOL_WINE', barcode: '', status: 'ACTIVE', categoryCode: ''
};

const EMPTY_CAT_FORM = { id: null, code: '', name: '', parentCode: '', sortOrder: '', status: 'ACTIVE' };

export class RetailCatalogueView {
  constructor(deps = {}) {
    this.deps = deps;
    this.dataGateway = deps.dataGateway || null;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
    this.productModel = deps.retailProductModel || retailProductModel;
    this.categoryModel = deps.retailCategoryModel || retailCategoryModel;
    this.container = null;
    this.session = null;
    this.tenantId = 'tenant_h0qc7wf';

    this.mode = 'products';           // 'products' | 'categories'

    // Products panel state
    this.form = { ...EMPTY_FORM };
    this.showForm = false;
    this.search = '';

    // Categories panel state
    this.catForm = { ...EMPTY_CAT_FORM };
    this.showCatForm = false;

    this.notice = null;
    this.saving = false;
    this.unsubscribeEvents = [];
    this._subscribed = false;
  }

  render(container, session = null) {
    this.container = container;
    this.session = session || {};
    this.tenantId = this.session.tenantId || this.session.tenant_id || 'tenant_h0qc7wf';
    if (!this._subscribed && this.platformEventBus && typeof this.platformEventBus.subscribe === 'function') {
      this._subscribed = true;
      const unsub = this.platformEventBus.subscribe('stock:balance:updated', () => { if (this.container) this.update(); });
      if (typeof unsub === 'function') this.unsubscribeEvents.push(unsub);
    }
    this.update();
    return container;
  }

  _gateway() { return resolveGateway(this.dataGateway); }
  _esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  _money(n) { const v = parseFloat(n) || 0; return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  _setMode(mode) { this.mode = mode; this.notice = null; this.update(); }

  // ==========================================================================
  // PRODUCTS
  // ==========================================================================

  _newProduct() { this.form = { ...EMPTY_FORM }; this.showForm = true; this.notice = null; this.update(); }
  _cancelForm() { this.form = { ...EMPTY_FORM }; this.showForm = false; this.notice = null; this.update(); }

  _editProduct(id) {
    const p = this.productModel.getAll(this.tenantId).find(x => x.id === id);
    if (!p) return;
    this.form = {
      id: p.id, itemCode: p.itemCode || '', productCode: p.productCode || '', name: p.name || '',
      brand: p.brand || '', vintage: p.vintage || '', region: p.region || '', country: p.country || '',
      varietal: p.varietal || '', bottleSize: p.bottleSize || '750ml',
      mrp: p.mrp != null ? String(p.mrp) : '', sellingPrice: p.sellingPrice != null ? String(p.sellingPrice) : '',
      taxCategory: p.taxCategory || 'ALCOHOL_WINE', barcode: p.barcode || '', status: p.status || 'ACTIVE',
      categoryCode: p.categoryCode || ''
    };
    this.showForm = true;
    this.notice = null;
    this.update();
  }

  _readForm() {
    const c = this.container; if (!c) return;
    const val = (sel) => { const el = c.querySelector(sel); return el ? el.value : ''; };
    this.form = {
      ...this.form,
      itemCode: val('#cat-item').trim(),
      productCode: val('#cat-product-code').trim(),
      name: val('#cat-name').trim(),
      brand: val('#cat-brand').trim(),
      vintage: val('#cat-vintage').trim(),
      region: val('#cat-region').trim(),
      country: val('#cat-country').trim(),
      varietal: val('#cat-varietal').trim(),
      bottleSize: val('#cat-bottle').trim(),
      mrp: val('#cat-mrp'),
      sellingPrice: val('#cat-price'),
      taxCategory: val('#cat-tax'),
      barcode: val('#cat-barcode').trim(),
      status: val('#cat-status'),
      categoryCode: val('#cat-category')
    };
  }

  async _save() {
    this._readForm();
    this.notice = null;
    const f = this.form;
    if (!f.itemCode) { this.notice = '⚠️ Pick the inventory SKU this product maps to.'; return this.update(); }
    if (!f.name) { this.notice = '⚠️ Product name is required.'; return this.update(); }
    const price = parseFloat(f.sellingPrice) || 0;
    if (price <= 0) { this.notice = '⚠️ Selling price must be greater than 0 (this is what the POS charges).'; return this.update(); }

    this.saving = true;
    const payload = {
      itemCode: f.itemCode,
      productCode: f.productCode || undefined, // let the model auto-generate when blank
      name: f.name, brand: f.brand, vintage: f.vintage, region: f.region, country: f.country,
      varietal: f.varietal, bottleSize: f.bottleSize || '750ml',
      mrp: parseFloat(f.mrp) || price, sellingPrice: price,
      taxCategory: f.taxCategory || 'ALCOHOL_WINE', barcode: f.barcode, status: f.status || 'ACTIVE',
      categoryCode: f.categoryCode || ''
    };
    try {
      if (f.id) {
        await this.productModel.update(f.id, payload, this.tenantId);
        this.notice = `✅ Updated “${payload.name}”.`;
      } else {
        const rec = await this.productModel.create({ ...payload, tenantId: this.tenantId }, this.tenantId);
        this.notice = `✅ Added “${rec.name}” to the catalogue (SKU ${rec.itemCode}).`;
      }
      this.form = { ...EMPTY_FORM };
      this.showForm = false;
    } catch (err) {
      this.notice = '⚠️ ' + (err && err.message ? err.message : 'Failed to save product.');
    }
    this.saving = false;
    this.update();
  }

  async _delete(id) {
    const p = this.productModel.getAll(this.tenantId).find(x => x.id === id);
    const label = p ? `“${p.name}”` : 'this product';
    if (!window.confirm(`Remove ${label} from the retail catalogue? This does NOT affect stock at ${RETAIL_LOCATION}.`)) return;
    this.notice = null;
    try {
      await this.productModel.remove(id, this.tenantId);
      if (this.form.id === id) { this.form = { ...EMPTY_FORM }; this.showForm = false; }
      this.notice = `🗑️ Removed ${label} from the catalogue.`;
    } catch (err) {
      this.notice = '⚠️ ' + (err && err.message ? err.message : 'Failed to remove product.');
    }
    this.update();
  }

  // ==========================================================================
  // CATEGORIES
  // ==========================================================================

  _newCategory() { this.catForm = { ...EMPTY_CAT_FORM }; this.showCatForm = true; this.notice = null; this.update(); }
  _cancelCatForm() { this.catForm = { ...EMPTY_CAT_FORM }; this.showCatForm = false; this.notice = null; this.update(); }

  _editCategory(code) {
    const cat = this.categoryModel.getAll(this.tenantId).find(c => String(c.code).toUpperCase() === String(code).toUpperCase());
    if (!cat) return;
    this.catForm = {
      id: cat.id, code: cat.code || '', name: cat.name || '', parentCode: cat.parentCode || '',
      sortOrder: cat.sortOrder != null ? String(cat.sortOrder) : '', status: cat.status || 'ACTIVE'
    };
    this.showCatForm = true;
    this.notice = null;
    this.update();
  }

  _readCatForm() {
    const c = this.container; if (!c) return;
    const val = (sel) => { const el = c.querySelector(sel); return el ? el.value : ''; };
    this.catForm = {
      ...this.catForm,
      code: val('#catg-code').trim(),
      name: val('#catg-name').trim(),
      parentCode: val('#catg-parent'),
      sortOrder: val('#catg-sort'),
      status: val('#catg-status')
    };
  }

  async _saveCategory() {
    this._readCatForm();
    this.notice = null;
    const f = this.catForm;
    if (!f.name) { this.notice = '⚠️ Category name is required.'; return this.update(); }
    const code = (f.code || '').trim().toUpperCase();
    const existing = this.categoryModel.getAll(this.tenantId);
    const clash = existing.find(c => String(c.code).toUpperCase() === (code || '') && c.id !== f.id);
    if (code && clash) { this.notice = `⚠️ A category with code “${code}” already exists.`; return this.update(); }

    this.saving = true;
    const payload = {
      code: code || undefined, // model slugs from name when blank
      name: f.name,
      parentCode: f.parentCode || '',
      sortOrder: parseInt(f.sortOrder) || 0,
      status: f.status || 'ACTIVE'
    };
    try {
      if (f.id) {
        await this.categoryModel.update(f.id, payload, this.tenantId);
        this.notice = `✅ Updated category “${payload.name}”.`;
      } else {
        const rec = await this.categoryModel.create({ ...payload, tenantId: this.tenantId }, this.tenantId);
        this.notice = `✅ Added category “${rec.name}” (${rec.code}).`;
      }
      this.catForm = { ...EMPTY_CAT_FORM };
      this.showCatForm = false;
    } catch (err) {
      this.notice = '⚠️ ' + (err && err.message ? err.message : 'Failed to save category.');
    }
    this.saving = false;
    this.update();
  }

  async _deleteCategory(code) {
    const cat = this.categoryModel.getByCode(code, this.tenantId);
    if (!cat) return;
    const productsHere = this.productModel.getAll(this.tenantId).filter(p => String(p.categoryCode).toUpperCase() === String(cat.code).toUpperCase()).length;
    const children = this.categoryModel.getAll(this.tenantId).filter(c => String(c.parentCode).toUpperCase() === String(cat.code).toUpperCase()).length;
    const bits = [];
    if (children) bits.push(`${children} sub-category(ies)`);
    if (productsHere) bits.push(`${productsHere} product(s)`);
    const warn = bits.length ? ` It still has ${bits.join(' and ')} — those products will fall back to “Uncategorised”.` : '';
    if (!window.confirm(`Delete category “${cat.name}” (${cat.code})?${warn} This does NOT affect stock at ${RETAIL_LOCATION}.`)) return;
    this.notice = null;
    try {
      await this.categoryModel.remove(cat.id, this.tenantId);
      if (this.catForm.id === cat.id) { this.catForm = { ...EMPTY_CAT_FORM }; this.showCatForm = false; }
      this.notice = `🗑️ Deleted category “${cat.name}”.`;
    } catch (err) {
      this.notice = '⚠️ ' + (err && err.message ? err.message : 'Failed to delete category.');
    }
    this.update();
  }

  async _seedDefaults() {
    this.notice = null;
    try {
      const created = await this.categoryModel.seedDefaults(this.tenantId);
      this.notice = created.length
        ? `✅ Loaded ${created.length} default category(ies).`
        : 'ℹ️ Default categories are already present — nothing to load.';
    } catch (err) {
      this.notice = '⚠️ ' + (err && err.message ? err.message : 'Failed to load defaults.');
    }
    this.update();
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  update() {
    if (!this.container) return;
    const gateway = this._gateway();
    const header = this._renderTabs();
    const body = this.mode === 'categories' ? this._renderCategories(gateway) : this._renderProducts(gateway);
    this.container.innerHTML = `<div style="display:flex; flex-direction:column; gap:16px;">${header}${body}</div>`;
    this._bind();
  }

  _renderTabs() {
    const tab = (id, label) => {
      const active = this.mode === id;
      return `<button data-tab="${id}" style="padding:9px 18px; border-radius:9px 9px 0 0; border:1px solid ${active ? 'var(--accent-primary)' : 'var(--border-subtle)'}; border-bottom:none; background:${active ? 'var(--bg-surface)' : 'transparent'}; color:${active ? 'var(--accent-primary)' : 'var(--text-secondary)'}; font-weight:800; cursor:pointer; font-size:0.88rem;">${label}</button>`;
    };
    return `
      <div>
        <h3 style="margin:0 0 10px; font-size:1.2rem; font-weight:800;">🏷️ Catalogue Management</h3>
        <div style="display:flex; gap:6px;">${tab('products', ' Products')}${tab('categories', '🗂️ Categories')}</div>
      </div>`;
  }

  _noticeStrip() {
    return this.notice ? `<div style="padding:10px 14px; border-radius:8px; background:rgba(59,130,246,0.12); color:var(--accent-primary); font-size:0.85rem;">${this._esc(this.notice)}</div>` : '';
  }

  // ---- Products panel ------------------------------------------------------

  _renderProducts(gateway) {
    const masterByItem = new Map();
    readCollection('inventory', this.tenantId, gateway).forEach(i => {
      const code = i.itemCode || i.item_code;
      if (!code) return;
      masterByItem.set(code, { code, name: i.itemName || i.item_name || i.name || code, uom: i.baseUom || i.base_uom || i.baseUnit || 'PCS' });
    });

    const balances = readRetailBalances(this.tenantId, gateway);
    const products = this.productModel.getAll(this.tenantId);
    const catByCode = new Map(this.categoryModel.getAll(this.tenantId).map(c => [String(c.code).toUpperCase(), c]));
    const cataloguedCodes = new Set(products.map(p => p.itemCode).filter(Boolean));

    const q = String(this.search || '').trim().toLowerCase();
    const filtered = !q ? products : products.filter(p =>
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.brand || '').toLowerCase().includes(q) ||
      String(p.itemCode || '').toLowerCase().includes(q) ||
      String(p.productCode || '').toLowerCase().includes(q) ||
      String(p.varietal || '').toLowerCase().includes(q)
    );

    const stockedUncatalogued = Array.from(balances.keys()).filter(code => !cataloguedCodes.has(code));

    return `
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div style="font-size:0.8rem; color:var(--text-muted);">${products.length} product(s) · maps retail products to live <code>inventory</code> SKUs + categories</div>
        <button id="cat-new" style="padding:9px 16px; border-radius:9px; border:none; background:var(--accent-primary); color:#fff; font-weight:800; cursor:pointer;">➕ New product</button>
      </div>

      <div style="padding:12px 16px; border-radius:10px; border:1px solid var(--border-subtle); background:var(--bg-surface); font-size:0.84rem; color:var(--text-secondary);">
        ℹ️ A catalogue row only adds the <strong>wine-facing label, category &amp; selling price</strong> for an existing
        <code>inventory</code> SKU. It never creates or moves stock — physical units live at <strong>${RETAIL_LOCATION}</strong>
        and arrive only via Inventory-Manager transfers. The POS sells any stocked SKU and uses this row for its name, price &amp; category.
      </div>

      ${stockedUncatalogued.length ? `
        <div style="padding:11px 14px; border-radius:10px; border:1px solid rgba(245,158,11,0.4); background:rgba(245,158,11,0.10); font-size:0.82rem; color:var(--text-secondary);">
          ⚠️ ${stockedUncatalogued.length} stocked SKU(s) at ${RETAIL_LOCATION} have <strong>no catalogue row</strong> and will fall back to
          the inventory price in the POS: ${stockedUncatalogued.map(c => `<code>${this._esc(c)}</code>`).join(', ')}.
        </div>` : ''}

      ${this.showForm ? this._renderProductForm(masterByItem, cataloguedCodes) : ''}

      ${this._noticeStrip()}

      <div class="card" style="border:1px solid var(--border-subtle); border-radius:12px; overflow:hidden;">
        <div style="padding:12px 14px; border-bottom:1px solid var(--border-subtle); display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div style="font-weight:800; font-size:0.9rem;">Catalogue</div>
          <input id="cat-search" placeholder="Search name / brand / SKU…" value="${this._esc(this.search)}"
            style="min-width:220px; padding:8px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary); font-size:0.84rem;"/>
        </div>
        <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
          <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:left;">
            <th style="padding:9px 14px;">Product</th>
            <th style="padding:9px 14px;">Category</th>
            <th style="padding:9px 14px;">SKU (inventory)</th>
            <th style="padding:9px 14px;">Code</th>
            <th style="padding:9px 14px; text-align:right;">Price</th>
            <th style="padding:9px 14px; text-align:right;">Stock @ ${RETAIL_LOCATION}</th>
            <th style="padding:9px 14px;">Status</th>
            <th style="padding:9px 14px; text-align:right;">Actions</th>
          </tr></thead>
          <tbody>
            ${filtered.map(p => {
              const onHand = (balances.get(p.itemCode) || {}).quantity || 0;
              const inMaster = masterByItem.has(p.itemCode);
              const cat = catByCode.get(String(p.categoryCode || '').toUpperCase());
              const catLabel = cat ? (cat.parentCode ? `${this._esc(catByCode.get(String(cat.parentCode).toUpperCase()) ? catByCode.get(String(cat.parentCode).toUpperCase()).name : '')} › ` : '') + this._esc(cat.name) : '<span style="color:var(--text-muted);">—</span>';
              return `<tr style="border-top:1px solid var(--border-subtle);">
                <td style="padding:8px 14px; color:var(--text-primary);">
                  <div style="font-weight:700;">${this._esc(p.name)}</div>
                  <div style="font-size:0.74rem; color:var(--text-muted);">${this._esc([p.brand, p.vintage, p.bottleSize].filter(Boolean).join(' · '))}</div>
                </td>
                <td style="padding:8px 14px; color:var(--text-secondary); font-size:0.8rem;">${catLabel}</td>
                <td style="padding:8px 14px; font-family:monospace; font-size:0.78rem; color:${inMaster ? 'var(--text-secondary)' : '#ef4444'};">${this._esc(p.itemCode || '—')}${inMaster ? '' : ' ⚠'}</td>
                <td style="padding:8px 14px; font-family:monospace; font-size:0.78rem; color:var(--text-muted);">${this._esc(p.productCode)}</td>
                <td style="padding:8px 14px; text-align:right; font-weight:800; color:var(--accent-primary);">${this._money(p.sellingPrice)}</td>
                <td style="padding:8px 14px; text-align:right; font-weight:700; color:${onHand > 0 ? 'var(--text-primary)' : 'var(--text-muted)'};">${onHand}</td>
                <td style="padding:8px 14px;"><span style="font-size:0.72rem; font-weight:800; color:${p.status === 'ACTIVE' ? '#10b981' : '#6b7280'};">${this._esc(p.status)}</span></td>
                <td style="padding:8px 14px; text-align:right; white-space:nowrap;">
                  <button class="cat-edit" data-id="${this._esc(p.id)}" style="padding:5px 10px; border-radius:7px; border:1px solid var(--border-subtle); background:transparent; color:var(--text-primary); font-weight:700; cursor:pointer; font-size:0.78rem;">Edit</button>
                  <button class="cat-del" data-id="${this._esc(p.id)}" style="padding:5px 10px; border-radius:7px; border:1px solid var(--border-subtle); background:transparent; color:#ef4444; font-weight:700; cursor:pointer; font-size:0.78rem; margin-left:4px;">Delete</button>
                </td>
              </tr>`;
            }).join('') || `<tr><td colspan="8" style="padding:26px; text-align:center; color:var(--text-muted);">${products.length ? 'No products match your search.' : 'No catalogue products yet — add one to price &amp; label your live stock.'}</td></tr>`}
          </tbody>
        </table>
        </div>
      </div>`;
  }

  _renderProductForm(masterByItem, cataloguedCodes) {
    const f = this.form;
    const editing = !!f.id;
    const skuOptions = Array.from(masterByItem.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(m => {
        const taken = cataloguedCodes.has(m.code) && f.itemCode !== m.code;
        return `<option value="${this._esc(m.code)}"${f.itemCode === m.code ? ' selected' : ''}>${this._esc(m.name)} · ${this._esc(m.code)} (${this._esc(m.uom)})${taken ? ' — already catalogued' : ''}</option>`;
      }).join('');
    const currentInMaster = !f.itemCode || masterByItem.has(f.itemCode);
    const categoryOptions = this._categoryOptions(f.categoryCode);

    const input = (id, label, value, opts = '') => `
      <label style="display:flex; flex-direction:column; gap:4px; font-size:0.74rem; color:var(--text-muted); font-weight:700;">
        ${label}
        <input id="${id}" value="${this._esc(value)}" ${opts}
          style="padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary); font-size:0.86rem; font-weight:500;"/>
      </label>`;

    return `
      <div class="card" style="padding:16px; border:1px solid var(--accent-primary); border-radius:12px; background:var(--bg-surface);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
          <div style="font-weight:800; font-size:0.95rem;">${editing ? '✏️ Edit product' : '➕ New catalogue product'}</div>
          <button id="cat-cancel" style="padding:6px 12px; border-radius:8px; border:1px solid var(--border-subtle); background:transparent; color:var(--text-secondary); font-weight:700; cursor:pointer;">Close</button>
        </div>

        <div style="display:flex; flex-direction:column; gap:12px;">
          <div style="display:grid; grid-template-columns:2fr 1fr; gap:10px;">
            <label style="display:flex; flex-direction:column; gap:4px; font-size:0.74rem; color:var(--text-muted); font-weight:700;">
              Inventory SKU (item_code) *
              <select id="cat-item" style="padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary); font-size:0.86rem; font-weight:500;">
                <option value="">Select a live inventory SKU…</option>
                ${skuOptions}
              </select>
            </label>
            ${input('cat-product-code', 'Product code (auto if blank)', f.productCode, 'placeholder="RP-XXXXX"')}
          </div>
          ${masterByItem.size === 0 ? `<div style="font-size:0.78rem; color:#ef4444;">⚠️ No live <code>inventory</code> SKUs are available to map. Catalogue items must reference a real inventory item.</div>` : (!currentInMaster ? `<div style="font-size:0.78rem; color:#ef4444;">⚠️ The current SKU “${this._esc(f.itemCode)}” is not in the live inventory master.</div>` : '')}

          <div style="display:grid; grid-template-columns:2fr 1fr 1fr; gap:10px;">
            ${input('cat-name', 'Product name *', f.name, 'placeholder="Cabernet Sauvignon 750ml"')}
            <label style="display:flex; flex-direction:column; gap:4px; font-size:0.74rem; color:var(--text-muted); font-weight:700;">
              Category
              <select id="cat-category" style="padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary); font-size:0.86rem; font-weight:500;">
                ${categoryOptions}
              </select>
            </label>
            ${input('cat-brand', 'Brand / Winery', f.brand, 'placeholder="Sula"')}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:10px;">
            ${input('cat-vintage', 'Vintage', f.vintage, 'placeholder="2021"')}
            ${input('cat-varietal', 'Varietal', f.varietal, 'placeholder="Cabernet"')}
            ${input('cat-region', 'Region', f.region, 'placeholder="Nashik"')}
            ${input('cat-country', 'Country', f.country, 'placeholder="India"')}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:10px;">
            ${input('cat-bottle', 'Bottle size', f.bottleSize, 'placeholder="750ml"')}
            ${input('cat-price', 'Selling price *', f.sellingPrice, 'type="number" min="0" step="0.01" placeholder="0.00"')}
            ${input('cat-mrp', 'MRP', f.mrp, 'type="number" min="0" step="0.01" placeholder="0.00"')}
            ${input('cat-barcode', 'Barcode / EAN', f.barcode, 'placeholder="scan value"')}
          </div>
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
              <label style="display:flex; flex-direction:column; gap:4px; font-size:0.74rem; color:var(--text-muted); font-weight:700;">
                Tax category
                <select id="cat-tax" style="padding:8px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary); font-size:0.84rem;">
                  ${TAX_CATEGORIES.map(t => `<option value="${t.code}"${f.taxCategory === t.code ? ' selected' : ''}>${this._esc(t.name)}</option>`).join('')}
                </select>
              </label>
              <label style="display:flex; flex-direction:column; gap:4px; font-size:0.74rem; color:var(--text-muted); font-weight:700;">
                Status
                <select id="cat-status" style="padding:8px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary); font-size:0.84rem;">
                  <option value="ACTIVE"${f.status === 'ACTIVE' ? ' selected' : ''}>ACTIVE</option>
                  <option value="INACTIVE"${f.status === 'INACTIVE' ? ' selected' : ''}>INACTIVE</option>
                </select>
              </label>
            </div>
            <button id="cat-save" ${this.saving ? 'disabled' : ''} style="padding:10px 22px; border-radius:9px; border:none; background:var(--accent-primary); color:#fff; font-weight:800; cursor:pointer; ${this.saving ? 'opacity:0.6;' : ''}">${this.saving ? 'Saving…' : (editing ? 'Save changes' : 'Add to catalogue')}</button>
          </div>
        </div>
      </div>`;
  }

  // ---- Categories panel ----------------------------------------------------

  _categoryOptions(selectedCode) {
    const options = this.categoryModel.listWithOptions(this.tenantId);
    const blank = `<option value="">— Uncategorised —</option>`;
    return blank + options.map(o =>
      `<option value="${this._esc(o.code)}"${String(selectedCode).toUpperCase() === String(o.code).toUpperCase() ? ' selected' : ''}>${o.level === 1 ? '\u00A0\u00A0\u00A0› ' : ''}${this._esc(o.name)}</option>`
    ).join('');
  }

  _renderCategories(gateway) {
    const rollups = computeCategoryRollups(this.tenantId, gateway);
    const categories = this.categoryModel.getAll(this.tenantId);
    const byCode = new Map(categories.map(c => [String(c.code).toUpperCase(), c]));
    const rollupByCode = new Map(rollups.map(r => [String(r.code).toUpperCase(), r]));

    const tops = rollups.filter(r => !r.parentCode && r.code !== '__UNCAT__');
    const childrenOf = (code) => rollups.filter(r => String(r.parentCode).toUpperCase() === String(code).toUpperCase());
    const uncat = rollups.find(r => r.code === '__UNCAT__');

    const alertCell = (r) => {
      if (!r || (r.outCount === 0 && r.lowCount === 0)) return `<span style="font-size:0.72rem; font-weight:800; color:#10b981;">Healthy</span>`;
      const parts = [];
      if (r.outCount) parts.push(`<span style="font-size:0.72rem; font-weight:800; color:#ef4444;">${r.outCount} OUT</span>`);
      if (r.lowCount) parts.push(`<span style="font-size:0.72rem; font-weight:800; color:#f59e0b;">${r.lowCount} LOW</span>`);
      return parts.join(' · ');
    };

    const row = (r, indent) => {
      const cat = byCode.get(String(r.code).toUpperCase());
      const isUncat = r.code === '__UNCAT__';
      return `
        <tr style="border-top:1px solid var(--border-subtle);">
          <td style="padding:8px 14px; color:var(--text-primary); padding-left:${indent}px;">
            <div style="font-weight:${indent ? '500' : '800'};">${this._esc(r.name)}</div>
            ${isUncat ? '' : `<div style="font-size:0.72rem; color:var(--text-muted); font-family:monospace;">${this._esc(r.code)}</div>`}
          </td>
          <td style="padding:8px 14px; text-align:right; font-weight:700;">${r.skuCount}</td>
          <td style="padding:8px 14px; text-align:right;">${r.onHandUnits}</td>
          <td style="padding:8px 14px; text-align:right; color:var(--text-secondary);">${this._money(r.stockValue)}</td>
          <td style="padding:8px 14px;">${alertCell(r)}</td>
          <td style="padding:8px 14px;">${isUncat ? '' : `<span style="font-size:0.72rem; font-weight:800; color:${(cat && cat.status) === 'ACTIVE' ? '#10b981' : '#6b7280'};">${this._esc((cat && cat.status) || 'ACTIVE')}</span>`}</td>
          <td style="padding:8px 14px; text-align:right; white-space:nowrap;">
            ${isUncat ? '' : `
              <button class="catg-edit" data-code="${this._esc(r.code)}" style="padding:5px 10px; border-radius:7px; border:1px solid var(--border-subtle); background:transparent; color:var(--text-primary); font-weight:700; cursor:pointer; font-size:0.78rem;">Edit</button>
              <button class="catg-del" data-code="${this._esc(r.code)}" style="padding:5px 10px; border-radius:7px; border:1px solid var(--border-subtle); background:transparent; color:#ef4444; font-weight:700; cursor:pointer; font-size:0.78rem; margin-left:4px;">Delete</button>`}
          </td>
        </tr>`;
    };

    let rows = '';
    tops.forEach(top => {
      rows += row(top, 8);
      childrenOf(top.code).forEach(ch => { rows += row(ch, 30); });
    });
    if (uncat) rows += row(uncat, 8);

    const totalSku = tops.reduce((s, t) => s + t.skuCount, 0) + (uncat ? uncat.skuCount : 0);
    const needAttention = tops.filter(t => t.needsReplenishment).length;

    return `
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div style="font-size:0.8rem; color:var(--text-muted);">${categories.length} categories · ${totalSku} catalogued SKU(s) · ${needAttention} top-level category(ies) need replenishment</div>
        <div style="display:flex; gap:8px;">
          <button id="catg-seed" style="padding:9px 14px; border-radius:9px; border:1px solid var(--border-subtle); background:transparent; color:var(--text-primary); font-weight:700; cursor:pointer;">⬇️ Load default categories</button>
          <button id="catg-new" style="padding:9px 16px; border-radius:9px; border:none; background:var(--accent-primary); color:#fff; font-weight:800; cursor:pointer;">➕ New category</button>
        </div>
      </div>

      <div style="padding:12px 16px; border-radius:10px; border:1px solid var(--border-subtle); background:var(--bg-surface); font-size:0.84rem; color:var(--text-secondary);">
        ℹ️ Category rollups read <strong>live</strong> LOC-RETAIL balances + the inventory master's reorder level. A SKU is
        <strong style="color:#ef4444;">OUT</strong> at zero and <strong style="color:#f59e0b;">LOW</strong> at/below its reorder point. Parent rows include their sub-categories.
      </div>

      ${this.showCatForm ? this._renderCategoryForm() : ''}

      ${this._noticeStrip()}

      <div class="card" style="border:1px solid var(--border-subtle); border-radius:12px; overflow:hidden;">
        <div style="padding:12px 14px; font-weight:800; font-size:0.9rem; border-bottom:1px solid var(--border-subtle);">Category stock rollup</div>
        <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.84rem;">
          <thead><tr style="background:var(--bg-surface-2); color:var(--text-muted); text-align:left;">
            <th style="padding:9px 14px;">Category</th>
            <th style="padding:9px 14px; text-align:right;">SKUs</th>
            <th style="padding:9px 14px; text-align:right;">On hand</th>
            <th style="padding:9px 14px; text-align:right;">Value (cost)</th>
            <th style="padding:9px 14px;">Alerts</th>
            <th style="padding:9px 14px;">Status</th>
            <th style="padding:9px 14px; text-align:right;">Actions</th>
          </tr></thead>
          <tbody>
            ${rows || `<tr><td colspan="7" style="padding:26px; text-align:center; color:var(--text-muted);">No categories yet — click “Load default categories” to seed the wine-shop taxonomy.</td></tr>`}
          </tbody>
        </table>
        </div>
      </div>`;
  }

  _renderCategoryForm() {
    const f = this.catForm;
    const editing = !!f.id;
    const tops = this.categoryModel.getAll(this.tenantId).filter(c => !c.parentCode && (!f.id || String(c.code).toUpperCase() !== String(this._codeById(f.id)).toUpperCase()));
    const parentOptions = `<option value="">(none — top-level)</option>` + tops.map(t => `<option value="${this._esc(t.code)}"${String(f.parentCode).toUpperCase() === String(t.code).toUpperCase() ? ' selected' : ''}>${this._esc(t.name)} · ${this._esc(t.code)}</option>`).join('');

    return `
      <div class="card" style="padding:16px; border:1px solid var(--accent-primary); border-radius:12px; background:var(--bg-surface);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
          <div style="font-weight:800; font-size:0.95rem;">${editing ? '✏️ Edit category' : '➕ New category'}</div>
          <button id="catg-cancel" style="padding:6px 12px; border-radius:8px; border:1px solid var(--border-subtle); background:transparent; color:var(--text-secondary); font-weight:700; cursor:pointer;">Close</button>
        </div>
        <div style="display:grid; grid-template-columns:2fr 1fr; gap:10px;">
          <label style="display:flex; flex-direction:column; gap:4px; font-size:0.74rem; color:var(--text-muted); font-weight:700;">
            Name *
            <input id="catg-name" value="${this._esc(f.name)}" placeholder="e.g. Red Wine" style="padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary); font-size:0.86rem;"/>
          </label>
          <label style="display:flex; flex-direction:column; gap:4px; font-size:0.74rem; color:var(--text-muted); font-weight:700;">
            Parent category
            <select id="catg-parent" style="padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary); font-size:0.86rem;">${parentOptions}</select>
          </label>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-top:10px; align-items:end;">
          <label style="display:flex; flex-direction:column; gap:4px; font-size:0.74rem; color:var(--text-muted); font-weight:700;">
            Code (auto from name if blank)
            <input id="catg-code" value="${this._esc(f.code)}" placeholder="WINE-RED" style="padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary); font-size:0.86rem;"/>
          </label>
          <label style="display:flex; flex-direction:column; gap:4px; font-size:0.74rem; color:var(--text-muted); font-weight:700;">
            Sort order
            <input id="catg-sort" type="number" value="${this._esc(f.sortOrder)}" placeholder="0" style="padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary); font-size:0.86rem;"/>
          </label>
          <label style="display:flex; flex-direction:column; gap:4px; font-size:0.74rem; color:var(--text-muted); font-weight:700;">
            Status
            <select id="catg-status" style="padding:9px 11px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-base); color:var(--text-primary); font-size:0.86rem;">
              <option value="ACTIVE"${f.status === 'ACTIVE' ? ' selected' : ''}>ACTIVE</option>
              <option value="INACTIVE"${f.status === 'INACTIVE' ? ' selected' : ''}>INACTIVE</option>
            </select>
          </label>
        </div>
        <div style="display:flex; justify-content:flex-end; margin-top:14px;">
          <button id="catg-save" ${this.saving ? 'disabled' : ''} style="padding:10px 22px; border-radius:9px; border:none; background:var(--accent-primary); color:#fff; font-weight:800; cursor:pointer; ${this.saving ? 'opacity:0.6;' : ''}">${this.saving ? 'Saving…' : (editing ? 'Save changes' : 'Add category')}</button>
        </div>
      </div>`;
  }

  _codeById(id) {
    const c = this.categoryModel.getAll(this.tenantId).find(x => x.id === id);
    return c ? c.code : '';
  }

  // ---- Bind ----------------------------------------------------------------

  _bind() {
    const c = this.container; if (!c) return;
    const on = (sel, ev, fn) => { const el = c.querySelector(sel); if (el) el.addEventListener(ev, fn); };
    const onAll = (sel, ev, fn) => c.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));

    // Tab switch
    onAll('[data-tab]', 'click', e => this._setMode(e.currentTarget.dataset.tab));

    // Products
    on('#cat-new', 'click', () => this._newProduct());
    on('#cat-cancel', 'click', () => this._cancelForm());
    on('#cat-save', 'click', () => this._save());
    on('#cat-item', 'change', e => {
      this.form.itemCode = e.target.value;
      const nameEl = c.querySelector('#cat-name');
      if (nameEl && !nameEl.value.trim() && e.target.value) {
        const opt = e.target.selectedOptions && e.target.selectedOptions[0];
        if (opt) nameEl.value = (opt.textContent || '').split(' · ')[0].trim();
      }
    });
    onAll('.cat-edit', 'click', e => this._editProduct(e.currentTarget.dataset.id));
    onAll('.cat-del', 'click', e => this._delete(e.currentTarget.dataset.id));
    const search = c.querySelector('#cat-search');
    if (search) {
      search.addEventListener('input', () => { this.search = search.value; });
      search.addEventListener('keyup', () => { if (!this.showForm) this.update(); });
    }

    // Categories
    on('#catg-new', 'click', () => this._newCategory());
    on('#catg-cancel', 'click', () => this._cancelCatForm());
    on('#catg-save', 'click', () => this._saveCategory());
    on('#catg-seed', 'click', () => this._seedDefaults());
    onAll('.catg-edit', 'click', e => this._editCategory(e.currentTarget.dataset.code));
    onAll('.catg-del', 'click', e => this._deleteCategory(e.currentTarget.dataset.code));
  }

  destroy() {
    (this.unsubscribeEvents || []).forEach(u => { if (typeof u === 'function') u(); });
    this.unsubscribeEvents = [];
  }
}
