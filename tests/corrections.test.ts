// @vitest-environment jsdom
// Omar, 20 Oct: "10 corn cakes" became 10 × a database's "serving (100 g)" = 4200 kcal; after he moved them to lunch,
// fixing them failed with "Couldn't find that in the log" (the AI still named dinner). A real coach gets the first one wrong
// at most, then listens.
import { describe, it, expect, beforeEach } from 'vitest';
import { validateAgent, runActions, type AgentCtx } from '../src/lib/agent';
import { placeholderPortion, rowQuantity, type ParsedFoodRow } from '../src/lib/foodText';
import { AGENT_SYSTEM } from '../src/lib/coachContext';
import { useStore } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { makeT } from '../src/lib/i18n';
import { dayKey } from '../src/lib/dates';
import type { Food } from '../src/lib/types';

const t = makeT('en') as any;
const today = dayKey(Date.now(), 0);
const ctx = (): AgentCtx => ({ t, lang: 'en', today, brain: null });

const food = (label: string, amount: number): Food => ({
  id: 'f1', name: 'Corn Cakes', basis: 'g', per100: { kcal: 420, protein: 8, carbs: 80, fat: 4 } as any,
  portions: [{ id: 'p1', label, amount, verified: true }], source: 'off',
} as unknown as Food);
const row = (amount: number, countWord?: string): ParsedFoodRow => ({ raw: `${amount} corn cakes`, query: 'corn cakes', amount, dim: 'count', countWord } as unknown as ParsedFoodRow);

beforeEach(() => {
  localStorage.clear();
  const d = defaultData(); d.settings.foodLookup = false; d.settings.onboarded = true; d.settings.dayStartHour = 0;
  useStore.getState().replaceAll(d);
});

describe('counted things are pieces, not 100 g servings', () => {
  it('a database\'s stand-in "serving (100 g)" is not one corn cake: how heavy one is gets worked out instead', () => {
    expect(placeholderPortion({ label: 'serving (100 g)', amount: 100 }, 'g')).toBe(true);
    expect(placeholderPortion({ label: '1 portion (100 g)', amount: 100 }, 'g')).toBe(true);
    expect(placeholderPortion({ label: '100 g', amount: 100 }, 'g')).toBe(true);
    expect(rowQuantity(row(10), food('serving (100 g)', 100))).toMatchObject({ qty: null, problem: 'needsGrams' });
  });
  it('a real piece still counts as one: "1 cake (8 g)", a slice, or a portion of 100 g that names the thing', () => {
    expect(rowQuantity(row(10), food('1 cake (8 g)', 8)).qty).toMatchObject({ amount: 10, unit: 'portion', portionId: 'p1' });
    expect(placeholderPortion({ label: '2 SLICES (114 g)', amount: 114 }, 'g')).toBe(false);
    expect(placeholderPortion({ label: '1 bar (100 g)', amount: 100 }, 'g')).toBe(false);
    // they said the word the portion is named by: that one
    expect(rowQuantity(row(2, 'serving'), food('serving (100 g)', 100)).qty).toMatchObject({ amount: 2, unit: 'portion' });
  });
  it('the Coach is told: counted things stay pieces, and a correction is done, not repeated back', () => {
    const sys = AGENT_SYSTEM('en');
    expect(sys).toContain('Counted things stay pieces');
    expect(sys).toMatch(/correct what you logged.*that is an instruction: fix it in this same answer/s);
  });
});

describe('fixing what was just logged, wherever it went', () => {
  it('found after it was moved to another meal, even when the AI still names the first one', async () => {
    const [r] = await runActions(validateAgent({ reply: '', actions: [{ type: 'log_food', foods: [{ name: 'banana', amount: 1, unit: 'piece' }], meal: 'dinner', day: 'today' }] })!.actions, ctx());
    const id = r.lines[0].ref!;
    const name = useStore.getState().entries.find((e) => e.id === id)!.snap.name;
    await runActions(validateAgent({ reply: '', actions: [{ type: 'move_food', ref: id, meal_to: 'lunch' }] })!.actions, ctx());
    expect(useStore.getState().entries.find((e) => e.id === id)!.mealId).toBe('lunch');
    // by name, with the old meal: found anyway
    const [e] = await runActions(validateAgent({ reply: '', actions: [{ type: 'delete_food', target: name, meal: 'dinner' }] })!.actions, ctx());
    expect(e.kind).not.toBe('miss');
    expect(useStore.getState().entries.find((x) => x.id === id)).toBeUndefined();
  });
  it('a ref copied with its brackets or cut short still finds the item', async () => {
    const [r] = await runActions(validateAgent({ reply: '', actions: [{ type: 'log_food', foods: [{ name: 'banana', amount: 1, unit: 'piece' }], meal: 'lunch', day: 'today' }] })!.actions, ctx());
    const id = r.lines[0].ref!;
    const [e] = await runActions(validateAgent({ reply: '', actions: [{ type: 'delete_food', ref: `[ref ${id.slice(0, 10)}…]` }] })!.actions, ctx());
    expect(e.kind).not.toBe('miss');
  });
});
