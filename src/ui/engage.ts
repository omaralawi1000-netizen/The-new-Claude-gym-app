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

// ── for overlays that are not sheets (voice composer, onboarding) ──

export const ENGAGE_SPRING = { type: 'spring', stiffness: 230, damping: 28, mass: 0.9, restDelta: 0.002 } as const;

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
