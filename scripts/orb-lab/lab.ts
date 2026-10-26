// The orb design lab: see index.html. window.lab.frame(i) draws frame i of one scripted conversation (60 fps) with the
// design ?o=0…4; window.lab.frames is how many there are. Your voice and its voice come from real audio levels
// (levels.json, made from speech-like test audio), smoothed the way the app smooths them.
import { DESIGNS, VERT } from './shaders';
import { BOUNCY } from '../../src/ui/motion';
import '../../src/styles.css';

const params = new URLSearchParams(location.search);
const design = DESIGNS[Number(params.get('o') ?? 0)] ?? DESIGNS[0];
document.documentElement.dataset.palette = params.get('palette') ?? 'aurora';

// the palette's colours, as the app's orb reads them (a colour-mix comes back as color(srgb 0…1))
const probe = (v: string) => { const d = document.createElement('i'); d.style.cssText = `color:var(${v})`; document.querySelector('.app')!.appendChild(d); const c = getComputedStyle(d).color; const n = c.match(/\d*\.?\d+/g)!.slice(0, 3).map(Number); return (c.startsWith('color(') ? n : n.map((x) => x / 255)) as [number, number, number]; };
const AC = probe('--ac'), ALT = probe('--h1'), OK: [number, number, number] = [0.43, 0.87, 0.59];

const FPS = 60, W = 720, H = 900, CX = 360, CY = 400, R = 168;
const T = { appear: 0, listen: 2.2, listenEnd: 8.2, think: 8.4, speak: 11.6, done: 16.8, tap: 18.4, drag: 19.6, let: 20.4, end: 23.0 };
const TAP = { x: 0.38, y: 0.3 }; // where the finger touches (orb units, y up)
const DRAG = { x: 70, y: 120 };   // how far the finger takes it (px)

type Levels = { mic: number[][]; out: number[] };
let L: Levels = { mic: [], out: [] };
const at = <X,>(a: X[], s: number) => a[Math.max(0, Math.min(a.length - 1, Math.floor(s * FPS)))];

const gl = (() => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false })!; })();
const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader'); return s; };
const prog = gl.createProgram()!;
gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, design.frag)); gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
gl.useProgram(prog);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
const U = (n: string) => gl.getUniformLocation(prog, n);

const scene = document.getElementById('scene') as HTMLCanvasElement;
const sx = scene.getContext('2d')!;

