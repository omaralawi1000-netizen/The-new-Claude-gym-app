import type { Exercise, PersonalRecord, RecordKind, SetRecord, SessionExercise, WorkoutSession, Routine } from './types';
import { uid } from './nutrition';
import { fmtNum, kgToDisplay } from './units';

export const epley = (w: number, reps: number) => (reps <= 1 ? w : w * (1 + reps / 30));
export const setVolume = (s: SetRecord) => (s.weightKg ?? 0) * (s.reps ?? 0);
export const isWorking = (s: SetRecord) => s.type === 'working';

/** A set counts toward records / volume only when completed and a working set. */
export const countable = (s: SetRecord) => s.done && isWorking(s);

export function sessionVolume(ex: SessionExercise[]): number {
  let v = 0;
  for (const e of ex) for (const s of e.sets) if (countable(s)) v += setVolume(s);
  return v;
}
export function sessionSetCount(ex: SessionExercise[], doneOnly = true): number {
  let n = 0;
  for (const e of ex) for (const s of e.sets) if (!doneOnly || s.done) n++;
  return n;
}
/** Active time = elapsed minus paused time. */
export function elapsedMs(s: WorkoutSession, now = Date.now()): number {
  const end = s.endedAt ?? now;
  const paused = s.pausedMs + (s.pausedAt && !s.endedAt ? now - s.pausedAt : 0);
  return Math.max(0, end - s.startedAt - paused);
}

export interface Best { weight: number; e1rm: number; volume: number; reps: number; duration: number; distance: number }

export function bestsFor(exerciseId: string, sessions: WorkoutSession[]): Best {
  const b: Best = { weight: 0, e1rm: 0, volume: 0, reps: 0, duration: 0, distance: 0 };
  for (const s of sessions) {
    for (const e of s.exercises) {
      if (e.exerciseId !== exerciseId) continue;
      for (const set of e.sets) {
        if (!countable(set)) continue;
        if (set.weightKg && set.reps) {
          b.weight = Math.max(b.weight, set.weightKg);
          if (set.reps <= 12) b.e1rm = Math.max(b.e1rm, epley(set.weightKg, set.reps));
          b.volume = Math.max(b.volume, setVolume(set));
        }
        if (set.reps) b.reps = Math.max(b.reps, set.reps);
        if (set.durationSec) b.duration = Math.max(b.duration, set.durationSec);
        if (set.distanceM) b.distance = Math.max(b.distance, set.distanceM);
      }
    }
  }
  return b;
}

const kindsFor = (ex: Exercise): RecordKind[] => {
  switch (ex.logType) {
    case 'weightReps': return ['weight', 'e1rm', 'volume'];
    case 'bodyweightReps': return ['reps', 'volume'];
    case 'assisted': return ['reps'];
    case 'duration': return ['duration'];
    case 'distance': return ['distance'];
  }
};

/**
 * Compare a finished session to history.
 * A record needs a previous best (> 0); the first time an exercise is logged sets a baseline, not a record.
 */
export function detectRecords(session: WorkoutSession, history: WorkoutSession[], lookup: (id: string) => Exercise | undefined): PersonalRecord[] {
  const out: PersonalRecord[] = [];
  const prior = history.filter((h) => h.id !== session.id && (h.endedAt ?? 0) <= (session.endedAt ?? Date.now()));
  for (const e of session.exercises) {
    const ex = lookup(e.exerciseId);
    if (!ex) continue;
    const prev = bestsFor(e.exerciseId, prior);
    const seen = prior.some((p) => p.exercises.some((x) => x.exerciseId === e.exerciseId && x.sets.some(countable)));
    if (!seen) continue;
    const cand: Partial<Record<RecordKind, { v: number; set: SetRecord }>> = {};
    const take = (k: RecordKind, v: number, set: SetRecord) => { if (!cand[k] || v > cand[k]!.v) cand[k] = { v, set }; };
    for (const s of e.sets) {
      if (!countable(s)) continue;
      if (s.weightKg && s.reps) {
        take('weight', s.weightKg, s);
        if (s.reps <= 12) take('e1rm', epley(s.weightKg, s.reps), s);
        take('volume', setVolume(s), s);
      }
      if (s.reps && (ex.logType === 'bodyweightReps' || ex.logType === 'assisted')) take('reps', s.reps, s);
      if (s.reps && ex.logType === 'bodyweightReps' && s.weightKg) take('volume', setVolume(s), s);
      if (s.durationSec && ex.logType === 'duration') take('duration', s.durationSec, s);
      if (s.distanceM && ex.logType === 'distance') take('distance', s.distanceM, s);
    }
    for (const k of kindsFor(ex)) {
      const c = cand[k];
      const p = prev[k === 'weight' ? 'weight' : k];
      if (c && p > 0 && c.v > p + 1e-9) {
        out.push({ exerciseId: e.exerciseId, kind: k, value: c.v, previous: p, setId: c.set.id, date: session.date });
      }
    }
  }
  return out;
}

