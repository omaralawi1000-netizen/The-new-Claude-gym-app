import { describe, it, expect } from 'vitest';
import { toBase, scale, sumNutrients, calcRecipe, recipeToFood, entryFromSnapshot, requantify, snapshotOf, quickEntry, allowedUnits, kcalOf, scaleMacros, suggestMacros } from '../src/lib/nutrition';
import { REFERENCE_BY_ID, REFERENCE_FOODS } from '../src/data/foods';
import { parseFoodText, resolveRows, rowQuantity, searchFoods } from '../src/lib/foodText';
import { parseWorkoutText } from '../src/lib/workoutText';
import { dayKey, addDays, startOfWeek, diffDays } from '../src/lib/dates';
import { parseNum, kgToDisplay, displayToKg } from '../src/lib/units';
import { detectRecords, epley, suggestProgression, elapsedMs, fillPlan, incrementFor } from '../src/lib/workout';
import { SEED_EXERCISES } from '../src/data/exercises';
import type { WorkoutSession } from '../src/lib/types';

const skyr = REFERENCE_BY_ID['ref:skyr-plain'];
const milk = REFERENCE_BY_ID['ref:milk-15'];
const banana = REFERENCE_BY_ID['ref:banana'];
const oil = REFERENCE_BY_ID['ref:olive-oil'];

describe('quantities', () => {
  it('grams on a g-basis food', () => {
    const r = toBase(skyr, { amount: 200, unit: 'g' });
    expect(r).toEqual({ ok: true, base: 200, estimated: false });
  });
  it('never assumes 1 ml = 1 g', () => {
    expect(toBase(skyr, { amount: 100, unit: 'ml' })).toEqual({ ok: false, reason: 'noDensity' });
    expect(allowedUnits(skyr)).toEqual(['g']);
  });
  it('uses density when known', () => {
    const r = toBase(milk, { amount: 100, unit: 'g' });
    expect(r.ok && r.base).toBeCloseTo(100 / 1.03, 6);
    const o = toBase(oil, { amount: 15, unit: 'ml' });
    expect(o.ok && o.base).toBeCloseTo(13.65, 6);
  });
  it('unverified portions are flagged as estimates', () => {
    const r = toBase(banana, { amount: 1, unit: 'portion', portionId: 'p0' });
    expect(r).toEqual({ ok: true, base: 118, estimated: true });
  });
  it('rejects negatives and missing portions', () => {
    expect(toBase(skyr, { amount: -1, unit: 'g' }).ok).toBe(false);
    expect(toBase(skyr, { amount: 1, unit: 'portion', portionId: 'nope' }).ok).toBe(false);
  });
});

describe('nutrients', () => {
  it('scales per-100 values', () => {
    const n = scale(skyr.per100, 200);
    expect(n.kcal).toBeCloseTo(126); expect(n.protein).toBeCloseTo(22);
  });
  it('unknown nutrients stay unknown, not zero', () => {
    const food = REFERENCE_BY_ID['ref:whey'];
    const n = scale(food.per100, 30);
    expect(n.sodium).toBeUndefined();
    const s = sumNutrients([n, scale(skyr.per100, 100)]);
    expect(s.unknown.sodium).toBe(1);
    expect(s.totals.sodium).toBeCloseTo(40);
  });
  it('requantify recomputes from the frozen snapshot, not the live food', () => {
    const e = entryFromSnapshot(snapshotOf(skyr), { amount: 100, unit: 'g' }, '2026-01-01', 'm1')!;
    const mutated = { ...skyr, per100: { ...skyr.per100, kcal: 999 } };
    void mutated;
    const e2 = requantify(e, { amount: 300, unit: 'g' })!;
    expect(e2.nutrients.kcal).toBeCloseTo(189);
  });
  it('quick entry keeps blanks unknown', () => {
    const q = quickEntry('Snack', { kcal: 300 }, '2026-01-01', 'm1');
    expect(q.nutrients).toEqual({ kcal: 300 });
  });
  it('all reference foods have sane numbers and energy roughly matching macros (fibre counted at ~2 kcal/g; alcohol exempt)', () => {
    for (const f of REFERENCE_FOODS) {
      const n = f.per100;
      expect(n.kcal).toBeGreaterThanOrEqual(0);
      const fibre = n.fibre ?? 0;
      const est = (n.protein ?? 0) * 4 + Math.max(0, (n.carbs ?? 0) - fibre) * 4 + fibre * 2 + (n.fat ?? 0) * 9;
      const alcohol = /^ref:(beer|red-wine|white-wine|spirits|gin-tonic|cider|rose-wine|sparkling-wine|glogg)/.test(f.id);
      if (!alcohol && n.kcal! > 20) expect(Math.abs(est - n.kcal!) / n.kcal!, f.id).toBeLessThan(0.3);
    }
    expect(new Set(REFERENCE_FOODS.map((f) => f.id)).size).toBe(REFERENCE_FOODS.length); // unique ids
    expect(REFERENCE_FOODS.length).toBeGreaterThan(450);
  });
});

