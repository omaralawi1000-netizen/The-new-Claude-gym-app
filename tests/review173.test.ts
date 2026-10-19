// @vitest-environment jsdom
// Review of PR #173, 19 Oct (Coach: sets into a finished workout, "after …", "skip this set", the duplicate guard; the watch's
// health history; recovery lines). Every test states the CORRECT behaviour: a failing test is a confirmed bug.
import { describe, it, expect, beforeEach } from 'vitest';
import coachSrc from '../src/screens/Coach.tsx?raw';
import { validateAgent, runActions, type AgentCtx, type AgentResult } from '../src/lib/agent';
import { useStore } from '../src/state/store';
import { useUI } from '../src/state/ui';
import { defaultData } from '../src/state/defaults';
import { makeT } from '../src/lib/i18n';
import { addDays, dayKey } from '../src/lib/dates';
import { applyHcFromAddress, mergeHc, parseHc, type HcPayload } from '../src/lib/healthSync';
import { recoveryLines, recoveryOff } from '../src/lib/recovery';
import type { ActivityLog, HealthDay, WorkoutSession } from '../src/lib/types';

const t = makeT('en') as any;
const today = dayKey(Date.now(), 0);
const ctx = (): AgentCtx => ({ t, lang: 'en', today, brain: null });
const run = async (...a: Record<string, unknown>[]): Promise<AgentResult[]> => runActions(validateAgent({ reply: '', actions: a })?.actions ?? [], ctx());
const sessions = () => useStore.getState().sessions;
const set = (kg: number, reps: number, i = 0) => ({ id: `s${kg}-${reps}-${i}-${Math.random().toString(36).slice(2, 7)}`, type: 'working' as const, weightKg: kg, reps, done: true, completedAt: Date.now() - 3600000 + i });
const workout = (id: string, date: string, name: string, ex: string[]): WorkoutSession => ({
  id, name, date, startedAt: new Date(`${date}T17:00:00`).getTime(), endedAt: new Date(`${date}T18:30:00`).getTime(), pausedMs: 0, status: 'done',
  exercises: ex.map((e, i) => ({ id: `${id}-${e}`, exerciseId: e, sets: [set(60 + i, 10, 0), set(60 + i, 9, 1)] })),
});
const has = (s: WorkoutSession | undefined, re: RegExp) => !!s?.exercises.some((e) => re.test(e.exerciseId));
const text = (r: AgentResult) => r.lines.map((l) => `${l.text} ${l.sub ?? ''}`).join(' | ');

// watch helpers (as tests/health.test.ts)
const enc = (o: unknown) => {
  const b = new TextEncoder().encode(JSON.stringify(o));
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const now = Date.now();
const H = 3600000, DAY = 24 * H;
const payload = (ex: object[], days: [string, number][] = []): HcPayload => ({ v: 1, avail: true, on: true, granted: true, at: now, days, ex: ex as any });
const fromApp = (yes: boolean) => Object.defineProperty(document, 'referrer', { value: yes ? 'android-app://app.aven.android/' : '', configurable: true });

beforeEach(() => {
  localStorage.clear();
  const d = defaultData(); d.settings.foodLookup = false; d.settings.onboarded = true; d.settings.dayStartHour = 0;
  useStore.getState().replaceAll(d);
  useUI.setState({ toasts: [] });
  fromApp(true);
});

// ── 1 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('1 · Undo on a log_sets card into a finished workout removes only what that card added', () => {
  it('a set edited by hand afterwards (Summary screen) survives the Undo', async () => {
    useStore.getState().restoreSession(workout('w1', today, 'Legs & shoulders', ['leg-press', 'leg-extension']));
    const [r] = await run({ type: 'log_sets', exercises: [{ exercise: 'standing calf raise', sets: [{ kg: 107, reps: 8 }] }] });
    expect(r.kind).toBe('sets');
    expect(has(sessions()[0], /calf/)).toBe(true);
    // by hand, exactly as Summary.tsx `patch` does it: leg press set 1 → 70 kg; and a set appended to leg extension
    const lp = sessions()[0].exercises.find((e) => e.exerciseId === 'leg-press')!;
    const le = sessions()[0].exercises.find((e) => e.exerciseId === 'leg-extension')!;
    useStore.getState().mutateSession('w1', (x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === lp.id ? { ...e, sets: e.sets.map((q, i) => (i === 0 ? { ...q, weightKg: 70 } : q)) } : e)) }));
    useStore.getState().mutateSession('w1', (x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === le.id ? { ...e, sets: [...e.sets, set(65, 7, 9)] } : e)) }));
    r.undo!();
    const after = sessions()[0];
    expect(has(after, /calf/)).toBe(false); // the Coach's exercise is gone
    expect(after.exercises.find((e) => e.exerciseId === 'leg-press')!.sets[0].weightKg).toBe(70); // the hand edit stays
    expect(after.exercises.find((e) => e.exerciseId === 'leg-extension')!.sets).toHaveLength(3); // the hand-added set stays
  });
  it('Undo on the FIRST of two Coach cards keeps what the second card added', async () => {
    useStore.getState().restoreSession(workout('w1', today, 'Legs & shoulders', ['leg-press']));
    const [r1] = await run({ type: 'log_sets', exercises: [{ exercise: 'standing calf raise', sets: [{ kg: 107, reps: 8 }] }] });
    const [r2] = await run({ type: 'log_sets', exercises: [{ exercise: 'lateral raise', sets: [{ kg: 12, reps: 15 }] }] });
    expect(r2.kind).toBe('sets');
    expect(has(sessions()[0], /lateral/)).toBe(true);
    r1.undo!();
    expect(has(sessions()[0], /calf/)).toBe(false);
    expect(has(sessions()[0], /lateral/)).toBe(true); // card 2 was not undone
  });
});

