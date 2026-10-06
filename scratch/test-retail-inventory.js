/**
 * Retail replenishment consumer-contract certification (Retail Phase 2 - corrected).
 *
 * Pure Node ESM harness. Certifies that Retail behaves EXACTLY like the Bar/
 * Kitchen consumers via retailReplenishmentModel against the shared Inventory
 * Core (in-memory offlineStore, no DOM, no cloud):
 *
 *   1. Requisition is READ-ONLY: createRetailReplenishmentRequest writes an
 *      inventory_requests row (PENDING_FULFILLMENT) with immutable snapshots and
 *      moves ZERO stock. It references a real shared `inventory` SKU.
 *   2. Guard: an itemCode absent from the inventory master is rejected (retail
 *      cannot invent SKUs - it only consumes live inventory).
 *   3. Manager fulfilment: fulfillRetailReplenishmentRequest delegates the
 *      certified StockTransferRepository (LOC-805 -> LOC-RETAIL), executing a
 *      paired TRANSFER_OUT/TRANSFER_IN, moving balances at both locations, marking
 *      the request COMPLETED with the transfer lineage, and leaking NO sale-consumption.
 *   4. Request-level idempotency: re-fulfilling a COMPLETED request returns the
 *      cached result and moves nothing.
 */
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { retailReplenishmentModel } from '../businessos/platform/retail/retailReplenishmentModel.js';

const TENANT = 'tenant_h0qc7wf';
const RETAIL = 'LOC-RETAIL';
const WH = 'LOC-805';
const SESSION = { tenantId: TENANT, employeeName: 'Retail Staff' };
const MGR_SESSION = { tenantId: TENANT, employeeName: 'Inventory Manager' };

const checks = [];
const check = (name, pass, extra) => checks.push([name, !!pass, extra]);

const SKU = 'WINE-CABERNET-750';

// ---- Fixtures --------------------------------------------------------------
const seedMaster = (itemCode, name, baseUom = 'PCS', reorderLevel = 6) => {
  const list = offlineStore.getCollection('inventory') || [];
  const rec = {
    id: itemCode, tenantId: TENANT, tenant_id: TENANT,
    itemCode, item_code: itemCode, itemName: name, item_name: name,
    baseUom, base_uom: baseUom, reorder_level: reorderLevel, reorderLevel
  };
  const idx = list.findIndex(i => (i.itemCode || i.item_code) === itemCode);
  if (idx >= 0) list[idx] = rec; else list.push(rec);
  offlineStore.setCollection('inventory', list);
};

const seedStock = (item, loc, qty, unitCost = 900) => {
  const list = offlineStore.getCollection('stock_balances') || [];
  const rec = {
    id: `sb-${loc}-${item}`, tenantId: TENANT, tenant_id: TENANT,
    itemCode: item, item_code: item, locationCode: loc, location_code: loc,
    quantity: qty, unitCost, valuation: qty * unitCost, baseUom: 'PCS', uom: 'PCS'
  };
  const idx = list.findIndex(b => (b.itemCode || b.item_code) === item && (b.locationCode || b.location_code) === loc);
  if (idx >= 0) list[idx] = rec; else list.push(rec);
  offlineStore.setCollection('stock_balances', list);
};

const balQty = (item, loc) => {
  const b = (offlineStore.getCollection('stock_balances') || [])
    .find(x => (x.itemCode || x.item_code) === item && (x.locationCode || x.location_code) === loc && (x.tenantId || x.tenant_id) === TENANT);
  return b ? (parseFloat(b.quantity) || 0) : 0;
};

const typeOf = (t) => t.transactionType || t.transaction_type;
const rows = (collection, pred) => (offlineStore.getCollection(collection) || []).filter(pred);

const resetAll = () => {
  ['stock_balances', 'stock_transactions', 'stock_ledger', 'stock_transfers', 'inventory', 'inventory_requests']
    .forEach(c => offlineStore.setCollection(c, []));
};

