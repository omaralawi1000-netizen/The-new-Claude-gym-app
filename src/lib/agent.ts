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
import { useStore, foodPool, allExercises } from '../state/store';
import { useUI } from '../state/ui';
import { addDays } from './dates';
import { defaultMealId, mealName } from './derive';
import { fold, parseFoodText, resolveRows, rowQuantity, type ParsedFoodRow } from './foodText';
import { matchExercises, parseWorkoutText } from './workoutText';
import { entryFromSnapshot, quickEntry, snapshotOf, uid } from './nutrition';
import { searchOnline } from './foodApi';
import { type Brain } from './gemini';
import { estimateFood } from './brain';
import { ACTIVITY_KINDS, ACTIVITY_LABEL } from './activity';
import { fmtNum, kgToDisplay } from './units';
import type { ActivityKind, Exercise, Food, FoodEntry, Meal, MemoryKind, MemoryNote, Quantity, RoutineItem, SessionExercise, SetRecord, Settings } from './types';
import { MEMORY_KINDS, MEMORY_MAX } from '../state/defaults';
import { addExercises, replaceExercise, startRest } from '../screens/workout/actions';
import { EQUIP_LABEL, MUSCLE_LABEL } from '../screens/workout/common';

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
  | { type: 'set_setting'; key: SettingKey; value: string }
  | { type: 'edit_food'; target: string; day?: string | null; meal_from?: string | null; amount?: number | null; unit?: string | null; meal?: string | null; per100?: NutriFix | null; totals?: NutriFix | null }
  | { type: 'delete_food'; target?: string | null; day?: string | null; meal?: string | null }
  | { type: 'move_food'; target?: string | null; meal_from?: string | null; day?: string | null; meal_to?: string | null; day_to?: string | null }
  | { type: 'copy_food'; target?: string | null; meal_from?: string | null; day?: string | null; meal_to?: string | null; day_to?: string | null }
  | { type: 'replace_food'; target: string; meal_from?: string | null; day?: string | null; with: AgentFood }
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
  | { type: 'remember'; text: string; kind: MemoryKind; exercise?: string | null }
  | { type: 'forget'; memory?: number | null; target?: string | null }
  | { type: 'show_exercise'; exercise: string }
  | { type: 'suggest_food'; options: { label: string; foods: AgentFood[]; totals: NutriFix | null }[]; meal?: string | null }
  | { type: 'undo_last' };

