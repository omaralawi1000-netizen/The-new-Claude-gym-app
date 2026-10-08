import { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cancelFrame, frame } from 'motion/react';
import { OverlayMeta, mirrorProgress, useEngageContext, type Engage } from './engage';
import { mic } from '../lib/mic';
import { useVoice } from '../state/voice';
import { speakingLevel } from '../lib/voiceOut';
import { useStore } from '../state/store';
import { useUI, buzz } from '../state/ui';
import { kb } from './keyboard';
import { highRefresh, onHighRefresh, springCurve } from './motion';

/**
 * The Aven sphere: ~900 points on a Fibonacci lattice, lit from upper-left so it reads as a volume.
 * One canvas, one draw loop. The stage element sits in the lowest registered "slot" (the tab bar) blended towards
 * every popup slot by that popup's progress, so the same sphere is the tab-bar button, the Coach's microphone, the
 * voice composer's hero and the review header, and it moves exactly in step with the popup that carries it.
 */

import { SphereRenderer, type OrbInputs, type SphereColors } from './sphereRender';

type RGB = [number, number, number];

/**
 * Touching the orb. While a finger is on it the whole sphere sinks in a touch and its light gathers; on release it springs
 * back, a flash of light runs through it, it spins up and two thin rings leave it. It never changes shape: only light moves.
 */
let pressTarget = 0;
let tapPending = 0;
let whooshPending = 0;
let ignitePending = 0;
/** Arriving on the orb screen: a heartbeat that quickens as the spiral of light climbs, ending in a soft thump. */
const IGNITE_BUZZ = [4, 135, 5, 112, 6, 92, 7, 76, 9, 60, 11, 46, 14, 34, 30]; // the thump lands at ~0.61 s, as the spiral tops out
let lastOnsetBuzz = 0;
/** A syllable lit a ring of light on the orb: a tiny tick with it (never more than one every 160 ms). */
function onsetBuzz(s: number) {
  const now = performance.now();
  if (now - lastOnsetBuzz < 160 || s < 0.25 || !useStore.getState().settings.haptics) return;
  lastOnsetBuzz = now; buzz(Math.round(4 + s * 6));
}
export function orbPress(down: boolean) { pressTarget = down ? 1 : 0; }
export function orbTap(strength = 1) { tapPending = Math.max(tapPending, strength); pressTarget = 0; }

/** What the orb's drawing loop is doing, for the frame-rate readout. */
export const orbStats = { fps: 0, offThread: false };
let workerBroken = false;
const transferred = new WeakSet<HTMLCanvasElement>();

/** The app's state the renderer needs this frame (read once per app frame; the tap is handed over once). */
function orbInputs(): OrbInputs {
  const v = useVoice.getState();
  const live = v.phase === 'listening' && mic.active;
  const tap = tapPending; tapPending = 0;
  const whoosh = whooshPending; whooshPending = 0;
  const ignite = ignitePending; ignitePending = 0;
  return { phase: v.phase, phaseAge: (performance.now() - v.since) / 1000, live, raw: live ? mic.voice() : 0, bands: live ? mic.bands() : null, press: pressTarget, tap, whoosh, ignite, voiceOut: speakingLevel() };
}

// ── stage ───────────────────────────────────────────────────

/** `ov`: the pop-up the slot lives in (none for the tab bar). A slot whose pop-up has been closed is on its way out. */
interface Slot { id: string; el: HTMLElement; priority: number; engage?: Engage; ov?: string }
const slots = new Map<string, Slot>();
/** Geometry changes invalidate anchors; animation transforms are applied separately. */
let layoutRevision = 0;
export const markOrbLayoutDirty = () => { layoutRevision++; };
/**
 * The tab bar's orb glides with the dock: when the dock re-arranges, the next frame slides the orb from where it is drawn
 * to its new place on the dock's spring as a browser animation (compositor-drawn, full refresh rate), instead of jumping
 * or following at the script's frame rate.
 */
let glideReq: { easing: string; duration: number } | null = null;
export function orbGlide(sp: { stiffness: number; damping: number; mass?: number }) { glideReq = springCurve(sp); markOrbLayoutDirty(); }
let orbEl: HTMLElement | null = null;
let dockRest: { X: number; Y: number; S: number } | null = null;
const orbLock = { bucket: 0 };
let orbAnim: Animation | null = null;
const PICK = 30; // px: how softly the dock hands the orb over to a rising slot (a soft minimum, so its speed never jumps)
const smooth01 = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const softmin = (a: number, b: number, k: number) => { const m = Math.min(a, b); return m - k * Math.log(Math.exp(-(a - m) / k) + Math.exp(-(b - m) / k)); };
/**
 * Where the orb is when a popup's slot is at (x, y) and comes to rest at restY, starting from O (the dock).
 * The slot rises past the dock (the live workout): the orb waits in the dock, is lifted out as the slot reaches it, then rides
 * with the slot exactly — while opening, while closing, under your finger — moving across and growing as it goes, so it is
 * never anywhere but on its button or in the dock. A slot resting about level with the dock (the Coach's mic) just glides
 * across on the popup's progress. `t` = how far it has travelled (0 dock … 1 slot).
 */