// ── 2 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('2 · workout "last" = the newest by date, whatever the order in the list', () => {
  it('an older workout stored after a newer one (imported backup / out-of-order list)', async () => {
    const y = addDays(today, -1), b = addDays(today, -3);
    const d = defaultData(); d.settings.foodLookup = false; d.settings.onboarded = true; d.settings.dayStartHour = 0;
    d.sessions = [workout('w3', y, 'Pull', ['lat-pulldown']), workout('w2', b, 'Push', ['bench-press'])];
    useStore.getState().replaceAll(d);
    await run({ type: 'log_sets', exercises: [{ exercise: 'bicep curl', sets: [{ kg: 14, reps: 12 }] }], workout: 'last' });
    expect(has(sessions().find((s) => s.id === 'w3'), /curl/)).toBe(true); // yesterday's Pull
    expect(has(sessions().find((s) => s.id === 'w2'), /curl/)).toBe(false); // not 3 days ago's Push
  });
});

// ── 3 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('3 · a workout named: an exact name wins over a part of a name', () => {
  it('"Legs" picks the workout called Legs, not the newer "Legs & shoulders"', async () => {
    useStore.getState().restoreSession(workout('wL', addDays(today, -5), 'Legs', ['squat']));
    useStore.getState().restoreSession(workout('wLS', addDays(today, -2), 'Legs & shoulders', ['leg-press']));
    await run({ type: 'log_sets', exercises: [{ exercise: 'standing calf raise', sets: [{ kg: 100, reps: 10 }] }], workout: 'Legs' });
    expect(has(sessions().find((s) => s.id === 'wL'), /calf/)).toBe(true);
    expect(has(sessions().find((s) => s.id === 'wLS'), /calf/)).toBe(false);
  });
  it('"Upper body day" picks the workout called Upper body day, not the newer "Upper"', async () => {
    useStore.getState().restoreSession(workout('wUB', addDays(today, -6), 'Upper body day', ['bench-press']));
    useStore.getState().restoreSession(workout('wU', addDays(today, -2), 'Upper', ['lat-pulldown']));
    await run({ type: 'log_sets', exercises: [{ exercise: 'bicep curl', sets: [{ kg: 14, reps: 12 }] }], workout: 'Upper body day' });
    expect(has(sessions().find((s) => s.id === 'wUB'), /curl/)).toBe(true);
    expect(has(sessions().find((s) => s.id === 'wU'), /curl/)).toBe(false);
  });
  it('"leg" with "Legs" and "Leg press focus": the closest name', async () => {
    useStore.getState().restoreSession(workout('wA', addDays(today, -4), 'Legs', ['squat']));
    useStore.getState().restoreSession(workout('wB', addDays(today, -2), 'Leg press focus', ['leg-press']));
    await run({ type: 'log_sets', exercises: [{ exercise: 'standing calf raise', sets: [{ kg: 100, reps: 10 }] }], workout: 'leg' });
    expect(has(sessions().find((s) => s.id === 'wA'), /calf/)).toBe(true);
  });
  it('a name that matches no workout: said on the card, nothing logged anywhere', async () => {
    useStore.getState().restoreSession(workout('wA', addDays(today, -4), 'Legs', ['squat']));
    const [r] = await run({ type: 'log_sets', exercises: [{ exercise: 'bicep curl', sets: [{ kg: 14, reps: 12 }] }], workout: 'arms day' });
    expect(r.kind).toBe('miss');
    expect(sessions().some((x) => has(x, /curl/))).toBe(false);
  });
  it('the running workout, named by its routine name, is the one used (not last week\'s with the same name)', async () => {
    useStore.getState().restoreSession(workout('old', addDays(today, -7), 'Legs & shoulders', ['leg-press']));
    await run({ type: 'add_exercise', exercises: ['leg press'], start: true });
    useStore.getState().mutateActive((x) => ({ ...x, name: 'Legs & shoulders' }));
    await run({ type: 'log_sets', exercises: [{ exercise: 'standing calf raise', sets: [{ kg: 107, reps: 8 }] }], workout: 'Legs & shoulders' });
    expect(useStore.getState().active!.exercises.some((e) => /calf/.test(e.exerciseId))).toBe(true);
    expect(has(sessions().find((x) => x.id === 'old'), /calf/)).toBe(false);
  });
  it('a finished workout of theirs keeps its length when the Coach adds to it later', async () => {
    const w0 = workout('w1', today, 'Legs', ['leg-press']);
    useStore.getState().restoreSession(w0);
    await run({ type: 'log_sets', exercises: [{ exercise: 'standing calf raise', sets: [{ kg: 107, reps: 8 }] }] });
    expect(sessions().find((x) => x.id === 'w1')!.endedAt).toBe(w0.endedAt);
  });
});

