/**
 * Retail Catalogue Categories certification (Retail Phase 1 - category taxonomy).
 *
 * Pure Node ESM harness (in-memory offlineStore, no DOM, no cloud/gateway). It
 * certifies the configurable two-level wine-shop taxonomy + the live category
 * stock rollup:
 *
 *   1. seedDefaults builds the two-level tree and is IDEMPOTENT (no dupes).
 *   2. getTree groups sub-categories under their parents.
 *   3. A product's categoryCode round-trips through _normalize, INCLUDING the
 *      cloud `data` JSONB fallback (retail_products has no dedicated column).
 *   4. computeCategoryRollups: per-category SKU count / on-hand / value / OUT /
 *      LOW are correct against live LOC-RETAIL balances + the inventory master's
 *      reorder level; a parent aggregates its children; untagged products land in
 *      the synthetic "Uncategorised" bucket.
 */
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { retailCategoryModel, DEFAULT_RETAIL_CATEGORIES } from '../businessos/platform/retail/retailCategoryModel.js';
import { retailProductModel } from '../businessos/platform/retail/retailProductModel.js';
import { computeCategoryRollups } from '../restaurantos/frontend/capabilities/retail/ui/retailInventorySupport.js';

const TENANT = 'tenant_h0qc7wf';
const RETAIL = 'LOC-RETAIL';

const checks = [];
const check = (name, pass, extra) => checks.push([name, !!pass, extra]);

const resetAll = () => ['retail_categories', 'retail_products', 'stock_balances', 'inventory']
  .forEach(c => offlineStore.setCollection(c, []));

const seedMaster = (itemCode, reorderLevel) => {
  const list = offlineStore.getCollection('inventory') || [];
  list.push({ id: itemCode, tenantId: TENANT, tenant_id: TENANT, itemCode, item_code: itemCode, itemName: itemCode, baseUom: 'PCS', reorder_level: reorderLevel });
  offlineStore.setCollection('inventory', list);
};

const seedRetail = (item, qty, unitCost) => {
  const list = offlineStore.getCollection('stock_balances') || [];
  list.push({
    id: `sb-${RETAIL}-${item}`, tenantId: TENANT, tenant_id: TENANT,
    itemCode: item, item_code: item, locationCode: RETAIL, location_code: RETAIL,
    quantity: qty, unitCost, valuation: qty * unitCost, uom: 'PCS'
  });
  offlineStore.setCollection('stock_balances', list);
};

const addProduct = (itemCode, categoryCode, price) =>
  retailProductModel.create({ itemCode, categoryCode, name: itemCode, sellingPrice: price, tenantId: TENANT }, TENANT);

const rollupOf = (code) => computeCategoryRollups(TENANT, null).find(r => String(r.code).toUpperCase() === String(code).toUpperCase());

