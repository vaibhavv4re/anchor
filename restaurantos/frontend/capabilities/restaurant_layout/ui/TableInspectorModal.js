/**
 * Capability Group 2 & 3 Integration - Action-Oriented Table Inspector Modal
 * Seamlessly opens CreateSessionModal when seating guests, or ActiveSessionView when inspecting active sessions.
 */

import { PhysicalTableStates } from '../../../../../businessos/platform/table_state/tableStateMachine.js';
import { CreateSessionModal } from '../../guest_service/ui/CreateSessionModal.js';
import { sessionProjectionService } from '../../../../../businessos/platform/session/sessionProjectionService.js';

export class TableInspectorModal {
  constructor({ projection, onClose, onActionComplete, onOpenActiveSession }) {
    this.projection = projection;
    this.onClose = onClose;
    this.onActionComplete = onActionComplete;
    this.onOpenActiveSession = onOpenActiveSession;
    this.modalEl = null;
  }

  render() {
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'lock-screen-overlay animate-fade-in';
    this.updateContent();
    return this.modalEl;
  }

  updateContent() {
    const p = this.projection;
    const action = p.primaryAction || { type: 'NONE', label: 'View Details' };

    this.modalEl.innerHTML = `
      <div class="card animate-fade-in" style="max-width:440px; width:100%; padding:var(--space-xl);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:var(--space-md);">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">PHYSICAL ASSET (PD-008)</div>
            <h2 style="font-size:1.75rem;">Table ${p.tableNumber}</h2>
          </div>
          <span class="badge" style="background-color:${p.stateColor}22; color:${p.stateColor}; border:1px solid ${p.stateColor};">
            ${p.physicalState}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-sm" style="background:var(--bg-surface-2); padding:var(--space-md); border-radius:var(--radius-md); margin-bottom:var(--space-lg);">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Capacity Specs</div>
            <div style="font-weight:600;">${p.capacity} Seats (Max ${p.maxCapacity})</div>
          </div>
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Elapsed Time</div>
            <div style="font-weight:600;">${p.elapsedTime}</div>
          </div>
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Assigned Waiter</div>
            <div style="font-weight:600;">${p.assignedWaiterName || 'Unassigned'}</div>
          </div>
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Active Session</div>
            <div style="font-weight:600;">${p.currentSessionId || 'None'}</div>
          </div>
        </div>

        <!-- Primary Action Engine Button -->
        <div style="display:flex; flex-direction:column; gap:var(--space-md);">
          <button class="btn-primary w-full" id="btn-primary-action" data-type="${action.type}" style="padding:14px; font-weight:600;">
            ${action.label}
          </button>

          <div style="display:flex; justify-content:flex-end; margin-top:var(--space-xs);">
            <button class="btn-secondary" id="btn-close-modal" style="width:100%;">Close Inspector</button>
          </div>
        </div>

        <div id="create-session-mount"></div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.modalEl.querySelector('#btn-close-modal').addEventListener('click', () => {
      if (this.onClose) this.onClose();
    });

    const primaryBtn = this.modalEl.querySelector('#btn-primary-action');
    if (primaryBtn) {
      primaryBtn.addEventListener('click', () => {
        const type = primaryBtn.dataset.type;

        if (type === 'SEAT_GUESTS') {
          // Open Group 3 CreateSessionModal
          const parentMount = this.modalEl.parentElement;
          if (parentMount) {
            parentMount.innerHTML = '';

            const sessionModal = new CreateSessionModal({
              tableNumber: this.projection.tableNumber,
              onClose: () => { parentMount.innerHTML = ''; },
              onSessionCreated: (session) => {
                parentMount.innerHTML = '';
                if (this.onActionComplete) this.onActionComplete();
                if (this.onOpenActiveSession) this.onOpenActiveSession(session.id);
              }
            });

            parentMount.appendChild(sessionModal.render());
          }
        } else if (type === 'OPEN_SESSION') {
          const activeProj = sessionProjectionService.getActiveProjectionForTable(this.projection.tableNumber);
          if (activeProj && this.onOpenActiveSession) {
            this.onOpenActiveSession(activeProj.sessionId);
          } else {
            alert(`No active session found for Table ${this.projection.tableNumber}`);
          }
          if (this.onClose) this.onClose();
        } else if (type === 'OPEN_BILL') {
          const activeProj = sessionProjectionService.getActiveProjectionForTable(this.projection.tableNumber);
          if (activeProj && this.onOpenActiveSession) {
            this.onOpenActiveSession(activeProj.sessionId);
          } else {
            alert(`No active bill session found for Table ${this.projection.tableNumber}`);
          }
          if (this.onClose) this.onClose();
        } else if (type === 'MARK_CLEAN' || type === 'RESTORE_SERVICE') {
          tableStateMachine.transitionTableState(this.projection.tableNumber, PhysicalTableStates.AVAILABLE);
          if (this.onActionComplete) this.onActionComplete();
          if (this.onClose) this.onClose();
        }
      });
    }
  }
}
