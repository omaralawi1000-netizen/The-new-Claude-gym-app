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
