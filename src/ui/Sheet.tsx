import { AnimatePresence, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

/** Stack-position z-index for the current overlay: a later overlay is always above an earlier one. */
export const OverlayZ = createContext<number | null>(null);
export const useOverlayZ = (fallback: number) => useContext(OverlayZ) ?? fallback;
import { Icon } from './Icon';
import { useUI } from '../state/ui';
import { useSwipeDown } from './swipe';

export const SPRING = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } as const;
export const SOFT = { type: 'spring', stiffness: 300, damping: 32, mass: 0.9 } as const;
export const SNAP = { type: 'spring', stiffness: 600, damping: 42, mass: 0.7 } as const;

/** Bottom sheet: swipe down from anywhere (when its list is at the top) or flick to dismiss; interruptible; keyboard-aware. */
export function Sheet({ children, onClose, tall, label, foot, z: zProp = 60, nested }: { children: ReactNode; onClose: () => void; tall?: boolean; label: string; foot?: ReactNode; z?: number; /** a sheet rendered inside another overlay's component (e.g. the workout's exercise menu) */ nested?: boolean }) {
  const z = useOverlayZ(zProp) + (nested ? 5 : 0);
  const ctxZ = useContext(OverlayZ);
  const count = useUI((u) => u.overlays.length);
  // a sheet with another overlay above it steps back, like a stacked card (and only the top one answers Escape)
  const behind = !nested && ctxZ !== null && (ctxZ - 60) / 10 < count - 1;
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const behindRef = useRef(behind); behindRef.current = behind;
  const y = useMotionValue(0);
  useSwipeDown(ref, y, onClose, { enabled: !behind });
  const H = typeof window !== 'undefined' ? window.innerHeight : 900;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !behindRef.current) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <motion.div className="scrim" style={{ zIndex: z - 1 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.32 } }} transition={{ duration: 0.36 }} onClick={onClose} />
      <motion.div
        ref={ref}
        className={`sheet ${tall ? 'tall' : ''}`}
        style={{ zIndex: z, bottom: 'var(--kb, 0px)', transformOrigin: '50% 0%', y }}
        role="dialog" aria-modal="true" aria-label={label}
        initial={{ y: H }} animate={{ y: behind ? -6 : 0, scale: behind ? 0.94 : 1 }}
        // a swipe hands its speed to this spring (motion values keep their velocity), so the sheet keeps going and eases out
        exit={{ y: H, transition: reduce ? { duration: 0.01 } : { type: 'spring', stiffness: 260, damping: 34, mass: 0.9, restDelta: 1 } }}
        transition={reduce ? { duration: 0.01 } : SPRING}
      >
        <div className="sheet-grab" />
        {children}
        {foot && <div className="sheet-foot">{foot}</div>}
      </motion.div>
    </>
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
  const wrap = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  useSwipeDown(wrap, y, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <motion.div className="scrim" style={{ zIndex: z - 1 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} onClick={onClose} />
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
    </>
  );
}

/** The resting surface of a morph source (list row / card). Put it behind the row's content. */
export function Plate({ layoutId, radius = 14, flat, style }: { layoutId: string; radius?: number; flat?: boolean; style?: React.CSSProperties }) {
  return <motion.div layoutId={layoutId} transition={SOFT} style={{ position: 'absolute', inset: 0, background: flat ? 'var(--s1)' : 'var(--s2)', borderRadius: radius, boxShadow: flat ? 'none' : 'inset 0 1px 0 var(--hl), inset 0 0 0 1px var(--line)', ...style }} />;
}
