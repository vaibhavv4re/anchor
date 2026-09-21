/**
 * BusinessOS Platform - Bar Stock Reconciliation Domain Model (Phase B-05D)
 *
 * Enforces the approved Bar Stock Reconciliation Domain Contract:
 *   1. Authoritative Scope: Strictly LOC-314 Bar Store and the 50 active Bar SKUs.
 *   2. Blind Count Protocol: Bartenders enter physical observations without seeing book/expected values.
 *   3. Submission Isolation: Submitting a count calculates variance but causes ZERO stock movement.
 *   4. Ledger-Boundary Capture: Records exact snapshot timestamps and ledger boundaries at submission.
 *   5. Zero-Variance Invariant: Zero-variance lines generate no adjustment ledger movements.
 *   6. Single Cloud Ledger Truth: Cloud adjustments flow to stock_transactions -> stock_balances.
 *   7. Role Governance: Bartenders submit; Supervisors/Managers review, approve, and post adjustments.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { BAR_POLICY_CLASSIFICATION_MAP } from './barReplenishmentModel.js';
import { BAR_STORE_LOCATION } from './barReplenishmentModel.js';

export { BAR_STORE_LOCATION };

export const ReconciliationSessionStatus = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  VARIANCE_REVIEW: 'VARIANCE_REVIEW',
  REJECTED: 'REJECTED',
  APPROVED_AND_POSTED: 'APPROVED_AND_POSTED'
});

export const ReconciliationVarianceType = Object.freeze({
  MATCHED: 'MATCHED',
  SHORT: 'SHORT',
  OVER: 'OVER'
});

export const ReconciliationReasonCode = Object.freeze({
  SPILLAGE: 'SPILLAGE',
  BREAKAGE: 'BREAKAGE',
  OVERPOUR: 'OVERPOUR',
  UNEXPLAINED: 'UNEXPLAINED',
  STOCK_AUDIT_CORRECTION: 'STOCK_AUDIT_CORRECTION'
});

export const ALLOWED_RECONCILIATION_REASONS = Object.freeze([
  ReconciliationReasonCode.SPILLAGE,
  ReconciliationReasonCode.BREAKAGE,
  ReconciliationReasonCode.OVERPOUR,
  ReconciliationReasonCode.UNEXPLAINED,
  ReconciliationReasonCode.STOCK_AUDIT_CORRECTION
]);

const AUTHORIZED_SUPERVISOR_ROLES = Object.freeze([
  'BAR_SUPERVISOR',
  'INVENTORY_MANAGER',
  'STORE_MANAGER',
  'OWNER',
  'SUPER_ADMIN',
  'ADMIN',
  'SYSTEM'
]);

/**
 * Validates if an actor role is authorized to approve or reject reconciliations.
 */
export function isAuthorizedSupervisor(role) {
  if (!role) return false;
  const normalized = String(role).toUpperCase().replace(/\s+/g, '_');
  if (normalized === 'BARTENDER') return false;
  return AUTHORIZED_SUPERVISOR_ROLES.includes(normalized);
}

/**
 * Creates a new Draft Bar Stock Reconciliation Session populated with all 50 Bar SKUs.
 */
