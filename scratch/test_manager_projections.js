/**
 * Manager Cockpit - headless projection guard.
 *
 * Proves the redesigned manager projections compute from REAL seeded data and,
 * crucially, return honest null / empty values instead of the fabricated
 * constants the old workspace shipped (12.4/3.1/17.8 min SLAs, ORD-1001,
 * ₹5000 opening cash, "Balanced 🟢" variance, BATCH-2026-0042 demo batch,
 * "Operations Manager" identity, "4 hrs 00 min" elapsed).
 *
 * Usage: node scratch/test_manager_projections.js
 */
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { managerProjectionService } from '../businessos/platform/manager/managerProjectionService.js';
import { shiftRegisterService } from '../businessos/platform/manager/shiftRegisterService.js';

const TENANT = 'tenant_h0qc7wf';
global.window = global.window || { addEventListener: () => {} };

// Simulate a live authenticated manager session so identity/clock-in is real.
const MANAGER = {
  employeeId: 'emp-mgr',
  employeeName: 'Priya Manager',
  roleName: 'Operations Manager',
  workspace: 'manager',
  tenantId: TENANT,
  authenticatedAt: new Date(Date.now() - 137 * 60000).toISOString()
};
const _store = { ros_session: JSON.stringify(MANAGER) };
global.sessionStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; }
};

const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo * 60000).toISOString();

const checks = [];
const ok = (name, cond) => checks.push([name, !!cond]);

function seedWorld() {
  offlineStore.setCollection('table_sessions', [
    {
      id: 'sess_live_04', sessionId: 'sess_live_04', tenantId: TENANT,
      tableNumber: 4, tableCode: 'T-04', guestCount: 4,
      assignedWaiterName: 'Test Waiter', waiterId: 'emp-clock',
      status: 'OCCUPIED', billStatus: 'UNBILLED', createdAt: iso(40)
    },
    {
      id: 'sess_closed_09', sessionId: 'sess_closed_09', tenantId: TENANT,
      tableNumber: 9, tableCode: 'T-09', guestCount: 2,
      status: 'CLOSED', openedAt: iso(90), closedAt: iso(30)
    }
  ]);

  offlineStore.setCollection('orders', [
    {
      id: 'ord_1', orderId: 'ord_1', orderNumber: 'ORD-7788', tenantId: TENANT,
      sessionId: 'sess_live_04', tableNumber: 4, status: 'PREPARING',
      waiterId: 'emp-clock', createdAt: iso(25),
      items: [
        { name: 'Paneer Tikka', quantity: 1, price: 500, itemStatus: 'PREPARING' },
        { name: 'Fish Fry', quantity: 2, price: 350, itemStatus: 'VOIDED', voidReason: 'Guest changed order', voidedAt: iso(10) }
      ]
    }
  ]);

  offlineStore.setCollection('bill_revisions', [
    {
      id: 'rev_1', revisionId: 'rev_1', tenantId: TENANT, sessionId: 'sess_live_04',
      tableNumber: 4, tableCode: 'T-04', revisionNumber: 1,
      grossSales: 1200, discountsTotal: 200, grandTotal: 1000,
      discountReason: 'Loyalty courtesy', waiterName: 'Test Waiter',
      revisionStatus: 'ACCEPTED', createdAt: iso(5)
    }
  ]);

  offlineStore.setCollection('employees', [
    { id: 'emp-clock', name: 'Test Waiter', roleId: 'role-waiter', tenantId: TENANT, workspaceDefault: 'waiter' },
    { id: 'emp-mgr', name: 'Priya Manager', roleId: 'role-manager', tenantId: TENANT, workspaceDefault: 'manager' }
  ]);

  offlineStore.setCollection('attendance', [
    { employeeId: 'emp-clock', employeeName: 'Test Waiter', workspace: 'waiter', status: 'ACTIVE_SHIFT', clockInTime: iso(120) },
    { employeeId: 'emp-mgr', employeeName: 'Priya Manager', workspace: 'manager', status: 'ACTIVE_SHIFT', clockInTime: iso(137) }
  ]);

  // One real batch + the old fabricated demo batch (must be filtered out).
  offlineStore.setCollection('production_batches', [
    { id: 'BATCH-REAL-1', batchNumber: 'BATCH-REAL-1', recipeName: 'House Gravy', station: 'Curry', status: 'COMPLETED', plannedPortions: 50, actualPortionsProduced: 45, yieldPercent: 90, totalYieldLeakageValue: 250, tenantId: TENANT, createdAt: iso(60), completedAt: iso(20) },
    { id: 'BATCH-2026-0042', batchNumber: 'BATCH-2026-0042', recipeName: 'Signature Butter Chicken', station: 'Curry Station', status: 'COMPLETED', plannedPortions: 100, actualPortionsProduced: 92, yieldPercent: 92, totalYieldLeakageValue: 1439.8, tenantId: TENANT, createdAt: '2026-08-30T14:00:00.000Z', completedAt: '2026-08-30T16:00:00.000Z' }
  ]);

  // Cash register: opening 5000, physically counted 5200 -> +200 over, non-zero.
  offlineStore.setCollection('shift_registers', []);
  shiftRegisterService.openRegister({ tenantId: TENANT, openingFloat: 5000 });
  shiftRegisterService.recordCashCount({ tenantId: TENANT, countedCash: 5200 });
}

