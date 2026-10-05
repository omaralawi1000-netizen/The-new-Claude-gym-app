import { create } from 'zustand';
import type {
  ActivityLog, AppData, Exercise, Food, FoodEntry, Measurement, Meal, PersonalRecord, Recipe, Routine, SavedMeal,
  SessionExercise, SetRecord, Settings, WeightLog, WorkoutSession, Lang, Nutrients,
} from '../lib/types';
import { SEED_EXERCISES } from '../data/exercises';
import { REFERENCE_FOODS } from '../data/foods';
import { dayKey, addDays, weekdayOf } from '../lib/dates';
import { detectRecords, lastPerformance, planSets, setsFromItem } from '../lib/workout';
import { entryFromSnapshot, recipeToFood, requantify, snapshotOf, uid } from '../lib/nutrition';
import { DATA_VERSION, defaultData, detectLang, normaliseData } from './defaults';

const KEY = 'aven.v1';

// ── persistence ─────────────────────────────────────────────

export function loadPersisted(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normaliseData(JSON.parse(raw), detectLang());
  } catch (e) {
    console.warn('Aven: could not read saved data', e);
    try {
      // keep the unreadable blob so it can be recovered manually instead of being overwritten
      const raw = localStorage.getItem(KEY);
      if (raw) localStorage.setItem(`${KEY}.corrupt.${Date.now()}`, raw);
    } catch { /* ignore */ }
  }
  return defaultData(detectLang());
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
export const persistStatus = { error: null as string | null, listeners: new Set<() => void>() };

function pickData(s: Store): AppData {
  const { settings, foods, favourites, savedMeals, recipes, entries, water, exercises, routines, schedule, sessions, active, weights, measurements, photos, activities, notes, demo, choices, increments } = s;
  return { v: DATA_VERSION, settings, foods, favourites, savedMeals, recipes, entries, water, exercises, routines, schedule, sessions, active, weights, measurements, photos, activities, notes, demo, choices, increments };
}

export function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    localStorage.setItem(KEY, JSON.stringify(pickData(useStore.getState())));
    if (persistStatus.error) { persistStatus.error = null; persistStatus.listeners.forEach((l) => l()); }
  } catch (e: any) {
    persistStatus.error = e?.name === 'QuotaExceededError' ? 'quota' : 'write';
    persistStatus.listeners.forEach((l) => l());
  }
}

function scheduleSave(immediate: boolean) {
  if (immediate) return flushSave();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 250);
}

// ── store shape ─────────────────────────────────────────────

