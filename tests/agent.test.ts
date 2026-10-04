// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { validateAgent, localActions, runActions, type AgentCtx } from '../src/lib/agent';
import { useStore } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { makeT } from '../src/lib/i18n';

const ctx = (): AgentCtx => ({ t: makeT('en') as any, lang: 'en', today: '2026-10-01', brain: null });
beforeEach(() => {
  localStorage.clear();
  const d = defaultData(); d.settings.foodLookup = false; d.settings.onboarded = true;
  useStore.getState().replaceAll(d);
});

describe('validateAgent: nothing the model says is trusted', () => {
  it('drops unknown actions, clamps numbers, limits lists', () => {
    const v = validateAgent({ reply: 'ok', actions: [
      { type: 'delete_everything' }, { type: 'log_weight', kg: 9999 }, { type: 'log_water', ml: 250 }, { type: 'log_weight', kg: 82.46 },
      { type: 'set_setting', key: 'apiKey', value: 'x' }, { type: 'set_setting', key: 'theme', value: 'light' },
      ...Array.from({ length: 14 }, () => ({ type: 'log_water', ml: 100 })), // more than twelve per turn is cut off
    ] })!;
    expect(v.actions).toHaveLength(9); // only the first twelve are read, three of those are rejected
    expect(v.actions.slice(0, 3).map((a) => a.type)).toEqual(['log_water', 'log_weight', 'set_setting']);
    expect((v.actions[1] as any).kg).toBe(82.5);
    const f = validateAgent({ reply: 'x', actions: [{ type: 'log_food', foods: Array.from({ length: 30 }, (_, i) => ({ name: `f${i}`, amount: i === 0 ? -5 : 100, unit: 'g' })) }] })!.actions[0] as any;
    expect(f.foods).toHaveLength(14);
    expect(f.foods[0].amount).toBeNull(); // a negative amount is not an amount
  });
  it('rejects non-objects and empty answers', () => {
    expect(validateAgent(null)).toBeNull();
    expect(validateAgent({ reply: '', actions: [] })).toBeNull();
    expect(validateAgent({ reply: 'hi', actions: 'nope' })!.actions).toEqual([]);
  });
});

describe('localActions: simple commands without Gemini', () => {
  it('reads food, sets, water and weight; ignores chatter', () => {
    expect(localActions('200 g skyr')![0].type).toBe('log_food');
    expect(localActions('log a banana')![0].type).toBe('log_food');
    expect(localActions('bench press 80 for 8')![0].type).toBe('log_sets');
    const w = localActions('drank 2 dl water')![0] as any; expect(w.type).toBe('log_water'); expect(w.ml).toBe(200);
    const kg = localActions('I weigh 82,4 kg')![0] as any; expect(kg.type).toBe('log_weight'); expect(kg.kg).toBe(82.4);
    expect(localActions('how is my week going?')).toBeNull();
  });
});

