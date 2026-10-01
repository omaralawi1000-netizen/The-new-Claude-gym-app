/**
 * The Coach as an assistant with hands. One message in ("log a banana", "bench 100 kilos for 8", "switch to light
 * mode", "how do I back up my data?") → a short reply plus the actions to carry out.
 *
 * Principles:
 *  - The model only ever proposes; THIS file decides what is allowed and does it. Every field is validated and clamped.
 *  - Everything it does on its own is reversible and comes back as a card with Undo. Things that cannot simply be
 *    undone (finishing a workout) wait for one tap. Deleting data is not something it can do at all.
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
import { aiEstimateFood, type Brain } from './gemini';
import { ACTIVITY_KINDS, ACTIVITY_LABEL } from './activity';
import { fmtNum, kgToDisplay } from './units';
import type { ActivityKind, Food, FoodEntry, Meal, Quantity, SetRecord, Settings } from './types';
import { addExercises } from '../screens/workout/actions';

// ── what the model may ask for ──────────────────────────────

export interface AgentFood { name: string; brand?: string | null; amount?: number | null; unit?: string | null; state?: string | null }
export interface AgentSet { kg?: number | null; reps?: number | null; durationSec?: number | null; distanceKm?: number | null }
export type AgentAction =
  | { type: 'log_food'; foods: AgentFood[]; meal?: string | null; day?: 'today' | 'yesterday' | null }
  | { type: 'log_water'; ml: number }
  | { type: 'log_weight'; kg: number }
  | { type: 'log_sets'; exercises: { exercise: string; sets: AgentSet[] }[] }
  | { type: 'log_activity'; kind: ActivityKind; minutes: number; rounds?: number; intensity?: 1 | 2 | 3; note?: string }
  | { type: 'start_workout'; routine?: string | null }
  | { type: 'finish_workout' }
  | { type: 'navigate'; screen: 'today' | 'train' | 'food' | 'progress' | 'settings' | 'coach'; section?: string | null }
  | { type: 'set_setting'; key: SettingKey; value: string }
  | { type: 'undo_last' };

export const SETTING_KEYS = ['theme', 'language', 'weightUnit', 'distanceUnit', 'motion', 'sound', 'haptics', 'restSeconds', 'kcalGoal', 'proteinGoal', 'carbsGoal', 'fatGoal', 'waterGoal', 'weekStart', 'foodLookup', 'effort'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
const SETTINGS_SECTIONS = ['targets', 'training', 'food', 'units', 'look', 'reminders', 'data', 'privacy', 'ai', 'about'];

const num = (v: unknown, min: number, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined);
const str = (v: unknown, max = 80): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/** Whatever came back from the model → a safe list of actions (anything odd is dropped, numbers are clamped). */
export function validateAgent(raw: any): { reply: string; actions: AgentAction[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const reply = str(raw.reply, 1800) ?? '';
  const out: AgentAction[] = [];
  for (const a of (Array.isArray(raw.actions) ? raw.actions : []).slice(0, 6)) {
    if (!a || typeof a !== 'object') continue;
    switch (a.type) {
      case 'log_food': {
        const foods = (Array.isArray(a.foods) ? a.foods : []).slice(0, 14).map((f: any): AgentFood | null => {
          const name = str(f?.name, 60); if (!name) return null;
          return { name, brand: str(f?.brand, 40) ?? null, amount: num(f?.amount, 0.01, 20000) ?? null, unit: str(f?.unit, 12) ?? null, state: ['raw', 'cooked', 'dry'].includes(f?.state) ? f.state : null };
        }).filter(Boolean) as AgentFood[];
        if (foods.length) out.push({ type: 'log_food', foods, meal: str(a.meal, 30) ?? null, day: a.day === 'yesterday' ? 'yesterday' : null });
        break;
      }
      case 'log_water': { const ml = num(a.ml, 10, 5000); if (ml) out.push({ type: 'log_water', ml: Math.round(ml) }); break; }
      case 'log_weight': { const kg = num(a.kg, 25, 400); if (kg) out.push({ type: 'log_weight', kg: Math.round(kg * 10) / 10 }); break; }
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
        out.push({ type: 'log_activity', kind, minutes: Math.round(minutes), rounds: num(a.rounds, 1, 99), intensity: [1, 2, 3].includes(a.intensity) ? a.intensity : undefined, note: str(a.note, 200) });
        break;
      }
      case 'start_workout': out.push({ type: 'start_workout', routine: str(a.routine, 60) ?? null }); break;
      case 'finish_workout': out.push({ type: 'finish_workout' }); break;
      case 'undo_last': out.push({ type: 'undo_last' }); break;
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
  kind: 'food' | 'sets' | 'water' | 'weight' | 'activity' | 'workout' | 'nav' | 'setting' | 'miss';
  title: string;
  lines: { text: string; sub?: string; warn?: boolean }[];
  /** reverses everything this card did */
  undo?: () => void;
  /** a button on the card (open the workout, or confirm something that waits for a tap) */
  button?: { label: string; run: () => void };
  /** the card is a question: nothing happened yet */
  pending?: boolean;
}

export interface AgentCtx {
  t: (k: string, v?: Record<string, string | number>) => string;
  lang: 'en' | 'da';
  today: string;
  /** Gemini, for estimating a food that is in no database (optional) */
  brain: Brain | null;
  /** where the user opened the Coach from (the Food tab's day / a meal's + button): the default for foods */
  date?: string; mealId?: string;
}

const MEAL_WORDS: Record<string, string> = { breakfast: 'breakfast', morgenmad: 'breakfast', lunch: 'lunch', frokost: 'lunch', dinner: 'dinner', aftensmad: 'dinner', supper: 'dinner', snack: 'snacks', snacks: 'snacks', mellemmaaltid: 'snacks' };
function resolveMeal(word: string | null | undefined, meals: Meal[], lang: 'en' | 'da'): string | undefined {
  if (!word) return undefined;
  const w = fold(word);
  const byName = meals.find((m) => fold(m.name || '') === w || fold(mealName(m, lang)) === w);
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
  const date = a.day === 'yesterday' ? addDays(ctx.today, -1) : ctx.date ?? ctx.today;
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
        const est = await aiEstimateFood(r.amount !== undefined ? `${r.amount} ${r.dim === 'count' ? (r.countWord ?? '') : r.dim} ${r.query}`.trim() : r.query, ctx.brain, lang);
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
    id: uid('r'), kind: 'sets', title: t('Logged {n} sets', { n: nSets }), lines,
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
  const id = useStore.getState().addWater(a.ml, ctx.today);
  return { id: uid('r'), kind: 'water', title: ctx.t('Water logged'), lines: [{ text: `${fmtNum(a.ml, ctx.lang, 0)} ml` }], undo: () => useStore.getState().removeWater(id) };
}

function doWeight(a: Extract<AgentAction, { type: 'log_weight' }>, ctx: AgentCtx): AgentResult {
  const st = useStore.getState();
  const w = st.addWeight(a.kg, ctx.today);
  const u = st.settings.units.weight;
  return { id: uid('r'), kind: 'weight', title: ctx.t('Weight logged'), lines: [{ text: `${fmtNum(kgToDisplay(a.kg, u), ctx.lang, 1)} ${u}` }], undo: () => useStore.getState().removeWeight(w.id) };
}

function doActivity(a: Extract<AgentAction, { type: 'log_activity' }>, ctx: AgentCtx): AgentResult {
  const log = useStore.getState().addActivity({ date: ctx.today, kind: a.kind, durationSec: a.minutes * 60, rounds: a.rounds, intensity: a.intensity, note: a.note });
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
export async function runActions(actions: AgentAction[], ctx: AgentCtx): Promise<AgentResult[]> {
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
