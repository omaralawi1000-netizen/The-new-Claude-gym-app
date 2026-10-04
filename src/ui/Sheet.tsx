import { AnimatePresence, animate, motion, useMotionValue, usePresence, useReducedMotion, useTransform } from 'motion/react';
import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { EngageContext, Mirror, mirrorProgress, mirrorStage, trackDepth } from './engage';
import { Veil, mirrorVeil } from './Veil';
import { availableHeight, dropKeyboard, kb } from './keyboard';

/** Stack-position z-index for the current overlay: a later overlay is always above an earlier one. */
export const OverlayZ = createContext<number | null>(null);
export const useOverlayZ = (fallback: number) => useContext(OverlayZ) ?? fallback;
import { Icon } from './Icon';
import { useUI } from '../state/ui';
import { useSwipeDown } from './swipe';

import { SMOOTH, SURFACE, SURFACE_EXIT, TAP } from './motion';
// older names for the motion language (ui/motion.ts)
export const SPRING = SURFACE;
export const SOFT = SMOOTH;
export const SNAP = TAP;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const EXIT_SPRING = SURFACE_EXIT;

/**
 * Bottom sheet: swipe down from anywhere (when its list is at the top) or flick to dismiss; interruptible; keyboard-aware.
 *
 * Everything that has to move with it is driven by ONE progress number (`e`, see engage.ts): the sheet's own position,
 * the page behind it stepping back (scale + corners), the dim/blur over that page and the orb. Opening, a finger drag,
 * a flick and the exit are all just that number changing, so nothing can drift out of step.
 */
