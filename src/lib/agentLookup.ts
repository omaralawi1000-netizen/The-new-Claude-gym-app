/**
 * The Coach's look-ups: the model sees a compact summary of the user's data in every request, and anything beyond it
 * (older food, every session of one lift, the full plan, all settings…) it asks for here. The phone answers at once from
 * its own data: nothing leaves the device except the answer text, which goes to the same AI as the rest of the turn.
 *
 * Pure: data in, text out (easy to test). Each answer is capped so a look-up can never flood the request.
 */
import type { AppData, Exercise, MuscleGroup } from './types';
import { addDays, diffDays, weekdayOf } from './dates';
import { fold } from './foodText';
import { searchArchive } from './archive';
import { matchExercises } from './workoutText';
import { epley, historyOf, incrementFor, repRange, suggestProgression, elapsedMs } from './workout';
import { MUSCLES, nutritionByDay, setsPerMuscle, stalledLifts, trendRate, weightTrend, average } from './stats';
import { plannedFor } from '../state/store';
import { guideSections } from './coachContext';

import { LOOKUP_KINDS, type LookupKind } from './lookupKinds';
export { LOOKUP_KINDS, type LookupKind };
export interface Lookup { kind: LookupKind; from?: string | null; to?: string | null; query?: string | null; meal?: string | null }

/** Earlier things said to the Coach or the orb (the shared conversation), for the `conversations` look-up. */
export interface SaidLine { at: number; role: 'user' | 'model' | 'cards'; text: string }

export interface LookupEnv {
  today: string;
  lang: 'en' | 'da';
  /** every exercise (catalog + own) */
  pool: Exercise[];
  mealLabel: (id: string) => string;
  /** the conversation so far, oldest first */
  said?: readonly SaidLine[];
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const MAX = 6000; // characters per answer

/** The model's request → a safe look-up (anything odd is dropped). */
export function validateLookups(v: unknown): Lookup[] {
  return (Array.isArray(v) ? v : []).slice(0, 20).map((x: any): Lookup | null => {
    if (!x || !(LOOKUP_KINDS as readonly string[]).includes(x.kind)) return null;
    const s = (y: unknown, n = 60) => (typeof y === 'string' && y.trim() ? y.trim().slice(0, n) : null);
    return { kind: x.kind, from: isDate(x.from) ? x.from : null, to: isDate(x.to) ? x.to : null, query: s(x.query), meal: s(x.meal, 30) };
  }).filter(Boolean).slice(0, 6) as Lookup[];
}

/** A date range: what was asked, else the last `days` days up to today (never more than about two years). */
function range(l: Lookup, env: LookupEnv, days: number): [string, string] {
  const to = l.to && l.to <= env.today ? l.to : env.today;
  let from = l.from ?? addDays(to, -(days - 1));
  if (diffDays(to, from) > 800) from = addDays(to, -800);
  return from <= to ? [from, to] : [to, from];
}

const cap = (lines: string[], note = 'more not shown; ask for a narrower range'): string => {
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    if (out.length + lines[i].length > MAX) return `${out}… (${lines.length - i} ${note})`;
    out += (out ? '\n' : '') + lines[i];
  }
  return out || '(nothing)';
};

const exLabel = (e: Exercise | undefined, id: string) => (e ? e.name : id);

/** The exercise a name means, with the user's own usage breaking ties. */
function findEx(name: string, d: AppData, env: LookupEnv): Exercise | undefined {
  const usage = new Map<string, number>();
  for (const s of d.sessions) for (const e of s.exercises) usage.set(e.exerciseId, (usage.get(e.exerciseId) ?? 0) + 1);
  const c = matchExercises(name, env.pool, env.lang, 3, (e) => Math.min(0.12, (usage.get(e.id) ?? 0) * 0.02));
  return c.length && c[0].score >= 0.5 ? c[0].ex : undefined;
}

