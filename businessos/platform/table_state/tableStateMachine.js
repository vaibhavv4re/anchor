/**
 * BusinessOS Platform - 6 Physical Table Runtime State Machine (PD-008)
 * Manages physical asset table states cleanly separated from session milestones.
 * Dynamic state derivation from active guest sessions with ZERO static mock seeds.
 */

import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { sessionModel } from '../session/sessionModel.js';
import { orderModel } from '../ordering/orderModel.js';
import { tableMasterModel } from '../layout/tableMasterModel.js';

export const PhysicalTableStates = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  OCCUPIED: 'OCCUPIED',
  ORDER_IN_PROGRESS: 'ORDER_IN_PROGRESS',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAID_CLEARING: 'PAID_CLEARING',
  CLEANING: 'CLEANING',
  OUT_OF_SERVICE: 'OUT_OF_SERVICE'
});

const AllowedTransitions = {
  [PhysicalTableStates.AVAILABLE]: [PhysicalTableStates.RESERVED, PhysicalTableStates.OCCUPIED, PhysicalTableStates.OUT_OF_SERVICE],
  [PhysicalTableStates.RESERVED]: [PhysicalTableStates.OCCUPIED, PhysicalTableStates.AVAILABLE, PhysicalTableStates.OUT_OF_SERVICE],
  [PhysicalTableStates.OCCUPIED]: [PhysicalTableStates.ORDER_IN_PROGRESS, PhysicalTableStates.PAYMENT_PENDING, PhysicalTableStates.CLEANING, PhysicalTableStates.AVAILABLE],
  [PhysicalTableStates.ORDER_IN_PROGRESS]: [PhysicalTableStates.PAYMENT_PENDING, PhysicalTableStates.CLEANING, PhysicalTableStates.AVAILABLE],
  [PhysicalTableStates.PAYMENT_PENDING]: [PhysicalTableStates.PAID_CLEARING, PhysicalTableStates.CLEANING, PhysicalTableStates.AVAILABLE],
  [PhysicalTableStates.PAID_CLEARING]: [PhysicalTableStates.CLEANING, PhysicalTableStates.AVAILABLE],
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
  getTableRuntimeState(target, tenantId = null) {
    if (target === undefined || target === null) return { currentState: PhysicalTableStates.AVAILABLE };

    const master = tableMasterModel.getTableMaster(target);
    const targetId = master ? master.id : null;
    const tableNum = master ? master.tableNumber : (typeof target === 'number' ? target : parseInt(String(target).replace(/\D/g, ''), 10));
    const str = master ? master.tableCode.toLowerCase() : String(target).trim().toLowerCase();

    const activeSession = sessionModel.getActiveSessionForTable(master ? master.id : target, tenantId);

    if (activeSession) {
      const orders = orderModel.getOrdersForSession(activeSession.id || activeSession.sessionId, tenantId);
      const isPaymentSettled = activeSession.status === 'PAYMENT_RECEIVED' || activeSession.billStatus === 'PAID';
      const isPaymentPending = activeSession.status === 'BILL_GENERATED' || activeSession.billStatus === 'GENERATED';
      const hasConfirmedOrders = Array.isArray(orders) && orders.length > 0;

      let derivedState = PhysicalTableStates.OCCUPIED;
      if (isPaymentSettled) {
        derivedState = PhysicalTableStates.PAID_CLEARING;
      } else if (isPaymentPending) {
        derivedState = PhysicalTableStates.PAYMENT_PENDING;
      } else if (hasConfirmedOrders) {
        derivedState = PhysicalTableStates.ORDER_IN_PROGRESS;
      }

      return {
        tableNumber: activeSession.tableNumber || tableNum || target,
        currentState: derivedState,
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
      (targetId && (s.tableId === targetId || s.table_id === targetId)) ||
      (tableNum !== null && !isNaN(tableNum) && (s.tableNumber === tableNum || s.table_number === tableNum)) ||
      (s.tableCode && String(s.tableCode).toLowerCase() === str)
    );

    if (manualState && (manualState.currentState === PhysicalTableStates.CLEANING || manualState.currentState === PhysicalTableStates.RESERVED || manualState.currentState === PhysicalTableStates.OUT_OF_SERVICE)) {
      return {
        tableNumber: tableNum || target,
        currentState: manualState.currentState,
        currentSessionId: null,
        assignedWaiterId: manualState.assignedWaiterId || null,
        guestCount: 0,
        lastActivityAt: manualState.lastActivityAt || new Date().toISOString(),
        correlationId: manualState.correlationId || null
      };
    }

    return {
      tableNumber: tableNum || target,
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
      tableNumber: updatedRuntime.tableNumber || num || tableNumber,
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
