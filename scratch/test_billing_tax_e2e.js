/**
 * End-to-end verification that generated bills/invoices actually consume the
 * CA-saved tax configuration (not the hardcoded defaults), driving tax PER LINE
 * so food (GST) and explicitly-marked liquor (state VAT) are treated correctly.
 *
 * This mirrors the REAL billing read path: billRevisionModel.createRevision() and
 * sessionProjectionService both call computeBillTax({ items, discountRecords,
 * isIntraState, tenantId }) WITHOUT a config, so the engine falls back to
 * getTaxConfiguration() -> dataGateway cached collection -> offlineStore -> defaults.
 * We stub window.__APP__.platform.dataGateway.getCachedCollection to return a
 * "saved" config (as if the CA edited + saved it) and assert the numbers follow it.
 */
import { taxConfigurationModel } from '../businessos/platform/accounting/taxConfigurationModel.js';

function approx(a, b, eps = 0.05) { return Math.abs(a - b) <= eps; }

const TENANT = 'tenant_h0qc7wf';

// ---- 1. Build a realistic "saved by CA" config, using a NON-default liquor VAT
//         rate (21% instead of the shipped default 10%) so we can PROVE the read
//         path picked up the edit, and map REAL menu category strings to tax cats.
const saved = taxConfigurationModel.getDefaultConfiguration(TENANT);
saved.tenantId = TENANT;
saved.tenant_id = TENANT;

// Bump the liquor rule to 21% (a CA edit that differs from the default 10%).
const liq = saved.taxRules.find(r => r.code === 'LIQUOR-VAT-10');
liq.code = 'LIQUOR-VAT-21';
liq.name = 'State Liquor VAT 21%';
liq.rate = 21.0;
saved.taxCategories.forEach(c => { if (c.code.indexOf('ALCOHOL') === 0) c.defaultTaxRuleCode = 'LIQUOR-VAT-21'; });

// Map ACTUAL menu category strings (as returned by menuMasterModel.getAllCategories)
// to tax categories. Keys must match the `category` carried on order lines exactly.
saved.itemTaxMappings.categoryDefaults = {
  'CURRIES & DAALS': 'RESTAURANT_FOOD',
  'STARTERS & APPETIZERS': 'RESTAURANT_FOOD',
  'WHISKY & LIQUOR': 'ALCOHOL_SPIRITS',
  'BEER': 'ALCOHOL_BEER'
};

// ---- 2. Stub the gateway read so getTaxConfiguration() returns our saved config.
global.window = {
  __APP__: {
    platform: {
      dataGateway: {
        getCachedCollection: (name /* , tenant */) => (name === 'tax_configurations' ? [saved] : [])
      }
    }
  }
};

// Prove the billing read path actually sees the edited (saved) config.
const readBack = taxConfigurationModel.getTaxConfiguration(TENANT);
const savedIsUsed = readBack.taxRules.some(r => r.code === 'LIQUOR-VAT-21' && parseFloat(r.rate) === 21);

// ---- 3. A mixed food + bar bill, exactly the shape billRevisionModel produces
//         after _enrichItemsForTax (each line has itemCode + raw category).
const items = [
  { itemCode: 'MENU-CHICK-1', category: 'CURRIES & DAALS',       name: 'Chicken Curry', price: 300, quantity: 1 },
  { itemCode: 'MENU-PANEER',  category: 'STARTERS & APPETIZERS', name: 'Paneer Tikka',  price: 200, quantity: 1 },
  { itemCode: 'BAR-WHY-1',    category: 'WHISKY & LIQUOR',       name: 'Whisky',        price: 500, quantity: 2 },
  { itemCode: 'BAR-BEER-1',   category: 'BEER',                  name: 'Beer',          price: 600, quantity: 1 }
];

// NO config passed -> engine must read the saved config via getTaxConfiguration().
const billTax = taxConfigurationModel.computeBillTax({ items, discountRecords: [], isIntraState: true, tenantId: TENANT });

console.log('=== E2E: bill generated via the CA-saved config ===');
console.log('saved config used by read path :', savedIsUsed);
console.log('taxableAmount                  :', billTax.taxableAmount);
console.log('cgst / sgst (food+SC only)     :', billTax.cgstAmount, billTax.sgstAmount);
console.log('vatAmount (liquor @21%)        :', billTax.vatAmount);
console.log('serviceCharge (excl. liquor)   :', billTax.serviceChargeAmount, '@', billTax.serviceChargePercent + '%');
console.log('lineTaxes                      :', billTax.lineTaxes.map(l => `${l.name}:${l.taxCategoryCode}/${l.taxRuleCode} gst=${l.cgstAmount + l.sgstAmount} vat=${l.vatAmount}`).join(' | '));
console.log('taxBreakdownByCategory         :', JSON.stringify(billTax.taxBreakdownByCategory));
console.log('grandTotal                     :', billTax.grandTotal);

// ---- 4. Assertions.
const checks = [];
checks.push(['read path consumes the SAVED config (VAT 21%)', savedIsUsed]);

// Per-line routing driven by config category mapping.
checks.push(['food line1 -> GST-FOOD-5', billTax.lineTaxes[0].taxRuleCode === 'GST-FOOD-5']);
checks.push(['food line2 -> GST-FOOD-5', billTax.lineTaxes[1].taxRuleCode === 'GST-FOOD-5']);
checks.push(['whisky line -> ALCOHOL_SPIRITS / LIQUOR-VAT-21', billTax.lineTaxes[2].taxCategoryCode === 'ALCOHOL_SPIRITS' && billTax.lineTaxes[2].taxRuleCode === 'LIQUOR-VAT-21']);
checks.push(['beer line -> ALCOHOL_BEER / LIQUOR-VAT-21', billTax.lineTaxes[3].taxCategoryCode === 'ALCOHOL_BEER' && billTax.lineTaxes[3].taxRuleCode === 'LIQUOR-VAT-21']);

