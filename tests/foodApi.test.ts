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

  it('nothing sold in Denmark falls through to the whole world, and a real 429 says rate', async () => {
    let n = 0;
    vi.stubGlobal('fetch', async (u: string) => {
      if (u.startsWith('/api/')) return { status: 404, headers: { get: () => 'text/html' } };
      if (u.includes('off-dk')) return reply(200, { rows: [] });
      n++;
      return n === 1 ? reply(200, { products: [] }) : reply(200, { products: [hit] }); // nothing in Denmark → the world
    });
    const { searchOnline } = await import('../src/lib/foodApi');
    const ok = await searchOnline('rugbrød');
    expect(ok.status).toBe('ok'); expect(ok.foods[0].name).toBe('Rugbrød, fuldkorn'); expect(n).toBe(2);
    vi.resetModules();
    vi.stubGlobal('fetch', async (u: string) => (u.startsWith('/api/') ? { status: 404, headers: { get: () => 'text/html' } } : u.includes('off-dk') ? reply(200, { rows: [] }) : reply(429)));
    const m = await import('../src/lib/foodApi');
    expect((await m.searchOnline('skyr')).status).toBe('rate');
  });

  it('asks for Danish names and Denmark', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (u: string) => { urls.push(u); return u.startsWith('/api/') ? { status: 404, headers: { get: () => 'text/html' } } : reply(200, { hits: [hit] }); });
    const { searchOnline } = await import('../src/lib/foodApi');
    await searchOnline('rugbrød');
    expect(urls.some((u) => u.includes('cc=dk') && u.includes('lc=da'))).toBe(true);
    expect(urls.some((u) => u.includes('search.openfoodfacts.org'))).toBe(false); // refuses other websites (CORS)
  });

  it('finds Danish products in the packed list however they are said, and asks the world too', async () => {
    const urls: string[] = [];
    const rows = [
      ['5711953021470', 'Skyr Vanilje', 'Cheasy', 0, 55, 8.6, 4, 0.2, null, 4, 0.1, 40, null, null],
      ['5711953000000', 'Skyr Naturel', 'Cheasy', 0, 61, 10, 4, 0.2, null, 4, 0.1, 40, null, null],
      ['5700000000001', 'Vanilje Skyr', 'Egelykke', 0, 76, 8.6, 10, 0.2, null, 10, 0.1, 40, null, null],
      ['5700000000002', 'Leverpostej', 'Stryhns', 0, 280, 11, 6, 23, null, 1, 9, 600, 20, '1 skive (20 g)'],
    ];
    vi.stubGlobal('fetch', async (u: string) => { urls.push(u); return u.startsWith('/api/') ? { status: 404, headers: { get: () => 'text/html' } } : u.includes('off-dk') ? reply(200, { rows }) : reply(200, { products: [] }); });
    const { searchOnline, searchDanish } = await import('../src/lib/foodApi');
    const { pickOnline } = await import('../src/lib/foodText');
    const dk = await searchDanish('Cheasy vaniljeskyr 0% fedt');
    expect(dk[0].name).toBe('Skyr Vanilje'); expect(dk[0].brand).toBe('Cheasy');
    expect(pickOnline('Cheasy vaniljeskyr 0% fedt', dk)?.id).toBe('off:5711953021470');
    const all = await searchOnline('cheasy vaniljeskyr');
    expect(all.status).toBe('ok'); expect(all.foods[0].brand).toBe('Cheasy');
    expect(urls.some((u) => u.includes('search_terms=cheasy%20vanilje%20skyr'))).toBe(true); // the live search gets the cleaned words
    const lp = (await searchDanish('leverpostej'))[0];
    expect(lp.name).toBe('Leverpostej'); expect(lp.portions[0]).toMatchObject({ amount: 20, verified: true });
    expect(await searchDanish('chicken breast')).toEqual([]);
  });
});

import { searchQuery } from '../src/lib/foodText';
describe('search words', () => {
  it('splits a flavour glued onto skyr and drops fat percentages', () => {
    expect(searchQuery('Cheasy vaniljeskyr 0% fedt')).toBe('cheasy vanilje skyr');
    expect(searchQuery('jordbæryoghurt 0,1 % fedt')).toBe('jordbær yoghurt');
    expect(searchQuery('rugbrød med leverpostej')).toBe('rugbrød leverpostej');
    expect(searchQuery('greek yogurt')).toBe('greek yogurt');
    expect(searchQuery('lyst rugbrød')).toBe('lyst rugbrød');
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
  it('finds the Cheasy skyr when Omar says it the Danish way', () => {
    const list = [mk('Vaniljeskyr', 71, { p: 10, c: 7.4, f: 0.2, brand: 'Thise' }), mk('Skyr m. vanilje 0,2% fedt', 81, { p: 8.6, c: 11, f: 0.2, brand: 'Salling' }), mk('Skyr vanilje', 55, { p: 8.6, c: 4, f: 0.2, brand: 'Cheasy' })];
    expect(pickOnline('cheasy vaniljeskyr 0% fedt', list)?.brand).toBe('Cheasy');
    expect(pickOnline('vaniljeskyr', list)?.name).toMatch(/vanilje/i);
  });
  it('returns nothing for a poor match so the AI estimate takes over', () => {
    expect(pickOnline('rugbrød med leverpostej', [mk('Chocolate wafer', 520, { p: 6, c: 60, f: 28 })])).toBeUndefined();
    expect(pickOnline('banana', [mk('Banana', 89, { p: 1, c: 22, f: 0.3 })])?.name).toBe('Banana');
    expect(pickOnline('rice krispies', [mk('Rice Krispies', 380, { p: 6, c: 85, f: 1, brand: "Kellogg's" })])?.name).toBe('Rice Krispies');
  });
});
