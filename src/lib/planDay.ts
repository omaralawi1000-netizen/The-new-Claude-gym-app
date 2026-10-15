/**
 * "Chest and triceps with some shoulder tomorrow": a day's workout built from the exercises this user actually does for
 * those muscles, each with the sets and reps they usually use and today's progression target. Pure (data in, plan out);
 * the Coach shows it as a preview and only an Apply puts it in the plan (agent.ts → plan_day).
 */
import type { AppData, Exercise, MuscleGroup, RoutineItem } from './types';
import { addDays, weekdayOf } from './dates';
import { historyOf, incrementFor, suggestProgression } from './workout';

export interface PlanPick { ex: Exercise; sets: number; repMin: number; repMax: number; restSec: number; target?: string; flagged?: string }
export interface DayPlan { picks: PlanPick[]; warnings: string[] }

const COMPOUND = new Set(['push', 'pull', 'squat', 'hinge', 'lunge']);
const LEGS: MuscleGroup[] = ['quads', 'hamstrings', 'glutes'];

/** How this user has been doing an exercise: the newest routine item for it, else a sensible default for its kind. */
function shapeFor(ex: Exercise, d: Pick<AppData, 'routines'>): Pick<PlanPick, 'sets' | 'repMin' | 'repMax' | 'restSec'> {
  const item = [...d.routines].sort((a, b) => b.updatedAt - a.updatedAt).flatMap((r) => r.items).find((i: RoutineItem) => i.exerciseId === ex.id);
  if (item) return { sets: item.workingSets, repMin: item.repMin, repMax: item.repMax, restSec: item.restSec };
  if (ex.logType === 'duration' || ex.logType === 'distance') return { sets: 1, repMin: 1, repMax: 1, restSec: 60 };
  return COMPOUND.has(ex.movement) ? { sets: 3, repMin: 6, repMax: 10, restSec: 150 } : { sets: 3, repMin: 10, repMax: 15, restSec: 90 };
}

/** What to aim for next time, in words ("62.5 kg × 10"), from their own history. */
function targetFor(ex: Exercise, d: Pick<AppData, 'sessions' | 'increments' | 'settings'>, range: { min: number; max: number }): string | undefined {
  if (ex.logType !== 'weightReps') return undefined;
  const hist = historyOf(ex.id, d.sessions.filter((s) => s.status === 'done'));
  if (!hist.length) return undefined;
  const sug = suggestProgression(ex, hist, range, incrementFor(ex, d.increments, d.settings.plateStep));
  const s1 = sug.sets?.[0];
  return s1?.weightKg !== undefined ? `${Math.round(s1.weightKg * 100) / 100} kg × ${s1.reps}` : undefined;
}

/**
 * Pick exercises for muscles: per muscle, the ones they do most (then most recently), primary muscle first. The first muscle
 * named gets three exercises, the others two; a muscle asked for as "some" (light) gets one. Exercises they told the Coach
 * hurt are left out. When they have no history for a muscle, the catalog's compound movements come first.
 */
export function pickForMuscles(focus: { muscle: MuscleGroup; light?: boolean }[], d: AppData, pool: Exercise[]): Exercise[] {
  const usage = new Map<string, { n: number; last: string }>();
  for (const s of d.sessions) if (s.status === 'done') for (const e of s.exercises) if (e.sets.some((x) => x.done)) {
    const u = usage.get(e.exerciseId) ?? { n: 0, last: '' };
    u.n++; if (s.date > u.last) u.last = s.date;
    usage.set(e.exerciseId, u);
  }
  const hurt = new Set(d.memory.filter((m) => m.kind === 'health').flatMap((m) => m.exerciseIds ?? []));
  const out: Exercise[] = [];
  focus.forEach((f, i) => {
    const n = f.light ? 1 : i === 0 ? 3 : 2;
    const cands = pool.filter((e) => !e.archived && e.muscles[0] === f.muscle && !hurt.has(e.id) && !out.includes(e))
      .sort((a, b) => (usage.get(b.id)?.n ?? 0) - (usage.get(a.id)?.n ?? 0)
        || (usage.get(b.id)?.last ?? '').localeCompare(usage.get(a.id)?.last ?? '')
        || Number(COMPOUND.has(b.movement)) - Number(COMPOUND.has(a.movement)));
    out.push(...cands.slice(0, n));
  });
  return out.slice(0, 8);
}

/** The full plan for a date: shapes, targets, and anything worth a warning (a hard leg day before wrestling, a hurt lift). */
export function buildDayPlan(exercises: (Exercise & { sets?: number | null; repMin?: number | null; repMax?: number | null; restSec?: number | null })[], date: string, d: AppData): DayPlan {
  const hurtNotes = d.memory.filter((m) => m.kind === 'health' && m.exerciseIds?.length);
  const picks: PlanPick[] = exercises.map((ex) => {
    const base = shapeFor(ex, d);
    const repMin = ex.repMin ?? base.repMin, repMax = Math.max(repMin, ex.repMax ?? base.repMax);
    const flagged = hurtNotes.find((m) => m.exerciseIds!.includes(ex.id))?.text;
    return { ex, sets: ex.sets ?? base.sets, repMin, repMax, restSec: ex.restSec ?? base.restSec, target: targetFor(ex, d, { min: repMin, max: repMax }), flagged };
  });
  const warnings: string[] = [];
  const next = addDays(date, 1);
  const wrestleNext = (d.schedule.activities?.[weekdayOf(next)] ?? []).includes('wrestling');
  const legSets = picks.filter((p) => LEGS.includes(p.ex.muscles[0])).reduce((n, p) => n + p.sets, 0);
  if (wrestleNext && legSets >= 6) warnings.push('wrestling-next-day');
  return { picks, warnings };
}