describe('runActions: acts on the real store, and every action can be undone', () => {
  it('logs food with the matched food named, then undoes it', async () => {
    const [r] = await runActions([{ type: 'log_food', foods: [{ name: 'banana', amount: 1, unit: 'piece' }, { name: 'skyr', amount: 200, unit: 'g' }] }], ctx());
    expect(r.kind).toBe('food');
    const s = useStore.getState();
    expect(s.entries).toHaveLength(2);
    expect(s.entries.every((e) => e.date === '2026-10-01')).toBe(true);
    expect(r.lines.length).toBeGreaterThanOrEqual(2);
    r.undo!();
    expect(useStore.getState().entries).toHaveLength(0);
  });
  it('a food with no amount gets one typical portion, flagged as an estimate', async () => {
    const [r] = await runActions([{ type: 'log_food', foods: [{ name: 'banana' }] }], ctx());
    expect(r.kind).toBe('food');
    expect(useStore.getState().entries[0].estimated).toBe(true);
  });
  it('an unknown food without Gemini is an honest miss, not an invention', async () => {
    const [r] = await runActions([{ type: 'log_food', foods: [{ name: 'zzzxq', amount: 1, unit: 'piece' }] }], ctx());
    expect(r.kind).toBe('miss');
    expect(useStore.getState().entries).toHaveLength(0);
  });
  it('logs sets into a started workout and undo takes it all back', async () => {
    const [r] = await runActions([{ type: 'log_sets', exercises: [{ exercise: 'Barbell Bench Press', sets: [{ kg: 100, reps: 8 }, { kg: 100, reps: 6 }] }] }], ctx());
    expect(r.kind).toBe('sets');
    const a = useStore.getState().active!;
    const done = a.exercises.flatMap((e) => e.sets.filter((q) => q.done));
    expect(done.map((q) => [q.weightKg, q.reps])).toEqual([[100, 8], [100, 6]]);
    r.undo!();
    expect(useStore.getState().active).toBeNull();
  });
  it('a second mention adds to the same exercise block', async () => {
    await runActions([{ type: 'log_sets', exercises: [{ exercise: 'Barbell Bench Press', sets: [{ kg: 80, reps: 8 }] }] }], ctx());
    await runActions([{ type: 'log_sets', exercises: [{ exercise: 'Barbell Bench Press', sets: [{ kg: 85, reps: 6 }] }] }], ctx());
    const a = useStore.getState().active!;
    expect(a.exercises.filter((e) => e.exerciseId === 'bench-press').length).toBeLessThanOrEqual(1);
    expect(a.exercises.flatMap((e) => e.sets.filter((q) => q.done))).toHaveLength(2);
  });
  it('changes a setting and restores it on undo; refuses a bad value', async () => {
    const [r] = await runActions([{ type: 'set_setting', key: 'theme', value: 'light' }], ctx());
    expect(useStore.getState().settings.theme).toBe('light');
    r.undo!(); expect(useStore.getState().settings.theme).not.toBe('light');
    const [bad] = await runActions([{ type: 'set_setting', key: 'kcalGoal', value: '12' }], ctx());
    expect(bad.kind).toBe('miss');
  });
  it('water, weight and activity log and undo', async () => {
    const res = await runActions([{ type: 'log_water', ml: 300 }, { type: 'log_weight', kg: 81.2 }, { type: 'log_activity', kind: 'wrestling', minutes: 60, rounds: 6, intensity: 3 }], ctx());
    const s = useStore.getState();
    expect(s.water).toHaveLength(1); expect(s.weights).toHaveLength(1); expect(s.activities).toHaveLength(1);
    res.forEach((r) => r.undo!());
    const e = useStore.getState();
    expect(e.water).toHaveLength(0); expect(e.weights).toHaveLength(0); expect(e.activities).toHaveLength(0);
  });
  it('finishing a workout waits for a tap', async () => {
    await runActions([{ type: 'log_sets', exercises: [{ exercise: 'Barbell Bench Press', sets: [{ kg: 100, reps: 5 }] }] }], ctx());
    const [r] = await runActions([{ type: 'finish_workout' }], ctx());
    expect(r.pending).toBe(true);
    expect(useStore.getState().active).not.toBeNull(); // nothing happened yet
  });
});

