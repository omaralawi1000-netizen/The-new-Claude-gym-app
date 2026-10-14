import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react';
import { animate, motionValue, useMotionValue, usePresence, useReducedMotion, type MotionValue } from 'motion/react';
import { highRefresh, mirrorSpring, springSamples } from './motion';

/**
 * One number ties a popup to everything that has to move with it. `e` is how far the popup is open (0 = gone,
 * 1 = fully up) and already includes the finger while it is being dragged. The page behind it (scale, corners),
 * its dim/blur and the orb all read this same value in the same animation frame, so they can never drift apart.
 * `shift` is how far the popup's own box is currently displaced (px), so a slot inside it can work out where it
 * will rest.
 */
export interface Engage { e: MotionValue<number>; shift?: MotionValue<number> }
export const EngageContext = createContext<Engage | null>(null);
export const useEngageContext = () => useContext(EngageContext);
/** Which overlay this is (set by Overlays.tsx): its id, and whether it opens as a page inside the sheet below it. Lives here
 * (not in Sheet.tsx) so the orb can tell which pop-up a slot belongs to without importing the sheet. */
export const OverlayMeta = createContext<{ id: string; page: boolean } | null>(null);

// ── the page behind popups ─────────────────────────────────────

const open = new Map<string, MotionValue<number>>();
/** 0 = page at rest, 1 = page stepped back behind a fully open popup. */
export const stageDepth = motionValue(0);
/** How many dims lie over the page: each open popup's progress, added up (a sheet on a sheet: 1 + the top one's progress). */
export const stageLayers = motionValue(0);
function recompute() { let m = 0, sum = 0; for (const v of open.values()) { const x = v.get(); m = Math.max(m, x); sum += Math.min(1, Math.max(0, x)); } stageDepth.set(m); stageLayers.set(sum); }
export function trackDepth(id: string, e: MotionValue<number>) {
  open.set(id, e);
  const off = e.on('change', recompute);
  recompute();
  return () => { off(); open.delete(id); recompute(); };
}

// ── full-screen surfaces that hide the page completely (the live workout) ──
// While one is fully up, the page behind is still a stack of frosted cards over a moving colour field that the GPU would
// redraw every frame for nothing — measured, it was most of the drawing cost while scrolling the workout. So the page fades
// to opacity 0 over the last few percent of the cover's progress (invisible: the cover is already over it). Chrome doesn't
// paint a page at opacity 0 at all, though, so closing has to paint all of it again first: see `warmStage`.
const covers = new Map<string, MotionValue<number>>();
export const stageCover = motionValue(0);
let warm = false;
function recomputeCover() { let m = 0; for (const v of covers.values()) m = Math.max(m, v.get()); stageCover.set(warm ? Math.min(m, 0.984) : m); }
/**
 * A finger is on a cover's close button: the page behind is drawn again now, still unseen under the cover, so it is ready
 * when the cover starts to move. Painting the whole page inside the tap held the close's first frame back (at 4× CPU about
 * 90 ms from tap to first frame, 10-45 ms warmed). Only the page's opacity changes: just under 0.985, it is still "covered"
 * for everything else (nothing re-renders).
 */
export function warmStage(on: boolean) { if (warm === on) return; warm = on; recomputeCover(); }
export function trackCover(id: string, e: MotionValue<number>) {
  covers.set(id, e);
  const off = e.on('change', recomputeCover);
  recomputeCover();
  return () => { off(); covers.delete(id); recomputeCover(); };
}

// ── for overlays that are not sheets (voice composer, onboarding) ──

export const ENGAGE_SPRING = { type: 'spring', stiffness: (2 * Math.PI / 0.45) ** 2, damping: (4 * Math.PI) / 0.45, mass: 1, restDelta: 0.002 } as const; // Apple's default spring (0.5 s, no bounce), as the sheets

/** Open progress for a full-screen overlay: eases 0 → 1 when it appears and back to 0 when it leaves (it stays mounted until then). */
export function useEngage(mirror?: (p0: number, p1: number, sp: typeof ENGAGE_SPRING) => (Animation | null)[]): MotionValue<number> {
  const e = useMotionValue(0);
  const reduce = useReducedMotion();
  const [present, safeToRemove] = usePresence();
  const m = useRef<Mirror | null>(null); if (!m.current) m.current = new Mirror();
  // started before the first paint, and (optionally) handed to the browser too, so it is drawn at the screen's full rate
  useLayoutEffect(() => {
    const c = animate(e, 1, reduce ? { duration: 0.01 } : ENGAGE_SPRING);
    if (mirror && !reduce) m.current!.add(...mirror(0, 1, ENGAGE_SPRING));
    return () => { c.stop(); m.current!.cancel(); };
    // eslint-disable-next-line
  }, []);
  useEffect(() => {
    if (present) return;
    m.current!.cancel();
    if (mirror && !reduce) m.current!.add(...mirror(e.get(), 0, ENGAGE_SPRING));
    animate(e, 0, reduce ? { duration: 0.01 } : { ...ENGAGE_SPRING, restDelta: 0.004 }).then(() => safeToRemove?.());
    // eslint-disable-next-line
  }, [present]);
  return e;
}

