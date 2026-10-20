/**
 * The Coach as an assistant with hands. One message in ("log a banana", "bench 100 kilos for 8", "switch to light
 * mode", "how do I back up my data?") → a short reply plus the actions to carry out.
 *
 * Principles:
 *  - The model only ever proposes; THIS file decides what is allowed and does it. Every field is validated and clamped.
 *  - Everything it does on its own is reversible and comes back as a card with Undo. Things that cannot simply be
 *    undone (finishing a workout) wait for one tap. It can correct or remove a logged food (with Undo), nothing more
 *    destructive than that.
 *  - Logging uses the same food/exercise matching as the rest of the app, and says plainly what it matched.
 *  - Without a Gemini key (or when Gemini is down) simple commands still work through the local parsers.
 */
import { catchUpFloor, catchUpWords, dayKcal, isDecided, targetOn } from './eating';
import { clampVerdict, trimAllowed, trimLimits, type NoTrim } from './verdict';
import { useStore, foodPool, allExercises, plannedFor } from '../state/store';
import { useUI } from '../state/ui';
import { addDays, diffDays, fmtDate } from './dates';
import { noteEvent } from './ledger';
import { defaultMealId, mealName } from './derive';
import { coversQuery, fold, parseFoodText, pickOnline, resolveRows, rowQuantity, type ParsedFoodRow } from './foodText';
import { matchExercises, parseWorkoutText } from './workoutText';
import { calcRecipe, entryFromSnapshot, quickEntry, recipeToFood, scale, snapshotOf, toBase, uid } from './nutrition';
import { searchDanish, searchOnline } from './foodApi';
import { type Brain } from './gemini';
import { estimateFood } from './brain';
import { ACTIVITY_KINDS, ACTIVITY_LABEL } from './activity';
import { fmtNum, kgToDisplay } from './units';
import type { ActivityKind, CatchUp, Equipment, Exercise, Food, FoodEntry, Lang, LogType, Meal, MeasureKind, MemoryKind, MemoryNote, MuscleGroup, Quantity, Recipe, RecipeIngredient, RoutineItem, SessionExercise, SetRecord, Settings, WorkoutSession } from './types';
import { MEMORY_KINDS, MEMORY_MAX } from '../state/defaults';
import { addExercises, addSet, adjustRest, deleteSet, moveExercise, patchExercise, replaceExercise, skipRest, startRest, toggleSuperset } from '../screens/workout/actions';
import { completeSet } from '../screens/workout/complete';
import { currentSetOf } from './currentSet';
import { fixMisheard } from './setCommand';
import { EQUIP_LABEL, MUSCLE_LABEL } from '../screens/workout/common';
import { muscleOf } from './agentLookup';
import { detectRecords } from './workout';
import { buildDayPlan, pickForMuscles } from './planDay';
import { specOf } from './settingSpec';
import { weekdayOf } from './dates';
import { buildChart, CHART_METRICS, type ChartData, type ChartMetric } from './agentCharts';

// ── what the model may ask for ──────────────────────────────

export interface AgentFood { name: string; brand?: string | null; amount?: number | null; unit?: string | null; state?: string | null }
export interface AgentSet { kg?: number | null; reps?: number | null; durationSec?: number | null; distanceKm?: number | null }
export type AgentAction =
  | { type: 'log_food'; foods: AgentFood[]; meal?: string | null; day?: string | null }
  | { type: 'log_water'; ml: number; day?: string | null }
  | { type: 'log_quick'; totals: NutriFix; name?: string | null; meal?: string | null; day?: string | null }
  | { type: 'log_weight'; kg: number; day?: string | null }
  | { type: 'log_sets'; exercises: { exercise: string; sets: AgentSet[] }[]; day?: string | null; workout?: string | null; after?: string | null }
  | { type: 'log_activity'; kind: ActivityKind; minutes: number; rounds?: number; intensity?: 1 | 2 | 3; note?: string; day?: string | null }
  | { type: 'start_workout'; routine?: string | null }
  | { type: 'finish_workout' }
  | { type: 'navigate'; screen: 'today' | 'train' | 'food' | 'progress' | 'settings' | 'coach'; section?: string | null }
  | { type: 'set_setting'; key?: string; value?: string; pairs?: { key: string; value: string }[] }
  | { type: 'edit_food'; target: string; ref?: string | null; day?: string | null; meal_from?: string | null; amount?: number | null; unit?: string | null; meal?: string | null; per100?: NutriFix | null; totals?: NutriFix | null }
  | { type: 'delete_food'; target?: string | null; ref?: string | null; day?: string | null; meal?: string | null }
  | { type: 'move_food'; target?: string | null; ref?: string | null; meal_from?: string | null; day?: string | null; meal_to?: string | null; day_to?: string | null }
  | { type: 'copy_food'; target?: string | null; ref?: string | null; meal_from?: string | null; day?: string | null; meal_to?: string | null; day_to?: string | null }
  | { type: 'replace_food'; target: string; ref?: string | null; meal_from?: string | null; day?: string | null; with: AgentFood }
  | { type: 'create_food'; name: string; basis: 'g' | 'ml'; per100: NutriFix & { fibre?: number }; amount?: number | null; unit?: string | null; meal?: string | null; day?: string | null }
  | { type: 'favourite_food'; name: string; on: boolean }
  | { type: 'save_meal'; name: string; meal: string; day?: string | null }
  | { type: 'edit_set'; exercise: string; workout?: string | null; set_number?: number | null; kg?: number | null; reps?: number | null; remove?: boolean }
  | { type: 'add_exercise'; exercises: string[]; start?: boolean }
  | { type: 'catch_up'; on: boolean; over?: number | null; day?: string | null }
  | { type: 'remove_exercise'; exercise: string }
  | { type: 'replace_exercise'; from: string; to: string; routine?: string | null }
  | { type: 'create_routine'; name: string; items: RoutineBit[] }
  | { type: 'edit_routine'; routine: string; rename?: string | null; add?: RoutineBit[]; remove?: string[]; change?: RoutineBit[] }
  | { type: 'delete_routine'; routine: string }
  | { type: 'duplicate_routine'; routine: string; rename?: string | null }
  | { type: 'show_chart'; metric: ChartMetric; exercise?: string | null; weeks?: number | null }
  | { type: 'delete_workout'; workout?: string | null }
  | { type: 'discard_workout' }
  | { type: 'set_schedule'; weekday: number; routine: string | null }
  | { type: 'move_workout'; routine?: string | null; from_weekday?: number | null; to_weekday: number; once: boolean }
  | { type: 'plan_activity'; weekday: number; kind: ActivityKind; on: boolean }
  | { type: 'log_current_set'; kg?: number | null; reps?: number | null; which: 'current' | 'last'; durationSec?: number | null; same?: boolean; warmup?: boolean; skip?: boolean }
  | { type: 'delete_activity'; kind?: string | null; day?: string | null }
  | { type: 'delete_weight'; day?: string | null }
  | { type: 'add_note'; text: string; kind: 'training' | 'nutrition'; day?: string | null }
  | { type: 'remember'; text: string; kind: MemoryKind; exercise?: string | null; /** the MEMORY number this replaces */ replaces?: number | null; /** last day it applies */ until?: string | null }
  | { type: 'forget'; memory?: number | null; target?: string | null }
  | { type: 'show_exercise'; exercise: string }
  | { type: 'propose_recipe'; name: string; servings: number; foods: AgentFood[]; steps: string[] }
  | { type: 'suggest_food'; options: { label: string; foods: AgentFood[]; totals: NutriFix | null }[]; meal?: string | null }
  | { type: 'plan_day'; day: string; name?: string | null; focus: string[]; light: string[]; items: RoutineBit[] }
  | { type: 'edit_meals'; meal?: string | null; rename?: string | null; add?: string | null; remove?: string[]; order?: string[] }
  | { type: 'log_saved_meal'; name: string; meal?: string | null; day?: string | null }
  | { type: 'delete_water'; day?: string | null; ml?: number | null }
  | { type: 'create_exercise'; name: string; muscles: MuscleGroup[]; equipment: Equipment; logType: LogType }
  | { type: 'archive_exercise'; exercise: string; on: boolean }
  | { type: 'set_increment'; exercise: string; kg: number | null }
  | { type: 'log_measurement'; kind: MeasureKind; cm: number; day?: string | null }
  | { type: 'delete_measurement'; kind?: MeasureKind | null; day?: string | null }
  | { type: 'workout_control'; op: WorkoutOp; exercise?: string | null; seconds?: number | null; text?: string | null }
  | { type: 'set_split'; days: { weekday: number; /** undefined = leave the gym day as it is, null = rest day */ routine?: string | null; wrestling: boolean | null }[] }
  | { type: 'skip_day'; day: string }
  | { type: 'undo_last' };

/** what a split day says when it becomes a rest day (null / missing = leave the gym day as it is) */
const REST_WORDS = /^\s*(rest|rest day|none|off|hvile|hviledag|fri)\s*$/i;
export const WORKOUT_OPS = ['pause', 'resume', 'rest_start', 'rest_skip', 'rest_add', 'rest_set', 'superset', 'move_up', 'move_down', 'note', 'rename'] as const;
export type WorkoutOp = (typeof WORKOUT_OPS)[number];
const MEASURE_KINDS: MeasureKind[] = ['waist', 'chest', 'hips', 'arm', 'thigh', 'neck'];
const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'machine', 'smith', 'cable', 'bodyweight', 'kettlebell', 'band', 'bench', 'other'];
const LOG_TYPES: LogType[] = ['weightReps', 'bodyweightReps', 'assisted', 'duration', 'distance'];

export interface RoutineBit { exercise: string; sets?: number | null; repMin?: number | null; repMax?: number | null; restSec?: number | null; warmup?: number | null }
/** "today" | "yesterday" | YYYY-MM-DD, anything else is "not said". */
const dayArg = (v: unknown): string | null => (v === 'yesterday' ? 'yesterday' : v === 'today' ? 'today' : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const resolveDay = (d: string | null | undefined, today: string): string | undefined => (d === 'yesterday' ? addDays(today, -1) : d === 'today' ? today : d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
const routineBit = (b: any): RoutineBit | null => { const exercise = str(b?.exercise, 60); return exercise ? { exercise, sets: num(b?.sets, 1, 10) ?? null, repMin: num(b?.repMin, 1, 100) ?? null, repMax: num(b?.repMax, 1, 100) ?? null, restSec: num(b?.restSec, 15, 600) ?? null, warmup: num(b?.warmup, 0, 5) ?? null } : null; };
const bits = (v: unknown, n = 12): RoutineBit[] => (Array.isArray(v) ? v : []).slice(0, n).map(routineBit).filter(Boolean) as RoutineBit[];

/** Corrected nutrition values: per 100 g/ml (a food's label) or the entry's own totals (a quick entry). */
export type NutriFix = Partial<Record<'kcal' | 'protein' | 'carbs' | 'fat', number>>;
const nutriFix = (v: any, per100: boolean): NutriFix | null => {
  if (!v || typeof v !== 'object') return null;
  const lim = per100 ? { kcal: 900, protein: 100, carbs: 100, fat: 100 } : { kcal: 6000, protein: 500, carbs: 1000, fat: 500 };
  const o: NutriFix = {};
  for (const k of ['kcal', 'protein', 'carbs', 'fat'] as const) { const n = num(v[k], 0, lim[k]); if (n !== undefined) o[k] = Math.round(n * 10) / 10; }
  return Object.keys(o).length ? o : null;
};

export { SETTING_KEYS } from './settingSpec';
export const SETTINGS_SECTIONS = ['today', 'targets', 'training', 'food', 'units', 'look', 'reminders', 'data', 'privacy', 'ai', 'memory', 'about'];

/** An item's id as a card showed it ("e_k3x9…"): letters, digits, _ and - only. */
const refArg = (v: unknown): string | null => (typeof v === 'string' && /^[\w-]{3,40}$/.test(v.trim()) ? v.trim() : null);
const num = (v: unknown, min: number, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined);
const str = (v: unknown, max = 80): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/**
 * The foods the model named. Forgiving about the shape (read-side only): a plain string ("30 g whey protein", "2 eggs") is
 * read by the app's own food parser, and `ingredient` / `item` / `food` count as the name, `quantity` / `qty` as the amount.
 */
const agentFoods = (v: unknown, n: number): AgentFood[] => (Array.isArray(v) ? v : []).slice(0, n).map((f: any): AgentFood | null => {
  if (typeof f === 'string') {
    const row = parseFoodText(f)[0];
    const name = str(row?.query ?? f, 60); if (!name) return null;
    const unit = row?.dim === 'g' ? 'g' : row?.dim === 'ml' ? 'ml' : row?.amount !== undefined ? 'piece' : null;
    return { name, brand: null, amount: num(row?.amount, 0.01, 20000) ?? null, unit, state: null };
  }
  const name = str(f?.name ?? f?.ingredient ?? f?.item ?? f?.food, 60); if (!name) return null;
  const amount = f?.amount ?? f?.quantity ?? f?.qty;
  const n2 = typeof amount === 'string' ? Number(amount.replace(',', '.')) : amount;
  return { name, brand: str(f?.brand, 40) ?? null, amount: num(n2, 0.01, 20000) ?? null, unit: str(f?.unit, 12) ?? null, state: ['raw', 'cooked', 'dry'].includes(f?.state) ? f.state : null };
}).filter(Boolean) as AgentFood[];

/** Something in the answer couldn't be read (it was dropped): said in a card, never silent. */
export const droppedCard = (t: AgentCtx['t']): AgentResult => ({ id: uid('r'), kind: 'miss', title: t('Part of the answer couldn’t be read'), lines: [{ text: t('Nothing was changed for it. Ask again — or copy the raw answer in Settings → About.') }] });

/** Whatever came back from the model → a safe list of actions (anything odd is dropped, numbers are clamped). */
export function validateAgent(raw: any): { reply: string; actions: AgentAction[]; /** actions it had to drop (unreadable): said, never silent */ dropped: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const reply = str(raw.reply, 4000) ?? '';
  const out: AgentAction[] = [];
  let dropped = 0;
  for (const a of (Array.isArray(raw.actions) ? raw.actions : []).slice(0, 12)) {
    if (!a || typeof a !== 'object') { dropped++; continue; }
    const before = out.length;
    validateOne(a, out);
    if (out.length === before) dropped++;
  }
  if (!reply && !out.length && !dropped) return null;
  return { reply, actions: out, dropped };
}

function validateOne(a: any, out: AgentAction[]) {
    switch (a.type) {
      case 'log_food': {
        const foods = agentFoods(a.foods, 14);
        if (foods.length) out.push({ type: 'log_food', foods, meal: str(a.meal, 30) ?? null, day: dayArg(a.day) });
        break;
      }
      case 'propose_recipe': {
        // (forgiving: ingredients / items for the foods, method / instructions for the steps, a step list as one text)
        const name = str(a.name ?? a.title, 60), foods = agentFoods(a.foods ?? a.ingredients ?? a.items, 15);
        const rawSteps = a.steps ?? a.method ?? a.instructions;
        const steps = (Array.isArray(rawSteps) ? rawSteps : typeof rawSteps === 'string' ? rawSteps.split(/\n+|(?<=\.)\s+(?=\d+[.)]\s)/) : []).map((x: unknown) => str(typeof x === 'string' ? x.replace(/^\s*\d+[.)]\s*/, '') : x, 220)).filter(Boolean).slice(0, 12) as string[];
        const servings = typeof a.servings === 'string' ? Number(a.servings) : a.servings;
        if (name && foods.length) out.push({ type: 'propose_recipe', name, servings: Math.round(num(servings, 1, 20) ?? 1), foods, steps });
        break;
      }
      case 'suggest_food': {
        const options = (Array.isArray(a.options) ? a.options : []).slice(0, 3).map((o: any) => {
          const label = str(o?.label, 60), foods = agentFoods(o?.foods, 6);
          return label && foods.length ? { label, foods, totals: nutriFix(o?.totals, false) } : null;
        }).filter(Boolean) as { label: string; foods: AgentFood[]; totals: NutriFix | null }[];
        if (options.length) out.push({ type: 'suggest_food', options, meal: str(a.meal, 30) ?? null });
        break;
      }
      case 'log_quick': { const totals = nutriFix(a.totals ?? { kcal: a.kcal, protein: a.protein, carbs: a.carbs, fat: a.fat }, false); if (totals?.kcal !== undefined || totals?.protein !== undefined) out.push({ type: 'log_quick', totals: totals!, name: str(a.name, 60) ?? null, meal: str(a.meal, 30) ?? null, day: dayArg(a.day) }); break; }
      case 'log_water': { const ml = num(a.ml, 10, 5000); if (ml) out.push({ type: 'log_water', ml: Math.round(ml), day: dayArg(a.day) }); break; }
      case 'log_weight': { const kg = num(a.kg, 25, 400); if (kg) out.push({ type: 'log_weight', kg: Math.round(kg * 10) / 10, day: dayArg(a.day) }); break; }
      case 'log_sets': {
        const exercises = (Array.isArray(a.exercises) ? a.exercises : []).slice(0, 8).map((e: any) => {
          const exercise = str(e?.exercise, 60); if (!exercise) return null;
          const sets = (Array.isArray(e?.sets) ? e.sets : []).slice(0, 15).map((s: any): AgentSet => ({
            kg: num(s?.kg, 0, 1000) ?? null, reps: num(s?.reps, 1, 500) ?? null, durationSec: num(s?.durationSec, 1, 36000) ?? null, distanceKm: num(s?.distanceKm, 0.01, 500) ?? null,
          })).filter((s: AgentSet) => s.reps || s.durationSec || s.distanceKm || s.kg);
          return sets.length ? { exercise, sets } : null;
        }).filter(Boolean) as { exercise: string; sets: AgentSet[] }[];
        if (exercises.length) out.push({ type: 'log_sets', exercises, day: dayArg(a.day), ...(str(a.workout, 60) ? { workout: str(a.workout, 60) } : {}), ...(str(a.after, 60) ? { after: str(a.after, 60) } : {}) });
        break;
      }
      case 'log_activity': {
        const kind = ACTIVITY_KINDS.includes(a.kind) ? (a.kind as ActivityKind) : (ACTIVITY_KINDS.find((k) => fold(String(a.kind ?? '')).includes(k)) ?? 'other');
        // rounds without minutes ("5 rounds of wrestling"): about 3 minutes a round (said on the card)
        const rounds = num(a.rounds, 1, 99);
        const minutes = num(a.minutes, 1, 600) ?? (rounds ? rounds * 3 : undefined); if (!minutes) break;
        out.push({ type: 'log_activity', kind, minutes: Math.round(minutes), rounds: num(a.rounds, 1, 99), intensity: [1, 2, 3].includes(a.intensity) ? a.intensity : undefined, note: str(a.note, 200), day: dayArg(a.day) });
        break;
      }
      case 'start_workout': out.push({ type: 'start_workout', routine: str(a.routine, 60) ?? null }); break;
      case 'finish_workout': out.push({ type: 'finish_workout' }); break;
      case 'undo_last': out.push({ type: 'undo_last' }); break;
      case 'edit_food': {
        const ref = refArg(a.ref), target = str(a.target, 60) ?? ''; if (!target && !ref) break;
        const e: AgentAction = { type: 'edit_food', target, ref, day: dayArg(a.day), meal_from: str(a.meal_from, 30) ?? null, amount: num(a.amount, 0.01, 20000) ?? null, unit: str(a.unit, 12) ?? null, meal: str(a.meal, 30) ?? null, per100: nutriFix(a.per100, true), totals: nutriFix(a.totals, false) };
        if (e.amount || e.meal || e.per100 || e.totals) out.push(e);
        break;
      }
      case 'delete_food': { const target = str(a.target, 60) ?? null, meal = str(a.meal, 30) ?? null, ref = refArg(a.ref); if (target || meal || ref) out.push({ type: 'delete_food', target, ref, meal, day: dayArg(a.day) }); break; }
      case 'move_food': case 'copy_food': {
        const target = str(a.target, 60) ?? null, ref = refArg(a.ref), meal_from = str(a.meal_from, 30) ?? null, meal_to = str(a.meal_to, 30) ?? null, day_to = dayArg(a.day_to);
        if ((target || ref || meal_from) && (meal_to || day_to)) out.push({ type: a.type, target, ref, meal_from, day: dayArg(a.day), meal_to, day_to });
        break;
      }
      case 'replace_food': {
        const ref = refArg(a.ref), target = str(a.target, 60) ?? '', w = a.with, name = str(w?.name, 60); if ((!target && !ref) || !name) break;
        out.push({ type: 'replace_food', target, ref, meal_from: str(a.meal_from, 30) ?? null, day: dayArg(a.day), with: { name, brand: str(w?.brand, 40) ?? null, amount: num(w?.amount, 0.01, 20000) ?? null, unit: str(w?.unit, 12) ?? null, state: ['raw', 'cooked', 'dry'].includes(w?.state) ? w.state : null } });
        break;
      }
      case 'create_food': {
        const name = str(a.name, 60), per100 = nutriFix(a.per100, true); if (!name || !per100 || per100.kcal === undefined) break;
        const fibre = num(a.per100?.fibre, 0, 100);
        out.push({ type: 'create_food', name, basis: a.basis === 'ml' ? 'ml' : 'g', per100: { ...per100, ...(fibre !== undefined ? { fibre } : {}) }, amount: num(a.amount, 0.01, 20000) ?? null, unit: str(a.unit, 12) ?? null, meal: str(a.meal, 30) ?? null, day: dayArg(a.day) });
        break;
      }
      case 'favourite_food': { const name = str(a.name, 60); if (name) out.push({ type: 'favourite_food', name, on: a.on !== false }); break; }
      case 'save_meal': { const name = str(a.name, 40), meal = str(a.meal, 30); if (name && meal) out.push({ type: 'save_meal', name, meal, day: dayArg(a.day) }); break; }
      case 'edit_set': {
        const exercise = str(a.exercise, 60); if (!exercise) break;
        const kg = num(a.kg, 0, 1000), reps = num(a.reps, 1, 500), n = num(a.set_number, 1, 50);
        if (kg === undefined && reps === undefined && a.delete_set !== true) break;
        out.push({ type: 'edit_set', exercise, workout: str(a.workout, 12) ?? null, set_number: n ? Math.round(n) : null, kg: kg ?? null, reps: reps ? Math.round(reps) : null, remove: a.delete_set === true });
        break;
      }
      // (on must be said: a missing or null `on` is not a request to cut)
      case 'catch_up': { const over = num(a.kcal ?? a.over, 100, 10000); if (a.on === true || a.on === false) out.push({ type: 'catch_up', on: a.on, over: over ? Math.round(over) : null, day: dayArg(a.day) }); break; }
      case 'add_exercise': { const exercises = (Array.isArray(a.exercises) ? a.exercises : []).slice(0, 8).map((x: any) => str(x, 60)).filter(Boolean) as string[]; if (exercises.length) out.push({ type: 'add_exercise', exercises, ...(a.start === true ? { start: true } : {}) }); break; }
      case 'remove_exercise': { const exercise = str(a.exercise, 60); if (exercise) out.push({ type: 'remove_exercise', exercise }); break; }
      case 'replace_exercise': { const from = str(a.from, 60), to = str(a.to, 60); if (from && to) out.push({ type: 'replace_exercise', from, to, routine: str(a.routine, 60) ?? null }); break; }
      case 'create_routine': { const name = str(a.name, 60), items = bits(a.add); if (name && items.length) out.push({ type: 'create_routine', name, items }); break; }
      case 'edit_routine': {
        const routine = str(a.routine, 60); if (!routine) break;
        const rename = str(a.rename, 60) ?? null, add = bits(a.add), change = bits(a.change), remove = (Array.isArray(a.remove) ? a.remove : []).slice(0, 12).map((x: any) => str(x, 60)).filter(Boolean) as string[];
        if (rename || add.length || change.length || remove.length) out.push({ type: 'edit_routine', routine, rename, add, change, remove });
        break;
      }
      case 'delete_routine': { const routine = str(a.routine, 60); if (routine) out.push({ type: 'delete_routine', routine }); break; }
      case 'duplicate_routine': { const routine = str(a.routine, 60); if (routine) out.push({ type: 'duplicate_routine', routine, rename: str(a.rename, 60) ?? null }); break; }
      case 'show_chart': { if (CHART_METRICS.includes(a.metric)) out.push({ type: 'show_chart', metric: a.metric, exercise: str(a.exercise, 60) ?? null, weeks: num(a.weeks, 1, 104) ?? null }); break; }
      case 'delete_workout': out.push({ type: 'delete_workout', workout: str(a.workout, 30) ?? null }); break;
      case 'discard_workout': out.push({ type: 'discard_workout' }); break;
      case 'set_schedule': { const wd = num(a.weekday, 0, 6); if (wd !== undefined) out.push({ type: 'set_schedule', weekday: Math.round(wd), routine: str(a.routine, 60) ?? null }); break; }
      case 'move_workout': {
        const to = num(a.weekday, 0, 6); if (to === undefined) break;
        const from = num(a.from_weekday, 0, 6);
        out.push({ type: 'move_workout', routine: str(a.routine, 60) ?? null, from_weekday: from !== undefined ? Math.round(from) : null, to_weekday: Math.round(to), once: a.once === true });
        break;
      }
      case 'plan_activity': {
        const wd = num(a.weekday, 0, 6); if (wd === undefined) break;
        const kind = ACTIVITY_KINDS.includes(a.kind) ? a.kind : 'wrestling';
        out.push({ type: 'plan_activity', weekday: Math.round(wd), kind, on: a.on !== false });
        break;
      }
      case 'log_current_set': {
        const kg = num(a.kg, 0, 600), reps = num(a.reps, 0, 200);
        const sec = num(a.seconds ?? a.durationSec, 1, 36000);
        out.push({ type: 'log_current_set', kg: kg ?? null, reps: reps !== undefined ? Math.round(reps) : null, which: a.which === 'last' ? 'last' : 'current', ...(sec ? { durationSec: Math.round(sec) } : {}), ...(a.same === true ? { same: true } : {}), ...(a.warmup === true ? { warmup: true } : {}), ...(a.skip === true ? { skip: true } : {}) });
        break;
      }
      case 'delete_activity': out.push({ type: 'delete_activity', kind: str(a.kind, 20) ?? null, day: dayArg(a.day) }); break;
      case 'delete_weight': out.push({ type: 'delete_weight', day: dayArg(a.day) }); break;
      case 'add_note': { const text = str(a.text, 400); if (text) out.push({ type: 'add_note', text, kind: a.kind === 'nutrition' ? 'nutrition' : 'training', day: dayArg(a.day) }); break; }
      case 'remember': {
        const text = str(a.text, 200);
        const n = typeof a.memory === 'number' ? a.memory : typeof a.memory === 'string' && /^\d{1,3}$/.test(a.memory.trim()) ? Number(a.memory.trim()) : null;
        const until = typeof a.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.until.trim()) ? a.until.trim() : null;
        if (text) out.push({ type: 'remember', text, kind: MEMORY_KINDS.includes(a.kind) ? a.kind : 'other', exercise: str(a.exercise, 60) ?? null, replaces: n, until });
        break;
      }
      case 'show_exercise': { const exercise = str(a.exercise, 60); if (exercise) out.push({ type: 'show_exercise', exercise }); break; }
      case 'forget': {
        const n = typeof a.memory === 'number' ? a.memory : typeof a.memory === 'string' && /^\d{1,3}$/.test(a.memory.trim()) ? Number(a.memory.trim()) : undefined;
        const target = str(a.target, 120) ?? str(a.text, 120) ?? null;
        if (n || target) out.push({ type: 'forget', memory: n ?? null, target });
        break;
      }
      case 'edit_meals': {
        const words = (v: unknown) => (Array.isArray(v) ? v : []).slice(0, 8).map((x: any) => str(x, 30)).filter(Boolean) as string[];
        const e = { type: 'edit_meals' as const, meal: str(a.meal, 30) ?? null, rename: str(a.rename, 30) ?? null, add: str(a.name, 30) ?? null, remove: words(a.remove), order: words(a.order) };
        if ((e.meal && e.rename) || e.add || e.remove.length || e.order.length) out.push(e);
        break;
      }
      case 'log_saved_meal': { const name = str(a.name, 40); if (name) out.push({ type: 'log_saved_meal', name, meal: str(a.meal, 30) ?? null, day: dayArg(a.day) }); break; }
      case 'delete_water': out.push({ type: 'delete_water', day: dayArg(a.day), ml: num(a.ml, 10, 5000) ?? null }); break;
      case 'create_exercise': {
        const name = str(a.name, 50);
        const muscles = [...new Set((Array.isArray(a.focus) ? a.focus : []).map((m: any) => muscleOf(String(m ?? ''))).filter(Boolean))].slice(0, 3) as MuscleGroup[];
        const equipment = EQUIPMENT.find((x) => x === fold(String(a.equipment ?? ''))) ?? 'other';
        const logType = LOG_TYPES.find((x) => x === a.log_type) ?? 'weightReps';
        if (name && muscles.length) out.push({ type: 'create_exercise', name, muscles, equipment, logType });
        break;
      }
      case 'archive_exercise': { const exercise = str(a.exercise, 60); if (exercise) out.push({ type: 'archive_exercise', exercise, on: a.on !== false }); break; }
      case 'set_increment': { const exercise = str(a.exercise, 60); if (exercise) out.push({ type: 'set_increment', exercise, kg: num(a.kg, 0.25, 20) ?? null }); break; }
      case 'log_measurement': { const kind = MEASURE_KINDS.find((k) => k === fold(String(a.kind ?? ''))); const cm = num(a.cm, 10, 250); if (kind && cm) out.push({ type: 'log_measurement', kind, cm: Math.round(cm * 10) / 10, day: dayArg(a.day) }); break; }
      case 'delete_measurement': out.push({ type: 'delete_measurement', kind: MEASURE_KINDS.find((k) => k === fold(String(a.kind ?? ''))) ?? null, day: dayArg(a.day) }); break;
      case 'workout_control': {
        const op = WORKOUT_OPS.find((x) => x === a.op);
        if (op) out.push({ type: 'workout_control', op, exercise: str(a.exercise, 60) ?? null, seconds: num(a.seconds, -600, 600) ?? null, text: str(a.text, 200) ?? null });
        break;
      }
      case 'set_split': {
        const days = (Array.isArray(a.days) ? a.days : []).slice(0, 7).map((x: any) => { const wd = num(x?.weekday, 0, 6); return wd === undefined ? null : { weekday: Math.round(wd), routine: REST_WORDS.test(String(x?.routine ?? '')) ? null : str(x?.routine, 60) ?? undefined, wrestling: typeof x?.wrestling === 'boolean' ? x.wrestling : null }; }).filter(Boolean) as { weekday: number; routine?: string | null; wrestling: boolean | null }[];
        if (days.length) out.push({ type: 'set_split', days: [...new Map(days.map((d) => [d.weekday, d])).values()] });
        break;
      }
      case 'skip_day': { const day = a.day === 'tomorrow' ? 'tomorrow' : dayArg(a.day) ?? 'today'; out.push({ type: 'skip_day', day }); break; }
      case 'plan_day': {
        const day = a.day === 'tomorrow' ? 'tomorrow' : dayArg(a.day);
        const words = (v: unknown) => (Array.isArray(v) ? v : []).slice(0, 6).map((x: any) => str(x, 20)).filter(Boolean) as string[];
        const items = bits(a.add, 10), focus = words(a.focus), light = words(a.light);
        if (day && (items.length || focus.length)) out.push({ type: 'plan_day', day, name: str(a.name, 50) ?? null, focus, light, items });
        break;
      }
      case 'navigate': {
        const screen = ['today', 'train', 'food', 'progress', 'settings', 'coach'].includes(a.screen) ? a.screen : null; if (!screen) break;
        out.push({ type: 'navigate', screen, section: SETTINGS_SECTIONS.includes(a.section) ? a.section : null });
        break;
      }
      case 'set_setting': {
        // one setting (key, value) or several at once (settings: [{ key, value }]): all checked against the table, undone together
        const pairs = [...(a.key ? [{ key: a.key, value: a.value }] : []), ...(Array.isArray(a.settings) ? a.settings : [])].slice(0, 12)
          .map((x: any) => ({ key: str(x?.key, 30), value: typeof x?.value === 'number' || typeof x?.value === 'boolean' ? String(x.value) : str(x?.value, 80) }))
          .filter((x): x is { key: string; value: string } => !!x.key && x.value !== undefined && !!specOf(x.key));
        if (pairs.length) out.push({ type: 'set_setting', pairs });
        break;
      }
    }
}

