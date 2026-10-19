import { useLayoutEffect, type RefObject } from 'react';
import { grainTile } from '../lib/grain';

/**
 * Soft glows drawn as dithered pictures instead of CSS gradients (glowPaint.ts says why: on the phone a CSS gradient is
 * drawn in whole colour steps, so a dim glow showed as coloured rings). The picture is worked out at half the screen's pixel
 * size (the glows are soft, so the screen's own smoothing when it is shown at full size loses nothing) and written once
 * into a canvas. What to draw is read from the page's own CSS (glowCss.ts), so the picture is always exactly the gradient it
 * replaces.
 *
 * Pictures are painted ahead, in a worker, while the page is idle: the other tabs' fields (Glows.tsx prewarm) and every
 * glow on screen in the other theme (warmTwins, below), so a tab or theme switch only writes a finished picture into its
 * canvas. Where none is ready (the first moments after launch, a new palette, a new size) the worker paints it before
 * anything else it has to do: never painted on the page (a whole field painted there froze it for up to a second). Until
 * then the CSS shows, and a tab's field's picture fades in over it. The
 * canvas gets its size in the same frame its element first shows, so it is a layer from its first frame to its last, never
 * added or dropped later. If the graphics chip loses the canvas, or the worker can't paint, the CSS shows instead.
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
type Reply = { id: number; px?: ImageData | null; blob?: Blob | null };
const waiting = new Map<number, (r: Reply) => void>();
/** How soon a job is wanted: `now` set (also later, while it waits) for a picture a field on screen is waiting for */
type Haste = { now: boolean };
/** The worker's jobs, handed over one at a time, so a picture a field on screen waits for goes before the ones painted on
 * the chance they're needed (the other theme, the other tabs, the glows drawn as image files): queued behind those, a tab
 * tapped right after launch waited 1.3 s for its picture */
const queue: { id: number; msg: unknown; send: Transferable[]; haste: Haste }[] = [];
let busy = 0;
function pump() {
  if (busy || !queue.length || !worker) return;
  const i = Math.max(0, queue.findIndex((q) => q.haste.now));
  const [q] = queue.splice(i, 1);
  busy = q.id; worker.postMessage(q.msg, q.send);
}
function post(id: number, msg: unknown, send: Transferable[], haste: Haste, done: (r: Reply) => void) {
  waiting.set(id, done); queue.push({ id, msg, send, haste }); pump();
}

export const glowCanvasOk = () => !broken && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';

