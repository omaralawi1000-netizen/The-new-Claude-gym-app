import { useEffect } from 'react';
import { animate, motionValue } from 'motion/react';
import { orbBright, orbDrawn, orbLaunch, orbLaunchTint, orbTintGo, registerSlot } from './Sphere';
import { apple } from './motion';

/**
 * Opening the app. The phone shows the launch screen first (ink, the Ember orb of dots in the middle); the page's very
 * first paint shows exactly the same (index.html), so the hand-over is invisible. Then, once the app is drawn underneath:
 *  1. the logo comes alive: the live orb fades in over it in the same place, size and colours, and
 *     it starts to turn; at the same moment the launch screen fades and the first screen's blocks start rising;
 *  2. once the logo has gone it flows down into the dock, shrinking as it goes and turning into the palette's colours
 *     bead by bead (never through a grey blend).
 * Only transform and opacity move, and the orb's flight is run by the browser, so it is drawn at the screen's full rate
 * even while the app is still starting up. With reduced motion the launch screen simply fades and the orb is in the dock.
 */
const cover = typeof document !== 'undefined' ? document.getElementById('launch') : null;
if (cover) { cover.dataset.taken = '1'; orbLaunchTint(); orbBright(1); }

/** The launch's spring: Apple's smooth curve, unhurried (the same family as every sheet, a little longer for the distance). */
const FLIGHT = { ...apple(0.8), restDelta: 0.0005 };
const ALIVE_MS = 200;   // the logo becoming the live orb (the app starts to appear at the same moment)
const LIFT_MS = 230;    // the flight starts once the logo has fully gone, so there is never a second orb behind it
const FADE_MS = 380;    // the launch screen fading away, from the moment the logo comes alive
const MAX_WAIT = 1500;  // the longest the logo waits for the app underneath before it goes anyway

const frames = (n: number) => new Promise<void>((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** `ms` of frames: counted on the frames' own clock, the one the animations run on, so the steps stay in time together */
const after = (ms: number) => new Promise<void>((r) => { let t0 = -1; const f = (t: number) => { if (t0 < 0) t0 = t; if (t - t0 >= ms) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });

let started = false;
async function run(cover: HTMLElement) {
  const root = document.documentElement;
  const reduced = root.dataset.motion === 'reduce' || (root.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  // the live orb's place on the launch screen: the logo's place, sized so the orb is drawn exactly as big (Sphere draws it
  // at 0.66 of its box)
  // into the app's own layer, so the orb (which is drawn inside it) can sit above the launch screen and not under it
  document.querySelector('.app')?.appendChild(cover);
  const slot = document.createElement('div');
  slot.className = 'launch-slot';
  cover.appendChild(slot);
  const e = motionValue(1);
  const unregister = registerSlot('launch', slot, 1000, { e });
  const logo = cover.querySelector<SVGElement>('.launch-logo');
  const canvas = () => document.querySelector<HTMLCanvasElement>('.sphere-stage canvas');
  const done = () => { unregister(); cover.remove(); delete root.dataset.launch; };

  // the app is drawn underneath (its first frame, the orb's first frame, the fonts) — or, on a slow start, it goes anyway
  await Promise.race([Promise.all([orbDrawn, document.fonts?.ready ?? Promise.resolve()]), sleep(MAX_WAIT)]);
  await frames(2);
  performance.mark('aven:launch');

  if (reduced) {
    e.set(0); orbBright(0);
    delete root.dataset.launch;
    await cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'forwards' }).finished.catch(() => {});
    done();
    return;
  }

  await (window as { __launchHold?: Promise<void> }).__launchHold; // (films of the launch start it on cue: scripts/film-launch.mjs)

  // 1. the logo comes alive, and the app starts to appear around it at once. Both change quickly at first, so the two
  // grids of dots (rings against a turning sphere) are only both visible for a few frames and the orb never dims between
  const quick = 'cubic-bezier(0.2, 0, 0, 1)';
  canvas()?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ALIVE_MS, easing: quick, fill: 'backwards' });
  logo?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ALIVE_MS * 0.8, easing: quick, fill: 'forwards' });
  orbTintGo(); // its colours start turning now, so it is in the palette's colours well before it lands
  delete root.dataset.launch; // the first screen's blocks start rising
  const fade = cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'cubic-bezier(0.33, 0, 0.2, 1)', fill: 'forwards' });
  await after(LIFT_MS);

  // 2. down into the dock, turning into the palette's colours on the way
  const flight = await orbLaunch(FLIGHT);
  const move = animate(e, 0, FLIGHT); // the script's copy, which carries the orb if anything interrupts the browser's flight
  animate(1, 0, { duration: 0.6, ease: [0.4, 0, 0.2, 1], onUpdate: orbBright }); // from the logo's even light to its own glassy depth
  await Promise.all([fade.finished.catch(() => {}), flight ? flight.finished.catch(() => {}) : move.then(() => {})]);
  move.stop(); e.set(0); // landed: exactly in the dock, from here on the dock's own orb
  done();
}

/** Takes the launch screen over once the app has mounted (once, also under StrictMode's double effects). */
export function useLaunch() {
  useEffect(() => {
    if (!cover || started) return;
    started = true;
    run(cover).catch(() => { orbBright(0); cover.remove(); delete document.documentElement.dataset.launch; });
  }, []);
}
