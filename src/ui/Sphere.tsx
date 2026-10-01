import { useEffect, useRef } from 'react';
import { mic } from '../lib/mic';
import { useVoice } from '../state/voice';
import { useStore } from '../state/store';

/**
 * The Aven sphere: ~900 points on a Fibonacci lattice, lit from upper-left so it reads as a volume.
 * One canvas, one draw loop. The stage element flies between registered "slots" with a spring, so the
 * same sphere is the tab-bar button, the voice composer's hero and the review header.
 */

const N = 900;
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

interface Params { rotSpeed: number; amp: number; glow: number; spread: number; dim: number; sweep: number; ring: number }
const TARGET: Record<string, Params> = {
  idle: { rotSpeed: 0.22, amp: 0.018, glow: 0.35, spread: 0, dim: 0, sweep: 0, ring: 0 },
  requesting: { rotSpeed: 0.12, amp: 0.03, glow: 0.45, spread: 0, dim: 0, sweep: 0, ring: 0 },
  listening: { rotSpeed: 0.3, amp: 0.05, glow: 0.4, spread: 0, dim: 0, sweep: 0, ring: 0 },
  processing: { rotSpeed: 1.5, amp: 0.012, glow: 0.35, spread: 0, dim: 0, sweep: 1, ring: 0 },
  review: { rotSpeed: 0.1, amp: 0.004, glow: 0.55, spread: 0, dim: 0, sweep: 0, ring: 1 },
  confirmed: { rotSpeed: 0.35, amp: 0.008, glow: 0.6, spread: 0, dim: 0, sweep: 0, ring: 0 },
  error: { rotSpeed: 0.04, amp: 0.0, glow: 0.12, spread: 0, dim: 1, sweep: 0, ring: 0 },
  unavailable: { rotSpeed: 0.04, amp: 0.0, glow: 0.12, spread: 0, dim: 1, sweep: 0, ring: 0 },
};

export class SphereRenderer {
  private ctx: CanvasRenderingContext2D;
  private rot = 0.6;
  private cur: Params = { ...TARGET.idle };
  private t = 0;
  private last = 0;
  constructor(private canvas: HTMLCanvasElement) { this.ctx = canvas.getContext('2d')!; }

  resize(css: number, dpr: number) {
    const px = Math.max(2, Math.round(css * dpr));
    if (this.canvas.width !== px) { this.canvas.width = px; this.canvas.height = px; }
  }

