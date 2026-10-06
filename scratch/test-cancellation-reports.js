/**
 * Smoke test (Phase C): managerProjectionService.getCancellationProjection panels
 * keep "Prepared Item Cost" / "Reused Value" / "Waste Recognized" strictly separate.
 */
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { managerProjectionService } from '../businessos/platform/manager/managerProjectionService.js';

global.sessionStorage = {
  getItem: () => JSON.stringify({ tenantId: 'tenant_h0qc7wf', role: 'manager' }),
  setItem: () => {},
  removeItem: () => {}
};

const T = 'tenant_h0qc7wf';

// Seed two requests (one approved+reused, one approved+discarded) + matching holds.
offlineStore.setCollection('orders', []);
offlineStore.setCollection('cancellation_requests', [
  { id: 'cxl_1', tenantId: T, orderId: 'ord_1', orderLineId: 'li_1', station: 'KITCHEN', itemName: 'Chicken Tikka', quantity: 1, reasonCode: 'CUSTOMER_CHANGED_MIND', stageAtRequest: 'READY', status: 'APPROVED', requestedByName: 'Ravi', requestedAt: new Date().toISOString(), decidedBy: 'chef_1', decidedAt: new Date().toISOString() },
  { id: 'cxl_2', tenantId: T, orderId: 'ord_1', orderLineId: 'li_2', station: 'BAR', itemName: 'Whisky Sour', quantity: 1, reasonCode: 'WRONG_ITEM', stageAtRequest: 'READY', status: 'PENDING_MANAGER_DISPOSITION', requestedByName: 'Sunil', requestedAt: new Date().toISOString() }
]);
offlineStore.setCollection('prepared_item_holds', [
  { id: 'hold_1', tenantId: T, station: 'KITCHEN', itemCode: 'CHK_TIKKA', itemName: 'Chicken Tikka', quantity: 1, status: 'REUSED', consumedCost: 300, wasteAmount: 0, sourceRequestId: 'cxl_1', holdCreatedAt: new Date().toISOString(), lineage: 'CANCEL -> HOLD -> REUSED' },
  { id: 'hold_2', tenantId: T, station: 'KITCHEN', itemCode: 'CHK_TIKKA', itemName: 'Paneer', quantity: 1, status: 'DISCARDED', consumedCost: 250, wasteAmount: 250, wasteRecognizedAt: new Date().toISOString(), sourceRequestId: 'cxl_1', holdCreatedAt: new Date().toISOString(), lineage: 'CANCEL -> HOLD -> DISCARDED' },
  { id: 'hold_3', tenantId: T, station: 'KITCHEN', itemCode: 'SAL_1', itemName: 'Salad', quantity: 1, status: 'HELD', consumedCost: 100, wasteAmount: 0, sourceRequestId: 'cxl_1', holdCreatedAt: new Date().toISOString(), lineage: 'CANCEL -> HOLD' }
]);

let pass = 0, fail = 0;
const assert = (label, cond) => { if (cond) { pass++; console.log('PASS -', label); } else { fail++; console.log('FAIL -', label); } };

const p = managerProjectionService.getCancellationProjection(T);

assert('prepared cost = ALL holds consumedCost (300+250+100)', p.panels.preparedItemCost === 650);
assert('reused value = REUSED only (300)', p.panels.reusedValue === 300);
assert('waste recognized = DISCARDED only (250)', p.panels.wasteRecognized === 250);
assert('held open cost = HELD only (100)', p.panels.heldOpenCost === 100);
assert('waste by station isolated to KITCHEN', p.wasteByStation.KITCHEN === 250 && !p.wasteByStation.BAR);
assert('pending manager queue surfaced', p.pendingManagerQueue.length === 1 && p.pendingManagerQueue[0].id === 'cxl_2');
assert('counts include pendingManager', p.counts.pendingManager === 1 && p.counts.approved === 1);
assert('register rows newest-first with status', p.registerRows.length === 2 && p.registerRows.every(r => r.status));

const ops = managerProjectionService.getOperationalProjection(T);
const cxlExceptions = (ops.needsAttentionQueue || []).filter(e => String(e.type).startsWith('CANCEL_'));
// Only the OPEN request queues (PENDING_MANAGER_DISPOSITION); APPROVED stays out of the queue.
assert('open cancellation requests land in exceptions pipeline', cxlExceptions.length === 1 && cxlExceptions[0].type === 'CANCEL_DISPOSITION' && cxlExceptions[0].severity === 'HIGH');

console.log(`\nRESULT: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
