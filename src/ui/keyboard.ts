import { animate, motionValue, type MotionValue } from 'motion/react';
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
function go(px: number, sp: Spring | { duration: number }) {
  anim?.stop();
  target = px;
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
    const margin = 16;
    if (er.top >= sr.top + margin && er.bottom <= sr.bottom - margin) return; // already in sight
    const d = er.top + er.height / 2 - (sr.top + sr.height * 0.4);
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
