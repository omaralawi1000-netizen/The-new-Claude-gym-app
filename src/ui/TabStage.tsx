import { Activity, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { animate } from 'motion/react';
import type { Tab } from '../state/ui';
import { VisitContext } from './visit';

const ORDER: Tab[] = ['today', 'train', 'food', 'progress'];
const EASE = [0.22, 1, 0.36, 1] as const;
const DUR = 0.38;

/**
 * The four tab screens, kept alive. Switching used to unmount the old screen and build the new one from scratch every
 * time (Progress: ~70 ms of work on a phone, right as the slide starts). Now each screen is built once — the others are
 * prepared in the background while the app is idle — and switching only plays the slide: the same fade, 36 px travel
 * and soft blur on the screen that leaves as before. A hidden screen is display:none inside <Activity>, so its timers and
 * effects are paused and it costs nothing while hidden; showing it again replays its blocks' rise-in (CSS animations
 * restart when an element is displayed again), exactly like a fresh mount looked. Scroll position is kept.
 */
export function TabStage({ tab, screens }: { tab: Tab; screens: Record<Tab, ComponentType> }) {
  const [mounted, setMounted] = useState<Tab[]>([tab]);
  const [leaving, setLeaving] = useState<Tab | null>(null);
  const [dir, setDir] = useState(0);
  const prev = useRef(tab);
  useLayoutEffect(() => {
    if (prev.current === tab) return;
    setDir(Math.sign(ORDER.indexOf(tab) - ORDER.indexOf(prev.current)));
    setLeaving(prev.current);
    prev.current = tab;
    setMounted((m) => (m.includes(tab) ? m : [...m, tab]));
  }, [tab]);
  // build the other screens in the background once the app has settled, so even the first visit only slides
  useEffect(() => {
    const ric = (window as any).requestIdleCallback as ((cb: () => void, o?: { timeout: number }) => number) | undefined;
    const go = () => setMounted((m) => [...m, ...ORDER.filter((k) => !m.includes(k))]);
    const id = ric ? ric(go, { timeout: 4000 }) : window.setTimeout(go, 2500);
    return () => { const cic = (window as any).cancelIdleCallback; if (ric && cic) cic(id); else clearTimeout(id); };
  }, []);
  return (
    <>
      {mounted.map((k) => (
        <TabPane key={k} active={k === tab} leaving={k === leaving} dir={dir} Screen={screens[k]} onLeft={() => setLeaving((l) => (l === k ? null : l))} />
      ))}
    </>
  );
}

function TabPane({ active, leaving, dir, Screen, onLeft }: { active: boolean; leaving: boolean; dir: number; Screen: ComponentType; onLeft: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const anim = useRef<{ stop: () => void } | null>(null);
  const first = useRef(true);
  const [visit, setVisit] = useState(0); // goes up each time the screen is shown again: rings/charts key on it and draw in again
  const visible = active || leaving;
  // the same element every render: switching tabs re-renders the tab stage, never the screens themselves (they update
  // from the store on their own); without this every switch re-rendered all four screens
  const content = useMemo(() => <Screen />, [Screen]);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const wasFirst = first.current; first.current = false;
    const reduced = document.documentElement.dataset.motion === 'reduce' || (document.documentElement.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (active) {
      anim.current?.stop();
      if (wasFirst && !dir) return; // the screen the app starts on: no entrance (as before)
      if (!wasFirst) setVisit((v) => v + 1);
      el.style.filter = 'none';
      anim.current = animate(el, { opacity: [Number(getComputedStyle(el).opacity) < 1 ? Number(getComputedStyle(el).opacity) : 0, 1], x: [dir * 36, 0] }, reduced ? { duration: 0.01 } : { duration: DUR, ease: EASE });
      return;
    }
    if (leaving) {
      anim.current?.stop();
      el.style.filter = 'blur(0px)';
      anim.current = animate(el, { opacity: 0, x: -dir * 36, filter: 'blur(10px)' }, reduced ? { duration: 0.01 } : { duration: DUR, ease: EASE });
      anim.current && (anim.current as any).then?.(() => { el.style.filter = 'none'; el.style.transform = 'none'; onLeft(); });
    }
    // eslint-disable-next-line
  }, [active, leaving]);
  return (
    <Activity mode={visible ? 'visible' : 'hidden'}>
      <div ref={ref} className="tab-pane" data-active={active || undefined} style={{ position: 'absolute', inset: 0, pointerEvents: active ? undefined : 'none' }}>
        <VisitContext.Provider value={visit}>{content}</VisitContext.Provider>
      </div>
    </Activity>
  );
}

/** Tapping the tab you are already on brings its screen back to the top (as on iOS). */
export function scrollActiveTabToTop() {
  const sc = document.querySelector('.tab-pane[data-active] .screen') as HTMLElement | null;
  sc?.scrollTo({ top: 0, behavior: 'smooth' });
}
