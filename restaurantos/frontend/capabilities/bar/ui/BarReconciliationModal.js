/**
 * RestaurantOS - Bar Stock Reconciliation Modal (Phase B-05D)
 *
 * Provides the operational UI for Bar Stock Reconciliation Sessions:
 *   1. Step 1 (Bartender Blind Count): Clean, focused physical count entry.
 *      STRICT INVARIANT: Hides system expected stock, book balances, and variances!
 *   2. Step 2 (Supervisor Variance Review): Displays expected vs physical,
 *      reasons (SPILLAGE, BREAKAGE, OVERPOUR, UNEXPLAINED, STOCK_AUDIT_CORRECTION),
 *      and cost impact.
 *   3. Supervisor Signoff: Post adjustments atomically through BarReconciliationService.
 */

import {
  barReconciliationService
} from '../../../../../businessos/platform/bar/barReconciliationService.js';
import {
  ReconciliationSessionStatus,
  ReconciliationReasonCode,
  isAuthorizedSupervisor
} from '../../../../../businessos/platform/bar/barReconciliationModel.js';

export class BarReconciliationModal {
  constructor(deps = {}) {
    this.service = deps.service || barReconciliationService;
    this.dataGateway = deps.dataGateway || null;
    this.offlineStore = deps.offlineStore || null;
    this.onClose = deps.onClose || (() => {});
    this.activeSession = null;
    this.modalEl = null;
    this.currentViewMode = 'BLIND_COUNT'; // 'BLIND_COUNT' | 'VARIANCE_REVIEW'
    this.currentUser = deps.sessionUser || { name: 'Bartender', role: 'BARTENDER' };
    this.filterCategory = 'ALL';
    this.searchQuery = '';
  }

  /**
   * Opens or creates a reconciliation session and renders the modal.
   */
  async open(sessionUser = null, existingSessionId = null) {
    if (sessionUser) this.currentUser = sessionUser;

    if (existingSessionId) {
      this.activeSession = this.service.getSessionById(existingSessionId);
    }

    if (!this.activeSession) {
      this.activeSession = this.service.openSession({
        openedBy: this.currentUser.name || 'Bartender',
        sessionType: 'SHIFT_CLOSE',
        notes: `Shift reconciliation opened by ${this.currentUser.name || 'Bartender'}`
      });
    }

    if (this.activeSession.status === ReconciliationSessionStatus.VARIANCE_REVIEW ||
        this.activeSession.status === ReconciliationSessionStatus.APPROVED_AND_POSTED) {
      this.currentViewMode = 'VARIANCE_REVIEW';
    } else {
      this.currentViewMode = 'BLIND_COUNT';
    }

    this.render();
  }

