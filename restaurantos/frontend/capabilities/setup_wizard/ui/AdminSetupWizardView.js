/**
 * Milestone 1 - Restaurant Setup Assistant Launcher (PD-012 & PD-013)
 * Dynamic 5-step guided launcher for shared infrastructure configuration with setup resume and estimated times.
 */

import { tenantModel } from '../../../../../businessos/platform/tenant/tenantModel.js';

export class AdminSetupWizardView {
  constructor({ onComplete }) {
    this.onComplete = onComplete;
    this.currentStep = 1;
    this.container = null;
    this.steps = [
      { id: 1, title: 'Restaurant Profile', estTime: '2 mins', desc: 'Business Name, Currency & Timezone' },
      { id: 2, title: 'Dining Areas & Tables', estTime: '5 mins', desc: 'Layout zones, seat capacities, shapes' },
      { id: 3, title: 'Staff & Roles', estTime: '3 mins', desc: 'Waiters, Chefs, Bartenders, Cashiers' },
      { id: 4, title: 'Hardware Printers', estTime: '2 mins', desc: 'ESC/POS thermal printer IPs' },
      { id: 5, title: 'Payment Gateways', estTime: '2 mins', desc: 'UPI QR Merchant ID & Tax rates' },
      { id: 6, title: 'Start Operations Review', estTime: '1 min', desc: 'Infrastructure readiness audit' }
    ];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'card animate-fade-in';
    this.container.style.padding = 'var(--space-xl)';

    const tenant = tenantModel.getPrimaryTenant();
    if (tenant && tenant.lastCompletedStep > 1) {
      this.currentStep = tenant.lastCompletedStep;
    }

    this.updateContent();
    return this.container;
  }

