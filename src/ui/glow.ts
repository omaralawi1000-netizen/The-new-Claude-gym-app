import { useLayoutEffect, type RefObject } from 'react';

/**
 * Soft glows drawn as dithered pictures instead of CSS gradients (glow.worker.ts says why: on the phone a CSS gradient
 * is drawn in whole colour steps, so a dim glow showed as coloured rings). The picture is worked out in a worker, at half
 * the screen's pixel size (the glows are soft, so the screen's own smoothing when it is shown at full size loses nothing),
 * and drawn once into a canvas; until it is ready the CSS gradient shows, which is the same picture with the steps.
 */
export interface Glow { cx: number; cy: number; rx: number; ry: number; stop: number; c: [number, number, number]; a: number }
/** w×h canvas pixels; glows bottom first; `group` is the opacity of all of them together; `amp` the dither in levels;
 * `grain`: the film grain (lib/grain.ts) drawn in as well, at strength `g`, from row `y0` down (opaque pictures only) */
export interface GlowJob { w: number; h: number; base: [number, number, number] | null; glows: Glow[]; group: number; amp: number; grain?: { g: number; y0: number } }

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
  return new Promise((res) => { waiting.set(id, res); worker!.postMessage({ id, job }); });
}

/** the last pictures of each place, so a window that is put away and opened again shows them at once */
const kept = new Map<string, { key: string; bms: ImageBitmap[] }>();

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
 * calls `shown(true)` once all of them hold their picture. Repaints after a size, theme, palette or glow change, and only
 * when the page is idle and the window has settled, so it never competes with a motion.
 */
export function useGlowCanvases(slot: string, host: () => HTMLElement | null, refs: RefObject<HTMLCanvasElement | null>[], describe: (host: HTMLElement) => (GlowJob | null)[] | null, shown: (on: boolean) => void) {
  // before the first paint, so a picture kept from before is there in the window's first frame: no layer is added or
  // dropped once its motion has started
  useLayoutEffect(() => {
    const el = host();
    if (!el || !glowCanvasOk()) return;
    let alive = true, shownKey = '', timer = 0, idle = 0;
    const draw = (bms: ImageBitmap[], jobs: GlowJob[], key: string) => {
      bms.forEach((bm, i) => {
        const cv = refs[i].current; if (!cv) return;
        cv.width = bm.width; cv.height = bm.height; // in the same task as the drawing, so the canvas is never seen empty
        cv.getContext('2d', { alpha: !jobs[i].base })?.drawImage(bm, 0, 0);
      });
      shownKey = key; shown(true);
    };
    const run = () => {
      if (!alive) return;
      const got = describe(el);
      if (!got || got.some((j) => !j || j.w < 2 || j.h < 2)) return;
      const jobs = got as GlowJob[], key = JSON.stringify(jobs);
      if (key === shownKey) return;
      const hit = kept.get(slot);
      if (hit?.key === key) { draw(hit.bms, jobs, key); return; }
      Promise.all(jobs.map(paint)).then((bms) => {
        if (!alive || bms.some((b) => !b)) return;
        kept.get(slot)?.bms.forEach((b) => b.close());
        kept.set(slot, { key, bms: bms as ImageBitmap[] });
        draw(bms as ImageBitmap[], jobs, key);
      });
    };
    const later = (ms: number) => {
      clearTimeout(timer); if (idle && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
      timer = window.setTimeout(() => { idle = typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 1500 }) : window.setTimeout(run, 0); }, ms);
    };
    // a picture kept from before shows at once; a new one waits until the window has finished opening
    const hit = kept.get(slot);
    if (hit) run(); else later(1200);
    const ro = new ResizeObserver(() => later(400)); ro.observe(el);
    const mo = new MutationObserver(() => later(400));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette', 'data-glow'] });
    return () => { alive = false; clearTimeout(timer); if (idle && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle); ro.disconnect(); mo.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
