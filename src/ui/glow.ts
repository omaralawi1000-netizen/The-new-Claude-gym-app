import { useLayoutEffect, type RefObject } from 'react';
import { grainTile } from '../lib/grain';
import { decode, decoded, inverse, placePicture } from './glowCss';
import { N, table } from './glowMath';

/**
 * Soft glows drawn as dithered pictures instead of CSS gradients (glow.worker.ts says why: on the phone a CSS gradient
 * is drawn in whole colour steps, so a dim glow showed as coloured rings). The picture is worked out in a worker, at half
 * the screen's pixel size (the glows are soft, so the screen's own smoothing when it is shown at full size loses nothing),
 * and written once into a canvas. What to draw is read from the page's own CSS (glowCss.ts), so the picture is always exactly
 * the gradient it replaces.
 *
 * The canvas gets its size and its picture in the same frame its element first shows (and again in the same frame the
 * theme, the palette or its size changes): the dithered picture if one is kept from before, else the same picture drawn at
 * once with the canvas's own gradients (in whole steps, as the CSS was), which the dithered one replaces when the page is
 * idle. So the canvas is a layer from its first frame to its last, never added or dropped later, and never shows a picture
 * of the theme or palette before. If the graphics chip loses the canvas, the CSS shows until it is drawn again.
 */
/** a colour stop: straight colour 0-255 and alpha 0-1, at `p` along the gradient's line (0-1, may reach past either end) */
export interface GlowStop { c: [number, number, number, number]; p: number }
/** one gradient. 'r' radial: g = centre x, y and radii x, y; 'l' linear: g = start x, y and the line's direction over its
 * length (so t = (p - start) · g[2..3]). In the element's own CSS px. `oklab`: mixed in Oklab, as CSS does for newer colours */
export interface GlowLayer { k: 'r' | 'l'; g: [number, number, number, number]; stops: GlowStop[]; oklab?: boolean }
/** an element's own picture (its background colour, a picture, its gradients bottom first) at opacity `op`. `m` maps a
 * canvas pixel to the element's CSS px (x' = m0·x + m2·y + m4, y' = m1·x + m3·y + m5); `clip`: nothing outside its w × h box */
export interface GlowSrc {
  op: number; m: number[]; w: number; h: number; clip: boolean; bg: [number, number, number, number] | null; layers: GlowLayer[];
  img?: { bm: ImageBitmap; url?: string; x: number; y: number; w: number; h: number };
}
/** the film grain (lib/grain.ts) drawn into a picture, as the CSS draws it: at strength `g`, from row `y0` down, `s` canvas px
 * per CSS px; `tile`/`n`: the grain's own tile (its alpha), filled in by paint() */
export interface GlowGrain { g: number; y0: number; s: number; f?: number; tile?: Uint8Array; n?: number }
/** w×h canvas pixels; `base`: an opaque picture over this colour (null: see-through); `amp` the dither in levels; `grain`
 * drawn in as well; `top`: drawn over the grain */
export interface GlowJob { w: number; h: number; base: [number, number, number] | null; amp: number; grain?: GlowGrain; srcs: GlowSrc[]; top?: GlowSrc[]; sim?: boolean }

let worker: Worker | null = null, broken = false, seq = 0;
const waiting = new Map<number, (b: ImageData | null) => void>();

export const glowCanvasOk = () => !broken && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';

