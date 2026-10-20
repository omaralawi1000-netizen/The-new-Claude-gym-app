// @vitest-environment jsdom
// Fixes from the v0.1.160 workout audit: the plan, records and set counting stay right after edits.
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, missedWorkouts, rotationAfter, rotationWithout } from '../src/state/store';
import { addDays, dayKey, weekdayOf } from '../src/lib/dates';
import { defaultData } from '../src/state/defaults';
import type { Routine, WorkoutSession } from '../src/lib/types';
import { workoutName } from '../src/lib/workout';
import { makeT, loadDanish } from '../src/lib/i18n';

const routine = (id: string, name = id): Routine => ({ id, name, items: [], createdAt: 0, updatedAt: 0 } as unknown as Routine);

beforeEach(() => {
  localStorage.clear();
  const d = defaultData(); d.settings.onboarded = true;
  useStore.getState().replaceAll(d);
});

describe('deleting a routine and Undo', () => {
  it('puts it back on its weekdays, one-off days and rotation place', () => {
    const st = useStore.getState();
    st.patch({ routines: [routine('A'), routine('B'), routine('C')] });
    st.setSchedule({ weekly: { 0: null, 1: 'A', 2: 'B', 3: null, 4: 'A', 5: null, 6: null }, overrides: [{ date: '2026-10-22', routineId: 'A' }], rotation: { order: ['B', 'A', 'C'], pointer: 1, perWeek: 3 } });
    const removed = useStore.getState().deleteRoutine('A')!;
    let sch = useStore.getState().schedule;
    expect(sch.weekly[1]).toBeNull();
    expect(sch.overrides).toEqual([]);
    expect(sch.rotation.order).toEqual(['B', 'C']);
    useStore.getState().restoreRoutine(removed.routine, removed.slots);
    sch = useStore.getState().schedule;
    expect(useStore.getState().routines.map((r) => r.id)).toContain('A');
    expect(sch.weekly[1]).toBe('A');
    expect(sch.weekly[4]).toBe('A');
    expect(sch.weekly[2]).toBe('B');
    expect(sch.overrides).toEqual([{ date: '2026-10-22', routineId: 'A' }]);
    expect(sch.rotation).toMatchObject({ order: ['B', 'A', 'C'], pointer: 1 });
  });
  it('does not take a weekday back that was given to another routine meanwhile', () => {
    const st = useStore.getState();
    st.patch({ routines: [routine('A'), routine('B')] });
    st.setSchedule({ weekly: { 0: null, 1: 'A', 2: null, 3: null, 4: null, 5: null, 6: null } });
    const removed = useStore.getState().deleteRoutine('A')!;
    useStore.getState().setSchedule({ weekly: { ...useStore.getState().schedule.weekly, 1: 'B' } });
    useStore.getState().restoreRoutine(removed.routine, removed.slots);
    expect(useStore.getState().schedule.weekly[1]).toBe('B');
  });
});

describe('an unnamed workout', () => {
  it('is saved without an English name and shown in the app language', async () => {
    await loadDanish();
    const at = Date.now() - 3600000;
    useStore.setState({ active: { id: 'w1', name: '', date: '2026-10-20', startedAt: at, pausedMs: 0, status: 'active', exercises: [{ id: 'e', exerciseId: 'bench-press', sets: [{ id: 's', type: 'working', done: true, weightKg: 60, reps: 8, completedAt: at + 1000 }] }] } as WorkoutSession });
    const done = useStore.getState().finishActive()!;
    expect(done.name).toBe('');
    const da = makeT('da') as unknown as (k: string) => string;
    expect(workoutName(done.name, da)).toBe('Træning');
    expect(workoutName('Workout', da)).toBe('Træning'); // saved by older versions
    expect(workoutName('Push day', da)).toBe('Push day');
  });
});

