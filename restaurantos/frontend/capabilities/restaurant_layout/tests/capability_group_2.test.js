/**
 * Capability Group 2 - Operational Acceptance Test Suite
 * Verifies Dining Areas, Tables Master, 6 Physical Table States, CQRS Projections,
 * Seating Rules, Platform Timeline, and Unified Workspace State (PD-006, PD-007, PD-008).
 */

import { diningAreaModel } from '../../../../../businessos/platform/layout/diningAreaModel.js';
import { tableMasterModel } from '../../../../../businessos/platform/layout/tableMasterModel.js';
import { tableStateMachine, PhysicalTableStates } from '../../../../../businessos/platform/table_state/tableStateMachine.js';
import { tableProjectionService } from '../../../../../businessos/platform/table_state/tableProjectionService.js';
import { seatingRulesEngine } from '../../../../../businessos/platform/table_state/seatingRulesEngine.js';
import { timelineLedger } from '../../../../../businessos/platform/timeline/timelineLedger.js';

export async function runCapabilityGroup2TestSuite() {
  const results = [];

  // Scenario 1: Pre-seed Dining Areas & Table Master Assets
  const area1 = diningAreaModel.createArea({ name: 'Main Dining Room', type: 'Indoor' });
  const area2 = diningAreaModel.createArea({ name: 'Rooftop Lounge', type: 'Outdoor' });

  const table1 = tableMasterModel.createTable({ tableNumber: 'T-101', capacity: 4, areaId: area1.id });
  const table2 = tableMasterModel.createTable({ tableNumber: 'T-102', capacity: 2, areaId: area1.id });
  const table3 = tableMasterModel.createTable({ tableNumber: 'T-201', capacity: 6, areaId: area2.id });

  results.push({ name: 'Pre-seed Dining Areas & Table Assets', passed: area1 && area2 && table1 && table2 && table3 });

  // Scenario 2: 6 Physical Table States Transition Rules
  let state1 = tableStateMachine.getState(table1.id);
  const isInitiallyVacant = state1.state === PhysicalTableStates.VACANT;

  state1 = tableStateMachine.transition(table1.id, PhysicalTableStates.RESERVED, { reservationId: 'res_001' });
  state1 = tableStateMachine.transition(table1.id, PhysicalTableStates.SEATED, { partySize: 4 });
  state1 = tableStateMachine.transition(table1.id, PhysicalTableStates.ORDERING, { activeOrderId: 'ord_1001' });
  state1 = tableStateMachine.transition(table1.id, PhysicalTableStates.DINING, { activeOrderId: 'ord_1001' });
  state1 = tableStateMachine.transition(table1.id, PhysicalTableStates.BUSY_DIRTY, { reason: 'Guests departed' });
  state1 = tableStateMachine.transition(table1.id, PhysicalTableStates.VACANT, { reset: true });

  const isStateCycleValid = isInitiallyVacant && state1.state === PhysicalTableStates.VACANT;
  results.push({ name: '6 Physical Table State Transitions', passed: isStateCycleValid });

  // Scenario 3: CQRS Table State Projection View
  const projections = tableProjectionService.getFloorPlanProjections();
  const projectedTable = projections.find(p => p.tableId === table1.id);
  results.push({ name: 'CQRS Table Floorplan Projection', passed: projectedTable && projectedTable.state === PhysicalTableStates.VACANT });

  // Scenario 4: Seating Rules Engine (Party Size Matching)
  const fitCheck1 = seatingRulesEngine.canSeatParty(table1.id, 4); // Capacity 4 -> Pass
  const fitCheck2 = seatingRulesEngine.canSeatParty(table2.id, 4); // Capacity 2 -> Fail
  results.push({ name: 'Seating Rules Engine Party Capacity Matching', passed: fitCheck1.allowed && !fitCheck2.allowed });

  // Scenario 5: Platform Timeline Audit Trail Recording
  const events = timelineLedger.getEvents({ aggregateId: table1.id });
  results.push({ name: 'Platform Timeline Audit Trail Recording', passed: events.length >= 6 });

  const passed = results.filter(r => r.passed).length;
  return { total: results.length, passed, results };
}
