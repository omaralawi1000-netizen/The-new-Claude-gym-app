/**
 * A Health section growing into its own page, and back (the mock Omar approved, mock-v8.html, judged 8.5/10 for motion).
 *
 * The page sits in a window of three nested layers that only translate (L1 moves the top edge, L2 the bottom, L3 holds the
 * content still), so it opens exactly from the section's own edges: no clip-path, no scaling a box, no radius in motion.
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

export interface Els { root: HTMLElement; scr: HTMLElement; shade: HTMLElement; det: HTMLElement; L: [HTMLElement, HTMLElement, HTMLElement]; mat: HTMLElement; dsc: HTMLElement; fly: HTMLElement; edge: HTMLElement }
interface Flight { c: HTMLElement; a: HTMLElement; b: HTMLElement; from?: string; tint?: HTMLElement }
interface State { slide?: boolean; k: string; src: HTMLElement; anims: Animation[]; home?: Animation[]; fl: Flight[]; dim: HTMLElement[]; closing?: boolean; next?: { k: string; src: HTMLElement } | null; out?: Animation[] | null; page?: { e: HTMLElement }[]; done?: (next: { k: string; src: HTMLElement } | null) => void }

const reduced = () => {
  const m = document.documentElement.dataset.motion;
  return m === 'reduce' || (m !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
};
/** Beta trial: the page slides in from the side, home slides out the other way (like Today's sections), no number flight */
const slide = () => document.documentElement.dataset.hxMotion === 'slide';
const $$ = (s: string, r: ParentNode) => [...r.querySelectorAll<HTMLElement>(s)];
const curT = (el: Element) => { const s = getComputedStyle(el).transform; return s === 'none' ? 'none' : s; };
const SHARE = ['num', 'unit', 'chart'];
/** the slide's curve (open, close and chips): as calm at the start as the spring it replaces, with a short tail (the
 * spring crept its last 10 px a step every other frame) */
const bez = (x1: number, y1: number, x2: number, y2: number) => (x: number) => {
  const f = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (f(x1, x2, m) < x) lo = m; else hi = m; }
  return f(y1, y2, (lo + hi) / 2);
};
const SLIDE_E = bez(0.3, 0.3, 0.1, 1);
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
const ss = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
/** how much of a line [t, b] a window [wt, wb] covers (0–1) */
const cover = (t: number, b: number, w: [number, number]) => Math.max(0, Math.min(b, w[1]) - Math.max(t, w[0])) / Math.max(1, b - t);

export class Expander {
  st: State | null = null;
  constructor(private e: Els) {}