// ── 4 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('4 · "after leg press" when the workout has no leg press: added at the end, and the card says so', () => {
  it('finished workout', async () => {
    useStore.getState().restoreSession(workout('w1', today, 'Legs', ['leg-extension', 'lateral-raise']));
    const [r] = await run({ type: 'log_sets', exercises: [{ exercise: 'standing calf raise', sets: [{ kg: 107, reps: 8 }] }], after: 'leg press' });
    expect(r.kind).toBe('sets');
    const ids = sessions()[0].exercises.map((e) => e.exerciseId);
    expect(ids[ids.length - 1]).toMatch(/calf/); // at the end, not after a look-alike
    expect(text(r)).not.toMatch(/After Leg Extension/);
    expect(text(r)).toMatch(/leg press|\bend\b/i); // the card tells it wasn't placed as asked
  });
  it('running workout', async () => {
    await run({ type: 'add_exercise', exercises: ['leg extension', 'lateral raise'], start: true });
    const [r] = await run({ type: 'log_sets', exercises: [{ exercise: 'standing calf raise', sets: [{ kg: 107, reps: 8 }] }], after: 'leg press' });
    expect(r.kind).toBe('sets');
    const ids = useStore.getState().active!.exercises.map((e) => e.exerciseId);
    expect(ids[ids.length - 1]).toMatch(/calf/);
    expect(text(r)).toMatch(/leg press|\bend\b/i);
  });
});

