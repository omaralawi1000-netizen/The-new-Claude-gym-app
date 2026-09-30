import type { Food } from './types';

export type LookupStatus = 'ok' | 'offline' | 'unavailable' | 'rate' | 'disabled';
export interface LookupResult { foods: Food[]; status: LookupStatus; sources?: { off: boolean; usda: boolean } }

/**
 * Online lookup goes through OUR server (server/index.mjs), never straight from the browser:
 * Open Food Facts requires a custom User-Agent and sends no CORS headers; USDA needs a private API key.
 * When the server is missing or offline we return a status and the UI falls back to bundled + saved foods.
 */
async function getJson(url: string, ms = 7000): Promise<{ status: number; json?: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    const ct = r.headers.get('content-type') ?? '';
    return { status: r.status, json: ct.includes('json') ? await r.json() : undefined };
  } finally { clearTimeout(timer); }
}

export async function searchOnline(q: string, signal?: AbortSignal): Promise<LookupResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { foods: [], status: 'offline' };
  try {
    const r = await getJson(`/api/food/search?q=${encodeURIComponent(q)}`);
    if (signal?.aborted) return { foods: [], status: 'unavailable' };
    if (r.status === 429) return { foods: [], status: 'rate' };
    if (r.status !== 200 || !r.json || !Array.isArray(r.json.foods)) return { foods: [], status: 'unavailable' };
    return { foods: r.json.foods as Food[], status: 'ok', sources: r.json.sources };
  } catch { return { foods: [], status: navigator.onLine === false ? 'offline' : 'unavailable' }; }
}

export async function lookupBarcode(code: string): Promise<{ food?: Food; status: LookupStatus | 'notfound' }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline' };
  try {
    const r = await getJson(`/api/food/barcode/${encodeURIComponent(code)}`);
    if (r.status === 404) return { status: 'notfound' };
    if (r.status === 429) return { status: 'rate' };
    if (r.status !== 200 || !r.json?.food) return { status: 'unavailable' };
    return { food: r.json.food as Food, status: 'ok' };
  } catch { return { status: 'unavailable' }; }
}
