// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateAgent, runActions, type AgentCtx } from '../src/lib/agent';
import { useStore } from '../src/state/store';
import { defaultData, normaliseData, MEMORY_MAX } from '../src/state/defaults';
import { makeT } from '../src/lib/i18n';
import { memoryBlock, buildCoachContext } from '../src/lib/coachContext';
import { setsPerMuscle, usualDays, stalledLifts, reviewWeekEnd, weekReview } from '../src/lib/stats';
import { usageCost, recordUsage, spentKr, overLimit, USD_TO_DKK } from '../src/lib/spend';
import { solAgent } from '../src/lib/openai';
import { aiAgent } from '../src/lib/gemini';
import type { WorkoutSession, MuscleGroup } from '../src/lib/types';

const ctx = (): AgentCtx => ({ t: makeT('en') as any, lang: 'en', today: '2026-10-06', brain: null });
beforeEach(() => {
  localStorage.clear(); vi.restoreAllMocks();
  const d = defaultData(); d.settings.foodLookup = false; d.settings.onboarded = true;
  useStore.getState().replaceAll(d);
});

describe('memory', () => {
  it('remembers a lasting fact, with Undo, and links the exercise it is about', async () => {
    const v = validateAgent({ reply: 'Got it.', actions: [{ type: 'remember', text: 'Left shoulder hurts on overhead press.', kind: 'health', exercise: 'overhead press' }] })!;
    const [r] = await runActions(v.actions, ctx());
    expect(r.kind).toBe('memory'); expect(r.title).toBe('Remembered');
    const m = useStore.getState().memory;
    expect(m).toHaveLength(1); expect(m[0].kind).toBe('health'); expect(m[0].exerciseIds?.length).toBe(1);
    r.undo!(); expect(useStore.getState().memory).toHaveLength(0);
  });
  it('rewording the same thing updates it instead of adding a twin', async () => {
    await runActions(validateAgent({ reply: '', actions: [{ type: 'remember', text: 'No separate leg day', kind: 'preference' }] })!.actions, ctx());
    const [r] = await runActions(validateAgent({ reply: '', actions: [{ type: 'remember', text: 'No separate leg day; wrestling covers legs.', kind: 'preference' }] })!.actions, ctx());
    expect(r.title).toBe('Memory updated');
    expect(useStore.getState().memory.map((x) => x.text)).toEqual(['No separate leg day; wrestling covers legs.']);
  });
  it('forgets by the number the model saw, even when two are forgotten in one turn', async () => {
    const s = useStore.getState();
    s.addMemory({ text: 'A', kind: 'other' }); s.addMemory({ text: 'B', kind: 'other' }); s.addMemory({ text: 'C', kind: 'other' });
    expect(memoryBlock(useStore.getState(), (x) => x)).toContain('2. [other] B');
    await runActions(validateAgent({ reply: '', actions: [{ type: 'forget', memory: '1' }, { type: 'forget', memory: '3' }] })!.actions, ctx());
    expect(useStore.getState().memory.map((x) => x.text)).toEqual(['B']);
  });
  it('forgets by its words when there is no number', async () => {
    useStore.getState().addMemory({ text: 'Doesn’t do a separate leg day; wrestling covers legs.', kind: 'preference' });
    const [r] = await runActions(validateAgent({ reply: '', actions: [{ type: 'forget', target: 'the leg day thing with wrestling' }] })!.actions, ctx());
    expect(r.title).toBe('Forgotten'); expect(useStore.getState().memory).toHaveLength(0);
  });
  it('is part of the data (backups), cleaned on import, and capped', () => {
    const d = normaliseData({ memory: [{ id: 'm1', text: '  Cutting until Christmas ', kind: 'goal', at: 1 }, { id: 'm2', text: '', kind: 'goal' }, { text: 'no id' }, { id: 'm3', text: 'x', kind: 'weird' }] });
    expect(d.memory.map((m) => [m.text, m.kind])).toEqual([['Cutting until Christmas', 'goal'], ['x', 'other']]);
    const many = normaliseData({ memory: Array.from({ length: 60 }, (_, i) => ({ id: `m${i}`, text: `n${i}`, kind: 'other' })) });
    expect(many.memory).toHaveLength(MEMORY_MAX);
  });
});

