/**
 * RestaurantOS - Phase M4: Manager Service Operations View
 * Service Pipeline monitoring (Order -> Kitchen -> Pickup -> Served)
 * Derived timing metrics (Kitchen Prep vs Server Pickup Lag vs Order-to-Table SLA)
 * Bottleneck Diagnostic Engine & Table Flow Table.
 * Tapping any row opens ManagerTableInspectorModal.
 */

import { managerProjectionService } from '../../../../../businessos/platform/manager/managerProjectionService.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { ManagerTableInspectorModal } from './ManagerTableInspectorModal.js';

export class ServiceOpsView {
  constructor(deps = {}) {
    this.tenantId = deps.tenantId || null;
    this.container = null;
    this.unsubscribeEvents = [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'service-ops-view flex-col gap-lg animate-fade-in';
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
      platformEventBus.subscribe('ticket:status_changed', refresh),
      platformEventBus.subscribe('order:confirmed', refresh),
      platformEventBus.subscribe('session:milestone:changed', refresh),
      platformEventBus.subscribe('table:state:changed', refresh)
    ];
  }

  updateContent() {
    if (!this.container) return;

    const data = managerProjectionService.getServiceOperationsProjection(this.tenantId);

    const bDiagnostic = data.bottleneckDiagnostic;
    const bColor = bDiagnostic.type === 'KITCHEN_BOTTLENECK' ? '#ef4444' : (bDiagnostic.type === 'PICKUP_BOTTLENECK' ? '#f59e0b' : '#10b981');

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h2 style="font-size:1.5rem; margin:0;">🍽️ Service Operations (Phase M4)</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Service Pipeline • Timing SLA Breakdown • Kitchen vs Server Pickup Bottleneck Diagnostic</p>
        </div>
        <span class="badge" style="background:#10b98122; color:#10b981; border:1px solid #10b981; font-size:0.85rem; padding:6px 14px;">
          ⚡ Live Service Flow Active
        </span>
      </div>

      <!-- 1. Top Strip — Live Service Pipeline Summary -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:14px; margin-bottom:16px;">
        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid var(--accent-primary);">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">ACTIVE ORDERS</div>
          <div style="font-size:1.6rem; font-weight:700; color:var(--accent-primary); margin-top:4px;">${data.activeOrdersCount}</div>
          <div style="font-size:0.725rem; color:var(--text-muted); margin-top:2px;">Total in-service orders</div>
        </div>

        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #f59e0b;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">PREPARING AT STATIONS</div>
          <div style="font-size:1.6rem; font-weight:700; color:#f59e0b; margin-top:4px;">${data.preparingCount}</div>
          <div style="font-size:0.725rem; color:var(--text-muted); margin-top:2px;">Dishes on hot line</div>
        </div>

        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #10b981;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">READY AT PASS</div>
          <div style="font-size:1.6rem; font-weight:700; color:#10b981; margin-top:4px;">${data.readyCount}</div>
          <div style="font-size:0.725rem; color:var(--text-muted); margin-top:2px;">Cooked dishes at pass</div>
        </div>

        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #ef4444;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">PICKUP LAG (>3 MIN)</div>
          <div style="font-size:1.6rem; font-weight:700; color:#ef4444; margin-top:4px;">${data.pickupLagCount}</div>
          <div style="font-size:0.725rem; color:var(--text-muted); margin-top:2px;">Dishes waiting server pickup</div>
        </div>

        <div class="card" style="padding:16px; background:var(--bg-surface-1); border-top:3px solid #8b5cf6;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">PARTIALLY SERVED</div>
          <div style="font-size:1.6rem; font-weight:700; color:#8b5cf6; margin-top:4px;">${data.partiallyServedTablesCount}</div>
          <div style="font-size:0.725rem; color:var(--text-muted); margin-top:2px;">Tables with split dish delivery</div>
        </div>
      </div>

      <!-- 2. Service Timing & Bottleneck Diagnostic Tower -->
      <div class="card" style="padding:20px; background:var(--bg-surface-1); border-left:6px solid ${bColor}; margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
          <div>
            <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">⏱️ SERVICE TIMING & BOTTLENECK DIAGNOSTIC</div>
            <h3 style="margin:4px 0 2px 0; font-size:1.3rem; color:${bColor};">${bDiagnostic.label}</h3>
            <div style="font-size:0.85rem; color:var(--text-secondary);">${bDiagnostic.subtitle}</div>
          </div>
          
          <div style="display:flex; gap:20px; flex-wrap:wrap; font-size:0.85rem;">
            <div style="background:var(--bg-surface-2); padding:10px 14px; border-radius:6px; text-align:center;">
              <span style="font-size:0.725rem; color:var(--text-muted); display:block; font-weight:600;">AVG KITCHEN PREP</span>
              <strong style="font-size:1.2rem; color:#f59e0b;">${data.avgKitchenPrep} min</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:10px 14px; border-radius:6px; text-align:center;">
              <span style="font-size:0.725rem; color:var(--text-muted); display:block; font-weight:600;">AVG PASS PICKUP LAG</span>
              <strong style="font-size:1.2rem; color:#ef4444;">${data.avgPickupLag} min</strong>
            </div>
            <div style="background:var(--bg-surface-2); padding:10px 14px; border-radius:6px; text-align:center;">
              <span style="font-size:0.725rem; color:var(--text-muted); display:block; font-weight:600;">AVG ORDER-TO-TABLE SLA</span>
              <strong style="font-size:1.2rem; color:#10b981;">${data.avgOrderToTable} min</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Main Section — Table Service Flow Table -->
      <div class="card" style="padding:20px; background:var(--bg-surface-1);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h3 style="margin:0; font-size:1.1rem;">📋 Table-Centric Service Flow (${data.pipelineRows.length} Active Table Flows)</h3>
          <span style="font-size:0.75rem; color:var(--text-muted);">Click any row to inspect table session details</span>
        </div>

        ${data.pipelineRows.length === 0 ? `
          <div style="padding:32px; text-align:center; color:var(--text-muted); font-style:italic;">No active table service flows currently in progress.</div>
        ` : `
          <div class="table-responsive">
            <table class="table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-subtle); text-align:left; color:var(--text-muted); font-size:0.75rem;">
                  <th style="padding:10px;">TABLE</th>
                  <th style="padding:10px;">WAITER</th>
                  <th style="padding:10px;">LATEST ORDER</th>
                  <th style="padding:10px;">KITCHEN PREP</th>
                  <th style="padding:10px;">READY AT PASS</th>
                  <th style="padding:10px;">SERVED</th>
                  <th style="padding:10px;">SERVICE TIMING BREAKDOWN</th>
                  <th style="padding:10px; text-align:right;">ACTION</th>
                </tr>
              </thead>
              <tbody>
                ${data.pipelineRows.map(row => `
                  <tr class="service-flow-row" data-table="${row.tableNumber}" data-session-id="${row.sessionId}" style="border-bottom:1px solid var(--border-subtle); cursor:pointer; transition:background 0.2s;">
                    <td style="padding:12px 10px; font-weight:700; color:var(--text-primary);">${row.tableLabel}</td>
                    <td style="padding:12px 10px; color:var(--text-secondary);">${row.waiterName}</td>
                    <td style="padding:12px 10px;">
                      <code style="font-size:0.78rem;">${row.latestOrderNo}</code>
                      <span style="color:var(--text-muted); font-size:0.75rem; margin-left:4px;">(${row.totalItems} items)</span>
                    </td>
                    <td style="padding:12px 10px;">
                      ${row.prepCount > 0 ? `<span class="badge" style="background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b;">🔥 ${row.prepCount} prep</span>` : `<span style="color:var(--text-muted);">—</span>`}
                    </td>
                    <td style="padding:12px 10px;">
                      ${row.readyCount > 0 ? `<span class="badge" style="background:#10b98122; color:#10b981; border:1px solid #10b981;">🟢 ${row.readyCount} ready</span>` : `<span style="color:var(--text-muted);">—</span>`}
                    </td>
                    <td style="padding:12px 10px;">
                      ${row.servedCount > 0 ? `<span class="badge" style="background:#6b728022; color:#9ca3af; border:1px solid #6b7280;">⚪ ${row.servedCount} served</span>` : `<span style="color:var(--text-muted);">—</span>`}
                    </td>
                    <td style="padding:12px 10px; font-size:0.8rem; color:var(--text-secondary);">
                      Kitchen: <strong>~${row.estPrepMin} min</strong> · Pickup: <strong>~${row.estPickupMin} min</strong> · Total: <strong>~${row.estServiceMin} min</strong>
                    </td>
                    <td style="padding:12px 10px; text-align:right;">
                      <button class="btn-secondary btn-inspect-service-table" data-table="${row.tableNumber}" data-session-id="${row.sessionId}" style="padding:4px 10px; font-size:0.78rem; color:var(--accent-primary); border-color:var(--accent-primary);">
                        🔍 Inspect Table →
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <div id="service-ops-modal-mount"></div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    const openInspector = (tableNumber, sessionId) => {
      const modal = new ManagerTableInspectorModal({
        tableNumber,
        sessionId,
        tenantId: this.tenantId,
        onClose: () => this.updateContent()
      });
      const mount = this.container.querySelector('#service-ops-modal-mount');
      if (mount) mount.appendChild(modal.render());
    };

    this.container.querySelectorAll('.service-flow-row').forEach(row => {
      row.addEventListener('click', (e) => {
        const tableNumber = row.dataset.table;
        const sessionId = row.dataset.sessionId;
        openInspector(tableNumber, sessionId);
      });
    });

    this.container.querySelectorAll('.btn-inspect-service-table').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tableNumber = btn.dataset.table;
        const sessionId = btn.dataset.sessionId;
        openInspector(tableNumber, sessionId);
      });
    });
  }
}
