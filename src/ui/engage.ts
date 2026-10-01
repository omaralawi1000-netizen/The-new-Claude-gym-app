import { createContext, useContext, useEffect } from 'react';
import { animate, motionValue, useMotionValue, usePresence, useReducedMotion, type MotionValue } from 'motion/react';

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

export const ENGAGE_SPRING = { type: 'spring', stiffness: (2 * Math.PI / 0.5) ** 2, damping: (4 * Math.PI) / 0.5, mass: 1, restDelta: 0.002 } as const; // Apple's default spring (0.5 s, no bounce), as the sheets

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
