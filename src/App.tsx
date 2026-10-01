import { Activity, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LayoutGroup, MotionConfig, animate, useReducedMotion } from 'motion/react';
import { useStore } from './state/store';
import { useUI, type Tab } from './state/ui';
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
import { dayKey } from './lib/dates';
import { defaultMealId } from './lib/derive';
import { VisitContext } from './ui/visit';
import { stageDepth } from './ui/engage';

const ORDER = ['today', 'train', 'food', 'progress'] as const;
const SCREENS: Record<Tab, () => React.ReactNode> = { today: TodayScreen, train: TrainScreen, food: FoodScreen, progress: ProgressScreen };
const PAGE_EASE = [0.22, 1, 0.36, 1] as const;

/** One tab screen. It stays mounted while hidden (React <Activity>), so coming back to a tab costs no rebuild. */
const Page = memo(function Page({ id, on, dir, visit, onLeft }: { id: Tab; on: boolean; dir: number; visit: number; onLeft: (id: Tab) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const Screen = SCREENS[id];
  const content = useMemo(() => <Screen />, [Screen]);
  const dirRef = useRef(dir); dirRef.current = dir;
  const onRef = useRef(on); onRef.current = on;
  // Same slide + fade (+ blur on the way out) as before. Animated with `transform`/`opacity`/`filter` through the
  // native animation engine, so it runs on the compositor and stays smooth while React works on the main thread.
  // Layout effects re-run whenever <Activity> reveals the screen, so this also fires on every visit.
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    if (on && visit === 0) { Object.assign(el.style, { opacity: '1', transform: 'translateX(0px)', filter: 'blur(0px)' }); return; }
    const still = reduce || document.documentElement.dataset.motion === 'reduce';
    const d = still ? 0 : dirRef.current * 36;
    const a = on
      ? animate(el, { opacity: [0, 1], transform: [`translateX(${d}px)`, 'translateX(0px)'], filter: ['blur(0px)', 'blur(0px)'] }, { duration: 0.38, ease: PAGE_EASE })
      : animate(el, { opacity: 0, transform: `translateX(${-d}px)`, filter: still ? 'blur(0px)' : 'blur(10px)' }, { duration: 0.38, ease: PAGE_EASE });
    // every visit starts at the top, as before (reset once it is out of sight, not while it is being revealed)
    if (!on) a.then(() => { if (!onRef.current) { el.querySelector('.screen')?.scrollTo(0, 0); onLeft(id); } });
    return () => a.stop();
  }, [on, visit]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <VisitContext.Provider value={visit}>
      <div
        ref={ref} data-hue={id} inert={!on} aria-hidden={!on || undefined}
        style={{ position: 'absolute', inset: 0, zIndex: on ? 1 : 0, pointerEvents: on ? 'auto' : 'none', opacity: 0 }}
      >
        {content}
      </div>
    </VisitContext.Provider>
  );
});

function TabPages({ tab, dir }: { tab: Tab; dir: number }) {
  // the leaving screen stays visible for its exit; the others are hidden but alive
  const [st, setSt] = useState({ tab, leaving: [] as Tab[], visits: { today: 0, train: 0, food: 0, progress: 0 } as Record<Tab, number> });
  if (st.tab !== tab) setSt((s) => ({ tab, leaving: [...s.leaving.filter((x) => x !== tab && x !== s.tab), s.tab], visits: { ...s.visits, [tab]: s.visits[tab] + 1 } }));
  const onLeft = useCallback((id: Tab) => setSt((s) => (s.leaving.includes(id) && s.tab !== id ? { ...s, leaving: s.leaving.filter((x) => x !== id) } : s)), []);
  return (
    <>
      {ORDER.map((id) => {
        const on = id === st.tab, out = st.leaving.includes(id);
        return (
          <Activity key={id} mode={on || out ? 'visible' : 'hidden'}>
            <Page id={id} on={on} dir={on || out ? dir : 0} visit={st.visits[id]} onLeft={onLeft} />
          </Activity>
        );
      })}
    </>
  );
}

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
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#05060b' : '#e9ecf4');
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

/**
 * iOS-style: while a popup is up the page behind steps back (smaller, rounded corners, over black). It is driven by
 * the popups' own progress (stageDepth, see engage.ts) in the same animation frame, so it follows the popup exactly:
 * opening, under the finger while it is dragged, and as it leaves.
 */
function useStageDepth(app: React.RefObject<HTMLDivElement | null>, stage: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const apply = (v: number) => {
      const a = app.current, st = stage.current; if (!a || !st) return;
      const root = document.documentElement.dataset;
      const still = root.motion === 'reduce' || (root.motion !== 'full' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (v < 0.0005 || still) { st.style.transform = ''; st.style.borderRadius = ''; a.style.background = ''; return; }
      st.style.transform = `translateY(calc((var(--sat) + 10px) * ${v})) scale(${1 - 0.08 * v})`;
      st.style.borderRadius = `${28 * v}px`;
      a.style.background = '#000';
    };
    apply(stageDepth.get());
    return stageDepth.on('change', apply);
  }, [app, stage]);
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
  const appRef = useRef<HTMLDivElement>(null), stageRef = useRef<HTMLDivElement>(null);
  useStageDepth(appRef, stageRef);
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
  // home-screen shortcuts (manifest "shortcuts"): ./?do=food | voice | photo | wrestling
  useEffect(() => {
    const doIt = new URLSearchParams(location.search).get('do');
    if (!doIt || !useStore.getState().settings.onboarded) return;
    try { history.replaceState(history.state, '', location.pathname); } catch { /* ignore */ }
    const st = useStore.getState();
    const today = dayKey(Date.now(), st.settings.dayStartHour);
    const mealId = defaultMealId(st.settings.meals);
    setTimeout(() => {
      if (doIt === 'food') push('foodSearch', { date: today, mealId });
      else if (doIt === 'voice') push('voice', { mode: 'food', date: today, mealId });
      else if (doIt === 'photo') push('photoFood', { date: today, mealId });
      else if (doIt === 'wrestling') push('activity', { kind: 'wrestling' });
    }, 350);
  }, [push]);
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="app" data-hue={tab} ref={appRef}>
          <div className="stage" ref={stageRef}>
          <div className="aurora" aria-hidden><i /><i /><i /></div>
          <TabPages tab={tab} dir={dir} />
          <TabBar />
          </div>
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
