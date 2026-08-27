/**
 * BusinessOS Platform - Table Runtime Projection Service (PD-006 & PD-009)
 * Frozen TableProjection Schema Contract & Primary Action Engine.
 */

import { tableMasterModel } from '../layout/tableMasterModel.js';
import { tableStateMachine, PhysicalTableStates } from './tableStateMachine.js';
import { diningAreaModel } from '../layout/diningAreaModel.js';
import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';

class TableProjectionService {
  constructor() {
    this._initSubscriber();
  }

  _initSubscriber() {
    platformEventBus.subscribe('table:state:changed', (envelope) => {
      const payload = envelope.payload || envelope;
      const projection = this.getTableProjection(payload.tableNumber);
      if (projection) platformEventBus.publish('table:projection:updated', projection);
    });

    platformEventBus.subscribe('session:created', (envelope) => {
      const payload = envelope.payload || envelope;
      if (payload.tableNumber) {
        const projection = this.getTableProjection(payload.tableNumber);
        if (projection) platformEventBus.publish('table:projection:updated', projection);
      }
    });

    platformEventBus.subscribe('session:milestone:changed', (envelope) => {
      const payload = envelope.payload || envelope;
      if (payload.tableNumber) {
        const projection = this.getTableProjection(payload.tableNumber);
        if (projection) platformEventBus.publish('table:projection:updated', projection);
      }
    });

    platformEventBus.subscribe('order:confirmed', (envelope) => {
      const payload = envelope.payload || envelope;
      if (payload.tableNumber) {
        const projection = this.getTableProjection(payload.tableNumber);
        if (projection) platformEventBus.publish('table:projection:updated', projection);
      }
    });

    platformEventBus.subscribe('bill:settled', (envelope) => {
      const payload = envelope.payload || envelope;
      if (payload.tableNumber) {
        const projection = this.getTableProjection(payload.tableNumber);
        if (projection) platformEventBus.publish('table:projection:updated', projection);
      }
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
      case PhysicalTableStates.ORDER_IN_PROGRESS:
        return { type: 'OPEN_SESSION', label: 'Open Service & Add Orders' };
      case PhysicalTableStates.PAYMENT_PENDING:
        return { type: 'VIEW_BILL', label: 'Awaiting Cashier Settlement' };
      case PhysicalTableStates.PAID_CLEARING:
        return { type: 'CLOSE_SESSION', label: 'Close Session & Clear Table' };
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
   * @param {string|null} tenantId 
   * @returns {Object|null} TableProjection
   */
  getTableProjection(target, tenantId = null) {
    const master = typeof target === 'object' ? target : tableMasterModel.getTableMaster(target);
    if (!master) return null;

    const targetTenantId = master.tenantId || tenantId;
    const runtime = tableStateMachine.getTableRuntimeState(master.tableNumber || master.id, targetTenantId);
    const area = diningAreaModel.getArea(master.areaId);
    const employees = offlineStore.getCollection('employees', targetTenantId) || offlineStore.getCollection('employees') || [];
    const waiter = (runtime && runtime.assignedWaiterId) 
      ? employees.find(e => e.id === runtime.assignedWaiterId || e.employeeId === runtime.assignedWaiterId || e.name === runtime.assignedWaiterId || e.employee_code === runtime.assignedWaiterId) 
      : null;

    const currentState = (runtime && runtime.currentState) ? runtime.currentState : PhysicalTableStates.AVAILABLE;
    const elapsedMs = (runtime && runtime.lastActivityAt) ? (Date.now() - new Date(runtime.lastActivityAt).getTime()) : 0;
    const elapsedMin = Math.max(0, Math.floor(elapsedMs / (1000 * 60)));

    return {
      tableId: master.id || `tbl_${master.tableNumber}`,
      tableNumber: master.tableNumber || master.id,
      tableLabel: master.tableCode || `T-${String(master.tableNumber || 1).padStart(2, '0')}`,
      areaId: master.areaId,
      areaName: area ? (area.name || area.areaName) : master.areaId,
      shape: master.shape || 'SQUARE',
      capacity: master.seats || 4,
      maxCapacity: master.maxSeats || 6,
      physicalState: currentState,
      currentSessionId: runtime ? runtime.currentSessionId : null,
      assignedWaiterId: runtime ? runtime.assignedWaiterId : null,
      assignedWaiterName: waiter ? waiter.name : (runtime?.assignedWaiterId || null),
      guestCount: runtime ? (runtime.guestCount || 0) : 0,
      elapsedTime: `${elapsedMin} min`,
      lastActivity: runtime ? runtime.lastActivityAt : null,
      primaryAction: this.getPrimaryAction(currentState),
      notificationCount: 0,
      isReserved: currentState === PhysicalTableStates.RESERVED,
      isMergeable: master.isMergeable !== false,
      mergedGroupId: master.mergedGroupId || null,
      tenantId: targetTenantId,
      lastUpdated: new Date().toISOString(),
      correlationId: (runtime && runtime.correlationId) ? runtime.correlationId : 'corr_gen_' + (master.tableNumber || master.id)
    };
  }

  getProjectionsByArea(areaId, tenantId = null) {
    const masterTables = tableMasterModel.getTablesByArea(areaId);
    return masterTables.map(m => this.getTableProjection(m, tenantId)).filter(Boolean);
  }

  getAllProjections(tenantId = null) {
    const masterTables = tableMasterModel.getAllMasterTables();
    return masterTables.map(m => this.getTableProjection(m, tenantId)).filter(Boolean);
  }
}

export const tableProjectionService = new TableProjectionService();
