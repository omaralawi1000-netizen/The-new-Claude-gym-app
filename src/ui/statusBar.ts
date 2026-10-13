/**
 * The phone's status bar. A web app can't make it see-through: it is one flat colour (theme-color). It used to be the page's
 * near-black, sitting over a page whose glow starts a little lower — a dark band across the top. Now the bar takes the colour
 * of the top of the page itself: a deep tint of the current area's light, which the page then fades from into its glow. So the
 * bar reads as the top of the app, not a strip above it. It follows the area's colour as you switch tabs (in step with the
 * glow) and goes to black as a pop-up opens (the page steps back onto black, and the bar goes with it).
 */
type RGB = [number, number, number];
let cur: RGB = [5, 6, 11];
let from: RGB = cur, to: RGB = cur, t0 = 0, dur = 0;
let depth = 0;
let stepped = true; // the page really steps back (not with reduced motion: then the bar only dims)
let frost = 0;
let raf = 0;
let sent = '';
const hex = (c: RGB) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/* The tint is written on the few elements that use it (marked data-bar: the app shell, the colour field, the orb screen's
   top), never on <html>. A variable changed on <html> is inherited by every element, so the browser restyled the whole app
   on each frame of the 0.8 s blend (measured: 60 % of the style work and most of the long frames in a tab switch). The two
   variables are registered as non-inherited (styles.css), so changing them restyles only these elements. */
let shown = '';
function paint(bar: string) {
  for (const el of document.querySelectorAll<HTMLElement>('[data-bar]')) {
    if (el.style.getPropertyValue('--bar') !== bar) el.style.setProperty('--bar', bar);
    if (shown && el.style.getPropertyValue('--bar-shown') !== shown) el.style.setProperty('--bar-shown', shown);
  }
}
/** Gives a just-mounted data-bar element the current tint. */
export function refreshBar() { paint(`rgb(${cur.map((v) => Math.round(v)).join(' ')})`); }

function frame(now: number) {
  raf = 0;
  if (dur) {
    const k = Math.min(1, (now - t0) / dur), e = ease(k);
    cur = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e, from[2] + (to[2] - from[2]) * e];
    if (k >= 1) dur = 0; else raf = requestAnimationFrame(frame);
  }
  const root = document.documentElement;
  // the dim over the page (Veil: full strength from 60 % of a pop-up's progress) lies over the top of it too
  const light = root.dataset.theme === 'light';
  const [sr, sg, sb, sa] = light ? [16, 20, 34, 0.3] : [2, 3, 8, 0.5];
  const a = sa * Math.min(1, Math.max(0, depth / 0.6));
  let c3: RGB = [cur[0] * (1 - a) + sr * a, cur[1] * (1 - a) + sg * a, cur[2] * (1 - a) + sb * a];
  // the orb screen's frost (VOICE_VEIL: the background colour at 74 % over the page) covers the top too, so the bar goes
  // with it — it stayed the area's purple over a near-black screen, a band across the top
  if (frost > 0) { const f = 0.74 * frost, bg: RGB = light ? [233, 236, 244] : [5, 6, 11]; c3 = c3.map((v, i) => v * (1 - f) + bg[i] * f) as RGB; }
  // and as the page steps back onto black, the bar goes black with it, so the whole screen reads as one card leaving
  // the top (it stayed the page's tint: a band that seemed not to move with the rest)
  if (depth > 0 && stepped) { const k = 1 - toBlack(depth); c3 = c3.map((v) => v * k) as RGB; }
  const c = hex(c3);
  if (c !== sent) { sent = c; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c); }
  shown = c;
  paint(`rgb(${cur.map((v) => Math.round(v)).join(' ')})`);
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(frame); };

/** The tint the bar should take; `ms` = how long to blend into it (0 = at once). */
export function setBarTint(c: RGB, ms = 800) {
  if (!ms) { cur = from = to = c; dur = 0; } else { from = cur; to = c; t0 = performance.now(); dur = ms; }
  schedule();
}
/** How black what the page steps back onto is at depth v: the page's own tint while it has barely moved (a hairline of
 *  black round a page that is nearly home read as the background flashing through), black from a quarter of the way. */
export const toBlack = (v: number) => { const x = Math.min(1, Math.max(0, v / 0.25)); return x * x * (3 - 2 * x); };
/** How far a pop-up has the page stepped back (0..1). */
export function setBarDepth(v: number, back = true) { if (Math.abs(v - depth) < 0.004 && v !== 0 && back === stepped) return; depth = v; stepped = back; schedule(); }

/** Reads a CSS colour (rgb() or color(srgb …)) into 0..255 channels. */
export function readRGB(css: string): RGB | null {
  const m = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  const s = css.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (s) return [+s[1] * 255, +s[2] * 255, +s[3] * 255];
  return null;
}
/** How far the orb screen's frost is up (0..1). */
export function setBarFrost(v: number) { if (Math.abs(v - frost) < 0.004 && v !== 0 && v !== 1) return; frost = v; schedule(); }
