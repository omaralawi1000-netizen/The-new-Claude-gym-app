# r8 full-body: blender -b scene8.blend --python render8.py -- still OUT.png FRAME [samples] [resx resy] [cam]
#                blender -b scene8.blend --python render8.py -- anim OUTDIR - [samples] [resx resy] [cam]     (MOTION=curl)
import bpy, sys, os, math, numpy as np
sys.path.insert(0, os.getcwd())
import pose, pose2
MOT = pose2.load(os.environ.get('MOTION', 'curl'))
for _k, _v in getattr(MOT, 'ENV', {}).items(): os.environ.setdefault(_k, str(_v))   # judge r4/r5: each move's render settings live in its motion file; a script export still wins
from mathutils import Vector, Matrix, Quaternion
a = sys.argv[sys.argv.index('--')+1:]
mode, out = a[0], os.path.abspath(a[1])
sc = bpy.context.scene
if len(a) > 3: sc.cycles.samples = int(a[3])
if len(a) > 5: sc.render.resolution_x, sc.render.resolution_y = int(a[4]), int(a[5])
CAMS = {'ref': ((-1.85, -3.3, 1.25), (0.0, 0.0, 0.875), 52),
        'torso': ((-0.55, -1.45, 1.22), (-0.02, 0, 1.12), 50),
        'arm': ((-0.75, -1.05, 1.15), (-0.22, -0.05, 1.07), 50),
        'chest': ((-0.12, -0.75, 1.32), (-0.06, 0, 1.28), 60),
        'knee': ((-0.45, -0.95, 0.55), (-0.08, 0, 0.45), 50),
        'ankle': ((-0.45, -0.75, 0.25), (-0.12, 0, 0.08), 50),
        'hand': ((-0.55, -0.75, 1.18), (-0.25, -0.18, 1.08), 55),
        'neck': ((-0.35, -0.85, 1.55), (0, 0, 1.47), 50),
        'ref40': ((-2.43, -2.90, 1.25), (0.0, 0.0, 0.875), 52),
        'ref36': ((-2.22, -3.06, 1.25), (0.0, 0.0, 0.875), 52),
        'pelvis': ((-0.35, -1.1, 0.95), (0, 0, 0.82), 50),
        'headside': ((-0.9, -0.25, 1.55), (0, 0, 1.52), 60),
        'headref': ((-0.511, -0.911, 1.634), (0.0, 0.0, 1.53), 60),
        'clipref': ((-1.85, -3.3, 1.25), (0.0, 0.0, 0.85), 48),
        'clip': ((-1.45, -3.5, 1.0), (0.0, 0.0, 0.9), 46),
        'side': ((-4.0, 0.0, 0.95), (0.0, 0.0, 0.9), 50)}
GLOW_SIZE = float(os.environ.get('GLOW_SIZE', 0.62)); GLOW_STRENGTH = float(os.environ.get('GLOW_STRENGTH', 1.0))
cname = a[6] if len(a) > 6 else 'ref'
cam = sc.camera; loc, tgt, lens = CAMS[cname]
if os.environ.get('CAM_LENS'): lens = float(os.environ['CAM_LENS'])   # cable moves: a touch wider so the pulley and base sit inside the frame
if os.environ.get('CAM_TZ'): tgt = (tgt[0], tgt[1], float(os.environ['CAM_TZ']))
cam.data.lens = lens
def set_cam(orbit_deg=0.0, lift=0.0):
    c = math.cos(math.radians(orbit_deg)); s_ = math.sin(math.radians(orbit_deg))
    dx, dy = loc[0] - tgt[0], loc[1] - tgt[1]
    L = Vector((tgt[0] + dx * c - dy * s_, tgt[1] + dx * s_ + dy * c, loc[2] + lift))
    T = Vector(tgt); pan = float(os.environ.get('CAM_PAN', 0))   # slide camera + target sideways (m, + = image right moves left)
    if pan:
        rt = (T - L).cross(Vector((0, 0, 1))).normalized(); L = L + rt * pan; T = T + rt * pan
    cam.location = L; cam.rotation_euler = (T - L).to_track_quat('-Z', 'Y').to_euler()
set_cam()

# bar centre in each hand's rest frame = circle through the gripped middle-finger joints
def grip_centre(side, g=1.0):
    G, J = pose.transforms(side, 0.0, 0.0, g); c = J['f2']
    p = [np.array(G['hand'] @ Vector(c[1])), np.array(G['f20'] @ Vector(c[2])), np.array(G['f22'] @ Vector(c[4]))]
    u, v = p[1] - p[0], p[2] - p[0]; n = np.cross(u, v)
    return p[0] + (np.cross(n, u) * (v @ v) + np.cross(v, n) * (u @ u)) / (2 * (n @ n))
GC = {s: grip_centre(s) for s in 'rl'}
_GCC = {}
def gc(s, g):   # bar centre for this grip (the grip the motion asks for, not always a full fist)
    k = (s, round(g, 4))
    if k not in _GCC: _GCC[k] = grip_centre(s, g)
    return _GCC[k]

import re as _re
# which muscles glow: the movers of THIS exercise (the scene ships with the biceps glowing for the curl)
GLOW_RE = os.environ.get('GLOW_RE') or {'hammer': r'^(Long|Short) head of biceps brachii|^Brachialis muscle|^Brachioradialis',
                                        'pushdown': r'^(Long|Lateral|Medial) head of triceps brachii'}.get(os.environ.get('MOTION', 'curl'), r'^(Long|Short) head of biceps brachii')
def _glow_band(o):
    # the Glow material masks by the 'bt' attribute (lit for bt 0.17..0.47, fading over 0.02..0.17 and 0.47..0.60), built for
    # the biceps as 0 elbow .. 1 shoulder. Upper-arm muscles get the same; forearm ones get a band over the belly (upper
    # forearm), fading out down the tendon toward the wrist and up past the elbow.
    sd = o.get('rig_side'); E_ = np.array(pose.JS[sd]['E'])
    P = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    if _re.search(r'Brachioradialis', o.name, _re.I):
        A_ = np.array(pose.JS[sd]['W']) - E_; u = ((P - E_) @ A_) / (A_ @ A_); t_ = 0.17 + u * (0.30 / 0.55)   # lit u 0..0.55: the belly
    elif _re.search(r'triceps', o.name, _re.I):
        A_ = np.array(pose.JS[sd]['S']) - E_; t = ((P - E_) @ A_) / (A_ @ A_); t1 = float(os.environ.get('TRI_T1', 0.75)); print('TRIBAND', o.name, t1, float(np.min(t)), float(np.max(t))); t_ = 0.17 + (t - 0.12) * (0.30 / (t1 - 0.12))   # lit t 0.12..t1: the horseshoe (pushdown r4: TRI_T1 0.62 fades the top out under the deltoid border)
    else:
        A_ = np.array(pose.JS[sd]['S']) - E_; t_ = ((P - E_) @ A_) / (A_ @ A_)
    at = o.data.attributes.get('bt') or o.data.attributes.new('bt', 'FLOAT_VECTOR', 'POINT')
    at.data.foreach_set('vector', np.stack([t_ * 0, t_ * 0, t_], 1).ravel().astype(np.float32))
if 'Glow' in bpy.data.materials and 'Clay' in bpy.data.materials:
    import re as _re
    for _o in bpy.data.objects:
        if _o.type != 'MESH' or not _o.material_slots or _o.get('rig_side') is None: continue
        _m = _o.material_slots[0].material
        if _m is not None and _m.name in ('Glow', 'Clay'):
            _g = bool(_re.search(GLOW_RE, _o.name, _re.I))
            if _g and _o.data.attributes.get('bt') is None: _glow_band(_o)
            _o.material_slots[0].material = bpy.data.materials['Glow' if _g else 'Clay']
            if _g and os.environ.get('GRIPDIAG'): print('GLOWS', _o.name)
if os.environ.get('GLOW_FACE_MIN') and 'Glow' in bpy.data.materials:   # pushdown r4: more facing contrast, so each triceps head reads as its own bulge
    bpy.data.materials['Glow'].node_tree.nodes['Map Range.002'].inputs['To Max'].default_value = float(os.environ['GLOW_FACE_MIN'])
if os.environ.get('GLOW_EMIT') and 'Glow' in bpy.data.materials:   # emission level (scene: 0.08); below clipping the facing shading shows
    bpy.data.materials['Glow'].node_tree.nodes['Math.001'].inputs[1].default_value = float(os.environ['GLOW_EMIT'])
if float(os.environ.get('GLOW_AO', 0)) > 0 and 'Glow' in bpy.data.materials:   # pushdown r4: grooves between muscle heads darken the
    # glow a little (emission x (1-k .. 1) by a short-range AO), so the triceps reads as two lobes instead of one flat shield
    _N = bpy.data.materials['Glow'].node_tree.nodes; _L = bpy.data.materials['Glow'].node_tree.links
    if 'GAO' not in _N:
        _em = _N['Emission']; _src = _em.inputs['Strength'].links[0].from_socket
        _ao = _N.new('ShaderNodeAmbientOcclusion'); _ao.name = 'GAO'; _ao.samples = 16; _ao.inputs['Distance'].default_value = float(os.environ.get('GLOW_AO_D', 0.025))
        _mr = _N.new('ShaderNodeMapRange'); _mr.inputs['To Min'].default_value = 1 - float(os.environ['GLOW_AO']); _mr.inputs['To Max'].default_value = 1.0
        _mu = _N.new('ShaderNodeMath'); _mu.operation = 'MULTIPLY'
        _L.new(_ao.outputs['AO'], _mr.inputs['Value']); _L.new(_src, _mu.inputs[0]); _L.new(_mr.outputs['Result'], _mu.inputs[1]); _L.new(_mu.outputs['Value'], _em.inputs['Strength'])
PROP = os.environ.get('PROP', 'barbell'); EZ_DEG = float(os.environ.get('EZ_DEG', 22)); EZ = None; EZ_YS = None; STATION = None
ROPE_TILT = float(os.environ.get('ROPE_TILT', 14 if PROP == 'rope_low' else 8))   # max fist tilt into the rope line (figure rules: hammer 14 deg, its bottom turn ~107 deg; pushdown 8)
TILT_SPAN = float(os.environ.get('TILT_SPAN', 66 if PROP == 'rope_low' else 63))   # smoothstep span in phi deg: saturates only past the largest phi (hammer clip build peaks at 108.2, so 63 held -14.0 for 7 frames)
def ez_frame(G, bx):
    """in-plane 'forward' axis of the EZ bar: perpendicular to the bar line and to the mean forearm direction"""
    global EZ_YS
    n = Vector((0, 0, 0))
    for sd in 'rl':
        E_, W_ = Vector(pose.JS[sd]['E']), Vector(pose.JS[sd]['W'])
        n += (G['fore.' + sd] @ W_ - G['fore.' + sd] @ E_).normalized()
    n = (n - n.dot(bx) * bx).normalized(); yb = n.cross(bx).normalized()
    if EZ_YS is None:   # the outer ends of the grip segments go where the thumbs turned (picked once, from the hands)
        aw = (G['hand.r'].to_3x3() @ Vector(pose.GRIP['r']['a'])).normalized()
        c_, s_ = math.cos(math.radians(EZ_DEG)), math.sin(math.radians(EZ_DEG))
        EZ_YS = 1.0 if (c_ * bx - s_ * yb).normalized().dot(aw) >= (c_ * bx + s_ * yb).normalized().dot(aw) else -1.0
        print('EZ_YS', EZ_YS)
    return yb * EZ_YS

