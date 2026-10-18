// @vitest-environment jsdom
// Coach 2.0, phase 2: everything that can be tapped can be said. Every setting in the table, the new actions with Undo,
// big changes as previews that change nothing before Apply, replaced previews, one-off planned days, and a guide that
// covers every action and setting.
import { describe, it, expect, beforeEach } from 'vitest';
import { validateAgent, runActions, SETTINGS_SECTIONS, type AgentCtx, type AgentResult } from '../src/lib/agent';
import { SETTING_SPEC } from '../src/lib/settingSpec';
import { ACTION_TYPES, AGENT_SCHEMA } from '../src/lib/gemini';
import { AGENT_SYSTEM, APP_GUIDE, guideSections } from '../src/lib/coachContext';
import { runLookups } from '../src/lib/agentLookup';
import { replacedIds } from '../src/ui/agentUi';
import { useStore, allExercises, plannedFor } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import { buildDemo } from '../src/lib/demo';
import { makeT } from '../src/lib/i18n';
import { addDays, dayKey, weekdayOf } from '../src/lib/dates';

const t = makeT('en') as any;
const today = dayKey(Date.now(), 0);
const ctx = (): AgentCtx => ({ t, lang: 'en', today, brain: null });
const run = async (a: Record<string, unknown>): Promise<AgentResult[]> => runActions(validateAgent({ reply: '', actions: [a] })?.actions ?? [], ctx());
const one = async (a: Record<string, unknown>) => (await run(a))[0];

beforeEach(() => {
  localStorage.clear();
  const d = defaultData(); d.settings.foodLookup = false; d.settings.onboarded = true;
  useStore.getState().replaceAll({ ...d, ...buildDemo(d.settings) } as any);
});

/** a value each setting accepts, read from its own description */
const sample = (values: string) => {
  if (values.startsWith('number ')) return values.split(' ')[1].split('–')[0];
  if (values === 'on | off') return 'off';
  if (values.startsWith('HH:MM')) return '07:30';
  if (values === 'text') return 'Omar';
  if (values.startsWith('up to 4 sizes')) return '250, 500';
  if (values.startsWith('the cards in order')) return 'weight, targets';
  if (values.startsWith('weekdays')) return 'monday, thursday';
  return values.split(' | ')[values.split(' | ').length - 1];
};

describe('every setting in the table can be said, and undone', () => {
  it('each key changes Settings and Undo puts it back', async () => {
    for (const sp of SETTING_SPEC) {
      const before = JSON.stringify(useStore.getState().settings);
      const r = await one({ type: 'set_setting', key: sp.key, value: sample(sp.values) });
      expect(r.kind, sp.key).toBe('setting');
      r.undo!();
      expect(JSON.stringify(useStore.getState().settings), sp.key).toBe(before);
    }
  });
  it('several at once, one card, one Undo; bad ones are named, never applied', async () => {
    const before = useStore.getState().settings;
    const r = await one({ type: 'set_setting', settings: [{ key: 'theme', value: 'light' }, { key: 'kcalGoal', value: '2800' }, { key: 'language', value: 'da' }, { key: 'kcalGoal', value: '3' }] });
    expect(r.title).toBe('Settings changed');
    const s = useStore.getState().settings;
    expect([s.theme, s.goals.kcal, s.language]).toEqual(['light', 2800, 'da']);
    expect(r.lines.filter((l) => l.warn)).toHaveLength(1);
    r.undo!();
    expect(useStore.getState().settings).toEqual(before);
  });
  it('keys that are not in the table are dropped before anything runs', () => {
    expect(validateAgent({ reply: 'x', actions: [{ type: 'set_setting', key: 'openaiKey', value: 'sk-x' }] })!.actions).toEqual([]);
  });
});

