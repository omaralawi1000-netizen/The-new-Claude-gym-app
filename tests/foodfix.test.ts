// @vitest-environment jsdom
// Food fixes after the v0.1.160 audit: each block is one fix.
import { describe, it, expect } from 'vitest';
import { entryEditor, entryFromSavedItem, entryFromSnapshot, isQuickEntry, mergeFood, quickEntry, savedItemNutrients, savedItemOf } from '../src/lib/nutrition';
import { defaultMealId, removeMeal, restoreMeal } from '../src/lib/derive';
import todaySrc from '../src/screens/Today.tsx?raw';
import appSrc from '../src/App.tsx?raw';
import agentSrc from '../src/lib/agent.ts?raw';
import { DRIVE_FILE, driveFileName } from '../src/lib/drive';

describe('a logged entry opens in the sheet that can edit it', () => {
  it('quick, photo and Coach totals open the quick-entry editor', () => {
    const q = quickEntry('Pasta (AI estimate)', { kcal: 600, protein: 20 }, '2026-10-01', 'dinner');
    expect(isQuickEntry(q)).toBe(true);
    expect(entryEditor(q)).toEqual({ type: 'quickAdd', props: { entryId: q.id, date: '2026-10-01', mealId: 'dinner' } });
  });
  it('an entry without the quick flag but with no per-100 values still opens the quick editor', () => {
    const q = { ...quickEntry('Old log', { kcal: 300 }, '2026-10-01', 'lunch'), quick: undefined };
    expect(entryEditor(q).type).toBe('quickAdd');
  });
  it('a food (even an AI estimate kept per 100 g) opens the food detail', () => {
    const e = entryFromSnapshot({ name: 'Skyr', source: 'quick', basis: 'g', per100: { kcal: 60 }, portions: [] }, { amount: 200, unit: 'g' }, '2026-10-01', 'breakfast')!;
    expect(entryEditor(e).type).toBe('foodDetail');
  });
});

describe('removing a meal in Settings can be undone exactly', () => {
  const meals = [{ id: 'breakfast', name: '' }, { id: 'lunch', name: '' }, { id: 'dinner', name: 'Aftensmad' }];
  const e = (id: string, mealId: string) => ({ ...quickEntry(id, { kcal: 100 }, '2026-10-01', mealId), id });
  it('moves the entries out, and Undo puts the meal back at its place with exactly those entries', () => {
    const entries = [e('a', 'breakfast'), e('b', 'lunch'), e('c', 'lunch'), e('d', 'dinner')];
    const r = removeMeal(meals, entries, 'lunch')!;
    expect(r.meals.map((m) => m.id)).toEqual(['breakfast', 'dinner']);
    expect(r.removed.target.id).toBe('breakfast');
    expect(r.entries.map((x) => x.mealId)).toEqual(['breakfast', 'breakfast', 'breakfast', 'dinner']);
    // something logged to Breakfast after the removal stays in Breakfast
    const later = [...r.entries, e('z', 'breakfast')];
    const back = restoreMeal(r.meals, later, r.removed);
    expect(back.meals).toEqual(meals);
    expect(back.entries.map((x) => `${x.id}:${x.mealId}`)).toEqual(['a:breakfast', 'b:lunch', 'c:lunch', 'd:dinner', 'z:breakfast']);
  });
  it('the only meal cannot be removed', () => {
    expect(removeMeal([meals[0]], [], 'breakfast')).toBeNull();
  });
});

describe('save as meal keeps quick, photo and Coach entries', () => {
  it('quick entries are kept and logged again with their totals', () => {
    const q = quickEntry('Pizza (AI estimate)', { kcal: 800, protein: 30 }, '2026-10-01', 'dinner');
    const f = entryFromSnapshot({ name: 'Skyr', source: 'reference', basis: 'g', per100: { kcal: 60 }, portions: [] }, { amount: 200, unit: 'g' }, '2026-10-01', 'dinner')!;
    const items = [q, f].map(savedItemOf);
    expect(items.map(savedItemNutrients).map((n) => n.kcal)).toEqual([800, 120]);
    const again = items.map((it) => entryFromSavedItem(it, '2026-10-02', 'lunch')!);
    expect(again.map((e) => [e.snap.name, e.nutrients.kcal, e.date, e.mealId, !!e.quick])).toEqual([
      ['Pizza (AI estimate)', 800, '2026-10-02', 'lunch', true],
      ['Skyr', 120, '2026-10-02', 'lunch', false],
    ]);
    expect(again[0].id).not.toBe(q.id);
  });
});

describe('food logged after midnight, before the new day starts, goes to the late meal', () => {
  const meals = [{ id: 'breakfast', name: '' }, { id: 'lunch', name: '' }, { id: 'dinner', name: '' }, { id: 'snacks', name: '' }];
  it('01:30 with the day starting at 04:00 is a late snack, not breakfast', () => {
    const at = new Date(2026, 9, 2, 1, 30);
    expect(defaultMealId(meals, at, 4)).toBe('snacks');
    expect(defaultMealId(meals, at)).toBe('breakfast'); // what Today did before (no day-start hour passed)
  });
  it('every caller passes the day-start hour', () => {
    for (const [f, src] of Object.entries({ 'Today.tsx': todaySrc, 'App.tsx': appSrc, 'agent.ts': agentSrc })) {
      const calls = src.match(/defaultMealId\([^\n]*/g) ?? [];
      for (const c of calls) expect(c, `${f}: ${c}`).toMatch(/dayStartHour/);
    }
  });
});

describe('Aven Beta has its own Drive backup file', () => {
  it('Beta never writes to the real app’s "Aven backup.json"', () => {
    expect(driveFileName(false)).toBe('Aven backup.json');
    expect(driveFileName(true)).not.toBe(driveFileName(false));
    expect(DRIVE_FILE).toBe('Aven backup.json'); // the tests run as the real app
  });
});

describe('saving a looked-up food again merges instead of replacing', () => {
  it('keeps barcode, created time, variants and aliases the snapshot does not carry', () => {
    const saved = { id: 'off:1', name: 'Skyr', source: 'off' as const, barcode: '5701234567890', basis: 'g' as const, per100: { kcal: 60 }, portions: [], variantGroup: 'skyr', aliases: ['skyr naturel'], createdAt: 1000 };
    const fromSnap = { id: 'off:1', name: 'Skyr naturel', brand: undefined, source: 'off' as const, basis: 'g' as const, per100: { kcal: 62, protein: 11 }, portions: [] };
    const m = mergeFood(saved, fromSnap);
    expect(m).toMatchObject({ name: 'Skyr naturel', barcode: '5701234567890', variantGroup: 'skyr', aliases: ['skyr naturel'], createdAt: 1000, per100: { kcal: 62, protein: 11 } });
    expect(mergeFood(undefined, fromSnap)).toBe(fromSnap);
  });
});
