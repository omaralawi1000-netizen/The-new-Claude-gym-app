/**
 * The weekly review, part two (part one is `weekReview` in stats.ts: sessions, protein, weight, records, stalls).
 * Everything here is computed on the phone from the data; the Coach only writes a short verdict and chooses, from these
 * candidates, at most two priorities (it never invents a number). Each priority can be checked a week later from the data,
 * so the next review says whether last week's focus happened, and the Coach judges its own advice by that.
 */
import type { AppData, MuscleGroup, WeekReviewNote } from './types';
import { addDays } from './dates';
import { MUSCLES, setsPerMuscle, skippedSets, weekReview, weekStreak, weeklyTraining, type WeekReview } from './stats';
import { plannedFor } from '../state/store';
import { overDays } from './eating';

export interface MuscleWeek { m: MuscleGroup; sets: number; /** a week, on average, over the 4 weeks before */ avg: number }
export interface ReviewNumbers extends WeekReview {
  /** planned workouts in the week (days with a routine planned), and how many of them passed without one */
  planned: number;
  missed: number;
  /** finished working sets */
  sets: number;
  /** muscles trained this week or usually, most sets first */
  muscles: MuscleWeek[];
  /** weeks in a row with at least 2 workouts */
  streak: number;
  /** weight change per week as % of body weight (negative = losing), when known */
  weightPct: number | null;
  /** planned working sets left undone, and of how many (the same count the Coach sees) */
  skipped: number;
  plannedSets: number;
  /** days over the calorie target (a little or heavy; 0 when heavy-day notices are off) */
  overDays: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function reviewNumbers(d: AppData, to: string, musclesOf: (exerciseId: string) => MuscleGroup[] | undefined): ReviewNumbers {
  const base = weekReview(d, to);
  const from = base.from;
  const done = d.sessions.filter((s) => s.status === 'done' && s.date >= from && s.date <= to);
  let planned = 0, missed = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDays(from, i);
    const p = plannedFor(d, day, addDays(to, 1));
    if (!p) continue;
    planned++;
    if (!d.sessions.some((s) => s.date === day && s.status === 'done')) missed++;
  }
  const now = setsPerMuscle(d.sessions, musclesOf, from, to);
  const before = setsPerMuscle(d.sessions, musclesOf, addDays(from, -28), addDays(from, -1));
  const muscles = MUSCLES.map((m) => ({ m, sets: r1(now[m]), avg: r1(before[m] / 4) })).filter((x) => x.sets > 0 || x.avg >= 1).sort((a, b) => b.sets - a.sets || b.avg - a.avg);
  const weeks = weeklyTraining(d.sessions.filter((s) => s.status === 'done'), to, 12, d.settings.weekStart);
  const sk = skippedSets(d, to);
  const lastKg = [...d.weights].filter((w) => w.date <= to).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.kg;
  return {
    ...base, planned, missed,
    sets: done.reduce((n, s) => n + s.exercises.reduce((k, e) => k + e.sets.filter((x) => x.done && x.type === 'working').length, 0), 0),
    muscles, streak: weekStreak(weeks, 2),
    weightPct: base.weightRate !== null && lastKg ? r1((base.weightRate / lastKg) * 100) : null,
    skipped: sk.skipped, plannedSets: sk.planned, overDays: overDays(d, to).length,
  };
}

/** A priority the app can stand behind: the words are a template filled with the app's numbers. */
export interface Candidate {
  id: string;
  /** English template (translated where shown) and its numbers */
  key: string;
  vars: Record<string, string | number>;
  /** what to ask the Coach to act on it */
  ask?: string;
  /** how much it matters (higher first) */
  score: number;
}

