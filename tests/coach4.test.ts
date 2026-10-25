// @vitest-environment jsdom
// Coach 2.0, phase 3: memory that grows. The whole conversation is kept and searched; memory notes are replaced and end by
// themselves; the Coach learns from what is applied and undone; the week is reviewed from numbers the app computes.
import { describe, it, expect, beforeEach } from 'vitest';
import { archive, archived, clearArchive, importArchive, searchArchive } from '../src/lib/archive';
import { readThread, threadSaid, writeThread, type ThreadMsg } from '../src/lib/thread';
import { runLookups } from '../src/lib/agentLookup';
import { useStore, allExercises } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { buildBackup, parseBackup } from '../src/lib/backup';
import { runActions, validateAgent, type AgentCtx, type AgentResult } from '../src/lib/agent';
import { memoryBlock } from '../src/lib/coachContext';
import { makeT } from '../src/lib/i18n';
import { addDays, dayKey, startOfWeek } from '../src/lib/dates';
import { MEMORY_MAX } from '../src/state/defaults';

const t = makeT('en') as any;
const today = dayKey(Date.now(), 0);
const ctx = (): AgentCtx => ({ t, lang: 'en', today, brain: null });
const act = async (a: Record<string, unknown>) => (await runActions(validateAgent({ reply: '', actions: [a] })!.actions, ctx()))[0] as AgentResult;

const DAY = 86_400_000;
const env = () => ({ today: '2026-10-16', lang: 'en' as const, pool: allExercises(useStore.getState().exercises), mealLabel: (x: string) => x });

describe('the whole conversation, kept', () => {
  beforeEach(async () => { await clearArchive(); localStorage.clear(); useStore.getState().replaceAll(defaultData('en')); });

  it('keeps what the chat lets go of (the chat holds 60, the archive all of it)', () => {
    const t0 = Date.now() - 200 * DAY;
    const msgs: ThreadMsg[] = [];
    for (let i = 0; i < 100; i++) msgs.push({ id: `m${i}`, role: i % 2 ? 'model' : 'user', text: i === 0 ? 'My left knee hurts on lunges' : `message ${i}`, at: t0 + i * 60_000 });
    writeThread(msgs);
    expect(readThread()).toHaveLength(60);
    expect(archived()).toHaveLength(100);
    const out = runLookups(useStore.getState(), [{ kind: 'conversations', query: 'knee' }], { ...env(), said: threadSaid(readThread()) });
    expect(out).toMatch(/User: My left knee hurts on lunges/);
    expect(out).toMatch(/↳ Coach: message 1/); // with the answer beside it
  });

  it('writes a message once, and again only when it changed (a card applied later)', () => {
    archive([{ id: 'a', at: 1, role: 'cards', text: '(preview, not applied: Your week)' }]);
    archive([{ id: 'a', at: 5, role: 'cards', text: '(preview, not applied: Your week)' }]);
    archive([{ id: 'a', at: 9, role: 'cards', text: '(done: Your week)' }]);
    expect(archived()).toEqual([{ id: 'a', at: 1, role: 'cards', text: '(done: Your week)' }]);
  });

  it('searches in Danish and English, by the start of a word, best match first, within a range', () => {
    const list = [
      { at: Date.parse('2026-08-02T10:00'), role: 'user' as const, text: 'Mit knæ gør ondt efter brydning' },
      { at: Date.parse('2026-08-02T10:01'), role: 'model' as const, text: 'Tag det roligt med squat i dag.' },
      { at: Date.parse('2026-09-10T09:00'), role: 'user' as const, text: 'log a banana' },
      { at: Date.parse('2026-10-01T09:00'), role: 'user' as const, text: 'knæet er bedre nu' },
    ];
    expect(searchArchive(list, 'knæ').map((x) => x.text)).toEqual(['Mit knæ gør ondt efter brydning', 'knæet er bedre nu']);
    expect(searchArchive(list, 'knæ', '2026-09-01').map((x) => x.text)).toEqual(['knæet er bedre nu']);
    expect(searchArchive(list, 'what did i say about the')).toEqual([]); // only words that carry meaning count
    expect(searchArchive(list, 'knæ brydning')[0].beside?.text).toBe('Tag det roligt med squat i dag.');
  });

  it('rides along in backups and merges back in (an old backup without it still restores)', () => {
    archive([{ id: 'x1', at: 1000, role: 'user', text: 'hello' }]);
    const b = buildBackup();
    expect(b.chat).toHaveLength(1);
    const parsed = parseBackup(JSON.stringify(b), 'en');
    clearArchive();
    importArchive(parsed.chat);
    expect(archived().map((m) => m.text)).toEqual(['hello']);
    const old = parseBackup(JSON.stringify({ app: 'aven', v: 1, data: defaultData('en') }), 'en');
    expect(old.chat).toBeUndefined();
    importArchive(old.chat);
    expect(archived()).toHaveLength(1);
  });
});

