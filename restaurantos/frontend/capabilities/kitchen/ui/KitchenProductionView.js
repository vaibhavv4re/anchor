/**
 * RestaurantOS Capability - Kitchen Production Control Workspace (F6.3)
 * Operational interface for Chefs and Kitchen Supervisors to execute prep batches,
 * record actual ingredients consumed and actual portions produced, and monitor yield %.
 * Strictly posts idempotent ACTUAL_CONSUMPTION movements without exposing financial P&L jargon.
 */

import { productionBatchModel } from '../../../../../businessos/platform/kitchen/productionBatchModel.js';
import { recipeModel } from '../../../../../businessos/platform/kitchen/recipeModel.js';
import { inventoryItemModel } from '../../../../../businessos/platform/inventory/inventoryItemModel.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

export class KitchenProductionView {
  constructor(deps = {}) {
    this.container = null;
    this.mountEl = null;
    this.selectedBatchId = null;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
  }

  render(mountEl, sessionUser = null) {
    this.mountEl = mountEl;
    this.container = document.createElement('div');
    this.container.className = 'kitchen-production-workspace animate-fade-in';
    this.container.style.cssText = 'display:flex; flex-direction:column; width:100%; height:100%; background:var(--bg-base); color:var(--text-primary); overflow:hidden; font-family:var(--font-family, sans-serif);';

    this.subscribePlatformEvents();
    this.updateContent(sessionUser);

    if (mountEl) {
      mountEl.innerHTML = '';
      mountEl.appendChild(this.container);
    }
    return this.container;
  }

  subscribePlatformEvents() {
    const refresh = () => {
      if (this.container && document.body.contains(this.container)) {
        this.updateContent();
      }
    };
    this.unsubscribeEvents = [
      platformEventBus.subscribe('kitchen:batch:created', refresh),
      platformEventBus.subscribe('kitchen:batch:completed', refresh),
      platformEventBus.subscribe('data:changed', refresh)
    ];
  }

