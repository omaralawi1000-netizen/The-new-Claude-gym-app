import type {
  BasisUnit, Food, FoodEntry, FoodSnapshot, Nutrients, NutrientKey, Portion, Quantity, Recipe,
} from './types';

export const NUTRIENT_KEYS: NutrientKey[] = ['kcal', 'protein', 'carbs', 'fat', 'fibre', 'sugar', 'satFat', 'sodium'];
export const CORE: NutrientKey[] = ['kcal', 'protein', 'carbs', 'fat'];
export const OPTIONAL: NutrientKey[] = ['fibre', 'sugar', 'satFat', 'sodium'];

let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ── Quantities ──────────────────────────────────────────────

export type BaseResult = { ok: true; base: number; estimated: boolean } | { ok: false; reason: 'noDensity' | 'noPortion' | 'invalid' };

interface Convertible {
  basis: BasisUnit;
  density?: number;
  portions: Portion[];
}

/**
 * Convert a user quantity into the food's own basis unit (g or ml).
 * Never assumes 1 ml = 1 g: that conversion needs a density from the data.
 */
export function toBase(food: Convertible, q: Quantity): BaseResult {
  if (!Number.isFinite(q.amount) || q.amount < 0) return { ok: false, reason: 'invalid' };
  if (q.unit === 'portion') {
    const p = food.portions.find((x) => x.id === q.portionId);
    if (!p) return { ok: false, reason: 'noPortion' };
    return { ok: true, base: q.amount * p.amount, estimated: !p.verified };
  }
  if (q.unit === food.basis) return { ok: true, base: q.amount, estimated: false };
  if (!food.density || food.density <= 0) return { ok: false, reason: 'noDensity' };
  // g → ml divides by density; ml → g multiplies
  return { ok: true, base: q.unit === 'g' ? q.amount / food.density : q.amount * food.density, estimated: false };
}

/** Units a food can legitimately be measured in. */
export function allowedUnits(food: Convertible): ('g' | 'ml')[] {
  if (food.density && food.density > 0) return ['g', 'ml'];
  return [food.basis];
}

// ── Nutrients ───────────────────────────────────────────────

