/**
 * RestaurantOS - Kitchen Display System (KDS) Live View (K-08.2)
 * Dedicated, Full-Screen Operational Workspace for Chefs & Line Station Cooks.
 * Features:
 * 1. Aesthetic, high-density KDS card design with clear status hierarchy.
 * 2. Dedicated Workflow Tabs: "⚠️ Needs Attention", "🔥 In Preparation", "🛎️ Ready for Pickup", "📋 All KOTs".
 * 3. Cross-tab & multi-device real-time sync via BroadcastChannel + Cloud Delta Polling.
 * 4. Native Web Audio kitchen chimes on incoming tickets and state transitions.
 * 5. Station filtering, live urgency escalation timers, and instant Supabase synchronization.
 */

import { orderModel } from '../../../../../businessos/platform/ordering/orderModel.js';
import { productionRoutingEngine } from '../../../../../businessos/platform/ordering/productionRoutingEngine.js';
import { cancellationModel } from '../../../../../businessos/platform/ordering/cancellationModel.js';
import { dispositionPolicyModel } from '../../../../../businessos/platform/ordering/dispositionPolicyModel.js';
import { preparedHoldModel } from '../../../../../businessos/platform/ordering/preparedHoldModel.js';
import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

export class KitchenDisplaySystemView {
  constructor(deps = {}) {
    this.container = null;
    this.authEngine = deps.authEngine || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.authEngine ? window.__APP__.authEngine : null);
    this.onExit = deps.onExit || (() => {});
    this.selectedStation = 'ALL';
    this.selectedStatusTab = 'ATTENTION'; // 'ATTENTION' | 'PREPARING' | 'READY' | 'ALL'
    this.searchQuery = '';
    this.timerInterval = null;
    this.pollInterval = null;
    this.broadcastChannel = null;
    this.unsubscribeEvents = [];
    this.lastTicketsHash = '';
    this.audioContext = null;
  }

  _getDataGateway() {
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) {
      return window.__APP__.platform.dataGateway || null;
    }
    return null;
  }

  render(targetContainer = null) {
    this.container = targetContainer || document.createElement('div');
    this.container.className = 'kds-fullscreen-workspace animate-fade-in';
    this.container.style.cssText = 'min-height:100vh; width:100%; background:#0b0f19; color:#f1f5f9; padding:18px 24px; box-sizing:border-box; display:flex; flex-direction:column; gap:16px; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';
    
    this.updateContent();
    this.startLiveTimer();
    this.startRealtimeSync();
    this.subscribeEvents();

    // Phase 6: cloud-fetch orders + embedded tickets on mount so a KDS opened
    // in a fresh browser immediately shows live KOTs (no boot-hydrate dependency).
    const dg = this._getDataGateway();
    if (dg && typeof dg.refreshForWorkspace === 'function') {
      dg.refreshForWorkspace('kds', ['orders', 'tickets', 'cancellation_requests'], 'tenant_h0qc7wf')
        .then(() => this.updateContent())
        .catch(() => {});
    }

    return this.container;
  }

  destroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.broadcastChannel) {
      try { this.broadcastChannel.close(); } catch (_) {}
      this.broadcastChannel = null;
    }
    this.unsubscribeEvents.forEach(unsub => {
      if (typeof unsub === 'function') unsub();
    });
    this.unsubscribeEvents = [];
  }

  playKitchenChime(type = 'new_order') {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioContext) this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') this.audioContext.resume();

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      const now = this.audioContext.currentTime;
      if (type === 'ready') {
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1174.66, now + 0.12);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else {
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      }
    } catch (_) {}
  }

  startRealtimeSync() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('anchor_kds_realtime');
        this.broadcastChannel.onmessage = (event) => {
          if (event.data && (event.data.type === 'KDS_TICKET_UPDATE' || event.data.type === 'KDS_NEW_ORDER')) {
            this.updateContent(false);
          }
        };
      } catch (err) {
        console.warn('[KDS] BroadcastChannel init error:', err);
      }
    }

    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
    const tenantId = session.tenantId || 'tenant_h0qc7wf';
    const dg = this._getDataGateway();

    if (dg && typeof dg.hydrateCollections === 'function') {
      this.pollInterval = setInterval(async () => {
        try {
          await dg.hydrateCollections(['orders', 'cancellation_requests', 'prepared_item_holds'], tenantId);
          const tickets = orderModel.getAllTickets(tenantId);
          const currentHash = JSON.stringify(tickets.map(t => `${t.id}_${t.status}_${t.updatedAt || ''}`));
          if (currentHash !== this.lastTicketsHash) {
            this.lastTicketsHash = currentHash;
            this.updateContent(false);
          }
        } catch (_) {}
      }, 3500);
    }
  }

  broadcastTicketChange(ticketId, newStatus) {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'KDS_TICKET_UPDATE',
        ticketId,
        status: newStatus,
        timestamp: Date.now()
      });
    }
  }

  subscribeEvents() {
    if (this.unsubscribeEvents.length > 0) return;

    const unsub1 = platformEventBus.subscribe('order:confirmed', () => {
      this.playKitchenChime('new_order');
      this.updateContent();
    });
    const unsub2 = platformEventBus.subscribe('kot:dispatched', () => {
      this.playKitchenChime('new_order');
      this.updateContent();
    });
    const unsub3 = platformEventBus.subscribe('ticket:status_changed', (e) => {
      if (e.payload?.status === 'READY') this.playKitchenChime('ready');
      this.updateContent();
    });
    const unsub4 = platformEventBus.subscribe('data:changed', () => {
      this.updateContent();
    });
    // Cancellation workflow: incoming waiter requests chime + re-render; decisions and
    // cloud syncs from other devices refresh the request cards too.
    const unsub5 = platformEventBus.subscribe('cancellation:requested', (e) => {
      if (!e || !e.payload || e.payload.station !== 'KITCHEN') return;
      this.playKitchenChime('new_order');
      this.updateContent();
    });
    const unsub6 = platformEventBus.subscribe('cancellation:decided', () => this.updateContent());
    const unsub7 = platformEventBus.subscribe('cancellation:reversed', () => this.updateContent());
    const unsub8 = platformEventBus.subscribe('cancellation:synced', () => this.updateContent());

    // Hold board (Phase B): refresh HELD stock + reuse hints on any hold lifecycle change.
    const unsub9 = platformEventBus.subscribe('hold:created', () => this.updateContent());
    const unsub10 = platformEventBus.subscribe('hold:reused', () => this.updateContent());
    const unsub11 = platformEventBus.subscribe('hold:discarded', () => this.updateContent());

    this.unsubscribeEvents.push(unsub1, unsub2, unsub3, unsub4, unsub5, unsub6, unsub7, unsub8, unsub9, unsub10, unsub11);
  }

  getElapsedMinutes(createdAt) {
    if (!createdAt) return 0;
    const diffMs = Date.now() - new Date(createdAt).getTime();
    return Math.max(0, Math.floor(diffMs / 60000));
  }

  formatElapsed(createdAt) {
    const mins = this.getElapsedMinutes(createdAt);
    if (mins < 1) return '⏱️ Just now';
    return `⏱️ ${mins} min`;
  }

  startLiveTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.container) return;
      this.container.querySelectorAll('[data-created-at]').forEach(el => {
        const cat = el.getAttribute('data-created-at');
        if (cat) el.textContent = this.formatElapsed(cat);
      });
    }, 10000);
  }

  updateContent() {
    if (!this.container) return;

    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
    const tenantId = session.tenantId || 'tenant_h0qc7wf';

    // 1. Fetch live tickets
    const allTickets = orderModel.getAllTickets(tenantId) || [];
    const kitchenTickets = allTickets.filter(t => t.destination === 'KITCHEN' && t.status !== 'SERVED' && t.status !== 'CANCELLED');

    // 1b. Open cancellation requests for this station, keyed by affected ticket.
    const pendingCxls = cancellationModel.getPendingRequests('KITCHEN', tenantId);
    const requestsByTicket = new Map();
    const attachedTicketIds = new Set(kitchenTickets.map(t => t.ticketId || t.id));
    const orphanRequests = [];
    pendingCxls.forEach(r => {
      if (r.ticketId && attachedTicketIds.has(r.ticketId)) {
        if (!requestsByTicket.has(r.ticketId)) requestsByTicket.set(r.ticketId, []);
        requestsByTicket.get(r.ticketId).push(r);
      } else {
        orphanRequests.push(r);
      }
    });

    // 1c. Station holds (Phase B hold board + held-stock reuse hints).
    const stationHolds = preparedHoldModel.getHolds(tenantId, { station: 'KITCHEN' });
    const liveHolds = stationHolds.filter(h => h.status === 'HELD');
    const heldItemCodes = new Set(liveHolds.map(h => h.itemCode));

    // 2. Dynamic station list
    const stationsSet = new Set(['ALL']);
    kitchenTickets.forEach(t => {
      (t.items || []).forEach(i => {
        if (i.stationName) stationsSet.add(i.stationName.toUpperCase());
        else if (i.category) stationsSet.add(i.category.toUpperCase());
      });
    });
    const stationsList = Array.from(stationsSet);

    // 3. Tab Categorization
    const attentionTickets = kitchenTickets.filter(t => {
      const mins = this.getElapsedMinutes(t.createdAt);
      const hasNotes = (t.items || []).some(i => i.notes && i.notes.trim() !== '');
      return t.status === 'QUEUED' || mins > 10 || hasNotes;
    });

    const preparingTickets = kitchenTickets.filter(t => t.status === 'PREPARING');
    const readyTickets = kitchenTickets.filter(t => t.status === 'READY');

    // 4. Determine Active Tab Filter
    let filteredTickets = kitchenTickets;
    if (this.selectedStatusTab === 'ATTENTION') {
      filteredTickets = attentionTickets;
    } else if (this.selectedStatusTab === 'PREPARING') {
      filteredTickets = preparingTickets;
    } else if (this.selectedStatusTab === 'READY') {
      filteredTickets = readyTickets;
    }

    // Apply Station Filter
    if (this.selectedStation !== 'ALL') {
      filteredTickets = filteredTickets.filter(t => {
        return (t.items || []).some(i => 
          (i.stationName && i.stationName.toUpperCase() === this.selectedStation) ||
          (i.category && i.category.toUpperCase() === this.selectedStation)
        );
      });
    }

    // Apply Search Filter
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      filteredTickets = filteredTickets.filter(t => {
        const matchId = (t.ticketId || t.id || '').toLowerCase().includes(q);
        const matchOrder = (t.orderNumber || t.orderId || '').toLowerCase().includes(q);
        const matchTable = (t.tableCode || String(t.tableNumber || '')).toLowerCase().includes(q);
        const matchItem = (t.items || []).some(i => (i.name || i.itemName || '').toLowerCase().includes(q));
        return matchId || matchOrder || matchTable || matchItem;
      });
    }

    this.container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px;">
        
        <!-- HEADER CONTROL BAR -->
        <div style="background:#131b2e; padding:16px 20px; border-radius:10px; border-left:4px solid #ef4444; border:1px solid #1e293b; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="display:flex; align-items:center; gap:10px;">
              <h2 style="font-size:1.6rem; margin:0; font-weight:800; color:#ffffff;">👨‍🍳 Live Kitchen Display System (KDS)</h2>
              <span class="badge" style="font-size:0.8rem; padding:4px 10px; font-weight:800; background:#ef444422; color:#ef4444; border:1px solid #ef4444;">
                ${kitchenTickets.length} ACTIVE KOTs
              </span>
            </div>
            <p style="color:#94a3b8; font-size:0.85rem; margin:4px 0 0;">
              Real-time ticket queue linked to Supabase Orders • Instant station updates
            </p>
          </div>

          <div style="display:flex; align-items:center; gap:10px;">
            <button class="btn-secondary btn-kds-fullscreen" style="padding:8px 14px; font-weight:700; background:#1e293b; color:#ffffff; border:1px solid #334155; border-radius:6px; cursor:pointer;">
              ⛶ Fullscreen
            </button>
            <button class="btn-secondary btn-kds-exit" style="padding:8px 16px; font-weight:700; background:#334155; color:#ffffff; border:none; border-radius:6px; cursor:pointer;">
              👨‍🍳 Exit to Chef Workspace
            </button>
          </div>
        </div>

        <!-- WORKFLOW NAVIGATION TABS (NEEDS ATTENTION | PREPARING | READY | ALL) -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background:#131b2e; padding:12px 16px; border-radius:10px; border:1px solid #1e293b;">
          
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn-kds-workflow-tab ${this.selectedStatusTab === 'ATTENTION' ? 'active' : ''}" data-tab="ATTENTION" style="padding:8px 14px; font-size:0.85rem; font-weight:800; border-radius:8px; cursor:pointer; background:${this.selectedStatusTab === 'ATTENTION' ? '#ef4444' : '#1e293b'}; color:${this.selectedStatusTab === 'ATTENTION' ? '#ffffff' : '#94a3b8'}; border:none; display:flex; align-items:center; gap:6px;">
              ⚠️ Needs Attention (${attentionTickets.length})
            </button>
            <button class="btn-kds-workflow-tab ${this.selectedStatusTab === 'PREPARING' ? 'active' : ''}" data-tab="PREPARING" style="padding:8px 14px; font-size:0.85rem; font-weight:800; border-radius:8px; cursor:pointer; background:${this.selectedStatusTab === 'PREPARING' ? '#f59e0b' : '#1e293b'}; color:${this.selectedStatusTab === 'PREPARING' ? '#ffffff' : '#94a3b8'}; border:none; display:flex; align-items:center; gap:6px;">
              🔥 In Preparation (${preparingTickets.length})
            </button>
            <button class="btn-kds-workflow-tab ${this.selectedStatusTab === 'READY' ? 'active' : ''}" data-tab="READY" style="padding:8px 14px; font-size:0.85rem; font-weight:800; border-radius:8px; cursor:pointer; background:${this.selectedStatusTab === 'READY' ? '#10b981' : '#1e293b'}; color:${this.selectedStatusTab === 'READY' ? '#000000' : '#94a3b8'}; border:none; display:flex; align-items:center; gap:6px;">
              🛎️ Ready for Pickup (${readyTickets.length})
            </button>
            <button class="btn-kds-workflow-tab ${this.selectedStatusTab === 'ALL' ? 'active' : ''}" data-tab="ALL" style="padding:8px 14px; font-size:0.85rem; font-weight:800; border-radius:8px; cursor:pointer; background:${this.selectedStatusTab === 'ALL' ? '#3b82f6' : '#1e293b'}; color:${this.selectedStatusTab === 'ALL' ? '#ffffff' : '#94a3b8'}; border:none; display:flex; align-items:center; gap:6px;">
              📋 All Active KOTs (${kitchenTickets.length})
            </button>
            <button class="btn-kds-workflow-tab ${this.selectedStatusTab === 'HELD' ? 'active' : ''}" data-tab="HELD" style="padding:8px 14px; font-size:0.85rem; font-weight:800; border-radius:8px; cursor:pointer; background:${this.selectedStatusTab === 'HELD' ? '#8b5cf6' : '#1e293b'}; color:${this.selectedStatusTab === 'HELD' ? '#ffffff' : '#94a3b8'}; border:none; display:flex; align-items:center; gap:6px;">
              🧊 Held Items (${liveHolds.length})
            </button>
          </div>

          <!-- Station Selector & Search -->
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:4px;">
              <span style="font-size:0.75rem; font-weight:700; color:#94a3b8; text-transform:uppercase;">STATION:</span>
              <select id="select-kds-station" style="background:#1e293b; color:#ffffff; border:1px solid #334155; padding:6px 10px; border-radius:6px; font-size:0.8rem; font-weight:700;">
                ${stationsList.map(st => `<option value="${st}" ${this.selectedStation === st ? 'selected' : ''}>${st}</option>`).join('')}
              </select>
            </div>
            <input type="text" id="inp-kds-search" placeholder="🔍 Search Table, Item..." value="${this.searchQuery}" style="padding:6px 12px; border-radius:6px; border:1px solid #334155; background:#1e293b; color:#ffffff; font-size:0.85rem; width:180px;">
          </div>
        </div>

        <!-- HELD ITEMS BOARD (Phase B): reuse / discard prepared cancellations -->
        ${this.selectedStatusTab === 'HELD' ? this.renderHoldBoard(stationHolds) : ''}

        <!-- ORPHANED CANCELLATION REQUESTS (ticket not in current filtered view) -->
        ${orphanRequests.map(r => this.renderCancellationRequestCard(r)).join('')}

        <!-- TICKET GRID DISPLAY -->
        ${this.selectedStatusTab === 'HELD' ? '' : (filteredTickets.length === 0 ? `
          <div class="card" style="background:#131b2e; padding:60px 20px; text-align:center; border-radius:10px; border:1px solid #1e293b;">
            <div style="font-size:3.5rem; margin-bottom:12px;">👨‍🍳</div>
            <h3 style="font-size:1.4rem; margin:0 0 8px; font-weight:800; color:#ffffff;">No KOT Tickets in this View</h3>
            <p style="color:#94a3b8; font-size:0.9rem; max-width:480px; margin:0 auto;">
              ${kitchenTickets.length === 0 
                ? 'All kitchen order queues are currently clear. Orders placed from POS or Waiter consoles will appear here instantly.'
                : 'No KOT tickets match the selected workflow tab or station filter.'}
            </p>
          </div>
        ` : `
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">
            ${filteredTickets.map(t => {
              const borderCol = t.status === 'QUEUED' ? '#ef4444' : (t.status === 'PREPARING' ? '#f59e0b' : '#10b981');
              const mins = this.getElapsedMinutes(t.createdAt);
              const timerColor = mins > 15 ? '#ef4444' : (mins > 8 ? '#f59e0b' : '#94a3b8');
              const itemsList = Array.isArray(t.items) ? t.items : [];

              return `
                <div class="card" style="background:#131b2e; border-top:4px solid ${borderCol}; border-radius:10px; border-left:1px solid #1e293b; border-right:1px solid #1e293b; border-bottom:1px solid #1e293b; display:flex; flex-direction:column; justify-content:space-between; padding:14px; box-shadow:0 6px 16px rgba(0,0,0,0.3);">
                  <div>
                    
                    <!-- COMPACT TICKET HEADER -->
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #1e293b; padding-bottom:8px;">
                      <div>
                        <div style="font-size:1.2rem; font-weight:800; color:#ffffff;">
                          🍽️ ${t.tableCode || ('Table ' + (t.tableNumber || 1))}
                        </div>
                        <div style="font-size:0.7rem; color:#94a3b8; font-family:monospace; margin-top:2px;">
                          KOT: ${t.ticketId || t.id} • Order #${t.orderNumber || t.orderId}
                        </div>
                      </div>
                      <div style="text-align:right;">
                        <span data-created-at="${t.createdAt || ''}" style="font-size:0.8rem; font-weight:800; color:${timerColor}; background:#1e293b; padding:4px 8px; border-radius:4px;">
                          ${this.formatElapsed(t.createdAt)}
                        </span>
                      </div>
                    </div>

                    <!-- CANCELLATION REQUEST CARDS (station decision) -->
                    ${(requestsByTicket.get(t.ticketId || t.id) || []).map(r => this.renderCancellationRequestCard(r)).join('')}

                    <!-- ORDERED ITEMS LIST -->
                    <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
                      ${itemsList.map((item, idx) => {
                        const itemStatus = item.itemStatus || t.status || 'QUEUED';
                        const isRemoved = itemStatus === 'CANCELLED' || itemStatus === 'VOIDED';
                        if (isRemoved) {
                          return `
                            <div style="background:#1e293b; opacity:0.55; padding:6px 10px; border-radius:6px; border-left:3px solid #6b7280; display:flex; justify-content:space-between; align-items:center;">
                              <div style="font-size:0.85rem; font-weight:700; color:#9ca3af; text-decoration:line-through;">
                                <span style="font-weight:800;">${item.quantity || item.qty || 1}x</span> ${item.name || item.itemName}
                              </div>
                              <span style="font-size:0.65rem; font-weight:800; padding:2px 6px; border-radius:3px; background:#6b728022; color:#9ca3af;">🚫 ${itemStatus}</span>
                            </div>
                          `;
                        }
                        const isReady = itemStatus === 'READY';
                        const isPrep = itemStatus === 'PREPARING';
                        const isQueued = itemStatus === 'QUEUED';
                        const isServed = itemStatus === 'SERVED';

                        const itemBorder = isReady ? '#10b981' : (isPrep ? '#f59e0b' : (isServed ? '#6b7280' : '#ef4444'));
                        const itemBg = isReady ? '#10b98115' : '#1e293b';

                        return `
                          <div style="background:${itemBg}; padding:8px 10px; border-radius:6px; border-left:3px solid ${itemBorder}; display:flex; flex-direction:column; gap:4px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                              <div style="font-size:0.9rem; font-weight:700; color:#ffffff;">
                                <span style="color:#3b82f6; font-weight:800;">${item.quantity || item.qty || 1}x</span> ${item.name || item.itemName}
                              </div>
                              <span style="font-size:0.65rem; font-weight:800; text-transform:uppercase; padding:2px 6px; border-radius:3px; background:${isReady ? '#10b98122' : (isPrep ? '#f59e0b22' : '#ef444422')}; color:${isReady ? '#10b981' : (isPrep ? '#f59e0b' : '#ef4444')};">
                                ${itemStatus}
                              </span>
                            </div>

                            ${(isQueued || isPrep) && heldItemCodes.has(String(item.itemCode || item.itemId || '')) ? `
                              <div style="font-size:0.72rem; color:#8b5cf6; background:#8b5cf615; padding:3px 6px; border-radius:4px; font-weight:700;">
                                🧊 Held stock available — a matching prepared item can be reused (see Held Items tab).
                              </div>
                            ` : ''}

                            ${item.notes ? `
                              <div style="font-size:0.75rem; color:#f59e0b; background:#f59e0b15; padding:3px 6px; border-radius:4px; font-weight:600;">
                                ⚠️ ${item.notes}
                              </div>
                            ` : ''}

                            <!-- Item Action Controls -->
                            <div style="display:flex; justify-content:flex-end; gap:6px; align-items:center; margin-top:2px;">
                              ${isQueued ? `
                                <button class="btn-secondary btn-kds-item-action" data-ticket-id="${t.ticketId || t.id}" data-item-id="${item.lineItemId || item.itemId || idx}" data-target="PREPARING" style="padding:2px 6px; font-size:0.7rem; font-weight:700; background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b; border-radius:4px; cursor:pointer;">
                                  🔥 Start
                                </button>
                                <button class="btn-secondary btn-kds-item-action" data-ticket-id="${t.ticketId || t.id}" data-item-id="${item.lineItemId || item.itemId || idx}" data-target="READY" style="padding:2px 6px; font-size:0.7rem; font-weight:700; background:#10b98122; color:#10b981; border:1px solid #10b981; border-radius:4px; cursor:pointer;">
                                  ✅ Ready
                                </button>
                              ` : ''}

                              ${isPrep ? `
                                <button class="btn-secondary btn-kds-item-action" data-ticket-id="${t.ticketId || t.id}" data-item-id="${item.lineItemId || item.itemId || idx}" data-target="READY" style="padding:3px 8px; font-size:0.7rem; font-weight:800; background:#10b981; color:#000000; border:none; border-radius:4px; cursor:pointer;">
                                  ✅ Mark Ready
                                </button>
                              ` : ''}

                              ${isReady ? `
                                <span style="font-size:0.7rem; color:#10b981; font-weight:700;">✓ Ready</span>
                                <button class="btn-secondary btn-kds-item-action" data-ticket-id="${t.ticketId || t.id}" data-item-id="${item.lineItemId || item.itemId || idx}" data-target="PREPARING" style="padding:2px 6px; font-size:0.65rem; color:#94a3b8; background:transparent; border:none; cursor:pointer;">
                                  ↩ Undo
                                </button>
                              ` : ''}
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>

                  <!-- TICKET FOOTER LIFECYCLE ACTION -->
                  <div style="border-top:1px solid #1e293b; padding-top:10px;">
                    ${(() => {
                      const activeItems = itemsList.filter(i => {
                        const s = i.itemStatus || i.status || t.status || 'QUEUED';
                        return s !== 'CANCELLED' && s !== 'VOIDED';
                      });
                      const allReady = activeItems.length > 0 && activeItems.every(i => (i.itemStatus || t.status) === 'READY' || (i.itemStatus || t.status) === 'SERVED');
                      const anyPrepOrReady = activeItems.some(i => (i.itemStatus || t.status) === 'PREPARING' || (i.itemStatus || t.status) === 'READY');

                      if (allReady) {
                        return `
                          <button class="btn-primary btn-kds-transition" data-id="${t.ticketId || t.id}" data-target="SERVED" style="width:100%; padding:8px; font-weight:800; font-size:0.85rem; background:#8b5cf6; color:#ffffff; border:none; border-radius:6px; cursor:pointer;">
                            🍽️ Mark KOT Served
                          </button>
                        `;
                      } else if (anyPrepOrReady) {
                        return `
                          <button class="btn-primary btn-kds-transition" data-id="${t.ticketId || t.id}" data-target="READY" style="width:100%; padding:8px; font-weight:800; font-size:0.85rem; background:#10b981; color:#000000; border:none; border-radius:6px; cursor:pointer;">
                            ✅ Mark KOT Ready
                          </button>
                        `;
                      } else {
                        return `
                          <button class="btn-primary btn-kds-transition" data-id="${t.ticketId || t.id}" data-target="PREPARING" style="width:100%; padding:8px; font-weight:800; font-size:0.85rem; background:#ef4444; color:#ffffff; border:none; border-radius:6px; cursor:pointer;">
                            🔥 Start Preparation
                          </button>
                        `;
                      }
                    })()}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `)}
      </div>
    `;

    this.bindEvents();
  }

  /**
   * Red cancellation-request card. READY-stage requests render the MANDATORY
   * disposition-policy outcome: HOLD offer (two buttons), DISCARD-only note, or
   * disabled "awaiting manager" state. PREPARING requests get plain approve/reject.
   */
  renderCancellationRequestCard(r) {
    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
    const tenantId = session.tenantId || 'tenant_h0qc7wf';
    const policy = r.stageAtRequest === 'READY'
      ? dispositionPolicyModel.resolvePolicy(r.station, r.itemCode, r.categoryCode, tenantId)
      : null;

    let actionBtns = `
      <button class="btn-kds-cxl-action" data-request-id="${r.id}" data-action="APPROVE" style="padding:8px 14px; font-size:0.8rem; font-weight:800; background:#10b981; color:#000000; border:none; border-radius:6px; cursor:pointer;">
        ✅ Approve Cancel
      </button>
    `;
    if (policy && policy.outcome === 'DISCARD_ONLY') {
      actionBtns = `
        <button class="btn-kds-cxl-action" data-request-id="${r.id}" data-action="APPROVE" title="Discard-only policy: prepared item is recognized as waste" style="padding:8px 14px; font-size:0.8rem; font-weight:800; background:#f97316; color:#ffffff; border:none; border-radius:6px; cursor:pointer;">
          ✅ Approve → Discard (per policy)
        </button>
      `;
    } else if (policy && policy.decideBy === 'MANAGER') {
      // MANAGER_DECISION policy: only a manager/admin may pick HOLD vs DISCARD at the board.
      const isManager = /manager|admin|owner/.test(String(session.role || session.userRole || session.employeeRole || session.roleId || session.roleName || session.workspace || '').toLowerCase());
      actionBtns = isManager
        ? `
        <button class="btn-kds-cxl-action" data-request-id="${r.id}" data-action="APPROVE" data-disposition="HOLD" style="padding:8px 14px; font-size:0.8rem; font-weight:800; background:#3b82f6; color:#ffffff; border:none; border-radius:6px; cursor:pointer;">
          ✅ Hold For Reuse
        </button>
        <button class="btn-kds-cxl-action" data-request-id="${r.id}" data-action="APPROVE" data-disposition="DISCARD" style="padding:8px 14px; font-size:0.8rem; font-weight:800; background:#f97316; color:#ffffff; border:none; border-radius:6px; cursor:pointer;">
          🗑 Discard
        </button>
      `
        : `
        <button disabled title="Disposition authority: manager" style="padding:8px 14px; font-size:0.8rem; font-weight:800; background:#1e293b; color:#94a3b8; border:1px solid #334155; border-radius:6px; cursor:not-allowed;">
          ⏳ Awaiting Manager Disposition
        </button>
      `;
    } else if (policy && policy.outcome === 'HOLD_OFFERED') {
      actionBtns = `
        <button class="btn-kds-cxl-action" data-request-id="${r.id}" data-action="APPROVE" data-disposition="HOLD" style="padding:8px 14px; font-size:0.8rem; font-weight:800; background:#3b82f6; color:#ffffff; border:none; border-radius:6px; cursor:pointer;">
          ✅ Hold For Reuse
        </button>
        <button class="btn-kds-cxl-action" data-request-id="${r.id}" data-action="APPROVE" data-disposition="DISCARD" style="padding:8px 14px; font-size:0.8rem; font-weight:800; background:#f97316; color:#ffffff; border:none; border-radius:6px; cursor:pointer;">
          🗑 Discard
        </button>
      `;
    }

    return `
      <div class="animate-fade-in" style="background:rgba(239, 68, 68, 0.10); border:1px solid #ef4444; border-radius:8px; padding:10px 12px; margin-bottom:10px;">
        <div style="font-size:0.7rem; font-weight:800; color:#ef4444; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">🚨 Cancellation Request</div>
        <div style="font-size:0.9rem; font-weight:800; color:#ffffff; margin-bottom:2px;">
          ${r.quantity}x ${r.itemName} <span style="font-size:0.7rem; color:#fca5a5; font-weight:700;">(${r.stageAtRequest})</span>
        </div>
        <div style="font-size:0.75rem; color:#94a3b8; margin-bottom:8px;">
          Reason: <strong style="color:#e2e8f0;">${String(r.reasonCode || 'OTHER').replace(/_/g, ' ')}</strong>${r.reasonText ? ` — ${r.reasonText}` : ''} • by ${r.requestedByName || 'Waiter'} • Table ${r.ticketId ? '' : ''}<span data-created-at="${r.requestedAt || ''}">${this.formatElapsed(r.requestedAt)}</span>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          ${actionBtns}
          <button class="btn-kds-cxl-action" data-request-id="${r.id}" data-action="REJECT" style="padding:8px 14px; font-size:0.8rem; font-weight:800; background:transparent; color:#ef4444; border:1px solid #ef4444; border-radius:6px; cursor:pointer;">
            ❌ Reject
          </button>
        </div>
      </div>
    `;
  }

  /** Held Items board (Phase B): reuse a HELD prepared item onto a matching active line, or discard it. */
  renderHoldBoard(holds) {
    const list = holds || [];
    const hel = list.filter(h => h.status === 'HELD');
    const others = list.filter(h => h.status !== 'HELD');

    if (hel.length === 0 && others.length === 0) {
      return `
        <div class="card" style="background:#131b2e; padding:60px 20px; text-align:center; border-radius:10px; border:1px solid #1e293b;">
          <div style="font-size:3.5rem; margin-bottom:12px;">🧊</div>
          <h3 style="font-size:1.4rem; margin:0 0 8px; font-weight:800; color:#ffffff;">No Held Items</h3>
          <p style="color:#94a3b8; font-size:0.9rem; max-width:480px; margin:0 auto;">Prepared (READY-stage) items cancelled at this station appear here for reuse or discard.</p>
        </div>`;
    }

    return `
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${hel.length ? `
          <div style="font-size:0.8rem; font-weight:800; color:#8b5cf6; text-transform:uppercase; letter-spacing:0.5px;">🧊 Available To Reuse (${hel.length})</div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">${hel.map(h => this._renderHoldCard(h)).join('')}</div>
        ` : `<div style="font-size:0.9rem; color:#94a3b8;">No currently-HELD items to reuse.</div>`}
        ${others.length ? `
          <div style="font-size:0.8rem; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-top:8px;">Recently Closed Out</div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">${others.slice(0, 8).map(h => this._renderHoldCard(h)).join('')}</div>
        ` : ''}
      </div>`;
  }

  _renderHoldCard(h) {
    const req = h.sourceRequestId ? cancellationModel.getRequest(h.sourceRequestId, h.tenantId) : null;
    const reason = req ? String(req.reasonCode || 'OTHER').replace(/_/g, ' ') : 'CANCELLED_ORDER';
    const ageMin = this.getElapsedMinutes(h.holdCreatedAt);
    const expired = preparedHoldModel.isExpired(h);
    const isHeld = h.status === 'HELD';
    const border = isHeld ? (expired ? '#f97316' : '#8b5cf6') : '#64748b';
    const fmt = (v) => '₹' + (parseFloat(v) || 0).toFixed(2);
    const reuseBtn = (isHeld && !expired)
      ? `<button class="btn-kds-hold-action" data-hold-id="${h.id}" data-hold-action="USE" style="flex:2; padding:8px; font-size:0.8rem; font-weight:800; background:#8b5cf6; color:#fff; border:none; border-radius:6px; cursor:pointer;">🔁 Use For New Order</button>`
      : '';
    const discardBtn = isHeld
      ? `<button class="btn-kds-hold-action" data-hold-id="${h.id}" data-hold-action="DISCARD" style="flex:1; padding:8px; font-size:0.8rem; font-weight:800; background:#f97316; color:#fff; border:none; border-radius:6px; cursor:pointer;">🗑 Discard</button>`
      : '';

    return `
      <div class="card" style="background:#131b2e; border-left:4px solid ${border}; border-radius:10px; border-top:1px solid #1e293b; border-right:1px solid #1e293b; border-bottom:1px solid #1e293b; padding:12px; display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:1rem; font-weight:800; color:#fff;">${h.quantity}x ${h.itemName}</div>
          <span style="font-size:0.65rem; font-weight:800; padding:2px 6px; border-radius:3px; background:${isHeld ? '#8b5cf622' : '#64748b22'}; color:${isHeld ? '#a78bfa' : '#94a3b8'};">${expired ? 'EXPIRED' : h.status}</span>
        </div>
        <div style="font-size:0.72rem; color:#94a3b8; line-height:1.6;">
          Held ${ageMin}m ago • Source: ${reason}<br/>
          Prepared Item Cost: <strong style="color:#e2e8f0;">${fmt(h.consumedCost)}</strong> • Waste Recognized: <strong style="color:#e2e8f0;">${fmt(h.wasteAmount)}</strong>
          ${expired ? `<div style="color:#f97316; font-weight:800; margin-top:2px;">⏳ Hold window elapsed — discard only.</div>` : ''}
        </div>
        ${isHeld ? `<div style="display:flex; gap:8px;">${reuseBtn}${discardBtn}</div>` : `<div style="font-size:0.72rem; color:#64748b; font-weight:700;">${h.lineage || h.status}</div>`}
      </div>`;
  }

  /** Find the oldest active QUEUED/PREPARING line at this station with the same item and stamp the hold on it. */
  _reuseHoldOntoMatchingLine(hold, tenantId) {
    const tickets = offlineStore.getCollection('tickets') || [];
    let target = null;
    for (const t of tickets) {
      const isBarTicket = t.ticketType === 'BOT' || t.destination === 'BAR';
      if (isBarTicket || t.status === 'SERVED' || t.status === 'CANCELLED') continue;
      for (const it of (t.items || [])) {
        const s = String(it.itemStatus || it.status || '').toUpperCase();
        if ((s === 'QUEUED' || s === 'PREPARING') && !it.fulfilledByHoldId &&
            String(it.itemCode || it.itemId || '') === String(hold.itemCode)) {
          target = { ticket: t, item: it };
          break;
        }
      }
      if (target) break;
    }
    if (!target) return { success: false, error: 'NO_MATCHING_ACTIVE_LINE' };
    target.item.fulfilledByHoldId = hold.id;
    offlineStore.setCollection('tickets', tickets);
    return { success: true, orderId: target.ticket.orderId, ticketId: target.ticket.ticketId || target.ticket.id, orderLineId: target.item.lineItemId || target.item.itemId };
  }

  bindEvents() {
    if (!this.container) return;

    // Workflow tab listeners
    this.container.querySelectorAll('.btn-kds-workflow-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedStatusTab = btn.dataset.tab;
        this.updateContent();
      });
    });

    // Station selector
    const stationSelect = this.container.querySelector('#select-kds-station');
    if (stationSelect) {
      stationSelect.addEventListener('change', (e) => {
        this.selectedStation = e.target.value;
        this.updateContent();
      });
    }

    // Search query
    const searchInp = this.container.querySelector('#inp-kds-search');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.updateContent();
      });
    }

    // Fullscreen toggle
    const fsBtn = this.container.querySelector('.btn-kds-fullscreen');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          this.container.requestFullscreen().catch(err => console.warn('[KDS] Fullscreen error:', err));
        } else {
          document.exitFullscreen().catch(err => console.warn('[KDS] Exit fullscreen error:', err));
        }
      });
    }

    // Exit KDS
    const exitBtn = this.container.querySelector('.btn-kds-exit');
    if (exitBtn) {
      exitBtn.addEventListener('click', () => {
        this.destroy();
        if (this.onExit) this.onExit();
      });
    }

    // KOT transition buttons
    this.container.querySelectorAll('.btn-kds-transition').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ticketId = btn.dataset.id;
        const targetStatus = btn.dataset.target;

        const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
        const tenantId = session.tenantId || 'tenant_h0qc7wf';

        orderModel.updateTicketStatus(ticketId, targetStatus, tenantId);
        this.broadcastTicketChange(ticketId, targetStatus);
        
        platformEventBus.publish('ticket:status_changed', { ticketId, status: targetStatus });
        this.updateContent();
      });
    });

    // Item-level transition buttons
    this.container.querySelectorAll('.btn-kds-item-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ticketId = btn.dataset.ticketId;
        const itemId = btn.dataset.itemId;
        const targetStatus = btn.dataset.target;

        const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
        const tenantId = session.tenantId || 'tenant_h0qc7wf';

        orderModel.updateItemStatusInTicket(ticketId, itemId, targetStatus, tenantId);
        this.broadcastTicketChange(ticketId, targetStatus);

        platformEventBus.publish('ticket:status_changed', { ticketId, itemId, status: targetStatus });
        this.updateContent();
      });
    });

    // Cancellation request decision buttons (station authority enforced in cancellationModel)
    this.container.querySelectorAll('.btn-kds-cxl-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
        const tenantId = session.tenantId || 'tenant_h0qc7wf';

        const result = cancellationModel.decideCancellation(
          btn.dataset.requestId,
          btn.dataset.action,
          session,
          { disposition: btn.dataset.disposition || undefined },
          tenantId
        );

        if (!result.success) {
          window.alert(`Cancellation decision blocked: ${String(result.error).replace(/_/g, ' ')}`);
          return;
        }
        this.broadcastTicketChange('', 'cancellation');
        this.updateContent();
      });
    });

    // Held-item actions (Phase B): reuse onto a matching active line, or discard as waste.
    this.container.querySelectorAll('.btn-kds-hold-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
        const tenantId = session.tenantId || 'tenant_h0qc7wf';
        const holdId = btn.dataset.holdId;

        if (btn.dataset.holdAction === 'USE') {
          const hold = preparedHoldModel.getHold(holdId, tenantId);
          if (!hold) { window.alert('Hold not found.'); return; }
          const reuse = this._reuseHoldOntoMatchingLine(hold, tenantId);
          if (!reuse.success) {
            window.alert('No matching active line to receive this held item. Create the order line first, then reuse.');
            return;
          }
          const res = preparedHoldModel.reuseHold(holdId, {
            orderId: reuse.orderId, orderLineId: reuse.orderLineId, ticketId: reuse.ticketId, actor: session
          }, tenantId);
          if (!res.success) { window.alert(`Reuse blocked: ${String(res.error).replace(/_/g, ' ')}`); return; }
        } else if (btn.dataset.holdAction === 'DISCARD') {
          const res = preparedHoldModel.discardHold(holdId, { actor: session, reason: 'CANCELLED_ORDER' }, tenantId);
          if (!res.success) { window.alert(`Discard blocked: ${String(res.error).replace(/_/g, ' ')}`); return; }
        }

        this.broadcastTicketChange('', 'hold');
        this.updateContent();
      });
    });
  }
}
