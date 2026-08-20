/**
 * Capability Group 4 - Order Builder Drawer Component
 *
 * Touch-optimized order builder and cart drawer for Waiters.
 * Manages draft items, quantity increments/decrements (+/-), subtotal, and review modal.
 */

export class OrderBuilderDrawer {
  constructor({ draftItems = [], onUpdateItems, onReviewOrder }) {
    this.draftItems = draftItems || [];
    this.onUpdateItems = onUpdateItems;
    this.onReviewOrder = onReviewOrder;
    this.container = null;
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'card order-builder-drawer animate-fade-in';
    this.container.style.cssText = 'padding:16px; display:flex; flex-direction:column; background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:8px; width:100%; box-sizing:border-box;';
    this.updateContent();
    return this.container;
  }

  updateContent() {
    const totalQty = this.draftItems.reduce((acc, it) => acc + (it.quantity || 1), 0);
    const subtotal = this.draftItems.reduce((acc, it) => acc + ((it.price || 0) * (it.quantity || 1)), 0);

    const itemsHtml = this.draftItems.length ? this.draftItems.map((it, idx) => `
      <div class="draft-line-item animate-fade-in" style="padding:10px 0; border-bottom:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div style="font-weight:700; font-size:0.95rem; color:var(--text-main); word-break:break-word;">
            ${it.name}
          </div>
          <div style="font-weight:800; font-size:1rem; color:var(--accent-primary); white-space:nowrap;">
            ₹${(it.price * it.quantity).toFixed(2)}
          </div>
        </div>

        ${it.selectedModifiers && it.selectedModifiers.length ? `
          <div style="font-size:0.75rem; color:var(--text-muted);">
            ⚡ ${it.selectedModifiers.join(', ')}
          </div>
        ` : ''}

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
          <div style="display:flex; gap:6px; align-items:center; background:var(--bg-surface-2); padding:3px 6px; border-radius:6px; border:1px solid var(--border-subtle);">
            <button class="btn-secondary btn-qty-minus" data-idx="${idx}" style="width:28px; height:28px; min-width:28px; min-height:28px; font-weight:800; font-size:1rem; display:flex; align-items:center; justify-content:center; border-radius:4px; padding:0; cursor:pointer;">-</button>
            <span style="font-weight:700; font-size:0.95rem; min-width:24px; text-align:center; color:var(--text-main);">${it.quantity}</span>
            <button class="btn-secondary btn-qty-plus" data-idx="${idx}" style="width:28px; height:28px; min-width:28px; min-height:28px; font-weight:800; font-size:1rem; display:flex; align-items:center; justify-content:center; border-radius:4px; padding:0; cursor:pointer;">+</button>
          </div>
          <button class="btn-remove-item" data-idx="${idx}" style="padding:4px 8px; font-size:0.75rem; color:var(--status-danger); background:transparent; cursor:pointer; font-weight:600;">
            ✕ Remove
          </button>
        </div>
      </div>
    `).join('') : `
      <div style="color:var(--text-muted); text-align:center; padding:36px 12px; font-size:0.85rem; background:var(--bg-surface-2); border-radius:6px; border:1px dashed var(--border-subtle);">
        <div style="font-size:2rem; margin-bottom:6px;">🛒</div>
        <div style="font-weight:600; color:var(--text-secondary);">Cart is Empty</div>
        <div style="margin-top:2px; font-size:0.8rem;">Tap any dish on the left to add items to this order.</div>
      </div>
    `;

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:8px; margin-bottom:10px;">
        <div style="font-size:0.9rem; font-weight:800; text-transform:uppercase; color:var(--text-main); display:flex; align-items:center; gap:6px;">
          <span>🛒</span> Current Order Draft
        </div>
        <span class="badge ${this.draftItems.length ? 'badge-info' : ''}" style="font-size:0.75rem; font-weight:700;">
          ${totalQty} Item${totalQty !== 1 ? 's' : ''}
        </span>
      </div>

      <!-- Scrollable Items List -->
      <div id="drawer-items-list" style="max-height:340px; overflow-y:auto; padding-right:2px; display:flex; flex-direction:column; gap:4px;">
        ${itemsHtml}
      </div>

      <!-- Subtotal & Review CTA -->
      <div style="border-top:1px solid var(--border-subtle); padding-top:12px; margin-top:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span style="font-size:0.9rem; font-weight:600; color:var(--text-secondary);">Estimated Total:</span>
          <span style="font-size:1.35rem; font-weight:800; color:var(--accent-primary);">₹${subtotal.toFixed(2)}</span>
        </div>

        <button class="btn-primary w-full" id="btn-review-order" ${!this.draftItems.length ? 'disabled style="opacity:0.4; cursor:not-allowed; padding:12px; font-weight:700; width:100%; border-radius:6px;"' : 'style="padding:12px; font-weight:700; font-size:0.95rem; width:100%; border-radius:6px; background:var(--accent-primary); color:#000; cursor:pointer;"'}>
          Review & Send Order (${totalQty} Items) →
        </button>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.container.querySelectorAll('.btn-qty-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        if (this.draftItems[idx]) {
          this.draftItems[idx].quantity = (this.draftItems[idx].quantity || 1) + 1;
          if (this.onUpdateItems) this.onUpdateItems(this.draftItems);
          this.updateContent();
        }
      });
    });

    this.container.querySelectorAll('.btn-qty-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        if (this.draftItems[idx]) {
          if (this.draftItems[idx].quantity > 1) {
            this.draftItems[idx].quantity -= 1;
          } else {
            this.draftItems.splice(idx, 1);
          }
          if (this.onUpdateItems) this.onUpdateItems(this.draftItems);
          this.updateContent();
        }
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
