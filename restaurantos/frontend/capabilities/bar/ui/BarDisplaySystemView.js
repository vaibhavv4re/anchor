/**
 * RestaurantOS - Bar Display System (BDS) Live View (Phase B-06)
 * Dedicated, Full-Screen Operational Workspace for Bartenders.
 * 
 * Domain & Architectural Contracts (Phase B-06B Frozen Invariants):
 * 1. Read-Only Authority: BDS reads authoritative BOT projections from orderModel / DataGateway.
 *    BDS NEVER owns order truth or invokes inventory consumption directly.
 * 2. Multi-Terminal Realtime Hierarchy: BroadcastChannel (fast cross-window) + Cloud Delta Hydration (recovery).
 * 3. Non-Destructive DOM Preservation: Timer ticks mutate [data-created-at] & aging classes in place.
 *    Never wipes or re-renders ticket grid merely because the clock ticked.
 * 4. Line-Item Execution Duality: Individual drink controls (Start, Ready, Undo) delegating to
 *    orderModel.updateTicketItemStatus() -> productionRoutingEngine -> B-03 consumption at LOC-314.
 * 5. Three-Tier Visual Aging:
 *    - t < 3 min:       FRESH (Slate #334155, serene)
 *    - 3 <= t <= 7 min: WARNING (Amber #f59e0b, elevated)
 *    - t > 7 min:       CRITICAL (Pulsing Red #ef4444, SLA breach)
 * 6. Speed Rail: Real-time read-only projection aggregating active, non-served Bar BOT line items
 *    with interactive tap-to-highlight. Zero independent state counters.
 * 7. Audio Ergonomics: Distinct Web Audio chimes (NEW_BOT, CRITICAL_SLA, READY) with mute & volume controls.
 * 8. Accidental Bump Recovery: 10-second floating Undo Toast + Recent Bumps (last 10) Recall drawer
 *    restoring tickets via domain commands with zero duplicate stock deduction.
 * 9. Recipe Spec Inspection: Tap-to-inspect drink spec preserving strict recipe-missing safeguards.
 */

import { orderModel } from '../../../../../businessos/platform/ordering/orderModel.js';
import { recipeModel } from '../../../../../businessos/platform/kitchen/recipeModel.js';
import { cancellationModel } from '../../../../../businessos/platform/ordering/cancellationModel.js';
import { dispositionPolicyModel } from '../../../../../businessos/platform/ordering/dispositionPolicyModel.js';
import { preparedHoldModel } from '../../../../../businessos/platform/ordering/preparedHoldModel.js';
import { offlineStore } from '../../../../../businessos/platform/offline_store/offlineStore.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { BAR_COCKTAIL_CODES } from '../../../../../businessos/platform/bar/barConsumptionMapping.js';

export class BarDisplaySystemView {
  constructor(deps = {}) {
    this.container = null;
    this.onExit = deps.onExit || (() => {});
    this.selectedStatusTab = 'ATTENTION'; // 'ATTENTION' | 'PREPARING' | 'READY' | 'ALL'
    this.selectedSpeedRailItem = null; // String name of drink to highlight / filter
    this.searchQuery = '';
    
    // Audio configuration (persisted to localStorage)
    this.audioEnabled = typeof localStorage !== 'undefined' 
      ? localStorage.getItem('anchor_bds_audio_enabled') !== 'false' 
      : true;
    this.audioVolume = typeof localStorage !== 'undefined' 
      ? parseFloat(localStorage.getItem('anchor_bds_audio_volume') || '0.7') 
      : 0.7;
    
    // Accidental bump recovery (last 10 served tickets)
    this.recentBumps = typeof localStorage !== 'undefined'
      ? JSON.parse(localStorage.getItem('anchor_bds_recent_bumps') || '[]')
      : [];
    this.showRecentBumpsDrawer = false;
    
    // 10-second Undo Toast state
    this.undoToast = null; // { ticketId, orderNumber, tableNumber, expiresAt, remainingSec }
    this.undoToastInterval = null;
    
    // Recipe spec popover
    this.selectedSpecItem = null;

    // Realtime & timers
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

  _getTenantId() {
    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
    return session.tenantId || 'tenant_h0qc7wf';
  }

  render(targetContainer = null) {
    this.container = targetContainer || document.createElement('div');
    this.container.className = 'bds-fullscreen-workspace animate-fade-in';
    this.container.style.cssText = 'min-height:100vh; width:100%; background:#0b0f19; color:#f1f5f9; padding:18px 24px; box-sizing:border-box; display:flex; flex-direction:column; gap:16px; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; position:relative;';

    // User gesture listener to unlock Web Audio API if suspended
    this.container.addEventListener('click', () => {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
    }, { once: true });

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
    if (this.undoToastInterval) {
      clearInterval(this.undoToastInterval);
      this.undoToastInterval = null;
    }
    if (this.broadcastChannel) {
      try { this.broadcastChannel.close(); } catch (_) {}
      this.broadcastChannel = null;
    }
    this.unsubscribeEvents.forEach(un => typeof un === 'function' && un());
    this.unsubscribeEvents = [];
  }

  // =========================================================================
  // REALTIME SYNCHRONIZATION HIERARCHY (BroadcastChannel + Cloud Delta Polling)
  // =========================================================================

  startRealtimeSync() {
    // 1. Fast cross-window / cross-tab propagation via BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('anchor_bds_realtime');
        this.broadcastChannel.onmessage = (event) => {
          if (event.data && (event.data.type === 'BDS_TICKET_UPDATE' || event.data.type === 'BDS_NEW_ORDER')) {
            this.updateContent(false);
          }
        };
      } catch (err) {
        console.warn('[BDS] BroadcastChannel initialization error:', err);
      }
    }

    // 2. Resilient recovery & multi-terminal convergence via cloud delta hydration (3.5s)
    const dg = this._getDataGateway();
    const tenantId = this._getTenantId();