export function createReconciliationSession({
  openedBy = 'Bartender',
  sessionType = 'SHIFT_CLOSE',
  notes = '',
  tenantId = 'tenant_h0qc7wf',
  inventoryCatalog = [],
  currentBalances = []
} = {}) {
  const sessions = offlineStore.getCollection('bar_reconciliation_sessions') || [];
  const sessionSeq = sessions.length + 1;
  const sessionId = `rec-bar-session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const sessionNumber = `REC-BAR-2026-${String(sessionSeq).padStart(4, '0')}`;

  const catalogMap = new Map();
  if (Array.isArray(inventoryCatalog)) {
    inventoryCatalog.forEach(item => {
      const code = item.itemCode || item.item_code;
      if (code) catalogMap.set(code, item);
    });
  }

  const balanceMap = new Map();
  if (Array.isArray(currentBalances)) {
    currentBalances.forEach(b => {
      const code = b.itemCode || b.item_code;
      if (code) balanceMap.set(code, b);
    });
  }

  // Populate all 50 Bar SKUs
  const lines = Object.entries(BAR_POLICY_CLASSIFICATION_MAP).map(([itemCode, policy]) => {
    const catalogItem = catalogMap.get(itemCode) || {};
    const balItem = balanceMap.get(itemCode) || {};
    const defaultValuation = policy.classification === 'WINE' ? 180 : (policy.classification === 'SPIRIT' ? 400 : 120);
    const unitValuation = parseFloat(catalogItem.unitValuation || catalogItem.unit_valuation) || 
                          parseFloat(catalogItem.lastPurchasePrice || catalogItem.last_purchase_price) || 
                          parseFloat(balItem.unit_cost || balItem.unitCost) || 
                          defaultValuation;

    return {
      itemCode,
      itemName: catalogItem.itemName || catalogItem.item_name || catalogItem.name || itemCode,
      classification: policy.classification,
      packSizeMl: policy.packSizeMl,
      baseUom: 'LTR',
      unitValuation,
      
      // Bartender input fields
      physicalBottles: null,
      physicalPortionsMl: null,
      physicalQuantity: null,
      
      // Expected stock & variance fields (initially null for blind count)
      systemExpectedQty: null,
      varianceQty: null,
      varianceType: null,
      varianceCost: null,
      reasonCode: null,
      notes: ''
    };
  });

  const session = {
    id: sessionId,
    sessionNumber,
    tenantId,
    locationCode: BAR_STORE_LOCATION,
    sessionType, // SHIFT_CLOSE | OPENING_CHECK | SPOT_COUNT | MONTH_END
    status: ReconciliationSessionStatus.DRAFT,
    openedAt: new Date().toISOString(),
    closedAt: null,
    openedBy,
    submittedBy: null,
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    expectedSnapshotAt: null,
    expectedLedgerBoundary: null,
    physicalCountedAt: null,
    totalShortageQty: 0,
    totalOverageQty: 0,
    netVarianceQty: 0,
    netVarianceValue: 0,
    notes,
    lines,
    postingId: `post-rec-${sessionId}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  sessions.unshift(session);
  offlineStore.setCollection('bar_reconciliation_sessions', sessions);
  platformEventBus.publish('bar:reconciliation:created', { session });

  return session;
}

/**
 * Returns a Blind Count View Model for the Bartender.
 * CRITICAL INVARIANT: Completely omits book balances, system expected quantities, and variances!
 */
export function getBlindCountViewModel(session) {
  if (!session) return null;

  return {
    sessionId: session.id,
    sessionNumber: session.sessionNumber,
    status: session.status,
    locationCode: session.locationCode,
    sessionType: session.sessionType,
    openedAt: session.openedAt,
    openedBy: session.openedBy,
    lines: (session.lines || []).map(line => ({
      itemCode: line.itemCode,
      itemName: line.itemName,
      classification: line.classification,
      packSizeMl: line.packSizeMl,
      baseUom: line.baseUom,
      physicalBottles: line.physicalBottles,
      physicalPortionsMl: line.physicalPortionsMl,
      physicalQuantity: line.physicalQuantity,
      notes: line.notes || ''
    }))
  };
}

/**
 * Submits a Blind Count, freezing observations and calculating variances against the exact ledger snapshot.
 * CRITICAL INVARIANT: Causes ZERO stock mutations or ledger movements!
 */