// ── results: what the Coach shows after acting ─────────────

export interface AgentResult {
  id: string;
  kind: 'food' | 'recipe' | 'sets' | 'water' | 'weight' | 'activity' | 'workout' | 'routine' | 'nav' | 'setting' | 'memory' | 'chart' | 'miss';
  /** a recipe's method, shown under its ingredients (folded away until opened) */
  steps?: string[];
  title: string;
  lines: { text: string; sub?: string; warn?: boolean; /** the item's id (a food entry), so "move it" later means exactly this one */ ref?: string; /** a change in a preview that can be left out (a tick beside it) */ pick?: boolean }[];
  /** the preview's changes left out (indices into lines; the card's ticks write it, Apply reads it) */
  off?: number[];
  /** a small chart (show_chart): plain numbers, so it is still there when the chat is opened again */
  chart?: ChartData;
  /** reverses everything this card did */
  undo?: () => void;
  /** a button on the card (open the workout, or confirm something that waits for a tap) */
  button?: { label: string; run: () => void };
  /** quieter buttons beside it (an exercise card: Add to workout) */
  /** `warn`: the button answers the card's warning line ("Use 18 kg"): a soft amber chip, not a plain one */
  more?: { label: string; run: () => void; warn?: boolean }[];
  /** "Which one?": options, one tap each (it then counts as applied: the chosen run fills in the card's lines and Undo) */
  choose?: { label: string; sub?: string; run: () => void }[];
  /** a quiet line under the title ("≈ 280 kcal · 34 g protein") */
  subtitle?: string;
  /** an offer, not a question: it keeps its own icon while it waits for the tap */
  offer?: boolean;
  /** the card is a question: nothing happened yet */
  pending?: boolean;
  /** a preview of one thing ("plan:2026-10-16", "split"): a newer preview with the same key replaces it (no applying both) */
  key?: string;
  /** a memory reworded: what it said before (shown struck through above the new wording) */
  was?: string;
  /** the title once a preview is applied, when "Done" would lose what it was (a recipe's, a routine's name) */
  doneTitle?: string;
  /** the subtitle once a preview is applied ("2 days changed") */
  doneSubtitle?: string;
  /** a week shown as seven days (a split preview), Monday first: routine initials and wrestling */
  week?: { label: string; routine: string | null; wrestling: boolean; changed: boolean }[];
}

export interface AgentCtx {
  t: (k: string, v?: Record<string, string | number>) => string;
  lang: 'en' | 'da';
  today: string;
  /** the AI (GPT-6.1 Sol and/or Gemini), for estimating a food that is in no database (optional) */
  brain: Brain | null;
  /** where the user opened the Coach from (the Food tab's day / a meal's + button): the default for foods */
  date?: string; mealId?: string;
  /** the message came with a photo: amounts read off a plate are estimates */
  photo?: boolean;
  /** a few words while it works ("Looking up 3 foods…"); '' when done */
  onStatus?: (s: string) => void;
  /** the memory list as the model saw it (numbered), so "forget 2" means the same note even after another forget */
  memAtStart?: MemoryNote[];
}

const MEAL_WORDS: Record<string, string> = { breakfast: 'breakfast', morgenmad: 'breakfast', lunch: 'lunch', frokost: 'lunch', dinner: 'dinner', aftensmad: 'dinner', supper: 'dinner', snack: 'snacks', snacks: 'snacks', mellemmaaltid: 'snacks' };
function resolveMeal(word: string | null | undefined, meals: Meal[], lang: 'en' | 'da'): string | undefined {
  if (!word) return undefined;
  const w = fold(word);
  const byName = meals.find((m) => fold(m.id) === w || fold(m.name || '') === w || fold(mealName(m, lang)) === w);
  if (byName) return byName.id;
  const id = MEAL_WORDS[w] ?? MEAL_WORDS[w.replace(/s$/, '')];
  return id && meals.some((m) => m.id === id) ? id : undefined;
}

const VOLUME_ML: Record<string, number> = { ml: 1, cl: 10, dl: 100, l: 1000, tsp: 5, tbsp: 15, cup: 240, glass: 200 };
/**
 * One thing the model heard, as a row the app's food matcher understands. The amount and unit go through the parser; the
 * NAME never does: the dictation splitter cuts at commas and "and"/"og", and a clean name like "Rice, white, raw (dry)"
 * came out as just "rice" (and the cooked one was logged).
 */
function foodRow(f: AgentFood, i: number): ParsedFoodRow {
  const name = (f.brand ? `${f.brand} ${f.name}` : f.name).trim();
  const unit = (f.unit || '').toLowerCase();
  const amount = f.amount ?? undefined;
  let qty = '';
  if (amount !== undefined) {
    if (unit === 'kg') qty = `${amount * 1000} g`;
    else if (unit === 'g') qty = `${amount} g`;
    else if (VOLUME_ML[unit]) qty = `${amount * VOLUME_ML[unit]} ml`;
    else qty = `${amount}${unit && unit !== 'piece' && unit !== 'serving' ? ` ${unit}` : ''}`;
  }
  // the quantity alone, parsed with a stand-in name ("200 g x", "2 slice x")
  const q = qty ? parseFoodText(`${qty} x`)[0] : undefined;
  const query = f.state ? `${name} ${f.state}` : name;
  return { id: `a${i}`, raw: name, query, dim: q?.dim ?? 'count', countWord: q?.countWord, amount: q?.amount };
}

const kcalOf = (e: FoodEntry) => (typeof e.nutrients.kcal === 'number' ? Math.round(e.nutrients.kcal) : undefined);

/**
 * The food a heard row means: a clear match in the bundled and own foods (or the best one when it is clearly ahead), else
 * — unless lookups are off — the Danish products and the online databases (bounded). Never an AI estimate: logging adds
 * that itself, clearly labelled; a recipe flags the miss instead.
 */
async function findFood(r: ReturnType<typeof resolveRows>[number], lookup: boolean, signal?: AbortSignal): Promise<{ food?: Food; online?: Food; closest?: boolean; unreachable?: boolean }> {
  let food: Food | undefined = r.status === 'resolved' ? r.candidates.find((c) => c.food.id === r.choiceId)?.food : undefined;
  if (!food && r.status === 'ambiguous' && r.candidates[0] && r.candidates[0].score >= 0.5) food = r.candidates[0].food;
  // a sure local match (every word you said is in it) is used at once, and offline
  if (food && !r.partial) return { food };
  if (!lookup) return food ? { food, closest: true } : {};
  // a specific name the local list only half knows ("power potatoes" → Potato), or nothing local: the Danish products, then
  // the online databases; a hit that has every word wins, else the closest local food (said so on the card)
  const timeout = (ms: number) => new Promise<'timeout'>((ok) => setTimeout(() => ok('timeout'), ms));
  let unreachable = false;
  const dk = await Promise.race([searchDanish(r.query), timeout(4000)]).catch(() => 'timeout' as const);
  let hit = dk === 'timeout' ? undefined : pickOnline(r.query, dk);
  if (dk === 'timeout') unreachable = true;
  if (!hit || !coversQuery(hit, r.query)) {
    const on = signal?.aborted ? 'timeout' : await Promise.race([searchOnline(r.query, signal), timeout(5000)]).catch(() => 'timeout' as const);
    if (on === 'timeout' || on.status !== 'ok') unreachable = true;
    const h2 = on !== 'timeout' && on.status === 'ok' ? pickOnline(r.query, on.foods) : undefined;
    if (h2 && (!hit || coversQuery(h2, r.query))) hit = h2;
  }
  if (hit && (coversQuery(hit, r.query) || !food)) return { food: hit, online: hit, closest: !coversQuery(hit, r.query) };
  return food ? { food, closest: true } : { unreachable };
}

/**
 * How sure a food is for this user: their own foods, and the ones they log most, come first (the 90-day count), so a saved
 * "Power Potatoes" beats the generic potato and their usual milk wins without asking.
 */
function foodBoost(st: ReturnType<typeof useStore.getState>): (f: Food) => number {
  const own = new Set(st.foods.map((f) => f.id));
  const fav = new Set(st.favourites);
  const since = Date.now() - 90 * 86_400_000;
  const n = new Map<string, number>();
  for (const e of st.entries) if (!e.quick && e.at >= since && e.snap.foodId) n.set(e.snap.foodId, (n.get(e.snap.foodId) ?? 0) + 1);
  return (f) => (own.has(f.id) ? 0.08 : 0) + (fav.has(f.id) ? 0.05 : 0) + Math.min(0.1, (n.get(f.id) ?? 0) * 0.03);
}

/** The last amount this food was logged with (their usual), for "log my Power Potatoes" with no amount. */
function usualQty(st: ReturnType<typeof useStore.getState>, food: Food): Quantity | null {
  const last = [...st.entries].reverse().find((e) => !e.quick && e.snap.foodId === food.id);
  return last ? { ...last.qty } : null;
}

const lineLabel = (food: Food, qty: Quantity, ctx: AgentCtx) => qty.unit === 'portion'
  ? `${fmtNum(qty.amount, ctx.lang, 1)} × ${food.portions.find((p) => p.id === qty.portionId)?.label.replace(/^1\s+/, '') ?? ctx.t('serving')}`
  : `${fmtNum(qty.amount, ctx.lang, 0)} ${qty.unit}`;
const foodLabel = (food: Food, lang: Lang) => (lang === 'da' && food.nameDa ? food.nameDa : food.name);

