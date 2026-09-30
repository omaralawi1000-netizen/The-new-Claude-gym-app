import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useUI, type Toast } from '../state/ui';
import { Icon } from './Icon';
import { useT } from '../lib/i18n';
import { SOFT } from './Sheet';

function ToastItem({ toast, index, total }: { toast: Toast; index: number; total: number }) {
  const dismiss = useUI((s) => s.dismissToast);
  const t = useT();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const paused = useRef(false);
  const left = useRef(toast.duration);
  const startedAt = useRef(0);
  const arm = () => { startedAt.current = Date.now(); timer.current = setTimeout(() => dismiss(toast.id), left.current); };
  useEffect(() => { if (index === 0) arm(); return () => clearTimeout(timer.current); /* eslint-disable-next-line */ }, [index === 0]);
  const pause = () => { if (paused.current) return; paused.current = true; clearTimeout(timer.current); left.current -= Date.now() - startedAt.current; };
  const resume = () => { if (!paused.current) return; paused.current = false; if (index === 0) arm(); };
  const depth = index; // 0 = newest, front
  return (
    <motion.div
      className="toast glass" role="status" layout
      initial={{ opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: depth > 2 ? 0 : 1 - depth * 0.25, y: -depth * 11, scale: 1 - depth * 0.05 }}
      exit={{ opacity: 0, y: 14, scale: 0.96, transition: { duration: 0.16 } }}
      transition={SOFT}
      style={{ zIndex: 100 - depth }}
      drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
      onDragStart={pause} onDragEnd={(_, i) => { if (i.offset.y > 30 || i.velocity.y > 400) dismiss(toast.id); else resume(); }}
      onPointerDown={pause} onPointerUp={resume} onPointerCancel={resume}
    >
      {toast.tone === 'ok' && <span style={{ color: 'var(--ok)', display: 'grid' }}><Icon name="check" size={18} sw={2.4} /></span>}
      {toast.tone === 'bad' && <span style={{ color: 'var(--bad)', display: 'grid' }}><Icon name="info" size={18} /></span>}
      <span className="grow">{toast.text}</span>
      {toast.actionLabel && (
        <button className="btn sm primary" style={{ minHeight: 32 }} onClick={() => { toast.onAction?.(); dismiss(toast.id); }}>
          {toast.actionLabel}
        </button>
      )}
      <span className="sr">{t('Dismiss')}</span>
      <span aria-hidden style={{ display: total > 0 ? 'none' : undefined }} />
    </motion.div>
  );
}

export function Toaster() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t, i) => <ToastItem key={t.id} toast={t} index={toasts.length - 1 - i} total={toasts.length} />)}
      </AnimatePresence>
    </div>
  );
}
