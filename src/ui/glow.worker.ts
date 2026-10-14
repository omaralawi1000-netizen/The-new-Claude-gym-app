/// <reference lib="webworker" />
import type { GlowJob, GlowLayer, GlowSrc } from './glow';

/**
 * Paints soft glows (CSS gradients) into a picture with full precision and a dither, off the page. The phone draws a CSS
 * gradient in whole colour steps (0-255) without one, so a dim glow showed as rings, a little different for red, green and
 * blue (coloured rings). Here every pixel is worked out exactly and then rounded up or down at random in proportion to
 * what is left over, so each step dissolves into noise about one level strong and the eye only sees the smooth mean.
 */
declare const self: DedicatedWorkerGlobalScope;

let seed = 0x9e3779b9;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };

// ── a gradient's colours along its line, worked out once (N steps, in between mixed linearly) ──
const N = 1024;
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const gam = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
function toOklab(c: number[]): number[] {
  const r = lin(c[0] / 255), g = lin(c[1] / 255), b = lin(c[2] / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab(L: number, A: number, B: number): number[] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const f = (v: number) => Math.min(1, Math.max(0, gam(v))) * 255;
  return [f(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), f(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), f(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
/** premultiplied colour (0-255 × alpha) and alpha (0-1) at N points from t0 to t1 */
function table(L: GlowLayer): { lut: Float32Array; t0: number; t1: number } {
  const st = L.stops, t0 = Math.min(0, st[0].p), t1 = Math.max(1, st[st.length - 1].p, t0 + 1e-6);
  // CSS mixes gradient colours premultiplied: in sRGB for plain rgb() colours, in Oklab when any is a newer colour form
  const pre = st.map((s) => { const v = L.oklab ? toOklab(s.c) : [s.c[0], s.c[1], s.c[2]]; return [v[0] * s.c[3], v[1] * s.c[3], v[2] * s.c[3], s.c[3]]; });
  const lut = new Float32Array(N * 4);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const t = t0 + ((t1 - t0) * i) / (N - 1);
    while (j < st.length - 1 && st[j + 1].p <= t) j++;
    let v: number[];
    if (t <= st[0].p) v = pre[0];
    else if (j >= st.length - 1) v = pre[st.length - 1];
    else { const a = pre[j], b = pre[j + 1], d = st[j + 1].p - st[j].p, k = d > 0 ? (t - st[j].p) / d : 1; v = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k]; }
    const al = v[3];
    let rgb: number[];
    if (L.oklab) rgb = al > 0 ? fromOklab(v[0] / al, v[1] / al, v[2] / al).map((x) => x * al) : [0, 0, 0];
    else rgb = [v[0], v[1], v[2]];
    lut.set([rgb[0], rgb[1], rgb[2], al], i * 4);
  }
  return { lut, t0, t1 };
}

/** an element's own picture: its background colour under its gradients (and picture), premultiplied, in its box */
type Prep = { s: GlowSrc; tabs: { L: GlowLayer; lut: Float32Array; t0: number; k: number }[]; img: Uint8ClampedArray | null };

self.onmessage = (e: MessageEvent<{ id: number; job: GlowJob }>) => {
  const { id, job } = e.data;
  try {
    const { w, h, base, grain } = job, amp = job.sim ? 0 : job.amp;
    const prep = (s: GlowSrc): Prep => {
      let img: Uint8ClampedArray | null = null;
      if (s.img) {
        // a picture (the photo, the stars, the dots) laid out by the page and drawn here at the canvas's size
        const c = new OffscreenCanvas(w, h), x = c.getContext('2d')!;
        x.imageSmoothingQuality = 'high';
        x.drawImage(s.img.bm, s.img.x, s.img.y, s.img.w, s.img.h);
        img = x.getImageData(0, 0, w, h).data; s.img.bm.close();
      }
      return { s, img, tabs: s.layers.map((L) => { const t = table(L); return { L, lut: t.lut, t0: t.t0, k: (N - 1) / (t.t1 - t.t0) }; }) };
    };
    const under = job.srcs.map(prep), over = (job.top ?? []).map(prep);
    const d = new ImageData(w, h), px = d.data;
    const acc = new Float32Array(4);
    const paint = (P: Prep, x: number, y: number) => {
      const s = P.s, m = s.m;
      // this pixel's centre in the element's own CSS px
      const lx = m[0] * (x + 0.5) + m[2] * (y + 0.5) + m[4], ly = m[1] * (x + 0.5) + m[3] * (y + 0.5) + m[5];
      if (s.clip && (lx < 0 || ly < 0 || lx >= s.w || ly >= s.h)) return;
      let r = 0, g = 0, b = 0, a = 0;
      if (s.bg) { a = s.bg[3]; r = s.bg[0] * a; g = s.bg[1] * a; b = s.bg[2] * a; }
      if (P.img) {
        const i = (y * w + x) * 4, ia = P.img[i + 3] / 255, m1 = 1 - ia;
        r = P.img[i] * ia + r * m1; g = P.img[i + 1] * ia + g * m1; b = P.img[i + 2] * ia + b * m1; a = ia + a * m1;
      }
      for (const T of P.tabs) {
        const L = T.L, q = L.g;
        let t: number;
        if (L.k === 'r') { const dx = (lx - q[0]) / q[2], dy = (ly - q[1]) / q[3]; t = Math.sqrt(dx * dx + dy * dy); }
        else t = (lx - q[0]) * q[2] + (ly - q[1]) * q[3];
        let f = (t - T.t0) * T.k; if (f < 0) f = 0; else if (f > N - 1) f = N - 1;
        const i = f | 0, k = f - i, j = i < N - 1 ? i + 1 : i, u = T.lut, i4 = i * 4, j4 = j * 4;
        const la = u[i4 + 3] + (u[j4 + 3] - u[i4 + 3]) * k; if (la <= 0) continue;
        const m1 = 1 - la;
        r = u[i4] + (u[j4] - u[i4]) * k + r * m1; g = u[i4 + 1] + (u[j4 + 1] - u[i4 + 1]) * k + g * m1;
        b = u[i4 + 2] + (u[j4 + 2] - u[i4 + 2]) * k + b * m1; a = la + a * m1;
      }
      const op = s.op; r *= op; g *= op; b *= op; a *= op;
      const m1 = 1 - a;
      acc[0] = r + acc[0] * m1; acc[1] = g + acc[1] * m1; acc[2] = b + acc[2] * m1; acc[3] = a + acc[3] * m1;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        acc[0] = acc[1] = acc[2] = acc[3] = 0;
        for (const P of under) paint(P, x, y);
        // over the page's colour (an opaque picture)
        if (base) { const m1 = 1 - acc[3]; acc[0] += base[0] * m1; acc[1] += base[1] * m1; acc[2] += base[2] * m1; acc[3] = 1; }
        // (a check: the picture as the phone drew the CSS, rounded to whole steps before the grain went over it, no dither)
        if (job.sim) { acc[0] = Math.round(acc[0]); acc[1] = Math.round(acc[1]); acc[2] = Math.round(acc[2]); acc[3] = Math.round(acc[3] * 255) / 255; }
        if (grain && y >= grain.y0) {
          // the grain as lib/grain.ts makes it (white, at a random strength: the product of two randoms), laid on top
          const k = grain.g * rnd() * rnd(), m1 = 1 - k;
          acc[0] = 255 * k + acc[0] * m1; acc[1] = 255 * k + acc[1] * m1; acc[2] = 255 * k + acc[2] * m1; acc[3] = k + acc[3] * m1;
        }
        for (const P of over) paint(P, x, y);
        const i = (y * w + x) * 4;
        // triangular noise (the sum of two randoms): the mean stays exact, nothing is left of the steps
        if (base) {
          // an opaque picture (the clamped array rounds to the nearest whole level)
          px[i] = acc[0] + (rnd() + rnd() - 1) * amp;
          px[i + 1] = acc[1] + (rnd() + rnd() - 1) * amp;
          px[i + 2] = acc[2] + (rnd() + rnd() - 1) * amp;
          px[i + 3] = 255;
        } else {
          // a see-through picture: the canvas keeps colour premultiplied by alpha, so the dither is chosen in that form and
          // the colour handed over is picked to land on exactly it when the canvas multiplies it back
          if (acc[3] <= 0) continue; // nothing here (the array starts transparent)
          // The noise never reaches past what the pixel can hold (no alpha below 0, no colour beyond its alpha): cut off
          // there, it would shift the mean (near-transparent pixels came out a little dark). The colour is kept as it is
          // when the alpha is rounded, so the rounding only moves the pixel between its colour and what is under it.
          const A = acc[3] * 255, ea = Math.min(amp, A, 255 - A);
          const al = Math.min(255, Math.max(0, Math.round(A + (rnd() + rnd() - 1) * ea)));
          px[i + 3] = al;
          if (!al) continue;
          const k = al / A;
          for (let c = 0; c < 3; c++) {
            const P = acc[c] * k, e = Math.max(0, Math.min(amp, P, al - P));
            const pc = Math.min(al, Math.max(0, Math.round(P + (rnd() + rnd() - 1) * e)));
            px[i + c] = Math.round((pc * 255) / al);
          }
        }
      }
    }
    // willReadFrequently: the picture stays in memory, not on the graphics chip (it is kept to show again at once)
    const cv = new OffscreenCanvas(w, h), cx = cv.getContext('2d', { alpha: !base, willReadFrequently: true });
    if (!cx) throw new Error('no 2d');
    cx.putImageData(d, 0, 0);
    const bm = cv.transferToImageBitmap();
    self.postMessage({ id, bm }, [bm]);
  } catch { self.postMessage({ id, bm: null }); }
};
