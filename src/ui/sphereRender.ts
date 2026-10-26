/**
 * The Aven sphere's drawing: ~1100 points on a Fibonacci lattice, lit from upper-left so it reads as a volume. Pure drawing
 * code with no app imports, so the same renderer runs on the page or in a worker (sphere.worker.ts), where it is not tied
 * to the page's script frame rate.
 */
// One pattern everywhere: the same 400 evenly spaced beads whether the orb is a 44 px button in the dock or the 250 px orb
// screen — only the scale changes, so it is recognisably the same object wherever it goes (it used to be a sparse, patchy
// sample of a 1100-dot lattice when small and a dense one when big).
import { LOGO } from './logoDots';

const N = 400;
type V3 = Float32Array;
// a colour change's wave: each bead switches when the mix passes WAVE_J + WAVE_S × (its height, 0 bottom … 1 top) ± WAVE_J.
// The offset is ±12% of the sweep: a narrow front of about three rows of mixed beads (a wider one reads as stripes that
// blur to grey), and every bead has switched between mix 0 and 1.
const WAVE_S = 1 / 1.24, WAVE_J = 0.12 * WAVE_S;

function lattice(): { pts: V3; order: Uint16Array; jit: Float32Array } {
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
  // a colour change's wave (see WAVE_S): each bead's small offset, spread evenly (golden-ratio steps, so no clump of beads
  // switches together), taken in the shuffled order so neighbours on the sphere get unrelated ones (in lattice order they
  // would follow its spiral and draw a seam)
  const jit = new Float32Array(N);
  for (let n = 0; n < N; n++) jit[order[n]] = 2 * (((n + 0.5) * 0.6180339887) % 1) - 1;
  return { pts, order, jit };
}
const LAT = lattice();

