/**
 * Capability Group 3 & 5 - Itemized Running Bill & Cashier Finalization Modal
 * Displays real-time itemized order breakdown, GST calculation, running totals, and bill finalization dispatcher.
 */

import { sessionStateMachine, SessionMilestones } from '../../../../../businessos/platform/session/sessionStateMachine.js';
import { tableStateMachine, PhysicalTableStates } from '../../../../../businessos/platform/table_state/tableStateMachine.js';
import { sessionProjectionService } from '../../../../../businessos/platform/session/sessionProjectionService.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

export class RunningBillModal {
  constructor({ sessionId, onClose, onAddMore, onBillFinalized }) {
    this.sessionId = sessionId;
    this.onClose = onClose;
    this.onAddMore = onAddMore;
    this.onBillFinalized = onBillFinalized;
    this.modalEl = null;
  }

  render() {
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'lock-screen-overlay animate-fade-in';
    this.modalEl.style.zIndex = '99999';
    this.modalEl.style.display = 'flex';
    this.modalEl.style.alignItems = 'center';
    this.modalEl.style.justifyContent = 'center';

    this.updateContent();
    return this.modalEl;
  }

  updateContent() {
    const proj = sessionProjectionService.getSessionProjection(this.sessionId);
    if (!proj) {
      this.modalEl.innerHTML = `<div class="card" style="padding:20px;">Session not found.</div>`;
      return;
    }

    const isFinalized = proj.status === SessionMilestones.BILL_GENERATED || proj.billStatus === 'GENERATED';

    this.modalEl.innerHTML = `
      <div class="card animate-fade-in" style="max-width:540px; width:92%; max-height:90vh; display:flex; flex-direction:column; padding:0; overflow:hidden; background:var(--bg-surface-1); border:1px solid var(--border-subtle); box-shadow:var(--shadow-xl);">
        
        <!-- HEADER -->
        <div style="background:var(--bg-surface-2); padding:16px 20px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">
              ANCHOR RESTAURANT OS • ${isFinalized ? 'OFFICIAL TAX INVOICE' : 'RUNNING BILL SUMMARY'}
            </div>
            <h2 style="font-size:1.4rem; margin:2px 0 0; color:var(--text-primary);">
              Table ${proj.tableNumber} Service <span style="font-size:0.85rem; color:var(--text-muted); font-weight:400;">(${proj.tableCode})</span>
            </h2>
          </div>
          <button id="btn-close-bill-modal" class="btn-secondary" style="padding:4px 10px; font-size:1.1rem; cursor:pointer;">✕</button>
        </div>

        <!-- BODY SCROLLABLE -->
        <div style="padding:20px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:16px;">
          
          <!-- META METRICS STRIP -->
          <div style="display:flex; justify-content:space-between; font-size:0.85rem; background:var(--bg-app); padding:10px 14px; border-radius:6px; border:1px solid var(--border-subtle);">
            <div>
              <span style="color:var(--text-muted);">Session ID:</span> <strong>${proj.sessionId}</strong><br/>
              <span style="color:var(--text-muted);">Waiter:</span> <strong>${proj.waiter.name}</strong>
            </div>
            <div style="text-align:right;">
              <span style="color:var(--text-muted);">Orders Placed:</span> <strong>${proj.orderCount} Orders</strong><br/>
              <span style="color:var(--text-muted);">Elapsed Time:</span> <strong>${proj.elapsedTime}</strong>
            </div>
          </div>

          ${isFinalized ? `
            <div class="card" style="background:#10b98115; border:1px solid #10b981; padding:10px 14px; border-radius:6px; font-size:0.85rem; color:#10b981; font-weight:700; display:flex; align-items:center; gap:8px;">
              <span>✅</span> Bill Finalised & Dispatched to Cashier Station! (PAYMENT PENDING)
            </div>
          ` : ''}

          <!-- ITEMIZED ORDERS TABLE -->
          <div>
            <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:8px;">
              Itemized Order Breakdown (${proj.itemizedList ? proj.itemizedList.length : 0} Items)
            </div>
            
            ${(proj.itemizedList && proj.itemizedList.length > 0) ? `
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                  <tr style="border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                    <th style="padding:6px 4px;">Item</th>
                    <th style="padding:6px 4px; text-align:center;">Qty</th>
                    <th style="padding:6px 4px; text-align:right;">Price</th>
                    <th style="padding:6px 4px; text-align:right;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${proj.itemizedList.map(item => `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:8px 4px;">
                        <div style="font-weight:600;">${item.name}</div>
                        <span class="badge" style="font-size:0.65rem; padding:1px 4px; opacity:0.8;">
                          ${item.status}
                        </span>
                      </td>
                      <td style="padding:8px 4px; text-align:center; font-weight:700;">
                        ${item.quantity}
                      </td>
                      <td style="padding:8px 4px; text-align:right; color:var(--text-secondary);">
                        ₹${item.price.toFixed(2)}
                      </td>
                      <td style="padding:8px 4px; text-align:right; font-weight:700;">
                        ₹${item.lineTotal.toFixed(2)}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `
              <div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.85rem;">
                No items have been confirmed for this table yet.
              </div>
            `}
          </div>

