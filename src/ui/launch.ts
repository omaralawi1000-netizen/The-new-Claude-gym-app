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
 *     the whole first screen builds behind it, block by block from the top down.
 *  4. Touchdown: its light spreads out along the whole dock glass and fades.
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
const FADE_MS = 260;      // the launch screen giving way to the app (its blocks still unseen), as the orb sets off
const IGNITE_AT = 40;     // the coil of light and colour starts as the logo becomes the sphere (its morph: 0.34 s)
const GLIDE_AT = 560;     // the flight sets off once the coil is done and every bead has turned (0.48 s after it starts)
const RISE_FIRST = 40;    // the page builds from the top down as the orb sets off: the first item …
const RISE_ROW = 50;      // … each next row …
const RISE_COL = 30;      // … and each next item along a row
const GLOW_MS = 720;      // the touchdown's light spreading along the dock
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

  // 4. touchdown: its light spreads along the whole dock
  void after(FLIGHT_MS - 110).then(barGlow);
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

/** The whole first screen builds as the orb comes down, one item at a time: the date, each button, the pin, the ring,
 *  each tile, each quick button and chip, each card. Row by row from the top down, and along each row from the left, every
 *  item in its usual rise (a small lift and fade, the same curve as the blocks' own), the wave keeping pace with the orb.
 *  Until then they wait unseen under the launch screen, so none is already there when it lifts. */
function riseInWake() {
  const root = document.documentElement;
  const W = window.innerWidth, H = window.innerHeight;
  const ease = getComputedStyle(root).getPropertyValue('--ease-out').trim() || 'ease-out';
  const seen = (r: DOMRect) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W;
  const items: { el: Element; r: DOMRect }[] = [];
  document.querySelectorAll<HTMLElement>('.screen > *, .subpage > *').forEach((b) => {
    const r = b.getBoundingClientRect();
    if (!seen(r)) return; // out of sight: its own order
    const parts: { el: Element; r: DOMRect }[] = [];
    split(b, parts, seen);
    if (parts.length > 1) {
      b.style.animationDelay = '-1s'; // the block itself is simply there (its rise already over); its items rise instead
      items.push(...parts);
    } else items.push({ el: b, r });
  });
  // rows: items side by side (their middles at about the same height), each row read from the left
  const mid = (r: DOMRect) => (r.top + r.bottom) / 2;
  items.sort((a, c) => mid(a.r) - mid(c.r));
  const rows: { el: Element; r: DOMRect }[][] = [];
  for (const it of items) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(mid(it.r) - mid(last[0].r)) < 16) last.push(it); else rows.push([it]);
  }
  const at = new Map<Element, number>();
  rows.forEach((row, i) => row.sort((a, c) => a.r.left - c.r.left).forEach((it, j) => at.set(it.el, i * RISE_ROW + j * RISE_COL)));
  for (const it of items) {
    const delay = RISE_FIRST + (at.get(it.el) ?? 0);
    if (it.el instanceof HTMLElement && it.el.matches('.screen > *, .subpage > *')) {
      const el = it.el;
      el.style.animationDelay = `${delay}ms`;
      el.addEventListener('animationend', () => { el.style.animationDelay = ''; }, { once: true });
    } else {
      it.el.animate([{ opacity: 0, transform: 'translate3d(0, 18px, 0) scale(.985)' }, { opacity: 1, transform: 'none' }],
        { duration: 780, delay, easing: ease, fill: 'backwards' });
    }
  }
  delete root.dataset.riseHold;
}

/** A block's items: it is taken apart where it is only a frame laying things out side by side or one under another (no
 *  glass, colour or outline of its own, a tap area included); a button you can see, a card, a chip, a text or a picture (or
 *  anything whose parts sit on top of each other) is one item. */
