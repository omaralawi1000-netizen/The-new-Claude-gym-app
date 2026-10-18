// @vitest-environment jsdom
// Coach 2.0, phase 5b, part A: food you can trust. The name as said is found (Danish or English, one word or two), your
// own foods win, an unclear food follows your habit or is asked once, corrections stick, and "quick entry 100 calories" works.
import { describe, it, expect, beforeEach } from 'vitest';
import { localActions, runActions, validateAgent, type AgentCtx } from '../src/lib/agent';
import { useStore } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { defaultMealId } from '../src/lib/derive';
import { makeT } from '../src/lib/i18n';
import type { Food } from '../src/lib/types';

const ctx = (x: Partial<AgentCtx> = {}): AgentCtx => ({ t: makeT('en') as any, lang: 'en', today: '2026-10-01', brain: null, ...x });
const entries = () => useStore.getState().entries;
const own = (id: string, name: string, kcal: number, more: Partial<Food> = {}): Food => ({ id, name, source: 'custom', basis: 'g', per100: { kcal, protein: 2, carbs: 15, fat: 3 }, portions: [], ...more });

beforeEach(() => {
  localStorage.clear();
  const d = defaultData(); d.settings.foodLookup = false; d.settings.onboarded = true;
  useStore.getState().replaceAll(d);
});

describe('the name as said is found', () => {
  beforeEach(() => useStore.getState().saveFood(own('f-pp', 'Power Potatoes', 95)));
  for (const said of ['power potatoes', 'Power Potatoes', 'powerpotatoes', 'power kartofler', 'powerkartofler', 'power-kartofler']) {
    it(`"${said}" is your saved Power Potatoes, not a plain potato`, async () => {
      const [r] = await runActions([{ type: 'log_food', foods: [{ name: said, amount: 200, unit: 'g' }] }], ctx());
      expect(r.kind).toBe('food');
      expect(entries()[0].snap.name).toBe('Power Potatoes');
      expect(r.lines[0].sub).toMatch(/^200 g · 190 kcal$/); // (not flagged "closest match")
    });
  }
  it('a name with commas stays whole ("Rice, white, raw" is raw rice, not white rice and something raw)', async () => {
    const [r] = await runActions([{ type: 'log_food', foods: [{ name: 'Rice, white, raw', amount: 100, unit: 'g' }] }], ctx());
    expect(r.lines).toHaveLength(1);
    expect(entries()).toHaveLength(1);
    expect(entries()[0].snap.state).toBe('raw');
  });
});

describe('your own foods and your habits first', () => {
  it('your own skyr beats the generic one', async () => {
    useStore.getState().saveFood(own('f-skyr', 'Skyr', 57));
    await runActions([{ type: 'log_food', foods: [{ name: 'skyr', amount: 200, unit: 'g' }] }], ctx());
    expect(entries()[0].snap.foodId).toBe('f-skyr');
  });
  it('chicken breast with no habit: asks once ("Which one?"), the tap logs it and is remembered', async () => {
    const rs = await runActions([{ type: 'log_food', foods: [{ name: 'chicken breast', amount: 200, unit: 'g' }] }], ctx());
    expect(entries()).toHaveLength(0);
    const ask = rs.find((r) => r.choose)!;
    expect(ask.title).toBe('Which one?');
    expect(ask.pending).toBe(true);
    const cooked = ask.choose!.find((c) => /cooked/i.test(c.label))!;
    expect(cooked.sub).toMatch(/kcal/);
    cooked.run();
    expect(entries()).toHaveLength(1);
    expect(entries()[0].snap.state).toBe('cooked');
    expect(ask.doneSubtitle).toBe('Remembered for next time');
    // next time: straight in, no question
    const [again] = await runActions([{ type: 'log_food', foods: [{ name: 'chicken breast', amount: 150, unit: 'g' }] }], ctx());
    expect(again.choose).toBeUndefined();
    expect(entries()).toHaveLength(2);
    expect(entries()[1].snap.state).toBe('cooked');
    // Undo of the pick takes the food and the memory back
    ask.undo!();
    expect(Object.keys(useStore.getState().choices)).not.toContain('chicken breast');
  });
  it('a habit settles it without asking (you always log raw rice)', async () => {
    for (let i = 0; i < 3; i++) await runActions([{ type: 'log_food', foods: [{ name: 'rice', amount: 80, unit: 'g', state: 'raw' }] }], ctx({ today: `2026-09-2${i}` }));
    const rs = await runActions([{ type: 'log_food', foods: [{ name: 'rice', amount: 100, unit: 'g' }] }], ctx());
    expect(rs.some((r) => r.choose)).toBe(false);
    expect(entries().at(-1)!.snap.state).toBe('raw');
  });
  it('rice that is cooked but could be white, brown or basmati: close enough, no question', async () => {
    const rs = await runActions([{ type: 'log_food', foods: [{ name: 'rice', amount: 150, unit: 'g', state: 'cooked' }] }], ctx());
    expect(rs.some((r) => r.choose)).toBe(false);
    expect(entries()).toHaveLength(1);
  });
  it('a known food with no amount: your usual amount, said so', async () => {
    await runActions([{ type: 'log_food', foods: [{ name: 'skyr', amount: 300, unit: 'g' }] }], ctx({ today: '2026-09-29' }));
    const [r] = await runActions([{ type: 'log_food', foods: [{ name: 'skyr' }] }], ctx());
    expect(entries().at(-1)!.qty).toEqual({ amount: 300, unit: 'g' });
    expect(r.lines[0].sub).toMatch(/your usual/);
  });
});