export function scale(per100: Nutrients, base: number): Nutrients {
  const out: Nutrients = {};
  for (const k of NUTRIENT_KEYS) {
    const v = per100[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = (v * base) / 100;
  }
  return out;
}

export interface Sum {
  totals: Nutrients;
  /** number of items for which each nutrient is unknown */
  unknown: Partial<Record<NutrientKey, number>>;
  count: number;
}

/** Sum nutrient objects. A nutrient unknown on some items stays known-from-others but is flagged incomplete. */
export function sumNutrients(list: Nutrients[]): Sum {
  const totals: Nutrients = {};
  const unknown: Sum['unknown'] = {};
  for (const n of list) {
    for (const k of NUTRIENT_KEYS) {
      const v = n[k];
      if (typeof v === 'number') totals[k] = (totals[k] ?? 0) + v;
      else unknown[k] = (unknown[k] ?? 0) + 1;
    }
  }
  return { totals, unknown, count: list.length };
}

export function snapshotOf(food: Food): FoodSnapshot {
  return {
    foodId: food.id,
    name: food.name,
    brand: food.brand,
    source: food.source,
    sourceId: food.sourceId,
    state: food.state,
    basis: food.basis,
    per100: { ...food.per100 },
    density: food.density,
    portions: food.portions.map((p) => ({ ...p })),
  };
}

export function entryFromSnapshot(
  snap: FoodSnapshot, qty: Quantity, date: string, mealId: string, opts: { at?: number; note?: string; id?: string } = {},
): FoodEntry | null {
  const r = toBase(snap, qty);
  if (!r.ok) return null;
  return {
    id: opts.id ?? uid('e'),
    date,
    mealId,
    at: opts.at ?? Date.now(),
    snap,
    qty,
    base: r.base,
    nutrients: scale(snap.per100, r.base),
    note: opts.note,
    estimated: r.estimated || undefined,
  };
}

/** Recompute an existing entry for a new quantity, from its own frozen snapshot. */
export function requantify(entry: FoodEntry, qty: Quantity): FoodEntry | null {
  if (entry.quick) return entry;
  const r = toBase(entry.snap, qty);
  if (!r.ok) return null;
  return { ...entry, qty, base: r.base, nutrients: scale(entry.snap.per100, r.base), estimated: r.estimated || undefined };
}

/** Manual calorie/macro entry. Fields left blank stay unknown. */
export function quickEntry(
  label: string, nutrients: Nutrients, date: string, mealId: string,
): FoodEntry {
  const clean: Nutrients = {};
  for (const k of NUTRIENT_KEYS) {
    const v = nutrients[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) clean[k] = v;
  }
  return {
    id: uid('e'), date, mealId, at: Date.now(), quick: true,
    snap: { name: label || 'Quick entry', source: 'quick', basis: 'g', per100: {}, portions: [] },
    qty: { amount: 1, unit: 'portion' }, base: 1, nutrients: clean,
  };
}

// ── Recipes ─────────────────────────────────────────────────

export interface RecipeCalc {
  totals: Nutrients;
  unknown: Sum['unknown'];
  /** total prepared weight in g, if known */
  weightG?: number;
  /** ingredients add up to a weight only when every one is convertible to grams */
  weightIsSum: boolean;
  perServing: Nutrients;
  per100: Nutrients | null;
  servingG?: number;
  needsWeight: boolean;
}

export function calcRecipe(r: Pick<Recipe, 'ingredients' | 'servings' | 'totalWeightG'>): RecipeCalc {
  const s = sumNutrients(r.ingredients.map((i) => scale(i.snap.per100, i.base)));
  let sumG = 0;
  let convertible = r.ingredients.length > 0;
  for (const i of r.ingredients) {
    if (i.snap.basis === 'g') sumG += i.base;
    else if (i.snap.density) sumG += i.base * i.snap.density;
    else convertible = false;
  }
  const weightG = r.totalWeightG && r.totalWeightG > 0 ? r.totalWeightG : convertible ? sumG : undefined;
  const servings = Math.max(r.servings || 1, 0.25);
  const perServing: Nutrients = {};
  // A nutrient is known for the recipe only if every ingredient had it.
  const totals: Nutrients = {};
  for (const k of NUTRIENT_KEYS) {
    if (!s.unknown[k] && s.totals[k] !== undefined) {
      totals[k] = s.totals[k];
      perServing[k] = s.totals[k]! / servings;
    }
  }
  const per100: Nutrients | null = weightG ? {} : null;
  if (per100 && weightG) for (const k of NUTRIENT_KEYS) if (totals[k] !== undefined) per100[k] = (totals[k]! / weightG) * 100;
  return {
    totals, unknown: s.unknown, weightG, weightIsSum: !(r.totalWeightG && r.totalWeightG > 0) && convertible,
    perServing, per100, servingG: weightG ? weightG / servings : undefined, needsWeight: !weightG,
  };
}

/** Turn a recipe into a loggable Food (g-basis, with a verified "1 serving"). */
export function recipeToFood(r: Recipe): Food | null {
  const c = calcRecipe(r);
  if (!c.per100 || !c.weightG) return null;
  const portions: Portion[] = [];
  if (c.servingG) portions.push({ id: 'serving', label: '1 serving', amount: c.servingG, verified: true });
  portions.push({ id: 'whole', label: 'Whole recipe', amount: c.weightG, verified: true });
  return {
    id: `recipe:${r.id}`, name: r.name, source: 'recipe', basis: 'g', per100: c.per100, portions,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

// ── Formatting ──────────────────────────────────────────────

/** Rounding policy: store full precision; round only for display. Totals are summed unrounded, then rounded once. */
export function roundKcal(v: number): number { return Math.round(v); }
export function roundG(v: number): number { return v < 10 ? Math.round(v * 10) / 10 : Math.round(v); }
export function roundMg(v: number): number { return Math.round(v / 5) * 5; }

export function roundNutrient(k: NutrientKey, v: number): number {
  if (k === 'kcal') return roundKcal(v);
  if (k === 'sodium') return roundMg(v);
  return roundG(v);
}

export function pct(v: number, of: number): number {
  if (!of || of <= 0) return 0;
  return Math.max(0, Math.min(1, v / of));
}

/** Energy check: does kcal roughly agree with macros (4/4/9)? Used to flag suspicious custom entries. */
export function energyMismatch(n: Nutrients): number | null {
  if (n.kcal === undefined || n.protein === undefined || n.carbs === undefined || n.fat === undefined) return null;
  const est = n.protein * 4 + n.carbs * 4 + n.fat * 9;
  if (est === 0 && n.kcal === 0) return 0;
  const base = Math.max(est, n.kcal, 1);
  return Math.abs(est - n.kcal) / base;
}

/** Macro targets in grams. */
export interface Macros { protein: number; carbs: number; fat: number }
/** Calories from macros (4 / 4 / 9 kcal per gram). */
export function kcalOf(m: Macros): number { return Math.round(m.protein * 4 + m.carbs * 4 + m.fat * 9); }
/**
 * Macros scaled to a new calorie target, keeping their shares: each one moves in proportion, whole grams, and any
 * rounding left over goes to carbs so the total lands within a few kcal of the target.
 */
export function scaleMacros(m: Macros, kcal: number): Macros {
  const from = kcalOf(m);
  if (!(kcal > 0) || !(from > 0)) return m;
  const f = kcal / from;
  const protein = Math.max(0, Math.round(m.protein * f)), fat = Math.max(0, Math.round(m.fat * f));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { protein, carbs, fat };
}
/** A sensible start from a calorie target: protein 2 g per kg (or 30 % of kcal without a weight), fat 25 %, carbs the rest. */
export function suggestMacros(kcal: number, weightKg?: number): Macros {
  const protein = Math.round(weightKg && weightKg > 0 ? Math.min(weightKg * 2, (kcal * 0.4) / 4) : (kcal * 0.3) / 4);
  const fat = Math.round((kcal * 0.25) / 9);
  return { protein, fat, carbs: Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4)) };
}
