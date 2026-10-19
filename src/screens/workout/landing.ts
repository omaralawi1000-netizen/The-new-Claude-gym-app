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
  D: { closeWin: apple(0.62, 0.26), openWin: apple(0.56, 0.1), closeHero: null, openHero: null },
};

type Pt = { x: number; y: number };
/**
 * Where a clock's digits sit on the screen: the middle of their ink, and its height (in the clock's own px,
 * whatever scale it is drawn at). The ink, not the text's box: the window's clock (bold, small) and the card's (thin,
 * large) have different fonts' ascent and side bearings, so lined up by their boxes their digits sat a few px apart and
 * showed as two clocks while they crossed; lined up by their ink they lie over each other.
 */
export type Anchor = Pt & { f: number };
let pen: CanvasRenderingContext2D | null = null;
function inkOf(cs: CSSStyleDeclaration, text: string) {
  pen ??= document.createElement('canvas').getContext('2d');
  if (!pen || !text) return null;
  pen.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  try { pen.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing; } catch { /* older engines */ }
  const m = pen.measureText(text);
  const a = m.actualBoundingBoxAscent, d = m.actualBoundingBoxDescent, fa = m.fontBoundingBoxAscent, fd = m.fontBoundingBoxDescent;
  return a + d > 0 && fa + fd > 0 ? { l: m.actualBoundingBoxLeft, w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, a, d, fa, fd } : null;
}
/** (`left`: lined up by the ink's left edge instead of its middle: a name, left-aligned in both places, set in two fonts of
 * different widths, crosses without either end sticking out on the left) */
export function anchorOf(el: Element, left = false): Anchor | null {
  const r = document.createRange(); r.selectNodeContents(el);
  const b = r.getBoundingClientRect();
  if (!b.width || !b.height) return null;
  const cs = getComputedStyle(el), m = inkOf(cs, el.textContent ?? '');
  if (!m) return { x: b.left, y: b.top + b.height / 2, f: parseFloat(cs.fontSize) || 16 };
  // (the text's box is the font's ascent and descent tall: its baseline is that ascent down from its top, at the scale it is drawn)
  const k = b.height / (m.fa + m.fd), base = b.top + m.fa * k;
  // (the middle across too: the two clocks' digits are not equally wide, and lined up by the middle neither end sticks out far)
  return { x: b.left + ((left ? 0 : m.w / 2) - m.l) * k, y: base - ((m.a - m.d) / 2) * k, f: m.a + m.d };
}

/** A copy of a clock, drawn exactly as it is at rest (its own font, colour and size), with its digits' anchor at `a`. */
function copyClock(el: HTMLElement, host: HTMLElement, a: Anchor, left = false) {
  const cs = getComputedStyle(el);
  // where its digits sit inside it, in its own px (it may be drawn scaled right now: the window is small)
  const r = el.getBoundingClientRect(), now = anchorOf(el, left), h = host.getBoundingClientRect();
  const w0 = el.offsetWidth || r.width, h0 = el.offsetHeight || r.height, sc = r.width ? r.width / w0 : 1;
  const ox = now ? (now.x - r.left) / sc : 0, oy = now ? (now.y - r.top) / sc : h0 / 2;
  const c = document.createElement('div');
  c.textContent = el.textContent;
  const props = ['font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-variation-settings', 'font-feature-settings', 'font-variant-numeric', 'letter-spacing', 'line-height', 'color', 'text-rendering', '-webkit-font-smoothing'];
  for (const k of props) c.style.setProperty(k, cs.getPropertyValue(k));
  Object.assign(c.style, { position: 'absolute', left: `${a.x - ox - h.left}px`, top: `${a.y - oy - h.top}px`, minWidth: `${w0}px`, height: `${h0}px`, lineHeight: `${h0}px`, margin: '0', padding: '0', whiteSpace: 'nowrap', transformOrigin: `${ox}px ${oy}px`, pointerEvents: 'none' });
  host.appendChild(c);
  return c;
}

