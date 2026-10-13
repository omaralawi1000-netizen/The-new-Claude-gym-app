import { animate, cancelFrame, frame, motionValue, type MotionValue } from 'motion/react';
import { KEYBOARD } from './motion';

/**
 * The on-screen keyboard, as a smooth number. The browser reports the keyboard in a step or two (and the area it
 * covers is black until the system has drawn it), so a sheet that jumps to the new height looks broken. `kb` is the
 * keyboard's height eased with a spring: sheets lift (and shrink to fit) along with it instead of snapping.
 */
export const kb: MotionValue<number> = motionValue(0);
let base = typeof window !== 'undefined' ? window.innerHeight : 800; // layout height with no keyboard
export const baseHeight = () => base;
let anim: { stop: () => void } | null = null;
let target = 0;

type Spring = { stiffness: number; damping: number; mass?: number };
const goals = new Set<(px: number) => void>();
/** Where the keyboard is heading, told once per change (before it starts moving): sheets make their room for it up front. */
export function onKeyboardGoal(fn: (px: number) => void): () => void { goals.add(fn); return () => { goals.delete(fn); }; }
export const keyboardGoal = () => target;
function go(px: number, sp: Spring | { duration: number }) {
  anim?.stop();
  const was = target;
  target = px;
  if (was !== px) goals.forEach((f) => f(px));
  anim = animate(kb, px, sp as never);
}

export function setKeyboard(px: number, reduced = false) {
  if (px === 0 && typeof window !== 'undefined') base = Math.max(base, window.innerHeight);
  if (Math.abs(px - target) < 1 && px !== 0) return; // already there (or on the way): no restart, no hitch
  go(px, reduced ? { duration: 0.01 } : KEYBOARD);
}

/** A popup is closing: let the keyboard go now, so it drops together with the popup instead of after it. */
export function dropKeyboard(sp: Spring) {
  const el = document.activeElement as HTMLElement | null;
  if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.blur();
  if (target > 0) go(0, sp);
}

/** CSS length for "the space a tall sheet may use": everything below the status bar gap, above the keyboard. */
export const availableHeight = (kbPx: number, top = 46) => `calc(${base}px - var(--sat) - ${top}px - ${kbPx}px)`;

/**
 * Keep the field you tapped in sight: once the keyboard has stopped moving (or at once when it is already up), the nearest
 * scrolling box slides — smoothly — until the field sits in the upper part of the room the keyboard leaves. Without this a
 * form taller than that room hid the very field being typed in behind the Save bar or the keyboard.
 */
export function watchFocus(root: HTMLElement, scroller: (el: HTMLElement) => HTMLElement | null): () => void {
  let pending: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reveal = () => {
    const el = pending; if (!el || !el.isConnected || document.activeElement !== el) return;
    const sc = scroller(el); if (!sc) return;
    const sr = sc.getBoundingClientRect(), er = el.getBoundingClientRect();
    // a sheet's bottom buttons float over the end of the list: the room you can see ends where they begin
    // …and the keyboard covers the rest (sheets no longer shrink for it: it slides over them)
    const foot = sc.closest('.sheet-pane, .sheet-page')?.querySelector(':scope > .sheet-foot');
    const bottom = Math.min(sr.bottom, foot ? foot.getBoundingClientRect().top : Infinity, base - kb.get());
    const margin = 16;
    if (er.top >= sr.top + margin && er.bottom <= bottom - margin) return; // already in sight
    const d = er.top + er.height / 2 - (sr.top + (bottom - sr.top) * 0.4);
    if (Math.abs(d) > 1) sc.scrollBy({ top: d, behavior: 'smooth' });
  };
  const later = (ms: number) => { clearTimeout(timer); timer = setTimeout(reveal, ms); };
  const onFocus = (e: FocusEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
    pending = el;
    later(kb.get() > 1 ? 50 : 460); // the keyboard is coming: wait for it to land (kb moving re-arms this)
  };
  const off = kb.on('change', () => { if (pending && document.activeElement === pending) later(150); });
  root.addEventListener('focusin', onFocus);
  return () => { clearTimeout(timer); off(); root.removeEventListener('focusin', onFocus); };
}

