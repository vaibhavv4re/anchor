/**
 * BusinessOS / RestaurantOS - Kitchen Domain UI (K-03 Recipes & BOM)
 * Interactive Recipe Builder, Master Inventory Ingredient Selector,
 * Yield & Wastage Calculator, Live Financial Cockpit, and Approval Workflow.
 */

import { recipeModel } from '../../../../../businessos/platform/kitchen/recipeModel.js';
import { kitchenMenuModel } from '../../../../../businessos/platform/kitchen/kitchenMenuModel.js';
import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';

// Dynamic UOM Family & Normalization Helper Functions
function getRecipeUomFamilyOptions(baseUom) {
  const bUom = String(baseUom || 'KG').trim().toUpperCase();

  if (bUom === 'KG' || bUom === 'G' || bUom === 'GM' || bUom === 'GRAM') {
    return [
      { code: 'G', label: 'G (Grams)', isDefault: true },
      { code: 'KG', label: 'KG (Kilograms)', isDefault: false },
      { code: 'MG', label: 'MG (Milligrams)', isDefault: false }
    ];
  }

  if (bUom === 'LTR' || bUom === 'L' || bUom === 'ML' || bUom === 'LITRE') {
    return [
      { code: 'ML', label: 'ML (Millilitres)', isDefault: true },
      { code: 'LTR', label: 'LTR (Litres)', isDefault: false }
    ];
  }

  return [
    { code: bUom, label: bUom, isDefault: true }
  ];
}

function convertRecipeUomToNormalized(qty, recipeUom, baseUom) {
  const q = parseFloat(qty) || 0;
  const rUom = String(recipeUom || 'G').trim().toUpperCase();
  const bUom = String(baseUom || 'KG').trim().toUpperCase();

  // Mass conversions (Base UOM = KG)
  if (bUom === 'KG') {
    if (rUom === 'G' || rUom === 'GM' || rUom === 'GRAMS' || rUom === 'GRAM') return q / 1000;
    if (rUom === 'MG' || rUom === 'MILLIGRAM') return q / 1000000;
    if (rUom === 'KG' || rUom === 'KILOGRAM') return q;
  }
  if (bUom === 'G' || bUom === 'GM') {
    if (rUom === 'KG') return q * 1000;
    if (rUom === 'MG') return q / 1000;
    if (rUom === 'G' || rUom === 'GM') return q;
  }

  // Volume conversions (Base UOM = LTR)
  if (bUom === 'LTR' || bUom === 'L' || bUom === 'LITRE' || bUom === 'LITER') {
    if (rUom === 'ML' || rUom === 'MILLILITRE' || rUom === 'MILLILITER') return q / 1000;
    if (rUom === 'LTR' || rUom === 'L') return q;
  }
  if (bUom === 'ML') {
    if (rUom === 'LTR' || rUom === 'L') return q * 1000;
    if (rUom === 'ML') return q;
  }

  return q;
}

export class KitchenRecipeView {
  constructor() {
    this.activeFilter = 'ALL'; // ALL | LINKED | MISSING
    this.searchQuery = '';
    this.currentView = 'LIST'; // 'LIST' | 'BUILDER'
    this.selectedMenuItem = null;
    this.activeRecipe = null;
  }

  render(mount, session) {
    const tenantId = session ? session.tenantId : null;

    if (this.currentView === 'BUILDER' && this.selectedMenuItem) {
      this.renderBuilderView(mount, session, tenantId);
    } else {
      this.renderListView(mount, session, tenantId);
    }
  }

