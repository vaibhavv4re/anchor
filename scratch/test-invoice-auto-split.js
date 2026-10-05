/**
 * Acceptance test for AUTO-SPLIT invoices (mixed Food+Bar bills).
 *
 * New default behavior under test:
 *   - issueInvoice() on a mixed bill (revision fiscalSections carry both FOOD
 *     and BAR items) ALWAYS issues the linked pair: FOOD/GST invoice + BAR/VAT
 *     invoice, distinct sequential numbers, one shared settlementId, combined
 *     payable on both records — the cashier never selects a split.
 *   - The returned anchor invoice is annotated { split, barInvoiceNumber,
 *     combinedGrandTotal } so the cashier alert / payment modal can settle the
 *     COMBINED total (each record's own grandTotal is only its section total).
 *   - Food-only, bar-only, and legacy drafts WITHOUT fiscalSections keep
 *     issuing a single consolidated invoice (no delegation loop).
 *   - Re-issue through issueInvoice() is idempotent (no numbers consumed).
 */
import { taxConfigurationModel } from '../businessos/platform/accounting/taxConfigurationModel.js';
import { invoiceModel } from '../businessos/platform/billing/invoiceModel.js';
import { offlineStore } from '../businessos/platform/offline_store/offlineStore.js';

const TENANT = 'tenant_h0qc7wf';
const approx = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;
const checks = [];
const check = (name, pass) => checks.push([name, !!pass]);

// ---- Saved tax config (no separate excise licence needed for these checks).
const saved = taxConfigurationModel.getDefaultConfiguration(TENANT);
saved.tenantId = TENANT;
saved.tenant_id = TENANT;
saved.barBilling = { separateExciseLicence: false, splitByDefault: false };

global.window = {
  __APP__: {
    platform: {
      dataGateway: {
        getCachedCollection: (name) => (name === 'tax_configurations' ? [saved] : []),
        create: () => Promise.resolve(),
        update: () => Promise.resolve(),
        isOperationProcessed: () => false,
        markOperationProcessed: () => {}
      }
    }
  }
};
global.sessionStorage = { getItem: () => JSON.stringify({ tenantId: TENANT }) };

saved.itemTaxMappings.categoryDefaults = {
  'CURRIES & DAALS': 'RESTAURANT_FOOD', 'STARTERS': 'RESTAURANT_FOOD',
  'WHISKY & LIQUOR': 'ALCOHOL_SPIRITS', 'BEER': 'ALCOHOL_BEER'
};

const mixedItems = [
  { itemCode: 'MENU-CHICK-1', category: 'CURRIES & DAALS', name: 'Chicken Curry', price: 300, quantity: 1 },
  { itemCode: 'MENU-PANEER', category: 'STARTERS', name: 'Paneer Tikka', price: 200, quantity: 1 },
  { itemCode: 'BAR-WHY-1', category: 'WHISKY & LIQUOR', name: 'Whisky', price: 500, quantity: 2 },
  { itemCode: 'BAR-BEER-1', category: 'BEER', name: 'Beer', price: 600, quantity: 1 }
];

offlineStore.setCollection('invoices', []);
offlineStore.setCollection('bill_revisions', []);

const seedRevision = (sessionId, revId, billTax, itemsUsed) => {
  offlineStore.appendItem('bill_revisions', {
    id: revId, tenantId: TENANT, tenant_id: TENANT,
    sessionId, session_id: sessionId, billNumber: 'B-' + revId, revisionNumber: 1,
    tableNumber: 7, tableCode: 'T-07', waiterId: 'emp-w1', waiterName: 'Ravi',
    correlationId: 'SETTLE-' + revId,
    items: itemsUsed, grossSales: billTax.subtotal, discountsTotal: 0,
    taxableAmount: billTax.taxableAmount, taxLines: billTax.taxLines, charges: billTax.charges || [],
    serviceChargeAmount: billTax.serviceChargeAmount, grandTotal: billTax.grandTotal,
    fiscalSections: billTax.fiscalSections, status: 'FINALIZED'
  });
};

// =============== 1. Mixed bill via the DEFAULT issueInvoice() path ===============
const sessMixed = 'sess_auto_mixed';
const mixedTax = taxConfigurationModel.computeBillTax({ items: mixedItems, discountRecords: [], isIntraState: true, tenantId: TENANT });
seedRevision(sessMixed, 'rev_mixed_1', mixedTax, mixedItems);

const anchor = invoiceModel.issueInvoice({ sessionId: sessMixed, cashierId: 'emp-cash', cashierName: 'Cashier' });
const pair = invoiceModel.getAllInvoicesForSession(sessMixed);
const foodRec = pair.find(i => i.billClass === 'FOOD');
const barRec = pair.find(i => i.billClass === 'BAR');
const foodSec = mixedTax.fiscalSections.find(s => s.section === 'FOOD');
const barSec = mixedTax.fiscalSections.find(s => s.section === 'BAR');
const combined = Math.round((foodSec.sectionTotal + barSec.sectionTotal) * 100) / 100;

