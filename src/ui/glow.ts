import { useLayoutEffect, type RefObject } from 'react';
import { grainTile } from '../lib/grain';
import { decode, picturesNow } from './glowCss';
import { render } from './glowPaint';

/**
 * Soft glows drawn as dithered pictures instead of CSS gradients (glowPaint.ts says why: on the phone a CSS gradient is
 * drawn in whole colour steps, so a dim glow showed as coloured rings). The picture is worked out at half the screen's pixel
 * size (the glows are soft, so the screen's own smoothing when it is shown at full size loses nothing) and written once
 * into a canvas. What to draw is read from the page's own CSS (glowCss.ts), so the picture is always exactly the gradient it
 * replaces.
 *
 * Pictures are painted ahead, in a worker, while the page is idle: the other tabs' fields (Glows.tsx prewarm) and every
 * glow on screen in the other theme (warmTwins, below), so a tab or theme switch only writes a finished picture into its
 * canvas. Where none is ready (the first frame after launch, a new palette, a new size) the page paints it at once with the
 * same code: the same picture, so nothing is swapped later. The canvas gets its size and picture in the same frame its
 * element first shows, so it is a layer from its first frame to its last, never added or dropped later. If the graphics
 * chip loses the canvas, the CSS shows until it is drawn again.
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
  job = withGrain(job);
  const imgs = [...job.srcs, ...(job.top ?? [])].flatMap((s) => (s.img ? [s.img.bm] : []));
  return new Promise((res) => { waiting.set(id, res); worker!.postMessage({ id, job }, imgs); });
}

/** the grain's tile goes along with a job that has grain in it (the worker and paintNow need it) */
function withGrain(job: GlowJob): GlowJob {
  const t = grainTile();
  return job.grain && t ? { ...job, grain: { ...job.grain, tile: t.a, n: t.n } } : job;
}

/**
 * The pictures painted lately, by what they show, so a window or a tab's colour field that comes back (or one painted ahead
 * while the page was idle) shows at once: as pixels (canvases) or as image files (glows drawn as a background image,
 * Glows.tsx). Kept in memory, not on the graphics chip; together they never pass 48 MB (the oldest go first), and all of it
 * is let go while the app is in the background (painted again ahead when it comes back).
 */
const kept = new Map<string, ImageData[]>();
/** image files by plan: their address and size (an address still shown on screen is never let go) */
const files = new Map<string, { url: string; bytes: number }>();
const shownUrls = new Map<string, number>();
const KEEP_BYTES = 48 << 20;
const sizeOf = (v: ImageData[]) => v.reduce((n, b) => n + b.width * b.height * 4, 0);
const keptBytes = () => {
  let bytes = 0;
  for (const v of bitmaps.values()) bytes += v.reduce((n, b) => n + b.width * b.height * 4, 0);
  for (const v of kept.values()) bytes += sizeOf(v);
  for (const f of files.values()) bytes += f.bytes;
  return bytes;
};
function trim(keepKey: string) {
  let bytes = keptBytes();
  // oldest first, pixels before files (files are small, and slow to make again)
  for (const [k, v] of kept) { if (bytes <= KEEP_BYTES) return; if (k === keepKey) continue; bytes -= sizeOf(v); kept.delete(k); }
  for (const [k, f] of files) {
    if (bytes <= KEEP_BYTES) return;
    if (k === keepKey || shownUrls.get(f.url)) continue;
    bytes -= f.bytes; URL.revokeObjectURL(f.url); files.delete(k);
  }
}
/**
 * A few pictures (the other tabs' colour fields) are kept ready to draw instead of as pixels: a tab switch draws its new
 * field's picture from one, which costs the tap far less than writing the pixels in (a quarter of the time on a slow
 * phone). Each is drawn once and let go (one kept and drawn again would keep a copy on the graphics chip); the worker paints
 * it again while idle for the next time. In the 48 MB.
 */
