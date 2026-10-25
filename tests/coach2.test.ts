// @vitest-environment jsdom
// Coach 2.0, phase 1: look-ups in the data, "it" means the exact item, one conversation for the orb and the Coach, a day
// planned from the user's own exercises, and the newest OpenAI model picked from the key's list.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// the AI is replaced by a script: each call takes the next answer and records what it was sent
const sent: string[] = [];
let script: unknown[] = [];
vi.mock('../src/lib/gemini', async (orig) => ({
  ...(await orig<typeof import('../src/lib/gemini')>()),
  aiAgent: vi.fn(async (system: string) => { sent.push(system); return script.shift(); }),
}));

import { validateAgent, runActions, type AgentCtx, type AgentResult } from '../src/lib/agent';
import { runLookups, validateLookups, muscleOf, type LookupEnv } from '../src/lib/agentLookup';
import { decide } from '../src/lib/agentTurn';
import { pickSolModel } from '../src/lib/openai';
import { appendExchange, markInThread, readThread, threadSaid, threadTurns } from '../src/lib/thread';
import { cardsNote } from '../src/ui/agentUi';
import { useStore, allExercises, plannedFor } from '../src/state/store';
import { useAi } from '../src/state/ai';
import { defaultData } from '../src/state/defaults';
import { buildDemo } from '../src/lib/demo';
import { makeT } from '../src/lib/i18n';
import { addDays, dayKey } from '../src/lib/dates';

const t = makeT('en') as any;
const today = dayKey(Date.now(), 0);
const ctx = (): AgentCtx => ({ t, lang: 'en', today, brain: null });
const env = (): LookupEnv => ({ today, lang: 'en', pool: allExercises(useStore.getState().exercises), mealLabel: (id) => id });

beforeEach(() => {
  localStorage.clear();
  sent.length = 0; script = [];
  const d = defaultData(); d.settings.foodLookup = false; d.settings.onboarded = true;
  useStore.getState().replaceAll({ ...d, ...buildDemo(d.settings) } as any);
  useAi.setState({ hasGemini: true, hasOpenai: false, solFirst: false });
});

