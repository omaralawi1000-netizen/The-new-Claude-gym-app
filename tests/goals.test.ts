// @vitest-environment jsdom
// Goals you tell the Coach (living coach step 2, 26 Oct): a goal is saved with where it started; every day the app works
// out progress, pace, what the date needs and whether that is safe (GOALS); GOAL WATCH keeps an eye on strength, protein,
// sleep and skipped sets while it runs; Today's notes follow it up.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/lib/agentTurn', () => ({ brainFor: () => null }));
vi.mock('../src/lib/brain', () => ({ thinkJson: async () => null }));

import { useStore } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { runActions, validateAgent, goalFromText, type AgentCtx, type AgentResult } from '../src/lib/agent';
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
    expect(nd.title).toBe('Too early to tell: 80 kg by 4 Dec');
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
    expect(nd.title).toBe('Behind pace: 78 kg by 15 Nov');
    expect(nd.body).toMatch(/now, 4\.1 kg to go, 21 days left/);
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
    expect(w).toMatch(/MUST SAY THIS TURN/);
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

describe('a goal in its first two weeks', () => {
  it('is judged on what they eat, not on the weeks before it, and says so', () => {
    // 4 weeks of a slow cut, then a gain goal 6 days ago eaten at 3,900 a day
    const ws = weighIns(27, 83, -0.25).filter((w) => w.date < addDays(today, -6));
    const entries = [...Array.from({ length: 22 }, (_, i) => entry(addDays(today, -28 + i), 2700)), ...Array.from({ length: 6 }, (_, i) => entry(addDays(today, -6 + i), 3900))];
    useStore.setState({ weights: [...ws, { id: 'n', date: addDays(today, -2), kg: 82.4, at: 0 }], entries, memory: [{ id: 'g', kind: 'goal', text: 'Goal: 82 → 84 kg', at: 0, goal: { metric: 'weight', target: 84, by: addDays(today, 40), startDate: addDays(today, -6), start: 82 } }] });
    const st = goalState(data(), data().memory[0], today)!;
    expect(st.eating!.kgPerWeek).toBeGreaterThan(0.5);
    expect(st.rateBasis).toMatch(/^what they eat since the goal started/);
    expect(st.pace).toBe('too fast');
    const nd = findNudges(data(), today, 9, t, 'en', name).find((x) => x.id.startsWith('goal:'))!;
    expect(nd.body).toMatch(/Faster than about 0.5% a week is mostly fat/);
  });
  it('is not judged at all in its first days without its own numbers', () => {
    useStore.setState({ weights: weighIns(27, 83, -0.25), memory: [{ id: 'g', kind: 'goal', text: 'Goal', at: 0, goal: { metric: 'weight', target: 81, by: addDays(today, 40), startDate: addDays(today, -1), start: 82 } }] });
    const st = goalState(data(), data().memory[0], today)!;
    expect(st.pace).toBe('too early');
    expect(st.why).toMatch(/the goal is 1 day old/);
  });
  it('a new cut on plan reads as on plan: its maintenance is the one from before it started', () => {
    // 4 weeks steady at 2,900 and a flat scale, then 2,200 a day for 6 days with the scale following it
    const pre = weighIns(34, 82, 0).filter((w) => w.date <= addDays(today, -6));
    const post = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, date: addDays(today, -5 + i), kg: Math.round((82 - (700 / 7700) * (i + 1)) * 10) / 10, at: 0 }));
    const entries = [...Array.from({ length: 28 }, (_, i) => entry(addDays(today, -34 + i), 2900)), ...Array.from({ length: 6 }, (_, i) => entry(addDays(today, -6 + i), 2200))];
    useStore.setState({ weights: [...pre, ...post], entries, memory: [{ id: 'g', kind: 'goal', text: 'Goal: 82 → 80.8 kg', at: 0, goal: { metric: 'weight', target: 80.8, by: addDays(today, 8 + 6), startDate: addDays(today, -6), start: 82 } }] });
    const st = goalState(data(), data().memory[0], today)!;
    expect(st.eating!.maint).toBeGreaterThanOrEqual(2850);
    expect(st.eating!.kgPerWeek).toBeLessThan(-0.55);
    expect(['on pace', 'ahead']).toContain(st.pace);
  });
  it("the Profile's goal weight is in GOALS while no weight goal runs", () => {
    useStore.setState({ weights: weighIns(20, 82.5, -0.3) });
    useStore.setState({ settings: { ...data().settings, body: { goalWeightKg: 78 } } });
    expect(goalLines(data(), today, name).join('\n')).toMatch(/Goal weight in their Profile: 78 kg \(typed in Settings, no date, not planned with you yet\); now 81\.\d kg on the trend/);
    useStore.setState({ memory: [{ id: 'g', kind: 'goal', text: 'Goal', at: 0, goal: { metric: 'weight', target: 80, by: addDays(today, 30), startDate: addDays(today, -3) } }] });
    expect(goalLines(data(), today, name).join('\n')).not.toMatch(/Goal weight in their Profile/);
  });
});

