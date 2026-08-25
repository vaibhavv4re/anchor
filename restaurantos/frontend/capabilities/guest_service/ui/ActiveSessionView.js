/**
 * Capability Group 3 & 4 Integrated Active Session Service View
 * Integrates Menu Browser, Order Builder Drawer, Order Review Modal, and Automatic KOT/BOT Routing.
 * Dynamic active session browser when no sessionId is specified. ZERO fake mock fallbacks.
 */

import { sessionModel } from '../../../../../businessos/platform/session/sessionModel.js';
import { sessionProjectionService } from '../../../../../businessos/platform/session/sessionProjectionService.js';
import { sessionStateMachine, SessionMilestones } from '../../../../../businessos/platform/session/sessionStateMachine.js';
import { tableStateMachine, PhysicalTableStates } from '../../../../../businessos/platform/table_state/tableStateMachine.js';
import { platformEventBus } from '../../../../../businessos/platform/events/platformEvents.js';

import { MenuBrowserView } from '../../order_management/ui/MenuBrowserView.js';
import { OrderBuilderDrawer } from '../../order_management/ui/OrderBuilderDrawer.js';
import { OrderReviewModal } from '../../order_management/ui/OrderReviewModal.js';
import { ActiveOrdersWidget } from '../../order_management/ui/ActiveOrdersWidget.js';
import { RunningBillModal } from './RunningBillModal.js';

export class ActiveSessionView {
  constructor({ sessionId = null, onClose = null } = {}) {
    this.sessionId = sessionId;
    this.onClose = onClose;
    this.container = null;
    this.draftItems = [];
    this.unsubscribeEvents = [];
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'card animate-fade-in';
    this.container.style.padding = 'var(--space-xl)';

    this.subscribeEvents();
    this.updateContent();

    return this.container;
  }

  subscribeEvents() {
    const refreshAlerts = () => {
      this.updateHeaderContent();
      this.updateKitchenAlertBanner();
    };

    const refreshFull = (envelope) => {
      const payload = envelope ? (envelope.payload || envelope) : null;
      if (!payload || !this.sessionId || payload.sessionId === this.sessionId || payload.tableNumber || payload.id === this.sessionId) {
        if (this.container && document.body.contains(this.container)) {
          this.updateContent();
        }
      }
    };

    const unsubProj = platformEventBus.subscribe('session:projection:updated', refreshAlerts);
    const unsubState = platformEventBus.subscribe('table:state:changed', refreshFull);
    const unsubMilestone = platformEventBus.subscribe('session:milestone:changed', refreshFull);
    const unsubFinalized = platformEventBus.subscribe('bill:finalized', refreshFull);
    const unsubReopened = platformEventBus.subscribe('bill:reopened', refreshFull);
    const unsubTicket = platformEventBus.subscribe('ticket:status_changed', refreshAlerts);
    const unsubItem = platformEventBus.subscribe('ticket:item_status_changed', refreshAlerts);

    this.unsubscribeEvents.push(unsubProj, unsubState, unsubMilestone, unsubFinalized, unsubReopened, unsubTicket, unsubItem);
  }

  updateKitchenAlertBanner() {
    if (!this.sessionId || !this.container) return;
    const alertMount = this.container.querySelector('#kitchen-alert-mount');
    if (!alertMount) return;

    const projection = sessionProjectionService.getSessionProjection(this.sessionId);
    if (!projection) return;

    if (projection.readyItems && projection.readyItems.length > 0) {
      alertMount.innerHTML = `
        <div class="card animate-fade-in" style="background:#10b98115; border:1px solid #10b981; padding:10px 16px; margin-bottom:var(--space-md); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="font-weight:700; color:#10b981; font-size:0.95rem; display:flex; align-items:center; gap:6px;">
            <span style="font-size:1.1rem; animation:pulse 1.5s infinite;">🔔</span> 
            <strong>Kitchen Alert: ${projection.readyItems.length} Item(s) READY for service!</strong>
          </div>
          <div style="font-size:0.85rem; color:var(--text-secondary);">
            ${projection.readyItems.map(i => `${i.quantity}x ${i.name}`).join(', ')}
          </div>
        </div>
      `;
    } else {
      alertMount.innerHTML = '';
    }
  }

