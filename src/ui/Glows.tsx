import { useLayoutEffect, useRef } from 'react';
import { addTwin, ampFor, recall, shareKey, sharedPlan, setSharedPlan, cssColor, fileShown, glowCanvasOk, glowScale, paintFile, paintPlan, planKey, recallFile, rootKey, hostKey, Plans, whenIdle, unIdle, stats, useGlowCanvases, type GlowJob, type GlowPlan, type GlowSrc } from './glow';
import { gradient, loadPictures, readSrc } from './glowCss';
import { barColor, PER_TAB, type BgKind } from './Backdrop';

/**
 * The app's soft glows as dithered pictures (glow.ts), so they are one smooth fade on the phone instead of coloured rings.
 * Each reads the CSS it replaces, which shows until the picture is ready (and stays where the picture can't be made).
 *
 * FieldGlow: a tab's colour field. Everything in it that holds still (Classic's three lights, a background's gradients and
 * pictures, marked data-bake), with the page's grain and the status bar's colour fading in at the top (.fields-top), is
 * painted into ONE picture under the field's moving parts. So the field stays one standing layer for the graphics chip:
 * nothing is laid over the picture that would have to become a layer of its own.
 *
 * SelfGlow: one element's own gradients (a glow that moves or fades by itself: Orb light's beam and halo, Sunrise's sun, the
 * orb screen's halo, the workout window's top) as its own background image, which moves and fades with it. ImgGlow: the
 * same for a small glow that sits in a page (Today's card glow, the exercise stage's pool). A background image is drawn
 * where the gradient was, on the element's own layer: neither adds a layer.
 */

/** the field's parts that move (their own SelfGlow); a field with any keeps its grain and top tint in CSS, laid over them */
const MOVING = '.bg-orb-all, .bg-sun';

function describeField(host: HTMLElement, kind: BgKind): GlowPlan | null {
  const W = host.clientWidth, H = host.clientHeight;
  if (!W || !H) return null;
  const s = glowScale(), w = Math.round(W * s), h = Math.round(H * s);
  const parts = [...host.querySelectorAll<HTMLElement>(kind === 'classic' ? ':scope > i' : '[data-bake]')].filter((e) => e.clientWidth && e.clientHeight);
  if (!parts.length) return null;
  const srcs: GlowSrc[] = [];
  for (const el of parts) { const src = readSrc(el, host, { s: w / W, inHost: true }); if (!src) return null; srcs.push(src); }
  const still = !host.querySelector(MOVING);
  // (every field is opaque: its picture is too, over the page's colour)
  const job: GlowJob = { w, h, base: cssColor(host, 'var(--bg)'), amp: 2, srcs };
  // the top tint goes in too where the field itself holds still (Classic's sways: there it stays the CSS strip, which
  // holds the status bar's colour in place)
  const top = still && getComputedStyle(host).animationName === 'none' ? host.parentElement?.querySelector<HTMLElement>('.fields-top') : null;
  if (still) {
    // the grain (::after), as styles.css draws it
    job.grain = { g: parseFloat(getComputedStyle(host, '::after').opacity) || 0, y0: 0, s: w / W, f: Math.min(1, w / W / 4) };
    if (top) {
      // (where the strip sits in the field: a field may reach past the screen's edges)
      const th = top.offsetHeight, sat = th - 130, bar = cssColor(host, barColor(host, kind)).map(Math.round);
      const g = gradient(`linear-gradient(rgb(${bar.join(', ')}) ${sat + 2}px, rgba(0, 0, 0, 0))`, W, th);
      if (!g) return null;
      job.top = [{ op: 1, m: [W / w, 0, 0, H / h, host.offsetLeft - top.offsetLeft, host.offsetTop - top.offsetTop], w: W, h: th, clip: true, bg: null, layers: [g] }];
    }
  }
  const jobs = [job];
  const pics = srcs.some((x) => x.img);
  return {
    jobs, key: planKey(jobs, (still ? ':still' : '') + (top ? ':top' : '')),
    load: pics ? async () => ((await loadPictures(srcs, w, h)) ? jobs : null) : undefined,
  };
}

/** whether a kind of field moves itself (read once per look: a tab switch brings a new field, and reading it then made the
 * browser work the page's styles out in the middle of the tap) */
const swaysBy = new Map<string, boolean>();
export function FieldGlow({ kind }: { kind: BgKind }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const host = () => cv.current?.parentElement ?? null;
  useGlowCanvases(host, [cv], (el) => describeField(el, kind), (on) => {
    const el = host(); if (!el) return;
    const still = on && !el.querySelector(MOVING);
    el.toggleAttribute('data-dith', on); el.toggleAttribute('data-still', still);
    // (read once the page is idle, never in the middle of a switch: there it made the browser work the page's styles out twice)
    const r = document.documentElement.dataset, sk = `${kind}§${r.motion}§${r.glow}`;
    if (still && !swaysBy.has(sk)) whenIdle(() => {
      if (!el.isConnected || !el.hasAttribute('data-still')) return;
      swaysBy.set(sk, getComputedStyle(el).animationName !== 'none');
      el.toggleAttribute('data-top', !swaysBy.get(sk));
    });
    el.toggleAttribute('data-top', still && swaysBy.get(sk) === false);
    if (on && PER_TAB[kind]) prewarm(el, kind);
  }, (el) => el.parentElement ?? el, (el) => `field§${kind}§${el.dataset.hue}`);
  return <canvas ref={cv} className="glow-cv glow-field" aria-hidden />;
}

