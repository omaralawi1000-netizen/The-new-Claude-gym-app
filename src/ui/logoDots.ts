/**
 * The launch logo's dots (scripts/orb-svg.mjs, the Android icon and launch screen), for the orb to start from: in unit
 * coordinates of the orb's radius, each with its radius and colour. Same rings, light and colours as the SVG, dot for dot
 * (tests/logoDots.test.ts keeps them equal), so the live orb drawn as these is the logo.
 */
export interface LogoDot { x: number; y: number; r: number; rgb: [number, number, number] }

const SHADOW = [140, 52, 22], EMBER = [236, 116, 59], LIGHT = [255, 178, 128];
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as [number, number, number];
function colour(lam: number) {
  const t = 0.2 + 0.8 * lam;
  return t < 0.6 ? mix(SHADOW, EMBER, t / 0.6) : mix(EMBER, LIGHT, (t - 0.6) / 0.4);
}

export const LOGO: LogoDot[] = (() => {
  const K = 5, E = 0.87;
  const v = [-0.45, -0.6, 0.66], m = Math.hypot(v[0], v[1], v[2]), L = v.map((x) => x / m);
  const out: LogoDot[] = [];
  for (let k = 0; k <= K; k++) {
    const r = k / K, n = k ? Math.round(2 * Math.PI * k) : 1;
    for (let j = 0; j < n; j++) {
      const ph = ((j + 0.5 * (k % 2)) / n) * 2 * Math.PI - Math.PI / 2;
      const x = Math.cos(ph) * r, y = Math.sin(ph) * r, z = Math.sqrt(1 - (r * E) ** 2);
      const lam = Math.max(0, x * E * L[0] + y * E * L[1] + z * L[2]);
      out.push({ x, y, r: 0.08 * (0.45 + 0.55 * z), rgb: colour(lam) });
    }
  }
  return out;
})();
