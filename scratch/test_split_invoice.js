/**
 * Focused verification of the Food/Bar SPLIT invoice engine (issueSplitInvoices).
 * Proves, against a realistic saved tax config:
 *   - a settled mixed table produces TWO linked fiscal documents (FOOD/GST + BAR/VAT)
 *   - both share one settlementId + carry the SAME combined grand total payable
 *   - per-document totals sum back to the combined total
 *   - the BAR document adopts the configured separate excise-licence identity
 *   - re-printing is idempotent (no duplicate invoice numbers consumed)
 *   - a food-only table (no BAR) falls back to a single consolidated invoice
 */
import { taxConfigurationModel } from '../businessos/platform/accounting/taxConfigurationModel.js';
import { invoiceModel } from '../businessos/platform/billing/invoiceModel.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

const TENANT = 'tenant_h0qc7wf';
const approx = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;

// ---- 1. A "saved by CA" config that enables a SEPARATE excise licence for the bar.
const saved = taxConfigurationModel.getDefaultConfiguration(TENANT);
saved.tenantId = TENANT;
saved.tenant_id = TENANT;
saved.barBilling = {
  separateExciseLicence: true,
  licenceName: 'Anchor Excise Bar Pvt',
  licenceNumber: 'EXC/MH/2026/0012',
  gstin: '27BBBBB1111B1Z5',
  address: 'Ground Floor, Ocean Heights, Bandra West, Mumbai 400050',
  splitByDefault: true
};

const created = [];
global.window = {
  __APP__: {
    platform: {
      dataGateway: {
        getCachedCollection: (name) => (name === 'tax_configurations' ? [saved] : []),
        create: (entity, rec) => { created.push({ entity, id: rec && rec.id }); return Promise.resolve(rec); },
        update: () => Promise.resolve()
      }
    }
  }
};
global.sessionStorage = { getItem: () => JSON.stringify({ tenantId: TENANT }) };

// ---- 2. Build a mixed food + bar bill and derive its fiscalSections from the engine.
const items = [
  { itemCode: 'MENU-CHICK-1', category: 'CURRIES & DAALS', name: 'Chicken Curry', price: 300, quantity: 1 },
  { itemCode: 'MENU-PANEER',  category: 'STARTERS',        name: 'Paneer Tikka',  price: 200, quantity: 1 },
  { itemCode: 'BAR-WHY-1',    category: 'WHISKY & LIQUOR', name: 'Whisky',        price: 500, quantity: 2 },
  { itemCode: 'BAR-BEER-1',   category: 'BEER',            name: 'Beer',          price: 600, quantity: 1 }
];
// Route the menu categories to tax categories the default config understands.
saved.itemTaxMappings.categoryDefaults = {
  'CURRIES & DAALS': 'RESTAURANT_FOOD', 'STARTERS': 'RESTAURANT_FOOD',
  'WHISKY & LIQUOR': 'ALCOHOL_SPIRITS', 'BEER': 'ALCOHOL_BEER'
};
const billTax = taxConfigurationModel.computeBillTax({ items, discountRecords: [], isIntraState: true, tenantId: TENANT });

// ---- 3. Seed a finalized revision (the frozen snapshot the cashier prints from).
const sessionId = 'sess_split_test';
offlineStore.setCollection('invoices', []);
offlineStore.setCollection('bill_revisions', [{
  id: 'rev_split_1', tenantId: TENANT, tenant_id: TENANT,
  sessionId, session_id: sessionId, billNumber: 'B-1', revisionNumber: 1,
  tableNumber: 7, tableCode: 'T-07', waiterId: 'emp-w1', waiterName: 'Ravi',
  correlationId: 'SETTLE-TEST-1',
  grossSales: billTax.subtotal, discountsTotal: 0,
  taxableAmount: billTax.taxableAmount, serviceChargeAmount: billTax.serviceChargeAmount,
  grandTotal: billTax.grandTotal, fiscalSections: billTax.fiscalSections, status: 'FINALIZED'
}]);

// ---- 4. Issue the split.
const res = invoiceModel.issueSplitInvoices({ sessionId, cashierId: 'emp-cash', cashierName: 'Cashier' });