// ── 5 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('5 · "skip this set", the workout finished, then Undo', () => {
  it('no crash; the finished workout keeps its sets; nothing comes back to life', async () => {
    await run({ type: 'add_exercise', exercises: ['bench press'], start: true });
    const n = useStore.getState().active!.exercises[0].sets.length;
    expect(n).toBeGreaterThanOrEqual(2);
    const [done1] = await run({ type: 'log_current_set', which: 'current', kg: 60, reps: 8 });
    expect(done1.kind).toBe('sets');
    const [sk] = await run({ type: 'log_current_set', which: 'current', skip: true });
    expect(sk.title).toBe('Set skipped');
    const fin = useStore.getState().finishActive();
    expect(fin).toBeTruthy();
    const snap = JSON.stringify(useStore.getState().sessions);
    expect(() => sk.undo!()).not.toThrow();
    expect(useStore.getState().active).toBeNull();
    expect(JSON.stringify(useStore.getState().sessions)).toBe(snap);
    const bench = useStore.getState().sessions[0].exercises.find((e) => e.exerciseId === 'bench-press')!;
    expect(bench.sets.filter((x) => x.done).map((x) => [x.weightKg, x.reps])).toEqual([[60, 8]]);
    // a new workout with the same exercise: the old Undo must not put a set into it
    await run({ type: 'add_exercise', exercises: ['bench press'], start: true });
    const before = JSON.stringify(useStore.getState().active);
    sk.undo!();
    expect(JSON.stringify(useStore.getState().active)).toBe(before);
  });
});

// ── 6 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('6 · Coach.tsx duplicate guard ("the same words within 2 s")', () => {
  // the guard's condition is taken from the source as written, and run with a fake clock; the guard is cleared when the
  // turn is answered (the useEffect on busy)
  const src: string = coachSrc;
  const line = src.split('\n').find((l: string) => l.includes('lastSent.current.text === text'))!;
  const cond = /if \((.*)\) return;/.exec(line)![1];
  const guard = new Function('raw', 'text', 'pic', 'lastSent', 'Date', `return (${cond});`) as (raw: string | undefined, text: string, pic: unknown, lastSent: unknown, D: { now: () => number }) => boolean;
  it('the guard is cleared once the answer is in', () => {
    expect(src).toMatch(/useEffect\(\(\) => \{ if \(!busy\) lastSent\.current = \{ text: '', at: 0 \}; \}, \[busy\]\);/);
  });
  it('"8", the Coach answers with a new question, "8" again 1.5 s after the first: sent', () => {
    const lastSent = { current: { text: '', at: 0 } };
    const send = (raw: string | undefined, text: string, at: number) => { if (guard(raw, text, null, lastSent, { now: () => at })) return false; lastSent.current = { text, at }; return true; };
    expect(send('8', '8', 100000)).toBe(true);
    lastSent.current = { text: '', at: 0 }; // (answered)
    expect(send('8', '8', 101500)).toBe(true);
    // typed words are never dropped by it (they wait in the field while it answers)
    expect(send(undefined, '8', 101600)).toBe(true);
  });
  it('(control) the same chip fired twice 50 ms apart is dropped', () => {
    const lastSent = { current: { text: 'Yes', at: 5000 } };
    expect(guard('Yes', 'Yes', null, lastSent, { now: () => 5050 })).toBe(true);
  });
});

