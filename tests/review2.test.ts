// @vitest-environment jsdom
// The final code review (19 Oct): each confirmed finding as the behaviour it should have, now that it is fixed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let answer: any = null;
let calls = 0;
let hold: Promise<void> | null = null;
vi.mock('../src/lib/agentTurn', () => ({ brainFor: () => ({ sol: { key: 'k', effort: 'medium' }, models: [] }) }));
vi.mock('../src/lib/brain', () => ({ thinkJson: async () => { calls++; if (hold) await hold; return answer; } }));

import { useStore } from '../src/state/store';
import { useUI } from '../src/state/ui';
import { useAi } from '../src/state/ai';
import { defaultData } from '../src/state/defaults';
import { checkEating } from '../src/lib/eatingWatch';
import { ageFromMemory, eatingLines, kcalTargetFor } from '../src/lib/eating';
import { oddWeighIns } from '../src/lib/dataQuality';
import { trueMaintenance } from '../src/lib/maintenance';
import { validateAgent, runActions } from '../src/lib/agent';
import { makeT } from '../src/lib/i18n';
import { addDays } from '../src/lib/dates';
import type { AppData, FoodEntry } from '../src/lib/types';

const t = makeT('en') as any;
const today = '2026-10-19', yesterday = '2026-10-18';
const MORNING = new Date(2026, 9, 19, 9, 0).getTime();
let n = 0;
const entry = (date: string, kcal: number, at: number, id = `e${n++}`): FoodEntry => ({ id, date, mealId: 'dinner', at, snap: { name: 'food', basis: 'g', per100: { kcal } } as any, qty: { amount: 100, unit: 'g' } as any, base: 100, nutrients: { kcal, protein: 20 } });
const data = () => useStore.getState() as unknown as AppData;
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 10; i++) await Promise.resolve(); };
const act = async (a: Record<string, unknown>) => (await runActions(validateAgent({ reply: '', actions: [a] })!.actions, { t, lang: 'en', today, brain: null } as any))[0];
const toasts = () => useUI.getState().toasts.map((x) => x.text);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(MORNING); localStorage.clear();
  answer = { plan: 'trim', perDay: 200, days: 3, line: 'Yesterday +2,000: −200 a day for 3 days.', why: '' }; calls = 0; hold = null;
  const d = defaultData(); d.settings.onboarded = true; d.settings.dayStartHour = 0; d.settings.goals.kcal = 2500; d.settings.profile.goal = 'fatloss';
  d.memory = [{ id: 'age', text: 'Age: 24 (as of 2026-01-01)', kind: 'other', at: 0 }]; d.marks = { heavySeen: '2026-10-01' };
  useStore.getState().replaceAll(d); useUI.setState({ toasts: [] });
});
afterEach(() => { vi.useRealTimers(); });
const big = () => useStore.setState({ entries: [entry(yesterday, 2500, new Date(2026, 9, 18, 13).getTime()), entry(yesterday, 2000, MORNING - 3600e3, 'big')] });

