// @vitest-environment jsdom
// Honest voice (25 Oct): a little over the calorie target is said once that day, plainly, and how often it happened sets
// how; the Coach sees planned sets that were skipped, not only skipped days; its style has one short NEVER list.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/lib/agentTurn', () => ({ brainFor: () => null }));
vi.mock('../src/lib/brain', () => ({ thinkJson: async () => null }));

import { useStore } from '../src/state/store';
import { useUI } from '../src/state/ui';
import { defaultData } from '../src/state/defaults';
import { checkEating } from '../src/lib/eatingWatch';
import { overToday, OVER_LINE } from '../src/lib/eating';
import { skippedSets } from '../src/lib/stats';
import { buildCoachContext, AGENT_SYSTEM } from '../src/lib/coachContext';
import { COACH_STYLE, COACH_NEVER, TASK_STYLE } from '../src/lib/handbook';
import { addDays } from '../src/lib/dates';
import { met, candidates, type ReviewNumbers } from '../src/lib/weekReview';
import { loadDanish } from '../src/lib/i18n';
import type { AppData, FoodEntry, WorkoutSession } from '../src/lib/types';

const today = '2026-10-25';
const NOON = new Date(2026, 9, 25, 13, 0).getTime();
let n = 0;
const entry = (date: string, kcal: number, id = `e${n++}`): FoodEntry => ({ id, date, mealId: 'lunch', at: NOON, snap: { name: 'food', basis: 'g', per100: { kcal } } as any, qty: { amount: 100, unit: 'g' } as any, base: 100, nutrients: { kcal, protein: 30 } });
const data = () => useStore.getState() as unknown as AppData;
const toasts = () => useUI.getState().toasts.map((x) => x.text);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
  localStorage.clear();
  const d = defaultData(); d.settings.onboarded = true; d.settings.dayStartHour = 0; d.settings.goals.kcal = 2500;
  d.settings.profile.goal = 'fatloss';
  d.marks = { heavySeen: '2026-10-01' };
  useStore.getState().replaceAll(d);
  useUI.setState({ toasts: [] });
});
afterEach(() => { vi.useRealTimers(); });

describe('a little over the target', () => {
  it('340 over: one plain line, once that day', () => {
    useStore.setState({ entries: [entry(today, 2840)] });
    checkEating(NOON);
    expect(toasts()).toEqual(['340 kcal over today. Fine now and then.']);
    useStore.setState((s) => ({ entries: [...s.entries, entry(today, 100)] }));
    checkEating(NOON + 60e3);
    expect(toasts()).toHaveLength(1);
    expect(data().marks?.overSaid).toBe(today);
  });
  it('under 200 over says nothing; a heavy day is left to its own pop-up', () => {
    useStore.setState({ entries: [entry(today, 2500 + OVER_LINE - 1)] });
    checkEating(NOON);
    expect(toasts()).toEqual([]);
    expect(overToday(data(), today)).toBeNull();
    useStore.setState({ entries: [entry(today, 3200)] }); // 700 over: heavy (600 and 25 %)
    expect(overToday(data(), today)).toBeNull();
  });
  it('a pattern is named with how often, firmer from the third day', () => {
    useStore.setState({ entries: [entry(addDays(today, -2), 2800), entry(today, 2800)] });
    checkEating(NOON);
    expect(toasts()).toEqual(['300 kcal over today, 2 of the last 7 days.']);
    useUI.setState({ toasts: [] });
    useStore.setState((s) => ({ entries: [...s.entries, entry(addDays(today, -4), 2900)], marks: { ...s.marks, overSaid: '' } }));
    checkEating(NOON);
    expect(toasts()).toEqual(['300 kcal over today, 3 of the last 7 days. That adds up.']);
  });
  it('the day after a heavy one is never "fine now and then"', () => {
    useStore.setState({ entries: [entry(addDays(today, -1), 4400), entry(today, 2800)] });
    checkEating(NOON);
    expect(toasts().filter((x) => x.startsWith('300'))).toEqual(['300 kcal over today, 2 of the last 7 days.']);
  });
  it('Quiet and Off say nothing', () => {
    useStore.getState().updateSettings({ heavyDays: 'quiet' });
    useStore.setState({ entries: [entry(today, 2840)] });
    checkEating(NOON);
    expect(toasts()).toEqual([]);
  });
  it('in Danish', async () => {
    useStore.getState().updateSettings({ language: 'da' });
    await loadDanish();
    useStore.setState({ entries: [entry(today, 2840)] });
    checkEating(NOON);
    expect(toasts()).toEqual(['340 kcal over i dag. Helt fint en gang imellem.']);
  });
});

