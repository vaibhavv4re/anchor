/**
 * BusinessOS Platform - Session Milestone Lifecycle State Machine (PD-008)
 * Manages guest service lifecycle milestones cleanly separated from physical table asset states.
 */

import { sessionModel } from './sessionModel.js';
import { platformEventBus } from '../events/platformEvents.js';
import { tableStateMachine, PhysicalTableStates } from '../table_state/tableStateMachine.js';
import { billRevisionModel } from '../billing/billRevisionModel.js';

export const SessionMilestones = Object.freeze({
  GUESTS_SEATED: 'GUESTS_SEATED',
  ORDERS_STARTED: 'ORDERS_STARTED',
  ORDERS_CONFIRMED: 'ORDERS_CONFIRMED',
  KITCHEN_UPDATES: 'KITCHEN_UPDATES',
  BILL_GENERATED: 'BILL_GENERATED',
  WAITER_REVISION_REQUIRED: 'WAITER_REVISION_REQUIRED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  CLOSED: 'CLOSED'
});

const AllowedMilestoneTransitions = {
  [SessionMilestones.GUESTS_SEATED]: [SessionMilestones.ORDERS_STARTED, SessionMilestones.CLOSED],
  [SessionMilestones.ORDERS_STARTED]: [SessionMilestones.ORDERS_CONFIRMED, SessionMilestones.BILL_GENERATED, SessionMilestones.CLOSED],
  [SessionMilestones.ORDERS_CONFIRMED]: [SessionMilestones.KITCHEN_UPDATES, SessionMilestones.BILL_GENERATED, SessionMilestones.CLOSED],
  [SessionMilestones.KITCHEN_UPDATES]: [SessionMilestones.BILL_GENERATED, SessionMilestones.CLOSED],
  [SessionMilestones.BILL_GENERATED]: [SessionMilestones.WAITER_REVISION_REQUIRED, SessionMilestones.ORDERS_STARTED, SessionMilestones.ORDERS_CONFIRMED, SessionMilestones.PAYMENT_RECEIVED, SessionMilestones.CLOSED],
  [SessionMilestones.WAITER_REVISION_REQUIRED]: [SessionMilestones.ORDERS_STARTED, SessionMilestones.ORDERS_CONFIRMED, SessionMilestones.BILL_GENERATED, SessionMilestones.CLOSED],
  [SessionMilestones.PAYMENT_RECEIVED]: [SessionMilestones.CLOSED],
  [SessionMilestones.CLOSED]: []
};

class SessionStateMachine {
  /**
   * Advance session to a new operational milestone.
   */
  transitionMilestone(sessionId, newMilestone, actorId = 'SYSTEM') {
    const session = sessionModel.getSession(sessionId);
    if (!session) return { success: false, error: 'Session not found' };

    const currentMilestone = session.status;
    if (currentMilestone === newMilestone) return { success: true, session };

    const allowed = AllowedMilestoneTransitions[currentMilestone] || [];
    if (!allowed.includes(newMilestone)) {
      return { 
        success: false, 
        error: `Invalid milestone transition from ${currentMilestone} to ${newMilestone}` 
      };
    }

    const extraUpdates = {};
    if (newMilestone === SessionMilestones.BILL_GENERATED) extraUpdates.billStatus = 'GENERATED';
    if (newMilestone === SessionMilestones.WAITER_REVISION_REQUIRED) extraUpdates.billStatus = 'RECALLED';
    if (newMilestone === SessionMilestones.PAYMENT_RECEIVED) extraUpdates.billStatus = 'PAID';

    const updated = sessionModel.updateSession(sessionId, { status: newMilestone, ...extraUpdates });

    if (newMilestone === SessionMilestones.BILL_GENERATED) {
      tableStateMachine.transitionTableState(updated.tableNumber, PhysicalTableStates.PAYMENT_PENDING);
    } else if (newMilestone === SessionMilestones.WAITER_REVISION_REQUIRED) {
      tableStateMachine.transitionTableState(updated.tableNumber, PhysicalTableStates.ORDER_IN_PROGRESS);
    } else if (newMilestone === SessionMilestones.PAYMENT_RECEIVED) {
      tableStateMachine.transitionTableState(updated.tableNumber, PhysicalTableStates.PAID_CLEARING);
    } else if (newMilestone === SessionMilestones.CLOSED) {
      tableStateMachine.transitionTableState(updated.tableNumber, PhysicalTableStates.CLEANING);
    }

    // Publish platform event
    platformEventBus.publish('session:milestone:changed', {
      sessionId: updated.id,
      tableNumber: updated.tableNumber,
      previousMilestone: currentMilestone,
      newMilestone,
      correlationId: updated.correlationId,
      actorId,
      timestamp: updated.lastActivityAt
    });

    return { success: true, session: updated };
  }

  /**
   * Cashier Action: Recall bill snapshot to Waiter for order modifications.
   */
  recallBill(sessionId, reason = 'Waiter Item Modification Required', actorId = 'CASHIER') {
    const session = sessionModel.getSession(sessionId);
    if (!session) return { success: false, error: 'Session not found' };
    
    // 1. Mark latest revision recalled in billRevisionModel
    billRevisionModel.markRevisionRecalled(sessionId, reason, actorId);

    // 2. Transition session milestone to WAITER_REVISION_REQUIRED
    const updated = sessionModel.updateSession(sessionId, { 
      status: SessionMilestones.WAITER_REVISION_REQUIRED, 
      billStatus: 'DRAFT' 
    });

    // 3. Unlock physical table state back to ORDER_IN_PROGRESS
    tableStateMachine.transitionTableState(updated.tableNumber, PhysicalTableStates.ORDER_IN_PROGRESS);

    const now = new Date().toISOString();

    platformEventBus.publish('session:milestone:changed', {
      sessionId: updated.id,
      tableNumber: updated.tableNumber,
      previousMilestone: SessionMilestones.BILL_GENERATED,
      newMilestone: SessionMilestones.WAITER_REVISION_REQUIRED,
      actorId,
      timestamp: now
    });

    platformEventBus.publish('bill:recalled', {
      sessionId: updated.id,
      tableNumber: updated.tableNumber,
      reason,
      actorId,
      timestamp: now
    });

    return { success: true, session: updated };
  }

  /**
   * Cashier-Only Action: Re-open a finalised bill (reverts BILL_GENERATED -> ORDERS_STARTED)
   */
  reopenBill(sessionId, actorId = 'CASHIER') {
    return this.recallBill(sessionId, 'Cashier Re-opened Bill', actorId);
  }
}

export const sessionStateMachine = new SessionStateMachine();
