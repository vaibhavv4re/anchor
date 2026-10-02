/**
 * Capability Group 4 - Touch-First POS Menu Browser (< 50ms Search)
 *
 * Designed for all screen sizes (Desktop, Laptop, iPad/Tablet, Mobile).
 * Features:
 * - Fluid responsive grid with minmax(260px, 1fr) — zero horizontal clipping or overflow.
 * - Instant live search + dietary / category tabs.
 * - One-tap + Add with instant visual feedback (flash confirmation & in-cart badge).
 * - High-contrast readable typography and touch targets.
 */

import { menuMasterModel } from '../../../../../businessos/platform/ordering/menuMasterModel.js';

export class MenuBrowserView {
  constructor({ onSelectItem, draftItems = [], initialState = null, onStateChange = null } = {}) {
    this.onSelectItem = onSelectItem || (() => {});
    this.draftItems = draftItems;
    // Navigation state can be restored by the host (e.g. ActiveSessionView) so a
    // full re-render after "add to cart" keeps the waiter on the same tab.
    this.activeCategoryId = (initialState && initialState.activeCategoryId) || 'ALL';
    this.searchQuery = (initialState && initialState.searchQuery) || '';
    // Top-level navigation domain: 'FOOD' | 'BAR'. Keeps bar categories out of
    // the way while a waiter is taking a food order (and vice-versa).
    this.domain = (initialState && initialState.domain) || 'FOOD';
    this.onStateChange = onStateChange || null;
    this.container = null;
    this.currentItems = [];
  }

  /**
   * Notify the host of the current navigation state so it can restore the same
   * domain/category/search after it re-renders this view (e.g. on add-to-cart).
   */
  _emitState() {
    if (typeof this.onStateChange === 'function') {
      this.onStateChange({
        domain: this.domain,
        activeCategoryId: this.activeCategoryId,
        searchQuery: this.searchQuery
      });
    }
  }

  setDraftItems(draftItems) {
    this.draftItems = draftItems || [];
    const gridMount = this.container ? this.container.querySelector('#items-grid-mount') : null;
    if (gridMount) {
      gridMount.innerHTML = this.renderItemsGrid();
      this.bindGridButtons();
    }
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'menu-browser-container animate-fade-in';
    this.container.style.cssText = 'display:flex; flex-direction:column; gap:12px; width:100%; min-width:0;';
    this.updateContent();
    return this.container;
  }

  updateContent() {
    const rawCategories = menuMasterModel.getAllCategories(this.domain);
    const categories = [
      { id: 'ALL', name: '🌟 All Dishes', shortName: this.domain === 'BAR' ? '🌟 All Bar Items' : '🌟 All Dishes', count: null },
      ...rawCategories
    ];

    if (!categories.some(c => c.id === this.activeCategoryId)) {
      this.activeCategoryId = 'ALL';
    }

    const availableCount = menuMasterModel.getItemsByCategory('ALL', this.domain).length;

    this.container.innerHTML = `
      <!-- Food / Bar domain switch -->
      <div class="domain-toggle" role="tablist" aria-label="Menu section">
        <button type="button" class="domain-btn ${this.domain === 'FOOD' ? 'active' : ''}" data-domain="FOOD" role="tab" aria-selected="${this.domain === 'FOOD'}">🍽️ Food</button>
        <button type="button" class="domain-btn ${this.domain === 'BAR' ? 'active' : ''}" data-domain="BAR" role="tab" aria-selected="${this.domain === 'BAR'}">🍹 Bar</button>
      </div>

      <!-- Fast Search & Filter Header -->
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; width:100%;">
        <div style="flex:1; min-width:220px; position:relative;">
          <input type="text" id="inp-menu-search" value="${this.searchQuery}" placeholder="🔍 Search dishes, ingredients (e.g. Ghee Roast, Soup, Solkadhi)..." style="width:100%; padding:10px 14px; font-size:0.9rem; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-surface-1); color:var(--text-primary); box-sizing:border-box;">
          ${this.searchQuery ? `<button id="btn-clear-search" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); font-size:0.85rem; color:var(--text-muted); padding:4px 8px; cursor:pointer;">✕</button>` : ''}
        </div>
        <div style="font-size:0.8rem; color:var(--text-secondary); font-weight:600; white-space:nowrap;">
          <strong>${availableCount}</strong> ${this.domain === 'BAR' ? 'Bar Items' : 'Dishes'} Available
        </div>
      </div>

