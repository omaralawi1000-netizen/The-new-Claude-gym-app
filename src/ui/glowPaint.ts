import type { GlowJob, GlowLayer, GlowSrc } from './glow';
import { N, table } from './glowMath';

/**
 * Paints one glow picture with a dither: the worker (glow.worker.ts) paints with this ahead of time, and the page paints
 * with the very same code when it needs a picture at once and none is ready, so a picture painted either way is the same
 * picture (only the noise differs) and nothing ever changes on screen when one replaces the other.
 *
 * The soft parts (the gradients) are worked out exactly at every 4th pixel each way and mixed in between, which is all a
 * soft glow needs and sixteen times less work; a picture a source shows (a photo, the stars) is mixed in pixel by pixel.
 * Then the film grain (the CSS grain's own tile, where the CSS puts it) and one noise for all three colours, so the noise
 * is grey like the grain, not coloured. Where the picture is so flat that rounding gives one level all over, no noise is
 * added (a plain colour with noise on it is just noisier); where the grain is already strong enough to break the steps
 * up, only what is missing is added.
 */

/** a stored gradient's colours, ready to look up */
type Tab = { L: GlowLayer; lut: Float32Array; t0: number; k: number };
const tabsOf = (s: GlowSrc): Tab[] => s.layers.map((L) => { const t = table(L); return { L, lut: t.lut, t0: t.t0, k: (N - 1) / (t.t1 - t.t0) }; });

/** the grid's spacing in picture pixels */
const Q = 4;

/** Lays source `s` (at canvas point cx, cy; its picture's pixel `i` if it has one) over `acc` (premultiplied 0-255, alpha 0-1) */
function over(s: GlowSrc, tabs: Tab[], img: Uint8ClampedArray | null, i: number, cx: number, cy: number, acc: Float64Array) {
  const m = s.m;
  const lx = m[0] * cx + m[2] * cy + m[4], ly = m[1] * cx + m[3] * cy + m[5];
  if (s.clip && (lx < 0 || ly < 0 || lx >= s.w || ly >= s.h)) return;
  let r = 0, g = 0, b = 0, a = 0;
  if (s.bg) { a = s.bg[3]; r = s.bg[0] * a; g = s.bg[1] * a; b = s.bg[2] * a; }
  if (img) {
    const ia = img[i + 3] / 255, m1 = 1 - ia;
    r = img[i] * ia + r * m1; g = img[i + 1] * ia + g * m1; b = img[i + 2] * ia + b * m1; a = ia + a * m1;
  }
  for (const T of tabs) {
    const L = T.L, q = L.g;
    let t: number;
    if (L.k === 'r') { const dx = (lx - q[0]) / q[2], dy = (ly - q[1]) / q[3]; t = Math.sqrt(dx * dx + dy * dy); }
    else t = (lx - q[0]) * q[2] + (ly - q[1]) * q[3];
    let f = (t - T.t0) * T.k; if (f < 0) f = 0; else if (f > N - 1) f = N - 1;
    const j = f | 0, k = f - j, j2 = j < N - 1 ? j + 1 : j, u = T.lut, i4 = j * 4, j4 = j2 * 4;
    const la = u[i4 + 3] + (u[j4 + 3] - u[i4 + 3]) * k; if (la <= 0) continue;
    const m1 = 1 - la;
    r = u[i4] + (u[j4] - u[i4]) * k + r * m1; g = u[i4 + 1] + (u[j4 + 1] - u[i4 + 1]) * k + g * m1;
    b = u[i4 + 2] + (u[j4 + 2] - u[i4 + 2]) * k + b * m1; a = la + a * m1;
  }
  const op = s.op; r *= op; g *= op; b *= op; a *= op;
  const m1 = 1 - a;
  acc[0] = r + acc[0] * m1; acc[1] = g + acc[1] * m1; acc[2] = b + acc[2] * m1; acc[3] = a + acc[3] * m1;
}

/** One step of the stack, bottom first: a run of soft sources (worked out on the grid: all of them together are one
 * premultiplied colour per grid point) or one source with a picture (pixel by pixel) */
type Op = { grid: Float32Array } | { s: GlowSrc; tabs: Tab[]; img: Uint8ClampedArray };

/** a seeded random, so a picture can be painted again the same */
function rng(seed: number) { let x = seed | 0 || 0x9e3779b9; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }

