// @vitest-environment jsdom
// Coach 2.0, phase 5 polish: "Undo all" for an answer that made several changes, a routine edit that lets you keep only
// some of its changes, a copy of a routine, small charts in the chat, and "Ask the Coach about this" (hold a food, a lift,
// a workout or a chart).
import { describe, it, expect, beforeEach } from 'vitest';
import { validateAgent, runActions, type AgentCtx, type AgentResult } from '../src/lib/agent';
import { ACTION_TYPES, AGENT_SCHEMA } from '../src/lib/gemini';
import { AGENT_SYSTEM } from '../src/lib/coachContext';
import { cardsNote, undoableIds } from '../src/ui/agentUi';
import { aboutFrom, askTag } from '../src/lib/askAbout';
import { threadTurns } from '../src/lib/thread';
import { useStore } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { buildDemo } from '../src/lib/demo';
import { makeT } from '../src/lib/i18n';
import { dayKey } from '../src/lib/dates';

const t = makeT('en') as any;
const today = dayKey(Date.now(), 0);
const ctx = (): AgentCtx => ({ t, lang: 'en', today, brain: null });
const run = async (...a: Record<string, unknown>[]): Promise<AgentResult[]> => runActions(validateAgent({ reply: '', actions: a })?.actions ?? [], ctx());
const routine = (name: string) => useStore.getState().routines.find((r) => r.name === name);

beforeEach(() => {
  localStorage.clear();
  const d = defaultData(); d.settings.foodLookup = false; d.settings.onboarded = true;
  useStore.getState().replaceAll({ ...d, ...buildDemo(d.settings) } as any);
});

describe('the new actions are taught and checked', () => {
  it('duplicate_routine and show_chart are in the schema and the guide; a made-up metric is dropped', () => {
    expect(ACTION_TYPES).toEqual(expect.arrayContaining(['duplicate_routine', 'show_chart']));
    const sys = AGENT_SYSTEM('en');
    expect(sys).toContain('duplicate_routine');
    expect(sys).toContain('show_chart');
    expect(sys).toContain('[about:');
    expect(JSON.stringify(AGENT_SCHEMA).length).toBeLessThan(16000);
    const v = validateAgent({ reply: '', actions: [{ type: 'show_chart', metric: 'happiness' }, { type: 'show_chart', metric: 'bodyweight', weeks: 8 }, { type: 'duplicate_routine' }] })!;
    expect(v.actions).toEqual([{ type: 'show_chart', metric: 'bodyweight', exercise: null, weeks: 8 }]);
  });
});

describe('a copy of a routine', () => {
  it('same exercises under a new name, its own ids, a second copy numbered, and Undo takes it away', async () => {
    const [r] = await run({ type: 'duplicate_routine', routine: 'push' });
    expect(r.title).toBe('Routine duplicated');
    const copy = routine('Push copy')!;
    const orig = routine('Push')!;
    expect(copy.items.map((i) => i.exerciseId)).toEqual(orig.items.map((i) => i.exerciseId));
    expect(copy.items.some((i) => orig.items.some((o) => o.id === i.id))).toBe(false);
    await run({ type: 'duplicate_routine', routine: 'push' });
    expect(routine('Push copy 2')).toBeTruthy();
    r.undo!();
    expect(routine('Push copy')).toBeUndefined();
    const [named] = await run({ type: 'duplicate_routine', routine: 'pull', rename: 'Pull (light)' });
    expect(named.lines[0].text).toBe('Pull (light)');
  });
});

describe('choose which changes to keep', () => {
  it('a rewrite is a preview with a tick per change; Apply does only the ticked ones and says so', async () => {
    const before = routine('Push')!;
    const [card] = await run({ type: 'edit_routine', routine: 'push', rename: 'Push A', remove: ['lateral raise'], change: [{ exercise: 'bench press', sets: 5 }], add: [{ exercise: 'Dip', sets: 3, repMin: 8, repMax: 12 }] });
    expect(card.pending).toBe(true);
    const picks = card.lines.map((l, i) => (l.pick ? i : -1)).filter((i) => i >= 0);
    expect(picks).toHaveLength(4);
    expect(routine('Push')).toEqual(before); // nothing yet
    // leave out the removal of the lateral raise
    const keep = card.lines.findIndex((l) => /lateral raise/i.test(l.text));
    card.off!.push(keep);
    card.button!.run();
    const after = useStore.getState().routines.find((r) => r.id === before.id)!;
    expect(after.name).toBe('Push A');
    expect(after.items.some((i) => i.exerciseId === 'lateral-raise')).toBe(true); // kept
    expect(after.items.find((i) => i.exerciseId === 'bench-press')!.workingSets).toBe(5);
    expect(after.items.length).toBe(before.items.length + 1);
    expect(card.doneSubtitle).toBe('3 of 4 changes applied');
    // what the model is told happened leaves out what was left out
    expect(cardsNote([card], [card.id], [])).not.toMatch(/lateral raise/i);
    card.undo!();
    const back = useStore.getState().routines.find((r) => r.id === before.id)!;
    expect({ name: back.name, items: back.items }).toEqual({ name: before.name, items: before.items });
  });
  it('a small edit still happens at once (no ticks)', async () => {
    const [card] = await run({ type: 'edit_routine', routine: 'push', change: [{ exercise: 'bench press', sets: 4 }] });
    expect(card.pending).toBeUndefined();
    expect(card.lines.some((l) => l.pick)).toBe(false);
    expect(routine('Push')!.items.find((i) => i.exerciseId === 'bench-press')!.workingSets).toBe(4);
  });
});

