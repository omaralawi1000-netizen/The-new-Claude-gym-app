/**
 * Surfaces A/B/C (dark theme, surfaces.css `data-look`). Two things read from each tab's colour field picture:
 *
 * 1. Frosted cards. A page's cards show a soft copy of the colour field behind them, as frosted glass would, without a
 *    backdrop blur: real blur under scrolling cards cost a third of the frame rate at the phone's 3.75 dpr. Each tab's field
 *    holds still (every background but Classic's sway and Orb light's moving glows), so its picture is copied once, small
 *    (1/6 of the screen) and soft, with the look's own frost baked in, into a tiny picture per tab. Every card holds a tiny
 *    canvas the size of the screen, drawn from it, that stays put on the screen while the card scrolls: a scroll-driven
 *    `transform` (styles.css `.frost`), which the compositor runs. Nothing is blurred per frame. The canvases are made with
 *    their cards (when a page is built), never added or dropped at the end of an animation; a tab's picture only draws into
 *    them, and they fade in.
 *
 * 2. The colour behind. The field's hue (its most colourful part wins: a chroma-weighted average in OKLab) is written on
 *    the root as --bh-h, with how deep and how coloured the sheets' glass should be (--bh-sl, --bh-sc), for the tab on show.
 *    The sheets take that colour instead of the palette's, so Golden hour on a blue morning sky gets blue glass, not brown.
 */
const SC = 6; // the frost picture's scale: 1 pixel for 6 css px
const pics = new Map<string, HTMLCanvasElement>(); // tab → its frost picture
const hues = new Map<string, { h: number; sl: number; sc: number }>(); // tab → the colour behind its sheets
const live = new Set<HTMLCanvasElement>();

const size = () => ({ w: Math.ceil(window.innerWidth / SC), h: Math.ceil(window.innerHeight / SC) });
const hueOf = (el: Element) => (el.closest('.tab-pane') as HTMLElement | null)?.dataset.hue ?? '';
const root = () => document.documentElement;
const dark = () => root().dataset.theme !== 'light';
const look = () => root().dataset.look ?? 'a';
// the frost each look bakes into the copy (the card's own see-through fill lies over it, surfaces.css): A today's clear
// glass with a little frost, B lets more of the colour through. C has none: its cards blur what is behind them live
const RECIPE: Record<string, string> = { a: 'blur(4px) saturate(1.35)', b: 'blur(4px) saturate(1.9) brightness(0.94)' };

function paint(cv: HTMLCanvasElement) {
  const src = RECIPE[look()] ? pics.get(hueOf(cv)) : undefined;
  const g = cv.getContext('2d'); if (!g) return;
  if (!src) { cv.dataset.on = ''; return; } // (fades out over the last picture; the card shows its plain glass)
  if (cv.width !== src.width || cv.height !== src.height) { cv.width = src.width; cv.height = src.height; }
  g.clearRect(0, 0, cv.width, cv.height); g.drawImage(src, 0, 0);
  cv.dataset.on = '1';
}

const imgs = new Map<string, HTMLImageElement>();
/** a moving part's own picture (SelfGlow's --glow-img), loaded; null until it is */
function partImage(el: HTMLElement): HTMLImageElement | null {
  const m = /url\("?([^")]+)"?\)/.exec(el.style.getPropertyValue('--glow-img')); if (!m) return null;
  let im = imgs.get(m[1]);
  if (!im) { im = new Image(); im.src = m[1]; imgs.set(m[1], im); im.onload = () => { const f = lastField; if (f) frostFromField(f); }; }
  return im.complete && im.naturalWidth ? im : null;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** the field's colour, its most colourful part winning (chroma-weighted mean hue in OKLab), and the sheets' glass for it */
