import { animate, motionValue, type MotionValue } from 'motion/react';
import { KEYBOARD } from './motion';

/**
 * The on-screen keyboard, as a smooth number. The browser reports the keyboard in a step or two (and the area it
 * covers is black until the system has drawn it), so a sheet that jumps to the new height looks broken. `kb` is the
 * keyboard's height eased with a spring: sheets lift (and shrink to fit) along with it instead of snapping.
 *
 * It also remembers how tall your keyboard is. A popup that opens with a text field focused asks for it up front
 * (expectKeyboard): it then rises straight to where it will sit above the keyboard, in one motion together with the
 * keyboard, instead of landing and then being shoved up when the browser finally reports it.
 */
export const kb: MotionValue<number> = motionValue(0);
let base = typeof window !== 'undefined' ? window.innerHeight : 800; // layout height with no keyboard
export const baseHeight = () => base;
let anim: { stop: () => void } | null = null;
let target = 0;
let expectUntil = 0;
let expectTimer: ReturnType<typeof setTimeout> | undefined;
const KEY = 'aven.kb';
let known = (() => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } })();

type Spring = { stiffness: number; damping: number; mass?: number };
function go(px: number, sp: Spring | { duration: number }) {
  anim?.stop();
  target = px;
  anim = animate(kb, px, sp as never);
}

export function setKeyboard(px: number, reduced = false) {
  // while a popup is waiting for the keyboard it asked for, an early "no keyboard" report is just the browser catching up
  if (px === 0 && performance.now() < expectUntil) return;
  if (px === 0 && typeof window !== 'undefined') base = Math.max(base, window.innerHeight);
  if (px > 0) {
    expectUntil = 0; clearTimeout(expectTimer);
    if (Math.abs(px - known) > 1) { known = px; try { localStorage.setItem(KEY, String(Math.round(px))); } catch { /* ignore */ } }
  }
  if (Math.abs(px - target) < 1 && px !== 0) return; // already there (or on the way): no restart, no hitch
  go(px, reduced ? { duration: 0.01 } : KEYBOARD);
}

/** A popup is opening with a field focused: lift for the keyboard now, on the popup's own spring (see above). */
export function expectKeyboard(sp: Spring) {
  if (known <= 0 || target > 0) return;
  expectUntil = performance.now() + 900;
  go(known, sp);
  clearTimeout(expectTimer);
  // the keyboard never came (a hardware keyboard, a browser that keeps it down): settle back
  expectTimer = setTimeout(() => { if (expectUntil && performance.now() >= expectUntil) { expectUntil = 0; go(0, KEYBOARD); } }, 950);
}

/** A popup is closing: let the keyboard go now, so it drops together with the popup instead of after it. */
export function dropKeyboard(sp: Spring) {
  const el = document.activeElement as HTMLElement | null;
  if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.blur();
  expectUntil = 0; clearTimeout(expectTimer);
  if (target > 0) go(0, sp);
}

/** CSS length for "the space a tall sheet may use": everything below the status bar gap, above the keyboard. */
export const availableHeight = (kbPx: number) => `calc(${base}px - var(--sat) - 46px - ${kbPx}px)`;
