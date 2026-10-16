// @vitest-environment jsdom
// Coach 2.0, phase 5, part 1: the coach around a workout. Each lift says only what its rows don't (a record within reach, a
// stalled lift's change, last time's note); the Today card only what is about the whole workout; next time's targets; one
// way to tick a set (tap, voice and the Coach); the app counts its AI trouble. It never tells him to do less.
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, allExercises } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { applyStallChange, liftHint, nextTime, workoutLines } from '../src/lib/coachWorkout';
import { buildDayPlan } from '../src/lib/planDay';
import { completeSet, onSetDone } from '../src/screens/workout/complete';
import { runActions, validateAgent, type AgentCtx } from '../src/lib/agent';
import { noteTrouble, troubleReport, troubleThisWeek } from '../src/lib/trouble';
import { exerciseMap } from '../src/state/store';
import { makeT } from '../src/lib/i18n';
import { addDays, dayKey } from '../src/lib/dates';
import type { ActivityLog, SetRecord, WorkoutSession } from '../src/lib/types';

const t = makeT('en') as any;
const today = dayKey(Date.now(), 0);
const DAY = 86_400_000;
let n = 0;
const id = (p: string) => `${p}${n++}`;
const set = (weightKg: number, reps: number, extra: Partial<SetRecord> = {}): SetRecord => ({ id: id('s'), type: 'working', done: true, weightKg, reps, ...extra });
const bench = () => allExercises(useStore.getState().exercises).find((e) => e.name === 'Barbell Bench Press')!;
const squat = () => allExercises(useStore.getState().exercises).find((e) => e.name === 'Back Squat')!;
const item = (exerciseId: string, workingSets = 3, repMin = 8, repMax = 12, restSec = 120) => ({ id: id('i'), exerciseId, warmupSets: 0, workingSets, repMin, repMax, restSec });
/** a routine (the default data has none): bench and squat */
const routine = (items = [item(bench().id), item(squat().id, 4, 6, 8)]) => ({ id: id('r'), name: 'Push', items, createdAt: 0, updatedAt: 0 });
function ses(date: string, sets: SetRecord[], o: Partial<WorkoutSession> = {}, exerciseId = bench().id): WorkoutSession {
  const at = Date.parse(`${date}T12:00:00`);
  return { id: id('w'), name: 'Push', date, startedAt: at, endedAt: at + 3600_000, pausedMs: 0, status: 'done', exercises: [{ id: id('se'), exerciseId, sets }], ...o };
}
const wrestle = (date: string, intensity: 1 | 2 | 3, rounds?: number): ActivityLog => ({ id: id('a'), date, kind: 'wrestling', durationSec: 3600, intensity, rounds, at: Date.parse(`${date}T18:00:00`) });
const put = (sessions: WorkoutSession[], activities: ActivityLog[] = []) => useStore.setState({ sessions, activities });

beforeEach(() => { localStorage.clear(); useStore.getState().replaceAll(defaultData('en')); });

describe('what each lift says (only what the rows don’t)', () => {
  const start = (sets = 3, repMin = 8, repMax = 12) => { useStore.getState().startWorkout({ routine: routine([item(bench().id, sets, repMin, repMax)]) }); return useStore.getState().active!.exercises[0]; };
  it('a record within reach: set 1 as planned, or a rep or two more', () => {
    put([ses(addDays(today, -6), [set(80, 9)]), ses(addDays(today, -3), [set(80, 12), set(80, 11)])]);
    const se = start();
    const h = liftHint(useStore.getState(), se, bench());
    // the plan is 82.5 × 8 (set 1 hit 12): heavier than ever, so set 1 as planned is a new best
    expect(h.record).toMatchObject({ kg: 82.5, reps: 8, planned: true });
  });
  it('a stalled lift: about 5 % lighter, top of the range, and "Use it" puts it in the open sets (Undo puts them back)', () => {
    const at = (d: number, r: number) => ses(addDays(today, -d), [set(60, r), set(60, r - 1)]);
    put([at(12, 8), at(9, 8), at(6, 8), at(3, 8)]);
    const se = start(3, 8, 12);
    const h = liftHint(useStore.getState(), se, bench());
    expect(h.stall).toEqual({ from: { kg: 60, reps: 8 }, to: { kg: 57.5, reps: 12 }, sessions: 3 });
    expect(h.record).toBeUndefined(); // one thing at a time
    const a = useStore.getState().active!;
    const r = applyStallChange(a, se.id, h.stall!.to);
    expect(r.next.exercises[0].sets.filter((x) => x.type === 'working').every((x) => x.weightKg === 57.5 && x.reps === 12)).toBe(true);
    expect(r.undo(r.next).exercises[0].sets).toEqual(a.exercises[0].sets);
  });
  it('the note left on it last time (not when today already carries the same note)', () => {
    const last = ses(addDays(today, -3), [set(80, 8)]);
    last.exercises[0].note = 'Seat on 4';
    put([last]);
    const se = start();
    expect(liftHint(useStore.getState(), se, bench()).lastNote).toBe('Seat on 4');
    expect(liftHint(useStore.getState(), { ...se, note: 'Seat on 4' }, bench()).lastNote).toBeUndefined();
  });
  it('nothing to say → nothing', () => {
    put([]);
    expect(liftHint(useStore.getState(), start(), bench())).toEqual({});
  });
});

