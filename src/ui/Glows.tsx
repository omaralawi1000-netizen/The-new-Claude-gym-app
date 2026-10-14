import { useRef } from 'react';
import { cssColor, glowScale, paintPlan, planKey, recall, useGlowCanvases, type GlowJob, type GlowPlan, type GlowSrc } from './glow';
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
  const job: GlowJob = { w, h, base: kind === 'classic' ? null : cssColor(host, 'var(--bg)'), amp: 2, srcs };
  if (still) {
    // the grain (::after) and the top tint, as styles.css draws them
    job.grain = { g: parseFloat(getComputedStyle(host, '::after').opacity) || 0, y0: 0 };
    const top = host.parentElement?.querySelector<HTMLElement>('.fields-top');
    if (top) {
      const th = top.offsetHeight, sat = th - 130, bar = cssColor(host, barColor(host, kind)).map(Math.round);
      const g = gradient(`linear-gradient(rgb(${bar.join(', ')}) ${sat + 2}px, rgba(0, 0, 0, 0))`, W, th);
      if (!g) return null;
      job.top = [{ op: 1, m: [W / w, 0, 0, H / h, 0, 0], w: W, h: th, clip: true, bg: null, layers: [g] }];
    }
  }
  const jobs = [job];
  const pics = srcs.some((x) => x.img);
  return {
    jobs, key: planKey(jobs, still ? ':still' : ''),
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

/** `coarse`: a very wide, soft glow, drawn at a quarter of the screen's pixels (half the memory again; nothing in it is sharp
 * enough to show it). The glow's own opacity and motion stay in CSS. */
export function SelfGlow({ coarse }: { coarse?: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const host = () => cv.current?.parentElement ?? null;
  useGlowCanvases(host, [cv], (el) => {
    const W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return null;
    const s = glowScale() / (coarse ? 2 : 1), w = Math.max(2, Math.round(W * s)), h = Math.max(2, Math.round(H * s));
    // its own CSS, read with the picture switched off for a moment (it hides the CSS gradient)
    const on = el.hasAttribute('data-dith-self');
    if (on) el.removeAttribute('data-dith-self');
    const cs = getComputedStyle(el), bgi = cs.backgroundImage;
    let src: GlowSrc | null = null;
    try { src = bgi === 'none' ? null : readSrc(el, el, { s: w / W }); } finally { if (on) el.setAttribute('data-dith-self', ''); }
    if (!src || !src.layers.length || src.img) return null;
    src.m = [W / w, 0, 0, H / h, 0, 0];
    const jobs: GlowJob[] = [{ w, h, base: null, amp: 2, srcs: [src] }];
    return { jobs, key: planKey(jobs) };
  }, (on) => host()?.toggleAttribute('data-dith-self', on), true);
  return <canvas ref={cv} className="glow-cv glow-self" aria-hidden />;
}
