// Aven lookup server — zero dependencies (Node ≥ 18).
//
// Why it exists:
//  • Open Food Facts needs a custom User-Agent and sends no CORS headers, so browsers can't call it directly.
//  • USDA FoodData Central needs an API key that must never ship in client code.
// It also caches, rate-limits per client and serves the built app (dist/) so one process runs everything.
//
//   USDA_API_KEY=xxxx  PORT=8787  CONTACT=you@example.com  node server/index.mjs
//
// Without USDA_API_KEY the USDA source is skipped (and reported as such); Open Food Facts still works.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedupe, fromOff, fromUsda } from './normalize.mjs';
if (process.env.AVEN_MOCK_UPSTREAM) await import('./mock.mjs'); // dev/demo only

const PORT = Number(process.env.PORT ?? 8787);
const USDA_KEY = process.env.USDA_API_KEY ?? '';
const CONTACT = process.env.CONTACT ?? 'aven-app@example.invalid';
const UA = `Aven/0.1 (${CONTACT})`;
const DIST = join(fileURLToPath(new URL('..', import.meta.url)), 'dist');

// ── tiny TTL cache + per-IP token bucket ─────────────────────
const cache = new Map();
const TTL = 60 * 60 * 1000;
const cached = (k) => { const h = cache.get(k); if (h && Date.now() - h.t < TTL) return h.v; cache.delete(k); return undefined; };
const remember = (k, v) => { if (cache.size > 500) cache.delete(cache.keys().next().value); cache.set(k, { t: Date.now(), v }); return v; };

const buckets = new Map();
function allow(ip, cost = 1, perMin = 30) {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: perMin, at: now };
  b.tokens = Math.min(perMin, b.tokens + ((now - b.at) / 60000) * perMin); b.at = now;
  if (b.tokens < cost) { buckets.set(ip, b); return false; }
  b.tokens -= cost; buckets.set(ip, b); return true;
}
// Global politeness toward Open Food Facts search (documented ~10 req/min per IP) — one shared budget for this server.
let offSearchWindow = []; 
const offSearchOk = () => { const now = Date.now(); offSearchWindow = offSearchWindow.filter((t) => now - t < 60000); if (offSearchWindow.length >= 8) return false; offSearchWindow.push(now); return true; };

async function getJson(url, headers = {}, ms = 6000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: c.signal }); return { status: r.status, json: r.ok ? await r.json() : undefined }; }
  finally { clearTimeout(t); }
}

async function searchOff(q) {
  if (!offSearchOk()) return { rate: true, foods: [] };
  const fields = 'code,product_name,product_name_en,generic_name,brands,quantity,serving_size,serving_quantity,nutriments';
  const r = await getJson(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=12&fields=${fields}`);
  if (r.status === 429) return { rate: true, foods: [] };
  return { foods: (r.json?.products ?? []).map(fromOff).filter(Boolean) };
}
async function searchUsda(q) {
  if (!USDA_KEY) return { skipped: true, foods: [] };
  const r = await getJson(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_KEY}&query=${encodeURIComponent(q)}&pageSize=10&dataType=Foundation,SR%20Legacy,Branded`);
  if (r.status === 429) return { rate: true, foods: [] };
  return { foods: (r.json?.foods ?? []).map(fromUsda).filter(Boolean) };
}
async function barcodeOff(code) {
  const r = await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,product_name_en,generic_name,brands,quantity,serving_size,serving_quantity,nutriments`);
  if (r.status === 404 || (r.json && r.json.status === 0)) return { notfound: true };
  if (r.status === 429) return { rate: true };
  return { food: r.json?.product ? fromOff({ ...r.json.product, code: r.json.product.code ?? code }) : null };
}

const send = (res, status, body, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra }); res.end(JSON.stringify(body)); };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
async function serveStatic(req, res) {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, p);
  try { const s = await stat(file); if (s.isDirectory()) file = join(file, 'index.html'); } catch { file = join(DIST, 'index.html'); } // SPA fallback
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': file.endsWith('sw.js') || file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found — run `npm run build` first'); }
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'local';
  try {
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, usda: !!USDA_KEY });
    if (url.pathname === '/api/food/search') {
      const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
      if (q.length < 2) return send(res, 400, { error: 'q too short' });
      const key = `s:${q.toLowerCase()}`;
      const hit = cached(key); if (hit) return send(res, 200, hit, { 'X-Cache': 'HIT' });
      if (!allow(ip, 1)) return send(res, 429, { error: 'rate' });
      const [off, usda] = await Promise.allSettled([searchOff(q), searchUsda(q)]);
      const o = off.status === 'fulfilled' ? off.value : { foods: [], error: true };
      const u = usda.status === 'fulfilled' ? usda.value : { foods: [], error: true };
      if (o.error && u.error) return send(res, 502, { error: 'upstream' });
      if (o.rate && !u.foods.length && !o.foods.length) return send(res, 429, { error: 'rate' });
      const body = { foods: dedupe([...u.foods, ...o.foods]).slice(0, 20), sources: { off: !o.error && !o.rate, usda: !!USDA_KEY && !u.error && !u.rate } };
      if (!o.error && !u.error && !o.rate) remember(key, body); // never cache partial / rate-limited answers
      return send(res, 200, body);
    }
    const m = url.pathname.match(/^\/api\/food\/barcode\/(\d{6,14})$/);
    if (m) {
      const key = `b:${m[1]}`;
      const hit = cached(key); if (hit) return send(res, hit.notfound ? 404 : 200, hit.notfound ? { error: 'notfound' } : { food: hit.food }, { 'X-Cache': 'HIT' });
      if (!allow(ip, 1)) return send(res, 429, { error: 'rate' });
      const r = await barcodeOff(m[1]);
      if (r.rate) return send(res, 429, { error: 'rate' });
      if (r.notfound || !r.food) { remember(key, { notfound: true }); return send(res, 404, { error: 'notfound' }); }
      remember(key, { food: r.food });
      return send(res, 200, { food: r.food });
    }
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'unknown endpoint' });
    return serveStatic(req, res);
  } catch (e) {
    return send(res, 502, { error: 'upstream', detail: String(e?.name ?? e) });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => console.log(`Aven server on http://localhost:${PORT}  (USDA ${USDA_KEY ? 'enabled' : 'disabled — set USDA_API_KEY'})`));
}
