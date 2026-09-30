import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export const SPRING = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } as const;
export const SOFT = { type: 'spring', stiffness: 300, damping: 32, mass: 0.9 } as const;
export const SNAP = { type: 'spring', stiffness: 600, damping: 42, mass: 0.7 } as const;

/** Bottom sheet: drag the handle/header down (or flick) to dismiss; interruptible; keyboard-aware. */
export function Sheet({ children, onClose, tall, label, foot, z = 60 }: { children: ReactNode; onClose: () => void; tall?: boolean; label: string; foot?: ReactNode; z?: number }) {
  const controls = useDragControls();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <motion.div className="scrim" style={{ zIndex: z - 1 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} />
      <motion.div
        ref={ref}
        className={`sheet ${tall ? 'tall' : ''}`}
        style={{ zIndex: z, bottom: 'var(--kb, 0px)' }}
        role="dialog" aria-modal="true" aria-label={label}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={reduce ? { duration: 0.01 } : SPRING}
        drag="y" dragControls={controls} dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.03, bottom: 0.7 }}
        onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 650) onClose(); }}
      >
        <div className="sheet-grab" onPointerDown={(e) => controls.start(e)} />
        {children}
        {foot && <div className="sheet-foot">{foot}</div>}
      </motion.div>
    </>
  );
}

export function SheetHead({ title, sub, onClose, right, back }: { title: ReactNode; sub?: ReactNode; onClose?: () => void; right?: ReactNode; back?: boolean }) {
  return (
    <div className="sheet-head">
      {back && onClose && <button className="icon-btn flat" onClick={onClose} aria-label="Back"><Icon name="chevL" /></button>}
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
export function MorphSheet({ children, onClose, layoutId, label, tall = true, z = 70, foot }: { children: ReactNode; onClose: () => void; layoutId: string; label: string; tall?: boolean; z?: number; foot?: ReactNode }) {
  const controls = useDragControls();
  const reduce = useReducedMotion();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <motion.div className="scrim" style={{ zIndex: z - 1 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} onClick={onClose} />
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'var(--kb, 0px)', zIndex: z, pointerEvents: 'none', height: tall ? 'calc(100dvh - var(--sat) - 10px)' : undefined, maxHeight: 'calc(100dvh - var(--sat) - 10px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <motion.div
          layoutId={layoutId} role="dialog" aria-modal="true" aria-label={label}
          style={{ pointerEvents: 'auto', background: 'var(--s1)', borderRadius: '34px 34px 0 0', boxShadow: 'inset 0 1px 0 var(--hl), var(--sh-f)', display: 'flex', flexDirection: 'column', minHeight: 0, flex: tall ? 1 : undefined, maxHeight: '100%', overflow: 'hidden' }}
          transition={reduce ? { duration: 0.01 } : SOFT}
          drag="y" dragControls={controls} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.03, bottom: 0.7 }}
          onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 650) onClose(); }}
        >
          <motion.div
            style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
            initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.1, duration: 0.22 } }} exit={{ opacity: 0, transition: { duration: 0.08 } }}
          >
            <div className="sheet-grab" onPointerDown={(e) => controls.start(e)} />
            {children}
            {foot && <div className="sheet-foot">{foot}</div>}
          </motion.div>
        </motion.div>
      </div>
    </>
  );
}

/** The resting surface of a morph source (list row / card). Put it behind the row's content. */
export function Plate({ layoutId, radius = 14, flat, style }: { layoutId: string; radius?: number; flat?: boolean; style?: React.CSSProperties }) {
  return <motion.div layoutId={layoutId} transition={SOFT} style={{ position: 'absolute', inset: 0, background: flat ? 'var(--s1)' : 'var(--s2)', borderRadius: radius, boxShadow: flat ? 'none' : 'inset 0 1px 0 var(--hl), inset 0 0 0 1px var(--line)', ...style }} />;
}