describe('corrections: the assistant can fix or remove a logged food', () => {
  const log = async (text: string) => runActions(localActions(text)!, ctx());
  it('fixes the label value of a logged food, with Undo', async () => {
    await log('200 g skyr');
    const e0 = useStore.getState().entries[0];
    const v = validateAgent({ reply: '', actions: [{ type: 'edit_food', target: e0.snap.name, per100: { kcal: 75 } }] })!;
    const [r] = await runActions(v.actions, ctx());
    expect(r.title).toBe('Corrected');
    expect(useStore.getState().entries[0].nutrients.kcal).toBe(150); // 200 g × 75 kcal/100 g
    r.undo!();
    expect(useStore.getState().entries[0].nutrients.kcal).toBe(e0.nutrients.kcal);
  });
  it('changes the amount and removes an entry, both undoable', async () => {
    await log('200 g skyr');
    const name = useStore.getState().entries[0].snap.name;
    const [r] = await runActions(validateAgent({ reply: '', actions: [{ type: 'edit_food', target: 'skyr', amount: 300, unit: 'g' }] })!.actions, ctx());
    expect(useStore.getState().entries[0].qty.amount).toBe(300);
    r.undo!();
    const [d] = await runActions(validateAgent({ reply: '', actions: [{ type: 'delete_food', target: name }] })!.actions, ctx());
    expect(d.title).toBe('Removed');
    expect(useStore.getState().entries).toHaveLength(0);
    d.undo!();
    expect(useStore.getState().entries).toHaveLength(1);
  });
  it('says so when the item is not in the log, and ignores empty edits', async () => {
    const [r] = await runActions([{ type: 'delete_food', target: 'pizza' }], ctx());
    expect(r.kind).toBe('miss');
    expect(validateAgent({ reply: 'x', actions: [{ type: 'edit_food', target: 'skyr' }] })!.actions).toEqual([]);
  });
});

