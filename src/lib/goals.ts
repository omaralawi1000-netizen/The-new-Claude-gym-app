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
import { oddWeighIns, weighIns } from './dataQuality';
import { trueMaintenance } from './maintenance';
import { weightTrend, nutritionByDay, stalledLifts, skippedSets } from './stats';

type Data = Pick<AppData, 'memory' | 'weights' | 'health' | 'entries' | 'sessions' | 'exercises' | 'routines' | 'settings'>;

const KCAL_PER_KG = 7700;
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rk = (x: number) => Math.round(x / 10) * 10;
const fmtK = (x: number) => rk(x).toLocaleString('en-US');

/** An estimated one-rep max (Epley; a single is itself). */
export const est = (kg: number, reps: number) => (reps <= 1 ? kg : kg * (1 + reps / 30));

/** The goals still running (a goal note not reached or dropped), oldest first. */
export const activeGoals = (d: Pick<AppData, 'memory'>, today: string) => (d.memory ?? []).filter((m) => m.kind === 'goal' && !m.goal?.status && !(m.until && m.until < today));
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

/** The weigh-ins to judge from: Aven's and the watch's scale, without the ones that are clearly a typo or a glitch. */
function cleanWeighIns(d: Pick<AppData, 'weights' | 'health'>, today: string) {
  const odd = new Set(oddWeighIns(d, today, 60).map((w) => w.date));
  return weighIns(d).filter((w) => w.date <= today && !odd.has(w.date));
}

/** Where the goal starts, the day it is set: the weight trend now, or the lift's best estimated max in the 6 weeks before. */
export function goalStart(d: Pick<AppData, 'weights' | 'health' | 'sessions'>, plan: Pick<GoalPlan, 'metric'>, exerciseId: string | undefined, today: string): number | undefined {
  if (plan.metric === 'weight') {
    const ws = cleanWeighIns(d, today);
    const last = ws[ws.length - 1];
    if (!last || diffDays(today, last.date) > 14) return undefined;
    return r1(weightTrend(ws)[ws.length - 1].kg);
  }
  if (plan.metric === 'lift' && exerciseId) { const b = best(liftTops(d, exerciseId, addDays(today, -42), today)); return b ? r1(b.e) : undefined; }
  return undefined;
}

