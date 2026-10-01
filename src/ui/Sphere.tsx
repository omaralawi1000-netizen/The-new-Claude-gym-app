import { useEffect, useRef } from 'react';
import { cancelFrame, frame } from 'motion/react';
import { useEngageContext, type Engage } from './engage';
import { mic } from '../lib/mic';
import { useVoice } from '../state/voice';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';

/**
 * The Aven sphere: ~900 points on a Fibonacci lattice, lit from upper-left so it reads as a volume.
 * One canvas, one draw loop. The stage element sits in the lowest registered "slot" (the tab bar) blended towards
 * every popup slot by that popup's progress, so the same sphere is the tab-bar button, the Coach's microphone, the
 * voice composer's hero and the review header, and it moves exactly in step with the popup that carries it.
 */

const N = 1100;
type V3 = Float32Array;

function lattice(): { pts: V3; order: Uint16Array } {
  const pts = new Float32Array(N * 3);
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N;
    const r = Math.sqrt(1 - y * y);
    const th = g * i;
    pts[i * 3] = Math.cos(th) * r; pts[i * 3 + 1] = y; pts[i * 3 + 2] = Math.sin(th) * r;
  }
  // deterministic shuffle → any prefix is an even sample (so smaller sizes draw fewer, evenly spread dots)
  const order = new Uint16Array(N);
  for (let i = 0; i < N; i++) order[i] = i;
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  return { pts, order };
}
const LAT = lattice();

/**
 * The surface moves as one liquid: five smooth travelling waves over the sphere (not per-dot jitter). Low frequencies
 * take the bass, the finer waves take the highs, so a voice makes slow swells with a fine shimmer on top.
 */
const WAVES = [
  { d: [0.8, 0.5, 0.33], f: 2.1, s: 0.9 }, { d: [-0.6, 0.7, 0.38], f: 2.6, s: 1.25 }, { d: [0.1, -0.9, 0.42], f: 3.2, s: 1.1 },
  { d: [-0.5, -0.3, 0.81], f: 4.4, s: 2.3 }, { d: [0.95, -0.2, -0.24], f: 5.8, s: 3.1 },
].map((w) => { const l = Math.hypot(w.d[0], w.d[1], w.d[2]); return { x: w.d[0] / l, y: w.d[1] / l, z: w.d[2] / l, f: w.f, s: w.s }; });

interface Params { rotSpeed: number; liquid: number; glow: number; dim: number; sweep: number; ring: number; halo: number }
const TARGET: Record<string, Params> = {
  idle: { rotSpeed: 0.2, liquid: 0.022, glow: 0.35, dim: 0, sweep: 0, ring: 0, halo: 0.16 },
  requesting: { rotSpeed: 0.16, liquid: 0.03, glow: 0.45, dim: 0, sweep: 0, ring: 0, halo: 0.24 },
  listening: { rotSpeed: 0.28, liquid: 0.03, glow: 0.42, dim: 0, sweep: 0, ring: 0, halo: 0.3 },
  processing: { rotSpeed: 1.6, liquid: 0.016, glow: 0.4, dim: 0, sweep: 1, ring: 0, halo: 0.34 },
  review: { rotSpeed: 0.1, liquid: 0.008, glow: 0.55, dim: 0, sweep: 0, ring: 1, halo: 0.2 },
  confirmed: { rotSpeed: 0.4, liquid: 0.01, glow: 0.6, dim: 0, sweep: 0, ring: 0, halo: 0.42 },
  error: { rotSpeed: 0.05, liquid: 0.004, glow: 0.12, dim: 1, sweep: 0, ring: 0, halo: 0 },
  unavailable: { rotSpeed: 0.05, liquid: 0.004, glow: 0.12, dim: 1, sweep: 0, ring: 0, halo: 0 },
};

type RGB = [number, number, number];
export interface SphereColors { hi: RGB; lo: RGB; alt: RGB; ok: RGB; dark: boolean }

