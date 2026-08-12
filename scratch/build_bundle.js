const fs = require('fs');
const path = require('path');

const rootDir = 'd:/Projects/Anchor';
const bundlePath = path.join(rootDir, 'bundle.js');

const prodModelCode = fs.readFileSync(path.join(rootDir, 'businessos/platform/kitchen/productionModel.js'), 'utf8')
  .replace(/import\s+.*?;?\r?\n/g, '')
  .replace(/export\s+class\s+ProductionModel/, 'class ProductionModel');

const menuViewCode = fs.readFileSync(path.join(rootDir, 'restaurantos/frontend/capabilities/kitchen/ui/KitchenMenuView.js'), 'utf8')
  .replace(/import\s+.*?;?\r?\n/g, '')
  .replace(/export\s+class\s+KitchenMenuView/, 'class KitchenMenuView');

const recipeViewCode = fs.readFileSync(path.join(rootDir, 'restaurantos/frontend/capabilities/kitchen/ui/KitchenRecipeView.js'), 'utf8')
  .replace(/import\s+.*?;?\r?\n/g, '')
  .replace(/export\s+class\s+KitchenRecipeView/, 'class KitchenRecipeView');

const productionViewCode = fs.readFileSync(path.join(rootDir, 'restaurantos/frontend/capabilities/kitchen/ui/KitchenProductionView.js'), 'utf8')
  .replace(/import\s+.*?;?\r?\n/g, '')
  .replace(/export\s+class\s+KitchenProductionView/, 'class KitchenProductionView');

const inventoryViewCode = fs.readFileSync(path.join(rootDir, 'restaurantos/frontend/capabilities/kitchen/ui/KitchenInventoryView.js'), 'utf8')
  .replace(/import\s+.*?;?\r?\n/g, '')
  .replace(/export\s+class\s+KitchenInventoryView/, 'class KitchenInventoryView');

const combinedKitchenCode = `
// ====================================================================
// KITCHEN DOMAIN ENGINE & UI MODULES
// ====================================================================

${prodModelCode}

const productionModel = new ProductionModel();

${menuViewCode}
const kitchenMenuView = new KitchenMenuView();

${recipeViewCode}
const kitchenRecipeView = new KitchenRecipeView();

${productionViewCode}
const kitchenProductionView = new KitchenProductionView();

${inventoryViewCode}
const kitchenInventoryView = new KitchenInventoryView();
`;

let bundleContent = fs.readFileSync(bundlePath, 'utf8');

// Find marker before ApplicationShell
const appShellMarker = 'class ApplicationShell';
const appShellIndex = bundleContent.indexOf(appShellMarker);

if (appShellIndex === -1) {
  console.error('Could not find class ApplicationShell in bundle.js');
  process.exit(1);
}

// Insert modules before ApplicationShell
bundleContent = bundleContent.slice(0, appShellIndex) + combinedKitchenCode + '\n\n  ' + bundleContent.slice(appShellIndex);

// Replace renderKitchenWorkspace inside ApplicationShell
const startMarker = 'renderKitchenWorkspace(mount, session) {';
const endMarker = 'renderBarWorkspace(mount, session) {';

const startIndex = bundleContent.indexOf(startMarker);
const endIndex = bundleContent.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not find renderKitchenWorkspace or renderBarWorkspace markers in bundle.js');
  process.exit(1);
}

