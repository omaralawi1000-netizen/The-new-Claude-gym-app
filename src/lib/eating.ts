/**
 * Heavy days, and catching up after them (Omar, 19 Oct). He overeats mostly in the evening and often logs it the morning
 * after, into yesterday. Aven notices both ways:
 *  - live: the same evening the day goes clearly over the target it had;
 *  - late: today, a big log lands on yesterday (or a day before) and that day ends clearly over.
 * "Clearly over" = at least 600 kcal and 25 % over that day's target (target changes are remembered, `targetOn`), so
 * forgetting dinner and logging it the next morning is not a heavy day. What to do about it is decided once per day by the
 * main brain (lib/verdict.ts, lib/eatingWatch.ts), within limits that always hold here: at most 250 kcal off a day for all
 * catch-ups together, never under the floor, never above their own target, protein untouched, Undo. Notices can be On,
 * Quiet or Off (Settings → Targets).
 */
import type { AppData, CatchUp, Settings, TargetChange } from './types';
import { addDays, dayKey, diffDays } from './dates';
import { suggestedTarget, trueMaintenance } from './maintenance';
import { uid } from './nutrition';

type Data = Pick<AppData, 'entries' | 'settings' | 'weights' | 'health' | 'catchUps' | 'targets'>;

/**
 * A change of the calorie target, recorded (store `updateSettings` / `patch`) so past days are judged against the target
 * they had: lowering it from 3,200 to 2,200 must not turn last week's normal days into heavy ones. One record a day keeps
 * that day's first `prev`; going back to it the same day (typing, Undo) leaves no trace.
 */
export function noteTarget(list: TargetChange[] | undefined, prev: number | undefined, next: number | undefined, today: string): TargetChange[] {
  const xs = (list ?? []).filter((x) => x.from !== today);
  const same = (list ?? []).find((x) => x.from === today);
  const first = same ? same.prev : prev;
  if (first === next) return same ? xs : list ?? [];
  return [...xs, { from: today, ...(next !== undefined ? { kcal: next } : {}), ...(first !== undefined ? { prev: first } : {}) }].sort((a, b) => a.from.localeCompare(b.from)).slice(-60);
}

/**
 * The calorie target a day had (undefined = none, so it is not judged). No records: today's. After the last change: today's
 * (also safe after a restore or import). Before a change: what it was changed from. The day it changed: the higher of the
 * two, so a change never makes that day look heavy.
 */
export function targetOn(d: Pick<AppData, 'settings' | 'targets'>, date: string): number | undefined {
  const cur = d.settings.goals.kcal;
  const xs = d.targets ?? [];
  if (!xs.length || date > xs[xs.length - 1].from) return cur;
  const on = xs.find((x) => x.from === date);
  if (on) return on.prev === undefined ? undefined : Math.max(on.prev, on.kcal ?? 0);
  return xs.find((x) => x.from > date)!.prev;
}

/** Evening: from 20:00 until the new day starts (01:00 with the day starting at 04:00 is still that evening). */
export const isEvening = (at: number, dayStartHour: number) => { const h = new Date(at).getHours(); return h >= 20 || h < dayStartHour; };

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

/** Heavy-day notices: on (noticed, decided, maybe a small trim), quiet (noticed, the Coach knows, nothing changes) or off.
 *  Unset follows the goal: fat loss on, any other goal quiet. */
export type HeavyMode = 'on' | 'quiet' | 'off';
export const heavyMode = (s: Pick<Settings, 'heavyDays' | 'profile'>): HeavyMode => s.heavyDays ?? (s.profile?.goal === 'fatloss' ? 'on' : 'quiet');

/** The most a catch-up may take off a day, all running catch-ups together: 250 kcal, 15 % of the target, and the room
 *  above the floor. */
export const TRIM_CAP = 250;
export const maxTrim = (target: number, floor: number) => Math.max(0, Math.min(TRIM_CAP, Math.round(target * 0.15 / 10) * 10, Math.floor((target - floor) / 10) * 10));

const runningOn = (d: Pick<AppData, 'catchUps'>, date: string) => (d.catchUps ?? []).filter((c) => !c.off && c.perDay > 0 && c.days.includes(date));

/** The calorie target for a day, with any catch-up running on it (undefined = no target set). Never above their own
 *  target, never under the floor, never more than `maxTrim` lower however many catch-ups overlap; notices off or quiet
 *  leave it alone. */
export function kcalTargetFor(d: Pick<AppData, 'settings' | 'catchUps'>, date: string): number | undefined {
  const base = d.settings.goals.kcal;
  if (!base) return undefined;
  if (heavyMode(d.settings) !== 'on') return base;
  const on = runningOn(d, date);
  if (!on.length) return base;
  const floor = Math.min(...on.map((c) => c.floor));
  const cut = Math.min(maxTrim(base, floor), on.reduce((n, c) => n + c.perDay, 0));
  return Math.min(base, Math.max(floor, base - cut));
}

