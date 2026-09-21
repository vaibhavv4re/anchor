import { offlineStore as globalOfflineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { StockTransferRepository } from '../../../../../businessos/platform/repositories/stockTransferRepository.js';
import { StockOpeningRepository } from '../../../../../businessos/platform/repositories/stockOpeningRepository.js';
import { barReplenishmentModel, computeBarStockStatus, BarStockStatus, BAR_POLICY_CLASSIFICATION_MAP } from '../../../../../businessos/platform/bar/barReplenishmentModel.js';
import { barStockAlertEngine } from '../../../../../businessos/platform/bar/barStockAlertEngine.js';
import { BarReconciliationModal } from './BarReconciliationModal.js';

/**
 * BarInventoryView.js (F8 - Tab 6)
 * Authoritative Read-Only Operational Inventory View for Anchor Bar.
 *
 * Sourced exclusively from:
 *   - storage_locations @ LOC-314 (Bar Store)
 *   - inventory (Master Product Catalog: 50 Bar SKUs)
 *   - stock_balances (Physical on-hand at LOC-314)
 *   - stock_transactions / stock_ledger (Immutable movement history at LOC-314)
 *   - stock_transfers (Authoritative transfers between LOC-805 and LOC-314)
 *   - inventory_requests (Replenishment requests from LOC-314 to LOC-805)
 *
 * Invariants:
 *   - Zero client-side arithmetic stock deductions.
 *   - Bottle calculations derived strictly from SKU-specific configured bottle sizes (e.g. 750ml, 650ml, 330ml).
 *   - Pours display ML equivalent derived from master LTR base UOM.
 *   - Subscribes to 'stock:balance:updated' for zero-reload reactive updates.
 *   - Authoritative 4-state health: OUT, UNCONFIGURED, LOW, HEALTHY. No hardcoded 1.5 LTR fallback.
 */
export class BarInventoryView {
  constructor(deps = {}) {
    this.dataGateway = deps.dataGateway || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.dataGateway : null);
    this.offlineStore = deps.offlineStore || (typeof offlineStore !== 'undefined' ? offlineStore : globalOfflineStore);
    this.eventBus = deps.platformEventBus || deps.eventBus || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform ? window.__APP__.platform.eventBus : null) || platformEventBus;
    this.stockTransferRepository = deps.stockTransferRepository || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform?.repositories?.stockTransfer) || new StockTransferRepository({ dataGateway: this.dataGateway, offlineStore: this.offlineStore, eventBus: this.eventBus });
    this.stockOpeningRepository = deps.stockOpeningRepository || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform?.repositories?.stockOpening) || new StockOpeningRepository({ dataGateway: this.dataGateway, offlineStore: this.offlineStore, eventBus: this.eventBus });
    this.barReplenishmentModel = deps.barReplenishmentModel || barReplenishmentModel;
    this.barStockAlertEngine = deps.barStockAlertEngine || barStockAlertEngine;
    this.barReconciliationModal = new BarReconciliationModal({
      dataGateway: this.dataGateway,
      offlineStore: this.offlineStore,
      onClose: () => {
        if (this._container) this.render(this._container, this._session);
      }
    });

    this.activeSubTab = 'STOCK'; // 'STOCK' | 'MOVEMENTS' | 'TRANSFERS' | 'REPLENISHMENT'
    this.searchQuery = '';
    this.categoryFilter = 'ALL';
    this.statusFilter = 'ALL'; // 'ALL' | 'HEALTHY' | 'LOW' | 'OUT' | 'UNCONFIGURED'
    this.selectedItemDetail = null; // Item code for drawer
    this._container = null;
    this._session = null;
    this._subscribedEvents = false;

    // Warehouse Transfer Modal State (Direct Transfer)
    this.showTransferModal = false;
    this.transferSelectedSku = '';
    this.transferQty = '';
    this.transferNotes = '';
    this.transferError = '';
    this.transferSuccess = '';

    // Controlled Opening Stock Modal State
    this.showOpeningModal = false;
    this.openingSelectedSku = '';
    this.openingQty = '';
    this.openingUnitCost = '';
    this.openingNotes = '';
    this.openingError = '';
    this.openingSuccess = '';

    // Bar Replenishment Requisition Modal State (Request Pipeline)
    this.showReplenishModal = false;
    this.replenishSelectedSku = '';
    this.replenishQty = '';
    this.replenishNotes = '';
    this.replenishError = '';
    this.replenishSuccess = '';

    // Reorder Level Configuration Drawer State
    this.showReorderEdit = false;
    this.reorderEditValue = '';
    this.reorderEditError = '';
  }

  _getCollection(name, tenantId) {
    const store = this.offlineStore || globalOfflineStore;
    let list = [];
    if (store && typeof store.getCollection === 'function') {
      list = store.getCollection(name, tenantId) || [];
    }
    if ((!list || list.length === 0) && this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      list = this.dataGateway.getCachedCollection(name, tenantId) || [];
    }
    if ((!list || list.length === 0) && typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform && window.__APP__.platform.dataGateway) {
      list = window.__APP__.platform.dataGateway.getCachedCollection(name, tenantId) || [];
    }
    return list || [];
  }

  /**
   * Configured pack/bottle size in ML per SKU or category.
   * Does NOT assume a generic 750 ml for all items.
   */
  getPackSizeMl(item) {
    const code = String(item.itemCode || item.item_code || item.id || '').toUpperCase();
    const name = String(item.itemName || item.item_name || item.name || '').toLowerCase();
    const cat = String(item.categoryCode || item.category || '').toUpperCase();

    // 1. Explicit data payload definition if present
    if (item.data && item.data.bottleSizeMl) return parseFloat(item.data.bottleSizeMl);
    if (item.data && item.data.packSizeMl) return parseFloat(item.data.packSizeMl);

    // 2. Beer SKU standard sizes
    if (cat.includes('BEER') || name.includes('beer') || code.includes('BER')) {
      if (name.includes('650') || name.includes('elephant') || name.includes('magnum') || name.includes('pilsner')) return 650;
      if (name.includes('330') || name.includes('corona') || name.includes('hoegaarden')) return 330;
      return 650; // Default Indian beer bottle
    }

    // 3. Breezers
    if (name.includes('breezer')) return 275;

    // 4. Soft Drinks / Cans
    if (name.includes('water')) return 750;
    if (name.includes('soda') || name.includes('cold drink') || name.includes('coke')) return 300;

    // 5. Spirits & Wines (Standard 750 ml bottle unless configured)
    return 750;
  }

  /**
   * Get all Bar SKUs enriched with LOC-314 physical stock balances
   */
  getEnrichedBarInventory(tenantId = 'tenant_h0qc7wf') {
    const allItems = this._getCollection('inventory', tenantId) || [];
    const balances = this._getCollection('stock_balances', tenantId) || [];
    const allRequests = this._getCollection('inventory_requests', tenantId) || [];

    // Map active pending requests for Bar Store
    const pendingBarRequests = allRequests.filter(r => {
      const isBarDept = (r.department === 'Bar Store' || r.department === 'Bar');
      const isBarLoc = (r.toLocationCode === 'LOC-314' || r.to_location === 'LOC-314' || r.to_location_code === 'LOC-314');
      const isPending = (r.status === 'PENDING_FULFILLMENT' || r.status === 'PENDING' || r.status === 'APPROVED');
      return (isBarDept || isBarLoc) && isPending;
    });
    const pendingReqMap = new Map();
    pendingBarRequests.forEach(r => {
      const c = String(r.itemCode || r.item_code || '').toUpperCase();
      if (c && !pendingReqMap.has(c)) {
        pendingReqMap.set(c, r);
      }
    });

    // Filter to Bar items (categories CAT-BEV-ALC, CAT-BEV-SOFT or department BAR or code BARxxxx)
    const barMasterItems = allItems.filter(i => {
      const cat = String(i.categoryCode || i.category || '').toUpperCase();
      const dept = String(i.department || '').toUpperCase();
      const code = String(i.itemCode || i.item_code || i.id || '').toUpperCase();
      return cat.includes('BEV') || cat.includes('BAR') || dept.includes('BAR') || code.startsWith('BAR');
    });

    return barMasterItems.map(item => {
      const code = String(item.itemCode || item.item_code || item.id || '');
      const name = item.itemName || item.item_name || item.name || 'Bar SKU';
      const category = item.categoryCode || item.category || 'LIQUOR';
      const baseUom = (item.baseUom || item.base_uom || 'LTR').toUpperCase();
      const costPrice = parseFloat(item.unitValuation || item.cost_price || item.unit_cost || 0);

      // Match balance strictly at LOC-314 (Bar Store)
      const locBalance = balances.find(b => {
        const iMatch = String(b.itemCode || b.item_code || b.itemId || b.id || '').toUpperCase() === code.toUpperCase();
        const loc = String(b.locationCode || b.location_code || '').toUpperCase();
        const tMatch = !tenantId || b.tenantId === tenantId || b.tenant_id === tenantId;
        return iMatch && tMatch && (loc === 'LOC-314' || loc === 'BAR' || loc.includes('BAR'));
      });

      const onHand = locBalance ? (parseFloat(locBalance.quantity !== undefined ? locBalance.quantity : (locBalance.data?.quantity || 0)) || 0) : 0;
      const valuation = locBalance ? (parseFloat(locBalance.valuation || 0) || (onHand * costPrice)) : (onHand * costPrice);

      // Bottle conversion based on SKU pack size
      const packSizeMl = this.getPackSizeMl(item);
      let bottleEquivalentStr = '';
      let remainingPegs30 = 0;
      let remainingPegs60 = 0;

      if (baseUom === 'LTR') {
        const totalMl = onHand * 1000;
        const fullBottles = Math.floor(totalMl / packSizeMl);
        const remMl = Math.round(totalMl % packSizeMl);
        
        if (onHand <= 0) {
          bottleEquivalentStr = `0 bottles`;
        } else if (remMl === 0) {
          bottleEquivalentStr = `${fullBottles} × ${packSizeMl}ml bottle${fullBottles !== 1 ? 's' : ''}`;
        } else {
          bottleEquivalentStr = `${fullBottles} × ${packSizeMl}ml + ${remMl}ml open`;
        }
        remainingPegs30 = Math.floor(totalMl / 30);
        remainingPegs60 = Math.floor(totalMl / 60);
      } else {
        // BOTTLE or UNIT
        bottleEquivalentStr = `${Math.floor(onHand)} sealed bottle${Math.floor(onHand) !== 1 ? 's' : ''}`;
        remainingPegs30 = '-';
        remainingPegs60 = '-';
      }

      // Stock health classification (Authoritative Phase B-04B Domain Contract)
      // Pure 4-state contract: OUT takes precedence when onHand <= 0.
      // Zero synthetic 1.5 LTR fallback.
      const rawReorder = item.reorderLevel !== undefined ? item.reorderLevel : (item.reorder_level !== undefined ? item.reorder_level : item.data?.reorderLevel);
      const reorderLevel = (rawReorder !== undefined && rawReorder !== null && !isNaN(parseFloat(rawReorder))) ? parseFloat(rawReorder) : null;
      const status = computeBarStockStatus(onHand, reorderLevel);
      const pendingRequest = pendingReqMap.get(code.toUpperCase()) || null;

      return {
        id: item.id || code,
        code,
        name,
        category,
        baseUom,
        packSizeMl,
        onHand,
        valuation,
        costPrice,
        bottleEquivalentStr,
        remainingPegs30,
        remainingPegs60,
        reorderLevel,
        status,
        hasPendingRequest: !!pendingRequest,
        pendingRequest
      };
    });
  }

  /**
   * Get immutable ledger transactions affecting LOC-314
   */
  getBarTransactions(tenantId = 'tenant_h0qc7wf') {
    const txns = this._getCollection('stock_transactions', tenantId) || [];
    const ledger = this._getCollection('stock_ledger', tenantId) || [];
    const all = [...txns, ...ledger];

    return all.filter(t => {
      const loc = String(t.locationCode || t.location_code || t.toLocationCode || '').toUpperCase();
      const fromLoc = String(t.fromLocationCode || '').toUpperCase();
      return loc === 'LOC-314' || loc === 'BAR' || fromLoc === 'LOC-314';
    }).sort((a, b) => new Date(b.occurredAt || b.timestamp || b.created_at || 0) - new Date(a.occurredAt || a.timestamp || a.created_at || 0));
  }

  /**
   * Get stock transfers affecting LOC-314
   */
  getBarTransfers(tenantId = 'tenant_h0qc7wf') {
    const trfs = this._getCollection('stock_transfers', tenantId) || [];
    return trfs.filter(t => {
      const from = String(t.fromLocationCode || t.from_location_code || '').toUpperCase();
      const to = String(t.toLocationCode || t.to_location_code || '').toUpperCase();
      return from === 'LOC-314' || to === 'LOC-314' || from === 'BAR' || to === 'BAR';
    }).sort((a, b) => new Date(b.transferDate || b.created_at || b.postedAt || 0) - new Date(a.transferDate || a.created_at || a.postedAt || 0));
  }

  render(container, session) {
    this._container = container;
    this._session = session;
    const tenantId = session ? session.tenantId : 'tenant_h0qc7wf';

    if (!this._subscribedEvents) {
      this._subscribedEvents = true;
      const refresh = () => {
        if (this._container && (typeof document === 'undefined' || !document.body || document.body.contains(this._container))) {
          this.render(this._container, this._session);
        }
      };
      if (this.eventBus && typeof this.eventBus.subscribe === 'function') {
        this.eventBus.subscribe('stock:balance:updated', refresh);
        this.eventBus.subscribe('stock:updated', refresh);
        this.eventBus.subscribe('bar:replenishment_requested', refresh);
        this.eventBus.subscribe('bar:replenishment_fulfilled', refresh);
        this.eventBus.subscribe('inventory:reorder_policy_applied', refresh);
        this.eventBus.subscribe('stock:threshold_breached', refresh);
        this.eventBus.subscribe('stock:threshold_recovered', refresh);
      }
    }

    const items = this.getEnrichedBarInventory(tenantId);
    const transactions = this.getBarTransactions(tenantId);
    const transfers = this.getBarTransfers(tenantId);
    const barRequests = this.barReplenishmentModel.getBarReplenishmentRequests(tenantId);
    const allBalances = this._getCollection('stock_balances', tenantId) || [];
    const activeAlerts = this.barStockAlertEngine ? this.barStockAlertEngine.getActiveAlerts(tenantId) : [];

    // KPI Summary (Authoritative 4-state contract + unconfigured breakdown)
    const totalSkus = items.length;
    const healthyCount = items.filter(i => i.status === 'HEALTHY').length;
    const lowCount = items.filter(i => i.status === 'LOW').length;
    const outCount = items.filter(i => i.status === 'OUT').length;
    const unconfiguredCount = items.filter(i => i.status === 'UNCONFIGURED').length;
    const totalValuation = items.reduce((acc, i) => acc + (i.valuation || 0), 0);

    // Filtered Items for Display
    let filteredItems = items;
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      filteredItems = filteredItems.filter(i => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
    }
    if (this.categoryFilter !== 'ALL') {
      filteredItems = filteredItems.filter(i => i.category.toUpperCase() === this.categoryFilter);
    }
    if (this.statusFilter !== 'ALL') {
      filteredItems = filteredItems.filter(i => i.status === this.statusFilter);
    }

    container.innerHTML = `
      <div class="animate-fade-in" style="display:flex; flex-direction:column; gap:20px;">

        <!-- ACTIVE LOW-STOCK & OUT ALERT BANNER (PHASE B-04D) -->
        ${activeAlerts.length > 0 ? `
          <div class="card animate-fade-in" style="background:rgba(239,68,68,0.07); border:1px solid rgba(239,68,68,0.35); border-radius:12px; padding:16px 20px; display:flex; flex-direction:column; gap:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-size:1.4rem;">🚨</span>
                <div>
                  <div style="color:#ef4444; font-weight:800; font-size:1rem; display:flex; align-items:center; gap:8px;">
                    Active Low-Stock &amp; Out Alerts
                    <span class="badge" style="background:#ef4444; color:#fff; font-size:0.75rem; padding:2px 8px; font-weight:900; border-radius:10px;">
                      ${activeAlerts.length}
                    </span>
                  </div>
                  <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">
                    Authoritative stock breaches detected at LOC-314. Click any item to raise a replenishment request.
                  </div>
                </div>
              </div>
              <button id="btn-quick-replenish-first-alert" data-code="${activeAlerts[0].itemCode}" style="padding:6px 14px; font-size:0.8rem; font-weight:800; background:#3b82f6; color:#fff; border:none; border-radius:6px; cursor:pointer; box-shadow:0 2px 6px rgba(59,130,246,0.3);">
                📩 Restock ${activeAlerts[0].itemCode}
              </button>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
              ${activeAlerts.map(a => `
                <div class="bar-alert-pill btn-trigger-replenish-sku" data-code="${a.itemCode}" style="cursor:pointer; background:${a.status === 'OUT' ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)'}; border:1px solid ${a.status === 'OUT' ? 'rgba(239,68,68,0.5)' : 'rgba(245,158,11,0.5)'}; border-radius:8px; padding:6px 12px; display:flex; align-items:center; gap:8px; transition:transform 0.15s ease;">
                  <span style="font-weight:900; font-size:0.75rem; color:${a.status === 'OUT' ? '#ef4444' : '#f59e0b'};">
                    ${a.status === 'OUT' ? '🔴 OUT' : '🟡 LOW'}
                  </span>
                  <strong style="font-size:0.82rem; color:var(--text-primary); font-family:monospace;">${a.itemCode}</strong>
                  <span style="font-size:0.82rem; color:var(--text-secondary);">${a.itemName}</span>
                  <span style="font-size:0.75rem; color:var(--text-muted);">(${a.quantity.toFixed(a.uom === 'LTR' ? 3 : 0)} / ${a.reorderLevel.toFixed(a.uom === 'LTR' ? 3 : 0)} ${a.uom})</span>
                  <span style="font-size:0.75rem; font-weight:800; color:#3b82f6;">➔ Restock</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        
        <!-- HEADER COCKPIT -->
        <div class="card" style="background:var(--bg-surface-1); padding:20px; border:1px solid var(--border-subtle); border-radius:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <div>
              <div style="font-size:0.75rem; color:#ec4899; font-weight:800; text-transform:uppercase; letter-spacing:0.05em;">BAR STORE — LOC-314</div>
              <h2 style="font-size:1.5rem; margin-top:2px; margin-bottom:0; font-weight:800; display:flex; align-items:center; gap:8px;">
                📦 Bar Inventory Ledger &amp; Stock Truth
              </h2>
              <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">
                Direct operational visibility of spirits, beers, wines &amp; mixers at <strong>LOC-314</strong>. Zero client-side arithmetic.
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="badge" style="background:rgba(236,72,153,0.15); color:#ec4899; border:1px solid rgba(236,72,153,0.4); font-size:0.82rem; padding:6px 12px; font-weight:800;">
                LOC-314 Active Store
              </span>
              <button id="btn-open-bar-reconcile-modal" style="background:#059669; color:#fff; border:none; padding:8px 16px; border-radius:8px; font-size:0.85rem; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(5,150,105,0.3);">
                📋 Close Shift &amp; Reconcile
              </button>
              <button id="btn-open-bar-replenish-modal" style="background:#3b82f6; color:#fff; border:none; padding:8px 16px; border-radius:8px; font-size:0.85rem; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(59,130,246,0.3);">
                📩 Request Replenishment
              </button>
              <button id="btn-open-bar-opening-modal" style="background:#8b5cf6; color:#fff; border:none; padding:8px 16px; border-radius:8px; font-size:0.85rem; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(139,92,246,0.3);">
                🍸 Record Opening Stock
              </button>
              <button id="btn-open-bar-transfer-modal" style="background:#ec4899; color:#fff; border:none; padding:8px 16px; border-radius:8px; font-size:0.85rem; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(236,72,153,0.3);">
                📦 Transfer from Main Warehouse
              </button>
            </div>
          </div>

          <!-- KPI Summary Strip (Authoritative 6-Column Strip) -->
          <div style="display:grid; grid-template-columns:repeat(6, 1fr); gap:12px; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <div class="card" style="background:var(--bg-surface-2); padding:12px 16px; border-radius:8px;">
              <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">TOTAL BAR SKUS</div>
              <div style="font-size:1.6rem; font-weight:800; margin-top:2px;">${totalSkus}</div>
              <div style="font-size:0.72rem; color:var(--text-muted);">Master Catalog</div>
            </div>
            <div class="card" style="background:var(--bg-surface-2); padding:12px 16px; border-radius:8px; border-left:3px solid #10b981;">
              <div style="font-size:0.72rem; color:#10b981; font-weight:700;">IN STOCK &amp; HEALTHY</div>
              <div style="font-size:1.6rem; font-weight:800; color:#10b981; margin-top:2px;">${healthyCount}</div>
              <div style="font-size:0.72rem; color:var(--text-muted);">Above Reorder Level</div>
            </div>
            <div class="card" style="background:var(--bg-surface-2); padding:12px 16px; border-radius:8px; border-left:3px solid #f59e0b;">
              <div style="font-size:0.72rem; color:#f59e0b; font-weight:700;">LOW STOCK ALERTS</div>
              <div style="font-size:1.6rem; font-weight:800; color:#f59e0b; margin-top:2px;">${lowCount}</div>
              <div style="font-size:0.72rem; color:var(--text-muted);">At / Below Reorder</div>
            </div>
            <div class="card" style="background:var(--bg-surface-2); padding:12px 16px; border-radius:8px; border-left:3px solid #ef4444;">
              <div style="font-size:0.72rem; color:#ef4444; font-weight:700;">OUT OF STOCK</div>
              <div style="font-size:1.6rem; font-weight:800; color:#ef4444; margin-top:2px;">${outCount}</div>
              <div style="font-size:0.72rem; color:var(--text-muted);">Precedence (0 Stock)</div>
            </div>
            <div class="card" style="background:var(--bg-surface-2); padding:12px 16px; border-radius:8px; border-left:3px solid #94a3b8;">
              <div style="font-size:0.72rem; color:#94a3b8; font-weight:700;">UNCONFIGURED</div>
              <div style="font-size:1.6rem; font-weight:800; color:#94a3b8; margin-top:2px;">${unconfiguredCount}</div>
              <div style="font-size:0.72rem; color:var(--text-muted);">No Threshold Set</div>
            </div>
            <div class="card" style="background:var(--bg-surface-2); padding:12px 16px; border-radius:8px;">
              <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">ESTIMATED VALUATION</div>
              <div style="font-size:1.6rem; font-weight:800; margin-top:2px; color:var(--accent-primary);">₹${totalValuation.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              <div style="font-size:0.72rem; color:var(--text-muted);">At Cost Valuation</div>
            </div>
          </div>

          <!-- Navigation Subtabs -->
          <div style="display:flex; gap:8px; margin-top:16px; border-top:1px solid var(--border-subtle); padding-top:14px;">
            <button class="btn-bar-inv-subtab ${this.activeSubTab === 'STOCK' ? 'active' : ''}" data-subtab="STOCK" style="padding:8px 18px; font-size:0.85rem; font-weight:800; border-radius:6px; cursor:pointer; background:${this.activeSubTab === 'STOCK' ? '#ec4899' : 'var(--bg-surface-2)'}; color:${this.activeSubTab === 'STOCK' ? '#fff' : 'var(--text-primary)'}; border:none;">
              🧾 Stock on Hand (${filteredItems.length})
            </button>
            <button class="btn-bar-inv-subtab ${this.activeSubTab === 'REPLENISHMENT' ? 'active' : ''}" data-subtab="REPLENISHMENT" style="padding:8px 18px; font-size:0.85rem; font-weight:800; border-radius:6px; cursor:pointer; background:${this.activeSubTab === 'REPLENISHMENT' ? '#ec4899' : 'var(--bg-surface-2)'}; color:${this.activeSubTab === 'REPLENISHMENT' ? '#fff' : 'var(--text-primary)'}; border:none;">
              📩 Requisitions (${barRequests.length})
            </button>
            <button class="btn-bar-inv-subtab ${this.activeSubTab === 'MOVEMENTS' ? 'active' : ''}" data-subtab="MOVEMENTS" style="padding:8px 18px; font-size:0.85rem; font-weight:800; border-radius:6px; cursor:pointer; background:${this.activeSubTab === 'MOVEMENTS' ? '#ec4899' : 'var(--bg-surface-2)'}; color:${this.activeSubTab === 'MOVEMENTS' ? '#fff' : 'var(--text-primary)'}; border:none;">
              📜 Movement History (${transactions.length})
            </button>
            <button class="btn-bar-inv-subtab ${this.activeSubTab === 'TRANSFERS' ? 'active' : ''}" data-subtab="TRANSFERS" style="padding:8px 18px; font-size:0.85rem; font-weight:800; border-radius:6px; cursor:pointer; background:${this.activeSubTab === 'TRANSFERS' ? '#ec4899' : 'var(--bg-surface-2)'}; color:${this.activeSubTab === 'TRANSFERS' ? '#fff' : 'var(--text-primary)'}; border:none;">
              🚚 Warehouse Transfers (${transfers.length})
            </button>
          </div>
        </div>

        <!-- MAIN SUBTAB CONTENT -->
        ${this.activeSubTab === 'STOCK' ? this.renderStockTable(filteredItems) : (this.activeSubTab === 'REPLENISHMENT' ? this.renderRequisitionsTable(barRequests) : (this.activeSubTab === 'MOVEMENTS' ? this.renderMovementsTable(transactions) : this.renderTransfersTable(transfers)))}

      </div>

      <!-- OPERATIONAL TRUTH ITEM DRAWER -->
      ${this.selectedItemDetail ? this.renderItemDetailDrawer(items.find(i => i.code === this.selectedItemDetail), transactions) : ''}

      <!-- BAR REPLENISHMENT REQUISITION MODAL -->
      ${this.showReplenishModal ? this.renderReplenishModal(items, allBalances) : ''}

      <!-- WAREHOUSE TRANSFER MODAL -->
      ${this.showTransferModal ? this.renderTransferModal(items, allBalances) : ''}

      <!-- CONTROLLED OPENING STOCK MODAL -->
      ${this.showOpeningModal ? this.renderOpeningModal(items, allBalances) : ''}
    `;

    this.bindEvents(container);
  }

  renderStockTable(items) {
    return `
      <div class="card" style="background:var(--bg-surface-1); padding:20px; border-radius:12px; border:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:16px;">
        
        <!-- SEARCH & FILTER BAR -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:10px; flex:1; max-width:420px;">
            <input type="text" id="inp-bar-inv-search" value="${this.searchQuery}" placeholder="🔍 Search brand, whisky, beer, code..." style="width:100%; padding:8px 14px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:8px; color:var(--text-primary); font-size:0.88rem;">
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <select id="sel-bar-inv-cat" style="padding:8px 12px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:8px; color:var(--text-primary); font-size:0.85rem; font-weight:700;">
              <option value="ALL" ${this.categoryFilter === 'ALL' ? 'selected' : ''}>All Categories</option>
              <option value="CAT-BEV-ALC" ${this.categoryFilter === 'CAT-BEV-ALC' ? 'selected' : ''}>Liquor &amp; Spirits (ALC)</option>
              <option value="CAT-BEV-SOFT" ${this.categoryFilter === 'CAT-BEV-SOFT' ? 'selected' : ''}>Soft Drinks &amp; Mixers</option>
            </select>
            <select id="sel-bar-inv-status" style="padding:8px 12px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:8px; color:var(--text-primary); font-size:0.85rem; font-weight:700;">
              <option value="ALL" ${this.statusFilter === 'ALL' ? 'selected' : ''}>All Statuses</option>
              <option value="HEALTHY" ${this.statusFilter === 'HEALTHY' ? 'selected' : ''}>🟢 Healthy</option>
              <option value="LOW" ${this.statusFilter === 'LOW' ? 'selected' : ''}>🟡 Low Stock</option>
              <option value="OUT" ${this.statusFilter === 'OUT' ? 'selected' : ''}>🔴 Out of Stock</option>
              <option value="UNCONFIGURED" ${this.statusFilter === 'UNCONFIGURED' ? 'selected' : ''}>⚪ Unconfigured</option>
            </select>
          </div>
        </div>

        <!-- INVENTORY TABLE -->
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.88rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">
                <th style="padding:12px 16px;">SKU / Code</th>
                <th style="padding:12px 16px;">Brand &amp; Item Name</th>
                <th style="padding:12px 16px;">Pack Size</th>
                <th style="padding:12px 16px; text-align:right;">On Hand (LOC-314)</th>
                <th style="padding:12px 16px;">Bottle Equivalent</th>
                <th style="padding:12px 16px; text-align:center;">Pegs (30 / 60 ml)</th>
                <th style="padding:12px 16px;">Status</th>
                <th style="padding:12px 16px; text-align:right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${items.length > 0 ? items.map(item => `
                <tr class="bar-inv-row" data-code="${item.code}" style="border-bottom:1px solid var(--border-subtle); cursor:pointer; transition:background 0.15s ease;">
                  <td style="padding:12px 16px; font-family:monospace; font-weight:700; color:var(--text-muted);">${item.code}</td>
                  <td style="padding:12px 16px;">
                    <div style="font-weight:800; color:var(--text-primary); font-size:0.92rem;">${item.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${item.category}</div>
                  </td>
                  <td style="padding:12px 16px; color:var(--text-muted); font-weight:600;">
                    ${item.packSizeMl} ML Bottle
                  </td>
                  <td style="padding:12px 16px; text-align:right;">
                    <span style="font-weight:900; font-size:1rem; color:${item.onHand > 0 ? '#10b981' : '#ef4444'};">
                      ${item.onHand.toFixed(item.baseUom === 'LTR' ? 3 : 0)}
                    </span>
                    <span style="font-size:0.75rem; color:var(--text-muted); margin-left:2px;">${item.baseUom}</span>
                  </td>
                  <td style="padding:12px 16px; font-weight:700; color:var(--text-secondary);">
                    ${item.bottleEquivalentStr}
                  </td>
                  <td style="padding:12px 16px; text-align:center; font-family:monospace; font-weight:700; color:var(--text-muted);">
                    ${item.remainingPegs30 !== '-' ? `${item.remainingPegs30} / ${item.remainingPegs60}` : '-'}
                  </td>
                  <td style="padding:12px 16px;">
                    ${item.status === 'HEALTHY' ? '<span class="badge" style="background:#10b98122; color:#10b981; border:1px solid #10b981; font-size:0.72rem; padding:3px 8px;">🟢 Healthy</span>' : ''}
                    ${item.status === 'LOW' ? '<span class="badge" style="background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b; font-size:0.72rem; padding:3px 8px;">🟡 Low Stock</span>' : ''}
                    ${item.status === 'OUT' ? '<span class="badge" style="background:#ef444422; color:#ef4444; border:1px solid #ef4444; font-size:0.72rem; padding:3px 8px;">🔴 Out of Stock</span>' : ''}
                    ${item.status === 'UNCONFIGURED' ? '<span class="badge" style="background:rgba(148,163,184,0.2); color:#94a3b8; border:1px solid #94a3b8; font-size:0.72rem; padding:3px 8px;">⚪ Unconfigured</span>' : ''}
                    ${item.hasPendingRequest ? '<div style="margin-top:4px;"><span class="badge" style="background:rgba(59,130,246,0.18); color:#3b82f6; border:1px solid rgba(59,130,246,0.4); font-size:0.7rem; padding:2px 6px;">📩 Req Pending</span></div>' : ''}
                  </td>
                  <td style="padding:12px 16px; text-align:right;">
                    <button class="btn-secondary btn-trigger-replenish-sku" data-code="${item.code}" style="padding:6px 10px; font-size:0.78rem; font-weight:800; color:#3b82f6; border-color:rgba(59,130,246,0.4);" title="Request replenishment from Warehouse">
                      📩 Request
                    </button>
                    <button class="btn-secondary btn-view-item-detail" data-code="${item.code}" style="padding:6px 12px; font-size:0.78rem; font-weight:800; margin-left:6px;">
                      🔍 Audit
                    </button>
                    <button class="btn-secondary btn-trigger-opening-sku" data-code="${item.code}" style="padding:6px 12px; font-size:0.78rem; font-weight:800; margin-left:6px; color:#8b5cf6; border-color:rgba(139,92,246,0.4);">
                      🍸 Count
                    </button>
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="8" style="padding:36px; text-align:center; color:var(--text-muted);">
                    No matching Bar items found in Inventory Master.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderMovementsTable(transactions) {
    return `
      <div class="card" style="background:var(--bg-surface-1); padding:20px; border-radius:12px; border:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:16px;">
        <h3 style="margin:0; font-size:1.1rem; font-weight:800;">📜 LOC-314 Immutable Stock Ledger</h3>
        <div style="font-size:0.85rem; color:var(--text-muted);">Authoritative audit log of all stock receipts, transfers, and sales consumption at Bar Store.</div>

        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.88rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">
                <th style="padding:12px 16px;">Date / Time</th>
                <th style="padding:12px 16px;">Transaction Type</th>
                <th style="padding:12px 16px;">Document / Ref</th>
                <th style="padding:12px 16px;">Item Code</th>
                <th style="padding:12px 16px; text-align:right;">Quantity Change</th>
                <th style="padding:12px 16px;">Posted By</th>
              </tr>
            </thead>
            <tbody>
              ${transactions.length > 0 ? transactions.map(t => {
                const qty = parseFloat(t.baseQuantity || t.quantity || 0);
                const isPositive = qty > 0;
                return `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:12px 16px; color:var(--text-muted);">${new Date(t.occurredAt || t.timestamp || t.created_at || Date.now()).toLocaleString()}</td>
                    <td style="padding:12px 16px; font-weight:800;">${t.transactionType || t.type || 'MOVEMENT'}</td>
                    <td style="padding:12px 16px; font-family:monospace;">${t.documentNo || t.referenceId || t.operation_id || '-'}</td>
                    <td style="padding:12px 16px; font-weight:700;">${t.itemCode || t.item_code || '-'}</td>
                    <td style="padding:12px 16px; text-align:right; font-weight:900; color:${isPositive ? '#10b981' : '#ef4444'};">
                      ${isPositive ? '+' : ''}${qty} ${t.baseUom || t.uom || ''}
                    </td>
                    <td style="padding:12px 16px; color:var(--text-muted);">${t.performedBy || t.postedBy || 'System'}</td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="6" style="padding:36px; text-align:center; color:var(--text-muted);">
                    Zero stock transactions recorded at LOC-314 yet.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderTransfersTable(transfers) {
    return `
      <div class="card" style="background:var(--bg-surface-1); padding:20px; border-radius:12px; border:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin:0; font-size:1.1rem; font-weight:800;">🚚 Warehouse Stock Transfers</h3>
            <div style="font-size:0.85rem; color:var(--text-muted);">Authoritative stock transfer operations between Main Warehouse (LOC-805) and Bar Store (LOC-314).</div>
          </div>
          <button id="btn-trigger-bar-transfer-subtab" style="background:#ec4899; color:#fff; border:none; padding:8px 16px; border-radius:8px; font-size:0.85rem; font-weight:800; cursor:pointer;">
            ➕ New Warehouse Transfer
          </button>
        </div>

        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.88rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">
                <th style="padding:12px 16px;">Transfer No</th>
                <th style="padding:12px 16px;">Date</th>
                <th style="padding:12px 16px;">Route</th>
                <th style="padding:12px 16px;">Items &amp; Quantities</th>
                <th style="padding:12px 16px;">Status</th>
                <th style="padding:12px 16px;">Posted By</th>
              </tr>
            </thead>
            <tbody>
              ${transfers.length > 0 ? transfers.map(t => {
                const lines = t.lines || t.data?.lines || [];
                return `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:12px 16px; font-weight:800; font-family:monospace;">${t.transferNo || t.transfer_number || t.id}</td>
                    <td style="padding:12px 16px; color:var(--text-muted);">${t.transferDate || t.transfer_date || new Date(t.created_at || Date.now()).toLocaleDateString()}</td>
                    <td style="padding:12px 16px; font-weight:700;">
                      <span class="badge" style="background:rgba(255,255,255,0.06); padding:3px 8px; border-radius:4px;">${t.fromLocationCode || t.from_location_code}</span>
                      →
                      <span class="badge" style="background:rgba(236,72,153,0.15); color:#ec4899; padding:3px 8px; border-radius:4px;">${t.toLocationCode || t.to_location_code}</span>
                    </td>
                    <td style="padding:12px 16px;">
                      ${lines.map(l => `<div><strong>${l.itemCode}</strong>: ${l.quantity} ${l.baseUom || 'Units'} (${l.itemName || ''})</div>`).join('')}
                    </td>
                    <td style="padding:12px 16px;">
                      <span class="badge" style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:800; padding:4px 8px; border-radius:4px;">${t.status || 'COMPLETED'}</span>
                    </td>
                    <td style="padding:12px 16px; color:var(--text-muted);">${t.postedBy || 'Admin'}</td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="6" style="padding:36px; text-align:center; color:var(--text-muted);">
                    Zero warehouse transfers recorded for LOC-314 yet.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderRequisitionsTable(requests) {
    const role = String(this._session?.role || this._session?.userRole || this._session?.employeeRole || '').toLowerCase();
    const perms = Array.isArray(this._session?.permissions) ? this._session.permissions : [];
    const canFulfill = role.includes('admin') || 
      role.includes('inventory') || 
      role.includes('manager') || 
      role.includes('owner') ||
      perms.includes('MANAGE_INVENTORY') || 
      perms.includes('BAR_INVENTORY_MANAGE') || 
      perms.includes('*');

    return `
      <div class="card" style="background:var(--bg-surface-1); padding:20px; border-radius:12px; border:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h3 style="margin:0; font-size:1.1rem; font-weight:800;">📩 Bar Stock Replenishment Requisitions</h3>
            <div style="font-size:0.85rem; color:var(--text-muted);">Authoritative request pipeline for restocking Bar Store (LOC-314) from Main Warehouse (LOC-805).</div>
          </div>
          <button id="btn-trigger-bar-replenish-subtab" style="background:#3b82f6; color:#fff; border:none; padding:8px 16px; border-radius:8px; font-size:0.85rem; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:6px;">
            ➕ Raise Replenishment Request
          </button>
        </div>

        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.88rem;">
            <thead>
              <tr style="background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">
                <th style="padding:12px 16px;">Request No</th>
                <th style="padding:12px 16px;">Date / Time</th>
                <th style="padding:12px 16px;">Item Code &amp; Name</th>
                <th style="padding:12px 16px; text-align:right;">Requested Qty</th>
                <th style="padding:12px 16px;">Snapshots (On Hand / Reorder)</th>
                <th style="padding:12px 16px;">Requester</th>
                <th style="padding:12px 16px;">Status</th>
                <th style="padding:12px 16px;">Fulfillment Lineage</th>
                <th style="padding:12px 16px; text-align:right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${requests.length > 0 ? requests.map(r => {
                const isCompleted = r.status === 'COMPLETED';
                const isPending = r.status === 'PENDING_FULFILLMENT' || r.status === 'PENDING';
                return `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:12px 16px; font-weight:800; font-family:monospace; color:var(--text-primary);">${r.requestNumber || r.request_number || r.id}</td>
                    <td style="padding:12px 16px; color:var(--text-muted); font-size:0.82rem;">${new Date(r.requestedAt || r.createdAt || Date.now()).toLocaleString()}</td>
                    <td style="padding:12px 16px;">
                      <div style="font-weight:800; color:var(--text-primary);">${r.itemName || r.item_name || r.itemCode}</div>
                      <div style="font-size:0.75rem; font-family:monospace; color:var(--text-muted);">${r.itemCode || r.item_code}</div>
                    </td>
                    <td style="padding:12px 16px; text-align:right; font-weight:900; font-size:1rem; color:var(--accent-primary);">
                      ${r.requestedQuantity || r.requested_quantity} ${r.uom || 'LTR'}
                    </td>
                    <td style="padding:12px 16px; font-size:0.82rem; color:var(--text-secondary);">
                      <div>On-Hand: <strong>${r.onHandAtRequest !== undefined ? r.onHandAtRequest : '-'}</strong> ${r.uom || ''}</div>
                      <div style="color:var(--text-muted);">Reorder: ${r.reorderLevelAtRequest !== undefined ? r.reorderLevelAtRequest : '-'} ${r.uom || ''}</div>
                    </td>
                    <td style="padding:12px 16px; color:var(--text-muted); font-size:0.85rem;">${r.requestedBy || r.requested_by || 'Bartender'}</td>
                    <td style="padding:12px 16px;">
                      ${isCompleted ? '<span class="badge" style="background:#10b98122; color:#10b981; border:1px solid #10b981; font-size:0.75rem; padding:4px 8px;">🟢 COMPLETED</span>' : ''}
                      ${isPending ? '<span class="badge" style="background:#3b82f622; color:#3b82f6; border:1px solid #3b82f6; font-size:0.75rem; padding:4px 8px;">🔵 PENDING</span>' : ''}
                      ${!isCompleted && !isPending ? `<span class="badge" style="background:var(--bg-surface-2); font-size:0.75rem; padding:4px 8px;">${r.status}</span>` : ''}
                    </td>
                    <td style="padding:12px 16px; font-size:0.82rem;">
                      ${r.fulfillmentTransferId ? `<div style="font-family:monospace; font-weight:800; color:#10b981;">🚚 ${r.fulfillmentTransferId}</div>` : '<span style="color:var(--text-muted);">-</span>'}
                      ${r.fulfilledBy ? `<div style="font-size:0.75rem; color:var(--text-muted);">By ${r.fulfilledBy}</div>` : ''}
                    </td>
                    <td style="padding:12px 16px; text-align:right;">
                      ${isPending && canFulfill ? `
                        <button class="btn-secondary btn-fulfill-bar-req" data-req-id="${r.id}" style="padding:6px 12px; font-size:0.78rem; font-weight:800; color:#10b981; border-color:rgba(16,185,129,0.4);">
                          🚚 Fulfill
                        </button>
                      ` : ''}
                    </td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="9" style="padding:36px; text-align:center; color:var(--text-muted);">
                    Zero replenishment requests recorded for Bar Store yet.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderOpeningModal(items, allBalances) {
    const selectedItem = items.find(i => i.code === (this.openingSelectedSku || items[0]?.code)) || items[0] || null;
    const selectedCode = selectedItem ? selectedItem.code : '';
    
    // Balance at LOC-314
    const curBal = allBalances.find(b => (b.itemCode === selectedCode || b.item_code === selectedCode) && (b.locationCode === 'LOC-314' || b.location_code === 'LOC-314'));
    const onHandQty = curBal ? (parseFloat(curBal.quantity) || 0) : 0;
    const defaultCost = selectedItem ? (selectedItem.costPrice || (selectedItem.valuation > 0 && onHandQty > 0 ? (selectedItem.valuation / onHandQty) : 0) || 180) : 180;
    const costToUse = parseFloat(this.openingUnitCost) || defaultCost;

    const countQty = parseFloat(this.openingQty) || 0;
    const isValid = selectedCode && countQty > 0;
    const totalValuation = Math.round(countQty * costToUse * 100) / 100;

    // Bottle & peg conversion preview for entered count
    let bottleEquiv = '';
    let pegs30 = 0;
    let pegs60 = 0;
    if (selectedItem) {
      if (selectedItem.baseUom === 'LTR') {
        const totalMl = countQty * 1000;
        const fullBottles = Math.floor(totalMl / selectedItem.packSizeMl);
        const remMl = Math.round(totalMl % selectedItem.packSizeMl);
        if (remMl === 0) {
          bottleEquiv = `${fullBottles} × ${selectedItem.packSizeMl}ml bottle${fullBottles !== 1 ? 's' : ''}`;
        } else {
          bottleEquiv = `${fullBottles} × ${selectedItem.packSizeMl}ml + ${remMl}ml open`;
        }
        pegs30 = Math.floor(totalMl / 30);
        pegs60 = Math.floor(totalMl / 60);
      } else {
        bottleEquiv = `${countQty} sealed unit${countQty !== 1 ? 's' : ''}`;
      }
    }

    return `
      <div id="bar-opening-modal-overlay" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; z-index:999999; padding:20px;">
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:14px; width:100%; max-width:620px; max-height:90vh; overflow-y:auto; padding:24px; box-shadow:var(--shadow-xl); display:flex; flex-direction:column; gap:20px;">
          
          <!-- MODAL HEADER -->
          <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid var(--border-subtle); padding-bottom:16px;">
            <div>
              <div style="font-size:0.75rem; color:#8b5cf6; font-weight:800; text-transform:uppercase; letter-spacing:0.05em;">BAR STORE — LOC-314</div>
              <h3 style="margin:4px 0 0; font-size:1.3rem; font-weight:800; display:flex; align-items:center; gap:8px;">
                🍸 Record Bar Opening Stock
              </h3>
              <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
                Establish authoritative physical count for Bar Store. Invariant: Recorded strictly via immutable <strong>OPENING_STOCK</strong> ledger transactions.
              </div>
            </div>
            <button id="btn-close-bar-opening-modal" style="background:none; border:none; color:var(--text-muted); font-size:1.5rem; cursor:pointer; padding:4px;">✕</button>
          </div>

          <!-- NOTIFICATIONS -->
          ${this.openingError ? `
            <div style="padding:12px 16px; background:rgba(239,68,68,0.15); border:1px solid #ef4444; border-radius:8px; color:#ef4444; font-size:0.85rem; font-weight:700;">
              ${this.openingError}
            </div>
          ` : ''}
          ${this.openingSuccess ? `
            <div style="padding:12px 16px; background:rgba(16,185,129,0.15); border:1px solid #10b981; border-radius:8px; color:#10b981; font-size:0.85rem; font-weight:700;">
              ${this.openingSuccess}
            </div>
          ` : ''}

          <!-- SKU PICKER -->
          <div>
            <label style="display:block; font-size:0.8rem; font-weight:800; color:var(--text-secondary); margin-bottom:6px;">
              SELECT BAR SKU (50 REGISTERED ITEMS)
            </label>
            <select id="sel-opening-sku" style="width:100%; padding:10px 14px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:8px; color:var(--text-primary); font-size:0.9rem; font-weight:700;">
              ${items.map(i => `
                <option value="${i.code}" ${i.code === selectedCode ? 'selected' : ''}>
                  ${i.code} — ${i.name} (${i.category}) [Current: ${i.onHand.toFixed(i.baseUom === 'LTR' ? 3 : 0)} ${i.baseUom}]
                </option>
              `).join('')}
            </select>
          </div>

          <!-- SKU CONTEXT CARD -->
          ${selectedItem ? `
            <div class="card" style="background:var(--bg-surface-2); padding:16px; border-radius:10px; display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; border:1px solid var(--border-subtle);">
              <div>
                <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">PACK / BOTTLE SIZE</div>
                <div style="font-size:1.05rem; font-weight:800; margin-top:2px;">${selectedItem.packSizeMl} ML</div>
              </div>
              <div>
                <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">CURRENT ON-HAND @ LOC-314</div>
                <div style="font-size:1.05rem; font-weight:800; margin-top:2px; color:${onHandQty > 0 ? '#10b981' : '#f59e0b'};">
                  ${onHandQty.toFixed(selectedItem.baseUom === 'LTR' ? 3 : 0)} ${selectedItem.baseUom}
                </div>
              </div>
              <div>
                <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">AUTHORITATIVE UNIT COST</div>
                <div style="font-size:1.05rem; font-weight:800; margin-top:2px; color:var(--accent-primary);">
                  ₹${costToUse.toFixed(2)} / ${selectedItem.baseUom}
                </div>
              </div>
            </div>
          ` : ''}

          <!-- EXISTING BALANCE SAFETY ALERT (GATE 0) -->
          ${onHandQty > 0 ? `
            <div style="padding:10px 14px; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.4); border-radius:8px; color:#f59e0b; font-size:0.8rem; line-height:1.4;">
              ⚠️ <strong>Gate 0 Existing Balance Protection:</strong> This SKU already has <strong>${onHandQty} ${selectedItem.baseUom}</strong> at LOC-314 (e.g. from previous transfer). Posting opening stock will increment the physical ledger, preserving existing inventory without overwriting.
            </div>
          ` : ''}

          <!-- QUANTITY & VALUATION ROW -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <label style="display:block; font-size:0.8rem; font-weight:800; color:var(--text-secondary); margin-bottom:6px;">
                PHYSICAL OPENING COUNT (${selectedItem ? selectedItem.baseUom : 'UNITS'})
              </label>
              <input type="number" id="inp-opening-qty" min="0.001" step="0.001" value="${this.openingQty}" placeholder="e.g. 5.0" style="width:100%; padding:10px 14px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:8px; color:var(--text-primary); font-size:1rem; font-weight:800;">
            </div>
            <div>
              <label style="display:block; font-size:0.8rem; font-weight:800; color:var(--text-secondary); margin-bottom:6px;">
                UNIT COST VALUATION (₹ / ${selectedItem ? selectedItem.baseUom : 'UNIT'})
              </label>
              <input type="number" id="inp-opening-cost" min="0" step="0.01" value="${this.openingUnitCost || defaultCost}" style="width:100%; padding:10px 14px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:8px; color:var(--text-primary); font-size:1rem; font-weight:800;">
            </div>
          </div>

          <!-- DYNAMIC EQUIVALENCE PREVIEW -->
          ${countQty > 0 && selectedItem ? `
            <div class="card" style="padding:14px; background:rgba(139,92,246,0.08); border:1px solid rgba(139,92,246,0.25); border-radius:8px; display:flex; flex-direction:column; gap:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.82rem; color:var(--text-muted); font-weight:700;">Derived Physical Units:</span>
                <span style="font-size:0.95rem; font-weight:800; color:var(--text-primary);">${bottleEquiv}</span>
              </div>
              ${selectedItem.baseUom === 'LTR' ? `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.82rem; color:var(--text-muted); font-weight:700;">Potential Servings:</span>
                  <span style="font-size:0.88rem; font-weight:700; color:var(--accent-primary);">${pegs30} × 30ml pegs / ${pegs60} × 60ml pegs</span>
                </div>
              ` : ''}
              <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(139,92,246,0.2); padding-top:6px;">
                <span style="font-size:0.85rem; color:#8b5cf6; font-weight:800;">Calculated Opening Valuation:</span>
                <span style="font-size:1.15rem; font-weight:900; color:#8b5cf6;">₹${totalValuation.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          ` : ''}

          <!-- AUDIT NOTES -->
          <div>
            <label style="display:block; font-size:0.8rem; font-weight:800; color:var(--text-secondary); margin-bottom:6px;">
              AUDIT NOTES / COUNT REFERENCE (OPTIONAL)
            </label>
            <input type="text" id="inp-opening-notes" value="${this.openingNotes}" placeholder="e.g. Physical stock take prior to bar shift opening" style="width:100%; padding:10px 14px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:8px; color:var(--text-primary); font-size:0.85rem;">
          </div>

          <!-- MODAL ACTIONS -->
          <div style="display:flex; justify-content:flex-end; gap:12px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button id="btn-cancel-bar-opening" style="padding:10px 18px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); color:var(--text-primary); font-weight:700; cursor:pointer;">
              Cancel
            </button>
            <button id="btn-submit-bar-opening" ${!isValid ? 'disabled' : ''} style="padding:10px 22px; border-radius:8px; border:none; background:${isValid ? '#8b5cf6' : '#6b7280'}; color:#fff; font-weight:800; cursor:${isValid ? 'pointer' : 'not-allowed'}; box-shadow:${isValid ? '0 2px 10px rgba(139,92,246,0.4)' : 'none'};">
              🚀 Confirm &amp; Post Opening Stock
            </button>
          </div>

        </div>
      </div>
    `;
  }

  renderTransferModal(items, allBalances) {
    const selectedItem = items.find(i => i.code === (this.transferSelectedSku || items[0]?.code)) || items[0] || null;
    const selectedCode = selectedItem ? selectedItem.code : '';
    
    const srcBal = allBalances.find(b => (b.itemCode === selectedCode || b.item_code === selectedCode) && (b.locationCode === 'LOC-805' || b.location_code === 'LOC-805'));
    const availQty = srcBal ? (parseFloat(srcBal.quantity) || 0) : 0;
    const reqQty = parseFloat(this.transferQty) || 0;
    const isOverQty = reqQty > availQty;
    const isValid = selectedCode && reqQty > 0 && !isOverQty;

    return `
      <div id="bar-transfer-modal-overlay" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; z-index:999999; padding:20px;">
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:14px; width:100%; max-width:600px; max-height:90vh; overflow-y:auto; padding:24px; box-shadow:var(--shadow-xl); display:flex; flex-direction:column; gap:20px;">
          
          <!-- MODAL HEADER -->
          <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid var(--border-subtle); padding-bottom:16px;">
            <div>
              <div style="font-size:0.75rem; color:#ec4899; font-weight:800; text-transform:uppercase;">STOCK TRANSFER PROTOCOL</div>
              <h3 style="margin:4px 0 0; font-size:1.3rem; font-weight:800;">📦 Transfer from Main Warehouse</h3>
              <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
                Move certified stock from <strong>LOC-805</strong> to Bar Store <strong>LOC-314</strong>.
              </div>
            </div>
            <button id="btn-close-bar-transfer-modal" style="background:none; border:none; color:var(--text-muted); font-size:1.5rem; cursor:pointer; padding:4px;">✕</button>
          </div>

          <!-- ROUTING BADGES -->
          <div style="display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:12px; background:var(--bg-surface-2); padding:14px 18px; border-radius:10px;">
            <div>
              <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">SOURCE LOCATION (LOCKED)</div>
              <div style="font-weight:800; font-size:0.95rem; color:var(--text-primary); margin-top:2px;">LOC-805</div>
              <div style="font-size:0.78rem; color:var(--text-muted);">Main Warehouse</div>
            </div>
            <div style="font-size:1.3rem; color:#ec4899; text-align:center;">➔</div>
            <div>
              <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">DESTINATION (LOCKED)</div>
              <div style="font-weight:800; font-size:0.95rem; color:#ec4899; margin-top:2px;">LOC-314</div>
              <div style="font-size:0.78rem; color:var(--text-muted);">Bar Store</div>
            </div>
          </div>

          ${this.transferError ? `
            <div style="background:rgba(239,68,68,0.15); border:1px solid #ef4444; color:#ef4444; padding:12px 16px; border-radius:8px; font-size:0.88rem; font-weight:700;">
              ${this.transferError}
            </div>
          ` : ''}

          ${this.transferSuccess ? `
            <div style="background:rgba(16,185,129,0.15); border:1px solid #10b981; color:#10b981; padding:12px 16px; border-radius:8px; font-size:0.88rem; font-weight:700;">
              ${this.transferSuccess}
            </div>
          ` : ''}

          <!-- FORM FIELDS -->
          <div style="display:flex; flex-direction:column; gap:16px;">
            
            <!-- SKU SELECTION (STRICTLY 50 BAR SKUs) -->
            <div>
              <label style="display:block; font-size:0.82rem; font-weight:800; color:var(--text-secondary); margin-bottom:6px;">
                SELECT BAR SKU (${items.length} Registered Bar Items)
              </label>
              <select id="sel-transfer-sku" style="width:100%; padding:10px 14px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:8px; color:var(--text-primary); font-size:0.9rem; font-weight:700;">
                ${items.map(i => {
                  const b = allBalances.find(x => (x.itemCode === i.code || x.item_code === i.code) && (x.locationCode === 'LOC-805' || x.location_code === 'LOC-805'));
                  const q = b ? (parseFloat(b.quantity) || 0) : 0;
                  return `
                    <option value="${i.code}" ${i.code === (this.transferSelectedSku || selectedCode) ? 'selected' : ''}>
                      [${i.code}] ${i.name} (${i.baseUom}) — Available at LOC-805: ${q.toFixed(2)}
                    </option>
                  `;
                }).join('')}
              </select>
            </div>

            <!-- SOURCE STOCK STATUS NOTICE -->
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-2); padding:10px 14px; border-radius:8px; font-size:0.85rem;">
              <span style="color:var(--text-muted);">Available in LOC-805:</span>
              <strong style="font-size:1.05rem; color:${availQty > 0 ? '#10b981' : '#ef4444'};">
                ${availQty.toFixed(2)} ${selectedItem ? selectedItem.baseUom : 'Units'}
              </strong>
            </div>

            <!-- TRANSFER QUANTITY -->
            <div>
              <label style="display:block; font-size:0.82rem; font-weight:800; color:var(--text-secondary); margin-bottom:6px;">
                TRANSFER QUANTITY (${selectedItem ? selectedItem.baseUom : 'Units'})
              </label>
              <input type="number" id="inp-transfer-qty" min="0.001" step="any" max="${availQty}" value="${this.transferQty}" placeholder="Enter quantity to transfer (max ${availQty})..." style="width:100%; padding:10px 14px; background:var(--bg-surface-2); border:1px solid ${isOverQty ? '#ef4444' : 'var(--border-subtle)'}; border-radius:8px; color:var(--text-primary); font-size:1.05rem; font-weight:800;">
              ${isOverQty ? `
                <div style="color:#ef4444; font-size:0.8rem; font-weight:700; margin-top:4px;">
                  ⚠️ Requested quantity (${reqQty}) exceeds available warehouse balance (${availQty}).
                </div>
              ` : ''}
              ${selectedItem && reqQty > 0 && !isOverQty ? `
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">
                  Equivalent: approx. ${(reqQty * 1000 / selectedItem.packSizeMl).toFixed(1)} bottles (${selectedItem.packSizeMl}ml)
                </div>
              ` : ''}
            </div>

            <!-- OPTIONAL NOTES -->
            <div>
              <label style="display:block; font-size:0.82rem; font-weight:800; color:var(--text-secondary); margin-bottom:6px;">
                TRANSFER NOTES (OPTIONAL)
              </label>
              <input type="text" id="inp-transfer-notes" value="${this.transferNotes}" placeholder="e.g. Weekly bar restocking, shift handoff..." style="width:100%; padding:8px 14px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:8px; color:var(--text-primary); font-size:0.85rem;">
            </div>

          </div>

          <!-- ACTIONS -->
          <div style="display:flex; justify-content:flex-end; gap:12px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button id="btn-cancel-bar-transfer" style="padding:10px 18px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); color:var(--text-primary); font-weight:700; cursor:pointer;">
              Cancel
            </button>
            <button id="btn-submit-bar-transfer" ${!isValid ? 'disabled' : ''} style="padding:10px 22px; border-radius:8px; border:none; background:${isValid ? '#ec4899' : '#6b7280'}; color:#fff; font-weight:800; cursor:${isValid ? 'pointer' : 'not-allowed'}; box-shadow:${isValid ? '0 2px 10px rgba(236,72,153,0.4)' : 'none'};">
              🚀 Post Transfer to Bar Store
            </button>
          </div>

        </div>
      </div>
    `;
  }

  renderReplenishModal(items, allBalances) {
    const selectedItem = items.find(i => i.code === (this.replenishSelectedSku || items[0]?.code)) || items[0] || null;
    const selectedCode = selectedItem ? selectedItem.code : '';
    
    // Balance at LOC-314
    const onHand = selectedItem ? selectedItem.onHand : 0;
    const reorderLevel = selectedItem ? selectedItem.reorderLevel : null;

    // Advisory Suggested Quantity (derived from authoritative reserve policy)
    const policy = BAR_POLICY_CLASSIFICATION_MAP[selectedCode];
    const reservePacks = policy ? policy.reservePacks : 2;
    const packSizeMl = selectedItem ? (selectedItem.packSizeMl || policy?.packSizeMl || 750) : 750;
    const packLtr = packSizeMl / 1000;
    const deficitLtr = (reorderLevel && reorderLevel > onHand) ? (reorderLevel - onHand) : 0;
    const suggestedPacks = deficitLtr > 0 ? Math.ceil(deficitLtr / packLtr) : reservePacks;
    const suggestedQtyNum = (policy && policy.baseUom === 'LTR') ? (suggestedPacks * packLtr) : suggestedPacks;
    const suggestedQty = (policy && policy.baseUom === 'LTR') ? suggestedQtyNum.toFixed(3) : String(suggestedPacks);

    const activeQtyVal = (this.replenishQty !== undefined && this.replenishQty !== '') ? this.replenishQty : suggestedQty;
    const reqQty = parseFloat(activeQtyVal) || 0;
    const isValid = selectedCode && reqQty > 0;

    return `
      <div id="bar-replenish-modal-overlay" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; z-index:999999; padding:20px;">
        <div class="card animate-fade-in" style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:14px; width:100%; max-width:600px; max-height:90vh; overflow-y:auto; padding:24px; box-shadow:var(--shadow-xl); display:flex; flex-direction:column; gap:20px;">
          
          <!-- MODAL HEADER -->
          <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid var(--border-subtle); padding-bottom:16px;">
            <div>
              <div style="font-size:0.75rem; color:#3b82f6; font-weight:800; text-transform:uppercase; letter-spacing:0.05em;">BAR REPLENISHMENT REQUISITION</div>
              <h3 style="margin:4px 0 0; font-size:1.3rem; font-weight:800; display:flex; align-items:center; gap:8px;">
                📩 Request Stock from Warehouse
              </h3>
              <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
                Raise an authoritative replenishment request for Bar Store (<strong>LOC-314</strong>).
              </div>
            </div>
            <button id="btn-close-bar-replenish-modal" style="background:none; border:none; color:var(--text-muted); font-size:1.5rem; cursor:pointer; padding:4px;">✕</button>
          </div>

          <!-- ROUTING BADGES -->
          <div style="display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:12px; background:var(--bg-surface-2); padding:14px 18px; border-radius:10px;">
            <div>
              <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">SOURCE WAREHOUSE (LOCKED)</div>
              <div style="font-weight:800; font-size:0.95rem; color:var(--text-primary); margin-top:2px;">LOC-805</div>
              <div style="font-size:0.78rem; color:var(--text-muted);">Main Warehouse</div>
            </div>
            <div style="font-size:1.3rem; color:#3b82f6; text-align:center;">➔</div>
            <div>
              <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">REQUESTING STORE (LOCKED)</div>
              <div style="font-weight:800; font-size:0.95rem; color:#3b82f6; margin-top:2px;">LOC-314</div>
              <div style="font-size:0.78rem; color:var(--text-muted);">Bar Store</div>
            </div>
          </div>

          <!-- NOTIFICATIONS -->
          ${this.replenishError ? `
            <div style="background:rgba(239,68,68,0.15); border:1px solid #ef4444; color:#ef4444; padding:12px 16px; border-radius:8px; font-size:0.88rem; font-weight:700;">
              ${this.replenishError}
            </div>
          ` : ''}

          ${this.replenishSuccess ? `
            <div style="background:rgba(16,185,129,0.15); border:1px solid #10b981; color:#10b981; padding:12px 16px; border-radius:8px; font-size:0.88rem; font-weight:700;">
              ${this.replenishSuccess}
            </div>
          ` : ''}

          <!-- SKU SELECTION -->
          <div>
            <label style="display:block; font-size:0.82rem; font-weight:800; color:var(--text-secondary); margin-bottom:6px;">
              SELECT BAR SKU (${items.length} Registered Bar Items)
            </label>
            <select id="sel-replenish-sku" style="width:100%; padding:10px 14px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:8px; color:var(--text-primary); font-size:0.9rem; font-weight:700;">
              ${items.map(i => `
                <option value="${i.code}" ${i.code === selectedCode ? 'selected' : ''}>
                  [${i.code}] ${i.name} (${i.baseUom}) — On Hand: ${i.onHand.toFixed(i.baseUom === 'LTR' ? 3 : 0)} [${i.status}]
                </option>
              `).join('')}
            </select>
          </div>

          <!-- OPERATIONAL SNAPSHOT PREVIEW CARD -->
          ${selectedItem ? `
            <div class="card" style="background:var(--bg-surface-2); padding:16px; border-radius:10px; display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; border:1px solid var(--border-subtle);">
              <div>
                <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">ON HAND AT REQUEST</div>
                <div style="font-size:1.1rem; font-weight:800; margin-top:2px; color:${onHand > 0 ? '#10b981' : '#ef4444'};">
                  ${onHand.toFixed(selectedItem.baseUom === 'LTR' ? 3 : 0)} ${selectedItem.baseUom}
                </div>
              </div>
              <div>
                <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">REORDER THRESHOLD</div>
                <div style="font-size:1.1rem; font-weight:800; margin-top:2px; color:var(--text-primary);">
                  ${reorderLevel !== null && reorderLevel > 0 ? `${reorderLevel.toFixed(selectedItem.baseUom === 'LTR' ? 3 : 0)} ${selectedItem.baseUom}` : 'Not configured'}
                </div>
              </div>
              <div>
                <div style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">HEALTH STATUS</div>
                <div style="font-size:1.1rem; font-weight:800; margin-top:2px;">
                  ${selectedItem.status}
                </div>
              </div>
            </div>
          ` : ''}

          <!-- ADVISORY SUGGESTED QUANTITY CARD -->
          <div class="card" style="background:var(--bg-surface-2); padding:14px 16px; border-radius:10px; border:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Suggested quantity</div>
              <div style="font-size:1.35rem; font-weight:900; color:var(--accent-primary); margin-top:2px;">
                ${suggestedQty} ${selectedItem ? selectedItem.baseUom : 'LTR'}
              </div>
              <div style="font-size:0.78rem; color:var(--text-muted); margin-top:4px;">
                ⓘ Suggested from the configured reserve policy (${reservePacks} packs × ${packSizeMl}ml). You can change this quantity before submitting.
              </div>
            </div>
            <button type="button" id="btn-use-suggested-qty" data-suggested="${suggestedQty}" style="padding:8px 14px; font-size:0.78rem; font-weight:800; background:rgba(59,130,246,0.15); color:#3b82f6; border:1px solid rgba(59,130,246,0.4); border-radius:6px; cursor:pointer;">
              Reset to Suggested
            </button>
          </div>

          <!-- REQUESTED QUANTITY -->
          <div>
            <label style="display:block; font-size:0.82rem; font-weight:800; color:var(--text-secondary); margin-bottom:6px;">
              REQUESTED QUANTITY (${selectedItem ? selectedItem.baseUom : 'Units'})
            </label>
            <input type="number" id="inp-replenish-qty" min="0.001" step="any" value="${activeQtyVal}" placeholder="Enter quantity needed..." style="width:100%; padding:10px 14px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:8px; color:var(--text-primary); font-size:1.05rem; font-weight:800;">
            ${selectedItem && reqQty > 0 ? `
              <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">
                Equivalent: approx. ${(reqQty * 1000 / packSizeMl).toFixed(1)} bottles (${packSizeMl}ml)
              </div>
            ` : ''}
          </div>

          <!-- OPTIONAL NOTES -->
          <div>
            <label style="display:block; font-size:0.82rem; font-weight:800; color:var(--text-secondary); margin-bottom:6px;">
              REQUEST NOTES (OPTIONAL)
            </label>
            <input type="text" id="inp-replenish-notes" value="${this.replenishNotes}" placeholder="e.g. Running low before weekend rush..." style="width:100%; padding:8px 14px; background:var(--bg-surface-2); border:1px solid var(--border-subtle); border-radius:8px; color:var(--text-primary); font-size:0.85rem;">
          </div>

          <!-- DOMAIN SAFETY INVARIANT ALERT -->
          <div style="padding:10px 14px; background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.3); border-radius:8px; color:#3b82f6; font-size:0.8rem; line-height:1.4;">
            ℹ️ <strong>REQUEST ≠ STOCK MOVEMENT:</strong> Raising this request registers an operational snapshot in <code>inventory_requests</code> with <code>PENDING_FULFILLMENT</code>. Stock balances and ledger records are completely untouched until Warehouse fulfills this request.
          </div>

          <!-- ACTIONS -->
          <div style="display:flex; justify-content:flex-end; gap:12px; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button id="btn-cancel-bar-replenish" style="padding:10px 18px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-surface-2); color:var(--text-primary); font-weight:700; cursor:pointer;">
              Cancel
            </button>
            <button id="btn-submit-bar-replenish" ${!isValid ? 'disabled' : ''} style="padding:10px 22px; border-radius:8px; border:none; background:${isValid ? '#3b82f6' : '#6b7280'}; color:#fff; font-weight:800; cursor:${isValid ? 'pointer' : 'not-allowed'}; box-shadow:${isValid ? '0 2px 10px rgba(59,130,246,0.4)' : 'none'};">
              🚀 Submit Replenishment Request
            </button>
          </div>

        </div>
      </div>
    `;
  }

  renderItemDetailDrawer(item, allTransactions) {
    if (!item) return '';

    const itemTxns = allTransactions.filter(t => (t.itemCode || t.item_code || '').toUpperCase() === item.code.toUpperCase());

    // Governance Capability Check: Only inventory managers / admins can edit master reorder levels
    const role = String(this._session?.role || this._session?.userRole || this._session?.employeeRole || '').toLowerCase();
    const perms = Array.isArray(this._session?.permissions) ? this._session.permissions : [];
    const canManageReorder = role.includes('admin') || 
      role.includes('inventory') || 
      role.includes('manager') || 
      role.includes('owner') ||
      perms.includes('MANAGE_INVENTORY') || 
      perms.includes('BAR_INVENTORY_MANAGE') || 
      perms.includes('*');

    return `
      <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.75); display:flex; justify-content:flex-end; z-index:99999;">
        <div class="animate-fade-in" style="width:100%; max-width:540px; height:100%; background:var(--bg-surface-1); border-left:1px solid var(--border-subtle); display:flex; flex-direction:column; box-shadow:var(--shadow-xl);">
          
          <!-- DRAWER HEADER -->
          <div style="padding:20px 24px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <span class="badge" style="background:rgba(236,72,153,0.15); color:#ec4899; font-size:0.75rem; padding:3px 8px; font-weight:800;">
                ${item.code}
              </span>
              <h3 style="margin:6px 0 2px; font-size:1.3rem; font-weight:800;">${item.name}</h3>
              <div style="font-size:0.8rem; color:var(--text-muted);">${item.category} • Pack Size: ${item.packSizeMl} ML</div>
            </div>
            <button id="btn-close-bar-inv-drawer" style="background:none; border:none; color:var(--text-muted); font-size:1.5rem; cursor:pointer; padding:4px;">✕</button>
          </div>

          <!-- DRAWER BODY -->
          <div style="flex:1; overflow-y:auto; padding:24px; display:flex; flex-direction:column; gap:20px;">
            
            <!-- CURRENT ON-HAND & STOCK HEALTH CARD -->
            <div class="card" style="padding:16px; background:var(--bg-surface-2); border-radius:10px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">STOCK ON HAND (LOC-314)</div>
                  <div style="font-size:2.2rem; font-weight:900; color:${item.onHand > 0 ? '#10b981' : '#ef4444'}; margin-top:2px;">
                    ${item.onHand.toFixed(item.baseUom === 'LTR' ? 3 : 0)} <span style="font-size:1.1rem; color:var(--text-muted); font-weight:700;">${item.baseUom}</span>
                  </div>
                </div>
                <div>
                  ${item.status === 'HEALTHY' ? '<span class="badge" style="background:#10b98122; color:#10b981; border:1px solid #10b981; font-size:0.8rem; padding:4px 10px; font-weight:800;">🟢 Healthy</span>' : ''}
                  ${item.status === 'LOW' ? '<span class="badge" style="background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b; font-size:0.8rem; padding:4px 10px; font-weight:800;">🟡 Low Stock</span>' : ''}
                  ${item.status === 'OUT' ? '<span class="badge" style="background:#ef444422; color:#ef4444; border:1px solid #ef4444; font-size:0.8rem; padding:4px 10px; font-weight:800;">🔴 Out of Stock</span>' : ''}
                  ${item.status === 'UNCONFIGURED' ? '<span class="badge" style="background:rgba(148,163,184,0.2); color:#94a3b8; border:1px solid #94a3b8; font-size:0.8rem; padding:4px 10px; font-weight:800;">⚪ Unconfigured</span>' : ''}
                </div>
              </div>
              <div style="font-size:0.9rem; font-weight:700; color:var(--text-secondary); margin-top:4px;">
                ${item.bottleEquivalentStr}
              </div>
              ${item.remainingPegs30 !== '-' ? `
                <div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border-subtle); display:flex; gap:16px; font-size:0.82rem;">
                  <div>Remaining 30ml Pegs: <strong style="color:var(--accent-primary);">${item.remainingPegs30}</strong></div>
                  <div>Remaining 60ml Pegs: <strong style="color:var(--accent-primary);">${item.remainingPegs60}</strong></div>
                </div>
              ` : ''}
            </div>

            <!-- REPLENISHMENT CONFIGURATION (GOVERNANCE GUARD) -->
            <div class="card" style="padding:16px; background:var(--bg-surface-2); border-radius:10px;">
              <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">REPLENISHMENT SPECIFICATION</div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <div>
                  <div style="font-size:0.8rem; color:var(--text-muted);">Reorder Level:</div>
                  <div style="font-size:1.15rem; font-weight:800; color:var(--text-primary); margin-top:2px;">
                    ${item.reorderLevel !== null && item.reorderLevel > 0 ? `${item.reorderLevel.toFixed(item.baseUom === 'LTR' ? 3 : 0)} ${item.baseUom}` : '<span style="color:var(--text-muted); font-weight:600;">Not configured</span>'}
                  </div>
                </div>
                ${canManageReorder ? `
                  <button id="btn-toggle-reorder-edit" style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); padding:6px 12px; border-radius:6px; font-size:0.8rem; font-weight:700; cursor:pointer; color:var(--text-primary);">
                    ⚙️ Configure Reorder Level
                  </button>
                ` : ''}
              </div>

              ${canManageReorder && this.showReorderEdit ? `
                <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:8px;">
                  <label style="font-size:0.75rem; font-weight:800; color:var(--text-secondary);">NEW REORDER LEVEL (${item.baseUom})</label>
                  <div style="display:flex; gap:8px;">
                    <input type="number" id="inp-new-reorder-level" min="0" step="any" value="${this.reorderEditValue !== '' ? this.reorderEditValue : (item.reorderLevel !== null && item.reorderLevel > 0 ? item.reorderLevel : '')}" placeholder="e.g. 2.000" style="flex:1; padding:8px 12px; background:var(--bg-surface-1); border:1px solid var(--border-subtle); border-radius:6px; font-weight:800; color:var(--text-primary);">
                    <button id="btn-save-reorder-level" data-code="${item.code}" style="background:#10b981; color:#fff; border:none; padding:8px 16px; border-radius:6px; font-weight:800; font-size:0.85rem; cursor:pointer;">Save</button>
                    <button id="btn-cancel-reorder-edit" style="background:var(--bg-surface-1); border:1px solid var(--border-subtle); padding:8px 12px; border-radius:6px; font-weight:700; font-size:0.85rem; cursor:pointer;">Cancel</button>
                  </div>
                  ${this.reorderEditError ? `<div style="color:#ef4444; font-size:0.75rem; font-weight:700;">${this.reorderEditError}</div>` : ''}
                </div>
              ` : ''}
            </div>

            <!-- AUDIT HISTORY LIST -->
            <div>
              <h4 style="margin:0 0 10px; font-size:0.95rem; font-weight:800;">MOVEMENT AUDIT TRAIL (LOC-314)</h4>
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${itemTxns.length > 0 ? itemTxns.map(t => {
                  const qty = parseFloat(t.baseQuantity || t.quantity || 0);
                  const isPos = qty > 0;
                  return `
                    <div style="padding:10px 14px; background:var(--bg-surface-2); border-radius:8px; display:flex; justify-content:space-between; align-items:center; font-size:0.85rem;">
                      <div>
                        <div style="font-weight:800;">${t.transactionType || 'MOVEMENT'}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${new Date(t.occurredAt || t.timestamp || 0).toLocaleString()}</div>
                      </div>
                      <div style="font-weight:900; font-size:0.95rem; color:${isPos ? '#10b981' : '#ef4444'};">
                        ${isPos ? '+' : ''}${qty} ${item.baseUom}
                      </div>
                    </div>
                  `;
                }).join('') : `
                  <div style="padding:20px; text-align:center; color:var(--text-muted); font-size:0.85rem; background:var(--bg-surface-2); border-radius:8px;">
                    No ledger transactions recorded for this SKU yet.
                  </div>
                `}
              </div>
            </div>

          </div>

        </div>
      </div>
    `;
  }

  bindEvents(container) {
    if (!container) return;

    // Subtab switching
    container.querySelectorAll('.btn-bar-inv-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeSubTab = btn.dataset.subtab;
        this.render(this._container, this._session);
      });
    });

    // Search input
    const searchInp = container.querySelector('#inp-bar-inv-search');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.render(this._container, this._session);
      });
    }

    // Category filter
    const catSel = container.querySelector('#sel-bar-inv-cat');
    if (catSel) {
      catSel.addEventListener('change', (e) => {
        this.categoryFilter = e.target.value;
        this.render(this._container, this._session);
      });
    }

    // Status filter
    const statSel = container.querySelector('#sel-bar-inv-status');
    if (statSel) {
      statSel.addEventListener('change', (e) => {
        this.statusFilter = e.target.value;
        this.render(this._container, this._session);
      });
    }

    // View Item Detail Drawer
    container.querySelectorAll('.btn-view-item-detail, .bar-inv-row').forEach(el => {
      el.addEventListener('click', (e) => {
        const code = el.dataset.code;
        if (code) {
          this.selectedItemDetail = code;
          this.render(this._container, this._session);
        }
      });
    });

    // Close Item Detail Drawer
    const closeBtn = container.querySelector('#btn-close-bar-inv-drawer');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.selectedItemDetail = null;
        this.render(this._container, this._session);
      });
    }

    // Open Transfer Modal
    const openTrfBtn = container.querySelector('#btn-open-bar-transfer-modal');
    if (openTrfBtn) {
      openTrfBtn.addEventListener('click', () => {
        this.showTransferModal = true;
        this.transferError = '';
        this.transferSuccess = '';
        this.render(this._container, this._session);
      });
    }

    const openTrfSubtabBtn = container.querySelector('#btn-trigger-bar-transfer-subtab');
    if (openTrfSubtabBtn) {
      openTrfSubtabBtn.addEventListener('click', () => {
        this.showTransferModal = true;
        this.transferError = '';
        this.transferSuccess = '';
        this.render(this._container, this._session);
      });
    }

    // Close Transfer Modal
    const closeTrfBtn = container.querySelector('#btn-close-bar-transfer-modal');
    if (closeTrfBtn) {
      closeTrfBtn.addEventListener('click', () => {
        this.showTransferModal = false;
        this.render(this._container, this._session);
      });
    }

    const cancelTrfBtn = container.querySelector('#btn-cancel-bar-transfer');
    if (cancelTrfBtn) {
      cancelTrfBtn.addEventListener('click', () => {
        this.showTransferModal = false;
        this.render(this._container, this._session);
      });
    }

    // Change Selected SKU in Modal
    const selSku = container.querySelector('#sel-transfer-sku');
    if (selSku) {
      selSku.addEventListener('change', (e) => {
        this.transferSelectedSku = e.target.value;
        this.transferError = '';
        this.render(this._container, this._session);
      });
    }

    // Change Transfer Quantity
    const qtyInp = container.querySelector('#inp-transfer-qty');
    if (qtyInp) {
      qtyInp.addEventListener('input', (e) => {
        this.transferQty = e.target.value;
        this.transferError = '';
        this.render(this._container, this._session);
      });
    }

    // Change Transfer Notes
    const notesInp = container.querySelector('#inp-transfer-notes');
    if (notesInp) {
      notesInp.addEventListener('input', (e) => {
        this.transferNotes = e.target.value;
      });
    }

    // Submit Stock Transfer
    const submitTrfBtn = container.querySelector('#btn-submit-bar-transfer');
    if (submitTrfBtn) {
      submitTrfBtn.addEventListener('click', async () => {
        const tenantId = this._session ? this._session.tenantId : 'tenant_h0qc7wf';
        const items = this.getEnrichedBarInventory(tenantId);
        const selectedSku = this.transferSelectedSku || items[0]?.code;
        const item = items.find(i => i.code === selectedSku);
        const qty = parseFloat(this.transferQty) || 0;

        if (!selectedSku || qty <= 0) {
          this.transferError = 'Please select a valid Bar SKU and enter quantity > 0.';
          this.render(this._container, this._session);
          return;
        }

        submitTrfBtn.disabled = true;
        submitTrfBtn.innerText = 'Posting Transfer...';

        try {
          const res = this.stockTransferRepository.postTransfer({
            fromLocationCode: 'LOC-805',
            toLocationCode: 'LOC-314',
            notes: this.transferNotes || '',
            lines: [
              {
                itemCode: selectedSku,
                itemName: item ? item.name : selectedSku,
                quantity: qty,
                baseUom: item ? item.baseUom : 'Units'
              }
            ]
          }, this._session);

          if (res.success) {
            this.transferSuccess = `🎉 Successfully transferred ${qty} ${item ? item.baseUom : ''} to Bar Store (Transfer ${res.transfer.transferNo})!`;
            this.transferQty = '';
            this.transferNotes = '';
            setTimeout(() => {
              this.showTransferModal = false;
              this.transferSuccess = '';
              this.render(this._container, this._session);
            }, 1200);
          } else {
            this.transferError = res.error || 'Failed to post stock transfer.';
            this.render(this._container, this._session);
          }
        } catch (err) {
          this.transferError = 'Exception posting transfer: ' + (err.message || err);
          this.render(this._container, this._session);
        }
      });
    }
    // Open Opening Stock Modal
    const openOpBtn = container.querySelector('#btn-open-bar-opening-modal');
    if (openOpBtn) {
      openOpBtn.addEventListener('click', () => {
        this.showOpeningModal = true;
        this.openingError = '';
        this.openingSuccess = '';
        this.render(this._container, this._session);
      });
    }

    // Row-level Opening Stock Trigger
    container.querySelectorAll('.btn-trigger-opening-sku').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = el.dataset.code;
        if (code) {
          this.openingSelectedSku = code;
          this.showOpeningModal = true;
          this.openingError = '';
          this.openingSuccess = '';
          this.render(this._container, this._session);
        }
      });
    });

    // Close Opening Stock Modal
    const closeOpBtn = container.querySelector('#btn-close-bar-opening-modal');
    if (closeOpBtn) {
      closeOpBtn.addEventListener('click', () => {
        this.showOpeningModal = false;
        this.render(this._container, this._session);
      });
    }

    const cancelOpBtn = container.querySelector('#btn-cancel-bar-opening');
    if (cancelOpBtn) {
      cancelOpBtn.addEventListener('click', () => {
        this.showOpeningModal = false;
        this.render(this._container, this._session);
      });
    }

    // Change Selected SKU in Opening Modal
    const selOpSku = container.querySelector('#sel-opening-sku');
    if (selOpSku) {
      selOpSku.addEventListener('change', (e) => {
        this.openingSelectedSku = e.target.value;
        this.openingError = '';
        this.openingUnitCost = '';
        this.render(this._container, this._session);
      });
    }

    // Change Opening Quantity
    const opQtyInp = container.querySelector('#inp-opening-qty');
    if (opQtyInp) {
      opQtyInp.addEventListener('input', (e) => {
        this.openingQty = e.target.value;
        this.openingError = '';
        this.render(this._container, this._session);
      });
    }

    // Change Opening Unit Cost
    const opCostInp = container.querySelector('#inp-opening-cost');
    if (opCostInp) {
      opCostInp.addEventListener('input', (e) => {
        this.openingUnitCost = e.target.value;
        this.openingError = '';
        this.render(this._container, this._session);
      });
    }

    // Change Opening Notes
    const opNotesInp = container.querySelector('#inp-opening-notes');
    if (opNotesInp) {
      opNotesInp.addEventListener('input', (e) => {
        this.openingNotes = e.target.value;
      });
    }

    // Submit Opening Stock
    const submitOpBtn = container.querySelector('#btn-submit-bar-opening');
    if (submitOpBtn) {
      submitOpBtn.addEventListener('click', async () => {
        const tenantId = this._session ? this._session.tenantId : 'tenant_h0qc7wf';
        const items = this.getEnrichedBarInventory(tenantId);
        const selectedSku = this.openingSelectedSku || items[0]?.code;
        const item = items.find(i => i.code === selectedSku);
        const qty = parseFloat(this.openingQty) || 0;
        const defaultCost = item ? (item.costPrice || (item.valuation > 0 && item.onHand > 0 ? (item.valuation / item.onHand) : 0) || 180) : 180;
        const unitCost = parseFloat(this.openingUnitCost) || defaultCost;

        if (!selectedSku || qty <= 0) {
          this.openingError = 'Please select a valid Bar SKU and enter quantity > 0.';
          this.render(this._container, this._session);
          return;
        }

        submitOpBtn.disabled = true;
        submitOpBtn.innerText = 'Posting Opening Stock...';

        try {
          const res = this.stockOpeningRepository.postOpeningStock({
            tenantId,
            locationCode: 'LOC-314',
            itemCode: selectedSku,
            itemName: item ? item.name : selectedSku,
            quantity: qty,
            unitCost,
            baseUom: item ? item.baseUom : 'LTR',
            notes: this.openingNotes || '',
            performedBy: this._session ? (this._session.employeeName || this._session.userName) : 'Bar Manager'
          }, this._session);

          if (res.success) {
            this.openingSuccess = `🎉 Successfully recorded Opening Stock: ${qty} ${item ? item.baseUom : ''} for ${selectedSku} at LOC-314!`;
            this.openingQty = '';
            this.openingNotes = '';
            this.openingUnitCost = '';
            setTimeout(() => {
              this.showOpeningModal = false;
              this.openingSuccess = '';
              this.render(this._container, this._session);
            }, 1200);
          } else {
            this.openingError = res.error || 'Failed to post opening stock.';
            this.render(this._container, this._session);
          }
        } catch (err) {
          this.openingError = 'Exception posting opening stock: ' + (err.message || err);
          this.render(this._container, this._session);
        }
      });
    }

    // ==================== BAR REPLENISHMENT REQUISITION EVENTS ====================
    // Open Replenishment Modal
    const openReplenishBtn = container.querySelector('#btn-open-bar-replenish-modal');
    if (openReplenishBtn) {
      openReplenishBtn.addEventListener('click', () => {
        this.showReplenishModal = true;
        this.replenishError = '';
        this.replenishSuccess = '';
        this.render(this._container, this._session);
      });
    }

    // Row-level Replenish Trigger
    container.querySelectorAll('.btn-trigger-replenish-sku').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = el.dataset.code;
        if (code) {
          this.replenishSelectedSku = code;
          this.showReplenishModal = true;
          this.replenishError = '';
          this.replenishSuccess = '';
          this.render(this._container, this._session);
        }
      });
    });

    // Close Replenishment Modal
    const closeReplenishBtn = container.querySelector('#btn-close-bar-replenish-modal');
    if (closeReplenishBtn) {
      closeReplenishBtn.addEventListener('click', () => {
        this.showReplenishModal = false;
        this.render(this._container, this._session);
      });
    }

    const cancelReplenishBtn = container.querySelector('#btn-cancel-bar-replenish');
    if (cancelReplenishBtn) {
      cancelReplenishBtn.addEventListener('click', () => {
        this.showReplenishModal = false;
        this.render(this._container, this._session);
      });
    }

    // Change Selected SKU in Replenish Modal
    const selReplenishSku = container.querySelector('#sel-replenish-sku');
    if (selReplenishSku) {
      selReplenishSku.addEventListener('change', (e) => {
        this.replenishSelectedSku = e.target.value;
        this.replenishQty = ''; // Reset so suggested quantity recalculates for new SKU
        this.replenishError = '';
        this.render(this._container, this._session);
      });
    }

    // Apply Suggested Quantity Button
    const useSuggestedBtn = container.querySelector('#btn-use-suggested-qty');
    if (useSuggestedBtn) {
      useSuggestedBtn.addEventListener('click', () => {
        this.replenishQty = useSuggestedBtn.dataset.suggested || '';
        this.replenishError = '';
        this.render(this._container, this._session);
      });
    }

    // Change Replenish Quantity
    const replenishQtyInp = container.querySelector('#inp-replenish-qty');
    if (replenishQtyInp) {
      replenishQtyInp.addEventListener('input', (e) => {
        this.replenishQty = e.target.value;
        this.replenishError = '';
      });
    }

    // Change Replenish Notes
    const replenishNotesInp = container.querySelector('#inp-replenish-notes');
    if (replenishNotesInp) {
      replenishNotesInp.addEventListener('input', (e) => {
        this.replenishNotes = e.target.value;
      });
    }

    // Trigger Replenish from Subtab Table
    const triggerReplenishSubtabBtn = container.querySelector('#btn-trigger-bar-replenish-subtab');
    if (triggerReplenishSubtabBtn) {
      triggerReplenishSubtabBtn.addEventListener('click', () => {
        this.showReplenishModal = true;
        this.replenishQty = '';
        this.replenishError = '';
        this.replenishSuccess = '';
        this.render(this._container, this._session);
      });
    }

    // Trigger Replenish from Active Alert Banner
    const quickAlertBtn = container.querySelector('#btn-quick-replenish-first-alert');
    if (quickAlertBtn) {
      quickAlertBtn.addEventListener('click', () => {
        const code = quickAlertBtn.dataset.code;
        if (code) {
          this.replenishSelectedSku = code;
          this.replenishQty = '';
          this.showReplenishModal = true;
          this.replenishError = '';
          this.replenishSuccess = '';
          this.render(this._container, this._session);
        }
      });
    }

    // Fulfill Requisition Buttons in Table
    container.querySelectorAll('.btn-fulfill-bar-req').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const reqId = btn.dataset.reqId;
        if (!reqId) return;
        btn.disabled = true;
        btn.innerText = 'Fulfilling...';
        try {
          const tenantId = this._session ? this._session.tenantId : 'tenant_h0qc7wf';
          const res = await this.barReplenishmentModel.fulfillBarReplenishmentRequest(reqId, this._session, tenantId);
          if (res && res.success) {
            this.render(this._container, this._session);
          } else {
            alert('Failed to fulfill request: ' + (res?.error || 'Unknown error'));
            btn.disabled = false;
            btn.innerText = '🚚 Fulfill';
          }
        } catch (err) {
          alert('Failed to fulfill replenishment request: ' + (err.message || err));
          btn.disabled = false;
          btn.innerText = '🚚 Fulfill';
        }
      });
    });

    // Submit Replenishment Requisition
    const submitReplenishBtn = container.querySelector('#btn-submit-bar-replenish');
    if (submitReplenishBtn) {
      submitReplenishBtn.addEventListener('click', async () => {
        const tenantId = this._session ? this._session.tenantId : 'tenant_h0qc7wf';
        const items = this.getEnrichedBarInventory(tenantId);
        const selectedSku = this.replenishSelectedSku || items[0]?.code;
        const inpQtyEl = container.querySelector('#inp-replenish-qty');
        const qty = parseFloat(inpQtyEl ? inpQtyEl.value : this.replenishQty) || 0;

        if (!selectedSku || qty <= 0) {
          this.replenishError = 'Please select a Bar SKU and specify requested quantity > 0.';
          this.render(this._container, this._session);
          return;
        }

        submitReplenishBtn.disabled = true;
        submitReplenishBtn.innerText = 'Submitting Request...';

        try {
          const res = await this.barReplenishmentModel.createBarReplenishmentRequest({
            itemCode: selectedSku,
            requestedQty: qty,
            requestedBy: this._session?.employeeName || this._session?.userName || 'Bartender',
            notes: this.replenishNotes || '',
            session: this._session
          }, tenantId);

          if (res) {
            this.replenishSuccess = `🎉 Replenishment request ${res.requestNumber || res.request_number} submitted for ${qty} ${res.uom || ''} of ${res.itemName || selectedSku}! (Status: PENDING_FULFILLMENT)`;
            this.replenishQty = '';
            this.replenishNotes = '';
            setTimeout(() => {
              this.showReplenishModal = false;
              this.replenishSuccess = '';
              this.render(this._container, this._session);
            }, 1400);
          }
        } catch (err) {
          this.replenishError = 'Failed to submit replenishment request: ' + (err.message || err);
          this.render(this._container, this._session);
        }
      });
    }

    // ==================== DRAWER REORDER LEVEL GOVERNANCE ====================
    const toggleReorderBtn = container.querySelector('#btn-toggle-reorder-edit');
    if (toggleReorderBtn) {
      toggleReorderBtn.addEventListener('click', () => {
        this.showReorderEdit = !this.showReorderEdit;
        this.reorderEditError = '';
        this.render(this._container, this._session);
      });
    }

    const cancelReorderBtn = container.querySelector('#btn-cancel-reorder-edit');
    if (cancelReorderBtn) {
      cancelReorderBtn.addEventListener('click', () => {
        this.showReorderEdit = false;
        this.reorderEditError = '';
        this.render(this._container, this._session);
      });
    }

    const saveReorderBtn = container.querySelector('#btn-save-reorder-level');
    if (saveReorderBtn) {
      saveReorderBtn.addEventListener('click', async () => {
        const code = saveReorderBtn.dataset.code;
        const valInp = container.querySelector('#inp-new-reorder-level');
        const newVal = valInp ? parseFloat(valInp.value) : NaN;

        if (isNaN(newVal) || newVal < 0) {
          this.reorderEditError = 'Please enter a valid non-negative number for reorder level.';
          this.render(this._container, this._session);
          return;
        }

        saveReorderBtn.disabled = true;
        saveReorderBtn.innerText = 'Saving...';

        try {
          const tenantId = this._session ? this._session.tenantId : 'tenant_h0qc7wf';
          await this.barReplenishmentModel.updateBarSkuReorderLevel(code, newVal, this._session, tenantId);
          this.showReorderEdit = false;
          this.reorderEditError = '';
          this.render(this._container, this._session);
        } catch (err) {
          this.reorderEditError = err.message || 'Failed to update reorder level.';
          this.render(this._container, this._session);
        }
      });
    }

    // Open Bar Reconciliation Modal
    const openReconcileBtn = container.querySelector('#btn-open-bar-reconcile-modal');
    if (openReconcileBtn) {
      openReconcileBtn.addEventListener('click', () => {
        if (this.barReconciliationModal) {
          this.barReconciliationModal.open(this._session);
        }
      });
    }
  }
}
