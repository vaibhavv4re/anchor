// Live simulation of Step 1 import against the actual platform importer.
// Usage: node inventory_import_pack/_simulate_step1_import.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
// Import the real production importer.
const { categoryImportController } = await import(
  new URL('../businessos/platform/inventory/categoryImportController.js', import.meta.url).href
);
// offlineStore pulls in a chain that touches window; ensure it degrades gracefully in Node.
if (typeof globalThis.window === 'undefined') globalThis.window = undefined;

const csv = readFileSync(path.join(here, '01_Categories_v1.csv'), 'utf8');
const rows = categoryImportController.parseCsv(csv);
const tenantId = 'tenant-simulate-pack';
const result = categoryImportController.validateRows(rows, tenantId);

console.log('parsed rows:', rows.length);
console.log('isValid     :', result.isValid);
console.log('errors      :', result.errors.length);
console.log('warnings    :', result.warnings.length);
result.errors.slice(0, 5).forEach(e => console.log('  ERR', e.row, e.field, '-', e.message));
result.warnings.slice(0, 5).forEach(w => console.log('  WRN', w.row, w.field, '-', w.message));

if (!result.isValid) process.exit(1);
console.log('\nStep 1 CSV will pass the real importer ✔');