const checks = [];
const foodSec = billTax.fiscalSections.find(s => s.section === 'FOOD');
const barSec = billTax.fiscalSections.find(s => s.section === 'BAR');
const combined = Math.round((foodSec.sectionTotal + barSec.sectionTotal) * 100) / 100;

checks.push(['two invoices returned', res.invoices && res.invoices.length === 2]);
checks.push(['food invoice is FOOD/GST', res.foodInvoice && res.foodInvoice.billClass === 'FOOD' && res.foodInvoice.vatAmount === 0]);
checks.push(['bar invoice is BAR/VAT', res.barInvoice && res.barInvoice.billClass === 'BAR' && res.barInvoice.vatAmount > 0]);
checks.push(['both share one settlementId', res.foodInvoice.settlementId === res.barInvoice.settlementId]);
checks.push(['both carry combined payable = section sum', approx(res.combinedGrandTotal, combined)
  && res.foodInvoice.combinedGrandTotal === combined && res.barInvoice.combinedGrandTotal === combined]);
checks.push(['per-doc totals sum to combined', approx(res.foodInvoice.grandTotal + res.barInvoice.grandTotal, combined)]);
checks.push(['bar identity = configured excise licence', res.barInvoice.restaurantName === 'Anchor Excise Bar Pvt'
  && res.barInvoice.gstin === '27BBBBB1111B1Z5' && res.barInvoice.exciseLicenceNumber === 'EXC/MH/2026/0012']);
checks.push(['food identity = restaurant (not bar licence)', res.foodInvoice.restaurantName !== 'Anchor Excise Bar Pvt']);
checks.push(['invoice numbers are distinct', !!res.foodInvoice.invoiceNumber && !!res.barInvoice.invoiceNumber
  && res.foodInvoice.invoiceNumber !== res.barInvoice.invoiceNumber]);
checks.push(['both synced to cloud (2 invoice rows)', created.filter(c => c.entity === 'invoices').length === 2]);

// ---- 5. Idempotency: re-issue returns the same pair, no new numbers consumed.
const before = invoiceModel.getAllInvoices(TENANT).length;
const res2 = invoiceModel.issueSplitInvoices({ sessionId, cashierId: 'emp-cash', cashierName: 'Cashier' });
checks.push(['re-issue is idempotent (same numbers)', res2.foodInvoice.invoiceNumber === res.foodInvoice.invoiceNumber
  && res2.barInvoice.invoiceNumber === res.barInvoice.invoiceNumber]);
checks.push(['re-issue adds no new invoice rows', invoiceModel.getAllInvoices(TENANT).length === before]);

// ---- 6. Fallback: a food-only table produces a single consolidated invoice.
const sessFood = 'sess_food_only';
const foodTax = taxConfigurationModel.computeBillTax({ items: items.slice(0, 2), discountRecords: [], isIntraState: true, tenantId: TENANT });
offlineStore.appendItem('bill_revisions', {
  id: 'rev_food_1', tenantId: TENANT, tenant_id: TENANT, sessionId: sessFood, session_id: sessFood,
  billNumber: 'B-2', revisionNumber: 1, tableNumber: 8, tableCode: 'T-08', correlationId: 'SETTLE-FOOD-1',
  grandTotal: foodTax.grandTotal, fiscalSections: foodTax.fiscalSections, status: 'FINALIZED'
});
const resFood = invoiceModel.issueSplitInvoices({ sessionId: sessFood, cashierId: 'emp-cash', cashierName: 'Cashier' });
checks.push(['food-only falls back to single invoice', resFood.invoices.length === 1 && resFood.barInvoice === null]);

console.log('=== issueSplitInvoices assertions ===');
console.log('combined payable:', combined, '| FOOD doc:', res.foodInvoice.grandTotal, '| BAR doc:', res.barInvoice.grandTotal);
console.log('food#:', res.foodInvoice.invoiceNumber, '| bar#:', res.barInvoice.invoiceNumber);
let ok = true;
for (const [name, pass] of checks) { console.log((pass ? 'PASS' : 'FAIL') + ' - ' + name); if (!pass) ok = false; }
console.log(ok ? '\nRESULT: ALL PASS' : '\nRESULT: FAILURES PRESENT');
process.exit(ok ? 0 : 1);
