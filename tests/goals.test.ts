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
