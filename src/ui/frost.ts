/**
 * Surfaces A/B/C (dark theme, surfaces.css `data-look`). Two things read from each tab's colour field picture:
 *
 * 1. Frosted cards. A page's cards show a soft copy of the colour field behind them, as frosted glass would, without a
 *    backdrop blur: real blur under scrolling cards cost a third of the frame rate at the phone's 3.75 dpr. Each tab's field
 *    holds still (every background but Classic's sway and Orb light's moving glows), so its picture is copied once, small
 *    (1/3 of the screen) and soft, with the look's own frost baked in, into a tiny picture per tab. Every card holds a tiny
 *    canvas the size of the screen, drawn from it, that stays put on the screen while the card scrolls: a scroll-driven
 *    `transform` (styles.css `.frost`), which the compositor runs. Nothing is blurred per frame. The canvases are made with
 *    their cards (when a page is built), never added or dropped at the end of an animation; a tab's picture only draws into
 *    them, and they fade in.
 *
 * 2. The colour behind. The field's hue (its most colourful part wins: a chroma-weighted average in OKLab) is written on
 *    the root as --bh-h, with how deep and how coloured the sheets' glass should be (--bh-sl, --bh-sc), for the tab on show.
 *    The sheets take that colour instead of the palette's, so Golden hour on a blue morning sky gets blue glass, not brown.
 */
// the frost picture's scale: 1 pixel for 3 css px (at 6 each pixel was stretched over ~22 of the phone's, and its soft
// gradients showed as steps behind the cards: Omar's banding, judge 26 Oct)
const SC = 3;
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
const RECIPE: Record<string, string> = { a: 'blur(8px) saturate(1.35)', b: 'blur(8px) saturate(1.9) brightness(0.94)', c: 'blur(8px) saturate(1.9) brightness(0.94)' };
/** the copy with its frost, then (J) a wide soft copy over it: frost scatters a glow's light, so the colour reaches the cards
 * near it graded, fading away from it (judge 26 Oct) */
function bake(o: CanvasRenderingContext2D, raw: HTMLCanvasElement, rec: string, w: number, h: number) {
  o.filter = rec; o.drawImage(raw, 0, 0);
  if (look() === 'a' && (root().dataset.cards ?? 'between') === 'between') { o.globalAlpha = 0.35; o.filter = 'blur(32px) saturate(1.35)'; o.drawImage(raw, 0, 0); o.globalAlpha = 1; }
  o.filter = 'none'; tame(o, w, h);
}

function paint(cv: HTMLCanvasElement) {
  const hue = hueOf(cv), made = pics.get(hue), last = made ? undefined : keptFor(hue);
  const src = RECIPE[look()] ? made ?? last : undefined;
  const g = cv.getContext('2d'); if (!g) return;
  const prev = cv.previousElementSibling instanceof HTMLCanvasElement ? cv.previousElementSibling : null;
  if (!src) { // (fades out over the last picture; the card shows its plain glass, and the one under goes once it has)
    const clear = () => { if (!cv.dataset.on) prev?.getContext('2d')?.clearRect(0, 0, prev.width, prev.height); };
    if (prev && parseFloat(getComputedStyle(cv).opacity) > 0) cv.addEventListener('transitionend', clear, { once: true }); else clear();
    cv.dataset.on = ''; return;
  }
  // a new picture over one on show (the sun moved when food was logged, a copy once more): the old one stays under it and
  // the new one fades in over it, never a jump (judge 26 Oct)
  if (prev && cv.dataset.on === '1' && !cv.dataset.now) {
    if (prev.width !== cv.width || prev.height !== cv.height) { prev.width = cv.width; prev.height = cv.height; }
    const pg = prev.getContext('2d');
    if (pg) {
      // (one coming in the middle of a fade: the one under takes what is on screen now, the last one partly faded in)
      const op = cv.dataset.swap ? 0 : parseFloat(getComputedStyle(cv).opacity);
      if (op >= 0.999) { pg.clearRect(0, 0, prev.width, prev.height); pg.drawImage(cv, 0, 0); }
      else if (op > 0) { pg.globalAlpha = op; pg.drawImage(cv, 0, 0); pg.globalAlpha = 1; }
      // (slow and even, 1.6 s: the usual fade did most of its change in the first quarter of a second, judge 26 Oct)
      cv.dataset.fading = ''; cv.addEventListener('transitionend', () => { if (!cv.dataset.swap) delete cv.dataset.fading; }, { once: true });
      cv.dataset.swap = '1'; requestAnimationFrame(() => requestAnimationFrame(() => delete cv.dataset.swap));
    }
  }
  // the picture kept from the last visit, on a fresh start: there at once, no fade from the plain glass (Omar 25 Oct: the
  // cards opened clear and then faded into his colours)
  if (last && cv.dataset.on !== '1') { cv.dataset.now = '1'; requestAnimationFrame(() => requestAnimationFrame(() => delete cv.dataset.now)); }
  if (cv.width !== src.width || cv.height !== src.height) { cv.width = src.width; cv.height = src.height; }
  g.clearRect(0, 0, cv.width, cv.height); g.drawImage(src, 0, 0);
  cv.dataset.on = '1';
  const wrap = cv.closest<HTMLElement>('.frost'), [grain, sheen] = grainFor(src);
  wrap?.style.setProperty('--frost-grain', grain); wrap?.parentElement?.style.setProperty('--frost-sheen', sheen);
}

