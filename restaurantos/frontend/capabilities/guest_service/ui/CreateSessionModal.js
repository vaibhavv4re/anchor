/**
 * Capability Group 3 - Create Session Modal Component
 * Allows waiters to enter guest count, operational notes, dietary tags, and celebration flags.
 * Automatically binds logged-in waiter identity and occupies table asset.
 * Maintains form state seamlessly without DOM re-renders resetting inputs.
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
    this.guestCount = 2;
    this.guestNotes = '';
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
          <h2 style="font-size:1.75rem; margin-top:2px;">Seat Guests — Table ${this.tableNumber}</h2>
          <p style="font-size:0.875rem; color:var(--text-muted); margin-top:4px;">Assigned Waiter: <strong>${waiterName}</strong></p>
        </div>

        <div style="display:flex; flex-direction:column; gap:var(--space-md);">
          <!-- Guest Count Input -->
          <div>
            <label style="display:block; font-size:0.875rem; margin-bottom:6px; font-weight:600;">Guest Count</label>
            <div style="display:flex; gap:var(--space-sm); margin-bottom:8px;">
              ${[1, 2, 3, 4, 5, 6, 8].map(num => `
                <button class="btn-secondary btn-guest-num ${this.guestCount === num ? 'active-guest-btn' : ''}" data-num="${num}" style="flex:1; padding:10px 0; font-weight:700; border-radius:6px; ${this.guestCount === num ? 'background:var(--accent-primary); color:#000000; border-color:var(--accent-primary);' : ''}">${num}</button>
              `).join('')}
            </div>
            <input type="number" id="inp-custom-guests" min="1" value="${this.guestCount}" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); color:var(--text-primary); font-size:1rem; font-weight:700;" placeholder="Or enter custom count">
          </div>

          <!-- Operational Notes -->
          <div>
            <label style="display:block; font-size:0.875rem; margin-bottom:6px; font-weight:600;">Guest Seating Notes</label>
            <input type="text" id="inp-notes" value="${this.guestNotes}" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); color:var(--text-primary); font-size:0.9rem;" placeholder="e.g. Window booth, quiet table, high chair needed">
          </div>

          <!-- Dietary Tags -->
          <div>
            <label style="display:block; font-size:0.875rem; margin-bottom:6px; font-weight:600;">Dietary Flags (Optional)</label>
            <div style="display:flex; gap:var(--space-sm); flex-wrap:wrap;">
              ${['Nut Allergy', 'Gluten Free', 'Vegan', 'Jain', 'Dairy Free'].map(tag => `
                <button class="badge btn-tag-diet ${this.selectedDietaryTags.has(tag) ? 'badge-danger' : 'badge-info'}" data-tag="${tag}" style="cursor:pointer; padding:8px 14px; font-size:0.8rem; font-weight:700; border-radius:6px;">
                  ${tag}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Celebration Tag -->
          <div>
            <label style="display:block; font-size:0.875rem; margin-bottom:6px; font-weight:600;">Celebration Flag (Optional)</label>
            <div style="display:flex; gap:var(--space-sm);">
              <button class="btn-secondary btn-tag-celeb ${this.selectedCelebration === 'Birthday' ? 'active-celeb' : ''}" data-celeb="Birthday" style="flex:1; padding:10px; font-weight:700; ${this.selectedCelebration === 'Birthday' ? 'background:var(--accent-primary); color:#000000; border-color:var(--accent-primary);' : ''}">🎂 Birthday</button>
              <button class="btn-secondary btn-tag-celeb ${this.selectedCelebration === 'Anniversary' ? 'active-celeb' : ''}" data-celeb="Anniversary" style="flex:1; padding:10px; font-weight:700; ${this.selectedCelebration === 'Anniversary' ? 'background:var(--accent-primary); color:#000000; border-color:var(--accent-primary);' : ''}">🥂 Anniversary</button>
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:var(--space-md); margin-top:var(--space-md);">
            <button class="btn-secondary" id="btn-cancel-create-session" style="flex:1; padding:12px; font-weight:700;">Cancel</button>
            <button class="btn-primary" id="btn-submit-create-session" style="flex:2; padding:12px; font-weight:800; background:#10b981; color:#000000; border:none; cursor:pointer;">✨ Open Session & Start Service</button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.modalEl.remove();
        if (this.onClose) this.onClose();
      }
    });

    const cancelBtn = this.modalEl.querySelector('#btn-cancel-create-session');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.modalEl.remove();
        if (this.onClose) this.onClose();
      });
    }

    const customInp = this.modalEl.querySelector('#inp-custom-guests');
    if (customInp) {
      customInp.addEventListener('input', (e) => {
        this.guestCount = parseInt(e.target.value) || 1;
        this.syncGuestButtonsUI();
      });
    }

    const notesInp = this.modalEl.querySelector('#inp-notes');
    if (notesInp) {
      notesInp.addEventListener('input', (e) => {
        this.guestNotes = e.target.value;
      });
    }

    const guestBtns = this.modalEl.querySelectorAll('.btn-guest-num');
    guestBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const num = parseInt(btn.dataset.num) || 2;
        this.guestCount = num;
        if (customInp) customInp.value = num;
        this.syncGuestButtonsUI();
      });
    });

    const dietBtns = this.modalEl.querySelectorAll('.btn-tag-diet');
    dietBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        if (this.selectedDietaryTags.has(tag)) {
          this.selectedDietaryTags.delete(tag);
          btn.classList.remove('badge-danger');
          btn.classList.add('badge-info');
        } else {
          this.selectedDietaryTags.add(tag);
          btn.classList.remove('badge-info');
          btn.classList.add('badge-danger');
        }
      });
    });

    const celebBtns = this.modalEl.querySelectorAll('.btn-tag-celeb');
    celebBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const celeb = btn.dataset.celeb;
        this.selectedCelebration = this.selectedCelebration === celeb ? null : celeb;
        celebBtns.forEach(b => {
          if (b.dataset.celeb === this.selectedCelebration) {
            b.style.background = 'var(--accent-primary)';
            b.style.color = '#000000';
            b.style.borderColor = 'var(--accent-primary)';
          } else {
            b.style.background = 'var(--bg-surface-2)';
            b.style.color = 'var(--text-primary)';
            b.style.borderColor = 'var(--border-subtle)';
          }
        });
      });
    });

    const submitBtn = this.modalEl.querySelector('#btn-submit-create-session');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const currentGuestInp = this.modalEl.querySelector('#inp-custom-guests');
        const currentNotesInp = this.modalEl.querySelector('#inp-notes');

        const guestCount = currentGuestInp ? (parseInt(currentGuestInp.value) || this.guestCount || 2) : 2;
        const guestNotes = currentNotesInp ? currentNotesInp.value : this.guestNotes;

        const currentAuth = authEngine.getCurrentSession();
        const waiterId = currentAuth ? (currentAuth.employeeId || currentAuth.id || currentAuth.employee_code || currentAuth.employeeName) : 'emp-suresh';
        const tenantId = currentAuth ? (currentAuth.tenantId || currentAuth.tenant_id) : 'tenant_h0qc7wf';

        // 1. Create Session Entity
        const session = sessionModel.createSession({
          tableNumber: this.tableNumber,
          guestCount,
          assignedWaiterId: waiterId,
          guestNotes,
          dietaryTags: Array.from(this.selectedDietaryTags),
          celebrationFlag: this.selectedCelebration,
          tenantId
        });

        // 2. Transition Table Physical Asset to OCCUPIED
        tableStateMachine.transitionTableState(this.tableNumber, PhysicalTableStates.OCCUPIED, {
          sessionId: session.id,
          waiterId
        });

        this.modalEl.remove();
        if (this.onSessionCreated) this.onSessionCreated(session);
      });
    }
  }

  syncGuestButtonsUI() {
    if (!this.modalEl) return;
    const guestBtns = this.modalEl.querySelectorAll('.btn-guest-num');
    guestBtns.forEach(b => {
      const num = parseInt(b.dataset.num);
      if (num === this.guestCount) {
        b.style.background = 'var(--accent-primary)';
        b.style.color = '#000000';
        b.style.borderColor = 'var(--accent-primary)';
      } else {
        b.style.background = 'var(--bg-surface-2)';
        b.style.color = 'var(--text-primary)';
        b.style.borderColor = 'var(--border-subtle)';
      }
    });
  }
}
