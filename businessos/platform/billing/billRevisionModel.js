/**
 * BusinessOS Platform - Bill Revision & Snapshot Ledger (PD-010 & PD-012)
 * Manages versioned, immutable financial bill snapshots (Revision 1, Revision 2, etc.)
 * Integrates with TenantModel tax configuration and DataGateway Supabase cloud sync.
 * Preserves gross sales, first-class discount records, dynamic tax lines, and charges.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { tenantModel } from '../tenant/tenantModel.js';

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
  createRevision({ sessionId, tableNumber, tableCode, items = [], subtotal = 0, discountRecords = [], waiterId = 'emp-waiter', waiterName = 'Staff', tenantId = null, correlationId = null }) {
    const targetTenantId = this._getTenantId(tenantId);
    const primaryTenant = tenantModel.getPrimaryTenant() || {};
    
    const cid = correlationId || 'CID-' + Math.floor(10000 + Math.random() * 90000);
    const existingRevisions = this.getRevisionsForSession(sessionId, targetTenantId);
    
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

    // 1. Financial calculation sequence from Tenant Configuration
    const grossSales = parseFloat(subtotal) || 0;
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
      discounts: discountsTotal,
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
      items: (items || []).map(it => ({
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

    // 3. Sync to Supabase offline_journal / DataGateway
    const dg = this._getDataGateway();
    if (dg && typeof dg.create === 'function') {
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
      all[idx].invoiceStatus = 'ISSUED';
      all[idx].status = 'ISSUED';
      all[idx].invoiceNumber = invoiceNumber;
      all[idx].updatedAt = new Date().toISOString();
      offlineStore.setCollection('bill_revisions', all);
      return all[idx];
    }
    return null;
  }

  /**
   * Update revision status upon payment settlement
   */
  markRevisionPaid(sessionId, tenantId = null) {
    const latest = this.getLatestRevisionForSession(sessionId, tenantId);
    if (!latest) return null;

    const all = offlineStore.getCollection('bill_revisions') || [];
    const idx = all.findIndex(r => r.id === latest.id || r.revisionId === latest.id);
    if (idx >= 0) {
      all[idx].paymentStatus = 'PAID';
      all[idx].status = 'PAID';
      all[idx].updatedAt = new Date().toISOString();
      offlineStore.setCollection('bill_revisions', all);
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
      all[idx].approvalStatus = 'APPROVED';
      all[idx].approvedBy = actorName;
      all[idx].approvedAt = new Date().toISOString();
      offlineStore.setCollection('bill_revisions', all);

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
