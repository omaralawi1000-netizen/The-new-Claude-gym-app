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

export function setKeyboard(px: number, reduced = false) {
  anim?.stop();
  if (px === 0 && typeof window !== 'undefined') base = Math.max(base, window.innerHeight);
  anim = animate(kb, px, reduced ? { duration: 0.01 } : KEYBOARD);
}

/** CSS length for "the space a tall sheet may use": everything below the status bar gap, above the keyboard. */
export const availableHeight = (kbPx: number) => `calc(${base}px - var(--sat) - 46px - ${kbPx}px)`;
