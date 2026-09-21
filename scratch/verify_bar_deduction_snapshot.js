/**
 * Before/After verification snapshot for BAR deduction test (BOT READY flow).
 * Usage: node scratch/verify_bar_deduction_snapshot.js before
 *        node scratch/verify_bar_deduction_snapshot.js after
 * Prints stock_balances at LOC-314 for all BAR SKUs + latest stock_operations/transactions.
 */
import { SupabaseClient } from '../businessos/platform/cloud/supabaseClient.js';

const mode = process.argv[2] || 'before';
const TENANT_ID = process.argv[3] || 'tenant_h0qc7wf';
const client = new SupabaseClient();

async function fetchAll(table, filter) {
  const url = `${client.baseUrl}/${table}?${filter}&select=*`;
  const res = await fetch(url, {
    headers: { apikey: client.anonKey, Authorization: `Bearer ${client.anonKey}` }
  });
  if (!res.ok) throw new Error(`${table} -> ${res.status} ${await res.text()}`);
  return res.json();
}

console.log(`\n================ BAR DEDUCTION SNAPSHOT [${mode.toUpperCase()}] ================`);
console.log(`Tenant: ${TENANT_ID}`);

const balances = await fetchAll('stock_balances', `tenant_id=eq.${TENANT_ID}&location_code=eq.LOC-314&order=item_code.asc`);
console.log(`\n--- stock_balances @ LOC-314 (${balances.length} rows) ---`);
const balMap = {};
for (const b of balances) {
  const code = b.item_code || b.data?.itemCode;
  const qty = parseFloat(b.quantity !== undefined ? b.quantity : (b.data?.quantity || 0));
  balMap[code] = qty;
  console.log(`${code.padEnd(10)} qty=${qty}`);
}

const txns = await fetchAll('stock_transactions', `tenant_id=eq.${TENANT_ID}&location_code=eq.LOC-314&order=created_at.desc&limit=15`);
console.log(`\n--- latest 15 stock_transactions @ LOC-314 ---`);
for (const t of txns) {
  console.log(`[${t.created_at}] ${t.transaction_type} | ${t.item_code} | qty=${t.quantity} ${t.uom || ''} | ref=${t.reference_id || t.referenceId} line=${t.reference_line_id || t.referenceLineId} | op=${t.operation_id || t.operationId}`);
}

const ops = await fetchAll('stock_operations', `tenant_id=eq.${TENANT_ID}&order=created_at.desc&limit=10`);
console.log(`\n--- latest 10 stock_operations ---`);
for (const o of ops) {
  console.log(`[${o.created_at}] ${o.operation_type} | status=${o.status} | op=${o.operation_id || o.operationId} | ref=${o.reference_id} line=${o.reference_line_id}`);
}

console.log(`\n--- BAL MAP JSON (for diff) ---`);
console.log(JSON.stringify({ mode, tenantId: TENANT_ID, balances: balMap }));
console.log('==========================================================\n');