      <!-- Category Filter Bar (tablet-friendly: large chips, item counts, scroll arrows + edge fades) -->
      <div class="category-filter-wrap">
        <button type="button" class="cat-scroll-btn cat-scroll-left" id="cat-scroll-left" aria-label="Scroll categories left">‹</button>
        <div class="category-pills-bar" id="category-pills-bar">
          ${categories.map(c => {
            const count = c.id === 'ALL' ? availableCount : (c.count ?? menuMasterModel.getItemsByCategory(c.id, this.domain).length);
            const isActive = c.id === this.activeCategoryId && !this.searchQuery;
            return `
              <button type="button" class="cat-tab ${isActive ? 'active' : ''}" data-cat-id="${c.id}" title="${c.name}">
                <span class="cat-tab-label">${c.shortName || c.name}</span>
                <span class="cat-tab-count">${count}</span>
              </button>`;
          }).join('')}
        </div>
        <button type="button" class="cat-scroll-btn cat-scroll-right" id="cat-scroll-right" aria-label="Scroll categories right">›</button>
      </div>

      <!-- Menu Items Responsive Grid -->
      <div id="items-grid-mount" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:12px; max-height:calc(100vh - 300px); min-height:380px; overflow-y:auto; padding:2px; width:100%; box-sizing:border-box;">
        ${this.renderItemsGrid()}
      </div>

