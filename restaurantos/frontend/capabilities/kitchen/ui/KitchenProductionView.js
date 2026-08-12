/**
 * BusinessOS / RestaurantOS - Kitchen Domain UI (K-04 Kitchen Production Engine)
 * Production BOM Builder & Execution Engine with Inventory Shortage Guards,
 * 1-Click Main Warehouse Stock Requisition Reorder, and Stock Transfer/PO Fulfillment.
 */

import { productionModel } from '../../../../../businessos/platform/kitchen/productionModel.js';
import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';

export class KitchenProductionView {
  constructor() {
    this.activeTab = 'DASHBOARD'; // DASHBOARD | BOMS | NEW_BATCH | ACTIVE | REQUISITIONS | HISTORY
    this.selectedBomId = null;
    this.newBatchTargetQty = 5;
    this.completingBatchId = null;
    this.isCreatingBom = false;

    // Draft BOM form state
    this.draftBom = {
      id: null,
      inventoryItemCode: '',
      inventoryItemName: '',
      bomCode: '',
      standardYieldQuantity: 5,
      standardYieldUom: 'KG',
      version: 'v1.0',
      status: 'APPROVED',
      ingredients: []
    };
  }

  render(mount, session) {
    const tenantId = session ? session.tenantId : null;
    const batches = productionModel.getBatches(tenantId);
    const activeBatchesCount = batches.filter(b => b.status === 'IN_PROGRESS').length;
    const requisitions = productionModel.getStockRequisitions(tenantId);
    const pendingReqCount = requisitions.filter(r => r.status === 'PENDING_WAREHOUSE_FULFILLMENT').length;

    mount.innerHTML = `
      <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px; padding-bottom:40px;">
        <!-- Header & Nav Bar -->
        <div class="card" style="background:var(--bg-surface-1); padding:20px; border:1px solid var(--border-subtle);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">👨‍🍳 CHEF WORKSPACE — TAB 4</div>
              <h2 style="font-size:1.6rem; margin-top:2px;">🥘 Kitchen Production & Preparation Engine</h2>
              <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">
                Manufacturing screen for semi-finished inventory preps. Execute approved preparation BOMs, manage stock requisitions & track yield.
              </p>
            </div>
            <div style="display:flex; gap:10px;">
              <button id="btn-hdr-define-bom" class="btn-secondary" style="padding:10px 16px; font-weight:700;">
                📋 Define Prep BOM
              </button>
              <button id="btn-hdr-new-batch" class="btn-primary" style="padding:10px 18px; font-weight:700;">
                ➕ New Batch
              </button>
            </div>
          </div>

          <!-- Navigation Sub-Tabs -->
          <div style="display:flex; gap:8px; margin-top:16px; border-top:1px solid var(--border-subtle); padding-top:16px; flex-wrap:wrap;">
            <button class="btn-secondary prod-nav-btn ${this.activeTab === 'DASHBOARD' ? 'active' : ''}" data-t="DASHBOARD">
              📊 Production Dashboard
            </button>
            <button class="btn-secondary prod-nav-btn ${this.activeTab === 'BOMS' ? 'active' : ''}" data-t="BOMS">
              📋 Preparation BOMs
            </button>
            <button class="btn-secondary prod-nav-btn ${this.activeTab === 'NEW_BATCH' ? 'active' : ''}" data-t="NEW_BATCH">
              ➕ New Batch
            </button>
            <button class="btn-secondary prod-nav-btn ${this.activeTab === 'ACTIVE' ? 'active' : ''}" data-t="ACTIVE">
              🔄 Active Batches (${activeBatchesCount})
            </button>
            <button class="btn-secondary prod-nav-btn ${this.activeTab === 'REQUISITIONS' ? 'active' : ''}" data-t="REQUISITIONS">
              📦 Stock Requisitions ${pendingReqCount > 0 ? `<span class="badge badge-warning" style="margin-left:4px; font-size:0.75rem;">${pendingReqCount} Pending</span>` : ''}
            </button>
            <button class="btn-secondary prod-nav-btn ${this.activeTab === 'HISTORY' ? 'active' : ''}" data-t="HISTORY">
              📜 Production History
            </button>
          </div>
        </div>

        <!-- Main Content Area -->
        <div id="production-tab-content"></div>
      </div>
    `;

    mount.querySelectorAll('.prod-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.t;
        this.isCreatingBom = false;
        this.renderTabContent(mount.querySelector('#production-tab-content'), session, tenantId);
        mount.querySelectorAll('.prod-nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    const hdrDefineBtn = mount.querySelector('#btn-hdr-define-bom');
    if (hdrDefineBtn) {
      hdrDefineBtn.addEventListener('click', () => {
        this.startNewBom();
        this.activeTab = 'BOMS';
        this.renderTabContent(mount.querySelector('#production-tab-content'), session, tenantId);
        mount.querySelectorAll('.prod-nav-btn').forEach(b => b.classList.remove('active'));
        const bNav = mount.querySelector('.prod-nav-btn[data-t="BOMS"]');
        if (bNav) bNav.classList.add('active');
      });
    }

    const hdrBatchBtn = mount.querySelector('#btn-hdr-new-batch');
    if (hdrBatchBtn) {
      hdrBatchBtn.addEventListener('click', () => {
        this.activeTab = 'NEW_BATCH';
        this.renderTabContent(mount.querySelector('#production-tab-content'), session, tenantId);
        mount.querySelectorAll('.prod-nav-btn').forEach(b => b.classList.remove('active'));
        const bNav = mount.querySelector('.prod-nav-btn[data-t="NEW_BATCH"]');
        if (bNav) bNav.classList.add('active');
      });
    }

    this.renderTabContent(mount.querySelector('#production-tab-content'), session, tenantId);
  }

  startNewBom() {
    this.isCreatingBom = true;
    this.draftBom = {
      id: null,
      inventoryItemCode: '',
      inventoryItemName: '',
      bomCode: `PREP-SF-${Math.floor(1000 + Math.random() * 9000)}`,
      standardYieldQuantity: 5,
      standardYieldUom: 'KG',
      version: 'v1.0',
      status: 'APPROVED',
      ingredients: []
    };
  }

  renderTabContent(container, session, tenantId) {
    if (!container) return;

    if (this.activeTab === 'DASHBOARD') {
      this.renderDashboard(container, session, tenantId);
    } else if (this.activeTab === 'BOMS') {
      this.renderBoms(container, session, tenantId);
    } else if (this.activeTab === 'NEW_BATCH') {
      this.renderNewBatch(container, session, tenantId);
    } else if (this.activeTab === 'ACTIVE') {
      this.renderActiveBatches(container, session, tenantId);
    } else if (this.activeTab === 'REQUISITIONS') {
      this.renderRequisitions(container, session, tenantId);
    } else if (this.activeTab === 'HISTORY') {
      this.renderHistory(container, session, tenantId);
    }
  }

  // --- 1. DASHBOARD TAB ---
  renderDashboard(container, session, tenantId) {
    const batches = productionModel.getBatches(tenantId);
    const activeBatches = batches.filter(b => b.status === 'IN_PROGRESS');
    const completedBatches = batches.filter(b => b.status === 'COMPLETED');
    const boms = productionModel.getPrepBoms(tenantId);
    const requisitions = productionModel.getStockRequisitions(tenantId);
    const pendingReqs = requisitions.filter(r => r.status === 'PENDING_WAREHOUSE_FULFILLMENT');

    const totalToday = batches.length;
    const completedCount = completedBatches.length;

    let avgYield = '—';
    if (completedBatches.length > 0) {
      const sumYield = completedBatches.reduce((acc, b) => acc + (b.yieldPercent || 100), 0);
      avgYield = (sumYield / completedBatches.length).toFixed(1) + '%';
    }

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <!-- KPI Cards -->
        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px;">
          <div class="card" style="background:var(--bg-surface-1); padding:16px; text-align:center;">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">PREP BOMS DEFINED</div>
            <div style="font-size:1.6rem; font-weight:800; color:var(--text-main); margin-top:4px;">${boms.length}</div>
          </div>
          <div class="card" style="background:var(--bg-surface-1); padding:16px; text-align:center; border-left:3px solid var(--status-warning);">
            <div style="font-size:0.7rem; color:var(--status-warning); font-weight:700; text-transform:uppercase;">IN PROGRESS BATCHES</div>
            <div style="font-size:1.6rem; font-weight:800; color:var(--status-warning); margin-top:4px;">${activeBatches.length}</div>
          </div>
          <div class="card" style="background:var(--bg-surface-1); padding:16px; text-align:center; border-left:3px solid var(--status-info);">
            <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">PENDING REQUISITIONS</div>
            <div style="font-size:1.6rem; font-weight:800; color:${pendingReqs.length > 0 ? 'var(--status-warning)' : 'var(--text-main)'}; margin-top:4px;">${pendingReqs.length}</div>
          </div>
          <div class="card" style="background:var(--bg-surface-1); padding:16px; text-align:center; border-left:3px solid var(--status-success);">
            <div style="font-size:0.7rem; color:var(--status-success); font-weight:700; text-transform:uppercase;">COMPLETED BATCHES</div>
            <div style="font-size:1.6rem; font-weight:800; color:var(--status-success); margin-top:4px;">${completedCount}</div>
          </div>
        </div>

        <!-- Pending Requisitions Alert Banner -->
        ${pendingReqs.length > 0 ? `
          <div class="card" style="background:rgba(234, 179, 8, 0.1); border:1px solid var(--status-warning); padding:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <h4 style="font-size:0.95rem; margin:0; color:var(--status-warning); font-weight:700;">📦 ${pendingReqs.length} Pending Stock Requisitions awaiting Main Warehouse fulfillment</h4>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                  Requisitions must be transferred or fulfilled by Inventory Manager before batches can be executed.
                </div>
              </div>
              <button class="btn-secondary btn-go-tab" data-target="REQUISITIONS" style="font-size:0.8rem; font-weight:700;">View Requisitions →</button>
            </div>
          </div>
        ` : ''}

        <!-- In-Progress Active Batches Section -->
        <div class="card" style="background:var(--bg-surface-1); padding:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="font-size:1.1rem; margin:0;">🔄 Active Production Batches (${activeBatches.length})</h3>
            <button class="btn-secondary btn-go-tab" data-target="ACTIVE" style="font-size:0.8rem; padding:6px 12px;">View All Active Batches →</button>
          </div>

          ${activeBatches.length > 0 ? `
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:16px;">
              ${activeBatches.map(b => `
                <div class="card" style="background:var(--bg-surface-2); padding:16px; border:1px solid var(--border-subtle);">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                      <span class="badge badge-info" style="font-size:0.75rem;">${b.batchCode}</span>
                      <h4 style="font-size:1.05rem; margin:6px 0 2px; font-weight:700;">${b.inventoryItemName}</h4>
                      <div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${b.inventoryItemCode} • ${b.prepBomCode}</div>
                    </div>
                    <span class="badge badge-warning" style="font-size:0.75rem;">IN PROGRESS</span>
                  </div>

                  <div style="margin-top:14px; font-size:0.85rem; display:flex; justify-content:space-between; border-top:1px solid var(--border-subtle); padding-top:10px;">
                    <div>Target: <strong>${b.targetQuantity} ${b.targetUom}</strong></div>
                    <div>Started: <strong>${new Date(b.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></div>
                  </div>

                  <button class="btn-primary btn-complete-batch-modal" data-id="${b.id}" style="width:100%; margin-top:12px; padding:8px; font-weight:700; font-size:0.85rem;">
                    ⚡ Complete Batch & Post Stock
                  </button>
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="text-align:center; padding:30px; color:var(--text-muted);">
              <div style="font-size:1.5rem; margin-bottom:6px;">✨ No Batches In Progress</div>
              <div>Define a preparation BOM and click <strong>"New Batch"</strong> to start production.</div>
            </div>
          `}
        </div>

        <!-- Quick Start Section -->
        ${boms.length === 0 ? `
          <div class="card" style="background:var(--bg-surface-1); padding:24px; text-align:center;">
            <div style="font-size:2.2rem; margin-bottom:8px;">📋</div>
            <h3 style="font-size:1.2rem; margin:0 0 6px;">Step 1: Define Your Preparation BOMs</h3>
            <p style="color:var(--text-muted); font-size:0.875rem; max-width:500px; margin:0 auto 16px;">
              Production batches require an approved preparation recipe (masala pastes, gravies, marinades). Define your preparation BOM first.
            </p>
            <button id="btn-dash-create-bom" class="btn-primary" style="padding:10px 20px; font-weight:700;">
              ➕ Define Preparation BOM Now
            </button>
          </div>
        ` : ''}
      </div>
    `;

    container.querySelectorAll('.btn-go-tab').forEach(b => {
      b.addEventListener('click', () => {
        this.activeTab = b.dataset.target;
        this.render(container.closest('.animate-fade-in').parentNode, session);
      });
    });

    const dashCreateBom = container.querySelector('#btn-dash-create-bom');
    if (dashCreateBom) {
      dashCreateBom.addEventListener('click', () => {
        this.startNewBom();
        this.activeTab = 'BOMS';
        this.render(container.closest('.animate-fade-in').parentNode, session);
      });
    }

    container.querySelectorAll('.btn-complete-batch-modal').forEach(b => {
      b.addEventListener('click', () => {
        this.completingBatchId = b.dataset.id;
        this.activeTab = 'ACTIVE';
        this.render(container.closest('.animate-fade-in').parentNode, session);
      });
    });
  }

  // --- 2. PREPARATION BOMS TAB ---
  renderBoms(container, session, tenantId) {
    if (this.isCreatingBom) {
      this.renderBomEditorForm(container, session, tenantId);
      return;
    }

    const boms = productionModel.getPrepBoms(tenantId);

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div class="card" style="background:var(--bg-surface-1); padding:16px 20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="font-size:1.1rem; margin:0;">📋 Preparation BOM Templates</h3>
              <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                Standardized manufacturing recipes for semi-finished inventory preps.
              </div>
            </div>
            <button id="btn-define-bom-trigger" class="btn-primary" style="padding:8px 18px; font-weight:700;">
              ➕ Define Preparation BOM
            </button>
          </div>
        </div>

        ${boms.length > 0 ? `
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:16px;">
            ${boms.map(bom => `
              <div class="card" style="background:var(--bg-surface-1); padding:20px; border:1px solid var(--border-subtle);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                  <div>
                    <span class="badge badge-info">${bom.bomCode}</span>
                    <h4 style="font-size:1.1rem; margin:6px 0 2px; font-weight:700;">${bom.inventoryItemName}</h4>
                    <div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">Item Code: ${bom.inventoryItemCode} • Version: ${bom.version || 'v1.0'}</div>
                  </div>
                  <span class="badge ${bom.status === 'APPROVED' ? 'badge-success' : 'badge-warning'}">
                    ${bom.status === 'APPROVED' ? '🔒 APPROVED' : '📝 DRAFT'}
                  </span>
                </div>

                <div style="margin-top:14px; padding:10px; background:var(--bg-surface-2); border-radius:6px; font-size:0.85rem;">
                  <div>Standard Batch Yield: <strong>${bom.standardYieldQuantity} ${bom.standardYieldUom}</strong></div>
                  <div style="color:var(--text-muted); margin-top:2px;">Raw Ingredients Count: <strong>${bom.ingredients.length} items</strong></div>
                </div>

                <div style="margin-top:14px;">
                  <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">PREPARATION INGREDIENTS</div>
                  <div style="display:flex; flex-direction:column; gap:4px;">
                    ${bom.ingredients.map(ing => `
                      <div style="font-size:0.8rem; display:flex; justify-content:space-between; color:var(--text-secondary);">
                        <span>• ${ing.inventoryItemName}</span>
                        <strong>${ing.recipeQty} ${ing.recipeUom}</strong>
                      </div>
                    `).join('')}
                  </div>
                </div>

                <div style="margin-top:16px; display:flex; gap:8px;">
                  ${bom.status === 'APPROVED' ? `
                    <button class="btn-primary btn-launch-batch-from-bom" data-bom-id="${bom.id}" style="flex:1; padding:8px; font-size:0.8rem; font-weight:700;">
                      🚀 Start Batch
                    </button>
                    <button class="btn-secondary btn-edit-bom" data-bom-id="${bom.id}" style="padding:8px 12px; font-size:0.8rem; font-weight:600;">
                      ✏️ Edit
                    </button>
                  ` : `
                    <button class="btn-secondary btn-edit-bom" data-bom-id="${bom.id}" style="flex:1; padding:8px; font-size:0.8rem; font-weight:700;">
                      ✏️ Edit Draft BOM
                    </button>
                    <button class="btn-primary btn-approve-draft-bom" data-bom-id="${bom.id}" style="padding:8px 12px; font-size:0.8rem; font-weight:700; background:var(--status-success);">
                      🔒 Approve
                    </button>
                  `}
                  <button class="btn-secondary btn-delete-bom" data-bom-id="${bom.id}" style="padding:8px; font-size:0.8rem; color:var(--status-danger);">
                    🗑️
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="card" style="background:var(--bg-surface-1); padding:40px; text-align:center; color:var(--text-muted);">
            <div style="font-size:2.5rem; margin-bottom:8px;">📋</div>
            <h3 style="font-size:1.2rem; color:var(--text-main); margin:0 0 6px;">No Preparation BOMs Defined Yet</h3>
            <p style="font-size:0.875rem; max-width:480px; margin:0 auto 16px;">
              Define standard manufacturing recipes for your semi-finished items (masala pastes, sauces, marinades) before executing production batches.
            </p>
            <button id="btn-create-first-bom" class="btn-primary" style="padding:10px 20px; font-weight:700;">
              ➕ Define Preparation BOM
            </button>
          </div>
        `}
      </div>
    `;

    const triggerBtn = container.querySelector('#btn-define-bom-trigger');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', () => {
        this.startNewBom();
        this.renderBoms(container, session, tenantId);
      });
    }

    const firstBtn = container.querySelector('#btn-create-first-bom');
    if (firstBtn) {
      firstBtn.addEventListener('click', () => {
        this.startNewBom();
        this.renderBoms(container, session, tenantId);
      });
    }

    container.querySelectorAll('.btn-edit-bom').forEach(btn => {
      btn.addEventListener('click', () => {
        const bom = productionModel.getPrepBomById(btn.dataset.bomId, tenantId);
        if (bom) {
          this.draftBom = JSON.parse(JSON.stringify(bom));
          this.isCreatingBom = true;
          this.renderBoms(container, session, tenantId);
        }
      });
    });

    container.querySelectorAll('.btn-approve-draft-bom').forEach(btn => {
      btn.addEventListener('click', () => {
        productionModel.approvePrepBom(btn.dataset.bomId, tenantId);
        alert('🎉 Preparation BOM Approved & Locked successfully!');
        this.renderBoms(container, session, tenantId);
      });
    });

    container.querySelectorAll('.btn-launch-batch-from-bom').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedBomId = btn.dataset.bomId;
        this.activeTab = 'NEW_BATCH';
        this.render(container.closest('.animate-fade-in').parentNode, session);
      });
    });

