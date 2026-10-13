// Batch 1: chest and pressing. Each exercise returns a pose for t in 0..1 (one rep: the lift, a beat, the slower way back).
import { V, rep, torsoR, mv, camera, M, cyl, box, quatAxis } from './rig.js';
import { barbell, dumbbell, bench, rack, smith, kettlebell, dipBars, cableTower, handle, padAlong, qz } from './gear.js';
import { H } from './moves.js';
const { add, sub, mul, norm, lerp, cross, len } = V;
const rad = (d) => (d * Math.PI) / 180;
const cl = (x) => Math.min(Math.max(x, 0), 1);
const sm = (x) => { x = cl(x); return x * x * (3 - 2 * x); };
const place = (R, local, world) => sub(world, mv(R, local));
const frame = (T, R) => ({ P: (l) => add(T, mv(R, l)), D: (d) => mv(R, d) });
const S2 = [1, -1];                       // left (+z), right (-z)
const PRESS = H.chest | H.frontDelt | H.triceps;

// ── lying presses and flies: flat, incline (+deg) or decline (-deg), on a bench or on the floor
function lying(c, o) {
  const a = o.angle ?? 0;
  const R = torsoR(0, rad(90 - a));
  const top = o.floor ? 0 : a < 0 ? 0.6 : 0.465;
  const pb = [0.32, top, 0];                                   // the back of the pelvis, on the seat
  const T = place(R, [-0.105, 0.93, 0], pb);
  const { P, D } = frame(T, R);
  const parts = [];
  if (!o.floor) parts.push(...(a === 0 ? bench({ x0: -0.45, x1: 0.75, top, flat: true }) : bench({ x0: 0.3, x1: 0.75, top, angle: a, backLen: 0.9 })));
  // where the hands go, in the torso's own frame (x: up from the chest, y: toward the head)
  const k = 1 - c;                                             // 1 = at the chest (start), 0 = arms straight
  const yLow = a > 10 ? 1.38 : a < 0 ? 1.25 : 1.31, yTop = a > 10 ? 1.47 : a < 0 ? 1.38 : 1.45;
  const hands = [];
  let hot = o.hot ?? PRESS;
  const palmBar = D([0.2, -1, 0]), along = D([1, 0, 0]);
  if (o.fly) {
    // arms open in a wide arc with soft elbows, the dumbbells meeting over the chest
    const th = rad(8 + 70 * k);
    for (const s of S2) {
      const sh = P([0.0, 1.43, 0.19 * s]);
      const hp = add(sh, D([Math.cos(th) * 0.5, -0.03, Math.sin(th) * 0.5 * s]));
      const w = add(hp, mul(norm(sub(hp, sh)), -0.05));
      hands.push({ w, pole: D([-0.4, -0.35, s]), grip: D([0, 1, 0]), palm: D([0, 0, -s]) });
      parts.push(...dumbbell(hp, D([0, 1, 0])));
    }
  } else {
    const db = o.impl === 'db';
    const g = o.grip ?? (db ? 0 : 0.4);
    const lx = (db ? 0.11 : o.floor ? 0.25 : 0.175) * k + 0.49 * (1 - k);
    const ly = yLow * k + yTop * (1 - k);
    let bar = P([lx, ly, 0]);
    if (o.impl === 'smith') { const lo = P([0.175, yLow, 0]), hi = P([0.49, yTop, 0]); bar[0] = (lo[0] + hi[0]) / 2; }
    for (const s of S2) {
      const z = db ? (0.3 * k + 0.2 * (1 - k)) * s : g * s;
      const hp = add(bar, D([0, 0, z]));
      const w = add(hp, mul(along, -0.052));
      const pole = o.tuck ? D([-1, -0.8, 0.35 * s]) : D([-1, -0.3, 0.75 * s]);
      hands.push({ w, pole, grip: D([0, 0, 1]), palm: palmBar });
      if (db) parts.push(...dumbbell(hp, D([0, 0, 1])));
    }
    if (!db) parts.push(...barbell(bar, [0, 0, 1]));
    if (o.impl === 'smith') parts.push(...smith(bar[0] - 0.08, bar[1]));
    else if (!db && !o.floor) parts.push(...rack(P([0, 1.62, 0])[0] - 0.12, P([0.49, yTop, 0])[1] - 0.02));
  }
  // legs: feet planted on the floor; on a decline, hooked under the rollers; on the floor, knees up
  const hip = P([0, 0.93, 0]);
  let feet;
  if (o.floor) feet = S2.map((s) => ({ a: [hip[0] + 0.42, 0.085, 0.2 * s], pole: [0.3, 1, 0.2 * s], fwd: norm([1, -0.2, 0.1 * s]) }));
  else if (a < 0) {
    feet = S2.map((s) => ({ a: [hip[0] + 0.56, top - 0.2, 0.11 * s], pole: [0.2, 1, 0.1 * s], fwd: norm([0.6, -0.8, 0]) }));
    const ax = hip[0] + 0.58, ay = top - 0.2;
    parts.push(cyl([ax + 0.02, ay + 0.085, -0.2], [ax + 0.02, ay + 0.085, 0.2], 0.045, M.pad, 0.0));
    parts.push(cyl([ax + 0.02, 0, 0], [ax + 0.02, ay + 0.085, 0], 0.028, M.metal));
  } else feet = S2.map((s) => ({ a: [hip[0] + (a > 0 ? 0.4 : 0.34), 0.085, 0.36 * s], pole: [0.3, 1, 0.4 * s], fwd: norm([1, 0, 0.45 * s]) }));
  const cam = o.floor ? camera([0.0, 0.25, 0], 0.85, 1.9, 3.6) : camera([0.05, 0.5, 0], 0.85, 2.25, 4.15);
  if (o.impl === 'smith') { cam.pos[1] += 0.3; cam.ta[1] += 0.25; }
  return { T, R, hands, feet, hot, work: c, parts, cam };
}

