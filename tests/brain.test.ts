// @vitest-environment jsdom
// The Coach's brain (19 Oct): how far the logs can be trusted (unfinished days, slips), who the person is from their own
// data, the heavy-day verdict's hard limits, and the handbook and rules every message carries.
import { describe, it, expect } from 'vitest';
import { unfinishedDays, oddEntries, oddWeighIns, dataTrustLines } from '../src/lib/dataQuality';
import { personLines } from '../src/lib/person';
import { trueMaintenance } from '../src/lib/maintenance';
import { clampVerdict, defaultVerdict, maxTrim, applyVerdict } from '../src/lib/verdict';
import { reconcileCatchUps } from '../src/lib/eating';
import { handbookTopic } from '../src/lib/handbook';
import { AGENT_SYSTEM, buildAgentContext, CONTEXT_MAX } from '../src/lib/coachContext';
import { defaultData } from '../src/state/defaults';
import { addDays } from '../src/lib/dates';
import { makeT } from '../src/lib/i18n';
import type { AppData, FoodEntry } from '../src/lib/types';

const t = makeT('en') as any;
const today = '2026-10-19';
let n = 0;
const e = (date: string, meal: string, kcal: number, at = new Date(`${date}T12:00:00`).getTime(), name = meal, grams = 100): FoodEntry => ({ id: `e${n++}`, date, mealId: meal, at, snap: { name, basis: 'g', per100: { kcal: (kcal / grams) * 100 } } as any, qty: { amount: grams, unit: 'g' } as any, base: grams, nutrients: { kcal, protein: 20 } });
const data = (o: Partial<AppData> = {}): AppData => { const d = defaultData(); d.settings.dayStartHour = 0; d.settings.goals.kcal = 2000; return { ...d, ...o }; };
/** 28 days: full days of 2,050 kcal, and every other day without dinner (1,450): Ali. */
const ali = () => { const es: FoodEntry[] = []; for (let i = 28; i >= 1; i--) { const date = addDays(today, -i); es.push(e(date, 'breakfast', 450), e(date, 'lunch', 700), e(date, 'snacks', 300)); if (i % 2) es.push(e(date, 'dinner', 600)); } return es; };

describe('data trust', () => {
  it('days without their usual dinner and clearly short are unfinished; full days are not', () => {
    const un = unfinishedDays({ entries: ali() }, today);
    expect(un).toHaveLength(14);
    expect(un[0].missing).toEqual(['dinner']);
  });
  it('true maintenance leaves unfinished days out (Ali: about 2,050, not 1,470)', () => {
    const weights = Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, date: addDays(today, -27 + i * 3), kg: 90.3 + (i % 2) * 0.2, at: 0 }));
    const m = trueMaintenance({ entries: ali(), weights, health: [] }, today)!;
    expect(m.kcal).toBeGreaterThan(1950);
    expect(m.kcal).toBeLessThan(2150);
  });
  it('a 2,000 kcal item, 10× the usual amount, the same item twice in a minute, and a weigh-in 5 kg off are flagged', () => {
    const es = [e(addDays(today, -3), 'dinner', 2100), ...[1, 2, 3, 4].map((i) => e(addDays(today, -i - 4), 'breakfast', 300, undefined, 'Oats', 60)), e(addDays(today, -1), 'breakfast', 900, undefined, 'Oats', 600)];
    const t0 = new Date(`${today}T08:00:00`).getTime();
    es.push(e(today, 'breakfast', 200, t0, 'Skyr', 200), e(today, 'breakfast', 200, t0 + 30_000, 'Skyr', 200));
    const why = oddEntries({ entries: es }, today).map((o) => o.why).join(' | ');
    expect(why).toMatch(/2100 kcal in one item/);
    expect(why).toMatch(/10× their usual/);
    expect(why).toMatch(/twice within 2 minutes/);
    const weights = [80, 80.2, 85.3, 80.1, 79.9].map((kg, i) => ({ id: `w${i}`, date: addDays(today, -8 + i * 2), kg, at: 0 }));
    expect(oddWeighIns({ weights }, today)).toEqual([{ date: addDays(today, -4), kg: 85.3, around: 80.1 }]);
    expect(dataTrustLines({ entries: ali(), weights: [] }, today).join('\n')).toMatch(/DATA TRUST:\nProbably unfinished days.*14/);
  });
});

