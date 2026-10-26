/**
 * The set to do next wears a quiet accent outline. When it moves to another row of the same card (you ticked a set, or
 * unticked one), the outline glides there on the row's own spring instead of fading out on one row and in on the next
 * (alive plan, step 1). Moving to another card, it fades out there and in on the new row, as before.
 *
 * Two outlines live in the list, above every card, so nothing on the page is ever pushed onto a layer of its own by
 * them, and they keep their layers for as long as the list is there (none is added or dropped when a glide ends: the
 * flicker rule). One shows the current row; the other waits, drawn almost invisibly, for the next crossing.
 * The row keeps its own faint fill, number colour and check ring, which fade as before.
 */
import { SMOOTH, springSamples } from '../../ui/motion';
import { useStore } from '../../state/store';
import { nextSetOf } from './rest';

const HIDE = 0.002; // never 0: an outline drawn this faintly keeps its layer and its pixels, so showing it again is free
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)'; // --ease-out: the row's own 420 ms fade
const TICK_DELAY = 100; // after a tick the check pops first, then the outline leaves

type Box = { x: number; y: number; w: number; h: number; fx: number; fy: number };
type Glide = { anim: Animation; off: number; xs: number[]; delay: number; dur: number };
type Ring = { el: HTMLElement; box: Box | null; glide: Glide | null; fade: Animation | null; shown: boolean };

const reduced = () => document.documentElement.dataset.motion === 'reduce'
  || (document.documentElement.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
/** an animation that moves or fades the element it runs on (a colour or a shadow changing doesn't move the row) */
const MOVES = /^(transform|translate|scale|rotate|opacity|grid-template-rows|gridTemplateRows|height|margin-top|marginTop)$/;
function moving(a: Animation) {
  if (a.playState !== 'running' && a.playState !== 'paused' && !a.pending) return false;
  if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) return MOVES.test(a.transitionProperty);
  const kf = (a.effect as KeyframeEffect | null)?.getKeyframes?.() ?? [];
  return kf.some((k) => Object.keys(k).some((p) => MOVES.test(p)));
}