/** the glass's grain, even on every card: white dots at one strength show more on dark glass (a near-black card read sandy,
 *  judge 25 Oct), so a dark picture gets fewer of them */
const grains = new WeakMap<HTMLCanvasElement, [string, string]>();
/** and the card's sheen (surfaces.css): less of it over a near-black picture, where it lifted the glass into a slate panel */
function grainFor(src: HTMLCanvasElement): [string, string] {
  let v = grains.get(src); if (v) return v;
  let s = 0, k = 0;
  try {
    const d = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
    for (let i = 0; i < d.length; i += 16) { s += lab(d[i], d[i + 1], d[i + 2])[0]; k++; }
  } catch { /* (no pixels to read: the usual strength) */ }
  const L = k ? s / k : 0.3;
  v = [(0.03 * Math.max(0.55, 1 - 0.6 * Math.max(0, 1 - L / 0.3))).toFixed(4), (0.035 * (0.6 + 0.4 * smooth(0.12, 0.25, L))).toFixed(4)];
  grains.set(src, v);
  return v;
}

// ---- each tab's picture kept on the phone (localStorage, small WebPs), so the next start shows the cards' colours from the
// first frame instead of fading them in once the field is painted. Keyed by everything that shapes it; a stale one is
// never shown, and the fresh copy replaces it as soon as it is made.
const KEEP = 'aven.frost';
const kept = new Map<string, HTMLCanvasElement>();
const keyOf = (hue: string) => { const { w, h } = size(); return `${stamp()}|${root().dataset.cards ?? ''}|${w}x${h}|${hue}`; };
const toKeep = new Map<string, string>();
const keptFor = (hue: string) => kept.get(keyOf(hue)) ?? kept.get(keyOf('*'));
function loadKept() {
  let o: Record<string, string>; try { o = JSON.parse(localStorage.getItem(KEEP) ?? '{}'); } catch { return; }
  for (const [k, url] of Object.entries(o)) {
    if (typeof url !== 'string' || !/^data:image\/(png|webp)/.test(url)) continue;
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      c.getContext('2d')?.drawImage(im, 0, 0); kept.set(k, c);
      for (const cv of live) if (cv.isConnected && !cv.dataset.on) paint(cv);
    };
    im.src = url;
    toKeep.set(k, url); // (kept again with the next copy: otherwise the first copy after a start dropped the other tabs')
  }
}
let keepAt = 0;
function keep(hue: string, pic: HTMLCanvasElement) {
  const at = stamp();
  for (const k of toKeep.keys()) if (!k.startsWith(at + '|')) toKeep.delete(k); // (only the colours now in use)
  // (WebP: the finer picture as a PNG took four times the room, next to his workouts in the same storage)
  try { toKeep.set(keyOf(hue), pic.toDataURL('image/webp', 0.9)); } catch { return; }
  clearTimeout(keepAt); keepAt = window.setTimeout(() => { try { localStorage.setItem(KEEP, JSON.stringify(Object.fromEntries(toKeep))); } catch { /* full: next start fades in as before */ } }, 1500);
}

