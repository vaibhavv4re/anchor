/**
 * Anchor RestaurantOS - Service Worker (PWA app-shell layer).
 *
 * SCOPE RULE (deliberately narrow): this worker caches ONLY the static app
 * shell (HTML/CSS/JS/icons). All cloud/data traffic is untouched:
 *
 *  1. runtime-env.js  -> NETWORK ONLY, never cached.
 *     Deploy-time config injection (Supabase URL/key, AUTH_MODE) must always
 *     be fresh. A stale copy silently points devices at old credentials -
 *     mirrors the vercel.json `must-revalidate` rule for the same file.
 *
 *  2. Supabase / any non-HTML cross-origin request -> PASS-THROUGH.
 *     Offline DATA behaviour (journal, flush-before-pull, hydration guards)
 *     is owned by the app-layer DataGateway/offlineStore. The SW must never
 *     sit in front of REST/Realtime calls or it would fight those hardened
 *     invariants (e.g. empty-cloud-response cache clobber).
 *
 *  3. App shell (index.html, module graph, styles, icons, vendored CDN) ->
 *     cached so an installed tablet can boot the UI with no network at all.
 *
 * Cache versioning: bump SHELL_VERSION on each deploy that changes shell
 * semantics; the per-request stale-while-revalidate path keeps content fresh
 * automatically, and activate() prunes any cache not in KEEP.
 */

const SHELL_VERSION = 'anchor-shell-v1';
const OFFLINE_URL = '/index.html';

const KEEP = new Set([
  `${SHELL_VERSION}-shell`,
  `${SHELL_VERSION}-cdn`
]);

const isSupabaseCall = (url) =>
  url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in');

const isRuntimeEnv = (url) => url.pathname.endsWith('/config/runtime-env.js');

const isCDNAsset = (url, request) =>
  url.origin !== self.location.origin && request.destination === 'script';

/**
 * Stale-while-revalidate for a cached bucket: serve cache first (instant /
 * offline-safe), refresh the entry in the background when online.
 */
async function cacheThenNetwork(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  if (cached) {
    // Background refresh; caller already has a usable response.
    networkFetch.catch(() => {});
    return cached;
  }
  const online = await networkFetch;
  if (online) return online;
  return new Response('Offline', { status: 503, statusText: 'Service Worker offline' });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(`${SHELL_VERSION}-shell`)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      // Do NOT precache runtime-env.js: network-only by policy (see header).
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // SW only answers GETs; everything else (POST to Supabase RPC etc.) is
  // left completely alone.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Rule 1: never control the service worker script itself.
  if (request.url === self.location.href) return;

  // Rule 2: deploy-time config is network-only, no cache under any condition.
  if (isRuntimeEnv(url)) return;

  // Rule 3: cloud data plane pass-through (Supabase REST/Auth/Realtime/Functions).
  if (isSupabaseCall(url)) return;

  // Rule 4: cross-origin - only wrap the SheetJS-style CDN <script> assets
  // (the app already degrades to CSV-only when absent, so cache-then-network
  // is a pure improvement); all other cross-origin requests pass through.
  if (url.origin !== self.location.origin) {
    if (isCDNAsset(url, request)) {
      event.respondWith(cacheThenNetwork(`${SHELL_VERSION}-cdn`, request));
    }
    return;
  }

  // Rule 5: navigations (index.html / clean-URL routes via vercel rewrite) -
  // network-first so deploys land immediately, cache fallback when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(`${SHELL_VERSION}-shell`).then((cache) => cache.put(OFFLINE_URL, response.clone()));
          }
          return response;
        })
        .catch(async () => (await caches.match(OFFLINE_URL)) || Response.error())
    );
    return;
  }

  // Rule 6: same-origin static shell assets (JS module graph, CSS, icons) -
  // stale-while-revalidate: instant paint + offline boot, auto-fresh on net.
  if (/\.(?:js|css|png|svg|ico|webmanifest|woff2?)$/i.test(url.pathname)) {
    event.respondWith(cacheThenNetwork(`${SHELL_VERSION}-shell`, request));
  }
  // Anything else same-origin passes through untouched.
});
