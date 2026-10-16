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
import { useStore, foodPool, allExercises, plannedFor } from '../state/store';
import { useUI } from '../state/ui';
import { addDays, fmtDate } from './dates';
import { noteEvent } from './ledger';
import { defaultMealId, mealName } from './derive';
import { fold, parseFoodText, pickOnline, resolveRows, rowQuantity, type ParsedFoodRow } from './foodText';
import { matchExercises, parseWorkoutText } from './workoutText';
import { calcRecipe, entryFromSnapshot, quickEntry, recipeToFood, scale, snapshotOf, toBase, uid } from './nutrition';
import { searchDanish, searchOnline } from './foodApi';
import { type Brain } from './gemini';
import { estimateFood } from './brain';
import { ACTIVITY_KINDS, ACTIVITY_LABEL } from './activity';
import { fmtNum, kgToDisplay } from './units';
import type { ActivityKind, Equipment, Exercise, Food, FoodEntry, LogType, Meal, MeasureKind, MemoryKind, MemoryNote, MuscleGroup, Quantity, Recipe, RecipeIngredient, RoutineItem, SessionExercise, SetRecord, Settings } from './types';
import { MEMORY_KINDS, MEMORY_MAX } from '../state/defaults';
import { addExercises, adjustRest, moveExercise, patchExercise, replaceExercise, skipRest, startRest, toggleSuperset } from '../screens/workout/actions';
import { EQUIP_LABEL, MUSCLE_LABEL } from '../screens/workout/common';
import { muscleOf } from './agentLookup';
import { buildDayPlan, pickForMuscles } from './planDay';
import { specOf } from './settingSpec';
import { weekdayOf } from './dates';

// ── what the model may ask for ──────────────────────────────

export interface AgentFood { name: string; brand?: string | null; amount?: number | null; unit?: string | null; state?: string | null }
export interface AgentSet { kg?: number | null; reps?: number | null; durationSec?: number | null; distanceKm?: number | null }
export type AgentAction =
  | { type: 'log_food'; foods: AgentFood[]; meal?: string | null; day?: string | null }
  | { type: 'log_water'; ml: number; day?: string | null }
  | { type: 'log_weight'; kg: number; day?: string | null }
  | { type: 'log_sets'; exercises: { exercise: string; sets: AgentSet[] }[] }
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
  | { type: 'add_exercise'; exercises: string[] }
  | { type: 'remove_exercise'; exercise: string }
  | { type: 'replace_exercise'; from: string; to: string; routine?: string | null }
  | { type: 'create_routine'; name: string; items: RoutineBit[] }
  | { type: 'edit_routine'; routine: string; rename?: string | null; add?: RoutineBit[]; remove?: string[]; change?: RoutineBit[] }
  | { type: 'delete_routine'; routine: string }
  | { type: 'delete_workout'; workout?: string | null }
  | { type: 'discard_workout' }
  | { type: 'set_schedule'; weekday: number; routine: string | null }
  | { type: 'move_workout'; routine?: string | null; from_weekday?: number | null; to_weekday: number; once: boolean }
  | { type: 'plan_activity'; weekday: number; kind: ActivityKind; on: boolean }
  | { type: 'log_current_set'; kg?: number | null; reps?: number | null; which: 'current' | 'last' }
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

const agentFoods = (v: unknown, n: number): AgentFood[] => (Array.isArray(v) ? v : []).slice(0, n).map((f: any): AgentFood | null => {
  const name = str(f?.name, 60); if (!name) return null;
  return { name, brand: str(f?.brand, 40) ?? null, amount: num(f?.amount, 0.01, 20000) ?? null, unit: str(f?.unit, 12) ?? null, state: ['raw', 'cooked', 'dry'].includes(f?.state) ? f.state : null };
}).filter(Boolean) as AgentFood[];