const imgs = new Map<string, HTMLImageElement>();
/** a moving part's own picture (SelfGlow's --glow-img), loaded; null until it is */
function partImage(el: HTMLElement): HTMLImageElement | null {
  const m = /url\("?([^")]+)"?\)/.exec(el.style.getPropertyValue('--glow-img')); if (!m) return null;
  let im = imgs.get(m[1]);
  if (!im) { im = new Image(); im.src = m[1]; imgs.set(m[1], im); im.onload = () => { const f = lastField; if (f) frostFromField(f); }; }
  return im.complete && im.naturalWidth ? im : null;
}

/** a moving glow (Sunrise's sun) has its own picture in, ready to copy (one at no opacity needs none) */
const sunIn = (field: HTMLElement) => [...field.querySelectorAll<HTMLElement>('.bg-sun')]
  .every((el) => !(parseFloat(getComputedStyle(el).opacity) > 0) || (el.hasAttribute('data-dith-img') && !!partImage(el)));
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
export function frostFromField(field: HTMLElement, everyTab = false, last = false) {
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
    // (and as soon as a moving glow's own picture comes in or changes, Glows.tsx `glowimg`: until then the page shows it drawn
    // by CSS, which the copy can't read)
    let soon = 0;
    field.addEventListener('glowimg', () => { cancelAnimationFrame(soon); soon = requestAnimationFrame(() => { if (field.isConnected) frostFromField(field); }); });
  }
  // (once more, not again and again: each copy scheduled the next, so the copy ran every 2.8 s for as long as the app was open)
  if (!last) { clearTimeout(againAt); againAt = window.setTimeout(() => { if (field.isConnected) frostFromField(field, false, true); }, 2800); }
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
  // (a copy without the sun read as brown cards that then changed: until its picture is in, the cards keep what they show)
  if (!sunIn(field)) return;
  // Classic sways and Orb light's glows move: their cards keep the plain glass (a still copy would slide off them)
  const moves = root().dataset.motion !== 'reduce' && (field.classList.contains('aurora') || root().dataset.bg === 'orb');
  const rec = recipe();
  if (moves || !rec) { pics.delete(hue); repaint(hue); return; }
  const out = pics.get(hue) ?? document.createElement('canvas');
  out.width = w; out.height = h;
  const o = out.getContext('2d'); if (!o) return;
  bake(o, raw, rec, w, h);
  pics.set(hue, out); keep(everyTab ? '*' : hue, out);
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
  // (nor with a sun: this picture has none, so its cards read brown and then changed; they wait for their own field)
  if (moves || !rec || f.querySelector('.bg-sun')) return;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const o = out.getContext('2d'); if (!o) return;
  bake(o, raw, rec, w, h);
  pics.set(hue, out); keep(hue, out); repaint(hue);
}
export const frostStamp = stamp;