// ---- Run -------------------------------------------------------------------
(async () => {
  resetAll();
  seedMaster(SKU, 'Cabernet Sauvignon 750ml', 'PCS', 6);
  seedStock(SKU, WH, 30);   // warehouse has stock to fulfil
  seedStock(SKU, RETAIL, 2); // retail is a consumer with a low on-hand

  // ---- 1. Requisition is read-only (zero movement) ------------------------
  const req = await retailReplenishmentModel.createRetailReplenishmentRequest(
    { itemCode: SKU, requestedQty: 8, requestedBy: 'Retail Staff', notes: 'weekend cover', session: SESSION }, TENANT);
  check('S1 request created', !!req && !!req.id, req && req.id);
  check('S1 status PENDING_FULFILLMENT', req.status === 'PENDING_FULFILLMENT', req.status);
  check('S1 routed LOC-805 -> LOC-RETAIL', req.fromLocationCode === WH && req.toLocationCode === RETAIL, `${req.fromLocationCode}->${req.toLocationCode}`);
  check('S1 department Retail', req.department === 'Retail', req.department);
  check('S1 snapshotted on-hand at request (2)', req.onHandAtRequest === 2, req.onHandAtRequest);
  check('S1 snapshotted reorder level (6)', req.reorderLevelAtRequest === 6, req.reorderLevelAtRequest);
  check('S1 persisted to inventory_requests', rows('inventory_requests', r => r.id === req.id).length === 1);
  check('S1 ZERO stock movement on request', balQty(SKU, RETAIL) === 2 && balQty(SKU, WH) === 30, `${balQty(SKU, RETAIL)}/${balQty(SKU, WH)}`);
  check('S1 request created NO transfer txn', rows('stock_transactions', t => /TRANSFER/.test(typeOf(t) || '')).length === 0);

  // ---- 2. Guard: SKU must exist in the shared inventory master ------------
  let rejected = false;
  try {
    await retailReplenishmentModel.createRetailReplenishmentRequest(
      { itemCode: 'NOT-A-REAL-SKU', requestedQty: 1, session: SESSION }, TENANT);
  } catch (e) { rejected = /ITEM_NOT_FOUND/.test(e.message); }
  check('S2 unknown SKU rejected (consumes live master only)', rejected);

  // ---- 3. Manager fulfilment posts the paired warehouse transfer ----------
  const res = await retailReplenishmentModel.fulfillRetailReplenishmentRequest(
    req.id, { fulfilledBy: 'Inventory Manager', session: MGR_SESSION }, TENANT);
  check('S3 fulfilment succeeded', res.success && !!res.transferNo, res.transferNo || res.error);
  check('S3 retail rose to 10 (2 + 8)', balQty(SKU, RETAIL) === 10, balQty(SKU, RETAIL));
  check('S3 warehouse dropped to 22 (30 - 8)', balQty(SKU, WH) === 22, balQty(SKU, WH));
  const out = rows('stock_transactions', t => typeOf(t) === 'TRANSFER_OUT' && (t.locationCode || t.location_code) === WH);
  const inn = rows('stock_transactions', t => typeOf(t) === 'TRANSFER_IN' && (t.locationCode || t.location_code) === RETAIL);
  check('S3 one TRANSFER_OUT at LOC-805 (qty -8)', out.length === 1 && parseFloat(out[0].quantity) === -8, out.length);
  check('S3 one TRANSFER_IN at LOC-RETAIL (qty +8)', inn.length === 1 && parseFloat(inn[0].quantity) === 8, inn.length);
  check('S3 boundary: fulfilment creates NO sale-consumption', rows('stock_transactions', t => typeOf(t) === 'SALE_CONSUMPTION').length === 0);
  const reloaded = (offlineStore.getCollection('inventory_requests') || []).find(r => r.id === req.id);
  check('S3 request marked COMPLETED', reloaded.status === 'COMPLETED', reloaded.status);
  check('S3 request linked to transfer', reloaded.fulfillmentTransferId === res.transferNo, reloaded.fulfillmentTransferId);

  // ---- 4. Request-level idempotency --------------------------------------
  const replay = await retailReplenishmentModel.fulfillRetailReplenishmentRequest(
    req.id, { fulfilledBy: 'Inventory Manager', session: MGR_SESSION }, TENANT);
  check('S4 replay flagged idempotentRetry', replay.success && replay.idempotentRetry === true, replay.idempotentRetry);
  check('S4 replay moved NO balances', balQty(SKU, RETAIL) === 10 && balQty(SKU, WH) === 22, `${balQty(SKU, RETAIL)}/${balQty(SKU, WH)}`);
  check('S4 replay added no second transfer doc', rows('stock_transfers', () => true).length === 1, rows('stock_transfers', () => true).length);

  // ---- Report -------------------------------------------------------------
  let pass = 0;
  console.log('\n=== Retail replenishment consumer-contract (Phase 2) ===');
  checks.forEach(([name, ok, extra]) => {
    if (ok) pass++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? `  [${extra}]` : ''}`);
  });
  console.log(`\n${pass}/${checks.length} checks passed.`);
  process.exit(pass === checks.length ? 0 : 1);
})();
