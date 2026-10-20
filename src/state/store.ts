import { create } from 'zustand';
import type { StepDay, HealthDay, CatchUp, Schedule,
  ActivityLog, AppData, Exercise, Food, FoodEntry, Measurement, Meal, MemoryNote, WeekReviewNote, PersonalRecord, Recipe, Routine, SavedMeal,
  SessionExercise, SetRecord, Settings, WeightLog, WorkoutSession, Nutrients,
} from '../lib/types';
import { SEED_EXERCISES } from '../data/exercises';
import { REFERENCE_FOODS } from '../data/foods';
import { dayKey, addDays, weekdayOf } from '../lib/dates';
import { countable, detectRecords, lastPerformance, planSets, setsFromItem } from '../lib/workout';
import { entryFromSnapshot, recipeToFood, requantify, snapshotOf, uid } from '../lib/nutrition';
import { DATA_VERSION, defaultData, detectLang, normaliseData } from './defaults';
import { heavyMode, noteTarget } from '../lib/eating';

const KEY = 'aven.v1';
/** The running workout on its own: written at once on every change (a few KB), while the whole app's data is written a moment
 *  later when the phone is idle. Removed on every full save, so when it exists it is always the newest copy. */
const ACTIVE_KEY = 'aven.v1.active';

// ── persistence ─────────────────────────────────────────────

export function loadPersisted(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      try { const act = localStorage.getItem(ACTIVE_KEY); if (act) { const a = JSON.parse(act); if (a && 'active' in a) data.active = a.active; } } catch { /* the full copy's workout stands */ }
      return normaliseData(data, detectLang());
    }
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
  const { settings, foods, favourites, savedMeals, recipes, entries, water, exercises, routines, schedule, sessions, active, weights, measurements, photos, activities, steps, health, hcGone, catchUps, targets, marks, notes, demo, choices, increments, memory, reviews } = s;
  return { v: DATA_VERSION, settings, foods, favourites, savedMeals, recipes, entries, water, exercises, routines, schedule, sessions, active, weights, measurements, photos, activities, steps, health, hcGone, catchUps, targets, marks, notes, demo, choices, increments, memory, reviews };
}

export function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (idleId !== null) { cancelIdle(idleId); idleId = null; }
  try {
    localStorage.setItem(KEY, JSON.stringify(pickData(useStore.getState())));
    localStorage.removeItem(ACTIVE_KEY); // the full copy now holds the newest workout
    if (persistStatus.error) { persistStatus.error = null; persistStatus.listeners.forEach((l) => l()); }
  } catch (e: any) {
    persistStatus.error = e?.name === 'QuotaExceededError' ? 'quota' : 'write';
    persistStatus.listeners.forEach((l) => l());
  }
}

const idle = (fn: () => void): number => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 1200 }) : (setTimeout(fn, 0) as unknown as number));
const cancelIdle = (id: number) => { if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id); else clearTimeout(id); };
let idleId: number | null = null;

/**
 * `true`: written now (finishing a workout, an import). `'active'`: only the running workout is written now — a set ticked
 * or a number typed used to rewrite all of the app's data on the spot, a pause that grew with every week of history — and
 * the rest follows when the phone is idle. Otherwise a quarter of a second later.
 */
