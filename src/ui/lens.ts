import { springCurve } from './motion';

/**
 * A drop of glass that glides between targets and stretches like a liquid on the way: the leading edge runs ahead on a
 * quicker spring, the trailing edge follows on a calmer one, then they meet again as a capsule.
 *
 * Everything runs as browser animations of `transform` only, so the compositor draws it at the screen's full refresh rate.
 * A capsule can't be resized with a transform without squashing its round ends, so it is built from three pieces: two
 * round caps that move, and a straight middle that moves and stretches (stretching a straight piece sideways changes
 * nothing about how it looks). The pieces are opaque and the group gets its translucency as a whole, so the overlaps never
 * show.
 *
 *   <span class="lens"><i class="lens-l" /><i class="lens-r" /><i class="lens-m" /></span>   (the middle last: it covers the caps' inner halves)
 */
type Spring = { stiffness: number; damping: number; mass?: number };

const BASE = 100; // the middle piece's own width; it is scaled to the gap between the caps

/** A spring from 0 → 1 sampled every 1/120 s until it rests. */
function samples(sp: Spring): number[] {
  const m = sp.mass ?? 1, dt = 1 / 1200;
  let x = 0, v = 0, t = 0;
  const out = [0];
  while (t < 3) {
    for (let i = 0; i < 10; i++) { v += ((sp.stiffness * (1 - x) - sp.damping * v) / m) * dt; x += v * dt; t += dt; }
    out.push(x);
    if (t > 0.1 && Math.abs(1 - x) < 0.0008 && Math.abs(v) < 0.02) break;
  }
  out[out.length - 1] = 1;
  return out;
}
const cache = new Map<string, number[]>();
const sampled = (sp: Spring) => { const k = `${sp.stiffness}|${sp.damping}|${sp.mass ?? 1}`; let s = cache.get(k); if (!s) { s = samples(sp); cache.set(k, s); } return s; };

const tx = (el: Element) => { const t = getComputedStyle(el).transform; return t && t !== 'none' ? new DOMMatrixReadOnly(t).m41 : 0; };

export interface LensBox { l: number; r: number }

export class Lens {
  private lp: HTMLElement; private mp: HTMLElement; private rp: HTMLElement;
  private box: LensBox | null = null;
  constructor(root: HTMLElement, private radius: () => number) {
    this.lp = root.querySelector('.lens-l')!; this.mp = root.querySelector('.lens-m')!; this.rp = root.querySelector('.lens-r')!;
  }
  private frame(b: LensBox) {
    const R = this.radius(), w = Math.max(2 * R, b.r - b.l);
    return {
      l: `translate3d(${b.l.toFixed(2)}px, 0, 0)`,
      r: `translate3d(${(b.l + w - 2 * R).toFixed(2)}px, 0, 0)`,
      m: `translate3d(${(b.l + R).toFixed(2)}px, 0, 0) scaleX(${((w - 2 * R) / BASE).toFixed(4)})`,
    };
  }
  get moving() { return this.lp.getAnimations().length > 0; }
  /** Where the drop is drawn right now (mid-flight included). */
  private visual(): LensBox | null {
    if (!this.box) return null;
    if (!this.moving) return this.box;
    const R = this.radius();
    return { l: tx(this.lp), r: tx(this.rp) + 2 * R };
  }
  /** Put it somewhere at once. */
  place(b: LensBox) {
    for (const p of [this.lp, this.mp, this.rp]) p.getAnimations().forEach((a) => a.cancel());
    const f = this.frame(b);
    this.lp.style.transform = f.l; this.mp.style.transform = f.m; this.rp.style.transform = f.r;
    this.box = b;
  }
  /** Glide to a new box. `lead` drives the edge in front, `trail` the edge behind. */
  glide(to: LensBox, lead: Spring, trail: Spring) {
    const from = this.visual();
    if (!from || typeof this.lp.animate !== 'function') { this.place(to); return; }
    this.place(to); // final state underneath (and cancels whatever was running)
    if (Math.abs(from.l - to.l) < 0.5 && Math.abs(from.r - to.r) < 0.5) return;
    const right = to.l + to.r > from.l + from.r;
    const sL = sampled(right ? trail : lead), sR = sampled(right ? lead : trail);
    const n = Math.max(sL.length, sR.length);
    const R = this.radius();
    const fl: Keyframe[] = [], fm: Keyframe[] = [], fr: Keyframe[] = [];
    for (let i = 0; i < n; i++) {
      const a = sL[Math.min(i, sL.length - 1)], c = sR[Math.min(i, sR.length - 1)];
      let l = from.l + (to.l - from.l) * a, r = from.r + (to.r - from.r) * c;
      if (r - l < 2 * R) { const mid = (l + r) / 2; l = mid - R; r = mid + R; }
      const f = this.frame({ l, r }), offset = i / (n - 1);
      fl.push({ transform: f.l, offset }); fm.push({ transform: f.m, offset }); fr.push({ transform: f.r, offset });
    }
    const opts = { duration: Math.round(((n - 1) / 120) * 1000), easing: 'linear' };
    this.lp.animate(fl, opts); this.mp.animate(fm, opts); this.rp.animate(fr, opts);
  }
}

/**
 * Slide an element from where it is drawn now (dx px away, along x) back to its place, on a spring, run by the browser.
 * Anything already running on its transform is replaced; `currentShift` reads how far it is displaced right now.
 */
export const currentShift = (el: Element) => (el.getAnimations().length ? tx(el) : 0);
export function slideFrom(el: Element, dx: number, sp: Spring, extra?: { from?: string; to?: string }): Animation | null {
  el.getAnimations().forEach((a) => { if ((a.effect as KeyframeEffect | null)?.getKeyframes?.().some((k) => 'transform' in k)) a.cancel(); });
  if (Math.abs(dx) < 0.5 && !extra || typeof (el as HTMLElement).animate !== 'function') return null;
  const c = springCurve(sp);
  return (el as HTMLElement).animate(
    [{ transform: `translate3d(${dx.toFixed(2)}px, 0, 0) ${extra?.from ?? ''}` }, { transform: `translate3d(0, 0, 0) ${extra?.to ?? ''}` }],
    { duration: c.duration, easing: c.easing },
  );
}
