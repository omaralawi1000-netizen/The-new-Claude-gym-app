import type { Food } from './types';
import { dedupe, fromOff } from '../../server/normalize.mjs';
import { scoreFood, searchQuery } from './foodText';
import dkUrl from '../data/off/off-dk.json?url';

export type LookupStatus = 'ok' | 'offline' | 'unavailable' | 'rate' | 'disabled';
export interface LookupResult { foods: Food[]; status: LookupStatus; sources?: { off: boolean; usda: boolean }; via?: 'server' | 'direct' }

/**
 * Online food lookup, in three layers:
 *  0. Danish products, packed from Open Food Facts into one file (scripts/build-dk-foods.mjs), downloaded once and
 *     searched on the phone: instant, works offline, and finds "Cheasy skyr vanilje" however it is said.
 *  1. Aven's own server (/api/food/*) — merges Open Food Facts + USDA, caches, keeps the USDA key private.
 *  2. If there is no server (static hosting, offline dev), the browser asks Open Food Facts directly (worldwide).
 *     (USDA needs a private key, so it is server-only.)
 * Any layer failing just returns a status; the UI falls back to bundled + saved foods + manual entry.
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

// ── Danish products (layer 0) ──
type DkRow = [string, string, string, 0 | 1, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, string | null];
let dkLoad: Promise<{ rows: DkRow[]; hay: string[] }> | null = null;
const hayOf = (r: DkRow) => ` ${searchQuery(`${r[2]} ${r[1]}`).replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/aa/g, 'a')}`;
function loadDk(): Promise<{ rows: DkRow[]; hay: string[] }> {
  dkLoad ??= getJson(dkUrl, 15000).then((r) => {
    const rows: DkRow[] = Array.isArray(r.json?.rows) ? r.json.rows : [];
    return { rows, hay: rows.map(hayOf) };
  }).catch(() => { dkLoad = null; return { rows: [], hay: [] }; }); // try again next time
  return dkLoad;
}
const v = (x: number | null) => (x === null ? undefined : x);
function dkFood(r: DkRow): Food {
  const per100 = Object.fromEntries(Object.entries({ kcal: r[4], protein: r[5], carbs: r[6], fat: r[7], fibre: r[8], sugar: r[9], satFat: r[10], sodium: r[11] }).filter(([, x]) => x !== null)) as Food['per100'];
  return {
    id: `off:${r[0]}`, name: r[1], brand: r[2] || undefined, source: 'off', sourceId: r[0], barcode: r[0], basis: r[3] ? 'ml' : 'g', per100,
    portions: v(r[12]) ? [{ id: 'serving', label: `1 serving (${r[13] ?? `${r[12]} ${r[3] ? 'ml' : 'g'}`})`, amount: r[12]!, verified: true }] : [],
  };
}
const dkFold = (s: string) => s.toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/aa/g, 'a');
/** Danish products matching what was typed or said, best first. Empty if the list can't be loaded. */
export async function searchDanish(q: string, limit = 24): Promise<Food[]> {
  const sq = searchQuery(q);
  const words = dkFold(sq).split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
  if (!words.length) return [];
  const { rows, hay } = await loadDk();
  const out: { food: Food; score: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const h = hay[i];
    // cheap filter first: most words must appear in the brand + name at a word start
    let n = 0;
    for (const w of words) if (h.includes(` ${w}`)) n++;
    if (n === 0 || n < Math.ceil(words.length / 2)) continue;
    const food = dkFood(rows[i]);
    const score = scoreFood(food, sq);
    if (score >= 0.3) out.push({ food, score });
  }
  out.sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length);
  return out.slice(0, limit).map((x) => x.food);
}

/** A Danish product from the packed list by its barcode (leading zeros don't matter: EAN-13 vs UPC-A). */
export async function findDanishBarcode(code: string): Promise<Food | undefined> {
  const want = code.replace(/^0+/, '');
  if (!want) return undefined;
  const { rows } = await loadDk();
  const r = rows.find((x) => typeof x[0] === 'string' && x[0].replace(/^0+/, '') === want);
  return r ? dkFood(r) : undefined;
}

async function searchDirect(q: string, signal?: AbortSignal): Promise<LookupResult> {
  if (Date.now() < coolUntil) return { foods: [], status: 'rate' };
  if (!(await directSlot(signal))) return { foods: [], status: signal?.aborted ? 'unavailable' : 'rate' };
  const enc = encodeURIComponent(q);
  // Only the classic search lets other websites ask it (search.openfoodfacts.org refuses them: CORS). Products sold in
  // Denmark first; if Denmark has nothing, the whole world. It answers 503 "temporarily unavailable" when busy.
  const attempts = [
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${enc}&search_simple=1&action=process&json=1&page_size=24&cc=dk&lc=da&fields=${FIELDS}`,
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${enc}&search_simple=1&action=process&json=1&page_size=24&fields=${FIELDS}`,
  ];
  let limited = false;
  for (let i = 0; i < attempts.length; i++) {
    if (i > 0 && !(await directSlot(signal))) break;
    try {
      const r = await getJson(attempts[i], 7000, signal);
      if (r.status === 429) { limited = true; break; }
      if (r.status === 503) { coolUntil = Date.now() + 15000; break; } // busy: asking again right away only makes it worse
      const list = r.json?.products;
      if (r.status === 200 && Array.isArray(list)) {
        const foods = dedupe(list.map(fromOff).filter(Boolean) as Food[]);
        if (foods.length || i === attempts.length - 1) return { foods, status: 'ok', sources: { off: true, usda: false }, via: 'direct' };
      }
    } catch { if (signal?.aborted) break; /* try the next one */ }
  }
  if (limited) { coolUntil = Date.now() + 15000; return { foods: [], status: 'rate' }; }
  return { foods: [], status: 'unavailable' };
}

export async function searchOnline(q: string, signal?: AbortSignal): Promise<LookupResult> {
  const sq = searchQuery(q); // "Cheasy vaniljeskyr 0% fedt" → "cheasy vanilje skyr"
  const key = sq.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const danish = searchDanish(sq, 12).catch(() => [] as Food[]);
  const live = await searchLive(sq, signal);
  const dk = await danish;
  if (!dk.length) { if (live.status === 'ok') cache.set(key, live); return live; }
  const res: LookupResult = { foods: dedupe([...dk, ...live.foods]), status: 'ok', sources: { off: true, usda: !!live.sources?.usda }, via: live.via };
  if (live.status === 'ok') cache.set(key, res);
  return res;
}

async function searchLive(q: string, signal?: AbortSignal): Promise<LookupResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { foods: [], status: 'offline' };
  if (serverAlive()) {
    try {
      const r = await getJson(`/api/food/search?q=${encodeURIComponent(q)}`, 7000, signal);
      if (r.status === 429) return { foods: [], status: 'rate' };
      if (r.status === 200 && r.json && Array.isArray(r.json.foods)) return { foods: r.json.foods as Food[], status: 'ok', sources: r.json.sources, via: 'server' };
      markServerDead(); // HTML / 404 / 5xx: there is no Aven server here
    } catch { if (signal?.aborted) return { foods: [], status: 'unavailable' }; markServerDead(); }
  }
  return searchDirect(q, signal);
}

export async function lookupBarcode(code: string): Promise<{ food?: Food; status: LookupStatus | 'notfound' }> {
  // the packed Danish list first: instant, and it works offline (the same list the text search uses)
  const dk = await findDanishBarcode(code).catch(() => undefined);
  if (dk) return { food: dk, status: 'ok' };
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