  updateHeaderContent() {
    if (!this.sessionId) return;
    const projection = sessionProjectionService.getSessionProjection(this.sessionId);
    if (!projection) return;
    const headerTitle = this.container.querySelector('#session-header-title');
    if (headerTitle) headerTitle.textContent = `Table ${projection.tableNumber} Service`;
  }

  updateContent() {
    // If no sessionId is provided or session is missing, render active sessions picker
    if (!this.sessionId) {
      this.renderActiveSessionsPicker();
      return;
    }

    const projection = sessionProjectionService.getSessionProjection(this.sessionId);
    if (!projection) {
      this.renderActiveSessionsPicker('Selected session is closed or does not exist.');
      return;
    }

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:var(--space-md); border-bottom:1px solid var(--border-subtle); padding-bottom:var(--space-md); margin-bottom:var(--space-md);">
        <div>
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">ACTIVE SERVICE SESSION (${projection.sessionId})</div>
          <h2 id="session-header-title" style="font-size:1.75rem; margin:2px 0;">Table ${projection.tableNumber} Service (${projection.tableCode})</h2>
          <div style="font-size:0.875rem; color:var(--text-secondary); margin-top:4px;">
            Assigned Waiter: <strong>${projection.waiter.name}</strong> • ${projection.elapsedTime} elapsed • Status: <span class="badge badge-info">${projection.status}</span>
          </div>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <button class="btn-primary" id="btn-add-items-shortcut" style="padding:10px 16px; font-weight:700; font-size:0.85rem;">
            ➕ Add Items to Order
          </button>
          <button class="btn-secondary" id="btn-back-to-floor">← Back to Floor</button>
        </div>
      </div>

      <!-- Guest Operational Context & Live Financial Running Bill Strip -->
      <div class="grid grid-cols-4 gap-md" style="margin-bottom:var(--space-md);">
        <div class="card" style="background:var(--bg-surface-2); padding:var(--space-sm) var(--space-md);">
          <div style="font-size:0.75rem; color:var(--text-muted);">Guest Count</div>
          <div style="font-size:1.1rem; font-weight:700; margin-top:2px;">👥 ${projection.guestCount} Guests</div>
        </div>
        
        <div class="card" style="background:var(--bg-surface-2); padding:var(--space-sm) var(--space-md);">
          <div style="font-size:0.75rem; color:var(--text-muted);">Dietary & Notes</div>
          <div style="font-size:0.85rem; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${projection.celebrationFlag ? `<span class="badge badge-warning" style="margin-right:4px;">🎂 ${projection.celebrationFlag}</span>` : ''}
            <span style="font-style:italic;">"${projection.guestNotes || 'Standard'}"</span>
          </div>
        </div>

        <div class="card" style="background:var(--bg-surface-2); padding:var(--space-sm) var(--space-md);">
          <div style="font-size:0.75rem; color:var(--text-muted);">Confirmed Items</div>
          <div style="font-size:1.1rem; font-weight:700; margin-top:2px; color:var(--text-primary);">
            📦 ${projection.itemizedList ? projection.itemizedList.length : 0} Item(s)
          </div>
        </div>

        <!-- RUNNING TOTAL CARD WITH DIRECT OPEN BILL BUTTON -->
        <div class="card" id="btn-open-running-bill-card" style="background:var(--accent-primary)15; border:1px solid var(--accent-primary); padding:var(--space-sm) var(--space-md); cursor:pointer; transition:transform 0.15s ease;" title="Click to view detailed itemized bill breakdown">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:0.75rem; color:var(--accent-primary); font-weight:700; text-transform:uppercase;">🧾 Running Total</div>
            <span style="font-size:0.7rem; background:var(--accent-primary); color:#000; padding:1px 6px; border-radius:4px; font-weight:800;">INSPECT BILL →</span>
          </div>
          <div style="font-size:1.25rem; font-weight:800; color:var(--accent-primary); margin-top:2px;">
            ₹${(projection.grandTotal || projection.subtotal || 0).toFixed(2)}
            <span style="font-size:0.75rem; font-weight:400; color:var(--text-secondary);">(incl. GST)</span>
          </div>
        </div>
      </div>
      
      <!-- Stage Guidance Banner when Bill is Finalized -->
      ${(projection.status === SessionMilestones.BILL_GENERATED || projection.billStatus === 'GENERATED') ? `
        <div class="card animate-fade-in" style="background:#f59e0b15; border:2px solid #f59e0b; padding:14px 18px; margin-bottom:var(--space-md); border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div>
              <div style="font-weight:800; color:#f59e0b; font-size:1.05rem; display:flex; align-items:center; gap:6px;">
                <span>💳</span> <strong>BILL FINALISED & SENT TO CASHIER (PAYMENT PENDING)</strong>
              </div>
              <div style="font-size:0.85rem; color:var(--text-primary); margin-top:4px;">
                Table ${projection.tableNumber} is awaiting cashier payment of <strong>₹${(projection.grandTotal || 0).toFixed(2)}</strong>. Order menu is locked for waiters. Choose Next Logical Step:
              </div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn-primary" id="btn-settle-close-banner" style="background:#10b981; color:#000; font-weight:700; padding:8px 14px; font-size:0.85rem;">
                ✨ Settle Payment & Close Session
              </button>
              <button class="btn-secondary" id="btn-mark-clean-banner" style="padding:8px 14px; font-size:0.85rem; font-weight:700;">
                🧹 Mark Table Cleaning
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Live Order & Production Status Strip Mount -->
      <div id="kitchen-alert-mount">
        ${projection.readyItems.length > 0 ? `
          <div class="card animate-fade-in" style="background:#10b98115; border:1px solid #10b981; padding:10px 16px; margin-bottom:var(--space-md); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div style="font-weight:700; color:#10b981; font-size:0.95rem; display:flex; align-items:center; gap:6px;">
              <span style="font-size:1.1rem; animation:pulse 1.5s infinite;">🔔</span> 
              <strong>Kitchen Alert: ${projection.readyItems.length} Item(s) READY for service!</strong>
            </div>
            <div style="font-size:0.85rem; color:var(--text-secondary);">
              ${projection.readyItems.map(i => `${i.quantity}x ${i.name}`).join(', ')}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Capability Group 4: Menu Browser & Order Builder Layout -->
      <div class="session-order-workspace" style="display:grid; grid-template-columns:minmax(0, 1fr) 340px; gap:16px; align-items:start; margin-bottom:var(--space-md); width:100%;">
        <!-- Menu Browser Mount -->
        <div id="menu-browser-mount" style="min-width:0; width:100%;"></div>

        <!-- Order Builder Drawer Mount -->
        <div id="order-drawer-mount" style="min-width:0; width:100%; position:sticky; top:12px;"></div>
      </div>

      <style>
        @media (max-width: 1024px) {
          .session-order-workspace {
            grid-template-columns: 1fr !important;
          }
          #order-drawer-mount {
            position: static !important;
          }
        }
      </style>

      <!-- Bottom Session Control Toolbar -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:var(--space-md); border-top:1px solid var(--border-subtle); padding-top:var(--space-md); margin-top:var(--space-md);">
        <div style="display:flex; align-items:center; gap:12px;">
          <span class="badge badge-info">SESSION: ${projection.sessionId}</span>
          <button class="btn-secondary" id="btn-view-running-bill" style="padding:6px 12px; font-size:0.85rem; font-weight:700;">
            🧾 View Running Bill (${projection.itemizedList ? projection.itemizedList.length : 0} items)
          </button>
          <span style="font-weight:800; font-size:1.1rem; color:var(--accent-primary);">
            Running Total: ₹${(projection.grandTotal || 0).toFixed(2)}
          </span>
        </div>
        <div style="display:flex; gap:var(--space-md); flex-wrap:wrap;">
          ${(projection.status !== SessionMilestones.BILL_GENERATED && projection.status !== SessionMilestones.CLOSED) ? `
            <button class="btn-primary" id="btn-finalise-bill-cashier" style="padding:10px 18px; font-weight:800; background:var(--accent-primary);">
              🧾 Finalise Bill & Send to Cashier →
            </button>
          ` : ''}
          ${projection.status === SessionMilestones.BILL_GENERATED ? `
            <button class="btn-primary" id="btn-close-session" style="background-color:var(--status-success); color:#000; font-weight:700; padding:10px 18px;">
              ✨ Mark Payment Received & Close Session
            </button>
          ` : ''}
          <button class="btn-secondary" id="btn-close-session-direct" style="color:var(--status-danger);">
            Close Session
          </button>
        </div>
      </div>

      <div id="review-modal-mount"></div>
    `;

    this.mountOrderComponents(projection);
    this.bindEvents(projection);
  }

  bindEvents(projection) {
    const backBtn = this.container.querySelector('#btn-back-to-floor');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (this.onClose) this.onClose();
      });
    }

    const addShortcutBtn = this.container.querySelector('#btn-add-items-shortcut');
    if (addShortcutBtn) {
      addShortcutBtn.addEventListener('click', () => {
        const menuEl = this.container.querySelector('#menu-browser-mount');
        if (menuEl) menuEl.scrollIntoView({ behavior: 'smooth' });
      });
    }

    const openBillCardBtn = this.container.querySelector('#btn-open-running-bill-card');
    if (openBillCardBtn) {
      openBillCardBtn.addEventListener('click', () => {
        this.openRunningBillModal();
      });
    }

    const viewBillBtn = this.container.querySelector('#btn-view-running-bill');
    if (viewBillBtn) {
      viewBillBtn.addEventListener('click', () => {
        this.openRunningBillModal();
      });
    }

    const finaliseBillBtn = this.container.querySelector('#btn-finalise-bill-cashier');
    if (finaliseBillBtn) {
      finaliseBillBtn.addEventListener('click', () => {
        sessionStateMachine.transitionMilestone(this.sessionId, SessionMilestones.BILL_GENERATED);
        tableStateMachine.transitionTableState(projection.tableNumber, PhysicalTableStates.PAYMENT_PENDING);

        platformEventBus.publish('bill:finalized', {
          sessionId: this.sessionId,
          tableNumber: projection.tableNumber,
          tableCode: projection.tableCode,
          subtotal: projection.subtotal,
          cgstAmount: projection.cgstAmount,
          sgstAmount: projection.sgstAmount,
          grandTotal: projection.grandTotal,
          itemizedList: projection.itemizedList,
          waiterName: projection.waiter ? projection.waiter.name : 'Staff',
          timestamp: new Date().toISOString()
        });

        platformEventBus.publish('table:state:changed', {
          tableNumber: projection.tableNumber,
          newState: PhysicalTableStates.PAYMENT_PENDING,
          sessionId: this.sessionId
        });

        alert(`🧾 Bill for Table ${projection.tableNumber} (Total: ₹${(projection.grandTotal || 0).toFixed(2)}) finalised and sent to Cashier! Table status updated to PAYMENT PENDING.`);
        this.updateContent();
        this.openRunningBillModal();
      });
    }

    const settleBannerBtn = this.container.querySelector('#btn-settle-close-banner');
    if (settleBannerBtn) {
      settleBannerBtn.addEventListener('click', () => {
        sessionStateMachine.transitionMilestone(this.sessionId, SessionMilestones.CLOSED);
        tableStateMachine.transitionTableState(projection.tableNumber, PhysicalTableStates.CLEANING);
        platformEventBus.publish('table:state:changed', {
          tableNumber: projection.tableNumber,
          newState: PhysicalTableStates.CLEANING
        });
        alert(`✨ Payment marked received & Session closed for Table ${projection.tableNumber}! Table status set to CLEANING.`);
        if (this.onClose) {
          this.onClose();
        } else {
          this.sessionId = null;
          this.updateContent();
        }
      });
    }

    const markCleanBannerBtn = this.container.querySelector('#btn-mark-clean-banner');
    if (markCleanBannerBtn) {
      markCleanBannerBtn.addEventListener('click', () => {
        tableStateMachine.transitionTableState(projection.tableNumber, PhysicalTableStates.CLEANING);
        platformEventBus.publish('table:state:changed', {
          tableNumber: projection.tableNumber,
          newState: PhysicalTableStates.CLEANING
        });
        alert(`🧹 Table ${projection.tableNumber} marked as NEEDS CLEANING.`);
        if (this.onClose) {
          this.onClose();
        } else {
          this.sessionId = null;
          this.updateContent();
        }
      });
    }

    const closeBtn = this.container.querySelector('#btn-close-session');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        sessionStateMachine.transitionMilestone(this.sessionId, SessionMilestones.CLOSED);
        tableStateMachine.transitionTableState(projection.tableNumber, PhysicalTableStates.CLEANING);
        platformEventBus.publish('table:state:changed', {
          tableNumber: projection.tableNumber,
          newState: PhysicalTableStates.CLEANING
        });
        alert(`✨ Payment marked received & Session closed for Table ${projection.tableNumber}! Table moved to CLEANING.`);
        if (this.onClose) {
          this.onClose();
        } else {
          this.sessionId = null;
          this.updateContent();
        }
      });
    }

    const closeDirectBtn = this.container.querySelector('#btn-close-session-direct');
    if (closeDirectBtn) {
      closeDirectBtn.addEventListener('click', () => {
        sessionStateMachine.transitionMilestone(this.sessionId, SessionMilestones.CLOSED);
        tableStateMachine.transitionTableState(projection.tableNumber, PhysicalTableStates.AVAILABLE);
        platformEventBus.publish('table:state:changed', {
          tableNumber: projection.tableNumber,
          newState: PhysicalTableStates.AVAILABLE
        });
        alert(`🟢 Session closed for Table ${projection.tableNumber}! Table marked AVAILABLE & VACANT.`);
        if (this.onClose) {
          this.onClose();
        } else {
          this.sessionId = null;
          this.updateContent();
        }
      });
    }
  }

  renderActiveSessionsPicker(alertMessage = null) {
    const allSessions = sessionModel.getAllSessions();
    const activeSessions = allSessions.filter(s => s.status !== 'CLOSED');

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-lg);">
        <div>
          <h2 style="font-size:1.75rem; margin:0;">🛎️ Active Guest Service Sessions</h2>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-top:2px;">Select an active table session to take orders or manage service.</p>
        </div>
        <button class="btn-primary" id="btn-picker-go-floor">🗺️ Open Floor & Layout</button>
      </div>

      ${alertMessage ? `<div class="card" style="background:var(--bg-surface-2); border-left:4px solid var(--accent-primary); padding:12px; margin-bottom:var(--space-md);">${alertMessage}</div>` : ''}

      ${activeSessions.length > 0 ? `
        <div class="grid grid-cols-3 gap-md">
          ${activeSessions.map(s => {
            const proj = sessionProjectionService.getSessionProjection(s.id);
            return `
              <div class="card session-pick-card animate-fade-in" data-session-id="${s.id}" style="cursor:pointer; padding:var(--space-md); border-top:4px solid var(--accent-primary); transition:transform var(--transition-fast);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <div style="font-size:1.2rem; font-weight:700;">Table ${s.tableNumber}</div>
                  <span class="badge badge-info">${s.status}</span>
                </div>
                <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:4px;">
                  👥 ${s.guestCount} Guests • Waiter: <strong>${proj ? proj.waiter.name : (s.assignedWaiterId || 'Staff')}</strong>
                </div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px;">
                  ${s.guestNotes ? `"${s.guestNotes}"` : 'Standard service'}
                </div>
                <button class="btn-secondary w-full" style="padding:6px 0; font-size:0.8rem; font-weight:600;">
                  Open Table ${s.tableNumber} Service →
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div style="text-align:center; padding:var(--space-xl); background:var(--bg-surface-2); border-radius:8px; color:var(--text-muted);">
          <div style="font-size:2.5rem; margin-bottom:8px;">🍽️</div>
          <div style="font-size:1.1rem; font-weight:700; color:var(--text-primary);">No Active Table Sessions</div>
          <p style="font-size:0.875rem; margin-top:4px;">All tables are currently free. Go to the Floor View to seat guests and open a new session.</p>
          <button class="btn-primary" id="btn-empty-go-floor" style="margin-top:12px;">🗺️ Go to Floor & Seat Guests</button>
        </div>
      `}
    `;

    const btnGoFloor = this.container.querySelector('#btn-picker-go-floor');
    if (btnGoFloor) btnGoFloor.addEventListener('click', () => { if (this.onClose) this.onClose(); });

    const btnEmptyGoFloor = this.container.querySelector('#btn-empty-go-floor');
    if (btnEmptyGoFloor) btnEmptyGoFloor.addEventListener('click', () => { if (this.onClose) this.onClose(); });

    this.container.querySelectorAll('.session-pick-card').forEach(card => {
      card.addEventListener('click', () => {
        const sid = card.dataset.sessionId;
        this.sessionId = sid;
        this.updateContent();
      });
    });
  }

  mountOrderComponents(projection) {
    // 1. Mount Menu Browser
    const menuMount = this.container.querySelector('#menu-browser-mount');
    if (!menuMount) return;
    this.menuBrowserInstance = new MenuBrowserView({
      draftItems: this.draftItems,
      onSelectItem: (item) => {
        const existing = this.draftItems.find(i => i.itemId === item.id || i.name === item.name);
        if (existing) {
          existing.quantity += 1;
        } else {
          this.draftItems.push({
            itemId: item.id,
            name: item.name || item.itemName,
            price: item.price || item.sellingPrice,
            quantity: 1,
            selectedModifiers: item.modifiers ? [item.modifiers[0]] : []
          });
        }
        if (this.menuBrowserInstance) {
          this.menuBrowserInstance.setDraftItems(this.draftItems);
        }
        this.updateDrawerContent();
      }
    });
    menuMount.appendChild(this.menuBrowserInstance.render());

    // 2. Mount Order Builder Drawer
    this.updateDrawerContent();
  }

  updateDrawerContent() {
    const drawerMount = this.container.querySelector('#order-drawer-mount');
    if (!drawerMount) return;
    drawerMount.innerHTML = '';

    const drawer = new OrderBuilderDrawer({
      draftItems: this.draftItems,
      onUpdateItems: (updatedItems) => {
        this.draftItems = updatedItems;
        if (this.menuBrowserInstance) {
          this.menuBrowserInstance.setDraftItems(this.draftItems);
        }
      },
      onReviewOrder: (draftItems) => {
        this.openReviewModal(draftItems);
      }
    });
    drawerMount.appendChild(drawer.render());
  }

  openReviewModal(draftItems) {
    const projection = sessionProjectionService.getSessionProjection(this.sessionId);
    const reviewMount = this.container.querySelector('#review-modal-mount');
    if (!reviewMount) return;
    reviewMount.innerHTML = '';

    const reviewModal = new OrderReviewModal({
      sessionId: this.sessionId,
      tableNumber: projection.tableNumber,
      draftItems,
      onClose: () => { reviewMount.innerHTML = ''; },
      onOrderConfirmed: (confirmedOrder) => {
        reviewMount.innerHTML = '';
        this.draftItems = [];
        this.updateDrawerContent();
        alert(`Order #${confirmedOrder.orderId || confirmedOrder.orderNumber} Confirmed! KOT (Kitchen) and BOT (Bar) tickets automatically dispatched.`);
        this.updateContent();
      }
    });

    reviewMount.appendChild(reviewModal.render());
  }

  openRunningBillModal() {
    const reviewMount = this.container.querySelector('#review-modal-mount');
    if (!reviewMount) return;
    reviewMount.innerHTML = '';

    const billModal = new RunningBillModal({
      sessionId: this.sessionId,
      onClose: () => { reviewMount.innerHTML = ''; },
      onAddMore: () => {
        reviewMount.innerHTML = '';
        const menuEl = this.container.querySelector('#menu-browser-mount');
        if (menuEl) menuEl.scrollIntoView({ behavior: 'smooth' });
      },
      onBillFinalized: () => {
        this.updateContent();
      }
    });

    reviewMount.appendChild(billModal.render());
  }
}
