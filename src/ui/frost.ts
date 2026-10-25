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
// glass with a little frost, B and C let more of the colour through
const recipe = () => RECIPE[look()];
const RECIPE: Record<string, string> = { a: 'blur(4px) saturate(1.35)', b: 'blur(4px) saturate(1.9) brightness(0.94)', c: 'blur(4px) saturate(1.9) brightness(0.94)' };

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

/** the colours a picture was copied under: a new palette, background, glow or theme makes every tab's picture stale */
const stamp = () => { const d = root().dataset; return `${d.palette}|${d.bg}|${d.glow}|${d.theme}|${d.look}`; };
let lastField: HTMLElement | null = null;
const fields = new Map<string, HTMLElement>(); // tab → its field, to copy again for a new look
const watched = new WeakSet<HTMLElement>();
let againAt = 0;
/** Copy a field's picture (and its moving glows where they are now) into its tab's frost picture and colour. */
export function frostFromField(field: HTMLElement, everyTab = false) {
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
  const rec = recipe();
  if (moves || !rec) { pics.delete(hue); repaint(hue); return; }
  const out = pics.get(hue) ?? document.createElement('canvas');
  out.width = w; out.height = h;
  const o = out.getContext('2d'); if (!o) return;
  o.filter = rec; o.drawImage(raw, 0, 0); o.filter = 'none'; tame(o, w, h);
  pics.set(hue, out);
  repaint(hue);
  // (a background that is the same on every tab: the other tabs get the same picture now, not when they are opened)
  if (everyTab) for (const t of TABS) if (t !== hue) { pics.set(t, out); if (c) hues.set(t, c); repaint(t); }
}

const TABS = ['today', 'train', 'food', 'progress'];
/** A tab not on show, from its field's picture painted ahead (Glows.tsx prewarm): its cards' copy is ready before the tab
 * is opened, so they never show the last background's colours and then change. (`at`: the stamp it was painted under) */
export function frostAhead(hue: string, pic: ImageData, at: string) {
  if (!dark() || at !== stamp() || !pic.width) return;
  const f = lastField; if (!f?.isConnected) return;
  const { w, h } = size();
  const src = document.createElement('canvas'); src.width = pic.width; src.height = pic.height;
  src.getContext('2d')?.putImageData(pic, 0, 0);
  const raw = document.createElement('canvas'); raw.width = w; raw.height = h;
  const g = raw.getContext('2d', { willReadFrequently: true }); if (!g) return;
  const r = f.getBoundingClientRect(); // (every tab's field covers the same place)
  g.drawImage(src, r.left / SC, r.top / SC, r.width / SC, r.height / SC);
  const c = sample(g, w, h); if (c) hues.set(hue, c);
  const moves = root().dataset.motion !== 'reduce' && (f.classList.contains('aurora') || root().dataset.bg === 'orb');
  const rec = recipe();
  if (moves || !rec) return;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const o = out.getContext('2d'); if (!o) return;
  o.filter = rec; o.drawImage(raw, 0, 0); o.filter = 'none'; tame(o, w, h);
  pics.set(hue, out); repaint(hue);
}
export const frostStamp = stamp;


// ---- busy and solid backgrounds (options on trial, `data-cards`): the copy tamed where it is too much, left alone where it
// is calm (Champagne on Mesh, the dark backgrounds), in OKLab
const toLin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)));
function lab(r: number, g: number, b: number): [number, number, number] {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function rgb(L: number, A: number, B: number): [number, number, number] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
function tame(o: CanvasRenderingContext2D, w: number, h: number) {
  if (look() !== 'a') return;
  let im: ImageData; try { im = o.getImageData(0, 0, w, h); } catch { return; }
  const d = im.data, n = d.length / 4;
  const px = new Float32Array(n * 3);
  let sL = 0, sL2 = 0, sC = 0, gx = 0, gy = 0, gw = 0;
  for (let i = 0; i < n; i++) {
    const [L, A, B] = lab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); px[i * 3] = L; px[i * 3 + 1] = A; px[i * 3 + 2] = B;
    const C = Math.hypot(A, B); sL += L; sL2 += L * L; sC += C;
    const wt = (L + C) ** 6; gx += (i % w) * wt; gy += Math.floor(i / w) * wt; gw += wt;
  }
  const mL = sL / n, mC = sC / n, sd = Math.sqrt(Math.max(0, sL2 / n - mL * mL));
  // how much this background needs it: 0 for calm ones (Champagne on Mesh, the dots: mean chroma under .03), up to 1 for the
  // loud ones (Mesh on Golden hour or Sunset, Colour per tab, Time of day) and for an even slab of colour (Night sky)
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const g = Math.max(clamp((mC - 0.03) / 0.03), clamp((0.055 - sd) / 0.02) * clamp((mC - 0.025) / 0.01));
  if (g <= 0) return;
  const mix = (x: number, y: number) => x + (y - x) * g;
  const cx = gx / gw, cy = gy / gw, R = Math.hypot(w, h) * 0.32; // the brightest glow, and how far its light reaches
  for (let i = 0; i < n; i++) {
    let L = px[i * 3], A = px[i * 3 + 1], B = px[i * 3 + 2];
    let C = Math.hypot(A, B), H = Math.atan2(B, A);
    const r = Math.hypot((i % w) - cx, Math.floor(i / w) - cy) / R, near = Math.exp(-r * r); // 1 at the glow, 0 far from it
    { // like Champagne on Mesh: dark glass, one soft glow coming through (Omar's pick 25 Oct, option 5)
      const k = Math.max(0.6, Math.min(1, 0.26 / mL) * (0.62 + 0.38 * near)); // never below 60 %: smoked glass, not a hole
      L *= mix(1, k); C *= mix(1, Math.sqrt(k)); // the colour kept richer than the light, so dark orange doesn't turn brown
      const deg = (H * 180) / Math.PI, cool = deg > -130 && deg < -30; // violet and blue light: a slab, never the glow
      const kL = cool ? 0.16 : 0.24, kC = cool ? 0.05 : 0.08; // (the violet top card on Colour per tab stayed bright, judge r3)
      if (L > kL) L = mix(L, kL + (L - kL) * (cool ? 0.3 : 0.45)); // a bright slab is toned down too
      if (C > kC) C = mix(C, kC + (C - kC) * (cool ? 0.3 : 0.4));
      // dark orange leans to rose (not rust), navy to plum
      if (deg > 30 && deg < 85 && L < 0.4) H += ((15 - deg) * Math.PI / 180) * 0.6 * g;
      else if (deg < -60 && deg > -130) H += ((-35 - deg) * Math.PI / 180) * 0.6 * g;
    }
    A = C * Math.cos(H); B = C * Math.sin(H);
    const [rr, gg, bb] = rgb(L, A, B); d[i * 4] = rr; d[i * 4 + 1] = gg; d[i * 4 + 2] = bb;
  }
  o.putImageData(im, 0, 0);
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
  // a new palette, background, glow or theme: every tab's picture is of the old colours, so they all go now (the cards fade
  // to their plain glass with the old background) and come back, faded in, from the new field as it comes in (the tab on
  // show) or is painted ahead (the others). Opening a tab then never shows the last colours first.
  let was = stamp();
  new MutationObserver(() => {
    const now = stamp(); if (now === was) return; was = now;
    pics.clear(); hues.clear(); fields.clear();
    for (const cv of live) { if (cv.isConnected) paint(cv); else live.delete(cv); }
  }).observe(r, { attributes: true, attributeFilter: ['data-palette', 'data-bg', 'data-glow', 'data-theme'] });
}