describe('memory that grows: newer replaces older, temporary things end', () => {
  beforeEach(() => { localStorage.clear(); useStore.getState().replaceAll(defaultData('en')); });

  it('a correction replaces the note the Coach named, keeps the old wording, and Undo puts it back', async () => {
    await act({ type: 'remember', text: 'Trains Monday, Wednesday and Friday.', kind: 'schedule' });
    const id = useStore.getState().memory[0].id;
    const r = await act({ type: 'remember', text: 'Trains Tuesday and Thursday now.', kind: 'schedule', memory: '1' });
    const m = useStore.getState().memory;
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ id, text: 'Trains Tuesday and Thursday now.' });
    expect(m[0].was?.[0].text).toBe('Trains Monday, Wednesday and Friday.');
    expect(r.title).toBe('Memory updated');
    expect(r.was).toBe('Trains Monday, Wednesday and Friday.');
    r.undo!();
    expect(useStore.getState().memory[0]).toMatchObject({ text: 'Trains Monday, Wednesday and Friday.' });
    expect(useStore.getState().memory[0].was).toBeUndefined();
  });

  it('a temporary thing ends by itself: the Coach stops following it the day after', async () => {
    const end = addDays(today, 3);
    const r = await act({ type: 'remember', text: 'Is sick; no heavy training.', kind: 'health', until: end });
    expect(r.lines[0].sub).toMatch(/^until /);
    expect(useStore.getState().memory[0].until).toBe(end);
    const now = Date.now();
    expect(memoryBlock(useStore.getState(), (x) => x, now)).toMatch(/1\. \[health\] Is sick; no heavy training\. \(until .+\) \(today\)/);
    expect(memoryBlock(useStore.getState(), (x) => x, now + 5 * 86_400_000)).toMatch(/1\. \(ended .+, ignore\) Is sick/);
  });

  it('an end date in the past or years away is not taken', async () => {
    await act({ type: 'remember', text: 'Deload week.', kind: 'schedule', until: addDays(today, -2) });
    await act({ type: 'remember', text: 'Holiday.', kind: 'schedule', until: addDays(today, 900) });
    expect(useStore.getState().memory.every((m) => !m.until)).toBe(true);
  });

  it('when memory is full, a note that has ended makes room', async () => {
    const st = useStore.getState();
    for (let i = 0; i < MEMORY_MAX; i++) st.addMemory({ text: `fact number ${i} about training`, kind: 'other', ...(i === 3 ? { until: addDays(today, -1) } : {}) });
    const r = await act({ type: 'remember', text: 'Competes in the 74 kg class.', kind: 'goal' });
    expect(r.title).toBe('Remembered');
    const m = useStore.getState().memory;
    expect(m).toHaveLength(MEMORY_MAX);
    expect(m.some((x) => x.text === 'fact number 3 about training')).toBe(false);
  });

  it('the new fields survive a save and a backup', async () => {
    await act({ type: 'remember', text: 'Shoulder sore this week.', kind: 'health', until: addDays(today, 5) });
    await act({ type: 'remember', text: 'Shoulder better, still careful overhead.', kind: 'health', memory: '1' });
    const back = parseBackup(JSON.stringify(buildBackup()), 'en').data.memory[0];
    expect(back.was?.[0].text).toBe('Shoulder sore this week.');
    expect(typeof back.updatedAt).toBe('number');
  });
});

describe('it learns from what is kept, undone and corrected', () => {
  beforeEach(() => { localStorage.clear(); useStore.getState().replaceAll(defaultData('en')); });

  it('one moment is never a rule; two that agree are, and an undone one is taken back', async () => {
    const { noteEvent, learnedRules, learnedBlock, dismissRule } = await import('../src/lib/ledger');
    noteEvent({ k: 'move', food: 'Skyr', meal: 'breakfast' });
    expect(learnedRules()).toEqual([]);
    const back = noteEvent({ k: 'move', food: 'skyr', meal: 'breakfast' });
    expect(learnedRules()[0]).toMatchObject({ kind: 'move', b: 'breakfast', count: 2 });
    expect(learnedBlock((x) => x, (m) => m)).toMatch(/it belongs in breakfast/);
    back(); // that move was undone
    expect(learnedRules()).toEqual([]);
    noteEvent({ k: 'move', food: 'skyr', meal: 'breakfast' });
    dismissRule(learnedRules()[0].id);
    expect(learnedRules()).toEqual([]);
    expect(learnedBlock((x) => x, (m) => m)).toBe('');
  });

  it('a planned day taken back twice with the same lift → leave it out; a kept day with it cancels that', async () => {
    const { noteEvent, learnedRules } = await import('../src/lib/ledger');
    noteEvent({ k: 'plan', ok: false, exercises: ['ohp', 'bench'] });
    noteEvent({ k: 'plan', ok: false, exercises: ['ohp', 'dips'] });
    noteEvent({ k: 'plan', ok: true, exercises: ['bench'] });
    expect(learnedRules().map((r) => r.id)).toEqual(['avoid:ohp']);
  });

  it('the Coach notes it itself: a setting changed back twice', async () => {
    const { learnedRules } = await import('../src/lib/ledger');
    for (let i = 0; i < 2; i++) { const r = await act({ type: 'set_setting', key: 'theme', value: i ? 'dark' : 'light' }); r.undo!(); }
    expect(learnedRules()).toMatchObject([{ kind: 'setting', a: 'theme', count: 2 }]);
  });
});

