/**
 * Watches the food log (lib/eating.ts): a moment after something is logged (and once, 3 s after the app opens), a heavy
 * day — that evening, or found the next morning in a log for yesterday — is noticed and decided ONCE: the main brain
 * judges it (lib/verdict.ts: thinking hard, within hard limits; no brain or no trim allowed → no cut and no paid call),
 * and that is said in one toast with Undo. Corrections follow: an entry deleted or fixed so the day is no longer heavy
 * takes the catch-up away; a smaller day shrinks it. Notices on Quiet: recorded, nothing said or changed; Off: nothing.
 * A day a little over (200 kcal and 10 %, up to heavy) gets one plain line instead, once that day (`sayOver`).
 * The first time this runs on a phone, what is already there is marked as seen, silently (no pop-ups about the past).
 */
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { tNow } from './i18n';
import { fmtNum } from './units';
import { dayKey, diffDays } from './dates';
import { heavyMode, isDecided, overToday, reconcileCatchUps } from './eating';
import { applyVerdict, clampVerdict, defaultVerdict, trimAllowed, trimLimits, verdictLine, verdictPrompt, VERDICT_SCHEMA, type Verdict } from './verdict';
import type { CatchUp } from './types';

let timer = 0;
let installed = false;
const deciding = new Set<string>();
const fmt = () => { const lang = useStore.getState().settings.language; return (n: number) => fmtNum(n, lang, 0); };

/** The brain's verdict for one heavy day (null: no trim allowed, no room, no brain, or it failed → no cut). */
async function askBrain(c: CatchUp, today: string): Promise<Verdict | null> {
  const st0 = useStore.getState();
  // (a trim isn't allowed for them, or there is no room for one: nothing to judge, no paid call)
  if (trimAllowed(st0, today) || trimLimits(st0, c, today).perDay < 50) return null;
  try {
    const [{ brainFor }, { thinkJson }] = await Promise.all([import('./agentTurn'), import('./brain')]);
    const b = brainFor({ big: true, surface: 'coach' });
    if (!b) return null;
    const st = useStore.getState();
    const { system, prompt } = verdictPrompt(st, c, today, st.settings.language);
    // (a judgement that changes their targets: the deepest thinking)
    const raw = await thinkJson({ ...b, sol: b.sol ? { ...b.sol, effort: 'high' } : undefined }, { system, prompt, schema: VERDICT_SCHEMA, name: 'heavy_day' });
    const v = clampVerdict(raw, trimLimits(st, c, today));
    // (cut down by the limits: the pop-up says what really happens, not what it asked for)
    return v && { plan: v.plan, perDay: v.perDay, days: v.days, why: v.why, line: v.clamped ? verdictLine(c, v, today, tNow, fmt()) : v.line };
  } catch { return null; }
}

/** The plan within the limits as they are NOW; its line rebuilt from the app's words when the limits changed it, or when
 *  the day itself changed (the brain's line would carry the old number). */
function fit(c: CatchUp, v: Verdict, today: string, stale = false): Verdict {
  const st = useStore.getState();
  // (no cut: its own words, unless the day changed under it)
  if (!v.perDay) return stale ? { ...defaultVerdict(c, today, tNow, fmt()), why: v.why } : v;
  const w = trimAllowed(st, today) ? null : clampVerdict(v, trimLimits(st, c, today));
  if (!w || !w.perDay) return { ...defaultVerdict(c, today, tNow, fmt()), why: v.why };
  return { plan: w.plan, perDay: w.perDay, days: w.days, why: w.why, line: w.clamped || stale ? verdictLine(c, w, today, tNow, fmt()) : w.line };
}

async function decide(c: CatchUp, today: string) {
  if (deciding.has(c.id)) return;
  deciding.add(c.id);
  try {
    const st = useStore.getState();
    // Quiet: recorded, nothing said, nothing changed
    if (heavyMode(st.settings) === 'quiet') {
      st.setCatchUps((st.catchUps ?? []).map((x) => (x.id === c.id ? { ...x, decided: true, perDay: 0, days: [] } : x)));
      return;
    }
    const v0 = (await askBrain(c, today)) ?? defaultVerdict(c, today, tNow, fmt());
    const now = useStore.getState();
    const cur = (now.catchUps ?? []).find((x) => x.id === c.id);
    // taken back, gone (the log was fixed), decided elsewhere, or notices switched off while it was thinking
    if (!cur || cur.off || isDecided(cur) || heavyMode(now.settings) !== 'on') return;
    // (always fitted to things as they are now: the day may have changed, another heavy day may have been decided, or an
    // age or a health note learned while it was thinking; a changed day also gets a line without the old number)
    const v = fit(cur, v0, today, cur.at !== c.at);
    const next = { ...applyVerdict(cur, v, today), told: true, decided: true };
    now.setCatchUps((now.catchUps ?? []).map((x) => (x.id === c.id ? next : x)));
    useUI.getState().toast(v.line, {
      actionLabel: tNow('Undo'), duration: 9000,
      onAction: () => { const s = useStore.getState(); s.setCatchUps((s.catchUps ?? []).map((x) => (x.id === c.id ? { ...x, off: true } : x))); },
    });
  } finally { deciding.delete(c.id); }
}

