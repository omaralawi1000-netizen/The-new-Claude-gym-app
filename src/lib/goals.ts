/**
 * Goals they tell the Coach (living coach step 2, 26 Oct): "lose 2 kg in 2 weeks", "gain 2 kg for wrestling", "bench 100
 * by summer", or anything else. A goal is a MEMORY note of kind goal; when it has a number the app can follow, the note
 * carries it (MemoryNote.goal): what is tracked, the target, the date, and where it stood the day it was set.
 *
 * Every answer, the app works out where each goal is (GOALS): progress, the pace it is going at (from the scale or the
 * lift's sets, never a guess), the pace the date needs, whether that pace is safe, and a plain status word. The Coach
 * follows up from these numbers; it never works them out itself.
 *
 * GOAL WATCH is what a real coach keeps an eye on while a goal runs (Omar, 26 Oct: "make sure I'm not losing muscle or
 * stalling"): strength on the main lifts against before the goal (falling strength on a cut is the early sign of losing
 * muscle), protein and calories since the goal started, sleep and HRV against their usual, workouts and skipped sets, and
 * stalled lifts. The Coach says what is off early; it never answers it with "train lighter" or "fewer sets" (25 Oct).
 */
import type { AppData, GoalPlan, MemoryNote } from './types';
import { addDays, diffDays } from './dates';
import { oddWeighIns, unfinishedDays, weighIns } from './dataQuality';
import { trueMaintenance } from './maintenance';
import { ageFromMemory } from './eating';
import { weightTrend, nutritionByDay, stalledLifts, skippedSets } from './stats';
import { exerciseMap } from '../state/store';
import { historyOf, incrementFor, lastPerformance, repRange, setsFromItem, suggestProgression } from './workout';

type Data = Pick<AppData, 'memory' | 'weights' | 'health' | 'entries' | 'sessions' | 'exercises' | 'routines' | 'settings'>;

const KCAL_PER_KG = 7700;
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rk = (x: number) => Math.round(x / 10) * 10;
const fmtK = (x: number) => rk(x).toLocaleString('en-US');

/** An estimated one-rep max (Epley; a single is itself). */
export const est = (kg: number, reps: number) => (reps <= 1 ? kg : kg * (1 + reps / 30));

/** The goals still running (a goal note not reached or dropped), oldest first. */
export const activeGoals = (d: Pick<AppData, 'memory'>, today: string) => (d.memory ?? []).filter((m) => m.kind === 'goal' && !m.goal?.status && !(m.until && m.until < today)
  // (a promise or other goal without a number: a week after its last day it is over, verdict given or not)
  && !(m.goal && (m.goal.metric === 'other' || m.goal.target === undefined) && m.goal.by && diffDays(today, m.goal.by) > 7));
/** A goal note with a number the app follows. */
export const tracked = (m: MemoryNote): m is MemoryNote & { goal: GoalPlan } => !!m.goal && m.goal.metric !== 'other' && m.goal.target !== undefined;

/** The Theil–Sen slope per day: the median of the slopes between points at least `gap` days apart (one odd point can't
 *  swing it). */