const bitmaps = new Map<string, ImageBitmap[]>();
export async function keepBitmaps(key: string) {
  const pics = recall(key, false);
  if (!pics || bitmaps.has(key) || typeof createImageBitmap !== 'function') return;
  const bms = await Promise.all(pics.map((d) => createImageBitmap(d))).catch(() => null);
  if (!bms) return;
  if (bitmaps.has(key) || document.visibilityState === 'hidden') { for (const b of bms) b.close(); return; }
  bitmaps.set(key, bms);
  kept.delete(key); // (the same picture: not kept twice)
  for (const [k, v] of bitmaps) { if (bitmaps.size <= 4) break; for (const b of v) b.close(); bitmaps.delete(k); }
}
function keep(key: string, pics: ImageData[]) { kept.delete(key); kept.set(key, pics); trim(key); }
/** the pictures kept for `key` (and, by default, marks them as just used) */
export const recall = (key: string, touch = true) => { const v = kept.get(key); if (v && touch) { kept.delete(key); kept.set(key, v); } return v; };
/** whether `key`'s picture is kept, as pixels or ready to draw */
export const isKept = (key: string) => kept.has(key) || bitmaps.has(key);
/** (stands in for pixels when the picture is kept ready to draw: `put` draws the bitmaps) */
const READY: ImageData[] = [];
/** an image file kept for `key` (marked as just used) */
export function recallFile(key: string): string | undefined {
  const f = files.get(key); if (!f) return undefined;
  files.delete(key); files.set(key, f); return f.url;
}
/** an image file is (no longer) shown somewhere: one that is shown is never let go */
export function fileShown(url: string, on: boolean) {
  const n = (shownUrls.get(url) ?? 0) + (on ? 1 : -1);
  if (n > 0) shownUrls.set(url, n); else shownUrls.delete(url);
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') { scheduleTwins(); return; }
  kept.clear();
  for (const v of bitmaps.values()) for (const b of v) b.close();
  bitmaps.clear();
  for (const [k, f] of files) if (!shownUrls.get(f.url)) { URL.revokeObjectURL(f.url); files.delete(k); }
});

/** What a canvas should show: the job, and what it needs that has to be fetched first (pictures, as `img.bm` = null until
 * then). `op`: the opacity its element is headed for (see Glows.tsx), so a picture for a fainter state waits for the fade */
export type GlowPlan = { jobs: GlowJob[]; key: string; load?: () => Promise<GlowJob[] | null>; op?: number };
/** a plan's key: the jobs as text, pictures by their address */
export const planKey = (jobs: GlowJob[], extra = '') => JSON.stringify(jobs, (k, v) => (k === 'bm' || k === 'tile' ? undefined : v)) + extra;