/** A little over today's target: one plain line, once that day (notices On only; Quiet and Off say nothing). How often it
 *  happened this week sets how it is said: once is fine, a pattern is named. */
function sayOver(today: string) {
  const st = useStore.getState();
  if (heavyMode(st.settings) !== 'on' || st.marks?.overSaid === today) return;
  const o = overToday(st, today);
  if (!o) return;
  st.patch((s) => ({ marks: { ...s.marks, overSaid: today } }));
  const n = fmt()(o.over);
  // (a heavy day this week counts too: "fine now and then" the day after a big one would not be true)
  const k = o.days + o.heavy;
  const line = k <= 1 ? tNow('{n} kcal over today. Fine now and then.', { n })
    : k === 2 ? tNow('{n} kcal over today, {k} of the last 7 days.', { n, k })
    : tNow('{n} kcal over today, {k} of the last 7 days. That adds up.', { n, k });
  useUI.getState().toast(line, { duration: 6000 });
}

export function checkEating(now = Date.now()) {
  const st = useStore.getState();
  if (st.demo) return;
  const today = dayKey(now, st.settings.dayStartHour);
  const r = reconcileCatchUps(st, now);
  // the first time on this phone: what is there already is seen, silently (no pop-ups about the past, no paid calls)
  const first = !st.marks?.heavySeen;
  if (first) st.patch((s) => ({ marks: { ...s.marks, heavySeen: today } }));
  if (r) {
    let list = r.list;
    if (first) { const fresh = new Set(r.fresh.map((f) => f.id)); list = list.map((c) => (fresh.has(c.id) ? { ...c, decided: true, told: true, coachTold: true } : c)); }
    // a smaller day: a trim running on it shrinks to fit (no new decision, no pop-up)
    for (const ch of r.changed) {
      if (!ch.perDay || !isDecided(ch)) continue;
      const left = ch.days.filter((x) => x >= today);
      const v = fit(ch, { plan: 'trim', perDay: ch.perDay, days: left.length, line: ch.line ?? '', why: ch.why ?? '' }, today, true);
      if (v.perDay === ch.perDay && v.days === left.length) continue;
      const shrunk: CatchUp = { ...ch, perDay: v.perDay, days: [...ch.days.filter((x) => x < today), ...left.slice(0, v.days)], line: v.line };
      list = list.map((c) => (c.id === ch.id ? shrunk : c));
    }
    useStore.getState().setCatchUps(list);
    // the log was fixed and the day isn't heavy any more: a cut that was running is gone, said once
    if (!first && r.gone.some((c) => c.told && c.perDay > 0 && c.days.some((x) => x >= today))) useUI.getState().toast(tNow('Your normal calorie target is back'), { tone: 'ok' });
  }
  if (first) return;
  sayOver(today);
  // anything noticed but not decided yet (also one left over when the app closed while it was thinking)
  for (const c of useStore.getState().catchUps ?? []) if (!c.off && !isDecided(c) && diffDays(today, c.date) <= 3) void decide(c, today);
}

export function installEatingWatch() {
  if (installed) return;
  installed = true;
  let last = useStore.getState().entries;
  let goals = useStore.getState().settings.goals.kcal;
  useStore.subscribe((s) => {
    if (s.entries === last && s.settings.goals.kcal === goals) return;
    last = s.entries; goals = s.settings.goals.kcal;
    clearTimeout(timer);
    // (a meal is often several items in a row: judged once they are in)
    timer = window.setTimeout(() => checkEating(), 1500);
  });
  // (once a moment after opening: a day logged on another device, or a decision the app closed in the middle of)
  timer = window.setTimeout(() => checkEating(), 3000);
}
