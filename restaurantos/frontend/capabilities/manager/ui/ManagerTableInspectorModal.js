/**
 * RestaurantOS - Manager Observer & Controller Table Inspector Modal (Phase M2)
 * Read-only operational inspection of Table Sessions, Kitchen Orders, Financial Revisions & Audit Timelines.
 * Enforces ownership boundaries — DOES NOT duplicate waiter POS or cashier payment actions.
 */

import { tableMasterModel } from '../../../../../businessos/platform/layout/tableMasterModel.js';
import { sessionModel } from '../../../../../businessos/platform/session/sessionModel.js';
import { orderModel } from '../../../../../businessos/platform/ordering/orderModel.js';
import { billRevisionModel } from '../../../../../businessos/platform/billing/billRevisionModel.js';
import { paymentModel } from '../../../../../businessos/platform/billing/paymentModel.js';
import { sessionAuditModel } from '../../../../../businessos/platform/session/sessionAuditModel.js';

export class ManagerTableInspectorModal {
  constructor({ tableNumber, sessionId, tenantId = null, onClose }) {
    this.tableNumber = tableNumber;
    this.sessionId = sessionId;
    this.tenantId = tenantId;
    this.onClose = onClose;
    this.modalEl = null;
  }

  render() {
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'modal-backdrop animate-fade-in';
    this.modalEl.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:9999; padding:16px; overflow-y:auto;';

    this.updateContent();
    return this.modalEl;
  }