const smooth = (u: number) => { const v = Math.min(1, Math.max(0, u)); return v * v * (3 - 2 * v); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The clock's flight. `src`/`dst`: where the clock is at each frame (`i`, 1/120 s from the start) as it leaves and where it
 * is going (either may move: the window's header moves with the window), with the scale the window gives it there. `w`:
 * how far along the flight is at frame i (0 leaving, 1 home; past 1 is an overshoot of its position only).
 */
export type Flight = {
  frames: number;
  w: (i: number) => number;
  /** how far along it is sideways (default: a touch ahead of `w`, a gentle arc) */
  wx?: (i: number) => number;
  src: (i: number) => Anchor & { s: number };
  dst: (i: number) => Anchor & { s: number };
};
export type Hero = { look0: HTMLElement; look1: HTMLElement; anims: Animation[]; done: Promise<void>; text: (s: string) => void; drop: () => void };

/**
 * Two copies fly the same path: the clock it leaves (look0, its own font) and the clock it becomes (look1), crossing over
 * while still small. Each is drawn from its own resting size, so the one that lands is at scale 1.
 */
export function flyHero(host: HTMLElement, from: HTMLElement, to: HTMLElement, a0: Anchor, a1: Anchor, fl: Flight, skip = 0, cut = false, cross?: [number, number], left = false): Hero {
  const look0 = copyClock(from, host, a0, left);
  const look1 = copyClock(to, host, a1, left);
  const n = fl.frames;
  const crossLate = a0.f > a1.f; // it is flying from the big clock to the small one: it crosses as it arrives
  const k0: Keyframe[] = [], k1: Keyframe[] = [];
  let gone0 = -1;
  for (let i = 0; i <= n; i++) {
    const w = fl.w(i), wc = Math.min(1, Math.max(0, w));
    const s = fl.src(i), d = fl.dst(i);
    // the path: a gentle arc (it leaves a touch sideways first, then drops), its size grows evenly to the eye (geometric)
    const x = lerp(s.x, d.x, fl.wx ? fl.wx(i) : w <= 1 ? Math.pow(Math.max(0, w), 0.86) : w);
    const y = lerp(s.y, d.y, w);
    const f = Math.exp(lerp(Math.log(s.f * s.s), Math.log(d.f * d.s), wc)); // the drawn size (of the ink)
    // the crossing: near its small end (the window's clock), the two lined up by their ink over each other, so it reads
    // as the digits changing weight, not as two clocks; closing as it sets off; opening once it is about 1.2x the header's
    // and before the header's other words come in (the card's clock is wider: still on it then, it ran into the "sets")
    // (`cut`: the clock it becomes takes over in the first frame it moves, so the two are never seen together)
    // (`cross`: where along the flight the two cross, when the caller sets it: over five or six frames, never one or two)
    const o1 = cut ? (i > 0 ? 1 : 0) : cross ? smooth((wc - cross[0]) / (cross[1] - cross[0])) : crossLate ? smooth((wc - 0.78) / 0.12) : smooth((wc - 0.02) / 0.18), o0 = 1 - o1;
    const s1 = f / a1.f, s0 = f / a0.f;
    k1.push({ transform: `translate(${(x - a1.x).toFixed(2)}px, ${(y - a1.y).toFixed(2)}px) scale(${s1.toFixed(5)})`, opacity: String(Math.max(0.002, o1)) });
    if (gone0 < 0) {
      k0.push({ transform: `translate(${(x - a0.x).toFixed(2)}px, ${(y - a0.y).toFixed(2)}px) scale(${s0.toFixed(5)})`, opacity: String(Math.max(0, o0)) });
      if (o0 <= 0) gone0 = i;
    }
  }
  // (the last frame exactly at rest: the real clock takes over from it)
  if (Math.abs(fl.w(n) - 1) < 1e-6) k1[n] = { transform: 'translate(0px, 0px) scale(1)', opacity: '1' };
  const dur = (n * 1000) / 120;
  const anims: Animation[] = [];
  // (`skip`: frames of the flight already past when it is set off: it starts from there)
  const late = -(Math.min(skip, n) * 1000) / 120;
  anims.push(look1.animate(k1, { duration: dur, easing: 'linear', fill: 'both', delay: late }));
  const n0 = gone0 < 0 ? n : gone0;
  anims.push(look0.animate(k0, { duration: Math.max(1, (n0 * 1000) / 120), easing: 'linear', fill: 'both', delay: late }));
  const done = anims[0].finished.then(() => undefined, () => undefined);
  return {
    look0, look1, anims, done,
    text: (t: string) => { if (look0.textContent !== t) look0.textContent = t; if (look1.textContent !== t) look1.textContent = t; },
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
