/**
 * Capability Group 2 & 3 Integrated Floor View (First Complete Vertical Slice)
 * Renders visual table cards with 6-state badges, CreateSessionModal, and ActiveSessionView.
 * Connected directly to DataGateway / Supabase Cloud DB (`dining_areas` & `tables_master`).
 */

import { tableProjectionService } from '../../../../../businessos/platform/table_state/tableProjectionService.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { diningAreaModel } from '../../../../../businessos/platform/layout/diningAreaModel.js';

import { DiningAreaTabs } from './DiningAreaTabs.js';
import { TimelineWidget } from './TimelineWidget.js';
import { TableInspectorModal } from './TableInspectorModal.js';
import { ActiveSessionView } from '../../guest_service/ui/ActiveSessionView.js';

export class FloorViewerView {
  constructor() {
    const areas = diningAreaModel.getAllAreas();
    this.activeAreaId = areas.length > 0 ? areas[0].id : null;
    this.container = null;
    this.activeSessionId = null;
    this.unsubscribeProjection = null;
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'floor-viewer-container flex-col gap-lg animate-fade-in';
    this.container.style.width = '100%';

    const areas = diningAreaModel.getAllAreas();
    if (!this.activeAreaId && areas.length > 0) {
      this.activeAreaId = areas[0].id;
    }

    this.subscribeProjections();
    this.updateContent();

    return this.container;
  }

  subscribeProjections() {
    this.unsubscribeProjection = platformEventBus.subscribe('table:projection:updated', () => {
      this.updateGridContent();
    });
  }

  updateContent() {
    if (this.activeSessionId) {
      this.container.innerHTML = `<div id="active-session-mount"></div>`;
      const sessionMount = this.container.querySelector('#active-session-mount');
      const activeView = new ActiveSessionView({
        sessionId: this.activeSessionId,
        onClose: () => {
          this.activeSessionId = null;
          this.updateContent();
        }
      });
      sessionMount.appendChild(activeView.render());
      return;
    }

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:var(--space-md); margin-bottom:12px;">
        <div>
          <h2 style="font-size:1.5rem; margin:0;">Restaurant Layout & Live Floor</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Single unified table state projection across all workspaces (PD-006 & PD-009)</p>
        </div>
        <div style="display:flex; gap:var(--space-sm); align-items:center; flex-wrap:wrap;">
          <span class="badge" style="background:#10b98122; color:#10b981; border:1px solid #10b981;">🟢 Available</span>
          <span class="badge" style="background:#3b82f622; color:#3b82f6; border:1px solid #3b82f6;">🔵 Reserved</span>
          <span class="badge" style="background:#8b5cf622; color:#8b5cf6; border:1px solid #8b5cf6;">🟣 Occupied</span>
          <span class="badge" style="background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b;">🟡 Payment</span>
          <span class="badge" style="background:#6b728022; color:#6b7280; border:1px solid #6b7280;">⚪ Cleaning</span>
        </div>
      </div>

      <div id="area-tabs-mount"></div>

      <div class="grid-2col-responsive">
        <!-- Visual Floor Grid Mount -->
        <div id="table-grid-mount" class="grid grid-cols-3 gap-md"></div>

        <!-- Sidebar Timeline Widget -->
        <div id="timeline-widget-mount"></div>
      </div>

      <div id="inspector-modal-mount"></div>
    `;

    // Mount Dining Area Tabs
    const tabsMount = this.container.querySelector('#area-tabs-mount');
    const tabsComponent = new DiningAreaTabs({
      activeAreaId: this.activeAreaId,
      onSelectArea: (areaId) => {
        this.activeAreaId = areaId;
        this.updateGridContent();
      }
    });
    tabsMount.appendChild(tabsComponent.render());

    // Mount Sidebar Timeline
    const timelineMount = this.container.querySelector('#timeline-widget-mount');
    const timelineWidget = new TimelineWidget();
    timelineMount.appendChild(timelineWidget.render());

    this.updateGridContent();
  }

  updateGridContent() {
    const gridMount = this.container.querySelector('#table-grid-mount');
    if (!gridMount) return;

    const projections = tableProjectionService.getProjectionsByArea(this.activeAreaId);

    if (!projections.length) {
      gridMount.innerHTML = `<div style="grid-column:1/-1; color:var(--text-muted); padding:var(--space-xl); text-align:center; background:var(--bg-surface-1); border-radius:8px;">No floor tables configured in this dining area yet.</div>`;
      return;
    }

    gridMount.innerHTML = projections.map(p => `
      <div class="card table-card animate-fade-in" data-table="${p.tableNumber}" style="cursor:pointer; border-top:4px solid ${p.stateColor}; transition:transform var(--transition-fast); padding:var(--space-md); background:var(--bg-surface-1);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-xs);">
          <div style="font-size:1.15rem; font-weight:700;">Table ${p.tableLabel || p.tableNumber}</div>
          <span class="badge" style="background:${p.stateColor}22; color:${p.stateColor}; border:1px solid ${p.stateColor}; font-size:0.7rem; font-weight:700;">
            ${p.physicalState}
          </span>
        </div>

        <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:var(--space-sm);">
          👥 ${p.capacity} / ${p.maxCapacity} Seats
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem;">
          <div style="color:var(--text-secondary);">
            👤 ${p.assignedWaiterName || 'Unassigned'}
          </div>
          <div style="color:var(--text-muted); font-family:monospace;">
            ${p.elapsedTime}
          </div>
        </div>
      </div>
    `).join('');

    // Attach click listeners to open Table Inspector Modal
    gridMount.querySelectorAll('.table-card').forEach(card => {
      card.addEventListener('click', () => {
        const tableNum = card.dataset.table;
        const projection = tableProjectionService.getTableProjection(tableNum);
        if (!projection) return;

        const modalMount = this.container.querySelector('#inspector-modal-mount');
        if (!modalMount) return;
        modalMount.innerHTML = '';

        const inspector = new TableInspectorModal({
          projection,
          onClose: () => {
            modalMount.innerHTML = '';
          },
          onActionComplete: () => {
            modalMount.innerHTML = '';
            this.updateGridContent();
          },
          onOpenActiveSession: (sessionId) => {
            modalMount.innerHTML = '';
            this.activeSessionId = sessionId;
            this.updateContent();
          }
        });

        modalMount.appendChild(inspector.render());
      });
    });
  }
}