/**
 * Paints the other tabs' fields ahead, while the page is idle, so a tab switch finds its picture ready (the new field then
 * shows it from its first frame instead of swapping the gradient for it after the cross-fade).
 */
let prewarmAt = 0, prewarmIdle = 0;
function prewarm(field: HTMLElement, kind: BgKind) {
  const run = () => {
    const parent = field.parentElement; if (!parent || !field.isConnected) return;
    for (const hue of ['today', 'train', 'food', 'progress']) {
      if (hue === field.dataset.hue) continue;
      // (its plan, for the field that tab brings, kept so that field needn't read the page when it comes)
      const sk = shareKey(field, `field§${kind}§${hue}`);
      let plan = sharedPlan(sk) ?? null;
      if (!plan) {
        const clone = field.cloneNode(true) as HTMLElement;
        clone.dataset.hue = hue; clone.style.visibility = 'hidden'; clone.style.zIndex = '-1';
        clone.removeAttribute('data-dith');
        parent.insertBefore(clone, parent.firstChild);
        try { plan = describeField(clone, kind); } finally { clone.remove(); }
        if (plan) setSharedPlan(sk, plan);
      }
      if (!plan) continue;
      const k = plan.key;
      // (and its picture, painted by the worker, off the page)
      if (!recall(k, false)) void paintPlan(plan, true);
    }
  };
  // (once the switch that brought this field has played: the worker's painting then can't take time from its animation)
  clearTimeout(prewarmAt); unIdle(prewarmIdle);
  prewarmAt = window.setTimeout(() => { prewarmIdle = whenIdle(run, 4000); }, 2500);
}

/** the opacity `el` is headed for (its fade's end, not where the fade is now) */
function targetOpacity(el: HTMLElement): number {
  const anims = el.getAnimations().filter((a) => a.playState !== 'finished');
  const fade = anims.find((a) => (a as CSSTransition).transitionProperty === 'opacity');
  if (anims.every((a) => a === fade)) {
    if (!fade) return parseFloat(getComputedStyle(el).opacity) || 0;
    const end = (fade.effect as KeyframeEffect | null)?.getKeyframes().at(-1)?.opacity;
    if (end != null) return parseFloat(String(end)) || 0;
  }
  // (an animation of its own: read from a copy of it with no motion, just before it, so the same rules apply: `i + i`)
  const c = el.cloneNode(false) as HTMLElement;
  c.style.setProperty('animation', 'none', 'important'); c.style.setProperty('transition', 'none', 'important');
  el.parentElement?.insertBefore(c, el);
  try { return parseFloat(getComputedStyle(c).opacity) || 0; } finally { c.remove(); }
}

/** An element's own gradients as a job (null if they can't be painted), read with its picture switched off for a moment
 * (`attr`: the attribute that hides the CSS gradient) */
function describeSelf(el: HTMLElement, scale: number, amp: number, attr: string, extra: string): GlowPlan | null {
  const W = el.clientWidth, H = el.clientHeight;
  if (!W || !H) return null;
  const w = Math.max(2, Math.round(W * scale)), h = Math.max(2, Math.round(H * scale));
  const on = el.hasAttribute(attr);
  if (on) el.removeAttribute(attr);
  let src: GlowSrc | null = null;
  try { src = getComputedStyle(el).backgroundImage === 'none' ? null : readSrc(el, el, { s: w / W }); } finally { if (on) el.setAttribute(attr, ''); }
  if (!src || !src.layers.length || src.img) return null;
  src.m = [W / w, 0, 0, H / h, 0, 0];
  const jobs: GlowJob[] = [{ w, h, base: null, amp, srcs: [src] }];
  return { jobs, key: planKey(jobs, extra) };
}

/**
 * Keeps an element's background image the dithered picture of what `describe` returns (the CSS shows until it is ready):
 * the picture painted ahead if there is one, else painted in the worker (a theme or colour change shows the CSS until then,
 * not the picture before). `watchHost`: a change of its own class or style too, which keeps the picture it has until the
 * new one is there, and a picture for a fainter state (a stronger dither) waits for the fade to finish.
 */
