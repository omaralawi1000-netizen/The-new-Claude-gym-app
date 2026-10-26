// Films the real Stardust engine (what ships) through one live conversation: it appears and writes its greeting, hears you,
// thinks, speaks, steps up small to the top as the conversation starts, hears you there, is dragged and let go, is tapped.
import { DustEngine, type DustState, type RGB } from '../../src/ui/stardust/engine';
import { BOUNCY } from '../../src/ui/motion';
import '../../src/styles.css';

const q = new URLSearchParams(location.search);
const theme = q.get('theme') ?? 'dark';
document.documentElement.dataset.theme = theme;
const FPS = 60, CW = 400, CH = 600, DPR = 2;
const scene = document.getElementById('scene') as HTMLCanvasElement; scene.width = CW * DPR; scene.height = CH * DPR;
const sx = scene.getContext('2d')!;
const glc = document.createElement('canvas');
const eng = new DustEngine(glc);
const probe = (v: string) => { const d = document.createElement('i'); d.style.cssText = `color:var(${v})`; document.querySelector('.app')!.appendChild(d); const c = getComputedStyle(d).color; const n = c.match(/-?\d*\.?\d+/g)!.slice(0, 3).map(Number); return (c.startsWith('color(') ? n : n.map((x) => x / 255)) as RGB; };
const dark = theme !== 'light';
const deep = (c: RGB, k: number) => c.map((x) => x * k) as RGB;
const colors = dark ? { ac: probe('--ac-2'), alt: probe('--h1'), ok: [0.43, 0.87, 0.59] as RGB, dark } : { ac: deep(probe('--ac'), 0.62), alt: deep(probe('--h1'), 0.75), ok: [0.12, 0.63, 0.37] as RGB, dark };
const BG = dark ? '#07080f' : '#f4f2ee';

const T = { greet: 0, voice: 4.4, voiceEnd: 9.4, think: 9.6, speak: 12.2, glide: 17.2, small: 18.4, voice2: 18.6, drag: 22.2, let: 23.0, tap: 25.2, end: 27 };
const BIG = { cx: CW / 2, cy: 250, r: 84 }, SMALL = { cx: CW / 2, cy: 70, r: 32 };
const GREET = 'What can I do for you?', GY = BIG.cy + 125;
let L: { mic: number[][]; out: number[] } = { mic: [], out: [] };
const at = <X,>(a: X[], s: number) => a[Math.min(a.length - 1, Math.max(0, Math.floor(s * FPS)))];
const ease = (x: number) => { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); };
const eio = (x: number) => { x = Math.max(0, Math.min(1, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

function greetPoints() {
  const c = document.createElement('canvas'); c.width = CW; c.height = 60; const x = c.getContext('2d')!;
  x.font = 'italic 400 27px Newsreader, Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.fillText(GREET, CW / 2, 30);
  const d = x.getImageData(0, 0, c.width, c.height).data, pts: number[] = [];
  for (let yy = 0; yy < c.height; yy += 2) for (let xx = 0; xx < c.width; xx += 2) if (d[(yy * c.width + xx) * 4 + 3] > 120) pts.push(xx, GY - 30 + yy);
  for (let i = pts.length / 2 - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pts[i * 2], pts[j * 2]] = [pts[j * 2], pts[i * 2]]; [pts[i * 2 + 1], pts[j * 2 + 1]] = [pts[j * 2 + 1], pts[i * 2 + 1]]; }
  return new Float32Array(pts);
}
let crisp = false; eng.onCrisp = (on) => { crisp = on; };
let crispA = 0;
function dragAt(s: number): [number, number] {
  if (s < T.drag) return [0, 0];
  const D = [60, 120];
  if (s < T.let) { const e = ease((s - T.drag) / 0.6); return [D[0] * e, D[1] * e]; }
  let x = D[0], y = D[1], vx = 0, vy = 0; const k = BOUNCY.stiffness, c = BOUNCY.damping;
  for (let t = T.let; t < s; t += 1 / 240) { vx += (-k * x - c * vx) / 240; vy += (-k * y - c * vy) / 240; x += vx / 240; y += vy / 240; }
  return [x, y];
}
let tapN = 0;
function state(s: number): DustState {
  const g = eio((s - T.glide) / 1.0);
  const base = { cx: BIG.cx + (SMALL.cx - BIG.cx) * g, cy: BIG.cy + (SMALL.cy - BIG.cy) * g, r: BIG.r + (SMALL.r - BIG.r) * g };
  const [dx, dy] = dragAt(s);
  const thinking = s >= T.think && s < T.speak, speaking = s >= T.speak && s < T.speak + L.out.length / FPS;
  const m = s >= T.voice && s < T.voiceEnd ? at(L.mic, s - T.voice) : s >= T.voice2 && s < T.voice2 + 3.4 ? at(L.mic, s - T.voice2 + 0.4) : null;
  if (s >= T.tap && tapN === 0) tapN = 1;
  return {
    w: CW, h: CH, dpr: DPR, cx: base.cx + dx, cy: base.cy + dy, r: base.r,
    on: 1, listen: !thinking && !speaking, think: thinking, speak: speaking, quiet: false,
    vin: m ? m[0] : 0, bands: m ? m.slice(1) : new Array(16).fill(0), vout: speaking ? at(L.out, s - T.speak) : 0,
    hold: null, press: (s >= T.drag && s < T.let) ? 1 : 0, tap: { n: tapN, x: 0.35, y: 0.3 }, lean: [dx, dy], beat: s >= T.speak + 1.5 ? 1 : 0,
    greet: s < T.voice + 0.3, reduced: false, colors,
  };
}
function caption(s: number) {
  if (s >= T.think && s < T.speak) return 'Looking at your food…';
  if (s >= T.speak && s < T.glide) return 'Speaking';
  return 'Listening';
}
function frame(i: number) {
  const s = i / FPS;
  const st = state(s);
  eng.frame(i * 1000 / FPS + 1, st);
  sx.setTransform(1, 0, 0, 1, 0, 0);
  sx.fillStyle = BG; sx.fillRect(0, 0, scene.width, scene.height);
  sx.drawImage(glc, 0, 0);
  sx.setTransform(DPR, 0, 0, DPR, 0, 0);
  crispA += ((crisp ? 1 : 0) - crispA) * 0.12;
  if (crispA > 0.01) { sx.globalAlpha = crispA; sx.font = 'italic 400 27px Newsreader, Georgia, serif'; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillStyle = dark ? '#eef0f4' : '#16181d'; sx.fillText(GREET, CW / 2, GY); sx.globalAlpha = 1; }
  sx.font = '600 10px system-ui, sans-serif'; sx.textAlign = 'center'; sx.fillStyle = dark ? 'rgba(220,200,160,.8)' : 'rgba(80,60,30,.8)';
  sx.fillText(caption(s).toUpperCase(), st.cx, st.cy + st.r / 0.66 + 14);
}
(window as unknown as { lab: unknown }).lab = {
  async load() { L = await (await fetch('/scripts/dust-lab/levels.json')).json(); await document.fonts.ready; eng.setText(greetPoints()); },
  frame, get frames() { return Math.round(T.end * FPS); },
  png: () => scene.toDataURL('image/jpeg', 0.92),
};
