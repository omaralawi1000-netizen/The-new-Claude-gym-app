import { apple, springSamples } from './motion';
import { liquidPath, type Slice } from './liquidShape';

/**
 * Liquid glass for a stack of cards: one card that splits into several (the Food diary's empty day becoming its meals when
 * the first food is logged), or several that flow back into one.
 *
 * While it plays, the real cards have no glass of their own (`.lq-hide` in styles.css). One outline drawn in an SVG layer
 * behind them is their glass: a single translucent fill, the hairline ring clipped inside it and the light on its top edge,
 * the same layers a CSS card has, so at the start and at the end it is the very card it replaces. In between the outline is
 * `liquidPath`: the seams draw in like grooves, the join narrows to a neck and a thread, stretches a little and lets go, and
 * the cards spring to their places and settle.
 *
 * It is one spring for everything (the outline, the texts riding on it, the cards below that move over), sampled once and
 * played by the browser (Web Animations), so it runs at the screen's full rate and a film can step it frame by frame. The
 * outline's `d` is the only thing that is not transform or opacity; it is one small path on its own layer, for under a second.
 */

export const LIQUID = apple(1.05, 0.15);
const STRETCH = 9; // how far each seam is pulled beyond its final gap, at the moment the thread lets go

export type LiquidSlice = {
  /** the real element the slice's texts live in (its layout is the END state) */
  el: HTMLElement;
  /** where the slice's glass is at the start and at the end, in px from the layer's top */
  from: Slice; to: Slice;
  /** top of `el` at the end, and at the start such that its first text sits exactly where it sat before (px from the layer's top) */
  elTo: number; elFrom: number;
  /** the + button: extra offset at the start, on top of `el`'s */
  plus?: { el: HTMLElement; from: number };
  /** bits that arrive (split) or leave (merge) with the glass: the meta line, the bar, the foods */
  late?: { el: HTMLElement; at: number }[];
};

