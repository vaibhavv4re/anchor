/**
 * BusinessOS Platform - Bar Stock Reconciliation Service (Phase B-05D)
 *
 * Orchestrates Bar Stock Reconciliation Sessions:
 *   - Session Lifecycle Management
 *   - Blind Count Form Extraction (strictly hiding system expected quantities)
 *   - Observation Freezing & Ledger-Boundary Variance Analysis
 *   - Role-Gated Supervisor Approval & Atomic Adjustment Posting
 *   - Full Lineage Integration with certified StockAdjustmentRepository
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import {
  BAR_STORE_LOCATION,
  ReconciliationSessionStatus,
  createReconciliationSession,
  getBlindCountViewModel,
  submitBlindCount,
  rejectReconciliationSession,
  prepareApprovalAdjustments,
  isAuthorizedSupervisor
} from './barReconciliationModel.js';

export class BarReconciliationService {
  constructor(deps = {}) {
    this.stockAdjustmentRepository = deps.stockAdjustmentRepository || null;
    this.stockCountRepository = deps.stockCountRepository || null;
    this.dataGateway = deps.dataGateway || null;
    this.offlineStore = deps.offlineStore || offlineStore;
    this.platformEventBus = deps.platformEventBus || platformEventBus;
  }

  /**
   * Retrieves all Bar Reconciliation Sessions.
   */
  getAllSessions(tenantId = 'tenant_h0qc7wf') {
    const store = this.offlineStore || offlineStore;
    const sessions = store.getCollection('bar_reconciliation_sessions') || [];
    return sessions.filter(s => !tenantId || s.tenantId === tenantId);
  }

  /**
   * Retrieves a specific session by ID or sessionNumber.
   */
  getSessionById(sessionId, tenantId = 'tenant_h0qc7wf') {
    return this.getAllSessions(tenantId).find(s => s.id === sessionId || s.sessionNumber === sessionId) || null;
  }

  /**
   * Opens a new Bar Stock Reconciliation Session.
   */
  openSession({
    openedBy = 'Bartender',
    sessionType = 'SHIFT_CLOSE',
    notes = '',
    tenantId = 'tenant_h0qc7wf'
  } = {}) {
    let catalog = [];
    let balances = [];
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      catalog = this.dataGateway.getCachedCollection('inventory', tenantId) || [];
      balances = this.dataGateway.getCachedCollection('stock_balances', tenantId) || [];
    } else {
      const store = this.offlineStore || offlineStore;
      catalog = store.getCollection('inventory', tenantId) || store.getCollection('inventory_items', tenantId) || [];
      balances = store.getCollection('stock_balances', tenantId) || [];
    }

    return createReconciliationSession({
      openedBy,
      sessionType,
      notes,
      tenantId,
      inventoryCatalog: catalog,
      currentBalances: balances
    });
  }

  /**
   * Returns the Blind Count form for a session.
   * STRICT INVARIANT: Omits book balances, system expected quantities, and variances.
   */
  getBlindCountForm(sessionId, tenantId = 'tenant_h0qc7wf') {
    const session = this.getSessionById(sessionId, tenantId);
    if (!session) throw new Error(`Reconciliation session "${sessionId}" not found.`);
    return getBlindCountViewModel(session);
  }

  /**
   * Submits the blind count observations.
   * Freezes physical observations and calculates variances against live stock balances at submission time.
   * STRICT INVARIANT: Causes zero stock mutations or ledger movements.
   */
  submitCount({
    sessionId,
    physicalObservations = [],
    submittedBy = 'Bartender',
    tenantId = 'tenant_h0qc7wf'
  } = {}) {
    let balances = [];
    if (this.dataGateway && typeof this.dataGateway.getCachedCollection === 'function') {
      balances = this.dataGateway.getCachedCollection('stock_balances', tenantId) || [];
    } else {
      const store = this.offlineStore || offlineStore;
      balances = store.getCollection('stock_balances', tenantId) || [];
    }

    const locBalances = balances.filter(b => b.locationCode === BAR_STORE_LOCATION || b.location_code === BAR_STORE_LOCATION);

    return submitBlindCount({
      sessionId,
      physicalObservations,
      submittedBy,
      tenantId,
      currentBalances: locBalances
    });
  }

  /**
   * Retrieves the Variance Review view model for a supervisor.
   */
  getVarianceReview(sessionId, tenantId = 'tenant_h0qc7wf') {
    const session = this.getSessionById(sessionId, tenantId);
    if (!session) throw new Error(`Reconciliation session "${sessionId}" not found.`);

    return {
      session,
      summary: {
        sessionId: session.id,
        sessionNumber: session.sessionNumber,
        status: session.status,
        sessionType: session.sessionType,
        openedBy: session.openedBy,
        openedAt: session.openedAt,
        submittedBy: session.submittedBy,
        submittedAt: session.submittedAt,
        expectedSnapshotAt: session.expectedSnapshotAt,
        expectedLedgerBoundary: session.expectedLedgerBoundary,
        totalItemsCounted: (session.lines || []).length,
        totalShortageQty: session.totalShortageQty,
        totalOverageQty: session.totalOverageQty,
        netVarianceQty: session.netVarianceQty,
        netVarianceValue: session.netVarianceValue,
        shortageItemsCount: (session.lines || []).filter(l => l.varianceType === 'SHORT').length,
        overageItemsCount: (session.lines || []).filter(l => l.varianceType === 'OVER').length,
        matchedItemsCount: (session.lines || []).filter(l => l.varianceType === 'MATCHED').length
      },
      lines: session.lines || []
    };
  }

  /**
   * Rejects a session, returning it to IN_PROGRESS.
   */
  rejectSession({
    sessionId,
    rejectionReason = 'Recount required',
    sessionUser = { name: 'Bar Supervisor', role: 'BAR_SUPERVISOR' },
    tenantId = 'tenant_h0qc7wf'
  } = {}) {
    const actorRole = sessionUser ? sessionUser.role : null;
    const actorName = sessionUser ? (sessionUser.name || sessionUser.employeeName || 'Supervisor') : 'Supervisor';

    return rejectReconciliationSession({
      sessionId,
      rejectionReason,
      rejectedBy: actorName,
      actorRole,
      tenantId
    });
  }

  /**
   * Approves a reconciliation session and posts atomic adjustments.
   *
   * Invariants:
   *   1. Role Governance: Requires authorized managerial role. Rejects BARTENDER.
   *   2. Idempotency: Re-approving an already APPROVED_AND_POSTED session returns idempotentRetry: true.
   *   3. Zero-Variance Invariant: Zero-variance lines produce ZERO adjustment movements.
   *   4. Granular Lineage: Posted adjustments carry session ID and reason codes into stock_transactions.
   */
  async approveAndPost({
    sessionId,
    lineReasonOverrides = {},
    sessionUser = { name: 'Bar Supervisor', role: 'BAR_SUPERVISOR' },
    tenantId = 'tenant_h0qc7wf'
  } = {}) {
    // 1. Role Authorization Check
    const actorRole = sessionUser ? sessionUser.role : null;
    const actorName = sessionUser ? (sessionUser.name || sessionUser.employeeName || 'Supervisor') : 'Supervisor';

    if (!isAuthorizedSupervisor(actorRole)) {
      return {
        success: false,
        error: `❌ Unauthorized: Role "${actorRole || 'UNKNOWN'}" is not permitted to approve or post reconciliation adjustments.`
      };
    }

    const session = this.getSessionById(sessionId, tenantId);
    if (!session) {
      return { success: false, error: `Reconciliation session "${sessionId}" not found.` };
    }

    // 2. Idempotency Protection
    if (session.status === ReconciliationSessionStatus.APPROVED_AND_POSTED) {
      return {
        success: true,
        session,
        idempotentRetry: true,
        message: `Session "${session.sessionNumber}" is already APPROVED_AND_POSTED.`
      };
    }

    // Apply any supervisor line reason overrides
    if (lineReasonOverrides && typeof lineReasonOverrides === 'object') {
      session.lines.forEach(line => {
        if (lineReasonOverrides[line.itemCode]) {
          line.reasonCode = lineReasonOverrides[line.itemCode];
        }
      });
    }

    // 3. Prepare non-zero adjustment lines
    const adjustmentLines = prepareApprovalAdjustments(session);
    let adjustmentResult = null;

    // 4. Post adjustments through certified StockAdjustmentRepository if non-zero variances exist
    if (adjustmentLines.length > 0) {
      if (!this.stockAdjustmentRepository) {
        return {
          success: false,
          error: `StockAdjustmentRepository dependency not injected in BarReconciliationService.`
        };
      }

      // Determine primary reason code for adjustment master record
      const hasSpillage = adjustmentLines.some(l => l.reasonCode === 'SPILLAGE');
      const hasBreakage = adjustmentLines.some(l => l.reasonCode === 'BREAKAGE');
      const primaryReason = hasSpillage ? 'SPILLAGE' : (hasBreakage ? 'BREAKAGE' : 'STOCK_AUDIT_CORRECTION');

      const adjPayload = {
        adjustmentNo: `ADJ-${session.sessionNumber}`,
        postingId: session.postingId,
        operationId: session.id,
        referenceType: 'STOCK_RECONCILIATION',
        referenceId: session.sessionNumber,
        locationCode: BAR_STORE_LOCATION,
        reasonCode: primaryReason,
        adjustmentDate: new Date().toISOString().split('T')[0],
        notes: `Bar shift reconciliation adjustments for ${session.sessionNumber} (${session.sessionType})`,
        lines: adjustmentLines
      };

      adjustmentResult = this.stockAdjustmentRepository.postAdjustment(adjPayload, sessionUser);
      if (!adjustmentResult.success) {
        return {
          success: false,
          error: `Failed to post reconciliation adjustment: ${adjustmentResult.error}`
        };
      }
    }

    // 5. Update session to APPROVED_AND_POSTED
    const now = new Date().toISOString();
    session.status = ReconciliationSessionStatus.APPROVED_AND_POSTED;
    session.approvedBy = actorName;
    session.approvedAt = now;
    session.updatedAt = now;

    const store = this.offlineStore || offlineStore;
    const sessions = store.getCollection('bar_reconciliation_sessions') || [];
    const idx = sessions.findIndex(s => s.id === session.id);
    if (idx !== -1) sessions[idx] = session;
    store.setCollection('bar_reconciliation_sessions', sessions);

    // Also persist in stock_counts if repository available
    if (this.stockCountRepository) {
      const countRecord = {
        countNo: `CNT-${session.sessionNumber}`,
        postingId: session.postingId,
        locationCode: BAR_STORE_LOCATION,
        countDate: session.submittedAt ? session.submittedAt.split('T')[0] : now.split('T')[0],
        notes: `Bar Stock Reconciliation ${session.sessionNumber} (${session.sessionType})`,
        lines: session.lines.map(l => ({
          itemCode: l.itemCode,
          itemName: l.itemName,
          systemQuantity: l.systemExpectedQty,
          physicalQuantity: l.physicalQuantity,
          baseUom: l.baseUom
        })),
        tenantId
      };
      // Write count record without triggering duplicate adjustments
      if (this.dataGateway && typeof this.dataGateway.create === 'function') {
        this.dataGateway.create('stock_counts', {
          ...countRecord,
          id: `cnt-${session.id}`,
          status: 'RECONCILED',
          reconciledBy: actorName,
          reconciledAt: now
        }, sessionUser);
      }
    }

    // 6. Emit platform event
    this.platformEventBus.publish('bar:reconciliation:approved', {
      session,
      adjustmentResult,
      adjustmentsCount: adjustmentLines.length,
      zeroVarianceCount: session.lines.length - adjustmentLines.length
    });

    return {
      success: true,
      session,
      adjustmentResult,
      adjustmentsCount: adjustmentLines.length,
      zeroVarianceCount: session.lines.length - adjustmentLines.length,
      idempotentRetry: false
    };
  }
}

export const barReconciliationService = new BarReconciliationService();
