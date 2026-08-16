/**
 * Capability Group 3 - Create Session Modal Component
 * Allows waiters to enter guest count, operational notes, dietary tags, and celebration flags.
 * Automatically binds logged-in waiter identity and occupies table asset.
 */

import { authEngine } from '../../../../../businessos/platform/authentication/authEngine.js';
import { sessionModel } from '../../../../../businessos/platform/session/sessionModel.js';
import { tableStateMachine, PhysicalTableStates } from '../../../../../businessos/platform/table_state/tableStateMachine.js';

export class CreateSessionModal {
  constructor({ tableNumber, onClose, onSessionCreated }) {
    this.tableNumber = tableNumber;
    this.onClose = onClose;
    this.onSessionCreated = onSessionCreated;
    this.modalEl = null;
    this.selectedDietaryTags = new Set();
    this.selectedCelebration = null;
  }

  render() {
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'lock-screen-overlay animate-fade-in';
    this.updateContent();
    return this.modalEl;
  }

  updateContent() {
    const session = authEngine.getCurrentSession();
    const waiterName = session ? session.employeeName : 'Logged In Waiter';

    this.modalEl.innerHTML = `
      <div class="card animate-fade-in" style="max-width:480px; width:100%; padding:var(--space-xl);">
        <div style="margin-bottom:var(--space-md);">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">GUEST SERVICE LIFECYCLE (GROUP 3)</div>
          <h2 style="font-size:1.75rem;">Seat Guests — Table ${this.tableNumber}</h2>
          <p style="font-size:0.875rem; color:var(--text-muted); margin-top:4px;">Assigned Waiter: <strong>${waiterName}</strong></p>
        </div>

        <div style="display:flex; flex-direction:column; gap:var(--space-md);">
          <!-- Guest Count Input -->
          <div>
            <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Guest Count</label>
            <div style="display:flex; gap:var(--space-sm);">
              ${[1, 2, 3, 4, 5, 6, 8].map(num => `
                <button class="btn-secondary btn-guest-num" data-num="${num}" style="flex:1; padding:10px 0; font-weight:600;">${num}</button>
              `).join('')}
            </div>
            <input type="number" id="inp-custom-guests" min="1" value="2" style="width:100%; margin-top:var(--space-xs);" placeholder="Or enter custom count">
          </div>

          <!-- Operational Notes -->
          <div>
            <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Guest Seating Notes</label>
            <input type="text" id="inp-notes" style="width:100%;" placeholder="e.g. Window booth, quiet table, high chair needed">
          </div>

          <!-- Dietary Tags -->
          <div>
            <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Dietary Flags (Optional)</label>
            <div style="display:flex; gap:var(--space-sm); flex-wrap:wrap;">
              ${['Nut Allergy', 'Gluten Free', 'Vegan', 'Jain', 'Dairy Free'].map(tag => `
                <button class="badge btn-tag-diet ${this.selectedDietaryTags.has(tag) ? 'badge-danger' : 'badge-info'}" data-tag="${tag}" style="cursor:pointer; padding:6px 12px;">
                  ${tag}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Celebration Tag -->
          <div>
            <label style="display:block; font-size:0.875rem; margin-bottom:4px;">Celebration Flag (Optional)</label>
            <div style="display:flex; gap:var(--space-sm);">
              <button class="btn-secondary btn-tag-celeb ${this.selectedCelebration === 'Birthday' ? 'active' : ''}" data-celeb="Birthday" style="flex:1;">🎂 Birthday</button>
              <button class="btn-secondary btn-tag-celeb ${this.selectedCelebration === 'Anniversary' ? 'active' : ''}" data-celeb="Anniversary" style="flex:1;">🥂 Anniversary</button>
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:var(--space-md); margin-top:var(--space-md);">
            <button class="btn-secondary" id="btn-cancel-create-session" style="flex:1;">Cancel</button>
            <button class="btn-primary" id="btn-submit-create-session" style="flex:2;">✨ Open Session & Start Service</button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.modalEl.querySelector('#btn-cancel-create-session').addEventListener('click', () => {
      if (this.onClose) this.onClose();
    });

    const guestBtns = this.modalEl.querySelectorAll('.btn-guest-num');
    guestBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const num = btn.dataset.num;
        const customInp = this.modalEl.querySelector('#inp-custom-guests');
        if (customInp) customInp.value = num;
      });
    });

    const dietBtns = this.modalEl.querySelectorAll('.btn-tag-diet');
    dietBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        if (this.selectedDietaryTags.has(tag)) {
          this.selectedDietaryTags.delete(tag);
        } else {
          this.selectedDietaryTags.add(tag);
        }
        this.updateContent();
      });
    });

    const celebBtns = this.modalEl.querySelectorAll('.btn-tag-celeb');
    celebBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const celeb = btn.dataset.celeb;
        this.selectedCelebration = this.selectedCelebration === celeb ? null : celeb;
        this.updateContent();
      });
    });

    this.modalEl.querySelector('#btn-submit-create-session').addEventListener('click', () => {
      const guestCount = parseInt(this.modalEl.querySelector('#inp-custom-guests').value) || 2;
      const guestNotes = this.modalEl.querySelector('#inp-notes').value;
      const currentAuth = authEngine.getCurrentSession();
      const waiterId = currentAuth ? currentAuth.employeeId : 'emp-rahul';

      // 1. Create Session Entity
      const session = sessionModel.createSession({
        tableNumber: this.tableNumber,
        guestCount,
        assignedWaiterId: waiterId,
        guestNotes,
        dietaryTags: Array.from(this.selectedDietaryTags),
        celebrationFlag: this.selectedCelebration
      });

      // 2. Transition Table Physical Asset to OCCUPIED
      tableStateMachine.transitionTableState(this.tableNumber, PhysicalTableStates.OCCUPIED, {
        sessionId: session.id,
        waiterId
      });

      if (this.onSessionCreated) this.onSessionCreated(session);
    });
  }
}
