/**
 * The coach around a workout, all worked out on the phone (instant, free, no AI). Omar trains to failure whatever the day,
 * so it never tells him to do less; it only says what he can't see in the rows:
 *  - for a lift: the heaviest weight ever on it, when today's plan reaches it ("82.5 kg × 8 is your heaviest yet"), a stalled lift with one concrete change ("stuck at
 *    60 × 8 · try 57.5 × 12", which one tap puts in the sets), and the note he left on it last time;
 *  - for the workout: wrestling tomorrow on a heavy leg day, and a health note that isn't about one lift (the Today card at
 *    the top of the List, the first page in Focus); a lift's own line sits on its card in both views, so nothing is said twice;
 *  - after: what moved on the main lifts and next time's target for them, under the finish screen's headline.
 * Nothing is said when nothing applies.
 */
import type { AppData, Exercise, MuscleGroup, SessionExercise, WorkoutSession } from './types';
import { addDays, weekdayOf } from './dates';
import { countable, historyOf, incrementFor, lastPerformance, newBest, repRange, suggestProgression } from './workout';

export interface Move { kg?: number; reps?: number }
/** What is worth saying about one lift today (each part only when it applies). */
export interface LiftHint {
  /** set 1 as planned is the heaviest ever on this lift */
  record?: { kg?: number; reps: number; planned: boolean };
  /** stuck at `from` for a few sessions: `to` is the change to try today */
  stall?: { from: { kg: number; reps: number }; to: { kg: number; reps: number }; sessions: number };
  /** the note left on this lift last time */
  lastNote?: string;
}
export type BriefLine =
  | { kind: 'record' | 'stall' | 'lastNote'; exerciseId: string; hint: LiftHint }
  | { kind: 'wrestle' }
  | { kind: 'health'; text: string };

const LEGS: MuscleGroup[] = ['quads', 'hamstrings', 'glutes'];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** How set 1 changed against last time: heavier (kg), or the same weight for more reps. */
function moved(now: { weightKg?: number; reps?: number } | undefined, before: { weightKg?: number; reps?: number } | undefined): Move | null {
  if (!now || !before) return null;
  const dk = r2((now.weightKg ?? 0) - (before.weightKg ?? 0));
  if (dk > 0) return { kg: dk };
  if (dk === 0 && (now.reps ?? 0) > (before.reps ?? 0)) return { reps: (now.reps ?? 0) - (before.reps ?? 0) };
  return null;
}

/** The hint for one lift of the running workout, from finished workouts only (today's sets don't move it). */
export function liftHint(d: Pick<AppData, 'sessions' | 'increments' | 'settings'>, se: SessionExercise, ex: Exercise | undefined): LiftHint {
  const out: LiftHint = {};
  const done = d.sessions.filter((s) => s.status === 'done');
  const last = lastPerformance(se.exerciseId, done);
  const note = last?.note?.trim();
  if (note && note !== se.note?.trim()) out.lastNote = note;
  if (!ex || ex.logType !== 'weightReps') return out;
  const hist = historyOf(se.exerciseId, done);
  if (!hist.length) return out;
  const range = repRange(se.sets);
  const inc = incrementFor(ex, d.increments, d.settings.plateStep);
  const sug = suggestProgression(ex, hist, range, inc);
  // stalled: drop about 5 % (to the plate step) and aim for the top of the range — a fresh start the next sessions build on
  if (sug.kind === 'stalled' && sug.weightKg) {
    const s1 = hist[0].sets.find(countable);
    const kg = Math.max(inc, Math.round((sug.weightKg * 0.95) / inc) * inc);
    const to = { kg: kg < sug.weightKg ? kg : sug.weightKg - inc, reps: range.max };
    if (to.kg > 0) out.stall = { from: { kg: sug.weightKg, reps: s1?.reps ?? 0 }, to, sessions: 3 };
  }
  // a record that is a moment: set 1's planned weight is the heaviest ever on this lift. (A rep best at a weight done before
  // is what the progression aims at almost every session, so saying it on every card would be noise.)
  const w1 = se.sets.find((x) => x.type === 'working');
  const kg = w1?.weightKg ?? w1?.target?.weightKg, reps = w1?.reps ?? w1?.target?.repMax;
  if (!out.stall && kg && reps && newBest('weightReps', { weightKg: kg, reps }, se.exerciseId, done)?.kind === 'weight') out.record = { kg, reps, planned: true };
  return out;
}