          <!-- FINANCIAL RUNNING TOTALS & TAX BREAKDOWN -->
          <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; border:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:6px; font-size:0.9rem;">
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-muted);">Items Subtotal:</span>
              <strong>₹${(proj.subtotal || 0).toFixed(2)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-secondary);">
              <span>CGST (2.5%):</span>
              <span>₹${(proj.cgstAmount || 0).toFixed(2)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-secondary);">
              <span>SGST (2.5%):</span>
              <span>₹${(proj.sgstAmount || 0).toFixed(2)}</span>
            </div>
            <div style="border-top:1px dashed var(--border-subtle); margin-top:4px; padding-top:8px; display:flex; justify-content:space-between; font-size:1.1rem; font-weight:800; color:var(--accent-primary);">
              <span>Grand Total:</span>
              <span>₹${(proj.grandTotal || 0).toFixed(2)}</span>
            </div>
          </div>

        </div>

        <!-- FOOTER ACTION BAR -->
        <div style="background:var(--bg-surface-2); padding:14px 20px; border-top:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <button id="btn-add-more-items" class="btn-secondary" style="font-weight:600; font-size:0.85rem;">
            ➕ Add More Items
          </button>

          <div style="display:flex; gap:10px;">
            <button id="btn-print-slip" class="btn-secondary" style="font-weight:600; font-size:0.85rem;">
              🖨️ Print Slip
            </button>

            ${!isFinalized ? `
              <button id="btn-finalise-cashier" class="btn-primary" style="padding:8px 16px; font-weight:700; font-size:0.9rem; background:var(--accent-primary);">
                🧾 Finalise & Send to Cashier →
              </button>
            ` : `
              <button id="btn-done-bill" class="btn-primary" style="padding:8px 16px; font-weight:700; font-size:0.9rem;">
                Done / Close
              </button>
            `}
          </div>
        </div>

      </div>
    `;

    this.bindEvents(proj);
  }

  bindEvents(proj) {
    const closeBtn = this.modalEl.querySelector('#btn-close-bill-modal');
    if (closeBtn) closeBtn.addEventListener('click', () => { if (this.onClose) this.onClose(); });

    const addMoreBtn = this.modalEl.querySelector('#btn-add-more-items');
    if (addMoreBtn) {
      addMoreBtn.addEventListener('click', () => {
        if (this.onClose) this.onClose();
        if (this.onAddMore) this.onAddMore();
      });
    }

    const printBtn = this.modalEl.querySelector('#btn-print-slip');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        alert(`Printing running bill slip for Table ${proj.tableNumber} (Subtotal: ₹${(proj.subtotal || 0).toFixed(2)}, Tax: ₹${(proj.taxAmount || 0).toFixed(2)}, Grand Total: ₹${(proj.grandTotal || 0).toFixed(2)})`);
      });
    }

    const finaliseBtn = this.modalEl.querySelector('#btn-finalise-cashier');
    if (finaliseBtn) {
      finaliseBtn.addEventListener('click', () => {
        sessionStateMachine.transitionMilestone(this.sessionId, SessionMilestones.BILL_GENERATED);
        tableStateMachine.transitionTableState(proj.tableNumber, PhysicalTableStates.PAYMENT_PENDING);

        platformEventBus.publish('bill:finalized', {
          sessionId: this.sessionId,
          tableNumber: proj.tableNumber,
          tableCode: proj.tableCode,
          subtotal: proj.subtotal,
          cgstAmount: proj.cgstAmount,
          sgstAmount: proj.sgstAmount,
          grandTotal: proj.grandTotal,
          itemizedList: proj.itemizedList,
          waiterName: proj.waiter.name,
          timestamp: new Date().toISOString()
        });

        alert(`Bill for Table ${proj.tableNumber} (Total: ₹${(proj.grandTotal || 0).toFixed(2)}) has been finalised and sent to Cashier! Table status set to PAYMENT_PENDING.`);
        if (this.onBillFinalized) this.onBillFinalized();
        this.updateContent();
      });
    }

    const doneBtn = this.modalEl.querySelector('#btn-done-bill');
    if (doneBtn) {
      doneBtn.addEventListener('click', () => {
        if (this.onClose) this.onClose();
      });
    }
  }
}
