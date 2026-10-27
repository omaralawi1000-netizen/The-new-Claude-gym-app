import { useLayoutEffect, useRef } from 'react';
import { DustEngine, type DustState, type RGB } from './engine';
import { springSamples, SURFACE } from '../motion';

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
  /** it is answering: it sinks into the horizon below the screen's edge (a planet seen from orbit), clear of the words */
  horizon: boolean;
  /** where the conversation's words end on screen (css px from the top): the horizon stays below them */
  textBottom: () => number;
  /** a card to write in dust (a new counter starts it from the orb; its points from ui/stardust/shape.ts) */
  shape: { n: number; pts: Float32Array | null };
  /** the card is being written (true) or its dust flows home (false) */
  shaping: boolean;
  /** a card dissolving back into it (a counter: Undo): its dust starts where the card is */
  jump: number;
  /** how far the card being written has moved since its shape was read (css px) */
  shift: () => [number, number];
  /** your day as stars: one for each thing done in this conversation, resting on the horizon's rim */
  stars: () => DustStar[];
  /** a star has just settled on the rim (a tiny tick) */
  onStar: () => void;
}

/** A star on the horizon: where its spark leaves from (a card's middle, css px), when, and whether Undo took it away. */
export interface DustStar { id: string; from: [number, number] | null; at: number; gone?: boolean }

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
      if (worker) post({ text: arr, use: 3400 }, [arr.buffer]); else eng?.setText(arr, 3400); // (the greeting: as many specks as it always had)
    };

    const bands: number[] = new Array(16).fill(0), obands: number[] = new Array(16).fill(0);
    // the horizon's air: a soft ring of light along its rim (one element, moved and faded by transform and opacity only)
    const air = document.createElement('div');
    air.style.cssText = 'position:absolute;left:0;top:0;width:400px;height:400px;border-radius:50%;pointer-events:none;opacity:0;will-change:transform,opacity;transform-origin:200px 200px';
    holder.insertBefore(air, canvas);
    let airKey = '', airO = -1, hz = 0, lastT = performance.now(), shapeN = 0, topS = -1;
    let froze = { x: 0, y: 0, r: 0 }; // (the orb's place just before it sank: the horizon grows from there, not from its small slot)
    const paintAir = () => {
      const c = colors.ac.map((x) => Math.round(Math.min(1, x / (colors.dark ? 1 : 0.62)) * 255)).join(','); // (the dust's own accent, in both themes)
      if (c === airKey) return; airKey = c;
      air.style.background = `radial-gradient(closest-side, rgba(${c},0) 76%, rgba(${c},.42) 84.5%, rgba(${c},.14) 90%, rgba(${c},0) 100%)`;
    };
    // your day as stars: small points of light on the rim (each one element, moved and faded by transform and opacity only)
    type StarEl = { el: HTMLDivElement; slot: number; o: number; landed: boolean; tw: number; tf: string };
    const starEls = new Map<string, StarEl>();
    const starCss = 'position:absolute;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;pointer-events:none;opacity:0;will-change:transform,opacity';
    const paintStar = (el: HTMLDivElement) => { const c = airKey || '255,255,255'; el.style.background = `radial-gradient(closest-side, rgba(255,255,255,${colors.dark ? 1 : 0.95}) 0 22%, rgba(${c},.55) 40%, rgba(${c},0) 100%)`; };
    // (where star n rests: along the top of the rim, either side of the word in the middle, outwards, alternating right and left)
    const rimAt = (n: number, cx: number, cy: number, R: number, t: number): [number, number] => {
      const side = n % 2 ? -1 : 1, k = Math.floor(n / 2), a = side * (0.2 + k * 0.09) + Math.sin(t * 0.00021 + n * 1.7) * 0.004;
      return [cx + Math.sin(a) * R * 1.035, cy - Math.cos(a) * R * 1.035];
    };
    // (the flight follows the app's own SURFACE spring, sampled: the same curve a card arrives with)
    const FL = springSamples(SURFACE), FLY = Math.max(600, FL.duration);
    const ease = (x: number) => { const i = x * (FL.xs.length - 1), k = Math.floor(i); return k >= FL.xs.length - 1 ? 1 : FL.xs[k] + (FL.xs[k + 1] - FL.xs[k]) * (i - k); };
    let voiceFor = 0, stage: HTMLElement | null = null;
    const tick = () => {
      if (stopped || (!worker && !eng)) return; // (it couldn't draw: nothing more to do)
      raf = requestAnimationFrame(tick);
      const L = live.current, el = orbEl.current; if (!L || !el) return;
      // (only while there is dust to draw: before it starts and once it has gone, no frames)
      if (!L.on && gone) { if (starEls.size) { starEls.forEach((e) => e.el.remove()); starEls.clear(); } return; } // (the dust has gone: so have its stars)
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
      // the horizon: while it answers it sinks and grows below the bottom edge, its top kept below the words (a long answer
      // pushes it lower, down to a glowing strip), and leans a little with your finger
      const t = performance.now(), dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
      hz += ((L.horizon ? 1 : 0) - hz) * (1 - Math.exp(-dt * 2.4));
      const hzE = hz * hz * (3 - 2 * hz);
      const vw = canvas.clientWidth || window.innerWidth, vh = canvas.clientHeight || window.innerHeight;
      const RH = Math.min(vw * 0.64, 360);
      // (its top eases to its place below the words: a streaming answer never steps it down a line at a time)
      const top = hz > 0.001 || L.horizon ? Math.min(vh - 66, Math.max(vh - RH * 0.46, L.textBottom() + 30)) : vh - RH * 0.46;
      topS = topS < 0 || hz < 0.001 ? top : topS + (top - topS) * (1 - Math.exp(-dt * 3));
      const hx = vw / 2 + mx * 0.35, hy = topS + RH + my * 0.25;
      if (!L.horizon && hz < 0.02) froze = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: (r.width / 2) * 0.66 };
      const sx = L.horizon ? froze.x : r.left + r.width / 2 + (flying ? 0 : mx), sy = L.horizon ? froze.y : r.top + r.height / 2 + (flying ? 0 : my), sr = L.horizon ? froze.r : (r.width / 2) * 0.66;
      const lv = L.levels();
      if (lv) for (let i = 0; i < 16; i++) { bands[i] = lv.bands[i] ?? 0; obands[i] = lv.obands?.[i] ?? 0; }
      // (your voice for a moment, not a click or a breath, takes the greeting back into the orb)
      if (L.greet) { sendText(); voiceFor = (lv?.in ?? 0) > 0.16 ? voiceFor + 1 : 0; if (voiceFor > 12) L.onVoice(); }
      const st: DustState = {
        at: performance.timeOrigin + performance.now(),
        w: vw, h: vh, dpr: Math.min(2.5, window.devicePixelRatio || 1),
        // (the sphere fills two thirds of the orb's place, as the usual orb does)
        cx: sx * (1 - hzE) + hx * hzE, cy: sy * (1 - hzE) + hy * hzE, r: sr * (1 - hzE) + RH * hzE, hz: hzE,
        kind: L.greet ? 0 : 1, writeN: L.shape.n, writeJump: L.jump, shift: L.greet ? [0, 0] : L.shift(),
        on: L.on ? 1 : 0, listen: L.listen, think: L.think, speak: L.speak, quiet: L.quiet,
        vin: lv?.in ?? 0, bands, vout: lv?.out ?? 0, obands, mood: L.mood,
        hold: L.hold, press: L.press, tap: L.tap, lean: L.lean, beat: L.beat, greet: L.greet || L.shaping,
        reduced: reducedQ.matches || document.documentElement.dataset.motion === 'reduce', colors,
      };
      // (a card to write: its points go to the drawing once)
      if (L.shape.n !== shapeN) { shapeN = L.shape.n; sentText = ''; const pts = L.shape.pts; if (pts?.length) { const a = pts.slice(); if (worker) post({ text: a, use: 6000 }, [a.buffer]); else eng?.setText(a, 6000); } }
      paintAir();
      const ao = Math.round(hzE * (0.6 + 0.4 * Math.min(1, (lv?.out ?? 0) * 1.6 + (lv?.in ?? 0) * 0.8)) * (colors.dark ? 1 : 0.55) * 100) / 100;
      if (ao > 0) air.style.transform = `translate(${(st.cx - 200).toFixed(1)}px, ${(st.cy - 200).toFixed(1)}px) scale(${((st.r * 2.36) / 400).toFixed(4)})`;
      if (ao !== airO) { airO = ao; air.style.opacity = String(ao); }
      // the stars: a spark flies from its card along a gentle arc and settles on the rim (0.9 s), then rests there, breathing
      // a little; they show only with the horizon, and Undo fades one out
      const list = L.stars();
      if (list.length || starEls.size) {
        let n = 0;
        for (const s0 of list) {
          let e = starEls.get(s0.id);
          if (!e && s0.gone) continue; // (taken away and already faded)
          if (!e) { const el = document.createElement('div'); el.style.cssText = starCss; paintStar(el); holder.insertBefore(el, canvas); e = { el, slot: -1, o: -1, landed: false, tw: Math.random() * 6, tf: '' }; starEls.set(s0.id, e); }
          if (!s0.gone) e.slot = n++;
          const [rx, ry] = rimAt(Math.max(0, e.slot), st.cx, st.cy, st.r, t);
          const fly = s0.from && !st.reduced ? Math.min(1, Math.max(0, (t - s0.at) / FLY)) : 1;
          if (fly >= 1 && !e.landed && !s0.gone) { e.landed = true; if (t - s0.at < 4000 && hzE > 0.3) L.onStar(); } // (felt only when it can be seen)
          const f = ease(fly), [fx, fy] = s0.from ?? [rx, ry];
          // (the arc: it rises a little first, then falls onto the rim)
          const x = fx + (rx - fx) * f, y = fy + (ry - fy) * f - Math.sin(Math.PI * f) * 46;
          const pulse = e.landed && !st.reduced ? 1 + 0.6 * (1 - ease(Math.min(1, Math.max(0, (t - s0.at - FLY) / 500)))) : e.landed ? 1 : 0.7 + 0.5 * f;
          // (resting, it breathes a little, in steps of a few percent: no new opacity every frame; still under Reduce motion)
          const breathe = e.landed && !st.reduced ? Math.round((0.82 + 0.18 * Math.sin(t * 0.0016 + e.tw)) * 25) / 25 : 1;
          const o = Math.round((s0.gone ? 0 : (fly > 0 ? 1 : 0)) * breathe * (s0.from ? Math.max(hzE, 1 - f) : hzE) * 100) / 100;
          const oS = e.o < 0 ? 0 : e.o + (o - e.o) * (s0.gone ? 0.08 : 1);
          const tf = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${pulse.toFixed(3)})`;
          if (e.o > 0.005 || oS > 0.005) { if (tf !== e.tf) { e.tf = tf; e.el.style.transform = tf; } } // (only when seen and moved)
          if (Math.abs(oS - e.o) > 0.005) { e.o = oS; e.el.style.opacity = oS.toFixed(3); }
          if (s0.gone && oS < 0.01) { e.el.remove(); starEls.delete(s0.id); }
        }
      }
      if (worker) post({ state: st }); else eng?.frame(performance.now(), st);
    };
    raf = requestAnimationFrame(tick);
    // (off screen the page's frames stop; the worker draws only while the dust moves and stops once it has gone)
    return () => { stopped = true; cancelAnimationFrame(raf); mo.disconnect(); worker?.terminate(); worker = null; eng = null; canvas.remove(); air.remove(); starEls.forEach((e) => e.el.remove()); probes.forEach((d) => d.remove()); };
  }, [greet]); // eslint-disable-line
  return <div ref={box} aria-hidden className={className} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />;
}