/** The catch-up running on a day, for the line under the ring ("−200 catch-up · 3 days left"): the cut that really applies. */
export function catchUpOn(d: Pick<AppData, 'catchUps' | 'settings'>, date: string): { perDay: number; left: number; from: CatchUp } | null {
  const base = d.settings.goals.kcal;
  const target = kcalTargetFor(d, date);
  if (!base || target === undefined || target >= base) return null;
  const c = [...runningOn(d, date)].reverse()[0];
  return c ? { perDay: base - target, left: c.days.filter((x) => x >= date).length, from: c } : null;
}

/** Heavy days in the 7 days up to and including today (today counts once it is clearly over), and the 7 before. */
export function heavyWeeks(d: Data, today: string): [number, number] {
  const t = targetOn(d, today);
  const now = t && dayKcal(d, today) - t >= heavyLine(t) ? 1 : 0;
  const past = heavyDays(d, today, 13).map((h) => diffDays(today, h.date));
  return [now + past.filter((n) => n <= 6).length, past.filter((n) => n >= 7).length];
}
/** Frequent: 3 or more heavy days a week, two weeks running. Information for the judgement (structure usually helps more
 *  than cutting), and the moment to mention help once. */
export const frequentHeavy = (d: Data, today: string) => { const [a, b] = heavyWeeks(d, today); return a >= 3 && b >= 3; };

/** How far over its own target a day ended (null: no target that day, so not judged). */
export function overOn(d: Data, date: string): { over: number; heavy: boolean } | null {
  const target = targetOn(d, date);
  if (!target) return null;
  const over = Math.round(dayKcal(d, date) - target);
  return { over, heavy: over >= heavyLine(target) };
}

/** The heavy days to catch up now: today once it is evening (live), and the last 3 days when they end clearly over. */
export function heavyNow(d: Data, now = Date.now()): { date: string; over: number; trigger: 'live' | 'late' }[] {
  if (!d.settings.goals.kcal) return [];
  const today = dayKey(now, d.settings.dayStartHour);
  const out: { date: string; over: number; trigger: 'live' | 'late' }[] = [];
  for (let i = 3; i >= 0; i--) {
    const date = addDays(today, -i);
    const o = overOn(d, date);
    if (!o?.heavy) continue;
    if (i === 0 && !isEvening(now, d.settings.dayStartHour)) continue; // (today only once it is evening)
    out.push({ date, over: o.over, trigger: i > 0 && lateKcal(d, date) >= 600 ? 'late' : 'live' });
  }
  return out;
}

/** Decided once (an older record that already has its line counts as decided). */
export const isDecided = (c: CatchUp) => c.decided ?? !!c.line;

/**
 * The catch-ups after a change in the food log or the target (notices off: nothing is recorded). A new heavy day is
 * recorded undecided, with no cut yet (decided once, lib/eatingWatch.ts). One already recorded follows the log: no longer
 * heavy (an entry deleted or fixed) → gone; the amount changed by 100 or more → updated, never decided again. One taken
 * back, or set by hand through the Coach, is left alone. Null when nothing changes.
 */
export function reconcileCatchUps(d: Data, now = Date.now()): { list: CatchUp[]; fresh: CatchUp[]; gone: CatchUp[]; changed: CatchUp[] } | null {
  if (!d.settings.goals.kcal || heavyMode(d.settings) === 'off') return null;
  const today = dayKey(now, d.settings.dayStartHour);
  const since = d.settings.heavyOnSince;
  let list = [...(d.catchUps ?? [])];
  const fresh: CatchUp[] = [], gone: CatchUp[] = [], changed: CatchUp[] = [];
  // the ones recorded in the last week follow the log
  for (const c of list) {
    if (c.off || c.byHand || diffDays(today, c.date) > 7) continue;
    const o = overOn(d, c.date);
    if (!o?.heavy) { gone.push(c); continue; }
    if (Math.abs(o.over - c.over) >= 100) changed.push({ ...c, over: o.over, at: now });
  }
  if (gone.length) list = list.filter((c) => !gone.includes(c));
  for (const x of changed) list = list.map((c) => (c.id === x.id ? x : c));
  for (const h of heavyNow(d, now)) {
    if (since && h.date < since) continue; // (switched on later: never about the days before)
    if (list.some((c) => c.date === h.date)) continue;
    const next: CatchUp = { id: uid('cu'), date: h.date, over: h.over, days: [], perDay: 0, floor: catchUpFloor(d, today), trigger: h.trigger, at: now, decided: false };
    list.push(next);
    fresh.push(next);
  }
  return fresh.length || gone.length || changed.length ? { list: list.slice(-30), fresh, gone, changed } : null;
}

