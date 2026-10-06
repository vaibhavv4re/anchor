/**
 * UOM packaging / content canonical-quantity certification.
 *
 * Pure Node ESM harness. Proves the surgical (non-breaking) packaging model:
 *   UOM MASTER (canonical + container types)  ->  INVENTORY ITEM (stock/purchase/
 *   conversion/content)  ->  canonical STOCK quantity across GRN + Bar consumption.
 *
 * Layers exercised:
 *   1. resolveCanonicalStockQuantity  (purchase pack -> canonical stock units)
 *   2. computeContentEquivalent       (physical content in volume family)
 *   3. getBarPackSizeMl                (item-master content wins, legacy map fallback)
 *   4. resolveBarConsumption          (hybrid stock unit: PCS vs LTR)
 *   5. GRN end-to-end                  (receive 5 PACK -> +120 PCS, value preserved)
 *   6. non-breaking                    (no packaging meta -> quantity untouched)
 */
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import {
  resolveCanonicalStockQuantity,
  computeContentEquivalent
} from '../businessos/platform/uom/uomConversionEngine.js';
import {
  getBarPackSizeMl,
  resolveBarConsumption
} from '../businessos/platform/bar/barConsumptionMapping.js';
import { purchasingModel } from '../businessos/platform/inventory/purchasingModel.js';

const TENANT = 'tenant_pack_test';
const checks = [];
const check = (name, cond, extra) => checks.push([name, !!cond, extra]);
const approx = (a, b, eps = 0.0001) => Math.abs((Number(a) || 0) - (Number(b) || 0)) <= eps;

// ---- 1. Canonical purchase -> stock resolver ------------------------------
{
  const item = { baseUom: 'PCS', purchaseUom: 'PACK', conversionFactor: 24 };
  const pack = resolveCanonicalStockQuantity(item, 5, 'PACK');
  check('GR-1a receive 5 PACK -> 120 PCS', pack.quantity === 120 && pack.uom === 'PCS' && pack.converted, JSON.stringify(pack));

  const loose = resolveCanonicalStockQuantity(item, 48, 'PCS');
  check('GR-1b receive 48 PCS (already stock) -> 48 PCS', loose.quantity === 48 && loose.uom === 'PCS' && !loose.converted, JSON.stringify(loose));

  const wrong = resolveCanonicalStockQuantity(item, 2, 'CASE');
  check('GR-1c unknown unit CASE (not declared pack) -> passthrough, no guess', wrong.quantity === 2 && !wrong.converted && wrong.reason === 'UNKNOWN_IN_UOM', JSON.stringify(wrong));
}

// ---- 2. Content equivalence (120 PCS x 500 ML = 60000 ML) -----------------
{
  const eq = computeContentEquivalent({ contentQuantity: 500, contentUom: 'ML' }, 120);
  check('CT-2a 120 PCS x 500ML = 60000 ML', eq.available && eq.totalInContentUom === 60000 && eq.canonicalUom === 'ML' && eq.family === 'VOLUME', JSON.stringify(eq));
  const none = computeContentEquivalent({ contentQuantity: 0, contentUom: '' }, 10);
  check('CT-2b no content declared -> not available', none.available === false, JSON.stringify(none));
}

// ---- 3. Bar pack size: item-master content vs legacy map ------------------
{
  check('BP-3a legacy map fallback BAR0043 -> 650 ML', getBarPackSizeMl('BAR0043') === 650);
  check('BP-3b item content overrides map (330ML)', getBarPackSizeMl('BAR0043', { contentQuantity: 330, contentUom: 'ML' }) === 330);
  check('BP-3c item content in LTR normalized to ML (0.65 -> 650)', getBarPackSizeMl('BAR0043', { contentQuantity: 0.65, contentUom: 'LTR' }) === 650);
}

// ---- 4. Bar consumption honors hybrid stock unit --------------------------
{
  const menu = { itemCode: 'RC-BAR-136', itemName: 'Kingfisher Ultra', category: 'MILD BEER' };
  // Packaged-by-count item (PCS) -> deduct 1 PCS per sold unit.
  const pcsMaster = [{ itemCode: 'BAR0036', baseUom: 'PCS', contentQuantity: 330, contentUom: 'ML' }];
  const rPcs = resolveBarConsumption(menu, null, { orderQty: 3, inventoryMaster: pcsMaster });
  check('BC-4a PCS-based SKU deducts 3 PCS', rPcs.success && rPcs.baseUom === 'PCS' && rPcs.totalDeduction === 3, JSON.stringify(rPcs));

  // Poured-by-volume legacy item (LTR) -> 0.650 L per unit (map).
  const ltrMaster = [{ itemCode: 'BAR0036', baseUom: 'LTR' }];
  const rLtr = resolveBarConsumption(menu, null, { orderQty: 2, inventoryMaster: ltrMaster });
  check('BC-4b LTR-based SKU deducts 1.3 L (2 x 0.650)', rLtr.success && rLtr.baseUom === 'LTR' && approx(rLtr.totalDeduction, 1.3), JSON.stringify(rLtr));

  // No inventory master -> legacy default LTR path (existing behavior preserved).
  const rLegacy = resolveBarConsumption(menu, null, { orderQty: 1 });
  check('BC-4c no master -> legacy LTR 0.650', rLegacy.success && rLegacy.baseUom === 'LTR' && approx(rLegacy.totalDeduction, 0.65), JSON.stringify(rLegacy));
}

