import { describe, expect, it } from 'vitest';
import { LOGO } from '../src/ui/logoDots';
// @ts-expect-error a plain node script, no types
import { dots, colour } from '../scripts/orb-svg.mjs';

describe('the launch logo in the app', () => {
  it('is the SVG logo dot for dot', () => {
    const d = dots() as { x: number; y: number; z: number; lam: number }[];
    expect(LOGO.length).toBe(d.length);
    d.forEach((p, i) => {
      expect(LOGO[i].x).toBeCloseTo(p.x, 9);
      expect(LOGO[i].y).toBeCloseTo(p.y, 9);
      expect(LOGO[i].r).toBeCloseTo(0.08 * (0.45 + 0.55 * p.z), 9);
      expect(LOGO[i].rgb).toEqual(colour(p.lam));
    });
  });
});
