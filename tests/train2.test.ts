// @vitest-environment jsdom
// Coach 2.0, phase 5b, part B: training logging you can trust. Sets told after the gym or for another day become a finished
// workout, "8 reps" goes to the set on screen (supersets and warm-ups too), a misheard number is fixed and said, a repeat is
// logged once, "same again" copies, and Undo takes back just that set.
import { describe, it, expect, beforeEach } from 'vitest';
import { runActions, validateAgent, type AgentCtx } from '../src/lib/agent';
import { useStore, allExercises } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { makeT } from '../src/lib/i18n';
import { matchExercises } from '../src/lib/workoutText';
import { currentSetOf } from '../src/lib/currentSet';
import { fixMisheard } from '../src/lib/setCommand';
import { finishAsOfLastSet, lastTouched } from '../src/screens/workout/stale';
import type { SetRecord, WorkoutSession } from '../src/lib/types';

const today = new Date().toISOString().slice(0, 10);
const ctx = (): AgentCtx => ({ t: makeT('en') as any, lang: 'en', today, brain: null });
const pool = () => allExercises(useStore.getState().exercises);
const idOf = (name: string) => pool().find((e) => e.name === name)!.id;
const set = (id: string, x: Partial<SetRecord> = {}): SetRecord => ({ id, type: 'working', done: false, target: { weightKg: 80, repMin: 6, repMax: 8 }, ...x });
const start = (exercises: WorkoutSession['exercises']) => useStore.setState({ active: { id: 'w1', name: 'Push', date: today, startedAt: Date.now() - 600000, pausedMs: 0, status: 'active', exercises } });
const active = () => useStore.getState().active!;
const done = (seId: string) => active().exercises.find((e) => e.id === seId)!.sets.filter((s) => s.done);

beforeEach(() => {
  localStorage.clear();
  const d = defaultData(); d.settings.onboarded = true;
  useStore.getState().replaceAll(d);
});

describe('sets told with no workout running', () => {
  it('yesterday’s sets become a finished workout on that day (and never a live one)', async () => {
    const [r] = await runActions([{ type: 'log_sets', exercises: [{ exercise: 'bench', sets: [{ kg: 80, reps: 8 }, { kg: 80, reps: 6 }] }], day: 'yesterday' }], ctx());
    expect(useStore.getState().active).toBeNull();
    const s = useStore.getState().sessions.at(-1)!;
    expect(s.status).toBe('done');
    expect(s.date).not.toBe(today);
    expect(s.exercises[0].sets.map((x) => [x.weightKg, x.reps])).toEqual([[80, 8], [80, 6]]);
    expect(r.title).toMatch(/Logged 2 sets · Yesterday/);
    r.undo!();
    expect(useStore.getState().sessions).toHaveLength(0);
  });
  it('after the gym: today’s sets go into one logged workout, the next ones join it', async () => {
    await runActions([{ type: 'log_sets', exercises: [{ exercise: 'bench', sets: [{ kg: 80, reps: 8 }] }] }], ctx());
    const [r2] = await runActions([{ type: 'log_sets', exercises: [{ exercise: 'squat', sets: [{ kg: 100, reps: 5 }] }] }], ctx());
    expect(useStore.getState().active).toBeNull();
    const ss = useStore.getState().sessions;
    expect(ss).toHaveLength(1);
    expect(ss[0].logged).toBe(true);
    expect(ss[0].exercises.map((e) => e.exerciseId)).toEqual([idOf('Barbell Bench Press'), idOf('Back Squat')]);
    r2.undo!();
    expect(useStore.getState().sessions[0].exercises).toHaveLength(1);
  });
});

