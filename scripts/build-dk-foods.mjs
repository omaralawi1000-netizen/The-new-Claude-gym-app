// Builds src/data/off/off-dk.json: every product Open Food Facts lists as sold in Denmark (with calories), packed small.
// Why: from the live app (GitHub Pages) the only Open Food Facts text search a browser may call is the old one, which
// often answers "temporarily unavailable" and only finds exact words; the newer search blocks other websites (CORS).
// A packed Danish list makes Danish products (Cheasy, Arla, Lurpak, Kohberg…) instant and reliable, also offline.
// Data: Open Food Facts, ODbL. Run on a machine with internet: `node scripts/build-dk-foods.mjs [dump.csv.gz]`.
import { createReadStream, writeFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { fromOff } from '../server/normalize.mjs';

const DUMP = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz';
const src = process.argv[2]
  ? createReadStream(process.argv[2])
  : Readable.fromWeb((await fetch(DUMP, { headers: { 'User-Agent': 'Aven/1.0 (personal gym app; github.com/omaralawi1000-netizen)' } })).body);
const lines = createInterface({ input: src.pipe(createGunzip()), crlfDelay: Infinity });

const NUT = ['energy-kcal_100g', 'energy_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g', 'fiber_100g', 'sugars_100g', 'saturated-fat_100g', 'sodium_100g', 'salt_100g'];
let col = null, seen = 0;
const out = new Map();
for await (const line of lines) {
  const c = line.split('\t');
  if (!col) { col = Object.fromEntries(c.map((h, i) => [h, i])); continue; }
  seen++;
  const tags = c[col.countries_tags] ?? '';
  if (!tags.includes('en:denmark')) continue;
  const code = c[col.code];
  if (!code || out.has(code)) continue;
  const p = {
    code, product_name: c[col.product_name], generic_name: c[col.generic_name], brands: c[col.brands],
    quantity: c[col.quantity], serving_size: c[col.serving_size], serving_quantity: c[col.serving_quantity],
    nutriments: Object.fromEntries(NUT.map((k) => [k, c[col[k]]]).filter(([, v]) => v !== undefined && v !== '')),
  };
  const f = fromOff(p);
  if (!f || f.per100.kcal === undefined || f.per100.kcal > 900) continue;
  const n = f.per100, r = (v) => (v === undefined ? null : Math.round(v * 10) / 10);
  const sv = f.portions[0];
  // [code, name, brand, liquid, kcal, protein, carbs, fat, fibre, sugar, satFat, sodium mg, serving amount, serving label]
  out.set(code, [code, f.name.slice(0, 80), (f.brand ?? '').slice(0, 40), f.basis === 'ml' ? 1 : 0, r(n.kcal), r(n.protein), r(n.carbs), r(n.fat), r(n.fibre), r(n.sugar), r(n.satFat), n.sodium === undefined ? null : Math.round(n.sodium), sv ? r(sv.amount) : null, sv ? String(p.serving_size).trim().slice(0, 30) : null]);
}
const rows = [...out.values()];
writeFileSync(new URL('../src/data/off/off-dk.json', import.meta.url), JSON.stringify({ v: 1, built: new Date().toISOString().slice(0, 10), source: 'Open Food Facts (ODbL)', rows }));
console.log(`scanned ${seen} products, kept ${rows.length} sold in Denmark`);
