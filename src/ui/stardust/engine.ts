import { DUST_FS, DUST_VS } from './shaders';

/**
 * Stardust, the orb screen's orb while you talk live (Omar, 26 Oct: "refine it to a high bar, ultra premium… spoken,
 * interactive, alive"). Sixteen thousand specks of light make the sphere; the same specks write its words and fold into a
 * galaxy while it thinks. This is the drawing and the motion; it runs in a worker (stardust.worker.ts) on the graphics
 * chip, fed the page's state every page frame (DustState). Pure: no app imports, so the same code runs on the page if
 * a phone can't draw WebGL off the page.
 *
 * Alive, in order of what you notice:
 *  - at rest it breathes (one slow breath in ~6 s), turns slowly and light drifts over its dust in clouds; a few specks
 *    twinkle;
 *  - the instant you start talking after a pause it notices you: it brightens and draws in a breath (a soft spring);
 *  - your voice: each of its 16 pitches lights and swells its own height of the dust (low voice low, high voice high),
 *    within a frame of the syllable;
 *  - thinking: its dust folds into a spinning galaxy, each speck in its turn, and opens back into the sphere to answer;
 *  - its voice: a wave of light runs out through the dust with every syllable it says;
 *  - logged: the success colour runs up through it once;
 *  - a finger held on it draws the dust nearby towards it; a tap scatters the dust and it swirls back; a drag leaves the
 *    outer dust lagging, then it settles (with the screen's own spring and bounce);
 *  - muted or reconnecting: it dims and quietens.
 * Under Reduce motion it doesn't turn, fold, swell or scatter: light only.
 */

export type RGB = [number, number, number];
export interface DustState {
  /** the canvas's size (css px) and pixel ratio */
  w: number; h: number; dpr: number;
  /** the orb: its middle and radius in css px (the finger's move included) */
  cx: number; cy: number; r: number;
  /** 1 there, 0 leaving */
  on: number;
  listen: boolean; think: boolean; speak: boolean; quiet: boolean;
  /** your voice (0…1) and its 16 pitches; its voice */
  vin: number; bands: number[]; vout: number;
  /** a finger held on it (orb units, y up; null: none); taps (a counter and where); the finger's move (css px) */
  hold: [number, number] | null; press: number;
  tap: { n: number; x: number; y: number };
  lean: [number, number];
  /** a log done (a counter) */
  beat: number;
  /** its greeting written in dust (true) or flowing back into it (false) */
  greet: boolean;
  reduced: boolean;
  colors: { ac: RGB; alt: RGB; ok: RGB; dark: boolean };
}

const N = 16000, WRITERS = 3400;
// the app's shared springs (ui/motion.ts, written out here so the worker needs nothing from the app): SMOOTH = apple(0.36)
// for its breath and size, BOUNCY = apple(0.5, 0.3) for the dust trailing a drag
const SMOOTH_K = (2 * Math.PI / 0.36) ** 2, SMOOTH_C = (4 * Math.PI) / 0.36;
const BOUNCY_K = (2 * Math.PI / 0.5) ** 2, BOUNCY_C = (4 * Math.PI * 0.7) / 0.5;

export class DustEngine {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private u = new Map<string, WebGLUniformLocation | null>();
  private tgBuf: WebGLBuffer;
  private tg = new Float32Array(N * 2).fill(-1);
  private writers: number[] = [];
  private last = 0; private t = 0;
  // the motion, smoothed by time (fast attack, slow release), so it reads the same at 60 or 120 frames a second
  private s = { listen: 0, think: 0, speak: 0, quiet: 0, vin: 0, vout: 0, bands: new Float32Array(16), prevIn: 0, prevOut: 0, lastSyl: -9,
    syl: [-1, -1, -1, -1], sylA: [0, 0, 0, 0], rot: 0, scale: 1, scaleV: 0, attn: 0, quietFor: 9, lx: 0, ly: 0, lvx: 0, lvy: 0,
    hold: 0, hx: 0, hy: 0, tapN: -1, tapAge: 99, tx: 0, ty: 0, beatN: -1, doneAge: 99, appear: 0, write: 0, unwrite: 0, crisp: 0 };
  /** called when the words are fully written (true) or start leaving (false): the page shows or hides the crisp text */
  onCrisp: (on: boolean) => void = () => {};
  private crispOn = false;
  private drewLast = false;

