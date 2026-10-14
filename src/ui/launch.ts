import { useEffect } from 'react';
import { animate, cubicBezier, motionValue } from 'motion/react';
import { orbDrawn, orbIgnite, orbLaunch, orbLaunchTint, orbLogo, orbTintGo, registerSlot } from './Sphere';

/**
 * Opening the app. The phone shows the launch screen first (ink, the Ember orb of dots in the middle); the page's very
 * first paint shows exactly the same (index.html), so the hand-over is invisible. Then, once the app is drawn underneath,
 * one short story, about 1.6 s: the orb wakes up and switches the app on.
 *  1. Wake: the live orb takes the logo's place drawn as the very same logo, so the swap can't be seen, and in place, still
 *     on the launch screen, the flat logo swells into the turning glass sphere (each dot flows to its bead).
 *  2. Ignite: a coil of light winds up it from the bottom, and the palette's colour fills in under it, bead by bead
 *     (never through a grey blend), all before it moves.
 *  3. Glide: it drifts down into the dock on a soft arc, one calm move, while the launch screen gives way to the app and
 *     the first screen's blocks rise with it, each as the orb comes down to it.
 *  4. Touchdown: a soft bloom of light in the dock glass under it.
 * Only transform and opacity move, and the orb's flight is run by the browser, so it is drawn at the screen's full rate
 * even while the app is still starting up. With reduced motion the launch screen simply fades and the orb is in the dock.
 */
const cover = typeof document !== 'undefined' ? document.getElementById('launch') : null;
if (cover) { cover.dataset.taken = '1'; orbLaunchTint(); orbLogo(1); }

/** The launch's curve: one calm move. It eases off the launch screen (a spring would leave at full pull from a standstill)
 *  and lands in the dock decisively: no slow crawl over the last stretch (its last 5 % takes about 0.12 s). */
const FLIGHT_EASE = [0.55, 0, 0.45, 1] as const;
const FLIGHT_MS = 640;
const FLIGHT = (() => {
  const f = cubicBezier(...FLIGHT_EASE), n = Math.round(FLIGHT_MS / (1000 / 120)); // a keyframe per 1/120 s
  return { xs: Array.from({ length: n + 1 }, (_, i) => f(i / n)), duration: FLIGHT_MS };
})();
const BOW = -30;          // the flight's arc: falls first, slides into the dock at the end, clear of the first card's play button
const FADE_MS = 400;      // the launch screen giving way to the app, as the orb sets off
const IGNITE_AT = 40;     // the coil of light and colour starts as the logo becomes the sphere (its morph: 0.34 s)
const GLIDE_AT = 560;     // the flight sets off once the coil is done and every bead has turned (0.48 s after it starts)
const RISE_AHEAD = 0.75;  // a block rises as the orb comes down to it (at 3/4 of the time the orb takes to reach it)
const BLOOM_MS = 520;
const SPLASH_FADE = 330;  // Android's launch screen fades over 300 ms from the page's first paint: never fly under it
const MAX_WAIT = 1500;    // the longest the logo waits for the app underneath before it goes anyway

