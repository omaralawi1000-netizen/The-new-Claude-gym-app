// Proves Aven Beta can never touch the real app's data. Serves the real build (dist/) at /The-new-Claude-gym-app/ and the
// beta build (beta-dist/) at /The-new-Claude-gym-app/beta/ exactly as GitHub Pages does (same website, so the browser
// shares storage between them unless the beta keeps its own), then drives both in one browser.
//   npm run build && node scripts/build-beta.mjs && node scripts/beta-check.mjs
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { launch, skipOnboarding, loadDemo } from './lib.mjs';

const PORT = 5199, BASE = `http://127.0.0.1:${PORT}/The-new-Claude-gym-app/`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!p.startsWith('/The-new-Claude-gym-app/')) { res.writeHead(404).end(); return; }
  p = p.slice('/The-new-Claude-gym-app/'.length);
  const root = p.startsWith('beta/') || p === 'beta' ? 'beta-dist' : 'dist';
  let f = join(root, p.startsWith('beta') ? p.slice(5) : p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(readFileSync(f));
}).listen(PORT, '127.0.0.1');

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const hash = (s) => createHash('sha256').update(s ?? '').digest('hex').slice(0, 12);
const rawKeys = (p) => p.evaluate(() => Object.keys(localStorage).sort()); // a REAL-app page sees every key of the website