describe('who they are', () => {
  it('evening eating, heavy days after short nights and logged late, and logging habits — from their data only', () => {
    const es: FoodEntry[] = [];
    const health = [];
    for (let i = 28; i >= 1; i--) {
      const date = addDays(today, -i);
      es.push(e(date, 'breakfast', 500), e(date, 'lunch', 700), e(date, 'dinner', 800, new Date(`${date}T21:00:00`).getTime()));
      const heavy = i % 7 === 0;
      if (heavy) es.push(e(date, 'snacks', 1500, new Date(`${addDays(date, 1)}T08:00:00`).getTime()));
      health.push({ date, sleepMin: heavy ? 300 : 450 });
    }
    const L = personLines(data({ entries: es, health } as any), today).join('\n');
    expect(L).toMatch(/WHO THEY ARE/);
    expect(L).toMatch(/Eating rhythm: \d+% .*after 20:00/);
    expect(L).toMatch(/4 of 4 came after a night under 6 h/);
    expect(L).toMatch(/4 of 4 were logged the day after/);
    expect(L).toMatch(/nearly always log breakfast, lunch, dinner/);
    expect(personLines(data(), today)).toEqual([]); // nothing to say about a new user
  });
});

describe('the heavy-day verdict', () => {
  it('whatever the brain says: never more than 250 (and 15 %, and the room above the floor) a day, 4 days, half the surplus', () => {
    expect(maxTrim(2500, 1800)).toBe(250);
    expect(maxTrim(2000, 1900)).toBe(100);
    expect(maxTrim(1500, 1400)).toBe(100);
    const lim = { perDay: 250, total: 1000, days: 4 };
    expect(clampVerdict({ plan: 'trim', perDay: 900, days: 12, line: 'x', why: 'y' }, lim)).toMatchObject({ perDay: 250, days: 4, clamped: true });
    expect(clampVerdict({ plan: 'trim', perDay: 200, days: 3, line: 'x', why: 'y' }, lim)).toMatchObject({ perDay: 200, days: 3, clamped: false });
    expect(clampVerdict({ plan: 'trim', perDay: 250, days: 4, line: 'x', why: '' }, { ...lim, total: 500 })).toMatchObject({ perDay: 250, days: 2, clamped: true });
    expect(clampVerdict({ plan: 'trim', perDay: 30, days: 3, line: 'x', why: '' }, lim)).toMatchObject({ plan: 'none', perDay: 0, days: 0 });
    expect(clampVerdict({ plan: 'cut' as any, perDay: 300, days: 3, line: 'x', why: '' }, lim)).toBeNull();
  });
  it('without a brain: never a cut, just what it was', () => {
    const c = { id: 'c', date: '2026-10-18', over: 2000, days: [], perDay: 0, trigger: 'late' as const, at: 0, floor: 1800 };
    expect(defaultVerdict(c, today, t, String)).toMatchObject({ plan: 'none', perDay: 0, line: '+2000 kcal over. Mostly water on the scale — back to normal today, no cut.' });
    expect(defaultVerdict({ ...c, date: today }, today, t, String).line).toMatch(/back to normal tomorrow/);
    expect(applyVerdict(c, { plan: 'trim', perDay: 200, days: 3, line: 'l', why: 'w' }, today).days).toEqual([today, '2026-10-20', '2026-10-21']);
  });
  it('a heavy day is noticed even with a low target and no room to trim (it used to be missed)', () => {
    const d = data({ entries: [e(today, 'dinner', 2600, new Date(`${today}T21:00:00`).getTime())] });
    d.settings.goals.kcal = 1800;
    const r = reconcileCatchUps(d, new Date(`${today}T21:30:00`).getTime());
    expect(r?.fresh[0]).toMatchObject({ date: today, over: 800, perDay: 0, days: [] });
  });
});

describe('the rules every message carries', () => {
  it('handbook, how to think, how to talk — and nothing assumed about one user', () => {
    const sys = AGENT_SYSTEM('en');
    expect(sys).toContain("COACH'S HANDBOOK");
    expect(sys).toContain('HOW TO THINK');
    expect(sys).toContain('HOW TO TALK');
    expect(sys).not.toContain('they tend to overeat in the evening');
    expect(sys).not.toContain('they train hard whatever the day');
    expect(handbookTopic('weightclass')).toMatch(/Never dehydration/);
    expect(handbookTopic('nonsense')).toMatch(/Handbook topics:/);
  });
  it('a long history never pushes out the important blocks (they used to be cut off the end)', () => {
    const es: FoodEntry[] = [];
    for (let i = 6; i >= 0; i--) for (let k = 0; k < 60; k++) es.push(e(addDays(today, -i), 'snacks', 50, undefined, `Food number ${k} with a long name`));
    const health = Array.from({ length: 10 }, (_, i) => ({ date: addDays(today, -i), sleepMin: 420, restHr: 50, hrv: 60 }));
    const ctx = buildAgentContext(data({ entries: es, health } as any), today, (x) => x, (x) => x);
    expect(ctx.length).toBeLessThanOrEqual(CONTEXT_MAX + 4000);
    expect(ctx).toContain('BODY & RECOVERY');
    expect(ctx).toContain('EATING PATTERNS');
  });
});
