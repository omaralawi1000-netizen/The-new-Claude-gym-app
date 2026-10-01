import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { useUI, type Tab, buzz } from '../state/ui';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { SphereSlot, orbPress, orbTap } from './Sphere';
import { useT } from '../lib/i18n';
import { SOFT } from './Sheet';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { apple, springCurve } from './motion';
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

const PILL = { hide: { y: 18, scale: 0.95 }, show: { y: 0, scale: 1 } };
const FADE = { hide: { opacity: 0 }, show: { opacity: 1 } };

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
      initial="hide" animate={workoutOpen ? 'hide' : 'show'} exit="hide" variants={PILL} transition={SOFT}
      onClick={() => { buzz(); push('workout', { origin: 'pill' }); }}
      aria-label={t('Resume workout')}
    >
      {/* The pill's surface is a separate layer; the workout window opens from its rectangle (data-wk). It fades on its OWN
          layers: fading the button (their parent) switches the frosted blur off until the fade ends — the "clear bar that
          suddenly frosts" flicker. */}
      <motion.span data-wk="pill" className="glass" variants={FADE} transition={SOFT} style={{ position: 'absolute', inset: 0, borderRadius: 28 }} />
      <motion.span variants={FADE} transition={SOFT} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        <span className="pulse-dot" style={{ position: 'relative', ...(paused ? { animation: 'none', background: 'var(--tx3)' } : {}) }} />
        <span className="grow" style={{ textAlign: 'left', minWidth: 0, position: 'relative' }}>
          <span className="trunc" style={{ display: 'block', fontWeight: 650, fontSize: 14 }}>{name || t('Workout')}</span>
          <span className="small t2 num" style={{ display: 'block' }}><PillStatus /></span>
        </span>
        <span className="icon-btn acc" style={{ width: 40, height: 40, position: 'relative' }}><Icon name="play" size={18} /></span>
      </motion.span>
    </motion.button>
  );
}

/** Tapping the tab you are already on brings its screen back to the top (as on iOS). */
function scrollActiveTabToTop() {
  (document.querySelector('.stage .tab-pane .screen') as HTMLElement | null)?.scrollTo({ top: 0, behavior: 'smooth' });
}

/** The selector's motion: Apple's smooth spring, a little slower than a tap so it glides rather than jumps. */
const LENS = apple(0.55, 0.08);

export function TabBar() {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);
  const push = useUI((s) => s.push);
  // derived booleans, not the overlay list: opening a sheet must not re-render (and re-measure) the tab bar
  const hidden = useUI((s) => s.overlays.some((o) => o.type === 'workout' || o.type === 'voice' || o.type === 'onboarding'));
  const t = useT();
  const nav = useRef<HTMLElement>(null);
  useLens(nav, tab);
  const go = (id: Tab) => { buzz(4); if (useUI.getState().tab === id) scrollActiveTabToTop(); else setTab(id); };
  return (
    <LayoutGroup>
      {/* hides by sliding only: fading it would switch its frosted blur off until the fade ends (a clear bar that then frosts) */}
      <motion.div className="tabbar-wrap" style={{ flexDirection: 'column', alignItems: 'center' }} initial={false}
        animate={{ transform: hidden ? 'translateY(115%)' : 'translateY(0%)', transitionEnd: hidden ? undefined : { transform: 'none' } }} transition={SOFT}>
        <AnimatePresence>{<LivePill />}</AnimatePresence>
        <nav className="tabbar glass" aria-label="Main" ref={nav}>
          <span className="tab-lens" aria-hidden><i /></span>
          {TABS.slice(0, 2).map((x) => <TabBtn key={x.id} {...x} on={tab === x.id} onClick={() => go(x.id)} label={t(x.label)} />)}
          <div className="sphere-slot" style={{ position: 'relative' }}>
            <SphereSlot id="tab" priority={0} style={{ position: 'absolute', inset: -6 }} />
            <button className="press" aria-label={t('Dictate')} style={{ position: 'absolute', inset: -4, borderRadius: 999 }}
              onPointerDown={() => orbPress(true)} onPointerUp={() => orbPress(false)} onPointerCancel={() => orbPress(false)} onPointerLeave={() => orbPress(false)}
              onClick={() => { buzz(10); orbTap(1); if (!useUI.getState().overlays.some((o) => o.type === 'voice')) push('voice', { mode: tab === 'train' ? 'workout' : 'food' }); }} />
          </div>
          {TABS.slice(2).map((x) => <TabBtn key={x.id} {...x} on={tab === x.id} onClick={() => go(x.id)} label={t(x.label)} />)}
        </nav>
      </motion.div>
    </LayoutGroup>
  );
}

