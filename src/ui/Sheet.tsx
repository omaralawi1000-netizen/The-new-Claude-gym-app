import { AnimatePresence, animate, motion, useMotionValue, usePresence, useReducedMotion, useTransform } from 'motion/react';
import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { EngageContext, trackDepth } from './engage';

/** Stack-position z-index for the current overlay: a later overlay is always above an earlier one. */
export const OverlayZ = createContext<number | null>(null);
export const useOverlayZ = (fallback: number) => useContext(OverlayZ) ?? fallback;
import { Icon } from './Icon';
import { useUI } from '../state/ui';
import { useSwipeDown } from './swipe';

export const SPRING = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } as const;
export const SOFT = { type: 'spring', stiffness: 300, damping: 32, mass: 0.9 } as const;
export const SNAP = { type: 'spring', stiffness: 600, damping: 42, mass: 0.7 } as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const EXIT_SPRING = { type: 'spring', stiffness: 260, damping: 34, mass: 0.9, restDelta: 0.002 } as const;

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
  const transform = useTransform([shift, bs], ([sh, b]: number[]) => `translate3d(0, ${sh}px, 0) scale(${1 - 0.06 * b})`);
  const e = useTransform([p, y], ([pp, yy]: number[]) => clamp01(pp - Math.max(0, yy) / dist.current));
  const engage = useMemo(() => ({ e, shift }), [e, shift]);
  useEffect(() => trackDepth(id, e), [id, e]);
  const swipeV = useRef(0); // px/s the finger had when it let go
  useSwipeDown(ref, y, (v) => { swipeV.current = v ?? 0; onClose(); }, { enabled: !behind });
  // measure the real height once it is laid out (the travel distance only has to be "off screen", so a short sheet
  // does not fly further than it needs to), and keep it right if the content grows
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => { dist.current = el.offsetHeight + 40; };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = animate(p, 1, reduce ? { duration: 0.01 } : SPRING);
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
    const vy = swipeV.current || y.getVelocity();
    p.set(e.get()); y.set(0);
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
      <motion.div className="scrim" style={{ zIndex: z - 1, opacity: e }} onClick={onClose} />
      <motion.div
        ref={ref}
        className={`sheet ${tall ? 'tall' : ''}`}
        style={{ zIndex: z, bottom: 'var(--kb, 0px)', transformOrigin: '50% 0%', transform }}
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
            initial={{ opacity: 0, width: 0, marginRight: -10 }} animate={{ opacity: 1, width: 40, marginRight: 0 }} exit={{ opacity: 0, width: 0, marginRight: -10 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
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

/**
 * Card-to-detail container. The source row renders <Plate layoutId=…/>; this renders the same layoutId as a
 * full sheet, so the surface itself grows out of the row. Content is a separate layer that crossfades in,
 * so text is never stretched by the shape animation.
 */
export function MorphSheet({ children, onClose, layoutId, label, tall = true, z: zProp = 70, foot }: { children: ReactNode; onClose: () => void; layoutId: string; label: string; tall?: boolean; z?: number; foot?: ReactNode }) {
  const z = useOverlayZ(zProp);
  const reduce = useReducedMotion();
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const p = useMotionValue(0); // the surface itself grows out of its row (shared layout); this follows it for the page behind and the dim
  const e = useTransform([p, y], ([pp, yy]: number[]) => clamp01(pp - Math.max(0, yy) / (typeof window !== 'undefined' ? window.innerHeight : 900)));
  const engage = useMemo(() => ({ e, shift: y }), [e, y]);
  useEffect(() => trackDepth(id, e), [id, e]);
  useSwipeDown(wrap, y, onClose);
  useEffect(() => {
    const c = animate(p, 1, reduce ? { duration: 0.01 } : SOFT);
    return () => c.stop();
    // eslint-disable-next-line
  }, []);
  const [present, safeToRemove] = usePresence();
  const leaving = useRef(false);
  useEffect(() => {
    if (present || leaving.current) return;
    leaving.current = true;
    p.set(e.get()); animate(y, 0, SOFT);
    animate(p, 0, reduce ? { duration: 0.01 } : { ...SOFT, restDelta: 0.004 }).then(() => safeToRemove?.());
    // eslint-disable-next-line
  }, [present]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <EngageContext.Provider value={engage}>
      <motion.div className="scrim" style={{ zIndex: z - 1, opacity: e }} onClick={onClose} />
      <motion.div ref={wrap} style={{ y, position: 'fixed', left: 0, right: 0, bottom: 'var(--kb, 0px)', zIndex: z, pointerEvents: 'none', height: tall ? 'calc(100dvh - var(--sat) - 46px)' : undefined, maxHeight: 'calc(100dvh - var(--sat) - 46px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <motion.div
          layoutId={layoutId} role="dialog" aria-modal="true" aria-label={label}
          className="morph-sheet"
          style={{ pointerEvents: 'auto', borderRadius: '34px 34px 0 0', boxShadow: 'inset 0 1px 0 var(--hl), inset 0 0 0 1px var(--line), var(--sh-f)', display: 'flex', flexDirection: 'column', minHeight: 0, flex: tall ? 1 : undefined, maxHeight: '100%', overflow: 'hidden' }}
          transition={reduce ? { duration: 0.01 } : SOFT}
        >
          <motion.div
            style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
            initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.1, duration: 0.22 } }} exit={{ opacity: 0, transition: { duration: 0.08 } }}
          >
            <div className="sheet-grab" />
            {children}
            {foot && <div className="sheet-foot">{foot}</div>}
          </motion.div>
        </motion.div>
      </motion.div>
    </EngageContext.Provider>
  );
}

/** The resting surface of a morph source (list row / card). Put it behind the row's content. */
export function Plate({ layoutId, radius = 14, flat, style }: { layoutId: string; radius?: number; flat?: boolean; style?: React.CSSProperties }) {
  return <motion.div layoutId={layoutId} transition={SOFT} style={{ position: 'absolute', inset: 0, background: flat ? 'var(--s1)' : 'var(--s2)', borderRadius: radius, boxShadow: flat ? 'none' : 'inset 0 1px 0 var(--hl), inset 0 0 0 1px var(--line)', ...style }} />;
}