      <style>
        .domain-toggle { display:inline-flex; gap:6px; padding:5px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:26px; width:100%; max-width:340px; box-sizing:border-box; }
        .domain-btn { flex:1 1 0; min-height:44px; padding:10px 16px; border-radius:22px; font-size:0.98rem; font-weight:700; cursor:pointer; border:1px solid transparent; background:transparent; color:var(--text-secondary); transition:all 0.15s ease; display:inline-flex; align-items:center; justify-content:center; gap:6px; }
        .domain-btn:hover { color:var(--text-primary); }
        .domain-btn.active { background:var(--accent-primary); color:#000; border-color:var(--accent-primary); box-shadow:0 2px 8px rgba(0,0,0,0.25); }
        .category-filter-wrap { position:relative; width:100%; }
        .category-pills-bar { display:flex; gap:10px; overflow-x:auto; scroll-behavior:smooth; padding:4px 2px 10px; width:100%; scrollbar-width:none; -ms-overflow-style:none; }
        .category-pills-bar::-webkit-scrollbar { display:none; }
        .cat-tab { flex:0 0 auto; display:inline-flex; align-items:center; gap:8px; min-height:44px; padding:10px 16px; border-radius:24px; font-size:0.95rem; font-weight:600; color:var(--text-secondary); background:var(--bg-surface-1); border:1px solid var(--border-subtle); white-space:nowrap; cursor:pointer; transition:all 0.15s ease; }
        .cat-tab:hover { color:var(--text-primary); border-color:var(--accent-primary); }
        .cat-tab:active { transform:scale(0.97); }
        .cat-tab.active { color:#000; background-color:var(--accent-primary); border-color:var(--accent-primary); font-weight:800; }
        .cat-tab-label { line-height:1; }
        .cat-tab-count { font-size:0.72rem; font-weight:700; background:var(--bg-surface-2); color:var(--text-muted); padding:2px 8px; border-radius:12px; min-width:24px; text-align:center; }
        .cat-tab.active .cat-tab-count { background:rgba(0,0,0,0.18); color:#000; }
        .category-filter-wrap::before, .category-filter-wrap::after { content:''; position:absolute; top:0; bottom:10px; width:44px; pointer-events:none; z-index:1; opacity:0; transition:opacity 0.15s ease; }
        .category-filter-wrap::before { left:0; background:linear-gradient(to right, var(--bg-dark), transparent); }
        .category-filter-wrap::after { right:0; background:linear-gradient(to left, var(--bg-dark), transparent); }
        .category-filter-wrap.fade-left::before { opacity:1; }
        .category-filter-wrap.fade-right::after { opacity:1; }
        .cat-scroll-btn { display:none; position:absolute; top:calc(50% - 5px); transform:translateY(-50%); z-index:3; width:38px; height:44px; border-radius:50%; border:1px solid var(--border-subtle); background:var(--bg-surface-2); color:var(--text-primary); font-size:1.5rem; line-height:1; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.35); }
        .cat-scroll-btn.show { display:flex; }
        .cat-scroll-btn:hover { color:var(--accent-primary); border-color:var(--accent-primary); }
        .cat-scroll-btn:active { transform:translateY(-50%) scale(0.92); }
        .cat-scroll-left { left:-4px; }
        .cat-scroll-right { right:-4px; }
        .pos-item-card {
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface-1);
          border-radius: 8px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 8px;
          cursor: pointer;
          transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
          min-width: 0;
          box-sizing: border-box;
        }
        .pos-item-card:hover {
          border-color: var(--accent-primary);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        }
        .pos-item-card:active {
          transform: scale(0.98);
        }
        .pos-item-card.added-pulse {
          border-color: #10b981 !important;
          box-shadow: 0 0 12px rgba(16, 185, 129, 0.4) !important;
        }
      </style>
    `;

    this.bindEvents();
    this._emitState();
  }

  renderItemsGrid() {
    this.currentItems = this.searchQuery ? 
      menuMasterModel.searchItems(this.searchQuery, this.domain) : 
      menuMasterModel.getItemsByCategory(this.activeCategoryId, this.domain);

    if (!this.currentItems || !this.currentItems.length) {
      return `
        <div style="grid-column:1/-1; color:var(--text-muted); padding:50px 20px; text-align:center; background:var(--bg-surface-1); border-radius:8px; border:1px dashed var(--border-subtle);">
          <div style="font-size:2.5rem; margin-bottom:8px;">🔍</div>
          <div style="font-size:1.1rem; font-weight:700; color:var(--text-main);">No dishes match your search</div>
          <div style="font-size:0.85rem; margin-top:4px; color:var(--text-muted);">
            ${this.searchQuery ? `No results for "${this.searchQuery}". Try searching for another item or category.` : 'No dishes in this category.'}
          </div>
        </div>
      `;
    }

    return this.currentItems.map((item, idx) => {
      const isVeg = item.dietary === 'VEG' || item.dietaryType === 'VEG';
      const spiceIndicator = item.spicinessLevel === 'SPICY' ? '🌶️ Spicy' : (item.spicinessLevel === 'MEDIUM' ? '🌶️ Med' : '');
      const inCartItem = this.draftItems ? this.draftItems.find(d => d.itemId === item.id || d.name === item.name) : null;
      const inCartQty = inCartItem ? inCartItem.quantity : 0;
      const hasVariants = item.hasVariants && Array.isArray(item.variants) && item.variants.length > 0;

      return `
        <div class="card pos-item-card animate-fade-in" data-idx="${idx}" data-item-id="${item.id}">
          <div>
            <!-- Header: Veg/Non-Veg & Badges -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; gap:6px;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:0.85rem;" title="${isVeg ? 'Vegetarian' : 'Non-Vegetarian'}">${isVeg ? '🟢' : '🔴'}</span>
                ${item.portionSize ? `<span style="font-size:0.7rem; color:var(--text-muted); background:var(--bg-surface-2); padding:1px 6px; border-radius:4px;">${item.portionSize}</span>` : ''}
              </div>
              <div style="display:flex; gap:4px; align-items:center;">
                ${spiceIndicator ? `<span style="font-size:0.7rem; color:#ef4444; background:rgba(239,68,68,0.1); padding:1px 6px; border-radius:4px; font-weight:600;">${spiceIndicator}</span>` : ''}
                ${inCartQty > 0 ? `<span class="badge badge-info" style="font-size:0.7rem; padding:2px 6px; font-weight:700;">${inCartQty} in cart</span>` : ''}
              </div>
            </div>

            <!-- Dish Title -->
            <div style="font-weight:700; font-size:1rem; color:var(--text-main); line-height:1.3; margin-top:2px; word-break:break-word;">
              ${item.name}
            </div>

            <!-- Short Description -->
            ${item.description ? `
              <div style="font-size:0.78rem; color:var(--text-muted); margin-top:4px; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                ${item.description}
              </div>
            ` : ''}

            <!-- VARIANTS PILLS SECTION -->
            ${hasVariants ? `
              <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; border-top:1px dashed var(--border-subtle); padding-top:6px;">
                ${item.variants.map(v => `
                  <button class="btn-variant-select ${v.is86 ? 'disabled-86' : ''}" 
                    data-item-id="${item.id}" 
                    data-variant-id="${v.variantId}"
                    data-variant-name="${v.variantName}"
                    data-variant-price="${v.price}"
                    ${v.is86 ? 'disabled' : ''}
                    style="padding:3px 8px; font-size:0.75rem; border-radius:4px; font-weight:700; cursor:${v.is86 ? 'not-allowed' : 'pointer'}; background:${v.is86 ? 'var(--bg-surface-2)' : 'var(--bg-app)'}; border:1px solid ${v.is86 ? 'var(--border-subtle)' : 'var(--accent-primary)'}; color:${v.is86 ? 'var(--text-muted)' : 'var(--accent-primary)'}; opacity:${v.is86 ? 0.6 : 1};">
                    ${v.variantName} ₹${v.price} ${v.is86 ? '(86)' : ''}
                  </button>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <!-- Bottom Row: Price & High-Contrast Touch Add Button -->
          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-subtle); padding-top:8px; margin-top:4px;">
            <div>
              <span style="font-size:1.15rem; color:var(--accent-primary); font-weight:800;">₹${item.price}</span>
              ${item.itemCode ? `<span style="font-size:0.7rem; color:var(--text-muted); margin-left:4px; font-family:monospace;">${item.itemCode}</span>` : ''}
            </div>

            <button class="btn-primary btn-add-pos-item" data-idx="${idx}" data-item-id="${item.id}" style="padding:6px 14px; font-size:0.85rem; font-weight:700; border-radius:6px; display:flex; align-items:center; gap:4px; background:var(--accent-primary); color:#000;">
              <span>+</span> Add
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  bindEvents() {
    // Food / Bar domain switch: re-scope categories, counts and the grid.
    const domainBtns = this.container.querySelectorAll('.domain-btn');
    domainBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.domain;
        if (!next || next === this.domain) return;
        this.domain = next;
        this.activeCategoryId = 'ALL';
        this.searchQuery = '';
        this.updateContent();
      });
    });

    const searchInp = this.container.querySelector('#inp-menu-search');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        const gridMount = this.container.querySelector('#items-grid-mount');
        if (gridMount) gridMount.innerHTML = this.renderItemsGrid();
        this.bindGridButtons();
        this._emitState();
      });
    }

    const clearBtn = this.container.querySelector('#btn-clear-search');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.searchQuery = '';
        this.updateContent();
      });
    }

    const catTabs = this.container.querySelectorAll('.cat-tab');
    catTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeCategoryId = tab.dataset.catId;
        this.searchQuery = '';
        const searchInput = this.container.querySelector('#inp-menu-search');
        if (searchInput) searchInput.value = '';
        this.updateContent();
      });
    });

    this._setupCategoryScroll();

    this.bindGridButtons();
  }

  /**
   * Stage: tablet-friendly category bar. Shows left/right scroll arrows + edge
   * fades only when the row actually overflows, pages the scroll on tap, and
   * keeps the active chip in view. Re-runs on every updateContent() render.
   */
  _setupCategoryScroll() {
    const bar = this.container.querySelector('#category-pills-bar');
    if (!bar) return;
    const leftBtn = this.container.querySelector('#cat-scroll-left');
    const rightBtn = this.container.querySelector('#cat-scroll-right');
    const wrap = this.container.querySelector('.category-filter-wrap');

    const update = () => {
      const maxScroll = bar.scrollWidth - bar.clientWidth;
      const canLeft = bar.scrollLeft > 4;
      const canRight = bar.scrollLeft < maxScroll - 4;
      if (leftBtn) leftBtn.classList.toggle('show', canLeft);
      if (rightBtn) rightBtn.classList.toggle('show', canRight);
      if (wrap) {
        wrap.classList.toggle('fade-left', canLeft);
        wrap.classList.toggle('fade-right', canRight);
      }
    };

    if (leftBtn) leftBtn.addEventListener('click', () => bar.scrollBy({ left: -bar.clientWidth * 0.8, behavior: 'smooth' }));
    if (rightBtn) rightBtn.addEventListener('click', () => bar.scrollBy({ left: bar.clientWidth * 0.8, behavior: 'smooth' }));
    bar.addEventListener('scroll', () => requestAnimationFrame(update));

    // Bring the active chip into horizontal view (block:'nearest' avoids any
    // vertical page jump), then compute the initial arrow/fade state.
    const active = bar.querySelector('.cat-tab.active');
    if (active && typeof active.scrollIntoView === 'function') {
      try { active.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (_) { /* older engines */ }
    }
    update();
    setTimeout(update, 60);
  }

  bindGridButtons() {
    const triggerSelect = (idx, cardEl, btnEl) => {
      let item = (this.currentItems && this.currentItems[idx]) || null;
      if (!item) return;

      // If item has variants, attach default (first available) variant info when clicking generic Add
      if (item.hasVariants && Array.isArray(item.variants) && item.variants.length > 0) {
        const defaultVar = item.variants.find(v => !v.is86) || item.variants[0];
        item = {
          ...item,
          variantId: defaultVar.variantId,
          variantName: defaultVar.variantName,
          selectedVariantId: defaultVar.variantId,
          selectedVariantName: defaultVar.variantName,
          name: `${item.name} (${defaultVar.variantName})`,
          baseName: item.name,
          price: parseFloat(defaultVar.price) || item.price,
          sellingPrice: parseFloat(defaultVar.price) || item.price
        };
      }

      // Visual feedback pulse
      if (cardEl) {
        cardEl.classList.add('added-pulse');
        setTimeout(() => cardEl.classList.remove('added-pulse'), 400);
      }
      if (btnEl) {
        const origText = btnEl.innerHTML;
        btnEl.innerHTML = '✓ Added';
        btnEl.style.background = '#10b981';
        btnEl.style.color = '#fff';
        setTimeout(() => {
          btnEl.innerHTML = origText;
          btnEl.style.background = 'var(--accent-primary)';
          btnEl.style.color = '#000';
        }, 500);
      }

      if (this.onSelectItem) {
        this.onSelectItem(item);
      }
    };

    // 1. Bind Direct Variant Pill Button Clicks
    const variantBtns = this.container.querySelectorAll('.btn-variant-select');
    variantBtns.forEach(vBtn => {
      vBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemId = vBtn.dataset.itemId;
        const variantId = vBtn.dataset.variantId;
        const variantName = vBtn.dataset.variantName;
        const variantPrice = parseFloat(vBtn.dataset.variantPrice) || 0;

        const baseItem = menuMasterModel.getMenuItemById(itemId) || (this.currentItems && this.currentItems.find(i => (i.id && String(i.id) === String(itemId)) || (i.itemId && String(i.itemId) === String(itemId))));
        if (!baseItem) return;

        const itemWithVariant = {
          ...baseItem,
          id: baseItem.id,
          variantId: variantId,
          variantName: variantName,
          selectedVariantId: variantId,
          selectedVariantName: variantName,
          name: `${baseItem.name} (${variantName})`,
          baseName: baseItem.name,
          price: variantPrice,
          sellingPrice: variantPrice
        };

        const cardEl = vBtn.closest('.pos-item-card');
        if (cardEl) {
          cardEl.classList.add('added-pulse');
          setTimeout(() => cardEl.classList.remove('added-pulse'), 400);
        }

        const origText = vBtn.innerHTML;
        vBtn.innerHTML = `✓ ${variantName}`;
        vBtn.style.background = '#10b981';
        vBtn.style.color = '#fff';
        vBtn.style.borderColor = '#10b981';
        setTimeout(() => {
          vBtn.innerHTML = origText;
          vBtn.style.background = 'var(--bg-app)';
          vBtn.style.color = 'var(--accent-primary)';
          vBtn.style.borderColor = 'var(--accent-primary)';
        }, 500);

        if (this.onSelectItem) {
          this.onSelectItem(itemWithVariant);
        }
      });
    });

    // 2. Bind Main Item Card & Add Button Clicks
    const cards = this.container.querySelectorAll('.pos-item-card');
    cards.forEach(card => {
      const idx = parseInt(card.dataset.idx, 10);
      const addBtn = card.querySelector('.btn-add-pos-item');
      if (addBtn) {
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerSelect(idx, card, addBtn);
        });
      }
      
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.idx, 10);
        const btn = card.querySelector('.btn-add-pos-item');
        triggerSelect(idx, card, btn);
      });
    });
  }
}
