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
  // Today's card scrolled down to the tab bar runs on under it: the window takes only the part above the bar (where the bar
  // sits at rest), so it never lies over the bar. Grown from the whole card, its first frame laid the card's hidden end over
  // the bar, and its bottom edge then cut across the bar while the bar slid away, as if the bar were over the window.
  let b = t + h;
  if (kind === 'hero') { const top = dockTop(); if (top !== null && top < b && top - t >= 60) b = top; }
  return { l, t, w, b, r: Math.min(r, (b - t) / 2, w / 2), bg: el, fg: el.nextElementSibling as HTMLElement | null };
}
/** The tab bar's top edge where it sits at rest (its layout, not where its slide has it this frame); null when there is none. */
export function dockTop(): number | null {
  const nav = document.querySelector<HTMLElement>('.tabbar');
  if (!nav || !nav.offsetParent) return null;
  let t = 0;
  for (let n: HTMLElement | null = nav; n; n = n.offsetParent as HTMLElement | null) t += n.offsetTop;
  return t;
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
