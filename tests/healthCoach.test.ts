// @vitest-environment jsdom
// Health built around the Coach (26 Oct, step 1): the Coach's line on top reads the same ranking as Today's pin (goals and
// app chores left out), overeating on a cut is said with its own days and wins exactly when the Coach must say it, and the
// goal card's "too early" says the one thing that helps.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { healthNote, overNote, rankNotes } from '../src/lib/nudges';
import { goalState, holdKcal } from '../src/lib/goals';
import { usualSleep } from '../src/lib/recovery';
import { makeT } from '../src/lib/i18n';
import { addDays } from '../src/lib/dates';
import type { AppData, FoodEntry, MemoryNote } from '../src/lib/types';

const t = makeT('en') as any;
const today = '2026-10-25';
const NOON = new Date(2026, 9, 25, 13, 0).getTime();
const data = () => useStore.getState() as unknown as AppData;
const ex = (id: string) => id;
let n = 0;
const entry = (date: string, kcal: number, protein = 180): FoodEntry => ({ id: `e${n++}`, date, mealId: 'lunch', at: new Date(`${date}T12:00:00`).getTime(), snap: { name: 'food', basis: 'g', per100: { kcal } } as any, qty: { amount: 100, unit: 'g' } as any, base: 100, nutrients: { kcal, protein } });
/** a full day: breakfast, lunch and dinner, so it is a finished log */
const day = (date: string, kcal: number, protein = 180): FoodEntry[] => [0.25, 0.35, 0.4].map((f, i) => ({ ...entry(date, Math.round(kcal * f), Math.round(protein * f)), mealId: ['breakfast', 'lunch', 'dinner'][i], at: new Date(`${date}T${['08', '13', '19'][i]}:00:00`).getTime() }));
const week = (kcals: number[], protein = 180) => kcals.flatMap((k, i) => day(addDays(today, i - kcals.length), k, protein));
const goal = (g: Partial<NonNullable<MemoryNote['goal']>>): MemoryNote => ({ id: 'g1', kind: 'goal', text: 'Goal: 79.5 kg', at: 0, goal: { metric: 'weight', target: 79.5, ...g } as any } as MemoryNote);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
  localStorage.clear();
  const d = defaultData('en'); d.settings.onboarded = true; d.settings.dayStartHour = 0; d.settings.goals.kcal = 2300; d.settings.goals.protein = 180;
  d.settings.profile.goal = 'fatloss';
  useStore.getState().replaceAll(d);
});
afterEach(() => { vi.useRealTimers(); });

describe('overeating on a cut, said with its days', () => {
  it('A: 2+ heavy days of the last 7, with the target and the margin it was judged by', () => {
    useStore.setState({ entries: week([2250, 3150, 3400, 2900, 2200, 2300, 2280]) });
    const o = overNote(data(), today, t, 'en')!;
    expect(o.id).toMatch(/^over:/);
    expect(o.priority).toBe(58);
    expect(o.say!.x).toBe('3 of the last 7 days');
    expect(o.say!.tpl).toMatch(/^On \{x\} you went 600\+ over your 2,300 target: \w+ 3,150, \w+ 3,400, \w+ 2,900\.$/);
  });

  it('B: a steady few hundred over, not heavy, said as the average of the days logged', () => {
    useStore.setState({ entries: week([2500, 2550, 2450, 2600, 2500, 2480]) });
    const o = overNote(data(), today, t, 'en')!;
    expect(o.say!.tpl).toMatch(/^Your 6 fully logged days of the last 7 averaged \{x\}, about 210 over your 2,300 target\.$/);
    expect(o.say!.x).toBe('2,510 kcal');
  });

  it('nothing when on plan, when heavy days are switched off, or when not cutting', () => {
    useStore.setState({ entries: week([2250, 2300, 2350, 2280, 2200, 2310, 2290]) });
    expect(overNote(data(), today, t, 'en')).toBeUndefined();
    useStore.setState({ entries: week([2250, 3150, 3400, 2900, 2200, 2300, 2280]) });
    useStore.setState((s) => ({ settings: { ...s.settings, heavyDays: 'off' } }));
    expect(overNote(data(), today, t, 'en')).toBeUndefined();
    useStore.setState((s) => ({ settings: { ...s.settings, heavyDays: undefined, profile: { ...s.settings.profile, goal: 'muscle' } } }));
    expect(overNote(data(), today, t, 'en')).toBeUndefined();
  });

  it('quiet heavy days stay quiet, and a bulk with no start weight is never read as a cut', () => {
    useStore.setState({ entries: week([2250, 3150, 3400, 2900, 2200, 2300, 2280]) });
    useStore.setState((s) => ({ settings: { ...s.settings, heavyDays: 'quiet' } }));
    expect(overNote(data(), today, t, 'en')).toBeUndefined();
    useStore.setState((s) => ({ settings: { ...s.settings, heavyDays: undefined }, weights: [{ id: 'w', date: addDays(today, -1), kg: 70, at: 0 }], memory: [goal({ target: 74, startDate: addDays(today, -10), by: addDays(today, 60) })] }));
    expect(overNote(data(), today, t, 'en')).toBeUndefined();
  });

  it('wins over protein, and over a stall, exactly when the Coach must say it (a weight goal behind, with big days)', () => {
    const weights = Array.from({ length: 29 }, (_, i) => ({ id: `w${i}`, date: addDays(today, i - 28), kg: 82.1, at: 0 }));
    useStore.setState({ weights, entries: week([2250, 3150, 3400, 2900, 2200, 2300, 2280], 120), memory: [goal({ start: 83.3, startDate: addDays(today, -28), by: addDays(today, 27) })] });
    const st = goalState(data(), data().memory[0], today)!;
    expect(st.pace).toBe('behind');
    const o = overNote(data(), today, t, 'en')!;
    expect(o.priority).toBe(72);
    const list = rankNotes(data(), today, 13, t, 'en', ex, []);
    expect(list[0].id).toMatch(/^goal:/);
    expect(healthNote(list)!.id).toMatch(/^over:/);
  });
});

