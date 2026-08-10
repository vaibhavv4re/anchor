/**
 * Capability Group 4 - Order Builder Drawer Component
 * Manages draft items, quantity adjustments (+/-), variant modifiers, subtotal, and review workflow.
 */

export class OrderBuilderDrawer {
  constructor({ draftItems = [], onUpdateItems, onReviewOrder }) {
    this.draftItems = draftItems;
    this.onUpdateItems = onUpdateItems;
    this.onReviewOrder = onReviewOrder;
    this.container = null;
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'card animate-fade-in';
    this.container.style.cssText = 'padding:var(--space-md); display:flex; flex-direction:column; height:100%;';
    this.updateContent();
    return this.container;
  }

  updateContent() {
    const subtotal = this.draftItems.reduce((acc, it) => acc + (it.price * it.quantity), 0);

    const itemsHtml = this.draftItems.length ? this.draftItems.map((it, idx) => `
      <div style="padding:var(--space-sm) 0; border-bottom:1px solid var(--border-subtle);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-weight:600; font-size:0.95rem;">${it.name}</div>
          <div style="font-weight:700; color:var(--accent-primary);">₹${it.price * it.quantity}</div>
        </div>

        ${it.selectedModifiers && it.selectedModifiers.length ? `
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
            Opt: ${it.selectedModifiers.join(', ')}
          </div>
        ` : ''}

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="btn-secondary btn-qty-minus" data-idx="${idx}" style="padding:2px 8px; font-weight:700;">-</button>
            <span style="font-weight:600; font-size:0.9rem; min-width:20px; text-align:center;">${it.quantity}</span>
            <button class="btn-secondary btn-qty-plus" data-idx="${idx}" style="padding:2px 8px; font-weight:700;">+</button>
          </div>
          <button class="btn-secondary btn-remove-item" data-idx="${idx}" style="padding:2px 6px; font-size:0.75rem; color:var(--status-danger);">Remove</button>
        </div>
      </div>
    `).join('') : `<div style="color:var(--text-muted); text-align:center; padding:var(--space-xl); font-size:0.875rem;">No items in draft order yet. Select items from the menu to build order!</div>`;

    this.container.innerHTML = `
      <div style="font-size:0.875rem; font-weight:600; text-transform:uppercase; color:var(--text-secondary); margin-bottom:var(--space-sm);">
        🛒 Draft Order Items
      </div>

      <div style="flex:1; overflow-y:auto; padding-right:4px;">
        ${itemsHtml}
      </div>

      <div style="border-top:1px solid var(--border-subtle); padding-top:var(--space-md); margin-top:var(--space-md);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-md);">
          <span style="font-size:1rem; font-weight:600;">Draft Subtotal</span>
          <span style="font-size:1.25rem; font-weight:700; color:var(--accent-primary);">₹${subtotal}</span>
        </div>

        <button class="btn-primary w-full" id="btn-review-order" ${!this.draftItems.length ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''} style="padding:12px; font-weight:600;">
          Review & Confirm Order (${this.draftItems.length} items)
        </button>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.container.querySelectorAll('.btn-qty-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        this.draftItems[idx].quantity += 1;
        if (this.onUpdateItems) this.onUpdateItems(this.draftItems);
        this.updateContent();
      });
    });

    this.container.querySelectorAll('.btn-qty-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        if (this.draftItems[idx].quantity > 1) {
          this.draftItems[idx].quantity -= 1;
        } else {
          this.draftItems.splice(idx, 1);
        }
        if (this.onUpdateItems) this.onUpdateItems(this.draftItems);
        this.updateContent();
      });
    });

    this.container.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        this.draftItems.splice(idx, 1);
        if (this.onUpdateItems) this.onUpdateItems(this.draftItems);
        this.updateContent();
      });
    });

    const reviewBtn = this.container.querySelector('#btn-review-order');
    if (reviewBtn && this.draftItems.length) {
      reviewBtn.addEventListener('click', () => {
        if (this.onReviewOrder) this.onReviewOrder(this.draftItems);
      });
    }
  }
}
