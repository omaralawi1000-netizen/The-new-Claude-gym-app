import { useEffect } from 'react';
import { useStore } from '../../state/store';
import { useUI } from '../../state/ui';
import { tNow } from '../../lib/i18n';
import { fmtTime } from '../../lib/dates';

// asked once per workout (also after the app is closed and opened again)
const KEY = 'aven.staleAsked';
const IDLE_MS = 6 * 3600_000;

/** When the workout was last touched: its newest ticked set, else its start. */
export function lastTouched(a: { startedAt: number; exercises: { sets: { completedAt?: number }[] }[] }): number {
  let at = a.startedAt;
  for (const e of a.exercises) for (const s of e.sets) if ((s.completedAt ?? 0) > at) at = s.completedAt!;
  return at;
}

/** A workout left running for hours (forgotten after the gym): finish it as of its last set, so its time is right. */
export function finishAsOfLastSet(): void {
  const st = useStore.getState();
  const a = st.active;
  if (!a) return;
  const end = lastTouched(a) + 60_000;
  const done = st.finishActive(undefined, end); // a pause counts only up to that end, not up to now
  if (!done) return;
  // the finish screen, as a finish from the workout shows it (it also covers Today changing its card behind it)
  useUI.getState().push('summary', { sessionId: done.id });
}

/**
 * Opening the app with a workout idle for more than 6 hours asks once: "Still training?" with Finish (saved as of the last
 * set) — or let the note pass, and it keeps running.
 */
export function useStaleWorkout() {
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      const a = useStore.getState().active;
      if (!a || Date.now() - lastTouched(a) < IDLE_MS) return;
      try { if (localStorage.getItem(KEY) === a.id) return; localStorage.setItem(KEY, a.id); } catch { /* still ask */ }
      const hasSets = a.exercises.some((e) => e.sets.some((s) => s.done));
      useUI.getState().toast(tNow('Still training? Your workout from {time} is open', { time: fmtTime(a.startedAt, useStore.getState().settings.language) }), {
        actionLabel: hasSets ? tNow('Finish') : tNow('Discard'), duration: 12000,
        onAction: () => { if (hasSets) finishAsOfLastSet(); else useStore.getState().discardActive(); },
      });
    };
    const id = setTimeout(check, 1800); // after the app has settled in
    document.addEventListener('visibilitychange', check);
    return () => { clearTimeout(id); document.removeEventListener('visibilitychange', check); };
  }, []);
}