function slope(pts: { date: string; v: number }[], gap = 7): number | null {
  const xs: number[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const dd = diffDays(pts[j].date, pts[i].date);
    if (dd >= gap) xs.push((pts[j].v - pts[i].v) / dd);
  }
  if (!xs.length) return null;
  const s = xs.sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Each workout's best set of a lift (as an estimated max), oldest first. */
export function liftTops(d: Pick<AppData, 'sessions'>, exerciseId: string, from: string, to: string) {
  const out: { date: string; e: number; kg: number; reps: number }[] = [];
  for (const s of d.sessions) {
    if (s.status !== 'done' || s.date < from || s.date > to) continue;
    let top: { e: number; kg: number; reps: number } | null = null;
    for (const ex of s.exercises) if (ex.exerciseId === exerciseId) for (const q of ex.sets) {
      if (!q.done || q.type !== 'working' || !q.weightKg || !q.reps) continue;
      const e = est(q.weightKg, q.reps);
      if (!top || e > top.e) top = { e, kg: q.weightKg, reps: q.reps };
    }
    if (top) out.push({ date: s.date, ...top });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
const best = <T extends { e: number }>(xs: T[]) => (xs.length ? xs.reduce((a, b) => (b.e > a.e ? b : a)) : undefined);

/** The next target the workout screen gives a lift's first set (its routine's rep range, else 8–12): a lift goal's first
 *  step when no plan was agreed. */
export function liftNext(d: Data & Partial<Pick<AppData, 'increments'>>, id: string): { kg: number; reps: number } | undefined {
  const done = d.sessions.filter((s) => s.status === 'done');
  const hist = historyOf(id, done); const ex = exerciseMap(d.exercises).get(id);
  if (!hist.length || !ex || ex.logType !== 'weightReps') return undefined;
  const rid = [...done].reverse().find((s) => s.exercises.some((e) => e.exerciseId === id))?.routineId;
  const item = (d.routines.find((r) => r.id === rid) ?? d.routines.find((r) => !r.oneOff && r.items.some((it) => it.exerciseId === id)))?.items.find((it) => it.exerciseId === id);
  const se = item ? { ...hist[0], sets: setsFromItem(item, lastPerformance(id, done)?.sets) } : hist[0];
  const s1 = suggestProgression(ex, hist, repRange(se.sets), incrementFor(ex, d.increments, d.settings.plateStep, d.settings.units.weight)).sets?.[0];
  return s1?.weightKg && s1.reps ? { kg: s1.weightKg, reps: s1.reps } : undefined;
}

/** The main lifts: the most trained weight × reps compound lifts of the last 8 weeks (a lateral raise or a curl says little
 *  about strength or muscle). */
function mainLifts(d: Data, today: string) {
  const exs = exerciseMap(d.exercises);
  const count = new Map<string, number>();
  for (const s of d.sessions) if (s.status === 'done' && s.date >= addDays(today, -55)) for (const e of s.exercises) {
    const x = exs.get(e.exerciseId);
    if ((x?.logType ?? 'weightReps') === 'weightReps' && x?.movement !== 'isolation' && x?.movement !== 'core' && e.sets.some((q) => q.done && q.type === 'working' && q.weightKg)) count.set(e.exerciseId, (count.get(e.exerciseId) ?? 0) + 1);
  }
  return [...count].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
}

/** The finished food days from `from` to yesterday: logged, not cut short, and not a day with its usual dinner missing
 *  (an unfinished log is not a day they ate little; lib/dataQuality.ts). */
function foodDays(d: Pick<AppData, 'entries'>, from: string, today: string) {
  const open = new Set(unfinishedDays(d, today, Math.min(90, Math.max(28, diffDays(today, from)))).map((u) => u.date));
  return nutritionByDay(d.entries, from, addDays(today, -1)).filter((x) => x.logged && !x.partial && x.kcal >= 800 && !open.has(x.date));
}

/** The weigh-ins to judge from: Aven's and the watch's scale, without the ones that are clearly a typo or a glitch. */
function cleanWeighIns(d: Pick<AppData, 'weights' | 'health'>, today: string) {
  const odd = new Set(oddWeighIns(d, today, 60).map((w) => w.date));
  return weighIns(d).filter((w) => w.date <= today && !odd.has(w.date));
}

/** Where the scale is now, the one number the app says everywhere: on the line through the last 4 weeks' weigh-ins
 *  when there are 6 over 14+ days (a smoothed average lags a steady loss by about half a kilo), else the smoothed trend. */
function scaleNow(ws: { date: string; kg: number }[], today: string): number {
  const last = ws[ws.length - 1];
  const four = ws.filter((w) => w.date >= addDays(today, -27));
  const span4 = four.length ? diffDays(four[four.length - 1].date, four[0].date) : 0;
  const sl4 = four.length >= 6 && span4 >= 14 ? slope(four.map((w) => ({ date: w.date, v: w.kg }))) : null;
  return sl4 !== null ? median(four.map((w) => w.kg + sl4 * diffDays(last.date, w.date)))! : weightTrend(ws)[ws.length - 1].kg;
}

/** Where the goal starts, the day it is set: the weight trend now, or the lift's best estimated max in the 6 weeks before. */
export function goalStart(d: Pick<AppData, 'weights' | 'health' | 'sessions'>, plan: Pick<GoalPlan, 'metric'>, exerciseId: string | undefined, today: string): number | undefined {
  if (plan.metric === 'weight') {
    const ws = cleanWeighIns(d, today);
    const last = ws[ws.length - 1];
    if (!last || diffDays(today, last.date) > 14) return undefined;
    return r1(scaleNow(ws, today));
  }
  if (plan.metric === 'lift' && exerciseId) { const b = best(liftTops(d, exerciseId, addDays(today, -42), today)); return b ? r1(b.e) : undefined; }
  return undefined;
}

export type Pace = 'reached' | 'ready' | 'on pace' | 'ahead' | 'behind' | 'too fast' | 'wrong way' | 'slow' | 'stalled' | 'date passed' | 'too early';
export interface GoalState {
  note: MemoryNote;
  metric: GoalPlan['metric'];
  /** weight: kg on the trend; lift: estimated max */
  start?: number; now?: number; target?: number;
  /** a weight goal: the last real weigh-in */
  measured?: { kg: number; date: string };
  /** a weight goal judged on its food (its first 2 weeks): `now` is where what they eat puts them, and this is where the
   *  scale's line is (mostly water this early) */
  scaleKg?: number;
  daysIn: number; daysLeft?: number;
  /** kg a week, + up, − down: from the scale's trend or the lift's sets */
  rate?: number; rateBasis?: string;
  /** a weight goal two weeks away or less (a weigh-in): judged on the morning scale */
  short?: boolean;
  /** a weight goal judged on its food: what its own weigh-ins say so far (mostly water this early) */
  scaleRate?: number;
  /** a lift goal: the same best set for this many workouts, since that date */
  plateau?: { workouts: number; since: string; kg: number; reps: number };
  /** a weight goal: where the calorie target they have now leads from today (against the goal's maintenance) */
  atTarget?: { kcal: number; kgPerWeek: number; eta?: string };
  /** a weight goal: what the food logged since it started points to (intake against TRUE MAINTENANCE), kg a week: the
   *  early guide while the scale still swings with water */
  eating?: { kcal: number; days: number; maint: number; kgPerWeek: number };
  /** kg a week it takes from here to make the date */
  need?: number;
  /** safe band for a weight goal, kg a week (as positive numbers) */
  safe?: { min: number; max: number };
  /** the date asks for more than the safe band */
  dateUnsafe?: boolean;
  /** when it lands at the current pace (or at a safe one, when the pace is too fast or the date unsafe) */
  eta?: string; safeEta?: string;
  pace: Pace;
  /** why the pace can't be judged, when it can't */
  why?: string;
  stalled?: boolean;
  /** a lift goal not trained since it was set: the workout screen's next target, its first step */
  next?: { kg: number; reps: number };
}

/** TRUE MAINTENANCE for a goal. In its first 4 weeks: the one from the 4 weeks before it started, when there is one. A
 *  window that mixes the old eating with the new is pulled toward the new intake while the scale's line catches up
 *  (a new cut reads as a lower maintenance, so a goal on plan would look behind). */
export function goalMaintenance(d: Data, startDate: string, today: string) {
  const now = trueMaintenance(d, today);
  if (diffDays(today, startDate) >= 28) return now;
  const before = trueMaintenance(d, startDate);
  return before && (before.confidence !== 'low' || !now) ? before : now;
}

/** Where one goal is today. */
export function goalState(d: Data, note: MemoryNote, today: string): GoalState | undefined {
  const g = note.goal;
  if (!g) return undefined;
  const startDate = g.startDate ?? today;
  const daysIn = Math.max(0, diffDays(today, startDate));
  const daysLeft = g.by ? diffDays(g.by, today) : undefined;
  const base: GoalState = { note, metric: g.metric, daysIn, daysLeft, target: g.target, pace: 'too early' };
  if (g.metric === 'other' || g.target === undefined) return { ...base, pace: daysLeft !== undefined && daysLeft < 0 ? 'date passed' : 'too early', why: 'not a number the app can track' };

  if (g.metric === 'weight') {
    const ws = cleanWeighIns(d, today);
    const last = ws[ws.length - 1];
    if (!last) return { ...base, start: g.start, why: 'no weigh-ins' };
    const trend = weightTrend(ws);
    // the pace: since the goal started once that has 5 weigh-ins over a week (what they do now, not before the plan),
    // else the last 4 weeks with 6 over 14+ days (fewer is mostly water)
    const since = ws.filter((w) => w.date >= startDate);
    const spanS = since.length ? diffDays(since[since.length - 1].date, since[0].date) : 0;
    const slS = since.length >= 5 && spanS >= 7 ? slope(since.map((w) => ({ date: w.date, v: w.kg })), 4) : null;
    const four = ws.filter((w) => w.date >= addDays(today, -27));
    const span4 = four.length ? diffDays(four[four.length - 1].date, four[0].date) : 0;
    const sl4 = four.length >= 6 && span4 >= 14 ? slope(four.map((w) => ({ date: w.date, v: w.kg }))) : null;
    const sl = slS ?? sl4;
    const recent = slS !== null ? since : four;
    // where they are now: on that line when there is one (a smoothed average lags a steady loss by about half a kilo),
    // else the smoothed trend
    // a goal two weeks away or less (a weigh-in): the morning scale is what counts, not a line through the weeks
    const short = !!g.by && diffDays(g.by, startDate) <= 14;
    const now = short && diffDays(today, last.date) <= 3 ? last.kg : slS !== null ? median(recent.map((w) => w.kg + slS * diffDays(last.date, w.date)))! : scaleNow(ws, today);
    const stale = diffDays(today, last.date);
    // (where it started: as saved, else the trend the day it was set)
    const start = g.start ?? trend.filter((p) => p.date <= startDate).at(-1)?.kg ?? trend.find((p) => p.date >= startDate)?.kg;
    const dir = Math.sign(g.target - (start ?? now)) || -1;
    const safe = dir < 0 ? { min: r2(now * 0.005), max: r2(now * 0.01) } : { min: r2(now * 0.0025), max: r2(now * 0.005) };
    const st: GoalState = { ...base, start: start !== undefined ? r1(start) : undefined, now: r1(now), measured: { kg: last.kg, date: last.date }, safe };
    // the food since it started (finished logged days, today not counted), against TRUE MAINTENANCE
    const m = goalMaintenance(d, startDate, today);
    const ate = foodDays(d, startDate, today);
    if (m && ate.length >= 3) { const k = avg(ate.map((x) => x.kcal))!; st.eating = { kcal: rk(k), days: ate.length, maint: m.kcal, kgPerWeek: r2(((k - m.kcal) * 7) / KCAL_PER_KG) }; }
    // reached: the trend is there and a real weigh-in since the goal is too, or the last three weigh-ins all are
    const last3 = ws.slice(-3);
    const there = (kg: number) => (dir < 0 ? kg <= g.target! + 0.05 : kg >= g.target! - 0.05);
    if ((there(now) && since.some((w) => there(w.kg))) || (last3.length === 3 && last3.every((w) => there(w.kg)))) return { ...st, pace: 'reached' };
    // (a short goal is made by one morning on or before its day)
    if (short && ws.some((w) => w.date >= startDate && w.date <= g.by! && there(w.kg))) return { ...st, pace: 'reached' };
    if (short) st.short = true;
    if (stale > 10) return { ...st, pace: daysLeft !== undefined && daysLeft < 0 ? 'date passed' : 'too early', why: `no weigh-in for ${stale} days` };
    // in its first 2 weeks (and until it has 8 weigh-ins of its own), a goal is judged on what they eat against the
    // maintenance from before it: the scale still swings 1–2 kg with water, and a week of it called a goal on plan
    // "behind" (judge round 1, 26 Oct). Without food logs: on its own week of weigh-ins, else not yet.
    const early = daysIn < 14 || since.length < 8;
    const byFood = early && !!st.eating && daysIn >= 3;
    // (judged on food, it is also where they are: the start plus what the food since then adds up to, so the kilos left
    // and the pace the date needs aren't read off a scale that dropped a kilo of water; judge round 4, 26 Oct)
    let cur = now;
    if (byFood && !short && start !== undefined) { cur = start + (st.eating!.kgPerWeek * daysIn) / 7; st.now = r1(cur); st.scaleKg = r1(now); }
    const left = g.target - cur;
    if (daysLeft !== undefined && daysLeft > 0) st.need = r2((left / daysLeft) * 7);
    st.dateUnsafe = st.need !== undefined && Math.abs(st.need) > safe.max + 1e-9;
    st.safeEta = addDays(today, Math.ceil((Math.abs(left) / safe.max) * 7));
    if (daysLeft !== undefined && daysLeft < 0) { st.pace = 'date passed'; return st; }
    const scale4 = sl4 !== null ? `${fmtPace(r2(sl4 * 7))} on the scale over the last 4 weeks, mostly before the goal` : undefined;
    if (early && !byFood && !(slS !== null && daysIn >= 7)) {
      if (scale4) st.rateBasis = scale4;
      return { ...st, pace: 'too early', why: daysIn < 7 ? `the goal is ${daysIn} day${daysIn === 1 ? '' : 's'} old; its own pace shows after about a week of weigh-ins${st.eating ? '' : ' (or a few logged days of food)'}` : `${since.length} weigh-in${since.length === 1 ? '' : 's'} since it started and no logged food to judge by (the pace needs 5 weigh-ins over a week)` };
    }
    if (!early && sl === null) return { ...st, pace: 'too early', why: `${four.length} weigh-ins over ${span4} days in the last 4 weeks (the pace needs 6 over 14+ days)` };
    st.rate = byFood ? st.eating!.kgPerWeek : r2((slS ?? sl!) * 7);
    if (byFood && slS !== null) st.scaleRate = r2(slS * 7);
    st.rateBasis = byFood ? `what they eat since the goal started, against the maintenance from before it (the guide for its first 2 weeks; ${slS !== null ? `the scale so far says ${fmtPace(r2(slS * 7))}, mostly water swings this early` : scale4 ?? 'too few weigh-ins of its own yet'})`
      : slS !== null ? `the scale since the goal started, ${since.length} weigh-ins over ${spanS + 1} days` : `the scale over the last 4 weeks, ${four.length} weigh-ins over ${span4 + 1} days`;
    if (m && d.settings.goals.kcal) {
      const kw = r2(((d.settings.goals.kcal - m.kcal) * 7) / KCAL_PER_KG);
      st.atTarget = { kcal: d.settings.goals.kcal, kgPerWeek: kw, ...(kw * dir > 0.02 ? { eta: addDays(today, Math.ceil((Math.abs(left) / Math.abs(kw)) * 7)) } : {}) };
    }
    const toward = st.rate * dir;
    if (toward > 0.02) st.eta = addDays(today, Math.ceil((Math.abs(left) / toward) * 7));
    st.pace = toward < -0.05 ? 'wrong way'
      : toward > safe.max + 1e-9 ? 'too fast'
      : st.need !== undefined && !st.dateUnsafe ? (toward < Math.abs(st.need) * 0.75 ? 'behind' : toward > Math.abs(st.need) * 1.3 ? 'ahead' : 'on pace')
      // (a date that needs more than is safe can't be made safely: behind for it, whatever the pace)
      : st.need !== undefined ? 'behind'
      : toward < safe.min * 0.8 ? 'slow' : 'on pace';
    return st;
  }

  // a lift: its best estimated max against the target's
  const id = note.exerciseIds?.[0];
  if (!id) return { ...base, why: 'no exercise' };
  const targetE = est(g.target, g.reps ?? 1);
  const tops = liftTops(d, id, addDays(today, -55), today);
  const recent3 = tops.slice(-3);
  const nowTop = best(recent3);
  const start = g.start ?? best(liftTops(d, id, addDays(startDate, -42), startDate))?.e;
  const st: GoalState = { ...base, start: start !== undefined ? r1(start) : undefined, now: nowTop ? r1(nowTop.e) : undefined, target: r1(targetE) };
  st.stalled = stalledLifts(d.sessions, today).some((s) => s.exerciseId === id);
  if (!nowTop) return { ...st, why: 'not trained in the last 8 weeks' };
  // reached: a real set at it (a heavy single, double or triple is only proven by doing it); the estimate alone says it is
  // there to test
  const reps = g.reps ?? 1;
  const did = tops.some((x) => x.date >= startDate && x.kg >= g.target! - 0.01 && x.reps >= reps) || liftTops(d, id, startDate, today).some((x) => x.kg >= g.target! - 0.01 && x.reps >= reps);
  if (did || (reps > 3 && nowTop.e >= targetE - 0.05)) return { ...st, pace: 'reached' };
  if (nowTop.e >= targetE - 0.05) return { ...st, pace: 'ready', why: `the estimate from their sets is there; only a real ${r1(g.target)} kg × ${reps} proves it` };
  // a plateau: no better best set since the best was first reached, for 4+ workouts over 2+ weeks (the goal lift is
  // always checked, not only the 3 stalls DATA lists)
  const top = best(tops)!;
  const firstAt = tops.findIndex((x) => x.e >= top.e - 0.05);
  const flat = tops.slice(firstAt);
  // (counted: the workouts at its best, within 2.5 %; a light day of high reps is not a try at it)
  const atBest = flat.filter((x) => x.e >= top.e * 0.975);
  if (atBest.length >= 4 && diffDays(today, flat[0].date) >= 14) {
    st.plateau = { workouts: atBest.length, since: flat[0].date, kg: tops[firstAt].kg, reps: tops[firstAt].reps };
    st.stalled = true;
  }
  if (daysLeft !== undefined && daysLeft < 0) return { ...st, pace: 'date passed' };
  // (no workout of it since the goal was set: a plateau from before is where the plan starts, not a stall of the goal;
  // judge round 4, 26 Oct: "Stalled" on the day it was set)
  if (!tops.some((x) => x.date > startDate)) {
    const nx = liftNext(d, id);
    if (nx) st.next = nx;
    return { ...st, pace: 'too early', why: `no workout of it since the goal was set${nx ? `; the next target is ${r1(nx.kg)} kg × ${nx.reps}` : ''}` };
  }
  const left = targetE - nowTop.e;
  if (daysLeft !== undefined && daysLeft > 0) st.need = r2((left / daysLeft) * 7);
  // the pace from the last 4 weeks (or since the goal started, when that is shorter): a climb from before it doesn't
  // make a plateau now "ahead"
  const win = tops.filter((x) => x.date >= addDays(today, -27));
  const span = win.length ? diffDays(win[win.length - 1].date, win[0].date) : 0;
  const sl = win.length >= 4 && span >= 14 ? slope(win.map((x) => ({ date: x.date, v: x.e })), 5) : null;
  if (st.plateau) { st.rate = sl !== null ? r2(sl * 7) : 0; st.rateBasis = `its best set per workout, ${win.length} workouts over the last ${span + 1} days`; return { ...st, pace: 'stalled' }; }
  if (sl === null) return { ...st, pace: 'too early', why: `${win.length} workouts with it over ${span} days in the last 4 weeks (the pace needs 4 over 14+ days)` };
  st.rate = r2(sl * 7);
  st.rateBasis = `its best set per workout, ${win.length} workouts over the last ${span + 1} days`;
  if (st.rate > 0.05) st.eta = addDays(today, Math.ceil((left / st.rate) * 7));
  st.pace = st.rate < -nowTop.e * 0.005 ? 'wrong way'
    : st.need !== undefined ? (st.rate < st.need * 0.75 ? 'behind' : st.rate > st.need * 1.3 ? 'ahead' : 'on pace')
    : st.rate <= 0.05 ? 'slow' : 'on pace';
  return st;
}

/** The calorie numbers for a weight goal, from TRUE MAINTENANCE (never under a safe floor). */
export function goalCalories(d: Data, st: GoalState, today: string, hold = false): string | undefined {
  if (st.metric !== 'weight' || st.target === undefined) return undefined;
  const m = goalMaintenance(d, st.note.goal?.startDate ?? today, today);
  if (st.pace === 'reached') {
    if (!m) return undefined;
    const cur = d.settings.goals.kcal;
    const half = cur && Math.abs(m.kcal - cur) >= 300 ? rk((m.kcal + cur) / 2) : undefined;
    return `To hold it: about TRUE MAINTENANCE ${fmtK(m.kcal)} kcal a day (${m.confidence} confidence)${half ? `; from the ${fmtK(cur!)} target, about ${fmtK(half)} for a week first, then maintenance (the scale jumps a little with the extra food: water and glycogen)` : ''}; offer to set it as their target (set_setting kcalGoal).`;
  }
  const now = st.now ?? st.start;
  if (!now) return undefined;
  const sex = d.settings.body?.sex;
  const dir = Math.sign(st.target - now);
  const per = (kgWk: number) => (kgWk * KCAL_PER_KG) / 7;
  const prot = dir < 0 ? `protein 1.8–2.2 g/kg = ${Math.round(now * 1.8)}–${Math.round(now * 2.2)} g (keeps muscle on a cut)` : `protein 1.6–2.0 g/kg = ${Math.round(now * 1.6)}–${Math.round(now * 2)} g`;
  const lowP = Math.round(now * (dir < 0 ? 1.8 : 1.6));
  const cur = (d.settings.goals.kcal ? `; the current target is ${fmtK(d.settings.goals.kcal)} kcal${d.settings.goals.protein ? ` and ${d.settings.goals.protein} g protein` : ''}` : '; no calorie target set yet')
    + (d.settings.goals.protein && d.settings.goals.protein < lowP - 2 ? `; their protein target is under this range: the plan says at least ${lowP} g and offers to set it (set_setting proteinGoal)` : '');
  if (!m) return `Calories for it: no TRUE MAINTENANCE yet (it needs 10 logged days and 4 weigh-ins over 2 weeks), so any number is an estimate: say so, and that it gets exact from their logs. ${prot}${cur}.`;
  const floor = Math.max(sex === 'female' ? 1400 : 1700, rk(m.kcal * 0.7));
  const at = (kgWk: number) => Math.max(floor, m.kcal + dir * per(kgWk));
  const parts: string[] = [];
  if (st.need !== undefined && !st.dateUnsafe && !hold) parts.push(`the date's ${r2(Math.abs(st.need))} kg/week = about ${fmtK(at(Math.abs(st.need)))} kcal a day`);
  if (st.need !== undefined && st.dateUnsafe) parts.push(`the date's ${r2(Math.abs(st.need))} kg/week would need about ${fmtK(m.kcal + dir * per(Math.abs(st.need)))} kcal a day: past the safe pace${m.kcal + dir * per(Math.abs(st.need)) < floor ? ' and under the safe floor' : ''}, don't offer it`);
  const mid = r2((st.safe!.min + st.safe!.max) / 2);
  const [lo, hi] = dir < 0 ? [at(st.safe!.max), at(st.safe!.min)] : [at(st.safe!.min), at(st.safe!.max)];
  parts.push(`a safe ${r2(st.safe!.min)}–${r2(st.safe!.max)} kg/week = about ${fmtK(lo)}–${fmtK(hi)} kcal (${mid} kg/week ≈ ${fmtK(at(mid))})`);
  return `Calories for it, from TRUE MAINTENANCE ${fmtK(m.kcal)} kcal (${m.confidence} confidence; 7,700 kcal a kg): ${parts.join('; ')}${dir < 0 ? `; never under ${fmtK(floor)} kcal` : ''}. ${prot}${cur}.`;
}

/** The goal weight typed into Settings → Profile, while no weight goal told in chat runs: a fact to plan from, not a goal
 *  with a date or a pace. */
function profileGoalLine(d: Data, today: string, run: MemoryNote[]): string | undefined {
  const gw = d.settings.body?.goalWeightKg;
  if (!gw || run.some((m) => m.goal?.metric === 'weight')) return undefined;
  const ws = cleanWeighIns(d, today);
  const kg = ws.length ? scaleNow(ws, today) : undefined;
  return `Goal weight in their Profile: ${r1(gw)} kg (typed in Settings, no date, not planned with you yet)${kg ? `; now ${r1(kg)} kg on the trend, ${r1(Math.abs(gw - kg))} kg to go` : ''}.`;
}

/** For planning a new goal: what each pace costs or adds in calories, from TRUE MAINTENANCE (so the plan's numbers are
 *  the app's, not worked out in the answer). */
function paceTable(d: Data, today: string, exName: (id: string) => string): string | undefined {
  // (while a weight goal runs: its maintenance, so a change to it plans from the same number)
  const wg = activeGoals(d, today).find((x) => x.goal?.metric === 'weight' && x.goal.startDate);
  const m = wg ? goalMaintenance(d, wg.goal!.startDate, today) : trueMaintenance(d, today);
  const ws = cleanWeighIns(d, today);
  const kg = ws.length ? scaleNow(ws, today) : undefined;
  if (!m || !kg) return undefined;
  const floor = Math.max(d.settings.body?.sex === 'female' ? 1400 : 1700, rk(m.kcal * 0.7));
  const row = (wk: number) => `${wk > 0 ? '+' : '−'}${Math.abs(wk)} kg/week ≈ ${fmtK(Math.max(floor, m.kcal + (wk * KCAL_PER_KG) / 7))}`;
  const max = r2(kg * 0.01);
  const loss = [...[0.25, 0.5, 0.75].filter((x) => x < max - 0.05), max].filter((x) => m.kcal - (x * KCAL_PER_KG) / 7 >= floor);
  // (every 0.05 kg/week, so the pace a date needs has its own calories: judge round 9 saw +0.33 stated and the +0.4 row set)
  const steps = (lo: number, hi: number) => { const xs: number[] = []; for (let x = lo; x <= hi + 1e-9; x = r2(x + 0.05)) xs.push(r2(x)); return xs; };
  const fine = [...steps(0.2, Math.min(max, 1)).filter((x) => m.kcal - (x * KCAL_PER_KG) / 7 >= floor).map((x) => -x).reverse(), ...steps(0.15, r2(kg * 0.005))];
  const fineL = fine.map((x) => `${x > 0 ? '+' : '−'}${Math.abs(x)} ${fmtK(Math.max(floor, m.kcal + (x * KCAL_PER_KG) / 7))}`).join(', ');
  // (where each pace lands by a date, and the main lifts as they are: a plan's concrete numbers, not made up; judge round 4)
  const lands = (wk: number) => `${fmtPace(wk)}: ${[4, 8, 12].map((n) => `${r1(kg + wk * n)} kg by ${addDays(today, n * 7)}`).join(', ')}`;
  const lifts = mainLifts(d, today).map((id) => ({ id, b: best(liftTops(d, id, addDays(today, -55), today)) })).filter((x) => x.b);
  const cap = (wk: number) => fmtK(Math.max(floor, m.kcal + (wk * KCAL_PER_KG) / 7) + 300);
  const habit = habitLine(d, today, [...loss.map((x) => `${cap(-x)} with a ${x} kg/week loss`), ...(d.settings.goals.kcal ? [`${fmtK(d.settings.goals.kcal + 300)} at the current ${fmtK(d.settings.goals.kcal)} target`] : [])].join(', '), m.kcal + (0.25 * KCAL_PER_KG) / 7);
  const ate = foodDays(d, addDays(today, -14), today);
  const under = ate.length >= 5 ? rk(m.kcal - avg(ate.map((x) => x.kcal))!) : 0;
  const liftL = lifts.length ? ` Main lifts, best set in the last 8 weeks (estimated max): ${lifts.map((x) => `${exName(x.id)} ${r1(x.b!.kg)} × ${x.b!.reps} (${r1(x.b!.e)} kg)`).join(', ')}.${under >= 250 ? ` They eat about ${fmtK(under)} kcal a day under maintenance: a lift goal now pulls against the cut (a lift climbs slower in a deficit): a lift goal's plan says so and offers maintenance calories, ${fmtK(m.kcal)}, as its one question.` : ''}` : '';
  return `For planning a new goal or changing one (calories a day for each pace, from TRUE MAINTENANCE ${fmtK(m.kcal)} at ${r1(kg)} kg): ${[...loss.map((x) => row(-x)), row(0.25), row(0.4)].join(', ')}. Safe: losing up to ${r2(kg * 0.01)} kg/week (1 % of bodyweight), gaining up to ${r2(kg * 0.005)} kg/week; never under ${fmtK(floor)} kcal. Each kilo lost takes about ${Math.ceil(7 / Math.min(max, (m.kcal - floor) * 7 / KCAL_PER_KG))} days at the fastest safe pace (${fmtK(Math.max(floor, m.kcal - (max * KCAL_PER_KG) / 7))} kcal) and 14 at 0.5 kg/week: an ask that is too fast gets both, the fastest safe and the comfortable one, with the comfortable one as the recommended default (no question about which): the fastest safe pace leaves no room for a bad week, and on a cut it costs the most strength. A goal with a date: its pace is the kilos to go ÷ the weeks to the date; set the calories of the row at or just over that pace (so it reaches the date; never past the safe pace), and state that row's pace (every 0.05 kg/week, then kcal a day: ${fineL}). Where a pace lands: ${[lands(-0.25), lands(-0.5), lands(0.25)].join('; ')}. A new weight goal is tracked from ${r1(kg)} kg (the scale's line today, not one morning): its note starts from that number. Protein: on a cut 1.8–2.2 g/kg = ${Math.round(kg * 1.8)}–${Math.round(kg * 2.2)} g, on a gain 1.6–2.0 g/kg = ${Math.round(kg * 1.6)}–${Math.round(kg * 2)} g${d.settings.goals.protein && d.settings.goals.protein < Math.round(kg * 1.8) - 2 ? `; their ${d.settings.goals.protein} g target is under the cut range: a cut plan says at least ${Math.round(kg * 1.8)} g and offers to set it (set_setting proteinGoal)` : ''}.${liftL}${habit ? ` ${habit}` : ''}`;
}

const fmtPace = (x: number) => `${x > 0 ? '+' : ''}${r2(x)} kg/week`;
const STATUS: Record<Pace, string> = {
  reached: 'REACHED',
  ready: 'READY TO TEST (the estimate says it is there)',
  'on pace': 'ON PACE',
  ahead: 'AHEAD of pace',
  behind: 'BEHIND pace',
  'too fast': 'TOO FAST (past the safe pace)',
  'wrong way': 'GOING THE WRONG WAY',
  slow: 'SLOW (under the useful pace)',
  stalled: 'STALLED (no better best set lately)',
  'date passed': 'DATE PASSED, not reached',
  'too early': "CAN'T JUDGE THE PACE YET",
};

/** The GOALS block the Coach reads (empty when no goal was ever told). */
export function goalLines(d: Data, today: string, exName: (id: string) => string): string[] {
  const memory = d.memory ?? [];
  const goals = memory.filter((m) => m.kind === 'goal');
  const table = paceTable(d, today, exName);
  const run = activeGoals(d, today);
  const prof = profileGoalLine(d, today, run);
  if (!goals.length) return table || prof ? [`GOALS: none told yet.${prof ? ` ${prof}` : ''}${table ? ` ${table}` : ''}`] : [];
  const num = (m: MemoryNote) => memory.indexOf(m) + 1;
  const L: string[] = [`GOALS (told in chat; the app tracks them from the day they were set. Numbers below are worked out by the app: quote them, never redo the maths). ${run.some((m) => m.goal) ? 'Running:' : 'None running.'}`];
  if (prof) L.push(`- ${prof}`);
  // (goal notes from before goals had numbers: kept as they are, listed apart, never as a goal that runs)
  const older = run.filter((m) => !m.goal);
  for (const m of run.filter((x) => x.goal)) {
    const g = m.goal;
    if (!g || !tracked(m)) {
      const left = g?.by ? diffDays(g.by, today) : undefined;
      const lg = loggingLine(d, m, today);
      L.push(`- [memory ${num(m)}] "${m.text}"${g?.by ? left! >= 0 ? `, by ${g.by} (${left! + 1} day${left === 0 ? '' : 's'} left including today)` : `, its last day was ${g.by} (${-left!} day${left === -1 ? '' : 's'} ago): OVER, not yet closed` : ''}${g?.startDate ? `, set ${g.startDate}` : ''}: no number the app can track, so no pace; ${left !== undefined && left < 0 ? 'how it went is in DATA' : 'follow up from what DATA shows'}.${lg ? ` ${lg}` : ''}`);
      continue;
    }
    const st = goalState(d, m, today)!;
    const tg = g.target!;
    const set = `set ${g.startDate} (${st.daysIn} days ago)`;
    const by = g.by ? `by ${g.by} (${st.daysLeft! >= 0 ? `${st.daysLeft} days left` : `${-st.daysLeft!} days ago`})` : 'no date';
    const parts: string[] = [];
    if (st.metric === 'weight') {
      parts.push(`bodyweight ${st.start !== undefined ? `${st.start} kg at the start` : 'start unknown'} → target ${r1(tg)} kg, ${by}; ${set}.`);
      if (st.now !== undefined) {
        const done = st.start !== undefined ? r1(st.start - st.now) : undefined;
        const total = st.start !== undefined ? r1(st.start - tg) : undefined;
        parts.push(`Now ${st.scaleKg !== undefined ? `about ${st.now} kg by what they eat (the start plus ${st.daysIn} days at ${fmtPace(st.eating!.kgPerWeek)}; the scale's line says ${st.scaleKg} kg, last measured ${r1(st.measured!.kg)} kg on ${st.measured!.date}, mostly water this early: the kilos left and the pace below are from the food number)` : `${st.now} kg on the trend (last measured ${r1(st.measured!.kg)} kg on ${st.measured!.date})`}${done !== undefined && total ? `: ${r1(Math.abs(done))} kg ${Math.sign(done) === Math.sign(total) || !done ? 'of' : 'the wrong way, of'} ${r1(Math.abs(total))} kg (${Math.max(0, Math.round((done / total) * 100))} %)` : ''}.`);
      }
    } else {
      parts.push(`${exName(m.exerciseIds![0])} ${r1(tg)} kg × ${g.reps ?? 1} (estimated max ${st.target} kg), ${by}; ${set}${st.start !== undefined ? `, estimated max then ${st.start} kg` : ''}.`);
      if (st.now !== undefined) parts.push(`Now: estimated max ${st.now} kg from their best recent set (an estimate from reps; only a real attempt proves it).`);
      if (st.plateau) parts.push(`Plateau: best set ${r1(st.plateau.kg)} kg × ${st.plateau.reps}, matched but not beaten in ${st.plateau.workouts} workouts since ${st.plateau.since}.`);
      const nx = st.next ?? liftNext(d, m.exerciseIds![0]);
      if (nx) parts.push(`The workout screen's next target for its first set: ${r1(nx.kg)} kg × ${nx.reps}${g.plan ? '' : ' (no plan agreed yet: the first step)'}.`);
      const sinceSet = liftTops(d, m.exerciseIds![0], g.startDate, today).filter((x) => x.date > g.startDate || st.daysIn === 0).slice(-6);
      if (st.daysIn > 0) parts.push(sinceSet.length ? `Top sets since the goal was set: ${sinceSet.map((x) => `${r1(x.kg)} × ${x.reps}`).join(', ')}.` : 'Not trained since the goal was set.');
      // (the agreed plan, followed and not working: a fact the Coach must not answer with the same plan again)
      const tried = sinceSet.filter((x) => st.now === undefined || x.e >= st.now * 0.975);
      if (tried.length >= 3 && st.start !== undefined && Math.max(...sinceSet.map((x) => x.e)) <= st.start + 0.05) parts.push(`No progress in the ${tried.length} workouts at it since the goal was set${g.plan ? ' on the agreed plan' : ''}: the same next target each time hasn't moved it.`);
      const mt = trueMaintenance(d, today);
      const ate = foodDays(d, addDays(today, -14), today);
      const k = ate.length >= 5 ? avg(ate.map((x) => x.kcal))! : undefined;
      if (mt && k !== undefined && k < mt.kcal - 250) parts.push(`They eat about ${fmtK(mt.kcal - k)} kcal a day under TRUE MAINTENANCE (last 2 weeks, ${ate.length} logged days): a lift climbs slower in a deficit.`);
    }
    if (st.pace === 'stalled') {
      // (the actions written out, so the change is saved and not only said; judge round 12 saw it said and never saved)
      const id = m.exerciseIds?.[0];
      const r = id ? d.routines.find((x) => !x.oneOff && x.items.some((it) => it.exerciseId === id)) : undefined;
      const it = r?.items.find((x) => x.exerciseId === id);
      parts.push(`When you change its plan (one change), make it in this answer, not as a question (a maintenance offer can be the one question): send {"type":"remember","memory":${num(m)},"text":${JSON.stringify(m.text)},"goalPlan":"<the new plan in a few words, with kilos and reps>"}${r && it && id ? ` and, when it changes their sets, {"type":"edit_routine","routine":${JSON.stringify(r.name)},"change":[{"exercise":${JSON.stringify(exName(id))},"sets":<new sets>,"repMin":<the plan's low reps>,"repMax":<the plan's high reps>}]} (now ${it.workingSets} × ${it.repMin}–${it.repMax} in ${r.name}: the reps follow the new plan, never the old range)` : ''}, so the workout screen asks for the same thing.`);
    }
    if (st.rate !== undefined) parts.push(`Pace: ${fmtPace(st.rate)} (${st.rateBasis}).`);
    else if (st.rateBasis) parts.push(`(${st.rateBasis}.)`);
    if (st.eating && !st.rateBasis?.startsWith('what they eat')) parts.push(`What they eat points to ${fmtPace(st.eating.kgPerWeek)}: ${st.eating.days} logged days since the goal started averaging ${fmtK(st.eating.kcal)} kcal against TRUE MAINTENANCE ${fmtK(st.eating.maint)}${st.daysIn < 14 ? ' (the better guide in the first 2 weeks, while the scale swings with water)' : ''}.`);
    if (st.need !== undefined) parts.push(`The date needs ${fmtPace(st.need)} from here${st.dateUnsafe ? `: FASTER THAN SAFE (safe is ${st.safe!.min}–${st.safe!.max} kg/week, ${st.metric === 'weight' && (st.target ?? 0) < (st.now ?? 0) ? '0.5–1 % of bodyweight' : '0.25–0.5 % of bodyweight'})` : ''}.`);
    else if (st.safe) parts.push(`Safe pace ${st.safe.min}–${st.safe.max} kg/week.`);
    if (st.eta && st.pace !== 'too fast') parts.push(`At this pace it lands around ${st.eta}.`);
    if (st.atTarget && st.pace !== 'reached') parts.push(`Eating the current target (${fmtK(st.atTarget.kcal)} kcal) from today: ${fmtPace(st.atTarget.kgPerWeek)}${st.atTarget.eta ? `, landing around ${st.atTarget.eta}` : ', not toward the target'}.`);
    if (st.safeEta && (st.dateUnsafe || st.pace === 'too fast' || st.pace === 'date passed')) parts.push(`At the safe ${st.safe!.max} kg/week it lands around ${st.safeEta}.`);
    parts.push(`STATUS: ${STATUS[st.pace]}${st.why ? ` (${st.why})` : ''}.`);
    // (a weigh-in: the cut-off morning, worked out here: the morning before, at most half a kilo over, is made by an empty
    // gut and a normal night; more than that → the class up, never a fluid cut)
    if (st.short && st.metric === 'weight' && tg < (st.now ?? tg) && g.by && st.daysLeft! >= 2) parts.push(`Cut-off: the morning before (${addDays(g.by, -1)}) over ${r1(tg + 0.5)} kg → the next class up; at or under it, a normal day of low-residue food and normal fluids makes it.`);
    if (st.metric === 'weight' && st.daysLeft !== undefined && st.daysLeft <= 7 && st.now !== undefined && Math.abs(tg - st.now) <= st.now * 0.025 && st.pace !== 'reached') parts.push(`(${st.daysLeft} days to its date and ${r1(Math.abs(tg - st.now))} kg (${Math.round((Math.abs(tg - st.now) / st.now) * 1000) / 10} %) to go: what can still change this week is mostly food in the gut and water, not fat.)`);
    if (g.plan) parts.push(`Plan agreed: ${g.plan}.`);
    // (days far over the target since it started, and what made them: a habit the plan named that kept going)
    let bigBehind = false;
    const tk = d.settings.goals.kcal;
    if (st.metric === 'weight' && tk && tg < (st.start ?? st.now ?? tg)) {
      const bigD = foodDays(d, g.startDate, today).filter((x) => x.kcal >= tk + 500);
      if (bigD.length >= 2) {
        const rest = foodDays(d, g.startDate, today).filter((x) => x.kcal < tk + 500).map((x) => x.date);
        const what = rest.length ? habitSlot(d, bigD.map((x) => x.date), rest) : undefined;
        parts.push(`${st.pace === 'behind' ? 'MUST SAY THIS TURN: ' : ''}Days far over the target since it started: ${bigD.map((x) => `${WEEKDAY[wdOf(x.date)].slice(0, 3)} ${fmtK(x.kcal)}`).join(', ')}${what ? ` (${what.label}: ${fmtK(what.hi)} kcal on them vs ${fmtK(what.lo)} on the other days${what.foods.length ? `; biggest on those days: ${what.foods.join(', ')}` : ''})` : ''}. If the plan already named this habit, its cap didn't hold: give one new concrete tactic yourself, about those foods (what changes about that food or that evening, with a number), not the same cap again; never ask them what the tactic should be.`);
        if (st.pace === 'behind') bigBehind = true;
        const mr = st.pace === 'reached' ? goalMaintenance(d, g.startDate, today) : undefined;
        if (mr) parts.push(`MUST SAY THIS TURN (holding it): those days are what undoes it at maintenance; the plan to hold it caps them at maintenance + 300 = ${fmtK(mr.kcal + 300)}, about ${fmtK(Math.max(0, avg(bigD.map((x) => x.kcal))! - mr.kcal - 300))} less than they average${what ? `, all of it off ${what.label}, which then stays at about ${fmtK(Math.max(0, what.hi - Math.max(0, avg(bigD.map((x) => x.kcal))! - mr.kcal - 300)))} kcal on those days` : ''}: say that number with one tactic for that food.`);
      }
    }
    // (gaining too fast: where the extra food comes from, against the 4 weeks before the goal; judge round 10)
    if (st.metric === 'weight' && st.pace === 'too fast' && tg > (st.start ?? st.now ?? tg)) {
      const src = surplusSource(d, g.startDate, today);
      const now = st.now ?? st.start ?? 0;
      const ate = foodDays(d, g.startDate, today);
      const p = avg(ate.map((x) => x.protein));
      const pTop = Math.round(now * 2);
      const parts2 = [src ? `the most extra comes from ${src.label}: ${fmtK(src.now)} kcal a day since the goal started vs ${fmtK(src.before)} before it${src.foods.length ? ` (biggest: ${src.foods.join(', ')})` : ''}` : '', p !== undefined && p > pTop + 25 ? `protein ${Math.round(p)} g a day, ${Math.round(p - pTop)} g over the top of its range (${pTop} g): an easy place to trim, about ${fmtK((p - pTop) * 4)} kcal` : ''].filter(Boolean);
      const mm2 = goalMaintenance(d, g.startDate, today);
      const dateK = mm2 && st.need !== undefined && st.need > 0 ? rk(mm2.kcal + (st.need * KCAL_PER_KG) / 7) : undefined;
      const eatK = avg(ate.map((x) => x.kcal));
      const gapK = eatK !== undefined ? rk(eatK - (dateK ?? d.settings.goals.kcal ?? eatK)) : 0;
      const trim = p !== undefined && p > pTop + 25 ? rk((p - pTop) * 4) : 0;
      const restK = Math.max(0, gapK - trim);
      const fix = [trim ? `protein down to about ${pTop} g (e.g. one shake fewer), about −${fmtK(Math.min(trim, gapK))} kcal, carbs kept (they fuel training)` : '', restK >= 100 && src ? `${src.label} plated at about ${fmtK(src.now - restK)} kcal, about −${fmtK(restK)}` : ''].filter(Boolean).join(', plus ');
      if (parts2.length) parts.push(`MUST SAY THIS TURN: they eat about ${fmtK(eatK ?? 0)} kcal a day, about ${fmtK(gapK)} over what the date needs; ${parts2.join('; ')}. The fix, adding up to that gap: ${fix || 'less of that meal, with how much'}; not only "back to the target".${dateK ? ` RECOMMEND: ${fmtK(dateK)} kcal a day, the date's pace (it lands on ${g.by} with less fat): offer to set it, the reply's one question.` : ''}`);
    }
    // (the check-in, worked out here so every plan has the same rule: every 2 weeks from its start)
    let hold = false;
    if (st.metric === 'weight' && st.pace !== 'reached' && !st.short && st.now !== undefined) {
      const down = tg < (st.start ?? st.now);
      const ck = addDays(g.startDate, 14 * Math.max(1, Math.ceil((st.daysIn + 1) / 14)));
      if (!g.by || ck <= g.by) parts.push(`Check-in ${ck} (every 2 weeks): the scale's pace under half of what the date needs then → ${down ? '150 kcal less' : '150 kcal more'}; past the safe pace → ${down ? '150 kcal more' : '150 kcal less'}; else no change.`);
      // (behind on a cut while sleep or HRV is off: eating less now costs strength; the later date is the call)
      const rOff = recovery(d, today).off.filter((x) => /^(sleep|HRV)/.test(x));
      // (behind because of a few big days: those days are the fix, not fewer calories on all the others)
      const mm = goalMaintenance(d, g.startDate, today);
      const reachK = mm && st.need !== undefined && !st.dateUnsafe ? rk(mm.kcal + (st.need * KCAL_PER_KG) / 7) : undefined;
      // (a target that lands after its date, early on: said now, not found at the first check-in; judge round 11)
      if (st.atTarget?.eta && g.by && st.atTarget.eta > g.by && st.pace !== 'behind' && reachK && tk && Math.abs(reachK - tk) >= 30) parts.push(`MUST SAY THIS TURN: the ${fmtK(tk)} kcal target lands around ${st.atTarget.eta}, after the date; ${fmtK(reachK)} kcal a day reaches ${g.by}: offer to set it (set_setting kcalGoal).`);
      if (down && bigBehind && !rOff.length) {
        hold = true;
        parts.push(`RECOMMEND: keep the current target${st.atTarget?.eta ? ` (it lands around ${st.atTarget.eta})` : ''} and fix the days far over it with the tactic above; don't offer fewer calories on the other days.${st.atTarget?.eta && g.by && st.atTarget.eta > g.by ? ` Offer to move the date to ${st.atTarget.eta} (remember with memory = ${num(m)}, goal.by ${st.atTarget.eta})${reachK ? `, or keep the date at ${fmtK(reachK)} kcal a day (what reaches it; the current target doesn't)` : ''}: that offer is the reply's one question.` : ''}`);
      }
      if (down && st.pace === 'behind' && rOff.length) {
        hold = true;
        parts.push(`RECOMMEND (recovery is off: ${rOff.join(', ')}): keep the current target${st.atTarget?.eta ? ` and accept landing around ${st.atTarget.eta}` : ''}, and fix the days far over it; eating less while sleep or HRV is down costs strength. Don't offer fewer calories now.${st.atTarget?.eta ? ` Offer to move the date to ${st.atTarget.eta} (remember with memory = ${num(m)}, goal.by ${st.atTarget.eta}), so the app follows the same date: that offer is the reply's one question.` : ''}`);
      }
    }
    if (st.metric === 'weight' && st.daysIn < 14 && st.pace !== 'reached') parts.push('(Under 2 weeks in: day-to-day weigh-ins swing 1–2 kg with water, salt and food; judge the trend, not one morning.)');
    const cal = goalCalories(d, st, today, hold);
    L.push(`- [memory ${num(m)}] "${m.text}": ${parts.join(' ')}${cal ? `\n  ${cal}` : ''}`);
  }
  if (older.length) L.push(`Older goal notes (saved before goals had numbers; not tracked, no pace): ${older.map((m) => `[memory ${num(m)}] "${m.text}"`).join('; ')}.`);
  if (table) L.push(table);
  const ended = goals.filter((m) => m.goal?.status && m.goal.endedOn && diffDays(today, m.goal.endedOn) <= 60);
  if (ended.length) L.push(`Ended goals (last 60 days): ${ended.map((m) => `"${m.text}" ${m.goal!.status === 'done' ? 'reached' : 'dropped'} on ${m.goal!.endedOn}`).join('; ')}.`);
  return L;
}

/** Sleep and recovery: the last 7 days against their usual (the median of the 30 days before them), and what is off. */
function recovery(d: Pick<AppData, 'health'>, today: string) {
  const hs = (d.health ?? []).filter((h) => diffDays(today, h.date) >= 0);
  const wk = hs.filter((h) => diffDays(today, h.date) < 7), usual = hs.filter((h) => diffDays(today, h.date) >= 7 && diffDays(today, h.date) < 37);
  const pair = (k: 'sleepMin' | 'hrv' | 'restHr') => { const a = avg(wk.map((h) => h[k]).filter((x): x is number => x !== undefined)); const u = usual.filter((h) => h[k] !== undefined).length >= 5 ? median(usual.map((h) => h[k]).filter((x): x is number => x !== undefined)) : undefined; return a !== undefined && u !== undefined ? { a, u } : undefined; };
  const sl = pair('sleepMin'), hv = pair('hrv'), rh = pair('restHr');
  const rec: string[] = []; const off: string[] = [];
  if (sl) { rec.push(`sleep ${hm(sl.a)} a night vs usual ${hm(sl.u)}`); if (sl.a <= sl.u - 30) off.push(`sleep ${Math.round(sl.u - sl.a)} min under usual`); }
  if (hv) { rec.push(`HRV ${Math.round(hv.a)} vs usual ${Math.round(hv.u)} ms`); if (hv.a <= hv.u * 0.9) off.push(`HRV ${Math.round((1 - hv.a / hv.u) * 100)} % under usual`); }
  if (rh) { rec.push(`resting HR ${Math.round(rh.a)} vs usual ${Math.round(rh.u)}`); if (rh.a >= rh.u + 3) off.push(`resting HR ${Math.round(rh.a - rh.u)} over usual`); }
  return { rec, off };
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const wdOf = (date: string) => new Date(`${date}T12:00:00`).getDay();

/** What most likely breaks a plan, from the last 4 weeks of food: the days of the week far over the rest, and protein
 *  days. Worked out here, so a plan names their real habit (judge round 5: the model borrowed the prompt's example). */
function habitLine(d: Data, today: string, caps?: string, gainKcal?: number): string | undefined {
  const days = foodDays(d, addDays(today, -28), today);
  if (days.length < 10) return undefined;
  const all = avg(days.map((x) => x.kcal))!;
  const by = new Map<number, number[]>();
  for (const x of days) (by.get(wdOf(x.date)) ?? by.set(wdOf(x.date), []).get(wdOf(x.date))!).push(x.kcal);
  const high = [...by].filter(([, ks]) => ks.length >= 2).map(([w, ks]) => ({ w, k: avg(ks)! })).filter((x) => x.k >= all + 300).sort((a, b) => a.w - b.w);
  const rest = avg(days.filter((x) => !high.some((h) => h.w === wdOf(x.date))).map((x) => x.kcal));
  const g = d.settings.goals;
  const hit = g.protein ? days.filter((x) => Math.round(x.protein) >= g.protein!).length : undefined;
  // (and what on those days makes the difference: the food after 20:00, or one meal; the habit, not just the day)
  const isHigh = (date: string) => high.some((h) => h.w === wdOf(date));
  const hiD = days.filter((x) => isHigh(x.date)).map((x) => x.date), loD = days.filter((x) => !isHigh(x.date)).map((x) => x.date);
  const what = high.length && loD.length ? habitSlot(d, hiD, loD) : undefined;
  // (every day of the week that qualifies: a habit on 4 nights is not "the weekend"; judge round 8)
  const named = high.length >= 3 ? `${high.length} days a week (${high.map((h) => WEEKDAY[h.w].slice(0, 3)).join(', ')}) average ${fmtK(avg(high.map((h) => h.k))!)} kcal` : high.map((h) => `${WEEKDAY[h.w]}s average ${fmtK(h.k)} kcal`).join(' and ');
  const pat = high.length && rest !== undefined ? `${named}, against ${fmtK(rest)} on the other days${what ? `, mostly ${what.label}: ${fmtK(what.hi)} kcal on those days vs ${fmtK(what.lo)} on the others${what.foods.length ? ` (biggest: ${what.foods.join(', ')})` : ''}` : ''}${high.length >= 3 ? `; they come ${high.length} days a week, so their cap is the daily target itself (+300 on them would cut the pace by about ${r2((high.length * 300) / KCAL_PER_KG)} kg/week and miss the date): the food on them portioned inside the target` : caps ? `; a cap for those days that still holds a plan: its daily target + 300 (${caps}); with it the pace is about ${r2((high.length * 300) / KCAL_PER_KG)} kg/week slower than the row, so a plan that keeps a date takes the row about that much faster (its calories, its cap = those + 300, still within the safe pace) and says the pace as the two together (e.g. 2,350 on ordinary days and 2,650 on the big days average 0.5 kg/week), else says the later date: never the row's date with the slower pace` : g.kcal ? `; a cap for those days that still holds a plan: its daily target + 300 (now ${fmtK(g.kcal + 300)})` : ''}${what ? `; HOW to hold that cap (say it next to the cap): ${habitTactic(what, high.length >= 3)}` : ''}` : `no day of the week clearly over the others (all within 300 kcal of the ${fmtK(all)} average)`;
  // (a gain: the big days aren't the risk, the ordinary days under the new target are; judge round 10 saw a weekend cap
  // above what the weekends already ate)
  const base = rest ?? all;
  const gap = gainKcal ? rk(gainKcal - base) : 0;
  // (ordinary days far under a cut's target: restricting them is what sets up the big days; judge round 11)
  const cutK = gainKcal ? rk(gainKcal - (0.75 * KCAL_PER_KG) / 7) : undefined;
  const lowL = cutK && high.length && rest !== undefined && rest < cutK - 150 ? ` The other days (${fmtK(rest)}) are under even a 0.5 kg/week cut's ${fmtK(cutK)}: a cut plan says to eat the full target every day, with a planned evening snack of about 300 kcal; restricting the ordinary days is what sets up the big ones.` : '';
  const howFor = (wk: number) => { const k = rk(gainKcal! + ((wk - 0.25) * KCAL_PER_KG) / 7), gp = rk(k - base); return `+${wk} (${fmtK(k)}): ${fmtK(gp)} more = one shake or snack of about ${fmtK(Math.min(600, gp))}${gp > 650 ? ` plus ${fmtK(gp - 600)} at one meal` : ''}`; };
  const gainL = gap >= 150 ? ` On a GAIN plan this cap doesn't apply (the big days aren't the risk): ${high.length ? 'the other days' : 'their days'} average ${fmtK(base)}, under a gain target; the how for those days, for the row the plan picks (its numbers add up to the gap): ${[0.25, 0.3, 0.35, 0.4].map(howFor).join('; ')}.` : '';
  return `What most likely breaks a plan (last 4 weeks, ${days.length} finished logged days): ${pat}${hit !== undefined ? `; protein at or above ${g.protein} g on ${hit} of ${days.length} days` : ''}. A plan names this habit with these numbers, never another.${lowL}${gainL}`;
}

/** On the big days against the others: the food after 20:00, or the one meal, that makes most of the difference. */
function habitSlot(d: Pick<AppData, 'entries'>, hi: string[], lo: string[]) {
  // (late: after 21:00, so a late dinner isn't counted as the habit)
  const late = (e: AppData['entries'][number]) => new Date(e.at).getHours() >= 21;
  const per = (dates: string[], f: (e: AppData['entries'][number]) => boolean) => { const set = new Set(dates); let k = 0; for (const e of d.entries) if (set.has(e.date) && f(e)) k += e.nutrients.kcal ?? 0; return k / dates.length; };
  const meals = [...new Set(d.entries.filter((e) => hi.includes(e.date)).map((e) => e.mealId))];
  const opts = [{ label: 'food after 21:00', f: late }, ...meals.map((m) => ({ label: `the ${m} meal`, f: (e: AppData['entries'][number]) => e.mealId === m }))]
    .map((o) => ({ label: o.label, f: o.f, hi: per(hi, o.f), lo: per(lo, o.f) })).sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo));
  const top = opts[0];
  if (!top || top.hi - top.lo < 250) return undefined;
  // (the foods that make it, on the big days: so a tactic is about their real food, not a guess; judge round 9)
  const set = new Set(hi);
  const by = new Map<string, number>();
  for (const e of d.entries) if (set.has(e.date) && top.f(e)) by.set(e.snap.name, (by.get(e.snap.name) ?? 0) + (e.nutrients.kcal ?? 0));
  const foods = [...by].sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, k]) => k / hi.length >= 100).map(([n, k]) => `${n} (about ${fmtK(k / hi.length)} kcal a day)`);
  return { label: top.label, hi: top.hi, lo: top.lo, foods };
}

/** Since a goal started against the 4 weeks before it: the meal that grew the most, and its biggest foods now. */
function surplusSource(d: Data, start: string, today: string) {
  const now = foodDays(d, start, today).map((x) => x.date), before = foodDays(d, addDays(start, -28), start).filter((x) => x.date < start).map((x) => x.date);
  if (now.length < 3 || before.length < 5) return undefined;
  const per = (dates: string[], meal: string) => { const set = new Set(dates); let k = 0; for (const e of d.entries) if (set.has(e.date) && e.mealId === meal) k += e.nutrients.kcal ?? 0; return k / dates.length; };
  const meals = [...new Set(d.entries.filter((e) => now.includes(e.date)).map((e) => e.mealId))];
  const top = meals.map((m) => ({ m, now: per(now, m), before: per(before, m) })).sort((a, b) => (b.now - b.before) - (a.now - a.before))[0];
  if (!top || top.now - top.before < 150) return undefined;
  const set = new Set(now); const by = new Map<string, number>();
  for (const e of d.entries) if (set.has(e.date) && e.mealId === top.m) by.set(e.snap.name, (by.get(e.snap.name) ?? 0) + (e.nutrients.kcal ?? 0));
  const foods = [...by].sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, k]) => k / now.length >= 100).map(([n, k]) => `${n} (about ${fmtK(k / now.length)} kcal a day)`);
  return { label: `the ${top.m} meal`, now: top.now, before: top.before, foods };
}