function carry(O: { X: number; Y: number; S: number }, x: number, y: number, z: number, restY: number, e: number, slides = true) {
  const D = O.Y - restY;
  // a popup that doesn't slide (the orb screen), or a slot about level with the dock: a straight glide on the popup's progress
  if (!slides || D <= 60) return { X: O.X + (x - O.X) * e, Y: O.Y + (restY - O.Y) * e, S: O.S + (z - O.S) * e, t: e };
  // across and up to size within the first stretch above the dock, so for most of the way it already sits on its button
  const t = smooth01((O.Y - y) / Math.min(D, 170));
  return { X: O.X + (x - O.X) * t, Y: softmin(y, O.Y, PICK), S: O.S + (z - O.S) * t, t };
}
let lastOverlayChange = 0;
/** Where the stage last put the orb (its box's top-left within the app, and its size). */
let orbNow = { X: NaN, Y: NaN, S: NaN };

/** The ids of the pop-ups that are open (not on their way out), cached per change of the stack. */
let idsFor: unknown = null, idsSet = new Set<string>();
function openIds() {
  const ov = useUI.getState().overlays;
  if (ov !== idsFor) { idsFor = ov; idsSet = new Set(ov.map((o) => o.id)); }
  return idsSet;
}
const isLeaving = (s: Slot) => !!s.ov && !openIds().has(s.ov);

/**
 * Handing the orb over. One pop-up leaving as another arrives with a slot of its own (the orb screen's Coach button): the orb
 * goes straight from where it is to the new slot, on the new pop-up's own progress, instead of first flying home to the dock
 * with the pop-up that is leaving and then jumping across. `from` is where it was when the new one arrived; `back` is set if
 * the new one is closed again before it got there (then the orb returns from wherever it is).
 */
let handoff: { el: HTMLElement; from: { X: number; Y: number; S: number }; back?: { k: number; P: { X: number; Y: number; S: number } } } | null = null;
/** slots that have handed the orb over: on their way out they no longer pull it back */
const gaveUp = new WeakSet<HTMLElement>();
function claim(el: HTMLElement) {
  if (handoff?.el === el || !Number.isFinite(orbNow.X)) return;
  for (const s of slots.values()) {
    if (s.el === el || !s.el.isConnected || !isLeaving(s) || gaveUp.has(s.el)) continue;
    if ((s.engage ? s.engage.e.get() : 1) > 0.02) { handoff = { el, from: { ...orbNow } }; return; }
  }
}

/**
 * High refresh rate for the orb: its flight between the dock and a popup handed to the browser on the popup's own spring,
 * so it is drawn at the screen's full rate in exact step with the sheet (the script version runs underneath and takes over
 * the moment anything interrupts it, e.g. a finger). `container` is the popup; `shiftAt(p)` how far its slot is displaced
 * at progress p (0 for a popup that doesn't slide).
 */