function paint(job: GlowJob): Promise<ImageData | null> {
  if (!worker) {
    try {
      worker = new Worker(new URL('./glow.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; px: ImageData | null }>) => { waiting.get(e.data.id)?.(e.data.px); waiting.delete(e.data.id); };
      worker.onerror = () => { broken = true; for (const f of waiting.values()) f(null); waiting.clear(); };
    } catch { broken = true; return Promise.resolve(null); }
  }
  const id = ++seq;
  // (checks only: window.__glowSim draws the pictures without the dither, as the phone drew the CSS)
  if ((window as { __glowSim?: boolean }).__glowSim) job = { ...job, sim: true };
  const t = grainTile();
  if (job.grain && t) job = { ...job, grain: { ...job.grain, tile: t.a, n: t.n } };
  const imgs = [...job.srcs, ...(job.top ?? [])].flatMap((s) => (s.img ? [s.img.bm] : []));
  return new Promise((res) => { waiting.set(id, res); worker!.postMessage({ id, job }, imgs); });
}

/**
 * The pictures painted lately, by what they show, so a window or a tab's colour field that comes back (or one painted ahead
 * while the page was idle, prewarmGlow) shows at once. Kept in memory (their pixels), not on the graphics chip; the oldest go
 * past ~48 MB.
 */
const kept = new Map<string, ImageData[]>();
const KEEP_BYTES = 48 << 20;
function keep(key: string, pics: ImageData[]) {
  kept.delete(key); kept.set(key, pics);
  let bytes = 0;
  for (const v of kept.values()) for (const b of v) bytes += b.width * b.height * 4;
  for (const [k, v] of kept) {
    if (bytes <= KEEP_BYTES || k === key) break;
    for (const b of v) bytes -= b.width * b.height * 4;
    kept.delete(k);
  }
}
/** the pictures kept for `key` (and, by default, marks them as just used) */
export const recall = (key: string, touch = true) => { const v = kept.get(key); if (v && touch) { kept.delete(key); kept.set(key, v); } return v; };

/** What a canvas should show: the job, and what it needs that has to be fetched first (pictures, as `img.bm` = null until
 * then). `op`: the opacity its element is headed for (see SelfGlow), so a picture for a fainter state waits for the fade */
export type GlowPlan = { jobs: GlowJob[]; key: string; load?: () => Promise<GlowJob[] | null>; op?: number };
/** a plan's key: the jobs as text, pictures by their address */
export const planKey = (jobs: GlowJob[], extra = '') => JSON.stringify(jobs, (k, v) => (k === 'bm' || k === 'tile' ? undefined : v)) + extra;

/** Paints a plan's pictures (once; later calls with the same key get the same pictures) */
const painting = new Map<string, Promise<ImageData[] | null>>();
export function paintPlan(plan: GlowPlan): Promise<ImageData[] | null> {
  const hit = recall(plan.key); if (hit) return Promise.resolve(hit);
  let p = painting.get(plan.key);
  if (!p) {
    p = (async () => {
      const jobs = plan.load ? await plan.load() : plan.jobs;
      if (!jobs) return null;
      const pics = await Promise.all(jobs.map(paint));
      if (pics.some((b) => !b)) return null;
      keep(plan.key, pics as ImageData[]);
      return pics as ImageData[];
    })().catch(() => null).finally(() => painting.delete(plan.key));
    painting.set(plan.key, p);
  }
  return p;
}

// ── the quick picture: the same job drawn at once with the canvas's own gradients (whole steps, no dither) ──
type Ctx = CanvasRenderingContext2D;
const rgba = (c: ArrayLike<number>, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
/** a layer's gradient as the canvas draws it, in a space where the gradient is a circle of radius 1 at 0,0 (radial) or
 * along its own line (linear): 48 stops sampled from the same colours the worker uses */
function canvasGradient(g: Ctx, L: GlowLayer): CanvasGradient | null {
  const { lut, t0, t1 } = table(L), q = L.g, S = 48;
  const a0 = L.k === 'r' ? 0 : t0, a1 = t1;
  let grad: CanvasGradient;
  if (L.k === 'r') grad = g.createRadialGradient(0, 0, 0, 0, 0, a1);
  else {
    const n2 = q[2] * q[2] + q[3] * q[3]; if (!n2) return null;
    const ux = q[2] / n2, uy = q[3] / n2;
    grad = g.createLinearGradient(q[0] + ux * a0, q[1] + uy * a0, q[0] + ux * a1, q[1] + uy * a1);
  }
  for (let i = 0; i <= S; i++) {
    const t = a0 + ((a1 - a0) * i) / S;
    let f = ((t - t0) * (N - 1)) / (t1 - t0); f = Math.min(N - 1, Math.max(0, f));
    const j = f | 0, k = f - j, j2 = Math.min(N - 1, j + 1), v = [0, 1, 2, 3].map((c) => lut[j * 4 + c] + (lut[j2 * 4 + c] - lut[j * 4 + c]) * k);
    const al = v[3];
    grad.addColorStop(i / S, al > 0 ? rgba([v[0] / al, v[1] / al, v[2] / al], al) : 'rgba(0, 0, 0, 0)');
  }
  return grad;
}
/** draws one source into `g`, whose pixels are `k` of the canvas's each way (a picture it shows that isn't decoded yet is
 * fetched: `wait` gets the promise) */
function drawSrc(g: Ctx, s: GlowSrc, k: number, wait: Promise<unknown>[]): void {
  // a source at less than full opacity is drawn whole first, then laid on at its opacity (as CSS does)
  const t = s.op < 1 ? soft(g.canvas.width, g.canvas.height) : g;
  t.save();
  t.setTransform(k, 0, 0, k, 0, 0); t.transform(...inverse(s.m));
  const BIG = 1e5;
  if (s.clip) { t.beginPath(); t.rect(0, 0, s.w, s.h); t.clip(); }
  if (s.bg) { t.fillStyle = rgba(s.bg, s.bg[3]); t.fillRect(-BIG, -BIG, 2 * BIG, 2 * BIG); }
  const url = s.img?.url;
  if (url) { const el = decoded.get(url); if (el) placePicture(t, s, el); else wait.push(decode(url)); }
  for (const L of s.layers) {
    const grad = canvasGradient(t, L); if (!grad) continue;
    t.save();
    if (L.k === 'r') { if (!L.g[2] || !L.g[3]) { t.restore(); continue; } t.translate(L.g[0], L.g[1]); t.scale(L.g[2], L.g[3]); }
    t.fillStyle = grad; t.fillRect(-BIG, -BIG, 2 * BIG, 2 * BIG);
    t.restore();
  }
  t.restore();
  if (t !== g) { g.globalAlpha = s.op; g.drawImage(t.canvas, 0, 0); g.globalAlpha = 1; }
}
/** a canvas in memory, drawn by the processor (willReadFrequently) */
const soft = (w: number, h: number) => new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true }) as unknown as Ctx;
/** the quick picture's gradients are drawn at a quarter of the canvas's pixels each way and smoothed up: they are soft, so
 * nothing is lost that shows, and it is sixteen times less to draw (a picture a source shows is drawn at full size) */
const Q = 4;
/** the grain at a canvas's size, kept (drawn once, then laid on in one go) */
const grains = new Map<string, ImageBitmap>();
function grainOver(job: GlowJob): ImageBitmap | null {
  const t = grainTile(), gr = job.grain; if (!gr || !t) return null;
  const key = `${job.w}x${job.h} ${gr.g} ${gr.s} ${gr.y0}`;
  let bm = grains.get(key);
  if (!bm) {
    // the CSS grain's own tile, a quarter of a CSS px per pixel: shrunk once to the canvas's pixels (a pattern drawn shrunk
    // is slow), then repeated from the grain's top
    const n = Math.max(1, Math.round((t.n * gr.s) / 4)), tile = soft(n, n);
    tile.imageSmoothingQuality = 'high'; tile.drawImage(t.cv, 0, 0, n, n);
    const g = soft(job.w, job.h), pat = g.createPattern(tile.canvas, 'repeat'); if (!pat) return null;
    pat.setTransform(new DOMMatrix().translate(0, gr.y0));
    g.globalAlpha = gr.g; g.fillStyle = pat; g.fillRect(0, gr.y0, job.w, job.h - gr.y0);
    bm = (g.canvas as unknown as OffscreenCanvas).transferToImageBitmap();
    if (grains.size >= 4) { const [k0, b0] = grains.entries().next().value!; b0.close(); grains.delete(k0); }
    grains.set(key, bm);
  }
  return bm;
}
/** Draws `job` at once into `g` (the canvas, at the job's size). `wait`: what it still waits for (a picture being decoded:
 * draw again when it settles) */
function quickPaint(g: Ctx, job: GlowJob, wait: Promise<unknown>[]): void {
  const { w, h } = job, lw = Math.ceil(w / Q), lh = Math.ceil(h / Q);
  if (job.base) { g.fillStyle = rgba(job.base, 1); g.fillRect(0, 0, w, h); } else g.clearRect(0, 0, w, h);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
  // runs of gradient sources go through one small canvas, smoothed up onto the picture
  let low: Ctx | null = null;
  const flush = () => { if (low) { g.drawImage(low.canvas, 0, 0, lw, lh, 0, 0, lw * Q, lh * Q); low = null; } };
  const draw = (list: GlowSrc[]) => {
    for (const s of list) {
      if (s.img) { flush(); drawSrc(g, s, 1, wait); }
      else { if (!low) low = soft(lw, lh); drawSrc(low, s, 1 / Q, wait); }
    }
    flush();
  };
  draw(job.srcs);
  const grain = grainOver(job); if (grain) g.drawImage(grain, 0, 0);
  if (job.top) draw(job.top);
}

/** A colour as the page works it out (through a probe inside `host`, so it gets the variables that apply there). */
export function cssColor(host: Element, expr: string): [number, number, number] {
  const d = document.createElement('i');
  d.style.cssText = `position:absolute;width:0;height:0;color:${expr}`;
  host.appendChild(d);
  const s = getComputedStyle(d).color; d.remove();
  const rgb = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const srgb = s.match(/color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)/);
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255];
  return [0, 0, 0];
}

