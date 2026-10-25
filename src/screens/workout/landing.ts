/**
 * The workout window's way home (round 7): one thing leads the eye, as the album art does in a music player's mini player.
 * Here that is the workout's clock: closing, it lifts off the window's header and flies into Today's card, growing into the
 * card's big clock; opening, it flies back up into the header. The window around it grows or shrinks as before (Active.tsx),
 * and the card's other words arrive after it, one after another.
 *
 * Three ways to do it, picked with localStorage `aven.wkLand` (B, Catch, is the default: the one Omar's phone runs):
 *   A  Glide  the window lands, then the clock settles into its place a beat later, then the card's details arrive.
 *   B  Catch  the window comes down with its speed and the card catches it: a small dip and rebound, the clock riding it.
 *   C  Lead   the clock goes first and waits in its place; the window follows it home and closes round it.
 *   D  Live   Catch, with the workout's own page in the window all the way (design A, 19 Oct): the card's words go
 *             at once and the page is there under them, its header riding the top edge and the list uncovered by the
 *             bottom one; closing, the page stays until the window is nearly home, then the card's look comes back.
 *
 * Everything here is transform and opacity on small layers, sampled at 120 Hz and run by the browser. The clock's copies
 * are drawn at their largest size (the card's clock at scale 1), so the copy that lands is sharp and is the card's clock
 * pixel for pixel; the real clock takes over in that frame.
 */
import { apple, BOUNCY, SMOOTH, springCurve, springSamples, type Spring } from '../../ui/motion';

export type Land = 'A' | 'B' | 'C' | 'D';
/** B and D land the same way (the card catches the window); D shows the workout's page through the whole flight. */
export const catches = (l: Land) => l === 'B' || l === 'D';
export function landStyle(): Land {
  try { const v = localStorage.getItem('aven.wkLand'); return v === 'A' || v === 'C' || v === 'D' ? v : 'B'; } catch { return 'B'; }
}

/** The springs of each way: the window's own (`win`, null: Active's usual one) and the clock's (`hero`, null: it rides the window). */
export const LANDS: Record<Land, { closeWin: Spring | null; openWin: Spring | null; closeHero: Spring | null; openHero: Spring | null }> = {
  A: { closeWin: null, openWin: null, closeHero: apple(0.6, 0.14), openHero: apple(0.46, 0.08) },
  B: { closeWin: apple(0.62, 0.26), openWin: apple(0.56, 0.1), closeHero: null, openHero: null },
  C: { closeWin: apple(0.8), openWin: null, closeHero: apple(0.38, 0.18), openHero: apple(0.34, 0.14) },
  // (D opens without the bounce: its 1-3 px overshoot sat above home for a third of a second, round 2 judge. Round 5: one
  // calm spring both ways, no bounce, its tail eased to a stop (Active.tsx `landed`): open at rest in about 0.78 s, the last
  // screen pixel in nine frames (r4: 0.96 s, the last 5 px in forty); closing it no longer dips into the card and creeps back)
  D: { closeWin: apple(0.72, 0), openWin: apple(0.8, 0), closeHero: null, openHero: null },
};

type Pt = { x: number; y: number };
/**
 * Where a word sits on the screen: its baseline (`y`), across either the left edge of its ink (`left`, a name: left-aligned
 * in every place) or the middle of its ink (a clock), and its cap height (`f`, in the word's own px, whatever scale it is
 * drawn at): an H for a name, a 0 for a clock. Lined up by baseline and cap height, two looks of a word in different fonts
 * stand on the same line at the same size.
 */
export type Anchor = Pt & { f: number };
let pen: CanvasRenderingContext2D | null = null;
const penFor = (cs: CSSStyleDeclaration) => {
  pen ??= document.createElement('canvas').getContext('2d');
  if (!pen) return null;
  pen.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  try { pen.letterSpacing = '0px'; } catch { /* older engines */ }
  return pen;
};
/** One letter of a word as it is laid out (own px, from the word's box): where its line box starts and how tall it is (so a
 * copy draws it on exactly the same baseline), where its pen starts, and its ink: middle and height. */
type Glyph = { ch: string; x: number; top: number; lh: number; cx: number; cy: number; h: number };
type Look = { glyphs: Glyph[]; cap: number; ax: number; ay: number; w0: number; h0: number; weight: number };
/**
 * A word's letters exactly as the page lays them out (kerning, letter spacing and all), each measured by its own range, with
 * each letter's ink from the font. `left`: the anchor is the ink's left edge, else its middle.
 */
