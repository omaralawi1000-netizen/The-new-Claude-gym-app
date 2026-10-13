// Poses Aven's figure for each movement: per frame (t in 0..1 = one rep) it returns the torso placement, the joints, hand
// and foot directions, the worked muscles, the equipment as simple parts, and the camera. shader.js draws it.
export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k],
};
const { add, sub, mul, dot, cross, len, norm, lerp } = V;
const rad = (d) => (d * Math.PI) / 180;
export const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const smooth = (x) => x * x * (3 - 2 * x);
/** one rep as 0 (start) → 1 (end of the lift) → 0: the lift over 38%, a short hold, then a slower way back (the app's rep timing) */
export function rep(t) { return t < 0.38 ? ease(t / 0.38) : t < 0.5 ? 1 : 1 - ease((t - 0.5) / 0.5); }

// torso rotation from yaw (about y), pitch (about z: tips the chest up/back), roll (about x); columns = local axes in world
function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, -s], [0, 1, 0], [s, 0, c]]; }
function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [[c, s, 0], [-s, c, 0], [0, 0, 1]]; }
function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; }
export const mv = (M, v) => [M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2], M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2], M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2]];
const mm = (A, B) => [mv(A, B[0]), mv(A, B[1]), mv(A, B[2])]; // columns
export function torsoR(yaw = 0, pitch = 0, roll = 0) { return mm(rotY(yaw), mm(rotZ(pitch), rotX(roll))); }

const UA = 0.288, FA = 0.257, TH = 0.43, SH = 0.42; // upper arm, forearm (to wrist), thigh, shin
export const LOCAL = { S: (s) => [-0.005, 1.45, 0.19 * s], H: (s) => [0, 0.93, 0.098 * s] };

/** two-bone IK: root a, target b, lengths l1 l2, the middle joint bends toward `pole` */
export function ik(a, b, l1, l2, pole) {
  let d = sub(b, a); let L = len(d); const dir = norm(d);
  L = Math.min(Math.max(L, Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.9995);
  const end = add(a, mul(dir, L));
  const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
  const pp = norm(sub(pole, mul(dir, dot(pole, dir))));
  return [add(add(a, mul(dir, x)), mul(pp, h)), end];
}
const perp = (v, axis) => norm(sub(v, mul(axis, dot(v, axis))));

/**
 * Build the shader's uniforms. pose = { T, R, hands: [{ w, pole, grip, palm }]x2 (L, R), feet: [{ a, pole, fwd }]x2,
 * hot, work, parts, cam: { pos, ta, focal } }. hands[i].e / feet[i].k may be given instead of a pole (forward kinematics).
 */
export function build(pose) {
  const { T, R } = pose;
  const W = (l) => add(T, mv(R, l));
  const side = mv(R, [0, 0, 1]);
  const J = [], AF = [], AS = [], LF = [], LS = [], GR = [], PA = [], FT = [];
  pose.hands.forEach((h, i) => {
    const s = i === 0 ? 1 : -1, S = W(LOCAL.S(s));
    let E, Wr;
    if (h.e) { E = h.e; Wr = h.w; } else [E, Wr] = ik(S, h.w, UA, FA, h.pole);
    J.push(S, E, Wr);
    const up = norm(sub(E, S));
    const bend = sub(Wr, E);
    const pole = h.pole ?? mul(perp(bend, up), -1);
    AF.push(h.front ?? mul(perp(pole, up), -1));
    AS.push(mul(side, s));
    GR.push(h.grip); PA.push(h.palm);
  });
  pose.feet.forEach((f, i) => {
    const s = i === 0 ? 1 : -1, Hp = W(LOCAL.H(s));
    let K, A;
    if (f.k) { K = f.k; A = f.a; } else [K, A] = ik(Hp, f.a, TH, SH, f.pole);
    J.push(Hp, K, A);
    const up = norm(sub(K, Hp));
    LF.push(f.front ?? perp(f.pole ?? sub(K, lerp(Hp, A, 0.5)), up));
    LS.push(mul(side, s));
    FT.push(f.fwd);
  });
  // joints in the shader's order: SL EL WL SR ER WR HL KL AL HR KR AR
  const order = [J[0], J[1], J[2], J[3], J[4], J[5], J[6], J[7], J[8], J[9], J[10], J[11]];
  return { T, R, J: order, AF, AS, LF, LS, GR, PA, FT, hot: pose.hot, work: pose.work, parts: pose.parts, cam: pose.cam };
}

// ── equipment parts (type 0 = cylinder/capsule, 1 = rounded box, 2 = plate) and materials
export const M = { metal: 1, pad: 2, chrome: 3, plate: 4 };
export const cyl = (a, b, r, mat = M.metal, round = 0) => ({ A: [0, mat, 0, 0], B: [...a, r], C: [...b, round], D: [0, 0, 0, 1] });
export const box = (c, half, round = 0.01, mat = M.metal, q = [0, 0, 0, 1]) => ({ A: [1, mat, 0, 0], B: [...c, round], C: [...half, 0], D: q });
export const plate = (c, axis, r, halfT) => ({ A: [2, M.plate, 0, 0], B: [...c, r], C: [...norm(axis), halfT], D: [0, 0, 0, 1] });
export const quatAxis = (axis, ang) => { const a = norm(axis), s = Math.sin(ang / 2); return [a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)]; };