/** Paints a plan's pictures in the worker (once; later calls with the same key get the same pictures) */
const painting = new Map<string, Promise<ImageData[] | null>>();
export function paintPlan(plan: GlowPlan): Promise<ImageData[] | null> {
  const hit = recall(plan.key) ?? (bitmaps.has(plan.key) ? READY : undefined); if (hit) return Promise.resolve(hit);
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

/** Paints a plan's pictures here and now, with the worker's own code (null if it shows a picture that has to be fetched
 * first: then the worker paints it) */
let seedNow = 1 << 20;
export function paintNow(plan: GlowPlan): ImageData[] | null {
  if ((window as { __glowSim?: boolean }).__glowSim) return null;
  try {
    const imgs = plan.jobs.map((j) => {
      const srcs = [...j.srcs, ...(j.top ?? [])];
      if (!srcs.some((s) => s.img?.url)) return [];
      const px = picturesNow(srcs, j.w, j.h);
      // (not decoded yet: fetched now, painted by the worker)
      if (!px) for (const s of srcs) if (s.img?.url) void decode(s.img.url);
      return px;
    });
    if (imgs.some((x) => !x)) return null;
    const pics = plan.jobs.map((j, i) => render(withGrain(j), imgs[i]!, ++seedNow));
    keep(plan.key, pics);
    return pics;
  } catch { return null; }
}

/** Paints a plan's (one) picture as an image file, for a glow drawn as a background image: decoded before it is handed
 * over, so it shows from its first frame */
const filing = new Map<string, Promise<string | null>>();
export function paintFile(plan: GlowPlan): Promise<string | null> {
  const had = recallFile(plan.key); if (had) return Promise.resolve(had);
  let p = filing.get(plan.key);
  if (!p) {
    p = (async () => {
      const pics = await paintPlan(plan); if (!pics) return null;
      const c = new OffscreenCanvas(pics[0].width, pics[0].height), g = c.getContext('2d'); if (!g) return null;
      g.putImageData(pics[0], 0, 0);
      // (the pixels aren't needed again: the file is what is kept)
      kept.delete(plan.key);
      const blob = await c.convertToBlob({ type: 'image/png' }), url = URL.createObjectURL(blob);
      const im = new Image(); im.src = url; await im.decode().catch(() => {});
      files.set(plan.key, { url, bytes: blob.size + pics[0].width * pics[0].height * 4 });
      trim(plan.key);
      return url;
    })().catch(() => null).finally(() => filing.delete(plan.key));
    filing.set(plan.key, p);
  }
  return p;
}

// ── the other theme, painted ahead ──────────────────────────
/**
 * Each glow on screen describes itself once more, as it will look in the other theme, so its picture is painted ahead and a
 * theme switch finds it ready. That is read from a hidden copy of the page's styles (a frame with the other theme on its
 * root, holding a copy of just the glow and the elements around it) so nothing on the page itself changes or restyles.
 */
type Twin = { el: () => HTMLElement | null; whole: (el: HTMLElement) => HTMLElement; warm: (copy: HTMLElement, root: string) => void };

/**
 * What a glow's look depends on, read without making the page work anything out (no style or layout): the root's data
 * attributes (theme, palette, glow…), the glow's own attributes (less the marks this code sets, and what a motion writes)
 * and its last known size. A glow remembers its plan for each such state (the other theme's from the hidden frame), so a
 * theme switch only looks its plan up: reading the page's styles in the middle of a switch made the browser work the
 * whole page's styles out again for every glow (a tenth of a second each on a slow phone).
 */
export const rootKey = (root: Element = document.documentElement) =>
  [...root.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `${a.name}=${a.value}`).sort().join(' ');
export const hostKey = (el: Element) => [...el.attributes].filter((a) => !/^data-(dith|still|top)/.test(a.name))
  .map((a) => `${a.name}=${a.name === 'style' ? a.value.replace(/(^|;)\s*(--glow-img|opacity|transform|--gone)\s*:[^;]*/g, '') : a.value}`).join(' ');
/** a glow's plans by state (the newest dozen) */
export class Plans {
  constructor(private max = 12) {}
  private m = new Map<string, GlowPlan>();
  get(st: string) { const p = this.m.get(st); if (p) { this.m.delete(st); this.m.set(st, p); } return p; }
  set(st: string, p: GlowPlan) { this.m.delete(st); this.m.set(st, p); if (this.m.size > this.max) this.m.delete(this.m.keys().next().value!); }
}
/** (soon after: once the page is idle) */
export const whenIdle = (f: () => void, timeout = 1500) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout }) : window.setTimeout(f, 50));
export const unIdle = (id: number) => { if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id); clearTimeout(id); };
const twins = new Set<Twin>();
let twinTimer = 0;
export function addTwin(t: Twin) { twins.add(t); scheduleTwins(); return () => { twins.delete(t); }; }
/** (again, once the page has been quiet for a while) */
export function scheduleTwins(ms = 2500) {
  if (typeof window === 'undefined') return;
  clearTimeout(twinTimer);
  twinTimer = window.setTimeout(() => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => void warmTwins(), { timeout: 6000 }); else void warmTwins();
  }, ms);
}
let twinBusy = false;
/** (checks: how canvases got their pictures, and the frames of the other theme painted ahead) */
export const stats = { hit: 0, now: 0, later: 0, twins: 0, twinMs: 0, fileHit: 0, fileMiss: 0, get keptMB() { return +(keptBytes() / 1048576).toFixed(1); } };
if (typeof window !== 'undefined') (window as { __glowStats?: typeof stats }).__glowStats = stats;
/** the hidden frame (kept while the app is open: reading the page's styles into a new one takes a while; let go in the
 * background) and what it was made from */