/** triangular noise from -1 to 1 (two randoms added), the same table for every picture */
const NT = 1 << 16;
let noise: Float32Array | null = null;
function noiseTable() {
  if (!noise) { const r = rng(0x2545f491); noise = new Float32Array(NT); for (let i = 0; i < NT; i++) noise[i] = r() + r() - 1; }
  return noise;
}

/** How much stronger the grain's dots are drawn here than in its tile: the picture has half the screen's pixels and the
 * screen smooths it back up, which thins a dot-sized noise; drawn this much stronger (about its mean, which stays the same),
 * the grain measures as strong on screen as the CSS grain drawn at full size (measured: banding round 3) */
export const GRAIN_BOOST = 1.75;

/** The grain as a repeating table of P × P picture pixels: each the mean of the tile pixels it covers, at strength `g` */
const grainTabs = new Map<string, { K: Float32Array; P: number; mean: number; sd: number }>();
function grainTable(tile: Uint8Array, n: number, s: number, g: number) {
  const P = Math.max(1, Math.round((n * s) / 4)), key = `${n} ${P} ${g}`;
  let t = grainTabs.get(key);
  if (!t) {
    const q = n / P, K = new Float32Array(P * P);
    let sum = 0;
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
      let v = 0;
      for (let j = 0; j < 4; j++) {
        const ty = Math.min(n - 1, ((y + (j + 0.5) / 4) * q) | 0);
        for (let i = 0; i < 4; i++) v += tile[ty * n + Math.min(n - 1, ((x + (i + 0.5) / 4) * q) | 0)];
      }
      K[y * P + x] = (g * v) / (16 * 255); sum += K[y * P + x];
    }
    const mean = sum / (P * P);
    let vv = 0;
    for (let i = 0; i < K.length; i++) { K[i] = mean + (K[i] - mean) * GRAIN_BOOST; vv += (K[i] - mean) ** 2; }
    t = { K, P, mean, sd: Math.sqrt(vv / K.length) };
    if (grainTabs.size > 8) grainTabs.clear();
    grainTabs.set(key, t);
  }
  return t;
}

/**
 * Paints `job`. `imgs`: the pixels (straight colour, canvas size) of each source's picture, under sources first then top
 * ones, null where a source has none; `seed`: the noise's start (a different one each time is fine).
 */
