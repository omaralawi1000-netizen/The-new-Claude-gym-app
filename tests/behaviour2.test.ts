// @vitest-environment jsdom
// Behaviour test round 2 (an independent reviewer, 19 Oct; the findings it made are fixed): the Coach brain stack as Omar and his friends would live it. Every
// assertion is the CORRECT behaviour from the user's side; a failing one is a finding (see the report).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// a stand-in for the paid verdict call (the real brainFor decides whether there is a brain at all)
let answer: any = null;
let calls = 0;
let hold: Promise<void> | null = null;
vi.mock('../src/lib/brain', async (orig) => ({
  ...(await orig<typeof import('../src/lib/brain')>()),
  thinkJson: async () => { calls++; if (hold) await hold; return answer; },
}));
// a stand-in for the Coach's model (Gemini-only user)
let script: unknown[] = [];
vi.mock('../src/lib/gemini', async (orig) => ({
  ...(await orig<typeof import('../src/lib/gemini')>()),
  aiAgent: vi.fn(async () => script.shift()),
}));

import { useStore, allExercises } from '../src/state/store';
import { useUI } from '../src/state/ui';
import { useAi } from '../src/state/ai';
import { defaultData, normaliseData, DATA_VERSION } from '../src/state/defaults';
import { checkEating } from '../src/lib/eatingWatch';
import { catchUpOn, justNoticed, kcalTargetFor } from '../src/lib/eating';
import { trimAllowed } from '../src/lib/verdict';
import { runActions, type AgentAction } from '../src/lib/agent';
import { decide, route } from '../src/lib/agentTurn';
import { parseBackup, snapshotData } from '../src/lib/backup';
import { trueMaintenance } from '../src/lib/maintenance';
import { makeT } from '../src/lib/i18n';
import { addDays } from '../src/lib/dates';
import type { AppData, CatchUp, FoodEntry, HealthDay, MemoryNote } from '../src/lib/types';

const t = makeT('en') as any;
let n = 0;
const at = (day: string, h: number, m = 0) => { const [y, mo, d] = day.split('-').map(Number); return new Date(y, mo - 1, d, h, m).getTime(); };
const food = (date: string, kcal: number, when: number, mealId = 'dinner', id = `e${n++}`): FoodEntry => ({ id, date, mealId, at: when, snap: { name: `food ${mealId}`, basis: 'g', per100: { kcal } } as any, qty: { amount: 100, unit: 'g' } as any, base: 100, nutrients: { kcal, protein: 20 } });
const mem = (text: string, kind: MemoryNote['kind'] = 'other'): MemoryNote => ({ id: `m${n++}`, text, kind, at: 0 });
const data = () => useStore.getState() as unknown as AppData;
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 10; i++) await Promise.resolve(); };

// every toast, not just the last three the UI keeps
let shown: { text: string; actionLabel?: string; onAction?: () => void }[] = [];
const decisions = () => shown.filter((x) => x.actionLabel === 'Undo');

const withKey = () => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTEST' })); useAi.setState({ hasGemini: true, hasOpenai: false, solFirst: false }); };
const noKey = () => { localStorage.removeItem('aven.keys'); useAi.setState({ hasGemini: false, hasOpenai: false, solFirst: false }); };

/** A normal day for Omar (breakfast, lunch, dinner = 2,500). */
const normalDay = (day: string, dinner = 1000) => [food(day, 600, at(day, 8), 'breakfast'), food(day, 900, at(day, 13), 'lunch'), food(day, dinner, at(day, 19), 'dinner')];
/** Four weeks of history before 12 Oct (2,300 a day, losing 0.3 kg a week, weighing every other day). */
const history = () => {
  const entries: FoodEntry[] = []; const weights: AppData['weights'] = [];
  for (let i = 28; i >= 1; i--) {
    const day = addDays('2026-10-12', -i);
    entries.push(food(day, 600, at(day, 8), 'breakfast'), food(day, 900, at(day, 13), 'lunch'), food(day, 800, at(day, 19), 'dinner'));
    if (i % 2 === 0) weights.push({ id: `w${i}`, date: day, kg: Math.round((86 - (0.3 / 7) * (28 - i)) * 10) / 10, at: 0 });
  }
  return { entries, weights };
};
function omar(): AppData {
  const d = defaultData(); d.settings.onboarded = true; d.settings.dayStartHour = 4; d.settings.goals.kcal = 2500; d.settings.goals.protein = 180;
  d.settings.profile.goal = 'fatloss';
  d.memory = [mem('Age: 20 (as of 2026-09-01)')];
  d.marks = { heavySeen: '2026-10-01' }; // (not the first run on this phone)
  const h = history(); d.entries = h.entries; d.weights = h.weights;
  return d;
}
const go = (when: number) => vi.setSystemTime(when);
const check = async (when: number) => { go(when); checkEating(when); await settle(); };
const setKcal = (kcal: number) => { const s = useStore.getState(); s.updateSettings({ goals: { ...s.settings.goals, kcal } }); };

