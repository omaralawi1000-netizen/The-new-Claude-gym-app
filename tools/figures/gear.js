// Equipment for the figures, built from rig.js parts (cylinders, rounded boxes, plates). World: y up, floor y = 0.
import { V, cyl, box, plate, M, quatAxis, barbell, dumbbell } from './rig.js';
const { add, sub, mul, norm, lerp, len, cross } = V;
const rad = (d) => (d * Math.PI) / 180;
export { barbell, dumbbell };
const qz = (deg) => quatAxis([0, 0, 1], rad(deg));
const qy = (deg) => quatAxis([0, 1, 0], rad(deg));

/** a pad of length 2*hl running along `dir` (in the x-y plane) from its centre, top surface facing `up` */
function padAlong(c, dirDeg, hl, hw = 0.14, ht = 0.035) { return box(c, [hl, ht, hw], 0.03, M.pad, qz(dirDeg)); }

/**
 * A bench under a lying or sitting body. seat: the flat seat pad [x0, x1] at height top. back: the back pad, from the seat's
 * head end, rising at `angle` degrees toward -x (negative: a decline, dropping toward -x), length `len`.
 */
export function bench({ x0, x1, top, angle = 0, backLen = 0, flat = false }) {
  const P = [];
  const thick = 0.035;
  if (flat) {
    P.push(padAlong([(x0 + x1) / 2, top - thick, 0], 0, (x1 - x0) / 2));
    P.push(box([(x0 + x1) / 2, top - 0.085, 0], [(x1 - x0) / 2 - 0.08, 0.015, 0.05], 0.01, M.metal));
    for (const x of [x0 + 0.13, x1 - 0.15]) {
      P.push(cyl([x, 0, 0], [x, top - 0.09, 0], 0.03, M.metal));
      P.push(cyl([x, 0.02, -0.21], [x, 0.02, 0.21], 0.025, M.metal));
    }
    return P;
  }
  // seat
  P.push(padAlong([(x0 + x1) / 2, top - thick, 0], 0, (x1 - x0) / 2));
  // back pad: from (x0, top) toward -x at the angle
  const d = [-Math.cos(rad(angle)), Math.sin(rad(angle)), 0];
  const n = [Math.sin(rad(angle)), Math.cos(rad(angle)), 0];           // the pad's top surface normal
  const bc = add(add([x0 - 0.02, top, 0], mul(d, backLen / 2 + 0.02)), mul(n, -thick));
  P.push(padAlong(bc, -angle, backLen / 2));
  // frame: a rail under the seat, a post under the seat, a strut under the back pad, floor feet
  const rail0 = [x1 - 0.12, 0.05, 0], under = add(bc, mul(n, -0.07));
  P.push(cyl([x1 - 0.12, 0, 0], [x1 - 0.12, top - 0.08, 0], 0.03, M.metal));
  P.push(cyl([x0 + 0.05, top - 0.08, 0], [x1 - 0.12, top - 0.08, 0], 0.025, M.metal));
  P.push(cyl([x0 + 0.05, 0, 0], [x0 + 0.05, top - 0.08, 0], 0.03, M.metal));
  P.push(cyl([x0 + 0.05, top - 0.08, 0], under, 0.025, M.metal));
  const foot = [Math.min(under[0], x0 - 0.2), 0, 0];
  P.push(cyl(foot, [x1 - 0.12, 0.0, 0], 0.025, M.metal));
  P.push(cyl(under, add(foot, [0, 0.02, 0]), 0.025, M.metal));
  for (const x of [foot[0] + 0.03, x1 - 0.12]) P.push(cyl([x, 0.02, -0.21], [x, 0.02, 0.21], 0.025, M.metal));
  return P;
}

/** barbell rack uprights with J-hooks at height hy, at x */
export function rack(x, hy, z = 0.56) {
  const P = [];
  for (const s of [1, -1]) {
    P.push(box([x, hy / 2 + 0.1, z * s], [0.03, hy / 2 + 0.1, 0.03], 0.006, M.metal));
    P.push(box([x + 0.07, hy, z * s], [0.05, 0.02, 0.028], 0.008, M.metal));
    P.push(box([x, 0.02, z * s], [0.3, 0.02, 0.04], 0.008, M.metal));
  }
  return P;
}

/** a Smith machine: two upright rails at x (z = ±zr), a top beam, floor rails, and carriages at the bar's height */
export function smith(x, barY, zr = 0.6, h = 2.15) {
  const P = [];
  for (const s of [1, -1]) {
    P.push(box([x, h / 2, zr * s], [0.025, h / 2, 0.025], 0.006, M.chrome));
    P.push(box([x, 0.02, zr * s], [0.45, 0.02, 0.035], 0.008, M.metal));
    P.push(box([x, barY, zr * s], [0.05, 0.07, 0.04], 0.012, M.metal));      // carriage
    P.push(box([x + 0.045, barY + 0.05, zr * s], [0.02, 0.012, 0.01], 0.004, M.metal)); // hook
  }
  P.push(box([x, h, 0], [0.04, 0.035, zr + 0.03], 0.01, M.metal));
  return P;
}

/** a kettlebell: the handle through the fist at `h` along `axis`, the bell at `b` */
export function kettlebell(h, axis, b, r = 0.085) {
  const ax = norm(axis), P = [];
  const e0 = add(h, mul(ax, -0.06)), e1 = add(h, mul(ax, 0.06));
  P.push(cyl(e0, e1, 0.014, M.metal));
  P.push(cyl(e0, add(lerp(e0, b, 0.55), mul(ax, -0.04)), 0.014, M.metal));
  P.push(cyl(e1, add(lerp(e1, b, 0.55), mul(ax, 0.04)), 0.014, M.metal));
  P.push(box(b, [r * 0.86, r * 0.86, r * 0.86], r * 0.86, M.metal));
  return P;
}

/** parallel dip bars at height y, z = ±z, running x0..x1, on posts */
export function dipBars(y, z, x0, x1) {
  const P = [];
  for (const s of [1, -1]) {
    P.push(cyl([x0, y, z * s], [x1, y, z * s], 0.022, M.chrome));
    for (const x of [x0 + 0.05, x1 - 0.05]) P.push(cyl([x, 0, z * s], [x, y, z * s], 0.03, M.metal));
    P.push(box([(x0 + x1) / 2, 0.02, z * s], [(x1 - x0) / 2, 0.02, 0.04], 0.008, M.metal));
  }
  return P;
}

/** a cable tower at (x, z) with its pulley at height py; the cable runs to `to` */
export function cableTower(x, z, py, to) {
  const P = [{ ...box([x, 1.1, z], [0.07, 1.1, 0.07], 0.01, M.metal), nofit: true }];
  const pz = z - Math.sign(z) * 0.09;
  P.push(plate([x, py, pz], norm(cross(sub(to, [x, py, pz]), [0, 1, 0])), 0.05, 0.012));
  P.push({ ...cyl([x, py, pz], to, 0.005, M.chrome), nofit: true });
  return P;
}

/** a D-handle in the fist at h along axis */
export const handle = (h, axis) => [cyl(add(h, mul(norm(axis), -0.06)), add(h, mul(norm(axis), 0.06)), 0.016, M.pad)];
export { qz, qy, padAlong };
