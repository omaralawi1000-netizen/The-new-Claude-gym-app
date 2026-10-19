/**
 * What to do after a heavy day (Omar, 19 Oct: "you don't have to undereat by 500 every day for 4 days"; "it depends on how
 * much I eat and so many other factors"). The app notices the day by itself (lib/eating.ts: free, instant, no false
 * alarms); what to DO about it is a judgement call, so the main brain makes it, thinking hard, case by case, with
 * everything a coach would weigh: the real surplus over true maintenance, how often heavy days happen, the trend, sleep,
 * the next days' training and sport, what they told the Coach. It may decide nothing or a small trim.
 *
 * Hard limits stay in code whatever it says (review round 1): a trim only for an adult (age known) on a fat-loss goal with
 * heavy-day notices on, never with an eating-disorder note in MEMORY; at most 250 kcal a day for all catch-ups together,
 * at most 4 days, at most half of the real surplus, never under the floor or above their own target, protein untouched,
 * Undo. Without a brain (no key, offline, over the limit) there is no cut at all, just the note that it was noticed.
 */
import type { AppData, CatchUp, MemoryNote } from './types';
import { addDays, diffDays } from './dates';
import { HANDBOOK_CORE, HOW_TO_TALK, handbookTopic } from './handbook';
import { dayKcal, eatingLines, heavyDays, heavyMode, heavyWeeks, maxTrim, targetOn } from './eating';
import { trueMaintenance } from './maintenance';
import { dataTrustLines } from './dataQuality';
import { personLines } from './person';
import { recoveryLines } from './recovery';
import { plannedFor } from '../state/store';

export { maxTrim };
export interface Verdict { plan: 'none' | 'trim'; perDay: number; days: number; line: string; why: string }
type T = (k: string, v?: Record<string, string | number>) => string;

export const VERDICT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    plan: { type: 'STRING', enum: ['none', 'trim'], description: 'none = back to the normal target; trim = lower the next days a little' },
    perDay: { type: 'NUMBER', description: 'trim: kcal lower per day (0 for none)' },
    days: { type: 'NUMBER', description: 'trim: for how many days (0 for none)' },
    line: { type: 'STRING', description: 'the one line the pop-up shows: the number straight, what it means, the plan; at most ~25 words; their language' },
    why: { type: 'STRING', description: 'the reasoning in 2–4 short sentences with their numbers (shown when they ask why)' },
  },
  required: ['plan', 'perDay', 'days', 'line', 'why'],
};

/** Their age, from what the Coach remembered: "Age: 17 (as of 2026-10-19)" first (the form the Coach is told to use),
 *  then "17 years old" / "17-årig" / "alder 17". Undefined = not known. */
export function ageFromMemory(memory: Pick<MemoryNote, 'text'>[], today: string): number | undefined {
  for (const m of memory) {
    const x = /\bage:\s*(\d{1,2})\s*\(as of (\d{4}-\d{2}-\d{2})\)/i.exec(m.text);
    if (x) return Number(x[1]) + Math.max(0, Math.floor(diffDays(today, x[2]) / 365.25));
  }
  for (const m of memory) {
    const x = /\b(\d{1,2})[- ]?(?:years?[- ]old|yrs? old|år gammel|årig)\b/i.exec(m.text) ?? /\b(?:age|alder)\s*:?\s*(\d{1,2})\b/i.exec(m.text);
    if (x) return Number(x[1]);
  }
  return undefined;
}

/** A note in MEMORY that points to disordered eating (purging, laxatives, not eating to make up for it, loss of control):
 *  then never a cut, whatever else is true. */
const ED = /eating[- ]disorder|spiseforstyrrelse|purg|vomit|throw(?:ing|s)? up|threw up|make (?:my|them|him|her)sel(?:f|ves) sick|laxative|afføringsmiddel|kast(?:e|er|ede|et) op|brække|anorexi|anoreksi|bulimi|starv|sult(?:e|er|ede)\b|not eating to (?:compensate|make up)|skip(?:ping|s)? meals to (?:compensate|make up)|loss of control|lose control|can'?t stop eating|miste(?:r|de)? kontrol/i;
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

