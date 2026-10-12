import { useLayoutEffect, useRef } from 'react';
import { apple, springCurve } from './motion';

/**
 * Horizontal pages that follow the finger, like the iOS photo viewer.
 *
 * - The track follows the finger 1:1 (one transform per pointer event, nothing re-rendered). Past the first and last page
 *   it resists with iOS's rubber-band curve.
 * - On release it settles on a spring that starts at the finger's speed. The settle is a Web Animation on the track's
 *   transform, drawn by the browser's compositor at the screen's full refresh rate (scripted animation can be held to
 *   60 fps on Android); its curve is the spring itself, sampled by springCurve.
 * - A touch mid-glide catches the page where it is; letting go without a swipe settles it on the nearest page.
 * - Vertical scrolling inside a page is the browser's own (touch-action: pan-y); a mostly-vertical gesture is left alone.
 */

export const PAGE = apple(0.5);        // a page settling after your finger: Apple's default spring
export const PAGE_AUTO = apple(0.62);  // the app moving you on by itself: a touch slower, so it never startles

type Spring = { stiffness: number; damping: number; mass?: number };
export type Pager = {
  /** glide to a page (auto: the app moved you, on the slower spring) */
  go: (i: number, auto?: boolean) => void;
  /** put the track on a page at once (first draw, a page removed) */
  place: (i: number) => void;
  dragging: () => boolean;
};