export function submitBlindCount({
  sessionId,
  physicalObservations = [],
  submittedBy = 'Bartender',
  tenantId = 'tenant_h0qc7wf',
  currentBalances = [],
  latestLedgerBoundary = null
} = {}) {
  const sessions = offlineStore.getCollection('bar_reconciliation_sessions') || [];
  const sessionIndex = sessions.findIndex(s => s.id === sessionId || s.sessionNumber === sessionId);
  if (sessionIndex === -1) {
    throw new Error(`Reconciliation session "${sessionId}" not found.`);
  }

  const session = { ...sessions[sessionIndex] };
  if (session.status === ReconciliationSessionStatus.APPROVED_AND_POSTED) {
    throw new Error(`Reconciliation session "${sessionId}" is already APPROVED_AND_POSTED and cannot be re-submitted.`);
  }

  const submittedAt = new Date().toISOString();
  const balanceMap = new Map();
  (currentBalances || []).forEach(b => {
    const code = b.itemCode || b.item_code;
    const loc = b.locationCode || b.location_code;
    if (b && code && (!loc || loc === BAR_STORE_LOCATION)) {
      balanceMap.set(code, parseFloat(b.quantity) || 0);
    }
  });

  const obsMap = new Map();
  (physicalObservations || []).forEach(obs => {
    if (obs && obs.itemCode) obsMap.set(obs.itemCode, obs);
  });

  let totalShortageQty = 0;
  let totalOverageQty = 0;
  let netVarianceQty = 0;
  let netVarianceValue = 0;

  const processedLines = session.lines.map(line => {
    const obs = obsMap.get(line.itemCode) || {};
    
    // Parse physical count: either directly as LTR, or converted from bottles + portions
    let physicalQuantity = null;
    let bottles = null;
    let portionsMl = null;

    if (obs.physicalQuantity !== undefined && obs.physicalQuantity !== null && obs.physicalQuantity !== '') {
      physicalQuantity = Math.round(parseFloat(obs.physicalQuantity) * 1000) / 1000;
    } else if (obs.physicalBottles !== undefined || obs.physicalPortionsMl !== undefined) {
      bottles = parseFloat(obs.physicalBottles) || 0;
      portionsMl = parseFloat(obs.physicalPortionsMl) || 0;
      const packLtr = (line.packSizeMl || 750) / 1000;
      physicalQuantity = Math.round(((bottles * packLtr) + (portionsMl / 1000)) * 1000) / 1000;
    } else {
      physicalQuantity = 0;
    }

    // Freeze expected stock from authoritative balance snapshot at submission time
    const expectedQty = balanceMap.has(line.itemCode) ? balanceMap.get(line.itemCode) : 0;
    const varianceQty = Math.round((physicalQuantity - expectedQty) * 1000) / 1000;
    
    let varianceType = ReconciliationVarianceType.MATCHED;
    if (varianceQty < -0.0001) {
      varianceType = ReconciliationVarianceType.SHORT;
      totalShortageQty += Math.abs(varianceQty);
    } else if (varianceQty > 0.0001) {
      varianceType = ReconciliationVarianceType.OVER;
      totalOverageQty += varianceQty;
    }

    const unitValuation = line.unitValuation || 0;
    const varianceCost = Math.round(varianceQty * unitValuation * 100) / 100;
    netVarianceQty += varianceQty;
    netVarianceValue += varianceCost;

    // Reason code default assignment
    let reasonCode = obs.reasonCode || null;
    if (!reasonCode && varianceType !== ReconciliationVarianceType.MATCHED) {
      const noteText = (obs.notes || '').toLowerCase();
      if (noteText.includes('spill')) reasonCode = ReconciliationReasonCode.SPILLAGE;
      else if (noteText.includes('break') || noteText.includes('broken')) reasonCode = ReconciliationReasonCode.BREAKAGE;
      else if (noteText.includes('overpour')) reasonCode = ReconciliationReasonCode.OVERPOUR;
      else reasonCode = ReconciliationReasonCode.UNEXPLAINED;
    }

    return {
      ...line,
      physicalBottles: bottles,
      physicalPortionsMl: portionsMl,
      physicalQuantity,
      systemExpectedQty: expectedQty,
      varianceQty,
      varianceType,
      varianceCost,
      reasonCode,
      notes: obs.notes || line.notes || ''
    };
  });

  session.status = ReconciliationSessionStatus.VARIANCE_REVIEW;
  session.submittedBy = submittedBy;
  session.submittedAt = submittedAt;
  session.physicalCountedAt = submittedAt;
  session.expectedSnapshotAt = submittedAt;
  session.expectedLedgerBoundary = latestLedgerBoundary || `ledger-boundary-${submittedAt}`;
  session.lines = processedLines;
  session.totalShortageQty = Math.round(totalShortageQty * 1000) / 1000;
  session.totalOverageQty = Math.round(totalOverageQty * 1000) / 1000;
  session.netVarianceQty = Math.round(netVarianceQty * 1000) / 1000;
  session.netVarianceValue = Math.round(netVarianceValue * 100) / 100;
  session.updatedAt = submittedAt;

  sessions[sessionIndex] = session;
  offlineStore.setCollection('bar_reconciliation_sessions', sessions);
  platformEventBus.publish('bar:reconciliation:submitted', { session });

  return session;
}