function sample(g: CanvasRenderingContext2D, w: number, h: number) {
  let d: Uint8ClampedArray; try { d = g.getImageData(0, 0, w, h).data; } catch { return null; }
  const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  let sx = 0, sy = 0;
  for (let i = 0; i < d.length; i += 16) { // every 4th pixel is plenty for a hue
    const r = lin(d[i]), gg = lin(d[i + 1]), b = lin(d[i + 2]);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * gg + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * gg + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * gg + 0.6299787005 * b);
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    const c = Math.hypot(A, B); sx += A * c; sy += B * c;
  }
  if (!(Math.abs(sx) + Math.abs(sy) > 1e-6)) return null;
  const hue = (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;
  // orange backgrounds: lower and quieter (a full one read umber); blue: a little less colour (it read as painted navy).
  // Both fade in over 10 degrees, so a hue near the edge never jumps; pink (Sunset, 5–19) stays below it and keeps its plum
  const warm = smooth(22, 32, hue) * (1 - smooth(85, 95, hue)), blue = smooth(240, 250, hue) * (1 - smooth(290, 300, hue));
  const base = 0.034 - 0.008 * blue;
  return { h: hue, sl: 0.205 - 0.025 * warm, sc: base - (base - 0.022) * warm };
}

let shownTab = '';
function showHue() {
  const pane = document.querySelector<HTMLElement>('.tab-pane[data-active]');
  const tab = pane?.dataset.hue ?? shownTab; shownTab = tab;
  const v = hues.get(tab), st = root().style;
  if (!v) return; // (until a field picture is in, the sheets take the accent's hue: surfaces.css)
  st.setProperty('--bh-h', v.h.toFixed(1)); st.setProperty('--bh-sl', v.sl.toFixed(3)); st.setProperty('--bh-sc', v.sc.toFixed(3));
}

let lastField: HTMLElement | null = null;
const fields = new Map<string, HTMLElement>(); // tab → its field, to copy again for a new look
const watched = new WeakSet<HTMLElement>();
let againAt = 0;
/** Copy a field's picture (and its moving glows where they are now) into its tab's frost picture and colour. */
export function frostFromField(field: HTMLElement) {
  const hue = field.dataset.hue ?? '';
  if (!hue) return;
  const cv = field.querySelector<HTMLCanvasElement>('canvas.glow-field');
  if (!dark()) { pics.delete(hue); hues.delete(hue); repaint(hue); return; }
  if (!cv || !cv.width || !field.hasAttribute('data-dith')) return; // (until its picture is in, the cards keep the last one)
  lastField = field; fields.set(hue, field);
  // a moving glow (Sunrise's sun) settles after the picture is in, and moves again when food is logged: copy it again
  // where it rests (and once more a while later, in case its move ended unseen)
  if (!watched.has(field)) {
    watched.add(field);
    field.addEventListener('transitionend', (e) => { if ((e.target as HTMLElement).hasAttribute?.('data-dith-img')) frostFromField(field); });
  }
  clearTimeout(againAt); againAt = window.setTimeout(() => { if (field.isConnected) frostFromField(field); }, 2800);
  const { w, h } = size();
  const raw = document.createElement('canvas'); raw.width = w; raw.height = h;
  const g = raw.getContext('2d', { willReadFrequently: true }); if (!g) return;
  const r = field.getBoundingClientRect();
  g.drawImage(cv, r.left / SC, r.top / SC, r.width / SC, r.height / SC);
  for (const el of field.querySelectorAll<HTMLElement>('[data-dith-img]')) {
    const im = partImage(el); if (!im) continue;
    const b = el.getBoundingClientRect(), op = parseFloat(getComputedStyle(el).opacity);
    if (!(op > 0) || !b.width) continue;
    g.globalAlpha = op; g.drawImage(im, b.left / SC, b.top / SC, b.width / SC, b.height / SC); g.globalAlpha = 1;
  }
  const c = sample(g, w, h); if (c) { hues.set(hue, c); showHue(); }
  // Classic sways and Orb light's glows move: their cards keep the plain glass (a still copy would slide off them)
  const moves = root().dataset.motion !== 'reduce' && (field.classList.contains('aurora') || root().dataset.bg === 'orb');
  const rec = RECIPE[look()];
  if (moves || !rec) { pics.delete(hue); repaint(hue); return; }
  const out = pics.get(hue) ?? document.createElement('canvas');
  out.width = w; out.height = h;
  const o = out.getContext('2d'); if (!o) return;
  o.filter = rec; o.drawImage(raw, 0, 0); o.filter = 'none';
  pics.set(hue, out);
  repaint(hue);
}

