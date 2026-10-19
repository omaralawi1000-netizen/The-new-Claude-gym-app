// @vitest-environment jsdom
// The heavy-day watcher (review round 1, 19 Oct), with a stand-in brain: a heavy day is decided ONCE (more food that day
// never asks again), fitted to the day as it is when the answer comes, undone when the log is corrected, quiet or off
// when asked, and the first run on a phone never pops up about the past.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let answer: any = null;
let calls = 0;
let hold: Promise<void> | null = null;
vi.mock('../src/lib/agentTurn', () => ({ brainFor: () => ({ sol: { key: 'k', effort: 'medium' }, models: [] }) }));
vi.mock('../src/lib/brain', () => ({ thinkJson: async () => { calls++; if (hold) await hold; return answer; } }));

import { useStore } from '../src/state/store';
import { useUI } from '../src/state/ui';
import { defaultData } from '../src/state/defaults';
import { checkEating } from '../src/lib/eatingWatch';
import { catchUpOn, heavyNow, justNoticed, kcalTargetFor, markCoachTold } from '../src/lib/eating';
import { addDays } from '../src/lib/dates';
import type { AppData, FoodEntry } from '../src/lib/types';

const today = '2026-10-19', yesterday = '2026-10-18';
const MORNING = new Date(2026, 9, 19, 9, 0).getTime();
let n = 0;
const entry = (date: string, kcal: number, at: number, id = `e${n++}`): FoodEntry => ({ id, date, mealId: 'dinner', at, snap: { name: 'food', basis: 'g', per100: { kcal } } as any, qty: { amount: 100, unit: 'g' } as any, base: 100, nutrients: { kcal, protein: 20 } });
const data = () => useStore.getState() as unknown as AppData;
const toasts = () => useUI.getState().toasts.map((x) => x.text);
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 10; i++) await Promise.resolve(); };
const bigYesterday = (extra = 2000) => useStore.setState({ entries: [entry(yesterday, 2500, new Date(2026, 9, 18, 13).getTime()), entry(yesterday, extra, MORNING - 3600e3, 'big')] });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MORNING);
  localStorage.clear();
  answer = { plan: 'trim', perDay: 200, days: 3, line: 'Yesterday +2,000. Mostly water. −200 a day for 3 days.', why: 'Rare, but the trend has stalled.' };
  calls = 0; hold = null;
  const d = defaultData(); d.settings.onboarded = true; d.settings.dayStartHour = 0; d.settings.goals.kcal = 2500; d.settings.goals.protein = 180;
  d.settings.profile.goal = 'fatloss';
  d.memory = [{ id: 'age', text: 'Age: 24 (as of 2026-01-01)', kind: 'other', at: 0 }];
  d.marks = { heavySeen: '2026-10-01' }; // (not the first run on this phone)
  useStore.getState().replaceAll(d);
  useUI.setState({ toasts: [] });
});
afterEach(() => { vi.useRealTimers(); });

