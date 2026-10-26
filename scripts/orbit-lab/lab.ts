// Orbit's lab: see index.html. window.lab.frame(i) draws frame i of the timeline; window.lab.frames is how many there are.
import '../../src/styles.css';
import { SphereRenderer, type OrbInputs, type SphereColors } from '../../src/ui/sphereRender';
import { BOUNCY } from '../../src/ui/motion';

type Levels = { mic: number[][]; out: number[] };
const params = new URLSearchParams(location.search);
const light = params.get('theme') === 'light';
document.documentElement.dataset.theme = light ? 'light' : 'dark';
document.documentElement.dataset.palette = params.get('palette') ?? 'aurora';
const reduced = params.get('reduced') === '1';

// (a colour-mix comes back as color(srgb 0…1), the rest as rgb(0…255))
const probe = (v: string) => { const d = document.createElement('i'); d.style.cssText = `color:var(${v})`; document.querySelector('.app')!.appendChild(d); const c = getComputedStyle(d).color; const n = c.match(/\d*\.?\d+/g)!.slice(0, 3).map(Number); return (c.startsWith('color(') ? n.map((x) => x * 255) : n) as [number, number, number]; };
const ac = probe('--ac'), ac2 = probe('--ac-2'), alt = probe('--h1');
const colors: SphereColors = light
  ? { hi: ac, lo: [ac[0] * 0.55 + 70, ac[1] * 0.55 + 60, ac[2] * 0.55 + 60], alt, ok: [30, 160, 95], dark: false }
  : { hi: ac2, lo: [ac[0] * 0.3, ac[1] * 0.3, ac[2] * 0.3], alt, ok: [110, 222, 150], dark: true };

const FPS = 60, DPR = 2, CSS = 384, SIZE = 367; // the orb screen's orb talking live: min(94vw, 380) at 390 px wide, in its size bucket
const orbCanvas = new OffscreenCanvas(CSS * DPR, CSS * DPR);
const r = new SphereRenderer(orbCanvas);
const scene = document.getElementById('scene') as HTMLCanvasElement;
const sx = scene.getContext('2d')!;

// the timeline (seconds): what happens when
const T = { appear: 0, talk: 2.6, talkEnd: 8.6, think: 8.8, speak: 13.0, done: 18.2, drag: 19.6, let: 20.5, tap: 23.0, leave: 24.6, end: 26.6 };
let L: Levels = { mic: [], out: [] };
const at = <X,>(a: X[], s: number) => a[Math.max(0, Math.min(a.length - 1, Math.floor(s * FPS)))];
// the drag: the finger takes it 60 px right and 110 down, lets go at T.let, and it springs home on BOUNCY
function dragAt(s: number): [number, number] {
  if (s < T.drag) return [0, 0];
  if (s < T.let) { const u = Math.min(1, (s - T.drag) / 0.45), e = u * u * (3 - 2 * u); return [60 * e, 110 * e]; }
  let x = 60, y = 110, vx = 0, vy = 0; const k = BOUNCY.stiffness, c = BOUNCY.damping;
  for (let t = T.let; t < s; t += 1 / 240) { vx += (-k * x - c * vx) / 240; vy += (-k * y - c * vy) / 240; x += vx / 240; y += vy / 240; }
  return [x, y];
}
function inputsAt(s: number): OrbInputs {
  const talking = s >= T.talk && s < T.talkEnd, speaking = s >= T.speak && s < T.speak + L.out.length / FPS;
  const m = talking ? at(L.mic, s - T.talk) : null;
  const phase = s >= T.think && s < T.speak ? 'processing' : speaking ? 'idle' : 'listening';
  return {
    phase, phaseAge: 1, live: phase === 'listening',
    raw: m ? m[0] : 0, bands: m ? Float32Array.from(m.slice(1)) : phase === 'listening' ? new Float32Array(16) : null,
    press: s >= T.drag && s < T.let ? 1 : s >= T.tap - 0.12 && s < T.tap ? 1 : 0, tap: 0,
    voiceOut: speaking ? at(L.out, s - T.speak) : 0, orbit: s >= T.appear && s < T.leave ? 1 : 0, lean: dragAt(s),
  };
}
let tapped = false, beat = false;
function frame(i: number) {
  const s = i / FPS;
  const inp = inputsAt(s);
  if (!tapped && s >= T.tap) { inp.tap = 1; tapped = true; }
  if (!beat && s >= T.done) { inp.beat = 1; beat = true; }
  r.frame(1000 + s * 1000, CSS, reduced, colors, inp);
  // the screen: its dark frost with the accent's low light, and the orb where its slot is (moved by the finger)
  const W = scene.width, H = scene.height;
  sx.globalCompositeOperation = 'source-over';
  sx.fillStyle = light ? '#eef0f4' : '#07090e'; sx.fillRect(0, 0, W, H);
  const g = sx.createRadialGradient(W * 0.5, H * 1.05, 0, W * 0.5, H * 1.05, H * 0.75);
  g.addColorStop(0, `rgba(${ac.join(',')},${light ? 0.12 : 0.16})`); g.addColorStop(1, `rgba(${ac.join(',')},0)`);
  sx.fillStyle = g; sx.fillRect(0, 0, W, H);
  const [lx, ly] = inp.lean!;
  const size = SIZE * DPR, ox = W / 2 - size / 2 + lx * DPR, oy = 330 - size / 2 + ly * DPR;
  sx.drawImage(orbCanvas, ox, oy, size, size);
  sx.font = `600 ${11 * DPR}px system-ui`; sx.textAlign = 'center'; sx.fillStyle = `rgba(${ac2.join(',')},.9)`;
  const word = s >= T.done && s < T.done + 1.2 ? 'LOGGED' : inp.phase === 'processing' ? (s < T.think + 2.1 ? 'LOOKING AT YOUR FOOD…' : 'LOGGING YOUR FOOD…') : inp.phase === 'idle' ? 'SPEAKING' : 'LISTENING';
  sx.fillText(word, W / 2, 330 + 110 * DPR);
}
(window as unknown as { lab: unknown }).lab = {
  async load() { L = await (await fetch(params.get('levels') ?? '/scripts/orbit-lab/levels.json')).json(); },
  frame, get frames() { return Math.round(T.end * FPS); },
  png: () => scene.toDataURL('image/jpeg', 0.92),
};