// Stardust's look everywhere (Omar, 26 Oct: "make it the same design all over the place"): outside the launch the orb is
// drawn as the same fine dust as the live orb (ui/stardust): specks of many sizes on a sphere's shell and a few inside,
// turning in currents that slide past each other, light gathered in streams, a few twinkling. The 400 beads stay only for
// the launch logo (each bead is one of its dots), then hand over to the dust.
const DN = 1500;
const DUST = (() => {
  let seed = 11; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const g = Math.PI * (3 - Math.sqrt(5)), lat = new Float32Array(DN), lon = new Float32Array(DN), sh = new Float32Array(DN), sz = new Float32Array(DN), ph = new Float32Array(DN);
  for (let i = 0; i < DN; i++) {
    const y = 1 - (2 * (i + 0.5)) / DN; lat[i] = y; lon[i] = i * g;
    sh[i] = rnd() < 0.16 ? 0.42 + rnd() * 0.42 : 0.93 + rnd() * 0.09;
    const u = rnd(); sz[i] = u < 0.72 ? 0.7 + rnd() * 0.5 : u < 0.95 ? 1.2 + rnd() * 0.8 : 2 + rnd() * 1.2;
    ph[i] = rnd() * 6.2832;
  }
  // (shuffled, so a smaller orb draws an even share of them)
  const order = new Uint16Array(DN); for (let i = 0; i < DN; i++) order[i] = i;
  for (let i = DN - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  return { lat, lon, sh, sz, ph, order };
})();
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** the dust, drawn round (c, c) at radius R: `light` its extra light (voice, a tap, a press), `k` how much of it shows */
function drawDust(ctx: Ctx2D, c: number, R: number, t: number, rot: number, vis: number, light: number, k: number, hi: RGB, lo: RGB, alt: RGB, dark: boolean, reduced: boolean) {
  // (a palette of 14 shades from the far side's second colour through the accent to white, made once per frame)
  const pal: string[] = [];
  for (let q = 0; q < 14; q++) { const m = q / 13; const a = m < 0.5 ? m * 2 : 1, w = m < 0.5 ? 0 : (m - 0.5) * 2 * (dark ? 0.7 : 0.25);
    const base: RGB = [alt[0] + (hi[0] - alt[0]) * a, alt[1] + (hi[1] - alt[1]) * a, alt[2] + (hi[2] - alt[2]) * a];
    const d = dark ? 1 : 0.72; pal.push(`rgb(${((base[0] + (255 - base[0]) * w) * d) | 0},${((base[1] + (255 - base[1]) * w) * d) | 0},${((base[2] + (255 - base[2]) * w) * d) | 0})`); }
  void lo;
  const count = Math.min(DN, Math.max(900, Math.round(vis * 16)));
  const small = 1 + 1.1 * smooth(110, 40, vis); // (a small orb, in the dock: brighter, so it is still dust, not haze)
  const tilt = 0.38, ct = Math.cos(tilt), st = Math.sin(tilt), T = reduced ? 0 : t;
  const px = R / 70; // (a speck's size follows the orb, as on the live orb)
  for (let n = 0; n < count; n++) {
    const i = DUST.order[n], y0 = DUST.lat[i], shell = DUST.sh[i];
    const flow = (0.6 * Math.sin(y0 * 3.6 + 1.3) + 0.25 * Math.sin(y0 * 7.9 - 0.4)) * (0.55 + 0.45 * shell) * (reduced ? 0 : 1);
    const shear = flow * (0.9 * Math.sin(T * 0.11) + 0.5 * Math.sin(T * 0.07 + 1));
    const lon = DUST.lon[i] + rot + shear, rr = Math.sqrt(1 - y0 * y0);
    const x = Math.cos(lon) * rr, z0 = Math.sin(lon) * rr;
    const y = y0 * ct - z0 * st, z = y0 * st + z0 * ct;
    const persp = 1 / (1 - z * 0.28), rad = shell * R * (1 + 0.012 * Math.sin(T * 1.05));
    const sx = c + x * rad * persp, sy = c - y * rad * persp;
    const depth = (z / Math.max(shell, 0.3) + 1) * 0.5;
    const lonF = DUST.lon[i] + shear * 1.6 + T * 0.03;
    const cloud = 0.5 + 0.5 * Math.sin(y0 * 5.5 + Math.sin(lonF * 2 + T * 0.3) * 1.3 + T * 0.2) * Math.cos(lonF * 1.5 - T * 0.15);
    const lit = Math.min(1, smooth(0.52, 0.86, cloud) + light * 0.5);
    const tw = reduced ? 0 : Math.pow(0.5 + 0.5 * Math.sin(T * (1.3 + DUST.ph[i] * 0.4) + DUST.ph[i] * 6), 14) * (DUST.sz[i] > 2 ? 1 : 0.35);
    const a = (0.06 + 0.94 * Math.pow(depth, 1.6)) * (0.12 + 0.88 * lit) * (1 + tw * 0.8) * k * (dark ? 1 : 1.5) * small;
    if (a < 0.02) continue;
    ctx.globalAlpha = Math.min(1, a);
    ctx.fillStyle = pal[Math.max(0, Math.min(13, Math.round((0.3 + 0.4 * depth + 0.3 * lit + 0.2 * tw) * 13)))];
    const w = Math.max(0.7, DUST.sz[i] * px * (0.55 + 0.6 * depth) * (1 + tw * 0.6));
    ctx.fillRect(sx - w / 2, sy - w / 2, w, w);
  }
  ctx.globalAlpha = 1;
}
/** Orbit's beads: three rows of the orb's own beads round it (inner row fewest), each with its place, a small spread off
 *  the row (dust, not a drawn line), its own size and its own slow twinkle. Fixed, so nothing ever jumps. */
const ORBIT = (() => {
  const rows = [72, 92, 112], n = rows.reduce((a, b) => a + b, 0);
  const row = new Uint8Array(n), ang = new Float32Array(n), jr = new Float32Array(n), js = new Float32Array(n), tw = new Float32Array(n);
  let seed = 11, k = 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  rows.forEach((m, r) => { for (let i = 0; i < m; i++, k++) { row[k] = r; ang[k] = ((i + rnd() * 0.6) / m) * Math.PI * 2; jr[k] = rnd() * 2 - 1; js[k] = 0.7 + rnd() * 0.6; tw[k] = rnd() * Math.PI * 2; } });
  return { n, row, ang, jr, js, tw };
})();
// Each row's radius (× the sphere's), bead size (× the sphere's beads), light and turn speed: three clean lanes, the inner one
// the strongest. With Orbit the sphere is drawn at ORBIT_S of its usual size in its canvas (the orb screen gives it a canvas
// that much bigger), so the ring has room: its outer row ends at 0.81 of the canvas's half, everything fades out by 0.97.
const ORBIT_R = [1.45, 1.65, 1.85], ORBIT_B = [0.72, 0.58, 0.46], ORBIT_A = [1, 0.78, 0.52], ORBIT_W = [1, 0.93, 0.86];
export const ORBIT_S = 0.66;

const ALL = (() => { const a = new Uint16Array(N); for (let i = 0; i < N; i++) a[i] = i; return a; })();

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

// The path two comets of light take round the sphere while it thinks: a tilted great circle (view space). A = its axis,
// U and V span its plane.
const CA = (() => { const v = [0.32, 0.9, 0.29]; const l = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / l); })();
const CU = (() => { const v = [CA[1], -CA[0], 0]; const l = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / l); })(); // A × z
const CV = [CA[1] * CU[2] - CA[2] * CU[1], CA[2] * CU[0] - CA[0] * CU[2], CA[0] * CU[1] - CA[1] * CU[0]];
const TAU = Math.PI * 2;
const easeIO = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
/** where the arrival spiral's front is, `s` seconds in (−0.15 below the bottom pole … 1 the top, which it reaches at ~0.61 s) */
const ignFront = (s: number) => easeIO(s / 0.8) * 1.3 - 0.15;

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
  /** it has just arrived on the orb screen: spirals of light wind up it from the bottom (strength) */
  ignite?: number;
  /** a reply being read aloud: the voice's level 0..1 (tts.speakingLevel), so the orb glows with what it says */
  voiceOut?: number;
  /** a rest between sets is counting (0/1): the inner light breathes deeper and a little warmer, like a slow breath */
  rest?: number;
  /** a set was just ticked (strength): one soft heartbeat of light and a single ring of the success colour; consumed */
  beat?: number;
  /** the launch: 1 = drawn as the launch logo, exactly (its flat dots, colours and size, scripts/orb-svg.mjs), so the logo
   *  can be swapped for it unseen; set to 0, it becomes the sphere on its own clock (each bead flows from its logo dot
   *  to its place on the turning sphere, ~0.4 s) */
  logo?: number;
  /** a change of palette as a crossfade (the launch: from the logo's ember to the palette's colours): each bead turns from
   *  `colors` to `colorsTo` as `colorMix` goes 0 → 1, in one wave from the bottom (the side it is heading for) to the top,
   *  each bead in one step: never a blend of the two (ember and teal blended are grey) */
  colorsTo?: SphereColors;
  colorMix?: number;
  /** Orbit (Omar, 26 Oct, the orb screen talking live): a ring of the orb's own beads circling it like a planet's ring,
   *  passing behind it and in front of it. 1 = there; it gathers in as this rises and drifts away as it falls. */
  orbit?: number;
  /** how far a finger has moved the orb from its place (css px): the ring trails behind the move with some inertia */
  lean?: [number, number];
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
  private rings: { age: number; amp: number; ok?: boolean }[] = []; // two rings of light leave the sphere on a tap (green when something was done)
  private kick = 0;                        // a soft bloom of light whenever the state changes (tap → listen → think → done)
  private kickV = 0;
  private lastPhase = '';
  private press = 0;                       // finger down (smoothed): the inner light gathers
  private sc = 1; private scV = 0;         // the whole sphere's scale: pressed it sinks in a touch, released it springs back
  private spin = 0;                        // extra turn speed from a tap or a flight, decaying
  private calm = 0;                        // seconds left of a flight's calm start (flashes and blooms damped)
  private flash = 0;                       // light running through the dots after a tap or a syllable
  private bandA = new Float32Array(N);       // the launch coil's light on each bead (0 … 1), drawn over it
  private ignSeen = false;                 // the launch's arrival spiral: climbs by height as you see it (and carries the colour)
  private lTurn = 0; private lRot0 = 0;    // the launch's spiral: the extra turn it has given the sphere so far, and its start
  private lT = -1;                         // seconds since the launch's spiral started (-1: none)
  private ripples: { ox: number; oy: number; oz: number; age: number; amp: number }[] = []; // a syllable: a ring of light crossing it towards you
  private restK = 0;                       // how far into its resting breath it is (smoothed 0..1, so it eases in and out)
  private ign = -1;                        // seconds into the arrival spiral (-1: none)
  private ignTop = false;                  // its front has reached the top (the whole orb lit up)
  private lk = 0;                          // how much it is still the launch logo (1 … 0)
  private dk = 1;                          // how much it is dust (0 while it is the launch logo; eases in after it)
  private lt = -1;                         // seconds into becoming the sphere (-1: not yet)
  /** each bead's logo dot (-1: on the far side, it isn't in the logo), its share of that dot's light, and the logo dots no
   *  near bead is closest to (drawn by their nearest bead's twin, fading as the sphere forms). Fixed when the logo is
   *  first drawn, so no bead ever changes dot. */
  // ── Orbit: the ring (see OrbInputs.orbit) ──
  private oK = 0;                           // how much of the ring is there (0 … 1, eased)
  private oSz = 0;                          // the sphere's room for it (0 … 1, quicker: it rides the flight to the orb screen)
  private oSpin = 0;                        // its turn round the orb
  private oRad = 1; private oRadV = 0;      // its radius (× its resting radius), on a spring: gathers in to think, swells to speak
  private oGather = 0;                      // thinking: the ring pours into the glass and becomes the ribbon (0 … 1)
  private oRib = 0;                         // the ribbon inside the glass (0 … 1)
  private ribCv: OffscreenCanvas | null = null; // the ribbon's own layer (drawn solid, laid in as one)
  private oLx = 0; private oLy = 0; private oVx = 0; private oVy = 0; // a spring following the finger's move (css px)
  private oIn = new Float32Array(16);       // your voice per band, laid round the ring
  private oOut = 0;                         // its voice
  private oPrevOut = 0; private oOutAt = -1;
  private echoes: { age: number; amp: number; ok?: boolean }[] = []; // a syllable it says: a wave of light out across the ring
  private oOk = -1;                         // done: the success colour sweeping round it (seconds in; -1 none)
  private lmap: { dot: Int16Array; w: Float32Array; extra: { j: number; n: number }[] } | null = null;
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
    if (v.phase !== this.lastPhase) {
      if (this.lastPhase && !reduced) this.kickV += (v.phase === 'error' || v.phase === 'unavailable' ? -1.4 : 3.2) * soft;
      // done: a pulse of the success colour leaves it, as the wave of green climbs through it
      if (v.phase === 'confirmed' && !reduced && this.rings.length < 4) this.rings.push({ age: 0, amp: 0.9, ok: true }, { age: -0.18, amp: 0.6, ok: true });
      if (v.phase === 'confirmed' && !reduced) this.oOk = 0;
      this.lastPhase = v.phase;
    }
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
    if (inp.ignite && inp.ignite > 0) {
      // (the launch's spiral adds no sudden spin: the turn it already has carries on evenly, no jolt in the motion)
      if (!reduced) { this.ign = 0; this.ignTop = false; this.ignSeen = inp.ignite >= 2; if (!this.ignSeen) this.spin += 2.2; this.lTurn = 0; this.lRot0 = this.rot; this.lT = this.ignSeen ? 0 : -1; }
      inp.ignite = 0;
    }
    if (this.ign >= 0) {
      this.ign += dt * (this.ignSeen ? 1.67 : 1); // (the launch's runs quicker: every bead has turned before the orb sets off)
      // the moment the spiral reaches the top, the whole sphere lights up once (in time with the haptic heartbeat's last thump)
      // (not the launch's: its band is its light, and a flash switched on in one frame would read as a pop)
      if (!this.ignTop && ignFront(this.ign) >= 1) { this.ignTop = true; if (!this.ignSeen) { this.flash = Math.min(1, this.flash + 0.7); this.kickV += 2.4; } }
      if (this.ign > 1.3) this.ign = -1;
    }
    // a set ticked: one heartbeat — the light swells once and a single ring of the success colour leaves it. No spin and no
    // flash through the dots (that is a tap's): this is a calm acknowledgement, not a reaction.
    if (inp.beat && inp.beat > 0) {
      if (!reduced) { this.kickV += 2.6 * inp.beat * soft; if (this.rings.length < 4 && this.oK < 0.3) this.rings.push({ age: 0, amp: 0.75 * inp.beat, ok: true }); this.oOk = 0; }
      inp.beat = 0;
    }
    this.restK += ((inp.rest ? 1 : 0) - this.restK) * (1 - Math.exp(-dt * 0.9));
    if (inp.tap > 0) {
      if (!reduced) {
        // (with Orbit round it the ring answers the tap: the sphere's flash is softer and it draws no outline rings)
        const ow = this.oK > 0.3 ? 0.45 : 1;
        this.spin += 6 * inp.tap * soft; this.flash = Math.min(1, this.flash + inp.tap * soft * ow);
        this.oRadV += 0.7 * inp.tap * soft; // (the ring: thrown out a little, it bounces back)
        if (soft === 1 && ow === 1 && this.rings.length < 4) this.rings.push({ age: 0, amp: 1 }, { age: -0.16, amp: 0.7 });
      }
      inp.tap = 0;
    }
    this.spin *= Math.exp(-dt * 3.2); this.flash *= Math.exp(-dt * 3.6);
    const speed = reduced ? 0 : this.cur.rotSpeed * (1 + Math.max(0, this.kick) * 2) + this.spin;
    this.rot += dt * speed;
    // the launch logo, and its turning into the sphere: an ease of its own, drawn on this clock (so at the screen's rate)
    if (inp.logo !== undefined && inp.logo >= 1 && this.lt < 0) this.lk = 1;
    else if (this.lk > 0) {
      if (this.lt < 0) this.lt = 0; else this.lt += dt;
      this.lk = reduced ? 0 : 1 - easeIO(this.lt / 0.34);
      if (this.lk <= 0) { this.lk = 0; this.lmap = null; }
    }
    const LK = this.lk;

    // real input — zero unless the microphone is genuinely live. Everything is smoothed here by TIME (not per call), with a
    // very fast attack so a syllable lands on the very frame it starts, and a slower release so it fades like a bell.
    const live = v.phase === 'listening' && inp.live;
    // reading a reply aloud, the same light follows its own voice — a little softer than yours, and never a buzz
    const out = !live && inp.voiceOut ? Math.min(1, inp.voiceOut) * 0.8 : 0;
    const raw = live ? inp.raw : out;
    const bands = live ? inp.bands : null;
    const att = (cur: number, to: number, up = 38, down = 7) => cur + (to - cur) * (1 - Math.exp(-dt * (to > cur ? up : down)));
    this.env = att(this.env, raw);
    this.body = att(this.body, raw, 9, 2.4);
    // a sudden rise in energy = a new syllable: a bloom and a flash of light run through it
    if ((live || out) && !reduced && raw - this.prevV > 0.1 && raw > 0.18 && this.t - this.onsetAt > 0.11) {
      this.onsetAt = this.t;
      this.kickV += 0.8 + raw * 1.6;
      // a ring of light starts on the side facing you (a little off centre, never twice in the same spot) and runs round it
      const a = Math.random() * TAU, r = 0.15 + Math.random() * 0.3;
      const ox = Math.cos(a) * r, oy = Math.sin(a) * r - 0.12;
      if (this.ripples.length >= 6) this.ripples.shift();
      this.ripples.push({ ox, oy, oz: Math.sqrt(Math.max(0, 1 - ox * ox - oy * oy)), age: 0, amp: Math.min(1, 0.45 + raw * 0.9) });
    }
    this.prevV = raw;
    for (const r of this.ripples) r.age += dt;
    this.ripples = this.ripples.filter((r) => r.age < 1.3);
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
    // (Orbit: the sphere at ORBIT_S of its canvas, which the orb screen makes that much bigger: it looks the same size)
    this.oSz += ((inp.orbit ? 1 : 0) - this.oSz) * (1 - Math.exp(-dt * 7));
    const R = c * 0.66 * this.sc * (1 - (1 - ORBIT_S) * this.oSz);
    ctx.clearRect(0, 0, W, W);

    const { hi, lo, alt, ok, dark } = colors;
    // soft inner light: the sphere glows from within, brighter while you speak
    // the inner light breathes slowly at rest; during a rest between sets the breath is deeper (same slow beat, ~6 s, so it
    // never jumps) and the light sits a little higher, as if it were waiting with you
    const breathe = reduced ? 1 : 1 + (0.16 + 0.3 * this.restK) * Math.sin(this.t * 1.05);
    const haloA = (1 - LK) * breathe * (this.cur.halo + this.restK * 0.18 + this.body * 0.55 + this.env * 0.25 + Math.max(0, this.kick) * 0.25 + this.press * 0.35 + this.flash * 0.6) * (1 - this.cur.dim * 0.8);
    // a change of colours (OrbInputs.colorsTo): the beads change one by one (below); the light around them (this inner light,
    // the glass edge, the sparkles) goes with them, evenly, so nothing switches in one frame when the change ends
    const ignF = this.ign >= 0 ? ignFront(this.ign) : -9;
    // The launch's spiral (ignite 2): a band of light that winds up the orb from the bottom, rising across the side facing
    // you and dropping back round the far side, and the new colour fills in under it, bead by bead. Never a level line and
    // never a straight seam; its edge is ragged (each bead's own small offset).
    const launchIgn = this.ignSeen && this.ign >= 0;
    const LP = 0.85, LJ = 0.07;
    // (an even climb, eased only at its ends, so the middle of the orb, where you see the spiral, isn't rushed)
    const lU = Math.min(1, Math.max(0, this.ign / 0.9)), lE = launchIgn ? lU * lU * (3 - 2 * lU) : 0;
    const lF = launchIgn ? lE * 1.78 - 0.39 : 0;
    // The band is fixed on the sphere and the sphere turns under it as it climbs (about a quarter round while the colour
    // runs up it, on top of its own turn): the slanted front travels sideways as it rises, so you see it wind up the orb.
    // The turn is one swing: it picks up quickly, then the orb carries it down into the dock and lets it run down evenly to
    // its usual slow turn a moment after it lands (never stopping, never starting again). Its speed: LW·x·e^(1−x), x = t/LTAU.
    if (this.lT >= 0) {
      this.lT += dt;
      const LW = 4, LTAU = 0.27, x = this.lT / LTAU;
      const t = reduced ? this.lTurn : LW * LTAU * Math.E * (1 - Math.exp(-x) * (1 + x));
      this.rot += t - this.lTurn; this.lTurn = t;
      if (x > 14) this.lT = -1;
    }
    const lRot = this.lRot0 / TAU + 0.15; // (the long slope of the band faces you as it passes the middle)
    const lK = this.ign < 0.79 ? 1 : Math.max(0, 1 - (this.ign - 0.79) / 0.16); // the coil's light, gone as the last beads turn
    // (once it has run its course every bead stays new until the change itself ends: never back to the old colour)
    if (!inp.colorsTo && this.ign < 0) this.ignSeen = false;
    // (the light around the beads follows the share that has turned)
    const xkIgn = !inp.colorsTo || !this.ignSeen ? 0 : this.ign >= 0 ? Math.min(1, Math.max(0, (lF + 0.32) / 1.64)) : 1;
    const xk = inp.colorsTo && inp.colorMix !== undefined ? Math.min(1, Math.max(0, inp.colorMix, xkIgn)) : 0;
    const B = inp.colorsTo ?? colors;
    const lerp3 = (x: RGB, y: RGB): RGB => [x[0] + (y[0] - x[0]) * xk, x[1] + (y[1] - x[1]) * xk, x[2] + (y[2] - x[2]) * xk];
    const halo = (h: RGB, a: RGB, w: number) => {
      const gr = ctx.createRadialGradient(c, c, R * 0.15, c, c, c * 0.98);
      gr.addColorStop(0, `rgba(${h[0] | 0},${h[1] | 0},${h[2] | 0},${w * Math.min(0.55, haloA * (dark ? 0.55 : 0.4))})`);
      gr.addColorStop(0.55, `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${w * Math.min(0.3, haloA * (dark ? 0.22 : 0.16))})`);
      gr.addColorStop(1, `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c, c, c * 0.98, 0, 6.2832); ctx.fill();
    };
    if (haloA > 0.01) {
      // two lights crossfading, not one light of an in-between colour (that reads grey)
      if (xk < 1) halo(hi, alt, 1 - xk);
      if (xk > 0) halo(B.hi, B.alt, xk);
    }

    // Orbit: its back half goes behind the sphere (drawn first, hidden where the sphere covers it)
    const orbit = this.orbitFrame(dt, reduced, v.phase, inp, W, css, c, R);
    if (orbit) this.drawOrbit(orbit, false, colors, dark, c, R);

    const nf = N, count = N;
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
    // arrival spiral: a front of light climbing from the bottom pole to the top, three arms winding round as it goes
    const ignK = this.ign < 0 ? 0 : this.ign < 0.75 ? 1 : Math.max(0, 1 - (this.ign - 0.75) / 0.5);
    const rip = this.ripples.map((r) => ({ ...r, front: r.age * 2.7, k: r.amp * Math.pow(1 - r.age / 1.3, 2) }));
    const cometHead = T * 3.1;
    const sway = reduced ? 0 : this.body;

    // buckets: 7 light levels × 3 hue mixes (accent ↔ the area's second colour, drifting round the sphere)
    const NB = 7, NH = 3;
    const NM = xk > 0 && inp.colorsTo ? 2 : 1; // the crossfade: each bead is either the old colour or the new one (1 = none; all new at 1)
    const buckets: number[][] = Array.from({ length: NB * NH * NM }, () => []);
    const dots: { x: number; y: number; r: number; z: number }[] = new Array(count);
    const tone = new Uint8Array(count); // 0 = base colour, 1 = highlight, 2 = ok

    for (let n = 0; n < count; n++) {
      const i = LAT.order[n];
      const x = LAT.pts[i * 3], y = LAT.pts[i * 3 + 1], z = LAT.pts[i * 3 + 2];
      const az = Math.atan2(z, x);
      // where it is on screen (view space: z towards you)
      let x1 = x * cr + z * sr; const z1 = -x * sr + z * cr;
      let y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
      if (sway > 0.002 || rip.length) {
        // your voice moves the beads ALONG the surface (they never leave it, so the outline stays a perfect sphere): each row
        // sways sideways with its own band of your voice like an equaliser, and every syllable's ring pushes the beads it passes
        const fb = Math.min(14.99, Math.max(0, (1 - y2) * 7.5)), b0 = Math.floor(fb), fr = fb - b0;
        const eb = this.lat[b0] * (1 - fr) + this.lat[Math.min(15, b0 + 1)] * fr;
        const phi = (eb * 0.42 + sway * 0.1) * Math.sin(T * 5.2 + y2 * 4.5) + this.env * 0.06 * Math.sin(T * 3.1 + y2 * 9);
        if (phi !== 0) { const cp = Math.cos(phi), sp = Math.sin(phi); const nx = x1 * cp + z2 * sp; z2 = -x1 * sp + z2 * cp; x1 = nx; }
        for (const r of rip) {
          if (r.k < 0.01) continue;
          const cd = Math.max(-1, Math.min(1, x1 * r.ox + y2 * r.oy + z2 * r.oz));
          const dd = Math.acos(cd) - r.front;
          if (dd < -0.7 || dd > 0.7) continue;
          // away from where the ring started, along the surface
          let tx = cd * x1 - r.ox, ty = cd * y2 - r.oy, tz = cd * z2 - r.oz;
          const tl = Math.hypot(tx, ty, tz); if (tl < 1e-4) continue;
          const push = r.k * 0.2 * Math.exp(-(dd * dd) / 0.05) / tl;
          tx *= push; ty *= push; tz *= push;
          x1 += tx; y2 += ty; z2 += tz;
          const l = Math.hypot(x1, y2, z2); x1 /= l; y2 /= l; z2 /= l;
        }
      }

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
        glow += e * 0.45;
      }
      glow += this.env * 0.4 + Math.max(0, lw) * 2; // the beads' motion now carries most of the voice; the light only follows it
      // every bead twinkles gently on its own slow beat, so even at rest the orb is alive (light only)
      if (!reduced) glow += 0.1 * Math.sin(T * (0.55 + (i % 7) * 0.11) + i * 2.399);
      if (this.kick > 0.01) glow += this.kick * 0.3 * (0.6 + 0.4 * Math.sin(y * 3 + T * 4));
      if (this.press > 0.01) glow += this.press * 0.25 * (1 - Math.abs(y));
      if (this.flash > 0.02) glow += this.flash * (0.6 + 1.8 * Math.max(0, Math.sin(y * 5 - this.t * 16))); // a band of light runs through it
      if (this.cur.sweep * (1 - this.oRib) > 0.01) {
        // thinking: two comets of light circle it on a tilted orbit, each trailing a fading tail
        const h = x1 * CA[0] + y2 * CA[1] + z2 * CA[2];
        const band = Math.exp(-(h * h) / 0.03);
        if (band > 0.01) {
          const phi = Math.atan2(x1 * CV[0] + y2 * CV[1] + z2 * CV[2], x1 * CU[0] + y2 * CU[1] + z2 * CU[2]);
          for (let k2 = 0; k2 < 2; k2++) {
            const d = (((cometHead + k2 * Math.PI - phi) % TAU) + TAU) % TAU;
            glow += band * Math.exp(-d * 1.3) * 2.6 * this.cur.sweep * (1 - this.oRib);
          }
        }
        glow += (Math.cos(az - sweepPhase) * 0.5 + 0.5) * 0.12 * this.cur.sweep;
      }
      for (const r of rip) {
        // a syllable's ring of light: the distance round the sphere from where it started, against how far it has run
        if (r.k < 0.01) continue;
        const dd = Math.acos(Math.max(-1, Math.min(1, x1 * r.ox + y2 * r.oy + z2 * r.oz))) - r.front;
        if (dd > -0.6 && dd < 0.6) glow += r.k * 0.8 * Math.exp(-(dd * dd) / 0.03);
      }
      // the launch's spiral: this bead's height against its tilted front (as you see it: 0 bottom … 1 top)
      let lq = 0, band = 0;
      if (launchIgn) {
        const h = (1 - y2) / 2; let a = Math.atan2(x, z) / TAU + lRot; a -= Math.round(a); // 0 bottom … 1 top; its place round the sphere
        // the coil's rise round the orb: higher to the left across the side facing you (so, the sphere turning to the right,
        // it climbs as it goes past, like a barber's pole), back down round the far side (gently, so no seam)
        const s = Math.abs(a) <= 0.3 ? a * 1.25 : Math.sign(a) * 0.375 * (0.5 - Math.abs(a)) / 0.2;
        const du = h + LP * s - lF;
        lq = du + LJ * LAT.jit[i] < 0 ? 1 : 0;
        // its light: on the beads that have just turned, all the way round (the far side too, seen through the glass)
        const d = du + 0.035;
        band = lq ? lK * Math.exp(-(d * d) / 0.0045) : 0;
      } else if (ignK > 0) {
        const u = (1 - y) / 2; // 0 bottom pole (on screen) … 1 top
        const arms = 0.5 + 0.5 * Math.cos(az * 3 - u * 13 + this.ign * 4);
        const du = u - ignF;
        glow += ignK * (Math.exp(-(du * du) / 0.005) * (0.8 + 1.8 * arms) + (du < 0 ? Math.exp(du * 5) * 0.35 * arms : 0));
      }
      if (this.cur.ring > 0.01) glow += Math.exp(-(y * y) / 0.004) * 0.9 * this.cur.ring;
      let okMix = 0;
      if (confirmAge < 1.6) {
        const front = confirmAge * 2.6 - 0.3;
        const w = Math.exp(-Math.pow((1 - y) - front, 2) / 0.05);
        okMix = Math.max(w, confirmAge < 0.35 ? (0.35 - confirmAge) * 2 : 0);
        glow += w * 1.6;
      }
      const persp = 1 / (1 - z2 * 0.24);
      const px = c + x1 * R * persp, py = c + y2 * R * persp;
      const depth = Math.max(0, Math.min(1, (z2 + 1.1) / 2.2)); // 0 back … 1 front
      const lam = Math.max(0, x1 * -0.42 + y2 * -0.52 + z2 * 0.74);
      const rim = Math.pow(1 - Math.abs(z2), 3) * 0.35 * depth; // a thin bright rim reads as glass
      // light stays where you can see it: effects light the near side fully and the far side only a little, so the sphere
      // keeps its depth while you speak (it used to blow out to an even white, front and back alike)
      glow = this.cur.glow + (glow - this.cur.glow) * (0.3 + 0.7 * depth);
      let sh = Math.min(1, 0.16 + 0.84 * Math.pow(depth, 1.25) * (0.42 + 0.58 * lam) + rim + Math.max(0, glow - 0.4) * 0.25 * depth);
      // (the spiral's band: its beads about a quarter brighter and a touch fuller, so the band reads at phone size)
      if (band > 0.01) sh = Math.min(1, sh * (1 + 0.25 * band) + 0.06 * band * depth);
      const size = spacing * 0.24 * (0.35 + 1.05 * depth) * (1 + Math.min(1, glow) * 0.16) * (1 + 0.12 * band);
      this.bandA[n] = band * (0.6 + 0.4 * depth) * (1 - 0.45 * sh); // (less on beads already near full: never white)
      dots[n] = { x: px, y: py, r: size, z: z2 };
      // (the launch's spiral lights the beads, never as white sparkles: single white beads read as stuck pixels at that size)
      tone[n] = okMix > 0.25 && depth > 0.42 ? 2 : glow * (0.4 + 0.6 * depth) > 1.25 && !(this.ignSeen && this.ign >= 0) ? 1 : 0; // highlights are sparkles on the near side, not a wash
      const hueMix = 0.5 + 0.5 * Math.sin(az * 1 + y * 1.6 - T * 0.6); // the second colour drifts around the surface
      const hb = Math.min(NH - 1, Math.floor(hueMix * NH));
      // crossfade: one wave of the new colour from the bottom of the orb to its top, each bead in one step: never a blend of
      // the two colours (it reads grey). By its height as you see it (the far side included), so the front is one clean band;
      // it moves far faster than a bead turns, so none switches back
      const qm = NM > 1 && (launchIgn ? lq : xk >= WAVE_J + WAVE_S * ((1 - y2) / 2) + WAVE_J * LAT.jit[i]) ? 1 : 0;
      buckets[(qm * NB + Math.min(NB - 1, Math.floor(sh * NB))) * NH + hb].push(n);
    }

    const dimK = this.cur.dim;
    // dark mode: additive light, so overlapping highlights bloom like light rather than paint
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    const fade = 1 - dimK * 0.5;
    const tint = (b: number, h: number, q = 0): RGB => {
      const c = tintOf(hi, lo, alt, b, h);
      if (!q) return c;
      const d = tintOf(B.hi, B.lo, B.alt, b, h), f = q / (NM - 1);
      return [c[0] + (d[0] - c[0]) * f, c[1] + (d[1] - c[1]) * f, c[2] + (d[2] - c[2]) * f];
    };
    const tintOf = (hi: RGB, lo: RGB, alt: RGB, b: number, h: number): RGB => {
      const m = b / (NB - 1);
      const hm = (h / (NH - 1)) * 0.55;
      const top: RGB = [hi[0] + (alt[0] - hi[0]) * hm, hi[1] + (alt[1] - hi[1]) * hm, hi[2] + (alt[2] - hi[2]) * hm];
      let r = lo[0] + (top[0] - lo[0]) * m, g = lo[1] + (top[1] - lo[1]) * m, bl = lo[2] + (top[2] - lo[2]) * m;
      if (dimK > 0.01) { const grey = dark ? 120 : 140; r += (grey - r) * dimK; g += (grey - g) * dimK; bl += (grey - bl) * dimK; }
      return [r, g, bl];
    };
    const alphaOf = (b: number) => (0.14 + (b / (NB - 1)) * 0.86) * (dark ? 0.8 : 1) * fade * (1 - 0.6 * this.oRib); // (the ribbon's turn: the beads step back)
    const rgba = (c3: RGB, a: number) => `rgba(${c3[0] | 0},${c3[1] | 0},${c3[2] | 0},${a.toFixed(3)})`;
    const whiten = (c3: RGB, k: number): RGB => [c3[0] + (255 - c3[0]) * k, c3[1] + (255 - c3[1]) * k, c3[2] + (255 - c3[2]) * k];
    /** one pass over a set of beads: every bead in it as a disc of `scale` × its size */
    const pass = (list: ArrayLike<number>, want: number, scale: number, style: string) => {
      ctx.fillStyle = style; ctx.beginPath();
      for (let q = 0; q < list.length; q++) { const n = list[q]; if (tone[n] !== want) continue; const d = dots[n]; const rr = d.r * scale; if (rr < 0.05) continue; ctx.moveTo(d.x + rr, d.y); ctx.arc(d.x, d.y, rr, 0, TAU); }
      ctx.fill();
    };
    // Beads of light, not flat dots. Each lit bead on the near side glows softly into the space around it (a wide, faint
    // disc under it), its core is crisp, and the brightest ones have a white-hot heart. The far side stays small and quiet,
    // so the sphere reads as deep glass with light inside it.
    const glowK = 0.1;
    if (LK > 0) {
      this.drawLogo(LK, c, R, dots, buckets, NB, NH, NM, (b, h, q) => tint(b, h, q), alphaOf, dark, glowK, B.hi);
    } else {
      this.dk = LK > 0 ? 0 : Math.min(1, this.dk + dt / (reduced ? 0.01 : 0.8));
      if (this.dk > 0) drawDust(ctx, c, R, this.t, this.rot, Math.max(30, (inp.vis ?? W / 2)), this.env * 0.8 + this.flash * 0.6 + this.press * 0.3 + this.body * 0.3, this.dk * fade, B.hi, B.lo, B.alt, dark, reduced);
    }
    if (LK <= 0 && this.dk < 1) for (let q = 0; q < NM; q++) {
      const at = (b: number, h: number) => buckets[(q * NB + b) * NH + h];
      ctx.globalAlpha = 1 - this.dk;
      if (dark) for (let b = 4; b < NB; b++) for (let h = 0; h < NH; h++) { const list = at(b, h); if (list.length) pass(list, 0, 2.0, rgba(tint(b, h, q), alphaOf(b) * glowK)); }
      for (let b = 0; b < NB; b++) for (let h = 0; h < NH; h++) { const list = at(b, h); if (list.length) pass(list, 0, 0.96, rgba(tint(b, h, q), alphaOf(b))); }
      if (dark) for (let h = 0; h < NH; h++) { const list = at(NB - 1, h); if (list.length) pass(list, 0, 0.36, rgba(whiten(tint(NB - 1, h, q), 0.6), alphaOf(NB - 1) * 0.36)); }
      ctx.globalAlpha = 1;
    }
    // the launch's coil: added light over the beads it lights (a quarter brighter, even where a bead is already at full)
    if (launchIgn && LK <= 0) this.coil(dots.map((d) => d.x), dots.map((d) => d.y), dots.map((d) => d.r), B.hi, 1, dark);
    // highlights (a flash, a comet, the arrival spiral): sparkles with a halo and a white heart
    const hiX = lerp3(hi, B.hi), altX = lerp3(alt, B.alt), okX = lerp3(ok, B.ok);
    const hiC: RGB = [Math.min(255, hiX[0] + 30), Math.min(255, hiX[1] + 50), Math.min(255, hiX[2] + 50)];
    if (LK <= 0) {
      if (dark) pass(ALL, 1, 2.6, rgba(hiC, 0.16));
      pass(ALL, 1, 1.05, rgba(hiC, 0.95));
      if (dark) pass(ALL, 1, 0.5, rgba(whiten(hiC, 0.8), 0.7));
      // done: the success colour
      if (dark) pass(ALL, 2, 2.6, rgba(okX, 0.16));
      pass(ALL, 2, 1.1, rgba(okX, 0.98));
    }
    if (this.oRib > 0.01) this.drawRibbon(this.oRib, c, R, colors, dark, reduced);
    // The glass it is made of: a fine bright edge exactly on its outline (where glass catches the light) and a soft reflection
    // at the top left, where the light comes from. Both are light only and sit still while the beads turn inside.
    const Rs = R * 1.03; // the outline, perspective included
    const edge = whiten([hiX[0] + (altX[0] - hiX[0]) * 0.4, hiX[1] + (altX[1] - hiX[1]) * 0.4, hiX[2] + (altX[2] - hiX[2]) * 0.4], 0.35);
    const ek = (dark ? 1 : 0.7) * fade * (1 - LK) * (1 - 0.85 * this.dk);
    const rim = ctx.createRadialGradient(c, c, Rs * 0.8, c, c, Rs * 1.07);
    rim.addColorStop(0, rgba(edge, 0));
    rim.addColorStop(0.5, rgba(edge, 0.035 * ek));
    rim.addColorStop(0.74, rgba(edge, 0.13 * ek));
    rim.addColorStop(0.83, rgba(edge, 0.05 * ek));
    rim.addColorStop(1, rgba(edge, 0));
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(c, c, Rs * 1.07, 0, TAU); ctx.fill();
    const sx = c - R * 0.34, sy = c - R * 0.4;
    const gloss = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 0.66);
    gloss.addColorStop(0, `rgba(255,255,255,${(dark ? 0.085 : 0.1) * fade * (1 - LK) * (1 - this.dk)})`);
    gloss.addColorStop(0.45, `rgba(255,255,255,${(dark ? 0.03 : 0.035) * fade * (1 - LK) * (1 - this.dk)})`);
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save(); ctx.beginPath(); ctx.arc(c, c, Rs, 0, TAU); ctx.clip();
    ctx.fillStyle = gloss; ctx.fillRect(c - Rs, c - Rs, Rs * 2, Rs * 2);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    if (orbit) this.drawOrbit(orbit, true, colors, dark, c, R);
    // a tap: two rings of light leave the sphere and fade (a soft glow under a fine line)
    if (this.rings.length) {
      for (const r of this.rings) {
        if (r.age < 0) continue; // a ring waiting for its turn
        const e = 1 - Math.pow(1 - r.age, 2);
        const a = (1 - r.age) * r.amp * (dark ? 0.5 : 0.4);
        const rad = R * (1.06 + e * 0.3);
        const rc: RGB = r.ok ? ok : hi;
        ctx.strokeStyle = rgba(rc, a * 0.22); ctx.lineWidth = Math.max(2, W * 0.022);
        ctx.beginPath(); ctx.arc(c, c, rad, 0, TAU); ctx.stroke();
        ctx.strokeStyle = rgba(whiten(rc, 0.3), a); ctx.lineWidth = Math.max(1, W * 0.005);
        ctx.beginPath(); ctx.arc(c, c, rad, 0, TAU); ctx.stroke();
      }
    }
  }

  /**
   * Orbit (Omar, 26 Oct: "much more beautiful, unique, wow"): a ring of the orb's own beads round it, tilted like a planet's
   * ring and seen from a little above, in three clean lanes (the inner one strongest) that drift round at slightly different
   * speeds, about a lap a minute, so it shimmers with depth. Each state has its own calm signature:
   *  - listening: your voice runs round the inner lane as a slow travelling swell (low voice in front, highs round the back);
   *  - thinking: the lanes draw into one band with a soft head of light and a long fading tail (a lap in ~3.5 s);
   *  - speaking: the ring widens a little and each syllable sends a wave of light out from the inner lane to the outer;
   *  - a tap throws it out a touch and it bounces back; done sweeps the success colour once round it (~0.8 s);
   *  - moved by a finger it trails the move on a soft spring and leans with it, like a gyroscope.
   * It comes in from just outside its place, fading in, and leaves by drawing in towards the sphere as it fades. The sphere
   * stays a perfect sphere. Nothing comes near the canvas's edge (the last stretch fades out). Reduce motion: still, light only.
   */
  private orbitFrame(dt: number, reduced: boolean, phase: string, inp: OrbInputs, W: number, css: number, c: number, R: number) {
    const to = inp.orbit ?? 0;
    this.oK += (to - this.oK) * (1 - Math.exp(-dt * (to > this.oK ? 2.2 : 3.4)));
    if (to === 0 && this.oK < 0.004) { this.oK = 0; this.oRib = 0; this.echoes = []; this.oOk = -1; return null; }
    const att = (cur: number, t: number, up: number, down: number) => cur + (t - cur) * (1 - Math.exp(-dt * (t > cur ? up : down)));
    for (let i = 0; i < 16; i++) this.oIn[i] = att(this.oIn[i], (this.lat[Math.max(0, i - 1)] + this.lat[i] * 2 + this.lat[Math.min(15, i + 1)]) / 4, 9, 2.4);
    const outRaw = Math.min(1, inp.voiceOut ?? 0);
    this.oOut = att(this.oOut, outRaw, 12, 3);
    if (!reduced && outRaw - this.oPrevOut > 0.09 && outRaw > 0.16 && this.t - this.oOutAt > 0.22) {
      this.oOutAt = this.t; if (this.echoes.length >= 3) this.echoes.shift(); this.echoes.push({ age: 0, amp: Math.min(1, 0.45 + outRaw * 0.8) });
    }
    this.oPrevOut = outRaw;
    for (const e of this.echoes) e.age += dt;
    this.echoes = this.echoes.filter((e) => e.age < 0.75);
    if (this.oOk >= 0) { this.oOk += dt; if (this.oOk > 1.3) this.oOk = -1; }
    const thinking = phase === 'processing';
    this.oGather = att(this.oGather, thinking ? 1 : 0, 1.3, 1.5);
    const radTo = (1 - 0.04 * this.press) * (1 + 0.06 * this.oOut);
    for (let rem = dt; rem > 1e-6; rem -= 1 / 240) { const h = Math.min(rem, 1 / 240); this.oRadV += (-110 * (this.oRad - radTo) - 14 * this.oRadV) * h; this.oRad += this.oRadV * h; }
    this.oRad = Math.min(1.1, this.oRad);
    // its drift: about a lap a minute at rest, a little livelier while you talk (never a spin)
    if (!reduced) this.oSpin += dt * (0.11 + this.env * 0.12 + this.oGather * 0.5 + this.oOut * 0.06);
    // the finger's move, followed on a soft spring (css px): the ring is drawn where the spring is, so it trails behind
    const lx = inp.lean?.[0] ?? 0, ly = inp.lean?.[1] ?? 0;
    for (let rem = dt; rem > 1e-6; rem -= 1 / 240) { const h = Math.min(rem, 1 / 240);
      this.oVx += (-70 * (this.oLx - lx) - 11 * this.oVx) * h; this.oLx += this.oVx * h;
      this.oVy += (-70 * (this.oLy - ly) - 11 * this.oVy) * h; this.oLy += this.oVy * h; }
    if (reduced) { this.oLx = lx; this.oLy = ly; this.oVx = this.oVy = 0; }
    const px = W / Math.max(1, css), lim = c * 0.06;
    const ox = Math.max(-lim, Math.min(lim, (this.oLx - lx) * px * 0.5)), oy = Math.max(-lim, Math.min(lim, (this.oLy - ly) * px * 0.5));
    const roll = -0.14 + Math.max(-0.3, Math.min(0.3, this.oVx * 0.001));
    const elev = Math.max(0.3, Math.min(0.75, 0.52 - this.oVy * 0.0007)); // ~30° from above
    // coming in from just outside its place (1.15×), going out by drawing in towards the sphere
    const ek = this.oK * this.oK * (3 - 2 * this.oK);
    const comeR = to > 0 ? 1 + (1 - ek) * 0.15 : 1 - (1 - ek) * 0.18;
    const T = reduced ? 0 : this.t;
    const O = ORBIT, n = O.n;
    const xs = new Float32Array(n), ys = new Float32Array(n), rs = new Float32Array(n), lum = new Float32Array(n), al = new Float32Array(n), zs = new Float32Array(n), hue = new Float32Array(n), tone = new Uint8Array(n);
    const ce = Math.cos(elev), se = Math.sin(elev), cr = Math.cos(roll), sr = Math.sin(roll);
    const okHead = this.oOk >= 0 ? Math.PI / 2 + (this.oOk / 0.8) * TAU : 0;
    const beadR = Math.sqrt(12.566 / N) * R * 0.24; // a sphere bead's size, as the sphere draws its middle ones
    const edge0 = c * 0.86, edge1 = c * 0.97;
    for (let k = 0; k < n; k++) {
      const row = O.row[k];
      const th = O.ang[k] + this.oSpin * ORBIT_W[row];
      const ct = Math.cos(th), st2 = Math.sin(th);
      let fa = Math.abs(((th - Math.PI / 2) % TAU + TAU) % TAU); if (fa > Math.PI) fa = TAU - fa;
      const fb = (fa / Math.PI) * 15, b0 = Math.min(14, Math.floor(fb)), fr = fb - b0;
      // your voice: on the inner lane, fully; the others only feel it
      const e = (this.oIn[b0] * (1 - fr) + this.oIn[b0 + 1] * fr) * (row === 0 ? 1 : row === 1 ? 0.3 : 0.12) * (1 - this.oGather);
      // thinking: the ring pours into the glass, bead by bead in a spiral (each in its turn), and becomes the ribbon inside
      const gs = (O.ang[k] / TAU + row * 0.13) % 1;
      const gb0 = Math.max(0, Math.min(1, this.oGather * 1.7 - gs * 0.7)), gb = gb0 * gb0 * (3 - 2 * gb0);
      let rr = ORBIT_R[row] + (0.72 - ORBIT_R[row]) * gb;
      rr = rr * this.oRad * comeR + O.jr[k] * 0.012;
      let glow = 0;
      // speaking: each syllable's wave runs out from the inner lane to the outer one (~0.6 s)
      for (const ec of this.echoes) { const f = 1.38 + ec.age * 0.85, d = rr / this.oRad - f; glow += ec.amp * (1 - ec.age / 0.75) * Math.exp(-(d * d) / 0.006); }
      const wave = reduced ? 0 : Math.sin(th * 3 - T * 2.2 + row * 0.7);
      const hgt = (Math.min(1, e * 1.4) * 0.12 * wave + 0.01 * Math.sin(th * 2 + T * 0.6 + row)) * (1 - gb);
      const X = rr * ct, Y = hgt, Z = rr * st2;
      const y1 = Y * ce + Z * se, z1 = -Y * se + Z * ce;
      const sx = X * cr - y1 * sr, sy = X * sr + y1 * cr;
      xs[k] = c + ox + sx * R; ys[k] = c + oy + sy * R; zs[k] = z1;
      const depth = Math.max(0, Math.min(1, (z1 / rr + 1) / 2)); // 0 back … 1 front
      glow += Math.min(0.55, e * 0.8) * (0.55 + 0.45 * Math.abs(wave)) + this.oOut * 0.18 + this.press * 0.15;
      glow += gb * (1 - gb) * 1.6; // (a bead lights up as it pours in)
      let ok = false;
      if (this.oOk >= 0) { const d = ((okHead - th) % TAU + TAU) % TAU; const w = Math.max(0, 1 - d / 1.2) * Math.min(1, (1.3 - this.oOk) / 0.4); if (w > 0.3) ok = true; glow += w * 0.4; }
      const twk = reduced ? 0 : 0.08 * Math.sin(T * (0.5 + O.js[k] * 0.4) + O.tw[k]);
      lum[k] = Math.max(0, Math.min(0.85, 0.4 + 0.3 * depth + glow + twk)); // (never white)
      // the back half quieter and a little smaller: depth
      const d2 = Math.hypot(xs[k] - c, ys[k] - c), fade = d2 <= edge0 ? 1 : d2 >= edge1 ? 0 : 1 - (d2 - edge0) / (edge1 - edge0);
      al[k] = ORBIT_A[row] * (0.4 + 0.6 * depth) * fade * ek * (1 - Math.max(0, (gb - 0.55) / 0.45));
      hue[k] = 0.5 + 0.5 * Math.sin(th + T * 0.2);
      rs[k] = beadR * ORBIT_B[row] * O.js[k] * (0.85 + 0.15 * depth) * (1 + 0.3 * Math.min(1, glow));
      tone[k] = ok ? 2 : 0;
    }
    // the ribbon inside comes as the beads arrive, and unspools back out into the ring the same way
    const rg = Math.max(0, Math.min(1, (this.oGather - 0.4) / 0.6));
    this.oRib = rg * rg * (3 - 2 * rg) * ek;
    return { xs, ys, rs, lum, al, zs, hue, tone };
  }

  /**
   * Thinking (Omar's reference, 26 Oct: a glass sphere with a ribbon of light twisting inside it): a band of light inside the
   * glass, on a looping path with two broad lobes and two narrow necks, twisting once round its length and turning slowly in
   * 3D. Lit like a satin ribbon: bright where it faces you, dark edge-on, a highlight where it catches the light from the top
   * left, a fine bright edge. Drawn back to front, inside the sphere's outline (it never leaves the glass). The sphere's own
   * beads step back while it is there.
   */
  private drawRibbon(k: number, c: number, R: number, colors: SphereColors, dark: boolean, reduced: boolean) {
    const ctx = this.ctx, { hi, alt } = colors, M = 96;
    const T = reduced ? 0 : this.t;
    const ay = T * 0.42, ax = 0.55 + 0.22 * Math.sin(T * 0.29), az = 0.35 * Math.sin(T * 0.17);
    const cyy = Math.cos(ay), syy = Math.sin(ay), cxx = Math.cos(ax), sxx = Math.sin(ax), czz = Math.cos(az), szz = Math.sin(az);
    const rot = (x: number, y: number, z: number): [number, number, number] => {
      const x1 = x * cyy + z * syy, z1 = -x * syy + z * cyy;
      const y2 = y * cxx - z1 * sxx, z2 = y * sxx + z1 * cxx;
      return [x1 * czz - y2 * szz, x1 * szz + y2 * czz, z2];
    };
    const path = (u: number): [number, number, number] => {
      const x = Math.cos(u), y = 0.5 * Math.sin(2 * u + T * 0.6), z = Math.sin(u), l = Math.hypot(x, y, z) / 0.62;
      return [x / l, y / l, z / l];
    };
    // the band's two edges at each step, in view space, with its facing normal
    const E1: [number, number, number][] = [], E2: [number, number, number][] = [], NZ: number[] = [], SP: number[] = [];
    const L = [-0.42, -0.52, 0.74];
    for (let i = 0; i <= M; i++) {
      const u = (i / M) * TAU;
      const p = path(u), a = path(u + 0.01), b = path(u - 0.01);
      let tx = a[0] - b[0], ty = a[1] - b[1], tz = a[2] - b[2]; const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
      // out from the centre, made square to the path; and across
      const pl = Math.hypot(p[0], p[1], p[2]); let nx = p[0] / pl, ny = p[1] / pl, nz = p[2] / pl;
      const dp = nx * tx + ny * ty + nz * tz; nx -= dp * tx; ny -= dp * ty; nz -= dp * tz; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
      const tw = u + T * 0.7, ca = Math.cos(tw), sa = Math.sin(tw);
      const dx = nx * ca + bx * sa, dy = ny * ca + by * sa, dz = nz * ca + bz * sa;
      const w = 0.62 * (0.1 + 0.9 * (0.5 + 0.5 * Math.cos(2 * u + T * 0.45))) / 2;
      E1.push(rot(p[0] + dx * w, p[1] + dy * w, p[2] + dz * w));
      E2.push(rot(p[0] - dx * w, p[1] - dy * w, p[2] - dz * w));
      // its face: across × along
      const fx = dy * tz - dz * ty, fy = dz * tx - dx * tz, fz = dx * ty - dy * tx;
      const f = rot(fx, fy, fz);
      NZ.push(Math.abs(f[2]));
      SP.push(Math.pow(Math.max(0, Math.abs(f[0] * L[0] + f[1] * L[1] + f[2] * L[2])), 14));
    }
    const P = (v: [number, number, number]) => { const s = 1 / (1 - v[2] * 0.24); return [c + v[0] * R * s, c + v[1] * R * s] as const; };
    const quads: { z: number; i: number }[] = [];
    for (let i = 0; i < M; i++) quads.push({ z: (E1[i][2] + E2[i][2] + E1[i + 1][2] + E2[i + 1][2]) / 4, i });
    quads.sort((a, b) => a.z - b.z);
    const op = ctx.globalCompositeOperation;
    const mid = (i: number, f: number) => { const a = E1[i], b = E2[i]; const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, mz = (a[2] + b[2]) / 2;
      return [[mx + (a[0] - mx) * f, my + (a[1] - my) * f, mz + (a[2] - mz) * f], [mx + (b[0] - mx) * f, my + (b[1] - my) * f, mz + (b[2] - mz) * f]] as [number, number, number][]; };
    const quad = (i: number, f: number) => { const [a1, b1] = mid(i, f), [a2, b2] = mid(i + 1, f); const p = [P(a1), P(a2), P(b2), P(b1)];
      ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let j = 1; j < 4; j++) ctx.lineTo(p[j][0], p[j][1]); ctx.closePath(); };
    // its light inside the glass, and a soft halo round the band (light added: it glows into the glass)
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    const g = ctx.createRadialGradient(c, c, 0, c, c, R);
    g.addColorStop(0, `rgba(${hi[0] | 0},${hi[1] | 0},${hi[2] | 0},${(0.26 * k).toFixed(3)})`);
    g.addColorStop(1, `rgba(${hi[0] | 0},${hi[1] | 0},${hi[2] | 0},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, R, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(${hi[0] | 0},${hi[1] | 0},${hi[2] | 0},${(0.07 * k).toFixed(3)})`;
    for (const { i } of quads) { quad(i, 1.9); ctx.fill(); }
    // the band itself: satin, drawn solid back to front on its own layer (so it passes in front of itself where it crosses,
    // with no seams between its pieces), then laid into the glass as one, fading as a whole
    const W2 = ctx.canvas.width;
    if (!this.ribCv || this.ribCv.width !== W2) this.ribCv = new OffscreenCanvas(W2, W2);
    const rc = this.ribCv.getContext('2d') as OffscreenCanvasRenderingContext2D;
    rc.setTransform(1, 0, 0, 1, 0, 0); rc.clearRect(0, 0, W2, W2); rc.lineJoin = 'round';
    const rq = (i: number) => { const p = [P(E1[i]), P(E1[i + 1]), P(E2[i + 1]), P(E2[i])]; rc.beginPath(); rc.moveTo(p[0][0], p[0][1]); for (let j = 1; j < 4; j++) rc.lineTo(p[j][0], p[j][1]); rc.closePath(); };
    for (const { z, i } of quads) {
      const face = (NZ[i] + NZ[i + 1]) / 2, sp = (SP[i] + SP[i + 1]) / 2;
      const depth = (z / 0.62 + 1) / 2; // 0 back … 1 front
      const m = 0.15 + 0.85 * Math.pow(face, 1.4);
      const wh = Math.min(0.92, sp * 1.1 + (dark ? 0.4 : 0.22) * Math.pow(face, 2.4));
      const dim = (0.4 + 0.6 * m) * (0.72 + 0.28 * depth); // (edge-on and far, it is the band's own shadow)
      const r = (alt[0] + (hi[0] - alt[0]) * m) * dim, gg = (alt[1] + (hi[1] - alt[1]) * m) * dim, bb = (alt[2] + (hi[2] - alt[2]) * m) * dim;
      const col = `rgb(${(r + (255 - r) * wh) | 0},${(gg + (255 - gg) * wh) | 0},${(bb + (255 - bb) * wh) | 0})`;
      rc.fillStyle = col; rc.strokeStyle = col; rc.lineWidth = 1;
      rq(i); rc.fill(); rc.stroke();
    }
    // its fine bright edges, where satin catches the light
    rc.lineWidth = Math.max(0.8, R * 0.012); rc.lineCap = 'round';
    for (let i = 0; i < M; i++) {
      const depth = ((E1[i][2] + E1[i + 1][2]) / 2 / 0.62 + 1) / 2;
      rc.strokeStyle = `rgba(255,255,255,${(0.35 * (0.3 + 0.7 * depth)).toFixed(3)})`;
      const a1 = P(E1[i]), a2 = P(E1[i + 1]), b2 = P(E2[i + 1]), b1 = P(E2[i]);
      rc.beginPath(); rc.moveTo(a1[0], a1[1]); rc.lineTo(a2[0], a2[1]); rc.moveTo(b1[0], b1[1]); rc.lineTo(b2[0], b2[1]); rc.stroke();
    }
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    ctx.globalAlpha = k * (dark ? 0.9 : 0.85);
    ctx.drawImage(this.ribCv, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = op;
  }

  /** One half of Orbit: the back half (hidden where the sphere is in front of it, a faint trace through its glass) or the front. */
  private drawOrbit(o: NonNullable<ReturnType<SphereRenderer['orbitFrame']>>, front: boolean, colors: SphereColors, dark: boolean, c: number, R: number) {
    const ctx = this.ctx, { hi, lo, alt, ok } = colors, n = ORBIT.n;
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    const LV = 6, AV = 5;
    const seen = (x: number, y: number, z: number) => { if (front ? z < 0 : z >= 0) return 0; if (front) return 1; const d = Math.hypot(x - c, y - c) / R; return d >= 1.06 ? 1 : d <= 0.94 ? 0.1 : 0.1 + 0.9 * (d - 0.94) / 0.12; };
    const col = (L: number, h: number, t: number): RGB => {
      if (t === 2) return ok;
      const top: RGB = [hi[0] + (alt[0] - hi[0]) * h * 0.5, hi[1] + (alt[1] - hi[1]) * h * 0.5, hi[2] + (alt[2] - hi[2]) * h * 0.5];
      const m = Math.min(1, L * 1.15);
      return [lo[0] + (top[0] - lo[0]) * m, lo[1] + (top[1] - lo[1]) * m, lo[2] + (top[2] - lo[2]) * m];
    };
    // batched: one shape per (light, strength, hue half, tone), like the sphere's beads
    const groups = new Map<number, number[]>();
    for (let k = 0; k < n; k++) {
      const a = o.al[k] * seen(o.xs[k], o.ys[k], o.zs[k]); if (a < 0.02) continue;
      const key = ((Math.min(LV - 1, Math.floor(o.lum[k] / 0.86 * LV)) * AV + Math.min(AV - 1, Math.floor(a * AV))) * 2 + (o.hue[k] > 0.5 ? 1 : 0)) * 3 + o.tone[k];
      let g = groups.get(key); if (!g) groups.set(key, (g = [])); g.push(k);
    }
    const fill = (list: number[], scale: number, rgb: RGB, a: number) => {
      if (a < 0.004) return;
      ctx.fillStyle = `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${a.toFixed(3)})`; ctx.beginPath();
      for (const k of list) { const r = o.rs[k] * scale; if (r < 0.05) continue; ctx.moveTo(o.xs[k] + r, o.ys[k]); ctx.arc(o.xs[k], o.ys[k], r, 0, TAU); }
      ctx.fill();
    };
    for (const [key, list] of groups) {
      const t = key % 3, h = Math.floor(key / 3) % 2, av = Math.floor(key / 6) % AV, lv = Math.floor(key / 6 / AV);
      const L = ((lv + 0.5) / LV) * 0.86, A = (av + 0.5) / AV;
      const rgb = col(L, h ? 0.85 : 0.25, t);
      const a = (0.25 + 0.75 * L) * A * (dark ? 1 : 0.85);
      if (dark && lv >= 3) fill(list, 2.4, rgb, a * 0.09); // its soft light into the dark round it
      fill(list, 1, rgb, a);
    }
    ctx.globalCompositeOperation = op;
  }

  /** The launch coil's light: each lit bead again, in the new colour's light, added over it (four steps of strength, a set
   *  at a time, so overlaps light once), with a faint soft glow round it. */
  private coil(xs: ArrayLike<number>, ys: ArrayLike<number>, rs: ArrayLike<number>, col: RGB, k: number, dark: boolean) {
    const ctx = this.ctx, A = this.bandA, op = ctx.globalCompositeOperation;
    const c3 = col.map((v) => v | 0).join(',');
    ctx.globalCompositeOperation = 'lighter';
    for (let lv = 1; lv <= 4; lv++) {
      const lo = (lv - 0.5) / 4, hi = (lv + 0.5) / 4;
      for (const [scale, a] of [[1.9, 0.07], [1, 0.3]] as const) {
        ctx.beginPath(); let any = false;
        for (let n = 0; n < A.length; n++) {
          const b = A[n]; if (b < lo || b >= hi) continue;
          const rr = rs[n] * scale; if (rr < 0.05) continue;
          ctx.moveTo(xs[n] + rr, ys[n]); ctx.arc(xs[n], ys[n], rr, 0, TAU); any = true;
        }
        if (any) { ctx.fillStyle = `rgba(${c3},${(a * (lv / 4) * k * (dark ? 1 : 0.7)).toFixed(3)})`; ctx.fill(); }
      }
    }
    ctx.globalCompositeOperation = op;
  }

  /**
   * The launch logo becoming the sphere (k: 1 the logo … 0 the sphere). Every bead on the near side belongs to its nearest
   * logo dot; at 1 the beads of a dot are drawn exactly on it, at its size and colour, sharing its light (added light, so
   * two beads at half strength are the one dot), and the far side is dark: it is the logo, pixel for pixel. As k falls each
   * bead flows from its dot to its own place on the turning sphere, its size, colour and light easing to its own, and the
   * far side comes up. One set of dots throughout, so there is never a second grid.
   */
  private drawLogo(k: number, c: number, R: number, dots: { x: number; y: number; r: number; z: number }[], buckets: number[][],
    NB: number, NH: number, NM: number, tint: (b: number, h: number, q: number) => RGB, alphaOf: (b: number) => number, dark: boolean, glowK: number, coilC: RGB) {
    const ctx = this.ctx;
    if (!this.lmap) {
      const dot = new Int16Array(N).fill(-1), w = new Float32Array(N), many = new Uint16Array(LOGO.length);
      const near = (x: number, y: number) => { let best = 0, bd = 1e9; for (let j = 0; j < LOGO.length; j++) { const dx = LOGO[j].x - x, dy = LOGO[j].y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = j; } } return best; };
      for (let n = 0; n < N; n++) { const d = dots[n]; const j = near((d.x - c) / R, (d.y - c) / R); dot[n] = j; if (d.z > 0) many[j]++; }
      for (let n = 0; n < N; n++) w[n] = dots[n].z > 0 ? 1 / many[dot[n]] : 0;
      const extra: { j: number; n: number }[] = [];
      for (let j = 0; j < LOGO.length; j++) {
        if (many[j]) continue;
        let best = 0, bd = 1e9;
        for (let n = 0; n < N; n++) { if (dots[n].z <= 0) continue; const dx = (dots[n].x - c) / R - LOGO[j].x, dy = (dots[n].y - c) / R - LOGO[j].y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = n; } }
        extra.push({ j, n: best });
      }
      this.lmap = { dot, w, extra };
    }
    const { dot, w, extra } = this.lmap;
    // which beads have already turned to the new colour
    const now = new Uint8Array(N);
    for (let b = 0; b < NB * NH; b++) for (const n of buckets[NB * NH + b] ?? []) now[n] = 1;
    const f = (v: number) => v | 0;
    const disc = (x: number, y: number, r: number, R3: number, G3: number, B3: number, a: number) => {
      if (a < 0.002 || r < 0.05) return;
      ctx.fillStyle = `rgba(${f(R3)},${f(G3)},${f(B3)},${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    };
    const u = 1 - k;
    ctx.globalCompositeOperation = 'lighter'; // shared dots add up to exactly the logo's dot
    const px = new Float32Array(N), py = new Float32Array(N), pr = new Float32Array(N);
    for (let n = 0; n < N; n++) {
      const d = dots[n], L = LOGO[dot[n]];
      px[n] = d.x * u + (c + L.x * R) * k; py[n] = d.y * u + (c + L.y * R) * k; pr[n] = d.r * 0.96 * u + L.r * R * k;
    }
    // a bead's soft glow and its white heart are drawn a set at a time, one shape per set, exactly as the sphere draws them
    // (glows that overlap light the overlap once, not twice): so nothing brightens or dims the moment the logo is gone
    const set = (list: number[], scale: number, style: string) => {
      ctx.fillStyle = style; ctx.beginPath();
      for (const n of list) { const rr = (pr[n] / 0.96) * scale; if (rr < 0.05) continue; ctx.moveTo(px[n] + rr, py[n]); ctx.arc(px[n], py[n], rr, 0, TAU); }
      ctx.fill();
    };
    const rgba = (r3: number, g3: number, b3: number, a: number) => `rgba(${f(r3)},${f(g3)},${f(b3)},${a.toFixed(3)})`;
    if (dark && u > 0.002) for (let q = 0; q < NM; q++) for (let b = 4; b < NB; b++) for (let h = 0; h < NH; h++) {
      const list = buckets[(q * NB + b) * NH + h]; if (!list.length) continue;
      const t = tint(b, h, q); set(list, 2.0, rgba(t[0], t[1], t[2], alphaOf(b) * glowK * u));
    }
    // its core: the sphere's bead (a set at a time, as the sphere draws it) fading in over the logo's dot fading out. A bead
    // that has already turned to the new colour drops its logo dot: never ember and teal mixed in one dot (that reads grey)
    if (u > 0.002) for (let q = 0; q < NM; q++) for (let b = 0; b < NB; b++) for (let h = 0; h < NH; h++) {
      const list = buckets[(q * NB + b) * NH + h]; if (!list.length) continue;
      const t = tint(b, h, q); set(list, 0.96, rgba(t[0], t[1], t[2], alphaOf(b) * u));
    }
    if (this.ignSeen && this.ign >= 0 && u > 0.002) this.coil(px, py, Array.from(pr, (r) => r / 0.96), coilC, u, dark);
    for (let n = 0; n < N; n++) {
      if (now[n] || !w[n]) continue;
      const L = LOGO[dot[n]];
      disc(px[n], py[n], pr[n], L.rgb[0], L.rgb[1], L.rgb[2], w[n] * k);
    }
    if (dark && u > 0.002) for (let q = 0; q < NM; q++) for (let h = 0; h < NH; h++) {
      const list = buckets[(q * NB + NB - 1) * NH + h]; if (!list.length) continue;
      const t = tint(NB - 1, h, q); set(list, 0.36, rgba(t[0] + (255 - t[0]) * 0.6, t[1] + (255 - t[1]) * 0.6, t[2] + (255 - t[2]) * 0.6, alphaOf(NB - 1) * 0.36 * u));
    }
    for (const { j, n } of extra) {
      const d = dots[n], L = LOGO[j];
      disc(d.x * u + (c + L.x * R) * k, d.y * u + (c + L.y * R) * k, d.r * 0.96 * u + L.r * R * k, L.rgb[0], L.rgb[1], L.rgb[2], k);
    }
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
  }
}