/** The candidates, most important first (at most 4). `name` gives an exercise's name, `muscle` a muscle's. */
export function candidates(d: AppData, n: ReviewNumbers, name: (id: string) => string, muscle: (m: MuscleGroup) => string): Candidate[] {
  const out: Candidate[] = [];
  const goal = d.settings.goals.protein;
  if (n.planned >= 2 && n.missed >= 1) out.push({ id: 'missed', key: '{done} of {planned} planned workouts done', vars: { done: n.planned - n.missed, planned: n.planned }, ask: 'My plan did not fit my week. Help me set a week I can keep.', score: 60 + n.missed * 10 });
  if (n.weightPct !== null && n.weightPct <= -1) out.push({ id: 'weight', key: 'Weight is dropping {pct}% a week, faster than is healthy', vars: { pct: Math.abs(n.weightPct) }, ask: 'My weight is dropping fast. What should I change in what I eat?', score: 85 });
  // (the same skipped sets and days over the Coach and Today's notes see, for this week)
  if (n.skipped >= 3) out.push({ id: 'skipped', key: '{skipped} of {planned} planned sets skipped', vars: { skipped: n.skipped, planned: n.plannedSets }, ask: 'I skipped planned sets this week. Help me get them all done next week.', score: 55 + Math.min(20, n.skipped * 2) });
  if (d.settings.goals.kcal && n.overDays >= 3) out.push({ id: 'over', key: '{n} of 7 days over the calorie target', vars: { n: n.overDays }, ask: 'I went over my calories on several days this week. Help me stay closer to my target.', score: 50 + n.overDays * 4 });
  for (const s of n.stalls.slice(0, 1)) out.push({ id: `stall:${s.exerciseId}`, key: '{exercise} has not moved since {date}', vars: { exercise: name(s.exerciseId), date: s.since }, ask: `My ${name(s.exerciseId)} has stalled. What should I change?`, score: 70 });
  if (goal && n.loggedDays >= 3 && n.proteinAvg !== null && n.proteinAvg < goal * 0.9) out.push({ id: 'protein', key: 'Protein: {avg} g a day, target {goal} g', vars: { avg: Math.round(n.proteinAvg), goal }, ask: 'Give me three easy ways to get more protein: from what I usually eat, or simple new ideas.', score: 55 + Math.round((1 - n.proteinAvg / goal) * 40) });
  const dropped = n.muscles.filter((x) => x.avg >= 3 && x.sets < x.avg * 0.5).sort((a, b) => (b.avg - b.sets) - (a.avg - a.sets))[0];
  if (dropped) out.push({ id: `muscle:${dropped.m}`, key: '{muscle}: {sets} sets, usually {avg}', vars: { muscle: muscle(dropped.m), sets: dropped.sets, avg: dropped.avg }, ask: `Put about ${Math.round(dropped.avg)} sets of ${dropped.m} back into next week.`, score: 50 });
  if (d.settings.goals.kcal && n.loggedDays > 0 && n.loggedDays <= 3) out.push({ id: 'log', key: 'Food logged on {n} of 7 days', vars: { n: n.loggedDays }, ask: 'Make logging food quicker for me: what can I save as meals?', score: 40 });
  if (!out.length && n.sessions > 0) out.push({ id: 'keep', key: 'Keep this rhythm: {n} workouts', vars: { n: n.sessions }, score: 10 });
  return out.sort((a, b) => b.score - a.score).slice(0, 4);
}

/** Did last week's priority happen? true / false, or null when the data can't tell. */
export function met(id: string, n: ReviewNumbers, goalProtein: number | undefined): boolean | null {
  if (id === 'missed') return n.planned ? n.missed === 0 : null;
  if (id === 'weight') return n.weightPct === null ? null : n.weightPct > -1;
  if (id === 'protein') return n.proteinAvg === null || !goalProtein ? null : n.proteinAvg >= goalProtein * 0.9;
  if (id === 'log') return n.loggedDays >= 5;
  if (id === 'skipped') return n.skipped < 3;
  if (id === 'over') return n.overDays < 3;
  if (id.startsWith('stall:')) { const x = id.slice(6); return !n.stalls.some((s) => s.exerciseId === x); }
  if (id.startsWith('muscle:')) { const m = n.muscles.find((x) => x.m === id.slice(7)); return m ? m.sets >= m.avg * 0.8 && m.sets > 0 : false; }
  return null;
}

/** A plain verdict when no AI is set up (or it didn't answer): the week in one or two lines, from the numbers. */
export function localVerdict(n: ReviewNumbers, t: (k: string, v?: Record<string, string | number>) => string): string {
  const a = n.sessions === 1 ? t('1 workout') : t('{n} workouts', { n: n.sessions });
  const w = n.wrestling ? ` ${t('and {n} wrestling', { n: n.wrestling })}` : '';
  const r = n.records ? ` ${n.records === 1 ? t('One new record.') : t('{n} new records.', { n: n.records })}` : '';
  const s = n.streak >= 2 ? ` ${t('{n} weeks in a row.', { n: n.streak })}` : '';
  return `${a}${w}.${r}${s}`.trim();
}

/** The last reviews for the Coach: what it set as priorities, and whether they happened (computed now from the data). */
export function reviewsBlock(d: AppData, musclesOf: (id: string) => MuscleGroup[] | undefined): string {
  const list = (d.reviews ?? []).slice(-2);
  if (!list.length) return '';
  const lines = list.map((r) => {
    const after = addDays(r.week, 7);
    const next = reviewNumbers(d, after, musclesOf);
    const said = r.priorities.map((p) => { const ok = after <= todayKeyOf(d) ? met(p.id, next, d.settings.goals.protein) : null; return `${p.text}${ok === null ? '' : ok ? ' (done the week after)' : ' (not done the week after)'}`; });
    return `week ending ${r.week}: ${r.verdict ? `"${r.verdict}" ` : ''}priorities: ${said.join('; ') || 'none'}`;
  });
  return `YOUR LAST WEEKLY REVIEWS (judge your own advice by what happened):\n${lines.join('\n')}`;
}
const todayKeyOf = (d: AppData) => { const x = new Date(Date.now() - d.settings.dayStartHour * 3_600_000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

/** A stored review, kept (the newest 26) so later reviews and the Coach can look back. */
export function storedReview(week: string, verdict: string | null, picks: { id: string; text: string }[]): WeekReviewNote {
  return { week, at: Date.now(), ...(verdict ? { verdict } : {}), priorities: picks.slice(0, 2) };
}
