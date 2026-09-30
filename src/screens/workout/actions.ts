import { useStore, exerciseMap } from '../../state/store';
import { uid } from '../../lib/nutrition';
import type { SessionExercise, SetRecord, WorkoutSession, Routine, Exercise } from '../../lib/types';
import { lastPerformance, countable } from '../../lib/workout';

/** Active-workout mutations. All persist immediately (the store flushes the active session synchronously). */

export function newSetsFor(ex: Exercise | undefined, prevSets?: SetRecord[]): SetRecord[] {
  const lw = prevSets?.filter(countable) ?? [];
  const n = lw.length ? Math.min(lw.length, 4) : 3;
  return Array.from({ length: n }, (_, i) => ({ id: uid('s'), type: 'working' as const, done: false, target: { weightKg: lw[Math.min(i, lw.length - 1)]?.weightKg, repMin: ex?.logType === 'duration' ? undefined : 8, repMax: ex?.logType === 'duration' ? undefined : 12 } }));
}

export function addExercises(ids: string[], at?: number) {
  const st = useStore.getState();
  if (!st.active) return;
  const map = exerciseMap(st.exercises);
  st.mutateActive((a) => {
    const add: SessionExercise[] = ids.map((id) => {
      const ex = map.get(id);
      const last = lastPerformance(id, st.sessions);
      let sets = newSetsFor(ex, last?.sets);
      if (ex && (ex.logType === 'duration' || ex.logType === 'distance')) sets = sets.slice(0, 1);
      return { id: uid('se'), exerciseId: id, sets };
    });
    const list = [...a.exercises];
    list.splice(at ?? list.length, 0, ...add);
    return { ...a, exercises: list };
  });
}

export function replaceExercise(seId: string, exerciseId: string) {
  const st = useStore.getState();
  const map = exerciseMap(st.exercises);
  const ex = map.get(exerciseId);
  st.mutateActive((a) => ({
    ...a,
    exercises: a.exercises.map((e) => {
      if (e.id !== seId) return e;
      const last = lastPerformance(exerciseId, st.sessions);
      // keep completed sets (they were really done); swap the still-open ones to the new movement
      const done = e.sets.filter((s) => s.done);
      const open = e.sets.filter((s) => !s.done).map((s) => ({ ...s, target: { ...s.target, weightKg: last?.sets.find(countable)?.weightKg } }));
      return { ...e, exerciseId, sets: [...done.map((s) => s), ...open].length ? [...done, ...open] : newSetsFor(ex, last?.sets) };
    }),
  }));
}

export function removeExercise(seId: string): { restore: () => void } {
  const st = useStore.getState();
  const a = st.active!;
  const idx = a.exercises.findIndex((e) => e.id === seId);
  const item = a.exercises[idx];
  st.mutateActive((x) => ({ ...x, exercises: x.exercises.filter((e) => e.id !== seId) }));
  return { restore: () => useStore.getState().mutateActive((x) => { const l = [...x.exercises]; l.splice(Math.min(idx, l.length), 0, item); return { ...x, exercises: l }; }) };
}

export function moveExercise(seId: string, dir: -1 | 1) {
  useStore.getState().mutateActive((a) => {
    const l = [...a.exercises];
    const i = l.findIndex((e) => e.id === seId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= l.length) return a;
    [l[i], l[j]] = [l[j], l[i]];
    return { ...a, exercises: l };
  });
}

export function patchExercise(seId: string, patch: Partial<SessionExercise>) {
  useStore.getState().mutateActive((a) => ({ ...a, exercises: a.exercises.map((e) => (e.id === seId ? { ...e, ...patch } : e)) }));
}

export function patchSet(seId: string, setId: string, patch: Partial<SetRecord>) {
  useStore.getState().mutateActive((a) => ({ ...a, exercises: a.exercises.map((e) => (e.id === seId ? { ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) } : e)) }));
}

export function addSet(seId: string, type: 'warmup' | 'working' = 'working') {
  useStore.getState().mutateActive((a) => ({
    ...a,
    exercises: a.exercises.map((e) => {
      if (e.id !== seId) return e;
      const lastWorking = [...e.sets].reverse().find((s) => s.type === 'working');
      const s: SetRecord = { id: uid('s'), type, done: false, target: { ...lastWorking?.target } };
      if (type === 'warmup') {
        const firstWork = e.sets.findIndex((x) => x.type === 'working');
        const l = [...e.sets]; l.splice(firstWork < 0 ? 0 : firstWork, 0, s);
        return { ...e, sets: l };
      }
      return { ...e, sets: [...e.sets, s] };
    }),
  }));
}

export function deleteSet(seId: string, setId: string): { restore: () => void } {
  const a = useStore.getState().active!;
  const e = a.exercises.find((x) => x.id === seId)!;
  const idx = e.sets.findIndex((s) => s.id === setId);
  const item = e.sets[idx];
  useStore.getState().mutateActive((x) => ({ ...x, exercises: x.exercises.map((y) => (y.id === seId ? { ...y, sets: y.sets.filter((s) => s.id !== setId) } : y)) }));
  return { restore: () => useStore.getState().mutateActive((x) => ({ ...x, exercises: x.exercises.map((y) => { if (y.id !== seId) return y; const l = [...y.sets]; l.splice(Math.min(idx, l.length), 0, item); return { ...y, sets: l }; }) })) };
}

/** Toggle superset with the next exercise. */
export function toggleSuperset(seId: string) {
  useStore.getState().mutateActive((a) => {
    const l = a.exercises.map((e) => ({ ...e }));
    const i = l.findIndex((e) => e.id === seId);
    if (i < 0 || i >= l.length - 1) return a;
    const cur = l[i], nxt = l[i + 1];
    if (cur.supersetGroup && cur.supersetGroup === nxt.supersetGroup) {
      // unlink: next and everything after it in the group leaves
      const g = cur.supersetGroup;
      let j = i + 1;
      while (j < l.length && l[j].supersetGroup === g) { l[j].supersetGroup = undefined; j++; }
      if (!l.some((e, k) => k !== i && e.supersetGroup === g)) cur.supersetGroup = undefined;
    } else {
      const g = cur.supersetGroup ?? uid('ss');
      cur.supersetGroup = g; nxt.supersetGroup = g;
    }
    return { ...a, exercises: l };
  });
}

export function startRest(sec: number, exerciseId: string) {
  useStore.getState().mutateActive((a) => ({ ...a, rest: { endsAt: Date.now() + sec * 1000, total: sec, exerciseId } }));
}
export function adjustRest(deltaSec: number) {
  useStore.getState().mutateActive((a) => (a.rest ? { ...a, rest: { ...a.rest, endsAt: a.rest.endsAt + deltaSec * 1000, total: Math.max(5, a.rest.total + deltaSec) } } : a));
}
export function skipRest() {
  useStore.getState().mutateActive((a) => ({ ...a, rest: null }));
}

export function sessionFromRoutineName(r: Routine) { return r.name; }
export type { WorkoutSession };
