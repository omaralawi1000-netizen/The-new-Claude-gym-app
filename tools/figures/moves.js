// The movements: each returns a pose for t in 0..1 (one rep). See rig.js for the pose shape.
import { V, rep, torsoR, LOCAL, barbell, dumbbell, cyl, box, M, camera, quatAxis } from './rig.js';
const { add, sub, mul, norm, lerp } = V;
const rad = (d) => (d * Math.PI) / 180;
// muscle bits (shader.js addHot)
export const H = { chest: 1, frontDelt: 2, sideDelt: 4, triceps: 8, biceps: 16, lats: 32, quads: 64, glutes: 128, hams: 256, calves: 512, abs: 1024, traps: 2048, forearms: 4096, rearDelt: 8192 };

const standingFeet = (T, R) => [1, -1].map((s) => ({ k: add(T, [0.022, 0.505, 0.112 * s]), a: add(T, [-0.012, 0.085, 0.118 * s]), fwd: norm([1, 0, 0.08 * s]), front: [1, 0, 0] }));

export const MOVES = {
  'barbell-curl': (t) => {
    const c = rep(t), T = [0, 0, 0], R = torsoR();
    const hands = [1, -1].map((s) => {
      const S = LOCAL.S(s);
      const E = add(S, [0.035 + 0.03 * c * c, -0.285 + 0.01 * c, 0.025 * s]);
      const a = rad(8 + 130 * c);
      const fw = norm([Math.sin(a), -Math.cos(a), -0.06 * s]);
      return { e: E, w: add(E, mul(fw, 0.257)), grip: [0, 0, 1], palm: [Math.cos(a), Math.sin(a), 0], front: [1, 0, 0] };
    });
    const bar = lerp(add(hands[0].w, mul(norm(sub(hands[0].w, hands[0].e)), 0.05)), add(hands[1].w, mul(norm(sub(hands[1].w, hands[1].e)), 0.05)), 0.5);
    bar[2] = 0;
    return { T, R, hands, feet: standingFeet(T, R), hot: H.biceps, work: c, parts: barbell(bar), cam: camera([0.05, 0.88, 0], 0.55, 0.45, 4.6) };
  },

  'bench-press': (t) => {
    const c = rep(t); // 0 = bar at the top, 1 = pressed... we lower first: the lift is the press up, so start at the chest
    const k = 1 - c;   // 1 = at the chest, 0 = locked out
    const padTop = 0.465, px = 0.3;
    const R = torsoR(0, rad(90)), T = [px + 0.95, padTop + 0.105, 0];
    const top = [-0.2, 1.06], low = [-0.06, 0.745];
    const bx = top[0] + (low[0] - top[0]) * k, by = top[1] + (low[1] - top[1]) * k;
    const grip = 0.4;
    const hands = [1, -1].map((s) => ({ w: [bx, by - 0.052, grip * s], pole: norm([0.3, -1, 0.75 * s]), grip: [0, 0, 1], palm: [1, 0.2, 0] }));
    const feet = [1, -1].map((s) => ({ a: [0.66, 0.085, 0.36 * s], pole: [0.3, 1, 0.4 * s], fwd: norm([1, 0, 0.45 * s]) }));
    const parts = [
      ...barbell([bx, by, 0]),
      box([0.15, padTop - 0.035, 0], [0.6, 0.035, 0.14], 0.03, M.pad),          // pad
      box([0.15, padTop - 0.085, 0], [0.52, 0.015, 0.05], 0.01, M.metal),       // rail under the pad
      cyl([-0.32, 0, 0], [-0.32, padTop - 0.09, 0], 0.03, M.metal),
      cyl([0.6, 0, 0], [0.6, padTop - 0.09, 0], 0.03, M.metal),
      cyl([-0.32, 0.02, -0.22], [-0.32, 0.02, 0.22], 0.025, M.metal),          // feet of the bench
      cyl([0.6, 0.02, -0.2], [0.6, 0.02, 0.2], 0.025, M.metal),
    ];
    for (const s of [1, -1]) {                                                 // rack uprights with J-hooks
      parts.push(box([-0.5, 0.62, 0.56 * s], [0.03, 0.62, 0.03], 0.006, M.metal));
      parts.push(box([-0.43, 1.0, 0.56 * s], [0.05, 0.02, 0.028], 0.008, M.metal));
      parts.push(box([-0.5, 0.02, 0.56 * s], [0.3, 0.02, 0.04], 0.008, M.metal));
    }
    return { T, R, hands, feet, hot: H.chest | H.frontDelt | H.triceps, work: c, parts, cam: camera([0.05, 0.48, 0], 0.85, 2.25, 4.15) };
  },
};
