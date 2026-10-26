// @vitest-environment jsdom
// Goals you tell the Coach (living coach step 2, 26 Oct): a goal is saved with where it started; every day the app works
// out progress, pace, what the date needs and whether that is safe (GOALS); GOAL WATCH keeps an eye on strength, protein,
// sleep and skipped sets while it runs; Today's notes follow it up.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/lib/agentTurn', () => ({ brainFor: () => null }));
vi.mock('../src/lib/brain', () => ({ thinkJson: async () => null }));

import { useStore } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { runActions, validateAgent, type AgentCtx, type AgentResult } from '../src/lib/agent';
import { buildCoachContext, memoryBlock, AGENT_SYSTEM } from '../src/lib/coachContext';
import { goalLines, goalState, goalWatchLines, activeGoals } from '../src/lib/goals';
import { findNudges } from '../src/lib/nudges';
import { buildBackup, parseBackup } from '../src/lib/backup';
import { makeT } from '../src/lib/i18n';
import { addDays } from '../src/lib/dates';
import type { AppData, FoodEntry, WorkoutSession } from '../src/lib/types';

const t = makeT('en') as any;
const today = '2026-10-25';
const NOON = new Date(2026, 9, 25, 13, 0).getTime();
const ctx = (): AgentCtx => ({ t, lang: 'en', today, brain: null });
const act = async (a: Record<string, unknown>) => (await runActions(validateAgent({ reply: '', actions: [a] })!.actions, ctx()))[0] as AgentResult;
const data = () => useStore.getState() as unknown as AppData;
const name = (id: string) => ({ 'bench-press': 'Bench Press', squat: 'Squat', deadlift: 'Deadlift' } as Record<string, string>)[id] ?? id;
let n = 0;
/** weigh-ins every day from `from` days ago, starting at `kg` and changing `perWeek` */
const weighIns = (from: number, kg: number, perWeek: number) => Array.from({ length: from + 1 }, (_, i) => ({ id: `w${n++}`, date: addDays(today, -from + i), kg: Math.round((kg + (perWeek / 7) * i) * 10) / 10, at: 0 }));
const entry = (date: string, kcal: number, protein = 170): FoodEntry => ({ id: `e${n++}`, date, mealId: 'lunch', at: NOON, snap: { name: 'food', basis: 'g', per100: { kcal } } as any, qty: { amount: 100, unit: 'g' } as any, base: 100, nutrients: { kcal, protein } });
const set = (kg: number, reps: number) => ({ id: `s${n++}`, type: 'working' as const, weightKg: kg, reps, done: true });
const session = (date: string, ex: [string, number, number][]): WorkoutSession => ({ id: `x${n++}`, name: 'Push', date, startedAt: 0, endedAt: 1, pausedMs: 0, status: 'done', exercises: ex.map(([id, kg, reps]) => ({ id: `se${n++}`, exerciseId: id, sets: [set(kg, reps), set(kg, reps)] })) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
  localStorage.clear();
  const d = defaultData('en'); d.settings.onboarded = true; d.settings.dayStartHour = 0; d.settings.goals.kcal = 2600; d.settings.goals.protein = 180;
  d.settings.profile.goal = 'fatloss';
  useStore.getState().replaceAll(d);
});
afterEach(() => { vi.useRealTimers(); });