function repaint(hue: string) { for (const cv of live) { if (!cv.isConnected) { live.delete(cv); continue; } if (hueOf(cv) === hue) paint(cv); } }

/** where a card sits across the screen, so its copy lines up with the field beside it (cards side by side aren't centred) */
const place = (card: HTMLElement, wrap: HTMLElement) => {
  const scr = card.closest('.screen'); const x = card.getBoundingClientRect().left - (scr?.getBoundingClientRect().left ?? 0);
  wrap.style.setProperty('--frost-x', `${-Math.round(x)}px`);
};
let sized: ResizeObserver | null = null; // (made on first use: tests run without one)
const watch = (card: HTMLElement) => {
  sized ??= typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((es) => { for (const e of es) { const c = e.target as HTMLElement; const wrap = c.querySelector<HTMLElement>(':scope > .frost'); if (wrap) place(c, wrap); } });
  sized?.observe(card);
};

/** Give a card its frost: a clip the card's shape, holding a screen-sized canvas that stays put while the card scrolls. */
function dress(card: HTMLElement) {
  if (card.querySelector(':scope > .frost')) return;
  // (only a page's own cards: not one inside another card, nor inside anything that clips or scrolls (overflow hidden
  // makes a scroll box too, and the copy would then follow that box instead of the page)
  if (card.parentElement?.closest('.plinth')) return;
  const boxy = (o: string) => o === 'auto' || o === 'scroll' || o === 'hidden';
  for (let p = card.parentElement; p && !p.classList.contains('screen'); p = p.parentElement) {
    const cs = getComputedStyle(p); if (boxy(cs.overflowX) || boxy(cs.overflowY)) return;
  }
  // (a card that hides its overflow is a scroll box itself: `clip` draws the same and isn't one)
  const own = getComputedStyle(card);
  if (boxy(own.overflowX) || boxy(own.overflowY)) {
    if (own.overflowX !== 'hidden' || own.overflowY !== 'hidden') return;
    card.style.overflow = 'clip';
  }
  const wrap = document.createElement('span'); wrap.className = 'frost'; wrap.setAttribute('aria-hidden', 'true');
  const hold = document.createElement('i');
  const cv = document.createElement('canvas'); const { w, h } = size(); cv.width = w; cv.height = h;
  hold.appendChild(cv); wrap.appendChild(hold); card.appendChild(wrap);
  place(card, wrap); watch(card);
  live.add(cv); paint(cv);
}

let started = false;
export function startFrost() {
  if (started || typeof document === 'undefined') return; started = true;
  const r = root();
  const sh = () => r.style.setProperty('--frost-sh', `${window.innerHeight}px`);
  sh(); window.addEventListener('resize', () => { sh(); const f = lastField; if (f?.isConnected) frostFromField(f); });
  const scan = (n: ParentNode) => { for (const c of n.querySelectorAll<HTMLElement>('.screen .plinth')) dress(c); };
  scan(document);
  new MutationObserver((ms) => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (!(n instanceof HTMLElement) || n.classList.contains('frost')) continue;
      if (n.matches('.screen .plinth')) dress(n);
      scan(n);
    }
  }).observe(document.body, { childList: true, subtree: true });
  // the tab on show decides the sheets' colour
  new MutationObserver(showHue).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-active'] });
  // a new look: copy each field again with its frost (their pictures are painted again too, for the grain, and copied once more)
  new MutationObserver(() => { for (const f of fields.values()) if (f.isConnected) frostFromField(f); })
    .observe(r, { attributes: true, attributeFilter: ['data-look'] });
}
