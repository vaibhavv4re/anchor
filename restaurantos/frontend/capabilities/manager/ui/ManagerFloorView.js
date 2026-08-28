/**
 * RestaurantOS - Manager Floor & Tables View (Phase M2 Cockpit)
 * Live floor observation map projecting real-time table state, kitchen production counters,
 * running bill totals, and assigned server workloads.
 * Clicking a table card opens ManagerTableInspectorModal.
 */

import { tableProjectionService } from '../../../../../businessos/platform/table_state/tableProjectionService.js';
import { tableStateMachine, PhysicalTableStates } from '../../../../../businessos/platform/table_state/tableStateMachine.js';
import { diningAreaModel } from '../../../../../businessos/platform/layout/diningAreaModel.js';
import { orderModel } from '../../../../../businessos/platform/ordering/orderModel.js';
import { billRevisionModel } from '../../../../../businessos/platform/billing/billRevisionModel.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { DiningAreaTabs } from '../../restaurant_layout/ui/DiningAreaTabs.js';
import { ManagerTableInspectorModal } from './ManagerTableInspectorModal.js';

export const ManagerStateThemeColors = Object.freeze({
  AVAILABLE: '#10b981',        // 🟢 Emerald Green
  RESERVED: '#3b82f6',         // 🔵 Blue
  OCCUPIED: '#8b5cf6',         // 🟣 Purple
  ORDER_IN_PROGRESS: '#f59e0b',// 🟡 Amber/Yellow
  PAYMENT_PENDING: '#d97706',  // 🟠 Orange/Amber
  PAID_CLEARING: '#8b5cf6',    // 🟣 Purple
  CLEANING: '#6b7280',         // ⚪ Slate Gray
  OUT_OF_SERVICE: '#ef4444'    // 🔴 Red
});

