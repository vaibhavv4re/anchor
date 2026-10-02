/**
 * Live-config verification: uses the EXACT categoryDefaults seeded into cloud
 * tax_configurations and the 3 items from the reported bill, to prove the engine
 * now splits Food vs Bar (liquor VAT) on the waiter/cashier read path.
 */
import { taxConfigurationModel } from '../businessos/platform/accounting/taxConfigurationModel.js';

const TENANT = 'tenant_h0qc7wf';
const saved = taxConfigurationModel.getDefaultConfiguration(TENANT);
saved.tenantId = TENANT;
saved.tenant_id = TENANT;
// Same mapping seeded to cloud (10% VAT default kept).
saved.itemTaxMappings.categoryDefaults = {
  'BEVERAGES & BAR': 'RESTAURANT_BEVERAGE', 'BEVERAGES': 'RESTAURANT_BEVERAGE',
  'BEVERAGE': 'RESTAURANT_BEVERAGE', 'BAR': 'RESTAURANT_BEVERAGE', 'MOCKTAILS': 'RESTAURANT_BEVERAGE',
  'SINGLE MALT SCOTCH WHISKY': 'ALCOHOL_SPIRITS', 'BLENDED SCOTCH WHISKY': 'ALCOHOL_SPIRITS',
  'PREMIUM WHISKY': 'ALCOHOL_SPIRITS', 'DOMESTIC WHISKY': 'ALCOHOL_SPIRITS', 'GIN': 'ALCOHOL_SPIRITS',
  'RUM': 'ALCOHOL_SPIRITS', 'VODKA': 'ALCOHOL_SPIRITS', 'TEQUILA': 'ALCOHOL_SPIRITS',
  'BRANDY': 'ALCOHOL_SPIRITS', 'BREEZER': 'ALCOHOL_SPIRITS', 'COCKTAILS': 'ALCOHOL_SPIRITS',
  'MILD BEER': 'ALCOHOL_BEER', 'STRONG BEER': 'ALCOHOL_BEER', 'HOUSE WINES': 'ALCOHOL_WINE'
};

global.window = { __APP__: { platform: { dataGateway: { getCachedCollection: (n) => (n === 'tax_configurations' ? [saved] : []) } } } };

const items = [
  { itemCode: 'X-POT',   category: 'STARTERS & APPETIZERS',        name: 'Grilled Spicy Potatoes',      price: 220, quantity: 2 },
  { itemCode: 'RC-BAR-105', category: 'SINGLE MALT SCOTCH WHISKY', name: 'Singleton Luscious 12 Yr (30ml)', price: 480, quantity: 1 },
  { itemCode: 'RC-BAR-127', category: 'GIN',                       name: 'Greater Than London Dry Gin (30ml)', price: 180, quantity: 1 }
];

const b = taxConfigurationModel.computeBillTax({ items, discountRecords: [], isIntraState: true, tenantId: TENANT });
const secs = b.fiscalSections || [];
console.log('sections:', secs.map(s => `${s.section}(${s.items.length})`));
for (const s of secs) {
  console.log(`\n[${s.section}] ${s.label}  subtotal=${s.subtotal} taxable=${s.taxableAmount} VAT=${s.vatAmount} CGST=${s.cgstAmount} SGST=${s.sgstAmount} SC=${s.serviceChargeAmount} total=${s.sectionTotal}`);
  s.items.forEach(i => console.log('   -', i.name, '->', i.taxCategoryCode, '/', i.taxRuleCode));
}
const bar = secs.find(s => s.section === 'BAR');
const ok = !!bar && bar.items.length === 2 && b.vatAmount > 0;
console.log('\nRESULT:', ok ? 'SPLIT OK (BAR has 2 liquor items, vatAmount=' + b.vatAmount + ')' : 'SPLIT FAILED');
