/**
 * BusinessOS Platform - 6 Physical Table Runtime State Machine (PD-008)
 * Manages physical asset table states cleanly separated from session milestones.
 * Dynamic state derivation from active guest sessions with ZERO static mock seeds.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { sessionModel } from '../session/sessionModel.js';

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
      offlineStore.setCollection('table_runtime_states', []);
    }
  }

  /**
   * Get dynamic table runtime state.
   * Derives state from active sessions first; falls back to manual operational overrides (CLEANING, RESERVED, OUT_OF_SERVICE) or AVAILABLE.
   * @param {number|string} tableNumber 
   * @param {string|null} tenantId 
   * @returns {Object} Runtime state
   */
  getTableRuntimeState(tableNumber, tenantId = null) {
    if (tableNumber === undefined || tableNumber === null) return { currentState: PhysicalTableStates.AVAILABLE };
    const str = String(tableNumber).trim().toLowerCase();
    const digitsOnly = str.replace(/\D/g, '');
    const num = digitsOnly.length > 0 ? parseInt(digitsOnly, 10) : (typeof tableNumber === 'number' ? tableNumber : null);

    const activeSession = sessionModel.getActiveSessionForTable(tableNumber, tenantId);

    if (activeSession) {
      const isPaymentPending = activeSession.status === 'BILL_GENERATED' || activeSession.billStatus === 'GENERATED';
      return {
        tableNumber: activeSession.tableNumber || num || tableNumber,
        currentState: isPaymentPending ? PhysicalTableStates.PAYMENT_PENDING : PhysicalTableStates.OCCUPIED,
        currentSessionId: activeSession.id || activeSession.sessionId,
        assignedWaiterId: activeSession.assignedWaiterId || null,
        guestCount: activeSession.guestCount || 2,
        lastActivityAt: activeSession.lastActivityAt || activeSession.createdAt || new Date().toISOString(),
        correlationId: activeSession.correlationId || null
      };
    }

    // No active session — check manual operational state overrides
    const states = offlineStore.getCollection('table_runtime_states') || [];
    const manualState = states.find(s => 
      (num !== null && (s.tableNumber === num || s.table_number === num)) ||
      (s.tableCode && String(s.tableCode).toLowerCase() === str) ||
      (s.tableNumber && String(s.tableNumber).toLowerCase() === str)
    );

    if (manualState && (manualState.currentState === PhysicalTableStates.CLEANING || manualState.currentState === PhysicalTableStates.RESERVED || manualState.currentState === PhysicalTableStates.OUT_OF_SERVICE)) {
      return {
        tableNumber: num || tableNumber,
        currentState: manualState.currentState,
        currentSessionId: null,
        assignedWaiterId: manualState.assignedWaiterId || null,
        guestCount: 0,
        lastActivityAt: manualState.lastActivityAt || new Date().toISOString(),
        correlationId: manualState.correlationId || null
      };
    }

    return {
      tableNumber: num || tableNumber,
      currentState: PhysicalTableStates.AVAILABLE,
      currentSessionId: null,
      assignedWaiterId: null,
      guestCount: 0,
      lastActivityAt: new Date().toISOString(),
      correlationId: null
    };
  }

  /**
   * Transition a table to a new physical state.
   * @param {number|string} tableNumber 
   * @param {string} newState 
   * @param {Object} options { sessionId, waiterId, actorId }
   * @returns {{ success: boolean, runtime?: Object, error?: string }}
   */
  transitionTableState(tableNumber, newState, { sessionId = null, waiterId = null, actorId = 'SYSTEM' } = {}) {
    if (tableNumber === undefined || tableNumber === null) return { success: false, error: 'Invalid tableNumber' };
    const str = String(tableNumber).trim().toLowerCase();
    const digitsOnly = str.replace(/\D/g, '');
    const num = digitsOnly.length > 0 ? parseInt(digitsOnly, 10) : (typeof tableNumber === 'number' ? tableNumber : null);

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
      tableNumber: currentRuntime.tableNumber || num || tableNumber,
      currentState: newState,
      currentSessionId: sessionId !== null ? sessionId : (newState === PhysicalTableStates.AVAILABLE ? null : currentRuntime.currentSessionId),
      assignedWaiterId: waiterId !== null ? waiterId : (newState === PhysicalTableStates.AVAILABLE ? null : currentRuntime.assignedWaiterId),
      lastActivityAt: new Date().toISOString()
    };

    const allStates = offlineStore.getCollection('table_runtime_states') || [];
    const index = allStates.findIndex(s => 
      (num !== null && (s.tableNumber === num || s.table_number === num)) ||
      (s.tableCode && String(s.tableCode).toLowerCase() === str) ||
      (s.tableNumber && String(s.tableNumber).toLowerCase() === str)
    );
    if (index >= 0) {
      allStates[index] = updatedRuntime;
    } else {
      allStates.push(updatedRuntime);
    }
    offlineStore.setCollection('table_runtime_states', allStates);

    // Publish platform event
    platformEventBus.publish('table:state:changed', {
      tableNumber: tableNum,
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