// ---- 5. GRN end-to-end: receive 5 PACK -> +120 PCS, value preserved -------
{
  // Seed a live-shaped inventory master item with packaging + content meta.
  offlineStore.setCollection('inventory', [
    {
      id: 'PKGTEST', tenantId: TENANT, tenant_id: TENANT,
      itemCode: 'PKGTEST', item_code: 'PKGTEST', itemName: 'Budweiser Magnum 500ml Can',
      baseUom: 'PCS', base_uom: 'PCS', purchaseUom: 'PACK', purchase_uom: 'PACK',
      conversionFactor: 24, conversion_factor: 24, contentQuantity: 500, content_uom: 'ML'
    }
  ]);
  offlineStore.setCollection('stock_balances', []);
  offlineStore.setCollection('goods_received_notes', []);
  offlineStore.setCollection('purchase_orders', []);
  offlineStore.setCollection('inventory_movements', []);

  const res = purchasingModel.createGoodsReceiptNote({
    isDirectGRN: true,
    directReason: 'Initial stock build for packaging certification',
    supplierInvoiceNo: 'GRN-PACK-1',
    destinationLocationCode: 'LOC-TEST',
    receivedBy: 'Store Manager',
    tenantId: TENANT,
    lines: [{ itemCode: 'PKGTEST', receivedQty: 5, acceptedQty: 5, rejectedQty: 0, actualInvoicePrice: 100, uom: 'PACK' }]
  });

  const balances = offlineStore.getCollection('stock_balances') || [];
  const bal = balances.find(b => (b.itemCode || b.item_code) === 'PKGTEST');
  check('GRN-5a balance expanded to canonical 120 PCS', !!bal && bal.quantity === 120 && String(bal.uom).toUpperCase() === 'PCS', JSON.stringify(bal));
  check('GRN-5b valuation preserved at 5 x 100 = 500', !!bal && approx(bal.valuation, 500), bal && String(bal.valuation));
  check('GRN-5c unit cost recomputed per canonical unit (500/120)', !!bal && approx(bal.unitCost, 500 / 120, 0.01), bal && String(bal.unitCost));

  const mov = (offlineStore.getCollection('inventory_movements') || []).find(m => m.inventoryItemId === 'PKGTEST' && m.movementType === 'PURCHASE_RECEIPT');
  check('GRN-5d movement recorded in canonical units w/ purchase audit fields', !!mov && mov.quantity === 120 && mov.unit === 'PCS' && mov.purchaseQuantity === 5 && mov.purchaseUom === 'PACK', JSON.stringify(mov));
  check('GRN-5e GRN created', !!res && !!res.grn, res && res.grn && res.grn.grnNumber);
}

// ---- 6. Non-breaking: item with no packaging meta -------------------------
{
  const plain = { baseUom: 'KG', purchaseUom: '', conversionFactor: 1 };
  const r = resolveCanonicalStockQuantity(plain, 30, 'KG');
  check('NB-6a no purchase meta -> passthrough 30 KG', r.quantity === 30 && !r.converted, JSON.stringify(r));
}

// ---- 7. GRN container-without-meta guard blocks the mis-post --------------
{
  offlineStore.setCollection('inventory', [
    {
      id: 'GUARD', tenantId: TENANT, tenant_id: TENANT, itemCode: 'GUARD', item_code: 'GUARD',
      itemName: 'Guard Beer Can', baseUom: 'PCS', base_uom: 'PCS', purchaseUom: '', conversionFactor: 1
    }
  ]);
  offlineStore.setCollection('stock_balances', []);
  offlineStore.setCollection('goods_received_notes', []);
  offlineStore.setCollection('purchase_orders', []);
  offlineStore.setCollection('inventory_movements', []);

  let threw = false; let msg = '';
  try {
    purchasingModel.createGoodsReceiptNote({
      isDirectGRN: true,
      directReason: 'Guard certification',
      supplierInvoiceNo: 'GRN-GUARD-1',
      destinationLocationCode: 'LOC-TEST',
      receivedBy: 'Store Manager',
      tenantId: TENANT,
      lines: [{ itemCode: 'GUARD', receivedQty: 5, acceptedQty: 5, rejectedQty: 0, actualInvoicePrice: 100, uom: 'CASE' }]
    });
  } catch (e) { threw = true; msg = e.message; }
  check('GRD-7a receive CASE with no pack meta is BLOCKED', threw && /GRN blocked/.test(msg), msg);
  const balAfter = (offlineStore.getCollection('stock_balances') || []).find(b => (b.itemCode || b.item_code) === 'GUARD');
  check('GRD-7b no balance written when blocked', !balAfter || (parseFloat(balAfter.quantity) || 0) === 0, JSON.stringify(balAfter));
}

// ---- Report ---------------------------------------------------------------
let pass = 0;
console.log('\n=== UOM Packaging / Canonical Quantity Certification ===');
for (const [name, ok, extra] of checks) {
  if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${(!ok && extra) ? '  << ' + extra : ''}`);
}
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