const setTxt = (q: AppData['sessions'][number]['exercises'][number]['sets'][number]) =>
  `${q.type === 'warmup' ? 'W ' : ''}${q.weightKg ? `${r1(q.weightKg)}kg×` : ''}${q.reps ?? (q.durationSec ? `${q.durationSec}s` : q.distanceM ? `${r1(q.distanceM / 1000)}km` : '—')}${q.rpe ? ` @RPE${q.rpe}` : ''}`;

function food(d: AppData, l: Lookup, env: LookupEnv): string {
  const [from, to] = l.query ? range(l, env, 120) : range(l, env, 7);
  const q = l.query ? fold(l.query) : '';
  const meal = l.meal ? fold(l.meal) : '';
  const list = d.entries.filter((e) => e.date >= from && e.date <= to && (!q || fold(e.snap.name).includes(q)) && (!meal || fold(e.mealId) === meal || fold(env.mealLabel(e.mealId)) === meal))
    .sort((a, b) => (a.date === b.date ? a.at - b.at : a.date < b.date ? 1 : -1));
  if (!list.length) return `No food logged ${q ? `matching "${l.query}" ` : ''}between ${from} and ${to}.`;
  const lines: string[] = [];
  let day = '';
  for (const e of list) {
    if (e.date !== day) { day = e.date; lines.push(`${day} (${WEEKDAYS[weekdayOf(day)]}):`); }
    const amt = e.quick ? 'quick entry' : e.qty.unit === 'portion' ? `${r1(e.qty.amount)} portion (${r0(e.base)} ${e.snap.basis})` : `${r0(e.qty.amount)} ${e.qty.unit}`;
    const n = e.nutrients;
    lines.push(`  [${env.mealLabel(e.mealId)}] "${e.snap.name}" ${amt}${n.kcal !== undefined ? ` ${r0(n.kcal)} kcal` : ''}${n.protein !== undefined ? ` ${r0(n.protein)} g P` : ''} [ref ${e.id}]`);
  }
  return cap(lines);
}

function nutrition(d: AppData, l: Lookup, env: LookupEnv): string {
  const [from, to] = range(l, env, 28);
  const days = nutritionByDay(d.entries, from, to).filter((x) => x.logged);
  if (!days.length) return `Nothing logged between ${from} and ${to}.`;
  const g = d.settings.goals;
  const lines = days.map((x) => `${x.date}: ${r0(x.kcal)} kcal, ${r0(x.protein)} g protein, ${r0(x.carbs)} g carbs, ${r0(x.fat)} g fat${x.partial ? ' (some items without values)' : ''}`);
  const done = days.filter((x) => x.date !== env.today);
  const avg = (k: 'kcal' | 'protein') => average(done.map((x) => x[k]));
  const a = avg('kcal'), p = avg('protein');
  lines.unshift(`${days.length} logged days between ${from} and ${to} (days with nothing logged are left out, not zero). Average of finished days: ${a !== null ? `${r0(a)} kcal` : '—'}, ${p !== null ? `${r0(p)} g protein` : '—'}. Targets: ${g.kcal ?? '—'} kcal, ${g.protein ?? '—'} g protein.`);
  return cap(lines);
}

function workouts(d: AppData, l: Lookup, env: LookupEnv): string {
  const [from, to] = range(l, env, 30);
  const byId = new Map(env.pool.map((e) => [e.id, e]));
  const q = l.query ? fold(l.query) : '';
  const routineName = (id?: string) => d.routines.find((r) => r.id === id)?.name ?? '';
  const list = d.sessions.filter((s) => s.status === 'done' && s.date >= from && s.date <= to && (!q || fold(s.name).includes(q) || fold(routineName(s.routineId)).includes(q)));
  if (!list.length) return `No finished workouts ${q ? `matching "${l.query}" ` : ''}between ${from} and ${to}.`;
  return cap([...list].reverse().map((s) => `${s.date} "${s.name || routineName(s.routineId) || 'Workout'}" (${Math.round(elapsedMs(s) / 60000)} min): ${s.exercises.map((e) => `${exLabel(byId.get(e.exerciseId), e.exerciseId)}: ${e.sets.filter((x) => x.done).map(setTxt).join(', ') || 'no sets done'}`).join(' | ')}`));
}