describe('the Today card: only what is about the whole workout', () => {
  it('a live health note that isn’t about one lift (an ended one isn’t shown), and wrestling tomorrow on a heavy leg day', () => {
    const st = useStore.getState();
    st.addMemory({ text: 'Sick, keep it light', kind: 'health', until: addDays(today, -1) });
    st.startWorkout({ routine: routine([item(squat().id, 6, 6, 8)]) });
    const map = exerciseMap(useStore.getState().exercises);
    expect(workoutLines(useStore.getState(), useStore.getState().active!, today, map)).toEqual([]);
    useStore.getState().addMemory({ text: 'Back is tight this week', kind: 'health', until: addDays(today, 3) });
    const tomorrow = new Date(`${addDays(today, 1)}T12:00:00`).getDay();
    useStore.getState().setSchedule({ activities: { [tomorrow]: ['wrestling'] } });
    expect(workoutLines(useStore.getState(), useStore.getState().active!, today, map)).toEqual([{ kind: 'health', text: 'Back is tight this week' }, { kind: 'wrestle' }]);
  });
});

describe('after the workout', () => {
  it('next time: the main lift, what moved on set 1, and its target', () => {
    const before = ses(addDays(today, -3), [set(80, 10), set(80, 9)]);
    const now = ses(today, [set(82.5, 12), set(82.5, 10)]);
    put([before, now]);
    const out = nextTime(now, useStore.getState().sessions, useStore.getState(), exerciseMap(useStore.getState().exercises));
    expect(out[0]).toMatchObject({ exerciseId: bench().id, up: { kg: 2.5 }, kg: 85, reps: 8 });
  });
});

describe('day plans', () => {
  it('never a set lighter for being tired; a warning after hard wrestling the day before', () => {
    put([ses(addDays(today, -3), [set(80, 8)])], [wrestle(today, 3, 8)]);
    const d = useStore.getState();
    const plan = buildDayPlan([{ ...squat(), sets: 6 }, { ...bench() }], addDays(today, 1), d);
    expect(plan.warnings).toEqual(['wrestled-day-before']);
    expect(plan.picks[1].sets).toBe(buildDayPlan([{ ...bench() }], addDays(today, 5), d).picks[0].sets);
  });
});

describe('one way to tick a set', () => {
  const ctx = (): AgentCtx => ({ t, lang: 'en', today, brain: null });
  it('a tap and the Coach both find the record, start the rest and play the row’s moment', async () => {
    put([ses(addDays(today, -3), [set(80, 8), set(80, 8), set(80, 8)])]);
    const st = useStore.getState();
    st.startWorkout({ routine: routine([item(bench().id, 3, 6, 10, 120)]) });
    const se = useStore.getState().active!.exercises[0];
    const heard: unknown[] = [];
    const off = onSetDone(se.sets[0].id, (x) => heard.push(x));
    expect(completeSet(se.id, se.sets[0].id, { weightKg: 100, reps: 5 })).toMatchObject({ pr: true });
    expect(heard).toHaveLength(1);
    expect(useStore.getState().active!.rest?.total).toBe(120);
    off();
    // the Coach's "8 at 80" on the next set: same path (a gain on last time, the rest started again)
    const c = (await runActions(validateAgent({ reply: '', actions: [{ type: 'log_current_set', kg: 80, reps: 9, which: 'current' }] })!.actions, ctx()))[0];
    expect(c.title).toBe('Set logged');
    const s2 = useStore.getState().active!.exercises[0].sets[1];
    expect(s2).toMatchObject({ done: true, weightKg: 80, reps: 9 });
    c.undo!();
    expect(useStore.getState().active!.exercises[0].sets[1].done).toBe(false);
  });
  it('nothing to tick it with → null (the row shakes)', () => {
    const st = useStore.getState();
    st.startWorkout({ name: 'Empty' });
    useStore.getState().mutateActive((a) => ({ ...a, exercises: [{ id: 'se1', exerciseId: bench().id, sets: [{ id: 'x', type: 'working', done: false }] }] }));
    expect(completeSet('se1', 'x')).toBeNull();
  });
});

describe('the app counts its own AI trouble', () => {
  it('this week only, by kind, with no message text', () => {
    noteTrouble('dropped', '1 action · Gemini', Date.now() - 9 * DAY);
    noteTrouble('dropped', '1 action · Gemini');
    noteTrouble('webFailed');
    expect(troubleThisWeek()).toBe(2);
    expect(troubleReport()).toMatch(/part of an answer dropped: 1; web search failed: 1/);
  });
});
