/**
 * Inventory-master cloud-persistence certification.
 *
 * Proves the fix for the "edit master but it never reached Supabase" bug:
 *   Bug 1: updateItem passed the app JSONB id ("inv-bar0039") as the cloud key,
 *          which matches neither the uuid PK nor item_code -> PATCH hit 0 rows.
 *   Bug 2: packaging/content edits were sent top-level only, so the data JSONB
 *          stayed stale and reverted on the next hydration.
 *
 * We mock the DataGateway.update to capture what the model actually sends.
 */
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';
import { inventoryItemModel } from '../businessos/platform/inventory/inventoryItemModel.js';

const TENANT = 'tenant_master_test';
const checks = [];
const check = (name, cond, extra) => checks.push([name, !!cond, extra]);

// Mock cloud gateway so we can inspect the key + record the model pushes.
let captured = null;
global.window = {
  __APP__: {
    platform: {
      dataGateway: {
        update: async (collection, key, record) => {
          captured = { collection, key, record };
          return { success: true };
        }
      }
    }
  }
};

// Seed a hydrated cloud row: real uuid PK, item_code, and a STALE LTR data JSONB.
offlineStore.setCollection('inventory', [
  {
    uuid: 'uuid-beqdfz9',
    id: 'inv-bar0039',            // app-level JSONB id (the trap the old code used)
    itemCode: 'BAR0039',
    item_code: 'BAR0039',
    itemName: 'Heineken',
    tenantId: TENANT,
    baseUom: 'LTR',
    base_uom: 'LTR',
    purchaseUom: 'LTR',
    conversionFactor: 1,
    data: { id: 'inv-bar0039', baseUom: 'LTR', purchaseUom: 'LTR', conversionFactor: 1, packSizeMl: 330 }
  }
]);

const updates = {
  itemName: 'Heineken Can',
  item_name: 'Heineken Can',
  baseUom: 'PCS',
  base_uom: 'PCS',
  purchaseUom: 'CASE',
  purchase_uom: 'CASE',
  conversionFactor: 24,
  conversion_factor: 24,
  contentQuantity: 500,
  content_quantity: 500,
  contentUom: 'ML',
  content_uom: 'ML',
  reorderLevel: 50,
  reorder_level: 50,
  data: { id: 'inv-bar0039', baseUom: 'LTR', purchaseUom: 'LTR', conversionFactor: 1, contentQuantity: 500, contentUom: 'ML' }
};

const run = async () => {
  const rec = await inventoryItemModel.updateItem('BAR0039', updates, 'Inventory Manager', TENANT);

  // 1. Cloud key must be the real uuid PK (not the "inv-bar0039" app id).
  check('PST-1a cloud update targets uuid PK (not app id)',
    captured && captured.collection === 'inventory' && captured.key === 'uuid-beqdfz9',
    captured ? `key=${captured.key}` : 'update never called');

  // 2. The data JSONB must be refreshed with the new packaging values (Bug 2).
  const d = (captured && captured.record && captured.record.data) || {};
  check('PST-1b data JSONB baseUom mirrored to PCS', d.baseUom === 'PCS', `data.baseUom=${d.baseUom}`);
  check('PST-1c data JSONB purchaseUom mirrored to CASE', d.purchaseUom === 'CASE', `data.purchaseUom=${d.purchaseUom}`);
  check('PST-1d data JSONB conversionFactor mirrored to 24', Number(d.conversionFactor) === 24, `data.conversionFactor=${d.conversionFactor}`);
  check('PST-1e data JSONB content mirrored (500 ML)', Number(d.contentQuantity) === 500 && d.contentUom === 'ML', `content=${d.contentQuantity}${d.contentUom}`);

  // 3. Returned record top-level reflects the new unit too.
  check('PST-1f returned record baseUom=PCS', rec.baseUom === 'PCS' && rec.base_uom === 'PCS', `rec.baseUom=${rec.baseUom}`);

  // 4. Local offlineStore updated in place (immediate UI reaction).
  const local = (offlineStore.getCollection('inventory') || []).find(i => i.item_code === 'BAR0039');
  check('PST-1g local store reflects PCS + mirrored data',
    local && local.baseUom === 'PCS' && local.data && local.data.baseUom === 'PCS',
    local ? `local.baseUom=${local.baseUom}, data.baseUom=${local.data && local.data.baseUom}` : 'missing');

  let pass = 0, fail = 0;
  console.log('\n=== Inventory-master cloud persistence ===');
  for (const [name, ok, extra] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}${extra && !ok ? '  [' + extra + ']' : ''}`);
    ok ? pass++ : fail++;
  }
  console.log(`\n${pass}/${checks.length} checks passed`);
  process.exit(fail ? 1 : 0);
};

run().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
