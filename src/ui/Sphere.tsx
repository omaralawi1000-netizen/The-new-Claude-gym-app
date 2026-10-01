import { useEffect, useRef } from 'react';
import { mic } from '../lib/mic';
import { useVoice } from '../state/voice';
import { useStore } from '../state/store';

/**
 * The Aven sphere: ~900 points on a Fibonacci lattice, lit from upper-left so it reads as a volume.
 * One canvas, one draw loop. The stage element flies between registered "slots" with a spring, so the
 * same sphere is the tab-bar button, the voice composer's hero and the review header.
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
  private kick = 0;                        // a soft "bloom" whenever the state changes (tap → listen → think → done)
  private kickV = 0;
  private lastPhase = '';
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

    // real input — zero unless the microphone is genuinely live
    const live = v.phase === 'listening' && mic.active;
    const level = live ? mic.level() : 0;
    const bands = live ? mic.bands() : null;
    const att = (cur: number, to: number) => cur + (to - cur) * (1 - Math.exp(-dt * (to > cur ? 22 : 5)));
    this.env = att(this.env, level);
    if (bands) {
      const avg = (a: number, b: number) => { let x = 0; for (let i = a; i < b; i++) x += bands[i]; return x / (b - a); };
      this.bandEnv[0] = att(this.bandEnv[0], avg(0, 4)); this.bandEnv[1] = att(this.bandEnv[1], avg(4, 10)); this.bandEnv[2] = att(this.bandEnv[2], avg(10, 16));
    } else for (let i = 0; i < 3; i++) this.bandEnv[i] = att(this.bandEnv[i], 0);
    const [eLo, eMid, eHi] = this.bandEnv;

    const { ctx, canvas } = this;
    const W = canvas.width;
    const c = W / 2;
    const breath = reduced ? 1 : 1 + Math.sin(this.t * 1.15) * 0.012 * (1 - this.env);
    const R = c * 0.66 * breath * (1 + this.kick * 0.035); // headroom for the voice swells
    ctx.clearRect(0, 0, W, W);

    const { hi, lo, alt, ok, dark } = colors;
    // soft inner light: the sphere glows from within, brighter while you speak
    const haloA = (this.cur.halo + this.env * 0.5 + Math.max(0, this.kick) * 0.25) * (1 - this.cur.dim * 0.8);
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
  }
}

// ── stage ───────────────────────────────────────────────────

interface Slot { el: HTMLElement; priority: number }
const slots = new Map<string, Slot>();
export function registerSlot(id: string, el: HTMLElement, priority: number) {
  slots.set(id, { el, priority });
  return () => { if (slots.get(id)?.el === el) slots.delete(id); };
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
    const st = { x: 0, y: 0, s: 52, vx: 0, vy: 0, vs: 0, init: false };
    const appEl = el.closest('.app') as HTMLElement | null;
    let raf = 0;
    let running = true;
    let last = performance.now();
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let colorKey = '';
    let frame = 0;
    // the accent now follows the active area and cross-fades, so read the live (resolved) colour through probes
    const probe = (v: string) => { const d = document.createElement('i'); d.style.cssText = `position:absolute;width:0;height:0;pointer-events:none;color:var(${v})`; (appEl ?? document.body).appendChild(d); return d; };
    const pAc = probe('--ac'), pAc2 = probe('--ac-2'), pH1 = probe('--h1');
    let colors: SphereColors = { hi: [255, 138, 77], lo: [150, 70, 40], alt: [124, 92, 255], ok: [95, 208, 138], dark: true };
    const refreshColors = () => {
      const theme = document.documentElement.dataset.theme;
      if (frame++ % 6 !== 0 && colorKey === theme) return;
      colorKey = theme ?? '';
      const dark = theme !== 'light';
      const ac = parseColor(getComputedStyle(pAc).color, [255, 91, 36]);
      const ac2 = parseColor(getComputedStyle(pAc2).color, [255, 138, 77]);
      const alt = parseColor(getComputedStyle(pH1).color, [124, 92, 255]);
      colors = dark
        ? { hi: ac2, lo: [ac[0] * 0.3, ac[1] * 0.3, ac[2] * 0.3], alt, ok: [110, 222, 150], dark }
        : { hi: ac, lo: [ac[0] * 0.55 + 70, ac[1] * 0.55 + 60, ac[2] * 0.55 + 60], alt, ok: [30, 160, 95], dark };
    };

    const tick = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      refreshColors();
      // real elapsed time (a dropped frame must not slow the flight down), integrated in small fixed steps below
      const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = now;
      const reduced = document.documentElement.dataset.motion === 'reduce' || (document.documentElement.dataset.motion !== 'full' && mq.matches);
      // pick the highest-priority connected slot
      let best: Slot | null = null;
      for (const s of slots.values()) if (s.el.isConnected && (!best || s.priority > best.priority)) best = s;
      if (!best) { el.style.opacity = '0'; return; }
      const r = best.el.getBoundingClientRect();
      if (r.width < 2) { el.style.opacity = '0'; return; }
      el.style.zIndex = best.priority >= 10 ? '600' : '41'; // above full-screen composers; below sheets when parked in the tab bar
      const base = appEl?.getBoundingClientRect(); // the stage lives inside .app, which may be offset on wide screens
      const tx = r.left - (base?.left ?? 0), ty = r.top - (base?.top ?? 0), ts = Math.min(r.width, r.height);
      // parked in the tab bar and only sliding sideways (the active tab widened): follow exactly, or the lagging sphere overlaps the tab labels
      const parkedSlide = best.priority === 0 && Math.abs(ts - st.s) < 3 && Math.abs(ty - st.y) < 3;
      if (!st.init || reduced || parkedSlide) { st.x = tx; st.y = ty; st.s = ts; st.vx = st.vy = st.vs = 0; st.init = true; }
      else {
        // critically-damped-ish spring (follows moving slots such as a sheet mid-slide)
        const k = 230, c = 2 * Math.sqrt(k) * 0.94;
        const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
          for (const key of ['x', 'y', 's'] as const) {
            const target = key === 'x' ? tx : key === 'y' ? ty : ts;
            const vk = (`v${key}`) as 'vx' | 'vy' | 'vs';
            st[vk] += (-k * (st[key] - target) - c * st[vk]) * h;
            st[key] += st[vk] * h;
          }
        }
        // settled: snap exactly, so it never rests a fraction of a pixel off (visible as a faint shimmer)
        if (Math.abs(st.x - tx) < 0.15 && Math.abs(st.y - ty) < 0.15 && Math.abs(st.s - ts) < 0.15 && Math.abs(st.vx) + Math.abs(st.vy) + Math.abs(st.vs) < 2) { st.x = tx; st.y = ty; st.s = ts; st.vx = st.vy = st.vs = 0; }
      }
      const size = Math.max(8, st.s);
      // The canvas is drawn at a size bucket and scaled down with a transform. Resizing a canvas (and the element) on
      // every frame of a flight reallocated its buffer and re-laid it out each frame — a stutter source.
      const bucket = Math.ceil(size / 24) * 24;
      el.style.opacity = '1';
      if (el.style.width !== `${bucket}px`) el.style.width = el.style.height = `${bucket}px`;
      el.style.transform = `translate3d(${st.x}px, ${st.y}px, 0) scale(${size / bucket})`;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      renderer.resize(bucket, dpr);
      renderer.frame(now, bucket, reduced, colors);
    };
    raf = requestAnimationFrame(tick);
    const onVis = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(tick); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { running = false; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); pAc.remove(); pAc2.remove(); pH1.remove(); };
  }, [motionPref]);

  return (
    <div ref={root} className="sphere-stage" aria-hidden="true" style={{ position: 'fixed', left: 0, top: 0, zIndex: 75, pointerEvents: 'none', opacity: 0, willChange: 'transform', transformOrigin: '0 0', contain: 'strict' }}>
      <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

/** Put this where the sphere should appear. The stage flies to the highest-priority slot. */
export function SphereSlot({ id, priority = 0, className, style }: { id: string; priority?: number; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => registerSlot(id, ref.current!, priority), [id, priority]);
  return <div ref={ref} className={className} style={style} />;
}
