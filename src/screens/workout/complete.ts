import { useStore, exerciseMap } from '../../state/store';
import { haptic, useUI } from '../../state/ui';
import { tNow } from '../../lib/i18n';
import type { SetRecord } from '../../lib/types';
import { beatLastTime, countable, lastPerformance, newBest } from '../../lib/workout';
import { patchSet, skipRest, startRest } from './actions';
import { offerRestAlerts, unlockRestAudio } from './rest';

/** What ticking a set found: a new best, beating last time (with what was gained), or neither. */
export interface SetDone { setId: string; pr: boolean; gain: string | null }

// the row of a set listens, so a set ticked by voice or the Coach plays the same moment as a tap
const listeners = new Map<string, (d: SetDone) => void>();
export function onSetDone(setId: string, fn: (d: SetDone) => void): () => void {
  listeners.set(setId, fn);
  return () => { if (listeners.get(setId) === fn) listeners.delete(setId); };
}

type Values = Partial<Pick<SetRecord, 'weightKg' | 'reps' | 'durationSec' | 'distanceM'>>;

/** The numbers a set is done with: what was said or typed, else what the row shows (its plan, else last time). */
export function setValues(seId: string, setId: string, over: Values = {}): { values: Values; valid: boolean; prev?: SetRecord } | null {
  const st = useStore.getState();
  const se = st.active?.exercises.find((e) => e.id === seId);
  const set = se?.sets.find((s) => s.id === setId);
  if (!se || !set) return null;
  const lt = exerciseMap(st.exercises).get(se.exerciseId)?.logType ?? 'weightReps';
  // last time's set at the same place (the Prev column)
  let prev: SetRecord | undefined;
  if (set.type === 'working') {
    const lw = lastPerformance(se.exerciseId, st.sessions)?.sets.filter(countable) ?? [];
    const i = se.sets.filter((s) => s.type === 'working').findIndex((s) => s.id === setId);
    prev = lw.length ? lw[Math.min(i, lw.length - 1)] : undefined;
  }
  const values: Values = {
    weightKg: over.weightKg ?? set.weightKg ?? set.target?.weightKg ?? prev?.weightKg,
    reps: over.reps ?? set.reps ?? set.target?.repMax ?? prev?.reps,
    durationSec: over.durationSec ?? set.durationSec ?? prev?.durationSec,
    distanceM: over.distanceM ?? set.distanceM ?? prev?.distanceM,
  };
  const valid = lt === 'duration' ? (values.durationSec ?? 0) > 0 : lt === 'distance' ? (values.distanceM ?? 0) > 0 || (values.durationSec ?? 0) > 0 : (values.reps ?? 0) > 0;
  return { values, valid, prev };
}

/**
 * Ticks a set: the one way it happens, whether tapped, said hands-free or logged by the Coach. Records and "beat last time"
 * are found, the haptic plays, the rest starts (not inside a superset, not after the last set) and the row plays its moment.
 * Returns null when there is nothing to tick it with (no reps yet).
 */
export function completeSet(seId: string, setId: string, over: Values = {}): SetDone | null {
  const r = setValues(seId, setId, over);
  if (!r || !r.valid) return null;
  const st = useStore.getState();
  const se = st.active!.exercises.find((e) => e.id === seId)!;
  const set = se.sets.find((s) => s.id === setId)!;
  const lt = exerciseMap(st.exercises).get(se.exerciseId)?.logType ?? 'weightReps';
  if (st.active?.pausedAt) st.resumeActive();
  unlockRestAudio(); // a tap or a word: the rest-over sound is allowed to play later
  if (st.active?.rest && st.active.rest.endsAt <= Date.now()) skipRest(); // "Go" has done its job
  // a new best beats everything before it (and is the bigger moment); otherwise beating last time gets its own small one
  const earlier = (st.active?.exercises ?? []).filter((e) => e.exerciseId === se.exerciseId).flatMap((e) => e.sets).filter((x) => x.id !== set.id);
  const pr = set.type === 'working' ? !!newBest(lt, r.values, se.exerciseId, st.sessions, earlier) : false;
  const gain = !pr && set.type === 'working' ? beatLastTime(lt, r.values, r.prev, st.settings.units.weight, st.settings.language, tNow) : null;
  haptic(pr ? 'record' : gain ? 'gain' : 'set');
  patchSet(se.id, set.id, { ...r.values, done: true, completedAt: Date.now() });
  if (set.type === 'working') {
    // supersets: rest only after the last exercise of the group has its turn
    const all = st.active?.exercises ?? [];
    const idx = all.findIndex((e) => e.id === se.id);
    const linkedNext = se.supersetGroup && all.slice(idx + 1).some((e) => e.supersetGroup === se.supersetGroup && e.sets.some((x) => !x.done));
    const lastOne = !all.some((e) => e.sets.some((x) => !x.done && x.id !== set.id));
    if (lastOne) skipRest(); // the workout is done: no rest, no alarm
    else if (!linkedNext) { startRest(se.restSec ?? st.settings.restDefaultSec, se.exerciseId); offerRestAlerts(useUI.getState().toast); }
    else skipRest();
  }
  const done: SetDone = { setId, pr, gain };
  listeners.get(setId)?.(done);
  return done;
}