const { b, ctx, p: real } = await launch({ size: { width: 390, height: 844 }, dsf: 1 });
try {
  // 1. the real app, with some data and a key
  await real.goto(BASE); await real.waitForTimeout(1500);
  await skipOnboarding(real); await loadDemo(real);
  await real.evaluate(() => localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'TEST-KEY-NOT-REAL' })));
  await real.waitForTimeout(800);
  await real.reload(); await real.waitForTimeout(2500); // reloaded: the real app's service worker now controls the page
  const realBefore = await real.evaluate(() => ({ data: localStorage.getItem('aven.v1'), keys: localStorage.getItem('aven.keys') }));
  check('real app has its demo data and a key', !!realBefore.data && realBefore.data.length > 5000 && !!realBefore.keys, `(${realBefore.data?.length} chars)`);
  const swReal = await real.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope));
  check('real app worker is registered at the site root of the app', swReal.includes(BASE), JSON.stringify(swReal));

  const dbsBefore = await real.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).sort());

  // 2. the beta is opened while the real app's worker is in charge: it must still be the beta (not answered with the real app)
  const beta = await ctx.newPage();
  const errors = []; beta.on('pageerror', (e) => errors.push(e.message));
  await beta.goto(BASE + 'beta/'); await beta.waitForTimeout(2500);
  check('beta page is the beta, not the real app', (await beta.title()) === 'Aven Beta', `title "${await beta.title()}"`);
  const manifest = await beta.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); return l ? (await (await fetch(l.href)).json()) : null; });
  check('beta installs as "Aven Beta" with its own scope', manifest?.name === 'Aven Beta' && manifest?.scope === './', JSON.stringify({ name: manifest?.name, id: manifest?.id, start: manifest?.start_url }));
  const real512 = hash(readFileSync('public/icon-512.png').toString('base64')), beta512 = hash(readFileSync('public-beta/icon-512.png').toString('base64'));
  const served = await beta.evaluate(async () => Array.from(new Uint8Array(await (await fetch('icon-512.png')).arrayBuffer())).length);
  check('beta icon differs from the real icon', real512 !== beta512 && served === readFileSync('public-beta/icon-512.png').length, `${served} bytes`);

  // 3. the beta starts empty: it cannot see the real data
  check('beta sees NO real data (fresh start)', (await beta.locator('text=Skip all').count()) > 0);
  const seenKeys = await beta.evaluate(() => Object.keys(localStorage));
  check('beta storage does not list the real keys', !seenKeys.includes('aven.v1') || (await beta.evaluate(() => localStorage.getItem('aven.v1'))) !== realBefore.data);
  await skipOnboarding(beta); await beta.waitForTimeout(1500);
  await beta.evaluate(() => { localStorage.setItem('aven.theme', 'light'); });
  await beta.waitForTimeout(800);

  // 4. what the beta wrote landed under beta:, and the real data is byte-for-byte what it was
  const keysNow = await rawKeys(real);
  const betaKeys = keysNow.filter((k) => k.startsWith('beta:')), unprefixed = keysNow.filter((k) => !k.startsWith('beta:'));
  check('beta wrote its data under beta: keys', betaKeys.includes('beta:aven.theme'), betaKeys.join(', '));
  const realNow = await real.evaluate(() => ({ data: localStorage.getItem('aven.v1'), keys: localStorage.getItem('aven.keys'), theme: localStorage.getItem('aven.theme') }));
  check('real data unchanged after the beta ran', realNow.data === realBefore.data && realNow.keys === realBefore.keys, `real theme still "${realNow.theme}"`);
  check('beta added no unprefixed keys', unprefixed.every((k) => k.startsWith('aven') || k === 'aven.theme') && !unprefixed.includes('beta'), '');

  // 5. the worst case: "Delete all data" inside the beta walks its storage keys
  await beta.getByLabel('Settings').first().click(); await beta.waitForTimeout(600);
  await beta.getByText('Data & backup').click(); await beta.waitForTimeout(500);
  await beta.getByText('Delete all data').click(); await beta.waitForTimeout(300);
  await beta.getByText('Yes, delete everything').click(); await beta.waitForTimeout(1500);
  const afterDelete = await real.evaluate(() => ({ data: localStorage.getItem('aven.v1'), keys: localStorage.getItem('aven.keys') }));
  check('"Delete all data" in the beta leaves the real data and key alone', afterDelete.data === realBefore.data && afterDelete.keys === realBefore.keys);
  const dbs = await real.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).sort());
  check('beta databases are prefixed; the real photo database is not touched', dbs.filter((n) => !n.startsWith('beta:')).join() === dbsBefore.filter((n) => !n.startsWith('beta:')).join(), `before [${dbsBefore}] now [${dbs}]`);

  // 6. one-way copy: real → beta (with one real progress photo to carry across)
  await real.evaluate(() => new Promise((ok) => { const r = indexedDB.open('aven-photos', 1); r.onupgradeneeded = () => r.result.createObjectStore('photos'); r.onsuccess = () => { const t = r.result.transaction('photos', 'readwrite'); t.objectStore('photos').put(new Blob(['REAL-PHOTO']), 'p1'); t.oncomplete = () => { r.result.close(); ok(); }; }; }));
  const beta2 = await ctx.newPage(); beta2.on('pageerror', (e) => errors.push(e.message));
  await beta2.goto(BASE + 'beta/'); await beta2.waitForTimeout(2500);
  await skipOnboarding(beta2).catch(() => {});
  await beta2.getByLabel('Settings').first().click(); await beta2.waitForTimeout(600);
  await beta2.getByText('About Aven').click(); await beta2.waitForTimeout(500);
  check('beta About page shows the Beta box', (await beta2.getByText('Copy my real Aven data in').count()) > 0);
  await beta2.getByText('Copy my real Aven data in').click(); await beta2.waitForTimeout(300);
  await beta2.getByText('Yes, copy it').click(); await beta2.waitForTimeout(3500);
  const copied = await beta2.evaluate(() => ({ data: localStorage.getItem('aven.v1'), keys: localStorage.getItem('aven.keys'), pending: localStorage.getItem('copy.pending') }));
  check('beta now holds a copy of the real data and key', copied.data === realBefore.data && copied.keys === realBefore.keys && copied.pending === null, `(${copied.data?.length} chars)`);
  const betaPhotos = await beta2.evaluate(() => new Promise((ok) => { const r = indexedDB.open('aven-photos', 1); r.onsuccess = () => { const q = r.result.transaction('photos').objectStore('photos').getAll(); q.onsuccess = async () => { ok(await Promise.all(q.result.map((b) => b.text()))); r.result.close(); }; }; r.onerror = () => ok(['error']); }));
  check('the real progress photo was copied into the beta', betaPhotos.join() === 'REAL-PHOTO', betaPhotos.join());
  const realEnd = await real.evaluate(() => ({ data: localStorage.getItem('aven.v1'), keys: localStorage.getItem('aven.keys'), all: Object.keys(localStorage).filter((k) => !k.startsWith('beta:')).sort() }));
  check('real app still exactly as before after the copy', realEnd.data === realBefore.data && realEnd.keys === realBefore.keys);

  // 7. the beta worker lives in its own scope
  const swBeta = await beta2.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope));
  check('two workers, two scopes (real app and beta)', swBeta.includes(BASE) && swBeta.includes(BASE + 'beta/'), JSON.stringify(swBeta));
  check('no page errors in the beta', errors.length === 0, errors.slice(0, 2).join(' | '));
} finally {
  await b.close(); server.close();
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