check('mixed issueInvoice() produced exactly 2 invoice records', pair.length === 2 && !!foodRec && !!barRec);
check('anchor returned to caller is the FOOD/GST record', anchor && anchor.id === foodRec.id);
check('anchor annotated split + barInvoiceNumber + combinedGrandTotal',
  anchor.split === true && anchor.barInvoiceNumber === barRec.invoiceNumber && approx(anchor.combinedGrandTotal, combined));
check('numbers are distinct and sequential', !!foodRec.invoiceNumber && !!barRec.invoiceNumber && foodRec.invoiceNumber !== barRec.invoiceNumber);
check('shared settlementId on both records', foodRec.settlementId === barRec.settlementId && !!foodRec.settlementId);
check('per-record grandTotals sum to combined payable', approx(foodRec.grandTotal + barRec.grandTotal, combined));
check('FOOD record taxed with GST (CGST/SGST), no VAT',
  (foodRec.taxLines || []).some(t => t.type === 'CGST' || t.type === 'SGST') && (foodRec.vatAmount || 0) === 0);
check('BAR record taxed with LIQUOR_VAT, no GST',
  (barRec.taxLines || []).some(t => t.type === 'LIQUOR_VAT') && (barRec.cgstAmount || 0) === 0 && (barRec.sgstAmount || 0) === 0);
check('both records cross-reference each other', foodRec.barInvoiceNumber === barRec.invoiceNumber && barRec.foodInvoiceNumber === foodRec.invoiceNumber);
check('revision marked ISSUED against the FOOD number',
  (offlineStore.getCollection('bill_revisions').find(r => r.id === 'rev_mixed_1') || {}).invoiceNumber === foodRec.invoiceNumber);

// =============== 2. Idempotency via the default path ===============
const rowsBefore = invoiceModel.getAllInvoices(TENANT).length;
const anchor2 = invoiceModel.issueInvoice({ sessionId: sessMixed, cashierId: 'emp-cash', cashierName: 'Cashier' });
check('re-issue returns same anchor number, no new rows',
  anchor2.invoiceNumber === foodRec.invoiceNumber && invoiceModel.getAllInvoices(TENANT).length === rowsBefore);

// =============== 3. Food-only bill = single consolidated invoice ===============
const sessFood = 'sess_auto_food';
const foodTax = taxConfigurationModel.computeBillTax({ items: mixedItems.slice(0, 2), discountRecords: [], isIntraState: true, tenantId: TENANT });
seedRevision(sessFood, 'rev_food_1', foodTax, mixedItems.slice(0, 2));
const foodAnchor = invoiceModel.issueInvoice({ sessionId: sessFood, cashierId: 'emp-cash', cashierName: 'Cashier' });
const foodRows = invoiceModel.getAllInvoicesForSession(sessFood);
check('food-only issues exactly 1 invoice (no split, no loop)', foodRows.length === 1 && !foodAnchor.split);
check('food-only invoice carries the full bill grandTotal', approx(foodAnchor.grandTotal, foodTax.grandTotal));

// =============== 4. Bar-only bill = single consolidated invoice ===============
const sessBar = 'sess_auto_bar';
const barTax = taxConfigurationModel.computeBillTax({ items: mixedItems.slice(2), discountRecords: [], isIntraState: true, tenantId: TENANT });
seedRevision(sessBar, 'rev_bar_1', barTax, mixedItems.slice(2));
const barAnchor = invoiceModel.issueInvoice({ sessionId: sessBar, cashierId: 'emp-cash', cashierName: 'Cashier' });
const barRows = invoiceModel.getAllInvoicesForSession(sessBar);
check('bar-only issues exactly 1 invoice (no split)', barRows.length === 1 && !barAnchor.split);

// =============== 5. Legacy draft without fiscalSections = single invoice ===============
const sessLegacy = 'sess_legacy_no_sections';
offlineStore.appendItem('bill_revisions', {
  id: 'rev_legacy_1', tenantId: TENANT, tenant_id: TENANT,
  sessionId: sessLegacy, session_id: sessLegacy, billNumber: 'B-L1', revisionNumber: 1,
  tableNumber: 9, tableCode: 'T-09', correlationId: 'SETTLE-L1',
  items: mixedItems, grossSales: 1600, discountsTotal: 0, grandTotal: 1800,
  fiscalSections: [], status: 'FINALIZED'
});
const legacyAnchor = invoiceModel.issueInvoice({ sessionId: sessLegacy, cashierId: 'emp-cash', cashierName: 'Cashier' });
const legacyRows = invoiceModel.getAllInvoicesForSession(sessLegacy);
check('legacy revision (no fiscalSections) issues 1 invoice, terminates', legacyRows.length === 1 && !legacyAnchor.split);

// =============== Output ===============
console.log('=== auto-split (issueInvoice) assertions ===');
console.log('combined payable:', combined, '| FOOD:', foodRec && foodRec.grandTotal, '| BAR:', barRec && barRec.grandTotal);
console.log('food#:', foodRec && foodRec.invoiceNumber, '| bar#:', barRec && barRec.invoiceNumber, '| settlement:', foodRec && foodRec.settlementId);
let ok = true;
for (const [name, pass] of checks) { console.log((pass ? 'PASS' : 'FAIL') + ' - ' + name); if (!pass) ok = false; }
console.log(ok ? '\nRESULT: ALL PASS' : '\nRESULT: FAILURES PRESENT');
process.exit(ok ? 0 : 1);