describe('decided once', () => {
  it('a heavy day: one decision, one pop-up with the brain\'s line, the trim running from today', async () => {
    bigYesterday();
    checkEating(MORNING); await settle();
    expect(calls).toBe(1);
    expect(toasts()).toEqual(['Yesterday +2,000. Mostly water. −200 a day for 3 days.']);
    expect(kcalTargetFor(data(), today)).toBe(2300);
    // more eaten that day later: the amount follows, nothing is asked or said again
    useStore.setState((s) => ({ entries: [...s.entries, entry(yesterday, 300, MORNING + 60e3)] }));
    checkEating(MORNING + 120e3); await settle();
    expect(calls).toBe(1);
    expect(toasts()).toHaveLength(1);
    expect(data().catchUps![0].over).toBe(2300);
  });
  it('the brain asks for too much: the limits hold and the pop-up says what really happens', async () => {
    answer = { plan: 'trim', perDay: 600, days: 6, line: '−600 a day for 6 days', why: '' };
    bigYesterday();
    checkEating(MORNING); await settle();
    expect(kcalTargetFor(data(), today)).toBe(2250);
    expect(toasts()[0]).toBe('+2,000 kcal over. Mostly water on the scale. A small trim: −250 kcal a day for 4 days, protein stays.');
  });
  it('no brain answer: no cut, said straight', async () => {
    answer = null;
    bigYesterday();
    checkEating(MORNING); await settle();
    expect(kcalTargetFor(data(), today)).toBe(2500);
    expect(toasts()[0]).toMatch(/no cut/);
  });
  it('a trim not allowed (age unknown, or a teen): no paid call, no cut', async () => {
    useStore.setState({ memory: [] });
    bigYesterday();
    checkEating(MORNING); await settle();
    expect(calls).toBe(0);
    expect(kcalTargetFor(data(), today)).toBe(2500);
    expect(toasts()[0]).toMatch(/no cut/);
  });
  it('the day changes while it thinks: the plan is fitted to the day as it is when the answer comes', async () => {
    let go!: () => void; hold = new Promise((r) => { go = r; });
    answer = { plan: 'trim', perDay: 250, days: 4, line: 'Yesterday +2,000: −250 a day for 4 days.', why: '' };
    bigYesterday();
    checkEating(MORNING); await settle();
    // most of it was a typo: 2,000 → 900 (still heavy: +900)
    useStore.setState((s) => ({ entries: s.entries.map((e) => (e.id === 'big' ? { ...e, nutrients: { ...e.nutrients, kcal: 900 } } : e)) }));
    checkEating(MORNING + 30e3);
    go(); await settle();
    const c = data().catchUps![0];
    expect(c.over).toBe(900);
    expect(c.perDay * c.days.length).toBeLessThanOrEqual(450); // half of it, at most
    expect(toasts().at(-1)).toMatch(/^\+900 kcal over/); // (never the old number)
  });
});

describe('corrections', () => {
  it('the big entry deleted: the cut is gone and that is said once', async () => {
    bigYesterday();
    checkEating(MORNING); await settle();
    useStore.setState((s) => ({ entries: s.entries.filter((e) => e.id !== 'big') }));
    checkEating(MORNING + 60e3); await settle();
    // (kept with no cut, so logging it again a minute later is the same evening: never asked or said twice)
    expect(data().catchUps).toMatchObject([{ gone: true, perDay: 0 }]);
    expect(kcalTargetFor(data(), today)).toBe(2500);
    expect(toasts().at(-1)).toBe('Your normal calorie target is back');
    useStore.setState((s) => ({ entries: [...s.entries, entry(yesterday, 2000, MORNING + 120e3, 'big2')] }));
    checkEating(MORNING + 180e3); await settle();
    expect(calls).toBe(1);
    expect(toasts().filter((x) => x !== 'Your normal calorie target is back')).toHaveLength(1);
    expect(kcalTargetFor(data(), today)).toBe(2500);
  });
  it('a smaller day: the trim shrinks to fit, without a new pop-up', async () => {
    answer = { plan: 'trim', perDay: 250, days: 4, line: 'x', why: '' };
    bigYesterday(2000);
    checkEating(MORNING); await settle();
    expect(catchUpOn(data(), today)).toMatchObject({ perDay: 250, left: 4 });
    useStore.setState((s) => ({ entries: s.entries.map((e) => (e.id === 'big' ? { ...e, nutrients: { ...e.nutrients, kcal: 900 } } : e)) }));
    checkEating(MORNING + 60e3); await settle();
    const c = data().catchUps![0];
    expect(c.perDay * c.days.filter((x) => x >= today).length).toBeLessThanOrEqual(450);
    expect(toasts()).toHaveLength(1);
  });
});