describe('goal words read by the app (when the model leaves out the goal field)', () => {
  const running = { id: 'g', kind: 'goal' as const, text: 'Goal: 82 → 80 kg', at: 0, goal: { metric: 'weight' as const, target: 80, startDate: today } };
  it('pounds, a weight change named before a lift, and "reached" only when the goal is', () => {
    expect(goalFromText('Goal: lose 10 lb by 2026-12-01', undefined, undefined, 'en')).toMatchObject({ metric: 'weight', delta: -4.5, by: '2026-12-01' });
    expect(goalFromText('Goal: 82 → 80 kg by 2026-12-01, keeping my bench press strength', undefined, undefined, 'en')).toMatchObject({ metric: 'weight', target: 80 });
    expect(goalFromText('Goal: bench press 100 kg by 2027-06-01', undefined, undefined, 'en')).toMatchObject({ metric: 'lift', target: 100 });
    expect(goalFromText('Goal: 82 → 80 kg, halfway reached', undefined, running, 'en')?.status).toBeUndefined();
    expect(goalFromText('Goal reached: 82 → 80 kg', undefined, running, 'en')?.status).toBe('done');
    expect(goalFromText('Goal: 82 → 81 kg by 26 Oct (reached 19 Oct at 80.7 kg)', undefined, running, 'en')?.status).toBe('done');
  });
  it('the notes the Coach really wrote without the goal field (judge round 9: tracking rests on these words)', () => {
    expect(goalFromText('Goal: 81.7 → 79.7 kg by 2026-11-16, about 0.5 kg a week', undefined, undefined, 'en')).toMatchObject({ metric: 'weight', target: 79.7, by: '2026-11-16' });
    expect(goalFromText('Goal: gain 2 kg (81.7 → 83.7 kg) by 2026-12-01 for wrestling 86 kg class', undefined, undefined, 'en')).toMatchObject({ metric: 'weight', by: '2026-12-01' });
    expect(goalFromText('Goal: Barbell Bench Press 100 kg by 2027-06-01', undefined, undefined, 'en')).toMatchObject({ metric: 'lift', target: 100, by: '2027-06-01' });
    expect(goalFromText('Weigh-in: 80 kg class on 2026-10-24', '2026-10-24', undefined, 'en')).toMatchObject({ metric: 'weight', target: 80, by: '2026-10-24' });
    expect(goalFromText('Goal: 74.8 → 71.8 kg by 2026-12-25, about 0.33 kg a week', undefined, undefined, 'en')).toMatchObject({ metric: 'weight', target: 71.8, by: '2026-12-25' });
    expect(goalFromText('Promise: log every meal, no skipping dinner, through 2026-10-25', '2026-10-25', undefined, 'en')).toMatchObject({ metric: 'other', by: '2026-10-25' });
  });
});

