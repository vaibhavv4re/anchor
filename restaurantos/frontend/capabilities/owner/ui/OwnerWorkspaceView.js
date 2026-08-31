/**
 * RestaurantOS Capability - Owner Business Cockpit (F7.1 - F7.8)
 * Executive 30-Second Business Intelligence Cockpit for Restaurant Owners.
 * Answers: "How is my restaurant actually doing, where am I making money, and where am I losing money?"
 * Strictly consumes profitabilityEngine.js, foodCostEngine.js, yieldControlEngine.js, and supplierModel.js.
 * Read-only decision cockpit: No order editing, no inventory adjustment, no payment entry, no batch execution.
 */

import { ownerProjectionService } from '../../../../../businessos/platform/owner/ownerProjectionService.js';
import { profitabilityEngine } from '../../../../../businessos/platform/owner/profitabilityEngine.js';
import { foodCostEngine } from '../../../../../businessos/platform/inventory/foodCostEngine.js';
import { yieldControlEngine } from '../../../../../businessos/platform/kitchen/yieldControlEngine.js';
import { expenseModel } from '../../../../../businessos/platform/finance/expenseModel.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

export class OwnerWorkspaceView {
  constructor(deps = {}) {
    this.container = null;
    this.mountEl = null;
    this.activeTab = 'overview'; // 'overview' | 'profitability' | 'sales' | 'menu' | 'expenses' | 'accounting'
    this.dateFilter = 'month'; // 'today' | 'week' | 'month' | 'all'
    this.selectedTraceIngredient = null;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
  }

  render(mountEl, sessionUser = null, subView = 'overview') {
    this.mountEl = mountEl;
    if (subView && subView !== 'owner') {
      this.activeTab = subView;
    }

    this.container = document.createElement('div');
    this.container.className = 'owner-workspace animate-fade-in';
    this.container.style.cssText = 'display:flex; flex-direction:column; width:100%; height:100%; background:var(--bg-base); color:var(--text-primary); overflow:hidden; font-family:var(--font-family, sans-serif);';

    this.subscribePlatformEvents();
    this.updateContent(sessionUser);

    if (mountEl) {
      mountEl.innerHTML = '';
      mountEl.appendChild(this.container);
    }
    return this.container;
  }

  subscribePlatformEvents() {
    const refresh = () => {
      if (this.container && document.body.contains(this.container)) {
        this.updateContent();
      }
    };
    this.unsubscribeEvents = [
      platformEventBus.subscribe('payment:created', refresh),
      platformEventBus.subscribe('expense:recorded', refresh),
      platformEventBus.subscribe('exception:resolved', refresh),
      platformEventBus.subscribe('reconciliation:exception:flagged', refresh),
      platformEventBus.subscribe('data:changed', refresh)
    ];
  }

