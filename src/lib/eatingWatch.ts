/**
 * Watches the food log (lib/eating.ts): a moment after something is logged, a heavy day (that evening, or found the next
 * morning in a log for yesterday) gets its catch-up, said once in a toast with Undo.
 */
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { tNow } from './i18n';
import { fmtNum } from './units';
import { dayKey } from './dates';
import { catchUpWords, reconcileCatchUps } from './eating';

let timer = 0;
let installed = false;

export function checkEating(now = Date.now()) {
  const st = useStore.getState();
  const r = reconcileCatchUps(st, now);
  if (!r) return;
  const today = dayKey(now, st.settings.dayStartHour);
  const lang = st.settings.language;
  const list = r.list.map((c) => (r.fresh.some((f) => f.id === c.id) ? { ...c, told: true } : c));
  st.setCatchUps(list);
  const c = r.fresh[r.fresh.length - 1];
  if (!c) return;
  useUI.getState().toast(catchUpWords(c, today, tNow, (n) => fmtNum(n, lang, 0)), {
    actionLabel: tNow('Undo'), duration: 9000,
    onAction: () => { const s = useStore.getState(); s.setCatchUps((s.catchUps ?? []).map((x) => (x.id === c.id ? { ...x, off: true } : x))); },
  });
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