  private win() { return springCurve(SURFACE, 0, true); }
  private sm() { return springCurve(SMOOTH); }
  private anim(el: Element, kf: Keyframe[], o: { duration: number; delay?: number; easing?: string }) {
    const r = reduced();
    return el.animate(kf, { fill: 'both', duration: r ? 1 : o.duration, delay: r ? 0 : o.delay ?? 0, easing: o.easing ?? this.sm().easing });
  }
  private box(el: Element) { const a = el.getBoundingClientRect(), p = this.e.root.getBoundingClientRect(); return { x: a.left - p.left, y: a.top - p.top, w: a.width, h: a.height }; }
  /** where each window layer starts so the window is exactly the section's box (clamped to the screen) */
  private frames(src: HTMLElement): string[] {
    const r = this.box(src), h = this.e.root.clientHeight;
    const t = Math.max(0, Math.min(h - 1, r.y)), b = Math.max(t + 1, Math.min(h, r.y + r.h));
    return [`translateY(${t}px)`, `translateY(${b - h - t}px)`, `translateY(${h - b}px)`];
  }
  private clone(b: HTMLElement) {
    const rb = this.box(b);
    const c = b.cloneNode(true) as HTMLElement;
    c.removeAttribute('data-share'); c.style.margin = '0'; c.style.opacity = '';
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
  private dimOf(src: HTMLElement) { return src.classList.contains('hx-sec') ? $$('.hx-lab,.hx-sub,.hx-n,.hx-rside,.hx-chev', src).filter((x) => !this.pairs(src).some(([a]) => a === x || a.contains(x))) : [src]; }
  /** home's lines and blocks (not the tapped row): the growing page covers them and, closing, uncovers them as a card would */
  private homeUnits(src: HTMLElement) {
    const own = src.closest('.hx-row') ?? src;
    return $$('.hx-top,.hx-date,.hx-coach,.hx-sent .hx-w,.hx-goal,.hx-rib,.hx-chap,.hx-row', this.e.scr).filter((x) => x !== own && !x.contains(src) && !own.contains(x));
  }
  /** each home unit shows only the part of it the page is not covering (the page is see-through only once it clears), so the
   *  card's edge uncovers words instead of blinking them; sampled from the same spring as the window */
  private cover(src: HTMLElement, win: (e: number) => [number, number], at: (p: number) => number, m: (p: number) => number, o: { duration: number; delay?: number }, paths?: [Box, Box][], leave?: [Box, Box][], g: (p: number) => number = () => 1) {
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
      const c = paths ? clearAfter(r, paths, at) : 0, c0 = Math.min(0.38, c), held = (p: number) => (c <= 0 ? 1 : ss((p - c0) / 0.2));
      // only the part on screen counts: a line below the screen's edge is under the page too, and stays hidden until home is back
      const h = this.e.root.clientHeight, t = Math.max(0, r.y), bt = Math.min(h, r.y + r.h), off = bt - t < 1;
      const kf = Array.from({ length: N + 1 }, (_, i) => { const p = i / N; return { offset: p, opacity: off ? (paths && p === 1 ? 1 : 0) : +(ss(1 - cover(t, bt, win(at(p))) * m(p)) * held(p) * g(p) * (gone ? 1 - ss(p / k) : 1)).toFixed(4) }; });
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
  private ride(src: HTMLElement) {
    const pr = this.pairs(src)[0], lab = src.querySelector('.hx-lab'), plab = this.e.dsc.querySelector('.hx-body .hx-lab');
    const [a, b] = pr ?? (lab && plab ? [lab, plab] : [null, null]);
    return a && b ? Math.round(this.box(a).y - this.box(b).y) : 0;
  }
  /** the page's blocks that fade (its flying number and chart are copies, they don't) */
  private pageBlocks(paired: Set<HTMLElement>) {
    return $$('.hx-dhead,.hx-chips,.hx-lab,.hx-sub,.hx-rise,.hx-dt,.hx-dsub,.hx-panel,[data-share]', this.e.dsc).filter((x) => !paired.has(x) && !x.parentElement?.closest('.hx-dhead,.hx-chips,.hx-lab,.hx-sub,.hx-rise,.hx-dt,.hx-dsub,.hx-panel,[data-share]'));
  }

  /** React has put the page for `k` into dsc: grow it out of `src` */
  open(k: string, src: HTMLElement) {
    if (this.st) return;
    const { det, fly, dsc, L, mat, edge } = this.e;
    [det, fly, ...$$('*', det)].forEach((x) => x.getAnimations().forEach((a) => a.cancel()));
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
    const wf = this.frames(src);
    L.forEach((l, i) => st.anims.push(this.anim(l, [{ transform: wf[i] }, { transform: 'none' }], { duration: D, easing: E })));
    st.anims.push(this.anim(mat, [{ opacity: 0 }, { opacity: 1 }], { duration: 90, easing: 'linear' }));
    st.anims.push(this.anim(edge, [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: D, easing: 'linear' }));
    const at = curve(E), sr = this.box(src), h = this.e.root.clientHeight;
    const wt = Math.max(0, Math.min(h - 1, sr.y)), wb = Math.max(wt + 1, Math.min(h, sr.y + sr.h));
    const win = (e: number): [number, number] => [wt * (1 - e), h + (wb - h) * (1 - e)];
    // the page lives inside the card from the first frame: it starts shifted so its number sits on the row's number, and
    // rides up with the card's top edge to its place (the flying number moves with it), so the card is never an empty box
    const oy = this.ride(src);
    // home is covered by the page as it grows, line by line, and steps back a little around it
    st.home = this.cover(src, win, at, () => 1, { duration: D }, undefined, paths, (p) => 1 - ss((p - 0.08) / 0.3));
    st.anims.push(this.anim(this.e.shade, [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: D, easing: 'linear' }));
    // each block of the page shows as soon as it is inside the card (never cut by an edge), from a fifth of the way on
    const paired = new Set(st.fl.map((o) => o.b));
    for (const x of this.pageBlocks(paired)) {
      const r = this.box(x);
      const kf = Array.from({ length: N + 1 }, (_, i) => { const p = i / N, e = at(p), w = win(e), y = r.y + oy * (1 - e);
        // a block taller than the screen counts only down to the screen's edge (else it never fits and stays hidden)
        const bot = Math.min(y + r.h, h - 12);
        return { offset: p, opacity: i === N ? 1 : +(ss((w[1] - bot) / 12) * ss((y - w[0]) / 12) * ss((e - 0.04) / 0.3)).toFixed(4) }; });
      st.anims.push(this.anim(x, kf, { duration: D, easing: 'linear' }));
    }
    // (measured above with the page at rest; now it starts shifted)
    st.anims.push(this.anim(dsc, [{ transform: `translateY(${oy}px)` }, { transform: 'none' }], { duration: D, easing: E }));
    st.dim = this.dimOf(src);
    st.dim.forEach((x) => { x.getAnimations().forEach((a) => a.cancel()); x.style.opacity = '0'; x.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced() ? 1 : 40, easing: 'linear' }); });
    this.playPage(Math.round(D * 0.08));
    // landed: the page's own number and chart take over from the copies
    Promise.all(st.anims.slice(0, st.fl.length + 3).map((a) => a.finished)).then(() => {
      if (this.st !== st || st.closing) return;
      st.fl.forEach(({ c, b, tint }) => { b.style.opacity = ''; c.remove(); tint?.remove(); });
      st.fl = [];
    }).catch(() => {});
    // the window's corners square off once its top edge reaches the screen's own (rounded) corner
    this.squareAt(st, D * 0.7);
  }

