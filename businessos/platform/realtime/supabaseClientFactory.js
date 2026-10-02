/**
 * Phase 4 - supabase-js Realtime client factory.
 *
 * Dynamically imports @supabase/supabase-js@2 from esm.sh at runtime (browser
 * only). Node/CI/test scripts never load this module's client path.
 *
 * Design decisions (from the Persistence/Realtime Repair Plan):
 *   - auth.persistSession=false + auth.autoRefreshToken=false: the app owns its
 *     JWT lifecycle via runtimeConfig + authEngine._persistAccessToken.
 *   - accessToken callback: supabase-js calls this BEFORE each realtime
 *     connection attempt and periodically for token refresh. Returning the
 *     authenticated JWT (or anon key pre-login) means the subscription honors
 *     forced RLS without the app needing to tear-down + re-subscribe on login.
 *   - eventsPerSecond=10: throttle per channel to 10 events/s, protecting
 *     low-spec POS terminals from event storms.
 *
 * Usage:
 *   import { getSupabaseClient } from './supabaseClientFactory.js';
 *   const client = await getSupabaseClient();
 */

import { runtimeConfig } from '../cloud/runtimeConfig.js';

let _client = null;
let _initPromise = null;

const CDN_URL = 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Returns a singleton Supabase client. Safe to call multiple times; concurrent
 * callers share one initialization promise. Resolves to null if CDN is
 * unreachable (the app continues on the delta-poll fallback path).
 */
export async function getSupabaseClient() {
  if (_client) return _client;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      const { createClient } = await import(/* webpackIgnore: true */ CDN_URL);
      const url = runtimeConfig.getSupabaseUrl();
      const anonKey = runtimeConfig.getAnonKey();

      _client = createClient(url, anonKey, {
        global: {
          headers: { apikey: anonKey }
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false
        },
        realtime: {
          params: { eventsPerSecond: 10 }
        },
        // supabase-js calls this before every WS connect / token refresh.
        // The pin-login JWT carries { tenant_id } that RLS reads via jwt_tenant_id().
        accessToken: async () => runtimeConfig.getAccessToken() || anonKey
      });

      console.log('⚡ [supabaseClientFactory] supabase-js v2 client initialized from CDN.');
      return _client;
    } catch (err) {
      console.warn('[supabaseClientFactory] CDN import failed — realtime falls back to delta polling:', err.message || err);
      _initPromise = null; // allow retry on next call
      return null;
    }
  })();

  return _initPromise;
}

/**
 * Convenience: dispose the singleton (used on logout or hot-reload scenarios).
 */
export async function destroySupabaseClient() {
  if (_client) {
    try {
      await _client.realtime.disconnect();
    } catch (_) {}
    _client = null;
    _initPromise = null;
  }
}

export default getSupabaseClient;