export interface Store extends AppData {
  // settings
  updateSettings: (patch: Partial<Settings>) => void;
  // food
  logEntries: (entries: FoodEntry[]) => FoodEntry[];
  updateEntry: (id: string, next: FoodEntry) => void;
  removeEntry: (id: string) => FoodEntry | undefined;
  restoreEntries: (list: FoodEntry[]) => void;
  moveEntry: (id: string, to: { date?: string; mealId?: string }) => void;
  copyEntries: (from: { date: string; mealId?: string }, to: { date: string; mealId?: string }) => FoodEntry[];
  saveFood: (f: Food) => void;
  deleteFood: (id: string) => Food | undefined;
  toggleFavourite: (id: string) => void;
  upsertRecipe: (r: Recipe) => void;
  deleteRecipe: (id: string) => Recipe | undefined;
  restoreRecipe: (r: Recipe) => void;
  saveMeal: (m: SavedMeal) => void;
  deleteMeal: (id: string) => SavedMeal | undefined;
  addWater: (ml: number, date: string) => string;
  removeWater: (id: string) => void;
  setChoice: (query: string, foodId: string) => void;
  setMeals: (meals: Meal[]) => void;
  // workouts
  startWorkout: (opts: { routine?: Routine; fromSession?: WorkoutSession; name?: string; plannedDate?: string }) => WorkoutSession | null;
  mutateActive: (fn: (s: WorkoutSession) => WorkoutSession) => void;
  pauseActive: () => void;
  resumeActive: () => void;
  finishActive: (note?: string) => WorkoutSession | null;
  discardActive: () => WorkoutSession | null;
  restoreActive: (s: WorkoutSession) => void;
  mutateSession: (id: string, fn: (s: WorkoutSession) => WorkoutSession) => void;
  deleteSession: (id: string) => WorkoutSession | undefined;
  restoreSession: (s: WorkoutSession) => void;
  // plans
  upsertRoutine: (r: Routine) => void;
  deleteRoutine: (id: string) => Routine | undefined;
  restoreRoutine: (r: Routine) => void;
  setSchedule: (patch: Partial<AppData['schedule']>) => void;
  rescheduleMissed: (originDate: string, routineId: string, newDate: string) => void;
  skipPlanned: (date: string) => void;
  upsertExercise: (e: Exercise) => void;
  /** an exercise's own progression step in kg (undefined = back to the default) */
  setIncrement: (exerciseId: string, kg: number | undefined) => void;
  // body & activity
  addWeight: (kg: number, date: string) => WeightLog;
  removeWeight: (id: string) => void;
  restoreWeight: (w: WeightLog) => void;
  addMeasurement: (m: Omit<Measurement, 'id'>) => void;
  removeMeasurement: (id: string) => void;
  addPhoto: (p: { id: string; date: string; note?: string }) => void;
  removePhoto: (id: string) => void;
  addActivity: (a: Omit<ActivityLog, 'id' | 'at'>) => ActivityLog;
  removeActivity: (id: string) => ActivityLog | undefined;
  restoreActivity: (a: ActivityLog) => void;
  setNote: (date: string, patch: { training?: string; nutrition?: string }) => void;
  // data
  /** Apply a partial state update AND persist it (use instead of setState for anything that must survive a reload). */
  patch: (p: Partial<AppData> | ((s: Store) => Partial<AppData>)) => void;
  replaceAll: (d: AppData) => void;
  resetAll: () => void;
}

const dayOf = (s: Settings, t = Date.now()) => dayKey(t, s.dayStartHour);

const initial = loadPersisted();