// ── 7 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('7 · the watch history (healthSync.ts)', () => {
  it('7a (size) a realistic biggest payload fits the 160 000-character cap', () => {
    const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, () => Math.floor(Math.random() * 16).toString(16));
    const ex = Array.from({ length: 120 }, (_, i) => ({ id: uuid(), t: 'martial_arts', n: 'W'.repeat(40), s: now - i * DAY - 2 * H, e: now - i * DAY - H, hr: 150, hx: 182, kc: 640, m: 12345 }));
    const hd = Array.from({ length: 44 }, (_, i) => ({ d: addDays(today, -i), s: 12345, ak: 640, tk: 2900, m: 7200, fl: 12, rh: 51, hv: 63, sl: 431, dp: 72, rm: 95, lt: 240, aw: 24, sb: now - 10 * H, se: now - 3 * H, w: 82.4, bf: 14.3, vo: 47.9, o2: 96.4, rr: 14.2 }));
    const days = hd.map((d) => [d.d, 12345]);
    const b64 = enc({ ...payload(ex, days as any), hd, back: { from: '2025-01-01', to: '2025-01-30' } });
    expect(b64.length).toBeLessThan(160000);
  });
  it('7b a later sync with only steps for a day keeps that day\'s sleep and weight', () => {
    const D = addDays(today, -3);
    const first = mergeHc({ ...payload([]), hd: [{ date: D, sleepMin: 430, weightKg: 82.4 }] }, { activities: [], steps: [], health: [] }, 0);
    // (Java puts steps in "days"; a steps-only day in "hd" is {d, s} and is dropped by parseHc as having nothing)
    const hdOnlySteps = parseHc(`#hc=${enc({ ...payload([], [[D, 5000]]), hd: [{ d: D, s: 5000 }] })}`)!;
    const second = mergeHc(hdOnlySteps, first, 0);
    expect(second.health.find((d) => d.date === D)).toMatchObject({ sleepMin: 430, weightKg: 82.4 });
    expect(second.steps).toEqual([{ date: D, count: 5000 }]);
  });
  it('7b a later sync where the sleep/weight read failed (steps + calories only for that day) keeps sleep and weight', () => {
    const D = addDays(today, -3);
    const first = mergeHc({ ...payload([]), hd: [{ date: D, sleepMin: 430, weightKg: 82.4 }] }, { activities: [], steps: [], health: [] }, 0);
    const second = mergeHc({ ...payload([], [[D, 5000]]), hd: [{ date: D, activeKcal: 500, distanceM: 4000 }] }, first, 0);
    expect(second.health.find((d) => d.date === D)).toMatchObject({ sleepMin: 430, weightKg: 82.4, activeKcal: 500 });
  });
  it('7c a hand-logged activity of another kind / very different length on a watch-workout day is left alone', () => {
    const s = new Date(`${addDays(today, -40)}T18:00:00`).getTime();
    const D = dayKey(s, 0);
    const mine: ActivityLog[] = [
      { id: 'm-run', date: D, kind: 'run', durationSec: 1800, note: 'easy jog', at: now },
      { id: 'm-wr', date: D, kind: 'wrestling', durationSec: 7200, rounds: 8, intensity: 3, note: 'long practice', at: now },
    ];
    const r = mergeHc(payload([{ id: 'hc-w', t: 'martial_arts', s, e: s + 30 * 60000, hr: 160, hx: 190 }]), { activities: mine, steps: [] }, 0);
    expect(r.activities.find((a) => a.id === 'm-run')).toEqual(mine[0]);
    expect(r.activities.find((a) => a.id === 'm-wr')).toEqual(mine[1]); // 120 min vs the watch's 30 min: not the same one
    expect(r.activities).toHaveLength(3);
  });
  it('7c (what happens) a hand-logged one of the same kind and about as long becomes the watch\'s: id, note, rounds, intensity kept; duration is the watch\'s', () => {
    const s = new Date(`${addDays(today, -40)}T18:00:00`).getTime();
    const D = dayKey(s, 0);
    const mine: ActivityLog = { id: 'm-wr', date: D, kind: 'wrestling', durationSec: 5400, rounds: 6, intensity: 3, note: 'sparring', at: now };
    const r = mergeHc(payload([{ id: 'hc-w', t: 'martial_arts', s, e: s + 60 * 60000, hr: 120, hx: 190 }]), { activities: [mine], steps: [] }, 0);
    expect(r.activities).toHaveLength(1);
    expect(r.activities[0]).toMatchObject({ id: 'm-wr', note: 'sparring', rounds: 6, intensity: 3, hcId: 'hc-w', source: 'watch', durationSec: 3600 });
  });
  it('7e a watch workout they deleted never comes back; Undo of the delete lets it', () => {
    const s = now - 3 * DAY;
    const p = payload([{ id: 'hc-del', t: 'run', s, e: s + 40 * 60000, hr: 140 }]);
    useStore.getState().mergeHealth(mergeHc(p, { activities: [], steps: [] }, 0));
    const a = useStore.getState().activities[0];
    const gone = useStore.getState().removeActivity(a.id)!;
    const st = useStore.getState();
    expect(mergeHc(p, { activities: st.activities, steps: st.steps, gone: st.hcGone }, 0).activities).toEqual([]);
    useStore.getState().restoreActivity(gone);
    expect(useStore.getState().hcGone).toEqual([]);
  });
  it('7f old watch workouts go in by date, so "the last one" is the newest', () => {
    const mine: ActivityLog = { id: 'm1', date: addDays(today, -1), kind: 'wrestling', durationSec: 5400, at: now - DAY };
    const r = mergeHc(payload([{ id: 'hc-old', t: 'run', s: now - 300 * DAY, e: now - 300 * DAY + 30 * 60000 }]), { activities: [mine], steps: [] }, 0);
    expect(r.activities.map((a) => a.id).at(-1)).toBe('m1');
  });
  it('7d workouts from months ago (the history walk) are not announced as new workouts', () => {
    const old = [200, 201, 230].map((d, i) => ({ id: `hc-old-${i}`, t: 'run', s: now - d * DAY, e: now - d * DAY + 40 * 60000, hr: 140, hx: 170 }));
    history.replaceState(null, '', `/The-new-Claude-gym-app/#hc=${enc(payload(old))}`);
    applyHcFromAddress();
    expect(useStore.getState().activities).toHaveLength(3); // kept
    const toasts = useUI.getState().toasts.map((x) => x.text);
    expect(toasts.filter((x) => /from your watch/.test(x))).toEqual([]);
  });
});