function exerciseHistory(d: AppData, l: Lookup, env: LookupEnv): string {
  if (!l.query) return 'Say which exercise (query).';
  const ex = findEx(l.query, d, env);
  if (!ex) return `No exercise matches "${l.query}".`;
  const done = d.sessions.filter((s) => s.status === 'done');
  const hist = historyOf(ex.id, done); // newest first
  if (!hist.length) return `${ex.name}: never done yet.`;
  const dateOf = new Map<string, string>();
  for (const s of done) for (const e of s.exercises) dateOf.set(e.id, s.date);
  const [from, to] = range(l, env, 800);
  const lines: string[] = [];
  let best: { w: number; r: number; date: string; e1: number } | null = null;
  for (const e of [...hist].reverse()) {
    const date = dateOf.get(e.id) ?? '?';
    const work = e.sets.filter((x) => x.done && x.type === 'working');
    for (const x of work) if (x.weightKg && x.reps) { const e1 = epley(x.weightKg, x.reps); if (!best || e1 > best.e1) best = { w: x.weightKg, r: x.reps, date, e1 }; }
    if (date < from || date > to) continue;
    const top = Math.max(0, ...work.filter((x) => x.weightKg && x.reps).map((x) => epley(x.weightKg!, x.reps!)));
    lines.push(`${date}: ${work.map(setTxt).join(', ')}${top ? ` (best e1RM ${r1(top)} kg)` : ''}`);
  }
  const sugg = ex.logType === 'weightReps' ? suggestProgression(ex, hist, repRange(hist[0].sets), incrementFor(ex, d.increments, d.settings.plateStep)) : null;
  const head = `${ex.name} (${ex.muscles.join(', ')}; ${ex.equipment.join(', ')}): ${hist.length} sessions.${best ? ` Best set ${r1(best.w)} kg × ${best.r} on ${best.date} (e1RM ${r1(best.e1)} kg).` : ''}${sugg ? ` Next time: ${sugg.kind}${sugg.sets?.length ? ` → ${sugg.sets.map((x) => `${x.weightKg ?? '—'}kg×${x.reps}`).join(', ')}` : ''}.` : ''}`;
  return cap([head, ...lines]);
}

function records(d: AppData, l: Lookup, env: LookupEnv): string {
  const byId = new Map(env.pool.map((e) => [e.id, e]));
  const best = new Map<string, { w: number; r: number; date: string; e1: number }>();
  for (const s of d.sessions) {
    if (s.status !== 'done') continue;
    for (const e of s.exercises) for (const x of e.sets) {
      if (!x.done || x.type !== 'working' || !x.weightKg || !x.reps) continue;
      const e1 = epley(x.weightKg, x.reps);
      const b = best.get(e.exerciseId);
      if (!b || e1 > b.e1) best.set(e.exerciseId, { w: x.weightKg, r: x.reps, date: s.date, e1 });
    }
  }
  const q = l.query ? fold(l.query) : '';
  const rows = [...best].filter(([id]) => !q || fold(exLabel(byId.get(id), id)).includes(q) || (byId.get(id)?.muscles ?? []).some((m) => fold(m) === q))
    .sort((a, b) => b[1].e1 - a[1].e1)
    .map(([id, b]) => `${exLabel(byId.get(id), id)}: ${r1(b.w)} kg × ${b.r} on ${b.date} (e1RM ${r1(b.e1)} kg)`);
  const stalls = stalledLifts(d.sessions, env.today).map((s) => exLabel(byId.get(s.exerciseId), s.exerciseId));
  return cap([`Best working set per exercise (weight × reps):`, ...rows, ...(stalls.length ? [`Stalled now: ${stalls.join(', ')}.`] : [])]);
}