describe('corrections stick', () => {
  it('"make it 2" on 150 g of skyr is two of its portions, not 2 g', async () => {
    await runActions([{ type: 'log_food', foods: [{ name: 'skyr', amount: 150, unit: 'g' }] }], ctx());
    const id = entries()[0].id;
    await runActions([{ type: 'edit_food', target: 'skyr', ref: id, amount: 2, unit: null }], ctx());
    expect(entries()[0].qty.unit).toBe('portion');
    expect(entries()[0].base).toBe(300);
  });
  it('a bare number that changes the calories more than five times over waits for a tap', async () => {
    await runActions([{ type: 'log_food', foods: [{ name: 'skyr', amount: 150, unit: 'g' }] }], ctx());
    const before = entries()[0];
    const [r] = await runActions([{ type: 'edit_food', target: 'skyr', ref: before.id, amount: 2000, unit: null }], ctx());
    expect(r.pending).toBe(true);
    expect(entries()[0]).toEqual(before); // nothing changed yet
    r.button!.run();
    expect(entries()[0].base).toBe(2000);
    r.undo!();
    expect(entries()[0].base).toBe(150);
  });
  it('a label fix on a food kept from a search is saved onto that food too', async () => {
    useStore.getState().saveFood(own('f-off', 'Proteinbar Crunch', 380, { source: 'off' }));
    await runActions([{ type: 'log_food', foods: [{ name: 'proteinbar crunch', amount: 60, unit: 'g' }] }], ctx());
    await runActions([{ type: 'edit_food', target: 'proteinbar crunch', per100: { kcal: 350 } }], ctx());
    expect(useStore.getState().foods.find((f) => f.id === 'f-off')!.per100.kcal).toBe(350);
  });
  it('replacing a food remembers the swap for that word', async () => {
    await runActions([{ type: 'log_food', foods: [{ name: 'potato', amount: 200, unit: 'g' }] }], ctx());
    useStore.getState().saveFood(own('f-pp', 'Power Potatoes', 95));
    await runActions([{ type: 'replace_food', target: 'potato', with: { name: 'power potatoes' } }], ctx());
    expect(entries()[0].snap.name).toBe('Power Potatoes');
    expect(Object.values(useStore.getState().choices)).toContain('f-pp');
  });
});

describe('quick entries', () => {
  it('reads them in English and Danish without the AI', () => {
    expect(localActions('quick entry 100 calories')).toEqual([{ type: 'log_quick', totals: { kcal: 100 }, name: null, meal: null, day: null }]);
    expect(localActions('300 kcal 20 g protein')).toEqual([{ type: 'log_quick', totals: { kcal: 300, protein: 20 }, name: null, meal: null, day: null }]);
    expect(localActions('500 kalorier pizza til aftensmad')).toEqual([{ type: 'log_quick', totals: { kcal: 500 }, name: 'pizza', meal: 'aftensmad', day: null }]);
  });
  it('the model’s log_quick is checked like everything else, and logs with Undo', async () => {
    const v = validateAgent({ reply: '', actions: [{ type: 'log_quick', totals: { kcal: 450, protein: 30 }, meal: 'lunch' }, { type: 'log_quick', totals: { kcal: -5 } }] })!;
    expect(v.actions).toHaveLength(1);
    const [r] = await runActions(v.actions, ctx());
    expect(r.title).toBe('Logged to Lunch');
    expect(r.lines[0].sub).toBe('450 kcal · 30 g protein');
    expect(entries()[0].quick).toBe(true);
    r.undo!();
    expect(entries()).toHaveLength(0);
  });
});

describe('day and meal', () => {
  it('after midnight but before the day starts, it is a late snack', () => {
    const meals = useStore.getState().settings.meals;
    expect(defaultMealId(meals, new Date(2026, 9, 2, 0, 30), 4)).toBe('snacks');
    expect(defaultMealId(meals, new Date(2026, 9, 2, 8, 0), 4)).toBe('breakfast');
  });
  it('no day said: the day you are looking at', async () => {
    await runActions([{ type: 'log_food', foods: [{ name: 'skyr', amount: 150, unit: 'g' }], day: null }], ctx({ date: '2026-09-30' }));
    expect(entries()[0].date).toBe('2026-09-30');
    await runActions([{ type: 'copy_food', target: 'skyr', day: '2026-09-30' }], ctx({ date: '2026-10-01' }));
    expect(entries().map((e) => e.date).sort()).toEqual(['2026-09-30', '2026-10-01']);
  });
});