function scheduleSave(mode: boolean | 'active') {
  if (mode === true) return flushSave();
  if (mode === 'active') {
    try { localStorage.setItem(ACTIVE_KEY, JSON.stringify({ active: useStore.getState().active })); } catch { return flushSave(); }
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; if (idleId === null) idleId = idle(() => { idleId = null; flushSave(); }); }, 600);
    return;
  }
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
  /** `endAt`: finish as of this moment instead of now (a forgotten workout); a pause is only counted up to it */
  finishActive: (note?: string, endAt?: number) => WorkoutSession | null;
  discardActive: () => WorkoutSession | null;
  restoreActive: (s: WorkoutSession) => void;
  mutateSession: (id: string, fn: (s: WorkoutSession) => WorkoutSession) => void;
  deleteSession: (id: string) => WorkoutSession | undefined;
  restoreSession: (s: WorkoutSession) => void;
  // plans
  upsertRoutine: (r: Routine) => void;
  /** also takes it off the plan; what it took off comes back with it, so Undo can put it back where it was */
  deleteRoutine: (id: string) => RemovedRoutine | undefined;
  /** puts a routine back, and (with `slots` from deleteRoutine) its weekdays, one-off days and rotation places */
  restoreRoutine: (r: Routine, slots?: RemovedRoutine['slots']) => void;
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
  restoreMeasurement: (m: Measurement) => void;
  addPhoto: (p: { id: string; date: string; note?: string }) => void;
  removePhoto: (id: string) => void;
  addActivity: (a: Omit<ActivityLog, 'id' | 'at'>) => ActivityLog;
  /** the watch's numbers (lib/healthSync.ts): its workouts and steps, merged without doubles */
  mergeHealth: (next: { activities: ActivityLog[]; steps: StepDay[]; health?: HealthDay[] }) => void;
  /** heavy days being caught up (lib/eating.ts) */
  setCatchUps: (next: CatchUp[]) => void;
  removeActivity: (id: string) => ActivityLog | undefined;
  restoreActivity: (a: ActivityLog) => void;
  setNote: (date: string, patch: { training?: string; nutrition?: string }) => void;
  // what the Coach remembers
  addMemory: (m: Omit<MemoryNote, 'id' | 'at'>) => MemoryNote;
  updateMemory: (id: string, patch: Partial<Omit<MemoryNote, 'id'>>) => void;
  removeMemory: (id: string) => MemoryNote | undefined;
  restoreMemory: (m: MemoryNote) => void;
  /** keeps a weekly review (one per week: a newer one for the same week replaces it) */
  saveReview: (r: WeekReviewNote) => void;
  // data
  /** Apply a partial state update AND persist it (use instead of setState for anything that must survive a reload). */
  patch: (p: Partial<AppData> | ((s: Store) => Partial<AppData>)) => void;
  replaceAll: (d: AppData) => void;
  resetAll: () => void;
}

const dayOf = (s: Settings, t = Date.now()) => dayKey(t, s.dayStartHour);

/** A change of the calorie target is recorded with its day (lib/eating.ts `noteTarget`), unless the change brings its own
 *  history (demo, restore: `replaceAll` never records). Heavy-day notices turning on (by hand, or because the goal became
 *  fat loss) remember the day, so days before it are never judged. */
function withTarget(s: Store, next: Partial<Store>): Partial<Store> {
  if (!next.settings) return next;
  let out = next;
  if (heavyMode(next.settings) === 'on' && heavyMode(s.settings) !== 'on' && next.settings.heavyOnSince === s.settings.heavyOnSince) out = { ...out, settings: { ...next.settings, heavyOnSince: dayOf(next.settings) } };
  if ('targets' in next) return out;
  const was = s.settings.goals.kcal, now = next.settings.goals?.kcal;
  if (was === now) return out;
  return { ...out, targets: noteTarget(s.targets, was, now, dayOf(next.settings)) };
}

/**
 * After a finished workout's sets change: its records are detected again against the workouts before it, and so are those
 * of later workouts with any of the same exercises (a best they beat may have changed).
 */
export function refreshRecords(sessions: WorkoutSession[], edited: WorkoutSession, before: WorkoutSession, exMap: Map<string, Exercise>): WorkoutSession[] {
  const ids = new Set([...edited.exercises, ...before.exercises].map((e) => e.exerciseId));
  const end = edited.endedAt ?? 0;
  const lookup = (id: string) => exMap.get(id);
  // in order, so a later workout measures against already refreshed ones
  const order = sessions.map((x, i) => ({ x, i })).sort((p, q) => (p.x.endedAt ?? 0) - (q.x.endedAt ?? 0));
  const out = [...sessions];
  for (const { x, i } of order) {
    if (x.status !== 'done') continue;
    const self = x.id === edited.id;
    if (!self && ((x.endedAt ?? 0) < end || !x.exercises.some((e) => ids.has(e.exerciseId)))) continue;
    const records = detectRecords(x, out.filter((y) => y.status === 'done'), lookup);
    if (JSON.stringify(records) === JSON.stringify(x.records ?? [])) continue;
    out[i] = { ...x, records };
  }
  return out;
}