function glowWorker(): Worker | null {
  if (!worker && !broken) {
    try {
      worker = new Worker(new URL('./glow.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<Reply>) => { if (e.data.id === busy) busy = 0; waiting.get(e.data.id)?.(e.data); waiting.delete(e.data.id); pump(); };
      worker.onerror = () => { broken = true; queue.length = 0; busy = 0; for (const [id, f] of waiting) f({ id }); waiting.clear(); };
    } catch { broken = true; }
  }
  return worker;
}

function paint(job: GlowJob, haste: Haste = { now: false }): Promise<ImageData | null> {
  const w = glowWorker(); if (!w) return Promise.resolve(null);
  const id = ++seq;
  // (checks only: window.__glowSim draws the pictures without the dither, as the phone drew the CSS)
  if ((window as { __glowSim?: boolean }).__glowSim) job = { ...job, sim: true };
  job = withGrain(job);
  const imgs = [...job.srcs, ...(job.top ?? [])].flatMap((s) => (s.img ? [s.img.bm] : []));
  return new Promise((res) => post(id, { id, job }, imgs, haste, (r) => res(r.px ?? null)));
}

/** A picture as a PNG file, made in a worker of its own (made on the page, the dock's shadow and the glows drawn as
 * background images held the page up for 0.6-1.3 s after launch; made in the painting worker, one took it 1.3 s, and a
 * field waiting for its picture waited for that too). Its pixels go to the worker: `d` can't be used after */
let pngWorker: Worker | null = null;
export function encodePng(d: ImageData): Promise<Blob | null> {
  if (!glowWorker()) return Promise.resolve(null);
  try {
    if (!pngWorker) {
      pngWorker = new Worker(new URL('./glow.worker.ts', import.meta.url), { type: 'module' });
      pngWorker.onmessage = (e: MessageEvent<Reply>) => { waiting.get(e.data.id)?.(e.data); waiting.delete(e.data.id); };
      pngWorker.onerror = () => { pngWorker = null; };
    }
  } catch { return Promise.resolve(null); }
  const id = ++seq, w = pngWorker;
  return new Promise((res) => { waiting.set(id, (r) => res(r.blob ?? null)); w.postMessage({ id, png: d }, [d.data.buffer]); });
}

/** the grain's tile goes along with a job that has grain in it (the worker needs it) */
function withGrain(job: GlowJob): GlowJob {
  const t = grainTile();
  return job.grain && t ? { ...job, grain: { ...job.grain, tile: t.a, n: t.n } } : job;
}

/**
 * The pictures painted lately, by what they show, so a window or a tab's colour field that comes back (or one painted ahead
 * while the page was idle) shows at once: as pixels (canvases) or as image files (glows drawn as a background image,
 * Glows.tsx). Kept in memory, not on the graphics chip; together they never pass 64 MB (the oldest go first), and all but
 * the pictures in a canvas now and the other tabs' fields are let go while the app is in the background (the rest painted
 * again ahead when it comes back).
 */
const kept = new Map<string, ImageData[]>();
/** image files by plan: their address and size (an address still shown on screen is never let go) */
const files = new Map<string, { url: string; bytes: number }>();
const shownUrls = new Map<string, number>();
/** a waiting field's picture fading in over its CSS (styles.css .glow-field transition) */
const FADE_MS = 1200;
const KEEP_BYTES = 64 << 20; // (Sunrise's on-screen glows and both themes take ~42 MB: at 48 the other tabs' fields were let go)
const sizeOf = (v: ImageData[]) => v.reduce((n, b) => n + b.width * b.height * 4, 0);
const keptBytes = () => {
  let bytes = 0;
  for (const v of kept.values()) bytes += sizeOf(v);
  for (const f of files.values()) bytes += f.bytes;
  return bytes;
};
/** pictures painted on the chance they're needed (the other tabs' fields), not yet shown: let go before the rest, so the
 * pictures of the glows on the page, in both themes, stay (one let go made a switch back paint on the page: half a second
 * on a slow phone) */
const ahead = new Set<string>();
function trim(keepKey: string) {
  let bytes = keptBytes();
  // oldest first, those painted ahead first, pixels before files (files are small, and slow to make again)
  for (const [k, v] of kept) { if (bytes <= KEEP_BYTES) return; if (k === keepKey || !ahead.has(k)) continue; bytes -= sizeOf(v); kept.delete(k); ahead.delete(k); }
  for (const [k, v] of kept) { if (bytes <= KEEP_BYTES) return; if (k === keepKey) continue; bytes -= sizeOf(v); kept.delete(k); ahead.delete(k); }
  for (const [k, f] of files) {
    if (bytes <= KEEP_BYTES) return;
    if (k === keepKey || shownUrls.get(f.url)) continue;
    bytes -= f.bytes; URL.revokeObjectURL(f.url); files.delete(k);
  }
}
function keep(key: string, pics: ImageData[], maybe = false) { kept.delete(key); kept.set(key, pics); if (maybe) ahead.add(key); else ahead.delete(key); trim(key); }
/** the pictures kept for `key` (and, by default, marks them as just used) */
export const recall = (key: string, touch = true) => { const v = kept.get(key); if (v && touch) { kept.delete(key); kept.set(key, v); ahead.delete(key); } return v; };
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
/** the pictures in a canvas now: kept while the app is in the background, so it comes back without a canvas waiting */
const inUse = new Map<string, number>();
const useKey = (k: string, d: number) => { if (!k) return; const n = (inUse.get(k) ?? 0) + d; if (n > 0) inUse.set(k, n); else inUse.delete(k); };
/** the other tabs' fields painted ahead for the field on screen (Glows.tsx prewarm): kept too, so a tab tapped right after
 * coming back finds its picture ready (about 14 MB) */
const held = new Set<string>();
export function holdForReturn(keys: string[]) { held.clear(); for (const k of keys) held.add(k); }
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') { scheduleTwins(); return; }
  for (const k of [...kept.keys()]) if (!inUse.has(k) && !held.has(k)) { kept.delete(k); ahead.delete(k); }
  for (const [k, f] of files) if (!shownUrls.get(f.url)) { URL.revokeObjectURL(f.url); files.delete(k); }
});