TWIST_FROM_WRIST = os.environ.get('TWIST_FROM_WRIST', '1' if PROP != 'barbell' else '0') == '1'
def posed(v, f=None):
    """channel values -> bone world matrices with each hand turned so its grip lies along the bar (or its EZ segment).
    The part of that turn about the forearm's long axis goes into the forearm twist (a wrist can't roll); the wrist keeps
    only bend and side-to-side."""
    G = pose2.solve(v)
    if pose.GRIP and not PROP.startswith('rope'):
        HB = [k for k in G if k.split('.')[0] in ('hand', 't0', 't1', 't2') or (k[0] == 'f' and k[1:3].isdigit())]
        TW = [k for k in G if k.split('.')[0] in ('foretw',)] + HB
        for _ in range(4):
            pr = np.array(G['hand.r'] @ Vector(pose.GRIP['r']['c'])); pl = np.array(G['hand.l'] @ Vector(pose.GRIP['l']['c']))
            bx = Vector(pose.nrm(pl - pr))
            TG = (('r', bx), ('l', -bx))
            if PROP == 'ez':   # each hand follows its own angled grip segment
                yb = ez_frame(G, bx); c_, s_ = math.cos(math.radians(EZ_DEG)), math.sin(math.radians(EZ_DEG))
                TG = (('r', (c_ * bx - s_ * yb).normalized()), ('l', (-c_ * bx - s_ * yb).normalized()))
            for sd, tgt in TG:
                aw = (G['hand.' + sd].to_3x3() @ Vector(pose.GRIP[sd]['a'])).normalized()
                rd = aw.rotation_difference(tgt)
                Ep = G['fore.' + sd] @ Vector(pose.JS[sd]['E']); Wp = G['fore.' + sd] @ Vector(pose.JS[sd]['W'])
                tw_ang = 0.0
                if TWIST_FROM_WRIST and 'foretw.' + sd in G:   # swing-twist split about the forearm axis
                    fa = (Wp - Ep).normalized(); vq = Vector((rd.x, rd.y, rd.z)); pv = fa * vq.dot(fa)
                    qt = Quaternion((rd.w, pv.x, pv.y, pv.z));
                    if qt.magnitude > 1e-9:
                        qt.normalize(); tw_ang = 2 * math.atan2(Vector((qt.x, qt.y, qt.z)).dot(fa), qt.w)
                        Mt = Matrix.Translation(Wp) @ Matrix.Rotation(tw_ang, 4, fa) @ Matrix.Translation(-Wp)
                        for k in TW:
                            if k.endswith('.' + sd): G[k] = Mt @ G[k]
                        aw = (G['hand.' + sd].to_3x3() @ Vector(pose.GRIP[sd]['a'])).normalized(); rd = aw.rotation_difference(tgt)
                if os.environ.get('GRIPDIAG') and _ == 0 and f is not None:
                    print('WRISTCORR f%s %s wrist %.1f deg, into forearm twist %.1f deg' % (f, sd, math.degrees(rd.angle), math.degrees(tw_ang)))
                Mc = Matrix.Translation(Wp) @ rd.to_matrix().to_4x4() @ Matrix.Translation(-Wp)
                for k in HB:
                    if k.endswith('.' + sd): G[k] = Mc @ G[k]
    if pose.GRIP and PROP.startswith('rope') and ROPE_TILT > 0:
        # under cable tension the fist tilts into its rope line (side to side at the wrist, up to ROPE_TILT deg, more for a
        # sharper turn), so the rope rolls over the heel of the hand instead of turning a corner under it (judge r2 fix 2a)
        import props
        P = np.array(props.LOW if PROP == 'rope_low' else props.HIGH); entry = os.environ.get('ROPE_ENTRY', 'pinky' if PROP == 'rope_low' else 'thumb')
        HB = [k for k in G if k.split('.')[0] in ('hand', 't0', 't1', 't2') or (k[0] == 'f' and k[1:3].isdigit())]
        cs = {sd: np.array(G['hand.' + sd] @ Vector(pose.GRIP[sd]['c'])) for sd in 'rl'}
        M = (cs['r'] + cs['l']) / 2; dd = pose.nrm(P - M); Cg = M + dd * 0.75 * props.STRAND
        for sd in 'rl':
            a = np.array((G['hand.' + sd].to_3x3() @ Vector(pose.GRIP[sd]['a'])).normalized()); out = -a if entry == 'thumb' else a
            Ep = G['fore.' + sd] @ Vector(pose.JS[sd]['E']); Wp = G['fore.' + sd] @ Vector(pose.JS[sd]['W'])
            fa = pose.nrm(np.array(Wp - Ep)); npalm = pose.nrm(np.cross(fa, a))
            g = pose.nrm(Cg - (cs[sd] + out * 0.05)); phi = math.degrees(math.acos(float(np.clip(out @ g, -1, 1))))
            # signed by how much of the turn a side-to-side tilt can take (the share of out x g along the palm normal): it
            # passes smoothly through 0 instead of flipping sign (a sign flip snapped the wrist ~10 deg between frames)
            cx = np.cross(out, g); share = float(np.dot(cx, npalm) / max(np.linalg.norm(cx), 1e-9))
            # judge r4: a smoothstep over phi 45..108 (the clipped ramp froze the hands at full tilt for 48 frames, with a
            # corner at each end); the share (gain 2, soft-saturated) keeps the sign change smooth
            g_ = float(np.clip(2 * share, -1, 1)); g_ = g_ * (1.5 - 0.5 * g_ * g_)   # soft saturation: a hard clip left a corner where |share| reaches 0.5 (2nd diff 0.23 deg/f^2)
            x_ = float(np.clip((phi - 45) / TILT_SPAN, 0, 1)); ang = math.radians(ROPE_TILT * x_ * x_ * (3 - 2 * x_)) * g_; sgn = 1.0
            Mt = Matrix.Translation(Wp) @ Matrix.Rotation(sgn * ang, 4, Vector(npalm)) @ Matrix.Translation(-Wp)
            for k in HB:
                if k.endswith('.' + sd): G[k] = Mt @ G[k]
            if os.environ.get('GRIPDIAG') and f is not None: print('ROPETILT f%s %s phi %.2f tilt %.3f share %.3f' % (f, sd, phi, math.degrees(sgn * ang), share))
    return G

def grip_sep(G):
    pr = np.array(G['hand.r'] @ Vector(pose.GRIP['r']['c'])); pl = np.array(G['hand.l'] @ Vector(pose.GRIP['l']['c']))
    return float(np.linalg.norm(pl - pr))

SEP0 = None
def fist_septum(hands):
    """judge r6 (pushdown f36/f72): the hand is a skin shell with the rope through it. With the far fist turned in, the camera
    looks almost along the grip axis and sees the background through the fist, between the rope and the palm. Thin skin
    discs across the inside of each fist (FS_T mm along the grip axis) close that tunnel. Each disc's rim is measured per
    frame by rays from the rope surface out to that hand's skin and stops FS_K of the way there, so it never shows outside."""
    import props, bmesh
    o = bpy.data.objects.get('FistSeptum')
    if o is None:
        o = bpy.data.objects.new('FistSeptum', bpy.data.meshes.new('FistSeptumMesh')); bpy.data.collections['PROPS'].objects.link(o)
        o.data.materials.append(bpy.data.objects['Palm.l'].material_slots[0].material)
    o.data.clear_geometry(); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
    TS = [float(t) / 1000 for t in os.environ.get('FS_T', '-38,-22,-6,10,26').split(',')]; K = float(os.environ.get('FS_K', 0.8)); NA = 48
    bm = bmesh.new(); r0 = props.ROPE_R - 0.002
    for sd, (c, a) in hands.items():
        e1 = np.cross(a, [0, 0, 1.0]); e1 /= np.linalg.norm(e1); e2 = np.cross(a, e1)
        for t in TS:
            c0 = c + a * t; inner, outer = [], []
            for k in range(NA):
                q = 2 * math.pi * k / NA; dv = math.cos(q) * e1 + math.sin(q) * e2
                org = c0 + dv * (props.ROPE_R + 0.0005); rr = props.ROPE_R + 0.0005
                ok, hl, nrm, idx, ob, M_ = sc.ray_cast(dg, Vector(org), Vector(dv), distance=0.05)
                if ok and ob.get('rig_side') == sd and ob.users_collection and ob.users_collection[0].name == 'SKIN':
                    rr = props.ROPE_R + 0.0005 + K * (hl - Vector(org)).length
                inner.append(bm.verts.new(c0 + dv * r0)); outer.append(bm.verts.new(c0 + dv * rr))
            for k in range(NA):
                k2 = (k + 1) % NA; bm.faces.new((inner[k], inner[k2], outer[k2], outer[k]))
    bm.to_mesh(o.data); bm.free()