let twinFrame: { f: HTMLIFrameElement; css: string; w: number; h: number; ready: Promise<Document | null> } | null = null;
function twinDoc(): Promise<Document | null> {
  const css = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join('');
  if (twinFrame && twinFrame.f.isConnected && twinFrame.css === css && twinFrame.w === innerWidth && twinFrame.h === innerHeight) return twinFrame.ready;
  twinFrame?.f.remove();
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
  f.style.cssText = `position:fixed;left:0;top:0;width:${innerWidth}px;height:${innerHeight}px;border:0;visibility:hidden;pointer-events:none;z-index:-2147483647;contain:strict`;
  // (nothing in the copy moves: a paused animation still shows its name, which some glows read)
  f.srcdoc = `<!doctype html><html><head><base href="${location.href}">${css}<style>*,*::before,*::after{animation-play-state:paused!important;transition:none!important}</style></head><body></body></html>`;
  const ready = new Promise<Document | null>((res) => { f.onload = () => res(f.contentDocument); f.onerror = () => res(null); });
  document.body.appendChild(f);
  twinFrame = { f, css, w: innerWidth, h: innerHeight, ready };
  return ready;
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { twinFrame?.f.remove(); twinFrame = null; } });
async function warmTwins() {
  if (twinBusy || document.visibilityState === 'hidden' || !twins.size) return;
  twinBusy = true;
  try {
    const doc = await twinDoc();
    // (the page may have changed while the frame loaded: what it was asked for is read now)
    const root = document.documentElement, other = root.dataset.theme === 'light' ? 'dark' : 'light';
    if (!doc) return;
    const t0 = performance.now();
    const dr = doc.documentElement;
    for (const a of [...dr.attributes]) dr.removeAttribute(a.name);
    for (const a of [...root.attributes]) dr.setAttribute(a.name, a.value);
    dr.setAttribute('data-theme', other);
    for (const a of [...doc.body.attributes]) doc.body.removeAttribute(a.name);
    for (const a of [...document.body.attributes]) doc.body.setAttribute(a.name, a.value);
    const rk = rootKey(dr);
    for (const t of twins) {
      const el = t.el(); if (!el?.isConnected) continue;
      const copy = mirror(el, t.whole(el), doc); if (!copy) continue;
      try { t.warm(copy.el, rk); stats.twins++; } catch { /* that one isn't painted ahead */ } finally { copy.drop(); }
    }
    stats.twinMs += performance.now() - t0;
  } finally { twinBusy = false; }
}
/** `el` copied into `doc`: `whole` (el or one of its parents) with all inside it, at its own size, inside plain copies of
 * the elements around it (their classes, attributes and own styles, which the glow's colours come from) */
function mirror(el: HTMLElement, whole: HTMLElement, doc: Document): { el: HTMLElement; drop: () => void } | null {
  const path: number[] = [];
  for (let e: HTMLElement = el; e !== whole; e = e.parentElement!) { if (!e.parentElement) return null; path.unshift([...e.parentElement.children].indexOf(e)); }
  const chain: HTMLElement[] = [];
  for (let e = whole.parentElement; e && e !== document.body; e = e.parentElement) chain.unshift(e);
  let at: Element = doc.body, top: Element | null = null;
  for (const a of chain) { const c = doc.importNode(a, false); at.appendChild(c); at = c; top ??= c; }
  const copy = doc.importNode(whole, true) as HTMLElement;
  copy.style.boxSizing = 'border-box'; copy.style.width = `${whole.offsetWidth}px`; copy.style.height = `${whole.offsetHeight}px`;
  at.appendChild(copy); top ??= copy;
  let e: Element = copy;
  for (const i of path) e = e.children[i];
  const t = top;
  return { el: e as HTMLElement, drop: () => t.remove() };
}

/** A colour as the page works it out (through a probe inside `host`, so it gets the variables that apply there). The probe
 * is put in once and stays (hidden, an element no style rule matches): putting one in and taking it out for every colour
 * made the browser work out the page's styles again each time */