/** The heavy days in the last weeks (for the Coach and the weekly review): how much over, and whether logged late. */
export function heavyDays(d: Data, today: string, days = 28): { date: string; over: number; late: boolean; evening: number }[] {
  if (!d.settings.goals.kcal) return [];
  const out: { date: string; over: number; late: boolean; evening: number }[] = [];
  for (let i = days; i >= 1; i--) {
    const date = addDays(today, -i);
    const o = overOn(d, date);
    if (!o?.heavy) continue;
    // what was eaten (or logged) in the evening, that day or late
    const evening = d.entries.reduce((n, e) => n + (e.date === date && (dayKey(e.at, d.settings.dayStartHour) > date || isEvening(e.at, d.settings.dayStartHour)) ? e.nutrients.kcal ?? 0 : 0), 0);
    out.push({ date, over: o.over, late: lateKcal(d, date) >= 600, evening: Math.round(evening) });
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
  const mode = heavyMode(d.settings);
  const heavy = mode === 'off' ? [] : heavyDays(d, today);
  if (heavy.length) L.push(`Heavy days, last 4 weeks (clearly over that day's target): ${heavy.map((h) => `${WD[new Date(`${h.date}T12:00:00`).getDay()]} ${h.date} +${h.over} kcal${h.late ? ', logged the day after' : ''}${h.evening ? `, ${h.evening} kcal of it in the evening` : ''}`).join('; ')}. ${heavy.length} in 4 weeks.`);
  if (mode === 'off') L.push('Heavy-day notices are OFF (their choice): never bring up heavy days or catch-ups unless they do.');
  const on = catchUpOn(d, today);
  if (on) L.push(`CATCH-UP running: ${on.from.date} was +${on.from.over} over, so the target is ${on.perDay} lower for ${on.left} more day${on.left === 1 ? '' : 's'} including today (today's target ${kcalTargetFor(d, today)} kcal instead of ${d.settings.goals.kcal}; protein unchanged). "Don't cut my calories" → catch_up with on false.`);
  const recent = (d.catchUps ?? []).filter((c) => !c.off && isDecided(c) && diffDays(today, c.date) <= 3);
  if (mode === 'quiet') for (const c of recent) L.push(`Heavy day noticed (heavy-day notices are on Quiet, so nothing was changed or said): ${c.date === today ? 'today' : c.date} +${c.over} kcal over its target. Mention it only if they ask.`);
  if (mode === 'on') {
    for (const c of justNoticed(d, today)) L.push(`JUST NOTICED (say it once, straight and calm, with the numbers, then the plan; no lecture, no guilt; answer what they asked first): ${c.date === today ? 'today' : c.date} was +${c.over} kcal over its target${c.trigger === 'late' ? ' (logged the day after)' : ' (this evening)'}; ${c.perDay ? `decided: −${c.perDay} kcal a day for ${c.days.length} days, protein unchanged` : 'decided: no cut, back to the normal target'}. The pop-up told them: "${c.line}"`);
    const last = recent.filter((c) => c.told).sort((a, b) => b.at - a.at)[0];
    if (last) L.push(`LAST HEAVY-DAY DECISION (for "why?"): ${last.date} +${last.over} kcal; ${last.perDay ? `−${last.perDay} kcal a day for ${last.days.length} day${last.days.length === 1 ? '' : 's'}` : 'no cut'}${last.byHand ? ' (they asked for it)' : ''}. Line: "${last.line ?? ''}"${last.why ? `. Reasoning: ${last.why}` : ''}`);
  }
  return L.length ? ['EATING PATTERNS:', ...L] : [];
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** What the Coach is told it just noticed and hasn't said yet (notices on, decided, the pop-up shown). */
export function justNoticed(d: Pick<AppData, 'catchUps' | 'settings'>, today: string): CatchUp[] {
  if (heavyMode(d.settings) !== 'on') return [];
  return (d.catchUps ?? []).filter((c) => !c.off && isDecided(c) && c.told && !c.coachTold && c.line && diffDays(today, c.date) <= 3);
}

/** The Coach has said what it was told it just noticed (`ids`, from the turn that had it): not said again. */
export function markCoachTold(d: Pick<AppData, 'catchUps'>, set: (next: CatchUp[]) => void, ids: string[]) {
  const list = d.catchUps ?? [];
  if (ids.length && list.some((c) => ids.includes(c.id) && !c.coachTold)) set(list.map((c) => (ids.includes(c.id) ? { ...c, coachTold: true } : c)));
}
