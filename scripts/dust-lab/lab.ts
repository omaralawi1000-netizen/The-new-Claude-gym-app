// Stardust (Omar, 26 Oct: "that would have to be the orb, the dots… the dots forming"): the orb is thousands of fine specks
// of light (mostly tiny, a few brighter, soft, with depth), and the same specks stream out of it to write its words and
// flow back in. The sphere stays whole: only a share of its dust leaves and returns. Everything moves on the graphics chip
// (one vertex shader places every speck from a few numbers), so thousands of them cost almost nothing per frame.
//  - appearing: the dust gathers out of the dark into the sphere;
//  - greeting: "What can I do for you?" forms out of its dust; when you start talking it dissolves back into the orb;
//  - listening: the dust swells and shimmers with your voice (low voice low in it, high voice high);
//  - thinking: the dust turns in bands like a galaxy, the middle fastest, around a brightening core;
//  - speaking: waves of light run out through the dust with each syllable, and its answer forms out of it;
//  - logged: the success colour runs up through it; the answer flows back in;
//  - touch: the dust scatters from your finger and swirls back; drag: the outer dust lags and sloshes, then settles.
// window.lab.frame(i) draws frame i (60 fps); window.lab.frames is how many there are.
import { BOUNCY } from '../../src/ui/motion';
import '../../src/styles.css';

const params = new URLSearchParams(location.search);
document.documentElement.dataset.palette = params.get('palette') ?? 'aurora';
const probe = (v: string) => { const d = document.createElement('i'); d.style.cssText = `color:var(${v})`; document.querySelector('.app')!.appendChild(d); const c = getComputedStyle(d).color; const n = c.match(/\d*\.?\d+/g)!.slice(0, 3).map(Number); return (c.startsWith('color(') ? n : n.map((x) => x / 255)) as [number, number, number]; };
const AC = probe('--ac'), ALT = probe('--h1'), OK: [number, number, number] = [0.43, 0.87, 0.59];

const FPS = 60, W = 720, H = 900, CX = 360, CY = 360, R = 150, DPR = 2;
const T = { appear: 0, greet: 1.3, listen: 4.6, listenEnd: 10.6, think: 10.8, speak: 13.6, ans: 13.8, done: 18.8, ansOut: 19.1, tap: 20.6, drag: 21.8, let: 22.6, end: 25.5 };
const TEXT_Y = 660;
const GREET = 'What can I do for you?';
const ANSWER = ['Logged 200 g skyr.', '48 g protein left today.'];
const TAP = { x: 0.4, y: 0.32 };
const DRAG = { x: 70, y: 110 };

// ── the specks ──
const N = 16000, WRITERS = 3400;
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const home = new Float32Array(N * 4), rnd4 = new Float32Array(N * 4), tg = new Float32Array(N * 4);
for (let i = 0; i < N; i++) {
  // a fibonacci sphere, each speck a little in or out of the surface (a shell with depth, a few deeper inside)
  const y = 1 - (2 * (i + 0.5)) / N, rr = Math.sqrt(1 - y * y), th = i * Math.PI * (3 - Math.sqrt(5));
  const inner = rnd() < 0.18;
  const shell = inner ? 0.35 + rnd() * 0.55 : 0.93 + rnd() * 0.09;
  home.set([Math.cos(th) * rr, y, Math.sin(th) * rr, shell], i * 4);
  const u = rnd(); // sizes as the particle title has them: mostly tiny, some medium, a few large
  const size = u < 0.7 ? 0.7 + rnd() * 0.6 : u < 0.95 ? 1.3 + rnd() * 1.0 : 2.6 + rnd() * 1.6;
  rnd4.set([rnd(), rnd(), rnd(), size], i * 4);
  tg.set([-1, -1, -1, -1], i * 4);
}
// the words: drawn once, sampled into points; each writer speck gets one (greeting in xy, answer in zw)
function sample(lines: string[], font: string, lineH: number): [number, number][] {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d')!;
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
  lines.forEach((l, k) => x.fillText(l, W / 2, TEXT_Y + (k - (lines.length - 1) / 2) * lineH));
  const d = x.getImageData(0, 0, W, H).data, pts: [number, number][] = [];
  for (let yy = 0; yy < H; yy += 2) for (let xx = 0; xx < W; xx += 2) if (d[(yy * W + xx) * 4 + 3] > 120) pts.push([xx, yy]);
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  return pts.slice(0, WRITERS);
}
const fontG = 'italic 400 46px Newsreader, Georgia, serif', fontA = '500 30px Geist, system-ui, sans-serif';
const gPts = sample([GREET], fontG, 0), aPts = sample(ANSWER, fontA, 42);
// writers spread evenly through the sphere (every other speck of the outer shell, so the sphere stays whole)
const writers: number[] = []; for (let i = 0; i < N && writers.length < WRITERS; i++) if (home[i * 4 + 3] > 0.9 && i % 2 === 0) writers.push(i);
writers.forEach((i, k) => { const g = gPts[k % gPts.length], a = aPts[k % aPts.length]; tg.set([g[0], g[1], a[0], a[1]], i * 4); });

