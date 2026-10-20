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

export interface Els { root: HTMLElement; det: HTMLElement; L: [HTMLElement, HTMLElement, HTMLElement]; mat: HTMLElement; dsc: HTMLElement; fly: HTMLElement; edge: HTMLElement }
interface Flight { c: HTMLElement; a: HTMLElement; b: HTMLElement; from?: string }
interface State { k: string; src: HTMLElement; anims: Animation[]; fl: Flight[]; dim: HTMLElement[]; closing?: boolean; next?: { k: string; src: HTMLElement } | null; out?: Animation[] | null; page?: { e: HTMLElement }[]; done?: (next: { k: string; src: HTMLElement } | null) => void }

const reduced = () => {
  const m = document.documentElement.dataset.motion;
  return m === 'reduce' || (m !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
};
const $$ = (s: string, r: ParentNode) => [...r.querySelectorAll<HTMLElement>(s)];
const curT = (el: Element) => { const s = getComputedStyle(el).transform; return s === 'none' ? 'none' : s; };
const SHARE = ['num', 'chart'];

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
  private scale(a: HTMLElement, ra: { w: number; h: number }, rb: { w: number; h: number }) { return a.dataset.share === 'chart' ? 1 : Math.min(ra.h / rb.h, ra.w / rb.w); }
  private dimOf(src: HTMLElement) { return src.classList.contains('hx-sec') ? $$('.hx-lab,.hx-sub', src).filter((x) => !x.closest('[data-share]')) : [src]; }

  /** React has put the page for `k` into dsc: grow it out of `src` */
  open(k: string, src: HTMLElement) {
    if (this.st) return;
    const { det, fly, dsc, L, mat, edge } = this.e;
    [det, fly, ...$$('*', det)].forEach((x) => x.getAnimations().forEach((a) => a.cancel()));
    fly.replaceChildren();
    dsc.scrollTop = 0;
    det.classList.add('live');
    const st: State = { k, src, anims: [], fl: [], dim: [] };
    this.st = st;
    const { duration: D, easing: E } = this.win();
    for (const [a, b] of this.pairs(src)) {
      const ra = this.box(a), { c, rb } = this.clone(b), s = this.scale(a, ra, rb);
      a.style.opacity = '0'; b.style.opacity = '0';
      st.fl.push({ c, a, b });
      st.anims.push(this.anim(c, [{ transform: `translate(${ra.x - rb.x}px,${ra.y - rb.y}px) scale(${s})` }, { transform: 'none' }], { duration: D, easing: E }));
    }
    const wf = this.frames(src);
    L.forEach((l, i) => st.anims.push(this.anim(l, [{ transform: wf[i] }, { transform: 'none' }], { duration: D, easing: E })));
    st.anims.push(this.anim(mat, [{ opacity: 0 }, { opacity: 1 }], { duration: 90, easing: 'linear' }));
    st.anims.push(this.anim(edge, [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: D, easing: 'linear' }));
    // the page is already there under the growing window: it only settles in (fade 220 ms, 16 px rise), so no blank frame
    const sm = this.sm();
    $$('.hx-dhead,.hx-chips,.hx-lab,.hx-sub,.hx-rise', dsc).filter((x) => !x.closest('[data-share]')).forEach((x, i) => {
      const delay = 70 + Math.min(i, 3) * 40;
      st.anims.push(this.anim(x, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay, easing: 'linear' }));
      st.anims.push(this.anim(x, [{ transform: 'translateY(16px)' }, { transform: 'none' }], { duration: sm.duration, delay, easing: sm.easing }));
    });
    const paired = new Set(st.fl.map((o) => o.b));
    $$('[data-share]', dsc).filter((b) => !paired.has(b)).forEach((b) => st.anims.push(this.anim(b, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 70, easing: 'linear' })));
    st.dim = this.dimOf(src);
    st.dim.forEach((x) => { x.getAnimations().forEach((a) => a.cancel()); x.style.opacity = '0'; x.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced() ? 1 : 80, easing: 'linear' }); });
    this.playPage(250);
    // landed: the page's own number and chart take over from the copies
    Promise.all(st.anims.slice(0, st.fl.length + 3).map((a) => a.finished)).then(() => {
      if (this.st !== st || st.closing) return;
      st.fl.forEach(({ c, b }) => { b.style.opacity = ''; c.remove(); });
      st.fl = [];
    }).catch(() => {});
  }

  /** the page's own small moves once it is open: score rings fill, bars rise, stage bars slide out */
  playPage(delay: number) {
    const { dsc } = this.e;
    const sm = this.sm();
    for (const ring of $$('.hx-ring', dsc)) {
      const p = Number(ring.dataset.p ?? 0), T = 560;
      const rs = ring.querySelector('.hx-rs'), ls = ring.querySelector('.hx-ls');
      if (!rs || !ls || p <= 0) continue;
      const d1 = T * Math.min(1, 0.5 / p), d2 = T - d1;
      this.anim(rs, [{ transform: 'rotate(-180deg)' }, { transform: `rotate(${p >= 0.5 ? 0 : -180 + p * 360}deg)` }], { duration: d1, delay, easing: p > 0.5 ? 'linear' : 'cubic-bezier(.2,.7,.3,1)' });
      if (p > 0.5) this.anim(ls, [{ transform: 'rotate(-180deg)' }, { transform: `rotate(${-180 + (p - 0.5) * 360}deg)` }], { duration: d2, delay: delay + d1, easing: 'cubic-bezier(.2,.7,.3,1)' });
    }
    $$('.hx-col', dsc).forEach((c, i) => this.anim(c, [{ transform: 'translateY(130px)' }, { transform: 'none' }], { duration: sm.duration + 160, delay: delay + 60 + i * 30, easing: sm.easing }));
    $$('.hx-sb', dsc).forEach((c, i) => this.anim(c, [{ transform: 'translateX(-101%)' }, { transform: 'none' }], { duration: sm.duration + 200, delay: delay + 80 + i * 60, easing: sm.easing }));
  }

  /** shrink back into the section, from wherever everything is drawn; `done` once it has landed */
  close(done: State['done']) {
    const st = this.st; if (!st || st.closing) return;
    st.closing = true; st.next = null; st.done = done;
    const { L, mat, edge, dsc } = this.e;
    const { duration: D, easing: E } = this.win();
    const fromL = L.map(curT), matO = getComputedStyle(mat).opacity, edgeO = getComputedStyle(edge).opacity;
    // flying copies: keep the ones still in flight (from where they are now), else lift the page's own copies
    let fl: Flight[] = st.fl.map((o) => ({ ...o, from: curT(o.c) }));
    if (!fl.length) fl = this.pairs(st.src).map(([a, b]) => { const { c } = this.clone(b); a.style.opacity = '0'; b.style.opacity = '0'; return { c, a, b, from: 'none' }; });
    const page = $$('.hx-dhead,.hx-chips,.hx-lab,.hx-sub,.hx-rise,.hx-panel,[data-share]', dsc).filter((x) => !x.parentElement?.closest('[data-share]') && !fl.some((o) => o.b === x)).map((x) => { const cs = getComputedStyle(x); return { e: x, o: cs.opacity, t: cs.transform }; });
    st.anims.forEach((a) => a.cancel());
    fl.forEach((o) => o.b.getAnimations().forEach((a) => a.cancel()));
    fl.forEach((o) => { o.c.style.transform = o.from ?? 'none'; });
    page.forEach(({ e: x, o, t }) => { x.getAnimations().forEach((a) => a.cancel()); x.style.transform = t === 'none' ? '' : t; this.anim(x, [{ opacity: o }, { opacity: 0 }], { duration: 120, easing: 'linear' }); });
    (st.out ?? []).forEach((a) => a.cancel());
    const wf = this.frames(st.src);
    const out: Animation[] = [];
    const dimO = st.dim.map((x) => getComputedStyle(x).opacity);
    st.dim.forEach((x, i) => { x.getAnimations().forEach((a) => a.cancel()); x.style.opacity = '0'; out.push(x.animate([{ opacity: dimO[i] }, { opacity: dimO[i], offset: 0.35 }, { opacity: 1, offset: 0.85 }, { opacity: 1 }], { duration: reduced() ? 1 : D, easing: 'linear' })); });
    L.forEach((l, i) => out.unshift(this.anim(l, [{ transform: fromL[i] }, { transform: wf[i] }], { duration: D, easing: E })));
    // the material clears between 25 % and 80 %: the section is already back underneath, so close ends on the settled screen
    out.push(this.anim(mat, [{ opacity: matO }, { opacity: matO, offset: 0.25 }, { opacity: 0, offset: 0.8 }, { opacity: 0 }], { duration: D, easing: 'linear' }));
    out.push(this.anim(edge, [{ opacity: edgeO }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: D, easing: 'linear' }));
    fl.forEach(({ c, a }) => {
      const ra = this.box(a), rb = { x: parseFloat(c.style.left), y: parseFloat(c.style.top), w: parseFloat(c.style.width), h: parseFloat(c.style.height) };
      out.push(this.anim(c, [{ transform: c.style.transform || 'none' }, { transform: `translate(${ra.x - rb.x}px,${ra.y - rb.y}px) scale(${this.scale(a, ra, rb)})` }], { duration: D, easing: E }));
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
      fl.forEach(({ c, b }) => { b.style.opacity = ''; c.remove(); });
      st.fl = []; st.out = null;
      const lt = L.map(curT);
      out.forEach((a) => a.cancel());
      st.dim.forEach((x) => { x.style.opacity = '0'; });
      fl.forEach(({ a }) => { a.style.opacity = '0'; });
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
    det.classList.remove('live');
    [...L, mat].forEach((x) => x.getAnimations().forEach((a) => a.cancel()));
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
    scroller.scrollTop = Math.max(0, newSrc.offsetTop - Math.max(0, (scroller.clientHeight - newSrc.offsetHeight) / 2));
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
    [...ghost.children].forEach((x, i) => x.animate([{ opacity: (x as HTMLElement).style.opacity || 1 }, { opacity: 0 }], { duration: i < 2 ? 90 : 140, fill: 'both', easing: 'ease-in' }));
    ghost.animate([{ transform: 'none' }, { transform: `translateX(${-dir * 24}px)` }], { duration: 140, fill: 'both', easing: 'ease-in' }).finished.then(() => ghost.remove()).catch(() => ghost.remove());
    return dir;
  }
  /** React has rendered the new page: it arrives from the side the chip sits on */
  swapIn(dir: number) {
    const { dsc } = this.e;
    const sm = this.sm();
    this.playPage(160);
    $$(':scope > .hx-page > .hx-body > *', dsc).forEach((x, i) => {
      if (i < 2) {
        this.anim(x, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 100, easing: 'cubic-bezier(0,0,.2,1)' });
        this.anim(x, [{ transform: 'translateY(8px)' }, { transform: 'none' }], { duration: sm.duration, delay: 100, easing: sm.easing });
        return;
      }
      const d = 40 + Math.min(i - 2, 3) * 30;
      this.anim(x, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: d, easing: 'cubic-bezier(0,0,.2,1)' });
      this.anim(x, [{ transform: `translateX(${dir * 24}px)` }, { transform: 'none' }], { duration: sm.duration + 120, delay: d, easing: sm.easing });
    });
  }
}
