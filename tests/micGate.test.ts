import { describe, it, expect } from 'vitest';
import { createMicGate, type GateSay } from '../src/lib/micGate';

// a steady little random (the same every run)
const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
/** one 100 ms chunk of 12 frames around a loudness (dips: a voice's gaps between sounds) */
const chunk = (level: number, wobble = 0.3, dips = false) => {
  const frames = Array.from({ length: 12 }, (_, i) => Math.max(0, level * (1 + (rnd() - 0.5) * 2 * wobble) * (dips && i % 6 === 0 ? 0.08 : 1)));
  return { frames, rms: Math.sqrt(frames.reduce((a, f) => a + f * f, 0) / frames.length) };
};
const run = (g: ReturnType<typeof createMicGate>, n: number, make: (i: number) => { level: number; wobble?: number; dips?: boolean; echo?: number; talking?: boolean }) => {
  const out: GateSay[] = [];
  for (let i = 0; i < n; i++) { const m = make(i); out.push(g.step({ ...chunk(m.level, m.wobble, m.dips), echo: m.echo ?? 0, talking: !!m.talking })); }
  return out;
};
const sent = (s: GateSay[]) => s.filter((x) => x !== 'mute').length;

describe('the microphone gate: only you', () => {
  it('a quiet room: your voice opens it within 0.2 s, holds through the gaps between words, closes after', () => {
    const g = createMicGate();
    run(g, 20, () => ({ level: 0.0015 })); // the room
    const s = run(g, 30, (i) => ({ level: i < 20 ? (i % 4 === 3 ? 0.004 : 0.05) : 0.0015, dips: true }));
    expect(s.slice(0, 2)).toContain('open');
    expect(s.slice(2, 20).every((x) => x === 'send')).toBe(true);
    expect(s.slice(29)).toEqual(['mute']);
  });

  it('a click is not you', () => {
    const g = createMicGate();
    run(g, 20, () => ({ level: 0.0015 }));
    expect(sent(run(g, 10, (i) => ({ level: i === 3 ? 0.2 : 0.0015 })))).toBe(0);
  });

  it('background music: never sent on its own, and when you stop it lets go', () => {
    const g = createMicGate();
    const music = (i: number) => 0.03 * (1 + 0.6 * Math.sin(i * 0.9)); // swells and falls, never silent
    const alone = run(g, 300, (i) => ({ level: music(i), wobble: 0.25 }));
    expect(sent(alone.slice(30))).toBe(0); // (after the first seconds it knows the room)
    const s = run(g, 40, (i) => ({ level: i < 20 ? 0.25 : music(i), dips: i < 20, wobble: 0.25 }));
    expect(s.slice(0, 3)).toContain('open');
    expect(s.slice(32).every((x) => x === 'mute')).toBe(true);
  });

  it('its own voice from a loud phone speaker (louder in the microphone than it was sent) is never sent', () => {
    const g = createMicGate();
    run(g, 20, () => ({ level: 0.0015 }));
    // 20 s of its answer: what plays 0.02–0.2, coming back 2.5× (jittery, a little late)
    const s = run(g, 200, (i) => { const out = 0.02 + 0.18 * Math.abs(Math.sin(i * 0.37)); return { level: out * 2.5 * (0.6 + 0.8 * rnd()), echo: out, talking: true, dips: true }; });
    expect(sent(s)).toBe(0);
    expect(g.coupling).toBeGreaterThan(1.5);
  });

  it('…but a voice far above it, for a moment, is you talking over it', () => {
    const g = createMicGate();
    run(g, 20, () => ({ level: 0.0015 }));
    run(g, 80, () => ({ level: 0.02 * 0.5, echo: 0.02, talking: true })); // quiet answer, low volume
    const s = run(g, 10, () => ({ level: 0.3, echo: 0.02, talking: true, dips: true }));
    expect(s.slice(0, 4)).toContain('open');
    expect(s.slice(4).every((x) => x === 'send')).toBe(true);
  });

  it('the room ringing just after it stops is still its voice', () => {
    const g = createMicGate();
    run(g, 20, () => ({ level: 0.0015 }));
    run(g, 50, () => ({ level: 0.1, echo: 0.08, talking: true }));
    // (the tail: no more playing, the room still rings, the caller still says talking)
    expect(sent(run(g, 4, (i) => ({ level: 0.1 * 0.5 ** i, echo: 0, talking: true })))).toBe(0);
  });
});