export function mirrorOrb(container: Element | null, p0: number, p1: number, sp: { stiffness: number; damping: number; mass?: number }, vel: number, shiftAt: (p: number) => number = () => 0): Animation | null {
  const el = orbEl;
  const slotEl = container?.querySelector<HTMLElement>('[data-orb-slot]');
  if (!el || !slotEl || !slotEl.isConnected) return null;
  if (handoff && handoff.el !== slotEl && p1 < p0) return null; // it has handed the orb over: leaving takes nothing with it
  if (handoff?.el === slotEl && p1 < p0) { orbAnim?.cancel(); orbAnim = null; return null; } // closed before it arrived: the script brings it back
  if (p1 > p0) claim(slotEl);
  const mine = handoff?.el === slotEl;
  const O = mine ? handoff!.from : dockRest;
  if (!O || O.S < (mine ? 4 : 30)) return null;
  // a new popup takes the orb over: an earlier flight still running (the orb screen leaving while the Coach opens) would
  // otherwise hold it where that flight was going
  orbAnim?.cancel(); orbAnim = null;
  // only the simple cases: between the dock — or the pop-up handing it over — and this one popup (anything stacked is left
  // to the script version)
  for (const s of slots.values()) {
    if (s.el === slotEl || s.priority <= 0 || !s.el.isConnected || !s.engage) continue;
    if (isLeaving(s) && (mine || gaveUp.has(s.el))) continue;
    if (s.engage.e.get() > 0.02) return null;
  }
  const app = el.closest('.app') ?? el.parentElement;
  const b = app?.getBoundingClientRect() ?? { left: 0, top: 0 };
  const r = slotEl.getBoundingClientRect();
  const z = Math.min(r.width, r.height);
  if (z < 2) return null;
  const R = { X: r.left - b.left, Y: r.top - b.top - shiftAt(p0), S: z };
  const slides = Math.abs(shiftAt(0) - shiftAt(1)) > 1;
  const bucket = Math.ceil(Math.max(O.S, R.S, 8) / 24) * 24;
  whooshPending = Math.max(whooshPending, 1);
  const at = (p: number): Keyframe => {
    const e = Math.min(1, Math.max(0, p));
    const c = carry(O, R.X, R.Y + shiftAt(p), R.S, R.Y, e, slides);
    return { transform: `translate3d(${c.X.toFixed(2)}px, ${c.Y.toFixed(2)}px, 0) scale(${(Math.max(8, c.S) / bucket).toFixed(4)})` };
  };
  orbLock.bucket = bucket;
  if (el.style.width !== `${bucket}px`) el.style.width = el.style.height = `${bucket}px`;
  const a = mirrorProgress(el, p0, p1, sp, vel, at, Array.from({ length: 23 }, (_, i) => (i + 1) / 24));
  if (!a) { orbLock.bucket = 0; return null; }
  // finish/cancel events arrive later, asynchronously: only the flight that still owns the orb may release its size lock
  // (an earlier flight's late "cancelled" used to unlock the new one mid-air — the orb drawn at a quarter of its size)
  const done = () => { if (orbAnim === a) { orbAnim = null; orbLock.bucket = 0; } };
  a.onfinish = done; a.oncancel = done;
  orbAnim = a;
  return a;
}

export function registerSlot(id: string, el: HTMLElement, priority: number, engage?: Engage, ov?: string) {
  slots.set(id, { id, el, priority, engage, ov });
  if (ov && !isLeaving({ id, el, priority, ov })) claim(el);
  markOrbLayoutDirty();
  return () => { if (slots.get(id)?.el === el) slots.delete(id); markOrbLayoutDirty(); };
}

/** cubic-bezier(0.65, 0, 0.35, 1) — the --ease-io curve the colour field cross-fades on */
function easeInOut(x: number): number {
  const X = (t: number) => 3 * (1 - t) * (1 - t) * t * 0.65 + 3 * (1 - t) * t * t * 0.35 + t * t * t;
  const Y = (t: number) => 3 * (1 - t) * t * t + t * t * t; // y1 = 0, y2 = 1
  let lo = 0, hi = 1;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (X(m) < x) lo = m; else hi = m; }
  return Y((lo + hi) / 2);
}

function parseColor(css: string, fallback: [number, number, number]): [number, number, number] {
  const m = css.match(/#([0-9a-f]{6})/i);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgb = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const srgb = css.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/); // modern engines serialise colour-mix() like this
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255];
  return fallback;
}