/** Set the outlines going in a workout list. `host` holds the two outline elements. Returns the cleanup. */
export function mountSetRing(list: HTMLElement, host: HTMLElement): () => void {
  const rings: Ring[] = [...host.children].slice(0, 2).map((el) => ({ el: el as HTMLElement, box: null, glide: null, fade: null, shown: false }));
  if (rings.length < 2) return () => {};
  let on = 0; // the ring that shows the current row
  let curId: string | null = null, curCard: string | null = null;
  let flipUntil = 0;
  const told = new WeakSet<Animation>();
  const kick = () => { dirty = true; soon(); };

  /** where a set's row sits in the list's own coordinates (so a scroll doesn't move it), to the fraction of a pixel (the
   *  outline then lands on exactly the row's own pixels); and whether something is carrying the row right now (a card sliding in, a reorder) */
  function measure(id: string) {
    const row = list.querySelector<HTMLElement>(`[data-set="${CSS.escape(id)}"] > .wk-set`);
    if (!row) return null;
    let busy = performance.now() < flipUntil;
    for (let e = row.parentElement; e && e !== list; e = e.parentElement) {
      // look again the moment it lands (a card sliding in on its own animation says so to nobody else)
      for (const a of e.getAnimations()) if (moving(a)) { busy = true; if (!told.has(a)) { told.add(a); a.finished.then(kick, kick); } }
    }
    const r = row.getBoundingClientRect(), l = list.getBoundingClientRect();
    const ox = l.left + list.clientLeft - list.scrollLeft, oy = l.top + list.clientTop - list.scrollTop;
    // a layer always sits on whole screen pixels, so it is placed on the pixel just above-left of the row and draws the
    // outline inside itself the fraction of a pixel further in, where the row drew its own
    const d = window.devicePixelRatio || 1;
    const fx = (r.left * d - Math.floor(r.left * d + 1e-4)) / d, fy = (r.top * d - Math.floor(r.top * d + 1e-4)) / d;
    const card = row.closest<HTMLElement>('[data-flip]')?.dataset.flip ?? null;
    return { box: { x: r.left - ox - fx, y: r.top - oy - fy, w: r.width, h: r.height, fx, fy }, card, busy, hidden: !r.width || !r.height };
  }

  function place(g: Ring, b: Box) {
    const o = g.box;
    if (o && o.x === b.x && o.y === b.y && o.w === b.w && o.h === b.h && o.fx === b.fx && o.fy === b.fy) return;
    g.box = b;
    const s = g.el.style;
    s.left = `${b.x}px`; s.top = `${b.y}px`; s.width = `${b.w + 1}px`; s.height = `${b.h + 1}px`;
    s.setProperty('--fx', `${b.fx}px`); s.setProperty('--fy', `${b.fy}px`); s.setProperty('--w', `${b.w}px`); s.setProperty('--h', `${b.h}px`);
  }

  /** the glide's own position and speed right now (px off its rest place, px/s), from the same samples it runs on */
  function glideNow(g: Ring): { off: number; v: number } {
    const gl = g.glide; if (!gl) return { off: 0, v: 0 };
    const t = Number(gl.anim.currentTime ?? 0) - gl.delay;
    if (gl.anim.playState === 'finished') return { off: 0, v: 0 };
    if (t <= 0) return { off: gl.off, v: 0 };
    const f = (t / 1000) * 60, i = Math.min(gl.xs.length - 1, Math.floor(f)), j = Math.min(gl.xs.length - 1, i + 1);
    const p = gl.xs[i] + (gl.xs[j] - gl.xs[i]) * (f - i);
    return { off: gl.off * (1 - p), v: -gl.off * (gl.xs[j] - gl.xs[i]) * 60 };
  }

  function fadeTo(g: Ring, to: number, ms: number) {
    const from = Number(getComputedStyle(g.el).opacity);
    g.fade?.cancel(); g.fade = null;
    g.shown = to > HIDE;
    g.el.style.opacity = String(to);
    if (reduced() || Math.abs(from - to) < 0.01) return;
    g.fade = g.el.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing: EASE_OUT });
  }

  /** move a showing ring to a new row of its card: it lands on the new place, and a transform carries it there from
   *  where it is drawn now (a glide already under way hands over its position and speed, so quick ticks never jump) */
  function glide(g: Ring, b: Box, delay: number) {
    const now = glideNow(g);
    const visual = (g.box?.y ?? b.y) + now.off;
    g.glide?.anim.cancel(); g.glide = null;
    place(g, b);
    const off = visual - b.y;
    if (Math.abs(off) < 0.5 || reduced()) return;
    // speed in the new move's own units (its whole distance per second), as the spring takes it
    const v0 = Math.max(-8, Math.min(20, -now.v / off));
    const { xs, duration } = springSamples(SMOOTH, v0);
    const easing = `linear(${xs.map((v) => +v.toFixed(4)).join(', ')})`;
    const anim = g.el.animate([{ transform: `translateY(${off}px)` }, { transform: 'none' }], { duration, delay, easing, fill: 'backwards' });
    g.glide = { anim, off, xs, delay, dur: duration };
    anim.onfinish = () => { if (g.glide?.anim === anim) g.glide = null; };
  }

  let waiting = false; // the current row is being carried (a card arriving, a reorder): the outline waits, faded
  let dirty = true; // something on the page moved or changed size since the last look
  let away = false; // the list is hidden behind Focus view: nothing is measured, and coming back it is simply in place
  function sync() {
    if (list.classList.contains('wk-away')) { away = true; return; }
    const a = useStore.getState().active;
    const id = (a && nextSetOf(a)?.set.id) || null;
    // the store changes often (every set field typed, the rest counting down): with the same set next and nothing on the
    // page moved, there is nothing to measure
    const look = dirty; dirty = false;
    if (!look && !away && !waiting && id === curId) return;
    const g = rings[on];
    const m = id ? measure(id) : null;
    if (away && m && !m.hidden && !m.busy) {
      // back from Focus view: the list fades in with its outline already on the right row
      away = false; waiting = false;
      for (const r of rings) { r.glide?.anim.cancel(); r.glide = null; r.fade?.cancel(); r.fade = null; }
      rings[1 - on].el.style.opacity = String(HIDE); rings[1 - on].shown = false;
      place(g, m.box); g.el.style.opacity = '1'; g.shown = true;
      curId = id; curCard = m.card; return;
    }
    if (!id || !m || m.hidden) {
      if (g.shown) fadeTo(g, HIDE, 420);
      curId = id; curCard = null; return;
    }
    if (m.busy) {
      // fade out while the card moves, back in on its row once it has landed (re-checked when its animation ends)
      if (g.shown) fadeTo(g, HIDE, 180);
      waiting = true; return;
    }
    if (id === curId && m.card === curCard) {
      // same row: follow it as the page around it changes (a row above unfolding, a note opening); a glide in flight
      // keeps going, relative to the new place
      if (waiting || !g.shown) { g.glide?.anim.cancel(); g.glide = null; place(g, m.box); fadeTo(g, 1, 420); waiting = false; return; }
      place(g, m.box); // (a glide's transform is relative to the box: it rides along)
      return;
    }
    const was = curId;
    const sameCard = !!was && m.card !== null && m.card === curCard && g.shown && !waiting;
    curId = id; curCard = m.card; waiting = false;
    if (sameCard) {
      // ticked (the row it leaves is now done): the check pops first; unticked, or a set added or removed: at once
      const left = list.querySelector(`[data-set="${CSS.escape(was!)}"] > .wk-set`);
      glide(g, m.box, left?.classList.contains('done') ? TICK_DELAY : 0);
      return;
    }
    // another card (or the first time): the old outline fades where it is, the other one fades in on the new row
    if (g.shown) fadeTo(g, HIDE, 420);
    const n = rings[1 - on]; on = 1 - on;
    n.glide?.anim.cancel(); n.glide = null;
    place(n, m.box);
    // first drawn with the list (opening the workout): there at once, as the row's own outline was
    fadeTo(n, 1, was === null && !g.box ? 0 : 420);
  }

  let raf = 0;
  const soon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync(); }); };
  // the list's own pieces changing size move the rows below them (a row unfolding, the briefing folding away): followed in
  // the same frame, before it is drawn
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { dirty = true; sync(); });
  const seen = new Set<Element>();
  const watch = () => {
    if (!ro) return;
    for (const e of seen) if (!e.isConnected) { ro.unobserve(e); seen.delete(e); }
    const add = (e: Element) => { if (e !== host && !seen.has(e)) { seen.add(e); ro.observe(e); } };
    for (const c of list.children) add(c);
    list.querySelectorAll('section.wk-block').forEach(add);
  };
  // rows and cards coming and going: looked at once, just before the next frame is drawn (React adds a card in many steps)
  const mo = new MutationObserver(() => { watch(); dirty = true; soon(); });
  mo.observe(list, { childList: true, subtree: true });
  watch();
  const unsub = useStore.subscribe(soon);
  // something starting or ending to move under it (a card sliding in, a Collapse, a row unfolding): look again. A row's
  // own colours and its check popping don't move anything, and a tick sets off many of those, so they are left out
  const onAnim = (e: Event) => {
    if (e instanceof TransitionEvent ? !MOVES.test(e.propertyName) : (e.target as Element | null)?.closest?.('.wk-set')) return;
    dirty = true; soon();
  };
  const evs = ['animationstart', 'animationend', 'animationcancel', 'transitionstart', 'transitionend', 'transitioncancel'] as const;
  evs.forEach((e) => list.addEventListener(e, onAnim));
  // Move up / Move down (flip.ts): the cards slide on transforms nothing else reports
  const onFlip = (e: Event) => { flipUntil = performance.now() + ((e as CustomEvent<number>).detail ?? 420) + 60; dirty = true; sync(); setTimeout(() => { dirty = true; soon(); }, ((e as CustomEvent<number>).detail ?? 420) + 80); };
  list.addEventListener('flipstart', onFlip);
  // leaving the app mid-glide: it lands, so coming back shows it in place
  const onVis = () => { if (document.hidden) for (const g of rings) { g.glide?.anim.finish(); g.fade?.finish(); } };
  document.addEventListener('visibilitychange', onVis);
  sync();
  return () => {
    unsub(); mo.disconnect(); ro?.disconnect(); cancelAnimationFrame(raf);
    evs.forEach((e) => list.removeEventListener(e, onAnim));
    list.removeEventListener('flipstart', onFlip);
    document.removeEventListener('visibilitychange', onVis);
    for (const g of rings) { g.glide?.anim.cancel(); g.fade?.cancel(); }
  };
}