const ses = (date: string, exs: { id: string; sets: { kg?: number; reps?: number; done?: boolean; type?: 'warmup' | 'working' }[] }[]): WorkoutSession => ({
  id: `s${date}${Math.random()}`, date, name: '', status: 'done', startedAt: 0, endedAt: 1,
  exercises: exs.map((e, i) => ({ id: `e${i}`, exerciseId: e.id, sets: e.sets.map((q, j) => ({ id: `q${j}`, type: q.type ?? 'working', weightKg: q.kg, reps: q.reps ?? 8, done: q.done ?? true })) })),
} as unknown as WorkoutSession);

describe('per muscle and wrestling', () => {
  const muscles: Record<string, MuscleGroup[]> = { bench: ['chest', 'triceps', 'shoulders'], row: ['back', 'biceps'] };
  it('counts finished working sets: main muscle 1, the others ½; warm-ups and unfinished sets don’t count', () => {
    const r = setsPerMuscle([ses('2026-10-05', [{ id: 'bench', sets: [{ kg: 80 }, { kg: 80 }, { kg: 80, done: false }, { kg: 40, type: 'warmup' }] }, { id: 'row', sets: [{ kg: 60 }] }])], (id) => muscles[id], '2026-09-30', '2026-10-06');
    expect([r.chest, r.triceps, r.shoulders, r.back, r.biceps, r.quads]).toEqual([2, 1, 1, 1, 0.5, 0]);
  });
  it('finds the days someone usually wrestles', () => {
    expect(usualDays(['2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10', '2026-09-13'])).toEqual([2, 4]); // Tue, Thu
    expect(usualDays(['2026-09-01'])).toEqual([]);
  });
  it('tells the Coach what wrestling trains and never to call the legs untrained', () => {
    const d = defaultData(); d.activities = [{ id: 'a', date: '2026-10-02', kind: 'wrestling', durationSec: 5400, at: 0 }];
    d.sessions = [ses('2026-10-05', [{ id: 'bench', sets: [{ kg: 80 }] }])];
    const txt = buildCoachContext(d, '2026-10-06', (x) => x, (id) => muscles[id]);
    expect(txt).toMatch(/Hard sets per muscle .* chest 1/);
    expect(txt).toMatch(/never call their legs untrained/);
  });
});

describe('stalled lifts and the weekly review', () => {
  it('a lift with no new best in its last 3 sessions (over 10+ days) has stalled; one still improving has not', () => {
    const list = [
      ses('2026-08-20', [{ id: 'bench', sets: [{ kg: 75, reps: 8 }] }, { id: 'row', sets: [{ kg: 60 }] }]),
      ses('2026-09-01', [{ id: 'bench', sets: [{ kg: 80, reps: 6 }] }, { id: 'row', sets: [{ kg: 62.5 }] }]),
      ses('2026-09-15', [{ id: 'bench', sets: [{ kg: 80, reps: 5 }] }, { id: 'row', sets: [{ kg: 65 }] }]),
      ses('2026-09-22', [{ id: 'bench', sets: [{ kg: 80, reps: 6 }] }, { id: 'row', sets: [{ kg: 67.5 }] }]),
      ses('2026-10-01', [{ id: 'bench', sets: [{ kg: 77.5, reps: 6 }] }, { id: 'row', sets: [{ kg: 70 }] }]),
    ];
    const st = stalledLifts(list, '2026-10-06');
    expect(st.map((x) => x.exerciseId)).toEqual(['bench']);
    expect(st[0].best).toEqual({ kg: 80, reps: 6 });
  });
  it('shows on the last day of the week from midday and on the first day of the next', () => {
    expect(reviewWeekEnd('2026-10-04', 13, 1)).toBe('2026-10-04'); // Sunday afternoon
    expect(reviewWeekEnd('2026-10-04', 9, 1)).toBeNull(); // Sunday morning
    expect(reviewWeekEnd('2026-10-05', 9, 1)).toBe('2026-10-04'); // Monday
    expect(reviewWeekEnd('2026-10-06', 9, 1)).toBeNull();
  });
  it('sums the week', () => {
    const d = defaultData();
    d.sessions = [ses('2026-09-29', [{ id: 'bench', sets: [{ kg: 80 }] }]), ses('2026-10-02', [{ id: 'bench', sets: [{ kg: 80 }] }]), ses('2026-09-24', [{ id: 'bench', sets: [{ kg: 80 }] }])];
    d.activities = [{ id: 'a', date: '2026-10-01', kind: 'wrestling', durationSec: 3600, at: 0 }];
    const r = weekReview(d, '2026-10-04');
    expect([r.sessions, r.prevSessions, r.wrestling]).toEqual([2, 1, 1]);
  });
});

