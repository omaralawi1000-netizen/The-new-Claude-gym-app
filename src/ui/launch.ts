import { useEffect } from 'react';
import { animate, cubicBezier, motionValue } from 'motion/react';
import { orbDrawn, orbIgnite, orbLaunch, orbLaunchTint, orbLogo, orbTintGo, registerSlot } from './Sphere';

/**
 * Opening the app. The phone shows the launch screen first (ink, the Ember orb of dots in the middle); the page's very
 * first paint shows exactly the same (index.html), so the hand-over is invisible. Then, once the app is drawn underneath,
 * one short story: the orb wakes up and switches the app on.
 *  1. Wake: the live orb takes the logo's place drawn as the very same logo, so the swap can't be seen, and in place the
 *     flat logo swells into the turning glass sphere (each dot flows to its bead) while the app's light comes up behind.
 *  2. Ignite: a spiral of light winds up it from the bottom, and the palette's colour rides its front, bead by bead
 *     (never through a grey blend).
 *  3. Glide: it drifts down into the dock on a soft arc, one calm move.
 *  4. Touchdown: a soft ring of light leaves it as it lands, and the first screen's blocks rise one after another,
 *     outward from the orb (the nearest first).
 * Only transform and opacity move, and the orb's flight is run by the browser, so it is drawn at the screen's full rate
 * even while the app is still starting up. With reduced motion the launch screen simply fades and the orb is in the dock.
 */
const cover = typeof document !== 'undefined' ? document.getElementById('launch') : null;
if (cover) { cover.dataset.taken = '1'; orbLaunchTint(); orbLogo(1); }

/** The launch's curve: one calm move. It eases off the launch screen (a spring would leave at full pull from a standstill)
 *  and settles into the dock without the slow crawl a spring's tail has over this long a way (its last tenth took 0.6 s). */
const FLIGHT_EASE = [0.4, 0, 0.2, 1] as const;
const FLIGHT_MS = 900;
const FLIGHT = (() => {
  const f = cubicBezier(...FLIGHT_EASE), n = Math.round(FLIGHT_MS / (1000 / 120)); // a keyframe per 1/120 s
  return { xs: Array.from({ length: n + 1 }, (_, i) => f(i / n)), duration: FLIGHT_MS };
})();
const BOW = -30;          // the flight's arc: falls first, slides into the dock at the end, clear of the first card's play button
const FADE_MS = 700;      // the launch screen fading away (the app's light coming up) while the orb wakes
const IGNITE_AT = 200;    // the spiral of light and colour starts as the logo is becoming the sphere (its morph: 0.42 s)
const GLIDE_AT = 560;     // the flight sets off while the spiral climbs (the colour has finished by ~2/3 of the way down)
const RISE_LEAD = 380;    // the blocks start rising while it comes down to them (the nearest first), so the screen is there as it lands
const RISE_SPREAD = 320;  // from the block nearest the dock to the top of the screen
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
  const fade = cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' });

  // 2. ignite: light and colour wind up it from the bottom
  void after(IGNITE_AT).then(() => { orbIgnite(); orbTintGo(); });

  // 3. glide down into the dock
  await after(GLIDE_AT);
  const flight = await orbLaunch(FLIGHT, BOW);
  const move = animate(e, 0, { duration: FLIGHT_MS / 1000, ease: [...FLIGHT_EASE] }); // the script's copy, which carries the orb if anything interrupts the browser's flight

  // 4. touchdown: the blocks rise outward from it, and a ring of light leaves it as it lands
  void after(FLIGHT_MS - RISE_LEAD).then(riseFromDock);
  void after(FLIGHT_MS - 40).then(ring);
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

/** The first screen's blocks rise one after another from the dock up (their usual rise, in a new order). */
function riseFromDock() {
  const root = document.documentElement;
  const o = dockOrb();
  const H = window.innerHeight;
  if (o) {
    const blocks = document.querySelectorAll<HTMLElement>('.screen > *, .subpage > *');
    blocks.forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.bottom < 0 || r.top > H) return; // out of sight: its own order
      const k = Math.min(1, Math.max(0, (o.y - (r.top + r.bottom) / 2) / H));
      b.style.animationDelay = `${Math.round(k * RISE_SPREAD)}ms`;
      b.addEventListener('animationend', () => { b.style.animationDelay = ''; }, { once: true });
    });
  }
  delete root.dataset.riseHold;
}

/** One soft ring of the palette's light leaving the orb as it lands, over the dock (under the orb). */
function ring() {
  const o = dockOrb();
  const app = document.querySelector('.app');
  if (!o || !app) return;
  const el = document.createElement('div');
  el.className = 'launch-ring';
  el.style.cssText = `position:fixed;left:${o.x - o.d / 2}px;top:${o.y - o.d / 2}px;width:${o.d}px;height:${o.d}px;z-index:40;pointer-events:none;border-radius:50%;` +
    'background:radial-gradient(closest-side, transparent 72%, color-mix(in srgb, var(--ac) 55%, transparent) 88%, transparent 100%)';
  app.appendChild(el);
  el.animate([{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(3.6)', opacity: 0 }], { duration: 1100, easing: 'cubic-bezier(0.16, 0.6, 0.3, 1)', fill: 'forwards' })
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
