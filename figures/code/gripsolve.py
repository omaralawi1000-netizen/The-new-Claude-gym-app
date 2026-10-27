# A real barbell grip, solved against the hand's own skin: blender -b scene9.blend --python gripsolve.py -- grip.json
# The bar (r 13.5 mm) is laid across the base of the fingers, just clear of the palm; then each finger closes joint by joint
# (MCP, PIP, DIP) until that phalanx's skin touches the bar, and the thumb does the same round the other side.
# Output: per side, the bar centre/axis in the rest hand frame and the per-finger joint angles (radians, on top of rest).
import bpy, sys, json, os, numpy as np
sys.path.insert(0, os.getcwd())
import pose
OUT = sys.argv[sys.argv.index('--') + 1:][0]
R_BAR = 0.0135; GAP = float(os.environ.get('GRIP_GAP', 0.0004))
SINK = float(os.environ.get('GRIP_SINK', 0.0))      # bar centre moved further into the palm (+) / away (-)
SLIDE = float(os.environ.get('GRIP_SLIDE', -0.004))   # along the fingers: - = toward the palm (deeper), + = toward the fingers
T0A = np.radians(float(os.environ.get('T0A', 14))); T0B = np.radians(float(os.environ.get('T0B', 8)))
LIM = {'mcp': 95, 'pip': 115, 'dip': 85, 't1': 70, 't2': 85}
res = {}
for side in 'rl':
    J = {k: np.array(v) for k, v in pose.JS[side].items()}
    sgn = -1 if side == 'r' else 1
    P, bone = [], []
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.get('rig_side') != side or o.users_collection[0].name != 'SKIN': continue
        if not any(k in o.name for k in ('digits', 'Palm', 'Nail', 'Perionyx', 'Dorsum')): continue
        names = {g.index: g.name.rsplit('.', 1)[0] for g in o.vertex_groups}
        M = np.array(o.matrix_world)
        for v in o.data.vertices:
            if not v.groups: continue
            gbest = max(v.groups, key=lambda g: g.weight)
            P.append((M @ np.array([*v.co, 1.0]))[:3]); bone.append(names.get(gbest.group, '?'))
    P = np.array(P); bone = np.array(bone)
    mcp = np.array([J['f%d' % i][1] for i in range(1, 5)]); m0 = mcp.mean(0)
    a = pose.nrm(J['f4'][1] - J['f1'][1])
    dd = pose.nrm(np.mean([J['f%d' % i][2] - J['f%d' % i][1] for i in range(1, 5)], 0)); dd = pose.nrm(dd - (dd @ a) * a)
    n = np.cross(a, dd); n = n if n @ pose.FWD > 0 else -n            # palm-side normal (anatomical position: palm forward)
    # palm surface height near the knuckle line: palm skin + the hand-bone part of the fingers' palmar skin
    sel = ((bone == 'hand') | np.char.startswith(bone, 'f')) & (np.abs((P - m0) @ dd) < 0.012) & (((P - m0) @ n) > 0)
    h = float(np.percentile((P[sel] - m0) @ n, 98))
    def solve(SLIDE, SINK):
        c = m0 + n * (h + R_BAR + GAP - 0.002 + SINK) + dd * SLIDE
        def dist(Q): q = Q - c; return np.linalg.norm(q - np.outer(q @ a, a), axis=1)
        def rot(Q, p, ax, th):
            ax = pose.nrm(ax); Qp = Q - p; ct, st = np.cos(th), np.sin(th)
            return p + Qp * ct + np.cross(ax, Qp) * st + np.outer(Qp @ ax, ax) * (1 - ct)
        out = {'bar_c': c.tolist(), 'bar_a': a.tolist(), 'palm_h': h}; Qall = P.copy()
        for i in range(1, 5):
            cj = [p.copy() for p in J['f%d' % i]]; segs = [np.nonzero(bone == f'f{i}{j}')[0] for j in range(3)]
            Q = Qall; angs = []
            for j, key in enumerate(('mcp', 'pip', 'dip')):
                piv = cj[j + 1]; d = pose.nrm(cj[j + 2] - cj[j + 1]); ax = pose.flex_axis(d)
                mov = np.concatenate(segs[j:]); test = mov
                best = None
                for th in np.radians(np.arange(-40, LIM[key] + 0.01, 0.5)):
                    if dist(rot(Q[test], piv, ax, th)).min() < R_BAR + GAP:
                        break
                    best = th
                best = best if best is not None else np.radians(-40)
                Q[mov] = rot(Q[mov], piv, ax, best)
                for k in range(j + 2, len(cj)): cj[k] = rot(cj[k][None], piv, ax, best)[0]
                angs.append(float(best))
            out['f%d' % i] = angs
        # thumb: a little opposition, then IP joints close onto the bar from the other side
        c0 = [p.copy() for p in J['f0']]; med = np.array([-sgn * 1.0, 0, 0]); Q = Qall
        tsegs = {k: np.nonzero(bone == k)[0] for k in ('t0', 't1', 't2')}
        allt = np.concatenate(list(tsegs.values()))
        d0 = pose.nrm(c0[1] - c0[0])
        for ax_, th in ((pose.flex_axis(d0), T0A), (pose.flex_axis(d0, med), T0B)):
            Q[allt] = rot(Q[allt], c0[0], ax_, th)
            for k in range(1, len(c0)): c0[k] = rot(c0[k][None], c0[0], ax_, th)[0]
        tang = [T0A, T0B]
        for j, key in ((1, 't1'), (2, 't2')):
            piv = c0[j]; d = pose.nrm(c0[j + 1] - c0[j]); ax = pose.flex_axis(d, med)
            mov = np.concatenate([tsegs['t%d' % k] for k in range(j, 3)]); test = mov
            best = 0.0
            for th in np.radians(np.arange(-30, LIM[key] + 0.01, 0.5)):
                if dist(rot(Q[test], piv, ax, th)).min() < R_BAR + GAP: break
                best = th
            Q[mov] = rot(Q[mov], piv, ax, best)
            for k in range(j + 1, len(c0)): c0[k] = rot(c0[k][None], piv, ax, best)[0]
            tang.append(float(best))
        out['t'] = [float(x) for x in tang]
        # how well it holds: skin within 2 mm of the bar surface, by finger

        # score: how much of the bar's circumference has skin hugging it (within 2.5 mm), fingers and thumb
        q = Qall - c; t_ = q @ a; rad = q - np.outer(t_, a); d_ = np.linalg.norm(rad, axis=1)
        hug = (d_ < R_BAR + 0.0025) & (np.abs(t_) < 0.06)
        e1 = pose.nrm(n); e2 = np.cross(a, e1); ang = np.degrees(np.arctan2(rad[hug] @ e2, rad[hug] @ e1)) % 360
        cover = len(np.unique((ang // 10).astype(int))) * 10
        pen = int((d_ < R_BAR - 0.0005).sum())
        out['cover'] = cover; out['pen'] = pen; out['slide'] = SLIDE; out['sink'] = SINK
        return out
    best = None
    for SL in np.arange(-0.004, 0.036, 0.004):
        for SK in (-0.006, -0.003, 0.0, 0.003):
            o = solve(SL, SK)
            sc = o['cover'] - 40 * (o['pen'] > 0) - 30 * sum(1 for k in ('f1','f2','f3','f4') for x in o[k] if x < -0.05)
            if best is None or sc > best[0]: best = (sc, o)
            print('TRY slide %.3f sink %.3f cover %d pen %d' % (SL, SK, o['cover'], o['pen']), {k: [round(np.degrees(x)) for x in v] for k, v in o.items() if k in ('f1','f2','f3','f4','t')})
    out = best[1]
    res[side] = out
    print('GRIPSOLVE', side, 'cover', out['cover'], 'pen', out['pen'], 'slide', out['slide'], 'sink', out['sink'], 'palm_h %.1fmm' % (h * 1000), {k: [round(np.degrees(x), 1) for x in v] for k, v in out.items() if k[0] in 'ft'})
json.dump(res, open(OUT, 'w'), indent=1)