export const useStore = create<Store>((set, get) => {
  const mutate = (fn: (s: Store) => Partial<Store>, immediate = false) => {
    set((s) => fn(s));
    scheduleSave(immediate);
  };
  return {
    ...initial,

    updateSettings: (patch) => mutate((s) => ({ settings: { ...s.settings, ...patch } })),

    // ── food
    logEntries: (list) => {
      const existing = new Set(get().entries.map((e) => e.id));
      const fresh = list.filter((e) => !existing.has(e.id)); // idempotent: a double-tap can never double-log
      if (!fresh.length) return [];
      mutate((s) => ({ entries: [...s.entries, ...fresh] }));
      return fresh;
    },
    updateEntry: (id, next) => mutate((s) => ({ entries: s.entries.map((e) => (e.id === id ? next : e)) })),
    removeEntry: (id) => {
      const e = get().entries.find((x) => x.id === id);
      if (e) mutate((s) => ({ entries: s.entries.filter((x) => x.id !== id) }));
      return e;
    },
    restoreEntries: (list) => {
      const existing = new Set(get().entries.map((e) => e.id));
      const fresh = list.filter((e) => !existing.has(e.id));
      if (fresh.length) mutate((s) => ({ entries: [...s.entries, ...fresh] }));
    },
    moveEntry: (id, to) => mutate((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, ...(to.date ? { date: to.date } : {}), ...(to.mealId ? { mealId: to.mealId } : {}) } : e)) })),
    copyEntries: (from, to) => {
      const src = get().entries.filter((e) => e.date === from.date && (!from.mealId || e.mealId === from.mealId));
      const copies = src.map((e) => ({ ...e, id: uid('e'), date: to.date, mealId: to.mealId ?? e.mealId, at: Date.now() }));
      if (copies.length) mutate((s) => ({ entries: [...s.entries, ...copies] }));
      return copies;
    },
    saveFood: (f) => mutate((s) => ({ foods: s.foods.some((x) => x.id === f.id) ? s.foods.map((x) => (x.id === f.id ? f : x)) : [...s.foods, f] })),
    deleteFood: (id) => {
      const f = get().foods.find((x) => x.id === id);
      if (f) mutate((s) => ({ foods: s.foods.filter((x) => x.id !== id), favourites: s.favourites.filter((x) => x !== id) }));
      return f;
    },
    toggleFavourite: (id) => mutate((s) => ({ favourites: s.favourites.includes(id) ? s.favourites.filter((x) => x !== id) : [...s.favourites, id] })),
    upsertRecipe: (r) => mutate((s) => ({ recipes: s.recipes.some((x) => x.id === r.id) ? s.recipes.map((x) => (x.id === r.id ? r : x)) : [...s.recipes, r] })),
    deleteRecipe: (id) => {
      const r = get().recipes.find((x) => x.id === id);
      if (r) mutate((s) => ({ recipes: s.recipes.filter((x) => x.id !== id) }));
      return r;
    },
    restoreRecipe: (r) => mutate((s) => ({ recipes: s.recipes.some((x) => x.id === r.id) ? s.recipes : [...s.recipes, r] })),
    saveMeal: (m) => mutate((s) => ({ savedMeals: s.savedMeals.some((x) => x.id === m.id) ? s.savedMeals.map((x) => (x.id === m.id ? m : x)) : [...s.savedMeals, m] })),
    deleteMeal: (id) => {
      const m = get().savedMeals.find((x) => x.id === id);
      if (m) mutate((s) => ({ savedMeals: s.savedMeals.filter((x) => x.id !== id) }));
      return m;
    },
    addWater: (ml, date) => {
      const id = uid('w');
      mutate((s) => ({ water: [...s.water, { id, date, ml, at: Date.now() }] }));
      return id;
    },
    removeWater: (id) => mutate((s) => ({ water: s.water.filter((w) => w.id !== id) })),
    setChoice: (query, foodId) => mutate((s) => ({ choices: { ...s.choices, [query]: foodId } })),
    setMeals: (meals) => mutate((s) => ({ settings: { ...s.settings, meals } })),

    // ── workouts
    startWorkout: ({ routine, fromSession, name, plannedDate }) => {
      const s = get();
      if (s.active) return null;
      const now = Date.now();
      const exMap = exerciseMap(s.exercises);
      let exercises: SessionExercise[] = [];
      if (routine) {
        exercises = routine.items.map((it) => {
          const last = lastPerformance(it.exerciseId, s.sessions);
          const ex = exMap.get(it.exerciseId);
          let sets = setsFromItem(it, last?.sets);
          if (ex && (ex.logType === 'duration' || ex.logType === 'distance')) {
            sets = sets.filter((x) => x.type === 'working').map((x) => ({ ...x, target: { ...x.target } }));
          }
          sets = planSets(ex, sets, s.sessions, s.increments, s.settings.plateStep);
          return { id: uid('se'), exerciseId: it.exerciseId, restSec: it.restSec, supersetGroup: it.supersetGroup, note: it.note, sets };
        });
      } else if (fromSession) {
        // the same exercises and sets again, aiming at the routine's rep range (or 8–12) with this session's progression in them
        const routineOf = fromSession.routineId ? s.routines.find((r) => r.id === fromSession.routineId) : undefined;
        exercises = fromSession.exercises.map((e) => {
          const item = routineOf?.items.find((i) => i.exerciseId === e.exerciseId);
          const sets: SetRecord[] = e.sets.map((x) => ({ id: uid('s'), type: x.type, done: false, target: { repMin: item?.repMin ?? 8, repMax: item?.repMax ?? 12, weightKg: x.weightKg } }));
          return { id: uid('se'), exerciseId: e.exerciseId, restSec: e.restSec, supersetGroup: e.supersetGroup, note: e.note, sets: planSets(exMap.get(e.exerciseId), sets, s.sessions, s.increments, s.settings.plateStep) };
        });
      }
      const session: WorkoutSession = {
        id: uid('ws'), name: name ?? routine?.name ?? fromSession?.name ?? '', routineId: routine?.id ?? fromSession?.routineId, plannedDate,
        date: dayOf(s.settings, now), startedAt: now, pausedMs: 0, status: 'active', exercises, rest: null,
      };
      mutate(() => ({ active: session }), true);
      return session;
    },
    mutateActive: (fn) => {
      const a = get().active;
      if (!a) return;
      mutate(() => ({ active: fn(a) }), true);
    },
    pauseActive: () => {
      const a = get().active;
      if (!a || a.pausedAt) return;
      mutate(() => ({ active: { ...a, pausedAt: Date.now(), rest: a.rest ? { ...a.rest, endsAt: a.rest.endsAt - Date.now() } : null } }), true);
    },
    resumeActive: () => {
      const a = get().active;
      if (!a || !a.pausedAt) return;
      const now = Date.now();
      // while paused, rest.endsAt holds the REMAINING ms
      mutate(() => ({ active: { ...a, pausedMs: a.pausedMs + (now - a.pausedAt!), pausedAt: undefined, rest: a.rest ? { ...a.rest, endsAt: now + a.rest.endsAt } : null } }), true);
    },
    finishActive: (note) => {
      const s = get();
      const a = s.active;
      if (!a) return null;
      const now = Date.now();
      const pausedMs = a.pausedMs + (a.pausedAt ? now - a.pausedAt : 0);
      // drop sets that were never completed and exercises left empty
      const exercises = a.exercises
        .map((e) => ({ ...e, plannedSets: e.sets.filter((x) => x.type === 'working').length, sets: e.sets.filter((x) => x.done) }))
        .filter((e) => e.sets.length > 0);
      const done: WorkoutSession = {
        ...a, exercises, status: 'done', endedAt: now, pausedMs, pausedAt: undefined, rest: null, note: note ?? a.note,
        name: a.name || 'Workout',
      };
      const exMap = exerciseMap(s.exercises);
      done.records = detectRecords(done, s.sessions, (id) => exMap.get(id));
      const sessions = [...s.sessions, done].sort((x, y) => (x.endedAt ?? 0) - (y.endedAt ?? 0));
      const schedule = { ...s.schedule };
      if (schedule.mode === 'rotation' && a.routineId && schedule.rotation.order[schedule.rotation.pointer % Math.max(1, schedule.rotation.order.length)] === a.routineId) {
        schedule.rotation = { ...schedule.rotation, pointer: (schedule.rotation.pointer + 1) % Math.max(1, schedule.rotation.order.length) };
      }
      mutate(() => ({ sessions, active: null, schedule }), true);
      return done;
    },
    discardActive: () => {
      const a = get().active;
      if (a) mutate(() => ({ active: null }), true);
      return a;
    },
    restoreActive: (a) => { if (!get().active) mutate(() => ({ active: a }), true); },
    mutateSession: (id, fn) => mutate((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? fn(x) : x)) })),
    deleteSession: (id) => {
      const x = get().sessions.find((y) => y.id === id);
      if (x) mutate((s) => ({ sessions: s.sessions.filter((y) => y.id !== id) }));
      return x;
    },
    restoreSession: (x) => mutate((s) => ({ sessions: s.sessions.some((y) => y.id === x.id) ? s.sessions : [...s.sessions, x].sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0)) })),

    // ── plans
    upsertRoutine: (r) => mutate((s) => ({ routines: s.routines.some((x) => x.id === r.id) ? s.routines.map((x) => (x.id === r.id ? { ...r, updatedAt: Date.now() } : x)) : [...s.routines, r] })),
    deleteRoutine: (id) => {
      const r = get().routines.find((x) => x.id === id);
      if (!r) return undefined;
      mutate((s) => {
        const weekly = { ...s.schedule.weekly };
        for (const k of Object.keys(weekly)) if (weekly[+k] === id) weekly[+k] = null;
        return {
          routines: s.routines.filter((x) => x.id !== id),
          schedule: { ...s.schedule, weekly, overrides: s.schedule.overrides.filter((o) => o.routineId !== id), rotation: { ...s.schedule.rotation, order: s.schedule.rotation.order.filter((x) => x !== id) } },
        };
      });
      return r;
    },
    restoreRoutine: (r) => mutate((s) => ({ routines: s.routines.some((x) => x.id === r.id) ? s.routines : [...s.routines, r] })),
    setSchedule: (patch) => mutate((s) => ({ schedule: { ...s.schedule, ...patch } })),
    rescheduleMissed: (originDate, routineId, newDate) => mutate((s) => {
      const cleared = s.schedule.cleared.includes(originDate) ? s.schedule.cleared : [...s.schedule.cleared, originDate];
      const overrides = [...s.schedule.overrides.filter((o) => !(o.date === newDate) && !(o.date === originDate)), { date: newDate, routineId, originDate }];
      return { schedule: { ...s.schedule, cleared, overrides } };
    }),
    skipPlanned: (date) => mutate((s) => ({ schedule: { ...s.schedule, cleared: s.schedule.cleared.includes(date) ? s.schedule.cleared : [...s.schedule.cleared, date], overrides: s.schedule.overrides.filter((o) => o.date !== date) } })),
    setIncrement: (id, kg) => mutate((s) => { const next = { ...s.increments }; if (kg && kg > 0) next[id] = kg; else delete next[id]; return { increments: next }; }),
    upsertExercise: (e) => mutate((s) => ({ exercises: s.exercises.some((x) => x.id === e.id) ? s.exercises.map((x) => (x.id === e.id ? e : x)) : [...s.exercises, e] })),

    // ── body & activity
    addWeight: (kg, date) => {
      const w: WeightLog = { id: uid('wt'), date, kg, at: Date.now() };
      mutate((s) => ({ weights: [...s.weights, w] }));
      return w;
    },
    removeWeight: (id) => mutate((s) => ({ weights: s.weights.filter((w) => w.id !== id) })),
    restoreWeight: (w) => mutate((s) => ({ weights: s.weights.some((x) => x.id === w.id) ? s.weights : [...s.weights, w] })),
    addMeasurement: (m) => mutate((s) => ({ measurements: [...s.measurements, { ...m, id: uid('ms') }] })),
    removeMeasurement: (id) => mutate((s) => ({ measurements: s.measurements.filter((m) => m.id !== id) })),
    addPhoto: (p) => mutate((s) => ({ photos: [...s.photos, p] })),
    removePhoto: (id) => mutate((s) => ({ photos: s.photos.filter((p) => p.id !== id) })),
    addActivity: (a) => {
      const log: ActivityLog = { ...a, id: uid('ac'), at: Date.now() };
      mutate((s) => ({ activities: [...s.activities, log] }));
      return log;
    },
    removeActivity: (id) => {
      const a = get().activities.find((x) => x.id === id);
      if (a) mutate((s) => ({ activities: s.activities.filter((x) => x.id !== id) }));
      return a;
    },
    restoreActivity: (a) => mutate((s) => ({ activities: s.activities.some((x) => x.id === a.id) ? s.activities : [...s.activities, a] })),
    setNote: (date, patch) => mutate((s) => {
      const cur = s.notes.find((n) => n.date === date);
      const next = { ...(cur ?? { date }), ...patch };
      return { notes: cur ? s.notes.map((n) => (n.date === date ? next : n)) : [...s.notes, next] };
    }),

    // ── data
    patch: (p) => mutate((s) => (typeof p === 'function' ? p(s) : p) as Partial<Store>, true),
    replaceAll: (d) => { set({ ...d }); flushSave(); },
    resetAll: () => { const lang = get().settings.language; set({ ...defaultData(lang) }); flushSave(); },
  };
});