def set_frame(f, camera=True):
    global SEP0
    v = pose2.values(MOT, f)
    if PROP == 'ez' or (PROP == 'barbell' and os.environ.get('LOCKW', '1') == '1'):   # a rigid bar keeps the hands the same distance apart: the shoulders open or close a touch to hold it (the r15 barbell curl lacked this, so its hands slid 8 cm along the bar: Omar 18 Oct)
        if SEP0 is None: SEP0 = 2 * float(os.environ['LOCKW_SEP']) / 1000 if os.environ.get('LOCKW_SEP') else grip_sep(posed(pose2.values(MOT, 0)))   # LOCKW_SEP: half-width in mm
        base = v.get('abduct', 0.0); lo, hi = base - 8.0, base + float(os.environ.get('LOCKW_MAX', 8.0))
        for _ in range(18):
            mid = (lo + hi) / 2; v['abduct'] = mid
            if grip_sep(posed(v)) < SEP0: lo = mid
            else: hi = mid
        v['abduct'] = (lo + hi) / 2
        if os.environ.get('GRIPDIAG'): print('ABDUCT f%s %.2f deg' % (f, v['abduct']))
    G = posed(v, f)
    pose2.apply(G)
    Gs = {s: {nm[:-2]: g for nm, g in G.items() if nm.endswith('.' + s)} for s in 'rl'}
    if pose.GRIP:   # the bar sits where the solved grip closed round it
        pr = np.array(Gs['r']['hand'] @ Vector(pose.GRIP['r']['c'])); pl = np.array(Gs['l']['hand'] @ Vector(pose.GRIP['l']['c']))
    else:
        pr = np.array(Gs['r']['hand'] @ Vector(gc('r', v['grip']))); pl = np.array(Gs['l']['hand'] @ Vector(gc('l', v['grip'])))
    x = pose.nrm(pl - pr)
    if PROP.startswith('rope'):   # the rope follows the hands: each strand runs through its fist along the grip axis
        import props
        global STATION
        if STATION is None:
            STATION = props.make_cable_station(low=PROP == 'rope_low', high=PROP == 'rope_high'); bpy.data.objects['Barbell'].hide_render = True
        hands = {s: (np.array(Gs[s]['hand'] @ Vector(pose.GRIP[s]['c'])), np.array((Gs[s]['hand'].to_3x3() @ Vector(pose.GRIP[s]['a'])).normalized())) for s in 'rl'}
        props.update_rope(hands, props.LOW if PROP == 'rope_low' else props.HIGH, os.environ.get('ROPE_ENTRY', 'pinky' if PROP == 'rope_low' else 'thumb'))
        if os.environ.get('FIST_SEPTUM') == '1': fist_septum(hands)
        # the stoppers sit on the side of the fist AWAY from the pulley (the rope pulls toward it): low pulley curl ->
        # rope leaves the pinky side, knobs over the thumbs; high pulley pushdown -> rope leaves the thumb side, knobs under the pinkies
    elif PROP == 'ez':
        global EZ
        if EZ is None:
            import props; EZ = props.make_ez(float(np.linalg.norm(pl - pr)) / 2, EZ_DEG); bpy.data.objects['Barbell'].hide_render = True
            print('EZ built gx %.4f deg %.1f' % (float(np.linalg.norm(pl - pr)) / 2, EZ_DEG))
        y = np.array(ez_frame(G, Vector(x))); z = np.cross(x, y)
        M = Matrix(np.column_stack([x, y, z]).tolist()).to_4x4(); M.translation = Vector((pr + pl) / 2)
        EZ.matrix_world = M
    else:
        zh = np.array(Gs['r']['hand'].to_3x3() @ Vector((0, 0, 1))); z = pose.nrm(zh - (zh @ x) * x); y = np.cross(z, x)
        M = Matrix(np.column_stack([x, y, z]).tolist()).to_4x4(); M.translation = Vector((pr + pl) / 2)
        bpy.data.objects['Barbell'].matrix_world = M
    if os.environ.get('SQUASH') == '1':   # forearm presses into the biceps at deep flexion instead of passing through it (squash.py)
        import squash
        EW = {s: (np.array(G['fore.' + s] @ Vector(pose.JS[s]['E'])), np.array(G['fore.' + s] @ Vector(pose.JS[s]['W']))) for s in 'rl'}
        GF = {s: G['fore.' + s] for s in 'rl'}
        if not squash.MODS: bpy.context.view_layer.update(); squash.setup(EW, GF)
        squash.update(EW, v['elbow'], GF, {s: np.array(G['upper.' + s] @ Vector(pose.JS[s]['S'])) for s in 'rl'})
    if camera and not os.environ.get('NOCAM'): set_cam(float(os.environ['CAM_ORBIT']) if os.environ.get('CAM_ORBIT') else v.get('cam_orbit', 0.0), float(os.environ['CAM_LIFT']) if os.environ.get('CAM_LIFT') else v.get('cam_lift', 0.0))   # lift in m (0.20 m = +3 deg at 3.8 m)
    if os.environ.get('NECKCAM'):   # close-up on the neck, following the posed neck bone
        t = np.array(G['neck'] @ Vector((0, 0.0, 1.47)))
        dv = np.array([float(q) for q in os.environ['NECKDIR'].split(',')]) if os.environ.get('NECKDIR') else np.array(CAMS['clipref'][0]) - np.array(CAMS['clipref'][1])
        L = Vector(t + pose.nrm(dv) * float(os.environ.get('NECKDIST', 0.9))); cam.location = L; cam.data.lens = 60
        cam.rotation_euler = (Vector(t) - L).to_track_quat('-Z', 'Y').to_euler()
    if os.environ.get('HANDCAM'):   # close-up on one hand ('r'/'l'), seen from the clip camera's direction (or HANDDIR x,y,z)
        t = pr if os.environ['HANDCAM'] == 'r' else pl
        dv = np.array([float(q) for q in os.environ['HANDDIR'].split(',')]) if os.environ.get('HANDDIR') else np.array(CAMS['clipref'][0]) - np.array(CAMS['clipref'][1])
        L = Vector(t + pose.nrm(dv) * float(os.environ.get('HANDDIST', 0.55))); cam.location = L; cam.data.lens = 60
        cam.rotation_euler = (Vector(t) - L).to_track_quat('-Z', 'Y').to_euler()

def glare():
    if hasattr(sc, 'node_tree') and not hasattr(sc, 'compositing_node_group'):
        sc.use_nodes = True; nt = sc.node_tree; N = nt.nodes
        for nd in list(N): N.remove(nd)
        rl = N.new('CompositorNodeRLayers'); g = N.new('CompositorNodeGlare'); comp = N.new('CompositorNodeComposite')
        g.glare_type = 'FOG_GLOW'; g.quality = 'HIGH'; g.threshold = 1.6; g.size = 9; g.mix = 0.0
        nt.links.new(rl.outputs['Image'], g.inputs['Image']); nt.links.new(g.outputs['Image'], comp.inputs['Image'])
    else:  # Blender 5.x compositor: bloom only from the emission pass, added over the image
        bpy.context.view_layer.use_pass_emit = True
        ng = bpy.data.node_groups.new('Comp', 'CompositorNodeTree'); sc.compositing_node_group = ng; N = ng.nodes
        ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        rl = N.new('CompositorNodeRLayers'); g = N.new('CompositorNodeGlare'); o = N.new('NodeGroupOutput')
        g.inputs['Type'].default_value = 'Fog Glow'; g.inputs['Quality'].default_value = 'High'
        g.inputs['Threshold'].default_value = 0.0; g.inputs['Size'].default_value = GLOW_SIZE; g.inputs['Strength'].default_value = GLOW_STRENGTH
        mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'ADD'; mx.inputs['Factor'].default_value = 1.0
        ng.links.new(rl.outputs['Emission'], g.inputs['Image'])
        # the bloom never washes over the bar, plates or hands in front of the biceps
        bpy.context.view_layer.use_pass_object_index = True
        for ob in bpy.data.objects:
            if ob.name in ('Barbell', 'EZBar', 'Rope', 'CableStation') or ob.name.startswith(('Palm', 'Dorsum of hand', 'Dorsal surfaces of digits', 'Palmar surfaces of digits')): ob.pass_index = 1
            # BLOOM_FORE: nor over the forearm muscles, which cross in front of the biceps at the top of a curl (judge r16: red haze on the forearm)
            if os.environ.get('BLOOM_FORE') == '1' and ob.type == 'MESH' and ob.get('rig_side') and ob.users_collection and ob.users_collection[0].name == 'MUS' \
                    and _re.search(r'flexor|extensor|Brachioradialis|Pronator|Supinator|palmaris|Anconeus', ob.name, _re.I) and not _re.search(GLOW_RE, ob.name, _re.I): ob.pass_index = 1   # a glowing mover is never an occluder (hammer: brachioradialis)
        if os.environ.get('FORE_NOLIGHT') == '1':   # the glowing muscles do not light the forearm muscles red (light linking, receiver side)
            fore = [ob for ob in bpy.data.objects if ob.type == 'MESH' and ob.get('rig_side') and ob.users_collection and ob.users_collection[0].name == 'MUS'
                    and _re.search(r'flexor|extensor|Brachioradialis|Pronator|Supinator|palmaris|Anconeus', ob.name, _re.I) and not _re.search(GLOW_RE, ob.name, _re.I)]
            rc = bpy.data.collections.new('NoGlowLight')
            for ob in fore: rc.objects.link(ob)
            for co in rc.collection_objects: co.light_linking.link_state = 'EXCLUDE'
            n_ = 0
            for ob in bpy.data.objects:
                if ob.type == 'MESH' and ob.material_slots and ob.material_slots[0].material and ob.material_slots[0].material.name == 'Glow':
                    ob.light_linking.receiver_collection = rc; n_ += 1
            print('FORE_NOLIGHT', len(fore), 'receivers excluded from', n_, 'glow objects')
        inv = N.new('ShaderNodeMath'); inv.operation = 'MULTIPLY_ADD'; inv.inputs[1].default_value = -float(os.environ.get('MASK_K', 0.9)); inv.inputs[2].default_value = 1.0
        if os.environ.get('MASK_AOV', '1') == '1':
            # the mask as a shader AOV instead of the object-index pass: an AOV is filtered like the image, so its edge is
            # anti-aliased (judge r17: the index mask cut a hard stair-stepped edge along the forearm at f40-84)
            if not any(a.name == 'nb' for a in bpy.context.view_layer.aovs):
                a = bpy.context.view_layer.aovs.add(); a.name = 'nb'; a.type = 'VALUE'
            done = set()
            for ob in bpy.data.objects:
                if ob.type != 'MESH': continue
                for sl in ob.material_slots:
                    m = sl.material
                    if m is None or m.name in done or not m.node_tree: continue
                    done.add(m.name); mt = m.node_tree
                    oi = mt.nodes.new('ShaderNodeObjectInfo'); c2 = mt.nodes.new('ShaderNodeMath'); c2.operation = 'COMPARE'
                    c2.inputs[1].default_value = 1.0; c2.inputs[2].default_value = 0.5
                    ao = mt.nodes.new('ShaderNodeOutputAOV'); ao.aov_name = 'nb'
                    mt.links.new(oi.outputs['Object Index'], c2.inputs[0]); mt.links.new(c2.outputs[0], ao.inputs['Value'])
            bpy.context.view_layer.update()
            ng.links.new(rl.outputs['nb'], inv.inputs[0])
        else:
            cmp_ = N.new('ShaderNodeMath'); cmp_.operation = 'COMPARE'; cmp_.inputs[1].default_value = 1.0; cmp_.inputs[2].default_value = 0.5
            ng.links.new(rl.outputs['Object Index'] if 'Object Index' in rl.outputs else rl.outputs['IndexOB'], cmp_.inputs[0]); ng.links.new(cmp_.outputs[0], inv.inputs[0])
        gm = N.new('ShaderNodeMix'); gm.data_type = 'RGBA'; gm.blend_type = 'MULTIPLY'; gm.inputs['Factor'].default_value = 1.0
        # a soft red halo just past the silhouette (MoveKit style): the emission pass blurred wide, added to the bloom
        bl = N.new('CompositorNodeBlur'); bl.inputs['Type'].default_value = 'Gaussian'
        hr = float(os.environ.get('HALO_R', 0.018)) * sc.render.resolution_x; bl.inputs['Size'].default_value = (hr, hr)
        ng.links.new(rl.outputs['Emission'], bl.inputs['Image'])
        K_ = float(os.environ.get('HALO_K', 3.0))
        hs = N.new('ShaderNodeMix'); hs.data_type = 'RGBA'; hs.blend_type = 'MULTIPLY'; hs.inputs['Factor'].default_value = 1.0; hs.clamp_result = False
        ng.links.new(bl.outputs['Image'], hs.inputs['A']); hs.inputs['B'].default_value = (K_, K_, K_, 1)
        hk = N.new('ShaderNodeMix'); hk.data_type = 'RGBA'; hk.blend_type = 'ADD'; hk.inputs['Factor'].default_value = 1.0; hk.clamp_result = False
        ng.links.new(g.outputs['Glare'], hk.inputs['A']); ng.links.new(hs.outputs['Result'], hk.inputs['B'])
        ng.links.new(hk.outputs['Result'], gm.inputs['A']); ng.links.new(inv.outputs[0], gm.inputs['B'])
        ng.links.new(rl.outputs['Image'], mx.inputs['A']); ng.links.new(gm.outputs['Result'], mx.inputs['B'])
        out_ = mx.outputs['Result']
        if float(os.environ.get('GLOW_OUTLINE', 0)) > 0:
            # judge r3 (pushdown): draw the boundaries BETWEEN glowing heads (long / lateral / medial triceps) as a thin darker
            # line, from a per-object id AOV run through a Sobel filter, kept only well inside the glow (eroded mask), so the
            # outer edge and the overall red are untouched
            if not any(a.name == 'gid' for a in bpy.context.view_layer.aovs):
                a = bpy.context.view_layer.aovs.add(); a.name = 'gid'; a.type = 'VALUE'
            gl = [ob for ob in bpy.data.objects if ob.type == 'MESH' and ob.material_slots and ob.material_slots[0].material and ob.material_slots[0].material.name == 'Glow']
            base = sorted({_re.sub(r'\.[rl]$', '', ob.name) for ob in gl})
            for ob in gl: ob['gid'] = (base.index(_re.sub(r'\.[rl]$', '', ob.name)) + 1) / (len(base) + 1)
            print('GLOW_OUTLINE ids', {b_: round((i + 1) / (len(base) + 1), 3) for i, b_ in enumerate(base)})
            mt = bpy.data.materials['Glow'].node_tree
            at = mt.nodes.new('ShaderNodeAttribute'); at.attribute_type = 'OBJECT'; at.attribute_name = 'gid'
            ao = mt.nodes.new('ShaderNodeOutputAOV'); ao.aov_name = 'gid'; mt.links.new(at.outputs['Fac'], ao.inputs['Value'])
            bpy.context.view_layer.update()
            sob = N.new('CompositorNodeFilter'); sob.inputs['Type'].default_value = 'Sobel'
            ng.links.new(rl.outputs['gid'], sob.inputs['Image'])
            sp_ = N.new('CompositorNodeSeparateColor'); ng.links.new(sob.outputs['Image'], sp_.inputs['Image'])
            ev = N.new('ShaderNodeMath'); ev.operation = 'MULTIPLY_ADD'; ev.use_clamp = True
            ev.inputs[1].default_value = float(os.environ.get('OUTLINE_GAIN', 2.0)); ev.inputs[2].default_value = -float(os.environ.get('OUTLINE_T', 0.6))
            ng.links.new(sp_.outputs['Red'], ev.inputs[0])
            gm_ = N.new('ShaderNodeMath'); gm_.operation = 'GREATER_THAN'; gm_.inputs[1].default_value = 0.02; ng.links.new(rl.outputs['gid'], gm_.inputs[0])
            er = N.new('CompositorNodeDilateErode'); er.inputs['Size'].default_value = -int(os.environ.get('OUTLINE_ERODE', 2)); ng.links.new(gm_.outputs[0], er.inputs['Mask'])
            em = N.new('ShaderNodeMath'); em.operation = 'MULTIPLY'; ng.links.new(ev.outputs[0], em.inputs[0]); ng.links.new(er.outputs['Mask'], em.inputs[1])
            fk = N.new('ShaderNodeMath'); fk.operation = 'MULTIPLY_ADD'; fk.inputs[1].default_value = -float(os.environ['GLOW_OUTLINE']); fk.inputs[2].default_value = 1.0
            ng.links.new(em.outputs[0], fk.inputs[0])
            dm = N.new('ShaderNodeMix'); dm.data_type = 'RGBA'; dm.blend_type = 'MULTIPLY'; dm.inputs['Factor'].default_value = 1.0
            ng.links.new(out_, dm.inputs['A']); ng.links.new(fk.outputs[0], dm.inputs['B']); out_ = dm.outputs['Result']
        ng.links.new(out_, o.inputs[0])

