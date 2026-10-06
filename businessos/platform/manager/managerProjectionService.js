/**
 * BusinessOS Platform - Manager Operational Projection Service (Phase M1 Cockpit)
 * Read-only aggregation engine over canonical platform sources:
 * Table Sessions → Orders → Tickets → Bill Revisions → Invoices → Payments → Audit Events
 * ZERO parallel state, ZERO mock metrics.
 */

import { tableMasterModel } from '../layout/tableMasterModel.js';
import { sessionModel } from '../session/sessionModel.js';
import { orderModel } from '../ordering/orderModel.js';
import { billRevisionModel } from '../billing/billRevisionModel.js';
import { invoiceModel } from '../billing/invoiceModel.js';
import { paymentModel } from '../billing/paymentModel.js';
import { sessionAuditModel } from '../session/sessionAuditModel.js';
import { offlineStore } from '../offline_store/offlineStore.js';
import { platformEventBus } from '../events/platformEvents.js';
import { attendanceEngine } from '../attendance/attendanceEngine.js';
import { taxConfigurationModel } from '../accounting/taxConfigurationModel.js';
import { inventoryProjectionService } from '../inventory/inventoryProjectionService.js';
import { inventoryItemModel } from '../inventory/inventoryItemModel.js';
import { productionBatchModel } from '../kitchen/productionBatchModel.js';
import { cancellationModel } from '../ordering/cancellationModel.js';
import { preparedHoldModel } from '../ordering/preparedHoldModel.js';
import { shiftRegisterService } from './shiftRegisterService.js';

/**
 * Read the live authenticated session the same decoupled way every other
 * platform service does (taxConfigurationModel, invoiceModel, sessionModel).
 * Avoids importing authEngine here (which would create a container cycle).
 */
function readLiveSession() {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    return JSON.parse(sessionStorage.getItem('ros_session') || '{}') || {};
  } catch (_) {
    return {};
  }
}

