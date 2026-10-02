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
export const availableHeight = (kbPx: number) => `calc(${base}px - var(--sat) - 46px - ${kbPx}px)`;