export function Sheet({ children, onClose, tall, label, foot, z: zProp = 60, nested }: { children: ReactNode; onClose: () => void; tall?: boolean; label: string; foot?: ReactNode; z?: number; /** a sheet rendered inside another overlay's component (e.g. the workout's exercise menu) */ nested?: boolean }) {
  const z = useOverlayZ(zProp) + (nested ? 5 : 0);
  const ctxZ = useContext(OverlayZ);
  const count = useUI((u) => u.overlays.length);
  // a sheet with another overlay above it steps back, like a stacked card (and only the top one answers Escape)
  const behind = !nested && ctxZ !== null && (ctxZ - 60) / 10 < count - 1;
  const reduce = useReducedMotion();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const behindRef = useRef(behind); behindRef.current = behind;
  const dist = useRef((typeof window !== 'undefined' ? window.innerHeight : 900) + 40); // how far it travels to be fully off screen
  const p = useMotionValue(0);   // opening progress (a spring)
  const y = useMotionValue(0);   // the finger
  const bs = useMotionValue(0);  // stepped back behind another sheet
  const shift = useTransform([p, y, bs], ([pp, yy, b]: number[]) => (1 - pp) * dist.current + yy - 6 * b);
  // the keyboard lifts the sheet as part of its transform (not its `bottom`), so riding the keyboard never re-lays it out
  const transform = useTransform([shift, bs, kb], ([sh, b, k]: number[]) => `translate3d(0, ${sh - k}px, 0) scale(${1 - 0.06 * b})`);
  const e = useTransform([p, y], ([pp, yy]: number[]) => clamp01(pp - Math.max(0, yy) / dist.current));
  const engage = useMemo(() => ({ e, shift }), [e, shift]);
  const room = useTransform(kb, availableHeight); // what the keyboard leaves free: the sheet lifts and fits as it opens
  useEffect(() => trackDepth(id, e), [id, e]);
  const swipeV = useRef(0); // px/s the finger had when it let go
  useSwipeDown(ref, y, (v) => { swipeV.current = v ?? 0; onClose(); }, { enabled: !behind });
  // High refresh rate: the same spring, also handed to the browser for the sheet, its dim and the page behind, so they are
  // drawn at the screen's full rate (see mirrorSpring). A finger or a sheet stacking on top hands control straight back.
  const scrimRef = useRef<HTMLDivElement>(null);
  const mirror = useRef<Mirror | null>(null); if (!mirror.current) mirror.current = new Mirror();
  const runMirror = (p0: number, p1: number, sp: typeof SURFACE, vel: number) => {
    const m = mirror.current!; m.cancel();
    if (reduce) return;
    const b = bs.get();
    const k = kb.get();
    m.add(mirrorProgress(ref.current, p0, p1, sp, vel, (pp) => ({ transform: `translate3d(0, ${(1 - pp) * dist.current - k}px, 0) scale(${1 - 0.06 * b})` })));
    m.add(...mirrorVeil(scrimRef.current, p0, p1, sp, vel), mirrorStage(id, p0, p1, sp, vel));
  };
  useEffect(() => {
    const stop = () => mirror.current!.cancel();
    const a = y.on('change', stop), b = bs.on('change', stop), c = kb.on('change', stop); // the keyboard moving hands it back to the script too
    return () => { a(); b(); c(); stop(); };
    // eslint-disable-next-line
  }, []);
  // measure the real height once it is laid out (the travel distance only has to be "off screen", so a short sheet
  // does not fly further than it needs to), and keep it right if the content grows
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => { dist.current = el.offsetHeight + 40; };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // started before the first paint, so the browser-run half is already going while the sheet's content finishes setting up
  useLayoutEffect(() => {
    const c = animate(p, 1, reduce ? { duration: 0.01 } : SPRING);
    // A popup opens without the keyboard, as on iOS: a field that asked for focus is let go before the first paint, so the
    // sheet arrives calmly; tapping a field then brings the keyboard and the sheet rises to meet it.
    const f = document.activeElement as HTMLElement | null;
    if (f && ref.current?.contains(f) && /^(INPUT|TEXTAREA)$/.test(f.tagName)) f.blur();
    runMirror(0, 1, SPRING, 0);
    return () => c.stop();
    // eslint-disable-next-line
  }, []);
  useEffect(() => { const c = animate(bs, behind ? 1 : 0, reduce ? { duration: 0.01 } : SPRING); return () => c.stop(); }, [behind]); // eslint-disable-line
  // leaving: whatever the finger left behind becomes progress, and the exit spring carries on at the finger's speed
  const [present, safeToRemove] = usePresence();
  const leaving = useRef(false);
  useEffect(() => {
    if (present || leaving.current) return;
    leaving.current = true;
    if (ref.current?.contains(document.activeElement)) dropKeyboard(EXIT_SPRING); // the keyboard goes down with it, not after it
    const vy = swipeV.current || y.getVelocity();
    p.set(e.get()); y.set(0);
    runMirror(p.get(), 0, EXIT_SPRING, -vy / dist.current);
    const c = animate(p, 0, reduce ? { duration: 0.01 } : { ...EXIT_SPRING, velocity: -vy / dist.current });
    c.then(() => safeToRemove?.());
    // eslint-disable-next-line
  }, [present]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !behindRef.current) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <EngageContext.Provider value={engage}>
      <Veil e={e} z={z - 1} onClick={onClose} elRef={scrimRef} />
      <motion.div
        ref={ref}
        className={`sheet ${tall ? 'tall' : ''}`}
        style={{ zIndex: z, transformOrigin: '50% 0%', transform, maxHeight: room, ...(tall ? { height: room } : {}) }}
        role="dialog" aria-modal="true" aria-label={label}
      >
        <div className="sheet-grab" />
        {children}
        {foot && <div className="sheet-foot">{foot}</div>}
      </motion.div>
    </EngageContext.Provider>
  );
}

export function SheetHead({ title, sub, onClose, right, back }: { title: ReactNode; sub?: ReactNode; onClose?: () => void; right?: ReactNode; back?: boolean }) {
  return (
    <div className="sheet-head">
      <AnimatePresence initial={false}>
        {back && onClose && (
          <motion.button key="back" className="icon-btn flat" onClick={onClose} aria-label="Back" style={{ overflow: 'hidden', flex: 'none' }}
            initial={{ opacity: 0, width: 0, marginRight: -10 }} animate={{ opacity: 1, width: 40, marginRight: 0 }} exit={{ opacity: 0, width: 0, marginRight: -10 }} transition={SURFACE}>
            <Icon name="chevL" />
          </motion.button>
        )}
      </AnimatePresence>
      <div className="grow">
        <div className="display display-sm trunc">{title}</div>
        {sub && <div className="small t2 trunc" style={{ marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
      {!back && onClose && <button className="icon-btn flat" onClick={onClose} aria-label="Close"><Icon name="close" /></button>}
    </div>
  );
}

export { AnimatePresence, motion };