describe('what to eat', () => {
  it('turns options into cards that wait for a tap; nothing is logged until then', async () => {
    const v = validateAgent({ reply: 'Two easy ones:', actions: [{ type: 'suggest_food', options: [
      { label: 'Skyr with banana', foods: [{ name: 'skyr', amount: 300, unit: 'g' }, { name: 'banana', amount: 1, unit: 'piece' }], totals: { kcal: 280, protein: 34 } },
      { label: 'Nothing', foods: [] }, { label: 'Tuna', foods: [{ name: 'tuna', amount: 1, unit: 'can' }] }, { label: 'Fourth', foods: [{ name: 'x' }] },
    ] }] })!;
    const a = v.actions[0] as any;
    expect(a.options.map((o: any) => o.label)).toEqual(['Skyr with banana', 'Tuna']); // empty dropped, max 3 read
    const cards = await runActions(v.actions, ctx());
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.pending && c.button)).toBe(true);
    expect(cards[0].subtitle).toMatch(/280 kcal · 34 g protein/);
    expect(useStore.getState().entries).toHaveLength(0);
  });
});

describe('spending meter', () => {
  it('prices answers from OpenAI’s usage (cached input is cheap, output dear) and stops at the limit', () => {
    expect(usageCost({ input_tokens: 1_000_000, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0 })).toBeCloseTo(2);
    expect(usageCost({ input_tokens: 1_000_000, input_tokens_details: { cached_tokens: 1_000_000 }, output_tokens: 0 })).toBeCloseTo(0.1);
    expect(usageCost({ input_tokens: 0, output_tokens: 1_000_000 })).toBeCloseTo(10);
    recordUsage({ input_tokens: 0, output_tokens: 1_000_000 });
    expect(spentKr()).toBeCloseTo(10 * USD_TO_DKK);
    expect(overLimit(50)).toBe(true); expect(overLimit(100)).toBe(false); expect(overLimit(0)).toBe(false);
  });
});

describe('photos reach the model', () => {
  const turns = [{ role: 'user' as const, parts: [{ text: '[photo] What is this?' }] }];
  const photo = { mime: 'image/jpeg', data: 'QUJD' };
  it('GPT-6.1 Sol: as an input_image in front of the words', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{"reply":"A leg press.","actions":[]}' }] }] }), { status: 200 }));
    await solAgent('S', turns, { key: 'k', effort: 'medium' }, undefined, photo);
    const body = JSON.parse(String((f.mock.calls[0][1] as RequestInit).body));
    expect(body.input[0].content[0]).toEqual({ type: 'input_image', image_url: 'data:image/jpeg;base64,QUJD' });
    expect(body.input[0].content[1]).toEqual({ type: 'input_text', text: '[photo] What is this?' });
  });
  it('Gemini: as an inline_data part in front of the words', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"reply":"A leg press.","actions":[]}' }] } }] }), { status: 200 }));
    await aiAgent('S', turns, { key: 'k', models: ['gemini-x'] }, photo);
    const body = JSON.parse(String((f.mock.calls[0][1] as RequestInit).body));
    expect(body.contents[0].parts[0]).toEqual({ inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } });
  });
});

describe('the conversation the model sees', () => {
  it('an offer that was not tapped never reads as eaten', async () => {
    const { cardsNote } = await import('../src/ui/agentUi');
    const r = (id: string, pending = false) => ({ id, kind: 'food' as const, title: id, lines: [], pending });
    expect(cardsNote([r('Skyr', true), r('Eggs', true)], ['Eggs'], [])).toBe('(offered, not taken: Skyr | done: Eggs)');
    expect(cardsNote([r('Banana')], [], ['Banana'])).toBe('(undone: Banana)');
    expect(cardsNote([], [], [])).toBe('');
  });
});