    container.querySelectorAll('.btn-delete-bom').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Delete this preparation BOM template?')) {
          productionModel.deletePrepBom(btn.dataset.bomId, tenantId);
          this.renderBoms(container, session, tenantId);
        }
      });
    });
  }

  // --- PREPARATION BOM EDITOR FORM ---
  renderBomEditorForm(container, session, tenantId) {
    const masterInv = offlineStore.getCollection('inventory', tenantId) || [];

    let sfItems = masterInv.filter(i => {
      const type = (i.itemType || i.item_type || i.category || '').toLowerCase();
      const code = (i.itemCode || i.item_code || i.id || '').toLowerCase();
      return type.includes('semi') || type.includes('prep') || code.startsWith('sf');
    });

    if (sfItems.length === 0) {
      sfItems = masterInv;
    }

    container.innerHTML = `
      <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:24px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:14px; margin-bottom:20px;">
          <div>
            <h3 style="font-size:1.3rem; margin:0; font-weight:700;">
              ${this.draftBom.id ? '✏️ Edit Preparation BOM' : '📋 Define New Preparation BOM'}
            </h3>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
              Specify standard batch yield and raw material ingredients for semi-finished inventory prep.
            </div>
          </div>
          <button id="btn-cancel-bom-edit" class="btn-secondary" style="padding:8px 14px; font-weight:600;">✕ Cancel</button>
        </div>

        <form id="form-prep-bom" style="display:flex; flex-direction:column; gap:18px;">
          <!-- Item & Yield Configuration -->
          <div style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap:16px; align-items:end;">
            <div>
              <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">SELECT SEMI-FINISHED ITEM FROM INVENTORY *</label>
              <select id="inp-bom-item" style="width:100%; padding:10px;" required>
                <option value="">-- Select Semi-Finished Item --</option>
                ${sfItems.map(inv => {
                  const c = inv.itemCode || inv.item_code || inv.id || inv._id || '';
                  const n = inv.itemName || inv.item_name || 'Item';
                  const u = inv.baseUom || inv.base_uom || 'KG';
                  const isSel = String(c) === String(this.draftBom.inventoryItemCode);
                  return `<option value="${c}" data-name="${n}" data-uom="${u}" ${isSel ? 'selected' : ''}>${c} — ${n} (Base UOM: ${u})</option>`;
                }).join('')}
              </select>
            </div>

            <div>
              <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">AUTO BOM CODE *</label>
              <input type="text" id="inp-bom-code" value="${this.draftBom.bomCode || ''}" style="width:100%; padding:10px; font-weight:700;" required>
            </div>

            <div>
              <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">STD BATCH YIELD *</label>
              <input type="number" id="inp-bom-yield-qty" value="${this.draftBom.standardYieldQuantity || 5}" step="0.1" style="width:100%; padding:10px; font-weight:700;" required>
            </div>

            <div>
              <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">YIELD UOM</label>
              <select id="inp-bom-yield-uom" style="width:100%; padding:10px; font-weight:700;">
                <option value="KG" ${this.draftBom.standardYieldUom === 'KG' ? 'selected' : ''}>KG</option>
                <option value="LTR" ${this.draftBom.standardYieldUom === 'LTR' ? 'selected' : ''}>LTR</option>
                <option value="PCS" ${this.draftBom.standardYieldUom === 'PCS' ? 'selected' : ''}>PCS</option>
                <option value="TRAY" ${this.draftBom.standardYieldUom === 'TRAY' ? 'selected' : ''}>TRAY</option>
              </select>
            </div>
          </div>

          <!-- Raw Material Ingredients Table -->
          <div style="border-top:1px solid var(--border-subtle); padding-top:16px;">
            <div style="font-size:0.85rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">RAW MATERIAL INGREDIENTS REQUIRED</div>
            
            <div class="table-responsive">
              <table class="data-table" style="width:100%;">
                <thead>
                  <tr style="font-size:0.8rem; color:var(--text-muted);">
                    <th>Raw Material Ingredient</th>
                    <th>Recipe Qty</th>
                    <th>Recipe UOM</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody id="tb-bom-ingredients">
                  ${this.draftBom.ingredients.length > 0 ? this.draftBom.ingredients.map((ing, idx) => `
                    <tr>
                      <td style="font-weight:700;">${ing.inventoryItemName} (${ing.inventoryItemCode})</td>
                      <td>${ing.recipeQty}</td>
                      <td>${ing.recipeUom}</td>
                      <td><button type="button" class="btn-secondary btn-remove-draft-ing" data-idx="${idx}" style="padding:4px 8px; font-size:0.75rem; color:var(--status-danger);">✕ Remove</button></td>
                    </tr>
                  `).join('') : `
                    <tr>
                      <td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">
                        No raw material ingredients added yet. Add ingredients using the selector below.
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>

            <!-- Add Raw Material Line Form -->
            <div style="display:flex; gap:12px; margin-top:14px; padding:12px; background:var(--bg-surface-2); border-radius:6px; align-items:flex-end; flex-wrap:wrap;">
              <div style="flex:2; min-width:200px;">
                <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">SELECT RAW MATERIAL</label>
                <select id="sel-add-rm-item" style="width:100%; padding:8px;">
                  <option value="">-- Choose Raw Material --</option>
                  ${masterInv.map(inv => {
                    const c = inv.itemCode || inv.item_code || inv.id || inv._id || '';
                    const n = inv.itemName || inv.item_name || 'Item';
                    const u = inv.baseUom || inv.base_uom || 'KG';
                    return `<option value="${c}">${c} — ${n} (${u})</option>`;
                  }).join('')}
                </select>
              </div>

              <div style="width:100px;">
                <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">RECIPE QTY</label>
                <input type="number" id="inp-add-rm-qty" value="100" step="0.1" style="width:100%; padding:8px;">
              </div>

              <div style="width:100px;">
                <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">UOM</label>
                <select id="sel-add-rm-uom" style="width:100%; padding:8px;">
                  <option value="G">G (Grams)</option>
                  <option value="KG">KG</option>
                  <option value="ML">ML</option>
                  <option value="LTR">LTR</option>
                  <option value="PCS">PCS</option>
                </select>
              </div>

              <button type="button" id="btn-add-rm-to-bom" class="btn-primary" style="padding:8px 16px; font-weight:700;">
                ➕ Add Line
              </button>
            </div>
          </div>

          <!-- Bottom Action Buttons: Save Draft vs Approve BOM -->
          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-subtle); padding-top:16px; flex-wrap:wrap; gap:12px;">
            <button type="button" id="btn-cancel-bom-bottom" class="btn-secondary" style="padding:10px 18px; font-weight:600;">Cancel</button>
            <div style="display:flex; gap:12px;">
              <button type="button" id="btn-save-draft-bom" class="btn-secondary" style="padding:10px 20px; font-weight:700;">
                💾 Save Draft
              </button>
              <button type="button" id="btn-approve-bom" class="btn-primary" style="padding:10px 24px; font-weight:700; background:var(--status-success);">
                🔒 Approve Preparation BOM
              </button>
            </div>
          </div>
        </form>
      </div>
    `;

    const harvestStateFromDOM = () => {
      const selBomItem = container.querySelector('#inp-bom-item');
      if (selBomItem && selBomItem.value) {
        const opt = selBomItem.options[selBomItem.selectedIndex];
        this.draftBom.inventoryItemCode = selBomItem.value;
        this.draftBom.inventoryItemName = opt ? opt.dataset.name : '';
      }
      const codeInp = container.querySelector('#inp-bom-code');
      if (codeInp && codeInp.value) this.draftBom.bomCode = codeInp.value;

      const qtyInp = container.querySelector('#inp-bom-yield-qty');
      if (qtyInp && qtyInp.value) this.draftBom.standardYieldQuantity = parseFloat(qtyInp.value) || 5;

      const uomSel = container.querySelector('#inp-bom-yield-uom');
      if (uomSel && uomSel.value) this.draftBom.standardYieldUom = uomSel.value;
    };

    const cancelAction = () => {
      this.isCreatingBom = false;
      this.renderBoms(container, session, tenantId);
    };

    const c1 = container.querySelector('#btn-cancel-bom-edit');
    const c2 = container.querySelector('#btn-cancel-bom-bottom');
    if (c1) c1.addEventListener('click', cancelAction);
    if (c2) c2.addEventListener('click', cancelAction);

    const selBomItem = container.querySelector('#inp-bom-item');
    if (selBomItem) {
      selBomItem.addEventListener('change', (e) => {
        const opt = e.target.options[e.target.selectedIndex];
        if (opt && opt.value) {
          const itemCode = opt.value;
          this.draftBom.inventoryItemCode = itemCode;
          this.draftBom.inventoryItemName = opt.dataset.name || '';
          this.draftBom.bomCode = `PREP-${itemCode}`;
          this.draftBom.standardYieldUom = opt.dataset.uom || 'KG';

          container.querySelector('#inp-bom-code').value = this.draftBom.bomCode;
          container.querySelector('#inp-bom-yield-uom').value = this.draftBom.standardYieldUom;
        }
      });
    }

    container.querySelectorAll('.btn-remove-draft-ing').forEach(btn => {
      btn.addEventListener('click', (e) => {
        harvestStateFromDOM();
        const idx = parseInt(e.target.dataset.idx);
        this.draftBom.ingredients.splice(idx, 1);
        this.renderBomEditorForm(container, session, tenantId);
      });
    });

    const addRmBtn = container.querySelector('#btn-add-rm-to-bom');
    if (addRmBtn) {
      addRmBtn.addEventListener('click', () => {
        harvestStateFromDOM();

        const rmSel = container.querySelector('#sel-add-rm-item');
        const qtyInp = container.querySelector('#inp-add-rm-qty');
        const uomSel = container.querySelector('#sel-add-rm-uom');

        const code = rmSel ? rmSel.value : '';
        if (!code) {
          alert('❌ Please select a raw material ingredient.');
          return;
        }

        const invItem = masterInv.find(i => String(i.itemCode || i.item_code || i.id || i._id) === String(code));
        const name = invItem ? (invItem.itemName || invItem.item_name) : code;
        const baseUom = invItem ? (invItem.baseUom || invItem.base_uom || 'KG') : 'KG';
        const qty = parseFloat(qtyInp ? qtyInp.value : 100) || 100;
        const uom = uomSel ? uomSel.value : 'G';

        this.draftBom.ingredients.push({
          inventoryItemCode: code,
          inventoryItemName: name,
          recipeQty: qty,
          recipeUom: uom,
          baseUom
        });

        this.renderBomEditorForm(container, session, tenantId);
      });
    }

    const performSave = (status) => {
      harvestStateFromDOM();

      if (!this.draftBom.inventoryItemCode) {
        alert('❌ Please select a semi-finished item from Master Inventory.');
        return;
      }

      if (this.draftBom.ingredients.length === 0) {
        alert('❌ Please add at least 1 raw material ingredient to the BOM.');
        return;
      }

      const saved = productionModel.savePrepBom({
        id: this.draftBom.id,
        bomCode: this.draftBom.bomCode,
        inventoryItemCode: this.draftBom.inventoryItemCode,
        inventoryItemName: this.draftBom.inventoryItemName,
        standardYieldQuantity: this.draftBom.standardYieldQuantity,
        standardYieldUom: this.draftBom.standardYieldUom,
        version: this.draftBom.version || 'v1.0',
        status,
        ingredients: this.draftBom.ingredients,
        tenantId
      }, tenantId);

      const msg = status === 'APPROVED' ?
        `🎉 Preparation BOM "${saved.bomCode}" Approved & Locked Successfully!` :
        `💾 Draft Preparation BOM "${saved.bomCode}" Saved Successfully!`;

      alert(msg);
      this.isCreatingBom = false;
      this.renderBoms(container, session, tenantId);
    };

    const draftBtn = container.querySelector('#btn-save-draft-bom');
    if (draftBtn) {
      draftBtn.addEventListener('click', () => performSave('DRAFT'));
    }

    const approveBtn = container.querySelector('#btn-approve-bom');
    if (approveBtn) {
      approveBtn.addEventListener('click', () => performSave('APPROVED'));
    }
  }

  // --- 3. NEW PRODUCTION BATCH TAB (WITH SHORTAGE GUARD & REQUISITION ACTION) ---
  renderNewBatch(container, session, tenantId) {
    const allBoms = productionModel.getPrepBoms(tenantId);
    const boms = allBoms.filter(b => b.status === 'APPROVED');

    if (boms.length === 0) {
      container.innerHTML = `
        <div class="card" style="background:var(--bg-surface-1); padding:40px; text-align:center;">
          <div style="font-size:2.5rem; margin-bottom:8px;">📋</div>
          <h3 style="font-size:1.3rem; margin:0 0 8px;">No Approved Preparation BOM Available</h3>
          <p style="color:var(--text-muted); font-size:0.875rem; max-width:480px; margin:0 auto 16px;">
            Production batches require an approved preparation BOM. Please define or approve a Preparation BOM first.
          </p>
          <button id="btn-go-define-bom-now" class="btn-primary" style="padding:10px 20px; font-weight:700;">
            ➕ Define Preparation BOM Now
          </button>
        </div>
      `;

      const goDefineBtn = container.querySelector('#btn-go-define-bom-now');
      if (goDefineBtn) {
        goDefineBtn.addEventListener('click', () => {
          this.startNewBom();
          this.activeTab = 'BOMS';
          this.render(container.closest('.animate-fade-in').parentNode, session);
        });
      }
      return;
    }

    let activeBom = boms.find(b => b.id === this.selectedBomId) || boms[0];
    const targetQty = this.newBatchTargetQty || activeBom.standardYieldQuantity;
    const scalingFactor = targetQty / activeBom.standardYieldQuantity;

    const masterInv = offlineStore.getCollection('inventory', tenantId) || [];
    const stockBalances = offlineStore.getCollection('stock_balances', tenantId) || [];

    const ingredientRequirements = activeBom.ingredients.map(ing => {
      const lineCode = String(ing.inventoryItemCode || ing.inventory_item_code);
      const baseQty = ing.recipeUom === 'G' ? ing.recipeQty / 1000 : (ing.recipeUom === 'ML' ? ing.recipeQty / 1000 : ing.recipeQty);
      const scaledBaseQty = parseFloat((baseQty * scalingFactor).toFixed(4));
      const scaledRecipeQty = parseFloat((ing.recipeQty * scalingFactor).toFixed(2));

      const stockRec = stockBalances.find(s => String(s.itemCode || s.item_code || s.itemId || s.id) === lineCode);
      const currentStock = stockRec ? (parseFloat(stockRec.currentStock || stockRec.quantity || 0)) : 0;
      const isAvailable = currentStock >= scaledBaseQty;

      return {
        ...ing,
        scaledRecipeQty,
        scaledBaseQty,
        currentStock,
        isAvailable,
        shortage: isAvailable ? 0 : parseFloat((scaledBaseQty - currentStock).toFixed(4))
      };
    });

    const hasStockShortage = ingredientRequirements.some(i => !i.isAvailable);

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div class="card" style="background:var(--bg-surface-1); padding:20px;">
          <h3 style="font-size:1.2rem; margin:0 0 16px; font-weight:700;">➕ New Production Batch Execution</h3>

          <!-- Step 1: Select Semi-Finished Preparation -->
          <div style="display:grid; grid-template-columns: 2fr 1fr 1fr; gap:16px; align-items:end;">
            <div>
              <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:6px;">STEP 1: SELECT PREPARATION ITEM</label>
              <select id="sel-prep-bom" style="width:100%; padding:10px 12px; font-weight:600;">
                ${boms.map(b => `
                  <option value="${b.id}" ${b.id === activeBom.id ? 'selected' : ''}>
                    ${b.bomCode} — ${b.inventoryItemName} (${b.inventoryItemCode}) • Std Yield: ${b.standardYieldQuantity} ${b.standardYieldUom}
                  </option>
                `).join('')}
              </select>
            </div>

            <div>
              <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:6px;">STEP 2: TARGET BATCH SIZE</label>
              <div style="display:flex; gap:6px;">
                <input type="number" id="inp-batch-target-qty" value="${targetQty}" step="0.5" min="0.5" style="width:100%; padding:10px 12px; font-weight:700;">
                <span style="padding:10px 12px; background:var(--bg-surface-2); border-radius:6px; font-weight:700; font-size:0.85rem;">${activeBom.standardYieldUom}</span>
              </div>
            </div>

            <div style="padding:10px 14px; background:var(--bg-surface-2); border-radius:6px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">RECIPE SCALING FACTOR</div>
              <div style="font-size:1.3rem; font-weight:800; color:var(--accent-primary); margin-top:2px;">${scalingFactor.toFixed(2)}×</div>
            </div>
          </div>
        </div>

        <!-- Step 3: Scaled Ingredient Requirement Check -->
        <div class="card" style="background:var(--bg-surface-1); padding:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
            <div>
              <h4 style="font-size:0.95rem; margin:0; font-weight:700; text-transform:uppercase;">STEP 3: INGREDIENT REQUIREMENT & STOCK CHECK</h4>
              <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">
                Quantities auto-scaled for <strong>${targetQty} ${activeBom.standardYieldUom}</strong> target batch yield.
              </div>
            </div>
            ${hasStockShortage ? `
              <span class="badge badge-warning" style="padding:6px 14px; font-size:0.85rem; background:rgba(239, 68, 68, 0.15); color:var(--status-danger); border:1px solid var(--status-danger);">
                ⚠️ INGREDIENT SHORTAGE WARNING
              </span>
            ` : `
              <span class="badge badge-success" style="padding:6px 14px; font-size:0.85rem;">
                ✓ All Ingredients Available in Stock
              </span>
            `}
          </div>

          <!-- Table of Raw Materials -->
          <div class="table-responsive">
            <table class="data-table" style="width:100%;">
              <thead>
                <tr style="font-size:0.8rem; color:var(--text-muted);">
                  <th>Raw Material Ingredient</th>
                  <th>Standard Recipe Qty</th>
                  <th>Scaled Required Qty</th>
                  <th>Available Inventory Stock</th>
                  <th>Stock Availability Status</th>
                </tr>
              </thead>
              <tbody>
                ${ingredientRequirements.map(ing => `
                  <tr>
                    <td>
                      <div style="font-weight:700;">${ing.inventoryItemName}</div>
                      <div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${ing.inventoryItemCode}</div>
                    </td>
                    <td style="font-size:0.85rem; color:var(--text-muted);">${ing.recipeQty} ${ing.recipeUom}</td>
                    <td style="font-weight:700; color:var(--text-main);">${ing.scaledRecipeQty} ${ing.recipeUom} <span style="font-size:0.75rem; color:var(--text-muted);">(${ing.scaledBaseQty} ${ing.baseUom})</span></td>
                    <td style="font-weight:600;">${ing.currentStock} ${ing.baseUom}</td>
                    <td>
                      ${ing.isAvailable ? `
                        <span class="badge badge-success">✓ Available in Stock</span>
                      ` : `
                        <span class="badge badge-danger">⚠️ SHORTAGE: ${ing.shortage} ${ing.baseUom}</span>
                      `}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Shortage Guard & Action Bar -->
        ${hasStockShortage ? `
          <div class="card" style="background:rgba(239, 68, 68, 0.1); border:1px solid var(--status-danger); padding:16px 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
              <div>
                <h4 style="font-size:1rem; margin:0; color:var(--status-danger); font-weight:700;">
                  ❌ Production Batch Blocked Due to Stock Shortage
                </h4>
                <div style="font-size:0.825rem; color:var(--text-secondary); margin-top:4px;">
                  You cannot launch this batch until required raw materials are replenished. Raise a Stock Requisition to request stock from Main Warehouse.
                </div>
              </div>

              <div style="display:flex; gap:12px; align-items:center;">
                <button class="btn-primary" id="btn-raise-stock-requisition" style="padding:12px 20px; font-weight:800; background:var(--status-warning); color:#000;">
                  📦 Raise Stock Requisition from Main Warehouse
                </button>
                <button class="btn-primary" id="btn-start-production-batch" disabled title="Disabled due to ingredient stock shortage" style="padding:12px 24px; font-size:0.95rem; font-weight:800; opacity:0.4; cursor:not-allowed; background:var(--bg-surface-3);">
                  ▶ START PRODUCTION BATCH
                </button>
              </div>
            </div>
          </div>
        ` : `
          <div style="display:flex; justify-content:flex-end; gap:12px;">
            <button class="btn-primary" id="btn-start-production-batch" style="padding:12px 28px; font-size:1rem; font-weight:800; background:var(--accent-primary);">
              ▶ START PRODUCTION BATCH
            </button>
          </div>
        `}
      </div>
    `;

    const selBom = container.querySelector('#sel-prep-bom');
    if (selBom) {
      selBom.addEventListener('change', (e) => {
        this.selectedBomId = e.target.value;
        const b = boms.find(x => x.id === this.selectedBomId);
        if (b) this.newBatchTargetQty = b.standardYieldQuantity;
        this.renderNewBatch(container, session, tenantId);
      });
    }

    const inpTarget = container.querySelector('#inp-batch-target-qty');
    if (inpTarget) {
      inpTarget.addEventListener('change', (e) => {
        this.newBatchTargetQty = parseFloat(e.target.value) || 1;
        this.renderNewBatch(container, session, tenantId);
      });
    }

    // Raise Stock Requisition Action
    const raiseReqBtn = container.querySelector('#btn-raise-stock-requisition');
    if (raiseReqBtn) {
      raiseReqBtn.addEventListener('click', () => {
        const shortages = ingredientRequirements.filter(i => !i.isAvailable);

        const req = productionModel.createStockRequisition({
          prepBomId: activeBom.id,
          prepBomCode: activeBom.bomCode,
          inventoryItemName: activeBom.inventoryItemName,
          targetQuantity: targetQty,
          targetUom: activeBom.standardYieldUom,
          items: ingredientRequirements
        }, tenantId);

        alert(`📦 Stock Requisition "${req.reqCode}" Raised Successfully!\n\nRequisition for ${shortages.length} shortage items submitted to Inventory Manager.\nDestination: Kitchen Store\nSource: Main Warehouse`);

        this.activeTab = 'REQUISITIONS';
        this.render(container.closest('.animate-fade-in').parentNode, session);
      });
    }

    const startBtn = container.querySelector('#btn-start-production-batch');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (hasStockShortage) {
          alert('❌ Cannot Start Batch!\n\nOne or more raw materials have insufficient stock. Please click "📦 Raise Stock Requisition" to request stock from Main Warehouse first.');
          return;
        }

        try {
          const batch = productionModel.startBatch({
            prepBomId: activeBom.id,
            targetQuantity: targetQty
          }, tenantId);

          alert(`🚀 Production Batch ${batch.batchCode} Launched Successfully!\nStatus: IN PROGRESS`);
          this.activeTab = 'ACTIVE';
          this.render(container.closest('.animate-fade-in').parentNode, session);
        } catch (err) {
          alert(`❌ ${err.message}`);
        }
      });
    }
  }

  // --- 4. ACTIVE BATCHES TAB ---
  renderActiveBatches(container, session, tenantId) {
    const batches = productionModel.getBatches(tenantId);
    const activeBatches = batches.filter(b => b.status === 'IN_PROGRESS');

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div class="card" style="background:var(--bg-surface-1); padding:16px 20px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="font-size:1.1rem; margin:0;">🔄 Active Manufacturing Batches (${activeBatches.length})</h3>
            <span class="badge badge-warning">Live In-Progress Batches</span>
          </div>
        </div>

        ${activeBatches.length > 0 ? activeBatches.map(b => `
          <div class="card" style="background:var(--bg-surface-1); padding:20px; border:1px solid var(--border-subtle);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
              <div>
                <span class="badge badge-info" style="font-size:0.8rem;">${b.batchCode}</span>
                <h3 style="font-size:1.3rem; margin:6px 0 2px; font-weight:700;">${b.inventoryItemName}</h3>
                <div style="font-size:0.8rem; color:var(--text-muted); font-family:monospace;">
                  Item Code: ${b.inventoryItemCode} • Preparation BOM: ${b.prepBomCode}
                </div>
              </div>

              <div style="display:flex; align-items:center; gap:12px;">
                <div style="text-align:right;">
                  <div style="font-size:0.75rem; color:var(--text-muted);">TARGET BATCH SIZE</div>
                  <div style="font-size:1.2rem; font-weight:800; color:var(--text-main);">${b.targetQuantity} ${b.targetUom}</div>
                </div>
                <button class="btn-primary btn-complete-batch-trigger" data-id="${b.id}" style="padding:10px 20px; font-weight:700; font-size:0.9rem;">
                  ⚡ Complete Batch & Post Stock
                </button>
              </div>
            </div>

            <!-- Scaled Ingredients Table -->
            <div style="margin-top:16px; border-top:1px solid var(--border-subtle); padding-top:14px;">
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">SCALED INGREDIENTS BEING CONSUMED</div>
              <div class="table-responsive">
                <table class="data-table" style="width:100%;">
                  <thead>
                    <tr style="font-size:0.75rem; color:var(--text-muted);">
                      <th>Ingredient Name</th>
                      <th>Scaled Required Qty</th>
                      <th>Base Costing Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${b.scaledIngredients.map(ing => `
                      <tr style="font-size:0.85rem;">
                        <td><strong>${ing.inventoryItemName}</strong> <code style="font-size:0.7rem; color:var(--text-muted);">${ing.inventoryItemCode}</code></td>
                        <td style="font-weight:700;">${ing.scaledRecipeQty} ${ing.recipeUom}</td>
                        <td style="color:var(--text-muted); font-family:monospace;">${ing.scaledBaseQty} ${ing.baseUom}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `).join('') : `
          <div class="card" style="background:var(--bg-surface-1); padding:40px; text-align:center; color:var(--text-muted);">
            <div style="font-size:1.8rem; margin-bottom:8px;">✨ No Active Batches</div>
            <div>All production batches for today have been completed.</div>
          </div>
        `}

        ${this.completingBatchId ? this.renderCompletionModalHTML(this.completingBatchId, tenantId) : ''}
      </div>
    `;

    container.querySelectorAll('.btn-complete-batch-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        this.completingBatchId = btn.dataset.id;
        this.renderActiveBatches(container, session, tenantId);
      });
    });

    const closeBtn = container.querySelector('#btn-close-modal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.completingBatchId = null;
        this.renderActiveBatches(container, session, tenantId);
      });
    }

    const confirmCompleteBtn = container.querySelector('#btn-confirm-batch-completion');
    if (confirmCompleteBtn) {
      confirmCompleteBtn.addEventListener('click', () => {
        const actualYield = parseFloat(container.querySelector('#inp-actual-yield').value) || 0;
        const varianceReason = container.querySelector('#sel-variance-reason').value;
        const notes = container.querySelector('#inp-batch-notes').value;

        if (actualYield <= 0) {
          alert('❌ Please enter a valid actual yield quantity.');
          return;
        }

        const batch = productionModel.completeBatch(this.completingBatchId, {
          actualYield,
          varianceReason,
          notes
        }, tenantId);

        alert(`✅ Batch ${batch.batchCode} Completed!\n\nActual Yield: ${batch.actualYield} ${batch.actualYieldUom} (${batch.yieldPercent}%)\nStock Ledger posted for ingredient consumption & semi-finished output.`);

        this.completingBatchId = null;
        this.activeTab = 'HISTORY';
        this.render(container.closest('.animate-fade-in').parentNode, session);
      });
    }
  }

  renderCompletionModalHTML(batchId, tenantId) {
    const batch = productionModel.getBatchById(batchId, tenantId);
    if (!batch) return '';

    return `
      <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999; padding:20px;">
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); width:100%; max-width:540px; padding:24px; border-radius:12px; border:1px solid var(--border-subtle); box-shadow:var(--shadow-lg);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:12px; margin-bottom:16px;">
            <div>
              <span class="badge badge-info">${batch.batchCode}</span>
              <h3 style="font-size:1.2rem; margin:4px 0 0; font-weight:700;">Complete Production Batch</h3>
            </div>
            <button id="btn-close-modal" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">✕</button>
          </div>

          <div style="display:flex; flex-direction:column; gap:14px;">
            <div style="padding:12px; background:var(--bg-surface-2); border-radius:6px; font-size:0.85rem;">
              <div>Preparation: <strong>${batch.inventoryItemName} (${batch.inventoryItemCode})</strong></div>
              <div>Target Batch Yield: <strong>${batch.targetQuantity} ${batch.targetUom}</strong></div>
            </div>

            <div>
              <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">ENTER ACTUAL BATCH YIELD (${batch.targetUom})</label>
              <input type="number" id="inp-actual-yield" value="${batch.targetQuantity}" step="0.1" style="width:100%; padding:10px; font-weight:800; font-size:1.1rem;">
            </div>

            <div>
              <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">YIELD VARIANCE REASON</label>
              <select id="sel-variance-reason" style="width:100%; padding:10px;">
                <option value="Normal Preparation Loss">Normal Preparation Loss (Residue / Moisture Loss)</option>
                <option value="Trimming & Peeling Loss">Trimming & Peeling Loss</option>
                <option value="Evaporation / Boiling Loss">Evaporation / Boiling Loss</option>
                <option value="Quality Rejection">Quality Rejection</option>
                <option value="Spill / Accident">Spill / Vessel Residue</option>
                <option value="Other">Other / Unexplained Variance</option>
              </select>
            </div>

            <div>
              <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">CHEF NOTES / AUDIT COMMENTS</label>
              <textarea id="inp-batch-notes" rows="2" placeholder="Optional comments on batch quality or preparation..." style="width:100%; padding:8px;"></textarea>
            </div>

            <div style="font-size:0.75rem; color:var(--text-muted); line-height:1.4; background:var(--bg-surface-2); padding:10px; border-radius:6px;">
              ℹ️ Completing this batch automatically logs <strong>PRODUCTION_CONSUMPTION</strong> for raw materials and posts <strong>PRODUCTION_OUTPUT</strong> (+actual yield) to semi-finished stock ledger.
            </div>

            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:8px;">
              <button id="btn-confirm-batch-completion" class="btn-primary" style="width:100%; padding:12px; font-weight:700; background:var(--status-success);">
                ✅ Confirm Completion & Post Stock Ledger
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --- 5. STOCK REQUISITIONS TAB (WAREHOUSE & INVENTORY MANAGER INTERFACE) ---
  renderRequisitions(container, session, tenantId) {
    const requisitions = productionModel.getStockRequisitions(tenantId);
    const pendingReqs = requisitions.filter(r => r.status === 'PENDING_WAREHOUSE_FULFILLMENT');

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div class="card" style="background:var(--bg-surface-1); padding:16px 20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="font-size:1.1rem; margin:0;">📦 Stock Requisitions & Main Warehouse Fulfillment</h3>
              <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                Internal material requisitions raised by Kitchen for Main Warehouse stock transfer or PO fulfillment.
              </div>
            </div>
            <span class="badge badge-warning">${pendingReqs.length} Pending Warehouse Fulfillments</span>
          </div>
        </div>

        ${requisitions.length > 0 ? `
          <div style="display:flex; flex-direction:column; gap:16px;">
            ${requisitions.map(req => `
              <div class="card" style="background:var(--bg-surface-1); padding:20px; border:1px solid var(--border-subtle);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
                  <div>
                    <span class="badge badge-info" style="font-size:0.8rem;">${req.reqCode}</span>
                    <h4 style="font-size:1.15rem; margin:6px 0 2px; font-weight:700;">Requisition for ${req.inventoryItemName} Batch</h4>
                    <div style="font-size:0.75rem; color:var(--text-muted);">
                      Requested By: <strong>${req.requestedBy}</strong> • Target Yield: <strong>${req.targetQuantity} ${req.targetUom}</strong> • Date: ${new Date(req.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <div>
                    ${req.status === 'PENDING_WAREHOUSE_FULFILLMENT' ? `
                      <span class="badge badge-warning" style="font-size:0.85rem; padding:6px 12px;">⏳ PENDING WAREHOUSE FULFILLMENT</span>
                    ` : (req.status === 'TRANSFERRED' ? `
                      <span class="badge badge-success" style="font-size:0.85rem; padding:6px 12px;">🚚 STOCK TRANSFERRED TO KITCHEN</span>
                    ` : `
                      <span class="badge badge-info" style="font-size:0.85rem; padding:6px 12px;">🛒 PO FULFILLED</span>
                    `)}
                  </div>
                </div>

                <!-- Requisition Requested Items Table -->
                <div style="margin-top:14px; border-top:1px solid var(--border-subtle); padding-top:12px;">
                  <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">REQUESTED RAW MATERIALS & SHORTAGE QUANTITIES</div>
                  <div class="table-responsive">
                    <table class="data-table" style="width:100%;">
                      <thead>
                        <tr style="font-size:0.75rem; color:var(--text-muted);">
                          <th>Item Name</th>
                          <th>Required Qty</th>
                          <th>Kitchen On-Hand Stock</th>
                          <th>Requested Shortage Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${req.items.map(item => `
                          <tr style="font-size:0.85rem;">
                            <td><strong>${item.inventoryItemName}</strong> <code style="font-size:0.7rem; color:var(--text-muted);">${item.inventoryItemCode}</code></td>
                            <td>${item.scaledBaseQty} ${item.baseUom}</td>
                            <td style="color:var(--text-muted);">${item.currentStock} ${item.baseUom}</td>
                            <td style="font-weight:700; color:var(--status-danger);">${item.shortageQty > 0 ? `${item.shortageQty} ${item.baseUom}` : `${item.scaledBaseQty} ${item.baseUom}`}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- Kitchen View Requisition Status Bar -->
                ${req.status === 'PENDING_WAREHOUSE_FULFILLMENT' ? `
                  <div style="margin-top:14px; border-top:1px solid var(--border-subtle); padding-top:10px; font-size:0.8rem; color:var(--text-muted); background:var(--bg-surface-2); padding:12px; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                      👨‍💼 <strong>Status:</strong> Requisition submitted to <strong>Inventory Manager Workspace</strong>. Pending fulfillment from Main Warehouse stock transfer or Supplier PO.
                    </div>
                    <span class="badge badge-warning" style="font-size:0.75rem;">⏳ Pending Warehouse Action</span>
                  </div>
                ` : `
                  <div style="margin-top:12px; font-size:0.8rem; color:var(--text-muted); border-top:1px solid var(--border-subtle); padding-top:8px;">
                    ✓ Fulfilled on ${req.fulfilledAt ? new Date(req.fulfilledAt).toLocaleString() : 'N/A'} via ${req.fulfillmentType === 'MAIN_WAREHOUSE_TRANSFER' ? 'Main Warehouse Stock Transfer' : `Supplier Purchase Order (${req.poNumber || ''})`}. Stock credited to Kitchen Store inventory.
                  </div>
                `}
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="card" style="background:var(--bg-surface-1); padding:40px; text-align:center; color:var(--text-muted);">
            <div style="font-size:2.5rem; margin-bottom:8px;">📦</div>
            <h3 style="font-size:1.2rem; color:var(--text-main); margin:0 0 6px;">No Stock Requisitions Raised Yet</h3>
            <p style="font-size:0.875rem; max-width:480px; margin:0 auto 16px;">
              When stock shortage occurs during production batch execution, click <strong>"Raise Stock Requisition"</strong> to request materials from Main Warehouse.
            </p>
          </div>
        `}
      </div>
    `;

  }

  // --- 6. PRODUCTION HISTORY TAB ---
  renderHistory(container, session, tenantId) {
    const batches = productionModel.getBatches(tenantId);
    const completedBatches = batches.filter(b => b.status === 'COMPLETED');

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div class="card" style="background:var(--bg-surface-1); padding:16px 20px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="font-size:1.1rem; margin:0;">📜 Completed Production Batch History</h3>
            <span class="badge badge-success">${completedBatches.length} Completed Batches Logged</span>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table" style="width:100%;">
            <thead>
              <tr style="font-size:0.8rem; color:var(--text-muted);">
                <th>Batch Code</th>
                <th>Preparation Item</th>
                <th>Target Qty</th>
                <th>Actual Yield</th>
                <th>Yield %</th>
                <th>Variance Reason</th>
                <th>Completed Time</th>
                <th>Audit</th>
              </tr>
            </thead>
            <tbody>
              ${completedBatches.length > 0 ? completedBatches.map(b => `
                <tr>
                  <td><span class="badge badge-info">${b.batchCode}</span></td>
                  <td>
                    <div style="font-weight:700;">${b.inventoryItemName}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${b.inventoryItemCode}</div>
                  </td>
                  <td style="font-weight:600;">${b.targetQuantity} ${b.targetUom}</td>
                  <td style="font-weight:700; color:var(--text-main);">${b.actualYield} ${b.actualYieldUom}</td>
                  <td>
                    <span class="badge ${parseFloat(b.yieldPercent) >= 94 ? 'badge-success' : 'badge-warning'}">
                      ${b.yieldPercent}%
                    </span>
                  </td>
                  <td style="font-size:0.85rem; color:var(--text-secondary);">${b.varianceReason || 'Normal Loss'}</td>
                  <td style="font-size:0.8rem; color:var(--text-muted);">${new Date(b.completedAt || b.createdAt).toLocaleString()}</td>
                  <td>
                    <button class="btn-secondary btn-view-batch-audit" data-id="${b.id}" style="padding:4px 10px; font-size:0.75rem; font-weight:600;">
                      👁️ View Audit
                    </button>
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="8" style="text-align:center; padding:32px; color:var(--text-muted);">
                    📜 No completed production batches in history log yet.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelectorAll('.btn-view-batch-audit').forEach(btn => {
      btn.addEventListener('click', () => {
        const b = completedBatches.find(x => x.id === btn.dataset.id);
        if (b) {
          alert(`📜 PRODUCTION BATCH AUDIT REPORT\n\nBatch Code: ${b.batchCode}\nItem: ${b.inventoryItemName} (${b.inventoryItemCode})\nTarget: ${b.targetQuantity} ${b.targetUom}\nActual Yield: ${b.actualYield} ${b.actualYieldUom}\nYield Percent: ${b.yieldPercent}%\nVariance Loss: ${b.yieldVariance} ${b.actualYieldUom}\nReason: ${b.varianceReason}\nNotes: ${b.notes || 'None'}\nCompleted At: ${new Date(b.completedAt).toLocaleString()}`);
        }
      });
    });
  }
}

export const kitchenProductionView = new KitchenProductionView();
