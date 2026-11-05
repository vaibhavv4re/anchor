/**
 * Read-only: dump full employee + identity rows (all columns) and the tenant
 * admin profile, so the live user/PIN/role matrix can be reported accurately.
 * Run: node scratch/report_live_users_detail.js
 */
const URL_BASE = 'https://orlcftjkhqypvqzcmfci.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw';

async function main() {
  const r = await fetch(`${URL_BASE}/functions/v1/pin-login`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '999999', deviceId: 'REPORT-01' })
  });
  const j = await r.json();
  if (!j.token) { console.error('no token', j); return; }
  const H = { apikey: ANON, Authorization: `Bearer ${j.token}`, Accept: 'application/json' };
  const get = async (t, q = 'select=*') => {
    const res = await fetch(`${URL_BASE}/rest/v1/${t}?${q}`, { headers: H });
    return res.ok ? res.json() : { __err: `${res.status} ${await res.text()}` };
  };

  const emps = await get('employees');
  console.log('=== EMPLOYEES (full) ===');
  for (const e of [].concat(emps)) console.log(JSON.stringify(e));

  const ids = await get('identities');
  console.log('\n=== IDENTITIES (full) ===');
  for (const i of [].concat(ids)) console.log(JSON.stringify(i));

  const tenants = await get('tenants');
  console.log('\n=== TENANTS ===');
  for (const t of [].concat(tenants)) {
    console.log(JSON.stringify({ tenant_id: t.tenant_id || t.id, name: t.name || (t.data && t.data.name), admin_pin: t.admin_pin, role: t.admin_role, status: t.status }));
  }
}
main();
