/**
 * Heavy days, and catching up after them (Omar, 19 Oct). He overeats mostly in the evening and often logs it the morning
 * after, into yesterday. Aven notices both ways:
 *  - live: the same evening (after 20:00) the day goes clearly over its target;
 *  - late: today, a big log lands on yesterday (or a day before) and that day ends clearly over.
 * "Clearly over" = at least 600 kcal and 25 % over the target, so forgetting dinner and logging it the next morning is not
 * a heavy day. Then the overage is paid back over the next 2–4 days (never one brutal day: that is what sets up the next
 * evening), each day's target lowered by the same amount, never under a floor (80 % of true maintenance or of the target,
 * and never under 1,800 kcal). Protein targets stay. Said straight, once; Undo takes it back.
 */
import type { AppData, CatchUp } from './types';
import { addDays, dayKey, diffDays } from './dates';
import { suggestedTarget, trueMaintenance } from './maintenance';
import { uid } from './nutrition';

type Data = Pick<AppData, 'entries' | 'settings' | 'weights' | 'health' | 'catchUps'>;

/** How far over its target a day has to go to count as heavy. */
export const heavyLine = (target: number) => Math.max(600, Math.round(target * 0.25));

export function dayKcal(d: Pick<AppData, 'entries'>, date: string): number {
  return d.entries.reduce((n, e) => n + (e.date === date ? e.nutrients.kcal ?? 0 : 0), 0);
}

/** kcal logged for a day after that day was over (the "morning after" log). */
export function lateKcal(d: Pick<AppData, 'entries' | 'settings'>, date: string): number {
  return d.entries.reduce((n, e) => n + (e.date === date && dayKey(e.at, d.settings.dayStartHour) > date ? e.nutrients.kcal ?? 0 : 0), 0);
}

/** The safe floor for a lowered target. */
export function catchUpFloor(d: Data, today: string): number {
  const base = d.settings.goals.kcal ?? 0;
  const m = trueMaintenance(d, today);
  const ref = m && m.confidence !== 'low' ? m.kcal : base;
  return Math.min(base, Math.max(1800, Math.round(ref * 0.8 / 10) * 10));
}

/** How to pay an overage back: 2–4 days (up to 6 when the floor is close), the same amount each day. */
export function planCatchUp(over: number, target: number, floor: number): { n: number; perDay: number } | null {
  const room = target - floor;
  if (room < 50) return null;
  let n = over <= 900 ? 2 : over <= 1500 ? 3 : 4;
  let perDay = Math.round(over / n / 10) * 10;
  while (perDay > room && n < 6) { n++; perDay = Math.round(over / n / 10) * 10; }
  return { n, perDay: Math.min(perDay, Math.floor(room / 10) * 10) };
}

/** The calorie target for a day, with any catch-up running on it (undefined = no target set). */
export function kcalTargetFor(d: Pick<AppData, 'settings' | 'catchUps'>, date: string): number | undefined {
  const base = d.settings.goals.kcal;
  if (!base) return undefined;
  const on = (d.catchUps ?? []).filter((c) => !c.off && c.days.includes(date));
  if (!on.length) return base;
  const cut = on.reduce((n, c) => n + c.perDay, 0);
  return Math.max(Math.min(...on.map((c) => c.floor)), base - cut);
}

/** The catch-up running on a day, for the line under the ring ("−500 catch-up · 3 days left"). */
export function catchUpOn(d: Pick<AppData, 'catchUps'>, date: string): { perDay: number; left: number; from: CatchUp } | null {
  const c = [...(d.catchUps ?? [])].reverse().find((x) => !x.off && x.days.includes(date));
  return c ? { perDay: c.perDay, left: c.days.filter((x) => x >= date).length, from: c } : null;
}

/** The heavy days to catch up now: today after 20:00 (live), and the last 3 days when they end clearly over. */
export function heavyNow(d: Data, now = Date.now()): { date: string; over: number; trigger: 'live' | 'late' }[] {
  const target = d.settings.goals.kcal;
  if (!target) return [];
  const today = dayKey(now, d.settings.dayStartHour);
  const out: { date: string; over: number; trigger: 'live' | 'late' }[] = [];
  const line = heavyLine(target);
  for (let i = 3; i >= 0; i--) {
    const date = addDays(today, -i);
    const over = Math.round(dayKcal(d, date) - target);
    if (over < line) continue;
    if (i === 0 && new Date(now).getHours() < 20) continue; // (today only once it is evening)
    out.push({ date, over, trigger: i > 0 && lateKcal(d, date) >= 600 ? 'late' : 'live' });
  }
  return out;
}

/**
 * The catch-ups after a change in the food log: a new heavy day gets one (starting the day after it, or today when it was
 * logged late); a day that grew heavier gets its amount raised; a day caught up and then taken back is left alone. Returns
 * null when nothing changes.
 */