const newKitchenWorkspaceRouter = `renderKitchenWorkspace(mount, session) {
    if (!this.kitchenActiveTab) this.kitchenActiveTab = 'catalog';

    const renderView = () => {
      mount.innerHTML = \`
        <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px; padding-bottom:40px;">
          <!-- Kitchen Top Cockpit Header -->
          <div class="card" style="background:var(--bg-surface-1); padding:20px; border:1px solid var(--border-subtle);">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
              <div>
                <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">👨‍🍳 CHEF WORKSPACE</div>
                <h2 style="font-size:1.75rem; margin-top:2px; margin-bottom:0;">👨‍🍳 Chef & Kitchen Operations Tower</h2>
                <div style="font-size:0.875rem; color:var(--text-muted); margin-top:4px;">
                  End-to-end culinary operations: Menu catalog, Recipe costing, Preparation BOM manufacturing, Operational stock view & Analytics.
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:12px;">
                <button class="btn-primary btn-goto-kds" style="padding:10px 18px; font-weight:700; background:var(--status-danger);">
                  🔥 Open Live KDS Screen
                </button>
              </div>
            </div>

            <!-- Tab Navigation Bar (5 Tabs) -->
            <div style="display:flex; gap:8px; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px; flex-wrap:wrap;">
              <button class="btn-kitchen-tab \${this.kitchenActiveTab === 'catalog' ? 'active' : ''}" data-tab="catalog" style="padding:10px 20px; font-weight:700; font-size:0.9rem; border-radius:8px; cursor:pointer; background:\${this.kitchenActiveTab === 'catalog' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:\${this.kitchenActiveTab === 'catalog' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
                📋 1. Menu Catalog & KOTs
              </button>
              <button class="btn-kitchen-tab \${this.kitchenActiveTab === 'recipes' ? 'active' : ''}" data-tab="recipes" style="padding:10px 20px; font-weight:700; font-size:0.9rem; border-radius:8px; cursor:pointer; background:\${this.kitchenActiveTab === 'recipes' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:\${this.kitchenActiveTab === 'recipes' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
                🍳 2. Recipe BOMs & Costing
              </button>
              <button class="btn-kitchen-tab \${this.kitchenActiveTab === 'production' ? 'active' : ''}" data-tab="production" style="padding:10px 20px; font-weight:700; font-size:0.9rem; border-radius:8px; cursor:pointer; background:\${this.kitchenActiveTab === 'production' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:\${this.kitchenActiveTab === 'production' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
                🥘 3. Production Engine
              </button>
              <button class="btn-kitchen-tab \${this.kitchenActiveTab === 'stock' ? 'active' : ''}" data-tab="stock" style="padding:10px 20px; font-weight:700; font-size:0.9rem; border-radius:8px; cursor:pointer; background:\${this.kitchenActiveTab === 'stock' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:\${this.kitchenActiveTab === 'stock' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
                📦 4. Kitchen Inventory
              </button>
              <button class="btn-kitchen-tab \${this.kitchenActiveTab === 'reports' ? 'active' : ''}" data-tab="reports" style="padding:10px 20px; font-weight:700; font-size:0.9rem; border-radius:8px; cursor:pointer; background:\${this.kitchenActiveTab === 'reports' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color:\${this.kitchenActiveTab === 'reports' ? '#fff' : 'var(--text-primary)'}; border:1px solid var(--border-subtle);">
                📊 5. Kitchen Reports
              </button>
            </div>
          </div>

          <!-- Active Subtab Content Body -->
          <main id="kitchen-subtab-body"></main>
        </div>
      \`;

      const body = mount.querySelector('#kitchen-subtab-body');
      if (this.kitchenActiveTab === 'catalog') {
        kitchenMenuView.render(body, session);
      } else if (this.kitchenActiveTab === 'recipes') {
        kitchenRecipeView.render(body, session);
      } else if (this.kitchenActiveTab === 'production') {
        kitchenProductionView.render(body, session);
      } else if (this.kitchenActiveTab === 'stock') {
        kitchenInventoryView.render(body, session);
      } else if (this.kitchenActiveTab === 'reports') {
        body.innerHTML = \`
          <div class="card animate-fade-in" style="background:var(--bg-surface-1); padding:40px; text-align:center;">
            <div style="font-size:3rem; margin-bottom:12px;">📊</div>
            <h2 style="font-size:1.6rem; margin-bottom:8px;">Tab 5 — Kitchen Reports & Analytics</h2>
            <p style="color:var(--text-muted); font-size:0.9rem; max-width:520px; margin:0 auto 20px;">
              Food cost calculations, preparation yield tracking, waste logs, ingredient consumption reports, and production performance analytics.
            </p>
            <span class="badge badge-info" style="font-size:0.85rem; padding:6px 14px;">Upcoming Tab</span>
          </div>
        \`;
      }

      mount.querySelectorAll('.btn-kitchen-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          this.kitchenActiveTab = btn.dataset.tab;
          renderView();
        });
      });

      const gotoKdsBtn = mount.querySelector('.btn-goto-kds');
      if (gotoKdsBtn) {
        gotoKdsBtn.addEventListener('click', () => {
          this.renderKDSWorkspace(mount, session);
        });
      }
    };

    renderView();
  }

  renderKDSWorkspace(mount, session) {
    const tickets = [
      { id: 'KOT-101', table: 'T-01', time: '5 mins ago', status: 'NEW', items: [{ name: 'Paneer Butter Masala', qty: 2, note: 'Less spicy' }, { name: 'Butter Naan', qty: 4, note: 'Extra butter' }] },
      { id: 'KOT-102', table: 'T-04', time: '12 mins ago', status: 'PREPARING', items: [{ name: 'Chicken Biryani (Handi)', qty: 1, note: 'Double Raita' }, { name: 'Garlic Naan', qty: 2, note: '' }] },
      { id: 'KOT-103', table: 'T-06', time: '20 mins ago', status: 'READY', items: [{ name: 'Dal Makhani', qty: 1, note: '' }, { name: 'Jeera Rice', qty: 2, note: '' }] }
    ];

    mount.innerHTML = \`
      <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h2 style="font-size:1.75rem; margin:0;">👨‍🍳 Kitchen Display System (KDS)</h2>
            <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">
              Live Food Ticket Queue & Preparation Control Tower
            </p>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <button class="btn-secondary nav-route-btn" data-r="kitchen">👨‍🍳 Exit to Chef Workspace</button>
            <span class="badge badge-info" style="font-size:0.85rem; padding:6px 12px;">🔥 Live Orders: \${tickets.length}</span>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-md">
          \${tickets.map(t => {
            const borderCol = t.status === 'NEW' ? 'var(--status-danger)' : (t.status === 'PREPARING' ? 'var(--status-warning)' : 'var(--status-success)');
            const badgeCls = t.status === 'NEW' ? 'badge-warning' : (t.status === 'PREPARING' ? 'badge-info' : 'badge-success');
            return \`
              <div class="card" style="background:var(--bg-surface-1); border-top:4px solid \${borderCol}; display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="font-size:1.1rem;">\${t.id}</strong>
                    <span class="badge \${badgeCls}">\${t.status}</span>
                  </div>
                  <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">Table: <strong>\${t.table}</strong> • \${t.time}</div>

                  <div style="margin-top:12px; background:var(--bg-surface-2); padding:10px; border-radius:6px;">
                    \${t.items.map(i => \`
                      <div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:4px;">
                        <span><strong>\${i.qty}x</strong> \${i.name}</span>
                      </div>
                      \${i.note ? \`<div style="font-size:0.75rem; color:var(--status-warning); font-style:italic; margin-bottom:4px;">Note: \${i.note}</div>\` : ''}
                    \`).join('')}
                  </div>
                </div>

                <div style="margin-top:14px;">
                  \${t.status === 'NEW' ? \`
                    <button class="btn-primary btn-kot-state" data-id="\${t.id}" data-state="PREPARING" style="width:100%;">🔥 Start Preparation</button>
                  \` : (t.status === 'PREPARING' ? \`
                    <button class="btn-primary btn-kot-state" data-id="\${t.id}" data-state="READY" style="width:100%; background:var(--status-success); border-color:var(--status-success);">✅ Mark Ticket Ready</button>
                  \` : \`
                    <button class="btn-secondary" disabled style="width:100%; opacity:0.6;">✔ Ticket Ready & Dispatched</button>
                  \`)}
                </div>
              </div>
            \`;
          }).join('')}
        </div>
      </div>
    \`;

    mount.querySelectorAll('.nav-route-btn').forEach(b => {
      b.addEventListener('click', () => {
        const r = b.dataset.r;
        if (r) window.location.hash = '#/' + r;
      });
    });

    mount.querySelectorAll('.btn-kot-state').forEach(b => {
      b.addEventListener('click', () => {
        alert(\`✔ KOT \${b.dataset.id} status updated to \${b.dataset.state}!\`);
      });
    });
  }\n\n  `;

bundleContent = bundleContent.slice(0, startIndex) + newKitchenWorkspaceRouter + bundleContent.slice(endIndex);

fs.writeFileSync(bundlePath, bundleContent, 'utf8');
console.log('✅ Fast Node sync finished!');
