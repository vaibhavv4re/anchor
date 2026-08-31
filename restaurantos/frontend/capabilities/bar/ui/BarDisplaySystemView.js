/**
 * RestaurantOS - Bar Display System (BDS) Live View (F8.1)
 * Dedicated, Full-Screen Operational Workspace for Bartenders.
 * Matches Kitchen Display System (KDS) design uniformity:
 * 1. Aesthetic, high-density BDS card design with status hierarchy.
 * 2. Dedicated Workflow Tabs: "⚠️ Needs Attention", "🔥 In Preparation", "🍸 Ready for Pickup", "📋 All BOTs".
 * 3. Cross-tab & multi-device real-time sync via EventBus & Local Storage delta polling.
 * 4. Native Web Audio chime on incoming drink tickets & state transitions.
 * 5. Fullscreen toggle, live urgency escalation timers, and 1-tap BUMP controls.
 */

import { orderModel } from '../../../../../businessos/platform/ordering/orderModel.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

export class BarDisplaySystemView {
  constructor(deps = {}) {
    this.container = null;
    this.onExit = deps.onExit || (() => {});
    this.selectedStatusTab = 'ATTENTION'; // 'ATTENTION' | 'PREPARING' | 'READY' | 'ALL'
    this.timerInterval = null;
    this.unsubscribeEvents = [];
    this.audioContext = null;
  }

  render(targetContainer = null) {
    this.container = targetContainer || document.createElement('div');
    this.container.className = 'bds-fullscreen-workspace animate-fade-in';
    this.container.style.cssText = 'min-height:100vh; width:100%; background:#0b0f19; color:#f1f5f9; padding:18px 24px; box-sizing:border-box; display:flex; flex-direction:column; gap:16px; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';
    
    this.updateContent();
    this.startLiveTimer();
    this.subscribeEvents();
    return this.container;
  }

  destroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.unsubscribeEvents.forEach(un => typeof un === 'function' && un());
  }

  subscribeEvents() {
    const refresh = () => {
      if (this.container && document.body.contains(this.container)) {
        this.updateContent();
      }
    };
    this.unsubscribeEvents = [
      platformEventBus.subscribe('bot:created', () => { this.playChime(); refresh(); }),
      platformEventBus.subscribe('bot:status_changed', refresh),
      platformEventBus.subscribe('ticket:status_changed', refresh),
      platformEventBus.subscribe('data:changed', refresh)
    ];
  }

  startLiveTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.container && document.body.contains(this.container)) {
        this.updateTimersOnly();
      }
    }, 10000);
  }

  playChime() {
    try {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.audioContext = new AudioCtx();
      }
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      if (this.audioContext) {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, this.audioContext.currentTime); // A5 note
        gain.gain.setValueAtTime(0.15, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.4);
      }
    } catch (_) {}
  }

  getBarTickets() {
    const allOrders = orderModel.getAllOrders() || [];
    const botTickets = [];

    allOrders.forEach(o => {
      if (Array.isArray(o.tickets)) {
        o.tickets.forEach(t => {
          if (t.ticketType === 'BOT' || t.stationName === 'Bar Station' || t.destination === 'BAR') {
            botTickets.push({
              ...t,
              orderId: o.id,
              tableNumber: o.tableNumber || o.tableName || 'Bar Counter',
              timeElapsedMin: Math.max(0, Math.floor((Date.now() - new Date(t.createdAt || Date.now()).getTime()) / 60000))
            });
          }
        });
      }
    });

    return botTickets;
  }

  updateContent() {
    if (!this.container) return;

    const tickets = this.getBarTickets();
    const queued = tickets.filter(t => t.status === 'QUEUED');
    const preparing = tickets.filter(t => t.status === 'PREPARING');
    const ready = tickets.filter(t => t.status === 'READY');

    let visibleTickets = tickets;
    if (this.selectedStatusTab === 'ATTENTION') visibleTickets = queued;
    else if (this.selectedStatusTab === 'PREPARING') visibleTickets = preparing;
    else if (this.selectedStatusTab === 'READY') visibleTickets = ready;

    this.container.innerHTML = `
      <!-- BDS FULLSCREEN HEADER BAR -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:#1e293b; padding:12px 20px; border-radius:12px; border:1px solid #334155;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="width:42px; height:42px; border-radius:10px; background:linear-gradient(135deg,#ec4899,#8b5cf6); display:flex; align-items:center; justify-content:center; font-size:1.4rem; font-weight:800; color:#fff; box-shadow:0 4px 12px rgba(236,72,153,0.4);">🍸</div>
          <div>
            <h1 style="margin:0; font-size:1.3rem; font-weight:800; color:#f8fafc; letter-spacing:-0.02em; display:flex; align-items:center; gap:10px;">
              BAR DISPLAY SYSTEM (BDS) <span style="font-size:0.75rem; background:#ec4899; color:#fff; padding:2px 8px; border-radius:4px; font-weight:800;">LIVE BAR STATION</span>
            </h1>
            <div style="font-size:0.8rem; color:#94a3b8; font-weight:600;">Realtime Bar Order Tickets (BOTs) &amp; Rapid Beverage Fulfillment</div>
          </div>
        </div>

        <!-- CONTROLS & WORKSPACE SWITCHER -->
        <div style="display:flex; align-items:center; gap:12px;">
          <button id="btn-toggle-fullscreen" class="btn-secondary" style="background:#334155; color:#f8fafc; border:1px solid #475569; padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.85rem; cursor:pointer;">
            ⛶ Fullscreen Toggle
          </button>
          <button id="btn-exit-bds" class="btn-secondary" style="background:#ef4444; color:#fff; border:none; padding:8px 16px; border-radius:8px; font-weight:800; font-size:0.85rem; cursor:pointer;">
            ✕ Exit BDS
          </button>
        </div>
      </div>

      <!-- WORKFLOW STATUS TABS STRIP -->
      <div style="display:flex; gap:10px; background:#1e293b; padding:6px; border-radius:10px; border:1px solid #334155;">
        <button class="bds-tab ${this.selectedStatusTab === 'ATTENTION' ? 'active' : ''}" data-tab="ATTENTION" style="flex:1; padding:10px; font-size:0.9rem; font-weight:800; border:none; border-radius:8px; background:${this.selectedStatusTab === 'ATTENTION' ? '#f59e0b' : 'transparent'}; color:${this.selectedStatusTab === 'ATTENTION' ? '#000' : '#94a3b8'}; cursor:pointer;">
          ⚠️ Needs Attention (${queued.length})
        </button>
        <button class="bds-tab ${this.selectedStatusTab === 'PREPARING' ? 'active' : ''}" data-tab="PREPARING" style="flex:1; padding:10px; font-size:0.9rem; font-weight:800; border:none; border-radius:8px; background:${this.selectedStatusTab === 'PREPARING' ? '#ec4899' : 'transparent'}; color:${this.selectedStatusTab === 'PREPARING' ? '#fff' : '#94a3b8'}; cursor:pointer;">
          🔥 In Preparation (${preparing.length})
        </button>
        <button class="bds-tab ${this.selectedStatusTab === 'READY' ? 'active' : ''}" data-tab="READY" style="flex:1; padding:10px; font-size:0.9rem; font-weight:800; border:none; border-radius:8px; background:${this.selectedStatusTab === 'READY' ? '#10b981' : 'transparent'}; color:${this.selectedStatusTab === 'READY' ? '#fff' : '#94a3b8'}; cursor:pointer;">
          🍸 Ready for Pickup (${ready.length})
        </button>
        <button class="bds-tab ${this.selectedStatusTab === 'ALL' ? 'active' : ''}" data-tab="ALL" style="flex:1; padding:10px; font-size:0.9rem; font-weight:800; border:none; border-radius:8px; background:${this.selectedStatusTab === 'ALL' ? '#3b82f6' : 'transparent'}; color:${this.selectedStatusTab === 'ALL' ? '#fff' : '#94a3b8'}; cursor:pointer;">
          📋 All BOTs (${tickets.length})
        </button>
      </div>

      <!-- BOT TICKET CARDS CONTAINER -->
      <div style="flex:1; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px; align-content:start;">
        ${visibleTickets.length > 0 ? visibleTickets.map(t => this.renderBDSTicketCard(t)).join('') : `
          <div style="grid-column:1/-1; text-align:center; padding:60px 20px; background:#1e293b; border-radius:12px; border:1px dashed #334155; color:#94a3b8;">
            <div style="font-size:3rem; margin-bottom:8px;">🍸</div>
            <h3 style="margin:0; font-size:1.2rem; color:#f8fafc;">No Active Bar Tickets in this Queue</h3>
            <p style="margin:4px 0 0; font-size:0.85rem;">Incoming drink orders from Waiters will appear here instantly with chime alerts.</p>
          </div>
        `}
      </div>
    `;

    this.bindEvents();
  }

  renderBDSTicketCard(t) {
    const isUrgent = t.timeElapsedMin >= 5;
    const isReady = t.status === 'READY';
    const isPreparing = t.status === 'PREPARING';

    const cardBorderColor = isReady ? '#10b981' : (isPreparing ? '#ec4899' : (isUrgent ? '#ef4444' : '#f59e0b'));

    return `
      <div class="bds-card" style="background:#1e293b; border:2px solid ${cardBorderColor}; border-radius:12px; padding:16px; display:flex; flex-direction:column; justify-space-between; gap:12px; box-shadow:0 8px 24px rgba(0,0,0,0.4); position:relative; overflow:hidden;">
        
        <!-- CARD HEADER -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid #334155; padding-bottom:10px;">
          <div>
            <div style="font-size:1.4rem; font-weight:900; color:#f8fafc; letter-spacing:-0.03em;">${t.tableNumber}</div>
            <div style="font-size:0.78rem; color:#94a3b8; font-weight:700;">BOT #${t.id}</div>
          </div>

          <div style="text-align:right;">
            <span style="font-size:0.8rem; font-weight:800; padding:3px 8px; border-radius:6px; background:${isUrgent ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}; color:${isUrgent ? '#ef4444' : '#f59e0b'}; border:1px solid ${isUrgent ? '#ef4444' : '#f59e0b'}; display:inline-block; margin-bottom:4px;">
              ⏱️ ${t.timeElapsedMin}m ago
            </span>
            <div style="font-size:0.75rem; font-weight:800; color:${cardBorderColor};">${t.status}</div>
          </div>
        </div>

        <!-- DRINK ITEMS LIST -->
        <div style="display:flex; flex-direction:column; gap:10px; flex:1; min-height:80px;">
          ${(t.items || []).map(it => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:10px 12px; border-radius:8px; border:1px solid #334155;">
              <span style="font-size:1rem; font-weight:800; color:#f8fafc;">${it.name || it.itemName}</span>
              <span style="font-size:1.1rem; font-weight:900; color:#ec4899; background:rgba(236,72,153,0.15); padding:2px 8px; border-radius:6px;">x${it.quantity || 1}</span>
            </div>
          `).join('')}
        </div>

        <!-- BIG HIGH-VISIBILITY ACTION BUMP BUTTON -->
        <div style="border-top:1px solid #334155; padding-top:12px; display:flex; gap:8px;">
          ${t.status === 'QUEUED' ? `
            <button class="btn-bds-action" data-ticket-id="${t.id}" data-status="PREPARING" style="width:100%; padding:14px; font-size:1rem; font-weight:900; background:#ec4899; color:#fff; border:none; border-radius:8px; cursor:pointer; box-shadow:0 4px 14px rgba(236,72,153,0.4);">
              ▶️ START PREPARING
            </button>
          ` : ''}

          ${t.status === 'PREPARING' ? `
            <button class="btn-bds-action" data-ticket-id="${t.id}" data-status="READY" style="width:100%; padding:14px; font-size:1rem; font-weight:900; background:#10b981; color:#fff; border:none; border-radius:8px; cursor:pointer; box-shadow:0 4px 14px rgba(16,185,129,0.4);">
              ✅ MARK READY FOR PICKUP
            </button>
          ` : ''}

          ${t.status === 'READY' ? `
            <button class="btn-bds-action" data-ticket-id="${t.id}" data-status="PICKED_UP" style="width:100%; padding:14px; font-size:0.9rem; font-weight:800; background:#3b82f6; color:#fff; border:none; border-radius:8px; cursor:pointer;">
              🍸 BUMP (PICKED UP)
            </button>
          ` : ''}
        </div>

      </div>
    `;
  }

  updateTimersOnly() {
    this.updateContent();
  }

  bindEvents() {
    // Tab switching
    this.container.querySelectorAll('.bds-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.selectedStatusTab = tab.dataset.tab;
        this.updateContent();
      });
    });

    // Action / Bump Button
    this.container.querySelectorAll('.btn-bds-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ticketId = btn.dataset.ticketId;
        const newStatus = btn.dataset.status;
        platformEventBus.publish('bot:status_changed', { ticketId, status: newStatus });
        this.updateContent();
      });
    });

    // Fullscreen Toggle
    const btnFs = this.container.querySelector('#btn-toggle-fullscreen');
    if (btnFs) {
      btnFs.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    // Exit BDS
    const btnExit = this.container.querySelector('#btn-exit-bds');
    if (btnExit) {
      btnExit.addEventListener('click', () => {
        if (typeof this.onExit === 'function') {
          this.onExit();
        }
      });
    }
  }
}
