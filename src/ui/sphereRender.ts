/**
 * The Aven sphere's drawing: ~1100 points on a Fibonacci lattice, lit from upper-left so it reads as a volume. Pure drawing
 * code with no app imports, so the same renderer runs on the page or in a worker (sphere.worker.ts), where it is not tied
 * to the page's script frame rate.
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
 * The light moves, the sphere never does: five smooth travelling waves of LIGHT over the surface (not per-dot jitter). Its
 * outline is always a perfect sphere — a voice, a tap or a change of state shows as light running over it, never as a change
 * of shape. Low frequencies take the bass, the finer waves the highs, so a voice makes slow swells of light with a fine
 * shimmer on top.
 */
const WAVES = [
  { d: [0.8, 0.5, 0.33], f: 2.1, s: 0.9 }, { d: [-0.6, 0.7, 0.38], f: 2.6, s: 1.25 }, { d: [0.1, -0.9, 0.42], f: 3.2, s: 1.1 },
  { d: [-0.5, -0.3, 0.81], f: 4.4, s: 2.3 }, { d: [0.95, -0.2, -0.24], f: 5.8, s: 3.1 },
].map((w) => { const l = Math.hypot(w.d[0], w.d[1], w.d[2]); return { x: w.d[0] / l, y: w.d[1] / l, z: w.d[2] / l, f: w.f, s: w.s }; });

interface Params { rotSpeed: number; shimmer: number; glow: number; dim: number; sweep: number; ring: number; halo: number }
const TARGET: Record<string, Params> = {
  idle: { rotSpeed: 0.2, shimmer: 0.022, glow: 0.35, dim: 0, sweep: 0, ring: 0, halo: 0.16 },
  requesting: { rotSpeed: 0.16, shimmer: 0.03, glow: 0.45, dim: 0, sweep: 0, ring: 0, halo: 0.24 },
  listening: { rotSpeed: 0.28, shimmer: 0.03, glow: 0.42, dim: 0, sweep: 0, ring: 0, halo: 0.3 },
  processing: { rotSpeed: 1.6, shimmer: 0.016, glow: 0.4, dim: 0, sweep: 1, ring: 0, halo: 0.34 },
  review: { rotSpeed: 0.1, shimmer: 0.008, glow: 0.55, dim: 0, sweep: 0, ring: 1, halo: 0.2 },
  confirmed: { rotSpeed: 0.4, shimmer: 0.01, glow: 0.6, dim: 0, sweep: 0, ring: 0, halo: 0.42 },
  error: { rotSpeed: 0.05, shimmer: 0.004, glow: 0.12, dim: 1, sweep: 0, ring: 0, halo: 0 },
  unavailable: { rotSpeed: 0.05, shimmer: 0.004, glow: 0.12, dim: 1, sweep: 0, ring: 0, halo: 0 },
};

type RGB = [number, number, number];
export interface SphereColors { hi: RGB; lo: RGB; alt: RGB; ok: RGB; dark: boolean }