describe('the whole app by voice: move, replace, copy, routines, sets, plan', () => {
  const run = (actions: any[]) => runActions(validateAgent({ reply: 'x', actions })!.actions, ctx());
  const names = () => useStore.getState().entries.map((e) => `${e.snap.name}@${e.mealId}`);
  it('moves one food between meals and a whole meal between days, with Undo', async () => {
    await runActions([{ type: 'log_food', foods: [{ name: 'chicken breast', amount: 200, unit: 'g' }, { name: 'rice', amount: 150, unit: 'g' }], meal: 'dinner', day: null }], ctx());
    expect(names().every((n) => n.endsWith('@dinner'))).toBe(true);
    const [m] = await run([{ type: 'move_food', target: 'chicken', meal_from: 'dinner', meal_to: 'lunch' }]);
    expect(names().filter((n) => n.endsWith('@lunch'))).toHaveLength(1);
    expect(m.title).toContain('Lunch');
    m.undo!();
    expect(names().every((n) => n.endsWith('@dinner'))).toBe(true);
    const [w] = await run([{ type: 'move_food', meal_from: 'dinner', day_to: 'yesterday' }]);
    expect(useStore.getState().entries.every((e) => e.date === '2026-09-30')).toBe(true);
    w.undo!();
    expect(useStore.getState().entries.every((e) => e.date === '2026-10-01')).toBe(true);
  });
  it('copies, replaces (same amount) and clears a meal', async () => {
    await runActions([{ type: 'log_food', foods: [{ name: 'rice', amount: 150, unit: 'g' }], meal: 'dinner', day: null }], ctx());
    await run([{ type: 'copy_food', meal_from: 'dinner', meal_to: 'lunch' }]);
    expect(useStore.getState().entries).toHaveLength(2);
    const [r] = await run([{ type: 'replace_food', target: 'rice', meal_from: 'lunch', with: { name: 'potato' } }]);
    expect(r.title).toBe('Replaced');
    const lunch = useStore.getState().entries.filter((e) => e.mealId === 'lunch');
    expect(lunch).toHaveLength(1);
    expect(lunch[0].snap.name.toLowerCase()).toContain('potato');
    expect(Math.round(lunch[0].base)).toBe(150);
    r.undo!();
    expect(useStore.getState().entries.filter((e) => e.mealId === 'lunch')[0].snap.name.toLowerCase()).toContain('rice');
    const [c] = await run([{ type: 'delete_food', meal: 'lunch' }]);
    expect(useStore.getState().entries.filter((e) => e.mealId === 'lunch')).toHaveLength(0);
    c.undo!();
    expect(useStore.getState().entries.filter((e) => e.mealId === 'lunch')).toHaveLength(1);
  });
  it('builds, edits and deletes a routine, and puts it on a weekday', async () => {
    const [c] = await run([{ type: 'create_routine', name: 'Test push', add: [{ exercise: 'Barbell Bench Press', sets: 4, repMin: 6, repMax: 8 }, { exercise: 'Overhead Press', sets: 3, repMin: 8, repMax: 10 }, { exercise: 'Unicorn Curl', sets: 3 }] }]);
    const r = useStore.getState().routines.find((x) => x.name === 'Test push')!;
    expect(r.items).toHaveLength(2);
    expect(c.lines.some((l) => l.warn)).toBe(true); // the unknown exercise is reported, not invented
    await run([{ type: 'edit_routine', routine: 'test push', add: [{ exercise: 'Dip', sets: 3, repMin: 8, repMax: 12 }], remove: ['overhead press'], change: [{ exercise: 'bench press', sets: 5 }] }]);
    const r2 = useStore.getState().routines.find((x) => x.id === r.id)!;
    expect(r2.items).toHaveLength(2);
    expect(r2.items.find((i) => i.workingSets === 5)).toBeTruthy();
    const [s] = await run([{ type: 'set_schedule', weekday: 3, routine: 'Test push' }]);
    expect(useStore.getState().schedule.weekly[3]).toBe(r.id);
    s.undo!();
    expect(useStore.getState().schedule.weekly[3] ?? null).not.toBe(r.id);
    const [d] = await run([{ type: 'delete_routine', routine: 'Test push' }]);
    expect(useStore.getState().routines.find((x) => x.id === r.id)).toBeUndefined();
    d.undo!();
    expect(useStore.getState().routines.find((x) => x.id === r.id)).toBeTruthy();
  });
  it('edits a set in the running workout, adds and swaps exercises, with Undo', async () => {
    await runActions([{ type: 'log_sets', exercises: [{ exercise: 'bench press', sets: [{ kg: 80, reps: 8 }, { kg: 80, reps: 8 }] }] }], ctx());
    const sets = () => useStore.getState().active!.exercises[0].sets.filter((q) => q.done);
    const [e] = await run([{ type: 'edit_set', exercise: 'bench', set_number: 2, kg: 85, reps: 6 }]);
    expect(sets()[1].weightKg).toBe(85); expect(sets()[1].reps).toBe(6);
    e.undo!(); expect(sets()[1].weightKg).toBe(80);
    const [a] = await run([{ type: 'add_exercise', exercises: ['Lat Pulldown'] }]);
    expect(useStore.getState().active!.exercises).toHaveLength(2);
    const [sw] = await run([{ type: 'replace_exercise', from: 'lat pulldown', to: 'Pull-up' }]);
    expect(sw.title).toBe('Exercise swapped');
    sw.undo!(); a.undo!();
    expect(useStore.getState().active!.exercises).toHaveLength(1);
    const [rm] = await run([{ type: 'edit_set', exercise: 'bench', set_number: 1, delete_set: true }]);
    expect(sets()).toHaveLength(1);
    rm.undo!(); expect(sets()).toHaveLength(2);
  });
  it('creates a food of its own and logs it in one go', async () => {
    const [r] = await run([{ type: 'create_food', name: 'Mums protein bar', basis: 'g', per100: { kcal: 380, protein: 30, carbs: 35, fat: 12 }, amount: 50, unit: 'g', meal: 'snacks' }]);
    expect(r.title).toBe('Saved and logged');
    expect(useStore.getState().foods.some((f) => f.name === 'Mums protein bar')).toBe(true);
    expect(Math.round(useStore.getState().entries[0].nutrients.kcal ?? 0)).toBe(190);
    r.undo!();
    expect(useStore.getState().entries).toHaveLength(0);
    expect(useStore.getState().foods.some((f) => f.name === 'Mums protein bar')).toBe(false);
  });
  it('rejects nonsense and says so when it cannot find the thing', async () => {
    expect(validateAgent({ reply: 'x', actions: [{ type: 'move_food', target: 'x' }, { type: 'edit_set', exercise: 'bench' }, { type: 'set_schedule', weekday: 9 }, { type: 'create_routine', name: 'x', add: [] }] })!.actions).toEqual([]);
    const [m] = await run([{ type: 'move_food', target: 'pizza', meal_to: 'lunch' }]);
    expect(m.kind).toBe('miss');
  });
});