/** The most recent finished session that contains a given exercise. */
export function lastPerformance(exerciseId: string, sessions: WorkoutSession[], beforeId?: string): SessionExercise | undefined {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (s.id === beforeId) continue;
    const e = s.exercises.find((x) => x.exerciseId === exerciseId && x.sets.some((y) => y.done));
    if (e) return e;
  }
  return undefined;
}

export interface SetPlan { weightKg?: number; reps: number }
export interface Suggestion {
  kind: 'add-weight' | 'add-reps' | 'hold' | 'stalled' | 'first';
  /** set 1's planned weight */
  weightKg?: number;
  /** one target per working set; a set beyond the list uses the last one (weight × reps exercises only) */
  sets?: SetPlan[];
  reasonKey: string;
  reasonVars: Record<string, string | number>;
}

/** How much one step of progression adds: the exercise's own setting, else 2 kg for dumbbells, else the default step. */
export function incrementFor(ex: Pick<Exercise, 'id' | 'equipment'>, overrides: Record<string, number> = {}, step = 2.5): number {
  const own = overrides[ex.id];
  if (own && own > 0) return own;
  return ex.equipment.includes('dumbbell') ? 2 : step;
}

/** Every past performance of an exercise in finished sessions, newest first. */
export function historyOf(exerciseId: string, sessions: WorkoutSession[], beforeId?: string): SessionExercise[] {
  const out: SessionExercise[] = [];
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (s.id === beforeId) continue;
    for (const e of s.exercises) if (e.exerciseId === exerciseId && e.sets.some(countable)) out.push(e);
  }
  return out;
}

/** A session counts for progression only if at least half its planned working sets were done (a cut-short day says little). */
const fullEnough = (e: SessionExercise) => {
  const done = e.sets.filter(countable).length;
  return done * 2 >= (e.plannedSets ?? done);
};
const same = (a?: number, b?: number) => Math.abs((a ?? 0) - (b ?? 0)) < 1e-6;

/**
 * Progression for sets taken to (near) failure, where later sets naturally have fewer reps. Each working set is compared
 * with the same set last session (extra sets today use last session's final set):
 * - set 1 reached the top of the rep range last time → every set gets the exercise's increment, reps back to the bottom;
 * - otherwise → same weight per set, last time's reps + 1 (never above the top of the range).
 * Sessions where fewer than half the planned sets were done are skipped. If set 1 hasn't improved in 3 sessions at the same
 * weight, the reason says it has stalled (the targets still ask for one more rep). Other log types: beat your best reps.
 */
export function suggestProgression(
  ex: Exercise, history: SessionExercise[], range: { min: number; max: number }, increment: number,
): Suggestion {
  const past = history.filter(fullEnough);
  const work = past[0]?.sets.filter(countable) ?? [];
  if (work.length === 0) return { kind: 'first', reasonKey: 'First time — pick a weight you can do {min}–{max} reps with', reasonVars: { min: range.min, max: range.max } };
  if (ex.logType !== 'weightReps') {
    const best = Math.max(...work.map((x) => x.reps ?? 0));
    return { kind: 'add-reps', reasonKey: 'sugg.addReps', reasonVars: { reps: best + 1 } };
  }
  const first = work[0];
  const r1 = first.reps ?? 0;
  if (r1 >= range.max) {
    const sets = work.map((x) => ({ weightKg: x.weightKg !== undefined ? Math.round((x.weightKg + increment) * 1000) / 1000 : undefined, reps: range.min }));
    return { kind: 'add-weight', weightKg: sets[0].weightKg, sets, reasonKey: '+{inc} on every set — set 1 hit {max} reps last time', reasonVars: { inc: increment, max: range.max } };
  }
  const sets = work.map((x) => ({ weightKg: x.weightKg, reps: Math.min(range.max, Math.max(1, (x.reps ?? range.min - 1) + 1)) }));
  // stalled: the last three sessions at this weight never beat set 1 of the session before them
  const run: number[] = [];
  for (const e of past) {
    const s1 = e.sets.find(countable);
    if (!s1 || !same(s1.weightKg, first.weightKg)) break;
    run.push(s1.reps ?? 0);
  }
  if (run.length >= 4 && Math.max(run[0], run[1], run[2]) <= run[3]) {
    return { kind: 'stalled', weightKg: first.weightKg, sets, reasonKey: 'Stalled — set 1 hasn’t improved in 3 sessions at {w}', reasonVars: { w: first.weightKg ?? 0 } };
  }
  if (r1 < range.min) return { kind: 'hold', weightKg: first.weightKg, sets, reasonKey: 'Hold the weight — build set 1 back up to {min} reps', reasonVars: { min: range.min } };
  return { kind: 'add-reps', weightKg: first.weightKg, sets, reasonKey: 'Same weight — one more rep per set', reasonVars: {} };
}