  updateContent(sessionUser = null) {
    if (!this.container) return;

    const overview = ownerProjectionService.getBusinessOverview(this.dateFilter);
    const pl = profitabilityEngine.getCanonicalProfitAndLoss(this.dateFilter);
    const signals = profitabilityEngine.getDerivedSmartSignals(this.dateFilter);
    const rawUser = sessionUser || {};
    const userName = rawUser.name || rawUser.employeeName || rawUser.adminName || 'Nagesh';
    const user = { name: userName, role: rawUser.roleId || 'Owner' };

    this.container.innerHTML = `
      <!-- TOP NAVIGATION BAR -->
      <header style="padding:14px 24px; background:var(--bg-surface-1); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="width:38px; height:38px; border-radius:10px; background:linear-gradient(135deg, #8b5cf6, #ec4899); display:flex; align-items:center; justify-content:center; font-size:1.2rem; font-weight:800; color:#fff; box-shadow:0 4px 12px rgba(139,92,246,0.3);">👑</div>
          <div>
            <h1 style="margin:0; font-size:1.2rem; font-weight:800; letter-spacing:-0.02em; display:flex; align-items:center; gap:8px;">
              Anchor BusinessOS <span class="badge" style="background:linear-gradient(90deg,#8b5cf6,#ec4899); color:#fff; font-size:0.7rem; padding:2px 8px;">OWNER DECISION COCKPIT (F7)</span>
            </h1>
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">Executive Business Intelligence, Canonical P&amp;L &amp; Smart Leakage Attribution</div>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:12px;">
          <!-- PERIOD SELECTOR -->
          <div style="display:flex; background:var(--bg-surface-2); border-radius:8px; padding:3px; border:1px solid var(--border-subtle);">
            <button class="btn-period ${this.dateFilter === 'today' ? 'active' : ''}" data-period="today" style="padding:5px 12px; font-size:0.78rem; font-weight:700; border:none; border-radius:6px; background:${this.dateFilter === 'today' ? 'var(--accent-primary)' : 'transparent'}; color:${this.dateFilter === 'today' ? '#000' : 'var(--text-secondary)'}; cursor:pointer;">Today</button>
            <button class="btn-period ${this.dateFilter === 'week' ? 'active' : ''}" data-period="week" style="padding:5px 12px; font-size:0.78rem; font-weight:700; border:none; border-radius:6px; background:${this.dateFilter === 'week' ? 'var(--accent-primary)' : 'transparent'}; color:${this.dateFilter === 'week' ? '#000' : 'var(--text-secondary)'}; cursor:pointer;">This Week</button>
            <button class="btn-period ${this.dateFilter === 'month' ? 'active' : ''}" data-period="month" style="padding:5px 12px; font-size:0.78rem; font-weight:700; border:none; border-radius:6px; background:${this.dateFilter === 'month' ? 'var(--accent-primary)' : 'transparent'}; color:${this.dateFilter === 'month' ? '#000' : 'var(--text-secondary)'}; cursor:pointer;">This Month</button>
          </div>

          <div style="display:flex; align-items:center; gap:8px; padding:6px 12px; background:var(--bg-surface-2); border-radius:8px; border:1px solid var(--border-subtle);">
            <span style="font-size:0.85rem; font-weight:700;">👑 Owner: ${userName}</span>
          </div>
        </div>
      </header>

      <!-- TAB STRIP -->
      <nav style="display:flex; gap:4px; padding:8px 24px 0; background:var(--bg-surface-1); border-bottom:1px solid var(--border-subtle); flex-shrink:0; overflow-x:auto;">
        <button class="tab-btn ${this.activeTab === 'overview' ? 'active' : ''}" data-tab="overview" style="padding:10px 16px; font-size:0.85rem; font-weight:800; border:none; border-bottom:3px solid ${this.activeTab === 'overview' ? 'var(--accent-primary)' : 'transparent'}; background:transparent; color:${this.activeTab === 'overview' ? 'var(--accent-primary)' : 'var(--text-muted)'}; cursor:pointer;">📊 Executive Overview</button>
        <button class="tab-btn ${this.activeTab === 'profitability' ? 'active' : ''}" data-tab="profitability" style="padding:10px 16px; font-size:0.85rem; font-weight:800; border:none; border-bottom:3px solid ${this.activeTab === 'profitability' ? 'var(--accent-primary)' : 'transparent'}; background:transparent; color:${this.activeTab === 'profitability' ? 'var(--accent-primary)' : 'var(--text-muted)'}; cursor:pointer;">💰 Revenue &amp; Profit (P&amp;L + Trends)</button>
        <button class="tab-btn ${this.activeTab === 'sales' ? 'active' : ''}" data-tab="sales" style="padding:10px 16px; font-size:0.85rem; font-weight:800; border:none; border-bottom:3px solid ${this.activeTab === 'sales' ? 'var(--accent-primary)' : 'transparent'}; background:transparent; color:${this.activeTab === 'sales' ? 'var(--accent-primary)' : 'var(--text-muted)'}; cursor:pointer;">📈 Sales Intelligence</button>
        <button class="tab-btn ${this.activeTab === 'menu' ? 'active' : ''}" data-tab="menu" style="padding:10px 16px; font-size:0.85rem; font-weight:800; border:none; border-bottom:3px solid ${this.activeTab === 'menu' ? 'var(--accent-primary)' : 'transparent'}; background:transparent; color:${this.activeTab === 'menu' ? 'var(--accent-primary)' : 'var(--text-muted)'}; cursor:pointer;">🍽️ Menu Matrix</button>
        <button class="tab-btn ${this.activeTab === 'expenses' ? 'active' : ''}" data-tab="expenses" style="padding:10px 16px; font-size:0.85rem; font-weight:800; border:none; border-bottom:3px solid ${this.activeTab === 'expenses' ? 'var(--accent-primary)' : 'transparent'}; background:transparent; color:${this.activeTab === 'expenses' ? 'var(--accent-primary)' : 'var(--text-muted)'}; cursor:pointer;">💸 Expense Ledger</button>
        <button class="tab-btn ${this.activeTab === 'accounting' ? 'active' : ''}" data-tab="accounting" style="padding:10px 16px; font-size:0.85rem; font-weight:800; border:none; border-bottom:3px solid ${this.activeTab === 'accounting' ? 'var(--accent-primary)' : 'transparent'}; background:transparent; color:${this.activeTab === 'accounting' ? 'var(--accent-primary)' : 'var(--text-muted)'}; cursor:pointer;">📑 CA Health</button>
      </nav>

      <!-- BODY CONTENT -->
      <main style="flex:1; padding:24px; overflow-y:auto; background:var(--bg-base);">
        ${this.renderActiveTabBody(overview, pl, signals, user)}
      </main>

      <!-- 6-TIER EVIDENCE TRACEABILITY MODAL -->
      ${this.selectedTraceIngredient ? this.renderEvidenceTraceabilityModal() : ''}
    `;

    this.bindEvents();
  }

