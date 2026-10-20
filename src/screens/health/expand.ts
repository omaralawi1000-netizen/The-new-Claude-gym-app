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

export interface Els { root: HTMLElement; scr: HTMLElement; det: HTMLElement; L: [HTMLElement, HTMLElement, HTMLElement]; mat: HTMLElement; dsc: HTMLElement; fly: HTMLElement; edge: HTMLElement }
interface Flight { c: HTMLElement; a: HTMLElement; b: HTMLElement; from?: string; tint?: HTMLElement }
interface State { k: string; src: HTMLElement; anims: Animation[]; fl: Flight[]; dim: HTMLElement[]; closing?: boolean; next?: { k: string; src: HTMLElement } | null; out?: Animation[] | null; held?: Animation[]; page?: { e: HTMLElement }[]; done?: (next: { k: string; src: HTMLElement } | null) => void }

const reduced = () => {
  const m = document.documentElement.dataset.motion;
  return m === 'reduce' || (m !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
};
const $$ = (s: string, r: ParentNode) => [...r.querySelectorAll<HTMLElement>(s)];
const curT = (el: Element) => { const s = getComputedStyle(el).transform; return s === 'none' ? 'none' : s; };
const SHARE = ['num', 'unit', 'chart'];
/** a spring whose last bit is eased out to rest: the sampled spring stops a fraction short and then lands, which over a
 * whole screen width is a visible half-pixel jump at the end. Its remaining distance is faded to 0 over the last 30 %. */
const softEnd = (easing: string) => { const v = easing.slice(7, -1).split(',').map(Number), n = v.length - 1; return `linear(${v.map((x, i) => +(1 - (1 - x) * Math.min(1, (n - i) / (0.3 * n))).toFixed(5)).join(', ')})`; };
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
  private dimOf(src: HTMLElement) { return src.classList.contains('hx-sec') ? $$('.hx-lab,.hx-sub', src).filter((x) => !x.closest('[data-share]')) : [src]; }

  /** a pill's number keeps its colour in flight: a second copy of the flying number, in the pill's colour, fades off it */
  private tint(src: HTMLElement, a: HTMLElement, c: HTMLElement) {
    if (!src.classList.contains('hx-pill')) return undefined;
    const g = c.cloneNode(true) as HTMLElement;
    g.style.color = getComputedStyle(a).color;
    g.querySelectorAll<HTMLElement>('*').forEach((x) => { x.style.color = 'inherit'; });
    c.after(g);
    return g;
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
    const { duration: D, easing: E } = this.win();
    const paths: [Box, Box][] = [];
    for (const [a, b] of this.pairs(src)) {
      const ra = this.box(a), { c, rb } = this.clone(b), s = this.scale(a, ra, rb);
      a.style.opacity = '0'; b.style.opacity = '0';
      const tn = this.tint(src, a, c);
      st.fl.push({ c, a, b, tint: tn });
      const from = `translate(${ra.x - rb.x}px,${ra.y - rb.y}px) scale(${s})`;
      const full = b.dataset.share === 'chart';
      paths.push([{ x: ra.x, y: ra.y, w: rb.w * s, h: rb.h * s, full }, { ...rb, full }]);
      st.anims.push(this.anim(c, [{ transform: from }, { transform: 'none' }], { duration: D, easing: E }));
      if (tn) { this.anim(tn, [{ transform: from }, { transform: 'none' }], { duration: D, easing: E }); this.anim(tn, [{ opacity: 1 }, { opacity: 1, offset: 0.1 }, { opacity: 0, offset: 0.6 }, { opacity: 0 }], { duration: D, easing: 'linear' }); }
    }
    const wf = this.frames(src);
    L.forEach((l, i) => st.anims.push(this.anim(l, [{ transform: wf[i] }, { transform: 'none' }], { duration: D, easing: E })));
    st.anims.push(this.anim(mat, [{ opacity: 0 }, { opacity: 1 }], { duration: 90, easing: 'linear' }));
    // home steps back at once as the page grows (no flight crosses its words): nothing of it shows through the page, the background's warmth does
    st.anims.push(this.anim(this.e.scr, [{ opacity: 1 }, { opacity: 0 }], { duration: D * 0.07, easing: 'cubic-bezier(.2,0,.4,1)' }));
    st.anims.push(this.anim(edge, [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: D, easing: 'linear' }));
    // the page's words settle in once the flying number and chart have passed them (so nothing is drawn over anything)
    const sm = this.sm();
    // each word of the page comes in as soon as nothing flies over it any more and the window's edges have passed it
    // (so nothing is drawn over anything, and nothing is cut by an edge), never later
    const at = curve(E), sr = this.box(src), h = this.e.root.clientHeight;
    const wt = Math.max(0, Math.min(h - 1, sr.y)), wb = Math.max(wt + 1, Math.min(h, sr.y + sr.h));
    const win = (e: number): [number, number] => [wt * (1 - e), h + (wb - h) * (1 - e)];
    // in reading order, in two chains: the X, chips and label wait for the window's top edge (the X leads); a body line starts
    // once the flight has passed it but never before the line above it; none later than 40 % of the move
    let prev = 0, prevTop = 0;
    // a word starts its 280 ms fade a little before it is clear, so it is still faint while the flight leaves it
    const clear = (x: HTMLElement) => Math.max(D * 0.1, Math.min(D * 0.4, D * clearAfter(this.box(x), paths, at, win) - 110));
    const when = (x: HTMLElement) => (prev = Math.max(prev, clear(x)));
    $$('.hx-dhead,.hx-chips,.hx-lab,.hx-sub,.hx-rise', dsc).filter((x) => !x.closest('[data-share]')).forEach((x) => {
      // a line sitting right against a landing number or chart (its unit line, a chart's date ends) lands with it, outside the chain
      const r = this.box(x), attached = paths.some(([, b]) => r.y < b.y + b.h + 12 && b.y < r.y + r.h + 12);
      const delay = x.matches('.hx-dhead,.hx-chips,.hx-lab') ? (prevTop = Math.max(prevTop, clear(x))) : attached ? clear(x) : when(x);
      st.anims.push(this.anim(x, [{ opacity: 0 }, { opacity: 1 }], { duration: 280, delay, easing: 'linear' }));
      st.anims.push(this.anim(x, [{ transform: 'translateY(10px)' }, { transform: 'none' }], { duration: sm.duration, delay, easing: sm.easing }));
    });
    const paired = new Set(st.fl.map((o) => o.b));
    $$('[data-share]', dsc).filter((b) => !paired.has(b)).forEach((b) => st.anims.push(this.anim(b, [{ opacity: 0 }, { opacity: 1 }], { duration: 280, delay: Math.max(D * 0.1, clear(b) - D * 0.05), easing: 'linear' }))); // a unit starts in its number's last bit of travel
    st.dim = this.dimOf(src);
    st.dim.forEach((x) => { x.getAnimations().forEach((a) => a.cancel()); x.style.opacity = '0'; x.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced() ? 1 : 40, easing: 'linear' }); });
    this.playPage(Math.round(D * 0.2));
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
    const { L, mat, edge, dsc } = this.e;
    const { duration: D, easing: E } = this.win();
    const fromL = L.map(curT), matO = getComputedStyle(mat).opacity, edgeO = getComputedStyle(edge).opacity, scrO = getComputedStyle(this.e.scr).opacity;
    // flying copies: keep the ones still in flight (from where they are now), else lift the page's own copies
    let fl: Flight[] = st.fl.map((o) => ({ ...o, from: curT(o.c) }));
    fl.forEach((o) => { o.tint?.remove(); o.tint = undefined; });
    if (!fl.length) fl = this.pairs(st.src).map(([a, b]) => { const { c } = this.clone(b); a.style.opacity = '0'; b.style.opacity = '0'; return { c, a, b, from: 'none' }; });
    const page = $$('.hx-dhead,.hx-chips,.hx-lab,.hx-sub,.hx-rise,.hx-panel,[data-share]', dsc).filter((x) => !x.parentElement?.closest('[data-share]') && !fl.some((o) => o.b === x)).map((x) => { const cs = getComputedStyle(x); return { e: x, o: cs.opacity, t: cs.transform }; });
    st.anims.forEach((a) => a.cancel());
    fl.forEach((o) => o.b.getAnimations().forEach((a) => a.cancel()));
    fl.forEach((o) => { o.c.style.transform = o.from ?? 'none'; });
    page.forEach(({ e: x, o, t }) => { x.getAnimations().forEach((a) => a.cancel()); x.style.transform = t === 'none' ? '' : t; this.anim(x, [{ opacity: o }, { opacity: 0 }], { duration: 110, easing: 'linear' }); });
    (st.out ?? []).forEach((a) => a.cancel());
    const wf = this.frames(st.src);
    const out: Animation[] = [];
    // the section's own words come back as soon as the copies landing on it have left their spot (never under a number)
    const at = curve(E), paths: [Box, Box][] = fl.map(({ c, a }) => {
      const rb = { x: parseFloat(c.style.left), y: parseFloat(c.style.top), w: parseFloat(c.style.width), h: parseFloat(c.style.height) };
      const m = new DOMMatrix(c.style.transform && c.style.transform !== 'none' ? c.style.transform : undefined), ra = this.box(a), s = this.scale(a, ra, rb);
      const full = a.dataset.share === 'chart';
      return [{ x: rb.x + m.e, y: rb.y + m.f, w: rb.w * m.a, h: rb.h * m.d, full }, { x: ra.x, y: ra.y, w: rb.w * s, h: rb.h * s, full }];
    });
    const dimO = st.dim.map((x) => getComputedStyle(x).opacity);
    st.dim.forEach((x, i) => {
      const p = x === st.src ? 0.2 : Math.min(0.5, Math.max(0.15, clearAfter(this.box(x), paths, at))); // a pill: its number lands inside it
      x.getAnimations().forEach((a) => a.cancel()); x.style.opacity = '0';
      out.push(this.anim(x, [{ opacity: dimO[i] }, { opacity: dimO[i], offset: p }, { opacity: 1, offset: p + 0.25 }, { opacity: 1 }], { duration: D, delay: 70, easing: 'linear' }));
    });
    // other sections the landing copies pass over wait, unseen, until they have passed (home is only coming back then)
    const own = st.src.closest('.hx-sec');
    st.held = $$('.hx-sec', this.e.scr).filter((x) => x !== own).flatMap((x) => {
      const p = clearAfter(this.box(x), paths, at); if (p <= 0) return [];
      return [this.anim(x, [{ opacity: 0 }, { opacity: 0, offset: Math.min(0.6, p) }, { opacity: 1, offset: Math.min(0.85, p + 0.25) }, { opacity: 1 }], { duration: D, delay: 70, easing: 'linear' })];
    });
    L.forEach((l, i) => out.unshift(this.anim(l, [{ transform: fromL[i] }, { transform: wf[i] }], { duration: D, delay: 70, easing: E })));
    // the material clears between 25 % and 80 %: the section is already back underneath, so close ends on the settled screen
    out.push(this.anim(mat, [{ opacity: matO }, { opacity: matO, offset: 0.2 }, { opacity: 0, offset: 0.55 }, { opacity: 0 }], { duration: D, easing: 'linear' }));
    this.e.scr.getAnimations().forEach((a) => a.cancel());
    out.push(this.anim(this.e.scr, [{ opacity: scrO }, { opacity: scrO, offset: 0.2, easing: 'cubic-bezier(.3,0,.25,1)' }, { opacity: 1, offset: 0.6 }, { opacity: 1 }], { duration: D, easing: 'linear' }));
    out.push(this.anim(edge, [{ opacity: edgeO }, { opacity: 1, offset: 0.2 }, { opacity: 0, offset: 0.55 }, { opacity: 0 }], { duration: D, easing: 'linear' }));
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
      out.forEach((a) => a.cancel()); st.held?.forEach((a) => a.cancel()); st.held = [];
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
    (st.page ?? []).forEach(({ e: x }) => { const cs = getComputedStyle(x), o = cs.opacity, t = cs.transform; x.getAnimations().forEach((a) => a.cancel()); x.style.transform = ''; this.anim(x, [{ opacity: o, transform: t }, { opacity: 1, transform: 'none' }], { duration: 200, delay: 60, easing: 'linear' }); });
  }

  /** a tap on a section or pill: open, turn round, or queue it to open once this one has closed */
  tap(k: string, src: HTMLElement, openIt: () => void) {
    const st = this.st;
    if (!st) { openIt(); return; }
    if (st.closing) { if (k === st.k) this.reopen(); else st.next = { k, src }; }
  }

  closeNow() {
    const { det, fly, L, mat, dsc, root } = this.e;
    fly.replaceChildren();
    this.st?.dim.forEach((x) => { x.getAnimations().forEach((a) => a.cancel()); x.style.opacity = ''; });
    this.st?.held?.forEach((a) => a.cancel());
    det.classList.remove('live', 'moving');
    [...L, mat, this.e.scr].forEach((x) => x.getAnimations().forEach((a) => a.cancel()));
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
    st.k = k; st.src = newSrc; st.dim = this.dimOf(newSrc);
    st.dim.forEach((x) => { x.style.opacity = '0'; });
    $$('[data-share]', newSrc).forEach((x) => { x.style.opacity = '0'; });
    const { dsc, L } = this.e;
    const old = $$(':scope > .hx-page > .hx-body > *', dsc);
    const first = old[0] ? old[0].getBoundingClientRect().top - dsc.getBoundingClientRect().top : 0;
    const ghost = document.createElement('div');
    ghost.className = 'hx-ghost';
    ghost.style.cssText = `position:absolute;left:0;right:0;top:${first}px;padding:0 20px;pointer-events:none;z-index:1`;
    old.forEach((x) => { const c = x.cloneNode(true) as HTMLElement; c.style.opacity = getComputedStyle(x).opacity; c.style.transform = ''; ghost.appendChild(c); });
    L[2].appendChild(ghost);
    // pages sit side by side in chip order: the old one slides out as the new one slides in, on one spring
    const sm = this.sm(), W = dsc.clientWidth + 48; // a gap between the two pages
    ghost.animate([{ transform: 'none' }, { transform: `translateX(${-dir * W}px)` }], { duration: reduced() ? 1 : sm.duration + 160, fill: 'both', easing: softEnd(sm.easing) }).finished.then(() => ghost.remove()).catch(() => ghost.remove());
    return dir;
  }
  /** React has rendered the new page: it arrives from the side the chip sits on */
  swapIn(dir: number) {
    const { dsc } = this.e;
    const sm = this.sm();
    this.playPage(160, false);
    const W = dsc.clientWidth + 48;
    // the body moves as one layer that stays a layer (dropping it at the end would snap the text by a pixel)
    $$(':scope > .hx-page > .hx-body', dsc).forEach((x) => this.anim(x, [{ transform: `translateX(${dir * W}px)` }, { transform: 'none' }], { duration: sm.duration + 160, easing: softEnd(sm.easing) }));
  }
}
