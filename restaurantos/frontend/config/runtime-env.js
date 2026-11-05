/**
 * Deploy-time cloud configuration injection (Stage 0).
 * GENERATED at deploy by scratch/inject_runtime_env.js - do not edit by hand.
 * Empty values fall back to the built-in defaults in runtimeConfig.js so the
 * app is never broken when a key is not provisioned. The service_role key must
 * NEVER appear here or in any client bundle.
 */
window.__APP_ENV__ = window.__APP_ENV__ || {};
Object.assign(window.__APP_ENV__, {
  "SUPABASE_URL": "",
  "SUPABASE_ANON_KEY": "",
  "AUTH_MODE": "server",
  "WRITES_MODE": ""
});
