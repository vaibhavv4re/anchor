/**
 * BusinessOS Platform - 6 Physical Table Runtime State Machine (PD-008)
 * Manages physical asset table states cleanly separated from session milestones.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus, PlatformEventTypes } from '../events/platformEvents.js';

export const PhysicalTableStates = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  OCCUPIED: 'OCCUPIED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  CLEANING: 'CLEANING',
  OUT_OF_SERVICE: 'OUT_OF_SERVICE'
});

export const TableStateColors = Object.freeze({
  AVAILABLE: '#10b981',      // 🟢 Emerald Green
  RESERVED: '#3b82f6',       // 🔵 Blue
  OCCUPIED: '#8b5cf6',       // 🟣 Purple
  PAYMENT_PENDING: '#f59e0b',// 🟡 Yellow/Amber
  CLEANING: '#6b7280',       // ⚪ Slate Gray
  OUT_OF_SERVICE: '#ef4444'  // 🔴 Red
});

const AllowedTransitions = {
  [PhysicalTableStates.AVAILABLE]: [PhysicalTableStates.RESERVED, PhysicalTableStates.OCCUPIED, PhysicalTableStates.OUT_OF_SERVICE],
  [PhysicalTableStates.RESERVED]: [PhysicalTableStates.OCCUPIED, PhysicalTableStates.AVAILABLE, PhysicalTableStates.OUT_OF_SERVICE],
  [PhysicalTableStates.OCCUPIED]: [PhysicalTableStates.PAYMENT_PENDING, PhysicalTableStates.CLEANING, PhysicalTableStates.AVAILABLE],
  [PhysicalTableStates.PAYMENT_PENDING]: [PhysicalTableStates.CLEANING, PhysicalTableStates.AVAILABLE],
  [PhysicalTableStates.CLEANING]: [PhysicalTableStates.AVAILABLE, PhysicalTableStates.OUT_OF_SERVICE],
  [PhysicalTableStates.OUT_OF_SERVICE]: [PhysicalTableStates.AVAILABLE, PhysicalTableStates.CLEANING]
};

class TableStateMachine {
  constructor() {
    this._initSeedData();
  }

  _initSeedData() {
    if (!offlineStore.getCollection('table_runtime_states')) {
      // Seed default initial runtime state for all tables as AVAILABLE
      const initialRuntime = [
        { tableNumber: 1, currentState: PhysicalTableStates.AVAILABLE, currentSessionId: null, assignedWaiterId: null, lastActivityAt: new Date().toISOString() },
        { tableNumber: 2, currentState: PhysicalTableStates.AVAILABLE, currentSessionId: null, assignedWaiterId: null, lastActivityAt: new Date().toISOString() },
        { tableNumber: 3, currentState: PhysicalTableStates.OCCUPIED, currentSessionId: 'sess_1001', assignedWaiterId: 'emp-rahul', lastActivityAt: new Date().toISOString() },
        { tableNumber: 4, currentState: PhysicalTableStates.PAYMENT_PENDING, currentSessionId: 'sess_1002', assignedWaiterId: 'emp-rahul', lastActivityAt: new Date().toISOString() },
        { tableNumber: 5, currentState: PhysicalTableStates.CLEANING, currentSessionId: null, assignedWaiterId: null, lastActivityAt: new Date().toISOString() },
        { tableNumber: 6, currentState: PhysicalTableStates.AVAILABLE, currentSessionId: null, assignedWaiterId: null, lastActivityAt: new Date().toISOString() },
        { tableNumber: 101, currentState: PhysicalTableStates.AVAILABLE, currentSessionId: null, assignedWaiterId: null, lastActivityAt: new Date().toISOString() },
        { tableNumber: 102, currentState: PhysicalTableStates.RESERVED, currentSessionId: null, assignedWaiterId: null, lastActivityAt: new Date().toISOString() },
        { tableNumber: 103, currentState: PhysicalTableStates.AVAILABLE, currentSessionId: null, assignedWaiterId: null, lastActivityAt: new Date().toISOString() },
        { tableNumber: 201, currentState: PhysicalTableStates.AVAILABLE, currentSessionId: null, assignedWaiterId: null, lastActivityAt: new Date().toISOString() },
        { tableNumber: 202, currentState: PhysicalTableStates.AVAILABLE, currentSessionId: null, assignedWaiterId: null, lastActivityAt: new Date().toISOString() },
        { tableNumber: 301, currentState: PhysicalTableStates.AVAILABLE, currentSessionId: null, assignedWaiterId: null, lastActivityAt: new Date().toISOString() },
        { tableNumber: 302, currentState: PhysicalTableStates.AVAILABLE, currentSessionId: null, assignedWaiterId: null, lastActivityAt: new Date().toISOString() },
        { tableNumber: 303, currentState: PhysicalTableStates.AVAILABLE, currentSessionId: null, assignedWaiterId: null, lastActivityAt: new Date().toISOString() }
      ];
      offlineStore.setCollection('table_runtime_states', initialRuntime);
    }
  }

  getTableRuntimeState(tableNumber) {
    const states = offlineStore.getCollection('table_runtime_states') || [];
    return states.find(s => s.tableNumber === parseInt(tableNumber)) || {
      tableNumber: parseInt(tableNumber),
      currentState: PhysicalTableStates.AVAILABLE,
      currentSessionId: null,
      assignedWaiterId: null,
      lastActivityAt: new Date().toISOString()
    };
  }

  /**
   * Transition a table to a new physical state.
   */
  transitionTableState(tableNumber, newState, { sessionId = null, waiterId = null, actorId = 'SYSTEM' } = {}) {
    const currentRuntime = this.getTableRuntimeState(tableNumber);
    const currentState = currentRuntime.currentState;

    if (currentState === newState) return { success: true, runtime: currentRuntime };

    const validTransitions = AllowedTransitions[currentState] || [];
    if (!validTransitions.includes(newState)) {
      return { 
        success: false, 
        error: `Invalid table state transition from ${currentState} to ${newState}` 
      };
    }

    const updatedRuntime = {
      ...currentRuntime,
      currentState: newState,
      currentSessionId: sessionId !== null ? sessionId : (newState === PhysicalTableStates.AVAILABLE ? null : currentRuntime.currentSessionId),
      assignedWaiterId: waiterId !== null ? waiterId : (newState === PhysicalTableStates.AVAILABLE ? null : currentRuntime.assignedWaiterId),
      lastActivityAt: new Date().toISOString()
    };

    const allStates = offlineStore.getCollection('table_runtime_states') || [];
    const index = allStates.findIndex(s => s.tableNumber === parseInt(tableNumber));
    if (index >= 0) {
      allStates[index] = updatedRuntime;
    } else {
      allStates.push(updatedRuntime);
    }
    offlineStore.setCollection('table_runtime_states', allStates);

    // Publish platform event
    platformEventBus.publish('table:state:changed', {
      tableNumber: parseInt(tableNumber),
      previousState: currentState,
      newState,
      sessionId: updatedRuntime.currentSessionId,
      waiterId: updatedRuntime.assignedWaiterId,
      actorId,
      timestamp: updatedRuntime.lastActivityAt
    });

    return { success: true, runtime: updatedRuntime };
  }
}

export const tableStateMachine = new TableStateMachine();