function body(d: AppData, l: Lookup, env: LookupEnv): string {
  const [from, to] = range(l, env, 180);
  const ws = [...d.weights].sort((a, b) => a.at - b.at).filter((w) => w.date >= from && w.date <= to);
  const tr = weightTrend(d.weights);
  const rate = trendRate(tr);
  const ms = d.measurements.filter((m) => m.date >= from && m.date <= to);
  const lines = [
    ws.length ? `Weigh-ins ${from}…${to}: ${ws.map((w) => `${w.date} ${r1(w.kg)}kg`).join(', ')}` : `No weigh-ins between ${from} and ${to}.`,
    tr.length ? `Trend weight now ≈ ${r1(tr[tr.length - 1].kg)} kg${rate !== null ? `, ${rate >= 0 ? '+' : ''}${r1(rate)} kg/week over 4 weeks` : ''}.` : '',
    ms.length ? `Measurements: ${ms.map((m) => `${m.date} ${m.kind} ${r1(m.cm)} cm`).join(', ')}` : 'No measurements in that range.',
  ].filter(Boolean);
  return cap(lines);
}

function activities(d: AppData, l: Lookup, env: LookupEnv): string {
  const [from, to] = range(l, env, 60);
  const q = l.query ? fold(l.query) : '';
  const list = d.activities.filter((a) => a.date >= from && a.date <= to && (!q || fold(a.kind).includes(q)));
  if (!list.length) return `No activities ${q ? `like "${l.query}" ` : ''}between ${from} and ${to}.`;
  return cap([...list].sort((a, b) => (a.date < b.date ? 1 : -1)).map((a) => `${a.date} (${WEEKDAYS[weekdayOf(a.date)]}) ${a.kind} ${Math.round(a.durationSec / 60)} min${a.rounds ? `, ${a.rounds} rounds` : ''}${a.intensity ? `, ${['', 'easy', 'hard', 'max'][a.intensity]}` : ''}${a.note ? ` — ${a.note}` : ''}`));
}

function balance(d: AppData, l: Lookup, env: LookupEnv): string {
  const [from, to] = range(l, env, 28);
  const musclesOf = (id: string) => env.pool.find((e) => e.id === id)?.muscles;
  const per = setsPerMuscle(d.sessions, musclesOf, from, to);
  const weeks = Math.max(1, (diffDays(to, from) + 1) / 7);
  const wrestle = d.activities.filter((a) => a.kind === 'wrestling' && a.date >= from && a.date <= to).length;
  return `Hard working sets per muscle ${from}…${to} (primary muscle counts 1, secondary 0.5), per week: ${MUSCLES.map((m: MuscleGroup) => `${m} ${r1(per[m] / weeks)}`).join(', ')}. Wrestling sessions in that time: ${wrestle} (covers legs, hips, grip and conditioning).`;
}

function schedule(d: AppData, _l: Lookup, env: LookupEnv): string {
  const sch = d.schedule;
  const name = (id: string | null | undefined) => (id ? d.routines.find((r) => r.id === id)?.name ?? '(deleted routine)' : 'rest');
  const lines = [
    `Mode: ${sch.mode}.`,
    sch.mode === 'weekly' ? `Weekly plan: ${[1, 2, 3, 4, 5, 6, 0].map((wd) => `${WEEKDAYS[wd]} ${name(sch.weekly[wd])}`).join(', ')}.` : `Rotation: ${sch.rotation.order.map(name).join(' → ')} (next: ${name(sch.rotation.order[sch.rotation.pointer % Math.max(1, sch.rotation.order.length)])}), ${sch.rotation.perWeek} per week.`,
    `Planned activities besides the gym: ${Object.entries(sch.activities ?? {}).map(([wd, ks]) => `${WEEKDAYS[Number(wd)]} ${(ks ?? []).join('+')}`).join(', ') || 'none'}.`,
    `Next 14 days: ${Array.from({ length: 14 }, (_, k) => addDays(env.today, k)).map((date) => { const p = plannedFor(d, date, env.today); const acts = sch.activities?.[weekdayOf(date)] ?? []; return `${date} ${WEEKDAYS[weekdayOf(date)].slice(0, 3)} ${p ? name(p.routineId) + (p.source === 'override' ? ' (one-off)' : '') : 'rest'}${acts.length ? ` + ${acts.join('+')}` : ''}`; }).join('; ')}.`,
    sch.overrides.length ? `One-off placements: ${sch.overrides.slice(-12).map((o) => `${o.date} ${name(o.routineId)}${o.originDate ? ` (moved from ${o.originDate})` : ''}`).join(', ')}.` : '',
    sch.cleared.length ? `Cleared dates: ${sch.cleared.slice(-12).join(', ')}.` : '',
  ].filter(Boolean);
  return cap(lines);
}

