// Generates 07_Supplier_Catalogue_v1.csv from 05_Inventory_Master_v1.csv
// Maps every dry-goods item to SUP-103 (Royal Spice & Grocery Supplies).
// Usage: node inventory_import_pack/_generate_supplier_catalogue.js
const fs = require('fs');
const path = require('path');
const dir = __dirname;

function parseCsv(file) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const header = splitLine(lines[0]).map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const cells = splitLine(line);
    const row = {};
    header.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    return row;
  });
}
function splitLine(line) {
  const out = []; let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur); return out;
}
function csvEscape(s) {
  s = String(s ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function gstNumber(profile) {
  const m = String(profile || '').match(/(\d+(?:\.\d+)?)/);
  return m ? m[1] : '';
}

const items = parseCsv('05_Inventory_Master_v1.csv');
const header = 'supplier_code,item_code,supplier_sku,supplier_item_name,purchase_uom,pack_quantity,pack_uom,unit_price,gst_rate,moq,lead_time_days,preferred,active';
const rows = [header];
items.forEach(i => {
  const cells = [
    'SUP-103',
    i.item_code,
    i.supplier_item_code || i.item_code,
    i.item_name,
    i.purchase_uom,
    i.conversion_factor || '1',
    i.base_uom,
    i.last_purchase_price,
    gstNumber(i.purchase_tax_profile),
    '1',
    '2',
    'true',
    'true'
  ];
  rows.push(cells.map(csvEscape).join(','));
});
fs.writeFileSync(path.join(dir, '07_Supplier_Catalogue_v1.csv'), rows.join('\n') + '\n', 'utf8');
console.log('Wrote 07_Supplier_Catalogue_v1.csv with', items.length, 'rows (all mapped to SUP-103).');