/** an Olympic barbell centred at c along `axis`, with a 20 kg and a 10 kg plate a side */
export function barbell(c, axis = [0, 0, 1], plates = [[0.225, 0.026], [0.17, 0.018]]) {
  const ax = norm(axis), P = [];
  P.push(cyl(add(c, mul(ax, -1.1)), add(c, mul(ax, 1.1)), 0.014, M.chrome));
  for (const s of [-1, 1]) {
    P.push(cyl(add(c, mul(ax, s * 0.64)), add(c, mul(ax, s * 1.08)), 0.025, M.chrome));
    P.push(cyl(add(c, mul(ax, s * 0.62)), add(c, mul(ax, s * 0.66)), 0.04, M.metal));
    let o = 0.67;
    for (const [r, h] of plates) { o += h; P.push(plate(add(c, mul(ax, s * o)), ax, r, h)); o += h + 0.004; }
  }
  return P;
}
export function dumbbell(c, axis, r = 0.075) {
  const ax = norm(axis), P = [cyl(add(c, mul(ax, -0.07)), add(c, mul(ax, 0.07)), 0.016, M.chrome)];
  for (const s of [-1, 1]) P.push(plate(add(c, mul(ax, s * 0.1)), ax, r, 0.03));
  return P;
}

/** the camera: from a direction (yaw round the figure, height) at a distance, looking at `ta` */
export function camera(ta, yaw, height, dist, focal = 2.25) {
  return { pos: add(ta, [Math.cos(yaw) * dist, height, Math.sin(yaw) * dist]), ta, focal };
}
export function lights(cam) {
  const f = norm(sub(cam.ta, cam.pos)), r = norm(cross(f, [0, 1, 0])), toCam = mul(f, -1);
  return { key: norm(add(add([0, 1.1, 0], mul(r, 0.65)), mul(toCam, 0.4))), fill: norm(add(add(mul(r, -0.9), [0, 0.15, 0]), mul(toCam, 0.6))), rim: norm(add(add(mul(r, -0.25), [0, 0.3, 0]), mul(toCam, -0.9))) };
}

/** a sphere round one part (for the shader to skip parts that are far away) */
export function sphereOf(p) {
  const t = p.A[0], B = p.B, C = p.C;
  if (t === 0) { const a = B.slice(0, 3), b = C.slice(0, 3); return [...lerp(a, b, 0.5), len(sub(b, a)) / 2 + B[3] + C[3] + 0.01]; }
  if (t === 1) return [B[0], B[1], B[2], Math.hypot(C[0], C[1], C[2]) + 0.01];
  return [B[0], B[1], B[2], Math.hypot(B[3], C[3]) + 0.02];
}

/** points that must stay in frame for one pose: the joints, the head, and the equipment (parts marked nofit may be cut) */
export function framePoints(u) {
  const pts = [...u.J];
  const W = (l) => add(u.T, mv(u.R, l));
  pts.push(W([0.01, 1.75, 0]), W([0.1, 1.62, 0]), W([-0.12, 1.3, 0]), W([0.12, 1.3, 0]), W([0, 1.3, 0.2]), W([0, 1.3, -0.2]), W([-0.1, 0.9, 0]));
  for (const f of [8, 11]) pts.push(add(u.J[f], [0, -0.08, 0]), add(u.J[f], mul(u.FT[f === 8 ? 0 : 1], 0.2)));
  for (const p of u.parts) {
    if (p.nofit) continue;
    const s = sphereOf(p);
    if (p.A[0] === 0) { const a = p.B.slice(0, 3), b = p.C.slice(0, 3), r = p.B[3]; for (const q of [a, b]) for (const d of [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]]) pts.push(add(q, d)); }
    else { for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) pts.push(add(s.slice(0, 3), mul(d, s[3] * (p.A[0] === 1 ? 0.8 : 1)))); }
  }
  return pts;
}
/** move the camera along its own direction (and re-aim it) so every point of the whole rep fits the frame with a margin */
export function fitCamera(cam, pts, aspect = 1.5, margin = 0.1) {
  const dir = norm(sub(cam.pos, cam.ta)), f = cam.focal;
  const u = norm(cross(mul(dir, -1), [0, 1, 0])), v = cross(u, mul(dir, -1));
  const hx = (aspect / 2) * (1 - margin), hy = 0.5 * (1 - margin);
  let ta = pts.reduce((a, p) => add(a, mul(p, 1 / pts.length)), [0, 0, 0]), dist = 3;
  for (let it = 0; it < 6; it++) {
    dist = 0;
    for (const p of pts) { const q = sub(p, ta), z = dot(q, dir); dist = Math.max(dist, z + (f * Math.abs(dot(q, u))) / hx, z + (f * Math.abs(dot(q, v))) / hy); }
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) { const q = sub(p, ta), dep = dist - dot(q, dir), sx = (f * dot(q, u)) / dep, sy = (f * dot(q, v)) / dep; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
    ta = add(ta, add(mul(u, ((x0 + x1) / 2) * dist / f), mul(v, ((y0 + y1) / 2) * dist / f)));
  }
  return { pos: add(ta, mul(dir, dist)), ta, focal: f };
}
