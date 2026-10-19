import { describe, expect, it } from 'vitest';
import type { GlowJob } from '../src/ui/glow';

// (node has no ImageData)
class FakeImageData { data: Uint8ClampedArray; constructor(public width: number, public height: number) { this.data = new Uint8ClampedArray(width * height * 4); } }
(globalThis as unknown as { ImageData: unknown }).ImageData ??= FakeImageData;
const { render } = await import('../src/ui/glowPaint');

/** a field like Classic's: three soft lights over a dark page, with the grain */
function field(base: [number, number, number]): GlowJob {
  let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const tile = new Uint8Array(192 * 192).map(() => (r() * r() * 255) | 0);
  const light = (x: number, y: number, rad: number, c: [number, number, number], a: number) =>
    ({ k: 'r' as const, g: [x, y, rad, rad] as [number, number, number, number], stops: [{ c: [...c, a] as [number, number, number, number], p: 0 }, { c: [...c, 0] as [number, number, number, number], p: 1 }] });
  return { w: 360, h: 640, base, amp: 2, grain: { g: 0.035, y0: 0, s: 1.875, tile, n: 192 },
    srcs: [{ op: 0.55, m: [1, 0, 0, 1, 0, 0], w: 0, h: 0, clip: false, bg: null, layers: [light(80, 500, 300, [255, 160, 61], 0.8), light(300, 200, 240, [196, 32, 110], 1), light(60, 20, 280, [255, 90, 54], 1)] }] };
}
/** the largest difference of 8 × 8 block means between two pictures, in levels */
function blockDiff(a: Uint8ClampedArray, b: Uint8ClampedArray, w: number, h: number) {
  let worst = 0;
  for (let by = 0; by + 8 <= h; by += 8) for (let bx = 0; bx + 8 <= w; bx += 8) for (let c = 0; c < 3; c++) {
    let d = 0;
    for (let y = by; y < by + 8; y++) for (let x = bx; x < bx + 8; x++) { const i = (y * w + x) * 4 + c; d += a[i] - b[i]; }
    worst = Math.max(worst, Math.abs(d / 64));
  }
  return worst;
}

describe('glow pictures', () => {
  it('two paintings of a picture differ only in their noise (≤ 0.5 level per 8 × 8 block)', () => {
    const job = field([5, 6, 11]);
    const a = render(job, [], 1), b = render(job, [], 2);
    expect(blockDiff(a.data, b.data, job.w, job.h)).toBeLessThanOrEqual(0.5);
  });
  it('keeps the exact mean (the rounding is unbiased)', () => {
    const job = field([233, 236, 244]), sim = { ...job, amp: 0, grain: undefined };
    const a = render({ ...job, grain: undefined }, [], 3);
    // the same picture with nothing rounded at random: the means agree to a few hundredths of a level
    const b = render(sim, [], 3);
    let da = 0, db = 0;
    for (let i = 0; i < a.data.length; i += 4) { da += a.data[i + 1]; db += b.data[i + 1]; }
    expect(Math.abs(da - db) / (a.data.length / 4)).toBeLessThan(0.05);
  });
  it('a source clipped to the field reaches its right and bottom edges (no seam towards the base colour)', () => {
    const W = 192, H = 416, w = 360, h = 780, k = W / w;
    const job: GlowJob = { w, h, base: [11, 12, 20], amp: 0, srcs: [{ op: 1, m: [k, 0, 0, k, 0, 0], w: W, h: H, clip: true, bg: null,
      layers: [{ k: 'r', g: [W / 2, H / 2, W * 2, W * 2], stops: [{ c: [120, 60, 200, 1], p: 0 }, { c: [120, 60, 200, 1], p: 1 }] }] }] };
    const d = render(job, [], 6).data;
    const at = (x: number, y: number) => d[(y * w + x) * 4];
    for (const y of [10, 400, h - 1]) expect(Math.abs(at(w - 1, y) - at(w - 20, y))).toBeLessThanOrEqual(1);
    for (const x of [10, 180, w - 1]) expect(Math.abs(at(x, h - 1) - at(x, h - 20))).toBeLessThanOrEqual(1);
  });
  it('adds no noise where the picture is one flat level', () => {
    const flat: GlowJob = { w: 64, h: 64, base: [233, 236, 244], amp: 2, srcs: [] };
    const d = render(flat, [], 4).data;
    for (let i = 0; i < d.length; i += 4) expect([d[i], d[i + 1], d[i + 2]]).toEqual([233, 236, 244]);
  });
  it('one noise for all three colours (grey, like the grain)', () => {
    const job = { ...field([5, 6, 11]), grain: undefined };
    const d = render(job, [], 5).data, e = render({ ...job, amp: 0 }, [], 5).data;
    // where red was moved up by the noise, green and blue were not moved down
    let against = 0, moved = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] - e[i], g = d[i + 1] - e[i + 1];
      if (r !== 0 && g !== 0) { moved++; if (Math.sign(r) !== Math.sign(g)) against++; }
    }
    expect(against / Math.max(1, moved)).toBeLessThan(0.05);
  });
});