export type Pace = 'reached' | 'on pace' | 'ahead' | 'behind' | 'too fast' | 'wrong way' | 'slow' | 'date passed' | 'too early';
export interface GoalState {
  note: MemoryNote;
  metric: GoalPlan['metric'];
  /** weight: kg on the trend; lift: estimated max */
  start?: number; now?: number; target?: number;
  /** a weight goal: the last real weigh-in */
  measured?: { kg: number; date: string };
  daysIn: number; daysLeft?: number;
  /** kg a week, + up, − down: from the scale's trend or the lift's sets */
  rate?: number; rateBasis?: string;
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
    // the pace: the last 4 weeks of weigh-ins, at least 6 over 14+ days (fewer is mostly water)
    const recent = ws.filter((w) => w.date >= addDays(today, -27));
    const span = recent.length ? diffDays(recent[recent.length - 1].date, recent[0].date) : 0;
    const sl = recent.length >= 6 && span >= 14 ? slope(recent.map((w) => ({ date: w.date, v: w.kg }))) : null;
    // where they are now: on that line when there is one (a smoothed average lags a steady loss by about half a kilo),
    // else the smoothed trend
    const now = sl !== null ? median(recent.map((w) => w.kg + sl * diffDays(last.date, w.date)))! : trend[trend.length - 1].kg;
    const stale = diffDays(today, last.date);
    // (where it started: as saved, else the trend the day it was set)
    const start = g.start ?? trend.filter((p) => p.date <= startDate).at(-1)?.kg ?? trend.find((p) => p.date >= startDate)?.kg;
    const dir = Math.sign(g.target - (start ?? now)) || -1;
    const safe = dir < 0 ? { min: r2(now * 0.005), max: r2(now * 0.01) } : { min: r2(now * 0.0025), max: r2(now * 0.005) };
    const st: GoalState = { ...base, start: start !== undefined ? r1(start) : undefined, now: r1(now), measured: { kg: last.kg, date: last.date }, safe };
    // reached: the trend is there, or the last three weigh-ins all are
    const last3 = ws.slice(-3);
    const there = (kg: number) => (dir < 0 ? kg <= g.target! + 0.05 : kg >= g.target! - 0.05);
    if (there(now) || (last3.length === 3 && last3.every((w) => there(w.kg)))) return { ...st, pace: 'reached' };
    if (stale > 10) return { ...st, pace: daysLeft !== undefined && daysLeft < 0 ? 'date passed' : 'too early', why: `no weigh-in for ${stale} days` };
    const left = g.target - now;
    if (daysLeft !== undefined && daysLeft > 0) st.need = r2((left / daysLeft) * 7);
    st.dateUnsafe = st.need !== undefined && Math.abs(st.need) > safe.max + 1e-9;
    st.safeEta = addDays(today, Math.ceil((Math.abs(left) / safe.max) * 7));
    if (daysLeft !== undefined && daysLeft < 0) { st.pace = 'date passed'; return st; }
    if (sl === null) return { ...st, pace: 'too early', why: `${recent.length} weigh-ins over ${span} days in the last 4 weeks (the pace needs 6 over 14+ days)` };
    st.rate = r2(sl * 7);
    st.rateBasis = `the scale's trend, ${recent.length} weigh-ins over the last ${span + 1} days`;
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
  if (nowTop.e >= targetE - 0.05) return { ...st, pace: 'reached' };
  if (daysLeft !== undefined && daysLeft < 0) return { ...st, pace: 'date passed' };
  const left = targetE - nowTop.e;
  if (daysLeft !== undefined && daysLeft > 0) st.need = r2((left / daysLeft) * 7);
  const six = tops.filter((x) => x.date >= addDays(today, -41));
  const span = six.length ? diffDays(six[six.length - 1].date, six[0].date) : 0;
  const sl = six.length >= 4 && span >= 14 ? slope(six.map((x) => ({ date: x.date, v: x.e })), 5) : null;
  if (sl === null) return { ...st, pace: 'too early', why: `${six.length} workouts with it over ${span} days in the last 6 weeks (the pace needs 4 over 14+ days)` };
  st.rate = r2(sl * 7);
  st.rateBasis = `its best set per workout, ${six.length} workouts over the last ${span + 1} days`;
  if (st.rate > 0.05) st.eta = addDays(today, Math.ceil((left / st.rate) * 7));
  st.pace = st.rate < -nowTop.e * 0.005 ? 'wrong way'
    : st.need !== undefined ? (st.rate < st.need * 0.75 ? 'behind' : st.rate > st.need * 1.3 ? 'ahead' : 'on pace')
    : st.rate <= 0.05 ? 'slow' : 'on pace';
  return st;
}

/** The calorie numbers for a weight goal, from TRUE MAINTENANCE (never under a safe floor). */
export function goalCalories(d: Data, st: GoalState, today: string): string | undefined {
  if (st.metric !== 'weight' || st.target === undefined || st.pace === 'reached') return undefined;
  const m = trueMaintenance(d, today);
  const now = st.now ?? st.start;
  if (!now) return undefined;
  const sex = d.settings.body?.sex;
  const dir = Math.sign(st.target - now);
  const per = (kgWk: number) => (kgWk * KCAL_PER_KG) / 7;
  const prot = dir < 0 ? `protein 1.8–2.2 g/kg = ${Math.round(now * 1.8)}–${Math.round(now * 2.2)} g (keeps muscle on a cut)` : `protein 1.6–2.0 g/kg = ${Math.round(now * 1.6)}–${Math.round(now * 2)} g`;
  const cur = d.settings.goals.kcal ? `; the current target is ${fmtK(d.settings.goals.kcal)} kcal${d.settings.goals.protein ? ` and ${d.settings.goals.protein} g protein` : ''}` : '; no calorie target set yet';
  if (!m) return `Calories for it: no TRUE MAINTENANCE yet (it needs 10 logged days and 4 weigh-ins over 2 weeks), so any number is an estimate: say so, and that it gets exact from their logs. ${prot}${cur}.`;
  const floor = Math.max(sex === 'female' ? 1400 : 1700, rk(m.kcal * 0.7));
  const at = (kgWk: number) => Math.max(floor, m.kcal + dir * per(kgWk));
  const parts: string[] = [];
  if (st.need !== undefined && !st.dateUnsafe) parts.push(`the date's ${r2(Math.abs(st.need))} kg/week = about ${fmtK(at(Math.abs(st.need)))} kcal a day`);
  if (st.need !== undefined && st.dateUnsafe) parts.push(`the date's ${r2(Math.abs(st.need))} kg/week would need about ${fmtK(m.kcal + dir * per(Math.abs(st.need)))} kcal a day: past the safe pace${m.kcal + dir * per(Math.abs(st.need)) < floor ? ' and under the safe floor' : ''}, don't offer it`);
  const mid = r2((st.safe!.min + st.safe!.max) / 2);
  parts.push(`a safe ${r2(st.safe!.min)}–${r2(st.safe!.max)} kg/week = about ${fmtK(at(st.safe!.max))}–${fmtK(at(st.safe!.min))} kcal (${mid} kg/week ≈ ${fmtK(at(mid))})`);
  return `Calories for it, from TRUE MAINTENANCE ${fmtK(m.kcal)} kcal (${m.confidence} confidence; 7,700 kcal a kg): ${parts.join('; ')}; never under ${fmtK(floor)} kcal. ${prot}${cur}.`;
}