// ── 8 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('8 · recovery.ts', () => {
  const day = (n: number, o: Partial<HealthDay>): HealthDay => ({ date: addDays(today, -n), ...o });
  const usual = Array.from({ length: 14 }, (_, i) => day(i + 1, { sleepMin: 450, restHr: 50, hrv: 60 }));
  it('4.5 h sleep, resting HR +8, HRV −30 % → three "clearly off" lines', () => {
    const hs = [...usual, day(0, { sleepMin: 270, restHr: 58, hrv: 42 })];
    const off = recoveryOff(hs, today);
    expect(off.map((o) => o.kind)).toEqual(['sleep', 'restHr', 'hrv']);
    expect(off[0].text).toBe('slept 4h30 last night');
    expect(off[1].text).toContain('8 over usual (50)');
    expect(off[2].text).toContain('30% under usual (60)');
    const L = recoveryLines(hs, today).join('\n');
    expect(L).toContain('CLEARLY OFF TODAY: slept 4h30 last night; resting heart rate 58');
  });
  it('today normal, one extreme day 10 days ago → nothing "off" today', () => {
    const hs = [...usual.map((d) => (d.date === addDays(today, -10) ? { ...d, sleepMin: 120, restHr: 95, hrv: 8 } : d)), day(0, { sleepMin: 440, restHr: 51, hrv: 59 })];
    expect(recoveryOff(hs, today)).toEqual([]);
    expect(recoveryLines(hs, today).join('\n')).not.toContain('CLEARLY OFF');
  });
  it('missing fields: no crash, no NaN / undefined / Infinity in the text', () => {
    const hs: HealthDay[] = [
      day(20, { weightKg: 82 }),
      day(9, {}),
      day(6, { sleepMin: 400, deepMin: 0, sleepStart: now - 30 * H }), // start without end
      day(3, { hrv: 50 }),
      day(2, { restHr: 52, activeKcal: 300 }),
      day(1, { floors: 4 }), // activity day with no kcal / km
      day(0, { sleepMin: 200 }),
      { date: addDays(today, 2), sleepMin: 10, restHr: 140 }, // a future day (clock / day-start mix-up)
    ];
    let L = '';
    expect(() => { L = recoveryLines(hs, today).join('\n'); }).not.toThrow();
    expect(L).not.toMatch(/NaN|undefined|Infinity|null/);
    expect(L).toContain('slept 3h20 last night');
    expect(() => recoveryOff([], today)).not.toThrow();
    expect(recoveryLines(undefined, today)).toEqual([]);
    expect(recoveryLines([day(0, { restHr: 55 })], today).join('\n')).not.toMatch(/NaN|undefined/);
  });
  it('a sleep time never shows as 6h60', () => {
    expect(recoveryOff([day(0, { sleepMin: 299.6 })], today)[0]?.text ?? '').not.toMatch(/h60/);
    expect(recoveryLines([day(1, { sleepMin: 419.7 }), day(0, { sleepMin: 419.6 })], today).join('\n')).not.toMatch(/h60/);
  });
  it('(judgement call) a "usual" from a single earlier day is not enough to call today "clearly off"', () => {
    // the watch connected 2 days ago: one odd reading (40) is the whole "usual"
    const hs = [day(1, { restHr: 40, hrv: 90 }), day(0, { restHr: 50, hrv: 60 })];
    expect(recoveryOff(hs, today)).toEqual([]);
  });
});
