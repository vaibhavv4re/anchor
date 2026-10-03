/**
 * Manager entry-path smoke: exercise the projections the workspace shell calls on
 * mount (badge + default screens) on a CLEARED store, to catch a runtime throw that
 * would otherwise drop the user back to the PIN screen after a successful login.
 * Usage: node scratch/test_manager_entry_smoke.js
 */
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { managerProjectionService } from '../businessos/platform/manager/managerProjectionService.js';

global.window = global.window || { addEventListener: () => {} };
global.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const TENANT = 'tenant_h0qc7wf';

// Blank out every collection the cockpit reads.
['table_sessions', 'orders', 'bill_revisions', 'invoices', 'payments',
 'stock_balances', 'attendance', 'production_batches', 'shift_registers', 'offline_journal']
  .forEach(c => { try { offlineStore.setCollection(c, []); } catch (_) {} });

const methods = [
  'getOperationalProjection',
  'getServiceOperationsProjection',
  'getSalesCashierProjection',
  'getStaffShiftProjection',
  'getReportsDaySummaryProjection',
  'getMyShiftHandoverProjection',
  'getStockAlertsProjection',
  'getVoidsCompsProjection',
  'getProductionProjection',
  'getFloorTurnoverProjection',
  'getTaxRates'
];

let failed = false;
console.log('=== Manager entry-path projection smoke (cleared store) ===');
for (const m of methods) {
  try {
    const out = managerProjectionService[m](TENANT);
    if (out === undefined || out === null) {
      console.log('FAIL - ' + m + ' returned ' + out);
      failed = true;
    } else {
      console.log('PASS - ' + m + ' returned an object');
    }
  } catch (err) {
    console.log('THROW - ' + m + ': ' + (err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err));
    failed = true;
  }
}

console.log(failed ? '\nRESULT: FAILURES PRESENT' : '\nRESULT: ALL PASS');
process.exit(failed ? 1 : 0);