/** A plan-time "how" next to the cap for the habit: a concrete change to that food, from its numbers. */
function habitTactic(what: { label: string; lo: number }, tight = false) {
  if (what.label.startsWith('food after')) return 'a planned evening snack of about 300 kcal ready (skyr, fruit, a protein bar), and the kitchen closed after it';
  if (/snack/i.test(what.label)) return `the day's snacks portioned out ahead at about ${fmtK(tight ? 300 : what.lo + 300)} kcal, eaten from a plate, not from the bag`;
  return `${what.label.replace(/^the /, 'that ')} plated once at about ${fmtK(what.lo + (tight ? 0 : 200))} kcal (its usual on the other days${tight ? '' : ' plus 200'}), no second round`;
}

/** A promise about logging, checked against the log: the finished days since it was set, full or not. */
export function loggingCount(d: Pick<AppData, 'entries'>, m: MemoryNote, today: string) {
  const g = m.goal;
  if (!g?.startDate || g.status || !/\b(log|logs|logged|logging|logge|logger|track)\b/i.test(m.text)) return undefined;
  const to = [addDays(today, -1), g.by ?? addDays(today, -1)].sort()[0];
  // (the day it is set: nothing to count yet, but it runs; the Today card shows it from the start)
  if (to < g.startDate) return g.by && g.by >= today ? { full: 0, n: 0, left: diffDays(g.by, today) + 1 } : undefined;
  const open = new Set(unfinishedDays(d, today, 28).map((u) => u.date));
  const has = new Set(d.entries.map((e) => e.date));
  let full = 0, n = 0;
  for (let x = g.startDate; x <= to; x = addDays(x, 1)) { n++; if (has.has(x) && !open.has(x)) full++; }
  return { full, n, left: g.by && g.by >= today ? diffDays(g.by, today) + 1 : 0 };
}