// ---- Run -------------------------------------------------------------------
(async () => {
  resetAll();

  // ---- 1. seedDefaults + idempotency --------------------------------------
  const seeded = await retailCategoryModel.seedDefaults(TENANT);
  check('S1 seeded full default taxonomy', seeded.length === DEFAULT_RETAIL_CATEGORIES.length, `${seeded.length}/${DEFAULT_RETAIL_CATEGORIES.length}`);
  const replay = await retailCategoryModel.seedDefaults(TENANT);
  check('S1 re-seed is idempotent (0 added)', replay.length === 0, replay.length);
  const allCats = retailCategoryModel.getAll(TENANT);
  check('S1 no duplicate category rows', new Set(allCats.map(c => c.code)).size === allCats.length, allCats.length);

  // ---- 2. two-level tree ---------------------------------------------------
  const tree = retailCategoryModel.getTree(TENANT);
  check('S2 five top-level categories', tree.length === 5, tree.map(t => t.code).join(','));
  const wine = tree.find(t => t.code === 'WINE');
  check('S2 Wine has 5 sub-categories', wine && wine.children.length === 5, wine && wine.children.length);
  check('S2 sub-category has parentCode', wine && wine.children.some(ch => ch.parentCode === 'WINE'));

  // ---- 3. categoryCode round-trips incl. data JSONB fallback ---------------
  resetAll();
  offlineStore.setCollection('retail_products', [{
    id: 'rp-cloud', tenant_id: TENANT, product_code: 'RP-C', item_code: 'WHT-CLOUD',
    name: 'Cloud Rosé', selling_price: 1200, // real price columns exist on the row
    // categoryCode has NO column on retail_products, so it survives only in data
    data: { categoryCode: 'WINE-ROSE' }
  }]);
  const cloudRow = retailProductModel.getAll(TENANT).find(p => p.itemCode === 'WHT-CLOUD');
  check('S3 categoryCode resolved from data JSONB', cloudRow && cloudRow.categoryCode === 'WINE-ROSE', cloudRow && cloudRow.categoryCode);
  check('S3 sellingPrice resolved from price column', cloudRow && cloudRow.sellingPrice === 1200, cloudRow && cloudRow.sellingPrice);

  // ---- 4. category rollup math --------------------------------------------
  resetAll();
  await retailCategoryModel.seedDefaults(TENANT);
  // master + live LOC-RETAIL balances
  seedMaster('RED1', 6);  seedRetail('RED1', 2, 500);   // LOW (2<=6)
  seedMaster('RED2', 6);  seedRetail('RED2', 20, 300);  // healthy
  seedMaster('WHT1', 6);  seedRetail('WHT1', 0, 400);   // OUT
  seedMaster('GEN1', 0);  seedRetail('GEN1', 5, 100);   // uncategorised, no reorder -> healthy
  await addProduct('RED1', 'WINE-RED', 900);
  await addProduct('RED2', 'WINE-RED', 700);
  await addProduct('WHT1', 'WINE-WHITE', 800);
  await addProduct('GEN1', '', 200);

  const red = rollupOf('WINE-RED');
  check('S4 WINE-RED skuCount 2', red && red.skuCount === 2, red && red.skuCount);
  check('S4 WINE-RED onHand 22', red && red.onHandUnits === 22, red && red.onHandUnits);
  check('S4 WINE-RED value 7000 (2*500 + 20*300)', red && red.stockValue === 7000, red && red.stockValue);
  check('S4 WINE-RED low 1 / out 0', red && red.lowCount === 1 && red.outCount === 0, red && `${red.lowCount}/${red.outCount}`);
  check('S4 WINE-RED needsReplenishment', red && red.needsReplenishment === true);

  const white = rollupOf('WINE-WHITE');
  check('S4 WINE-WHITE out 1', white && white.outCount === 1 && white.skuCount === 1, white && `${white.outCount}/${white.skuCount}`);

  const wineTop = rollupOf('WINE');
  check('S4 parent WINE aggregates children (sku 3)', wineTop && wineTop.skuCount === 3, wineTop && wineTop.skuCount);
  check('S4 parent WINE onHand 22', wineTop && wineTop.onHandUnits === 22, wineTop && wineTop.onHandUnits);
  check('S4 parent WINE value 7000', wineTop && wineTop.stockValue === 7000, wineTop && wineTop.stockValue);
  check('S4 parent WINE out 1 / low 1', wineTop && wineTop.outCount === 1 && wineTop.lowCount === 1, wineTop && `${wineTop.outCount}/${wineTop.lowCount}`);

  const uncat = rollupOf('__UNCAT__');
  check('S4 Uncategorised bucket captures untagged', uncat && uncat.skuCount === 1 && uncat.onHandUnits === 5 && uncat.stockValue === 500, uncat && `${uncat.skuCount}/${uncat.onHandUnits}/${uncat.stockValue}`);
  check('S4 Uncategorised has no alerts', uncat && uncat.outCount === 0 && uncat.lowCount === 0 && !uncat.needsReplenishment);

  // ---- Report -------------------------------------------------------------
  let pass = 0;
  console.log('\n=== Retail Catalogue Categories (Phase 1) ===');
  checks.forEach(([name, ok, extra]) => {
    if (ok) pass++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? `  [${extra}]` : ''}`);
  });
  console.log(`\n${pass}/${checks.length} checks passed.`);
  process.exit(pass === checks.length ? 0 : 1);
})();
