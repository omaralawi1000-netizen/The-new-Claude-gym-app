/**
 * The coach around a workout, all worked out on the phone (instant, free, no AI):
 *  - before: a short briefing at the top of a planned workout — today's key targets (the same numbers the rows hold, from
 *    `suggestProgression`), anything worth knowing today (tired, fresh, wrestling tomorrow, a health note) and one focus;
 *  - after: what moved on the main lifts and next time's target for them, under the finish screen's headline.
 */
import type { AppData, Exercise, MuscleGroup, SessionExercise, SetRecord, WorkoutSession } from './types';
import { addDays, weekdayOf } from './dates';
import { countable, historyOf, incrementFor, lastPerformance, repRange, suggestProgression, type Suggestion } from './workout';
import { readiness, type Readiness } from './readiness';

export interface Move { kg?: number; reps?: number }
export interface BriefTarget { exerciseId: string; kg?: number; reps: number; kind: Suggestion['kind']; up: Move | null }
export interface BriefFlag { kind: 'tired' | 'fresh' | 'wrestle' | 'note'; key: string; vars?: Record<string, string | number>; reasons?: Readiness['reasons'] }
export interface Briefing { targets: BriefTarget[]; flags: BriefFlag[]; /** one line; `{exercise}` in it is the lift named by exerciseId */
  focus: { key: string; exerciseId?: string } | null; level: Readiness['level'] }

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

export function briefing(d: AppData, a: WorkoutSession, today: string, exMap: Map<string, Exercise>): Briefing {
  const done = d.sessions.filter((s) => s.status === 'done');
  const targets: BriefTarget[] = [];
  for (const se of a.exercises) {
    const ex = exMap.get(se.exerciseId);
    if (!ex || ex.logType !== 'weightReps') continue;
    const hist = historyOf(se.exerciseId, done);
    if (!hist.length) continue;
    const sug = suggestProgression(ex, hist, repRange(se.sets), incrementFor(ex, d.increments, d.settings.plateStep));
    const s1 = sug.sets?.[0];
    if (!s1) continue;
    targets.push({ exerciseId: se.exerciseId, kg: s1.weightKg, reps: s1.reps, kind: sug.kind, up: moved(s1, hist[0].sets.find(countable)) });
    if (targets.length === 3) break;
  }
  const r = readiness(d, today);
  const flags: BriefFlag[] = [];
  if (r.level === 'tired') flags.push({ kind: 'tired', key: 'You look tired today', reasons: r.reasons });
  else if (r.level === 'fresh') flags.push({ kind: 'fresh', key: 'Fresh today', reasons: r.reasons });
  const legSets = a.exercises.reduce((n, se) => n + (LEGS.includes(exMap.get(se.exerciseId)?.muscles[0] as MuscleGroup) ? se.sets.filter((x) => x.type === 'working').length : 0), 0);
  if (legSets >= 6 && (d.schedule.activities?.[weekdayOf(addDays(today, 1))] ?? []).includes('wrestling')) flags.push({ kind: 'wrestle', key: 'Wrestling tomorrow: keep the legs a little lighter' });
  // a health note that isn't about one lift (those show beside the lift itself) and hasn't ended
  const note = d.memory.find((m) => m.kind === 'health' && !m.exerciseIds?.length && !(m.until && m.until < today));
  if (note) flags.push({ kind: 'note', key: note.text });

  const stalled = targets.find((x) => x.kind === 'stalled');
  const heavier = targets.find((x) => x.kind === 'add-weight');
  const focus = r.level === 'tired' ? { key: 'Focus: clean sets, leave a rep or two in the tank' }
    : stalled ? { key: 'Focus: one more rep on set 1 of {exercise}', exerciseId: stalled.exerciseId }
    : heavier ? { key: 'Focus: the new weight on {exercise}', exerciseId: heavier.exerciseId }
    : r.level === 'fresh' ? { key: 'Focus: push the top sets' }
    : null;
  return { targets, flags, focus, level: r.level };
}

/** "One set less per lift": the last open working set of each exercise that has three or more. Returns the new workout
 *  and what was taken off (so Undo can put each set back where it was). */
export interface Trimmed { seId: string; index: number; set: SetRecord }
export function trimOneSet(a: WorkoutSession): { next: WorkoutSession; removed: Trimmed[] } {
  const removed: Trimmed[] = [];
  const exercises: SessionExercise[] = a.exercises.map((se) => {
    const work = se.sets.filter((x) => x.type === 'working');
    const open = work.filter((x) => !x.done);
    if (work.length < 3 || !open.length) return se;
    const drop = open[open.length - 1];
    removed.push({ seId: se.id, index: se.sets.indexOf(drop), set: drop });
    return { ...se, sets: se.sets.filter((x) => x !== drop) };
  });
  return { next: { ...a, exercises }, removed };
}
/** Puts trimmed sets back (into exercises that are still there). */
export function untrim(a: WorkoutSession, removed: Trimmed[]): WorkoutSession {
  return { ...a, exercises: a.exercises.map((se) => {
    const back = removed.filter((r) => r.seId === se.id);
    if (!back.length) return se;
    const sets = [...se.sets];
    for (const r of back) sets.splice(Math.min(r.index, sets.length), 0, r.set);
    return { ...se, sets };
  }) };
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