describe("the Coach's line reads Today's ranking", () => {
  it('skips goals and app chores, and is the first of the rest (the same list Today shows)', () => {
    useStore.setState({ entries: week([2300, 2300, 2300, 2300], 120) });
    const list = rankNotes(data(), today, 13, t, 'en', ex, []);
    const pick = healthNote(list)!;
    expect(pick.id).toMatch(/^protein:/);
    expect(list.find((x) => !x.id.startsWith('goal:') && x.id !== 'goal-ask' && x.kind !== 'app')).toBe(pick);
    expect(pick.say!.tpl).toBe('Protein averaged {x} over the last 4 days, against 180.');
    expect(pick.say!.x).toBe('120 g');
  });

  it('a note set aside on Today is gone from Health too, and Coach notes switched off leave only the night', () => {
    useStore.setState({ entries: week([2300, 2300, 2300, 2300], 120) });
    const id = healthNote(rankNotes(data(), today, 13, t, 'en', ex, []))!.id;
    localStorage.setItem('aven.nudges', JSON.stringify({ [id]: 9e15 }));
    expect(healthNote(rankNotes(data(), today, 13, t, 'en', ex, []))?.id).not.toBe(id);
    useStore.setState((s) => ({ settings: { ...s.settings, coachPins: false } }));
    expect(rankNotes(data(), today, 13, t, 'en', ex, [])).toEqual([]);
  });

  it("the once-a-day insight takes part from its cache, at the Coach's own priority", () => {
    const list = rankNotes(data(), today, 13, t, 'en', ex, [{ kind: 'warning', title: 'Your sleep has slipped', body: 'x', ask: 'y' }]);
    expect(healthNote(list)!.title).toBe('Your sleep has slipped');
    expect(healthNote(list)!.priority).toBe(66);
  });
});

describe('the goal card', () => {
  it('too early says why as a code, so the card never offers food logging where food cannot count', () => {
    useStore.setState({ memory: [goal({ startDate: today, by: addDays(today, 30) })] });
    expect(goalState(data(), data().memory[0], today)!.whyCode).toBe('noWeighIns');
    useStore.setState({ weights: [{ id: 'w', date: addDays(today, -20), kg: 82, at: 0 }] });
    expect(goalState(data(), data().memory[0], today)!.whyCode).toBe('stale');
  });

  it('holding a reached goal: nothing for a goal not reached', () => {
    useStore.setState({ weights: [{ id: 'w', date: today, kg: 82, at: 0 }], memory: [goal({ startDate: today, by: addDays(today, 30) })] });
    expect(holdKcal(data(), goalState(data(), data().memory[0], today)!, today)).toBeUndefined();
  });
});

describe('usual sleep, one definition', () => {
  it('the median of the 30 nights before today, 3 at least', () => {
    const h = (i: number, m: number) => ({ date: addDays(today, -i), sleepMin: m });
    expect(usualSleep([h(1, 400), h(2, 420)] as any, today)).toBeUndefined();
    expect(usualSleep([h(0, 300), h(1, 400), h(2, 420), h(3, 440), h(40, 100)] as any, today)).toBe(420);
  });
});