export class SphereRenderer {
  private ctx: CanvasRenderingContext2D;
  private rot = 0.6;
  private cur: Params = { ...TARGET.idle };
  private t = 0;
  private last = 0;
  private env = 0;                         // smoothed voice level (fast attack, slow release)
  private bandEnv = new Float32Array(3);   // smoothed low / mid / high energy
  private lat = new Float32Array(16);       // smoothed per-band energy, laid out over the sphere's latitudes like an equaliser
  private body = 0;                         // slower "presence" of the voice: drives the inner light and the swell of the whole body
  private prevV = 0;
  private onsetAt = -1;
  private rings: { age: number; amp: number }[] = []; // ripples that leave the sphere on every syllable
  private kick = 0;                        // a soft "bloom" whenever the state changes (tap → listen → think → done)
  private kickV = 0;
  private lastPhase = '';
  /** how loudly you are speaking right now, 0..1 (time-smoothed) — for things around the orb that should breathe with it */
  get voice() { return Math.min(1, this.body * 0.75 + this.env * 0.45); }
  constructor(private canvas: HTMLCanvasElement) { this.ctx = canvas.getContext('2d')!; }

  resize(css: number, dpr: number) {
    const px = Math.max(2, Math.round(css * dpr));
    if (this.canvas.width !== px) { this.canvas.width = px; this.canvas.height = px; }
  }