export function reconcileCatchUps(d: Data, now = Date.now()): { list: CatchUp[]; fresh: CatchUp[] } | null {
  const target = d.settings.goals.kcal;
  if (!target) return null;
  const today = dayKey(now, d.settings.dayStartHour);
  const list = [...(d.catchUps ?? [])];
  const fresh: CatchUp[] = [];
  let changed = false;
  for (const h of heavyNow(d, now)) {
    const i = list.findIndex((c) => c.date === h.date);
    const prev = i >= 0 ? list[i] : undefined;
    if (prev?.off) continue;
    if (prev && h.over - prev.over < 200) continue; // (already caught up; a little more is not worth a new plan)
    const floor = catchUpFloor(d, today);
    const plan = planCatchUp(h.over, target, floor);
    if (!plan) continue;
    const start = prev?.days[0] ?? (addDays(h.date, 1) > today ? addDays(h.date, 1) : today);
    const days = Array.from({ length: plan.n }, (_, k) => addDays(start, k));
    const next: CatchUp = { id: prev?.id ?? uid('cu'), date: h.date, over: h.over, days, perDay: plan.perDay, floor, trigger: prev?.trigger ?? h.trigger, at: now, ...(prev ? { told: prev.told, coachTold: false } : {}) };
    if (prev) list[i] = next; else list.push(next);
    fresh.push(next);
    changed = true;
  }
  return changed ? { list: list.slice(-30), fresh } : null;
}

/** The heavy days in the last weeks (for the Coach and the weekly review): how much over, and whether logged late. */
export function heavyDays(d: Data, today: string, days = 28): { date: string; over: number; late: boolean; evening: number }[] {
  const target = d.settings.goals.kcal;
  if (!target) return [];
  const out: { date: string; over: number; late: boolean; evening: number }[] = [];
  for (let i = days; i >= 1; i--) {
    const date = addDays(today, -i);
    const over = Math.round(dayKcal(d, date) - target);
    if (over < heavyLine(target)) continue;
    // what was eaten (or logged) from 20:00 on, that day or late
    const evening = d.entries.reduce((n, e) => n + (e.date === date && (dayKey(e.at, d.settings.dayStartHour) > date || new Date(e.at).getHours() >= 20) ? e.nutrients.kcal ?? 0 : 0), 0);
    out.push({ date, over, late: lateKcal(d, date) >= 600, evening: Math.round(evening) });
  }
  return out;
}

/** The catch-up just set, in one straight line ("Yesterday: +2,000 over. Next 4 days: −500 a day."). */
export function catchUpWords(c: CatchUp, today: string, t: (k: string, v?: Record<string, string | number>) => string, fmt: (n: number) => string): string {
  const when = c.date === today ? t('Today') : c.date === addDays(today, -1) ? t('Yesterday') : c.date;
  return t('{when}: +{over} kcal over. Next {n} days: −{per} kcal a day.', { when, over: fmt(c.over), n: c.days.filter((x) => diffDays(x, today) >= 0).length, per: fmt(c.perDay) });
}

/** The Coach's EATING PATTERNS lines (DATA): true maintenance, invisible calories, heavy days, the catch-up running, and
 *  one just noticed that it hasn't said yet. */
export function eatingLines(d: Data, today: string, goal?: string): string[] {
  const L: string[] = [];
  const m = trueMaintenance(d, today);
  if (m) {
    L.push(`True maintenance: about ${m.kcal} kcal a day (${m.confidence} confidence${m.confidence === 'low' ? ', an ESTIMATE' : ''}: ${m.loggedDays} logged days and ${m.weighIns} weigh-ins in 4 weeks; logged average ${m.avgIntake} kcal, weight ${m.kgPerWeek >= 0 ? '+' : ''}${m.kgPerWeek} kg a week). It is relative to what they log, so targets built on it work. Suggested target for their goal: ${suggestedTarget(m, goal)} kcal (offer it with set_setting kcalGoal; never change it unasked).`);
    if (m.invisible) L.push(`Invisible calories: the watch says they burn about ${m.watchBurn} kcal a day, ${m.invisible} more than their logs and the scale add up to, so roughly ${m.invisible} kcal a day are probably not logged (most likely evenings; watch burn estimates are rough).`);
  } else L.push('True maintenance: not enough yet (needs about 10 logged days and 4 weigh-ins two weeks apart in the last 4 weeks).');
  const heavy = heavyDays(d, today);
  if (heavy.length) L.push(`Heavy days, last 4 weeks (clearly over target): ${heavy.map((h) => `${WD[new Date(`${h.date}T12:00:00`).getDay()]} ${h.date} +${h.over} kcal${h.late ? ', logged the day after' : ''}${h.evening ? `, ${h.evening} kcal of it in the evening` : ''}`).join('; ')}. ${heavy.length} in 4 weeks.`);
  const on = catchUpOn(d, today);
  if (on) L.push(`CATCH-UP running: ${on.from.date} was +${on.from.over} over, so the target is ${on.perDay} lower for ${on.left} more day${on.left === 1 ? '' : 's'} including today (today's target ${kcalTargetFor(d, today)} kcal instead of ${d.settings.goals.kcal}; protein unchanged). "Don't cut my calories" → catch_up with on false.`);
  const fresh = (d.catchUps ?? []).filter((c) => !c.off && !c.coachTold && c.days.some((x) => x >= today));
  for (const c of fresh) L.push(`JUST NOTICED (say it once in your first reply, straight and calm, with the numbers, then the plan; no lecture, no guilt): ${c.date === today ? 'today' : c.date} was +${c.over} kcal over its target${c.trigger === 'late' ? ' (logged the day after)' : ' (this evening)'}; catch-up set: −${c.perDay} kcal a day for ${c.days.length} days, protein unchanged.`);
  return L.length ? ['EATING PATTERNS:', ...L] : [];
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The Coach has said what it just noticed (its first reply after it): not said again. */
export function markCoachTold(d: Pick<AppData, 'catchUps'>, set: (next: CatchUp[]) => void) {
  const list = d.catchUps ?? [];
  if (list.some((c) => !c.coachTold && !c.off)) set(list.map((c) => (c.off ? c : { ...c, coachTold: true })));
}