export class ManagerFloorView {
  constructor(deps = {}) {
    const areas = diningAreaModel.getAllAreas();
    this.activeAreaId = areas.length > 0 ? areas[0].id : null;
    this.container = null;
    this.tenantId = deps.tenantId || null;
    this.unsubscribeEvents = [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'manager-floor-view flex-col gap-lg animate-fade-in';
    this.container.style.width = '100%';

    const areas = diningAreaModel.getAllAreas();
    if (!this.activeAreaId && areas.length > 0) {
      this.activeAreaId = areas[0].id;
    }

    this.subscribePlatformEvents();
    this.updateContent();

    return this.container;
  }

  subscribePlatformEvents() {
    const refresh = () => {
      if (this.container && document.body.contains(this.container)) {
        this.updateGridContent();
      }
    };
    this.unsubscribeEvents = [
      platformEventBus.subscribe('table:projection:updated', refresh),
      platformEventBus.subscribe('table:state:changed', refresh),
      platformEventBus.subscribe('session:created', refresh),
      platformEventBus.subscribe('session:milestone:changed', refresh),
      platformEventBus.subscribe('order:confirmed', refresh),
      platformEventBus.subscribe('ticket:status_changed', refresh),
      platformEventBus.subscribe('bill:finalized', refresh),
      platformEventBus.subscribe('bill:settled', refresh),
      platformEventBus.subscribe('bill:reopened', refresh)
    ];
  }

  updateContent() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:var(--space-md); margin-bottom:12px;">
        <div>
          <h2 style="font-size:1.5rem; margin:0;">🪑 Floor & Tables (Manager Control)</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Live operational floor map • Real-time session inspection & production status</p>
        </div>
        <div style="display:flex; gap:var(--space-sm); align-items:center; flex-wrap:wrap;">
          <span class="badge" style="background:#10b98122; color:#10b981; border:1px solid #10b981;">🟢 AVAILABLE</span>
          <span class="badge" style="background:#3b82f622; color:#3b82f6; border:1px solid #3b82f6;">🔵 OCCUPIED</span>
          <span class="badge" style="background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b;">🟡 ORDER IN PROGRESS</span>
          <span class="badge" style="background:#d9770622; color:#d97706; border:1px solid #d97706;">🟠 PAYMENT PENDING</span>
          <span class="badge" style="background:#8b5cf622; color:#8b5cf6; border:1px solid #8b5cf6;">🟣 PAID / CLEARING</span>
          <span class="badge" style="background:#6b728022; color:#9ca3af; border:1px solid #6b7280;">⚪ CLEANING</span>
        </div>
      </div>

      <div id="area-tabs-mount" style="margin-bottom:16px;"></div>

      <!-- Visual Floor Grid Mount (Full Width Responsive Grid) -->
      <div id="manager-table-grid-mount" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px; width:100%;"></div>

      <div id="manager-inspector-mount"></div>
    `;

    // Mount Area Tabs
    const tabsMount = this.container.querySelector('#area-tabs-mount');
    const tabsComponent = new DiningAreaTabs({
      activeAreaId: this.activeAreaId,
      onSelectArea: (areaId) => {
        this.activeAreaId = areaId;
        this.updateGridContent();
      }
    });
    tabsMount.appendChild(tabsComponent.render());

    this.updateGridContent();
  }

  updateGridContent() {
    const gridMount = this.container.querySelector('#manager-table-grid-mount');
    if (!gridMount) return;

    const projections = tableProjectionService.getProjectionsByArea(this.activeAreaId, this.tenantId);

    if (!projections.length) {
      gridMount.innerHTML = `<div style="grid-column:1/-1; color:var(--text-muted); padding:var(--space-xl); text-align:center; background:var(--bg-surface-1); border-radius:8px;">No floor tables configured in this dining area.</div>`;
      return;
    }

    const formatCurrency = (val) => '₹' + Number(val || 0).toLocaleString('en-IN');

    gridMount.innerHTML = projections.map(p => {
      const color = ManagerStateThemeColors[p.physicalState] || '#10b981';
      const label = p.physicalState ? p.physicalState.replace(/_/g, ' ') : 'AVAILABLE';
      const sId = p.currentSessionId;

      // Get orders for running bill & production stats
      const orders = sId ? orderModel.getOrdersForSession(sId, this.tenantId) : [];
      const latestRevision = sId ? billRevisionModel.getLatestRevisionForSession(sId, this.tenantId) : null;
      const runningBill = latestRevision ? latestRevision.grandTotal : orders.reduce((sum, o) => sum + (parseFloat(o.subtotal || o.totalAmount) || 0), 0);

      // Kitchen items breakdown
      let prepItems = 0;
      let readyItems = 0;
      let servedItems = 0;
      orders.forEach(o => {
        if (Array.isArray(o.items)) {
          o.items.forEach(it => {
            if (it.itemStatus === 'READY' || it.status === 'READY') readyItems++;
            else if (it.itemStatus === 'PREPARING' || it.status === 'PREPARING') prepItems++;
            else if (it.itemStatus === 'SERVED' || it.status === 'SERVED') servedItems++;
          });
        }
      });

      return `
        <div class="card manager-table-card animate-fade-in" data-table="${p.tableNumber}" data-session-id="${sId || ''}" style="cursor:pointer; border-top:4px solid ${color}; transition:transform var(--transition-fast); padding:16px; background:var(--bg-surface-1); display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
          
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <h3 style="margin:0; font-size:1.15rem; font-weight:700; color:var(--text-primary);">Table ${p.tableLabel}</h3>
              <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                👥 ${p.guestCount || p.capacity} guests · ${p.assignedWaiterName || 'Staff'}
              </div>
            </div>
            <span class="badge" style="background:${color}22; color:${color}; border:1px solid ${color}; font-size:0.7rem; font-weight:700;">
              ${label}
            </span>
          </div>

          <!-- Running Bill & Kitchen Production Strip -->
          <div style="background:var(--bg-surface-2); padding:10px 12px; border-radius:6px; font-size:0.8rem; display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--text-muted);">Running Bill:</span>
              <strong style="color:#10b981; font-size:0.9rem;">${formatCurrency(runningBill)}</strong>
            </div>
            ${sId ? `
              <div style="display:flex; justify-content:space-between; align-items:center; color:var(--text-secondary); font-size:0.75rem;">
                <span>🍳 Kitchen:</span>
                <span>🔥 ${prepItems} prep · 🟢 ${readyItems} ready</span>
              </div>
            ` : ''}
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
            <span style="font-size:0.75rem; color:var(--text-muted);">⏱️ ${p.elapsedTime || '0 min'}</span>
            <button class="btn-secondary btn-inspect-table" data-table="${p.tableNumber}" data-session-id="${sId || ''}" style="padding:6px 12px; font-size:0.8rem; color:var(--accent-primary); border-color:var(--accent-primary);">
              🔍 Inspect Session →
            </button>
          </div>

        </div>
      `;
    }).join('');

    // Bind click events on cards & inspect buttons
    this.container.querySelectorAll('.manager-table-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const tableNumber = card.dataset.table;
        const sessionId = card.dataset.sessionId;
        this.openInspectorModal(tableNumber, sessionId);
      });
    });
  }

  openInspectorModal(tableNumber, sessionId) {
    const mount = this.container.querySelector('#manager-inspector-mount');
    if (!mount) return;

    const modal = new ManagerTableInspectorModal({
      tableNumber,
      sessionId,
      tenantId: this.tenantId,
      onClose: () => {
        this.updateGridContent();
      }
    });

    mount.appendChild(modal.render());
  }
}
