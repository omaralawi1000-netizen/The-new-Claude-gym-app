import { useEffect } from 'react';
import { animate, motionValue } from 'motion/react';
import { orbDrawn, orbLaunch, orbLaunchTint, orbLogo, orbTintGo, registerSlot } from './Sphere';
import { apple } from './motion';

/**
 * Opening the app. The phone shows the launch screen first (ink, the Ember orb of dots in the middle); the page's very
 * first paint shows exactly the same (index.html), so the hand-over is invisible. Then, once the app is drawn underneath:
 *  1. the live orb takes the logo's place drawn as the very same logo (its dots, colours and size), so the swap can't be
 *     seen, and in the same moment it starts to fly: down into the dock on a soft arc, while the launch screen fades and
 *     the first screen's blocks rise;
 *  2. as it flies, the flat logo becomes the sphere (each dot flows to its bead on the turning sphere, the far side comes
 *     up), and then a wave of the palette's colour runs up it from the bottom, bead by bead (never through a grey blend).
 * Only transform and opacity move, and the orb's flight is run by the browser, so it is drawn at the screen's full rate
 * even while the app is still starting up. With reduced motion the launch screen simply fades and the orb is in the dock.
 */
const cover = typeof document !== 'undefined' ? document.getElementById('launch') : null;
if (cover) { cover.dataset.taken = '1'; orbLaunchTint(); orbLogo(1); }

/** The launch's spring: Apple's smooth curve, unhurried (the same family as every sheet, a little longer for the distance). */
const FLIGHT = { ...apple(0.8), restDelta: 0.0005 };
const BOW = -30;          // the flight's arc: falls first, slides into the dock at the end, clear of the first card's play button
const FADE_MS = 250;      // the launch screen fading away as the orb sets off
const TINT_AFTER = 100;   // the palette's colour starts 0.1 s into the flight and takes 0.45 s (Sphere.tsx), so it is done well before it lands
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
  const done = () => { orbLogo(undefined); unregister(); cover.remove(); delete root.dataset.launch; };

  // the app is drawn underneath (its first frame, the orb's first frame as the logo, the fonts) — or, on a slow start, it
  // goes anyway
  await Promise.race([Promise.all([orbDrawn, document.fonts?.ready ?? Promise.resolve()]), sleep(MAX_WAIT)]);
  await frames(1);
  const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
  if (performance.now() < fcp + SPLASH_FADE) await sleep(fcp + SPLASH_FADE - performance.now());
  performance.mark('aven:launch');

  if (reduced) {
    e.set(0); orbLogo(undefined);
    delete root.dataset.launch;
    await cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'forwards' }).finished.catch(() => {});
    done();
    return;
  }

  await (window as { __launchHold?: Promise<void> }).__launchHold; // (films of the launch start it on cue: scripts/film-launch.mjs)

  // 1. the swap: the live orb is the same picture as the logo, so it happens in one frame; the app starts to appear at once
  if (logo) logo.style.visibility = 'hidden';
  delete root.dataset.launch; // the orb shows, the first screen's blocks start rising
  const fade = cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'cubic-bezier(0.33, 0, 0.2, 1)', fill: 'forwards' });

  // 2. and off it goes, becoming the sphere on the way, then turning into the palette's colours
  const flight = await orbLaunch(FLIGHT, BOW);
  const move = animate(e, 0, FLIGHT); // the script's copy, which carries the orb if anything interrupts the browser's flight
  orbLogo(0);
  void after(TINT_AFTER).then(orbTintGo);
  await Promise.all([fade.finished.catch(() => {}), flight ? flight.finished.catch(() => {}) : move.then(() => {})]);
  move.stop(); e.set(0); // landed: exactly in the dock, from here on the dock's own orb
  done();
}

/** Takes the launch screen over once the app has mounted (once, also under StrictMode's double effects). */
export function useLaunch() {
  useEffect(() => {
    if (!cover || started) return;
    started = true;
    run(cover).catch(() => { orbLogo(undefined); cover.remove(); delete document.documentElement.dataset.launch; });
  }, []);
}
