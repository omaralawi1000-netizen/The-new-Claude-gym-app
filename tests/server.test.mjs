import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { fromOff, fromUsda, dedupe } from '../server/normalize.mjs';

// Fixtures follow the documented response shapes of each API (they are NOT live captures — the sandbox cannot reach either service).
const OFF_SKYR = { code: '5711953000000', product_name: 'Skyr Naturel', brands: 'Arla, Arla Foods', quantity: '450 g', serving_size: '150 g', serving_quantity: 150,
  nutriments: { 'energy-kcal_100g': 63, proteins_100g: 11, carbohydrates_100g: 4, fat_100g: 0.2, 'saturated-fat_100g': 0.1, sugars_100g: 4, sodium_100g: 0.04 } };
const OFF_NO_NUTRI = { code: '1234567890123', product_name: 'Mystery', nutriments: {} };
const OFF_COLA = { code: '5449000000996', product_name: 'Cola', brands: 'Cola Co', quantity: '330 ml', nutriments: { 'energy-kcal_100g': 42, carbohydrates_100g: 10.6, proteins_100g: 0, fat_100g: 0, sugars_100g: 10.6, salt_100g: 0.01 } };
const USDA_BANANA = { fdcId: 1105073, description: 'BANANAS, RAW', dataType: 'Foundation', foodNutrients: [
  { nutrientId: 1008, value: 89 }, { nutrientId: 1003, value: 1.09 }, { nutrientId: 1005, value: 22.8 }, { nutrientId: 1004, value: 0.33 }, { nutrientId: 1079, value: 2.6 }, { nutrientId: 2000, value: 12.2 }] };
const USDA_BRANDED = { fdcId: 2000001, description: 'OAT DRINK', brandOwner: 'Acme', servingSize: 240, servingSizeUnit: 'ml', foodNutrients: [{ nutrientId: 1008, value: 46 }, { nutrientId: 1003, value: 1 }] };

describe('normalisers', () => {
  it('OFF: per-100 values, sodium g→mg, verified serving, brand trimmed', () => {
    const f = fromOff(OFF_SKYR);
    expect(f).toMatchObject({ id: 'off:5711953000000', name: 'Skyr Naturel', brand: 'Arla', source: 'off', barcode: '5711953000000', basis: 'g' });
    expect(f.per100).toEqual({ kcal: 63, protein: 11, carbs: 4, fat: 0.2, sugar: 4, satFat: 0.1, sodium: 40 });
    expect(f.per100.fibre).toBeUndefined(); // unknown stays unknown
    expect(f.portions[0]).toMatchObject({ amount: 150, verified: true });
  });
  it('OFF: salt converts to sodium; ml products are ml-basis with NO density', () => {
    const f = fromOff(OFF_COLA);
    expect(f.basis).toBe('ml'); expect(f.density).toBeUndefined(); expect(f.per100.sodium).toBe(4);
  });
  it('OFF: products without nutrition are dropped', () => { expect(fromOff(OFF_NO_NUTRI)).toBeNull(); expect(fromOff({ code: '1' })).toBeNull(); });
  it('USDA: nutrient ids, title-casing, raw state, missing macros stay undefined', () => {
    const f = fromUsda(USDA_BANANA);
    expect(f).toMatchObject({ id: 'usda:1105073', name: 'Bananas, Raw', state: 'raw', source: 'usda', basis: 'g' });
    expect(f.per100).toMatchObject({ kcal: 89, protein: 1.09, carbs: 22.8, fat: 0.33, fibre: 2.6, sugar: 12.2 });
    expect(f.per100.sodium).toBeUndefined();
  });
  it('USDA: ml serving → ml basis, no g portion invented', () => {
    const f = fromUsda(USDA_BRANDED);
    expect(f.basis).toBe('ml'); expect(f.portions).toEqual([]); expect(f.brand).toBe('Acme');
  });
  it('dedupe by source+id', () => { expect(dedupe([fromOff(OFF_SKYR), fromOff(OFF_SKYR), fromUsda(USDA_BANANA)]).length).toBe(2); });
});

describe('server (upstream stubbed)', () => {
  let base; let srv; const realFetch = globalThis.fetch;
  beforeAll(async () => {
    process.env.USDA_API_KEY = 'test-key';
    globalThis.fetch = vi.fn(async (url, init) => {
      const u = String(url);
      if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);
      if (u.includes('openfoodfacts.org/cgi/search.pl')) { expect(init.headers['User-Agent']).toMatch(/^Aven\//); return new Response(JSON.stringify({ products: [OFF_SKYR, OFF_NO_NUTRI] }), { status: 200, headers: { 'content-type': 'application/json' } }); }
      if (u.includes('api.nal.usda.gov')) { expect(u).toContain('api_key=test-key'); return new Response(JSON.stringify({ foods: [USDA_BANANA] }), { status: 200 }); }
      if (u.includes('/api/v2/product/404')) return new Response(JSON.stringify({ status: 0 }), { status: 404 });
      if (u.includes('/api/v2/product/')) return new Response(JSON.stringify({ status: 1, product: OFF_SKYR }), { status: 200 });
      return new Response('nope', { status: 500 });
    });
    const { server } = await import('../server/index.mjs');
    srv = server; await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`;
  });
  afterAll(() => { srv.close(); globalThis.fetch = realFetch; });
  it('merges OFF + USDA, never exposes the key', async () => {
    const r = await fetch(`${base}/api/food/search?q=skyr`); const j = await r.json();
    expect(r.status).toBe(200); expect(j.foods.map((f) => f.id).sort()).toEqual(['off:5711953000000', 'usda:1105073']);
    expect(JSON.stringify(j)).not.toContain('test-key');
    expect(j.sources).toEqual({ off: true, usda: true });
  });
  it('second identical query is served from cache', async () => { const r = await fetch(`${base}/api/food/search?q=skyr`); expect(r.headers.get('x-cache')).toBe('HIT'); });
  it('rejects too-short queries', async () => { expect((await fetch(`${base}/api/food/search?q=a`)).status).toBe(400); });
  it('barcode hit and miss', async () => {
    const ok = await fetch(`${base}/api/food/barcode/5711953000000`); expect(ok.status).toBe(200); expect((await ok.json()).food.name).toBe('Skyr Naturel');
    expect((await fetch(`${base}/api/food/barcode/404404404404`)).status).toBe(404);
    expect((await fetch(`${base}/api/food/barcode/abc`)).status).toBe(404);
  });
});
