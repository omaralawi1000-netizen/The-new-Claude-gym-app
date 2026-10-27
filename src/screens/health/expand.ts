/**
 * A Health section growing into its own page, and back (the mock Omar approved, mock-v8.html, judged 8.5/10 for motion).
 *
 * The page sits in a window of nested layers that only translate: one per corner (L1 top-left, L2 top-right, L3 bottom-left,
 * L4 bottom-right, each rounding its own corner) and L5 holding the content still, so it opens exactly from a card's own
 * four edges, on both axes: no clip-path, no scaling a box, no radius in motion. A hairline rim drawn in pieces (corners
 * that move, edges that stretch only along their length) traces the window's edge while it is a card, and the card's own
 * glass film sits under the page, so the window's first and last frames are the card itself.
 *
 * Swipe the page down from its top and it follows the finger, shrinking a little; let go and it either springs back or
 * shrinks into its card on a spring that starts at the finger's speed: a quick flick lands faster with more bounce, a slow
 * pull settles with almost none.
 * The section's number and chart fly to their places on the page as copies (one spring, transform only); the page's
 * material fades in over the section's own pixels in the first 90 ms, so the first frame equals the section. Close is the
 * exact reverse from wherever it is drawn: tap the section again mid-close and it turns round; tap another one and it opens
 * next. Chips swap pages in place.
 *
 * Hidden by moving it aside (opacity 0 + translateX), never by visibility or pointer-events: Chrome can skip inherited
 * updates on layers holding fill:'both' animations, which left the page stuck invisible or untappable in the mock.
 *
 * Only DOM work here; React renders the page's content into `dsc` and calls in at the right moments. Nothing React owns is
 * ever moved: flying copies and the swap's leaving page are clones.
 */
import { springCurve, SMOOTH, SURFACE } from '../../ui/motion';

/** a spring by its damping ratio and speed (ω, rad/s) */
const spr = (zeta: number, omega: number) => ({ stiffness: omega * omega, damping: 2 * zeta * omega, mass: 1 });
/** the window's edges [left, top, right, bottom] */
type Edges = [number, number, number, number];
const R = 22; // the card's corner

export interface Els { root: HTMLElement; scr: HTMLElement; shade: HTMLElement; det: HTMLElement; L: HTMLElement[]; mat: HTMLElement; dsc: HTMLElement; fly: HTMLElement; edge: HTMLElement; rim: HTMLElement; drag: HTMLElement }
interface Flight { c: HTMLElement; a: HTMLElement; b: HTMLElement; from?: string; tint?: HTMLElement }
interface State { drag?: { dy: number; s: number; home: { x: HTMLElement; r: Box }[] } | null; slide?: boolean; k: string; src: HTMLElement; anims: Animation[]; home?: Animation[]; fl: Flight[]; dim: HTMLElement[]; closing?: boolean; next?: { k: string; src: HTMLElement } | null; out?: Animation[] | null; page?: { e: HTMLElement }[]; done?: (next: { k: string; src: HTMLElement } | null) => void }

const reduced = () => {
  const m = document.documentElement.dataset.motion;
  return m === 'reduce' || (m !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
};
/** Beta trial: the page slides in from the side, home slides out the other way (like Today's sections), no number flight */
const slide = () => document.documentElement.dataset.hxMotion === 'slide';
/** our own animations only: a CSS animation (the screen's scroll-driven top fade) cancelled stays gone until its style changes */
const mine = (a: Animation) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition);
const $$ = (s: string, r: ParentNode) => [...r.querySelectorAll<HTMLElement>(s)];
const curT = (el: Element) => { const s = getComputedStyle(el).transform; return s === 'none' ? 'none' : s; };
const SHARE = ['num', 'unit', 'chart', 'lab', 'cap']; // a label or caption is shared only where the card and the page say the same
/** the slide's curve (open, close and chips): as calm at the start as the spring it replaces, with a short tail (the
 * spring crept its last 10 px a step every other frame) */
const bez = (x1: number, y1: number, x2: number, y2: number) => (x: number) => {
  const f = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (f(x1, x2, m) < x) lo = m; else hi = m; }
  return f(y1, y2, (lo + hi) / 2);
};
export const SLIDE_E = bez(0.3, 0.3, 0.1, 1);
/** the same curve as samples on whole screen pixels of a `w` px trip, so its last fraction of a pixel never holds a frame
 * and then lands with a redraw */
export const slideCurve = (w: number) => {
  const d = window.devicePixelRatio || 1, n = 64;
  const xs = Array.from({ length: n + 1 }, (_, i) => +(Math.round(SLIDE_E(i / n) * w * d) / (w * d)).toFixed(5));
  return { duration: 620, easing: `linear(${xs.join(', ')})` };
};
type Box = { x: number; y: number; w: number; h: number; full?: boolean };
/** the spring's progress at time p (0–1), read off its linear() samples */
const curve = (easing: string) => { const v = easing.slice(7, -1).split(',').map(Number), n = v.length - 1; return (p: number) => { if (p <= 0) return v[0]; if (p >= 1) return v[n]; const f = p * n, i = Math.floor(f); return v[i] + (v[i + 1] - v[i]) * (f - i); }; };
const mix = (a: Box, b: Box, e: number): Box => ({ full: a.full, x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, w: a.w + (b.w - a.w) * e, h: a.h + (b.h - a.h) * e });
/** overlap of a word with a flying copy, by their letters: a line's box is padded above and below its letters, so a label
 * sitting right on its number would always "touch" it (a chart's box is drawn edge to edge, so it counts whole) */
const ink = (b: Box): Box => b.full ? b : ({ x: b.x, y: b.y + b.h * 0.18, w: b.w, h: b.h * 0.64 }); // a chart is all ink
const hits = (a: Box, b: Box, m = 0) => { a = ink(a); b = ink(b); return a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m; };
const near = (a: Box, b: Box) => Math.abs(a.x - b.x) < 6 && Math.abs(a.y - b.y) < 6 && Math.abs(a.w - b.w) < 6;
/** when (0–1 of the move) a word is clear for good: no flying copy over it any more (one within 2 px of its place counts as
 * landed), and (on open) the window's edges past it */
const clearAfter = (r: Box, paths: [Box, Box][], at: (p: number) => number, win?: (e: number) => [number, number]) => {
  let last = -1;
  for (let i = 0; i <= 60; i++) {
    const p = i / 60, e = at(p), w = win?.(e);
    if (paths.some(([a, b]) => { const f = mix(a, b, e); return !near(f, b) && hits(r, f); }) || (w && (r.y < w[0] || r.y + r.h > w[1]))) last = p;
  }
  return last < 0 ? 0 : Math.min(1, last + 1 / 60);
};

