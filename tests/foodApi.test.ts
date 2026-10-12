import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hit = { code: '5701', product_name: 'Rugbrød', product_name_da: 'Rugbrød, fuldkorn', nutriments: { 'energy-kcal_100g': 210, proteins_100g: 6 } };
const reply = (status: number, body?: unknown) => ({ status, headers: { get: () => 'application/json' }, json: async () => body });

describe('online food lookup', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('many searches in a row are not reported as rate-limited by our own budget', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (u: string) => { calls.push(u); return reply(200, { hits: [hit], products: [hit] }); });
    const { searchOnline } = await import('../src/lib/foodApi');
    const prev = (await searchOnline('probe-dead-server')).status; // finds there is no Aven server (JSON without foods)
    expect(['ok', 'unavailable']).toContain(prev);
    for (const q of ['rugbrød', 'skyr', 'leverpostej', 'havregryn', 'ost']) expect((await searchOnline(q)).status).toBe('ok');
  });

  it('a real 429 on the first endpoint falls through to the second, and only a double 429 says rate', async () => {
    let n = 0;
    vi.stubGlobal('fetch', async (u: string) => {
      if (u.startsWith('/api/')) return { status: 404, headers: { get: () => 'text/html' } };
      n++;
      return u.includes('search.openfoodfacts.org') ? reply(429) : reply(200, { products: [hit] });
    });
    const { searchOnline } = await import('../src/lib/foodApi');
    const ok = await searchOnline('rugbrød');
    expect(ok.status).toBe('ok'); expect(ok.foods[0].name).toBe('Rugbrød, fuldkorn'); expect(n).toBe(2);
    vi.resetModules();
    vi.stubGlobal('fetch', async (u: string) => (u.startsWith('/api/') ? { status: 404, headers: { get: () => 'text/html' } } : reply(429)));
    const m = await import('../src/lib/foodApi');
    expect((await m.searchOnline('skyr')).status).toBe('rate');
  });

  it('asks for Danish names and Denmark', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (u: string) => { urls.push(u); return u.startsWith('/api/') ? { status: 404, headers: { get: () => 'text/html' } } : reply(200, { hits: [hit] }); });
    const { searchOnline } = await import('../src/lib/foodApi');
    await searchOnline('rugbrød');
    expect(urls.some((u) => u.includes('langs=da'))).toBe(true);
  });
});

import { pickOnline } from '../src/lib/foodText';
import type { Food } from '../src/lib/types';
const mk = (name: string, kcal: number, extra: Partial<Food> & { p?: number; c?: number; f?: number } = {}): Food => ({ id: `off:${name}`, name, source: 'off', basis: 'g', per100: { kcal, protein: extra.p ?? 0, carbs: extra.c ?? 0, fat: extra.f ?? 0 }, portions: [], brand: extra.brand } as Food);

describe('pickOnline (orb)', () => {
  it('prefers the plain food over an odd brand, and skips absurd data', () => {
    const list = [mk('Skyr vanilje bar', 400, { brand: 'Fitbar', p: 10, c: 50, f: 15 }), mk('Skyr', 9999), mk('Skyr naturel', 63, { p: 11, c: 4, f: 0.2, brand: 'Arla' })];
    expect(pickOnline('200 g skyr'.replace('200 g ', ''), list)?.name).toBe('Skyr naturel');
  });
  it('takes the named brand when the user said it', () => {
    const list = [mk('Skyr naturel', 63, { p: 11, c: 4, f: 0.2, brand: 'Arla' }), mk('Skyr naturel', 60, { p: 11, c: 4, f: 0.1, brand: 'Lidl' })];
    expect(pickOnline('lidl skyr naturel', list)?.brand).toBe('Lidl');
  });
  it('returns nothing for a poor match so the AI estimate takes over', () => {
    expect(pickOnline('rugbrød med leverpostej', [mk('Chocolate wafer', 520, { p: 6, c: 60, f: 28 })])).toBeUndefined();
    expect(pickOnline('banana', [mk('Banana', 89, { p: 1, c: 22, f: 0.3 })])?.name).toBe('Banana');
    expect(pickOnline('rice krispies', [mk('Rice Krispies', 380, { p: 6, c: 85, f: 1, brand: "Kellogg's" })])?.name).toBe('Rice Krispies');
  });
});
