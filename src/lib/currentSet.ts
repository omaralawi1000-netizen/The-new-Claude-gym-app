import type { SessionExercise, SetRecord, WorkoutSession } from './types';

// Which exercise the Focus view shows (for the bar, and for "8 reps" said while you look at it). A tiny store of its own:
// only its listeners re-render when a page turns.
let shownId: string | null = null;
const shownSubs = new Set<() => void>();
export const setFocusPage = (id: string | null) => { if (id === shownId) return; shownId = id; shownSubs.forEach((f) => f()); };
export const focusPageNow = () => shownId;
export const subscribeFocusPage = (f: () => void) => { shownSubs.add(f); return () => { shownSubs.delete(f); }; };

/** The first set of an exercise not yet ticked (warm-ups only when asked for, or included), with its label. */
function openSetOf(se: SessionExercise, warm: 'skip' | 'only' | 'include'): { se: SessionExercise; set: SetRecord; label: string } | null {
  let n = 0;
  for (const set of se.sets) {
    if (set.type === 'working') n++;
    if (set.done) continue;
    if (warm === 'include' || (warm === 'only') === (set.type === 'warmup')) return { se, set, label: set.type === 'warmup' ? 'W' : String(n) };
  }
  return null;
}

/**
 * The set you are on: the Focus page you are looking at; else, right after a superset exercise, the partner whose turn
 * comes; else the exercise you last ticked a set in, while it has sets left; else the first open set in the list. The
 * workout's highlight, the bar, the Coach and voice all use this one answer. `warm`: the Coach passes over unticked
 * warm-ups (many people skip them) unless a warm-up is what was said.
 */
export function currentSetOf(a: WorkoutSession | null | undefined, warm: 'skip' | 'only' | 'include' = 'include', page = true): { se: SessionExercise; set: SetRecord; label: string } | null {
  if (!a) return null;
  const order: SessionExercise[] = [];
  const shown = page && shownId ? a.exercises.find((e) => e.id === shownId) : undefined;
  if (shown) order.push(shown);
  let last: SessionExercise | undefined; let at = -1;
  for (const se of a.exercises) for (const s of se.sets) if (s.done && (s.completedAt ?? 0) > at) { at = s.completedAt ?? 0; last = se; }
  if (last) {
    if (last.supersetGroup) {
      const group = a.exercises.filter((e) => e.supersetGroup === last!.supersetGroup);
      const i = group.findIndex((e) => e.id === last!.id);
      for (let k = 1; k <= group.length; k++) order.push(group[(i + k) % group.length]);
    }
    order.push(last);
  }
  order.push(...a.exercises);
  for (const se of order) { const x = openSetOf(se, warm); if (x) return x; }
  return null;
}