function clearWorld() {
  ['table_sessions', 'orders', 'bill_revisions', 'invoices', 'payments',
   'attendance', 'production_batches', 'shift_registers', 'stock_balances']
    .forEach(c => offlineStore.setCollection(c, []));
}

// ---- 1. Seed and run the live-data assertions.
seedWorld();

const voids = managerProjectionService.getVoidsCompsProjection(TENANT);
ok('voids: voided line detected from orders', voids.voidCount === 1 && voids.voidRows[0].item === 'Fish Fry');
ok('voids: void value computed (2 x 350 = 700)', voids.voidValue === 700);
ok('voids: discount surfaced from bill_revisions', voids.discountCount >= 1 && voids.discountValue >= 200);

const turnover = managerProjectionService.getFloorTurnoverProjection(TENANT);
ok('turnover: closed table counted as served', turnover.tablesServed === 1);
ok('turnover: dwell derived from real open/close (60 min)', turnover.avgDwellMin === 60);
ok('turnover: covers summed from guest counts (>=4)', turnover.coversToday >= 4);

const prod = managerProjectionService.getProductionProjection(TENANT);
ok('production: real batch surfaced', prod.batches.some(b => b.id === 'BATCH-REAL-1'));
ok('production: fabricated demo batch filtered out', !prod.batches.some(b => b.id === 'BATCH-2026-0042'));
ok('production: labelled non-realtime (device-local)', prod.realtime === false);

const staff = managerProjectionService.getStaffShiftProjection(TENANT);
ok('staff: clock-in from attendance, not emp.status', staff.clockedInCount >= 1);
const clockedRow = staff.staffRows.find(r => r.empId === 'emp-clock');
ok('staff: active shift shows real clock-in time', !!clockedRow && clockedRow.clockInStatus === 'CLOCKED_IN' && !!clockedRow.clockInTime);

const reports = managerProjectionService.getReportsDaySummaryProjection(TENANT);
const cd = reports.paymentReconciliation.cashDrawer;
ok('cash: register detected open', cd.registerOpen === true);
ok('cash: variance non-zero and correct (5200 - 5000 = 200)', cd.cashVariance === 200);
ok('cash: opening float from register not hardcoded 5000-constant', cd.expectedOpeningCash === 5000 && cd.recordedCashCounted === 5200);

const myShift = managerProjectionService.getMyShiftHandoverProjection(TENANT);
ok('my shift: real manager identity from session', myShift.managerInfo.name === 'Priya Manager');
ok('my shift: elapsed computed, not "4 hrs 00 min"', typeof myShift.managerInfo.shiftElapsedMin === 'number' && myShift.managerInfo.shiftElapsedMin >= 130);
ok('my shift: register-backed handover context present', myShift.handoverContext && myShift.register && myShift.register.openingCashFloat === 5000);

const rates = managerProjectionService.getTaxRates(TENANT);
ok('tax rates: returns numeric rate fields', ['cgstRate', 'sgstRate', 'igstRate', 'vatRate', 'serviceChargeRate'].every(k => typeof rates[k] === 'number'));

// ---- 2. Honesty guard: with NO data, nothing may be fabricated.
clearWorld();

const opsEmpty = managerProjectionService.getServiceOperationsProjection(TENANT);
const dumpOps = JSON.stringify(opsEmpty);
ok('empty: no fabricated 12.4/3.1/17.8 SLA constants', !/12\.4|"3\.1"|17\.8/.test(dumpOps));
ok('empty: no ORD-1001 placeholder order', !dumpOps.includes('ORD-1001'));
ok('empty: kitchen prep average is null', opsEmpty.avgKitchenPrep === null);

const reportsEmpty = managerProjectionService.getReportsDaySummaryProjection(TENANT);
const cdEmpty = reportsEmpty.paymentReconciliation.cashDrawer;
ok('empty: no register -> registerOpen false', cdEmpty.registerOpen === false);
ok('empty: opening cash null (not hardcoded 5000)', cdEmpty.expectedOpeningCash === null);
ok('empty: variance null (not fake 0 "Balanced")', cdEmpty.cashVariance === null);

const myShiftEmpty = managerProjectionService.getMyShiftHandoverProjection(TENANT);
ok('empty: shift elapsed is session-derived, never the old hardcoded 240 min', myShiftEmpty.managerInfo.shiftElapsedMin !== 240);
ok('empty: no register -> register/handover null', !myShiftEmpty.register);

const prodEmpty = managerProjectionService.getProductionProjection(TENANT);
ok('empty: no demo batch appears when store cleared', prodEmpty.batches.length === 0);

const stockEmpty = managerProjectionService.getStockAlertsProjection(TENANT);
ok('empty: stock alerts return honest empty arrays', Array.isArray(stockEmpty.outOfStock) && Array.isArray(stockEmpty.lowStock));

// ---- Report.
console.log('=== Manager Cockpit: projection honesty + live-computation guard ===');
let pass = true;
for (const [name, cond] of checks) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  if (!cond) pass = false;
}
console.log(pass ? '\nRESULT: ALL PASS' : '\nRESULT: FAILURES PRESENT');
process.exit(pass ? 0 : 1);
