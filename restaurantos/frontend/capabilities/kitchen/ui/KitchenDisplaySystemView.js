/**
 * RestaurantOS - Kitchen Display System (KDS) Live View (K-08.2)
 * Dedicated, Full-Screen Operational Workspace for Chefs & Line Station Cooks.
 * Features:
 * 1. Full-screen responsive viewport layout with native fullscreen toggle.
 * 2. Cross-tab & multi-device real-time sync via BroadcastChannel + Cloud Delta Polling.
 * 3. Native Web Audio kitchen chimes on incoming tickets and state transitions.
 * 4. Station filtering, live urgency escalation timers, and instant Supabase synchronization.
 */

import { orderModel } from '../../../../../businessos/platform/ordering/orderModel.js';
import { productionRoutingEngine } from '../../../../../businessos/platform/ordering/productionRoutingEngine.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

export class KitchenDisplaySystemView {
  constructor(deps = {}) {
    this.container = null;
    this.authEngine = deps.authEngine || (typeof window !== 'undefined' && window.__APP__ && window.__APP__.authEngine ? window.__APP__.authEngine : null);
    this.onExit = deps.onExit || (() => {});
    this.selectedStation = 'ALL';
    this.selectedStatus = 'ALL';
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
    this.container.style.cssText = 'min-height:100vh; width:100%; background:#0b0f19; color:#f1f5f9; padding:18px 24px; box-sizing:border-box; display:flex; flex-direction:column; gap:16px;';
    
    this.updateContent();
    this.startLiveTimer();
    this.startRealtimeSync();
    this.subscribeEvents();
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
        // High double-beep for Ready
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1174.66, now + 0.12);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else {
        // Warm bell chime for incoming / preparing
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
    // 1. Cross-Tab / Cross-Window Web BroadcastChannel
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

    // 2. Cross-Device Cloud Delta Sync (Polls Supabase orders every 3.5s)
    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
    const tenantId = session.tenantId || 'tenant_h0qc7wf';
    const dg = this._getDataGateway();

    if (dg && typeof dg.hydrateCollections === 'function') {
      this.pollInterval = setInterval(async () => {
        try {
          await dg.hydrateCollections(['orders'], tenantId);
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

    this.unsubscribeEvents.push(unsub1, unsub2, unsub3);
  }

  updateContent() {
    if (!this.container) return;

    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
    const tenantId = session.tenantId || 'tenant_h0qc7wf';

    // 1. Fetch live tickets
    const allTickets = orderModel.getAllTickets(tenantId) || [];
    const kitchenTickets = allTickets.filter(t => t.destination === 'KITCHEN' && t.status !== 'SERVED' && t.status !== 'CANCELLED');

    // 2. Compute dynamic station list from active items
    const stationsSet = new Set(['ALL']);
    kitchenTickets.forEach(t => {
      (t.items || []).forEach(i => {
        if (i.stationName) stationsSet.add(i.stationName.toUpperCase());
        else if (i.category) stationsSet.add(i.category.toUpperCase());
      });
    });
    const stationsList = Array.from(stationsSet);

    // 3. Filter tickets by Station, Status, and Search Query
    const filteredTickets = kitchenTickets.filter(t => {
      // Status filter (match overall ticket status OR any contained item status)
      if (this.selectedStatus !== 'ALL') {
        const matchesOverall = t.status === this.selectedStatus;
        const matchesAnyItem = (t.items || []).some(i => (i.itemStatus || t.status) === this.selectedStatus);
        if (!matchesOverall && !matchesAnyItem) return false;
      }

      // Station filter
      if (this.selectedStation !== 'ALL') {
        const hasStation = (t.items || []).some(i => 
          (i.stationName && i.stationName.toUpperCase() === this.selectedStation) ||
          (i.category && i.category.toUpperCase() === this.selectedStation)
        );
        if (!hasStation) return false;
      }

      // Search query
      if (this.searchQuery.trim()) {
        const q = this.searchQuery.toLowerCase().trim();
        const matchId = (t.ticketId || t.id || '').toLowerCase().includes(q);
        const matchOrder = (t.orderNumber || t.orderId || '').toLowerCase().includes(q);
        const matchTable = (t.tableCode || String(t.tableNumber || '')).toLowerCase().includes(q);
        const matchItem = (t.items || []).some(i => (i.name || i.itemName || '').toLowerCase().includes(q));
        if (!matchId && !matchOrder && !matchTable && !matchItem) return false;
      }

      return true;
    });

    const queuedCount = kitchenTickets.filter(t => t.status === 'QUEUED').length;
    const preparingCount = kitchenTickets.filter(t => t.status === 'PREPARING').length;
    const readyCount = kitchenTickets.filter(t => t.status === 'READY').length;

    this.container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px;">
        
        <!-- HEADER CONTROL BAR -->
        <div style="background:var(--bg-surface-1); padding:16px 20px; border-radius:8px; border-left:4px solid var(--status-danger); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="display:flex; align-items:center; gap:10px;">
              <h2 style="font-size:1.6rem; margin:0; font-weight:800;">👨‍🍳 Live Kitchen Display System (KDS)</h2>
              <span class="badge ${kitchenTickets.length > 0 ? 'badge-danger' : 'badge-success'}" style="font-size:0.8rem; padding:4px 10px; font-weight:700;">
                ${kitchenTickets.length} ACTIVE KOTs
              </span>
            </div>
            <p style="color:var(--text-muted); font-size:0.85rem; margin:4px 0 0;">
              Real-time ticket queue linked to Supabase Orders • Zero demo data
            </p>
          </div>

          <div style="display:flex; align-items:center; gap:10px;">
            <button class="btn-secondary btn-kds-fullscreen" style="padding:8px 14px; font-weight:700; background:var(--bg-surface-2); border-color:var(--border-subtle);">
              ⛶ Toggle Fullscreen
            </button>
            <button class="btn-secondary btn-kds-exit" style="padding:8px 16px; font-weight:600;">
              👨‍🍳 Exit to Chef Workspace
            </button>
          </div>
        </div>

        <!-- FILTER & CONTROLS TOOLBAR -->
        <div style="background:var(--bg-surface-2); padding:12px 16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          
          <!-- Station Tabs -->
          <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
            <span style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-right:4px;">STATION:</span>
            ${stationsList.map(st => `
              <button class="btn-secondary btn-filter-station ${this.selectedStation === st ? 'active' : ''}" data-station="${st}" style="padding:5px 12px; font-size:0.8rem; font-weight:700; ${this.selectedStation === st ? 'background:var(--accent-primary); color:#fff; border-color:var(--accent-primary);' : ''}">
                ${st}
              </button>
            `).join('')}
          </div>

          <!-- Status Filters & Search -->
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <div style="display:flex; gap:4px; background:var(--bg-surface-1); padding:3px; border-radius:6px;">
              <button class="btn-secondary btn-filter-status ${this.selectedStatus === 'ALL' ? 'active' : ''}" data-status="ALL" style="padding:4px 10px; font-size:0.75rem; font-weight:700;">
                All (${kitchenTickets.length})
              </button>
              <button class="btn-secondary btn-filter-status ${this.selectedStatus === 'QUEUED' ? 'active' : ''}" data-status="QUEUED" style="padding:4px 10px; font-size:0.75rem; font-weight:700; color:var(--status-danger);">
                🔴 Queued (${queuedCount})
              </button>
              <button class="btn-secondary btn-filter-status ${this.selectedStatus === 'PREPARING' ? 'active' : ''}" data-status="PREPARING" style="padding:4px 10px; font-size:0.75rem; font-weight:700; color:var(--status-warning);">
                🟡 Preparing (${preparingCount})
              </button>
              <button class="btn-secondary btn-filter-status ${this.selectedStatus === 'READY' ? 'active' : ''}" data-status="READY" style="padding:4px 10px; font-size:0.75rem; font-weight:700; color:var(--status-success);">
                🟢 Ready (${readyCount})
              </button>
            </div>

            <input type="text" id="inp-kds-search" placeholder="🔍 Search Table, Item..." value="${this.searchQuery}" style="padding:6px 12px; border-radius:6px; border:1px solid var(--border-subtle); font-size:0.85rem; width:180px;">
          </div>
        </div>

        <!-- TICKET GRID OR EMPTY STATE -->
        ${filteredTickets.length === 0 ? `
          <div class="card" style="background:var(--bg-surface-1); padding:80px 20px; text-align:center; border-radius:8px;">
            <div style="font-size:3.5rem; margin-bottom:12px;">🍳</div>
            <h3 style="font-size:1.4rem; margin:0 0 8px; font-weight:800;">Kitchen Order Queue is Clear</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; max-width:480px; margin:0 auto;">
              ${kitchenTickets.length === 0 
                ? 'No active food orders in the kitchen. Orders placed from the Dining Room / POS will appear here instantly.'
                : 'No tickets match the selected station or status filter.'}
            </p>
          </div>
        ` : `
          <div class="grid grid-cols-3 gap-md" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(330px, 1fr)); gap:16px;">
            ${filteredTickets.map(t => {
              const borderCol = t.status === 'QUEUED' ? 'var(--status-danger)' : (t.status === 'PREPARING' ? 'var(--status-warning)' : 'var(--status-success)');
              const badgeCls = t.status === 'QUEUED' ? 'badge-danger' : (t.status === 'PREPARING' ? 'badge-warning' : 'badge-success');
              const mins = this.getElapsedMinutes(t.createdAt);
              const timerColor = mins > 15 ? 'var(--status-danger)' : (mins > 8 ? 'var(--status-warning)' : 'var(--text-muted)');
              const itemsList = Array.isArray(t.items) ? t.items : [];

              return `
                <div class="card" style="background:var(--bg-surface-1); border-top:5px solid ${borderCol}; border-radius:8px; display:flex; flex-direction:column; justify-content:space-between; padding:16px; box-shadow:0 4px 12px rgba(0,0,0,0.15);">
                  <div>
                    <!-- Ticket Header -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                      <div>
                        <div style="font-size:1.15rem; font-weight:800; font-family:monospace; color:var(--accent-primary);">
                          ${t.ticketId || t.id}
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                          Order: <strong>${t.orderNumber || t.orderId}</strong>
                        </div>
                      </div>
                      <span class="badge ${badgeCls}" style="font-size:0.75rem; font-weight:800; text-transform:uppercase;">
                        ${t.status}
                      </span>
                    </div>

                    <!-- Table & Time Banner -->
                    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-2); padding:6px 10px; border-radius:6px; margin-bottom:8px;">
                      <span style="font-size:1.1rem; font-weight:800; color:var(--text-main);">
                        🍽️ ${t.tableCode || ('T-' + String(t.tableNumber || 1).padStart(2, '0'))}
                      </span>
                      <span data-created-at="${t.createdAt || ''}" style="font-size:0.8rem; font-weight:700; color:${timerColor};">
                        ${this.formatElapsed(t.createdAt)}
                      </span>
                    </div>

                    <!-- Item-Level Progress Bar -->
                    ${(() => {
                      const totalItems = itemsList.length || 1;
                      const readyCount = itemsList.filter(i => (i.itemStatus || t.status) === 'READY' || (i.itemStatus || t.status) === 'SERVED').length;
                      const prepCount = itemsList.filter(i => (i.itemStatus || t.status) === 'PREPARING').length;
                      const percent = Math.round((readyCount / totalItems) * 100);

                      return `
                        <div style="margin-bottom:10px; background:var(--bg-surface-2); padding:6px 10px; border-radius:6px; font-size:0.75rem;">
                          <div style="display:flex; justify-content:space-between; font-weight:700; color:var(--text-secondary); margin-bottom:4px;">
                            <span>Progress: ${readyCount}/${totalItems} Ready</span>
                            <span style="color:${readyCount === totalItems ? '#10b981' : (prepCount > 0 ? '#f59e0b' : 'var(--text-muted)')};">${percent}%</span>
                          </div>
                          <div style="width:100%; height:5px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
                            <div style="width:${percent}%; height:100%; background:${readyCount === totalItems ? '#10b981' : '#f59e0b'}; transition:width 0.3s ease;"></div>
                          </div>
                        </div>
                      `;
                    })()}

                    <!-- Ordered Items List with Item-Level Action Controls -->
                    <div style="display:flex; flex-direction:column; gap:8px;">
                      ${itemsList.map((item, idx) => {
                        const itemStatus = item.itemStatus || t.status || 'QUEUED';
                        const isReady = itemStatus === 'READY';
                        const isPrep = itemStatus === 'PREPARING';
                        const isQueued = itemStatus === 'QUEUED';
                        const isServed = itemStatus === 'SERVED';

                        const itemBorder = isReady ? '#10b981' : (isPrep ? '#f59e0b' : (isServed ? '#6b7280' : 'var(--accent-primary)'));
                        const itemBg = isReady ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-surface-2)';

                        return `
                          <div style="background:${itemBg}; padding:10px 12px; border-radius:6px; border-left:4px solid ${itemBorder}; display:flex; flex-direction:column; gap:6px;">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                              <div style="flex:1;">
                                <div style="font-size:0.95rem; font-weight:700; color:var(--text-main);">
                                  <span style="color:var(--accent-primary); font-weight:800; font-size:1.05rem;">${item.quantity || item.qty || 1}x</span> ${item.name || item.itemName}
                                </div>
                                ${item.stationName ? `
                                  <span class="badge badge-secondary" style="font-size:0.65rem; text-transform:uppercase; margin-top:2px; display:inline-block;">
                                    ${item.stationName}
                                  </span>
                                ` : ''}
                              </div>

                              <!-- Item Status Badge -->
                              <div>
                                ${isReady ? `<span class="badge" style="background:#10b98122; color:#10b981; border:1px solid #10b981; font-size:0.7rem; font-weight:800;">🟢 READY</span>` : ''}
                                ${isPrep ? `<span class="badge" style="background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b; font-size:0.7rem; font-weight:800;">🟡 PREPARING</span>` : ''}
                                ${isQueued ? `<span class="badge badge-info" style="font-size:0.7rem; font-weight:800;">🔴 QUEUED</span>` : ''}
                                ${isServed ? `<span class="badge" style="background:#6b728022; color:#6b7280; font-size:0.7rem;">⚪ SERVED</span>` : ''}
                              </div>
                            </div>

                            ${item.notes ? `
                              <div style="font-size:0.75rem; color:var(--status-warning); background:rgba(234, 179, 8, 0.1); padding:3px 6px; border-radius:4px; font-weight:600;">
                                ⚠️ Note: ${item.notes}
                              </div>
                            ` : ''}

                            <!-- Item-Level Chef Controls -->
                            <div style="display:flex; justify-content:flex-end; gap:6px; align-items:center; border-top:1px solid rgba(255,255,255,0.05); padding-top:6px; margin-top:2px;">
                              ${isQueued ? `
                                <button class="btn-secondary btn-kds-item-action" data-ticket-id="${t.ticketId || t.id}" data-item-id="${item.lineItemId || item.itemId || idx}" data-target="PREPARING" style="padding:3px 8px; font-size:0.75rem; font-weight:700; background:rgba(245,158,11,0.15); color:#f59e0b; border-color:#f59e0b;">
                                  🔥 Start Prep
                                </button>
                                <button class="btn-secondary btn-kds-item-action" data-ticket-id="${t.ticketId || t.id}" data-item-id="${item.lineItemId || item.itemId || idx}" data-target="READY" style="padding:3px 8px; font-size:0.75rem; font-weight:700; background:rgba(16,185,129,0.15); color:#10b981; border-color:#10b981;">
                                  ✅ Mark Ready
                                </button>
                              ` : ''}

                              ${isPrep ? `
                                <button class="btn-secondary btn-kds-item-action" data-ticket-id="${t.ticketId || t.id}" data-item-id="${item.lineItemId || item.itemId || idx}" data-target="READY" style="padding:4px 12px; font-size:0.75rem; font-weight:800; background:#10b981; color:#fff; border-color:#10b981;">
                                  ✅ Mark Item Ready
                                </button>
                              ` : ''}

                              ${isReady ? `
                                <span style="font-size:0.75rem; color:#10b981; font-weight:700; margin-right:4px;">✓ Ready for Waiter</span>
                                <button class="btn-secondary btn-kds-item-action" data-ticket-id="${t.ticketId || t.id}" data-item-id="${item.lineItemId || item.itemId || idx}" data-target="PREPARING" title="Move back to preparing" style="padding:2px 6px; font-size:0.65rem; color:var(--text-muted); opacity:0.8;">
                                  ↩ Undo
                                </button>
                              ` : ''}
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>

                  <!-- Lifecycle Action Footer -->
                  <div style="margin-top:16px; border-top:1px solid var(--border-subtle); padding-top:12px;">
                    ${(() => {
                      const allReady = itemsList.every(i => (i.itemStatus || t.status) === 'READY' || (i.itemStatus || t.status) === 'SERVED');
                      const anyPrepOrReady = itemsList.some(i => (i.itemStatus || t.status) === 'PREPARING' || (i.itemStatus || t.status) === 'READY');

                      if (allReady) {
                        return `
                          <button class="btn-primary btn-kds-transition" data-id="${t.ticketId || t.id}" data-target="SERVED" style="width:100%; padding:10px; font-weight:800; font-size:0.9rem; background:var(--accent-secondary); border-color:var(--accent-secondary);">
                            🍽️ Mark Entire KOT Served
                          </button>
                        `;
                      } else if (anyPrepOrReady) {
                        return `
                          <button class="btn-primary btn-kds-transition" data-id="${t.ticketId || t.id}" data-target="READY" style="width:100%; padding:10px; font-weight:800; font-size:0.9rem; background:var(--status-success); border-color:var(--status-success);">
                            ✅ Mark ALL Items in KOT Ready
                          </button>
                        `;
                      } else {
                        return `
                          <button class="btn-primary btn-kds-transition" data-id="${t.ticketId || t.id}" data-target="PREPARING" style="width:100%; padding:10px; font-weight:800; font-size:0.9rem; background:var(--status-danger); border-color:var(--status-danger);">
                            🔥 Start All Preparation
                          </button>
                        `;
                      }
                    })()}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    this.bindEvents(tenantId);
  }

  bindEvents(tenantId) {
    if (!this.container) return;

    // 1. Exit button
    const exitBtn = this.container.querySelector('.btn-kds-exit');
    if (exitBtn) {
      exitBtn.addEventListener('click', () => this.onExit());
    }

    // 1b. Fullscreen toggle button
    const fsBtn = this.container.querySelector('.btn-kds-fullscreen');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          }
        }
      });
    }

    // 2. Station filter buttons
    this.container.querySelectorAll('.btn-filter-station').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedStation = btn.dataset.station;
        this.updateContent();
      });
    });

    // 3. Status filter buttons
    this.container.querySelectorAll('.btn-filter-status').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedStatus = btn.dataset.status;
        this.updateContent();
      });
    });

    // 4. Search input
    const searchInp = this.container.querySelector('#inp-kds-search');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.updateContent();
      });
    }

    // 5. Individual Item Action Buttons
    this.container.querySelectorAll('.btn-kds-item-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ticketId = btn.dataset.ticketId;
        const itemId = btn.dataset.itemId;
        const targetState = btn.dataset.target;

        btn.disabled = true;
        productionRoutingEngine.updateTicketItemStatus(ticketId, itemId, targetState, tenantId);
        this.broadcastTicketChange(ticketId, targetState);
        this.updateContent();
      });
    });

    // 6. Whole Ticket State transition action buttons
    this.container.querySelectorAll('.btn-kds-transition').forEach(btn => {
      btn.addEventListener('click', () => {
        const ticketId = btn.dataset.id;
        const targetState = btn.dataset.target;
        
        btn.disabled = true;
        btn.innerHTML = '⏳ Updating...';

        // Update in memory and sync to Supabase
        productionRoutingEngine.updateTicketStatus(ticketId, targetState, tenantId);
        
        // Broadcast to all other open tabs/windows immediately
        this.broadcastTicketChange(ticketId, targetState);

        // Re-render UI immediately
        this.updateContent();
      });
    });
  }

  startLiveTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.container) return;
      this.container.querySelectorAll('[data-created-at]').forEach(el => {
        const createdAt = el.getAttribute('data-created-at');
        if (createdAt) {
          const mins = this.getElapsedMinutes(createdAt);
          el.textContent = this.formatElapsed(createdAt);
          el.style.color = mins > 15 ? 'var(--status-danger)' : (mins > 8 ? 'var(--status-warning)' : 'var(--text-muted)');
        }
      });
    }, 10000);
  }

  getElapsedMinutes(createdAt) {
    if (!createdAt) return 0;
    const createdTime = new Date(createdAt).getTime();
    if (isNaN(createdTime)) return 0;
    return Math.max(0, Math.floor((Date.now() - createdTime) / 60000));
  }

  formatElapsed(createdAt) {
    if (!createdAt) return '0m ago';
    const mins = this.getElapsedMinutes(createdAt);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hrs}h ${rem}m ago`;
  }
}
