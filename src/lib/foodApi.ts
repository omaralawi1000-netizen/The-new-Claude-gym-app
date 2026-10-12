import type { Food } from './types';
import { dedupe, fromOff } from '../../server/normalize.mjs';

export type LookupStatus = 'ok' | 'offline' | 'unavailable' | 'rate' | 'disabled';
export interface LookupResult { foods: Food[]; status: LookupStatus; sources?: { off: boolean; usda: boolean }; via?: 'server' | 'direct' }

/**
 * Online food lookup, in two layers:
 *  1. Aven's own server (/api/food/*) — merges Open Food Facts + USDA, caches, keeps the USDA key private.
 *  2. If there is no server (static hosting, offline dev), the browser asks Open Food Facts directly.
 *     (USDA needs a private key, so it is server-only.)
 * Either layer failing just returns a status; the UI falls back to bundled + saved foods + manual entry.
 */
const FIELDS = 'code,product_name,product_name_da,product_name_en,generic_name,brands,quantity,serving_size,serving_quantity,nutriments';

async function getJson(url: string, ms = 7000, outer?: AbortSignal): Promise<{ status: number; json?: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onOuter = () => ctrl.abort();
  outer?.addEventListener('abort', onOuter);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    const ct = r.headers.get('content-type') ?? '';
    return { status: r.status, json: ct.includes('json') ? await r.json() : undefined };
  } finally { clearTimeout(timer); outer?.removeEventListener('abort', onOuter); }
}

// A static host answers /api/* with index.html (200, not JSON) — remember that so we stop asking for a while.
let serverDeadUntil = 0;
const serverAlive = () => Date.now() > serverDeadUntil;
const markServerDead = () => { serverDeadUntil = Date.now() + 10 * 60 * 1000; };

// Polite client-side pacing for direct Open Food Facts searches (their documented limit is ~10/min per IP).
// Running out of our own budget is NOT a rate limit: we wait for a free slot instead. Only a real HTTP 429 is reported as 'rate'.
const BUDGET = 8;
let directSearches: number[] = [];
async function directSlot(signal?: AbortSignal): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    const now = Date.now();
    directSearches = directSearches.filter((t) => now - t < 60000);
    if (directSearches.length < BUDGET) { directSearches.push(now); return true; }
    const wait = directSearches[0] + 60000 - now;
    if (wait > 8000 || signal?.aborted) return false;
    await new Promise((r) => setTimeout(r, wait + 50));
    if (signal?.aborted) return false;
  }
  return false;
}
// After a real 429 from Open Food Facts, leave it alone for a short while instead of hammering it on every keystroke.
let coolUntil = 0;
const cache = new Map<string, LookupResult>();

async function searchDirect(q: string, signal?: AbortSignal): Promise<LookupResult> {
  if (Date.now() < coolUntil) return { foods: [], status: 'rate' };
  if (!(await directSlot(signal))) return { foods: [], status: signal?.aborted ? 'unavailable' : 'rate' };
  const enc = encodeURIComponent(q);
  // Danish first: ask for Danish names and rank Denmark's products ahead; the world database still answers for everything else.
  const attempts = [
    `https://search.openfoodfacts.org/search?q=${enc}&langs=da,en&page_size=24&fields=${FIELDS}`,
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${enc}&search_simple=1&action=process&json=1&page_size=24&cc=dk&lc=da&fields=${FIELDS}`,
  ];
  let limited = false;
  for (const url of attempts) {
    try {
      const r = await getJson(url, 7000, signal);
      if (r.status === 429) { limited = true; continue; } // the other endpoint has its own limit
      const list = r.json?.hits ?? r.json?.products;
      if (r.status === 200 && Array.isArray(list)) {
        const foods = dedupe(list.map(fromOff).filter(Boolean) as Food[]);
        return { foods, status: 'ok', sources: { off: true, usda: false }, via: 'direct' };
      }
    } catch { if (signal?.aborted) break; /* try the next endpoint */ }
  }
  if (limited) { coolUntil = Date.now() + 15000; return { foods: [], status: 'rate' }; }
  return { foods: [], status: 'unavailable' };
}

export async function searchOnline(q: string, signal?: AbortSignal): Promise<LookupResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { foods: [], status: 'offline' };
  const key = q.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  if (serverAlive()) {
    try {
      const r = await getJson(`/api/food/search?q=${encodeURIComponent(q)}`, 7000, signal);
      if (r.status === 429) return { foods: [], status: 'rate' };
      if (r.status === 200 && r.json && Array.isArray(r.json.foods)) {
        const res: LookupResult = { foods: r.json.foods as Food[], status: 'ok', sources: r.json.sources, via: 'server' };
        cache.set(key, res);
        return res;
      }
      markServerDead(); // HTML / 404 / 5xx: there is no Aven server here
    } catch { if (signal?.aborted) return { foods: [], status: 'unavailable' }; markServerDead(); }
  }
  const res = await searchDirect(q, signal);
  if (res.status === 'ok') cache.set(key, res);
  return res;
}

export async function lookupBarcode(code: string): Promise<{ food?: Food; status: LookupStatus | 'notfound' }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline' };
  if (serverAlive()) {
    try {
      const r = await getJson(`/api/food/barcode/${encodeURIComponent(code)}`);
      if (r.status === 404 && r.json?.error === 'notfound') return { status: 'notfound' };
      if (r.status === 429) return { status: 'rate' };
      if (r.status === 200 && r.json?.food) return { food: r.json.food as Food, status: 'ok' };
      markServerDead();
    } catch { markServerDead(); }
  }
  try {
    const r = await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
    if (r.status === 404 || r.json?.status === 0) return { status: 'notfound' };
    if (r.status === 429) return { status: 'rate' };
    const food = r.json?.product ? fromOff({ ...r.json.product, code: r.json.product.code ?? code }) : null;
    return food ? { food, status: 'ok' } : { status: 'notfound' };
  } catch { return { status: 'unavailable' }; }
}