/** Puts a stalled lift's change into its open working sets that you haven't typed into. Returns Undo. */
export function applyStallChange(a: WorkoutSession, seId: string, to: { kg: number; reps: number }): { next: WorkoutSession; undo: (x: WorkoutSession) => WorkoutSession } {
  const before = a.exercises.find((e) => e.id === seId);
  const next = { ...a, exercises: a.exercises.map((e) => (e.id !== seId ? e : { ...e, sets: e.sets.map((x) => (x.type !== 'working' || x.done ? x : { ...x, weightKg: to.kg, reps: to.reps, target: { ...x.target, weightKg: to.kg } })) })) };
  return { next, undo: (x) => ({ ...x, exercises: x.exercises.map((e) => (e.id !== seId || !before ? e : { ...e, sets: e.sets.map((q) => (q.done ? q : before.sets.find((b) => b.id === q.id) ?? q)) })) }) };
}

/** Lines about the whole workout: wrestling tomorrow on a heavy leg day, a health note that isn't about one lift. */
export function workoutLines(d: Pick<AppData, 'schedule' | 'memory'>, a: WorkoutSession, today: string, exMap: Map<string, Exercise>): BriefLine[] {
  const out: BriefLine[] = [];
  const note = d.memory.find((m) => m.kind === 'health' && !m.exerciseIds?.length && !(m.until && m.until < today));
  if (note) out.push({ kind: 'health', text: note.text });
  const legSets = a.exercises.reduce((n, se) => n + (LEGS.includes(exMap.get(se.exerciseId)?.muscles[0] as MuscleGroup) ? se.sets.filter((x) => x.type === 'working').length : 0), 0);
  if (legSets >= 6 && (d.schedule.activities?.[weekdayOf(addDays(today, 1))] ?? []).includes('wrestling')) out.push({ kind: 'wrestle' });
  return out;
}

export interface NextTime { exerciseId: string; up: Move | null; kg?: number; reps: number }

/** After a workout: its main lifts (most volume first, at most two), what moved on set 1, and next time's target. */
export function nextTime(ses: WorkoutSession, sessions: WorkoutSession[], d: Pick<AppData, 'increments' | 'settings'>, exMap: Map<string, Exercise>): NextTime[] {
  const vol = (e: SessionExercise) => e.sets.filter(countable).reduce((n, x) => n + (x.weightKg ?? 0) * (x.reps ?? 0), 0);
  const done = sessions.filter((s) => s.status === 'done');
  const out: NextTime[] = [];
  for (const e of [...ses.exercises].sort((x, y) => vol(y) - vol(x))) {
    const ex = exMap.get(e.exerciseId);
    if (!ex || ex.logType !== 'weightReps' || !vol(e) || out.some((o) => o.exerciseId === e.exerciseId)) continue;
    // history up to and including this workout (it is the newest)
    const hist = historyOf(e.exerciseId, done.filter((s) => s.id === ses.id || (s.endedAt ?? 0) <= (ses.endedAt ?? Date.now())));
    if (!hist.length) continue;
    const sug = suggestProgression(ex, hist, repRange(e.sets), incrementFor(ex, d.increments, d.settings.plateStep));
    const s1 = sug.sets?.[0];
    if (!s1) continue;
    const before = lastPerformance(e.exerciseId, done.filter((s) => (s.endedAt ?? 0) < (ses.endedAt ?? Date.now())), ses.id)?.sets.find(countable);
    out.push({ exerciseId: e.exerciseId, up: moved(e.sets.find(countable), before), kg: s1.weightKg, reps: s1.reps });
    if (out.length === 2) break;
  }
  return out;
}