export interface RoutineBit { exercise: string; sets?: number | null; repMin?: number | null; repMax?: number | null; restSec?: number | null }
/** "today" | "yesterday" | YYYY-MM-DD, anything else is "not said". */
const dayArg = (v: unknown): string | null => (v === 'yesterday' ? 'yesterday' : v === 'today' ? 'today' : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const resolveDay = (d: string | null | undefined, today: string): string | undefined => (d === 'yesterday' ? addDays(today, -1) : d === 'today' ? today : d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
const routineBit = (b: any): RoutineBit | null => { const exercise = str(b?.exercise, 60); return exercise ? { exercise, sets: num(b?.sets, 1, 10) ?? null, repMin: num(b?.repMin, 1, 100) ?? null, repMax: num(b?.repMax, 1, 100) ?? null, restSec: num(b?.restSec, 15, 600) ?? null } : null; };
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

export const SETTING_KEYS = ['theme', 'language', 'weightUnit', 'distanceUnit', 'motion', 'sound', 'haptics', 'restSeconds', 'kcalGoal', 'proteinGoal', 'carbsGoal', 'fatGoal', 'waterGoal', 'weekStart', 'foodLookup', 'effort'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
const SETTINGS_SECTIONS = ['targets', 'training', 'food', 'units', 'look', 'reminders', 'data', 'privacy', 'ai', 'about'];

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
        const target = str(a.target, 60); if (!target) break;
        const e: AgentAction = { type: 'edit_food', target, day: dayArg(a.day), meal_from: str(a.meal_from, 30) ?? null, amount: num(a.amount, 0.01, 20000) ?? null, unit: str(a.unit, 12) ?? null, meal: str(a.meal, 30) ?? null, per100: nutriFix(a.per100, true), totals: nutriFix(a.totals, false) };
        if (e.amount || e.meal || e.per100 || e.totals) out.push(e);
        break;
      }
      case 'delete_food': { const target = str(a.target, 60) ?? null, meal = str(a.meal, 30) ?? null; if (target || meal) out.push({ type: 'delete_food', target, meal, day: dayArg(a.day) }); break; }
      case 'move_food': case 'copy_food': {
        const target = str(a.target, 60) ?? null, meal_from = str(a.meal_from, 30) ?? null, meal_to = str(a.meal_to, 30) ?? null, day_to = dayArg(a.day_to);
        if ((target || meal_from) && (meal_to || day_to)) out.push({ type: a.type, target, meal_from, day: dayArg(a.day), meal_to, day_to });
        break;
      }
      case 'replace_food': {
        const target = str(a.target, 60), w = a.with, name = str(w?.name, 60); if (!target || !name) break;
        out.push({ type: 'replace_food', target, meal_from: str(a.meal_from, 30) ?? null, day: dayArg(a.day), with: { name, brand: str(w?.brand, 40) ?? null, amount: num(w?.amount, 0.01, 20000) ?? null, unit: str(w?.unit, 12) ?? null, state: ['raw', 'cooked', 'dry'].includes(w?.state) ? w.state : null } });
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
      case 'remember': { const text = str(a.text, 200); if (text) out.push({ type: 'remember', text, kind: MEMORY_KINDS.includes(a.kind) ? a.kind : 'other', exercise: str(a.exercise, 60) ?? null }); break; }
      case 'show_exercise': { const exercise = str(a.exercise, 60); if (exercise) out.push({ type: 'show_exercise', exercise }); break; }
      case 'forget': {
        const n = typeof a.memory === 'number' ? a.memory : typeof a.memory === 'string' && /^\d{1,3}$/.test(a.memory.trim()) ? Number(a.memory.trim()) : undefined;
        const target = str(a.target, 120) ?? str(a.text, 120) ?? null;
        if (n || target) out.push({ type: 'forget', memory: n ?? null, target });
        break;
      }
      case 'navigate': {
        const screen = ['today', 'train', 'food', 'progress', 'settings', 'coach'].includes(a.screen) ? a.screen : null; if (!screen) break;
        out.push({ type: 'navigate', screen, section: SETTINGS_SECTIONS.includes(a.section) ? a.section : null });
        break;
      }
      case 'set_setting': {
        if (!(SETTING_KEYS as readonly string[]).includes(a.key)) break;
        const value = str(a.value, 20); if (value === undefined) break;
        out.push({ type: 'set_setting', key: a.key, value });
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
  kind: 'food' | 'sets' | 'water' | 'weight' | 'activity' | 'workout' | 'routine' | 'nav' | 'setting' | 'memory' | 'miss';
  title: string;
  lines: { text: string; sub?: string; warn?: boolean }[];
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
    // the food: a clear match, or the best one when it is clearly ahead
    let food: Food | undefined = r.status === 'resolved' ? r.candidates.find((c) => c.food.id === r.choiceId)?.food : undefined;
    if (!food && r.status === 'ambiguous' && r.candidates[0] && r.candidates[0].score >= 0.5) food = r.candidates[0].food;
    // nothing in the bundled/own foods: try the online databases (bounded), unless the user turned lookups off
    if (!food && st.settings.foodLookup) {
      const hit = await Promise.race([searchOnline(r.query).then((x) => x.foods[0]), new Promise<undefined>((ok) => setTimeout(() => ok(undefined), 4000))]).catch(() => undefined);
      if (hit) { food = hit; toSave.push(hit); }
    }
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
        lines.push({ text: lang === 'da' && food.nameDa ? food.nameDa : food.name, sub: `${label}${kcalOf(entry) !== undefined ? ` · ${kcalOf(entry)} kcal` : ''}${guessed ? ` · ${t('typical portion')}` : ''}`, warn: false });
        continue;
      }
    }
    // still nothing (or no usable quantity): an AI estimate, clearly labelled — or an honest miss
    if (ctx.brain) {
      try {
        const est = await estimateFood(r.amount !== undefined ? `${r.amount} ${r.dim === 'count' ? (r.countWord ?? '') : r.dim} ${r.query}`.trim() : r.query, ctx.brain, lang);
        const q = quickEntry(`${est.name} (${t('AI estimate')})`, { kcal: est.kcal, protein: est.protein, carbs: est.carbs, fat: est.fat }, date, mealId);
        entries.push({ ...q, estimated: true, note: est.assumptions || undefined });
        lines.push({ text: est.name, sub: `${Math.round(est.kcal)} kcal · ${t('AI estimate')}`, warn: true });
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

/** Everything in a meal on a day (or the whole day). */
function mealItems(date: string, mealId: string | undefined) {
  return useStore.getState().entries.filter((e) => e.date === date && (!mealId || e.mealId === mealId));
}

const kcalStr = (e: FoodEntry) => (kcalOf(e) !== undefined ? `${kcalOf(e)} kcal` : '— kcal');
const notFound = (ctx: AgentCtx, what: string): AgentResult => ({ id: uid('r'), kind: 'miss', title: ctx.t('Couldn’t find that in the log'), lines: [{ text: what, warn: true }] });

function doEditFood(a: Extract<AgentAction, { type: 'edit_food' }>, ctx: AgentCtx): AgentResult {
  const { t, lang } = ctx;
  const st = useStore.getState();
  const prev = findEntry(a.target, searchDays(a.day, ctx), mealIdOf(a.meal_from, ctx));
  if (!prev) return notFound(ctx, a.target);
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
    lines: [{ text: prev.snap.name, sub: `${kcalStr(prev)} → ${kcalStr(next)} · ${changed.join(' · ')}` }],
    undo: () => { const s = useStore.getState(); s.updateEntry(prev.id, prev); if (own) s.saveFood(own); },
  };
}

function doDeleteFood(a: Extract<AgentAction, { type: 'delete_food' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  let list: FoodEntry[];
  if (a.target) { const e = findEntry(a.target, searchDays(a.day, ctx), mealIdOf(a.meal, ctx)); if (!e) return notFound(ctx, a.target); list = [e]; }
  else {
    const date = resolveDay(a.day, ctx.today) ?? ctx.date ?? ctx.today;
    const all = fold(a.meal ?? '') === 'all' || fold(a.meal ?? '') === 'day';
    const mid = all ? undefined : mealIdOf(a.meal, ctx);
    if (!all && !mid) return notFound(ctx, a.meal ?? '');
    list = mealItems(date, mid);
    if (!list.length) return { id: uid('r'), kind: 'miss', title: t('Nothing to remove'), lines: [{ text: `${mid ? mealLabelOf(mid, ctx) : t('Today')} · ${dayLabel(date, ctx)}` }] };
  }
  list.forEach((e) => useStore.getState().removeEntry(e.id));
  const total = list.reduce((n, e) => n + (e.nutrients.kcal ?? 0), 0);
  return {
    id: uid('r'), kind: 'food', title: t('Removed'),
    lines: [...list.slice(0, 8).map((e) => ({ text: e.snap.name, sub: kcalStr(e) })), ...(list.length > 1 ? [{ text: t('Total'), sub: `${Math.round(total)} kcal` }] : [])],
    undo: () => useStore.getState().restoreEntries(list),
  };
}

/** Move or copy: one item, or a whole meal, to another meal and/or day. */
function doMoveCopy(a: Extract<AgentAction, { type: 'move_food' | 'copy_food' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const copy = a.type === 'copy_food';
  const fromMeal = mealIdOf(a.meal_from, ctx);
  let list: FoodEntry[];
  if (a.target) { const e = findEntry(a.target, searchDays(a.day, ctx), fromMeal); if (!e) return notFound(ctx, a.target); list = [e]; }
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
    return { id: uid('r'), kind: 'food', title: t('Copied to {where}', { where: dest }), lines: list.slice(0, 8).map((e) => ({ text: e.snap.name, sub: kcalStr(e) })), undo: () => copies.forEach((e) => useStore.getState().removeEntry(e.id)) };
  }
  list = list.filter((e) => (toMeal && e.mealId !== toMeal) || (toDate && e.date !== toDate));
  if (!list.length) return { id: uid('r'), kind: 'miss', title: t('Already there'), lines: [{ text: dest }] };
  list.forEach((e) => st.moveEntry(e.id, { date: toDate, mealId: toMeal }));
  return {
    id: uid('r'), kind: 'food', title: t('Moved to {where}', { where: dest }), lines: list.slice(0, 8).map((e) => ({ text: e.snap.name, sub: `${mealLabelOf(e.mealId, ctx)} → ${dest}` })),
    undo: () => list.forEach((e) => useStore.getState().moveEntry(e.id, { date: e.date, mealId: e.mealId })),
  };
}

/** Swap a logged food for another one: same meal, same day, and — unless a new amount was said — the same amount. */
async function doReplaceFood(a: Extract<AgentAction, { type: 'replace_food' }>, ctx: AgentCtx): Promise<AgentResult> {
  const { t } = ctx;
  const old = findEntry(a.target, searchDays(a.day, ctx), mealIdOf(a.meal_from, ctx));
  if (!old) return notFound(ctx, a.target);
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
    return { id: uid('r'), kind: 'routine', title: t('Routine updated'), lines: [{ text: r.name, sub: `${nameOf(item.exerciseId)} → ${exLabel(to, lang)}` }], undo: () => useStore.getState().upsertRoutine(r) };
  }
  // in the running workout
  if (!st.active) return { id: uid('r'), kind: 'miss', title: t('No workout is running'), lines: [{ text: t('Say which routine to change, or start a workout first.') }] };
  const hit = findBlock(a.from, st.active, lang);
  if (!hit) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that exercise in the workout'), lines: [{ text: a.from, warn: true }] };
  const prev = st.active.exercises;
  replaceExercise(hit.block.id, to.id);
  return {
    id: uid('r'), kind: 'workout', title: t('Exercise swapped'), lines: [{ text: exLabel(hit.ex, lang), sub: `→ ${exLabel(to, lang)}` }],
    button: { label: t('Open workout'), run: () => useUI.getState().push('workout', { origin: 'none' }) },
    undo: () => useStore.getState().mutateActive((x) => ({ ...x, exercises: prev })),
  };
}

function itemsFrom(list: RoutineBit[], lang: 'en' | 'da') {
  const items: RoutineItem[] = []; const skipped: string[] = [];
  for (const b of list) {
    const ex = findExercise(b.exercise, lang);
    if (!ex) { skipped.push(b.exercise); continue; }
    const timed = ex.logType === 'duration' || ex.logType === 'distance';
    const repMin = b.repMin ?? 8, repMax = Math.max(repMin, b.repMax ?? Math.max(repMin, 12));
    items.push({ id: uid('ri'), exerciseId: ex.id, warmupSets: 0, workingSets: timed ? 1 : b.sets ?? 3, repMin, repMax, restSec: b.restSec ?? 90 });
  }
  return { items, skipped };
}

function doCreateRoutine(a: Extract<AgentAction, { type: 'create_routine' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const { items, skipped } = itemsFrom(a.items, ctx.lang);
  if (!items.length) return { id: uid('r'), kind: 'miss', title: t('Couldn’t build that routine'), lines: skipped.map((n) => ({ text: n, sub: t('Not in your exercise library'), warn: true })) };
  const now = Date.now();
  const r = { id: uid('r'), name: a.name, items, createdAt: now, updatedAt: now };
  useStore.getState().upsertRoutine(r);
  const pool = allExercises(useStore.getState().exercises);
  return {
    id: uid('r'), kind: 'routine', title: t('Routine created'),
    lines: [{ text: a.name, sub: `${items.length} ${t('exercises')}` }, ...items.map((i) => ({ text: exLabel(pool.find((e) => e.id === i.exerciseId)!, ctx.lang), sub: `${i.workingSets} × ${i.repMin}–${i.repMax}` })), ...skipped.map((n) => ({ text: n, sub: t('Not in your exercise library'), warn: true }))],
    undo: () => useStore.getState().deleteRoutine(r.id),
  };
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
    const nx = { ...it, workingSets: b.sets ?? it.workingSets, repMin, repMax, restSec: b.restSec ?? it.restSec };
    items = items.map((i) => (i === it ? nx : i));
    lines.push({ text: nameOf(it.exerciseId), sub: `${it.workingSets} × ${it.repMin}–${it.repMax} → ${nx.workingSets} × ${nx.repMin}–${nx.repMax}` });
  }
  if (a.add?.length) { const m = itemsFrom(a.add, lang); items = [...items, ...m.items]; m.items.forEach((i) => lines.push({ text: nameOf(i.exerciseId), sub: `${t('added')} · ${i.workingSets} × ${i.repMin}–${i.repMax}` })); m.skipped.forEach((n) => lines.push({ text: n, sub: t('Not in your exercise library'), warn: true })); }
  if (a.rename) lines.unshift({ text: r.name, sub: `→ ${a.rename}` });
  if (!lines.length || lines.every((l) => l.warn)) return { id: uid('r'), kind: 'miss', title: t('Couldn’t change that routine'), lines };
  st.upsertRoutine({ ...r, name: a.rename ?? r.name, items });
  return { id: uid('r'), kind: 'routine', title: t('Routine updated'), lines: [{ text: a.rename ?? r.name }, ...lines], undo: () => useStore.getState().upsertRoutine(r) };
}

function doDeleteRoutine(a: Extract<AgentAction, { type: 'delete_routine' }>, ctx: AgentCtx): AgentResult {
  const r = findRoutine(a.routine);
  if (!r) return { id: uid('r'), kind: 'miss', title: ctx.t('Couldn’t find that routine'), lines: [{ text: a.routine, warn: true }] };
  const st = useStore.getState();
  const sch = st.schedule;
  st.deleteRoutine(r.id);
  return { id: uid('r'), kind: 'routine', title: ctx.t('Routine deleted'), lines: [{ text: r.name, sub: `${r.items.length} ${ctx.t('exercises')}` }], undo: () => { const s = useStore.getState(); s.restoreRoutine(r); s.setSchedule(sch); } };
}

function doDeleteWorkout(a: Extract<AgentAction, { type: 'delete_workout' }>, ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const done = useStore.getState().sessions.filter((s) => s.status === 'done');
  const w = a.workout ? fold(a.workout) : '';
  const ses = !w || w === 'last' ? done[done.length - 1] : [...done].reverse().find((s) => s.date === a.workout || fold(s.name).includes(w));
  if (!ses) return { id: uid('r'), kind: 'miss', title: t('Couldn’t find that workout'), lines: a.workout ? [{ text: a.workout, warn: true }] : [] };
  useStore.getState().deleteSession(ses.id);
  return { id: uid('r'), kind: 'workout', title: t('Workout deleted'), lines: [{ text: ses.name || t('Workout'), sub: `${ses.date} · ${ses.exercises.length} ${t('exercises')}` }], undo: () => useStore.getState().restoreSession(ses) };
}

function doDiscardWorkout(ctx: AgentCtx): AgentResult {
  const { t } = ctx;
  const st = useStore.getState();
  if (!st.active) return { id: uid('r'), kind: 'miss', title: t('No workout is running'), lines: [] };
  const done = st.active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  return {
    id: uid('r'), kind: 'workout', pending: true, title: t('Discard this workout?'), lines: [{ text: st.active.name || t('Workout'), sub: t('{n} sets done', { n: done }) }],
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
  const fields = { text: a.text, kind: a.kind, ...(ex ? { exerciseIds: [ex.id] } : {}) };
  const twin = st.memory.find((m) => sameNote(m.text, a.text));
  const more = { label: t('See all'), run: openMemory };
  if (twin) {
    const before = { ...twin };
    st.updateMemory(twin.id, fields);
    return { id: uid('r'), kind: 'memory', title: t('Memory updated'), lines: [{ text: a.text, sub: ex ? exLabel(ex, lang) : undefined }], button: more, undo: () => useStore.getState().updateMemory(before.id, before) };
  }
  if (st.memory.length >= MEMORY_MAX) return { id: uid('r'), kind: 'miss', title: t('Memory is full'), lines: [{ text: a.text, sub: t('Remove something in Settings → Coach memory first'), warn: true }], button: more };
  const note = st.addMemory(fields);
  return { id: uid('r'), kind: 'memory', title: t('Remembered'), lines: [{ text: note.text, sub: ex ? exLabel(ex, lang) : undefined }], button: more, undo: () => useStore.getState().removeMemory(note.id) };
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
function doSuggest(a: Extract<AgentAction, { type: 'suggest_food' }>, ctx: AgentCtx): AgentResult[] {
  const { t, lang } = ctx;
  return a.options.map((o) => {
    const tot = o.totals;
    const about = tot && (tot.kcal !== undefined || tot.protein !== undefined) ? [tot.kcal !== undefined ? `${Math.round(tot.kcal)} kcal` : '', tot.protein !== undefined ? `${Math.round(tot.protein)} g ${t('protein')}` : ''].filter(Boolean).join(' · ') : '';
    const amount = (f: AgentFood) => !f.amount ? undefined : f.unit === 'piece' || !f.unit ? `${fmtNum(f.amount, lang, 1)} ${f.amount === 1 ? t('piece') : t('pieces')}` : `${fmtNum(f.amount, lang, 1)} ${f.unit}`;
    return {
      id: uid('r'), kind: 'food' as const, title: o.label, pending: true, offer: true, subtitle: about ? `≈ ${about}` : undefined,
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
  const w = a.routine ? fold(a.routine) : '';
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
    id: uid('r'), kind: 'workout', pending: true, title: t('Finish this workout?'), lines: [{ text: st.active.name || t('Workout'), sub: t('{n} sets done', { n: done }) }],
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

// settings the Coach may change: all reversible, all with Undo
const BOOL = (v: string) => (/^(on|true|yes|1|enable|enabled|til|ja)$/i.test(v) ? true : /^(off|false|no|0|disable|disabled|fra|nej)$/i.test(v) ? false : undefined);
function settingPatch(key: SettingKey, value: string, cur: Settings): { patch: Partial<Settings>; label: string; show: string } | null {
  const v = value.toLowerCase();
  const n = Number(value.replace(',', '.'));
  switch (key) {
    case 'theme': return ['light', 'dark', 'system'].includes(v) ? { patch: { theme: v as Settings['theme'] }, label: 'Theme', show: v } : null;
    case 'language': return v === 'da' || v === 'en' ? { patch: { language: v as Settings['language'] }, label: 'Language', show: v === 'da' ? 'Dansk' : 'English' } : null;
    case 'weightUnit': return v === 'kg' || v === 'lb' ? { patch: { units: { ...cur.units, weight: v } }, label: 'Weight unit', show: v } : null;
    case 'distanceUnit': return v === 'km' || v === 'mi' ? { patch: { units: { ...cur.units, distance: v } }, label: 'Distance unit', show: v } : null;
    case 'motion': return ['system', 'reduce', 'full'].includes(v) ? { patch: { motion: v as Settings['motion'] }, label: 'Motion', show: v } : null;
    case 'sound': { const b = BOOL(v); return b === undefined ? null : { patch: { sound: b }, label: 'Sound', show: b ? 'on' : 'off' }; }
    case 'haptics': { const b = BOOL(v); return b === undefined ? null : { patch: { haptics: b }, label: 'Haptics', show: b ? 'on' : 'off' }; }
    case 'foodLookup': { const b = BOOL(v); return b === undefined ? null : { patch: { foodLookup: b }, label: 'Online food lookup', show: b ? 'on' : 'off' }; }
    case 'restSeconds': return Number.isFinite(n) && n >= 15 && n <= 600 ? { patch: { restDefaultSec: Math.round(n) }, label: 'Default rest', show: `${Math.round(n)} s` } : null;
    case 'kcalGoal': return Number.isFinite(n) && n >= 800 && n <= 8000 ? { patch: { goals: { ...cur.goals, kcal: Math.round(n) } }, label: 'Calorie target', show: `${Math.round(n)} kcal` } : null;
    case 'proteinGoal': return Number.isFinite(n) && n >= 10 && n <= 500 ? { patch: { goals: { ...cur.goals, protein: Math.round(n) } }, label: 'Protein target', show: `${Math.round(n)} g` } : null;
    case 'carbsGoal': return Number.isFinite(n) && n >= 10 && n <= 1000 ? { patch: { goals: { ...cur.goals, carbs: Math.round(n) } }, label: 'Carb target', show: `${Math.round(n)} g` } : null;
    case 'fatGoal': return Number.isFinite(n) && n >= 10 && n <= 500 ? { patch: { goals: { ...cur.goals, fat: Math.round(n) } }, label: 'Fat target', show: `${Math.round(n)} g` } : null;
    case 'waterGoal': return Number.isFinite(n) && n >= 500 && n <= 10000 ? { patch: { goals: { ...cur.goals, waterMl: Math.round(n) } }, label: 'Water target', show: `${Math.round(n)} ml` } : null;
    case 'weekStart': return v === 'monday' || v === 'sunday' ? { patch: { weekStart: v === 'monday' ? 1 : 0 }, label: 'Week starts on', show: v } : null;
    case 'effort': return ['off', 'rpe', 'rir'].includes(v) ? { patch: { effort: v as Settings['effort'] }, label: 'Effort scale', show: v } : null;
  }
}

function doSetting(a: Extract<AgentAction, { type: 'set_setting' }>, ctx: AgentCtx): AgentResult {
  const st = useStore.getState();
  const r = settingPatch(a.key, a.value, st.settings);
  if (!r) return { id: uid('r'), kind: 'miss', title: ctx.t('Couldn’t change that setting'), lines: [{ text: `${a.key} = ${a.value}`, warn: true }] };
  const prev: Partial<Settings> = {};
  for (const k of Object.keys(r.patch) as (keyof Settings)[]) (prev as any)[k] = (st.settings as any)[k];
  st.updateSettings(r.patch);
  return { id: uid('r'), kind: 'setting', title: ctx.t('Setting changed'), lines: [{ text: ctx.t(r.label), sub: r.show }], undo: () => useStore.getState().updateSettings(prev) };
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
        case 'suggest_food': out.push(...doSuggest(a, ctx)); break;
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