/** The target shown for `day` is within the limits: never above their own, never more than 250 lower, never under the
 *  floor of any running catch-up (or 1,800). */
function within(day: string, label: string) {
  const d = data(); const base = d.settings.goals.kcal!;
  const k = kcalTargetFor(d, day)!;
  const running = (d.catchUps ?? []).filter((c) => !c.off && c.perDay > 0 && c.days.includes(day));
  const floor = running.length ? Math.min(...running.map((c) => c.floor)) : base;
  expect.soft(k, `${label}: ${day} not above own target`).toBeLessThanOrEqual(base);
  expect.soft(base - k, `${label}: ${day} at most 250 off`).toBeLessThanOrEqual(250);
  expect.soft(k, `${label}: ${day} never under the floor`).toBeGreaterThanOrEqual(Math.min(base, floor, Math.max(1800, floor)));
  const on = catchUpOn(d, day);
  expect.soft(on ? base - on.perDay : base, `${label}: ${day} the Food line matches the ring`).toBe(k);
}
const allWithin = (today: string, label: string) => { for (let i = 0; i <= 4; i++) within(addDays(today, i), label); };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  localStorage.clear(); withKey();
  answer = { plan: 'trim', perDay: 200, days: 3, line: 'Yesterday +2,000. Mostly water. −200 a day for 3 days.', why: 'Rare; the trend is on track.' };
  calls = 0; hold = null; shown = []; script = [];
  useUI.setState({ toasts: [], toast: ((text: string, o: any = {}) => { shown.push({ text, ...o }); return `t${shown.length}`; }) as any });
});
afterEach(() => { vi.useRealTimers(); });

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('1. Omar\'s week (2,500 target, fat loss, age stored, day starts 04:00)', () => {
  const MON = '2026-10-12', TUE = '2026-10-13', WED = '2026-10-14', THU = '2026-10-15', FRI = '2026-10-16';
  beforeEach(() => { go(at(MON, 7)); useStore.getState().replaceAll(omar()); });

  it('logs late, corrects, deletes, eats late, changes the target, goes Quiet and back: one pop-up per heavy day, limits always hold', async () => {
    const s = () => useStore.getState();
    // Monday: a normal day in the log; the big evening is not logged
    go(at(MON, 8)); s().logEntries(normalDay(MON));
    await check(at(MON, 21)); allWithin(MON, 'mon');
    expect(decisions()).toHaveLength(0);

    // Tuesday 08:50: last night's 2,000 logged into Monday
    go(at(TUE, 8)); s().logEntries([food(TUE, 600, at(TUE, 8), 'breakfast')]);
    go(at(TUE, 8, 50)); s().logEntries([food(MON, 2000, at(TUE, 8, 50), 'snacks', 'big')]);
    await check(at(TUE, 8, 52));
    expect(calls).toBe(1);
    expect(decisions()).toHaveLength(1);
    expect(kcalTargetFor(data(), TUE)).toBe(2300);
    allWithin(TUE, 'tue 08:52');

    // 09:30: it was really 1,200 → the trim shrinks, no new pop-up, no new paid call
    go(at(TUE, 9, 30)); const big = data().entries.find((e) => e.id === 'big')!;
    s().updateEntry('big', { ...big, nutrients: { ...big.nutrients, kcal: 1200 } });
    await check(at(TUE, 9, 31));
    expect(calls).toBe(1); expect(decisions()).toHaveLength(1);
    const c1 = data().catchUps!.find((c) => c.date === MON)!;
    expect(c1.over).toBe(1200);
    expect(c1.perDay * c1.days.filter((x) => x >= TUE).length).toBeLessThanOrEqual(600); // ≤ half of the 1,200
    allWithin(TUE, 'tue 09:31');

    // 10:00: deleted after all → the cut is gone, said once
    go(at(TUE, 10)); s().removeEntry('big');
    await check(at(TUE, 10, 1));
    expect(kcalTargetFor(data(), TUE)).toBe(2500);
    expect(shown.at(-1)!.text).toBe('Your normal calorie target is back');
    expect(decisions()).toHaveLength(1);

    // Tuesday lunch, then dinner logged at 00:30 (still Tuesday in the app)
    go(at(TUE, 13)); s().logEntries([food(TUE, 900, at(TUE, 13), 'lunch')]);
    answer = { plan: 'trim', perDay: 250, days: 4, line: 'Tonight +1,400: −250 a day for 4 days.', why: '' }; // (asks too much)
    go(at(WED, 0, 30)); s().logEntries([food(TUE, 2400, at(WED, 0, 30), 'dinner')]);
    await check(at(WED, 0, 31));
    expect(calls).toBe(2);
    expect(decisions()).toHaveLength(2);
    const c2 = data().catchUps!.find((c) => c.date === TUE)!;
    expect(c2.trigger).toBe('live');
    expect(c2.days[0]).toBe(WED); // (starts the next app day)
    expect(c2.perDay * c2.days.length).toBeLessThanOrEqual(700); // half of +1,400 at most
    expect(decisions().at(-1)!.text).not.toMatch(/4 days/); // (the pop-up says what really happens)
    allWithin(TUE, 'wed 00:31');

    // Wednesday noon: target lowered to 1,900 → no past day turns heavy, nothing pops up, limits hold
    go(at(WED, 12)); setKcal(1900);
    await check(at(WED, 12, 1));
    expect(decisions()).toHaveLength(2); expect(calls).toBe(2);
    expect(data().catchUps!.some((c) => c.date === MON && !c.off && !c.gone)).toBe(false); // (Monday is back to normal against its own 2,500)
    allWithin(WED, 'wed after 1,900');

    // Wednesday 21:00: notices to Quiet. Thursday: a big evening → recorded, no pop-up, no paid call, no cut
    go(at(WED, 19)); s().logEntries(normalDay(WED));
    go(at(WED, 21)); s().updateSettings({ heavyDays: 'quiet' });
    go(at(THU, 8)); s().logEntries([food(THU, 600, at(THU, 8), 'breakfast'), food(THU, 900, at(THU, 13), 'lunch')]);
    go(at(THU, 21)); s().logEntries([food(THU, 2000, at(THU, 21), 'dinner')]);
    await check(at(THU, 21, 1));
    expect(decisions()).toHaveLength(2); expect(calls).toBe(2);
    expect(kcalTargetFor(data(), THU)).toBe(1900);
    expect(kcalTargetFor(data(), FRI)).toBe(1900);

    // Friday 08:00: back On → nothing about Thursday; 08:50 more logged into Thursday → still nothing
    go(at(FRI, 8)); s().updateSettings({ heavyDays: 'on' });
    await check(at(FRI, 8, 1));
    go(at(FRI, 8, 50)); s().logEntries([food(THU, 800, at(FRI, 8, 50), 'snacks')]);
    await check(at(FRI, 8, 51));
    expect(decisions()).toHaveLength(2); expect(calls).toBe(2);
    allWithin(FRI, 'fri');

    // Friday evening: a new heavy day after switching on is judged (once)
    go(at(FRI, 13)); s().logEntries([food(FRI, 600, at(FRI, 8), 'breakfast'), food(FRI, 900, at(FRI, 13), 'lunch')]);
    go(at(FRI, 22)); s().logEntries([food(FRI, 2200, at(FRI, 22), 'dinner')]);
    await check(at(FRI, 22, 1));
    await check(at(FRI, 22, 30));
    expect(decisions()).toHaveLength(3);
    allWithin(FRI, 'fri night');
  });

  it('Undo on the pop-up: the normal target is back and the day is never decided again', async () => {
    const s = useStore.getState();
    go(at(MON, 8)); s.logEntries(normalDay(MON));
    go(at(TUE, 8, 50)); useStore.getState().logEntries([food(MON, 2000, at(TUE, 8, 50), 'snacks', 'big')]);
    await check(at(TUE, 8, 52));
    expect(kcalTargetFor(data(), TUE)).toBe(2300);
    decisions()[0].onAction!();
    expect(kcalTargetFor(data(), TUE)).toBe(2500);
    expect(catchUpOn(data(), TUE)).toBeNull();
    // more logged into Monday, a correction, the app opened again: nothing comes back
    useStore.getState().logEntries([food(MON, 400, at(TUE, 9), 'snacks')]);
    await check(at(TUE, 9, 1)); await check(at(TUE, 12));
    expect(decisions()).toHaveLength(1); expect(calls).toBe(1);
    expect(kcalTargetFor(data(), TUE)).toBe(2500);
  });

  it('two checks at once (the start check and a log) while the brain thinks: one paid call, one pop-up', async () => {
    let free!: () => void; hold = new Promise((r) => { free = r; });
    go(at(MON, 8)); useStore.getState().logEntries(normalDay(MON));
    go(at(TUE, 8, 50)); useStore.getState().logEntries([food(MON, 2000, at(TUE, 8, 50), 'snacks')]);
    checkEating(at(TUE, 8, 51)); checkEating(at(TUE, 8, 52)); await settle();
    free(); await settle();
    expect(calls).toBe(1); expect(decisions()).toHaveLength(1);
  });

  it('JUDGEMENT: deleted and re-logged correctly a few minutes later → the same evening is decided (and popped up) again', async () => {
    go(at(MON, 8)); useStore.getState().logEntries(normalDay(MON));
    go(at(TUE, 8, 50)); useStore.getState().logEntries([food(MON, 2000, at(TUE, 8, 50), 'snacks', 'big')]);
    await check(at(TUE, 8, 52));
    go(at(TUE, 9)); useStore.getState().removeEntry('big');
    await check(at(TUE, 9, 0)); // (the 1.5 s debounce has passed: he takes a minute to re-type it)
    go(at(TUE, 9, 2)); useStore.getState().logEntries([food(MON, 1500, at(TUE, 9, 2), 'snacks')]);
    await check(at(TUE, 9, 4));
    // one heavy evening → one decision pop-up and one paid call (here: 2 of each, plus "normal target is back")
    expect.soft(decisions(), 'decision pop-ups for one evening').toHaveLength(1);
    expect.soft(calls, 'paid calls for one evening').toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('2. friends who must never get a cut', () => {
  const TODAY = '2026-10-19';
  const friend = (o: { goal: AppData['settings']['profile']['goal']; memory: MemoryNote[] }) => {
    const d = defaultData(); d.settings.onboarded = true; d.settings.dayStartHour = 0; d.settings.goals.kcal = 2600; d.settings.goals.protein = 150;
    d.settings.profile.goal = o.goal; d.memory = o.memory; d.marks = { heavySeen: '2026-10-01' };
    return d;
  };
  const people: [string, () => AppData, () => void, RegExp][] = [
    ['no age, goal muscle', () => friend({ goal: 'muscle', memory: [] }), withKey, /fat-loss goal/],
    ['a teen (Age: 16)', () => friend({ goal: 'fatloss', memory: [mem('Age: 16 (as of 2026-08-15)')] }), withKey, /under 18/],
    ['an eating-disorder signal in MEMORY', () => friend({ goal: 'fatloss', memory: [mem('Age: 27 (as of 2026-05-01)'), mem('Eating-disorder signal: makes himself throw up after big evenings', 'health')] }), withKey, /isn’t good for you/],
    ['fat loss, no age stored', () => friend({ goal: 'fatloss', memory: [] }), withKey, /age/],
  ];

  for (const [who, make, key, why] of people) {
    it(`${who}: a week of heavy evenings and late logs → never a cut, no paid verdict; catch_up refuses with a reason`, async () => {
      go(at('2026-10-12', 7)); key(); useStore.getState().replaceAll(make());
      answer = { plan: 'trim', perDay: 250, days: 4, line: 'cut', why: '' };
      for (let i = 0; i < 7; i++) {
        const day = addDays('2026-10-12', i);
        go(at(day, 13)); useStore.getState().logEntries([food(day, 700, at(day, 8), 'breakfast'), food(day, 900, at(day, 13), 'lunch')]);
        if (i % 2 === 0) { go(at(day, 22)); useStore.getState().logEntries([food(day, 2800, at(day, 22))]); await check(at(day, 22, 5)); }
        else { go(at(addDays(day, 1), 8, 50)); useStore.getState().logEntries([food(day, 2400, at(addDays(day, 1), 8, 50), 'snacks')]); await check(at(addDays(day, 1), 8, 51)); }
        for (let k = 0; k <= 4; k++) expect.soft(kcalTargetFor(data(), addDays(day, k)), `${who} ${addDays(day, k)}`).toBe(2600);
      }
      expect(calls).toBe(0);
      go(at(TODAY, 9));
      const [r] = await runActions([{ type: 'catch_up', on: true, over: 1800, day: null } as AgentAction], { t, lang: 'en', today: TODAY, brain: null });
      expect(r.kind).toBe('miss');
      expect(r.lines.map((l) => l.text).join(' ')).toMatch(why);
      expect(kcalTargetFor(data(), TODAY)).toBe(2600);
    });
  }

  it('no AI key: heavy days are noticed with "no cut", and the Coach cannot set a catch-up at all', async () => {
    go(at('2026-10-18', 8)); noKey();
    const d = friend({ goal: 'fatloss', memory: [mem('Age: 30 (as of 2026-01-01)')] }); useStore.getState().replaceAll(d);
    useStore.getState().logEntries([food('2026-10-18', 2600, at('2026-10-18', 13)), food('2026-10-18', 2000, at('2026-10-19', 8, 50), 'snacks')]);
    await check(at('2026-10-19', 8, 51));
    expect(calls).toBe(0);
    expect(decisions()[0].text).toMatch(/no cut/);
    expect(kcalTargetFor(data(), TODAY)).toBe(2600);
    const dec = await decide('I ate 2000 too much yesterday, set a catch-up for me', { lang: 'en', t, pool: allExercises(useStore.getState().exercises), history: [], where: 'Coach', signal: new AbortController().signal, surface: 'coach' });
    expect(dec.actions.some((a) => a.type === 'catch_up')).toBe(false);
  });

  it('an adult with a trim running, then the Coach remembers an eating-disorder signal → the cut stops at once', () => {
    go(at(TODAY, 9)); withKey();
    const d = friend({ goal: 'fatloss', memory: [mem('Age: 25 (as of 2026-01-01)')] });
    d.catchUps = [{ id: 'cu', date: '2026-10-18', over: 1500, days: [TODAY, '2026-10-20', '2026-10-21'], perDay: 200, floor: 2000, trigger: 'late', at: 0, told: true, decided: true, line: 'x' }];
    useStore.getState().replaceAll(d);
    expect(kcalTargetFor(data(), TODAY)).toBe(2400);
    useStore.getState().addMemory({ text: 'Eating-disorder signal: skips meals the day after a big evening to make up for it', kind: 'health' });
    expect(trimAllowed(data(), TODAY)).toBe('health');
    // hard limit "never with eating-disorder signals in MEMORY": the running cut must not keep going
    expect(kcalTargetFor(data(), TODAY)).toBe(2600);
  });

  it('JUDGEMENT: the age corrected later (an old "Age: 20" line and a new "Age: 16" line) → the teen limit wins', () => {
    const d = friend({ goal: 'fatloss', memory: [mem('Age: 20 (as of 2026-09-01)'), mem('Age: 16 (as of 2026-10-19)')] });
    expect(trimAllowed(d, TODAY)).toBe('minor');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('3. backups', () => {
  const TODAY = '2026-10-19', YDAY = '2026-10-18';
  it('a round trip keeps targets, marks, hcGone, catch-ups and the heavy-day settings', () => {
    go(at(TODAY, 9));
    const d = defaultData(); d.settings.onboarded = true; d.settings.goals.kcal = 2300; d.settings.profile.goal = 'fatloss';
    d.settings.heavyDays = 'quiet'; d.settings.heavyOnSince = '2026-10-15';
    d.targets = [{ from: '2026-10-14', kcal: 2300, prev: 2500 }];
    d.marks = { heavySeen: '2026-10-01', helpSaid: '2026-10-10', invisibleSaid: '2026-10-11', ageAsked: '2026-10-12' };
    d.hcGone = ['hc:1', 'hc:2'];
    d.catchUps = [{ id: 'cu1', date: YDAY, over: 1400, days: [TODAY, '2026-10-20'], perDay: 200, floor: 2000, trigger: 'late', at: 5, told: true, coachTold: true, decided: true, line: 'l', why: 'w' }];
    d.memory = [mem('Age: 20 (as of 2026-09-01)'), mem('Catch-ups at most 150 a day', 'preference')];
    useStore.getState().replaceAll(d);
    const text = JSON.stringify({ app: 'aven', v: DATA_VERSION, exportedAt: new Date().toISOString(), data: snapshotData() });
    useStore.getState().resetAll();
    useStore.getState().replaceAll(parseBackup(text, 'en').data);
    const r = data();
    expect(r.targets).toEqual(d.targets);
    expect(r.marks).toEqual(d.marks);
    expect(r.hcGone).toEqual(d.hcGone);
    expect(r.catchUps).toEqual(d.catchUps);
    expect(r.settings.heavyDays).toBe('quiet');
    expect(r.settings.heavyOnSince).toBe('2026-10-15');
    expect(r.memory.map((m) => m.text)).toEqual(d.memory.map((m) => m.text));
    expect(normaliseData(JSON.parse(JSON.stringify(snapshotData())))).toEqual(normaliseData(r));
  });

  it('an OLD backup (none of the new fields) loads, and the first check after it is silent; later days work normally', async () => {
    go(at(TODAY, 9)); withKey();
    // the phone had been running the new code
    const now = defaultData(); now.marks = { heavySeen: '2026-10-01' }; useStore.getState().replaceAll(now);
    const old = {
      app: 'aven', v: 1, exportedAt: '2026-10-19T07:00:00Z',
      data: {
        v: 1, settings: { ...defaultData().settings, onboarded: true, dayStartHour: 4, goals: { kcal: 2500, protein: 180 }, profile: { goal: 'fatloss', experience: 'some', equipment: 'fullGym', days: [1, 3, 5] } },
        entries: [food(YDAY, 2500, at(YDAY, 13)), food(YDAY, 2200, at(TODAY, 8, 30), 'snacks')],
        weights: [], memory: [mem('Age: 20 (as of 2026-09-01)')],
      },
    };
    for (const k of ['heavyDays', 'heavyOnSince']) delete (old.data.settings as any)[k];
    const back = parseBackup(JSON.stringify(old), 'en').data;
    expect(back.catchUps).toEqual([]); expect(back.targets).toEqual([]); expect(back.marks).toEqual({}); expect(back.hcGone).toEqual([]);
    useStore.getState().replaceAll(back);
    await check(at(TODAY, 9, 0));
    expect(shown).toEqual([]); expect(calls).toBe(0);
    expect(kcalTargetFor(data(), TODAY)).toBe(2500);
    expect(data().marks?.heavySeen).toBe(TODAY);
    // tonight is a new heavy evening: decided once, as usual
    go(at(TODAY, 22)); useStore.getState().logEntries([food(TODAY, 600, at(TODAY, 8), 'breakfast'), food(TODAY, 3000, at(TODAY, 22))]);
    await check(at(TODAY, 22, 1));
    expect(calls).toBe(1); expect(decisions()).toHaveLength(1);
  });

  it('a hand-edited backup with a broken catch-up (no days, no floor) never crashes the app', async () => {
    go(at(TODAY, 9));
    const raw = { app: 'aven', v: 1, data: { ...defaultData(), settings: { ...defaultData().settings, goals: { kcal: 2500 }, profile: { ...defaultData().settings.profile, goal: 'fatloss' } }, marks: { heavySeen: '2026-10-01' }, catchUps: [{ id: 'x', date: YDAY, perDay: 200 }] } };
    useStore.getState().replaceAll(parseBackup(JSON.stringify(raw), 'en').data);
    expect(() => kcalTargetFor(data(), TODAY)).not.toThrow();
    expect(() => catchUpOn(data(), TODAY)).not.toThrow();
    expect(() => justNoticed(data(), TODAY)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('4. true maintenance on messy real-life data', () => {
  const TODAY = '2026-10-19';
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const noise = (a: number) => (rnd() * 2 - 1) * a;

  /** 4 weeks: ~2,500 logged (2 big evenings a week), losing 0.5 kg a week; the watch's scale most days, Aven's on some
   *  (a little different), a 3-day trip with nothing logged or weighed, one typo 8.5 for 85, the last week watch only. */
  function messy() {
    seed = 7;
    const entries: FoodEntry[] = [], weights: AppData['weights'] = [], health: HealthDay[] = [];
    const bigDays = new Set<string>(); const trip = new Set([15, 14, 13]);
    for (let i = 28; i >= 1; i--) {
      const day = addDays(TODAY, -i);
      if (trip.has(i)) continue;
      const big = i % 7 === 2 || i % 7 === 5;
      if (big) bigDays.add(day);
      entries.push(food(day, Math.round(550 + noise(60)), at(day, 8), 'breakfast'), food(day, Math.round(850 + noise(120)), at(day, 13), 'lunch'), food(day, Math.round((big ? 2000 : 900) + noise(150)), at(day, 19), 'dinner'));
    }
    for (let i = 28; i >= 0; i--) {
      const day = addDays(TODAY, -i);
      if (trip.has(i)) continue;
      const trend = 85 - (0.5 / 7) * (28 - i);
      const water = bigDays.has(addDays(day, -1)) ? 0.9 : bigDays.has(addDays(day, -2)) ? 0.4 : i === 12 || i === 11 ? 1.2 : 0; // (after big days; after the trip)
      const scale = Math.round((trend + water + noise(0.3)) * 10) / 10;
      health.push({ date: day, weightKg: scale });
      if (i > 7 && i % 2 === 0) weights.push({ id: `w${i}`, date: day, kg: i === 20 ? 8.5 : Math.round((scale + noise(0.2)) * 10) / 10, at: 0 });
    }
    const logged = new Map<string, number>(); for (const e of entries) logged.set(e.date, (logged.get(e.date) ?? 0) + (e.nutrients.kcal ?? 0));
    const avg = [...logged.values()].reduce((a, b) => a + b, 0) / logged.size;
    return { d: { entries, weights, health }, truth: avg + 550 };
  }

  it('Aven + watch weigh-ins, a trip, a typo, a watch-only week: within ±300 of the truth', () => {
    const { d, truth } = messy();
    const m = trueMaintenance(d, TODAY)!;
    expect(m).not.toBeNull();
    expect(Math.abs(m.kcal - truth), `got ${m.kcal} (${m.confidence}), truth ${Math.round(truth)}`).toBeLessThanOrEqual(300);
    expect(m.kgPerWeek).toBeLessThan(0);
  });

  it('the same with the two scales reading 0.3 kg apart (gym scale typed into Aven, home scale on the watch)', () => {
    const { d, truth } = messy();
    d.weights = d.weights.map((w) => (w.kg > 50 ? { ...w, kg: Math.round((w.kg - 0.3) * 10) / 10 } : w));
    const m = trueMaintenance(d, TODAY)!;
    expect(Math.abs(m.kcal - truth), `got ${m.kcal} (${m.confidence}), truth ${Math.round(truth)}`).toBeLessThanOrEqual(300);
  });

  it('thin data: 11 logged days and 5 weigh-ins → a number, but not "high"', () => {
    seed = 3;
    const entries: FoodEntry[] = [], weights: AppData['weights'] = [];
    for (const i of [27, 25, 22, 20, 17, 15, 12, 10, 7, 5, 2]) { const day = addDays(TODAY, -i); entries.push(food(day, 2400, at(day, 13), 'lunch')); }
    for (const i of [24, 18, 14, 9, 3]) weights.push({ id: `w${i}`, date: addDays(TODAY, -i), kg: 85 - 0.07 * (24 - i), at: 0 });
    const m = trueMaintenance({ entries, weights, health: [] }, TODAY);
    expect(m && m.confidence).not.toBe('high');
  });

  it('JUDGEMENT: daily watch weigh-ins only for the last 2 weeks (normal water swings) → not "high" yet', () => {
    seed = 11;
    const entries: FoodEntry[] = [], health: HealthDay[] = [];
    for (let i = 28; i >= 1; i--) { const day = addDays(TODAY, -i); entries.push(food(day, 2500, at(day, 13), 'lunch')); }
    for (let i = 14; i >= 0; i--) health.push({ date: addDays(TODAY, -i), weightKg: Math.round((84 - (0.5 / 7) * (14 - i) + noise(0.6)) * 10) / 10 });
    const m = trueMaintenance({ entries, weights: [], health }, TODAY)!;
    expect.soft(m.confidence, `got ${m.kcal} ${m.confidence} from a 14-day weight span`).not.toBe('high');
    expect.soft(Math.abs(m.kcal - 3050), `got ${m.kcal}`).toBeLessThanOrEqual(300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('5. which model answers (dictated, no punctuation, mixed languages)', () => {
  const isMain = (s: string) => route(s, 'medium').main;
  it('CLEAR: risky or deciding → the main model', () => {
    for (const s of [
      'jeg har spist alt for meget i aften hvad gør jeg',
      'I ate way too much tonight what should I do',
      'jeg har ædt alt for meget i går hvad skal jeg gøre',
      'I want to drop to 74 for the tournament',
      'jeg vil gerne tabe 5 kilo inden turneringen',
      'hvordan taber jeg 3 kg på en uge',
      'ondt i knæet efter squat skal jeg stoppe',
      'my knee hurts when I squat should I stop',
      "I'm going to skip dinner because I ate too much at lunch",
      'jeg springer aftensmaden over fordi jeg spiste for meget til frokost',
      'I feel dizzy after cutting water',
      'skal jeg tage kreatin', 'is it safe to sit in the sauna to lose weight', 'I binged again last night', 'why am I not losing weight',
      'skal jeg cutte eller bulke', 'hvad er min vedligeholdelse', 'I need to make weight on saturday', 'jeg kastede op efter aftensmaden',
      'how many calories should I eat', 'jeg taber ikke noget', 'should I eat less tomorrow because of yesterday', 'jeg spiste 2000 for meget i går hvad nu',
      'kan jeg tage koffein før kamp',
    ]) expect.soft(isMain(s), `"${s}" → main`).toBe(true);
  });
  it('CLEAR: logging and quick facts → the quick model', () => {
    for (const s of [
      'log 2 æg og rugbrød', 'how many calories in a big mac', 'log 5g creatine', '5 g kreatin', 'jeg har spist 3 skiver pizza til aftensmad',
      'tilføj 500 ml vand', 'bænkpres 80 kilo 3 sæt af 8', 'hvor mange kalorier er der i en banan', 'how much protein is in chicken breast',
      'i weigh 84.2 this morning', 'log 1 scoop pre-workout', 'add a protein shake and 5 g creatine please', 'what should I eat tonight',
      'log pain au chocolat for breakfast', 'kan du logge 5 g kreatin', 'can you log 5g creatine', 'log my weigh in 84.5',
    ]) expect.soft(isMain(s), `"${s}" → quick`).toBe(false);
  });
  it('JUDGEMENT calls (cost or parity, not safety)', () => {
    expect.soft(isMain('lav en plan for næste uge'), 'DA "plan next week" like EN "plan my next week" → main').toBe(isMain('plan my next week'));
    expect.soft(isMain("what's a good pre-workout meal"), 'a meal idea → quick').toBe(false);
    expect.soft(isMain('how many calories in a scoop of pre-workout'), 'a food fact → quick').toBe(false);
    expect.soft(isMain('I binge watched netflix and had pizza'), 'TV, logging → quick').toBe(false);
    expect.soft(isMain('is it ok to train with a sore shoulder'), 'an injury question → main').toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('6. the Coach says JUST NOTICED once (decide → markCoachTold)', () => {
  const TODAY = '2026-10-19';
  const ask = (text: string) => decide(text, { lang: 'en', t, pool: allExercises(useStore.getState().exercises), history: [], where: 'Coach', signal: new AbortController().signal, surface: 'coach' });
  beforeEach(() => {
    go(at(TODAY, 10));
    const d = defaultData('en'); d.settings.onboarded = true; d.settings.dayStartHour = 0; d.settings.goals.kcal = 2500; d.settings.profile.goal = 'fatloss';
    d.memory = [mem('Age: 20 (as of 2026-09-01)')];
    d.catchUps = [{ id: 'cu', date: '2026-10-18', over: 1500, days: [TODAY, '2026-10-20'], perDay: 200, floor: 2000, trigger: 'late', at: 0, told: true, decided: true, line: 'Yesterday +1,500. −200 a day for 2 days.' } as CatchUp];
    useStore.getState().replaceAll(d);
  });
  const pending = () => justNoticed(data(), TODAY).map((c) => c.id);

  it('a logging-only reply leaves it for the next real conversation; a real reply marks it said', async () => {
    script = [{ reply: 'Logged 500 ml.', actions: [{ type: 'log_water', ml: 500 }] }];
    await ask('500 ml water');
    expect(pending()).toEqual(['cu']);
    script = [{ reply: 'Yesterday was +1,500, mostly water. Today 2,300. You are on track.', actions: [] }];
    await ask('how am I doing');
    expect(pending()).toEqual([]);
  });

  it('no AI key: the canned "I need an AI key" reply did not say it, so it stays pending', async () => {
    noKey();
    const d = await ask('hej hvordan går det');
    expect(d.reply).toMatch(/AI key/);
    expect(pending()).toEqual(['cu']);
  });

  it('JUDGEMENT: "log 2 eggs, and why is my weight up?" → it was answered, but the turn counts as logging-only', async () => {
    script = [{ reply: 'Logged. The scale is up because yesterday was +1,500 — mostly water, back down in 2–3 days.', actions: [{ type: 'log_water', ml: 300 }] }];
    await ask('log 300 ml water and why is my weight up');
    expect.soft(pending(), 'said in that reply → not said again').toEqual([]);
  });
});
