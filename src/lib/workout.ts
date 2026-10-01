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

export interface Suggestion { kind: 'add-weight' | 'add-reps' | 'hold' | 'deload' | 'first'; weightKg?: number; reasonKey: string; reasonVars: Record<string, string | number> }

/**
 * Double progression from the user's own last session.
 * Assumptions are stated in the UI: all working sets at top of range → add load; otherwise add reps.
 */
export function suggestProgression(
  ex: Exercise, last: SessionExercise | undefined, range: { min: number; max: number }, step: number,
): Suggestion {
  const work = last?.sets.filter(countable) ?? [];
  if (!last || work.length === 0) return { kind: 'first', reasonKey: 'sugg.first', reasonVars: {} };
  if (ex.logType !== 'weightReps') {
    const best = Math.max(...work.map((s) => s.reps ?? 0));
    return { kind: 'add-reps', reasonKey: 'sugg.addReps', reasonVars: { reps: best + 1 } };
  }
  const top = work[0].weightKg ?? 0;
  const allTop = work.every((s) => (s.reps ?? 0) >= range.max && (s.weightKg ?? 0) >= top);
  const anyLow = work.filter((s) => (s.reps ?? 0) < range.min).length >= Math.ceil(work.length / 2);
  const inc = ex.muscles[0] === 'quads' || ex.muscles[0] === 'hamstrings' || ex.muscles[0] === 'glutes' ? step * 2 : step;
  if (allTop) return { kind: 'add-weight', weightKg: top + inc, reasonKey: 'sugg.addWeight', reasonVars: { reps: range.max, inc } };
  if (anyLow) return { kind: 'hold', weightKg: top, reasonKey: 'sugg.hold', reasonVars: { reps: range.min } };
  return { kind: 'add-reps', weightKg: top, reasonKey: 'sugg.addRepsSame', reasonVars: { max: range.max } };
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
