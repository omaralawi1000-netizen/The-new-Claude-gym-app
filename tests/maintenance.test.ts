// @vitest-environment jsdom
// True maintenance that one bad number can't break (review round 1, 19 Oct: a single typo of a weigh-in gave 6,910 kcal
// "high"): typos and the mornings after a big day are left out, the trend is a median of slopes, nonsense is clamped and
// marked low, and "invisible calories" only when the gap is big.
import { describe, it, expect } from 'vitest';
import { trueMaintenance } from '../src/lib/maintenance';
import { addDays } from '../src/lib/dates';
import type { FoodEntry, HealthDay } from '../src/lib/types';

const today = '2026-10-19';
let n = 0;
const food = (date: string, kcal: number): FoodEntry => ({ id: `e${n++}`, date, mealId: 'lunch', at: new Date(`${date}T13:00:00`).getTime(), snap: { name: 'x', basis: 'g', per100: { kcal } } as any, qty: { amount: 100, unit: 'g' } as any, base: 100, nutrients: { kcal, protein: 20 } });
/** 28 days eating `kcal`, weighing every other day on a steady trend (kg a week). */
const month = (kcal: number, kgPerWeek: number, o: { start?: number; every?: number } = {}) => {
  const entries: FoodEntry[] = [], weights: { id: string; date: string; kg: number; at: number }[] = [];
  for (let i = 28; i >= 1; i--) {
    const date = addDays(today, -i);
    entries.push(food(date, kcal));
    if (i % (o.every ?? 2) === 0) weights.push({ id: `w${i}`, date, kg: Math.round(((o.start ?? 80) + (kgPerWeek / 7) * (28 - i)) * 10) / 10, at: 0 });
  }
  return { entries, weights, health: [] as HealthDay[] };
};
// eating 2,500 and losing 0.5 kg a week → maintenance ≈ 2,500 + 550 = 3,050
const TRUE = 3050;

describe('one bad number', () => {
  it('a typo of a weigh-in (58.5 for 80.5) in Aven: still about right', () => {
    const d = month(2500, -0.5);
    d.weights[6] = { ...d.weights[6], kg: 58.5 };
    const m = trueMaintenance(d, today)!;
    expect(Math.abs(m.kcal - TRUE)).toBeLessThanOrEqual(100);
  });
  it('the same typo from the watch\'s scale: still about right', () => {
    const d = month(2500, -0.5);
    d.health = [{ date: addDays(today, -9), weightKg: 58.5 }];
    const m = trueMaintenance(d, today)!;
    expect(Math.abs(m.kcal - TRUE)).toBeLessThanOrEqual(100);
  });
  it('the mornings after a big day (water) are left out while enough weigh-ins remain', () => {
    const d = month(2500, -0.5, { every: 1 });
    const big = addDays(today, -10);
    d.entries.push(food(big, 2500)); // a 5,000 kcal day
    // the scale jumps 1.5 kg for two mornings
    d.weights = d.weights.map((w) => (w.date === addDays(big, 1) || w.date === addDays(big, 2) ? { ...w, kg: w.kg + 1.5 } : w));
    const m = trueMaintenance(d, today)!;
    // (the big day is real intake, so the average rises by ~90; the trend must not be bent by the spike)
    expect(m.kgPerWeek).toBeCloseTo(-0.5, 1);
  });
  it('an impossible trend is clamped and marked low confidence', () => {
    const d = month(2500, -4);
    const m = trueMaintenance(d, today)!;
    expect(m.kgPerWeek).toBe(-1.5);
    expect(m.confidence).toBe('low');
    expect(m.kcal).toBeLessThanOrEqual(6000);
  });
});

describe('invisible calories', () => {
  const burn = (kcal: number) => Array.from({ length: 20 }, (_, i) => ({ date: addDays(today, -i - 1), totalKcal: kcal }));
  it('a gap of 400: not "invisible" (the watch is rough)', () => {
    const d = month(2500, 0);
    d.health = burn(2900);
    expect(trueMaintenance(d, today)!.invisible).toBeUndefined();
  });
  it('a gap of 900 on 2,500: said', () => {
    const d = month(2500, 0, { every: 1 });
    d.health = burn(3400);
    expect(trueMaintenance(d, today)!.invisible).toBe(900);
  });
});

describe('Omar-like', () => {
  it('two big evenings a week and the watch\'s scale every day: still a number, and a sane one', () => {
    const entries: FoodEntry[] = [], health: HealthDay[] = [];
    for (let i = 28; i >= 1; i--) {
      const date = addDays(today, -i);
      const wd = new Date(`${date}T12:00:00`).getDay();
      const bigDay = wd === 2 || wd === 4; // wrestling days
      entries.push(food(date, bigDay ? 3600 : 2200));
      const after = [3, 4, 5].includes(wd) ? 0.8 : 0; // heavier the mornings after
      health.push({ date, weightKg: Math.round((84 - (0.4 / 7) * (28 - i) + after) * 10) / 10, totalKcal: 3000 });
    }
    const m = trueMaintenance({ entries, weights: [], health }, today)!;
    expect(m).not.toBeNull();
    expect(m.kcal).toBeGreaterThan(2400);
    expect(m.kcal).toBeLessThan(3400);
  });
});
