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
import type { AppData, CatchUp, MemoryNote, Settings, TargetChange } from './types';
import { addDays, dayKey, diffDays } from './dates';
import { suggestedTarget, trueMaintenance } from './maintenance';
import { uid } from './nutrition';

type Data = Pick<AppData, 'entries' | 'settings' | 'weights' | 'health' | 'catchUps' | 'targets' | 'marks'>;

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

/** Their age, from what the Coach remembered: "Age: 17 (as of 2026-10-19)" first (the form the Coach is told to use),
 *  then "17 years old" / "17-årig" / "alder 17"; the newest line wins (an age corrected later). Undefined = not known. */
export function ageFromMemory(memory0: (Pick<MemoryNote, 'text'> & Partial<Pick<MemoryNote, 'at' | 'updatedAt'>>)[], today: string): number | undefined {
  // (newest first; on a tie the one added later, which sits further down the list)
  const memory = memory0.map((m, i) => ({ m, i })).sort((a, b) => (b.m.updatedAt ?? b.m.at ?? 0) - (a.m.updatedAt ?? a.m.at ?? 0) || b.i - a.i).map((x) => x.m);
  for (const m of memory) {
    const x = /\bage:\s*(\d{1,2})\s*\(as of (\d{4}-\d{2}-\d{2})\)/i.exec(m.text);
    if (x) return Number(x[1]) + Math.max(0, Math.floor(diffDays(today, x[2]) / 365.25));
  }
  // (other wordings only when the note starts with their own age: "He is 16 years old", "User is 18 years old" (how the
  // Coach wrote Omar's), "16-årig bryder" — not "trains
  // with his dad, who is 45 years old")
  for (const m of memory) {
    const x = /^\s*(?:(?:(?:the )?user|he|she|they|i)(?:'s|'m| is| am| are)\s+|(?:brugeren|jeg|han|hun|de) er\s+)?(\d{1,2})[- ]?(?:years?[- ]old|yrs? old|år gammel|årig)\b/i.exec(m.text) ?? /^\s*(?:age|alder)\s*:?\s*(\d{1,2})\b/i.exec(m.text);
    if (x) return Number(x[1]);
  }
  return undefined;
}

/** A note in MEMORY that points to disordered eating (purging, laxatives, not eating to make up for it, loss of control):
 *  then never a cut, whatever else is true. Clear signs only: a wrestler "starving after practice" or who "threw up after
 *  a hard session" is not one (the Coach writes "Eating-disorder signal: …" when it sees one). */
const ED = /eating[- ]disorder|spiseforstyrr\w*|purg\w*|laxative|afføringsmid\w*|anorexi|anoreksi|bulimi|self[- ]induced|make (?:my|them|him|her)sel(?:f|ves) (?:sick|throw up|vomit)|made (?:my|him|her|them)sel(?:f|ves) (?:sick|throw up|vomit)|(?:kast\w*|brækk\w*) (?:op |mig |sig )?med vilje|fremprovoker\w*|starv(?:e|es|ed|ing) (?:my|him|her|them)sel(?:f|ves)|sult(?:e|er|ede)? (?:mig|sig) |not eating to (?:compensate|make up)|skip(?:ping|s)? meals? to (?:compensate|make up)|loss of control|los(?:e|ing) control|can'?t stop eating|miste(?:r|de)? kontrol\w*/i;
export const edFromMemory = (memory: Pick<MemoryNote, 'text'>[]) => memory.some((m) => ED.test(m.text));

/** Why a trim is not allowed for them now (null = allowed): notices not on, not a fat-loss goal, age unknown or under
 *  18, or an eating-disorder note. */
export type NoTrim = 'mode' | 'goal' | 'age' | 'minor' | 'health';
export function trimAllowed(d: Pick<AppData, 'settings' | 'memory'>, today: string): NoTrim | null {
  if (d.settings.profile.goal !== 'fatloss') return 'goal';
  if (heavyMode(d.settings) !== 'on') return 'mode';
  if (edFromMemory(d.memory)) return 'health';
  const age = ageFromMemory(d.memory, today);
  if (age === undefined) return 'age';
  if (age < 18) return 'minor';
  return null;
}

const runningOn = (d: Pick<AppData, 'catchUps'>, date: string) => (d.catchUps ?? []).filter((c) => !c.off && c.perDay > 0 && c.days.includes(date));

/** The calorie target for a day, with any catch-up running on it (undefined = no target set). Never above their own
 *  target, never under the floor, never more than `maxTrim` lower however many catch-ups overlap; notices off or quiet
 *  leave it alone. */
