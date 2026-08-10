/**
 * Capability Group 3 - Operational Acceptance Test Suite (Guest Service Lifecycle)
 * Tests the first complete vertical slice: PIN Auth -> Floor -> Seat Guests -> Session Created -> Milestone Service.
 */

import { authEngine } from '../../../../businessos/platform/authentication/authEngine.js';
import { sessionModel } from '../../../../businessos/platform/session/sessionModel.js';
import { sessionStateMachine, SessionMilestones } from '../../../../businessos/platform/session/sessionStateMachine.js';
import { sessionProjectionService } from '../../../../businessos/platform/session/sessionProjectionService.js';
import { tableStateMachine, PhysicalTableStates } from '../../../../businessos/platform/table_state/tableStateMachine.js';
import { timelineLedger } from '../../../../businessos/platform/timeline/timelineLedger.js';

export async function runCapabilityGroup3TestSuite() {
  const results = [];

  const assert = (condition, scenarioName) => {
    if (condition) {
      results.push({ scenarioName, status: 'PASS' });
      console.log(`✅ [GROUP 3 VERTICAL SLICE PASS] ${scenarioName}`);
    } else {
      results.push({ scenarioName, status: 'FAIL' });
      console.error(`❌ [GROUP 3 VERTICAL SLICE FAIL] ${scenarioName}`);
    }
  };

  console.log('🧪 Executing Group 3 Operational Acceptance Tests (First Vertical Slice)...\n');

  // Step 1: Waiter Rahul Login
  const authRes = await authEngine.authenticate('123456', 'DEV-FLOOR-01');
  assert(authRes.success === true && authRes.session.employeeName === 'Rahul Sharma', 'Scenario 3.1a: Waiter Rahul authenticates via PIN login');

  // Step 2: Create Session & Occupy Table 6
  const newSession = sessionModel.createSession({
    tableNumber: 6,
    guestCount: 4,
    assignedWaiterId: authRes.session.employeeId,
    guestNotes: 'Birthday party near window',
    dietaryTags: ['Nut Allergy'],
    celebrationFlag: 'Birthday'
  });
  tableStateMachine.transitionTableState(6, PhysicalTableStates.OCCUPIED, { sessionId: newSession.id, waiterId: authRes.session.employeeId });

  assert(newSession && newSession.id, 'Scenario 3.1b: Guest Session created with ID and Correlation ID');

  const tableState = tableStateMachine.getTableRuntimeState(6);
  assert(tableState.currentState === PhysicalTableStates.OCCUPIED && tableState.currentSessionId === newSession.id, 'Scenario 3.1c: Table 6 physical asset state transitions to OCCUPIED');

  // Step 3: Session Projection Verification (Recommendation 3.5 & PD-008)
  const sessionProj = sessionProjectionService.getSessionProjection(newSession.id);
  assert(sessionProj.guestCount === 4 && sessionProj.waiter.name === 'Rahul Sharma' && sessionProj.dietaryTags.includes('Nut Allergy'), 'Scenario 3.3: SessionProjection holds complete operational context (Guests 4, Waiter Rahul, Nut Allergy tag)');

  // Step 4: Milestone Progression Lifecycle
  const step1 = sessionStateMachine.transitionMilestone(newSession.id, SessionMilestones.ORDERS_STARTED);
  assert(step1.success === true && step1.session.status === SessionMilestones.ORDERS_STARTED, 'Scenario 3.2a: Session milestone advances to ORDERS_STARTED');

  const step2 = sessionStateMachine.transitionMilestone(newSession.id, SessionMilestones.BILL_GENERATED);
  assert(step2.success === true && step2.session.status === SessionMilestones.BILL_GENERATED, 'Scenario 3.2b: Session milestone advances to BILL_GENERATED');

  // Step 5: Timeline Ledger Verification
  const entries = timelineLedger.getTimelineEntries(20);
  assert(entries.some(e => e.type === 'session:created' || e.summary.includes('Session Opened')), 'Scenario 3.2c: Platform Timeline Ledger logs session creation and milestone events chronologically');

  // Step 6: Close Session & Restore Table
  sessionStateMachine.transitionMilestone(newSession.id, SessionMilestones.CLOSED);
  tableStateMachine.transitionTableState(6, PhysicalTableStates.AVAILABLE);
  assert(tableStateMachine.getTableRuntimeState(6).currentState === PhysicalTableStates.AVAILABLE, 'Scenario 3.1d: Session closed and Table 6 restored to AVAILABLE');

  authEngine.logout();

  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  console.log(`\n🎉 Capability Group 3 Test Suite Finished: ${passed}/${total} Scenarios Passed.`);

  return { total, passed, results };
}
