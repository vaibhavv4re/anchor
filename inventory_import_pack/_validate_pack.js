// Validates the CANON-11 6-step inventory import pack referential integrity.
// Usage: node inventory_import_pack/_validate_pack.js
const fs = require('fs');
const path = require('path');

const dir = __dirname;

function parseCsv(file) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  // Importers do NOT skip '#' comment lines - the first non-blank line is the header.
  // We mirror that behavior here so this validator matches production reality.
  const dataLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (dataLines.length < 2) return [];
  const header = splitLine(dataLines[0]).map(h => h.trim().toLowerCase());
  return dataLines.slice(1).map((line, i) => {
    const cells = splitLine(line);
    const row = { _rowNum: i + 2 };
    header.forEach((h, idx) => { row[h] = (cells[idx] || '').trim(); });
    return row;
  });
}

function splitLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

// ---- Load all 6 files ----
const taxRows = parseCsv('01_Categories_v1.csv');
const famRows = taxRows.filter(r => (r.record_type || '').toUpperCase() === 'PRODUCT_FAMILY');
const catRows = taxRows.filter(r => (r.record_type || '').toUpperCase() === 'CATEGORY');
const famCodes = new Set(famRows.map(r => r.code.toUpperCase()));
const cats = new Set(catRows.map(r => r.code.toUpperCase()));
const uoms = new Set(parseCsv('02_Units_v1.csv').map(r => r.uom_code.toUpperCase()));
const locs = new Set(parseCsv('03_Storage_Locations_v1.csv').map(r => r.location_code.toUpperCase()));
const supp = new Set(parseCsv('04_Suppliers_v1.csv').map(r => r.supplier_code.toUpperCase()));
const items = parseCsv('05_Inventory_Master_v1.csv');
const opening = parseCsv('06_Opening_Stock_v1.csv');

// ---- Cross-checks ----
const errs = [];
const warn = [];

// Category -> Product Family FK
catRows.forEach(r => {
  if (!famCodes.has((r.product_family_code || '').toUpperCase())) {
    errs.push(`Cat ${r.code}: product_family_code "${r.product_family_code}" not declared in file 01.`);
  }
});

// Item -> Category / UOM / Location / Supplier
const itemCodes = new Set();
const dupeCodes = [];
items.forEach(i => {
  const c = i.item_code.toUpperCase();
  if (itemCodes.has(c)) dupeCodes.push(c);
  itemCodes.add(c);
  if (!cats.has((i.category_code || '').toUpperCase())) errs.push(`${i.item_code}: category_code "${i.category_code}" missing from 01.`);
  if (!uoms.has((i.base_uom || '').toUpperCase())) errs.push(`${i.item_code}: base_uom "${i.base_uom}" missing from 02.`);
  if (!uoms.has((i.purchase_uom || '').toUpperCase())) errs.push(`${i.item_code}: purchase_uom "${i.purchase_uom}" missing from 02.`);
  if (!locs.has((i.default_location_code || '').toUpperCase())) errs.push(`${i.item_code}: default_location_code "${i.default_location_code}" missing from 03.`);
  if (!supp.has((i.preferred_supplier_code || '').toUpperCase())) errs.push(`${i.item_code}: preferred_supplier_code "${i.preferred_supplier_code}" missing from 04.`);
});

// Opening stock -> item + location
opening.forEach(o => {
  if (!itemCodes.has((o.item_code || '').toUpperCase())) errs.push(`06 orphan: ${o.item_code}`);
  if (!locs.has((o.location_code || '').toUpperCase())) errs.push(`06 bad loc: ${o.location_code}`);
  if (!o.unit) warn.push(`06 ${o.item_code}: unit blank`);
});

// Supplier catalogue -> supplier + item (optional file 07)
let catalogue = [];
try { catalogue = parseCsv('07_Supplier_Catalogue_v1.csv'); } catch (_) { /* optional */ }
const seenComposite = new Set();
catalogue.forEach(c => {
  const sc = (c.supplier_code || '').toUpperCase();
  const ic = (c.item_code || '').toUpperCase();
  const key = sc + '::' + ic;
  if (!supp.has(sc)) errs.push(`07 bad supplier: ${sc}`);
  if (!itemCodes.has(ic)) errs.push(`07 bad item: ${ic}`);
  if (seenComposite.has(key)) errs.push(`07 duplicate composite: ${key}`);
  seenComposite.add(key);
});

console.log('01 families:', famCodes.size, 'categories:', cats.size);
console.log('02 uoms:', uoms.size, '| 03 locs:', locs.size, '| 04 suppliers:', supp.size);
console.log('05 items:', items.length, '| 06 opening rows:', opening.length, '| 07 catalogue rows:', catalogue.length);
console.log('dupe item_codes:', dupeCodes);
warn.forEach(w => console.log('WARN:', w));
errs.forEach(e => console.log('ERR :', e));
const ok = errs.length === 0 && dupeCodes.length === 0;
console.log(ok ? '\nPACK OK ✔ referential integrity holds across all 6 steps.' : '\nPACK BROKEN ✘ fix issues above.');
process.exit(ok ? 0 : 1);