describe('Undo all', () => {
  it('counts only what was done and can still be undone', async () => {
    const rs = await run({ type: 'log_water', ml: 500 }, { type: 'duplicate_routine', routine: 'push' }, { type: 'show_chart', metric: 'bodyweight' });
    expect(undoableIds(rs, [], [])).toHaveLength(2); // (a chart has nothing to undo)
    expect(undoableIds(rs, [rs[0].id], [])).toHaveLength(1);
  });
});

describe('charts in the chat', () => {
  it('a lift: its estimated 1RM per session, as plain numbers that survive being saved', async () => {
    const [r] = await run({ type: 'show_chart', metric: 'strength', exercise: 'bench press' });
    expect(r.kind).toBe('chart');
    expect(r.chart!.type).toBe('line');
    expect(r.chart!.points.length).toBeGreaterThanOrEqual(2);
    expect(r.title).toMatch(/Bench Press · Estimated 1RM/);
    expect(JSON.parse(JSON.stringify(r)).chart).toEqual(r.chart);
  });
  it('bodyweight has its trend; calories have the target; weeks of workouts are bars', async () => {
    const [w] = await run({ type: 'show_chart', metric: 'bodyweight' });
    expect(w.chart!.trend!.length).toBeGreaterThan(1);
    const [c] = await run({ type: 'show_chart', metric: 'calories', weeks: 2 });
    expect(c.chart!.type).toBe('bar');
    expect(c.chart!.points).toHaveLength(14);
    expect(c.chart!.target).toBe(useStore.getState().settings.goals.kcal);
    const [s] = await run({ type: 'show_chart', metric: 'sessions', weeks: 6 });
    expect(s.chart!.points).toHaveLength(6);
  });
  it('nothing to draw: said plainly, never an empty chart', async () => {
    const [r] = await run({ type: 'show_chart', metric: 'strength', exercise: 'Nordic curl' });
    expect(r.kind).toBe('miss');
    useStore.setState({ weights: [] });
    const [w] = await run({ type: 'show_chart', metric: 'bodyweight' });
    expect(w.kind).toBe('miss');
  });
});

describe('Ask the Coach about this', () => {
  it('a held food: its numbers and its ref for the model, its name for the chip, three questions', () => {
    const e = useStore.getState().entries.at(-1)!;
    const a = aboutFrom(askTag('food', e.id))!;
    expect(a.detail).toContain(`[ref ${e.id}]`);
    expect(a.detail).toContain('kcal');
    expect(a.label).toContain(e.snap.name.split(',')[0]);
    expect(a.asks).toHaveLength(3);
  });
  it('a held lift brings its history; a workout its sets; a chart its numbers', () => {
    const lift = aboutFrom(askTag('lift', 'bench-press'))!;
    expect(lift.detail).toMatch(/Bench Press/);
    expect(lift.detail).toMatch(/\d+(\.\d+)?\s?kg/);
    const ses = useStore.getState().sessions.at(-1)!;
    const w = aboutFrom(askTag('workout', ses.id))!;
    expect(w.detail).toContain(ses.date);
    expect(w.detail).toMatch(/kg×/);
    const ch = aboutFrom(askTag('chart', 'bodyweight'))!;
    expect(ch.label).toBe('Bodyweight');
    expect(ch.detail).toMatch(/\d/);
    expect(aboutFrom(askTag('chart', 'strength|bench-press'))!.label).toMatch(/Bench Press/);
    expect(aboutFrom('food:nope')).toBeNull();
  });
  it('what was held stays with the message in the conversation the model sees', () => {
    const turns = threadTurns([{ id: 'u1', role: 'user', text: 'Is this good?', about: 'a logged food: Skyr [ref e1]', at: Date.now() }, { id: 'm1', role: 'model', text: 'Yes.' }], 0);
    expect(turns[0].parts[0].text).toBe('[about: a logged food: Skyr [ref e1]] Is this good?');
  });
});
