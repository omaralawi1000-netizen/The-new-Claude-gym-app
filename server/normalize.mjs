// Normalisers: turn Open Food Facts / USDA FoodData Central payloads into Aven's Food shape.
// Pure functions (no network) so they can be unit-tested against fixtures.
//
// Aven food: { id, name, brand?, source, sourceId, barcode?, basis:'g'|'ml', per100:{kcal,protein,carbs,fat,fibre,sugar,satFat,sodium(mg)},
//              portions:[{id,label,amount,verified}], density? }
// Missing nutrients are OMITTED (unknown), never defaulted to 0.

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** Open Food Facts product → Aven food. OFF nutriments are per 100 g (or per 100 ml for liquids); sodium is in GRAMS. */
export function fromOff(p) {
  if (!p || !p.code) return null;
  const n = p.nutriments ?? {};
  const name = (p.product_name_en || p.product_name || p.generic_name || '').trim();
  if (!name) return null;
  const kcal = num(n['energy-kcal_100g']) ?? (num(n['energy_100g']) !== undefined ? num(n['energy_100g']) / 4.184 : undefined);
  const sodiumG = num(n['sodium_100g']) ?? (num(n['salt_100g']) !== undefined ? num(n['salt_100g']) / 2.5 : undefined);
  // liquids: OFF flags them via quantity in ml / nutrition per 100 ml
  const liquid = /\b(ml|cl|dl|l)\b/i.test(String(p.quantity ?? '')) && !/\bg\b|kg/i.test(String(p.quantity ?? ''));
  const per100 = clean({
    kcal: kcal !== undefined ? Math.round(kcal * 10) / 10 : undefined,
    protein: num(n['proteins_100g']), carbs: num(n['carbohydrates_100g']), fat: num(n['fat_100g']),
    fibre: num(n['fiber_100g']), sugar: num(n['sugars_100g']), satFat: num(n['saturated-fat_100g']),
    sodium: sodiumG !== undefined ? Math.round(sodiumG * 1000) : undefined,
  });
  if (per100.kcal === undefined && per100.protein === undefined && per100.carbs === undefined && per100.fat === undefined) return null;
  const portions = [];
  const sq = num(p.serving_quantity);
  if (sq && sq > 0 && p.serving_size) portions.push({ id: 'serving', label: `1 serving (${String(p.serving_size).trim()})`, amount: sq, verified: true });
  return clean({
    id: `off:${p.code}`, name, brand: (p.brands || '').split(',')[0].trim() || undefined, source: 'off', sourceId: String(p.code), barcode: String(p.code),
    basis: liquid ? 'ml' : 'g', per100, portions,
    // density is NOT assumed for liquids; ml-basis foods simply only accept ml
  });
}

const USDA = { kcal: 1008, protein: 1003, fat: 1004, carbs: 1005, fibre: 1079, sugar: 2000, satFat: 1258, sodium: 1093 };
/** USDA FDC search/food result → Aven food. Branded + Foundation/SR Legacy values are per 100 g. */
export function fromUsda(f) {
  if (!f || !f.fdcId) return null;
  const list = f.foodNutrients ?? [];
  const get = (id) => {
    const hit = list.find((x) => (x.nutrientId ?? x.nutrient?.id) === id);
    return hit ? num(hit.value ?? hit.amount) : undefined;
  };
  let kcal = get(USDA.kcal);
  if (kcal === undefined) { const kj = list.find((x) => (x.nutrientId ?? x.nutrient?.id) === 1062); if (kj) kcal = num(kj.value ?? kj.amount) / 4.184; } // Atwater-free fallback: energy in kJ
  const per100 = clean({
    kcal: kcal !== undefined ? Math.round(kcal * 10) / 10 : undefined, protein: get(USDA.protein), carbs: get(USDA.carbs), fat: get(USDA.fat),
    fibre: get(USDA.fibre), sugar: get(USDA.sugar), satFat: get(USDA.satFat), sodium: get(USDA.sodium),
  });
  if (per100.kcal === undefined && per100.protein === undefined) return null;
  const portions = [];
  if (f.servingSize && /^g/i.test(f.servingSizeUnit ?? '') && num(f.servingSize) > 0) portions.push({ id: 'serving', label: `1 serving (${f.householdServingFullText || `${num(f.servingSize)} g`})`, amount: num(f.servingSize), verified: true });
  const liquid = /^ml/i.test(f.servingSizeUnit ?? '');
  const state = /\braw\b/i.test(f.description) ? 'raw' : /\b(cooked|boiled|baked|roasted|fried|grilled)\b/i.test(f.description) ? 'cooked' : undefined;
  const title = String(f.description ?? '').toLowerCase().replace(/(^|[\s,(-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  return clean({
    id: `usda:${f.fdcId}`, name: title, brand: f.brandName || f.brandOwner || undefined, source: 'usda', sourceId: String(f.fdcId), barcode: f.gtinUpc || undefined,
    basis: liquid ? 'ml' : 'g', per100, portions, state,
  });
}

export function dedupe(foods) {
  const seen = new Set();
  return foods.filter((f) => { const k = `${f.source}:${f.sourceId}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
