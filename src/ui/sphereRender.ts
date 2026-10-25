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
/** Orbit's beads: three rows of the orb's own beads round it (inner row fewest), each with its place, a small spread off
 *  the row (dust, not a drawn line), its own size and its own slow twinkle. Fixed, so nothing ever jumps. */
const ORBIT = (() => {
  const rows = [64, 84, 104], n = rows.reduce((a, b) => a + b, 0);
  const row = new Uint8Array(n), ang = new Float32Array(n), jr = new Float32Array(n), js = new Float32Array(n), tw = new Float32Array(n);
  let seed = 11, k = 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  rows.forEach((m, r) => { for (let i = 0; i < m; i++, k++) { row[k] = r; ang[k] = ((i + rnd() * 0.6) / m) * Math.PI * 2; jr[k] = rnd() * 2 - 1; js[k] = 0.7 + rnd() * 0.6; tw[k] = rnd() * Math.PI * 2; } });
  return { n, row, ang, jr, js, tw };
})();
const ORBIT_R = [1.27, 1.37, 1.47]; // each row's radius (× the sphere's); the canvas ends at 1.515
const ECHO_N = 72;

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
  private lt = -1;                         // seconds into becoming the sphere (-1: not yet)
  /** each bead's logo dot (-1: on the far side, it isn't in the logo), its share of that dot's light, and the logo dots no
   *  near bead is closest to (drawn by their nearest bead's twin, fading as the sphere forms). Fixed when the logo is
   *  first drawn, so no bead ever changes dot. */
  // ── Orbit: the ring (see OrbInputs.orbit) ──
  private oK = 0;                           // how much of the ring is there (0 … 1, eased)
  private oSpin = 0;                        // its turn round the orb
  private oRad = 1; private oRadV = 0;      // its radius (× its resting radius), on a spring: gathers in to think, swells to speak
  private oGather = 0;                      // thinking: the three rows draw into one fast-turning band
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
      if (!reduced) { this.kickV += 2.6 * inp.beat * soft; if (this.rings.length < 4) this.rings.push({ age: 0, amp: 0.75 * inp.beat, ok: true }); this.oOk = 0; }
      inp.beat = 0;
    }
    this.restK += ((inp.rest ? 1 : 0) - this.restK) * (1 - Math.exp(-dt * 0.9));
    if (inp.tap > 0) {
      if (!reduced) {
        this.spin += 6 * inp.tap * soft; this.flash = Math.min(1, this.flash + inp.tap * soft);
        this.oRadV += 1.4 * inp.tap * soft; // (the ring: thrown out a little, it bounces back)
        if (this.echoes.length < 4) this.echoes.push({ age: 0, amp: 0.8 * inp.tap });
        if (soft === 1 && this.rings.length < 4) this.rings.push({ age: 0, amp: 1 }, { age: -0.16, amp: 0.7 });
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
    const R = c * 0.66 * this.sc;
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
      if (this.cur.sweep > 0.01) {
        // thinking: two comets of light circle it on a tilted orbit, each trailing a fading tail
        const h = x1 * CA[0] + y2 * CA[1] + z2 * CA[2];
        const band = Math.exp(-(h * h) / 0.03);
        if (band > 0.01) {
          const phi = Math.atan2(x1 * CV[0] + y2 * CV[1] + z2 * CV[2], x1 * CU[0] + y2 * CU[1] + z2 * CU[2]);
          for (let k2 = 0; k2 < 2; k2++) {
            const d = (((cometHead + k2 * Math.PI - phi) % TAU) + TAU) % TAU;
            glow += band * Math.exp(-d * 1.3) * 2.6 * this.cur.sweep;
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
    const alphaOf = (b: number) => (0.14 + (b / (NB - 1)) * 0.86) * (dark ? 0.8 : 1) * fade;
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
    } else for (let q = 0; q < NM; q++) {
      const at = (b: number, h: number) => buckets[(q * NB + b) * NH + h];
      if (dark) for (let b = 4; b < NB; b++) for (let h = 0; h < NH; h++) { const list = at(b, h); if (list.length) pass(list, 0, 2.0, rgba(tint(b, h, q), alphaOf(b) * glowK)); }
      for (let b = 0; b < NB; b++) for (let h = 0; h < NH; h++) { const list = at(b, h); if (list.length) pass(list, 0, 0.96, rgba(tint(b, h, q), alphaOf(b))); }
      if (dark) for (let h = 0; h < NH; h++) { const list = at(NB - 1, h); if (list.length) pass(list, 0, 0.36, rgba(whiten(tint(NB - 1, h, q), 0.6), alphaOf(NB - 1) * 0.36)); }
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
    // The glass it is made of: a fine bright edge exactly on its outline (where glass catches the light) and a soft reflection
    // at the top left, where the light comes from. Both are light only and sit still while the beads turn inside.
    const Rs = R * 1.03; // the outline, perspective included
    const edge = whiten([hiX[0] + (altX[0] - hiX[0]) * 0.4, hiX[1] + (altX[1] - hiX[1]) * 0.4, hiX[2] + (altX[2] - hiX[2]) * 0.4], 0.35);
    const ek = (dark ? 1 : 0.7) * fade * (1 - LK);
    const rim = ctx.createRadialGradient(c, c, Rs * 0.8, c, c, Rs * 1.07);
    rim.addColorStop(0, rgba(edge, 0));
    rim.addColorStop(0.5, rgba(edge, 0.035 * ek));
    rim.addColorStop(0.74, rgba(edge, 0.13 * ek));
    rim.addColorStop(0.83, rgba(edge, 0.05 * ek));
    rim.addColorStop(1, rgba(edge, 0));
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(c, c, Rs * 1.07, 0, TAU); ctx.fill();
    const sx = c - R * 0.34, sy = c - R * 0.4;
    const gloss = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 0.66);
    gloss.addColorStop(0, `rgba(255,255,255,${(dark ? 0.085 : 0.1) * fade * (1 - LK)})`);
    gloss.addColorStop(0.45, `rgba(255,255,255,${(dark ? 0.03 : 0.035) * fade * (1 - LK)})`);
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
   * ring and seen a little from above, in three rows that turn at slightly different speeds (so it shimmers with depth).
   *  - listening: your voice runs round the ring as a travelling wave that lifts the beads out of its plane, low voice in
   *    front, highs round the back, so it is your voice drawn in light, in 3D, round the coach;
   *  - thinking: the rows draw in into one band that turns fast with a bright head of light, as if it gathers itself;
   *  - speaking: the ring swells with its voice, and each syllable sends a wave of light out across the rows;
   *  - a tap throws the ring out a little and it bounces back; done sweeps the success colour once round it;
   *  - moved by a finger the ring trails the move on a soft spring and leans with it, like a gyroscope.
   * The sphere stays a perfect sphere; nothing here touches it. Under Reduce motion the ring stands still (light only).
   */
  private orbitFrame(dt: number, reduced: boolean, phase: string, inp: OrbInputs, W: number, css: number, c: number, R: number) {
    const to = inp.orbit ?? 0;
    this.oK += (to - this.oK) * (1 - Math.exp(-dt * (to > this.oK ? 1.6 : 3.2)));
    if (to === 0 && this.oK < 0.004) { this.oK = 0; this.echoes = []; this.oOk = -1; return null; }
    const att = (cur: number, t: number, up: number, down: number) => cur + (t - cur) * (1 - Math.exp(-dt * (t > cur ? up : down)));
    for (let i = 0; i < 16; i++) this.oIn[i] = att(this.oIn[i], (this.lat[Math.max(0, i - 1)] + this.lat[i] * 2 + this.lat[Math.min(15, i + 1)]) / 4, 9, 2.4); // (a calmer copy of the sphere's)
    const outRaw = Math.min(1, inp.voiceOut ?? 0);
    this.oOut = att(this.oOut, outRaw, 20, 4);
    if (!reduced && outRaw - this.oPrevOut > 0.09 && outRaw > 0.16 && this.t - this.oOutAt > 0.16) {
      this.oOutAt = this.t; if (this.echoes.length >= 4) this.echoes.shift(); this.echoes.push({ age: 0, amp: Math.min(1, 0.4 + outRaw) });
    }
    this.oPrevOut = outRaw;
    for (const e of this.echoes) e.age += dt;
    this.echoes = this.echoes.filter((e) => e.age < 0.9);
    if (this.oOk >= 0) { this.oOk += dt; if (this.oOk > 1.6) this.oOk = -1; }
    const thinking = phase === 'processing';
    this.oGather = att(this.oGather, thinking ? 1 : 0, 2.2, 1.6);
    const radTo = (1 - 0.06 * this.press) * (1 + 0.07 * this.oOut);
    for (let rem = dt; rem > 1e-6; rem -= 1 / 240) { const h = Math.min(rem, 1 / 240); this.oRadV += (-110 * (this.oRad - radTo) - 12 * this.oRadV) * h; this.oRad += this.oRadV * h; }
    const env = this.env;
    if (!reduced) this.oSpin += dt * (0.22 + env * 0.7 + this.oGather * 1.9 + this.oOut * 0.3 + Math.max(0, this.spin) * 0.15);
    // the finger's move, followed on a soft spring (css px): the ring is drawn where the spring is, so it trails behind
    const lx = inp.lean?.[0] ?? 0, ly = inp.lean?.[1] ?? 0;
    for (let rem = dt; rem > 1e-6; rem -= 1 / 240) { const h = Math.min(rem, 1 / 240);
      this.oVx += (-70 * (this.oLx - lx) - 11 * this.oVx) * h; this.oLx += this.oVx * h;
      this.oVy += (-70 * (this.oLy - ly) - 11 * this.oVy) * h; this.oLy += this.oVy * h; }
    if (reduced) { this.oLx = lx; this.oLy = ly; this.oVx = this.oVy = 0; }
    const px = W / Math.max(1, css), lim = c * 0.16;
    const ox = Math.max(-lim, Math.min(lim, (this.oLx - lx) * px)), oy = Math.max(-lim, Math.min(lim, (this.oLy - ly) * px));
    const roll = -0.16 + Math.max(-0.35, Math.min(0.35, this.oVx * 0.0011));
    const elev = Math.max(0.16, Math.min(0.62, 0.36 - this.oVy * 0.0008));
    // gathering in when it appears: from a wider, turned ring, fading in (and back out the same way)
    const ek = this.oK * this.oK * (3 - 2 * this.oK);
    const T = reduced ? 0 : this.t;
    const O = ORBIT, n = O.n;
    const xs = new Float32Array(n), ys = new Float32Array(n), rs = new Float32Array(n), lum = new Float32Array(n), zs = new Float32Array(n), hue = new Float32Array(n), tone = new Uint8Array(n);
    const ce = Math.cos(elev), se = Math.sin(elev), cr = Math.cos(roll), sr = Math.sin(roll);
    const headA = T * 3.4, okHead = this.oOk >= 0 ? Math.PI / 2 + this.oOk * TAU * 0.85 : 0;
    for (let k = 0; k < n; k++) {
      const row = O.row[k];
      const th = O.ang[k] + this.oSpin * (1 + row * 0.09) + (1 - ek) * 1.4;
      const ct = Math.cos(th), st2 = Math.sin(th);
      // where it is from the front (0) round to the back (1): the voice's band
      let fa = Math.abs(((th - Math.PI / 2) % TAU + TAU) % TAU); if (fa > Math.PI) fa = TAU - fa;
      const fb = (fa / Math.PI) * 15, b0 = Math.min(14, Math.floor(fb)), fr = fb - b0;
      const e = this.oIn[b0] * (1 - fr) + this.oIn[b0 + 1] * fr;
      let rr = ORBIT_R[row] + (1.3 - ORBIT_R[row]) * this.oGather * 0.82;
      rr = rr * this.oRad * (1 + (1 - ek) * 0.22) + O.jr[k] * 0.018;
      let glow = 0;
      for (const ec of this.echoes) { const f = 1.12 + ec.age * 0.62, d = rr - f; glow += ec.amp * (1 - ec.age / 0.9) * Math.exp(-(d * d) / 0.0035); }
      rr += glow * 0.035;
      const wave = reduced ? 0 : Math.sin(th * 3 - T * 2.6 + row * 0.7);
      const hgt = (Math.min(1, e * 1.4) * 0.1 * wave + 0.012 * Math.sin(th * 3 + T * 0.9 + row)) * (1 - this.oGather);
      // in the ring's plane, then seen from a little above, then the roll
      const X = rr * ct, Y = hgt, Z = rr * st2;
      const y1 = Y * ce + Z * se, z1 = -Y * se + Z * ce;
      const sx = X * cr - y1 * sr, sy = X * sr + y1 * cr;
      xs[k] = c + ox + sx * R; ys[k] = c + oy + sy * R; zs[k] = z1;
      const depth = Math.max(0, Math.min(1, (z1 / rr + 1) / 2)); // 0 back … 1 front
      glow += Math.min(0.5, e * 0.7) * (0.55 + 0.45 * Math.abs(wave)) + this.oOut * 0.28 + this.press * 0.22;
      if (this.oGather > 0.02) { let d = ((headA - th) % TAU + TAU) % TAU; glow += this.oGather * Math.exp(-d * 1.6) * 1.3; }
      let ok = false;
      if (this.oOk >= 0) { const d = ((okHead - th) % TAU + TAU) % TAU; const w = Math.exp(-d * 1.1) * Math.max(0, 1 - this.oOk / 1.6); if (w > 0.25) ok = true; glow += w * 0.9; }
      const twk = reduced ? 0 : 0.1 * Math.sin(T * (0.6 + O.js[k] * 0.5) + O.tw[k]);
      const L = Math.max(0, Math.min(1, 0.16 + 0.42 * depth + glow + twk));
      lum[k] = L; hue[k] = 0.5 + 0.5 * Math.sin(th + T * 0.3);
      rs[k] = R * 0.026 * O.js[k] * (0.5 + 0.75 * depth) * (1 + 0.45 * Math.min(1, glow)) * (0.6 + 0.4 * ek);
      tone[k] = ok ? 2 : L > 0.97 && depth > 0.6 ? 1 : 0;
    }
    // the syllables' own waves of light: a dotted ring spreading out across the ring's plane, fading as it goes
    const echo: { x: number; y: number; r: number; z: number; a: number }[] = [];
    for (const ec of this.echoes) {
      const f = (1.12 + ec.age * 0.62) * this.oRad, a = ec.amp * Math.pow(1 - ec.age / 0.9, 1.5) * Math.max(0, Math.min(1, (1.5 - f) / 0.12));
      if (a < 0.02) continue;
      for (let j = 0; j < ECHO_N; j++) {
        const th = (j / ECHO_N) * TAU + this.oSpin * 0.5;
        const X = f * Math.cos(th), Z = f * Math.sin(th);
        const y1 = Z * se, z1 = Z * ce;
        echo.push({ x: c + ox + (X * cr - y1 * sr) * R, y: c + oy + (X * sr + y1 * cr) * R, r: R * 0.016, z: z1, a: a * (0.35 + 0.65 * (z1 / f + 1) / 2) });
      }
    }
    return { xs, ys, rs, lum, zs, hue, tone, echo, ek, cx: c + ox, cy: c + oy };
  }

  /** One half of Orbit: the back half (hidden where the sphere is in front of it, a faint trace through its glass) or the front. */
  private drawOrbit(o: NonNullable<ReturnType<SphereRenderer['orbitFrame']>>, front: boolean, colors: SphereColors, dark: boolean, c: number, R: number) {
    const ctx = this.ctx, { hi, lo, alt, ok } = colors, n = ORBIT.n;
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    const LV = 6, base = (dark ? 0.9 : 0.8) * o.ek;
    // (the sphere covers the back half where it is in front of it; through its glass a faint trace stays)
    const seen = (x: number, y: number, z: number) => { if (front ? z < 0 : z >= 0) return 0; if (front) return 1; const d = Math.hypot(x - c, y - c) / R; return d >= 1.06 ? 1 : d <= 0.94 ? 0.12 : 0.12 + 0.88 * (d - 0.94) / 0.12; };
    const col = (L: number, h: number, t: number): RGB => {
      if (t === 2) return ok;
      const top: RGB = [hi[0] + (alt[0] - hi[0]) * h * 0.55, hi[1] + (alt[1] - hi[1]) * h * 0.55, hi[2] + (alt[2] - hi[2]) * h * 0.55];
      const m = Math.min(1, L * 1.1);
      const c3: RGB = [lo[0] + (top[0] - lo[0]) * m, lo[1] + (top[1] - lo[1]) * m, lo[2] + (top[2] - lo[2]) * m];
      return t === 1 ? [c3[0] + (255 - c3[0]) * 0.45, c3[1] + (255 - c3[1]) * 0.45, c3[2] + (255 - c3[2]) * 0.45] : c3;
    };
    // batched: one shape per (light level, hue half, tone), like the sphere's beads
    const groups = new Map<number, number[]>();
    const vis = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const s = seen(o.xs[k], o.ys[k], o.zs[k]); if (s <= 0) continue; vis[k] = s;
      const key = (Math.min(LV - 1, Math.floor(o.lum[k] * s * LV)) * 2 + (o.hue[k] > 0.5 ? 1 : 0)) * 3 + o.tone[k];
      let g = groups.get(key); if (!g) groups.set(key, (g = [])); g.push(k);
    }
    const fill = (list: number[], scale: number, rgb: RGB, a: number) => {
      if (a < 0.004) return;
      ctx.fillStyle = `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${a.toFixed(3)})`; ctx.beginPath();
      for (const k of list) { const r = o.rs[k] * scale; if (r < 0.05) continue; ctx.moveTo(o.xs[k] + r, o.ys[k]); ctx.arc(o.xs[k], o.ys[k], r, 0, TAU); }
      ctx.fill();
    };
    for (const [key, list] of groups) {
      const t = key % 3, h = Math.floor(key / 3) % 2, lv = Math.floor(key / 6), L = (lv + 0.5) / LV;
      const rgb = col(L, h ? 0.85 : 0.25, t);
      const a = (0.12 + 0.88 * L) * base;
      if (dark && lv >= 3) fill(list, 2.3, rgb, a * 0.1); // its soft light into the dark round it
      fill(list, 1, rgb, a);
      if (dark && t === 1) fill(list, 0.4, [255, 255, 255], a * 0.5);
    }
    // the syllables' waves
    if (o.echo.length) {
      const rgb = col(0.9, 0.4, 0);
      for (let lv = 1; lv <= 4; lv++) {
        ctx.fillStyle = `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${(lv / 4 * 0.75 * base).toFixed(3)})`; ctx.beginPath(); let any = false;
        for (const e of o.echo) {
          const s = seen(e.x, e.y, e.z); const q = e.a * s; if (q < (lv - 0.5) / 4 || q >= (lv + 0.5) / 4) continue;
          ctx.moveTo(e.x + e.r, e.y); ctx.arc(e.x, e.y, e.r, 0, TAU); any = true;
        }
        if (any) ctx.fill();
      }
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
