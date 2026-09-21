// Verify rpc_record_sale_consumption v2 (UOM-aware) is live in Supabase.
// Probe 1: 8000 ML gin (= 8 LTR normalized) vs ~7.75 LTR on hand -> must be REJECTED.
//   v2 message contains "requires 8 LTR (raw: 8000 ML)"; v1 would say "requires 8000 ML".
//   Rejection happens inside Step 2 validation -> whole call rolls back, zero writes.
// Probe 2: replay an existing real operation id -> cached success, no mutation.
// Probe 3: confirm probe left no stock_operations rows.
const URL = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function main() {
  let r = await fetch(`${URL}/rpc/rpc_record_sale_consumption`, {
    method: 'POST', headers: H, body: JSON.stringify({
      p_tenant_id: 'tenant_h0qc7wf', p_operation_id: 'cons_uom_probe_check',
      p_reference_id: 'probe_only', p_reference_line_id: 'probe_line',
      p_recipe_id: null, p_recipe_version: 'v1.0',
      p_occurred_at: new Date().toISOString(), p_performed_by: 'Probe', p_correlation_id: 'probe',
      p_items: [{ itemCode: 'BAR0027', itemName: 'Gin Probe', locationCode: 'LOC-314', quantity: 8000, uom: 'ML' }]
    })
  });
  const j1 = await r.json();
  console.log('PROBE1 (8000 ML gin, expect rejection):');
  console.log(JSON.stringify(j1).slice(0, 400));

  r = await fetch(`${URL}/rpc/rpc_record_sale_consumption`, {
    method: 'POST', headers: H, body: JSON.stringify({
      p_tenant_id: 'tenant_h0qc7wf', p_operation_id: 'cons_tenant_h0qc7wf_ord_bk1i0b5_line_ord_bk1i0b5_1',
      p_reference_id: 'ord_bk1i0b5', p_reference_line_id: 'line_ord_bk1i0b5_1',
      p_recipe_id: 'rcp-kcwoqo3', p_recipe_version: 'v1.0',
      p_occurred_at: new Date().toISOString(), p_performed_by: 'Probe', p_correlation_id: 'probe',
      p_items: [{ itemCode: 'BAR0027', itemName: 'Gin', locationCode: 'LOC-314', quantity: 60, uom: 'ML' }]
    })
  });
  const j2 = await r.json();
  console.log('PROBE2 (replay existing op, expect idempotentReplay=true):');
  console.log(JSON.stringify(j2).slice(0, 300));

  r = await fetch(`${URL}/stock_operations?operation_id=eq.cons_uom_probe_check&select=operation_id`, { headers: H });
  const j3 = await r.json();
  console.log('PROBE3 (rows written by failed probe, expect []):', JSON.stringify(j3));

  const msg = (j1 && j1.message) || '';
  const v2 = msg.includes('raw: 8000 ML') && /requires 8(\.0+)? LTR/.test(msg);
  console.log(v2 ? '\nVERDICT: v2 UOM-AWARE function is LIVE.' : '\nVERDICT: could NOT confirm v2 — inspect PROBE1 message.');
}
main().catch(e => { console.error(e); process.exit(1); });