describe('editing sets after a workout', () => {
  const ses = (id: string, endedAt: number, kg: number): WorkoutSession => ({ id, name: 'Push', date: '2026-10-01', startedAt: endedAt - 3600000, endedAt, pausedMs: 0, status: 'done',
    exercises: [{ id: `${id}e`, exerciseId: 'bench-press', sets: [{ id: `${id}s`, type: 'working', done: true, weightKg: kg, reps: 5, completedAt: endedAt - 1000 }] }] });
  it('finds its records again, and those of later workouts', () => {
    const a = ses('a', 1_000_000, 60), b = ses('b', 2_000_000, 70), c = ses('c', 3_000_000, 75);
    useStore.getState().patch({ sessions: [a, b, c] });
    // as they were found when finished
    useStore.getState().mutateSession('b', (x) => x); // nothing changed: nothing recomputed
    expect(useStore.getState().sessions.find((x) => x.id === 'b')!.records).toBeUndefined();
    // b's 70 typed in wrong: it was 80. Now b is a record over 60, and c (75) no longer beats the best before it
    useStore.getState().mutateSession('b', (x) => ({ ...x, exercises: x.exercises.map((e) => ({ ...e, sets: e.sets.map((q) => ({ ...q, weightKg: 80 })) })) }));
    const st = useStore.getState().sessions;
    expect(st.find((x) => x.id === 'b')!.records!.some((r) => r.kind === 'weight' && r.value === 80 && r.previous === 60)).toBe(true);
    expect(st.find((x) => x.id === 'c')!.records!.some((r) => r.kind === 'weight')).toBe(false);
    // deleting the set takes its record away
    useStore.getState().mutateSession('b', (x) => ({ ...x, exercises: [] }));
    expect(useStore.getState().sessions.find((x) => x.id === 'b')!.records).toEqual([]);
    expect(useStore.getState().sessions.find((x) => x.id === 'c')!.records!.some((r) => r.kind === 'weight' && r.previous === 60)).toBe(true);
  });
});

describe('changing the weekly plan mid-week', () => {
  it('does not turn the days before the change into missed workouts', () => {
    const today = dayKey(Date.now(), useStore.getState().settings.dayStartHour);
    const wdAgo = (n: number) => weekdayOf(addDays(today, -n));
    useStore.getState().patch({ routines: [routine('A'), routine('B')] });
    // an old plan: A three days ago (missed honestly)
    useStore.setState({ schedule: { ...useStore.getState().schedule, mode: 'weekly', weekly: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, [wdAgo(3)]: 'A' } } });
    expect(missedWorkouts(useStore.getState(), today).map((m) => m.routineId)).toEqual(['A']);
    // today B is put on two days ago: that day was not planned then, so it is not missed; A's day did not change
    useStore.getState().setSchedule({ weekly: { ...useStore.getState().schedule.weekly, [wdAgo(2)]: 'B' } });
    expect(missedWorkouts(useStore.getState(), today).map((m) => m.routineId)).toEqual(['A']);
    // saved data from before (no weeklySince) still works as before
    const sch = { ...useStore.getState().schedule }; delete sch.weeklySince;
    useStore.setState({ schedule: sch });
    expect(missedWorkouts(useStore.getState(), today).map((m) => m.routineId).sort()).toEqual(['A', 'B']);
  });
});

describe('rotation', () => {
  const rot = (order: string[], pointer: number) => ({ order, pointer, perWeek: 3 });
  it('next is whatever follows the routine you just did', () => {
    expect(rotationAfter(rot(['A', 'B', 'C'], 0), 'B').pointer).toBe(2);
    expect(rotationAfter(rot(['A', 'B', 'C'], 0), 'C').pointer).toBe(0);
    expect(rotationAfter(rot(['A', 'B', 'A', 'C'], 2), 'A').pointer).toBe(3); // twice in it: the place from "next" on
    expect(rotationAfter(rot(['A', 'B'], 1), 'X').pointer).toBe(1); // not in it: unchanged
  });
  it('finishing a routine that was not marked next still moves the rotation on', () => {
    useStore.getState().patch({ routines: [routine('A'), routine('B'), routine('C')] });
    useStore.getState().setSchedule({ mode: 'rotation', rotation: rot(['A', 'B', 'C'], 0) });
    const at = Date.now() - 600000;
    useStore.setState({ active: { id: 'w', name: 'B', routineId: 'B', date: '2026-10-20', startedAt: at, pausedMs: 0, status: 'active', exercises: [{ id: 'e', exerciseId: 'bench-press', sets: [{ id: 's', type: 'working', done: true, weightKg: 60, reps: 8, completedAt: at + 1000 }] }] } as WorkoutSession });
    useStore.getState().finishActive();
    expect(useStore.getState().schedule.rotation.pointer).toBe(2);
  });
  it('removing a routine keeps the same next routine', () => {
    expect(rotationWithout(rot(['A', 'B', 'C'], 2), (_, i) => i === 0)).toMatchObject({ order: ['B', 'C'], pointer: 1 }); // C still next
    expect(rotationWithout(rot(['A', 'B', 'C'], 0), (_, i) => i === 2)).toMatchObject({ order: ['A', 'B'], pointer: 0 });
    expect(rotationWithout(rot(['A', 'B', 'C'], 1), (_, i) => i === 1)).toMatchObject({ order: ['A', 'C'], pointer: 1 }); // the next one removed: the one after it
    expect(rotationWithout(rot(['A', 'B', 'C'], 2), (_, i) => i === 2)).toMatchObject({ order: ['A', 'B'], pointer: 0 });
    expect(rotationWithout(rot(['A'], 0), () => true)).toMatchObject({ order: [], pointer: 0 });
  });
});