describe('a goal told in chat', () => {
  it('is saved with where it started and its date, and the card says so', async () => {
    useStore.setState({ weights: weighIns(20, 82.5, -0.3) });
    const r = await act({ type: 'remember', kind: 'goal', text: 'Goal: lose 2 kg by 2026-11-16.', goal: { metric: 'weight', target: 80, by: '2026-11-16' } });
    const m = data().memory[0];
    expect(m.kind).toBe('goal');
    expect(m.goal).toMatchObject({ metric: 'weight', target: 80, by: '2026-11-16', startDate: today });
    expect(m.goal!.start).toBeGreaterThan(81.5);
    expect(m.goal!.start).toBeLessThan(82.5);
    expect(r.title).toBe('Goal set');
    expect(r.lines[0].sub).toMatch(/→ 80 kg · by /);
  });

  it('a changed date keeps where it started; reached ends it, and the Coach stops following it as running', async () => {
    useStore.setState({ weights: weighIns(20, 82.5, -0.3) });
    await act({ type: 'remember', kind: 'goal', text: 'Goal: lose 2 kg by 2026-11-09.', goal: { metric: 'weight', target: 80, by: '2026-11-09' } });
    const start = data().memory[0].goal!.start;
    useStore.setState((s) => ({ memory: s.memory.map((m) => ({ ...m, goal: { ...m.goal!, startDate: '2026-10-20' } })) }));
    await act({ type: 'remember', kind: 'goal', memory: '1', text: 'Goal: lose 2 kg by 2026-11-23.', goal: { metric: 'weight', target: 80, by: '2026-11-23' } });
    expect(data().memory).toHaveLength(1);
    expect(data().memory[0].goal).toMatchObject({ by: '2026-11-23', startDate: '2026-10-20', start });
    const r = await act({ type: 'remember', kind: 'goal', memory: '1', text: 'Goal: lose 2 kg by 2026-11-23.', goal: { metric: 'weight', status: 'done' } });
    expect(r.title).toBe('Goal reached');
    expect(data().memory[0].goal).toMatchObject({ status: 'done', endedOn: today, target: 80 });
    expect(activeGoals(data(), today)).toHaveLength(0);
    expect(memoryBlock(data(), name)).toMatch(/reached on 2026-10-25: not running/);
    expect(goalLines(data(), today, name).join('\n')).toMatch(/None running[\s\S]*Ended goals .*reached on 2026-10-25/);
  });

  it('a lift goal without one of their exercises, or a weight far from theirs, is kept as words only', async () => {
    useStore.setState({ weights: weighIns(10, 82, 0) });
    await act({ type: 'remember', kind: 'goal', text: 'Goal: bench 100.', goal: { metric: 'lift', target: 100 } });
    await act({ type: 'remember', kind: 'goal', text: 'Goal: weigh 140.', goal: { metric: 'weight', target: 140 } });
    expect(data().memory.map((m) => m.goal?.metric)).toEqual(['other', 'other']);
    expect(goalLines(data(), today, name).join('\n')).toMatch(/no number the app can track/);
  });

  it('the goal survives a save and a backup', async () => {
    useStore.setState({ weights: weighIns(10, 82, 0) });
    await act({ type: 'remember', kind: 'goal', text: 'Goal: 80 kg by 2026-12-01.', goal: { metric: 'weight', target: 80, by: '2026-12-01' } });
    const back = parseBackup(JSON.stringify(buildBackup()), 'en').data.memory[0];
    expect(back.goal).toMatchObject({ metric: 'weight', target: 80, by: '2026-12-01', startDate: today });
  });
});

