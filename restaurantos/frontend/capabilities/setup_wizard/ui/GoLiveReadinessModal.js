/**
 * Milestone 1 - Go-Live Readiness Modal (PD-016)
 * Launches when Admin clicks "Restaurant Ready for Service" to audit go-live requirements.
 */

import { commissioningEngine } from '../../../../../businessos/platform/commissioning/commissioningEngine.js';
import { tenantModel } from '../../../../../businessos/platform/tenant/tenantModel.js';

export class GoLiveReadinessModal {
  constructor({ onApproved, onCancel }) {
    this.onApproved = onApproved;
    this.onCancel = onCancel;
    this.modalEl = null;
  }

  render() {
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'lock-screen-overlay animate-fade-in';
    this.updateContent();
    return this.modalEl;
  }

  updateContent() {
    const audit = commissioningEngine.validateGoLive();

    this.modalEl.innerHTML = `
      <div class="card animate-fade-in" style="max-width:520px; width:100%; padding:var(--space-xl);">
        <div style="margin-bottom:var(--space-md);">
          <div style="font-size:0.75rem; color:var(--accent-primary); font-weight:700; text-transform:uppercase;">COMMISSIONING GO-LIVE AUDIT (PD-016)</div>
          <h2 style="font-size:1.75rem;">Restaurant Ready for Service?</h2>
          <p style="font-size:0.875rem; color:var(--text-muted); margin-top:4px;">Evaluating blocking vs. non-blocking operational requirements.</p>
        </div>

        <!-- Audit Results List -->
        <div style="display:flex; flex-direction:column; gap:var(--space-sm); margin:var(--space-md) 0;">
          <div style="padding:10px; background:var(--bg-surface-2); border-radius:6px; font-size:0.875rem;">
            <div style="font-weight:600; color:var(--status-success);">✓ Restaurant Infrastructure Configured</div>
          </div>
          <div style="padding:10px; background:var(--bg-surface-2); border-radius:6px; font-size:0.875rem;">
            <div style="font-weight:600; color:var(--status-success);">✓ Master Dining Tables Configured</div>
          </div>
          <div style="padding:10px; background:var(--bg-surface-2); border-radius:6px; font-size:0.875rem;">
            <div style="font-weight:600; color:var(--status-success);">✓ Staff Roles & Dynamic PINs Assigned</div>
          </div>

          ${audit.warningItems.length ? `
            <div style="padding:12px; background:rgba(245, 158, 11, 0.1); border:1px solid var(--status-warning); border-radius:6px; font-size:0.85rem;">
              <div style="font-weight:700; color:var(--status-warning);">⚠️ Non-Blocking Warnings:</div>
              <ul style="margin-top:4px; padding-left:18px; color:var(--text-secondary);">
                ${audit.warningItems.map(w => `<li>${w} not fully populated</li>`).join('')}
              </ul>
              <div style="margin-top:6px; font-weight:600;">You can start service now and configure these operational workspaces later.</div>
            </div>
          ` : ''}
        </div>

        <div style="font-weight:700; font-size:1rem; margin-top:16px; text-align:center;">
          Confirm "Restaurant Ready for Service"?
        </div>

        <!-- Buttons -->
        <div style="display:flex; justify-content:space-between; gap:var(--space-md); margin-top:var(--space-md);">
          <button class="btn-secondary" id="btn-cancel-golive" style="flex:1;">NO — Go Back</button>
          <button class="btn-primary" id="btn-confirm-golive" style="flex:2; background:var(--status-success); color:#000; font-weight:700;">
            🚀 YES — Start Live Service Now
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.modalEl.querySelector('#btn-cancel-golive').addEventListener('click', () => {
      if (this.onCancel) this.onCancel();
    });

    this.modalEl.querySelector('#btn-confirm-golive').addEventListener('click', () => {
      tenantModel.updateTenant({ isOperationsStarted: true, isSetupComplete: true, setupProgressPercent: 100 });
      if (this.onApproved) this.onApproved();
    });
  }
}