function loggingLine(d: Data, m: MemoryNote, today: string): string | undefined {
  const g = m.goal;
  if (!g?.startDate || !/\b(log|logs|logged|logging|logge|logger|track)\b/i.test(m.text)) return undefined;
  const to = [addDays(today, -1), g.by ?? addDays(today, -1)].sort()[0];
  if (to < g.startDate) return undefined;
  const open = new Map(unfinishedDays(d, today, 28).map((u) => [u.date, u.missing]));
  const has = new Set(d.entries.map((e) => e.date));
  const name = (x: string) => `${WEEKDAY[wdOf(x)].slice(0, 3)} ${x}`;
  const full: string[] = [], part: string[] = [], none: string[] = [];
  for (let x = g.startDate; x <= to; x = addDays(x, 1)) {
    if (!has.has(x)) none.push(name(x));
    else if (open.has(x)) part.push(`${name(x)} (${open.get(x)!.join(', ')} missing)`);
    else full.push(name(x));
  }
  const n = full.length + part.length + none.length;
  const left = g.by && g.by >= today ? diffDays(g.by, today) + 1 : 0;
  const broke = [...part, ...none].map((x) => x.slice(0, 3));
  return `Logging since it was set (${n} finished day${n === 1 ? '' : 's'}, today not counted): fully logged ${full.length} of ${n}${part.length ? `; not finished: ${part.join(', ')}` : ''}${none.length ? `; nothing logged: ${none.join(', ')}` : ''}${left ? `; today ${has.has(today) ? 'has entries so far' : 'has nothing yet'}` : ''}. Verdict (say it in these words): ${broke.length ? `Broken on ${broke.join(' and ')}` : 'Kept so far'}${left ? `; ${left} day${left === 1 ? '' : 's'} left including today${broke.length ? ' to finish the rest clean' : ''}` : ''}.${left && !has.has(today) && new Date().getHours() >= 19 ? ' It is late and nothing is logged today: the one ask is today\'s meals now (the missing days can wait), with one new fix for the habit (an evening reminder, a photo of the plate).' : ''}`;
}