describe('the set you are on', () => {
  it('superset: after A’s set, B’s turn; Focus page wins; warm-ups are passed over unless said', async () => {
    const A = idOf('Barbell Bench Press'), B = idOf('Barbell Row');
    start([
      { id: 'a', exerciseId: A, supersetGroup: 'g', sets: [set('a0', { type: 'warmup', target: { weightKg: 40, repMin: 10, repMax: 10 } }), set('a1'), set('a2')] },
      { id: 'b', exerciseId: B, supersetGroup: 'g', sets: [set('b1'), set('b2')] },
    ]);
    expect(currentSetOf(active(), 'skip')!.set.id).toBe('a1'); // (the warm-up is passed over)
    await runActions([{ type: 'log_current_set', kg: null, reps: 8, which: 'current' }], ctx());
    expect(done('a').map((s) => s.id)).toEqual(['a1']);
    expect(currentSetOf(active(), 'skip')!.set.id).toBe('b1'); // B's turn
    await runActions([{ type: 'log_current_set', kg: 60, reps: 10, which: 'current' }], ctx());
    expect(done('b')[0].weightKg).toBe(60);
    // "warm-up 40 for 10" logs the warm-up
    await runActions([{ type: 'log_current_set', kg: 40, reps: 10, which: 'current', warmup: true }], ctx());
    expect(done('a').map((s) => s.id).sort()).toEqual(['a0', 'a1']);
  });
  it('a misheard weight is fixed (heard 18 → logged 80) and can be put back', async () => {
    start([{ id: 'a', exerciseId: idOf('Barbell Bench Press'), sets: [set('a1'), set('a2')] }]);
    const [r] = await runActions([{ type: 'log_current_set', kg: 18, reps: 8, which: 'current' }], ctx());
    expect(done('a')[0].weightKg).toBe(80);
    expect(r.lines.some((l) => l.text === 'heard 18 kg → logged 80 kg' && l.warn)).toBe(true);
    r.more![0].run();
    expect(done('a')[0].weightKg).toBe(18);
    expect(r.lines[1].text).toBe('logged as heard: 18 kg');
    expect(r.more![0].label).toBe('Use 80 kg'); // and back again
    r.more![0].run();
    expect(done('a')[0].weightKg).toBe(80);
  });
  it('the same set said twice in a row is logged once ("Already logged", Log again)', async () => {
    start([{ id: 'a', exerciseId: idOf('Barbell Bench Press'), sets: [set('a1'), set('a2'), set('a3')] }]);
    await runActions([{ type: 'log_current_set', kg: 80, reps: 8, which: 'current' }], ctx());
    const [r] = await runActions([{ type: 'log_current_set', kg: 80, reps: 8, which: 'current' }], ctx());
    expect(r.title).toBe('Already logged');
    expect(done('a')).toHaveLength(1);
    r.button!.run();
    expect(done('a')).toHaveLength(2);
  });
  it('"same again" copies the last set; past the last planned set one more is added', async () => {
    start([{ id: 'a', exerciseId: idOf('Barbell Bench Press'), sets: [set('a1')] }]);
    await runActions([{ type: 'log_current_set', kg: 82.5, reps: 7, which: 'current' }], ctx());
    const [r] = await runActions([{ type: 'log_current_set', which: 'current', same: true }], ctx());
    expect(r.kind).toBe('sets');
    expect(done('a').map((s) => [s.weightKg, s.reps])).toEqual([[82.5, 7], [82.5, 7]]);
  });
  it('Undo takes back only that set', async () => {
    start([{ id: 'a', exerciseId: idOf('Barbell Bench Press'), sets: [set('a1'), set('a2'), set('a3')] }]);
    const [r1] = await runActions([{ type: 'log_current_set', kg: 80, reps: 8, which: 'current' }], ctx());
    await runActions([{ type: 'log_current_set', kg: 80, reps: 7, which: 'current' }], ctx());
    r1.undo!();
    expect(done('a').map((s) => [s.id, s.reps])).toEqual([['a2', 7]]);
  });
});

describe('numbers speech gets wrong', () => {
  it('fixes only the real slips, near what you do', () => {
    expect(fixMisheard({ kg: 18 }, { kg: 80 })).toEqual({ kg: 80, reps: undefined, heard: { kg: 18 } });
    expect(fixMisheard({ kg: 8 }, { kg: 80 }).kg).toBe(80);
    expect(fixMisheard({ kg: 800 }, { kg: 80 }).kg).toBe(80);
    expect(fixMisheard({ kg: 60 }, { kg: 80 })).toEqual({ kg: 60, reps: undefined }); // a real lighter day stays
    expect(fixMisheard({ kg: 82.5 }, { kg: 80 }).heard).toBeUndefined();
    expect(fixMisheard({ reps: 80 }, { reps: 8 }).reps).toBe(8);
    expect(fixMisheard({ kg: 18 }, {})).toEqual({ kg: 18, reps: undefined }); // nothing to go by
  });
});

describe('names and kinds', () => {
  it('gym words find the lift people mean', () => {
    const top = (q: string) => matchExercises(q, pool(), 'en')[0]?.ex.name;
    expect(top('bench')).toBe('Barbell Bench Press');
    expect(top('bænkpres')).toBe('Barbell Bench Press');
    expect(top('RDL')).toBe('Romanian Deadlift');
    expect(top('pull-ups')).toBe('Pull-up');
    expect(top('chinups')).toBe('Chin-up');
    expect(top('squats')).toBe('Back Squat');
    expect(top('dødløft')).toBe('Deadlift');
  });
  it('wrestling in rounds without minutes; intensity kept', () => {
    const v = validateAgent({ reply: '', actions: [{ type: 'log_activity', kind: 'wrestling', rounds: 5, intensity: 3 }] })!;
    expect(v.actions[0]).toMatchObject({ type: 'log_activity', minutes: 15, rounds: 5, intensity: 3 });
  });
});

describe('a workout left running', () => {
  it('finishes as of its last set, not hours later', () => {
    const at = Date.now() - 8 * 3600000;
    useStore.setState({ active: { id: 'w9', name: 'Pull', date: today, startedAt: at, pausedMs: 0, status: 'active', exercises: [{ id: 'a', exerciseId: idOf('Barbell Row'), sets: [set('a1', { done: true, weightKg: 60, reps: 8, completedAt: at + 1200000 })] }] } });
    expect(lastTouched(active())).toBe(at + 1200000);
    finishAsOfLastSet();
    const s = useStore.getState().sessions.at(-1)!;
    expect(s.endedAt).toBe(at + 1200000 + 60000);
    expect(useStore.getState().active).toBeNull();
  });
});