/** Whatever came back from the model → a safe list of actions (anything odd is dropped, numbers are clamped). */
export function validateAgent(raw: any): { reply: string; actions: AgentAction[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const reply = str(raw.reply, 1800) ?? '';
  const out: AgentAction[] = [];
  for (const a of (Array.isArray(raw.actions) ? raw.actions : []).slice(0, 12)) {
    if (!a || typeof a !== 'object') continue;
    switch (a.type) {
      case 'log_food': {
        const foods = agentFoods(a.foods, 14);
        if (foods.length) out.push({ type: 'log_food', foods, meal: str(a.meal, 30) ?? null, day: dayArg(a.day) });
        break;
      }
      case 'propose_recipe': {
        const name = str(a.name, 60), foods = agentFoods(a.foods, 15);
        const steps = (Array.isArray(a.steps) ? a.steps : []).map((x: unknown) => str(x, 220)).filter(Boolean).slice(0, 12) as string[];
        if (name && foods.length) out.push({ type: 'propose_recipe', name, servings: Math.round(num(a.servings, 1, 20) ?? 1), foods, steps });
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
        if (exercises.length) out.push({ type: 'log_sets', exercises });
        break;
      }
      case 'log_activity': {
        const kind = ACTIVITY_KINDS.includes(a.kind) ? (a.kind as ActivityKind) : (ACTIVITY_KINDS.find((k) => fold(String(a.kind ?? '')).includes(k)) ?? 'other');
        const minutes = num(a.minutes, 1, 600); if (!minutes) break;
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
      case 'add_exercise': { const exercises = (Array.isArray(a.exercises) ? a.exercises : []).slice(0, 8).map((x: any) => str(x, 60)).filter(Boolean) as string[]; if (exercises.length) out.push({ type: 'add_exercise', exercises }); break; }
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
        out.push({ type: 'log_current_set', kg: kg ?? null, reps: reps !== undefined ? Math.round(reps) : null, which: a.which === 'last' ? 'last' : 'current' });
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
  if (!reply && !out.length) return null;
  return { reply, actions: out };
}

// ── results: what the Coach shows after acting ─────────────

export interface AgentResult {
  id: string;
  kind: 'food' | 'recipe' | 'sets' | 'water' | 'weight' | 'activity' | 'workout' | 'routine' | 'nav' | 'setting' | 'memory' | 'miss';
  /** a recipe's method, shown under its ingredients (folded away until opened) */
  steps?: string[];
  title: string;
  lines: { text: string; sub?: string; warn?: boolean; /** the item's id (a food entry), so "move it" later means exactly this one */ ref?: string }[];
  /** reverses everything this card did */
  undo?: () => void;
  /** a button on the card (open the workout, or confirm something that waits for a tap) */
  button?: { label: string; run: () => void };
  /** quieter buttons beside it (an exercise card: Add to workout) */
  more?: { label: string; run: () => void }[];
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
/** One thing the model heard, as the text the app's own food parser understands ("200 g skyr", "1 banana"). */
function foodRow(f: AgentFood, i: number): ParsedFoodRow {
  const name = f.brand ? `${f.brand} ${f.name}` : f.name;
  const unit = (f.unit || '').toLowerCase();
  const amount = f.amount ?? undefined;
  let text = name;
  if (amount !== undefined) {
    if (unit === 'kg') text = `${amount * 1000} g ${name}`;
    else if (unit === 'g') text = `${amount} g ${name}`;
    else if (VOLUME_ML[unit]) text = `${amount * VOLUME_ML[unit]} ml ${name}`;
    else text = `${amount} ${unit && unit !== 'piece' && unit !== 'serving' ? `${unit} ` : ''}${name}`;
  }
  const row = parseFoodText(text)[0] ?? { id: `a${i}`, raw: name, query: name, dim: 'count' as const };
  return { ...row, id: `a${i}`, raw: name, query: f.state ? `${name} ${f.state}` : row.query };
}

const kcalOf = (e: FoodEntry) => (typeof e.nutrients.kcal === 'number' ? Math.round(e.nutrients.kcal) : undefined);

/**
 * The food a heard row means: a clear match in the bundled and own foods (or the best one when it is clearly ahead), else
 * — unless lookups are off — the Danish products and the online databases (bounded). Never an AI estimate: logging adds
 * that itself, clearly labelled; a recipe flags the miss instead.
 */
async function findFood(r: ReturnType<typeof resolveRows>[number], lookup: boolean): Promise<{ food?: Food; online?: Food }> {
  let food: Food | undefined = r.status === 'resolved' ? r.candidates.find((c) => c.food.id === r.choiceId)?.food : undefined;
  if (!food && r.status === 'ambiguous' && r.candidates[0] && r.candidates[0].score >= 0.5) food = r.candidates[0].food;
  if (food || !lookup) return { food };
  const timeout = (ms: number) => new Promise<undefined>((ok) => setTimeout(() => ok(undefined), ms));
  const hit = await Promise.race([searchDanish(r.query).then((x) => pickOnline(r.query, x)), timeout(4000)]).catch(() => undefined)
    ?? await Promise.race([searchOnline(r.query).then((x) => pickOnline(r.query, x.foods)), timeout(5000)]).catch(() => undefined);
  return hit ? { food: hit, online: hit } : {};
}

async function doLogFood(a: Extract<AgentAction, { type: 'log_food' }>, ctx: AgentCtx): Promise<AgentResult> {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const pool = foodPool(st.foods, st.recipes);
  const fav = new Set(st.favourites);
  const date = resolveDay(a.day, ctx.today) ?? ctx.date ?? ctx.today;
  const mealId = resolveMeal(a.meal, st.settings.meals, lang) ?? (ctx.mealId && st.settings.meals.some((m) => m.id === ctx.mealId) ? ctx.mealId : defaultMealId(st.settings.meals));
  const meal = st.settings.meals.find((m) => m.id === mealId);
  const rows = resolveRows(a.foods.map(foodRow), pool, st.choices, (f) => (fav.has(f.id) ? 0.05 : 0));
  const entries: FoodEntry[] = [];
  const lines: AgentResult['lines'] = [];
  const toSave: Food[] = [];

  for (const r of rows) {
    // the food: the bundled/own foods first, then (unless turned off) the online databases
    const { food, online } = await findFood(r, st.settings.foodLookup);
    if (online) toSave.push(online);
    if (food) {
      let q = rowQuantity(r, food);
      let guessed = false;
      if (!q.qty && q.problem === 'noAmount') { // "log a banana" with no amount: one typical portion, flagged as an assumption
        const p = food.portions[0];
        q = { qty: p ? { amount: 1, unit: 'portion', portionId: p.id } : ({ amount: 100, unit: food.basis } as Quantity), estimated: true };
        guessed = true;
      }
      const entry = q.qty ? entryFromSnapshot(snapshotOf(food), q.qty, date, mealId, { id: uid('e') }) : null;
      if (entry) {
        if (guessed) entry.estimated = true;
        entries.push(entry);
        const label = q.qty!.unit === 'portion' ? `${fmtNum(q.qty!.amount, lang, 1)} × ${food.portions.find((p) => p.id === q.qty!.portionId)?.label.replace(/^1\s+/, '') ?? t('serving')}` : `${fmtNum(q.qty!.amount, lang, 0)} ${q.qty!.unit}`;
        lines.push({ text: lang === 'da' && food.nameDa ? food.nameDa : food.name, sub: `${label}${kcalOf(entry) !== undefined ? ` · ${kcalOf(entry)} kcal` : ''}${guessed ? ` · ${t('typical portion')}` : ''}`, warn: false, ref: entry.id });
        continue;
      }
    }
    // still nothing (or no usable quantity): an AI estimate, clearly labelled — or an honest miss
    if (ctx.brain) {
      try {
        const est = await estimateFood(r.amount !== undefined ? `${r.amount} ${r.dim === 'count' ? (r.countWord ?? '') : r.dim} ${r.query}`.trim() : r.query, ctx.brain, lang);
        const q = quickEntry(`${est.name} (${t('AI estimate')})`, { kcal: est.kcal, protein: est.protein, carbs: est.carbs, fat: est.fat }, date, mealId);
        entries.push({ ...q, estimated: true, note: est.assumptions || undefined });
        lines.push({ text: est.name, sub: `${Math.round(est.kcal)} kcal · ${t('AI estimate')}`, warn: true, ref: q.id });
        continue;
      } catch { /* fall through to the honest miss */ }
    }
    lines.push({ text: r.raw, sub: t('Not found — add it from the Food tab'), warn: true });
  }

  if (!entries.length) return { id: uid('r'), kind: 'miss', title: t('Couldn’t log that'), lines };
  toSave.forEach((f) => st.saveFood(f));
  const added = st.logEntries(entries);
  const total = added.reduce((n, e) => n + (e.nutrients.kcal ?? 0), 0);
  return {
    id: uid('r'), kind: 'food',
    title: t('Logged to {meal}', { meal: meal ? mealName(meal, lang) : t('Today') }) + (date !== ctx.today ? ` · ${date === addDays(ctx.today, -1) ? t('Yesterday') : date}` : ''),
    lines: [...lines, ...(added.length > 1 ? [{ text: t('Total'), sub: `${Math.round(total)} kcal` }] : [])],
    undo: () => added.forEach((e) => useStore.getState().removeEntry(e.id)),
  };
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
      !u ? { ...next.qty, amount: a.amount } : null;
    const r = qty && !next.quick ? entryFromSnapshot(next.snap, qty, next.date, next.mealId, { id: next.id, at: next.at, note: next.note }) : null;
    if (r) { next = { ...r, estimated: false }; changed.push(qty!.unit === 'portion' ? `${fmtNum(qty!.amount, lang, 1)} ×` : `${fmtNum(qty!.amount, lang, 0)} ${qty!.unit}`); }
  }
  const mealId = mealIdOf(a.meal, ctx);
  if (mealId && mealId !== next.mealId) { next = { ...next, mealId }; changed.push(mealLabelOf(mealId, ctx)); }
  if (next === prev) return { id: uid('r'), kind: 'miss', title: t('Couldn’t change that'), lines: [{ text: prev.snap.name, warn: true }] };
  st.updateEntry(prev.id, next);
  // a food of your own with a wrong label: fix the food too, so the next time you log it is right
  const own = a.per100 && prev.snap.foodId ? st.foods.find((f) => f.id === prev.snap.foodId && f.source === 'custom') : undefined;
  if (own) st.saveFood({ ...own, per100: { ...own.per100, ...a.per100 } });
  return {
    id: uid('r'), kind: 'food', title: t('Corrected'),
    lines: [{ text: prev.snap.name, sub: `${kcalStr(prev)} → ${kcalStr(next)} · ${changed.join(' · ')}`, ref: prev.id }],
    undo: () => { const s = useStore.getState(); s.updateEntry(prev.id, prev); if (own) s.saveFood(own); },
  };
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
  const toDate = resolveDay(a.day_to, ctx.today);
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
  const r = await doLogFood({ type: 'log_food', foods: [w], meal: old.mealId, day: old.date }, ctx);
  if (r.kind !== 'food') return { ...r, title: t('Couldn’t replace that') };
  useStore.getState().removeEntry(old.id);
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
  return doLogFood({ type: 'log_food', foods: [{ name: a.name, amount: a.amount, unit: a.unit ?? a.basis }], meal: a.meal, day: a.day }, ctx).then((r) => ({ ...r, title: t('Saved and logged'), lines: [...lines, ...r.lines], undo: () => { r.undo?.(); undoFood(); } }));
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

function doAddExercise(a: Extract<AgentAction, { type: 'add_exercise' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const found = a.exercises.map((n) => ({ n, ex: findExercise(n, lang) }));
  const ok = found.filter((x) => x.ex).map((x) => x.ex!);
  const miss = found.filter((x) => !x.ex).map((x) => x.n);
  if (!ok.length) return { id: uid('r'), kind: 'miss', title: t('Couldn’t add that'), lines: miss.map((n) => ({ text: n, sub: t('Not in your exercise library'), warn: true })) };
  const st = useStore.getState();
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
    doneSubtitle: t('Saved to your routines'),
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
  let items = [...r.items];
  const lines: AgentResult['lines'] = [];
  const pick = (name: string) => { const c = matchExercises(name, items.map((i) => pool.find((e) => e.id === i.exerciseId)).filter(Boolean) as Exercise[], lang, 2); return c.length && c[0].score >= 0.5 ? items.find((i) => i.exerciseId === c[0].ex.id) : undefined; };
  for (const n of a.remove ?? []) { const it = pick(n); if (it) { items = items.filter((i) => i !== it); lines.push({ text: nameOf(it.exerciseId), sub: t('removed') }); } else lines.push({ text: n, sub: t('not in this routine'), warn: true }); }
  for (const b of a.change ?? []) {
    const it = pick(b.exercise);
    if (!it) { lines.push({ text: b.exercise, sub: t('not in this routine'), warn: true }); continue; }
    const repMin = b.repMin ?? it.repMin, repMax = Math.max(repMin, b.repMax ?? it.repMax);
    const nx = { ...it, workingSets: b.sets ?? it.workingSets, repMin, repMax, restSec: b.restSec ?? it.restSec, warmupSets: b.warmup ?? it.warmupSets };
    items = items.map((i) => (i === it ? nx : i));
    lines.push({ text: nameOf(it.exerciseId), sub: `${it.workingSets} × ${it.repMin}–${it.repMax} → ${nx.workingSets} × ${nx.repMin}–${nx.repMax}${nx.restSec !== it.restSec ? ` · ${fmtSec(nx.restSec)}` : ''}${nx.warmupSets !== it.warmupSets ? ` · ${nx.warmupSets} W` : ''}` });
  }
  if (a.add?.length) { const m = itemsFrom(a.add, lang); items = [...items, ...m.items]; m.items.forEach((i) => lines.push({ text: nameOf(i.exerciseId), sub: `${t('added')} · ${i.workingSets} × ${i.repMin}–${i.repMax}` })); m.skipped.forEach((n) => lines.push({ text: n, sub: t('Not in your exercise library'), warn: true })); }
  if (a.rename) lines.unshift({ text: r.name, sub: `→ ${a.rename}` });
  if (!lines.length || lines.every((l) => l.warn)) return { id: uid('r'), kind: 'miss', title: t('Couldn’t change that routine'), lines };
  const next = { ...r, name: a.rename ?? r.name, items, updatedAt: Date.now() };
  const apply = () => { useStore.getState().upsertRoutine(next); return () => useStore.getState().upsertRoutine(r); };
  // a rewrite (three or more changes) is a preview; a small edit happens at once
  if (lines.filter((l) => !l.warn).length >= 3) return preview({ id: uid('r'), kind: 'routine', title: t('Change {name}?', { name: r.name }), key: `routine:${r.id}`, lines: [{ text: a.rename ?? r.name }, ...lines] }, t('Apply'), apply);
  return { id: uid('r'), kind: 'routine', title: t('Routine updated'), lines: [{ text: a.rename ?? r.name }, ...lines], undo: apply() };
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

/** In a workout, "only 9 reps" / "67 kilos, same reps": the set you're on (ticked, with the rest started) — or the one
 * you just finished ("the last one was 7"). Unsaid numbers stay as the set already shows them. */
function doCurrentSet(a: Extract<AgentAction, { type: 'log_current_set' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const act = st.active;
  if (!act) return { id: uid('r'), kind: 'miss', title: t('No workout is running'), lines: [] };
  const w = st.settings.units.weight;
  const show = (s: Pick<SetRecord, 'weightKg' | 'reps'>) => `${s.weightKg ? `${fmtNum(kgToDisplay(s.weightKg, w), lang, 2)} ${w} × ` : ''}${s.reps ?? '—'}`;
  const before = act;
  const exOf = (id: string) => allExercises(st.exercises).find((e) => e.id === id);
  let hit: { se: SessionExercise; set: SetRecord; n: number } | null = null;
  if (a.which === 'last') {
    for (const se of act.exercises) se.sets.forEach((s, i) => { if (s.done && (!hit || (s.completedAt ?? 0) >= (hit.set.completedAt ?? 0))) hit = { se, set: s, n: i + 1 }; });
    if (!hit) return { id: uid('r'), kind: 'miss', title: t('No finished set yet'), lines: [] };
  } else {
    for (const se of act.exercises) { const i = se.sets.findIndex((s) => !s.done); if (i >= 0) { hit = { se, set: se.sets[i], n: i + 1 }; break; } }
    if (!hit) return { id: uid('r'), kind: 'miss', title: t('Every set is done'), lines: [] };
  }
  const h = hit as { se: SessionExercise; set: SetRecord; n: number };
  const set = h.set;
  const weightKg = a.kg ?? set.weightKg ?? set.target?.weightKg;
  const reps = a.reps ?? set.reps ?? set.target?.repMax;
  const next: SetRecord = { ...set, weightKg, reps, ...(a.which === 'current' ? { done: true, completedAt: Date.now() } : {}) };
  st.mutateActive((x) => ({ ...x, exercises: x.exercises.map((b) => (b.id === h.se.id ? { ...b, sets: b.sets.map((q) => (q.id === set.id ? next : q)) } : b)) }));
  // a working set just done starts the rest, as ticking it would (not after the last set of the workout)
  const after = useStore.getState().active;
  if (a.which === 'current' && set.type === 'working' && after?.exercises.some((e) => e.sets.some((x) => !x.done))) {
    startRest(h.se.restSec ?? st.settings.restDefaultSec, h.se.exerciseId);
  }
  const ex = exOf(h.se.exerciseId);
  const label = set.type === 'warmup' ? t('Warm-up') : `${t('Set')} ${h.se.sets.slice(0, h.n).filter((q) => q.type === 'working').length}`;
  return {
    id: uid('r'), kind: 'sets', title: a.which === 'last' ? t('Set corrected') : t('Set logged'),
    lines: [{ text: ex ? exLabel(ex, lang) : '', sub: `${label} · ${a.which === 'last' ? `${show(set)} → ` : ''}${show(next)}` }],
    undo: () => useStore.getState().mutateActive(() => before),
  };
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
  const act = list[list.length - 1];
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
    const ended = st.memory.filter((m) => m.until && m.until < ctx.today).sort((x, y) => x.until!.localeCompare(y.until!))[0];
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
  for (const r of rows) {
    const { food, online } = await findFood(r, st.settings.foodLookup);
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
    doneSubtitle: t('Saved to your recipes'),
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
          void doLogFood({ type: 'log_food', foods: o.foods, meal: a.meal ?? null, day: null }, ctx).then((r) => {
            useUI.getState().toast(r.title, { tone: r.kind === 'miss' ? 'bad' : 'ok', actionLabel: r.undo ? t('Undo') : undefined, onAction: r.undo });
          });
        },
      },
    };
  });
}

function doLogSets(a: Extract<AgentAction, { type: 'log_sets' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const pool = allExercises(st.exercises);
  const usage = new Map<string, number>();
  for (const ses of st.sessions) for (const e of ses.exercises) usage.set(e.exerciseId, (usage.get(e.exerciseId) ?? 0) + 1);
  const w = st.settings.units.weight;
  const lines: AgentResult['lines'] = [];
  const hadActive = !!st.active;
  const added: { seId: string; filled: string[]; appended: string[]; created: boolean }[] = [];

  for (const item of a.exercises) {
    const c = matchExercises(item.exercise, pool, lang, 5, (e) => Math.min(0.12, (usage.get(e.id) ?? 0) * 0.02));
    const top = c[0]?.score ?? 0;
    const ok = c.length > 0 && top >= 0.6; // a tie goes to the best (most used, then shortest name); the card says what it matched
    if (!ok) { lines.push({ text: item.exercise, sub: c.length ? `${t('Which one?')} ${c.slice(0, 3).map((x) => x.ex.name).join(' · ')}` : t('Not in your exercise library'), warn: true }); continue; }
    const ex = c[0].ex;
    if (!useStore.getState().active) useStore.getState().startWorkout({ name: '' });
    // reuse the exercise block if it is already in the session (a second "bench" adds to the same one)
    const existing = [...useStore.getState().active!.exercises].reverse().find((e) => e.exerciseId === ex.id);
    const created = !existing;
    if (created) addExercises([ex.id]);
    const filled: string[] = []; const appended: string[] = [];
    let seId = '';
    useStore.getState().mutateActive((s) => {
      const exs = s.exercises.map((e) => ({ ...e }));
      const tgt = [...exs].reverse().find((e) => e.exerciseId === ex.id);
      if (!tgt) return s;
      seId = tgt.id;
      const fresh: SetRecord[] = item.sets.map((x) => ({ id: uid('s'), type: 'working', weightKg: x.kg ?? undefined, reps: x.reps ?? undefined, durationSec: x.durationSec ?? undefined, distanceM: x.distanceKm ? x.distanceKm * 1000 : undefined, done: true, completedAt: Date.now() }));
      // planned, unfinished sets (a routine's blanks) are filled first, the rest are appended
      const out = tgt.sets.map((q) => {
        if (!q.done && q.type !== 'warmup' && fresh.length) { const s0 = fresh.shift()!; filled.push(q.id); return { ...s0, id: q.id, target: q.target } as SetRecord; }
        return q;
      });
      for (const s0 of fresh) { out.push(s0); appended.push(s0.id); }
      tgt.sets = out;
      return { ...s, exercises: exs };
    });
    added.push({ seId, filled, appended, created });
    const line = item.sets.map((x) => `${x.kg ? `${fmtNum(kgToDisplay(x.kg, w), lang, 2)} ${w} × ` : ''}${x.reps ?? (x.durationSec ? `${x.durationSec}s` : x.distanceKm ? `${x.distanceKm} km` : '?')}`).join('  ·  ');
    const tied = c.length > 1 && top - c[1].score < 0.06;
    lines.push({ text: lang === 'da' && ex.nameDa ? ex.nameDa : ex.name, sub: `${line}${tied ? ` · ${t('best match for')} “${item.exercise}”` : ''}` });
  }

  if (!added.length) return { id: uid('r'), kind: 'miss', title: t('Couldn’t log that'), lines };
  const startedHere = !hadActive;
  const nSets = added.reduce((n, x) => n + x.filled.length + x.appended.length, 0);
  return {
    id: uid('r'), kind: 'sets', title: nSets === 1 ? t('Logged 1 set') : t('Logged {n} sets', { n: nSets }), lines,
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
      const after = useStore.getState().active;
      if (startedHere && after && after.exercises.every((e) => e.sets.every((q) => !q.done))) useStore.getState().discardActive();
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
        case 'log_food': out.push(await doLogFood(a, ctx)); break;
        case 'log_sets': out.push(doLogSets(a, ctx)); break;
        case 'log_water': out.push(doWater(a, ctx)); break;
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
        case 'remove_exercise': out.push(doRemoveExercise(a, ctx)); break;
        case 'replace_exercise': out.push(doReplaceExercise(a, ctx)); break;
        case 'create_routine': out.push(doCreateRoutine(a, ctx)); break;
        case 'edit_routine': out.push(doEditRoutine(a, ctx)); break;
        case 'delete_routine': out.push(doDeleteRoutine(a, ctx)); break;
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
  const weight = raw.match(/\b(?:i weigh|weigh(?:ed)?|weight|vejer|vægt|vaegt)\b\D{0,14}(\d{2,3}(?:[.,]\d+)?)\s*(?:kg|kilo)?/i);
  if (weight) { const kg = Number(weight[1].replace(',', '.')); if (kg >= 25 && kg <= 400) return [{ type: 'log_weight', kg }]; }
  const wr = parseWorkoutText(raw).filter((r) => r.sets.some((s) => s.reps || s.weightKg || s.durationSec || s.distanceM));
  if (wr.length) return [{ type: 'log_sets', exercises: wr.map((r) => ({ exercise: r.query, sets: r.sets.map((s) => ({ kg: s.weightKg ?? null, reps: s.reps ?? null, durationSec: s.durationSec ?? null, distanceKm: s.distanceM ? s.distanceM / 1000 : null })) })) }];
  const stripped = raw.replace(/^\s*(?:please\s+)?(?:log|add|i\s+(?:ate|had|drank)|ate|had|spiste|jeg\s+(?:spiste|drak|har\s+spist)|logge?)\s+/i, '');
  if (stripped !== raw || /^\d/.test(raw)) {
    const rows = parseFoodText(stripped);
    if (rows.length) return [{ type: 'log_food', foods: rows.map((r) => ({ name: r.query, amount: r.amount ?? null, unit: r.dim === 'count' ? (r.countWord ?? 'piece') : r.dim })), meal: null, day: 'today' }];
  }
  return null;
}