def denoise():
    try:
        sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
        sc.cycles.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    except Exception as e:
        print('no denoise', e); sc.cycles.use_denoising = False

_orb0 = float(os.environ['CAM_ORBIT']) if os.environ.get('CAM_ORBIT') else pose2.values(MOT, 0).get('cam_orbit', 0.0)
if _orb0:   # a turned camera takes the whole studio (cyc + lights) with it: same backdrop and light, figure seen from another side
    _Rz = Matrix.Rotation(math.radians(_orb0), 4, 'Z')
    for ob in bpy.data.collections['STUDIO'].objects:
        if ob.name != 'Cam': ob.matrix_world = _Rz @ ob.matrix_world
    print('STUDIO turned', _orb0)
if PROP == 'ez' or PROP.startswith('rope'): set_frame(0, camera=False)   # builds the EZ bar to fit the hands
glare(); denoise()
if os.environ.get('HIDE'):   # test: hide objects whose name matches this regex
    import re as _re
    for ob in bpy.data.objects:
        if _re.search(os.environ['HIDE'], ob.name): ob.hide_render = True; print('HIDDEN', ob.name)
# fast-mode switches (r10 reference = none of these): keep the scene in memory between frames, cap light bounces
if os.environ.get('PERSIST'): sc.render.use_persistent_data = True
if os.environ.get('BOUNCES'):
    nb = int(os.environ['BOUNCES']); sc.cycles.max_bounces = nb
    sc.cycles.diffuse_bounces = min(sc.cycles.diffuse_bounces, nb); sc.cycles.glossy_bounces = min(sc.cycles.glossy_bounces, nb)
    sc.cycles.transmission_bounces = min(sc.cycles.transmission_bounces, nb); sc.cycles.transparent_max_bounces = max(4, min(sc.cycles.transparent_max_bounces, 2 * nb))
if os.environ.get('NOISE_T'): sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = float(os.environ['NOISE_T'])
print('SETTINGS samples', sc.cycles.samples, 'adaptive', sc.cycles.use_adaptive_sampling, sc.cycles.adaptive_threshold,
      'bounces', sc.cycles.max_bounces, sc.cycles.diffuse_bounces, sc.cycles.glossy_bounces, sc.cycles.transmission_bounces,
      sc.cycles.transparent_max_bounces, 'persist', sc.render.use_persistent_data, 'threads', sc.render.threads, 'denoise', sc.cycles.use_denoising)
sc.view_settings.view_transform = 'Filmic'; sc.view_settings.look = 'Medium High Contrast'; sc.view_settings.exposure = 0.3
if os.environ.get('VIEW'):
    sc.view_settings.view_transform = os.environ['VIEW']
    sc.view_settings.look = os.environ.get('LOOK', 'None')
if os.environ.get('EXPO'): sc.view_settings.exposure = float(os.environ['EXPO'])
if os.environ.get('BORDER'):
    b_ = [float(v) for v in os.environ['BORDER'].split(',')]
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_min_y, sc.render.border_max_x, sc.render.border_max_y = b_
if float(os.environ.get('UNDER_ARM_IN', 0)) > 0:   # judge r3 (hammer f55): the clay under-layer of the upper arm poked out up to
    # 4 mm in front of the biceps at full flexion, a grey stepped sliver. Pull it in toward the humerus axis (rest pose, radial,
    # UNDER_ARM_IN metres at most) over the upper arm only (t 0..1 elbow to shoulder, eased at both ends), so it stays a backdrop.
    # (A Displace along normals inflated it: this layer is two overlapping sheets with opposite normals.)
    for _o in bpy.data.objects:
        if _o.type != 'MESH' or not _o.name.startswith('U:arm region'): continue
        sd = _o.name[-1]; E_ = np.array(pose.JS[sd]['E']); A_ = np.array(pose.JS[sd]['S']) - E_
        Mw = np.array(_o.matrix_world); P = np.empty(len(_o.data.vertices) * 3); _o.data.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
        Pw = P @ Mw[:3, :3].T + Mw[:3, 3]
        t = ((Pw - E_) @ A_) / (A_ @ A_); ss = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
        w = ss(t / 0.12) * ss((1.0 - t) / 0.12)
        R_ = Pw - (E_ + t[:, None] * A_); r = np.linalg.norm(R_, axis=1) + 1e-9
        dpull = np.minimum(float(os.environ['UNDER_ARM_IN']), 0.5 * r) * w
        # r5: just past the elbow it also poked 0.4 mm in front of the brachioradialis (a light 3x3 px speck at hammer f0):
        # a small pull there too (UNDER_FORE_IN, t -0.25..0.1)
        wf = ss((t + 0.25) / 0.1) * ss((0.1 - t) / 0.1)
        dpull = np.maximum(dpull, np.minimum(float(os.environ.get('UNDER_FORE_IN', 0.004)), 0.5 * r) * wf)
        Pw2 = Pw - R_ / r[:, None] * dpull[:, None]
        P2 = (Pw2 - Mw[:3, 3]) @ np.linalg.inv(Mw[:3, :3]).T
        _o.data.vertices.foreach_set('co', P2.ravel().astype(np.float32)); _o.data.update()
if os.environ.get('PICKDIAG'):   # which objects a pixel ray passes through (960x640): "x,y;x,y"
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 960, 640, 100
    for f in [int(x) for x in os.environ.get('FRAMES_SUB', '0').split(',')]:
        set_frame(f); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        cm = sc.camera.matrix_world; fr_ = [cm @ v for v in sc.camera.data.view_frame(scene=sc)]   # tr, br, bl, tl
        o_ = cm.translation
        for xy in os.environ['PICKDIAG'].split(';'):
            px, py = map(float, xy.split(',')); u, v = (px + 0.5) / 960, 1 - (py + 0.5) / 640
            p = fr_[3] + (fr_[0] - fr_[3]) * u + (fr_[2] - fr_[3]) * (1 - v); d = (p - o_).normalized()
            org = o_.copy(); hits = []
            for _ in range(6):
                ok, hloc, nrm, idx, ob, M_ = sc.ray_cast(dg, org, d)   # (not 'loc': set_cam reads the global camera loc)
                if not ok: break
                hits.append('%s(%s)@%.1f' % (ob.name, ob.users_collection[0].name if ob.users_collection else '-', (hloc - o_).length * 1000)); org = hloc + d * 1e-4
            print('PICK f%d %s: %s' % (f, xy, ' > '.join(hits)))
    raise SystemExit