describe('recipes', () => {
  const ing = (food: any, grams: number) => ({ id: 'i' + grams, snap: snapshotOf(food), qty: { amount: grams, unit: 'g' as const }, base: grams });
  it('totals, per serving and per 100 g', () => {
    const r = { ingredients: [ing(REFERENCE_BY_ID['ref:oats-dry'], 100), ing(milk, 200)], servings: 2, totalWeightG: undefined };
    const c = calcRecipe(r);
    // milk 200 ml = 200 base (ml) → converts to g via density 1.03 → 206 g
    expect(c.weightG).toBeCloseTo(100 + 206, 4);
    expect(c.totals.kcal).toBeCloseTo(372 + 92, 4);
    expect(c.perServing.kcal).toBeCloseTo((372 + 92) / 2, 4);
  });
  it('prepared weight overrides summed weight', () => {
    const c = calcRecipe({ ingredients: [ing(REFERENCE_BY_ID['ref:rice-dry'], 100)], servings: 2, totalWeightG: 300 });
    expect(c.per100!.kcal).toBeCloseTo(120, 6);
    expect(c.servingG).toBe(150);
  });
  it('needs a weight when ingredients are ml without density', () => {
    const odd = { ...milk, density: undefined };
    const c = calcRecipe({ ingredients: [ing(odd, 100)], servings: 1 });
    expect(c.needsWeight).toBe(true);
  });
  it('a nutrient missing on any ingredient is unknown for the recipe', () => {
    const c = calcRecipe({ ingredients: [ing(REFERENCE_BY_ID['ref:whey'], 30), ing(skyr, 100)], servings: 1 });
    expect(c.totals.sodium).toBeUndefined();
    expect(c.totals.kcal).toBeDefined();
  });
  it('recipe food logs a serving', () => {
    const f = recipeToFood({ id: 'r1', name: 'Overnight oats', servings: 2, totalWeightG: 500, createdAt: 0, updatedAt: 0, ingredients: [ing(REFERENCE_BY_ID['ref:oats-dry'], 100)] })!;
    const e = entryFromSnapshot(snapshotOf(f), { amount: 1, unit: 'portion', portionId: 'serving' }, 'd', 'm')!;
    expect(e.base).toBe(250);
    expect(e.nutrients.kcal).toBeCloseTo(186, 4);
    expect(e.estimated).toBeUndefined();
  });
});

