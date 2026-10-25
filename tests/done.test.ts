// @vitest-environment jsdom
// Done ✓ on the rest-over alert (phone, lock screen, watch): it ticks the set the alert named, as planned, once per rest.
// A page asleep behind the lock screen hears of the tap later: the set and the next rest still count from the tap.
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, allExercises } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { applyDone, lastDone } from '../src/screens/workout/rest';
import type { SetRecord, WorkoutSession } from '../src/lib/types';

const today = new Date().toISOString().slice(0, 10);
const idOf = (name: string) => allExercises(useStore.getState().exercises).find((e) => e.name === name)!.id;
const set = (id: string, x: Partial<SetRecord> = {}): SetRecord => ({ id, type: 'working', done: false, target: { weightKg: 80, repMin: 6, repMax: 8 }, ...x });
const start = (exercises: WorkoutSession['exercises'], rest?: WorkoutSession['rest']) => useStore.setState({ active: { id: 'w1', name: 'Push', date: today, startedAt: Date.now() - 600000, pausedMs: 0, status: 'active', exercises, rest } });
const done = () => useStore.getState().active!.exercises.flatMap((e) => e.sets.filter((s) => s.done));

beforeEach(() => {
  localStorage.clear();
  const d = defaultData(); d.settings.onboarded = true;
  useStore.getState().replaceAll(d);
});

describe('Done ✓ from the watch', () => {
  it('ticks the set that’s next, as planned, once per rest', () => {
    const bench = idOf('Barbell Bench Press');
    start([{ id: 'a', exerciseId: bench, sets: [set('a1', { done: true, weightKg: 80, reps: 8, completedAt: Date.now() - 120000 }), set('a2'), set('a3')] }],
      { endsAt: Date.now() - 5000, total: 120, exerciseId: bench });
    expect(applyDone()).toBe(true);
    expect(done().map((s) => [s.id, s.weightKg, s.reps])).toEqual([['a1', 80, 8], ['a2', 80, 8]]);
    // the same alert tapped twice (or the message and the cache's copy of one tap): still one set
    const rest = useStore.getState().active!.rest;
    useStore.setState({ active: { ...useStore.getState().active!, rest: { ...rest!, endsAt: Date.now() - 5000 } } });
    expect(applyDone()).toBe(true); // (a new rest: the next set)
    expect(applyDone()).toBe(false);
    expect(done()).toHaveLength(3);
  });

  it('heard late (the page was asleep): the set is done at the tap, and the next rest started then', () => {
    const bench = idOf('Barbell Bench Press');
    start([{ id: 'a', exerciseId: bench, restSec: 120, sets: [set('a1', { done: true, weightKg: 80, reps: 8, completedAt: Date.now() - 300000 }), set('a2'), set('a3')] }],
      { endsAt: Date.now() - 200000, total: 120, exerciseId: bench });
    const at = Date.now() - 90000; // tapped a minute and a half ago
    expect(applyDone(at)).toBe(true);
    const a = useStore.getState().active!;
    expect(a.exercises[0].sets[1].completedAt).toBe(at);
    expect(Math.abs(a.rest!.endsAt - (at + 120000))).toBeLessThan(1500); // 30 s of the next rest left, not 2 minutes
  });

  it('nothing to tick (no rest running): nothing happens', () => {
    start([{ id: 'a', exerciseId: idOf('Barbell Bench Press'), sets: [set('a1')] }]);
    expect(applyDone()).toBe(false);
    expect(done()).toHaveLength(0);
  });

  it('Settings can say where the last Done ✓ stopped (25 Oct: it stopped again on the phone)', async () => {
    start([{ id: 'a', exerciseId: idOf('Barbell Bench Press'), sets: [set('a1')] }]);
    applyDone(Date.now(), 'cache');
    expect((await lastDone()).page).toMatchObject({ via: 'cache', why: 'no rest running' });
    start([{ id: 'a', exerciseId: idOf('Barbell Bench Press'), sets: [set('a1', { done: true }), set('a2')] }], { endsAt: Date.now() - 5000, total: 90, exerciseId: idOf('Barbell Bench Press') });
    expect(applyDone()).toBe(true);
    expect((await lastDone()).page).toMatchObject({ via: 'message', why: '' });
  });
});
