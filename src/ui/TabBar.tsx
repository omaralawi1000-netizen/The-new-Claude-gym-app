import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useUI, type Tab, buzz } from '../state/ui';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { SphereSlot } from './Sphere';
import { useT } from '../lib/i18n';
import { SOFT } from './Sheet';
import { useEffect, useState } from 'react';
import { elapsedMs } from '../lib/workout';
import { fmtDuration } from '../lib/dates';

const TABS: { id: Tab; icon: any; label: string }[] = [
  { id: 'today', icon: 'today', label: 'Today' },
  { id: 'train', icon: 'train', label: 'Train' },
  { id: 'food', icon: 'food', label: 'Food' },
  { id: 'progress', icon: 'progress', label: 'Progress' },
];

// only the text ticks: re-rendering the pill itself would make its layout animation re-measure twice a second
function PillStatus() {
  const active = useStore((s) => s.active);
  const t = useT();
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(i); }, []);
  if (!active) return null;
  const rest = active.rest && !active.pausedAt ? Math.max(0, Math.ceil((active.rest.endsAt - Date.now()) / 1000)) : 0;
  const total = active.exercises.reduce((n, e) => n + e.sets.length, 0);
  const done = active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  return <>{active.pausedAt ? t('Paused') : rest > 0 ? `${t('Rest')} ${fmtDuration(rest)}` : `${done}/${total}`} · {fmtDuration(elapsedMs(active) / 1000)}</>;
}

function LivePill() {
  const hasActive = useStore((s) => !!s.active);
  const name = useStore((s) => s.active?.name);
  const paused = useStore((s) => !!s.active?.pausedAt);
  const push = useUI((s) => s.push);
  const workoutOpen = useUI((s) => s.overlays.some((o) => o.type === 'workout'));
  const t = useT();
  const tab = useUI((u) => u.tab);
  // Today already shows the running workout in its big card, so the pill only appears on the other tabs
  if (!hasActive || tab === 'today') return null;
  return (
    <motion.button
      key="pill" layout className="press"
      style={{ position: 'relative', borderRadius: 999, height: 56, width: '100%', maxWidth: 420, display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px 0 18px', marginBottom: 10, pointerEvents: workoutOpen ? 'none' : 'auto' }}
      initial={{ opacity: 0, y: 20, scale: 0.94 }} animate={{ opacity: workoutOpen ? 0 : 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14, scale: 0.96 }} transition={SOFT}
      onClick={() => { buzz(); push('workout', { origin: 'pill' }); }}
      aria-label={t('Resume workout')}
    >
      {/* the pill's surface is a separate layer so the workout can grow out of it without stretching the text */}
      <motion.span layoutId="wk-pill" className="glass" transition={{ type: 'spring', stiffness: 260, damping: 30, mass: 0.9 }} style={{ position: 'absolute', inset: 0, borderRadius: 28 }} />
      <span className="pulse-dot" style={{ position: 'relative', ...(paused ? { animation: 'none', background: 'var(--tx3)' } : {}) }} />
      <span className="grow" style={{ textAlign: 'left', minWidth: 0, position: 'relative' }}>
        <span className="trunc" style={{ display: 'block', fontWeight: 650, fontSize: 14 }}>{name || t('Workout')}</span>
        <span className="small t2 num" style={{ display: 'block' }}><PillStatus /></span>
      </span>
      <span className="icon-btn acc" style={{ width: 40, height: 40, position: 'relative' }}><Icon name="play" size={18} /></span>
    </motion.button>
  );
}

export function TabBar() {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);
  const push = useUI((s) => s.push);
  // derived booleans, not the overlay list: opening a sheet must not re-render (and re-measure) the tab bar
  const hidden = useUI((s) => s.overlays.some((o) => o.type === 'workout' || o.type === 'voice' || o.type === 'onboarding'));
  const t = useT();
  return (
    <LayoutGroup>
      <motion.div className="tabbar-wrap" style={{ flexDirection: 'column', alignItems: 'center' }} animate={{ y: hidden ? 120 : 0, opacity: hidden ? 0 : 1 }} transition={SOFT}>
        <AnimatePresence>{<LivePill />}</AnimatePresence>
        <nav className="tabbar glass" aria-label="Main">
          {TABS.slice(0, 2).map((x) => <TabBtn key={x.id} {...x} on={tab === x.id} onClick={() => { buzz(4); setTab(x.id); }} label={t(x.label)} />)}
          <motion.div layout="position" transition={LAYOUT} className="sphere-slot" style={{ position: 'relative' }}>
            <SphereSlot id="tab" priority={0} style={{ position: 'absolute', inset: -6 }} />
            <button className="press" aria-label={t('Dictate')} style={{ position: 'absolute', inset: -4, borderRadius: 999 }}
              onClick={() => { buzz(10); if (!useUI.getState().overlays.some((o) => o.type === 'voice')) push('voice', { mode: tab === 'train' ? 'workout' : 'food' }); }} />
          </motion.div>
          {TABS.slice(2).map((x) => <TabBtn key={x.id} {...x} on={tab === x.id} onClick={() => { buzz(4); setTab(x.id); }} label={t(x.label)} />)}
        </nav>
      </motion.div>
    </LayoutGroup>
  );
}

const LAYOUT = { type: 'spring', stiffness: 460, damping: 34, mass: 0.8 } as const;
// the oval: a touch softer than the icons, so it visibly stretches toward the new tab and settles with a small give
const OVAL = { type: 'spring', stiffness: 360, damping: 26, mass: 0.85 } as const;

function TabBtn({ icon, label, on, onClick }: { id: Tab; icon: any; label: string; on: boolean; onClick: () => void }) {
  return (
    <motion.button layout="position" transition={LAYOUT} className={`tab press ${on ? 'on' : ''}`} onClick={onClick} aria-current={on ? 'page' : undefined} aria-label={label}>
      {on && <motion.span layoutId="tab-pip" className="tab-pip" transition={OVAL} style={{ borderRadius: 26 }} />}
      <motion.span layout="position" transition={LAYOUT} style={{ display: 'grid', position: 'relative' }}><Icon name={icon} size={22} sw={on ? 2 : 1.6} /></motion.span>
      <AnimatePresence initial={false} mode="popLayout">
        {on && (
          <motion.span key="lab" className="lab" initial={{ opacity: 0, x: -6, filter: 'blur(4px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)', transition: { delay: 0.06, duration: 0.32, ease: [0.22, 1, 0.36, 1] } }} exit={{ opacity: 0, filter: 'blur(4px)', transition: { duration: 0.12 } }}>{label}</motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
