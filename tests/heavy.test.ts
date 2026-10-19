// @vitest-environment jsdom
// Heavy days judged fairly (review round 1, 19 Oct): against the target each day had (changing the target never makes
// past days heavy), within limits that always hold, decided once, and undone when the log is corrected.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from '../src/state/store';
import { defaultData, normaliseData } from '../src/state/defaults';
import { catchUpOn, heavyDays, heavyMode, heavyNow, kcalTargetFor, noteTarget, targetOn, TRIM_CAP } from '../src/lib/eating';
import { ageFromMemory, clampVerdict, edFromMemory, trimAllowed, trimLimits, verdictLine } from '../src/lib/verdict';
import { validateAgent, runActions } from '../src/lib/agent';
import { makeT } from '../src/lib/i18n';
import { addDays } from '../src/lib/dates';
import type { AppData, CatchUp, FoodEntry } from '../src/lib/types';

const t = makeT('en') as any;
const cu = (o: Partial<CatchUp>): CatchUp => ({ id: `c${n++}`, date: addDays(today, -1), over: 1500, days: [today], perDay: 200, floor: 1800, trigger: 'late', at: 0, ...o });
const mem = (text: string, kind: any = 'other') => ({ id: `m${n++}`, text, kind, at: 0 });

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

describe('heavy-day notices: on, quiet, off', () => {
  it('unset follows the goal; an explicit choice sticks', () => {
    expect(heavyMode({ profile: { goal: 'fatloss' } } as any)).toBe('on');
    expect(heavyMode({ profile: { goal: 'muscle' } } as any)).toBe('quiet');
    expect(heavyMode({ profile: { goal: 'fatloss' }, heavyDays: 'off' } as any)).toBe('off');
  });
  it('turning on (by hand, or the goal becoming fat loss) remembers the day, so the past is never judged', () => {
    const s = useStore.getState();
    s.updateSettings({ profile: { ...s.settings.profile, goal: 'muscle' } });
    expect(data().settings.heavyOnSince).toBeUndefined();
    useStore.getState().updateSettings({ profile: { ...data().settings.profile, goal: 'fatloss' } });
    expect(data().settings.heavyOnSince).toBe(today);
    useStore.getState().updateSettings({ heavyDays: 'off', heavyOnSince: undefined });
    vi.setSystemTime(new Date(2026, 9, 21, 12));
    useStore.getState().updateSettings({ heavyDays: 'on' });
    expect(data().settings.heavyOnSince).toBe('2026-10-21');
  });
  it('quiet and off never change the target; on does, within the limits', () => {
    const d = { settings: { goals: { kcal: 2500 }, profile: { goal: 'fatloss' } }, memory: [mem('Age: 30 (as of 2026-01-01)')], catchUps: [cu({ perDay: 200 })] } as any;
    expect(kcalTargetFor(d, today)).toBe(2300);
    expect(catchUpOn(d, today)?.perDay).toBe(200);
    expect(kcalTargetFor({ ...d, settings: { ...d.settings, heavyDays: 'quiet' } }, today)).toBe(2500);
    expect(kcalTargetFor({ ...d, settings: { ...d.settings, heavyDays: 'off' } }, today)).toBe(2500);
    expect(catchUpOn({ ...d, settings: { ...d.settings, heavyDays: 'off' } }, today)).toBeNull();
  });
  it('two catch-ups on the same day never take more than 250 together; a target lowered under the floor is never raised', () => {
    const d = { settings: { goals: { kcal: 2600 }, profile: { goal: 'fatloss' } }, memory: [mem('Age: 30 (as of 2026-01-01)')], catchUps: [cu({ perDay: 250 }), cu({ perDay: 250 })] } as any;
    expect(kcalTargetFor(d, today)).toBe(2350);
    expect(catchUpOn(d, today)?.perDay).toBe(250); // the line shows what really applies
    const low = { ...d, settings: { ...d.settings, goals: { kcal: 1700 } } };
    expect(kcalTargetFor(low, today)).toBe(1700);
    expect(catchUpOn(low, today)).toBeNull(); // no "−0"
  });
  it('random catch-ups: always floor ≤ target ≤ their own, never more than 250 off; off = their own', () => {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 500; i++) {
      const base = 1200 + Math.round(rnd() * 3000);
      const cs = Array.from({ length: Math.floor(rnd() * 4) }, () => cu({ perDay: Math.round(rnd() * 900), floor: 1200 + Math.round(rnd() * 1500), days: rnd() < 0.8 ? [today] : [], off: rnd() < 0.2 }));
      const d = { settings: { goals: { kcal: base }, profile: { goal: 'fatloss' } }, memory: [mem('Age: 30 (as of 2026-01-01)')], catchUps: cs } as any;
      const k = kcalTargetFor(d, today)!;
      const floors = cs.filter((c) => !c.off && c.perDay > 0 && c.days.includes(today)).map((c) => c.floor);
      expect(k).toBeLessThanOrEqual(base);
      expect(base - k).toBeLessThanOrEqual(TRIM_CAP);
      if (floors.length) expect(k).toBeGreaterThanOrEqual(Math.min(base, Math.min(...floors)));
      expect(kcalTargetFor({ ...d, settings: { ...d.settings, heavyDays: 'off' } }, today)).toBe(base);
    }
  });
});