/** How much this catch-up may take, at most: per day (250 for all running catch-ups together, 15 % of the target, the
 *  room above the floor), in total (half of the real surplus: over the target, and over true maintenance when that is
 *  known well), and days (4). */
export function trimLimits(d: Pick<AppData, 'settings' | 'catchUps' | 'entries' | 'weights' | 'health'>, c: CatchUp, today: string): { perDay: number; total: number; days: number } {
  const base = d.settings.goals.kcal ?? 0;
  const others = (d.catchUps ?? []).filter((x) => x.id !== c.id && x.date !== c.date && !x.off && x.perDay > 0 && x.days.some((y) => y >= today)).reduce((n, x) => n + x.perDay, 0);
  const m = trueMaintenance(d, today);
  const surplus = m && m.confidence !== 'low' ? Math.min(c.over, Math.round(dayKcal(d, c.date) - m.kcal)) : c.over;
  return { perDay: Math.max(0, maxTrim(base, c.floor) - others), total: Math.max(0, Math.floor(surplus / 2)), days: 4 };
}

/** The pop-up line for a plan, from the app's own words (used without a brain, and when the limits changed what it said). */
export function verdictLine(c: CatchUp, v: Pick<Verdict, 'perDay' | 'days'>, today: string, t: T, fmt: (n: number) => string): string {
  if (!v.perDay) return c.date === today
    ? t('+{over} kcal over today. Mostly water on the scale — back to normal tomorrow, no cut.', { over: fmt(c.over) })
    : t('+{over} kcal over. Mostly water on the scale — back to normal today, no cut.', { over: fmt(c.over) });
  return v.days === 1
    ? t('+{over} kcal over. Mostly water on the scale. A small trim: −{per} kcal for one day, protein stays.', { over: fmt(c.over), per: fmt(v.perDay) })
    : t('+{over} kcal over. Mostly water on the scale. A small trim: −{per} kcal a day for {n} days, protein stays.', { over: fmt(c.over), per: fmt(v.perDay), n: v.days });
}

/** The limits, whatever the brain said. `clamped` = the plan is not what it said, so its line must be rebuilt. */
export function clampVerdict(v: Partial<Verdict> | null | undefined, lim: { perDay: number; total: number; days: number }): (Verdict & { clamped: boolean }) | null {
  if (!v || (v.plan !== 'none' && v.plan !== 'trim') || typeof v.line !== 'string' || !v.line.trim()) return null;
  const askedPer = v.plan === 'trim' ? Math.max(0, Number(v.perDay) || 0) : 0;
  const askedDays = v.plan === 'trim' ? Math.max(1, Math.round(Number(v.days) || 0)) : 0;
  let perDay = Math.round(Math.min(lim.perDay, askedPer) / 10) * 10;
  let days = Math.min(lim.days, askedDays);
  if (perDay * days > lim.total) {
    days = Math.max(1, Math.min(days, Math.floor(lim.total / Math.max(perDay, 1))));
    if (perDay * days > lim.total) perDay = Math.floor(lim.total / days / 10) * 10;
  }
  if (perDay < 50) { perDay = 0; days = 0; }
  const clamped = perDay !== Math.round(askedPer / 10) * 10 || days !== askedDays;
  return { plan: perDay ? 'trim' : 'none', perDay, days, line: v.line.trim().slice(0, 220), why: String(v.why ?? '').trim().slice(0, 600), clamped };
}

/** No brain to ask, or a trim isn't allowed: no cut, said straight. */
export function defaultVerdict(c: CatchUp, today: string, t: T, fmt: (n: number) => string): Verdict {
  return { plan: 'none', perDay: 0, days: 0, line: verdictLine(c, { perDay: 0, days: 0 }, today, t, fmt), why: '' };
}

