import type { AppData, FoodEntry, WeightLog, WorkoutSession } from './types';
import { addDays, diffDays, startOfWeek } from './dates';
import { sessionVolume } from './workout';
import { sumNutrients } from './nutrition';

/** Time-aware exponentially weighted trend (≈7-day time constant). An ESTIMATE that smooths day-to-day noise. */
export function weightTrend(w: Pick<WeightLog, 'date' | 'kg'>[]): { date: string; kg: number }[] {
  const s = [...w].sort((a, b) => a.date.localeCompare(b.date));
  const out: { date: string; kg: number }[] = [];
  let cur = 0;
  s.forEach((p, i) => {
    if (i === 0) cur = p.kg;
    else {
      const dt = Math.max(0.5, diffDays(p.date, s[i - 1].date));
      const a = 1 - Math.exp(-dt / 7);
      cur = cur + a * (p.kg - cur);
    }
    out.push({ date: p.date, kg: cur });
  });
  return out;
}

/** kg per week from the trend line over the last `days` (needs ≥ 2 points spanning ≥ 7 days). */
export function trendRate(trend: { date: string; kg: number }[], days = 28): number | null {
  if (trend.length < 2) return null;
  const last = trend[trend.length - 1];
  const from = trend.find((p) => diffDays(last.date, p.date) <= days) ?? trend[0];
  const span = diffDays(last.date, from.date);
  if (span < 7) return null;
  return ((last.kg - from.kg) / span) * 7;
}

export interface WeekBucket { start: string; sessions: number; volume: number; sets: number }
export function weeklyTraining(sessions: WorkoutSession[], today: string, weeks: number, weekStart: 0 | 1): WeekBucket[] {
  const cur = startOfWeek(today, weekStart);
  const out: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(cur, -7 * i);
    const end = addDays(start, 6);
    const list = sessions.filter((s) => s.date >= start && s.date <= end);
    out.push({ start, sessions: list.length, volume: list.reduce((a, s) => a + sessionVolume(s.exercises), 0), sets: list.reduce((a, s) => a + s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done && x.type === 'working').length, 0), 0) });
  }
  return out;
}

/** Consecutive weeks (ending this week or last) that hit `target` sessions. */
export function weekStreak(buckets: WeekBucket[], target: number): number {
  let n = 0;
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (buckets[i].sessions >= target) n++;
    else if (i === buckets.length - 1) continue; // the current week may still be in progress
    else break;
  }
  return n;
}

export interface DayNutrition { date: string; logged: boolean; kcal: number; protein: number; carbs: number; fat: number; partial: boolean }
export function nutritionByDay(entries: FoodEntry[], from: string, to: string): DayNutrition[] {
  const byDate = new Map<string, FoodEntry[]>();
  for (const e of entries) if (e.date >= from && e.date <= to) { const l = byDate.get(e.date) ?? []; l.push(e); byDate.set(e.date, l); }
  const out: DayNutrition[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const l = byDate.get(d);
    if (!l) { out.push({ date: d, logged: false, kcal: 0, protein: 0, carbs: 0, fat: 0, partial: false }); continue; }
    const s = sumNutrients(l.map((e) => e.nutrients));
    out.push({ date: d, logged: true, kcal: s.totals.kcal ?? 0, protein: s.totals.protein ?? 0, carbs: s.totals.carbs ?? 0, fat: s.totals.fat ?? 0, partial: !!(s.unknown.kcal || s.unknown.protein) });
  }
  return out;
}

export function average(list: number[]): number | null {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

export function userHasData(d: AppData): boolean {
  return d.entries.length + d.sessions.length + d.weights.length + d.activities.length + d.routines.length > 0;
}