// Liquor must carry ZERO GST (no CGST/SGST); food must carry ZERO VAT.
checks.push(['liquor lines have no CGST/SGST', billTax.lineTaxes[2].cgstAmount === 0 && billTax.lineTaxes[2].sgstAmount === 0 && billTax.lineTaxes[3].cgstAmount === 0]);
checks.push(['food lines have no VAT', billTax.lineTaxes[0].vatAmount === 0 && billTax.lineTaxes[1].vatAmount === 0]);

// Expected values with the EDITED 21% rate:
//   food base 500 @5% = 25 => cgst 12.5 + sgst 12.5
//   liquor base 1600 @21% = 336 VAT
//   service charge base = food 500 only (liquor excluded) => 5% = 25; +5% GST on SC => +1.25 (0.63/0.62)
//   => cgst ~13.13, sgst ~13.12, vat 336, taxable 2100
checks.push(['vat uses 21% (336), not default 10%', approx(billTax.vatAmount, 336)]);
checks.push(['cgst incl SC-tax ~13.13', approx(billTax.cgstAmount, 13.13)]);
checks.push(['sgst incl SC-tax ~13.12', approx(billTax.sgstAmount, 13.12)]);
checks.push(['service charge excludes liquor (25, not 105)', approx(billTax.serviceChargeAmount, 25)]);
checks.push(['taxableAmount = 2100', approx(billTax.taxableAmount, 2100)]);

// A LIQUOR_VAT tax line is emitted so the invoice prints it separately.
checks.push(['taxLines include a separate LIQUOR_VAT entry', billTax.taxLines.some(t => t.type === 'LIQUOR_VAT')]);

// Breakdown by category gives the food(GST) vs bar(VAT) split the cashier will use.
const foodBkt = billTax.taxBreakdownByCategory['RESTAURANT_FOOD'] || { vatAmount: -1, cgstAmount: 0 };
const spiritsBkt = billTax.taxBreakdownByCategory['ALCOHOL_SPIRITS'] || { cgstAmount: -1 };
checks.push(['breakdown: food bucket has GST, no VAT', foodBkt.cgstAmount > 0 && foodBkt.vatAmount === 0]);
checks.push(['breakdown: spirits bucket has VAT, no GST', spiritsBkt.vatAmount > 0 && (spiritsBkt.cgstAmount === 0 || spiritsBkt.cgstAmount === undefined)]);

// grandTotal self-consistent.
const expectedGrand = Math.round((billTax.taxableAmount + billTax.totalTax + billTax.serviceChargeAmount) * 100) / 100;
checks.push(['grandTotal consistent', approx(billTax.grandTotal, expectedGrand)]);

// ---- 5. Fiscal sections: the engine (NOT the UI) owns the food-vs-bar split.
const fs = billTax.fiscalSections || [];
const food = fs.find(s => s.section === 'FOOD') || {};
const bar = fs.find(s => s.section === 'BAR') || {};
console.log('\n--- fiscalSections ---');
console.log('FOOD:', JSON.stringify({ subtotal: food.subtotal, taxable: food.taxableAmount, tax: food.totalTax, sc: food.serviceChargeAmount, vat: food.vatAmount, total: food.sectionTotal, n: (food.items || []).length, taxLines: food.taxLines }));
console.log('BAR :', JSON.stringify({ subtotal: bar.subtotal, taxable: bar.taxableAmount, tax: bar.totalTax, sc: bar.serviceChargeAmount, vat: bar.vatAmount, total: bar.sectionTotal, n: (bar.items || []).length, taxLines: bar.taxLines }));

checks.push(['fiscalSections has FOOD + BAR', fs.length === 2 && !!food.section && !!bar.section]);
checks.push(['FOOD section = 2 items, subtotal 500', (food.items || []).length === 2 && approx(food.subtotal, 500)]);
checks.push(['FOOD section has GST, no VAT, no service-charge leakage', approx(food.vatAmount, 0) && food.cgstAmount > 0]);
checks.push(['FOOD section carries the service charge (25)', approx(food.serviceChargeAmount, 25)]);
checks.push(['BAR section = 2 items, subtotal 1600', (bar.items || []).length === 2 && approx(bar.subtotal, 1600)]);
checks.push(['BAR section = VAT only, no GST, no service charge', approx(bar.vatAmount, 336) && approx(bar.cgstAmount, 0) && approx(bar.serviceChargeAmount, 0)]);
checks.push(['BAR taxLines is a single LIQUOR_VAT line', (bar.taxLines || []).length === 1 && bar.taxLines[0].type === 'LIQUOR_VAT']);
// Section totals must sum back to the authoritative bill grandTotal.
const secSum = Math.round(((food.sectionTotal || 0) + (bar.sectionTotal || 0)) * 100) / 100;
checks.push(['section totals sum to grandTotal', approx(secSum, billTax.grandTotal)]);

console.log('\n=== assertions ===');
let ok = true;
for (const [name, pass] of checks) {
  console.log((pass ? 'PASS' : 'FAIL') + ' - ' + name);
  if (!pass) ok = false;
}
console.log(ok ? '\nRESULT: ALL PASS' : '\nRESULT: FAILURES PRESENT');
process.exit(ok ? 0 : 1);
