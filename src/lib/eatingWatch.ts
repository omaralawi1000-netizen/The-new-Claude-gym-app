/**
 * Watches the food log (lib/eating.ts): a moment after something is logged, a heavy day (that evening, or found the next
 * morning in a log for yesterday) is noticed, the main brain decides what to do about it (lib/verdict.ts: thinking hard,
 * within hard limits; a gentle default without one), and that is said once in a toast with Undo.
 */
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { tNow } from './i18n';
import { fmtNum } from './units';
import { dayKey, diffDays } from './dates';
import { reconcileCatchUps } from './eating';
import { applyVerdict, clampVerdict, defaultVerdict, trimAllowed, trimLimits, verdictLine, verdictPrompt, VERDICT_SCHEMA, type Verdict } from './verdict';
import type { CatchUp } from './types';

let timer = 0;
let installed = false;
const deciding = new Set<string>();

/** The brain's verdict for one heavy day (null: no brain, or it failed → the caller uses the gentle default). */
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
    if (!v) return null;
    const fmt = (n: number) => fmtNum(n, st.settings.language, 0);
    return v.clamped ? { ...v, line: verdictLine(c, v, today, tNow, fmt) } : v;
  } catch { return null; }
}

async function decide(c: CatchUp, today: string) {
  if (deciding.has(c.id)) return;
  deciding.add(c.id);
  try {
    const st = useStore.getState();
    const lang = st.settings.language;
    const fmt = (n: number) => fmtNum(n, lang, 0);
    const v = (await askBrain(c, today)) ?? defaultVerdict(c, today, tNow, fmt);
    const now = useStore.getState();
    const cur = (now.catchUps ?? []).find((x) => x.id === c.id);
    if (!cur || cur.off) return; // taken back while it was thinking
    const next = applyVerdict({ ...cur, told: true }, v, today);
    now.setCatchUps((now.catchUps ?? []).map((x) => (x.id === c.id ? next : x)));
    useUI.getState().toast(v.line, {
      actionLabel: tNow('Undo'), duration: 9000,
      onAction: () => { const s = useStore.getState(); s.setCatchUps((s.catchUps ?? []).map((x) => (x.id === c.id ? { ...x, off: true } : x))); },
    });
  } finally { deciding.delete(c.id); }
}

export function checkEating(now = Date.now()) {
  const st = useStore.getState();
  const today = dayKey(now, st.settings.dayStartHour);
  const r = reconcileCatchUps(st, now);
  if (r) {
    // recorded at once with no cut yet (so it is never noticed twice), then decided
    const fresh = new Set(r.fresh.map((f) => f.id));
    st.setCatchUps(r.list.map((c) => (fresh.has(c.id) ? { ...c, perDay: 0, days: [], line: undefined, why: undefined } : c)));
  }
  // anything noticed but not decided yet (also one left over when the app closed while it was thinking)
  for (const c of useStore.getState().catchUps ?? []) if (!c.off && !c.line && diffDays(today, c.date) <= 3) void decide(c, today);
}

export function installEatingWatch() {
  if (installed) return;
  installed = true;
  let last = useStore.getState().entries;
  useStore.subscribe((s) => {
    if (s.entries === last) return;
    last = s.entries;
    clearTimeout(timer);
    // (a meal is often several items in a row: judged once they are in)
    timer = window.setTimeout(() => checkEating(), 1500);
  });
}