function routines(d: AppData, l: Lookup, env: LookupEnv): string {
  const byId = new Map(env.pool.map((e) => [e.id, e]));
  const q = l.query ? fold(l.query) : '';
  const list = d.routines.filter((r) => !q || fold(r.name).includes(q));
  if (!list.length) return q ? `No routine called "${l.query}". Routines: ${d.routines.map((r) => r.name).join(', ') || 'none'}.` : 'No routines yet.';
  return cap(list.map((r) => `"${r.name}"${r.note ? ` (${r.note})` : ''}: ${r.items.map((i) => `${exLabel(byId.get(i.exerciseId), i.exerciseId)} ${i.warmupSets ? `${i.warmupSets}W+` : ''}${i.workingSets}×${i.repMin}-${i.repMax}, rest ${i.restSec}s${i.supersetGroup ? ' (superset)' : ''}`).join('; ')}`));
}

const EQUIP = ['barbell', 'dumbbell', 'machine', 'smith', 'cable', 'bodyweight', 'kettlebell', 'band'];
/** A word for a muscle (English or Danish, singular or plural) → the app's muscle group. */
const MUSCLE_WORDS: Record<string, MuscleGroup> = {
  chest: 'chest', pec: 'chest', pecs: 'chest', bryst: 'chest',
  back: 'back', lats: 'back', lat: 'back', ryg: 'back',
  shoulder: 'shoulders', shoulders: 'shoulders', delts: 'shoulders', delt: 'shoulders', skulder: 'shoulders', skuldre: 'shoulders',
  bicep: 'biceps', biceps: 'biceps', tricep: 'triceps', triceps: 'triceps', forearm: 'forearms', forearms: 'forearms', underarm: 'forearms', underarme: 'forearms',
  quad: 'quads', quads: 'quads', lar: 'quads', hamstring: 'hamstrings', hamstrings: 'hamstrings', haser: 'hamstrings', glute: 'glutes', glutes: 'glutes', balder: 'glutes', numse: 'glutes',
  calf: 'calves', calves: 'calves', laeg: 'calves', core: 'core', abs: 'core', mave: 'core', legs: 'quads', leg: 'quads', ben: 'quads', arms: 'biceps',
};
export const muscleOf = (w: string): MuscleGroup | undefined => MUSCLE_WORDS[fold(w)] ?? MUSCLE_WORDS[fold(w).replace(/s$/, "")];

