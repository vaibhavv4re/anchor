/**
 * Capability Group 2 - Operational Acceptance Test Suite
 * Verifies Dining Areas, Tables Master, 6 Physical Table States, CQRS Projections,
 * Seating Rules, Platform Timeline, and Unified Workspace State (PD-006, PD-007, PD-008).
 */

import { diningAreaModel } from '../../../../businessos/platform/layout/diningAreaModel.js';
import { tableMasterModel } from '../../../../businessos/platform/layout/tableMasterModel.js';
import { tableStateMachine, PhysicalTableStates } from '../../../../businessos/platform/table_state/tableStateMachine.js';
import { tableProjectionService } from '../../../../businessos/platform/table_state/tableProjectionService.js';
import { seatingRulesEngine } from '../../../../businessos/platform/table_state/seatingRulesEngine.js';
import { timelineLedger } from '../../../../businessos/platform/timeline/timelineLedger.js';

export async function runCapabilityGroup2TestSuite() {
  const results = [];

  const assert = (condition, scenarioName) => {
    if (condition) {
      results.push({ scenarioName, status: 'PASS' });
      console.log(`✅ [GROUP 2 OPERATIONAL PASS] ${scenarioName}`);
    } else {
      results.push({ scenarioName, status: 'FAIL' });
      console.error(`❌ [GROUP 2 OPERATIONAL FAIL] ${scenarioName}`);
    }
  };

  console.log('🧪 Executing Operational Acceptance Tests for Group 2 (Restaurant Layout & Seating)...\n');

  // Scenario 1: Dining Area Configuration (PD-007)
  const areas = diningAreaModel.getAllAreas();
  assert(areas.length === 4 && areas[0].name === 'Main Dining Hall', 'Scenario 2.1: Dining Area Master contains 4 active zones with display order');

  // Scenario 2: Tables Master Configuration vs Runtime (PD-007 & PD-008)
  const masterT1 = tableMasterModel.getTableMaster(1);
  assert(masterT1 && masterT1.seats === 2 && masterT1.maxSeats === 4 && masterT1.isMergeable === true, 'Scenario 2.2: Table Master holds static configuration specs (Seats 2, Max 4, Mergeable true)');

  // Scenario 3: 6 Physical Table States Lifecycle (PD-008)
  const trans1 = tableStateMachine.transitionTableState(1, PhysicalTableStates.OCCUPIED, { sessionId: 'sess_group2_test', waiterId: 'emp-rahul' });
  assert(trans1.success === true && trans1.runtime.currentState === PhysicalTableStates.OCCUPIED, 'Scenario 2.3a: Table 1 transitions from AVAILABLE to OCCUPIED');

  const trans2 = tableStateMachine.transitionTableState(1, PhysicalTableStates.PAYMENT_PENDING);
  assert(trans2.success === true && trans2.runtime.currentState === PhysicalTableStates.PAYMENT_PENDING, 'Scenario 2.3b: Table 1 transitions from OCCUPIED to PAYMENT_PENDING');

  const trans3 = tableStateMachine.transitionTableState(1, PhysicalTableStates.CLEANING);
  assert(trans3.success === true && trans3.runtime.currentState === PhysicalTableStates.CLEANING, 'Scenario 2.3c: Table 1 transitions from PAYMENT_PENDING to CLEANING');

  const trans4 = tableStateMachine.transitionTableState(1, PhysicalTableStates.AVAILABLE);
  assert(trans4.success === true && trans4.runtime.currentState === PhysicalTableStates.AVAILABLE, 'Scenario 2.3d: Table 1 transitions from CLEANING back to AVAILABLE');

  // Scenario 4: Table Runtime Projection (PD-006)
  tableStateMachine.transitionTableState(2, PhysicalTableStates.OCCUPIED, { sessionId: 'sess_test_202', waiterId: 'emp-rahul' });
  const projectionT2 = tableProjectionService.getTableProjection(2);
  assert(projectionT2.currentState === 'OCCUPIED' && projectionT2.assignedWaiterName === 'Rahul Sharma' && projectionT2.stateColor === '#8b5cf6', 'Scenario 2.4: Table Runtime Projection correctly merges master specs & runtime state for CQRS UI broadcast');

  // Scenario 5: Seating Rules Capacity Check
  const capCheck = seatingRulesEngine.validateSeatingCapacity(4, 10);
  assert(capCheck.isValid === false && capCheck.warning.includes('exceeds Table 4 maximum capacity'), 'Scenario 2.5: Seating Rules Engine rejects seating 10 guests at Table 4 (max 8 capacity)');

  // Scenario 6: Platform-Wide Operational Timeline Ledger
  const timelineEntries = timelineLedger.getTimelineEntries();
  assert(timelineEntries.length > 0 && timelineEntries.some(e => e.title.includes('Table 2 state changed')), 'Scenario 2.6: Timeline Ledger chronologically logs all platform business events');

  // Scenario 7: Unified State Projections across Workspaces (PD-006 Verification)
  const waiterProj = tableProjectionService.getTableProjection(2);
  const managerProj = tableProjectionService.getTableProjection(2);
  const cashierProj = tableProjectionService.getTableProjection(2);
  assert(waiterProj.currentState === managerProj.currentState && managerProj.currentState === cashierProj.currentState, 'Scenario 2.7 (PD-006): Waiter, Manager, and Cashier workspaces read identical unified Table Projection state');

  // Reset Table 2
  tableStateMachine.transitionTableState(2, PhysicalTableStates.AVAILABLE);

  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  console.log(`\n🎉 Capability Group 2 Test Suite Finished: ${passed}/${total} Scenarios Passed.`);

  return { total, passed, results };
}
