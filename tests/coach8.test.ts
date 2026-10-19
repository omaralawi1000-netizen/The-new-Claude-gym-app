// @vitest-environment jsdom
// Talking to the Coach like a person (19 Oct): sets told after the gym go into that day's workout (never a second one), at
// the place said ("put it after leg press"); a workout named or "last"; nothing starts a workout silently; "skip this set".
// And the watch's sleep and recovery: what the Coach reads, and when something is clearly off.
import { describe, it, expect, beforeEach } from 'vitest';
import { validateAgent, runActions, type AgentCtx, type AgentResult } from '../src/lib/agent';
import { AGENT_SYSTEM } from '../src/lib/coachContext';
import { useStore } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { makeT } from '../src/lib/i18n';
import { addDays, dayKey } from '../src/lib/dates';
import { recoveryLines, recoveryOff } from '../src/lib/recovery';
import type { HealthDay, WorkoutSession } from '../src/lib/types';

const t = makeT('en') as any;
const today = dayKey(Date.now(), 0);
const ctx = (): AgentCtx => ({ t, lang: 'en', today, brain: null });
const run = async (...a: Record<string, unknown>[]): Promise<AgentResult[]> => runActions(validateAgent({ reply: '', actions: a })?.actions ?? [], ctx());
const sessions = () => useStore.getState().sessions;
const set = (kg: number, reps: number, i = 0) => ({ id: `s${kg}-${reps}-${i}`, type: 'working' as const, weightKg: kg, reps, done: true, completedAt: Date.now() - 3600000 + i });
const workout = (id: string, date: string, name: string, ex: string[]): WorkoutSession => ({
  id, name, date, startedAt: new Date(`${date}T17:00:00`).getTime(), endedAt: new Date(`${date}T18:30:00`).getTime(), pausedMs: 0, status: 'done',
  exercises: ex.map((e, i) => ({ id: `${id}-${e}`, exerciseId: e, sets: [set(60 + i, 10, 0), set(60 + i, 9, 1)] })),
});

beforeEach(() => {
  localStorage.clear();
  const d = defaultData(); d.settings.foodLookup = false; d.settings.onboarded = true; d.settings.dayStartHour = 0;
  useStore.getState().replaceAll(d);
});

describe('sets told after the gym', () => {
  it('go into today\'s finished workout, right after the exercise named, and Undo takes them out again', async () => {
    useStore.getState().restoreSession(workout('w1', today, 'Legs & shoulders', ['leg-press', 'leg-extension', 'lateral-raise']));
    const before = JSON.stringify(sessions());
    const [r] = await run({ type: 'log_sets', exercises: [{ exercise: 'standing calf raise', sets: [{ kg: 107, reps: 8 }, { kg: 107, reps: 8 }, { kg: 107, reps: 8 }] }], after: 'leg press' });
    expect(r.kind).toBe('sets');
    expect(sessions()).toHaveLength(1); // no second "Logged workout"
    const ids = sessions()[0].exercises.map((e) => e.exerciseId);
    expect(ids[0]).toBe('leg-press');
    expect(ids[1]).toMatch(/calf/);
    expect(ids.slice(2)).toEqual(['leg-extension', 'lateral-raise']);
    expect(sessions()[0].exercises[1].sets.map((x) => x.weightKg)).toEqual([107, 107, 107]);
    expect(r.title).toContain('Legs & shoulders');
    expect(r.lines.some((l) => /After Leg Press/.test(l.text))).toBe(true);
    r.undo!();
    expect(JSON.stringify(sessions())).toBe(before);
  });
  it('the last workout, or one named, when they say which; a day with none gets a new one', async () => {
    const y = addDays(today, -1), b = addDays(today, -3);
    useStore.getState().restoreSession(workout('w2', b, 'Push', ['bench-press']));
    useStore.getState().restoreSession(workout('w3', y, 'Pull', ['lat-pulldown']));
    await run({ type: 'log_sets', exercises: [{ exercise: 'bicep curl', sets: [{ kg: 14, reps: 12 }] }], workout: 'last' });
    expect(sessions().find((s) => s.id === 'w3')!.exercises.some((e) => /curl/.test(e.exerciseId))).toBe(true);
    await run({ type: 'log_sets', exercises: [{ exercise: 'dip', sets: [{ kg: 0, reps: 10 }] }], workout: 'push' });
    expect(sessions().find((s) => s.id === 'w2')!.exercises.some((e) => /dip/.test(e.exerciseId))).toBe(true);
    await run({ type: 'log_sets', exercises: [{ exercise: 'squat', sets: [{ kg: 100, reps: 5 }] }], day: addDays(today, -6) });
    expect(sessions()).toHaveLength(3);
    expect(sessions().find((s) => s.date === addDays(today, -6))!.logged).toBe(true);
  });
});

