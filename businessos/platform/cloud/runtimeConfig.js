/**
 * Runtime configuration (Stage 0 - secret removal + token plumbing).
 *
 * Single source of truth for cloud endpoints and the current session token.
 * Values are read from `window.__APP_ENV__` (populated at deploy time from
 * Vercel environment variables via an inline script in index.html) and fall
 * back to the current public project values so the running app is never
 * broken before the deploy target is provisioned.
 *
 * The anon key and project URL are public by design (they are only safe once
 * RLS is enabled in Stage 1B). The service_role key is NEVER referenced here
 * and lives only inside the server-side Edge Function.
 */

const DEFAULT_SUPABASE_URL = 'https://orlcftjkhqypvqzcmfci.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybGNmdGpraHF5cHZxemNtZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTU5NzgsImV4cCI6MjA5OTQ5MTk3OH0.Flrz1S766klUE-7vi-X1oga7Ic5KazssXo2vfXjjTzw';

function readEnv(key) {
  if (typeof window !== 'undefined' && window.__APP_ENV__ && window.__APP_ENV__[key]) {
    return window.__APP_ENV__[key];
  }
  // Node context (scratch/* test scripts, CI): allow repointing at a STAGING
  // Supabase project via env vars so tests never mutate production. In the
  // browser `process` is undefined, so this branch is a no-op there.
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return null;
}

// Central holder for the authenticated session JWT minted by the pin-login
// Edge Function (Stage 1A). Both the REST client and the realtime transport
// read from here so a single login propagates to every cloud call.
let accessToken = null;

export const runtimeConfig = {
  getSupabaseUrl() {
    return readEnv('SUPABASE_URL') || DEFAULT_SUPABASE_URL;
  },

  getRestUrl() {
    const base = this.getSupabaseUrl().replace(/\/+$/, '');
    return `${base}/rest/v1`;
  },

  getAnonKey() {
    return readEnv('SUPABASE_ANON_KEY') || DEFAULT_SUPABASE_ANON_KEY;
  },

  getFunctionsUrl() {
    const base = this.getSupabaseUrl().replace(/\/+$/, '');
    return `${base}/functions/v1`;
  },

  /**
   * Stage 1A rollout gate. Server-side PIN auth stays disabled by default so
   * the existing local auth path is untouched; flip on (via deploy env
   * AUTH_MODE=server) only after live PINs are verified against staging.
   */
  isServerAuthEnabled() {
    return readEnv('AUTH_MODE') === 'server';
  },

  /**
   * Stage 1C rollout gate. Server-side (GST-safe) invoice numbering and the
   * atomic financial RPCs stay disabled by default so the existing client
   * max+1 write path is untouched. Flip on (via deploy env WRITES_MODE=server)
   * only after supabase/sequences.sql is applied and numbering is verified on
   * staging. When off, every financial write falls back to the current REST
   * create, preserving behavior exactly.
   */
  isServerWritesEnabled() {
    return readEnv('WRITES_MODE') === 'server';
  },

  getAccessToken() {
    return accessToken;
  },

  setAccessToken(token) {
    accessToken = token || null;
  },

  /**
   * Auth headers: use the session JWT when a user is logged in, otherwise the
   * public anon key. `apikey` always carries the anon key (Supabase requires
   * it), while `Authorization` reflects the effective role.
   */
  getAuthHeaders(extra = {}) {
    const bearer = accessToken || this.getAnonKey();
    return {
      apikey: this.getAnonKey(),
      Authorization: `Bearer ${bearer}`,
      ...extra
    };
  }
};

export default runtimeConfig;