const frames = (n: number) => new Promise<void>((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** `ms` of frames: counted on the frames' own clock, the one the animations run on, so the steps stay in time together */
const after = (ms: number) => new Promise<void>((r) => { let t0 = -1; const f = (t: number) => { if (t0 < 0) t0 = t; if (t - t0 >= ms) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });

let started = false;
async function run(cover: HTMLElement) {
  const root = document.documentElement;
  const reduced = root.dataset.motion === 'reduce' || (root.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  // into the app's own layer, so the orb (which is drawn inside it) can sit above the launch screen and not under it
  document.querySelector('.app')?.appendChild(cover);
  // the live orb's place on the launch screen: the logo's place, sized so the orb is drawn exactly as big (index.html)
  const slot = document.createElement('div');
  slot.className = 'launch-slot';
  cover.appendChild(slot);
  const e = motionValue(1);
  const unregister = registerSlot('launch', slot, 1000, { e });
  const logo = cover.querySelector<SVGElement>('.launch-logo');
  const done = () => { orbLogo(undefined); unregister(); cover.remove(); delete root.dataset.launch; delete root.dataset.riseHold; };

  // the app is drawn underneath (its first frame, the orb's first frame as the logo, the fonts) — or, on a slow start, it
  // goes anyway
  await Promise.race([Promise.all([orbDrawn, document.fonts?.ready ?? Promise.resolve()]), sleep(MAX_WAIT)]);
  await frames(1);
  const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
  if (performance.now() < fcp + SPLASH_FADE) await sleep(fcp + SPLASH_FADE - performance.now());
  performance.mark('aven:launch');

  if (reduced) {
    e.set(0); orbLogo(undefined);
    delete root.dataset.launch; delete root.dataset.riseHold;
    await cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'forwards' }).finished.catch(() => {});
    done();
    return;
  }

  await (window as { __launchHold?: Promise<void> }).__launchHold; // (films of the launch start it on cue: scripts/film-launch.mjs)

  // 1. wake: the live orb is the same picture as the logo, so the swap happens in one frame; in place it becomes the sphere
  if (logo) logo.style.visibility = 'hidden';
  delete root.dataset.launch; // the orb shows
  orbLogo(0);

  // 2. ignite: a coil of light winds up it, the colour filling in under it
  void after(IGNITE_AT).then(() => { orbIgnite(); orbTintGo(); });

  // 3. glide down into the dock; the launch screen gives way and the blocks rise as it passes them
  await after(GLIDE_AT);
  const fade = cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' });
  const flight = await orbLaunch(FLIGHT, BOW);
  const move = animate(e, 0, { duration: FLIGHT_MS / 1000, ease: [...FLIGHT_EASE] }); // the script's copy, which carries the orb if anything interrupts the browser's flight
  riseInWake();

  // 4. touchdown: a soft bloom in the dock glass
  void after(FLIGHT_MS - 120).then(bloom);
  await Promise.all([fade.finished.catch(() => {}), flight ? flight.finished.catch(() => {}) : move.then(() => {})]);
  move.stop(); e.set(0); // landed: exactly in the dock, from here on the dock's own orb
  done();
}

/** The dock's orb: where it rests and how big it is drawn (its slot's centre; the orb is 0.66 of the canvas, inset -6). */
function dockOrb() {
  const slot = document.querySelector<HTMLElement>('.tabbar .sphere-slot');
  if (!slot) return null;
  const r = slot.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, d: (r.height + 12) * 0.66 };
}

/** The first screen's blocks rise with the orb: each one (its usual rise) as the orb comes down to its middle. The orb's height on the way down is a straight line between the launch screen's middle and the dock (its arc
 *  bends sideways only), along the flight's curve in time. */
function riseInWake() {
  const root = document.documentElement;
  const o = dockOrb();
  const H = window.innerHeight, from = H / 2;
  if (o) {
    const xs = FLIGHT.xs, step = FLIGHT.duration / (xs.length - 1);
    document.querySelectorAll<HTMLElement>('.screen > *, .subpage > *').forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.bottom < 0 || r.top > H) return; // out of sight: its own order
      const p = Math.min(1, Math.max(0, ((r.top + r.bottom) / 2 - from) / (o.y - from)));
      let i = 0; while (i < xs.length - 1 && xs[i] < p) i++;
      b.style.animationDelay = `${Math.round(i * step * RISE_AHEAD)}ms`;
      b.addEventListener('animationend', () => { b.style.animationDelay = ''; }, { once: true });
    });
  }
  delete root.dataset.riseHold;
}

/** A soft bloom of the palette's light round the orb as it settles: no outline, under the orb, spreading out of the dock
 *  glass around it and fading (it swells in, then gives way). */
function bloom() {
  const o = dockOrb();
  const bar = document.querySelector<HTMLElement>('.tabbar');
  if (!o || !bar) return;
  const b = bar.getBoundingClientRect(), d = o.d * 1.5;
  const el = document.createElement('i');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = `position:absolute;left:${o.x - b.left - d / 2}px;top:${o.y - b.top - d / 2}px;width:${d}px;height:${d}px;pointer-events:none;border-radius:50%;` +
    'background:radial-gradient(closest-side, var(--ac) 0%, color-mix(in srgb, var(--ac) 55%, transparent) 45%, transparent 100%)';
  bar.appendChild(el);
  el.animate([
    { transform: 'scale(1)', opacity: 0 },
    { transform: 'scale(1.25)', opacity: 0.3, offset: 0.3 },
    { transform: 'scale(1.6)', opacity: 0 },
  ], { duration: BLOOM_MS, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)', fill: 'forwards' })
    .finished.catch(() => {}).then(() => el.remove());
}

/** Takes the launch screen over once the app has mounted (once, also under StrictMode's double effects). */
export function useLaunch() {
  useEffect(() => {
    if (!cover || started) return;
    started = true;
    run(cover).catch(() => { orbLogo(undefined); cover.remove(); delete document.documentElement.dataset.launch; delete document.documentElement.dataset.riseHold; });
  }, []);
}