/** The facts the brain decides from. */
export function verdictPrompt(d: AppData, c: CatchUp, today: string, lang: string): { system: string; prompt: string } {
  const target = d.settings.goals.kcal ?? 0;
  const lim = trimLimits(d, c, today);
  const next = [0, 1, 2, 3].map((i) => {
    const day = addDays(today, i);
    const wd = new Date(`${day}T12:00:00`).getDay();
    const gym = plannedFor(d, day, today); const r = gym && d.routines.find((x) => x.id === gym.routineId);
    const acts = d.schedule.activities?.[wd] ?? [];
    return `${day}: ${[r ? `gym (${r.name})` : '', ...acts].filter(Boolean).join(' + ') || 'rest'}`;
  }).join('; ');
  const live = d.memory.filter((m) => !m.until || m.until >= today);
  // (what they asked for comes first: "max 150 a day", "no catch-ups after weekends")
  const mem = [...live.filter((m) => m.kind === 'preference'), ...live.filter((m) => m.kind !== 'preference')].map((m) => `- ${m.text}${m.until ? ` (until ${m.until})` : ''}`).join('\n');
  const system = `You are the coach inside a training and food app, deciding what to do after a heavy day. ${HANDBOOK_CORE}\n\n${handbookTopic('overeating')}\n\n${HOW_TO_TALK}\n\n` +
    'Decide, case by case: plan none (back to the normal target) or trim (lower the next days a little). Weigh what a good coach would: how big the real surplus is (over TRUE MAINTENANCE, not just over the target: that is the part that can become fat; the rest of a jump on the scale is water, salt and food in the gut), how often heavy days happen (when often, cutting tends to set up the next one, so structure — regular meals, a planned evening snack, protein early, sleep — usually helps more than a cut), whether the weight trend is on track for their goal, sleep, the training and sport in the next days, and what they told you (MEMORY). A rare heavy day for someone on track is just a normal next day. Never a day that punishes; protein stays as it is. ' +
    `What they told you in MEMORY comes first: a preference can only make a trim smaller or remove it, never bigger. Limits the app enforces anyway: at most ${lim.perDay} kcal a day, at most ${lim.days} days, at most ${lim.total} kcal in total, never under ${c.floor} kcal. ` +
    `"line" is what the pop-up shows: straight, calm, the number, what it means, the plan. Write in ${lang === 'da' ? 'Danish' : 'English'}.`;
  const heavy = heavyDays(d, today);
  const [wk, wk2] = heavyWeeks(d, today);
  const prompt = [
    `Heavy day: ${c.date}${c.date === today ? ' (today, this evening)' : ''}, +${c.over} kcal over that day's target of ${targetOn(d, c.date) ?? target}${c.trigger === 'late' ? ' (logged the morning after)' : ''}. Today's target: ${target}.`,
    `Goal: ${d.settings.profile.goal}. Protein target: ${d.settings.goals.protein ?? 'none'} g.`,
    `Heavy days: ${wk} in the last 7 days, ${wk2} in the 7 before; ${heavy.length} in the last 4 weeks${heavy.length ? ` (${heavy.map((h) => `${h.date} +${h.over}`).join(', ')})` : ''}.`,
    `The next days: ${next}.`,
    mem ? `What they told the coach (MEMORY):\n${mem}` : '',
    ...eatingLines(d, today, d.settings.profile.goal).filter((l) => !/^JUST NOTICED|^CATCH-UP|^LAST HEAVY-DAY/.test(l)),
    ...dataTrustLines(d, today),
    ...personLines(d, today),
    ...recoveryLines(d.health, today).slice(0, 4),
  ].filter(Boolean).join('\n');
  return { system, prompt };
}

/** The catch-up as the verdict says (the detected day stays recorded either way, so it is not asked about again). */
export function applyVerdict(c: CatchUp, v: Verdict, today: string): CatchUp {
  const start = c.days[0] ?? (addDays(c.date, 1) > today ? addDays(c.date, 1) : today);
  return { ...c, perDay: v.perDay, days: Array.from({ length: v.days }, (_, k) => addDays(start, k)), line: v.line, why: v.why || undefined };
}