const VS = `#version 300 es
in vec4 aHome; in vec4 aRnd; in vec4 aTg;
uniform vec2 uC; uniform float uR; uniform float uT; uniform float uRot;
uniform float uIn; uniform vec4 uB0; uniform vec4 uB1; uniform vec4 uB2; uniform vec4 uB3;
uniform float uOut; uniform float uListen; uniform float uThink; uniform float uSpeak; uniform float uAppear; uniform float uDone;
uniform vec4 uSyl; uniform vec4 uSylA; uniform vec3 uTouch; uniform float uTapAge; uniform float uPress; uniform vec2 uLean;
uniform float uGreet; uniform float uGreetOut; uniform float uAns; uniform float uAnsOut; uniform vec2 uView; uniform float uDpr;
out float vA; out float vHot; out float vOk; out float vBack;
#define PI 3.14159265
float band(float x) {
  float f = clamp(x, 0.0, 1.0) * 15.0; int i = int(floor(f)); float r = f - float(i);
  float b[16] = float[16](uB0.x,uB0.y,uB0.z,uB0.w,uB1.x,uB1.y,uB1.z,uB1.w,uB2.x,uB2.y,uB2.z,uB2.w,uB3.x,uB3.y,uB3.z,uB3.w);
  return mix(b[i], b[min(15, i + 1)], r);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float sm(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
float eio(float x) { x = clamp(x, 0.0, 1.0); return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0; }
vec2 bow(vec2 a, vec2 b, float bend, float t) {
  float e = eio(t); vec2 d = b - a; float L = max(length(d), 1.0);
  return mix(a, b, e) + vec2(-d.y, d.x) / L * sin(e * PI) * bend;
}
void main() {
  vec3 p = aHome.xyz; float shell = aHome.w;
  float lat = p.y;
  // the turn: slow at rest; thinking, a galaxy's bands (the middle faster), tilting in a little
  float spin = uRot + uThink * uT * 1.5 * (1.0 - abs(lat)) * (0.6 + 0.4 * aRnd.x);
  p.xz = rot(spin) * p.xz;
  // thinking: the sphere's dust settles into a spinning galaxy, a tilted disc with spiral arms (and rises back into the
  // sphere as it answers)
  float gk = uThink * uThink * (3.0 - 2.0 * uThink);
  p.yz = rot(0.38) * p.yz;
  float r = shell;
  if (gk > 0.001) {
    // each speck's place in the galaxy: spread from the core out, the inner ones turning faster, gathered into two arms
    float rg = pow(aRnd.x, 0.75) * 1.05 + 0.03;
    float ang = atan(aHome.z, aHome.x) - uT * 0.9 / (rg + 0.35);
    ang += 0.42 * sin(2.0 * (ang + log(rg) * 3.2));
    vec3 g = vec3(cos(ang) * rg, (aRnd.y - 0.5) * 0.06 * (1.0 - rg * 0.5), sin(ang) * rg);
    g.yz = rot(0.5) * g.yz; // seen from a little above
    p = mix(p * r, g, gk); r = 1.0;
  }
  // your voice: the dust swells where your voice is (low voice low in it), shimmering
  float bv = band((lat + 1.0) * 0.5) * uListen;
  r *= 1.0 + bv * 0.16 * (0.55 + 0.45 * sin(uT * 7.0 + aRnd.y * 30.0)) + uIn * uListen * 0.03;
  // its voice: a wave of light running out through the dust with each syllable
  float hot = 0.0;
  for (int i = 0; i < 4; i++) { float age = uSyl[i]; if (age < 0.0 || age > 1.4) continue; float d = shell - age * 1.1; float w = exp(-d * d * 60.0) * uSylA[i] * (1.0 - age / 1.4) * uSpeak; r *= 1.0 + w * 0.06; hot += w; }
  r *= 1.0 + uOut * uSpeak * 0.035;
  // appearing: gathering out of the dark, each speck in its turn
  float ap = sm((uAppear - aRnd.z * 0.45) / 0.55);
  vec3 q = p * r;
  q = mix(q * (2.6 + aRnd.x * 1.4) + vec3(0.0, 0.0, -1.5), q, ap);
  float persp = 1.0 / (1.0 - q.z * 0.28);
  vec2 s = q.xy * persp;
  // a press gathers it in a touch; a touch scatters the dust from your finger and it swirls back
  s *= 1.0 - 0.04 * uPress;
  vec2 td = s - uTouch.xy; float tdd = dot(td, td);
  float push = uTouch.z * exp(-uTapAge * 2.0) * sin(min(uTapAge * 6.0, PI) * 0.5 + 0.0) ;
  s += normalize(td + 1e-4) * push * 0.35 * exp(-tdd * 9.0);
  s = rot(uTouch.z * exp(-uTapAge * 1.6) * 0.6 * exp(-tdd * 6.0)) * s;
  // a drag: the outer dust lags behind the finger more than the inner
  s += uLean * (0.4 + 0.6 * shell) * (0.7 + 0.6 * aRnd.y);
  vec2 px = uC + s * uR;
  // writing: the writer specks fly out (each in its turn, left to right) and back
  vOk = 0.0;
  float wr = 0.0;
  if (aTg.x >= 0.0) {
    vec2 g = aTg.xy, a = aTg.zw;
    float dl = (g.x / uView.x) * 0.5 + aRnd.z * 0.25;
    float kG = sm((uGreet - dl) / 0.5) * (1.0 - sm((uGreetOut - aRnd.x * 0.45) / 0.55));
    float dA = (a.x / uView.x) * 0.45 + aRnd.z * 0.25;
    float kA = sm((uAns - dA) / 0.5) * (1.0 - sm((uAnsOut - aRnd.x * 0.45) / 0.55));
    vec2 gp = vec2(g.x, uView.y - g.y), ap2 = vec2(a.x, uView.y - a.y);
    float bend = (aRnd.y - 0.5) * 160.0;
    if (kG > 0.0) px = bow(px, gp, bend, kG);
    if (kA > 0.0) px = bow(px, ap2, -bend, kA);
    wr = max(kG, kA);
  }
  gl_Position = vec4(px / uView * 2.0 - 1.0, 0.0, 1.0);
  float depth = mix(clamp((q.z / max(r, 0.3) + 1.0) * 0.5, 0.0, 1.0), 0.75 + 0.25 * q.z, gk);
  vBack = 1.0 - depth;
  // light drifting over the dust in slow clouds (so you can follow it turn), and thinking's spiral arms
  vec3 hp = aHome.xyz;
  float cloud = vn(hp * 2.3 + vec3(0.0, uT * 0.12, uT * 0.07)) * 0.65 + vn(hp * 5.1 - uT * 0.2) * 0.35;
  float lon = atan(p.z, p.x);
  float rg2 = pow(aRnd.x, 0.75) * 1.05 + 0.03;
  float ga = atan(aHome.z, aHome.x) - uT * 0.9 / (rg2 + 0.35); ga += 0.42 * sin(2.0 * (ga + log(rg2) * 3.2));
  float arms = 0.5 + 0.5 * cos(2.0 * (ga + log(rg2) * 3.2));
  float lit = mix(smoothstep(0.3, 0.8, cloud), 0.14 + 0.86 * pow(arms, 2.2), gk);
  lit = max(lit, bv * 1.2);
  // the far side small and faint, the near side crisp: depth
  gl_PointSize = aRnd.w * uDpr * 0.8 * mix(mix(0.55, 1.05, depth), 1.0, wr) * (1.0 + hot * 0.5) * (1.0 + bv * 0.4);
  float a0 = mix(0.06, 1.0, pow(depth, 1.8)) * (0.18 + 0.82 * lit);
  vA = mix(a0, 0.95, wr) * ap * (1.0 + bv * 0.8 + uIn * uListen * 0.3 + gk * 0.9);
  vHot = hot + gk * exp(-length(q.xz) * 4.0) * 1.6 + bv * 0.6;
  // logged: the success colour runs up through it
  if (uDone > 0.0) vOk = exp(-pow((lat + 1.0 - uDone * 2.4) * 3.0, 2.0)) * (1.0 - uDone);
}`;
const FS = `#version 300 es
precision highp float;
in float vA; in float vHot; in float vOk; in float vBack;
uniform vec3 uAc; uniform vec3 uAlt; uniform vec3 uOk;
out vec4 o;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0; float r = length(c);
  if (r > 1.0) discard;
  float core = smoothstep(1.0, 0.0, r), glow = exp(-r * r * 3.0);
  vec3 col = mix(mix(uAc, vec3(1.0), 0.35), uAlt, vBack * 0.55);
  col = mix(col, vec3(1.0), clamp(vHot * 0.5, 0.0, 0.7));
  col = mix(col, uOk, clamp(vOk, 0.0, 1.0));
  float a = vA * (core * 0.6 + glow * 0.4);
  o = vec4(col * a, a);
}`;
const BG = `#version 300 es
precision highp float;
uniform vec2 uView; uniform vec2 uC; uniform float uR; uniform vec3 uAc; uniform vec3 uAlt; uniform float uGlow;
out vec4 o;
void main() {
  vec2 f = gl_FragCoord.xy, q = f / uView;
  vec3 c = vec3(0.024, 0.031, 0.05) + uAc * 0.1 * smoothstep(1.1, 0.0, length((q - vec2(0.5, -0.08)) * vec2(1.0, 1.4)));
  float r = length(f - uC) / uR;
  c += mix(uAc, uAlt, 0.3) * uGlow * 0.16 * exp(-r * r * 0.9);
  o = vec4(c, 1.0);
}`;
const VQ = `#version 300 es
in vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const gl = (() => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: true })!; })();
const mk = (vs: string, fs: string) => {
  const sh = (t: number, s: string) => { const x = gl.createShader(t)!; gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) ?? ''); return x; };
  const p = gl.createProgram()!; gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? ''); return p;
};
const dust = mk(VS, FS), bg = mk(VQ, BG);
const vaoD = gl.createVertexArray()!; gl.bindVertexArray(vaoD);
const attr = (name: string, data: Float32Array) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); const l = gl.getAttribLocation(dust, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 0, 0); };
attr('aHome', home); attr('aRnd', rnd4); attr('aTg', tg);
const vaoB = gl.createVertexArray()!; gl.bindVertexArray(vaoB);
{ const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); const l = gl.getAttribLocation(bg, 'a'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0); }

const scene = document.getElementById('scene') as HTMLCanvasElement;
const sx = scene.getContext('2d')!;
type Levels = { mic: number[][]; out: number[] };
let L: Levels = { mic: [], out: [] };
const at = <X,>(a: X[], s: number) => a[Math.max(0, Math.min(a.length - 1, Math.floor(s * FPS)))];
const ease = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
const st = { listen: 0, think: 0, speak: 0, vin: 0, vout: 0, bands: new Float32Array(16), prevIn: 0, prevOut: 0, lastSyl: -9, syl: [-1, -1, -1, -1], sylA: [0, 0, 0, 0], lx: 0, ly: 0, lvx: 0, lvy: 0, press: 0, rot: 0 };
function dragAt(s: number): [number, number] {
  if (s < T.drag) return [0, 0];
  if (s < T.let) { const e = ease((s - T.drag) / 0.5); return [DRAG.x * e, DRAG.y * e]; }
  let x = DRAG.x, y = DRAG.y, vx = 0, vy = 0; const k = BOUNCY.stiffness, c = BOUNCY.damping;
  for (let t = T.let; t < s; t += 1 / 240) { vx += (-k * x - c * vx) / 240; vy += (-k * y - c * vy) / 240; x += vx / 240; y += vy / 240; }
  return [x, y];
}
function step(s: number, dt: number) {
  const listening = s >= T.listen && s < T.think, thinking = s >= T.think && s < T.speak;
  const speaking = s >= T.speak && s < T.speak + L.out.length / FPS;
  const m = s >= T.listen && s < T.listenEnd ? at(L.mic, s - T.listen) : null;
  const out = speaking ? at(L.out, s - T.speak) : 0;
  const k = (rate: number) => 1 - Math.exp(-dt * rate);
  st.listen += ((s >= T.listen && !thinking && !speaking ? 1 : 0) - st.listen) * k(3);
  st.think += ((thinking ? 1 : 0) - st.think) * k(2.4);
  st.speak += ((speaking ? 1 : 0) - st.speak) * k(3);
  const raw = m ? m[0] : 0;
  st.vin += (raw - st.vin) * k(raw > st.vin ? 22 : 6);
  st.vout += (out - st.vout) * k(out > st.vout ? 18 : 5);
  for (let i = 0; i < 16; i++) { const b = m ? m[i + 1] : 0; st.bands[i] += (b - st.bands[i]) * k(b > st.bands[i] ? 14 : 4); }
  const v = listening ? raw : out, prev = listening ? st.prevIn : st.prevOut;
  if ((listening || speaking) && v - prev > 0.08 && v > 0.18 && s - st.lastSyl > 0.16) { st.lastSyl = s; st.syl.unshift(0); st.syl.pop(); st.sylA.unshift(Math.min(1, 0.45 + v)); st.sylA.pop(); }
  st.prevIn = raw; st.prevOut = out;
  st.syl = st.syl.map((a) => (a < 0 ? a : a + dt));
  st.rot += dt * (0.16 + st.vin * 0.25 + st.vout * 0.15);
  const [dx, dy] = dragAt(s);
  for (let t = 0; t < dt; t += 1 / 240) { st.lvx += (-60 * (st.lx - dx) - 9 * st.lvx) / 240; st.lx += st.lvx / 240; st.lvy += (-60 * (st.ly - dy) - 9 * st.lvy) / 240; st.ly += st.lvy / 240; }
  const pressTo = (s >= T.drag && s < T.let) || (s >= T.tap - 0.14 && s < T.tap) ? 1 : 0;
  st.press += (pressTo - st.press) * k(pressTo ? 18 : 10);
}
function caption(s: number) {
  if (s >= T.done && s < T.done + 1.3) return 'Logged';
  if (s >= T.think && s < T.speak) return s < T.think + 1.4 ? 'Looking at your food…' : 'Logging your food…';
  if (s >= T.speak && s < T.done) return 'Speaking';
  return s >= T.listen ? 'Listening' : '';
}
let last = 0;
function frame(i: number) {
  const s = i / FPS;
  step(s, i === 0 ? 1 / FPS : s - last); last = s;
  const [dx, dy] = dragAt(s);
  const cx = CX + dx * DPR * 0.5, cy = H - (CY + dy * DPR * 0.5);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.BLEND);
  gl.useProgram(bg); gl.bindVertexArray(vaoB);
  gl.uniform2f(gl.getUniformLocation(bg, 'uView'), W, H); gl.uniform2f(gl.getUniformLocation(bg, 'uC'), cx, cy); gl.uniform1f(gl.getUniformLocation(bg, 'uR'), R);
  gl.uniform3f(gl.getUniformLocation(bg, 'uAc'), ...AC); gl.uniform3f(gl.getUniformLocation(bg, 'uAlt'), ...ALT);
  gl.uniform1f(gl.getUniformLocation(bg, 'uGlow'), ease(s / 1.5) * (0.7 + st.vin * st.listen * 0.8 + st.vout * 0.6 + st.think * 0.5));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(dust); gl.bindVertexArray(vaoD);
  const U = (n: string) => gl.getUniformLocation(dust, n);
  gl.uniform2f(U('uView'), W, H); gl.uniform1f(U('uDpr'), DPR);
  gl.uniform2f(U('uC'), cx, cy); gl.uniform1f(U('uR'), R); gl.uniform1f(U('uT'), s + 3); gl.uniform1f(U('uRot'), st.rot);
  gl.uniform1f(U('uIn'), st.vin); gl.uniform1f(U('uOut'), st.vout);
  const b = st.bands; gl.uniform4f(U('uB0'), b[0], b[1], b[2], b[3]); gl.uniform4f(U('uB1'), b[4], b[5], b[6], b[7]); gl.uniform4f(U('uB2'), b[8], b[9], b[10], b[11]); gl.uniform4f(U('uB3'), b[12], b[13], b[14], b[15]);
  gl.uniform1f(U('uListen'), st.listen); gl.uniform1f(U('uThink'), st.think); gl.uniform1f(U('uSpeak'), st.speak); gl.uniform1f(U('uAppear'), ease(s / 1.6));
  gl.uniform1f(U('uDone'), s >= T.done && s < T.done + 1.3 ? (s - T.done) / 1.3 : 0);
  gl.uniform4f(U('uSyl'), st.syl[0], st.syl[1], st.syl[2], st.syl[3]); gl.uniform4f(U('uSylA'), st.sylA[0], st.sylA[1], st.sylA[2], st.sylA[3]);
  gl.uniform3f(U('uTouch'), TAP.x, TAP.y, s >= T.tap ? 1 : 0); gl.uniform1f(U('uTapAge'), Math.max(0, s - T.tap));
  gl.uniform1f(U('uPress'), st.press);
  const lean = (v: number) => Math.max(-0.4, Math.min(0.4, (v * DPR * 0.5) / R));
  gl.uniform2f(U('uLean'), lean(st.lx - dx), -lean(st.ly - dy));
  gl.uniform1f(U('uGreet'), Math.max(0, (s - T.greet) / 1.8)); gl.uniform1f(U('uGreetOut'), Math.max(0, (s - T.listen) / 1.3));
  gl.uniform1f(U('uAns'), Math.max(0, (s - T.ans) / 1.8)); gl.uniform1f(U('uAnsOut'), Math.max(0, (s - T.ansOut) / 1.3));
  gl.uniform3f(U('uAc'), ...AC); gl.uniform3f(U('uAlt'), ...ALT); gl.uniform3f(U('uOk'), ...OK);
  gl.drawArrays(gl.POINTS, 0, N);
  sx.drawImage(gl.canvas as HTMLCanvasElement, 0, 0);
  sx.textAlign = 'center';
  sx.font = '600 22px system-ui, sans-serif'; sx.fillStyle = `rgba(${AC.map((x) => Math.round(x * 255 * 0.85 + 38)).join(',')},.95)`;
  sx.fillText(caption(s).toUpperCase(), W / 2, CY + R + 44);
  sx.font = '500 24px Georgia, serif'; sx.fillStyle = 'rgba(232,238,240,.55)'; sx.fillText('Stardust', W / 2, 52);
}
(window as unknown as { lab: unknown }).lab = {
  async load() { L = await (await fetch('/scripts/dust-lab/levels.json')).json(); },
  frame, get frames() { return Math.round(T.end * FPS); },
  png: () => scene.toDataURL('image/jpeg', 0.92),
};