const LS = (s) => [-0.005, 1.45, 0.19 * s];               // the shoulder joints, torso frame
const standFeet = (T, R, sp = 0.118) => S2.map((s) => ({ a: add(T, [-0.012, 0.085, sp * s]), pole: add([1, 0.05, 0.1 * s], [0, 0, 0]), fwd: norm([1, 0, 0.08 * s]), front: [1, 0, 0] }));
/** seated with the hips at (hx, hy): thighs forward, shins down, feet flat */
function seatedFeet(hip, spread = 0.16, reach = 0.43) {
  return S2.map((s) => { const h = [hip[0], hip[1], 0.098 * s]; const k = [hip[0] + reach, hip[1] - 0.02, spread * s]; const a = [k[0] + 0.06, k[1] - 0.415, spread * s * 1.05];
    return { k, a, fwd: norm([1, 0, 0.12 * s]), front: [1, 0, 0] }; });
}
function weightStack(x, z = 0, h = 1.6) {
  return [box([x, h / 2 + 0.02, z], [0.12, h / 2, 0.16], 0.02, M.metal), box([x, 0.02, z], [0.25, 0.02, 0.3], 0.01, M.metal)];
}
const seatParts = (x, top, backX, backTop = 1.25, recline = 0) => {
  const P = [padAlong([x + 0.12, top - 0.035, 0], 0, 0.22, 0.16)];
  P.push(cyl([x + 0.1, 0, 0], [x + 0.1, top - 0.07, 0], 0.035, M.metal));
  P.push(box([x + 0.1, 0.02, 0], [0.3, 0.02, 0.2], 0.01, M.metal));
  const bh = (backTop - top) / 2;
  const q = quatAxis([0, 0, 1], rad(recline));
  P.push(box([backX - 0.035 - Math.sin(rad(recline)) * bh, top + 0.04 + bh * Math.cos(rad(recline)), 0], [0.035, bh, 0.15], 0.03, M.pad, q));
  P.push(cyl([backX - 0.12, 0, 0], [backX - 0.12, backTop, 0], 0.03, M.metal));
  return P;
};

