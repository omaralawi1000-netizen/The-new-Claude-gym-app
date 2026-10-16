// @vitest-environment jsdom
// Coach 2.0, phase 5, part 1: the coach around a workout. Readiness from what is logged; the briefing's targets are the
// rows' own numbers; one set less per lift and back; next time's targets; one way to tick a set (tap, voice and the Coach);
// ended notes stop flagging; the app counts its AI trouble.
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, allExercises } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { readiness, readinessLine, rpeCreep } from '../src/lib/readiness';
import { briefing, nextTime, trimOneSet, untrim } from '../src/lib/coachWorkout';
import { buildDayPlan } from '../src/lib/planDay';
import { candidates, met, reviewNumbers } from '../src/lib/weekReview';
import { historyOf, incrementFor, repRange, suggestProgression } from '../src/lib/workout';
import { completeSet, onSetDone } from '../src/screens/workout/complete';
import { runActions, validateAgent, type AgentCtx } from '../src/lib/agent';
import { noteTrouble, troubleReport, troubleThisWeek } from '../src/lib/trouble';
import { exerciseMap } from '../src/state/store';
import { makeT } from '../src/lib/i18n';
import { addDays, dayKey } from '../src/lib/dates';
import type { ActivityLog, CheckIn, SetRecord, WorkoutSession } from '../src/lib/types';

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

describe('readiness: from what is logged, never guessed', () => {
  it('is normal with nothing to go on', () => {
    put([]);
    expect(readiness(useStore.getState(), today).level).toBe('normal');
    expect(readinessLine(useStore.getState(), today)).toBe('');
  });
  it('a poor night and low energy at the last check-in → tired, with the reasons', () => {
    const c: CheckIn = { energy: 1, sleep: 1, at: Date.now() - DAY };
    put([ses(addDays(today, -1), [set(80, 8)], { checkin: c })]);
    const r = readiness(useStore.getState(), today);
    expect(r.level).toBe('tired');
    expect(r.reasons.map((x) => x.key)).toEqual(['Poor sleep', 'Low energy last time']);
    expect(readinessLine(useStore.getState(), today)).toMatch(/READINESS.*tired — Poor sleep; Low energy last time/);
  });
  it('a check-in older than two days says nothing about today', () => {
    put([ses(addDays(today, -4), [set(80, 8)], { checkin: { energy: 1, sleep: 1, at: Date.now() - 4 * DAY } })]);
    expect(readiness(useStore.getState(), today).level).not.toBe('tired');
  });
  it('hard wrestling yesterday counts double; an easy roll a little', () => {
    put([ses(addDays(today, -2), [set(80, 8)])], [wrestle(addDays(today, -1), 3)]);
    expect(readiness(useStore.getState(), today)).toMatchObject({ level: 'tired', reasons: [{ key: 'Hard wrestling yesterday' }] });
    put([ses(addDays(today, -2), [set(80, 8)])], [wrestle(addDays(today, -1), 1)]);
    expect(readiness(useStore.getState(), today).level).toBe('normal');
  });
  it('the same weight at a higher RPE is a creep; a few days off and a great check-in → fresh', () => {
    const s = [ses(addDays(today, -10), [set(80, 8, { rpe: 7 })]), ses(addDays(today, -6), [set(80, 8, { rpe: 8.5 })])];
    expect(rpeCreep(s, today)).toEqual({ up: 1, checked: 1 });
    put([ses(addDays(today, -4), [set(80, 8)], { checkin: { energy: 3, sleep: 3, at: Date.now() - 4 * DAY } })]);
    expect(readiness(useStore.getState(), today).level).toBe('fresh');
  });
});

describe('the briefing', () => {
  it('its targets are the rows’ own numbers (suggestProgression), with what moved', () => {
    put([ses(addDays(today, -3), [set(80, 12), set(80, 11), set(80, 10)])]);
    const st = useStore.getState();
    st.startWorkout({ routine: routine([item(bench().id, 3, 8, 12)]) });
    const a = useStore.getState().active!;
    const b = briefing(useStore.getState(), a, today, exerciseMap(useStore.getState().exercises));
    const sug = suggestProgression(bench(), historyOf(bench().id, useStore.getState().sessions), repRange(a.exercises[0].sets), incrementFor(bench(), {}, 2.5));
    expect(b.targets[0]).toMatchObject({ exerciseId: bench().id, kg: sug.sets![0].weightKg, reps: sug.sets![0].reps, kind: 'add-weight', up: { kg: 2.5 } });
    expect(b.focus?.key).toBe('Focus: the new weight on {exercise}');
  });
  it('tired: a flag with reasons and one set less per lift, which Undo puts back', () => {
    put([ses(addDays(today, -1), [set(80, 8)], { checkin: { energy: 1, sleep: 1, at: Date.now() - DAY } })]);
    const st = useStore.getState();
    st.startWorkout({ routine: routine() });
    const a = useStore.getState().active!;
    const b = briefing(useStore.getState(), a, today, exerciseMap(useStore.getState().exercises));
    expect(b.flags[0]).toMatchObject({ kind: 'tired', key: 'You look tired today' });
    const r = trimOneSet(a);
    const big = a.exercises.filter((e) => e.sets.filter((x) => x.type === 'working').length >= 3).length;
    expect(r.removed).toHaveLength(big);
    expect(untrim(r.next, r.removed)).toEqual(a);
  });
  it('an ended health note is not shown; a live one is', () => {
    const st = useStore.getState();
    st.addMemory({ text: 'Sick, keep it light', kind: 'health', until: addDays(today, -1) });
    st.startWorkout({ routine: routine() });
    const map = exerciseMap(useStore.getState().exercises);
    expect(briefing(useStore.getState(), useStore.getState().active!, today, map).flags.some((f) => f.kind === 'note')).toBe(false);
    useStore.getState().addMemory({ text: 'Back is tight this week', kind: 'health', until: addDays(today, 3) });
    expect(briefing(useStore.getState(), useStore.getState().active!, today, map).flags.find((f) => f.kind === 'note')?.key).toBe('Back is tight this week');
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
  it('tired check-ins become a weekly priority, judged a week later', () => {
    const c = (e: 1 | 2 | 3): CheckIn => ({ energy: e, at: Date.now() });
    put([ses(addDays(today, -3), [set(80, 8)], { checkin: c(1) }), ses(addDays(today, -1), [set(80, 8)], { checkin: c(1) })]);
    const d = useStore.getState();
    const musc = (x: string) => allExercises(d.exercises).find((e) => e.id === x)?.muscles;
    const nums = reviewNumbers(d, today, musc);
    expect(nums).toMatchObject({ checkins: 2, tired: 2 });
    expect(candidates(d, nums, (x) => x, (m) => m).some((x) => x.id === 'fatigue')).toBe(true);
    expect(met('fatigue', nums, undefined)).toBe(false);
  });
});

describe('day plans', () => {
  it('a set lighter when tired (not under two, not where the Coach chose), and a warning after hard wrestling', () => {
    put([ses(addDays(today, -3), [set(80, 8)])], [wrestle(today, 3, 8)]);
    const d = useStore.getState();
    const plan = buildDayPlan([{ ...squat(), sets: 6 }, { ...bench() }], addDays(today, 1), d);
    expect(plan.warnings).toEqual(expect.arrayContaining(['tired', 'wrestled-day-before']));
    expect(plan.picks[0].sets).toBe(6); // the Coach chose it
    const later = buildDayPlan([{ ...bench() }], addDays(today, 5), d);
    expect(plan.picks[1].sets).toBe(later.picks[0].sets - 1);
    expect(later.warnings).toEqual([]);
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
