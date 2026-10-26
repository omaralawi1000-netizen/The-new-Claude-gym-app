import { useLayoutEffect, useRef } from 'react';
import { DustEngine, type DustState, type RGB } from './engine';

/** What the orb screen tells Stardust every frame (read when it draws, not on render). */
export interface DustLive {
  on: boolean; listen: boolean; think: boolean; speak: boolean; quiet: boolean;
  levels: () => { in: number; bands: Float32Array; out: number; obands?: Float32Array } | null;
  /** the mood of what it is saying (-1 serious … 1 glad) */
  mood: number;
  hold: [number, number] | null; press: number; tap: { n: number; x: number; y: number }; lean: [number, number];
  beat: number; greet: boolean;
  /** your voice was heard (while the greeting shows): it goes back into the orb */
  onVoice: () => void;
}

/**
 * Stardust on the page: a see-through canvas over the whole screen (nothing is drawn where there is no dust), drawn by a
 * worker (stardust.worker.ts) or, where a phone can't, here. Every page frame it reads where the orb's place is (`orbEl`),
 * so the dust follows the orb as it glides to the top or a finger moves it, and it reads the live voices. `greet`: the
 * text Stardust writes with its dust; `greetEl` is the crisp text it is written over (its font and place are copied).
 * `ready(ok)`: whether it could draw at all (if not, the orb screen keeps its usual orb).
 */