async function doLogFood(a: Extract<AgentAction, { type: 'log_food' }>, ctx: AgentCtx): Promise<AgentResult[]> {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const pool = foodPool(st.foods, st.recipes);
  const date = resolveDay(a.day, ctx.today) ?? ctx.date ?? ctx.today;
  const mealId = resolveMeal(a.meal, st.settings.meals, lang) ?? (ctx.mealId && st.settings.meals.some((m) => m.id === ctx.mealId) ? ctx.mealId : defaultMealId(st.settings.meals, new Date(), st.settings.dayStartHour));
  const meal = st.settings.meals.find((m) => m.id === mealId);
  const rows = resolveRows(a.foods.map(foodRow), pool, st.choices, foodBoost(st));
  const entries: FoodEntry[] = [];
  const lines: AgentResult['lines'] = [];
  const toSave: Food[] = [];
  const asks: AgentResult[] = [];
  let unreachable = false;

  // every food is looked up at once (a list of four used to wait for each one in turn)
  const looking = st.settings.foodLookup ? rows.filter((r) => !r.ask && (r.partial || (r.status !== 'resolved' && !(r.status === 'ambiguous' && (r.candidates[0]?.score ?? 0) >= 0.5)))) : [];
  if (looking.length) ctx.onStatus?.(looking.length === 1 ? t('Looking up {name}…', { name: looking[0].raw }) : t('Looking up {n} foods…', { n: looking.length }));
  const found = await Promise.all(rows.map((r) => (r.ask ? Promise.resolve({} as Awaited<ReturnType<typeof findFood>>) : findFood(r, st.settings.foodLookup, ctx.brain?.signal).catch(() => ({} as Awaited<ReturnType<typeof findFood>>)))));
  ctx.onStatus?.('');
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // tied foods far apart in calories, and no habit to choose by: ask once (the answer is remembered for next time)
    if (r.ask) { asks.push(askWhich(r, r.ask, date, mealId, ctx)); continue; }
    const { food, online, closest } = found[i];
    if (found[i].unreachable) unreachable = true;
    if (online) toSave.push(online);
    if (food) {
      let q = rowQuantity(r, food);
      let note = '';
      if (!q.qty && q.problem === 'noAmount') {
        // no amount said: the amount they usually log; else one typical portion (flagged); a food with neither asks
        const usual = usualQty(st, food);
        const p = food.portions[0];
        if (usual) { q = { qty: usual, estimated: false }; note = t('your usual'); }
        else if (p) { q = { qty: { amount: 1, unit: 'portion', portionId: p.id }, estimated: true }; note = t('typical portion'); }
      }
      // "2 pieces" of a food weighed only in grams: the AI says how heavy they are; the food's own label still counts
      if (!q.qty && q.problem === 'needsGrams' && ctx.brain && r.amount !== undefined) {
        const est = await estimateFood(`${r.amount} ${r.dim === 'count' ? (r.countWord ?? '') : r.dim} ${r.query}`.replace(/\s+/g, ' '), ctx.brain, lang).catch(() => null);
        if (est?.grams) { q = { qty: { amount: Math.round(est.grams), unit: food.basis }, estimated: true }; note = t('estimated weight'); }
      }
      if (q.qty && ctx.photo) { q = { ...q, estimated: true }; note = note || t('estimated from the photo'); }
      const entry = q.qty ? entryFromSnapshot(snapshotOf(food), q.qty, date, mealId, { id: uid('e') }) : null;
      // a number that doesn't make sense for them ("2000 g rice" when they eat 200 g): asked, never logged as heard
      const alt = entry && q.qty ? oddAmount(st, food, q.qty, kcalOf(entry)) : null;
      if (entry && alt) { asks.push(askAmount(food, q.qty!, alt, date, mealId, ctx)); continue; }
      if (entry) {
        if (q.estimated) entry.estimated = true;
        entries.push(entry);
        const tags = [note, closest ? t('closest match') : ''].filter(Boolean).join(' · ');
        lines.push({ text: foodLabel(food, lang), sub: `${lineLabel(food, q.qty!, ctx)}${kcalOf(entry) !== undefined ? ` · ${kcalOf(entry)} kcal` : ''}${tags ? ` · ${tags}` : ''}`, warn: !!closest, ref: entry.id });
        continue;
      }
      // a food it knows is never swapped for a guess: it asks for the amount instead
      if (q.problem === 'noAmount' || q.problem === 'needsGrams') { lines.push({ text: foodLabel(food, lang), sub: t('How much? Say it in grams'), warn: true }); continue; }
    }
    // a food nobody knows (or no usable amount): an AI estimate, clearly labelled, kept per 100 g so "it was 150 g" works
    if (ctx.brain) {
      try {
        const est = await estimateFood(r.amount !== undefined ? `${r.amount} ${r.dim === 'count' ? (r.countWord ?? '') : r.dim} ${r.query}`.trim() : r.query, ctx.brain, lang);
        const label = `${est.name} (${t('AI estimate')})`;
        const e = est.grams
          ? entryFromSnapshot({ name: label, source: 'quick', basis: 'g', per100: { kcal: est.kcal / est.grams * 100, protein: est.protein / est.grams * 100, carbs: est.carbs / est.grams * 100, fat: est.fat / est.grams * 100 }, portions: [] }, { amount: est.grams, unit: 'g' }, date, mealId, { id: uid('e'), note: est.assumptions || undefined })
          : null;
        const q = e ?? { ...quickEntry(label, { kcal: est.kcal, protein: est.protein, carbs: est.carbs, fat: est.fat }, date, mealId), note: est.assumptions || undefined };
        entries.push({ ...q, estimated: true });
        lines.push({ text: est.name, sub: `${est.grams ? `${Math.round(est.grams)} g · ` : ''}${Math.round(est.kcal)} kcal · ${t('AI estimate')}`, warn: true, ref: q.id });
        continue;
      } catch { /* fall through to the honest miss */ }
    }
    lines.push({ text: r.raw, sub: found[i].unreachable ? t('Couldn’t reach the food database') : t('Not found — add it from the Food tab'), warn: true });
  }

  const out: AgentResult[] = [];
  if (entries.length) {
    toSave.forEach((f) => st.saveFood(f));
    const added = st.logEntries(entries);
    const total = added.reduce((n, e) => n + (e.nutrients.kcal ?? 0), 0);
    out.push({
      id: uid('r'), kind: 'food',
      title: t('Logged to {meal}', { meal: meal ? mealName(meal, lang) : t('Today') }) + (date !== ctx.today ? ` · ${date === addDays(ctx.today, -1) ? t('Yesterday') : date}` : ''),
      lines: [...lines, ...(added.length > 1 ? [{ text: t('Total'), sub: `${Math.round(total)} kcal` }] : [])],
      undo: () => added.forEach((e) => useStore.getState().removeEntry(e.id)),
    });
  } else if (lines.length) {
    out.push({ id: uid('r'), kind: 'miss', title: unreachable ? t('Couldn’t reach the food database') : t('Couldn’t log that'), lines, ...(unreachable ? { subtitle: t('Check your connection and ask again.') } : {}) });
  }
  return [...out, ...asks];
}

/**
 * An amount that is probably misheard or mistyped (20 Oct, Omar: "it has to have logic if it misheard me"): grams or ml at
 * least 5× what they usually log of that food, or, for a food they never logged, a single item of 1,500+ kcal and a kilo
 * or more. The likely amount is a tenth of it (2000 → 200), else their usual.
 */
export function oddAmount(st: { entries: FoodEntry[] }, food: Food, qty: Quantity, kcal: number | undefined): Quantity | null {
  if (qty.unit !== 'g' && qty.unit !== 'ml') return null;
  const last = [...st.entries].reverse().find((e) => !e.quick && e.snap.foodId === food.id && e.qty.unit === qty.unit);
  const usual = last?.qty.amount;
  const odd = usual ? qty.amount >= usual * 5 && qty.amount >= 300 : (kcal ?? 0) >= 1500 && qty.amount >= 1000;
  if (!odd) return null;
  const tenth = qty.amount / 10;
  return { amount: usual && Math.abs(tenth - usual) > usual ? usual : Math.round(tenth), unit: qty.unit };
}

/** "Did you mean 200 g?": one tap logs the likely amount, the other what was heard. */
function askAmount(food: Food, heard: Quantity, likely: Quantity, date: string, mealId: string, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const res: AgentResult = {
    id: uid('r'), kind: 'food', pending: true, offer: true,
    title: t('Did you mean {amount}?', { amount: `${fmtNum(likely.amount, lang, 0)} ${likely.unit}` }), subtitle: foodLabel(food, lang), lines: [],
    doneTitle: t('Logged'),
    choose: [likely, heard].map((qty) => {
      const preview = entryFromSnapshot(snapshotOf(food), qty, date, mealId, {});
      return {
        label: `${fmtNum(qty.amount, lang, 0)} ${qty.unit}`,
        sub: preview && kcalOf(preview) !== undefined ? `${kcalOf(preview)} kcal` : undefined,
        run: () => {
          const st = useStore.getState();
          const e = entryFromSnapshot(snapshotOf(food), qty, date, mealId, { id: uid('e') });
          const added = e ? st.logEntries([e])[0] : undefined;
          if (!added) return;
          res.lines = [{ text: foodLabel(food, lang), sub: `${lineLabel(food, qty, ctx)}${kcalOf(added) !== undefined ? ` · ${kcalOf(added)} kcal` : ''}`, ref: added.id }];
          const meal = st.settings.meals.find((m) => m.id === mealId);
          res.doneTitle = t('Logged to {meal}', { meal: meal ? mealName(meal, lang) : t('Today') }) + (date !== ctx.today ? ` · ${date === addDays(ctx.today, -1) ? t('Yesterday') : date}` : '');
          res.undo = () => useStore.getState().removeEntry(added.id);
        },
      };
    }),
  };
  return res;
}

/** "Which one?": tied foods far apart in calories. One tap logs it and remembers the choice, so it is asked only once. */
function askWhich(r: ReturnType<typeof resolveRows>[number], options: Food[], date: string, mealId: string, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const res: AgentResult = {
    id: uid('r'), kind: 'food', pending: true, offer: true,
    // (what was said is the subtitle; once picked it says it is remembered, and the line logged unfolds)
    title: t('Which one?'), subtitle: [r.raw, r.amount !== undefined && r.dim !== 'count' ? `${fmtNum(r.amount, lang, 0)} ${r.dim}` : ''].filter(Boolean).join(' · '), lines: [],
    doneTitle: t('Logged'),
    choose: options.map((food) => {
      const q = rowQuantity(r, food);
      const qty = q.qty ?? (food.portions[0] ? { amount: 1, unit: 'portion' as const, portionId: food.portions[0].id } : null);
      const preview = qty ? entryFromSnapshot(snapshotOf(food), qty, date, mealId, {}) : null;
      return {
        label: foodLabel(food, lang),
        sub: preview && kcalOf(preview) !== undefined ? `${kcalOf(preview)} kcal` : undefined,
        run: () => {
          const st = useStore.getState();
          st.setChoice(fold(r.query), food.id);
          const e = qty ? entryFromSnapshot(snapshotOf(food), qty, date, mealId, { id: uid('e') }) : null;
          if (!e) return;
          const [added] = st.logEntries([e]);
          res.lines = [{ text: foodLabel(food, lang), sub: `${lineLabel(food, qty!, ctx)}${kcalOf(added ?? e) !== undefined ? ` · ${kcalOf(added ?? e)} kcal` : ''}`, ref: (added ?? e).id }];
          res.doneSubtitle = t('Remembered for next time');
          const meal = st.settings.meals.find((m) => m.id === mealId);
          res.doneTitle = t('Logged to {meal}', { meal: meal ? mealName(meal, lang) : t('Today') }) + (date !== ctx.today ? ` · ${date === addDays(ctx.today, -1) ? t('Yesterday') : date}` : '');
          res.undo = () => { const s2 = useStore.getState(); s2.removeEntry((added ?? e).id); const c = { ...s2.choices }; delete c[fold(r.query)]; useStore.setState({ choices: c }); };
        },
      };
    }),
  };
  return res;
}

// ── editing what is already logged: find the item, then correct / move / copy / replace / remove it ──

const mealIdOf = (word: string | null | undefined, ctx: AgentCtx) => resolveMeal(word, useStore.getState().settings.meals, ctx.lang);
const mealLabelOf = (id: string, ctx: AgentCtx) => { const m = useStore.getState().settings.meals.find((x) => x.id === id); return m ? mealName(m, ctx.lang) : id; };
const dayLabel = (date: string, ctx: AgentCtx) => (date === ctx.today ? ctx.t('Today') : date === addDays(ctx.today, -1) ? ctx.t('Yesterday') : date);

/** The days to look in: the one asked for; else the day the user is looking at, today, yesterday, then the last week. */
function searchDays(day: string | null | undefined, ctx: AgentCtx): string[] {
  const asked = resolveDay(day, ctx.today);
  if (asked) return [asked];
  return [...new Set([ctx.date ?? ctx.today, ctx.today, addDays(ctx.today, -1), ...Array.from({ length: 6 }, (_, i) => addDays(ctx.today, -i - 2))])];
}

/** The logged food a sentence is about: the same name (optionally in a given meal), on the first day that has it. */
function findEntry(target: string, days: string[], mealId?: string): FoodEntry | undefined {
  const q = fold(target);
  const qt = q.split(/\s+/).filter((w) => w.length > 1);
  const all = useStore.getState().entries;
  for (const date of days) {
    let best: FoodEntry | undefined; let bestScore = 0;
    for (const e of all) {
      if (e.date !== date || (mealId && e.mealId !== mealId)) continue;
      const n = fold(e.snap.name);
      const score = n === q ? 3 : n.includes(q) || q.includes(n) ? 2 : qt.length ? qt.filter((w) => n.includes(w)).length / qt.length : 0;
      if (score > bestScore || (score === bestScore && best && e.at > best.at)) { best = e; bestScore = score; }
    }
    if (bestScore >= 0.5) return best;
  }
  return undefined;
}

/** The item a card showed (its id), else the one the name points at. */
function pickEntry(ref: string | null | undefined, target: string | null | undefined, days: string[], mealId?: string): FoodEntry | undefined {
  if (ref) { const e = useStore.getState().entries.find((x) => x.id === ref); if (e) return e; }
  return target ? findEntry(target, days, mealId) : undefined;
}

/** Everything in a meal on a day (or the whole day). */
function mealItems(date: string, mealId: string | undefined) {
  return useStore.getState().entries.filter((e) => e.date === date && (!mealId || e.mealId === mealId));
}

/**
 * A big change as a preview: the card says what will happen and nothing changes until Apply; after Apply it can be undone.
 * `apply` makes the change and returns how to take it back.
 */
function preview(r: Omit<AgentResult, 'pending' | 'button' | 'undo'>, label: string, apply: () => () => void): AgentResult {
  const out: AgentResult = { ...r, pending: true, offer: true, button: { label, run: () => { out.undo = apply(); } } };
  return out;
}

const kcalStr = (e: FoodEntry) => (kcalOf(e) !== undefined ? `${kcalOf(e)} kcal` : '— kcal');
const notFound = (ctx: AgentCtx, what: string): AgentResult => ({ id: uid('r'), kind: 'miss', title: ctx.t('Couldn’t find that in the log'), lines: [{ text: what, warn: true }] });