/**
 * The selector: one drop of glass behind the active tab that glides to the next one, like iOS's Liquid Glass tab bar.
 * It is a browser-run animation (transform only), so it is drawn by the compositor at the screen's full refresh rate and
 * never waits for the page; the spring curve is Apple's (sampled into linear()). While it travels the drop stretches a
 * little along its path and swells, then settles back into a capsule — more stretch for a longer trip. Tapping again
 * mid-flight carries on from wherever it is.
 */
function useLens(nav: React.RefObject<HTMLElement | null>, tab: Tab) {
  const reduce = useReducedMotion();
  const placed = useRef(false);
  useLayoutEffect(() => {
    const n = nav.current; if (!n) return;
    const lens = n.querySelector('.tab-lens') as HTMLElement, drop = lens.firstElementChild as HTMLElement;
    const target = () => { const b = n.querySelector('.tab.on') as HTMLElement | null; return b ? { x: b.offsetLeft, w: b.offsetWidth } : null; };
    const to = target(); if (!to) return;
    lens.style.width = `${to.w}px`;
    const end = `translate3d(${to.x}px, 0, 0)`;
    if (!placed.current || reduce || typeof lens.animate !== 'function') { lens.style.transform = end; placed.current = true; return; }
    // where the drop is right now, even mid-flight
    const from = new DOMMatrixReadOnly(getComputedStyle(lens).transform === 'none' ? undefined : getComputedStyle(lens).transform).m41;
    lens.getAnimations().forEach((a) => a.cancel());
    drop.getAnimations().forEach((a) => a.cancel());
    lens.style.transform = end;
    const dist = Math.abs(to.x - from);
    if (dist < 1) return;
    const c = springCurve(LENS);
    lens.animate([{ transform: `translate3d(${from}px, 0, 0)` }, { transform: end }], { duration: c.duration, easing: c.easing });
    const k = Math.min(0.26, 0.07 + dist / (to.w * 9)); // a longer trip stretches it more
    drop.animate(
      [{ transform: 'scale(1, 1)' }, { transform: `scale(${1 + k}, ${1 + k * 0.28})`, offset: 0.32 }, { transform: 'scale(1, 1)' }],
      { duration: Math.round(c.duration * 0.85), easing: 'cubic-bezier(.33, 0, .25, 1)' },
    );
    drop.animate([{ opacity: 1 }, { opacity: 0.82, offset: 0.35 }, { opacity: 1 }], { duration: Math.round(c.duration * 0.8), easing: 'ease-in-out' });
  }, [tab]); // eslint-disable-line
  // stay put under the right tab when the bar changes size (rotation, font load, language)
  useEffect(() => {
    const n = nav.current; if (!n) return;
    const ro = new ResizeObserver(() => {
      const lens = n.querySelector('.tab-lens') as HTMLElement | null, b = n.querySelector('.tab.on') as HTMLElement | null;
      if (!lens || !b || lens.getAnimations().length) return;
      lens.style.width = `${b.offsetWidth}px`; lens.style.transform = `translate3d(${b.offsetLeft}px, 0, 0)`;
    });
    ro.observe(n);
    return () => ro.disconnect();
  }, [nav]);
}

function TabBtn({ icon, label, on, onClick }: { id: Tab; icon: any; label: string; on: boolean; onClick: () => void }) {
  return (
    <button className={`tab press ${on ? 'on' : ''}`} onClick={onClick} aria-current={on ? 'page' : undefined} aria-label={label}>
      <Icon name={icon} size={22} sw={on ? 2 : 1.6} />
      <span className="lab">{label}</span>
    </button>
  );
}