/** half the screen's pixels, at least one per CSS pixel */
export const glowScale = () => Math.max(1, (window.devicePixelRatio || 1) / 2);

/** how strong a picture's dither has to be for its element shown at opacity `op`: the screen multiplies the picture by its
 * opacity and then rounds, so a faint glow needs a stronger dither in its picture to keep about 1.6 levels on screen. A
 * glow headed for 0 (fading out, or waiting to fade in) gets the dither for a fade: smooth from about a fifth up */
export const ampFor = (op: number, base = 2.5) => (op > 0.01 ? Math.min(24, Math.max(base, 1.6 / op)) : base);

/**
 * Keeps the canvases of `refs` painted with what `describe` returns (one job per canvas, null = nothing to draw now) and
 * calls `shown(true)` once all of them hold their picture (`shown(false)` if the graphics chip loses them). Draws at once
 * on mount, a theme, palette or glow change and a size change (the quick picture if no dithered one is kept), and paints the
 * dithered picture when the page is idle and settled, so it never competes with a motion. `watchHost`: also a change of the
 * host's own style or class (a glow whose colours are written on it, or that fades to a fainter state: then the picture for
 * the fainter state waits for the fade to finish).
 */
export function useGlowCanvases(host: () => HTMLElement | null, refs: RefObject<HTMLCanvasElement | null>[], describe: (host: HTMLElement) => GlowPlan | null, shown: (on: boolean) => void, watchHost = false) {
  useLayoutEffect(() => {
    const el = host();
    if (!el || !glowCanvasOk()) return;
    let alive = true, lost = false, timer = 0, idle = 0;
    /** what the canvases hold: the dithered picture of `real`, or the quick one of `quick` */
    let real = '', quick = '', op = 1, want = '';
    const drawn = new Set<HTMLCanvasElement>();
    /** Writes a picture's pixels into its canvas (straight in: no copy of it is kept on the graphics chip for drawing). Each
     * new picture starts the canvas afresh (its size set anew), so the buffer of the picture before is let go, not kept to
     * draw into next time: one copy of the picture on the graphics chip, as the CSS had */
    const put = (plan: GlowPlan, pics: ImageData[] | null) => {
      const waits: Promise<unknown>[] = [];
      plan.jobs.forEach((job, i) => {
        const cv = refs[i]?.current; if (!cv) return;
        let px: ImageData;
        if (pics) px = pics[i];
        else { const q = soft(job.w, job.h); quickPaint(q, job, waits); px = q.getImageData(0, 0, job.w, job.h); }
        cv.width = 1; cv.width = job.w; cv.height = job.h;
        const g = cv.getContext('2d', { alpha: !job.base }) as Ctx | null; if (!g) return;
        g.putImageData(px, 0, 0); drawn.add(cv);
        // (checks: data-q marks a canvas showing the quick picture)
        cv.toggleAttribute('data-q', !pics);
      });
      if (pics) { real = plan.key; quick = ''; } else { quick = plan.key; real = ''; }
      op = plan.op ?? 1;
      shown(true);
      // a picture still being decoded: drawn again (quick) when it is there
      if (waits.length) void Promise.all(waits).then(() => { if (alive && !lost && quick === plan.key) put(plan, null); });
    };
    const plan = () => { try { return describe(el); } catch { return null; } };
    /** now: the dithered picture if kept, else the quick one (and the dithered one later). `fade`: a change of the host's own
     * class or style, which keeps what is shown until the dithered picture is there */
    const now = (fade: boolean) => {
      if (!alive || lost) return;
      const p = plan();
      if (!p || p.jobs.some((j) => j.w < 2 || j.h < 2)) return;
      want = p.key;
      if (p.key === real) return;
      const hit = recall(p.key);
      if (hit) { show(p, hit); return; }
      if (!fade && p.key !== quick) put(p, null);
      later(fade ? 0 : 1200);
    };
    /** a picture for a fainter state (stronger dither) waits until the element's fade has finished */
    const show = (p: GlowPlan, pics: ImageData[]) => {
      if ((p.op ?? 1) < op - 0.01 && real) {
        const fades = el.getAnimations().filter((a) => (a as CSSTransition).transitionProperty === 'opacity');
        if (fades.length) {
          void Promise.all(fades.map((a) => a.finished)).catch(() => {}).then(() => { if (alive && !lost && want === p.key) put(p, recall(p.key) ?? pics); });
          return;
        }
      }
      put(p, pics);
    };
    const paintNow = () => {
      if (!alive || lost) return;
      const p = plan();
      if (!p || p.key === real) return;
      paintPlan(p).then((pics) => { if (alive && !lost && pics && want === p.key) show(p, pics); });
    };
    const later = (ms: number) => {
      clearTimeout(timer); if (idle && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
      timer = window.setTimeout(() => { idle = typeof requestIdleCallback === 'function' ? requestIdleCallback(paintNow, { timeout: 1500 }) : window.setTimeout(paintNow, 0); }, ms);
    };
    // in the same frame: what was shown before, or the quick picture
    now(false);
    const ro = new ResizeObserver(() => now(false)); ro.observe(el);
    // (a microtask after the change, before the next frame: a theme switch's snapshot already holds the new picture)
    const mo = new MutationObserver((recs) => now(recs.every((r) => r.target === el)));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette', 'data-glow'] });
    if (watchHost) mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    // the graphics chip lost the canvas (a GPU reset): the CSS shows until it is back, then it is drawn again
    const onLost = () => { lost = true; real = quick = ''; shown(false); }; // (not cancelled: that would stop the restore)
    const onBack = () => { lost = false; real = quick = ''; now(false); };
    const check = () => { if (!document.hidden && [...drawn].some((c) => (c.getContext('2d') as Ctx | null)?.isContextLost?.())) onLost(); };
    const cvs = refs.map((r) => r.current).filter((c): c is HTMLCanvasElement => !!c);
    for (const c of cvs) { c.addEventListener('contextlost', onLost); c.addEventListener('contextrestored', onBack); }
    document.addEventListener('visibilitychange', check);
    return () => {
      alive = false; clearTimeout(timer); if (idle && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle); ro.disconnect(); mo.disconnect();
      for (const c of cvs) { c.removeEventListener('contextlost', onLost); c.removeEventListener('contextrestored', onBack); }
      document.removeEventListener('visibilitychange', check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