export type LiquidPlan = {
  layer: SVGSVGElement;
  dir: 'split' | 'merge';
  x0: number; x1: number; radius: number;
  slices: LiquidSlice[];
  /** everything below the slices: it slides from where it was to where it is */
  below: { el: HTMLElement; from: number; to: number }[];
  /** copies of texts that were on the old cards and are gone now: placed where they were, they fade out */
  texts: HTMLElement[];
  /** the real cards that come back: their rim light and shadow fade in as the glass settles into them */
  glints: HTMLElement[];
  /** where the shadows of what was there before are (they fade out as the glass leaves) and the box of the rim light's gradient */
  ghosts: Slice[];
  box: { x0: number; x1: number; top: number; bottom: number };
  /** the hairline between rows of the joined card: x range */
  divider: [number, number];
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => { const x = clamp01(v); return x * x * (3 - 2 * x); };

export function liquidReduced() {
  const d = document.documentElement.dataset.motion;
  return d === 'reduce' || (d !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** Where the glass is at one moment: P is the spring's progress 0 → 1 (it overshoots a little on the way). */
export function liquidState(plan: LiquidPlan, P: number, T = P) {
  const split = plan.dir === 'split';
  const Pg = split ? P : Math.min(1, P);
  const bump = split ? Math.sin(Math.PI * clamp01(P)) ** 2 : 0;
  const lerp = (a: number, b: number) => a + (b - a) * Pg;
  const slices: Slice[] = plan.slices.map((s, k) => {
    const lift = k * STRETCH * bump;
    return { top: lerp(s.from.top, s.to.top) + lift, bottom: lerp(s.from.bottom, s.to.bottom) + lift };
  });
  // nothing may overlap, whatever the spring does
  for (let k = 1; k < slices.length; k++) if (slices[k].top < slices[k - 1].bottom) slices[k].top = slices[k - 1].bottom;
  // the seams pinch on their own slow, even clock (T: 0 → 1 over the whole play), the cards' places follow the spring: the bridge
  // stays a visible stretched thread for most of the play and only lets go near its end
  const tt = smooth(clamp01(T / 0.8));
  const sep = split ? tt : 1 - tt;
  const d = liquidPath(slices, slices.slice(1).map(() => sep), plan.x0, plan.x1, plan.radius);
  const rowsO = split ? clamp01(1 - P / 0.12) : clamp01((Pg - 0.9) / 0.1);
  const [dx0, dx1] = plan.divider;
  const div = slices.slice(1).map((s, k) => { const y = (slices[k].bottom + s.top) / 2 + 0.5; return `M${dx0} ${y}H${dx1}`; }).join('');
  return { d, div, rowsO, slices, lift: (k: number) => k * STRETCH * bump, Pg };
}

const px = (v: number) => `${Math.round(v * 100) / 100}px`;

/** Plays the plan; resolves when it has settled (everything is back to its natural, untransformed place). */
export function playLiquid(plan: LiquidPlan): { done: Promise<void>; cancel: () => void } {
  const { xs, duration } = springSamples(LIQUID);
  const N = xs.length;
  const split = plan.dir === 'split';
  const offs = (i: number) => (N === 1 ? 0 : i / (N - 1));
  const states = xs.map((P, i) => liquidState(plan, P, offs(i)));
  const anims: Animation[] = [];
  const A = (el: Element, kf: Keyframe[], o: KeyframeAnimationOptions = {}) => { const a = el.animate(kf, { duration, easing: 'linear', fill: 'both', ...o }); anims.push(a); return a; };

  // the glass
  const div = plan.layer.querySelector<SVGPathElement>('.lq-div')!;
  const outline = states.map((s, i) => ({ d: `path("${s.d}")`, offset: offs(i) }));
  plan.layer.querySelectorAll('.lqp').forEach((el) => A(el, outline));
  A(div, states.map((s, i) => ({ d: `path("${s.div || 'M0 0'}")`, opacity: s.rowsO, offset: offs(i) })));

  // the texts ride on the glass: each slice's element is laid out at its END place and starts where its text was
  plan.slices.forEach((sl, k) => {
    const dy0 = sl.elFrom - sl.elTo;
    A(sl.el, states.map((s, i) => {
      const Pg = s.Pg;
      return { transform: `translate3d(0, ${px(dy0 * (1 - Pg) + s.lift(k))}, 0)`, offset: offs(i) };
    }));
    if (sl.plus && sl.plus.from) {
      A(sl.plus.el, states.map((s, i) => ({ transform: `translate3d(0, ${px(sl.plus!.from * (1 - s.Pg))}, 0)`, offset: offs(i) })));
    }
    // what arrives with the glass fades up once the glass has reached the place it sits in (`at`: the spring's progress)
    (sl.late ?? []).forEach(({ el, at }) => {
      A(el, states.map((s, i) => { const o = smooth((xs[i] - at) / 0.3); return { opacity: o, transform: `translate3d(0, ${px(7 * (1 - o))}, 0)`, offset: offs(i) }; }));
    });
  });

  // everything below slides to its new place on the same spring (and rides the last card's stretch)
  const lastK = plan.slices.length - 1;
  plan.below.forEach((b) => {
    A(b.el, states.map((s, i) => ({ transform: `translate3d(0, ${px((b.from - b.to) * (1 - s.Pg) + s.lift(lastK))}, 0)`, offset: offs(i) })));
  });

  // A card's own rim light (.plinth::after) and shadow can't follow a shape that is not its own box, so they are off while the
  // glass plays: the glass draws the rim light itself (one gradient over the block, fading out) and the cards' own rim light
  // and shadow fade back in as the glass lands in them (the CSS values take over when the class goes). The shadow of what was
  // there before is a ghost that fades out as the glass leaves.
  const fadeIn = [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 1 }];
  plan.glints.forEach((el) => {
    A(el, fadeIn.map((k) => ({ ...k, ...(k.opacity ? { opacity: 0.5 } : {}) })), { pseudoElement: '::after' });
    A(el, fadeIn, { pseudoElement: '::before' });
  });
  const gl = plan.layer.querySelector<SVGPathElement>('.lq-gl')!;
  A(gl, states.map((s, i) => ({ opacity: 0.5 * (split ? clamp01(1 - xs[i] / 0.55) : clamp01((xs[i] - 0.45) / 0.55)), offset: offs(i) })));
  {
    // CSS linear-gradient(150deg, …) over the block's box, as SVG endpoints
    const { x0, x1, top, bottom } = plan.box, w = x1 - x0, h = bottom - top, a = (150 * Math.PI) / 180;
    const L = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a)), dx = Math.sin(a), dy = -Math.cos(a), cx = x0 + w / 2, cy = top + h / 2;
    const g = plan.layer.querySelector('#lqG')!;
    g.setAttribute('x1', String(cx - (dx * L) / 2)); g.setAttribute('y1', String(cy - (dy * L) / 2));
    g.setAttribute('x2', String(cx + (dx * L) / 2)); g.setAttribute('y2', String(cy + (dy * L) / 2));
  }
  const ghosts: HTMLElement[] = plan.ghosts.map((r) => {
    const el = document.createElement('div');
    el.className = 'lq-ghost';
    el.style.cssText = `left:${plan.x0}px;top:${r.top}px;width:${plan.x1 - plan.x0}px;height:${r.bottom - r.top}px`;
    plan.layer.parentElement!.insertBefore(el, plan.layer); // under the glass: same layer order, earlier in the page
    A(el, [{ opacity: 1, offset: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 0, offset: 1 }]);
    return el;
  });

  const done = Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => {});
  plan.texts.forEach((el) => {
    plan.layer.parentElement!.appendChild(el);
    ghosts.push(el);
    A(el, [{ opacity: 1, offset: 0 }, { opacity: 0, offset: 0.1 }, { opacity: 0, offset: 1 }]);
  });
  return { done, cancel: () => { anims.forEach((a) => a.cancel()); ghosts.forEach((g) => g.remove()); } };
}
