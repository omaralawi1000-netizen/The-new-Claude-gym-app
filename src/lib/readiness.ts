/**
 * How ready you are to train today: fresh, normal or tired. Worked out on the phone from what is already logged, never
 * guessed by an AI: the last check-in (energy, soreness, sleep), wrestling logged yesterday or earlier today, this week's
 * sets against your usual week, and the same weights starting to feel harder (RPE, when you log it). Each reason is kept, so
 * the app can always say why. It is an estimate: it only ever suggests (one set less, a lighter day), it never changes a
 * plan by itself.
 */
import type { AppData, WorkoutSession } from './types';
import { addDays, diffDays } from './dates';

export type ReadyLevel = 'fresh' | 'normal' | 'tired';
/** A reason in plain English (translated where shown), with its numbers. */
export interface ReadyReason { key: string; vars?: Record<string, string | number>; weight: number }
export interface Readiness { level: ReadyLevel; score: number; reasons: ReadyReason[] }

const working = (s: WorkoutSession) => s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done && x.type === 'working').length, 0);

/** The check-in that still says something about today: from a workout in the last two days. */
export function recentCheckin(d: Pick<AppData, 'sessions'>, today: string) {
  const s = d.sessions.filter((x) => x.status === 'done' && x.checkin && x.date >= addDays(today, -2) && x.date <= today)
    .sort((a, b) => (b.checkin!.at) - (a.checkin!.at))[0];
  return s?.checkin;
}

/**
 * The same weights feeling harder: on lifts logged with RPE in the last two weeks, the newest session's top set has an RPE
 * at least 1 higher than the session before at the same or a heavier weight. Counts the lifts where that happened.
 */
export function rpeCreep(sessions: WorkoutSession[], today: string): { up: number; checked: number } {
  const from = addDays(today, -14);
  const byEx = new Map<string, { date: string; kg: number; rpe: number }[]>();
  for (const s of sessions) {
    if (s.status !== 'done' || s.date > today) continue;
    for (const e of s.exercises) {
      const rated = e.sets.filter((x) => x.done && x.type === 'working' && x.rpe && x.weightKg);
      if (!rated.length) continue;
      const top = rated.reduce((a, b) => ((b.weightKg ?? 0) > (a.weightKg ?? 0) ? b : a));
      (byEx.get(e.exerciseId) ?? byEx.set(e.exerciseId, []).get(e.exerciseId)!).push({ date: s.date, kg: top.weightKg!, rpe: top.rpe! });
    }
  }
  let up = 0, checked = 0;
  for (const list of byEx.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const last = list[list.length - 1], prev = list[list.length - 2];
    if (!prev || last.date < from) continue;
    checked++;
    if (last.kg <= prev.kg && last.rpe - prev.rpe >= 1) up++;
  }
  return { up, checked };
}

export function readiness(d: Pick<AppData, 'sessions' | 'activities'>, today: string): Readiness {
  const reasons: ReadyReason[] = [];
  const add = (key: string, weight: number, vars?: ReadyReason['vars']) => reasons.push({ key, weight, ...(vars ? { vars } : {}) });

  // the last check-in (a day or two old at most)
  const c = recentCheckin(d, today);
  if (c) {
    if (c.sleep === 1) add('Poor sleep', 1);
    if (c.energy === 1) add('Low energy last time', 1);
    if (c.soreness === 3) add('Very sore', 1);
    if (c.energy === 3 && c.sleep !== 1 && c.soreness !== 3) add('Felt great last time', -1);
  }
  // wrestling yesterday or earlier today: a hard one counts double
  const mat = d.activities.filter((a) => a.kind === 'wrestling' && (a.date === today || a.date === addDays(today, -1)));
  if (mat.length) {
    const hard = mat.some((a) => a.intensity === 3 || (a.rounds ?? 0) >= 6);
    const when = mat.some((a) => a.date === today) ? 'today' : 'yesterday';
    add(hard ? (when === 'today' ? 'Hard wrestling today' : 'Hard wrestling yesterday') : (when === 'today' ? 'Wrestling today' : 'Wrestling yesterday'), hard ? 2 : mat.some((a) => a.intensity === 2) ? 1 : 0.5);
  }
  // a much bigger week than usual
  const done = d.sessions.filter((s) => s.status === 'done' && s.date <= today);
  const week = done.filter((s) => s.date > addDays(today, -7)).reduce((n, s) => n + working(s), 0);
  const before = done.filter((s) => s.date > addDays(today, -35) && s.date <= addDays(today, -7));
  const avg = before.reduce((n, s) => n + working(s), 0) / 4;
  if (before.length >= 4 && avg >= 10 && week > avg * 1.3) add('A big week: {n} sets, usually {avg}', 1, { n: week, avg: Math.round(avg) });
  // the same weights feeling harder
  const r = rpeCreep(done, today);
  if (r.up >= 2 || (r.up >= 1 && r.checked <= 2)) add('The same weights feel harder (RPE up)', 1);
  // a few days off
  const last = done.map((s) => s.date).sort().at(-1);
  const gap = last ? diffDays(today, last) : 0;
  if (gap >= 3 && !mat.length) add('{n} days since your last workout', -1, { n: gap });

  const score = reasons.reduce((n, x) => n + x.weight, 0);
  const level: ReadyLevel = score >= 2 ? 'tired' : score <= -1 ? 'fresh' : 'normal';
  return { level, score, reasons: reasons.filter((x) => (level === 'tired' ? x.weight > 0 : level === 'fresh' ? x.weight < 0 : true)) };
}

/** One line for the Coach's DATA ('' when there is nothing to say). */
export function readinessLine(d: Pick<AppData, 'sessions' | 'activities'>, today: string): string {
  const r = readiness(d, today);
  if (!r.reasons.length) return '';
  const why = r.reasons.map((x) => x.key.replace(/\{(\w+)\}/g, (_, k) => String(x.vars?.[k] ?? ''))).join('; ');
  return `READINESS (the app's estimate from check-ins, wrestling, volume and RPE): ${r.level} — ${why}. When tired: suggest less (a set fewer, lighter, or rest); never more.`;
}

/** Tired check-ins in a week (from..to): energy low, sleep poor or very sore. */
export function tiredCheckins(d: Pick<AppData, 'sessions'>, from: string, to: string): { tired: number; total: number } {
  const list = d.sessions.filter((s) => s.status === 'done' && s.checkin && s.date >= from && s.date <= to).map((s) => s.checkin!);
  return { tired: list.filter((c) => c.energy === 1 || c.sleep === 1 || c.soreness === 3).length, total: list.length };
}