  updateContent(sessionUser = null) {
    if (!this.container) return;

    const batches = productionBatchModel.getAllBatches();
    const user = sessionUser || { name: 'Chef Suresh', role: 'Head Chef' };

    const runningCount = batches.filter(b => b.status === 'PLANNED').length;
    const completedCount = batches.filter(b => b.status === 'COMPLETED').length;
    const exceptionCount = batches.filter(b => b.status === 'COMPLETED' && b.yieldPercent < 95.0).length;

    this.container.innerHTML = `
      <!-- KITCHEN PRODUCTION HEADER -->
      <header style="padding:14px 24px; background:var(--bg-surface-1); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="width:38px; height:38px; border-radius:10px; background:linear-gradient(135deg, #f59e0b, #d97706); display:flex; align-items:center; justify-content:center; font-size:1.2rem; font-weight:800; color:#fff; box-shadow:0 4px 12px rgba(245,158,11,0.3);">🍳</div>
          <div>
            <h1 style="margin:0; font-size:1.2rem; font-weight:800; letter-spacing:-0.02em; display:flex; align-items:center; gap:8px;">
              Anchor Kitchen OS <span class="badge badge-warning" style="font-size:0.7rem; padding:2px 8px;">PRODUCTION BATCH CONTROL</span>
            </h1>
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">Recipe Prep Batches, Actual Portion Capture &amp; Yield Tracking</div>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:12px;">
          <button id="btn-open-new-batch-modal" class="btn-primary" style="padding:8px 16px; font-weight:800; font-size:0.85rem; background:var(--accent-primary); color:#000; border:none; border-radius:8px; cursor:pointer;">
            ➕ Start New Production Batch
          </button>
          <div style="padding:6px 12px; background:var(--bg-surface-2); border-radius:8px; border:1px solid var(--border-subtle); font-size:0.85rem; font-weight:700;">
            👨‍🍳 Chef: ${user.name}
          </div>
        </div>
      </header>

      <!-- BODY CONTENT -->
      <main style="flex:1; padding:24px; overflow-y:auto; background:var(--bg-base);">
        <div style="display:flex; flex-direction:column; gap:20px; max-width:1100px; margin:0 auto;">
          
          <!-- TODAY'S PRODUCTION KPI STRIP -->
          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:16px;">
            <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #3b82f6; border-radius:8px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">TOTAL BATCHES</div>
              <div style="font-size:1.6rem; font-weight:800; color:#3b82f6; margin-top:2px;">${batches.length} Batches</div>
            </div>

            <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #f59e0b; border-radius:8px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">IN PROGRESS (RUNNING)</div>
              <div style="font-size:1.6rem; font-weight:800; color:#f59e0b; margin-top:2px;">${runningCount} Running</div>
            </div>

            <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #10b981; border-radius:8px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">COMPLETED BATCHES</div>
              <div style="font-size:1.6rem; font-weight:800; color:#10b981; margin-top:2px;">${completedCount} Completed</div>
            </div>

            <div class="card" style="padding:16px; background:var(--bg-surface-1); border-left:4px solid #ef4444; border-radius:8px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">YIELD EXCEPTIONS (&lt;95%)</div>
              <div style="font-size:1.6rem; font-weight:800; color:#ef4444; margin-top:2px;">${exceptionCount} Exceptions</div>
            </div>
          </div>

          <!-- PRODUCTION BATCHES TABLE -->
          <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-subtle);">
            <div style="padding:14px 20px; background:var(--bg-surface-2); font-weight:800; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
              <span>Kitchen Production Worksheets</span>
              <span style="font-size:0.82rem; color:var(--text-muted);">Click any batch to enter actual output &amp; complete prep</span>
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
              <thead>
                <tr style="background:var(--bg-surface-2); border-bottom:2px solid var(--border-subtle); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                  <th style="padding:12px 16px;">Batch Number</th>
                  <th style="padding:12px 16px;">Recipe</th>
                  <th style="padding:12px 16px;">Station</th>
                  <th style="padding:12px 16px; text-align:right;">Planned Portions</th>
                  <th style="padding:12px 16px; text-align:right;">Actual Portions</th>
                  <th style="padding:12px 16px; text-align:center;">Yield %</th>
                  <th style="padding:12px 16px; text-align:center;">Status</th>
                  <th style="padding:12px 16px; text-align:center;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${batches.map(b => `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:12px 16px; font-weight:800; color:var(--accent-primary);">${b.batchNumber}</td>
                    <td style="padding:12px 16px; font-weight:700;">${b.recipeName}</td>
                    <td style="padding:12px 16px;"><span class="badge badge-info">${b.station || 'Curry Station'}</span></td>
                    <td style="padding:12px 16px; text-align:right; font-weight:700;">${b.plannedPortions}</td>
                    <td style="padding:12px 16px; text-align:right; font-weight:800; color:${b.actualPortionsProduced > 0 ? '#10b981' : 'var(--text-muted)'};">
                      ${b.actualPortionsProduced || '—'}
                    </td>
                    <td style="padding:12px 16px; text-align:center;">
                      ${b.yieldPercent > 0 ? `
                        <span class="badge ${b.yieldPercent >= 95 ? 'badge-success' : 'badge-danger'}" style="font-weight:800;">
                          ${b.yieldPercent}%
                        </span>
                      ` : '—'}
                    </td>
                    <td style="padding:12px 16px; text-align:center;">
                      <span class="badge ${b.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}">${b.status}</span>
                    </td>
                    <td style="padding:12px 16px; text-align:center;">
                      <button class="btn-secondary btn-inspect-batch" data-batch-id="${b.id}" style="padding:4px 10px; font-weight:700; font-size:0.75rem;">
                        ${b.status === 'PLANNED' ? '🍳 Execute Batch' : '🔍 Details'}
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

        </div>
      </main>

      <!-- BATCH EXECUTION MODAL -->
      ${this.selectedBatchId ? this.renderBatchExecutionModal() : ''}
    `;

    this.bindEvents();
  }

  renderBatchExecutionModal() {
    const batch = productionBatchModel.getAllBatches().find(b => b.id === this.selectedBatchId);
    if (!batch) return '';

    const isPlanned = batch.status === 'PLANNED';

    return `
      <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999; backdrop-filter:blur(4px);">
        <div class="card animate-fade-in" style="width:90%; max-width:800px; max-height:85vh; overflow-y:auto; padding:24px; background:var(--bg-surface-1); border-radius:12px;">
          
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:12px; margin-bottom:16px;">
            <h3 style="margin:0; font-size:1.2rem; font-weight:800; display:flex; align-items:center; gap:8px;">
              <span>🍳</span> Kitchen Batch Worksheet — ${batch.batchNumber} (${batch.recipeName})
            </h3>
            <button id="btn-close-batch-modal" class="btn-secondary" style="padding:4px 10px; font-weight:700;">✕ Close</button>
          </div>

          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:20px;">
            <div style="padding:12px; background:var(--bg-surface-2); border-radius:8px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">STATION</div>
              <div style="font-size:1.1rem; font-weight:800; color:var(--accent-primary); margin-top:2px;">${batch.station}</div>
            </div>

            <div style="padding:12px; background:var(--bg-surface-2); border-radius:8px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">PLANNED PORTIONS</div>
              <div style="font-size:1.4rem; font-weight:800; color:#3b82f6; margin-top:2px;">${batch.plannedPortions} Portions</div>
            </div>

            <div style="padding:12px; background:var(--bg-surface-2); border-radius:8px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">PLANNED COST / PORTION</div>
              <div style="font-size:1.4rem; font-weight:800; color:#10b981; margin-top:2px;">₹${batch.plannedCostPerPortion.toFixed(2)}</div>
            </div>
          </div>

          <!-- INGREDIENTS TABLE -->
          <h4 style="margin:0 0 10px; font-size:0.95rem; font-weight:800;">Batch Ingredients Consumption Worksheet</h4>
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem; margin-bottom:20px;">
            <thead>
              <tr style="background:var(--bg-surface-2); text-align:left; color:var(--text-secondary); font-size:0.75rem;">
                <th style="padding:10px;">Ingredient</th>
                <th style="padding:10px; text-align:right;">Planned Usage</th>
                <th style="padding:10px; text-align:right;">Actual Usage Input</th>
              </tr>
            </thead>
            <tbody>
              ${batch.plannedIngredients.map(ing => `
                <tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:10px; font-weight:700;">${ing.name}</td>
                  <td style="padding:10px; text-align:right; font-weight:800;">${ing.plannedQty} ${ing.unit}</td>
                  <td style="padding:10px; text-align:right;">
                    ${isPlanned ? `
                      <input class="input-field actual-ing-input" data-ing-id="${ing.inventoryItemId}" type="number" step="0.1" value="${(ing.plannedQty * 1.05).toFixed(1)}" style="width:110px; text-align:right; padding:6px; font-weight:800;" />
                      <span style="font-weight:700; font-size:0.8rem; margin-left:4px;">${ing.unit}</span>
                    ` : `
                      <span style="font-weight:800; color:#10b981;">${ing.plannedQty} ${ing.unit}</span>
                    `}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          ${isPlanned ? `
            <div style="display:flex; flex-direction:column; gap:12px; background:var(--bg-surface-2); padding:16px; border-radius:8px;">
              <div>
                <label style="font-weight:700; font-size:0.85rem; color:var(--text-secondary); display:block; margin-bottom:6px;">ACTUAL USABLE PORTIONS PRODUCED</label>
                <input id="input-actual-portions" class="input-field" type="number" value="92" style="width:100%; padding:10px; font-size:1rem; font-weight:800;" />
              </div>

              <button id="btn-complete-batch-submit" data-batch-id="${batch.id}" class="btn-primary" style="padding:12px; font-weight:800; font-size:0.95rem; background:#10b981; color:#fff; border:none; border-radius:8px; cursor:pointer;">
                ✅ Complete Batch &amp; Post ACTUAL_CONSUMPTION Movements
              </button>
            </div>
          ` : `
            <div style="padding:14px; background:rgba(16,185,129,0.1); border-left:4px solid #10b981; border-radius:6px;">
              <div style="font-weight:800; color:#10b981;">COMPLETED BATCH ANALYSIS</div>
              <div style="font-size:0.85rem; margin-top:4px;">Actual Portions Produced: <strong>${batch.actualPortionsProduced}</strong> (Yield: <strong>${batch.yieldPercent}%</strong>)</div>
              <div style="font-size:0.85rem; margin-top:2px;">Actual Cost / Usable Portion: <strong>₹${batch.actualCostPerPortion.toFixed(2)}</strong> (Unit Leakage: <strong style="color:#ef4444;">+₹${batch.unitCostLeakage.toFixed(2)}</strong>)</div>
            </div>
          `}

        </div>
      </div>
    `;
  }

  bindEvents() {
    // Open Batch Inspector
    this.container.querySelectorAll('.btn-inspect-batch').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedBatchId = btn.dataset.batchId;
        this.updateContent();
      });
    });

    // Close Modal
    const btnClose = this.container.querySelector('#btn-close-batch-modal');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        this.selectedBatchId = null;
        this.updateContent();
      });
    }

    // Complete Batch Submit with Idempotency
    const btnComplete = this.container.querySelector('#btn-complete-batch-submit');
    if (btnComplete) {
      btnComplete.addEventListener('click', () => {
        const batchId = btnComplete.dataset.batchId;
        const actualPortions = this.container.querySelector('#input-actual-portions').value;

        const inputs = this.container.querySelectorAll('.actual-ing-input');
        const actualIngredientsUsed = [];
        inputs.forEach(inp => {
          actualIngredientsUsed.push({
            inventoryItemId: inp.dataset.ingId,
            actualQty: parseFloat(inp.value) || 0
          });
        });

        const completed = productionBatchModel.completeProductionBatch({
          batchId,
          actualPortionsProduced: actualPortions,
          actualIngredientsUsed,
          chefName: 'Chef Suresh'
        });

        alert(`🍳 Batch ${completed.batchNumber} COMPLETED! Yield: ${completed.yieldPercent}%. Posted ACTUAL_CONSUMPTION movements to stock ledger.`);
        this.selectedBatchId = null;
        this.updateContent();
      });
    }

    // Start New Batch Modal
    const btnNewBatch = this.container.querySelector('#btn-open-new-batch-modal');
    if (btnNewBatch) {
      btnNewBatch.addEventListener('click', () => {
        const batch = productionBatchModel.createProductionBatch({
          recipeId: 'rec_butter_chicken',
          plannedPortions: 100,
          station: 'Curry Station',
          plannedBy: 'Head Chef'
        });
        alert(`🍳 Created New Batch ${batch.batchNumber} for 100 Portions!`);
        this.updateContent();
      });
    }
  }
}