// the state, stepped frame by frame (the same smoothing the app would do)
const st = { listen: 0, think: 0, speak: 0, vin: 0, vout: 0, bands: new Float32Array(16), prevIn: 0, prevOut: 0, lastSyl: -9, syl: [-1, -1, -1, -1], sylA: [0, 0, 0, 0], lx: 0, ly: 0, lvx: 0, lvy: 0, press: 0 };
const ease = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
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
  st.listen += ((s >= T.appear + 0.6 && !thinking && !speaking ? 1 : 0) - st.listen) * k(3);
  st.think += ((thinking ? 1 : 0) - st.think) * k(2.6);
  st.speak += ((speaking ? 1 : 0) - st.speak) * k(3);
  const raw = m ? m[0] : 0;
  st.vin += (raw - st.vin) * k(raw > st.vin ? 22 : 6);
  st.vout += (out - st.vout) * k(out > st.vout ? 18 : 5);
  for (let i = 0; i < 16; i++) { const b = m ? m[i + 1] : 0; st.bands[i] += (b - st.bands[i]) * k(b > st.bands[i] ? 14 : 4); }
  // a syllable: a sudden rise in either voice
  const v = listening ? raw : out, prev = listening ? st.prevIn : st.prevOut;
  if ((listening || speaking) && v - prev > 0.08 && v > 0.18 && s - st.lastSyl > 0.16) {
    st.lastSyl = s; st.syl.unshift(0); st.syl.pop(); st.sylA.unshift(Math.min(1, 0.45 + v)); st.sylA.pop();
  }
  st.prevIn = raw; st.prevOut = out;
  st.syl = st.syl.map((a) => (a < 0 ? a : a + dt));
  // the inside lags behind a drag on a soft spring
  const [dx, dy] = dragAt(s);
  for (let t = 0; t < dt; t += 1 / 240) { st.lvx += (-70 * (st.lx - dx) - 11 * st.lvx) / 240; st.lx += st.lvx / 240; st.lvy += (-70 * (st.ly - dy) - 11 * st.lvy) / 240; st.ly += st.lvy / 240; }
  const pressTo = (s >= T.drag && s < T.let) || (s >= T.tap - 0.14 && s < T.tap) ? 1 : 0;
  st.press += (pressTo - st.press) * k(pressTo ? 18 : 10);
}
function caption(s: number) {
  if (s >= T.done && s < T.done + 1.3) return 'Logged';
  if (s >= T.think && s < T.speak) return s < T.think + 1.6 ? 'Looking at your food…' : 'Logging your food…';
  if (s >= T.speak && s < T.done) return 'Speaking';
  return s > 0.8 ? 'Listening' : '';
}
let last = 0;
function frame(i: number) {
  const s = i / FPS;
  step(s, i === 0 ? 1 / FPS : s - last); last = s;
  const [dx, dy] = dragAt(s);
  const sc = 1 - 0.045 * st.press; // a press sinks it in a touch (it stays a sphere)
  const appear = ease((s - T.appear) / 1.2);
  gl.viewport(0, 0, W, H);
  gl.uniform2f(U('uRes'), W, H); gl.uniform2f(U('uC'), CX + dx * 2, H - (CY + dy * 2)); gl.uniform1f(U('uR'), R * sc * (0.92 + 0.08 * appear));
  gl.uniform1f(U('uT'), s + 3.0);
  gl.uniform1f(U('uIn'), st.vin); gl.uniform1f(U('uOut'), st.vout);
  const b = st.bands; gl.uniform4f(U('uB0'), b[0], b[1], b[2], b[3]); gl.uniform4f(U('uB1'), b[4], b[5], b[6], b[7]); gl.uniform4f(U('uB2'), b[8], b[9], b[10], b[11]); gl.uniform4f(U('uB3'), b[12], b[13], b[14], b[15]);
  gl.uniform1f(U('uListen'), st.listen); gl.uniform1f(U('uThink'), st.think); gl.uniform1f(U('uSpeak'), st.speak); gl.uniform1f(U('uAppear'), appear);
  gl.uniform1f(U('uDone'), s >= T.done && s < T.done + 1.3 ? (s - T.done) / 1.3 : 0);
  gl.uniform4f(U('uSyl'), st.syl[0], st.syl[1], st.syl[2], st.syl[3]); gl.uniform4f(U('uSylA'), st.sylA[0], st.sylA[1], st.sylA[2], st.sylA[3]);
  gl.uniform3f(U('uTouch'), TAP.x, TAP.y, s >= T.tap ? 1 : 0); gl.uniform1f(U('uTapAge'), Math.max(0, s - T.tap));
  gl.uniform1f(U('uPress'), st.press);
  const lean = (v: number) => Math.max(-0.35, Math.min(0.35, v / R * 2));
  gl.uniform2f(U('uLean'), lean(st.lx - dx), -lean(st.ly - dy));
  gl.uniform3f(U('uAc'), AC[0], AC[1], AC[2]); gl.uniform3f(U('uAlt'), ALT[0], ALT[1], ALT[2]); gl.uniform3f(U('uOk'), OK[0], OK[1], OK[2]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  sx.drawImage(gl.canvas as HTMLCanvasElement, 0, 0);
  // what it says it is doing, under the orb; the design's name at the top
  sx.textAlign = 'center';
  sx.font = '600 22px system-ui, sans-serif'; sx.fillStyle = `rgba(${AC.map((x) => Math.round(x * 255 * 0.85 + 38)).join(',')},.95)`;
  sx.fillText(caption(s).toUpperCase(), W / 2, CY + R + 92);
  sx.font = '500 24px Georgia, serif'; sx.fillStyle = 'rgba(232,238,240,.55)'; sx.fillText(design.name, W / 2, 64);
}
(window as unknown as { lab: unknown }).lab = {
  async load() { L = await (await fetch('/scripts/orb-lab/levels.json')).json(); },
  frame, get frames() { return Math.round(T.end * FPS); },
  png: () => scene.toDataURL('image/jpeg', 0.92),
};