describe('a lift goal on a plateau', () => {
  it('is STALLED, never ahead, even right after a climb, and GOALS says for how long', () => {
    const kgs = [70, 72.5, 75, 77.5, 77.5, 77.5, 77.5, 77.5, 77.5];
    useStore.setState({ sessions: kgs.map((kg, i) => session(addDays(today, -40 + i * 5), [['bench-press', kg, 5]])), memory: [{ id: 'g', kind: 'goal', text: 'Goal: bench 100', at: 0, exerciseIds: ['bench-press'], goal: { metric: 'lift', target: 100, reps: 1, by: addDays(today, 200), startDate: today } }] });
    // (set today, not trained since: the plateau is where the plan starts, not a stall of the goal; its first step is the
    // workout screen's next target)
    const st0 = goalState(data(), data().memory[0], today)!;
    expect(st0.pace).toBe('too early');
    expect(st0.next).toEqual({ kg: 77.5, reps: 6 });
    expect(goalLines(data(), today, name).join('\n')).toMatch(/next target for its first set: 77\.5 kg × 6 \(no plan agreed yet/);
    useStore.setState({ memory: [{ ...data().memory[0], goal: { ...data().memory[0].goal!, startDate: addDays(today, -12) } }] });
    const st = goalState(data(), data().memory[0], today)!;
    expect(st.pace).toBe('stalled');
    expect(st.plateau).toMatchObject({ kg: 77.5, reps: 5, workouts: 6 });
    expect(goalLines(data(), today, name).join('\n')).toMatch(/Plateau: best set 77\.5 kg × 5, matched but not beaten in 6 workouts since/);
  });
});

describe('judge round 2 (26 Oct)', () => {
  it('the plan is saved and shown, "lose 2 kg" is worked out from where the app tracks them, the same goal again makes no card', async () => {
    useStore.setState({ weights: weighIns(20, 82.5, -0.3) });
    const r = await act({ type: 'remember', kind: 'goal', text: 'Goal: lose 2 kg by 2026-11-30', goal: { metric: 'weight', delta: -2, by: '2026-11-30', plan: '2,400 kcal, 180 g protein' } });
    const m = data().memory[0];
    expect(m.goal!.target).toBeCloseTo(m.goal!.start! - 2, 1);
    expect(m.goal!.plan).toBe('2,400 kcal, 180 g protein');
    expect(r.title).toBe('Goal set');
    expect(goalLines(data(), today, name).join('\n')).toMatch(/Plan agreed: 2,400 kcal, 180 g protein\./);
    const again = (await runActions(validateAgent({ reply: '', actions: [{ type: 'remember', kind: 'goal', replaces: 1, text: 'Goal: lose 2 kg by 2026-11-30', goal: { metric: 'weight', target: m.goal!.target, by: '2026-11-30' } }] })!.actions, ctx()));
    expect(again).toHaveLength(0);
  });
  it('a day with its dinner unlogged is not a low day for the pace', () => {
    const entries: FoodEntry[] = [];
    for (let i = 1; i <= 34; i++) { const day = addDays(today, -i); for (const meal of ['breakfast', 'lunch', 'dinner']) if (!(i <= 4 && i % 2 === 0 && meal === 'dinner')) entries.push({ ...entry(day, 900), mealId: meal, at: new Date(`${day}T${meal === 'dinner' ? '19' : meal === 'lunch' ? '12' : '08'}:00:00`).getTime() }); }
    useStore.setState({ weights: weighIns(34, 82, 0), entries, memory: [{ id: 'g', kind: 'goal', text: 'Goal', at: 0, goal: { metric: 'weight', target: 80, by: addDays(today, 40), startDate: addDays(today, -5) } }] });
    const st = goalState(data(), data().memory[0], today)!;
    expect(st.eating!.days).toBe(3);
    expect(st.eating!.kcal).toBe(2700);
  });
  it('older goal notes without numbers are listed apart, not as running goals', () => {
    useStore.setState({ memory: [{ id: 'o', kind: 'goal', text: 'Wants to be stronger', at: 0 }] });
    const L = goalLines(data(), today, name).join('\n');
    expect(L).toMatch(/None running\./);
    expect(L).toMatch(/Older goal notes .*"Wants to be stronger"/);
  });
});

describe('judge round 2, second pass', () => {
  it('a running goal rewritten as reached ends it, even with a goal field', async () => {
    useStore.setState({ weights: weighIns(20, 82.5, -0.3), memory: [{ id: 'g', kind: 'goal', text: 'Goal: 82 → 81 kg', at: 0, goal: { metric: 'weight', target: 81, by: addDays(today, 7), startDate: addDays(today, -20), start: 82 } }] });
    const r = await act({ type: 'remember', kind: 'goal', replaces: 1, text: 'Goal: 82 → 81 kg reached at 80.8 kg trend on 25 Oct', goal: { metric: 'weight', target: 81, by: today } });
    expect(r.title).toBe('Goal reached');
    expect(data().memory[0].goal!.status).toBe('done');
  });
});

describe('judge round 3 (26 Oct)', () => {
  it('a class above where they are is not a weight to climb to', async () => {
    useStore.setState({ weights: weighIns(20, 82.5, -0.1) });
    await act({ type: 'remember', kind: 'goal', text: 'Weigh-in: 86 kg class on 2026-12-06', goal: { metric: 'weight', target: 86, by: '2026-12-06' } });
    expect(data().memory[0].goal!.metric).toBe('other');
  });
  it('a lift goal is only reached by a real set; the estimate says it is ready to test', () => {
    useStore.setState({ sessions: [0, 1, 2, 3, 4].map((i) => session(addDays(today, -20 + i * 4), [['bench-press', 82.5 + i * 0.5, 6]])), memory: [{ id: 'g', kind: 'goal', text: 'Goal: bench 100', at: 0, exerciseIds: ['bench-press'], goal: { metric: 'lift', target: 100, reps: 1, by: addDays(today, 100), startDate: addDays(today, -21) } }] });
    expect(goalState(data(), data().memory[0], today)!.pace).toBe('ready');
    useStore.setState({ sessions: [...data().sessions, session(addDays(today, -1), [['bench-press', 100, 1]])] });
    expect(goalState(data(), data().memory[0], today)!.pace).toBe('reached');
  });
  it('a weigh-in goal is made by one morning on or before its day, and is judged on the morning scale', () => {
    const ws = [...weighIns(20, 82, 0).filter((w) => w.date <= addDays(today, -5)), { id: 'm1', date: addDays(today, -3), kg: 81.2, at: 0 }, { id: 'm2', date: addDays(today, -1), kg: 80.6, at: 0 }];
    useStore.setState({ weights: ws, memory: [{ id: 'g', kind: 'goal', text: 'Weigh-in: 81 kg class', at: 0, goal: { metric: 'weight', target: 81, by: addDays(today, 1), startDate: addDays(today, -5) } }] });
    expect(goalState(data(), data().memory[0], today)!.pace).toBe('reached');
    useStore.setState({ weights: ws.slice(0, -1) });
    const st = goalState(data(), data().memory[0], today)!;
    expect(st.now).toBe(81.2);
    expect(st.short).toBe(true);
  });
  it('a goal saved with new targets in the same answer keeps them as its plan', async () => {
    useStore.setState({ weights: weighIns(20, 82.5, -0.3) });
    await runActions(validateAgent({ reply: '', actions: [{ type: 'remember', kind: 'goal', text: 'Goal: 81.8 → 80 kg by 2026-11-30' }, { type: 'set_setting', settings: [{ key: 'kcalGoal', value: 2460 }, { key: 'proteinGoal', value: 180 }] }] })!.actions, ctx());
    expect(data().memory[0].goal!.plan).toBe('2,460 kcal, 180 g protein');
  });
});

describe('a goal note rewritten with another kind', () => {
  it('stays a goal and closes when the words say reached', async () => {
    useStore.setState({ weights: weighIns(20, 82.5, -0.3), memory: [{ id: 'g', kind: 'goal', text: 'Goal: 82 → 81 kg', at: 0, goal: { metric: 'weight', target: 81, by: addDays(today, 7), startDate: addDays(today, -20), start: 82 } }] });
    const r = await act({ type: 'remember', kind: 'other', replaces: 1, text: 'Goal: 82 → 81 kg by 2026-10-26 (reached 80.7 kg on 2026-10-25).' });
    expect(r.title).toBe('Goal reached');
    expect(data().memory[0]).toMatchObject({ kind: 'goal', goal: { status: 'done', target: 81 } });
  });
});


describe('judge round 4 (26 Oct)', () => {
  it('in its first 2 weeks a goal is where what they eat puts it, not where a water drop on the scale does', () => {
    // 4 weeks flat at 82 on 2,900, then 10 days at 2,350 (about −0.5 kg a week) while the scale drops 1.4 kg (water)
    const pre = weighIns(38, 82, 0).filter((w) => w.date <= addDays(today, -10));
    const post = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, date: addDays(today, -9 + i), kg: Math.round((81.6 - 0.1 * i) * 10) / 10, at: 0 }));
    const entries = [...Array.from({ length: 28 }, (_, i) => entry(addDays(today, -38 + i), 2900)), ...Array.from({ length: 10 }, (_, i) => entry(addDays(today, -10 + i), 2350))];
    useStore.setState({ weights: [...pre, ...post], entries, memory: [{ id: 'g', kind: 'goal', text: 'Goal: 82 → 80 kg', at: 0, goal: { metric: 'weight', target: 80, by: addDays(today, 18), startDate: addDays(today, -10), start: 82 } }] });
    const st = goalState(data(), data().memory[0], today)!;
    expect(st.now).toBeGreaterThan(81.1);
    expect(st.now).toBeLessThan(81.5);
    expect(st.scaleKg).toBeLessThan(80.9);
    expect(Math.abs(st.need!)).toBeLessThan(0.6);
    expect(st.pace).toBe('on pace');
    expect(goalLines(data(), today, name).join('\n')).toMatch(/Now about 81\.\d kg by what they eat .*the scale's line says 80\.\d kg/);
    expect(findNudges(data(), today, 9, t, 'en', name).find((x) => x.id.startsWith('goal:'))!.body).toMatch(/^About 81\.\d kg by what you eat, 1\.\d kg to go, 18 days left\./);
  });
  it('a weigh-in that would take a water cut, or with the age unknown, is kept as the event, not a countdown', async () => {
    useStore.setState({ weights: weighIns(20, 82, 0) });
    await act({ type: 'remember', kind: 'goal', text: `Weigh-in: 79 kg class on ${addDays(today, 10)}`, goal: { metric: 'weight', target: 79, by: addDays(today, 10) } });
    expect(data().memory[0].goal!.metric).toBe('other');
    await act({ type: 'remember', kind: 'goal', text: `Weigh-in: 81 kg class on ${addDays(today, 9)}`, goal: { metric: 'weight', target: 81, by: addDays(today, 9) } });
    expect(data().memory[1].goal!.metric).toBe('other');
    useStore.setState({ memory: [], settings: { ...data().settings, body: { birthYear: 1999 } } });
    await act({ type: 'remember', kind: 'goal', text: `Weigh-in: 81 kg class on ${addDays(today, 9)}`, goal: { metric: 'weight', target: 81, by: addDays(today, 9) } });
    expect(data().memory[0].goal).toMatchObject({ metric: 'weight', target: 81 });
    // (a 2-week cut that isn't a weigh-in stays tracked)
    useStore.setState({ memory: [], settings: { ...data().settings, body: {} } });
    await act({ type: 'remember', kind: 'goal', text: 'Goal: lose 2 kg in 2 weeks', goal: { metric: 'weight', delta: -2, by: addDays(today, 14) } });
    expect(data().memory[0].goal!.metric).toBe('weight');
  });
  it('a lift goal with no plan agreed starts from the workout screen\'s next target', async () => {
    useStore.setState({ sessions: [70, 72.5, 75, 77.5].map((kg, i) => session(addDays(today, -20 + i * 5), [['bench-press', kg, 5]])) });
    await act({ type: 'remember', kind: 'goal', exercise: 'Bench Press', text: 'Goal: bench 100 kg by 2027-06-01', goal: { metric: 'lift', target: 100, reps: 1, by: '2027-06-01' } });
    expect(data().memory[0].goal!.plan).toMatch(/^next: 77\.5 kg × 6 on the first set/);
    const nd = findNudges(data(), today, 9, t, 'en', name).find((x) => x.id.startsWith('goal:'))!;
    expect(nd.title).toMatch(/^Goal set: /);
    expect(nd.body).toMatch(/Next: 77\.5 kg × 6\./);
  });
  it('the planning numbers say where each pace lands by a date, and the main lifts as they are', () => {
    const entries = Array.from({ length: 20 }, (_, i) => entry(addDays(today, -20 + i), 2600));
    useStore.setState({ weights: weighIns(20, 82, 0), entries, sessions: [70, 72.5, 75, 77.5].map((kg, i) => session(addDays(today, -20 + i * 5), [['bench-press', kg, 5]])) });
    const g = goalLines(data(), today, name).join('\n');
    expect(g).toMatch(/Where a pace lands: -0\.25 kg\/week: 81 kg by 2026-11-22, 80 kg by 2026-12-20/);
    expect(g).toMatch(/Main lifts, best set in the last 8 weeks \(estimated max\): Bench Press 77\.5 × 5 \(90\.4 kg\)/);
  });
});