type Rotation = Schedule['rotation'];
/** The rotation after a routine in it was done: next is the one after it (its nearest place from "next" on, if it is in twice). */
export function rotationAfter(rot: Rotation, routineId: string): Rotation {
  const n = rot.order.length;
  if (!n) return rot;
  const p = rot.pointer % n;
  for (let k = 0; k < n; k++) if (rot.order[(p + k) % n] === routineId) return { ...rot, pointer: (p + k + 1) % n };
  return rot;
}
/** The rotation without the routines at these places, still pointing at the same next routine (or the one after a removed one). */
export function rotationWithout(rot: Rotation, drop: (id: string, i: number) => boolean): Rotation {
  const n = rot.order.length;
  const p = n ? rot.pointer % n : 0;
  const order = rot.order.filter((id, i) => !drop(id, i));
  const before = rot.order.slice(0, p).filter((id, i) => drop(id, i)).length;
  return { ...rot, order, pointer: order.length ? (p - before) % order.length : 0 };
}

/** Notes the day each weekday's plan changed (switching to weekdays changes them all), so older days are not "missed". */
export function withWeeklySince(prev: Schedule, next: Schedule, today: string): Schedule {
  if (next.mode !== 'weekly' || next.weeklySince !== prev.weeklySince) return next; // an Undo brings its own back
  const since = { ...(next.weeklySince ?? {}) };
  let changed = false;
  for (let wd = 0; wd < 7; wd++) {
    if (prev.mode !== 'weekly' || (prev.weekly[wd] ?? null) !== (next.weekly[wd] ?? null)) { since[wd] = today; changed = true; }
  }
  return changed ? { ...next, weeklySince: since } : next;
}

/** A deleted routine and the places on the plan it was taken off. */
export interface RemovedRoutine {
  routine: Routine;
  slots: { weekdays: number[]; overrides: Schedule['overrides']; rotation: { order: string[]; pointer: number; indexes: number[] } };
}

/** The plan without a routine, and where it was on it. */
export function scheduleWithout(sch: Schedule, id: string): { schedule: Schedule; slots: RemovedRoutine['slots'] } {
  const weekly = { ...sch.weekly };
  const weekdays: number[] = [];
  for (const k of Object.keys(weekly)) if (weekly[+k] === id) { weekly[+k] = null; weekdays.push(+k); }
  const indexes = sch.rotation.order.flatMap((x, i) => (x === id ? [i] : []));
  return {
    schedule: { ...sch, weekly, overrides: sch.overrides.filter((o) => o.routineId !== id), rotation: rotationWithout(sch.rotation, (x) => x === id) },
    slots: { weekdays, overrides: sch.overrides.filter((o) => o.routineId === id), rotation: { order: sch.rotation.order, pointer: sch.rotation.pointer, indexes } },
  };
}

/** Puts a routine back on the places scheduleWithout took it off (only where nothing else has been put since). */
export function scheduleWith(sch: Schedule, id: string, slots: RemovedRoutine['slots']): Schedule {
  const weekly = { ...sch.weekly };
  for (const wd of slots.weekdays) if (!weekly[wd]) weekly[wd] = id;
  const overrides = [...sch.overrides, ...slots.overrides.filter((o) => !sch.overrides.some((x) => x.date === o.date))];
  const { order: before, pointer, indexes } = slots.rotation;
  const untouched = sch.rotation.order.length === before.length - indexes.length && sch.rotation.order.every((x, i) => x === before.filter((_, j) => !indexes.includes(j))[i]);
  let rotation = sch.rotation;
  if (untouched) rotation = { ...sch.rotation, order: before, pointer };
  else if (indexes.length) {
    // put back at its old places; "next" stays on the same routine (shifted by what goes in before it)
    const order = [...sch.rotation.order];
    let pointer = order.length ? sch.rotation.pointer % order.length : 0;
    for (const i of indexes) { const at = Math.min(i, order.length); order.splice(at, 0, id); if (at <= pointer && order.length > 1) pointer++; }
    rotation = { ...sch.rotation, order, pointer };
  }
  return { ...sch, weekly, overrides, rotation };
}

const initial = loadPersisted();

