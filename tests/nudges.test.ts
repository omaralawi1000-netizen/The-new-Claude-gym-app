// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { findNudges, hideNudge, visibleNudges } from '../src/lib/nudges';
import { defaultData } from '../src/state/defaults';
import { makeT } from '../src/lib/i18n';
import type { AppData, FoodEntry, Routine } from '../src/lib/types';

const t = makeT('en') as any;
const TODAY = '2026-10-07'; // a Wednesday
const legDay: Routine = { id: 'r-legs', name: 'Legs', createdAt: 0, updatedAt: 0, items: [{ id: 'i1', exerciseId: 'back-squat', warmupSets: 0, workingSets: 4, repMin: 5, repMax: 8, restSec: 150 }, { id: 'i2', exerciseId: 'back-squat', warmupSets: 0, workingSets: 3, repMin: 8, repMax: 10, restSec: 120 }] };
const base = (): AppData => { const d = defaultData('en'); d.settings.onboarded = true; return d; };
const run = (d: AppData, hour = 10) => findNudges(d, TODAY, hour, t, 'en', (id) => id);
beforeEach(() => localStorage.clear());

describe('the Coach noticing things', () => {
  it('says nothing about an empty app', () => {
    expect(run(base())).toEqual([]);
  });
  it('flags legs the day before planned wrestling, with a reason and a way to fix it', () => {
    const d = base();
    d.routines = [legDay];
    d.schedule.weekly = { 4: 'r-legs' };          // Thursday
    d.schedule.activities = { 5: ['wrestling'] }; // Friday
    const n = run(d).find((x) => x.id.startsWith('legs-wrestle:'))!;
    expect(n.title).toBe('Legs the day before wrestling');
    expect(n.body).toContain('7 hard leg sets');
    expect(n.action?.run.type).toBe('coach');
  });
  it('reminds about a missed workout and offers to reschedule it', () => {
    const d = base();
    d.routines = [legDay];
    d.schedule.weekly = { 1: 'r-legs' }; // Monday, two days ago, not done
    const n = run(d).find((x) => x.id.startsWith('missed:'))!;
    expect(n.title).toBe('You missed Legs');
    expect(n.action?.run).toMatchObject({ type: 'open', overlay: 'rescheduleSheet' });
  });
  it('notices protein under target for several days', () => {
    const d = base();
    d.settings.goals.protein = 160;
    d.entries = ['2026-10-04', '2026-10-05', '2026-10-06'].map((date, i) => ({ id: `e${i}`, date, mealId: 'm', at: i, snap: { name: 'x' } as any, qty: { amount: 1, unit: 'g' } as any, base: 1, nutrients: { kcal: 2000, protein: 90 } } as FoodEntry));
    const n = run(d).find((x) => x.id.startsWith('protein:'))!;
    expect(n.title).toBe('Protein under target 3 days');
    expect(n.body).toContain('90 g');
  });
  it('"Not now" hides one until tomorrow; ✕ hides it for good', () => {
    const d = base();
    d.routines = [legDay]; d.schedule.weekly = { 1: 'r-legs' };
    const list = run(d);
    const now = new Date(`${TODAY}T12:00:00`).getTime();
    hideNudge(list[0].id, false, now);
    expect(visibleNudges(list, now)).toHaveLength(list.length - 1);
    expect(visibleNudges(list, now + 26 * 3600_000)).toHaveLength(list.length); // back the next day
    hideNudge(list[0].id, true, now);
    expect(visibleNudges(list, now + 400 * 86_400_000)).toHaveLength(list.length - 1);
  });
});