export function kcalTargetFor(d: Pick<AppData, 'settings' | 'catchUps'> & { memory?: AppData['memory'] }, date: string): number | undefined {
  const base = d.settings.goals.kcal;
  if (!base) return undefined;
  // (a hard limit checked where the target is used: an eating-disorder note, an age under 18, a goal that isn't fat loss
  // or notices not on stop a running cut at once, whatever was decided before)
  if (trimAllowed({ settings: d.settings, memory: d.memory ?? [] }, date)) return base;
  const on = runningOn(d, date);
  if (!on.length) return base;
  const floor = Math.min(...on.map((c) => c.floor));
  const cut = Math.min(maxTrim(base, floor), on.reduce((n, c) => n + c.perDay, 0));
  return Math.min(base, Math.max(floor, base - cut));
}

/** The catch-up running on a day, for the line under the ring ("−200 catch-up · 3 days left"): the cut that really applies. */
export function catchUpOn(d: Pick<AppData, 'catchUps' | 'settings'> & { memory?: AppData['memory'] }, date: string): { perDay: number; left: number; from: CatchUp } | null {
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

/** A little over (25 Oct, "honest voice"): this much over the day's target is worth one plain line, the way a coach says
 *  it, while a heavy day (`heavyLine`) keeps its own decision. */
export const OVER_LINE = 200;
/** The line for a target: 200 kcal, or 10 % of a big target (normal logging error is about that). */
export const overLine = (target: number) => Math.max(OVER_LINE, Math.round(target * 0.1));
/** How far a day went over its target when that is a little (at least `overLine`, not heavy); else null. */
function aLittleOver(d: Data, date: string): number | null {
  const t = targetOn(d, date);
  const o = overOn(d, date);
  return t && o && !o.heavy && o.over >= overLine(t) ? o.over : null;
}
/** Today over its target by at least `overLine` but not heavy, and on how many of the last 7 days (today included) that
 *  happened; null when there is nothing to say (no target, under it, or heavy: that has its own pop-up). */
export function overToday(d: Data, today: string): { over: number; days: number } | null {
  const a = aLittleOver(d, today);
  if (!a) return null;
  let days = 1;
  for (let i = 1; i < 7; i++) if (aLittleOver(d, addDays(today, -i))) days++;
  return { over: a, days };
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
  // the ones recorded in the last week follow the log. One already decided stays recorded when its day stops being
  // heavy (deleted, fixed), with no cut: logged again a minute later it is the same evening, never asked or said twice
  for (const c of list) {
    if (c.off || c.byHand || diffDays(today, c.date) > 7) continue;
    const o = overOn(d, c.date);
    if (c.gone) { if (o?.heavy) changed.push({ ...c, gone: false, over: o.over, at: now }); continue; }
    if (!o?.heavy) { gone.push(c); continue; }
    if (Math.abs(o.over - c.over) >= 100) changed.push({ ...c, over: o.over, at: now });
  }
  if (gone.length) list = list.flatMap((c) => (!gone.includes(c) ? [c] : isDecided(c) ? [{ ...c, gone: true, perDay: 0, days: c.days.filter((x) => x < today), line: undefined, why: undefined }] : []));
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
    L.push(`True maintenance: about ${m.kcal} kcal a day (${m.confidence} confidence${m.confidence === 'low' ? ', an ESTIMATE' : ''}: ${m.loggedDays} logged days and ${m.weighIns} weigh-ins in 4 weeks; logged average ${m.avgIntake} kcal, weight ${m.kgPerWeek >= 0 ? '+' : ''}${m.kgPerWeek} kg a week). It is relative to what they log, so targets built on it work.${m.confidence === 'low' ? ' Too unsure yet to base a new target on.' : ` A target for their goal from it: about ${suggestedTarget(m, goal)} kcal.`}`);
    if (m.invisible) { const said = d.marks?.invisibleSaid; L.push(`Invisible calories: the watch says they burn about ${m.watchBurn} kcal a day, ${m.invisible} more than their logs and the scale add up to. Either the watch overestimates (common) or some food isn't logged, most likely a bit of both.${said ? ` They were told about this on ${said}.` : ''}`); }
  } else L.push('True maintenance: not enough yet (needs about 10 logged days and 4 weigh-ins two weeks apart in the last 4 weeks).');
  const mode = heavyMode(d.settings);
  const heavy = mode === 'off' ? [] : heavyDays(d, today);
  if (heavy.length) L.push(`Heavy days, last 4 weeks (clearly over that day's target): ${heavy.map((h) => `${WD[new Date(`${h.date}T12:00:00`).getDay()]} ${h.date} +${h.over} kcal${h.late ? ', logged the day after' : ''}${h.evening ? `, ${h.evening} kcal of it in the evening` : ''}`).join('; ')}. ${heavy.length} in 4 weeks.`);
  // (a little over, not heavy: a coach notices that too, and how often)
  const over = mode === 'off' ? [] : [6, 5, 4, 3, 2, 1, 0].flatMap((i) => { const date = addDays(today, -i); const o = aLittleOver(d, date); return o ? [`${i === 0 ? 'today so far' : `${WD[new Date(`${date}T12:00:00`).getDay()]} ${date}`} +${o}`] : []; });
  if (over.length) L.push(`A little over the target (${OVER_LINE}+ kcal or 10 % over, not heavy), last 7 days: ${over.length} day${over.length === 1 ? '' : 's'} — ${over.join(', ')} kcal.`);
  if (mode === 'off') L.push('Heavy-day notices are OFF: they chose not to hear about heavy days or catch-ups unless they bring them up.');
  const [w1, w2] = mode === 'off' ? [0, 0] : heavyWeeks(d, today);
  if (w1 >= 3 && w2 >= 3) {
    // (how many weeks in a row, up to 4: a long pattern is different from a rough fortnight)
    let run = 2; // (this week and the one before, as counted above)
    const inWeek = (k: number) => heavy.filter((h) => { const a = diffDays(today, h.date); return a >= 7 * k && a < 7 * k + 7; }).length;
    while (run < 4 && inWeek(run) >= 3) run++;
    L.push(`Frequent heavy days: ${w1} in the last 7 days and ${w2} in the 7 before; ${run} weeks running.`);
  }
  const on = catchUpOn(d, today);
  if (on) L.push(`CATCH-UP running: ${on.from.date} was +${on.from.over} over, so the target is ${on.perDay} lower for ${on.left} more day${on.left === 1 ? '' : 's'} including today (today's target ${kcalTargetFor(d, today)} kcal instead of ${d.settings.goals.kcal}; protein unchanged).`);
  const recent = (d.catchUps ?? []).filter((c) => !c.off && !c.gone && isDecided(c) && diffDays(today, c.date) <= 3);
  if (mode === 'quiet') for (const c of recent) L.push(`Heavy day noticed: ${c.date === today ? 'today' : c.date} +${c.over} kcal over its target (heavy-day notices on Quiet: nothing changes, and they chose to hear about heavy days only if they ask).`);
  if (mode === 'on') {
    for (const c of justNoticed(d, today)) L.push(`JUST NOTICED, not talked about in the chat yet (the pop-up told them; they may want to know what it means): ${c.date === today ? 'today' : c.date} was +${c.over} kcal over its target${c.trigger === 'late' ? ' (logged the day after)' : ' (this evening)'}; ${c.perDay ? `decided: −${c.perDay} kcal a day for ${c.days.length} days, protein unchanged` : 'decided: no cut, back to the normal target'}. The pop-up told them: "${c.line}"`);
    const last = recent.filter((c) => c.told).sort((a, b) => b.at - a.at)[0];
    if (last) L.push(`LAST HEAVY-DAY DECISION: ${last.date} +${last.over} kcal; ${last.perDay ? `−${last.perDay} kcal a day for ${last.days.length} day${last.days.length === 1 ? '' : 's'}` : 'no cut'}${last.byHand ? ' (they asked for it)' : ''}. Line: "${last.line ?? ''}"${last.why ? `. Reasoning: ${last.why}` : ''}`);
  }
  return L.length ? ['EATING PATTERNS:', ...L] : [];
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** What the Coach is told it just noticed and hasn't said yet (notices on, decided, the pop-up shown). */
export function justNoticed(d: Pick<AppData, 'catchUps' | 'settings'>, today: string): CatchUp[] {
  if (heavyMode(d.settings) !== 'on') return [];
  return (d.catchUps ?? []).filter((c) => !c.off && !c.gone && isDecided(c) && c.told && !c.coachTold && c.line && diffDays(today, c.date) <= 3);
}

/** The Coach has said what it was told it just noticed (`ids`, from the turn that had it): not said again. */
export function markCoachTold(d: Pick<AppData, 'catchUps'>, set: (next: CatchUp[]) => void, ids: string[]) {
  const list = d.catchUps ?? [];
  if (ids.length && list.some((c) => ids.includes(c.id) && !c.coachTold)) set(list.map((c) => (ids.includes(c.id) ? { ...c, coachTold: true } : c)));
}