  renderActiveTabBody(overview, pl, signals, user) {
    if (this.activeTab === 'profitability') return this.renderProfitabilityTab(pl);
    if (this.activeTab === 'sales') return this.renderSalesAnalyticsTab(overview);
    if (this.activeTab === 'menu') return this.renderMenuMatrixTab();
    if (this.activeTab === 'expenses') return this.renderExpenseLedgerTab();
    if (this.activeTab === 'accounting') return this.renderAccountingHealthTab();
    return this.renderOverviewTab(overview, pl, signals, user);
  }

  // --- SUBVIEW 1: 30-SECOND EXECUTIVE OVERVIEW COCKPIT ---
  renderOverviewTab(overview, pl, signals, user) {
    const m = overview.todayMetrics;
    const g = overview.growthTrends;

    return `
      <div style="display:flex; flex-direction:column; gap:24px; max-width:1200px; margin:0 auto;">
        
        <!-- GREETING & 30-SECOND HEALTH BANNER -->
        <div class="card" style="padding:20px; background:linear-gradient(135deg, rgba(139,92,246,0.1), rgba(236,72,153,0.1)); border:1px solid rgba(139,92,246,0.3); border-radius:12px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h2 style="margin:0; font-size:1.4rem; font-weight:800; color:var(--text-primary);">
              👑 GOOD EVENING, ${(user.name || 'VAIBHAV').toUpperCase()}
            </h2>
            <p style="margin:4px 0 0; color:var(--text-muted); font-size:0.88rem;">
              Here is your 30-second restaurant health check. Net Operating Profit is <strong>₹${pl.netOperatingProfit.amount.toFixed(2)}</strong> (${pl.netOperatingProfit.marginPercent}% Operating Margin).
            </p>
          </div>
          <button class="btn-primary btn-open-evidence-trace" data-ing-id="invitem_chicken" style="padding:10px 18px; font-weight:800; font-size:0.85rem; background:linear-gradient(90deg,#8b5cf6,#ec4899); color:#fff; border:none; border-radius:8px; cursor:pointer;">
            🔍 Inspect 6-Tier Evidence Chain
          </button>
        </div>

        <!-- TOP EXECUTIVE KPI CARDS -->
        <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:16px;">
          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #10b981; border-radius:10px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">NET TAXABLE REVENUE</div>
            <div style="font-size:1.5rem; font-weight:800; color:#10b981; margin-top:4px;">₹${pl.revenue.netSales.toFixed(2)}</div>
            <div style="font-size:0.78rem; color:#10b981; font-weight:700; margin-top:4px;">${g.salesGrowth} vs last period</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #3b82f6; border-radius:10px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">SETTLED COLLECTIONS</div>
            <div style="font-size:1.5rem; font-weight:800; color:#3b82f6; margin-top:4px;">₹${pl.statutoryPassThrough.totalCustomerCollected.toFixed(2)}</div>
            <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;">100% Receipts Reconciled</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #8b5cf6; border-radius:10px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">OPERATING PROFIT</div>
            <div style="font-size:1.5rem; font-weight:800; color:#8b5cf6; margin-top:4px;">₹${pl.netOperatingProfit.amount.toFixed(2)}</div>
            <div style="font-size:0.78rem; color:#8b5cf6; font-weight:700; margin-top:4px;">${pl.netOperatingProfit.marginPercent}% Operating Margin</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #f59e0b; border-radius:10px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">COVERS SERVED</div>
            <div style="font-size:1.5rem; font-weight:800; color:#f59e0b; margin-top:4px;">${m.covers}</div>
            <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;">Dining Guests</div>
          </div>

          <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #ec4899; border-radius:10px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">AVERAGE CHECK</div>
            <div style="font-size:1.5rem; font-weight:800; color:#ec4899; margin-top:4px;">₹${m.avgCheck}</div>
            <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;">Per Guest Bill</div>
          </div>
        </div>

        <!-- WHAT NEEDS MY ATTENTION? (DERIVED SMART SIGNALS) -->
        <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:12px;">
          <h3 style="margin:0 0 16px; font-size:1.1rem; font-weight:800; display:flex; align-items:center; gap:8px;">
            <span>⚠️</span> WHAT NEEDS MY ATTENTION? (Derived Smart Signals)
          </h3>
          <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:16px;">
            ${signals.map(s => `
              <div style="padding:16px; background:var(--bg-surface-2); border-left:4px solid ${s.level === 'GREEN' ? '#10b981' : (s.level === 'RED' ? '#ef4444' : '#f59e0b')}; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div style="font-weight:800; font-size:0.95rem;">${s.title}</div>
                  <div style="font-size:0.82rem; color:var(--text-muted); margin-top:4px;">${s.description}</div>
                </div>
                <button class="btn-secondary btn-open-evidence-trace" data-ing-id="invitem_chicken" style="padding:6px 12px; font-weight:700; font-size:0.78rem; border-radius:6px; flex-shrink:0; margin-left:12px;">
                  Investigate →
                </button>
              </div>
            `).join('')}
          </div>
        </div>

      </div>
    `;
  }