/** What a canvas should show: the job, and what it needs that has to be fetched first (pictures, as `img.bm` = null until
 * then). `op`: the opacity its element is headed for (see Glows.tsx), so a picture for a fainter state waits for the fade */
export type GlowPlan = { jobs: GlowJob[]; key: string; load?: () => Promise<GlowJob[] | null>; op?: number };
/** a plan's key: the jobs as text, pictures by their address */
export const planKey = (jobs: GlowJob[], extra = '') => JSON.stringify(jobs, (k, v) => (k === 'bm' || k === 'tile' ? undefined : v)) + extra;

/** Paints a plan's pictures in the worker (once; later calls with the same key get the same pictures) */
const painting = new Map<string, Promise<ImageData[] | null>>();
const hastes = new Map<string, Haste>();
/** `maybe`: painted on the chance it's needed (see `ahead`); `now`: a glow on screen is waiting for it (painted first, even
 * if it was already waiting its turn) */
export function paintPlan(plan: GlowPlan, maybe = false, now = false): Promise<ImageData[] | null> {
  const hit = recall(plan.key, !maybe); if (hit) return Promise.resolve(hit);
  let p = painting.get(plan.key);
  if (p) { if (now) hastes.get(plan.key)!.now = true; return p; }
  {
    const haste: Haste = { now };
    hastes.set(plan.key, haste);
    p = (async () => {
      const jobs = plan.load ? await plan.load() : plan.jobs;
      if (!jobs) return null;
      const pics = await Promise.all(jobs.map((j) => paint(j, haste)));
      if (pics.some((b) => !b)) return null;
      keep(plan.key, pics as ImageData[], maybe);
      return pics as ImageData[];
    })().catch(() => null).finally(() => { painting.delete(plan.key); hastes.delete(plan.key); });
    painting.set(plan.key, p);
  }
  return p;
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
      // (the pixels aren't needed again: the file is what is kept)
      kept.delete(plan.key);
      const { width, height } = pics[0];
      const blob = await encodePng(pics[0]); if (!blob) return null;
      const url = URL.createObjectURL(blob);
      const im = new Image(); im.src = url; await im.decode().catch(() => {});
      files.set(plan.key, { url, bytes: blob.size + width * height * 4 });
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
  .map((a) => `${a.name}=${a.name === 'style' ? a.value.split(';').map((d) => d.trim()).filter((d) => d && !/^(--glow-img|opacity|transform|--gone)\s*:/.test(d)).join(';') : a.value}`).filter((t) => t !== 'style=').join(' ');
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
export function useGlowCanvases(host: () => HTMLElement | null, refs: RefObject<HTMLCanvasElement | null>[], describe: (host: HTMLElement) => GlowPlan | null, shown: (on: boolean, wait?: boolean) => void, whole: (el: HTMLElement) => HTMLElement = (e) => e, share?: (el: HTMLElement) => string) {
  useLayoutEffect(() => {
    const el = host();
    if (!el || !glowCanvasOk()) return;
    let alive = true, lost = false;
    /** what the canvases hold, and what they should */
    let real = '', want = '';
    const show = (k: string) => { useKey(real, -1); real = k; useKey(real, 1); };
    const drawn = new Set<HTMLCanvasElement>();
    /** Writes a picture's pixels into its canvas (straight in: no copy of it is kept on the graphics chip for drawing). Each
     * new picture starts the canvas afresh (its size set anew), so the buffer of the picture before is let go, not kept to
     * draw into next time: one copy of the picture on the graphics chip, as the CSS had */
    const put = (plan: GlowPlan, pics: ImageData[]) => {
      const sp = spare?.key === plan.key ? spare : null;
      plan.jobs.forEach((job, i) => {
        const cv = refs[i]?.current; if (!cv) return;
        cv.width = 1; cv.width = job.w; cv.height = job.h;
        const g = cv.getContext('2d', { alpha: !job.base }) as CanvasRenderingContext2D | null; if (!g) return;
        if (sp?.cvs[i]) g.drawImage(sp.cvs[i], 0, 0); else g.putImageData(pics[i], 0, 0);
        drawn.add(cv);
      });
      const left = real; pending = '';
      show(plan.key);
      // (a tab's field that was waiting: its picture fades in over its CSS, which goes once the picture covers it)
      clearTimeout(fading);
      if (el.hasAttribute('data-wait') && refs[0]?.current?.classList.contains('glow-field')) {
        el.removeAttribute('data-wait'); el.setAttribute('data-fade', '');
        const k = plan.key;
        fading = window.setTimeout(() => { if (alive && real === k) { el.removeAttribute('data-fade'); shown(true); } }, FADE_MS + 50);
      } else { el.removeAttribute('data-wait'); el.removeAttribute('data-fade'); shown(true); }
      // (the picture just left is written into the spare, for a switch back)
      if (left && left !== real) { const k = left; unIdle(prepping); prepping = whenIdle(() => prep(k), 3000); }
    };
    /**
     * The theme just left, written ahead into a spare canvas of the same size off the page, so a switch back only copies it
     * across on the graphics chip (writing the pixels in took the switch 10-20 ms on a slow phone). One spare per glow, made
     * once and written again each time (bitmaps made ready instead left a copy of each on the chip: +20 MB after a few tab
     * switches); let go in the background.
     */
    let spare: { key: string; cvs: OffscreenCanvas[] } | null = null, prepping = 0;
    const prep = (key: string) => {
      const pics = recall(key, false);
      if (!alive || lost || !pics || key === real || spare?.key === key || typeof OffscreenCanvas === 'undefined') return;
      try {
        const cvs = pics.map((d, i) => {
          const c = spare?.cvs[i] ?? new OffscreenCanvas(d.width, d.height);
          c.width = d.width; c.height = d.height;
          c.getContext('2d')!.putImageData(d, 0, 0);
          return c;
        });
        spare = { key, cvs };
      } catch { spare = null; }
    };
    const dropSpare = () => { if (spare) for (const c of spare.cvs) { c.width = 0; c.height = 0; } spare = null; };
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
    let softly = false, stuck = 0, pending = '', fading = 0;
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
      const pics = recall(p.key);
      stats[pics ? 'hit' : 'later']++;
      if (pics) { put(p, pics); return; }
      // (not painted ahead, e.g. a tab tapped right after launch: painted by the worker before anything else it has to do.
      // Never painted here: a whole field painted on the page froze it for 0.5-1.3 s)
      // (the canvas is there all the same, sized and see-through: its layer is there from the glow's first frame to its
      // last, as when the picture is ready, never added part-way through a launch or a tab's cross-fade. A tab's field shows
      // its CSS meanwhile, under the canvas, and the picture fades in over it when it comes (styles.css [data-wait],
      // [data-fade]): never dark first, and nothing lies over the canvas that would need a layer of its own. After a change
      // of palette, glow or motion the picture before fades out instead of going at once ('soft'); after a theme change it
      // goes at once, so the switch's snapshot never holds the old theme)
      if (pending === p.key) return; // (already waiting for it: the same commit asked again)
      const soft = softly && !!real && p.jobs.every((job, i) => refs[i]?.current?.width === job.w && refs[i]?.current?.height === job.h);
      show(''); shown(false, true);
      if (!soft) p.jobs.forEach((job, i) => {
        const cv = refs[i]?.current; if (!cv) return;
        if (cv.width !== job.w || cv.height !== job.h) { cv.width = job.w; cv.height = job.h; }
        const g = cv.getContext('2d', { alpha: !job.base }) as CanvasRenderingContext2D | null; if (!g) return;
        if (job.base) { g.fillStyle = `rgb(${job.base.join(' ')})`; g.fillRect(0, 0, job.w, job.h); } else g.clearRect(0, 0, job.w, job.h);
      });
      clearTimeout(fading); el.removeAttribute('data-fade'); el.setAttribute('data-wait', soft ? 'soft' : '');
      const q = p; pending = q.key;
      // (if the worker can't paint it, the CSS after all)
      const fail = () => { if (pending === q.key) pending = ''; if (alive && !lost && want === q.key && !real && el.hasAttribute('data-wait')) { el.removeAttribute('data-wait'); shown(false); } };
      clearTimeout(stuck); stuck = window.setTimeout(fail, 6000);
      void paintPlan(q, false, true).then((got) => { if (alive && !lost && got && want === q.key) { clearTimeout(stuck); put(q, got); } else if (!got) fail(); });
    };
    // (first once the page's root has its theme, palette… for this commit: they are set after the glows mount, and a
    // picture painted for the state before was thrown away, 0.4 s of the worker's time right at launch)
    queueMicrotask(() => now(false));
    const ro = new ResizeObserver(() => { const s2 = `${el.clientWidth}x${el.clientHeight}`; if (s2 !== size) { size = s2; now(false); scheduleTwins(); } }); ro.observe(el);
    // (a microtask after the change, before the next frame: a theme switch's snapshot already holds the new picture)
    const mo = new MutationObserver((recs) => { softly = recs.every((r) => r.attributeName !== 'data-theme'); now(true); softly = false; scheduleTwins(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette', 'data-glow', 'data-motion'] });
    const untwin = addTwin({ el: host, whole, warm: (copy, rk) => {
      const p = plan(copy); if (!p) return;
      plans.set(state(rk), p);
      if (share) sharedPlans.set(shared(rk), p);
      void paintPlan(p).then((got) => { if (got && onScreen) { unIdle(prepping); prepping = whenIdle(() => prep(p.key), 3000); } });
    } });
    // the graphics chip lost the canvas (a GPU reset): the CSS shows until it is back, then it is drawn again
    const onLost = () => { lost = true; pending = ''; clearTimeout(fading); show(''); shown(false); dropSpare(); el.removeAttribute('data-wait'); el.removeAttribute('data-fade'); }; // (not cancelled: that would stop the restore)
    const onBack = () => { lost = false; pending = ''; show(''); now(false); };
    const check = () => { if (document.hidden) dropSpare(); if (!document.hidden && [...drawn].some((c) => (c.getContext('2d') as CanvasRenderingContext2D | null)?.isContextLost?.())) onLost(); };
    const cvs = refs.map((r) => r.current).filter((c): c is HTMLCanvasElement => !!c);
    for (const c of cvs) { c.addEventListener('contextlost', onLost); c.addEventListener('contextrestored', onBack); }
    document.addEventListener('visibilitychange', check);
    return () => {
      alive = false; show(''); ro.disconnect(); mo.disconnect(); io.disconnect(); untwin(); unIdle(verify); unIdle(defer); clearTimeout(late); unIdle(prepping); dropSpare(); clearTimeout(stuck); clearTimeout(fading);
      for (const c of cvs) { c.removeEventListener('contextlost', onLost); c.removeEventListener('contextrestored', onBack); }
      document.removeEventListener('visibilitychange', check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