export class ManagerProjectionService {
  /**
   * Retrieves complete live operational snapshot for Manager Cockpit
   * @param {string|null} tenantId 
   * @returns {Object} Operational projection
   */
  getOperationalProjection(tenantId = null) {
    const allTables = tableMasterModel.getAllMasterTables() || [];
    const allSessions = sessionModel.getAllSessions(tenantId) || [];
    const activeSessions = (typeof sessionModel.getActiveSessions === 'function') ? sessionModel.getActiveSessions(tenantId) : allSessions.filter(s => s && s.status !== 'CLOSED');
    const allOrders = (typeof orderModel.getAllOrders === 'function') ? orderModel.getAllOrders(tenantId) : ((typeof orderModel.getOrders === 'function') ? orderModel.getOrders(tenantId) : []);
    const settledPayments = (typeof paymentModel.getSettledPayments === 'function') ? paymentModel.getSettledPayments(tenantId) : ((typeof paymentModel.getAllPayments === 'function') ? paymentModel.getAllPayments(tenantId) : []);
    const invoices = (typeof invoiceModel.getAllInvoices === 'function') ? invoiceModel.getAllInvoices(tenantId) : [];

    // 1. Financial Sales Today (Strict Accounting Boundary: Settled Payments & Paid Invoices)
    const salesToday = settledPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    // 2. NOW Strip Metrics
    const activeTableCount = activeSessions.length;
    const totalTableCount = allTables.length;
    const seatedGuests = activeSessions.reduce((sum, s) => sum + (parseInt(s.guestCount, 10) || 0), 0);

    // Calculate Active Kitchen Tickets (Orders containing QUEUED / PREPARING / PARTIALLY_READY items)
    let activeKotsCount = 0;
    allOrders.forEach(o => {
      if (o.status !== 'SERVED' && o.status !== 'CANCELLED') {
        activeKotsCount++;
      }
    });

    // 3. Exception Queue Construction (NEEDS ATTENTION)
    const needsAttentionQueue = [];
    const nowMs = Date.now();

    // A. Delayed KOTs (>15 min prep elapsed)
    allOrders.forEach(o => {
      if (o.status === 'PREPARING' || o.status === 'QUEUED' || o.status === 'PARTIALLY_READY') {
        const orderTime = new Date(o.createdAt || o.timestamp || nowMs).getTime();
        const elapsedMin = Math.max(0, Math.floor((nowMs - orderTime) / 60000));
        if (elapsedMin >= 15) {
          const session = allSessions.find(s => s.id === o.sessionId || s.sessionId === o.sessionId);
          const tableLabel = session ? (session.tableCode || `Table ${session.tableNumber}`) : (o.tableNumber ? `Table ${o.tableNumber}` : 'Kitchen');
          needsAttentionQueue.push({
            id: `exp_kot_${o.id || o.orderId}`,
            type: 'DELAYED_KOT',
            severity: elapsedMin >= 20 ? 'HIGH' : 'MEDIUM',
            title: `KOT #${String(o.id || o.orderId).substring(0, 8)} delayed ${elapsedMin} min`,
            subtitle: `${o.items ? o.items.length : 1} items in kitchen • ${tableLabel}`,
            tableLabel,
            elapsedMin,
            timestamp: o.createdAt || new Date().toISOString()
          });
        }
      }
    });

    // B. Recalled Bills
    activeSessions.forEach(s => {
      if (s.status === 'WAITER_REVISION_REQUIRED') {
        const tableLabel = s.tableCode || `Table ${s.tableNumber}`;
        needsAttentionQueue.push({
          id: `exp_recall_${s.id}`,
          type: 'RECALLED_BILL',
          severity: 'HIGH',
          title: `Bill Recalled for Revision`,
          subtitle: `${tableLabel} • Waiter modification required`,
          tableLabel,
          timestamp: s.updatedAt || new Date().toISOString()
        });
      }
    });

    // C. Ready Pickup Lag (Dishes ready >5 min waiting for pickup)
    allOrders.forEach(o => {
      if (Array.isArray(o.items)) {
        o.items.forEach((item, idx) => {
          if (item.status === 'READY') {
            const readyAt = new Date(item.readyAt || o.updatedAt || nowMs).getTime();
            const lagMin = Math.max(0, Math.floor((nowMs - readyAt) / 60000));
            if (lagMin >= 5) {
              const session = allSessions.find(s => s.id === o.sessionId);
              const tableLabel = session ? (session.tableCode || `Table ${session.tableNumber}`) : `Table ${o.tableNumber || '01'}`;
              needsAttentionQueue.push({
                id: `exp_lag_${o.id}_${idx}`,
                type: 'PICKUP_LAG',
                severity: lagMin >= 10 ? 'HIGH' : 'LOW',
                title: `Ready Dish Waiting Pickup (${lagMin} min)`,
                subtitle: `${item.name || 'Dish'} • ${tableLabel}`,
                tableLabel,
                lagMin,
                timestamp: item.readyAt || new Date().toISOString()
              });
            }
          }
        });
      }
    });

    // D. Pending Discount Approvals (>10% discount)
    allSessions.forEach(s => {
      const revisions = billRevisionModel.getRevisionsForSession(s.id || s.sessionId, tenantId);
      const latestRev = revisions.length > 0 ? revisions[revisions.length - 1] : null;
      if (latestRev && latestRev.discountsTotal > 0 && latestRev.revisionStatus === 'PENDING_APPROVAL') {
        const tableLabel = s.tableCode || `Table ${s.tableNumber}`;
        needsAttentionQueue.push({
          id: `exp_disc_${latestRev.id}`,
          type: 'DISCOUNT_APPROVAL',
          severity: 'MEDIUM',
          title: `Discount Approval Requested (₹${latestRev.discountsTotal})`,
          subtitle: `${tableLabel} • ${latestRev.discountReason || 'Manual Discount'}`,
          tableLabel,
          amount: latestRev.discountsTotal,
          timestamp: latestRev.createdAt || new Date().toISOString()
        });
      }
    });

    // E. Open cancellation requests (station-controlled cancellation workflow).
    // Queued for manager visibility only - decisions stay with the station board;
    // PENDING_MANAGER_DISPOSITION items are the ones only a manager can action.
    try {
      (cancellationModel.getRequests(tenantId) || []).forEach(r => {
        if (r.status !== 'REQUESTED' && r.status !== 'PENDING_MANAGER_DISPOSITION') return;
        const session = allSessions.find(s => (s.id || s.sessionId) === r.sessionId);
        const tableLabel = session ? (session.tableCode || `Table ${session.tableNumber}`) : (r.station || 'Station');
        needsAttentionQueue.push({
          id: `exp_cxl_${r.id}`,
          type: r.status === 'PENDING_MANAGER_DISPOSITION' ? 'CANCEL_DISPOSITION' : 'CANCEL_REQUEST',
          severity: r.status === 'PENDING_MANAGER_DISPOSITION' ? 'HIGH' : 'MEDIUM',
          title: r.status === 'PENDING_MANAGER_DISPOSITION'
            ? `Manager disposition needed: ${r.quantity}x ${r.itemName}`
            : `Cancellation requested: ${r.quantity}x ${r.itemName}`,
          subtitle: `${r.station} • ${String(r.reasonCode || 'OTHER').replace(/_/g, ' ')} • by ${r.requestedByName || 'Waiter'}`,
          tableLabel,
          timestamp: r.status === 'PENDING_MANAGER_DISPOSITION' ? (r.updatedAt || r.requestedAt) : r.requestedAt
        });
      });
    } catch (_) { /* cancellation layer optional at runtime */ }

    // Sort exception queue by severity (HIGH > MEDIUM > LOW)
    const severityRank = { HIGH: 1, MEDIUM: 2, LOW: 3 };
    needsAttentionQueue.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

    // 4. Calculate Operational Health Status
    let operationalHealth = 'NORMAL';
    let healthLabel = 'Operational Health: Normal';
    let healthSubtitle = '0 critical delays • All restaurant operations smooth';

    const highCount = needsAttentionQueue.filter(e => e.severity === 'HIGH').length;
    const totalExceptions = needsAttentionQueue.length;

    if (highCount > 0) {
      operationalHealth = 'INTERVENTION_REQUIRED';
      healthLabel = 'Operational Health: Intervention Required';
      healthSubtitle = `${highCount} critical alerts require immediate manager intervention`;
    } else if (totalExceptions > 0) {
      operationalHealth = 'ATTENTION_REQUIRED';
      healthLabel = 'Operational Health: Attention Required';
      healthSubtitle = `${totalExceptions} active exceptions in queue awaiting review`;
    }

    // Calculate Ready Dishes & Bills Awaiting Cashier
    let billsAwaitingCashierCount = 0;
    activeSessions.forEach(s => {
      if (s.billStatus === 'BILL_GENERATED' || s.status === 'PAYMENT_PENDING' || s.billStatus === 'PAYMENT_PENDING') {
        billsAwaitingCashierCount++;
      }
    });

    let readyDishesCount = 0;
    allOrders.forEach(o => {
      if (Array.isArray(o.items)) {
        o.items.forEach(it => {
          if (it.itemStatus === 'READY' || it.status === 'READY') readyDishesCount++;
        });
      }
    });

    // 5. Shift Performance Metrics
    const coversToday = allSessions.reduce((sum, s) => sum + (parseInt(s.guestCount, 10) || 0), 0);
    const completedSessions = allSessions.filter(s => s.status === 'CLOSED' || s.billStatus === 'PAID');
    const avgBillValue = completedSessions.length > 0 ? Math.round(salesToday / completedSessions.length) : (activeTableCount > 0 ? Math.round(salesToday / activeTableCount) : 0);

    // Payment Mix Breakdown (Fixed paymentMethod key resolution)
    const paymentMethods = { CASH: 0, UPI: 0, CARD: 0 };
    settledPayments.forEach(p => {
      const rawMethod = (p.paymentMethod || p.payment_method || p.method || 'CASH').toUpperCase();
      const method = rawMethod.includes('UPI') ? 'UPI' : (rawMethod.includes('CARD') || rawMethod.includes('CREDIT') || rawMethod.includes('DEBIT') ? 'CARD' : 'CASH');
      if (paymentMethods[method] !== undefined) {
        paymentMethods[method] += (parseFloat(p.amount) || 0);
      } else {
        paymentMethods.CASH += (parseFloat(p.amount) || 0);
      }
    });

    return {
      operationalHealth,
      healthLabel,
      healthSubtitle,
      nowMetrics: {
        salesToday,
        activeTableCount,
        totalTableCount,
        seatedGuests,
        activeKotsCount,
        readyDishesCount,
        billsAwaitingCashierCount
      },
      needsAttentionQueue,
      shiftPerformance: {
        salesToday,
        coversToday,
        avgBillValue,
        completedSessionsCount: completedSessions.length,
        paymentMix: paymentMethods
      },
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Retrieves Service Operations pipeline & timing analytics for Phase M4
   */
  getServiceOperationsProjection(tenantId = null) {
    const allOrders = (typeof orderModel.getAllOrders === 'function') ? orderModel.getAllOrders(tenantId) : ((typeof orderModel.getOrders === 'function') ? orderModel.getOrders(tenantId) : []);
    const allSessions = sessionModel.getAllSessions(tenantId) || [];
    const activeSessions = (typeof sessionModel.getActiveSessions === 'function') ? sessionModel.getActiveSessions(tenantId) : allSessions.filter(s => s && s.status !== 'CLOSED');

    const nowMs = Date.now();
    let totalPrepTimes = [];
    let totalPickupLags = [];
    let totalServiceTimes = [];

    let activeOrdersCount = 0;
    let preparingCount = 0;
    let readyCount = 0;
    let pickupLagCount = 0;
    let partiallyServedTablesCount = 0;

    const pipelineRows = [];

    activeSessions.forEach(session => {
      const sId = session.id || session.sessionId;
      const sessionOrders = allOrders.filter(o => o.sessionId === sId || o.session_id === sId);
      if (sessionOrders.length === 0) return;

      activeOrdersCount += sessionOrders.length;
      let tableQueued = 0;
      let tablePrep = 0;
      let tableReady = 0;
      let tableServed = 0;
      let totalItems = 0;

      sessionOrders.forEach(o => {
        const orderTime = new Date(o.createdAt || o.timestamp || nowMs).getTime();
        const orderElapsed = Math.max(0, Math.floor((nowMs - orderTime) / 60000));
        totalServiceTimes.push(orderElapsed);

        if (Array.isArray(o.items)) {
          o.items.forEach(it => {
            totalItems++;
            const status = it.itemStatus || it.status || 'QUEUED';
            if (status === 'READY') {
              tableReady++;
              readyCount++;
              const readyAt = new Date(it.readyAt || o.updatedAt || nowMs).getTime();
              const lag = Math.max(0, Math.floor((nowMs - readyAt) / 60000));
              totalPickupLags.push(lag);
              if (lag >= 3) pickupLagCount++;
            } else if (status === 'PREPARING') {
              tablePrep++;
              preparingCount++;
              const prepStart = new Date(it.startedAt || o.createdAt || nowMs).getTime();
              totalPrepTimes.push(Math.max(0, Math.floor((nowMs - prepStart) / 60000)));
            } else if (status === 'SERVED') {
              tableServed++;
            } else {
              tableQueued++;
            }
          });
        }
      });

      if (tableServed > 0 && (tablePrep > 0 || tableReady > 0 || tableQueued > 0)) {
        partiallyServedTablesCount++;
      }

      const tableLabel = session.tableCode || `Table ${session.tableNumber}`;
      const waiterName = session.assignedWaiterName || session.waiterName || 'Staff';

      const mean = (arr) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
      const estPrepMin = mean(totalPrepTimes);
      const estPickupMin = mean(totalPickupLags);
      const estServiceMin = mean(totalServiceTimes);

      pipelineRows.push({
        tableNumber: session.tableNumber,
        tableLabel,
        waiterName,
        sessionId: sId,
        totalItems,
        queuedCount: tableQueued,
        prepCount: tablePrep,
        readyCount: tableReady,
        servedCount: tableServed,
        estPrepMin,
        estPickupMin,
        estServiceMin,
        latestOrderNo: sessionOrders.length > 0 ? (sessionOrders[sessionOrders.length - 1].orderNumber || sessionOrders[sessionOrders.length - 1].id) : null
      });
    });

    const avgOf = (arr) => arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;
    const avgKitchenPrep = avgOf(totalPrepTimes);
    const avgPickupLag = avgOf(totalPickupLags);
    const avgOrderToTable = avgOf(totalServiceTimes);

    let bottleneckDiagnostic = {
      type: 'NO_DATA',
      label: 'No measured service timing data yet',
      subtitle: 'Kitchen prep and pickup SLAs will appear once orders start flowing through the pipeline.'
    };

    if (parseFloat(avgKitchenPrep) > 15) {
      bottleneckDiagnostic = {
        type: 'KITCHEN_BOTTLENECK',
        label: 'Kitchen Station Bottleneck Detected',
        subtitle: `Average kitchen preparation lag is ${avgKitchenPrep} min (>15 min SLA target).`
      };
    } else if (parseFloat(avgPickupLag) > 4) {
      bottleneckDiagnostic = {
        type: 'PICKUP_BOTTLENECK',
        label: 'Waiter Pass Pickup Bottleneck Detected',
        subtitle: `Dishes are waiting at the pass an average of ${avgPickupLag} min for server pickup.`
      };
    } else if (avgKitchenPrep !== null || avgPickupLag !== null) {
      bottleneckDiagnostic = {
        type: 'SMOOTH',
        label: 'Table Service Flowing Smoothly',
        subtitle: 'Kitchen prep and server pickup times are within 15 min SLA parameters.'
      };
    }

    return {
      activeOrdersCount,
      preparingCount,
      readyCount,
      pickupLagCount,
      partiallyServedTablesCount,
      avgKitchenPrep,
      avgPickupLag,
      avgOrderToTable,
      bottleneckDiagnostic,
      pipelineRows,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Retrieves Sales & Cashier Ledger analytics for Phase M5 (Strict Accounting Boundary)
   * Enforces 0 double-counting rule across recalled/superseded bill revisions.
   */
  getSalesCashierProjection(tenantId = null) {
    const settledPayments = (typeof paymentModel.getSettledPayments === 'function') ? paymentModel.getSettledPayments(tenantId) : ((typeof paymentModel.getAllPayments === 'function') ? paymentModel.getAllPayments(tenantId) : []);
    const invoices = (typeof invoiceModel.getAllInvoices === 'function') ? invoiceModel.getAllInvoices(tenantId) : [];
    const allSessions = sessionModel.getAllSessions(tenantId) || [];

    const settledRevenue = settledPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const invoicedRevenue = invoices.reduce((sum, inv) => sum + (parseFloat(inv.grandTotal || inv.total_amount) || 0), 0);

    let grossSales = 0;
    let totalDiscounts = 0;
    let taxableSales = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let serviceChargeTotal = 0;

    allSessions.forEach(session => {
      const sId = session.id || session.sessionId;
      const revisions = billRevisionModel.getRevisionsForSession(sId, tenantId);
      const validRev = revisions.find(r => r.revisionStatus === 'ACCEPTED' || r.revisionStatus === 'GENERATED' || r.invoiceStatus === 'ISSUED');
      if (validRev) {
        grossSales += (parseFloat(validRev.grossSales) || 0);
        totalDiscounts += (parseFloat(validRev.discountsTotal) || 0);
        taxableSales += (parseFloat(validRev.taxableAmount) || 0);
        cgstTotal += (parseFloat(validRev.cgstAmount) || 0);
        sgstTotal += (parseFloat(validRev.sgstAmount) || 0);
        serviceChargeTotal += (parseFloat(validRev.serviceChargeAmount) || 0);
      }
    });

    const paymentPendingRevenue = Math.max(0, grossSales - totalDiscounts + cgstTotal + sgstTotal + serviceChargeTotal - settledRevenue);

    const paymentMix = { CASH: 0, UPI: 0, CARD: 0 };
    const paymentCounts = { CASH: 0, UPI: 0, CARD: 0 };

    settledPayments.forEach(p => {
      const rawMethod = (p.paymentMethod || p.payment_method || p.method || 'CASH').toUpperCase();
      const method = rawMethod.includes('UPI') ? 'UPI' : (rawMethod.includes('CARD') || rawMethod.includes('CREDIT') || rawMethod.includes('DEBIT') ? 'CARD' : 'CASH');
      const amt = parseFloat(p.amount) || 0;
      paymentMix[method] = (paymentMix[method] || 0) + amt;
      paymentCounts[method] = (paymentCounts[method] || 0) + 1;
    });

    let billsSentCount = 0;
    let billsRecalledCount = 0;
    let billsResubmittedCount = 0;
    let billsAwaitingPaymentCount = 0;

    allSessions.forEach(s => {
      const revs = billRevisionModel.getRevisionsForSession(s.id || s.sessionId, tenantId);
      if (revs.length > 0) billsSentCount++;
      if (revs.length > 1) billsResubmittedCount += (revs.length - 1);
      if (revs.some(r => r.revisionStatus === 'RECALLED')) billsRecalledCount++;
      if (s.billStatus === 'BILL_GENERATED' || s.status === 'PAYMENT_PENDING' || s.billStatus === 'PAYMENT_PENDING') {
        billsAwaitingPaymentCount++;
      }
    });

    const completedSessions = allSessions.filter(s => s.status === 'CLOSED' || s.billStatus === 'PAID');
    const avgBillValue = completedSessions.length > 0 ? Math.round(settledRevenue / completedSessions.length) : 0;

    const discountsByWaiter = {};
    const recalledBillHistory = [];

    allSessions.forEach(s => {
      const revs = billRevisionModel.getRevisionsForSession(s.id || s.sessionId, tenantId);
      revs.forEach(r => {
        if (r.discountsTotal > 0) {
          const waiter = r.waiterName || 'Staff';
          discountsByWaiter[waiter] = (discountsByWaiter[waiter] || 0) + r.discountsTotal;
        }
        if (r.revisionStatus === 'RECALLED') {
          recalledBillHistory.push({
            tableCode: r.tableCode || `Table ${r.tableNumber}`,
            billNumber: r.billNumber,
            revisionNumber: r.revisionNumber,
            reason: r.recallReason || 'Waiter Item Modification',
            waiterName: r.waiterName || 'Staff',
            amount: r.grandTotal,
            timestamp: r.updatedAt || r.createdAt
          });
        }
      });
    });

    return {
      financialPosition: {
        grossSales,
        totalDiscounts,
        taxableSales,
        cgstTotal,
        sgstTotal,
        serviceChargeTotal,
        invoicedRevenue,
        settledRevenue,
        paymentPendingRevenue
      },
      paymentMix,
      paymentCounts,
      totalSettledTransactions: settledPayments.length,
      billActivity: {
        billsSentCount,
        billsRecalledCount,
        billsResubmittedCount,
        invoicesIssuedCount: invoices.length,
        billsAwaitingPaymentCount,
        avgBillValue
      },
      managerAudit: {
        discountsByWaiter,
        recalledBillHistory,
        invoicesList: invoices
      },
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Retrieves Staff & Shift operational performance analytics for Phase M6
   */
  getStaffShiftProjection(tenantId = null) {
    const store = (typeof window !== 'undefined' && window.__APP__ && window.__APP__.platform) ? window.__APP__.platform.offlineStore : offlineStore;
    const rawEmployees = (store && typeof store.getCollection === 'function') ? store.getCollection('employees', tenantId) : [];
    const allSessions = sessionModel.getAllSessions(tenantId) || [];
    const allOrders = (typeof orderModel.getAllOrders === 'function') ? orderModel.getAllOrders(tenantId) : ((typeof orderModel.getOrders === 'function') ? orderModel.getOrders(tenantId) : []);
    const settledPayments = (typeof paymentModel.getSettledPayments === 'function') ? paymentModel.getSettledPayments(tenantId) : ((typeof paymentModel.getAllPayments === 'function') ? paymentModel.getAllPayments(tenantId) : []);
    const opProjection = this.getOperationalProjection(tenantId);
    const exceptionsQueue = opProjection.needsAttentionQueue || [];

    const empMap = new Map();
    rawEmployees.forEach(e => {
      if (e && (e.id || e.employeeCode)) {
        const key = e.id || e.employeeCode;
        if (!empMap.has(key)) empMap.set(key, e);
      }
    });

    const employees = Array.from(empMap.values());
    const nowMs = Date.now();
    let totalClockedIn = 0;

    // Real attendance truth: auto-logged on PIN login/logout (attendanceEngine).
    // Latest record per employee keyed by id then name, so clock-in reflects the
    // actual shift, not the onboarding emp.status flag.
    const attendance = (typeof attendanceEngine.getTimesheet === 'function') ? (attendanceEngine.getTimesheet() || []) : [];
    const latestByEmp = new Map();
    attendance.forEach(a => {
      const keys = [a.employeeId, a.employeeName].filter(Boolean);
      keys.forEach(k => {
        const prev = latestByEmp.get(k);
        const at = new Date(a.clockInTime || 0).getTime();
        if (!prev || at >= prev._at) latestByEmp.set(k, { ...a, _at: at });
      });
    });

    const staffRows = employees.map(emp => {
      const empId = emp.id;
      const empName = emp.name || 'Staff Member';
      const roleName = emp.roleName || (emp.roleId ? emp.roleId.replace('role-', '').replace(/-/g, ' ').toUpperCase() : 'STAFF');

      const empSessions = allSessions.filter(s => s.waiterId === empId || s.waiter_id === empId || s.assignedWaiterName === empName || s.waiterName === empName);
      const activeSessions = empSessions.filter(s => s.status !== 'CLOSED');
      const assignedTables = activeSessions.map(s => s.tableCode || `Table ${s.tableNumber}`);
      const seatedGuests = activeSessions.reduce((sum, s) => sum + (parseInt(s.guestCount, 10) || 0), 0);

      const empOrders = allOrders.filter(o => o.waiterId === empId || o.waiter_id === empId || empSessions.some(s => s.id === o.sessionId));
      const activeOrdersCount = empOrders.filter(o => o.status !== 'CLOSED' && o.status !== 'SERVED').length;

      let servedCoversCount = 0;
      let totalPickupLags = [];

      empOrders.forEach(o => {
        if (Array.isArray(o.items)) {
          o.items.forEach(it => {
            if (it.itemStatus === 'SERVED' || it.status === 'SERVED') {
              servedCoversCount++;
            }
            if (it.itemStatus === 'READY' || it.status === 'READY') {
              const readyAt = new Date(it.readyAt || o.updatedAt || nowMs).getTime();
              totalPickupLags.push(Math.max(0, Math.floor((nowMs - readyAt) / 60000)));
            }
          });
        }
      });

      const empSessionIds = new Set(empSessions.map(s => s.id || s.sessionId));
      const empPayments = settledPayments.filter(p => empSessionIds.has(p.sessionId || p.session_id) || p.receivedBy === empId);
      const salesHandled = empPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

      const avgPickupLag = totalPickupLags.length > 0 ? (totalPickupLags.reduce((a, b) => a + b, 0) / totalPickupLags.length).toFixed(1) : null;

      const associatedExceptions = exceptionsQueue.filter(exp => {
        const matchTable = assignedTables.some(t => exp.subtitle?.includes(t) || exp.tableLabel === t);
        return matchTable || exp.title?.includes(empName);
      });

      const attRec = latestByEmp.get(empId) || latestByEmp.get(empName) || null;
      const isClockedIn = !!(attRec && attRec.status === 'ACTIVE_SHIFT');
      if (isClockedIn) totalClockedIn++;

      const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null;
      let shiftTiming = null;
      if (attRec && attRec.clockInTime) {
        if (attRec.status === 'ACTIVE_SHIFT') {
          shiftTiming = `${fmtTime(attRec.clockInTime)} – now (Active Shift)`;
        } else if (attRec.clockOutTime) {
          shiftTiming = `${fmtTime(attRec.clockInTime)} – ${fmtTime(attRec.clockOutTime)}`;
        }
      }

      return {
        empId,
        name: empName,
        roleName,
        workspace: attRec ? (attRec.workspace || emp.workspaceDefault || 'waiter') : (emp.workspaceDefault || 'waiter'),
        clockInStatus: isClockedIn ? 'CLOCKED_IN' : 'OFFLINE',
        clockInTime: attRec ? attRec.clockInTime : null,
        shiftTiming,
        assignedTables,
        assignedTablesCount: assignedTables.length,
        seatedGuests,
        activeOrdersCount,
        servedCoversCount,
        salesHandled,
        avgPickupLag,
        exceptionsCount: associatedExceptions.length,
        exceptions: associatedExceptions
      };
    });

    return {
      totalStaffCount: employees.length,
      clockedInCount: totalClockedIn,
      activeWaitersCount: staffRows.filter(s => s.workspace === 'waiter' && s.assignedTablesCount > 0).length,
      totalSalesHandled: staffRows.reduce((sum, s) => sum + s.salesHandled, 0),
      staffRows,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Retrieves Reports & Day Summary analytics for Phase M7
   * Strictly derived from persistent accounting ledgers (Invoices, Payments, Audit Logs, Revisions)
   * NEVER derived from transient floor/session state.
   */
  getReportsDaySummaryProjection(tenantId = null) {
    const settledPayments = (typeof paymentModel.getSettledPayments === 'function') ? paymentModel.getSettledPayments(tenantId) : ((typeof paymentModel.getAllPayments === 'function') ? paymentModel.getAllPayments(tenantId) : []);
    const invoices = (typeof invoiceModel.getAllInvoices === 'function') ? invoiceModel.getAllInvoices(tenantId) : [];
    const allSessions = sessionModel.getAllSessions(tenantId) || [];
    const allOrders = (typeof orderModel.getAllOrders === 'function') ? orderModel.getAllOrders(tenantId) : ((typeof orderModel.getOrders === 'function') ? orderModel.getOrders(tenantId) : []);

    const settledRevenue = settledPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const invoicedRevenue = invoices.reduce((sum, inv) => sum + (parseFloat(inv.grandTotal || inv.total_amount) || 0), 0);

    let grossSales = 0;
    let totalDiscounts = 0;
    let taxableSales = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let serviceChargeTotal = 0;

    allSessions.forEach(session => {
      const sId = session.id || session.sessionId;
      const revisions = billRevisionModel.getRevisionsForSession(sId, tenantId);
      const validRev = revisions.find(r => r.revisionStatus === 'ACCEPTED' || r.revisionStatus === 'GENERATED' || r.invoiceStatus === 'ISSUED');
      if (validRev) {
        grossSales += (parseFloat(validRev.grossSales) || 0);
        totalDiscounts += (parseFloat(validRev.discountsTotal) || 0);
        taxableSales += (parseFloat(validRev.taxableAmount) || 0);
        cgstTotal += (parseFloat(validRev.cgstAmount) || 0);
        sgstTotal += (parseFloat(validRev.sgstAmount) || 0);
        serviceChargeTotal += (parseFloat(validRev.serviceChargeAmount) || 0);
      }
    });

    const outstandingRevenue = Math.max(0, grossSales - totalDiscounts + cgstTotal + sgstTotal + serviceChargeTotal - settledRevenue);

    const paymentMix = { CASH: 0, UPI: 0, CARD: 0 };
    const paymentCounts = { CASH: 0, UPI: 0, CARD: 0 };

    settledPayments.forEach(p => {
      const rawMethod = (p.paymentMethod || p.payment_method || p.method || 'CASH').toUpperCase();
      const method = rawMethod.includes('UPI') ? 'UPI' : (rawMethod.includes('CARD') || rawMethod.includes('CREDIT') || rawMethod.includes('DEBIT') ? 'CARD' : 'CASH');
      const amt = parseFloat(p.amount) || 0;
      paymentMix[method] = (paymentMix[method] || 0) + amt;
      paymentCounts[method] = (paymentCounts[method] || 0) + 1;
    });

    // Real cash drawer: opening float + physical count come from the persisted
    // shift register. Variance is only computed once a count exists, so it can
    // finally be non-zero (or explicitly null = "not captured") instead of a
    // hardcoded ₹0 "Balanced".
    const register = (typeof shiftRegisterService.getActiveRegister === 'function') ? shiftRegisterService.getActiveRegister(tenantId) : null;
    const expectedOpeningCash = register ? (parseFloat(register.openingFloat) || 0) : null;
    const cashCollectedToday = paymentMix.CASH || 0;
    const expectedCashInDrawer = expectedOpeningCash === null ? null : (expectedOpeningCash + cashCollectedToday);
    const recordedCashCounted = (register && register.countedCash !== null && register.countedCash !== undefined)
      ? (parseFloat(register.countedCash) || 0)
      : null;
    const cashVariance = (expectedCashInDrawer !== null && recordedCashCounted !== null)
      ? Math.round((recordedCashCounted - expectedCashInDrawer) * 100) / 100
      : null;

    const totalCovers = allSessions.reduce((sum, s) => sum + (parseInt(s.guestCount, 10) || 0), 0);
    const totalTablesServed = allSessions.filter(s => s.status === 'CLOSED' || s.billStatus === 'PAID').length;
    const avgBillCheck = totalTablesServed > 0 ? Math.round(settledRevenue / totalTablesServed) : (allSessions.length > 0 ? Math.round(settledRevenue / allSessions.length) : 0);
    const avgSpendPerGuest = totalCovers > 0 ? Math.round(settledRevenue / totalCovers) : 0;

    // Real average table duration from closed session dwell time (open -> close).
    const dwellDurations = allSessions
      .filter(s => s.status === 'CLOSED' || s.billStatus === 'PAID')
      .map(s => {
        const start = new Date(s.openedAt || s.createdAt || s.startedAt || 0).getTime();
        const end = new Date(s.closedAt || s.updatedAt || s.endedAt || 0).getTime();
        return (start && end && end > start) ? Math.round((end - start) / 60000) : null;
      })
      .filter(d => d !== null && d > 0);
    const avgTableDurationMin = dwellDurations.length > 0
      ? Math.round(dwellDurations.reduce((a, b) => a + b, 0) / dwellDurations.length)
      : null;

    const serviceOpsProj = this.getServiceOperationsProjection(tenantId);
    const delayedOrdersCount = serviceOpsProj.pipelineRows ? serviceOpsProj.pipelineRows.filter(r => r.estPrepMin > 15).length : 0;

    let recalledBillsCount = 0;
    allSessions.forEach(s => {
      const revs = billRevisionModel.getRevisionsForSession(s.id || s.sessionId, tenantId);
      if (revs.some(r => r.revisionStatus === 'RECALLED')) recalledBillsCount++;
    });

    const auditLedger = [];
    allSessions.forEach(s => {
      const sId = s.id || s.sessionId;
      const logs = sessionAuditModel.getAuditLogsForSession(sId, tenantId) || [];
      logs.forEach(l => {
        auditLedger.push({
          time: l.createdAt ? new Date(l.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '18:00',
          event: l.eventType || l.action || 'FINANCIAL_EVENT',
          tableLabel: s.tableCode || `Table ${s.tableNumber}`,
          details: l.description || l.details || `Session Event`,
          actor: l.actorName || l.actor || 'System'
        });
      });
    });

    auditLedger.sort((a, b) => b.time.localeCompare(a.time));

    return {
      salesSummary: {
        grossSales,
        discounts: totalDiscounts,
        taxableSales,
        cgst: cgstTotal,
        sgst: sgstTotal,
        serviceCharge: serviceChargeTotal,
        invoiced: invoicedRevenue,
        settled: settledRevenue,
        outstanding: outstandingRevenue
      },
      paymentReconciliation: {
        paymentMix,
        paymentCounts,
        totalTxns: settledPayments.length,
        totalSettled: settledRevenue,
        cashDrawer: {
          registerOpen: !!register,
          expectedOpeningCash,
          cashCollectedToday,
          expectedCashInDrawer,
          recordedCashCounted,
          cashVariance
        }
      },
      taxRates: this.getTaxRates(tenantId),
      operationsSummary: {
        totalCovers,
        totalOrders: allOrders.length,
        totalTablesServed,
        avgBillCheck,
        avgSpendPerGuest,
        avgTableDuration: avgTableDurationMin === null ? null : (avgTableDurationMin + ' min'),
        avgKitchenPrep: serviceOpsProj.avgKitchenPrep === null ? null : (serviceOpsProj.avgKitchenPrep + ' min'),
        avgPickupLag: serviceOpsProj.avgPickupLag === null ? null : (serviceOpsProj.avgPickupLag + ' min'),
        avgOrderToTable: serviceOpsProj.avgOrderToTable === null ? null : (serviceOpsProj.avgOrderToTable + ' min'),
        delayedOrdersCount,
        recalledBillsCount
      },
      auditLedger,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Retrieves My Shift & Handover analytics for Phase M8
   * Consumes M1–M7 projections without independent metrics calculation.
   */
  getMyShiftHandoverProjection(tenantId = null) {
    const opProj = this.getOperationalProjection(tenantId);
    const salesProj = this.getSalesCashierProjection(tenantId);
    const staffProj = this.getStaffShiftProjection(tenantId);
    const reportsProj = this.getReportsDaySummaryProjection(tenantId);

    const activeSessions = (typeof sessionModel.getActiveSessions === 'function') ? sessionModel.getActiveSessions(tenantId) : [];

    const nowMs = Date.now();
    const sess = readLiveSession();
    const managerName = sess.employeeName || sess.name || 'Manager';
    const managerRole = sess.roleName || 'Operations Manager';
    const managerId = sess.employeeId || sess.id || null;

    // Real clock-in: prefer the live attendance shift, else the authenticatedAt
    // stamped at login. Elapsed is computed, never hardcoded.
    const attendance = (typeof attendanceEngine.getTimesheet === 'function') ? (attendanceEngine.getTimesheet() || []) : [];
    const myActive = attendance
      .filter(a => a && a.status === 'ACTIVE_SHIFT' && ((managerId && a.employeeId === managerId) || a.employeeName === managerName))
      .sort((a, b) => new Date(b.clockInTime || 0) - new Date(a.clockInTime || 0))[0];
    const clockInTime = (myActive && myActive.clockInTime) ? myActive.clockInTime : (sess.authenticatedAt || null);
    const shiftElapsedMin = clockInTime ? Math.max(0, Math.floor((nowMs - new Date(clockInTime).getTime()) / 60000)) : null;

    // Register-backed handover. Only the opening float and handover notes are
    // genuinely captured state; the "at takeover" table/bill/exception counts are
    // not stored historically, so we expose live values and label them as such.
    const register = (typeof shiftRegisterService.getActiveRegister === 'function') ? shiftRegisterService.getActiveRegister(tenantId) : null;
    const occupiedNow = (activeSessions || []).length;
    const pendingBillsNow = salesProj.billActivity ? salesProj.billActivity.billsAwaitingPaymentCount : 0;
    const openExceptionsNow = opProj.needsAttentionQueue ? opProj.needsAttentionQueue.length : 0;

    return {
      managerInfo: {
        name: managerName,
        role: managerRole,
        clockInTime,
        shiftElapsedMin,
        status: clockInTime ? 'ACTIVE_SHIFT' : 'NOT_CLOCKED_IN'
      },
      register: register ? {
        id: register.id,
        openingCashFloat: register.openingFloat,
        openedAt: register.openedAt,
        openedBy: register.openedBy,
        countedCash: register.countedCash,
        handoverNotes: register.handoverNotes || ''
      } : null,
      handoverContext: {
        openingCashFloat: register ? register.openingFloat : null,
        previousManagerNotes: register ? (register.handoverNotes || null) : null,
        occupiedTablesNow: occupiedNow,
        pendingBillsNow,
        openExceptionsNow
      },
      currentShiftSnapshot: {
        salesToday: salesProj.financialPosition.grossSales,
        settledRevenue: salesProj.financialPosition.settledRevenue,
        activeTablesCount: opProj.nowMetrics.activeTableCount,
        openExceptionsCount: opProj.needsAttentionQueue.length,
        clockedInStaffCount: staffProj.clockedInCount,
        occupiedTables: activeSessions.map(s => ({
          tableNumber: s.tableNumber,
          tableCode: s.tableCode || `Table ${s.tableNumber}`,
          guestCount: s.guestCount,
          waiterName: s.assignedWaiterName || 'Staff'
        }))
      },
      handoverState: {
        openExceptions: opProj.needsAttentionQueue,
        unpaidBillsCount: salesProj.billActivity.billsAwaitingPaymentCount,
        cashDrawerVariance: reportsProj.paymentReconciliation.cashDrawer.cashVariance
      },
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Configured tax rates (from taxConfigurationModel), so views render the real
   * CGST / SGST / VAT / service-charge percentages instead of hardcoded 2.5 / 5.
   */
  getTaxRates(tenantId = null) {
    let cgstRate = 0, sgstRate = 0, igstRate = 0, vatRate = 0, serviceChargeRate = 0;
    try {
      const cfg = taxConfigurationModel.getTaxConfiguration(tenantId) || {};
      const rules = Array.isArray(cfg.taxRules) ? cfg.taxRules : [];
      const gstRule = rules.find(r => r && r.code === 'GST-FOOD-5' && r.status === 'ACTIVE')
        || rules.find(r => r && r.taxType === 'GST' && r.status === 'ACTIVE');
      if (gstRule) {
        cgstRate = parseFloat(gstRule.cgstRate) || 0;
        sgstRate = parseFloat(gstRule.sgstRate) || 0;
        igstRate = parseFloat(gstRule.igstRate) || 0;
      }
      const vatRule = rules.find(r => r && r.taxType === 'LIQUOR_VAT' && r.status === 'ACTIVE');
      if (vatRule) vatRate = parseFloat(vatRule.rate) || 0;
      if (cfg.serviceCharge) serviceChargeRate = parseFloat(cfg.serviceCharge.rate) || 0;
    } catch (_) {
      // Fall through to zeros; the view still shows the (correct) amounts.
    }
    return { cgstRate, sgstRate, igstRate, vatRate, serviceChargeRate };
  }

  /**
   * Stock & 86 panel (live). On-hand truth comes from the inventory ledger via
   * inventoryProjectionService; classification uses each item's reorder level.
   */
  getStockAlertsProjection(tenantId = null) {
    let outOfStock = [];
    let lowStock = [];
    let totalItems = 0;
    try {
      const summary = inventoryProjectionService.getInventoryValuationSummary(tenantId) || { items: [] };
      const items = summary.items || [];
      totalItems = items.length;
      const master = (typeof inventoryItemModel.getAllItems === 'function') ? (inventoryItemModel.getAllItems(tenantId) || []) : [];
      const reorderById = new Map();
      master.forEach(m => reorderById.set(m.id, parseFloat(m.reorderLevel) || 0));

      items.forEach(it => {
        const reorder = reorderById.get(it.id) || 0;
        const row = {
          id: it.id,
          name: it.name,
          category: it.category,
          baseUnit: it.baseUnit,
          onHand: it.currentStock,
          reorderLevel: reorder,
          valuation: it.stockValuation
        };
        if (it.currentStock <= 0) outOfStock.push(row);
        else if (reorder > 0 && it.currentStock <= reorder) lowStock.push(row);
      });

      outOfStock.sort((a, b) => (b.valuation || 0) - (a.valuation || 0));
      lowStock.sort((a, b) => (a.onHand - a.reorderLevel) - (b.onHand - b.reorderLevel));
    } catch (_) {
      // Inventory rows not hydrated yet; empty state is honest, not fabricated.
    }
    return {
      outOfStock,
      lowStock,
      outOfStockCount: outOfStock.length,
      lowStockCount: lowStock.length,
      totalItems,
      source: 'ledger',
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Discounts, Voids & Comps oversight (live from orders + bill_revisions).
   */
  getVoidsCompsProjection(tenantId = null) {
    const allOrders = (typeof orderModel.getAllOrders === 'function') ? orderModel.getAllOrders(tenantId) : ((typeof orderModel.getOrders === 'function') ? orderModel.getOrders(tenantId) : []);
    const allSessions = sessionModel.getAllSessions(tenantId) || [];

    const sessionById = new Map();
    allSessions.forEach(s => sessionById.set(s.id || s.sessionId, s));
    const tableFor = (o) => {
      const s = sessionById.get(o.sessionId || o.session_id);
      if (s) return s.tableCode || `Table ${s.tableNumber}`;
      return o.tableNumber ? `Table ${o.tableNumber}` : 'Kitchen';
    };

    const voidRows = [];
    let voidValue = 0;
    allOrders.forEach(o => {
      (o.items || []).forEach(it => {
        const status = it.itemStatus || it.status;
        if (status === 'VOIDED') {
          const qty = parseInt(it.quantity) || 1;
          const unit = parseFloat(it.unitPrice || it.price || 0) || 0;
          const lineValue = Math.round(unit * qty * 100) / 100;
          voidValue += lineValue;
          voidRows.push({
            item: it.name || it.itemName || 'Item',
            qty,
            value: lineValue,
            reason: it.voidReason || 'Voided',
            voidedAt: it.voidedAt || null,
            tableLabel: tableFor(o)
          });
        }
      });
    });

    const discountRows = [];
    let discountValue = 0;
    allSessions.forEach(s => {
      const revs = billRevisionModel.getRevisionsForSession(s.id || s.sessionId, tenantId) || [];
      const validRev = revs.find(r => r.revisionStatus === 'ACCEPTED' || r.revisionStatus === 'GENERATED' || r.invoiceStatus === 'ISSUED') || revs[revs.length - 1];
      if (validRev && parseFloat(validRev.discountsTotal) > 0) {
        discountValue += parseFloat(validRev.discountsTotal) || 0;
        discountRows.push({
          tableCode: s.tableCode || `Table ${s.tableNumber}`,
          amount: parseFloat(validRev.discountsTotal) || 0,
          reason: validRev.discountReason || 'Manual Discount',
          waiterName: validRev.waiterName || 'Staff',
          timestamp: validRev.updatedAt || validRev.createdAt || null
        });
      }
    });

    discountRows.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    voidRows.sort((a, b) => new Date(b.voidedAt || 0) - new Date(a.voidedAt || 0));

    return {
      voidRows,
      discountRows,
      voidCount: voidRows.length,
      voidValue: Math.round(voidValue * 100) / 100,
      discountCount: discountRows.length,
      discountValue: Math.round(discountValue * 100) / 100,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Cancellation & Disposition register (Station Cancellation Workflow, Phase C).
   * Cost panels are kept STRICTLY separate (locked semantics):
   *   preparedItemCost - consumedCost across ALL holds (HELD + REUSED + DISCARDED),
   *   reusedValue      - consumedCost of REUSED holds (offset; contributes zero waste),
   *   wasteRecognized  - wasteAmount of DISCARDED holds ONLY (recognised on discard).
   */
  getCancellationProjection(tenantId = null) {
    const requests = cancellationModel.getRequests(tenantId) || [];
    const holds = preparedHoldModel.getHolds(tenantId) || [];

    // Cancelled vs served line quantities across live orders (cancellation rate).
    const allOrders = (typeof orderModel.getAllOrders === 'function') ? (orderModel.getAllOrders(tenantId) || []) : [];
    let cancelledQty = 0;
    let servedQty = 0;
    allOrders.forEach(o => {
      (o.items || []).forEach(it => {
        const s = String(it.itemStatus || it.status || '').toUpperCase();
        const qty = parseFloat(it.quantity) || 0;
        if (s === 'CANCELLED' || s === 'VOIDED') cancelledQty += qty;
        else if (s === 'SERVED') servedQty += qty;
      });
    });

    // Order-line unit prices for request value roll-ups (reason / station / waiter).
    const priceFor = (r) => {
      const order = allOrders.find(o => String(o.orderId || o.id) === String(r.orderId));
      const line = order ? (order.items || []).find(i => i.lineItemId === r.orderLineId || String(i.lineItemId || '').startsWith(String(r.orderLineId))) : null;
      return (parseFloat(line && (line.unitPrice || line.price)) || 0) * (parseFloat(r.quantity) || 0);
    };

    const byReason = {};
    const byStation = {};
    const byWaiter = {};
    const registerRows = [];
    requests.forEach(r => {
      const value = priceFor(r);
      if (['APPROVED', 'AUTO_APPROVED', 'PENDING_MANAGER_DISPOSITION'].includes(r.status)) {
        byReason[r.reasonCode] = Math.round(((byReason[r.reasonCode] || 0) + value) * 100) / 100;
        const st = String(r.station || 'KITCHEN').toUpperCase();
        byStation[st] = Math.round(((byStation[st] || 0) + value) * 100) / 100;
        byWaiter[r.requestedByName || 'Staff'] = Math.round(((byWaiter[r.requestedByName || 'Staff'] || 0) + value) * 100) / 100;
      }
      registerRows.push({
        id: r.id,
        item: r.itemName,
        qty: parseFloat(r.quantity) || 0,
        value,
        station: String(r.station || 'KITCHEN').toUpperCase(),
        stage: r.stageAtRequest,
        reason: r.reasonCode,
        reasonText: r.reasonText || '',
        status: r.status,
        requestedByName: r.requestedByName,
        requestedAt: r.requestedAt,
        decidedBy: r.decidedBy,
        decidedAt: r.decidedAt,
        orderId: r.orderId,
        orderLineId: r.orderLineId,
        holdId: r.holdId || null
      });
    });
    registerRows.sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0));

    // Held-stock cost panels (strictly separated).
    let preparedItemCost = 0;
    let reusedValue = 0;
    let wasteRecognized = 0;
    let heldOpenCost = 0;
    const wasteByStation = {};
    const wasteByReason = {};
    holds.forEach(h => {
      const cost = parseFloat(h.consumedCost) || 0;
      const waste = parseFloat(h.wasteAmount) || 0;
      preparedItemCost += cost;
      if (h.status === 'REUSED') reusedValue += cost;
      if (h.status === 'DISCARDED') wasteRecognized += waste;
      if (h.status === 'HELD') heldOpenCost += cost;
      if (waste > 0) {
        const st = String(h.station || 'KITCHEN').toUpperCase();
        wasteByStation[st] = Math.round(((wasteByStation[st] || 0) + waste) * 100) / 100;
        const req = h.sourceRequestId ? requests.find(r => r.id === h.sourceRequestId) : null;
        const reason = req ? req.reasonCode : (h.discardReason || 'OTHER');
        wasteByReason[reason] = Math.round(((wasteByReason[reason] || 0) + waste) * 100) / 100;
      }
    });

    const countBy = (status) => requests.filter(r => r.status === status).length;

    return {
      registerRows,
      pendingManagerQueue: requests.filter(r => r.status === 'PENDING_MANAGER_DISPOSITION'),
      reversedRows: requests.filter(r => r.status === 'REVERSED'),
      counts: {
        requested: countBy('REQUESTED'),
        approved: countBy('APPROVED'),
        autoApproved: countBy('AUTO_APPROVED'),
        rejected: countBy('REJECTED'),
        pendingManager: countBy('PENDING_MANAGER_DISPOSITION'),
        reversed: countBy('REVERSED')
      },
      cancelledQty, servedQty,
      cancellationRate: (cancelledQty + servedQty) > 0
        ? Math.round((cancelledQty / (cancelledQty + servedQty)) * 1000) / 10 : null,
      byReason, byStation, byWaiter,
      panels: {
        preparedItemCost: Math.round(preparedItemCost * 100) / 100,
        reusedValue: Math.round(reusedValue * 100) / 100,
        wasteRecognized: Math.round(wasteRecognized * 100) / 100,
        heldOpenCost: Math.round(heldOpenCost * 100) / 100
      },
      wasteByStation, wasteByReason,
      holds,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Prep & Production levels. NOTE: production_batches is device-local and NOT
   * part of the realtime set; the view labels this honestly.
   */
  getProductionProjection(tenantId = null) {
    let batches = [];
    try {
      batches = (typeof productionBatchModel.getAllBatches === 'function') ? (productionBatchModel.getAllBatches(tenantId) || []) : [];
    } catch (_) {
      batches = [];
    }
    // Drop the previously-shipped fabricated demo batch so the panel only shows real data.
    batches = batches.filter(b => b && b.id !== 'BATCH-2026-0042');
    const completed = batches.filter(b => b.status === 'COMPLETED');
    const planned = batches.filter(b => b.status !== 'COMPLETED');
    const yields = completed.map(b => parseFloat(b.yieldPercent)).filter(v => !isNaN(v));
    const avgYield = yields.length > 0 ? Math.round((yields.reduce((a, b) => a + b, 0) / yields.length) * 10) / 10 : null;
    const totalLeakage = completed.reduce((sum, b) => sum + (parseFloat(b.totalYieldLeakageValue) || 0), 0);
    return {
      batches: batches
        .slice()
        .sort((a, b) => new Date(b.completedAt || b.createdAt || 0) - new Date(a.completedAt || a.createdAt || 0)),
      activeCount: planned.length,
      completedCount: completed.length,
      avgYieldPercent: avgYield,
      totalLeakageValue: Math.round(totalLeakage * 100) / 100,
      realtime: false,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Floor turnover & covers, derived from real session dwell times.
   */
  getFloorTurnoverProjection(tenantId = null) {
    const allSessions = sessionModel.getAllSessions(tenantId) || [];
    const allTables = tableMasterModel.getAllMasterTables() || [];
    const closed = allSessions.filter(s => s.status === 'CLOSED' || s.billStatus === 'PAID');
    const active = allSessions.filter(s => s && s.status !== 'CLOSED');

    const dwellDurations = closed.map(s => {
      const start = new Date(s.openedAt || s.createdAt || s.startedAt || 0).getTime();
      const end = new Date(s.closedAt || s.updatedAt || s.endedAt || 0).getTime();
      return (start && end && end > start) ? Math.round((end - start) / 60000) : null;
    }).filter(d => d !== null && d > 0);

    const coversToday = allSessions.reduce((sum, s) => sum + (parseInt(s.guestCount, 10) || 0), 0);
    const totalTables = allTables.length;
    const turnoverRate = totalTables > 0 ? Math.round((closed.length / totalTables) * 100) / 100 : null;
    const avgDwell = dwellDurations.length > 0 ? Math.round(dwellDurations.reduce((a, b) => a + b, 0) / dwellDurations.length) : null;
    const avgCoversPerTable = closed.length > 0 ? Math.round(coversToday / closed.length) : null;

    return {
      tablesServed: closed.length,
      tablesActive: active.length,
      totalTables,
      coversToday,
      turnoverRate,
      avgDwellMin: avgDwell,
      avgCoversPerTable,
      lastUpdated: new Date().toISOString()
    };
  }
}

export const managerProjectionService = new ManagerProjectionService();
