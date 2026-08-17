/**
 * BusinessOS Platform - Table Runtime Projection Service (PD-006 & PD-009)
 * Frozen TableProjection Schema Contract & Primary Action Engine.
 */

import { tableMasterModel } from '../layout/tableMasterModel.js';
import { tableStateMachine, TableStateColors, PhysicalTableStates } from './tableStateMachine.js';
import { diningAreaModel } from '../layout/diningAreaModel.js';
import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

class TableProjectionService {
  constructor() {
    this._initSubscriber();
  }

  _initSubscriber() {
    platformEventBus.subscribe('table:state:changed', (envelope) => {
      const projection = this.getTableProjection(envelope.payload.tableNumber);
      platformEventBus.publish('table:projection:updated', projection);
    });
  }

  /**
   * Primary Action Engine - Determines the primary operational action based on physical state.
   */
  getPrimaryAction(physicalState) {
    switch (physicalState) {
      case PhysicalTableStates.AVAILABLE:
        return { type: 'SEAT_GUESTS', label: 'Seat Guests' };
      case PhysicalTableStates.RESERVED:
        return { type: 'SEAT_GUESTS', label: 'Seat Reserved Guests' };
      case PhysicalTableStates.OCCUPIED:
        return { type: 'OPEN_SESSION', label: 'Open Session & Service' };
      case PhysicalTableStates.PAYMENT_PENDING:
        return { type: 'OPEN_BILL', label: 'View Bill & Collect Payment' };
      case PhysicalTableStates.CLEANING:
        return { type: 'MARK_CLEAN', label: 'Mark Table Clean & Ready' };
      case PhysicalTableStates.OUT_OF_SERVICE:
        return { type: 'RESTORE_SERVICE', label: 'Restore to Service' };
      default:
        return { type: 'NONE', label: 'View Details' };
    }
  }

  /**
   * Generates a frozen schema TableProjection object.
   * @param {Object|string|number} target 
   * @returns {Object} TableProjection
   */
  getTableProjection(target) {
    const master = typeof target === 'object' ? target : tableMasterModel.getTableMaster(target);
    if (!master) return null;

    const runtime = tableStateMachine.getTableRuntimeState(master.tableNumber || master.id);
    const area = diningAreaModel.getArea(master.areaId);
    const employees = offlineStore.getCollection('employees') || [];
    const waiter = (runtime && runtime.assignedWaiterId) ? employees.find(e => e.id === runtime.assignedWaiterId) : null;

    const currentState = (runtime && runtime.currentState) ? runtime.currentState : PhysicalTableStates.AVAILABLE;
    const elapsedMs = (runtime && runtime.lastActivityAt) ? (new Date() - new Date(runtime.lastActivityAt)) : 0;
    const elapsedMin = Math.floor(elapsedMs / (1000 * 60));

    return {
      tableId: master.id || `tbl_${master.tableNumber}`,
      tableNumber: master.tableNumber || master.id,
      tableLabel: master.tableCode || master.tableNumber || master.id,
      areaId: master.areaId,
      areaName: area ? area.name : master.areaId,
      shape: master.shape || 'SQUARE',
      capacity: master.seats || 4,
      maxCapacity: master.maxSeats || 6,
      physicalState: currentState,
      stateColor: TableStateColors[currentState] || '#10b981',
      currentSessionId: runtime ? runtime.currentSessionId : null,
      assignedWaiterId: runtime ? runtime.assignedWaiterId : null,
      assignedWaiterName: waiter ? waiter.name : null,
      guestCount: runtime ? (runtime.guestCount || 0) : 0,
      elapsedTime: `${elapsedMin} min`,
      lastActivity: runtime ? runtime.lastActivityAt : null,
      primaryAction: this.getPrimaryAction(currentState),
      notificationCount: 0,
      isReserved: currentState === PhysicalTableStates.RESERVED,
      isMergeable: !!master.isMergeable,
      mergedGroupId: master.mergedGroupId || null,
      lastUpdated: new Date().toISOString(),
      correlationId: (runtime && runtime.correlationId) ? runtime.correlationId : 'corr_gen_' + (master.tableNumber || master.id)
    };
  }

  getProjectionsByArea(areaId) {
    const masterTables = tableMasterModel.getTablesByArea(areaId);
    return masterTables.map(m => this.getTableProjection(m)).filter(Boolean);
  }

  getAllProjections() {
    const masterTables = tableMasterModel.getAllMasterTables();
    return masterTables.map(m => this.getTableProjection(m)).filter(Boolean);
  }
}

export const tableProjectionService = new TableProjectionService();