/**
 * Like `watchFocus`, but the list moves *with* the keyboard: it starts when the keyboard starts, follows the same eased
 * height (`kb`) frame by frame and stops the moment the keyboard lands. No waiting for it to settle, no second slide after.
 * Only as far as needed: the field ends a little above the keyboard (with room to see the row under it), or not at all
 * when it is already clear of it. With the keyboard already up (the next field), the list slides on the keyboard's spring.
 * A finger on the list takes over at once.
 */
export function rideFocus(root: HTMLElement, scroller: (el: HTMLElement) => HTMLElement | null): () => void {
  let ride: { sc: HTMLElement; from: number; d: number; p0: number; goal: number } | null = null;
  let glide: { stop: () => void } | null = null;
  let waiting: { el: HTMLElement; off: () => void; timer: ReturnType<typeof setTimeout> } | null = null;
  const apply = () => {
    const r = ride; if (!r) return;
    const p = Math.min(1, Math.max(0, (kb.get() / r.goal - r.p0) / (1 - r.p0)));
    r.sc.scrollTop = r.from + r.d * p;
    if (p >= 0.999 && Math.abs(kb.get() - target) < 0.5) ride = null;
  };
  const offKb = kb.on('change', () => { if (ride) frame.postRender(apply); });
  const stop = () => {
    ride = null; glide?.stop(); glide = null; cancelFrame(apply);
    if (waiting) { waiting.off(); clearTimeout(waiting.timer); waiting = null; }
  };
  // how far the scroller must move so the field sits clear of a keyboard `goal` px tall (0: it already does)
  const need = (el: HTMLElement, sc: HTMLElement, goal: number) => {
    const sr = sc.getBoundingClientRect(), er = el.getBoundingClientRect();
    const bottom = Math.min(sr.bottom, base - goal);
    const top = sr.top + 16;
    if (er.top >= top && er.bottom <= bottom - 16) return 0;
    if (er.top < top) return er.top - top - 24;
    const d = er.bottom - (bottom - Math.min(84, (bottom - sr.top) * 0.25));
    return Math.min(d, er.top - top); // never past the top of the list
  };
  const start = (el: HTMLElement, goal: number) => {
    if (!el.isConnected || document.activeElement !== el || goal <= 0) return;
    const sc = scroller(el); if (!sc) return;
    const d = need(el, sc, goal);
    if (Math.abs(d) < 1) return;
    const now = kb.get();
    if (now < goal - 1) {
      // the keyboard is on its way: ride along with it
      ride = { sc, from: sc.scrollTop, d, p0: Math.min(0.9, now / goal), goal };
    } else {
      // it is already up: the same spring the keyboard moves on
      const from = sc.scrollTop;
      const v = motionValue(0);
      v.on('change', (x) => { sc.scrollTop = from + d * x; });
      glide = animate(v, 1, KEYBOARD as never);
    }
  };
  const onFocus = (e: FocusEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
    stop();
    if (target > 0) { start(el, target); return; }
    // the keyboard's height is known the moment it starts to rise: wait for that (no keyboard at all: nothing to do)
    const off = onKeyboardGoal((px) => { if (px > 0) { stop(); start(el, px); } });
    waiting = { el, off, timer: setTimeout(stop, 900) };
  };
  const onTouch = () => { if (ride || glide) { ride = null; glide?.stop(); glide = null; } };
  root.addEventListener('focusin', onFocus);
  root.addEventListener('pointerdown', onTouch, true);
  root.addEventListener('wheel', onTouch, { capture: true, passive: true });
  return () => { stop(); offKb(); root.removeEventListener('focusin', onFocus); root.removeEventListener('pointerdown', onTouch, true); root.removeEventListener('wheel', onTouch, true); };
}
