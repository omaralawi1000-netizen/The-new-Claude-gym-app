import { useEffect, useLayoutEffect, useRef } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react';
import { useStore } from './state/store';
import { useUI } from './state/ui';
import { TabBar } from './ui/TabBar';
import { Toaster } from './ui/Toaster';
import { SphereStage } from './ui/Sphere';
import { Overlays } from './screens/Overlays';
import { TodayScreen } from './screens/Today';
import { TrainScreen } from './screens/Train';
import { FoodScreen } from './screens/Food';
import { ProgressScreen } from './screens/Progress';
import { useT } from './lib/i18n';
import { registerSW } from './pwa';

const ORDER = ['today', 'train', 'food', 'progress'] as const;

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  const motionPref = useStore((s) => s.settings.motion);
  const lang = useStore((s) => s.settings.language);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0a0c' : '#e4e8eb');
      try { localStorage.setItem('aven.theme', theme); } catch { /* ignore */ }
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => { root.dataset.motion = motionPref === 'system' ? (mq.matches ? 'reduce' : 'system') : motionPref; };
    apply(); mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [motionPref]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
}

/** Keep sheets above the on-screen keyboard (iOS overlays it; Android resizes the viewport). */
function useKeyboard() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const upd = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', kb > 80 ? `${kb}px` : '0px');
    };
    vv.addEventListener('resize', upd); vv.addEventListener('scroll', upd); upd();
    return () => { vv.removeEventListener('resize', upd); vv.removeEventListener('scroll', upd); };
  }, []);
}

export function App() {
  useTheme();
  useKeyboard();
  const t = useT();
  const tab = useUI((s) => s.tab);
  const onboarded = useStore((s) => s.settings.onboarded);
  const push = useUI((s) => s.push);
  const prev = useRef(tab);
  const dir = ORDER.indexOf(tab) - ORDER.indexOf(prev.current);
  useEffect(() => { prev.current = tab; }, [tab]);
  const asked = useRef(false);
  useEffect(() => {
    if (!onboarded && !asked.current) { asked.current = true; push('onboarding', {}); }
  }, [onboarded, push]);
  useEffect(() => { registerSW(); }, []);
  const screen = tab === 'today' ? <TodayScreen /> : tab === 'train' ? <TrainScreen /> : tab === 'food' ? <FoodScreen /> : <ProgressScreen />;
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="app">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={tab} style={{ position: 'absolute', inset: 0 }} initial={{ opacity: 0, x: dir * 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 18 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
              {screen}
            </motion.div>
          </AnimatePresence>
          <TabBar />
          <Overlays />
          <Toaster />
          <SphereStage />
          <UpdateBanner />
        </div>
      </LayoutGroup>
      <span className="sr" aria-live="polite">{t('Aven')}</span>
    </MotionConfig>
  );
}

function UpdateBanner() {
  const t = useT();
  const active = useStore((s) => s.active);
  const ready = useUI((s) => (s as any).updateReady as boolean | undefined);
  if (!ready || active) return null;
  return (
    <div className="glass" style={{ position: 'fixed', left: 14, right: 14, top: 'calc(var(--sat) + 10px)', zIndex: 95, borderRadius: 18, padding: '10px 12px 10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className="grow small">{t('A new version of Aven is ready.')}</span>
      <button className="btn sm primary press" onClick={() => (window as any).__avenApplyUpdate?.()}>{t('Update')}</button>
    </div>
  );
}