describe('look-ups: the whole history is one question away', () => {
  it('only known kinds, clean dates, at most six', () => {
    const v = validateLookups([{ kind: 'drop_table' }, { kind: 'food', from: 'yesterday', query: 'skyr' }, ...Array.from({ length: 9 }, () => ({ kind: 'records' }))]);
    expect(v).toHaveLength(6);
    expect(v[0]).toEqual({ kind: 'food', from: null, to: null, query: 'skyr', meal: null });
    expect(validateLookups('nope')).toEqual([]);
  });
  it('answers every kind from the data, never empty, never huge', () => {
    const d = useStore.getState();
    for (const kind of ['food', 'nutrition', 'workouts', 'records', 'body', 'activities', 'training_balance', 'schedule', 'routines', 'exercises', 'saved_food', 'settings', 'memory', 'notes', 'conversations'] as const) {
      const out = runLookups(d, [{ kind }], env());
      expect(out.length, kind).toBeGreaterThan(20);
      expect(out.length, kind).toBeLessThan(6600);
    }
  });
  it('a lift\'s whole history, its best and what to do next', () => {
    const d = useStore.getState();
    const bench = d.sessions.flatMap((s) => s.exercises).map((e) => allExercises(d.exercises).find((x) => x.id === e.exerciseId)!).find((e) => /bench/i.test(e.name))!;
    const out = runLookups(d, [{ kind: 'exercise_history', query: bench.name, from: addDays(today, -400) }], env());
    expect(out).toContain(`${bench.name} (`);
    expect(out).toMatch(/sessions\. Best set [\d.]+ kg × \d+/);
    expect(out).toMatch(/Next time: /);
    expect(out.split('\n').length).toBeGreaterThan(3);
  });
  it('exercises for muscles, the ones they actually do first (English or Danish words)', () => {
    expect(muscleOf('Triceps')).toBe('triceps');
    expect(muscleOf('skuldre')).toBe('shoulders');
    expect(muscleOf('bryst')).toBe('chest');
    const out = runLookups(useStore.getState(), [{ kind: 'exercises', query: 'chest and triceps' }], env());
    const lines = out.split('\n').slice(1);
    expect(lines[0]).toMatch(/done \d+×/);
    expect(lines.every((l) => /chest|triceps/.test(l))).toBe(true);
  });
  it('a food by name over months, each item with its ref', () => {
    const d = useStore.getState();
    const name = d.entries[0].snap.name;
    const out = runLookups(d, [{ kind: 'food', query: name }], env());
    expect(out).toContain(name);
    expect(out).toMatch(/\[ref e_/);
  });
  it('settings never carry anything secret', () => {
    localStorage.setItem('aven.keys', JSON.stringify({ openai: 'sk-secret' }));
    expect(runLookups(useStore.getState(), [{ kind: 'settings' }], env())).not.toContain('sk-secret');
  });
  it('what was said before, searched by word', () => {
    const said = [{ at: Date.now() - 86400000, role: 'user' as const, text: 'My left knee hurts on lunges' }, { at: Date.now(), role: 'user' as const, text: 'log a banana' }];
    const out = runLookups(useStore.getState(), [{ kind: 'conversations', query: 'knee' }], { ...env(), said });
    expect(out).toContain('knee hurts');
    expect(out).not.toContain('banana');
  });
});

describe('the loop: look it up first, then answer', () => {
  it('runs the look-up on the phone and asks again with the results', async () => {
    script = [
      { reply: '', actions: [], lookups: [{ kind: 'exercise_history', query: 'bench press' }] },
      { reply: 'Your bench went up.', actions: [] },
    ];
    const statuses: string[] = [];
    const d = await decide('how has my bench gone?', { lang: 'en', t, pool: env().pool, history: [], where: '', signal: new AbortController().signal, surface: 'coach', onStatus: (s) => statuses.push(s) });
    expect(d.reply).toBe('Your bench went up.');
    expect(sent).toHaveLength(2);
    expect(sent[0]).not.toContain('LOOKUP RESULTS (you asked');
    expect(sent[1]).toContain('LOOKUP RESULTS (you asked');
    expect(sent[1]).toContain('### exercise_history (query "bench press")');
    expect(statuses[0]).toMatch(/Looking at your bench press history/);
    expect(statuses[statuses.length - 1]).toBe('');
  });
  it('stops after three rounds: the last one has to answer', async () => {
    const look = { reply: '', actions: [], lookups: [{ kind: 'records' }] };
    script = [look, look, { ...look, reply: 'Here is what I have.' }];
    const d = await decide('records?', { lang: 'en', t, pool: env().pool, history: [], where: '', signal: new AbortController().signal, surface: 'coach' });
    expect(sent).toHaveLength(3);
    expect(sent[2]).toContain('No more look-ups this turn');
    expect(d.reply).toBe('Here is what I have.');
  });
});

describe('"it" is the exact item: log a banana → move it to lunch → make it two', () => {
  it('cards carry each item\'s id, and a ref moves and changes exactly that one', async () => {
    // two bananas on different meals: the name alone would be ambiguous
    const st = useStore.getState();
    const before = st.entries.length;
    const [r1] = await runActions(validateAgent({ reply: '', actions: [{ type: 'log_food', foods: [{ name: 'banana', amount: 1, unit: 'piece' }], meal: 'snacks', day: 'today' }] })!.actions, ctx());
    const [r0] = await runActions(validateAgent({ reply: '', actions: [{ type: 'log_food', foods: [{ name: 'banana', amount: 1, unit: 'piece' }], meal: 'breakfast', day: 'today' }] })!.actions, ctx());
    const ref = r1.lines[0].ref!;
    expect(ref).toMatch(/^e_/);
    expect(cardsNote([r1], [], [])).toContain(`[ref ${ref}]`);
    // "move it to lunch"
    const mv = validateAgent({ reply: '', actions: [{ type: 'move_food', ref, meal_to: 'lunch' }] })!.actions;
    const [m] = await runActions(mv, ctx());
    expect(m.kind).toBe('food');
    let s = useStore.getState();
    expect(s.entries.find((e) => e.id === ref)!.mealId).toBe('lunch');
    expect(s.entries.find((e) => e.id === r0.lines[0].ref)!.mealId).toBe('breakfast'); // the other banana stays put
    // "make it two"
    const [e] = await runActions(validateAgent({ reply: '', actions: [{ type: 'edit_food', ref, amount: 2, unit: 'piece' }] })!.actions, ctx());
    expect(e.title).toBe('Corrected');
    s = useStore.getState();
    expect(s.entries.find((x) => x.id === ref)!.qty.amount).toBe(2);
    // "delete it"
    const [x] = await runActions(validateAgent({ reply: '', actions: [{ type: 'delete_food', ref }] })!.actions, ctx());
    expect(x.title).toBe('Removed');
    expect(useStore.getState().entries).toHaveLength(before + 1);
    x.undo!();
    expect(useStore.getState().entries).toHaveLength(before + 2);
  });
  it('a ref that is gone falls back to the name', async () => {
    await runActions([{ type: 'log_food', foods: [{ name: 'banana', amount: 1, unit: 'piece' }], meal: 'snacks', day: 'today' }], ctx());
    const [m] = await runActions(validateAgent({ reply: '', actions: [{ type: 'move_food', ref: 'e_gone123', target: 'banana', meal_to: 'dinner' }] })!.actions, ctx());
    expect(m.kind).toBe('food');
  });
  it('junk refs are dropped', () => {
    const v = validateAgent({ reply: '', actions: [{ type: 'delete_food', ref: 'x; DROP TABLE' }] });
    expect(v).toMatchObject({ reply: '', actions: [], dropped: 1 }); // dropped, and counted: the Coach says so in a card
  });
});

describe('one conversation: what is said at the orb is known in the Coach', () => {
  it('orb turns join the saved chat, with refs, and Undo is remembered', async () => {
    const [r] = await runActions([{ type: 'log_food', foods: [{ name: 'banana', amount: 1, unit: 'piece' }], day: 'today' }], ctx());
    const id = appendExchange({ said: 'log a banana', reply: '', results: [r] });
    const list = readThread();
    expect(list.map((m) => m.role)).toEqual(['user', 'action']);
    const turns = threadTurns(list, 0);
    expect(turns[0].parts[0].text).toBe('log a banana');
    expect(turns[1].parts[0].text).toContain(`[ref ${r.lines[0].ref}]`);
    markInThread(id, r.id, 'undone');
    expect(threadTurns(readThread(), 0)[1].parts[0].text).toMatch(/^\(undone:/);
    expect(threadSaid(readThread())[0].text).toBe('log a banana');
  });
});

describe('plan a day: "chest and triceps with some shoulder tomorrow"', () => {
  const plan = async (a: Record<string, unknown>) => {
    const v = validateAgent({ reply: '', actions: [{ type: 'plan_day', ...a }] })!.actions;
    return (await runActions(v, ctx()))[0] as AgentResult;
  };
  it('builds it from their own exercises, waits for Apply, then puts it on that day only', async () => {
    const r = await plan({ day: 'tomorrow', focus: ['chest', 'triceps'], light: ['shoulders'] });
    expect(r.pending).toBe(true);
    expect(r.title).toMatch(/^Tomorrow: Chest \+ Triceps \+ Shoulders/);
    const st = useStore.getState();
    const pool = allExercises(st.exercises);
    const names = r.lines.map((l) => l.text);
    const muscles = names.map((n) => pool.find((e) => e.name === n)!.muscles[0]);
    expect(muscles.filter((m) => m === 'chest')).toHaveLength(3);
    expect(muscles.filter((m) => m === 'triceps')).toHaveLength(2);
    expect(muscles.filter((m) => m === 'shoulders')).toHaveLength(1);
    // the most-done chest exercise comes first, with a target from its history
    expect(r.lines[0].sub).toMatch(/\d+ × \d+.* · [\d.]+ kg × \d+/);
    const tomorrow = addDays(today, 1);
    const routinesBefore = st.routines.length;
    expect(st.routines.length).toBe(routinesBefore);
    r.button!.run();
    const s2 = useStore.getState();
    expect(s2.routines).toHaveLength(routinesBefore + 1);
    expect(plannedFor(s2, tomorrow, today)!.routineId).toBe(s2.routines[s2.routines.length - 1].id);
    expect(s2.schedule.weekly).toEqual(st.schedule.weekly); // the weekly plan is untouched
    r.undo!();
    const s3 = useStore.getState();
    expect(s3.routines).toHaveLength(routinesBefore);
    expect(s3.schedule).toEqual(st.schedule);
  });
  it('uses the exercises the Coach chose, and says when something they told it hurts is in it', async () => {
    const pool = allExercises(useStore.getState().exercises);
    const dips = pool.find((e) => /dip/i.test(e.name))!;
    useStore.getState().patch({ memory: [{ id: 'm1', text: 'Dips hurt his shoulder', kind: 'health', at: Date.now(), exerciseIds: [dips.id] }] } as any);
    const r = await plan({ day: today, add: [{ exercise: dips.name, sets: 4, repMin: 8, repMax: 12 }, { exercise: 'not a real exercise zzz' }] });
    expect(r.lines[0]).toMatchObject({ text: dips.name, warn: true });
    expect(r.lines.some((l) => /You told me: Dips hurt/.test(l.sub ?? ''))).toBe(true);
    expect(r.lines.some((l) => l.text === 'not a real exercise zzz' && l.warn)).toBe(true);
    // picked by the app, a hurt exercise is simply left out
    const r2 = await plan({ day: 'tomorrow', focus: ['triceps'] });
    expect(r2.lines.map((l) => l.text)).not.toContain(dips.name);
  });
  it('warns about a hard leg day before wrestling', async () => {
    const tomorrow = addDays(today, 1);
    useStore.getState().setSchedule({ activities: { [new Date(addDays(tomorrow, 1) + 'T12:00:00').getDay()]: ['wrestling'] } });
    const r = await plan({ day: 'tomorrow', focus: ['quads', 'hamstrings'] });
    expect(r.lines.some((l) => l.text === 'Wrestling the next day')).toBe(true);
  });
});

describe('the newest OpenAI model on the key', () => {
  it('picks the newest general model, never a smaller, dated, pro or older one', () => {
    expect(pickSolModel(['gpt-6.1-sol', 'gpt-6.5', 'gpt-6.5-mini', 'gpt-6.5-pro', 'gpt-6.5-2026-11-01', 'gpt-7-nano', 'whisper-1'])).toBe('gpt-6.5');
    expect(pickSolModel(['gpt-6.5', 'gpt-6.5-sol'])).toBe('gpt-6.5-sol');
    expect(pickSolModel(['gpt-5.5', 'gpt-4o', 'gpt-6.1-sol'])).toBe('gpt-6.1-sol');
    expect(pickSolModel(['gpt-5.5'])).toBeNull();
    expect(pickSolModel(['gpt-7'])).toBe('gpt-7');
  });
});
