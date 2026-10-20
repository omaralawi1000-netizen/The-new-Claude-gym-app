// @vitest-environment jsdom
// Food fixes after the v0.1.160 audit: each block is one fix.
import { describe, it, expect } from 'vitest';
import { entryEditor, entryFromSnapshot, isQuickEntry, quickEntry } from '../src/lib/nutrition';

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
