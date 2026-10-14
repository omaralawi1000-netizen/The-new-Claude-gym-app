import { useLayoutEffect, type RefObject } from 'react';

/**
 * Soft glows drawn as dithered pictures instead of CSS gradients (glow.worker.ts says why: on the phone a CSS gradient
 * is drawn in whole colour steps, so a dim glow showed as coloured rings). The picture is worked out in a worker, at half
 * the screen's pixel size (the glows are soft, so the screen's own smoothing when it is shown at full size loses nothing),
 * and drawn once into a canvas; until it is ready the CSS gradient shows, which is the same picture with the steps.
 * What to draw is read from the page's own CSS (glowCss.ts), so the picture is always exactly the gradient it replaces.
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
/** w×h canvas pixels; `base`: an opaque picture over this colour (null: see-through); `amp` the dither in levels; `grain`: the
 * film grain (lib/grain.ts) drawn in as well, at strength `g`, from row `y0` down; `top`: drawn over the grain */
export interface GlowJob { w: number; h: number; base: [number, number, number] | null; amp: number; grain?: { g: number; y0: number }; srcs: GlowSrc[]; top?: GlowSrc[]; sim?: boolean }

let worker: Worker | null = null, broken = false, seq = 0;
const waiting = new Map<number, (b: ImageBitmap | null) => void>();

export const glowCanvasOk = () => !broken && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';

function paint(job: GlowJob): Promise<ImageBitmap | null> {
  if (!worker) {
    try {
      worker = new Worker(new URL('./glow.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; bm: ImageBitmap | null }>) => { waiting.get(e.data.id)?.(e.data.bm); waiting.delete(e.data.id); };
      worker.onerror = () => { broken = true; for (const f of waiting.values()) f(null); waiting.clear(); };
    } catch { broken = true; return Promise.resolve(null); }
  }
  const id = ++seq;
  // (checks only: window.__glowSim draws the pictures without the dither, as the phone drew the CSS)
  if ((window as { __glowSim?: boolean }).__glowSim) job = { ...job, sim: true };
  const imgs = [...job.srcs, ...(job.top ?? [])].flatMap((s) => (s.img ? [s.img.bm] : []));
  return new Promise((res) => { waiting.set(id, res); worker!.postMessage({ id, job }, imgs); });
}

/**
 * The pictures painted lately, by what they show, so a window or a tab's colour field that comes back (or one painted ahead
 * while the page was idle, prewarmGlow) shows at once. Kept in memory, not on the graphics chip; the oldest go past ~48 MB.
 */
const kept = new Map<string, ImageBitmap[]>();
const KEEP_BYTES = 48 << 20;
function keep(key: string, bms: ImageBitmap[]) {
  kept.delete(key); kept.set(key, bms);
  let bytes = 0;
  for (const v of kept.values()) for (const b of v) bytes += b.width * b.height * 4;
  for (const [k, v] of kept) {
    if (bytes <= KEEP_BYTES || k === key) break;
    for (const b of v) { bytes -= b.width * b.height * 4; b.close(); }
    kept.delete(k);
  }
}
/** the pictures kept for `key` (and, by default, marks them as just used) */
export const recall = (key: string, touch = true) => { const v = kept.get(key); if (v && touch) { kept.delete(key); kept.set(key, v); } return v; };

/** What a canvas should show: the job, and what it needs that has to be fetched first (pictures, as `img.bm` = null until then) */
export type GlowPlan = { jobs: GlowJob[]; key: string; load?: () => Promise<GlowJob[] | null> };
/** a plan's key: the jobs as text, pictures by their address */
export const planKey = (jobs: GlowJob[], extra = '') => JSON.stringify(jobs, (k, v) => (k === 'bm' ? undefined : v)) + extra;

/** Paints a plan's pictures (once; later calls with the same key get the same pictures) */
const painting = new Map<string, Promise<ImageBitmap[] | null>>();
export function paintPlan(plan: GlowPlan): Promise<ImageBitmap[] | null> {
  const hit = recall(plan.key); if (hit) return Promise.resolve(hit);
  let p = painting.get(plan.key);
  if (!p) {
    p = (async () => {
      const jobs = plan.load ? await plan.load() : plan.jobs;
      if (!jobs) return null;
      const bms = await Promise.all(jobs.map(paint));
      if (bms.some((b) => !b)) { bms.forEach((b) => b?.close()); return null; }
      keep(plan.key, bms as ImageBitmap[]);
      return bms as ImageBitmap[];
    })().catch(() => null).finally(() => painting.delete(plan.key));
    painting.set(plan.key, p);
  }
  return p;
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

/**
 * Keeps the canvases of `refs` painted with what `describe` returns (one job per canvas, null = nothing to draw now) and
 * calls `shown(true)` once all of them hold their picture. Repaints after a size, theme, palette or glow change (`watchHost`:
 * or a change of the host's own style or class), and only
 * when the page is idle and the window has settled, so it never competes with a motion.
 */
export function useGlowCanvases(host: () => HTMLElement | null, refs: RefObject<HTMLCanvasElement | null>[], describe: (host: HTMLElement) => GlowPlan | null, shown: (on: boolean) => void, watchHost = false) {
  // before the first paint, so a picture kept from before is there in the first frame: no layer is added or dropped once
  // a motion has started, and the CSS gradient is never drawn first
  useLayoutEffect(() => {
    const el = host();
    if (!el || !glowCanvasOk()) return;
    let alive = true, shownKey = '', timer = 0, idle = 0;
    const draw = (bms: ImageBitmap[], plan: GlowPlan) => {
      bms.forEach((bm, i) => {
        const cv = refs[i]?.current; if (!cv) return;
        cv.width = bm.width; cv.height = bm.height; // in the same task as the drawing, so the canvas is never seen empty
        cv.getContext('2d', { alpha: !plan.jobs[i].base })?.drawImage(bm, 0, 0);
      });
      shownKey = plan.key; shown(true);
    };
    const run = (cachedOnly: boolean) => {
      if (!alive) return false;
      let plan: GlowPlan | null = null;
      try { plan = describe(el); } catch { plan = null; }
      if (!plan || plan.jobs.some((j) => j.w < 2 || j.h < 2)) return false;
      if (plan.key === shownKey) return true;
      const hit = recall(plan.key);
      if (hit) { draw(hit, plan); return true; }
      if (cachedOnly) return false;
      const p = plan;
      paintPlan(p).then((bms) => { if (alive && bms) draw(bms, p); });
      return true;
    };
    const later = (ms: number) => {
      clearTimeout(timer); if (idle && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
      timer = window.setTimeout(() => { idle = typeof requestIdleCallback === 'function' ? requestIdleCallback(() => run(false), { timeout: 1500 }) : window.setTimeout(() => run(false), 0); }, ms);
    };
    // a picture painted before shows at once; a new one waits until whatever is opening has finished
    if (!run(true)) later(1200);
    const ro = new ResizeObserver(() => later(400)); ro.observe(el);
    const mo = new MutationObserver(() => later(400));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette', 'data-glow'] });
    // (a glow whose colours are written on it, like the workout's top: when they change)
    if (watchHost) mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    return () => { alive = false; clearTimeout(timer); if (idle && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle); ro.disconnect(); mo.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