// write-through on tab hide / close so nothing is lost
if (typeof window !== 'undefined') {
  const flush = () => flushSave();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

// ── derived lookups ─────────────────────────────────────────

let exCache: { src: Exercise[]; map: Map<string, Exercise>; all: Exercise[] } | null = null;
export function exerciseMap(custom: Exercise[]): Map<string, Exercise> {
  if (exCache?.src !== custom) {
    const all = [...SEED_EXERCISES, ...custom.filter((e) => !e.archived)];
    exCache = { src: custom, map: new Map([...SEED_EXERCISES, ...custom].map((e) => [e.id, e])), all };
  }
  return exCache.map;
}
export function allExercises(custom: Exercise[]): Exercise[] {
  exerciseMap(custom);
  return exCache!.all;
}

let poolCache: { foods: Food[]; recipes: Recipe[]; pool: Food[] } | null = null;
export function foodPool(foods: Food[], recipes: Recipe[]): Food[] {
  if (poolCache?.foods !== foods || poolCache.recipes !== recipes) {
    const rf = recipes.map(recipeToFood).filter(Boolean) as Food[];
    poolCache = { foods, recipes, pool: [...foods, ...rf, ...REFERENCE_FOODS] };
  }
  return poolCache.pool;
}

// ── planning ────────────────────────────────────────────────

export type PlanSource = 'override' | 'weekly' | 'rotation';
export interface Planned { routineId: string; source: PlanSource; originDate?: string }

export function plannedFor(d: Pick<AppData, 'schedule' | 'routines' | 'sessions'>, date: string, today: string): Planned | null {
  const has = (id: string | null | undefined): id is string => !!id && d.routines.some((r) => r.id === id);
  const ov = d.schedule.overrides.find((o) => o.date === date && has(o.routineId));
  if (ov) return { routineId: ov.routineId, source: 'override', originDate: ov.originDate };
  if (d.schedule.cleared.includes(date)) return null;
  if (d.schedule.mode === 'weekly') {
    const id = d.schedule.weekly[weekdayOf(date)];
    return has(id) ? { routineId: id, source: 'weekly' } : null;
  }
  // flexible rotation: only "what's next" is meaningful, shown on today
  if (date === today) {
    const { order, pointer } = d.schedule.rotation;
    const valid = order.filter((id) => has(id));
    if (valid.length) return { routineId: valid[pointer % valid.length], source: 'rotation' };
  }
  return null;
}

export function sessionOn(d: Pick<AppData, 'sessions'>, date: string, routineId?: string): WorkoutSession | undefined {
  return d.sessions.find((s) => (s.plannedDate === date || s.date === date) && (!routineId || s.routineId === routineId || s.plannedDate === date));
}

/** Weekly-plan workouts from the last `lookback` days that were neither done nor skipped/moved. */
export function missedWorkouts(d: Pick<AppData, 'schedule' | 'routines' | 'sessions'>, today: string, lookback = 6): { date: string; routineId: string }[] {
  if (d.schedule.mode !== 'weekly') return [];
  const out: { date: string; routineId: string }[] = [];
  for (let i = 1; i <= lookback; i++) {
    const date = addDays(today, -i);
    const p = plannedFor(d, date, today);
    if (!p) continue;
    const done = d.sessions.some((s) => s.plannedDate === date || (s.date === date && s.routineId === p.routineId));
    if (!done) out.push({ date, routineId: p.routineId });
  }
  return out;
}

export function setLangOnDocument(lang: Lang) {
  document.documentElement.lang = lang;
}

export type { SetRecord, PersonalRecord, Nutrients };
export { entryFromSnapshot, requantify, snapshotOf };