// ── seated machine chest press (flat or incline): handles from beside the chest pushed forward
function machinePress(c, o) {
  const rec = 12, R = torsoR(0, rad(rec)), hip = [0, 0.55, 0];
  const T = place(R, [0, 0.93, 0], hip); const { P, D } = frame(T, R);
  const lo = o.incline ? [0.12, 1.4] : [0.1, 1.33], hi = o.incline ? [0.52, 1.66] : [0.6, 1.31];
  const hands = [], parts = [...seatParts(-0.05, 0.43, P([-0.11, 1.0, 0])[0], 1.3, rec), ...weightStack(-0.75)];
  for (const s of S2) {
    const z = (0.25 - 0.03 * c) * s;
    const hp = P([lo[0] + (hi[0] - lo[0]) * c, lo[1] + (hi[1] - lo[1]) * c, z]);
    hands.push({ w: add(hp, D([-0.05, 0, 0])), pole: D([-0.6, -1, 0.45 * s]), grip: [0, 1, 0], palm: [0.2, 0, -s] });
    parts.push(cyl(add(hp, [0, -0.07, 0]), add(hp, [0, 0.07, 0]), 0.016, M.pad));
    const piv = [-0.35, o.incline ? 1.15 : 1.85, 0.42 * s];
    parts.push(cyl(add(hp, [0, o.incline ? -0.07 : 0.07, 0.0]), add(piv, [0, 0, 0]), 0.022, M.metal));
    parts.push(cyl(piv, [-0.35, 0, 0.42 * s], 0.03, M.metal));
  }
  return { T, R, hands, feet: seatedFeet(hip), hot: o.hot ?? PRESS, work: c, parts, cam: camera([0.05, 0.95, 0], 0.62, 0.45, 4.3) };
}

// ── fly arcs (cable fly, pec deck): arms sweep from wide to together in front, soft elbows
function arc(S, phi, yv, s, r = 0.56) { const d = norm([Math.cos(phi), yv, Math.sin(phi) * s]); return add(S, mul(d, r)); }
function cableFly(c, o) {
  const R = torsoR(0, rad(-12)), T = place(R, [0, 0.93, 0], [-0.02, 0.9, 0]); const { P } = frame(T, R);
  const phi = rad(100 - 90 * c);
  const yv = o.dir === 'up' ? -0.75 + 1.0 * c : o.dir === 'down' ? 0.6 - 1.15 * c : -0.04;
  const py = o.dir === 'up' ? 0.25 : o.dir === 'down' ? 2.1 : 1.55;
  const hands = [], parts = [];
  for (const s of S2) {
    const S = P(LS(s)), hp = arc(S, phi, yv, s), palm = [Math.sin(phi), 0, -Math.cos(phi) * s];
    hands.push({ w: sub(hp, mul(norm(sub(hp, S)), 0.05)), pole: [-0.4, -0.7, 0.6 * s], grip: [0, 1, 0], palm });
    parts.push(...handle(hp, [0, 1, 0]), ...cableTower(-0.45, 1.2 * s, py, hp));
  }
  const feet = [{ a: [0.2, 0.085, 0.12], pole: [1, 0.1, 0.1], fwd: norm([1, 0, 0.1]) }, { a: [-0.32, 0.12, -0.13], pole: [1, -0.2, 0], fwd: norm([0.7, -0.6, -0.05]) }];
  return { T, R, hands, feet, hot: H.chest | (o.dir === 'up' ? H.frontDelt : 0), work: c, parts, cam: camera([0.0, 1.05, 0], 0.42, 0.45, 4.7) };
}
function pecDeck(c, o) {
  const R = torsoR(0, rad(o.reverse ? -4 : 6)), hip = [0, 0.55, 0], T = place(R, [0, 0.93, 0], hip); const { P } = frame(T, R);
  const phi = o.reverse ? rad(14 + 82 * c) : rad(96 - 84 * c);
  const hands = [], parts = [padAlong([0.07, 0.43 - 0.035, 0], 0, 0.22, 0.16), cyl([0.05, 0, 0], [0.05, 0.36, 0], 0.035, M.metal), box([0.05, 0.02, 0], [0.4, 0.02, 0.22], 0.01, M.metal)];
  if (o.reverse) parts.push(box([0.27, 1.22, 0], [0.035, 0.2, 0.13], 0.03, M.pad), cyl([0.36, 0, 0], [0.36, 1.2, 0], 0.03, M.metal));
  else parts.push(box([-0.19, 1.15, 0], [0.035, 0.38, 0.15], 0.03, M.pad), cyl([-0.28, 0, 0], [-0.28, 1.9, 0], 0.035, M.metal), ...weightStack(-0.7));
  for (const s of S2) {
    const S = P(LS(s)), hp = arc(S, phi, -0.05, s, 0.58), palm = o.reverse ? [-Math.sin(phi), 0, Math.cos(phi) * s] : [Math.sin(phi), 0, -Math.cos(phi) * s];
    hands.push({ w: sub(hp, mul(norm(sub(hp, S)), 0.05)), pole: [-0.2, -1, 0.35 * s], grip: [0, 1, 0], palm });
    const top = add(hp, [0, 0.16, 0]), piv = [S[0], 1.78, 0.2 * s];
    parts.push(cyl(add(hp, [0, -0.09, 0]), top, 0.017, M.pad), cyl(top, add(piv, [0, 0.0, 0]), 0.022, M.metal));
  }
  parts.push(box([-0.28 + (o.reverse ? 0.64 : 0), 1.84, 0], [0.06, 0.04, 0.3], 0.01, M.metal));
  const cam = o.reverse ? camera([0.0, 1.0, 0], 2.55, 0.55, 4.3) : camera([0.05, 1.0, 0], 0.55, 0.45, 4.3);
  return { T, R, hands, feet: seatedFeet(hip), hot: o.reverse ? H.rearDelt | H.traps : H.chest, work: c, parts, cam };
}