  close() {
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }
    this.modalEl = null;
    this.onClose();
  }

  render() {
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop animate-fade-in';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.78);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000; padding: 20px; overflow-y: auto; font-family: var(--font-family, sans-serif);
    `;

    const card = document.createElement('div');
    card.className = 'modal-content animate-slide-up';
    card.style.cssText = `
      background: var(--bg-surface-1, #18181b); color: var(--text-primary, #f4f4f5);
      border: 1px solid var(--border-subtle, #27272a); border-radius: 14px;
      width: 100%; max-width: 980px; max-height: 90vh; display: flex; flex-direction: column;
      box-shadow: 0 20px 50px rgba(0,0,0,0.6); overflow: hidden;
    `;

    const isSupervisor = isAuthorizedSupervisor(this.currentUser.role);
    const isPosted = this.activeSession.status === ReconciliationSessionStatus.APPROVED_AND_POSTED;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 16px 24px; border-bottom: 1px solid var(--border-subtle, #27272a);
      display: flex; justify-content: space-between; align-items: center; background: rgba(24,24,27,0.95);
    `;
    header.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-size:1.6rem;">📋</span>
        <div>
          <div style="font-size:1.15rem; font-weight:800; display:flex; align-items:center; gap:8px;">
            ${this.currentViewMode === 'BLIND_COUNT' ? 'Bar Shift Stock Count (Blind Observation)' : 'Bar Reconciliation & Variance Review'}
            <span class="badge" style="font-size:0.75rem; padding:3px 8px; border-radius:6px; font-weight:800; background:${this._getStatusColor(this.activeSession.status)}; color:#fff;">
              ${this.activeSession.status}
            </span>
          </div>
          <div style="font-size:0.8rem; color:var(--text-muted, #a1a1aa); margin-top:2px;">
            Session: <strong style="font-family:monospace; color:#38bdf8;">${this.activeSession.sessionNumber}</strong> • Store: <strong>LOC-314</strong> • Actor: <strong>${this.currentUser.name} (${this.currentUser.role})</strong>
          </div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        ${this.activeSession.status !== ReconciliationSessionStatus.DRAFT ? `
          <button id="btn-toggle-view-mode" style="padding:6px 12px; font-size:0.8rem; font-weight:700; background:var(--bg-surface-2, #27272a); color:var(--text-primary); border:1px solid var(--border-subtle); border-radius:6px; cursor:pointer;">
            ${this.currentViewMode === 'BLIND_COUNT' ? '➔ Show Variance Review' : '➔ Show Physical Count'}
          </button>
        ` : ''}
        <button id="btn-close-reconciliation-modal" style="background:transparent; border:none; color:var(--text-muted); font-size:1.5rem; cursor:pointer; line-height:1;">
          &times;
        </button>
      </div>
    `;

    // Body
    const body = document.createElement('div');
    body.style.cssText = `
      padding: 20px 24px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 16px;
    `;

    if (this.currentViewMode === 'BLIND_COUNT') {
      body.appendChild(this._renderBlindCountForm());
    } else {
      body.appendChild(this._renderVarianceReviewForm(isSupervisor, isPosted));
    }

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 14px 24px; border-top: 1px solid var(--border-subtle, #27272a);
      display: flex; justify-content: space-between; align-items: center; background: rgba(24,24,27,0.95);
    `;

    if (this.currentViewMode === 'BLIND_COUNT') {
      footer.innerHTML = `
        <div style="font-size:0.8rem; color:var(--text-muted);">
          🔒 <strong>Blind Protocol Active:</strong> Book balances are hidden to ensure independent observation.
        </div>
        <div style="display:flex; gap:10px;">
          <button id="btn-cancel-modal" style="padding:8px 16px; background:transparent; border:1px solid var(--border-subtle); color:var(--text-secondary); border-radius:8px; cursor:pointer; font-weight:700;">
            Cancel
          </button>
          <button id="btn-submit-blind-count" style="padding:8px 20px; background:#059669; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:800; box-shadow:0 2px 8px rgba(5,150,105,0.4);">
            🔒 Submit Count &amp; Freeze Snapshot
          </button>
        </div>
      `;
    } else {
      footer.innerHTML = `
        <div style="font-size:0.8rem; color:var(--text-muted);">
          ${isPosted ? '✅ Reconciliation session is completed and posted to ledger.' : 'Supervisor variance authorization required to adjust stock.'}
        </div>
        <div style="display:flex; gap:10px;">
          <button id="btn-cancel-modal" style="padding:8px 16px; background:transparent; border:1px solid var(--border-subtle); color:var(--text-secondary); border-radius:8px; cursor:pointer; font-weight:700;">
            Close
          </button>
          ${(!isPosted && isSupervisor) ? `
            <button id="btn-reject-reconciliation" style="padding:8px 16px; background:#ef4444; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:800;">
              ❌ Reject &amp; Recount
            </button>
            <button id="btn-approve-post-adjustments" style="padding:8px 20px; background:#3b82f6; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:800; box-shadow:0 2px 8px rgba(59,130,246,0.4);">
              ✅ Approve &amp; Post Adjustments
            </button>
          ` : (!isPosted && !isSupervisor ? `
            <div style="font-size:0.82rem; color:#f59e0b; font-weight:700; display:flex; align-items:center; gap:6px;">
              ⚠️ Supervisor signoff required to approve adjustments
            </div>
          ` : '')}
        </div>
      `;
    }

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);
    overlay.appendChild(card);

    this.modalEl = overlay;
    document.body.appendChild(overlay);

    this._bindEvents();
  }

  _renderBlindCountForm() {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; flex-direction:column; gap:14px;';

    // Banner
    wrapper.innerHTML = `
      <div style="background:rgba(56,189,248,0.08); border:1px solid rgba(56,189,248,0.25); border-radius:8px; padding:12px 16px; display:flex; align-items:center; gap:10px;">
        <span style="font-size:1.3rem;">ℹ️</span>
        <div style="font-size:0.82rem; color:var(--text-primary);">
          Enter the physical count observed on the bar shelves. Enter whole bottles and open bottle volume (ml). 
          <strong>System balances are hidden.</strong>
        </div>
      </div>
    `;

    // Filter bar
    const filterRow = document.createElement('div');
    filterRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;';
    filterRow.innerHTML = `
      <input type="text" id="reconcile-search-input" placeholder="🔍 Search SKU or item name..." value="${this.searchQuery}" style="padding:8px 12px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-primary); font-size:0.85rem; width:260px;" />
      <div style="font-size:0.8rem; color:var(--text-muted);">
        Total Active Items: <strong>${this.activeSession.lines.length}</strong>
      </div>
    `;
    wrapper.appendChild(filterRow);

    // Items list table
    const tableContainer = document.createElement('div');
    tableContainer.style.cssText = 'border:1px solid var(--border-subtle); border-radius:8px; overflow:hidden; background:var(--bg-surface-2);';

    let displayLines = this.activeSession.lines;
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      displayLines = displayLines.filter(l => l.itemCode.toLowerCase().includes(q) || l.itemName.toLowerCase().includes(q));
    }

    tableContainer.innerHTML = `
      <div style="max-height:480px; overflow-y:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
          <thead style="position:sticky; top:0; background:#202024; border-bottom:1px solid var(--border-subtle); z-index:2;">
            <tr>
              <th style="padding:10px 12px; text-align:left;">SKU / Item</th>
              <th style="padding:10px 12px; text-align:left;">Category</th>
              <th style="padding:10px 12px; text-align:center;">Pack Size</th>
              <th style="padding:10px 12px; text-align:center;">Sealed Bottles</th>
              <th style="padding:10px 12px; text-align:center;">Loose Vol (ml)</th>
              <th style="padding:10px 12px; text-align:right;">Physical Total (LTR)</th>
              <th style="padding:10px 12px; text-align:left;">Notes / Spillage</th>
            </tr>
          </thead>
          <tbody>
            ${displayLines.map(l => {
              const packLtr = (l.packSizeMl || 750) / 1000;
              const bottles = l.physicalBottles !== null ? l.physicalBottles : '';
              const portions = l.physicalPortionsMl !== null ? l.physicalPortionsMl : '';
              const totalLtr = l.physicalQuantity !== null ? l.physicalQuantity.toFixed(3) : '-';

              return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                  <td style="padding:8px 12px;">
                    <div style="font-weight:800; font-family:monospace; color:#38bdf8;">${l.itemCode}</div>
                    <div style="font-size:0.8rem; color:var(--text-primary);">${l.itemName}</div>
                  </td>
                  <td style="padding:8px 12px; color:var(--text-secondary);">${l.classification}</td>
                  <td style="padding:8px 12px; text-align:center; color:var(--text-muted);">${l.packSizeMl} ml</td>
                  <td style="padding:8px 12px; text-align:center;">
                    <input type="number" min="0" step="1" class="inp-physical-bottles" data-code="${l.itemCode}" value="${bottles}" placeholder="0" style="width:70px; padding:6px; background:#18181b; border:1px solid var(--border-subtle); border-radius:4px; color:#fff; text-align:center;" />
                  </td>
                  <td style="padding:8px 12px; text-align:center;">
                    <input type="number" min="0" step="10" class="inp-physical-portions" data-code="${l.itemCode}" value="${portions}" placeholder="0" style="width:80px; padding:6px; background:#18181b; border:1px solid var(--border-subtle); border-radius:4px; color:#fff; text-align:center;" />
                  </td>
                  <td style="padding:8px 12px; text-align:right; font-family:monospace; font-weight:800; color:#10b981;">
                    <span id="disp-total-${l.itemCode}">${totalLtr}</span>
                  </td>
                  <td style="padding:8px 12px;">
                    <input type="text" class="inp-physical-notes" data-code="${l.itemCode}" value="${l.notes || ''}" placeholder="e.g. Broken bottle, spill" style="width:160px; padding:6px 8px; background:#18181b; border:1px solid var(--border-subtle); border-radius:4px; color:var(--text-primary); font-size:0.75rem;" />
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    wrapper.appendChild(tableContainer);

    return wrapper;
  }

  _renderVarianceReviewForm(isSupervisor, isPosted) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; flex-direction:column; gap:14px;';

    const s = this.activeSession;

    // Summary strip
    wrapper.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px;">
        <div class="card" style="background:var(--bg-surface-2); padding:10px 14px; border-radius:8px;">
          <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">TOTAL SHORTAGE</div>
          <div style="font-size:1.4rem; font-weight:800; color:#ef4444; margin-top:2px;">${(s.totalShortageQty || 0).toFixed(3)} LTR</div>
        </div>
        <div class="card" style="background:var(--bg-surface-2); padding:10px 14px; border-radius:8px;">
          <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">TOTAL OVERAGE</div>
          <div style="font-size:1.4rem; font-weight:800; color:#10b981; margin-top:2px;">+${(s.totalOverageQty || 0).toFixed(3)} LTR</div>
        </div>
        <div class="card" style="background:var(--bg-surface-2); padding:10px 14px; border-radius:8px;">
          <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">NET VARIANCE VALUE</div>
          <div style="font-size:1.4rem; font-weight:800; color:${(s.netVarianceValue || 0) < 0 ? '#ef4444' : '#10b981'}; margin-top:2px;">
            ₹${Math.abs(s.netVarianceValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div class="card" style="background:var(--bg-surface-2); padding:10px 14px; border-radius:8px;">
          <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">FROZEN LEDGER BOUNDARY</div>
          <div style="font-size:0.78rem; font-family:monospace; color:#38bdf8; margin-top:6px; word-break:break-all;">
            ${s.expectedLedgerBoundary || 'N/A'}
          </div>
        </div>
      </div>
    `;

    // Variance review table
    const tableContainer = document.createElement('div');
    tableContainer.style.cssText = 'border:1px solid var(--border-subtle); border-radius:8px; overflow:hidden; background:var(--bg-surface-2);';

    let displayLines = s.lines || [];
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      displayLines = displayLines.filter(l => l.itemCode.toLowerCase().includes(q) || l.itemName.toLowerCase().includes(q));
    }

    tableContainer.innerHTML = `
      <div style="max-height:450px; overflow-y:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
          <thead style="position:sticky; top:0; background:#202024; border-bottom:1px solid var(--border-subtle); z-index:2;">
            <tr>
              <th style="padding:10px 12px; text-align:left;">SKU / Item</th>
              <th style="padding:10px 12px; text-align:right;">Expected (LTR)</th>
              <th style="padding:10px 12px; text-align:right;">Physical (LTR)</th>
              <th style="padding:10px 12px; text-align:right;">Variance (LTR)</th>
              <th style="padding:10px 12px; text-align:right;">Impact (₹)</th>
              <th style="padding:10px 12px; text-align:center;">Reason Classification</th>
              <th style="padding:10px 12px; text-align:left;">Notes</th>
            </tr>
          </thead>
          <tbody>
            ${displayLines.map(l => {
              const varColor = l.varianceType === 'SHORT' ? '#ef4444' : (l.varianceType === 'OVER' ? '#10b981' : '#94a3b8');
              const varSign = (l.varianceQty || 0) > 0 ? '+' : '';

              return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05); background:${l.varianceType !== 'MATCHED' ? 'rgba(239,68,68,0.03)' : 'transparent'};">
                  <td style="padding:8px 12px;">
                    <div style="font-weight:800; font-family:monospace; color:#38bdf8;">${l.itemCode}</div>
                    <div style="font-size:0.8rem; color:var(--text-primary);">${l.itemName}</div>
                  </td>
                  <td style="padding:8px 12px; text-align:right; font-family:monospace;">
                    ${(l.systemExpectedQty !== null ? l.systemExpectedQty : 0).toFixed(3)}
                  </td>
                  <td style="padding:8px 12px; text-align:right; font-family:monospace; font-weight:800;">
                    ${(l.physicalQuantity !== null ? l.physicalQuantity : 0).toFixed(3)}
                  </td>
                  <td style="padding:8px 12px; text-align:right; font-family:monospace; font-weight:800; color:${varColor};">
                    ${varSign}${(l.varianceQty !== null ? l.varianceQty : 0).toFixed(3)}
                  </td>
                  <td style="padding:8px 12px; text-align:right; font-family:monospace; color:${varColor};">
                    ${l.varianceCost ? (l.varianceCost < 0 ? `-₹${Math.abs(l.varianceCost).toFixed(2)}` : `+₹${l.varianceCost.toFixed(2)}`) : '₹0.00'}
                  </td>
                  <td style="padding:8px 12px; text-align:center;">
                    ${isPosted || !isSupervisor ? `
                      <span style="font-weight:700; font-size:0.75rem; color:${varColor};">${l.reasonCode || 'MATCHED'}</span>
                    ` : `
                      <select class="sel-variance-reason" data-code="${l.itemCode}" style="padding:4px 8px; background:#18181b; border:1px solid var(--border-subtle); border-radius:4px; color:#fff; font-size:0.75rem;">
                        <option value="UNEXPLAINED" ${l.reasonCode === 'UNEXPLAINED' ? 'selected' : ''}>UNEXPLAINED</option>
                        <option value="SPILLAGE" ${l.reasonCode === 'SPILLAGE' ? 'selected' : ''}>SPILLAGE</option>
                        <option value="BREAKAGE" ${l.reasonCode === 'BREAKAGE' ? 'selected' : ''}>BREAKAGE</option>
                        <option value="OVERPOUR" ${l.reasonCode === 'OVERPOUR' ? 'selected' : ''}>OVERPOUR</option>
                        <option value="STOCK_AUDIT_CORRECTION" ${l.reasonCode === 'STOCK_AUDIT_CORRECTION' ? 'selected' : ''}>STOCK_AUDIT_CORRECTION</option>
                      </select>
                    `}
                  </td>
                  <td style="padding:8px 12px; color:var(--text-muted); font-size:0.75rem;">
                    ${l.notes || '-'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    wrapper.appendChild(tableContainer);

    return wrapper;
  }

  _bindEvents() {
    if (!this.modalEl) return;

    // Close buttons
    const closeBtn = this.modalEl.querySelector('#btn-close-reconciliation-modal');
    if (closeBtn) closeBtn.onclick = () => this.close();

    const cancelBtn = this.modalEl.querySelector('#btn-cancel-modal');
    if (cancelBtn) cancelBtn.onclick = () => this.close();

    // Toggle view mode
    const toggleBtn = this.modalEl.querySelector('#btn-toggle-view-mode');
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        this.currentViewMode = this.currentViewMode === 'BLIND_COUNT' ? 'VARIANCE_REVIEW' : 'BLIND_COUNT';
        this.render();
      };
    }

    // Search input
    const searchInp = this.modalEl.querySelector('#reconcile-search-input');
    if (searchInp) {
      searchInp.oninput = (e) => {
        this.searchQuery = e.target.value;
        this.render();
      };
    }

    // Live calculation for physical total LTR
    const bottleInputs = this.modalEl.querySelectorAll('.inp-physical-bottles');
    const portionInputs = this.modalEl.querySelectorAll('.inp-physical-portions');
    const noteInputs = this.modalEl.querySelectorAll('.inp-physical-notes');

    const updateLineObservation = (code) => {
      const line = this.activeSession.lines.find(l => l.itemCode === code);
      if (!line) return;

      const bInp = this.modalEl.querySelector(`.inp-physical-bottles[data-code="${code}"]`);
      const pInp = this.modalEl.querySelector(`.inp-physical-portions[data-code="${code}"]`);
      const nInp = this.modalEl.querySelector(`.inp-physical-notes[data-code="${code}"]`);

      const bottles = bInp && bInp.value !== '' ? parseFloat(bInp.value) : null;
      const portions = pInp && pInp.value !== '' ? parseFloat(pInp.value) : null;
      const notes = nInp ? nInp.value : '';

      line.physicalBottles = bottles;
      line.physicalPortionsMl = portions;
      line.notes = notes;

      const packLtr = (line.packSizeMl || 750) / 1000;
      const total = ((bottles || 0) * packLtr) + ((portions || 0) / 1000);
      line.physicalQuantity = (bottles !== null || portions !== null) ? Math.round(total * 1000) / 1000 : null;

      const disp = this.modalEl.querySelector(`#disp-total-${code}`);
      if (disp) {
        disp.textContent = line.physicalQuantity !== null ? line.physicalQuantity.toFixed(3) : '-';
      }
    };

    bottleInputs.forEach(inp => {
      inp.oninput = () => updateLineObservation(inp.dataset.code);
    });
    portionInputs.forEach(inp => {
      inp.oninput = () => updateLineObservation(inp.dataset.code);
    });
    noteInputs.forEach(inp => {
      inp.oninput = () => updateLineObservation(inp.dataset.code);
    });

    // Submit blind count
    const submitBtn = this.modalEl.querySelector('#btn-submit-blind-count');
    if (submitBtn) {
      submitBtn.onclick = () => {
        try {
          const obs = this.activeSession.lines.map(l => ({
            itemCode: l.itemCode,
            physicalBottles: l.physicalBottles,
            physicalPortionsMl: l.physicalPortionsMl,
            physicalQuantity: l.physicalQuantity,
            notes: l.notes
          }));

          const updated = this.service.submitCount({
            sessionId: this.activeSession.id,
            physicalObservations: obs,
            submittedBy: this.currentUser.name || 'Bartender'
          });

          this.activeSession = updated;
          this.currentViewMode = 'VARIANCE_REVIEW';
          this.render();
        } catch (err) {
          alert(`❌ Submission failed: ${err.message}`);
        }
      };
    }

    // Supervisor Reason Overrides
    const reasonSelects = this.modalEl.querySelectorAll('.sel-variance-reason');
    reasonSelects.forEach(sel => {
      sel.onchange = () => {
        const line = this.activeSession.lines.find(l => l.itemCode === sel.dataset.code);
        if (line) line.reasonCode = sel.value;
      };
    });

    // Reject & Recount
    const rejectBtn = this.modalEl.querySelector('#btn-reject-reconciliation');
    if (rejectBtn) {
      rejectBtn.onclick = () => {
        const reason = prompt('Please enter the reason for rejection / recount:', 'Physical count discrepancies found');
        if (!reason) return;

        try {
          const rejected = this.service.rejectSession({
            sessionId: this.activeSession.id,
            rejectionReason: reason,
            sessionUser: this.currentUser
          });
          this.activeSession = rejected;
          this.currentViewMode = 'BLIND_COUNT';
          this.render();
        } catch (err) {
          alert(`❌ Rejection failed: ${err.message}`);
        }
      };
    }

    // Approve & Post Adjustments
    const approveBtn = this.modalEl.querySelector('#btn-approve-post-adjustments');
    if (approveBtn) {
      approveBtn.onclick = async () => {
        if (!confirm(`Are you sure you want to approve reconciliation "${this.activeSession.sessionNumber}" and post stock adjustments?`)) {
          return;
        }

        try {
          approveBtn.disabled = true;
          approveBtn.textContent = '⏳ Posting Adjustments...';

          const res = await this.service.approveAndPost({
            sessionId: this.activeSession.id,
            sessionUser: this.currentUser
          });

          if (!res.success) {
            alert(`❌ Approval failed: ${res.error}`);
            approveBtn.disabled = false;
            approveBtn.textContent = '✅ Approve & Post Adjustments';
            return;
          }

          this.activeSession = res.session;
          alert(`✅ Reconciliation "${res.session.sessionNumber}" approved and posted successfully! Posted ${res.adjustmentsCount} adjustments (Zero variance items: ${res.zeroVarianceCount}).`);
          this.close();
        } catch (err) {
          alert(`❌ Approval error: ${err.message}`);
          approveBtn.disabled = false;
          approveBtn.textContent = '✅ Approve & Post Adjustments';
        }
      };
    }
  }

  _getStatusColor(status) {
    switch (status) {
      case ReconciliationSessionStatus.DRAFT: return '#94a3b8';
      case ReconciliationSessionStatus.SUBMITTED:
      case ReconciliationSessionStatus.VARIANCE_REVIEW: return '#f59e0b';
      case ReconciliationSessionStatus.REJECTED: return '#ef4444';
      case ReconciliationSessionStatus.APPROVED_AND_POSTED: return '#10b981';
      default: return '#64748b';
    }
  }
}
