/**
 * Phase 2 guard - runtimeConfig.hydrateAccessToken() restores the persisted
 * pin-login JWT on reload, drops an expired one, and no-ops with no storage, so
 * the first post-reload cloud call is authenticated (instead of anon+RLS-denied).
 *
 * Usage: node scratch/test_persistence_token.js
 */
import { runtimeConfig } from '../businessos/platform/cloud/runtimeConfig.js';

const checks = [];
const mem = {};
global.window = {
  localStorage: {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; }
  }
};
const KEY = 'anchor_access_token';

// ---- A. Valid, unexpired token -> restored into memory.
runtimeConfig.setAccessToken(null);
mem[KEY] = JSON.stringify({ token: 'jwt.valid.token', expiresAt: new Date(Date.now() + 60_000).toISOString() });
const restored = runtimeConfig.hydrateAccessToken();
checks.push(['valid token restored from storage', restored === 'jwt.valid.token']);
checks.push(['restored token is what getAuthHeaders uses',
  runtimeConfig.getAuthHeaders().Authorization === 'Bearer jwt.valid.token']);

// ---- B. Expired token -> dropped, storage cleared, falls back to anon.
const anon = runtimeConfig.getAnonKey();
mem[KEY] = JSON.stringify({ token: 'jwt.expired', expiresAt: new Date(Date.now() - 1000).toISOString() });
const expiredRes = runtimeConfig.hydrateAccessToken();
checks.push(['expired token not restored', expiredRes === null && runtimeConfig.getAccessToken() === null]);
checks.push(['expired copy removed from storage', !(KEY in mem)]);
checks.push(['header falls back to anon after expiry',
  runtimeConfig.getAuthHeaders().Authorization === `Bearer ${anon}`]);

// ---- C. No stored token -> no-op, stays anon.
delete mem[KEY];
checks.push(['absent token returns null', runtimeConfig.hydrateAccessToken() === null]);

// ---- D. Malformed JSON -> no throw, stays clean.
mem[KEY] = '{not json';
let threw = false;
try { runtimeConfig.hydrateAccessToken(); } catch (_) { threw = true; }
checks.push(['malformed storage does not throw', !threw && runtimeConfig.getAccessToken() === null]);

console.log('=== Phase 2: hydrateAccessToken guard ===');
let ok = true;
for (const [name, pass] of checks) { console.log((pass ? 'PASS' : 'FAIL') + ' - ' + name); if (!pass) ok = false; }
console.log(ok ? '\nRESULT: ALL PASS' : '\nRESULT: FAILURES PRESENT');
process.exit(ok ? 0 : 1);