// ── push-ups: a straight body pivoting on the toes (or a pike from the hips)
function pushUp(c, o) {
  const k = 1 - c, hands = [], parts = [];
  let T, R, feet, hy = o.handY ?? 0;
  if (o.pike) {
    const phi = rad(30 + 30 * k), hip = [-0.5, 0.84, 0];
    R = torsoR(0, -rad(90) - phi); T = place(R, [0, 0.93, 0], hip);
    const ank = add(hip, [-0.85 * Math.cos(rad(60)), -0.85 * Math.sin(rad(60)) + 0.02, 0]);
    feet = S2.map((s) => ({ a: [ank[0], 0.1, 0.12 * s], pole: [0.2, -1, 0], fwd: norm([0.2, -1, 0]) }));
    const hx = hip[0] + 0.52 * Math.cos(rad(30)) + 0.05;
    for (const s of S2) hands.push({ w: [hx, 0.065, 0.27 * s], pole: [-0.3, 0.4, 0.8 * s], grip: [0, 0, 1], palm: [0, -1, 0] });
  } else {
    const fy = o.feetY ?? 0, A = [-0.85, fy + 0.1, 0], L = 1.37;
    const shY = (y) => Math.asin(Math.min((y - A[1]) / L, 0.99));
    const thTop = shY(hy + 0.6), th = shY(hy + 0.6 * c + 0.22 * k);
    R = torsoR(0, -(Math.PI / 2 - th));
    const hip = add(A, [0.85 * Math.cos(th), 0.85 * Math.sin(th), 0]); T = place(R, [0, 0.93, 0], hip);
    const sx = A[0] + L * Math.cos(thTop);
    const hz = o.diamond ? 0.07 : 0.3, hxo = o.diamond ? -0.12 : 0.02;
    for (const s of S2) hands.push({ w: [sx + hxo, hy + 0.065, hz * s], pole: o.diamond ? [-1, 0.3, 0.3 * s] : [-0.6, 0.4, 0.7 * s], grip: [0, 0, 1], palm: [0, -1, 0] });
    feet = S2.map((s) => ({ a: [A[0], A[1], 0.1 * s], pole: [0, -1, 0], fwd: norm([-0.2, -1, 0]) }));
    if (hy > 0) parts.push(box([sx + 0.02, hy / 2, 0], [0.2, hy / 2, 0.42], 0.02, M.pad));
    if (fy > 0) parts.push(box([A[0] - 0.02, fy / 2, 0], [0.2, fy / 2, 0.3], 0.02, M.pad));
  }
  const hot = o.pike ? H.frontDelt | H.sideDelt | H.triceps : o.diamond ? H.triceps | H.chest : PRESS;
  return { T, R, hands, feet, hot, work: c, parts, cam: o.pike ? camera([-0.1, 0.4, 0], 0.85, 0.75, 3.8) : camera([-0.1, 0.35, 0], 1.25, 0.35, 3.8) };
}