const hm = (min: number) => { const m = Math.round(min); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const median = (xs: number[]) => { if (!xs.length) return undefined; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * GOAL WATCH: shown while a goal runs, and on a fat-loss or muscle profile goal (a cut or a bulk is a goal too). The
 * windows: since the goal started when it is 10+ days old (strength against the 4 weeks before it), else the last 2 weeks
 * against the 4 before.
 */
export function goalWatchLines(d: Data, today: string, exName: (id: string) => string): string[] {
  const run = activeGoals(d, today).filter(tracked);
  const profile = d.settings.profile.goal;
  // (under 18, or a school grade in memory: no cut signs, and no watch for a fat-loss profile alone)
  const age = ageFromMemory(d.memory ?? [], today);
  const minor = (age !== undefined && age < 18) || (d.memory ?? []).some((m) => /\b(?:[1-9]|1[0-2])(?:st|nd|rd|th)\s+grade\b|\bgrade\s+(?:[1-9]|1[0-2])\b|\b[1-9]\.\s*klasse\b|\bfolkeskole/i.test(m.text));
  if (!run.length && (minor || (profile !== 'fatloss' && profile !== 'muscle'))) return [];
  const startDate = run.map((m) => m.goal.startDate).sort()[0];
  const sinceGoal = !!startDate && diffDays(today, startDate) >= 10;
  const nowFrom = sinceGoal ? addDays(today, -13) < startDate ? startDate : addDays(today, -13) : addDays(today, -13);
  const beforeFrom = sinceGoal ? addDays(startDate, -28) : addDays(today, -41), beforeTo = sinceGoal ? addDays(startDate, -1) : addDays(today, -14);
  const losing = run.filter((m) => m.goal.metric === 'weight').map((m) => goalState(d, m, today)!).filter((st) => (st.start ?? st.now) !== undefined);
  const cutting = !minor && (losing.length ? losing.some((st) => st.target! < (st.start ?? st.now)!) : profile === 'fatloss');
  const L: string[] = [];

  const { rec, off } = recovery(d, today);
  const recL = rec.length ? (`Recovery, last 7 days (averages) vs their usual: ${rec.join(', ')}.${off.length ? ` Off: ${off.join(', ')}${cutting ? ': on a cut, worth naming next to the pace and strength' : ''}.` : ' Nothing clearly off.'}`) : undefined;

  // strength on the main lifts: the most trained weight × reps lifts of the last 8 weeks
  // (compound lifts: a lateral raise or a curl says little about muscle on a cut)
  const main = mainLifts(d, today);
  const rows: { id: string; a: number; b: number; pct: number }[] = [];
  for (const id of main) {
    // (now: the better of its last two workouts, so a slide shows within days; before: the best of the window before)
    // (both sides the better of two workouts: the best of a whole month before would make any normal week look like a drop)
    const a = best(liftTops(d, id, beforeFrom, beforeTo).slice(-2)), b = best(liftTops(d, id, nowFrom, today).slice(-2));
    if (a && b) rows.push({ id, a: a.e, b: b.e, pct: ((b.e - a.e) / a.e) * 100 });
  }
  if (rows.length) {
    const down = rows.filter((x) => x.pct <= -3);
    L.push(`Strength (estimated max: the better of the last 2 workouts${sinceGoal ? ` since ${nowFrom}, vs the better of the last 2 before the goal` : ' in the last 2 weeks, vs the better of the 2 before that'}): ${rows.map((x) => `${exName(x.id)} ${r1(x.a)} → ${r1(x.b)} kg (${x.pct >= 0 ? '+' : ''}${Math.round(x.pct)} %)`).join(', ')}. ${down.length} of ${rows.length} down 3 % or more.`);
    if (cutting && down.length >= 2 && off.some((x) => /^(sleep|HRV)/.test(x))) L.push(`SIGN TO RAISE: ${down.length} main lifts are down 3 % or more during a cut while recovery is off (${off.join(', ')}). Not recovering on a cut is the usual first step to losing strength and muscle: say it as a sign, with these numbers, next to protein and the pace, and offer one fix (more sleep first; or a smaller deficit, more protein), never lighter training.`);
    else if (cutting && down.length >= 2 && down.length * 2 >= rows.length) L.push(`SIGN TO RAISE: strength is falling on most main lifts during a cut. That is the early warning for losing muscle (or for not recovering: sleep, protein, a too-big deficit). The data can't tell which: say it as a sign with these numbers, check protein, sleep and the pace above, and offer one fix (a smaller deficit, more protein, more sleep), never lighter training.`);
    else if (down.length === 1) L.push(`One lift down alone is usually a bad day or fatigue, not muscle loss: mention it only if asked or if it keeps falling.`);
  } else L.push(`Strength: not enough recent sessions of the same lifts to compare (needs a session of each in both windows).`);

  if (recL) L.push(recL);

  // protein and calories since the goal started (or the last 2 weeks)
  // (since the goal from its 3rd day: the weeks before it were another plan)
  const from = startDate && diffDays(today, startDate) >= 3 ? startDate : addDays(today, -13);
  const foodHead = from === startDate ? `since the goal started on ${startDate}` : 'the last 2 weeks';
  const days = foodDays(d, from, today);
  const g = d.settings.goals;
  if (days.length) {
    const p = avg(days.map((x) => x.protein))!; const k = avg(days.map((x) => x.kcal))!;
    const hit = g.protein ? days.filter((x) => Math.round(x.protein) >= g.protein!).length : undefined;
    L.push(`Food ${foodHead} (${days.length} logged days, today not counted): average ${fmtK(k)} kcal${g.kcal ? ` against the ${fmtK(g.kcal)} target` : ''}; protein average ${Math.round(p)} g${hit !== undefined ? `, at or above the ${g.protein} g target on ${hit} of ${days.length} days` : ''}.`);
  }

  // training: workouts and skipped sets, stalled lifts
  const gym = d.sessions.filter((s) => s.status === 'done' && s.date >= from && s.date <= today).length;
  const sk = skippedSets(d, today, 14);
  const stalls = stalledLifts(d.sessions, today).map((s) => exName(s.exerciseId));
  const lift14 = d.sessions.filter((s) => s.status === 'done' && s.date > addDays(today, -14) && s.date <= today).length;
  if (cutting && lift14 === 0) L.push(`SIGN TO RAISE: no strength training in the last 2 weeks during a cut: without lifting, a good part of what comes off is muscle. Say it once in the plan or the follow-up and offer two full-body sessions a week (create_routine), never as a condition for the goal.`);
  L.push(`Training ${foodHead}: ${gym} gym workouts; planned working sets skipped in the last 14 days: ${sk.workouts ? `${sk.skipped} of ${sk.planned}` : 'no planned workouts to judge'}${stalls.length ? `; stalled: ${stalls.join(', ')}` : ''}.`);
  // (a sign is said this turn, once, with the protein next to it: judge round 7, the protein was left out)
  const prot = days.length ? `protein ${foodHead}: average ${Math.round(avg(days.map((x) => x.protein))!)} g${g.protein ? `, at or above ${g.protein} g on ${days.filter((x) => Math.round(x.protein) >= g.protein!).length} of ${days.length} days` : ''}` : undefined;
  for (let i = 0; i < L.length; i++) if (L[i].startsWith('SIGN TO RAISE: ')) L[i] = `MUST SAY THIS TURN (once, with the numbers${prot && !/no strength training/.test(L[i]) ? `; ${prot}` : ''}): ${L[i].slice(15)}`;
  return [`GOAL WATCH (what a coach keeps an eye on while ${run.length ? 'a goal runs' : `their profile goal (${profile}) runs`}; bring up what is off without being asked, early, with the numbers; never by telling them to train lighter or do fewer sets):`, ...L.map((x) => `- ${x}`)];
}

/** One short line for a goal's progress (Coach memory, Today's note): "81.9 → 80.4 kg · behind". */
export function goalShort(st: GoalState, t: (k: string, v?: Record<string, string | number>) => string, kg: (x: number) => string): string {
  const word: Record<Pace, string> = { reached: t('reached'), ready: t('ready to test'), 'on pace': t('on pace'), ahead: t('ahead of pace'), behind: t('behind pace'), 'too fast': t('faster than safe'), 'wrong way': t('going the wrong way'), slow: t('slow'), stalled: t('stalled'), 'date passed': t('date passed'), 'too early': t('too early to tell') };
  if (st.metric === 'other' || st.target === undefined) return '';
  const nums = st.now !== undefined ? `${kg(st.now)} → ${kg(st.target)}` : `→ ${kg(st.target)}`;
  return `${nums} · ${word[st.pace]}`;
}
