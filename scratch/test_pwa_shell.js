/**
 * PWA installability verification (headless, no browser required).
 *
 * Checks the static artifacts and the two hard safety invariants:
 *   - the service worker must NOT cache runtime-env.js (deploy-time config)
 *   - the service worker must NOT intercept Supabase data traffic
 *
 * Run: node scratch/test_pwa_shell.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;

const check = (name, fn) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failures++;
    console.error(`✗ ${name}\n  ${err.message}`);
  }
};

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 1. Manifest: valid JSON + required installability fields + icons on disk.
check('app.webmanifest is valid JSON with installability fields', () => {
  const m = JSON.parse(read('app.webmanifest'));
  for (const f of ['name', 'short_name', 'start_url', 'display', 'icons']) {
    if (!m[f]) throw new Error(`missing field "${f}"`);
  }
  if (m.display !== 'standalone') throw new Error('display must be "standalone"');
  const sizes = m.icons.map((i) => i.sizes);
  if (!sizes.includes('192x192') || !sizes.includes('512x512')) {
    throw new Error('must include 192x192 and 512x512 icons');
  }
  if (!m.icons.some((i) => i.purpose === 'maskable')) throw new Error('missing maskable icon');
});

check('manifest icon files exist and are real PNGs', () => {
  const m = JSON.parse(read('app.webmanifest'));
  for (const icon of m.icons) {
    const p = path.join(ROOT, icon.src.replace(/^\/+/, ''));
    if (!fs.existsSync(p)) throw new Error(`missing ${icon.src}`);
    const buf = fs.readFileSync(p);
    if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      throw new Error(`${icon.src} is not a PNG`);
    }
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    if (icon.sizes !== `${w}x${h}`) throw new Error(`${icon.src} declares ${icon.sizes} but is ${w}x${h}`);
  }
});

// 2. index.html wiring.
check('index.html links manifest, theme-color and SW registration', () => {
  const html = read('index.html');
  for (const needle of [
    'rel="manifest"',
    'name="theme-color"',
    'apple-mobile-web-app-capable',
    'apple-touch-icon',
    "navigator.serviceWorker.register('/sw.js')"
  ]) {
    if (!html.includes(needle)) throw new Error(`missing: ${needle}`);
  }
});

// 3. Service worker: parses cleanly (as script, not module) at root scope.
check('sw.js exists at root and parses as a classic script', () => {
  const src = read('sw.js');
  new vm.Script(src, { filename: 'sw.js' }); // syntax check without executing
});

// 4. Safety invariants in SW policy.
check('SW never caches runtime-env.js (network-only pass-through)', () => {
  const src = read('sw.js');
  if (!src.includes('runtime-env.js')) throw new Error('SW has no runtime-env rule at all');
  // The runtime-env branch must be a bare `return` (no respondWith / no cache put).
  const rule = /if \(isRuntimeEnv\(url\)\) \{\n?\s*return;/;
  if (!rule.test(src.replace(/\r/g, '')) && !/if \(isRuntimeEnv\(url\)\) return;/.test(src)) {
    throw new Error('runtime-env path must return without respondWith (pass-through)');
  }
});

check('SW passes Supabase traffic through untouched', () => {
  const src = read('sw.js');
  if (!/isSupabaseCall\(url\)\) return;/.test(src)) {
    throw new Error('Supabase host check must return without respondWith');
  }
  if (/respondWith[\s\S]{0,80}supabase/i.test(src)) {
    throw new Error('SW must not respondWith any Supabase request');
  }
});

check('SW only caches GET requests', () => {
  const src = read('sw.js');
  if (!/request\.method !== 'GET'\) return;/.test(src)) {
    throw new Error('missing non-GET early return');
  }
});

// 5. vercel.json: sw.js and manifest served fresh.
check('vercel.json sets no-cache for /sw.js and manifest content-type', () => {
  const v = JSON.parse(read('vercel.json'));
  const sw = v.headers.find((h) => h.source === '/sw.js');
  if (!sw || !sw.headers.some((x) => x.key === 'Cache-Control' && x.value.includes('must-revalidate'))) {
    throw new Error('/sw.js must be no-cache, must-revalidate');
  }
  const mf = v.headers.find((h) => h.source === '/app.webmanifest');
  if (!mf || !mf.headers.some((x) => x.value === 'application/manifest+json')) {
    throw new Error('/app.webmanifest must declare application/manifest+json');
  }
});

console.log(failures === 0 ? '\nAll PWA shell checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