// ---- busy and solid backgrounds (options on trial, `data-cards`): the copy tamed where it is too much, left alone where it
// is calm (Champagne on Mesh, the dark backgrounds), in OKLab
const toLin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = (v: number) => 255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
// to whole levels with a level of triangular noise: the picture is small and scaled up 6 times, so a plain rounding drew
// its soft gradients as wide flat steps (staircase bands, judge 25 Oct). Done once per picture, nothing per frame.
const q = (v: number) => Math.min(255, Math.max(0, Math.round(v + Math.random() - Math.random())));
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
  const M = root().dataset.cards ?? 'between'; // Cards on trial (Settings): blue E, sapphire F, clear G, plum A
  let im: ImageData; try { im = o.getImageData(0, 0, w, h); } catch { return; }
  const d = im.data, n = d.length / 4;
  const px = new Float32Array(n * 3);
  let sL = 0, sL2 = 0, sC = 0, gx = 0, gy = 0, gw = 0, hA = 0, hB = 0, cMax = 0;
  for (let i = 0; i < n; i++) {
    const [L, A, B] = lab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); px[i * 3] = L; px[i * 3 + 1] = A; px[i * 3 + 2] = B;
    const C = Math.hypot(A, B); sL += L; sL2 += L * L; sC += C; hA += A * C; hB += B * C; if (C > cMax) cMax = C;
    const wt = (L + C) ** 6; gx += (i % w) * wt; gy += Math.floor(i / w) * wt; gw += wt;
  }
  const mL = sL / n, mC = sC / n, sd = Math.sqrt(Math.max(0, sL2 / n - mL * mL));
  // how much this background needs it: 0 for calm ones (Champagne on Mesh, the dots: mean chroma under .03), up to 1 for the
  // loud ones (Mesh on Golden hour or Sunset, Colour per tab, Time of day) and for an even slab of colour (Night sky)
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const g = Math.max(clamp((mC - 0.03) / 0.03), clamp((0.055 - sd) / 0.02) * clamp((mC - 0.025) / 0.01));
  if (g <= 0) { for (let i = 0; i < d.length; i++) if ((i & 3) !== 3) d[i] = q(d[i]); o.putImageData(im, 0, 0); return; }
  const mix = (x: number, y: number) => x + (y - x) * g;
  const hue = Math.atan2(hB, hA); // the page's own colour (its most colourful parts win)
  const cx = gx / gw, cy = gy / gw, R = Math.hypot(w, h) * 0.32; // the brightest glow, and how far its light reaches
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let L = px[i * 3], A = px[i * 3 + 1], B = px[i * 3 + 2];
    let C = Math.hypot(A, B), H = Math.atan2(B, A);
    const r = Math.hypot((i % w) - cx, Math.floor(i / w) - cy) / R, near = Math.exp(-r * r); // 1 at the glow, 0 far from it
    { // like Champagne on Mesh: dark glass, one soft glow coming through (Omar's pick 25 Oct, option 5)
      const k = Math.max(0.6, Math.min(1, 0.26 / mL) * (0.62 + 0.38 * near)); // never below 60 %: smoked glass, not a hole
      L *= mix(1, k); C *= mix(1, Math.sqrt(k)); // the colour kept richer than the light, so dark orange doesn't turn brown
      // every switch below fades in over a range (a hard step drew a jagged band on Time of day, judge r4)
      const deg = (H * 180) / Math.PI, step = (x: number, a: number, b: number) => clamp((x - a) / (b - a));
      const cool = step(deg, -135, -120) * step(-deg, 25, 40); // violet and blue light: a slab, never the glow
      const kL = 0.24 - 0.08 * cool, kC = 0.08 - 0.03 * cool; // (the violet top card on Colour per tab stayed bright, judge r3)
      if (L > kL) L = mix(L, kL + (L - kL) * (0.45 - 0.15 * cool)); // a bright slab is toned down too
      if (C > kC) C = mix(C, kC + (C - kC) * (0.4 - 0.1 * cool));
      if (L < 0.17) L = mix(L, 0.17 - (0.17 - L) * 0.55); // the darkest glass keeps some of its colour's light, never a hole
      // dark orange leans to wine (not rust or chocolate), navy to plum
      const warm = step(deg, 25, 35) * step(-deg, -88, -78) * step(-L, -0.48, -0.4);
      H += ((12 - deg) * Math.PI / 180) * 0.75 * g * warm;
      // navy leaned to plum in A; E, F and G keep the page's own blue
      if (M === 'plum') H += ((-35 - deg) * Math.PI / 180) * 0.6 * g * step(deg, -135, -125) * step(-deg, 55, 65);
      if (M === 'sapphire') C = mix(C, Math.min(C * 1.35, 0.11) * cool + C * (1 - cool)); // richer blue
      if (M === 'clear') { C *= mix(1, 0.45); L = mix(L, Math.min(L, 0.22 + (L - 0.22) * 0.5)); } // almost no colour
      // H and I: part of the way back to the clear glass Omar saw on launch (the page straight through, before the copy faded in)
      const back = M === 'mix' ? 0.5 : M === 'between' ? 0.62 : M === 'light' ? 0.75 : 0;
      if (back) { const L0 = px[i * 3], C0 = Math.hypot(px[i * 3 + 1], px[i * 3 + 2]); L += (L0 - L) * back; C += (C0 - C) * back; }
      if (M === 'between') { // J: frosted, not smoked or grey (judge 25 Oct): a veil of the colour's own light that never lifts the
        // glass above the page under it (a lifted card on a dark page read as grey plastic), no near black where the page
        // isn't, and never colourless: a grey part leans to the page's own colour (teal on Colour per tab, rose on Sunset)
        const L0 = px[i * 3];
        L += (0.7 - L) * 0.13; if (mC >= 0.05) C *= 0.96;
        L = Math.min(L, L0 + (L0 < 0.2 ? 0.04 : 0.025)); // (a little more light over a near-black page: not navy-black)
        // the darkest glass leans to the page's own colour too (the teal of Colour per tab, not the navy under one card): only
        // from a neighbouring colour, as an angle (from far away the turn went through colours a near-black can't show: grey, judge r5)
        let dh = hue - H; dh -= Math.round(dh / (2 * Math.PI)) * 2 * Math.PI;
        const near2 = step(-Math.abs(dh), -Math.PI / 2, -Math.PI * 5 / 18); // all of it within 50°, none past 90°
        if (L0 < 0.2) H += dh * 0.5 * (1 - L0 / 0.2) * near2;
        // the floor: the card's fill over it takes some colour away, and mauve and pink lose the most (Sunset, judge r4)
        const hd = (H * 180) / Math.PI, fC = 0.05 + 0.012 * step(hd, -55, -45) * step(-hd, 0, 10);
        if (C < fC) { let dt = hue - H; dt -= Math.round(dt / (2 * Math.PI)) * 2 * Math.PI; H += dt * (1 - C / fC); C = Math.min(fC, cMax); }
        // last, and always winning: the glass stays close to the page under it, so it shows the page instead of sitting on it.
        // Over a near-black page a lifted, coloured card read as a wine, navy or petrol slab, and the floors and leans before
        // this squashed the page's gradient into flat steps (judge 26 Oct); the card's own sheen (surfaces.css) keeps it glass
        const C0 = Math.hypot(px[i * 3 + 1], px[i * 3 + 2]), H0 = Math.atan2(px[i * 3 + 2], px[i * 3 + 1]), h0 = (H0 * 180) / Math.PI;
        L = Math.min(L0 + 0.01 + 0.02 * smooth(0.12, 0.22, L0), Math.max(L0 - 0.02, L)); // (darker than the page, red glass read
        // brown; lighter over black, a slate panel)
        const green = step(h0, 110, 120) * step(-h0, -170, -160); // (saturate lifts greens: Forest's cards went lime)
        // (every limit fades in over a range: an on/off one drew a jagged line across the Train cards, judge 26 Oct)
        const lift = smooth(0.12, 0.24, L0); // no colour added over black, so dark navy keeps its own blue
        C = Math.min(C0 + (0.012 * (1 - green) + 0.05 * C0 * green) * lift, Math.max(0.95 * C0, C));
        const m = Math.PI / 15 + (Math.PI * 14 / 15) * (1 - smooth(0.008, 0.03, C0)); // ±12°, free only where the page has no colour
        { let dt = H - H0; dt -= Math.round(dt / (2 * Math.PI)) * 2 * Math.PI; H = H0 + Math.min(m, Math.max(-m, dt)); }
      }
    }
    out[i * 3] = L; out[i * 3 + 1] = C; out[i * 3 + 2] = H;
  }
  for (let i = 0; i < n; i++) {
    const L = out[i * 3], C = out[i * 3 + 1], H = out[i * 3 + 2];
    const [rr, gg, bb] = rgb(L, C * Math.cos(H), C * Math.sin(H)); d[i * 4] = q(rr); d[i * 4 + 1] = q(gg); d[i * 4 + 2] = q(bb);
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
  // (and one under it, holding the last picture while a new one fades in over it: made with the card, never added later)
  const prev = document.createElement('canvas'); prev.className = 'prev'; prev.width = w; prev.height = h;
  hold.appendChild(prev); hold.appendChild(cv); wrap.appendChild(hold); card.appendChild(wrap);
  place(card, wrap); watch(card);
  live.add(cv); paint(cv);
}

let started = false;
export function startFrost() {
  if (started || typeof document === 'undefined') return; started = true;
  const r = root();
  loadKept();
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
    .observe(r, { attributes: true, attributeFilter: ['data-look', 'data-cards'] });
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
