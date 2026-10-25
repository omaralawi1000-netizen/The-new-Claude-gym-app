import { useEffect, useRef } from 'react';
import { animate, type MotionValue } from 'motion/react';
import { SMOOTH } from './motion';

/**
 * iOS-style "swipe down to dismiss" from anywhere on a surface.
 * - Pulling down starts a drag only when the scroll area under the finger is already at the top (otherwise it scrolls).
 * - A mostly-horizontal gesture (chips, carousels) is left alone.
 * - The surface follows the finger 1:1; pulling up stretches like rubber (harder the further you pull, never past ~28 px).
 *   On release it either closes — the spring inherits the finger's speed, so it keeps going and eases to a stop — or
 *   settles back on the calm spring, also carrying the finger's speed (no stop-and-restart).
 */
export function useSwipeDown(ref: React.RefObject<HTMLElement | null>, y: MotionValue<number>, onClose: (velocityPxPerSec?: number) => void, opts: { enabled?: boolean; threshold?: number } = {}) {
  const close = useRef(onClose); close.current = onClose;
  const enabled = opts.enabled ?? true;
  const threshold = opts.threshold ?? 110;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let startX = 0, startY = 0, scroller: HTMLElement | null = null, decided = false, dragging = false, moved = false;
    let samples: { t: number; y: number }[] = [];
    let back: ReturnType<typeof animate> | null = null, base = 0; // the spring home, and where a grab caught it
    const scrollerOf = (t: EventTarget | null): HTMLElement | null => {
      let n = t as HTMLElement | null;
      while (n && n !== el) { if (n.scrollHeight > n.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return n; n = n.parentElement; }
      return null;
    };
    const begin = (x: number, yy: number, target: EventTarget | null) => {
      const tag = (target as HTMLElement)?.tagName;
      if (tag === 'INPUT' && (target as HTMLInputElement).type === 'range') return false;
      startX = x; startY = yy; scroller = scrollerOf(target); decided = false; dragging = false; moved = false; samples = [{ t: performance.now(), y: 0 }];
      base = 0;
      // a handle with its own drag (a routine card's grip) never moves the sheet
      if ((target as HTMLElement)?.closest?.('[data-no-swipe]')) { decided = true; return false; }
      if (el.hasAttribute('data-leaving')) { decided = true; return false; } // on its way out: not dragged (Sheet.tsx)
      return true;
    };
    const move = (x: number, yy: number, ev: Event) => {
      const dy = yy - startY, dx = x - startX;
      if (!decided) {
        if (Math.abs(dy) < 7 && Math.abs(dx) < 7) return;
        decided = true;
        dragging = dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2 && (!scroller || scroller.scrollTop <= 0);
        if (dragging) {
          startY = yy - 1; // start from here, no jump
          // caught while settling back: it stops where it is and follows the finger from there
          if (back) { back.stop(); back = null; base = y.get(); }
        }
      }
      if (!dragging) return;
      if (ev.cancelable) ev.preventDefault();
      moved = true;
      const d = base + yy - startY;
      y.set(d > 0 ? d : -28 * (1 - Math.exp(d / 90)));
      samples.push({ t: performance.now(), y: d }); if (samples.length > 6) samples.shift();
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      const a = samples[0], b = samples[samples.length - 1];
      const v = b && a && b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0; // px per ms
      if (y.get() > threshold || v > 0.55) close.current(Math.max(0, v) * 1000);
      else { back = animate(y, 0, { ...SMOOTH, velocity: v * 1000 }); back.then(() => { back = null; }); }
    };
    const ts = (e: TouchEvent) => { if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY, e.target); };
    const tm = (e: TouchEvent) => { if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY, e); };
    const te = () => end();
    // mouse (desktop): same gesture with a held button
    let mouseDown = false;
    const md = (e: MouseEvent) => { if (e.button !== 0) return; mouseDown = begin(e.clientX, e.clientY, e.target); };
    const mm = (e: MouseEvent) => { if (mouseDown) move(e.clientX, e.clientY, e); };
    const mu = () => { if (mouseDown) { mouseDown = false; end(); } };
    // a drag must not also count as a tap on whatever was under the finger
    const click = (e: MouseEvent) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } };
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchmove', tm, { passive: false });
    el.addEventListener('touchend', te); el.addEventListener('touchcancel', te);
    el.addEventListener('mousedown', md); window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
    el.addEventListener('click', click, true);
    return () => {
      el.removeEventListener('touchstart', ts); el.removeEventListener('touchmove', tm); el.removeEventListener('touchend', te); el.removeEventListener('touchcancel', te);
      el.removeEventListener('mousedown', md); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu);
      el.removeEventListener('click', click, true);
    };
  }, [ref, y, enabled, threshold]);
}