export function Stardust({ orbEl, greetEl, greet, live, onCrisp, ready, className }: {
  orbEl: React.RefObject<HTMLElement | null>; greetEl: React.RefObject<HTMLElement | null>; greet: string;
  live: React.RefObject<DustLive>; onCrisp: (on: boolean) => void; ready: (ok: boolean) => void; className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef({ onCrisp, ready }); cb.current = { onCrisp, ready };
  useLayoutEffect(() => {
    // (a fresh canvas each time: a canvas handed to a worker can't be drawn on again, and React may set this up twice; it
    // gets its full size before its first frame, never a small one stretched)
    const holder = box.current; if (!holder) return;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    const dpr0 = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr0); canvas.height = Math.round(window.innerHeight * dpr0);
    holder.appendChild(canvas);
    let worker: Worker | null = null, eng: DustEngine | null = null, raf = 0, stopped = false;
    let gone = true; // nothing drawn (yet, or any more): no frames are sent until there is something to draw
    const fail = () => { cb.current.ready(false); worker?.terminate(); worker = null; eng = null; };
    // where it can, the dust is drawn off the page (the screen's full refresh rate, never waiting for the page)
    const post = (m: unknown, transfer?: Transferable[]) => worker?.postMessage(m, transfer ?? []);
    const startPage = () => {
      try { eng = new DustEngine(canvas); eng.onCrisp = (on) => cb.current.onCrisp(on); cb.current.ready(true); }
      catch { fail(); }
      // (the graphics chip reset: the usual orb comes back until it can draw again)
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fail(); });
    };
    if ('transferControlToOffscreen' in canvas && typeof Worker !== 'undefined') {
      try {
        worker = new Worker(new URL('./stardust.worker.ts', import.meta.url), { type: 'module' });
        const off = canvas.transferControlToOffscreen();
        worker.onmessage = (e) => {
          if (e.data.ready) cb.current.ready(true);
          if (e.data.failed) fail();
          if (e.data.gone) gone = true;
          if ('crisp' in e.data) cb.current.onCrisp(e.data.crisp);
        };
        worker.onerror = (e) => { console.warn('Stardust: the worker could not start', e.message); fail(); };
        post({ canvas: off }, [off]);
      } catch { worker = null; startPage(); }
    } else startPage();

    // the palette's colours, read where the orb screen is (its tab's accent), again when the theme or palette changes (from
    // probes kept in place, so a theme switch adds or removes nothing)
    const probes = new Map<string, HTMLElement>();
    for (const v of ['--ac', '--ac-2', '--h1']) { const d = document.createElement('i'); d.style.cssText = `position:absolute;width:0;height:0;color:var(${v})`; holder.appendChild(d); probes.set(v, d); }
    const probe = (v: string) => { const c = getComputedStyle(probes.get(v)!).color; const n = (c.match(/-?\d*\.?\d+/g) ?? ['1', '1', '1']).slice(0, 3).map(Number); return (c.startsWith('color(') ? n : n.map((x) => x / 255)) as RGB; };
    let colors: DustState['colors'];
    const readColors = () => {
      const dark = document.documentElement.dataset.theme !== 'light';
      // (light theme: deeper colours laid over the page, light can't be added to white)
      const deep = (c: RGB, k: number) => c.map((x) => x * k) as RGB;
      colors = dark ? { ac: probe('--ac-2'), alt: probe('--h1'), ok: [0.43, 0.87, 0.59], dark } : { ac: deep(probe('--ac'), 0.62), alt: deep(probe('--h1'), 0.75), ok: [0.12, 0.63, 0.37], dark };
    };
    readColors();
    const mo = new MutationObserver(readColors);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
    const reducedQ = matchMedia('(prefers-reduced-motion: reduce)');

    // the greeting's shape: its text drawn where the crisp text sits, sampled into points (once its place and font are known)
    let sentText = '';
    const sendText = () => {
      const el = greetEl.current; if (!el || !greet) return;
      const r = el.getBoundingClientRect(); if (!r.width) return;
      const key = `${greet}|${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}`; if (key === sentText) return; sentText = key;
      const cs = getComputedStyle(el);
      const c = document.createElement('canvas'); c.width = Math.ceil(r.width) + 8; c.height = Math.ceil(r.height) + 8;
      const x = c.getContext('2d')!;
      x.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
      x.fillText(greet, c.width / 2, c.height / 2);
      const d = x.getImageData(0, 0, c.width, c.height).data, pts: number[] = [];
      for (let yy = 0; yy < c.height; yy += 2) for (let xx = 0; xx < c.width; xx += 2) if (d[(yy * c.width + xx) * 4 + 3] > 120) pts.push(r.left - 4 + xx, r.top - 4 + yy);
      // shuffled, so every writer speck lands somewhere along the whole line
      for (let i = pts.length / 2 - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pts[i * 2], pts[j * 2]] = [pts[j * 2], pts[i * 2]]; [pts[i * 2 + 1], pts[j * 2 + 1]] = [pts[j * 2 + 1], pts[i * 2 + 1]]; }
      const arr = new Float32Array(pts);
      if (worker) post({ text: arr }, [arr.buffer]); else eng?.setText(arr);
    };

    const bands: number[] = new Array(16).fill(0), obands: number[] = new Array(16).fill(0);
    let voiceFor = 0, stage: HTMLElement | null = null;
    const tick = () => {
      if (stopped || (!worker && !eng)) return; // (it couldn't draw: nothing more to do)
      raf = requestAnimationFrame(tick);
      const L = live.current, el = orbEl.current; if (!L || !el) return;
      // (only while there is dust to draw: before it starts and once it has gone, no frames)
      if (!L.on && gone) return;
      if (L.on) gone = false;
      // (its place without the finger's move, plus the move as it is right now: the move is read live, never a frame late
      // whichever of the two runs first in a frame)
      const slot = el.parentElement ?? el, s0 = slot.getBoundingClientRect(), [mx, my] = slot === el ? [0, 0] : L.lean;
      // (seamless from the dock: while the orb is still flying up to its place, or flying home, the dust is where the orb is
      // drawn on its way, the same size; once it has landed it follows its place and your finger exactly)
      stage = stage?.isConnected ? stage : document.querySelector<HTMLElement>('.sphere-stage');
      const g = stage?.getBoundingClientRect();
      const flying = !!g && g.width > 2 && !L.hold && Math.abs(mx) + Math.abs(my) < 0.5
        && (Math.abs(g.left + g.width / 2 - (s0.left + s0.width / 2)) + Math.abs(g.top + g.height / 2 - (s0.top + s0.height / 2)) > 2 || Math.abs(g.width - s0.width) > 2);
      const r = flying ? g! : s0;
      const lv = L.levels();
      if (lv) for (let i = 0; i < 16; i++) { bands[i] = lv.bands[i] ?? 0; obands[i] = lv.obands?.[i] ?? 0; }
      // (your voice for a moment, not a click or a breath, takes the greeting back into the orb)
      if (L.greet) { sendText(); voiceFor = (lv?.in ?? 0) > 0.16 ? voiceFor + 1 : 0; if (voiceFor > 12) L.onVoice(); }
      const st: DustState = {
        at: performance.timeOrigin + performance.now(),
        w: canvas.clientWidth || window.innerWidth, h: canvas.clientHeight || window.innerHeight, dpr: Math.min(2.5, window.devicePixelRatio || 1),
        // (the sphere fills two thirds of the orb's place, as the usual orb does)
        cx: r.left + r.width / 2 + (flying ? 0 : mx), cy: r.top + r.height / 2 + (flying ? 0 : my), r: (r.width / 2) * 0.66,
        on: L.on ? 1 : 0, listen: L.listen, think: L.think, speak: L.speak, quiet: L.quiet,
        vin: lv?.in ?? 0, bands, vout: lv?.out ?? 0, obands, mood: L.mood,
        hold: L.hold, press: L.press, tap: L.tap, lean: L.lean, beat: L.beat, greet: L.greet,
        reduced: reducedQ.matches || document.documentElement.dataset.motion === 'reduce', colors,
      };
      if (worker) post({ state: st }); else eng?.frame(performance.now(), st);
    };
    raf = requestAnimationFrame(tick);
    // (off screen the page's frames stop; the worker draws only while the dust moves and stops once it has gone)
    return () => { stopped = true; cancelAnimationFrame(raf); mo.disconnect(); worker?.terminate(); worker = null; eng = null; canvas.remove(); probes.forEach((d) => d.remove()); };
  }, [greet]); // eslint-disable-line
  return <div ref={box} aria-hidden className={className} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />;
}