describe('goal words, judge round 4', () => {
  it('a lift target is the weight after its name; "for 12 weeks" is not reps; "in a row" is not a lift', () => {
    expect(goalFromText('Goal: bench press 100 kg by 2027-06-01 at 82 kg bodyweight', undefined, undefined, 'en')).toMatchObject({ metric: 'lift', target: 100, reps: 1 });
    expect(goalFromText('Goal: squat 140 kg for 12 weeks', undefined, undefined, 'en')).toMatchObject({ metric: 'lift', target: 140, reps: 1 });
    expect(goalFromText('Goal: bench 90 kg for 5', undefined, undefined, 'en')).toMatchObject({ metric: 'lift', target: 90, reps: 5 });
    expect(goalFromText('Goal: 82 → 80 kg, weighing in 5 days in a row', undefined, undefined, 'en')).toMatchObject({ metric: 'weight', target: 80 });
  });
});

describe('weigh-ins, judge round 4 second pass', () => {
  it('the age the Coach remembered counts; an adult a little over gets the countdown on Today, more than 2.5 % does not', async () => {
    useStore.setState({ weights: weighIns(20, 82, 0), memory: [{ id: 'a', kind: 'other', text: 'Age: 24 (as of 2026-10-01)', at: 0 }] });
    await act({ type: 'remember', kind: 'goal', text: `Weigh-in: 80 kg class on ${addDays(today, 5)}`, goal: { metric: 'weight', target: 80, by: addDays(today, 5) } });
    expect(data().memory[1].goal).toMatchObject({ metric: 'weight', target: 80 });
    expect(findNudges(data(), today, 9, t, 'en', name).find((x) => x.id.startsWith('goal:'))!.title).toMatch(/^Coming up: 80 kg by /);
    useStore.setState({ memory: [data().memory[0], { ...data().memory[1], goal: { ...data().memory[1].goal!, target: 79 } }] });
    expect(findNudges(data(), today, 9, t, 'en', name).find((x) => x.id.startsWith('goal:'))).toBeUndefined();
  });
});

