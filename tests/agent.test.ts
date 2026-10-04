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
      { type: 'log_water', ml: 100 }, // a seventh action: more than six per turn is cut off
    ] })!;
    expect(v.actions.map((a) => a.type)).toEqual(['log_water', 'log_weight', 'set_setting']);
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
