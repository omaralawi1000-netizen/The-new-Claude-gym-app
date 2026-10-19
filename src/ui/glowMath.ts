import type { GlowLayer } from './glow';

/** A gradient's colours along its line, worked out once (N steps, in between mixed linearly): shared by the worker's
 * dithered picture and the quick one drawn at once in glow.ts. */
export const N = 1024;
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
export function table(L: GlowLayer): { lut: Float32Array; t0: number; t1: number } {
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

