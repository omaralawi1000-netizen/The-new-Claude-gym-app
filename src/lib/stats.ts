import type { AppData, FoodEntry, MuscleGroup, WeightLog, WorkoutSession } from './types';
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

// ── per muscle ──────────────────────────────────────────────
export const MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'calves', 'core'];
/**
 * Hard sets per muscle between two days (inclusive): every finished working set counts 1 for the exercise's main muscle (the
 * first one listed) and ½ for each of the others. Warm-ups don't count. What a coach means by "weekly sets".
 */
export function setsPerMuscle(sessions: WorkoutSession[], musclesOf: (exerciseId: string) => MuscleGroup[] | undefined, from: string, to: string): Record<MuscleGroup, number> {
  const out = Object.fromEntries([...MUSCLES, 'cardio'].map((m) => [m, 0])) as Record<MuscleGroup, number>;
  for (const s of sessions) {
    if (s.status !== 'done' || s.date < from || s.date > to) continue;
    for (const e of s.exercises) {
      const ms = musclesOf(e.exerciseId); if (!ms?.length) continue;
      const n = e.sets.filter((x) => x.done && x.type === 'working').length; if (!n) continue;
      ms.forEach((m, i) => { out[m] += i === 0 ? n : n / 2; });
    }
  }
  return out;
}

/** The weekdays someone usually wrestles (0 = Sunday): days that held at least a quarter of the sessions, from 2 sessions up. */
export function usualDays(dates: string[]): number[] {
  if (dates.length < 2) return [];
  const count = new Map<number, number>();
  for (const d of dates) { const wd = new Date(`${d}T12:00:00`).getDay(); count.set(wd, (count.get(wd) ?? 0) + 1); }
  return [...count].filter(([, n]) => n >= 2 && n / dates.length >= 0.25).map(([wd]) => wd).sort((a, b) => a - b);
}

// ── lifts that stopped improving ────────────────────────────
export interface Stall { exerciseId: string; best: { kg: number; reps: number }; since: string; sessions: number }
const e1rm = (kg: number, reps: number) => kg * (1 + reps / 30);
/**
 * Lifts that have stopped improving: trained in at least 4 sessions over the last 8 weeks, and the last 3 of them — spread
 * over at least 10 days — never beat the best estimated max from before them. Most-trained first, at most 3.
 */
export function stalledLifts(sessions: WorkoutSession[], today: string): Stall[] {
  const from = addDays(today, -55);
  const by = new Map<string, { date: string; e: number; kg: number; reps: number }[]>();
  for (const s of [...sessions].filter((x) => x.status === 'done' && x.date >= from && x.date <= today).sort((a, b) => a.date.localeCompare(b.date))) {
    for (const ex of s.exercises) {
      let top: { e: number; kg: number; reps: number } | null = null;
      for (const q of ex.sets) if (q.done && q.type === 'working' && q.weightKg && q.reps) { const e = e1rm(q.weightKg, q.reps); if (!top || e > top.e) top = { e, kg: q.weightKg, reps: q.reps }; }
      if (top) (by.get(ex.exerciseId) ?? by.set(ex.exerciseId, []).get(ex.exerciseId)!).push({ date: s.date, ...top });
    }
  }
  const out: Stall[] = [];
  for (const [id, list] of by) {
    if (list.length < 4) continue;
    const last3 = list.slice(-3), before = list.slice(0, -3);
    const best = before.reduce((a, b) => (b.e > a.e ? b : a));
    if (Math.max(...last3.map((x) => x.e)) <= best.e + 1e-9 && diffDays(last3[2].date, last3[0].date) >= 10) out.push({ exerciseId: id, best: { kg: best.kg, reps: best.reps }, since: best.date, sessions: list.length });
  }
  return out.sort((a, b) => b.sessions - a.sessions).slice(0, 3);
}

// ── the week in review ──────────────────────────────────────
export interface WeekReview { from: string; to: string; sessions: number; prevSessions: number; wrestling: number; proteinAvg: number | null; kcalAvg: number | null; loggedDays: number; records: number; weightRate: number | null; stalls: Stall[] }
/**
 * Which week to look back on today: shown on the last day of the week (from midday) and on the first day of the next one.
 * Returns the week's last day, or null on other days.
 */
export function reviewWeekEnd(today: string, hour: number, weekStart: 0 | 1): string | null {
  const wd = new Date(`${today}T12:00:00`).getDay();
  const lastDay = (weekStart + 6) % 7;
  if (wd === lastDay && hour >= 12) return today;
  if (wd === weekStart) return addDays(today, -1);
  return null;
}
export function weekReview(d: AppData, to: string): WeekReview {
  const from = addDays(to, -6);
  const done = d.sessions.filter((s) => s.status === 'done');
  const inRange = (x: { date: string }, a: string, b: string) => x.date >= a && x.date <= b;
  const days = nutritionByDay(d.entries, from, to).filter((x) => x.logged);
  const ws = [...d.weights].filter((w) => w.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  return {
    from, to,
    sessions: done.filter((s) => inRange(s, from, to)).length,
    prevSessions: done.filter((s) => inRange(s, addDays(from, -7), addDays(from, -1))).length,
    wrestling: d.activities.filter((a) => a.kind === 'wrestling' && inRange(a, from, to)).length,
    proteinAvg: average(days.map((x) => x.protein)), kcalAvg: average(days.map((x) => x.kcal)), loggedDays: days.length,
    records: done.filter((s) => inRange(s, from, to)).reduce((n, s) => n + (s.records?.length ?? 0), 0),
    weightRate: ws.length >= 4 ? trendRate(weightTrend(ws)) : null,
    stalls: stalledLifts(d.sessions, to),
  };
}
