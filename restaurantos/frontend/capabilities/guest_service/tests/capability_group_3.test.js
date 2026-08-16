/**
 * Capability Group 3 - Operational Acceptance Test Suite (Guest Service Lifecycle)
 * Tests the first complete vertical slice: PIN Auth -> Floor -> Seat Guests -> Session Created -> Milestone Service.
 */

import { authEngine } from '../../../../../businessos/platform/authentication/authEngine.js';
import { sessionModel } from '../../../../../businessos/platform/session/sessionModel.js';
import { sessionStateMachine, SessionMilestones } from '../../../../../businessos/platform/session/sessionStateMachine.js';
import { sessionProjectionService } from '../../../../../businessos/platform/session/sessionProjectionService.js';
import { tableStateMachine, PhysicalTableStates } from '../../../../../businessos/platform/table_state/tableStateMachine.js';
import { timelineLedger } from '../../../../../businessos/platform/timeline/timelineLedger.js';

export async function runCapabilityGroup3TestSuite() {
  const results = [];

  // Scenario 1: PIN Auth Session Creation
  const authRes = await authEngine.authenticate('123456');
  results.push({ name: 'PIN Auth Session Creation', passed: authRes.success && authRes.session });

  const session = authRes.session;

  // Scenario 2: Seat Guests on Table T-101 (Triggers Session Creation)
  const newGuestSession = sessionModel.createSession({
    tableId: 'tbl_101',
    tableNumber: 'T-101',
    partySize: 4,
    waiterId: session.employeeId,
    waiterName: session.employeeName
  });

  tableStateMachine.transition('tbl_101', PhysicalTableStates.SEATED, { partySize: 4, sessionId: newGuestSession.id });

  results.push({ name: 'Seat Guests & Guest Session Created', passed: newGuestSession && newGuestSession.milestone === SessionMilestones.SEATED });

  // Scenario 3: Milestone Progressions (Seated -> Ordering -> Order Sent -> Dining -> Billing -> Closed)
  let sState = sessionStateMachine.transition(newGuestSession.id, SessionMilestones.ORDERING);
  sState = sessionStateMachine.transition(newGuestSession.id, SessionMilestones.ORDER_SENT, { activeOrderId: 'ord_1001' });
  sState = sessionStateMachine.transition(newGuestSession.id, SessionMilestones.DINING);
  sState = sessionStateMachine.transition(newGuestSession.id, SessionMilestones.BILLING, { billTotal: 145.50 });
  sState = sessionStateMachine.transition(newGuestSession.id, SessionMilestones.CLOSED, { paymentMethod: 'CARD' });

  results.push({ name: 'Guest Session Lifecycle Milestones', passed: sState.milestone === SessionMilestones.CLOSED });

  // Scenario 4: CQRS Active Sessions Projection View
  const activeSessions = sessionProjectionService.getActiveSessions();
  results.push({ name: 'CQRS Active Sessions Projection View', passed: Array.isArray(activeSessions) });

  // Scenario 5: Timeline Ledger Guest Service Audit Trail
  const timelineEvents = timelineLedger.getEvents({ aggregateId: newGuestSession.id });
  results.push({ name: 'Timeline Ledger Guest Service Events Recorded', passed: timelineEvents.length >= 5 });

  const passed = results.filter(r => r.passed).length;
  return { total: results.length, passed, results };
}