// ── high refresh rate: the popup's whole motion run by the browser ─────────────────────────────

/**
 * Play one stretch of a popup's progress (p0 → p1, a spring with a start velocity in progress units per second) as a
 * browser-run animation on an element, so it is drawn at the screen's full rate even where script animation is capped at
 * 60 fps. `at(p)` is the element's keyframe at progress p; `breaks` are progress values where a piecewise style bends
 * (the dim reaches full strength at 0.6). Returns null when it can't (or shouldn't) run — the script spring still runs
 * either way and is what you see then.
 */
export function mirrorProgress(el: Element | null | undefined, p0: number, p1: number, sp: { stiffness: number; damping: number; mass?: number }, velocity: number, at: (p: number) => Keyframe, breaks: number[] = [], perFrame = false): Animation | null {
  const span = p1 - p0;
  if (!el || Math.abs(span) < 0.02) return null;
  const v0 = Math.max(-40, Math.min(40, velocity / span));
  // perFrame: a keyframe for every 1/60 s of the spring, each at(p) as it is (so a position at(p) rounds to whole screen
  // pixels stays on them), instead of the spring as an easing between two keyframes, which passes every fraction between
  if (perFrame) {
    if (!(el as HTMLElement).animate || !highRefresh()) return null;
    const { xs } = springSamples(sp, v0, true), n = xs.length - 1;
    try { return (el as HTMLElement).animate(xs.map((x, i) => ({ ...at(p0 + span * x), offset: i / n })), { duration: (n * 1000) / 60, easing: 'linear', fill: 'none' }); } catch { return null; }
  }
  const frames: Keyframe[] = [{ ...at(p0), offset: 0 }];
  for (const b of breaks) { const x = (b - p0) / span; if (x > 0.001 && x < 0.999) frames.push({ ...at(b), offset: x }); }
  frames.sort((a, b) => (a.offset as number) - (b.offset as number));
  frames.push({ ...at(p1), offset: 1 });
  return mirrorSpring(el, frames, sp, v0);
}

let satCache = -1;
/** The status bar's height in px (var(--sat)), measured once. */
export function satPx(): number {
  if (satCache >= 0) return satCache;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;top:0;left:0;width:0;height:var(--sat);visibility:hidden;pointer-events:none';
  (document.querySelector('.app') ?? document.body).appendChild(d);
  satCache = d.offsetHeight; d.remove();
  return satCache;
}
/** The page's content's transform at depth v (used by useStageDepth in App.tsx): it sinks back to 95 %, from the middle. */
export const contentTransform = (v: number) => `scale(${(1 - 0.05 * v).toFixed(5)})`;

/** Mirror the page's content behind (it sinks back) — only when this popup alone sets its depth. */
export function mirrorStage(id: string, p0: number, p1: number, sp: { stiffness: number; damping: number; mass?: number }, velocity: number, map?: ((p: number) => number) & { knee?: number }): Animation | null {
  for (const [k, v] of open) if (k !== id && v.get() > 0.001) return null;
  const m = map ?? ((p: number) => p); // map: the popup's progress → how far the page recedes (how much of a sheet is in view)
  return mirrorProgress(document.querySelector('.stage-content'), p0, p1, sp, velocity, (p) => ({ transform: contentTransform(clamp01(m(p))) }), map?.knee != null ? [map.knee] : []);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** The dim behind a popup at progress p (full strength from 0.6). */
export const scrimFrame = (p: number): Keyframe => ({ opacity: clamp01(p / 0.6) });

/** A set of browser-run animations that all stop the moment anything interrupts them (a finger, another popup). */
export class Mirror {
  private anims: Animation[] = [];
  add(...a: (Animation | null)[]) { for (const x of a) if (x) this.anims.push(x); }
  cancel() { for (const a of this.anims) { try { a.cancel(); } catch { /* ignore */ } } this.anims = []; }
  /** Settles when every browser-run part has finished (or been cancelled). */
  settled(): Promise<void> { return Promise.all(this.anims.map((a) => a.finished.catch(() => null))).then(() => undefined); }
}