describe('catch-ups: the hard limits hold over time', () => {
  it('"don\'t cut my calories" while it is still deciding: no cut lands afterwards', async () => {
    let go!: () => void; hold = new Promise((r) => { go = r; });
    big(); checkEating(MORNING); await settle();
    expect((await act({ type: 'catch_up', on: false })).title).toBe('Catch-up taken off');
    go(); await settle();
    expect(kcalTargetFor(data(), today)).toBe(2500);
    expect(toasts()).toEqual([]);
  });
  it('Undo of a catch-up the Coach set: the day is never decided again by the app', async () => {
    big();
    const r1 = await act({ type: 'catch_up', on: true, day: 'yesterday' });
    expect(r1.title).toBe('Catch-up set');
    checkEating(MORNING); await settle(); expect(calls).toBe(0);
    r1.undo!();
    useStore.setState((s) => ({ entries: [...s.entries, entry(today, 300, MORNING + 60e3)] }));
    checkEating(MORNING + 120e3); await settle();
    expect(calls).toBe(0);
    expect(kcalTargetFor(data(), today)).toBe(2500);
  });
  it('Undo of "catch-up off" brings back only what it took off, not an old copy of the list', async () => {
    big(); checkEating(MORNING); await settle();
    expect(kcalTargetFor(data(), today)).toBe(2300);
    const off = await act({ type: 'catch_up', on: false });
    expect(kcalTargetFor(data(), today)).toBe(2500);
    const before = data().catchUps!.length;
    off.undo!();
    expect(kcalTargetFor(data(), today)).toBe(2300);
    expect(data().catchUps!.length).toBe(before);
  });
  it('two heavy days decided at the same time: the pop-ups say what really applies together (≤250)', async () => {
    let go!: () => void; hold = new Promise((r) => { go = r; });
    answer = { plan: 'trim', perDay: 250, days: 4, line: '−250 a day for 4 days.', why: '' };
    const d2 = addDays(today, -2);
    useStore.setState({ entries: [entry(d2, 4700, new Date(2026, 9, 17, 21).getTime()), entry(yesterday, 4700, MORNING - 3600e3)] });
    checkEating(MORNING); await settle();
    go(); await settle();
    expect(2500 - kcalTargetFor(data(), today)!).toBeLessThanOrEqual(250);
    const said = toasts().map((x) => /−(\d+)/.exec(x)?.[1]).filter(Boolean).map(Number);
    expect(said.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(250);
  });
});

describe('who they are', () => {
  it('someone else\'s age in a note is not theirs', () => {
    expect(ageFromMemory([{ text: 'Trains with his dad, who is 45 years old' }], today)).toBeUndefined();
    expect(ageFromMemory([{ text: 'He is 16 years old, 178 cm.' }], today)).toBe(16);
    expect(ageFromMemory([{ text: 'User is 18 years old.' }], today)).toBe(18); // (Omar's real note, 20 Oct)
  });
  it('a health note always fits, even with memory full', async () => {
    useStore.setState({ memory: Array.from({ length: 60 }, (_, i) => ({ id: `m${i}`, text: `note ${i}`, kind: 'other' as const, at: i })) });
    const r = await act({ type: 'remember', text: 'Eating-disorder signal: made herself throw up after dinner', kind: 'health' });
    expect(r.title).toBe('Remembered');
    expect(data().memory.some((m) => /Eating-disorder signal/.test(m.text))).toBe(true);
    expect(data().memory.length).toBe(60);
  });
});

describe('maintenance and the quick model', () => {
  it('weekly weigh-ins with a typo as the newest one: the typo is flagged, not the good one before it', () => {
    const weights = [80.6, 80.3, 80.1, 79.8, 7.9].map((kg, i) => ({ id: `w${i}`, date: addDays(today, -28 + i * 7), kg, at: 0 }));
    expect(oddWeighIns({ weights }, today).map((w) => w.kg)).toEqual([7.9]);
    const entries = Array.from({ length: 28 }, (_, i) => entry(addDays(today, -28 + i), 2500, new Date(`${addDays(today, -28 + i)}T13:00:00`).getTime()));
    const m = trueMaintenance({ entries, weights, health: [] }, today)!;
    expect(m.kcal).toBeGreaterThan(2500);
    expect(m.kcal).toBeLessThan(3200);
  });
  it('maintenance only a guess: no new target is offered from it', () => {
    const entries = Array.from({ length: 12 }, (_, i) => entry(addDays(today, -12 + i), 2500, new Date(`${addDays(today, -12 + i)}T13:00:00`).getTime()));
    const weights = [0, 5, 10, 15].map((k, i) => ({ id: `w${i}`, date: addDays(today, -16 + k), kg: 82 - i * 0.1, at: 0 }));
    const d = { ...data(), entries, weights };
    expect(trueMaintenance(d, today)!.confidence).toBe('low');
    expect(eatingLines(d, today, 'fatloss').join('\n')).toMatch(/Too unsure yet to base a new target on/);
  });
  it('a quick model name fixed in Settings is tried again', () => {
    useAi.getState().patch({ noQuick: true });
    useAi.getState().patch({ models: { ...useAi.getState().models, quick: 'gpt-6-luna' } });
    expect(useAi.getState().noQuick).toBe(false);
  });
});
