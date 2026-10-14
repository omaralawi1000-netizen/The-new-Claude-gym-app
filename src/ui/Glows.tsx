import { useLayoutEffect, useRef } from 'react';
import { ampFor, cssColor, glowCanvasOk, glowScale, paintPlan, planKey, recall, useGlowCanvases, type GlowJob, type GlowPlan, type GlowSrc } from './glow';
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
 * orb screen's halo), as a picture inside it that moves and fades with it.
 *
 * ImgGlow: a small glow that sits in a page (Today's card glow, the exercise stage's pool): its picture becomes the
 * element's own background image, painted with the page, so it adds no layer at all.
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

export function FieldGlow({ kind }: { kind: BgKind }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const host = () => cv.current?.parentElement ?? null;
  useGlowCanvases(host, [cv], (el) => describeField(el, kind), (on) => {
    const el = host(); if (!el) return;
    const still = on && !el.querySelector(MOVING);
    el.toggleAttribute('data-dith', on); el.toggleAttribute('data-still', still);
    el.toggleAttribute('data-top', still && getComputedStyle(el).animationName === 'none');
    if (on && PER_TAB[kind]) prewarm(el, kind);
  });
  return <canvas ref={cv} className="glow-cv glow-field" aria-hidden />;
}

/**
 * Paints the other tabs' fields ahead, while the page is idle, so a tab switch finds its picture ready (the new field then
 * shows it from its first frame instead of swapping the gradient for it after the cross-fade).
 */
const warmed = new Set<string>();
function prewarm(field: HTMLElement, kind: BgKind) {
  const run = () => {
    const parent = field.parentElement; if (!parent || !field.isConnected) return;
    for (const hue of ['today', 'train', 'food', 'progress']) {
      if (hue === field.dataset.hue) continue;
      const clone = field.cloneNode(true) as HTMLElement;
      clone.dataset.hue = hue; clone.style.visibility = 'hidden'; clone.style.zIndex = '-1';
      clone.removeAttribute('data-dith');
      parent.insertBefore(clone, parent.firstChild);
      let plan: GlowPlan | null = null;
      try { plan = describeField(clone, kind); } finally { clone.remove(); }
      if (!plan || warmed.has(plan.key) || recall(plan.key, false)) continue;
      warmed.add(plan.key);
      void paintPlan(plan);
    }
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 4000 }); else setTimeout(run, 1500);
}

/** the opacity `el` is headed for (its fade's end, not where the fade is now): read from a copy of it with no fade */
function targetOpacity(el: HTMLElement): number {
  const c = el.cloneNode(false) as HTMLElement;
  c.style.setProperty('animation', 'none', 'important'); c.style.setProperty('transition', 'none', 'important');
  // just before it, so the same rules apply (`i + i`)
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

/** `coarse`: a very wide, soft glow, drawn at a quarter of the screen's pixels (half the memory again; nothing in it is sharp
 * enough to show it). The glow's own opacity and motion stay in CSS: the screen multiplies the picture by that opacity, so
 * the dither is made for the opacity the glow is headed for (a stronger one while it is faint: the orb's beam with the Coach
 * open), and a picture for a fainter state is swapped in once the fade has finished. */
export function SelfGlow({ coarse }: { coarse?: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const host = () => cv.current?.parentElement ?? null;
  useGlowCanvases(host, [cv], (el) => {
    const op = targetOpacity(el), plan = describeSelf(el, glowScale() / (coarse ? 2 : 1), ampFor(op), 'data-dith-self', '');
    if (plan) plan.op = op;
    return plan;
  }, (on) => host()?.toggleAttribute('data-dith-self', on), true);
  return <canvas ref={cv} className="glow-cv glow-self" aria-hidden />;
}

/** the small glows' pictures as images (by plan), the newest last; the oldest are let go past 24 */
const urls = new Map<string, string>();
async function imageOf(plan: GlowPlan): Promise<string | null> {
  const had = urls.get(plan.key); if (had) return had;
  const pics = await paintPlan(plan); if (!pics) return null;
  const c = new OffscreenCanvas(pics[0].width, pics[0].height), g = c.getContext('2d'); if (!g) return null;
  g.putImageData(pics[0], 0, 0);
  const url = URL.createObjectURL(await c.convertToBlob({ type: 'image/png' }));
  // the picture must be ready to draw before it is shown (else the glow would be missing for a frame)
  const im = new Image(); im.src = url; await im.decode().catch(() => {});
  urls.set(plan.key, url);
  for (const [k, u] of urls) { if (urls.size <= 24) break; URL.revokeObjectURL(u); urls.delete(k); }
  return url;
}

/** A small glow in a page (its parent's own background gradient) as a dithered image in its background: no layer, no
 * canvas. Until the image is ready, and right after a theme or palette change it has no image for yet, the CSS shows. */
export function ImgGlow() {
  const at = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = at.current?.parentElement;
    if (!el || !glowCanvasOk()) return;
    let alive = true, timer = 0, want = '';
    const plan = () => { try { return describeSelf(el, glowScale(), 4, 'data-dith-img', ':img'); } catch { return null; } };
    const set = (url: string | null) => {
      if (url) el.style.setProperty('--glow-img', `url(${url})`); else el.style.removeProperty('--glow-img');
      el.toggleAttribute('data-dith-img', !!url);
    };
    const now = () => {
      if (!alive) return;
      const p = plan(); if (!p) return;
      want = p.key;
      const url = urls.get(p.key);
      if (url) { urls.delete(p.key); urls.set(p.key, url); set(url); return; }
      set(null);
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const go = () => { const q = plan(); if (q && q.key === want) void imageOf(q).then((u) => { if (alive && u && want === q.key) set(u); }); };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 1500 }); else go();
      }, 900);
    };
    now();
    const ro = new ResizeObserver(now); ro.observe(el);
    const mo = new MutationObserver(now);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
    return () => { alive = false; clearTimeout(timer); ro.disconnect(); mo.disconnect(); };
  }, []);
  return <i ref={at} hidden aria-hidden />;
}