/**
 * Rejects a submitted session and returns it to IN_PROGRESS for recounting.
 */
export function rejectReconciliationSession({
  sessionId,
  rejectionReason = 'Recount required',
  rejectedBy = 'Bar Supervisor',
  actorRole = 'BAR_SUPERVISOR',
  tenantId = 'tenant_h0qc7wf'
} = {}) {
  if (!isAuthorizedSupervisor(actorRole)) {
    throw new Error(`❌ Unauthorized: Role "${actorRole}" is not permitted to reject reconciliation sessions.`);
  }

  const sessions = offlineStore.getCollection('bar_reconciliation_sessions') || [];
  const sessionIndex = sessions.findIndex(s => s.id === sessionId || s.sessionNumber === sessionId);
  if (sessionIndex === -1) {
    throw new Error(`Reconciliation session "${sessionId}" not found.`);
  }

  const session = { ...sessions[sessionIndex] };
  if (session.status === ReconciliationSessionStatus.APPROVED_AND_POSTED) {
    throw new Error(`Reconciliation session "${sessionId}" is already APPROVED_AND_POSTED and cannot be rejected.`);
  }

  const now = new Date().toISOString();
  session.status = ReconciliationSessionStatus.REJECTED;
  session.rejectedBy = rejectedBy;
  session.rejectedAt = now;
  session.rejectionReason = rejectionReason;
  session.updatedAt = now;

  sessions[sessionIndex] = session;
  offlineStore.setCollection('bar_reconciliation_sessions', sessions);
  platformEventBus.publish('bar:reconciliation:rejected', { session, rejectionReason });

  return session;
}

/**
 * Formulates atomic adjustment lines for non-zero variances.
 * CRITICAL INVARIANT: Zero-variance lines produce ZERO adjustment lines.
 */
export function prepareApprovalAdjustments(session) {
  if (!session || !Array.isArray(session.lines)) return [];

  const nonZeroLines = session.lines.filter(l => Math.abs(l.varianceQty || 0) > 0.0001);

  return nonZeroLines.map(line => {
    const isDecrease = line.varianceQty < 0;
    const qty = Math.abs(line.varianceQty);
    const reason = line.reasonCode || (isDecrease ? ReconciliationReasonCode.UNEXPLAINED : ReconciliationReasonCode.STOCK_AUDIT_CORRECTION);

    return {
      itemCode: line.itemCode,
      itemName: line.itemName,
      adjustmentType: isDecrease ? 'DECREASE' : 'INCREASE',
      quantity: qty,
      baseUom: line.baseUom || 'LTR',
      reasonCode: reason,
      notes: `Reconciliation variance (${line.varianceQty > 0 ? '+' : ''}${line.varianceQty} ${line.baseUom}) for ${session.sessionNumber} [${reason}]`
    };
  });
}