// ── dips
function dip(c, o) {
  const k = 1 - c, hands = [], parts = [];
  if (o.bench) {
    const R = torsoR(0, rad(4)), ex = -0.2, ey = 0.465;
    const S = [ex + 0.09, ey + 0.05 + 0.2 * k + 0.5 * c, 0], T = place(R, [-0.005, 1.45, 0], S);
    for (const s of S2) hands.push({ w: [ex, ey + 0.05, 0.21 * s], pole: [-1, 0, 0.1 * s], grip: [0, 0, 1], palm: [0.3, -1, 0] });
    parts.push(...bench({ x0: -0.33 - 0.6, x1: -0.33 + 0.6, top: ey, flat: true }));
    const feet = S2.map((s) => ({ a: [0.78, 0.085, 0.13 * s], pole: [0, 1, 0.1 * s], fwd: norm([0.5, 0.85, 0.08 * s]) }));
    return { T, R, hands, feet, hot: H.triceps | H.frontDelt, work: c, parts: rotBench(parts), cam: camera([0.25, 0.55, 0], 0.75, 0.45, 3.7) };
  }
  if (o.seated) {
    const R = torsoR(0, rad(4)), hip = [0, 0.55, 0], T = place(R, [0, 0.93, 0], hip); const { P } = frame(T, R);
    parts.push(...seatParts(-0.05, 0.43, P([-0.11, 1.0, 0])[0], 1.35, 4), ...weightStack(-0.75));
    for (const s of S2) {
      const hp = P([0.0 + 0.06 * c, 1.2 - 0.3 * c, 0.31 * s]);
      hands.push({ w: add(hp, [0, 0.05, 0]), pole: [-1, 0.1, 0.25 * s], grip: [1, 0, 0], palm: [0, -0.3, -s] });
      parts.push(cyl(add(hp, [-0.06, 0, 0]), add(hp, [0.07, 0, 0]), 0.017, M.pad), cyl(add(hp, [-0.06, 0, 0]), [-0.45, 1.25, 0.36 * s], 0.022, M.metal));
    }
    return { T, R, hands, feet: seatedFeet(hip), hot: H.triceps | H.chest, work: c, parts, cam: camera([0.05, 0.95, 0], 0.6, 0.45, 4.3) };
  }
  const by = 1.15, R = torsoR(0, rad(-18));
  const S = [-0.02 + 0.09 * k, by + 0.05 + 0.13 * k + 0.47 * c, 0], T = place(R, [-0.005, 1.45, 0], S); const { P } = frame(T, R);
  for (const s of S2) hands.push({ w: [-0.02, by + 0.05, 0.27 * s], pole: [-1, 0, 0.25 * s], grip: [1, 0, 0], palm: [0, -1, -0.3 * s] });
  parts.push(...dipBars(by - 0.022, 0.27, -0.5, 0.45));
  const hip = P([0, 0.93, 0]);
  let feet;
  if (o.assisted) {
    feet = S2.map((s) => { const kk = add(hip, [0.02, -0.43, 0.1 * s]); return { k: kk, a: add(kk, [-0.42, 0.02, 0]), fwd: norm([-0.2, -1, 0]), front: [1, 0, 0] }; });
    parts.push(box(add(hip, [-0.15, -0.5, 0]), [0.28, 0.03, 0.2], 0.03, M.pad), cyl(add(hip, [-0.45, -0.5, 0]), [-0.75, 0.3, 0], 0.025, M.metal));
    parts.push(...S2.map((s) => box([-0.75, 1.1, 0.42 * s], [0.04, 1.1, 0.04], 0.01, M.metal)), box([-0.75, 2.2, 0], [0.05, 0.04, 0.46], 0.01, M.metal), ...weightStack(-1.05));
  } else feet = S2.map((s) => ({ a: add(hip, [-0.24, -0.66, 0.05 * s]), pole: [1, -0.1, 0.05 * s], fwd: norm([0.1, -1, 0]) }));
  return { T, R, hands, feet, hot: PRESS, work: c, parts, cam: camera([0.0, 1.05, 0], 0.62, 0.4, 4.5) };
}
// the bench for bench dips runs side to side behind the body
function rotBench(P) {
  const q = quatAxis([0, 1, 0], Math.PI / 2), c0 = -0.33;
  const rz = (v) => [c0 + (v[2]), v[1], -(v[0] - c0)];
  return P.map((p) => {
    if (p.A[0] === 0) return { ...p, B: [...rz(p.B), p.B[3]], C: [...rz(p.C), p.C[3]] };
    return { ...p, B: [...rz(p.B), p.B[3]], D: q };
  });
}