export function usePager(viewport: React.RefObject<HTMLElement | null>, track: React.RefObject<HTMLElement | null>,
  opts: { count: number; gap: number; initial: number; onSettle: (i: number) => void; onNear?: (i: number) => void }): React.RefObject<Pager> {
  const o = useRef(opts); o.current = opts;
  const api = useRef<Pager>({ go: () => {}, place: () => {}, dragging: () => false });
  // a layout effect: the track sits on its first page before the first paint
  useLayoutEffect(() => {
    const vp = viewport.current, tr = track.current;
    if (!vp || !tr) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let W = vp.clientWidth || 1;
    let pos = 0;                       // where the track rests (or is heading), in px from page 0
    let anim: Animation | null = null;
    let near = -1;
    const stride = () => W + o.current.gap;
    const last = () => Math.max(0, o.current.count - 1);
    const clampI = (i: number) => Math.min(last(), Math.max(0, i));
    const tf = (x: number) => `translate3d(${(-x).toFixed(2)}px, 0, 0)`;
    const apply = (x: number) => { tr.style.transform = tf(x); };
    const tellNear = (x: number) => { const n = clampI(Math.round(x / stride())); if (n !== near) { near = n; o.current.onNear?.(n); } };
    // where the track is drawn right now (mid-glide this is the animation's value, not `pos`)
    const current = () => {
      if (!anim) return pos;
      const m = getComputedStyle(tr).transform;
      if (!m || m === 'none') return pos;
      try { return -new DOMMatrixReadOnly(m).m41; } catch { return pos; }
    };
    const stop = () => { if (!anim) return; pos = current(); anim.cancel(); anim = null; apply(pos); };
    const settle = (i: number, vPx: number, sp: Spring) => {
      const target = clampI(i), from = pos, to = target * stride(), d = to - from;
      pos = to; apply(to); tellNear(to);
      if (Math.abs(d) < 0.5 || reduce || typeof tr.animate !== 'function') { o.current.onSettle(target); return; }
      // the spring runs in progress units (0 → 1 over the distance): the finger's speed becomes its starting speed
      const v0 = Math.max(-12, Math.min(12, vPx / d));
      const c = springCurve(sp, v0);
      const a = tr.animate([{ transform: tf(from) }, { transform: tf(to) }], { duration: c.duration, easing: c.easing });
      anim = a;
      a.onfinish = () => { if (anim === a) { anim = null; o.current.onSettle(target); } };
    };
    api.current.go = (i, auto) => { stop(); settle(i, 0, auto ? PAGE_AUTO : PAGE); };
    api.current.place = (i) => { stop(); pos = clampI(i) * stride(); apply(pos); tellNear(pos); };
    api.current.place(o.current.initial);

    // ── the finger ──
    const band = (over: number) => (1 - 1 / ((over * 0.55) / W + 1)) * W; // iOS rubber band
    const rubber = (x: number) => { const hi = last() * stride(); return x < 0 ? -band(-x) : x > hi ? hi + band(x - hi) : x; };
    // As on iOS: a quick flick turns the page however short it was, and a slow drag turns it once it is a quarter of the way
    // over; anything less springs back. A flick against the drag wins (you changed your mind). Never more than one page.
    const FLICK = 260;   // px per second
    const turn = (delta: number, v: number): -1 | 0 | 1 => {
      if (Math.abs(v) >= FLICK) return v > 0 ? 1 : -1;
      if (Math.abs(delta) >= W * 0.25) return delta > 0 ? 1 : -1;
      return 0;
    };
    let id = -1, mode: '' | 'wait' | 'h' | 'v' = '', caught = false, sx = 0, sy = 0, sp0 = 0, si = 0, moved = false;
    let samples: { t: number; x: number }[] = [];
    const down = (e: PointerEvent) => {
      if (mode || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if ((e.target as HTMLElement)?.closest?.('input[type="range"], [data-no-swipe]')) return;
      caught = !!anim; stop();
      id = e.pointerId; mode = 'wait'; sx = e.clientX; sy = e.clientY; sp0 = pos; si = clampI(Math.round(pos / stride())); moved = false;
      samples = [{ t: e.timeStamp, x: pos }];
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      if (mode === 'wait') {
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.15) {
          mode = 'h'; sx = e.clientX; sp0 = pos; // start from here: no jump by the 8 px it took to decide
          try { vp.setPointerCapture(id); } catch { /* ignore */ }
          vp.classList.add('paging');
        } else if (Math.abs(dy) > 8) mode = 'v';
        return;
      }
      if (mode !== 'h') return;
      moved = true;
      const x = rubber(sp0 - (e.clientX - sx));
      pos = x; apply(x); tellNear(x);
      // every finger position the browser saw since the last frame, not just the last one: the speed at release is truer
      const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      for (const c of evs.length ? evs : [e]) samples.push({ t: c.timeStamp, x: rubber(sp0 - (c.clientX - sx)) });
      while (samples.length > 2 && e.timeStamp - samples[0].t > 100) samples.shift();
    };
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (e.pointerId !== id) return;
      const was = mode; mode = ''; id = -1;
      vp.classList.remove('paging');
      if (was === 'h') {
        // the finger's speed over its last ~100 ms; a finger that stopped before lifting has no speed left
        const a = samples[0], b = samples[samples.length - 1];
        const still = e.timeStamp - b.t > 80;
        const v = !cancelled && !still && b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * 1000 : 0; // px per second, + = towards later pages
        settle(si + turn(pos - si * stride(), v), v, PAGE);
      } else if (caught) settle(Math.round(pos / stride()), 0, PAGE);
      caught = false;
    };
    const up = (e: PointerEvent) => end(e, false);
    const cancel = (e: PointerEvent) => end(e, true);
    // a touch is held by the element it started on; taking it over for the track makes that element "lose" it, which
    // bubbles up here and must not end the swipe — only the track itself losing it does
    const lost = (e: PointerEvent) => { if (e.target === vp) end(e, true); };
    // a swipe must not also count as a tap on whatever was under the finger
    const click = (e: MouseEvent) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } };
    const ro = new ResizeObserver(() => {
      const w = vp.clientWidth; if (!w || w === W) return;
      const i = clampI(Math.round(current() / stride()));
      W = w; stop(); pos = i * stride(); apply(pos);
    });
    ro.observe(vp);
    vp.addEventListener('pointerdown', down);
    vp.addEventListener('pointermove', move);
    vp.addEventListener('pointerup', up);
    vp.addEventListener('pointercancel', cancel);
    vp.addEventListener('lostpointercapture', lost);
    vp.addEventListener('click', click, true);
    api.current.dragging = () => mode === 'h';
    return () => {
      ro.disconnect(); anim?.cancel();
      vp.removeEventListener('pointerdown', down);
      vp.removeEventListener('pointermove', move);
      vp.removeEventListener('pointerup', up);
      vp.removeEventListener('pointercancel', cancel);
      vp.removeEventListener('lostpointercapture', lost);
      vp.removeEventListener('click', click, true);
    };
  }, [viewport, track]);
  return api;
}