/** Exercises by name, muscle or equipment — the ones this user actually does first, with when they last did them. */
function exercises(d: AppData, l: Lookup, env: LookupEnv): string {
  const usage = new Map<string, { n: number; last: string }>();
  for (const s of d.sessions) if (s.status === 'done') for (const e of s.exercises) if (e.sets.some((x) => x.done)) {
    const u = usage.get(e.exerciseId) ?? { n: 0, last: '' };
    u.n++; if (s.date > u.last) u.last = s.date;
    usage.set(e.exerciseId, u);
  }
  const q = l.query ? fold(l.query) : '';
  const words = q.split(/[\s,+&/]+/).filter((w) => w && w !== 'and' && w !== 'og' && w !== 'with' && w !== 'med');
  const live = env.pool.filter((e) => !e.archived);
  const ms = [...new Set(words.map(muscleOf).filter(Boolean))] as MuscleGroup[];
  const eq = words.map((w) => w.replace(/s$/, '')).filter((w) => EQUIP.includes(w));
  let list: Exercise[];
  if (!q) list = live.filter((e) => usage.has(e.id));
  else if (ms.length) list = live.filter((e) => e.muscles.some((m) => ms.includes(m)) && (!eq.length || e.equipment.some((x) => eq.includes(x))));
  else if (eq.length) list = live.filter((e) => e.equipment.some((x) => eq.includes(x)));
  else list = matchExercises(l.query!, live, env.lang, 15).map((x) => x.ex);
  list = [...list].sort((a, b) => (usage.get(b.id)?.n ?? 0) - (usage.get(a.id)?.n ?? 0) || (usage.get(b.id)?.last ?? '').localeCompare(usage.get(a.id)?.last ?? ''));
  if (!list.length) return `No exercises match "${l.query}".`;
  return cap(list.slice(0, 60).map((e) => { const u = usage.get(e.id); return `${e.name}${e.custom ? ' (own)' : ''}: ${e.muscles.join('/')}; ${e.equipment.join('/')}; ${e.logType}${u ? `; done ${u.n}× (last ${u.last})` : '; never done'}`; }));
}

function savedFood(d: AppData, l: Lookup): string {
  const q = l.query ? fold(l.query) : '';
  const own = d.foods.filter((f) => f.source === 'custom' && (!q || fold(f.name).includes(q)));
  const fav = new Set(d.favourites);
  const lines = [
    `Saved meals: ${d.savedMeals.filter((m) => !q || fold(m.name).includes(q)).map((m) => `"${m.name}" (${m.items.map((i) => i.snap.name).join(', ')})`).join('; ') || 'none'}.`,
    `Recipes: ${d.recipes.filter((r) => !q || fold(r.name).includes(q)).map((r) => `"${r.name}" (${r.servings} servings: ${r.ingredients.map((i) => i.snap.name).join(', ')})`).join('; ') || 'none'}.`,
    `Own foods: ${own.map((f) => `"${f.name}"${f.per100.kcal !== undefined ? ` ${r0(f.per100.kcal)} kcal/100${f.basis}` : ''}${fav.has(f.id) ? ' ★' : ''}`).join('; ') || 'none'}.`,
    `Favourites: ${d.foods.filter((f) => fav.has(f.id)).map((f) => f.name).join(', ') || 'none'}.`,
  ];
  return cap(lines);
}

function settings(d: AppData): string {
  // the app's preferences only (keys for the AI live elsewhere and never get here)
  const s = { ...d.settings, meals: d.settings.meals.map((m) => ({ id: m.id, name: m.name })) };
  return JSON.stringify(s).slice(0, MAX);
}

function memory(d: AppData, l: Lookup): string {
  const q = l.query ? fold(l.query) : '';
  const list = d.memory.filter((m) => !q || fold(m.text).includes(q));
  return list.length ? cap(list.map((m, i) => `${i + 1}. [${m.kind}] ${m.text} (${new Date(m.at).toISOString().slice(0, 10)})`)) : q ? `Nothing remembered about "${l.query}".` : 'Nothing remembered yet.';
}

function notes(d: AppData, l: Lookup, env: LookupEnv): string {
  const [from, to] = range(l, env, 60);
  const list = d.notes.filter((n) => n.date >= from && n.date <= to);
  return list.length ? cap(list.map((n) => `${n.date}: ${[n.training && `training: ${n.training}`, n.nutrition && `food: ${n.nutrition}`].filter(Boolean).join(' · ')}`)) : `No day notes between ${from} and ${to}.`;
}

