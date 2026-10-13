/**
 * Opening the minimised workout starts the very moment you tap, as closing does: the window (kept, parked off-screen) is set
 * moving on the compositor first, and only after that first frame has been drawn is the app told the workout is open. Telling
 * it re-renders the page behind, the dock and the window, and before, nothing moved until that was done (the beat after a
 * tap). The window registers itself here while it waits minimised (Active.tsx).
 */
let opener: (() => void) | null = null;
export function setWorkoutOpener(fn: () => void) {
  opener = fn;
  return () => { if (opener === fn) opener = null; };
}
/** Open the workout: `tell` updates the app (pushes the overlay); with a minimised window waiting, after its first frame. */
let telling = false;
export function resumeWorkout(tell: () => void) {
  if (telling) return; // a second tap before the app has been told: it is already opening
  const go = opener;
  if (!go) { tell(); return; }
  opener = null; telling = true;
  go();
  requestAnimationFrame(() => setTimeout(() => { telling = false; tell(); }, 0));
}
