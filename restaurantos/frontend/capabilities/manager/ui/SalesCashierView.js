/**
 * RestaurantOS - Phase M5: Manager Sales & Cashier View
 * Financial Position, Tax Breakdown, Settlement Payment Mix, Bill Activity & Audit Trail.
 * Derived STRICTLY from financial ledger (invoices & settled payments) with 0 double-counting.
 */

import { managerProjectionService } from '../../../../../businessos/platform/manager/managerProjectionService.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

export class SalesCashierView {
  constructor(deps = {}) {
    this.tenantId = deps.tenantId || null;
    this.container = null;
    this.unsubscribeEvents = [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'sales-cashier-view flex-col gap-lg animate-fade-in';
    this.container.style.width = '100%';

    this.subscribePlatformEvents();
    this.updateContent();

    return this.container;
  }

  subscribePlatformEvents() {
    const refresh = () => {
      if (this.container && document.body.contains(this.container)) {
        this.updateContent();
      }
    };
    this.unsubscribeEvents = [
      platformEventBus.subscribe('payment:recorded', refresh),
      platformEventBus.subscribe('bill:finalized', refresh),
      platformEventBus.subscribe('bill:settled', refresh),
      platformEventBus.subscribe('bill:reopened', refresh),
      platformEventBus.subscribe('discount:approved', refresh)
    ];
  }

  updateContent() {
    if (!this.container) return;

    const data = managerProjectionService.getSalesCashierProjection(this.tenantId);
    const fp = data.financialPosition;
    const mix = data.paymentMix;
    const counts = data.paymentCounts;
    const ba = data.billActivity;
    const audit = data.managerAudit;

    const formatCurrency = (val) => '₹' + Number(val || 0).toLocaleString('en-IN');

    // Calculate Payment Mix percentages
    const totalPaid = fp.settledRevenue || 1;
    const cashPct = Math.round(((mix.CASH || 0) / totalPaid) * 100);
    const upiPct = Math.round(((mix.UPI || 0) / totalPaid) * 100);
    const cardPct = Math.min(100 - cashPct - upiPct, Math.round(((mix.CARD || 0) / totalPaid) * 100));

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h2 style="font-size:1.5rem; margin:0;">💰 Sales & Cashier Ledger (Phase M5)</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Strict Financial Ledger Truth • Tax & Charge Breakdown • Cashier Payment Mix • Bill Audit Trail</p>
        </div>
        <span class="badge badge-success" style="font-size:0.85rem; padding:6px 14px;">
          ⚖️ CA Accounting Boundary Locked
        </span>
      </div>

      <!-- 1. Live Financial Position (3x3 Grid) -->
      <div class="card" style="padding:20px; background:var(--bg-surface-1); margin-bottom:16px;">
        <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:14px;">
          📊 LIVE FINANCIAL POSITION & TAX LEDGER BREAKDOWN
        </div>

        <div class="grid grid-cols-3 gap-md">
          <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">GROSS SALES</div>
            <div style="font-size:1.5rem; font-weight:700; color:var(--text-primary); margin-top:2px;">${formatCurrency(fp.grossSales)}</div>
            <div style="font-size:0.725rem; color:var(--text-muted); margin-top:2px;">Subtotal before discounts</div>
          </div>

          <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">TOTAL DISCOUNTS</div>
            <div style="font-size:1.5rem; font-weight:700; color:#ef4444; margin-top:4px;">-${formatCurrency(fp.totalDiscounts)}</div>
            <div style="font-size:0.725rem; color:var(--text-muted); margin-top:2px;">Item & bill level courtesy</div>
          </div>

          <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">NET TAXABLE SALES</div>
            <div style="font-size:1.5rem; font-weight:700; color:var(--accent-primary); margin-top:4px;">${formatCurrency(fp.taxableSales)}</div>
            <div style="font-size:0.725rem; color:var(--text-muted); margin-top:2px;">Taxable base revenue</div>
          </div>

          <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">CGST (2.5%)</div>
            <div style="font-size:1.3rem; font-weight:700; color:var(--text-primary); margin-top:2px;">${formatCurrency(fp.cgstTotal)}</div>
          </div>

          <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">SGST (2.5%)</div>
            <div style="font-size:1.3rem; font-weight:700; color:var(--text-primary); margin-top:2px;">${formatCurrency(fp.sgstTotal)}</div>
          </div>

          <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">SERVICE CHARGE (5.0%)</div>
            <div style="font-size:1.3rem; font-weight:700; color:var(--text-primary); margin-top:2px;">${formatCurrency(fp.serviceChargeTotal)}</div>
          </div>

          <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; border-left:4px solid #3b82f6;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">INVOICED REVENUE</div>
            <div style="font-size:1.5rem; font-weight:700; color:#3b82f6; margin-top:2px;">${formatCurrency(fp.invoicedRevenue)}</div>
            <div style="font-size:0.725rem; color:var(--text-muted); margin-top:2px;">GST Tax Invoices issued</div>
          </div>

          <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; border-left:4px solid #10b981;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">SETTLED REVENUE TODAY</div>
            <div style="font-size:1.6rem; font-weight:700; color:#10b981; margin-top:2px;">${formatCurrency(fp.settledRevenue)}</div>
            <div style="font-size:0.725rem; color:#10b981; font-weight:600; margin-top:2px;">Total cash & digital collected</div>
          </div>

          <div style="background:var(--bg-surface-2); padding:14px; border-radius:6px; border-left:4px solid #f59e0b;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">PAYMENT PENDING</div>
            <div style="font-size:1.5rem; font-weight:700; color:#f59e0b; margin-top:2px;">${formatCurrency(fp.paymentPendingRevenue)}</div>
            <div style="font-size:0.725rem; color:var(--text-muted); margin-top:2px;">Billed awaiting settlement</div>
          </div>
        </div>
      </div>

      <!-- 2. Payment Method Mix & Cashier Settlement Breakdown -->
      <div class="grid grid-cols-2 gap-md" style="margin-bottom:16px;">
        <div class="card" style="padding:20px; background:var(--bg-surface-1);">
          <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:12px;">
            💳 SETTLED PAYMENT METHOD MIX (${data.totalSettledTransactions} Transactions)
          </div>

          <div style="height:14px; border-radius:7px; background:var(--bg-surface-2); display:flex; overflow:hidden; margin-bottom:14px;">
            <div style="width:${upiPct}%; background:#10b981; transition:width 0.3s;" title="UPI: ${upiPct}%"></div>
            <div style="width:${cardPct}%; background:#3b82f6; transition:width 0.3s;" title="Card: ${cardPct}%"></div>
            <div style="width:${cashPct}%; background:#f59e0b; transition:width 0.3s;" title="Cash: ${cashPct}%"></div>
          </div>

          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; font-size:0.85rem;">
            <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px; text-align:center;">
              <span style="color:#10b981; font-weight:700; display:block;">🟢 UPI</span>
              <strong style="font-size:1.1rem; color:var(--text-primary);">${formatCurrency(mix.UPI || 0)}</strong>
              <div style="font-size:0.725rem; color:var(--text-muted);">${counts.UPI || 0} txns (${upiPct}%)</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px; text-align:center;">
              <span style="color:#3b82f6; font-weight:700; display:block;">🔵 CARD</span>
              <strong style="font-size:1.1rem; color:var(--text-primary);">${formatCurrency(mix.CARD || 0)}</strong>
              <div style="font-size:0.725rem; color:var(--text-muted);">${counts.CARD || 0} txns (${cardPct}%)</div>
            </div>
            <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px; text-align:center;">
              <span style="color:#f59e0b; font-weight:700; display:block;">🟠 CASH</span>
              <strong style="font-size:1.1rem; color:var(--text-primary);">${formatCurrency(mix.CASH || 0)}</strong>
              <div style="font-size:0.725rem; color:var(--text-muted);">${counts.CASH || 0} txns (${cashPct}%)</div>
            </div>
          </div>
        </div>

        <!-- 3. Bill Activity Ledger -->
        <div class="card" style="padding:20px; background:var(--bg-surface-1);">
          <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:12px;">
            🧾 BILL & REVISION ACTIVITY LEDGER
          </div>

          <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px; font-size:0.85rem;">
            <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px;">
              <span style="color:var(--text-muted); display:block; font-size:0.725rem;">BILLS DISPATCHED</span>
              <strong style="font-size:1.3rem; color:var(--text-primary);">${ba.billsSentCount}</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px;">
              <span style="color:var(--text-muted); display:block; font-size:0.725rem;">RECALLED BY CASHIER</span>
              <strong style="font-size:1.3rem; color:#ef4444;">${ba.billsRecalledCount}</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px;">
              <span style="color:var(--text-muted); display:block; font-size:0.725rem;">TAX INVOICES ISSUED</span>
              <strong style="font-size:1.3rem; color:#3b82f6;">${ba.invoicesIssuedCount}</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:10px; border-radius:6px;">
              <span style="color:var(--text-muted); display:block; font-size:0.725rem;">AVG CHECK PER TABLE</span>
              <strong style="font-size:1.3rem; color:#10b981;">${formatCurrency(ba.avgBillValue)}</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. Manager Financial Audit View -->
      <div class="grid grid-cols-2 gap-md">
        <!-- Discounts by Server -->
        <div class="card" style="padding:20px; background:var(--bg-surface-1);">
          <h3 style="margin-top:0; font-size:1.05rem; border-bottom:1px solid var(--border-subtle); padding-bottom:10px;">
            👔 DISCOUNTS BY SERVER / WAITER
          </h3>
          ${Object.keys(audit.discountsByWaiter).length === 0 ? `
            <div style="color:var(--text-muted); font-size:0.85rem; font-style:italic; padding:12px 0;">No discounts granted during this shift.</div>
          ` : `
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${Object.entries(audit.discountsByWaiter).map(([waiter, amt]) => `
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; background:var(--bg-surface-2); padding:8px 12px; border-radius:6px;">
                  <span>${waiter}</span>
                  <strong style="color:#ef4444;">-${formatCurrency(amt)}</strong>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Recalled Bill History Log -->
        <div class="card" style="padding:20px; background:var(--bg-surface-1);">
          <h3 style="margin-top:0; font-size:1.05rem; border-bottom:1px solid var(--border-subtle); padding-bottom:10px;">
            📜 RECALLED BILL HISTORY LOG (${audit.recalledBillHistory.length})
          </h3>
          ${audit.recalledBillHistory.length === 0 ? `
            <div style="color:var(--text-muted); font-size:0.85rem; font-style:italic; padding:12px 0;">Zero bill recall events recorded in audit log.</div>
          ` : `
            <div style="display:flex; flex-direction:column; gap:8px; max-height:180px; overflow-y:auto; padding-right:4px;">
              ${audit.recalledBillHistory.map(item => `
                <div style="background:var(--bg-surface-2); padding:8px 12px; border-radius:6px; font-size:0.8rem; border-left:3px solid #ef4444;">
                  <div style="display:flex; justify-content:space-between; font-weight:600;">
                    <span>${item.tableCode} (Rev #${item.revisionNumber})</span>
                    <span style="color:#ef4444;">${formatCurrency(item.amount)}</span>
                  </div>
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Reason: <em>"${item.reason}"</em> • Waiter: ${item.waiterName}</div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  }
}