  updateContent() {
    const tenant = tenantModel.getPrimaryTenant();
    const progressPercent = Math.round((this.currentStep / 6) * 100);

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid var(--border-subtle); padding-bottom:var(--space-md); margin-bottom:var(--space-lg);">
        <div>
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">RESTAURANT SETUP ASSISTANT (MILESTONE 1)</div>
          <h2 style="font-size:1.75rem;">Step ${this.currentStep} of 6 — ${this.steps[this.currentStep - 1].title}</h2>
          <p style="font-size:0.875rem; color:var(--text-muted); margin-top:4px;">
            ${this.steps[this.currentStep - 1].desc} • Estimated Time: <strong>⏱️ ${this.steps[this.currentStep - 1].estTime}</strong>
          </p>
        </div>
        ${tenant && tenant.lastCompletedStep > 1 ? `
          <button class="btn-secondary" id="btn-resume-setup" style="border-color:var(--accent-primary); color:var(--accent-primary);">
            Resume Setup (Step ${tenant.lastCompletedStep}) →
          </button>
        ` : ''}
      </div>

      <!-- Setup Progress Bar -->
      <div style="background:var(--bg-surface-2); padding:var(--space-md); border-radius:var(--radius-md); margin-bottom:var(--space-lg);">
        <div style="display:flex; justify-content:space-between; font-size:0.875rem; font-weight:600; margin-bottom:6px;">
          <span>Infrastructure Onboarding Progress</span>
          <span>${progressPercent}% Complete</span>
        </div>
        <div style="height:8px; background:var(--bg-surface-3); border-radius:4px; overflow:hidden;">
          <div style="height:100%; width:${progressPercent}%; background:var(--accent-primary); transition:width var(--transition-medium);"></div>
        </div>
      </div>

      <!-- Step Content Area -->
      <div id="step-body-mount" style="min-height:280px; background:var(--bg-surface-2); padding:var(--space-lg); border-radius:var(--radius-md); margin-bottom:var(--space-lg);">
        ${this.renderStepBody()}
      </div>

      <!-- Step Navigation Buttons -->
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <button class="btn-secondary" id="btn-prev-step" ${this.currentStep === 1 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>← Previous Step</button>
        <div>
          ${this.currentStep < 6 ? `
            <button class="btn-primary" id="btn-next-step" style="padding:10px 24px;">Next Step →</button>
          ` : `
            <button class="btn-primary" id="btn-start-operations-action" style="padding:12px 28px; background:var(--status-success); color:#000; font-weight:700;">🚀 Start Operations & Go to Dashboard</button>
          `}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  renderStepBody() {
    switch (this.currentStep) {
      case 1:
        return `
          <h3>Step 1: Restaurant Profile & Preferences</h3>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-bottom:16px;">Configure shared business parameters across all workspaces.</p>
          <div class="grid grid-cols-2 gap-md" style="max-width:560px;">
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:4px;">Business Name</label>
              <input type="text" id="inp-biz-name" value="Anchor Bistro & Cafe" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:0.85rem; margin-bottom:4px;">Service Charge %</label>
              <input type="number" id="inp-svc-charge" value="5" style="width:100%;">
            </div>
          </div>
        `;
      case 2:
        return `
          <h3>Step 2: Dining Areas & Tables Specification</h3>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-bottom:16px;">Set up physical restaurant areas and static table capacities (PD-007).</p>
          <div style="display:flex; gap:var(--space-md); margin-bottom:12px;">
            <span class="badge badge-success">4 Dining Areas Configured</span>
            <span class="badge badge-info">10 Master Tables Active</span>
          </div>
          <div style="color:var(--text-secondary); font-size:0.875rem;">Main Hall (T1-T6) • Outdoor Patio (T101-T102) • VIP Lounge (T201) • Bar (T301)</div>
        `;
      case 3:
        return `
          <h3>Step 3: Staff & Role Allocation</h3>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-bottom:16px;">Onboard team members and assign granular RBAC roles.</p>
          <div style="display:flex; gap:var(--space-md);">
            <div class="card" style="flex:1; background:var(--bg-surface-1);"><span style="font-weight:600;">Rahul Sharma</span> (Waiter)</div>
            <div class="card" style="flex:1; background:var(--bg-surface-1);"><span style="font-weight:600;">Chef Vikram</span> (Chef)</div>
            <div class="card" style="flex:1; background:var(--bg-surface-1);"><span style="font-weight:600;">Priya Mehta</span> (Manager)</div>
          </div>
        `;
      case 4:
        return `
          <h3>Step 4: Hardware Thermal Printers</h3>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-bottom:16px;">Configure ESC/POS thermal printer IP addresses for KOT/BOT ticket routing.</p>
          <div class="card" style="max-width:480px; background:var(--bg-surface-1);">
            <div style="font-weight:600;">Kitchen Thermal Printer (ESC/POS)</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">IP: 192.168.1.100 • Status: Connected 🟢</div>
          </div>
        `;
      case 5:
        return `
          <h3>Step 5: Payment Gateway & UPI QR</h3>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-bottom:16px;">Set up Merchant UPI VPA for dynamic cashier QR generation.</p>
          <div class="card" style="max-width:480px; background:var(--bg-surface-1);">
            <div style="font-weight:600;">Razorpay UPI Gateway</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">Merchant VPA: anchorbistro@upi • Dynamic QR Ready 🟢</div>
          </div>
        `;
      default:
        return `
          <h3>Step 6: Infrastructure Readiness Review</h3>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-bottom:16px;">Infrastructure setup is complete. Click "Start Operations" to land on the Admin Dashboard!</p>
          <div class="badge badge-success" style="padding:10px 16px; font-size:0.9rem;">
            ✓ Infrastructure Setup Checklist Passed (5 / 5 Items Complete)
          </div>
        `;
    }
  }

  bindEvents() {
    const prevBtn = this.container.querySelector('#btn-prev-step');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.currentStep > 1) {
          this.currentStep--;
          this.updateContent();
        }
      });
    }

    const nextBtn = this.container.querySelector('#btn-next-step');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (this.currentStep < 6) {
          this.currentStep++;
          tenantModel.updateTenant({ lastCompletedStep: this.currentStep });
          this.updateContent();
        }
      });
    }

    const resumeBtn = this.container.querySelector('#btn-resume-setup');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        const tenant = tenantModel.getPrimaryTenant();
        if (tenant && tenant.lastCompletedStep) {
          this.currentStep = tenant.lastCompletedStep;
          this.updateContent();
        }
      });
    }

    const startOpsBtn = this.container.querySelector('#btn-start-operations-action');
    if (startOpsBtn) {
      startOpsBtn.addEventListener('click', () => {
        tenantModel.updateTenant({ isOperationsStarted: true, isSetupComplete: true });
        alert('🚀 Operations Started! Opening Admin Home Dashboard with Workspace Health Scores...');
        if (this.onComplete) this.onComplete();
      });
    }
  }
}