export function SphereStage() {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const motionPref = useStore((s) => s.settings.motion);
  const hrr = useSyncExternalStore(onHighRefresh, highRefresh, () => true);
  const [gen, setGen] = useState(0); // a fresh canvas when the drawing moves between the worker and the page

  useEffect(() => {
    const el = root.current!, cv = canvas.current!;
    // High refresh rate: the orb is drawn in a worker, on its own frame clock. Some browsers (Samsung Internet) run the
    // page's script animation at 60 fps on a 120 Hz screen; a worker drawing into an OffscreenCanvas is not tied to the
    // page's frames. Position and size still come from here (the page's layout), the drawing itself from there.
    let renderer: SphereRenderer | null = null;
    let worker: Worker | null = null;
    let workerVoice = 0, workerRunning = false;
    orbStats.fps = 0; orbStats.offThread = false;
    // a canvas handed to a worker can't be drawn on again; an effect re-run (StrictMode, a setting) needs a fresh one
    if (transferred.has(cv)) { setGen((g) => g + 1); return; }
    if (hrr && !workerBroken && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && 'transferControlToOffscreen' in cv) {
      try {
        const off = cv.transferControlToOffscreen();
        transferred.add(cv);
        worker = new Worker(new URL('./sphere.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (e: MessageEvent) => {
          const d = e.data;
          if (typeof d.voice === 'number') workerVoice = d.voice;
          if (typeof d.fps === 'number') orbStats.fps = d.fps;
          if (typeof d.onset === 'number') onsetBuzz(d.onset);
          if (d.unsupported) { workerBroken = true; setGen((g) => g + 1); }
        };
        worker.onerror = () => { workerBroken = true; setGen((g) => g + 1); };
        worker.postMessage({ canvas: off }, [off]);
        orbStats.offThread = true;
      } catch { workerBroken = true; worker?.terminate(); worker = null; setGen((g) => g + 1); return; }
    } else { renderer = new SphereRenderer(cv); renderer.onOnset = onsetBuzz; }
    const pause = () => { if (worker && workerRunning) { worker.postMessage({ state: { run: false } }); workerRunning = false; } };
    let mainFrames = 0, mainT0 = 0;
    const appEl = el.closest('.app') as HTMLElement | null;
    let running = true;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let drawn = false;
    // The accent follows the active area. Read the target colours once per change (through probes, which force a
    // style pass) and cross-fade to them here, on the same 1.1 s curve as the colour field, instead of polling
    // the live CSS value every few frames.
    const probe = (v: string) => { const d = document.createElement('i'); d.style.cssText = `position:absolute;width:0;height:0;pointer-events:none;color:var(${v})`; (appEl ?? document.body).appendChild(d); return d; };
    const pAc = probe('--ac'), pAc2 = probe('--ac-2'), pH1 = probe('--h1');
    const readTarget = (): SphereColors => {
      const dark = document.documentElement.dataset.theme !== 'light';
      const ac = parseColor(getComputedStyle(pAc).color, [255, 91, 36]);
      const ac2 = parseColor(getComputedStyle(pAc2).color, [255, 138, 77]);
      const alt = parseColor(getComputedStyle(pH1).color, [124, 92, 255]);
      return dark
        ? { hi: ac2, lo: [ac[0] * 0.3, ac[1] * 0.3, ac[2] * 0.3], alt, ok: [110, 222, 150], dark }
        : { hi: ac, lo: [ac[0] * 0.55 + 70, ac[1] * 0.55 + 60, ac[2] * 0.55 + 60], alt, ok: [30, 160, 95], dark };
    };
    let colors = readTarget(), from = colors, to = colors, fadeStart = 0;
    let colorKey = document.documentElement.dataset.theme ?? '';
    const mo = new MutationObserver(() => {
      const theme = document.documentElement.dataset.theme ?? '';
      const next = readTarget();
      if (theme !== colorKey) { colorKey = theme; colors = from = to = next; fadeStart = 0; return; } // theme: switch at once
      from = colors; to = next; fadeStart = performance.now();
    });
    if (appEl) mo.observe(appEl, { attributes: true, attributeFilter: ['data-hue'] });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const refreshColors = (now: number) => {
      if (!fadeStart) return;
      const k = Math.min(1, Math.max(0, (now - fadeStart) / 1100));
      const e = easeInOut(k);
      const mix = (x: RGB, y: RGB): RGB => [x[0] + (y[0] - x[0]) * e, x[1] + (y[1] - x[1]) * e, x[2] + (y[2] - x[2]) * e];
      colors = { hi: mix(from.hi, to.hi), lo: mix(from.lo, to.lo), alt: mix(from.alt, to.alt), ok: mix(from.ok, to.ok), dark: to.dark };
      if (k >= 1) fadeStart = 0;
    };

    // The orb has no motion of its own any more. Its place is the lowest slot (the tab bar) blended towards every
    // higher slot by that slot's `engage` (how far its popup is open). The popup, the page behind it and the orb all
    // read the same number in the same frame, so they stay in step while a popup opens, is dragged or leaves.
    let px = NaN, py = NaN, ps = NaN, sentV = 0;
    let glide: Animation | null = null;
    let base = { left: 0, top: 0 };
    let wasLifted = false, wasLanded = false, hapticSlot: Slot | null = null;
    let restProbe = { X: -1, Y: -1, S: -1, since: 0 };
    orbEl = el;
    const rects = new WeakMap<HTMLElement, DOMRect>();
    const parents = new WeakMap<HTMLElement, HTMLElement[]>();
    const transforms = new Map<HTMLElement, { matrix: DOMMatrixReadOnly; css: DOMMatrixReadOnly; x: number; y: number; sx: number; sy: number; height: number; animations: { animation: Animation; sampled: boolean; frames: { offset: number; matrix: DOMMatrixReadOnly }[] }[] }>();
    let measuredRevision = -1;
    let sampledAnimations: Animation[] = [];
    const sampledStates = new WeakMap<Animation, AnimationPlayState>();
    const owners = new WeakMap<HTMLElement, number>();
    /** z-index of the fixed surface (popup) a slot lives in, found once per slot. */
    const ownerZ = (slot: HTMLElement) => {
      let z = owners.get(slot);
      if (z !== undefined) return z;
      z = 599;
      for (let n = slot.parentElement; n && n !== appEl; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.position === 'fixed') { const v = parseInt(cs.zIndex, 10); if (Number.isFinite(v)) z = v; break; }
      }
      owners.set(slot, z);
      return z;
    };
    // Scroll, resize, content and keyboard changes invalidate layout. Transform-only motion reuses the local anchors.
    const dirty = () => markOrbLayoutDirty();
    // A popup's own motion (its transform, the dim and blur fading, the page stepping back) rewrites a style attribute every
    // frame. Its transform is applied below; decorative layers don't change layout.
    const MOVING = '.sheet, .sheet-pane, .sheet-page, .scrim, .scrim > i, .stage, .wk-card, .wk-sheet, .fields, .aurora, .sphere-stage, .lens, .lens > i';
    const lmo = new MutationObserver((recs) => {
      for (const r of recs) {
        if (r.type === 'attributes' && r.target === appEl && r.attributeName === 'style') continue; // the stage's backdrop colour
        if (r.type !== 'attributes' || !(r.target as Element).matches?.(MOVING)) { dirty(); return; }
      }
    });
    if (appEl) lmo.observe(appEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'data-active', 'hidden'] });
    window.addEventListener('scroll', dirty, { capture: true, passive: true });
    window.addEventListener('resize', dirty);
    window.visualViewport?.addEventListener('resize', dirty);
    window.addEventListener('pointermove', dirty, { passive: true });
    window.addEventListener('pointerdown', dirty, { passive: true });
    const offUi = useUI.subscribe((a, b) => { if (a.tab !== b.tab) dirty(); else if (a.overlays !== b.overlays) { lastOverlayChange = performance.now(); dirty(); } });
    const offKb = kb.on('change', dirty);
    document.fonts?.addEventListener?.('loadingdone', dirty); // a web font arriving re-flows text
    window.addEventListener('load', dirty, true);              // an image arriving can too
    const observed = new Set<HTMLElement>();
    const ro = new ResizeObserver(dirty);
    const observe = (n: HTMLElement) => { if (!observed.has(n)) { observed.add(n); ro.observe(n); } };
    if (appEl) observe(appEl);
    const matrixOf = (css: string, height: number) => new DOMMatrixReadOnly(!css || css === 'none' ? undefined :
      css.replace(/translateY\(([-\d.]+)%\)/g, (_, p) => `translateY(${Number(p) * height / 100}px)`));
    // Read changed geometry before Motion writes. Save the parent's transform at that measurement, then apply its delta
    // in postRender. Native animation timing supplies that delta too, without asking layout for a moving box every frame.
    const measure = () => {
      if (!running) return;
      const changed = measuredRevision !== layoutRevision || sampledAnimations.some(a => a.playState === 'running' || a.playState !== sampledStates.get(a));
      if (changed) {
        transforms.clear(); sampledAnimations = [];
        for (const n of observed) if (!n.isConnected) { ro.unobserve(n); observed.delete(n); }
        const b = appEl?.getBoundingClientRect(); base = { left: b?.left ?? 0, top: b?.top ?? 0 }; measuredRevision = layoutRevision;
      }
      for (const sl of slots.values()) {
        if (!sl.el.isConnected) continue;
        if (!changed && rects.has(sl.el)) continue;
        rects.set(sl.el, sl.el.getBoundingClientRect()); observe(sl.el);
        ownerZ(sl.el);
        const chain: HTMLElement[] = [];
        for (let n = sl.el.parentElement; n && n !== appEl; n = n.parentElement) {
          observe(n);
          const cs = getComputedStyle(n);
          if (!n.matches(MOVING + ', .tabbar-wrap') && !n.style.transform && cs.transform === 'none') continue;
          chain.push(n);
          if (transforms.has(n)) continue;
          const matrix = matrixOf(cs.transform, n.offsetHeight);
          const r = n.getBoundingClientRect(), w = n.offsetWidth || 1, h = n.offsetHeight || 1;
          const origin = cs.transformOrigin.split(' ').map(Number.parseFloat);
          const animations = n.getAnimations().map(animation => {
            const keys = (animation.effect as KeyframeEffect).getKeyframes().filter(k => k.transform !== undefined);
            const sampled = animation instanceof CSSAnimation || animation instanceof CSSTransition || keys.some(k => k.easing !== 'linear');
            if (sampled) sampledStates.set(animation, animation.playState);
            return { animation, sampled, frames: sampled ? [] : keys.map(k => ({ offset: k.computedOffset!, matrix: matrixOf(String(k.transform), h) })), moving: keys.length > 1 };
          }).filter(a => a.moving);
          sampledAnimations.push(...animations.filter(a => a.sampled).map(a => a.animation));
          transforms.set(n, { matrix, css: n.style.transform ? new DOMMatrixReadOnly() : matrix, x: r.left + r.width * origin[0] / w, y: r.top + r.height * origin[1] / h,
            sx: r.width / (w * (matrix.a || 1)), sy: r.height / (h * (matrix.d || 1)), height: h,
            animations });
        }
        parents.set(sl.el, chain);
      }
    };
    const currentTransforms = new Map<HTMLElement, DOMMatrixReadOnly>();
    const position = (slot: HTMLElement, r: DOMRect) => {
      let x = r.left, y = r.top, w = r.width, h = r.height;
      for (const n of parents.get(slot) ?? []) {
        const t = transforms.get(n);
        if (!t) continue;
        let m = currentTransforms.get(n);
        if (!m) {
          m = n.style.transform ? matrixOf(n.style.transform, t.height) : t.css;
          for (const a of t.animations) {
            const p = a.animation.effect?.getComputedTiming().progress;
            if (p == null || a.animation.playState === 'idle') continue;
            if (a.sampled) { m = t.matrix; continue; }
            const next = a.frames.findIndex(k => k.offset >= p);
            const i = Math.max(0, Math.min(a.frames.length - 2, (next < 0 ? a.frames.length - 1 : next) - 1));
            const from = a.frames[i], to = a.frames[i + 1], f = (p - from.offset) / (to.offset - from.offset);
            m = new DOMMatrixReadOnly([from.matrix.a + (to.matrix.a - from.matrix.a) * f, 0, 0, from.matrix.d + (to.matrix.d - from.matrix.d) * f,
              from.matrix.e + (to.matrix.e - from.matrix.e) * f, from.matrix.f + (to.matrix.f - from.matrix.f) * f]);
          }
          currentTransforms.set(n, m);
        }
        if (m.b || m.c || t.matrix.b || t.matrix.c || !t.matrix.a || !t.matrix.d) continue;
        const sx = m.a / t.matrix.a, sy = m.d / t.matrix.d;
        x = t.x + (x - t.x) * sx + (m.e - t.matrix.e) * t.sx;
        y = t.y + (y - t.y) * sy + (m.f - t.matrix.f) * t.sy;
        w *= sx; h *= sy;
      }
      return { x, y, z: Math.min(w, h) };
    };
    const tick = (now: number) => {
      if (!running) return;
      currentTransforms.clear();
      refreshColors(now);
      const reduced = document.documentElement.dataset.motion === 'reduce' || (document.documentElement.dataset.motion !== 'full' && mq.matches);
      const list: Slot[] = [];
      for (const s of slots.values()) if (s.el.isConnected) list.push(s);
      list.sort((a, b) => a.priority - b.priority);
      const ox = base.left, oy = base.top;
      let X = 0, Y = 0, S = 0, have = false, top = 0, topSlot: Slot | null = null, flight = 1;
      if (handoff && !handoff.el.isConnected) handoff = null;
      for (const sl of list) {
        const leaving = isLeaving(sl);
        const mine = handoff?.el === sl.el;
        // a pop-up that has handed the orb over to the one arriving no longer pulls it back on its way out
        if (leaving && !mine && (handoff || gaveUp.has(sl.el))) { gaveUp.add(sl.el); continue; }
        const e = sl.engage ? Math.min(1, Math.max(0, sl.engage.e.get())) : 1;
        if (have && e <= 0.001 && !mine) continue;
        const r = rects.get(sl.el);
        if (!r) { dirty(); continue; }
        if (r.width < 2) { if (mine && have && !handoff!.back) { X = handoff!.from.X; Y = handoff!.from.Y; S = handoff!.from.S; topSlot = sl; top = Math.max(top, sl.priority); } continue; }
        // where the slot is drawn right now — its popup's slide included — so the orb is carried by the popup (it used to
        // head for where the slot would come to rest, and sat there over an empty sheet while the sheet caught up)
        const p = position(sl.el, r), x = p.x - ox, y = p.y - oy, z = p.z;
        if (!have) { X = x; Y = y; S = z; have = true; continue; }
        if (mine) {
          const h = handoff!;
          if (leaving && !h.back) h.back = { k: Math.max(0.001, e), P: { ...orbNow } };
          if (h.back) {
            // closed again before it arrived: straight back from where it was to wherever the orb belongs now
            const f = Math.min(1, e / h.back.k);
            X += (h.back.P.X - X) * f; Y += (h.back.P.Y - Y) * f; S += (h.back.P.S - S) * f; flight = f;
            if (e <= 0.001) handoff = null;
          } else {
            // from where it was handed over, straight to this slot, on this pop-up's progress (as mirrorOrb plays it)
            const c = sl.engage?.shift ? carry(h.from, x, y, z, y - sl.engage.shift.get(), e) : carry(h.from, x, y, z, y, e, false);
            X = c.X; Y = c.Y; S = c.S; flight = c.t;
            if (e >= 0.999) handoff = null; // arrived: from here on an ordinary slot
          }
          top = Math.max(top, sl.priority); topSlot = sl;
          continue;
        }
        // a sliding popup's slot comes up from below the screen: the orb waits where it is until the slot reaches it, then
        // rides up with it (rather than diving off the bottom edge to meet it)
        // A sliding popup's slot (a sheet, the live workout): the orb heads for where the slot comes to REST, on the very
        // same progress as the popup. Both start together and land together, so the orb never trails the sheet or crosses its
        // buttons on the way; while the popup is opening it is simply a shared element flying to its place.
        if (sl.engage?.shift) {
          const c = carry({ X, Y, S }, x, y, z, y - sl.engage.shift.get(), e);
          X = c.X; Y = c.Y; S = c.S; flight = c.t;
        } else {
          X += (x - X) * e; Y += (y - Y) * e; S += (z - S) * e; flight = e;
        }
        if (e > 0.02) { top = Math.max(top, sl.priority); topSlot = sl; }
      }
      if (!have) { el.style.opacity = '0'; pause(); return; }
      orbNow = { X, Y, S };
      // In the tab bar it sits under every popup; in a popup it sits just above that popup — and so under anything
      // opened over it (an exercise menu over the live workout), never floating on top of everything.
      const zi = top > 0 && topSlot ? String(ownerZ(topSlot.el) + 1) : '41';
      if (el.style.zIndex !== zi) el.style.zIndex = zi;
      const size = Math.max(8, S);
      // haptics: a light tick as the orb is lifted out of the dock, a firmer one as it settles into its place (and back).
      // Handed from one pop-up to another, it starts a new flight: a lift, then a landing (not a "drop" first).
      if (topSlot !== hapticSlot) { if (hapticSlot && topSlot) { wasLifted = false; wasLanded = false; } hapticSlot = topSlot; }
      if (topSlot && !reduced) {
        // "landed" as you see it settle (the last 4 % of a spring is too slow to see — waiting for 99.5 % put the landing tick
        // and the orb screen's spiral a beat after the orb had visibly arrived)
        const lifted = flight > 0.04, landed = flight > 0.96;
        if (lifted !== wasLifted || landed !== wasLanded) {
          // landing on the orb screen sets it alight (the renderer's arrival spiral), with a quickening heartbeat; anywhere
          // else it lands with one firm tick
          const ignite = landed && !wasLanded && topSlot.id === 'voice';
          if (ignite) ignitePending = 1;
          if (useStore.getState().settings.haptics && running) {
            if (landed && !wasLanded) buzz(ignite ? IGNITE_BUZZ : 12); else if (lifted && !wasLifted) buzz(6); else if (!lifted && wasLifted) buzz(8);
          }
          wasLifted = lifted; wasLanded = landed;
        }
      } else { wasLifted = false; wasLanded = false; }
      // The canvas is drawn at a size bucket and scaled down with a transform. Resizing a canvas (and the element) on
      // every frame of a flight reallocated its buffer and re-laid it out each frame — a stutter source.
      const bucket = orbLock.bucket || Math.ceil(size / 24) * 24;
      if (el.style.opacity !== '1') el.style.opacity = '1';
      if (el.style.width !== `${bucket}px`) el.style.width = el.style.height = `${bucket}px`;
      const tf = `translate3d(${X}px, ${Y}px, 0) scale(${size / bucket})`;
      if (glideReq || glide) {
        if (top > 0) { glide?.cancel(); glide = null; glideReq = null; } // a popup took it: its flight is script-driven
        else if (glideReq) {
          const g = glideReq; glideReq = null;
          // from where it is drawn right now (a glide in flight included)
          let from = Number.isFinite(px) ? `translate3d(${px}px, ${py}px, 0) scale(${size / bucket})` : '';
          if (glide && glide.playState === 'running') from = getComputedStyle(el).transform;
          glide?.cancel(); glide = null;
          if (from && Math.abs(X - px) + Math.abs(Y - py) > 0.5 && el.style.transform) {
            glide = el.animate([{ transform: from }, { transform: tf }], { duration: g.duration, easing: g.easing });
            glide.onfinish = () => { glide = null; };
          }
        }
      }
      el.style.transform = tf;
      // where the orb rests in the dock, for flights that are handed to the browser (mirrorOrb)
      // only a dock that has held still (not mid-slide, mid tab change or mid-press) and is its normal size
      if (top === 0 && !glide && useUI.getState().overlays.length === 0 && now - lastOverlayChange > 1100 && S > 30) {
        if (Math.abs(X - restProbe.X) < 0.5 && Math.abs(Y - restProbe.Y) < 0.5 && Math.abs(S - restProbe.S) < 0.5) { if (now - restProbe.since > 250) dockRest = { X, Y, S }; }
        else restProbe = { X, Y, S, since: now };
      }
      // A big orb is soft light, not fine detail: at 2× it looks the same as at 3×, with less than half the pixels to fill and
      // hand to the screen every frame (that hand-over was most of the orb screen's cost). Small orbs keep full sharpness.
      const dpr = Math.min(bucket > 120 ? 2 : 3, window.devicePixelRatio || 1);
      // Sitting still in the tab bar under an open sheet/overlay: keep the last frame instead of redrawing, so the
      // frosted layers above stop re-blurring it every frame.
      const still = Math.abs(X - px) < 0.05 && Math.abs(Y - py) < 0.05 && Math.abs(S - ps) < 0.05;
      px = X; py = Y; ps = S;
      if (top === 0 && still && useUI.getState().overlays.length > 0 && drawn) { pause(); return; }
      // Drawn every frame — the slow turn included (it used to be drawn at ~30 fps when idle, which read as a stutter).
      // A flight only scales the drawn canvas (transform above); the canvas is redrawn at a new size only when its size
      // bucket changes.
      const inp = orbInputs();
      inp.vis = size;
      let vv: number;
      if (worker) {
        worker.postMessage({ state: { bucket, dpr, reduced, colors, inp, run: true } });
        workerRunning = true;
        vv = workerVoice;
      } else {
        renderer!.resize(bucket, dpr);
        renderer!.frame(now, bucket, reduced, colors, inp);
        vv = renderer!.voice;
        mainFrames++; if (!mainT0) mainT0 = now;
        if (now - mainT0 >= 1000) { orbStats.fps = Math.round((mainFrames * 1000) / (now - mainT0)); mainFrames = 0; mainT0 = now; }
      }
      drawn = true;
      // the slot's button listens too: its ring swells with your voice (one CSS variable, written only when it moves)
      if (topSlot && top > 0 && (Math.abs(vv - sentV) > 0.015 || (vv < 0.004) !== (sentV < 0.004))) {
        (topSlot.el.parentElement ?? topSlot.el).style.setProperty('--voice', vv < 0.004 ? '0' : vv.toFixed(3));
        sentV = vv;
      }
    };
    // Measure before animation writes; render with this frame's progress and transform changes afterwards.
    const loop = (d: { timestamp: number }) => tick(d.timestamp);
    frame.read(measure, true);
    frame.postRender(loop, true);
    const onVis = () => {
      if (document.hidden) { running = false; cancelFrame(measure); cancelFrame(loop); pause(); }
      else if (!running) { running = true; dirty(); frame.read(measure, true); frame.postRender(loop, true); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { running = false; cancelFrame(measure); cancelFrame(loop); worker?.terminate(); document.removeEventListener('visibilitychange', onVis); mo.disconnect(); lmo.disconnect(); ro.disconnect(); window.removeEventListener('scroll', dirty, { capture: true }); window.removeEventListener('resize', dirty); window.visualViewport?.removeEventListener('resize', dirty); window.removeEventListener('pointermove', dirty); window.removeEventListener('pointerdown', dirty); offUi(); offKb(); document.fonts?.removeEventListener?.('loadingdone', dirty); window.removeEventListener('load', dirty, true); pAc.remove(); pAc2.remove(); pH1.remove(); };
  }, [motionPref, hrr, gen]);

  return (
    <div ref={root} className="sphere-stage" aria-hidden="true" style={{ position: 'fixed', left: 0, top: 0, zIndex: 75, pointerEvents: 'none', opacity: 0, willChange: 'transform', transformOrigin: '0 0', contain: 'strict' }}>
      <canvas key={`${gen}-${hrr}`} ref={canvas} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

/** Put this where the sphere should appear. Inside a popup it follows that popup's progress; elsewhere pass `engage`. */
export function SphereSlot({ id, priority = 0, className, style, engage }: { id: string; priority?: number; className?: string; style?: React.CSSProperties; engage?: Engage }) {
  const ref = useRef<HTMLDivElement>(null);
  const ctx = useEngageContext();
  const ov = useContext(OverlayMeta)?.id;
  const eng = engage ?? ctx ?? undefined;
  useEffect(() => registerSlot(id, ref.current!, priority, eng, ov), [id, priority, eng, ov]);
  return <div ref={ref} className={className} style={style} data-orb-slot={id} />;
}
