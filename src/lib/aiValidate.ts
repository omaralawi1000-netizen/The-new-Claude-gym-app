/** Strict validation of model output. Anything off → null / the item is dropped. The model never gets to write data directly. */
import type { ParsedFoodRow } from './foodText';
import type { ParsedWorkoutRow } from './workoutText';

export const MAX_ITEMS = 20;
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const int = (v: unknown, lo: number, hi: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : null);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const COUNT_WORD: Record<string, string | undefined> = { slice: 'slice', handful: 'handful', glass: 'glass', can: 'can', cup: 'cup', scoop: 'scoop', bowl: 'bowl', serving: undefined, piece: undefined };
const VOLUME: Record<string, number> = { ml: 1, cl: 10, dl: 100, l: 1000, tsp: 5, tbsp: 15 };

export function validateFoodItems(raw: any): ParsedFoodRow[] | null {
  if (!raw || !Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > MAX_ITEMS) return null;
  const rows: ParsedFoodRow[] = [];
  raw.items.forEach((it: any, i: number) => {
    const name = str(it?.name, 80);
    if (name.length < 2) return;
    const brand = str(it?.brand, 40);
    const unit = typeof it?.unit === 'string' ? it.unit : '';
    let amount = it?.amount == null ? null : num(it.amount, 0.01, 20000);
    if (it?.amount != null && amount === null) return; // a nonsense amount drops the item rather than guessing
    let dim: ParsedFoodRow['dim'] = 'count';
    let countWord: string | undefined;
    if (amount === null) amount = 1; // no quantity said → "one of it" (reviewed by the user, flagged as estimated if the portion is typical)
    else if (unit === 'g') dim = 'g';
    else if (unit === 'kg') { dim = 'g'; amount *= 1000; }
    else if (unit in VOLUME) { dim = 'ml'; amount *= VOLUME[unit]; }
    else if (unit === 'cup') { countWord = 'cup'; }
    else if (unit in COUNT_WORD) countWord = COUNT_WORD[unit];
    const query = [brand, name].filter(Boolean).join(' ');
    rows.push({ id: `a${i}`, raw: `${amount ?? ''} ${unit} ${query}`.replace(/\s+/g, ' ').trim(), amount, dim, countWord, query });
  });
  return rows.length ? rows : null;
}

export function validateWorkoutItems(raw: any): ParsedWorkoutRow[] | null {
  if (!raw || !Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > 12) return null;
  const rows: ParsedWorkoutRow[] = [];
  raw.items.forEach((it: any, i: number) => {
    const query = str(it?.exercise, 80);
    if (query.length < 2 || !Array.isArray(it?.sets) || it.sets.length > 12) return;
    const sets = [];
    for (const s of it.sets) {
      const weightKg = s?.kg == null ? undefined : num(s.kg, 0, 700);
      const reps = s?.reps == null ? undefined : int(s.reps, 1, 300);
      const durationSec = s?.durationSec == null ? undefined : int(s.durationSec, 1, 12 * 3600);
      const distanceKm = s?.distanceKm == null ? undefined : num(s.distanceKm, 0.01, 400);
      if ((s?.kg != null && weightKg == null) || (s?.reps != null && reps == null) || (s?.durationSec != null && durationSec == null) || (s?.distanceKm != null && distanceKm == null)) return; // one bad number → drop the whole exercise
      if (weightKg === undefined && reps === undefined && durationSec === undefined && distanceKm === undefined) continue;
      sets.push({ weightKg: weightKg ?? undefined, reps: reps ?? undefined, durationSec: durationSec ?? undefined, distanceM: distanceKm != null ? distanceKm * 1000 : undefined });
    }
    if (sets.length === 0) return;
    rows.push({ id: `aw${i}`, raw: query, query, sets });
  });
  return rows.length ? rows : null;
}

export interface FoodEstimate { name: string; grams?: number; kcal: number; protein: number; carbs: number; fat: number; assumptions: string }
export function validateEstimate(raw: any): FoodEstimate | null {
  if (!raw) return null;
  const name = str(raw.name, 80);
  const kcal = num(raw.kcal, 0, 4000), protein = num(raw.protein, 0, 300), carbs = num(raw.carbs, 0, 600), fat = num(raw.fat, 0, 300);
  if (!name || kcal == null || protein == null || carbs == null || fat == null) return null;
  const grams = raw.grams == null ? undefined : num(raw.grams, 1, 5000) ?? undefined;
  // reject answers whose energy and macros disagree wildly (a sign the model hallucinated one of them)
  const est = protein * 4 + carbs * 4 + fat * 9;
  if (kcal > 30 && Math.abs(est - kcal) / Math.max(est, kcal) > 0.45) return null;
  return { name, grams, kcal, protein, carbs, fat, assumptions: str(raw.assumptions, 200) };
}

export interface RoutineDraft { name: string; note?: string; items: { exercise: string; sets: number; repMin: number; repMax: number; restSec: number }[] }
export function validateRoutine(raw: any): RoutineDraft | null {
  const name = str(raw?.name, 60);
  if (!name || !Array.isArray(raw?.items) || raw.items.length < 2 || raw.items.length > 12) return null;
  const items: RoutineDraft['items'] = [];
  for (const it of raw.items) {
    const exercise = str(it?.exercise, 80);
    const sets = int(it?.sets, 1, 10), repMin = int(it?.repMin, 1, 100), repMax = int(it?.repMax, 1, 100);
    if (!exercise || sets == null || repMin == null || repMax == null || repMin > repMax) continue;
    items.push({ exercise, sets, repMin, repMax, restSec: int(it?.restSec, 15, 600) ?? 90 });
  }
  return items.length >= 2 ? { name, note: str(raw.note, 200) || undefined, items } : null;
}