describe('judge round 5 (26 Oct)', () => {
  it('the habit that breaks a plan, the check-in and a logging promise are worked out by the app', () => {
    // 4 weeks: Fridays at 3,400, other days 2,500
    const entries = Array.from({ length: 28 }, (_, i) => { const date = addDays(today, -28 + i); return entry(date, new Date(`${date}T12:00:00`).getDay() === 5 ? 3400 : 2500); });
    useStore.setState({ weights: weighIns(28, 82, 0), entries });
    expect(goalLines(data(), today, name).join('\n')).toMatch(/What most likely breaks a plan \(last 4 weeks, 28 finished logged days\): Fridays average 3,400 kcal, against 2,500 on the other days, mostly the lunch meal: 3,400 kcal on those days vs 2,500 on the others[^;]*; a cap for those days that still holds a plan: its daily target \+ 300 \([^)]*2,900 at the current 2,600 target\); with it the pace is about 0\.04 kg\/week slower than the row: say the pace with the cap;[^;]*; protein at or above 180 g on 0 of 28 days/);
    useStore.setState({ memory: [{ id: 'g', kind: 'goal', text: 'Goal: 82 → 80 kg', at: 0, goal: { metric: 'weight', target: 80, by: addDays(today, 40), startDate: addDays(today, -3), start: 82 } }] });
    expect(goalLines(data(), today, name).join('\n')).toMatch(/Check-in 2026-11-05 \(every 2 weeks\): the scale's pace under half of what the date needs then → 150 kcal less/);
    useStore.setState({ memory: [{ id: 'p', kind: 'goal', text: 'Log every meal this week', at: 0, goal: { metric: 'other', by: addDays(today, 2), startDate: addDays(today, -3) } }], entries: entries.filter((e) => e.date !== addDays(today, -2)) });
    expect(goalLines(data(), today, name).join('\n')).toMatch(/Logging since it was set \(3 finished days, today not counted\): fully logged 2 of 3; nothing logged: \w{3} 2026-10-23; today has nothing yet\. Verdict \(say it in these words\): Broken on \w{3}; 3 days left including today to finish the rest clean/);
  });
  it('behind on a cut while sleep is off: the app recommends the later date, not fewer calories', () => {
    const pre = weighIns(38, 82, 0).filter((w) => w.date <= addDays(today, -10));
    const entries = [...Array.from({ length: 28 }, (_, i) => entry(addDays(today, -38 + i), 2900)), ...Array.from({ length: 10 }, (_, i) => entry(addDays(today, -10 + i), 2800))];
    const health = Array.from({ length: 37 }, (_, i) => ({ date: addDays(today, -36 + i), sleepMin: i >= 30 ? 360 : 440, hrv: 60 }));
    useStore.setState({ weights: [...pre, ...weighIns(9, 82, 0)], entries, health: health as any, memory: [{ id: 'g', kind: 'goal', text: 'Goal: 82 → 80 kg', at: 0, goal: { metric: 'weight', target: 80, by: addDays(today, 18), startDate: addDays(today, -10), start: 82 } }] });
    const g = goalLines(data(), today, name).join('\n');
    expect(g).toMatch(/STATUS: BEHIND/);
    expect(g).toMatch(/RECOMMEND \(recovery is off: sleep \d+ min under usual\): keep the current target/);
    expect(g).not.toMatch(/the date's [\d.]+ kg\/week = about/);
  });
});

describe('judge round 6 (26 Oct)', () => {
  it('names the habit (late food), the weigh-in cut-off, the promise on Today, and no lifting on a cut', async () => {
    const late = (date: string, kcal: number): FoodEntry => ({ ...entry(date, kcal), mealId: 'snacks', at: new Date(`${date}T21:30:00`).getTime() });
    const entries = Array.from({ length: 28 }, (_, i) => { const date = addDays(today, -28 + i); return new Date(`${date}T12:00:00`).getDay() === 0 ? [entry(date, 2000), late(date, 1500)] : [entry(date, 2100)]; }).flat();
    useStore.setState({ weights: weighIns(28, 82, 0), entries, memory: [{ id: 'a', kind: 'other', text: 'Age: 24 (as of 2026-10-01)', at: 0 }] });
    expect(goalLines(data(), today, name).join('\n')).toMatch(/Sundays average 3,500 kcal, against 2,100 on the other days, mostly food after 21:00: 1,500 kcal on those days vs 0/);
    expect(goalWatchLines(data(), today, name).join('\n')).toMatch(/MUST SAY THIS TURN \(once, with the numbers\): no strength training in the last 2 weeks during a cut/);
    await act({ type: 'remember', kind: 'goal', text: `Weigh-in: 81 kg class on ${addDays(today, 5)}`, goal: { metric: 'weight', target: 81, by: addDays(today, 5) } });
    expect(goalLines(data(), today, name).join('\n')).toMatch(/Cut-off: the morning before \(2026-10-29\) over 81\.5 kg → the next class up/);
    useStore.setState({ memory: [{ id: 'p', kind: 'goal', text: 'Log every meal this week', at: 0, goal: { metric: 'other', by: addDays(today, 2), startDate: addDays(today, -3) } }] });
    expect(findNudges(data(), today, 21, t, 'en', name).find((x) => x.id.startsWith('promise:'))!.title).toBe('Logging promise: 3 of 3 full days');
  });
});

describe('judge round 7 (26 Oct)', () => {
  it('a minor gets no cut watch; a goal reached in the chat shows on Today; a stalled goal says to save its new plan', () => {
    useStore.setState({ weights: weighIns(20, 63, 0), memory: [{ id: 'm', kind: 'other', text: 'In 9th grade.', at: 0 }] });
    expect(goalWatchLines(data(), today, name)).toEqual([]);
    useStore.setState({ memory: [{ id: 'g', kind: 'goal', text: 'Goal: 82 → 81 kg', at: 0, goal: { metric: 'weight', target: 81, startDate: addDays(today, -20), status: 'done', endedOn: today } }] });
    expect(findNudges(data(), today, 9, t, 'en', name).find((x) => x.id === 'goal:g:done')!.title).toBe('Goal reached: 81 kg');
    const kgs = [70, 72.5, 75, 77.5, 77.5, 77.5, 77.5, 77.5, 77.5];
    useStore.setState({ sessions: kgs.map((kg, i) => session(addDays(today, -40 + i * 5), [['bench-press', kg, 5]])), memory: [{ id: 'b', kind: 'goal', text: 'Goal: bench 100', at: 0, exerciseIds: ['bench-press'], goal: { metric: 'lift', target: 100, reps: 1, by: addDays(today, 200), startDate: addDays(today, -12) } }] });
    expect(goalLines(data(), today, name).join('\n')).toMatch(/When you change its plan \(one change\), make it in this answer[^{]*\{"type":"remember","memory":1,"text":"Goal: bench 100","goalPlan":/);
  });
});

describe('judge round 8 (26 Oct)', () => {
  it('a habit on 4 nights a week is named as that, not as the weekend', () => {
    const entries = Array.from({ length: 28 }, (_, i) => { const date = addDays(today, -28 + i); const w = new Date(`${date}T12:00:00`).getDay(); return [0, 2, 4, 5].includes(w) ? [entry(date, 1800), { ...entry(date, 100), mealId: 'snacks' }, { ...entry(date, 1500), mealId: 'snacks', at: new Date(`${date}T21:30:00`).getTime() }] : [entry(date, 1800), { ...entry(date, 100), mealId: 'snacks' }]; }).flat();
    useStore.setState({ weights: weighIns(28, 75, 0), entries });
    expect(goalLines(data(), today, name).join('\n')).toMatch(/4 days a week \(Sun, Tue, Thu, Fri\) average 3,400 kcal, against 1,900 on the other days, mostly food after 21:00/);
  });
});

describe('a goal closed and saved again in the same answer', () => {
  it('stays closed', async () => {
    useStore.setState({ weights: weighIns(20, 82.5, -0.3), memory: [{ id: 'g', kind: 'goal', text: 'Goal: 82 → 81 kg by 2026-10-26', at: 0, goal: { metric: 'weight', target: 81, by: '2026-10-26', startDate: addDays(today, -20), start: 82.2 } }] });
    await runActions(validateAgent({ reply: '', actions: [{ type: 'remember', kind: 'goal', replaces: 1, text: 'Goal: 82 → 81 kg by 2026-10-26 (reached 80.7 kg)' }, { type: 'remember', kind: 'goal', replaces: 1, text: 'Goal: 82 → 81 kg by 2026-10-26' }] })!.actions, ctx());
    expect(data().memory).toHaveLength(1);
    expect(data().memory[0].goal).toMatchObject({ status: 'done', startDate: addDays(today, -20) });
  });
});

describe('judge round 9 (26 Oct)', () => {
  it("a date's own pace has its calories, the habit comes with how to hold its cap, and a promise shows on Today the day it is set", () => {
    const entries = Array.from({ length: 28 }, (_, i) => { const date = addDays(today, -28 + i); return entry(date, new Date(`${date}T12:00:00`).getDay() === 5 ? 3400 : 2500); });
    useStore.setState({ weights: weighIns(28, 82, 0), entries });
    const g = goalLines(data(), today, name).join('\n');
    expect(g).toMatch(/every 0\.05 kg\/week, then kcal a day: [^)]*\+0\.3 2,960, \+0\.35 3,020/);
    expect(g).toMatch(/HOW to hold that cap \(say it next to the cap\): that lunch meal plated once at about 2,700 kcal/);
    expect(g).toMatch(/with the comfortable one as the recommended default \(no question about which\)/);
    useStore.setState({ memory: [{ id: 'p', kind: 'goal', text: 'Promise: log every meal this week', at: 0, goal: { metric: 'other', by: addDays(today, 6), startDate: today } }] });
    const nd = findNudges(data(), today, 9, t, 'en', name).find((x) => x.id.startsWith('promise:'))!;
    expect(nd.title).toBe('Logging promise: starts today');
    expect(nd.body).toBe('7 days including today. Log each meal when you eat it.');
  });
});

describe('judge round 10 (26 Oct)', () => {
  it('a gain plan is told the ordinary days are its risk, and a full-body routine sent without exercises still builds', async () => {
    const entries = Array.from({ length: 28 }, (_, i) => { const date = addDays(today, -28 + i); return entry(date, new Date(`${date}T12:00:00`).getDay() === 5 ? 3400 : 2500); });
    useStore.setState({ weights: weighIns(28, 82, 0), entries });
    expect(goalLines(data(), today, name).join('\n')).toMatch(/On a GAIN plan this cap doesn't apply \(the big days aren't the risk\): the other days average 2,500, under a gain target; the how for those days, for the row the plan picks \(its numbers add up to the gap\): \+0\.25 \([\d,]+\): \d{3} more = one shake or snack of about \d{3}/);
    const r = await act({ type: 'create_routine', name: 'Full Body B' });
    expect(r.kind).toBe('routine');
    expect(r.lines.length).toBeGreaterThanOrEqual(3);
  });
  it('gaining too fast: the meal the extra comes from and protein far over its range must be said', () => {
    // 4 weeks before at 2,600 (lunch 2,000 + dinner 600); since the goal: dinner up to 1,600 and protein 260 g
    const mk = (date: string, meal: string, kcal: number, protein: number): FoodEntry => ({ ...entry(date, kcal, protein), mealId: meal, snap: { name: meal === 'dinner' ? 'Pizza' : 'food', basis: 'g', per100: { kcal } } as any });
    const entries = [...Array.from({ length: 28 }, (_, i) => addDays(today, -35 + i)).flatMap((dt) => [mk(dt, 'lunch', 2000, 90), mk(dt, 'dinner', 600, 60)]),
      ...Array.from({ length: 7 }, (_, i) => addDays(today, -7 + i)).flatMap((dt) => [mk(dt, 'lunch', 2000, 140), mk(dt, 'dinner', 1600, 120)])];
    useStore.setState({ weights: [...weighIns(35, 80, 0).filter((w) => w.date <= addDays(today, -7)), ...weighIns(7, 80, 0.9)], entries, settings: { ...data().settings, goals: { ...data().settings.goals, kcal: 2900 } },
      memory: [{ id: 'g', kind: 'goal', text: 'Goal: 80 → 82 kg', at: 0, goal: { metric: 'weight', target: 82, by: addDays(today, 50), startDate: addDays(today, -7), start: 80 } }] });
    const g = goalLines(data(), today, name).join('\n');
    expect(g).toMatch(/MUST SAY THIS TURN: they eat about [\d,]+ kcal a day, about [\d,]+ over what the date needs; the most extra comes from the dinner meal: 1,600 kcal a day since the goal started vs 600 before it \(biggest: Pizza/);
    expect(g).toMatch(/protein 260 g a day, \d+ g over the top of its range/);
    expect(g).toMatch(/The fix, adding up to that gap: protein down to about \d+ g \(e\.g\. one shake fewer\), about −\d+ kcal, carbs kept \(they fuel training\)/);
  });
});

describe('judge round 12 (26 Oct)', () => {
  it('big days 3+ times a week: their cap is the target itself, not +300', () => {
    const entries = Array.from({ length: 28 }, (_, i) => { const date = addDays(today, -28 + i); return entry(date, [0, 2, 5].includes(new Date(`${date}T12:00:00`).getDay()) ? 3400 : 2500); });
    useStore.setState({ weights: weighIns(28, 82, 0), entries });
    expect(goalLines(data(), today, name).join('\n')).toMatch(/they come 3 days a week, so their cap is the daily target itself \(\+300 on them would cut the pace by about 0\.12 kg\/week and miss the date\)/);
  });
});

describe('goal words in other wordings (Gemini Pro and Gemini 4 Argon, 26 Oct)', () => {
  const acts = async (list: Record<string, unknown>[]) => runActions(validateAgent({ reply: '', actions: list })!.actions, ctx());
  it('"+2 kg (to 83.7 kg)", "down to 80 kg" and "−2 kg" are bodyweight goals; a pace per week is not one', () => {
    useStore.setState({ weights: weighIns(7, 81.7, 0) });
    expect(goalFromText('Goal: +2 kg (to 83.7 kg) by 2026-12-01, about 0.3 kg a week', undefined, undefined, 'en', today)).toMatchObject({ metric: 'weight', target: 83.7, by: '2026-12-01' });
    expect(goalFromText('Goal: down to 80 kg by 2026-12-01', undefined, undefined, 'en', today)).toMatchObject({ metric: 'weight', target: 80 });
    expect(goalFromText('Goal: −2 kg by 2026-12-01', undefined, undefined, 'en', today)).toMatchObject({ metric: 'weight', delta: -2 });
    expect(goalFromText('Goal: leaner, -0.5 kg a week by 2026-12-01', undefined, undefined, 'en', today)).toMatchObject({ metric: 'other' });
  });
  it('a date said in words: this week to its Sunday, summer, Christmas, a weekday, a month; a range ends on its last date', () => {
    // (today is a Sunday)
    expect(goalFromText('Log every meal this week, no skipping dinner.', undefined, undefined, 'en', today)).toMatchObject({ metric: 'other', by: today });
    expect(goalFromText('Log every meal this week', undefined, undefined, 'en', '2026-10-19')).toMatchObject({ by: '2026-10-25' });
    expect(goalFromText('Goal: Barbell Bench Press 100 kg by summer', undefined, undefined, 'en', today)).toMatchObject({ metric: 'lift', target: 100, by: '2027-06-01' });
    expect(goalFromText('Goal: lose 3 kg by Christmas', undefined, undefined, 'en', today)).toMatchObject({ delta: -3, by: '2026-12-24' });
    expect(goalFromText('Goal: log every meal by Friday', undefined, undefined, 'en', today)).toMatchObject({ by: '2026-10-30' });
    expect(goalFromText('Goal: lose 2 kg by December', undefined, undefined, 'en', today)).toMatchObject({ by: '2026-12-01' });
    expect(goalFromText('Goal: log every meal including dinner every day this week (2026-10-19 to 2026-10-25)', undefined, undefined, 'en', today)).toMatchObject({ by: '2026-10-25' });
    expect(goalFromText('I may want to cut later', undefined, undefined, 'en', today)).toBeUndefined();
  });
  it('a "this week" promise is a goal with its week, so Today shows it', async () => {
    useStore.setState({ memory: [] });
    const [r] = await acts([{ type: 'remember', kind: 'goal', text: 'Log every meal this week, no skipping dinner.' }]);
    expect(r.title).toBe('Goal set');
    expect(data().memory[0].goal).toMatchObject({ metric: 'other', by: today });
  });
  it('a weigh-in in a class above, saved beside the gain: a date to remember, not a second goal', async () => {
    useStore.setState({ weights: weighIns(14, 81.7, 0), memory: [] });
    const r = await acts([
      { type: 'remember', kind: 'goal', text: 'Goal: +2 kg (to 83.7 kg) by 2026-12-01, about 0.3 kg a week' },
      { type: 'remember', kind: 'goal', text: 'Weigh-in: 86 kg class on 2026-12-01' },
    ]);
    expect(r.map((x) => x.title)).toEqual(['Goal set', 'Remembered']);
    const [gain, wi] = data().memory;
    expect(gain.goal).toMatchObject({ metric: 'weight', target: 83.7, by: '2026-12-01' });
    expect(wi).toMatchObject({ kind: 'schedule', until: '2026-12-01' });
    expect(wi.goal).toBeUndefined();
  });
  it('the same action twice in one answer is done once', async () => {
    useStore.setState({ memory: [] });
    const r = await acts([{ type: 'remember', kind: 'preference', text: 'Likes morning sessions' }, { type: 'remember', kind: 'preference', text: 'Likes morning sessions' }]);
    expect(r).toHaveLength(1);
  });
});

describe('what the reply says, kept when the actions leave it out (26 Oct)', () => {
  it('a routine change named with a lift word; a goal plan from the sentence that gives it', async () => {
    const { changeFromReply, fillFromReply } = await import('../src/lib/agent');
    const push = { name: 'Push', items: [{ id: 'i1', exerciseId: 'bench-press', workingSets: 3, repMin: 8, repMax: 12 }] as any[] };
    expect(changeFromReply('In Push, bench is now set to 4 × 3–5.', push, () => 'Barbell Bench Press', () => 'bench-press')).toEqual([{ exercise: 'Barbell Bench Press', sets: 4, repMin: 3, repMax: 5 }]);
    const reply = 'It\'s stalled. Instead of chasing the 6th rep, the change for the next 4 weeks is a 4th set at 77.5 kg (4 × 5–8). I have saved this updated plan to your goal.';
    const [a] = fillFromReply(reply, [{ type: 'remember', kind: 'goal', text: 'Goal: Barbell Bench Press 100 kg', replaces: 4 }]);
    expect(a).toMatchObject({ plan: 'Instead of chasing the 6th rep, the change for the next 4 weeks is a 4th set at 77.5 kg (4 × 5–8).' });
    // (no plan said to be changed: nothing is added)
    expect(fillFromReply('Keep going: 77.5 × 6 next time.', [{ type: 'remember', kind: 'goal', text: 'Goal: bench 100', replaces: 4 }])[0]).not.toHaveProperty('plan');
  });
});

describe('a routine change in a sentence that names no exercise (Flash, 26 Oct)', () => {
  it('is about the one exercise of the routine the reply talks about', async () => {
    const { changeFromReply, fillFromReply } = await import('../src/lib/agent');
    const push = { name: 'Push', items: [{ id: 'i1', exerciseId: 'bench-press', workingSets: 3, repMin: 8, repMax: 12 }, { id: 'i2', exerciseId: 'ohp', workingSets: 3, repMin: 8, repMax: 12 }] as any[] };
    const reply = 'Your best set is stuck at 77.5 kg × 5 across your last 10 bench sessions. For the next 4 weeks, the plan is 4 sets of 4–6 reps at 77.5 kg. I have updated Push so the workout screen tracks 4 sets of 4–6.';
    const nameOf = (id: string) => (id === 'ohp' ? 'Overhead Press' : 'Barbell Bench Press');
    expect(changeFromReply(reply, push, nameOf, (w) => (/bench/i.test(w) ? 'bench-press' : undefined))).toEqual([{ exercise: 'Barbell Bench Press', sets: 4, repMin: 4, repMax: 6 }]);
    expect(changeFromReply(reply.replace('bench', 'bench and overhead press'), push, nameOf, (w) => (/bench/i.test(w) ? 'bench-press' : /overhead/i.test(w) ? 'ohp' : undefined))).toEqual([]);
    expect(fillFromReply(reply, [{ type: 'remember', kind: 'goal', text: 'Goal: bench 100', replaces: 4 }])[0]).toMatchObject({ plan: 'For the next 4 weeks, the plan is 4 sets of 4–6 reps at 77.5 kg.' });
  });
});

describe('word dates only as deadlines (judge, 26 Oct)', () => {
  it('"on Monday mornings" is no date; "next Sunday" on a Sunday is a week away; a lift "to 90 kg" is no bodyweight', () => {
    expect(goalFromText('Goal: weigh in on Monday mornings', undefined, undefined, 'en', today)).toBeUndefined();
    expect(goalFromText('Log every meal until next Sunday', undefined, undefined, 'en', today)).toMatchObject({ by: '2026-11-01' });
    useStore.setState({ weights: weighIns(7, 82, 0) });
    expect(goalFromText('Goal: power clean to 90 kg by 2027-01-01', undefined, undefined, 'en', today)?.metric).not.toBe('weight');
  });
});

describe('routine change from a change sentence; an unclaimed empty edit is dropped (Flash, 26 Oct)', () => {
  it('"add a 4th working set (4 × 5), then push to 4 × 6" is 4 × 5–6; "77.5 × 6" is a weight, not sets', async () => {
    const { changeFromReply } = await import('../src/lib/agent');
    const push = { name: 'Push', items: [{ id: 'i1', exerciseId: 'bench-press', workingSets: 3, repMin: 8, repMax: 12 }] as any[] };
    const nameOf = () => 'Barbell Bench Press';
    const idOf = (w: string) => (/bench/i.test(w) ? 'bench-press' : undefined);
    expect(changeFromReply('Your bench is stuck. I have updated your plan: stay at 77.5 kg and add a 4th working set (4 × 5), then push to 4 × 6 before stepping up to 80 kg.', push, nameOf, idOf)).toEqual([{ exercise: 'Barbell Bench Press', sets: 4, repMin: 5, repMax: 6 }]);
    expect(changeFromReply('Your bench is stuck. Now aim for 77.5 × 6 next time.', push, nameOf, idOf)).toEqual([]);
  });
  it('an empty edit the reply never mentions makes no card', async () => {
    const { fillFromReply } = await import('../src/lib/agent');
    expect(fillFromReply('Keep going.', [{ type: 'edit_routine', routine: 'Push', add: [], change: [], remove: [] }])).toEqual([]);
    expect(fillFromReply('I have updated your Push routine.', [{ type: 'edit_routine', routine: 'Push', add: [], change: [], remove: [] }])).toHaveLength(1);
  });
});