function lookOf(el: Element, left: boolean): Look | null {
  const cs = getComputedStyle(el), p = penFor(cs);
  const r = el.getBoundingClientRect(), w0 = (el as HTMLElement).offsetWidth || r.width, h0 = (el as HTMLElement).offsetHeight || r.height;
  if (!p || !r.width || !w0) return null;
  const sc = r.width / w0;
  const all = p.measureText((el.textContent ?? '') || 'H'), fa = all.fontBoundingBoxAscent, fd = all.fontBoundingBoxDescent;
  if (!(fa + fd > 0)) return null;
  const digits = /^[\d:.,\s]+$/.test(el.textContent ?? '');
  const cap = p.measureText(digits ? '0' : 'H').actualBoundingBoxAscent || parseFloat(cs.fontSize) * 0.7;
  const glyphs: Glyph[] = [], range = document.createRange();
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const s = n.textContent ?? ''; let i = 0;
    for (const ch of s) {
      range.setStart(n, i); range.setEnd(n, i + ch.length); i += ch.length;
      const b = range.getBoundingClientRect();
      if (!b.height) continue;
      const m = p.measureText(ch), x = (b.left - r.left) / sc, top = (b.top - r.top) / sc, lh = b.height / sc;
      const base = top + fa * (lh / (fa + fd)), a = m.actualBoundingBoxAscent, d = m.actualBoundingBoxDescent;
      const ink = a + d > 0 && /\S/.test(ch);
      glyphs.push({ ch, x, top, lh, cx: ink ? x + (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 : x + b.width / sc / 2, cy: ink ? base + (d - a) / 2 : base - cap / 2, h: ink ? a + d : 0 });
    }
  }
  const inked = glyphs.filter((g) => g.h > 0);
  if (!inked.length) return null;
  const f0 = inked[0], f1 = inked[inked.length - 1];
  const m0 = p.measureText(f0.ch), m1 = p.measureText(f1.ch);
  const l = f0.x - m0.actualBoundingBoxLeft, rr = f1.x + m1.actualBoundingBoxRight;
  const ay = f0.top + fa * (f0.lh / (fa + fd));
  return { glyphs, cap, ax: left ? l : (l + rr) / 2, ay, w0, h0, weight: parseFloat(cs.fontWeight) || 400 };
}
/** (`left`: lined up by the ink's left edge instead of its middle: a name, left-aligned in both places) */
export function anchorOf(el: Element, left = false): Anchor | null {
  const k = lookOf(el, left); if (!k) return null;
  const r = el.getBoundingClientRect(), sc = r.width / k.w0;
  return { x: r.left + k.ax * sc, y: r.top + k.ay * sc, f: k.cap };
}

/** A copy of a word, drawn exactly as it is at rest (its own font, colour and size, each letter where the page puts it),
 * placed so that untransformed its anchor is at `a`; each letter on a span of its own, sized about its ink. */
