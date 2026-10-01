import { createContext, useContext, useEffect } from 'react';
import { animate, motionValue, useMotionValue, usePresence, useReducedMotion, type MotionValue } from 'motion/react';
import { mirrorSpring } from './motion';

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

// ── the page behind popups ─────────────────────────────────────

const open = new Map<string, MotionValue<number>>();
/** 0 = page at rest, 1 = page stepped back behind a fully open popup. */
export const stageDepth = motionValue(0);
function recompute() { let m = 0; for (const v of open.values()) m = Math.max(m, v.get()); stageDepth.set(m); }
export function trackDepth(id: string, e: MotionValue<number>) {
  open.set(id, e);
  const off = e.on('change', recompute);
  recompute();
  return () => { off(); open.delete(id); recompute(); };
}

// ── full-screen surfaces that hide the page completely (the live workout) ──
// While one is fully up, the page behind is still a stack of frosted cards over a moving colour field that the GPU would
// redraw every frame for nothing — measured, it was most of the drawing cost while scrolling the workout. So the page fades
// to opacity 0 over the last few percent of the cover's progress (invisible: the cover is already over it). Opacity, not
// visibility: its tiles stay rasterised, so it is back in the very first frame of a close or a drag.
const covers = new Map<string, MotionValue<number>>();
export const stageCover = motionValue(0);
function recomputeCover() { let m = 0; for (const v of covers.values()) m = Math.max(m, v.get()); stageCover.set(m); }
export function trackCover(id: string, e: MotionValue<number>) {
  covers.set(id, e);
  const off = e.on('change', recomputeCover);
  recomputeCover();
  return () => { off(); covers.delete(id); recomputeCover(); };
}

// ── for overlays that are not sheets (voice composer, onboarding) ──

export const ENGAGE_SPRING = { type: 'spring', stiffness: (2 * Math.PI / 0.45) ** 2, damping: (4 * Math.PI) / 0.45, mass: 1, restDelta: 0.002 } as const; // Apple's default spring (0.5 s, no bounce), as the sheets

/** Open progress for a full-screen overlay: eases 0 → 1 when it appears and back to 0 when it leaves (it stays mounted until then). */
export function useEngage(): MotionValue<number> {
  const e = useMotionValue(0);
  const reduce = useReducedMotion();
  const [present, safeToRemove] = usePresence();
  useEffect(() => {
    const c = animate(e, 1, reduce ? { duration: 0.01 } : ENGAGE_SPRING);
    return () => c.stop();
    // eslint-disable-next-line
  }, []);
  useEffect(() => {
    if (present) return;
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
export function mirrorProgress(el: Element | null | undefined, p0: number, p1: number, sp: { stiffness: number; damping: number; mass?: number }, velocity: number, at: (p: number) => Keyframe, breaks: number[] = []): Animation | null {
  const span = p1 - p0;
  if (!el || Math.abs(span) < 0.02) return null;
  const v0 = Math.max(-40, Math.min(40, velocity / span));
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
/** The page's own transform at depth v (must match useStageDepth in App.tsx). */
export const stageTransform = (v: number) => `translateY(${((satPx() + 10) * v).toFixed(2)}px) scale(${(1 - 0.08 * v).toFixed(5)})`;

/** Mirror the page behind (it steps back) — only when this popup alone sets its depth. */
export function mirrorStage(id: string, p0: number, p1: number, sp: { stiffness: number; damping: number; mass?: number }, velocity: number): Animation | null {
  for (const [k, v] of open) if (k !== id && v.get() > 0.001) return null;
  const st = document.querySelector('.stage');
  return mirrorProgress(st, p0, p1, sp, velocity, (p) => ({ transform: stageTransform(clamp01(p)) }));
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** The dim behind a popup at progress p (full strength from 0.6). */
export const scrimFrame = (p: number): Keyframe => ({ opacity: clamp01(p / 0.6) });

/** A set of browser-run animations that all stop the moment anything interrupts them (a finger, another popup). */
export class Mirror {
  private anims: Animation[] = [];
  add(...a: (Animation | null)[]) { for (const x of a) if (x) this.anims.push(x); }
  cancel() { for (const a of this.anims) { try { a.cancel(); } catch { /* ignore */ } } this.anims = []; }
}
