/**
 * What the Coach learns from what you do with its work: a food you keep moving to another meal, an exercise you keep
 * swapping out, a planned day you take back, a setting you change back. Each such moment is noted here (on this phone,
 * `aven.ledger`); once the same thing has happened twice, it becomes a rule the Coach reads before every answer (LEARNED),
 * and you see it in Settings → Coach memory, where "Forget" drops it for good. Nothing is guessed: one moment is never a
 * rule, and a moment that was undone is taken back.
 */
import { fold } from './foodText';

export type LearnEvent =
  /** a food moved to another meal by the Coach (meal id) */
  | { k: 'move'; food: string; meal: string }
  /** an exercise swapped for another (exercise ids) */
  | { k: 'swap'; from: string; to: string }
  /** a planned day applied (ok) or taken back (not ok), with its exercises (ids) */
  | { k: 'plan'; ok: boolean; exercises: string[] }
  /** a setting the Coach changed and they changed back */
  | { k: 'setting'; key: string };
type Stored = LearnEvent & { id: string; at: number };
interface Ledger { ev: Stored[]; dismissed: string[] }

const KEY = 'aven.ledger';
const MAX = 400;
/** A rule needs this many moments that agree. */
export const SIGNALS = 2;
/** Moments older than this no longer count (habits change). */
const DAYS = 120;

function read(): Ledger {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && Array.isArray(v.ev)) return { ev: v.ev, dismissed: Array.isArray(v.dismissed) ? v.dismissed : [] }; } catch { /* fresh */ }
  return { ev: [], dismissed: [] };
}
function write(l: Ledger) { try { localStorage.setItem(KEY, JSON.stringify({ ev: l.ev.slice(-MAX), dismissed: l.dismissed.slice(-200) })); } catch { /* full: it learns a little less */ } }

let n = 0;
/** Notes one moment. Returns a function that takes it back (call it from the card's Undo). */
export function noteEvent(e: LearnEvent, at = Date.now()): () => void {
  const id = `l${at.toString(36)}${(n++).toString(36)}`;
  const l = read();
  l.ev.push({ ...e, id, at } as Stored);
  write(l);
  return () => { const x = read(); x.ev = x.ev.filter((y) => y.id !== id); write(x); };
}

export interface Rule {
  id: string;
  kind: 'move' | 'swap' | 'avoid' | 'setting';
  /** the food, the exercise id swapped out / avoided, or the setting key */
  a: string;
  /** the meal id, or the exercise id swapped in */
  b?: string;
  /** how many moments agree */
  count: number;
  at: number;
}

/** The rules the moments add up to, newest first (at most 6; dismissed ones never come back). */
export function learnedRules(now = Date.now()): Rule[] {
  const l = read();
  const ev = l.ev.filter((e) => now - e.at < DAYS * 86_400_000);
  const out: Rule[] = [];
  const add = (r: Rule) => { if (r.count >= SIGNALS && !l.dismissed.includes(r.id)) out.push(r); };
  // a food keeps going to the same meal (and its last move went there)
  const moves = new Map<string, Stored[]>();
  for (const e of ev) if (e.k === 'move') { const k = fold(e.food); (moves.get(k) ?? moves.set(k, []).get(k)!).push(e); }
  for (const [food, list] of moves) {
    const last = list[list.length - 1] as Extract<Stored, { k: 'move' }>;
    const same = list.filter((x) => (x as typeof last).meal === last.meal);
    add({ id: `move:${food}:${last.meal}`, kind: 'move', a: last.food, b: last.meal, count: same.length, at: last.at });
  }
  // an exercise swapped for the same other one
  const swaps = new Map<string, Stored[]>();
  for (const e of ev) if (e.k === 'swap') { const k = `${e.from}>${e.to}`; (swaps.get(k) ?? swaps.set(k, []).get(k)!).push(e); }
  for (const [k, list] of swaps) { const e = list[list.length - 1] as Extract<Stored, { k: 'swap' }>; add({ id: `swap:${k}`, kind: 'swap', a: e.from, b: e.to, count: list.length, at: e.at }); }
  // planned days taken back that had the same exercise, and no kept day had it
  const plans = ev.filter((e): e is Extract<Stored, { k: 'plan' }> => e.k === 'plan');
  const kept = new Set(plans.filter((p) => p.ok).flatMap((p) => p.exercises));
  const back = new Map<string, Extract<Stored, { k: 'plan' }>[]>();
  for (const p of plans) if (!p.ok) for (const x of p.exercises) if (!kept.has(x)) (back.get(x) ?? back.set(x, []).get(x)!).push(p);
  for (const [x, list] of back) add({ id: `avoid:${x}`, kind: 'avoid', a: x, count: list.length, at: list[list.length - 1].at });
  // a setting changed back
  const sets = new Map<string, Stored[]>();
  for (const e of ev) if (e.k === 'setting') (sets.get(e.key) ?? sets.set(e.key, []).get(e.key)!).push(e);
  for (const [key, list] of sets) add({ id: `setting:${key}`, kind: 'setting', a: key, count: list.length, at: list[list.length - 1].at });
  return out.sort((x, y) => y.at - x.at).slice(0, 6);
}

/** "Forget" on a learned rule: it stays gone (its moments are kept, but never add up to it again). */
export function dismissRule(id: string) { const l = read(); if (!l.dismissed.includes(id)) l.dismissed.push(id); write(l); }

/** The rules as the Coach reads them (English), or '' when there are none. */
export function learnedBlock(name: (exerciseId: string) => string, mealLabel: (mealId: string) => string, now = Date.now()): string {
  const rules = learnedRules(now);
  if (!rules.length) return '';
  const line = (r: Rule) => r.kind === 'move' ? `They moved "${r.a}" to ${mealLabel(r.b!)} ${r.count}× after it was logged elsewhere (logged without a meal, it belongs in ${mealLabel(r.b!)}).`
    : r.kind === 'swap' ? `They swapped ${name(r.a)} for ${name(r.b!)} ${r.count}× (they prefer ${name(r.b!)}).`
    : r.kind === 'avoid' ? `They took back ${r.count} planned days that had ${name(r.a)} (they don't want it in planned days).`
    : `They changed the setting ${r.a} back ${r.count}× after you changed it (they want it changed only when they ask plainly).`;
  return `LEARNED (from what they kept, undid and corrected):\n${rules.map((r) => `- ${line(r)}`).join('\n')}`;
}