  private squareAt(st: State, ms: number) {
    // timed by an empty animation, so it runs on the same clock as the motion
    this.e.fly.animate([{ opacity: 1 }, { opacity: 1 }], { duration: reduced() ? 1 : ms }).finished.then(() => { if (this.st === st && !st.closing) this.e.det.classList.remove('moving'); }).catch(() => {});
  }

  /** the page's own small moves once it is open: score rings fill, bars rise, stage bars slide out */
  playPage(delay: number, rings = true) {
    const { dsc } = this.e;
    const sm = this.sm();
    for (const ring of rings ? $$('.hx-ring', dsc) : []) {
      const p = Number(ring.dataset.p ?? 0), T = 480;
      const rs = ring.querySelector('.hx-rs'), ls = ring.querySelector('.hx-ls');
      if (!rs || !ls || p <= 0) continue;
      const d1 = T * Math.min(1, 0.5 / p), d2 = T - d1;
      this.anim(rs, [{ transform: 'rotate(-180deg)' }, { transform: `rotate(${p >= 0.5 ? 0 : -180 + p * 360}deg)` }], { duration: d1, delay, easing: p > 0.5 ? 'linear' : 'cubic-bezier(.2,.7,.3,1)' });
      if (p > 0.5) this.anim(ls, [{ transform: 'rotate(-180deg)' }, { transform: `rotate(${-180 + (p - 0.5) * 360}deg)` }], { duration: d2, delay: delay + d1, easing: 'cubic-bezier(.2,.7,.3,1)' });
    }
    $$('.hx-col', dsc).forEach((c, i) => this.anim(c, [{ transform: 'translateY(130px)' }, { transform: 'none' }], { duration: sm.duration, delay: delay + 40 + i * 20, easing: sm.easing }));
    $$('.hx-sb', dsc).forEach((c, i) => this.anim(c, [{ transform: 'translateX(-101%)' }, { transform: 'none' }], { duration: sm.duration, delay: delay + 40 + i * 25, easing: sm.easing }));
  }

