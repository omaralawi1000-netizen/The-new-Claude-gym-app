import type { AppData, FoodEntry, SessionExercise, Settings, WorkoutSession } from './types';
import { REFERENCE_BY_ID } from '../data/foods';
import { SEED_EXERCISES } from '../data/exercises';
import { addDays, dayKey } from './dates';
import { detectRecords } from './workout';
import { entryFromSnapshot, snapshotOf, uid } from './nutrition';
import { buildStarter, assignWeek } from './starter';

/** Clearly-labelled DEMO data: invented numbers that make every screen meaningful on first look. */
export function buildDemo(settings: Settings): Partial<AppData> {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const today = dayKey(Date.now(), settings.dayStartHour);
  const routinesOut = buildStarter({ days: 5, goal: 'muscle', experience: 'some', access: 'fullGym' }, SEED_EXERCISES); // Push / Pull / Legs
  const weekly = assignWeek([1, 3, 5], routinesOut);

  const sessions: WorkoutSession[] = [];
  const load: Record<string, number> = {};
  for (let i = 41; i >= 1; i--) {
    const d = addDays(today, -i);
    const wd = new Date(d + 'T12:00:00').getDay();
    if (![1, 3, 5].includes(wd)) continue;
    if (rnd() < 0.12) continue; // a missed day
    const r = routinesOut[wd === 1 ? 0 : wd === 3 ? 1 : 2];
    const start = new Date(d + 'T18:05:00').getTime();
    const exs: SessionExercise[] = r.items.map((it) => {
      const ex = SEED_EXERCISES.find((e) => e.id === it.exerciseId)!;
      const base = load[it.exerciseId] ?? (ex.muscles[0] === 'quads' || ex.muscles[0] === 'hamstrings' ? 60 : ex.muscles[0] === 'back' ? 50 : ex.equipment.includes('barbell') ? 45 : 14);
      const prog = Math.round((base + (rnd() < 0.3 ? 2.5 : 0)) * 4) / 4;
      load[it.exerciseId] = prog;
      const sets = Array.from({ length: it.workingSets + it.warmupSets }, (_, n) => {
        const warm = n < it.warmupSets;
        const reps = warm ? 8 : Math.max(it.repMin - 1, it.repMax - Math.floor(rnd() * 3) - (n - it.warmupSets));
        const t = start + n * 210000;
        if (ex.logType === 'duration') return { id: uid('s'), type: 'working' as const, durationSec: 45 + Math.floor(rnd() * 30), done: true, completedAt: t };
        return { id: uid('s'), type: warm ? ('warmup' as const) : ('working' as const), weightKg: warm ? Math.round((prog * 0.6) / 2.5) * 2.5 : ex.logType === 'bodyweightReps' ? undefined : prog, reps, done: true, completedAt: t };
      });
      return { id: uid('se'), exerciseId: it.exerciseId, restSec: it.restSec, sets };
    });
    const s: WorkoutSession = { id: uid('ws'), name: r.name, routineId: r.id, plannedDate: d, date: d, startedAt: start, endedAt: start + (52 + Math.floor(rnd() * 14)) * 60000, pausedMs: 0, status: 'done', exercises: exs };
    s.records = detectRecords(s, sessions, (id) => SEED_EXERCISES.find((e) => e.id === id));
    sessions.push(s);
  }

  // food: last 10 days (today left for the user)
  const entries: FoodEntry[] = [];
  const add = (d: string, meal: string, id: string, g: number, portion?: string) => {
    const f = REFERENCE_BY_ID[`ref:${id}`];
    const e = entryFromSnapshot(snapshotOf(f), portion ? { amount: g, unit: 'portion', portionId: portion } : { amount: g, unit: f.basis === 'ml' ? 'ml' : 'g' }, d, meal, { at: new Date(d + 'T12:00:00').getTime() + entries.length * 1000 });
    if (e) entries.push(e);
  };
  for (let i = 9; i >= 1; i--) {
    const d = addDays(today, -i);
    if (i === 4) continue; // a day with nothing logged
    add(d, 'breakfast', 'oats-dry', 60 + Math.round(rnd() * 20)); add(d, 'breakfast', 'milk-15', 200); add(d, 'breakfast', 'banana', 1, 'p0');
    add(d, 'lunch', 'chicken-cooked', 150 + Math.round(rnd() * 40)); add(d, 'lunch', 'rice-cooked', 200); add(d, 'lunch', 'broccoli', 100); add(d, 'lunch', 'olive-oil', 10);
    add(d, 'dinner', rnd() < 0.5 ? 'salmon-cooked' : 'beef-mince-cooked', 150); add(d, 'dinner', 'potato-boiled', 250); add(d, 'dinner', 'carrot', 100);
    add(d, 'snacks', 'skyr-plain', 200); if (rnd() < 0.6) add(d, 'snacks', 'almonds', 28);
  }
  const water = [] as AppData['water'];
  for (let i = 9; i >= 1; i--) { const d = addDays(today, -i); [500, 500, 250, 500, 250].forEach((ml, n) => water.push({ id: uid('w'), date: d, ml, at: new Date(d + 'T09:00:00').getTime() + n * 7200000 })); }

  const weights = [] as AppData['weights'];
  for (let i = 56; i >= 0; i -= 2) { const d = addDays(today, -i); weights.push({ id: uid('wt'), date: d, kg: Math.round((83.4 - (56 - i) * 0.035 + (rnd() - 0.5) * 0.9) * 10) / 10, at: new Date(d + 'T07:30:00').getTime() }); }

  const activities = [{ id: uid('ac'), date: addDays(today, -3), kind: 'run' as const, durationSec: 1680, distanceM: 5000, note: 'Easy pace', at: new Date(addDays(today, -3) + 'T08:00:00').getTime() }];

  return {
    routines: routinesOut.slice(0, 3),
    schedule: { mode: 'weekly', weekly, rotation: { order: [], pointer: 0, perWeek: 3 }, overrides: [], cleared: [] },
    sessions, entries, water, weights, activities, demo: true,
    settings: { ...settings, goals: { ...settings.goals, kcal: settings.goals.kcal ?? 2500, protein: settings.goals.protein ?? 160, carbs: settings.goals.carbs ?? 280, fat: settings.goals.fat ?? 75 } },
  };
}
