/**
 * Validate the manager PIN against the LIVE pin-login Edge Function.
 * This reproduces exactly what authEngine._authenticateViaServer does for a
 * PIN, so the HTTP status pinpoints the failure:
 *   200 -> login works (claims.workspace should be 'manager')
 *   401 -> INVALID_PIN: no ACTIVE identities row with SHA-256(pin) joined to an
 *          ACTIVE employees row (or employee/identity status/tenant mismatch)
 *   429 -> rate limited (10/min/IP) - wait a minute and retry
 *   404/405/5xx -> function undeployed / misconfigured (falls back to local,
 *          where 123456 is NOT in pinMap, so the client shows "Invalid PIN")
 * Usage: node scratch/validate_manager_pin_login.js [pin]
 */
const PIN = String(process.argv[2] || '123456');
const URL_BASE = 'https://orlcftjkhqypvqzcmfci.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw';

// Show the expected hash so it can be compared to identities.pin_hash.
const { createHash } = await import('node:crypto');
const hash = createHash('sha256').update(PIN).digest('hex');

console.log(`PIN=${PIN}`);
console.log(`SHA-256(pin) = ${hash}   (must equal identities.pin_hash for the manager identity)`);
console.log('--- calling live pin-login ---');

const resp = await fetch(`${URL_BASE}/functions/v1/pin-login`, {
  method: 'POST',
  headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ pin: PIN, deviceId: 'VALIDATE-ONLY' })
});

const text = await resp.text();
let body;
try { body = JSON.parse(text); } catch (_) { body = { raw: text }; }

console.log(`HTTP ${resp.status} ${resp.statusText}`);
if (resp.status === 200) {
  // Never print the JWT; only the claims we care about.
  console.log('claims =', JSON.stringify(body.claims));
  const ws = body && body.claims && body.claims.workspace;
  console.log(ws === 'manager'
    ? 'RESULT: pin-login OK and resolves to the MANAGER workspace.'
    : `RESULT: pin-login OK but workspace='${ws}' (expected 'manager'). Check employees.workspace_default.`);
} else {
  console.log('error body =', JSON.stringify(body));
  console.log('RESULT: login FAILED at the auth layer (this is before any manager workspace code runs).');
}