function copyLook(el: HTMLElement, k: Look, host: HTMLElement, a: Anchor) {
  const cs = getComputedStyle(el), h = host.getBoundingClientRect();
  const c = document.createElement('div');
  const props = ['font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-variation-settings', 'font-optical-sizing', 'font-feature-settings', 'font-variant-numeric', 'font-kerning', 'color', 'text-rendering', '-webkit-font-smoothing'];
  for (const p of props) c.style.setProperty(p, cs.getPropertyValue(p));
  Object.assign(c.style, { position: 'absolute', left: `${a.x - k.ax - h.left}px`, top: `${a.y - k.ay - h.top}px`, width: `${k.w0}px`, height: `${k.h0}px`, margin: '0', padding: '0', whiteSpace: 'pre', letterSpacing: '0px', transformOrigin: `${k.ax}px ${k.ay}px`, pointerEvents: 'none' });
  for (const g of k.glyphs) {
    const s = document.createElement('span'); s.textContent = g.ch;
    Object.assign(s.style, { position: 'absolute', left: `${g.x}px`, top: `${g.top}px`, height: `${g.lh}px`, lineHeight: `${g.lh}px`, whiteSpace: 'pre', transformOrigin: `${g.cx - g.x}px ${g.cy - g.top}px` });
    c.appendChild(s);
  }
  host.appendChild(c);
  return { c, spans: [...c.children] as HTMLElement[] };
}
const smooth = (u: number) => { const v = Math.min(1, Math.max(0, u)); return v * v * (3 - 2 * v); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The flight of a word (the clock, the name). `src`/`dst`: where it is at each frame (`i`, 1/120 s from the start) as it
 * leaves and where it is going (either may move: the window's header moves with the window), with the scale the window
 * gives it there. `w`: how far along the flight is at frame i (0 leaving, 1 home).
 */
export type Flight = {
  frames: number;
  w: (i: number) => number;
  src: (i: number) => Anchor & { s: number };
  dst: (i: number) => Anchor & { s: number };
};
export type Hero = { look0: HTMLElement; look1: HTMLElement; anims: Animation[]; done: Promise<void>; text: (s: string) => void; drop: () => void };

/**
 * One word in flight (round 6: ONE face from end to end). The word is set in the same face in every place it lives (the
 * name in the italic serif, the clock in one weight of the sans), so it only moves and changes size: it never changes
 * style on the way. Two copies of it travel together, each drawn at its own resting size and colour (so the one it leaves
 * is the real word pixel for pixel at the start, and the one it lands as is at the end), with every letter of both on
 * the same box at every frame (the letters' spacing glides from one place's to the other's). The landing copy comes up
 * over the leaving one, which stays whole under it until it is fully there (so the word never thins), and only then goes:
 * the two are the same shapes on the same spots, so what changes is at most the colour (the resume bar's grey clock
 * becoming the header's white one). `cross`: where along the flight (in `w`) that happens, over fourteen frames or more.
 */
export function flyHero(host: HTMLElement, from: HTMLElement, to: HTMLElement, a0: Anchor, a1: Anchor, fl: Flight, skip = 0, cut = false, cross: [number, number] = [0.4, 0.6], left = false): Hero {
  const k0 = lookOf(from, left), k1 = lookOf(to, left);
  const n = fl.frames;
  const anims: Animation[] = [];
  const empty = () => { const d = document.createElement('div'); host.appendChild(d); return d; };
  if (!k0 || !k1) { const l0 = empty(), l1 = empty(); return { look0: l0, look1: l1, anims, done: Promise.resolve(), text: () => {}, drop: () => { l0.remove(); l1.remove(); } }; }
  const L0 = copyLook(from, k0, host, a0), L1 = copyLook(to, k1, host, a1);
  const look0 = L0.c, look1 = L1.c;
  // the hand-over in frames: where `cross` puts it along the flight, never fewer than fourteen
  const at = (t: number) => { let i = 0; while (i < n && Math.min(1, fl.w(i)) < t) i++; return i; };
  let ia = at(cross[0]), ib = at(cross[1]);
  if (ib - ia < 14) { const mid = (ia + ib) / 2; ia = Math.round(mid - 7); ib = ia + 14; }
  if (ib > n) { ia -= ib - n; ib = n; }
  if (ia < 0) { ib = Math.min(n, ib - ia); ia = 0; }
  // letters in cap heights from the anchor
  const unit = (k: Look, g: Glyph) => ({ cx: (g.cx - k.ax) / k.cap, cy: (g.cy - k.ay) / k.cap, h: g.h / k.cap });
  const pairs = k0.glyphs.length === k1.glyphs.length;
  const U0 = k0.glyphs.map((g) => unit(k0, g)), U1 = k1.glyphs.map((g) => unit(k1, g));
  const fr0: Keyframe[] = [], fr1: Keyframe[] = [];
  const gk0: Keyframe[][] = k0.glyphs.map(() => []), gk1: Keyframe[][] = k1.glyphs.map(() => []);
  let gone0 = -1;
  for (let i = 0; i <= n; i++) {
    const w = fl.w(i), wc = Math.min(1, Math.max(0, w));
    const s = fl.src(i), d = fl.dst(i);
    const x = lerp(s.x, d.x, w), y = lerp(s.y, d.y, w);
    const F = Math.exp(lerp(Math.log(s.f * s.s), Math.log(d.f * d.s), wc)); // the drawn cap height (it grows evenly to the eye)
    const o1 = cut ? (i > 0 ? 1 : 0) : smooth((i - ia) / Math.max(1, ib - ia));
    const live0 = gone0 < 0;
    fr1.push({ transform: `translate(${(x - a1.x).toFixed(3)}px, ${(y - a1.y).toFixed(3)}px) scale(${(F / k1.cap).toFixed(5)})`, opacity: o1.toFixed(4) });
    if (live0) fr0.push({ transform: `translate(${(x - a0.x).toFixed(3)}px, ${(y - a0.y).toFixed(3)}px) scale(${(F / k0.cap).toFixed(5)})`, opacity: o1 >= 1 ? '0' : '1' });
    if (pairs) {
      k0.glyphs.forEach((_, j) => {
        const u0 = U0[j], u1 = U1[j];
        const B = { cx: lerp(u0.cx, u1.cx, wc), cy: lerp(u0.cy, u1.cy, wc), h: lerp(u0.h, u1.h, wc) };
        const put = (k: Look, u: typeof u0) => {
          const sg = u.h > 0 && B.h > 0 ? B.h / u.h : 1, tx = (B.cx - u.cx) * k.cap, ty = (B.cy - u.cy) * k.cap;
          return { transform: Math.abs(tx) < 0.001 && Math.abs(ty) < 0.001 && Math.abs(sg - 1) < 1e-5 ? 'none' : `translate(${tx.toFixed(3)}px, ${ty.toFixed(3)}px) scale(${sg.toFixed(5)})` };
        };
        if (live0) gk0[j].push(put(k0, u0));
        gk1[j].push(put(k1, u1));
      });
    }
    if (live0 && o1 >= 1) gone0 = i;
  }
  // (the last frame exactly at rest: the real word takes over from it)
  if (Math.abs(fl.w(n) - 1) < 1e-6) fr1[n] = { transform: 'translate(0px, 0px) scale(1)', opacity: '1' };
  const late = -(Math.min(skip, n) * 1000) / 120; // (`skip`: frames of the flight already past when it is set off)
  const run = (el: Element, kf: Keyframe[]) => {
    if (kf.length < 2 || kf.every((f) => f.transform === kf[0].transform && f.opacity === kf[0].opacity)) { if (kf.length) Object.assign((el as HTMLElement).style, kf[kf.length - 1]); return; }
    anims.push(el.animate(kf, { duration: Math.max(1, ((kf.length - 1) * 1000) / 120), easing: 'linear', fill: 'both', delay: late }));
  };
  run(look1, fr1); run(look0, fr0);
  if (pairs) { L0.spans.forEach((g, j) => run(g, gk0[j])); L1.spans.forEach((g, j) => run(g, gk1[j])); }
  const done = anims[0] ? anims[0].finished.then(() => undefined, () => undefined) : Promise.resolve();
  // (a tick mid-flight: letter by letter, so each keeps its box)
  const say = (sp: HTMLElement[], t: string) => {
    const cs = [...t];
    if (sp.length === cs.length) cs.forEach((ch, j) => { if (sp[j].textContent !== ch) sp[j].textContent = ch; });
  };
  return {
    look0, look1, anims, done,
    text: (t: string) => { say(L0.spans, t); say(L1.spans, t); },
    drop: () => { for (const a of anims) { try { a.cancel(); } catch { /* ignore */ } } look0.remove(); look1.remove(); },
  };
}

/** A spring's progress, sampled at 120 Hz (the frames a flight is built on). */
export const samples = (sp: Spring, v0 = 0) => springSamples(sp, v0, true, 120).xs;

/** The card's details arriving once the window has landed: each rises a touch and fades in (the play button springs up). */
export function arrive(els: (HTMLElement | null | undefined)[], delays: number[]): Animation[] {
  const out: Animation[] = [];
  const soft = springCurve(SMOOTH, 0, true, 120), pop = springCurve(BOUNCY, 0, true, 120);
  els.forEach((el, i) => {
    if (!el) return;
    for (const a of el.getAnimations()) if ((a as Animation & { wkIn?: boolean }).wkIn) a.cancel();
    const big = el.dataset.wkIn === 'pop';
    // (no end keyframe: it lands on the element's own resting look and holds its layer, as every entrance here does)
    const a = el.animate(big ? [{ opacity: 0, transform: 'scale(0.78)', offset: 0 }, { opacity: 1, offset: 0.4 }] : [{ opacity: 0, transform: 'translateY(9px)', offset: 0 }, { opacity: 1, offset: 0.55 }],
      { duration: Math.max(380, (big ? pop : soft).duration), easing: (big ? pop : soft).easing, delay: delays[i] ?? 0, fill: 'both' });
    (a as Animation & { wkIn?: boolean }).wkIn = true;
    // (let go once landed: it ends on the element's own look, and its layer stays: will-change in styles.css)
    a.finished.then(() => a.cancel(), () => {});
    out.push(a);
  });
  return out;
}
