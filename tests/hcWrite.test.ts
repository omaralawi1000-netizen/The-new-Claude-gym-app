// @vitest-environment jsdom
// Weigh-ins and each day's food totals into Health Connect: handed to the Android app with Sync now ("w=" in the link),
// only what is new or changed, deleted days taken out, and counted as sent only once the app says it wrote them.
import { describe, it, expect, beforeEach } from 'vitest';
import { lastWrite, pendingWrites, prepareWrites, settleWrites } from '../src/lib/hcWrite';
import { hcLink } from '../src/lib/healthSync';
import { defaultData } from '../src/state/defaults';
import type { AppData, FoodEntry } from '../src/lib/types';

const today = '2026-10-20';
const food = (date: string, kcal: number, protein: number): FoodEntry => ({ id: `${date}-${kcal}`, date, mealId: 'lunch', name: 'x', amount: 1, unit: 'g', at: 0, nutrients: { kcal, protein, carbs: 10, fat: 5 } } as unknown as FoodEntry);
const data = (): AppData => {
  const d = defaultData();
  d.weights = [
    { id: 'a', date: '2026-10-19', kg: 80.4, at: 1 },
    { id: 'b', date: '2026-10-20', kg: 80.1, at: 2 },
    { id: 'c', date: '2026-10-20', kg: 79.9, at: 3 }, // (the day's last counts)
    { id: 'old', date: '2026-01-01', kg: 85, at: 0 }, // (over 90 days ago: left out)
  ];
  d.entries = [food('2026-10-19', 2400, 180), food('2026-10-20', 900, 60), food('2026-10-20', 600, 40)];
  return d;
};
const unpack = (s: string) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))));

beforeEach(() => localStorage.clear());

describe('what goes', () => {
  it('the first time: every weigh-in (the last of a day) and every day of food in the last 90 days', () => {
    const { writes } = pendingWrites(data(), today, null);
    expect(writes.w).toEqual([['2026-10-19', 80.4, 1], ['2026-10-20', 79.9, 3]]);
    expect(writes.n).toEqual([['2026-10-19', 2400, 180, 10, 5], ['2026-10-20', 1500, 100, 20, 10]]);
    expect(writes.dw).toEqual([]);
  });
  it('after that only what changed, and deleted days are taken out', () => {
    const { sigs } = pendingWrites(data(), today, null);
    const d = data();
    d.weights = d.weights.filter((w) => w.date !== '2026-10-19'); // deleted here
    d.entries.push(food('2026-10-20', 300, 20)); // a snack later today
    const { writes } = pendingWrites(d, today, sigs);
    expect(writes.w).toEqual([]);
    expect(writes.dw).toEqual(['2026-10-19']);
    expect(writes.n).toEqual([['2026-10-20', 1800, 120, 30, 15]]);
    expect(pendingWrites(data(), today, sigs).writes).toEqual({ w: [], n: [], dw: [], dn: [] });
  });
});

describe('handed along and settled', () => {
  it('rides in the Sync now link, and counts as sent once the app wrote it', () => {
    const w = prepareWrites(data(), today)!;
    expect(unpack(w).w).toHaveLength(2);
    expect(hcLink('sync', w)).toContain(`&w=${w}#Intent;`);
    // not allowed in Health Connect: nothing counts as sent, the same goes again next time
    settleWrites('denied');
    expect(lastWrite()?.state).toBe('denied');
    expect(prepareWrites(data(), today)).toBe(w);
    // written: nothing left to send
    settleWrites('4');
    expect(lastWrite()).toMatchObject({ state: 'ok', n: 4 });
    expect(prepareWrites(data(), today)).toBeNull();
    expect(hcLink('sync', null)).not.toContain('&w=');
  });
});
