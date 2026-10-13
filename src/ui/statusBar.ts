/**
 * The phone's status bar. A web app can't make it see-through: it is one flat colour (theme-color). It used to be the page's
 * near-black, sitting over a page whose glow starts a little lower — a dark band across the top. Now the bar takes the colour
 * of the top of the page itself: a deep tint of the current area's light, which the page then fades from into its glow. So the
 * bar reads as the top of the app, not a strip above it. It follows the area's colour as you switch tabs (in step with the
 * glow) and darkens with the dim when a pop-up opens (the page steps back onto the same colour, so there is no seam).
 */
type RGB = [number, number, number];
let cur: RGB = [5, 6, 11];
let from: RGB = cur, to: RGB = cur, t0 = 0, dur = 0;
let depth = 0;
let cover = 0;
let frost = 0;
let raf = 0;
let sent = '';
const hex = (c: RGB) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/* The tint is written on the few elements that use it (marked data-bar: the page's top tint; data-bar-shown: the orb
   screen's top), never on <html>. A variable changed on <html> is inherited by every element, so the browser restyled the whole app
   on each frame of the 0.8 s blend (measured: 60 % of the style work and most of the long frames in a tab switch). The two
   variables are registered as non-inherited (styles.css), so changing them restyles only these elements. */
let shown = '';
function paint(bar: string) {
  for (const el of document.querySelectorAll<HTMLElement>('[data-bar]')) if (el.style.getPropertyValue('--bar') !== bar) el.style.setProperty('--bar', bar);
  // the colour the bar is showing right now changes on every frame of a pop-up's dim: written only where it is used (the
  // orb screen's top), never on anything large — a write restyles the element, and on a big painted one that is a repaint
  if (shown) for (const el of document.querySelectorAll<HTMLElement>('[data-bar-shown]')) if (el.style.getPropertyValue('--bar-shown') !== shown) el.style.setProperty('--bar-shown', shown);
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
  // the dim over the page (Veil's .veil-dim, --scrim) lies over the top of it too, deepening in step with the pop-up's
  // progress, 0 → 1 — the bar used to reach full dim at 60 %, so it ran ahead of the page: a darker band leading the dim.
  // A pop-up on a pop-up lays a second dim over the first (depth 1 → 2), and the bar takes that one too.
  const light = root.dataset.theme === 'light';
  const [sr, sg, sb, sa] = light ? [16, 20, 34, 0.3] : [2, 3, 8, 0.5];
  let keep = 1;
  for (let k = 0; k < 3; k++) keep *= 1 - sa * Math.min(1, Math.max(0, depth - k));
  const a = 1 - keep;
  // A pop-up over a full cover (the exercise list over the live workout): the page isn't drawn behind the cover, so what
  // shows beside the cover as it steps back is the app's background colour under both dims; the bar moves to it as the
  // second dim comes (it stayed on the page's colour: a band 4–8 levels off under the bar).
  const bg: RGB = light ? [233, 236, 244] : [5, 6, 11];
  const over = cover >= 0.985 ? Math.min(1, Math.max(0, depth - 1)) : 0;
  const base = cur.map((v, i) => v * (1 - over) + bg[i] * over) as RGB;
  let c3: RGB = [base[0] * (1 - a) + sr * a, base[1] * (1 - a) + sg * a, base[2] * (1 - a) + sb * a];
  // the orb screen's frost (VOICE_VEIL: the background colour at 74 % over the page) covers the top too, so the bar goes
  // with it — it stayed the area's purple over a near-black screen, a band across the top
  if (frost > 0) { const f = 0.74 * frost; c3 = c3.map((v, i) => v * (1 - f) + bg[i] * f) as RGB; }
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
/** How many pop-ups' dims lie over the page (0..1 for one, up to 2 or more with a pop-up on a pop-up). */
export function setBarDepth(v: number) { if (Math.abs(v - depth) < 0.004 && v !== 0) return; depth = v; schedule(); }
/** How far a full cover (the live workout) covers the page (stageCover). */
export function setBarCover(v: number) { if (v === cover) return; cover = v; schedule(); }

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
