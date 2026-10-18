import { mic } from '../lib/mic';

/**
 * The "voice thread" under the Add food field (Omar picked it, 14 Oct): a thread of light on the field's bottom edge.
 *  listen: grows from the middle with the real voice (length eases slowly, brightness quickly; a white core follows the high band)
 *  stop:   shrinks to a short thread that glides back and forth while Whisper transcribes
 *  reveal: the glide settles (keeps its speed, damped), the thread opens across as the words land, then fades
 * Two layers that exist from load and only ever change transform and opacity, so nothing is added or dropped.
 * The same maths as the in-Claude mock (food-voice/options/round5-whisper-final/mock4.html), which passed the judge.
 */
const c01 = (x: number) => Math.max(0, Math.min(1, x));
const eo = (x: number) => 1 - Math.pow(1 - c01(x), 3);
const eio = (x: number) => { x = c01(x); return x * x * (3 - 2 * x); };

type Phase = 'off' | 'listen' | 'proc' | 'rev';

export function voiceThread(getA: () => HTMLElement | null, getCore: () => HTMLElement | null) {
  let phase: Phase = 'off';
  let raf = 0, t0 = 0, tS = 0, tR = 0, last = 0;
  let v = 0, vs = 0, h = 0, x = 0, vx = 0, x0 = 0, v0 = 0, open = true;
  const reduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SP = 0.2; // the short thread while it thinks

  const paint = (sc: number, o: number, cs: number, co: number, tx: number) => {
    const a = getA(), core = getCore(); if (!a || !core) return;
    a.style.transform = `translateX(${tx.toFixed(2)}px) scaleX(${Math.max(0.001, sc).toFixed(4)})`; a.style.opacity = Math.max(0, o).toFixed(3);
    core.style.transform = `translateX(${tx.toFixed(2)}px) scaleX(${Math.max(0.001, cs).toFixed(4)})`; core.style.opacity = Math.max(0, co).toFixed(3);
  };
  const off = () => { phase = 'off'; paint(0.06, 0, 0.06, 0, 0); };

  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, now - last) / 1000); last = now;
    const t = (now - t0) / 1000;
    const live = phase === 'listen';
    const rv = live ? mic.voice() : 0;
    const b = live ? mic.bands() : null;
    const rh = b ? Math.min(1, (b[11] + b[13]) * 1.4) : 0;
    v += (rv - v) * (1 - Math.exp(-dt / (rv > v ? 0.04 : 0.16)));
    vs += (rv - vs) * (1 - Math.exp(-dt / (rv > vs ? 0.09 : 0.22)));
    h += (rh - h) * (1 - Math.exp(-dt / (rh > h ? 0.09 : 0.22)));
    const tt = phase === 'listen' ? t : tS;
    const k = eo(tt / 0.55);
    const idle = 0.05 + 0.03 * Math.sin((2 * Math.PI * t) / 2.4);
    const eB = Math.max(idle, Math.min(1, v * 1.4)), eL = Math.max(idle, Math.min(1, vs * 1.4));
    let sc = (0.06 + 0.94 * Math.pow(eL, 0.8)) * (0.25 + 0.75 * k), o = k * (0.55 + 0.45 * eB);
    let cs = sc * (0.12 + 0.7 * h), co = k * (0.3 + 0.7 * h), tx = 0;
    const amp = (getA()?.parentElement?.clientWidth ?? 316) * 0.4;
    if (phase !== 'listen') {
      const ts = t - tS;
      const r = eio(ts / 0.5), q = c01((ts - 0.5) / 0.4);
      const ph = (2 * Math.PI * (ts - 0.5)) / 1.9;
      const nx = reduce() ? 0 : Math.sin(ph) * amp * q;
      if (phase === 'proc') { vx = dt > 0 ? (nx - x) / dt : 0; x = nx; }
      const cs0 = cs;
      sc = sc * (1 - r) + SP * r; o = 0.95 * r + o * (1 - r); cs = cs0 * (1 - r) + sc * 0.55 * r; co = 0.95 * r + co * (1 - r);
      tx = x;
      if (phase === 'rev') {
        const tau = (now - tR) / 1000, u = c01(tau / 0.75);
        tx = (x0 + (v0 + 10 * x0) * tau) * Math.exp(-10 * tau);  // damped settle that keeps the glide's own speed (no reversal)
        if (open) { sc = SP + (1 - SP) * eo(u); cs = sc * (0.55 - 0.35 * u); o = 0.95 * (1 - eio((tau - 0.4) / 0.6)); }
        else { sc = SP; cs = SP * 0.55; o = 0.95 * (1 - eio(tau / 0.5)); } // nothing came back: it just settles and fades
        co = o;
        if (tau >= (open ? 1.05 : 0.55)) { off(); return; }
      }
    }
    paint(sc, o, cs, co, tx);
    raf = requestAnimationFrame(frame);
  };
  const run = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  return {
    start() { phase = 'listen'; t0 = performance.now(); v = vs = h = x = vx = 0; run(); },
    /** recording stopped, transcribing: the short thread glides */
    stop() { if (phase !== 'listen') return; phase = 'proc'; tS = (performance.now() - t0) / 1000; run(); },
    /** the words are in: settle the glide and open across */
    reveal() {
      if (phase === 'off') return;
      if (phase === 'listen') { this.stop(); }
      open = true; x0 = x; v0 = vx; tR = performance.now(); phase = 'rev'; run();
    },
    /** nothing came back: retract and fade without the opening */
    cancel() { if (phase === 'off') return; if (phase === 'listen') this.stop(); open = false; x0 = x; v0 = vx; tR = performance.now(); phase = 'rev'; run(); },
    destroy() { if (raf) cancelAnimationFrame(raf); raf = 0; off(); },
  };
}