describe('quiet, off, and the past', () => {
  it('quiet: recorded, nothing said or changed, no paid call', async () => {
    useStore.getState().updateSettings({ heavyDays: 'quiet' });
    bigYesterday();
    checkEating(MORNING); await settle();
    expect(calls).toBe(0);
    expect(toasts()).toEqual([]);
    expect(data().catchUps![0]).toMatchObject({ decided: true, perDay: 0 });
    expect(kcalTargetFor(data(), today)).toBe(2500);
  });
  it('off: nothing recorded', async () => {
    useStore.getState().updateSettings({ heavyDays: 'off' });
    bigYesterday();
    checkEating(MORNING); await settle();
    expect(data().catchUps).toEqual([]);
  });
  it('the first run on a phone: what is there is seen silently; only later days are decided', async () => {
    useStore.setState({ marks: {} });
    bigYesterday();
    checkEating(MORNING); await settle();
    expect(calls).toBe(0);
    expect(toasts()).toEqual([]);
    expect(data().catchUps![0]).toMatchObject({ decided: true, perDay: 0 });
    expect(data().marks?.heavySeen).toBe(today);
  });
  it('switching notices on never pops up about the days before', async () => {
    useStore.getState().updateSettings({ heavyDays: 'off' });
    bigYesterday();
    useStore.getState().updateSettings({ heavyDays: 'on' });
    checkEating(MORNING); await settle();
    expect(calls).toBe(0);
    expect(data().catchUps).toEqual([]);
  });
  it('01:00 with the day starting at 04:00 is still that evening', () => {
    useStore.getState().updateSettings({ dayStartHour: 4 });
    const late = new Date(2026, 9, 20, 1, 0).getTime(); // (still 19 Oct in the app)
    useStore.setState({ entries: [entry(today, 2500, MORNING), entry(today, 1200, late - 600e3)] });
    expect(heavyNow(data(), late).map((h) => h.date)).toEqual([today]);
  });
});

describe('the Coach is told once', () => {
  it('only what it was told, and only once said', async () => {
    bigYesterday();
    checkEating(MORNING); await settle();
    const ids = justNoticed(data(), today).map((c) => c.id);
    expect(ids).toHaveLength(1);
    markCoachTold(data(), useStore.getState().setCatchUps, []);
    expect(justNoticed(data(), today)).toHaveLength(1);
    markCoachTold(data(), useStore.getState().setCatchUps, ids);
    expect(justNoticed(data(), today)).toEqual([]);
  });
});

describe('random days', () => {
  it('adding, deleting and changing the target in any order: one decision a day at most, the limits hold, all deleted = nothing running', async () => {
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let run = 0; run < 25; run++) {
      const d = defaultData(); d.settings.onboarded = true; d.settings.dayStartHour = 0; d.settings.goals.kcal = 2500; d.settings.profile.goal = 'fatloss';
      d.memory = [{ id: 'age', text: 'Age: 30 (as of 2026-01-01)', kind: 'other', at: 0 }]; d.marks = { heavySeen: '2026-10-01' };
      useStore.getState().replaceAll(d); useUI.setState({ toasts: [] }); calls = 0;
      answer = { plan: 'trim', perDay: Math.round(rnd() * 800), days: 1 + Math.floor(rnd() * 8), line: 'x', why: '' };
      let t = MORNING;
      for (let step = 0; step < 12; step++) {
        const r = rnd(); t += 60e3;
        if (r < 0.5) useStore.setState((s) => ({ entries: [...s.entries, entry(addDays(today, -Math.floor(rnd() * 3)), Math.round(rnd() * 2500), t)] }));
        else if (r < 0.8) useStore.setState((s) => ({ entries: s.entries.filter((_, i) => i !== Math.floor(rnd() * s.entries.length)) }));
        else { const s = useStore.getState(); s.updateSettings({ goals: { ...s.settings.goals, kcal: 2000 + Math.round(rnd() * 1500) } }); }
        checkEating(t); await settle();
        const base = data().settings.goals.kcal!;
        for (const day of [today, addDays(today, 1), addDays(today, 2)]) {
          const k = kcalTargetFor(data(), day)!;
          expect(k).toBeLessThanOrEqual(base);
          expect(base - k).toBeLessThanOrEqual(250);
        }
        const dates = (data().catchUps ?? []).map((c) => c.date);
        expect(new Set(dates).size).toBe(dates.length);
      }
      const decided = (data().catchUps ?? []).length;
      expect(calls).toBeLessThanOrEqual(decided + 3); // (a day deleted and heavy again is a new day to decide)
      useStore.setState({ entries: [] });
      checkEating(t + 60e3); await settle();
      expect(kcalTargetFor(data(), today)).toBe(data().settings.goals.kcal);
    }
  });
});
