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

        <!-- TICKET GRID DISPLAY -->
        ${filteredTickets.length === 0 ? `
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

                    <!-- ORDERED ITEMS LIST -->
                    <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
                      ${itemsList.map((item, idx) => {
                        const itemStatus = item.itemStatus || t.status || 'QUEUED';
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
                      const allReady = itemsList.every(i => (i.itemStatus || t.status) === 'READY' || (i.itemStatus || t.status) === 'SERVED');
                      const anyPrepOrReady = itemsList.some(i => (i.itemStatus || t.status) === 'PREPARING' || (i.itemStatus || t.status) === 'READY');

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
        `}
      </div>
    `;

    this.bindEvents();
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
  }
}