describe('who may get a trim at all', () => {
  const who = (goal: string, memory: any[] = [mem('Age: 22 (as of 2026-01-01)')], heavyDays?: string) => trimAllowed({ settings: { profile: { goal }, heavyDays }, memory } as any, today);
  it('an adult (age known) on a fat-loss goal with notices on; nobody else', () => {
    expect(who('fatloss')).toBeNull();
    expect(who('muscle')).toBe('goal');
    expect(who('fatloss', [], undefined)).toBe('age');
    expect(who('fatloss', [mem('Age: 16 (as of 2026-09-01)')])).toBe('minor');
    expect(who('fatloss', undefined, 'quiet')).toBe('mode');
    expect(who('fatloss', [mem('Age: 22 (as of 2026-01-01)'), mem('Made himself throw up after a binge in September', 'health')])).toBe('health');
  });
  it('age: the stored form counts the years since; other wordings; no false hits', () => {
    expect(ageFromMemory([mem('Age: 17 (as of 2025-06-01)')], today)).toBe(18);
    expect(ageFromMemory([mem('He is 19 years old')], today)).toBe(19);
    expect(ageFromMemory([mem('16-årig bryder')], today)).toBe(16);
    expect(ageFromMemory([mem('Har trænet i 2 år'), mem('Trains 5 days a week')], today)).toBeUndefined();
  });
  it('eating-disorder notes, English and Danish; ordinary notes are not', () => {
    for (const x of ['Uses laxatives after big days', 'Kaster op med vilje efter store aftener', 'Feels loss of control in the evening', 'Skips meals to compensate', 'Eating-disorder signal: purging', 'Made herself throw up after dinner']) expect(edFromMemory([mem(x)])).toBe(true);
    // (clear signs only: a wrestler starving after practice, or sick after a hard session, is not one)
    for (const x of ['Overeats in the evening', 'Wrestles Tue/Thu', 'Prefers savoury snacks', 'Max 150 a day for catch-ups', 'Always starving after wrestling', 'Threw up after a hard practice once']) expect(edFromMemory([mem(x)])).toBe(false);
  });
});

describe('the most a catch-up may take', () => {
  it('half of the real surplus: over true maintenance when that is known well, else over the target', () => {
    const d = data();
    d.settings.goals.kcal = 2500; d.settings.profile.goal = 'fatloss';
    const c = cu({ over: 1000, floor: 1800 });
    expect(trimLimits(d, c, today)).toEqual({ perDay: 250, total: 500, days: 4 });
    // another catch-up already running takes its share of the 250
    expect(trimLimits({ ...d, catchUps: [cu({ date: addDays(today, -3), perDay: 150, days: [today, addDays(today, 1)] })] }, c, today).perDay).toBe(100);
  });
  it('a clamped plan gets a line that says what really happens', () => {
    const c = cu({ over: 1600 });
    const v = clampVerdict({ plan: 'trim', perDay: 500, days: 4, line: '−500 a day for 4 days', why: '' }, { perDay: 250, total: 800, days: 4 })!;
    expect(v).toMatchObject({ perDay: 250, days: 3, clamped: true });
    expect(verdictLine(c, v, today, t, String)).toBe('+1600 kcal over. Mostly water on the scale. A small trim: −250 kcal a day for 3 days, protein stays.');
  });
  it('the Coach asked for a catch-up: the same limits; a missing "on" is never a cut', async () => {
    useStore.getState().updateSettings({ goals: { ...data().settings.goals, kcal: 2500 }, profile: { ...data().settings.profile, goal: 'fatloss' } });
    useStore.setState({ memory: [mem('Age: 25 (as of 2026-01-01)')] as any, entries: [entry(addDays(today, -1), 4000)] });
    expect(validateAgent({ reply: '', actions: [{ type: 'catch_up', on: null }] })!.actions).toEqual([]);
    const ctx = { t, lang: 'en', today, brain: null } as any;
    const [r] = await runActions(validateAgent({ reply: '', actions: [{ type: 'catch_up', on: true, day: 'yesterday' }] })!.actions, ctx);
    expect(r.title).toBe('Catch-up set');
    const c = data().catchUps!.at(-1)!;
    expect(c.perDay).toBeLessThanOrEqual(250);
    expect(c.days.length).toBeLessThanOrEqual(4);
    expect(c.perDay * c.days.length).toBeLessThanOrEqual(750);
    expect(c.byHand).toBe(true);
    // a teen asking: no
    useStore.setState({ memory: [mem('Age: 16 (as of 2026-01-01)')] as any, catchUps: [] });
    const [r2] = await runActions(validateAgent({ reply: '', actions: [{ type: 'catch_up', on: true, day: 'yesterday' }] })!.actions, ctx);
    expect(r2).toMatchObject({ kind: 'miss', title: 'No catch-up' });
    expect(data().catchUps).toEqual([]);
  });
});
