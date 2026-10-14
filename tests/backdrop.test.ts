// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sunTimes, skyAt } from '../src/ui/Backdrop';

describe('backgrounds', () => {
  it('knows when the sun sets in Aarhus', () => {
    // 30 Sept 2026: sunrise about 07:16, sunset about 18:56 (Danish summer time, UTC+2)
    const s = sunTimes(new Date(2026, 8, 30, 12));
    const hm = (t: number) => { const d = new Date(t); return d.getUTCHours() * 60 + d.getUTCMinutes() + 120; };
    expect(Math.abs(hm(s.rise) - (7 * 60 + 16))).toBeLessThan(8);
    expect(Math.abs(hm(s.set) - (18 * 60 + 56))).toBeLessThan(8);
    // midsummer: a long day (sunset after 22:00)
    const m = sunTimes(new Date(2026, 5, 21, 12));
    expect(hm(m.set)).toBeGreaterThan(22 * 60);
  });
  it('the sky is dark at night and bright at midday', () => {
    expect(skyAt(1).bright).toBe(0);
    expect(skyAt(13).bright).toBeGreaterThan(0.9);
    expect(skyAt(23.9).top).toMatch(/^rgb\(/);
  });
});
