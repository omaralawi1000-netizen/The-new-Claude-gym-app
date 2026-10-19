// @vitest-environment jsdom
// Omar's evenings (19 Oct): a heavy day is noticed the same evening or from the log he adds the morning after, and caught
// up over the next days (never one brutal day, never under the floor); forgetting dinner is not a heavy day; true
// maintenance from his logs and the scale; the calories the watch says he burns but his logs can't explain.
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { catchUpOn, eatingLines, heavyDays, kcalTargetFor, markCoachTold, planCatchUp, reconcileCatchUps } from '../src/lib/eating';
import { suggestedTarget, trueMaintenance } from '../src/lib/maintenance';
import { validateAgent, runActions } from '../src/lib/agent';
import { applyVerdict } from '../src/lib/verdict';
import { makeT } from '../src/lib/i18n';
import { addDays } from '../src/lib/dates';
import type { AppData, FoodEntry } from '../src/lib/types';

const t = makeT('en') as any;
// 19 Oct 2026, 09:00 (local): the morning after
const MORNING = new Date(2026, 9, 19, 9, 0).getTime();
const today = '2026-10-19', yesterday = '2026-10-18';
let n = 0;
const entry = (date: string, kcal: number, at: number, mealId = 'dinner'): FoodEntry => ({
  id: `e${n++}`, date, mealId, at, snap: { name: 'food', basis: 'g', per100: { kcal } } as any, qty: { amount: 100, unit: 'g' } as any, base: 100, nutrients: { kcal, protein: 20 },
});
const data = (): AppData => useStore.getState() as unknown as AppData;
const set = (entries: FoodEntry[]) => useStore.setState({ entries });

beforeEach(() => {
  localStorage.clear();
  const d = defaultData(); d.settings.onboarded = true; d.settings.dayStartHour = 0; d.settings.goals.kcal = 2500; d.settings.goals.protein = 180;
  // (an adult on a fat-loss goal: the only one a catch-up may trim for, lib/verdict.ts)
  d.settings.profile.goal = 'fatloss'; d.memory = [{ id: 'age', text: 'Age: 24 (as of 2026-01-01)', kind: 'other', at: 0 }];
  useStore.getState().replaceAll(d);
});

describe('the morning after', () => {
  it('2,000 kcal logged today for yesterday: noticed, caught up from today over 4 days, protein untouched', () => {
    const y = new Date(2026, 9, 18, 13, 0).getTime();
    set([entry(yesterday, 1300, y, 'lunch'), entry(yesterday, 1200, y + 3600e3, 'snacks'), entry(yesterday, 2000, MORNING - 3600e3)]);
    const r = reconcileCatchUps(data(), MORNING)!;
    expect(r.fresh).toHaveLength(1);
    const c = r.fresh[0];
    expect(c).toMatchObject({ date: yesterday, over: 2000, trigger: 'late', perDay: 500 });
    expect(c.days).toEqual([today, '2026-10-20', '2026-10-21', '2026-10-22']);
    useStore.getState().setCatchUps(r.list);
    // (never more than 250 off a day, whatever the plan said)
    expect(kcalTargetFor(data(), today)).toBe(2250);
    expect(kcalTargetFor(data(), '2026-10-23')).toBe(2500);
    expect(catchUpOn(data(), today)).toMatchObject({ perDay: 250, left: 4 });
    expect(data().settings.goals.protein).toBe(180);
    expect(reconcileCatchUps(data(), MORNING)).toBeNull(); // (once)
  });
  it('forgetting dinner and logging it the next morning is not a heavy day', () => {
    const y = new Date(2026, 9, 18, 12, 0).getTime();
    set([entry(yesterday, 1300, y, 'lunch'), entry(yesterday, 600, y), entry(yesterday, 800, MORNING - 3600e3)]); // 2,700: +200
    expect(reconcileCatchUps(data(), MORNING)).toBeNull();
  });
  it('more logged for the same day later raises it; taken back, it is never set again', () => {
    set([entry(yesterday, 2500, new Date(2026, 9, 18, 12).getTime()), entry(yesterday, 1000, MORNING)]);
    useStore.getState().setCatchUps(reconcileCatchUps(data(), MORNING)!.list);
    expect(data().catchUps![0].over).toBe(1000);
    set([...data().entries, entry(yesterday, 800, MORNING + 60e3)]);
    useStore.getState().setCatchUps(reconcileCatchUps(data(), MORNING + 120e3)!.list);
    expect(data().catchUps).toHaveLength(1);
    expect(data().catchUps![0].over).toBe(1800);
    useStore.getState().setCatchUps(data().catchUps!.map((c) => ({ ...c, off: true })));
    expect(kcalTargetFor(data(), today)).toBe(2500);
    set([...data().entries, entry(yesterday, 900, MORNING + 180e3)]);
    expect(reconcileCatchUps(data(), MORNING + 240e3)).toBeNull();
  });
});