export function render(job: GlowJob, imgs: (Uint8ClampedArray | null)[] = [], seed = 1): ImageData {
  const { w, h, base, grain } = job, sim = !!job.sim, amp = sim ? 0 : job.amp;
  const gw = Math.floor((w - 0.5) / Q) + 2, gh = Math.floor((h - 0.5) / Q) + 2;
  const acc = new Float64Array(4);
  let pixelOps = false;
  /** a stack of sources as steps: runs of soft ones on the grid, ones with a picture alone */
  const stepsOf = (srcs: GlowSrc[], from: number): Op[] => {
    const out: Op[] = [];
    let run: { s: GlowSrc; tabs: Tab[] }[] = [];
    const flush = () => {
      if (!run.length) return;
      const G = new Float32Array(gw * gh * 4);
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        acc[0] = acc[1] = acc[2] = acc[3] = 0;
        for (const R of run) over(R.s, R.tabs, null, 0, i * Q, j * Q, acc);
        G.set(acc, (j * gw + i) * 4);
      }
      out.push({ grid: G }); run = [];
    };
    srcs.forEach((s, k) => {
      const img = imgs[from + k] ?? null;
      if (img) { flush(); out.push({ s, tabs: tabsOf(s), img }); pixelOps = true; }
      else run.push({ s, tabs: tabsOf(s) });
    });
    flush();
    return out;
  };
  const under = stepsOf(job.srcs, 0), top = stepsOf(job.top ?? [], job.srcs.length);
  const gr = grain && grain.tile && grain.n && grain.s ? grainTable(grain.tile, grain.n, grain.s, grain.g) : null;
  const y0 = grain ? Math.round(grain.y0) : 0;

  // ── how strong the noise is, at each grid point ──
  // (needed: about `amp` levels of triangular noise; the grain counts towards it. None where rounding gives one level all over.)
  const A = new Float32Array(gw * gh);
  const need = amp / Math.sqrt(6); // the noise's spread (standard deviation) that `amp` stands for
  if (amp > 0) {
    if (pixelOps) A.fill(amp); // (a picture in it: its pixels aren't on the grid; it gets the noise everywhere)
    else {
      // the picture's smooth colour at each grid point, in levels (an opaque picture: colour; see-through: premultiplied and alpha)
      const V = new Float32Array(gw * gh * 4);
      const g0 = gr ? gr.mean : 0;
      for (let p = 0; p < gw * gh; p++) {
        acc[0] = acc[1] = acc[2] = acc[3] = 0;
        if (base) { acc[0] = base[0]; acc[1] = base[1]; acc[2] = base[2]; acc[3] = 1; }
        for (const o of under) { const G = (o as { grid: Float32Array }).grid, m1 = 1 - G[p * 4 + 3]; for (let c = 0; c < 4; c++) acc[c] = G[p * 4 + c] + acc[c] * m1; }
        if (gr && Math.floor(p / gw) * Q >= y0) for (let c = 0; c < 3; c++) acc[c] += g0 * (255 * acc[3] - acc[c]);
        for (const o of top) { const G = (o as { grid: Float32Array }).grid, m1 = 1 - G[p * 4 + 3]; for (let c = 0; c < 4; c++) acc[c] = G[p * 4 + c] + acc[c] * m1; }
        V[p * 4] = acc[0]; V[p * 4 + 1] = acc[1]; V[p * 4 + 2] = acc[2]; V[p * 4 + 3] = acc[3] * 255;
      }
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        // flat: across the grid points around it, every channel rounds to one and the same level
        let flat = true;
        const p = j * gw + i;
        for (let c = 0; c < 4 && flat; c++) {
          let lo = Infinity, hi = -Infinity;
          for (let dj = -1; dj <= 1; dj++) {
            const jj = j + dj; if (jj < 0 || jj >= gh) continue;
            for (let di = -1; di <= 1; di++) {
              const ii = i + di; if (ii < 0 || ii >= gw) continue;
              const v = V[(jj * gw + ii) * 4 + c]; if (v < lo) lo = v; if (v > hi) hi = v;
            }
          }
          if (Math.round(lo) !== Math.round(hi)) flat = false;
        }
        if (flat) continue;
        // the grain's own spread here, in levels (it lightens towards white: stronger over a dark colour)
        const sg = gr && j * Q >= y0 ? gr.sd * (255 * V[p * 4 + 3] - (V[p * 4] + V[p * 4 + 1] + V[p * 4 + 2]) / 3) : 0;
        A[p] = sg >= need ? 0 : Math.sqrt(need * need - sg * sg) * Math.sqrt(6);
      }
    }
  }

  // ── the pixels ──
  const d = new ImageData(w, h), px = d.data;
  const NTab = noiseTable(), r = rng(seed * 2654435761);
  const ix = new Int32Array(w), fx = new Float32Array(w);
  for (let x = 0; x < w; x++) { const g = (x + 0.5) / Q; ix[x] = g | 0; fx[x] = g - (g | 0); }
  // each grid step's row, mixed between the two grid rows around the pixel row
  const rowsOf = (ops: Op[]) => ops.map((o) => ('grid' in o ? new Float32Array(gw * 4) : null));
  const uRows = rowsOf(under), tRows = rowsOf(top), aRow = new Float32Array(gw);
  for (let y = 0; y < h; y++) {
    const gy = (y + 0.5) / Q, j0 = gy | 0, fy = gy - j0, a0 = j0 * gw, a1 = (j0 + 1) * gw;
    const mix = (ops: Op[], rows: (Float32Array | null)[]) => ops.forEach((o, k) => {
      const R = rows[k]; if (!R) return;
      const G = (o as { grid: Float32Array }).grid;
      for (let i = 0; i < gw * 4; i++) R[i] = G[a0 * 4 + i] + (G[a1 * 4 + i] - G[a0 * 4 + i]) * fy;
    });
    mix(under, uRows); mix(top, tRows);
    for (let i = 0; i < gw; i++) aRow[i] = A[a0 + i] + (A[a1 + i] - A[a0 + i]) * fy;
    const nOff = (r() * NT) | 0;
    const inGrain = gr && y >= y0, K = gr?.K, P = gr?.P ?? 1, kRow = inGrain ? ((y - y0) % P) * P : 0;
    let kx = 0;
    for (let x = 0; x < w; x++) {
      const i0 = ix[x], f = fx[x], o = (y * w + x) * 4;
      // under: the page's colour (an opaque picture), then each step over it
      let cr = 0, cg = 0, cb = 0, ca = 0;
      if (base) { cr = base[0]; cg = base[1]; cb = base[2]; ca = 1; }
      for (let k = 0; k < under.length; k++) {
        const R = uRows[k];
        if (R) {
          const q = i0 * 4, sa = R[q + 3] + (R[q + 7] - R[q + 3]) * f, m1 = 1 - sa;
          cr = R[q] + (R[q + 4] - R[q]) * f + cr * m1; cg = R[q + 1] + (R[q + 5] - R[q + 1]) * f + cg * m1;
          cb = R[q + 2] + (R[q + 6] - R[q + 2]) * f + cb * m1; ca = sa + ca * m1;
        } else {
          const op = under[k] as { s: GlowSrc; tabs: Tab[]; img: Uint8ClampedArray };
          acc[0] = cr; acc[1] = cg; acc[2] = cb; acc[3] = ca;
          over(op.s, op.tabs, op.img, o, x + 0.5, y + 0.5, acc);
          cr = acc[0]; cg = acc[1]; cb = acc[2]; ca = acc[3];
        }
      }
      // (a check: the picture as the phone drew the CSS, rounded to whole steps before the grain went over it)
      if (sim) { cr = Math.round(cr); cg = Math.round(cg); cb = Math.round(cb); }
      if (inGrain) {
        // the grain: white at the tile's strength, laid on top
        const k = K![kRow + kx]; if (++kx === P) kx = 0;
        cr += k * (255 * ca - cr); cg += k * (255 * ca - cg); cb += k * (255 * ca - cb); ca += k * (1 - ca);
      }
      for (let k = 0; k < top.length; k++) {
        const R = tRows[k];
        if (R) {
          const q = i0 * 4, sa = R[q + 3] + (R[q + 7] - R[q + 3]) * f, m1 = 1 - sa;
          cr = R[q] + (R[q + 4] - R[q]) * f + cr * m1; cg = R[q + 1] + (R[q + 5] - R[q + 1]) * f + cg * m1;
          cb = R[q + 2] + (R[q + 6] - R[q + 2]) * f + cb * m1; ca = sa + ca * m1;
        } else {
          const op = top[k] as { s: GlowSrc; tabs: Tab[]; img: Uint8ClampedArray };
          acc[0] = cr; acc[1] = cg; acc[2] = cb; acc[3] = ca;
          over(op.s, op.tabs, op.img, o, x + 0.5, y + 0.5, acc);
          cr = acc[0]; cg = acc[1]; cb = acc[2]; ca = acc[3];
        }
      }
      const am = aRow[i0] + (aRow[i0 + 1] - aRow[i0]) * f, n = am > 0 ? NTab[(nOff + x) & (NT - 1)] * am : 0;
      if (base) {
        // an opaque picture: one noise for all three colours (the array rounds to the nearest level)
        px[o] = cr + n; px[o + 1] = cg + n; px[o + 2] = cb + n; px[o + 3] = 255;
      } else {
        // A see-through picture: the canvas keeps colour premultiplied by alpha, so the noise is chosen in that form and the
        // colour handed over is picked to land on exactly it when it is multiplied back. The noise never reaches past what
        // the pixel can hold (no alpha below 0, no colour beyond its alpha), which would shift the mean.
        if (ca <= 0) continue;
        const A0 = ca * 255, ea = Math.min(am, A0, 255 - A0);
        const al = Math.min(255, Math.max(0, Math.round(A0 + (am > 0 ? NTab[(nOff + x) & (NT - 1)] : 0) * ea)));
        px[o + 3] = al;
        if (!al) continue;
        const kk = al / A0, nn = am > 0 ? NTab[(nOff + x) & (NT - 1)] : 0;
        const c3 = [cr, cg, cb];
        for (let c = 0; c < 3; c++) {
          const Pc = c3[c] * kk, e = Math.max(0, Math.min(am, Pc, al - Pc));
          const pc = Math.min(al, Math.max(0, Math.round(Pc + nn * e)));
          px[o + c] = Math.round((pc * 255) / al);
        }
      }
    }
  }
  return d;
}