describe('dictation: food', () => {
  const pool = REFERENCE_FOODS;
  it('parses the brief example', () => {
    const rows = parseFoodText('200 grams of skyr, one banana and 60 grams of oats');
    expect(rows.map((r) => [r.amount, r.dim, r.query])).toEqual([[200, 'g', 'skyr'], [1, 'count', 'banana'], [60, 'g', 'oats']]);
  });
  it('banana resolves; skyr and oats need review (variants/raw-vs-cooked)', () => {
    const r = resolveRows(parseFoodText('200 grams of skyr, one banana and 60 grams of oats'), pool, {});
    expect(r[0].status).toBe('ambiguous');
    expect(r[1].status).toBe('resolved');
    expect(r[1].choiceId).toBe('ref:banana');
    expect(r[2].status).toBe('ambiguous');
  });
  it('remembered choices resolve next time', () => {
    const r = resolveRows(parseFoodText('60 grams of oats'), pool, { oats: 'ref:oats-dry' });
    expect(r[0].status).toBe('resolved'); expect(r[0].remembered).toBe(true);
  });
  it('unknown food is unmatched', () => {
    expect(resolveRows(parseFoodText('3 xylophones'), pool, {})[0].status).toBe('unmatched');
  });
  it('count → estimated portion; volume without density asks for grams', () => {
    const b = rowQuantity(parseFoodText('one banana')[0], banana);
    expect(b.qty).toEqual({ amount: 1, unit: 'portion', portionId: 'p0' }); expect(b.estimated).toBe(true);
    const s = rowQuantity(parseFoodText('2 dl skyr')[0], skyr);
    expect(s.problem).toBe('needsGrams');
  });
  it('decimal commas and Danish', () => {
    const rows = parseFoodText('1,5 dl mælk og 2 skiver rugbrød');
    expect(rows[0]).toMatchObject({ amount: 150, dim: 'ml', query: 'mælk' });
    expect(rows[1]).toMatchObject({ amount: 2, dim: 'count', countWord: 'slice', query: 'rugbrød' });
    const r = resolveRows(rows, pool, {});
    expect(r[1].choiceId).toBe('ref:bread-rye');
  });
  it('search folds æøå and brand tokens', () => {
    expect(searchFoods('aeble', pool)[0].food.id).toBe('ref:apple');
    expect(searchFoods('havregryn', pool)[0].food.id).toBe('ref:oats-dry');
  });
});

describe('dictation: workout', () => {
  it('weight x reps, list of reps, sets of', () => {
    expect(parseWorkoutText('bench press 80 kilos for 8, 8 and 6')[0].sets.map((s) => [s.weightKg, s.reps])).toEqual([[80, 8], [80, 8], [80, 6]]);
    expect(parseWorkoutText('squat 100 x 5 x 3')[0].sets.length).toBe(3);
    expect(parseWorkoutText('3 sets of 8 at 60 kg overhead press')[0].sets.length).toBe(3);
    expect(parseWorkoutText('deadlift 8, 6 reps at 140 kg')[0].sets.map((s) => [s.weightKg, s.reps])).toEqual([[140, 8], [140, 6]]);
  });
  it('duration / distance and multiple exercises', () => {
    const r = parseWorkoutText('plank 60 seconds then run 5 km in 25 minutes');
    expect(r[0].sets[0].durationSec).toBe(60);
    expect(r[1].sets[0]).toMatchObject({ distanceM: 5000, durationSec: 1500 });
    expect(r[1].query).toBe('run');
  });
});

describe('dates & units', () => {
  it('day start hour shifts late-night logging back a day', () => {
    const d = new Date(2026, 4, 12, 2, 30);
    expect(dayKey(d, 0)).toBe('2026-05-12');
    expect(dayKey(d, 4)).toBe('2026-05-11');
  });
  it('addDays across DST and month ends', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(diffDays('2026-03-30', '2026-03-28')).toBe(2);
  });
  it('week starts', () => {
    expect(startOfWeek('2026-05-13', 1)).toBe('2026-05-11'); // Wed → Mon
    expect(startOfWeek('2026-05-13', 0)).toBe('2026-05-10');
  });
  it('parseNum accepts both decimal separators', () => {
    expect(parseNum('1,5')).toBe(1.5); expect(parseNum('82.25')).toBe(82.25); expect(parseNum(' 7 ')).toBe(7);
    expect(parseNum('1.000')).toBe(1000); expect(parseNum('abc')).toBeUndefined(); expect(parseNum('')).toBeUndefined();
  });
  it('kg/lb roundtrip', () => { expect(displayToKg(kgToDisplay(61.235, 'lb'), 'lb')).toBeCloseTo(61.235, 8); });
});