function conversations(l: Lookup, env: LookupEnv): string {
  // everything ever said (lib/archive.ts), searched by meaning-carrying words; each hit comes with the answer next to it
  const hits = searchArchive(env.said ?? [], l.query ?? null, l.from, l.to);
  if (!hits.length) return l.query ? `Nothing said about "${l.query}"${l.from || l.to ? ' in that range' : ''} in the whole conversation.` : 'No earlier conversation saved.';
  const who = (r: SaidLine['role']) => (r === 'user' ? 'User' : r === 'model' ? 'Coach' : 'Coach did');
  const line = (at: number, r: SaidLine['role'], t: string) => `${new Date(at).toISOString().slice(0, 10)} ${who(r)}: ${t.replace(/\s+/g, ' ').slice(0, 300)}`;
  return cap(hits.map((x) => line(x.at, x.role, x.text) + (x.beside ? `\n   ↳ ${who(x.beside.role)}: ${x.beside.text.replace(/\s+/g, ' ').slice(0, 200)}` : '')));
}

/** Answer each look-up; the block goes back to the model as "LOOKUP RESULTS". */
export function runLookups(d: AppData, list: Lookup[], env: LookupEnv): string {
  return list.map((l) => {
    let out: string;
    try {
      switch (l.kind) {
        case 'food': out = food(d, l, env); break;
        case 'nutrition': out = nutrition(d, l, env); break;
        case 'workouts': out = workouts(d, l, env); break;
        case 'exercise_history': out = exerciseHistory(d, l, env); break;
        case 'records': out = records(d, l, env); break;
        case 'body': out = body(d, l, env); break;
        case 'activities': out = activities(d, l, env); break;
        case 'training_balance': out = balance(d, l, env); break;
        case 'schedule': out = schedule(d, l, env); break;
        case 'routines': out = routines(d, l, env); break;
        case 'exercises': out = exercises(d, l, env); break;
        case 'saved_food': out = savedFood(d, l); break;
        case 'settings': out = settings(d); break;
        case 'memory': out = memory(d, l); break;
        case 'notes': out = notes(d, l, env); break;
        case 'conversations': out = conversations(l, env); break;
        case 'web': out = '(answered by the web search)'; break; // (agentTurn.ts runs it: it is not on the phone)
        case 'guide': { const g = guideSections(); const k = fold(l.query ?? ''); const hit = Object.keys(g).find((x) => k.includes(x) || x.includes(k)); out = k && hit ? g[hit] : `Sections: ${Object.keys(g).join(', ')}.\n${g.coach}`; break; }
        default: out = 'Unknown look-up.';
      }
    } catch { out = 'That look-up failed.'; }
    const args = [l.query && `query "${l.query}"`, l.from && `from ${l.from}`, l.to && `to ${l.to}`, l.meal && `meal ${l.meal}`].filter(Boolean).join(', ');
    return `### ${l.kind}${args ? ` (${args})` : ''}\n${out}`;
  }).join('\n\n');
}

/** A few words for the screen while a look-up runs ("Looking at your bench press history…"). */
export function lookupStatus(list: Lookup[], t: (k: string, v?: Record<string, string | number>) => string): string {
  const l = list[0];
  if (!l) return '';
  const what: Record<LookupKind, string> = {
    food: 'your food log', nutrition: 'your nutrition', workouts: 'your workouts', exercise_history: 'your history', records: 'your records',
    body: 'your weight', activities: 'your activities', training_balance: 'your training balance', schedule: 'your plan', routines: 'your routines',
    exercises: 'your exercises', saved_food: 'your saved food', settings: 'your settings', memory: 'what you told me', notes: 'your notes', conversations: 'what you said', guide: 'the app', web: 'the web',
  };
  if (l.kind === 'exercise_history' && l.query) return t('Looking at your {x} history…', { x: l.query });
  if (l.kind === 'web') return t('Searching the web…');
  return t('Looking at {x}…', { x: t(what[l.kind]) });
}