/** samples of a move for keyframes: progress 0..1 at N even steps of time */
const N = 24;
/** a home row is gone once the page covers this share of it, inverted (1.15: at 87 %); OCC: how much of the ground the moving window lays over home */
const COVER = 1.15, OCC = 0.9;
const ss = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
/** how much of a box [l, t, r, b] a window covers (0–1, by area) */
const cover = (u: Edges, w: Edges) => (Math.max(0, Math.min(u[2], w[2]) - Math.max(u[0], w[0])) / Math.max(1, u[2] - u[0])) * (Math.max(0, Math.min(u[3], w[3]) - Math.max(u[1], w[1])) / Math.max(1, u[3] - u[1]));
const mixE = (a: Edges, b: Edges, e: number): Edges => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e, a[3] + (b[3] - a[3]) * e];

export class Expander {
  st: State | null = null;
  constructor(private e: Els) {}

  private win() { return springCurve(SURFACE, 0, true); }
  private sm() { return springCurve(SMOOTH); }
  /** the flying copies stay inside the window (a big chart never hangs out of a card that is already small) */
  /** under the page's glass: the screen's own ground, so home under the window is hidden while it moves (outside it stays);
   *  at rest it is gone (the first frame is the card, the last the page: home under it is hidden by then anyway) */
  private get occ() { return this.e.det.querySelector<HTMLElement>('.hx-occ')!; }
  private occMove(f: (e: number) => number, at: (p: number) => number, o: { duration: number; delay?: number }) {
    const kf = Array.from({ length: N + 1 }, (_, i) => ({ offset: i / N, opacity: +f(at(i / N)).toFixed(4) }));
    const occ = this.occ; occ.getAnimations().filter(mine).forEach((a) => a.cancel()); occ.style.opacity = '';
    return this.anim(occ, kf, { ...o, easing: 'linear' });
  }
  private clipFly(win: (e: number) => Edges, at: (p: number) => number, o: { duration: number; delay?: number }) {
    const { W, H } = this.size();
    const kf = Array.from({ length: N + 1 }, (_, i) => { const w = win(at(i / N)); return { offset: i / N, clipPath: `inset(${(w[1] - 1).toFixed(1)}px ${(W - w[2] - 1).toFixed(1)}px ${(H - w[3] - 1).toFixed(1)}px ${(w[0] - 1).toFixed(1)}px round 22px)` }; });
    return this.anim(this.e.fly, kf, { ...o, easing: 'linear' });
  }
  private anim(el: Element, kf: Keyframe[], o: { duration: number; delay?: number; easing?: string }) {
    const r = reduced();
    return el.animate(kf, { fill: 'both', duration: r ? 1 : o.duration, delay: r ? 0 : o.delay ?? 0, easing: o.easing ?? this.sm().easing });
  }
  /** where a block's words and drawings actually are (a full-width block holding one short line counts only that line), so it
   *  shows as soon as its ink is inside the growing card instead of waiting for the card to reach the screen's width */
  private inkBox(el: Element) {
    const b = this.box(el), p = this.e.root.getBoundingClientRect(), rg = document.createRange(), rs: DOMRect[] = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n: Node | null = w.currentNode; n; n = w.nextNode()) {
      if (n.nodeType === 3) { if (!n.textContent?.trim()) continue; rg.selectNodeContents(n); rs.push(...rg.getClientRects()); }
      else if (n instanceof SVGSVGElement || n instanceof HTMLImageElement || n instanceof HTMLCanvasElement) rs.push(n.getBoundingClientRect());
    }
    const v = rs.filter((r) => r.width > 0 && r.height > 0);
    if (!v.length) return b;
    // (a row that scrolls sideways counts only up to its own edge)
    const l = Math.max(b.x, Math.min(...v.map((r) => r.left)) - p.left), r = Math.min(b.x + b.w, Math.max(...v.map((r) => r.right)) - p.left);
    return { ...b, x: l, w: r - l };
  }
  private box(el: Element) { const a = el.getBoundingClientRect(), p = this.e.root.getBoundingClientRect(); return { x: a.left - p.left, y: a.top - p.top, w: a.width, h: a.height }; }
  private size() { return { W: this.e.root.clientWidth, H: this.e.root.clientHeight }; }
  /** a section's box as window edges (clamped to the screen) */
  private edges(src: HTMLElement): Edges {
    const r = this.box(src), { W, H } = this.size();
    const t = Math.max(0, Math.min(H - 1, r.y)), b = Math.max(t + 1, Math.min(H, r.y + r.h));
    const l = Math.max(0, Math.min(W - 1, r.x)), rr = Math.max(l + 1, Math.min(W, r.x + r.w));
    return [l, t, rr, b];
  }
  /** each window layer's move for a window of edges `g`: every corner layer sits relative to the one around it */
  private framesOf(g: Edges): string[] {
    const { W, H } = this.size(), [x0, y0, x1, y1] = g;
    return [`translate(${x0}px,${y0}px)`, `translate(${x1 - W - x0}px,0px)`, `translate(${x0 - x1 + W}px,${y1 - H - y0}px)`, `translate(${x1 - W - x0}px,0px)`, `translate(${W - x1}px,${H - y1}px)`];
  }
  /** the window's edges as its layers are drawn now */
  private edgesNow(ts: string[]): Edges {
    const { W, H } = this.size(), m = ts.map((t) => (t === 'none' ? new DOMMatrix() : new DOMMatrix(t)));
    return [m[0].e, m[0].f, m[0].e + m[1].e + W, m[0].f + m[1].f + m[2].f + H];
  }
  /** the rim's pieces for a window of edges `g`: corners move, edges stretch along their length only */
  private rimOf(g: Edges): string[] {
    const [x0, y0, x1, y1] = g, w = Math.max(0, x1 - x0 - 2 * R), h = Math.max(0, y1 - y0 - 2 * R);
    return [`translate(${x0}px,${y0}px)`, `translate(${x1 - R}px,${y0}px)`, `translate(${x0}px,${y1 - R}px)`, `translate(${x1 - R}px,${y1 - R}px)`,
      `translate(${x0 + R}px,${y0}px) scaleX(${w})`, `translate(${x0 + R}px,${y1 - 1}px) scaleX(${w})`, `translate(${x0}px,${y0 + R}px) scaleY(${h})`, `translate(${x1 - 1}px,${y0 + R}px) scaleY(${h})`];
  }
  private rimParts() { return [...this.e.rim.children] as HTMLElement[]; }
  private clone(b: HTMLElement) {
    const rb = this.box(b);
    const c = b.cloneNode(true) as HTMLElement;
    c.removeAttribute('data-share'); c.style.margin = '0'; c.style.opacity = '';
    // it keeps the page's colours (a label's dot and tint come from the page's --c, which the flying layer doesn't have)
    const cs = getComputedStyle(b); c.style.setProperty('--c', cs.getPropertyValue('--c')); c.style.color = cs.color;
    Object.assign(c.style, { left: `${rb.x}px`, top: `${rb.y}px`, width: `${rb.w}px`, height: `${rb.h}px` });
    this.e.fly.appendChild(c);
    return { c, rb };
  }
  private pairs(src: HTMLElement): [HTMLElement, HTMLElement][] {
    return SHARE.flatMap((k) => { const a = src.querySelector<HTMLElement>(`[data-share="${k}"]`), b = this.e.dsc.querySelector<HTMLElement>(`[data-share="${k}"]`); return a && b ? [[a, b] as [HTMLElement, HTMLElement]] : []; });
  }
  /** a number grows or shrinks to its new size; a chart keeps its size (it is drawn at the same width on both) */
  private scale(a: HTMLElement, ra: { w: number; h: number }, rb: { w: number; h: number }) { return a.dataset.share === 'chart' ? ra.w / rb.w : Math.min(ra.h / rb.h, ra.w / rb.w); }
  /** what of the tapped row steps aside while its number flies: everything but the flying copies' own words */
  private dimOf(src: HTMLElement) {
    if (!src.classList.contains('hx-sec')) return [src];
    const shared = this.pairs(src).map(([a]) => a), out: HTMLElement[] = [];
    const walk = (el: HTMLElement) => { for (const c of [...el.children] as HTMLElement[]) { if (shared.includes(c)) continue; if (shared.some((a) => c.contains(a))) walk(c); else out.push(c); } };
    walk(src);
    return out;
  }
  /** home's lines and blocks (not the tapped row): the growing page covers them and, closing, uncovers them as a card would */
  private homeUnits(src: HTMLElement) {
    const own = src.closest('.hx-row,.hx-card') ?? src;
    return $$('.hx-top,.hx-date,.hx-coach,.hx-sent .hx-w,.hx-goal,.hx-rib,.hx-chap,.hx-row,.hx-card', this.e.scr).filter((x) => x !== own && !x.contains(src) && !own.contains(x));
  }
  /** each home unit shows only the part of it the page is not covering (the page is see-through only once it clears), so the
   *  card's edge uncovers words instead of blinking them; sampled from the same spring as the window */
  private cover(src: HTMLElement, win: (e: number) => Edges, at: (p: number) => number, m: (p: number) => number, o: { duration: number; delay?: number }, paths?: [Box, Box][], leave?: [Box, Box][], g: (p: number) => number = () => 1, shown?: (r: Box) => boolean) {
    // opening: a line a flying copy will cross is gone before the copy gets there (the first 80 ms)
    const lane = (r: Box) => !!leave?.some(([a, b]) => { const l = Math.min(a.x, b.x), rr = Math.max(a.x + a.w, b.x + b.w), t = Math.min(a.y, b.y), bb = Math.max(a.y + a.h, b.y + b.h); return r.x < rr && r.x + r.w > l && r.y < bb && r.y + r.h > t; });
    const k = 80 / o.duration;
    const units = this.homeUnits(src);
    // a sentence leaves whole, never with holes where single words were in the way
    const sentGone = units.some((x) => x.closest('.hx-sent') && lane(this.box(x)));
    return units.map((x) => {
      const r = this.box(x), gone = lane(r) || (sentGone && !!x.closest('.hx-sent'));
      // closing: a row a landing copy passes over waits, unseen, until it has passed (one animation per element: Chrome can
      // leave a row stuck at 0 when several opacity animations on it are cancelled together)
      const c = paths && !(shown?.(r)) ? clearAfter(r, paths, at) : 0, c0 = Math.min(0.38, c), held = (p: number) => (c <= 0 ? 1 : ss((p - c0) / 0.2));
      // only the part on screen counts: a line below the screen's edge is under the page too, and stays hidden until home is back
      const h = this.e.root.clientHeight, t = Math.max(0, r.y), bt = Math.min(h, r.y + r.h), off = bt - t < 1, u: Edges = [r.x, t, r.x + r.w, bt];
      const kf = Array.from({ length: N + 1 }, (_, i) => { const p = i / N; return { offset: p, opacity: off ? (paths && p === 1 ? 1 : 0) : +(ss(1 - cover(u, win(at(p))) * m(p)) * held(p) * g(p) * (gone ? 1 - ss(p / k) : 1)).toFixed(4) }; });
      x.getAnimations().filter((a) => a.id === 'hx-cover').forEach((a) => a.cancel());
      const a = this.anim(x, kf, { ...o, easing: 'linear' }); a.id = 'hx-cover';
      return a;
    });
  }

  /** a pill's number keeps its colour in flight: a second copy of the flying number, in the pill's colour, fades off it */
  private tint(src: HTMLElement, a: HTMLElement, c: HTMLElement) {
    if (!src.classList.contains('hx-pill')) return undefined;
    const g = c.cloneNode(true) as HTMLElement;
    g.style.color = getComputedStyle(a).color;
    g.querySelectorAll<HTMLElement>('*').forEach((x) => { x.style.color = 'inherit'; });
    c.after(g);
    return g;
  }

  /** how far the page sits shifted so its number is on the row's number (else its label on the row's label) */
  private ride(src: HTMLElement): [number, number] {
    const pr = this.pairs(src)[0], lab = src.querySelector('.hx-lab'), plab = this.e.dsc.querySelector('.hx-body .hx-lab');
    const [a, b] = pr ?? (lab && plab ? [lab, plab] : [null, null]);
    if (!a || !b) return [0, 0];
    const ra = this.box(a), rb = this.box(b);
    return [Math.round(ra.x - rb.x), Math.round(ra.y - rb.y)];
  }
  /** the page's blocks that fade (its flying number and chart are copies, they don't) */
  private pageBlocks(paired: Set<HTMLElement>) {
    return $$('.hx-dhead,.hx-chips,.hx-lab,.hx-sub,.hx-rise,.hx-dt,.hx-dsub,.hx-panel,[data-share]', this.e.dsc).filter((x) => !paired.has(x) && !x.parentElement?.closest('.hx-dhead,.hx-chips,.hx-lab,.hx-sub,.hx-rise,.hx-dt,.hx-dsub,.hx-panel,[data-share]'));
  }

  /** React has put the page for `k` into dsc: grow it out of `src` */
  open(k: string, src: HTMLElement) {
    if (this.st) return;
    const { det, fly, dsc, L, mat, edge } = this.e;
    [det, fly, ...$$('*', det)].forEach((x) => x.getAnimations().filter(mine).forEach((a) => a.cancel()));
    fly.replaceChildren();
    dsc.scrollTop = 0;
    det.classList.add('live', 'moving');
    const st: State = { k, src, anims: [], fl: [], dim: [] };
    this.st = st;
    if (slide()) { this.slideOpen(st); return; }
    const { duration: D, easing: E } = this.win();
    const paths: [Box, Box][] = [];
    for (const [a, b] of this.pairs(src)) {
      const ra = this.box(a), { c, rb } = this.clone(b), s = this.scale(a, ra, rb);
      a.style.opacity = '0'; b.style.opacity = '0';
      const tn = this.tint(src, a, c);
      st.fl.push({ c, a, b, tint: tn });
      const from = `translate(${ra.x - rb.x}px,${ra.y - rb.y}px) scale(${s})`;
      const full = true; // a flying number sits in a tight box (line-height 1): all of it is ink, like a chart
      paths.push([{ x: ra.x, y: ra.y, w: rb.w * s, h: rb.h * s, full }, { ...rb, full }]);
      st.anims.push(this.anim(c, [{ transform: from }, { transform: 'none' }], { duration: D, easing: E }));
      if (tn) { this.anim(tn, [{ transform: from }, { transform: 'none' }], { duration: D, easing: E }); this.anim(tn, [{ opacity: 1 }, { opacity: 1, offset: 0.1 }, { opacity: 0, offset: 0.6 }, { opacity: 0 }], { duration: D, easing: 'linear' }); }
    }
    const g0 = this.edges(src), { W, H } = this.size(), full: Edges = [0, 0, W, H];
    const wf = this.framesOf(g0);
    L.forEach((l, i) => st.anims.push(this.anim(l, [{ transform: wf[i] }, { transform: 'none' }], { duration: D, easing: E })));
    // the window starts as the card itself (its glass film and rim); the page's darker material comes in over the first third
    const card = src.classList.contains('hx-card');
    st.anims.push(this.anim(mat, card ? [{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 1 }] : [{ opacity: 0 }, { opacity: 1 }], { duration: card ? D : 90, easing: 'linear' }));
    this.rimMove(st.anims, g0, full, D, E, card ? [1, 0.4] : null);
    st.anims.push(this.anim(edge, [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: D, easing: 'linear' }));
    const at = curve(E);
    const win = (e: number): Edges => mixE(g0, full, e);
    // the page lives inside the card from the first frame: it starts shifted so its number sits on the card's number, and
    // rides with the card's top-left corner to its place (the flying number moves with it), so the card is never empty
    const [ox, oy] = this.ride(src);
    if (card) { src.classList.add('hx-src'); st.anims.push(this.clipFly(win, at, { duration: D })); }
    // a row of home stays until the growing page has nearly covered it (the ground under the window hides what it covers), then waits under it
    // (a card's copies fly inside the window, clipped to it: no row needs to leave their way)
    st.home = this.cover(src, win, at, () => COVER, { duration: D }, undefined, card ? undefined : paths);
    st.anims.push(this.occMove((e) => OCC * ss(e / 0.04) * (1 - ss((e - 0.78) / 0.22)), at, { duration: D }));
    st.anims.push(this.anim(this.e.shade, [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: D, easing: 'linear' }));
    // each block of the page shows as soon as it is inside the card (never cut by an edge) and the card's own words have left
    const fade = reduced() ? 1 : card ? Math.min(60, D * 0.1) : 40, gone = card ? fade / D : 0;
    const paired = new Set(st.fl.map((o) => o.b));
    for (const x of this.pageBlocks(paired)) {
      const r = this.inkBox(x);
      const kf = Array.from({ length: N + 1 }, (_, i) => { const p = i / N, e = at(p), w = win(e), y = r.y + oy * (1 - e), xx = r.x + ox * (1 - e);
        // a block taller than the screen counts only down to the screen's edge (else it never fits and stays hidden)
        const bot = Math.min(y + r.h, H - 12);
        return { offset: p, opacity: i === N ? 1 : +(ss((w[3] - bot) / 12) * ss((y - w[1]) / 12) * ss((w[2] - (xx + r.w)) / 12 + 1) * ss((xx - w[0]) / 12 + 1) * ss((e - (card ? 0.2 : 0.04)) / 0.25) * ss((p - gone) / 0.1)).toFixed(4) }; });
      st.anims.push(this.anim(x, kf, { duration: D, easing: 'linear' }));
    }
    // (measured above with the page at rest; now it starts shifted)
    st.anims.push(this.anim(dsc, [{ transform: `translate(${ox}px,${oy}px)` }, { transform: 'none' }], { duration: D, easing: E }));
    st.dim = this.dimOf(src);
    // a card's own words step aside quickly, then the page's come in (never both at once); a pill's step aside at once
    st.dim.forEach((x) => { x.getAnimations().filter(mine).forEach((a) => a.cancel()); x.style.opacity = '0'; x.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fade, easing: 'linear' }); });
    this.playPage(Math.round(D * 0.08));
    // landed: the page's own number and chart take over from the copies
    Promise.all(st.anims.slice(0, st.fl.length + L.length).map((a) => a.finished)).then(() => {
      if (this.st !== st || st.closing) return;
      st.fl.forEach(({ c, b, tint }) => { b.style.opacity = ''; c.remove(); tint?.remove(); });
      st.fl = [];
    }).catch(() => {});
    // the window's corners square off once its top edge reaches the screen's own (rounded) corner
    this.squareAt(st, D * 0.7);
  }

  /** the rim follows the window from `a` to `b` on the same curve; `o` = its opacity at the start and where it is gone */
  private rimMove(list: Animation[], a: Edges, b: Edges, D: number, E: string, o: [number, number] | null, delay = 0, back = false) {
    const fa = this.rimOf(a), fb = this.rimOf(b);
    this.rimParts().forEach((x, i) => list.push(this.anim(x, [{ transform: fa[i] }, { transform: fb[i] }], { duration: D, easing: E, delay })));
    const rim = this.e.rim;
    rim.getAnimations().forEach((x) => x.cancel());
    if (!o) { list.push(this.anim(rim, [{ opacity: 0 }, { opacity: 0 }], { duration: 1 })); return; }
    list.push(this.anim(rim, back ? [{ opacity: o[0] }, { opacity: o[0], offset: 0.1 }, { opacity: 1, offset: o[1] }, { opacity: 1 }] : [{ opacity: o[0] }, { opacity: 0, offset: o[1] }, { opacity: 0 }], { duration: D, easing: 'linear', delay }));
  }

  private squareAt(st: State, ms: number) {
    // timed by an empty animation, so it runs on the same clock as the motion
    this.e.fly.animate([{ opacity: 1 }, { opacity: 1 }], { duration: reduced() ? 1 : ms }).finished.then(() => { if (this.st === st && !st.closing) this.e.det.classList.remove('moving'); }).catch(() => {});
  }

  /** the page's own small moves once it is open: score rings fill, bars rise, stage bars slide out */
  playPage(delay: number, rings = true, dur?: number) {
    const { dsc } = this.e;
    const sm = dur ? { ...this.sm(), duration: dur } : this.sm();
    for (const ring of rings ? $$('.hx-ring', dsc) : []) {
      const p = Number(ring.dataset.p ?? 0), T = dur ?? 480;
      const rs = ring.querySelector('.hx-rs'), ls = ring.querySelector('.hx-ls');
      if (!rs || !ls || p <= 0) continue;
      const d1 = T * Math.min(1, 0.5 / p), d2 = T - d1;
      this.anim(rs, [{ transform: 'rotate(-180deg)' }, { transform: `rotate(${p >= 0.5 ? 0 : -180 + p * 360}deg)` }], { duration: d1, delay, easing: p > 0.5 ? 'linear' : 'cubic-bezier(.2,.7,.3,1)' });
      if (p > 0.5) this.anim(ls, [{ transform: 'rotate(-180deg)' }, { transform: `rotate(${-180 + (p - 0.5) * 360}deg)` }], { duration: d2, delay: delay + d1, easing: 'cubic-bezier(.2,.7,.3,1)' });
    }
    $$('.hx-col', dsc).forEach((c, i) => this.anim(c, [{ transform: 'translateY(130px)' }, { transform: 'none' }], { duration: sm.duration, delay: delay + 40 + i * 20, easing: sm.easing }));
    $$('.hx-sb', dsc).forEach((c, i) => this.anim(c, [{ transform: 'translateX(-101%)' }, { transform: 'none' }], { duration: sm.duration, delay: delay + 40 + i * 25, easing: sm.easing }));
  }

  /** shrink back into the section, from wherever everything is drawn; `done` once it has landed. `o.v0`: the finger's
   *  speed handed to the spring (progress per second), `o.sp` its spring; without them, ✕ and Back: a calm spring with a
   *  touch of bounce */
  close(done: State['done'], o: { v0?: number; sp?: { stiffness: number; damping: number; mass: number } } = {}) {
    const st = this.st; if (!st || st.closing) return;
    st.closing = true; st.next = null; st.done = done; this.e.det.classList.add('moving');
    if (st.slide) { this.slideClose(st); return; }
    const { L, mat, edge, dsc, drag } = this.e;
    const swiped = !!st.drag;
    const { duration: D, easing: E } = springCurve(o.sp ?? spr(0.8, 11), o.v0 ?? 0, true);
    const delay = swiped ? 0 : 70;
    // a page let go mid-swipe: it carries on from under the finger (the drag's move eases out on the same spring)
    const dg = st.drag ?? null; st.drag = null;
    const dragFrom = drag.style.transform || 'none';
    drag.getAnimations().filter(mine).forEach((a) => a.cancel()); drag.style.transform = '';
    const occO = Number(getComputedStyle(this.occ).opacity), fromL = L.map(curT), matO = getComputedStyle(mat).opacity, edgeO = getComputedStyle(edge).opacity, shO = getComputedStyle(this.e.shade).opacity, rimO = Number(getComputedStyle(this.e.rim).opacity);
    const rimFrom = this.rimParts().map(curT);
    // flying copies: keep the ones still in flight (from where they are now), else lift the page's own copies
    let fl: Flight[] = st.fl.map((o) => ({ ...o, from: curT(o.c) }));
    fl.forEach((o) => { o.tint?.remove(); o.tint = undefined; });
    if (!fl.length) fl = this.pairs(st.src).map(([a, b]) => { const { c } = this.clone(b); a.style.opacity = '0'; b.style.opacity = '0'; return { c, a, b, from: 'none' }; });
    const page = this.pageBlocks(new Set(fl.map((o) => o.b))).map((x) => { const cs = getComputedStyle(x); return { e: x, o: cs.opacity, t: cs.transform }; });
    // the page rides back with the card so its number lands on the card's (from wherever it is now)
    const cm = new DOMMatrix(curT(dsc) === 'none' ? undefined : curT(dsc)), cx = cm.e, cy = cm.f;
    dsc.getAnimations().filter(mine).forEach((a) => a.cancel()); dsc.style.transform = '';
    st.anims.forEach((a) => a.cancel());
    fl.forEach((o) => o.b.getAnimations().filter(mine).forEach((a) => a.cancel()));
    fl.forEach((o) => { o.c.style.transform = o.from ?? 'none'; });
    page.forEach(({ e: x, t }) => { x.getAnimations().filter(mine).forEach((a) => a.cancel()); x.style.transform = t === 'none' ? '' : t; });
    (st.out ?? []).forEach((a) => a.cancel());
    const g1 = this.edges(st.src), wf = this.framesOf(g1);
    const out: Animation[] = [];
    const at = curve(E);
    const card = st.src.classList.contains('hx-card');
    const dimO = st.dim.map((x) => getComputedStyle(x).opacity);
    let wordsAt = 0; while (wordsAt < 0.9 && at(wordsAt) < 0.85) wordsAt += 0.01;
    st.dim.forEach((x, i) => {
      // the card's words come back as the card clears off it, in time to be there when the window lands (a pill: its number lands inside it)
      // (a card's: once the flying number and chart are nearly home, at 85 % of the way, over 120 ms; its label and caption fly)
      const p = x === st.src ? 0.1 : card ? wordsAt : 0.42;
      x.getAnimations().filter(mine).forEach((a) => a.cancel()); x.style.opacity = '0';
      out.push(this.anim(x, [{ opacity: dimO[i] }, { opacity: dimO[i], offset: p }, { opacity: 1, offset: Math.min(1, p + (card ? 120 / D : 0.18)) }, { opacity: 1 }], { duration: D, delay, easing: 'linear' }));
    });
    L.forEach((l, i) => out.unshift(this.anim(l, [{ transform: fromL[i] }, { transform: wf[i] }], { duration: D, delay, easing: E })));
    // the swipe's own move (down and a little smaller) eases out on the same spring as the window
    if (dragFrom !== 'none') out.push(this.anim(drag, [{ transform: dragFrom }, { transform: 'none' }], { duration: D, delay, easing: E }));
    // the page's material clears onto the card's own glass film (always under it), so the last frame is the card
    const pAt = (v: number) => { let q = 0; while (q < 0.95 && at(q) < v) q += 0.01; return q; };
    const mk = dg ? [pAt(0.3), pAt(0.8)] : [0.06, 0.4]; // after a swipe the page stays a page until it is nearly the card
    out.push(this.anim(mat, [{ opacity: matO }, { opacity: matO, offset: mk[0] }, { opacity: 0, offset: mk[1] }, { opacity: 0 }], { duration: D, delay, easing: 'linear' }));
    // where the window is now (its layers' moves, and the swipe's), and where it lands: the card
    const g0 = this.edgesNow(fromL), { W } = this.size();
    const dm = dg ? { dy: dg.dy, s: dg.s } : null;
    const toScreen = (g: Edges, e: number): Edges => {
      if (!dm) return g;
      const ty = dm.dy * (1 - e), sc = dm.s + (1 - dm.s) * e, X = (x: number) => W / 2 + (x - W / 2) * sc;
      return [X(g[0]), ty + g[1] * sc, X(g[2]), ty + g[3] * sc];
    };
    const ownRow = st.src.closest('.hx-row,.hx-card') ?? st.src;
    ownRow.getAnimations().filter((a) => a.id === 'hx-cover').forEach((a) => a.cancel());
    // after a swipe, a row already showing beside the page stays, and the rest come back as the page's edge passes them (the
    // copies fly inside the page, never over a row; a row the page overlaps by two fifths is hidden, so nothing shows through its glass)
    const shown = dm ? (r: Box) => cover([r.x, r.y, r.x + r.w, r.y + r.h], toScreen(g0, 0)) < 0.99 : undefined;
    st.home = this.cover(st.src, (e) => toScreen(mixE(g0, g1, e), e), at, () => COVER, { duration: D, delay }, undefined, undefined, undefined, shown);
    out.push(this.occMove((e) => (occO + (OCC - occO) * ss(e / 0.04)) * (1 - ss((e - 0.88) / 0.12)), at, { duration: D, delay }));
    out.push(...st.home);
    if (card) out.push(this.clipFly((e) => mixE(g0, g1, e), at, { duration: D, delay }));
    this.e.shade.getAnimations().filter(mine).forEach((a) => a.cancel());
    out.push(this.anim(this.e.shade, [{ opacity: shO }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], { duration: D, delay, easing: 'linear' }));
    // the rim comes back as the window turns into the card again
    this.rimParts().forEach((x, i) => x.style.transform = rimFrom[i] === 'none' ? '' : rimFrom[i]);
    this.rimMove(out, g0, g1, D, E, card ? [rimO, 0.45] : null, delay, true);
    // the page's blocks stay inside the card while it shrinks and leave before it reaches the card (an edge never cuts one)
    const [ox, oy] = this.ride(st.src), win = (e: number): Edges => mixE(g0, g1, e), h = this.size().H;
    page.forEach(({ e: x, o }) => {
      const r = this.inkBox(x), o0 = Number(o);
      const kf = Array.from({ length: N + 1 }, (_, i) => { const p = i / N, e = at(p), w = win(e), y = r.y + cy + (oy - cy) * e, xx = r.x + cx + (ox - cx) * e;
        return { offset: p, opacity: +(o0 * ss((w[3] - Math.min(y + r.h, h - 12)) / 12) * ss((y - w[1]) / 12) * ss((w[2] - (xx + r.w)) / 12 + 1) * ss((xx - w[0]) / 12 + 1) * (1 - ss(p / (card ? Math.min(0.1, (dg ? 60 : 90) / D) : 0.2)))).toFixed(4) }; });
      this.anim(x, kf, { duration: D, delay, easing: 'linear' });
    });
    out.push(this.anim(dsc, [{ transform: `translate(${cx}px,${cy}px)` }, { transform: `translate(${ox}px,${oy}px)` }], { duration: D, delay, easing: E }));
    out.push(this.anim(edge, [{ opacity: edgeO }, { opacity: 0, offset: 0.35 }, { opacity: 0 }], { duration: D, easing: 'linear' }));
    fl.forEach(({ c, a }) => {
      const ra = this.box(a), rb = { x: parseFloat(c.style.left), y: parseFloat(c.style.top), w: parseFloat(c.style.width), h: parseFloat(c.style.height) };
      const s = this.scale(a, ra, rb);
      out.push(this.anim(c, [{ transform: c.style.transform || 'none' }, { transform: `translate(${ra.x - rb.x}px,${ra.y - rb.y}px) scale(${s})` }], { duration: D, delay, easing: E }));
      // a pill's number takes its colour back as it lands
      const tn = this.tint(st.src, a, c);
      if (tn) {
        const o = fl.find((x) => x.c === c); if (o) o.tint = tn;
        out.push(this.anim(tn, [{ transform: c.style.transform || 'none' }, { transform: `translate(${ra.x - rb.x}px,${ra.y - rb.y}px) scale(${s})` }], { duration: D, delay, easing: E }));
        out.push(this.anim(tn, [{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1, offset: 0.9 }, { opacity: 1 }], { duration: D, easing: 'linear' }));
      }
    });
    st.out = out; st.page = page; st.fl = fl;
    out[0].finished.then(() => {
      if (this.st !== st) return;
      if (st.closing) {
        fl.forEach(({ a }) => { a.style.opacity = ''; });
        st.dim.forEach((x) => { x.style.opacity = ''; });
        const nx = st.next ?? null;
        requestAnimationFrame(() => { this.closeNow(); st.done?.(nx); });
        return;
      }
      // tapped again mid-close: back on the page
      fl.forEach(({ c, b, tint }) => { b.style.opacity = ''; c.remove(); tint?.remove(); });
      st.fl = []; st.out = null;
      this.e.scr.getAnimations().filter(mine).forEach((a) => a.cancel()); this.anim(this.e.scr, [{ opacity: 0 }, { opacity: 0 }], { duration: 1 });
      const lt = L.map(curT);
      out.forEach((a) => a.cancel());
      st.home = this.homeUnits(st.src).map((x) => { const a = this.anim(x, [{ opacity: 0 }, { opacity: 0 }], { duration: 1 }); a.id = 'hx-cover'; return a; });
      st.dim.forEach((x) => { x.style.opacity = '0'; });
      fl.forEach(({ a }) => { a.style.opacity = '0'; });
      this.squareAt(st, 300);
      const sm = this.sm();
      L.forEach((l, i) => { const t = lt[i]; if (t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)') this.anim(l, [{ transform: t }, { transform: 'none' }], { duration: sm.duration, easing: sm.easing }); });
      this.anim(this.e.rim, [{ opacity: 0 }, { opacity: 0 }], { duration: 1 });
    }).catch(() => {});
  }

  /** a finger on the page's top pulls it down: true if it may (open, still, not mid-move) */
  dragStart(): boolean {
    const st = this.st;
    if (!st || st.closing || st.slide || st.fl.length || this.e.det.classList.contains('moving') || reduced()) return false;
    this.e.det.classList.add('moving'); // a card again while it is held: rounded corners
    // home shows in the strip the page uncovers (from its covered state)
    const home = this.homeUnits(st.src).map((x) => { x.getAnimations().filter((a) => a.id === 'hx-cover').forEach((a) => a.cancel()); x.style.opacity = '0'; return { x, r: this.box(x) }; });
    st.drag = { dy: 0, s: 1, home };
    return true;
  }
  /** the finger is `dy` px below where it started: the page follows it 1:1, shrinking a little as it goes */
  dragMove(dy: number) {
    const d = this.st?.drag; if (!d) return;
    const { W, H } = this.size();
    d.dy = dy > 0 ? dy : dy * 0.25; // up past the start: a little give, no more
    d.s = 1 - (Math.min(Math.max(0, d.dy), H) / H) * 0.22;
    this.e.drag.style.transform = `translateY(${d.dy}px) scale(${d.s})`;
    const win: Edges = [(W / 2) * (1 - d.s), d.dy, (W / 2) * (1 + d.s), d.dy + H * d.s];
    for (const { x, r } of d.home) x.style.opacity = String(+ss(1 - cover([r.x, r.y, r.x + r.w, r.y + r.h], win) * COVER).toFixed(3));
    this.occ.style.opacity = String(+(OCC * ss(Math.max(0, d.dy) / 60)).toFixed(3));
  }
  /** let go at `vy` px/ms (down positive): close into the card past a pull or a flick, else spring back. Returns whether it closes. */
  dragEnd(vy: number): boolean {
    const st = this.st, d = st?.drag; if (!st || !d) return false;
    if (d.dy > 110 || (vy > 0.5 && d.dy > 12)) return true;
    // back up to the page on a calm spring that starts at the finger's speed
    st.drag = null;
    const v0 = d.dy > 1 ? Math.max(-6, Math.min(6, (-vy * 1000) / d.dy)) : 0;
    const { duration: D, easing: E } = springCurve(spr(0.82, 15), v0, true), at = curve(E);
    const { W, H } = this.size(), from = this.e.drag.style.transform;
    this.e.drag.style.transform = '';
    const a = this.anim(this.e.drag, [{ transform: from }, { transform: 'none' }], { duration: D, easing: E });
    for (const { x, r } of d.home) {
      const kf = Array.from({ length: N + 1 }, (_, i) => { const e = at(i / N), dy = d.dy * (1 - e), s = d.s + (1 - d.s) * e;
        return { offset: i / N, opacity: +ss(1 - cover([r.x, r.y, r.x + r.w, r.y + r.h], [(W / 2) * (1 - s), dy, (W / 2) * (1 + s), dy + H * s]) * COVER).toFixed(3) }; });
      x.style.opacity = '';
      const h = this.anim(x, kf, { duration: D, easing: 'linear' }); h.id = 'hx-cover';
    }
    const o0 = Number(this.occ.style.opacity || 0); this.occMove((e) => o0 * (1 - e), at, { duration: D });
    a.finished.then(() => { if (this.st === st && !st.closing && !st.drag) this.e.det.classList.remove('moving'); }).catch(() => {});
    return false;
  }
  /** the spring a swipe closes on: a quick flick lands faster and bouncier, a slow pull calmly */
  swipeSpring(vy: number) {
    const st = this.st, d = st?.drag; if (!st || !d) return {};
    const k = Math.max(0, Math.min(1, vy / 2.5));
    const sp = spr(0.88 - 0.08 * k, 10 + 6 * k);
    // the window's top edge goes from under the finger to the card's top: hand it the finger's speed
    const travel = this.edges(st.src)[1] - d.dy;
    const v0 = travel > 40 && vy > 0 ? Math.min(6, (vy * 1000) / travel) : 0;
    return { sp, v0 };
  }

  /** the same section tapped while closing: turn round */
  reopen() {
    const st = this.st; if (!st || !st.closing || !st.out) return;
    st.closing = false; st.next = null;
    st.out.forEach((a) => a.reverse());
    if (st.slide) return;
    (st.page ?? []).forEach(({ e: x }) => { const cs = getComputedStyle(x), o = cs.opacity, t = cs.transform; x.getAnimations().filter(mine).forEach((a) => a.cancel()); x.style.transform = ''; this.anim(x, [{ opacity: o, transform: t }, { opacity: 1, transform: 'none' }], { duration: 200, delay: 60, easing: 'linear' }); });
  }

  /** a tap on a section or pill: open, turn round, or queue it to open once this one has closed */
  tap(k: string, src: HTMLElement, openIt: () => void) {
    const st = this.st;
    if (!st) { openIt(); return; }
    if (st.closing) { if (k === st.k) this.reopen(); else st.next = { k, src }; }
  }

  /** the two screens sit side by side with a gap, on one spring: home leaves to the left as the page arrives from the right */
  private slideOpen(st: State) {
    const { L, mat, scr } = this.e, W = this.e.root.clientWidth + 48;
    st.slide = true;
    this.e.det.classList.remove('moving'); // square the whole time: a shape change at the end would pop
    L.forEach((l) => { l.style.transform = ''; });
    st.anims.push(this.anim(mat, [{ opacity: 1 }, { opacity: 1 }], { duration: 1 }));
    // the page's own number and chart stay where they are (nothing flies)
    $$('[data-share]', this.e.dsc).forEach((x) => { x.style.opacity = ''; });
    const o = slideCurve(W);
    st.anims.push(this.anim(L[0], [{ transform: `translateX(${W}px)` }, { transform: 'none' }], o));
    st.anims.push(this.anim(scr, [{ transform: 'none' }, { transform: `translateX(${-W}px)` }], o));
    this.wave(1, o.duration, st.anims[1]);
    this.playPage(200, true, o.duration - 200);
    st.anims[1].finished.then(() => { if (this.st === st && !st.closing) this.e.det.classList.remove('moving'); }).catch(() => {});
  }
  /** the page's blocks arrive as a soft wave: each trails the one above it by a few px and they close up as the page lands
   *  (same curve and end as the slide, so nothing moves after it) */
  private wave(dir: number, duration: number, clock?: Animation) {
    $$(':scope > .hx-page > .hx-body > *', this.e.dsc).slice(0, 12).forEach((x, i) => {
      x.getAnimations().filter((a) => a.id === 'hx-wave').forEach((a) => a.cancel());
      const k = dir * Math.min(84, 14 + i * 10), a = this.anim(x, [{ transform: `translateX(${k}px)` }, { transform: 'none' }], { duration, easing: slideCurve(Math.abs(k)).easing });
      a.id = 'hx-wave';
      // on the page's own clock, so every block lands on the same frame as the page
      if (clock) clock.ready.then(() => { if (clock.startTime !== null) a.startTime = clock.startTime; }).catch(() => {});
    });
  }
  private slideClose(st: State) {
    this.e.det.classList.remove('moving');
    const { L, scr } = this.e, W = this.e.root.clientWidth + 48;
    const o = slideCurve(W);
    const from = [curT(L[0]), curT(scr)];
    L[0].getAnimations().filter(mine).forEach((a) => a.cancel()); scr.getAnimations().filter(mine).forEach((a) => a.cancel());
    const out = [this.anim(L[0], [{ transform: from[0] }, { transform: `translateX(${W}px)` }], o), this.anim(scr, [{ transform: from[1] }, { transform: 'none' }], o)];
    st.out = out;
    out[0].finished.then(() => {
      if (this.st !== st || !st.closing) return;
      const nx = st.next ?? null;
      requestAnimationFrame(() => { this.closeNow(); st.done?.(nx); });
    }).catch(() => {});
  }

  closeNow() {
    const { det, fly, L, mat, dsc, root, rim, drag } = this.e;
    fly.replaceChildren();
    this.st?.src.classList.remove('hx-src');
    [rim, drag, ...this.rimParts()].forEach((x) => { x.getAnimations().filter(mine).forEach((a) => a.cancel()); x.style.transform = ''; });
    this.st?.dim.forEach((x) => { x.getAnimations().filter(mine).forEach((a) => a.cancel()); x.style.opacity = ''; });
    det.classList.remove('live', 'moving');
    // home back as it was; a style write after the cancel makes Chrome recompute it (it can keep a cancelled 0 otherwise)
    $$('*', this.e.scr).forEach((x) => { const c = x.getAnimations().filter((a) => a.id === 'hx-cover'); if (!c.length) return; c.forEach((a) => a.cancel()); x.style.opacity = '1'; x.style.opacity = ''; });
    dsc.getAnimations().filter(mine).forEach((a) => a.cancel()); dsc.style.transform = '';
    [...L, mat, this.e.scr, this.e.shade, fly, this.occ].forEach((x) => x.getAnimations().filter(mine).forEach((a) => a.cancel()));
    this.occ.style.opacity = '';
    $$('[data-share]', root).forEach((x) => { x.style.opacity = ''; });
    $$('*', dsc).forEach((x) => { x.getAnimations().filter(mine).forEach((a) => a.cancel()); x.style.transform = ''; x.style.opacity = ''; });
    this.st = null;
  }

  /** a chip: before React swaps the page, the old one is copied out to leave; `newSrc` is the section the page now belongs to */
  swapOut(k: string, newSrc: HTMLElement, dir: number, scroller: HTMLElement) {
    const st = this.st; if (!st || st.closing) return null;
    st.fl.forEach(({ c, b }) => { b.style.opacity = ''; c.remove(); }); st.fl = [];
    $$('[data-share]', st.src).forEach((x) => { x.style.opacity = ''; });
    st.dim.forEach((x) => { x.getAnimations().filter(mine).forEach((a) => a.cancel()); x.style.opacity = ''; });
    // home, hidden under the page: bring the new section into view so close lands on screen
    // (only as far as needed: a section already on screen keeps home where it was)
    const top = newSrc.offsetTop - scroller.scrollTop, room = scroller.clientHeight - 120;
    if (top < 60) scroller.scrollTop = Math.max(0, newSrc.offsetTop - 60);
    else if (top + newSrc.offsetHeight > room) scroller.scrollTop = newSrc.offsetTop + newSrc.offsetHeight - room;
    // the row the page came from hides under it now (home is covered, not gone, and the page is see-through)
    const was = st.src.closest('.hx-row,.hx-card') ?? st.src;
    if (!st.slide) { const a = this.anim(was, [{ opacity: 0 }, { opacity: 0 }], { duration: 1 }); a.id = 'hx-cover'; }
    st.src.classList.remove('hx-src');
    st.k = k; st.src = newSrc; st.dim = st.slide ? [] : this.dimOf(newSrc);
    if (!st.slide && newSrc.classList.contains('hx-card')) newSrc.classList.add('hx-src');
    st.dim.forEach((x) => { x.style.opacity = '0'; });
    if (!st.slide) $$('[data-share]', newSrc).forEach((x) => { x.style.opacity = '0'; });
    const { dsc, L } = this.e;
    const old = $$(':scope > .hx-page > .hx-body > *', dsc);
    // the page may still be sliding in from a chip tapped a moment ago: it leaves from where it is drawn
    const body = dsc.querySelector(':scope > .hx-page > .hx-body'), cx = body && curT(body) !== 'none' ? new DOMMatrix(curT(body)).e : 0;
    const first = old[0] ? old[0].getBoundingClientRect().top - dsc.getBoundingClientRect().top : 0;
    const ghost = document.createElement('div');
    ghost.className = 'hx-ghost';
    ghost.style.cssText = `position:absolute;left:0;right:0;top:${first}px;padding:0 20px;pointer-events:none;z-index:1`;
    ghost.style.setProperty('--c', getComputedStyle(this.e.det).getPropertyValue('--c')); // its own colour, not the next page's
    old.forEach((x) => { const c = x.cloneNode(true) as HTMLElement; c.style.opacity = getComputedStyle(x).opacity; c.style.transform = ''; ghost.appendChild(c); });
    L[L.length - 1].appendChild(ghost);
    // pages sit side by side in chip order: the old one slides out as the new one slides in, on one spring
    const W = dsc.clientWidth + 48, sc = slideCurve(W); // a gap between the two pages; the open/close slide's curve
    ghost.animate([{ transform: `translateX(${cx}px)` }, { transform: `translateX(${cx - dir * W}px)` }], { duration: reduced() ? 1 : sc.duration, fill: 'both', easing: sc.easing }).finished.then(() => ghost.remove()).catch(() => ghost.remove());
    return dir;
  }
  /** React has rendered the new page: it arrives from the side the chip sits on */
  swapIn(dir: number) {
    const { dsc } = this.e;
    const W = dsc.clientWidth + 48, sc = slideCurve(W);
    this.playPage(200, false, sc.duration - 200);
    // the body moves as one layer that stays a layer (dropping it at the end would snap the text by a pixel)
    const body = $$(':scope > .hx-page > .hx-body', dsc).map((x) => this.anim(x, [{ transform: `translateX(${dir * W}px)` }, { transform: 'none' }], sc));
    this.wave(dir, sc.duration, body[0]);
  }
}