describe('nothing starts a workout by itself', () => {
  it('add_exercise with no workout running says so; with start it starts one', async () => {
    const [r] = await run({ type: 'add_exercise', exercises: ['bench press'] });
    expect(r.kind).toBe('miss');
    expect(useStore.getState().active).toBeFalsy();
    await run({ type: 'add_exercise', exercises: ['bench press'], start: true });
    expect(useStore.getState().active?.exercises.map((e) => e.exerciseId)).toEqual(['bench-press']);
  });
  it('"skip this set" takes the set they are on out, and Undo puts it back', async () => {
    await run({ type: 'add_exercise', exercises: ['bench press'], start: true });
    const n = useStore.getState().active!.exercises[0].sets.length;
    const [r] = await run({ type: 'log_current_set', which: 'current', skip: true });
    expect(r.title).toBe('Set skipped');
    expect(useStore.getState().active!.exercises[0].sets).toHaveLength(n - 1);
    r.undo!();
    expect(useStore.getState().active!.exercises[0].sets).toHaveLength(n);
  });
  it('the Coach is told all of this', () => {
    const sys = AGENT_SYSTEM('en');
    expect(sys).toContain('put it after leg press');
    expect(sys).toContain('never a second workout');
    expect(sys).toContain('skip true');
    expect(sys).toContain('ask instead of guessing');
    expect(sys).toContain('How hard they train is their call');
  });
});

describe('sleep and recovery from the watch', () => {
  const day = (n: number, o: Partial<HealthDay>): HealthDay => ({ date: addDays(today, -n), ...o });
  const usual = Array.from({ length: 20 }, (_, i) => day(i + 1, { sleepMin: 450, restHr: 50, hrv: 60 }));
  it('nothing is "off" on a normal day', () => {
    expect(recoveryOff([...usual, day(0, { sleepMin: 430, restHr: 52, hrv: 57 })], today)).toEqual([]);
  });
  it('a short night, a high resting heart rate and a low HRV are each said, with the numbers', () => {
    const off = recoveryOff([...usual, day(0, { sleepMin: 250, restHr: 58, hrv: 42 })], today);
    expect(off.map((o) => o.kind)).toEqual(['sleep', 'restHr', 'hrv']);
    expect(off[0].text).toBe('slept 4h10 last night');
    expect(off[1].text).toContain('8 over usual');
    expect(off[2].text).toContain('30% under usual');
  });
  it('the Coach\'s lines: the nights, the usual, the trend, the body, and the rule for "off"', () => {
    const lines = recoveryLines([...usual, day(0, { sleepMin: 250, deepMin: 40, remMin: 55, restHr: 58, hrv: 42, weightKg: 82.4, vo2max: 48 })], today).join('\n');
    expect(lines).toContain('BODY & RECOVERY');
    expect(lines).toMatch(/Sleep, last 7 nights.*4h10 \(deep 0h40, REM 0h55\)/);
    expect(lines).toContain('usual 50');
    expect(lines).toContain('weight 82.4 kg');
    expect(lines).toContain('Clearly off today');
    expect(recoveryLines([], today)).toEqual([]);
  });
});
