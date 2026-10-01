import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { useUI, type Tab, buzz } from '../state/ui';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { SphereSlot, orbGlide, orbPress, orbTap } from './Sphere';
import { useT } from '../lib/i18n';
import { SOFT } from './Sheet';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { apple } from './motion';
import { Lens, currentShift, slideFrom } from './lens';
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

/**
 * The dock's motion: calm Apple springs. The drop of glass leads with its front edge (quicker) and lets its back edge follow
 * (calmer), so it stretches like a liquid on the way and gathers back into a capsule; icons, labels and the orb glide on
 * the spring in between. All of it is browser-run (transform/opacity), drawn at the screen's full refresh rate.
 */
const LEAD = apple(0.42, 0.1);
const TRAIL = apple(0.62);
const DOCK = apple(0.52, 0.04);

export function TabBar() {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);
  const push = useUI((s) => s.push);
  // derived booleans, not the overlay list: opening a sheet must not re-render (and re-measure) the tab bar
  const hidden = useUI((s) => s.overlays.some((o) => o.type === 'workout' || o.type === 'voice' || o.type === 'onboarding'));
  const t = useT();
  const nav = useRef<HTMLElement>(null);
  useDock(nav, tab);
  const go = (id: Tab) => { buzz(4); if (useUI.getState().tab === id) scrollActiveTabToTop(); else setTab(id); };
  return (
    <LayoutGroup>
      {/* hides by sliding only: fading it would switch its frosted blur off until the fade ends (a clear bar that then frosts) */}
      <motion.div className="tabbar-wrap" style={{ flexDirection: 'column', alignItems: 'center' }} initial={false}
        animate={{ transform: hidden ? 'translateY(115%)' : 'translateY(0%)', transitionEnd: hidden ? undefined : { transform: 'none' } }} transition={SOFT}>
        <AnimatePresence>{<LivePill />}</AnimatePresence>
        <nav className="tabbar glass" aria-label="Main" ref={nav}>
          <span className="lens tab-lens" aria-hidden><i className="lens-l" /><i className="lens-r" /><i className="lens-m" /></span>
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
 * The first version's dock, done on the compositor: the tab you pick opens up and shows its name, the others and the orb
 * make room, and the drop of glass flows over to it, changing shape as it goes. The layout itself changes at once; every
 * piece is then slid from where it was drawn to its new place (FLIP), so nothing is laid out again while it moves.
 * Tapping again mid-flight carries on from wherever everything is.
 */
function useDock(nav: React.RefObject<HTMLElement | null>, tab: Tab) {
  const reduce = useReducedMotion();
  const lens = useRef<Lens | null>(null);
  const pos = useRef(new Map<Element, number>()); // where each icon / label rests, relative to the bar
  const measure = (n: HTMLElement) => {
    const base = n.getBoundingClientRect().left;
    const m = new Map<Element, number>();
    n.querySelectorAll('.tab svg, .tab .lab').forEach((el) => m.set(el, el.getBoundingClientRect().left - base));
    return m;
  };
  const lensBox = (n: HTMLElement) => {
    const b = n.querySelector('.tab.on') as HTMLElement | null;
    return b ? { l: b.offsetLeft, r: b.offsetLeft + b.offsetWidth } : null;
  };
  useLayoutEffect(() => {
    const n = nav.current; if (!n) return;
    if (!lens.current) lens.current = new Lens(n.querySelector('.tab-lens') as HTMLElement, () => 26);
    const box = lensBox(n);
    const first = pos.current.size === 0;
    if (first || reduce || typeof n.animate !== 'function') {
      if (box) lens.current.place(box);
      pos.current = measure(n);
      return;
    }
    // where every piece is drawn right now: its old resting place plus whatever slide it is in the middle of
    const drawn = new Map<Element, number>();
    for (const [el, x] of pos.current) if (el.isConnected) drawn.set(el, x + currentShift(el));
    n.querySelectorAll('.tab svg, .tab .lab').forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    // the label that is closing keeps its place next to its icon while it fades
    const leaving = [...n.querySelectorAll('.tab:not(.on) .lab')] as HTMLElement[];
    leaving.forEach((l) => { const icon = l.parentElement!.querySelector('svg') as SVGElement; l.style.left = `${icon.getBoundingClientRect().left - l.parentElement!.getBoundingClientRect().left + 28}px`; });
    const now = measure(n);
    n.querySelectorAll('.tab').forEach((btn) => {
      const icon = btn.querySelector('svg')!, lab = btn.querySelector('.lab') as HTMLElement;
      const was = drawn.get(icon), at = now.get(icon)!;
      const dx = was === undefined ? 0 : was - at;
      if (Math.abs(dx) > 0.5) slideFrom(icon, dx, DOCK);
      if (btn.classList.contains('on')) {
        // the name opens out of its icon: it travels with it and fades in a beat later
        slideFrom(lab, dx - 22, DOCK);
        lab.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 70, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' });
      } else if (wasShown(btn)) {
        // the name that is closing fades where it was drawn, travelling with its icon
        const shown = drawn.get(lab), rest = now.get(lab)!;
        slideFrom(lab, shown === undefined ? dx : shown - rest, DOCK);
        lab.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, easing: 'ease-out' });
      }
    });
    if (box) lens.current.glide(box, LEAD, TRAIL);
    orbGlide(DOCK);
    pos.current = now;
    for (const b of n.querySelectorAll('.tab')) (b as HTMLElement).dataset.was = b.classList.contains('on') ? '1' : '';
  }, [tab]); // eslint-disable-line
  // stay put under the right tab when the bar changes size (rotation, font load, language)
  useEffect(() => {
    const n = nav.current; if (!n) return;
    for (const b of n.querySelectorAll('.tab')) (b as HTMLElement).dataset.was = b.classList.contains('on') ? '1' : '';
    const ro = new ResizeObserver(() => {
      if (!lens.current || lens.current.moving) return;
      const box = lensBox(n); if (box) lens.current.place(box);
      pos.current = measure(n);
    });
    ro.observe(n);
    return () => ro.disconnect();
  }, [nav]);
}
const wasShown = (btn: Element) => (btn as HTMLElement).dataset.was === '1';

function TabBtn({ icon, label, on, onClick }: { id: Tab; icon: any; label: string; on: boolean; onClick: () => void }) {
  return (
    <button className={`tab press ${on ? 'on' : ''}`} onClick={onClick} aria-current={on ? 'page' : undefined} aria-label={label}>
      <Icon name={icon} size={22} sw={on ? 2 : 1.6} />
      <span className="lab">{label}</span>
    </button>
  );
}
