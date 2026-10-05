import { AnimatePresence, animate, motion, useMotionValue, usePresence, useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import { createPortal } from 'react-dom';
import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EngageContext, Mirror, mirrorProgress, mirrorStage, trackDepth, type Engage } from './engage';
import { Veil, mirrorVeil } from './Veil';
import { availableHeight, dropKeyboard, kb, watchFocus } from './keyboard';

/** Stack-position z-index for the current overlay: a later overlay is always above an earlier one. */
export const OverlayZ = createContext<number | null>(null);
export const useOverlayZ = (fallback: number) => useContext(OverlayZ) ?? fallback;
/** Which overlay this is (set by Overlays.tsx): its id, and whether it opens as a page inside the sheet below it. */
export const OverlayMeta = createContext<{ id: string; page: boolean } | null>(null);
/** True inside an overlay shown as a page of the sheet below it: its close button becomes a Back arrow. */
export const useIsPage = () => !!useContext(OverlayMeta)?.page;

/** A sheet that pages can open inside: where they go, and what they share with it (the drag, the progress, the exit). */
interface Host { el: HTMLDivElement; y: MotionValue<number>; swipeV: { current: number }; engage: Engage; gone: Set<() => void> }
const hosts = new Map<string, Host>();
/** Overlays that sit together on one sheet: this one, the pages directly above it, and the sheet they open in. */
function group(ov: { id: string; page?: boolean }[], i: number) {
  let lo = i; while (lo > 0 && ov[lo].page) lo--;
  let hi = i; while (ov[hi + 1]?.page) hi++;
  return { lo, hi };
}
// Moving between pages, choreographed like Settings: the page you leave steps aside and fades quickly (it is gone before the
// next one shows, so there is never a double image); the next glides in on Apple's spring, and its blocks — title, then each
// card, field and row in turn — settle into place one after another (.page-rise in styles.css). Back plays it the other way.
// All of it is browser-run (Web Animations + CSS animations on transform/opacity), so it is drawn at the full refresh rate.
const PAGE_IN = springCurve(apple(0.55));
const PAGE_EASE_OUT = 'cubic-bezier(0.4, 0, 1, 1)';
const PAGE_DELAY = 100; // the outgoing page is ~80% faded by then
function pageOut(el: HTMLElement, dx: number) {
  return el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translate3d(${dx}px, 0, 0)` }], { duration: 140, easing: PAGE_EASE_OUT, fill: 'forwards' });
}
const riseTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
function rise(el: HTMLElement) {
  clearTimeout(riseTimers.get(el));
  el.classList.remove('page-rise'); void el.offsetWidth; // restart the blocks' animations
  el.classList.add('page-rise');
  riseTimers.set(el, setTimeout(() => el.classList.remove('page-rise'), 1200));
}
function pageIn(el: HTMLElement, dx: number) {
  el.style.setProperty('--title-dx', `${Math.sign(dx) * 14}px`); // the title drifts in from the side the page comes from
  rise(el);
  const a = el.animate([{ transform: `translate3d(${dx}px, 0, 0)` }, { transform: 'none' }], { duration: PAGE_IN.duration, easing: PAGE_IN.easing, delay: PAGE_DELAY, fill: 'backwards' });
  const b = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', delay: PAGE_DELAY, fill: 'backwards' });
  return [a, b];
}
/** Steps the content of a sheet (or page) aside while a page covers it, and back when that page goes. */
function useCovered(ref: React.RefObject<HTMLElement | null>, covered: boolean, reduce: boolean | null) {
  const prev = useRef(false); // never covered when it mounts; compared with the last value (not "first run") so an effect run twice changes nothing
  const anims = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    if (prev.current === covered) return;
    prev.current = covered;
    anims.current.forEach((a) => a.cancel()); anims.current = [];
    el.inert = covered;
    if (covered) {
      if (reduce) { el.style.visibility = 'hidden'; return; }
      const a = pageOut(el, -32);
      a.onfinish = () => { el.style.visibility = 'hidden'; };
      anims.current = [a];
    } else {
      el.style.visibility = '';
      if (reduce) return;
      anims.current = pageIn(el, -32);
    }
  }, [covered]); // eslint-disable-line
}
import { Icon } from './Icon';
import { mirrorOrb } from './Sphere';
import { useUI } from '../state/ui';
import { useSwipeDown } from './swipe';

import { SMOOTH, SURFACE, SURFACE_EXIT, TAP, apple, springCurve } from './motion';
// older names for the motion language (ui/motion.ts)
export const SPRING = SURFACE;
export const SOFT = SMOOTH;
export const SNAP = TAP;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const EXIT_SPRING = SURFACE_EXIT;

/**
 * Bottom sheet: swipe down from anywhere (when its list is at the top) or flick to dismiss; interruptible; keyboard-aware.
 *
 * Everything that has to move with it is driven by ONE progress number (`e`, see engage.ts): the sheet's own position,
 * the page behind it stepping back (scale + corners), the dim/blur over that page and the orb. Opening, a finger drag,
 * a flick and the exit are all just that number changing, so nothing can drift out of step.
 */
type SheetProps = { children: ReactNode; onClose: () => void; tall?: boolean; /** light contents (Settings): present from the first frame instead of arriving a beat later */ instant?: boolean; label: string; foot?: ReactNode; z?: number; /** a sheet rendered inside another overlay's component (e.g. the workout's exercise menu) */ nested?: boolean };

export function Sheet(props: SheetProps) {
  const meta = useContext(OverlayMeta);
  return !props.nested && meta?.page ? <PageSheet {...props} id={meta.id} /> : <HostSheet {...props} />;
}

function HostSheet({ children, onClose, tall, instant, label, foot, z: zProp = 60, nested }: SheetProps) {
  const z = useOverlayZ(zProp) + (nested ? 5 : 0);
  const meta = useContext(OverlayMeta);
  const ov = useUI((u) => u.overlays);
  const i = nested || !meta ? -1 : ov.findIndex((o) => o.id === meta.id);
  // a sheet with another sheet above it steps back, like a stacked card (and only the top one answers Escape). Pages opened
  // inside it don't count: they are this same sheet. While it leaves, it keeps how it looked.
  const g = i >= 0 ? group(ov, i) : null;
  const frozen = useRef({ behind: false, covered: false, hi: i });
  if (g) frozen.current = { behind: g.hi < ov.length - 1, covered: !!ov[i + 1]?.page, hi: g.hi };
  const { behind, covered } = frozen.current;
  const paneRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const behindRef = useRef(behind); behindRef.current = behind || covered;
  const dist = useRef((typeof window !== 'undefined' ? window.innerHeight : 900) + 40); // how far it travels to be fully off screen
  const p = useMotionValue(0);   // opening progress (a spring)
  const y = useMotionValue(0);   // the finger
  const bs = useMotionValue(0);  // stepped back behind another sheet
  const shift = useTransform([p, y, bs], ([pp, yy, b]: number[]) => (1 - pp) * dist.current + yy - 6 * b);
  // the keyboard lifts the sheet as part of its transform (not its `bottom`), so riding the keyboard never re-lays it out
  const transform = useTransform([shift, bs, kb], ([sh, b, k]: number[]) => `translate3d(0, ${sh - k}px, 0) scale(${1 - 0.06 * b})`);
  const e = useTransform([p, y], ([pp, yy]: number[]) => clamp01(pp - Math.max(0, yy) / dist.current));
  const engage = useMemo(() => ({ e, shift }), [e, shift]);
  const room = useTransform(kb, availableHeight); // what the keyboard leaves free: the sheet lifts and fits as it opens
  useEffect(() => trackDepth(id, e), [id, e]);
  const swipeV = useRef(0); // px/s the finger had when it let go
  // a swipe on a page inside it closes the whole sheet, pages and all
  useSwipeDown(ref, y, (v) => {
    swipeV.current = v ?? 0;
    const cur = useUI.getState().overlays, at = meta ? cur.findIndex((o) => o.id === meta.id) : -1;
    if (at >= 0 && cur[at + 1]?.page) useUI.getState().popN(group(cur, at).hi - at + 1); else onClose();
  }, { enabled: !behind });
  const gone = useRef(new Set<() => void>());
  useLayoutEffect(() => {
    if (nested || !meta || !ref.current) return;
    hosts.set(meta.id, { el: ref.current, y, swipeV, engage, gone: gone.current });
    return () => { hosts.delete(meta.id); };
    // eslint-disable-next-line
  }, []);
  useCovered(paneRef, covered, reduce);
  // High refresh rate: the same spring, also handed to the browser for the sheet, its dim and the page behind, so they are
  // drawn at the screen's full rate (see mirrorSpring). A finger or a sheet stacking on top hands control straight back.
  const scrimRef = useRef<HTMLDivElement>(null);
  const mirror = useRef<Mirror | null>(null); if (!mirror.current) mirror.current = new Mirror();
  const runMirror = (p0: number, p1: number, sp: typeof SURFACE, vel: number) => {
    const m = mirror.current!; m.cancel();
    if (reduce) return;
    const b = bs.get();
    const k = kb.get();
    m.add(mirrorProgress(ref.current, p0, p1, sp, vel, (pp) => ({ transform: `translate3d(0, ${(1 - pp) * dist.current - k}px, 0) scale(${1 - 0.06 * b})` })));
    m.add(...mirrorVeil(scrimRef.current, p0, p1, sp, vel), mirrorStage(id, p0, p1, sp, vel), mirrorOrb(ref.current, p0, p1, sp, vel, (pp) => (1 - pp) * dist.current));
  };
  useEffect(() => {
    const stop = () => mirror.current!.cancel();
    const a = y.on('change', stop), b = bs.on('change', stop), c = kb.on('change', stop); // the keyboard moving hands it back to the script too
    return () => { a(); b(); c(); stop(); };
    // eslint-disable-next-line
  }, []);
  // measure the real height once it is laid out (the travel distance only has to be "off screen", so a short sheet
  // does not fly further than it needs to), and keep it right if the content grows
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    // short sheets are thinner glass (more of the colour comes through), full-height ones denser for long reading
    const measure = () => { const h = el.offsetHeight; dist.current = h + 40; const short = h < window.innerHeight * 0.62; if ((el.dataset.size === 'short') !== short) el.dataset.size = short ? 'short' : 'full'; };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // A full-height sheet's contents (a long list, a form) are put in the page two frames after the slide has started, not
  // before it: building them used to hold up the very first frame, which read as the popup hesitating before it moved. By then
  // the sheet is still almost entirely off screen, and the contents fade up a beat later anyway. Its height does not depend on
  // them (it is full height), so nothing jumps.
  const [ready, setReady] = useState(!tall || !!instant || !!reduce);
  useLayoutEffect(() => {
    if (ready) return;
    let a = requestAnimationFrame(() => { a = requestAnimationFrame(() => setReady(true)); });
    return () => cancelAnimationFrame(a);
    // eslint-disable-next-line
  }, []);
  useEffect(() => (ref.current ? watchFocus(ref.current, (el) => el.closest<HTMLElement>('.sheet-body')) : undefined), []);
  // contents that arrive late must not bring the keyboard with them either (see the open effect below)
  useLayoutEffect(() => {
    if (!ready) return;
    const f = document.activeElement as HTMLElement | null;
    if (f && ref.current?.contains(f) && /^(INPUT|TEXTAREA)$/.test(f.tagName)) f.blur();
  }, [ready]);
  // started before the first paint, so the browser-run half is already going while the sheet's content finishes setting up
  useLayoutEffect(() => {
    const c = animate(p, 1, reduce ? { duration: 0.01 } : SPRING);
    // A popup opens without the keyboard, as on iOS: a field that asked for focus is let go before the first paint, so the
    // sheet arrives calmly; tapping a field then brings the keyboard and the sheet rises to meet it.
    const f = document.activeElement as HTMLElement | null;
    if (f && ref.current?.contains(f) && /^(INPUT|TEXTAREA)$/.test(f.tagName)) f.blur();
    runMirror(0, 1, SPRING, 0);
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
    if (ref.current?.contains(document.activeElement)) dropKeyboard(EXIT_SPRING); // the keyboard goes down with it, not after it
    const vy = swipeV.current || y.getVelocity();
    p.set(e.get()); y.set(0);
    runMirror(p.get(), 0, EXIT_SPRING, -vy / dist.current);
    const c = animate(p, 0, reduce ? { duration: 0.01 } : { ...EXIT_SPRING, velocity: -vy / dist.current });
    c.then(() => { gone.current.forEach((f) => f()); safeToRemove?.(); });
    // eslint-disable-next-line
  }, [present]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !behindRef.current) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <EngageContext.Provider value={engage}>
      <Veil e={e} z={z - 1} onClick={onClose} elRef={scrimRef} className={behind ? 'veil-behind' : ''} />
      <motion.div
        ref={ref}
        className={`sheet ${tall ? 'tall' : ''} ${behind ? 'behind' : ''}`}
        style={{ zIndex: z, transformOrigin: '50% 0%', transform, maxHeight: room, ...(tall ? { height: room } : {}) }}
        role="dialog" aria-modal="true" aria-label={label}
      >
        <div className="sheet-grab" />
        <div className={`sheet-pane ${tall && !instant ? 'late' : ''}`} ref={paneRef}>
          {ready && children}
          {ready && foot && <div className="sheet-foot">{foot}</div>}
        </div>
      </motion.div>
    </EngageContext.Provider>
  );
}

/**
 * A full-height pop-up opened from another full-height one (see PAGE_TYPES in state/ui.ts): the next page of the SAME sheet.
 * It is drawn inside that sheet — no second pane of glass, no second dim, the page behind does not step back again — and
 * glides in from the side while the sheet's current page steps aside. Back (or the hardware back) reverses it; swiping down
 * closes the whole sheet. It rides the sheet's drag, keyboard lift and exit because it lives inside it.
 */
function PageSheet({ children, onClose, tall, label, foot, id }: SheetProps & { id: string }) {
  const reduce = useReducedMotion();
  const ov = useUI((u) => u.overlays);
  const i = ov.findIndex((o) => o.id === id);
  const [hostId] = useState(() => { const cur = useUI.getState().overlays; const at = cur.findIndex((o) => o.id === id); return at >= 0 ? cur[group(cur, at).lo].id : ''; });
  const host = hosts.get(hostId);
  const frozen = useRef(false);
  if (i >= 0) frozen.current = !!ov[i + 1]?.page;
  const covered = frozen.current;
  const isTop = i >= 0 && i === ov.length - 1;
  const topRef = useRef(isTop); topRef.current = isTop;
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(!tall || !!reduce);
  useLayoutEffect(() => {
    if (ready) return;
    let a = requestAnimationFrame(() => { a = requestAnimationFrame(() => setReady(true)); });
    return () => cancelAnimationFrame(a);
    // eslint-disable-next-line
  }, []);
  // in: as the sheet's own page steps aside (useCovered on the sheet below), this one glides in from the right
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const f = document.activeElement as HTMLElement | null;
    if (f && /^(INPUT|TEXTAREA)$/.test(f.tagName)) f.blur(); // a page arrives without the keyboard, like a sheet does
    if (reduce) return;
    const a = pageIn(el, 48);
    return () => a.forEach((x) => x.cancel());
    // eslint-disable-next-line
  }, []);
  useLayoutEffect(() => {
    if (!ready) return;
    const f = document.activeElement as HTMLElement | null;
    if (f && ref.current?.contains(f) && /^(INPUT|TEXTAREA)$/.test(f.tagName)) f.blur();
  }, [ready]);
  useCovered(ref, covered, reduce);
  // out: Back slides it away to the right; when the whole sheet is going, it simply goes down with it
  const [present, safeToRemove] = usePresence();
  useEffect(() => {
    if (present) return;
    const el = ref.current;
    if (el?.contains(document.activeElement)) dropKeyboard(EXIT_SPRING);
    const hostStays = useUI.getState().overlays.some((o) => o.id === hostId);
    if (!hostStays && host) { host.gone.add(() => safeToRemove?.()); const tm = setTimeout(() => safeToRemove?.(), 1500); return () => clearTimeout(tm); }
    if (!el || reduce) { safeToRemove?.(); return; }
    el.getAnimations().forEach((a) => a.cancel());
    el.inert = true;
    const a = pageOut(el, 40);
    a.onfinish = () => safeToRemove?.();
    // eslint-disable-next-line
  }, [present]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && topRef.current) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!host) return null;
  return createPortal(
    <EngageContext.Provider value={host.engage}>
      <div ref={ref} className="sheet-page" role="dialog" aria-modal="true" aria-label={label}>
        {ready && children}
        {ready && foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </EngageContext.Provider>,
    host.el,
  );
}

/** The close button of a custom sheet header: a Back arrow when the sheet is a page inside another one. */
export function CloseButton({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  const page = useIsPage();
  return <button className="icon-btn flat" onClick={onClick} aria-label={page ? 'Back' : label}><Icon name={page ? 'chevL' : 'close'} /></button>;
}

export function SheetHead({ title, sub, onClose, right, back: backProp }: { title: ReactNode; sub?: ReactNode; onClose?: () => void; right?: ReactNode; back?: boolean }) {
  const page = useIsPage();
  const back = backProp || page; // a page inside another sheet goes Back to it rather than closing
  return (
    <div className="sheet-head">
      <AnimatePresence initial={false}>
        {back && onClose && (
          <motion.button key="back" className="icon-btn flat" onClick={onClose} aria-label="Back" style={{ overflow: 'hidden', flex: 'none' }}
            initial={{ opacity: 0, width: 0, marginRight: -10 }} animate={{ opacity: 1, width: 40, marginRight: 0 }} exit={{ opacity: 0, width: 0, marginRight: -10 }} transition={SURFACE}>
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