const set = (done: boolean, kg = 60, reps = 10) => ({ id: `s${n++}`, type: 'working' as const, weightKg: kg, reps, done });
const session = (date: string, ex: WorkoutSession['exercises'], routineId?: string): WorkoutSession => ({ id: `w${n++}`, name: 'Push', routineId, date, startedAt: 0, endedAt: 1, pausedMs: 0, status: 'done', exercises: ex });

describe('skipped planned sets', () => {
  it('counts sets planned at the finish minus the ones done, and routine exercises left out', () => {
    const d = data();
    const routines = [{ ...(d.routines[0] ?? {}), id: 'r1', name: 'Push', updatedAt: 0, items: [
      { id: 'i1', exerciseId: 'bench', warmupSets: 0, workingSets: 4, repMin: 8, repMax: 12, restSec: 120 },
      { id: 'i2', exerciseId: 'fly', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 15, restSec: 90 },
    ] }] as any;
    const sessions = [
      session(addDays(today, -1), [{ id: 'x1', exerciseId: 'bench', sets: [set(true), set(true)], plannedSets: 4 }], 'r1'),
      session(addDays(today, -3), [{ id: 'x2', exerciseId: 'bench', sets: [set(true), set(true), set(true), set(true)], plannedSets: 4 }, { id: 'x3', exerciseId: 'fly', sets: [set(true), set(true), set(true)], plannedSets: 3 }], 'r1'),
      session(addDays(today, -9), [{ id: 'x4', exerciseId: 'bench', sets: [set(true)], plannedSets: 4 }]), // (older than a week)
      session(addDays(today, -2), [{ id: 'x5', exerciseId: 'bench', sets: [set(true)] }]), // (saved before plannedSets: not judged)
    ];
    const r = skippedSets({ sessions, routines }, today);
    expect(r.workouts).toBe(2);
    // (the left-out exercise is named, not counted: it may have been swapped)
    expect(r.skipped).toBe(2);
    expect(r.planned).toBe(11);
    expect(r.list).toEqual([{ date: addDays(today, -1), name: 'Push', exercises: [{ exerciseId: 'bench', skipped: 2, planned: 4, pos: 1 }, { exerciseId: 'fly', skipped: 3, planned: 3, absent: true }] }]);
  });
  it('a swap (an exercise from outside the routine) or a routine changed since: nothing is called left out', () => {
    const routines = [{ id: 'r1', name: 'Push', updatedAt: 0, items: [{ id: 'i1', exerciseId: 'bench', warmupSets: 0, workingSets: 4, repMin: 8, repMax: 12, restSec: 120 }, { id: 'i2', exerciseId: 'fly', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 15, restSec: 90 }] }] as any;
    const swapped = [session(addDays(today, -1), [{ id: 'x1', exerciseId: 'bench', sets: [set(true), set(true), set(true), set(true)], plannedSets: 4 }, { id: 'x2', exerciseId: 'dips', sets: [set(true), set(true), set(true)], plannedSets: 3 }], 'r1')];
    expect(skippedSets({ sessions: swapped, routines }, today).list).toEqual([]);
    const later = [session(addDays(today, -1), [{ id: 'x1', exerciseId: 'bench', sets: [set(true), set(true), set(true), set(true)], plannedSets: 4 }], 'r1')];
    expect(skippedSets({ sessions: later, routines: [{ ...routines[0], updatedAt: 5 }] }, today).list).toEqual([]);
    expect(skippedSets({ sessions: later, routines }, today).list[0].exercises).toEqual([{ exerciseId: 'fly', skipped: 3, planned: 3, absent: true }]);
  });
  it('the Coach is told, with names and numbers; and when nothing was skipped, that too', () => {
    const sessions = [session(addDays(today, -1), [{ id: 'x1', exerciseId: 'bench', sets: [set(true), set(true)], plannedSets: 4 }])];
    useStore.setState({ sessions });
    const c = buildCoachContext(data(), today, (id) => (id === 'bench' ? 'Bench press' : id));
    expect(c).toContain(`Planned working sets skipped (today and the 6 days before, since Mon ${addDays(today, -6)}): 2 of 4 in 1 workouts (Sat ${addDays(today, -1)} Push) — ${addDays(today, -1)} Push: Bench press (1st exercise) 2 of 4 skipped. The plan stays as it is: help them finish it (rest, order, food, sleep, time) or ask why; never offer fewer planned sets.`);
    useStore.setState({ sessions: [session(addDays(today, -1), [{ id: 'x1', exerciseId: 'bench', sets: [set(true), set(true)], plannedSets: 2 }])] });
    expect(buildCoachContext(data(), today, (id) => id)).toContain(`Planned working sets skipped (today and the 6 days before, since Mon ${addDays(today, -6)}): none, all 2 done in 1 workouts (Sat ${addDays(today, -1)} Push).`);
  });
});