function doEditFood(a: Extract<AgentAction, { type: 'edit_food' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const prev = pickEntry(a.ref, a.target, searchDays(a.day, ctx), mealIdOf(a.meal_from, ctx));
  if (!prev) return notFound(ctx, a.target || a.ref || '');
  let next: FoodEntry = prev;
  const changed: string[] = [];
  // new label values: recompute the entry from the corrected food (a quick entry has no label, its totals are set instead)
  if (a.per100 && !prev.quick) {
    const snap = { ...prev.snap, per100: { ...prev.snap.per100, ...a.per100 } };
    const r = entryFromSnapshot(snap, prev.qty, prev.date, prev.mealId, { id: prev.id, at: prev.at, note: prev.note });
    if (r) { next = { ...r, estimated: prev.estimated }; changed.push(`${a.per100.kcal !== undefined ? `${a.per100.kcal} kcal` : t('values')} / 100 ${prev.snap.basis}`); }
  }
  if (a.totals) { next = { ...next, nutrients: { ...next.nutrients, ...a.totals } }; changed.push(t('totals')); }
  if (a.amount) {
    const u = (a.unit || '').toLowerCase();
    const qty: Quantity | null =
      u === 'kg' ? { amount: a.amount * 1000, unit: 'g' } :
      u === 'g' || u === 'ml' ? { amount: a.amount, unit: u } :
      u === 'l' || u === 'dl' || u === 'cl' ? { amount: a.amount * VOLUME_ML[u], unit: 'ml' } :
      (u === 'piece' || u === 'portion' || u === 'serving') && next.snap.portions[0] ? { amount: a.amount, unit: 'portion', portionId: next.snap.portions[0].id } :
      // no unit: "make it 2" on 150 g is two of what was there (its portion if it has one), not 2 g
      !u && (next.qty.unit === 'g' || next.qty.unit === 'ml') && a.amount <= 12 ? (next.snap.portions[0] ? { amount: a.amount, unit: 'portion', portionId: next.snap.portions[0].id } : { amount: next.qty.amount * a.amount, unit: next.qty.unit }) :
      !u ? { ...next.qty, amount: a.amount } : null;
    const r = qty && !next.quick ? entryFromSnapshot(next.snap, qty, next.date, next.mealId, { id: next.id, at: next.at, note: next.note }) : null;
    if (r) { next = { ...r, estimated: false }; changed.push(qty!.unit === 'portion' ? `${fmtNum(qty!.amount, lang, 1)} ×` : `${fmtNum(qty!.amount, lang, 0)} ${qty!.unit}`); }
  }
  const mealId = mealIdOf(a.meal, ctx);
  if (mealId && mealId !== next.mealId) { next = { ...next, mealId }; changed.push(mealLabelOf(mealId, ctx)); }
  if (next === prev) return { id: uid('r'), kind: 'miss', title: t('Couldn’t change that'), lines: [{ text: prev.snap.name, warn: true }] };
  // a saved food with a wrong label: fix the food too, so the next time you log it is right
  const own = a.per100 && prev.snap.foodId ? st.foods.find((f) => f.id === prev.snap.foodId) : undefined;
  const line = { text: prev.snap.name, sub: `${kcalStr(prev)} → ${kcalStr(next)} · ${changed.join(' · ')}`, ref: prev.id };
  const apply = () => {
    const s = useStore.getState();
    s.updateEntry(prev.id, next);
    if (own) s.saveFood({ ...own, per100: { ...own.per100, ...a.per100 } });
    return () => { const s2 = useStore.getState(); s2.updateEntry(prev.id, prev); if (own) s2.saveFood(own); };
  };
  // a bare number that changes the calories more than five times over (a misheard "200" on a tub) waits for a tap
  const k0 = kcalOf(prev), k1 = kcalOf(next);
  if (a.amount && !a.unit && k0 && k1 !== undefined && (k1 > k0 * 5 || k1 < k0 / 5)) return preview({ id: uid('r'), kind: 'food', title: t('Change it to this?'), key: `edit:${prev.id}`, lines: [line], doneTitle: t('Corrected') }, t('Change'), apply);
  return { id: uid('r'), kind: 'food', title: t('Corrected'), lines: [line], undo: apply() };
}

function doDeleteFood(a: Extract<AgentAction, { type: 'delete_food' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  let list: FoodEntry[];
  if (a.target || a.ref) { const e = pickEntry(a.ref, a.target, searchDays(a.day, ctx), mealIdOf(a.meal, ctx)); if (!e) return notFound(ctx, a.target || a.ref || ''); list = [e]; }
  else {
    const date = resolveDay(a.day, ctx.today) ?? ctx.date ?? ctx.today;
    const all = fold(a.meal ?? '') === 'all' || fold(a.meal ?? '') === 'day';
    const mid = all ? undefined : mealIdOf(a.meal, ctx);
    if (!all && !mid) return notFound(ctx, a.meal ?? '');
    list = mealItems(date, mid);
    if (!list.length) return { id: uid('r'), kind: 'miss', title: t('Nothing to remove'), lines: [{ text: `${mid ? mealLabelOf(mid, ctx) : t('Today')} · ${dayLabel(date, ctx)}` }] };
  }
  const total = list.reduce((n, e) => n + (e.nutrients.kcal ?? 0), 0);
  const lines = [...list.slice(0, 8).map((e) => ({ text: e.snap.name, sub: kcalStr(e), ref: e.id })), ...(list.length > 8 ? [{ text: t('{n} more', { n: list.length - 8 }) }] : []), ...(list.length > 1 ? [{ text: t('Total'), sub: `${Math.round(total)} kcal` }] : [])];
  const remove = () => { list.forEach((e) => useStore.getState().removeEntry(e.id)); return () => useStore.getState().restoreEntries(list); };
  // a whole meal or day waits for a tap; one item goes at once (with Undo)
  if (list.length > 1) return preview({ id: uid('r'), kind: 'food', title: t('Remove {n} items?', { n: list.length }), key: `del:${list.map((e) => e.id).join(',')}`, lines }, t('Remove'), remove);
  return { id: uid('r'), kind: 'food', title: t('Removed'), lines, undo: remove() };
}

/** Move or copy: one item, or a whole meal, to another meal and/or day. */
function doMoveCopy(a: Extract<AgentAction, { type: 'move_food' | 'copy_food' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const copy = a.type === 'copy_food';
  const fromMeal = mealIdOf(a.meal_from, ctx);
  let list: FoodEntry[];
  if (a.target || a.ref) { const e = pickEntry(a.ref, a.target, searchDays(a.day, ctx), fromMeal); if (!e) return notFound(ctx, a.target || a.ref || ''); list = [e]; }
  else {
    const date = resolveDay(a.day, ctx.today) ?? ctx.date ?? ctx.today;
    if (!fromMeal) return notFound(ctx, a.meal_from ?? '');
    list = mealItems(date, fromMeal);
    if (!list.length) return { id: uid('r'), kind: 'miss', title: t('Nothing to move'), lines: [{ text: `${mealLabelOf(fromMeal, ctx)} · ${dayLabel(date, ctx)}`, warn: true }] };
  }
  const toMeal = mealIdOf(a.meal_to, ctx);
  // (a copy with no day said goes to the day being looked at: "copy yesterday's breakfast" while on today)
  const toDate = resolveDay(a.day_to, ctx.today) ?? (copy ? ctx.date ?? ctx.today : undefined);
  if (a.meal_to && !toMeal) return notFound(ctx, a.meal_to);
  const st = useStore.getState();
  const dest = [toMeal ? mealLabelOf(toMeal, ctx) : '', toDate ? dayLabel(toDate, ctx) : ''].filter(Boolean).join(' · ');
  if (copy) {
    const copies = list.map((e) => ({ ...e, id: uid('e'), date: toDate ?? e.date, mealId: toMeal ?? e.mealId, at: Date.now() }));
    st.logEntries(copies);
    return { id: uid('r'), kind: 'food', title: t('Copied to {where}', { where: dest }), lines: copies.slice(0, 8).map((e) => ({ text: e.snap.name, sub: kcalStr(e), ref: e.id })), undo: () => copies.forEach((e) => useStore.getState().removeEntry(e.id)) };
  }
  list = list.filter((e) => (toMeal && e.mealId !== toMeal) || (toDate && e.date !== toDate));
  if (!list.length) return { id: uid('r'), kind: 'miss', title: t('Already there'), lines: [{ text: dest }] };
  list.forEach((e) => st.moveEntry(e.id, { date: toDate, mealId: toMeal }));
  // one food moved to another meal: the Coach learns where it goes (lib/ledger.ts), unless this is undone
  const unlearn = list.length === 1 && toMeal && (a.target || a.ref) ? noteEvent({ k: 'move', food: list[0].snap.name, meal: toMeal }) : () => {};
  return {
    id: uid('r'), kind: 'food', title: t('Moved to {where}', { where: dest }), lines: list.slice(0, 8).map((e) => ({ text: e.snap.name, sub: `${mealLabelOf(e.mealId, ctx)} → ${dest}`, ref: e.id })),
    undo: () => { list.forEach((e) => useStore.getState().moveEntry(e.id, { date: e.date, mealId: e.mealId })); unlearn(); },
  };
}

/** Swap a logged food for another one: same meal, same day, and — unless a new amount was said — the same amount. */
async function doReplaceFood(a: Extract<AgentAction, { type: 'replace_food' }>, ctx: AgentCtx): Promise<AgentResult> {
  const { t } = ctx;
  const old = pickEntry(a.ref, a.target, searchDays(a.day, ctx), mealIdOf(a.meal_from, ctx));
  if (!old) return notFound(ctx, a.target || a.ref || '');
  const w = { ...a.with };
  if (w.amount == null && !old.quick) { // keep the old amount (a count stays a count only when it was a portion: then a typical portion)
    if (old.qty.unit === 'portion') { w.amount = old.qty.amount; w.unit = 'piece'; } else { w.amount = Math.round(old.base); w.unit = old.snap.basis; }
  }
  const [r] = await doLogFood({ type: 'log_food', foods: [w], meal: old.mealId, day: old.date }, ctx);
  if (!r) return notFound(ctx, w.name);
  // "Which one?" for the new food: the choice also takes the old one out (and Undo puts it back)
  if (r.choose) {
    r.choose = r.choose.map((c) => ({ ...c, run: () => { c.run(); useStore.getState().removeEntry(old.id); const u = r.undo; r.undo = () => { u?.(); useStore.getState().restoreEntries([old]); }; } }));
    return r;
  }
  if (r.kind !== 'food') return { ...r, title: t('Couldn’t replace that') };
  useStore.getState().removeEntry(old.id);
  // a correction is remembered: next time these words mean this food
  const nowId = useStore.getState().entries.find((e) => e.id === r.lines[0]?.ref)?.snap.foodId;
  if (nowId) useStore.getState().setChoice(fold(w.name), nowId);
  const undoNew = r.undo;
  return {
    id: uid('r'), kind: 'food', title: t('Replaced'),
    lines: [{ text: old.snap.name, sub: `${kcalStr(old)} →` }, ...r.lines.filter((l) => l.text !== t('Total'))],
    undo: () => { undoNew?.(); useStore.getState().restoreEntries([old]); },
  };
}

function doCreateFood(a: Extract<AgentAction, { type: 'create_food' }>, ctx: AgentCtx): AgentResult | Promise<AgentResult> {
  const { t } = ctx;
  const st = useStore.getState();
  const id = uid('f');
  const { fibre, ...macros } = a.per100;
  const food: Food = { id, name: a.name, source: 'custom', basis: a.basis, per100: { kcal: 0, protein: 0, carbs: 0, fat: 0, ...macros, ...(fibre !== undefined ? { fibre } : {}) }, portions: [] };
  st.saveFood(food);
  const lines = [{ text: a.name, sub: `${Math.round(food.per100.kcal ?? 0)} kcal / 100 ${a.basis}` }];
  const undoFood = () => useStore.getState().deleteFood(id);
  if (a.amount == null) return { id: uid('r'), kind: 'food', title: t('Food saved'), lines, undo: undoFood };
  return doLogFood({ type: 'log_food', foods: [{ name: a.name, amount: a.amount, unit: a.unit ?? a.basis }], meal: a.meal, day: a.day }, ctx).then(([r]) => (r ? { ...r, title: t('Saved and logged'), lines: [...lines, ...r.lines], undo: () => { r.undo?.(); undoFood(); } } : { id: uid('r'), kind: 'food' as const, title: t('Food saved'), lines, undo: undoFood }));
}

function doFavourite(a: Extract<AgentAction, { type: 'favourite_food' }>, ctx: AgentCtx): AgentResult {
  const st = useStore.getState();
  const pool = foodPool(st.foods, st.recipes);
  const r = resolveRows([{ id: 'f0', raw: a.name, query: a.name, dim: 'count' as const }], pool, st.choices, () => 0)[0];
  const food = r?.candidates[0] && r.candidates[0].score >= 0.5 ? r.candidates[0].food : undefined;
  if (!food) return notFound(ctx, a.name);
  const isFav = st.favourites.includes(food.id);
  if (isFav !== a.on) st.toggleFavourite(food.id);
  return { id: uid('r'), kind: 'food', title: a.on ? ctx.t('Added to favourites') : ctx.t('Removed from favourites'), lines: [{ text: food.name }], undo: () => { if (useStore.getState().favourites.includes(food.id) !== isFav) useStore.getState().toggleFavourite(food.id); } };
}

function doSaveMeal(a: Extract<AgentAction, { type: 'save_meal' }>, ctx: AgentCtx): AgentResult {
  const mid = mealIdOf(a.meal, ctx);
  const date = resolveDay(a.day, ctx.today) ?? ctx.date ?? ctx.today;
  const list = mid ? mealItems(date, mid).filter((e) => !e.quick) : [];
  if (!list.length) return notFound(ctx, a.meal);
  const m = { id: uid('m'), name: a.name, items: list.map((e) => ({ snap: e.snap, qty: e.qty })), createdAt: Date.now() };
  useStore.getState().saveMeal(m);
  return { id: uid('r'), kind: 'food', title: ctx.t('Meal saved'), lines: [{ text: a.name, sub: `${list.length} ${ctx.t('items')}` }], undo: () => useStore.getState().deleteMeal(m.id) };
}

// ── workouts: sets, exercises, routines, plan ──

const exLabel = (e: { name: string; nameDa?: string }, lang: 'en' | 'da') => (lang === 'da' && e.nameDa ? e.nameDa : e.name);

/** The block of a session an exercise name points at. */
function findBlock(name: string, ses: { exercises: SessionExercise[] }, lang: 'en' | 'da') {
  const st = useStore.getState();
  const map = new Map(allExercises(st.exercises).map((e) => [e.id, e]));
  const pool = ses.exercises.map((b) => map.get(b.exerciseId)).filter(Boolean) as Exercise[];
  const c = matchExercises(name, pool, lang, 3);
  if (!c.length || c[0].score < 0.5) return undefined;
  const ex = c[0].ex;
  return { block: [...ses.exercises].reverse().find((b) => b.exerciseId === ex.id)!, ex };
}

function findExercise(name: string, lang: 'en' | 'da'): Exercise | undefined {
  const st = useStore.getState();
  const c = matchExercises(name, allExercises(st.exercises), lang, 3);
  return c.length && c[0].score >= 0.6 ? c[0].ex : undefined;
}

function findRoutine(name: string) {
  const w = fold(name);
  const rs = useStore.getState().routines;
  return rs.find((r) => fold(r.name) === w) ?? rs.find((r) => fold(r.name).includes(w) || w.includes(fold(r.name)));
}

function doEditSet(a: Extract<AgentAction, { type: 'edit_set' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const useActive = !!st.active && (a.workout == null || a.workout === 'current');
  const done = st.sessions.filter((s) => s.status === 'done');
  const target = useActive ? st.active! : /^\d{4}-\d{2}-\d{2}$/.test(a.workout ?? '') ? [...done].reverse().find((s) => s.date === a.workout) : done[done.length - 1];
  if (!target) return { id: uid('r'), kind: 'miss', title: t('No workout to change'), lines: [] };
  const hit = findBlock(a.exercise, target, lang);
  if (!hit) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that exercise in the workout'), lines: [{ text: a.exercise, warn: true }] };
  const sets = hit.block.sets;
  // 1-based set number, "last" (none given) = the last finished set, else the last set
  let idx = a.set_number ? a.set_number - 1 : -1;
  if (idx < 0) { const d = sets.map((s, i) => (s.done ? i : -1)).filter((i) => i >= 0); idx = d.length ? d[d.length - 1] : sets.length - 1; }
  const set = sets[idx];
  if (!set) return { id: uid('r'), kind: 'miss', title: t('That set doesn’t exist'), lines: [{ text: exLabel(hit.ex, lang), sub: `${sets.length} ${t('sets')}`, warn: true }] };
  const prevBlock = hit.block;
  const apply = (fn: (b: typeof prevBlock) => typeof prevBlock) => {
    const mut = (ses: typeof target) => ({ ...ses, exercises: ses.exercises.map((b) => (b.id === prevBlock.id ? fn(b) : b)) });
    if (useActive) useStore.getState().mutateActive(mut as never); else useStore.getState().mutateSession(target.id, mut as never);
  };
  const w = st.settings.units.weight;
  const show = (s: SetRecord) => `${s.weightKg ? `${fmtNum(kgToDisplay(s.weightKg, w), lang, 2)} ${w} × ` : ''}${s.reps ?? '—'}`;
  if (a.remove) {
    apply((b) => ({ ...b, sets: b.sets.filter((q) => q.id !== set.id) }));
    return { id: uid('r'), kind: 'sets', title: t('Set removed'), lines: [{ text: exLabel(hit.ex, lang), sub: `${t('Set')} ${idx + 1} · ${show(set)}` }], undo: () => apply((b) => ({ ...b, sets: prevBlock.sets })) };
  }
  const next: SetRecord = { ...set, ...(a.kg != null ? { weightKg: a.kg } : {}), ...(a.reps != null ? { reps: a.reps } : {}) };
  apply((b) => ({ ...b, sets: b.sets.map((q) => (q.id === set.id ? next : q)) }));
  return { id: uid('r'), kind: 'sets', title: t('Set corrected'), lines: [{ text: exLabel(hit.ex, lang), sub: `${t('Set')} ${idx + 1} · ${show(set)} → ${show(next)}` }], undo: () => apply((b) => ({ ...b, sets: prevBlock.sets })) };
}

/** "Don't cut my calories" (the catch-up after a heavy day comes off) or "I ate about 1,500 extra yesterday" (one set). */
/** Why the Coach can't set a catch-up for them (lib/verdict.ts `trimAllowed`). */
const NO_TRIM: Record<NoTrim, string> = {
  mode: 'Heavy-day notices aren’t on (Settings → Targets)',
  goal: 'Catch-ups are only for a fat-loss goal',
  age: 'Tell me your age first: catch-ups are only for adults',
  minor: 'No catch-ups under 18: eat normally and keep training',
  health: 'No catch-up: eating less to make up for it isn’t good for you right now',
};

function doCatchUp(a: Extract<AgentAction, { type: 'catch_up' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const prev = st.catchUps ?? [];
  // running, or still being decided (so "don't cut" said while it thinks is never overruled by the answer)
  const running = prev.filter((c) => !c.off && ((c.perDay > 0 && c.days.some((x) => x >= ctx.today)) || (!isDecided(c) && diffDays(ctx.today, c.date) <= 3)));
  // (Undo touches only the records this card changed: anything decided since stays as it is)
  const setOff = (ids: Set<string>, off: boolean) => { const s2 = useStore.getState(); s2.setCatchUps((s2.catchUps ?? []).map((c) => (ids.has(c.id) ? { ...c, off } : c))); };
  if (!a.on) {
    if (!running.length) return { id: uid('r'), kind: 'miss', title: t('No catch-up is running'), lines: [] };
    const ids = new Set(running.map((c) => c.id));
    setOff(ids, true);
    return { id: uid('r'), kind: 'setting', title: t('Catch-up taken off'), lines: [{ text: t('Your normal calorie target is back') }], undo: () => setOff(ids, false) };
  }
  const target = st.settings.goals.kcal;
  if (!target) return { id: uid('r'), kind: 'miss', title: t('Set a calorie target first'), lines: [] };
  // (asked for by name, still within the same limits as the app's own: lib/verdict.ts)
  const no = trimAllowed(st, ctx.today);
  if (no) return { id: uid('r'), kind: 'miss', title: t('No catch-up'), lines: [{ text: t(NO_TRIM[no]) }] };
  const date = resolveDay(a.day, ctx.today) ?? addDays(ctx.today, -1);
  const over = a.over ?? Math.round(dayKcal(st, date) - (targetOn(st, date) ?? target));
  const was = prev.find((x) => x.date === date);
  const c0: CatchUp = { id: was?.id ?? uid('cu'), date, over, days: [], perDay: 0, floor: catchUpFloor(st, ctx.today), trigger: was?.trigger ?? 'late', at: Date.now(), told: true, coachTold: true, decided: true, byHand: true };
  const n = over <= 900 ? 2 : over <= 1500 ? 3 : 4;
  const lim = trimLimits(st, c0, ctx.today);
  const v = over >= 100 ? clampVerdict({ plan: 'trim', perDay: Math.min(lim.perDay, lim.total / n), days: n, line: '-', why: '' }, lim) : null;
  if (!v || !v.perDay) return { id: uid('r'), kind: 'miss', title: t('Nothing to catch up'), lines: [] };
  const start = addDays(date, 1) > ctx.today ? addDays(date, 1) : ctx.today;
  const c1: CatchUp = { ...c0, perDay: v.perDay, days: Array.from({ length: v.days }, (_, k) => addDays(start, k)) };
  const c = { ...c1, line: catchUpWords(c1, ctx.today, t, (x) => fmtNum(x, lang, 0)) };
  st.setCatchUps([...prev.filter((x) => x.date !== date), c]);
  // (Undo: the day goes back to what it was, or stays recorded with no cut, so the app never decides it again)
  return { id: uid('r'), kind: 'setting', title: t('Catch-up set'), lines: [{ text: c.line }], undo: () => { const s2 = useStore.getState(); s2.setCatchUps([...(s2.catchUps ?? []).filter((x) => x.id !== c.id), was ?? { ...c, off: true }]); } };
}

function doAddExercise(a: Extract<AgentAction, { type: 'add_exercise' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const found = a.exercises.map((n) => ({ n, ex: findExercise(n, lang) }));
  const ok = found.filter((x) => x.ex).map((x) => x.ex!);
  const miss = found.filter((x) => !x.ex).map((x) => x.n);
  if (!ok.length) return { id: uid('r'), kind: 'miss', title: t('Couldn’t add that'), lines: miss.map((n) => ({ text: n, sub: t('Not in your exercise library'), warn: true })) };
  const st = useStore.getState();
  // nothing running: never a workout started silently (the "I did calves" mix-up, 18 Oct); only when asked to start
  if (!st.active && !a.start) return { id: uid('r'), kind: 'miss', title: t('No workout is running'), lines: [...ok.map((e) => ({ text: exLabel(e, lang), sub: t('Say the sets you did and I’ll log them') }))] };
  const started = !st.active;
  if (started) st.startWorkout({ name: '' });
  const before = new Set(useStore.getState().active!.exercises.map((b) => b.id));
  addExercises(ok.map((e) => e.id));
  const added = useStore.getState().active!.exercises.filter((b) => !before.has(b.id)).map((b) => b.id);
  return {
    id: uid('r'), kind: 'workout', title: t('Added to workout'),
    lines: [...ok.map((e) => ({ text: exLabel(e, lang) })), ...miss.map((n) => ({ text: n, sub: t('Not in your exercise library'), warn: true }))],
    button: { label: t('Open workout'), run: () => useUI.getState().push('workout', { origin: 'none' }) },
    undo: () => { const s = useStore.getState(); s.mutateActive((x) => ({ ...x, exercises: x.exercises.filter((b) => !added.includes(b.id)) })); const after = useStore.getState().active; if (started && after && after.exercises.every((b) => b.sets.every((q) => !q.done))) useStore.getState().discardActive(); },
  };
}

function doRemoveExercise(a: Extract<AgentAction, { type: 'remove_exercise' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  if (!st.active) return { id: uid('r'), kind: 'miss', title: t('No workout is running'), lines: [] };
  const hit = findBlock(a.exercise, st.active, lang);
  if (!hit) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that exercise in the workout'), lines: [{ text: a.exercise, warn: true }] };
  const idx = st.active.exercises.findIndex((b) => b.id === hit.block.id);
  const block = hit.block;
  st.mutateActive((x) => ({ ...x, exercises: x.exercises.filter((b) => b.id !== block.id) }));
  const doneSets = block.sets.filter((q) => q.done).length;
  return {
    id: uid('r'), kind: 'workout', title: t('Removed from workout'), lines: [{ text: exLabel(hit.ex, lang), sub: doneSets ? `${doneSets} ${t('sets done')}` : undefined }],
    undo: () => useStore.getState().mutateActive((x) => { const list = [...x.exercises]; list.splice(Math.min(idx, list.length), 0, block); return { ...x, exercises: list }; }),
  };
}

function doReplaceExercise(a: Extract<AgentAction, { type: 'replace_exercise' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const to = findExercise(a.to, lang);
  if (!to) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that exercise'), lines: [{ text: a.to, sub: t('Not in your exercise library'), warn: true }] };
  const pool = allExercises(st.exercises);
  const nameOf = (id: string) => { const e = pool.find((x) => x.id === id); return e ? exLabel(e, lang) : id; };
  // in a routine ("swap bench for incline bench in Push day")
  if (a.routine) {
    const r = findRoutine(a.routine);
    if (!r) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that routine'), lines: [{ text: a.routine, warn: true }] };
    const c = matchExercises(a.from, r.items.map((i) => pool.find((e) => e.id === i.exerciseId)).filter(Boolean) as Exercise[], lang, 2);
    const item = c.length && c[0].score >= 0.5 ? r.items.find((i) => i.exerciseId === c[0].ex.id) : undefined;
    if (!item) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that exercise in the routine'), lines: [{ text: a.from, warn: true }] };
    st.upsertRoutine({ ...r, items: r.items.map((i) => (i === item ? { ...i, exerciseId: to.id } : i)) });
    const unlearn = item.exerciseId !== to.id ? noteEvent({ k: 'swap', from: item.exerciseId, to: to.id }) : () => {};
    return { id: uid('r'), kind: 'routine', title: t('Routine updated'), lines: [{ text: r.name, sub: `${nameOf(item.exerciseId)} → ${exLabel(to, lang)}` }], undo: () => { useStore.getState().upsertRoutine(r); unlearn(); } };
  }
  // in the running workout
  if (!st.active) return { id: uid('r'), kind: 'miss', title: t('No workout is running'), lines: [{ text: t('Say which routine to change, or start a workout first.') }] };
  const hit = findBlock(a.from, st.active, lang);
  if (!hit) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that exercise in the workout'), lines: [{ text: a.from, warn: true }] };
  const prev = st.active.exercises;
  replaceExercise(hit.block.id, to.id);
  const unlearn = hit.ex.id !== to.id ? noteEvent({ k: 'swap', from: hit.ex.id, to: to.id }) : () => {};
  return {
    id: uid('r'), kind: 'workout', title: t('Exercise swapped'), lines: [{ text: exLabel(hit.ex, lang), sub: `→ ${exLabel(to, lang)}` }],
    button: { label: t('Open workout'), run: () => useUI.getState().push('workout', { origin: 'none' }) },
    undo: () => { useStore.getState().mutateActive((x) => ({ ...x, exercises: prev })); unlearn(); },
  };
}

function itemsFrom(list: RoutineBit[], lang: 'en' | 'da') {
  const items: RoutineItem[] = []; const skipped: string[] = [];
  for (const b of list) {
    const ex = findExercise(b.exercise, lang);
    if (!ex) { skipped.push(b.exercise); continue; }
    const timed = ex.logType === 'duration' || ex.logType === 'distance';
    const repMin = b.repMin ?? 8, repMax = Math.max(repMin, b.repMax ?? Math.max(repMin, 12));
    items.push({ id: uid('ri'), exerciseId: ex.id, warmupSets: b.warmup ?? 0, workingSets: timed ? 1 : b.sets ?? 3, repMin, repMax, restSec: b.restSec ?? 90 });
  }
  return { items, skipped };
}

function doCreateRoutine(a: Extract<AgentAction, { type: 'create_routine' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const { items, skipped } = itemsFrom(a.items, ctx.lang);
  if (!items.length) return { id: uid('r'), kind: 'miss', title: t('Couldn’t build that routine'), lines: skipped.map((n) => ({ text: n, sub: t('Not in your exercise library'), warn: true })) };
  const pool = allExercises(useStore.getState().exercises);
  // a preview first (from a photo of a program, or said): nothing is saved until Apply, and a newer version replaces it
  return preview({
    id: uid('r'), kind: 'routine', title: a.name, subtitle: `${items.length} ${t('exercises')} · ${items.reduce((n, i) => n + i.workingSets, 0)} ${t('sets')}`, key: `routine:${fold(a.name)}`,
    doneTitle: a.name, doneSubtitle: t('Saved to your routines'),
    lines: [...items.map((i) => ({ text: exLabel(pool.find((e) => e.id === i.exerciseId)!, ctx.lang), sub: `${i.workingSets} × ${i.repMin}–${i.repMax}` })), ...skipped.map((n) => ({ text: n, sub: t('Not in your exercise library'), warn: true }))],
  }, t('Apply'), () => {
    const now = Date.now();
    const r = { id: uid('r'), name: a.name, items, createdAt: now, updatedAt: now };
    useStore.getState().upsertRoutine(r);
    return () => useStore.getState().deleteRoutine(r.id);
  });
}

function doEditRoutine(a: Extract<AgentAction, { type: 'edit_routine' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const r = findRoutine(a.routine);
  if (!r) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that routine'), lines: [{ text: a.routine, sub: st.routines.map((x) => x.name).join(' · ').slice(0, 120), warn: true }] };
  const pool = allExercises(st.exercises);
  const nameOf = (id: string) => { const e = pool.find((x) => x.id === id); return e ? exLabel(e, lang) : id; };
  // each change is its own step, so a preview can leave any of them out (the card's ticks)
  type Step = { name: string; items: RoutineItem[] };
  const steps: { line: AgentResult['lines'][number]; run?: (x: Step) => Step }[] = [];
  const have = r.items;
  const pick = (name: string) => { const c = matchExercises(name, have.map((i) => pool.find((e) => e.id === i.exerciseId)).filter(Boolean) as Exercise[], lang, 2); return c.length && c[0].score >= 0.5 ? have.find((i) => i.exerciseId === c[0].ex.id) : undefined; };
  if (a.rename) steps.push({ line: { text: r.name, sub: `→ ${a.rename}` }, run: (x) => ({ ...x, name: a.rename! }) });
  for (const n of a.remove ?? []) {
    const it = pick(n);
    if (it) steps.push({ line: { text: nameOf(it.exerciseId), sub: t('removed') }, run: (x) => ({ ...x, items: x.items.filter((i) => i.id !== it.id) }) });
    else steps.push({ line: { text: n, sub: t('not in this routine'), warn: true } });
  }
  for (const b of a.change ?? []) {
    const it = pick(b.exercise);
    if (!it) { steps.push({ line: { text: b.exercise, sub: t('not in this routine'), warn: true } }); continue; }
    const repMin = b.repMin ?? it.repMin, repMax = Math.max(repMin, b.repMax ?? it.repMax);
    const nx = { ...it, workingSets: b.sets ?? it.workingSets, repMin, repMax, restSec: b.restSec ?? it.restSec, warmupSets: b.warmup ?? it.warmupSets };
    steps.push({ line: { text: nameOf(it.exerciseId), sub: `${it.workingSets} × ${it.repMin}–${it.repMax} → ${nx.workingSets} × ${nx.repMin}–${nx.repMax}${nx.restSec !== it.restSec ? ` · ${fmtSec(nx.restSec)}` : ''}${nx.warmupSets !== it.warmupSets ? ` · ${nx.warmupSets} W` : ''}` }, run: (x) => ({ ...x, items: x.items.map((i) => (i.id === it.id ? { ...nx, id: i.id } : i)) }) });
  }
  if (a.add?.length) {
    const m = itemsFrom(a.add, lang);
    m.items.forEach((it) => steps.push({ line: { text: nameOf(it.exerciseId), sub: `${t('added')} · ${it.workingSets} × ${it.repMin}–${it.repMax}` }, run: (x) => ({ ...x, items: [...x.items, it] }) }));
    m.skipped.forEach((n) => steps.push({ line: { text: n, sub: t('Not in your exercise library'), warn: true } }));
  }
  const real = steps.filter((x) => x.run).length;
  if (!real) return { id: uid('r'), kind: 'miss', title: t('Couldn’t change that routine'), lines: steps.map((x) => x.line) };
  // the routine with the changes that are ticked (all of them, unless the preview's ticks left some out)
  const build = (off: number[]) => {
    let x: Step = { name: r.name, items: [...r.items] };
    steps.forEach((p, i) => { if (p.run && !off.includes(i + 1)) x = p.run(x); });
    return { ...r, name: x.name, items: x.items, updatedAt: Date.now() };
  };
  const put = (next: typeof r) => { useStore.getState().upsertRoutine(next); return () => useStore.getState().upsertRoutine(r); };
  // (a preview names the routine as it is now: the rename is one of its changes, and may be left out)
  const head = { text: r.name };
  // a rewrite (three or more changes) is a preview: each change has a tick, and Apply does only the ticked ones
  if (real >= 3) {
    const card: AgentResult = preview({
      id: uid('r'), kind: 'routine', title: t('Change {name}?', { name: r.name }), key: `routine:${r.id}`, off: [],
      lines: [head, ...steps.map((x) => (x.run ? { ...x.line, pick: true } : x.line))],
    }, t('Apply'), () => {
      const off = card.off ?? [];
      const left = off.filter((i) => steps[i - 1]?.run).length;
      if (left) card.doneSubtitle = t('{n} of {m} changes applied', { n: real - left, m: real });
      return put(build(off));
    });
    return card;
  }
  return { id: uid('r'), kind: 'routine', title: t('Routine updated'), lines: [{ text: a.rename ?? r.name }, ...steps.map((x) => x.line)], undo: put(build([])) };
}

/** "Make a copy of Push": the same exercises, sets and rests under a new name (its own ids, so the two never share an edit). */
function doDuplicateRoutine(a: Extract<AgentAction, { type: 'duplicate_routine' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const st = useStore.getState();
  const r = findRoutine(a.routine);
  if (!r) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that routine'), lines: [{ text: a.routine, sub: st.routines.filter((x) => !x.oneOff).map((x) => x.name).join(' · ').slice(0, 120), warn: true }] };
  const base = a.rename?.trim() || t('{name} copy', { name: r.name });
  const taken = new Set(st.routines.map((x) => fold(x.name)));
  let name = base;
  for (let i = 2; taken.has(fold(name)) && i < 50; i++) name = `${base} ${i}`;
  const now = Date.now();
  const copy = { ...r, id: uid('r'), name, oneOff: undefined, items: r.items.map((i) => ({ ...i, id: uid('ri') })), createdAt: now, updatedAt: now };
  st.upsertRoutine(copy);
  return {
    id: uid('r'), kind: 'routine', title: t('Routine duplicated'),
    lines: [{ text: name, sub: `${copy.items.length} ${t('exercises')} · ${copy.items.reduce((n, i) => n + i.workingSets, 0)} ${t('sets')}` }],
    button: { label: t('Open'), run: () => useUI.getState().push('routine', { id: copy.id }) },
    undo: () => useStore.getState().deleteRoutine(copy.id),
  };
}

/** A small chart in the chat: the model picks the metric, the numbers are the app's own (agentCharts.ts). */
function doShowChart(a: Extract<AgentAction, { type: 'show_chart' }>, ctx: AgentCtx): AgentResult {
  const b = buildChart(a.metric, { exercise: a.exercise, weeks: a.weeks, today: ctx.today, lang: ctx.lang, t: ctx.t });
  if ('miss' in b) return { id: uid('r'), kind: 'miss', title: b.miss, lines: [] };
  return { id: uid('r'), kind: 'chart', title: b.title, subtitle: b.subtitle, lines: [], chart: b.chart };
}

function doDeleteRoutine(a: Extract<AgentAction, { type: 'delete_routine' }>, ctx: AgentCtx): AgentResult {
  const r = findRoutine(a.routine);
  if (!r) return { id: uid('r'), kind: 'miss', title: ctx.t('Couldn’t find that routine'), lines: [{ text: a.routine, warn: true }] };
  return preview({ id: uid('r'), kind: 'routine', title: ctx.t('Delete {name}?', { name: r.name }), key: `delroutine:${r.id}`, lines: [{ text: r.name, sub: `${r.items.length} ${ctx.t('exercises')}` }, { text: ctx.t('Past workouts stay in your history') }] }, ctx.t('Delete'), () => {
    const st = useStore.getState(); const sch = st.schedule;
    st.deleteRoutine(r.id);
    return () => { const s = useStore.getState(); s.restoreRoutine(r); s.setSchedule(sch); };
  });
}

function doDeleteWorkout(a: Extract<AgentAction, { type: 'delete_workout' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const done = useStore.getState().sessions.filter((s) => s.status === 'done');
  const w = a.workout ? fold(a.workout) : '';
  const ses = !w || w === 'last' ? done[done.length - 1] : [...done].reverse().find((s) => s.date === a.workout || fold(s.name).includes(w));
  if (!ses) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that workout'), lines: a.workout ? [{ text: a.workout, warn: true }] : [] };
  const sets = ses.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
  return preview({ id: uid('r'), kind: 'workout', title: t('Delete this workout?'), key: `delworkout:${ses.id}`, lines: [{ text: ses.name || t('Workout'), sub: `${ses.date} · ${ses.exercises.length} ${t('exercises')} · ${sets} ${t('sets')}` }] }, t('Delete'), () => {
    useStore.getState().deleteSession(ses.id);
    return () => useStore.getState().restoreSession(ses);
  });
}

function doDiscardWorkout(ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const st = useStore.getState();
  if (!st.active) return { id: uid('r'), kind: 'miss', title: t('No workout is running'), lines: [] };
  const done = st.active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  return {
    id: uid('r'), kind: 'workout', pending: true, title: t('Discard this workout?'), lines: [{ text: st.active.name || t('Workout'), sub: t(done === 1 ? '1 set done' : '{n} sets done', { n: done }) }],
    button: { label: t('Discard'), run: () => { useStore.getState().discardActive(); } },
  };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Moves a planned workout to another weekday: from now on (the weekly plan), or just this once (this week). */
function doMoveWorkout(a: Extract<AgentAction, { type: 'move_workout' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const st = useStore.getState();
  const prev = st.schedule;
  const weekly = prev.weekly;
  // which routine: named, or the one planned on from_weekday
  let r = a.routine ? findRoutine(a.routine) : null;
  if (a.routine && !r) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that routine'), lines: [{ text: a.routine, sub: st.routines.map((x) => x.name).join(' · ').slice(0, 120), warn: true }] };
  if (!r && a.from_weekday != null) r = st.routines.find((x) => x.id === weekly[a.from_weekday!]) ?? null;
  if (!r) return { id: uid('r'), kind: 'miss', title: t('Which workout should move?'), lines: [] };
  const from = a.from_weekday ?? (Object.entries(weekly).find(([, id]) => id === r!.id)?.[0] !== undefined ? Number(Object.entries(weekly).find(([, id]) => id === r!.id)![0]) : null);
  if (a.once) {
    // this week: the next date that falls on each weekday, counted from today
    const today = ctx.today;
    const dateOf = (wd: number) => { for (let k = 0; k < 7; k++) { const d = addDays(today, k); if (new Date(d + 'T12:00:00').getDay() === wd) return d; } return today; };
    const to = dateOf(a.to_weekday);
    const origin = from != null ? dateOf(from) : to;
    st.rescheduleMissed(origin, r.id, to);
    return { id: uid('r'), kind: 'routine', title: t('Moved for this week'), lines: [{ text: r.name, sub: `${from != null ? `${t(WEEKDAYS[from])} → ` : ''}${t(WEEKDAYS[a.to_weekday])}` }], undo: () => useStore.getState().setSchedule(prev) };
  }
  const next = { ...weekly };
  if (from != null && next[from] === r.id) next[from] = null;
  next[a.to_weekday] = r.id;
  st.setSchedule({ mode: 'weekly', weekly: next });
  return { id: uid('r'), kind: 'routine', title: t('Plan updated'), lines: [{ text: r.name, sub: `${from != null ? `${t(WEEKDAYS[from])} → ` : ''}${t(WEEKDAYS[a.to_weekday])}` }], undo: () => useStore.getState().setSchedule(prev) };
}

/** Wrestling (or another activity) on a weekday of the plan, beside the gym. */
function doPlanActivity(a: Extract<AgentAction, { type: 'plan_activity' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const st = useStore.getState();
  const prev = st.schedule;
  const acts = { ...(prev.activities ?? {}) };
  const list = new Set(acts[a.weekday] ?? []);
  if (a.on) list.add(a.kind); else list.delete(a.kind);
  if (list.size) acts[a.weekday] = [...list]; else delete acts[a.weekday];
  st.setSchedule({ activities: acts });
  return { id: uid('r'), kind: 'routine', title: a.on ? t('Added to your plan') : t('Taken off your plan'), lines: [{ text: t(ACTIVITY_LABEL[a.kind]), sub: t(WEEKDAYS[a.weekday]) }], undo: () => useStore.getState().setSchedule(prev) };
}

/** The weight and reps an exercise was last done with (this workout first, then the latest session): what a misheard number
 *  is checked against, and what "same again" copies. */
function lastDoneOf(exerciseId: string, skipSetId?: string): SetRecord | undefined {
  const st = useStore.getState();
  let best: SetRecord | undefined;
  for (const se of st.active?.exercises ?? []) if (se.exerciseId === exerciseId) for (const x of se.sets) if (x.done && x.type === 'working' && x.id !== skipSetId && (!best || (x.completedAt ?? 0) > (best.completedAt ?? 0))) best = x;
  if (best) return best;
  for (let i = st.sessions.length - 1; i >= 0; i--) {
    const sets = st.sessions[i].exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets).filter((x) => x.done && x.type === 'working');
    if (sets.length) return sets.reduce((a, b) => ((b.weightKg ?? 0) > (a.weightKg ?? 0) ? b : a));
  }
  return undefined;
}

/** "heard 18 → logged 80", for the card. */
const heardText = (heard: { kg?: number; reps?: number } | undefined, logged: { kg?: number; reps?: number }, ctx: AgentCtx, unit: 'kg' | 'lb') =>
  !heard ? '' : [heard.kg !== undefined ? ctx.t('heard {a} → logged {b}', { a: `${fmtNum(kgToDisplay(heard.kg, unit), ctx.lang, 2)} ${unit}`, b: `${fmtNum(kgToDisplay(logged.kg ?? 0, unit), ctx.lang, 2)} ${unit}` }) : '', heard.reps !== undefined ? ctx.t('heard {a} → logged {b}', { a: `${heard.reps} ${ctx.t('reps')}`, b: `${logged.reps} ${ctx.t('reps')}` }) : ''].filter(Boolean).join(' · ');

/** In a workout, "only 9 reps" / "67 kilos, same reps": the set you're on (ticked, with the rest started) — or the one
 * you just finished ("the last one was 7"). Unsaid numbers stay as the set already shows them. The set you're on is the
 * one on screen (`currentSetOf`: the Focus page, a superset partner's turn, where you are); unticked warm-ups are passed
 * over unless a warm-up is said. Past the last planned set, one more is added. */
function doCurrentSet(a: Extract<AgentAction, { type: 'log_current_set' }>, ctx: AgentCtx, again = false): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const act = st.active;
  if (!act) return { id: uid('r'), kind: 'miss', title: t('No workout is running'), lines: [] };
  const w = st.settings.units.weight;
  const show = (s: Pick<SetRecord, 'weightKg' | 'reps' | 'durationSec'>) => s.durationSec && !s.reps ? `${s.durationSec}s` : `${s.weightKg ? `${fmtNum(kgToDisplay(s.weightKg, w), lang, 2)} ${w} × ` : ''}${s.reps ?? '—'}`;
  const exOf = (id: string) => allExercises(st.exercises).find((e) => e.id === id);
  const latest = () => { let hit: { se: SessionExercise; set: SetRecord } | null = null; for (const se of useStore.getState().active?.exercises ?? []) for (const x of se.sets) if (x.done && (!hit || (x.completedAt ?? 0) >= (hit.set.completedAt ?? 0))) hit = { se, set: x }; return hit as { se: SessionExercise; set: SetRecord } | null; };
  let hit: { se: SessionExercise; set: SetRecord } | null = null;
  let extra = false;
  if (a.which === 'last') {
    hit = latest();
    if (!hit) return { id: uid('r'), kind: 'miss', title: t('No finished set yet'), lines: [] };
  } else {
    const cur = currentSetOf(act, a.warmup ? 'only' : 'skip');
    // "skip it" / "skip this set": the planned set is taken out and the next one is up (Undo puts it back)
    if (a.skip) {
      if (!cur) return { id: uid('r'), kind: 'miss', title: t('Every set is done'), lines: [] };
      const ex = exOf(cur.se.exerciseId);
      const { restore } = deleteSet(cur.se.id, cur.set.id);
      return { id: uid('r'), kind: 'sets', title: t('Set skipped'), lines: [{ text: ex ? exLabel(ex, lang) : '', sub: `${t('Set')} ${cur.label}` }], undo: restore };
    }
    if (cur) hit = { se: cur.se, set: cur.set };
    else {
      // every planned set is done: one more of the exercise you were on
      const last = latest();
      if (!last || a.warmup) return { id: uid('r'), kind: 'miss', title: t('Every set is done'), lines: [] };
      addSet(last.se.id);
      const se = useStore.getState().active!.exercises.find((e) => e.id === last.se.id)!;
      hit = { se, set: se.sets[se.sets.length - 1] };
      extra = true;
    }
  }
  const { se, set } = hit;
  // "same again": the numbers of the last set done of this exercise
  const same = a.same ? lastDoneOf(se.exerciseId, set.id) : undefined;
  const planned = { kg: set.weightKg ?? set.target?.weightKg ?? lastDoneOf(se.exerciseId, set.id)?.weightKg, reps: set.target?.repMax ?? set.reps };
  // a number speech got wrong (18 for 80) is fixed, and the card says so; anything else is logged as said
  const fixed = fixMisheard({ kg: a.kg ?? undefined, reps: a.reps ?? undefined }, planned);
  const over = {
    ...(same ? { weightKg: same.weightKg, reps: same.reps, durationSec: same.durationSec } : {}),
    ...(fixed.kg !== undefined ? { weightKg: fixed.kg } : {}), ...(fixed.reps !== undefined ? { reps: fixed.reps } : {}),
    ...(a.durationSec != null ? { durationSec: a.durationSec } : {}),
  };
  // the same set said twice (a repeated message, a retry): logged once
  const prevDone = latest();
  if (a.which === 'current' && !again && prevDone && Date.now() - (prevDone.set.completedAt ?? 0) < 20000 && prevDone.se.exerciseId === se.exerciseId
    && (over.weightKg === undefined || over.weightKg === prevDone.set.weightKg) && over.reps !== undefined && over.reps === prevDone.set.reps && !a.same) {
    if (extra) useStore.getState().mutateActive((x) => ({ ...x, exercises: x.exercises.map((b) => (b.id === se.id ? { ...b, sets: b.sets.filter((q) => q.id !== set.id) } : b)) }));
    const ex = exOf(se.exerciseId);
    return {
      id: uid('r'), kind: 'sets', pending: true, offer: true, title: t('Already logged'), lines: [{ text: ex ? exLabel(ex, lang) : '', sub: show(prevDone.set) }],
      doneTitle: t('Set logged'),
      button: { label: t('Log again'), run: () => { doCurrentSet(a, ctx, true); } },
    };
  }
  const restBefore = useStore.getState().active?.rest ?? null;
  let next: SetRecord;
  if (a.which === 'current') {
    // ticked exactly as a tap ticks it: records, the haptic, the rest and the row's moment
    if (!completeSet(se.id, set.id, over)) {
      if (extra) useStore.getState().mutateActive((x) => ({ ...x, exercises: x.exercises.map((b) => (b.id === se.id ? { ...b, sets: b.sets.filter((q) => q.id !== set.id) } : b)) }));
      return { id: uid('r'), kind: 'miss', title: t('Enter reps first'), lines: [] };
    }
    next = useStore.getState().active!.exercises.find((b) => b.id === se.id)!.sets.find((q) => q.id === set.id)!;
  } else {
    next = { ...set, weightKg: over.weightKg ?? set.weightKg ?? set.target?.weightKg, reps: over.reps ?? set.reps ?? set.target?.repMax, ...(over.durationSec !== undefined ? { durationSec: over.durationSec } : {}) };
    st.mutateActive((x) => ({ ...x, exercises: x.exercises.map((b) => (b.id === se.id ? { ...b, sets: b.sets.map((q) => (q.id === set.id ? next : q)) } : b)) }));
  }
  const restAfter = useStore.getState().active?.rest ?? null;
  const ex = exOf(se.exerciseId);
  const seNow = useStore.getState().active!.exercises.find((b) => b.id === se.id)!;
  const n = seNow.sets.findIndex((q) => q.id === set.id) + 1;
  const label = set.type === 'warmup' ? t('Warm-up') : `${t('Set')} ${seNow.sets.slice(0, n).filter((q) => q.type === 'working').length}`;
  const heard = heardText(fixed.heard, { kg: next.weightKg, reps: next.reps }, ctx, w);
  // Undo takes back this set only (later sets stay), and the rest only if this set started it
  const undo = () => {
    const s2 = useStore.getState();
    if (!s2.active) return;
    s2.mutateActive((x) => ({
      ...x,
      rest: restAfter && x.rest && x.rest.endsAt === restAfter.endsAt && restAfter !== restBefore ? restBefore : x.rest,
      exercises: x.exercises.map((b) => (b.id === se.id ? { ...b, sets: extra ? b.sets.filter((q) => q.id !== set.id) : b.sets.map((q) => (q.id === set.id ? set : q)) } : b)),
    }));
  };
  const res: AgentResult = {
    id: uid('r'), kind: 'sets', title: a.which === 'last' ? t('Set corrected') : t('Set logged'),
    lines: [{ text: ex ? exLabel(ex, lang) : '', sub: `${label} · ${a.which === 'last' ? `${show(set)} → ` : ''}${show(next)}` }, ...(heard ? [{ text: heard, warn: true }] : [])],
    undo,
  };
  // "heard 18 kg → logged 80 kg": one tap puts back what was heard, another the fix (the card says which it is now)
  if (fixed.heard) {
    const fix = { weightKg: next.weightKg, reps: next.reps };
    const said = { ...fix, ...(fixed.heard.kg !== undefined ? { weightKg: fixed.heard.kg } : {}), ...(fixed.heard.reps !== undefined ? { reps: fixed.heard.reps } : {}) };
    const word = (v: { weightKg?: number; reps?: number }) => (fixed.heard!.kg !== undefined ? `${fmtNum(kgToDisplay(v.weightKg ?? 0, w), lang, 2)} ${w}` : `${v.reps}`);
    let asHeard = false;
    const chip = { label: t('Use {n}', { n: word(said) }), warn: true, run: () => {} };
    chip.run = () => {
      asHeard = !asHeard;
      const v = asHeard ? said : fix;
      useStore.getState().mutateActive((x) => ({ ...x, exercises: x.exercises.map((b) => (b.id === se.id ? { ...b, sets: b.sets.map((q) => (q.id === set.id ? { ...q, ...v } : q)) } : b)) }));
      res.lines = [{ ...res.lines[0], sub: `${label} · ${show({ ...next, ...v })}` }, { text: asHeard ? t('logged as heard: {a}', { a: word(said) }) : heard, warn: !asHeard }];
      chip.label = t('Use {n}', { n: word(asHeard ? fix : said) });
    };
    res.more = [chip];
  }
  return res;
}

function doSchedule(a: Extract<AgentAction, { type: 'set_schedule' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const st = useStore.getState();
  const r = a.routine ? findRoutine(a.routine) : null;
  if (a.routine && !r) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that routine'), lines: [{ text: a.routine, sub: st.routines.map((x) => x.name).join(' · ').slice(0, 120), warn: true }] };
  const prev = st.schedule;
  st.setSchedule({ mode: 'weekly', weekly: { ...prev.weekly, [a.weekday]: r?.id ?? null } });
  return { id: uid('r'), kind: 'routine', title: t('Plan updated'), lines: [{ text: t(WEEKDAYS[a.weekday]), sub: r ? r.name : t('Rest day') }], undo: () => useStore.getState().setSchedule(prev) };
}

function doDeleteActivity(a: Extract<AgentAction, { type: 'delete_activity' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const date = resolveDay(a.day, ctx.today);
  const k = a.kind ? fold(a.kind) : '';
  const list = useStore.getState().activities.filter((x) => (!date || x.date === date) && (!k || fold(x.kind).includes(k) || fold(t(ACTIVITY_LABEL[x.kind])).includes(k)));
  // (the newest by day, whatever the list's order)
  const act = [...list].sort((x, y) => x.date.localeCompare(y.date) || (x.startAt ?? x.at) - (y.startAt ?? y.at))[list.length - 1];
  if (!act) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that activity'), lines: a.kind ? [{ text: a.kind, warn: true }] : [] };
  useStore.getState().removeActivity(act.id);
  return { id: uid('r'), kind: 'activity', title: t('Activity removed'), lines: [{ text: t(ACTIVITY_LABEL[act.kind]), sub: `${act.date} · ${Math.round(act.durationSec / 60)} min` }], undo: () => useStore.getState().restoreActivity(act) };
}

function doDeleteWeight(a: Extract<AgentAction, { type: 'delete_weight' }>, ctx: AgentCtx): AgentResult {
  const st = useStore.getState();
  const date = resolveDay(a.day, ctx.today);
  const list = [...st.weights].sort((x, y) => x.at - y.at).filter((w) => !date || w.date === date);
  const w = list[list.length - 1];
  if (!w) return { id: uid('r'), kind: 'miss', title: ctx.t('Couldn’t find that weigh-in'), lines: [] };
  st.removeWeight(w.id);
  const u = st.settings.units.weight;
  return { id: uid('r'), kind: 'weight', title: ctx.t('Weigh-in removed'), lines: [{ text: `${fmtNum(kgToDisplay(w.kg, u), ctx.lang, 1)} ${u}`, sub: w.date }], undo: () => useStore.getState().restoreWeight(w) };
}

function doNote(a: Extract<AgentAction, { type: 'add_note' }>, ctx: AgentCtx): AgentResult {
  const st = useStore.getState();
  const date = resolveDay(a.day, ctx.today) ?? ctx.date ?? ctx.today;
  const prev = st.notes.find((n) => n.date === date) ?? {} as { training?: string; nutrition?: string };
  const old = prev[a.kind];
  st.setNote(date, { [a.kind]: old ? `${old}\n${a.text}` : a.text });
  return { id: uid('r'), kind: 'workout', title: ctx.t('Note added'), lines: [{ text: a.text, sub: `${a.kind === 'nutrition' ? ctx.t('Food') : ctx.t('Training')} · ${dayLabel(date, ctx)}` }], undo: () => useStore.getState().setNote(date, { [a.kind]: old ?? '' }) };
}

// ── memory: what the Coach keeps about you ──
/** Two notes say the same thing when one contains the other (after folding case and accents) — then the newer wording wins. */
const sameNote = (a: string, b: string) => { const x = fold(a).replace(/[^a-z0-9æøå ]/g, ''), y = fold(b).replace(/[^a-z0-9æøå ]/g, ''); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
const openMemory = () => useUI.getState().push('settings', { section: 'memory' });
/** The note that shares most of the words of `q` (at least half of its longer words), for "forget the leg day thing". */
function closestNote(list: MemoryNote[], q: string): MemoryNote | undefined {
  const words = (x: string) => fold(x).split(/[^a-z0-9æøå]+/).filter((w) => w.length >= 3);
  const want = words(q); if (!want.length) return undefined;
  let best: MemoryNote | undefined, top = 0;
  for (const m of list) { const have = new Set(words(m.text)); const share = want.filter((w) => have.has(w)).length / want.length; if (share > top) { top = share; best = m; } }
  return top >= 0.5 ? best : undefined;
}

function doRemember(a: Extract<AgentAction, { type: 'remember' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const ex = a.exercise ? findExercise(a.exercise, lang) : undefined;
  // a temporary thing ends on its own (a date in the past or years away is not one)
  const until = a.until && a.until >= ctx.today && a.until <= addDays(ctx.today, 366) ? a.until : undefined;
  const fields = { text: a.text, kind: a.kind, ...(ex ? { exerciseIds: [ex.id] } : {}) };
  const more = { label: t('See all'), run: openMemory };
  const untilSub = until ? t('until {date}', { date: fmtDate(until, lang, { weekday: 'short', day: 'numeric', month: 'short' }) }) : undefined;
  // the newer fact replaces the older one: the note the Coach named (its MEMORY number), else the same note said again
  const seen = a.replaces ? (ctx.memAtStart ?? st.memory)[a.replaces - 1] : undefined;
  const old = (seen && st.memory.find((m) => m.id === seen.id)) || st.memory.find((m) => sameNote(m.text, a.text));
  if (old) {
    const before = { ...old };
    const same = fold(old.text) === fold(a.text);
    const was = same ? old.was : [{ text: old.text, at: old.updatedAt ?? old.at }, ...(old.was ?? [])].slice(0, 3);
    // (an exercise or end date the new wording doesn't carry goes with the old one)
    st.updateMemory(old.id, { ...fields, exerciseIds: ex ? [ex.id] : undefined, until, updatedAt: Date.now(), was });
    return { id: uid('r'), kind: 'memory', title: t('Memory updated'), was: same ? undefined : old.text, lines: [{ text: a.text, sub: untilSub ?? (ex ? exLabel(ex, lang) : undefined) }], button: more, undo: () => useStore.getState().updateMemory(before.id, { ...before, until: before.until, updatedAt: before.updatedAt, was: before.was, exerciseIds: before.exerciseIds }) };
  }
  // full: a temporary note that has ended makes room first (its time is over), else the Coach says so
  if (st.memory.length >= MEMORY_MAX) {
    // (a health note always fits: it is what keeps a cut away from someone it could hurt; the oldest other note makes room)
    const ended = st.memory.filter((m) => m.until && m.until < ctx.today).sort((x, y) => x.until!.localeCompare(y.until!))[0]
      ?? (a.kind === 'health' ? st.memory.filter((m) => m.kind !== 'health').sort((x, y) => (x.updatedAt ?? x.at) - (y.updatedAt ?? y.at))[0] : undefined);
    if (!ended) return { id: uid('r'), kind: 'miss', title: t('Memory is full'), lines: [{ text: a.text, sub: t('Remove something in Settings → Coach memory first'), warn: true }], button: more };
    st.removeMemory(ended.id);
  }
  const note = st.addMemory({ ...fields, ...(until ? { until } : {}) });
  return { id: uid('r'), kind: 'memory', title: t('Remembered'), lines: [{ text: note.text, sub: untilSub ?? (ex ? exLabel(ex, lang) : undefined) }], button: more, undo: () => useStore.getState().removeMemory(note.id) };
}

function doForget(a: Extract<AgentAction, { type: 'forget' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const st = useStore.getState();
  // the number the Coach saw in its MEMORY list (1-based, oldest first), or the words of the note
  const seen = a.memory ? (ctx.memAtStart ?? st.memory)[a.memory - 1] : undefined;
  const byNum = seen && st.memory.some((m) => m.id === seen.id) ? seen : undefined;
  const hit: MemoryNote | undefined = byNum ?? (a.target ? st.memory.find((m) => sameNote(m.text, a.target!)) ?? closestNote(st.memory, a.target) : undefined);
  if (!hit) return { id: uid('r'), kind: 'miss', title: t('Nothing like that in memory'), lines: a.target ? [{ text: a.target, warn: true }] : [], button: { label: t('See all'), run: openMemory } };
  st.removeMemory(hit.id);
  return { id: uid('r'), kind: 'memory', title: t('Forgotten'), lines: [{ text: hit.text }], undo: () => useStore.getState().restoreMemory(hit) };
}

/**
 * "Chest and triceps with some shoulder tomorrow": the day's workout from their own exercises, as a preview. Apply puts it
 * in the plan for that date (a routine of its own, placed as a one-off: the weekly plan is untouched), with Undo.
 */
function doPlanDay(a: Extract<AgentAction, { type: 'plan_day' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const date = a.day === 'tomorrow' ? addDays(ctx.today, 1) : resolveDay(a.day, ctx.today);
  if (!date) return { id: uid('r'), kind: 'miss', title: t('Which day?'), lines: [] };
  const pool = allExercises(st.exercises);
  // the exercises: the ones the Coach chose (from their history), else the app picks for the muscles named
  let chosen: (Exercise & { sets?: number | null; repMin?: number | null; repMax?: number | null; restSec?: number | null })[] = [];
  const missing: string[] = [];
  if (a.items.length) {
    for (const b of a.items) { const ex = findExercise(b.exercise, lang); if (ex && !chosen.some((c) => c.id === ex.id)) chosen.push({ ...ex, sets: b.sets, repMin: b.repMin, repMax: b.repMax, restSec: b.restSec }); else if (!ex) missing.push(b.exercise); }
  } else {
    const light = new Set(a.light.map(muscleOf).filter(Boolean));
    const focus = [...new Set([...a.focus, ...a.light].map(muscleOf).filter(Boolean) as MuscleGroup[])].map((m) => ({ muscle: m, light: light.has(m) }));
    chosen = pickForMuscles(focus, st, pool);
  }
  if (!chosen.length) return { id: uid('r'), kind: 'miss', title: t('Couldn’t build that workout'), lines: missing.map((n) => ({ text: n, sub: t('Not in your exercise library'), warn: true })) };
  const plan = buildDayPlan(chosen, date, st);
  const muscles = [...new Set(plan.picks.map((p) => p.ex.muscles[0]))];
  const name = a.name || muscles.slice(0, 3).map((m) => t(MUSCLE_LABEL[m])).join(' + ');
  const when = date === ctx.today ? t('Today') : date === addDays(ctx.today, 1) ? t('Tomorrow') : `${t(WEEKDAYS[weekdayOf(date)])} ${date.slice(8)}/${date.slice(5, 7)}`;
  const was = (() => { const ov = st.schedule.overrides.find((o) => o.date === date); const id = ov?.routineId ?? (st.schedule.mode === 'weekly' && !st.schedule.cleared.includes(date) ? st.schedule.weekly[weekdayOf(date)] : null); return id ? st.routines.find((r) => r.id === id) : undefined; })();
  const lines: AgentResult['lines'] = plan.picks.map((p) => ({ text: exLabel(p.ex, lang), sub: `${p.sets} × ${p.repMin === p.repMax ? p.repMin : `${p.repMin}–${p.repMax}`}${p.target ? ` · ${p.target}` : ''}`, warn: !!p.flagged }));
  plan.picks.filter((p) => p.flagged).forEach((p) => lines.push({ text: exLabel(p.ex, lang), sub: `${t('You told me')}: ${p.flagged}`, warn: true }));
  if (plan.warnings.includes('wrestling-next-day')) lines.push({ text: t('Wrestling the next day'), sub: t('A lot of leg work the day before — keep it lighter?'), warn: true });
  if (plan.warnings.includes('wrestled-day-before')) lines.push({ text: t('Wrestling the day before'), sub: t('Your legs may still be tired from the mat — keep the leg work lighter?'), warn: true });
  missing.forEach((n) => lines.push({ text: n, sub: t('Not in your exercise library'), warn: true }));
  const result: AgentResult = {
    id: uid('r'), kind: 'routine', pending: true, offer: true, key: `plan:${date}`,
    title: `${when}: ${name}`,
    subtitle: [`${plan.picks.length} ${t('exercises')} · ${plan.picks.reduce((n, p) => n + p.sets, 0)} ${t('sets')}`, was ? `${t('instead of')} ${was.name}` : ''].filter(Boolean).join(' · '),
    lines,
    button: {
      label: t('Apply'),
      run: () => {
        const s = useStore.getState();
        const prevSchedule = s.schedule;
        const now = Date.now();
        const items: RoutineItem[] = plan.picks.map((p) => ({ id: uid('ri'), exerciseId: p.ex.id, warmupSets: 0, workingSets: p.sets, repMin: p.repMin, repMax: p.repMax, restSec: p.restSec }));
        const routine = { id: uid('rt'), name, items, note: t('Planned by the Coach for {date}', { date }), oneOff: date, createdAt: now, updatedAt: now };
        s.upsertRoutine(routine);
        s.setSchedule({ overrides: [...s.schedule.overrides.filter((o) => o.date !== date), { date, routineId: routine.id }], cleared: s.schedule.cleared.filter((c) => c !== date) });
        // kept or taken back: the Coach learns which exercises he doesn't want planned (lib/ledger.ts)
        const exercises = items.map((i) => i.exerciseId);
        const unkeep = noteEvent({ k: 'plan', ok: true, exercises });
        result.undo = () => { const u = useStore.getState(); u.deleteRoutine(routine.id); u.patch({ schedule: prevSchedule }); unkeep(); noteEvent({ k: 'plan', ok: false, exercises }); };
      },
    },
  };
  return result;
}

// ── meals, saved meals, water, own exercises, measurements ──

function doEditMeals(a: Extract<AgentAction, { type: 'edit_meals' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const before = st.settings.meals;
  let meals = before.map((m) => ({ ...m }));
  const lines: AgentResult['lines'] = [];
  const find = (w: string) => { const id = mealIdOf(w, ctx); return meals.find((m) => m.id === id); };
  if (a.meal && a.rename) { const m = find(a.meal); if (m) { lines.push({ text: mealName(m, lang), sub: `→ ${a.rename}` }); m.name = a.rename; } else lines.push({ text: a.meal, sub: t('No meal with that name'), warn: true }); }
  if (a.add && !meals.some((m) => fold(mealName(m, lang)) === fold(a.add!))) { meals.push({ id: uid('meal'), name: a.add }); lines.push({ text: a.add, sub: t('added') }); }
  for (const w of a.remove ?? []) {
    const m = find(w);
    if (!m) { lines.push({ text: w, sub: t('No meal with that name'), warn: true }); continue; }
    if (st.entries.some((e) => e.mealId === m.id)) { lines.push({ text: mealName(m, lang), sub: t('Has food logged in it, so it stays'), warn: true }); continue; }
    if (meals.length <= 1) continue;
    meals = meals.filter((x) => x !== m); lines.push({ text: mealName(m, lang), sub: t('removed') });
  }
  if (a.order?.length) {
    const picked = a.order.map((w) => find(w)).filter(Boolean) as Meal[];
    if (picked.length) { meals = [...new Set([...picked, ...meals])]; lines.push({ text: t('Order'), sub: meals.map((m) => mealName(m, lang)).join(' · ') }); }
  }
  if (!lines.some((l) => !l.warn)) return { id: uid('r'), kind: 'miss', title: t('Couldn’t change the meals'), lines };
  st.setMeals(meals);
  return { id: uid('r'), kind: 'setting', title: t('Meals updated'), lines, undo: () => useStore.getState().setMeals(before) };
}

function doLogSavedMeal(a: Extract<AgentAction, { type: 'log_saved_meal' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const st = useStore.getState();
  const w = fold(a.name);
  const m = st.savedMeals.find((x) => fold(x.name) === w) ?? st.savedMeals.find((x) => fold(x.name).includes(w) || w.includes(fold(x.name)));
  if (!m) return { id: uid('r'), kind: 'miss', title: t('No saved meal with that name'), lines: [{ text: a.name, sub: st.savedMeals.map((x) => x.name).join(' · ').slice(0, 120), warn: true }] };
  const date = resolveDay(a.day, ctx.today) ?? ctx.date ?? ctx.today;
  const mealId = mealIdOf(a.meal, ctx) ?? ctx.mealId ?? defaultMealId(st.settings.meals);
  const entries = m.items.map((it) => entryFromSnapshot(it.snap, it.qty, date, mealId, { id: uid('e') })).filter(Boolean) as FoodEntry[];
  const added = st.logEntries(entries);
  const total = added.reduce((n, e) => n + (e.nutrients.kcal ?? 0), 0);
  return {
    id: uid('r'), kind: 'food', title: t('Logged to {meal}', { meal: mealLabelOf(mealId, ctx) }) + (date !== ctx.today ? ` · ${dayLabel(date, ctx)}` : ''),
    lines: [...added.map((e) => ({ text: e.snap.name, sub: kcalStr(e), ref: e.id })), { text: m.name, sub: `${Math.round(total)} kcal` }],
    undo: () => added.forEach((e) => useStore.getState().removeEntry(e.id)),
  };
}

function doDeleteWater(a: Extract<AgentAction, { type: 'delete_water' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const date = resolveDay(a.day, ctx.today) ?? ctx.today;
  const list = useStore.getState().water.filter((w) => w.date === date && (!a.ml || Math.abs(w.ml - a.ml) < 1));
  const w = list[list.length - 1];
  if (!w) return { id: uid('r'), kind: 'miss', title: t('No water to remove'), lines: [{ text: dayLabel(date, ctx) }] };
  useStore.getState().removeWater(w.id);
  return { id: uid('r'), kind: 'water', title: t('Water removed'), lines: [{ text: `${fmtNum(w.ml, lang, 0)} ml`, sub: dayLabel(date, ctx) }], undo: () => useStore.getState().patch((s) => ({ water: [...s.water, w] })) };
}

function doCreateExercise(a: Extract<AgentAction, { type: 'create_exercise' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const same = allExercises(st.exercises).find((e) => fold(e.name) === fold(a.name));
  if (same) return { id: uid('r'), kind: 'miss', title: t('That exercise already exists'), lines: [{ text: exLabel(same, lang) }] };
  const ex: Exercise = { id: uid('ex'), name: a.name, muscles: a.muscles, equipment: [a.equipment], movement: 'isolation', logType: a.logType, instructions: [], custom: true };
  st.upsertExercise(ex);
  return {
    id: uid('r'), kind: 'workout', title: t('Exercise created'),
    lines: [{ text: a.name, sub: [...a.muscles.map((m) => t(MUSCLE_LABEL[m])), t(EQUIP_LABEL[a.equipment])].join(' · ') }],
    undo: () => useStore.getState().patch((s) => ({ exercises: s.exercises.filter((e) => e.id !== ex.id) })),
  };
}

function doArchiveExercise(a: Extract<AgentAction, { type: 'archive_exercise' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const c = matchExercises(a.exercise, st.exercises, lang, 2);
  const ex = c.length && c[0].score >= 0.6 ? c[0].ex : undefined;
  if (!ex) return { id: uid('r'), kind: 'miss', title: t('Only your own exercises can be hidden'), lines: [{ text: a.exercise, warn: true }] };
  const before = ex;
  st.upsertExercise({ ...ex, archived: a.on });
  return { id: uid('r'), kind: 'workout', title: a.on ? t('Exercise hidden') : t('Exercise back'), lines: [{ text: exLabel(ex, lang) }], undo: () => useStore.getState().upsertExercise(before) };
}

function doSetIncrement(a: Extract<AgentAction, { type: 'set_increment' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const ex = findExercise(a.exercise, lang);
  if (!ex) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that exercise'), lines: [{ text: a.exercise, warn: true }] };
  const before = st.increments[ex.id];
  st.setIncrement(ex.id, a.kg ?? undefined);
  return { id: uid('r'), kind: 'setting', title: t('Weight jump set'), lines: [{ text: exLabel(ex, lang), sub: a.kg ? `${fmtNum(a.kg, lang, 2)} kg` : t('Default') }], undo: () => useStore.getState().setIncrement(ex.id, before) };
}

function doMeasurement(a: Extract<AgentAction, { type: 'log_measurement' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const date = resolveDay(a.day, ctx.today) ?? ctx.today;
  const before = new Set(st.measurements.map((m) => m.id));
  st.addMeasurement({ date, kind: a.kind, cm: a.cm });
  const made = useStore.getState().measurements.find((m) => !before.has(m.id));
  return { id: uid('r'), kind: 'weight', title: t('Measurement logged'), lines: [{ text: t(MEASURE_LABEL[a.kind]), sub: `${fmtNum(a.cm, lang, 1)} cm · ${dayLabel(date, ctx)}` }], undo: () => { if (made) useStore.getState().removeMeasurement(made.id); } };
}

function doDeleteMeasurement(a: Extract<AgentAction, { type: 'delete_measurement' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const date = resolveDay(a.day, ctx.today);
  const list = useStore.getState().measurements.filter((m) => (!a.kind || m.kind === a.kind) && (!date || m.date === date));
  const m = list[list.length - 1];
  if (!m) return { id: uid('r'), kind: 'miss', title: t('No measurement to remove'), lines: [] };
  useStore.getState().removeMeasurement(m.id);
  return { id: uid('r'), kind: 'weight', title: t('Measurement removed'), lines: [{ text: t(MEASURE_LABEL[m.kind]), sub: `${fmtNum(m.cm, lang, 1)} cm · ${m.date}` }], undo: () => useStore.getState().patch((s) => ({ measurements: [...s.measurements, m] })) };
}
const MEASURE_LABEL: Record<MeasureKind, string> = { waist: 'Waist', chest: 'Chest', hips: 'Hips', arm: 'Arm', thigh: 'Thigh', neck: 'Neck' };

// ── the running workout: pause, rest timer, supersets, order, notes, name ──

function doWorkoutControl(a: Extract<AgentAction, { type: 'workout_control' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const act = st.active;
  if (!act) return { id: uid('r'), kind: 'miss', title: t('No workout is running'), lines: [] };
  const before = act;
  const back = () => useStore.getState().mutateActive(() => before);
  const ok = (title: string, lines: AgentResult['lines'] = [], undo: (() => void) | undefined = back): AgentResult => ({ id: uid('r'), kind: 'workout', title, lines, undo });
  const block = a.exercise ? findBlock(a.exercise, act, lang) : null;
  const cur = act.exercises.find((e) => e.sets.some((x) => !x.done)) ?? act.exercises[act.exercises.length - 1];
  const target = block?.block ?? cur;
  const exOf = (id?: string) => allExercises(st.exercises).find((e) => e.id === id);
  const name = target ? exLabel(exOf(target.exerciseId) ?? { name: '' }, lang) : '';
  if (a.exercise && !block && ['superset', 'move_up', 'move_down', 'note', 'rest_set'].includes(a.op)) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that exercise in the workout'), lines: [{ text: a.exercise, warn: true }] };
  switch (a.op) {
    case 'pause': if (act.pausedAt) return ok(t('Already paused'), [], undefined); st.pauseActive(); return ok(t('Workout paused'), [], () => useStore.getState().resumeActive());
    case 'resume': if (!act.pausedAt) return ok(t('Workout is running'), [], undefined); st.resumeActive(); return ok(t('Workout resumed'), [], () => useStore.getState().pauseActive());
    case 'rest_start': { const sec = Math.max(15, Math.abs(a.seconds ?? target?.restSec ?? st.settings.restDefaultSec)); startRest(sec, target?.exerciseId ?? ''); return ok(t('Rest started'), [{ text: fmtSec(sec) }]); }
    case 'rest_skip': if (!act.rest) return ok(t('No rest is running'), [], undefined); skipRest(); return ok(t('Rest skipped'));
    case 'rest_add': if (!act.rest) return ok(t('No rest is running'), [], undefined); adjustRest(a.seconds ?? 15); return ok((a.seconds ?? 15) < 0 ? t('Rest shortened') : t('Rest extended'), [{ text: `${(a.seconds ?? 15) > 0 ? '+' : '−'}${Math.abs(a.seconds ?? 15)} s` }]);
    case 'rest_set': { if (!target) return ok(t('No exercise'), [], undefined); const sec = Math.min(600, Math.max(15, Math.abs(a.seconds ?? 90))); patchExercise(target.id, { restSec: sec }); return ok(t('Rest changed'), [{ text: name, sub: fmtSec(sec) }]); }
    case 'superset': { if (!target) return ok(t('No exercise'), [], undefined); toggleSuperset(target.id); return ok(t('Superset changed'), [{ text: name }]); }
    case 'move_up': case 'move_down': { if (!target) return ok(t('No exercise'), [], undefined); moveExercise(target.id, a.op === 'move_up' ? -1 : 1); return ok(t('Order changed'), [{ text: name, sub: a.op === 'move_up' ? t('up') : t('down') }]); }
    case 'note': { if (!target || !a.text) return ok(t('No note'), [], undefined); patchExercise(target.id, { note: a.text }); return ok(t('Note added'), [{ text: name, sub: a.text }]); }
    case 'rename': { if (!a.text) return ok(t('No name'), [], undefined); st.mutateActive((x) => ({ ...x, name: a.text! })); return ok(t('Workout renamed'), [{ text: a.text }]); }
  }
}
const fmtSec = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

// ── the plan: a whole week at once, skipping a day ──

/** "Legs on Friday, wrestling Tuesday and Thursday, the rest rest days": the week as a preview; Apply sets it (weekly plan). */
function doSetSplit(a: Extract<AgentAction, { type: 'set_split' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const st = useStore.getState();
  const prev = st.schedule;
  const weekly: Record<number, string | null> = { ...(prev.mode === 'weekly' ? prev.weekly : {}) };
  const acts: Record<number, ActivityKind[]> = Object.fromEntries(Object.entries(prev.activities ?? {}).map(([k, v]) => [k, [...(v ?? [])]]));
  const missing: string[] = [];
  const changed = new Set<number>();
  for (const d of a.days) {
    if (d.routine !== undefined) {
      const r = d.routine ? findRoutine(d.routine) : null;
      if (d.routine && !r) { missing.push(d.routine); continue; }
      if ((weekly[d.weekday] ?? null) !== (r?.id ?? null)) changed.add(d.weekday);
      weekly[d.weekday] = r?.id ?? null;
    }
    if (d.wrestling !== null) {
      const has = (acts[d.weekday] ?? []).includes('wrestling');
      if (has !== d.wrestling) changed.add(d.weekday);
      acts[d.weekday] = d.wrestling ? [...new Set([...(acts[d.weekday] ?? []), 'wrestling' as ActivityKind])] : (acts[d.weekday] ?? []).filter((k) => k !== 'wrestling');
      if (!acts[d.weekday].length) delete acts[d.weekday];
    }
  }
  if (missing.length && !changed.size) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that routine'), lines: missing.map((n) => ({ text: n, sub: st.routines.map((x) => x.name).join(' · ').slice(0, 120), warn: true })) };
  const order = st.settings.weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const nameOf = (id: string | null | undefined) => (id ? st.routines.find((r) => r.id === id)?.name ?? null : null);
  const week = order.map((wd) => ({ label: t(WEEKDAYS[wd]).slice(0, 3), routine: nameOf(weekly[wd]), wrestling: (acts[wd] ?? []).includes('wrestling'), changed: changed.has(wd) }));
  const lines: AgentResult['lines'] = order.filter((wd) => changed.has(wd)).map((wd) => ({
    text: t(WEEKDAYS[wd]),
    sub: [nameOf(weekly[wd]) ?? t('Rest day'), (acts[wd] ?? []).includes('wrestling') ? t(ACTIVITY_LABEL.wrestling) : ''].filter(Boolean).join(' + '),
  }));
  missing.forEach((n) => lines.push({ text: n, sub: t('Couldn’t find that routine'), warn: true }));
  if (!changed.size) return { id: uid('r'), kind: 'routine', title: t('Your week is already like that'), lines: [], week };
  const result: AgentResult = {
    id: uid('r'), kind: 'routine', pending: true, offer: true, key: 'split',
    title: t('Your week'), subtitle: t(changed.size === 1 ? '1 day changes' : '{n} days change', { n: changed.size }), doneSubtitle: t(changed.size === 1 ? '1 day changed' : '{n} days changed', { n: changed.size }), lines, week,
    button: { label: t('Apply'), run: () => { useStore.getState().setSchedule({ mode: 'weekly', weekly, activities: acts }); result.undo = () => useStore.getState().patch({ schedule: prev }); } },
  };
  return result;
}

function doSkipDay(a: Extract<AgentAction, { type: 'skip_day' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const st = useStore.getState();
  const date = a.day === 'tomorrow' ? addDays(ctx.today, 1) : resolveDay(a.day, ctx.today) ?? ctx.today;
  const p = plannedFor(st, date, ctx.today);
  if (!p) return { id: uid('r'), kind: 'miss', title: t('Nothing planned that day'), lines: [{ text: dayLabel(date, ctx) }] };
  const prev = st.schedule;
  st.skipPlanned(date);
  return { id: uid('r'), kind: 'routine', title: t('Skipped'), lines: [{ text: st.routines.find((r) => r.id === p.routineId)?.name ?? '', sub: date === addDays(ctx.today, 1) ? t('Tomorrow') : dayLabel(date, ctx) }], undo: () => useStore.getState().patch({ schedule: prev }) };
}

/** "That's a seated leg curl": the catalog exercise as a card, with its how-to and a way to add it to today's workout. */
function doShowExercise(a: Extract<AgentAction, { type: 'show_exercise' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const ex = findExercise(a.exercise, lang);
  if (!ex) return { id: uid('r'), kind: 'miss', title: t('Not in your exercise library'), lines: [{ text: a.exercise, warn: true }] };
  const add = () => {
    const st = useStore.getState();
    const started = !st.active;
    if (started) st.startWorkout({ name: '' });
    const before = new Set(useStore.getState().active!.exercises.map((b) => b.id));
    addExercises([ex.id]);
    const added = useStore.getState().active!.exercises.filter((b) => !before.has(b.id)).map((b) => b.id);
    useUI.getState().toast(t('Added to workout'), { tone: 'ok', actionLabel: t('Undo'), onAction: () => { const s = useStore.getState(); s.mutateActive((x) => ({ ...x, exercises: x.exercises.filter((b) => !added.includes(b.id)) })); const after = useStore.getState().active; if (started && after && after.exercises.every((b) => b.sets.every((q) => !q.done))) useStore.getState().discardActive(); } });
  };
  return {
    id: uid('r'), kind: 'workout', title: exLabel(ex, lang),
    lines: [{ text: ex.muscles.slice(0, 3).map((m) => t(MUSCLE_LABEL[m])).join(' · '), sub: ex.equipment.map((q) => t(EQUIP_LABEL[q])).join(', ') }],
    button: { label: t('How to do it'), run: () => useUI.getState().push('exercise', { id: ex.id }) },
    more: [{ label: useStore.getState().active ? t('Add to workout') : t('Start a workout with it'), run: add }],
  };
}

/** "What should I eat?": each option is a card that waits for one tap to log it (then it says what was logged, with Undo). */
/**
 * A recipe the Coach thought of ("a protein mug cake", "low-calorie lasagne"): the app matches every ingredient to a real
 * food and works out the macros itself — the model's own numbers are never used. An ingredient it can't match, or one with
 * no amount, is flagged and left out of the numbers (said in the card). A preview: Save recipe keeps it (Undo), Log a portion
 * logs one serving now, and Shopping list copies the ingredients.
 */
async function doProposeRecipe(a: Extract<AgentAction, { type: 'propose_recipe' }>, ctx: AgentCtx): Promise<AgentResult> {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const pool = foodPool(st.foods, st.recipes);
  const fav = new Set(st.favourites);
  const rows = resolveRows(a.foods.map(foodRow), pool, st.choices, (f) => (fav.has(f.id) ? 0.05 : 0));
  const ingredients: RecipeIngredient[] = [];
  const lines: AgentResult['lines'] = [];
  const found: Food[] = [];
  let missed = 0;
  // every ingredient looked up at once (one at a time, a cake with six online lookups could take most of a minute)
  const hits = await Promise.all(rows.map((r) => findFood(r, st.settings.foodLookup).catch(() => ({} as { food?: Food; online?: Food }))));
  for (const [ri, r] of rows.entries()) {
    const { food, online } = hits[ri];
    const q = food ? rowQuantity(r, food) : null;
    const snap = food ? snapshotOf(food) : null;
    const b = snap && q?.qty ? toBase(snap, q.qty) : null;
    if (!food || !snap || !q?.qty || !b?.ok) {
      missed++;
      lines.push({ text: r.raw, sub: !food ? t('Not found — left out') : t('No amount — left out'), warn: true });
      continue;
    }
    if (online) found.push(online);
    ingredients.push({ id: uid('i'), snap, qty: q.qty, base: b.base });
    const kcal = scale(snap.per100, b.base).kcal;
    const amt = q.qty.unit === 'portion' ? `${fmtNum(q.qty.amount, lang, 1)} × ${snap.portions.find((p) => p.id === q.qty!.portionId)?.label.replace(/^1\s+/, '') ?? t('serving')}` : `${fmtNum(q.qty.amount, lang, 0)} ${q.qty.unit}`;
    lines.push({ text: lang === 'da' && food.nameDa ? food.nameDa : food.name, sub: `${amt}${kcal !== undefined ? ` · ${Math.round(kcal)} kcal` : ''}` });
  }
  if (!ingredients.length) return { id: uid('r'), kind: 'miss', title: t('Couldn’t work that recipe out'), lines };
  const now = Date.now();
  const recipe: Recipe & { steps?: string[] } = { id: uid('rc'), name: a.name, ingredients, servings: a.servings, createdAt: now, updatedAt: now, ...(a.steps.length ? { steps: a.steps } : {}) };
  const c = calcRecipe(recipe);
  const n = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => (c.perServing[k] === undefined ? '—' : `${Math.round(c.perServing[k]!)}${k === 'kcal' ? ' kcal' : ' g'}`);
  const per = `${n('kcal')} · ${t('protein')} ${n('protein')} · ${t('carbs')} ${n('carbs')} · ${t('fat')} ${n('fat')}`;
  const serves = a.servings === 1 ? t('1 serving') : t('{n} servings', { n: a.servings });
  const list = () => ingredients.map((i) => `- ${i.qty.unit === 'portion' ? `${fmtNum(i.qty.amount, lang, 1)} × ${i.snap.portions.find((p) => p.id === i.qty.portionId)?.label ?? ''}` : `${fmtNum(i.qty.amount, lang, 0)} ${i.qty.unit}`} ${i.snap.name}`).join('\n');
  const result = preview({
    id: uid('r'), kind: 'recipe', title: a.name, key: `recipe:${fold(a.name)}`,
    subtitle: `${serves} · ${t('per serving')} ${per}${missed ? ` · ${t('{n} left out', { n: missed })}` : ''}`,
    doneTitle: a.name, doneSubtitle: t('Saved to your recipes'),
    lines, steps: a.steps.length ? a.steps : undefined,
  }, t('Save recipe'), () => {
    const s2 = useStore.getState();
    found.forEach((f) => s2.saveFood(f));
    s2.upsertRecipe(recipe);
    return () => useStore.getState().deleteRecipe(recipe.id);
  });
  result.more = [
    { label: t('Log a portion'), run: () => {
      const food = recipeToFood(recipe);
      const s2 = useStore.getState();
      if (!food) { useUI.getState().toast(t('This recipe needs a weight before a portion can be logged'), { tone: 'bad' }); return; }
      const mealId = ctx.mealId && s2.settings.meals.some((m) => m.id === ctx.mealId) ? ctx.mealId : defaultMealId(s2.settings.meals);
      const one = entryFromSnapshot(snapshotOf(food), { amount: 1, unit: 'portion', portionId: 'serving' }, ctx.date ?? ctx.today, mealId, { id: uid('e') });
      const [e] = one ? s2.logEntries([one]) : [];
      if (e) useUI.getState().toast(t('Logged 1 serving of {name}', { name: a.name }), { tone: 'ok', actionLabel: t('Undo'), onAction: () => useStore.getState().removeEntry(e.id) });
    } },
    { label: t('Shopping list'), run: () => {
      void navigator.clipboard?.writeText(`${a.name} (${serves})\n${list()}`).then(() => useUI.getState().toast(t('Shopping list copied'), { tone: 'ok' }), () => useUI.getState().toast(t('Couldn’t copy'), { tone: 'bad' }));
    } },
  ];
  return result;
}

/** What an option adds up to, worked out by the app from the foods it knows (no network): null if any food is unknown. */
async function appTotals(foods: AgentFood[]): Promise<{ kcal?: number; protein?: number } | null> {
  const st = useStore.getState();
  const rows = resolveRows(foods.map(foodRow), foodPool(st.foods, st.recipes), st.choices, () => 0);
  let kcal = 0, protein = 0, kOk = true, pOk = true;
  for (const r of rows) {
    const { food } = await findFood(r, false);
    const q = food ? rowQuantity(r, food) : null;
    const snap = food ? snapshotOf(food) : null;
    const b = snap && q?.qty ? toBase(snap, q.qty) : null;
    if (!snap || !b?.ok) return null;
    const n = scale(snap.per100, b.base);
    if (n.kcal === undefined) kOk = false; else kcal += n.kcal;
    if (n.protein === undefined) pOk = false; else protein += n.protein;
  }
  return { ...(kOk ? { kcal } : {}), ...(pOk ? { protein } : {}) };
}

async function doSuggest(a: Extract<AgentAction, { type: 'suggest_food' }>, ctx: AgentCtx): Promise<AgentResult[]> {
  const { t, lang } = ctx;
  // the totals are the app's own, from the foods it knows; the model's guess is never shown (unknown → no number)
  const totals = await Promise.all(a.options.map((o) => appTotals(o.foods).catch(() => null)));
  return a.options.map((o, oi) => {
    const tot = totals[oi];
    const about = tot && (tot.kcal !== undefined || tot.protein !== undefined) ? [tot.kcal !== undefined ? `${Math.round(tot.kcal)} kcal` : '', tot.protein !== undefined ? `${Math.round(tot.protein)} g ${t('protein')}` : ''].filter(Boolean).join(' · ') : '';
    const amount = (f: AgentFood) => !f.amount ? undefined : f.unit === 'piece' || !f.unit ? `${fmtNum(f.amount, lang, 1)} ${f.amount === 1 ? t('piece') : t('pieces')}` : `${fmtNum(f.amount, lang, 1)} ${f.unit}`;
    return {
      id: uid('r'), kind: 'food' as const, title: o.label, pending: true, offer: true, subtitle: about || undefined,
      lines: o.foods.map((f) => ({ text: f.name, sub: amount(f) })),
      button: {
        label: t('Log this'),
        run: () => {
          void doLogFood({ type: 'log_food', foods: o.foods, meal: a.meal ?? null, day: null }, ctx).then((rs) => {
            // (a suggestion names its foods already: an unclear one takes the closest, without remembering it as a choice)
            rs.forEach((r) => { if (r.choose?.length) { const prev = useStore.getState().choices; r.choose[0].run(); useStore.setState({ choices: prev }); } });
            const undos = rs.map((r) => r.undo).filter((u): u is () => void => !!u);
            const miss = rs.find((r) => r.kind === 'miss');
            useUI.getState().toast(miss && !undos.length ? miss.title : t('Logged'), { tone: miss && !undos.length ? 'bad' : 'ok', actionLabel: undos.length ? t('Undo') : undefined, onAction: undos.length ? () => undos.forEach((u) => u()) : undefined });
          });
        },
      },
    };
  });
}

function doLogSets(a: Extract<AgentAction, { type: 'log_sets' }>, ctx: AgentCtx, again = false): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const pool = allExercises(st.exercises);
  const usage = new Map<string, number>();
  for (const ses of st.sessions) for (const e of ses.exercises) usage.set(e.exerciseId, (usage.get(e.exerciseId) ?? 0) + 1);
  const w = st.settings.units.weight;
  let date = resolveDay(a.day, ctx.today) ?? ctx.today;
  // which workout they go into. The running one (today, or "current"); else the finished workout they named ("last",
  // a date, or its name), else that day's workout, whichever it was (Omar's "I did calves too, put it in" had made a
  // second workout beside today's Legs & shoulders, 18 Oct); a new "Logged workout" only when the day has none
  // newest first by day, then by when it ended (the list's own order is not trusted: a restored backup keeps any order)
  const done = st.sessions.filter((x) => x.status === 'done').sort((p, q) => q.date.localeCompare(p.date) || (q.endedAt ?? q.startedAt ?? 0) - (p.endedAt ?? p.startedAt ?? 0));
  const wk = a.workout ?? null;
  const isDate = !!wk && /^\d{4}-\d{2}-\d{2}$/.test(wk);
  const isName = !!wk && wk !== 'current' && wk !== 'last' && !isDate;
  // a name: the running workout when it is that one (it carries its routine's name), else an exact name, else the
  // closest name that contains it or is contained in it (newest when equally close)
  const nameHit = (x: string | undefined) => !!x && !!wk && (fold(x) === fold(wk) || fold(x).includes(fold(wk)) || fold(wk).includes(fold(x)));
  const liveNamed = isName && !!st.active && nameHit(st.active.name);
  const named = isName && !liveNamed
    ? done.find((x) => x.name && fold(x.name) === fold(wk!)) ?? done.filter((x) => nameHit(x.name)).sort((p, q) => Math.abs(p.name.length - wk!.length) - Math.abs(q.name.length - wk!.length))[0] : undefined;
  if (isName && !liveNamed && !named) return { id: uid('r'), kind: 'miss', title: t('No workout called “{name}”', { name: wk! }), lines: done.slice(0, 3).map((x) => ({ text: x.name || t('Workout'), sub: x.date === ctx.today ? t('Today') : x.date })) };
  const chosen = wk === 'last' ? done[0] : isDate ? done.find((x) => x.date === wk) : named;
  if (chosen) date = chosen.date; else if (isDate) date = wk!;
  // sets for another day, or with no workout running (told after the gym): a finished workout, never a live one
  const live = !!st.active && date === ctx.today && !chosen;
  const lines: AgentResult['lines'] = [];
  const found: { ex: Exercise; sets: SetRecord[]; tied: boolean; said: string; heard: string[] }[] = [];

  for (const item of a.exercises) {
    const c = matchExercises(item.exercise, pool, lang, 5, (e) => Math.min(0.12, (usage.get(e.id) ?? 0) * 0.02));
    const top = c[0]?.score ?? 0;
    const ok = c.length > 0 && top >= 0.6; // a tie goes to the best (most used, then shortest name); the card says what it matched
    if (!ok) { lines.push({ text: item.exercise, sub: c.length ? `${t('Which one?')} ${c.slice(0, 3).map((x) => x.ex.name).join(' · ')}` : t('Not in your exercise library'), warn: true }); continue; }
    const ex = c[0].ex;
    // a number speech got wrong (18 for the 80 you always do) is fixed and said on the card
    const usual = lastDoneOf(ex.id);
    const heard: string[] = [];
    const sets: SetRecord[] = item.sets.map((x, i) => {
      const f = fixMisheard({ kg: x.kg ?? undefined, reps: x.reps ?? undefined }, { kg: usual?.weightKg, reps: usual?.reps });
      const h = heardText(f.heard, f, ctx, w); if (h) heard.push(h);
      return { id: uid('s'), type: 'working', weightKg: f.kg, reps: f.reps, durationSec: x.durationSec ?? undefined, distanceM: x.distanceKm ? x.distanceKm * 1000 : undefined, done: true, completedAt: Date.now() + i };
    });
    found.push({ ex, sets, tied: c.length > 1 && top - c[1].score < 0.06, said: item.exercise, heard });
  }
  if (!found.length) return { id: uid('r'), kind: 'miss', title: t('Couldn’t log that'), lines };

  // the same sets said twice within 20 s (a repeated message): logged once
  const recent = (live ? st.active!.exercises : st.sessions.filter((x) => x.date === date).flatMap((x) => x.exercises));
  const isDup = !again && found.every((f) => f.sets.every((x) => recent.some((e) => e.exerciseId === f.ex.id && e.sets.some((q) => q.done && Date.now() - (q.completedAt ?? 0) < 20000 && q.weightKg === x.weightKg && q.reps === x.reps))));
  const setText = (x: SetRecord) => `${x.weightKg ? `${fmtNum(kgToDisplay(x.weightKg, w), lang, 2)} ${w} × ` : ''}${x.reps ?? (x.durationSec ? `${x.durationSec}s` : x.distanceM ? `${x.distanceM / 1000} km` : '?')}`;
  for (const f of found) {
    lines.push({ text: lang === 'da' && f.ex.nameDa ? f.ex.nameDa : f.ex.name, sub: `${f.sets.map(setText).join('  ·  ')}${f.tied ? ` · ${t('best match for')} “${f.said}”` : ''}` });
    for (const h of f.heard) lines.push({ text: h, warn: true });
  }
  if (isDup) return { id: uid('r'), kind: 'sets', pending: true, offer: true, title: t('Already logged'), lines, doneTitle: t('Logged'), button: { label: t('Log again'), run: () => { doLogSets(a, ctx, true); } } };
  const nSets = found.reduce((n, f) => n + f.sets.length, 0);
  const title = (nSets === 1 ? t('Logged 1 set') : t('Logged {n} sets', { n: nSets })) + (date !== ctx.today ? ` · ${date === addDays(ctx.today, -1) ? t('Yesterday') : date}` : '');

  if (!live) {
    // into that day's logged workout (made now if there is none): finished, with its records; today's is linked to the
    // planned routine when its exercises are in it, so the plan counts it as done
    const prev = chosen ?? [...useStore.getState().sessions].reverse().find((x) => x.date === date && x.status === 'done');
    const at = date === ctx.today ? Date.now() : new Date(`${date}T18:00:00`).getTime();
    const planned = date === ctx.today ? plannedFor(st, date, ctx.today) : null;
    const routine = planned ? st.routines.find((r) => r.id === planned.routineId) : undefined;
    const linked = routine && !st.sessions.some((x) => x.date === date && x.routineId === routine.id && !x.logged) && found.some((f) => routine.items.some((it) => it.exerciseId === f.ex.id)) ? routine : undefined;
    const base: WorkoutSession = prev ?? { id: uid('w'), name: linked?.name ?? t('Logged workout'), date, startedAt: at, endedAt: at, pausedMs: 0, status: 'done', exercises: [], logged: true, ...(linked ? { routineId: linked.id, plannedDate: date } : {}) };
    const exs = base.exercises.map((e) => ({ ...e, sets: [...e.sets] }));
    // "put it after leg press": new exercises go in right after that one, in the order said
    const afterHit = a.after ? findBlock(a.after, base, lang) : undefined;
    let pos = afterHit ? exs.findIndex((e) => e.id === afterHit.block.id) + 1 : -1;
    // (what Undo takes back: exactly these, so anything changed by hand afterwards stays)
    const madeBlocks = new Set<string>(); const madeSets = new Set<string>();
    for (const f of found) {
      const sets = f.sets.map((x, i) => ({ ...x, completedAt: date === ctx.today ? x.completedAt : at + i }));
      sets.forEach((x) => madeSets.add(x.id));
      const into = exs.find((e) => e.exerciseId === f.ex.id);
      if (into) { into.sets.push(...sets); continue; }
      const block = { id: uid('se'), exerciseId: f.ex.id, sets };
      madeBlocks.add(block.id);
      if (pos > 0) exs.splice(pos++, 0, block); else exs.push(block);
    }
    if (a.after && madeBlocks.size) lines.push(afterHit ? { text: t('After {name}', { name: exLabel(afterHit.ex, lang) }) } : { text: t('No {name} in that workout: added at the end', { name: a.after }), warn: true });
    // a workout of theirs keeps its own length; one the Coach made grows with what is logged into it
    const ended = base.logged ? Math.max(base.endedAt ?? at, date === ctx.today ? Date.now() : at) : base.endedAt ?? at;
    const next: WorkoutSession = { ...base, exercises: exs, endedAt: ended };
    const exMap = new Map(allExercises(st.exercises).map((e) => [e.id, e]));
    const recordsOf = (x: WorkoutSession) => detectRecords(x, useStore.getState().sessions.filter((y) => y.id !== x.id && y.date <= x.date), (id) => exMap.get(id));
    next.records = recordsOf(next);
    const schedule = st.schedule;
    if (prev) st.mutateSession(prev.id, () => next); else st.restoreSession(next);
    // a rotation moves on to its next routine, as finishing it in the app does
    if (!prev && linked && planned?.source === 'rotation') st.setSchedule({ rotation: { ...schedule.rotation, pointer: (schedule.rotation.pointer + 1) % Math.max(1, schedule.rotation.order.length) } });
    return {
      id: uid('r'), kind: 'sets', title: prev && !prev.logged && prev.name ? `${title} · ${prev.name}` : title, lines,
      undo: () => {
        const s2 = useStore.getState();
        const cur = s2.sessions.find((x) => x.id === next.id);
        if (!cur) return;
        const exercises = cur.exercises.map((e) => ({ ...e, sets: e.sets.filter((q) => !madeSets.has(q.id)) })).filter((e) => !(madeBlocks.has(e.id) && !e.sets.length));
        if (!prev && !exercises.some((e) => e.sets.length)) s2.deleteSession(next.id);
        else {
          const { records: _was, ...back } = { ...cur, exercises, endedAt: cur.endedAt === next.endedAt ? base.endedAt ?? cur.endedAt : cur.endedAt };
          const records = recordsOf(back);
          s2.mutateSession(next.id, () => (records.length || base.records ? { ...back, records } : back));
        }
        if (!prev && linked && planned?.source === 'rotation') s2.setSchedule({ rotation: schedule.rotation });
      },
    };
  }

  // into the running workout: planned, unfinished sets (a routine's blanks) are filled first, the rest are appended
  const added: { seId: string; filled: string[]; appended: string[]; created: boolean }[] = [];
  const afterHit = a.after ? findBlock(a.after, useStore.getState().active!, lang) : undefined;
  let livePos = afterHit ? useStore.getState().active!.exercises.findIndex((e) => e.id === afterHit.block.id) + 1 : -1;
  const anyNew = found.some((f) => !useStore.getState().active!.exercises.some((e) => e.exerciseId === f.ex.id));
  if (a.after && anyNew) lines.push(afterHit ? { text: t('After {name}', { name: exLabel(afterHit.ex, lang) }) } : { text: t('No {name} in that workout: added at the end', { name: a.after }), warn: true });
  for (const f of found) {
    const existing = [...useStore.getState().active!.exercises].reverse().find((e) => e.exerciseId === f.ex.id);
    const created = !existing;
    if (created) addExercises([f.ex.id], livePos > 0 ? livePos++ : undefined);
    const filled: string[] = []; const appended: string[] = [];
    let seId = '';
    useStore.getState().mutateActive((s) => {
      const exs = s.exercises.map((e) => ({ ...e }));
      const tgt = [...exs].reverse().find((e) => e.exerciseId === f.ex.id);
      if (!tgt) return s;
      seId = tgt.id;
      const fresh = [...f.sets];
      const out = tgt.sets.map((q) => {
        if (!q.done && q.type !== 'warmup' && fresh.length) { const s0 = fresh.shift()!; filled.push(q.id); return { ...s0, id: q.id, target: q.target } as SetRecord; }
        return q;
      });
      for (const s0 of fresh) { out.push(s0); appended.push(s0.id); }
      tgt.sets = out;
      return { ...s, exercises: exs };
    });
    added.push({ seId, filled, appended, created });
  }
  return {
    id: uid('r'), kind: 'sets', title, lines,
    button: { label: t('Open workout'), run: () => useUI.getState().push('workout', { origin: 'none' }) },
    undo: () => {
      const s = useStore.getState();
      if (!s.active) return;
      const filled = new Set(added.flatMap((x) => x.filled));
      const appended = new Set(added.flatMap((x) => x.appended));
      const made = new Set(added.filter((x) => x.created).map((x) => x.seId));
      s.mutateActive((ses) => ({
        ...ses,
        exercises: ses.exercises
          .map((e) => ({ ...e, sets: e.sets.filter((q) => !appended.has(q.id)).map((q) => (filled.has(q.id) ? { ...q, done: false, weightKg: undefined, reps: undefined, durationSec: undefined, distanceM: undefined, completedAt: undefined } : q)) }))
          .filter((e) => !(made.has(e.id) && e.sets.every((q) => !q.done))),
      }));
    },
  };
}

function doStartWorkout(a: Extract<AgentAction, { type: 'start_workout' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const st = useStore.getState();
  if (st.active) return { id: uid('r'), kind: 'workout', title: t('A workout is already running'), lines: [{ text: st.active.name || t('Workout') }], button: { label: t('Open workout'), run: () => useUI.getState().push('workout', { origin: 'none' }) } };
  // "start today's workout": whatever the plan has today
  const askedPlan = /^(planned|today|todays?|plan|dagens|i ?dag)$/.test(fold(a.routine ?? '').replace(/\s+(workout|traening)$/, ''));
  const today = askedPlan ? plannedFor(st, ctx.today, ctx.today) : null;
  const w = askedPlan ? '' : a.routine ? fold(a.routine) : '';
  if (today) { const r = st.routines.find((x) => x.id === today.routineId)!; const ses = st.startWorkout({ routine: r, plannedDate: ctx.today }); if (ses) return { id: uid('r'), kind: 'workout', title: t('Workout started'), lines: [{ text: r.name, sub: `${r.items.length} ${t('exercises')}` }], button: { label: t('Open workout'), run: () => useUI.getState().push('workout', { origin: 'none' }) }, undo: () => { const s2 = useStore.getState(); if (s2.active && s2.active.id === ses.id && s2.active.exercises.every((e) => e.sets.every((q) => !q.done))) s2.discardActive(); } }; }
  if (askedPlan && !today) return { id: uid('r'), kind: 'miss', title: t('Nothing planned today'), lines: [] };
  const routine = w ? st.routines.find((r) => fold(r.name) === w) ?? st.routines.find((r) => fold(r.name).includes(w) || w.includes(fold(r.name))) : undefined;
  if (a.routine && !routine) return { id: uid('r'), kind: 'miss', title: t('Couldn’t start that'), lines: [{ text: a.routine, sub: `${t('No routine with that name')} · ${st.routines.map((r) => r.name).join(' · ')}`.slice(0, 160), warn: true }] };
  const ses = st.startWorkout(routine ? { routine } : { name: '' });
  if (!ses) return { id: uid('r'), kind: 'miss', title: t('Couldn’t start that'), lines: [] };
  return {
    id: uid('r'), kind: 'workout', title: t('Workout started'), lines: [{ text: routine?.name ?? t('Empty workout'), sub: routine ? `${routine.items.length} ${t('exercises')}` : undefined }],
    button: { label: t('Open workout'), run: () => useUI.getState().push('workout', { origin: 'none' }) },
    undo: () => { const s = useStore.getState(); if (s.active && s.active.id === ses.id && s.active.exercises.every((e) => e.sets.every((q) => !q.done))) s.discardActive(); },
  };
}

function doFinishWorkout(ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const st = useStore.getState();
  if (!st.active) return { id: uid('r'), kind: 'miss', title: t('No workout is running'), lines: [] };
  const done = st.active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  return {
    id: uid('r'), kind: 'workout', pending: true, title: t('Finish this workout?'), lines: [{ text: st.active.name || t('Workout'), sub: t(done === 1 ? '1 set done' : '{n} sets done', { n: done }) }],
    button: { label: t('Finish and save'), run: () => { const r = useStore.getState().finishActive(); if (r) { useUI.getState().push('summary', { sessionId: r.id }); } } },
  };
}

/** "Quick entry 100 calories": just the numbers, in the meal said (or the one for this time of day), with Undo. */
function doQuick(a: Extract<AgentAction, { type: 'log_quick' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const date = resolveDay(a.day, ctx.today) ?? ctx.date ?? ctx.today;
  const mealId = resolveMeal(a.meal, st.settings.meals, lang) ?? (ctx.mealId && st.settings.meals.some((m) => m.id === ctx.mealId) ? ctx.mealId : defaultMealId(st.settings.meals, new Date(), st.settings.dayStartHour));
  const meal = st.settings.meals.find((m) => m.id === mealId);
  const q = quickEntry(a.name || t('Quick entry'), a.totals, date, mealId);
  const e = st.logEntries([q])[0] ?? q;
  const n = e.nutrients;
  const sub = [n.kcal !== undefined ? `${Math.round(n.kcal)} kcal` : '', ...(['protein', 'carbs', 'fat'] as const).filter((k) => n[k] !== undefined).map((k) => `${fmtNum(n[k]!, lang, 0)} g ${t(k)}`)].filter(Boolean).join(' · ');
  return {
    id: uid('r'), kind: 'food',
    title: t('Logged to {meal}', { meal: meal ? mealName(meal, lang) : t('Today') }) + (date !== ctx.today ? ` · ${date === addDays(ctx.today, -1) ? t('Yesterday') : date}` : ''),
    lines: [{ text: a.name || t('Quick entry'), sub, ref: e.id }],
    undo: () => useStore.getState().removeEntry(e.id),
  };
}

function doWater(a: Extract<AgentAction, { type: 'log_water' }>, ctx: AgentCtx): AgentResult {
  const id = useStore.getState().addWater(a.ml, resolveDay(a.day, ctx.today) ?? ctx.today);
  return { id: uid('r'), kind: 'water', title: ctx.t('Water logged'), lines: [{ text: `${fmtNum(a.ml, ctx.lang, 0)} ml` }], undo: () => useStore.getState().removeWater(id) };
}

function doWeight(a: Extract<AgentAction, { type: 'log_weight' }>, ctx: AgentCtx): AgentResult {
  const st = useStore.getState();
  const w = st.addWeight(a.kg, resolveDay(a.day, ctx.today) ?? ctx.today);
  const u = st.settings.units.weight;
  return { id: uid('r'), kind: 'weight', title: ctx.t('Weight logged'), lines: [{ text: `${fmtNum(kgToDisplay(a.kg, u), ctx.lang, 1)} ${u}` }], undo: () => useStore.getState().removeWeight(w.id) };
}

function doActivity(a: Extract<AgentAction, { type: 'log_activity' }>, ctx: AgentCtx): AgentResult {
  const log = useStore.getState().addActivity({ date: resolveDay(a.day, ctx.today) ?? ctx.today, kind: a.kind, durationSec: a.minutes * 60, rounds: a.rounds, intensity: a.intensity, note: a.note });
  const parts = [`${a.minutes} min`, a.rounds ? `${a.rounds} ${ctx.t('rounds')}` : '', a.intensity ? ctx.t(({ 1: 'Easy', 2: 'Hard', 3: 'Max' } as const)[a.intensity]) : ''].filter(Boolean);
  return { id: uid('r'), kind: 'activity', title: ctx.t('Activity logged'), lines: [{ text: ctx.t(ACTIVITY_LABEL[a.kind]), sub: parts.join(' · ') }], undo: () => useStore.getState().removeActivity(log.id) };
}

function doNavigate(a: Extract<AgentAction, { type: 'navigate' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const ui = useUI.getState();
  const go = () => {
    if (a.screen === 'settings') ui.push('settings', a.section ? { section: a.section } : {});
    else if (a.screen === 'coach') { /* already here */ }
    else { ui.closeAll(); ui.setTab(a.screen); }
  };
  const names: Record<string, string> = { today: t('Today'), train: t('Train'), food: t('Food'), progress: t('Progress'), settings: t('Settings'), coach: t('Coach') };
  setTimeout(go, 700); // long enough to read the answer, short enough to feel like "do it"
  return { id: uid('r'), kind: 'nav', title: t('Opening {screen}', { screen: names[a.screen] }), lines: [] };
}

/** Settings (one or several at once): each checked against SETTING_SPEC; the card shows every change and undoes them together. */
function doSetting(a: Extract<AgentAction, { type: 'set_setting' }>, ctx: AgentCtx): AgentResult {
  const st = useStore.getState();
  const pairs = a.pairs ?? (a.key && a.value !== undefined ? [{ key: a.key, value: a.value }] : []);
  let cur = st.settings;
  const lines: AgentResult['lines'] = []; const bad: string[] = [];
  const patch: Partial<Settings> = {};
  for (const p of pairs) {
    const spec = specOf(p.key); const r = spec?.parse(p.value, cur);
    if (!spec || !r) { bad.push(`${p.key} = ${p.value}`); continue; }
    Object.assign(patch, r.patch); cur = { ...cur, ...r.patch };
    lines.push({ text: ctx.t(spec.label), sub: r.show });
  }
  if (!lines.length) return { id: uid('r'), kind: 'miss', title: ctx.t('Couldn’t change that setting'), lines: bad.map((b) => ({ text: b, warn: true })) };
  const prev: Partial<Settings> = {};
  for (const k of Object.keys(patch) as (keyof Settings)[]) (prev as any)[k] = (st.settings as any)[k];
  st.updateSettings(patch);
  return {
    id: uid('r'), kind: 'setting', title: lines.length > 1 ? ctx.t('Settings changed') : ctx.t('Setting changed'),
    lines: [...lines, ...bad.map((b) => ({ text: b, sub: ctx.t('not changed'), warn: true }))],
    // (changed back: the Coach learns which settings to leave alone, lib/ledger.ts)
    undo: () => { useStore.getState().updateSettings(prev); pairs.filter((p) => specOf(p.key)).forEach((p) => noteEvent({ k: 'setting', key: p.key })); },
  };
}

/** Carry out what the model asked for, in order. Each result is one card in the chat. */
export async function runActions(actions: AgentAction[], ctxIn: AgentCtx): Promise<AgentResult[]> {
  const ctx: AgentCtx = { ...ctxIn, memAtStart: ctxIn.memAtStart ?? [...useStore.getState().memory] };
  const out: AgentResult[] = [];
  for (const a of actions) {
    try {
      switch (a.type) {
        case 'log_food': out.push(...await doLogFood(a, ctx)); break;
        case 'log_sets': out.push(doLogSets(a, ctx)); break;
        case 'log_water': out.push(doWater(a, ctx)); break;
        case 'log_quick': out.push(doQuick(a, ctx)); break;
        case 'log_weight': out.push(doWeight(a, ctx)); break;
        case 'log_activity': out.push(doActivity(a, ctx)); break;
        case 'start_workout': out.push(doStartWorkout(a, ctx)); break;
        case 'finish_workout': out.push(doFinishWorkout(ctx)); break;
        case 'navigate': out.push(doNavigate(a, ctx)); break;
        case 'set_setting': out.push(doSetting(a, ctx)); break;
        case 'edit_food': out.push(doEditFood(a, ctx)); break;
        case 'delete_food': out.push(doDeleteFood(a, ctx)); break;
        case 'move_food': case 'copy_food': out.push(doMoveCopy(a, ctx)); break;
        case 'replace_food': out.push(await doReplaceFood(a, ctx)); break;
        case 'create_food': out.push(await doCreateFood(a, ctx)); break;
        case 'favourite_food': out.push(doFavourite(a, ctx)); break;
        case 'save_meal': out.push(doSaveMeal(a, ctx)); break;
        case 'edit_set': out.push(doEditSet(a, ctx)); break;
        case 'add_exercise': out.push(doAddExercise(a, ctx)); break;
        case 'catch_up': out.push(doCatchUp(a, ctx)); break;
        case 'remove_exercise': out.push(doRemoveExercise(a, ctx)); break;
        case 'replace_exercise': out.push(doReplaceExercise(a, ctx)); break;
        case 'create_routine': out.push(doCreateRoutine(a, ctx)); break;
        case 'edit_routine': out.push(doEditRoutine(a, ctx)); break;
        case 'delete_routine': out.push(doDeleteRoutine(a, ctx)); break;
        case 'duplicate_routine': out.push(doDuplicateRoutine(a, ctx)); break;
        case 'show_chart': out.push(doShowChart(a, ctx)); break;
        case 'delete_workout': out.push(doDeleteWorkout(a, ctx)); break;
        case 'discard_workout': out.push(doDiscardWorkout(ctx)); break;
        case 'set_schedule': out.push(doSchedule(a, ctx)); break;
        case 'move_workout': out.push(doMoveWorkout(a, ctx)); break;
        case 'plan_activity': out.push(doPlanActivity(a, ctx)); break;
        case 'log_current_set': out.push(doCurrentSet(a, ctx)); break;
        case 'delete_activity': out.push(doDeleteActivity(a, ctx)); break;
        case 'delete_weight': out.push(doDeleteWeight(a, ctx)); break;
        case 'add_note': out.push(doNote(a, ctx)); break;
        case 'remember': out.push(doRemember(a, ctx)); break;
        case 'forget': out.push(doForget(a, ctx)); break;
        case 'show_exercise': out.push(doShowExercise(a, ctx)); break;
        case 'propose_recipe': out.push(await doProposeRecipe(a, ctx)); break;
        case 'suggest_food': out.push(...(await doSuggest(a, ctx))); break;
        case 'plan_day': out.push(doPlanDay(a, ctx)); break;
        case 'edit_meals': out.push(doEditMeals(a, ctx)); break;
        case 'log_saved_meal': out.push(doLogSavedMeal(a, ctx)); break;
        case 'delete_water': out.push(doDeleteWater(a, ctx)); break;
        case 'create_exercise': out.push(doCreateExercise(a, ctx)); break;
        case 'archive_exercise': out.push(doArchiveExercise(a, ctx)); break;
        case 'set_increment': out.push(doSetIncrement(a, ctx)); break;
        case 'log_measurement': out.push(doMeasurement(a, ctx)); break;
        case 'delete_measurement': out.push(doDeleteMeasurement(a, ctx)); break;
        case 'workout_control': out.push(doWorkoutControl(a, ctx)); break;
        case 'set_split': out.push(doSetSplit(a, ctx)); break;
        case 'skip_day': out.push(doSkipDay(a, ctx)); break;
        case 'undo_last': break; // handled by the Coach (it knows its own cards)
      }
    } catch {
      out.push({ id: uid('r'), kind: 'miss', title: ctx.t('Couldn’t do that'), lines: [] });
    }
  }
  return out;
}

// ── without Gemini: simple commands through the local parsers ──

/** Best-effort local reading of a spoken/typed command. Returns null when it isn't a plain logging command. */
export function localActions(text: string): AgentAction[] | null {
  const raw = text.trim();
  if (!raw) return null;
  const water = raw.match(/(\d+(?:[.,]\d+)?)\s*(ml|cl|dl|l|liter|litre)\b[^]*?\b(water|vand)\b|\b(water|vand)\b[^]*?(\d+(?:[.,]\d+)?)\s*(ml|cl|dl|l|liter|litre)\b/i);
  if (water) {
    const g = water.slice(1).filter(Boolean); const amount = Number(String(g[0]).replace(',', '.')) ; const unit = String(g.find((x) => /^(ml|cl|dl|l|liter|litre)$/i.test(x) )).toLowerCase();
    const a = Number.isFinite(amount) ? amount : Number(String(g.find((x) => /^\d/.test(x))).replace(',', '.'));
    const ml = a * ({ ml: 1, cl: 10, dl: 100, l: 1000, liter: 1000, litre: 1000 } as Record<string, number>)[unit];
    if (Number.isFinite(ml) && ml > 0) return [{ type: 'log_water', ml: Math.round(ml) }];
  }
  // "quick entry 100 calories", "300 kcal 20 g protein", "500 kalorier pizza til aftensmad"
  const kcal = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:kcal|kalorier|calories|calorie|cals?|kal)\b/i);
  if (kcal) {
    const n = (re: RegExp) => { const m = raw.match(re); return m ? Number(m[1].replace(',', '.')) : undefined; };
    const totals: NutriFix = { kcal: Number(kcal[1].replace(',', '.')) };
    const p = n(/(\d+(?:[.,]\d+)?)\s*g?\s*(?:protein)\b/i), c = n(/(\d+(?:[.,]\d+)?)\s*g?\s*(?:carbs?|kulhydrat(?:er)?)\b/i), f = n(/(\d+(?:[.,]\d+)?)\s*g?\s*(?:fat|fedt)\b/i);
    if (p !== undefined) totals.protein = p; if (c !== undefined) totals.carbs = c; if (f !== undefined) totals.fat = f;
    const mealWord = raw.match(/\b(breakfast|lunch|dinner|supper|snacks?|morgenmad|frokost|aftensmad|mellemm(?:a|å)ltid)\b/i)?.[1] ?? null;
    // whatever is left once the numbers and filler words are gone is its name ("pizza")
    const name = raw.replace(kcal[0], ' ').replace(/(\d+(?:[.,]\d+)?)\s*g?\s*(?:protein|carbs?|kulhydrat(?:er)?|fat|fedt)\b/gi, ' ')
      .replace(/\b(?:quick\s*(?:entry|add)|hurtig\s*(?:post|tilføjelse)|log|add|tilføj|please|i\s+had|ate|spiste|for|til|to|and|og|with|med|of|af|breakfast|lunch|dinner|supper|snacks?|morgenmad|frokost|aftensmad|mellemm(?:a|å)ltid)\b/gi, ' ')
      .replace(/[,.:;]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (totals.kcal! > 0 && totals.kcal! <= 10000) return [{ type: 'log_quick', totals, name: name.length > 1 && name.length <= 40 ? name : null, meal: mealWord, day: null }];
  }
  const weight = raw.match(/\b(?:i weigh|weigh(?:ed)?|weight|vejer|vægt|vaegt)\b\D{0,14}(\d{2,3}(?:[.,]\d+)?)\s*(?:kg|kilo)?/i);
  if (weight) { const kg = Number(weight[1].replace(',', '.')); if (kg >= 25 && kg <= 400) return [{ type: 'log_weight', kg }]; }
  const wr = parseWorkoutText(raw).filter((r) => r.sets.some((s) => s.reps || s.weightKg || s.durationSec || s.distanceM));
  if (wr.length) return [{ type: 'log_sets', exercises: wr.map((r) => ({ exercise: r.query, sets: r.sets.map((s) => ({ kg: s.weightKg ?? null, reps: s.reps ?? null, durationSec: s.durationSec ?? null, distanceKm: s.distanceM ? s.distanceM / 1000 : null })) })) }];
  const stripped = raw.replace(/^\s*(?:please\s+)?(?:log|add|i\s+(?:ate|had|drank)|ate|had|spiste|jeg\s+(?:spiste|drak|har\s+spist)|logge?)\s+/i, '');
  if (stripped !== raw || /^\d/.test(raw)) {
    const rows = parseFoodText(stripped);
    if (rows.length) return [{ type: 'log_food', foods: rows.map((r) => ({ name: r.query, amount: r.amount ?? null, unit: r.dim === 'count' ? (r.countWord ?? 'piece') : r.dim })), meal: null, day: null }];
  }
  return null;
}