/**
 * Puts a plan into the still-open working sets as real values (tapping done logs them unchanged). Only sets you haven't
 * touched are filled: a set with a weight or reps already in it is left alone.
 */
export function fillPlan(sets: SetRecord[], plan: SetPlan[] | undefined): SetRecord[] {
  if (!plan || plan.length === 0) return sets;
  let i = -1; // working-set number (done ones count, so set 3 always gets set 3's target)
  return sets.map((x) => {
    if (x.type !== 'working') return x;
    i++;
    if (x.done || x.weightKg !== undefined || x.reps !== undefined) return x;
    const p = plan[Math.min(i, plan.length - 1)];
    return { ...x, weightKg: p.weightKg, reps: p.reps, target: { ...x.target, weightKg: p.weightKg } };
  });
}

/** The rep range an exercise's sets are aiming for (from its routine, else 8–12). */
export function repRange(sets: SetRecord[]): { min: number; max: number } {
  const w = sets.find((x) => x.type === 'working');
  return { min: w?.target?.repMin ?? 8, max: w?.target?.repMax ?? 12 };
}

/** A new workout's sets for one exercise, with this session's progression filled in (weight × reps exercises only). */
export function planSets(ex: Exercise | undefined, sets: SetRecord[], sessions: WorkoutSession[], increments: Record<string, number>, step: number): SetRecord[] {
  if (!ex || ex.logType !== 'weightReps') return sets;
  const sug = suggestProgression(ex, historyOf(ex.id, sessions), repRange(sets), incrementFor(ex, increments, step));
  return fillPlan(sets, sug.sets);
}

/** Build the sets for a session exercise from a routine item. */
export function setsFromItem(item: Routine['items'][number], lastSets?: SetRecord[]): SetRecord[] {
  const sets: SetRecord[] = [];
  for (let i = 0; i < item.warmupSets; i++) sets.push({ id: uid('s'), type: 'warmup', done: false });
  const lw = lastSets?.filter(countable) ?? [];
  for (let i = 0; i < item.workingSets; i++) {
    sets.push({ id: uid('s'), type: 'working', done: false, target: { repMin: item.repMin, repMax: item.repMax, weightKg: lw[Math.min(i, lw.length - 1)]?.weightKg } });
  }
  return sets;
}

/** Did this set beat the same set last session? Returns what was gained ("+2.5 kg", "+1 rep", "+10 s"), or null. */
export function beatLastTime(lt: string, now: { weightKg?: number; reps?: number; durationSec?: number; distanceM?: number }, prev: SetRecord | undefined, unit: 'kg' | 'lb', lang: 'en' | 'da', t: (k: string) => string): string | null {
  if (!prev) return null;
  if (lt === 'duration') return (now.durationSec ?? 0) > (prev.durationSec ?? Infinity) ? `+${(now.durationSec ?? 0) - (prev.durationSec ?? 0)} s` : null;
  if (lt === 'distance') return (now.distanceM ?? 0) > (prev.distanceM ?? Infinity) ? `+${Math.round((now.distanceM ?? 0) - (prev.distanceM ?? 0))} m` : null;
  const w = now.weightKg ?? 0, r = now.reps ?? 0, pw = prev.weightKg ?? 0, pr = prev.reps ?? 0;
  if (!r || !pr) return null;
  if (lt === 'assisted') return w < pw && r >= pr ? `−${fmtNum(kgToDisplay(pw - w, unit), lang, 1)} ${unit}` : w <= pw && r > pr ? `+${r - pr} ${t(r - pr === 1 ? 'rep' : 'reps')}` : null;
  if (w > pw + 1e-6 && r >= pr) return `+${fmtNum(kgToDisplay(w - pw, unit), lang, 1)} ${unit}`;
  if (Math.abs(w - pw) < 1e-6 && r > pr) return `+${r - pr} ${t(r - pr === 1 ? 'rep' : 'reps')}`;
  return null;
}
