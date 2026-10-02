/**
 * scratch/inject_runtime_env.js  (Stage 4 - deployment)
 *
 * The app reads all cloud config from `window.__APP_ENV__` (Stage 0), which is
 * shipped EMPTY in source so businessos/platform/cloud/runtimeConfig.js falls
 * back to the built-in public project defaults and the app always boots.
 *
 * Static hosts like Vercel do NOT put their environment variables into a static
 * JS file automatically - they are only available to the build process. This
 * small, dependency-free script closes that gap: run it as the deploy build step
 * and it rewrites restaurantos/frontend/config/runtime-env.js from the host's
 * process.env.
 *
 * NON-BREAKING BY DESIGN:
 *   - Only the PUBLIC keys (url, anon key) and the two rollout flags are baked
 *     in. The service_role / DB passwords are deliberately ignored even if
 *     present in the environment, so a secret can never leak into the bundle.
 *   - Any key that is NOT set is emitted as an empty string, which readEnv()
 *     treats as absent -> runtimeConfig falls back to the current defaults. So
 *     running this with no env vars set produces a file identical in effect to
 *     today's, and the app is unchanged.
 *
 * Usage: `node scratch/inject_runtime_env.js`
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'restaurantos', 'frontend', 'config', 'runtime-env.js');

// Keys we are willing to expose to the browser. Everything else is dropped.
const ALLOWED_KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'AUTH_MODE', 'WRITES_MODE'];

function pick(key) {
  const v = process.env[key];
  return typeof v === 'string' ? v.trim() : '';
}

const env = {};
for (const k of ALLOWED_KEYS) env[k] = pick(k);

// Safety net: never ship a service_role token even if someone pasted it into a
// public key by mistake. A service_role JWT has "role":"service_role" inside its
// payload; the anon key does not.
function isServiceRole(token) {
  if (!token || token.split('.').length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    return payload && payload.role === 'service_role';
  } catch (_) {
    return false;
  }
}
if (isServiceRole(env.SUPABASE_ANON_KEY)) {
  console.error('REFUSING to bake a service_role key into the client - SUPABASE_ANON_KEY cleared.');
  env.SUPABASE_ANON_KEY = '';
}

const out = `/**
 * Deploy-time cloud configuration injection (Stage 0).
 * GENERATED at deploy by scratch/inject_runtime_env.js - do not edit by hand.
 * Empty values fall back to the built-in defaults in runtimeConfig.js so the
 * app is never broken when a key is not provisioned. The service_role key must
 * NEVER appear here or in any client bundle.
 */
window.__APP_ENV__ = window.__APP_ENV__ || {};
Object.assign(window.__APP_ENV__, ${JSON.stringify(env, null, 2)});
`;

fs.writeFileSync(OUT, out, 'utf8');
const setKeys = ALLOWED_KEYS.filter((k) => env[k]);
console.log(`inject_runtime_env: wrote ${path.relative(ROOT, OUT)} (env-backed keys: ${setKeys.length ? setKeys.join(', ') : 'none - using defaults'})`);
