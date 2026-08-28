/**
 * RestaurantOS - Operations Overview Landing Cockpit (Phase M1)
 * 3-Level Exception-Driven Cockpit: Operational Health + NOW + NEEDS ATTENTION + SHIFT PERFORMANCE
 * Subscribes directly to platform projection updates for live real-time updates without page refresh.
 */

import { managerProjectionService } from '../../../../../businessos/platform/manager/managerProjectionService.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { ManagerTableInspectorModal } from './ManagerTableInspectorModal.js';

export class OperationsOverviewView {
  constructor(deps = {}) {
    this.tenantId = deps.tenantId || null;
    this.container = null;
    this.unsubscribeEvents = [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'operations-overview-container flex-col gap-lg animate-fade-in';
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
      platformEventBus.subscribe('session:created', refresh),
      platformEventBus.subscribe('session:milestone:changed', refresh),
      platformEventBus.subscribe('order:confirmed', refresh),
      platformEventBus.subscribe('ticket:status_changed', refresh),
      platformEventBus.subscribe('bill:finalized', refresh),
      platformEventBus.subscribe('bill:settled', refresh),
      platformEventBus.subscribe('bill:reopened', refresh),
      platformEventBus.subscribe('payment:recorded', refresh)
    ];
  }

  updateContent() {
    if (!this.container) return;

    const data = managerProjectionService.getOperationalProjection(this.tenantId);
    const { operationalHealth, healthLabel, healthSubtitle, nowMetrics, needsAttentionQueue, shiftPerformance } = data;

    // Health theme styles
    const healthStyles = {
      NORMAL: { bg: '#10b98118', border: '#10b981', color: '#10b981', icon: '🟢' },
      ATTENTION_REQUIRED: { bg: '#f59e0b18', border: '#f59e0b', color: '#f59e0b', icon: '🟠' },
      INTERVENTION_REQUIRED: { bg: '#ef444418', border: '#ef4444', color: '#ef4444', icon: '🔴' }
    }[operationalHealth] || { bg: '#10b98118', border: '#10b981', color: '#10b981', icon: '🟢' };

    // Format currency
    const formatCurrency = (val) => '₹' + Number(val || 0).toLocaleString('en-IN');

    // Payment mix percentages
    const totalPayments = (shiftPerformance.paymentMix.CASH || 0) + (shiftPerformance.paymentMix.UPI || 0) + (shiftPerformance.paymentMix.CARD || 0);
    const upiPct = totalPayments > 0 ? Math.round((shiftPerformance.paymentMix.UPI / totalPayments) * 100) : 0;
    const cardPct = totalPayments > 0 ? Math.round((shiftPerformance.paymentMix.CARD / totalPayments) * 100) : 0;
    const cashPct = totalPayments > 0 ? Math.round((shiftPerformance.paymentMix.CASH / totalPayments) * 100) : 0;

    this.container.innerHTML = `
      <!-- Header Bar & Health Banner -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:var(--space-md);">
        <div>
          <h2 style="font-size:1.5rem; margin:0;">📊 Operations Overview</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Live Operational Cockpit & Exception Queue • Real-Time Systems Projection</p>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="badge badge-info" style="font-size:0.75rem; text-transform:uppercase;">SHIFT ACTIVE</span>
          <span style="font-size:0.75rem; color:var(--text-muted);">Updated: ${new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      <!-- 1. Operational Health Banner -->
      <div class="card animate-fade-in" style="padding:16px 20px; background:${healthStyles.bg}; border-left:6px solid ${healthStyles.border}; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-size:1.75rem;">${healthStyles.icon}</span>
          <div>
            <div style="font-weight:700; font-size:1.1rem; color:${healthStyles.color};">${healthLabel}</div>
            <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:2px;">${healthSubtitle}</div>
          </div>
        </div>
        <div>
          <span class="badge" style="background:var(--bg-surface-2); border:1px solid ${healthStyles.border}; color:${healthStyles.color}; font-size:0.875rem; padding:6px 14px;">
            ⚠️ ${needsAttentionQueue.length} Active Exceptions
          </span>
        </div>
      </div>

      <!-- 2. NOW Strip (Live Real-Time Operational Metrics) -->
      <div>
        <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.5px; margin-bottom:8px;">
          🟢 NOW • REAL-TIME OPERATIONAL METRICS
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid var(--accent-primary);">
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">💰 SALES TODAY</div>
            <div style="font-size:1.6rem; font-weight:700; color:var(--accent-primary); margin-top:4px;">${formatCurrency(nowMetrics.salesToday)}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">From settled cashier payments</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #10b981;">
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">🪑 ACTIVE TABLES</div>
            <div style="font-size:1.6rem; font-weight:700; color:#10b981; margin-top:4px;">${nowMetrics.activeTableCount} <span style="font-size:1rem; font-weight:400; color:var(--text-muted);">/ ${nowMetrics.totalTableCount}</span></div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Tables currently seated</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #3b82f6;">
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">👥 SEATED GUESTS</div>
            <div style="font-size:1.6rem; font-weight:700; color:#3b82f6; margin-top:4px;">${nowMetrics.seatedGuests}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">In-house dining covers</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #f59e0b;">
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">🍳 ACTIVE KITCHEN KOTS</div>
            <div style="font-size:1.6rem; font-weight:700; color:#f59e0b; margin-top:4px;">${nowMetrics.activeKotsCount}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Orders currently in production</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #8b5cf6;">
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">🛎️ READY DISHES</div>
            <div style="font-size:1.6rem; font-weight:700; color:#8b5cf6; margin-top:4px;">${nowMetrics.readyDishesCount || 0}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Prepared dishes awaiting pickup</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #ec4899;">
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">🧾 BILLS AWAITING CASHIER</div>
            <div style="font-size:1.6rem; font-weight:700; color:#ec4899; margin-top:4px;">${nowMetrics.billsAwaitingCashierCount || 0}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Bills generated pending settlement</div>
          </div>
        </div>
      </div>

      <!-- 3. NEEDS ATTENTION (DOMINANT EXCEPTION QUEUE) -->
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#ef4444; letter-spacing:0.5px;">
            ⚠️ NEEDS ATTENTION • OPERATIONAL EXCEPTION QUEUE (${needsAttentionQueue.length})
          </div>
          <span style="font-size:0.75rem; color:var(--text-muted);">Requires Manager Review / Intervention</span>
        </div>

        ${needsAttentionQueue.length === 0 ? `
          <div class="card" style="padding:24px; text-align:center; background:var(--bg-surface-1); border-left:4px solid #10b981;">
            <div style="font-size:1.5rem;">🟢</div>
            <div style="font-weight:700; color:#10b981; margin-top:6px;">Zero Active Exceptions</div>
            <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">All kitchen orders, bill revisions, and guest services are running smoothly.</div>
          </div>
        ` : `
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${needsAttentionQueue.map(exp => {
              const borderColors = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#3b82f6' };
              const icons = { DELAYED_KOT: '🔴', RECALLED_BILL: '🟠', PICKUP_LAG: '🟡', DISCOUNT_APPROVAL: '🔵' };
              const bColor = borderColors[exp.severity] || '#f59e0b';
              const icon = icons[exp.type] || '⚠️';

              return `
                <div class="card animate-fade-in" style="padding:14px 18px; background:var(--bg-surface-1); border-left:5px solid ${bColor}; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                  <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:1.4rem;">${icon}</span>
                    <div>
                      <div style="font-weight:700; font-size:0.95rem; color:var(--text-primary);">${exp.title}</div>
                      <div style="font-size:0.825rem; color:var(--text-secondary); margin-top:2px;">${exp.subtitle}</div>
                    </div>
                  </div>
                  <div style="display:flex; align-items:center; gap:10px;">
                    <span class="badge" style="background:var(--bg-surface-2); border:1px solid ${bColor}; color:${bColor}; font-size:0.75rem;">
                      ${exp.severity} SEVERITY
                    </span>
                    <button class="btn-secondary btn-inspect-exp" data-exp-id="${exp.id}" data-table="${exp.tableNumber || 1}" data-session-id="${exp.sessionId || ''}" style="padding:6px 12px; font-size:0.8rem;">
                      Inspect & Resolve →
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <!-- 4. SHIFT PERFORMANCE & FINANCIAL SETTLEMENT LEDGER -->
      <div class="card" style="padding:20px; background:var(--bg-surface-1); border-radius:8px;">
        <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:14px;">
          📈 SHIFT PERFORMANCE & FINANCIALLY SETTLED REVENUE
        </div>

        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- 3 Stat Pill Cards -->
          <div class="grid grid-cols-3 gap-md">
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">SETTLED REVENUE TODAY</div>
              <div style="font-size:1.6rem; font-weight:700; color:#10b981; margin-top:2px;">${formatCurrency(shiftPerformance.salesToday)}</div>
            </div>
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">AVG CHECK PER TABLE</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--text-primary); margin-top:2px;">${formatCurrency(shiftPerformance.avgBillValue)}</div>
            </div>
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">COMPLETED SESSIONS</div>
              <div style="font-size:1.4rem; font-weight:700; color:var(--text-primary); margin-top:2px;">${shiftPerformance.completedSessionsCount} <span style="font-size:0.85rem; font-weight:400; color:var(--text-muted);">settled</span></div>
            </div>
          </div>

          <!-- Payment Mix Progress Bar -->
          <div style="border-top:1px solid var(--border-subtle); padding-top:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; font-weight:600; margin-bottom:6px;">
              <span>💳 SETTLED PAYMENT METHOD MIX</span>
              <span style="color:var(--text-muted); font-size:0.75rem;">Total: ${formatCurrency(shiftPerformance.salesToday)}</span>
            </div>
            <div style="height:12px; border-radius:6px; background:var(--bg-surface-2); display:flex; overflow:hidden; margin-bottom:8px;">
              <div style="width:${upiPct}%; background:#10b981; transition:width 0.3s;" title="UPI: ${upiPct}%"></div>
              <div style="width:${cardPct}%; background:#3b82f6; transition:width 0.3s;" title="Card: ${cardPct}%"></div>
              <div style="width:${cashPct}%; background:#f59e0b; transition:width 0.3s;" title="Cash: ${cashPct}%"></div>
            </div>
            <div style="display:flex; gap:16px; font-size:0.75rem; flex-wrap:wrap;">
              <span style="color:#10b981; font-weight:600;">🟢 UPI: ${formatCurrency(shiftPerformance.paymentMix.UPI || 0)} (${upiPct}%)</span>
              <span style="color:#3b82f6; font-weight:600;">🔵 Card: ${formatCurrency(shiftPerformance.paymentMix.CARD || 0)} (${cardPct}%)</span>
              <span style="color:#f59e0b; font-weight:600;">🟠 Cash: ${formatCurrency(shiftPerformance.paymentMix.CASH || 0)} (${cashPct}%)</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Bind exception action buttons to open ManagerTableInspectorModal
    this.container.querySelectorAll('.btn-inspect-exp').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tableNumber = e.currentTarget.dataset.table;
        const sessionId = e.currentTarget.dataset.sessionId;
        const modal = new ManagerTableInspectorModal({
          tableNumber,
          sessionId,
          tenantId: this.tenantId,
          onClose: () => this.updateContent()
        });
        document.body.appendChild(modal.render());
      });
    });
  }
}