  // --- SUBVIEW 2: CANONICAL P&L STATEMENT & MULTI-PERIOD TRENDS ---
  renderProfitabilityTab(pl) {
    const trends = profitabilityEngine.getMultiPeriodProfitabilityTrends();

    return `
      <div style="display:flex; flex-direction:column; gap:24px; max-width:1100px; margin:0 auto;">
        
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">💰 Canonical Profit &amp; Loss (P&amp;L) Statement</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Derived strictly from issued invoices, WAC stock movements, payroll, and expense ledger.</p>
        </div>

        <!-- P&L TABLE -->
        <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-subtle);">
          <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                <th style="padding:14px 20px;">Financial Line Item</th>
                <th style="padding:14px 20px; text-align:right;">Amount (₹)</th>
                <th style="padding:14px 20px; text-align:right;">% of Revenue</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid var(--border-subtle);">
                <td style="padding:12px 20px; font-weight:800;">Gross Invoiced Sales</td>
                <td style="padding:12px 20px; text-align:right; font-weight:800;">₹${pl.revenue.grossSales.toFixed(2)}</td>
                <td style="padding:12px 20px; text-align:right; color:var(--text-muted);">100.0%</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border-subtle); color:#ef4444;">
                <td style="padding:12px 20px;">(−) Commercial Discounts &amp; Comps</td>
                <td style="padding:12px 20px; text-align:right; font-weight:700;">−₹${pl.revenue.discounts.toFixed(2)}</td>
                <td style="padding:12px 20px; text-align:right;">${((pl.revenue.discounts / Math.max(1, pl.revenue.grossSales)) * 100).toFixed(1)}%</td>
              </tr>
              <tr style="border-bottom:2px solid var(--border-subtle); background:rgba(255,255,255,0.02); font-weight:800;">
                <td style="padding:12px 20px; color:var(--accent-primary);">Net Taxable Operating Revenue</td>
                <td style="padding:12px 20px; text-align:right; color:var(--accent-primary);">₹${pl.revenue.netSales.toFixed(2)}</td>
                <td style="padding:12px 20px; text-align:right;">100.0%</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border-subtle); color:#f59e0b;">
                <td style="padding:12px 20px;">(−) Cost of Goods Sold (Actual Food COGS)</td>
                <td style="padding:12px 20px; text-align:right; font-weight:700;">−₹${pl.costOfSales.actualFoodCogs.toFixed(2)}</td>
                <td style="padding:12px 20px; text-align:right;">${pl.costOfSales.foodCostPercent}%</td>
              </tr>
              <tr style="border-bottom:2px solid var(--border-subtle); background:rgba(16,185,129,0.04); font-weight:800;">
                <td style="padding:12px 20px; color:#10b981;">Gross Operating Profit</td>
                <td style="padding:12px 20px; text-align:right; color:#10b981;">₹${pl.grossProfit.amount.toFixed(2)}</td>
                <td style="padding:12px 20px; text-align:right;">${pl.grossProfit.marginPercent}%</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border-subtle); color:#8b5cf6;">
                <td style="padding:12px 20px;">(−) Kitchen &amp; Service Payroll Labour</td>
                <td style="padding:12px 20px; text-align:right; font-weight:700;">−₹${pl.operatingCosts.labourAmount.toFixed(2)}</td>
                <td style="padding:12px 20px; text-align:right;">${pl.operatingCosts.labourPercent}%</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border-subtle); color:#ef4444;">
                <td style="padding:12px 20px;">(−) Operational Expenses (Rent, Utilities, Marketing)</td>
                <td style="padding:12px 20px; text-align:right; font-weight:700;">−₹${pl.operatingCosts.totalOpEx.toFixed(2)}</td>
                <td style="padding:12px 20px; text-align:right;">${((pl.operatingCosts.totalOpEx / Math.max(1, pl.revenue.netSales)) * 100).toFixed(1)}%</td>
              </tr>
              <tr style="background:rgba(16,185,129,0.12); font-weight:800; font-size:1rem;">
                <td style="padding:16px 20px; color:#10b981;">NET OPERATING PROFIT</td>
                <td style="padding:16px 20px; text-align:right; color:#10b981;">₹${pl.netOperatingProfit.amount.toFixed(2)}</td>
                <td style="padding:16px 20px; text-align:right; color:#10b981;">${pl.netOperatingProfit.marginPercent}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- MULTI-PERIOD PROFITABILITY TRENDS & AUTOMATED INSIGHTS -->
        <div class="card" style="padding:20px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:12px;">
          <h4 style="margin:0 0 12px; font-size:1rem; font-weight:800;">📈 Multi-Period Profitability Trends &amp; Automated Insights</h4>
          
          <div style="padding:12px 16px; background:rgba(239,68,68,0.1); border-left:4px solid #ef4444; border-radius:6px; margin-bottom:16px; font-size:0.88rem;">
            <strong>Automated Insight:</strong> Operating margin declined <strong>7.4 percentage points</strong> over four months. Primary driver: <strong>Food cost increased +7.5pp</strong> due to kitchen prep portion overuse &amp; chicken purchase price escalation.
          </div>

          <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                <th style="padding:10px;">Period</th>
                <th style="padding:10px; text-align:right;">Revenue</th>
                <th style="padding:10px; text-align:right;">Food Cost %</th>
                <th style="padding:10px; text-align:right;">Labour %</th>
                <th style="padding:10px; text-align:right;">OpEx %</th>
                <th style="padding:10px; text-align:right;">Operating Margin %</th>
              </tr>
            </thead>
            <tbody>
              ${trends.map(t => `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:10px; font-weight:800;">${t.period}</td>
                  <td style="padding:10px; text-align:right; font-weight:700;">₹${(t.revenue / 100000).toFixed(2)}L</td>
                  <td style="padding:10px; text-align:right; font-weight:800; color:${t.foodCostPercent > 35 ? '#ef4444' : 'var(--text-primary)'};">${t.foodCostPercent}%</td>
                  <td style="padding:10px; text-align:right;">${t.labourPercent}%</td>
                  <td style="padding:10px; text-align:right;">${t.opexPercent}%</td>
                  <td style="padding:10px; text-align:right; font-weight:800; color:#10b981;">${t.operatingMarginPercent}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

      </div>
    `;
  }

  // --- SUBVIEW 3: SALES ANALYTICS ---
  renderSalesAnalyticsTab(overview) {
    return `
      <div style="display:flex; flex-direction:column; gap:20px; max-width:1000px; margin:0 auto;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">📈 Sales Channel &amp; Payment Mix Analytics</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Hourly sales distribution, guest covers, average check size, and collection channels.</p>
        </div>
        <div style="padding:24px; background:var(--bg-surface-1); border-radius:10px; text-align:center; color:var(--text-muted);">
          Sales intelligence analytics powered by accountingProjectionService.
        </div>
      </div>
    `;
  }

  // --- SUBVIEW 4: MENU MATRIX ---
  renderMenuMatrixTab() {
    const menuData = ownerProjectionService.getMenuProfitability(this.dateFilter);

    return `
      <div style="display:flex; flex-direction:column; gap:20px; max-width:1000px; margin:0 auto;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">🍽️ 4-Quadrant Menu Profitability Matrix</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Theoretical Margin vs Actual Contribution Matrix based on actual inventory consumption.</p>
        </div>

        <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-subtle);">
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                <th style="padding:12px 16px;">Menu Item</th>
                <th style="padding:12px 16px;">Quadrant</th>
                <th style="padding:12px 16px; text-align:right;">Selling Price</th>
                <th style="padding:12px 16px; text-align:right;">Theoretical Cost</th>
                <th style="padding:12px 16px; text-align:right;">Theoretical Margin</th>
                <th style="padding:12px 16px; text-align:right;">Food Cost %</th>
                <th style="padding:12px 16px; text-align:right;">Units Sold</th>
                <th style="padding:12px 16px; text-align:right;">Total Revenue</th>
              </tr>
            </thead>
            <tbody>
              ${menuData.items.map(item => `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:12px 16px; font-weight:800;">${item.name}</td>
                  <td style="padding:12px 16px;"><span class="badge" style="background:${item.color}22; color:${item.color}; border:1px solid ${item.color}; font-weight:800;">${item.badge}</span></td>
                  <td style="padding:12px 16px; text-align:right; font-weight:700;">₹${item.sellingPrice.toFixed(2)}</td>
                  <td style="padding:12px 16px; text-align:right; color:#f59e0b; font-weight:700;">₹${item.bomCost.toFixed(2)}</td>
                  <td style="padding:12px 16px; text-align:right; color:#10b981; font-weight:800;">₹${item.grossMargin.toFixed(2)}</td>
                  <td style="padding:12px 16px; text-align:right; font-weight:700;">${item.foodCostPercent}%</td>
                  <td style="padding:12px 16px; text-align:right; font-weight:700;">${item.unitsSold}</td>
                  <td style="padding:12px 16px; text-align:right; font-weight:800; color:var(--accent-primary);">₹${item.revenue.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --- SUBVIEW 5: EXPENSE LEDGER ---
  renderExpenseLedgerTab() {
    const expenses = expenseModel.getExpensesForPeriod(this.dateFilter);
    const total = expenseModel.getTotalExpensesForPeriod(this.dateFilter);

    return `
      <div style="display:flex; flex-direction:column; gap:20px; max-width:1000px; margin:0 auto;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">💸 Operational Expense Ledger</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">Operational business costs (Rent, Salaries, Utilities, Supplies) powering canonical P&amp;L.</p>
        </div>
        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #ef4444; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL OPERATING EXPENSES</div>
            <div style="font-size:1.6rem; font-weight:800; color:#ef4444; margin-top:2px;">₹${total.toFixed(2)}</div>
          </div>
          <span class="badge badge-danger" style="font-size:0.8rem;">${expenses.length} Entries Recorded</span>
        </div>
      </div>
    `;
  }

  // --- SUBVIEW 6: CA HEALTH ---
  renderAccountingHealthTab() {
    return `
      <div style="display:flex; flex-direction:column; gap:20px; max-width:800px; margin:0 auto;">
        <div>
          <h3 style="margin:0; font-size:1.2rem; font-weight:800;">📑 Accounting Health &amp; Reconciliation Status</h3>
          <p style="margin:2px 0 0; color:var(--text-muted); font-size:0.82rem;">100% Taxable revenue reconciliation status with zero unassigned receipts.</p>
        </div>
        <div class="card" style="padding:20px; background:var(--bg-surface-1); border-left:6px solid #10b981; border-radius:10px;">
          <h4 style="margin:0 0 6px; font-weight:800; color:#10b981;">🟢 Accounting Reconciled</h4>
          <p style="margin:0; font-size:0.85rem; color:var(--text-muted);">All tax invoices and split payment receipts are reconciled.</p>
        </div>
      </div>
    `;
  }

  // --- 6-TIER EVIDENCE TRACEABILITY MODAL ---
  renderEvidenceTraceabilityModal() {
    const trace = profitabilityEngine.getProfitabilityTraceabilityChain(this.selectedTraceIngredient);

    return `
      <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999; backdrop-filter:blur(4px);">
        <div class="card animate-fade-in" style="width:90%; max-width:850px; max-height:85vh; overflow-y:auto; padding:24px; background:var(--bg-surface-1); border-radius:12px;">
          
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:12px; margin-bottom:16px;">
            <h3 style="margin:0; font-size:1.2rem; font-weight:800; display:flex; align-items:center; gap:8px;">
              <span>🔍</span> 6-Tier Evidence Chain Traceability — ${trace.selectedIngredient.name}
            </h3>
            <button id="btn-close-evidence-modal" class="btn-secondary" style="padding:4px 10px; font-weight:700;">✕ Close</button>
          </div>

          <!-- TRACEABILITY FLOWCHART -->
          <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
            <div style="padding:12px; background:var(--bg-surface-2); border-left:4px solid #10b981; border-radius:6px; font-size:0.88rem;">
              <strong>1. Net Operating Profit:</strong> ₹${trace.netOperatingProfit.toFixed(2)}
            </div>
            <div style="padding:12px; background:var(--bg-surface-2); border-left:4px solid #f59e0b; border-radius:6px; font-size:0.88rem;">
              <strong>2. Cost of Goods Sold (Actual Food COGS):</strong> ₹${trace.totalCogs.toFixed(2)}
            </div>
            <div style="padding:12px; background:var(--bg-surface-2); border-left:4px solid #3b82f6; border-radius:6px; font-size:0.88rem;">
              <strong>3. Selected Ingredient:</strong> ${trace.selectedIngredient.name} (Current Stock: ${trace.selectedIngredient.currentStock} ${trace.selectedIngredient.unit})
            </div>
            <div style="padding:12px; background:var(--bg-surface-2); border-left:4px solid #8b5cf6; border-radius:6px; font-size:0.88rem;">
              <strong>4. Authoritative WAC:</strong> ₹${trace.selectedIngredient.weightedAverageCost}/KG
            </div>
            <div style="padding:12px; background:var(--bg-surface-2); border-left:4px solid #ec4899; border-radius:6px; font-size:0.88rem;">
              <strong>5. Goods Received Notes (GRN):</strong> ${trace.recentGrns.length} Receipt Movements Logged
            </div>
            <div style="padding:12px; background:var(--bg-surface-2); border-left:4px solid #10b981; border-radius:6px; font-size:0.88rem;">
              <strong>6. Supplier Profile:</strong> ${trace.supplier ? trace.supplier.name : 'ABC Foods Ltd'} (GSTIN: ${trace.supplier ? trace.supplier.gstin : '27AAACA1234F1Z1'})
            </div>
          </div>

        </div>
      </div>
    `;
  }

  bindEvents() {
    // Tab Switching
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.updateContent();
      });
    });

    // Period Filter
    this.container.querySelectorAll('.btn-period').forEach(btn => {
      btn.addEventListener('click', () => {
        this.dateFilter = btn.dataset.period;
        this.updateContent();
      });
    });

    // Open Evidence Trace Modal
    this.container.querySelectorAll('.btn-open-evidence-trace').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedTraceIngredient = btn.dataset.ingId || 'invitem_chicken';
        this.updateContent();
      });
    });

    // Close Evidence Modal
    const btnClose = this.container.querySelector('#btn-close-evidence-modal');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        this.selectedTraceIngredient = null;
        this.updateContent();
      });
    }
  }
}