describe('new things it can do, each with Undo', () => {
  it('meals: rename, add, reorder; a meal with food in it is not removed', async () => {
    const before = useStore.getState().settings.meals;
    const r = await one({ type: 'edit_meals', meal: 'snacks', rename: 'Mellemmåltid', name: 'Pre-workout', order: ['dinner', 'breakfast'] });
    const m = useStore.getState().settings.meals;
    expect(m.map((x) => x.name)).toContain('Mellemmåltid');
    expect(m.map((x) => x.name)).toContain('Pre-workout');
    expect(m[0].id).toBe('dinner');
    r.undo!();
    expect(useStore.getState().settings.meals).toEqual(before);
    const withFood = useStore.getState().entries[0].mealId;
    const x = await one({ type: 'edit_meals', remove: [withFood] });
    expect(x.kind).toBe('miss');
  });
  it('a saved meal by name, water removed, a measurement logged and removed', async () => {
    const e = useStore.getState().entries.slice(0, 2);
    useStore.getState().saveMeal({ id: 'sm1', name: 'Morning oats', items: e.map((x) => ({ snap: x.snap, qty: x.qty })), createdAt: Date.now() });
    const n0 = useStore.getState().entries.length;
    const r = await one({ type: 'log_saved_meal', name: 'morning oats', meal: 'breakfast' });
    expect(useStore.getState().entries).toHaveLength(n0 + 2);
    expect(r.lines.some((l) => l.ref)).toBe(true);
    r.undo!();
    expect(useStore.getState().entries).toHaveLength(n0);
    useStore.getState().addWater(330, today);
    const w = await one({ type: 'delete_water' });
    expect(useStore.getState().water.some((x) => x.date === today && x.ml === 330)).toBe(false);
    w.undo!();
    expect(useStore.getState().water.some((x) => x.date === today && x.ml === 330)).toBe(true);
    const m = await one({ type: 'log_measurement', kind: 'waist', cm: 82 });
    expect(useStore.getState().measurements.at(-1)).toMatchObject({ kind: 'waist', cm: 82, date: today });
    const md = await one({ type: 'delete_measurement', kind: 'waist' });
    expect(useStore.getState().measurements.some((x) => x.kind === 'waist' && x.cm === 82)).toBe(false);
    md.undo!(); m.undo!();
  });
  it('own exercises: create, hide, weight jump', async () => {
    const c = await one({ type: 'create_exercise', name: 'Harness Neck Curl', focus: ['shoulders', 'chest'], equipment: 'barbell', log_type: 'weightReps' });
    const ex = useStore.getState().exercises.find((e) => e.name === 'Harness Neck Curl')!;
    expect(ex.muscles).toEqual(['shoulders', 'chest']);
    const h = await one({ type: 'archive_exercise', exercise: 'harness neck curl', on: true });
    expect(useStore.getState().exercises.find((e) => e.id === ex.id)!.archived).toBe(true);
    h.undo!();
    const inc = await one({ type: 'set_increment', exercise: 'Barbell Bench Press', kg: 1.25 });
    const bench = allExercises(useStore.getState().exercises).find((e) => e.name === 'Barbell Bench Press')!;
    expect(useStore.getState().increments[bench.id]).toBe(1.25);
    inc.undo!();
    expect(useStore.getState().increments[bench.id]).toBeUndefined();
    c.undo!();
    expect(useStore.getState().exercises.some((e) => e.name === 'Harness Neck Curl')).toBe(false);
  });
  it('the running workout: pause, rest, superset, order, note, name', async () => {
    const st = useStore.getState();
    st.startWorkout({ routine: st.routines[0] });
    expect((await one({ type: 'workout_control', op: 'pause' })).title).toBe('Workout paused');
    expect(useStore.getState().active!.pausedAt).toBeTruthy();
    await one({ type: 'workout_control', op: 'resume' });
    expect(useStore.getState().active!.pausedAt).toBeFalsy();
    await one({ type: 'workout_control', op: 'rest_start', seconds: 120 });
    expect(useStore.getState().active!.rest!.total).toBe(120);
    await one({ type: 'workout_control', op: 'rest_add', seconds: -30 });
    expect(useStore.getState().active!.rest!.total).toBe(90);
    await one({ type: 'workout_control', op: 'rest_skip' });
    expect(useStore.getState().active!.rest).toBeNull();
    const first = useStore.getState().active!.exercises[0];
    const name = allExercises(useStore.getState().exercises).find((e) => e.id === first.exerciseId)!.name;
    const ss = await one({ type: 'workout_control', op: 'superset', exercise: name });
    expect(useStore.getState().active!.exercises[0].supersetGroup).toBeTruthy();
    ss.undo!();
    expect(useStore.getState().active!.exercises[0].supersetGroup).toBeFalsy();
    await one({ type: 'workout_control', op: 'move_down', exercise: name });
    expect(useStore.getState().active!.exercises[1].id).toBe(first.id);
    await one({ type: 'workout_control', op: 'note', exercise: name, text: 'Seat on 4' });
    expect(useStore.getState().active!.exercises.find((e) => e.id === first.id)!.note).toBe('Seat on 4');
    await one({ type: 'workout_control', op: 'rename', text: 'Heavy push' });
    expect(useStore.getState().active!.name).toBe('Heavy push');
  });
  it('"start today\'s workout" starts the planned one; skip_day clears a planned day', async () => {
    const st = useStore.getState();
    // make sure something is planned today and tomorrow
    st.setSchedule({ mode: 'weekly', weekly: { ...st.schedule.weekly, [weekdayOf(today)]: st.routines[0].id, [weekdayOf(addDays(today, 1))]: st.routines[1].id } });
    const r = await one({ type: 'start_workout', routine: 'planned' });
    expect(useStore.getState().active!.routineId).toBe(st.routines[0].id);
    r.undo!();
    const sk = await one({ type: 'skip_day', day: 'tomorrow' });
    expect(plannedFor(useStore.getState(), addDays(today, 1), today)).toBeNull();
    sk.undo!();
    expect(plannedFor(useStore.getState(), addDays(today, 1), today)!.routineId).toBe(st.routines[1].id);
  });
});