describe('where a weight goal stands', () => {
  const goal = (target: number, by?: string, startDate = addDays(today, -14), start = 83) => useStore.setState({ memory: [{ id: 'g1', kind: 'goal', text: 'Goal', at: 0, goal: { metric: 'weight', target, ...(by ? { by } : {}), startDate, start } }] });

  it('2 kg in 2 weeks at 82 kg: the date needs more than the safe pace, and says when the safe pace gets there', () => {
    useStore.setState({ weights: weighIns(27, 82.6, -0.15) });
    goal(80, addDays(today, 14), today, 82.1);
    const st = goalState(data(), data().memory[0], today)!;
    expect(st.need).toBeLessThan(-0.9);
    expect(st.dateUnsafe).toBe(true);
    expect(st.safe!.max).toBeCloseTo(0.82, 1);
    expect(st.safeEta! > addDays(today, 14)).toBe(true);
    const txt = goalLines(data(), today, name).join('\n');
    expect(txt).toMatch(/FASTER THAN SAFE/);
    expect(txt).toMatch(/At the safe 0\.8\d kg\/week it lands around 2026-1[12]-/);
  });

  it('on pace, behind, too fast and the wrong way come from the scale, not a guess', () => {
    useStore.setState({ weights: weighIns(27, 84, -0.5) });
    goal(80, addDays(today, 28));
    expect(goalState(data(), data().memory[0], today)!.pace).toBe('on pace');
    goal(78, addDays(today, 21));
    expect(goalState(data(), data().memory[0], today)!.pace).toBe('behind');
    useStore.setState({ weights: weighIns(27, 87, -1.2) });
    goal(80, addDays(today, 60), addDays(today, -14), 85.5);
    expect(goalState(data(), data().memory[0], today)!.pace).toBe('too fast');
    useStore.setState({ weights: weighIns(27, 82, 0.4) });
    goal(80, addDays(today, 42), addDays(today, -14), 82.5);
    expect(goalState(data(), data().memory[0], today)!.pace).toBe('wrong way');
  });

  it("too few weigh-ins: the pace isn't judged, and Today asks for weigh-ins", () => {
    useStore.setState({ weights: [{ id: 'a', date: addDays(today, -9), kg: 83, at: 0 }, { id: 'b', date: addDays(today, -2), kg: 82.4, at: 0 }] });
    goal(80, addDays(today, 40));
    const st = goalState(data(), data().memory[0], today)!;
    expect(st.pace).toBe('too early');
    expect(st.why).toMatch(/2 weigh-ins/);
    const nd = findNudges(data(), today, 9, t, 'en', name).find((x) => x.id.startsWith('goal:'))!;
    expect(nd.title).toBe('Too early to tell: Goal');
    expect(nd.action?.label).toBe('Log weight');
  });

  it('reached when the trend gets there', () => {
    useStore.setState({ weights: weighIns(27, 81.5, -0.4) });
    goal(80.2, addDays(today, 10));
    expect(goalState(data(), data().memory[0], today)!.pace).toBe('reached');
  });

  it('gives the calories from true maintenance, never under a safe floor, and protein for a cut', () => {
    useStore.setState({ weights: weighIns(27, 84, -0.5), entries: Array.from({ length: 20 }, (_, i) => entry(addDays(today, -20 + i), 2500)) });
    goal(80, addDays(today, 28));
    const txt = goalLines(data(), today, name).join('\n');
    // 2,500 eaten while losing 0.5 kg a week: maintenance ≈ 3,050
    expect(txt).toMatch(/TRUE MAINTENANCE 3,0\d0 kcal/);
    expect(txt).toMatch(/protein 1\.8–2\.2 g\/kg/);
    expect(txt).toMatch(/never under/);
    expect(txt).toMatch(/STATUS: ON PACE/);
  });

  it('is in the Coach\'s DATA near the top, and Today follows it up', () => {
    useStore.setState({ weights: weighIns(27, 84, -0.5) });
    goal(78, addDays(today, 21));
    const c = buildCoachContext(data(), today, name);
    expect(c.indexOf('GOALS')).toBeLessThan(c.indexOf('Nutrition'));
    const nd = findNudges(data(), today, 9, t, 'en', name).find((x) => x.id.startsWith('goal:'))!;
    expect(nd.title).toBe('Behind pace: Goal');
    expect(nd.body).toMatch(/now, 78 kg by/);
    expect(nd.body).toMatch(/The date needs/);
    // (the general "losing weight fast" card stays away while a weight goal speaks for itself)
    expect(findNudges(data(), today, 9, t, 'en', name).some((x) => x.id.startsWith('fastloss'))).toBe(false);
  });
});

describe('a lift goal', () => {
  it('follows the estimated max of their sets, and the date it needs', () => {
    const sessions = [0, 1, 2, 3, 4, 5].map((i) => session(addDays(today, -35 + i * 7), [['bench-press', 80 + i * 1.25, 5]]));
    useStore.setState({ sessions, memory: [{ id: 'g', kind: 'goal', text: 'Goal: bench 100 kg by summer.', at: 0, exerciseIds: ['bench-press'], goal: { metric: "lift", target: 110, reps: 1, by: "2027-06-21", startDate: addDays(today, -35), start: 93 } }] });
    const st = goalState(data(), data().memory[0], today)!;
    expect(st.now).toBeCloseTo(86.25 * (1 + 5 / 30), 0);
    expect(st.rate).toBeCloseTo(1.25 * (1 + 5 / 30), 1);
    expect(st.pace).toBe('ahead');
    expect(goalLines(data(), today, name).join('\n')).toMatch(/Bench Press 110 kg × 1 .*only a real attempt proves it/);
  });
});