describe('workout maths', () => {
  const ex = (id: string) => SEED_EXERCISES.find((e) => e.id === id);
  const sess = (id: string, end: number, w: number, reps: number): WorkoutSession => ({
    id, name: 't', date: '2026-01-01', startedAt: end - 1000, endedAt: end, pausedMs: 0, status: 'done',
    exercises: [{ id: 'x' + id, exerciseId: 'bench-press', sets: [{ id: 's' + id, type: 'working', weightKg: w, reps, done: true }, { id: 'w' + id, type: 'warmup', weightKg: 200, reps: 5, done: true }] }],
  });
  it('epley', () => { expect(epley(100, 5)).toBeCloseTo(116.667, 2); expect(epley(100, 1)).toBe(100); });
  it('records need a previous best; warm-ups never count', () => {
    const a = sess('a', 1000, 80, 8);
    expect(detectRecords(a, [a], ex as any)).toEqual([]); // first time logged = baseline
    const b = sess('b', 2000, 85, 6);
    const recs = detectRecords(b, [a, b], ex as any);
    expect(recs.map((r) => r.kind).sort()).toEqual(['e1rm', 'volume', 'weight'].filter((k) => k !== 'volume').sort());
    const w = recs.find((r) => r.kind === 'weight')!; expect(w.previous).toBe(80); expect(w.value).toBe(85);
  });
  // progression for sets taken to failure: each set against the same set last time
  const perf = (sets: [number, number][], planned?: number) => ({ id: 'e' + Math.random(), exerciseId: 'bench-press', plannedSets: planned,
    sets: sets.map(([w, r], i) => ({ id: 's' + i, type: 'working' as const, weightKg: w, reps: r, done: true })) });
  const bench = ex('bench-press')!;
  const R = { min: 6, max: 10 };
  it('progression: set 1 at the top of the range → increment on every set, reps back to the bottom', () => {
    const s = suggestProgression(bench, [perf([[80, 10], [80, 8], [77.5, 7]])], R, 2.5);
    expect(s.kind).toBe('add-weight');
    expect(s.sets).toEqual([{ weightKg: 82.5, reps: 6 }, { weightKg: 82.5, reps: 6 }, { weightKg: 80, reps: 6 }]);
  });
  it('progression: otherwise same weight per set, one more rep each, capped at the top', () => {
    const s = suggestProgression(bench, [perf([[80, 9], [80, 10], [80, 6]])], R, 2.5);
    expect(s.kind).toBe('add-reps');
    expect(s.sets).toEqual([{ weightKg: 80, reps: 10 }, { weightKg: 80, reps: 10 }, { weightKg: 80, reps: 7 }]);
    // a fourth set today uses last session's final set
    expect(fillPlan([0, 1, 2, 3].map((i) => ({ id: 'n' + i, type: 'working' as const, done: false })), s.sets).map((x) => [x.weightKg, x.reps])).toEqual([[80, 10], [80, 10], [80, 7], [80, 7]]);
  });
  it('progression: skips sessions with fewer than half the planned sets', () => {
    const cut = perf([[80, 10]], 4); // 1 of 4 done
    const full = perf([[80, 8], [80, 7], [80, 6]], 3);
    const s = suggestProgression(bench, [cut, full], R, 2.5);
    expect(s.kind).toBe('add-reps'); expect(s.sets?.[0]).toEqual({ weightKg: 80, reps: 9 });
  });
  it('progression: set 1 below the range holds the weight; no gain in 3 sessions at one weight is stalled', () => {
    expect(suggestProgression(bench, [perf([[85, 5], [85, 4]])], R, 2.5).kind).toBe('hold');
    const hist = [perf([[80, 8]]), perf([[80, 8]]), perf([[80, 7]]), perf([[80, 8]])]; // newest first
    const s = suggestProgression(bench, hist, R, 2.5);
    expect(s.kind).toBe('stalled'); expect(s.sets?.[0]).toEqual({ weightKg: 80, reps: 9 });
    expect(suggestProgression(bench, [perf([[80, 9]]), ...hist.slice(1)], R, 2.5).kind).toBe('add-reps'); // improved: not stalled
  });
  it('progression: increments are per exercise (dumbbells 2 kg), no double step for legs', () => {
    expect(incrementFor(ex('back-squat')!)).toBe(2.5);
    expect(incrementFor({ id: 'db', equipment: ['dumbbell', 'bench'] })).toBe(2);
    expect(incrementFor(bench, { 'bench-press': 1.25 })).toBe(1.25);
  });
  it('progression: filling never overwrites a set you already changed', () => {
    const sets = [{ id: 'a', type: 'working' as const, done: false, weightKg: 70 }, { id: 'b', type: 'working' as const, done: false }];
    expect(fillPlan(sets, [{ weightKg: 80, reps: 8 }]).map((x) => [x.weightKg, x.reps])).toEqual([[70, undefined], [80, 8]]);
  });
  it('elapsed excludes paused time', () => {
    const s: WorkoutSession = { id: 'p', name: '', date: '', startedAt: 0, pausedMs: 10_000, pausedAt: 40_000, status: 'active', exercises: [] };
    expect(elapsedMs(s, 60_000)).toBe(30_000);
  });
});