/** Everything the renderer needs from the app for one frame (so it can also run in a worker, away from the page). */
export interface OrbInputs {
  phase: string;
  /** seconds since the phase began */
  phaseAge: number;
  /** the microphone is genuinely live */
  live: boolean;
  /** noise-gated voice energy 0..1 (mic.voice()) and its 16 bands, read once per app frame */
  raw: number;
  bands: Float32Array | null;
  /** finger on the orb (0/1) and a tap to release (strength); the renderer consumes the tap */
  press: number;
  tap: number;
  /** a flight between places started (strength): the dots turn a little faster and the light stays calm while it travels */
  whoosh?: number;
  /** how big the orb is on screen right now (css px). The canvas is drawn at a fixed size bucket and scaled, so the number of
   * dots follows what you see, not the bucket: no sudden change of texture when the bucket changes after a flight. */
  vis?: number;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export class SphereRenderer {
  private ctx: Ctx2D;
  private rot = 0.6;
  private cur: Params = { ...TARGET.idle };
  private t = 0;
  private last = 0;
  private env = 0;                         // smoothed voice level (fast attack, slow release)
  private bandEnv = new Float32Array(3);   // smoothed low / mid / high energy
  private lat = new Float32Array(16);       // smoothed per-band energy, laid out over the sphere's latitudes like an equaliser
  private body = 0;                         // slower "presence" of the voice: drives the inner light
  private prevV = 0;
  private onsetAt = -1;
  private rings: { age: number; amp: number }[] = []; // two thin rings leave the sphere on a tap
  private kick = 0;                        // a soft bloom of light whenever the state changes (tap → listen → think → done)
  private kickV = 0;
  private lastPhase = '';
  private press = 0;                       // finger down (smoothed): the inner light gathers
  private sc = 1; private scV = 0;         // the whole sphere's scale: pressed it sinks in a touch, released it springs back
  private spin = 0;                        // extra turn speed from a tap or a flight, decaying
  private calm = 0;                        // seconds left of a flight's calm start (flashes and blooms damped)
  private flash = 0;                       // light running through the dots after a tap or a syllable
  /** how loudly you are speaking right now, 0..1 (time-smoothed) — for things around the orb that should breathe with it */
  get voice() { return Math.min(1, this.body * 0.75 + this.env * 0.45); }
  constructor(private canvas: HTMLCanvasElement | OffscreenCanvas) { this.ctx = canvas.getContext('2d') as Ctx2D; }

  resize(css: number, dpr: number) {
    const px = Math.max(2, Math.round(css * dpr));
    if (this.canvas.width !== px) { this.canvas.width = px; this.canvas.height = px; }
  }

  frame(now: number, css: number, reduced: boolean, colors: SphereColors, inp: OrbInputs) {
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    this.t += dt;
    const v = { phase: inp.phase };
    const tgt = TARGET[v.phase] ?? TARGET.idle;
    const k = 1 - Math.exp(-dt * 4.5);
    (Object.keys(tgt) as (keyof Params)[]).forEach((key) => { this.cur[key] += (tgt[key] - this.cur[key]) * k; });
    // a flight is starting: the dots turn a little faster (it rolls as it travels) and for a moment the light stays calm —
    // the travel itself is the motion
    if (inp.whoosh && inp.whoosh > 0) {
      if (!reduced) { this.spin += 1.2 * inp.whoosh; this.calm = 0.75; }
      inp.whoosh = 0;
    }
    this.calm = Math.max(0, this.calm - dt);
    const soft = this.calm > 0 ? 0.25 : 1;
    if (v.phase !== this.lastPhase) { if (this.lastPhase && !reduced) this.kickV += (v.phase === 'error' || v.phase === 'unavailable' ? -1.4 : 3.2) * soft; this.lastPhase = v.phase; }
    // the bloom is a damped spring, so the light swells, overshoots a touch and settles
    this.kickV += (-90 * this.kick - 11 * this.kickV) * dt; this.kick += this.kickV * dt;
    // touch: a press sinks the whole sphere in by a few percent (it stays a sphere) and gathers its light; letting go springs
    // it back, and a tap sends a flash of light through it, a quick spin and two rings
    this.press += (inp.press - this.press) * (1 - Math.exp(-dt * (inp.press > this.press ? 18 : 10)));
    const scTo = reduced ? 1 : 1 - 0.055 * inp.press;
    for (let rem = dt; rem > 1e-6; rem -= 1 / 240) {
      const h = Math.min(rem, 1 / 240); // small steps: stable at any frame time
      this.scV += (-420 * (this.sc - scTo) - 34 * this.scV) * h; this.sc += this.scV * h;
    }
    if (inp.tap > 0) {
      if (!reduced) {
        this.spin += 6 * inp.tap * soft; this.flash = Math.min(1, this.flash + inp.tap * soft);
        if (soft === 1 && this.rings.length < 4) this.rings.push({ age: 0, amp: 1 }, { age: -0.16, amp: 0.7 });
      }
      inp.tap = 0;
    }
    this.spin *= Math.exp(-dt * 3.2); this.flash *= Math.exp(-dt * 3.6);
    const speed = reduced ? 0 : this.cur.rotSpeed * (1 + Math.max(0, this.kick) * 2) + this.spin;
    this.rot += dt * speed;

    // real input — zero unless the microphone is genuinely live. Everything is smoothed here by TIME (not per call), with a
    // very fast attack so a syllable lands on the very frame it starts, and a slower release so it fades like a bell.
    const live = v.phase === 'listening' && inp.live;
    const raw = live ? inp.raw : 0;
    const bands = live ? inp.bands : null;
    const att = (cur: number, to: number, up = 38, down = 7) => cur + (to - cur) * (1 - Math.exp(-dt * (to > cur ? up : down)));
    this.env = att(this.env, raw);
    this.body = att(this.body, raw, 9, 2.4);
    // a sudden rise in energy = a new syllable: a bloom and a flash of light run through it
    if (live && !reduced && raw - this.prevV > 0.1 && raw > 0.18 && this.t - this.onsetAt > 0.11) {
      this.onsetAt = this.t;
      this.kickV += 1.1 + raw * 2.2;
      this.flash = Math.min(1, this.flash + 0.2 + raw * 0.3);
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
    // one radius, always: no breathing, no swelling with the voice, no bulges — only a press scales the whole sphere evenly
    const R = c * 0.66 * this.sc;
    ctx.clearRect(0, 0, W, W);

    const { hi, lo, alt, ok, dark } = colors;
    // soft inner light: the sphere glows from within, brighter while you speak
    const haloA = (this.cur.halo + this.body * 0.55 + this.env * 0.25 + Math.max(0, this.kick) * 0.25 + this.press * 0.35 + this.flash * 0.6) * (1 - this.cur.dim * 0.8);
    if (haloA > 0.01) {
      const gr = ctx.createRadialGradient(c, c, R * 0.15, c, c, c * 0.98);
      gr.addColorStop(0, `rgba(${hi[0] | 0},${hi[1] | 0},${hi[2] | 0},${Math.min(0.55, haloA * (dark ? 0.55 : 0.4))})`);
      gr.addColorStop(0.55, `rgba(${alt[0] | 0},${alt[1] | 0},${alt[2] | 0},${Math.min(0.3, haloA * (dark ? 0.22 : 0.16))})`);
      gr.addColorStop(1, `rgba(${alt[0] | 0},${alt[1] | 0},${alt[2] | 0},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c, c, c * 0.98, 0, 6.2832); ctx.fill();
    }

    // how many dots: from the size it is SEEN at (so a flight grows or thins them gradually, and a canvas bucket change after
    // landing changes nothing you can see). Dots at the edge of the count shrink away rather than pop.
    const vis = Math.max(8, inp.vis ?? css);
    const nf = Math.min(N, Math.max(280, vis * 6.5));
    const count = Math.min(N, Math.ceil(nf));
    const FADE = 36;
    const tilt = 0.42 + Math.sin(this.t * 0.37) * (reduced ? 0 : 0.06);
    const cr = Math.cos(this.rot), sr = Math.sin(this.rot), ct = Math.cos(tilt), st = Math.sin(tilt);
    const confirmAge = v.phase === 'confirmed' ? inp.phaseAge : 9;
    const sweepPhase = this.t * 2.4;
    const T = reduced ? 0 : this.t;
    const amps = [
      this.cur.shimmer + eLo * 0.22 + this.env * 0.05, this.cur.shimmer * 0.9 + eLo * 0.16,
      this.cur.shimmer * 0.7 + eMid * 0.12, this.cur.shimmer * 0.5 + eMid * 0.08 + eHi * 0.04, this.cur.shimmer * 0.35 + eHi * 0.07,
    ];
    if (!live && v.phase === 'listening') { amps[0] += 0.015; amps[1] += 0.012; } // no level available: honest gentle light, no fake voice
    const spacing = Math.sqrt(12.566 / nf) * R;

    // buckets: 7 light levels × 3 hue mixes (accent ↔ the area's second colour, drifting round the sphere)
    const NB = 7, NH = 3;
    const buckets: number[][] = Array.from({ length: NB * NH }, () => []);
    const dots: { x: number; y: number; r: number }[] = new Array(count);
    const tone = new Uint8Array(count); // 0 = base colour, 1 = highlight, 2 = ok

    for (let n = 0; n < count; n++) {
      const i = LAT.order[n];
      const x = LAT.pts[i * 3], y = LAT.pts[i * 3 + 1], z = LAT.pts[i * 3 + 2];
      const az = Math.atan2(z, x);

      // light, not displacement: every effect below brightens or dims a dot; none moves it off the sphere
      let lw = 0;
      let glow = this.cur.glow;
      for (let w = 0; w < 5; w++) {
        const ww = WAVES[w];
        lw += amps[w] * Math.sin((x * ww.x + y * ww.y + z * ww.z) * ww.f + T * ww.s + w * 1.7);
      }
      if (live) {
        // equaliser over the latitudes: low voice at the bottom, highs towards the top; it turns with the sphere
        const fb = (1 - y) * 7.5, b0 = Math.min(14, Math.floor(fb)), fr = fb - b0;
        const e = this.lat[b0] * (1 - fr) + this.lat[b0 + 1] * fr;
        lw += e * 0.085 * (0.65 + 0.35 * Math.cos(az * 2 - this.rot * 1.5 + T * 1.2));
        glow += e * 0.9;
      }
      glow += this.env * 0.9 + Math.max(0, lw) * 3;
      if (this.kick > 0.01) glow += this.kick * 0.3 * (0.6 + 0.4 * Math.sin(y * 3 + T * 4));
      if (this.press > 0.01) glow += this.press * 0.25 * (1 - Math.abs(y));
      if (this.flash > 0.02) glow += this.flash * (0.6 + 1.8 * Math.max(0, Math.sin(y * 5 - this.t * 16))); // a band of light runs through it
      if (this.cur.sweep > 0.01) {
        const a = Math.cos(az - sweepPhase) * 0.5 + 0.5;
        const band = Math.exp(-Math.pow(y - Math.sin(T * 1.6) * 0.8, 2) / 0.05);
        glow += (band * 0.9 + a * 0.15) * this.cur.sweep;
      }
      if (this.cur.ring > 0.01) glow += Math.exp(-(y * y) / 0.004) * 0.9 * this.cur.ring;
      let okMix = 0;
      if (confirmAge < 1.6) {
        const front = confirmAge * 2.6 - 0.3;
        const w = Math.exp(-Math.pow((1 - y) - front, 2) / 0.05);
        okMix = Math.max(w, confirmAge < 0.35 ? (0.35 - confirmAge) * 2 : 0);
        glow += w * 1.6;
      }
      const x1 = x * cr + z * sr, z1 = -x * sr + z * cr;
      const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
      const persp = 1 / (1 - z2 * 0.24);
      const px = c + x1 * R * persp, py = c + y2 * R * persp;
      const depth = Math.max(0, Math.min(1, (z2 + 1.1) / 2.2)); // 0 back … 1 front
      const lam = Math.max(0, x1 * -0.42 + y2 * -0.52 + z2 * 0.74);
      const rim = Math.pow(1 - Math.abs(z2), 3) * 0.35 * depth; // a thin bright rim reads as glass
      const sh = Math.min(1, 0.16 + 0.84 * Math.pow(depth, 1.25) * (0.42 + 0.58 * lam) + rim + Math.max(0, glow - 0.4) * 0.25 * depth);
      const fade = nf >= N || n < nf - FADE ? 1 : Math.max(0, (nf - n) / FADE);
      const size = spacing * 0.2 * (0.35 + 1.05 * depth) * (1 + Math.min(1.2, glow) * 0.22) * fade;
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
        for (const n of list) { if (tone[n] !== 0) continue; const d = dots[n]; if (d.r < 0.05) continue; ctx.moveTo(d.x + d.r, d.y); ctx.arc(d.x, d.y, d.r, 0, 6.2832); }
        ctx.fill();
      }
    }
    ctx.fillStyle = `rgba(${Math.min(255, hi[0] + 30)},${Math.min(255, hi[1] + 50)},${Math.min(255, hi[2] + 50)},0.95)`;
    ctx.beginPath();
    for (let n = 0; n < count; n++) if (tone[n] === 1) { const d = dots[n]; if (d.r < 0.05) continue; ctx.moveTo(d.x + d.r * 1.15, d.y); ctx.arc(d.x, d.y, d.r * 1.15, 0, 6.2832); }
    ctx.fill();
    ctx.fillStyle = `rgba(${ok[0]},${ok[1]},${ok[2]},0.98)`;
    ctx.beginPath();
    for (let n = 0; n < count; n++) if (tone[n] === 2) { const d = dots[n]; if (d.r < 0.05) continue; ctx.moveTo(d.x + d.r * 1.2, d.y); ctx.arc(d.x, d.y, d.r * 1.2, 0, 6.2832); }
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // a tap: two thin rings leave the sphere and fade
    if (this.rings.length) {
      ctx.lineWidth = Math.max(1, W * 0.006);
      for (const r of this.rings) {
        if (r.age < 0) continue; // a ring waiting for its turn
        const e = 1 - Math.pow(1 - r.age, 2);
        ctx.strokeStyle = `rgba(${hi[0] | 0},${hi[1] | 0},${hi[2] | 0},${(1 - r.age) * r.amp * (dark ? 0.5 : 0.4)})`;
        ctx.beginPath(); ctx.arc(c, c, R * (1.06 + e * 0.3), 0, 6.2832); ctx.stroke();
      }
    }
  }
}