if os.environ.get('CABLEDIAG'):   # judge r3 (pushdown f48): the cable must clear the figure's silhouette by >= 6 px or cross well
    # inside it, never run along its edge. Along the projected cable (1 px steps) rays at -20..+20 px across it find the signed
    # distance to the figure outline (+ outside, - inside); a run of samples within 6 px of the outline longer than 24 px = tangent.
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 960, 640, 100
    import props
    def _px(p):
        q = _w2c(sc, sc.camera, Vector(p)); return np.array([q.x * 960, (1 - q.y) * 640])
    BAND = float(os.environ.get('CABLE_BAND', 6)); RUNMAX = float(os.environ.get('CABLE_RUN', 24))
    worst = (0, -1); tot_bad = 0
    for f in [int(x) for x in os.environ.get('FRAMES_SUB', '36,48,60,70').split(',')]:
        set_frame(f); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        cm = sc.camera.matrix_world; fr_ = [cm @ v for v in sc.camera.data.view_frame(scene=sc)]; o_ = cm.translation
        def fig(px, py, vis=False):   # does the pixel ray hit the figure (anything not a prop or the studio)? vis: is the rope/cable the first thing hit?
            u, v = (px + 0.5) / 960, 1 - (py + 0.5) / 640
            p = fr_[3] + (fr_[0] - fr_[3]) * u + (fr_[2] - fr_[3]) * (1 - v); d = (p - o_).normalized(); org = o_.copy()
            for k_ in range(8):
                ok, loc, nrm, idx, ob, M = sc.ray_cast(dg, org, d)
                if not ok: return False
                if vis: return ob.name == 'Rope'
                cn = ob.users_collection[0].name if ob.users_collection else ''
                if cn not in ('PROPS', 'STUDIO') and not cn.startswith('LL_'): return True
                org = loc + d * 1e-4
            return False
        cab = props.LAST['cable']; W0 = np.array(props.HIGH if PROP == 'rope_high' else props.LOW)
        n_vis = int(np.argmin([np.linalg.norm(q - W0) for q in cab]))   # straight run from the clip up to the wheel tangent
        Q = np.array([_px(q) for q in cab[:n_vis + 1]])
        segs = []
        for i in range(len(Q) - 1):
            a, b = Q[i], Q[i + 1]; L_ = np.linalg.norm(b - a)
            for t in np.arange(0, L_, 1.0): segs.append((a + (b - a) * t / L_, (b - a) / L_))
        D = []
        for c, tdir in segs:
            nv = np.array([-tdir[1], tdir[0]]); c_in = fig(*c)
            dd = None
            for k in range(1, 21):
                if fig(*(c + nv * k)) != c_in or fig(*(c - nv * k)) != c_in: dd = k; break
            dd = 21 if dd is None else dd
            D.append(-dd if c_in else dd)
        V = np.array([fig(*c, vis=True) or fig(*(c + np.array([0.6, 0])), vis=True) or fig(*(c - np.array([0.6, 0])), vis=True) for c, _t in segs])
        D = np.array(D); near = (np.abs(D) < BAND) & V   # only where the cable can be seen (a hidden stretch behind the body cannot graze an outline)
        runs = []; r0 = None
        for i, v in enumerate(list(near) + [False]):
            if v and r0 is None: r0 = i
            if not v and r0 is not None: runs.append((r0, i - r0)); r0 = None
        bad = [r for r in runs if r[1] > RUNMAX]; tot_bad += len(bad)
        lr = max([r[1] for r in runs], default=0)
        if lr > worst[0]: worst = (lr, f)
        inside = int((D < 0).sum())
        print('CABLEDIAG f%d: cable %d px (visible %d), inside figure %d px, min outside clearance %s px, visible near-outline runs %s -> %s'
              % (f, len(D), int(V.sum()), inside, (int(D[D > 0].min()) if (D > 0).any() else '-'),
                 ' '.join('%d@%d,%d' % (r[1], *segs[r[0]][0].round()) for r in runs) or 'none', 'TANGENT' if bad else 'ok'))
    print('CABLEDIAG TOTAL tangent runs %d, longest near-outline run %d px at f%d' % (tot_bad, *worst))
    raise SystemExit
if os.environ.get('CAPDIAG'):   # judge r6 (hammer f46-70): the NEAR end cap must sit clearly inside the body outline (>= 4 px of
    # body between its visible pixels and the background) or clearly clear of it (>= 6 px of background to the trunk), never on it.
    # Visible labels per pixel (960x640 first hit): C cap (rope within 2 cm of the near knob), H near arm (rig_side), T other figure, B rest.
    # dCB = min distance C -> B, dCT = min distance C -> T. inside: dCB >= 5; clear: dCT >= 7; else TANGENT.
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 960, 640, 100
    import props
    def _px(p):
        q = _w2c(sc, sc.camera, Vector(p)); return np.array([q.x * 960, (1 - q.y) * 640])
    def _cd(f):
        set_frame(f); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        cm = sc.camera.matrix_world; fr_ = [cm @ v for v in sc.camera.data.view_frame(scene=sc)]; o_ = cm.translation
        camp = np.array(o_); kn = props.LAST['knobs']
        near = min(kn, key=lambda s_: np.linalg.norm(kn[s_][0].mean(0) - camp)); kp = kn[near][0]
        Q = np.array([_px(q) for q in kp]); x0, y0 = (Q.min(0) - 22).astype(int); x1, y1 = (Q.max(0) + 22).astype(int)
        x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(960, x1), min(640, y1)
        L = np.zeros((y1 - y0, x1 - x0), np.int8)   # 0 B, 1 C, 2 H, 3 T
        BH = np.zeros_like(L)                         # under cap pixels: what the cap is in front of (0 B, 2 H, 3 T)
        BHN = {}; FN = {}
        for py in range(y0, y1):
            for px in range(x0, x1):
                u, v = (px + 0.5) / 960, 1 - (py + 0.5) / 640
                p = fr_[3] + (fr_[0] - fr_[3]) * u + (fr_[2] - fr_[3]) * (1 - v); d = (p - o_).normalized()
                org = o_.copy(); first = True
                for _k in range(8):
                    ok, hl, nrm, idx, ob, M = sc.ray_cast(dg, org, d)
                    if not ok: break
                    cn = ob.users_collection[0].name if ob.users_collection else ''
                    if ob.name == 'Rope':
                        if first and np.min(np.linalg.norm(kp - np.array(hl), axis=1)) < 0.026: L[py - y0, px - x0] = 1; first = False
                        elif first: break
                        org = hl + d * 1e-4; continue
                    if cn in ('PROPS', 'STUDIO') or cn.startswith('LL_'):
                        if first: break
                        org = hl + d * 1e-4; continue
                    lab = 2 if ob.get('rig_side') == near else 3
                    if first: L[py - y0, px - x0] = lab; FN[(py - y0, px - x0)] = ob.name
                    else: BH[py - y0, px - x0] = lab; BHN[ob.name] = BHN.get(ob.name, 0) + 1
                    break
        C = np.argwhere(L == 1); Bp = np.argwhere(L == 0); Tp = np.argwhere(L == 3)
        def md(A, Bq):
            if not len(A) or not len(Bq): return 99.0
            return float(min(np.sqrt(((Bq - a) ** 2).sum(1)).min() for a in A))
        L2 = np.where(L == 1, BH, L)                  # the picture with the cap lifted off
        Bp2 = np.argwhere(L2 == 0); Tp2 = np.argwhere(L2 == 3)
        overB = int(((L == 1) & (BH == 0)).sum())
        if not len(C): cls, m_ = 'none', 0.0
        elif overB == 0: m_ = md(C, Bp2); cls = 'inside' if m_ >= 5 else 'TANGENT'      # >= 4 px of body between cap and background
        elif overB == len(C): m_ = -md(C, Tp2); cls = 'clear' if -m_ >= 7 else 'TANGENT'  # >= 6 px of background between cap and trunk
        else: m_ = 0.0; cls = 'TANGENT'
        dCB, dCT = md(C, Bp), md(C, Tp)
        if os.environ.get('CAPDIAG') == '2':
            np.save(os.environ.get('CAPDIAG_OUT', '/tmp') + '/cap_f%03d.npy' % f, L); print('CAPBOX f%d %d %d' % (f, x0, y0))
        print('CAPDIAG f%d near %s: cap %d px, %d over background, margin %+.1f px (+ inside body, - clear of trunk), visible cap->background %.1f px, cap->trunk %.1f px -> %s'
              % (f, near, len(C), overB, m_, dCB, dCT, cls))
        if os.environ.get('CAPDIAG') == '2': np.save(os.environ.get('CAPDIAG_OUT', '/tmp') + '/bh_f%03d.npy' % f, L2)
        if os.environ.get('CAPDIAG') == '2': print('CAPDIAG behind f%d %s' % (f, sorted(BHN.items(), key=lambda t: -t[1])[:6]))
        if os.environ.get('CAPDIAG') == '2':
            RN = {}
            for (yy, xx), nm in FN.items():
                if L[yy, xx] == 3 and len(C) and np.sqrt(((C - np.array([yy, xx])) ** 2).sum(1)).min() <= 2.5: RN[nm] = RN.get(nm, 0) + 1
            print('CAPDIAG ring f%d %s' % (f, sorted(RN.items(), key=lambda t: -t[1])[:6]))
        return cls == 'TANGENT'
    nb = 0
    for f in [int(x) for x in os.environ.get('FRAMES_SUB', '46,55,62,70').split(',')]: nb += _cd(f)
    print('CAPDIAG TOTAL tangent frames %d' % nb)
    raise SystemExit
