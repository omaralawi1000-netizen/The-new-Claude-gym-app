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
/** Which card the window grows out of on its next opening: Today's workout card, or the resume bar (none: it rises). */
type From = 'hero' | 'pill' | null;
let pendingFrom: From = null;
export function workoutFrom(f: From) { pendingFrom = f; }
export function takeWorkoutFrom(): From { const f = pendingFrom; pendingFrom = null; return f; }
/**
 * Where that card is on the screen (client px), as it is at rest: the resume bar is measured by its layout, not where its
 * own show/hide motion or the tab bar's slide has it this frame. Null when it isn't there or isn't fully on the screen.
 */
export type WkSource = { l: number; t: number; w: number; b: number; r: number; bg: HTMLElement; fg: HTMLElement | null };
/** `r` its corner radius; `bg` its surface (a layer of its own) and `fg` what is on it (the surface's next sibling), which
 * the window hides while it stands in for the card and hands back as it lands. */
export function wkSourceRect(kind: From): WkSource | null {
  if (!kind) return null;
  const el = document.querySelector<HTMLElement>(`[data-wk="${kind}"]`);
  if (!el) return null;
  let l: number, t: number;
  const w = el.offsetWidth, h = el.offsetHeight;
  if (kind === 'pill') {
    // offsets ignore transforms: summed up to the fixed dock, they are where the bar sits once it has slid back in
    l = 0; t = 0;
    for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) { l += n.offsetLeft; t += n.offsetTop; }
  } else {
    const r = el.getBoundingClientRect(); l = r.left; t = r.top;
  }
  if (w < 40 || h < 30 || t < 0 || t + h > window.innerHeight) return null;
  const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  return { l, t, w, b: t + h, r: Math.min(r, h / 2, w / 2), bg: el, fg: el.nextElementSibling as HTMLElement | null };
}
/** Open the workout: `tell` updates the app (pushes the overlay); with a minimised window waiting, after its first frame.
 * `from`: the card that was tapped, which the window grows out of. */
let telling = false;
export function resumeWorkout(tell: () => void, from: From = null) {
  if (telling) return; // a second tap before the app has been told: it is already opening
  pendingFrom = from;
  const go = opener;
  if (!go) { tell(); return; }
  opener = null; telling = true;
  go();
  requestAnimationFrame(() => setTimeout(() => { telling = false; tell(); }, 0));
}
