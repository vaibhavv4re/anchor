/**
 * Universal Toast Notification System for RestaurantOS / Waiter POS.
 *
 * Provides real-time audio-visual notifications across all tabs and screens for:
 * - KOT item status changes (e.g., "🔔 Table 04: Green Chicken Soup is READY for pickup!")
 * - Whole ticket readiness (e.g., "✅ Table 02: All items in KOT are READY!")
 * - New order dispatches (e.g., "🍳 Table 03: New KOT dispatched to kitchen")
 */

import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';
import { productionRoutingEngine } from '../../../../../businessos/platform/ordering/productionRoutingEngine.js';

export class ToastNotificationManager {
  constructor() {
    this.container = null;
    this.audioCtx = null;
    this.isSubscribed = false;
    this.initContainer();
    this.initPlatformSubscriptions();
  }

  initContainer() {
    if (typeof document === 'undefined') return;

    let existing = document.getElementById('universal-toast-container');
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'universal-toast-container';
      existing.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 380px;
        width: calc(100vw - 40px);
        pointer-events: none;
      `;
      document.body.appendChild(existing);
    }
    this.container = existing;
  }

  /**
   * Synthesize a pleasing modern notification chime using Web Audio API
   */
  playChime(type = 'ready') {
    if (typeof window === 'undefined') return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!this.audioCtx) this.audioCtx = new AudioContext();
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      if (type === 'ready') {
        // High pleasant double-tone
        osc.frequency.setValueAtTime(880, this.audioCtx.currentTime); // A5
        osc.frequency.exponentialRampToValueAtTime(1320, this.audioCtx.currentTime + 0.15); // E6
      } else if (type === 'prep') {
        osc.frequency.setValueAtTime(587.33, this.audioCtx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, this.audioCtx.currentTime + 0.12);
      } else {
        osc.frequency.setValueAtTime(523.25, this.audioCtx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, this.audioCtx.currentTime + 0.1);
      }

      gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.5);
    } catch (_) {}
  }

  showToast({
    type = 'info', // 'ready' | 'prep' | 'order' | 'info'
    title = '',
    message = '',
    tableText = '',
    ticketId = null,
    itemId = null,
    duration = 6000
  }) {
    if (!this.container) this.initContainer();
    if (!this.container) return;

    this.playChime(type);

    const toast = document.createElement('div');
    toast.className = 'universal-toast-card animate-fade-in';
    toast.style.cssText = `
      pointer-events: auto;
      background: var(--bg-surface-1, #1e293b);
      border-radius: 8px;
      padding: 12px 16px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
      gap: 6px;
      border-left: 5px solid ${type === 'ready' ? '#10b981' : (type === 'prep' ? '#f59e0b' : '#3b82f6')};
      border-top: 1px solid rgba(255,255,255,0.1);
      border-right: 1px solid rgba(255,255,255,0.1);
      border-bottom: 1px solid rgba(255,255,255,0.1);
      color: var(--text-main, #f8fafc);
      transition: all 0.3s ease;
    `;

    const icon = type === 'ready' ? '🔔' : (type === 'prep' ? '🔥' : '🍳');
    const badgeBg = type === 'ready' ? 'rgba(16,185,129,0.2)' : (type === 'prep' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)');
    const badgeColor = type === 'ready' ? '#10b981' : (type === 'prep' ? '#f59e0b' : '#60a5fa');

    toast.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:1.2rem;">${icon}</span>
          <div>
            ${tableText ? `
              <span class="badge" style="background:${badgeBg}; color:${badgeColor}; font-weight:800; font-size:0.75rem; padding:2px 6px; border-radius:4px; margin-right:4px;">
                ${tableText}
              </span>
            ` : ''}
            <strong style="font-size:0.9rem; color:var(--text-main, #fff);">${title}</strong>
          </div>
        </div>
        <button class="btn-toast-close" style="background:transparent; border:none; color:var(--text-muted, #94a3b8); cursor:pointer; font-size:1rem; padding:0 4px; line-height:1;">✕</button>
      </div>

      <div style="font-size:0.85rem; color:var(--text-secondary, #cbd5e1); line-height:1.4; padding-left:28px;">
        ${message}
      </div>

      ${(type === 'ready' && ticketId && itemId !== null) ? `
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:4px; padding-left:28px;">
          <button class="btn-primary btn-toast-serve" style="padding:4px 12px; font-size:0.75rem; font-weight:800; background:#10b981; color:#fff; border:none; border-radius:4px; cursor:pointer;">
            🍽️ Mark Served
          </button>
        </div>
      ` : ''}
    `;

    const closeBtn = toast.querySelector('.btn-toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
      });
    }

    const serveBtn = toast.querySelector('.btn-toast-serve');
    if (serveBtn) {
      serveBtn.addEventListener('click', () => {
        serveBtn.disabled = true;
        serveBtn.innerHTML = '✓ Served';
        const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('ros_session') || '{}') : {};
        const tenantId = session.tenantId || 'tenant_h0qc7wf';
        productionRoutingEngine.updateTicketItemStatus(ticketId, itemId, 'SERVED', tenantId);
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transform = 'translateX(20px)';
          setTimeout(() => toast.remove(), 300);
        }, 600);
      });
    }

    this.container.appendChild(toast);

    // Auto-dismiss after duration
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }

  initPlatformSubscriptions() {
    if (this.isSubscribed) return;
    this.isSubscribed = true;

    // 1. Single Item Status Change Notification
    platformEventBus.subscribe('ticket:item_status_changed', (envelope) => {
      const payload = envelope.payload || envelope;
      const item = payload.item;
      const ticket = payload.ticket;
      const newStatus = payload.itemStatus || (item ? item.itemStatus : null);

      if (!item || !newStatus) return;

      const tableNumber = ticket?.tableNumber || (ticket?.tableCode ? ticket.tableCode.replace(/[^0-9]/g, '') : '');
      const tableText = ticket?.tableCode || (tableNumber ? `Table ${tableNumber}` : 'Floor Table');
      const itemName = `${item.quantity || 1}x ${item.name || item.itemName}`;

      if (newStatus === 'READY') {
        this.showToast({
          type: 'ready',
          tableText,
          title: 'Dish Ready for Service!',
          message: `<strong>${itemName}</strong> is hot and ready for table pickup.`,
          ticketId: ticket?.ticketId || ticket?.id,
          itemId: item.lineItemId || item.itemId
        });
      } else if (newStatus === 'PREPARING') {
        this.showToast({
          type: 'prep',
          tableText,
          title: 'Preparation Started',
          message: `Chef started cooking <strong>${itemName}</strong>.`
        });
      }
    });

    // 2. Whole Ticket Status Change Notification
    platformEventBus.subscribe('ticket:status_changed', (envelope) => {
      const payload = envelope.payload || envelope;
      const ticket = payload.ticket;
      const status = payload.status || ticket?.status;

      if (!ticket || !status) return;
      const tableNumber = ticket.tableNumber || (ticket.tableCode ? ticket.tableCode.replace(/[^0-9]/g, '') : '');
      const tableText = ticket.tableCode || (tableNumber ? `Table ${tableNumber}` : 'Floor Table');

      if (status === 'READY') {
        this.showToast({
          type: 'ready',
          tableText,
          title: 'Entire Ticket Ready!',
          message: `All dishes in <strong>${ticket.ticketId || ticket.id}</strong> are ready for service.`
        });
      }
    });

    // 3. New KOT / BOT Dispatched Notification
    platformEventBus.subscribe('kot:dispatched', (envelope) => {
      const payload = envelope.payload || envelope;
      const ticket = payload.ticket || payload;
      const tableNumber = ticket.tableNumber || (ticket.tableCode ? ticket.tableCode.replace(/[^0-9]/g, '') : '');
      const tableText = ticket.tableCode || (tableNumber ? `Table ${tableNumber}` : 'Floor Table');

      this.showToast({
        type: 'order',
        tableText,
        title: 'New KOT Dispatched',
        message: `Order sent to kitchen with ${(ticket.items || []).length} item(s).`
      });
    });
  }
}

export const toastNotificationManager = new ToastNotificationManager();