function split(el: Element, out: { el: Element; r: DOMRect }[], seen: (r: DOMRect) => boolean, depth = 0) {
  const r = el.getBoundingClientRect();
  const kids = [...el.children] // (pictures too: an svg drawn beside the words is an item of its own)
    .map((c) => ({ el: c, r: c.getBoundingClientRect() })).filter((k) => k.r.width > 0 && k.r.height > 0);
  const cs = getComputedStyle(el);
  const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()); // words of its own: one item
  const bare = (pe: string) => /^(none|normal)$/.test(getComputedStyle(el, pe).content); // nothing drawn by its ::before / ::after
  const plain = !text && bare('::before') && bare('::after') && (!/^(a|input|textarea|canvas|img|video|svg)$/i.test(el.tagName) &&
    !el.matches('.plinth, .glass, .chip') && cs.backgroundImage === 'none' && /rgba\(.*, 0\)|transparent/.test(cs.backgroundColor) &&
    cs.boxShadow === 'none' && parseFloat(cs.borderTopWidth) === 0 && cs.backdropFilter === 'none');
  const apart = kids.length > 1 && kids.every((a, i) => kids.every((c, j) => i === j || a.r.right <= c.r.left + 1 || c.r.right <= a.r.left + 1 || a.r.bottom <= c.r.top + 1 || c.r.bottom <= a.r.top + 1));
  const one = kids.length === 1 && Math.abs(kids[0].r.width - r.width) < 2 && Math.abs(kids[0].r.height - r.height) < 2;
  // a tile or a little group is one item, never its bits and pieces (a few buttons side by side are still each their own)
  const small = r.width < 130 && r.height < 90 && !(apart && kids.every((k) => k.el.tagName === 'BUTTON'));
  if (depth < 6 && plain && !small && (apart || one)) { for (const k of kids) if (seen(k.r)) split(k.el, out, seen, depth + 1); return; }
  out.push({ el, r });
}

/** On touchdown the palette's light spreads out of the orb along the whole dock: a wide, soft glow inside the dock glass,
 *  widening from the orb to both ends and fading (no outline; under the icons; only its size and its light move). The
 *  current tab's pill sits over the dock glass, so the same light goes over the pill too (a moment later, still under its
 *  icon and name): the light runs the whole length of the dock. */
function barGlow() {
  const o = dockOrb();
  const bar = document.querySelector<HTMLElement>('.tabbar');
  if (!o || !bar) return;
  const b = bar.getBoundingClientRect();
  const x = o.x - b.left, reach = Math.max(x, b.width - x); // the farther end
  const w = reach * 2.3, h = b.height * 1.5;
  const light = (host: HTMLElement, z: string, k: number, delay: number) => {
    const at = host.getBoundingClientRect();
    const clip = document.createElement('i');
    clip.setAttribute('aria-hidden', 'true');
    clip.style.cssText = `position:absolute;inset:0;${z}border-radius:inherit;overflow:hidden;pointer-events:none`;
    const glow = document.createElement('i');
    glow.style.cssText = `position:absolute;left:${b.left + x - w / 2 - at.left}px;top:${b.top + (b.height - h) / 2 - at.top}px;width:${w}px;height:${h}px;opacity:0;` +
      'background:radial-gradient(closest-side, color-mix(in srgb, var(--ac) 62%, transparent) 0%, color-mix(in srgb, var(--ac) 38%, transparent) 60%, color-mix(in srgb, var(--ac) 18%, transparent) 85%, transparent 100%)';
    clip.appendChild(glow);
    host.insertBefore(clip, host.firstChild); // (first: the tab's icon and name are drawn over it)
    glow.animate([
      { transform: 'scale(0.14, 0.7)', opacity: 0 },
      { transform: 'scale(0.6, 0.95)', opacity: 0.32 * k, offset: 0.45 },
      { transform: 'scale(0.95, 1)', opacity: 0.22 * k, offset: 0.74 },
      { transform: 'scale(1, 1)', opacity: 0 },
    ], { duration: GLOW_MS, delay, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)', fill: 'both' })
      .finished.catch(() => {}).then(() => clip.remove());
  };
  light(bar, 'z-index:-1;', 1, 0);
  const tab = bar.querySelector<HTMLElement>('.tab.on');
  if (tab) light(tab, '', 1, 60);
}

/** Takes the launch screen over once the app has mounted (once, also under StrictMode's double effects). */
export function useLaunch() {
  useEffect(() => {
    if (!cover || started) return;
    started = true;
    run(cover).catch(() => { orbLogo(undefined); cover.remove(); delete document.documentElement.dataset.launch; delete document.documentElement.dataset.riseHold; });
  }, []);
}