const probes = new WeakMap<Element, HTMLElement>();
export function cssColor(host: Element, expr: string): [number, number, number] {
  let d = probes.get(host);
  if (!d || d.parentNode !== host) {
    d = host.ownerDocument.createElement('glow-probe');
    d.style.display = 'none';
    host.appendChild(d); probes.set(host, d);
  }
  d.style.color = expr;
  const s = getComputedStyle(d).color;
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
 * calls `shown(true)` once all of them hold their picture (`shown(false)` if the graphics chip loses them). Draws in the same
 * frame as a mount, a theme, palette or glow change and a size change: the picture painted ahead if there is one, else
 * painted at once. `whole`: what to copy along with the host to describe it in the other theme (its parent, if the
 * description reads the elements around it).
 */
/** plans shared by glows that come and go (a tab's colour field is a new element on each switch), by `share`'s state */
const sharedPlans = new Plans(32);
export const sharedPlan = (st: string) => sharedPlans.get(st);
export const setSharedPlan = (st: string, p: GlowPlan) => sharedPlans.set(st, p);
/** what a field's look depends on, read without any style or layout: what it is (`id`), what is in it (its elements'
 * attributes, less the canvases and colour probes), the root's data attributes and its size */
export const shareKey = (el: HTMLElement, id: string, rk = rootKey(), size = `${el.clientWidth}x${el.clientHeight}`) =>
  `${id}§${[...el.querySelectorAll('*')].filter((e) => e.localName !== 'canvas' && e.localName !== 'glow-probe').map(hostKey).join('|')}§${rk}§${size}`;

/** `share`: what this glow is, for glows that come and go (their plans are kept for the next one, see shareKey) */
export function useGlowCanvases(host: () => HTMLElement | null, refs: RefObject<HTMLCanvasElement | null>[], describe: (host: HTMLElement) => GlowPlan | null, shown: (on: boolean) => void, whole: (el: HTMLElement) => HTMLElement = (e) => e, share?: (el: HTMLElement) => string) {
  useLayoutEffect(() => {
    const el = host();
    if (!el || !glowCanvasOk()) return;
    let alive = true, lost = false;
    /** what the canvases hold, and what they should */
    let real = '', want = '';
    const drawn = new Set<HTMLCanvasElement>();
    /** Writes a picture's pixels into its canvas (straight in: no copy of it is kept on the graphics chip for drawing). Each
     * new picture starts the canvas afresh (its size set anew), so the buffer of the picture before is let go, not kept to
     * draw into next time: one copy of the picture on the graphics chip, as the CSS had */
    const put = (plan: GlowPlan, pics: ImageData[]): boolean => {
      // (the pictures for the other theme are made ready to draw ahead: a theme switch only hands them over, which costs the
      // page next to nothing; each is drawn once and let go, so the chip keeps no copy of it)
      const own = ready?.key === plan.key ? ready.bms : null, bms = own ?? bitmaps.get(plan.key) ?? null;
      if (!bms && plan.jobs.some((_, i) => !pics[i])) return false; // (its bitmaps were drawn meanwhile: painted again, see now)
      if (!own) bitmaps.delete(plan.key);
      plan.jobs.forEach((job, i) => {
        const cv = refs[i]?.current; if (!cv) return;
        cv.width = 1; cv.width = job.w; cv.height = job.h;
        const g = cv.getContext('2d', { alpha: !job.base }) as CanvasRenderingContext2D | null; if (!g) return;
        if (bms?.[i]) g.drawImage(bms[i], 0, 0); else g.putImageData(pics[i], 0, 0);
        drawn.add(cv);
      });
      if (bms) for (const b of bms) b.close();
      if (own) ready = null;
      const left = real;
      real = plan.key;
      shown(true);
      // (and the one just left is made ready, for a switch back)
      if (left && left !== real) { const k = left; whenIdle(() => void prep(k), 3000); }
      return true;
    };
    /** the pictures of `key` made ready to draw (one set at a time) */
    let ready: { key: string; bms: ImageBitmap[] } | null = null;
    const prep = async (key: string) => {
      const pics = recall(key, false);
      if (!alive || !pics || ready?.key === key || key === real) return;
      const bms = await Promise.all(pics.map((d) => createImageBitmap(d))).catch(() => null);
      if (!bms) return;
      if (!alive || key === real) { for (const b of bms) b.close(); return; }
      if (ready) for (const b of ready.bms) b.close();
      ready = { key, bms };
    };
    const plan = (on: HTMLElement) => { try { return describe(on); } catch { return null; } };
    const plans = new Plans();
    let size = `${el.clientWidth}x${el.clientHeight}`, verify = 0, defer = 0, late = 0, onScreen = true;
    const io = new IntersectionObserver((es) => { onScreen = es[es.length - 1].isIntersecting; if (onScreen && want !== real) now(false); });
    io.observe(el);
    const state = (rk = rootKey()) => `${rk}§${hostKey(el)}§${size}`;
    const shared = (rk?: string) => (share ? shareKey(el, share(el), rk, size) : '');
    /** `known`: a theme (or palette…) change: the plan for the new state is looked up (painted ahead), and checked against
     * the page once it is idle. A glow that comes and goes looks its plan up when it comes, too (checked a little later,
     * once the switch that brought it has played). `read`: read from the page */
    const now = (known: boolean, read = false) => {
      if (!alive || lost) return;
      const st = state(), sk = shared();
      let p = read ? undefined : known ? plans.get(st) : sk ? sharedPlans.get(sk) : undefined;
      if (p) {
        unIdle(verify); clearTimeout(late);
        if (known) verify = whenIdle(() => now(false, true));
        else late = window.setTimeout(() => { verify = whenIdle(() => now(false, true)); }, 3000);
      } else { p = plan(el) ?? undefined; if (p) { plans.set(st, p); if (sk) sharedPlans.set(sk, p); } }
      if (!p || p.jobs.some((j) => j.w < 2 || j.h < 2)) return;
      want = p.key;
      if (p.key === real) return;
      // (not on screen, e.g. a minimised workout window: written once the page is idle, or as soon as it shows)
      if (known && !onScreen) { unIdle(defer); defer = whenIdle(() => now(false)); return; }
      const hit = recall(p.key) ?? (bitmaps.has(p.key) ? READY : undefined), pics = hit ?? paintNow(p);
      stats[hit ? 'hit' : pics ? 'now' : 'later']++;
      if (pics && put(p, pics)) return;
      // (a picture it shows isn't fetched yet: the CSS shows, not the picture before, until the worker has painted it)
      if (real && !pics) { real = ''; shown(false); }
      const q = p;
      void paintPlan(q).then((got) => { if (alive && !lost && got && want === q.key) put(q, got); });
    };
    now(false);
    const ro = new ResizeObserver(() => { const s2 = `${el.clientWidth}x${el.clientHeight}`; if (s2 !== size) { size = s2; now(false); scheduleTwins(); } }); ro.observe(el);
    // (a microtask after the change, before the next frame: a theme switch's snapshot already holds the new picture)
    const mo = new MutationObserver(() => { now(true); scheduleTwins(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette', 'data-glow', 'data-motion'] });
    const untwin = addTwin({ el: host, whole, warm: (copy, rk) => {
      const p = plan(copy); if (!p) return;
      plans.set(state(rk), p);
      if (share) sharedPlans.set(shared(rk), p);
      void paintPlan(p).then((got) => { if (got) void prep(p.key); });
    } });
    // the graphics chip lost the canvas (a GPU reset): the CSS shows until it is back, then it is drawn again
    const onLost = () => { lost = true; real = ''; shown(false); }; // (not cancelled: that would stop the restore)
    const onBack = () => { lost = false; real = ''; now(false); };
    const check = () => { if (!document.hidden && [...drawn].some((c) => (c.getContext('2d') as CanvasRenderingContext2D | null)?.isContextLost?.())) onLost(); };
    const cvs = refs.map((r) => r.current).filter((c): c is HTMLCanvasElement => !!c);
    for (const c of cvs) { c.addEventListener('contextlost', onLost); c.addEventListener('contextrestored', onBack); }
    document.addEventListener('visibilitychange', check);
    return () => {
      alive = false; ro.disconnect(); mo.disconnect(); io.disconnect(); untwin(); unIdle(verify); unIdle(defer); clearTimeout(late);
      if (ready) for (const b of ready.bms) b.close();
      for (const c of cvs) { c.removeEventListener('contextlost', onLost); c.removeEventListener('contextrestored', onBack); }
      document.removeEventListener('visibilitychange', check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
