/**
 * Smoke test: dev server (npx serve) must deliver /sw.js and /app.webmanifest
 * at root scope so the service worker registration scope is correct locally.
 * Run: node scratch/test_pwa_serve_smoke.js [port]  (default 3000)
 */

const http = require('http');
const PORT = Number(process.argv[2] || 3000);

const get = (p) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p, agent: false }, (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body }));
  }).on('error', reject);
});

(async () => {
  let fail = 0;
  const check = async (p, mustInclude) => {
    try {
      const r = await get(p);
      const ok = r.status === 200 && (!mustInclude || r.body.includes(mustInclude));
      console.log(`${ok ? '✓' : '✗'} ${p} -> ${r.status} ${r.type}`);
      if (!ok) fail++;
    } catch (err) {
      console.log(`✗ ${p} -> ${err.message} (is \`npx serve .\` running on :${PORT}?)`);
      fail++;
    }
  };
  await check('/sw.js', 'addEventListener');
  await check('/app.webmanifest', '"start_url"');
  // Root navigation is what start_url "/" hits; `serve` cleanUrls 301s /index.html.
  await check('/', 'rel="manifest"');
  process.exit(fail ? 1 : 0);
})();