describe('big changes are previews: nothing happens before Apply', () => {
  it('the whole week: a preview with seven days, Apply sets it, Undo takes it back', async () => {
    const st = useStore.getState();
    const before = st.schedule;
    const r = await one({ type: 'set_split', days: [{ weekday: 5, routine: 'Legs' }, { weekday: 2, routine: null, wrestling: true }, { weekday: 4, routine: null, wrestling: true }, { weekday: 3, routine: 'rest' }] });
    expect(r.pending).toBe(true);
    expect(r.week).toHaveLength(7);
    expect(r.week!.filter((d) => d.changed).length).toBeGreaterThanOrEqual(3);
    expect(useStore.getState().schedule).toEqual(before);
    r.button!.run();
    const s = useStore.getState().schedule;
    expect(st.routines.find((x) => x.id === s.weekly[5])!.name).toBe('Legs');
    expect(s.activities?.[2]).toContain('wrestling');
    expect(s.activities?.[4]).toContain('wrestling');
    expect(s.weekly[3] ?? null).toBeNull();
    r.undo!();
    expect(useStore.getState().schedule).toEqual(before);
  });
  it('deleting a workout or clearing a meal waits for a tap', async () => {
    const n = useStore.getState().sessions.length;
    const w = await one({ type: 'delete_workout' });
    expect(w.pending).toBe(true);
    expect(useStore.getState().sessions).toHaveLength(n);
    w.button!.run();
    expect(useStore.getState().sessions).toHaveLength(n - 1);
    w.undo!();
    expect(useStore.getState().sessions).toHaveLength(n);
    const day = useStore.getState().entries.find((e) => useStore.getState().entries.filter((x) => x.date === e.date && x.mealId === e.mealId).length > 1)!;
    const before = useStore.getState().entries.length;
    const c = await one({ type: 'delete_food', meal: day.mealId, day: day.date });
    expect(c.pending).toBe(true);
    expect(useStore.getState().entries).toHaveLength(before);
    c.button!.run();
    expect(useStore.getState().entries.length).toBeLessThan(before);
    c.undo!();
    expect(useStore.getState().entries).toHaveLength(before);
  });
  it('a newer preview of the same thing replaces the older one', async () => {
    const a = await one({ type: 'plan_day', day: 'tomorrow', focus: ['chest'] });
    const b = await one({ type: 'plan_day', day: 'tomorrow', focus: ['back'] });
    const c = await one({ type: 'plan_day', day: addDays(today, 2), focus: ['legs'] });
    const gone = replacedIds([{ results: [a], confirmed: [] }, { results: [b], confirmed: [] }, { results: [c], confirmed: [] }]);
    expect([...gone]).toEqual([a.id]);
    // one that was already applied stays as it is
    expect(replacedIds([{ results: [a], confirmed: [a.id] }, { results: [b], confirmed: [] }]).size).toBe(0);
  });
  it('a planned day is a one-off: it is planned, but not listed with the routines', async () => {
    const r = await one({ type: 'plan_day', day: 'tomorrow', focus: ['chest'] });
    r.button!.run();
    const st = useStore.getState();
    const made = st.routines.at(-1)!;
    expect(made.oneOff).toBe(addDays(today, 1));
    expect(plannedFor(st, addDays(today, 1), today)!.routineId).toBe(made.id);
    expect(runLookups(st, [{ kind: 'routines' }], { today, lang: 'en', pool: allExercises(st.exercises), mealLabel: (x) => x })).toContain(made.name);
  });
});

describe('the guide covers everything', () => {
  it('every action is taught, every setting and settings page is in the guide', () => {
    const system = AGENT_SYSTEM('en');
    for (const a of ACTION_TYPES) expect(system, a).toContain(a);
    const g = guideSections();
    for (const sp of SETTING_SPEC) expect(g.settings, sp.key).toContain(sp.key);
    const names: Record<string, string> = { today: 'Today', targets: 'Targets', training: 'Training', food: 'Food & water', units: 'Units & locale', look: 'Appearance', reminders: 'Reminders', data: 'Data & backup', privacy: 'Privacy', ai: 'Voice & AI', memory: 'Coach memory', about: 'About' };
    for (const sec of SETTINGS_SECTIONS) expect(APP_GUIDE, sec).toContain(names[sec]);
    expect(runLookups(useStore.getState(), [{ kind: 'guide', query: 'settings' }], { today, lang: 'en', pool: [], mealLabel: (x) => x })).toContain('trainingDays');
  });
  it('the schema stays small enough for Gemini (and plain JSON mode is the fallback)', () => {
    expect(JSON.stringify(AGENT_SCHEMA).length).toBeLessThan(16000);
  });
});