  constructor(private canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('webgl2');
    this.gl = gl;
    const sh = (type: number, src: string) => { const x = gl.createShader(type)!; gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) ?? 'shader'); return x; };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, DUST_VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, DUST_FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    this.prog = p;
    // the specks: a sphere's shell with depth (a few deeper inside), sizes as the particle title has them (mostly tiny,
    // some medium, a few large); fixed, so nothing ever jumps
    let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const home = new Float32Array(N * 4), r4 = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N, rr = Math.sqrt(1 - y * y), th = i * Math.PI * (3 - Math.sqrt(5));
      const shell = rnd() < 0.18 ? 0.35 + rnd() * 0.55 : 0.93 + rnd() * 0.09;
      home.set([Math.cos(th) * rr, y, Math.sin(th) * rr, shell], i * 4);
      const u = rnd();
      r4.set([rnd(), rnd(), rnd(), u < 0.7 ? 0.7 + rnd() * 0.6 : u < 0.95 ? 1.3 + rnd() * 1.0 : 2.6 + rnd() * 1.6], i * 4);
      if (shell > 0.9 && i % 2 === 0 && this.writers.length < WRITERS) this.writers.push(i);
    }
    // (the order specks are drawn in is shuffled, so drawing fewer of them when the orb is small thins it evenly)
    const order = Array.from({ length: N }, (_, i) => i);
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const H = new Float32Array(N * 4), R4 = new Float32Array(N * 4), pos = new Int32Array(N);
    order.forEach((src, k) => { H.set(home.subarray(src * 4, src * 4 + 4), k * 4); R4.set(r4.subarray(src * 4, src * 4 + 4), k * 4); pos[src] = k; });
    this.writers = this.writers.map((w) => pos[w]);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const attr = (name: string, data: Float32Array, size: number, usage: number) => { const b = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage); const l = gl.getAttribLocation(p, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); return b; };
    attr('aHome', H, 4, gl.STATIC_DRAW); attr('aRnd', R4, 4, gl.STATIC_DRAW);
    this.tgBuf = attr('aTg', this.tg, 2, gl.DYNAMIC_DRAW);
    gl.useProgram(p);
  }

  /** the greeting's shape: points (css px, pairs) sampled from its text where it will be written */
  setText(points: Float32Array) {
    const n = points.length / 2;
    this.tg.fill(-1);
    if (n) this.writers.forEach((w, k) => { const j = k % n; this.tg[w * 2] = points[j * 2]; this.tg[w * 2 + 1] = points[j * 2 + 1]; });
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.tgBuf); gl.bufferData(gl.ARRAY_BUFFER, this.tg, gl.DYNAMIC_DRAW);
  }

  /** draws one frame; false once it has left completely (nothing more to draw) */
  frame(now: number, st: DustState): boolean {
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 1 / 60); this.last = now;
    this.t += dt;
    const s = this.s, k = (rate: number) => 1 - Math.exp(-dt * rate), red = st.reduced;
    s.appear = st.on ? Math.min(1.6, s.appear + dt / 1.3) : Math.max(0, s.appear - dt / 0.45);
    s.listen += ((st.listen ? 1 : 0) - s.listen) * k(3);
    s.think += ((st.think ? 1 : 0) - s.think) * k(2.2);
    s.speak += ((st.speak ? 1 : 0) - s.speak) * k(3);
    s.quiet += ((st.quiet ? 1 : 0) - s.quiet) * k(4);
    const vin = st.listen && !st.quiet ? st.vin : 0, vout = st.speak ? st.vout : 0;
    s.vin += (vin - s.vin) * k(vin > s.vin ? 22 : 6);
    s.vout += (vout - s.vout) * k(vout > s.vout ? 18 : 5);
    for (let i = 0; i < 16; i++) { const b = st.listen && !st.quiet ? st.bands[i] ?? 0 : 0; s.bands[i] += (b - s.bands[i]) * k(b > s.bands[i] ? 14 : 4); }
    // a syllable: a sudden rise in the voice that is speaking
    const v = st.speak ? vout : vin, prev = st.speak ? s.prevOut : s.prevIn;
    if (v - prev > 0.08 && v > 0.18 && this.t - s.lastSyl > 0.16) { s.lastSyl = this.t; s.syl.unshift(0); s.syl.pop(); s.sylA.unshift(Math.min(1, 0.45 + v)); s.sylA.pop(); }
    s.prevIn = vin; s.prevOut = vout;
    s.syl = s.syl.map((a) => (a < 0 ? a : a + dt));
    // it notices you: the first sound after a quiet spell
    if (vin > 0.12 && s.quietFor > 1.2 && !red) s.attn = 1;
    s.quietFor = vin < 0.06 ? s.quietFor + dt : 0;
    s.attn *= Math.exp(-dt * 1.4);
    // its breath and size: one slow breath, a breath in when it notices you, a press sinks it in a touch (a spring)
    const scTo = red ? 1 : 1 + 0.012 * Math.sin(this.t * 1.05) + 0.035 * s.attn - 0.04 * st.press;
    for (let rem = dt; rem > 1e-6; rem -= 1 / 240) { const h = Math.min(rem, 1 / 240); s.scaleV += (-SMOOTH_K * (s.scale - scTo) - SMOOTH_C * s.scaleV) * h; s.scale += s.scaleV * h; }
    if (!red) s.rot += dt * (0.16 + s.vin * 0.25 + s.vout * 0.15);
    // a drag: the inside follows the finger's move on a soft spring, so it lags and sloshes, then settles
    const [lx, ly] = st.lean;
    for (let rem = dt; rem > 1e-6; rem -= 1 / 240) { const h = Math.min(rem, 1 / 240);
      s.lvx += (-BOUNCY_K * (s.lx - lx) - BOUNCY_C * s.lvx) * h; s.lx += s.lvx * h; s.lvy += (-BOUNCY_K * (s.ly - ly) - BOUNCY_C * s.lvy) * h; s.ly += s.lvy * h; }
    if (red) { s.lx = lx; s.ly = ly; }
    // a finger held; a tap; a log done
    s.hold += ((st.hold ? 1 : 0) - s.hold) * k(st.hold ? 8 : 4);
    if (st.hold) { s.hx = st.hold[0]; s.hy = st.hold[1]; }
    if (st.tap.n !== s.tapN) { if (s.tapN >= 0) { s.tapAge = 0; s.tx = st.tap.x; s.ty = st.tap.y; } s.tapN = st.tap.n; } else s.tapAge += dt;
    if (st.beat !== s.beatN) { if (s.beatN >= 0) s.doneAge = 0; s.beatN = st.beat; } else s.doneAge += dt;
    // its words: written out of its dust, then (when you start talking) flowing back in
    if (st.greet && s.appear > 0.3) { s.write = Math.min(2.2, s.write + dt / 1.5); s.unwrite = 0; }
    else if (s.write > 0) { s.unwrite += dt / 1.3; if (s.unwrite > 1.6) { s.write = 0; s.unwrite = 0; } }
    const crisp = st.greet && s.write > 1.55;
    if (crisp !== this.crispOn) { this.crispOn = crisp; this.onCrisp(crisp); }
    s.crisp += ((crisp ? 1 : 0) - s.crisp) * k(crisp ? 6 : 14);

    const gl = this.gl, dpr = st.dpr, W = Math.max(1, Math.round(st.w * dpr)), H = Math.max(1, Math.round(st.h * dpr));
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    gl.viewport(0, 0, W, H);
    if (s.appear <= 0 && !st.on) { if (this.drewLast) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); this.drewLast = false; } return false; }
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); this.drewLast = true;
    gl.enable(gl.BLEND);
    if (st.colors.dark) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const U = (n: string) => { if (!this.u.has(n)) this.u.set(n, gl.getUniformLocation(this.prog, n)); return this.u.get(n)!; };
    const R = st.r * dpr;
    gl.uniform2f(U('uView'), W, H); gl.uniform1f(U('uDpr'), dpr);
    gl.uniform2f(U('uC'), st.cx * dpr, H - st.cy * dpr); gl.uniform1f(U('uR'), R);
    gl.uniform1f(U('uSz'), Math.max(0.5, 1.9 * R / 150));
    gl.uniform1f(U('uT'), red ? 0 : this.t + 3); gl.uniform1f(U('uRot'), s.rot); gl.uniform1f(U('uScale'), s.scale);
    gl.uniform1f(U('uIn'), s.vin); gl.uniform1f(U('uOut'), s.vout);
    const b = s.bands; gl.uniform4f(U('uB0'), b[0], b[1], b[2], b[3]); gl.uniform4f(U('uB1'), b[4], b[5], b[6], b[7]); gl.uniform4f(U('uB2'), b[8], b[9], b[10], b[11]); gl.uniform4f(U('uB3'), b[12], b[13], b[14], b[15]);
    gl.uniform1f(U('uListen'), s.listen); gl.uniform1f(U('uThink'), s.think); gl.uniform1f(U('uSpeak'), s.speak);
    gl.uniform1f(U('uAppear'), s.appear); gl.uniform1f(U('uAttn'), s.attn); gl.uniform1f(U('uQuiet'), s.quiet);
    gl.uniform1f(U('uDone'), s.doneAge < 1.3 ? s.doneAge / 1.3 : 0);
    gl.uniform4f(U('uSyl'), s.syl[0], s.syl[1], s.syl[2], s.syl[3]); gl.uniform4f(U('uSylA'), s.sylA[0], s.sylA[1], s.sylA[2], s.sylA[3]);
    gl.uniform3f(U('uTouch'), s.tx, s.ty, s.tapAge < 4 ? 1 : 0); gl.uniform1f(U('uTapAge'), Math.min(s.tapAge, 4));
    gl.uniform3f(U('uHold'), s.hx, s.hy, red ? 0 : s.hold);
    const lean = (v: number) => Math.max(-0.4, Math.min(0.4, v / Math.max(8, st.r)));
    gl.uniform2f(U('uLean'), lean(s.lx - lx), -lean(s.ly - ly));
    gl.uniform1f(U('uWrite'), s.write); gl.uniform1f(U('uUnwrite'), s.unwrite); gl.uniform1f(U('uCrisp'), s.crisp);
    gl.uniform1f(U('uReduce'), red ? 1 : 0);
    const c = st.colors;
    gl.uniform3f(U('uAc'), ...c.ac); gl.uniform3f(U('uAlt'), ...c.alt); gl.uniform3f(U('uOk'), ...c.ok); gl.uniform1f(U('uDark'), c.dark ? 1 : 0);
    // (fewer specks when the orb is small: the same look, a fraction of the work)
    const count = Math.round(N * Math.max(0.3, Math.min(1, st.r / 80)));
    gl.drawArrays(gl.POINTS, 0, Math.max(count, s.write > 0 ? N : 0));
    return true;
  }
}
