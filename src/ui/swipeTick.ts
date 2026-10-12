import { useEffect, useRef } from 'react';
import { buzz } from '../state/ui';
import { SMOOTH, springCurve } from './motion';

/**
 * Swipe a set to the right to tick it. The row leans after your finger (it follows at a third of your speed and resists
 * more the further you go), the set's check box fills with the accent as you drag, and at the lock point it fills
 * completely with a light tick of the phone. Let go past it and the set is ticked; short of it, everything eases back.
 * Grabbing the row while it is still easing back takes over from where it is.
 *
 * Only transform and opacity move, on the row and one fill layer (no layout); the fill follows through a short CSS
 * transition, so it glides rather than jitters with each touch event. Vertical moves are left to the list's scroll.
 */
const LOCK = 84;      // px of finger travel to tick
const LEAN = 0.34;    // how much of the finger's travel the row follows
const MAX_LEAN = 28;  // px the row leans at most (it stays inside its card)

export function useSwipeTick(row: React.RefObject<HTMLElement | null>, fill: React.RefObject<HTMLElement | null>, enabled: boolean, onTick: () => void) {
  const tick = useRef(onTick); tick.current = onTick;
  useEffect(() => {
    const el = row.current;
    if (!el || !enabled) return;
    let pid = -1, x0 = 0, y0 = 0, decided = false, swiping = false, locked = false, swiped = false;
    let lean = 0, samples: { t: number; x: number }[] = [];
    let back: Animation | null = null;
    const reduced = () => document.documentElement.dataset.motion === 'reduce';
    const leanOf = (dx: number) => { const d = Math.max(0, dx) * LEAN; return MAX_LEAN * (1 - Math.exp(-d / MAX_LEAN)); }; // soft limit
    const paint = (dx: number) => {
      lean = reduced() ? 0 : leanOf(dx);
      el.style.transform = lean > 0.1 ? `translate3d(${lean.toFixed(2)}px, 0, 0)` : '';
      const p = Math.min(1, Math.max(0, dx / LOCK));
      const f = fill.current;
      if (f) { f.style.opacity = String(locked ? 1 : p * 0.85); f.style.transform = `scale(${locked ? 1 : 0.35 + p * 0.5})`; }
    };
    const settle = (vx: number) => {
      // the row springs home on the calm spring, carrying the finger's speed
      if (lean > 0.1 && !reduced()) {
        const c = springCurve(SMOOTH, Math.max(-4, Math.min(4, -vx / Math.max(lean, 1))));
        back = el.animate([{ transform: `translate3d(${lean}px, 0, 0)` }, { transform: 'translate3d(0, 0, 0)' }], { duration: c.duration, easing: c.easing });
      }
      el.style.transform = ''; lean = 0;
      const f = fill.current;
      if (f && !locked) { f.style.opacity = ''; f.style.transform = ''; } // its CSS transition eases it away
    };
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || e.button > 0 || pid !== -1) return;
      if ((e.target as Element).closest?.('[data-no-swipe]')) return;
      pid = e.pointerId; x0 = e.clientX; y0 = e.clientY; decided = false; swiping = false; locked = false; swiped = false;
      samples = [{ t: e.timeStamp, x: 0 }];
      if (back) {
        // caught on its way home: carry on from where it is drawn
        const m = new DOMMatrix(getComputedStyle(el).transform);
        back.cancel(); back = null;
        if (Math.abs(m.m41) > 0.5) { el.style.transform = `translate3d(${m.m41}px, 0, 0)`; x0 -= m.m41 / LEAN; }
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (!decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        decided = true;
        swiping = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.4;
        if (!swiping) { pid = -1; return; }
        swiped = true;
        try { el.setPointerCapture(pid); } catch { /* ignore */ }
        (document.activeElement as HTMLElement | null)?.blur?.(); // a swipe that began on a field doesn't bring the keyboard
      }
      if (!swiping) return;
      const now = dx >= LOCK;
      if (now !== locked) { locked = now; if (now) buzz(10); el.classList.toggle('swipe-armed', now); }
      paint(dx);
      samples.push({ t: e.timeStamp, x: dx }); if (samples.length > 5) samples.shift();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = -1;
      if (!swiping) return;
      swiping = false;
      const a = samples[0], b = samples[samples.length - 1];
      const vx = b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * 1000 * LEAN : 0; // px/s of the row
      el.classList.remove('swipe-armed');
      const was = locked;
      settle(e.type === 'pointercancel' ? 0 : vx);
      if (was && e.type !== 'pointercancel') tick.current();
      locked = false;
    };
    // a swipe is not also a tap on whatever was under the finger
    const click = (e: MouseEvent) => { if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false; } };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true);
    return () => {
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.removeEventListener('click', click, true);
      back?.cancel(); el.style.transform = ''; el.classList.remove('swipe-armed');
    };
  }, [row, fill, enabled]);
}