  renderListView(mount, session, tenantId) {
    const menuItems = kitchenMenuModel.getAll(tenantId, { showArchived: false });
    const masterInv = offlineStore.getCollection('inventory', tenantId) || [];

    const filteredMenuItems = menuItems.filter(item => {
      const hasRecipe = Boolean(item.recipeId || item.recipe_id);
      if (this.activeFilter === 'LINKED' && !hasRecipe) return false;
      if (this.activeFilter === 'MISSING' && hasRecipe) return false;
      if (this.searchQuery.trim() !== '') {
        const q = this.searchQuery.toLowerCase().trim();
        const nameMatch = (item.itemName || item.item_name || '').toLowerCase().includes(q);
        const codeMatch = (item.itemCode || item.item_code || '').toLowerCase().includes(q);
        if (!nameMatch && !codeMatch) return false;
      }
      return true;
    });

    const linkageStats = kitchenMenuModel.getRecipeLinkageStats(tenantId);

    mount.innerHTML = `
      <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
        <div class="card" style="background:var(--bg-surface-1); padding:20px; border:1px solid var(--border-subtle);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">👨‍🍳 CHEF WORKSPACE — TAB 3</div>
              <h2 style="font-size:1.6rem; margin-top:2px;">📖 Production Recipes & Bill of Materials (BOM)</h2>
              <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">
                Define dish recipes, link raw materials & semi-finished preps from Master Inventory, auto-calculate food cost & margins.
              </p>
            </div>
            <div style="display:flex; gap:12px;">
              <div style="padding:10px 16px; background:var(--bg-surface-2); border-radius:8px; text-align:center;">
                <div style="font-size:1.25rem; font-weight:800; color:var(--status-success);">${linkageStats.linkedCount}</div>
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Recipes Linked</div>
              </div>
              <div style="padding:10px 16px; background:var(--bg-surface-2); border-radius:8px; text-align:center;">
                <div style="font-size:1.25rem; font-weight:800; color:var(--status-warning);">${linkageStats.missingCount}</div>
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Recipes Missing</div>
              </div>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-top:16px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <div style="display:flex; gap:8px;">
              <button class="btn-secondary filter-tab-btn ${this.activeFilter === 'ALL' ? 'active' : ''}" data-f="ALL">All Items (${linkageStats.total})</button>
              <button class="btn-secondary filter-tab-btn ${this.activeFilter === 'LINKED' ? 'active' : ''}" data-f="LINKED">✓ Linked (${linkageStats.linkedCount})</button>
              <button class="btn-secondary filter-tab-btn ${this.activeFilter === 'MISSING' ? 'active' : ''}" data-f="MISSING">⚠️ Recipe Missing (${linkageStats.missingCount})</button>
            </div>
            <div style="flex:1; max-width:300px;">
              <input type="text" id="inp-recipe-search" value="${this.searchQuery}" placeholder="Search menu dish or code..." style="width:100%;">
            </div>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Dish Code & Name</th>
                <th>Category</th>
                <th>Selling Price</th>
                <th>Recipe Linkage</th>
                <th>Active Version</th>
                <th>Recipe Food Cost</th>
                <th>Gross Margin</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filteredMenuItems.length > 0 ? filteredMenuItems.map(item => {
                const mId = item.id || item._id || item.itemCode || item.item_code;
                const activeRecipe = recipeModel.getActiveRecipeForMenuItem(mId);
                const hasRecipe = Boolean(activeRecipe || item.recipeId || item.recipe_id);
                const foodCost = activeRecipe ? `₹${activeRecipe.costPerPortion}` : '—';
                const sellingPrice = parseFloat(item.sellingPrice || item.selling_price) || 0;
                const foodCostPct = (activeRecipe && sellingPrice > 0) ? ((activeRecipe.costPerPortion / sellingPrice) * 100).toFixed(1) : null;
                const grossMarginPct = foodCostPct ? (100 - parseFloat(foodCostPct)).toFixed(1) : null;

                return `
                  <tr>
                    <td>
                      <div style="font-weight:700; color:var(--text-main);">${item.itemName || item.item_name}</div>
                      <div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${item.itemCode || item.item_code}</div>
                    </td>
                    <td><span class="badge badge-info">${item.category || 'GENERAL'}</span></td>
                    <td style="font-weight:700;">₹${sellingPrice}</td>
                    <td>
                      ${hasRecipe 
                        ? `<span class="badge badge-success">✓ Approved Recipe</span>` 
                        : `<span class="badge badge-warning">⚠️ Recipe Missing</span>`}
                    </td>
                    <td>
                      ${activeRecipe 
                        ? `<span class="badge badge-info">${activeRecipe.version || 'v1.0'}</span> <code style="font-size:0.75rem; color:var(--text-muted);">${activeRecipe.recipeCode}</code>` 
                        : `<span style="font-size:0.8rem; color:var(--text-muted);">Unassigned</span>`}
                    </td>
                    <td style="font-weight:700;">
                      ${foodCost} ${foodCostPct ? `<span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">(${foodCostPct}%)</span>` : ''}
                    </td>
                    <td>
                      ${grossMarginPct ? `
                        <span class="badge ${parseFloat(grossMarginPct) >= 65 ? 'badge-success' : 'badge-warning'}">
                          ${grossMarginPct}%
                        </span>
                      ` : '—'}
                    </td>
                    <td>
                      <button class="btn-primary btn-open-builder" data-id="${mId}" style="padding:6px 12px; font-size:0.8rem; font-weight:600;">
                        ${hasRecipe ? '✏️ View / Revise BOM' : '➕ Create Recipe'}
                      </button>
                    </td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="8" style="text-align:center; padding:40px; color:var(--text-muted);">
                    <div style="font-size:1.5rem; margin-bottom:8px;">📖 No Menu Items Found</div>
                    <div>No menu dishes match the current filter selection.</div>
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;

    mount.querySelectorAll('.filter-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeFilter = btn.dataset.f;
        this.renderListView(mount, session, tenantId);
      });
    });

    const searchInp = mount.querySelector('#inp-recipe-search');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.renderListView(mount, session, tenantId);
      });
    }

    mount.querySelectorAll('.btn-open-builder').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const menuItemId = btn.dataset.id;
        const menuItem = menuItems.find(m => String(m.id || m._id || m.itemCode || m.item_code) === String(menuItemId));
        if (menuItem) {
          this.selectedMenuItem = menuItem;
          this.currentView = 'BUILDER';
          this.render(mount, session);
        } else {
          console.warn('Menu item not found for ID:', menuItemId);
        }
      });
    });
  }

  renderBuilderView(mount, session, tenantId) {
    const menuItem = this.selectedMenuItem;
    const masterInv = offlineStore.getCollection('inventory', tenantId) || [];

    const mId = menuItem.id || menuItem._id || menuItem.itemCode || menuItem.item_code;
    const mCode = menuItem.itemCode || menuItem.item_code || 'CODE';
    const mName = menuItem.itemName || menuItem.item_name || 'Dish';
    const sellingPrice = parseFloat(menuItem.sellingPrice || menuItem.selling_price) || 0;

    let activeRecipe = recipeModel.getActiveRecipeForMenuItem(mId);
    if (!activeRecipe) {
      const revisions = recipeModel.getRevisionsForMenuItem(mId);
      if (revisions.length > 0) {
        activeRecipe = revisions[0];
      } else {
        activeRecipe = recipeModel.createRecipe({
          recipeCode: `RCP-${mCode || Math.floor(1000 + Math.random() * 9000)}`,
          recipeName: `${mName} Recipe`,
          menuItemId: mId,
          menuItemCode: mCode,
          version: 'v1.0',
          yieldQuantity: 1,
          yieldUom: 'PORTION',
          portionCount: 1,
          tenantId
        });
      }
    }

    const renderBuilderPage = () => {
      const isApproved = activeRecipe.status === 'APPROVED';
      const costAnalysis = recipeModel.calculateCost(activeRecipe, tenantId);
      const foodCostPct = sellingPrice > 0 ? ((costAnalysis.costPerPortion / sellingPrice) * 100).toFixed(1) : 0;
      const grossMarginPct = (100 - parseFloat(foodCostPct)).toFixed(1);

      mount.innerHTML = `
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px; padding-bottom:40px;">
          <!-- Top Navigation Header -->
          <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1); padding:16px 20px; border-radius:8px; border:1px solid var(--border-subtle);">
            <div style="display:flex; align-items:center; gap:16px;">
              <button id="btn-back-to-recipes" class="btn-secondary" style="display:flex; align-items:center; gap:8px; padding:8px 16px; font-weight:700; cursor:pointer; font-size:0.9rem;">
                ← Back to Recipe List
              </button>
              <div>
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">CHEF WORKSPACE • RECIPE & BOM EDITOR</div>
                <h3 style="font-size:1.4rem; margin:0; font-weight:700;">📖 ${activeRecipe.recipeName || mName + ' Recipe'}</h3>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="badge ${isApproved ? 'badge-success' : 'badge-warning'}" style="font-size:0.85rem; padding:6px 12px;">
                ${isApproved ? '🔒 APPROVED & LOCKED' : '📝 DRAFT'}
              </span>
              <span class="badge badge-info" style="font-size:0.85rem; padding:6px 12px;">${activeRecipe.version || 'v1.0'}</span>
            </div>
          </div>

          <!-- Linked Dish Summary Card -->
          <div class="card" style="background:var(--bg-surface-1); padding:16px 20px; border-left:4px solid var(--accent-primary);">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
              <div>
                <div style="font-weight:700; font-size:1.1rem; color:var(--text-main);">${mName} (<code>${mCode}</code>)</div>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
                  Category: <strong>${menuItem.category || 'GENERAL'}</strong> • Selling MRP: <strong>₹${sellingPrice}</strong>
                </div>
              </div>
              <div>
                ${isApproved ? `
                  <span class="badge badge-success">✓ Recipe Live on Menu</span>
                ` : `
                  <span class="badge badge-warning">⚠️ Recipe in Draft State</span>
                `}
              </div>
            </div>
          </div>

          ${isApproved ? `
            <div class="card" style="background:var(--bg-surface-2); padding:14px 20px; border-left:4px solid var(--status-success);">
              <div style="font-weight:700; font-size:0.9rem; color:var(--status-success);">🔒 Approved Recipe Revision Locked</div>
              <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:2px;">
                This approved revision cannot be edited directly in order to protect historical food cost audits. Click <strong>"✨ Create New Revision"</strong> below to create an editable draft revision.
              </div>
            </div>
          ` : ''}

          <!-- Yield & Portioning Configuration -->
          <div class="card" style="background:var(--bg-surface-1); padding:16px 20px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:12px;">RECIPE YIELD & PORTIONING CONFIGURATION</div>
            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:16px; align-items:end;">
              <div>
                <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">YIELD QUANTITY</label>
                <input type="number" id="inp-yield-qty" value="${activeRecipe.yieldQuantity || 1}" ${isApproved ? 'disabled' : ''} step="0.1" style="width:100%; padding:8px 12px;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">YIELD UOM</label>
                <select id="sel-yield-uom" ${isApproved ? 'disabled' : ''} style="width:100%; padding:8px 12px;">
                  <option value="PORTION" ${activeRecipe.yieldUom === 'PORTION' ? 'selected' : ''}>PORTION</option>
                  <option value="KG" ${activeRecipe.yieldUom === 'KG' ? 'selected' : ''}>KG</option>
                  <option value="LTR" ${activeRecipe.yieldUom === 'LTR' ? 'selected' : ''}>LTR</option>
                  <option value="TRAY" ${activeRecipe.yieldUom === 'TRAY' ? 'selected' : ''}>TRAY</option>
                </select>
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">PORTION COUNT</label>
                <input type="number" id="inp-portion-count" value="${activeRecipe.portionCount || 1}" ${isApproved ? 'disabled' : ''} min="1" style="width:100%; padding:8px 12px;">
              </div>
              <div>
                <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">PREP & COOK TIME (MINS)</label>
                <div style="display:flex; gap:6px;">
                  <input type="number" id="inp-prep-time" value="${activeRecipe.prepTimeMinutes || 15}" placeholder="Prep" ${isApproved ? 'disabled' : ''} style="flex:1; padding:8px 12px;">
                  <input type="number" id="inp-cook-time" value="${activeRecipe.cookTimeMinutes || 10}" placeholder="Cook" ${isApproved ? 'disabled' : ''} style="flex:1; padding:8px 12px;">
                </div>
              </div>
            </div>
          </div>

          <!-- Financial Cockpit Grid -->
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px;">
            <div class="card" style="background:var(--bg-surface-1); padding:14px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">TOTAL RECIPE COST</div>
              <div style="font-size:1.5rem; font-weight:800; color:var(--text-main); margin-top:4px;">₹${costAnalysis.totalCost.toFixed(2)}</div>
            </div>
            <div class="card" style="background:var(--bg-surface-1); padding:14px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">COST PER PORTION</div>
              <div style="font-size:1.5rem; font-weight:800; color:var(--accent-primary); margin-top:4px;">₹${costAnalysis.costPerPortion.toFixed(2)}</div>
            </div>
            <div class="card" style="background:var(--bg-surface-1); padding:14px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">FOOD COST %</div>
              <div style="font-size:1.5rem; font-weight:800; color:${parseFloat(foodCostPct) <= 35 ? 'var(--status-success)' : 'var(--status-danger)'}; margin-top:4px;">
                ${foodCostPct}%
              </div>
            </div>
            <div class="card" style="background:var(--bg-surface-1); padding:14px; text-align:center;">
              <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">GROSS MARGIN %</div>
              <div style="font-size:1.5rem; font-weight:800; color:${parseFloat(grossMarginPct) >= 65 ? 'var(--status-success)' : 'var(--status-warning)'}; margin-top:4px;">
                ${grossMarginPct}%
              </div>
            </div>
          </div>

          <!-- Bill of Materials (BOM) Table Card -->
          <div class="card" style="background:var(--bg-surface-1); padding:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <div>
                <div style="font-size:0.9rem; font-weight:700; text-transform:uppercase;">INGREDIENT BILL OF MATERIALS (BOM)</div>
                <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">
                  Enter practical <strong>Recipe Quantities</strong> (e.g., 100 G, 15 ML) — auto-normalized to Master Inventory base costing UOM.
                </div>
              </div>
              <div style="font-size:0.8rem; color:var(--text-muted);">
                Strictly referencing <strong>Master Inventory</strong> (PD-024)
              </div>
            </div>

            <div class="table-responsive">
              <table class="data-table" style="width:100%;">
                <thead>
                  <tr style="font-size:0.8rem; color:var(--text-muted);">
                    <th>Ingredient (Master Inventory)</th>
                    <th>Type</th>
                    <th>Recipe Qty</th>
                    <th>Inventory Qty</th>
                    <th>Std Yield %</th>
                    <th>Wastage %</th>
                    <th>Gross Qty</th>
                    <th>Unit Cost</th>
                    <th>Line Cost</th>
                    ${!isApproved ? '<th>Action</th>' : ''}
                  </tr>
                </thead>
                <tbody>
                  ${costAnalysis.lines.length > 0 ? costAnalysis.lines.map((line, idx) => `
                    <tr>
                      <td>
                        <div style="font-weight:700; font-size:0.95rem;">${line.inventoryItemName}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${line.inventoryItemCode}</div>
                      </td>
                      <td>
                        <span class="badge ${line.itemType === 'Semi Finished' ? 'badge-warning' : 'badge-info'}" style="font-size:0.7rem;">
                          ${line.itemType || 'Raw Material'}
                        </span>
                      </td>
                      <td>
                        ${!isApproved ? `
                          <div style="display:flex; gap:4px; align-items:center;">
                            <input type="number" class="inp-line-recipe-qty" data-idx="${idx}" value="${line.recipeQty}" step="0.1" style="width:75px; padding:4px 6px;">
                            <select class="sel-line-recipe-uom" data-idx="${idx}" style="padding:4px 6px; font-size:0.8rem;">
                              ${getRecipeUomFamilyOptions(line.baseUom).map(opt => `
                                <option value="${opt.code}" ${line.recipeUom === opt.code ? 'selected' : ''}>${opt.code}</option>
                              `).join('')}
                            </select>
                          </div>
                        ` : `<strong>${line.recipeQty} ${line.recipeUom}</strong>`}
                      </td>
                      <td style="font-size:0.85rem; font-family:monospace; color:var(--text-secondary);">
                        <strong>${line.quantity}</strong> ${line.baseUom}
                      </td>
                      <td style="font-size:0.85rem; color:var(--text-muted);">${line.standardYieldPercent}%</td>
                      <td>
                        ${!isApproved ? `
                          <input type="number" class="inp-line-wastage" data-idx="${idx}" value="${line.recipeWastagePercent || 0}" min="0" max="100" style="width:70px; padding:4px 8px;">%
                        ` : `${line.recipeWastagePercent || 0}%`}
                      </td>
                      <td style="font-weight:600; color:var(--text-secondary);">${line.grossQuantity} ${line.baseUom}</td>
                      <td style="font-size:0.85rem;">₹${line.unitCost.toFixed(2)} / ${line.baseUom}</td>
                      <td style="font-weight:700; color:var(--text-main);">₹${line.lineCost.toFixed(2)}</td>
                      ${!isApproved ? `
                        <td>
                          <button class="btn-secondary btn-remove-line" data-idx="${idx}" style="padding:4px 8px; font-size:0.75rem; color:var(--status-danger);">✕ Remove</button>
                        </td>
                      ` : ''}
                    </tr>
                  `).join('') : `
                    <tr>
                      <td colspan="${!isApproved ? 10 : 9}" style="text-align:center; padding:32px; color:var(--text-muted);">
                        <div style="font-size:1.2rem; margin-bottom:6px;">📦 No Ingredients in BOM</div>
                        <div>Select raw materials or preps from Master Inventory below to add to recipe BOM.</div>
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>

            ${!isApproved ? `
              <div style="display:flex; gap:12px; margin-top:20px; padding:16px; background:var(--bg-surface-2); border-radius:8px; align-items:flex-end; flex-wrap:wrap;">
                <div style="flex:2; min-width:240px;">
                  <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">SELECT INGREDIENT FROM MASTER INVENTORY</label>
                  <select id="sel-master-inv-item" style="width:100%; padding:8px 12px;">
                    <option value="">-- Choose Raw Material or Semi-Finished Prep --</option>
                    ${masterInv.map(inv => {
                      const c = inv.itemCode || inv.item_code || inv.id || inv._id || inv.uuid || '';
                      const n = inv.itemName || inv.item_name || 'Item';
                      const t = inv.itemType || inv.item_type || 'Raw Material';
                      const p = inv.lastPurchasePrice || inv.unitValuation || inv.unit_valuation || 0;
                      const u = inv.baseUom || inv.base_uom || 'KG';
                      return `
                        <option value="${c}">
                          ${c} — ${n} (${t}) — Base UOM: ${u} (₹${p}/${u})
                        </option>
                      `;
                    }).join('')}
                  </select>
                </div>
                <div style="width:110px;">
                  <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">RECIPE QTY</label>
                  <input type="number" id="inp-add-qty" value="100" step="0.1" style="width:100%; padding:8px 12px;">
                </div>
                <div style="width:120px;">
                  <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">RECIPE UOM</label>
                  <select id="sel-add-recipe-uom" style="width:100%; padding:8px 12px;">
                    <option value="G" selected>G (Grams)</option>
                    <option value="KG">KG (Kilograms)</option>
                    <option value="MG">MG (Milligrams)</option>
                  </select>
                </div>
                <div style="width:100px;">
                  <label style="display:block; font-size:0.75rem; color:var(--text-muted); font-weight:700; margin-bottom:4px;">WASTAGE %</label>
                  <input type="number" id="inp-add-wastage" value="0" min="0" max="100" style="width:100%; padding:8px 12px;">
                </div>
                <button class="btn-primary" id="btn-add-ingredient-line" style="padding:8px 20px; font-weight:700;">
                  ➕ Add to BOM
                </button>
              </div>
            ` : ''}
          </div>

          <!-- Bottom Action Bar -->
          <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-1); padding:16px 20px; border-radius:8px; border:1px solid var(--border-subtle);">
            <div style="font-size:0.85rem; color:var(--text-muted);">
              Status: <strong style="color:var(--text-main);">${activeRecipe.status}</strong> • Version: <strong>${activeRecipe.version || 'v1.0'}</strong>
            </div>

            <div style="display:flex; gap:12px;">
              <button id="btn-back-bottom" class="btn-secondary" style="padding:10px 18px; font-weight:600;">
                ← Back to Recipe List
              </button>

              ${!isApproved ? `
                <button class="btn-secondary" id="btn-save-draft" style="padding:10px 18px; font-weight:600;">💾 Save Draft</button>
                <button class="btn-primary" id="btn-approve-recipe" style="padding:10px 20px; font-weight:700; background:var(--status-success);">
                  🔒 Approve Recipe & Link to Menu
                </button>
              ` : `
                <button class="btn-primary" id="btn-create-revision" style="padding:10px 20px; font-weight:700;">
                  ✨ Create New Revision
                </button>
              `}
            </div>
          </div>
        </div>
      `;

      const backAction = () => {
        this.currentView = 'LIST';
        this.selectedMenuItem = null;
        this.render(mount, session);
      };

      const btnBackTop = mount.querySelector('#btn-back-to-recipes');
      if (btnBackTop) btnBackTop.addEventListener('click', backAction);

      const btnBackBottom = mount.querySelector('#btn-back-bottom');
      if (btnBackBottom) btnBackBottom.addEventListener('click', backAction);

      if (!isApproved) {
        const yieldQtyInp = mount.querySelector('#inp-yield-qty');
        const portionInp = mount.querySelector('#inp-portion-count');
        const yieldUomSel = mount.querySelector('#sel-yield-uom');
        const prepTimeInp = mount.querySelector('#inp-prep-time');
        const cookTimeInp = mount.querySelector('#inp-cook-time');

        if (yieldQtyInp) yieldQtyInp.addEventListener('change', (e) => { activeRecipe.yieldQuantity = parseFloat(e.target.value) || 1; renderBuilderPage(); });
        if (portionInp) portionInp.addEventListener('change', (e) => { activeRecipe.portionCount = parseInt(e.target.value) || 1; renderBuilderPage(); });
        if (yieldUomSel) yieldUomSel.addEventListener('change', (e) => { activeRecipe.yieldUom = e.target.value; });
        if (prepTimeInp) prepTimeInp.addEventListener('change', (e) => { activeRecipe.prepTimeMinutes = parseInt(e.target.value) || 15; });
        if (cookTimeInp) cookTimeInp.addEventListener('change', (e) => { activeRecipe.cookTimeMinutes = parseInt(e.target.value) || 10; });

        const masterSel = mount.querySelector('#sel-master-inv-item');
        if (masterSel) {
          masterSel.addEventListener('change', () => {
            const selectedCode = masterSel.value;
            const invItem = masterInv.find(i => String(i.itemCode || i.item_code || i.id || i._id || i.uuid || '') === String(selectedCode));
            if (invItem) {
              const baseUom = invItem.baseUom || invItem.base_uom || 'KG';
              const uomOpts = getRecipeUomFamilyOptions(baseUom);
              const recipeUomSel = mount.querySelector('#sel-add-recipe-uom');
              if (recipeUomSel) {
                recipeUomSel.innerHTML = uomOpts.map(o => `
                  <option value="${o.code}" ${o.isDefault ? 'selected' : ''}>${o.label}</option>
                `).join('');
              }
              const qtyInp = mount.querySelector('#inp-add-qty');
              if (qtyInp) {
                const defaultUom = (uomOpts.find(o => o.isDefault) || uomOpts[0]).code;
                if (defaultUom === 'G') qtyInp.value = 100;
                else if (defaultUom === 'ML') qtyInp.value = 15;
                else qtyInp.value = 1;
              }
            }
          });
        }

        mount.querySelectorAll('.inp-line-recipe-qty').forEach(inp => {
          inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const line = activeRecipe.ingredients[idx];
            line.recipeQty = parseFloat(e.target.value) || 0;
            line.quantity = convertRecipeUomToNormalized(line.recipeQty, line.recipeUom, line.baseUom);
            renderBuilderPage();
          });
        });

        mount.querySelectorAll('.sel-line-recipe-uom').forEach(sel => {
          sel.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const line = activeRecipe.ingredients[idx];
            line.recipeUom = e.target.value;
            line.quantity = convertRecipeUomToNormalized(line.recipeQty, line.recipeUom, line.baseUom);
            renderBuilderPage();
          });
        });

        mount.querySelectorAll('.inp-line-wastage').forEach(inp => {
          inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            activeRecipe.ingredients[idx].recipeWastagePercent = parseFloat(e.target.value) || 0;
            renderBuilderPage();
          });
        });

        mount.querySelectorAll('.btn-remove-line').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            activeRecipe.ingredients.splice(idx, 1);
            renderBuilderPage();
          });
        });

        const addLineBtn = mount.querySelector('#btn-add-ingredient-line');
        if (addLineBtn) {
          addLineBtn.addEventListener('click', () => {
            const invSel = mount.querySelector('#sel-master-inv-item');
            const qtyInp = mount.querySelector('#inp-add-qty');
            const uomSel = mount.querySelector('#sel-add-recipe-uom');
            const wastageInp = mount.querySelector('#inp-add-wastage');

            const selectedCode = invSel ? invSel.value : '';
            if (!selectedCode) {
              alert('❌ Please select an ingredient from Master Inventory.');
              return;
            }

            const invItem = masterInv.find(i => String(i.itemCode || i.item_code || i.id || i._id || i.uuid || '') === String(selectedCode));
            const baseUom = invItem ? (invItem.baseUom || invItem.base_uom || 'KG') : 'KG';

            const recipeQty = parseFloat(qtyInp ? qtyInp.value : 100) || 100;
            const recipeUom = uomSel ? uomSel.value : 'G';
            const wastage = parseFloat(wastageInp ? wastageInp.value : 0) || 0;

            const normalizedQty = convertRecipeUomToNormalized(recipeQty, recipeUom, baseUom);

            activeRecipe.ingredients = activeRecipe.ingredients || [];
            const existingIdx = activeRecipe.ingredients.findIndex(i => String(i.inventoryItemCode || i.inventory_item_code || i.inventoryItemId || i.id || '') === String(selectedCode));
            if (existingIdx >= 0) {
              activeRecipe.ingredients[existingIdx].recipeQty = (parseFloat(activeRecipe.ingredients[existingIdx].recipeQty) || 0) + recipeQty;
              activeRecipe.ingredients[existingIdx].recipeUom = recipeUom;
              activeRecipe.ingredients[existingIdx].quantity = convertRecipeUomToNormalized(activeRecipe.ingredients[existingIdx].recipeQty, recipeUom, baseUom);
            } else {
              activeRecipe.ingredients.push({
                id: `line-${Math.random().toString(36).substring(2, 7)}`,
                inventoryItemCode: selectedCode,
                inventoryItemId: invItem ? (invItem.id || invItem._id || invItem.uuid) : null,
                inventoryItemName: invItem ? (invItem.itemName || invItem.item_name) : selectedCode,
                itemType: invItem ? (invItem.itemType || invItem.item_type || 'Raw Material') : 'Raw Material',
                recipeQty: recipeQty,
                recipeUom: recipeUom,
                quantity: normalizedQty,
                baseUom: baseUom,
                uom: baseUom,
                unitCost: invItem ? (parseFloat(invItem.lastPurchasePrice) || parseFloat(invItem.unitValuation) || parseFloat(invItem.unit_valuation) || 0) : 0,
                recipeWastagePercent: wastage
              });
            }

            renderBuilderPage();
          });
        }

        const saveDraftBtn = mount.querySelector('#btn-save-draft');
        if (saveDraftBtn) {
          saveDraftBtn.addEventListener('click', () => {
            recipeModel.updateRecipe(activeRecipe.id, {
              yieldQuantity: activeRecipe.yieldQuantity,
              yieldUom: activeRecipe.yieldUom,
              portionCount: activeRecipe.portionCount,
              ingredients: activeRecipe.ingredients
            });
            alert('💾 Recipe Draft saved successfully!');
            renderBuilderPage();
          });
        }

        const approveBtn = mount.querySelector('#btn-approve-recipe');
        if (approveBtn) {
          approveBtn.addEventListener('click', () => {
            if (activeRecipe.ingredients.length === 0) {
              alert('❌ Cannot approve an empty recipe. Please add at least 1 ingredient from Master Inventory.');
              return;
            }
            if (confirm('🔒 Approve this recipe revision? It will be locked and linked to the menu item.')) {
              recipeModel.updateRecipe(activeRecipe.id, {
                yieldQuantity: activeRecipe.yieldQuantity,
                yieldUom: activeRecipe.yieldUom,
                portionCount: activeRecipe.portionCount,
                ingredients: activeRecipe.ingredients
              });
              activeRecipe = recipeModel.approveRecipe(activeRecipe.id);
              alert(`🎉 Recipe "${activeRecipe.recipeName}" Approved & Locked! Menu item linked successfully.`);
              renderBuilderPage();
            }
          });
        }

      } else {
        const revBtn = mount.querySelector('#btn-create-revision');
        if (revBtn) {
          revBtn.addEventListener('click', () => {
            activeRecipe = recipeModel.createRevision(activeRecipe.id);
            alert(`✨ Created new Draft Revision "${activeRecipe.version}"! You can now edit and approve.`);
            renderBuilderPage();
          });
        }
      }
    };

    renderBuilderPage();
  }
}

export const kitchenRecipeView = new KitchenRecipeView();
