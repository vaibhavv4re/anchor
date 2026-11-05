/**
 * scratch/cleanup_live_data.js  (Phase 3 - live data-cleanup + verification)
 *
 * Brings the LIVE tenant_h0qc7wf rows in line with the hardened auth model:
 *   1. Re-hash any identity whose pin_hash is a plaintext/short value, using the
 *      known staff PINs (below). Only rows we can confidently derive are touched;
 *      anything else is reported so an admin can force a PIN reset.
 *   2. Provision a hashed identity for the tenant admin (PIN 999999) and the
 *      superadmin (PIN 888888, tenant 'system') so pin-login resolves them via
 *      identities instead of the retired plaintext tenants.admin_pin.
 *   3. Normalize each employee to one authoritative identity_id.
 *   4. --verify: print the 1:1 employee -> identity -> role matrix and flag any
 *      plaintext / orphan / unlinked rows.
 *
 * DRY-RUN BY DEFAULT. Nothing is written unless you pass --apply.
 * The service_role key is read from the environment; it is NEVER hardcoded:
 *   $env:SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 * Usage:
 *   node scratch/cleanup_live_data.js               # read-only plan
 *   node scratch/cleanup_live_data.js --apply       # execute writes
 *   node scratch/cleanup_live_data.js --verify      # report the matrix only
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Known staff PINs (retained during cleanup per plan Assumptions; admins may
// rotate afterwards). Keyed by the live employee name.
const PIN_BY_NAME = {
  'Sachin': '123456',        // role-manager
  'Aabhas': '111111',        // role-chef
  'Suresh': '222222',        // role-waiter
  'Kirtan': '333333',        // role-inventory
  'Sibu': '555555',          // role-bartender
  'Jitu': '666666',          // role-cashier
  'Test CA': '444444',       // role-ca
  'CA Auditor': '266871'     // role-ca
};

const ADMIN_PIN = '999999';
const SUPERADMIN_PIN = '888888';
const SYSTEM_TENANT = 'system';

const sha256 = (v) => createHash('sha256').update(String(v)).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/;

function resolveConfig() {
  // Prefer explicit env; fall back to values already used by the read-only
  // report scripts (URL + anon are not secrets). The SERVICE ROLE key must come
  // from the environment - there is deliberately no default for it.
  let url = process.env.SUPABASE_URL;
  let anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    try {
      const src = readFileSync(join(__dirname, 'report_live_users.js'), 'utf8');
      url = url || (src.match(/URL_BASE = '([^']+)'/) || [])[1];
      anon = anon || (src.match(/ANON = '([^']+)'/) || [])[1];
    } catch { /* ignore */ }
  }
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, anon, service };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const verifyOnly = process.argv.includes('--verify');
  const { url, anon, service } = resolveConfig();
  if (!url || !anon) { console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY.'); process.exit(1); }
  if (!verifyOnly && !service) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY (required to write). Set it in the environment.');
    process.exit(1);
  }

  const H = { apikey: service || anon, Authorization: `Bearer ${service || anon}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const get = async (t) => { const r = await fetch(`${url}/rest/v1/${t}?select=*`, { headers: H }); if (!r.ok) { console.error(`${t} ${r.status}`, await r.text()); return []; } return r.json(); };
  const patch = async (t, q, body) => { const r = await fetch(`${url}/rest/v1/${t}?${q}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) }); if (!r.ok) console.error(`PATCH ${t} ${r.status}`, await r.text()); return r.ok; };
  const post = async (t, body) => { const r = await fetch(`${url}/rest/v1/${t}`, { method: 'POST', headers: H, body: JSON.stringify(Array.isArray(body) ? body : [body]) }); if (!r.ok) console.error(`POST ${t} ${r.status}`, await r.text()); return r.ok; };

  const [employees, identities, tenants] = await Promise.all([get('employees'), get('identities'), get('tenants')]);
  const empByIdentity = new Map();
  employees.forEach(e => { const iid = e.identity_id || e.identityId || (e.data && e.data.identityId); if (iid) empByIdentity.set(iid, e); });

  console.log(`\n=== ${verifyOnly ? 'VERIFY' : (apply ? 'APPLY (writes ON)' : 'DRY-RUN')} ===`);
  console.log(`employees=${employees.length} identities=${identities.length} tenants=${tenants.length}\n`);

  // ---- 1. Re-hash identities that hold plaintext / invalid hashes ----------
  for (const idn of identities) {
    const emp = empByIdentity.get(idn.id);
    const name = emp ? (emp.name || (emp.data && emp.data.name)) : null;
    const knownPin = name ? PIN_BY_NAME[name] : null;
    if (HEX64.test(idn.pin_hash || '')) continue; // already a valid hash
    console.log(`[identity ${idn.id}] invalid hash '${idn.pin_hash}' ${name ? `(${name})` : '(no employee)'}`);
    if (knownPin) {
      const hash = sha256(knownPin);
      console.log(`   -> would re-hash to ${hash.slice(0, 12)}… (PIN ${knownPin})`);
      if (apply) await patch('identities', `id=eq.${idn.id}`, { pin_hash: hash, status: 'ACTIVE' });
    } else {
      console.log('   -> UNRESOLVED: force a PIN reset in the Super Admin console.');
    }
  }

  // ---- 2. Ensure every employee resolves to a single valid identity --------
  for (const e of employees) {
    const linked = identities.find(i => i.id === (e.identity_id || e.identityId || (e.data && e.data.identityId)));
    if (linked) continue;
    const name = e.name || (e.data && e.data.name);
    const knownPin = name ? PIN_BY_NAME[name] : null;
    console.log(`[employee ${e.id}] "${name}" has no valid identity ${knownPin ? '(known PIN available -> create)' : '(unknown -> reset required)'}`);
    if (apply && knownPin) {
      const newId = 'id_' + Math.random().toString(36).slice(2, 9);
      await post('identities', { id: newId, tenant_id: e.tenant_id || 'tenant_h0qc7wf', pin_hash: sha256(knownPin), employee_id: e.id, status: 'ACTIVE' });
      await patch('employees', `id=eq.${e.id}`, { identity_id: newId, data: { ...(e.data || {}), identityId: undefined, pinDisplay: undefined, pin: undefined } });
    }
  }

  // ---- 3. Provision tenant-admin hashed identities ------------------------
  // (Superadmin is seeded directly in tenant 'system' by the SQL hardening.)
  for (const t of tenants) {
    const tId = t.tenant_id || t.id;
    if (tId === SYSTEM_TENANT) continue;
    const adminEmp = employees.find(e => (e.tenant_id || e.tenantId) === tId && (e.role_id || e.roleId) === 'role-admin');
    const hasAdminIdentity = adminEmp && identities.some(i => i.id === (adminEmp.identity_id || adminEmp.identityId));
    console.log(`[tenant ${tId}] admin ${adminEmp ? '"' + adminEmp.name + '"' : 'MISSING'} -> hashed identity ${hasAdminIdentity ? 'present' : 'REQUIRED'}`);
    if (apply && adminEmp && !hasAdminIdentity) {
      const newId = 'id_' + Math.random().toString(36).slice(2, 9);
      await post('identities', { id: newId, tenant_id: tId, pin_hash: sha256(ADMIN_PIN), employee_id: adminEmp.id, status: 'ACTIVE' });
      await patch('employees', `id=eq.${adminEmp.id}`, { identity_id: newId });
      await patch('tenants', `tenant_id=eq.${tId}`, { admin_pin: null });
    }
  }

  // ---- 4. Verification matrix ---------------------------------------------
  console.log('\n--- employee -> identity -> role matrix ---');
  let problems = 0;
  for (const e of employees) {
    const iid = e.identity_id || e.identityId || (e.data && e.data.identityId);
    const idn = identities.find(i => i.id === iid);
    const ok = idn && HEX64.test(idn.pin_hash || '');
    if (!ok) problems++;
    console.log(`${(e.name || '?').padEnd(18)} | ${String(e.role_id || e.roleId).padEnd(20)} | id=${iid || 'NONE'} hash=${idn ? (HEX64.test(idn.pin_hash) ? 'sha256-ok' : 'BAD:' + idn.pin_hash) : 'NO-IDENTITY'} ${ok ? '' : '  <== FIX NEEDED'}`);
  }
  console.log(`\n${problems} employee(s) lack a valid hashed identity.`);
  if (!apply) console.log('Re-run with --apply to execute the writes above (service_role key required).');
}

main().catch(e => { console.error(e); process.exit(1); });