describe('goal watch', () => {
  it('raises falling strength on most main lifts during a cut, as a sign with the numbers', () => {
    const before = [-40, -33, -26, -19].map((k) => session(addDays(today, k), [['bench-press', 90, 5], ['squat', 120, 5], ['deadlift', 150, 5]]));
    const after = [-10, -3].map((k) => session(addDays(today, k), [['bench-press', 85, 5], ['squat', 112.5, 5], ['deadlift', 150, 5]]));
    useStore.setState({ sessions: [...before, ...after], weights: weighIns(27, 84, -0.7), memory: [{ id: 'g', kind: 'goal', text: 'Goal: cut to 78', at: 0, goal: { metric: 'weight', target: 78, startDate: addDays(today, -14), start: 83 } }] });
    const w = goalWatchLines(data(), today, name).join('\n');
    expect(w).toMatch(/Bench Press 105 → 99\.2 kg \(−?-6 %\)/);
    expect(w).toMatch(/2 of 3 down 3 % or more/);
    expect(w).toMatch(/SIGN TO RAISE/);
    expect(w).toMatch(/never lighter training/);
  });

  it('sleep and HRV against their usual, protein days and skipped sets since the goal started', () => {
    const health = Array.from({ length: 37 }, (_, i) => ({ date: addDays(today, -36 + i), sleepMin: i >= 30 ? 380 : 450, hrv: i >= 30 ? 50 : 62 }));
    const entries = Array.from({ length: 13 }, (_, i) => entry(addDays(today, -13 + i), 2400, i % 2 ? 185 : 160));
    useStore.setState({ health, entries, weights: weighIns(27, 84, -0.5), memory: [{ id: 'g', kind: 'goal', text: 'Goal', at: 0, goal: { metric: 'weight', target: 78, startDate: addDays(today, -13), start: 83 } }] });
    const w = goalWatchLines(data(), today, name).join('\n');
    expect(w).toMatch(/sleep 6h\d\d a night vs usual 7h30/);
    expect(w).toMatch(/Off: sleep \d+ min under usual, HRV \d+ % under usual: on a cut/);
    expect(w).toMatch(/at or above the 180 g target on 6 of 13 days/);
    expect(w).toMatch(/planned working sets skipped in the last 14 days/);
  });

  it('is there on a fat-loss profile without a told goal, and not for someone with neither', () => {
    expect(goalWatchLines(data(), today, name)[0]).toMatch(/profile goal \(fatloss\)/);
    useStore.setState((s) => ({ settings: { ...s.settings, profile: { ...s.settings.profile, goal: 'general' } } }));
    expect(goalWatchLines(data(), today, name)).toEqual([]);
  });
});

describe('the Coach is told how to coach a goal', () => {
  it('plans with numbers, says too fast once with the safe pace, saves it, follows up, and never trains lighter', () => {
    const s = AGENT_SYSTEM('en');
    expect(s).toMatch(/GOALS THEY TELL YOU/);
    expect(s).toMatch(/quote its numbers, never redo the maths/);
    expect(s).toMatch(/Too fast or unsafe → say it plainly once/);
    expect(s).toMatch(/never less training/);
    expect(s).toMatch(/its date is goal\.by, not until/);
  });
  it('asks once what they are working on when no goal was ever told', () => {
    useStore.setState({ sessions: [0, 1, 2, 3, 4].map((i) => session(addDays(today, -i * 2), [['bench-press', 80, 5]])) });
    expect(findNudges(data(), today, 9, t, 'en', name).some((x) => x.id === 'goal-ask')).toBe(true);
    useStore.setState({ memory: [{ id: 'g', kind: 'goal', text: 'Make the 74 kg class.', at: 0 }] });
    expect(findNudges(data(), today, 9, t, 'en', name).some((x) => x.id === 'goal-ask')).toBe(false);
  });
});

describe('a goal note without its numbers', () => {
  it('reads them from its words: a bodyweight, a lift, a class with its date, "lose 2 kg", and that it was reached', async () => {
    useStore.setState({ weights: weighIns(20, 82.5, -0.3) });
    await act({ type: 'remember', kind: 'goal', text: 'Goal: 81.9 → 80.0 kg by 2026-11-16, about 0.55 kg a week' });
    expect(data().memory[0].goal).toMatchObject({ metric: 'weight', target: 80, by: '2026-11-16' });
    await act({ type: 'remember', kind: 'goal', text: 'Goal: Barbell Bench Press 47.5 kg -> 80 kg by 2027-06-01' });
    expect(data().memory[1]).toMatchObject({ exerciseIds: ['bench-press'], goal: { metric: 'lift', target: 80, reps: 1, by: '2027-06-01' } });
    await act({ type: 'remember', kind: 'goal', text: 'Make the 80 kg class at the weigh-in on 2026-11-28.' });
    expect(data().memory[2].goal).toMatchObject({ metric: 'weight', target: 80, by: '2026-11-28' });
    await act({ type: 'remember', kind: 'goal', text: 'Wants to lose 2 kg.' });
    expect(data().memory[3].goal!.target).toBeCloseTo(data().memory[3].goal!.start! - 2, 1);
    await act({ type: 'remember', kind: 'goal', text: 'Wrestles in the under-65 kg class.' });
    expect(data().memory[4].goal).toBeUndefined();
    const r = await act({ type: 'remember', kind: 'goal', memory: '1', text: 'Goal reached: 80.0 kg on 2026-10-25.' });
    expect(r.title).toBe('Goal reached');
    expect(data().memory[0].goal).toMatchObject({ status: 'done', target: 80 });
  });
});