const fmtPace = (x: number) => `${x > 0 ? '+' : ''}${r2(x)} kg/week`;
const STATUS: Record<Pace, string> = {
  reached: 'REACHED',
  'on pace': 'ON PACE',
  ahead: 'AHEAD of pace',
  behind: 'BEHIND pace',
  'too fast': 'TOO FAST (past the safe pace)',
  'wrong way': 'GOING THE WRONG WAY',
  slow: 'SLOW (under the useful pace)',
  'date passed': 'DATE PASSED, not reached',
  'too early': "CAN'T JUDGE THE PACE YET",
};

/** The GOALS block the Coach reads (empty when no goal was ever told). */
export function goalLines(d: Data, today: string, exName: (id: string) => string): string[] {
  const memory = d.memory ?? [];
  const goals = memory.filter((m) => m.kind === 'goal');
  if (!goals.length) return [];
  const num = (m: MemoryNote) => memory.indexOf(m) + 1;
  const run = activeGoals(d, today);
  const L: string[] = [`GOALS (told in chat; the app tracks them from the day they were set. Numbers below are worked out by the app: quote them, never redo the maths). ${run.length ? 'Running:' : 'None running.'}`];
  for (const m of run) {
    const g = m.goal;
    if (!g || !tracked(m)) {
      L.push(`- [memory ${num(m)}] "${m.text}"${g?.by ? `, by ${g.by} (${diffDays(g.by, today)} days left)` : ''}${g?.startDate ? `, set ${g.startDate}` : ''}: no number the app can track, so no pace; follow up from what DATA shows.`);
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
        parts.push(`Now ${st.now} kg on the trend (last measured ${r1(st.measured!.kg)} kg on ${st.measured!.date})${done !== undefined && total ? `: ${r1(Math.abs(done))} kg ${Math.sign(done) === Math.sign(total) || !done ? 'of' : 'the wrong way, of'} ${r1(Math.abs(total))} kg (${Math.max(0, Math.round((done / total) * 100))} %)` : ''}.`);
      }
    } else {
      parts.push(`${exName(m.exerciseIds![0])} ${r1(tg)} kg × ${g.reps ?? 1} (estimated max ${st.target} kg), ${by}; ${set}${st.start !== undefined ? `, estimated max then ${st.start} kg` : ''}.`);
      if (st.now !== undefined) parts.push(`Now: estimated max ${st.now} kg from their best recent set (an estimate from reps; only a real attempt proves it).${st.stalled ? ' It is in Stalled lifts.' : ''}`);
    }
    if (st.rate !== undefined) parts.push(`Pace: ${fmtPace(st.rate)} (${st.rateBasis}).`);
    if (st.need !== undefined) parts.push(`The date needs ${fmtPace(st.need)} from here${st.dateUnsafe ? `: FASTER THAN SAFE (safe is ${st.safe!.min}–${st.safe!.max} kg/week, ${st.metric === 'weight' && (st.target ?? 0) < (st.now ?? 0) ? '0.5–1 % of bodyweight' : '0.25–0.5 % of bodyweight'})` : ''}.`);
    else if (st.safe) parts.push(`Safe pace ${st.safe.min}–${st.safe.max} kg/week.`);
    if (st.eta && st.pace !== 'too fast') parts.push(`At this pace it lands around ${st.eta}.`);
    if (st.safeEta && (st.dateUnsafe || st.pace === 'too fast' || st.pace === 'date passed')) parts.push(`At the safe ${st.safe!.max} kg/week it lands around ${st.safeEta}.`);
    parts.push(`STATUS: ${STATUS[st.pace]}${st.why ? ` (${st.why})` : ''}.`);
    if (st.metric === 'weight' && st.daysIn < 14 && st.pace !== 'reached') parts.push('(Under 2 weeks in: day-to-day weigh-ins swing 1–2 kg with water, salt and food; judge the trend, not one morning.)');
    const cal = goalCalories(d, st, today);
    L.push(`- [memory ${num(m)}] "${m.text}": ${parts.join(' ')}${cal ? `\n  ${cal}` : ''}`);
  }
  const ended = goals.filter((m) => m.goal?.status && m.goal.endedOn && diffDays(today, m.goal.endedOn) <= 60);
  if (ended.length) L.push(`Ended goals (last 60 days): ${ended.map((m) => `"${m.text}" ${m.goal!.status === 'done' ? 'reached' : 'dropped'} on ${m.goal!.endedOn}`).join('; ')}.`);
  return L;
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
  if (!run.length && profile !== 'fatloss' && profile !== 'muscle') return [];
  const startDate = run.map((m) => m.goal.startDate).sort()[0];
  const sinceGoal = !!startDate && diffDays(today, startDate) >= 10;
  const nowFrom = sinceGoal ? addDays(today, -13) < startDate ? startDate : addDays(today, -13) : addDays(today, -13);
  const beforeFrom = sinceGoal ? addDays(startDate, -28) : addDays(today, -41), beforeTo = sinceGoal ? addDays(startDate, -1) : addDays(today, -14);
  const losing = run.filter((m) => m.goal.metric === 'weight').map((m) => goalState(d, m, today)!).filter((st) => (st.start ?? st.now) !== undefined);
  const cutting = losing.length ? losing.some((st) => st.target! < (st.start ?? st.now)!) : profile === 'fatloss';
  const L: string[] = [];
  const head = sinceGoal ? `since the goal started on ${startDate}` : 'the last 2 weeks';

  // strength on the main lifts: the most trained weight × reps lifts of the last 8 weeks
  const exs = new Map(d.exercises.map((e) => [e.id, e]));
  const count = new Map<string, number>();
  for (const s of d.sessions) if (s.status === 'done' && s.date >= addDays(today, -55)) for (const e of s.exercises) if ((exs.get(e.exerciseId)?.logType ?? 'weightReps') === 'weightReps' && e.sets.some((q) => q.done && q.type === 'working' && q.weightKg)) count.set(e.exerciseId, (count.get(e.exerciseId) ?? 0) + 1);
  const main = [...count].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
  const rows: { id: string; a: number; b: number; pct: number }[] = [];
  for (const id of main) {
    const a = best(liftTops(d, id, beforeFrom, beforeTo)), b = best(liftTops(d, id, nowFrom, today));
    if (a && b) rows.push({ id, a: a.e, b: b.e, pct: ((b.e - a.e) / a.e) * 100 });
  }
  if (rows.length) {
    const down = rows.filter((x) => x.pct <= -3);
    L.push(`Strength (best estimated max, ${sinceGoal ? `${nowFrom}…today vs the 4 weeks before the goal` : 'last 2 weeks vs the 4 weeks before'}): ${rows.map((x) => `${exName(x.id)} ${r1(x.a)} → ${r1(x.b)} kg (${x.pct >= 0 ? '+' : ''}${Math.round(x.pct)} %)`).join(', ')}. ${down.length} of ${rows.length} down 3 % or more.`);
    if (cutting && down.length >= 2 && down.length * 2 >= rows.length) L.push(`SIGN TO RAISE: strength is falling on most main lifts during a cut. That is the early warning for losing muscle (or for not recovering: sleep, protein, a too-big deficit). The data can't tell which: say it as a sign with these numbers, check protein, sleep and the pace above, and offer one fix (a smaller deficit, more protein, more sleep), never lighter training.`);
    else if (down.length === 1) L.push(`One lift down alone is usually a bad day or fatigue, not muscle loss: mention it only if asked or if it keeps falling.`);
  } else L.push(`Strength: not enough recent sessions of the same lifts to compare (needs a session of each in both windows).`);

  // protein and calories since the goal started (or the last 2 weeks)
  const from = sinceGoal ? startDate : addDays(today, -13);
  const days = nutritionByDay(d.entries, from, addDays(today, -1)).filter((x) => x.logged && !x.partial && x.kcal >= 800);
  const g = d.settings.goals;
  if (days.length) {
    const p = avg(days.map((x) => x.protein))!; const k = avg(days.map((x) => x.kcal))!;
    const hit = g.protein ? days.filter((x) => Math.round(x.protein) >= g.protein!).length : undefined;
    L.push(`Food ${head} (${days.length} logged days, today not counted): average ${fmtK(k)} kcal${g.kcal ? ` against the ${fmtK(g.kcal)} target` : ''}; protein average ${Math.round(p)} g${hit !== undefined ? `, at or above the ${g.protein} g target on ${hit} of ${days.length} days` : ''}.`);
  }

  // sleep and recovery: the last 7 days against their usual (the median of the 30 days before them)
  const hs = (d.health ?? []).filter((h) => diffDays(today, h.date) >= 0);
  const wk = hs.filter((h) => diffDays(today, h.date) < 7), usual = hs.filter((h) => diffDays(today, h.date) >= 7 && diffDays(today, h.date) < 37);
  const pair = (k: 'sleepMin' | 'hrv' | 'restHr') => { const a = avg(wk.map((h) => h[k]).filter((x): x is number => x !== undefined)); const u = usual.filter((h) => h[k] !== undefined).length >= 5 ? median(usual.map((h) => h[k]).filter((x): x is number => x !== undefined)) : undefined; return a !== undefined && u !== undefined ? { a, u } : undefined; };
  const sl = pair('sleepMin'), hv = pair('hrv'), rh = pair('restHr');
  const rec: string[] = []; const off: string[] = [];
  if (sl) { rec.push(`sleep ${hm(sl.a)} a night vs usual ${hm(sl.u)}`); if (sl.a <= sl.u - 30) off.push(`sleep ${Math.round(sl.u - sl.a)} min under usual`); }
  if (hv) { rec.push(`HRV ${Math.round(hv.a)} vs usual ${Math.round(hv.u)} ms`); if (hv.a <= hv.u * 0.9) off.push(`HRV ${Math.round((1 - hv.a / hv.u) * 100)} % under usual`); }
  if (rh) { rec.push(`resting HR ${Math.round(rh.a)} vs usual ${Math.round(rh.u)}`); if (rh.a >= rh.u + 3) off.push(`resting HR ${Math.round(rh.a - rh.u)} over usual`); }
  if (rec.length) L.push(`Recovery, last 7 days (averages) vs their usual: ${rec.join(', ')}.${off.length ? ` Off: ${off.join(', ')}${cutting ? ': on a cut, worth naming next to the pace and strength' : ''}.` : ' Nothing clearly off.'}`);

  // training: workouts and skipped sets, stalled lifts
  const gym = d.sessions.filter((s) => s.status === 'done' && s.date >= from && s.date <= today).length;
  const sk = skippedSets(d, today, 14);
  const stalls = stalledLifts(d.sessions, today).map((s) => exName(s.exerciseId));
  L.push(`Training ${head}: ${gym} gym workouts; planned working sets skipped in the last 14 days: ${sk.workouts ? `${sk.skipped} of ${sk.planned}` : 'no planned workouts to judge'}${stalls.length ? `; stalled: ${stalls.join(', ')}` : ''}.`);
  return [`GOAL WATCH (what a coach keeps an eye on while ${run.length ? 'a goal runs' : `their profile goal (${profile}) runs`}; bring up what is off without being asked, early, with the numbers; never by telling them to train lighter or do fewer sets):`, ...L.map((x) => `- ${x}`)];
}

/** One short line for a goal's progress (Coach memory, Today's note): "81.9 → 80.4 kg · behind". */
export function goalShort(st: GoalState, t: (k: string, v?: Record<string, string | number>) => string, kg: (x: number) => string): string {
  const word: Record<Pace, string> = { reached: t('reached'), 'on pace': t('on pace'), ahead: t('ahead of pace'), behind: t('behind pace'), 'too fast': t('faster than safe'), 'wrong way': t('going the wrong way'), slow: t('slow'), 'date passed': t('date passed'), 'too early': t('too early to tell') };
  if (st.metric === 'other' || st.target === undefined) return '';
  const nums = st.now !== undefined ? `${kg(st.now)} → ${kg(st.target)}` : `→ ${kg(st.target)}`;
  return `${nums} · ${word[st.pace]}`;
}
