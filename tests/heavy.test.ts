// @vitest-environment jsdom
// Heavy days judged fairly (review round 1, 19 Oct): against the target each day had (changing the target never makes
// past days heavy), within limits that always hold, decided once, and undone when the log is corrected.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from '../src/state/store';
import { defaultData, normaliseData } from '../src/state/defaults';
import { heavyDays, heavyNow, noteTarget, targetOn } from '../src/lib/eating';
import { addDays } from '../src/lib/dates';
import type { AppData, FoodEntry } from '../src/lib/types';

const today = '2026-10-19';
const NOON = new Date(2026, 9, 19, 12, 0).getTime();
let n = 0;
const entry = (date: string, kcal: number, at = new Date(`${date}T13:00:00`).getTime(), mealId = 'dinner'): FoodEntry => ({
  id: `e${n++}`, date, mealId, at, snap: { name: 'food', basis: 'g', per100: { kcal } } as any, qty: { amount: 100, unit: 'g' } as any, base: 100, nutrients: { kcal, protein: 20 },
});
const data = (): AppData => useStore.getState() as unknown as AppData;
const setKcal = (kcal: number | undefined) => { const s = useStore.getState(); s.updateSettings({ goals: { ...s.settings.goals, kcal } }); };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
  localStorage.clear();
  const d = defaultData(); d.settings.onboarded = true; d.settings.dayStartHour = 0; d.settings.goals.kcal = 3200; d.settings.goals.protein = 180;
  useStore.getState().replaceAll(d);
});
afterEach(() => { vi.useRealTimers(); });

describe('the target each day had', () => {
  it('a week at 3,200, then the target lowered to 2,200: no heavy days appear', () => {
    useStore.setState({ entries: Array.from({ length: 7 }, (_, i) => entry(addDays(today, -7 + i), 3100)) });
    setKcal(2200);
    expect(heavyDays(data(), today)).toEqual([]);
    expect(heavyNow(data(), NOON)).toEqual([]);
    // (a real heavy day after the change still counts)
    useStore.setState((s) => ({ entries: [...s.entries, entry(addDays(today, 1), 3500)] }));
    expect(heavyDays(data(), addDays(today, 2)).map((h) => h.date)).toEqual([addDays(today, 1)]);
  });
  it('typing a new target keystroke by keystroke leaves one record that keeps the old target', () => {
    for (const k of [2, 22, 220, 2200]) setKcal(k);
    expect(data().targets).toEqual([{ from: today, kcal: 2200, prev: 3200 }]);
    setKcal(3200); // (and back again the same day: no trace)
    expect(data().targets).toEqual([]);
  });
  it('the Coach changing the target and Undo leave no trace', () => {
    const s = useStore.getState();
    const prev = { goals: s.settings.goals };
    s.updateSettings({ goals: { ...s.settings.goals, kcal: 2400 } });
    expect(data().targets).toHaveLength(1);
    useStore.getState().updateSettings(prev);
    expect(data().targets).toEqual([]);
  });
  it('before / on / after a change, with no target before (onboarding) not judged', () => {
    const d = { settings: { goals: { kcal: 2200 } }, targets: [{ from: '2026-10-01', kcal: 2500 }, { from: '2026-10-10', kcal: 2200, prev: 2500 }] } as any;
    expect(targetOn(d, '2026-09-20')).toBeUndefined(); // before onboarding: no target
    expect(targetOn(d, '2026-10-01')).toBeUndefined();
    expect(targetOn(d, '2026-10-05')).toBe(2500);
    expect(targetOn(d, '2026-10-10')).toBe(2500); // change day: the higher one
    expect(targetOn(d, '2026-10-11')).toBe(2200);
    expect(targetOn({ settings: { goals: { kcal: 2000 } } } as any, '2020-01-01')).toBe(2000); // no records: today's
  });
  it('a restore or import never records, and the history survives a backup round trip', () => {
    setKcal(2200);
    const backup = JSON.parse(JSON.stringify(data()));
    const back = normaliseData(backup);
    expect(back.targets).toEqual([{ from: today, kcal: 2200, prev: 3200 }]);
    useStore.getState().replaceAll({ ...back, settings: { ...back.settings, goals: { ...back.settings.goals, kcal: 2600 } } });
    expect(data().targets).toEqual([{ from: today, kcal: 2200, prev: 3200 }]);
    expect(targetOn(data(), addDays(today, 1))).toBe(2600); // after the last record: the current target
    expect(normaliseData({ targets: [{ from: 'x' }, null, { from: '2026-10-01', kcal: 'a', prev: 2000 }] }).targets).toEqual([{ from: '2026-10-01', prev: 2000 }]);
  });
  it('noteTarget: the same day keeps its first prev', () => {
    const a = noteTarget([], 3000, 2800, today);
    const b = noteTarget(a, 2800, 2500, today);
    expect(b).toEqual([{ from: today, kcal: 2500, prev: 3000 }]);
    expect(noteTarget(b, 2500, 2400, addDays(today, 1))).toHaveLength(2);
  });
});