// ── overhead presses: standing (bar, push press, kettlebell, landmine) and seated
function ohp(c, o) {
  const hands = [], parts = [];
  if (o.seated) {
    const R = torsoR(), hip = [0, 0.55, 0], T = place(R, [0, 0.93, 0], hip); const { P } = frame(T, R);
    parts.push(...seatParts(-0.08, 0.43, -0.13, 1.35, 0));
    if (o.impl === 'machine') parts.push(...weightStack(-0.8));
    let barY = 0;
    for (const s of S2) {
      let lo = [0.04, 1.52, 0.36], hi = [0.0, 2.06, 0.17], palm = [1, 0.2, 0], grip = [0, 0, 1], pole = [0.1, -0.6, s];
      if (o.impl === 'smith') { lo = [0.15, 1.6, 0.3]; hi = [0.15, 2.08, 0.3]; pole = [0.6, -0.6, 0.7 * s]; }
      if (o.impl === 'machine') { lo = [0.06, 1.5, 0.33]; hi = [0.06, 1.98, 0.23]; grip = [1, 0, 0]; palm = [0.2, 0.3, -s]; }
      if (o.arnold) { const f = rad(180 * sm(c * 1.15)); palm = [-Math.cos(f), 0.15, s * Math.sin(f)]; grip = [palm[2], 0, -palm[0]]; lo = [0.17, 1.48, 0.12]; pole = [Math.cos(f) * 0.9 + 0.1, -0.6, s * (0.3 + 0.7 * Math.sin(f / 2))]; }
      const e = o.arnold ? sm(c) : c;
      const hp = P([lo[0] + (hi[0] - lo[0]) * e, lo[1] + (hi[1] - lo[1]) * e, (lo[2] + (hi[2] - lo[2]) * e) * s]);
      hands.push({ w: sub(hp, [0, 0.052, 0]), pole, grip, palm });
      if (o.impl === 'db' || o.arnold) parts.push(...dumbbell(hp, grip));
      if (o.impl === 'machine') parts.push(cyl(add(hp, [-0.07, 0, 0]), add(hp, [0.07, 0, 0]), 0.017, M.pad), cyl(add(hp, [-0.07, 0, 0]), [-0.5, 0.85, 0.4 * s], 0.022, M.metal));
      barY = hp[1];
    }
    if (o.impl === 'smith') { const bx = 0.15; parts.push(...barbell([bx, barY + 0.0, 0], [0, 0, 1]), ...smith(bx + 0.09, barY, 0.6, 1.9)); }
    return { T, R, hands, feet: seatedFeet(hip), hot: H.frontDelt | H.sideDelt | H.triceps, work: c, parts, cam: camera([0.05, 1.15, 0], 0.55, 0.35, 4.7) };
  }
  // standing
  let R = torsoR(), T = [0, 0, 0], feet;
  let e = c;
  if (o.push) { const dipK = Math.sin(Math.PI * cl(c / 0.32)); T = [0, -0.075 * dipK, 0]; e = sm((c - 0.16) / 0.84); }
  if (o.landmine) { R = torsoR(0, rad(-10)); T = place(R, [0, 0.93, 0], [0, 0.9, 0]); }
  feet = o.landmine ? [{ a: [-0.3, 0.12, 0.13], pole: [1, -0.1, 0.1], fwd: norm([0.7, -0.6, 0.05]) }, { a: [0.24, 0.085, -0.13], pole: [1, 0.1, -0.1], fwd: norm([1, 0, -0.1]) }]
    : S2.map((s) => ({ a: [-0.012, 0.085, 0.118 * s], pole: [1, 0.05, 0.12 * s], fwd: norm([1, 0, 0.08 * s]) }));
  const { P } = frame(T, R);
  if (o.impl === 'bar') {
    const bar = add([0.13 + (0.0 - 0.13) * e, 1.48 + (2.08 - 1.48) * e, 0], [0, T[1], 0]);
    for (const s of S2) hands.push({ w: add(bar, [0, -0.052, 0.26 * s]), pole: [1, -0.5, 0.6 * s], grip: [0, 0, 1], palm: [1, 0.3, 0] });
    parts.push(...barbell(bar, [0, 0, 1]));
  } else {
    // one arm works (the near one, +z); the other hangs relaxed
    const s = 1;
    if (o.landmine) {
      const piv = [2.55, 0.06, 0], lo = sub([0.16, 1.38, 0.12], piv), hi = sub([0.6, 1.84, 0.04], piv), L = len(lo);
      const end = add(piv, mul(norm(lerp(lo, hi, e)), L)), ax = norm(sub(end, piv));
      hands.push({ w: sub(end, mul(norm([0.25, 1, 0]), 0.05)), pole: [0.3, -1, 0.5], grip: ax, palm: [0.5, 0.5, -0.7] });
      parts.push({ ...cyl(piv, add(end, mul(ax, -0.38)), 0.014, M.chrome), nofit: true }, cyl(add(end, mul(ax, -0.4)), add(end, mul(ax, 0.03)), 0.025, M.chrome));
      parts.push(...[[0.225, 0.026]].map(([r, h]) => ({ A: [2, M.plate, 0, 0], B: [...add(end, mul(ax, -0.3)), r], C: [...ax, h], D: [0, 0, 0, 1] })));
      parts.push({ ...box(piv, [0.12, 0.05, 0.12], 0.02, M.metal), nofit: true });
    } else {
      const hp = [0.1 + (0.0 - 0.1) * e, 1.43 + (2.06 - 1.43) * e, 0.21];
      hands.push({ w: sub(hp, [0, 0.05, 0]), pole: [0.7, -0.6, 0.6], grip: norm([0.35, 0, 1]), palm: [1, 0, -0.2] });
      parts.push(...kettlebell(hp, [0.35, 0, 1], add(hp, [-0.085, -0.04 - 0.03 * (1 - e), 0.02])));
    }
    const S = P(LS(-1));
    hands.push({ e: add(S, [0.0, -0.285, -0.035]), w: add(S, [0.03, -0.54, -0.05]), grip: [1, 0, 0], palm: [0, 0, 1], front: [1, 0, 0] });
  }
  const hot = o.landmine ? H.frontDelt | H.chest | H.triceps : H.frontDelt | H.sideDelt | H.triceps;
  return { T, R, hands, feet, hot, work: c, parts, cam: o.landmine ? camera([0.6, 0.95, 0], 0.95, 0.5, 4.6) : camera([0.05, 1.12, 0], 0.5, 0.35, 4.7) };
}

