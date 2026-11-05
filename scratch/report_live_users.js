/**
 * Read-only live query: mint a tenant-admin JWT via the pin-login Edge
 * Function (bootstrap admin PIN 999999 -> primary tenant), then pull the
 * current employees + identities rows (incl. data.pinDisplay) and roles.
 *
 * Run: node scratch/report_live_users.js
 */

const URL_BASE = 'https://orlcftjkhqypvqzcmfci.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw';

async function main() {
  // 1. Mint tenant-admin JWT.
  let token;
  try {
    const r = await fetch(`${URL_BASE}/functions/v1/pin-login`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '999999', deviceId: 'REPORT-01' })
    });
    const j = await r.json();
    if (!r.ok || !j.token) throw new Error(`pin-login ${r.status}: ${JSON.stringify(j)}`);
    token = j.token;
    console.log('MINTED claims:', JSON.stringify(j.claims));
  } catch (e) {
    console.error('Could not mint tenant JWT:', e.message);
    return;
  }

  // Supabase requires apikey=anon/public key; Authorization carries the JWT.
  const H = { apikey: ANON, Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const get = async (tbl) => {
    const r = await fetch(`${URL_BASE}/rest/v1/${tbl}?select=*`, { headers: H });
    if (!r.ok) { console.error(`${tbl} -> ${r.status}`, await r.text()); return []; }
    return r.json();
  };

  const [roles, identities] = await Promise.all([get('roles'), get('identities')]);
  const employees = await get('employees');

  const roleMap = {};
  (roles || []).forEach(rr => { roleMap[rr.id || rr.role_id] = rr.name || rr.role_name || (rr.data && rr.data.name); });

  console.log(`\n--- EMPLOYEES (${employees.length}) ---`);
  for (const e of employees) {
    const d = e.data || {};
    const pin = d.pinDisplay || d.pin || '(hashed-only)';
    const roleId = e.role_id || e.roleId;
    console.log(`${(e.name || d.name || '?').padEnd(20)} | ${String(roleId).padEnd(20)} | ${roleMap[roleId] || ''} | PIN: ${pin} | ws: ${e.workspace_default || d.workspaceDefault} | ${e.status}`);
  }

  console.log(`\n--- IDENTITIES (${(identities || []).length}) ---`);
  for (const i of identities || []) {
    const d = i.data || {};
    console.log(`id=${i.id} | emp=${d.employeeId || d.employee_id || ''} | PIN: ${d.pin || d.pinDisplay || '(hash only)'} | status=${i.status}`);
  }

  console.log(`\n--- ROLES (${(roles || []).length}) ---`);
  for (const rr of roles || []) {
    console.log(`${(rr.id || rr.role_id)} -> ${rr.name || rr.role_name || (rr.data && rr.data.name)}`);
  }
}

main();
