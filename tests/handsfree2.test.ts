// @vitest-environment jsdom
// Hands-free sets (Beta trial): the watch's Done ✓ ticks the set the alert named, once; a tap-and-say takes only set-shaped
// phrases (talk to a friend is ignored), fixes a misheard number, and only speaks when it fixed something or missed.
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, allExercises } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { applyDone } from '../src/screens/workout/rest';
import { act, isEmptyTap } from '../src/lib/handsFree';
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
    // the same alert tapped twice (or a page that was asleep catching up): still one set
    const rest = useStore.getState().active!.rest;
    useStore.setState({ active: { ...useStore.getState().active!, rest: { ...rest!, endsAt: Date.now() - 5000 } } });
    expect(applyDone()).toBe(true); // (a new rest: the next set)
    expect(applyDone()).toBe(false);
    expect(done()).toHaveLength(3);
  });
});

describe('tap and say', () => {
  beforeEach(() => start([{ id: 'a', exerciseId: idOf('Barbell Bench Press'), sets: [set('a1', { done: true, weightKg: 80, reps: 8, completedAt: Date.now() - 300000 }), set('a2'), set('a3'), set('a4')] }]));
  it('talk to someone else is ignored, never logged', async () => {
    for (const words of ['hey man how are you', 'can I work in with you?', 'that was heavy', '']) {
      const r = await act(words);
      expect(r.ignored).toBe(true);
    }
    expect(done()).toHaveLength(1);
  });
  it('"8 at 80" and "only 6" log the set on screen, quietly', async () => {
    const r = await act('8 at 80');
    expect(r.ignored).toBe(false);
    expect(r.spoken).toBeNull();
    const r2 = await act('only 6');
    expect(r2.spoken).toBeNull();
    expect(done().slice(1).map((s) => [s.weightKg, s.reps])).toEqual([[80, 8], [80, 6]]);
  });
  it('a misheard weight is fixed, and that is the one time it speaks', async () => {
    const r = await act('8 at 18');
    expect(done()[1].weightKg).toBe(80);
    expect(r.spoken).toBe('heard 18 kg → logged 80 kg');
  });
  it('"same again" copies the last set; "undo" takes back the last one', async () => {
    await act('same again');
    expect(done()).toHaveLength(2);
    await act('undo');
    expect(done()).toHaveLength(1);
  });
});

describe('what counts as an empty tap', () => {
  it('not a button, a field or a set row', () => {
    document.body.innerHTML = '<div class="wk-views"><div class="plinth" id="card"><button id="b">x</button><div data-set="s1"><span id="in">80</span></div></div><div id="gap"></div></div>';
    expect(isEmptyTap(document.getElementById('gap'))).toBe(true);
    expect(isEmptyTap(document.getElementById('card'))).toBe(true);
    expect(isEmptyTap(document.getElementById('b'))).toBe(false);
    expect(isEmptyTap(document.getElementById('in'))).toBe(false);
  });
});