export const MOVES1 = {
  'bench-press': (t) => lying(rep(t), {}),
  'db-bench-press': (t) => lying(rep(t), { impl: 'db' }),
  'smith-bench-press': (t) => lying(rep(t), { impl: 'smith' }),
  'close-grip-bench': (t) => lying(rep(t), { grip: 0.2, tuck: true, hot: H.triceps | H.chest | H.frontDelt }),
  'smith-close-grip-bench': (t) => lying(rep(t), { impl: 'smith', grip: 0.2, tuck: true, hot: H.triceps | H.chest | H.frontDelt }),
  'db-floor-press': (t) => lying(rep(t), { impl: 'db', floor: true, hot: H.chest | H.triceps }),
  'incline-bench-press': (t) => lying(rep(t), { angle: 30 }),
  'incline-db-press': (t) => lying(rep(t), { angle: 30, impl: 'db' }),
  'smith-incline-press': (t) => lying(rep(t), { angle: 30, impl: 'smith' }),
  'decline-bench-press': (t) => lying(rep(t), { angle: -18, hot: H.chest | H.triceps }),
  'decline-db-press': (t) => lying(rep(t), { angle: -18, impl: 'db', hot: H.chest | H.triceps }),
  'smith-decline-press': (t) => lying(rep(t), { angle: -18, impl: 'smith', hot: H.chest | H.triceps }),
  'db-fly': (t) => lying(rep(t), { fly: true, hot: H.chest }),
  'incline-db-fly': (t) => lying(rep(t), { angle: 30, fly: true, hot: H.chest | H.frontDelt }),
  'machine-chest-press': (t) => machinePress(rep(t), {}),
  'incline-machine-press': (t) => machinePress(rep(t), { incline: true, hot: H.chest | H.frontDelt | H.triceps }),
  'chest-fly-cable': (t) => cableFly(rep(t), {}),
  'low-cable-fly': (t) => cableFly(rep(t), { dir: 'up' }),
  'high-cable-fly': (t) => cableFly(rep(t), { dir: 'down' }),
  'pec-deck': (t) => pecDeck(rep(t), {}),
  'reverse-pec-deck': (t) => pecDeck(rep(t), { reverse: true }),
  'push-up': (t) => pushUp(rep(t), {}),
  'incline-push-up': (t) => pushUp(rep(t), { handY: 0.45 }),
  'decline-push-up': (t) => pushUp(rep(t), { feetY: 0.45 }),
  'diamond-push-up': (t) => pushUp(rep(t), { diamond: true }),
  'pike-push-up': (t) => pushUp(rep(t), { pike: true }),
  'dip': (t) => dip(rep(t), {}),
  'assisted-dip': (t) => dip(rep(t), { assisted: true }),
  'machine-dip': (t) => dip(rep(t), { seated: true }),
  'bench-dip': (t) => dip(rep(t), { bench: true }),
  'overhead-press': (t) => ohp(rep(t), { impl: 'bar' }),
  'push-press': (t) => ohp(rep(t), { impl: 'bar', push: true }),
  'kb-press': (t) => ohp(rep(t), { impl: 'kb' }),
  'landmine-press': (t) => ohp(rep(t), { impl: 'landmine', landmine: true }),
  'db-shoulder-press': (t) => ohp(rep(t), { seated: true, impl: 'db' }),
  'arnold-press': (t) => ohp(rep(t), { seated: true, arnold: true }),
  'smith-shoulder-press': (t) => ohp(rep(t), { seated: true, impl: 'smith' }),
  'machine-shoulder-press': (t) => ohp(rep(t), { seated: true, impl: 'machine' }),
};
export const BATCH1 = Object.keys(MOVES1);
