// DEVELOPMENT ONLY: stands in for Open Food Facts / USDA so the online-lookup UI can be exercised offline.
// Enabled with AVEN_MOCK_UPSTREAM=1. The products are invented (fictional brands) and are NOT real data.
const OFF = [
  { code: '5701111111111', product_name: 'Skyr Naturel', brands: 'DemoDairy', quantity: '450 g', serving_size: '150 g', serving_quantity: 150, nutriments: { 'energy-kcal_100g': 62, proteins_100g: 11, carbohydrates_100g: 4, fat_100g: 0.2, sugars_100g: 4, 'saturated-fat_100g': 0.1, sodium_100g: 0.04 } },
  { code: '5702222222222', product_name: 'Skyr Vanilje', brands: 'DemoDairy', quantity: '450 g', nutriments: { 'energy-kcal_100g': 74, proteins_100g: 9.5, carbohydrates_100g: 8, fat_100g: 0.2 } },
  { code: '5703333333333', product_name: 'Havredrik Barista', brands: 'OatDemo', quantity: '1 l', nutriments: { 'energy-kcal_100g': 59, proteins_100g: 1, carbohydrates_100g: 6.6, fat_100g: 3, fiber_100g: 0.8 } },
  { code: '5704444444444', product_name: 'Rugbrød Skåret', brands: 'BagerDemo', quantity: '500 g', serving_size: '1 skive (35 g)', serving_quantity: 35, nutriments: { 'energy-kcal_100g': 205, proteins_100g: 6.5, carbohydrates_100g: 34, fat_100g: 1.6, fiber_100g: 7.5, salt_100g: 1.1 } },
];
const USDA = [{ fdcId: 9000001, description: 'YOGURT, GREEK, PLAIN, NONFAT', dataType: 'SR Legacy', foodNutrients: [{ nutrientId: 1008, value: 59 }, { nutrientId: 1003, value: 10.2 }, { nutrientId: 1005, value: 3.6 }, { nutrientId: 1004, value: 0.4 }, { nutrientId: 1093, value: 36 }] }];
const real = globalThis.fetch;
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('openfoodfacts.org/cgi/search.pl')) { const q = (new URL(u).searchParams.get('search_terms') ?? '').toLowerCase(); return json({ products: OFF.filter((p) => p.product_name.toLowerCase().includes(q) || q.split(' ').some((w) => w.length > 2 && p.product_name.toLowerCase().includes(w))) }); }
  if (u.includes('api.nal.usda.gov')) { const q = (new URL(u).searchParams.get('query') ?? '').toLowerCase(); return json({ foods: /yog|skyr|greek/.test(q) ? USDA : [] }); }
  const m = u.match(/api\/v2\/product\/(\d+)/);
  if (m) { const p = OFF.find((x) => x.code === m[1]); return p ? json({ status: 1, product: p }) : json({ status: 0 }, 404); }
  return real(url, init);
};
console.log('[mock] upstream stubbed — results are fictional');
