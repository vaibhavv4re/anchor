import { taxConfigurationModel } from '../businessos/platform/accounting/taxConfigurationModel.js';

function approx(a, b, eps = 0.05) { return Math.abs(a - b) <= eps; }

// Build a config from defaults and mark one item as liquor via override.
const cfg = taxConfigurationModel.getDefaultConfiguration('tenant_test');
cfg.itemTaxMappings.categoryDefaults['BAR'] = 'ALCOHOL_SPIRITS'; // whole bar category = liquor VAT
cfg.itemTaxMappings.itemOverrides['MENU-VEG-1'] = { taxCategoryCode: 'EXEMPT' }; // one exempt dish

const items = [
  { itemCode: 'MENU-CHICK-1', category: 'CURRIES & DAALS', name: 'Chicken Curry', price: 300, quantity: 1 },
  { itemCode: 'MENU-VEG-1', category: 'CURRIES & DAALS', name: 'Exempt Dish', price: 100, quantity: 1 },
  { itemCode: 'BAR-01', category: 'BAR', name: 'Whisky', price: 500, quantity: 2 }
];

const res = taxConfigurationModel.computeBillTax({ items, discountRecords: [], config: cfg, isIntraState: true });

console.log('=== computeBillTax (mixed food + liquor + exempt) ===');
console.log('taxableAmount     :', res.taxableAmount);
console.log('cgst / sgst       :', res.cgstAmount, res.sgstAmount);
console.log('vatAmount (liquor):', res.vatAmount);
console.log('serviceCharge     :', res.serviceChargeAmount, '@', res.serviceChargePercent + '%');
console.log('taxLines          :', JSON.stringify(res.taxLines));
console.log('charges           :', JSON.stringify(res.charges));
console.log('grandTotal        :', res.grandTotal);
console.log('lineTaxes         :', res.lineTaxes.map(l => `${l.name}:${l.taxRuleCode} tax=${l.totalTax}`).join(' | '));

const checks = [];
checks.push(['line1 GST-FOOD-5', res.lineTaxes[0].taxRuleCode === 'GST-FOOD-5']);
checks.push(['line2 exempt TAX-EXEMPT', res.lineTaxes[1].taxRuleCode === 'TAX-EXEMPT']);
checks.push(['line3 liquor VAT rule', res.lineTaxes[2].taxRuleCode === 'LIQUOR-VAT-10']);
// food 300 @5% => 15 total (7.5 cgst + 7.5 sgst). exempt 0. liquor 1000 @10% => 100 VAT.
checks.push(['vat ~100', approx(res.vatAmount, 100)]);
// service charge eligible base = food+exempt (liquor excluded) = 300+100 = 400. 5% => 20
checks.push(['serviceCharge base excludes liquor, ~20', approx(res.serviceChargeAmount, 20)]);
// GST on service charge 5% of 20 = 1 => adds 0.5 cgst + 0.5 sgst => 7.5+0.5 = 8.0 each
checks.push(['cgst incl SC-tax ~8.0', approx(res.cgstAmount, 8.0)]);
checks.push(['sgst incl SC-tax ~8.0', approx(res.sgstAmount, 8.0)]);
// grandTotal = taxable(1400) + totalTax(8+8+100) + SC(20)
const expectedGrand = Math.round((res.taxableAmount + res.totalTax + res.serviceChargeAmount) * 100) / 100;
checks.push(['grandTotal consistent', approx(res.grandTotal, expectedGrand)]);

console.log('\n=== assertions ===');
let ok = true;
for (const [name, pass] of checks) {
  console.log((pass ? 'PASS' : 'FAIL') + ' - ' + name);
  if (!pass) ok = false;
}
console.log(ok ? '\nRESULT: ALL PASS' : '\nRESULT: FAILURES PRESENT');
process.exit(ok ? 0 : 1);