function useGlowImage(at: React.RefObject<HTMLElement | null>, describe: (el: HTMLElement) => GlowPlan | null, whole: (el: HTMLElement) => HTMLElement, watchHost: boolean) {
  useLayoutEffect(() => {
    const el = at.current?.parentElement;
    if (!el || !glowCanvasOk()) return;
    let alive = true, cur = '', want = '', url = '', op = 1, idle = 0, verify = 0;
    const set = (u: string | null, p?: GlowPlan) => {
      if (url) fileShown(url, false);
      url = u ?? '';
      if (u) { fileShown(u, true); el.style.setProperty('--glow-img', `url(${u})`); } else el.style.removeProperty('--glow-img');
      el.toggleAttribute('data-dith-img', !!u);
      cur = p?.key ?? ''; op = p?.op ?? 1;
    };
    const plan = (on: HTMLElement) => { try { return describe(on); } catch { return null; } };
    const plans = new Plans();
    let size = `${el.clientWidth}x${el.clientHeight}`, last = '';
    const state = (rk = rootKey()) => `${rk}§${hostKey(el)}§${size}`;
    const show = (p: GlowPlan, u: string) => {
      if ((p.op ?? 1) < op - 0.01 && url) {
        const fades = el.getAnimations().filter((a) => (a as CSSTransition).transitionProperty === 'opacity');
        if (fades.length) {
          void Promise.all(fades.map((a) => a.finished)).catch(() => {}).then(() => { if (alive && want === p.key) set(recallFile(p.key) ?? u, p); });
          return;
        }
      }
      set(u, p);
    };
    /** how: 'root' a theme (palette…) change: the plan for the new state is looked up (painted ahead) and checked against the
     * page once it is idle; 'host' its own class or style: looked up, else read once the page is idle ('later'; the picture
     * it has stays until the new one is there); 'read': read now */
    const now = (how: 'root' | 'host' | 'later' | 'read') => {
      if (!alive) return;
      const st = state();
      if (how === 'host' && st === last) return; // (its own picture being set, or a motion: nothing that shows in it)
      last = st;
      let p = how === 'read' || how === 'later' ? undefined : plans.get(st);
      if (p) { unIdle(verify); verify = whenIdle(() => now(how === 'host' ? 'later' : 'read')); }
      else if (how === 'host') { unIdle(verify); verify = whenIdle(() => now('later')); return; }
      else { p = plan(el) ?? undefined; if (p) plans.set(st, p); }
      if (!p) return;
      want = p.key;
      if (p.key === cur) return;
      const u = recallFile(p.key);
      stats[u ? 'fileHit' : 'fileMiss']++;
      if (u) { show(p, u); return; }
      // (a theme or colour change: not the picture before, the CSS shows until the new one is there)
      if ((how === 'root' || how === 'read') && url) set(null);
      unIdle(idle);
      const q = p;
      idle = whenIdle(() => { if (alive && want === q.key) void paintFile(q).then((v) => { if (alive && v && want === q.key) show(q, v); }); }, 1000);
    };
    now('read');
    const ro = new ResizeObserver(() => { const s2 = `${el.clientWidth}x${el.clientHeight}`; if (s2 !== size) { size = s2; now('read'); } }); ro.observe(el);
    const mo = new MutationObserver((recs) => now(recs.every((r) => r.target === el) ? 'host' : 'root'));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette', 'data-glow', 'data-motion'] });
    if (watchHost) mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    const untwin = addTwin({ el: () => el, whole, warm: (copy, rk) => {
      const p = plan(copy); if (!p) return;
      plans.set(state(rk), p);
      if (!recallFile(p.key)) void paintFile(p);
    } });
    return () => { alive = false; ro.disconnect(); mo.disconnect(); untwin(); unIdle(idle); unIdle(verify); if (url) fileShown(url, false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** `coarse`: a very wide, soft glow, drawn at a quarter of the screen's pixels (nothing in it is sharp enough to show it).
 * The glow's own opacity and motion stay in CSS: the screen multiplies the picture by that opacity, so the dither is made for
 * the opacity the glow is headed for (a stronger one while it is faint: the orb's beam with the Coach open), and a picture
 * for a fainter state is swapped in once the fade has finished. `whole`: how much around it its look depends on. */
export function SelfGlow({ coarse, whole }: { coarse?: boolean; whole?: (el: HTMLElement) => HTMLElement }) {
  const at = useRef<HTMLElement>(null);
  useGlowImage(at, (el) => {
    const op = targetOpacity(el), plan = describeSelf(el, glowScale() / (coarse ? 2 : 1), ampFor(op), 'data-dith-img', ':self');
    if (plan) plan.op = op;
    return plan;
  }, whole ?? ((el) => el.parentElement ?? el), true);
  return <i ref={at} hidden aria-hidden />;
}

/** A small glow in a page (its parent's own background gradient) as a dithered image in its background. */
export function ImgGlow() {
  const at = useRef<HTMLElement>(null);
  useGlowImage(at, (el) => describeSelf(el, glowScale(), 4, 'data-dith-img', ':img'), (el) => el, false);
  return <i ref={at} hidden aria-hidden />;
}