  frame(now: number, css: number, reduced: boolean, colors: { hi: [number, number, number]; lo: [number, number, number]; ok: [number, number, number]; dark: boolean }) {
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    this.t += dt;
    const v = useVoice.getState();
    const tgt = TARGET[v.phase] ?? TARGET.idle;
    const k = 1 - Math.exp(-dt * 5);
    (Object.keys(tgt) as (keyof Params)[]).forEach((key) => { this.cur[key] += (tgt[key] - this.cur[key]) * k; });
    const speed = reduced ? 0 : this.cur.rotSpeed;
    this.rot += dt * speed;

    // real input — zero unless the microphone is genuinely live
    const live = v.phase === 'listening' && mic.active;
    const level = live ? mic.level() : 0;
    const bands = live ? mic.bands() : null;

    const { ctx, canvas } = this;
    const W = canvas.width;
    const c = W / 2;
    const R = c * 0.68; // headroom: audio displacement can push points ~40% outside the resting radius
    ctx.clearRect(0, 0, W, W);

    const count = Math.round(Math.min(N, Math.max(260, css * 7)));
    const tilt = 0.42 + Math.sin(this.t * 0.4) * (reduced ? 0 : 0.05);
    const cr = Math.cos(this.rot), sr = Math.sin(this.rot), ct = Math.cos(tilt), st = Math.sin(tilt);
    const confirmAge = v.phase === 'confirmed' ? (performance.now() - v.since) / 1000 : 9;
    const sweepPhase = this.t * 2.4;

    const buckets: number[][] = [[], [], [], [], [], [], []];
    const dots: { x: number; y: number; r: number }[] = new Array(count);
    const shade = new Float32Array(count);
    const tone = new Float32Array(count); // 0 = base colour, 1 = highlight, 2 = ok

    for (let n = 0; n < count; n++) {
      const i = LAT.order[n];
      let x = LAT.pts[i * 3], y = LAT.pts[i * 3 + 1], z = LAT.pts[i * 3 + 2];
      const lat = Math.abs(y); // 0 equator … 1 pole
      const az = Math.atan2(z, x);

      // radial displacement
      let d = 0;
      let glow = this.cur.glow;
      const breathe = Math.sin(this.t * 1.3 + i * 0.37) * this.cur.amp;
      d += reduced ? 0 : breathe;
      if (bands) {
        const b = Math.min(bands.length - 1, Math.floor(lat * bands.length));
        const wob = 0.6 + 0.4 * Math.sin(this.t * 6 + i * 0.9);
        d += (bands[b] * 0.34 + level * 0.14) * wob;
        glow += bands[b] * 0.6;
      } else if (v.phase === 'listening' && !reduced) {
        d += Math.sin(this.t * 2 + i * 0.21) * 0.025; // no level available: honest gentle idle, no fake "voice"
      }
      if (this.cur.sweep > 0.01) {
        const a = Math.cos(az - sweepPhase) * 0.5 + 0.5;
        const band = Math.exp(-Math.pow(y - Math.sin(this.t * 1.6) * 0.8, 2) / 0.05);
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
        const dist = (1 - y) ; // 0 at top pole → 2 at bottom
        const w = Math.exp(-Math.pow(dist - front, 2) / 0.05);
        d += w * 0.22;
        okMix = Math.max(w, confirmAge < 0.35 ? (0.35 - confirmAge) * 2 : 0);
        glow += w;
      }
      const rr = 1 + Math.max(-0.2, Math.min(0.42, d));
      x *= rr; y *= rr; z *= rr;
      // rotate around Y, then tilt around X
      const x1 = x * cr + z * sr, z1 = -x * sr + z * cr;
      const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
      const persp = 1 / (1 - z2 * 0.22);
      const px = c + x1 * R * persp, py = c + y2 * R * persp;
      const depth = Math.max(0, Math.min(1, (z2 + 1.1) / 2.2)); // 0 back … 1 front
      // light from upper-left-front
      const nx = x1 / rr, ny = y2 / rr, nz = z2 / rr;
      const lam = Math.max(0, nx * -0.42 + ny * -0.52 + nz * 0.74);
      const sh = 0.18 + 0.82 * Math.pow(depth, 1.3) * (0.45 + 0.55 * lam);
      const spacing = Math.sqrt(12.566 / count) * R; // mean lattice spacing in device px
      const size = spacing * 0.21 * (0.4 + 1.0 * depth) * (1 + glow * 0.25);
      dots[n] = { x: px, y: py, r: size };
      shade[n] = Math.min(1, sh + Math.max(0, glow - 0.35) * 0.3 * depth);
      tone[n] = okMix > 0.25 ? 2 : glow > 1.25 ? 1 : 0;
      buckets[Math.max(0, Math.min(6, Math.floor(shade[n] * 7)))].push(n);
    }

    const { hi, lo, ok, dark } = colors;
    const dimK = this.cur.dim;
    for (let b = 0; b < 7; b++) {
      if (!buckets[b].length) continue;
      const a = 0.16 + (b / 6) * 0.84;
      // colour: lo (shadow) → hi (lit accent)
      const m = b / 6;
      let r = lo[0] + (hi[0] - lo[0]) * m, g = lo[1] + (hi[1] - lo[1]) * m, bl = lo[2] + (hi[2] - lo[2]) * m;
      if (dimK > 0.01) { const grey = dark ? 120 : 140; r += (grey - r) * dimK; g += (grey - g) * dimK; bl += (grey - bl) * dimK; }
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${bl | 0},${a * (1 - dimK * 0.5)})`;
      ctx.beginPath();
      for (const n of buckets[b]) { if (tone[n] !== 0) continue; const d = dots[n]; ctx.moveTo(d.x + d.r, d.y); ctx.arc(d.x, d.y, d.r, 0, 6.2832); }
      ctx.fill();
    }
    // highlighted + confirm dots drawn last, brighter
    ctx.fillStyle = `rgba(${Math.min(255, hi[0] + 10)},${Math.min(255, hi[1] + 30)},${Math.min(255, hi[2] + 30)},0.98)`;
    ctx.beginPath();
    for (let n = 0; n < count; n++) if (tone[n] === 1) { const d = dots[n]; ctx.moveTo(d.x + d.r * 1.15, d.y); ctx.arc(d.x, d.y, d.r * 1.15, 0, 6.2832); }
    ctx.fill();
    ctx.fillStyle = `rgba(${ok[0]},${ok[1]},${ok[2]},0.98)`;
    ctx.beginPath();
    for (let n = 0; n < count; n++) if (tone[n] === 2) { const d = dots[n]; ctx.moveTo(d.x + d.r * 1.2, d.y); ctx.arc(d.x, d.y, d.r * 1.2, 0, 6.2832); }
    ctx.fill();
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
    const pAc = probe('--ac'), pAc2 = probe('--ac-2');
    let colors = { hi: [255, 138, 77] as [number, number, number], lo: [150, 70, 40] as [number, number, number], ok: [95, 208, 138] as [number, number, number], dark: true };
    const refreshColors = () => {
      const theme = document.documentElement.dataset.theme;
      if (frame++ % 6 !== 0 && colorKey === theme) return;
      colorKey = theme ?? '';
      const dark = theme !== 'light';
      const ac = parseColor(getComputedStyle(pAc).color, [255, 91, 36]);
      const ac2 = parseColor(getComputedStyle(pAc2).color, [255, 138, 77]);
      colors = dark
        ? { hi: ac2, lo: [ac[0] * 0.42, ac[1] * 0.42, ac[2] * 0.42] as [number, number, number], ok: [110, 222, 150], dark }
        : { hi: ac, lo: [150, 110, 95], ok: [30, 160, 95], dark };
    };

    const tick = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      refreshColors();
      const dt = Math.min(0.05, (now - last) / 1000);
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
      if (!st.init || reduced) { st.x = tx; st.y = ty; st.s = ts; st.vx = st.vy = st.vs = 0; st.init = true; }
      else {
        // critically-damped-ish spring (follows moving slots such as a sheet mid-slide)
        const k = 210, c = 2 * Math.sqrt(k) * 0.92;
        for (const key of ['x', 'y', 's'] as const) {
          const target = key === 'x' ? tx : key === 'y' ? ty : ts;
          const vk = (`v${key}`) as 'vx' | 'vy' | 'vs';
          st[vk] += (-k * (st[key] - target) - c * st[vk]) * dt;
          st[key] += st[vk] * dt;
        }
      }
      const size = Math.max(8, st.s);
      el.style.opacity = '1';
      el.style.width = el.style.height = `${size}px`;
      el.style.transform = `translate3d(${st.x}px, ${st.y}px, 0)`;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      renderer.resize(size, dpr);
      renderer.frame(now, size, reduced, colors);
    };
    raf = requestAnimationFrame(tick);
    const onVis = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(tick); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { running = false; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); pAc.remove(); pAc2.remove(); };
  }, [motionPref]);

  return (
    <div ref={root} className="sphere-stage" aria-hidden="true" style={{ position: 'fixed', left: 0, top: 0, zIndex: 75, pointerEvents: 'none', opacity: 0, willChange: 'transform,width,height' }}>
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