  /** shrink back into the section, from wherever everything is drawn; `done` once it has landed */
  close(done: State['done']) {
    const st = this.st; if (!st || st.closing) return;
    st.closing = true; st.next = null; st.done = done; this.e.det.classList.add('moving');
    if (st.slide) { this.slideClose(st); return; }
    const { L, mat, edge, dsc } = this.e;
    const { duration: D, easing: E } = this.win();
    const fromL = L.map(curT), matO = getComputedStyle(mat).opacity, edgeO = getComputedStyle(edge).opacity, shO = getComputedStyle(this.e.shade).opacity;
    // flying copies: keep the ones still in flight (from where they are now), else lift the page's own copies
    let fl: Flight[] = st.fl.map((o) => ({ ...o, from: curT(o.c) }));
    fl.forEach((o) => { o.tint?.remove(); o.tint = undefined; });
    if (!fl.length) fl = this.pairs(st.src).map(([a, b]) => { const { c } = this.clone(b); a.style.opacity = '0'; b.style.opacity = '0'; return { c, a, b, from: 'none' }; });
    const page = this.pageBlocks(new Set(fl.map((o) => o.b))).map((x) => { const cs = getComputedStyle(x); return { e: x, o: cs.opacity, t: cs.transform }; });
    // the page rides back down with the card so its number lands on the row's (from wherever it is now)
    const cy = new DOMMatrix(curT(dsc) === 'none' ? undefined : curT(dsc)).f;
    dsc.getAnimations().forEach((a) => a.cancel()); dsc.style.transform = '';
    st.anims.forEach((a) => a.cancel());
    fl.forEach((o) => o.b.getAnimations().forEach((a) => a.cancel()));
    fl.forEach((o) => { o.c.style.transform = o.from ?? 'none'; });
    page.forEach(({ e: x, t }) => { x.getAnimations().forEach((a) => a.cancel()); x.style.transform = t === 'none' ? '' : t; });
    (st.out ?? []).forEach((a) => a.cancel());
    const wf = this.frames(st.src);
    const out: Animation[] = [];
    // the section's own words come back as soon as the copies landing on it have left their spot (never under a number)
    const at = curve(E), paths: [Box, Box][] = fl.map(({ c, a }) => {
      const rb = { x: parseFloat(c.style.left), y: parseFloat(c.style.top), w: parseFloat(c.style.width), h: parseFloat(c.style.height) };
      const m = new DOMMatrix(c.style.transform && c.style.transform !== 'none' ? c.style.transform : undefined), ra = this.box(a), s = this.scale(a, ra, rb);
      const full = true;
      return [{ x: rb.x + m.e, y: rb.y + m.f, w: rb.w * m.a, h: rb.h * m.d, full }, { x: ra.x, y: ra.y, w: rb.w * s, h: rb.h * s, full }];
    });
    const dimO = st.dim.map((x) => getComputedStyle(x).opacity);
    st.dim.forEach((x, i) => {
      const p = x === st.src ? 0.2 : 0.42; // the row's words come back as the card clears off it (a pill: its number lands inside it)
      x.getAnimations().forEach((a) => a.cancel()); x.style.opacity = '0';
      out.push(this.anim(x, [{ opacity: dimO[i] }, { opacity: dimO[i], offset: p }, { opacity: 1, offset: p + 0.18 }, { opacity: 1 }], { duration: D, delay: 70, easing: 'linear' }));
    });
    L.forEach((l, i) => out.unshift(this.anim(l, [{ transform: fromL[i] }, { transform: wf[i] }], { duration: D, delay: 70, easing: E })));
    // the material clears between 25 % and 80 %: the section is already back underneath, so close ends on the settled screen
    // the page stays a card while its edges start to uncover home, then clears from 12 % to 45 % as home comes back under
    // it (never an empty box: its words leave as home's arrive)
    // the card stays a card (its edges uncover home) until it is nearly the row, then clears onto it
    const m0 = Number(matO), mo = (p: number) => m0 * (1 - ss((p - 0.06) / 0.34));
    out.push(this.anim(mat, [{ opacity: matO }, { opacity: matO, offset: 0.06 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], { duration: D, delay: 70, easing: 'linear' }));
    // where the window is now (its layers' moves), and where it lands: the row
    const h = this.e.root.clientHeight, ty = (t: string) => (t === 'none' ? 0 : new DOMMatrix(t).f);
    const t0 = ty(fromL[0]), b0 = ty(fromL[1]) + h + t0, wr = this.box(st.src), wt = Math.max(0, Math.min(h - 1, wr.y)), wb = Math.max(wt + 1, Math.min(h, wr.y + wr.h));
    const ownRow = st.src.closest('.hx-row') ?? st.src;
    ownRow.getAnimations().filter((a) => a.id === 'hx-cover').forEach((a) => a.cancel());
    st.home = this.cover(st.src, (e) => [t0 + (wt - t0) * e, b0 + (wb - b0) * e], at, mo, { duration: D, delay: 70 }, paths);
    out.push(...st.home);
    this.e.shade.getAnimations().forEach((a) => a.cancel());
    out.push(this.anim(this.e.shade, [{ opacity: shO }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], { duration: D, delay: 70, easing: 'linear' }));
    // the page's blocks stay inside the card while it shrinks and leave before it reaches the row (an edge never cuts one)
    const oy = this.ride(st.src), win = (e: number): [number, number] => [t0 + (wt - t0) * e, b0 + (wb - b0) * e];
    page.forEach(({ e: x, o }) => {
      const r = this.box(x), o0 = Number(o);
      const kf = Array.from({ length: N + 1 }, (_, i) => { const p = i / N, e = at(p), w = win(e), y = r.y + cy + (oy - cy) * e;
        return { offset: p, opacity: +(o0 * ss((w[1] - Math.min(y + r.h, h - 12)) / 12) * ss((y - w[0]) / 12) * (1 - ss(p / 0.2))).toFixed(4) }; });
      this.anim(x, kf, { duration: D, delay: 70, easing: 'linear' });
    });
    out.push(this.anim(dsc, [{ transform: `translateY(${cy}px)` }, { transform: `translateY(${oy}px)` }], { duration: D, delay: 70, easing: E }));
    out.push(this.anim(edge, [{ opacity: edgeO }, { opacity: 0, offset: 0.35 }, { opacity: 0 }], { duration: D, easing: 'linear' }));
    fl.forEach(({ c, a }) => {
      const ra = this.box(a), rb = { x: parseFloat(c.style.left), y: parseFloat(c.style.top), w: parseFloat(c.style.width), h: parseFloat(c.style.height) };
      const s = this.scale(a, ra, rb);
      out.push(this.anim(c, [{ transform: c.style.transform || 'none' }, { transform: `translate(${ra.x - rb.x}px,${ra.y - rb.y}px) scale(${s})` }], { duration: D, delay: 70, easing: E }));
      // a pill's number takes its colour back as it lands
      const tn = this.tint(st.src, a, c);
      if (tn) {
        const o = fl.find((x) => x.c === c); if (o) o.tint = tn;
        out.push(this.anim(tn, [{ transform: c.style.transform || 'none' }, { transform: `translate(${ra.x - rb.x}px,${ra.y - rb.y}px) scale(${s})` }], { duration: D, delay: 70, easing: E }));
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
      this.e.scr.getAnimations().forEach((a) => a.cancel()); this.anim(this.e.scr, [{ opacity: 0 }, { opacity: 0 }], { duration: 1 });
      const lt = L.map(curT);
      out.forEach((a) => a.cancel());
      st.home = this.homeUnits(st.src).map((x) => { const a = this.anim(x, [{ opacity: 0 }, { opacity: 0 }], { duration: 1 }); a.id = 'hx-cover'; return a; });
      st.dim.forEach((x) => { x.style.opacity = '0'; });
      fl.forEach(({ a }) => { a.style.opacity = '0'; });
      this.squareAt(st, 300);
      const sm = this.sm();
      L.forEach((l, i) => { const t = lt[i]; if (t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)') this.anim(l, [{ transform: t }, { transform: 'none' }], { duration: sm.duration, easing: sm.easing }); });
    }).catch(() => {});
  }

  /** the same section tapped while closing: turn round */
  reopen() {
    const st = this.st; if (!st || !st.closing || !st.out) return;
    st.closing = false; st.next = null;
    st.out.forEach((a) => a.reverse());
    if (st.slide) return;
    (st.page ?? []).forEach(({ e: x }) => { const cs = getComputedStyle(x), o = cs.opacity, t = cs.transform; x.getAnimations().forEach((a) => a.cancel()); x.style.transform = ''; this.anim(x, [{ opacity: o, transform: t }, { opacity: 1, transform: 'none' }], { duration: 200, delay: 60, easing: 'linear' }); });
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
    this.wave(1, o.duration);
    this.playPage(Math.round(o.duration * 0.25));
    st.anims[1].finished.then(() => { if (this.st === st && !st.closing) this.e.det.classList.remove('moving'); }).catch(() => {});
  }
  /** the page's blocks arrive as a soft wave: each trails the one above it by a few px and they close up as the page lands
   *  (same curve and end as the slide, so nothing moves after it) */
  private wave(dir: number, duration: number) {
    $$(':scope > .hx-page > .hx-body > *', this.e.dsc).slice(0, 12).forEach((x, i) => {
      x.getAnimations().filter((a) => a.id === 'hx-wave').forEach((a) => a.cancel());
      const k = dir * Math.min(84, 14 + i * 10), a = this.anim(x, [{ transform: `translateX(${k}px)` }, { transform: 'none' }], { duration, easing: slideCurve(Math.abs(k)).easing });
      a.id = 'hx-wave';
    });
  }
  private slideClose(st: State) {
    this.e.det.classList.remove('moving');
    const { L, scr } = this.e, W = this.e.root.clientWidth + 48;
    const o = slideCurve(W);
    const from = [curT(L[0]), curT(scr)];
    L[0].getAnimations().forEach((a) => a.cancel()); scr.getAnimations().forEach((a) => a.cancel());
    const out = [this.anim(L[0], [{ transform: from[0] }, { transform: `translateX(${W}px)` }], o), this.anim(scr, [{ transform: from[1] }, { transform: 'none' }], o)];
    st.out = out;
    out[0].finished.then(() => {
      if (this.st !== st || !st.closing) return;
      const nx = st.next ?? null;
      requestAnimationFrame(() => { this.closeNow(); st.done?.(nx); });
    }).catch(() => {});
  }

  closeNow() {
    const { det, fly, L, mat, dsc, root } = this.e;
    fly.replaceChildren();
    this.st?.dim.forEach((x) => { x.getAnimations().forEach((a) => a.cancel()); x.style.opacity = ''; });
    det.classList.remove('live', 'moving');
    // home back as it was; a style write after the cancel makes Chrome recompute it (it can keep a cancelled 0 otherwise)
    $$('*', this.e.scr).forEach((x) => { const c = x.getAnimations().filter((a) => a.id === 'hx-cover'); if (!c.length) return; c.forEach((a) => a.cancel()); x.style.opacity = '1'; x.style.opacity = ''; });
    dsc.getAnimations().forEach((a) => a.cancel()); dsc.style.transform = '';
    [...L, mat, this.e.scr, this.e.shade].forEach((x) => x.getAnimations().forEach((a) => a.cancel()));
    $$('[data-share]', root).forEach((x) => { x.style.opacity = ''; });
    $$('*', dsc).forEach((x) => { x.getAnimations().forEach((a) => a.cancel()); x.style.transform = ''; x.style.opacity = ''; });
    this.st = null;
  }

  /** a chip: before React swaps the page, the old one is copied out to leave; `newSrc` is the section the page now belongs to */
  swapOut(k: string, newSrc: HTMLElement, dir: number, scroller: HTMLElement) {
    const st = this.st; if (!st || st.closing) return null;
    st.fl.forEach(({ c, b }) => { b.style.opacity = ''; c.remove(); }); st.fl = [];
    $$('[data-share]', st.src).forEach((x) => { x.style.opacity = ''; });
    st.dim.forEach((x) => { x.getAnimations().forEach((a) => a.cancel()); x.style.opacity = ''; });
    // home, hidden under the page: bring the new section into view so close lands on screen
    // (only as far as needed: a section already on screen keeps home where it was)
    const top = newSrc.offsetTop - scroller.scrollTop, room = scroller.clientHeight - 120;
    if (top < 60) scroller.scrollTop = Math.max(0, newSrc.offsetTop - 60);
    else if (top + newSrc.offsetHeight > room) scroller.scrollTop = newSrc.offsetTop + newSrc.offsetHeight - room;
    // the row the page came from hides under it now (home is covered, not gone, and the page is see-through)
    const was = st.src.closest('.hx-row') ?? st.src;
    if (!st.slide) { const a = this.anim(was, [{ opacity: 0 }, { opacity: 0 }], { duration: 1 }); a.id = 'hx-cover'; }
    st.k = k; st.src = newSrc; st.dim = st.slide ? [] : this.dimOf(newSrc);
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
    L[2].appendChild(ghost);
    // pages sit side by side in chip order: the old one slides out as the new one slides in, on one spring
    const W = dsc.clientWidth + 48, sc = slideCurve(W); // a gap between the two pages; the open/close slide's curve
    ghost.animate([{ transform: `translateX(${cx}px)` }, { transform: `translateX(${cx - dir * W}px)` }], { duration: reduced() ? 1 : sc.duration, fill: 'both', easing: sc.easing }).finished.then(() => ghost.remove()).catch(() => ghost.remove());
    return dir;
  }
  /** React has rendered the new page: it arrives from the side the chip sits on */
  swapIn(dir: number) {
    const { dsc } = this.e;
    this.playPage(160, false);
    const W = dsc.clientWidth + 48;
    this.wave(dir, slideCurve(W).duration);
    // the body moves as one layer that stays a layer (dropping it at the end would snap the text by a pixel)
    $$(':scope > .hx-page > .hx-body', dsc).forEach((x) => this.anim(x, [{ transform: `translateX(${dir * W}px)` }, { transform: 'none' }], slideCurve(W)));
  }
}
