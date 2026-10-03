/**
 * Read-only diagnostic: inspect the live Supabase rows that pin-login needs to
 * resolve a manager login. Prints the manager identity, its pin_hash match, and
 * every employees row (with the identity_id / status / workspace_default the
 * Edge Function filters on). Uses the public anon key; identity/employee tables
 * are read by the app the same way. Safe: SELECT only.
 * Usage: node scratch/diagnose_manager_rows.js
 */
const BASE = 'https://orlcftjkhqypvqzcmfci.supabase.co/rest/v1';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw';
const MANAGER_HASH = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92'; // sha256('123456')

const H = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };

async function get(table, params) {
  const url = `${BASE}/${table}?${params}`;
  const r = await fetch(url, { headers: H });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch (_) { json = text; }
  return { status: r.status, json };
}

// 1) The manager identity + whether its hash matches sha256('123456')
const ident = await get('identities', 'select=id,tenant_id,status,pin_hash&id=eq.id-manager-priya');
console.log('== identities (id-manager-priya) ==', ident.status);
console.log(JSON.stringify(ident.json, null, 2));
if (Array.isArray(ident.json) && ident.json[0]) {
  const row = ident.json[0];
  console.log('hash matches sha256(123456)?', row.pin_hash === MANAGER_HASH, '| status ACTIVE?', row.status === 'ACTIVE');
}

// 2) The exact query pin-login runs for the employee join
const join = await get('employees', `select=id,name,identity_id,role_id,workspace_default,status,tenant_id&identity_id=eq.id-manager-priya&status=eq.ACTIVE`);
console.log('\n== employees join (identity_id=id-manager-priya AND status=ACTIVE) ==', join.status);
console.log(JSON.stringify(join.json, null, 2));
console.log('rows returned by the EXACT pin-login filter:', Array.isArray(join.json) ? join.json.length : 'ERR');

// 3) All employees for the tenant (to see what the manager row actually looks like)
const all = await get('employees', 'select=id,name,identity_id,role_id,workspace_default,status,tenant_id&tenant_id=eq.tenant_h0qc7wf&order=name.asc');
console.log('\n== all tenant employees ==', all.status);
if (Array.isArray(all.json)) {
  for (const e of all.json) {
    console.log(`- ${e.id} | ${e.name} | identity=${e.identity_id} | role=${e.role_id} | ws=${e.workspace_default} | status=${e.status}`);
  }
  const mgrByRole = all.json.filter(e => e.role_id === 'role-manager' || e.workspace_default === 'manager');
  console.log('\nmanager-ish rows (role-manager or ws=manager):', mgrByRole.map(e => e.id));
} else {
  console.log('(not readable with anon key or error):', JSON.stringify(all.json));
}
