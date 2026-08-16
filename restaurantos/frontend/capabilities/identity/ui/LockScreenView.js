/**
 * Capability Group 1 - Identity & Authentication UI
 * LockScreenView component handling idle lock overlay, PIN unlock, and Manager Override.
 */

import { authEngine } from '../../../../../businessos/platform/authentication/authEngine.js';

export class LockScreenView {
  constructor({ session, onUnlock }) {
    this.session = session;
    this.onUnlock = onUnlock;
    this.isOverrideMode = false;
    this.enteredPin = '';
    this.overlay = null;
  }

  render() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'lock-screen-overlay animate-fade-in';
    this.updateContent();
    return this.overlay;
  }

  updateContent() {
    if (!this.overlay) return;

    const dots = Array.from({ length: 6 }).map((_, i) => 
      `<div class="pin-dot ${i < this.enteredPin.length ? 'filled' : ''}"></div>`
    ).join('');

    const titleText = this.isOverrideMode ? 'Manager Override — Take Control' : `Session Locked — ${this.session.employeeName}`;
    const subText = this.isOverrideMode ? 'Enter Manager PIN to take control of this terminal' : 'Enter your 6-digit PIN to resume';

    this.overlay.innerHTML = `
      <div class="pin-pad-container" style="max-width: 440px;">
        <div style="text-align:center;">
          <div class="badge ${this.isOverrideMode ? 'badge-danger' : 'badge-warning'}" style="margin-bottom:8px;">
            ${this.isOverrideMode ? 'MANAGER OVERRIDE' : 'IDLE LOCK'}
          </div>
          <h2 style="font-size:1.25rem;">${titleText}</h2>
          <p style="font-size:0.875rem; color:var(--text-muted); margin-top:4px;">${subText}</p>
        </div>

        <div class="pin-display-dots">
          ${dots}
        </div>

        <div class="pin-grid">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => `
            <button class="keypad-btn" data-val="${num}">${num}</button>
          `).join('')}
          <button class="keypad-btn" data-action="clear" style="font-size:0.875rem; color:var(--status-danger);">CLEAR</button>
          <button class="keypad-btn" data-val="0">0</button>
          <button class="keypad-btn" data-action="backspace" style="font-size:1rem;">⌫</button>
        </div>

        <div style="display:flex; justify-content:between; width:100%; gap:var(--space-md); margin-top:var(--space-sm);">
          <button class="btn-secondary" id="btn-toggle-override" style="flex:1; font-size:0.875rem;">
            ${this.isOverrideMode ? '← Normal Unlock' : '🛡️ Manager Override'}
          </button>
        </div>

        <div id="lock-error" style="color:var(--status-danger); font-size:0.875rem; height:20px; text-align:center;"></div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const buttons = this.overlay.querySelectorAll('.keypad-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        const action = btn.dataset.action;

        if (val) {
          this.handleDigit(val);
        } else if (action === 'clear') {
          this.enteredPin = '';
          this.updateContent();
        } else if (action === 'backspace') {
          this.enteredPin = this.enteredPin.slice(0, -1);
          this.updateContent();
        }
      });
    });

    const overrideBtn = this.overlay.querySelector('#btn-toggle-override');
    if (overrideBtn) {
      overrideBtn.addEventListener('click', () => {
        this.isOverrideMode = !this.isOverrideMode;
        this.enteredPin = '';
        this.updateContent();
      });
    }
  }

  async handleDigit(digit) {
    if (this.enteredPin.length >= 6) return;
    this.enteredPin += digit;
    this.updateContent();

    if (this.enteredPin.length === 6) {
      await this.submitUnlock();
    }
  }

  async submitUnlock() {
    const errEl = this.overlay.querySelector('#lock-error');
    if (errEl) errEl.textContent = 'Verifying PIN...';

    const result = await authEngine.unlockSession(this.enteredPin);

    if (result.success) {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      if (this.onUnlock) this.onUnlock(result.session, result.isOverride);
    } else {
      if (errEl) errEl.textContent = result.error || 'Invalid Unlock PIN';
      this.enteredPin = '';
      setTimeout(() => this.updateContent(), 1200);
    }
  }
}