  updateContent() {
    const master = tableMasterModel.getTableMaster(this.tableNumber);
    const tableCode = master ? master.tableCode : (typeof this.tableNumber === 'string' ? this.tableNumber : `T-${String(this.tableNumber || '01').padStart(2, '0')}`);
    
    // Resolve session
    let session = null;
    if (this.sessionId) {
      session = sessionModel.getSession(this.sessionId, this.tenantId);
    }
    if (!session && this.tableNumber) {
      session = sessionModel.getActiveSessionForTable(this.tableNumber, this.tenantId);
    }

    const sId = session ? (session.id || session.sessionId) : null;
    const orders = sId ? orderModel.getOrdersForSession(sId, this.tenantId) : [];
    const latestRevision = sId ? billRevisionModel.getLatestRevisionForSession(sId, this.tenantId) : null;
    const payment = sId ? paymentModel.getPaymentForSession(sId, this.tenantId) : null;
    const auditLogs = sId ? sessionAuditModel.getAuditLogsForSession(sId, this.tenantId) : [];

    // Calculate items breakdown
    let totalItems = 0;
    let queuedItems = 0;
    let prepItems = 0;
    let readyItems = 0;
    let servedItems = 0;

    orders.forEach(o => {
      if (Array.isArray(o.items)) {
        o.items.forEach(it => {
          totalItems++;
          if (it.itemStatus === 'READY' || it.status === 'READY') readyItems++;
          else if (it.itemStatus === 'PREPARING' || it.status === 'PREPARING') prepItems++;
          else if (it.itemStatus === 'SERVED' || it.status === 'SERVED') servedItems++;
          else queuedItems++;
        });
      }
    });

    const runningTotal = latestRevision ? latestRevision.grandTotal : (orders.reduce((sum, o) => sum + (parseFloat(o.subtotal || o.totalAmount) || 0), 0));
    const formatCurrency = (val) => '₹' + Number(val || 0).toLocaleString('en-IN');

    this.modalEl.innerHTML = `
      <div class="card animate-fade-in" style="width:100%; max-width:680px; background:var(--bg-surface-1); padding:24px; border-radius:12px; box-shadow:0 25px 30px -5px rgba(0,0,0,0.6); max-height:90vh; display:flex; flex-direction:column;">
        
        <!-- Header Strip -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">👔 MANAGER TABLE INSPECTOR</div>
            <h2 style="font-size:1.6rem; margin:2px 0 0 0;">Table ${tableCode}</h2>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="badge ${session ? 'badge-success' : 'badge-info'}" style="font-size:0.85rem; text-transform:uppercase;">
              ${session ? (session.status || 'ACTIVE SESSION') : 'AVAILABLE'}
            </span>
            <button id="btn-close-manager-inspector" style="background:none; border:none; color:var(--text-muted); font-size:1.6rem; cursor:pointer; line-height:1;">&times;</button>
          </div>
        </div>

        <div style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:20px; padding-right:4px;">
          
          <!-- 1. Session Overview Card -->
          <div class="card" style="padding:16px; background:var(--bg-surface-2); border-left:4px solid var(--accent-primary);">
            <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:10px;">🪑 SESSION OVERVIEW</div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:12px; font-size:0.85rem;">
              <div>
                <span style="color:var(--text-muted); display:block; font-size:0.75rem;">Assigned Waiter</span>
                <strong style="color:var(--text-primary); font-weight:600;">${session ? (session.assignedWaiterName || session.waiterName || 'Staff') : 'Unassigned'}</strong>
              </div>
              <div>
                <span style="color:var(--text-muted); display:block; font-size:0.75rem;">Seated Guests</span>
                <strong style="color:var(--text-primary); font-weight:600;">${session ? (session.guestCount || 2) : 0} Guests</strong>
              </div>
              <div>
                <span style="color:var(--text-muted); display:block; font-size:0.75rem;">Session ID</span>
                <code style="font-size:0.75rem;">${sId ? String(sId).substring(0, 10) : 'None'}</code>
              </div>
              <div>
                <span style="color:var(--text-muted); display:block; font-size:0.75rem;">Bill State</span>
                <span class="badge badge-warning" style="font-size:0.7rem;">${session ? (session.billStatus || 'UNBILLED') : 'NONE'}</span>
              </div>
            </div>
          </div>

          <!-- 2. Orders & Kitchen Production Status -->
          <div class="card" style="padding:16px; background:var(--bg-surface-2); border-left:4px solid #f59e0b;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">🍳 KITCHEN PRODUCTION & ORDERS (${orders.length} Confirmed)</div>
              <div style="display:flex; gap:6px; font-size:0.75rem;">
                <span class="badge" style="background:#ef444422; color:#ef4444;">🔴 ${queuedItems} Queued</span>
                <span class="badge" style="background:#f59e0b22; color:#f59e0b;">🔥 ${prepItems} Prep</span>
                <span class="badge" style="background:#10b98122; color:#10b981;">🟢 ${readyItems} Ready</span>
                <span class="badge" style="background:#6b728022; color:#6b7280;">⚪ ${servedItems} Served</span>
              </div>
            </div>

            ${orders.length === 0 ? `
              <div style="font-size:0.85rem; color:var(--text-muted); font-style:italic; padding:8px 0;">No active kitchen orders for this session yet.</div>
            ` : `
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${orders.map(o => `
                  <div style="background:var(--bg-surface-1); padding:10px 12px; border-radius:6px; font-size:0.85rem;">
                    <div style="display:flex; justify-content:space-between; font-weight:600; margin-bottom:4px;">
                      <span>Order #${String(o.orderNumber || o.id).substring(0, 10)}</span>
                      <span style="color:var(--accent-primary);">${formatCurrency(o.subtotal || o.totalAmount)}</span>
                    </div>
                    ${Array.isArray(o.items) ? o.items.map(it => `
                      <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-secondary); margin-top:2px;">
                        <span>• ${it.quantity}x ${it.name || it.itemName}</span>
                        <span class="badge" style="font-size:0.68rem; padding:1px 6px;">${it.itemStatus || it.status || 'QUEUED'}</span>
                      </div>
                    `).join('') : ''}
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <!-- 3. Financial Summary -->
          <div class="card" style="padding:16px; background:var(--bg-surface-2); border-left:4px solid #10b981;">
            <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:10px;">💰 FINANCIAL LEDGER SUMMARY</div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:12px; font-size:0.85rem;">
              <div>
                <span style="color:var(--text-muted); display:block; font-size:0.75rem;">Running Total</span>
                <strong style="color:#10b981; font-size:1.1rem;">${formatCurrency(runningTotal)}</strong>
              </div>
              <div>
                <span style="color:var(--text-muted); display:block; font-size:0.75rem;">Bill Revision</span>
                <strong style="color:var(--text-primary);">${latestRevision ? `Rev #${latestRevision.revisionNumber}` : 'Unbilled'}</strong>
              </div>
              <div>
                <span style="color:var(--text-muted); display:block; font-size:0.75rem;">Issued Invoice</span>
                <strong style="color:var(--text-primary); font-family:monospace; font-size:0.8rem;">${payment ? payment.invoiceNumber : (latestRevision ? 'Pending' : 'N/A')}</strong>
              </div>
              <div>
                <span style="color:var(--text-muted); display:block; font-size:0.75rem;">Payment Status</span>
                <span class="badge ${payment ? 'badge-success' : 'badge-info'}" style="font-size:0.7rem;">${payment ? payment.status : 'UNPAID'}</span>
              </div>
            </div>
          </div>

          <!-- 4. Session Audit Timeline -->
          <div class="card" style="padding:16px; background:var(--bg-surface-2); border-left:4px solid #3b82f6;">
            <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:10px;">📜 SESSION AUDIT TIMELINE (${auditLogs.length} Events)</div>
            ${auditLogs.length === 0 ? `
              <div style="font-size:0.85rem; color:var(--text-muted); font-style:italic;">No logged audit events recorded yet.</div>
            ` : `
              <div style="display:flex; flex-direction:column; gap:6px; max-height:160px; overflow-y:auto; padding-right:4px;">
                ${auditLogs.map(log => `
                  <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; background:var(--bg-surface-1); padding:6px 10px; border-radius:4px;">
                    <div>
                      <strong style="color:var(--text-primary);">${log.eventType || log.event}</strong>
                      <span style="color:var(--text-muted); margin-left:6px;">${log.actorName || log.actor || 'System'}</span>
                    </div>
                    <span style="color:var(--text-muted); font-size:0.72rem;">${new Date(log.timestamp || log.createdAt).toLocaleTimeString()}</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

        </div>

        <!-- Manager Controller Action Bar (Strict Ownership Boundaries) -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; border-top:1px solid var(--border-subtle); padding-top:16px; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; gap:8px;">
            <button class="btn-secondary" id="btn-mgr-audit-log" style="padding:8px 14px; font-size:0.8rem;">📜 View Audit Log</button>
            ${latestRevision ? `<button class="btn-secondary" id="btn-mgr-view-bill" style="padding:8px 14px; font-size:0.8rem;">🧾 View Bill Revision</button>` : ''}
          </div>
          <button class="btn-primary" id="btn-close-inspector" style="padding:8px 18px;">Close Inspector</button>
        </div>

      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.modalEl) return;

    const closeModal = () => {
      this.modalEl.remove();
      if (this.onClose) this.onClose();
    };

    this.modalEl.querySelector('#btn-close-manager-inspector').addEventListener('click', closeModal);
    this.modalEl.querySelector('#btn-close-inspector').addEventListener('click', closeModal);
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) closeModal();
    });

    const auditBtn = this.modalEl.querySelector('#btn-mgr-audit-log');
    if (auditBtn) {
      auditBtn.addEventListener('click', () => {
        alert(`📜 Session Audit Log for Table: ${this.tableNumber}`);
      });
    }

    const billBtn = this.modalEl.querySelector('#btn-mgr-view-bill');
    if (billBtn) {
      billBtn.addEventListener('click', () => {
        alert(`🧾 Viewing Bill Revisions for Table: ${this.tableNumber}`);
      });
    }
  }
}