describe('how the Coach talks', () => {
  it('tone is its call, with one NEVER list, in every Coach message', () => {
    expect(COACH_STYLE).toContain('The tone is your call and fits the moment');
    expect(COACH_STYLE).toContain('firmer when the same miss keeps happening');
    expect(COACH_STYLE).toMatch(/NEVER: comment on how their body looks.*shame, guilt or moralise about food.*tell them to train lighter or do less.*claim anything their data can't show/);
    expect(AGENT_SYSTEM('en')).toContain(COACH_STYLE);
    // (no doctor lines came back: 25 Oct, v0.1.173)
    expect(COACH_STYLE).not.toMatch(/doctor|GP|dietitian/i);
  });
});

describe('the Coach sees days a little over', () => {
  it('every day over, with the total, in the summary every AI job reads', async () => {
    useStore.setState({ entries: [entry(addDays(today, -1), 2800), entry(addDays(today, -3), 3300), entry(addDays(today, -5), 2600)] });
    const l = buildCoachContext(data(), today, (id) => id);
    // (2,600 is 100 over: under the line; 3,300 is heavy, and counted)
    expect(l).toContain(`Over the target, today and the 6 days before (since Mon ${addDays(today, -6)}; at least 200 kcal and 10 % over): 2 of 7 days, +1100 kcal in all — Thu ${addDays(today, -3)} +800 (heavy), 3300 kcal of it logged after 20:00; Sat ${addDays(today, -1)} +300, 2800 kcal of it logged after 20:00. Only the days marked (heavy) are heavy; the others are a little over.`);
    useStore.getState().updateSettings({ heavyDays: 'off' });
    expect(buildCoachContext(data(), today, (id) => id)).not.toContain('Over the target');
  });
  it('Today\'s notes and the weekly review get the same NEVER list as the Coach', () => {
    expect(TASK_STYLE).toContain(COACH_NEVER);
    expect(COACH_STYLE).toContain(COACH_NEVER);
    expect(COACH_NEVER).toContain('fewer sets');
  });
});

describe('one week, counted', () => {
  it('the day-by-day week is the same 7 days as skipped sets and days over, and protein days are counted', () => {
    useStore.setState({ entries: [entry(addDays(today, -1), 2400), entry(addDays(today, -2), 2400), entry(today, 500)] });
    useStore.getState().updateSettings({ goals: { ...data().settings.goals, protein: 40 } });
    const l = buildCoachContext(data(), today, (id) => id);
    expect(l).toContain(`Day by day (today and the 6 days before, since Mon ${addDays(today, -6)}; kcal / protein; workouts; weigh-ins): Mon 10-19: not logged`);
    expect(l).toContain('Sun 10-25 (today, so far): 500 / 30 g');
    // (30 g a day against 40: none on target; today isn't counted)
    expect(l).toContain('Protein at or above the 40 g target: 0 of those 2 days; under on Fri −10, Sat −10 g.');
    expect(l).toContain('"This week" or "my week" in a question means this same window');
    // (the weekly review has its own Mon–Sun week: DATA's 7 days are never read as it)
    const r = buildCoachContext(data(), today, (id) => id, undefined, { week: { from: addDays(today, -7), to: addDays(today, -1) } });
    expect(r).toContain(`"The week" here is WEEK ${addDays(today, -7)}…${addDays(today, -1)} above`);
    expect(r).not.toContain('answer that one window');
    expect(r).not.toContain('Average of the');
    expect(r).not.toContain('Protein at or above');
  });
  it('a weekly-review focus on skipped sets or days over can be checked the week after', () => {
    const n = { skipped: 4, plannedSets: 30, skippedWorkouts: 3, overDays: 1, loggedDays: 7 } as unknown as ReviewNumbers;
    expect(met('skipped', n, undefined)).toBe(false);
    expect(met('over', n, undefined)).toBe(true);
    expect(met('skipped', { ...n, skipped: 0 }, undefined)).toBe(true);
    // (no workouts, too little logged, or no target: unknown, never "done")
    expect(met('skipped', { ...n, skipped: 0, skippedWorkouts: 0 }, undefined)).toBeNull();
    expect(met('over', { ...n, loggedDays: 2 }, undefined)).toBeNull();
    expect(met('over', { ...n, overDays: null }, undefined)).toBeNull();
    const c = candidates(data(), { ...n, planned: 0, missed: 0, stalls: [], muscles: [], loggedDays: 7, proteinAvg: null, weightPct: null, sessions: 3 } as unknown as ReviewNumbers, String, String);
    expect(c.map((x) => x.id)).toContain('skipped');
  });
});

describe('a stalled lift in DATA gets the workout screen\'s own numbers', () => {
  it('from the routine\'s rep range, even when old sets carry no target', () => {
    const routines = [{ id: 'r1', name: 'Legs', updatedAt: 0, items: [{ id: 'i1', exerciseId: 'calf', warmupSets: 0, workingSets: 2, repMin: 10, repMax: 15, restSec: 60 }] }] as any;
    const exercises = [{ id: 'calf', name: 'Calf', logType: 'weightReps', equipment: ['machine'], muscles: ['calves'] }] as any;
    // (16.5 × 15 on the oldest, then 16.5 × 14 three times: stalled; 15 reps only fit the 10–15 range)
    const reps = [15, 14, 14, 14];
    const sessions = reps.map((r, i) => session(addDays(today, -40 + i * 11), [{ id: `c${i}`, exerciseId: 'calf', sets: [set(true, 16.5, r), set(true, 16.5, r - 1)] }], 'r1'));
    useStore.setState({ sessions, routines, exercises });
    const l = buildCoachContext(data(), today, (id) => id);
    expect(l).toMatch(/Stalled lifts[^\n]*calf[^\n]*the workout screen offers a reset to 1\dkg×15/);
  });
});

describe('round 7: exact protein days, evening overs', () => {
  it('179.6 g shows as 180 and counts as on target; the evening part of a day over is said', () => {
    // (what was logged that same day by 20:00 doesn't count; the 21:00 snack does)
    const at = (h: number) => new Date(2026, 9, 24, h, 0).getTime();
    const late = { ...entry(addDays(today, -1), 600), at: at(21) };
    useStore.setState({ entries: [{ ...entry(addDays(today, -2), 2600), at: new Date(2026, 9, 23, 13).getTime() }, { ...entry(addDays(today, -1), 2300), nutrients: { kcal: 2300, protein: 179.6 }, at: at(13) }, late] });
    useStore.getState().updateSettings({ goals: { ...data().settings.goals, protein: 180 } });
    const l = buildCoachContext(data(), today, (id) => id);
    expect(l).toContain('Protein at or above the 180 g target: 1 of those 2 days; under on Fri −150 g.');
    expect(l).toContain(`Sat ${addDays(today, -1)} +400, 600 kcal of it logged after 20:00.`);
  });
});
