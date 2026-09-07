/**
 * BusinessOS Platform - Bill Revision & Snapshot Ledger (PD-010 & PD-012)
 * Manages versioned, immutable financial bill snapshots (Revision 1, Revision 2, etc.)
 * Integrates with TenantModel tax configuration and DataGateway Supabase cloud sync.
 * Preserves gross sales, first-class discount records, dynamic tax lines, and charges.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { tenantModel } from '../tenant/tenantModel.js';
import { orderModel } from '../ordering/orderModel.js';
import { sessionProjectionService } from '../session/sessionProjectionService.js';

class BillRevisionModel {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('bill_revisions')) {
      offlineStore.setCollection('bill_revisions', []);
    }
  }

  _getDataGateway() {
    if (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) {
      return window.__APP__.platform.dataGateway || null;
    }
    return null;
  }

  _getTenantId(providedTenantId = null) {
    if (providedTenantId) return providedTenantId;
    if (typeof sessionStorage !== 'undefined') {
      try {
        const session = JSON.parse(sessionStorage.getItem('ros_session') || '{}');
        return session.tenantId || 'tenant_h0qc7wf';
      } catch (_) {}
    }
    return 'tenant_h0qc7wf';
  }

  /**
   * Create a new immutable Bill Revision snapshot.
   * Pulls dynamic tax lines and charges from TenantModel configuration.
   * @param {Object} params { sessionId, tableNumber, tableCode, items, subtotal, discountRecords, waiterId, waiterName, tenantId, correlationId }
   * @returns {Object} Bill Revision Record
   */
  createRevision({ sessionId, tableNumber, tableCode, items = [], subtotal = 0, discountRecords = [], waiterId = 'emp-waiter', waiterName = 'Staff', tenantId = null, correlationId = null, operationId = null }) {
    const targetTenantId = this._getTenantId(tenantId);
    const primaryTenant = tenantModel.getPrimaryTenant() || {};
    
    const cid = correlationId || 'CID-' + Math.floor(10000 + Math.random() * 90000);
    const opId = operationId || cid;
    const existingRevisions = this.getRevisionsForSession(sessionId, targetTenantId);

    // Idempotency check: if operationId or correlationId already processed, return existing revision
    const existingMatch = existingRevisions.find(r => r.correlationId === cid || r.operationId === opId);
    if (existingMatch) return existingMatch;
    
    const dg = this._getDataGateway();
    if (dg && typeof dg.isOperationProcessed === 'function' && dg.isOperationProcessed(opId)) {
      const match = existingRevisions.find(r => r.correlationId === cid || r.operationId === opId);
      if (match) return match;
    }
    if (dg && typeof dg.markOperationProcessed === 'function') {
      dg.markOperationProcessed(opId);
    }
    
    // Mark previous revisions as SUPERSEDED if still GENERATED
    existingRevisions.forEach(r => {
      if (r.revisionStatus === 'GENERATED' || r.revisionStatus === 'RECALLED') {
        r.revisionStatus = 'SUPERSEDED';
      }
    });

    const revisionNumber = existingRevisions.length + 1;
    const revisionId = 'rev_' + Math.random().toString(36).substring(2, 9);
    const billNumber = existingRevisions.length > 0 ? existingRevisions[0].billNumber : `BILL-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    // 0-Items Safety Gate: Never allow a ₹0 bill when active orders exist for the session
    let finalItems = Array.isArray(items) ? [...items] : [];
    let finalSubtotal = parseFloat(subtotal) || 0;

    if (finalItems.length === 0) {
      const sessionOrders = sessionId ? orderModel.getOrdersForSession(sessionId, targetTenantId) : [];
      const billableOrders = sessionOrders.filter(o => o.status !== 'CANCELLED' && o.status !== 'VOIDED');

      if (billableOrders.length > 0) {
        // Attempt authoritative recovery from sessionProjectionService
        const proj = sessionProjectionService.getSessionProjection(sessionId, targetTenantId);
        if (proj && Array.isArray(proj.itemizedList) && proj.itemizedList.length > 0) {
          finalItems = proj.itemizedList;
          finalSubtotal = proj.subtotal || finalSubtotal;
        } else {
          console.error(`[billRevisionModel] ❌ Refusing to generate empty bill revision for session ${sessionId} with ${billableOrders.length} active orders.`);
          throw new Error('CANNOT_GENERATE_EMPTY_BILL_FOR_ACTIVE_ORDERS');
        }
      } else {
        console.error(`[billRevisionModel] ❌ Refusing to generate bill revision for session ${sessionId} with zero billable items.`);
        throw new Error('CANNOT_GENERATE_BILL_FOR_EMPTY_SESSION');
      }
    }

    // 1. Financial calculation sequence from Tenant Configuration
    const itemsSum = finalItems.reduce((sum, it) => sum + (parseFloat(it.lineTotal || (parseFloat(it.price || 0) * (it.quantity || 1))) || 0), 0);
    const grossSales = finalSubtotal || itemsSum || 0;
    const discountsTotal = (discountRecords || []).reduce((sum, d) => sum + (parseFloat(d.discountAmount) || 0), 0);
    const taxableAmount = Math.max(0, grossSales - discountsTotal);

    const cgstPercent = primaryTenant.cgstPercent !== undefined ? primaryTenant.cgstPercent : 2.5;
    const sgstPercent = primaryTenant.sgstPercent !== undefined ? primaryTenant.sgstPercent : 2.5;
    const isServiceChargeEnabled = primaryTenant.isServiceChargeEnabled !== false;
    const serviceChargePercent = (isServiceChargeEnabled && primaryTenant.serviceChargePercent) ? parseFloat(primaryTenant.serviceChargePercent) : 5.0;

    const cgstAmount = Math.round(taxableAmount * (cgstPercent / 100) * 100) / 100;
    const sgstAmount = Math.round(taxableAmount * (sgstPercent / 100) * 100) / 100;
    const serviceChargeAmount = isServiceChargeEnabled ? (Math.round(taxableAmount * (serviceChargePercent / 100) * 100) / 100) : 0;

    const taxLines = [
      { type: 'CGST', rate: cgstPercent, amount: cgstAmount },
      { type: 'SGST', rate: sgstPercent, amount: sgstAmount }
    ];

    const charges = isServiceChargeEnabled ? [
      { type: 'SERVICE_CHARGE', rate: serviceChargePercent, amount: serviceChargeAmount }
    ] : [];

    const grandTotal = Math.round((taxableAmount + cgstAmount + sgstAmount + serviceChargeAmount) * 100) / 100;

    const revisionRecord = {
      id: revisionId,
      revisionId,
      tenantId: targetTenantId,
      tenant_id: targetTenantId,
      sessionId,
      session_id: sessionId,
      tableNumber: parseInt(tableNumber) || 1,
      tableCode: tableCode || `T-${String(tableNumber).padStart(2, '0')}`,
      billNumber,
      bill_number: billNumber,
      revisionNumber,
      revision_number: revisionNumber,
      
      // Commercial History Breakdown
      grossSales,
      subtotal: grossSales,
      discountsTotal,
      discountRecords: Array.isArray(discountRecords) ? discountRecords : [],
      taxableAmount,
      
      // Dynamic Tax & Charge Arrays
      taxLines,
      charges,
      cgstPercent,
      cgstAmount,
      sgstPercent,
      sgstAmount,
      serviceChargePercent,
      serviceChargeAmount,
      
      grandTotal,
      grand_total: grandTotal,
      items: (finalItems || []).map(it => ({
        itemId: it.itemId || it.id,
        name: it.name || it.itemName || 'Menu Item',
        quantity: parseInt(it.quantity || it.qty || 1, 10),
        price: parseFloat(it.price || it.unitPrice || 0),
        lineTotal: parseFloat(it.lineTotal || (parseFloat(it.price || 0) * (it.quantity || 1)))
      })),
      waiterId: waiterId || 'emp-waiter',
      waiterName: waiterName || 'Staff',
      
      // Explicit Separated Statuses
      revisionStatus: 'GENERATED', // 'GENERATED' | 'RECALLED' | 'SUPERSEDED' | 'ACCEPTED'
      invoiceStatus: 'NOT_ISSUED', // 'NOT_ISSUED' | 'ISSUED' | 'CANCELLED'
      paymentStatus: 'UNPAID',     // 'UNPAID' | 'PARTIALLY_PAID' | 'PAID'
      status: 'GENERATED',         // Backward compatibility
      
      recallReason: null,
      invoiceNumber: null,         // Assigned ONLY when invoiceModel issues invoice
      createdAt: now,
      updatedAt: now,
      correlationId: cid
    };

    // 2. Write to local offline store
    offlineStore.appendItem('bill_revisions', revisionRecord);

    // 3. Sync to Supabase cloud table & offline_journal / DataGateway
    if (dg && typeof dg.create === 'function') {
      dg.create('bill_revisions', revisionRecord).catch(e => console.warn('[billRevisionModel] Cloud bill_revisions sync error:', e.message));

      const journalEntry = {
        job_id: 'job_' + revisionId,
        job_type: 'BILL_REVISION_CREATED',
        tenant_id: targetTenantId,
        entity_name: 'bill_revisions',
        payload: revisionRecord,
        device_id: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 30) : 'POS-TERMINAL-01',
        actor: waiterName,
        correlation_id: cid,
        sync_state: 'SYNCED',
        created_at: now
      };
      dg.create('offline_journal', journalEntry).catch(e => console.warn('[billRevisionModel] Cloud journal sync error:', e.message));
    }

    // 4. Publish platform event
    platformEventBus.publish('bill:revision:created', {
      revisionId: revisionRecord.id,
      sessionId: revisionRecord.sessionId,
      tableNumber: revisionRecord.tableNumber,
      billNumber: revisionRecord.billNumber,
      revisionNumber: revisionRecord.revisionNumber,
      grandTotal: revisionRecord.grandTotal,
      correlationId: cid,
      timestamp: now
    });

    return revisionRecord;
  }

  /**
   * Retrieve all bill revision snapshots for a session
   */
  getRevisionsForSession(sessionId, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const all = offlineStore.getCollection('bill_revisions') || [];
    return all
      .filter(r => (r.sessionId === sessionId || r.session_id === sessionId) && (!targetTenantId || r.tenantId === targetTenantId || r.tenant_id === targetTenantId))
      .sort((a, b) => a.revisionNumber - b.revisionNumber);
  }

  /**
   * Get latest bill revision snapshot for a session
   */
  getLatestRevisionForSession(sessionId, tenantId = null) {
    const revisions = this.getRevisionsForSession(sessionId, tenantId);
    return revisions.length > 0 ? revisions[revisions.length - 1] : null;
  }

  /**
   * Mark latest revision recalled by Cashier.
   * STRICT GUARD: Cannot recall if tax invoice is already ISSUED.
   */
  markRevisionRecalled(sessionId, reason = 'Waiter Item Modification', actorId = 'CASHIER', tenantId = null) {
    const latest = this.getLatestRevisionForSession(sessionId, tenantId);
    if (!latest) return { success: false, error: 'No bill revision found for session' };

    if (latest.invoiceStatus === 'ISSUED' || latest.invoiceNumber) {
      return { success: false, error: 'Cannot recall bill after tax invoice has been issued. Invoice INV is locked.' };
    }

    const all = offlineStore.getCollection('bill_revisions') || [];
    const idx = all.findIndex(r => r.id === latest.id || r.revisionId === latest.id);
    if (idx >= 0) {
      all[idx].revisionStatus = 'RECALLED';
      all[idx].status = 'RECALLED';
      all[idx].recallReason = reason;
      all[idx].updatedAt = new Date().toISOString();
      offlineStore.setCollection('bill_revisions', all);
      return { success: true, revision: all[idx] };
    }
    return { success: false, error: 'Revision not found' };
  }

  /**
   * Update revision status upon invoice issuance
   */
  markRevisionIssued(sessionId, invoiceNumber, tenantId = null) {
    const latest = this.getLatestRevisionForSession(sessionId, tenantId);
    if (!latest) return null;

    const all = offlineStore.getCollection('bill_revisions') || [];
    const idx = all.findIndex(r => r.id === latest.id || r.revisionId === latest.id);
    if (idx >= 0) {
      all[idx].revisionStatus = 'ACCEPTED';
      all[idx].revision_status = 'ACCEPTED';
      all[idx].invoiceStatus = 'ISSUED';
      all[idx].invoice_status = 'ISSUED';
      all[idx].status = 'ISSUED';
      all[idx].invoiceNumber = invoiceNumber;
      all[idx].invoice_number = invoiceNumber;
      all[idx].updatedAt = new Date().toISOString();
      offlineStore.setCollection('bill_revisions', all);

      const dg = this._getDataGateway();
      if (dg) {
        dg.update('bill_revisions', all[idx].id || all[idx].revisionId, all[idx])
          .catch(e => console.warn('[billRevisionModel] Cloud revision issued sync error:', e.message));
      }
      return all[idx];
    }
    return null;
  }

  /**
   * Update revision status upon payment settlement with explicit settlement verification.
   * Settled amount is verified against payable grand total before setting PAID.
   */
  markRevisionPaid(sessionId, tenantId = null) {
    const targetTenantId = this._getTenantId(tenantId);
    const latest = this.getLatestRevisionForSession(sessionId, targetTenantId);
    if (!latest) return null;

    // Verify settled amount against payable amount
    const allPayments = (offlineStore.getCollection('payments', targetTenantId) || offlineStore.getCollection('payments') || []);
    const sessionPayments = allPayments.filter(p => 
      (p.sessionId === sessionId || p.session_id === sessionId) &&
      (p.status === 'SETTLED' || p.paymentStatus === 'SETTLED')
    );
    const totalSettled = sessionPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const payableAmount = parseFloat(latest.grandTotal || latest.grand_total || 0);

    const isFullyPaid = (totalSettled + 0.01) >= payableAmount;
    const paymentStatus = isFullyPaid ? 'PAID' : (totalSettled > 0 ? 'PARTIALLY_PAID' : 'UNPAID');

    const all = offlineStore.getCollection('bill_revisions') || [];
    const idx = all.findIndex(r => r.id === latest.id || r.revisionId === latest.id);
    if (idx >= 0) {
      all[idx].paymentStatus = paymentStatus;
      all[idx].payment_status = paymentStatus;
      all[idx].settledAmount = totalSettled;
      all[idx].settled_amount = totalSettled;
      if (isFullyPaid) {
        all[idx].status = 'PAID';
      }
      all[idx].updatedAt = new Date().toISOString();
      offlineStore.setCollection('bill_revisions', all);

      const dg = this._getDataGateway();
      if (dg) {
        dg.update('bill_revisions', all[idx].id || all[idx].revisionId, all[idx])
          .catch(e => console.warn('[billRevisionModel] Cloud revision paid sync error:', e.message));
      }

      // If fully paid, transition session in lockstep
      if (isFullyPaid) {
        const sessions = offlineStore.getCollection('table_sessions', targetTenantId) || offlineStore.getCollection('table_sessions') || [];
        const sIdx = sessions.findIndex(s => s.id === sessionId || s.sessionId === sessionId);
        if (sIdx >= 0) {
          sessions[sIdx].billStatus = 'PAID';
          sessions[sIdx].bill_status = 'PAID';
          sessions[sIdx].status = 'PAYMENT_RECEIVED';
          sessions[sIdx].updatedAt = new Date().toISOString();
          offlineStore.setCollection('table_sessions', sessions);
          if (dg) {
            dg.update('table_sessions', sessions[sIdx].id || sessions[sIdx].sessionId, sessions[sIdx])
              .catch(e => console.warn('[billRevisionModel] Cloud session payment sync error:', e.message));
          }
        }
      }

      return all[idx];
    }
    return null;
  }

  /**
   * Approve a pending discount approval request
   */
  approveDiscount(revisionId, actorName = 'Manager', tenantId = null) {
    const all = offlineStore.getCollection('bill_revisions') || [];
    const idx = all.findIndex(r => r.id === revisionId || r.revisionId === revisionId);
    if (idx >= 0) {
      all[idx].revisionStatus = 'ACCEPTED';
      all[idx].revision_status = 'ACCEPTED';
      all[idx].approvalStatus = 'APPROVED';
      all[idx].approvedBy = actorName;
      all[idx].approvedAt = new Date().toISOString();
      offlineStore.setCollection('bill_revisions', all);

      const dg = this._getDataGateway();
      if (dg) {
        dg.update('bill_revisions', all[idx].id || all[idx].revisionId, all[idx])
          .catch(e => console.warn('[billRevisionModel] Cloud revision discount sync error:', e.message));
      }

      platformEventBus.publish('discount:approved', {
        revisionId,
        sessionId: all[idx].sessionId,
        actorName,
        timestamp: all[idx].approvedAt
      });
      return { success: true, revision: all[idx] };
    }
    return { success: false, error: 'Revision not found' };
  }

  /**
   * Reject a pending discount approval request
   */
  rejectDiscount(revisionId, actorName = 'Manager', tenantId = null) {
    const all = offlineStore.getCollection('bill_revisions') || [];
    const idx = all.findIndex(r => r.id === revisionId || r.revisionId === revisionId);
    if (idx >= 0) {
      all[idx].revisionStatus = 'REJECTED';
      all[idx].approvalStatus = 'REJECTED';
      all[idx].rejectedBy = actorName;
      all[idx].rejectedAt = new Date().toISOString();
      offlineStore.setCollection('bill_revisions', all);

      platformEventBus.publish('discount:rejected', {
        revisionId,
        sessionId: all[idx].sessionId,
        actorName,
        timestamp: all[idx].rejectedAt
      });
      return { success: true, revision: all[idx] };
    }
    return { success: false, error: 'Revision not found' };
  }
}

export const billRevisionModel = new BillRevisionModel();