describe('the same evening', () => {
  it('after 20:00 a day clearly over is caught up from tomorrow; before 20:00 nothing yet', () => {
    const noon = new Date(2026, 9, 19, 12).getTime();
    set([entry(today, 2500, noon), entry(today, 1000, noon + 3600e3)]);
    expect(reconcileCatchUps(data(), new Date(2026, 9, 19, 18).getTime())).toBeNull();
    const r = reconcileCatchUps(data(), new Date(2026, 9, 19, 21, 30).getTime())!;
    expect(r.fresh[0]).toMatchObject({ date: today, over: 1000, trigger: 'live', perDay: 330 });
    expect(r.fresh[0].days).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
  });
});

describe('the floor', () => {
  it('a low target spreads it over more days and never goes under 1,800', () => {
    expect(planCatchUp(2000, 2500, 1800)).toEqual({ n: 4, perDay: 500 });
    expect(planCatchUp(1000, 2000, 1800)).toEqual({ n: 5, perDay: 200 });
    expect(planCatchUp(3000, 2000, 1800)!.perDay).toBe(200);
    expect(planCatchUp(800, 1820, 1800)).toBeNull();
  });
});

describe('true maintenance', () => {
  const fill = (kcal: number, kgStart: number, kgPerWeek: number, burn?: number) => {
    const es: FoodEntry[] = [];
    const ws: { id: string; date: string; kg: number; at: number }[] = [];
    for (let i = 28; i >= 1; i--) {
      const date = addDays(today, -i);
      es.push(entry(date, kcal, new Date(`${date}T13:00:00`).getTime(), 'lunch'));
      if (i % 2 === 0) ws.push({ id: `w${i}`, date, kg: Math.round((kgStart - (kgPerWeek / 7) * (28 - i)) * 10) / 10, at: 0 });
    }
    useStore.setState({ entries: es, weights: ws.map((w) => ({ ...w, kg: kgStart + (kgPerWeek / 7) * (28 - Number(w.id.slice(1))) })), health: burn ? Array.from({ length: 28 }, (_, i) => ({ date: addDays(today, -i - 1), totalKcal: burn })) : [] });
  };
  it('eating 2,500 and losing 0.5 kg a week: maintenance about 3,050, high confidence', () => {
    fill(2500, 85, -0.5);
    const m = trueMaintenance(data(), today)!;
    expect(m.kcal).toBeGreaterThan(3000);
    expect(m.kcal).toBeLessThan(3100);
    expect(m.confidence).toBe('high');
    expect(m.kgPerWeek).toBeCloseTo(-0.5, 1);
    expect(suggestedTarget(m, 'fatloss')).toBe(m.kcal - 500);
  });
  it('the watch burns 3,400 but logs and scale say 2,500: about 900 a day probably not logged', () => {
    fill(2500, 82, 0, 3400);
    const m = trueMaintenance(data(), today)!;
    expect(m.kcal).toBe(2500);
    expect(m.invisible).toBe(900);
  });
  it('not enough data: says so instead of guessing', () => {
    set([entry(yesterday, 2500, MORNING)]);
    expect(trueMaintenance(data(), today)).toBeNull();
    expect(eatingLines(data(), today).join(' ')).toContain('not enough yet');
  });
});

describe('the Coach', () => {
  it('is told once (JUST NOTICED), then it is not said again; heavy days are listed with "logged the day after"', () => {
    set([entry(yesterday, 2500, new Date(2026, 9, 18, 12).getTime()), entry(yesterday, 2000, MORNING)]);
    // noticed, then decided (lib/verdict.ts): here a small trim with its line and reasoning
    const c = reconcileCatchUps(data(), MORNING)!.list[0];
    useStore.getState().setCatchUps([applyVerdict(c, { plan: 'trim', perDay: 250, days: 3, line: 'Yesterday: +2,000. Mostly water. −250 a day for 3 days.', why: 'Third heavy day this month.' }, today)]);
    expect(eatingLines(data(), today).join('\n')).toMatch(/JUST NOTICED.*\+2000 kcal over.*\(logged the day after\).*−250 kcal a day for 3 days.*Mostly water.*Third heavy day/);
    expect(heavyDays(data(), today)[0]).toMatchObject({ date: yesterday, over: 2000, late: true });
    markCoachTold(data(), useStore.getState().setCatchUps);
    expect(eatingLines(data(), today).join('\n')).not.toContain('JUST NOTICED');
    expect(eatingLines(data(), today).join('\n')).toContain('CATCH-UP running');
  });
  it('"don\'t cut my calories" takes it off; "I ate about 1,500 extra yesterday" sets one; Undo works', async () => {
    const ctx = { t, lang: 'en' as const, today, brain: null };
    set([entry(yesterday, 2500, new Date(2026, 9, 18, 12).getTime())]);
    const [on] = await runActions(validateAgent({ reply: '', actions: [{ type: 'catch_up', on: true, kcal: 1500, day: 'yesterday' }] })!.actions, ctx);
    expect(on.title).toBe('Catch-up set');
    // never more than 250 a day and half of it back in all, spread instead
    expect(kcalTargetFor(data(), today)).toBe(2250);
    expect(catchUpOn(data(), today)!.left).toBe(3);
    const [off] = await runActions(validateAgent({ reply: '', actions: [{ type: 'catch_up', on: false }] })!.actions, ctx);
    expect(off.title).toBe('Catch-up taken off');
    expect(kcalTargetFor(data(), today)).toBe(2500);
    off.undo!();
    expect(kcalTargetFor(data(), today)).toBe(2250);
  });
});
