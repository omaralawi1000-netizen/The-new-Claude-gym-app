/**
 * What to do after a heavy day (Omar, 19 Oct: "you don't have to undereat by 500 every day for 4 days"). The app still
 * notices the day by itself (lib/eating.ts: free, instant, no false alarms); what to DO about it is a judgement call, so the
 * main brain makes it, thinking hard, with everything a coach would weigh: the goal, true maintenance, how often heavy
 * days happen, sleep, the next days' training and sport, age. It may decide nothing, a small trim or a spread. Hard
 * limits stay in code whatever it says: never under the floor, at most 15 % of the target (and 400 kcal) a day, 7 days,
 * protein untouched, Undo. Without a brain (no key, offline, over the limit) a gentle default applies.
 */
import type { AppData, CatchUp } from './types';
import { addDays } from './dates';
import { HANDBOOK_CORE, HOW_TO_TALK, handbookTopic } from './handbook';
import { eatingLines, heavyDays, targetOn } from './eating';
import { personLines } from './person';
import { recoveryLines } from './recovery';
import { plannedFor } from '../state/store';

export interface Verdict { plan: 'none' | 'trim'; perDay: number; days: number; line: string; why: string }

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

/** The most a trim may take off a day. */
export const maxTrim = (target: number, floor: number) => Math.max(0, Math.min(400, Math.round(target * 0.15 / 10) * 10, Math.floor((target - floor) / 10) * 10));

/** The limits, whatever the brain said. */
export function clampVerdict(v: Partial<Verdict> | null | undefined, target: number, floor: number): Verdict | null {
  if (!v || (v.plan !== 'none' && v.plan !== 'trim') || typeof v.line !== 'string' || !v.line.trim()) return null;
  const cap = maxTrim(target, floor);
  let perDay = v.plan === 'trim' ? Math.round(Math.min(cap, Math.max(0, Number(v.perDay) || 0)) / 10) * 10 : 0;
  let days = v.plan === 'trim' ? Math.min(7, Math.max(1, Math.round(Number(v.days) || 0))) : 0;
  if (perDay < 50) { perDay = 0; days = 0; }
  return { plan: perDay ? 'trim' : 'none', perDay, days, line: v.line.trim().slice(0, 220), why: String(v.why ?? '').trim().slice(0, 600) };
}

/** No brain to ask: gentle. Muscle and strength goals don't cut at all; otherwise up to half of it back, ≤250 a day, ≤4 days. */
export function defaultVerdict(c: CatchUp, goal: string | undefined, target: number, t: (k: string, v?: Record<string, string | number>) => string, fmt: (n: number) => string): Verdict {
  if (goal === 'muscle' || goal === 'strength' || goal === 'endurance') return { plan: 'none', perDay: 0, days: 0, line: t('+{over} kcal over. Mostly water on the scale — back to normal today, no cut.', { over: fmt(c.over) }), why: '' };
  const perDay = Math.min(250, maxTrim(target, c.floor), Math.round(c.over / 2 / 4 / 10) * 10);
  if (perDay < 50) return { plan: 'none', perDay: 0, days: 0, line: t('+{over} kcal over. Mostly water on the scale — back to normal today, no cut.', { over: fmt(c.over) }), why: '' };
  const days = Math.min(4, Math.ceil(c.over / 2 / perDay));
  return { plan: 'trim', perDay, days, line: t('+{over} kcal over. Mostly water on the scale. A small trim: −{per} kcal a day for {n} days, protein stays.', { over: fmt(c.over), per: fmt(perDay), n: days }), why: '' };
}

/** The facts the brain decides from. */
export function verdictPrompt(d: AppData, c: CatchUp, today: string, lang: string): { system: string; prompt: string } {
  const target = d.settings.goals.kcal ?? 0;
  const next = [0, 1, 2, 3].map((i) => {
    const day = addDays(today, i);
    const wd = new Date(`${day}T12:00:00`).getDay();
    const gym = plannedFor(d, day, today); const r = gym && d.routines.find((x) => x.id === gym.routineId);
    const acts = d.schedule.activities?.[wd] ?? [];
    return `${day}: ${[r ? `gym (${r.name})` : '', ...acts].filter(Boolean).join(' + ') || 'rest'}`;
  }).join('; ');
  const mem = d.memory.filter((m) => !m.until || m.until >= today).map((m) => `- ${m.text}`).join('\n');
  const system = `You are the coach inside a training and food app, deciding what to do after a heavy day. ${HANDBOOK_CORE}\n\n${handbookTopic('overeating')}\n\n${HOW_TO_TALK}\n\nDecide: plan none (back to the normal target) or trim (lower the next days a little). Never a day that punishes; protein stays as it is. A trim is worth it only when heavy days are frequent and the goal is fat loss; a rare one is just a normal next day. Limits the app enforces anyway: at most ${maxTrim(target, c.floor)} kcal a day, at most 7 days, never under ${c.floor} kcal. "line" is what the pop-up shows: straight, calm, the number, what it means, the plan. Write in ${lang === 'da' ? 'Danish' : 'English'}.`;
  const heavy = heavyDays(d, today);
  const prompt = [
    `Heavy day: ${c.date}${c.date === today ? ' (today, this evening)' : ''}, +${c.over} kcal over that day's target of ${targetOn(d, c.date) ?? target}${c.trigger === 'late' ? ' (logged the morning after)' : ''}. Today's target: ${target}.`,
    `Goal: ${d.settings.profile.goal}. Protein target: ${d.settings.goals.protein ?? 'none'} g.`,
    `Heavy days in the last 4 weeks: ${heavy.length}${heavy.length ? ` (${heavy.map((h) => `${h.date} +${h.over}`).join(', ')})` : ''}.`,
    `The next days: ${next}.`,
    ...eatingLines(d, today, d.settings.profile.goal).filter((l) => !/^JUST NOTICED|^CATCH-UP/.test(l)),
    ...personLines(d, today),
    ...recoveryLines(d.health, today).slice(0, 4),
    mem ? `What they told the coach (MEMORY):\n${mem}` : '',
  ].filter(Boolean).join('\n');
  return { system, prompt };
}

/** The catch-up as the verdict says (the detected day stays recorded either way, so it is not asked about again). */
export function applyVerdict(c: CatchUp, v: Verdict, today: string): CatchUp {
  const start = c.days[0] ?? (addDays(c.date, 1) > today ? addDays(c.date, 1) : today);
  return { ...c, perDay: v.perDay, days: Array.from({ length: v.days }, (_, k) => addDays(start, k)), line: v.line, why: v.why || undefined };
}
