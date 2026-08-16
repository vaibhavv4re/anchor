/**
 * Capability Group 4 - Touch Menu Browser Component (< 5s Search)
 * Touch-optimized menu grid categorized with fast search filtering (< 50ms) and dietary indicators.
 */

import { menuMasterModel } from '../../../../../businessos/platform/ordering/menuMasterModel.js';

export class MenuBrowserView {
  constructor({ onSelectItem }) {
    this.onSelectItem = onSelectItem;
    this.activeCategoryId = 'cat-starters';
    this.searchQuery = '';
    this.container = null;
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'menu-browser-container flex-col gap-md animate-fade-in';
    this.updateContent();
    return this.container;
  }

  updateContent() {
    const categories = menuMasterModel.getAllCategories();

    this.container.innerHTML = `
      <!-- Fast Search Bar -->
      <div style="display:flex; gap:var(--space-md); align-items:center;">
        <input type="text" id="inp-menu-search" value="${this.searchQuery}" placeholder="🔍 Search menu items under 5 seconds (e.g. Butter, Naan, Soda)..." style="flex:1; padding:12px 16px; font-size:1rem;">
      </div>

      <!-- Category Filter Tabs -->
      <div style="display:flex; gap:var(--space-sm); overflow-x:auto; padding-bottom:4px;">
        ${categories.map(c => `
          <button class="cat-tab ${c.id === this.activeCategoryId && !this.searchQuery ? 'active' : ''}" data-cat-id="${c.id}">
            ${c.name}
          </button>
        `).join('')}
      </div>

      <!-- Menu Items Touch Grid -->
      <div id="items-grid-mount" class="grid grid-cols-2 gap-md" style="max-height:480px; overflow-y:auto; padding-right:4px;">
        ${this.renderItemsGrid()}
      </div>

      <style>
        .cat-tab {
          padding: 8px 16px;
          border-radius: var(--radius-md);
          font-size: var(--font-size-sm);
          font-weight: 500;
          color: var(--text-muted);
          background-color: var(--bg-surface-1);
          border: 1px solid var(--border-subtle);
          white-space: nowrap;
        }
        .cat-tab.active {
          color: var(--accent-primary);
          background-color: var(--bg-surface-2);
          border-color: var(--accent-primary);
          font-weight: 600;
        }
      </style>
    `;

    this.bindEvents();
  }

  renderItemsGrid() {
    const items = this.searchQuery ? 
      menuMasterModel.searchItems(this.searchQuery) : 
      menuMasterModel.getItemsByCategory(this.activeCategoryId);

    if (!items.length) {
      return `<div style="grid-column:1/-1; color:var(--text-muted); padding:var(--space-xl); text-align:center;">No menu items found matching "${this.searchQuery}".</div>`;
    }

    return items.map(item => `
      <div class="card item-card animate-fade-in" data-item-id="${item.id}" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding:var(--space-md); transition:transform var(--transition-fast);">
        <div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:0.8rem;">${item.dietary === 'VEG' ? '🟢' : '🔴'}</span>
            <div style="font-weight:600; font-size:1rem;">${item.name}</div>
          </div>
          <div style="font-size:0.875rem; color:var(--accent-primary); font-weight:700; margin-top:4px;">₹${item.price}</div>
        </div>
        <button class="btn-primary btn-add-item" data-item-id="${item.id}" style="padding:6px 14px; font-size:0.875rem;">+ Add</button>
      </div>
    `).join('');
  }

  bindEvents() {
    const searchInp = this.container.querySelector('#inp-menu-search');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        const gridMount = this.container.querySelector('#items-grid-mount');
        if (gridMount) gridMount.innerHTML = this.renderItemsGrid();
        this.bindGridButtons();
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

    this.bindGridButtons();
  }

  bindGridButtons() {
    const addBtns = this.container.querySelectorAll('.btn-add-item');
    addBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemId = btn.dataset.itemId;
        const item = menuMasterModel.getItem(itemId);
        if (item && this.onSelectItem) this.onSelectItem(item);
      });
    });

    const cards = this.container.querySelectorAll('.item-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const itemId = card.dataset.itemId;
        const item = menuMasterModel.getItem(itemId);
        if (item && this.onSelectItem) this.onSelectItem(item);
      });
    });
  }
}