export const useStore = create<Store>((set, get) => {
  const mutate = (fn: (s: Store) => Partial<Store>, immediate: boolean | 'active' = false) => {
    set((s) => fn(s));
    scheduleSave(immediate);
  };
  return {
    ...initial,

    updateSettings: (patch) => mutate((s) => withTarget(s, { settings: { ...s.settings, ...patch } })),

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
          sets = planSets(ex, sets, s.sessions, s.increments, s.settings.plateStep, s.settings.units.weight);
          return { id: uid('se'), exerciseId: it.exerciseId, restSec: it.restSec, supersetGroup: it.supersetGroup, note: it.note, sets };
        });
      } else if (fromSession) {
        // the same exercises and sets again, aiming at the routine's rep range (or 8–12) with this session's progression in them
        const routineOf = fromSession.routineId ? s.routines.find((r) => r.id === fromSession.routineId) : undefined;
        exercises = fromSession.exercises.map((e) => {
          const item = routineOf?.items.find((i) => i.exerciseId === e.exerciseId);
          const sets: SetRecord[] = e.sets.map((x) => ({ id: uid('s'), type: x.type, done: false, target: { repMin: item?.repMin ?? 8, repMax: item?.repMax ?? 12, weightKg: x.weightKg } }));
          return { id: uid('se'), exerciseId: e.exerciseId, restSec: e.restSec, supersetGroup: e.supersetGroup, note: e.note, sets: planSets(exMap.get(e.exerciseId), sets, s.sessions, s.increments, s.settings.plateStep, s.settings.units.weight) };
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
      mutate(() => ({ active: fn(a) }), 'active');
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
    finishActive: (note, endAt) => {
      const s = get();
      const a = s.active;
      // only warm-ups ticked is not a workout: nothing is saved (the screens offer Discard instead)
      if (!a || !a.exercises.some((e) => e.sets.some(countable))) return null;
      const now = endAt !== undefined ? Math.max(a.startedAt, Math.min(Date.now(), endAt)) : Date.now();
      const pausedMs = Math.min(a.pausedMs + (a.pausedAt ? Math.max(0, now - a.pausedAt) : 0), now - a.startedAt);
      // drop sets that were never completed and exercises left empty
      const exercises = a.exercises
        .map((e) => ({ ...e, plannedSets: e.sets.filter((x) => x.type === 'working').length, sets: e.sets.filter((x) => x.done) }))
        .filter((e) => e.sets.length > 0);
      const done: WorkoutSession = {
        ...a, exercises, status: 'done', endedAt: now, pausedMs, pausedAt: undefined, rest: null, note: note ?? a.note,
        name: a.name ?? '', // unnamed stays empty: shown as "Workout" in the app's language (workoutName)
      };
      const exMap = exerciseMap(s.exercises);
      done.records = detectRecords(done, s.sessions, (id) => exMap.get(id));
      const sessions = [...s.sessions, done].sort((x, y) => (x.endedAt ?? 0) - (y.endedAt ?? 0));
      const schedule = { ...s.schedule };
      // a rotation goes on from whatever was done: next is the routine after it
      if (schedule.mode === 'rotation' && a.routineId) schedule.rotation = rotationAfter(schedule.rotation, a.routineId);
      mutate(() => ({ sessions, active: null, schedule }), true);
      return done;
    },
    discardActive: () => {
      const a = get().active;
      if (a) mutate(() => ({ active: null }), true);
      return a;
    },
    restoreActive: (a) => { if (!get().active) mutate(() => ({ active: a }), true); },
    mutateSession: (id, fn) => mutate((s) => {
      const old = s.sessions.find((x) => x.id === id);
      if (!old) return {};
      const next = fn(old);
      const sessions = s.sessions.map((x) => (x.id === id ? next : x));
      // sets edited or deleted after the workout: its records (and later ones that measured against it) are found again
      return { sessions: next.exercises !== old.exercises ? refreshRecords(sessions, next, old, exerciseMap(s.exercises)) : sessions };
    }),
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
      const { schedule, slots } = scheduleWithout(get().schedule, id);
      mutate((s) => ({ routines: s.routines.filter((x) => x.id !== id), schedule }));
      return { routine: r, slots };
    },
    restoreRoutine: (r, slots) => mutate((s) => {
      if (s.routines.some((x) => x.id === r.id)) return {};
      return { routines: [...s.routines, r], ...(slots ? { schedule: scheduleWith(s.schedule, r.id, slots) } : {}) };
    }),
    setSchedule: (patch) => mutate((s) => ({ schedule: withWeeklySince(s.schedule, { ...s.schedule, ...patch }, dayOf(s.settings)) })),
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
    restoreMeasurement: (m) => mutate((s) => ({ measurements: s.measurements.some((x) => x.id === m.id) ? s.measurements : [...s.measurements, m] })),
    addPhoto: (p) => mutate((s) => ({ photos: [...s.photos, p] })),
    removePhoto: (id) => mutate((s) => ({ photos: s.photos.filter((p) => p.id !== id) })),
    mergeHealth: (next) => mutate(() => ({ activities: next.activities, steps: next.steps, ...(next.health ? { health: next.health } : {}) })),
    setCatchUps: (next) => mutate(() => ({ catchUps: next.slice(-30) })),
    addActivity: (a) => {
      const log: ActivityLog = { ...a, id: uid('ac'), at: Date.now() };
      mutate((s) => ({ activities: [...s.activities, log] }));
      return log;
    },
    removeActivity: (id) => {
      const a = get().activities.find((x) => x.id === id);
      if (a) mutate((s) => ({ activities: s.activities.filter((x) => x.id !== id), ...(a.hcId ? { hcGone: [...(s.hcGone ?? []), a.hcId].slice(-500) } : {}) }));
      return a;
    },
    restoreActivity: (a) => mutate((s) => ({ activities: s.activities.some((x) => x.id === a.id) ? s.activities : [...s.activities, a], ...(a.hcId ? { hcGone: (s.hcGone ?? []).filter((x) => x !== a.hcId) } : {}) })),
    setNote: (date, patch) => mutate((s) => {
      const cur = s.notes.find((n) => n.date === date);
      const next = { ...(cur ?? { date }), ...patch };
      return { notes: cur ? s.notes.map((n) => (n.date === date ? next : n)) : [...s.notes, next] };
    }),

    // ── what the Coach remembers (kept with your data, so it is in backups; "Delete everything" clears it)
    addMemory: (m) => {
      const note: MemoryNote = { ...m, id: uid('m'), at: Date.now() };
      mutate((s) => ({ memory: [...s.memory, note] }));
      return note;
    },
    updateMemory: (id, patch) => mutate((s) => ({ memory: s.memory.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
    removeMemory: (id) => {
      const m = get().memory.find((x) => x.id === id);
      if (m) mutate((s) => ({ memory: s.memory.filter((x) => x.id !== id) }));
      return m;
    },
    saveReview: (r) => mutate((s) => ({ reviews: [...(s.reviews ?? []).filter((x) => x.week !== r.week), r].sort((a, b) => a.week.localeCompare(b.week)).slice(-26) })),
    restoreMemory: (m) => mutate((s) => ({ memory: s.memory.some((x) => x.id === m.id) ? s.memory : [...s.memory, m].sort((a, b) => a.at - b.at) })),

    // ── data
    patch: (p) => mutate((s) => withTarget(s, (typeof p === 'function' ? p(s) : p) as Partial<Store>), true),
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


/** Weekly-plan workouts from the last `lookback` days that were neither done nor skipped/moved. */
export function missedWorkouts(d: Pick<AppData, 'schedule' | 'routines' | 'sessions'>, today: string, lookback = 6): { date: string; routineId: string }[] {
  if (d.schedule.mode !== 'weekly') return [];
  const out: { date: string; routineId: string }[] = [];
  for (let i = 1; i <= lookback; i++) {
    const date = addDays(today, -i);
    const p = plannedFor(d, date, today);
    if (!p) continue;
    const since = d.schedule.weeklySince?.[weekdayOf(date)];
    if (p.source === 'weekly' && since && date < since) continue; // planned only after that day

    const done = d.sessions.some((s) => s.plannedDate === date || (s.date === date && s.routineId === p.routineId));
    if (!done) out.push({ date, routineId: p.routineId });
  }
  return out;
}


export type { SetRecord, PersonalRecord, Nutrients };
export { entryFromSnapshot, requantify, snapshotOf };