    if (dg && typeof dg.hydrateCollections === 'function') {
      this.pollInterval = setInterval(async () => {
        try {
          await dg.hydrateCollections(['orders', 'cancellation_requests', 'prepared_item_holds'], tenantId);
          const tickets = this.getBarTickets();
          const currentHash = JSON.stringify(tickets.map(t => `${t.id}_${t.status}_${t.updatedAt || ''}_${(t.items || []).map(i => i.itemStatus).join('-')}`));
          if (currentHash !== this.lastTicketsHash) {
            this.lastTicketsHash = currentHash;
            this.updateContent(false);
          }
        } catch (_) {}
      }, 3500);
    }
  }

  broadcastTicketChange(ticketId, newStatus, details = {}) {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'BDS_TICKET_UPDATE',
          ticketId,
          status: newStatus,
          ...details,
          timestamp: Date.now()
        });
      } catch (_) {}
    }
  }

  subscribeEvents() {
    if (this.unsubscribeEvents.length > 0) return;

    const refresh = () => {
      if (this.container && (typeof document === 'undefined' || !document.body || typeof document.body.contains !== 'function' || document.body.contains(this.container))) {
        this.updateContent(false);
      }
    };

    this.unsubscribeEvents = [
      platformEventBus.subscribe('bot:created', () => { this.playChime('NEW_BOT'); refresh(); }),
      platformEventBus.subscribe('bot:dispatched', () => { this.playChime('NEW_BOT'); refresh(); }),
      platformEventBus.subscribe('order:confirmed', () => { this.playChime('NEW_BOT'); refresh(); }),
      platformEventBus.subscribe('bot:status_changed', refresh),
      platformEventBus.subscribe('ticket:status_changed', refresh),
      platformEventBus.subscribe('ticket:item_status_changed', refresh),
      platformEventBus.subscribe('data:changed', refresh),
      // Cancellation workflow: incoming waiter requests chime + re-render; decisions and
      // cloud syncs from other devices refresh the request cards too (BAR-scoped).
      platformEventBus.subscribe('cancellation:requested', (e) => {
        if (e && e.payload && e.payload.station !== 'BAR') return;
        this.playChime('NEW_BOT');
        refresh();
      }),
      platformEventBus.subscribe('cancellation:decided', refresh),
      platformEventBus.subscribe('cancellation:reversed', refresh),
      platformEventBus.subscribe('cancellation:synced', refresh),
      // Hold board (Phase B): refresh HELD stock + reuse hints on any hold lifecycle change.
      platformEventBus.subscribe('hold:created', refresh),
      platformEventBus.subscribe('hold:reused', refresh),
      platformEventBus.subscribe('hold:discarded', refresh)
    ];
  }

  // =========================================================================
  // AUDIO ENGINE & ERGONOMICS (NEW_BOT, CRITICAL_SLA, READY)
  // =========================================================================

  playChime(type = 'NEW_BOT') {
    if (!this.audioEnabled) return;
    try {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.audioContext = new AudioCtx();
      }
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
      if (!this.audioContext) return;

      const now = this.audioContext.currentTime;
      const masterVol = Math.max(0, Math.min(1, this.audioVolume));

      if (type === 'NEW_BOT') {
        // Crisp dual ascending chime (D5 587.33Hz -> A5 880Hz)
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.2 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (type === 'CRITICAL_SLA') {
        // Urgent dual alert pulse (440Hz A4)
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(440, now);
        gain1.gain.setValueAtTime(0.18 * masterVol, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);
        osc1.start(now);
        osc1.stop(now + 0.12);

        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(440, now + 0.18);
        gain2.gain.setValueAtTime(0.18 * masterVol, now + 0.18);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);
        osc2.start(now + 0.18);
        osc2.stop(now + 0.35);
      } else if (type === 'READY') {
        // Bright melodic chime (A5 880Hz -> D6 1174.66Hz)
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1174.66, now + 0.12);
        gain.gain.setValueAtTime(0.15 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.start(now);
        osc.stop(now + 0.38);
      }
    } catch (_) {
      // Audio playback errors are non-fatal and must never break workflows
    }
  }

  toggleAudio() {
    this.audioEnabled = !this.audioEnabled;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('anchor_bds_audio_enabled', String(this.audioEnabled));
    }
    this.updateContent(false);
  }

  setVolume(vol) {
    this.audioVolume = Math.max(0, Math.min(1, parseFloat(vol) || 0.7));
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('anchor_bds_audio_volume', String(this.audioVolume));
    }
  }

  // =========================================================================
  // DATA PROJECTION: BOT TICKETS & SPEED RAIL AGGREGATION
  // =========================================================================

  getElapsedMinutes(createdAt) {
    if (!createdAt) return 0;
    const diffMs = Date.now() - new Date(createdAt).getTime();
    return Math.max(0, Math.floor(diffMs / 60000));
  }

  /**
   * Evaluates exact mathematical 3-tier aging boundary:
   * t < 3 min       -> FRESH
   * 3 <= t <= 7 min -> WARNING
   * t > 7 min       -> CRITICAL
   */
  getAgingTier(elapsedMins) {
    if (elapsedMins < 3) return 'FRESH';
    if (elapsedMins <= 7) return 'WARNING';
    return 'CRITICAL';
  }

  getAgingColors(tier) {
    if (tier === 'CRITICAL') {
      return {
        border: '#ef4444',
        badgeBg: 'rgba(239,68,68,0.25)',
        badgeText: '#ef4444',
        glow: '0 0 16px rgba(239,68,68,0.35)'
      };
    }
    if (tier === 'WARNING') {
      return {
        border: '#f59e0b',
        badgeBg: 'rgba(245,158,11,0.2)',
        badgeText: '#f59e0b',
        glow: 'none'
      };
    }
    return {
      border: '#334155',
      badgeBg: 'rgba(148,163,184,0.15)',
      badgeText: '#94a3b8',
      glow: 'none'
    };
  }

  getBarTickets() {
    const tenantId = this._getTenantId();
    // Authoritative fetch: orderModel.getAllTickets merges embedded order tickets & local tickets
    const allTickets = orderModel.getAllTickets(tenantId) || [];
    const botTickets = [];

    allTickets.forEach(t => {
      const isBar = t.ticketType === 'BOT' || t.destination === 'BAR' || t.stationName === 'Bar Station';
      if (isBar) {
        const createdAt = t.createdAt || Date.now();
        const mins = this.getElapsedMinutes(createdAt);
        botTickets.push({
          ...t,
          ticketId: t.ticketId || t.id,
          tableNumber: t.tableNumber || t.tableCode || 'Bar Counter',
          timeElapsedMin: mins,
          agingTier: this.getAgingTier(mins)
        });
      }
    });

    return botTickets.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  }

  /**
   * Speed Rail Projection: Aggregates active, non-served Bar BOT line items.
   * Zero redundant state. Derived on the fly.
   */
  getSpeedRailAggregation(activeTickets = []) {
    const active = activeTickets.filter(t => t.status !== 'SERVED' && t.status !== 'CANCELLED');
    const aggregationMap = new Map();

    active.forEach(t => {
      (t.items || []).forEach(it => {
        const itemStatus = it.itemStatus || it.status || t.status;
        if (itemStatus !== 'SERVED') {
          const name = it.name || it.itemName || it.itemCode || 'Drink';
          const qty = parseFloat(it.quantity || it.qty || 1);
          const itemCode = it.itemCode || it.itemId;

          if (!aggregationMap.has(name)) {
            aggregationMap.set(name, {
              name,
              itemCode,
              category: it.category || 'BAR',
              totalQty: 0,
              ticketIds: new Set(),
              hasQueued: false,
              hasPreparing: false,
              hasReady: false
            });
          }

          const agg = aggregationMap.get(name);
          agg.totalQty += qty;
          agg.ticketIds.add(t.ticketId || t.id);
          if (itemStatus === 'QUEUED') agg.hasQueued = true;
          if (itemStatus === 'PREPARING') agg.hasPreparing = true;
          if (itemStatus === 'READY') agg.hasReady = true;
        }
      });
    });

    return Array.from(aggregationMap.values()).sort((a, b) => b.totalQty - a.totalQty);
  }

  // =========================================================================
  // NON-DESTRUCTIVE IN-PLACE DOM TIMER UPDATE
  // =========================================================================

  startLiveTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.container && document.body.contains(this.container)) {
        this.updateTimersOnly();
      }
    }, 10000);
  }

  /**
   * Mutates existing DOM elements in place without wiping or replacing container innerHTML!
   * Protects touch events, active clicks, dropdowns, and scroll offsets.
   */
  updateTimersOnly() {
    if (!this.container) return;

    this.container.querySelectorAll('.bds-card').forEach(card => {
      const createdAt = card.getAttribute('data-created-at');
      const ticketStatus = card.getAttribute('data-ticket-status');
      if (!createdAt) return;

      const mins = this.getElapsedMinutes(createdAt);
      const tier = this.getAgingTier(mins);
      const colors = this.getAgingColors(tier);

      // Update timestamp text
      const timeBadge = card.querySelector('.bds-timer-badge');
      if (timeBadge) {
        timeBadge.textContent = mins < 1 ? '⏱️ Just now' : `⏱️ ${mins}m ago`;
        if (ticketStatus !== 'READY' && ticketStatus !== 'PREPARING' && ticketStatus !== 'PARTIALLY_READY') {
          timeBadge.style.color = colors.badgeText;
          timeBadge.style.background = colors.badgeBg;
          timeBadge.style.borderColor = colors.border;
        }
      }

      // Update card border & glow if not in fixed status
      if (ticketStatus !== 'READY' && ticketStatus !== 'PREPARING' && ticketStatus !== 'PARTIALLY_READY') {
        card.style.borderColor = colors.border;
        card.style.boxShadow = colors.glow;
        card.setAttribute('data-aging-tier', tier);
      }
    });
  }

  // =========================================================================
  // USER ACTIONS: ITEM-LEVEL & TICKET-LEVEL BUMP DUALITY
  // =========================================================================

  handleItemAction(ticketId, lineItemId, targetStatus) {
    const tenantId = this._getTenantId();
    
    // Authoritative update through orderModel -> productionRoutingEngine -> B-03 consumption on READY
    orderModel.updateTicketItemStatus(ticketId, lineItemId, targetStatus, tenantId);
    
    this.broadcastTicketChange(ticketId, targetStatus, { lineItemId });
    platformEventBus.publish('ticket:item_status_changed', { ticketId, lineItemId, status: targetStatus });
    platformEventBus.publish('ticket:status_changed', { ticketId, status: targetStatus });
    
    if (targetStatus === 'READY') {
      this.playChime('READY');
    }
    
    this.updateContent(false);
  }

  handleTicketAction(ticketId, targetStatus) {
    const tenantId = this._getTenantId();
    const tickets = this.getBarTickets();
    const ticket = tickets.find(t => (t.ticketId === ticketId || t.id === ticketId));

    if (targetStatus === 'SERVED' && ticket) {
      // Capture in Recent Bumps list (last 10)
      this.addRecentBump(ticket);
      // Trigger floating 10-second Undo Toast
      this.startUndoToast(ticket);
    }

    // Authoritative ticket update through orderModel -> productionRoutingEngine
    orderModel.updateTicketStatus(ticketId, targetStatus, tenantId);

    this.broadcastTicketChange(ticketId, targetStatus);
    platformEventBus.publish('bot:status_changed', { ticketId, status: targetStatus });
    platformEventBus.publish('ticket:status_changed', { ticketId, status: targetStatus });

    if (targetStatus === 'READY') {
      this.playChime('READY');
    }

    this.updateContent(false);
  }

  // =========================================================================
  // ACCIDENTAL BUMP PROTECTION & RECALL (Undo Toast & Recent Bumps Drawer)
  // =========================================================================

  addRecentBump(ticket) {
    const bumpRecord = {
      ticketId: ticket.ticketId || ticket.id,
      orderNumber: ticket.orderNumber || ticket.orderId || ticket.id,
      tableNumber: ticket.tableNumber || 'Bar Counter',
      items: (ticket.items || []).map(i => ({ name: i.name || i.itemName, quantity: i.quantity || 1 })),
      servedAt: new Date().toISOString()
    };

    // Prepend and trim to last 10
    this.recentBumps = [bumpRecord, ...this.recentBumps.filter(b => b.ticketId !== bumpRecord.ticketId)].slice(0, 10);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('anchor_bds_recent_bumps', JSON.stringify(this.recentBumps));
    }
  }

  startUndoToast(ticket) {
    if (this.undoToastInterval) clearInterval(this.undoToastInterval);

    this.undoToast = {
      ticketId: ticket.ticketId || ticket.id,
      orderNumber: ticket.orderNumber || ticket.id,
      tableNumber: ticket.tableNumber || 'Bar Counter',
      remainingSec: 10,
      expiresAt: Date.now() + 10000
    };

    this.renderUndoToast();

    this.undoToastInterval = setInterval(() => {
      if (!this.undoToast) {
        clearInterval(this.undoToastInterval);
        return;
      }
      this.undoToast.remainingSec -= 1;
      if (this.undoToast.remainingSec <= 0) {
        this.clearUndoToast();
      } else {
        this.renderUndoToast();
      }
    }, 1000);
  }

  clearUndoToast() {
    if (this.undoToastInterval) {
      clearInterval(this.undoToastInterval);
      this.undoToastInterval = null;
    }
    this.undoToast = null;
    const existing = this.container ? this.container.querySelector('#bds-undo-toast') : null;
    if (existing) existing.remove();
  }

  renderUndoToast() {
    if (!this.container || !this.undoToast) return;

    let toastEl = this.container.querySelector('#bds-undo-toast');
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'bds-undo-toast';
      toastEl.style.cssText = 'position:fixed; bottom:28px; left:50%; transform:translateX(-50%); background:#1e293b; color:#fff; border:2px solid #3b82f6; box-shadow:0 12px 32px rgba(0,0,0,0.6); padding:14px 24px; border-radius:12px; display:flex; align-items:center; gap:16px; z-index:9999; font-size:0.95rem; font-weight:700;';
      this.container.appendChild(toastEl);
    }

    toastEl.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:1.2rem;">🍸</span>
        <span>BOT #${this.undoToast.ticketId} (${this.undoToast.tableNumber}) marked <strong>SERVED</strong></span>
      </div>
      <button id="btn-toast-undo" style="background:#3b82f6; color:#fff; border:none; padding:8px 16px; border-radius:8px; font-weight:900; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; gap:6px;">
        ↺ UNDO (${this.undoToast.remainingSec}s)
      </button>
      <button id="btn-toast-dismiss" style="background:transparent; color:#94a3b8; border:none; font-size:1rem; cursor:pointer; padding:4px;">✕</button>
    `;

    const btnUndo = toastEl.querySelector('#btn-toast-undo');
    if (btnUndo) {
      btnUndo.onclick = (e) => {
        e.stopPropagation();
        const tId = this.undoToast.ticketId;
        this.clearUndoToast();
        // Restore ticket back to READY via domain lifecycle
        this.handleTicketAction(tId, 'READY');
      };
    }

    const btnDismiss = toastEl.querySelector('#btn-toast-dismiss');
    if (btnDismiss) {
      btnDismiss.onclick = (e) => {
        e.stopPropagation();
        this.clearUndoToast();
      };
    }
  }

  // =========================================================================
  // VIEW RENDERING & COMPONENT TREE
  // =========================================================================

  updateContent(preserveScroll = true) {
    if (!this.container) return;

    const tickets = this.getBarTickets();
    const queued = tickets.filter(t => t.status === 'QUEUED');
    const preparing = tickets.filter(t => t.status === 'PREPARING' || t.status === 'PARTIALLY_READY');
    const ready = tickets.filter(t => t.status === 'READY');

    // Tab filter
    let visibleTickets = tickets;
    if (this.selectedStatusTab === 'ATTENTION') visibleTickets = queued;
    else if (this.selectedStatusTab === 'PREPARING') visibleTickets = preparing;
    else if (this.selectedStatusTab === 'READY') visibleTickets = ready;
    else if (this.selectedStatusTab === 'ALL') visibleTickets = tickets.filter(t => t.status !== 'CANCELLED');

    // Search query filter
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      visibleTickets = visibleTickets.filter(t => {
        const matchId = String(t.ticketId || t.id).toLowerCase().includes(q);
        const matchOrder = String(t.orderNumber || '').toLowerCase().includes(q);
        const matchTable = String(t.tableNumber || '').toLowerCase().includes(q);
        const matchItem = (t.items || []).some(i => String(i.name || i.itemName || '').toLowerCase().includes(q));
        return matchId || matchOrder || matchTable || matchItem;
      });
    }

    // Speed Rail aggregation (from active non-served tickets)
    const speedRailItems = this.getSpeedRailAggregation(tickets);

    // Open cancellation requests for the BAR station, keyed by affected BOT ticket.
    const tenantId = this._getTenantId();
    const pendingCxls = cancellationModel.getPendingRequests('BAR', tenantId);
    const requestsByTicket = new Map();
    const attachedTicketIds = new Set(tickets.map(t => t.ticketId || t.id));
    const orphanRequests = [];
    pendingCxls.forEach(r => {
      if (r.ticketId && attachedTicketIds.has(r.ticketId)) {
        if (!requestsByTicket.has(r.ticketId)) requestsByTicket.set(r.ticketId, []);
        requestsByTicket.get(r.ticketId).push(r);
      } else {
        orphanRequests.push(r);
      }
    });
    this._requestsByTicket = requestsByTicket;

    // Station holds (Phase B hold board + held-stock reuse hints).
    const stationHolds = preparedHoldModel.getHolds(tenantId, { station: 'BAR' });
    const liveHolds = stationHolds.filter(h => h.status === 'HELD');
    this._heldItemCodes = new Set(liveHolds.map(h => h.itemCode));

    this.container.innerHTML = `
      <!-- BDS FULLSCREEN HEADER BAR -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:#1e293b; padding:12px 20px; border-radius:12px; border:1px solid #334155; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="width:42px; height:42px; border-radius:10px; background:linear-gradient(135deg,#ec4899,#8b5cf6); display:flex; align-items:center; justify-content:center; font-size:1.4rem; font-weight:800; color:#fff; box-shadow:0 4px 12px rgba(236,72,153,0.4);">🍸</div>
          <div>
            <h1 style="margin:0; font-size:1.3rem; font-weight:800; color:#f8fafc; letter-spacing:-0.02em; display:flex; align-items:center; gap:10px;">
              BAR DISPLAY SYSTEM (BDS) <span style="font-size:0.75rem; background:#ec4899; color:#fff; padding:2px 8px; border-radius:4px; font-weight:800;">LIVE BAR STATION</span>
            </h1>
            <div style="font-size:0.8rem; color:#94a3b8; font-weight:600;">
              Realtime BOT Execution • 3-Tier SLA Timers • Speed Rail Batching
            </div>
          </div>
        </div>

        <!-- CONTROLS, AUDIO, RECENT BUMPS & FULLSCREEN SWITCHER -->
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          
          <!-- Audio Toggle & Volume -->
          <div style="display:flex; align-items:center; gap:6px; background:#0f172a; padding:6px 10px; border-radius:8px; border:1px solid #334155;">
            <button id="btn-toggle-bds-audio" style="background:transparent; border:none; font-size:0.85rem; font-weight:800; color:${this.audioEnabled ? '#10b981' : '#64748b'}; cursor:pointer; display:flex; align-items:center; gap:4px;">
              ${this.audioEnabled ? '🔊 Sound ON' : '🔇 Sound OFF'}
            </button>
            <input type="range" id="inp-bds-volume" min="0" max="1" step="0.05" value="${this.audioVolume}" style="width:60px; accent-color:#ec4899; cursor:pointer;" title="BDS Audio Volume" />
          </div>

          <!-- Recent Bumps Drawer Button -->
          <button id="btn-toggle-recent-bumps" class="btn-secondary" style="background:#1e293b; color:#f8fafc; border:1px solid #475569; padding:8px 12px; border-radius:8px; font-weight:700; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; gap:6px;">
            📋 Recent Bumps (${this.recentBumps.length})
          </button>

          <!-- Search Input -->
          <input type="text" id="inp-bds-search" placeholder="🔍 Search table / drink..." value="${this.searchQuery}" style="padding:8px 12px; border-radius:8px; border:1px solid #334155; background:#0f172a; color:#f8fafc; font-size:0.85rem; width:160px;" />

          <!-- Fullscreen Toggle -->
          <button id="btn-toggle-fullscreen" class="btn-secondary" style="background:#334155; color:#f8fafc; border:1px solid #475569; padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.85rem; cursor:pointer;">
            ⛶ Fullscreen
          </button>

          <!-- Exit BDS -->
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
        <button class="bds-tab ${this.selectedStatusTab === 'READY' ? 'active' : ''}" data-tab="READY" style="flex:1; padding:10px; font-size:0.9rem; font-weight:800; border:none; border-radius:8px; background:${this.selectedStatusTab === 'READY' ? '#10b981' : 'transparent'}; color:${this.selectedStatusTab === 'READY' ? '#000' : '#94a3b8'}; cursor:pointer;">
          🍸 Ready for Pickup (${ready.length})
        </button>
        <button class="bds-tab ${this.selectedStatusTab === 'ALL' ? 'active' : ''}" data-tab="ALL" style="flex:1; padding:10px; font-size:0.9rem; font-weight:800; border:none; border-radius:8px; background:${this.selectedStatusTab === 'ALL' ? '#3b82f6' : 'transparent'}; color:${this.selectedStatusTab === 'ALL' ? '#fff' : '#94a3b8'}; cursor:pointer;">
          📋 All Active BOTs (${queued.length + preparing.length + ready.length})
        </button>
        <button class="bds-tab ${this.selectedStatusTab === 'HELD' ? 'active' : ''}" data-tab="HELD" style="flex:1; padding:10px; font-size:0.9rem; font-weight:800; border:none; border-radius:8px; background:${this.selectedStatusTab === 'HELD' ? '#8b5cf6' : 'transparent'}; color:${this.selectedStatusTab === 'HELD' ? '#fff' : '#94a3b8'}; cursor:pointer;">
          🧊 Held Items (${liveHolds.length})
        </button>
      </div>

      <!-- SPEED RAIL (CONSOLIDATED DRINK PREP AGGREGATION) -->
      ${speedRailItems.length > 0 ? `
        <div style="background:#0f172a; border:1px solid #1e293b; border-radius:10px; padding:10px 14px; display:flex; align-items:center; gap:10px; overflow-x:auto;">
          <div style="display:flex; align-items:center; gap:6px; font-size:0.8rem; font-weight:800; color:#ec4899; text-transform:uppercase; white-space:nowrap;">
            <span>⚡ SPEED RAIL:</span>
          </div>
          <div style="display:flex; gap:8px; flex:1; overflow-x:auto;">
            ${speedRailItems.map(item => {
              const isSelected = this.selectedSpeedRailItem === item.name;
              return `
                <button class="btn-speed-rail-badge" data-drink-name="${item.name}" style="padding:6px 12px; border-radius:20px; font-size:0.82rem; font-weight:800; border:1px solid ${isSelected ? '#ec4899' : '#334155'}; background:${isSelected ? 'rgba(236,72,153,0.3)' : '#1e293b'}; color:${isSelected ? '#fff' : '#e2e8f0'}; cursor:pointer; display:flex; align-items:center; gap:6px; white-space:nowrap; transition:all 0.15s ease;">
                  <span>${item.name}</span>
                  <span style="background:${isSelected ? '#ec4899' : '#0f172a'}; color:#fff; padding:1px 6px; border-radius:10px; font-size:0.75rem; font-weight:900;">×${item.totalQty}</span>
                </button>
              `;
            }).join('')}
          </div>
          ${this.selectedSpeedRailItem ? `
            <button id="btn-clear-speed-rail" style="background:#334155; color:#cbd5e1; border:none; padding:4px 8px; border-radius:6px; font-size:0.75rem; font-weight:700; cursor:pointer; white-space:nowrap;">
              ✕ Clear Filter
            </button>
          ` : ''}
        </div>
      ` : ''}

      <!-- ORPHANED CANCELLATION REQUESTS (BOT ticket not in current filtered view) -->
      ${orphanRequests.map(r => this.renderCancellationRequestCard(r)).join('')}

      <!-- HELD ITEMS BOARD (Phase B): reuse / discard prepared cancellations -->
      ${this.selectedStatusTab === 'HELD' ? this.renderHoldBoard(stationHolds) : ''}

      <!-- BOT TICKET CARDS CONTAINER -->
      ${this.selectedStatusTab === 'HELD' ? '' : `
      <div style="flex:1; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:16px; align-content:start;">
        ${visibleTickets.length > 0 ? visibleTickets.map(t => this.renderBDSTicketCard(t)).join('') : `
          <div style="grid-column:1/-1; text-align:center; padding:60px 20px; background:#1e293b; border-radius:12px; border:1px dashed #334155; color:#94a3b8;">
            <div style="font-size:3rem; margin-bottom:8px;">🍸</div>
            <h3 style="margin:0; font-size:1.2rem; color:#f8fafc;">No Active Bar Tickets in this Queue</h3>
            <p style="margin:4px 0 0; font-size:0.85rem;">Incoming drink orders from Waiters &amp; POS will appear here instantly with realtime sync.</p>
          </div>
        `}
      </div>`}

      <!-- RECENT BUMPS RECALL DRAWER (SLIDE-OVER) -->
      ${this.showRecentBumpsDrawer ? this.renderRecentBumpsModal() : ''}

      <!-- DRINK SPEC MODAL -->
      ${this.selectedSpecItem ? this.renderDrinkSpecModal(this.selectedSpecItem) : ''}
    `;

    // Re-render undo toast if active
    if (this.undoToast) {
      this.renderUndoToast();
    }

    this.bindEvents();
  }

  // =========================================================================
  // TICKET CARD RENDERING (LINE-ITEM CONTROLS & BUMP BUTTONS)
  // =========================================================================

  renderBDSTicketCard(t) {
    const isReady = t.status === 'READY';
    const isPreparing = t.status === 'PREPARING' || t.status === 'PARTIALLY_READY';
    const agingColors = this.getAgingColors(t.agingTier);

    // Card border priority: READY (green) -> PREPARING (pink) -> Aging Tier (slate/amber/red)
    const cardBorderColor = isReady ? '#10b981' : (isPreparing ? '#ec4899' : agingColors.border);
    const cardBoxShadow = isReady ? '0 8px 24px rgba(16,185,129,0.2)' : (isPreparing ? '0 8px 24px rgba(236,72,153,0.2)' : agingColors.glow);

    // Speed rail highlight matching
    let isSpeedRailMatch = false;
    let isSpeedRailDimmed = false;
    if (this.selectedSpeedRailItem) {
      isSpeedRailMatch = (t.items || []).some(i => (i.name || i.itemName) === this.selectedSpeedRailItem);
      isSpeedRailDimmed = !isSpeedRailMatch;
    }

    const items = Array.isArray(t.items) ? t.items : [];
    const activeItems = items.filter(i => {
      const s = i.itemStatus || i.status || t.status || 'QUEUED';
      return s !== 'CANCELLED' && s !== 'VOIDED';
    });
    const allItemsReady = activeItems.length > 0 && activeItems.every(i => (i.itemStatus || t.status) === 'READY' || (i.itemStatus || t.status) === 'SERVED');
    const allItemsQueued = activeItems.length > 0 && activeItems.every(i => (i.itemStatus || t.status) === 'QUEUED');
    const ticketRequests = (this._requestsByTicket && this._requestsByTicket.get(t.ticketId || t.id)) || [];

    return `
      <div class="bds-card" 
        data-ticket-id="${t.ticketId || t.id}" 
        data-created-at="${t.createdAt || ''}" 
        data-ticket-status="${t.status}"
        data-aging-tier="${t.agingTier}"
        style="background:#1e293b; border:2px solid ${isSpeedRailMatch ? '#ec4899' : cardBorderColor}; border-radius:12px; padding:16px; display:flex; flex-direction:column; justify-space-between; gap:12px; box-shadow:${cardBoxShadow}; position:relative; overflow:hidden; opacity:${isSpeedRailDimmed ? '0.35' : '1'}; transition:opacity 0.2s ease, border-color 0.2s ease;">
        
        <!-- CARD HEADER -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid #334155; padding-bottom:10px;">
          <div>
            <div style="font-size:1.3rem; font-weight:900; color:#f8fafc; letter-spacing:-0.02em;">
              🍽️ ${t.tableNumber}
            </div>
            <div style="font-size:0.75rem; color:#94a3b8; font-weight:700; font-family:monospace; margin-top:2px;">
              BOT #${t.ticketId || t.id} • Order #${t.orderNumber || t.orderId}
            </div>
          </div>

          <div style="text-align:right;">
            <span class="bds-timer-badge" style="font-size:0.8rem; font-weight:800; padding:3px 8px; border-radius:6px; background:${agingColors.badgeBg}; color:${agingColors.badgeText}; border:1px solid ${agingColors.border}; display:inline-block; margin-bottom:4px;">
              ${t.timeElapsedMin < 1 ? '⏱️ Just now' : `⏱️ ${t.timeElapsedMin}m ago`}
            </span>
            <div style="font-size:0.75rem; font-weight:900; color:${cardBorderColor}; text-transform:uppercase;">
              ${t.status}
            </div>
          </div>
        </div>

        <!-- CANCELLATION REQUEST CARDS (BAR station decision) -->
        ${ticketRequests.map(r => this.renderCancellationRequestCard(r)).join('')}

        <!-- DRINK ITEMS LIST (WITH DISCRETE LINE-ITEM BUMP CONTROLS) -->
        <div style="display:flex; flex-direction:column; gap:8px; flex:1; min-height:80px;">
          ${items.map((it, idx) => {
            const lineId = it.lineItemId || it.itemId || idx;
            const itemStatus = it.itemStatus || it.status || t.status || 'QUEUED';

            // Removed lines (cancelled/voided) render struck-through with no actions.
            if (itemStatus === 'CANCELLED' || itemStatus === 'VOIDED') {
              return `
                <div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; opacity:0.55; padding:8px 10px; border-radius:8px; border-left:3px solid #6b7280;">
                  <span style="font-size:0.9rem; font-weight:700; color:#94a3b8; text-decoration:line-through;">
                    <span style="font-weight:900; color:#94a3b8;">×${it.quantity || it.qty || 1}</span> ${it.name || it.itemName}
                  </span>
                  <span style="font-size:0.65rem; font-weight:800; padding:1px 5px; border-radius:3px; background:#6b728022; color:#9ca3af;">🚫 ${itemStatus}</span>
                </div>
              `;
            }

            const itemCode = String(it.itemCode || it.itemId || '').toUpperCase();
            const catUpper = String(it.category || '').toUpperCase();
            
            const isRecipeModeItem = BAR_COCKTAIL_CODES.has(itemCode) || 
              catUpper.includes('COCKTAIL') || 
              catUpper.includes('MOCKTAIL') ||
              String(it.name || it.itemName || '').toLowerCase().includes('cocktail') || 
              String(it.name || it.itemName || '').toLowerCase().includes('mocktail');
            const isMissingRecipe = isRecipeModeItem && !this._hasActiveRecipeForLine(it);

            const isLineReady = itemStatus === 'READY';
            const isLinePrep = itemStatus === 'PREPARING';
            const isLineQueued = itemStatus === 'QUEUED';
            const isLineServed = itemStatus === 'SERVED';

            const lineBorder = isLineReady ? '#10b981' : (isLinePrep ? '#ec4899' : (isLineServed ? '#64748b' : '#334155'));
            const lineBg = isLineReady ? 'rgba(16,185,129,0.1)' : (isLinePrep ? 'rgba(236,72,153,0.08)' : '#0f172a');

            return `
              <div style="display:flex; flex-direction:column; background:${lineBg}; padding:8px 10px; border-radius:8px; border-left:3px solid ${lineBorder}; border-top:1px solid #1e293b; border-right:1px solid #1e293b; border-bottom:1px solid #1e293b; gap:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  
                  <!-- Drink Title & Spec Inspection Trigger -->
                  <div style="display:flex; align-items:center; gap:6px; cursor:pointer;" class="btn-inspect-spec" data-item-name="${it.name || it.itemName}" data-item-code="${itemCode}" data-category="${it.category || ''}" title="Click to view recipe & glassware specs">
                    <span style="font-size:0.95rem; font-weight:800; color:#f8fafc;">
                      ${it.name || it.itemName}
                    </span>
                    <span style="font-size:0.7rem; color:#94a3b8; text-decoration:underline;">📖 spec</span>
                  </div>

                  <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:0.95rem; font-weight:900; color:#ec4899; background:rgba(236,72,153,0.15); padding:1px 6px; border-radius:4px;">
                      ×${it.quantity || it.qty || 1}
                    </span>
                    <span style="font-size:0.65rem; font-weight:800; padding:1px 5px; border-radius:3px; background:${isLineReady ? 'rgba(16,185,129,0.2)' : (isLinePrep ? 'rgba(236,72,153,0.2)' : '#334155')}; color:${isLineReady ? '#10b981' : (isLinePrep ? '#ec4899' : '#94a3b8')};">
                      ${itemStatus}
                    </span>
                  </div>
                </div>

                ${isMissingRecipe ? `
                  <div style="font-size:0.7rem; color:#f59e0b; font-weight:700; display:flex; align-items:center; gap:4px; margin-top:2px;">
                    ⚠️ Recipe Missing — Inventory Auto-Deduction Disabled
                  </div>
                ` : ''}

                ${(isLineQueued || isLinePrep) && this._heldItemCodes && this._heldItemCodes.has(String(it.itemCode || it.itemId || '')) ? `
                  <div style="font-size:0.7rem; color:#8b5cf6; background:rgba(139,92,246,0.12); padding:3px 6px; border-radius:4px; font-weight:700; margin-top:2px;">
                    🧊 Held stock available — a matching prepared item can be reused (see Held Items tab).
                  </div>
                ` : ''}

                <!-- LINE-ITEM ACTION CONTROLS -->
                <div style="display:flex; justify-content:flex-end; gap:6px; align-items:center; margin-top:4px;">
                  ${isLineQueued ? `
                    <button class="btn-bds-item-action" data-ticket-id="${t.ticketId || t.id}" data-item-id="${lineId}" data-target="PREPARING" style="padding:3px 8px; font-size:0.72rem; font-weight:800; background:rgba(236,72,153,0.2); color:#ec4899; border:1px solid #ec4899; border-radius:4px; cursor:pointer;">
                      🔥 Start
                    </button>
                    <button class="btn-bds-item-action" data-ticket-id="${t.ticketId || t.id}" data-item-id="${lineId}" data-target="READY" style="padding:3px 8px; font-size:0.72rem; font-weight:800; background:rgba(16,185,129,0.2); color:#10b981; border:1px solid #10b981; border-radius:4px; cursor:pointer;">
                      ✅ Ready
                    </button>
                  ` : ''}

                  ${isLinePrep ? `
                    <button class="btn-bds-item-action" data-ticket-id="${t.ticketId || t.id}" data-item-id="${lineId}" data-target="READY" style="padding:3px 10px; font-size:0.75rem; font-weight:900; background:#10b981; color:#000; border:none; border-radius:4px; cursor:pointer;">
                      ✅ Mark Ready
                    </button>
                  ` : ''}

                  ${isLineReady ? `
                    <span style="font-size:0.72rem; color:#10b981; font-weight:800;">✓ Ready</span>
                    <button class="btn-bds-item-action" data-ticket-id="${t.ticketId || t.id}" data-item-id="${lineId}" data-target="PREPARING" style="padding:2px 6px; font-size:0.68rem; color:#94a3b8; background:transparent; border:none; cursor:pointer; text-decoration:underline;">
                      ↩ Undo
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- TICKET FOOTER LIFECYCLE ACTION (WHOLE TICKET BUMP) -->
        <div style="border-top:1px solid #334155; padding-top:12px; display:flex; gap:8px;">
          ${allItemsReady ? `
            <button class="btn-bds-action" data-ticket-id="${t.ticketId || t.id}" data-status="SERVED" style="flex:2; padding:12px; font-size:0.95rem; font-weight:900; background:#3b82f6; color:#fff; border:none; border-radius:8px; cursor:pointer; box-shadow:0 4px 14px rgba(59,130,246,0.4);">
              🍸 BUMP (SERVED)
            </button>
            <button class="btn-bds-action" data-ticket-id="${t.ticketId || t.id}" data-status="PREPARING" style="flex:1; padding:12px; font-size:0.82rem; font-weight:700; background:#475569; color:#f1f5f9; border:none; border-radius:8px; cursor:pointer;">
              ↩️ UNDO
            </button>
          ` : (allItemsQueued ? `
            <button class="btn-bds-action" data-ticket-id="${t.ticketId || t.id}" data-status="PREPARING" style="width:100%; padding:12px; font-size:0.95rem; font-weight:900; background:#ec4899; color:#fff; border:none; border-radius:8px; cursor:pointer; box-shadow:0 4px 14px rgba(236,72,153,0.4);">
              ▶️ START PREPARING
            </button>
          ` : `
            <button class="btn-bds-action" data-ticket-id="${t.ticketId || t.id}" data-status="READY" style="flex:2; padding:12px; font-size:0.95rem; font-weight:900; background:#10b981; color:#000; border:none; border-radius:8px; cursor:pointer; box-shadow:0 4px 14px rgba(16,185,129,0.4);">
              ✅ MARK ALL READY
            </button>
            <button class="btn-bds-action" data-ticket-id="${t.ticketId || t.id}" data-status="PREPARING" style="flex:1; padding:12px; font-size:0.82rem; font-weight:700; background:#475569; color:#f1f5f9; border:none; border-radius:8px; cursor:pointer;">
              ↩️ PREP
            </button>
          `)}
        </div>

      </div>
    `;
  }

  // =========================================================================
  // CANCELLATION REQUEST CARD (BAR station decision + policy gate)
  // =========================================================================

  /**
   * Red cancellation-request card. READY-stage requests render the MANDATORY
   * disposition-policy outcome: HOLD offer (two buttons), DISCARD-only note, or
   * disabled "awaiting manager" state. PREPARING requests get plain approve/reject.
   */
  renderCancellationRequestCard(r) {
    const tenantId = this._getTenantId();
    const policy = r.stageAtRequest === 'READY'
      ? dispositionPolicyModel.resolvePolicy(r.station, r.itemCode, r.categoryCode, tenantId)
      : null;

    let actionBtns = `
      <button class="btn-bds-cxl-action" data-request-id="${r.id}" data-action="APPROVE" style="padding:8px 14px; font-size:0.8rem; font-weight:800; background:#10b981; color:#000; border:none; border-radius:6px; cursor:pointer;">
        ✅ Approve Cancel
      </button>
    `;
    if (policy && policy.outcome === 'DISCARD_ONLY') {
      actionBtns = `
        <button class="btn-bds-cxl-action" data-request-id="${r.id}" data-action="APPROVE" title="Discard-only policy: prepared item is recognized as waste" style="padding:8px 14px; font-size:0.8rem; font-weight:800; background:#f97316; color:#fff; border:none; border-radius:6px; cursor:pointer;">
          ✅ Approve → Discard (per policy)
        </button>
      `;
    } else if (policy && policy.decideBy === 'MANAGER') {
      // MANAGER_DECISION policy: only a manager/admin may pick HOLD vs DISCARD at the board.
      const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
      const isManager = /manager|admin|owner/.test(String(session.role || session.userRole || session.employeeRole || session.roleId || session.roleName || session.workspace || '').toLowerCase());
      actionBtns = isManager
        ? `
        <button class="btn-bds-cxl-action" data-request-id="${r.id}" data-action="APPROVE" data-disposition="HOLD" style="padding:8px 14px; font-size:0.8rem; font-weight:800; background:#3b82f6; color:#fff; border:none; border-radius:6px; cursor:pointer;">
          ✅ Hold For Reuse
        </button>
        <button class="btn-bds-cxl-action" data-request-id="${r.id}" data-action="APPROVE" data-disposition="DISCARD" style="padding:8px 14px; font-size:0.8rem; font-weight:800; background:#f97316; color:#fff; border:none; border-radius:6px; cursor:pointer;">
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
        <button class="btn-bds-cxl-action" data-request-id="${r.id}" data-action="APPROVE" data-disposition="HOLD" style="padding:8px 14px; font-size:0.8rem; font-weight:800; background:#3b82f6; color:#fff; border:none; border-radius:6px; cursor:pointer;">
          ✅ Hold For Reuse
        </button>
        <button class="btn-bds-cxl-action" data-request-id="${r.id}" data-action="APPROVE" data-disposition="DISCARD" style="padding:8px 14px; font-size:0.8rem; font-weight:800; background:#f97316; color:#fff; border:none; border-radius:6px; cursor:pointer;">
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
          Reason: <strong style="color:#e2e8f0;">${String(r.reasonCode || 'OTHER').replace(/_/g, ' ')}</strong>${r.reasonText ? ` — ${r.reasonText}` : ''} • by ${r.requestedByName || 'Waiter'} • <span data-created-at="${r.requestedAt || ''}">${this.getElapsedMinutes(r.requestedAt)}m ago</span>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          ${actionBtns}
          <button class="btn-bds-cxl-action" data-request-id="${r.id}" data-action="REJECT" style="padding:8px 14px; font-size:0.8rem; font-weight:800; background:transparent; color:#ef4444; border:1px solid #ef4444; border-radius:6px; cursor:pointer;">
            ❌ Reject
          </button>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // HELD ITEMS BOARD (Phase B: reuse / discard prepared cancellations)
  // =========================================================================

  /** Held Items board: reuse a HELD prepared item onto a matching active line, or discard it. */
  renderHoldBoard(holds) {
    const list = holds || [];
    const hel = list.filter(h => h.status === 'HELD');
    const others = list.filter(h => h.status !== 'HELD');

    if (hel.length === 0 && others.length === 0) {
      return `
        <div style="text-align:center; padding:60px 20px; background:#1e293b; border-radius:12px; border:1px dashed #334155; color:#94a3b8;">
          <div style="font-size:3rem; margin-bottom:8px;">🧊</div>
          <h3 style="margin:0; font-size:1.2rem; color:#f8fafc;">No Held Items</h3>
          <p style="margin:4px 0 0; font-size:0.85rem;">Prepared (READY-stage) drinks cancelled at this station appear here for reuse or discard.</p>
        </div>`;
    }

    return `
      <div style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:12px;">
        ${hel.length ? `
          <div style="font-size:0.8rem; font-weight:800; color:#8b5cf6; text-transform:uppercase; letter-spacing:0.5px;">🧊 Available To Reuse (${hel.length})</div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:16px;">${hel.map(h => this._renderHoldCard(h)).join('')}</div>
        ` : `<div style="font-size:0.9rem; color:#94a3b8;">No currently-HELD items to reuse.</div>`}
        ${others.length ? `
          <div style="font-size:0.8rem; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-top:8px;">Recently Closed Out</div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:16px;">${others.slice(0, 8).map(h => this._renderHoldCard(h)).join('')}</div>
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
      ? `<button class="btn-bds-hold-action" data-hold-id="${h.id}" data-hold-action="USE" style="flex:2; padding:8px; font-size:0.8rem; font-weight:800; background:#8b5cf6; color:#fff; border:none; border-radius:6px; cursor:pointer;">🔁 Use For New Order</button>`
      : '';
    const discardBtn = isHeld
      ? `<button class="btn-bds-hold-action" data-hold-id="${h.id}" data-hold-action="DISCARD" style="flex:1; padding:8px; font-size:0.8rem; font-weight:800; background:#f97316; color:#fff; border:none; border-radius:6px; cursor:pointer;">🗑 Discard</button>`
      : '';

    return `
      <div style="background:#1e293b; border-left:4px solid ${border}; border-radius:10px; border-top:1px solid #334155; border-right:1px solid #334155; border-bottom:1px solid #334155; padding:12px; display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:1rem; font-weight:800; color:#f8fafc;">${h.quantity}x ${h.itemName}</div>
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

  /** Find the oldest active QUEUED/PREPARING BAR line with the same item and stamp the hold on it. */
  _reuseHoldOntoMatchingLine(hold, tenantId) {
    const tickets = offlineStore.getCollection('tickets') || [];
    let target = null;
    for (const t of tickets) {
      const isBarTicket = t.ticketType === 'BOT' || t.destination === 'BAR';
      if (!isBarTicket || t.status === 'SERVED' || t.status === 'CANCELLED') continue;
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

  // =========================================================================
  // RECENT BUMPS RECALL DRAWER & DRINK SPEC POPOVER
  // =========================================================================

  renderRecentBumpsModal() {
    return `
      <div class="bds-modal-overlay animate-fade-in" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); display:flex; justify-content:flex-end; z-index:9998;">
        <div style="width:400px; max-width:90vw; height:100%; background:#1e293b; border-left:2px solid #334155; padding:24px; box-sizing:border-box; display:flex; flex-direction:column; gap:16px;">
          
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334155; padding-bottom:12px;">
            <div>
              <h2 style="margin:0; font-size:1.2rem; font-weight:900; color:#f8fafc;">📋 Recent Bumps (Recall)</h2>
              <div style="font-size:0.78rem; color:#94a3b8;">Last 10 served tickets • 1-tap restore to Ready</div>
            </div>
            <button id="btn-close-recent-bumps" style="background:transparent; border:none; font-size:1.4rem; color:#94a3b8; cursor:pointer;">✕</button>
          </div>

          <div style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:10px;">
            ${this.recentBumps.length === 0 ? `
              <div style="text-align:center; padding:40px 20px; color:#94a3b8;">
                <div style="font-size:2rem; margin-bottom:8px;">🍸</div>
                <div>No recent served tickets in this session</div>
              </div>
            ` : this.recentBumps.map(b => `
              <div style="background:#0f172a; padding:12px; border-radius:8px; border:1px solid #334155; display:flex; flex-direction:column; gap:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-weight:900; font-size:1rem; color:#f8fafc;">${b.tableNumber}</span>
                  <span style="font-size:0.75rem; color:#94a3b8; font-family:monospace;">BOT #${b.ticketId}</span>
                </div>
                <div style="font-size:0.8rem; color:#cbd5e1;">
                  ${b.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                  <span style="font-size:0.7rem; color:#64748b;">
                    ${new Date(b.servedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button class="btn-restore-ticket" data-ticket-id="${b.ticketId}" style="background:#3b82f6; color:#fff; border:none; padding:4px 10px; border-radius:6px; font-weight:800; font-size:0.75rem; cursor:pointer;">
                    ↺ Restore to Ready
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // Accurate deduction-gate badge support: mirrors the approved/published recipe check in
  // inventoryConsumptionService.consumeForOrderLine so cocktails WITH a recipe are never
  // falsely flagged as "Recipe Missing" (previously every BAR_COCKTAIL_CODES line showed the warning).
  _hasActiveRecipeForLine(orderLine) {
    const recipes = recipeModel.getAllRecipes(this._getTenantId ? this._getTenantId() : null) || [];
    const itemId = orderLine.itemId || orderLine.itemCode || orderLine.id;
    const targetRecipeId = orderLine.recipeId || null;
    return recipes.some(r => (r.status === 'APPROVED' || r.status === 'PUBLISHED') && (
      (targetRecipeId && (r.id === targetRecipeId || r.recipeId === targetRecipeId || r.recipeCode === targetRecipeId)) ||
      r.menuItemId === itemId || r.menu_item_id === itemId
    ));
  }

  renderDrinkSpecModal(item) {
    const itemCode = String(item.itemCode || '').toUpperCase();
    const isMissing = BAR_COCKTAIL_CODES.has(itemCode) || 
      String(item.category || '').toUpperCase().includes('COCKTAIL') ||
      String(item.name || '').toLowerCase().includes('cocktail');

    // Query active approved recipe from recipeModel
    const recipe = recipeModel.getActiveRecipeForMenuItem(item.itemId || item.itemCode);

    return `
      <div class="bds-modal-overlay animate-fade-in" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999; padding:20px;">
        <div style="width:480px; max-width:95vw; background:#1e293b; border:2px solid #ec4899; border-radius:12px; padding:24px; box-sizing:border-box; display:flex; flex-direction:column; gap:14px; box-shadow:0 16px 36px rgba(0,0,0,0.6);">
          
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334155; padding-bottom:10px;">
            <div>
              <h2 style="margin:0; font-size:1.2rem; font-weight:900; color:#f8fafc; display:flex; align-items:center; gap:8px;">
                🍹 ${item.name}
              </h2>
              <div style="font-size:0.78rem; color:#94a3b8; font-family:monospace;">${itemCode}</div>
            </div>
            <button id="btn-close-drink-spec" style="background:transparent; border:none; font-size:1.4rem; color:#94a3b8; cursor:pointer;">✕</button>
          </div>

          ${isMissing && !recipe ? `
            <div style="background:rgba(245,158,11,0.15); border:1px solid #f59e0b; border-radius:8px; padding:14px; color:#f59e0b; font-size:0.85rem; line-height:1.4;">
              <div style="font-weight:900; margin-bottom:4px; font-size:0.95rem;">⚠️ Recipe Missing — Inventory Auto-Deduction Disabled</div>
              <div>This beverage has no approved recipe in Recipe Studio. Inventory deduction is disabled at LOC-314 until an approved recipe is created.</div>
            </div>
          ` : (recipe ? `
            <div style="display:flex; flex-direction:column; gap:12px; font-size:0.85rem;">
              <div>
                <span style="font-weight:800; color:#94a3b8;">Glassware:</span>
                <span style="color:#f8fafc; font-weight:700; margin-left:6px;">${recipe.glassware || 'Standard Bar Glass'}</span>
              </div>
              
              <div>
                <span style="font-weight:800; color:#94a3b8;">Ingredients &amp; Proportions:</span>
                <div style="background:#0f172a; padding:8px 12px; border-radius:6px; margin-top:6px; border:1px solid #334155;">
                  ${(recipe.ingredients || []).map(ing => `
                    <div style="display:flex; justify-content:space-between; padding:3px 0;">
                      <span style="color:#f8fafc;">${ing.inventoryItemName || ing.inventoryItemCode}</span>
                      <span style="color:#ec4899; font-weight:800;">${ing.quantity} ${ing.uom || 'ML'}</span>
                    </div>
                  `).join('')}
                </div>
              </div>

              ${recipe.instructions ? `
                <div>
                  <span style="font-weight:800; color:#94a3b8;">Preparation Method:</span>
                  <p style="margin:4px 0 0; color:#cbd5e1; line-height:1.4;">${recipe.instructions}</p>
                </div>
              ` : ''}
            </div>
          ` : `
            <div style="color:#94a3b8; font-size:0.85rem;">
              Standard commercial beverage item. Direct single-pour or unit fulfillment.
            </div>
          `)}

          <div style="border-top:1px solid #334155; padding-top:10px; display:flex; justify-content:flex-end;">
            <button id="btn-modal-close" style="background:#334155; color:#fff; border:none; padding:8px 16px; border-radius:6px; font-weight:800; cursor:pointer;">
              Close Spec
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // DOM EVENT BINDINGS
  // =========================================================================

  bindEvents() {
    if (!this.container) return;

    // Workflow Tab switching
    this.container.querySelectorAll('.bds-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.selectedStatusTab = tab.dataset.tab;
        this.updateContent(false);
      });
    });

    // Speed Rail pill clicks (filter / highlight)
    this.container.querySelectorAll('.btn-speed-rail-badge').forEach(badge => {
      badge.addEventListener('click', () => {
        const drinkName = badge.dataset.drinkName;
        if (this.selectedSpeedRailItem === drinkName) {
          this.selectedSpeedRailItem = null; // Toggle off
        } else {
          this.selectedSpeedRailItem = drinkName; // Select
        }
        this.updateContent(false);
      });
    });

    const btnClearSpeedRail = this.container.querySelector('#btn-clear-speed-rail');
    if (btnClearSpeedRail) {
      btnClearSpeedRail.addEventListener('click', () => {
        this.selectedSpeedRailItem = null;
        this.updateContent(false);
      });
    }

    // Discrete Line-Item Action Buttons (Start, Ready, Undo)
    this.container.querySelectorAll('.btn-bds-item-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ticketId = btn.dataset.ticketId;
        const itemId = btn.dataset.itemId;
        const targetStatus = btn.dataset.target;
        this.handleItemAction(ticketId, itemId, targetStatus);
      });
    });

    // Macro Ticket-Level Action Buttons (Start All, Mark All Ready, Bump Served, Undo)
    this.container.querySelectorAll('.btn-bds-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ticketId = btn.dataset.ticketId;
        const newStatus = btn.dataset.status;
        this.handleTicketAction(ticketId, newStatus);
      });
    });

    // Cancellation request decision buttons (BAR station authority enforced in cancellationModel)
    this.container.querySelectorAll('.btn-bds-cxl-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tenantId = this._getTenantId();
        const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};

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
        this.updateContent(false);
      });
    });

    // Held-item actions (Phase B): reuse onto a matching active line, or discard as waste.
    this.container.querySelectorAll('.btn-bds-hold-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
        const tenantId = this._getTenantId();
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
        this.updateContent(false);
      });
    });

    // Drink Spec inspection popover
    this.container.querySelectorAll('.btn-inspect-spec').forEach(trigger => {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedSpecItem = {
          name: trigger.dataset.itemName,
          itemCode: trigger.dataset.itemCode,
          category: trigger.dataset.category
        };
        this.updateContent(false);
      });
    });

    const btnCloseSpec = this.container.querySelector('#btn-close-drink-spec') || this.container.querySelector('#btn-modal-close');
    if (btnCloseSpec) {
      btnCloseSpec.addEventListener('click', () => {
        this.selectedSpecItem = null;
        this.updateContent(false);
      });
    }

    // Audio Toggle & Volume
    const btnToggleAudio = this.container.querySelector('#btn-toggle-bds-audio');
    if (btnToggleAudio) {
      btnToggleAudio.addEventListener('click', () => {
        this.toggleAudio();
      });
    }

    const inpVolume = this.container.querySelector('#inp-bds-volume');
    if (inpVolume) {
      inpVolume.addEventListener('input', (e) => {
        this.setVolume(e.target.value);
      });
    }

    // Search query input
    const inpSearch = this.container.querySelector('#inp-bds-search');
    if (inpSearch) {
      inpSearch.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.updateContent(false);
      });
    }

    // Recent Bumps modal toggle
    const btnToggleRecent = this.container.querySelector('#btn-toggle-recent-bumps');
    if (btnToggleRecent) {
      btnToggleRecent.addEventListener('click', () => {
        this.showRecentBumpsDrawer = !this.showRecentBumpsDrawer;
        this.updateContent(false);
      });
    }

    const btnCloseRecent = this.container.querySelector('#btn-close-recent-bumps');
    if (btnCloseRecent) {
      btnCloseRecent.addEventListener('click', () => {
        this.showRecentBumpsDrawer = false;
        this.updateContent(false);
      });
    }

    // Restore ticket from Recent Bumps
    this.container.querySelectorAll('.btn-restore-ticket').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ticketId = btn.dataset.ticketId;
        this.showRecentBumpsDrawer = false;
        this.handleTicketAction(ticketId, 'READY');
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
        this.destroy();
        if (typeof this.onExit === 'function') {
          this.onExit();
        }
      });
    }
  }
}