if os.environ.get('HOLEDIAG'):   # judge r6 (pushdown f36/f72): background seen through a hand/wrist seam. Around each hand
    # (HOLE_SIDES, default both), rays at HOLE_SS x HOLE_SS per pixel; label 0 background, 1 figure, 2 prop. A background
    # component that does not touch the box edge is a hole. Per frame: holes, subsamples, worst pixel coverage, objects on the rim.
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 960, 640, 100
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    import props
    SS = int(os.environ.get('HOLE_SS', 4)); PAD = int(os.environ.get('HOLE_PAD', 14))
    def _hd(f):
        set_frame(f); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        cm = sc.camera.matrix_world; fr_ = [cm @ v for v in sc.camera.data.view_frame(scene=sc)]; o_ = cm.translation
        out = []; tot = 0
        for sd in os.environ.get('HOLE_SIDES', 'l,r').split(','):
            P = [np.array(e_.matrix_world @ v.co) for o in bpy.data.objects if o.type == 'MESH' and o.get('rig_side') == sd and _re.search('Palm|digits|Dorsum|wrist', o.name)
                 for e_ in [o.evaluated_get(dg)] for v in list(e_.data.vertices)[::7]]
            Q = np.array([[_w2c(sc, sc.camera, Vector(p)).x * 960, (1 - _w2c(sc, sc.camera, Vector(p)).y) * 640] for p in P])
            x0, y0 = np.maximum((Q.min(0) - PAD).astype(int), 0); x1, y1 = np.minimum((Q.max(0) + PAD).astype(int), [960, 640])
            H, W = (y1 - y0) * SS, (x1 - x0) * SS; L = np.zeros((H, W), np.int8); NM = {}
            for j in range(H):
                for i in range(W):
                    u = (x0 + (i + 0.5) / SS) / 960; v = 1 - (y0 + (j + 0.5) / SS) / 640
                    p = fr_[3] + (fr_[0] - fr_[3]) * u + (fr_[2] - fr_[3]) * (1 - v); d = (p - o_).normalized()
                    ok, hl, nrm, idx, ob, M = sc.ray_cast(dg, o_, d)
                    if not ok: continue
                    cn = ob.users_collection[0].name if ob.users_collection else ''
                    if cn == 'STUDIO' or cn.startswith('LL_'): continue
                    L[j, i] = 2 if cn == 'PROPS' else 1; NM[(j, i)] = ob.name
            # background components not touching the border (4-connected flood fill)
            seen = np.zeros_like(L, bool); holes = []
            for j in range(H):
                for i in range(W):
                    if L[j, i] or seen[j, i]: continue
                    st = [(j, i)]; seen[j, i] = True; comp = []; edge = False
                    while st:
                        a, b = st.pop(); comp.append((a, b))
                        if a in (0, H - 1) or b in (0, W - 1): edge = True
                        for a2, b2 in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                            if 0 <= a2 < H and 0 <= b2 < W and not L[a2, b2] and not seen[a2, b2]: seen[a2, b2] = True; st.append((a2, b2))
                    if not edge: holes.append(comp)
            for comp in holes:
                rim = {}
                for a, b in comp:
                    for a2, b2 in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                        if (a2, b2) in NM: rim[NM[(a2, b2)]] = rim.get(NM[(a2, b2)], 0) + 1
                cy, cx = np.mean(comp, 0); px_, py_ = x0 + cx / SS, y0 + cy / SS
                cov = max(sum(1 for a, b in comp if (a // SS, b // SS) == (a0 // SS, b0 // SS)) for a0, b0 in comp) / SS / SS
                out.append('%s hole %d sub at %.1f,%.1f (worst px %.0f%% bg) rim %s' % (sd, len(comp), px_, py_, 100 * cov, sorted(rim.items(), key=lambda t: -t[1])[:4]))
                tot += 1
            if os.environ.get('HOLE_OUT'): np.save(os.environ['HOLE_OUT'] + '/hole_%s_f%03d.npy' % (sd, f), L); print('HOLEBOX f%d %s %d %d' % (f, sd, x0, y0))
        print('HOLEDIAG f%d: %d holes %s' % (f, tot, '; '.join(out)))
        return tot
    nh = 0
    for f in [int(x) for x in os.environ.get('FRAMES_SUB', '36,72').split(',')]: nh += _hd(f) > 0
    print('HOLEDIAG TOTAL frames with holes %d' % nh)
    raise SystemExit
if os.environ.get('FARDIAG'):   # judge r3 (pushdown f40-62): the far rope end must not float. Per frame, around the far end cap:
    # visible cap px (first hit = the rope, within 1 cm of the cap) and visible far-fist px (first hit = that hand's skin).
    # Pass: cap hidden (0 px) or the fist visibly holding it (fist px >= FAR_FIST_MIN).
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 960, 640, 100
    import props
    def _px(p):
        q = _w2c(sc, sc.camera, Vector(p)); return np.array([q.x * 960, (1 - q.y) * 640])
    FMIN = int(os.environ.get('FAR_FIST_MIN', 40)); nbad = 0
    def _fd(f, nbad):   # a function, so its locals cannot clobber module globals that set_frame uses
        set_frame(f); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        cm = sc.camera.matrix_world; fr_ = [cm @ v for v in sc.camera.data.view_frame(scene=sc)]; o_ = cm.translation
        camp = np.array(o_); kn = props.LAST['knobs']
        far = max(kn, key=lambda s_: np.linalg.norm(kn[s_][0].mean(0) - camp)); kp = kn[far][0]
        Q = np.array([_px(q) for q in kp]); x0, y0 = (Q.min(0) - 30).astype(int); x1, y1 = (Q.max(0) + 30).astype(int)
        cap = fist = 0; HIST = {}
        for py in range(max(0, y0), min(640, y1)):
            for px in range(max(0, x0), min(960, x1)):
                u, v = (px + 0.5) / 960, 1 - (py + 0.5) / 640
                p = fr_[3] + (fr_[0] - fr_[3]) * u + (fr_[2] - fr_[3]) * (1 - v); d = (p - o_).normalized()
                ok, loc, nrm, idx, ob, M = sc.ray_cast(dg, o_, d)
                if not ok: continue
                HIST[ob.name] = HIST.get(ob.name, 0) + 1
                if ob.name == 'Rope' and np.min(np.linalg.norm(kp - np.array(loc), axis=1)) < 0.02: cap += 1
                elif ob.get('rig_side') == far and _re.search('Palm|digits|Dorsum', ob.name): fist += 1
        ok_ = cap == 0 or fist >= FMIN; nbad += not ok_
        if os.environ.get('FARDIAG') == '2': print('FARHIST', sorted(HIST.items(), key=lambda t: -t[1])[:12], Q.min(0), Q.max(0))
        print('FARDIAG f%d far %s: cap visible %d px, far fist visible %d px -> %s' % (f, far, cap, fist, 'ok' if ok_ else 'FLOATING'))
        return nbad
    for f in [int(x) for x in os.environ.get('FRAMES_SUB', '40,48,56,62').split(',')]: nbad = _fd(f, nbad)
    print('FARDIAG TOTAL floating frames %d' % nbad)
    raise SystemExit
if os.environ.get('CAMDIAG'):   # framing in pixels (960x640): near fist vs the column's silhouette, composition centre, margins
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 960, 640, 100
    def _px(p):
        q = _w2c(sc, sc.camera, Vector(p)); return np.array([q.x * 960, (1 - q.y) * 640])
    def _hull(P):
        P = sorted(map(tuple, P)); lo, hi = [], []
        cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
        for p in P:
            while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0: lo.pop()
            lo.append(p)
        for p in reversed(P):
            while len(hi) >= 2 and cr(hi[-2], hi[-1], p) <= 0: hi.pop()
            hi.append(p)
        return np.array(lo[:-1] + hi[:-1])
    def _sdist(H, q):   # signed distance from q to convex polygon H (negative = inside)
        d = 1e9; inside = True
        for i in range(len(H)):
            a, b = H[i], H[(i + 1) % len(H)]; ab = b - a; t = np.clip((q - a) @ ab / (ab @ ab), 0, 1)
            d = min(d, np.linalg.norm(q - (a + t * ab)))
            if ab[0] * (q - a)[1] - ab[1] * (q - a)[0] < 0: inside = False
        return -d if inside else d
    import props; cx, cy = (props.COL_HIGH if PROP == 'rope_high' else props.COL_LOW)
    col3 = [(cx + sx * 0.045, cy + sy * 0.045, z) for sx in (-1, 1) for sy in (-1, 1) for z in (0.0, 2.30)]
    worst = (1e9, -1)
    for f in [int(x) for x in os.environ.get('FRAMES_SUB', '0,20,48').split(',')]:
        set_frame(f); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        Hc = _hull([_px(p) for p in col3])
        camp = np.array(sc.camera.matrix_world.translation); pts = {'r': [], 'l': []}; allp = []
        for ob in bpy.data.objects:
            if ob.type != 'MESH' or ob.hide_render or not ob.users_collection or ob.users_collection[0].name not in ('SKIN',): continue
            ev = ob.evaluated_get(dg); m2 = ev.to_mesh(); W = ev.matrix_world
            P = np.empty(len(m2.vertices) * 3); m2.vertices.foreach_get('co', P); P = P.reshape(-1, 3)[::4]; ev.to_mesh_clear()
            P = P @ np.array(W.to_3x3()).T + np.array(W.translation)
            if len(P) == 0: continue
            allp.append(P[::4])
            sd = ob.get('rig_side')
            if sd in pts and _re.search('Palm|digits|Dorsum', ob.name): pts[sd].append(P)
        near = min('rl', key=lambda s_: np.linalg.norm(np.vstack(pts[s_]).mean(0) - camp))
        gaps = {s_: min(_sdist(Hc, _px(p)) for p in np.vstack(pts[s_])[::2]) for s_ in 'rl'}
        st = bpy.data.objects.get('CableStation')
        SP = np.array([_px(st.matrix_world @ st.data.vertices[i].co) for i in range(0, len(st.data.vertices), 7)]) if st else np.zeros((0, 2))
        FP = np.array([_px(p) for p in np.vstack(allp)])
        U = np.vstack([FP, Hc] + ([SP] if len(SP) else []))
        mid = (U[:, 0].min() + U[:, 0].max()) / 2
        WC = np.array(props.HIGH if PROP == 'rope_high' else props.LOW)
        WP = np.array([_px(WC + np.array([0, props.WHEEL_R * 1.25 * math.cos(q), props.WHEEL_R * 1.25 * math.sin(q)])) for q in np.linspace(0, 2 * math.pi, 48)])
        top = min(FP[:, 1].min(), WP[:, 1].min()); bot = max(U[:, 1].max(), WP[:, 1].max())
        if gaps[near] < worst[0]: worst = (gaps[near], f)
        print('CAMDIAG f%d near %s: fist-column gap near %.0fpx far %.0fpx | figure+station x %.0f..%.0f mid %.0f (%+.0f) | pulley/head top margin %.0fpx bottom %.0fpx | figure x %.0f..%.0f'
              % (f, near, gaps[near], gaps['l' if near == 'r' else 'r'], U[:, 0].min(), U[:, 0].max(), mid, mid - 480, top, 640 - bot, FP[:, 0].min(), FP[:, 0].max()))
    print('CAMDIAG worst near-fist gap %.0fpx at f%d' % worst)
    raise SystemExit
if os.environ.get('TILTDIAG'):   # fist tilt only (set_frame prints ROPETILT when GRIPDIAG is set): every frame, no contact test
    os.environ['GRIPDIAG'] = '1'
    for f in [int(x) for x in os.environ.get('FRAMES_SUB', '0').split(',')]: set_frame(f, camera=False)
    raise SystemExit
MONO_BAD = [0, 0.0]; STR_BAD = [0, 0.0]
if os.environ.get('GRIPDIAG') and (PROP == 'ez' or PROP.startswith('rope')):   # the real test: posed hand skin against the built prop mesh
    from mathutils.bvhtree import BVHTree
    fr = [int(x) for x in os.environ.get('FRAMES_SUB', '0,20,41,55,60,70,100').split(',')]
    worst = {'r': 1e9, 'l': 1e9}; total_in = 0
    for f in fr:
        set_frame(f, camera=False); dg = bpy.context.evaluated_depsgraph_get()
        PO = EZ if PROP == 'ez' else bpy.data.objects['Rope']
        eb = PO.evaluated_get(dg); me = eb.to_mesh(); Mw = eb.matrix_world
        PV = [Mw @ v.co for v in me.vertices]
        bvh = BVHTree.FromPolygons([Mw @ v.co for v in me.vertices], [tuple(pl.vertices) for pl in me.polygons]); eb.to_mesh_clear()
        line = []
        for side in 'rl':
            Hh = bpy.data.objects['RIG'].pose.bones['hand.' + side]
            Hw = Hh.matrix @ Hh.bone.matrix_local.inverted()
            c = np.array(Hw @ Vector(pose.GRIP[side]['c'])); ax = np.array((Hw.to_3x3() @ Vector(pose.GRIP[side]['a'])).normalized())
            n_in = 0; dmin = 1e9; T = []
            for ob in bpy.data.objects:
                if ob.type != 'MESH' or ob.get('rig_side') != side or ob.users_collection[0].name not in ('SKIN', 'UNDER', 'MUS'): continue
                ev = ob.evaluated_get(dg); m2 = ev.to_mesh(); W = ev.matrix_world; is_skin = ob.users_collection[0].name == 'SKIN'
                for vv in m2.vertices:
                    pw = W @ vv.co; loc, nrm_, idx, dist = bvh.find_nearest(pw, 0.04)
                    if loc is None: continue
                    sgn = 1.0 if (pw - loc).dot(nrm_) >= 0 else -1.0; sd_ = sgn * dist
                    if sd_ < 0: n_in += 1
                    dmin = min(dmin, sd_)
                    q = np.array(pw) - c; t = q @ ax; rad = np.linalg.norm(q - t * ax)
                    if rad < 0.03 and is_skin: T.append(t)
                ev.to_mesh_clear()
            total_in += n_in; worst[side] = min(worst[side], dmin)
            line.append('%s inside %d minclear %.1fmm grip-extent t %.1f..%.1f mm' % (side, n_in, dmin * 1000, min(T) * 1000 if T else 0, max(T) * 1000 if T else 0))
        if PROP.startswith('rope'):
            # rope against what RENDERS (visible muscles, skin incl. the head, under-sheets): UNSIGNED distance from the
            # rope centreline, sampled every 5 mm along strands, wraps, stoppers, clip and cable, must be >= that part's
            # radius, and no centreline segment may cross any surface. No normals involved (the sheets have mixed winding).
            # The straight run through each fist is the grip itself (tested above against the rope mesh) and is skipped;
            # near its own fist a strand is not tested against that arm's own hand skin (same reason).
            import bisect, props
            VS, PS, OFF, NAMES, OWN = [], [], [0], [], []
            for ob in bpy.data.objects:
                if ob.type != 'MESH' or not ob.users_collection or ob.users_collection[0].name not in ('MUS', 'SKIN', 'UNDER') or ob.hide_render: continue
                ev = ob.evaluated_get(dg); m2 = ev.to_mesh(); W = ev.matrix_world; b0 = len(VS)
                VS.extend(W @ v.co for v in m2.vertices); PS.extend(tuple(i + b0 for i in pl.vertices) for pl in m2.polygons)
                OFF.append(len(PS)); NAMES.append(ob.name); OWN.append(ob.get('rig_side') if ob.users_collection[0].name in ('SKIN', 'UNDER') else None)
                ev.to_mesh_clear()
            BV = BVHTree.FromPolygons(VS, PS)
            def who(idx): return bisect.bisect_right(OFF, idx) - 1
            GCs = {}
            for sd in 'rl':
                Hh = bpy.data.objects['RIG'].pose.bones['hand.' + sd]; Hw = Hh.matrix @ Hh.bone.matrix_local.inverted()
                GCs[sd] = Vector(Hw @ Vector(pose.GRIP[sd]['c']))
            def resample(P, step=0.005):
                P = np.asarray(P, float); out = [P[0]]
                for i in range(1, len(P)):
                    L_ = np.linalg.norm(P[i] - P[i - 1]); n_ = max(1, int(math.ceil(L_ / step)))
                    out.extend(P[i - 1] + (P[i] - P[i - 1]) * (k / n_) for k in range(1, n_ + 1))
                return np.array(out)
            R_ = props.LAST; parts = []
            for sd, P in R_['paths'].items(): parts.append(('strand.' + sd, sd, resample(P[props.NTHROUGH - 1:]), props.ROPE_R))
            for sd, (kp, rr) in R_['knobs'].items():
                ks = resample(kp, 0.003); kr = np.interp(np.linalg.norm(ks - kp[0], axis=1), np.linalg.norm(kp - kp[0], axis=1), rr)
                parts.append(('stopper.' + sd, sd, ks, kr))
            parts.append(('clip', None, resample(R_['sleeve']), 0.0145)); parts.append(('cable', None, resample(R_['cable']), 0.003))
            worst_c = (1e9, ''); cross = []; head_c = 1e9
            _eh = bpy.data.objects['EggHead'].evaluated_get(dg); _m = _eh.to_mesh(); _W = _eh.matrix_world
            HB = BVHTree.FromPolygons([_W @ v.co for v in _m.vertices], [tuple(pl.vertices) for pl in _m.polygons]); _eh.to_mesh_clear()
            for nm, sd, S_, rad in parts:
                rad = np.broadcast_to(rad, (len(S_),))
                for i, q in enumerate(S_):
                    qv = Vector(q); near_own = sd is not None and (qv - GCs[sd]).length < 0.075
                    hh = HB.find_nearest(qv, 0.3)
                    if hh[0] is not None: head_c = min(head_c, hh[3] - rad[i])
                    loc, nrm_, idx, dist = BV.find_nearest(qv, 0.2)
                    if loc is not None:
                        k_ = who(idx)
                        if near_own and OWN[k_] == sd:   # skip own hand skin near the fist: find the nearest other surface
                            best = None
                            for dd in (0.0, 0.01, 0.02, 0.04):
                                for hit in BV.find_nearest_range(qv, max(dist, 0.001) + dd + rad[i] + 0.002):
                                    if OWN[who(hit[2])] != sd and (best is None or hit[3] < best[3]): best = hit
                                if best is not None: break
                            if best is None: continue
                            loc, nrm_, idx, dist = best; k_ = who(idx)
                        cl = dist - rad[i]
                        if cl < worst_c[0]: worst_c = (cl, '%s vs %s' % (nm, NAMES[k_]))
                    if i:
                        dv = qv - Vector(S_[i - 1]); L_ = dv.length
                        hit = BV.ray_cast(Vector(S_[i - 1]), dv.normalized(), L_)
                        if hit[0] is not None and not (near_own and OWN[who(hit[2])] == sd): cross.append('%s x %s' % (nm, NAMES[who(hit[2])]))
            bad = cross or worst_c[0] < -0.0005
            line.append('rope to head %s' % ('%.0fmm' % (head_c * 1000) if head_c < 1 else '>300mm'))
            # ROPEMONO (judge r3): a taut strand only ever runs toward the clip. Along each strand from the fist exit to the clip
            # the projection onto the clip->pulley direction d must never drop by more than 1 mm. Also the clip's height above
            # the two exits and above the fists (pushdown: the inverted V needs >= 12 cm at lockout, >= 18 cm at the top).
            dd_ = np.asarray(R_['d']); mono = []
            for sd, P in R_['paths'].items():
                pr = np.asarray(P[props.NTHROUGH - 1:]) @ dd_; run = np.maximum.accumulate(pr); back = float(np.max(run - pr))
                mono.append('%s back %.1fmm' % (sd, back * 1000)); MONO_BAD[0] += 1 if back > 0.001 else 0; MONO_BAD[1] = max(MONO_BAD[1], back)
            Cz = float(np.asarray(R_['C'])[2]); Ez = np.mean([np.asarray(P[props.NTHROUGH - 1])[2] for P in R_['paths'].values()])
            Fz = np.mean([float(GCs[sd][2]) for sd in 'rl'])
            # ROPESTRAIGHT (judge r4): past the fist arc the strand is a straight line to the sleeve mouth: the centreline's max
            # distance from the arc-end -> mouth chord, <= 1.5 mm
            st_ = []
            for sd, P in R_['paths'].items():
                ij = props.STRAIGHT.get(sd)
                if not ij: st_.append('%s n/a' % sd); continue
                seg = np.asarray(P[props.NTHROUGH + ij[0]: props.NTHROUGH + ij[1] + 1]); a0, b0 = seg[0], seg[-1]; u_ = (b0 - a0) / max(np.linalg.norm(b0 - a0), 1e-9)
                rel = seg - a0; dev = float(np.max(np.linalg.norm(rel - np.outer(rel @ u_, u_), axis=1)))
                STR_BAD[0] += 1 if dev > 0.0015 else 0; STR_BAD[1] = max(STR_BAD[1], dev); st_.append('%s %.2fmm' % (sd, dev * 1000))
            line.append('ROPESTRAIGHT ' + ', '.join(st_))
            line.append('ROPEMONO %s | clip above exits %.0fmm, above fists %.0fmm' % (', '.join(mono), (Cz - Ez) * 1000, (Cz - Fz) * 1000))
            line.append('rope vs body/head: min clearance %s (%s), crossings %d%s' % ('%.1fmm' % (worst_c[0] * 1000) if worst_c[0] < 0.2 else '>200mm', worst_c[1], len(cross), (' ' + ', '.join(sorted(set(cross))[:4])) if cross else ''))
            total_in += 1 if bad else 0
            # hands against the trunk, legs and head: unsigned gap from hand skin to any surface not on an arm (within 30 mm)
            ARM = [bpy.data.objects[n_].get('rig_side') is not None for n_ in NAMES]
            for sd in 'rl':
                hg = (1e9, '')
                for ob in bpy.data.objects:
                    if ob.type != 'MESH' or ob.get('rig_side') != sd or ob.users_collection[0].name != 'SKIN': continue
                    ev = ob.evaluated_get(dg); m2 = ev.to_mesh(); W = ev.matrix_world
                    for vv in m2.vertices:
                        for hit in BV.find_nearest_range(W @ vv.co, 0.03):
                            k_ = who(hit[2])
                            if not ARM[k_] and hit[3] < hg[0]: hg = (hit[3], NAMES[k_])
                    ev.to_mesh_clear()
                line.append('%s hand-body gap %s' % (sd, '%.0fmm (%s)' % (hg[0] * 1000, hg[1]) if hg[0] < 1 else '>30mm'))
                total_in += 1 if hg[0] < 0.003 else 0
        print('EZGRIP f%d  ' % f + ' | '.join(line))
    print('EZGRIP TOTAL inside %d  worst clearance r %.1fmm l %.1fmm' % (total_in, worst['r'] * 1000, worst['l'] * 1000))
    if PROP.startswith('rope'): print('ROPEMONO TOTAL violations %d (strand-frames), worst back %.1fmm' % (MONO_BAD[0], MONO_BAD[1] * 1000))
    if PROP.startswith('rope'): print('ROPESTRAIGHT TOTAL violations %d (strand-frames), worst %.2fmm' % (STR_BAD[0], STR_BAD[1] * 1000))
    raise SystemExit
if os.environ.get('TRUNKDIAG'):   # judge r17: signed, per-mesh test. Upper-arm muscles vs trunk muscles, and hand skin vs thigh muscles.
    # A point counts as inside only when BOTH the nearest-face normal says so AND a ray-parity count along +x agrees, against
    # ONE closed mesh at a time (the old GAPDIAG merged all trunk layers into one tree, so inner layers' normals gave false hits).
    from mathutils.bvhtree import BVHTree
    def _parity(bv, p):
        n, o, d = 0, Vector(p), Vector((1, 0.0137, 0.0071)).normalized()
        for _ in range(64):
            h = bv.ray_cast(o, d, 5.0)
            if h[0] is None: break
            n += 1; o = h[0] + d * 1e-5
        return n % 2 == 1
    ARM_RE = r'biceps brachii|^Brachialis|triceps brachii|^Deltoid'
    TR_RE = os.environ.get('TRUNK_RE', r'latissimus|serratus anterior|pectoralis major|external oblique')
    LEG_RE = os.environ.get('LEG_RE', r'rectus femoris|vastus|adductor|gracilis|sartorius|tensor fasciae|pectineus')
    HAND_RE = r'^(Palm|Dorsum of hand|Dorsal surfaces of digits|Palmar surfaces of digits)'
    for f in [int(x) for x in os.environ['FRAMES_SUB'].split(',')]:
        set_frame(f, camera=False); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        def _wm(o):
            me = o.evaluated_get(dg).to_mesh(); V = [o.matrix_world @ v.co for v in me.vertices]; F = [tuple(pl.vertices) for pl in me.polygons]; o.evaluated_get(dg).to_mesh_clear(); return V, F
        def _tgts(rx):
            out = []
            for o in bpy.data.objects:
                if o.type == 'MESH' and not o.hide_render and _re.search(rx, o.name, _re.I) and o.users_collection and o.users_collection[0].name in ('MUS', 'SKIN', 'UNDER'):
                    V, F = _wm(o); out.append((o.name, BVHTree.FromPolygons(V, F)))
            return out
        TT, LL = _tgts(TR_RE), _tgts(LEG_RE)
        if f == int(os.environ['FRAMES_SUB'].split(',')[0]): print('TRUNKDIAG trunk', [n for n, _ in TT]); print('TRUNKDIAG legs', [n for n, _ in LL])
        _G = posed(pose2.values(MOT, f)); G_S = {sd: _G['upper.' + sd] @ Vector(pose.JS[sd]['S']) for sd in 'rl'}
        line = []
        for side in 'rl':
            for kind, rx, tg, skip in (('arm', ARM_RE, TT, 0.10), ('hand', HAND_RE, LL, 0.0)):
                n_in, dmin, who, deep = 0, 9.0, '', 0.0; HIST = {}
                for o in bpy.data.objects:
                    if o.type != 'MESH' or o.hide_render or not _re.search(rx, o.name, _re.I): continue
                    if o.get('rig_side') != side and not o.name.endswith('.' + side): continue
                    P, _ = _wm(o)
                    for p in P:
                        if skip and (p - G_S[side]).length < skip: continue
                        for tn, bv in tg:
                            r = bv.find_nearest(p, 0.04)
                            if r[0] is None: continue
                            if r[3] < dmin: dmin, who = r[3], '%s~%s' % (o.name[:18], tn[:22])
                            if (p - r[0]).dot(r[1]) < 0 and _parity(bv, p):
                                n_in += 1; deep = max(deep, r[3]); HIST[int((p - G_S[side]).length * 100)] = HIST.get(int((p - G_S[side]).length * 100), 0) + 1
                line.append('%s %s inside %d deepest %.1fmm min %.1fmm (%s) cm-from-shoulder %s' % (side, kind, n_in, deep * 1000, dmin * 1000, who, sorted(HIST.items())))
        print('TRUNK f%d ' % f + ' | '.join(line))
    raise SystemExit
if os.environ.get('GAPDIAG'):   # arm muscles vs trunk/legs: smallest unsigned gap (mm) per side, and how many arm points sit within 2 mm
    from mathutils.bvhtree import BVHTree
    for f in [int(x) for x in os.environ['FRAMES_SUB'].split(',')]:
        set_frame(f, camera=False); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        def _wm(o):
            me = o.evaluated_get(dg).to_mesh(); V = [o.matrix_world @ v.co for v in me.vertices]; F = [tuple(pl.vertices) for pl in me.polygons]; o.evaluated_get(dg).to_mesh_clear(); return V, F
        V, F = [], []
        for o in bpy.data.objects:
            if o.type == 'MESH' and not o.get('rig_side') and o.users_collection and o.users_collection[0].name == 'MUS' and not o.hide_render and not _re.search(r'deltoid|teres|spinatus|subscapular|coracobrach|trapez|rhomb|levator|pectoralis minor', o.name, _re.I):
                v_, f_ = _wm(o); n0 = len(V); V += v_; F += [tuple(i + n0 for i in q) for q in f_]
        bv = BVHTree.FromPolygons(V, F); line = []
        _G = posed(pose2.values(MOT, f)); G_S = {sd: _G['upper.' + sd] @ Vector(pose.JS[sd]['S']) for sd in 'rl'}
        for side in 'rl':
            dmin, close, who, deep = 9.0, 0, '', 0.0
            for o in bpy.data.objects:
                if o.type != 'MESH' or o.get('rig_side') != side or o.users_collection[0].name != 'MUS': continue
                P, _ = _wm(o); Sx = G_S[side]
                for p in P[::3]:
                    if (p - Sx).length < 0.12: continue
                    r = bv.find_nearest(p, 0.05)
                    if r[0] is not None:
                        if r[3] < dmin: dmin, who = r[3], o.name[:28]
                        if (p - r[0]).dot(r[1]) < 0: close += 1; deep = max(deep, r[3])
            line.append('%s min %.1fmm (%s) inside %d deepest %.1fmm' % (side, dmin * 1000, who, close, deep * 1000))
        print('GAP f%d ' % f + ' | '.join(line))
    raise SystemExit
if os.environ.get('ARMDIAG'):   # forearm muscles pressing into the glowing upper-arm muscles (closed meshes: inside = nearest-face normal test)
    from mathutils.bvhtree import BVHTree
    fr = [int(x) for x in os.environ['FRAMES_SUB'].split(',')]
    for f in fr:
        set_frame(f, camera=False); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); line = []
        for side in os.environ.get('ARMSIDE', 'r'):
            def _wm(o):
                me = o.evaluated_get(dg).to_mesh(); V = [o.matrix_world @ v.co for v in me.vertices]; F = [tuple(pl.vertices) for pl in me.polygons]; o.evaluated_get(dg).to_mesh_clear(); return V, F
            tg = [o for o in bpy.data.objects if o.type == 'MESH' and o.get('rig_side') == side and o.material_slots and o.material_slots[0].material and o.material_slots[0].material.name == 'Glow']
            fa = [o for o in bpy.data.objects if o.type == 'MESH' and o.get('rig_side') == side and o.users_collection[0].name == 'MUS' and o not in tg and _re.search(os.environ.get('ARMOBJ', 'flexor|extensor|Brachioradialis|Pronator|Supinator|palmaris|Anconeus'), o.name, _re.I)]
            for t in tg:
                V, F = _wm(t); bv = BVHTree.FromPolygons(V, F); n_in = 0; deep = 0.0; who = {}
                for o in fa:
                    P, _ = _wm(o)
                    for p in P:
                        r = bv.find_nearest(p, 0.03)
                        if r[0] is not None and (p - r[0]).dot(r[1]) < 0:
                            n_in += 1; d = (p - r[0]).length; deep = max(deep, d); who[o.name] = who.get(o.name, 0) + 1
                line.append('%s %s in %d deep %.1fmm %s' % (side, t.name[:22], n_in, deep * 1000, sorted(who.items(), key=lambda q: -q[1])[:3]))
        print('ARM f%d elbow %.1f ' % (f, pose2.values(MOT, f)['elbow']) + ' | '.join(line))
    raise SystemExit
if os.environ.get('SLIDEDIAG'):   # does each hand stay put on the bar? grip centre and hand roll in the bar's own frame
    fr = [int(x) for x in os.environ['FRAMES_SUB'].split(',')] if os.environ.get('FRAMES_SUB') else range(MOT.FRAMES)
    RB = bpy.data.objects['RIG']
    for f in fr:
        set_frame(f, camera=False); bpy.context.view_layer.update()
        B = bpy.data.objects['EZBar' if PROP == 'ez' else 'Barbell'].matrix_world.copy(); Bi = B.inverted(); line = []
        for side in 'rl':
            pb = RB.pose.bones['hand.' + side]; Hw = RB.matrix_world @ pb.matrix @ pb.bone.matrix_local.inverted()
            cl = Bi @ (Hw @ Vector(pose.GRIP[side]['c'])); zl = Bi.to_3x3() @ (Hw.to_3x3() @ Vector((0, 0, 1)))
            kl = Bi @ (Hw @ Vector(pose.JS[side]['W']))
            line.append('%s x %+.2f y %+.2f z %+.2f mm roll %+.2f deg wristx %+.2f' % (side, cl.x * 1000, cl.y * 1000, cl.z * 1000, math.degrees(math.atan2(zl.z, zl.y)), kl.x * 1000))
        print('SLIDE f%d ' % f + ' | '.join(line) + ' | bar %.4f %.4f %.4f' % tuple(B.translation))
    raise SystemExit
if os.environ.get('GRIPDIAG'):   # numbers instead of pictures: how the hand skin sits on the bar (r = 13.5 mm)
    import re as _re
    for f in [int(x) for x in os.environ.get('FRAMES_SUB', '0,41').split(',')]:
        set_frame(f, camera=False); dg = bpy.context.evaluated_depsgraph_get()
        B = bpy.data.objects['EZBar' if PROP == 'ez' else 'Barbell'].matrix_world; c = np.array(B.translation); ax = np.array(B.to_3x3().col[0]); ax /= np.linalg.norm(ax)
        for side in 'rl':
            if PROP == 'ez':   # this hand's own grip segment: through its grip centre, along the hand's (corrected) grip axis
                Hh = bpy.data.objects['RIG'].pose.bones['hand.' + side].matrix
                Hw = bpy.data.objects['RIG'].matrix_world @ Hh @ bpy.data.objects['RIG'].pose.bones['hand.' + side].bone.matrix_local.inverted()
                c = np.array(Hw @ Vector(pose.GRIP[side]['c'])); ax = np.array((Hw.to_3x3() @ Vector(pose.GRIP[side]['a'])).normalized())
            out = []
            for ob in bpy.data.objects:
                if ob.type != 'MESH' or ob.get('rig_side') != side or ob.users_collection[0].name != 'SKIN': continue
                if not _re.search(os.environ.get('GRIPOBJ', 'Palm|digits|Dorsum'), ob.name): continue
                me = ob.evaluated_get(dg).to_mesh(); P = np.array([ob.matrix_world @ v.co for v in me.vertices]); ob.evaluated_get(dg).to_mesh_clear()
                q = P - c; t = q @ ax; rad = q - t[:, None] * ax; d = np.linalg.norm(rad, axis=1)
                near = d < 0.03
                out.append((ob.name, len(P), int(near.sum()), float(d.min() * 1000), int((d < 0.0130).sum()), float(np.percentile(d[near], 10) * 1000) if near.any() else -1))
            print('GRIP f%d %s' % (f, side), ' | '.join('%s n%d near%d min%.1fmm inside%d p10 %.1f' % o for o in out))
    raise SystemExit
if mode == 'still':
    set_frame(float(a[2]))
    sc.render.filepath = out; bpy.ops.render.render(write_still=True)
else:
    os.makedirs(out, exist_ok=True)
    fr = range(MOT.FRAMES)
    if os.environ.get('FRAMES_SUB'): fr = [int(x) for x in os.environ['FRAMES_SUB'].split(',')]
    for f in fr:   # every frame differs now (body + camera move), so no held-frame copies
        fp = os.path.join(out, f'f{f:03d}.png')
        if os.environ.get('RESUME') and os.path.exists(fp): continue
        set_frame(f); sc.render.filepath = fp; bpy.ops.render.render(write_still=True)
