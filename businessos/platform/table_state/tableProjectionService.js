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
   * @param {number} tableNumber 
   * @returns {Object} TableProjection
   */
  getTableProjection(tableNumber) {
    const master = tableMasterModel.getTableMaster(tableNumber);
    const runtime = tableStateMachine.getTableRuntimeState(tableNumber);

    if (!master) return null;

    const area = diningAreaModel.getArea(master.areaId);
    const employees = offlineStore.getCollection('employees') || [];
    const waiter = runtime.assignedWaiterId ? employees.find(e => e.id === runtime.assignedWaiterId) : null;

    const elapsedMs = runtime.lastActivityAt ? (new Date() - new Date(runtime.lastActivityAt)) : 0;
    const elapsedMin = Math.floor(elapsedMs / (1000 * 60));

    return {
      tableId: `tbl_${master.tableNumber}`,
      tableNumber: master.tableNumber,
      areaId: master.areaId,
      areaName: area ? area.name : master.areaId,
      shape: master.shape,
      capacity: master.seats,
      maxCapacity: master.maxSeats,
      physicalState: runtime.currentState,
      stateColor: TableStateColors[runtime.currentState] || '#6b7280',
      currentSessionId: runtime.currentSessionId,
      assignedWaiterId: runtime.assignedWaiterId,
      assignedWaiterName: waiter ? waiter.name : null,
      guestCount: runtime.guestCount || 0,
      elapsedTime: `${elapsedMin} min`,
      lastActivity: runtime.lastActivityAt,
      primaryAction: this.getPrimaryAction(runtime.currentState),
      notificationCount: 0,
      isReserved: runtime.currentState === PhysicalTableStates.RESERVED,
      isMergeable: master.isMergeable,
      mergedGroupId: master.mergedGroupId,
      lastUpdated: new Date().toISOString(),
      correlationId: runtime.correlationId || 'corr_gen_' + master.tableNumber
    };
  }

  getProjectionsByArea(areaId) {
    const masterTables = tableMasterModel.getTablesByArea(areaId);
    return masterTables.map(m => this.getTableProjection(m.tableNumber));
  }

  getAllProjections() {
    const masterTables = tableMasterModel.getAllMasterTables();
    return masterTables.map(m => this.getTableProjection(m.tableNumber));
  }
}

export const tableProjectionService = new TableProjectionService();