describe('the weekly review: the app computes, the Coach only chooses', () => {
  const musclesOf = (id: string) => allExercises(useStore.getState().exercises).find((e) => e.id === id)?.muscles;
  const demo = async () => {
    const { buildDemo } = await import('../src/lib/demo');
    const d = defaultData('en'); d.settings.onboarded = true;
    useStore.getState().replaceAll({ ...d, ...buildDemo(d.settings) } as any);
    return useStore.getState();
  };
  const lastWeekEnd = () => addDays(startOfWeek(today, useStore.getState().settings.weekStart), -1);

  it('numbers from the data: sets per muscle against the usual week, planned vs done; days not logged stay unknown', async () => {
    const { reviewNumbers } = await import('../src/lib/weekReview');
    const d = await demo();
    const end = lastWeekEnd();
    const n = reviewNumbers(d, end, musclesOf);
    expect(n.from).toBe(addDays(end, -6));
    expect(n.sets).toBeGreaterThan(0);
    expect(n.muscles.length).toBeGreaterThan(0);
    expect(n.missed).toBeLessThanOrEqual(n.planned);
    // no food logged at all: protein is unknown, never 0
    useStore.getState().replaceAll({ ...useStore.getState(), entries: [] } as any);
    const m = reviewNumbers(useStore.getState(), end, musclesOf);
    expect(m.loggedDays).toBe(0);
    expect(m.proteinAvg).toBeNull();
  });

  it('candidates come from the numbers, the most important first; each can be checked a week later', async () => {
    const { candidates, met } = await import('../src/lib/weekReview');
    const d = await demo();
    const n: any = { from: '2026-10-05', to: '2026-10-11', sessions: 2, prevSessions: 3, wrestling: 1, proteinAvg: 110, kcalAvg: 2500, loggedDays: 6, records: 0, weightRate: -1.2, stalls: [], planned: 4, missed: 2, sets: 30, muscles: [{ m: 'back', sets: 2, avg: 10 }, { m: 'chest', sets: 12, avg: 11 }], streak: 3, weightPct: -1.5 };
    const list = candidates({ ...d, settings: { ...d.settings, goals: { ...d.settings.goals, protein: 160 } } } as any, n, (x) => x, (m) => m);
    expect(list.map((c) => c.id)).toEqual(['weight', 'missed', 'protein', 'muscle:back']);
    expect(list.find((c) => c.id === 'protein')!.vars).toEqual({ avg: 110, goal: 160 });
    expect(met('protein', { ...n, proteinAvg: 150 }, 160)).toBe(true);
    expect(met('muscle:back', { ...n, muscles: [{ m: 'back', sets: 9, avg: 10 }] }, 160)).toBe(true);
    expect(met('missed', { ...n, planned: 0 }, 160)).toBeNull();
  });

  it('a review is kept (one per week, the newest 26) and survives a backup; the Coach reads what happened after it', async () => {
    const { storedReview, reviewsBlock } = await import('../src/lib/weekReview');
    await demo();
    const st = useStore.getState();
    st.saveReview(storedReview('2026-09-27', 'Good week.', [{ id: 'protein', text: 'Get protein to 160 g a day' }]));
    st.saveReview(storedReview('2026-09-27', 'Better wording.', [{ id: 'protein', text: 'Protein to 160 g' }]));
    expect(useStore.getState().reviews).toHaveLength(1);
    expect(useStore.getState().reviews![0].verdict).toBe('Better wording.');
    const back = parseBackup(JSON.stringify(buildBackup()), 'en').data;
    expect(back.reviews).toEqual(useStore.getState().reviews);
    expect(reviewsBlock(useStore.getState(), musclesOf)).toMatch(/week ending 2026-09-27: "Better wording\." priorities: Protein to 160 g \((not )?done the week after\)|week ending 2026-09-27: "Better wording\." priorities: Protein to 160 g$/m);
    const old = parseBackup(JSON.stringify({ app: 'aven', v: 1, data: defaultData('en') }), 'en').data;
    expect(old.reviews).toEqual([]);
  });

  it('the Coach may only choose the app’s candidates', async () => {
    const { aiWeekReview } = await import('../src/lib/gemini');
    const reply = { verdict: 'Solid week.', priorities: [{ id: 'protein', text: 'More protein' }, { id: 'invented', text: 'Run a marathon' }, { id: 'protein', text: 'again' }] };
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }), { status: 200 })) as any;
    try {
      const r = await aiWeekReview('WEEK …', { key: 'k', models: ['gemini-2.5-flash'] } as any, 'en', ['protein', 'missed']);
      expect(r).toEqual({ verdict: 'Solid week.', priorities: [{ id: 'protein', text: 'More protein' }] });
    } finally { globalThis.fetch = orig; }
  });
});