describe('Danish reference foods', () => {
  const top = (q: string) => searchFoods(q, REFERENCE_FOODS, () => 0, 3)[0]?.food.id;
  it('finds everyday Danish foods by their Danish names (æ/ø/å or folded)', () => {
    expect(top('rundstykke')).toBe('ref:rundstykke');
    expect(top('koldskål')).toBe('ref:koldskaal');
    expect(top('koldskaal')).toBe('ref:koldskaal');
    expect(top('frikadeller')).toBe('ref:meatballs');
    expect(top('leverpostej')).toMatch(/^ref:(liver-pate|leverpostej)/);
    expect(top('rødspætte')).toBe('ref:plaice');
    expect(top('kærnemælk')).toBe('ref:buttermilk');
    expect(top('flæskesteg')).toBe('ref:flaeskesteg');
    expect(top('havarti')).toBe('ref:havarti');
  });
  it('keeps plain staples resolving to the same food as before', () => {
    expect(top('skyr')).toMatch(/^ref:skyr/);
    expect(top('banana')).toBe('ref:banana');
    expect(top('milk')).toMatch(/^ref:milk/);
  });
});

describe('linked macro targets', () => {
  it('calories come from the macros (4/4/9)', () => {
    expect(kcalOf({ protein: 180, carbs: 250, fat: 70 })).toBe(180 * 4 + 250 * 4 + 70 * 9);
  });
  it('a new calorie target scales every macro and adds up', () => {
    const m = { protein: 180, carbs: 250, fat: 70 };
    for (const k of [1600, 2500, 3000, 3333]) {
      const s = scaleMacros(m, k);
      expect(Math.abs(kcalOf(s) - k)).toBeLessThanOrEqual(4);
      expect(s.protein / s.fat).toBeCloseTo(180 / 70, 1);
    }
    expect(scaleMacros(m, 0)).toEqual(m);
    expect(scaleMacros({ protein: 0, carbs: 0, fat: 0 }, 2000)).toEqual({ protein: 0, carbs: 0, fat: 0 });
  });
  it('scaling up and back down returns about where it started', () => {
    const m = { protein: 160, carbs: 300, fat: 80 };
    const back = scaleMacros(scaleMacros(m, kcalOf(m) * 1.4), kcalOf(m));
    expect(Math.abs(back.protein - m.protein)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.fat - m.fat)).toBeLessThanOrEqual(1);
  });
  it('suggests protein by body weight, fat 25 %, carbs the rest', () => {
    const s = suggestMacros(2600, 80);
    expect(s.protein).toBe(160);
    expect(s.fat).toBe(72);
    expect(Math.abs(kcalOf(s) - 2600)).toBeLessThanOrEqual(4);
    expect(suggestMacros(2000).protein).toBe(150);
  });
});