  frame(now: number, css: number, reduced: boolean, colors: SphereColors) {
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    this.t += dt;
    const v = useVoice.getState();
    const tgt = TARGET[v.phase] ?? TARGET.idle;
    const k = 1 - Math.exp(-dt * 4.5);
    (Object.keys(tgt) as (keyof Params)[]).forEach((key) => { this.cur[key] += (tgt[key] - this.cur[key]) * k; });
    if (v.phase !== this.lastPhase) { if (this.lastPhase && !reduced) this.kickV += v.phase === 'error' || v.phase === 'unavailable' ? -1.4 : 3.2; this.lastPhase = v.phase; }
    // the bloom is a damped spring, so it swells, overshoots a touch and settles
    this.kickV += (-90 * this.kick - 11 * this.kickV) * dt; this.kick += this.kickV * dt;
    const speed = reduced ? 0 : this.cur.rotSpeed * (1 + Math.max(0, this.kick) * 2);
    this.rot += dt * speed;

    // real input — zero unless the microphone is genuinely live. Everything is smoothed here by TIME (not per call), with a
    // very fast attack so a syllable lands on the very frame it starts, and a slower release so it fades like a bell.
    const live = v.phase === 'listening' && mic.active;
    const raw = live ? mic.voice() : 0;
    const bands = live ? mic.bands() : null;
    const att = (cur: number, to: number, up = 38, down = 7) => cur + (to - cur) * (1 - Math.exp(-dt * (to > cur ? up : down)));
    this.env = att(this.env, raw);
    this.body = att(this.body, raw, 9, 2.4);
    // a sudden rise in energy = a new syllable: bump the whole body and send a ripple out
    if (live && !reduced && raw - this.prevV > 0.1 && raw > 0.18 && this.t - this.onsetAt > 0.11) {
      this.onsetAt = this.t;
      this.kickV += 1.1 + raw * 2.2;
      if (this.rings.length < 4) this.rings.push({ age: 0, amp: Math.min(1, 0.45 + raw) });
    }
    this.prevV = raw;
    for (const r of this.rings) r.age += dt * 1.15;
    this.rings = this.rings.filter((r) => r.age < 1);
    if (bands) {
      const avg = (a: number, b: number) => { let x = 0; for (let i = a; i < b; i++) x += bands[i]; return x / (b - a); };
      this.bandEnv[0] = att(this.bandEnv[0], avg(0, 4)); this.bandEnv[1] = att(this.bandEnv[1], avg(4, 10)); this.bandEnv[2] = att(this.bandEnv[2], avg(10, 16));
      for (let i = 0; i < 16; i++) this.lat[i] = att(this.lat[i], bands[i], 30, 6);
    } else { for (let i = 0; i < 3; i++) this.bandEnv[i] = att(this.bandEnv[i], 0); for (let i = 0; i < 16; i++) this.lat[i] = att(this.lat[i], 0); }
    const [eLo, eMid, eHi] = this.bandEnv;

    const { ctx, canvas } = this;
    const W = canvas.width;
    const c = W / 2;
    const breath = reduced ? 1 : 1 + Math.sin(this.t * 1.15) * 0.012 * (1 - this.env);
    const R = c * 0.66 * breath * (1 + this.kick * 0.035 + this.body * 0.06); // the body swells with the voice; headroom for the swells
    ctx.clearRect(0, 0, W, W);

    const { hi, lo, alt, ok, dark } = colors;
    // soft inner light: the sphere glows from within, brighter while you speak
    const haloA = (this.cur.halo + this.body * 0.55 + this.env * 0.25 + Math.max(0, this.kick) * 0.25) * (1 - this.cur.dim * 0.8);
    if (haloA > 0.01) {
      const gr = ctx.createRadialGradient(c, c, R * 0.15, c, c, c * 0.98);
      gr.addColorStop(0, `rgba(${hi[0] | 0},${hi[1] | 0},${hi[2] | 0},${Math.min(0.55, haloA * (dark ? 0.55 : 0.4))})`);
      gr.addColorStop(0.55, `rgba(${alt[0] | 0},${alt[1] | 0},${alt[2] | 0},${Math.min(0.3, haloA * (dark ? 0.22 : 0.16))})`);
      gr.addColorStop(1, `rgba(${alt[0] | 0},${alt[1] | 0},${alt[2] | 0},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c, c, c * 0.98, 0, 6.2832); ctx.fill();
    }

    const count = Math.round(Math.min(N, Math.max(280, css * 6.5)));
    const tilt = 0.42 + Math.sin(this.t * 0.37) * (reduced ? 0 : 0.06);
    const cr = Math.cos(this.rot), sr = Math.sin(this.rot), ct = Math.cos(tilt), st = Math.sin(tilt);
    const confirmAge = v.phase === 'confirmed' ? (performance.now() - v.since) / 1000 : 9;
    const sweepPhase = this.t * 2.4;
    const T = reduced ? 0 : this.t;
    const amps = [
      this.cur.liquid + eLo * 0.22 + this.env * 0.05, this.cur.liquid * 0.9 + eLo * 0.16,
      this.cur.liquid * 0.7 + eMid * 0.12, this.cur.liquid * 0.5 + eMid * 0.08 + eHi * 0.04, this.cur.liquid * 0.35 + eHi * 0.07,
    ];
    if (!live && v.phase === 'listening') { amps[0] += 0.015; amps[1] += 0.012; } // no level available: honest gentle motion, no fake voice

    // buckets: 7 light levels × 3 hue mixes (accent ↔ the area's second colour, drifting round the sphere)
    const NB = 7, NH = 3;
    const buckets: number[][] = Array.from({ length: NB * NH }, () => []);
    const dots: { x: number; y: number; r: number }[] = new Array(count);
    const tone = new Uint8Array(count); // 0 = base colour, 1 = highlight, 2 = ok

    for (let n = 0; n < count; n++) {
      const i = LAT.order[n];
      let x = LAT.pts[i * 3], y = LAT.pts[i * 3 + 1], z = LAT.pts[i * 3 + 2];
      const az = Math.atan2(z, x);

      let d = 0;
      let glow = this.cur.glow;
      for (let w = 0; w < 5; w++) {
        const ww = WAVES[w];
        d += amps[w] * Math.sin((x * ww.x + y * ww.y + z * ww.z) * ww.f + T * ww.s + w * 1.7);
      }
      if (live) {
        // equaliser over the latitudes: low voice at the poles' bellies, highs towards the top; it turns with the sphere
        const fb = (1 - y) * 7.5, b0 = Math.min(14, Math.floor(fb)), fr = fb - b0;
        const e = this.lat[b0] * (1 - fr) + this.lat[b0 + 1] * fr;
        d += e * 0.085 * (0.65 + 0.35 * Math.cos(az * 2 - this.rot * 1.5 + T * 1.2));
        glow += e * 0.9;
      }
      glow += this.env * 0.9 + Math.max(0, d) * 3;
      if (this.kick > 0.01) d += this.kick * 0.05 * (0.6 + 0.4 * Math.sin(y * 3 + T * 4));
      if (this.cur.sweep > 0.01) {
        const a = Math.cos(az - sweepPhase) * 0.5 + 0.5;
        const band = Math.exp(-Math.pow(y - Math.sin(T * 1.6) * 0.8, 2) / 0.05);
        d -= 0.05 * this.cur.sweep * (1 - a) - 0.05 * band * this.cur.sweep;
        glow += (band * 0.9 + a * 0.15) * this.cur.sweep;
      }
      if (this.cur.ring > 0.01) {
        const eq = Math.exp(-(y * y) / 0.004);
        glow += eq * 0.9 * this.cur.ring;
        d += eq * 0.03 * this.cur.ring;
      }
      let okMix = 0;
      if (confirmAge < 1.6) {
        const front = confirmAge * 2.6 - 0.3;
        const dist = (1 - y);
        const w = Math.exp(-Math.pow(dist - front, 2) / 0.05);
        d += w * 0.22;
        okMix = Math.max(w, confirmAge < 0.35 ? (0.35 - confirmAge) * 2 : 0);
        glow += w;
      }
      const rr = 1 + Math.max(-0.2, Math.min(0.45, d));
      x *= rr; y *= rr; z *= rr;
      const x1 = x * cr + z * sr, z1 = -x * sr + z * cr;
      const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
      const persp = 1 / (1 - z2 * 0.24);
      const px = c + x1 * R * persp, py = c + y2 * R * persp;
      const depth = Math.max(0, Math.min(1, (z2 + 1.1) / 2.2)); // 0 back … 1 front
      const nx = x1 / rr, ny = y2 / rr, nz = z2 / rr;
      const lam = Math.max(0, nx * -0.42 + ny * -0.52 + nz * 0.74);
      const rim = Math.pow(1 - Math.abs(nz), 3) * 0.35 * depth; // a thin bright rim reads as glass
      const sh = Math.min(1, 0.16 + 0.84 * Math.pow(depth, 1.25) * (0.42 + 0.58 * lam) + rim + Math.max(0, glow - 0.4) * 0.25 * depth);
      const spacing = Math.sqrt(12.566 / count) * R;
      const size = spacing * 0.2 * (0.35 + 1.05 * depth) * (1 + Math.min(1.2, glow) * 0.22);
      dots[n] = { x: px, y: py, r: size };
      tone[n] = okMix > 0.25 ? 2 : glow > 1.3 ? 1 : 0;
      const hueMix = 0.5 + 0.5 * Math.sin(az * 1 + y * 1.6 - T * 0.6); // the second colour drifts around the surface
      const hb = Math.min(NH - 1, Math.floor(hueMix * NH));
      buckets[Math.min(NB - 1, Math.floor(sh * NB)) * NH + hb].push(n);
    }

    const dimK = this.cur.dim;
    // dark mode: additive light, so overlapping highlights bloom like light rather than paint
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    for (let b = 0; b < NB; b++) {
      for (let h = 0; h < NH; h++) {
        const list = buckets[b * NH + h];
        if (!list.length) continue;
        const a = (0.14 + (b / (NB - 1)) * 0.86) * (dark ? 0.82 : 1);
        const m = b / (NB - 1);
        const hm = (h / (NH - 1)) * 0.55;
        const top: RGB = [hi[0] + (alt[0] - hi[0]) * hm, hi[1] + (alt[1] - hi[1]) * hm, hi[2] + (alt[2] - hi[2]) * hm];
        let r = lo[0] + (top[0] - lo[0]) * m, g = lo[1] + (top[1] - lo[1]) * m, bl = lo[2] + (top[2] - lo[2]) * m;
        if (dimK > 0.01) { const grey = dark ? 120 : 140; r += (grey - r) * dimK; g += (grey - g) * dimK; bl += (grey - bl) * dimK; }
        ctx.fillStyle = `rgba(${r | 0},${g | 0},${bl | 0},${a * (1 - dimK * 0.5)})`;
        ctx.beginPath();
        for (const n of list) { if (tone[n] !== 0) continue; const d = dots[n]; ctx.moveTo(d.x + d.r, d.y); ctx.arc(d.x, d.y, d.r, 0, 6.2832); }
        ctx.fill();
      }
    }
    ctx.fillStyle = `rgba(${Math.min(255, hi[0] + 30)},${Math.min(255, hi[1] + 50)},${Math.min(255, hi[2] + 50)},0.95)`;
    ctx.beginPath();
    for (let n = 0; n < count; n++) if (tone[n] === 1) { const d = dots[n]; ctx.moveTo(d.x + d.r * 1.15, d.y); ctx.arc(d.x, d.y, d.r * 1.15, 0, 6.2832); }
    ctx.fill();
    ctx.fillStyle = `rgba(${ok[0]},${ok[1]},${ok[2]},0.98)`;
    ctx.beginPath();
    for (let n = 0; n < count; n++) if (tone[n] === 2) { const d = dots[n]; ctx.moveTo(d.x + d.r * 1.2, d.y); ctx.arc(d.x, d.y, d.r * 1.2, 0, 6.2832); }
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // syllable ripples: thin rings that leave the sphere and fade
    if (this.rings.length) {
      ctx.lineWidth = Math.max(1, W * 0.006);
      for (const r of this.rings) {
        const e = 1 - Math.pow(1 - r.age, 2);
        ctx.strokeStyle = `rgba(${hi[0] | 0},${hi[1] | 0},${hi[2] | 0},${(1 - r.age) * r.amp * (dark ? 0.5 : 0.4)})`;
        ctx.beginPath(); ctx.arc(c, c, R * (1.06 + e * 0.3), 0, 6.2832); ctx.stroke();
      }
    }
  }
}

// ── stage ───────────────────────────────────────────────────

interface Slot { el: HTMLElement; priority: number; engage?: Engage }
const slots = new Map<string, Slot>();
export function registerSlot(id: string, el: HTMLElement, priority: number, engage?: Engage) {
  slots.set(id, { el, priority, engage });
  return () => { if (slots.get(id)?.el === el) slots.delete(id); };
}

/** cubic-bezier(0.65, 0, 0.35, 1) — the --ease-io curve the colour field cross-fades on */
function easeInOut(x: number): number {
  const X = (t: number) => 3 * (1 - t) * (1 - t) * t * 0.65 + 3 * (1 - t) * t * t * 0.35 + t * t * t;
  const Y = (t: number) => 3 * (1 - t) * t * t + t * t * t; // y1 = 0, y2 = 1
  let lo = 0, hi = 1;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (X(m) < x) lo = m; else hi = m; }
  return Y((lo + hi) / 2);
}

function parseColor(css: string, fallback: [number, number, number]): [number, number, number] {
  const m = css.match(/#([0-9a-f]{6})/i);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgb = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const srgb = css.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/); // modern engines serialise colour-mix() like this
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255];
  return fallback;
}

export function SphereStage() {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const motionPref = useStore((s) => s.settings.motion);

  useEffect(() => {
    const el = root.current!, cv = canvas.current!;
    const renderer = new SphereRenderer(cv);
    const appEl = el.closest('.app') as HTMLElement | null;
    let running = true;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let drawn = false;
    // The accent follows the active area. Read the target colours once per change (through probes, which force a
    // style pass) and cross-fade to them here, on the same 1.1 s curve as the colour field, instead of polling
    // the live CSS value every few frames.
    const probe = (v: string) => { const d = document.createElement('i'); d.style.cssText = `position:absolute;width:0;height:0;pointer-events:none;color:var(${v})`; (appEl ?? document.body).appendChild(d); return d; };
    const pAc = probe('--ac'), pAc2 = probe('--ac-2'), pH1 = probe('--h1');
    const readTarget = (): SphereColors => {
      const dark = document.documentElement.dataset.theme !== 'light';
      const ac = parseColor(getComputedStyle(pAc).color, [255, 91, 36]);
      const ac2 = parseColor(getComputedStyle(pAc2).color, [255, 138, 77]);
      const alt = parseColor(getComputedStyle(pH1).color, [124, 92, 255]);
      return dark
        ? { hi: ac2, lo: [ac[0] * 0.3, ac[1] * 0.3, ac[2] * 0.3], alt, ok: [110, 222, 150], dark }
        : { hi: ac, lo: [ac[0] * 0.55 + 70, ac[1] * 0.55 + 60, ac[2] * 0.55 + 60], alt, ok: [30, 160, 95], dark };
    };
    let colors = readTarget(), from = colors, to = colors, fadeStart = 0;
    let colorKey = document.documentElement.dataset.theme ?? '';
    const mo = new MutationObserver(() => {
      const theme = document.documentElement.dataset.theme ?? '';
      const next = readTarget();
      if (theme !== colorKey) { colorKey = theme; colors = from = to = next; fadeStart = 0; return; } // theme: switch at once
      from = colors; to = next; fadeStart = performance.now();
    });
    if (appEl) mo.observe(appEl, { attributes: true, attributeFilter: ['data-hue'] });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const refreshColors = (now: number) => {
      if (!fadeStart) return;
      const k = Math.min(1, Math.max(0, (now - fadeStart) / 1100));
      const e = easeInOut(k);
      const mix = (x: RGB, y: RGB): RGB => [x[0] + (y[0] - x[0]) * e, x[1] + (y[1] - x[1]) * e, x[2] + (y[2] - x[2]) * e];
      colors = { hi: mix(from.hi, to.hi), lo: mix(from.lo, to.lo), alt: mix(from.alt, to.alt), ok: mix(from.ok, to.ok), dark: to.dark };
      if (k >= 1) fadeStart = 0;
    };

    // The orb has no motion of its own any more. Its place is the lowest slot (the tab bar) blended towards every
    // higher slot by that slot's `engage` (how far its popup is open). The popup, the page behind it and the orb all
    // read the same number in the same frame, so they stay in step while a popup opens, is dragged or leaves.
    let px = NaN, py = NaN, ps = NaN, sentV = 0, lastDraw = 0, lastBucket = 0;
    const tick = (now: number) => {
      if (!running) return;
      refreshColors(now);
      const reduced = document.documentElement.dataset.motion === 'reduce' || (document.documentElement.dataset.motion !== 'full' && mq.matches);
      const list: Slot[] = [];
      for (const s of slots.values()) if (s.el.isConnected) list.push(s);
      list.sort((a, b) => a.priority - b.priority);
      const base = appEl?.getBoundingClientRect(); // the stage lives inside .app, which may be offset on wide screens
      const ox = base?.left ?? 0, oy = base?.top ?? 0;
      let X = 0, Y = 0, S = 0, have = false, top = 0, topSlot: Slot | null = null;
      for (const sl of list) {
        const e = sl.engage ? Math.min(1, Math.max(0, sl.engage.e.get())) : 1;
        if (have && e <= 0.001) continue;
        const r = sl.el.getBoundingClientRect();
        if (r.width < 2) continue;
        // where the slot comes to rest: its box minus however far the popup is currently displaced
        const x = r.left - ox, y = r.top - oy - (sl.engage?.shift?.get() ?? 0), z = Math.min(r.width, r.height);
        if (!have) { X = x; Y = y; S = z; have = true; continue; }
        X += (x - X) * e; Y += (y - Y) * e; S += (z - S) * e;
        if (e > 0.02) { top = Math.max(top, sl.priority); topSlot = sl; }
      }
      if (!have) { el.style.opacity = '0'; return; }
      el.style.zIndex = top > 0 ? '600' : '41'; // above full-screen composers; below sheets when it sits in the tab bar
      const size = Math.max(8, S);
      // The canvas is drawn at a size bucket and scaled down with a transform. Resizing a canvas (and the element) on
      // every frame of a flight reallocated its buffer and re-laid it out each frame — a stutter source.
      const bucket = Math.ceil(size / 24) * 24;
      el.style.opacity = '1';
      if (el.style.width !== `${bucket}px`) el.style.width = el.style.height = `${bucket}px`;
      el.style.transform = `translate3d(${X}px, ${Y}px, 0) scale(${size / bucket})`;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      // Sitting still in the tab bar under an open sheet/overlay: keep the last frame instead of redrawing, so the
      // frosted layers above stop re-blurring it every frame.
      const still = Math.abs(X - px) < 0.05 && Math.abs(Y - py) < 0.05 && Math.abs(S - ps) < 0.05;
      px = X; py = Y; ps = S;
      if (top === 0 && still && useUI.getState().overlays.length > 0 && drawn) return;
      // Parked and idle (the orb resting in the tab bar): its motion is a slow turn, so ~30 fps looks identical and frees the
      // other half of the frames for the page. Anything moving, listening or thinking redraws every frame.
      // Idle (not listening, thinking or just done) the orb's own motion is a slow turn: ~30 fps looks identical and gives
      // the page the other half of the frames — on the tab bar, on Today and inside the live workout alike. Its POSITION
      // (above) still follows every frame, so it never lags a scroll or a popup.
      // A flight only scales the drawn canvas (transform above); the canvas itself must be redrawn only when its size bucket
      // changes (a resize clears it).
      const resized = bucket !== lastBucket; lastBucket = bucket;
      const calm = !reduced && !resized && useVoice.getState().phase === 'idle' && drawn;
      if (calm && now - lastDraw < 30) return;
      lastDraw = now;
      renderer.resize(bucket, dpr);
      renderer.frame(now, bucket, reduced, colors);
      drawn = true;
      // the slot's button listens too: its ring swells with your voice (one CSS variable, written only when it moves)
      const vv = renderer.voice;
      if (topSlot && top > 0 && (Math.abs(vv - sentV) > 0.015 || (vv < 0.004) !== (sentV < 0.004))) {
        (topSlot.el.parentElement ?? topSlot.el).style.setProperty('--voice', vv < 0.004 ? '0' : vv.toFixed(3));
        sentV = vv;
      }
    };
    // run inside motion's frame loop, right after it has written this frame's styles: the orb reads the popup's
    // position and progress from the very frame they were rendered in (a separate rAF would be a frame behind)
    const loop = (d: { timestamp: number }) => tick(d.timestamp);
    frame.postRender(loop, true);
    const onVis = () => {
      if (document.hidden) { running = false; cancelFrame(loop); }
      else if (!running) { running = true; frame.postRender(loop, true); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { running = false; cancelFrame(loop); document.removeEventListener('visibilitychange', onVis); mo.disconnect(); pAc.remove(); pAc2.remove(); pH1.remove(); };
  }, [motionPref]);

  return (
    <div ref={root} className="sphere-stage" aria-hidden="true" style={{ position: 'fixed', left: 0, top: 0, zIndex: 75, pointerEvents: 'none', opacity: 0, willChange: 'transform', transformOrigin: '0 0', contain: 'strict' }}>
      <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

/** Put this where the sphere should appear. Inside a popup it follows that popup's progress; elsewhere pass `engage`. */
export function SphereSlot({ id, priority = 0, className, style, engage }: { id: string; priority?: number; className?: string; style?: React.CSSProperties; engage?: Engage }) {
  const ref = useRef<HTMLDivElement>(null);
  const ctx = useEngageContext();
  const eng = engage ?? ctx ?? undefined;
  useEffect(() => registerSlot(id, ref.current!, priority, eng), [id, priority, eng]);
  return <div ref={ref} className={className} style={style} />;
}
