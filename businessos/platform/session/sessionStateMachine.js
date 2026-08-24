/**
 * BusinessOS Platform - Session Milestone Lifecycle State Machine (PD-008)
 * Manages guest service lifecycle milestones cleanly separated from physical table asset states.
 */

import { sessionModel } from './sessionModel.js';
import { platformEventBus } from '../events/platformEvents.js';

export const SessionMilestones = Object.freeze({
  GUESTS_SEATED: 'GUESTS_SEATED',
  ORDERS_STARTED: 'ORDERS_STARTED',
  ORDERS_CONFIRMED: 'ORDERS_CONFIRMED',
  KITCHEN_UPDATES: 'KITCHEN_UPDATES',
  BILL_GENERATED: 'BILL_GENERATED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  CLOSED: 'CLOSED'
});

const AllowedMilestoneTransitions = {
  [SessionMilestones.GUESTS_SEATED]: [SessionMilestones.ORDERS_STARTED, SessionMilestones.CLOSED],
  [SessionMilestones.ORDERS_STARTED]: [SessionMilestones.ORDERS_CONFIRMED, SessionMilestones.CLOSED],
  [SessionMilestones.ORDERS_CONFIRMED]: [SessionMilestones.KITCHEN_UPDATES, SessionMilestones.BILL_GENERATED, SessionMilestones.CLOSED],
  [SessionMilestones.KITCHEN_UPDATES]: [SessionMilestones.BILL_GENERATED, SessionMilestones.CLOSED],
  [SessionMilestones.BILL_GENERATED]: [SessionMilestones.ORDERS_STARTED, SessionMilestones.ORDERS_CONFIRMED, SessionMilestones.PAYMENT_RECEIVED, SessionMilestones.CLOSED],
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

    const updated = sessionModel.updateSession(sessionId, { status: newMilestone });

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
   * Cashier-Only Action: Re-open a finalised bill (reverts BILL_GENERATED -> ORDERS_STARTED)
   */
  reopenBill(sessionId, actorId = 'CASHIER') {
    const session = sessionModel.getSession(sessionId);
    if (!session) return { success: false, error: 'Session not found' };
    
    const updated = sessionModel.updateSession(sessionId, { 
      status: SessionMilestones.ORDERS_STARTED, 
      billStatus: 'DRAFT' 
    });

    platformEventBus.publish('session:milestone:changed', {
      sessionId: updated.id,
      tableNumber: updated.tableNumber,
      previousMilestone: SessionMilestones.BILL_GENERATED,
      newMilestone: SessionMilestones.ORDERS_STARTED,
      actorId,
      timestamp: new Date().toISOString()
    });

    platformEventBus.publish('bill:reopened', {
      sessionId: updated.id,
      tableNumber: updated.tableNumber,
      actorId
    });

    return { success: true, session: updated };
  }
}

export const sessionStateMachine = new SessionStateMachine();
