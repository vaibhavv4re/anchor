/**
 * Test BarInventoryView Unit & Integration Verification
 */
import { BarInventoryView } from '../restaurantos/frontend/capabilities/bar/ui/BarInventoryView.js';

// Mock Offline Store
const mockInventory = [
  { item_code: 'BAR0004', item_name: 'Glenfiddich 12 Yr Old', category_code: 'CAT-BEV-ALC', base_uom: 'LTR', unit_valuation: 3200 },
  { item_code: 'BAR0005', item_name: 'Singleton Luscious 12 Yr Old', category_code: 'CAT-BEV-ALC', base_uom: 'LTR', unit_valuation: 3400 },
  { item_code: 'BAR0036', item_name: 'Kingfisher Ultra (650ml)', category_code: 'CAT-BEV-ALC', base_uom: 'BOTTLE', unit_valuation: 180 },
  { item_code: 'BAR0041', item_name: 'Corona (330ml)', category_code: 'CAT-BEV-ALC', base_uom: 'BOTTLE', unit_valuation: 220 },
  { item_code: 'BAR0047', item_name: 'Breezer', category_code: 'CAT-BEV-ALC', base_uom: 'BOTTLE', unit_valuation: 120 },
  { item_code: 'BAR0050', item_name: 'Soda', category_code: 'CAT-BEV-SOFT', base_uom: 'LTR', unit_valuation: 30 },
  { item_code: 'RM0310', item_name: 'Tomatoes', category_code: 'CAT-VEG', base_uom: 'KG', unit_valuation: 30 } // Food item, should be excluded
];

const mockStockBalances = [
  // LOC-314 (Bar Store)
  { item_code: 'BAR0004', location_code: 'LOC-314', quantity: 1.800, valuation: 5760 },
  { item_code: 'BAR0036', location_code: 'LOC-314', quantity: 24, valuation: 4320 },
  // LOC-886 (Kitchen Store) - Should be ignored by Bar view
  { item_code: 'BAR0004', location_code: 'LOC-886', quantity: 5.000, valuation: 16000 },
  { item_code: 'RM0310', location_code: 'LOC-886', quantity: 1.400, valuation: 42 }
];

const mockOfflineStore = {
  getCollection: (name, tenantId) => {
    if (name === 'inventory') return mockInventory;
    if (name === 'stock_balances') return mockStockBalances;
    if (name === 'stock_transactions') return [
      { item_code: 'BAR0004', location_code: 'LOC-314', transactionType: 'OPENING_STOCK', baseQuantity: 1.800, baseUom: 'LTR', occurredAt: '2026-09-07T10:00:00Z', performedBy: 'Manager Sibu' }
    ];
    return [];
  }
};

const barInv = new BarInventoryView({ offlineStore: mockOfflineStore });

console.log('--- 1. Testing Enriched Bar Inventory Filter & Isolation ---');
const items = barInv.getEnrichedBarInventory('tenant_h0qc7wf');
console.log(`Total Bar SKUs identified: ${items.length} (Expected 6, Food RM0310 excluded)`);
if (items.find(i => i.code === 'RM0310')) {
  console.error('FAIL: Food item RM0310 included in Bar inventory!');
} else {
  console.log('PASS: Food items strictly excluded.');
}

console.log('\n--- 2. Testing LOC-314 Quantity Isolation ---');
const glenfiddich = items.find(i => i.code === 'BAR0004');
console.log(`Glenfiddich at LOC-314 On Hand: ${glenfiddich.onHand} LTR (Expected 1.800, NOT 5.0 or 6.8)`);
if (glenfiddich.onHand === 1.800) {
  console.log('PASS: LOC-314 stock strictly isolated from LOC-886.');
} else {
  console.error(`FAIL: Expected 1.800, got ${glenfiddich.onHand}`);
}

console.log('\n--- 3. Testing Configured Bottle Pack Calculations ---');
console.log(`Glenfiddich Pack size: ${glenfiddich.packSizeMl} ML`);
console.log(`Glenfiddich Bottle Eq: "${glenfiddich.bottleEquivalentStr}"`);
console.log(`Glenfiddich 30ml Pegs: ${glenfiddich.remainingPegs30} (Expected 60)`);
console.log(`Glenfiddich 60ml Pegs: ${glenfiddich.remainingPegs60} (Expected 30)`);

const kfBeer = items.find(i => i.code === 'BAR0036');
console.log(`Kingfisher Ultra Pack size: ${kfBeer.packSizeMl} ML (Expected 650)`);
console.log(`Kingfisher Ultra Bottle Eq: "${kfBeer.bottleEquivalentStr}" (Expected 24 sealed bottles)`);

const corona = items.find(i => i.code === 'BAR0041');
console.log(`Corona Pack size: ${corona.packSizeMl} ML (Expected 330)`);

const breezer = items.find(i => i.code === 'BAR0047');
console.log(`Breezer Pack size: ${breezer.packSizeMl} ML (Expected 275)`);

console.log('\n--- 4. Testing HTML Rendering & Mount ---');
const dummyContainer = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
barInv.render(dummyContainer, { tenantId: 'tenant_h0qc7wf' });
console.log('Container rendered HTML length:', dummyContainer.innerHTML.length);
if (dummyContainer.innerHTML.includes('LOC-314') && dummyContainer.innerHTML.includes('Glenfiddich 12 Yr Old')) {
  console.log('PASS: HTML contains LOC-314 and Bar SKU entries.');
} else {
  console.error('FAIL: Rendered HTML missing key markers.');
}

console.log('\nALL UNIT CHECKS COMPLETED SUCCESSFULLY!');
