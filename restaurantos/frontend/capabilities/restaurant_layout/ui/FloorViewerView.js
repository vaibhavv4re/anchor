/**
 * Capability Group 2 & 3 Integrated Floor View (First Complete Vertical Slice)
 * Renders visual table cards with 6-state badges, CreateSessionModal, and ActiveSessionView.
 */

import { tableProjectionService } from '../../../../../businessos/platform/table_state/tableProjectionService.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

import { DiningAreaTabs } from './DiningAreaTabs.js';
import { TableInspectorModal } from './TableInspectorModal.js';
import { TimelineWidget } from './TimelineWidget.js';
import { ActiveSessionView } from '../../guest_service/ui/ActiveSessionView.js';

export class FloorViewerView {
  constructor() {
    this.activeAreaId = 'area-main';
    this.container = null;
    this.activeSessionId = null;
    this.unsubscribeProjection = null;
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'floor-viewer-container flex-col gap-lg animate-fade-in';
    this.container.style.width = '100%';

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
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:var(--space-md);">
        <div>
          <h2 style="font-size:1.5rem;">Restaurant Layout & Live Floor</h2>
          <p style="color:var(--text-muted); font-size:0.875rem;">Single unified table state projection across all workspaces (PD-006 & PD-009)</p>
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
      gridMount.innerHTML = `<div style="grid-column:1/-1; color:var(--text-muted); padding:var(--space-xl); text-align:center;">No tables configured in this dining area.</div>`;
      return;
    }

    gridMount.innerHTML = projections.map(p => `
      <div class="card table-card animate-fade-in" data-table="${p.tableNumber}" style="cursor:pointer; border-top:4px solid ${p.stateColor}; transition:transform var(--transition-fast); padding:var(--space-md);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-xs);">
          <div style="font-size:1.25rem; font-weight:700;">Table ${p.tableNumber}</div>
          <span class="badge" style="background:${p.stateColor}22; color:${p.stateColor}; border:1px solid ${p.stateColor}; font-size:0.65rem;">
            ${p.physicalState}
          </span>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; color:var(--text-secondary); margin-top:4px;">
          <div>👥 ${p.capacity} / ${p.maxCapacity}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${p.elapsedTime}</div>
        </div>

        <div style="margin-top:var(--space-xs); font-size:0.75rem; color:var(--accent-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${p.assignedWaiterName ? `👤 ${p.assignedWaiterName}` : '👤 Unassigned'}
        </div>
      </div>
    `).join('');

    this.bindGridEvents();
  }

  bindGridEvents() {
    const cards = this.container.querySelectorAll('.table-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const tableNumber = parseInt(card.dataset.table);
        const projection = tableProjectionService.getTableProjection(tableNumber);
        this.openInspector(projection);
      });
    });
  }

  openInspector(projection) {
    const modalMount = this.container.querySelector('#inspector-modal-mount');
    modalMount.innerHTML = '';

    const modal = new TableInspectorModal({
      projection,
      onClose: () => { modalMount.innerHTML = ''; },
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

    modalMount.appendChild(modal.render());
  }
}
